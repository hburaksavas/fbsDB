using System.Data;
using System.Text;
using System.Text.RegularExpressions;
using Oracle.ManagedDataAccess.Client;

namespace FbsDb.Services;

// FI-007: PL/SQL debugging with DBMS_DEBUG. The tab's own session is the
// target: it runs the statement after DBMS_DEBUG.DEBUG_ON. This debugger works
// on a second, unpooled connection of the same profile, attached to the
// target's debug session id. Every DBMS_DEBUG record is read field by field
// inside an anonymous block, since ODP.NET cannot bind PL/SQL records.
public sealed record DebugBreakpoint(string Owner, string Name, string Type, int Line);
public sealed record DebugBreakpointResult(string Owner, string Name, string Type, int Line, bool Set, string? Message);
public sealed record DebugFrame(int Frame, string Owner, string Name, string Type, int Line);
public sealed record DebugStop(bool Terminated, int Reason, string? Owner, string? Name, string? Type, int Line, int Depth, IReadOnlyList<DebugFrame> Frames);
public sealed record DebugValue(string Name, string? Value, string State);
public sealed record DebugObjectState(string Owner, string Name, string Type, bool Exists, bool DebugInfo);

public sealed class PlsqlDebugger : IAsyncDisposable
{
    private readonly OracleConnection _connection;
    private readonly SemaphoreSlim _gate = new(1, 1);
    private PlsqlDebugger(OracleConnection connection) => _connection = connection;
    private int _depth;

    public static readonly IReadOnlyList<string> DebuggableTypes = ["PROCEDURE", "FUNCTION", "PACKAGE", "PACKAGE BODY", "TRIGGER", "TYPE", "TYPE BODY"];
    private static readonly Regex OracleName = new(@"^[A-Za-z][A-Za-z0-9_$#]{0,127}$");

    public static string Validate(string value, string what)
    {
        if (!OracleName.IsMatch(value)) throw new InvalidOperationException($"Debugging needs a plain Oracle {what} name; \"{value}\" is not supported.");
        return value.ToUpperInvariant();
    }

    public static async Task<PlsqlDebugger> AttachAsync(string connectionString, string sessionId, CancellationToken token)
    {
        var connection = new OracleConnection(connectionString);
        try
        {
            await connection.OpenAsync(token);
            await using var command = connection.CreateCommand();
            command.CommandText = "BEGIN DBMS_DEBUG.ATTACH_SESSION(:id); END;";
            command.Parameters.Add("id", OracleDbType.Varchar2).Value = sessionId;
            await command.ExecuteNonQueryAsync(token);
            return new PlsqlDebugger(connection);
        }
        catch { await connection.DisposeAsync(); throw; }
    }

    private const string InfoFlags = "DBMS_DEBUG.info_getStackDepth + DBMS_DEBUG.info_getBreakpoint + DBMS_DEBUG.info_getLineinfo";

    // Waits for the target to start its call; the wait ends when it does or the token is cancelled.
    public Task<DebugStop> WaitForStartAsync(CancellationToken token) => StepAsync($"ret := DBMS_DEBUG.SYNCHRONIZE(info, {InfoFlags});", token);

    // After the debugged call the target still makes calls of its own while
    // DEBUG_ON lasts (DBMS_OUTPUT, transaction state). They run straight
    // through here until the token ends the wait.
    public async Task DrainAsync(CancellationToken token)
    {
        while (!token.IsCancellationRequested)
        {
            var stop = await WaitForStartAsync(token);
            while (!stop.Terminated) stop = await ContinueAsync("continue", token);
        }
    }

    public Task<DebugStop> ContinueAsync(string mode, CancellationToken token)
    {
        var flags = mode switch
        {
            "continue" => "0",
            "over" => "DBMS_DEBUG.break_next_line",
            "into" => "DBMS_DEBUG.break_any_call",
            "out" => "DBMS_DEBUG.break_any_return",
            "abort" => "DBMS_DEBUG.abort_execution",
            _ => throw new InvalidOperationException("Unknown debugger step."),
        };
        return StepAsync($"ret := DBMS_DEBUG.CONTINUE(info, {flags}, {InfoFlags});", token);
    }

