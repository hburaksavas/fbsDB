using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Microsoft.Win32;

namespace FbsDb.Services;

public sealed record ConnectionProfile(string Id, string Host, string Port, string Service, string Source, string Descriptor, bool Duplicate = false)
{
    public string Method { get; init; } = "tns";
    public string TargetType { get; init; } = "service";
    public string Alias { get; init; } = Id;
    public string Name { get; init; } = Id;
    public string User { get; init; } = "";
    public string Environment { get; init; } = "UNKNOWN";
    public bool Available { get; init; } = true;
    public IReadOnlyDictionary<string,string> Nls {get;init;} = new Dictionary<string,string>();

}

public sealed class TnsProfileService
{
    private readonly string _settingsPath;
    private readonly Func<IEnumerable<string>>? _tnsFiles;
    public TnsProfileService(string? settingsPath = null, Func<IEnumerable<string>>? tnsFiles = null)
    {
        _settingsPath = settingsPath ?? Environment.GetEnvironmentVariable("FBSDB_CONNECTION_SETTINGS_PATH") ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "fbsDB", "settings.json");
        _tnsFiles = tnsFiles;
    }

    public async Task<IReadOnlyDictionary<string, string>> GetConnectionGroupsAsync(CancellationToken cancellationToken = default)
    {
        if (!File.Exists(_settingsPath)) return new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        try
        {
            await using var stream = File.OpenRead(_settingsPath);
            using var settings = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
            if (!settings.RootElement.TryGetProperty("connectionGroups", out var groups) || groups.ValueKind != JsonValueKind.Object)
                return new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            foreach (var item in groups.EnumerateObject())
                if (item.Value.ValueKind == JsonValueKind.String) result[item.Name] = item.Value.GetString()!.Trim();
            return result;
        }
        catch (Exception ex) when (ex is IOException or JsonException or UnauthorizedAccessException)
        {
            return new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        }
    }

    public async Task<JsonObject> GetOrganizationAsync()
    {
        await _settingsGate.WaitAsync();
        try { var settings = await ReadSettingsAsync(); var previous = settings["connectionOrganization"]?.ToJsonString(); var organization = ConnectionOrganization.Ensure(settings); if (previous != organization.ToJsonString()) await WriteSettingsAsync(settings); return (JsonObject)organization.DeepClone(); }
        finally { _settingsGate.Release(); }
    }
    public async Task<JsonObject> ChangeOrganizationAsync(JsonElement payload)
    {
        await _settingsGate.WaitAsync();
        try {
            var settings = await ReadSettingsAsync(); var organization = ConnectionOrganization.Ensure(settings);
            ConnectionOrganization.Apply(organization, payload, (settings["connectionProfiles"] as JsonArray ?? []).OfType<JsonObject>().Select(p => ConnectionOrganization.Read(p, "id")));
            await WriteSettingsAsync(settings); return (JsonObject)organization.DeepClone();
        } finally { _settingsGate.Release(); }
    }
    public async Task SetConnectionGroupAsync(string profileId, string? group)
    {
        await _settingsGate.WaitAsync();
        try {
            var settings = await ReadSettingsAsync();
            var profile = (settings["connectionProfiles"] as JsonArray)?.OfType<JsonObject>().FirstOrDefault(p => ConnectionOrganization.Read(p, "id") == profileId) ?? throw new InvalidOperationException("Connection no longer exists.");
            var organization = ConnectionOrganization.Ensure(settings);
            var name = group?.Trim() ?? (ConnectionOrganization.Read(profile, "environment") switch { "DEV" => "Development", "PROD" => "Production", "TEST" or "UAT" => "Testing", _ => "" });
            var ids = string.IsNullOrWhiteSpace(name) ? Array.Empty<string>() : new[] { ConnectionOrganization.Group(organization, name) };
            var assignment = organization["assignments"]![profileId]!.AsObject();
            ConnectionOrganization.Assign(organization, profileId, ConnectionOrganization.Read(assignment, "folderId"), ids);
            var groups = settings["connectionGroups"] as JsonObject; if (groups is null) settings["connectionGroups"] = groups = new JsonObject();
            if (group is null) groups.Remove(profileId); else groups[profileId] = name;
            await WriteSettingsAsync(settings);
        } finally { _settingsGate.Release(); }
    }

    public async Task<IReadOnlyList<ConnectionProfile>> GetAliasesAsync(CancellationToken cancellationToken = default)
    {
        var files = _tnsFiles?.Invoke() ?? FindTnsFiles();
        var profiles = new List<ConnectionProfile>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var duplicates = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var file in files)
        {
            cancellationToken.ThrowIfCancellationRequested();
            string content;
            try { content = await File.ReadAllTextAsync(file, cancellationToken); }
            catch (IOException) { continue; }
            foreach (var profile in Parse(file, content))
            {
                cancellationToken.ThrowIfCancellationRequested();
                if (!seen.Add(profile.Id)) duplicates.Add(profile.Id);
                profiles.Add(profile);
            }
        }
        return profiles.Select(profile => profile with { Duplicate = duplicates.Contains(profile.Id) }).OrderBy(p => p.Id, StringComparer.OrdinalIgnoreCase).ToArray();
    }

    private SemaphoreSlim _settingsGate=>NativeSettingsStore.Gate(_settingsPath);
    private Task<JsonObject> ReadSettingsAsync()=>NativeSettingsStore.ReadAsync(_settingsPath);
    private Task WriteSettingsAsync(JsonObject settings)=>NativeSettingsStore.WriteAsync(_settingsPath,settings);
    public async Task<IReadOnlyList<ConnectionProfile>> GetProfilesAsync(CancellationToken cancellationToken = default)
    {
        var aliases = await GetAliasesAsync(cancellationToken);
        var aliasesBySource = new Dictionary<string, Dictionary<string, ConnectionProfile>>(StringComparer.OrdinalIgnoreCase);
        foreach (var alias in aliases)
        {
            cancellationToken.ThrowIfCancellationRequested();
            if (!aliasesBySource.TryGetValue(alias.Id, out var sources))
                aliasesBySource[alias.Id] = sources = new(StringComparer.OrdinalIgnoreCase);
            sources.TryAdd(alias.Source, alias); // Keep the first entry, as the previous scan did.
        }
        await _settingsGate.WaitAsync(cancellationToken);
        try
        {
            var settings = await ReadSettingsAsync();
            // Migrate existing alias identities once, preserving credential and workspace bindings.
            if (settings["connectionProfiles"] is not JsonArray)
            {
                settings["connectionProfiles"] = new JsonArray(aliases.DistinctBy(a => a.Id, StringComparer.OrdinalIgnoreCase).Select(a => (JsonNode)new JsonObject { ["id"] = a.Id, ["name"] = a.Id, ["alias"] = a.Id, ["source"] = a.Source, ["user"] = "", ["environment"] = "UNKNOWN" }).ToArray());
                await WriteSettingsAsync(settings);
            }
            return ((JsonArray)settings["connectionProfiles"]!).OfType<JsonObject>().Select(item =>
            {
                cancellationToken.ThrowIfCancellationRequested();
                string Read(string key) => item[key]?.GetValue<string>() ?? "";
                var method = Read("method") is { Length: > 0 } savedMethod ? savedMethod : "tns";
                var target = method == "tns"
                    ? (aliasesBySource.TryGetValue(Read("alias"), out var sources) && sources.TryGetValue(Read("source"), out var found) ? found : new ConnectionProfile(Read("alias"), "", "", "", Read("source"), "") { Available = false })
                    : BuildDirectTarget(method, Read("host"), Read("port"), Read("service"), Read("targetType"), Read("descriptor"));
                return target with { Nls=item["nls"] is JsonObject nls?nls.ToDictionary(entry=>entry.Key,entry=>entry.Value?.GetValue<string>()??""):new Dictionary<string,string>(), Id = Read("id"), Alias = Read("alias"), Name = Read("name"), User = Read("user"), Environment = Read("environment") is { Length: > 0 } env ? env : "UNKNOWN" };
            }).OrderBy(p => p.Name).ToArray();
        }
        finally { _settingsGate.Release(); }
    }
    public async Task<string> SaveProfileAsync(string? id, string name, string alias, string source, string user, string environment, string method = "tns", string host = "", string port = "1521", string service = "", string targetType = "service", string descriptor = "", string? folderId = null, IReadOnlyList<string>? groupIds = null)
    {
        if (string.IsNullOrWhiteSpace(name) || name.Length > 80 || string.IsNullOrWhiteSpace(user) || user.Length > 128) throw new InvalidOperationException("Enter a connection name and Oracle username.");
        if (!new[] { "UNKNOWN", "DEV", "TEST", "UAT", "PROD" }.Contains(environment)) throw new InvalidOperationException("Invalid environment.");
        var target = await ResolveTargetAsync(method, alias, source, host, port, service, targetType, descriptor);
        await GetProfilesAsync();
        await _settingsGate.WaitAsync();
        try
        {
            var settings = await ReadSettingsAsync();
            var profiles = (JsonArray)settings["connectionProfiles"]!;
            if (profiles.OfType<JsonObject>().Any(p => p["id"]?.GetValue<string>() != id && string.Equals(p["name"]?.GetValue<string>(), name.Trim(), StringComparison.OrdinalIgnoreCase))) throw new InvalidOperationException("A connection with this name already exists.");
            var existing = profiles.OfType<JsonObject>().FirstOrDefault(p => p["id"]?.GetValue<string>() == id);
            if (id is not null && existing is null) throw new InvalidOperationException("Connection no longer exists.");
            id ??= Guid.NewGuid().ToString("N");
            var entry = new JsonObject { ["id"] = id, ["name"] = name.Trim(), ["alias"] = alias, ["source"] = source, ["user"] = user.Trim(), ["environment"] = environment, ["method"] = method, ["host"] = target.Host, ["port"] = target.Port, ["service"] = target.Service, ["targetType"] = target.TargetType, ["descriptor"] = method == "descriptor" ? target.Descriptor : "" };
            if(existing?["nls"] is JsonNode nls)entry["nls"]=nls.DeepClone();
            if (method != "tns") { entry["alias"] = ""; entry["source"] = ""; }
            var organization = ConnectionOrganization.Ensure(settings);
            if (existing is null) profiles.Add(entry); else profiles[profiles.IndexOf(existing)] = entry;
            if (groupIds is not null) ConnectionOrganization.Assign(organization, id, folderId, groupIds);
            else ConnectionOrganization.Ensure(settings);
            await WriteSettingsAsync(settings);
            return id;
        }
        finally { _settingsGate.Release(); }
    }
    public async Task<ConnectionProfile> ResolveTargetAsync(string method, string alias, string source, string host, string port, string service, string targetType, string descriptor)
    {
        if (method != "tns") return BuildDirectTarget(method, host, port, service, targetType, descriptor);
        return (await GetAliasesAsync()).FirstOrDefault(a => a.Id.Equals(alias, StringComparison.OrdinalIgnoreCase) && a.Source.Equals(source, StringComparison.OrdinalIgnoreCase))
            ?? throw new InvalidOperationException("Alias source is unavailable. Refresh TNS sources.");
    }
    private static ConnectionProfile BuildDirectTarget(string method, string host, string port, string service, string targetType, string descriptor)
    {
        if (method == "basic")
        {
            host = host.Trim(); service = service.Trim();
            if (string.IsNullOrEmpty(host) || !Regex.IsMatch(host, @"^[a-zA-Z0-9_.:\[\]%-]+$")) throw new InvalidOperationException("Enter a valid hostname or IP address.");
            if (!int.TryParse(port, out var number) || number < 1 || number > 65535) throw new InvalidOperationException("Port must be between 1 and 65535.");
            if (string.IsNullOrEmpty(service) || !Regex.IsMatch(service, @"^[a-zA-Z0-9_.$#-]+$")) throw new InvalidOperationException("Enter a valid service name or SID.");
            if (targetType is not ("service" or "sid")) throw new InvalidOperationException("Choose Service name or SID.");
            descriptor = $"(DESCRIPTION=(ADDRESS=(PROTOCOL=TCP)(HOST={host})(PORT={number}))(CONNECT_DATA=({(targetType == "sid" ? "SID" : "SERVICE_NAME")}={service})))";
            return new ConnectionProfile("", host, number.ToString(), service, "", descriptor) { Method = method, Alias = "", TargetType = targetType };
        }
        if (method != "descriptor") throw new InvalidOperationException("Unsupported connection method.");
        descriptor = descriptor.Trim();
        if (descriptor.Length > 32768 || !Regex.IsMatch(descriptor, @"^\(\s*DESCRIPTION(?:_LIST)?\s*=", RegexOptions.IgnoreCase)) throw new InvalidOperationException("Enter a full (DESCRIPTION=...) or (DESCRIPTION_LIST=...) descriptor, not a connection string.");
        var depth = 0; char quote = '\0';
        for (var i = 0; i < descriptor.Length; i++)
        {
            var c = descriptor[i];
            if (quote != '\0') { if (c == quote) { if (i + 1 < descriptor.Length && descriptor[i + 1] == quote) i++; else quote = '\0'; } continue; }
            if (c is '\'' or '"') { quote = c; continue; }
            if (c == '(') depth++;
            if (c == ')' && --depth == 0 && descriptor[(i + 1)..].Trim().Length > 0) throw new InvalidOperationException("Descriptor must contain one complete root expression.");
            if (depth < 0) throw new InvalidOperationException("Descriptor parentheses are unbalanced.");
        }
        if (quote != '\0' || depth != 0) throw new InvalidOperationException("Descriptor quotes or parentheses are unbalanced.");
        if (Regex.IsMatch(descriptor, @"\b(?:PASSWORD|PWD|USER\s*ID)\s*=", RegexOptions.IgnoreCase)) throw new InvalidOperationException("Enter credentials in the username and password fields, not the descriptor.");
        return new ConnectionProfile("", Capture(descriptor, "HOST") ?? "Custom descriptor", Capture(descriptor, "PORT") ?? "", Capture(descriptor, "SERVICE_NAME") ?? Capture(descriptor, "SID") ?? "", "", descriptor) { Method = method, Alias = "" };
    }

    public async Task SetNlsAsync(string id,IReadOnlyDictionary<string,string> overrides)
    {
        await _settingsGate.WaitAsync();
        try {
            var settings=await ReadSettingsAsync();
            var profile=(settings["connectionProfiles"] as JsonArray)?.OfType<JsonObject>().FirstOrDefault(item=>item["id"]?.GetValue<string>()==id)??throw new InvalidOperationException("Connection profile no longer exists.");
            profile["nls"]=JsonSerializer.SerializeToNode(overrides);await WriteSettingsAsync(settings);
        }finally{_settingsGate.Release();}
    }
    public async Task DeleteProfileAsync(string id)
    {
        await _settingsGate.WaitAsync();
        try
        {
            var settings = await ReadSettingsAsync();
            if (settings["connectionProfiles"] is JsonArray profiles)
            {
                var entry = profiles.OfType<JsonObject>().FirstOrDefault(p => p["id"]?.GetValue<string>() == id);
                if (entry is not null) profiles.Remove(entry);
                (settings["connectionOrganization"]?["assignments"] as JsonObject)?.Remove(id);
                if (settings["connectionGroups"] is JsonObject groups) groups.Remove(id);
                await WriteSettingsAsync(settings);
            }
        }
        finally { _settingsGate.Release(); }
    }

    public async Task AddTnsFileAsync(string filePath)
    {
        await _settingsGate.WaitAsync();
        try
        {

        var fullPath = Path.GetFullPath(filePath);
        if (!string.Equals(Path.GetFileName(fullPath), "tnsnames.ora", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Select a tnsnames.ora file.");
        var directory = Path.GetDirectoryName(fullPath)!;
        Directory.CreateDirectory(Path.GetDirectoryName(_settingsPath)!);
        var settings = await ReadSettingsAsync();
        var paths = settings["tnsPaths"] as JsonArray;
        if (paths is null) settings["tnsPaths"] = paths = [];
        if (!paths.Any(item => string.Equals(item?.GetValue<string>(), directory, StringComparison.OrdinalIgnoreCase))) paths.Add(directory);
        await WriteSettingsAsync(settings);
    
        }
        finally { _settingsGate.Release(); }
    }

    private IEnumerable<string> FindTnsFiles()
    {
        var paths = new List<string>();
        AddDirectory(Environment.GetEnvironmentVariable("TNS_ADMIN"));
        AddDirectory(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Oracle", "network", "admin"));
        AddDirectory(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Oracle", "network", "admin"));
        AddDirectory(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "Oracle", "network", "admin"));
        var oracleHome = Environment.GetEnvironmentVariable("ORACLE_HOME");
        if (!string.IsNullOrWhiteSpace(oracleHome)) AddDirectory(Path.Combine(oracleHome, "network", "admin"));
        try
        {
            using var key = Registry.LocalMachine.OpenSubKey(@"SOFTWARE\ORACLE");
            foreach (var name in key?.GetSubKeyNames() ?? [])
            {
                using var home = key?.OpenSubKey(name);
                if (home?.GetValue("ORACLE_HOME") is string value) AddDirectory(Path.Combine(value, "network", "admin"));
            }
        }
        catch (UnauthorizedAccessException) { }

        try
        {
            if (File.Exists(_settingsPath))
            {
                using var settings = JsonDocument.Parse(File.ReadAllText(_settingsPath));
                if (settings.RootElement.TryGetProperty("tnsPaths", out var configured) && configured.ValueKind == JsonValueKind.Array)
                    foreach (var item in configured.EnumerateArray()) if (item.GetString() is { } path) AddDirectory(Path.GetFullPath(Environment.ExpandEnvironmentVariables(path)));
            }
        }
        catch (Exception ex) when (ex is IOException or JsonException or UnauthorizedAccessException) { }
        return paths;

        void AddDirectory(string? directory)
        {
            if (string.IsNullOrWhiteSpace(directory)) return;
            var file = Path.Combine(Environment.ExpandEnvironmentVariables(directory), "tnsnames.ora");
            if (File.Exists(file) && !paths.Contains(file, StringComparer.OrdinalIgnoreCase)) paths.Add(file);
        }
    }

    private static IEnumerable<ConnectionProfile> Parse(string source, string text)
    {
        // Split at top-level aliases while tolerating comments and DESCRIPTION blocks on multiple lines.
        var matches = Regex.Matches(text, @"(?im)^([A-Za-z0-9_.\-$#]+(?:[ \t]*,[ \t]*[A-Za-z0-9_.\-$#]+)*)[ \t]*=\s*(?=\()", RegexOptions.CultureInvariant);
        for (var i = 0; i < matches.Count; i++)
        {
            var match = matches[i];
            var start = match.Index + match.Length;
            var end = i + 1 < matches.Count ? matches[i + 1].Index : text.Length;
            var descriptor = StripComments(text[start..end]);
            var host = Capture(descriptor, "HOST");
            var port = Capture(descriptor, "PORT") ?? "1521";
            var service = Capture(descriptor, "SERVICE_NAME") ?? Capture(descriptor, "SID") ?? string.Empty;
            if (!string.IsNullOrWhiteSpace(host) && !string.IsNullOrWhiteSpace(service))
                foreach (var alias in match.Groups[1].Value.Split(',').Select(value => value.Trim()))
                    yield return new ConnectionProfile(alias, host, port, service, source, descriptor.Trim());
        }
    }

    private static string StripComments(string text) => Regex.Replace(text, @"(?m)#.*$", string.Empty);
    private static string? Capture(string text, string key)
    {
        var match = Regex.Match(text, $@"(?is)\b{Regex.Escape(key)}\s*=\s*([^\s)]+)");
        return match.Success ? match.Groups[1].Value.Trim('"', '\'') : null;
    }
}
