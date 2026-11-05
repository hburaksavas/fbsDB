using System.Diagnostics;
using System.Text.Json;
using System.Text.Json.Serialization;
using FbsDb.Bridge;
using FbsDb.Services;

// TIMESTAMP WITH TIME ZONE and WITH LOCAL TIME ZONE against real Oracle. What the application shows and generates is compared with what
// Oracle itself reports through TO_CHAR, and the grid's statements come from its own code.
sealed class TimeZoneChecks(ConnectionProfile profile, string user, Func<string, Func<Task>, Task> check, Action<bool, string> require, List<string> created)
{
    private static readonly JsonSerializerOptions Wire = new(NativeBridgeContract.JsonOptions) { DefaultIgnoreCondition = JsonIgnoreCondition.Never };
    private readonly string _suffix = Guid.NewGuid().ToString("N")[..10].ToUpperInvariant();
    private string ZonedName => "FBSQA_TZ_" + _suffix;
    private string LocalKeyName => "FBSQA_TL_" + _suffix;
    private string Zoned => $"\"{user}\".\"{ZonedName}\"";
    private string LocalKey => $"\"{user}\".\"{LocalKeyName}\"";
    private const string Truth = "TO_CHAR(TS,'YYYY-MM-DD\"T\"HH24:MI:SS.FF9'), TO_CHAR(TS,'TZH:TZM'), TO_CHAR(TS,'TZR')";

    private static async Task<JsonElement> Node(string script, string input)
    {
        using var node = Process.Start(new ProcessStartInfo("node", "tests/OracleLiveRegression/" + script) { RedirectStandardInput = true, RedirectStandardOutput = true, RedirectStandardError = true, UseShellExecute = false, StandardInputEncoding = new System.Text.UTF8Encoding(false), StandardOutputEncoding = System.Text.Encoding.UTF8 })!;
        await node.StandardInput.WriteAsync(input);
        node.StandardInput.Close();
        var output = node.StandardOutput.ReadToEndAsync();
        var problems = node.StandardError.ReadToEndAsync();
        await node.WaitForExitAsync();
        if (node.ExitCode != 0) throw new InvalidOperationException(script + " failed: " + await problems);
        return JsonSerializer.Deserialize<JsonElement>(await output);
    }

    private static async Task<SqlExecutionResult> Read(OracleSessionService session, string sql)
    {
        var result = await session.ExecuteAsync(sql);
        if (result.ResultId is { } id) await session.CloseResultAsync(id);
        return result;
    }

    private async Task<JsonElement[]> Statements(OracleSessionService session, string name, string[] identity, object[]? edits = null, Dictionary<string, string?>[]? inserts = null)
    {
        var rows = await Read(session, $"SELECT * FROM \"{user}\".\"{name}\" ORDER BY 1");
        var request = JsonSerializer.Serialize(new { table = new { schema = user, name }, columns = rows.Columns, identity, rows = rows.Rows, edits = edits ?? [], deletes = Array.Empty<int>(), inserts = inserts ?? [] }, Wire);
        return (await Node("grid-statements.mjs", request)).EnumerateArray().ToArray();
    }

    private async Task<OracleSessionService> Open(string zone)
    {
        var session = new OracleSessionService();
        await session.ConnectAsync(profile, "", "", null);
        await session.ExecuteAsync($"ALTER SESSION SET TIME_ZONE = '{zone}'");
        return session;
    }

    private async Task Seed(OracleSessionService session)
    {
        await session.ExecuteAsync($"DELETE FROM {Zoned}");
        foreach (var (id, literal) in new[] {
            (1, "'2026-11-02 10:15:30.123456789 +03:00'"),
            (2, "'2026-01-15 23:59:59.000000001 -03:30'"),
            (3, "'2026-11-01 01:30:00.500000000 America/New_York EDT'"),
            (4, "'2026-11-01 01:30:00.500000000 America/New_York EST'"),
            (5, "'2026-06-01 12:00:00.000000000 +00:00'"),
            (6, "'2026-06-01 12:00:00.000000000 -00:30'") })
            await session.ExecuteAsync($"INSERT INTO {Zoned} (ID,TS,L,NOTE) VALUES ({id},TIMESTAMP {literal},TIMESTAMP '2026-06-01 12:00:00.000000000 +00:00','n{id}')");
        await session.ExecuteAsync($"INSERT INTO {Zoned} (ID,NOTE) VALUES (7,'empty')");
        await session.CommitAsync();
    }

