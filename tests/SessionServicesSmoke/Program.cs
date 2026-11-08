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

// FI-069: SSH tunnels through a stand-in ssh process.
{
    var repo = AppContext.BaseDirectory;
    while (!Directory.Exists(Path.Combine(repo, "contracts"))) repo = Path.GetDirectoryName(repo.TrimEnd(Path.DirectorySeparatorChar)) ?? throw new Exception("Repository root not found.");
    var smoke = Path.Combine(repo, "tests", "SessionServicesSmoke");
    var work = Directory.CreateTempSubdirectory("fbsdb-ssh-").FullName;
    try
    {
        // The fingerprint matches what ssh-keygen prints for a real key.
        var keygen = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), "OpenSSH", "ssh-keygen.exe");
        var keyFile = Path.Combine(work, "host_key");
        System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(keygen) { ArgumentList = { "-q", "-t", "ed25519", "-N", "", "-f", keyFile }, UseShellExecute = false, CreateNoWindow = true })!.WaitForExit();
        var publicKey = File.ReadAllText(keyFile + ".pub").Split(' ')[1];
        var listing = System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(keygen) { ArgumentList = { "-lf", keyFile + ".pub" }, RedirectStandardOutput = true, UseShellExecute = false, CreateNoWindow = true })!;
        var expected = listing.StandardOutput.ReadToEnd().Split(' ')[1];
        if (SshTunnelRegistry.Fingerprint(publicKey) != expected) throw new Exception($"Fingerprint {SshTunnelRegistry.Fingerprint(publicKey)} differs from ssh-keygen {expected}.");
        Environment.SetEnvironmentVariable("FAKE_HOST_KEY", publicKey);

        foreach (var bad in new[] { "-oProxyCommand=calc", "host name", "x" + new string('y', 300) })
            try { SshTunnelSettings.Parse(bad, "22", "dev", ""); throw new Exception($"Unsafe SSH host accepted: {bad}"); } catch (InvalidOperationException) { }
        try { SshTunnelSettings.Parse("ok.test", "22", "-lroot", ""); throw new Exception("Unsafe SSH user accepted."); } catch (InvalidOperationException) { }
        try { SshTunnelSettings.Parse("ok.test", "22", "dev", "relative\\key"); throw new Exception("Relative key path accepted."); } catch (InvalidOperationException) { }
        if (SshTunnelSettings.Parse("", "", "", "") is not null) throw new Exception("Empty SSH settings made a tunnel.");

        var knownHosts = Path.Combine(work, "ssh", "known_hosts");
        var registry = new SshTunnelRegistry(new SshTools("node", "node", knownHosts, [Path.Combine(smoke, "fake-ssh.mjs")], [Path.Combine(smoke, "fake-ssh-keyscan.mjs")]), TimeSpan.FromSeconds(15));
        var echo = new System.Net.Sockets.TcpListener(System.Net.IPAddress.Loopback, 0); echo.Start();
        var echoPort = ((System.Net.IPEndPoint)echo.LocalEndpoint).Port;
        _ = Task.Run(async () => { while (true) { var client = await echo.AcceptTcpClientAsync(); _ = Task.Run(async () => { using (client) { var stream = client.GetStream(); var buffer = new byte[256]; int read; while ((read = await stream.ReadAsync(buffer)) > 0) await stream.WriteAsync(buffer.AsMemory(0, read)); } }); } });
        ConnectionProfile Profile(string sshHost) => new ConnectionProfile("p1", "127.0.0.1", echoPort.ToString(), "FREEPDB1", "", "(DESCRIPTION=direct)") { Method = "basic", Ssh = SshTunnelSettings.Parse(sshHost, "2222", "dev", "") };

        await using (var direct = await registry.AcquireAsync(new ConnectionProfile("d", "h", "1521", "S", "", "(DESCRIPTION=direct)") { Method = "basic" }))
            if (direct.Tunnelled || direct.DataSource != "(DESCRIPTION=direct)") throw new Exception("A profile without SSH was tunnelled.");

        var first = await registry.AcquireAsync(Profile("ok.test"));
        if (!first.DataSource.Contains($"(HOST=127.0.0.1)(PORT={first.LocalPort})") || !first.DataSource.Contains("SERVICE_NAME=FREEPDB1") || first.Via != "dev@ok.test:2222") throw new Exception($"Tunnel descriptor is wrong: {first.DataSource}");
        using (var through = new System.Net.Sockets.TcpClient())
        {
            await through.ConnectAsync(System.Net.IPAddress.Loopback, first.LocalPort!.Value);
            var stream = through.GetStream(); await stream.WriteAsync(System.Text.Encoding.ASCII.GetBytes("ping"));
            var reply = new byte[4]; await stream.ReadExactlyAsync(reply);
            if (System.Text.Encoding.ASCII.GetString(reply) != "ping") throw new Exception("Bytes did not cross the tunnel.");
        }
        var sharedLease = await registry.AcquireAsync(Profile("ok.test"));
        if (sharedLease.LocalPort != first.LocalPort || registry.Statuses() is not [{ Leases: 2, Running: true }]) throw new Exception("Two tabs of one profile did not share one tunnel.");
        await first.DisposeAsync();
        if (registry.Statuses() is not [{ Leases: 1, Running: true }]) throw new Exception("The tunnel closed while a tab still used it.");
        var port = sharedLease.LocalPort!.Value;
        await sharedLease.DisposeAsync();
        if (registry.Statuses().Count != 0) throw new Exception("The tunnel outlived its last tab.");
        await Task.Delay(300);
        using (var closed = new System.Net.Sockets.TcpClient())
            try { await closed.ConnectAsync(System.Net.IPAddress.Loopback, port); throw new Exception("The closed tunnel still accepts connections."); } catch (System.Net.Sockets.SocketException) { }

        try { await registry.AcquireAsync(Profile("unknown.test")); throw new Exception("An unknown SSH host was trusted."); }
        catch (SshHostKeyUnknownException unknown)
        {
            if (unknown.Fingerprint != expected || unknown.KeyType != "ssh-ed25519" || unknown.Port != 2222) throw new Exception($"Wrong host key offer: {unknown.KeyType} {unknown.Fingerprint}");
            try { await registry.TrustHostAsync("unknown.test", 2222, "SHA256:wrong"); throw new Exception("A different fingerprint was trusted."); } catch (InvalidOperationException) { }
            try { await registry.AcquireAsync(Profile("unknown.test")); } catch (SshHostKeyUnknownException) { }
            await registry.TrustHostAsync("unknown.test", 2222, unknown.Fingerprint);
            var lines = File.ReadAllLines(knownHosts);
            if (lines.Length != 1 || lines[0] != $"[unknown.test]:2222 ssh-ed25519 {publicKey}") throw new Exception($"known_hosts is wrong: {string.Join(" | ", lines)}");
            try { await registry.TrustHostAsync("unknown.test", 2222, unknown.Fingerprint); throw new Exception("A host key offer was used twice."); } catch (InvalidOperationException) { }
        }
        if (registry.Statuses().Count != 0) throw new Exception("A failed tunnel kept its lease.");
        foreach (var (sshHost, message) in new[] { ("denied.test", "no key was accepted"), ("changed.test", "has changed"), ("refused.test", "Connection refused") })
            try { await registry.AcquireAsync(Profile(sshHost)); throw new Exception($"{sshHost} connected."); }
            catch (InvalidOperationException error) when (error is not SshHostKeyUnknownException) { if (!error.Message.Contains(message)) throw new Exception($"{sshHost}: {error.Message}"); }
        try { await registry.AcquireAsync(Profile("ok.test") with { Method = "tns" }); throw new Exception("A TNS profile was tunnelled."); } catch (InvalidOperationException) { }

        // Profiles keep their SSH settings; one that cannot be read is never used directly.
        var settingsPath = Path.Combine(work, "settings.json");
        var profiles = new TnsProfileService(settingsPath, () => []);
        var saved = await profiles.SaveProfileAsync(null, "Through SSH", "", "", "app", "DEV", "basic", "db.internal", "1521", "FREEPDB1", "service", "", null, null, SshTunnelSettings.Parse("bastion.example", "2200", "dev", ""));
        var loaded = (await profiles.GetProfilesAsync()).Single(p => p.Id == saved);
        if (loaded.Ssh != new SshTunnelSettings("bastion.example", 2200, "dev", "") || !loaded.Available) throw new Exception("SSH settings were not saved.");
        var json = System.Text.Json.Nodes.JsonNode.Parse(File.ReadAllText(settingsPath))!;
        json["connectionProfiles"]![0]!["ssh"]!["host"] = "-oProxyCommand=calc";
        File.WriteAllText(settingsPath, json.ToJsonString());
        if ((await profiles.GetProfilesAsync()).Single(p => p.Id == saved) is { Available: true }) throw new Exception("A profile with unreadable SSH settings stayed available.");
        try { await profiles.SaveProfileAsync(null, "Alias SSH", "X", "C:\\t\\tnsnames.ora", "app", "DEV", "tns", ssh: SshTunnelSettings.Parse("ok.test", "", "dev", "")); throw new Exception("SSH was saved on a TNS profile."); } catch (InvalidOperationException) { }
        echo.Stop();
        Console.WriteLine("PASS ssh tunnels: shared lease, forwarding, host key offer and trust, sign-in and changed-key errors, safe settings.");
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
