using System.Text.Json;
using System.Text.RegularExpressions;
using Oracle.ManagedDataAccess.Client;

namespace FbsDb.Services;

public sealed record GridDmlBatchResult(IReadOnlyList<Dictionary<string, object?>> Outcomes, string? Recovery, bool StoppedByUser, string? Error);

// Applies staged grid edits one statement at a time in the tab's session, after a savepoint. It stops at the first failure or unexpected
// row count; by default it then rolls back to the savepoint (earlier unrelated session work is untouched). It never commits and refuses to
// run while auto commit is on, because a half-applied batch could not be taken back.
public static class GridDmlBatch
{
    public const string Savepoint = "fbsdb_grid_batch";
    private const string RowSavepoint = "fbsdb_grid_row";
    private const string RowIdBind = "fbsdb_rowid";
    private static readonly Regex Target = new(@"^\s*(?:UPDATE\s+|INSERT\s+INTO\s+)((?:""[^""]+""\.)?""[^""]+"")", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
    private static readonly Regex QuotedColumn = new(@"^""[^""]+""$", RegexOptions.CultureInvariant);

    // Runs the statement asking for its row, and without asking when Oracle cannot answer: a view, several matching rows or a missing SELECT grant.
    // With several rows the server has already applied the change when the client reports the error, so the session returns to its own savepoint before running it again.
    private static async Task<(SqlExecutionResult Result, string? RowId)> ExecuteAskingRowIdAsync(OracleSessionService oracle, string sql, List<SqlBindParameter> parameters, int timeoutSeconds)
    {
        await Task.Run(() => oracle.ExecuteAsync("SAVEPOINT " + RowSavepoint, null, 1, default, timeoutSeconds: timeoutSeconds));
        try
        {
            var result = await Task.Run(() => oracle.ExecuteAsync(sql + " RETURNING ROWID INTO :" + RowIdBind, [.. parameters, new SqlBindParameter(RowIdBind, "VARCHAR2", null, "OUT")], 1, default, timeoutSeconds: timeoutSeconds));
            return (result, Convert.ToString(result.OutParameters.FirstOrDefault(item => item.Name == RowIdBind)?.Value));
        }
        catch (OracleException error) when (error.Number is 22816 or 1422 or 24369 or 1031 or 41900 or 942)
        {
            await Task.Run(() => oracle.ExecuteAsync("ROLLBACK TO SAVEPOINT " + RowSavepoint, null, 1, default, timeoutSeconds: timeoutSeconds));
            return (await Task.Run(() => oracle.ExecuteAsync(sql, parameters, 1, default, timeoutSeconds: timeoutSeconds)), null);
        }
    }

    // Reads the changed row in the same transaction. The statement has already applied: anything going wrong here is reported as a failed read, never as a failed change.
    private static async Task ReadBackAsync(OracleSessionService oracle, string table, string[] columns, string? rowId, Dictionary<string, object?> outcome, int timeoutSeconds)
    {
        if (columns.Length > 1000 || columns.Any(column => !QuotedColumn.IsMatch(column))) { outcome["readbackError"] = "The column list to read is not one the grid generates."; return; }
        if (string.IsNullOrEmpty(rowId)) { outcome["readbackError"] = "Oracle did not say which row changed, for example because this is a view or SELECT is not granted."; return; }
        try
        {
            var read = await Task.Run(() => oracle.ExecuteAsync($"SELECT {string.Join(", ", columns)} FROM {table} WHERE ROWID = :{RowIdBind}", [new SqlBindParameter(RowIdBind, "VARCHAR2", rowId)], 1, default, timeoutSeconds: timeoutSeconds));
            if (read.ResultId is { } id) await oracle.CloseResultAsync(id);
            if (read.Rows.Count == 0) outcome["readbackError"] = "The changed row is not visible to this session."; else outcome["readback"] = read.Rows[0];
        }
        catch (Exception error) { outcome["readbackError"] = error.Message; }
    }

    public static async Task<GridDmlBatchResult> RunAsync(OracleSessionService oracle, IReadOnlyList<JsonElement> items, int timeoutSeconds, bool keepOnFailure, CancellationToken stop)
    {
        static GridDmlBatchResult Refuse(string message) => new([], null, false, message);
        if (oracle.AutoCommit) return Refuse("Turn auto commit off before applying grid edits, so the whole batch can be committed or rolled back together.");
        if (items.Count > GridDmlGuard.MaxStatements) return Refuse($"At most {GridDmlGuard.MaxStatements} statements can be applied at once.");
        var outcomes = new List<Dictionary<string, object?>>();
        var stopped = false;
        var stoppedByUser = false;
        var earlierWork = oracle.HasPendingTransaction;
        try
        {
            await oracle.EnsureTransactionAsync();
            await Task.Run(() => oracle.ExecuteAsync("SAVEPOINT " + Savepoint, null, 1, default, timeoutSeconds: timeoutSeconds));
        }
        catch (Exception ex) { return Refuse("The batch could not start: " + ex.Message); }
        for (var index = 0; index < items.Count; index++)
        {
            if (stopped) { outcomes.Add(new() { ["index"] = index, ["status"] = "skipped" }); continue; }
            if (stop.IsCancellationRequested) { stoppedByUser = true; stopped = true; outcomes.Add(new() { ["index"] = index, ["status"] = "skipped" }); continue; }
            try
            {
                var item = items[index];
                var sql = item.GetProperty("sql").GetString() ?? string.Empty;
                GridDmlGuard.Assert(sql);
                var parameters = new List<SqlBindParameter>();
                if (item.TryGetProperty("binds", out var binds) && binds.ValueKind == JsonValueKind.Array)
                {
                    foreach (var bind in binds.EnumerateArray())
                    {
                        var name = bind.TryGetProperty("name", out var nameValue) ? nameValue.GetString() : null;
                        var type = bind.TryGetProperty("type", out var typeValue) ? typeValue.GetString() : null;
                        var value = bind.TryGetProperty("value", out var valueValue) && valueValue.ValueKind == JsonValueKind.String ? valueValue.GetString() : null;
                        if (!string.IsNullOrWhiteSpace(name) && !string.IsNullOrWhiteSpace(type)) parameters.Add(new SqlBindParameter(name, type, value));
                    }
                }
                var expected = item.TryGetProperty("expectRows", out var expectValue) && expectValue.TryGetInt32(out var expectedRows) ? expectedRows : 1;
                var target = Target.Match(sql);
                var readColumns = target.Success && item.TryGetProperty("readColumns", out var requested) && requested.ValueKind == JsonValueKind.Array ? requested.EnumerateArray().Select(column => column.GetString() ?? "").ToArray() : [];
                var asksRow = readColumns.Length > 0;
                var (result, rowId) = asksRow ? await ExecuteAskingRowIdAsync(oracle, sql, parameters, timeoutSeconds) : (await Task.Run(() => oracle.ExecuteAsync(sql, parameters, 1, default, timeoutSeconds: timeoutSeconds)), null);
                var affected = result.RowsAffected ?? 0;
                if (affected != expected) { outcomes.Add(new() { ["index"] = index, ["status"] = "mismatch", ["rowsAffected"] = affected, ["expected"] = expected }); stopped = true; }
                else
                {
                    var outcome = new Dictionary<string, object?> { ["index"] = index, ["status"] = "applied", ["rowsAffected"] = affected };
                    outcomes.Add(outcome);
                    if (asksRow) await ReadBackAsync(oracle, target.Groups[1].Value, readColumns, rowId, outcome, timeoutSeconds);
                }
            }
            catch (Exception ex) { outcomes.Add(new() { ["index"] = index, ["status"] = "failed", ["error"] = ex.Message }); stopped = true; }
        }
        string? recovery = null;
        if (stoppedByUser)
        {
            recovery = $"Stopped by you: {outcomes.Count(o => (string?)o["status"] == "applied")} statement(s) were applied and are in your open transaction (Commit or Rollback decides them); the rest were not sent and remain drafts. Nothing was committed or retried.";
        }
        else if (stopped && !keepOnFailure)
        {
            try
            {
                await Task.Run(() => oracle.ExecuteAsync("ROLLBACK TO SAVEPOINT " + Savepoint, null, 1, default, timeoutSeconds: timeoutSeconds));
                foreach (var outcome in outcomes.Where(o => (string?)o["status"] == "applied")) outcome["status"] = "rolledBack";
                recovery = "The batch was rolled back to its starting point; other work in this session was not touched.";
            }
            catch (Exception ex) { recovery = "The batch could not be rolled back automatically (" + ex.Message + "). Use Rollback to discard the session's pending work."; }
        }
        // A batch that started the transaction and left nothing in it closes it again, so nothing looks pending.
        if (!earlierWork && !outcomes.Any(o => (string?)o["status"] == "applied"))
        {
            try { await Task.Run(() => oracle.RollbackAsync()); }
            catch (Exception ex) { recovery = (recovery is null ? "" : recovery + " ") + "The empty transaction could not be closed (" + ex.Message + ")."; }
        }
        return new(outcomes, recovery, stoppedByUser, null);
    }
}
