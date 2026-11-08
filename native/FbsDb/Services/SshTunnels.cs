using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace FbsDb.Services;

// FI-069: Oracle connections through an SSH local forward. The tunnel is the
// Windows OpenSSH client (ssh.exe -N -L) run as a child process, so the user's
// ssh config, ssh-agent and known_hosts apply. Only key or agent sign-in is
// used (BatchMode); fbsDB keeps no SSH secrets. One tunnel serves every tab
// connected through the same profile and closes with the last of them.
public sealed record SshTunnelSettings(string Host, int Port, string User, string KeyFile)
{
    private static readonly Regex HostPattern = new(@"^[A-Za-z0-9_][A-Za-z0-9_.:%\[\]-]{0,252}$");
    private static readonly Regex UserPattern = new(@"^[A-Za-z0-9_][A-Za-z0-9_.@-]{0,63}$");

    public string Display => $"{User}@{Host}{(Port == 22 ? "" : $":{Port}")}";

    public static SshTunnelSettings? Parse(string host, string port, string user, string keyFile)
    {
        host = host.Trim(); user = user.Trim(); keyFile = keyFile.Trim();
        if (host.Length == 0 && user.Length == 0 && keyFile.Length == 0) return null;
        if (!HostPattern.IsMatch(host)) throw new InvalidOperationException("Enter a valid SSH host.");
        if (!UserPattern.IsMatch(user)) throw new InvalidOperationException("Enter a valid SSH user.");
        var number = 22;
        if (port.Trim().Length > 0 && (!int.TryParse(port, out number) || number is < 1 or > 65535)) throw new InvalidOperationException("SSH port must be between 1 and 65535.");
        if (keyFile.Length > 0 && (keyFile.Length > 260 || keyFile.IndexOfAny(['"', '\r', '\n']) >= 0 || !Path.IsPathFullyQualified(keyFile)))
            throw new InvalidOperationException("Enter the full path of the SSH key file, or leave it empty to use ssh-agent.");
        return new(host, number, user, keyFile);
    }

    public static SshTunnelSettings? Read(JsonNode? node) => node is JsonObject item
        ? Parse(item["host"]?.GetValue<string>() ?? "", item["port"]?.ToString() ?? "", item["user"]?.GetValue<string>() ?? "", item["keyFile"]?.GetValue<string>() ?? "")
        : null;

    public JsonObject ToJson() => new() { ["host"] = Host, ["port"] = Port, ["user"] = User, ["keyFile"] = KeyFile };
}

public sealed class SshHostKeyUnknownException(string host, int port, string keyType, string fingerprint)
    : InvalidOperationException($"The SSH server {host}:{port} is not known yet. Its {keyType} key fingerprint is {fingerprint}. Confirm it to connect.")
{
    public string Host { get; } = host;
    public int Port { get; } = port;
    public string KeyType { get; } = keyType;
    public string Fingerprint { get; } = fingerprint;
}

public sealed record SshTools(string Ssh, string Keyscan, string KnownHosts, IReadOnlyList<string> SshPrefix, IReadOnlyList<string> KeyscanPrefix)
{
    public static SshTools Default()
    {
        var folder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), "OpenSSH");
        var known = Environment.GetEnvironmentVariable("FBSDB_SSH_KNOWN_HOSTS")
            ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".ssh", "known_hosts");
        return new(Environment.GetEnvironmentVariable("FBSDB_SSH_PATH") ?? Path.Combine(folder, "ssh.exe"),
            Environment.GetEnvironmentVariable("FBSDB_SSH_KEYSCAN_PATH") ?? Path.Combine(folder, "ssh-keyscan.exe"), known, [], []);
    }
}

public sealed record SshTunnelStatus(string Via, int LocalPort, int Leases, bool Running, string? LastError);

public sealed class SshTunnelLease : IAsyncDisposable
{
    private readonly SshTunnelRegistry? _registry;
    private SshTunnelRegistry.Tunnel? _tunnel;
    internal SshTunnelLease(string dataSource, SshTunnelRegistry? registry = null, SshTunnelRegistry.Tunnel? tunnel = null) { DataSource = dataSource; _registry = registry; _tunnel = tunnel; }
    public string DataSource { get; }
    public string? Via => _tunnel?.Settings.Display;
    public int? LocalPort => _tunnel?.LocalPort;
    public bool Tunnelled => _tunnel is not null;
    // A tunnel whose ssh process ended (network loss, sleep) is started again on the same local port.
    public Task EnsureRunningAsync(CancellationToken token = default) => _tunnel is null || _registry is null ? Task.CompletedTask : _registry.EnsureRunningAsync(_tunnel, token);
    public ValueTask DisposeAsync()
    {
        var tunnel = Interlocked.Exchange(ref _tunnel, null);
        if (tunnel is not null) _registry?.Release(tunnel);
        return ValueTask.CompletedTask;
    }
}

