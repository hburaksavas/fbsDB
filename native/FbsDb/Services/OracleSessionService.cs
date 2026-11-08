using System.Diagnostics;
using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using Oracle.ManagedDataAccess.Client;

namespace FbsDb.Services;

public sealed record EditPrivileges(bool Update, bool Insert, bool Delete, string[] UpdateColumns, string[] InsertColumns);

// The connection failed during the automatic Commit after a statement: Oracle may or may not have saved it.
public sealed class OracleCommitOutcomeUnknownException(Exception inner)
    : Exception("The connection failed while committing this statement. Oracle may or may not have saved it: " + inner.Message, inner);

public sealed partial class OracleSessionService : IDisposable
{
    private readonly string _credentialDirectory;
    private readonly MetadataOperations _metadata;
    public OracleSessionService(string? credentialDirectory = null)
    {
        _credentialDirectory = credentialDirectory ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "fbsDB", "credentials");
        _metadata = new MetadataOperations(this);
    }
    private OracleConnection? _connection;
    private OracleTransaction? _transaction;
    private string? _profileId;
    private readonly SemaphoreSlim _gate = new(1, 1);
    private readonly OracleResultCursors _results = new();
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

    public Task<(string? Version, string[] Words, string? Error)> LoadCompletionVocabularyAsync(CancellationToken cancellationToken = default) => _metadata.LoadCompletionVocabularyAsync(cancellationToken);

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

    public async Task<SqlExecutionResult> ExecuteAsync(string sql, IReadOnlyList<SqlBindParameter>? parameters = null, int rowLimit = 1000, CancellationToken cancellationToken = default, int timeoutSeconds = 0, IProgress<string>? progress = null, string? sourceReviewId = null, bool deferLobs = false)
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
            _results.ParkPagedResult();
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
            if (IsDdl(statement) && _transaction is not null)
                throw new InvalidOperationException("Commit or roll back pending changes before running DDL. DDL commits automatically and cannot be rolled back.");
            if (sourceReviewId is not null) await ValidateSourceReviewUnderGateAsync(sql, sourceReviewId, operationToken);
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
                oracleParameter.Direction = parameter.Direction switch
                {
                    "IN" => System.Data.ParameterDirection.Input,
                    "OUT" => System.Data.ParameterDirection.Output,
                    "IN OUT" => System.Data.ParameterDirection.InputOutput,
                    _ => throw new InvalidOperationException("Unsupported bind direction.")
                };
                if (oracleParameter.Direction != System.Data.ParameterDirection.Input && dbType is not (OracleDbType.Decimal or OracleDbType.Varchar2 or OracleDbType.NVarchar2 or OracleDbType.Date or OracleDbType.TimeStamp))
                    throw new InvalidOperationException("Output binds currently support NUMBER, VARCHAR2, NVARCHAR2, DATE and TIMESTAMP.");
                if (oracleParameter.Direction != System.Data.ParameterDirection.Input && dbType is OracleDbType.Varchar2 or OracleDbType.NVarchar2) oracleParameter.Size = 32767;
                oracleParameter.Value = oracleParameter.Direction == System.Data.ParameterDirection.Output ? DBNull.Value : ParseParameterValue(dbType, parameter.Value);
            }
            if (beginsTransaction) _transaction = _connection.BeginTransaction();
            if (_transaction is not null) command.Transaction = _transaction;
            _activeCommand = command;

            var firstKeyword = FirstKeyword(statement);
            if (firstKeyword is "SELECT" or "WITH")
            {
                progress?.Report("Waiting for first rows");
                await _results.OpenAsync(command, _connection, _transaction, operationToken);
                var querySqlId = command.SqlId;
                progress?.Report("Fetching first page");
                var page = await _results.ReadPageAsync(Math.Clamp(rowLimit, 1, 10000), HasPendingTransaction, operationToken, deferLobs);
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
                try { await _transaction.CommitAsync(operationToken); }
                catch (Exception ex) when (!IsConnected) { throw new OracleCommitOutcomeUnknownException(ex); }
                await _transaction.DisposeAsync();
                _transaction = null;
                transactionPending = false;
            }
            timer.Stop();
            if (command.SqlId is { Length: > 0 } sqlId) _executedSqlIds.Add(sqlId);
            var outParameters = command.Parameters.Cast<OracleParameter>().Where(parameter => parameter.Direction != System.Data.ParameterDirection.Input)
                .Select(parameter => new SqlOutputParameter(parameter.ParameterName, parameter.OracleDbType switch { OracleDbType.Decimal => "NUMBER", OracleDbType.Varchar2 => "VARCHAR2", OracleDbType.NVarchar2 => "NVARCHAR2", OracleDbType.Date => "DATE", OracleDbType.TimeStamp => "TIMESTAMP", _ => parameter.OracleDbType.ToString() }, OutputParameterValue(parameter.Value))).ToArray();
            return new SqlExecutionResult([], [], affected, timer.ElapsedMilliseconds, 0, false, transactionPending, outputLines) { SqlId = command.SqlId, OutParameters = outParameters };
        }
        catch (Exception ex) when (ex is not OracleCommitOutcomeUnknownException && Volatile.Read(ref timeoutElapsed) == 1 && !cancellationToken.IsCancellationRequested)
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
        catch (Exception ex) when (operationCancellation?.IsCancellationRequested == true && ex is not OperationCanceledException and not OracleCommitOutcomeUnknownException)
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
            if (command is not null && !ReferenceEquals(command, _results.Command)) await command.DisposeAsync();
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

    public Task<ColumnDefinition?> GetColumnDefinitionAsync(string owner,string table,string column) => _metadata.GetColumnDefinitionAsync(owner, table, column);

    public Task<string> UpdateDraftAsync(string owner,string table,IReadOnlyList<SqlColumn> columns,IReadOnlyList<object?[]> rows) => _metadata.UpdateDraftAsync(owner, table, columns, rows);

    public static string NormalizeIdentifier(string value)=>value.StartsWith('"')&&value.EndsWith('"')?value[1..^1].Replace("\"\"","\""):value.ToUpperInvariant();
    public static string BuildPrimaryKeySql(string schema,string table,IReadOnlyList<LookupColumn> columns,IReadOnlyDictionary<string,string> values) => MetadataOperations.BuildPrimaryKeySql(schema, table, columns, values);

    public Task<PrimaryKeyInfo> GetPrimaryKeyAsync(string schema,string table) => _metadata.GetPrimaryKeyAsync(schema, table);
    public Task<EditPrivileges?> GetEditPrivilegesAsync(string owner,string table) => _metadata.GetEditPrivilegesAsync(owner, table);
    public Task<TableRelations> GetRelationsAsync(string owner,string table) => _metadata.GetRelationsAsync(owner, table);
    public Task<ConstraintInfo?> GetConstraintInfoAsync(string owner,string name) => _metadata.GetConstraintInfoAsync(owner, name);

    public Task<IReadOnlyList<RelatedRecordLink>> ChildRecordsSqlAsync(string owner,string table,IReadOnlyDictionary<string,object?> values) => _metadata.ChildRecordsSqlAsync(owner, table, values);

    public Task<string?> RelatedRecordsSqlAsync(string owner, string table, string column, object? value, IReadOnlyDictionary<string, object?>? rowValues = null) => _metadata.RelatedRecordsSqlAsync(owner, table, column, value, rowValues);

    private Task CloseAllPagedResultsAsync() => _results.CloseAllPagedResultsAsync();
    private Task ClosePagedResultAsync() => _results.ClosePagedResultAsync();
    public async Task CloseResultAsync(string resultId)
    {
        await _gate.WaitAsync();
        try { await _results.CloseAsync(resultId); }
        finally { Touch(); _gate.Release(); }
    }
    // Reads part of a large value that a deferred result sent as a preview. count is characters for CLOB/NCLOB and bytes for BLOB.
    public async Task<LobChunk> ReadLobAsync(string lobId, long offset, int count, CancellationToken token = default)
    {
        await _gate.WaitAsync(token);
        try { return _results.ReadLob(lobId, offset, count); }
        finally { Touch(); _gate.Release(); }
    }
    public async Task<LobChunk> ReadWholeLobAsync(string lobId, CancellationToken token = default)
    {
        await _gate.WaitAsync(token);
        try { return _results.ReadWholeLob(lobId); }
        finally { Touch(); _gate.Release(); }
    }
    public async Task<SqlExecutionResult> FetchNextPageAsync(string resultId, int pageSize, CancellationToken token = default, bool deferLobs = false)
    {
        await _gate.WaitAsync(token);
        using var cancellation = CancellationTokenSource.CreateLinkedTokenSource(token);
        var timer = Stopwatch.StartNew();
        try
        {
            _results.Activate(resultId);
            Volatile.Write(ref _activeCancellation, cancellation);
            _activeCommand = _results.Command;
            try { return (await _results.ReadPageAsync(Math.Clamp(pageSize, 1, 10000), HasPendingTransaction, cancellation.Token, deferLobs)) with { ElapsedMs = timer.ElapsedMilliseconds }; }
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

    // Without an open transaction the provider commits after each statement, which also erases any savepoint. A batch that needs one starts its transaction first.
    public async Task EnsureTransactionAsync()
    {
        await _gate.WaitAsync();
        try
        {
            if (_connection?.State != System.Data.ConnectionState.Open) throw new InvalidOperationException("No Oracle connection is active.");
            _transaction ??= _connection.BeginTransaction();
        }
        finally { Touch(); _gate.Release(); }
    }

    public async Task CommitAsync(CancellationToken cancellationToken = default)
    {
        await _gate.WaitAsync(cancellationToken);
        try
        {
            if (_transaction is null)
            {
                // A Commit sent after the connection was lost must not be answered as a successful commit.
                if (_connection is not null && !IsConnected) throw new InvalidOperationException("No Oracle connection is active.");
                return;
            }
            try { await _transaction.CommitAsync(cancellationToken); }
            catch when (!IsConnected) { await ForgetLostTransactionAsync(); throw; }
            await _transaction.DisposeAsync();
            _transaction = null; _analysisReadOnly = false;
        }
        finally { Touch(); _gate.Release(); }
    }

    // A transaction cannot outlive its connection: Oracle has already finished it one way or the other. Keeping it would refuse every
    // reconnect, disconnect and tab close with "uncommitted transaction", and Commit or Rollback could never clear it.
    private async Task ForgetLostTransactionAsync()
    {
        if (_transaction is not null) await _transaction.DisposeAsync();
        _transaction = null; _analysisReadOnly = false;
    }

    public async Task RollbackAsync(CancellationToken cancellationToken = default)
    {
        await _gate.WaitAsync(cancellationToken);
        try
        {
            if (_transaction is null) return;
            try { await _transaction.RollbackAsync(cancellationToken); }
            catch when (!IsConnected) { await ForgetLostTransactionAsync(); throw; }
            await _transaction.DisposeAsync();
            _transaction = null; _analysisReadOnly = false;
        }
        finally { Touch(); _gate.Release(); }
    }

    public Task<SchemaSnapshot> LoadSchemaAsync(CancellationToken cancellationToken = default) => _metadata.LoadSchemaAsync(cancellationToken);

    public Task<SchemaObject> LoadTableDetailsAsync(string tableName, string? owner = null, string? type = null, CancellationToken cancellationToken = default) => _metadata.LoadTableDetailsAsync(tableName, owner, type, cancellationToken);

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
    private static bool IsDdl(string sql) => FirstKeyword(sql) is "CREATE" or "ALTER" or "DROP" or "TRUNCATE" or "RENAME" or "GRANT" or "REVOKE" or "COMMENT" or "AUDIT" or "NOAUDIT";
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
            OracleDbType.TimeStampTZ => OracleTemporalCell.ZonedBind(value),
            _ => value,
        };
    }

    private static object? OutputParameterValue(object? value) => value switch
    {
        null or DBNull => null,
        Oracle.ManagedDataAccess.Types.OracleDecimal number => number.IsNull ? null : number.ToString().Replace(CultureInfo.CurrentCulture.NumberFormat.NumberDecimalSeparator, "."),
        Oracle.ManagedDataAccess.Types.OracleString text => text.IsNull ? null : text.Value,
        Oracle.ManagedDataAccess.Types.OracleDate date => date.IsNull ? null : OracleTemporalCell.From(date),
        Oracle.ManagedDataAccess.Types.OracleTimeStamp stamp => stamp.IsNull ? null : OracleTemporalCell.From(stamp),
        _ => ToWireValue(value)
    };

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
        _results.Dispose();
        _transaction?.Dispose();
        _connection?.Dispose();
        _gate.Dispose();
    }
}
