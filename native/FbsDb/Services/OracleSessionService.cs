using System.Diagnostics;
using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using Oracle.ManagedDataAccess.Client;

namespace FbsDb.Services;

public sealed partial class OracleSessionService : IDisposable
{
    private readonly string _credentialDirectory;
    public OracleSessionService(string? credentialDirectory = null) => _credentialDirectory = credentialDirectory ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "fbsDB", "credentials");
    private OracleConnection? _connection;
    private OracleTransaction? _transaction;
    private string? _profileId;
    private readonly SemaphoreSlim _gate = new(1, 1);
    private sealed record ParkedResult(OracleDataReader Reader, OracleCommand Command, object?[]? NextRow, SqlColumn[] Columns, int Offset);
    private readonly Dictionary<string, ParkedResult> _parkedResults = new();
    private OracleDataReader? _pageReader;
    private OracleCommand? _pageCommand;
    private object?[]? _nextRow;
    private string? _resultId;
    private SqlColumn[] _pageColumns = [];
    private int _pageOffset;
    private OracleCommand? _activeCommand;
    private CancellationTokenSource? _activeCancellation;

    public bool IsConnected => _connection?.State == System.Data.ConnectionState.Open;
    public bool HasPendingTransaction => _transaction is not null;
    private volatile bool _autoCommit;
    public bool AutoCommit => _autoCommit;
    public async Task SetAutoCommitAsync(bool enabled)
    {
        await _gate.WaitAsync();
        try
        {
            if (enabled && _transaction is not null) throw new InvalidOperationException("Commit or roll back the pending transaction before enabling auto commit.");
            _autoCommit = enabled;
        }
        finally { _gate.Release(); }
    }
    public string? ProfileId => _profileId;
    public string? ServerVersion => IsConnected ? _connection!.ServerVersion : null;

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

    public async Task<bool> HasSavedCredentialsAsync(string profileId)
    {
        var file = CredentialFile(profileId);
        if (!File.Exists(file)) return false;
        try { return !string.IsNullOrWhiteSpace(Encoding.UTF8.GetString(ProtectedData.Unprotect(await File.ReadAllBytesAsync(file), null, DataProtectionScope.CurrentUser))); }
        catch (CryptographicException) { return false; }
    }

    public async Task ConnectAsync(ConnectionProfile profile, string user, string password, bool? remember, CancellationToken cancellationToken = default)
    {
        await _gate.WaitAsync(cancellationToken);
        try
        {
            if (!profile.Available) throw new InvalidOperationException("Connection target is unavailable.");
            if (_transaction is not null) throw new InvalidOperationException("There is an uncommitted transaction. Commit or roll it back before switching connections.");
            if (string.IsNullOrWhiteSpace(user) || string.IsNullOrEmpty(password))
            {
                var saved = await GetSavedCredentialsAsync(profile.Id);
                if (saved is not null) (user, password) = saved.Value;
            }
            if (string.IsNullOrWhiteSpace(user) || string.IsNullOrEmpty(password))
                throw new InvalidOperationException("Enter an Oracle username and password, or save credentials for this profile.");
            var builder = new OracleConnectionStringBuilder
            {
                DataSource = profile.Descriptor,
                UserID = user,
                Password = password,
                Pooling = true,
                MinPoolSize = 0,
                MaxPoolSize = 10,
                ConnectionTimeout = 15,
                ValidateConnection = false,
            };
            if (profile.Method == "tns") builder.TnsAdmin = Path.GetDirectoryName(profile.Source);
            var connection = new OracleConnection(builder.ConnectionString);
            try
            {
                await connection.OpenAsync(cancellationToken);
                await using var outputCommand = connection.CreateCommand();
                outputCommand.CommandText = "BEGIN DBMS_OUTPUT.ENABLE(NULL); END;";
                await outputCommand.ExecuteNonQueryAsync(cancellationToken);
            }
            catch { await connection.DisposeAsync(); throw; }
            IReadOnlyDictionary<string,string>? initialNls;
            try {
                initialNls=await ReadNlsConnectionAsync(connection,null,cancellationToken);
                if(profile.Nls.Count>0)await ApplyNlsConnectionAsync(connection,profile.Nls,cancellationToken);
            }catch{await connection.DisposeAsync();throw;}
            await CloseAllPagedResultsAsync();
            var previous = _connection;
            _connection = connection; _executedSqlIds.Clear(); _analysisReadOnly = false;
            IsInactive = false; Touch(); _profileId = profile.Id; _initialNls=initialNls;_configuredNls=new Dictionary<string,string>(profile.Nls);
            if (previous is not null) await previous.DisposeAsync();
            await ApplyCredentialPreferenceAsync(profile.Id, user, password, remember);
        }
        finally { Touch(); _gate.Release(); }
    }

    internal Task ApplyCredentialPreferenceAsync(string id, string user, string password, bool? remember) => remember switch
    {
        true => SaveCredentialsAsync(id, user, password),
        false => DeleteCredentialsAsync(id),
        null => Task.CompletedTask,
    };

    public async Task TestConnectionAsync(ConnectionProfile profile, string user, string password)
    {
        if (!profile.Available) throw new InvalidOperationException("Connection target is unavailable.");
        if (string.IsNullOrEmpty(password))
        {
            var saved = await GetSavedCredentialsAsync(profile.Id);
            if (saved is not null && (string.IsNullOrWhiteSpace(user) || user.Equals(saved.Value.User, StringComparison.OrdinalIgnoreCase))) (user, password) = saved.Value;
        }
        if (string.IsNullOrWhiteSpace(user) || string.IsNullOrEmpty(password)) throw new InvalidOperationException("Enter a username and password to test.");
        var builder = new OracleConnectionStringBuilder { DataSource = profile.Descriptor, UserID = user, Password = password, Pooling = false, ConnectionTimeout = 15 };
        if (profile.Method == "tns") builder.TnsAdmin = Path.GetDirectoryName(profile.Source);
        await using var test = new OracleConnection(builder.ConnectionString);
        await test.OpenAsync();
    }

    public async Task<SqlExecutionResult> ExecuteAsync(string sql, IReadOnlyList<SqlBindParameter>? parameters = null, int rowLimit = 1000, CancellationToken cancellationToken = default, int timeoutSeconds = 0, IProgress<string>? progress = null)
    {
        await _gate.WaitAsync(cancellationToken);
        var timer = Stopwatch.StartNew();
        CancellationTokenSource? operationCancellation = null;
        CancellationTokenSource? timeoutCancellation = null;
        CancellationTokenRegistration timeoutRegistration = default;
        var timeoutElapsed = 0;
        var operationToken = cancellationToken;
        OracleCommand? command = null;
        try
        {
            ParkPagedResult();
            operationCancellation = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            operationToken = operationCancellation.Token;
            if (timeoutSeconds > 0)
            {
                timeoutCancellation = new CancellationTokenSource(TimeSpan.FromSeconds(Math.Clamp(timeoutSeconds, 1, 86400)));
                timeoutRegistration = timeoutCancellation.Token.Register(() =>
                {
                    if (!cancellationToken.IsCancellationRequested)
                    {
                        Interlocked.Exchange(ref timeoutElapsed, 1);
                        try { operationCancellation.Cancel(); } catch (ObjectDisposedException) { }
                    }
                });
            }
            Volatile.Write(ref _activeCancellation, operationCancellation);
            if (_connection?.State != System.Data.ConnectionState.Open) throw new InvalidOperationException("No Oracle connection is active.");
            var statement = OracleSqlUnit.Normalize(sql);
            if (statement.Length == 0) throw new InvalidOperationException("There is no SQL statement to run.");
            if (_analysisReadOnly && FirstKeyword(statement) is not ("SELECT" or "WITH")) throw new InvalidOperationException("Read-only analysis permits SELECT queries only. End analysis before executing this statement.");
            var beginsTransaction = OracleSqlUnit.RequiresManualTransaction(statement) && _transaction is null;
            command = _connection.CreateCommand();
            command.BindByName = true;
            command.FetchSqlId = true;
            command.CommandText = statement;
            // The linked timeout token is the primary clock so timeout and user
            // cancellation stay distinguishable. Keep ODP.NET's own timeout as
            // a one-second provider-side backstop if cancellation is ignored.
            command.CommandTimeout = timeoutSeconds == 0 ? 0 : Math.Clamp(timeoutSeconds + 1, 1, 86400);
            foreach (var parameter in parameters ?? [])
            {
                var parsed = Enum.TryParse<OracleDbType>(parameter.Type, true, out var dbType);
                if (!parsed && string.Equals(parameter.Type, "NUMBER", StringComparison.OrdinalIgnoreCase)) { dbType = OracleDbType.Decimal; parsed = true; }
                if (!parsed) throw new InvalidOperationException($"Unsupported bind type '{parameter.Type}'.");
                var oracleParameter = command.Parameters.Add(parameter.Name.TrimStart(':'), dbType);
                oracleParameter.Value = ParseParameterValue(dbType, parameter.Value);
            }
            if (beginsTransaction) _transaction = _connection.BeginTransaction();
            if (_transaction is not null) command.Transaction = _transaction;
            _activeCommand = command;

            var firstKeyword = FirstKeyword(statement);
            if (firstKeyword is "SELECT" or "WITH")
            {
                progress?.Report("Waiting for first rows");
                _pageReader = await command.ExecuteReaderAsync(operationToken);
                var querySqlId = command.SqlId;
                _pageCommand = command;
                _resultId = Guid.NewGuid().ToString("N");
                _pageOffset = 0;
                _pageColumns = ReadResultColumns(_pageReader);
                if(_pageColumns.Any(column=>column.TemporalKind=="TIMESTAMP WITH LOCAL TIME ZONE")){
                    await using var timezone=_connection.CreateCommand();timezone.CommandText="SELECT SESSIONTIMEZONE FROM dual";timezone.CommandTimeout=5;if(_transaction is not null)timezone.Transaction=_transaction;
                    var zone=Convert.ToString(await timezone.ExecuteScalarAsync(operationToken),CultureInfo.InvariantCulture);
                    _pageColumns=_pageColumns.Select(column=>column.TemporalKind=="TIMESTAMP WITH LOCAL TIME ZONE"?column with{SessionTimeZone=zone}:column).ToArray();
                }
                progress?.Report("Fetching first page");
                var page = await ReadPageAsync(Math.Clamp(rowLimit, 1, 10000), operationToken);
                _activeCommand = null;
                var output = await ReadDbmsOutputAsync(operationToken);
                if (!string.IsNullOrEmpty(querySqlId)) _executedSqlIds.Add(querySqlId);
                return page with { ElapsedMs = timer.ElapsedMilliseconds, Output = output, SqlId = querySqlId };

            }

            operationToken.ThrowIfCancellationRequested();
            progress?.Report("Executing statement");
            int affected;
            try { affected = await command.ExecuteNonQueryAsync(operationToken); }
            catch (OracleException ex) when (ex.Number == 24344 && OracleSqlUnit.CompilationTarget(statement) is not null) { affected = -1; }
            _activeCommand = null;
            var outputLines = await ReadDbmsOutputAsync(operationToken);
            if (_transaction is not null && firstKeyword is "BEGIN" or "DECLARE" or "CALL") await RefreshPlsqlTransactionStateAsync(operationToken);
            var transactionPending = _transaction is not null;
            if (IsDdl(statement))
            {
                if (_transaction is not null) await _transaction.DisposeAsync();
                _transaction = null; _analysisReadOnly = false;
                transactionPending = false;
            }
            if (_autoCommit && beginsTransaction && _transaction is not null)
            {
                progress?.Report("Committing statement");
                await _transaction.CommitAsync(operationToken);
                await _transaction.DisposeAsync();
                _transaction = null;
                transactionPending = false;
            }
            timer.Stop();
            if (command.SqlId is { Length: > 0 } sqlId) _executedSqlIds.Add(sqlId);
            return new SqlExecutionResult([], [], affected, timer.ElapsedMilliseconds, 0, false, transactionPending, outputLines) { SqlId = command.SqlId };
        }
        catch (Exception ex) when (Volatile.Read(ref timeoutElapsed) == 1 && !cancellationToken.IsCancellationRequested)
        {
            if (_transaction is not null) _autoCommit = false;
            _activeCommand = null;
            await ClosePagedResultAsync();
            if (_transaction is not null && _connection?.State != System.Data.ConnectionState.Open)
            {
                await _transaction.DisposeAsync();
                _transaction = null; _analysisReadOnly = false;
            }
            throw new TimeoutException($"Query exceeded the configured timeout of {timeoutSeconds} seconds.", ex);
        }
        catch (Exception ex) when (operationCancellation?.IsCancellationRequested == true && ex is not OperationCanceledException)
        {
            if (_transaction is not null) _autoCommit = false;
            _activeCommand = null;
            await ClosePagedResultAsync();
            if (_transaction is not null && _connection?.State != System.Data.ConnectionState.Open)
            {
                await _transaction.DisposeAsync();
                _transaction = null; _analysisReadOnly = false;
            }
            throw new OperationCanceledException("Oracle query cancelled.", ex, operationToken);
        }
        catch
        {
            if (_transaction is not null) _autoCommit = false;
            _activeCommand = null;
            await ClosePagedResultAsync();
            if (_transaction is not null && _connection?.State != System.Data.ConnectionState.Open)
            {
                await _transaction.DisposeAsync();
                _transaction = null; _analysisReadOnly = false;
            }
            throw;
        }
        finally
        {
            if (command is not null && !ReferenceEquals(command, _pageCommand)) await command.DisposeAsync();
            _activeCommand = null;
            if (operationCancellation is not null)
            {
                Interlocked.CompareExchange(ref _activeCancellation, null, operationCancellation);
                operationCancellation.Dispose();
            }
            timeoutRegistration.Dispose();
            timeoutCancellation?.Dispose();
            Touch(); _gate.Release();
        }
    }

    private static SqlColumn[] ReadResultColumns(OracleDataReader reader)
    {
        System.Data.DataTable? schema = null;
        try { schema = reader.GetSchemaTable(); } catch (NotSupportedException) { }
        return Enumerable.Range(0, reader.FieldCount).Select(i => {
            var row = schema is not null && i < schema.Rows.Count ? schema.Rows[i] : null;
            object? Get(string key) => row is not null && row.Table.Columns.Contains(key) && row[key] is not DBNull ? row[key] : null;
            int? Number(string key) => Get(key) is { } value ? Convert.ToInt32(value, CultureInfo.InvariantCulture) : null;
            var temporal=reader.GetProviderSpecificFieldType(i).Name switch {"OracleDate"=>"DATE","OracleTimeStamp"=>"TIMESTAMP","OracleTimeStampTZ"=>"TIMESTAMP WITH TIME ZONE","OracleTimeStampLTZ"=>"TIMESTAMP WITH LOCAL TIME ZONE",_=>null};
            return new SqlColumn(reader.GetName(i), temporal??reader.GetDataTypeName(i)) { TemporalKind=temporal,
                Size = Number("ColumnSize"), Precision = Number("NumericPrecision"), Scale = Number("NumericScale"),
                Nullable = Get("AllowDBNull") is bool nullable ? nullable : null,
                SourceSchema = Get("BaseSchemaName")?.ToString(), SourceTable = Get("BaseTableName")?.ToString(), SourceColumn = Get("BaseColumnName")?.ToString()
            };
        }).ToArray();
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
    public static string NormalizeIdentifier(string value)=>value.StartsWith('"')&&value.EndsWith('"')?value[1..^1].Replace("\"\"","\""):value.ToUpperInvariant();
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
    private object?[] ReadCurrentRow()
    {
        var row = new object?[_pageReader!.FieldCount];
        for (var i = 0; i < row.Length; i++) {
            if(_pageReader.IsDBNull(i)){row[i]=null;continue;}
            var temporal=_pageColumns[i].TemporalKind;
            if(temporal is not null){row[i]=temporal switch{"DATE"=>OracleTemporalCell.From(_pageReader.GetOracleDate(i)),"TIMESTAMP"=>OracleTemporalCell.From(_pageReader.GetOracleTimeStamp(i)),"TIMESTAMP WITH TIME ZONE"=>OracleTemporalCell.From(_pageReader.GetOracleTimeStampTZ(i)),_=>OracleTemporalCell.From(_pageReader.GetOracleTimeStampLTZ(i),_pageColumns[i].SessionTimeZone)};continue;}
            var type=_pageReader.GetFieldType(i);
            row[i]=type==typeof(decimal)?_pageReader.GetOracleDecimal(i).ToString().Replace(CultureInfo.CurrentCulture.NumberFormat.NumberDecimalSeparator,"."):ToWireValue(_pageReader.GetValue(i));
        }
        return row;
    }
    private async Task<SqlExecutionResult> ReadPageAsync(int size, CancellationToken token)
    {
        var id = _resultId;
        var offset = _pageOffset;
        var columns = _pageColumns;
        var rows = new List<object?[]>();
        if (_nextRow is not null) { rows.Add(_nextRow); _nextRow = null; }
        while (rows.Count < size && await _pageReader!.ReadAsync(token)) rows.Add(ReadCurrentRow());
        if (rows.Count == size && await _pageReader!.ReadAsync(token)) _nextRow = ReadCurrentRow();
        var hasMore = _nextRow is not null;
        _pageOffset += rows.Count;
        if (!hasMore) await ClosePagedResultAsync();
        return new SqlExecutionResult(columns, rows, null, 0, rows.Count, false, _transaction is not null, []) { ResultId = id, HasMore = hasMore, PageSize = size, Offset = offset };
    }
    private void ParkPagedResult()
    {
        if (_resultId is not null && _pageReader is not null && _pageCommand is not null)
            _parkedResults[_resultId] = new(_pageReader, _pageCommand, _nextRow, _pageColumns, _pageOffset);
        _pageReader = null; _pageCommand = null; _nextRow = null; _resultId = null;
    }
    private async Task CloseAllPagedResultsAsync()
    {
        await ClosePagedResultAsync();
        foreach (var cursor in _parkedResults.Values) { await cursor.Reader.DisposeAsync(); await cursor.Command.DisposeAsync(); }
        _parkedResults.Clear();
    }
    public async Task CloseResultAsync(string resultId)
    {
        await _gate.WaitAsync();
        try
        {
            if (_resultId == resultId) await ClosePagedResultAsync();
            else if (_parkedResults.Remove(resultId, out var cursor)) { await cursor.Reader.DisposeAsync(); await cursor.Command.DisposeAsync(); }
        }
        finally { Touch(); _gate.Release(); }
    }
    private async Task ClosePagedResultAsync()
    {
        var reader = _pageReader; var command = _pageCommand;
        _pageReader = null; _pageCommand = null; _nextRow = null; _resultId = null;
        if (reader is not null) await reader.DisposeAsync();
        if (command is not null) await command.DisposeAsync();
    }
    public async Task<SqlExecutionResult> FetchNextPageAsync(string resultId, int pageSize, CancellationToken token = default)
    {
        await _gate.WaitAsync(token);
        using var cancellation = CancellationTokenSource.CreateLinkedTokenSource(token);
        var timer = Stopwatch.StartNew();
        try
        {
            if (_resultId != resultId && _parkedResults.Remove(resultId, out var parked))
            {
                ParkPagedResult();
                _resultId = resultId; _pageReader = parked.Reader; _pageCommand = parked.Command; _nextRow = parked.NextRow; _pageColumns = parked.Columns; _pageOffset = parked.Offset;
            }
            if (_pageReader is null || _resultId != resultId) throw new InvalidOperationException("This result cursor is no longer available. Run the query again.");
            Volatile.Write(ref _activeCancellation, cancellation);
            _activeCommand = _pageCommand;
            try { return (await ReadPageAsync(Math.Clamp(pageSize, 1, 10000), cancellation.Token)) with { ElapsedMs = timer.ElapsedMilliseconds }; }
            catch { await ClosePagedResultAsync(); throw; }
        }
        finally { _activeCommand = null; Interlocked.CompareExchange(ref _activeCancellation, null, cancellation); Touch(); _gate.Release(); }
    }

    public bool CancelCurrentOperation()
    {
        var cancellation = Volatile.Read(ref _activeCancellation);
        if (cancellation is null) return false;
        try { cancellation.Cancel(); } catch (ObjectDisposedException) { return false; }
        var command = Volatile.Read(ref _activeCommand);
        try { command?.Cancel(); }
        catch (Exception ex) when (ex is OracleException or InvalidOperationException or ObjectDisposedException) { }
        return true;
    }

    public async Task<SqlExecutionResult> ExplainPlanAsync(string sql, CancellationToken cancellationToken = default)
    {
        await _gate.WaitAsync(cancellationToken);
        var timer = Stopwatch.StartNew();
        var ownsTransaction = _transaction is null;
        string? statementId = null;
        CancellationTokenSource? operationCancellation = null;
        var operationToken = cancellationToken;
        try
        {
            operationCancellation = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            operationToken = operationCancellation.Token;
            Volatile.Write(ref _activeCancellation, operationCancellation);
            if (_connection?.State != System.Data.ConnectionState.Open) throw new InvalidOperationException("No Oracle connection is active.");
            if (_analysisReadOnly) throw new InvalidOperationException("Estimated Explain Plan writes PLAN_TABLE. End read-only analysis first, or inspect an executed cursor plan.");
            var statement = sql.Trim().TrimEnd(';').Trim();
            var keyword = FirstKeyword(statement);
            if (keyword is not ("SELECT" or "WITH" or "INSERT" or "UPDATE" or "DELETE"))
                throw new InvalidOperationException("Explain Plan supports SELECT, INSERT, UPDATE, and DELETE statements.");

            if (ownsTransaction) _transaction = _connection.BeginTransaction();
            statementId = $"FBSDB_{Guid.NewGuid():N}"[..26];
            await using (var explain = _connection.CreateCommand())
            {
                explain.Transaction = _transaction;
                explain.CommandText = $"EXPLAIN PLAN SET STATEMENT_ID = '{statementId}' FOR {statement}";
                explain.CommandTimeout = 0;
                _activeCommand = explain;
                await explain.ExecuteNonQueryAsync(operationToken);
                _activeCommand = null;
            }

            var columns = new List<SqlColumn>();
            var rows = new List<object?[]>();
            await using (var plan = _connection.CreateCommand())
            {
                plan.Transaction = _transaction;
                plan.BindByName = true;
                plan.CommandText = "SELECT ID, PARENT_ID, LPAD(' ', 2 * (LEVEL - 1)) || OPERATION AS OPERATION, OPTIONS, OBJECT_NAME, COST, CARDINALITY, BYTES FROM PLAN_TABLE WHERE STATEMENT_ID = :statementId START WITH ID = 0 AND STATEMENT_ID = :rootId CONNECT BY PRIOR ID = PARENT_ID AND PRIOR STATEMENT_ID = STATEMENT_ID ORDER SIBLINGS BY POSITION";
                plan.Parameters.Add("statementId", OracleDbType.Varchar2, statementId, System.Data.ParameterDirection.Input);
                plan.Parameters.Add("rootId", OracleDbType.Varchar2, statementId, System.Data.ParameterDirection.Input);
                _activeCommand = plan;
                await using var reader = await plan.ExecuteReaderAsync(operationToken);
                columns.AddRange(Enumerable.Range(0, reader.FieldCount).Select(i => new SqlColumn(reader.GetName(i), reader.GetDataTypeName(i))));
                while (await reader.ReadAsync(operationToken))
                {
                    var row = new object?[reader.FieldCount];
                    for (var i = 0; i < row.Length; i++) row[i] = reader.IsDBNull(i) ? null : ToWireValue(reader.GetValue(i));
                    rows.Add(row);
                }
                _activeCommand = null;
            }
            timer.Stop();
            return new SqlExecutionResult(columns, rows, null, timer.ElapsedMilliseconds, rows.Count, false, !ownsTransaction && _transaction is not null, []);
        }
        catch (Exception ex) when (operationCancellation?.IsCancellationRequested == true && ex is not OperationCanceledException)
        {
            throw new OperationCanceledException("Execution plan request cancelled.", ex, operationToken);
        }
        finally
        {
            _activeCommand = null;
            if (ownsTransaction && _transaction is not null)
            {
                try { await _transaction.RollbackAsync(CancellationToken.None); }
                finally { await _transaction.DisposeAsync(); _transaction = null; _analysisReadOnly = false; }
            }
            else if (statementId is not null && _connection?.State == System.Data.ConnectionState.Open)
            {
                try
                {
                    await using var cleanup = _connection.CreateCommand();
                    cleanup.Transaction = _transaction;
                    cleanup.BindByName = true;
                    cleanup.CommandText = "DELETE FROM PLAN_TABLE WHERE STATEMENT_ID = :statementId";
                    cleanup.Parameters.Add("statementId", OracleDbType.Varchar2, statementId, System.Data.ParameterDirection.Input);
                    await cleanup.ExecuteNonQueryAsync(CancellationToken.None);
                }
                catch (OracleException) { }
            }
            if (operationCancellation is not null)
            {
                Interlocked.CompareExchange(ref _activeCancellation, null, operationCancellation);
                operationCancellation.Dispose();
            }
            Touch(); _gate.Release();
        }
    }

    private async Task<IReadOnlyList<string>> ReadDbmsOutputAsync(CancellationToken cancellationToken)
    {
        if (_connection?.State != System.Data.ConnectionState.Open) return [];
        var lines = new List<string>();
        await using var command = _connection.CreateCommand();
        if (_transaction is not null) command.Transaction = _transaction;
        command.BindByName = true;
        command.CommandText = "BEGIN DBMS_OUTPUT.GET_LINE(:line, :status); END;";
        var line = command.Parameters.Add("line", OracleDbType.Varchar2, 32767);
        line.Direction = System.Data.ParameterDirection.Output;
        var status = command.Parameters.Add("status", OracleDbType.Int32);
        status.Direction = System.Data.ParameterDirection.Output;
        while (lines.Count < 10000)
        {
            await command.ExecuteNonQueryAsync(cancellationToken);
            if (!int.TryParse(status.Value?.ToString(), NumberStyles.Integer, CultureInfo.InvariantCulture, out var statusCode) || statusCode != 0) break;
            lines.Add(Convert.ToString(line.Value, CultureInfo.InvariantCulture) ?? string.Empty);
        }
        return lines;
    }

    public async Task CommitAsync(CancellationToken cancellationToken = default)
    {
        await _gate.WaitAsync(cancellationToken);
        try
        {
            if (_transaction is null) return;
            await _transaction.CommitAsync(cancellationToken);
            await _transaction.DisposeAsync();
            _transaction = null; _analysisReadOnly = false;
        }
        finally { Touch(); _gate.Release(); }
    }

    public async Task RollbackAsync(CancellationToken cancellationToken = default)
    {
        await _gate.WaitAsync(cancellationToken);
        try
        {
            if (_transaction is null) return;
            await _transaction.RollbackAsync(cancellationToken);
            await _transaction.DisposeAsync();
            _transaction = null; _analysisReadOnly = false;
        }
        finally { Touch(); _gate.Release(); }
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

    public async Task DisconnectAsync(bool rollbackPending, CancellationToken cancellationToken = default)
    {
        await _gate.WaitAsync(cancellationToken);
        try
        {
            if (_transaction is not null)
            {
                if (!rollbackPending) throw new InvalidOperationException("There is an uncommitted transaction.");
                await _transaction.RollbackAsync(cancellationToken);
                await _transaction.DisposeAsync();
                _transaction = null; _analysisReadOnly = false;
            }
            await CloseConnectionAsync();
        }
        finally { Touch(); _gate.Release(); }
    }

    private async Task CloseConnectionAsync()
    {
        await CloseAllPagedResultsAsync();
        if (_connection is not null)
        {
            await _connection.DisposeAsync();
            _connection = null;
        }
        IsInactive = false; _profileId = null; _initialNls=null;_configuredNls=new Dictionary<string,string>(); _executedSqlIds.Clear(); _analysisReadOnly = false;
    }

    private static bool IsDml(string sql) => FirstKeyword(sql) is "INSERT" or "UPDATE" or "DELETE" or "MERGE";
    private static bool IsDdl(string sql) => FirstKeyword(sql) is "CREATE" or "ALTER" or "DROP" or "TRUNCATE" or "RENAME" or "GRANT" or "REVOKE";
    private static string FirstKeyword(string sql) => Regex.Match(Regex.Replace(sql, @"(?s)/\*.*?\*/|--[^\r\n]*", " ").TrimStart(), @"^[A-Za-z]+").Value.ToUpperInvariant();
    private static object? ToWireValue(object value) => value switch
    {
        decimal number => number.ToString(CultureInfo.InvariantCulture),
        long number when number>9007199254740991L||number< -9007199254740991L => number.ToString(CultureInfo.InvariantCulture),
        DateTime date => date.ToString("O"),
        DateTimeOffset date => date.ToString("O"),
        byte[] bytes => new { kind="binary", base64=Convert.ToBase64String(bytes), byteLength=bytes.Length },
        _ => ToProviderValue(value),
    };

    private static object? ParseParameterValue(OracleDbType dbType, string? value)
    {
        if (value is null) return DBNull.Value;
        return dbType switch
        {
            OracleDbType.Decimal => Oracle.ManagedDataAccess.Types.OracleDecimal.Parse(value),
            OracleDbType.Double or OracleDbType.Int16 or OracleDbType.Int32 or OracleDbType.Int64 or OracleDbType.Single => decimal.TryParse(value, NumberStyles.Number, CultureInfo.InvariantCulture, out var number) ? number : throw new InvalidOperationException($"'{value}' is not a valid number."),
            OracleDbType.Date => OracleTemporalCell.DateBind(value),
            OracleDbType.TimeStamp => OracleTemporalCell.TimestampBind(value),
            _ => value,
        };
    }

    private static object? ToProviderValue(object value)
    {
        if (!value.GetType().FullName?.StartsWith("Oracle.ManagedDataAccess.Types.Oracle", StringComparison.Ordinal) ?? true) return value;
        try
        {
            if (value.GetType().Name.Contains("Clob", StringComparison.Ordinal)) return Limit(value.GetType().GetProperty("Value")?.GetValue(value)?.ToString());
            if (value.GetType().Name.Contains("Blob", StringComparison.Ordinal)) return ToWireValue((byte[])(value.GetType().GetProperty("Value")?.GetValue(value) ?? Array.Empty<byte>()));
            if (value.GetType().Name.Contains("Decimal", StringComparison.Ordinal)) return value.GetType().GetProperty("Value")?.GetValue(value)?.ToString();
            if (value.GetType().Name.Contains("Timestamp", StringComparison.Ordinal)) return value.ToString();
            if (value.GetType().Name.Contains("String", StringComparison.Ordinal)) return Limit(value.GetType().GetProperty("Value")?.GetValue(value)?.ToString());
        }
        catch (Exception ex) when (ex is System.Reflection.TargetInvocationException or InvalidCastException) { return value.ToString(); }
        return value.ToString();
    }

    private static string? Limit(string? text) => text is { Length: > 1_000_000 } ? text[..1_000_000] : text;

    private string CredentialFile(string profileId) => Path.Combine(_credentialDirectory, Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(profileId.ToUpperInvariant()))) + ".bin");
    public async Task SaveCredentialsAsync(string profileId, string user, string password)
    {
        Directory.CreateDirectory(_credentialDirectory);
        var bytes = ProtectedData.Protect(Encoding.UTF8.GetBytes($"{user}\n{password}"), null, DataProtectionScope.CurrentUser);
        await File.WriteAllBytesAsync(CredentialFile(profileId), bytes);
    }
    public Task DeleteCredentialsAsync(string profileId)
    {
        var file = CredentialFile(profileId);
        if (File.Exists(file)) File.Delete(file);
        return Task.CompletedTask;
    }
    public async Task<(string User, string Password)?> GetSavedCredentialsAsync(string profileId)
    {
        var file = CredentialFile(profileId);
        if (!File.Exists(file)) return null;
        try
        {
            var plaintext = Encoding.UTF8.GetString(ProtectedData.Unprotect(await File.ReadAllBytesAsync(file), null, DataProtectionScope.CurrentUser));
            var separator = plaintext.IndexOf('\n');
            return separator < 0 ? null : (plaintext[..separator], plaintext[(separator + 1)..]);
        }
        catch (CryptographicException) { return null; }
    }

    public void Dispose()
    {
        foreach (var cursor in _parkedResults.Values) { cursor.Reader.Dispose(); cursor.Command.Dispose(); }
        _parkedResults.Clear();
        _pageReader?.Dispose();
        _pageCommand?.Dispose();
        _transaction?.Dispose();
        _connection?.Dispose();
        _gate.Dispose();
    }
}

