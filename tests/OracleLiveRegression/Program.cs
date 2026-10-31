using System.Diagnostics;
using System.Text.Json;
using FbsDb.Services;
using FbsDb.Bridge;
using Oracle.ManagedDataAccess.Client;

var profileId = args.FirstOrDefault() ?? "FBSDB_LOCAL";
var reportPath = Path.GetFullPath(args.ElementAtOrDefault(1) ?? Path.Combine(".artifacts", "oracle-live", DateTime.UtcNow.ToString("yyyyMMdd-HHmmss") + ".json"));
Directory.CreateDirectory(Path.GetDirectoryName(reportPath)!);
var checks = new List<object>();
var startedAt = DateTimeOffset.UtcNow;
using var registry = new TabSessionRegistry();
var a = registry.Get("live-a").Oracle;
var b = registry.Get("live-b").Oracle;
string? table = null;
bool created = false;
Exception? failure = null;
void Require(bool condition, string message) { if (!condition) throw new InvalidOperationException(message); }
async Task Check(string name, Func<Task> action)
{
    var timer = Stopwatch.StartNew();
    try { await action(); checks.Add(new { name, status = "passed", elapsedMs = timer.ElapsedMilliseconds }); Console.WriteLine("PASS " + name); }
    catch (Exception error) { checks.Add(new { name, status = "failed", elapsedMs = timer.ElapsedMilliseconds, error = error.Message }); throw; }
}
async Task Reject<T>(Func<Task> operation) where T : Exception
{
    var task = operation();
    try { await task.WaitAsync(TimeSpan.FromSeconds(5)); }
    catch (T) when (task.IsCompleted) { return; }
    throw new Exception($"Expected {typeof(T).Name}.");
}
async Task Cancelled(Task operation)
{
    try { await operation.WaitAsync(TimeSpan.FromSeconds(5)); }
    catch (OperationCanceledException) { return; }
    catch (OracleException error) when (error.Number == 1013) { return; }
    throw new Exception("Oracle operation did not finish as cancelled.");
}
async Task<int> Count(OracleSessionService session) => Convert.ToInt32((await session.ExecuteAsync($"SELECT COUNT(*) FROM {table}")).Rows[0][0]);
Task<SqlExecutionResult> Sleep(OracleSessionService session, TaskCompletionSource ready) => session.ExecuteAsync(
    "BEGIN DBMS_SESSION.SLEEP(10); END;", timeoutSeconds: 20,
    progress: new InlineProgress(stage => { if (stage == "Executing statement") ready.TrySetResult(); }));

