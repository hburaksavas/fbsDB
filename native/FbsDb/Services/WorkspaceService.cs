using System.Text.Json;
using System.Text.Json.Nodes;

namespace FbsDb.Services;

public sealed partial class WorkspaceService
{
    public static IReadOnlyList<string> SourceExtensions { get; } = Array.AsReadOnly(new[] { ".sql", ".pks", ".pkb", ".prc", ".fnc", ".trg" });
    public static bool IsSourceFile(string path) => SourceExtensions.Contains(Path.GetExtension(path), StringComparer.OrdinalIgnoreCase);

    // Extensions choose creation templates only; they do not establish database object identity.
    public static string SourceTemplate(string name, string? sourceType = null)
    {
        var identifier = Path.GetFileNameWithoutExtension(name);
        if (!System.Text.RegularExpressions.Regex.IsMatch(identifier, @"^[A-Za-z][A-Za-z0-9_$#]*$"))
            identifier = "\"" + identifier.Replace("\"", "\"\"") + "\"";
        return (sourceType ?? DefaultProjectRules.Associations.FirstOrDefault(item => item.Extension.Equals(Path.GetExtension(name), StringComparison.OrdinalIgnoreCase))?.Type) switch
        {
            "PACKAGE" => $"CREATE OR REPLACE PACKAGE {identifier} AS\n  -- Public declarations\nEND {identifier};\n/\n",
            "PACKAGE BODY" => $"CREATE OR REPLACE PACKAGE BODY {identifier} AS\n  -- Implement the package specification here\nEND {identifier};\n/\n",
            "PROCEDURE" => $"CREATE OR REPLACE PROCEDURE {identifier} AS\nBEGIN\n  NULL;\nEND {identifier};\n/\n",
            "FUNCTION" => $"CREATE OR REPLACE FUNCTION {identifier}\n  RETURN NUMBER\nAS\nBEGIN\n  RETURN NULL;\nEND {identifier};\n/\n",
            "TRIGGER" => $"-- Replace table_name and review timing/event before compiling.\nCREATE OR REPLACE TRIGGER {identifier}\n  BEFORE INSERT ON table_name\n  FOR EACH ROW\nBEGIN\n  NULL;\nEND {identifier};\n/\n",
            _ => ""
        };
    }
    private readonly string _appSettingsPath;
    private string? _root;
    private string[] _recent = [];
    public IReadOnlyList<string> Recent => _recent;

