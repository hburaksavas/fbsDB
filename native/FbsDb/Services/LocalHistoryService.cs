using System.Security.Cryptography;
using System.Text;

namespace FbsDb.Services;

public sealed record LocalHistoryEntry(string Id, DateTimeOffset SavedAt, long Bytes);

// Private per-user snapshots of the previous disk content of saved files, independent of Git and never stored in the workspace.
public static class LocalHistoryService
{
    public const int MaxSnapshotBytes = 2 * 1024 * 1024, MaxEntries = 50;
    public const long MaxBytesPerFile = 20L * 1024 * 1024;
    private static readonly object Gate = new();

    public static string Root => Environment.GetEnvironmentVariable("FBSDB_HISTORY_PATH") ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "fbsDB", "history");

    private static string FileFolder(string path, string? root = null)
        => Path.Combine(root ?? Root, Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(Path.GetFullPath(path).ToLowerInvariant())))[..32].ToLowerInvariant());

    private static IEnumerable<string> Snapshots(string folder)
        => Directory.Exists(folder) ? Directory.EnumerateFiles(folder, "*.snap").OrderByDescending(file => file, StringComparer.Ordinal) : [];

    // Called with the content that is about to be replaced. History problems must never block a save.
    public static void Capture(string path, byte[] previous, string? root = null)
    {
        if (previous.Length == 0 || previous.Length > MaxSnapshotBytes) return;
        try
        {
            lock (Gate)
            {
                var folder = FileFolder(path, root); Directory.CreateDirectory(folder);
                var latest = Snapshots(folder).FirstOrDefault();
                if (latest is not null && new FileInfo(latest).Length == previous.Length && File.ReadAllBytes(latest).AsSpan().SequenceEqual(previous)) return;
                File.WriteAllText(Path.Combine(folder, "path.txt"), Path.GetFullPath(path));
                var id = DateTimeOffset.UtcNow.ToString("yyyyMMddHHmmssfff");
                var target = Path.Combine(folder, id + ".snap");
                for (var suffix = 1; File.Exists(target); suffix++) target = Path.Combine(folder, id + "-" + suffix + ".snap");
                File.WriteAllBytes(target, previous);
                long total = 0; var kept = 0;
                foreach (var snapshot in Snapshots(folder).ToArray())
                {
                    total += new FileInfo(snapshot).Length;
                    if (++kept > MaxEntries || total > MaxBytesPerFile) File.Delete(snapshot);
                }
            }
        }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException) { }
    }

    public static IReadOnlyList<LocalHistoryEntry> List(string path, string? root = null)
        => Snapshots(FileFolder(path, root)).Select(file => new LocalHistoryEntry(Path.GetFileNameWithoutExtension(file), new FileInfo(file).LastWriteTimeUtc, new FileInfo(file).Length)).ToArray();

    public static string? Read(string path, string id, string? root = null)
    {
        if (id.Length == 0 || id.Any(ch => !(char.IsAsciiDigit(ch) || ch == '-'))) throw new InvalidOperationException("Invalid history version.");
        var file = Path.Combine(FileFolder(path, root), id + ".snap");
        return File.Exists(file) ? new UTF8Encoding(false, false).GetString(File.ReadAllBytes(file)) : null;
    }

    public static void Clear(string path, string? root = null)
    {
        lock (Gate) { var folder = FileFolder(path, root); if (Directory.Exists(folder)) Directory.Delete(folder, true); }
    }
}