    private async Task<DebugStop> StepAsync(string call, CancellationToken token)
    {
        await _gate.WaitAsync(token);
        try
        {
            await using var command = _connection.CreateCommand();
            command.BindByName = true;
            command.CommandText = $"""
                DECLARE info DBMS_DEBUG.runtime_info; ret BINARY_INTEGER;
                BEGIN {call}
                  :ret := ret; :line := info.line#; :term := info.terminated; :reason := info.reason; :depth := info.stackdepth;
                  :name := info.program.name; :owner := info.program.owner;
                END;
                """;
            OracleParameter Out(string name, OracleDbType type) { var p = command.Parameters.Add(name, type, 512); p.Direction = ParameterDirection.Output; return p; }
            var ret = Out("ret", OracleDbType.Int32); var line = Out("line", OracleDbType.Int32); var term = Out("term", OracleDbType.Int32);
            var reason = Out("reason", OracleDbType.Int32); var depth = Out("depth", OracleDbType.Int32);
            var name = Out("name", OracleDbType.Varchar2); var owner = Out("owner", OracleDbType.Varchar2);
            await using (token.Register(() => { try { command.Cancel(); } catch (Exception) { } }))
                await command.ExecuteNonQueryAsync(token);
            static int Int(OracleParameter p) => p.Value is Oracle.ManagedDataAccess.Types.OracleDecimal { IsNull: false } d ? d.ToInt32() : 0;
            static string? Text(OracleParameter p) => p.Value is Oracle.ManagedDataAccess.Types.OracleString { IsNull: false } s ? s.Value : null;
            var status = Int(ret);
            if (status != 0) throw new InvalidOperationException(status switch
            {
                31 => "The debugged session ended or was never started (DBMS_DEBUG timeout).",
                _ => $"DBMS_DEBUG returned status {status}.",
            });
            var terminated = Int(term) == 1;
            var frames = terminated ? (IReadOnlyList<DebugFrame>)[] : await BacktraceAsync(token);
            _depth = terminated ? 0 : Int(depth);
            // runtime_info leaves the unit type empty; the top of the backtrace carries it.
            var top = frames.FirstOrDefault();
            var unitType = top is not null && top.Name == Text(name) ? top.Type : null;
            return new DebugStop(terminated, Int(reason), Text(owner), Text(name), unitType, Int(line), Int(depth), frames);
        }
        finally { _gate.Release(); }
    }

    // Frames are numbered like DBMS_DEBUG.GET_VALUE expects them: the backtrace
    // position, so the outermost anonymous block is 1 and the current unit is the deepest.
    private async Task<IReadOnlyList<DebugFrame>> BacktraceAsync(CancellationToken token)
    {
        await using var command = _connection.CreateCommand();
        command.CommandText = """
            DECLARE bt DBMS_DEBUG.backtrace_table; c SYS_REFCURSOR;
            BEGIN DBMS_DEBUG.PRINT_BACKTRACE(bt);
              :frames := '';
              FOR i IN 1..bt.COUNT LOOP
                :frames := :frames || i || CHR(9) || bt(i).owner || CHR(9) || bt(i).name || CHR(9) || bt(i).line# || CHR(9) ||
                  CASE bt(i).libunittype WHEN DBMS_DEBUG.LibunitType_procedure THEN 'PROCEDURE' WHEN DBMS_DEBUG.LibunitType_function THEN 'FUNCTION'
                    WHEN DBMS_DEBUG.LibunitType_package THEN 'PACKAGE' WHEN DBMS_DEBUG.LibunitType_package_body THEN 'PACKAGE BODY' WHEN DBMS_DEBUG.LibunitType_trigger THEN 'TRIGGER' ELSE 'BLOCK' END || CHR(10);
              END LOOP;
            END;
            """;
        var frames = command.Parameters.Add("frames", OracleDbType.Varchar2, 32767); frames.Direction = ParameterDirection.InputOutput; frames.Value = "";
        await command.ExecuteNonQueryAsync(token);
        var text = frames.Value is Oracle.ManagedDataAccess.Types.OracleString { IsNull: false } s ? s.Value : "";
        return text.Split('\n', StringSplitOptions.RemoveEmptyEntries).Select(row => row.Split('\t')).Where(parts => parts.Length == 5)
            .Select(parts => new DebugFrame(int.Parse(parts[0]), parts[1], parts[2], parts[4], int.TryParse(parts[3], out var l) ? l : 0)).Reverse().ToArray();
    }

