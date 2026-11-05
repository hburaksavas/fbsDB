using System.Diagnostics;
using System.Text.Json;
using System.Text.Json.Serialization;
using FbsDb.Bridge;
using FbsDb.Services;

// User-written pre-commit checks against real Oracle. Queries are prepared and judged by the grid's own code (commit-check.mjs) and run the
// way the host's sql.evaluate does. A check must see the session's pending work and must never disturb it, whatever the check does.
sealed class CommitCheckChecks(OracleSessionService a, OracleSessionService b, string user, Func<string, Func<Task>, Task> check, Action<bool, string> require, List<string> tables, List<string> routines)
{
    private static readonly JsonSerializerOptions Wire = new(NativeBridgeContract.JsonOptions) { DefaultIgnoreCondition = JsonIgnoreCondition.Never };
    private const int RowLimit = 20; // checkRowLimit in src/commitChecks.js
    private readonly string _suffix = Guid.NewGuid().ToString("N")[..10].ToUpperInvariant();
    private string Parent => Name("P");
    private string Child => Name("C");
    private string Log => Name("L");
    private string Slow => Name("S");
    private string Writes => Name("W");
    private string Autonomous => Name("A");
    private string Name(string kind) => $"\"{user}\".\"FBSQA_CC{kind}_{_suffix}\"";

    private sealed record Prepared(string? Error, JsonElement? Check, string[]? Calls, JsonElement? Outcome);

    private static async Task<JsonElement> Grid(object request)
    {
        using var node = Process.Start(new ProcessStartInfo("node", "tests/OracleLiveRegression/commit-check.mjs") { RedirectStandardInput = true, RedirectStandardOutput = true, RedirectStandardError = true, UseShellExecute = false, StandardInputEncoding = new System.Text.UTF8Encoding(false), StandardOutputEncoding = System.Text.Encoding.UTF8 })!;
        await node.StandardInput.WriteAsync(JsonSerializer.Serialize(request, Wire));
        node.StandardInput.Close();
        var output = node.StandardOutput.ReadToEndAsync();
        var problems = node.StandardError.ReadToEndAsync();
        await node.WaitForExitAsync();
        if (node.ExitCode != 0) throw new InvalidOperationException("The grid could not judge the check: " + await problems);
        return JsonSerializer.Deserialize<JsonElement>(await output);
    }

    // Returns the grid's verdict: { status, message, rows, columns }.
    private async Task<JsonElement> Run(OracleSessionService session, string sql, string expect = "none", int timeout = 30)
    {
        var definition = new { name = "live check", sql, expect };
        var prepared = await Grid(new { check = definition });
        require(!prepared.TryGetProperty("error", out var refused), "The grid refused the check: " + (prepared.TryGetProperty("error", out var why) ? why.GetString() : ""));
        var text = prepared.GetProperty("check").GetProperty("sql").GetString()!;
        object reply;
        try
        {
            MiniToolService.AssertSelect(text);
            var result = await session.ExecuteAsync(text, [], RowLimit, default, timeoutSeconds: timeout);
            if (result.ResultId is { } id) await session.CloseResultAsync(id);
            reply = new { columns = result.Columns, rows = result.Rows, truncated = result.Truncated || result.HasMore };
        }
        catch (Exception error) { reply = new { error = error.Message }; }
        return (await Grid(new { check = definition, reply })).GetProperty("outcome");
    }

    private static string Status(JsonElement outcome) => outcome.GetProperty("status").GetString()!;
    private static string Message(JsonElement outcome) => outcome.GetProperty("message").GetString()!;
    private string Orphans => $"SELECT c.ID FROM {Child} c WHERE NOT EXISTS (SELECT 1 FROM {Parent} p WHERE p.ID = c.PARENT_ID);";
    private async Task<int> Count(OracleSessionService session, string table, string where = "1=1")
    {
        var result = await session.ExecuteAsync($"SELECT COUNT(*) FROM {table} WHERE {where}");
        if (result.ResultId is { } id) await session.CloseResultAsync(id);
        return Convert.ToInt32(result.Rows[0][0]);
    }

    private async Task Reset()
    {
        await a.RollbackAsync(); await b.RollbackAsync();
        await a.ExecuteAsync($"DELETE FROM {Child}");
        await a.ExecuteAsync($"DELETE FROM {Parent}");
        await a.ExecuteAsync($"INSERT INTO {Parent} (ID,D) VALUES (1,TIMESTAMP '2026-03-04 05:06:07')");
        await a.ExecuteAsync($"INSERT INTO {Child} (ID,PARENT_ID) VALUES (1,1)");
        await a.CommitAsync();
    }

