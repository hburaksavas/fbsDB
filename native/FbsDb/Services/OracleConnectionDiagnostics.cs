using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using Oracle.ManagedDataAccess.Client;

namespace FbsDb.Services;

public sealed partial class OracleSessionService
{
    public async Task<ConnectionDiagnosticReport> DiagnoseConnectionAsync(ConnectionProfile profile, string user, string password, CancellationToken token = default)
    {
        var steps = new List<ConnectionDiagnosticStep>();
        if (!profile.Available) return new(false, [new("Target", "Failed", "Connection target is unavailable.", 0)]);
        steps.Add(new("Target", "Succeeded", $"{profile.Method.ToUpperInvariant()} connection target resolved.", 0));
        if (string.IsNullOrEmpty(password))
        {
            var saved = await GetSavedCredentialsAsync(profile.Id);
            if (saved is not null && (string.IsNullOrWhiteSpace(user) || user.Equals(saved.Value.User, StringComparison.OrdinalIgnoreCase))) (user, password) = saved.Value;
        }
        if (string.IsNullOrWhiteSpace(user) || string.IsNullOrEmpty(password)) return new(false, [..steps, new("Authentication", "Failed", "Enter a username and password to test.", 0)]);
        var timer = Stopwatch.StartNew();
        SshTunnelLease? lease = null;
        if (profile.Ssh is { } ssh)
        {
            // The database host is resolved by the SSH server, so the local DNS and TCP probes do not apply.
            try { lease = await SshTunnelRegistry.Shared.AcquireAsync(profile, token); }
            catch (SshHostKeyUnknownException unknown) { return new(false, [..steps, new("SSH tunnel", "Failed", unknown.Message, timer.ElapsedMilliseconds)]) { SshHostKey = new(unknown.Host, unknown.Port, unknown.KeyType, unknown.Fingerprint) }; }
            catch (InvalidOperationException error) { return new(false, [..steps, new("SSH tunnel", "Failed", error.Message, timer.ElapsedMilliseconds)]); }
            steps.Add(new("SSH tunnel", "Succeeded", $"Tunnel through {ssh.Display} to {profile.Host}:{profile.Port} is open on local port {lease.LocalPort}.", timer.ElapsedMilliseconds));
            steps.Add(new("DNS", "Skipped", "The SSH server resolves the database host.", 0)); steps.Add(new("Network", "Skipped", "The database listener is reached through the SSH tunnel.", 0));
        }
        await using var tunnel = lease;
        if (lease is null && !string.IsNullOrWhiteSpace(profile.Host) && int.TryParse(profile.Port, out var port) && port is > 0 and <= 65535)
        {
            IPAddress[] addresses = [];
            try
            {
                using var dnsTimeout = CancellationTokenSource.CreateLinkedTokenSource(token); dnsTimeout.CancelAfter(TimeSpan.FromSeconds(3));
                addresses = await Dns.GetHostAddressesAsync(profile.Host, dnsTimeout.Token);
                steps.Add(new("DNS", "Succeeded", $"Resolved {addresses.Length} address(es).", timer.ElapsedMilliseconds));
            }
            catch (Exception error) when (!token.IsCancellationRequested && error is SocketException or OperationCanceledException or ArgumentException) { steps.Add(new("DNS", "Warning", "Probe could not resolve this host; Oracle will still attempt its configured descriptor.", timer.ElapsedMilliseconds)); }
            timer.Restart();
            if (addresses.Length > 0)
            {
                try
                {
                    using var networkTimeout = CancellationTokenSource.CreateLinkedTokenSource(token); networkTimeout.CancelAfter(TimeSpan.FromSeconds(4));
                    using var client = new TcpClient(); await client.ConnectAsync(addresses, port, networkTimeout.Token);
                    steps.Add(new("Network", "Succeeded", "TCP listener endpoint accepted a connection. Oracle service/authentication is checked separately.", timer.ElapsedMilliseconds));
                }
                catch (Exception error) when (!token.IsCancellationRequested && error is SocketException or OperationCanceledException) { steps.Add(new("Network", "Warning", "TCP probe failed; Oracle will still try descriptor failover and protocol options.", timer.ElapsedMilliseconds)); }
            }
            else steps.Add(new("Network", "Skipped", "No DNS probe addresses available.", 0));
        }
        else if (lease is null) { steps.Add(new("DNS", "Skipped", "Descriptor resolution is delegated to Oracle.", 0)); steps.Add(new("Network", "Skipped", "Descriptor may contain multiple or non-TCP endpoints.", 0)); }
        timer.Restart();
        try
        {
            var builder = new OracleConnectionStringBuilder { DataSource = lease?.DataSource ?? profile.Descriptor, UserID = user, Password = password, Pooling = false, ConnectionTimeout = 15 };
            if (profile.Method == "tns") builder.TnsAdmin = Path.GetDirectoryName(profile.Source);
            await using var connection = new OracleConnection(builder.ConnectionString);
            await connection.OpenAsync(token);
            steps.Add(new("Authentication", "Succeeded", "Oracle accepted the credentials on a temporary connection.", timer.ElapsedMilliseconds));
            timer.Restart();
            await using var command = connection.CreateCommand(); command.CommandTimeout = 5; command.CommandText = "SELECT 1 FROM dual";
            await command.ExecuteScalarAsync(token);
            steps.Add(new("Oracle session", "Succeeded", "Temporary session executed a read-only probe and was closed. Active sessions and saved credentials are unchanged.", timer.ElapsedMilliseconds));
            return new(true, steps);
        }
        catch (OracleException error)
        {
            var stage = error.Number switch { 1017 or 28000 or 28001 or 28002 or 28040 => "Authentication", 12154 => "Target", 12514 or 12505 => "Oracle service", >= 12000 and <= 12999 => "Oracle network", _ => "Oracle session" };
            steps.Add(new(stage, "Failed", $"ORA-{error.Number:D5}: {error.Message.Replace(password, "[redacted]", StringComparison.Ordinal)}", timer.ElapsedMilliseconds));
            return new(false, steps);
        }
    }
}

public sealed record ConnectionDiagnosticStep(string Stage, string Status, string Message, long ElapsedMs);
public sealed record ConnectionDiagnosticReport(bool Success, IReadOnlyList<ConnectionDiagnosticStep> Steps)
{
    // Set when the SSH server's key is not known yet; the user may confirm its fingerprint.
    public SshHostKeyOffer? SshHostKey { get; init; }
}
public sealed record SshHostKeyOffer(string Host, int Port, string KeyType, string Fingerprint);
