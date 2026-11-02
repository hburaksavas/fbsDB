using System.Security.Cryptography;
using System.Text;
using Oracle.ManagedDataAccess.Client;

namespace FbsDb.Services;

public sealed record OracleSourceSnapshot(string Owner, string Name, string Type, string Source, bool Exists, string Version, string Context, string? ProfileId);
public sealed record OracleSourceReview(string ReviewId, OracleSourceSnapshot Snapshot, string Sql, DateTimeOffset ReviewedAt);
public sealed class OracleSourceChangedException(OracleSourceSnapshot current) : InvalidOperationException("The database source changed after review. Compare again before compiling.")
{
    public OracleSourceSnapshot Current { get; } = current;
}

public sealed partial class OracleSessionService
{
    private sealed record PendingSourceReview(string SqlHash, string Version, DateTimeOffset ReviewedAt, OracleConnection Connection);
    private readonly Dictionary<string, PendingSourceReview> _sourceReviews = new();
    private static string SourceHash(string value) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value)));

    private async Task<OracleSourceSnapshot> ReadSourceSnapshotUnderGateAsync(string sql, CancellationToken token)
    {
        var target = OracleSqlUnit.CompilationTarget(sql) ?? throw new InvalidOperationException("A single CREATE source declaration is required.");
        await using var contextCommand = _connection!.CreateCommand();
        contextCommand.CommandTimeout = 5; contextCommand.Transaction = _transaction;
        contextCommand.CommandText = "SELECT SYS_CONTEXT('USERENV','CURRENT_SCHEMA'), SYS_CONTEXT('USERENV','SESSION_USER'), SYS_CONTEXT('USERENV','CON_NAME'), SYS_CONTEXT('USERENV','CURRENT_EDITION_NAME') FROM dual";
        string owner, user, context;
        await using (var reader = await contextCommand.ExecuteReaderAsync(token))
        {
            if (!await reader.ReadAsync(token)) throw new InvalidOperationException("Oracle context is unavailable.");
            owner = target.Owner ?? reader.GetString(0); user = reader.GetString(1);
            context = reader.GetString(2) + "/" + (reader.IsDBNull(3) ? "" : reader.GetString(3));
        }
        string? objectVersion = null;
        await using (var command = CompletionCommand("SELECT object_id,TO_CHAR(last_ddl_time,'YYYY-MM-DD HH24:MI:SS'),status FROM all_objects WHERE owner=:owner AND object_name=:name AND object_type=:sourceType", owner, target.Name))
        {
            command.Parameters.Add("sourceType", OracleDbType.Varchar2).Value = target.Type;
            await using var reader = await command.ExecuteReaderAsync(token);
            if (await reader.ReadAsync(token)) objectVersion = Convert.ToString(reader.GetValue(0), System.Globalization.CultureInfo.InvariantCulture) + ":" + reader.GetString(1) + ":" + reader.GetString(2);
        }
        if (objectVersion is null && owner != user) throw new InvalidOperationException("The target is absent or inaccessible in this schema. Its source cannot be reviewed safely.");
        var text = new StringBuilder();
        if (objectVersion is not null)
        {
            await using var command = CompletionCommand("SELECT text FROM all_source WHERE owner=:owner AND name=:name AND type=:sourceType ORDER BY line", owner, target.Name);
            command.Parameters.Add("sourceType", OracleDbType.Varchar2).Value = target.Type;
            await using var reader = await command.ExecuteReaderAsync(token);
            while (await reader.ReadAsync(token))
            {
                text.Append(reader.GetString(0));
                if (text.Length > 4 * 1024 * 1024) throw new InvalidOperationException("The database source exceeds the review limit.");
            }
            if (text.Length == 0) throw new InvalidOperationException("The object exists, but its source is unavailable. Compilation review is blocked.");
        }
        var source = text.ToString();
        var identity = System.Text.Json.JsonSerializer.Serialize(new[] { owner, target.Name, target.Type, context, objectVersion, source });
        return new(owner, target.Name, target.Type, source, objectVersion is not null, SourceHash(identity), context, ProfileId);
    }

    public async Task<OracleSourceReview> ReviewSourceAsync(string sql, CancellationToken token = default)
    {
        if (sql.Length > 4 * 1024 * 1024 || !System.Text.RegularExpressions.Regex.IsMatch(sql.TrimStart(), @"^(?:--[^\r\n]*(?:\r?\n|$)|/\*[\s\S]*?\*/|\s)*CREATE\s+(?:OR\s+REPLACE\s+)?", System.Text.RegularExpressions.RegexOptions.IgnoreCase) || OracleSqlUnit.CompilationTarget(sql) is null)
            throw new InvalidOperationException("Review requires one CREATE source declaration within the 4 MB review limit.");
        await _gate.WaitAsync(token);
        try
        {
            if (!IsConnected) throw new InvalidOperationException("Connect this source tab before comparing with the database.");
            var snapshot = await ReadSourceSnapshotUnderGateAsync(sql, token);
            var review = new OracleSourceReview(Guid.NewGuid().ToString("N"), snapshot, sql, DateTimeOffset.UtcNow);
            foreach (var key in _sourceReviews.Where(item => item.Value.ReviewedAt < DateTimeOffset.UtcNow.AddMinutes(-10)).Select(item => item.Key).ToArray()) _sourceReviews.Remove(key);
            while (_sourceReviews.Count >= 16) _sourceReviews.Remove(_sourceReviews.Keys.First());
            _sourceReviews.Add(review.ReviewId, new(SourceHash(sql), snapshot.Version, review.ReviewedAt, _connection!));
            return review;
        }
        finally { Touch(); _gate.Release(); }
    }

    private async Task ValidateSourceReviewUnderGateAsync(string sql, string reviewId, CancellationToken token)
    {
        if (!_sourceReviews.Remove(reviewId, out var pending) || pending.Connection != _connection || pending.ReviewedAt < DateTimeOffset.UtcNow.AddMinutes(-10) || pending.SqlHash != SourceHash(sql))
            throw new InvalidOperationException("Source review expired or the source/session changed. Compare again before compiling.");
        var current = await ReadSourceSnapshotUnderGateAsync(sql, token);
        if (current.Version != pending.Version) throw new OracleSourceChangedException(current);
    }
}
