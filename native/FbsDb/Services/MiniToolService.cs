using System.Text.Json;
using System.Text.RegularExpressions;

namespace FbsDb.Services;

public sealed record MiniToolField(string Name, string Label, string Type, bool Required, string Description);
public sealed record MiniToolColumn(int Index, string Name, bool Visible);
public sealed record MiniTool(int Version, string Id, string Name, string Sql, MiniToolField[] Fields, MiniToolColumn[] Columns);

public static class MiniToolService
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { WriteIndented = true };

    public static void AssertSelect(string sql)
    {
        // Strip literals/comments before classification, including Oracle q quoting.
        var words = new List<string>();
        var depth = 0; var topSelect = false; var ended = false;
        for (var i = 0; i < sql.Length;)
        {
            if (char.IsWhiteSpace(sql[i])) { i++; continue; }
            if (sql.AsSpan(i).StartsWith("--")) { var end = sql.IndexOf('\n', i); i = end < 0 ? sql.Length : end + 1; continue; }
            if (sql.AsSpan(i).StartsWith("/*")) { var end = sql.IndexOf("*/", i + 2, StringComparison.Ordinal); if (end < 0) throw InvalidSelect(); i = end + 2; continue; }
            if (ended) throw InvalidSelect();
            var qLength = (sql[i] is 'q' or 'Q') && i + 1 < sql.Length && sql[i + 1] == '\'' ? 2
                : (sql[i] is 'n' or 'N') && i + 2 < sql.Length && (sql[i + 1] is 'q' or 'Q') && sql[i + 2] == '\'' ? 3 : 0;
            if (qLength != 0)
            {
                var at = i + qLength; if (at >= sql.Length) throw InvalidSelect();
                var close = sql[at] switch { '[' => ']', '{' => '}', '(' => ')', '<' => '>', var c => c };
                var end = sql.IndexOf(close + "'", at + 1, StringComparison.Ordinal); if (end < 0) throw InvalidSelect(); i = end + 2; continue;
            }
            if (sql[i] is '\'' or '"')
            {
                var quote = sql[i++]; var closed = false;
                while (i < sql.Length) { if (sql[i++] != quote) continue; if (i < sql.Length && sql[i] == quote) { i++; continue; } closed = true; break; }
                if (!closed) throw InvalidSelect(); continue;
            }
            if (char.IsLetter(sql[i]) || sql[i] is '_' or '$' or '#')
            {
                var start = i++;
                while (i < sql.Length && (char.IsLetterOrDigit(sql[i]) || sql[i] is '_' or '$' or '#')) i++;
                var word = sql[start..i].ToUpperInvariant(); words.Add(word);
                if (depth == 0 && word == "SELECT") topSelect = true;
                if (word is "INSERT" or "UPDATE" or "DELETE" or "MERGE" or "BEGIN" or "DECLARE" or "FUNCTION" or "PROCEDURE" or "INTO") throw InvalidSelect();
                continue;
            }
            if (sql[i] == ';') ended = true;
            if (sql[i] == '(') depth++;
            if (sql[i] == ')' && --depth < 0) throw InvalidSelect();
            i++;
        }
        if (words.Count == 0 || words[0] is not ("SELECT" or "WITH") || !topSelect || depth != 0) throw InvalidSelect();
    }

    private static InvalidOperationException InvalidSelect() => new("Mini tools support one SELECT query only. SELECT functions can still have side effects.");

    public static MiniTool Normalize(JsonElement document)
    {
        var tool = document.Deserialize<MiniTool>(Json) ?? throw new InvalidOperationException("Invalid mini tool file.");
        if (tool.Version != 1) throw new InvalidOperationException("Unsupported mini tool format.");
        if (string.IsNullOrWhiteSpace(tool.Name) || tool.Name.Length > 100 || tool.Sql is null || tool.Sql.Length > 1_000_000) throw new InvalidOperationException("Invalid tool name or SQL.");
        AssertSelect(tool.Sql);
        if ((tool.Fields ?? []).Any(f => f is null || string.IsNullOrWhiteSpace(f.Name)) || (tool.Columns ?? []).Any(c => c is null)) throw new InvalidOperationException("Invalid tool fields or columns.");
        var fields = (tool.Fields ?? []).Select(f => new MiniToolField(
            f.Name, (f.Label ?? f.Name)[..Math.Min((f.Label ?? f.Name).Length, 100)],
            f.Type is "VARCHAR2" or "NUMBER" or "DATE" or "TIMESTAMP" or "CLOB" ? f.Type : "VARCHAR2", f.Required,
            (f.Description ?? "")[..Math.Min((f.Description ?? "").Length, 1000)])).ToArray();
        if (fields.Length > 1000 || fields.Any(f => string.IsNullOrWhiteSpace(f.Name) || f.Name.Length > 256)) throw new InvalidOperationException("Invalid bind fields.");
        var columns = (tool.Columns ?? []).Select((c, i) => new MiniToolColumn(i, c.Name ?? "", c.Visible)).ToArray();
        if (columns.Length > 1000 || columns.Any(c => c.Name.Length > 256)) throw new InvalidOperationException("Invalid result columns.");
        return new(1, tool.Id ?? "", tool.Name.Trim(), tool.Sql, fields, columns);
    }

    private static string Folder(string root)
    {
        var folder = Path.Combine(Path.GetFullPath(root), ".fbsdb", "tools");
        for (var path = folder; path is not null; path = Path.GetDirectoryName(path))
        {
            if (Path.Exists(path) && File.GetAttributes(path).HasFlag(FileAttributes.ReparsePoint)) throw new InvalidOperationException("Linked tool folders are not supported.");
        }
        return folder;
    }

    public static async Task<object> ListAsync(string root)
    {
        var folder = Folder(root); var tools = new List<MiniTool>(); var errors = new List<string>();
        if (Directory.Exists(folder)) foreach (var file in Directory.EnumerateFiles(folder, "*.json").Take(500))
        {
            try
            {
                if (File.GetAttributes(file).HasFlag(FileAttributes.ReparsePoint) || new FileInfo(file).Length > 2_000_000) throw new InvalidOperationException("Linked or oversized tool file.");
                using var doc = JsonDocument.Parse(await File.ReadAllTextAsync(file));
                tools.Add(Normalize(doc.RootElement) with { Id = Path.GetFileNameWithoutExtension(file) });
            }
            catch (Exception ex) when (ex is JsonException or IOException or InvalidOperationException or UnauthorizedAccessException) { errors.Add($"{Path.GetFileName(file)}: {ex.Message}"); }
        }
        return new { tools, errors };
    }

    public static async Task<MiniTool> SaveAsync(string root, JsonElement document)
    {
        var tool = Normalize(document);
        var id = Regex.IsMatch(tool.Id, "^[a-f0-9]{32}$") ? tool.Id : Guid.NewGuid().ToString("N");
        tool = tool with { Id = id };
        var folder = Folder(root); Directory.CreateDirectory(folder);
        var path = Path.Combine(folder, id + ".json");
        if (File.Exists(path) && File.GetAttributes(path).HasFlag(FileAttributes.ReparsePoint)) throw new InvalidOperationException("Linked tool files are not supported.");
        var temporary = Path.Combine(folder, Guid.NewGuid().ToString("N") + ".tmp");
        try { await File.WriteAllTextAsync(temporary, JsonSerializer.Serialize(tool, Json)); File.Move(temporary, path, true); }
        finally { if (File.Exists(temporary)) File.Delete(temporary); }
        return tool;
    }
}