    public WorkspaceService() : this(Environment.GetEnvironmentVariable("FBSDB_WORKSPACE_SETTINGS_PATH") ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "fbsDB", "settings.json")) { }

    public WorkspaceService(string appSettingsPath) => _appSettingsPath = Path.GetFullPath(appSettingsPath);

    public string? Root => _root;

    public async Task RestoreAsync()
    {
        var settings = await NativeSettingsStore.ReadAsync(_appSettingsPath);
        _catalog = settings["workspaceCatalog"]?.Deserialize<List<WorkspaceRegistration>>(CatalogJson) ?? [];
        if (settings["recentWorkspaces"] is JsonArray recent)
            foreach (var item in recent)
                if (item?.GetValue<string>() is { } path && !_catalog.Any(w => SamePath(w.Path, path)))
                    _catalog.Add(new(Guid.NewGuid().ToString("N"), Path.GetFullPath(path), Path.GetFileName(path), "", false, null));
        _root = settings["lastWorkspace"]?.GetValue<string>();
        if (_root is not null && !_catalog.Any(w => SamePath(w.Path, _root)))
            _catalog.Add(new(Guid.NewGuid().ToString("N"), _root, Path.GetFileName(_root), "", false, null));
        if (_root is not null && !Directory.Exists(_root)) _root = null;
        RefreshRecent();
        await LoadProjectRulesAsync();
    }

    public async Task SetRootAsync(string root)
    {
        var selected = Path.TrimEndingDirectorySeparator(Path.GetFullPath(root));
        if (!Directory.Exists(selected)) throw new DirectoryNotFoundException("The workspace folder is unavailable. Locate it or retry.");
        var existing = _catalog.FirstOrDefault(w => SamePath(w.Path, selected));
        var registration = (existing ?? new(Guid.NewGuid().ToString("N"), selected, Path.GetFileName(selected), "", false, null)) with { LastOpened = DateTimeOffset.UtcNow };
        var next = _catalog.Where(w => w.Id != registration.Id).Append(registration).ToList();
        await SaveCatalogAsync(next, selected);
    }

    public Task CloseAsync() => SaveCatalogAsync(_catalog, null);

    // Enumerate only one level. Expanding a folder must not scan the whole workspace.
    public IReadOnlyList<WorkspaceEntry> ListDirectory(string? path = null)
    {
        if (_root is null || !Directory.Exists(_root)) return [];
        var folder = SafePath(path ?? _root, allowRoot: true);
        return Directory.EnumerateFileSystemEntries(folder).Select(item => new FileInfo(item))
            .Where(item => !item.Name.StartsWith('.') && item.Name is not ("bin" or "obj" or "node_modules") && !item.Attributes.HasFlag(FileAttributes.ReparsePoint))
            .Where(item => item.Attributes.HasFlag(FileAttributes.Directory) || IsWorkspaceSourceFile(item.Name))
            .Select(item => new WorkspaceEntry(item.FullName, Path.GetRelativePath(_root, item.FullName).Replace('\\', '/'), item.Name, item.Attributes.HasFlag(FileAttributes.Directory)))
            .OrderByDescending(item => item.IsDirectory).ThenBy(item => item.Name, StringComparer.OrdinalIgnoreCase).ToArray();
    }

    public async Task<WorkspaceEntry> CreateEntryAsync(string parent, string name, bool directory)
    {
        ValidateName(name);
        if (!directory && !IsWorkspaceSourceFile(name)) throw new InvalidOperationException("Use an extension associated in Project rules.");
        var path = SafePath(Path.Combine(SafePath(parent, allowRoot: true), name));
        if (File.Exists(path) || Directory.Exists(path)) throw new IOException("An item with this name already exists.");
        if (directory) Directory.CreateDirectory(path);
        else
        {
            await using var stream = new FileStream(path, FileMode.CreateNew, FileAccess.Write, FileShare.None, 4096, true);
            await using var writer = new StreamWriter(stream, new System.Text.UTF8Encoding(false));
            await writer.WriteAsync(SourceTemplate(name, ProjectRules.Associations.First(item => item.Extension.Equals(Path.GetExtension(name), StringComparison.OrdinalIgnoreCase)).Type));
        }
        return new(path, Path.GetRelativePath(_root!, path).Replace('\\', '/'), name, directory);
    }

    // Creates a new workspace-relative source file with the given text. Missing folders are created; an existing file is never replaced.
    public async Task<WorkspaceEntry> CreateFileWithContentAsync(string relativePath, string content)
    {
        var normalized = (relativePath ?? string.Empty).Replace('\\', '/').Trim();
        if (string.IsNullOrWhiteSpace(normalized) || Path.IsPathRooted(normalized) || normalized.StartsWith('/') || normalized.Split('/').Any(part => part is "" or "." or ".."))
            throw new InvalidOperationException("Use a path relative to the workspace.");
        if ((content?.Length ?? 0) > 200_000) throw new InvalidOperationException("Generated content is too large.");
        var name = Path.GetFileName(normalized);
        ValidateName(name);
        if (!IsWorkspaceSourceFile(name)) throw new InvalidOperationException("Use an extension associated in Project rules.");
        var path = SafePath(Path.Combine(_root!, normalized.Replace('/', Path.DirectorySeparatorChar)));
        if (File.Exists(path) || Directory.Exists(path)) throw new IOException("An item with this name already exists.");
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        await using var stream = new FileStream(path, FileMode.CreateNew, FileAccess.Write, FileShare.None, 4096, true);
        await using var writer = new StreamWriter(stream, new System.Text.UTF8Encoding(false));
        await writer.WriteAsync(content ?? string.Empty);
        return new(path, Path.GetRelativePath(_root!, path).Replace('\\', '/'), name, false);
    }

    public async Task MoveEntryAsync(string path, string destination)
    {
        var source = SafePath(path); var target = SafePath(destination); ValidateName(Path.GetFileName(target));
        if (source.Equals(target, StringComparison.OrdinalIgnoreCase)) throw new InvalidOperationException("Choose a different name or destination.");
        if (target.StartsWith(source + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)) throw new InvalidOperationException("A folder cannot be moved inside itself.");
        if (File.Exists(target) || Directory.Exists(target)) throw new IOException("An item with this name already exists.");
        if (!Directory.Exists(Path.GetDirectoryName(target))) throw new DirectoryNotFoundException("The destination folder no longer exists.");
        var directory = Directory.Exists(source);
        if (!directory && !IsWorkspaceSourceFile(target)) throw new InvalidOperationException("Use a supported Oracle source extension.");
        var configPath = WorkspaceSettingsPath; var gate = NativeSettingsStore.Gate(configPath); await gate.WaitAsync();
        try
        {
            var settings = await NativeSettingsStore.ReadAsync(configPath);
            RemapReferences(settings, [new(source, target)]);
            if (directory) Directory.Move(source, target); else File.Move(source, target);
            try { if (settings.ContainsKey("fileConnections") || settings.ContainsKey("worksets")) await NativeSettingsStore.WriteAsync(configPath, settings); }
            catch { if (directory) Directory.Move(target, source); else File.Move(target, source); throw; }
        }
        finally { gate.Release(); }
    }

    public static string? RemapPath(string? path, string source, string target)
    {
        if (path is null) return null;
        if (path.Equals(source, StringComparison.OrdinalIgnoreCase)) return target;
        return path.StartsWith(source + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase) ? target + path[source.Length..] : null;
    }

    private string SafePath(string path, bool allowRoot = false)
    {
        var full = Path.TrimEndingDirectorySeparator(Path.GetFullPath(path));
        if (!IsUnderRoot(full) || (!allowRoot && full.Equals(_root, StringComparison.OrdinalIgnoreCase))) throw new InvalidOperationException("Choose an item inside the active workspace.");
        for (var current = full; current is not null; current = Path.GetDirectoryName(current))
        {
            if ((File.Exists(current) || Directory.Exists(current)) && File.GetAttributes(current).HasFlag(FileAttributes.ReparsePoint)) throw new InvalidOperationException("Linked folders are not supported in workspace file operations.");
            if (current.Equals(_root, StringComparison.OrdinalIgnoreCase)) break;
        }
        return full;
    }

    private static void ValidateName(string name)
    {
        if (string.IsNullOrWhiteSpace(name) || name is "." or ".." || name.IndexOfAny(Path.GetInvalidFileNameChars()) >= 0 || name.EndsWith('.') || name.EndsWith(' ') || name.StartsWith('.') || name is "bin" or "obj" or "node_modules")
            throw new InvalidOperationException("Enter a valid file or folder name.");
    }

    public IReadOnlyList<WorkspaceSqlFile> ListSqlFiles()
    {
        if (_root is null || !Directory.Exists(_root)) return [];
        var result = new List<WorkspaceSqlFile>();
        try
        {
            foreach (var file in Directory.EnumerateFiles(_root, "*", new EnumerationOptions { RecurseSubdirectories = true, IgnoreInaccessible = true, AttributesToSkip = FileAttributes.ReparsePoint }))
            {
                if (!IsWorkspaceSourceFile(file)) continue;
                var relative = Path.GetRelativePath(_root, file);
                if (relative.Split(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar).Any(part => part.StartsWith('.') || part is "bin" or "obj" or "node_modules")) continue;
                result.Add(new WorkspaceSqlFile(file, relative.Replace(Path.DirectorySeparatorChar, '/'), Path.GetFileName(file)));
            }
        }
        catch (Exception ex) when (ex is UnauthorizedAccessException or IOException) { }
        return result.OrderBy(f => f.RelativePath, StringComparer.OrdinalIgnoreCase).ToArray();
    }

    public WorkspaceSearchResult SearchSqlFiles(string query, int limit = 300, string? scope = null)
    {
        var matches = new List<WorkspaceSearchMatch>();
        if (string.IsNullOrWhiteSpace(query) || _root is null) return new WorkspaceSearchResult(matches, false);
        var files = ScopedSqlFiles(scope);
        const int fileLimit = 5000;
        const long totalByteLimit = 256L * 1024 * 1024;
        var truncated = files.Count > fileLimit;
        long bytesScanned = 0;
        foreach (var file in files.Take(fileLimit))
        {
            try
            {
                var fileLength = new FileInfo(file.Path).Length;
                if (fileLength > 2 * 1024 * 1024) { truncated = true; continue; }
                if (bytesScanned + fileLength > totalByteLimit) { truncated = true; break; }
                bytesScanned += fileLength;
                var lineNumber = 0;
                foreach (var line in File.ReadLines(file.Path))
                {
                    lineNumber++;
                    if (!line.Contains(query, StringComparison.OrdinalIgnoreCase)) continue;
                    if (matches.Count == limit) { truncated = true; break; }
                    matches.Add(new WorkspaceSearchMatch(file.Path, file.RelativePath, lineNumber, line.Trim()));
                }
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException) { truncated = true; }
            if (truncated) break;
        }
        return new WorkspaceSearchResult(matches, truncated);
    }

    public async Task<WorkspaceSources> ReadSourceFilesAsync(string expectedRoot)
    {
        void CheckRoot() { if (!SamePath(_root, expectedRoot)) throw new InvalidOperationException("The workspace changed. Search again."); }
        CheckRoot();
        var files = ListSqlFiles();
        var connections = await GetFileConnectionsAsync();
        var sources = new List<WorkspaceSourceFile>();
        var skipped = new List<string>();
        var truncated = files.Count > 300;
        long bytes = 0;
        foreach (var file in files.Take(300))
        {
            CheckRoot();
            try
            {
                var path = SafePath(file.Path);
                if (new FileInfo(path).Length > 1024 * 1024) { skipped.Add(file.RelativePath + ": exceeds the 1 MB discovery limit."); continue; }
                var snapshot = await WorkspaceFileService.ReadAsync(path);
                if (snapshot.Error is not null || snapshot.Missing) { skipped.Add(file.RelativePath + ": " + (snapshot.Error ?? "file missing")); continue; }
                var contentBytes = System.Text.Encoding.UTF8.GetByteCount(snapshot.Content!);
                if (contentBytes > 1024 * 1024) { skipped.Add(file.RelativePath + ": exceeds the 1 MB discovery content limit."); continue; }
                bytes += contentBytes;
                if (bytes > 8 * 1024 * 1024) { truncated = true; break; }
                sources.Add(new(path, file.Name, snapshot.Content!, connections.GetValueOrDefault(path)));
            }
            catch (Exception error) when (error is IOException or UnauthorizedAccessException or InvalidOperationException) { skipped.Add(file.RelativePath + ": " + error.Message); }
        }
        CheckRoot();
        return new(expectedRoot, sources, skipped, truncated);
    }

    public async Task<string?> GetFileConnectionAsync(string path)
    {
        var connections = await GetFileConnectionsAsync();
        return connections.GetValueOrDefault(Path.GetFullPath(path));
    }

    public async Task<Dictionary<string, string>> GetFileConnectionsAsync()
    {
        var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        if (_root is null) return result;
        var settings = await ReadWorkspaceSettingsAsync();
        if (!settings.TryGetProperty("fileConnections", out var files) || files.ValueKind != JsonValueKind.Object) return result;
        foreach (var item in files.EnumerateObject())
        {
            try
            {
                if (!Path.IsPathRooted(item.Name) || !IsUnderRoot(item.Name) || item.Value.ValueKind != JsonValueKind.String) continue;
                var profile = item.Value.GetString();
                if (profile is not null && profile.Length <= 250 && !profile.Any(char.IsControl)) result[Path.GetFullPath(item.Name)] = profile;
            }
            catch (Exception error) when (error is ArgumentException or NotSupportedException or PathTooLongException) { }
        }
        return result;
    }

    public async Task SetFileConnectionAsync(string path, string profileId)
    {
        if(_root is null||!IsUnderRoot(path))return;
        var configPath=WorkspaceSettingsPath;var gate=NativeSettingsStore.Gate(configPath);await gate.WaitAsync();
        try {
            var settings=await NativeSettingsStore.ReadAsync(configPath);
            var entries=settings["fileConnections"] as JsonObject??new JsonObject();
            entries[Path.GetFullPath(path)]=profileId;settings["fileConnections"]=entries;
            await NativeSettingsStore.WriteAsync(configPath,settings);
        }finally{gate.Release();}
    }

    public bool IsUnderRoot(string path)
    {
        if (_root is null) return false;
        var full = Path.GetFullPath(path);
        var relative = Path.GetRelativePath(_root, full);
        return !Path.IsPathRooted(relative) && relative != ".." && !relative.StartsWith($"..{Path.DirectorySeparatorChar}", StringComparison.Ordinal);
    }

    private string WorkspaceSettingsPath => Path.Combine(_root ?? string.Empty, ".fbsdb", "workspace.json");
    private async Task<JsonElement> ReadWorkspaceSettingsAsync()
    {
        try
        {
            using var document = JsonDocument.Parse(File.Exists(WorkspaceSettingsPath) ? await File.ReadAllTextAsync(WorkspaceSettingsPath) : "{}");
            return document.RootElement.Clone();
        }
        catch (Exception ex) when (ex is IOException or JsonException or UnauthorizedAccessException) { return JsonDocument.Parse("{}").RootElement.Clone(); }
    }
}

public sealed record WorkspaceSqlFile(string Path, string RelativePath, string Name);
public sealed record WorkspaceEntry(string Path, string RelativePath, string Name, bool IsDirectory);
public sealed record WorkspaceSearchMatch(string Path, string RelativePath, int LineNumber, string LineText);
public sealed record WorkspaceSearchResult(IReadOnlyList<WorkspaceSearchMatch> Matches, bool Truncated);
public sealed record WorkspaceSourceFile(string Path, string Name, string Content, string? ConnectionProfileId);
public sealed record WorkspaceSources(string Root, IReadOnlyList<WorkspaceSourceFile> Files, IReadOnlyList<string> Skipped, bool Truncated);
