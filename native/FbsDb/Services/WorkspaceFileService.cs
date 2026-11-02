using System.Security.Cryptography;
using System.Text;

namespace FbsDb.Services;

public sealed record WorkspaceFileSnapshot(string Path, string Version, string? Content, bool Missing = false, string? Error = null, bool Conflict = false);

public static class WorkspaceFileService
{
    public const int MaxBytes = 8 * 1024 * 1024;
    private static string Version(byte[] bytes) => Convert.ToHexString(SHA256.HashData(bytes));
    private static string Decode(byte[] bytes) { using var reader = new StreamReader(new MemoryStream(bytes), Encoding.UTF8, true); return reader.ReadToEnd(); }

    public static async Task<WorkspaceFileSnapshot> ReadAsync(string path)
    {
        path = System.IO.Path.GetFullPath(path);
        try
        {
            await using var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete, 4096, true);
            if (stream.Length > MaxBytes) return new(path, "unavailable", null, Error: "SQL file exceeds the 8 MB editor limit.");
            using var memory = new MemoryStream(); var buffer = new byte[81920]; int count;
            while ((count = await stream.ReadAsync(buffer.AsMemory(0, (int)Math.Min(buffer.Length, MaxBytes + 1 - memory.Length)))) > 0)
            {
                await memory.WriteAsync(buffer.AsMemory(0, count));
                if (memory.Length > MaxBytes) return new(path, "unavailable", null, Error: "SQL file exceeds the 8 MB editor limit.");
            }
            var bytes = memory.ToArray();
            return new(path, Version(bytes), Decode(bytes));
        }
        catch (Exception error) when (error is FileNotFoundException or DirectoryNotFoundException) { return new(path, "missing", null, true); }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException) { return new(path, "unavailable", null, Error: error.Message); }
    }

    // Receives the replaced content of an existing file (local history); failures there never affect the save.
    public static Action<string, byte[]>? PreviousVersionCaptured;

    // Keep the version check and write under the same exclusive handle.
    public static async Task<WorkspaceFileSnapshot> SaveAsync(string path, string content, string? expectedVersion)
    {
        var bytes = new UTF8Encoding(false).GetBytes(content);
        if (bytes.Length > MaxBytes) throw new IOException("SQL file exceeds the 8 MB editor limit.");
        FileStream stream;
        try { stream = new FileStream(path, expectedVersion is null ? FileMode.OpenOrCreate : FileMode.Open, FileAccess.ReadWrite, FileShare.None, 4096, true); }
        catch (Exception error) when (error is FileNotFoundException or DirectoryNotFoundException) { return new(path, "missing", null, true, Conflict: true); }
        await using var handle = stream;
        if (stream.Length > MaxBytes) throw new IOException("SQL file exceeds the 8 MB editor limit.");
        using var memory = new MemoryStream(); await stream.CopyToAsync(memory); var previous = memory.ToArray();
        if (expectedVersion is not null && Version(previous) != expectedVersion)
            return new(path, Version(previous), Decode(previous), Conflict: true);
        stream.Position = 0; await stream.WriteAsync(bytes); stream.SetLength(bytes.Length); await stream.FlushAsync();
        if (expectedVersion is not null && !previous.AsSpan().SequenceEqual(bytes)) { try { PreviousVersionCaptured?.Invoke(path, previous); } catch (Exception) { } }
        return new(path, Version(bytes), content);
    }
}
