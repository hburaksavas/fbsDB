using System.Text.Json;

namespace FbsDb.Services;

public sealed record GridDmlBatchResult(IReadOnlyList<Dictionary<string, object?>> Outcomes, string? Recovery, bool StoppedByUser, string? Error);

// Applies staged grid edits one statement at a time in the tab's session, after a savepoint. It stops at the first failure or unexpected
// row count; by default it then rolls back to the savepoint (earlier unrelated session work is untouched). It never commits and refuses to
// run while auto commit is on, because a half-applied batch could not be taken back.
public static class GridDmlBatch
{
    public const string Savepoint = "fbsdb_grid_batch";

    public static async Task<GridDmlBatchResult> RunAsync(OracleSessionService oracle, IReadOnlyList<JsonElement> items, int timeoutSeconds, bool keepOnFailure, CancellationToken stop)
    {
        static GridDmlBatchResult Refuse(string message) => new([], null, false, message);
        if (oracle.AutoCommit) return Refuse("Turn auto commit off before applying grid edits, so the whole batch can be committed or rolled back together.");
        if (items.Count > GridDmlGuard.MaxStatements) return Refuse($"At most {GridDmlGuard.MaxStatements} statements can be applied at once.");
        var outcomes = new List<Dictionary<string, object?>>();
        var stopped = false;
        var stoppedByUser = false;
        try { await Task.Run(() => oracle.ExecuteAsync("SAVEPOINT " + Savepoint, null, 1, default, timeoutSeconds: timeoutSeconds)); }
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
                var result = await Task.Run(() => oracle.ExecuteAsync(sql, parameters, 1, default, timeoutSeconds: timeoutSeconds));
                var affected = result.RowsAffected ?? 0;
                if (affected != expected) { outcomes.Add(new() { ["index"] = index, ["status"] = "mismatch", ["rowsAffected"] = affected, ["expected"] = expected }); stopped = true; }
                else outcomes.Add(new() { ["index"] = index, ["status"] = "applied", ["rowsAffected"] = affected });
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
        return new(outcomes, recovery, stoppedByUser, null);
    }
}
