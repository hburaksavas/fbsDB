using FbsDb.Services;

var sourceGate = new ScriptSourceReviewGate();
var firstReview = sourceGate.Begin("review-a","run-1",0);
if (sourceGate.Approve("review-b","run-1",0,firstReview.Nonce,"token") || sourceGate.Approve("review-a","run-2",0,firstReview.Nonce,"token") || sourceGate.Approve("review-a","run-1",1,firstReview.Nonce,"token")) throw new Exception("Cross-run source review released the script.");
if (firstReview.Completion.Task.IsCompleted) throw new Exception("Script continued without approval.");
if (!sourceGate.Approve("review-a","run-1",0,firstReview.Nonce,"token") || await firstReview.Completion.Task != "token" || sourceGate.Approve("review-a","run-1",0,firstReview.Nonce,"replay")) throw new Exception("Review acknowledgement was lost or replayed.");
sourceGate.Remove("review-a");
var secondReview = sourceGate.Begin("review-a","run-1",1);
if (sourceGate.Approve("review-a","run-1",1,firstReview.Nonce,"old-token")) throw new Exception("Old source review nonce released a later step.");
sourceGate.Remove("review-a");
if (!secondReview.Completion.Task.IsCanceled) throw new Exception("Cancelling a script left its source review pending.");

using (var reloadRegistry = new TabSessionRegistry())
{
    var starter = reloadRegistry.Get("tab-1");
    await reloadRegistry.CloseAsync("tab-1");
    try { reloadRegistry.Get("tab-1"); throw new Exception("Closed starter accepted a stale command."); } catch(InvalidOperationException) { }
    var fresh = reloadRegistry.InitializeUiTab("tab-1");
    if (ReferenceEquals(starter,fresh)||fresh.Oracle.IsConnected) throw new Exception("UI initialization reused a closed physical Oracle session.");
    await reloadRegistry.CloseAsync("tab-1");
    try { reloadRegistry.Get("tab-1"); throw new Exception("Closing the fresh starter lost tombstone protection."); } catch(InvalidOperationException) { }
}

var owners = new TabWindowOwnership();
owners.Claim("tab-1", TabWindowOwnership.Main);
owners.Claim("tab-1", TabWindowOwnership.Main);
var second = owners.NextWindowId();
if (second != "w2" || TabWindowOwnership.Label(second) != "Window 2" || !TabWindowOwnership.IsWindowId(second) || TabWindowOwnership.IsWindowId("w1")) throw new Exception("Window identities are not numbered from 2.");
owners.Move("tab-1", TabWindowOwnership.Main, second);
try { owners.Claim("tab-1", TabWindowOwnership.Main); throw new Exception("The old window kept using a moved session."); }
catch (InvalidOperationException error) when (error.Message.Contains("Window 2")) { }
try { owners.Move("tab-1", TabWindowOwnership.Main, "w3"); throw new Exception("A window moved a session it does not own."); } catch (InvalidOperationException) { }
owners.Claim("tab-2", second);
if (owners.TabsOf(second).Count != 2 || owners.TabsOf(TabWindowOwnership.Main).Count != 0) throw new Exception("Window ownership lists are wrong.");
if (owners.ReturnToMain(second).Count != 2 || owners.OwnerOf("tab-2") != TabWindowOwnership.Main) throw new Exception("Closing a window lost its sessions.");
owners.Release("tab-2");
if (owners.OwnerOf("tab-2") is not null) throw new Exception("A closed tab kept its owner.");

