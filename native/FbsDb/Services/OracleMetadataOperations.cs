using System.Globalization;
using System.Text.RegularExpressions;
using Oracle.ManagedDataAccess.Client;

namespace FbsDb.Services;

public sealed partial class OracleSessionService
{
    // Borrows the physical session and its gate. It never owns a connection or transaction.
    private sealed class MetadataOperations(OracleSessionService session)
    {
        private OracleConnection? _connection => session._connection;
        private OracleTransaction? _transaction => session._transaction;
        private SemaphoreSlim _gate => session._gate;
        private bool IsConnected => session.IsConnected;
        private void Touch() => session.Touch();
        public async Task<(string? Version, string[] Words, string? Error)> LoadCompletionVocabularyAsync(CancellationToken cancellationToken = default)
        {
            await _gate.WaitAsync(cancellationToken);
            try
            {
                if (!IsConnected) return (null, [], null);
                var version = _connection!.ServerVersion;
                await using var command = _connection.CreateCommand();
                command.CommandText = "SELECT KEYWORD FROM V$RESERVED_WORDS WHERE KEYWORD IS NOT NULL ORDER BY KEYWORD";
                command.CommandTimeout = 3;
                if (_transaction is not null) command.Transaction = _transaction;
                try
                {
                    await using var reader = await command.ExecuteReaderAsync(cancellationToken);
                    var words = new List<string>();
                    while (await reader.ReadAsync(cancellationToken)) words.Add(reader.GetString(0));
                    return (version, words.Distinct(StringComparer.Ordinal).ToArray(), null);
                }
                // Access to dynamic performance views is optional. Local catalogs remain usable.
                catch (OracleException error) { return (version, [], $"Server keyword catalog unavailable (ORA-{error.Number:D5}); local reference remains available."); }
            }
            finally { Touch(); _gate.Release(); }
        }

