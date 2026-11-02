using System.Diagnostics;
using System.Text.RegularExpressions;

namespace FbsDb.Services;

// Opens a console tool (SQLcl, SQL*Plus or a plain shell) in the project directory. The tool owns its session and transaction;
// no password, token or wallet secret is ever placed in the command line or environment.
public static class ExternalTerminalService
{
    public sealed record Plan(string FileName, string Arguments, string WorkingDirectory, string? TnsAdmin, string? Error);

    private static readonly Regex Safe = new(@"^[A-Za-z0-9_.$#:/\-]{1,128}$", RegexOptions.Compiled);
    private static readonly string[] Extensions = [".exe", ".bat", ".cmd", ".com"];

    public static string? FindOnPath(string name, string? pathVariable = null)
    {
        foreach (var directory in (pathVariable ?? Environment.GetEnvironmentVariable("PATH") ?? string.Empty).Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries))
        {
            foreach (var extension in Extensions)
            {
                try { var candidate = Path.Combine(directory.Trim('"'), name + extension); if (File.Exists(candidate)) return candidate; } catch (ArgumentException) { }
            }
        }
        return null;
    }

    public static Plan Build(string tool, string? userName, string? identifier, string? directory, string? tnsSource, Func<string, string?> find)
    {
        if (string.IsNullOrWhiteSpace(directory) || !Directory.Exists(directory)) return new("", "", "", null, "Open a workspace folder first; the terminal starts in the project directory.");
        if (userName is { Length: > 0 } && !Safe.IsMatch(userName)) return new("", "", "", null, "The user name contains characters that cannot be passed to a terminal safely.");
        if (identifier is { Length: > 0 } && !Safe.IsMatch(identifier)) return new("", "", "", null, "The connection name contains characters that cannot be passed to a terminal safely.");
        var tnsAdmin = !string.IsNullOrWhiteSpace(tnsSource) && File.Exists(tnsSource) ? Path.GetDirectoryName(tnsSource) : null;
        var connect = !string.IsNullOrEmpty(userName) && !string.IsNullOrEmpty(identifier) ? $"{userName}@{identifier}" : null;
        switch (tool)
        {
            case "sqlcl":
                if (find("sql") is null) return new("", "", "", null, "SQLcl (sql) was not found on PATH. Install it or add it to PATH.");
                return new("cmd.exe", "/d /k sql " + (connect ?? "/nolog"), directory, tnsAdmin, null);
            case "sqlplus":
                if (find("sqlplus") is null) return new("", "", "", null, "SQL*Plus (sqlplus) was not found on PATH.");
                return new("cmd.exe", "/d /k sqlplus " + (connect ?? "/nolog"), directory, tnsAdmin, null);
            case "shell":
                return new("cmd.exe", "/d /k", directory, tnsAdmin, null);
            default:
                return new("", "", "", null, "Unknown terminal tool.");
        }
    }

    public static void Start(Plan plan)
    {
        var info = new ProcessStartInfo(plan.FileName, plan.Arguments) { UseShellExecute = false, WorkingDirectory = plan.WorkingDirectory, CreateNoWindow = false };
        if (plan.TnsAdmin is not null) info.Environment["TNS_ADMIN"] = plan.TnsAdmin;
        Process.Start(info);
    }
}