public sealed class SshTunnelRegistry
{
    public static SshTunnelRegistry Shared { get; } = new(SshTools.Default());

    internal sealed class Tunnel(string key, SshTunnelSettings settings, string targetHost, int targetPort)
    {
        public string Key { get; } = key;
        public SshTunnelSettings Settings { get; } = settings;
        public string TargetHost { get; } = targetHost;
        public int TargetPort { get; } = targetPort;
        public int LocalPort { get; set; }
        public Process? Process { get; set; }
        public int Leases { get; set; }
        public string? LastError { get; set; }
        public readonly StringBuilder Errors = new();
        public readonly SemaphoreSlim Start = new(1, 1);
    }

    private readonly SshTools _tools;
    private readonly Dictionary<string, Tunnel> _tunnels = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<string, (string Type, string Key, string Fingerprint)> _offers = new(StringComparer.OrdinalIgnoreCase);
    private readonly object _gate = new();
    private readonly TimeSpan _startTimeout;

    public SshTunnelRegistry(SshTools tools, TimeSpan? startTimeout = null) { _tools = tools; _startTimeout = startTimeout ?? TimeSpan.FromSeconds(25); }

    public async Task<SshTunnelLease> AcquireAsync(ConnectionProfile profile, CancellationToken token = default)
    {
        if (profile.Ssh is not { } ssh) return new SshTunnelLease(profile.Descriptor);
        if (profile.Method != "basic" || !int.TryParse(profile.Port, out var targetPort)) throw new InvalidOperationException("SSH tunnels are available for host, port and service connections.");
        var key = $"{ssh.User}@{ssh.Host}:{ssh.Port}|{ssh.KeyFile}|{profile.Host}:{targetPort}";
        Tunnel tunnel;
        lock (_gate)
        {
            if (!_tunnels.TryGetValue(key, out tunnel!)) _tunnels[key] = tunnel = new Tunnel(key, ssh, profile.Host, targetPort);
            tunnel.Leases++;
        }
        try { await EnsureRunningAsync(tunnel, token); }
        catch { Release(tunnel); throw; }
        var connect = profile.TargetType == "sid" ? "SID" : "SERVICE_NAME";
        return new SshTunnelLease($"(DESCRIPTION=(ADDRESS=(PROTOCOL=TCP)(HOST=127.0.0.1)(PORT={tunnel.LocalPort}))(CONNECT_DATA=({connect}={profile.Service})))", this, tunnel);
    }

    internal void Release(Tunnel tunnel)
    {
        Process? stop = null;
        lock (_gate)
        {
            if (--tunnel.Leases > 0) return;
            _tunnels.Remove(tunnel.Key);
            stop = tunnel.Process; tunnel.Process = null;
        }
        Stop(stop);
    }

    public IReadOnlyList<SshTunnelStatus> Statuses()
    {
        lock (_gate) return _tunnels.Values.Select(t => new SshTunnelStatus(t.Settings.Display, t.LocalPort, t.Leases, t.Process is { HasExited: false }, t.LastError)).ToArray();
    }

    internal async Task EnsureRunningAsync(Tunnel tunnel, CancellationToken token)
    {
        await tunnel.Start.WaitAsync(token);
        try
        {
            if (tunnel.Process is { HasExited: false }) return;
            for (var attempt = 0; ; attempt++)
            {
                if (tunnel.LocalPort == 0 || attempt > 0) tunnel.LocalPort = FreeLocalPort();
                try { await StartAsync(tunnel, token); tunnel.LastError = null; return; }
                catch (SshPortTakenException) when (attempt < 2) { }
                catch (Exception error) { tunnel.LastError = error.Message; throw; }
            }
        }
        finally { tunnel.Start.Release(); }
    }

    private sealed class SshPortTakenException() : Exception("The local tunnel port is in use.");

