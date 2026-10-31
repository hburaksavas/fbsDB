using System.Diagnostics;
using System.Text;
using System.Text.Json;
using FbsDb.Services;

var mode = args.FirstOrDefault() ?? "tns";
if (mode is not ("tns" or "oracle")) throw new ArgumentException("Mode must be tns or oracle");
var size = int.Parse(args.ElementAtOrDefault(1) ?? (mode == "tns" ? "50000" : "1000"));
var repetitions = int.Parse(args.ElementAtOrDefault(2) ?? "3");
if (size < 1000 || size > 100000 || repetitions < 1 || repetitions > 20) throw new ArgumentException("Size must be 1000..100000, repeats 1..20");
if (mode == "oracle" && size > 5000) throw new ArgumentException("Live fixture is limited to 5000 views");
var reportPath = Path.GetFullPath(args.ElementAtOrDefault(3) ?? $".artifacts/scale-load/{mode}.json");
Directory.CreateDirectory(Path.GetDirectoryName(reportPath)!);
var startedAt = DateTimeOffset.UtcNow;
var checks = new List<object>();
Exception? failure = null;
void Require(bool condition, string message) { if (!condition) throw new Exception(message); }
double P95(List<double> samples) => samples.Order().ElementAt((int)Math.Ceiling(samples.Count * .95) - 1);
async Task Measure(string name, object workload, Func<Task> action)
{
    var samples = new List<double>();
    var heapBefore = GC.GetTotalMemory(true);
    for (var i = 0; i < repetitions; i++) { var watch = Stopwatch.StartNew(); await action(); samples.Add(watch.Elapsed.TotalMilliseconds); }
    var retainedHeapDelta = GC.GetTotalMemory(true) - heapBefore;
    checks.Add(new { name, status = "passed", workload, repetitions, p95Ms = P95(samples), maxMs = samples.Max(), samplesMs = samples, retainedHeapDeltaBytes = retainedHeapDelta });
    Console.WriteLine($"PASS {name} {JsonSerializer.Serialize(workload)}: p95 {P95(samples):F1} ms");
}
try
{
    if (mode == "tns")
    {
        var root = Path.Combine(Path.GetTempPath(), "fbsdb-scale-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        try
        {
            foreach (var count in new[] { 1000, 10000, size }.Where(n => n <= size).Distinct())
            {
                var file = Path.Combine(root, "tnsnames.ora");
                var other = Path.Combine(root, "duplicate.ora");
                var settings = Path.Combine(root, "settings.json");
                var text = new StringBuilder(); var duplicates = new StringBuilder();
                var saved = new List<object>();
                var duplicateCount = count / 10;
                for (var i = 0; i < count; i++)
                {
                    var id = $"LOAD_{i:D6}";
                    text.AppendLine($"# Türkçe açıklama {i}\n{id}{(i % 100 == 0 ? $", ALT_{i:D6}" : "")} =\n (DESCRIPTION=(ADDRESS_LIST=(ADDRESS=(PROTOCOL=TCP)(HOST=db1.test)(PORT=1521))(ADDRESS=(PROTOCOL=TCP)(HOST=db2.test)(PORT=1522)))(CONNECT_DATA=(SERVICE_NAME=LOADSVC)))");
                    if (i < duplicateCount) duplicates.AppendLine($"{id.ToLowerInvariant()}=(DESCRIPTION=(ADDRESS=(PROTOCOL=TCP)(HOST=duplicate.test)(PORT=1523))(CONNECT_DATA=(SID=LOADSID)))");
                    saved.Add(new { id = "saved-" + i, name = id, method = "tns", alias = id.ToLowerInvariant(), source = i < duplicateCount ? other : file, user = "LOAD", environment = "TEST" });
                }
                saved.Add(new { id = "missing", name = "Missing", method = "tns", alias = "MISSING_ALIAS", source = file, user = "LOAD", environment = "TEST" });
                await File.WriteAllTextAsync(file, text.ToString()); await File.WriteAllTextAsync(other, duplicates.ToString());
                await File.WriteAllTextAsync(settings, JsonSerializer.Serialize(new { connectionProfiles = saved }));
                var originalSettings = await File.ReadAllTextAsync(settings);
                var service = new TnsProfileService(settings, () => [file, other]);
                var workload = new { aliases = count, extraAliases = (count + 99) / 100, duplicateCount, bytes = new FileInfo(file).Length + new FileInfo(other).Length };
                await Measure("tns-read-parse-deduplicate", workload, async () => {
                    using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(90));
                    var aliases = await service.GetAliasesAsync(deadline.Token);
                    Require(aliases.Count == count + (count + 99) / 100 + duplicateCount, "Alias count mismatch");
                    Require(aliases.Count(a => a.Duplicate) == duplicateCount * 2, "Duplicate flags mismatch");
                    Require(aliases.Any(a => a.Id == $"LOAD_{count - 1:D6}" && a.Host == "db1.test" && a.Service == "LOADSVC"), "Last alias lost");
                    Require(aliases.Count(a => a.Source == other && a.Host == "duplicate.test" && a.Service == "LOADSID") == duplicateCount, "Source/SID identity lost");
                });
                await Measure("tns-saved-profile-resolution", workload, async () => {
                    var profiles = await service.GetProfilesAsync();
                    Require(profiles.Count == count + 1 && profiles.Single(p => p.Id == "missing").Available == false, "Missing profile handling changed");
                    foreach (var profile in profiles.Where(p => p.Id != "missing")) {
                        var i = int.Parse(profile.Id[6..]);
                        Require(profile.Available && profile.Host == (i < duplicateCount ? "duplicate.test" : "db1.test"), "Source-aware resolution failed");
                    }
                    Require(await File.ReadAllTextAsync(settings) == originalSettings, "Existing settings were modified");
                });
            }
        }
        finally { Directory.Delete(root, true); }
    }
    else
    {
        await RunOracle();
    }
}
catch (Exception error) { failure = error; Console.Error.WriteLine(error); }
finally
{
    await File.WriteAllTextAsync(reportPath, JsonSerializer.Serialize(new { startedAt, completedAt = DateTimeOffset.UtcNow, mode, size,
        status = failure is null ? "passed" : "failed", environment = new { runtime = Environment.Version.ToString(), os = Environment.OSVersion.ToString() },
        checks, error = failure?.ToString() }, new JsonSerializerOptions { WriteIndented = true }));
    Console.WriteLine("Report: " + reportPath);
}
if (failure is not null) Environment.ExitCode = 1;

