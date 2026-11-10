using System.Data;
using Oracle.ManagedDataAccess.Client;

namespace FbsDb.Services;

// FI-031: line-level PL/SQL profiling with DBMS_PROFILER in this session.
// DBMS_PROFILER writes its own rows in autonomous transactions: the session's
// transaction is left as it is, and the profiled code's changes wait for
// Commit or Rollback as after Run. Results are read and then deleted through a
// second connection, leaving the PLSQL_PROFILER_* tables empty.
public sealed record ProfileLine(int Line, long Occurrences, long TotalNs, long MinNs, long MaxNs);
public sealed record ProfileUnit(string Owner, string Name, string Type, long TotalNs, IReadOnlyList<ProfileLine> Lines);
public sealed record ProfileReport(int RunId, long TotalNs, IReadOnlyList<ProfileUnit> Units);
public sealed record ProfilerState(bool TablesReady, IReadOnlyList<string> Missing, bool TransactionPending);

public sealed partial class OracleSessionService
{
    private static readonly (string Name, string Kind, string Ddl)[] ProfilerObjects =
    [
        ("PLSQL_PROFILER_RUNS", "TABLE", "CREATE TABLE plsql_profiler_runs (runid NUMBER PRIMARY KEY, related_run NUMBER, run_owner VARCHAR2(128), run_date DATE, run_comment VARCHAR2(2047), run_total_time NUMBER, run_system_info VARCHAR2(2047), run_comment1 VARCHAR2(2047), spare1 VARCHAR2(256))"),
        ("PLSQL_PROFILER_UNITS", "TABLE", "CREATE TABLE plsql_profiler_units (runid NUMBER REFERENCES plsql_profiler_runs, unit_number NUMBER, unit_type VARCHAR2(128), unit_owner VARCHAR2(128), unit_name VARCHAR2(128), unit_timestamp DATE, total_time NUMBER DEFAULT 0 NOT NULL, spare1 NUMBER, spare2 NUMBER, PRIMARY KEY (runid, unit_number))"),
        ("PLSQL_PROFILER_DATA", "TABLE", "CREATE TABLE plsql_profiler_data (runid NUMBER, unit_number NUMBER, line# NUMBER NOT NULL, total_occur NUMBER, total_time NUMBER, min_time NUMBER, max_time NUMBER, spare1 NUMBER, spare2 NUMBER, spare3 NUMBER, spare4 NUMBER, PRIMARY KEY (runid, unit_number, line#), FOREIGN KEY (runid, unit_number) REFERENCES plsql_profiler_units)"),
        ("PLSQL_PROFILER_RUNNUMBER", "SEQUENCE", "CREATE SEQUENCE plsql_profiler_runnumber START WITH 1 NOCACHE"),
    ];

    public static IReadOnlyList<string> ProfilerDdl => ProfilerObjects.Select(item => item.Ddl).ToArray();

    private int? _profileRunId;
    public int? ProfileRunId => _profileRunId;

    // The objects DBMS_PROFILER writes to, in this schema or through a public synonym.
    public async Task<ProfilerState> ProfilerStateAsync(CancellationToken token = default)
    {
        await _gate.WaitAsync(token);
        try
        {
            if (_connection is null) throw new InvalidOperationException("Connect this tab to Oracle before profiling.");
            await using var command = _connection.CreateCommand();
            command.CommandText = "SELECT object_name FROM all_objects WHERE object_name IN ('PLSQL_PROFILER_RUNS','PLSQL_PROFILER_UNITS','PLSQL_PROFILER_DATA','PLSQL_PROFILER_RUNNUMBER') AND (owner = SYS_CONTEXT('USERENV','CURRENT_SCHEMA') OR owner = 'PUBLIC')";
            var found = new HashSet<string>();
            await using (var reader = await command.ExecuteReaderAsync(token)) while (await reader.ReadAsync(token)) found.Add(reader.GetString(0));
            var missing = ProfilerObjects.Select(item => item.Name).Where(name => !found.Contains(name)).ToArray();
            return new(missing.Length == 0, missing, HasPendingTransaction);
        }
        finally { Touch(); _gate.Release(); }
    }

    public async Task CreateProfilerTablesAsync(CancellationToken token = default)
    {
        var state = await ProfilerStateAsync(token);
        await _gate.WaitAsync(token);
        try
        {
            if (_connection is null) throw new InvalidOperationException("Connect this tab to Oracle before profiling.");
            if (_transaction is not null) throw new InvalidOperationException("Commit or roll back first: creating tables ends the open transaction.");
            foreach (var item in ProfilerObjects.Where(item => state.Missing.Contains(item.Name)))
            {
                await using var command = _connection.CreateCommand();
                command.CommandText = item.Ddl;
                await command.ExecuteNonQueryAsync(token);
            }
        }
        finally { Touch(); _gate.Release(); }
    }