    public async Task<IReadOnlyList<DebugBreakpointResult>> SetBreakpointsAsync(IEnumerable<DebugBreakpoint> breakpoints, CancellationToken token)
    {
        var results = new List<DebugBreakpointResult>();
        await _gate.WaitAsync(token);
        try
        {
            foreach (var bp in breakpoints)
            {
                await using var command = _connection.CreateCommand();
                command.BindByName = true;
                var space = bp.Type is "PACKAGE BODY" or "TYPE BODY" ? "DBMS_DEBUG.namespace_pkg_body" : bp.Type == "TRIGGER" ? "DBMS_DEBUG.namespace_trigger" : "DBMS_DEBUG.namespace_pkgspec_or_toplevel";
                command.CommandText = $"DECLARE pi DBMS_DEBUG.program_info; n BINARY_INTEGER; BEGIN pi.namespace := {space}; pi.name := :name; pi.owner := :owner; pi.dblink := NULL; pi.entrypointname := NULL; :ret := DBMS_DEBUG.SET_BREAKPOINT(pi, :line, n); END;";
                command.Parameters.Add("name", OracleDbType.Varchar2).Value = bp.Name;
                command.Parameters.Add("owner", OracleDbType.Varchar2).Value = bp.Owner;
                command.Parameters.Add("line", OracleDbType.Int32).Value = bp.Line;
                var ret = command.Parameters.Add("ret", OracleDbType.Int32); ret.Direction = ParameterDirection.Output;
                await command.ExecuteNonQueryAsync(token);
                var status = ret.Value is Oracle.ManagedDataAccess.Types.OracleDecimal { IsNull: false } d ? d.ToInt32() : -1;
                results.Add(new(bp.Owner, bp.Name, bp.Type, bp.Line, status == 0, status switch
                {
                    0 => null,
                    1 or 3 => "This line has no executable code compiled with debug information.",
                    _ => $"Oracle refused the breakpoint (DBMS_DEBUG status {status}).",
                }));
            }
        }
        finally { _gate.Release(); }
        return results;
    }

    public async Task<IReadOnlyList<DebugValue>> ValuesAsync(int frame, IEnumerable<string> names, CancellationToken token)
    {
        var values = new List<DebugValue>();
        await _gate.WaitAsync(token);
        try
        {
            foreach (var name in names.Distinct(StringComparer.OrdinalIgnoreCase).Take(200))
            {
                await using var command = _connection.CreateCommand();
                command.BindByName = true;
                command.CommandText = "DECLARE v VARCHAR2(32767); BEGIN :ret := DBMS_DEBUG.GET_VALUE(:name, :frame, v, NULL); :v := SUBSTR(v, 1, 4000); END;";
                var ret = command.Parameters.Add("ret", OracleDbType.Int32); ret.Direction = ParameterDirection.Output;
                command.Parameters.Add("name", OracleDbType.Varchar2).Value = name;
                // The current unit is frame 0; asking for it by its stack position makes GET_VALUE wait forever.
                command.Parameters.Add("frame", OracleDbType.Int32).Value = frame >= _depth ? 0 : frame;
                var value = command.Parameters.Add("v", OracleDbType.Varchar2, 4000); value.Direction = ParameterDirection.Output;
                await command.ExecuteNonQueryAsync(token);
                var status = ret.Value is Oracle.ManagedDataAccess.Types.OracleDecimal { IsNull: false } d ? d.ToInt32() : -1;
                var text = value.Value is Oracle.ManagedDataAccess.Types.OracleString { IsNull: false } s ? s.Value : null;
                // 0: value, 32: NULL, 3: not in scope here, anything else: not readable (records, collections, cursors).
                if (status == 3) continue;
                values.Add(new(name, status == 0 ? text : null, status switch { 0 => "value", 32 => "null", _ => "unavailable" }));
            }
        }
        finally { _gate.Release(); }
        return values;
    }

