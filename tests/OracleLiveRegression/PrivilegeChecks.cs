using FbsDb.Services;
using Oracle.ManagedDataAccess.Client;

// What the application says this session may change, against what real Oracle does. A refused statement uses WHERE 1=0, so no row can change even if Oracle accepted it.
sealed class PrivilegeChecks(OracleSessionService session, string user, Func<string, Func<Task>, Task> check, Action<bool, string> require, List<string> created, Action<string, string> skipped)
{
    private readonly string _name = "FBSQA_PV_" + Guid.NewGuid().ToString("N")[..10].ToUpperInvariant();

    private async Task<string[][]> Rows(string sql)
    {
        var result = await session.ExecuteAsync(sql);
        if (result.ResultId is { } id) await session.CloseResultAsync(id);
        return result.Rows.Select(row => row.Select(cell => Convert.ToString(cell) ?? "").ToArray()).ToArray();
    }

    private async Task<bool> Refused(string sql)
    {
        try { await session.ExecuteAsync(sql); return false; }
        catch (OracleException error) when (error.Number is 1031 or 41900) { return true; } // 41900 is the newer code for a missing privilege.
        finally { await session.RollbackAsync(); }
    }

    private async Task Agrees(string owner, string table, EditPrivileges said)
    {
        var target = $"\"{owner}\".\"{table}\"";
        var column = (await Rows($"SELECT column_name FROM all_tab_columns WHERE owner='{owner}' AND table_name='{table}' AND rownum=1"))[0][0];
        require(await Refused($"UPDATE {target} SET \"{column}\"=\"{column}\" WHERE 1=0") != said.Update, $"{target}: UPDATE was reported as {said.Update}.");
        require(await Refused($"DELETE FROM {target} WHERE 1=0") != said.Delete, $"{target}: DELETE was reported as {said.Delete}.");
    }

    private async Task GrantedByAnotherOwner()
    {
        const string columns = "\"FBSQA_GRANTS\".\"COLUMN_GRANTED\"", role = "\"FBSQA_GRANTS\".\"ROLE_GRANTED\"";
        await check("privileges: grants on single columns are read per column and per operation, as Oracle applies them", async () => {
            var said = (await session.GetEditPrivilegesAsync("FBSQA_GRANTS", "COLUMN_GRANTED"))!;
            require(!said.Update && !said.Insert && !said.Delete, "Column grants were reported as table grants.");
            require(said.UpdateColumns.SequenceEqual(["OPEN_COL"]), "UPDATE columns: " + string.Join(",", said.UpdateColumns));
            require(said.InsertColumns.Order().SequenceEqual(["ID", "INS_COL"]), "INSERT columns: " + string.Join(",", said.InsertColumns));
            require(!await Refused($"UPDATE {columns} SET OPEN_COL=OPEN_COL WHERE 1=0"), "Oracle refused the granted column.");
            require(await Refused($"UPDATE {columns} SET CLOSED_COL=CLOSED_COL WHERE 1=0"), "Oracle allowed a column that was reported as locked.");
            require(await Refused($"DELETE FROM {columns} WHERE 1=0"), "Oracle allowed DELETE, reported as missing.");
            require(!await Refused($"INSERT INTO {columns} (ID,INS_COL) SELECT 1,'x' FROM dual WHERE 1=0"), "Oracle refused the columns granted for INSERT.");
            require(await Refused($"INSERT INTO {columns} (ID,CLOSED_COL) SELECT 1,'x' FROM dual WHERE 1=0"), "Oracle allowed INSERT on a column that was reported as locked.");
        });
        await check("privileges: a grant reaching the user through an enabled role counts", async () => {
            var said = (await session.GetEditPrivilegesAsync("FBSQA_GRANTS", "ROLE_GRANTED"))!;
            require(said.Update && !said.Insert && !said.Delete, $"Reported update={said.Update} insert={said.Insert} delete={said.Delete}.");
            require(!await Refused($"UPDATE {role} SET NOTE=NOTE WHERE 1=0"), "Oracle refused what the role grants.");
            require(await Refused($"DELETE FROM {role} WHERE 1=0"), "Oracle allowed what the role does not grant.");
        });
    }

    public async Task RunAsync()
    {
        await check("privileges: an owner may change everything and reading them leaves pending work alone", async () => {
            var table = $"\"{user}\".\"{_name}\"";
            await session.ExecuteAsync($"CREATE TABLE {table} (ID NUMBER(10) PRIMARY KEY)"); created.Add(table);
            await session.ExecuteAsync($"INSERT INTO {table} VALUES (1)");
            var said = (await session.GetEditPrivilegesAsync(user, _name))!;
            require(said.Update && said.Insert && said.Delete, "The owner was not given every privilege.");
            var unqualified = (await session.GetEditPrivilegesAsync("", _name))!;
            require(unqualified.Update && unqualified.Insert && unqualified.Delete, "A table named without its schema was locked for its own owner.");
            require(session.HasPendingTransaction && (await Rows($"SELECT COUNT(*) FROM {table}"))[0][0] == "1", "Reading privileges disturbed pending work.");
            await session.RollbackAsync();
        });

        await check("privileges: a table that was never granted is reported as locked, and Oracle refuses it", async () => {
            var said = (await session.GetEditPrivilegesAsync("SYS", "DUAL"))!;
            require(!said.Update && !said.Insert && !said.Delete && said.UpdateColumns.Length == 0 && said.InsertColumns.Length == 0, "SYS.DUAL was reported as changeable.");
            await Agrees("SYS", "DUAL", said);
        });

        await check("privileges: a name that is not a table here, such as a synonym, claims nothing", async () => {
            require(await session.GetEditPrivilegesAsync("", "DUAL") is null, "The DUAL synonym was given privileges of its own.");
            require(await session.GetEditPrivilegesAsync(user, _name + "_MISSING") is null, "A missing table was given privileges.");
        });

        await check("privileges: partial PUBLIC grants match what Oracle allows", async () => {
            var objects = await Rows(@"SELECT table_schema, table_name FROM (
                SELECT table_schema, table_name, MAX(CASE WHEN privilege='INSERT' THEN 1 ELSE 0 END) i, MAX(CASE WHEN privilege='UPDATE' THEN 1 ELSE 0 END) u, MAX(CASE WHEN privilege='DELETE' THEN 1 ELSE 0 END) d
                FROM all_tab_privs a WHERE grantee='PUBLIC' AND privilege IN ('INSERT','UPDATE','DELETE') AND EXISTS (SELECT 1 FROM all_tables t WHERE t.owner=a.table_schema AND t.table_name=a.table_name)
                GROUP BY table_schema, table_name ORDER BY u, d, table_name) WHERE rownum<=3");
            require(objects.Length > 0, "This database has no partial PUBLIC grant to compare with.");
            var insertOnly = false;
            foreach (var item in objects)
            {
                var said = (await session.GetEditPrivilegesAsync(item[0], item[1]))!;
                require(said.Insert || said.Update || said.Delete, $"{item[0]}.{item[1]}: a PUBLIC grant was not found.");
                insertOnly |= said.Insert && !said.Update;
                await Agrees(item[0], item[1], said);
            }
            require(insertOnly, "No INSERT-only grant was compared.");
        });

        if ((await Rows("SELECT COUNT(*) FROM all_tables WHERE owner='FBSQA_GRANTS' AND table_name='COLUMN_GRANTED'"))[0][0] == "1") await GrantedByAnotherOwner();
        else skipped("privileges: grants from another owner", "Run scripts/setup-fbsqa-fixtures.ps1 first.");
    }
}
