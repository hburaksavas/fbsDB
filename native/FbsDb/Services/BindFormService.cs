using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace FbsDb.Services;

public sealed record BindFormDefinition(string Name, string Type, string Label, string Description, bool Required, string? DefaultValue);
public sealed record BindFormDocument(int Version, string Path, IReadOnlyList<BindFormDefinition> Definitions);

// Companion bind forms live in <workspace>/.fbsdb/binds, keyed by the SQL file's workspace-relative path.
// Only labels, types, requirements and non-sensitive defaults are stored; execution values never are.
public static class BindFormService
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { WriteIndented = true };
    private static readonly string[] Types = ["VARCHAR2", "NUMBER", "DATE", "TIMESTAMP", "CLOB"];
    private static readonly Regex Sensitive = new("pass(word)?|pwd|secret|token|api[_-]?key|credential", RegexOptions.IgnoreCase | RegexOptions.Compiled);
    private static readonly Regex Identifier = new("^[A-Za-z][A-Za-z0-9_$#]{0,127}$", RegexOptions.Compiled);
    public const int MaxDefinitions = 100, MaxDefault = 1000;

    public static string RelativeKey(string root, string path)
    {
        var fullRoot = Path.GetFullPath(root).TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar) + Path.DirectorySeparatorChar;
        var full = Path.GetFullPath(path);
        if (!full.StartsWith(fullRoot, StringComparison.OrdinalIgnoreCase)) throw new InvalidOperationException("Bind forms can only be stored for files inside the workspace.");
        return Path.GetRelativePath(fullRoot, full).Replace('\\', '/').ToLowerInvariant();
    }

    private static string FileName(string relativeKey) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(relativeKey)))[..32].ToLowerInvariant() + ".json";

    private static string Folder(string root)
    {
        var folder = System.IO.Path.Combine(System.IO.Path.GetFullPath(root), ".fbsdb", "binds");
        for (var path = folder; path is not null; path = System.IO.Path.GetDirectoryName(path))
            if (Path.Exists(path) && File.GetAttributes(path).HasFlag(FileAttributes.ReparsePoint)) throw new InvalidOperationException("Linked bind form folders are not supported.");
        return folder;
    }

    public static IReadOnlyList<BindFormDefinition> Normalize(IEnumerable<BindFormDefinition>? definitions)
    {
        var result = new List<BindFormDefinition>(); var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var item in definitions ?? [])
        {
            if (item is null || !Identifier.IsMatch(item.Name ?? "") || !seen.Add(item.Name!)) throw new InvalidOperationException("Invalid or duplicate bind name.");
            var type = Types.Contains(item.Type) ? item.Type : "VARCHAR2";
            var allowDefault = !Sensitive.IsMatch(item.Name!) && type != "CLOB" && item.DefaultValue is { Length: > 0 and <= MaxDefault };
            result.Add(new(item.Name!.ToUpperInvariant(), type, (item.Label ?? "").Trim()[..Math.Min((item.Label ?? "").Trim().Length, 100)], (item.Description ?? "").Trim()[..Math.Min((item.Description ?? "").Trim().Length, 1000)], item.Required, allowDefault ? item.DefaultValue : null));
        }
        if (result.Count > MaxDefinitions) throw new InvalidOperationException("Too many bind definitions.");
        return result;
    }

    public static async Task<BindFormDocument?> LoadAsync(string root, string path)
    {
        var key = RelativeKey(root, path); var file = System.IO.Path.Combine(Folder(root), FileName(key));
        if (!File.Exists(file) || File.GetAttributes(file).HasFlag(FileAttributes.ReparsePoint) || new FileInfo(file).Length > 512 * 1024) return null;
        try
        {
            var document = JsonSerializer.Deserialize<BindFormDocument>(await File.ReadAllTextAsync(file), Json);
            if (document is null || document.Version != 1 || !string.Equals(document.Path, key, StringComparison.Ordinal)) return null;
            return document with { Definitions = Normalize(document.Definitions) };
        }
        catch (Exception error) when (error is IOException or JsonException or InvalidOperationException) { return null; }
    }

    public static async Task<BindFormDocument?> SaveAsync(string root, string path, IEnumerable<BindFormDefinition> definitions)
    {
        var key = RelativeKey(root, path); var folder = Folder(root); var file = System.IO.Path.Combine(folder, FileName(key));
        var normalized = Normalize(definitions);
        if (normalized.Count == 0) { if (File.Exists(file)) File.Delete(file); return null; }
        Directory.CreateDirectory(folder);
        var document = new BindFormDocument(1, key, normalized); var temp = file + "." + Guid.NewGuid().ToString("N") + ".tmp";
        await File.WriteAllTextAsync(temp, JsonSerializer.Serialize(document, Json), new UTF8Encoding(false));
        File.Move(temp, file, true);
        return document;
    }
}