    public async Task<string> SourceAsync(string owner, string name, string type, CancellationToken token)
    {
        await _gate.WaitAsync(token);
        try
        {
            await using var command = _connection.CreateCommand();
            command.BindByName = true;
            command.CommandText = "SELECT text FROM all_source WHERE owner = :owner AND name = :name AND type = :type ORDER BY line";
            command.Parameters.Add("owner", OracleDbType.Varchar2).Value = owner;
            command.Parameters.Add("name", OracleDbType.Varchar2).Value = name;
            command.Parameters.Add("type", OracleDbType.Varchar2).Value = type;
            var source = new StringBuilder();
            await using var reader = await command.ExecuteReaderAsync(token);
            while (await reader.ReadAsync(token)) { source.Append(reader.GetString(0)); if (source.Length > 4_000_000) throw new InvalidOperationException("Source exceeds the navigation limit."); }
            if (source.Length == 0) throw new InvalidOperationException("The source of this unit is unavailable to this account.");
            return source.ToString();
        }
        finally { _gate.Release(); }
    }

    public async ValueTask DisposeAsync()
    {
        try
        {
            if (_connection.State == ConnectionState.Open)
            {
                await using var command = _connection.CreateCommand();
                command.CommandText = "BEGIN DBMS_DEBUG.DETACH_SESSION; END;";
                command.CommandTimeout = 5;
                await command.ExecuteNonQueryAsync();
            }
        }
        catch (OracleException) { }
        await _connection.DisposeAsync();
        _gate.Dispose();
    }

    // Which units carry debug information (ALL_PLSQL_OBJECT_SETTINGS.PLSQL_DEBUG; ALL_PROBE_OBJECTS is gone in 26ai).
    public static async Task<IReadOnlyList<DebugObjectState>> ObjectStatesAsync(OracleConnection connection, IEnumerable<(string Owner, string Name, string Type)> objects, CancellationToken token)
    {
        var states = new List<DebugObjectState>();
        foreach (var (owner, name, type) in objects.Distinct())
        {
            await using var command = connection.CreateCommand();
            command.BindByName = true;
            // An empty owner means the session's current schema.
            command.CommandText = "SELECT NVL(:owner, SYS_CONTEXT('USERENV','CURRENT_SCHEMA')), (SELECT MAX(plsql_debug) FROM all_plsql_object_settings WHERE owner = NVL(:owner, SYS_CONTEXT('USERENV','CURRENT_SCHEMA')) AND name = :name AND type = :type) FROM dual";
            command.Parameters.Add("owner", OracleDbType.Varchar2).Value = string.IsNullOrEmpty(owner) ? DBNull.Value : owner;
            command.Parameters.Add("name", OracleDbType.Varchar2).Value = name;
            command.Parameters.Add("type", OracleDbType.Varchar2).Value = type;
            await using var reader = await command.ExecuteReaderAsync(token);
            await reader.ReadAsync(token);
            var value = reader.IsDBNull(1) ? null : reader.GetString(1);
            states.Add(new(reader.GetString(0), name, type, value is not null, value == "TRUE"));
        }
        return states;
    }

    public static string CompileDebugStatement(string owner, string name, string type) => type switch
    {
        "PACKAGE BODY" => $"ALTER PACKAGE \"{owner}\".\"{name}\" COMPILE DEBUG BODY",
        "TYPE BODY" => $"ALTER TYPE \"{owner}\".\"{name}\" COMPILE DEBUG BODY",
        "PACKAGE" or "PROCEDURE" or "FUNCTION" or "TRIGGER" or "TYPE" => $"ALTER {type} \"{owner}\".\"{name}\" COMPILE DEBUG",
        _ => throw new InvalidOperationException($"{type} units cannot be compiled for debugging."),
    };
}