public sealed record SqlColumn(string Name, string Type)
{
    public string? TemporalKind {get;init;}
    public string? SessionTimeZone {get;init;}
    public int? Size { get; init; }
    public int? Precision { get; init; }
    public int? Scale { get; init; }
    public bool? Nullable { get; init; }
    public string? SourceSchema { get; init; }
    public string? SourceTable { get; init; }
    public string? SourceColumn { get; init; }
}
public sealed record SqlExecutionResult(IReadOnlyList<SqlColumn> Columns, IReadOnlyList<object?[]> Rows, int? RowsAffected, long ElapsedMs, int ReturnedRows, bool Truncated, bool TransactionPending, IReadOnlyList<string> Output)
{
    public string? SqlId { get; init; }
    public string? ResultId { get; init; }
    public bool HasMore { get; init; }
    public int PageSize { get; init; } = 1000;
    public int Offset { get; init; }
}
public sealed record SchemaColumn(string Name, string Type, bool Nullable, bool Indexed)
{
    public int? Length { get; init; }
    public int? CharacterLength { get; init; }
    public string? LengthUnit { get; init; }
    public int? Precision { get; init; }
    public int? Scale { get; init; }
    public string? DefaultValue { get; init; }
    public string? Comment { get; init; }
}
public sealed record SchemaProperty(string Name, string Value);
public sealed record SchemaObject(string Name, string Type, IReadOnlyList<SchemaColumn> Columns)
{
    public string Owner { get; init; } = string.Empty;
    public string Key => $"{Owner}.{Type}.{Name}";
    public string? TargetOwner { get; init; }
    public string? TargetName { get; init; }
    public string? DbLink { get; init; }
    public IReadOnlyList<SchemaProperty> Details { get; init; } = [];
}
public sealed record SchemaSnapshot(string Owner, IReadOnlyList<SchemaObject> Objects);
public sealed record SqlBindParameter(string Name, string Type, string? Value);

public sealed record LookupColumn(string Name,string Type);
public sealed record PrimaryKeyInfo(string Schema,string Table,IReadOnlyList<LookupColumn> Columns);
public sealed record RelatedRecordLink(string Label,string Sql);

public sealed record ColumnConstraint(string Name,string Type,string? Condition,string Status);
public sealed record ColumnDefinition(string Schema,string Table,string Name,string Type,int? Size,int? Precision,int? Scale,bool Nullable,string? DefaultValue,IReadOnlyList<ColumnConstraint> Constraints);
