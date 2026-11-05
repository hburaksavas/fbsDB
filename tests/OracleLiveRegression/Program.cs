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
string? sourceProcedure = null;
string? sourcePackage = null;
string? sourcePackageName = null;
Exception? failure = null;
var gridTables = new List<string>();
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
    var profile = (await new TnsProfileService().GetProfilesAsync()).Single(item => item.Id.Equals(profileId, StringComparison.OrdinalIgnoreCase) || item.Name.Equals(profileId, StringComparison.OrdinalIgnoreCase));
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
    await Check("typed OUT and IN OUT binds preserve NUMBER precision and Oracle date/timestamp components", async () => {
        const string precise = "123456789012345678901234567890.12345678";
        var result = await a.ExecuteAsync($"BEGIN :n := {precise}; :inout_n := :inout_n + 0; :label := :label || '-output'; :d := TO_DATE('2026-11-01 12:13:14','YYYY-MM-DD HH24:MI:SS'); :t := TIMESTAMP '2026-11-01 12:13:14.123456789'; :empty := NULL; END;", [
            new("n", "NUMBER", null, "OUT"), new("inout_n", "NUMBER", precise, "IN OUT"), new("label", "VARCHAR2", "input", "IN OUT"), new("d", "DATE", null, "OUT"), new("t", "TIMESTAMP", null, "OUT"), new("empty", "VARCHAR2", null, "OUT")]);
        var output = result.OutParameters.ToDictionary(parameter => parameter.Name, parameter => parameter.Value);
        Require(Convert.ToString(output["n"]) == precise && Convert.ToString(output["inout_n"]) == precise && Convert.ToString(output["label"]) == "input-output" && output["empty"] is null, "Output bind values were rounded, lost or mistyped.");
        var wire = JsonSerializer.SerializeToElement(new { type = "sql.result", columns = result.Columns, rows = result.Rows, outParameters = result.OutParameters }, NativeBridgeContract.JsonOptions);
        NativeBridgeContract.ValidateReply(wire);
        Require(output["d"] is OracleTemporalCell { Value: "2026-11-01T12:13:14" } && output["t"] is OracleTemporalCell { Value: "2026-11-01T12:13:14.123456789" }, "Output temporal values lost wall-clock components or nanoseconds.");
        Require(!a.HasPendingTransaction, "A computation-only call left a pending transaction.");
    });
    string Identifier(string value) => "\"" + value.Replace("\"", "\"\"") + "\"";
    var name = "FBSQA_" + Guid.NewGuid().ToString("N")[..12].ToUpperInvariant();
    table = Identifier(user) + "." + Identifier(name);
    await Check("create an isolated temporary fixture without touching user tables", async () => {
        await a.ExecuteAsync($"CREATE GLOBAL TEMPORARY TABLE {table} (N NUMBER) ON COMMIT DELETE ROWS"); created = true;
    });
    var sourceProcedureName = "FBSQA_SRC_" + Guid.NewGuid().ToString("N")[..12].ToUpperInvariant();
    sourceProcedure = Identifier(user) + "." + Identifier(sourceProcedureName);
    var sourceSql = $"CREATE OR REPLACE PROCEDURE {sourceProcedure} AS BEGIN NULL; END;";
    await Check("source review creates an isolated procedure only after explicit version-checked execution", async () => {
        var review = await a.ReviewSourceAsync(sourceSql);
        Require(!review.Snapshot.Exists, "A unique test procedure already exists.");
        await a.ExecuteAsync(sourceSql, sourceReviewId: review.ReviewId);
        var compilation = await a.LoadCompilationDiagnosticsAsync(sourceSql);
        Require(compilation is not null && compilation.Errors.All(error => error.Attribute != "ERROR") && compilation.Snapshot?.Exists == true, "Reviewed source compilation or version readback failed.");
        await Reject<InvalidOperationException>(() => a.ExecuteAsync(sourceSql, sourceReviewId: review.ReviewId));
    });
    await Check("source review rejects changed editor SQL and external database source updates", async () => {
        var review = await a.ReviewSourceAsync(sourceSql);
        await Reject<InvalidOperationException>(() => a.ExecuteAsync(sourceSql.Replace("NULL;", "NULL; NULL;"), sourceReviewId: review.ReviewId));
        review = await a.ReviewSourceAsync(sourceSql);
        var external = sourceSql.Replace("NULL;", "NULL; NULL;");
        await b.ExecuteAsync(external);
        await Reject<OracleSourceChangedException>(() => a.ExecuteAsync(sourceSql, sourceReviewId: review.ReviewId));
        var current = await a.ReviewSourceAsync(sourceSql);
        Require(current.Snapshot.Source.Contains("NULL; NULL;"), "A rejected compile overwrote the external source.");
    });
    await Check("source compilation never commits pending unrelated session DML", async () => {
        var review = await a.ReviewSourceAsync(sourceSql);
        await a.ExecuteAsync($"INSERT INTO {table} VALUES (101)");
        await Reject<InvalidOperationException>(() => a.ExecuteAsync(sourceSql, sourceReviewId: review.ReviewId));
        Require(a.HasPendingTransaction && await Count(a) == 1, "Rejected compilation disturbed pending DML.");
        await a.RollbackAsync();
        await a.ExecuteAsync(sourceSql, sourceReviewId: review.ReviewId);
        var invalid = sourceSql.Replace("NULL;", "fbsqa_missing_call;");
        review = await a.ReviewSourceAsync(invalid);
        await a.ExecuteAsync(invalid, sourceReviewId: review.ReviewId);
        var diagnostics = await a.LoadCompilationDiagnosticsAsync(invalid);
        Require(diagnostics?.Errors.Any(error => error.Attribute == "ERROR") == true && diagnostics.Source.Contains("fbsqa_missing_call"), "Compilation errors were not associated with the submitted source.");
    });
    sourcePackageName = "FBSQA_PKG_" + Guid.NewGuid().ToString("N")[..12].ToUpperInvariant();
    sourcePackage = Identifier(user) + "." + Identifier(sourcePackageName);
    await Check("package specification and body compile as independently versioned sources", async () => {
        var specification = $"CREATE OR REPLACE PACKAGE {sourcePackage} AS PROCEDURE run(p NUMBER); PROCEDURE echo_value(p_value IN NUMBER,p_result OUT NUMBER,p_label IN OUT VARCHAR2); FUNCTION twice(p_value NUMBER) RETURN NUMBER; FUNCTION twice(p_value VARCHAR2) RETURN VARCHAR2; END;";
        var body = $"CREATE OR REPLACE PACKAGE BODY {sourcePackage} AS PROCEDURE run(p NUMBER) IS BEGIN NULL; END; PROCEDURE echo_value(p_value IN NUMBER,p_result OUT NUMBER,p_label IN OUT VARCHAR2) IS BEGIN p_result:=p_value*2;p_label:=p_label||'-output';END; FUNCTION twice(p_value NUMBER) RETURN NUMBER IS BEGIN RETURN p_value*2;END; FUNCTION twice(p_value VARCHAR2) RETURN VARCHAR2 IS BEGIN RETURN p_value||p_value;END; END;";
        var review = await a.ReviewSourceAsync(specification);
        await a.ExecuteAsync(specification, sourceReviewId: review.ReviewId);
        var specReport = await a.LoadCompilationDiagnosticsAsync(specification);
        review = await b.ReviewSourceAsync(body);
        Require(!review.Snapshot.Exists && review.Snapshot.Type == "PACKAGE BODY", "Body identity was confused with the specification.");
        await b.ExecuteAsync(body, sourceReviewId: review.ReviewId);
        var bodyReport = await b.LoadCompilationDiagnosticsAsync(body);
        Require(specReport?.Snapshot is not null && bodyReport?.Snapshot is not null && specReport.Snapshot.Version != bodyReport.Snapshot.Version && bodyReport.Errors.All(error => error.Attribute != "ERROR"), "Package part revisions or body diagnostics were not independent.");
    });
    await Check("structured procedure/function calls repeat with typed overloads and independent OUT values", async () => {
        var configuration = new RoutineRunConfiguration(1, "", "Echo", user, sourcePackageName!, "ECHO_VALUE", "PROCEDURE", "", [new("P_VALUE", "NUMBER", "NUMBER", "IN"),new("P_RESULT", "NUMBER", "NUMBER", "OUT"),new("P_LABEL", "VARCHAR2", "VARCHAR2", "IN OUT")]);
        foreach (var value in new[] { "41.25", "2" })
        {
            var result = await a.ExecuteAsync(RunConfigurationService.BuildSql(configuration), [new("arg_0","NUMBER",value),new("arg_1","NUMBER",null,"OUT"),new("arg_2","VARCHAR2","call","IN OUT")]);
            var output = result.OutParameters.ToDictionary(parameter => parameter.Name, parameter => parameter.Value);
            Require(decimal.Parse(Convert.ToString(output["arg_1"])!,System.Globalization.CultureInfo.InvariantCulture) == decimal.Parse(value,System.Globalization.CultureInfo.InvariantCulture)*2 && Convert.ToString(output["arg_2"]) == "call-output", "A repeated call reused or lost its parameter values.");
        }
        foreach (var type in new[] { "NUMBER", "VARCHAR2" })
        {
            var function = new RoutineRunConfiguration(1,"","Twice",user,sourcePackageName!,"TWICE","FUNCTION",type,[new("P_VALUE",type,type,"IN")]);
            var result = await a.ExecuteAsync(RunConfigurationService.BuildSql(function),[new("arg_0",type,"3"),new("run_result",type,null,"OUT")]);
            Require(Convert.ToString(result.OutParameters.Single().Value) == (type=="NUMBER"?"6":"33"), "Call binding selected the wrong overload or return type.");
        }
    });
    await Check("runtime stack source resolves package body and standalone routine without executing source", async () => {
        var body = await a.LoadCompletionDefinitionAsync(user, sourcePackageName!, "PLSQL FRAME", false, CancellationToken.None);
        Require(body.Type == "PACKAGE BODY" && body.Text.Contains("echo_value"), "Runtime stack navigation did not resolve the package body.");
        var failureSql = $"CREATE OR REPLACE PROCEDURE {sourceProcedure} AS BEGIN raise_application_error(-20001,'FBSQA stack fixture'); END;";
        var review = await a.ReviewSourceAsync(failureSql);
        await a.ExecuteAsync(failureSql, sourceReviewId: review.ReviewId);
        try { await a.ExecuteAsync($"BEGIN {sourceProcedure}; END;"); throw new Exception("Expected fixture runtime failure."); }
        catch (Oracle.ManagedDataAccess.Client.OracleException error) { Require(error.Message.Contains("ORA-06512") && error.Message.Contains(sourceProcedureName), "Runtime failure lost its named source frame."); }
        var pendingBeforeLookup = a.HasPendingTransaction;
        var routine = await a.LoadCompletionDefinitionAsync(user, sourceProcedureName, "PLSQL FRAME", false, CancellationToken.None);
        Require(routine.Type == "PROCEDURE" && routine.Text.Contains("FBSQA stack fixture"), "Runtime stack source lookup failed.");
        Require(a.HasPendingTransaction == pendingBeforeLookup, "Source lookup disturbed the runtime transaction state.");
        await a.RollbackAsync();
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
    await new GridApplyChecks(a, b, user, Check, Require, gridTables).RunAsync();
    await new CommitFaultChecks(b, profile, user, Check, Require, gridTables).RunAsync();
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
    foreach (var gridTable in gridTables)
    {
        try { await a.ExecuteAsync($"DROP TABLE {gridTable}"); }
        catch (Exception error) { failure ??= error; checks.Add(new { name = "grid fixture table removed", status = "failed", error = error.Message }); }
    }
    if (sourceProcedure is not null && a.IsConnected)
    {
        try { await a.ExecuteAsync($"DROP PROCEDURE {sourceProcedure}"); checks.Add(new { name = "temporary source procedure removed", status = "passed" }); }
        catch (Exception error) { failure ??= error; checks.Add(new { name = "temporary source procedure removed", status = "failed", error = error.Message }); }
    }
    if (sourcePackage is not null && a.IsConnected)
    {
        try { await a.ExecuteAsync($"DROP PACKAGE {sourcePackage}"); checks.Add(new { name = "temporary source package removed", status = "passed" }); }
        catch (Exception error) { failure ??= error; checks.Add(new { name = "temporary source package removed", status = "failed", error = error.Message }); }
    }
    await File.WriteAllTextAsync(reportPath, JsonSerializer.Serialize(new {
        startedAt, completedAt = DateTimeOffset.UtcNow, profileId, status = failure is null ? "passed" : "failed",
        scope = "Live Oracle services; DML only on temporary tables and uniquely named fixture tables, which are dropped afterwards; uniquely named temporary procedure/package sources; queued metadata cancellation; no user-table updates or saved-credential changes.",
        checks, error = failure?.Message
    }, new JsonSerializerOptions { WriteIndented = true }));
    Console.WriteLine("Report: " + reportPath);
}
if (failure is not null) Environment.ExitCode = 1;

sealed class InlineProgress(Action<string> action) : IProgress<string>
{
    public void Report(string value) => action(value);
}
