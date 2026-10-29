using System.Text;
using Oracle.ManagedDataAccess.Client;
using Oracle.ManagedDataAccess.Types;

namespace FbsDb.Services;

public sealed partial class OracleSessionService
{
    private OracleCommand CompletionCommand(string sql, string owner, string name)
    {
        if (!IsConnected) throw new InvalidOperationException("Connect to Oracle to load metadata.");
        var command = _connection!.CreateCommand();
        command.BindByName = true; command.CommandTimeout = 5; command.CommandText = sql;
        if (_transaction is not null) command.Transaction = _transaction;
        command.Parameters.Add("owner", OracleDbType.Varchar2).Value = owner;
        command.Parameters.Add("name", OracleDbType.Varchar2).Value = name;
        return command;
    }

    public async Task<CompletionObject> LoadCompletionMetadataAsync(string owner, string name, string type, CancellationToken token)
    {
        await _gate.WaitAsync(token);
        try
        {
            if (!IsConnected) throw new InvalidOperationException("Connect to Oracle to load metadata.");
            if (string.IsNullOrWhiteSpace(owner))
            {
                await using var current = _connection!.CreateCommand();
                current.CommandText = "SELECT SYS_CONTEXT('USERENV','CURRENT_SCHEMA') FROM dual";
                current.CommandTimeout = 5;
                owner = Convert.ToString(await current.ExecuteScalarAsync(token)) ?? string.Empty;
            }
            var originalOwner = owner; var originalName = name; var originalType = type;
            if (type == "SYNONYM")
            {
                var visited = new HashSet<string>();
                for (var hop = 0; hop < 8; hop++)
                {
                    if (!visited.Add(owner + "." + name)) throw new InvalidOperationException("The synonym chain contains a cycle.");
                    await using var synonym = CompletionCommand("SELECT table_owner,table_name,db_link FROM all_synonyms WHERE owner=:owner AND synonym_name=:name", owner, name);
                    await using var reader = await synonym.ExecuteReaderAsync(token);
                    if (!await reader.ReadAsync(token)) break;
                    if (!reader.IsDBNull(2)) throw new InvalidOperationException("Remote synonym metadata is unavailable for completion.");
                    owner = reader.GetString(0); name = reader.GetString(1);
                }
                await using var objectType = CompletionCommand("SELECT object_type FROM all_objects WHERE owner=:owner AND object_name=:name AND object_type IN ('TABLE','VIEW','MATERIALIZED VIEW','PACKAGE','PROCEDURE','FUNCTION','TYPE') ORDER BY object_type", owner, name);
                var value = await objectType.ExecuteScalarAsync(token);
                if (value is not null and not DBNull) type = Convert.ToString(value) ?? type;
            }
            var columns = new List<SchemaColumn>(); var members = new List<CompletionRoutine>(); var foreignKeys = new List<CompletionForeignKey>();
            string? comment = null;
            if (type is "TABLE" or "VIEW" or "MATERIALIZED VIEW" or "SYNONYM")
            {
                await using (var command = CompletionCommand("""
                    SELECT c.column_name,c.data_type,c.nullable,c.data_length,c.char_length,c.char_used,
                           c.data_precision,c.data_scale,m.comments,
                           CASE WHEN EXISTS (SELECT 1 FROM all_ind_columns i WHERE i.table_owner=c.owner AND i.table_name=c.table_name AND i.column_name=c.column_name) THEN 1 ELSE 0 END,c.data_type_owner
                    FROM all_tab_columns c LEFT JOIN all_col_comments m ON m.owner=c.owner AND m.table_name=c.table_name AND m.column_name=c.column_name
                    WHERE c.owner=:owner AND c.table_name=:name ORDER BY c.column_id
                    """, owner, name))
                {
                    await using var reader = await command.ExecuteReaderAsync(token);
                    while (await reader.ReadAsync(token)) columns.Add(new SchemaColumn(reader.GetString(0), TypeReference(reader.IsDBNull(10) ? null : reader.GetString(10), null, reader.GetString(1)), reader.GetString(2) == "Y", reader.GetInt32(9) == 1)
                    {
                        Length = reader.IsDBNull(3) ? null : reader.GetInt32(3), CharacterLength = reader.IsDBNull(4) ? null : reader.GetInt32(4),
                        LengthUnit = reader.IsDBNull(5) ? null : reader.GetString(5) == "C" ? "CHAR" : "BYTE",
                        Precision = reader.IsDBNull(6) ? null : reader.GetInt32(6), Scale = reader.IsDBNull(7) ? null : reader.GetInt32(7), Comment = reader.IsDBNull(8) ? null : reader.GetString(8)
                    });
                }
                await using (var command = CompletionCommand("SELECT comments FROM all_tab_comments WHERE owner=:owner AND table_name=:name", owner, name))
                { var value = await command.ExecuteScalarAsync(token); comment = value is null or DBNull ? null : Convert.ToString(value); }
                await using (var command = CompletionCommand("""
                    SELECT c.owner,c.table_name,c.constraint_name,cc.column_name,r.owner,r.table_name,rc.column_name,cc.position
                    FROM all_constraints c JOIN all_constraints r ON r.owner=c.r_owner AND r.constraint_name=c.r_constraint_name
                    JOIN all_cons_columns cc ON cc.owner=c.owner AND cc.constraint_name=c.constraint_name
                    JOIN all_cons_columns rc ON rc.owner=r.owner AND rc.constraint_name=r.constraint_name AND rc.position=cc.position
                    WHERE c.constraint_type='R' AND c.status='ENABLED'
                      AND ((c.owner=:owner AND c.table_name=:name) OR (r.owner=:owner AND r.table_name=:name))
                    ORDER BY c.owner,c.constraint_name,cc.position
                    """, owner, name))
                {
                    await using var reader = await command.ExecuteReaderAsync(token);
                    while (await reader.ReadAsync(token)) foreignKeys.Add(new CompletionForeignKey(reader.GetString(0), reader.GetString(1), reader.GetString(2), reader.GetString(3), reader.GetString(4), reader.GetString(5), reader.GetString(6), reader.GetInt32(7)));
                }
                if (columns.Count == 0) throw new InvalidOperationException("No accessible column metadata was found for this object.");
            }
            else if (type is "PACKAGE" or "PROCEDURE" or "FUNCTION" or "TYPE")
            {
                var parameters = new Dictionary<int, List<CompletionParameter>>(); var returns = new Dictionary<int, string>();
                await using (var command = CompletionCommand("""
                    SELECT subprogram_id,argument_name,position,in_out,data_type,type_owner,type_name,type_subname,defaulted
                    FROM all_arguments WHERE owner=:owner AND (package_name=:name OR (package_name IS NULL AND object_name=:name))
                    AND data_level=0 ORDER BY subprogram_id,sequence
                    """, owner, name))
                {
                    await using var reader = await command.ExecuteReaderAsync(token);
                    while (await reader.ReadAsync(token))
                    {
                        var id = reader.GetInt32(0); var position = reader.GetInt32(2);
                        var dataType = !reader.IsDBNull(6) ? string.Join(".", new[] { reader.IsDBNull(5) ? null : reader.GetString(5), reader.GetString(6), reader.IsDBNull(7) ? null : reader.GetString(7) }.Where(part => !string.IsNullOrEmpty(part))) : reader.IsDBNull(4) ? "UNKNOWN" : reader.GetString(4);
                        if (position == 0) { returns[id] = dataType; continue; }
                        if (!parameters.TryGetValue(id, out var list)) parameters[id] = list = [];
                        list.Add(new CompletionParameter(reader.IsDBNull(1) ? $"ARG_{position}" : reader.GetString(1), dataType, reader.GetString(3), !reader.IsDBNull(8) && reader.GetString(8) == "Y", position));
                    }
                }
                await using var procedures = CompletionCommand("""
                    SELECT NVL(procedure_name,object_name),subprogram_id,overload
                    FROM all_procedures WHERE owner=:owner AND object_name=:name
                    AND (procedure_name IS NOT NULL OR object_type IN ('PROCEDURE','FUNCTION')) ORDER BY subprogram_id
                    """, owner, name);
                await using var proceduresReader = await procedures.ExecuteReaderAsync(token);
                while (await proceduresReader.ReadAsync(token))
                {
                    var id = proceduresReader.GetInt32(1);
                    members.Add(new CompletionRoutine(proceduresReader.GetString(0), id, proceduresReader.IsDBNull(2) ? null : proceduresReader.GetString(2), returns.GetValueOrDefault(id), parameters.GetValueOrDefault(id) ?? []));
                }
            }
            var types = new Dictionary<string, CompletionType>();
            if (type == "TYPE")
            {
                await using (var attributes = CompletionCommand("SELECT attr_name,attr_type_owner,attr_type_name FROM all_type_attrs WHERE owner=:owner AND type_name=:name ORDER BY attr_no", owner, name))
                {
                    await using var reader = await attributes.ExecuteReaderAsync(token);
                    while (await reader.ReadAsync(token)) columns.Add(new SchemaColumn(reader.GetString(0), TypeReference(reader.IsDBNull(1) ? null : reader.GetString(1), null, reader.GetString(2)), true, false));
                }
                await using var collection = CompletionCommand("SELECT elem_type_owner,elem_type_name FROM all_coll_types WHERE owner=:owner AND type_name=:name", owner, name);
                await using var collectionReader = await collection.ExecuteReaderAsync(token);
                if (await collectionReader.ReadAsync(token)) types[name] = new CompletionType(name, "collection", [], TypeReference(collectionReader.IsDBNull(0) ? null : collectionReader.GetString(0), null, collectionReader.GetString(1)));
            }
            if (type == "PACKAGE")
            {
                try
                {
                    await using (var attributes = CompletionCommand("SELECT type_name,attr_name,attr_type_owner,attr_type_package,attr_type_name FROM all_plsql_type_attrs WHERE owner=:owner AND package_name=:name ORDER BY type_name,attr_no", owner, name))
                    {
                        await using var reader = await attributes.ExecuteReaderAsync(token);
                        while (await reader.ReadAsync(token))
                        {
                            var typeName = reader.GetString(0);
                            if (!types.TryGetValue(typeName, out var record)) types[typeName] = record = new CompletionType(typeName, "record", [], null);
                            record.Fields.Add(new SchemaColumn(reader.GetString(1), TypeReference(reader.IsDBNull(2) ? null : reader.GetString(2), reader.IsDBNull(3) ? null : reader.GetString(3), reader.GetString(4)), true, false));
                        }
                    }
                    await using var collections = CompletionCommand("SELECT type_name,elem_type_owner,elem_type_package,elem_type_name FROM all_plsql_coll_types WHERE owner=:owner AND package_name=:name ORDER BY type_name", owner, name);
                    await using var collectionReader = await collections.ExecuteReaderAsync(token);
                    while (await collectionReader.ReadAsync(token)) types[collectionReader.GetString(0)] = new CompletionType(collectionReader.GetString(0), "collection", [], TypeReference(collectionReader.IsDBNull(1) ? null : collectionReader.GetString(1), collectionReader.IsDBNull(2) ? null : collectionReader.GetString(2), collectionReader.GetString(3)));
                }
                catch (OracleException ex) when (ex.Number is 942 or 1031) { comment = "Package routines are available; this account cannot read PL/SQL type metadata."; }
            }
            return new CompletionObject(originalOwner, originalName, originalType, columns, members, foreignKeys, comment, owner, name) { Types = types.Values.ToArray() };
        }
        finally { Touch(); _gate.Release(); }
    }

