using System.Globalization;
using System.Text;

namespace FbsDb.Services;

/// <summary>
/// Local error log: unhandled exceptions of the desktop host and errors reported by the web interface.
/// One file per day under %LOCALAPPDATA%\fbsDB\logs. Nothing is sent anywhere. Executed SQL, bind values and
/// credentials are never passed to this class. Writing never throws: a failing log must not become a second failure.
/// </summary>
public static class DiagnosticLog
{
    public const int MaxFileBytes = 2 * 1024 * 1024;
    public const int MaxFiles = 10;
    public const int MaxMessageChars = 4000;
    public const int MaxDetailChars = 16000;

    private static readonly object Gate = new();
    private static readonly HashSet<string> Pruned = new(StringComparer.OrdinalIgnoreCase);

    public static string Directory => Environment.GetEnvironmentVariable("FBSDB_LOG_PATH")
        ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "fbsDB", "logs");

    public static void Error(string source, string? message, string? detail = null, string? directory = null) => Write("ERROR", source, message, detail, directory);
    public static void Info(string source, string? message, string? directory = null) => Write("INFO", source, message, null, directory);

    public static void Exception(string source, Exception? error, string? note = null, string? directory = null)
    {
        var message = error is null ? note ?? "Unknown error" : $"{error.GetType().FullName}: {error.Message}" + (note is null ? "" : $" ({note})");
        Write("ERROR", source, message, error?.ToString(), directory);
    }

    public static void Write(string level, string source, string? message, string? detail = null, string? directory = null, DateTimeOffset? now = null)
    {
        try
        {
            var folder = directory ?? Directory;
            var time = now ?? DateTimeOffset.Now;
            var path = Path.Combine(folder, $"fbsdb-{time:yyyyMMdd}.log");
            var entry = new StringBuilder();
            entry.Append(time.ToString("yyyy-MM-dd'T'HH:mm:ss.fffzzz", CultureInfo.InvariantCulture)).Append(' ').Append(Clean(level, 8)).Append(" [").Append(Clean(source, 64)).Append("] ");
            entry.Append(Clean(message, MaxMessageChars)).Append(Environment.NewLine);
            if (!string.IsNullOrWhiteSpace(detail))
                foreach (var line in Limit(detail, MaxDetailChars).Split('\n'))
                {
                    var text = Clean(line, MaxDetailChars);
                    if (text.Length > 0) entry.Append("    ").Append(text).Append(Environment.NewLine);
                }
            lock (Gate)
            {
                System.IO.Directory.CreateDirectory(folder);
                if (Pruned.Add(folder)) Prune(folder);
                // A runaway error loop must not fill the disk: a full file takes no more entries that day.
                if (File.Exists(path) && new FileInfo(path).Length >= MaxFileBytes) return;
                File.AppendAllText(path, entry.ToString(), Encoding.UTF8);
            }
        }
        catch { }
    }

    private static void Prune(string folder)
    {
        var files = System.IO.Directory.GetFiles(folder, "fbsdb-*.log").OrderByDescending(Path.GetFileName, StringComparer.OrdinalIgnoreCase).Skip(MaxFiles - 1);
        foreach (var file in files) { try { File.Delete(file); } catch { } }
    }

    private static string Limit(string text, int max) => text.Length <= max ? text : text[..max] + "…";

    // One entry is one line: control characters, including line breaks, become spaces.
    private static string Clean(string? text, int max)
    {
        if (string.IsNullOrEmpty(text)) return "";
        var limited = Limit(text, max);
        var builder = new StringBuilder(limited.Length);
        foreach (var character in limited) builder.Append(char.IsControl(character) ? ' ' : character);
        return builder.ToString().Trim();
    }
}
