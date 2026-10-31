using System.Diagnostics;
using System.Text.Json;
using FbsDb.Services;

var profileId = args.FirstOrDefault() ?? "FBSDB_LOCAL";
var reportPath = Path.GetFullPath(args.ElementAtOrDefault(1) ?? ".artifacts/oracle-live/load.json");
Directory.CreateDirectory(Path.GetDirectoryName(reportPath)!);
var startedAt = DateTimeOffset.UtcNow;
var checks = new List<object>();
var sessions = new List<OracleSessionService>();
Exception? failure = null;
double P95(IEnumerable<double> values) { var sorted = values.Order().ToArray(); return sorted[(int)Math.Ceiling(sorted.Length * .95) - 1]; }
async Task<(double First, double Total)> ReadAll(OracleSessionService session, int count, int pageSize)
{
    using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(90));
    var watch = Stopwatch.StartNew();
    var page = await session.ExecuteAsync($"SELECT LEVEL AS N FROM dual CONNECT BY LEVEL <= {count}", rowLimit: pageSize, cancellationToken: deadline.Token, timeoutSeconds: 60);
    var first = watch.Elapsed.TotalMilliseconds;
    var cursor = page.ResultId;
    var seen = 0;
    try
    {
        while (true)
        {
            if (page.Offset != seen) throw new Exception($"Offset {page.Offset} != {seen}");
            foreach (var row in page.Rows)
                if (Convert.ToInt32(row[0]) != ++seen) throw new Exception("Missing, duplicated or reordered row");
            if (!page.HasMore) break;
            page = await session.FetchNextPageAsync(cursor!, pageSize, deadline.Token);
        }
        if (seen != count || session.HasPendingTransaction) throw new Exception("Incorrect row count or unexpected transaction");
        return (first, watch.Elapsed.TotalMilliseconds);
    }
    finally { if (cursor is not null) await session.CloseResultAsync(cursor); }
}
try
{
    var profile = (await new TnsProfileService().GetProfilesAsync()).Single(p => p.Id.Equals(profileId, StringComparison.OrdinalIgnoreCase));
    if (profile.Host is not ("127.0.0.1" or "localhost" or "::1")) throw new Exception("Only a local test database is allowed");
    for (var i = 0; i < 8; i++)
    {
        var session = new OracleSessionService(); sessions.Add(session);
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(25));
        await session.ConnectAsync(profile, "", "", null, deadline.Token);
    }
    var identities = await Task.WhenAll(sessions.Select(async s => Convert.ToString((await s.ExecuteAsync("SELECT SYS_CONTEXT('USERENV','SID') FROM dual")).Rows[0][0])));
    if (identities.Distinct().Count() != 8) throw new Exception("Sessions are not independent");
    foreach (var concurrency in new[] { 2, 4, 8 }) foreach (var pageSize in new[] { 500, 5000 })
    {
        var samples = new List<(double First, double Total)>();
        var watch = Stopwatch.StartNew();
        for (var repeat = 0; repeat < 3; repeat++)
            samples.AddRange(await Task.WhenAll(sessions.Take(concurrency).Select(s => ReadAll(s, 100000, pageSize))));
        checks.Add(new { name = "parallel-paging", status = "passed", concurrency, pageSize, rowsPerQuery = 100000, queries = samples.Count,
            firstPageP95Ms = P95(samples.Select(s => s.First)), completeP95Ms = P95(samples.Select(s => s.Total)),
            rowsPerSecond = samples.Count * 100000 / watch.Elapsed.TotalSeconds });
        Console.WriteLine($"PASS {concurrency} sessions, page {pageSize}: {samples.Count} complete queries, p95 {P95(samples.Select(s => s.Total)):F1}ms");
    }
    GC.Collect(); GC.WaitForPendingFinalizers(); GC.Collect();
    var baselineHeap = GC.GetTotalMemory(true);
    var soak = Stopwatch.StartNew(); var rounds = 0;
    do { await Task.WhenAll(sessions.Take(2).Select(s => ReadAll(s, 10000, 500))); rounds++; }
    while (soak.Elapsed < TimeSpan.FromSeconds(60));
    var retainedHeapDelta = GC.GetTotalMemory(true) - baselineHeap;
    checks.Add(new { name = "query-fetch-close-soak", status = "passed", concurrency = 2, rowsPerQuery = 10000,
        rounds, elapsedMs = soak.Elapsed.TotalMilliseconds, retainedHeapDeltaBytes = retainedHeapDelta });
    Console.WriteLine($"PASS 60s query/fetch/close soak: {rounds} rounds, retained heap delta {retainedHeapDelta} bytes");
}
catch (Exception error) { failure = error; Console.Error.WriteLine(error.Message); }
finally
{
    foreach (var session in sessions) session.Dispose();
    await File.WriteAllTextAsync(reportPath, JsonSerializer.Serialize(new { startedAt, completedAt = DateTimeOffset.UtcNow,
        status = failure is null ? "passed" : "failed", profileId, scope = "Local Oracle SELECT-only load; no user-table writes or credential changes",
        checks, error = failure?.ToString() }, new JsonSerializerOptions { WriteIndented = true }));
    Console.WriteLine("Report: " + reportPath);
}
if (failure is not null) Environment.ExitCode = 1;
