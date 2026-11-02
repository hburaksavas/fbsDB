namespace FbsDb.Services;

public sealed record OracleSessionContext(string? ProfileId, string Schema, string Container, string Edition, string Service, string? SessionId = null);

public sealed partial class OracleSessionService
{
    public async Task<OracleSessionContext> ReadSessionContextAsync(CancellationToken token = default)
    {
        await _gate.WaitAsync(token);
        try
        {
            if (!IsConnected) throw new InvalidOperationException("Connect this SQL tab to read its Oracle context.");
            await using var command = _connection!.CreateCommand();
            command.CommandTimeout = 5;
            if (_transaction is not null) command.Transaction = _transaction;
            command.CommandText = "SELECT SYS_CONTEXT('USERENV','CURRENT_SCHEMA'), SYS_CONTEXT('USERENV','CON_NAME'), SYS_CONTEXT('USERENV','CURRENT_EDITION_NAME'), SYS_CONTEXT('USERENV','SERVICE_NAME'), SYS_CONTEXT('USERENV','SID') FROM dual";
            await using var reader = await command.ExecuteReaderAsync(token);
            if (!await reader.ReadAsync(token)) throw new InvalidOperationException("Oracle session context was not returned.");
            string Value(int index) => reader.IsDBNull(index) ? "" : reader.GetString(index);
            return new(ProfileId, Value(0), Value(1), Value(2), Value(3), Value(4));
        }
        finally { Touch(); _gate.Release(); }
    }
}
