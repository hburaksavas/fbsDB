using System.Diagnostics;
using System.Text.Json;
using System.Text.Json.Serialization;
using FbsDb.Bridge;
using FbsDb.Services;

// Values the database produces, read back by the grid's own statements inside the transaction that made them.
sealed class ReadbackChecks(OracleSessionService a, OracleSessionService b, string user, Func<string, Func<Task>, Task> check, Action<bool, string> require, List<string> created)
{
    private static readonly JsonSerializerOptions Wire = new(NativeBridgeContract.JsonOptions) { DefaultIgnoreCondition = JsonIgnoreCondition.Never };
    private readonly string _suffix = Guid.NewGuid().ToString("N")[..10].ToUpperInvariant();
    private string Name => "FBSQA_RB_" + _suffix;
    private string Plain => "FBSQA_RP_" + _suffix;
    private string Table => $"\"{user}\".\"{Name}\"";
    private string PlainTable => $"\"{user}\".\"{Plain}\"";

    private static async Task<SqlExecutionResult> Read(OracleSessionService session, string sql)
    {
        var result = await session.ExecuteAsync(sql);
        if (result.ResultId is { } id) await session.CloseResultAsync(id);
        return result;
    }

    private async Task<JsonElement[]> Statements(string name, string[] identity, object[]? edits = null, Dictionary<string, string?>[]? inserts = null)
    {
        var rows = await Read(a, $"SELECT * FROM \"{user}\".\"{name}\" ORDER BY 1");
        var request = JsonSerializer.Serialize(new { table = new { schema = user, name }, columns = rows.Columns, identity, rows = rows.Rows, edits = edits ?? [], deletes = Array.Empty<int>(), inserts = inserts ?? [] }, Wire);
        using var node = Process.Start(new ProcessStartInfo("node", "tests/OracleLiveRegression/grid-statements.mjs") { RedirectStandardInput = true, RedirectStandardOutput = true, RedirectStandardError = true, UseShellExecute = false, StandardInputEncoding = new System.Text.UTF8Encoding(false), StandardOutputEncoding = System.Text.Encoding.UTF8 })!;
        await node.StandardInput.WriteAsync(request);
        node.StandardInput.Close();
        var output = node.StandardOutput.ReadToEndAsync();
        var problems = node.StandardError.ReadToEndAsync();
        await node.WaitForExitAsync();
        require(node.ExitCode == 0, "The grid could not build statements: " + await problems);
        return JsonSerializer.Deserialize<JsonElement[]>(await output)!;
    }

    private static string?[] Row(Dictionary<string, object?> outcome) => ((object?[])outcome["readback"]!).Select(cell => cell is null ? null : Convert.ToString(cell)).ToArray();
    private static string Status(Dictionary<string, object?> outcome) => (string)outcome["status"]!;

    // The same statement with a different list of columns to read, as a damaged or crafted request would have it.
    private static JsonElement[] WithRead(JsonElement statement, object readColumns)
    {
        var copy = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(statement.GetRawText())!;
        copy["readColumns"] = JsonSerializer.SerializeToElement(readColumns);
        return [JsonSerializer.SerializeToElement(copy)];
    }