        public async Task<ColumnDefinition?> GetColumnDefinitionAsync(string owner,string table,string column) {
            await _gate.WaitAsync();try {
                if(_connection?.State!=System.Data.ConnectionState.Open)throw new InvalidOperationException("Connect before reading column definitions.");
                using var command=_connection.CreateCommand();command.BindByName=true;
                command.CommandText=@"SELECT data_type,data_length,data_precision,data_scale,nullable,data_default FROM all_tab_columns WHERE owner=NVL(:o,SYS_CONTEXT('USERENV','CURRENT_SCHEMA')) AND table_name=:t AND column_name=:c";
                command.Parameters.Add("o",OracleDbType.Varchar2).Value=string.IsNullOrEmpty(owner)?DBNull.Value:owner;command.Parameters.Add("t",OracleDbType.Varchar2).Value=table;command.Parameters.Add("c",OracleDbType.Varchar2).Value=column;
                string? type=null,defaultValue=null;int? size=null,precision=null,scale=null;bool nullable=true;
                using(var reader=await command.ExecuteReaderAsync()){if(!await reader.ReadAsync())return null;type=reader.GetString(0);size=reader.IsDBNull(1)?null:Convert.ToInt32(reader.GetValue(1));precision=reader.IsDBNull(2)?null:Convert.ToInt32(reader.GetValue(2));scale=reader.IsDBNull(3)?null:Convert.ToInt32(reader.GetValue(3));nullable=reader.GetString(4)=="Y";defaultValue=reader.IsDBNull(5)?null:reader.GetString(5);}
                using var constraints=_connection.CreateCommand();constraints.BindByName=true;constraints.CommandText=@"SELECT c.constraint_name,c.constraint_type,c.search_condition_vc,c.status FROM all_constraints c JOIN all_cons_columns cc ON cc.owner=c.owner AND cc.constraint_name=c.constraint_name WHERE c.owner=NVL(:o,SYS_CONTEXT('USERENV','CURRENT_SCHEMA')) AND c.table_name=:t AND cc.column_name=:c";
                constraints.Parameters.Add("o",OracleDbType.Varchar2).Value=string.IsNullOrEmpty(owner)?DBNull.Value:owner;constraints.Parameters.Add("t",OracleDbType.Varchar2).Value=table;constraints.Parameters.Add("c",OracleDbType.Varchar2).Value=column;
                using var conditions=await constraints.ExecuteReaderAsync();var list=new List<ColumnConstraint>();while(await conditions.ReadAsync())list.Add(new(conditions.GetString(0),conditions.GetString(1),conditions.IsDBNull(2)?null:conditions.GetString(2),conditions.GetString(3)));
                return new(owner,table,column,type,size,precision,scale,nullable,defaultValue,list);
            }finally{Touch(); _gate.Release();}
        }
        public async Task<string> UpdateDraftAsync(string owner,string table,IReadOnlyList<SqlColumn> columns,IReadOnlyList<object?[]> rows) {
            var pk=await GetPrimaryKeyAsync("\""+owner.Replace("\"","\"\"")+"\"","\""+table.Replace("\"","\"\"")+"\"");
            var keys=pk.Columns.Select(key=>columns.ToList().FindIndex(c=>(c.SourceColumn??c.Name)==key.Name&&c.SourceTable==table)).ToArray();
            if(keys.Length==0||keys.Any(i=>i<0))throw new InvalidOperationException("Include every primary-key column in the result before generating UPDATE drafts.");
            var editable=columns.Select((c,i)=>(Column:c,Index:i)).Where(item=>item.Column.SourceTable==table&&!keys.Contains(item.Index)&&!string.IsNullOrEmpty(item.Column.SourceColumn)).ToArray();
            if(editable.Length==0)throw new InvalidOperationException("No editable non-key source columns are selected.");
            return "-- Review and edit SET values before execution. Generated SQL is not executed.\n\n"+string.Join("\n\n",rows.Select(row=>{
                if(keys.Any(i=>row[i] is null))throw new InvalidOperationException("Primary-key values cannot be NULL.");
                return "UPDATE "+QuoteIdentifier(pk.Schema)+"."+QuoteIdentifier(pk.Table)+"\nSET "+string.Join(", ",editable.Select(item=>QuoteIdentifier(item.Column.SourceColumn!)+" = "+KeyLiteral(row[item.Index],item.Column.Type)))+"\nWHERE "+string.Join(" AND ",keys.Select(i=>QuoteIdentifier(columns[i].SourceColumn??columns[i].Name)+" = "+KeyLiteral(row[i],columns[i].Type)))+";";
            }));
        }
        private static string QuoteIdentifier(string value)=>"\""+value.Replace("\"","\"\"")+"\"";
        private static string KeyLiteral(object? value,string type="") {
            if(value is null)return "NULL";
            if(value is OracleTemporalCell temporal)return temporal.SqlLiteral();
            var text=value is byte[] bytes?Convert.ToHexString(bytes):Convert.ToString(value,CultureInfo.InvariantCulture)??"";
            if(Regex.IsMatch(type,"NUMBER|DECIMAL|INTEGER|FLOAT|DOUBLE",RegexOptions.IgnoreCase)||value is decimal or int or long or double){if(!Regex.IsMatch(text,@"^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$"))throw new InvalidOperationException("Invalid numeric key.");return text;}
            if(type.Contains("RAW",StringComparison.OrdinalIgnoreCase)){if(!Regex.IsMatch(text,@"^(?:[0-9a-fA-F]{2})+$"))throw new InvalidOperationException("Enter the RAW key as hexadecimal bytes.");return "HEXTORAW('"+text+"')";}
            if(type.Contains("DATE",StringComparison.OrdinalIgnoreCase)||type.Contains("TIMESTAMP",StringComparison.OrdinalIgnoreCase))return OracleTemporalCell.Parse(text,type).SqlLiteral();
            return "'"+text.Replace("'","''")+"'";
        }
        public static string BuildPrimaryKeySql(string schema,string table,IReadOnlyList<LookupColumn> columns,IReadOnlyDictionary<string,string> values) {
            if(columns.Count==0||columns.Any(c=>!values.ContainsKey(c.Name)))throw new InvalidOperationException("Enter every primary-key value.");
            return "SELECT * FROM "+QuoteIdentifier(schema)+"."+QuoteIdentifier(table)+" WHERE "+string.Join(" AND ",columns.Select(c=>QuoteIdentifier(c.Name)+" = "+KeyLiteral(values[c.Name],c.Type)))+";";
        }
        // Known foreign keys of a table in both directions (rows that reference it, and the parents it references). Metadata only: no row is read.
        public async Task<TableRelations> GetRelationsAsync(string owner,string table) {
            await _gate.WaitAsync();try {
                if(_connection?.State!=System.Data.ConnectionState.Open)throw new InvalidOperationException("Connect before reading relationships.");
                async Task<List<ForeignKeyRelation>> Read(bool children) {
                    using var command=_connection.CreateCommand();command.BindByName=true;
                    command.CommandText=(children?"SELECT f.owner,f.table_name":"SELECT p.owner,p.table_name")+@",f.constraint_name,f.delete_rule,fc.column_name,pc.column_name FROM all_constraints f JOIN all_constraints p ON p.owner=f.r_owner AND p.constraint_name=f.r_constraint_name JOIN all_cons_columns fc ON fc.owner=f.owner AND fc.constraint_name=f.constraint_name JOIN all_cons_columns pc ON pc.owner=p.owner AND pc.constraint_name=p.constraint_name AND pc.position=fc.position WHERE f.constraint_type='R' AND "+(children?"p.owner=NVL(:o,SYS_CONTEXT('USERENV','CURRENT_SCHEMA')) AND p.table_name=:t":"f.owner=NVL(:o,SYS_CONTEXT('USERENV','CURRENT_SCHEMA')) AND f.table_name=:t")+" ORDER BY f.owner,f.table_name,f.constraint_name,fc.position";
                    command.Parameters.Add("o",OracleDbType.Varchar2).Value=string.IsNullOrWhiteSpace(owner)?DBNull.Value:NormalizeIdentifier(owner.Trim());command.Parameters.Add("t",OracleDbType.Varchar2).Value=NormalizeIdentifier(table.Trim());
                    var groups=new Dictionary<string,(string Owner,string Table,string Constraint,string Rule,List<ForeignKeyPair> Pairs)>();
                    using var reader=await command.ExecuteReaderAsync();
                    while(await reader.ReadAsync()){var key=reader.GetString(0)+"."+reader.GetString(2);if(!groups.TryGetValue(key,out var item))item=(reader.GetString(0),reader.GetString(1),reader.GetString(2),reader.IsDBNull(3)?"NO ACTION":reader.GetString(3),new());item.Pairs.Add(new(reader.GetString(4),reader.GetString(5)));groups[key]=item;}
                    return groups.Values.Select(item=>new ForeignKeyRelation(item.Owner,item.Table,item.Constraint,item.Rule,item.Pairs)).ToList();
                }
                return new TableRelations(await Read(true),await Read(false));
            }finally{Touch(); _gate.Release();}
        }
        // What a named constraint requires (CHECK condition, key columns), so a rejected value can be explained without reading the DDL.
        public async Task<ConstraintInfo?> GetConstraintInfoAsync(string owner,string name) {
            await _gate.WaitAsync();try {
                if(_connection?.State!=System.Data.ConnectionState.Open)throw new InvalidOperationException("Connect before reading constraint metadata.");
                using var command=_connection.CreateCommand();command.BindByName=true;
                command.CommandText=@"SELECT c.constraint_type,c.search_condition_vc,c.r_constraint_name FROM all_constraints c WHERE c.owner=:o AND c.constraint_name=:n";
                command.Parameters.Add("o",OracleDbType.Varchar2).Value=NormalizeIdentifier(owner.Trim());command.Parameters.Add("n",OracleDbType.Varchar2).Value=NormalizeIdentifier(name.Trim());
                string? type=null,condition=null,referenced=null;
                using(var reader=await command.ExecuteReaderAsync()){if(await reader.ReadAsync()){type=reader.GetString(0);condition=reader.IsDBNull(1)?null:reader.GetString(1);referenced=reader.IsDBNull(2)?null:reader.GetString(2);}}
                if(type is null)return null;
                using var columnsCommand=_connection.CreateCommand();columnsCommand.BindByName=true;
                columnsCommand.CommandText=@"SELECT column_name FROM all_cons_columns WHERE owner=:o AND constraint_name=:n ORDER BY position";
                columnsCommand.Parameters.Add("o",OracleDbType.Varchar2).Value=NormalizeIdentifier(owner.Trim());columnsCommand.Parameters.Add("n",OracleDbType.Varchar2).Value=NormalizeIdentifier(name.Trim());
                var columns=new List<string>();using(var reader=await columnsCommand.ExecuteReaderAsync()){while(await reader.ReadAsync())columns.Add(reader.GetString(0));}
                return new(owner,name,type,condition,referenced,columns);
            }finally{Touch(); _gate.Release();}
        }
        public async Task<PrimaryKeyInfo> GetPrimaryKeyAsync(string schema,string table) {
            await _gate.WaitAsync();try {
                if(_connection?.State!=System.Data.ConnectionState.Open)throw new InvalidOperationException("Connect before reading primary-key metadata.");
                using var command=_connection.CreateCommand();command.BindByName=true;
                command.CommandText=@"SELECT c.owner,c.table_name,k.column_name,t.data_type FROM all_constraints c JOIN all_cons_columns k ON k.owner=c.owner AND k.constraint_name=c.constraint_name JOIN all_tab_columns t ON t.owner=k.owner AND t.table_name=k.table_name AND t.column_name=k.column_name WHERE c.constraint_type='P' AND c.owner=NVL(:o,SYS_CONTEXT('USERENV','CURRENT_SCHEMA')) AND c.table_name=:t ORDER BY k.position";
                command.Parameters.Add("o",OracleDbType.Varchar2).Value=string.IsNullOrWhiteSpace(schema)?DBNull.Value:NormalizeIdentifier(schema.Trim());command.Parameters.Add("t",OracleDbType.Varchar2).Value=NormalizeIdentifier(table.Trim());
                using var reader=await command.ExecuteReaderAsync();var columns=new List<LookupColumn>();var owner=schema;var name=table;
                while(await reader.ReadAsync()){owner=reader.GetString(0);name=reader.GetString(1);columns.Add(new(reader.GetString(2),reader.GetString(3)));}
                return new(owner,name,columns);
            }finally{Touch(); _gate.Release();}
        }
        // What this session may change in a table: as owner, through object grants to the user, PUBLIC or an enabled role, per column, or through ANY and schema privileges.
        // Null when the name is not a table or view there, such as a synonym: its grants live on the real object, so nothing can be claimed.
        public async Task<EditPrivileges?> GetEditPrivilegesAsync(string owner,string table) {
            await _gate.WaitAsync();try {
                if(_connection?.State!=System.Data.ConnectionState.Open)throw new InvalidOperationException("Connect before reading privileges.");
                // The provider leaves the schema empty for an unqualified name, which means the session's current schema.
                if(string.IsNullOrWhiteSpace(owner)){using var current=_connection.CreateCommand();current.CommandText="SELECT SYS_CONTEXT('USERENV','CURRENT_SCHEMA') FROM dual";owner=Convert.ToString(await current.ExecuteScalarAsync())??"";}
                using(var found=_connection.CreateCommand()){
                    found.BindByName=true;found.CommandText="SELECT COUNT(*) FROM all_objects WHERE owner=:o AND object_name=:t AND object_type IN ('TABLE','VIEW','MATERIALIZED VIEW')";
                    found.Parameters.Add("o",OracleDbType.Varchar2).Value=owner;found.Parameters.Add("t",OracleDbType.Varchar2).Value=table;
                    if(Convert.ToInt32(await found.ExecuteScalarAsync(),CultureInfo.InvariantCulture)==0)return null;
                }
                var whole=new HashSet<string>(StringComparer.Ordinal);var columns=new Dictionary<string,List<string>>(StringComparer.Ordinal){["UPDATE"]=[],["INSERT"]=[]};
                const string grantee="(grantee IN (USER,'PUBLIC') OR grantee IN (SELECT role FROM session_roles)) AND privilege IN ('UPDATE','INSERT','DELETE')";
                using(var command=_connection.CreateCommand()){
                    command.BindByName=true;
                    command.CommandText=$@"SELECT privilege,NULL FROM all_tab_privs WHERE table_schema=:o AND table_name=:t AND {grantee}
UNION ALL SELECT privilege,column_name FROM all_col_privs WHERE table_schema=:o AND table_name=:t AND {grantee}
UNION ALL SELECT SUBSTR(privilege,1,6),NULL FROM session_privs WHERE privilege IN ('UPDATE ANY TABLE','INSERT ANY TABLE','DELETE ANY TABLE')
UNION ALL SELECT p.column_value,NULL FROM TABLE(sys.odcivarchar2list('UPDATE','INSERT','DELETE')) p WHERE :o=USER";
                    command.Parameters.Add("o",OracleDbType.Varchar2).Value=owner;command.Parameters.Add("t",OracleDbType.Varchar2).Value=table;
                    using var reader=await command.ExecuteReaderAsync();
                    while(await reader.ReadAsync()){if(reader.IsDBNull(1))whole.Add(reader.GetString(0));else if(columns.TryGetValue(reader.GetString(0),out var list))list.Add(reader.GetString(1));}
                }
                try{
                    using var command=_connection.CreateCommand();command.BindByName=true;
                    command.CommandText="SELECT SUBSTR(privilege,1,6) FROM session_schema_privs WHERE schema=:o AND privilege IN ('UPDATE ANY TABLE','INSERT ANY TABLE','DELETE ANY TABLE')";
                    command.Parameters.Add("o",OracleDbType.Varchar2).Value=owner;
                    using var reader=await command.ExecuteReaderAsync();
                    while(await reader.ReadAsync())whole.Add(reader.GetString(0));
                }catch(OracleException error) when(error.Number==942){/* Schema privileges exist from Oracle 23. */}
                return new(whole.Contains("UPDATE"),whole.Contains("INSERT"),whole.Contains("DELETE"),[.. columns["UPDATE"]],[.. columns["INSERT"]]);
            }finally{Touch(); _gate.Release();}
        }
        public async Task<IReadOnlyList<RelatedRecordLink>> ChildRecordsSqlAsync(string owner,string table,IReadOnlyDictionary<string,object?> values) {
            await _gate.WaitAsync();try {
                if(_connection?.State!=System.Data.ConnectionState.Open)throw new InvalidOperationException("Connect before reading relationships.");
                using var command=_connection.CreateCommand();command.BindByName=true;command.CommandText=@"SELECT c.owner,c.table_name,c.constraint_name,cc.column_name,pc.column_name,t.data_type FROM all_constraints c JOIN all_constraints p ON p.owner=c.r_owner AND p.constraint_name=c.r_constraint_name JOIN all_cons_columns cc ON cc.owner=c.owner AND cc.constraint_name=c.constraint_name JOIN all_cons_columns pc ON pc.owner=p.owner AND pc.constraint_name=p.constraint_name AND pc.position=cc.position JOIN all_tab_columns t ON t.owner=pc.owner AND t.table_name=pc.table_name AND t.column_name=pc.column_name WHERE c.constraint_type='R' AND p.owner=NVL(:o,SYS_CONTEXT('USERENV','CURRENT_SCHEMA')) AND p.table_name=:t ORDER BY c.owner,c.constraint_name,cc.position";
                command.Parameters.Add("o",OracleDbType.Varchar2).Value=string.IsNullOrEmpty(owner)?DBNull.Value:owner;command.Parameters.Add("t",OracleDbType.Varchar2).Value=table;
                using var reader=await command.ExecuteReaderAsync();var groups=new Dictionary<string,(string Owner,string Table,List<string> Conditions,bool Complete)>();
                while(await reader.ReadAsync()){
                    var schema=reader.GetString(0);var name=reader.GetString(1);var key=schema+"."+reader.GetString(2);
                    if(!groups.TryGetValue(key,out var item))item=(schema,name,new(),true);
                    if(!values.TryGetValue(reader.GetString(4),out var value)||value is null)item.Complete=false;else item.Conditions.Add(QuoteIdentifier(reader.GetString(3))+" = "+KeyLiteral(value,reader.GetString(5)));
                    groups[key]=item;
                }
                return groups.Where(pair=>pair.Value.Complete).Select(pair=>new RelatedRecordLink(pair.Value.Owner+"."+pair.Value.Table+" · "+pair.Key,"SELECT * FROM "+QuoteIdentifier(pair.Value.Owner)+"."+QuoteIdentifier(pair.Value.Table)+" WHERE "+string.Join(" AND ",pair.Value.Conditions)+";")).ToArray();
            }finally{Touch(); _gate.Release();}
        }
        public async Task<string?> RelatedRecordsSqlAsync(string owner, string table, string column, object? value, IReadOnlyDictionary<string, object?>? rowValues = null)
        {
            await _gate.WaitAsync();
            try {
                if (_connection?.State != System.Data.ConnectionState.Open) throw new InvalidOperationException("Connect before opening related records.");
                using var command = _connection.CreateCommand(); command.BindByName = true;
                command.CommandText = @"SELECT p.owner, p.table_name, pc.column_name, fc.column_name, f.constraint_name
    FROM all_constraints f JOIN all_cons_columns fc ON fc.owner=f.owner AND fc.constraint_name=f.constraint_name
    JOIN all_constraints p ON p.owner=f.r_owner AND p.constraint_name=f.r_constraint_name
    JOIN all_cons_columns pc ON pc.owner=p.owner AND pc.constraint_name=p.constraint_name AND pc.position=fc.position
    WHERE f.constraint_type='R' AND f.owner=NVL(:o,SYS_CONTEXT('USERENV','CURRENT_SCHEMA')) AND f.table_name=:t AND EXISTS (SELECT 1 FROM all_cons_columns chosen WHERE chosen.owner=f.owner AND chosen.constraint_name=f.constraint_name AND chosen.column_name=:c) ORDER BY f.constraint_name,fc.position";
                command.Parameters.Add("o", OracleDbType.Varchar2).Value = string.IsNullOrEmpty(owner) ? DBNull.Value : owner;
                command.Parameters.Add("t", OracleDbType.Varchar2).Value = table;
                command.Parameters.Add("c", OracleDbType.Varchar2).Value = column;
                using var reader = await command.ExecuteReaderAsync();
                if (!await reader.ReadAsync()) return null;
                static string Identifier(string text) => "\"" + text.Replace("\"", "\"\"") + "\"";
                static string Literal(object? item) => item is byte[] bytes ? "HEXTORAW('"+Convert.ToHexString(bytes)+"')" : KeyLiteral(item);
                var source = Identifier(reader.GetString(0)) + "." + Identifier(reader.GetString(1));
                var constraint = reader.GetString(4); var conditions = new List<string>();
                do {
                    if (reader.GetString(4) != constraint) break;
                    var local = reader.GetString(3);
                    object? item = local == column ? value : rowValues is not null && rowValues.TryGetValue(local, out var found) ? found : null;
                    if (item is null) return null;
                    conditions.Add(Identifier(reader.GetString(2)) + " = " + Literal(item));
                } while (await reader.ReadAsync());
                return $"SELECT * FROM {source} WHERE {string.Join(" AND ", conditions)};";

            } finally { Touch(); _gate.Release(); }
        }
        public async Task<SchemaSnapshot> LoadSchemaAsync(CancellationToken cancellationToken = default)
        {
            await _gate.WaitAsync(cancellationToken);
            try
            {
                if (_connection?.State != System.Data.ConnectionState.Open) throw new InvalidOperationException("Connect to Oracle before loading schema metadata.");
                var objects = new Dictionary<string, SchemaObject>(StringComparer.OrdinalIgnoreCase);
                await using (var command = _connection.CreateCommand())
                {
                    command.BindByName = true;
                    command.CommandText = """
                        SELECT owner, object_name, object_type, target_owner, target_name, db_link
                        FROM (
                            SELECT owner, object_name, object_type, CAST(NULL AS VARCHAR2(128)) target_owner,
                                   CAST(NULL AS VARCHAR2(128)) target_name, CAST(NULL AS VARCHAR2(128)) db_link
                            FROM all_objects
                            WHERE object_type IN ('TABLE','VIEW','MATERIALIZED VIEW','PACKAGE','PROCEDURE','FUNCTION','TRIGGER','SEQUENCE','INDEX','TYPE')
                              AND owner IN (SELECT username FROM all_users WHERE oracle_maintained='N')
                            UNION ALL
                            SELECT owner, constraint_name, 'CONSTRAINT', owner, table_name, CAST(NULL AS VARCHAR2(128))
                            FROM all_constraints
                            WHERE constraint_type IN ('P','R','U','C')
                              AND owner IN (SELECT username FROM all_users WHERE oracle_maintained='N')
                            UNION ALL
                            SELECT owner, db_link, 'DATABASE LINK', CAST(NULL AS VARCHAR2(128)), CAST(NULL AS VARCHAR2(128)), db_link
                            FROM all_db_links
                            WHERE owner IN (USER, 'PUBLIC')
                            UNION ALL
                            SELECT owner, synonym_name, 'SYNONYM', table_owner, table_name, db_link
                            FROM all_synonyms
                            WHERE owner=USER OR (owner='PUBLIC' AND (db_link IS NOT NULL OR table_owner IN (SELECT username FROM all_users WHERE oracle_maintained='N')))
                        )
                        ORDER BY owner, object_type, object_name
                        """;
                    await using var reader = await command.ExecuteReaderAsync(cancellationToken);
                    while (await reader.ReadAsync(cancellationToken))
                    {
                        var objectOwner = reader.GetString(0);
                        var name = reader.GetString(1);
                        var type = reader.GetString(2);
                        var targetOwner = reader.IsDBNull(3) ? null : reader.GetString(3);
                        var targetName = reader.IsDBNull(4) ? null : reader.GetString(4);
                        var dbLink = reader.IsDBNull(5) ? null : reader.GetString(5);
                        var item = new SchemaObject(name, type, []) { Owner = objectOwner, TargetOwner = targetOwner, TargetName = targetName, DbLink = dbLink };
                        objects[item.Key] = item;
                    }
                }

                await using var ownerCommand = _connection.CreateCommand();
                ownerCommand.CommandText = "SELECT SYS_CONTEXT('USERENV', 'CURRENT_SCHEMA') FROM dual";
                var owner = Convert.ToString(await ownerCommand.ExecuteScalarAsync(cancellationToken)) ?? "USER";
                return new SchemaSnapshot(owner, objects.Values.ToArray());
            }
            finally { Touch(); _gate.Release(); }
        }