try
{
    var profile = (await new TnsProfileService().GetProfilesAsync()).Single(item => item.Id.Equals(profileId, StringComparison.OrdinalIgnoreCase));
    Require(profile.Host is "127.0.0.1" or "localhost" or "::1", "This regression suite is restricted to a local test database.");
    await Check("two tab sessions connect using existing saved credentials", async () => {
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(25));
        await a.ConnectAsync(profile, "", "", null, deadline.Token);
        await b.ConnectAsync(profile, "", "", null, deadline.Token);
        Require(a.IsConnected && b.IsConnected && !a.HasPendingTransaction && !b.HasPendingTransaction, "Unexpected initial session state.");
    });
    string user = "";
    await Check("physical Oracle sessions are distinct", async () => {
        const string identity = "SELECT SYS_CONTEXT('USERENV','SESSION_USER'), SYS_CONTEXT('USERENV','SID') FROM dual";
        var first = await a.ExecuteAsync(identity); var second = await b.ExecuteAsync(identity);
        user = Convert.ToString(first.Rows[0][0])!;
        Require(!Equals(first.Rows[0][1], second.Rows[0][1]), "Both tabs share the same physical Oracle session.");
    });
    string Identifier(string value) => "\"" + value.Replace("\"", "\"\"") + "\"";
    var name = "FBSQA_" + Guid.NewGuid().ToString("N")[..12].ToUpperInvariant();
    table = Identifier(user) + "." + Identifier(name);
    await Check("create an isolated temporary fixture without touching user tables", async () => {
        await a.ExecuteAsync($"CREATE GLOBAL TEMPORARY TABLE {table} (N NUMBER) ON COMMIT DELETE ROWS"); created = true;
    });
    await Check("live schema, table and column metadata preserve identity and transaction state", async () => {
        var schema = await a.LoadSchemaAsync();
        Require(schema.Objects.Any(item => item.Owner == user && item.Name == name), "Temporary fixture missing from schema metadata.");
        var details = await a.LoadTableDetailsAsync(name, user, "TABLE");
        var completion = await a.LoadCompletionMetadataAsync(user, name, "TABLE", CancellationToken.None);
        var definition = await a.GetColumnDefinitionAsync(user, name, "N");
        Require(details.Columns.Any(column => column.Name == "N") && completion.Columns.Any(column => column.Name == "N") && definition?.Name == "N", "Metadata lookup lost the fixture column.");
        Require(!a.HasPendingTransaction, "Metadata created a manual transaction.");
    });
    await Check("Commit in A and Rollback in B affect only their own real transactions", async () => {
        await a.ExecuteAsync($"INSERT INTO {table} (N) VALUES (1)");
        await b.ExecuteAsync($"INSERT INTO {table} (N) VALUES (2)");
        Require(a.HasPendingTransaction && b.HasPendingTransaction && await Count(a) == 1 && await Count(b) == 1, "Independent transaction setup failed.");
        await a.CommitAsync();
        Require(!a.HasPendingTransaction && b.HasPendingTransaction, "Commit leaked into another tab.");
        Require(await Count(a) == 0 && await Count(b) == 1, "Oracle did not isolate commit boundaries (temporary rows clear on commit).");
        await Reject<InvalidOperationException>(() => registry.CloseAsync("live-b"));
        Require(registry.Sessions.Count() == 2 && b.IsConnected, "Refused close removed the pending tab.");
        await b.RollbackAsync();
        Require(!b.HasPendingTransaction && await Count(b) == 0 && a.IsConnected, "Rollback leaked or left pending data.");
    });
    await Check("paged and parked cursors retain every row across independent tabs", async () => {
        var first = await a.ExecuteAsync("SELECT LEVEL AS N FROM dual CONNECT BY LEVEL <= 1205", rowLimit: 500);
        var other = await b.ExecuteAsync("SELECT LEVEL AS N FROM dual CONNECT BY LEVEL <= 305", rowLimit: 100);
        await a.ExecuteAsync("SELECT 42 FROM dual");
        var second = await a.FetchNextPageAsync(first.ResultId!, 500);
        var last = await a.FetchNextPageAsync(first.ResultId!, 500);
        Require(first.Rows.Concat(second.Rows).Concat(last.Rows).Select(row => Convert.ToInt32(row[0])).SequenceEqual(Enumerable.Range(1, 1205)), "Paging skipped or duplicated rows.");
        Require(second.Offset == 500 && last.Offset == 1000 && !last.HasMore, "Incorrect page boundaries.");
        var nextOther = await b.FetchNextPageAsync(other.ResultId!, 100);
        Require(nextOther.Offset == 100 && Convert.ToInt32(nextOther.Rows[0][0]) == 101, "A paging changed B's cursor.");
        await b.CloseResultAsync(other.ResultId!);
        await Reject<InvalidOperationException>(() => b.FetchNextPageAsync(other.ResultId!, 100));
    });
    await Check("manual cancellation stops A while B remains usable", async () => {
        var ready = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var running = Sleep(a, ready); await ready.Task.WaitAsync(TimeSpan.FromSeconds(5));
        Require(!b.CancelCurrentOperation(), "Idle B reported an active operation.");
        Require(Convert.ToInt32((await b.ExecuteAsync("SELECT 42 FROM dual")).Rows[0][0]) == 42 && !running.IsCompleted, "B blocked behind A's session gate.");
        Require(a.CancelCurrentOperation(), "A cancellation missed the active operation.");
        await Cancelled(running); await a.RollbackAsync();
        Require(Convert.ToInt32((await a.ExecuteAsync("SELECT 43 FROM dual")).Rows[0][0]) == 43, "Cancelled session is unusable.");
    });
    await Check("queued metadata cancellation bypasses the busy session gate", async () => {
        Require(!NativeBridgeContract.RequiresSessionResume("schema.cancel") && !NativeBridgeContract.RequiresSessionResume("completion.cancel"), "Cancellation routing waits for the session gate.");
        var ready = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var running = Sleep(a, ready); await ready.Task.WaitAsync(TimeSpan.FromSeconds(5));
        using var cancellation = new CancellationTokenSource();
        var schema = a.LoadSchemaAsync(cancellation.Token);
        var completion = a.LoadCompletionMetadataAsync(user, name, "TABLE", cancellation.Token);
        Require(!schema.IsCompleted && !completion.IsCompleted, "Metadata was not queued behind the executing statement.");
        cancellation.Cancel(); await Cancelled(schema); await Cancelled(completion);
        Require(!running.IsCompleted, "Cancelling metadata also stopped the unrelated SQL operation.");
        a.CancelCurrentOperation(); await Cancelled(running); await a.RollbackAsync();
        Require((await a.LoadTableDetailsAsync(name, user, "TABLE")).Columns.Count > 0, "Cancelled metadata poisoned later lookups.");
    });
    await Check("configured query timeout cancels Oracle and preserves the session", async () => {
        var timer = Stopwatch.StartNew();
        await Reject<TimeoutException>(() => a.ExecuteAsync("BEGIN DBMS_SESSION.SLEEP(10); END;", timeoutSeconds: 1));
        Require(timer.Elapsed < TimeSpan.FromSeconds(7), "Timeout did not stop the provider promptly.");
        await a.RollbackAsync();
        Require(Convert.ToInt32((await a.ExecuteAsync("SELECT 44 FROM dual")).Rows[0][0]) == 44, "Timed-out session is unusable.");
    });
    await Check("pending DML blocks successful and failing DDL without implicit commit", async () => {
        await a.ExecuteAsync($"INSERT INTO {table} VALUES (97531)");
        await Reject<InvalidOperationException>(() => a.ExecuteAsync($"ALTER TABLE {table} ADD (BLOCKED_N NUMBER)"));
        await Reject<InvalidOperationException>(() => a.ExecuteAsync($"ALTER TABLE {table} THIS_IS_INVALID_DDL"));
        Require(a.HasPendingTransaction && await Count(a) == 1, "DDL guard changed pending data.");
        await a.RollbackAsync();
        Require(await Count(a) == 0, "Blocked DDL implicitly committed data.");
        await Reject<OracleException>(() => a.ExecuteAsync($"ALTER TABLE {table} THIS_IS_INVALID_DDL"));
        Require(!a.HasPendingTransaction, "Failed DDL invented a pending transaction.");
    });
    await Check("pending transactions prevent idle suspension and disconnect", async () => {
        await a.BeginReadOnlyAnalysisAsync();
        Require(!await a.SuspendIfIdleAsync(TimeSpan.Zero), "Idle suspension lost a pending transaction.");
        await Reject<InvalidOperationException>(() => a.DisconnectAsync(false));
        Require(a.IsConnected && a.HasPendingTransaction, "Rejected disconnect altered the pending session.");
        await a.RollbackAsync();
    });
    await Check("explicit reconnect and idle resume reapply NLS and invalidate old cursors", async () => {
        await b.DisconnectAsync(false);
        var configured = profile with { Nls = new Dictionary<string, string>(profile.Nls) { ["NLS_DATE_FORMAT"] = "YYYY-MM-DD" } };
        await b.ConnectAsync(configured, "", "", null);
        Require((await b.ReadNlsAsync()).Effective["NLS_DATE_FORMAT"] == "YYYY-MM-DD", "Reconnect did not apply session preferences.");
        var cursor = await b.ExecuteAsync("SELECT LEVEL FROM dual CONNECT BY LEVEL <= 205", rowLimit: 100);
        Require(await b.SuspendIfIdleAsync(TimeSpan.Zero) && b.IsInactive && !b.IsConnected, "Clean session did not suspend.");
        await b.ResumeIfInactiveAsync();
        Require(b.IsConnected && !b.IsInactive && (await b.ReadNlsAsync()).Effective["NLS_DATE_FORMAT"] == "YYYY-MM-DD", "Idle resume lost the session configuration.");
        await Reject<InvalidOperationException>(() => b.FetchNextPageAsync(cursor.ResultId!, 100));
        Require(Convert.ToInt32((await b.ExecuteAsync("SELECT 45 FROM dual")).Rows[0][0]) == 45, "Resumed session cannot execute queries.");
    });
}
catch (Exception error) { failure = error; Console.Error.WriteLine(error.Message); }
finally
{
    foreach (var session in new[] { a, b })
    {
        session.CancelCurrentOperation();
        try { await session.RollbackAsync().WaitAsync(TimeSpan.FromSeconds(25)); }
        catch (Exception error) { failure ??= error; checks.Add(new { name = "rollback cleanup", status = "failed", error = error.Message }); }
    }
    if (created)
    {
        try { await a.ExecuteAsync($"DROP TABLE {table}"); checks.Add(new { name = "temporary table removed", status = "passed" }); Console.WriteLine("PASS temporary table removed"); }
        catch (Exception error) { failure ??= error; checks.Add(new { name = "temporary table removed", status = "failed", error = error.Message }); }
    }
    await File.WriteAllTextAsync(reportPath, JsonSerializer.Serialize(new {
        startedAt, completedAt = DateTimeOffset.UtcNow, profileId, status = failure is null ? "passed" : "failed",
        scope = "Live Oracle services; temporary-table DML only; queued metadata cancellation; no user-table updates or saved-credential changes.",
        checks, error = failure?.Message
    }, new JsonSerializerOptions { WriteIndented = true }));
    Console.WriteLine("Report: " + reportPath);
}
if (failure is not null) Environment.ExitCode = 1;

sealed class InlineProgress(Action<string> action) : IProgress<string>
{
    public void Report(string value) => action(value);
}