    public async Task<int> StartProfilerAsync(CancellationToken token = default)
    {
        await _gate.WaitAsync(token);
        try
        {
            if (_connection is null) throw new InvalidOperationException("Connect this tab to Oracle before profiling.");
            if (_profileRunId is not null) throw new InvalidOperationException("This tab is already profiling.");
            if (IsInactive) throw new InvalidOperationException("The session is inactive. Run a statement to resume it, then profile.");
            await using var command = _connection.CreateCommand();
            command.CommandText = "DECLARE r BINARY_INTEGER; BEGIN DBMS_PROFILER.START_PROFILER(run_comment => 'fbsDB', run_number => r); :run := r; END;";
            var run = command.Parameters.Add("run", OracleDbType.Int32); run.Direction = ParameterDirection.Output;
            await command.ExecuteNonQueryAsync(token);
            _profileRunId = run.Value is Oracle.ManagedDataAccess.Types.OracleDecimal { IsNull: false } value ? value.ToInt32() : throw new InvalidOperationException("DBMS_PROFILER did not return a run number.");
            return _profileRunId.Value;
        }
        finally { Touch(); _gate.Release(); }
    }

    // Stops collecting (the profiler flushes its data on its own), then reads
    // the run through a second connection and deletes it there.
    public async Task<ProfileReport> FinishProfilerAsync(CancellationToken token = default)
    {
        int runId;
        await _gate.WaitAsync(token);
        try
        {
            runId = _profileRunId ?? throw new InvalidOperationException("This tab is not profiling.");
            _profileRunId = null;
            if (_connection is not null && _connection.State == ConnectionState.Open)
            {
                await using var stop = _connection.CreateCommand();
                stop.CommandText = "BEGIN DBMS_PROFILER.STOP_PROFILER; END;";
                await stop.ExecuteNonQueryAsync(token);
            }
        }
        finally { Touch(); _gate.Release(); }
        await using var reader = new OracleConnection(_debugConnectionString ?? throw new InvalidOperationException("The session closed before the profile was read."));
        await reader.OpenAsync(token);
        var report = await ReadProfileAsync(reader, runId, token);
        await DeleteProfileRunAsync(reader, runId, token);
        return report;
    }

    internal static async Task<ProfileReport> ReadProfileAsync(OracleConnection connection, int runId, CancellationToken token)
    {
        long total = 0;
        await using (var command = connection.CreateCommand())
        {
            command.CommandText = "SELECT NVL(run_total_time, 0) FROM plsql_profiler_runs WHERE runid = :run";
            command.Parameters.Add("run", OracleDbType.Int32).Value = runId;
            total = Convert.ToInt64(await command.ExecuteScalarAsync(token) ?? 0L);
        }
        var units = new List<(int Number, string Owner, string Name, string Type, List<ProfileLine> Lines)>();
        await using (var command = connection.CreateCommand())
        {
            command.BindByName = true;
            command.CommandText = """
                SELECT u.unit_number, u.unit_owner, u.unit_name, u.unit_type, d.line#, NVL(d.total_occur, 0), NVL(d.total_time, 0), NVL(d.min_time, 0), NVL(d.max_time, 0)
                FROM plsql_profiler_units u JOIN plsql_profiler_data d ON d.runid = u.runid AND d.unit_number = u.unit_number
                WHERE u.runid = :run AND (d.total_occur > 0 OR d.total_time > 0)
                ORDER BY u.unit_number, d.line#
                """;
            command.Parameters.Add("run", OracleDbType.Int32).Value = runId;
            await using var reader = await command.ExecuteReaderAsync(token);
            while (await reader.ReadAsync(token))
            {
                var number = reader.GetInt32(0);
                if (units.Count == 0 || units[^1].Number != number) units.Add((number, reader.GetString(1), reader.GetString(2), reader.GetString(3), []));
                units[^1].Lines.Add(new(reader.GetInt32(4), reader.GetInt64(5), reader.GetInt64(6), reader.GetInt64(7), reader.GetInt64(8)));
            }
        }
        // Anonymous blocks are the wrappers of the call itself; they are merged into one entry.
        var result = units.GroupBy(u => u.Type == "ANONYMOUS BLOCK" ? "<anonymous>" : $"{u.Owner}.{u.Name}.{u.Type}")
            .Select(group => { var first = group.First(); var lines = group.SelectMany(u => u.Lines).GroupBy(l => l.Line).Select(g => new ProfileLine(g.Key, g.Sum(l => l.Occurrences), g.Sum(l => l.TotalNs), g.Min(l => l.MinNs), g.Max(l => l.MaxNs))).OrderBy(l => l.Line).ToArray();
                return new ProfileUnit(first.Type == "ANONYMOUS BLOCK" ? "" : first.Owner, first.Type == "ANONYMOUS BLOCK" ? "" : first.Name, first.Type, lines.Sum(l => l.TotalNs), lines); })
            .OrderByDescending(unit => unit.TotalNs).ToArray();
        return new(runId, Math.Max(total, result.Sum(unit => unit.TotalNs)), result);
    }

    internal static async Task DeleteProfileRunAsync(OracleConnection connection, int runId, CancellationToken token)
    {
        await using var transaction = connection.BeginTransaction();
        foreach (var table in new[] { "plsql_profiler_data", "plsql_profiler_units", "plsql_profiler_runs" })
        {
            await using var command = connection.CreateCommand();
            command.Transaction = transaction;
            command.CommandText = $"DELETE FROM {table} WHERE runid = :run";
            command.Parameters.Add("run", OracleDbType.Int32).Value = runId;
            await command.ExecuteNonQueryAsync(token);
        }
        await transaction.CommitAsync(token);
    }
}