    internal IReadOnlyList<string> Arguments(Tunnel tunnel)
    {
        var s = tunnel.Settings;
        var args = new List<string>(_tools.SshPrefix)
        {
            "-N", "-T",
            "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes", "-o", "ExitOnForwardFailure=yes",
            "-o", "ServerAliveInterval=15", "-o", "ServerAliveCountMax=3", "-o", "ConnectTimeout=10",
            "-o", $"UserKnownHostsFile={_tools.KnownHosts}",
            "-p", s.Port.ToString(), "-l", s.User,
            "-L", $"127.0.0.1:{tunnel.LocalPort}:{tunnel.TargetHost}:{tunnel.TargetPort}",
        };
        if (s.KeyFile.Length > 0) args.AddRange(["-i", s.KeyFile]);
        args.Add(s.Host);
        return args;
    }

    private async Task StartAsync(Tunnel tunnel, CancellationToken token)
    {
        if (!File.Exists(_tools.Ssh) && Path.IsPathFullyQualified(_tools.Ssh)) throw new InvalidOperationException("The Windows OpenSSH client (ssh.exe) is not installed. Add the OpenSSH Client optional feature.");
        var start = new ProcessStartInfo(_tools.Ssh) { UseShellExecute = false, CreateNoWindow = true, RedirectStandardError = true, RedirectStandardOutput = true, RedirectStandardInput = true };
        foreach (var argument in Arguments(tunnel)) start.ArgumentList.Add(argument);
        lock (tunnel.Errors) tunnel.Errors.Clear();
        var process = new Process { StartInfo = start, EnableRaisingEvents = true };
        process.ErrorDataReceived += (_, line) => { if (line.Data is { Length: > 0 } text) lock (tunnel.Errors) { if (tunnel.Errors.Length < 16384) tunnel.Errors.AppendLine(text); } };
        process.OutputDataReceived += (_, _) => { };
        process.Start();
        process.BeginErrorReadLine(); process.BeginOutputReadLine();
        tunnel.Process = process;
        var deadline = DateTime.UtcNow + _startTimeout;
        while (true)
        {
            if (process.HasExited)
            {
                await process.WaitForExitAsync(CancellationToken.None);
                tunnel.Process = null;
                string errors; lock (tunnel.Errors) errors = tunnel.Errors.ToString();
                throw await ClassifyAsync(tunnel, errors);
            }
            if (await AcceptsAsync(tunnel.LocalPort, token)) return;
            if (DateTime.UtcNow > deadline || token.IsCancellationRequested)
            {
                Stop(process); tunnel.Process = null;
                token.ThrowIfCancellationRequested();
                throw new InvalidOperationException($"The SSH tunnel to {tunnel.Settings.Display} did not open within {(int)_startTimeout.TotalSeconds} seconds.");
            }
            await Task.Delay(150, CancellationToken.None);
        }
    }

