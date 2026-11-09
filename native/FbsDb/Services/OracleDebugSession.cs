using System.Data;
using Oracle.ManagedDataAccess.Client;

namespace FbsDb.Services;

// FI-007: this session as the target of DBMS_DEBUG.
public sealed partial class OracleSessionService
{
    // The connect string of this session for the debugger's second connection;
    // kept in memory only while connected.
    private string? _debugConnectionString;

    public async Task<string> EnableDebugAsync(CancellationToken token = default)
    {
        await _gate.WaitAsync(token);
        try
        {
            if (_connection is null || _debugConnectionString is null) throw new InvalidOperationException("Connect this tab to Oracle before debugging.");
            if (IsInactive) throw new InvalidOperationException("The session is inactive. Run a statement to resume it, then debug.");
            await using var privilege = _connection.CreateCommand();
            privilege.CommandText = "SELECT COUNT(*) FROM session_privs WHERE privilege = 'DEBUG CONNECT SESSION'";
            if (Convert.ToInt32(await privilege.ExecuteScalarAsync(token)) == 0)
                throw new InvalidOperationException("This account lacks DEBUG CONNECT SESSION. Ask a DBA for: GRANT DEBUG CONNECT SESSION TO <user>; units of other schemas also need GRANT DEBUG ON <unit>.");
            await using var command = _connection.CreateCommand();
            command.CommandText = "BEGIN :id := DBMS_DEBUG.INITIALIZE(); DBMS_DEBUG.DEBUG_ON(); END;";
            var id = command.Parameters.Add("id", OracleDbType.Varchar2, 200); id.Direction = ParameterDirection.Output;
            await command.ExecuteNonQueryAsync(token);
            Touch();
            return id.Value?.ToString() ?? throw new InvalidOperationException("DBMS_DEBUG did not return a debug session.");
        }
        finally { _gate.Release(); }
    }

    // Called after the debugged call ended; it waits for the statement to release the session.
    public async Task DisableDebugAsync()
    {
        await _gate.WaitAsync();
        try
        {
            if (_connection is null || _connection.State != ConnectionState.Open) return;
            await using var command = _connection.CreateCommand();
            command.CommandText = "BEGIN DBMS_DEBUG.DEBUG_OFF; END;";
            await command.ExecuteNonQueryAsync();
        }
        catch (OracleException) { }
        finally { _gate.Release(); }
    }

    // Ends a debug run: the debugger lets the session's remaining calls through
    // until the statement has finished, then debugging is switched off.
    public async Task FinishDebugAsync(PlsqlDebugger debugger)
    {
        using var stop = new CancellationTokenSource();
        var drain = Task.Run(() => debugger.DrainAsync(stop.Token));
        try { await DisableDebugAsync(); }
        finally
        {
            stop.Cancel();
            try { await drain.WaitAsync(TimeSpan.FromSeconds(10)); } catch (Exception) { }
        }
    }

    public Task<PlsqlDebugger> AttachDebuggerAsync(string sessionId, CancellationToken token) =>
        PlsqlDebugger.AttachAsync(_debugConnectionString ?? throw new InvalidOperationException("Connect this tab to Oracle before debugging."), sessionId, token);

    public async Task<IReadOnlyList<DebugObjectState>> DebugObjectStatesAsync(IEnumerable<(string Owner, string Name, string Type)> objects, CancellationToken token = default)
    {
        await _gate.WaitAsync(token);
        try
        {
            if (_connection is null) throw new InvalidOperationException("Connect this tab to Oracle before debugging.");
            return await PlsqlDebugger.ObjectStatesAsync(_connection, objects, token);
        }
        finally { Touch(); _gate.Release(); }
    }

    public async Task CompileForDebugAsync(IEnumerable<(string Owner, string Name, string Type)> objects, CancellationToken token = default)
    {
        await _gate.WaitAsync(token);
        try
        {
            if (_connection is null) throw new InvalidOperationException("Connect this tab to Oracle before debugging.");
            if (_transaction is not null) throw new InvalidOperationException("Commit or roll back first: compiling ends the open transaction.");
            foreach (var (owner, name, type) in objects.Distinct())
            {
                await using var command = _connection.CreateCommand();
                command.CommandText = PlsqlDebugger.CompileDebugStatement(PlsqlDebugger.Validate(owner, "schema"), PlsqlDebugger.Validate(name, "unit"), type);
                await command.ExecuteNonQueryAsync(token);
            }
        }
        finally { Touch(); _gate.Release(); }
    }
}