    public async Task RunAsync()
    {
        using var session = await Open("+05:00");

        await check("time zone fixtures are created", async () => {
            await session.ExecuteAsync($"CREATE TABLE {Zoned} (ID NUMBER(10) PRIMARY KEY, TS TIMESTAMP(9) WITH TIME ZONE, L TIMESTAMP(9) WITH LOCAL TIME ZONE, NOTE VARCHAR2(20))"); created.Add(Zoned);
            await session.ExecuteAsync($"CREATE TABLE {LocalKey} (K TIMESTAMP(9) WITH LOCAL TIME ZONE PRIMARY KEY, NOTE VARCHAR2(20))"); created.Add(LocalKey);
            await Seed(session);
        });

        await check("time zone: wall time, nanoseconds, offset and region read exactly what Oracle reports", async () => {
            var rows = await Read(session, $"SELECT ID, TS, {Truth} FROM {Zoned} WHERE TS IS NOT NULL ORDER BY ID");
            require(rows.Columns[1].TemporalKind == "TIMESTAMP WITH TIME ZONE", "The column was not recognised as zoned.");
            foreach (var row in rows.Rows)
            {
                var cell = (OracleTemporalCell)row[1]!;
                require(cell.Value == (string?)row[2], $"Row {row[0]}: wall time {cell.Value}, Oracle says {row[2]}.");
                require(cell.Offset == (string?)row[3], $"Row {row[0]}: offset {cell.Offset}, Oracle says {row[3]}.");
                var region = (string?)row[4];
                require(region is null || !char.IsLetter(region[0]) ? cell.Region is null : string.Equals(cell.Region, region, StringComparison.OrdinalIgnoreCase),$"Row {row[0]}: region {cell.Region}, Oracle says {region}.");
            }
        });

        await check("time zone: generated literals find exactly their row, including both sides of a clock change", async () => {
            var rows = await Read(session, $"SELECT ID, TS FROM {Zoned} WHERE TS IS NOT NULL ORDER BY ID");
            var cells = rows.Rows.Select(row => (OracleTemporalCell)row[1]!).ToArray();
            var fromInterface = await Node("temporal-literal.mjs", JsonSerializer.Serialize(cells, Wire));
            for (var index = 0; index < cells.Length; index++)
            {
                var id = Convert.ToString(rows.Rows[index][0]);
                foreach (var literal in new[] { cells[index].SqlLiteral(), fromInterface[index].GetProperty("literal").GetString()! })
                {
                    var found = await Read(session, $"SELECT ID FROM {Zoned} WHERE TS = {literal}");
                    require(found.Rows.Count == 1 && Convert.ToString(found.Rows[0][0]) == id, $"{literal} found [{string.Join(",", found.Rows.Select(row => row[0]))}] instead of row {id}.");
                }
            }
        });

        await check("local time zone: the value follows the session zone, names it and refuses an imprecise literal", async () => {
            foreach (var (zone, wall) in new[] { ("+05:00", "2026-06-01T17:00:00.000000000"), ("-02:00", "2026-06-01T10:00:00.000000000") })
            {
                using var other = await Open(zone);
                var rows = await Read(other, $"SELECT L FROM {Zoned} WHERE ID=5");
                var cell = (OracleTemporalCell)rows.Rows[0][0]!;
                require(cell.Value == wall && cell.SessionTimeZone == zone, $"In session {zone}: {cell}.");
                var answer = (await Node("temporal-literal.mjs", JsonSerializer.Serialize(new[] { cell }, Wire)))[0];
                require(answer.TryGetProperty("refused", out _), "The interface generated an imprecise LOCAL TIME ZONE literal.");
                var refused = false;
                try { cell.SqlLiteral(); } catch (InvalidOperationException) { refused = true; }
                require(refused, "The host generated an imprecise LOCAL TIME ZONE literal.");
            }
        });

        await check("time zone: editing another column of the row leaves the zoned values untouched", async () => {
            await Seed(session);
            var before = await Read(session, $"SELECT {Truth}, TO_CHAR(SYS_EXTRACT_UTC(L),'YYYY-MM-DD HH24:MI:SS.FF9') FROM {Zoned} WHERE ID=3");
            var result = await GridDmlBatch.RunAsync(session, await Statements(session, ZonedName, ["ID"], [new { row = 2, column = "NOTE", value = "edited" }]), 30, false, default);
            require((string?)result.Outcomes.Single()["status"] == "applied", "The edit failed: " + result.Outcomes.Single().GetValueOrDefault("error"));
            await session.CommitAsync();
            var after = await Read(session, $"SELECT {Truth}, TO_CHAR(SYS_EXTRACT_UTC(L),'YYYY-MM-DD HH24:MI:SS.FF9') FROM {Zoned} WHERE ID=3");
            require(before.Rows[0].SequenceEqual(after.Rows[0]), "Editing another column changed a zoned value.");
        });

        await check("time zone: a typed offset is stored exactly, whatever the session's zone", async () => {
            foreach (var zone in new[] { "+05:00", "-02:00" })
            {
                using var other = await Open(zone);
                await Seed(other);
                var result = await GridDmlBatch.RunAsync(other, await Statements(other, ZonedName, ["ID"], [new { row = 6, column = "TS", value = "2026-03-04 05:06:07.5+03:00" }, new { row = 6, column = "L", value = "2026-03-04 05:06:07Z" }]), 30, false, default);
                require((string?)result.Outcomes.Single()["status"] == "applied", "The value was refused: " + result.Outcomes.Single().GetValueOrDefault("error"));
                var stored = await Read(other, $"SELECT {Truth}, TO_CHAR(SYS_EXTRACT_UTC(L),'YYYY-MM-DD HH24:MI:SS') FROM {Zoned} WHERE ID=7");
                require(Equals(stored.Rows[0][0], "2026-03-04T05:06:07.500000000") && Equals(stored.Rows[0][1], "+03:00"), $"In session {zone} the value became {stored.Rows[0][0]} {stored.Rows[0][1]}.");
                require(Equals(stored.Rows[0][3], "2026-03-04 05:06:07"), $"In session {zone} the local time zone value became {stored.Rows[0][3]} UTC.");
                await other.RollbackAsync();
            }
        });

        await check("time zone: text without an offset is refused and never takes the session's zone", async () => {
            await Seed(session);
            var result = await GridDmlBatch.RunAsync(session, await Statements(session, ZonedName, ["ID"], [new { row = 6, column = "TS", value = "2026-03-04 05:06:07" }]), 30, false, default);
            require((string?)result.Outcomes.Single()["status"] == "failed" && Convert.ToString(result.Outcomes.Single()["error"])!.Contains("needs its offset"), "Wall time was not refused.");
            require((await Read(session, $"SELECT COUNT(*) FROM {Zoned} WHERE ID=7 AND TS IS NULL")).Rows[0][0] is var left && Convert.ToInt32(left) == 1, "A refused value changed the cell.");
            await session.RollbackAsync();
        });

        await check("time zone: a chosen zoned key finds its row, including each side of a clock change", async () => {
            await Seed(session);
            foreach (var (row, id) in new[] { (0, 1), (2, 3), (3, 4) })
            {
                var result = await GridDmlBatch.RunAsync(session, await Statements(session, ZonedName, ["TS"], [new { row, column = "NOTE", value = "by key" }]), 30, false, default);
                require((string?)result.Outcomes.Single()["status"] == "applied", $"Row {id}: " + result.Outcomes.Single().GetValueOrDefault("error"));
                var changed = await Read(session, $"SELECT ID FROM {Zoned} WHERE NOTE='by key'");
                require(changed.Rows.Count == 1 && Convert.ToInt32(changed.Rows[0][0]) == id, $"The key for row {id} changed [{string.Join(",", changed.Rows.Select(item => item[0]))}].");
                await session.RollbackAsync();
            }
        });

        await check("local time zone: a key shown in the session's zone is refused before anything is sent", async () => {
            await session.ExecuteAsync($"INSERT INTO {LocalKey} (K,NOTE) VALUES (TIMESTAMP '2026-06-01 12:00:00 +00:00','k')");
            await session.CommitAsync();
            string? problem = null;
            try { await Statements(session, LocalKeyName, ["K"], [new { row = 0, column = "NOTE", value = "by local key" }]); }
            catch (InvalidOperationException error) { problem = error.Message; }
            require(problem?.Contains("cannot be identified exactly") == true, "The grid built a statement from an inexact key: " + problem);
            require(!session.HasPendingTransaction, "A refused edit opened a transaction.");
        });
    }
}
