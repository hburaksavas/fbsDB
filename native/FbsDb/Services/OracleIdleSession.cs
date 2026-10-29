using Oracle.ManagedDataAccess.Client;

namespace FbsDb.Services;

public sealed partial class OracleSessionService
{
    private DateTime _lastUse = DateTime.UtcNow;
    public bool IsInactive { get; private set; }
    public void Touch() => _lastUse = DateTime.UtcNow;

    public async Task<bool> SuspendIfIdleAsync(TimeSpan timeout)
    {
        if (!await _gate.WaitAsync(0)) return false;
        try
        {
            if (!IsConnected || HasPendingTransaction || _analysisReadOnly || DateTime.UtcNow - _lastUse < timeout) return false;
            await CloseAllPagedResultsAsync();
            await _connection!.CloseAsync();
            IsInactive = true;
            return true;
        }
        finally { _gate.Release(); }
    }

    public async Task ResumeIfInactiveAsync()
    {
        await _gate.WaitAsync();
        try
        {
            Touch();
            if (!IsInactive || _connection is null) return;
            await _connection.OpenAsync();
            try
            {
                if (_configuredNls.Count > 0) await ApplyNlsConnectionAsync(_connection, _configuredNls, default);
                await using var command = _connection.CreateCommand();
                command.CommandText = "BEGIN DBMS_OUTPUT.ENABLE(NULL); END;";
                await command.ExecuteNonQueryAsync();
                IsInactive = false;
            }
            catch { await _connection.CloseAsync(); throw; }
        }
        finally { _gate.Release(); }
    }
}