    public async Task RunAsync()
    {
        await check("pre-commit check fixtures are created", async () => {
            await a.ExecuteAsync($"CREATE TABLE {Parent} (ID NUMBER(10) PRIMARY KEY, D DATE)"); tables.Add(Parent);
            await a.ExecuteAsync($"CREATE TABLE {Child} (ID NUMBER(10) PRIMARY KEY, PARENT_ID NUMBER(10))"); tables.Add(Child);
            await a.ExecuteAsync($"CREATE TABLE {Log} (ID NUMBER(10))"); tables.Add(Log);
            await a.ExecuteAsync($"CREATE FUNCTION {Slow} RETURN NUMBER AS BEGIN DBMS_SESSION.SLEEP(10); RETURN 1; END;"); routines.Add(Slow);
            await a.ExecuteAsync($"CREATE FUNCTION {Writes} RETURN NUMBER AS BEGIN INSERT INTO {Log} VALUES (1); RETURN 1; END;"); routines.Add(Writes);
            await a.ExecuteAsync($"CREATE FUNCTION {Autonomous} RETURN NUMBER AS PRAGMA AUTONOMOUS_TRANSACTION; BEGIN INSERT INTO {Log} VALUES (2); COMMIT; RETURN 1; END;"); routines.Add(Autonomous);
        });

        await check("pre-commit check: sees this session's pending work, which another session cannot see", async () => {
            await Reset();
            require(Status(await Run(a, Orphans)) == "ok", "A clean table was reported as a violation.");
            await a.ExecuteAsync($"INSERT INTO {Child} (ID,PARENT_ID) VALUES (2,99)");
            var mine = await Run(a, Orphans);
            require(Status(mine) == "attention" && Message(mine) == "1 row returned; expected none.", "The pending violation was not found: " + Message(mine));
            require(Convert.ToString(mine.GetProperty("rows")[0][0]) == "2", "The check did not show the violating row.");
            require(Status(await Run(b, Orphans)) == "ok", "Another session saw uncommitted work.");
            require(a.HasPendingTransaction && await Count(a, Child, "ID=2") == 1, "Running a check disturbed the pending work.");
            await a.RollbackAsync();
            require(Status(await Run(a, Orphans)) == "ok", "The check still sees rolled back work.");
        });

        await check("pre-commit check: the expectations follow real rows and a long result is reported as more than shown", async () => {
            await Reset();
            const string many = "SELECT LEVEL FROM dual CONNECT BY LEVEL <= 25";
            var none = await Run(a, many);
            require(Status(none) == "attention" && Message(none) == "20+ rows returned; expected none.", "Truncation was not reported: " + Message(none));
            require(none.GetProperty("rows").GetArrayLength() == RowLimit, "The row limit was not applied.");
            require(Status(await Run(a, many, "any")) == "ok", "Expected rows were not accepted.");
            var empty = await Run(a, "SELECT 1 FROM dual WHERE 1=0", "any");
            require(Status(empty) == "attention" && Message(empty) == "No rows returned; expected at least one.", "A missing row was not reported.");
            require(Message(await Run(a, "SELECT 1 FROM dual", "info")) == "1 row returned.", "The information result was wrong.");
            require(Status(await Run(a, "WITH x AS (SELECT 1 n FROM dual) SELECT n FROM x", "any")) == "ok", "A WITH query was refused.");
        });

        await check("pre-commit check: a failing check is reported and the pending work can still be committed", async () => {
            await Reset();
            await a.ExecuteAsync($"INSERT INTO {Child} (ID,PARENT_ID) VALUES (3,1)");
            var failed = await Run(a, $"SELECT * FROM \"{user}\".\"FBSQA_MISSING_{_suffix}\"");
            require(Status(failed) == "error" && Message(failed).Contains("ORA-00942"), "The failure was not reported: " + Message(failed));
            require(a.HasPendingTransaction, "A failing check ended the transaction.");
            await a.CommitAsync();
            require(await Count(b, Child, "ID=3") == 1, "The pending work was lost after a failing check.");
        });

        await check("pre-commit check: a timed out check is reported and keeps the pending work and the session", async () => {
            await Reset();
            await a.ExecuteAsync($"INSERT INTO {Child} (ID,PARENT_ID) VALUES (4,1)");
            var timer = Stopwatch.StartNew();
            var slow = await Run(a, $"SELECT {Slow}() FROM dual", timeout: 2);
            require(timer.Elapsed < TimeSpan.FromSeconds(8), $"The timeout took {timer.Elapsed.TotalSeconds:F0} seconds.");
            require(Status(slow) == "error" && Message(slow).Contains("timeout"), "The timeout was not reported: " + Message(slow));
            require(a.IsConnected && a.HasPendingTransaction && await Count(a, Child, "ID=4") == 1, "A timed out check disturbed the pending work.");
            await a.RollbackAsync();
        });

        await check("pre-commit check: the savepoint of the last Apply and an open result survive running checks", async () => {
            await Reset();
            var open = await a.ExecuteAsync("SELECT LEVEL FROM dual CONNECT BY LEVEL <= 205", rowLimit: 100);
            await a.ExecuteAsync($"INSERT INTO {Child} (ID,PARENT_ID) VALUES (5,1)");
            await a.ExecuteAsync("SAVEPOINT " + GridDmlBatch.Savepoint);
            await a.ExecuteAsync($"INSERT INTO {Child} (ID,PARENT_ID) VALUES (6,1)");
            await Run(a, Orphans);
            await Run(a, $"SELECT * FROM \"{user}\".\"FBSQA_MISSING_{_suffix}\"");
            await a.ExecuteAsync("ROLLBACK TO SAVEPOINT " + GridDmlBatch.Savepoint);
            require(await Count(a, Child, "ID=6") == 0 && await Count(a, Child, "ID=5") == 1, "Undoing the last Apply did not return to its savepoint.");
            var next = await a.FetchNextPageAsync(open.ResultId!, 100);
            require(Convert.ToInt32(next.Rows[0][0]) == 101, "A check disturbed the open result.");
            await a.CloseResultAsync(open.ResultId!);
            await a.RollbackAsync();
        });

        await check("pre-commit check: queries that change data are refused before they reach Oracle", async () => {
            await Reset();
            foreach (var sql in new[] { $"SELECT * FROM {Parent} FOR UPDATE", $"DELETE FROM {Child}", $"SELECT 1 FROM dual; DELETE FROM {Child}", $"INSERT INTO {Child} (ID) SELECT 9 FROM dual", $"WITH FUNCTION f RETURN NUMBER IS BEGIN RETURN 1; END; SELECT f FROM dual" })
            {
                var grid = await Grid(new { check = new { name = "live check", sql, expect = "none" } });
                require(grid.TryGetProperty("error", out _), "The grid accepted: " + sql);
                var refused = false;
                try { MiniToolService.AssertSelect(sql); } catch (InvalidOperationException) { refused = true; }
                require(refused, "The host accepted: " + sql);
            }
            require(!a.HasPendingTransaction && await Count(b, Child) == 1, "A refused query changed something.");
        });

        await check("pre-commit check: calls are listed before use; a writing function fails, an autonomous one really writes, pending work stays", async () => {
            await Reset();
            var listed = await Grid(new { check = new { name = "live check", sql = $"SELECT {Autonomous}() FROM dual", expect = "info" } });
            require(listed.GetProperty("calls").GetArrayLength() == 1, "The call was not listed before the check was added.");
            await a.ExecuteAsync($"INSERT INTO {Child} (ID,PARENT_ID) VALUES (7,1)");
            var writes = await Run(a, $"SELECT {Writes}() FROM dual", "info");
            require(Status(writes) == "error" && Message(writes).Contains("ORA-14551"), "A function that writes was not stopped by Oracle: " + Message(writes));
            require(await Count(a, Log, "ID=1") == 0, "The stopped function left a row.");
            require(Status(await Run(a, $"SELECT {Autonomous}() FROM dual", "info")) == "info", "The autonomous function did not run.");
            require(await Count(b, Log, "ID=2") == 1, "The autonomous write is why such calls are listed; it was expected to be committed.");
            require(a.HasPendingTransaction && await Count(b, Child, "ID=7") == 0, "The autonomous call committed the session's pending work.");
            await a.RollbackAsync();
        });

        await check("pre-commit check: DATE columns are marked for the bridge to revive and large numbers keep their digits", async () => {
            await Reset();
            var dated = await Run(a, $"SELECT ID, D FROM {Parent}", "info");
            require(dated.GetProperty("columns")[1].TryGetProperty("temporalKind", out var kind) && kind.ValueKind == JsonValueKind.String, "The DATE column is not marked, so the result list would show [object Object].");
            require(dated.GetProperty("rows")[0][1].GetProperty("value").GetString() == "2026-03-04T05:06:07", "The DATE value changed.");
            const string precise = "123456789012345678901234567890.12345678";
            var number = await Run(a, $"SELECT {precise} FROM dual", "info");
            require(number.GetProperty("rows")[0][0].ValueKind == JsonValueKind.String && number.GetProperty("rows")[0][0].GetString() == precise, "A large NUMBER lost digits: " + number.GetProperty("rows")[0][0].GetRawText());
        });
    }
}
