using Oracle.ManagedDataAccess.Client;

namespace FbsDb.Services;

public sealed partial class OracleSessionService
{
    private bool _analysisReadOnly;
    public bool AnalysisReadOnly => _analysisReadOnly;
    private readonly HashSet<string> _executedSqlIds = new(StringComparer.Ordinal);

    public async Task BeginReadOnlyAnalysisAsync(CancellationToken token = default)
    {
        await _gate.WaitAsync(token);
        try
        {
            if (!IsConnected) throw new InvalidOperationException("Connect before starting read-only analysis.");
            if (_transaction is not null) throw new InvalidOperationException("Commit or roll back the current transaction before starting read-only analysis.");
            await CloseAllPagedResultsAsync();
            _transaction = _connection!.BeginTransaction();
            try
            {
                await using var command = _connection.CreateCommand();
                command.Transaction = _transaction; command.CommandTimeout = 5;
                // Must be the first statement; BeginTransaction disables provider auto-commit.
                // https://docs.oracle.com/en/database/oracle/oracle-database/26/sqlrf/SET-TRANSACTION.html
                command.CommandText = "SET TRANSACTION READ ONLY";
                await command.ExecuteNonQueryAsync(token);
                _analysisReadOnly = true;
            }
            catch
            {
                try { await _transaction.RollbackAsync(CancellationToken.None); }
                finally { await _transaction.DisposeAsync(); _transaction = null; _analysisReadOnly = false; }
                throw;
            }
        }
        finally { Touch(); _gate.Release(); }
    }

    public async Task<string[]> LoadRuntimePlanAsync(string sqlId, CancellationToken token = default)
    {
        await _gate.WaitAsync(token);
        try
        {
            if (!IsConnected || !_executedSqlIds.Contains(sqlId)) throw new InvalidOperationException("This SQL ID was not executed in the current physical tab session.");
            await using var command = _connection!.CreateCommand();
            command.BindByName = true; command.CommandTimeout = 10;
            if (_transaction is not null) command.Transaction = _transaction;
            command.CommandText = "SELECT PLAN_TABLE_OUTPUT FROM TABLE(DBMS_XPLAN.DISPLAY_CURSOR(:sql_id, NULL, 'ALLSTATS LAST'))";
            command.Parameters.Add("sql_id", OracleDbType.Varchar2).Value = sqlId;
            try
            {
                await using var reader = await command.ExecuteReaderAsync(token);
                var lines = new List<string>();
                while (await reader.ReadAsync(token)) { if (lines.Count == 10000) throw new InvalidOperationException("The cursor plan exceeds the display limit."); lines.Add(reader.IsDBNull(0) ? "" : reader.GetString(0)); }
                var diagnostic=string.Join("\n",lines);
                if(diagnostic.Contains("no SELECT privilege",StringComparison.OrdinalIgnoreCase)||diagnostic.Contains("insufficient privileges",StringComparison.OrdinalIgnoreCase))throw new InvalidOperationException("Cursor plan unavailable. DBMS_XPLAN.DISPLAY_CURSOR requires access to V$SQL, V$SESSION, V$SQL_PLAN and V$SQL_PLAN_STATISTICS_ALL. Existing query results are preserved.");
                if(diagnostic.Contains("cannot fetch plan",StringComparison.OrdinalIgnoreCase)||diagnostic.Contains("cannot find plan",StringComparison.OrdinalIgnoreCase))throw new InvalidOperationException("The executed SQL ID has no accessible cached cursor plan. It may have aged out or require additional Oracle privileges. Existing query results are preserved.");
                return lines.ToArray();
            }
            catch (OracleException error) when (error.Number is 942 or 1031 or 6550)
            {
                throw new InvalidOperationException("Cursor plan unavailable. DBMS_XPLAN.DISPLAY_CURSOR requires access to V$SQL, V$SESSION, V$SQL_PLAN and V$SQL_PLAN_STATISTICS_ALL. No query was rerun and Results are preserved.", error);
            }
        }
        finally { Touch(); _gate.Release(); }
    }
}
