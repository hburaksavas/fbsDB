using FbsDb.Services;

// FI-031: line-level profiling with DBMS_PROFILER against real Oracle.
// The profiler writes in autonomous transactions: the session's open work and
// the profiled code's changes stay uncommitted, the report has the expected
// lines, and the run is removed from the profiler tables.
sealed class ProfileChecks(OracleSessionService a, OracleSessionService b, Func<string, Func<Task>, Task> check, Action<bool, string> require)
{
    private readonly string _suffix = Guid.NewGuid().ToString("N")[..8].ToUpperInvariant();
    private string Package => $"FBSQA_PRF_P_{_suffix}";
    private string Table => $"FBSQA_PRF_T_{_suffix}";

    public async Task RunAsync()
    {
        IReadOnlyList<string> created = [];
        try
        {
            await a.ExecuteAsync($"CREATE TABLE {Table} (n NUMBER)");
            await a.ExecuteAsync($"CREATE OR REPLACE PACKAGE {Package} IS PROCEDURE run(p_n NUMBER); END;");
            await a.ExecuteAsync($"""
                CREATE OR REPLACE PACKAGE BODY {Package} IS
                  PROCEDURE run(p_n NUMBER) IS
                    v NUMBER := 0;
                  BEGIN
                    FOR i IN 1..p_n LOOP
                      v := v + SQRT(i);
                    END LOOP;
                    INSERT INTO {Table} VALUES (v);
                  END;
                END;
                """);
            await check("profiler: missing PLSQL_PROFILER tables are found and created", async () =>
            {
                var state = await a.ProfilerStateAsync();
                if (!state.TablesReady) { created = state.Missing; await a.CreateProfilerTablesAsync(); }
                require((await a.ProfilerStateAsync()).TablesReady, "The profiler tables are still missing.");
            });
            await check("profiler: line times and counts of a package body, then the run is deleted", async () =>
            {
                // Open work before profiling must stay uncommitted.
                await a.ExecuteAsync($"INSERT INTO {Table} VALUES (-1)");
                var runId = await a.StartProfilerAsync();
                await a.ExecuteAsync($"BEGIN {Package}.run(20000); END;");
                var report = await a.FinishProfilerAsync();
                require(report.RunId == runId && report.TotalNs > 0, "The report has no run time.");
                var unit = report.Units.SingleOrDefault(u => u.Name == Package && u.Type == "PACKAGE BODY");
                require(unit is not null, "The package body is missing: " + string.Join(", ", report.Units.Select(u => $"{u.Name}:{u.Type}")));
                var loop = unit!.Lines.SingleOrDefault(l => l.Line == 6);
                require(loop is { Occurrences: 20000 } && loop.TotalNs > 0, $"Line 6 should run 20000 times: {loop?.Occurrences}");
                require(unit.Lines.Any(l => l.Line == 8 && l.Occurrences == 1), "The INSERT line is missing.");
                require(unit.TotalNs == unit.Lines.Sum(l => l.TotalNs), "The unit total is not the sum of its lines.");
                require(a.HasPendingTransaction, "The session lost its open transaction.");
                require(Convert.ToInt32((await b.ExecuteAsync($"SELECT COUNT(*) FROM {Table}")).Rows[0][0]) == 0, "Profiling committed the session's work.");
                await a.RollbackAsync();
                require(Convert.ToInt32((await a.ExecuteAsync($"SELECT COUNT(*) FROM {Table}")).Rows[0][0]) == 0, "Rollback did not undo the profiled code's insert.");
                require(Convert.ToInt32((await b.ExecuteAsync($"SELECT COUNT(*) FROM plsql_profiler_runs WHERE runid = {runId}")).Rows[0][0]) == 0, "The profiler run was left in the tables.");
                require(Convert.ToInt32((await a.ExecuteAsync("SELECT 9 FROM dual")).Rows[0][0]) == 9, "The session did not work after profiling.");
            });
        }
        finally
        {
            try { if (a.HasPendingTransaction) await a.RollbackAsync(); } catch (Exception error) { Console.Error.WriteLine("rollback: " + error.Message); }
            var drops = new List<string> { $"DROP PACKAGE {Package}", $"DROP TABLE {Table}" };
            // Leave the schema as it was found: only what this run created is dropped.
            foreach (var name in new[] { "PLSQL_PROFILER_DATA", "PLSQL_PROFILER_UNITS", "PLSQL_PROFILER_RUNS" }) if (created.Contains(name)) drops.Add($"DROP TABLE {name}");
            if (created.Contains("PLSQL_PROFILER_RUNNUMBER")) drops.Add("DROP SEQUENCE PLSQL_PROFILER_RUNNUMBER");
            foreach (var drop in drops) try { await a.ExecuteAsync(drop); } catch (Exception error) { Console.Error.WriteLine($"{drop}: {error.Message}"); }
        }
    }
}