// SSH tunnels were removed: a profile saved with one is never connected directly, and saving it again drops the setting.
{
    var work = Directory.CreateTempSubdirectory("fbsdb-profiles-").FullName;
    try
    {
        var settingsPath = Path.Combine(work, "settings.json");
        var profiles = new TnsProfileService(settingsPath, () => []);
        var saved = await profiles.SaveProfileAsync(null, "Legacy tunnel", "", "", "app", "DEV", "basic", "db.internal", "1521", "FREEPDB1", "service", "");
        if (!(await profiles.GetProfilesAsync()).Single(p => p.Id == saved).Available) throw new Exception("A plain Basic profile was unavailable.");
        var json = System.Text.Json.Nodes.JsonNode.Parse(File.ReadAllText(settingsPath))!;
        json["connectionProfiles"]![0]!["ssh"] = new System.Text.Json.Nodes.JsonObject { ["host"] = "bastion.example", ["port"] = 22, ["user"] = "dev", ["keyFile"] = "" };
        File.WriteAllText(settingsPath, json.ToJsonString());
        if ((await profiles.GetProfilesAsync()).Single(p => p.Id == saved) is { Available: true }) throw new Exception("A profile saved with an SSH tunnel was connected directly.");
        await profiles.SaveProfileAsync(saved, "Legacy tunnel", "", "", "app", "DEV", "basic", "db.internal", "1521", "FREEPDB1", "service", "");
        if (System.Text.Json.Nodes.JsonNode.Parse(File.ReadAllText(settingsPath))!["connectionProfiles"]![0]!["ssh"] is not null) throw new Exception("Saving kept the old SSH setting.");
        if (!(await profiles.GetProfilesAsync()).Single(p => p.Id == saved).Available) throw new Exception("A re-saved profile stayed unavailable.");
        Console.WriteLine("PASS legacy ssh profile: unavailable until saved again.");
    }
    finally { try { Directory.Delete(work, true); } catch (IOException) { } }
}

async Task Reject<T>(Func<Task> operation) where T : Exception
{
    try { await operation().WaitAsync(TimeSpan.FromSeconds(5)); }
    catch (T) { return; }
    throw new Exception($"Expected {typeof(T).Name}.");
}
using var a = new OracleSessionService();
using var b = new OracleSessionService();
using var cancelled = new CancellationTokenSource(); cancelled.Cancel();
await Reject<OperationCanceledException>(() => a.LoadSchemaAsync(cancelled.Token));
await Reject<OperationCanceledException>(() => a.LoadTableDetailsAsync("T", cancellationToken: cancelled.Token));
await Reject<OperationCanceledException>(() => a.FetchNextPageAsync("stale", 100, cancelled.Token));
await Reject<InvalidOperationException>(() => a.LoadSchemaAsync());
await Reject<InvalidOperationException>(() => a.LoadTableDetailsAsync("T"));
await Reject<InvalidOperationException>(() => a.GetColumnDefinitionAsync("APP", "T", "ID"));
await Reject<InvalidOperationException>(() => a.GetPrimaryKeyAsync("APP", "T"));
await Reject<InvalidOperationException>(() => a.FetchNextPageAsync("stale", 100));
await Reject<InvalidOperationException>(() => a.ReviewSourceAsync("CREATE OR REPLACE PROCEDURE demo AS BEGIN NULL; END;"));
await Reject<InvalidOperationException>(() => a.ReviewSourceAsync("SELECT 1 FROM dual"));
await Reject<OperationCanceledException>(() => a.ReviewSourceAsync("CREATE PROCEDURE demo AS BEGIN NULL; END;", cancelled.Token));
await a.CloseResultAsync("stale").WaitAsync(TimeSpan.FromSeconds(5));
await a.SetAutoCommitAsync(true).WaitAsync(TimeSpan.FromSeconds(5));
if (!a.AutoCommit || b.AutoCommit || a.HasPendingTransaction || b.HasPendingTransaction || a.IsConnected || b.IsConnected)
    throw new Exception("Metadata/paging changed session ownership or transaction state.");
await a.RollbackAsync(); await b.CommitAsync();
await a.DisconnectAsync(false);
if (a.CancelCurrentOperation() || b.CancelCurrentOperation()) throw new Exception("A failed/cancelled operation retained active cancellation state.");
Console.WriteLine("PASS session services: cancelled metadata/paging, disconnected guards, gate release and session isolation without a database.");
