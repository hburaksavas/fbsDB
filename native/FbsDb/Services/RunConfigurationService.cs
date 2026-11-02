using System.Collections.Concurrent;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace FbsDb.Services;

public sealed record RoutineRunParameter(string Name, string OracleType, string BindType, string Mode, bool Optional = false, bool UseDefault = false, bool Sensitive = false);
public sealed record RoutineRunConfiguration(int Version, string Id, string Name, string Owner, string PackageName, string RoutineName, string Kind, string ReturnBindType, IReadOnlyList<RoutineRunParameter> Parameters, int Revision = 0);
public sealed record RoutineRunCatalog(IReadOnlyList<RoutineRunConfiguration> Configurations, IReadOnlyList<string> Errors);

public static class RunConfigurationService
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { WriteIndented = true };
    private static readonly ConcurrentDictionary<string, SemaphoreSlim> Gates = new(StringComparer.OrdinalIgnoreCase);
    private static readonly string[] InputTypes = ["NUMBER", "VARCHAR2", "NVARCHAR2", "DATE", "TIMESTAMP", "CLOB"];
    private static readonly string[] OutputTypes = ["NUMBER", "VARCHAR2", "NVARCHAR2", "DATE", "TIMESTAMP"];
    private static bool Identifier(string? value, bool optional = false) => optional && value == "" || !string.IsNullOrWhiteSpace(value) && Encoding.UTF8.GetByteCount(value) <= 128 && !value.Any(char.IsControl);
    private static string Quote(string name) => "\"" + name.Replace("\"", "\"\"") + "\"";

    public static RoutineRunConfiguration Normalize(JsonElement document)
    {
        var value = document.Deserialize<RoutineRunConfiguration>(Json) ?? throw new InvalidOperationException("Invalid run configuration.");
        if (value.Version != 1 || value.Revision < 0 || string.IsNullOrWhiteSpace(value.Name) || value.Name.Length > 100 || !Identifier(value.Owner, true) || !Identifier(value.PackageName, true) || !Identifier(value.RoutineName) || value.Kind is not ("PROCEDURE" or "FUNCTION") || value.Parameters is null || value.Parameters.Count > 100)
            throw new InvalidOperationException("Invalid run configuration identity or version.");
        if (value.Kind == "FUNCTION" && !OutputTypes.Contains(value.ReturnBindType)) throw new InvalidOperationException("Unsupported function return bind type.");
        if (value.Parameters.Any(item => item is null || !Identifier(item.Name) || string.IsNullOrWhiteSpace(item.OracleType) || item.OracleType.Length > 256 || item.Mode is not ("IN" or "OUT" or "IN OUT") || !(item.Mode == "IN" ? InputTypes : OutputTypes).Contains(item.BindType) || item.UseDefault && (!item.Optional || item.Mode != "IN")) || value.Parameters.Select(item => item.Name).Distinct(StringComparer.Ordinal).Count() != value.Parameters.Count)
            throw new InvalidOperationException("Invalid parameter type, mode or default omission.");
        return value with { Id = value.Id ?? "", Name = value.Name.Trim(), ReturnBindType = value.Kind == "FUNCTION" ? value.ReturnBindType : "", Parameters = value.Parameters.ToArray() };
    }

    public static string BuildSql(RoutineRunConfiguration configuration)
    {
        var target = string.Join('.', new[] { configuration.Owner, configuration.PackageName, configuration.RoutineName }.Where(value => value.Length > 0).Select(Quote));
        var arguments = configuration.Parameters.Select((parameter, index) => (parameter, index)).Where(item => !item.parameter.UseDefault).Select(item => Quote(item.parameter.Name) + " => :arg_" + item.index);
        return "BEGIN\n  " + (configuration.Kind == "FUNCTION" ? ":run_result := " : "") + target + "(" + string.Join(", ", arguments) + ");\nEND;";
    }

    private static string Folder(string root)
    {
        var folder = Path.Combine(Path.GetFullPath(root), ".fbsdb", "runs");
        for (var path = folder; path is not null; path = Path.GetDirectoryName(path))
            if (Path.Exists(path) && File.GetAttributes(path).HasFlag(FileAttributes.ReparsePoint)) throw new InvalidOperationException("Linked run configuration folders are not supported.");
        return folder;
    }

    public static async Task<RoutineRunCatalog> ListAsync(string root)
    {
        var folder = Folder(root); var configurations = new List<RoutineRunConfiguration>(); var errors = new List<string>();
        if (Directory.Exists(folder)) foreach (var file in Directory.EnumerateFiles(folder, "*.json").Take(500))
        {
            try
            {
                if (!Regex.IsMatch(Path.GetFileNameWithoutExtension(file), "^[a-f0-9]{32}$") || File.GetAttributes(file).HasFlag(FileAttributes.ReparsePoint) || new FileInfo(file).Length > 1_000_000) throw new InvalidOperationException("Invalid, linked or oversized configuration file.");
                using var document = JsonDocument.Parse(await File.ReadAllTextAsync(file));
                configurations.Add(Normalize(document.RootElement) with { Id = Path.GetFileNameWithoutExtension(file) });
            }
            catch (Exception error) when (error is IOException or JsonException or InvalidOperationException or UnauthorizedAccessException) { errors.Add(Path.GetFileName(file) + ": " + error.Message); }
        }
        return new(configurations.OrderBy(value => value.Name, StringComparer.OrdinalIgnoreCase).ToArray(), errors);
    }

    public static async Task<RoutineRunConfiguration> SaveAsync(string root, JsonElement document)
    {
        var gate = Gates.GetOrAdd(Path.GetFullPath(root), _ => new SemaphoreSlim(1, 1)); await gate.WaitAsync();
        try
        {
            var configuration = Normalize(document);
            if (configuration.Id.Length > 0 && !Regex.IsMatch(configuration.Id, "^[a-f0-9]{32}$")) throw new InvalidOperationException("Invalid run configuration ID.");
            var id = configuration.Id.Length == 0 ? Guid.NewGuid().ToString("N") : configuration.Id;
            var folder = Folder(root); Directory.CreateDirectory(folder);
            var path = Path.Combine(folder, id + ".json");
            var revision = 0;
            if (File.Exists(path))
            {
                if (File.GetAttributes(path).HasFlag(FileAttributes.ReparsePoint) || new FileInfo(path).Length > 1_000_000) throw new InvalidOperationException("Linked or oversized configuration file.");
                using var previous = JsonDocument.Parse(await File.ReadAllTextAsync(path)); revision = Normalize(previous.RootElement).Revision;
            }
            if (configuration.Revision != revision) throw new InvalidOperationException("The run configuration changed on disk. Reopen it before saving.");
            configuration = configuration with { Id = id, Revision = checked(revision + 1) };
            var temporary = Path.Combine(folder, Guid.NewGuid().ToString("N") + ".tmp");
            try { await File.WriteAllTextAsync(temporary, JsonSerializer.Serialize(configuration, Json)); File.Move(temporary, path, true); }
            finally { if (File.Exists(temporary)) File.Delete(temporary); }
            return configuration;
        }
        finally { gate.Release(); }
    }
}