    public async Task RunAsync()
    {
        await check("read back fixtures are created", async () => {
            await a.ExecuteAsync($"CREATE TABLE {Table} (ID NUMBER(10) DEFAULT 77 PRIMARY KEY, NAME VARCHAR2(40), UP VARCHAR2(40) GENERATED ALWAYS AS (UPPER(NAME)) VIRTUAL, NOTE VARCHAR2(20) DEFAULT 'def', D DATE DEFAULT DATE '2026-03-04')"); created.Add(Table);
            await a.ExecuteAsync($"CREATE TABLE {PlainTable} (K NUMBER(10), V VARCHAR2(20))"); created.Add(PlainTable);
        });

        await check("read back: a new row returns its database-filled key, defaults and computed values inside the open transaction", async () => {
            var result = await GridDmlBatch.RunAsync(a, await Statements(Name, ["ID"], inserts: [new() { ["NAME"] = "new" }]), 30, false, default);
            var outcome = result.Outcomes.Single();
            require(Status(outcome) == "applied", "The insert failed: " + outcome.GetValueOrDefault("error"));
            var row = Row(outcome);
            require(row[0] == "77", $"The key the database filled in did not come back: {row[0]}.");
            require(row[1] == "new" && row[2] == "NEW" && row[3] == "def", $"Stored values were not read: {string.Join("|", row)}.");
            require(((object?[])outcome["readback"]!)[4] is OracleTemporalCell { Value: "2026-03-04T00:00:00" }, "The DATE default was not read as a datetime.");
            require(a.HasPendingTransaction && Convert.ToInt32((await Read(b, $"SELECT COUNT(*) FROM {Table}")).Rows[0][0]) == 0, "Reading back ended the transaction.");
            var mine = await Read(a, $"SELECT NOTE FROM {Table} WHERE ID={row[0]}");
            require(mine.Rows.Count == 1, "The value read back does not find the row.");
            await a.RollbackAsync();
        });

        await check("read back: an update returns what Oracle made of the row, including a recomputed column", async () => {
            await a.ExecuteAsync($"INSERT INTO {Table} (ID,NAME) VALUES (1,'old')");
            await a.CommitAsync();
            var result = await GridDmlBatch.RunAsync(a, await Statements(Name, ["ID"], [new { row = 0, column = "NAME", value = "changed" }]), 30, false, default);
            var row = Row(result.Outcomes.Single());
            require(row[1] == "changed" && row[2] == "CHANGED", $"The recomputed value was not read: {string.Join("|", row)}.");
            await a.RollbackAsync();
        });

        await check("read back: a failed read is apart from the DML, which stays applied", async () => {
            var statement = (await Statements(Name, ["ID"], [new { row = 0, column = "NOTE", value = "applied" }]))[0];
            var result = await GridDmlBatch.RunAsync(a, WithRead(statement, new[] { "\"NOPE\"" }), 30, false, default);
            var outcome = result.Outcomes.Single();
            require(Status(outcome) == "applied" && result.Recovery is null, "A failed read turned into a failed change.");
            require(Convert.ToString(outcome["readbackError"])!.Contains("ORA-00904"), "The read failure was not reported: " + outcome.GetValueOrDefault("readbackError"));
            require(a.HasPendingTransaction && Equals((await Read(a, $"SELECT NOTE FROM {Table} WHERE ID=1")).Rows[0][0], "applied"), "A failed read disturbed the change.");
            await a.RollbackAsync();
        });

        await check("read back: a crafted column list is refused and never reaches Oracle", async () => {
            var statement = (await Statements(Name, ["ID"], [new { row = 0, column = "NOTE", value = "applied" }]))[0];
            var result = await GridDmlBatch.RunAsync(a, WithRead(statement, new[] { $"(SELECT COUNT(*) FROM {Table})" }), 30, false, default);
            var outcome = result.Outcomes.Single();
            require(Status(outcome) == "applied" && Convert.ToString(outcome["readbackError"])!.Contains("column list"), "A crafted column list was not refused.");
            require(!outcome.ContainsKey("readback"), "A crafted column list was read.");
            await a.RollbackAsync();
        });

        await check("read back: a key matching several rows is still reported as a count, and nothing stays changed", async () => {
            await a.ExecuteAsync($"INSERT INTO {PlainTable} (K,V) VALUES (7,'a')");
            await a.ExecuteAsync($"INSERT INTO {PlainTable} (K,V) VALUES (7,'a')");
            await a.CommitAsync();
            var result = await GridDmlBatch.RunAsync(a, await Statements(Plain, ["K"], [new { row = 0, column = "V", value = "both" }]), 30, false, default);
            var outcome = result.Outcomes.Single();
            require(Status(outcome) == "mismatch" && Convert.ToInt32(outcome["rowsAffected"]) == 2, $"Expected a mismatch of 2 rows, got {Status(outcome)}: {outcome.GetValueOrDefault("error")}.");
            require(Convert.ToInt32((await Read(a, $"SELECT COUNT(*) FROM {PlainTable} WHERE V='both'")).Rows[0][0]) == 0, "The rows were left changed.");
            await a.RollbackAsync();
        });
    }
}