        public async Task<SchemaObject> LoadTableDetailsAsync(string tableName, string? owner = null, string? type = null, CancellationToken cancellationToken = default)
        {
            await _gate.WaitAsync(cancellationToken);
            try
            {
                if (_connection?.State != System.Data.ConnectionState.Open) throw new InvalidOperationException("Connect to Oracle before loading column metadata.");
                var normalizedName = tableName;
                var normalizedOwner = owner ?? string.Empty;
                var normalizedType = (type ?? "TABLE").ToUpperInvariant();
                var columnsOwner = normalizedType == "SYNONYM" ? normalizedOwner : normalizedOwner;
                var columnsName = normalizedName;
                var columns = new List<SchemaColumn>();
                var objectDetails = new List<SchemaProperty>();
                var itemOwner = normalizedOwner;
                var itemTargetOwner = (string?)null;
                var itemTargetName = (string?)null;
                var itemDbLink = (string?)null;

                if (normalizedType == "SYNONYM")
                {
                    await using var synonymCommand = _connection.CreateCommand();
                    synonymCommand.BindByName = true;
                    if (_transaction is not null) synonymCommand.Transaction = _transaction;
                    synonymCommand.CommandText = "SELECT table_owner, table_name, db_link FROM all_synonyms WHERE owner=:owner AND synonym_name=:name";
                    synonymCommand.Parameters.Add("owner", OracleDbType.Varchar2).Value = normalizedOwner;
                    synonymCommand.Parameters.Add("name", OracleDbType.Varchar2).Value = normalizedName;
                    await using var reader = await synonymCommand.ExecuteReaderAsync(cancellationToken);
                    if (await reader.ReadAsync(cancellationToken))
                    {
                        itemTargetOwner = reader.IsDBNull(0) ? null : reader.GetString(0);
                        itemTargetName = reader.GetString(1);
                        itemDbLink = reader.IsDBNull(2) ? null : reader.GetString(2);
                        objectDetails.Add(new SchemaProperty("Target", $"{itemTargetOwner}.{itemTargetName}{(itemDbLink is null ? string.Empty : "@" + itemDbLink)}"));
                        columnsOwner = itemTargetOwner ?? normalizedOwner;
                        columnsName = itemTargetName;
                    }
                }

                if (normalizedType is "TABLE" or "VIEW" or "MATERIALIZED VIEW" or "SYNONYM")
                {
                    await using var commentCommand = _connection.CreateCommand();
                    commentCommand.BindByName = true;
                    if (_transaction is not null) commentCommand.Transaction = _transaction;
                    commentCommand.CommandText = "SELECT comments FROM all_tab_comments WHERE owner=:owner AND table_name=:name AND table_type IN ('TABLE','VIEW','MATERIALIZED VIEW')";
                    commentCommand.Parameters.Add("owner", OracleDbType.Varchar2).Value = columnsOwner;
                    commentCommand.Parameters.Add("name", OracleDbType.Varchar2).Value = columnsName;
                    var comment = Convert.ToString(await commentCommand.ExecuteScalarAsync(cancellationToken), CultureInfo.InvariantCulture);
                    if (!string.IsNullOrWhiteSpace(comment)) objectDetails.Add(new SchemaProperty("Comment", comment));
                }

                if (normalizedType == "TABLE")
                {
                    await using var constraintCommand = _connection.CreateCommand();
                    constraintCommand.BindByName = true;
                    if (_transaction is not null) constraintCommand.Transaction = _transaction;
                    constraintCommand.CommandText = "SELECT c.constraint_name,c.constraint_type,c.status,c.validated,(SELECT LISTAGG(cc.column_name,', ') WITHIN GROUP (ORDER BY cc.position) FROM all_cons_columns cc WHERE cc.owner=c.owner AND cc.constraint_name=c.constraint_name) columns,c.r_owner,c.r_constraint_name,c.delete_rule,(SELECT r.owner||'.'||r.table_name FROM all_constraints r WHERE r.owner=c.r_owner AND r.constraint_name=c.r_constraint_name) referenced_table FROM all_constraints c WHERE c.owner=:owner AND c.table_name=:name ORDER BY c.constraint_type,c.constraint_name";
                    constraintCommand.Parameters.Add("owner", OracleDbType.Varchar2).Value = normalizedOwner;
                    constraintCommand.Parameters.Add("name", OracleDbType.Varchar2).Value = normalizedName;
                    await using (var reader = await constraintCommand.ExecuteReaderAsync(cancellationToken))
                        while (await reader.ReadAsync(cancellationToken))
                        {
                            var kind = reader.GetString(1) switch { "P" => "PRIMARY KEY", "R" => "FOREIGN KEY", "U" => "UNIQUE", "C" => "CHECK", _ => reader.GetString(1) };
                            var value = $"{kind} · {reader.GetString(2)} · {reader.GetString(3)}";
                            if (!reader.IsDBNull(4)) value += $" · ({reader.GetString(4)})";
                            if (!reader.IsDBNull(8)) value += $" · REFERENCES {reader.GetString(8)}";
                            if (!reader.IsDBNull(7) && reader.GetString(7) != "NO ACTION") value += $" · ON DELETE {reader.GetString(7)}";
                            objectDetails.Add(new SchemaProperty("Constraint · " + reader.GetString(0), value));
                        }

                    await using var indexCommand = _connection.CreateCommand();
                    indexCommand.BindByName = true;
                    if (_transaction is not null) indexCommand.Transaction = _transaction;
                    indexCommand.CommandText = "SELECT i.index_name,i.index_type,i.uniqueness,i.status,i.visibility,i.partitioned,i.compression,(SELECT LISTAGG(c.column_name,', ') WITHIN GROUP (ORDER BY c.column_position) FROM all_ind_columns c WHERE c.index_owner=i.owner AND c.index_name=i.index_name) columns FROM all_indexes i WHERE i.owner=:owner AND i.table_name=:name ORDER BY i.index_name";
                    indexCommand.Parameters.Add("owner", OracleDbType.Varchar2).Value = normalizedOwner;
                    indexCommand.Parameters.Add("name", OracleDbType.Varchar2).Value = normalizedName;
                    await using var indexReader = await indexCommand.ExecuteReaderAsync(cancellationToken);
                    while (await indexReader.ReadAsync(cancellationToken)) objectDetails.Add(new SchemaProperty("Index · " + indexReader.GetString(0), $"{indexReader.GetString(1)} · {indexReader.GetString(2)} · {indexReader.GetString(3)} · {indexReader.GetString(4)} · partitioned {indexReader.GetString(5)} · compression {indexReader.GetString(6)} · {(indexReader.IsDBNull(7) ? "" : indexReader.GetString(7))}"));
                }

                if (normalizedType == "VIEW")
                {
                    await using var command = _connection.CreateCommand();
                    command.BindByName = true;
                    if (_transaction is not null) command.Transaction = _transaction;
                    command.CommandText = "SELECT text FROM all_views WHERE owner=:owner AND view_name=:name";
                    command.Parameters.Add("owner", OracleDbType.Varchar2).Value = normalizedOwner;
                    command.Parameters.Add("name", OracleDbType.Varchar2).Value = normalizedName;
                    await using var reader = await command.ExecuteReaderAsync(cancellationToken);
                    if (await reader.ReadAsync(cancellationToken) && !reader.IsDBNull(0)) objectDetails.Add(new SchemaProperty("Definition", reader.GetString(0)));
                }
                else if (normalizedType == "MATERIALIZED VIEW")
                {
                    await using var command = _connection.CreateCommand();
                    command.BindByName = true;
                    if (_transaction is not null) command.Transaction = _transaction;
                    command.CommandText = "SELECT refresh_mode, refresh_method, build_mode, fast_refreshable, last_refresh_type, staleness, last_refresh_date FROM all_mviews WHERE owner=:owner AND mview_name=:name";
                    command.Parameters.Add("owner", OracleDbType.Varchar2).Value = normalizedOwner;
                    command.Parameters.Add("name", OracleDbType.Varchar2).Value = normalizedName;
                    await using var reader = await command.ExecuteReaderAsync(cancellationToken);
                    if (await reader.ReadAsync(cancellationToken))
                    {
                        objectDetails.Add(new SchemaProperty("Refresh mode", reader.GetString(0)));
                        objectDetails.Add(new SchemaProperty("Refresh method", reader.GetString(1)));
                        objectDetails.Add(new SchemaProperty("Build mode", reader.GetString(2)));
                        objectDetails.Add(new SchemaProperty("Fast refresh", reader.GetString(3)));
                        objectDetails.Add(new SchemaProperty("Last refresh", reader.GetString(4)));
                        objectDetails.Add(new SchemaProperty("Staleness", reader.GetString(5)));
                        objectDetails.Add(new SchemaProperty("Last refresh date", reader.IsDBNull(6) ? "Never" : reader.GetDateTime(6).ToString("u", CultureInfo.InvariantCulture)));
                    }
                }
                else if (normalizedType == "TRIGGER")
                {
                    await using var command = _connection.CreateCommand();
                    command.BindByName = true;
                    if (_transaction is not null) command.Transaction = _transaction;
                    command.CommandText = "SELECT table_owner, table_name, base_object_type, trigger_type, triggering_event, status, description, when_clause FROM all_triggers WHERE owner=:owner AND trigger_name=:name";
                    command.Parameters.Add("owner", OracleDbType.Varchar2).Value = normalizedOwner;
                    command.Parameters.Add("name", OracleDbType.Varchar2).Value = normalizedName;
                    await using var reader = await command.ExecuteReaderAsync(cancellationToken);
                    if (await reader.ReadAsync(cancellationToken))
                    {
                        itemTargetOwner = reader.IsDBNull(0) ? null : reader.GetString(0);
                        itemTargetName = reader.IsDBNull(1) ? null : reader.GetString(1);
                        if (itemTargetName is not null) objectDetails.Add(new SchemaProperty("Table", $"{itemTargetOwner}.{itemTargetName}"));
                        objectDetails.Add(new SchemaProperty("Base object type", reader.GetString(2)));
                        objectDetails.Add(new SchemaProperty("Trigger type", reader.GetString(3)));
                        objectDetails.Add(new SchemaProperty("Event", reader.GetString(4)));
                        objectDetails.Add(new SchemaProperty("Status", reader.GetString(5)));
                        objectDetails.Add(new SchemaProperty("Description", reader.GetString(6)));
                        if (!reader.IsDBNull(7)) objectDetails.Add(new SchemaProperty("When clause", reader.GetString(7)));
                    }
                }
                else if (normalizedType == "TYPE")
                {
                    await using var command = _connection.CreateCommand();
                    command.BindByName = true;
                    if (_transaction is not null) command.Transaction = _transaction;
                    command.CommandText = "SELECT typecode, attributes, methods, predefined, incomplete, supertype_owner, supertype_name, final, instantiable FROM all_types WHERE owner=:owner AND type_name=:name";
                    command.Parameters.Add("owner", OracleDbType.Varchar2).Value = normalizedOwner;
                    command.Parameters.Add("name", OracleDbType.Varchar2).Value = normalizedName;
                    await using (var reader = await command.ExecuteReaderAsync(cancellationToken))
                    {
                        if (await reader.ReadAsync(cancellationToken))
                        {
                            objectDetails.Add(new SchemaProperty("Type code", reader.GetString(0)));
                            objectDetails.Add(new SchemaProperty("Attributes", reader.GetValue(1).ToString() ?? "0"));
                            objectDetails.Add(new SchemaProperty("Methods", reader.GetValue(2).ToString() ?? "0"));
                            objectDetails.Add(new SchemaProperty("Predefined", reader.GetString(3)));
                            objectDetails.Add(new SchemaProperty("Incomplete", reader.GetString(4)));
                            if (!reader.IsDBNull(6)) objectDetails.Add(new SchemaProperty("Supertype", $"{reader.GetString(5)}.{reader.GetString(6)}"));
                            objectDetails.Add(new SchemaProperty("Final", reader.GetString(7)));
                            objectDetails.Add(new SchemaProperty("Instantiable", reader.GetString(8)));
                        }
                    }
                    await using var attrsCommand = _connection.CreateCommand();
                    attrsCommand.BindByName = true;
                    if (_transaction is not null) attrsCommand.Transaction = _transaction;
                    attrsCommand.CommandText = "SELECT attr_name, attr_type_name, length, precision, scale FROM all_type_attrs WHERE owner=:owner AND type_name=:name ORDER BY attr_no";
                    attrsCommand.Parameters.Add("owner", OracleDbType.Varchar2).Value = normalizedOwner;
                    attrsCommand.Parameters.Add("name", OracleDbType.Varchar2).Value = normalizedName;
                    await using (var attrsReader = await attrsCommand.ExecuteReaderAsync(cancellationToken))
                        while (await attrsReader.ReadAsync(cancellationToken)) columns.Add(new SchemaColumn(attrsReader.GetString(0), $"{attrsReader.GetString(1)} ({attrsReader.GetValue(2)})", true, false));

                    await using var methodsCommand = _connection.CreateCommand();
                    methodsCommand.BindByName = true;
                    if (_transaction is not null) methodsCommand.Transaction = _transaction;
                    methodsCommand.CommandText = "SELECT method_name,method_type,parameters,results,final,instantiable,overriding,inherited FROM all_type_methods WHERE owner=:owner AND type_name=:name ORDER BY method_no";
                    methodsCommand.Parameters.Add("owner", OracleDbType.Varchar2).Value = normalizedOwner;
                    methodsCommand.Parameters.Add("name", OracleDbType.Varchar2).Value = normalizedName;
                    await using var methodsReader = await methodsCommand.ExecuteReaderAsync(cancellationToken);
                    while (await methodsReader.ReadAsync(cancellationToken)) objectDetails.Add(new SchemaProperty("Method", $"{methodsReader.GetString(0)} · {methodsReader.GetString(1)} · {methodsReader.GetValue(2)} parameter(s) · {methodsReader.GetValue(3)} result(s) · final {methodsReader.GetString(4)} · instantiable {methodsReader.GetString(5)} · overriding {methodsReader.GetString(6)} · inherited {methodsReader.GetString(7)}"));
                }

                if (normalizedType is "TABLE" or "VIEW" or "MATERIALIZED VIEW" or "SYNONYM")
                {
                    await using var command = _connection.CreateCommand();
                    command.BindByName = true;
                    if (_transaction is not null) command.Transaction = _transaction;
                    command.CommandText = "SELECT c.column_name, c.data_type, c.nullable, c.data_length, c.char_length, c.char_used, c.data_precision, c.data_scale, c.data_default, m.comments FROM all_tab_columns c LEFT JOIN all_col_comments m ON m.owner=c.owner AND m.table_name=c.table_name AND m.column_name=c.column_name WHERE c.owner=:owner AND c.table_name=:tableName ORDER BY c.column_id";
                    command.Parameters.Add("owner", OracleDbType.Varchar2).Value = columnsOwner;
                    command.Parameters.Add("tableName", OracleDbType.Varchar2).Value = columnsName;
                    await using var reader = await command.ExecuteReaderAsync(cancellationToken);
                    while (await reader.ReadAsync(cancellationToken)) columns.Add(new SchemaColumn(reader.GetString(0), reader.GetString(1), reader.GetString(2) == "Y", false)
                    {
                        Length = reader.IsDBNull(3) ? null : Convert.ToInt32(reader.GetValue(3), CultureInfo.InvariantCulture),
                        CharacterLength = reader.IsDBNull(4) ? null : Convert.ToInt32(reader.GetValue(4), CultureInfo.InvariantCulture),
                        LengthUnit = reader.IsDBNull(5) ? "BYTE" : reader.GetString(5) == "C" ? "CHAR" : "BYTE",
                        Precision = reader.IsDBNull(6) ? null : Convert.ToInt32(reader.GetValue(6), CultureInfo.InvariantCulture),
                        Scale = reader.IsDBNull(7) ? null : Convert.ToInt32(reader.GetValue(7), CultureInfo.InvariantCulture),
                        DefaultValue = reader.IsDBNull(8) ? null : reader.GetString(8).Trim(),
                        Comment = reader.IsDBNull(9) ? null : reader.GetString(9)
                    });
                }

                if (normalizedType == "INDEX")
                {
                    await using var command = _connection.CreateCommand();
                    command.BindByName = true;
                    if (_transaction is not null) command.Transaction = _transaction;
                    command.CommandText = "SELECT table_owner, table_name, index_type, uniqueness, status, visibility, partitioned, compression FROM all_indexes WHERE owner=:owner AND index_name=:name";
                    command.Parameters.Add("owner", OracleDbType.Varchar2).Value = normalizedOwner;
                    command.Parameters.Add("name", OracleDbType.Varchar2).Value = normalizedName;
                    await using (var reader = await command.ExecuteReaderAsync(cancellationToken))
                    {
                        if (await reader.ReadAsync(cancellationToken))
                        {
                            itemTargetOwner = reader.GetString(0);
                            itemTargetName = reader.GetString(1);
                            objectDetails.Add(new SchemaProperty("Table", $"{itemTargetOwner}.{itemTargetName}"));
                            objectDetails.Add(new SchemaProperty("Index type", reader.GetString(2)));
                            objectDetails.Add(new SchemaProperty("Uniqueness", reader.GetString(3)));
                            objectDetails.Add(new SchemaProperty("Status", reader.GetString(4)));
                            objectDetails.Add(new SchemaProperty("Visibility", reader.GetString(5)));
                            objectDetails.Add(new SchemaProperty("Partitioned", reader.GetString(6)));
                            objectDetails.Add(new SchemaProperty("Compression", reader.GetString(7)));
                        }
                    }
                    await using var columnCommand = _connection.CreateCommand();
                    columnCommand.BindByName = true;
                    if (_transaction is not null) columnCommand.Transaction = _transaction;
                    columnCommand.CommandText = "SELECT column_name, column_position, descend FROM all_ind_columns WHERE index_owner=:owner AND index_name=:name ORDER BY column_position";
                    columnCommand.Parameters.Add("owner", OracleDbType.Varchar2).Value = normalizedOwner;
                    columnCommand.Parameters.Add("name", OracleDbType.Varchar2).Value = normalizedName;
                    await using var columnReader = await columnCommand.ExecuteReaderAsync(cancellationToken);
                    while (await columnReader.ReadAsync(cancellationToken)) columns.Add(new SchemaColumn(columnReader.GetString(0), $"Position {columnReader.GetInt32(1)} · {columnReader.GetString(2)}", false, true));
                }
                else if (normalizedType == "CONSTRAINT")
                {
                    await using var command = _connection.CreateCommand();
                    command.BindByName = true;
                    if (_transaction is not null) command.Transaction = _transaction;
                    command.CommandText = "SELECT c.table_name, c.constraint_type, c.status, c.validated, c.search_condition, c.r_owner, c.r_constraint_name, c.deferrable, c.deferred, c.delete_rule, (SELECT r.owner||'.'||r.table_name FROM all_constraints r WHERE r.owner=c.r_owner AND r.constraint_name=c.r_constraint_name) referenced_table FROM all_constraints c WHERE c.owner=:owner AND c.constraint_name=:name";
                    command.Parameters.Add("owner", OracleDbType.Varchar2).Value = normalizedOwner;
                    command.Parameters.Add("name", OracleDbType.Varchar2).Value = normalizedName;
                    await using (var reader = await command.ExecuteReaderAsync(cancellationToken))
                    {
                        if (await reader.ReadAsync(cancellationToken))
                        {
                            itemTargetOwner = normalizedOwner;
                            itemTargetName = reader.GetString(0);
                            objectDetails.Add(new SchemaProperty("Table", $"{normalizedOwner}.{itemTargetName}"));
                            objectDetails.Add(new SchemaProperty("Constraint type", reader.GetString(1)));
                            objectDetails.Add(new SchemaProperty("Status", reader.GetString(2)));
                            objectDetails.Add(new SchemaProperty("Validated", reader.GetString(3)));
                            if (!reader.IsDBNull(4)) objectDetails.Add(new SchemaProperty("Condition", reader.GetString(4)));
                            objectDetails.Add(new SchemaProperty("Deferrable", reader.GetString(7)));
                            objectDetails.Add(new SchemaProperty("Deferred", reader.GetString(8)));
                            if (!reader.IsDBNull(10)) objectDetails.Add(new SchemaProperty("References", reader.GetString(10)));
                            if (!reader.IsDBNull(9)) objectDetails.Add(new SchemaProperty("Delete rule", reader.GetString(9)));
                        }
                    }
                    await using var columnCommand = _connection.CreateCommand();
                    columnCommand.BindByName = true;
                    if (_transaction is not null) columnCommand.Transaction = _transaction;
                    columnCommand.CommandText = "SELECT column_name, position FROM all_cons_columns WHERE owner=:owner AND constraint_name=:name ORDER BY position";
                    columnCommand.Parameters.Add("owner", OracleDbType.Varchar2).Value = normalizedOwner;
                    columnCommand.Parameters.Add("name", OracleDbType.Varchar2).Value = normalizedName;
                    await using var columnReader = await columnCommand.ExecuteReaderAsync(cancellationToken);
                    while (await columnReader.ReadAsync(cancellationToken)) columns.Add(new SchemaColumn(columnReader.GetString(0), $"Position {columnReader.GetInt32(1)}", false, false));
                }
                else if (normalizedType == "SEQUENCE")
                {
                    await using var command = _connection.CreateCommand();
                    command.BindByName = true;
                    if (_transaction is not null) command.Transaction = _transaction;
                    command.CommandText = "SELECT min_value, max_value, increment_by, cycle_flag, order_flag, cache_size, last_number FROM all_sequences WHERE sequence_owner=:owner AND sequence_name=:name";
                    command.Parameters.Add("owner", OracleDbType.Varchar2).Value = normalizedOwner;
                    command.Parameters.Add("name", OracleDbType.Varchar2).Value = normalizedName;
                    await using var reader = await command.ExecuteReaderAsync(cancellationToken);
                    if (await reader.ReadAsync(cancellationToken))
                    {
                        objectDetails.Add(new SchemaProperty("Minimum", reader.GetValue(0).ToString() ?? ""));
                        objectDetails.Add(new SchemaProperty("Maximum", reader.GetValue(1).ToString() ?? ""));
                        objectDetails.Add(new SchemaProperty("Increment", reader.GetValue(2).ToString() ?? ""));
                        objectDetails.Add(new SchemaProperty("Cycle", reader.GetString(3)));
                        objectDetails.Add(new SchemaProperty("Order", reader.GetString(4)));
                        objectDetails.Add(new SchemaProperty("Cache size", reader.GetValue(5).ToString() ?? ""));
                        objectDetails.Add(new SchemaProperty("Next value estimate", reader.GetValue(6).ToString() ?? ""));
                    }
                }
                else if (normalizedType == "DATABASE LINK")
                {
                    await using var command = _connection.CreateCommand();
                    command.BindByName = true;
                    if (_transaction is not null) command.Transaction = _transaction;
                    command.CommandText = "SELECT username, host, created FROM all_db_links WHERE owner=:owner AND db_link=:name";
                    command.Parameters.Add("owner", OracleDbType.Varchar2).Value = normalizedOwner;
                    command.Parameters.Add("name", OracleDbType.Varchar2).Value = normalizedName;
                    await using var reader = await command.ExecuteReaderAsync(cancellationToken);
                    if (await reader.ReadAsync(cancellationToken))
                    {
                        objectDetails.Add(new SchemaProperty("Username", reader.IsDBNull(0) ? "Current user" : reader.GetString(0)));
                        objectDetails.Add(new SchemaProperty("Connect string", reader.GetString(1)));
                        objectDetails.Add(new SchemaProperty("Created", reader.GetDateTime(2).ToString("u", CultureInfo.InvariantCulture)));
                    }
                }
                else if (normalizedType is "PACKAGE" or "PROCEDURE" or "FUNCTION" or "TRIGGER" or "TYPE")
                {
                    await using var command = _connection.CreateCommand();
                    command.BindByName = true;
                    if (_transaction is not null) command.Transaction = _transaction;
                    command.CommandText = "SELECT line, text FROM all_source WHERE owner=:owner AND name=:name AND type=:type ORDER BY line";
                    command.Parameters.Add("owner", OracleDbType.Varchar2).Value = normalizedOwner;
                    command.Parameters.Add("name", OracleDbType.Varchar2).Value = normalizedName;
                    command.Parameters.Add("type", OracleDbType.Varchar2).Value = normalizedType;
                    var source = new System.Text.StringBuilder();
                    await using (var reader = await command.ExecuteReaderAsync(cancellationToken))
                        while (await reader.ReadAsync(cancellationToken)) source.Append(reader.GetString(1));
                    if (source.Length > 0) objectDetails.Add(new SchemaProperty("Source", source.ToString()));
                    if (normalizedType is "PACKAGE" or "TYPE")
                    {
                        await using var bodyCommand = _connection.CreateCommand();
                        bodyCommand.BindByName = true;
                        if (_transaction is not null) bodyCommand.Transaction = _transaction;
                        bodyCommand.CommandText = "SELECT text FROM all_source WHERE owner=:owner AND name=:name AND type=:bodyType ORDER BY line";
                        bodyCommand.Parameters.Add("owner", OracleDbType.Varchar2).Value = normalizedOwner;
                        bodyCommand.Parameters.Add("name", OracleDbType.Varchar2).Value = normalizedName;
                        bodyCommand.Parameters.Add("bodyType", OracleDbType.Varchar2).Value = normalizedType + " BODY";
                        var body = new System.Text.StringBuilder();
                        await using (var bodyReader = await bodyCommand.ExecuteReaderAsync(cancellationToken))
                            while (await bodyReader.ReadAsync(cancellationToken)) body.Append(bodyReader.GetString(0));
                        if (body.Length > 0) objectDetails.Add(new SchemaProperty("Body", body.ToString()));
                    }
                    if (normalizedType is "PROCEDURE" or "FUNCTION")
                    {
                        await using var argsCommand = _connection.CreateCommand();
                        argsCommand.BindByName = true;
                        if (_transaction is not null) argsCommand.Transaction = _transaction;
                        argsCommand.CommandText = "SELECT NVL(argument_name,'RETURN'), in_out, data_type, position, overload, defaulted FROM all_arguments WHERE owner=:owner AND object_name=:name AND data_level=0 ORDER BY sequence";
                        argsCommand.Parameters.Add("owner", OracleDbType.Varchar2).Value = normalizedOwner;
                        argsCommand.Parameters.Add("name", OracleDbType.Varchar2).Value = normalizedName;
                        await using var argsReader = await argsCommand.ExecuteReaderAsync(cancellationToken);
                        while (await argsReader.ReadAsync(cancellationToken)) objectDetails.Add(new SchemaProperty(argsReader.GetString(0), $"{argsReader.GetString(1)} · {argsReader.GetString(2)} · position {argsReader.GetInt32(3)}{(argsReader.IsDBNull(4) ? "" : $" · overload {argsReader.GetString(4)}")}{(argsReader.GetString(5) == "Y" ? " · has default" : "")}"));
                    }
                    if (normalizedType == "PACKAGE")
                    {
                        await using var membersCommand = _connection.CreateCommand();
                        membersCommand.BindByName = true;
                        if (_transaction is not null) membersCommand.Transaction = _transaction;
                        membersCommand.CommandText = "SELECT procedure_name, subprogram_id, overload FROM all_procedures WHERE owner=:owner AND object_name=:name AND procedure_name IS NOT NULL ORDER BY subprogram_id";
                        membersCommand.Parameters.Add("owner", OracleDbType.Varchar2).Value = normalizedOwner;
                        membersCommand.Parameters.Add("name", OracleDbType.Varchar2).Value = normalizedName;
                        await using var membersReader = await membersCommand.ExecuteReaderAsync(cancellationToken);
                        while (await membersReader.ReadAsync(cancellationToken)) objectDetails.Add(new SchemaProperty("Member", $"{membersReader.GetString(0)} · subprogram {membersReader.GetInt32(1)}{(membersReader.IsDBNull(2) ? "" : $" · overload {membersReader.GetString(2)}")}"));
                    }
                }

                if (normalizedType is not ("DATABASE LINK" or "CONSTRAINT"))
                {
                    await using var statusCommand = _connection.CreateCommand();
                    statusCommand.BindByName = true;
                    if (_transaction is not null) statusCommand.Transaction = _transaction;
                    statusCommand.CommandText = "SELECT status, created, last_ddl_time FROM all_objects WHERE owner=:owner AND object_name=:name AND object_type=:objectType";
                    statusCommand.Parameters.Add("owner", OracleDbType.Varchar2).Value = normalizedOwner;
                    statusCommand.Parameters.Add("name", OracleDbType.Varchar2).Value = normalizedName;
                    statusCommand.Parameters.Add("objectType", OracleDbType.Varchar2).Value = normalizedType;
                    await using (var statusReader = await statusCommand.ExecuteReaderAsync(cancellationToken))
                        if (await statusReader.ReadAsync(cancellationToken))
                        {
                            objectDetails.Add(new SchemaProperty("Object status", statusReader.GetString(0)));
                            objectDetails.Add(new SchemaProperty("Created", statusReader.GetDateTime(1).ToString("u", CultureInfo.InvariantCulture)));
                            objectDetails.Add(new SchemaProperty("Last DDL", statusReader.GetDateTime(2).ToString("u", CultureInfo.InvariantCulture)));
                        }
                    if (normalizedType is "PACKAGE" or "TYPE")
                    {
                        await using var bodyStatusCommand = _connection.CreateCommand();
                        bodyStatusCommand.BindByName = true;
                        if (_transaction is not null) bodyStatusCommand.Transaction = _transaction;
                        bodyStatusCommand.CommandText = "SELECT status FROM all_objects WHERE owner=:owner AND object_name=:name AND object_type=:bodyType";
                        bodyStatusCommand.Parameters.Add("owner", OracleDbType.Varchar2).Value = normalizedOwner;
                        bodyStatusCommand.Parameters.Add("name", OracleDbType.Varchar2).Value = normalizedName;
                        bodyStatusCommand.Parameters.Add("bodyType", OracleDbType.Varchar2).Value = normalizedType + " BODY";
                        var bodyStatus = Convert.ToString(await bodyStatusCommand.ExecuteScalarAsync(cancellationToken), CultureInfo.InvariantCulture);
                        objectDetails.Add(new SchemaProperty("Body status", bodyStatus ?? "No body"));
                    }
                }

                if (normalizedType is "PACKAGE" or "PROCEDURE" or "FUNCTION" or "TRIGGER" or "TYPE")
                {
                    await using var errorsCommand = _connection.CreateCommand();
                    errorsCommand.BindByName = true;
                    if (_transaction is not null) errorsCommand.Transaction = _transaction;
                    errorsCommand.CommandText = "SELECT type,line,position,attribute,text FROM all_errors WHERE owner=:owner AND name=:name ORDER BY sequence FETCH FIRST 101 ROWS ONLY";
                    errorsCommand.Parameters.Add("owner", OracleDbType.Varchar2).Value = normalizedOwner;
                    errorsCommand.Parameters.Add("name", OracleDbType.Varchar2).Value = normalizedName;
                    await using var errorsReader = await errorsCommand.ExecuteReaderAsync(cancellationToken);
                    while (await errorsReader.ReadAsync(cancellationToken)) objectDetails.Add(new SchemaProperty($"Compilation error · {errorsReader.GetString(0)} {errorsReader.GetInt32(1)}:{errorsReader.GetInt32(2)}", $"{errorsReader.GetString(3)} · {errorsReader.GetString(4)}"));
                }

                var indexed = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                if (columns.Count > 0 && normalizedType is "TABLE" or "MATERIALIZED VIEW" or "SYNONYM")
                {
                    await using var command = _connection.CreateCommand();
                    command.BindByName = true;
                    if (_transaction is not null) command.Transaction = _transaction;
                    command.CommandText = "SELECT column_name FROM all_ind_columns WHERE table_owner=:owner AND table_name=:tableName";
                    command.Parameters.Add("owner", OracleDbType.Varchar2).Value = columnsOwner;
                    command.Parameters.Add("tableName", OracleDbType.Varchar2).Value = columnsName;
                    await using var reader = await command.ExecuteReaderAsync(cancellationToken);
                    while (await reader.ReadAsync(cancellationToken)) indexed.Add(reader.GetString(0));
                }
                return new SchemaObject(tableName, normalizedType, columns.Select(column => column with { Indexed = indexed.Contains(column.Name) }).ToArray())
                { Owner = itemOwner, TargetOwner = itemTargetOwner, TargetName = itemTargetName, DbLink = itemDbLink, Details = objectDetails };
            }
            finally { Touch(); _gate.Release(); }
        }

    }
}