    private static string TypeReference(string? owner, string? package, string name)
    {
        static string Identifier(string value) => System.Text.RegularExpressions.Regex.IsMatch(value, @"^[A-Z][A-Z0-9_$#]*$") ? value : "\"" + value.Replace("\"", "\"\"") + "\"";
        return owner is null && package is null ? name : string.Join(".", new[] { owner, package, name }.Where(value => !string.IsNullOrWhiteSpace(value)).Select(value => Identifier(value!)));
    }

    public async Task<IReadOnlyList<SchemaObject>> LoadSystemCompletionObjectsAsync(CancellationToken token)
    {
        await _gate.WaitAsync(token);
        try
        {
            if (!IsConnected) throw new InvalidOperationException("Connect to Oracle to load system packages.");
            await using var command = _connection!.CreateCommand(); command.CommandTimeout = 5;
            if (_transaction is not null) command.Transaction = _transaction;
            command.CommandText = """
                SELECT DISTINCT p.owner,p.object_name,p.object_type FROM all_procedures p
                WHERE p.procedure_name IS NULL AND p.object_type IN ('PACKAGE','PROCEDURE','FUNCTION')
                  AND p.owner IN (SELECT username FROM all_users WHERE oracle_maintained='Y')
                ORDER BY p.owner,p.object_name
                """;
            var objects = new List<SchemaObject>();
            await using var reader = await command.ExecuteReaderAsync(token);
            while (await reader.ReadAsync(token)) objects.Add(new SchemaObject(reader.GetString(1), reader.GetString(2), []) { Owner = reader.GetString(0) });
            return objects;
        }
        finally { Touch(); _gate.Release(); }
    }

