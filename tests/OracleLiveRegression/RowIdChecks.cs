using System.Text.Json;
using FbsDb.Services;
using Oracle.ManagedDataAccess.Client;

// Editing a table without a primary key: the grid identifies rows by ROWID, read through GridRowIds.Wrap, and its statements
// (WHERE ROWID = :bind) go through the same batch as any other grid edit.
sealed class RowIdChecks(OracleSessionService session, string user, Func<string, Func<Task>, Task> check, Action<bool, string> require, List<string> created)
{
    private readonly string _name = "FBSQA_RID_" + Guid.NewGuid().ToString("N")[..10].ToUpperInvariant();
    private string Table => $"\"{user}\".\"{_name}\"";

    private async Task<SqlExecutionResult> Read(string sql)
    {
        var result = await session.ExecuteAsync(sql);
        if (result.ResultId is { } id) await session.CloseResultAsync(id);
        return result;
    }
    private async Task<int?> Refusal(string sql)
    {
        try { await Read(GridRowIds.Wrap(sql)); return null; }
        catch (OracleException error) { return error.Number; }
    }

    public async Task RunAsync()
    {
        await session.ExecuteAsync($"CREATE TABLE {Table} (ID NUMBER, NAME VARCHAR2(20))");
        created.Add(Table);
        // Rows 2 and 3 are identical: only a ROWID tells them apart.
        foreach (var (id, name) in new[] { (1, "a"), (2, "same"), (2, "same"), (4, "d") }) await session.ExecuteAsync($"INSERT INTO {Table} VALUES ({id}, '{name}')");
        await session.CommitAsync();

        await check("row ids: a query on one table is read again with a ROWID for every row", async () =>
        {
            foreach (var sql in new[] { $"SELECT * FROM {Table}", $"SELECT NAME, ID FROM {Table} t WHERE ID > 0 ORDER BY ID DESC -- trailing comment", $"SELECT ID, NAME FROM {Table};" })
            {
                var rows = await Read(GridRowIds.Wrap(sql));
                require(rows.Columns[0].Name == GridRowIds.Column && rows.Columns.Count == 3, "The ROWID column is not first: " + sql);
                var ids = rows.Rows.Select(row => Convert.ToString(row[0]) ?? "").ToArray();
                require(ids.Length == 4 && ids.All(id => id.Length == 18) && ids.Distinct().Count() == 4, "Each row needs its own ROWID: " + sql);
            }
        });

        await check("row ids: queries whose rows are not single table rows are refused by Oracle", async () =>
        {
            foreach (var sql in new[] { $"SELECT DISTINCT ID, NAME FROM {Table}", $"SELECT ID, COUNT(*) N FROM {Table} GROUP BY ID", $"SELECT ID, NAME FROM {Table} UNION ALL SELECT ID, NAME FROM {Table}" })
                require(await Refusal(sql) is not null, "Oracle gave ROWIDs for: " + sql);
            // Reported, not required: these depend on the Oracle version.
            foreach (var sql in new[] { $"SELECT ID, NAME FROM {Table} WHERE ROWNUM <= 2", $"SELECT ID, NAME FROM {Table} FETCH FIRST 2 ROWS ONLY", $"SELECT a.ID, a.NAME FROM {Table} a JOIN dual ON 1=1" })
                Console.WriteLine($"INFO row ids for [{sql.Replace(Table, "T")}]: {(await Refusal(sql) is { } code ? "ORA-" + code.ToString("00000") : "available")}");
        });

        await check("row ids: an UPDATE and a DELETE by ROWID change exactly one of two identical rows", async () =>
        {
            var rows = await Read(GridRowIds.Wrap($"SELECT ID, NAME FROM {Table} ORDER BY ID"));
            var twins = rows.Rows.Where(row => Convert.ToString(row[2]) == "same").Select(row => Convert.ToString(row[0])!).ToArray();
            require(twins.Length == 2, "The identical rows were not read.");
            JsonElement Statement(object value) => JsonSerializer.SerializeToElement(value);
            var result = await GridDmlBatch.RunAsync(session, [
                Statement(new { kind = "update", sql = $"UPDATE {Table} SET \"NAME\" = :c1 WHERE ROWID = :uk1 AND \"NAME\" = :ok1", expectRows = 1, binds = new object[] { new { name = "c1", type = "VARCHAR2", value = "changed" }, new { name = "uk1", type = "VARCHAR2", value = twins[0] }, new { name = "ok1", type = "VARCHAR2", value = "same" } } }),
                Statement(new { kind = "delete", sql = $"DELETE FROM {Table} WHERE ROWID = :dk1", expectRows = 1, binds = new object[] { new { name = "dk1", type = "VARCHAR2", value = twins[1] } } })
            ], 30, false, default);
            require(result.Error is null && result.Outcomes.All(outcome => (string?)outcome["status"] == "applied"), "The batch did not apply: " + (result.Error ?? JsonSerializer.Serialize(result.Outcomes)));
            var after = (await Read($"SELECT NAME FROM {Table} ORDER BY ID, NAME")).Rows.Select(row => Convert.ToString(row[0])).ToArray();
            require(after.SequenceEqual(["a", "changed", "d"]), "Stored rows: " + string.Join(",", after));
            await session.RollbackAsync();
        });
    }
}
