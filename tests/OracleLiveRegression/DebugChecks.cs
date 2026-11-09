using FbsDb.Services;

// FI-007: PL/SQL debugging with DBMS_DEBUG against real Oracle. Session a is
// the debugged tab; it runs an ordinary call while the debugger drives it.
// Needs DEBUG CONNECT SESSION (scripts/setup-fbsqa-fixtures.ps1).
sealed class DebugChecks(OracleSessionService a, string user, Func<string, Func<Task>, Task> check, Action<bool, string> require, Action<string, string> skipped)
{
    private readonly string _suffix = Guid.NewGuid().ToString("N")[..8].ToUpperInvariant();
    private string Outer => $"FBSQA_DBG_O_{_suffix}";
    private string Inner => $"FBSQA_DBG_I_{_suffix}";
    private string Package => $"FBSQA_DBG_P_{_suffix}";

    public async Task RunAsync()
    {
        var privileges = await a.ExecuteAsync("SELECT COUNT(*) FROM session_privs WHERE privilege = 'DEBUG CONNECT SESSION'");
        if (Convert.ToInt32(privileges.Rows[0][0]) == 0) { skipped("PL/SQL debugger", "DEBUG CONNECT SESSION is not granted; run scripts/setup-fbsqa-fixtures.ps1."); return; }
        try
        {
            await a.ExecuteAsync($"""
                CREATE OR REPLACE PROCEDURE {Inner}(p_n IN NUMBER, p_out OUT NUMBER) IS
                  v_double NUMBER;
                BEGIN
                  v_double := p_n * 2;
                  p_out := v_double + 1;
                END;
                """);
            await a.ExecuteAsync($"""
                CREATE OR REPLACE PACKAGE {Package} IS
                  PROCEDURE run(p_label VARCHAR2);
                END;
                """);
            await a.ExecuteAsync($"""
                CREATE OR REPLACE PACKAGE BODY {Package} IS
                  PROCEDURE run(p_label VARCHAR2) IS
                    v_total NUMBER := 0;
                    v_name VARCHAR2(30) := p_label;
                  BEGIN
                    FOR i IN 1..3 LOOP
                      v_total := v_total + i;
                    END LOOP;
                    v_name := 'after loop';
                    {Inner}(v_total, v_total);
                    v_name := 'done';
                  END;
                END;
                """);
            await check("debugger: units without debug information are found and compiled for debugging", async () =>
            {
                var objects = new[] { ("", Package, "PACKAGE BODY"), (user, Inner, "PROCEDURE"), (user, "FBSQA_DBG_MISSING", "PROCEDURE") };
                var before = await a.DebugObjectStatesAsync(objects);
                require(before[0].Owner == user && before[0].Exists && !before[0].DebugInfo, "An empty owner did not resolve to the current schema, or the body already had debug information.");
                require(!before[2].Exists, "A missing unit was reported as existing.");
                await a.CompileForDebugAsync([(user, Package, "PACKAGE BODY"), (user, Inner, "PROCEDURE")]);
                var after = await a.DebugObjectStatesAsync(objects);
                require(after[0].DebugInfo && after[1].DebugInfo, "COMPILE DEBUG did not add debug information.");
            });
            await check("debugger: breakpoint, values, step over/into/out, call stack and the end of the call", async () =>
            {
                var sessionId = await a.EnableDebugAsync();
                await using var debugger = await a.AttachDebuggerAsync(sessionId, CancellationToken.None);
                var call = Task.Run(() => a.ExecuteAsync($"BEGIN {Package}.run('first'); END;"));
                await using var guard = new AbortOnFailure(a, debugger, call);
                using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(60));
                await debugger.WaitForStartAsync(timeout.Token);
                var set = await debugger.SetBreakpointsAsync([new DebugBreakpoint(user, Package, "PACKAGE BODY", 9), new DebugBreakpoint(user, Package, "PACKAGE BODY", 1)], timeout.Token);
                require(set[0].Set, "The breakpoint on an executable line was refused: " + set[0].Message);
                var stop = await debugger.ContinueAsync("continue", timeout.Token);
                require(!stop.Terminated && stop.Name == Package && stop.Type == "PACKAGE BODY" && stop.Line == 9, $"Paused at {stop.Name} {stop.Type} line {stop.Line}.");
                var values = await debugger.ValuesAsync(stop.Depth, ["V_TOTAL", "V_NAME", "P_LABEL", "NOT_HERE"], timeout.Token);
                require(values.Any(v => v.Name == "V_TOTAL" && v.Value == "6") && values.Any(v => v.Name == "V_NAME" && v.Value == "first") && values.All(v => v.Name != "NOT_HERE"), "Wrong values: " + string.Join(", ", values.Select(v => $"{v.Name}={v.Value}/{v.State}")));
                stop = await debugger.ContinueAsync("over", timeout.Token);
                require(stop.Line == 10, $"Step over stopped at line {stop.Line}.");
                stop = await debugger.ContinueAsync("into", timeout.Token);
                require(stop.Name == Inner && stop.Type == "PROCEDURE", $"Step into stopped in {stop.Name}.");
                require(stop.Frames.Count >= 3 && stop.Frames[0].Name == Inner && stop.Frames[1].Name == Package && stop.Frames[0].Frame == stop.Depth, "The call stack is wrong: " + string.Join(" < ", stop.Frames.Select(f => $"{f.Frame}:{f.Name}@{f.Line}")));
                var caller = await debugger.ValuesAsync(stop.Frames[1].Frame, ["V_TOTAL"], timeout.Token);
                require(caller is [{ Value: "6" }], "The caller's frame was not readable by its stack position.");
                var inner = await debugger.ValuesAsync(stop.Depth, ["V_DOUBLE", "P_N"], timeout.Token);
                require(inner.Any(v => v.Name == "V_DOUBLE" && v.State == "null") && inner.Any(v => v.Name == "P_N" && v.Value == "6"), "NULL and parameter values are wrong.");
                require((await debugger.SourceAsync(user, Inner, "PROCEDURE", timeout.Token)).Contains("v_double := p_n * 2"), "The unit source was not read through the debugger.");
                stop = await debugger.ContinueAsync("out", timeout.Token);
                require(stop.Name == Package && stop.Line == 11, $"Step out stopped in {stop.Name} line {stop.Line}.");
                stop = await debugger.ContinueAsync("continue", timeout.Token);
                require(stop.Terminated, "The call did not end.");
                // The session's own follow-up calls (DBMS_OUTPUT, transaction state) must not wait for the debugger.
                await a.FinishDebugAsync(debugger).WaitAsync(TimeSpan.FromSeconds(30));
                await call.WaitAsync(TimeSpan.FromSeconds(20));
                guard.Done();
                require(Convert.ToInt32((await a.ExecuteAsync("SELECT 7 FROM dual")).Rows[0][0]) == 7, "The session did not work normally after debugging.");
            });
            await check("debugger: aborting a paused call ends it with an error and leaves the session usable", async () =>
            {
                var sessionId = await a.EnableDebugAsync();
                await using var debugger = await a.AttachDebuggerAsync(sessionId, CancellationToken.None);
                var call = Task.Run(() => a.ExecuteAsync($"BEGIN {Package}.run('second'); END;"));
                await using var guard = new AbortOnFailure(a, debugger, call);
                using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(60));
                await debugger.WaitForStartAsync(timeout.Token);
                var stop = await debugger.ContinueAsync("into", timeout.Token);
                require(!stop.Terminated, "Step into from the start did not pause.");
                stop = await debugger.ContinueAsync("abort", timeout.Token);
                require(stop.Terminated, "Abort did not end the call.");
                await a.FinishDebugAsync(debugger).WaitAsync(TimeSpan.FromSeconds(30));
                var failed = false;
                try { await call.WaitAsync(TimeSpan.FromSeconds(20)); } catch (Exception) { failed = true; }
                guard.Done();
                require(failed, "An aborted call reported success.");
                require(Convert.ToInt32((await a.ExecuteAsync("SELECT 8 FROM dual")).Rows[0][0]) == 8, "The session did not work after an abort.");
            });
        }
        finally
        {
            // A debugged PL/SQL block leaves the session's transaction open, as Run does; DDL needs it closed.
            try { if (a.HasPendingTransaction) await a.RollbackAsync(); } catch (Exception error) { Console.Error.WriteLine("rollback: " + error.Message); }
            foreach (var drop in new[] { $"DROP PACKAGE {Package}", $"DROP PROCEDURE {Inner}" })
                try { await a.ExecuteAsync(drop); } catch (Exception error) { Console.Error.WriteLine($"{drop}: {error.Message}"); }
        }
    }
}

// A failed assertion leaves the target paused in the debugger; abort its call so clean-up can use the session.
sealed class AbortOnFailure(OracleSessionService session, PlsqlDebugger debugger, Task call) : IAsyncDisposable
{
    private bool _done;
    public void Done() => _done = true;
    public async ValueTask DisposeAsync()
    {
        if (_done) return;
        try { using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(20)); await debugger.ContinueAsync("abort", timeout.Token); } catch (Exception) { }
        try { await session.FinishDebugAsync(debugger).WaitAsync(TimeSpan.FromSeconds(30)); } catch (Exception) { }
        try { await call.WaitAsync(TimeSpan.FromSeconds(20)); } catch (Exception) { }
    }
}