    private async Task<Exception> ClassifyAsync(Tunnel tunnel, string errors)
    {
        var s = tunnel.Settings;
        string Last() => errors.Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).LastOrDefault() ?? "ssh ended without a message.";
        if (errors.Contains("REMOTE HOST IDENTIFICATION HAS CHANGED", StringComparison.OrdinalIgnoreCase))
            return new InvalidOperationException($"The SSH host key of {s.Host} has changed. fbsDB will not connect. Check with the server's administrator, then update known_hosts yourself.");
        if (errors.Contains("Host key verification failed", StringComparison.OrdinalIgnoreCase))
        {
            var offer = await ScanHostKeyAsync(s.Host, s.Port);
            return offer is { } found ? new SshHostKeyUnknownException(s.Host, s.Port, found.Type, found.Fingerprint)
                : new InvalidOperationException($"The SSH server {s.Host}:{s.Port} is not in known_hosts and its key could not be read.");
        }
        if (Regex.IsMatch(errors, @"(cannot listen to port|Address already in use|bind \[|Could not request local forwarding)", RegexOptions.IgnoreCase)) return new SshPortTakenException();
        if (errors.Contains("Permission denied", StringComparison.OrdinalIgnoreCase))
            return new InvalidOperationException($"SSH sign-in to {s.Display} failed: no key was accepted. Load your key into ssh-agent or set the key file in the connection.");
        if (errors.Contains("Could not resolve hostname", StringComparison.OrdinalIgnoreCase))
            return new InvalidOperationException($"The SSH host {s.Host} could not be resolved.");
        return new InvalidOperationException($"The SSH tunnel to {s.Display} failed: {Last()}");
    }

    private static async Task<bool> AcceptsAsync(int port, CancellationToken token)
    {
        try
        {
            using var client = new TcpClient();
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(token); timeout.CancelAfter(300);
            await client.ConnectAsync(IPAddress.Loopback, port, timeout.Token);
            return true;
        }
        catch (Exception error) when (error is SocketException or OperationCanceledException) { return false; }
    }

    private static int FreeLocalPort()
    {
        var listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        try { return ((IPEndPoint)listener.LocalEndpoint).Port; } finally { listener.Stop(); }
    }

    private static void Stop(Process? process)
    {
        if (process is null) return;
        try { if (!process.HasExited) process.Kill(entireProcessTree: true); } catch (InvalidOperationException) { }
        process.Dispose();
    }

    // Host keys: the key is read with ssh-keyscan and shown as a SHA256
    // fingerprint. Only a key the user confirmed by that fingerprint is added
    // to known_hosts; a changed key is never replaced here.
    private static readonly string[] KeyPreference = ["ssh-ed25519", "ecdsa-sha2-nistp256", "ecdsa-sha2-nistp384", "ecdsa-sha2-nistp521", "rsa-sha2-512", "rsa-sha2-256", "ssh-rsa"];

    public static string Fingerprint(string base64Key) => "SHA256:" + Convert.ToBase64String(SHA256.HashData(Convert.FromBase64String(base64Key))).TrimEnd('=');

    public static (string Type, string Key)? PreferredKey(string keyscanOutput)
    {
        var keys = keyscanOutput.Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Where(line => !line.StartsWith('#')).Select(line => line.Split(' ', StringSplitOptions.RemoveEmptyEntries))
            .Where(parts => parts.Length >= 3 && Regex.IsMatch(parts[2], @"^[A-Za-z0-9+/]+={0,2}$")).Select(parts => (Type: parts[1], Key: parts[2])).ToList();
        foreach (var type in KeyPreference) if (keys.FirstOrDefault(k => k.Type == type) is { Type: not null } found) return found;
        return keys.Count > 0 ? keys[0] : null;
    }

    public static string KnownHostsPattern(string host, int port) => port == 22 ? host : $"[{host}]:{port}";

    public async Task<(string Type, string Fingerprint)?> ScanHostKeyAsync(string host, int port)
    {
        var start = new ProcessStartInfo(_tools.Keyscan) { UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true };
        foreach (var argument in _tools.KeyscanPrefix) start.ArgumentList.Add(argument);
        foreach (var argument in new[] { "-T", "5", "-p", port.ToString(), "-t", "ed25519,ecdsa,rsa", host }) start.ArgumentList.Add(argument);
        string output;
        try
        {
            using var process = Process.Start(start)!;
            var reading = process.StandardOutput.ReadToEndAsync();
            _ = process.StandardError.ReadToEndAsync();
            using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(15));
            await process.WaitForExitAsync(timeout.Token);
            output = await reading;
        }
        catch (Exception error) when (error is System.ComponentModel.Win32Exception or OperationCanceledException or InvalidOperationException) { return null; }
        if (PreferredKey(output) is not { } key) return null;
        var fingerprint = Fingerprint(key.Key);
        lock (_gate) _offers[$"{host}:{port}"] = (key.Type, key.Key, fingerprint);
        return (key.Type, fingerprint);
    }

    public async Task TrustHostAsync(string host, int port, string fingerprint)
    {
        (string Type, string Key, string Fingerprint) offer;
        lock (_gate)
        {
            if (!_offers.TryGetValue($"{host}:{port}", out offer) || offer.Fingerprint != fingerprint)
                throw new InvalidOperationException("That SSH host key is no longer on offer. Connect again to see its fingerprint.");
            _offers.Remove($"{host}:{port}");
        }
        Directory.CreateDirectory(Path.GetDirectoryName(_tools.KnownHosts)!);
        var existing = File.Exists(_tools.KnownHosts) ? await File.ReadAllTextAsync(_tools.KnownHosts) : "";
        var line = $"{KnownHostsPattern(host, port)} {offer.Type} {offer.Key}";
        if (existing.Split('\n').Any(item => item.Trim() == line)) return;
        var separator = existing.Length > 0 && !existing.EndsWith('\n') ? "\n" : "";
        await File.AppendAllTextAsync(_tools.KnownHosts, separator + line + "\n");
    }
}
