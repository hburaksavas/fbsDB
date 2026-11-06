using System.Diagnostics;
using System.Text.Json;
using System.Text.Json.Serialization;
using FbsDb.Bridge;
using FbsDb.Services;

// Grid Apply against real Oracle. Rows are read back from the database and turned into statements
// by the grid's own code (grid-statements.mjs), so these are the statements the application sends.
sealed class GridApplyChecks(OracleSessionService a, OracleSessionService b, string user, Func<string, Func<Task>, Task> check, Action<bool, string> require, List<string> created)
{
    private static readonly JsonSerializerOptions Wire = new(NativeBridgeContract.JsonOptions) { DefaultIgnoreCondition = JsonIgnoreCondition.Never };
    private const string Numeric = "'NLS_NUMERIC_CHARACTERS=''.,'''";
    private readonly string _suffix = Guid.NewGuid().ToString("N")[..10].ToUpperInvariant();
    private string ParentName => "FBSQA_GP_" + _suffix;
    private string ChildName => "FBSQA_GC_" + _suffix;
    private string KeysName => "FBSQA_GK_" + _suffix;
    private string Parent => Qualified(ParentName);
    private string Child => Qualified(ChildName);
    private string Keys => Qualified(KeysName);
    private string Qualified(string name) => $"\"{user}\".\"{name}\"";

    private sealed record Edit(int Row, string Column, string? Value);

    private async Task<SqlExecutionResult> Read(OracleSessionService session, string sql)
    {
        var result = await session.ExecuteAsync(sql);
        if (result.ResultId is { } id) await session.CloseResultAsync(id);
        return result;
    }
    private async Task<string?> One(OracleSessionService session, string sql) => Convert.ToString((await Read(session, sql)).Rows.FirstOrDefault()?[0]);
    private async Task<int> Count(OracleSessionService session, string where) => Convert.ToInt32((await Read(session, $"SELECT COUNT(*) FROM {Parent} WHERE {where}")).Rows[0][0]);

    private async Task<JsonElement[]> Statements(OracleSessionService session, string name, string[] identity, Edit[]? edits = null, int[]? deletes = null, Dictionary<string, string?>[]? inserts = null)
    {
        var rows = await Read(session, $"SELECT * FROM {Qualified(name)} ORDER BY 1");
        var request = JsonSerializer.Serialize(new { table = new { schema = user, name }, columns = rows.Columns, identity, rows = rows.Rows, edits = edits ?? [], deletes = deletes ?? [], inserts = inserts ?? [] }, Wire);
        using var node = Process.Start(new ProcessStartInfo("node", "tests/OracleLiveRegression/grid-statements.mjs") { RedirectStandardInput = true, RedirectStandardOutput = true, RedirectStandardError = true, UseShellExecute = false, StandardInputEncoding = new System.Text.UTF8Encoding(false), StandardOutputEncoding = System.Text.Encoding.UTF8 })!;
        await node.StandardInput.WriteAsync(request);
        node.StandardInput.Close();
        var output = node.StandardOutput.ReadToEndAsync();
        var problems = node.StandardError.ReadToEndAsync();
        await node.WaitForExitAsync();
        require(node.ExitCode == 0, "The grid could not build statements: " + await problems);
        return JsonSerializer.Deserialize<JsonElement[]>(await output)!;
    }
    private Task<JsonElement[]> ParentStatements(Edit[]? edits = null, int[]? deletes = null, Dictionary<string, string?>[]? inserts = null) => Statements(a, ParentName, ["ID"], edits, deletes, inserts);
    private static Task<GridDmlBatchResult> Run(OracleSessionService session, JsonElement[] statements, int timeout = 30, bool keep = false, CancellationToken stop = default) => GridDmlBatch.RunAsync(session, statements, timeout, keep, stop);
    private void Statuses(GridDmlBatchResult result, params string[] expected)
    {
        var actual = result.Outcomes.Select(outcome => (string)outcome["status"]!).ToArray();
        require(actual.SequenceEqual(expected), $"Expected [{string.Join(",", expected)}] but got [{string.Join(",", actual)}]: {string.Join(" | ", result.Outcomes.Select(outcome => outcome.GetValueOrDefault("error")))}");
    }
    private static string? Error(GridDmlBatchResult result) => result.Outcomes.Select(outcome => outcome.GetValueOrDefault("error") as string).FirstOrDefault(text => text is not null);

