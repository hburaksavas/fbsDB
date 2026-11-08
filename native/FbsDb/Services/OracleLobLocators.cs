using Oracle.ManagedDataAccess.Client;
using Oracle.ManagedDataAccess.Types;

namespace FbsDb.Services;

// A large CLOB/BLOB value sent as a preview. LobId is null when the locator could not be kept.
public sealed record LobCell(string LobType, string? LobId, long Length, string Preview)
{
    public string Kind => "lob";
}

// Length and Offset count characters for CLOB/NCLOB and bytes for BLOB. Text or Base64 holds the chunk read.
public sealed record LobChunk(string LobId, string LobType, long Offset, long Length, int Count, string? Text, string? Base64)
{
    public bool Complete => Offset + Count >= Length;
}

// Keeps the locators of large values per result. Measured against Oracle: a locator read without FOR UPDATE keeps
// returning the value as of the query after the reader closes, after commit or rollback, and after another session
// changes or deletes the row; it fails once the connection closes. Callers serialize access with the session gate.
public sealed class OracleLobLocators
{
    public const int InlineCharacters = 16_384, PreviewCharacters = 2_000, InlineBytes = 16_384, PreviewBytes = 512, MaxLocators = 5_000;
    public const int MaxChunkCharacters = 524_288, MaxChunkBytes = 1_048_576;
    private sealed record Entry(string ResultId, string LobType, OracleClob? Clob, OracleBlob? Blob);
    private readonly Dictionary<string, Entry> _entries = new();

    public int Count => _entries.Count;

    public object Cell(string resultId, string columnType, OracleDataReader reader, int ordinal)
    {
        if (columnType == "Blob")
        {
            var blob = reader.GetOracleBlob(ordinal);
            if (blob.Length <= InlineBytes) { using (blob) { var bytes = blob.Value; return new { kind = "binary", base64 = Convert.ToBase64String(bytes), byteLength = bytes.Length }; } }
            var preview = ReadBytes(blob, 0, PreviewBytes);
            return new LobCell("BLOB", Keep(resultId, "BLOB", null, blob), blob.Length, Convert.ToBase64String(preview));
        }
        var clob = reader.GetOracleClob(ordinal);
        var characters = clob.Length / 2;
        if (characters <= InlineCharacters) { using (clob) return clob.Value; }
        var type = columnType == "NClob" ? "NCLOB" : "CLOB";
        return new LobCell(type, Keep(resultId, type, clob, null), characters, ReadCharacters(clob, 0, PreviewCharacters));
    }

    private string? Keep(string resultId, string type, OracleClob? clob, OracleBlob? blob)
    {
        if (_entries.Count >= MaxLocators) { clob?.Dispose(); blob?.Dispose(); return null; }
        var id = Guid.NewGuid().ToString("N");
        _entries[id] = new Entry(resultId, type, clob, blob);
        return id;
    }

    // limitChunk caps one read at MaxChunkCharacters or MaxChunkBytes.
    public LobChunk Read(string lobId, long offset, int count, bool limitChunk = false)
    {
        if (!_entries.TryGetValue(lobId, out var entry)) throw Unavailable(null);
        if (offset < 0) throw new ArgumentOutOfRangeException(nameof(offset));
        if (limitChunk) count = Math.Min(count, entry.Blob is null ? MaxChunkCharacters : MaxChunkBytes);
        try
        {
            if (entry.Blob is { } blob)
            {
                var length = blob.Length;
                var bytes = ReadBytes(blob, Math.Min(offset, length), (int)Math.Min(Math.Max(count, 0), Math.Max(0, length - offset)));
                return new LobChunk(lobId, entry.LobType, offset, length, bytes.Length, null, Convert.ToBase64String(bytes));
            }
            var clob = entry.Clob!;
            var characters = clob.Length / 2;
            var text = ReadCharacters(clob, Math.Min(offset, characters), (int)Math.Min(Math.Max(count, 0), Math.Max(0, characters - offset)));
            return new LobChunk(lobId, entry.LobType, offset, characters, text.Length, text, null);
        }
        catch (Exception error) when (error is OracleException or InvalidOperationException or ObjectDisposedException)
        {
            Release(lobId, entry);
            throw Unavailable(error);
        }
    }

    private static InvalidOperationException Unavailable(Exception? error) => error is OracleException { Number: 1555 or 22924 }
        ? new InvalidOperationException("Oracle no longer keeps the version of this value that the query read. Run the query again to read it.", error)
        : new InvalidOperationException("This large value can no longer be read. Run the query again to read it.", error);

    private static string ReadCharacters(OracleClob clob, long offset, int count)
    {
        if (count <= 0) return "";
        var buffer = new char[count];
        clob.Seek(offset * 2, SeekOrigin.Begin);
        var filled = 0;
        while (filled < count) { var read = clob.Read(buffer, filled, count - filled); if (read <= 0) break; filled += read; }
        return new string(buffer, 0, filled);
    }

    private static byte[] ReadBytes(OracleBlob blob, long offset, int count)
    {
        if (count <= 0) return [];
        var buffer = new byte[count];
        blob.Seek(offset, SeekOrigin.Begin);
        var filled = 0;
        while (filled < count) { var read = blob.Read(buffer, filled, count - filled); if (read <= 0) break; filled += read; }
        return filled == count ? buffer : buffer[..filled];
    }

    private void Release(string lobId, Entry entry)
    {
        _entries.Remove(lobId);
        try { entry.Clob?.Dispose(); entry.Blob?.Dispose(); } catch (Exception error) when (error is OracleException or InvalidOperationException) { }
    }

    public void Release(string resultId)
    {
        foreach (var (id, entry) in _entries.Where(item => item.Value.ResultId == resultId).ToArray()) Release(id, entry);
    }

    public void ReleaseAll()
    {
        foreach (var (id, entry) in _entries.ToArray()) Release(id, entry);
    }
}