    public async Task<CompletionDefinition> LoadCompletionDefinitionAsync(string owner, string name, string type, bool body, CancellationToken token)
    {
        await _gate.WaitAsync(token);
        try
        {
            if (type is "PACKAGE" or "PROCEDURE" or "FUNCTION" or "TRIGGER" or "TYPE")
            {
                var sourceType = body && type is "PACKAGE" or "TYPE" ? type + " BODY" : type;
                await using var command = CompletionCommand("SELECT text FROM all_source WHERE owner=:owner AND name=:name AND type=:sourceType ORDER BY line", owner, name);
                command.Parameters.Add("sourceType", OracleDbType.Varchar2).Value = sourceType;
                var source = new StringBuilder();
                await using var reader = await command.ExecuteReaderAsync(token);
                while (await reader.ReadAsync(token)) source.Append(reader.GetString(0));
                if (source.Length == 0) throw new InvalidOperationException("Source is unavailable or this account does not have permission to read it.");
                return new CompletionDefinition(owner, name, sourceType, source.ToString());
            }
            if (type is not ("TABLE" or "VIEW" or "MATERIALIZED VIEW" or "SYNONYM" or "SEQUENCE" or "INDEX")) throw new InvalidOperationException("Source navigation is not available for this object type.");
            await using var ddl = CompletionCommand("SELECT DBMS_METADATA.GET_DDL(:objectType,:name,:owner) FROM dual", owner, name);
            ddl.Parameters.Add("objectType", OracleDbType.Varchar2).Value = type.Replace(' ', '_');
            var value = await ddl.ExecuteScalarAsync(token);
            if (value is OracleClob clob) { using (clob) return new CompletionDefinition(owner, name, type, clob.Value); }
            return new CompletionDefinition(owner, name, type, Convert.ToString(value) ?? string.Empty);
        }
        finally { Touch(); _gate.Release(); }
    }
}

public sealed record CompletionParameter(string Name, string Type, string Mode, bool Optional, int Position);
public sealed record CompletionRoutine(string Name, int SubprogramId, string? Overload, string? ReturnType, IReadOnlyList<CompletionParameter> Parameters);
public sealed record CompletionForeignKey(string Owner, string Table, string Name, string Column, string TargetOwner, string TargetTable, string TargetColumn, int Position);
public sealed record CompletionType(string Name, string Kind, List<SchemaColumn> Fields, string? ElementType);
public sealed record CompletionObject(string Owner, string Name, string Type, IReadOnlyList<SchemaColumn> Columns, IReadOnlyList<CompletionRoutine> Members, IReadOnlyList<CompletionForeignKey> ForeignKeys, string? Comment, string TargetOwner, string TargetName)
{
    public IReadOnlyList<CompletionType> Types { get; init; } = [];
}
public sealed record CompletionDefinition(string Owner, string Name, string Type, string Text);