async Task RunOracle()
{
    var profile = (await new TnsProfileService().GetProfilesAsync()).Single(p => p.Id == "FBSDB_LOCAL");
    Require(profile.Host is "127.0.0.1" or "localhost" or "::1", "Only a local test database is allowed");
    using var session = new OracleSessionService();
    using var other = new OracleSessionService();
    using (var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(25))) {
        await session.ConnectAsync(profile, "", "", null, deadline.Token);
        await other.ConnectAsync(profile, "", "", null, deadline.Token);
    }
    var prefix = "FBSCALE_" + Guid.NewGuid().ToString("N")[..8].ToUpperInvariant();
    var table = prefix + "_DATA";
    var createdViews = new List<string>(); var createdTable = false;
    var owner = Convert.ToString((await session.ExecuteAsync("SELECT SYS_CONTEXT('USERENV','SESSION_USER') FROM dual")).Rows[0][0])!;
    Require(owner != "SYS" && owner != "SYSTEM", "Use the dedicated test profile, not an administrative schema");
    var projection = "ID, PAYLOAD, " + string.Join(", ", Enumerable.Range(1, 30).Select(i => $"ID+{i} AS C{i}"));
    try
    {
        // Materialized 1M-row fixture: all writes are to this unique table only.
        await session.ExecuteAsync($"CREATE TABLE {table} AS SELECT LEVEL AS ID, CAST(RPAD('x',64,'x') AS VARCHAR2(64)) AS PAYLOAD FROM dual CONNECT BY LEVEL <= 1000000", timeoutSeconds: 90);
        createdTable = true;
        await Measure("million-row-fixture-count", new { rows = 1000000 }, async () => Require(Convert.ToInt32((await session.ExecuteAsync($"SELECT COUNT(*) FROM {table}")).Rows[0][0]) == 1000000, "Fixture row count mismatch"));
        foreach (var target in new[] { 1000, size }.Distinct())
        {
            for (var i = createdViews.Count; i < target; i++) {
                var view = $"{prefix}_V{i:D5}";
                await session.ExecuteAsync($"CREATE VIEW {view} AS SELECT {projection} FROM {table}", timeoutSeconds: 30);
                createdViews.Add(view);
            }
            await Measure("live-schema-discovery", new { views = target, columnsPerView = 32 }, async () => {
                using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(90));
                var schema = await session.LoadSchemaAsync(deadline.Token);
                var names = schema.Objects.Where(o => o.Owner == owner && o.Type == "VIEW" && o.Name.StartsWith(prefix + "_V", StringComparison.Ordinal)).Select(o => o.Name).ToHashSet();
                Require(names.Count == target && createdViews.All(names.Contains), "Schema discovery lost fixture views");
                Console.WriteLine($"  Discovered {schema.Objects.Count} total visible objects");
            });
            await Measure("live-lazy-column-metadata", new { views = target, columnsPerView = 32, sampledViews = 20 }, async () => {
                foreach (var index in Enumerable.Range(0, 20).Select(i => i * (target - 1) / 19)) {
                    using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(30));
                    var detail = await session.LoadTableDetailsAsync(createdViews[index], owner, "VIEW", deadline.Token);
                    Require(detail.Columns.Count == 32 && detail.Columns.Any(c => c.Name == "C30"), "Column metadata truncated");
                }
            });
        }
        foreach (var pageSize in new[] { 500, 10000 })
            await Measure("million-row-parallel-paging", new { rowsPerQuery = 1000000, concurrency = 2, pageSize, payloadBytes = 64 }, () => Task.WhenAll(ReadRows(session, pageSize), ReadRows(other, pageSize)));
    }
    finally
    {
        var cleanupErrors = new List<string>();
        foreach (var view in createdViews.AsEnumerable().Reverse()) try { await session.ExecuteAsync($"DROP VIEW {view}", timeoutSeconds: 15); } catch (Exception e) { cleanupErrors.Add(view + ": " + e.Message); }
        if (createdTable) try { await session.ExecuteAsync($"DROP TABLE {table} PURGE", timeoutSeconds: 15); } catch (Exception e) { cleanupErrors.Add(table + ": " + e.Message); }
        checks.Add(new { name = "fixture-cleanup", status = cleanupErrors.Count == 0 ? "passed" : "failed", droppedViews = createdViews.Count, droppedTable = createdTable && cleanupErrors.Count == 0, errors = cleanupErrors });
        Require(cleanupErrors.Count == 0, "Fixture cleanup failed: " + string.Join("; ", cleanupErrors));
    }
    async Task ReadRows(OracleSessionService reader, int pageSize)
    {
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(120));
        var page = await reader.ExecuteAsync($"SELECT ID, PAYLOAD FROM {table} ORDER BY ID", rowLimit: pageSize, cancellationToken: deadline.Token, timeoutSeconds: 90);
        var cursor = page.ResultId; var count = 0;
        try {
            while (true) {
                Require(page.Offset == count, "Page offset mismatch");
                foreach (var row in page.Rows) Require(Convert.ToInt32(row[0]) == ++count && Convert.ToString(row[1])?.Length == 64, "Row missing, duplicated or truncated");
                if (!page.HasMore) break;
                page = await reader.FetchNextPageAsync(cursor!, pageSize, deadline.Token);
            }
            Require(count == 1000000, "Incomplete million-row fetch");
        } finally { if (cursor is not null) await reader.CloseResultAsync(cursor); }
    }
}
