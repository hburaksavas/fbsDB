using Oracle.ManagedDataAccess.Client;

namespace FbsDb.Services;

public sealed partial class OracleSessionService
{
    private async Task RefreshPlsqlTransactionStateAsync(CancellationToken token)
    {
        try
        {
            await using var command = _connection!.CreateCommand(); command.BindByName = true; command.Transaction = _transaction; command.CommandTimeout = 3;
            command.CommandText = "BEGIN :transaction_id := DBMS_TRANSACTION.LOCAL_TRANSACTION_ID(FALSE); END;";
            var value = command.Parameters.Add("transaction_id", OracleDbType.Varchar2, 128); value.Direction = System.Data.ParameterDirection.Output;
            await command.ExecuteNonQueryAsync(token);
            if (value.Value is null or DBNull || value.Value is Oracle.ManagedDataAccess.Types.OracleString text && text.IsNull)
            {
                var previous = _transaction; _transaction = null;
                if (previous is not null) await previous.DisposeAsync();
            }
        }
        catch (OracleException) { /* Keep the transaction pending when the server cannot report its state. */ }
    }

    public async Task<PlsqlCompilationReport?> LoadCompilationDiagnosticsAsync(string sql, CancellationToken token = default)
    {
        var target = OracleSqlUnit.CompilationTarget(sql);
        if (target is null) return null;
        await _gate.WaitAsync(token);
        try
        {
            if (!IsConnected) return null;
            var owner = target.Owner;
            if (owner is null)
            {
                await using var current = _connection!.CreateCommand(); current.CommandTimeout = 5;
                current.CommandText = "SELECT SYS_CONTEXT('USERENV','CURRENT_SCHEMA') FROM dual";
                owner = Convert.ToString(await current.ExecuteScalarAsync(token)) ?? "";
            }
            var errors = new List<PlsqlCompilationError>();
            await using (var command = CompletionCommand("SELECT line,position,text,attribute,message_number FROM all_errors WHERE owner=:owner AND name=:name AND type=:objectType ORDER BY sequence", owner, target.Name))
            {
                command.Parameters.Add("objectType", OracleDbType.Varchar2).Value = target.Type;
                await using var reader = await command.ExecuteReaderAsync(token);
                while (await reader.ReadAsync(token)) errors.Add(new PlsqlCompilationError(reader.GetInt32(0), reader.GetInt32(1), reader.GetString(2), reader.GetString(3), reader.IsDBNull(4) ? null : reader.GetInt32(4)));
            }
            await using var source = CompletionCommand("SELECT text FROM all_source WHERE owner=:owner AND name=:name AND type=:objectType ORDER BY line", owner, target.Name);
            source.Parameters.Add("objectType", OracleDbType.Varchar2).Value = target.Type;
            var text = new System.Text.StringBuilder();
            await using var sourceReader = await source.ExecuteReaderAsync(token);
            while (await sourceReader.ReadAsync(token)) text.Append(sourceReader.GetString(0));
            await sourceReader.DisposeAsync();
            OracleSourceSnapshot? snapshot = null;
            try { snapshot = await ReadSourceSnapshotUnderGateAsync(sql, token); }
            catch (Exception error) when (error is OracleException or InvalidOperationException) { }
            return new PlsqlCompilationReport(owner, target.Name, target.Type, text.ToString(), errors) { Snapshot = snapshot?.Source == text.ToString() ? snapshot : null };
        }
        finally { Touch(); _gate.Release(); }
    }

    public async Task<PlscopeReport> LoadPlscopeAsync(string owner, string name, string type, string? member, CancellationToken token)
    {
        await _gate.WaitAsync(token);
        try
        {
            string? settings;
            await using (var command = CompletionCommand("SELECT plscope_settings FROM all_plsql_object_settings WHERE owner=:owner AND name=:name AND type=:objectType", owner, name))
            {
                command.Parameters.Add("objectType", OracleDbType.Varchar2).Value = type;
                var value = await command.ExecuteScalarAsync(token); settings = value is null or DBNull ? null : Convert.ToString(value);
            }
            await using var identifiers = CompletionCommand("""
                SELECT owner,object_name,object_type,name,type,usage,line,col,signature FROM all_identifiers
                WHERE signature IN (
                    SELECT signature FROM all_identifiers WHERE owner=:owner AND object_name=:name
                    AND object_type=:objectType AND name=:member AND usage IN ('DECLARATION','DEFINITION')
                ) ORDER BY owner,object_name,object_type,line,col FETCH FIRST 2001 ROWS ONLY
                """, owner, name);
            identifiers.Parameters.Add("objectType", OracleDbType.Varchar2).Value = type;
            identifiers.Parameters.Add("member", OracleDbType.Varchar2).Value = member ?? name;
            var references = new List<PlscopeReference>();
            await using var reader = await identifiers.ExecuteReaderAsync(token);
            while (await reader.ReadAsync(token)) references.Add(new PlscopeReference(reader.GetString(0), reader.GetString(1), reader.GetString(2), reader.GetString(3), reader.GetString(4), reader.GetString(5), reader.IsDBNull(6) ? 0 : reader.GetInt32(6), reader.IsDBNull(7) ? 0 : reader.GetInt32(7)));
            return new PlscopeReport(settings, references.Take(2000).ToArray(), references.Count > 2000);
        }
        finally { Touch(); _gate.Release(); }
    }
}

public sealed record PlsqlCompilationError(int Line, int Position, string Text, string Attribute, int? Number);
public sealed record PlsqlCompilationReport(string Owner, string Name, string Type, string Source, IReadOnlyList<PlsqlCompilationError> Errors)
{
    public OracleSourceSnapshot? Snapshot { get; init; }
}
public sealed record PlscopeReference(string Owner, string ObjectName, string ObjectType, string Name, string Type, string Usage, int Line, int Column);
public sealed record PlscopeReport(string? Settings, IReadOnlyList<PlscopeReference> References, bool Truncated);