    private async Task Reset()
    {
        await a.RollbackAsync(); await b.RollbackAsync();
        await a.ExecuteAsync($"DELETE FROM {Child}");
        await a.ExecuteAsync($"DELETE FROM {Parent}");
        foreach (var (id, name, note) in new[] { (1, "alpha", "n1"), (2, "beta", "n2"), (3, "gamma", "n3") })
            await a.ExecuteAsync($"INSERT INTO {Parent} (ID,NAME,AMOUNT,D,TS,NOTE) VALUES ({id},'{name}',123456789012345678901234567890.12345678,TO_DATE('2026-01-15 10:20:30','YYYY-MM-DD HH24:MI:SS'),TIMESTAMP '2026-01-15 10:20:30.123456789','{note}')");
        await a.ExecuteAsync($"INSERT INTO {Child} (ID,PARENT_ID) VALUES (1,1)");
        await a.CommitAsync();
    }

    public async Task RunAsync()
    {
        await check("grid fixture tables are created under uniquely named test objects", async () => {
            await a.ExecuteAsync($"CREATE TABLE {Parent} (ID NUMBER(10) PRIMARY KEY, NAME VARCHAR2(40 CHAR) NOT NULL UNIQUE, AMOUNT NUMBER(38,8), D DATE, TS TIMESTAMP(9), NOTE VARCHAR2(200) DEFAULT 'default note')"); created.Add(Parent);
            await a.ExecuteAsync($"CREATE TABLE {Child} (ID NUMBER(10) PRIMARY KEY, PARENT_ID NUMBER(10) NOT NULL REFERENCES {Parent}(ID))"); created.Insert(0, Child);
            await a.ExecuteAsync($"CREATE TABLE {Keys} (K_DATE DATE, K_TS TIMESTAMP(9), K_NUM NUMBER(20,5), BD BINARY_DOUBLE, V VARCHAR2(20), PRIMARY KEY (K_DATE,K_TS,K_NUM))"); created.Insert(0, Keys);
        });

        await check("grid apply: update, explicit NULL, delete and insert stay private until Commit and keep exact values", async () => {
            await Reset();
            const string amount = "98765432109876543210987654321.87654321";
            var statements = await ParentStatements(
                [new(0, "NAME", "Çağrı İĞÜŞÖ"), new(0, "AMOUNT", amount), new(0, "D", "2026-02-01T01:02:03"), new(0, "TS", "2026-02-01T01:02:03.987654321"), new(1, "NOTE", null)],
                [2], [new() { ["ID"] = "10", ["NAME"] = "delta" }]);
            var result = await Run(a, statements);
            Statuses(result, "applied", "applied", "applied", "applied");
            require(result.Error is null && a.HasPendingTransaction, "A successful Apply must leave an open transaction.");
            require(await One(b, $"SELECT NAME FROM {Parent} WHERE ID=1") == "alpha" && await Count(b, "ID=3") == 1 && await Count(b, "ID=10") == 0, "Another session saw uncommitted grid changes.");
            await a.CommitAsync();
            var row = (await Read(b, $"SELECT NAME, TO_CHAR(AMOUNT,'TM9',{Numeric}), TO_CHAR(D,'YYYY-MM-DD HH24:MI:SS'), TO_CHAR(TS,'YYYY-MM-DD HH24:MI:SS.FF9') FROM {Parent} WHERE ID=1")).Rows[0];
            require(Equals(row[0], "Çağrı İĞÜŞÖ"), $"Unicode value changed: {row[0]}");
            require(Equals(row[1], amount), $"NUMBER lost precision: {row[1]}");
            require(Equals(row[2], "2026-02-01 01:02:03"), $"DATE changed: {row[2]}");
            require(Equals(row[3], "2026-02-01 01:02:03.987654321"), $"TIMESTAMP changed: {row[3]}");
            require(await Count(b, "ID=2 AND NOTE IS NULL") == 1, "Explicit NULL was not stored.");
            require(await Count(b, "ID=3") == 0, "The deleted row is still there.");
            require(await One(b, $"SELECT NOTE FROM {Parent} WHERE ID=10") == "default note", "An omitted column did not use the database default.");
        });

        await check("grid apply: a failure rolls back the batch to its savepoint and keeps earlier session work", async () => {
            await Reset();
            await a.ExecuteAsync($"INSERT INTO {Parent} (ID,NAME) VALUES (50,'earlier work')");
            var result = await Run(a, await ParentStatements([new(0, "NAME", "changed"), new(1, "NAME", "gamma"), new(2, "NAME", "not sent")]));
            Statuses(result, "rolledBack", "failed", "skipped");
            require(Error(result)?.Contains("ORA-00001") == true, "The unique violation was not reported: " + Error(result));
            require(result.Recovery?.Contains("rolled back") == true, "The rollback was not explained.");
            require(await One(a, $"SELECT NAME FROM {Parent} WHERE ID=1") == "alpha", "The batch was not rolled back.");
            require(await Count(a, "ID=50") == 1 && a.HasPendingTransaction, "Earlier session work was lost.");
            await a.RollbackAsync();
            require(await Count(a, "ID=50") == 0, "Earlier work was committed.");
        });

        await check("grid apply: in a clean session a failure rolls the batch back and leaves no transaction open", async () => {
            await Reset();
            require(!a.HasPendingTransaction, "The session was expected to be clean.");
            var result = await Run(a, await ParentStatements([new(0, "NAME", "changed"), new(1, "NAME", "gamma"), new(2, "NAME", "not sent")]));
            Statuses(result, "rolledBack", "failed", "skipped");
            require(result.Recovery?.Contains("rolled back to its starting point") == true, "The batch was not rolled back: " + result.Recovery);
            require(await One(a, $"SELECT NAME FROM {Parent} WHERE ID=1") == "alpha", "The first statement stayed applied.");
            require(!a.HasPendingTransaction, "A batch that left nothing behind kept a transaction open.");
        });

        await check("grid apply: undoing the first Apply of a clean session returns to its savepoint", async () => {
            await Reset();
            Statuses(await Run(a, await ParentStatements([new(0, "NOTE", "applied")])), "applied");
            await a.ExecuteAsync("ROLLBACK TO SAVEPOINT " + GridDmlBatch.Savepoint, null, 1, default, timeoutSeconds: 30);
            require(await One(a, $"SELECT NOTE FROM {Parent} WHERE ID=1") == "n1", "The Apply was not undone.");
            await a.RollbackAsync();
        });

        await check("grid apply: the keep policy leaves applied statements in the open transaction", async () => {
            await Reset();
            var result = await Run(a, await ParentStatements([new(0, "NAME", "changed"), new(1, "NAME", "gamma"), new(2, "NAME", "not sent")]), keep: true);
            Statuses(result, "applied", "failed", "skipped");
            require(await One(a, $"SELECT NAME FROM {Parent} WHERE ID=1") == "changed" && a.HasPendingTransaction, "The applied statement was not kept.");
            require(await One(b, $"SELECT NAME FROM {Parent} WHERE ID=1") == "alpha", "The kept statement was committed.");
            await a.RollbackAsync();
        });

        await check("grid apply: a value changed by another session is reported and not overwritten", async () => {
            await Reset();
            var statements = await ParentStatements([new(0, "NOTE", "mine")]);
            await b.ExecuteAsync($"UPDATE {Parent} SET NOTE='theirs' WHERE ID=1");
            await b.CommitAsync();
            var result = await Run(a, statements);
            Statuses(result, "mismatch");
            require(Convert.ToInt32(result.Outcomes[0]["rowsAffected"]) == 0 && Convert.ToInt32(result.Outcomes[0]["expected"]) == 1, "The row counts were not reported.");
            require(await One(a, $"SELECT NOTE FROM {Parent} WHERE ID=1") == "theirs", "Another session's change was overwritten.");
            await a.RollbackAsync();
        });

        await check("grid apply: undoing the last Apply returns to its savepoint and keeps earlier work", async () => {
            await Reset();
            await a.ExecuteAsync($"INSERT INTO {Parent} (ID,NAME) VALUES (50,'earlier work')");
            Statuses(await Run(a, await ParentStatements([new(0, "NOTE", "applied")])), "applied");
            await a.ExecuteAsync("ROLLBACK TO SAVEPOINT " + GridDmlBatch.Savepoint, null, 1, default, timeoutSeconds: 30);
            require(await One(a, $"SELECT NOTE FROM {Parent} WHERE ID=1") == "n1", "The Apply was not undone.");
            require(await Count(a, "ID=50") == 1 && a.HasPendingTransaction, "Undo removed earlier work.");
            await a.RollbackAsync();
        });

        await check("grid delete: a referenced parent row fails and relationship lookups find the real rows", async () => {
            await Reset();
            var result = await Run(a, await ParentStatements(deletes: [0]));
            Statuses(result, "failed");
            require(Error(result)?.Contains("ORA-02292") == true, "The foreign-key failure was not reported: " + Error(result));
            require(await Count(a, "ID=1") == 1, "The referenced row was removed.");
            await a.RollbackAsync();
            var key = await a.GetPrimaryKeyAsync(user, ParentName);
            require(key.Columns.Single().Name == "ID", "The primary key was not read.");
            var children = await a.ChildRecordsSqlAsync(user, ParentName, new Dictionary<string, object?> { ["ID"] = "1" });
            require(children.Count == 1, "The child relationship was not found.");
            var childRows = await Read(a, children[0].Sql.TrimEnd(';'));
            require(childRows.Rows.Count == 1, "The generated child query did not find the row: " + children[0].Sql);
            var parents = (await a.GetRelationsAsync(user, ChildName)).Parents;
            require(parents.Single().Table == ParentName && parents.Single().Owner == user && parents.Single().Pairs.Single() is { Child: "PARENT_ID", Parent: "ID" }, "A parent relation did not name the parent table.");
            var parentSql = await a.RelatedRecordsSqlAsync(user, ChildName, "PARENT_ID", "1");
            require(parentSql is not null && (await Read(a, parentSql.TrimEnd(';'))).Rows.Count == 1, "The generated parent query did not find the row: " + parentSql);
        });

        await check("grid apply: a locked row times out, the batch is rolled back and the session stays usable", async () => {
            await Reset();
            await b.ExecuteAsync($"UPDATE {Parent} SET NOTE='locked' WHERE ID=1");
            var statements = await ParentStatements([new(0, "NOTE", "waiting"), new(1, "NOTE", "not sent")]);
            var timer = Stopwatch.StartNew();
            var result = await Run(a, statements, timeout: 2);
            Statuses(result, "failed", "skipped");
            require(timer.Elapsed < TimeSpan.FromSeconds(20), $"The lock wait took {timer.Elapsed.TotalSeconds:F0} seconds.");
            require(await One(a, $"SELECT NOTE FROM {Parent} WHERE ID=1") == "n1", "The session cannot query after the lock timeout.");
            await b.RollbackAsync();
            await a.RollbackAsync();
        });

        await check("grid apply: auto commit is refused before anything runs", async () => {
            await Reset();
            var statements = await ParentStatements([new(0, "NOTE", "auto")]);
            await a.SetAutoCommitAsync(true);
            try
            {
                var result = await Run(a, statements);
                require(result.Error?.Contains("auto commit") == true && result.Outcomes.Count == 0, "Auto commit was not refused.");
            }
            finally { await a.SetAutoCommitAsync(false); }
            require(await One(b, $"SELECT NOTE FROM {Parent} WHERE ID=1") == "n1", "A refused batch changed data.");
        });

        await check("grid apply: statements the grid does not generate are refused without running", async () => {
            await Reset();
            var crafted = JsonSerializer.Deserialize<JsonElement[]>(JsonSerializer.Serialize(new object[] { new { sql = $"DROP TABLE {Parent}" }, new { sql = "x" } }))!;
            var result = await Run(a, crafted);
            Statuses(result, "failed", "skipped");
            require(await Count(a, "1=1") == 3, "A refused statement changed the table.");
            await a.RollbackAsync();
        });

        await check("grid apply: stopping before a statement sends nothing and says so", async () => {
            await Reset();
            using var stop = new CancellationTokenSource();
            stop.Cancel();
            var result = await Run(a, await ParentStatements([new(0, "NOTE", "stopped")]), stop: stop.Token);
            Statuses(result, "skipped");
            require(result.StoppedByUser && result.Recovery?.Contains("0 statement") == true, "The stop was not reported.");
            require(await One(a, $"SELECT NOTE FROM {Parent} WHERE ID=1") == "n1", "A stopped batch changed data.");
            await a.RollbackAsync();
        });

        await check("grid apply: DATE, TIMESTAMP and fractional NUMBER keys and a BINARY_DOUBLE guard find their row under another date format", async () => {
            await b.RollbackAsync();
            await b.ExecuteAsync($"INSERT INTO {Keys} (K_DATE,K_TS,K_NUM,BD,V) VALUES (TO_DATE('2026-03-04 05:06:07','YYYY-MM-DD HH24:MI:SS'),TIMESTAMP '2026-03-04 05:06:07.000000001',12.5,0.1,'first')");
            await b.CommitAsync();
            var statements = await Statements(b, KeysName, ["K_DATE", "K_TS", "K_NUM"], [new(0, "V", "second"), new(0, "BD", "0.25"), new(0, "K_DATE", "2026-03-05T05:06:07")]);
            Statuses(await Run(b, statements), "applied");
            await b.CommitAsync();
            var row = (await Read(a, $"SELECT V, TO_CHAR(BD,'TM9',{Numeric}), TO_CHAR(K_DATE,'YYYY-MM-DD HH24:MI:SS') FROM {Keys}")).Rows[0];
            require(Equals(row[0], "second") && Equals(row[1], ".25") | Equals(row[1], "0.25") && Equals(row[2], "2026-03-05 05:06:07"), $"Key update stored {row[0]}, {row[1]}, {row[2]}.");
        });
    }
}
