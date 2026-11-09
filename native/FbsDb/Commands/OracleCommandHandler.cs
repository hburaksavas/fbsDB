using System.Collections.Concurrent;
using System.Diagnostics;
using System.Text;
using System.Text.Json;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.Web.WebView2.Core;
using Windows.Storage;
using Windows.Storage.Pickers;
using WinRT.Interop;
using FbsDb.Services;

namespace FbsDb;

public sealed partial class MainPage
{
    private sealed class OracleCommandHandler(MainPage host, NativeCommandContext context) : NativeCommandHandler(host, context)
    {
        public override async Task HandleAsync()
        {
            var sender = Context.Sender;
            var id = Context.RequestId;
            var tabId = Context.Tab.Id;
            var command = Context.Command;
            var payload = Context.Payload;
            switch (command)
            {
                case "script.sourceReviewed":
                    var accepted = Host._scriptSourceReviews.Approve(tabId,payload.GetProperty("scriptRequestId").GetString()!,payload.GetProperty("index").GetInt32(),payload.GetProperty("reviewNonce").GetString()!,payload.GetProperty("reviewId").GetString()!);
                    Send(sender,new {type="script.reviewAccepted",requestId=id,accepted});
                    break;
                case "source.review":
                    try
                    {
                        var sourceReview = await Task.Run(() => _oracle.ReviewSourceAsync(payload.GetProperty("sql").GetString()!));
                        Send(sender, new { type = "source.review", requestId = id, review = sourceReview });
                    }
                    catch (Exception error) { Send(sender, new { type = "source.review.error", requestId = id, message = error.Message, connected = _oracle.IsConnected }); }
                    break;
                case "tab.close":
                    try { await _sessions.CloseAsync(tabId); Send(sender, new { type = "tab.closed", requestId = id }); }
                    catch (Exception ex) { Send(sender, new { type = "tab.closeFailed", requestId = id, message = ex.Message, transactionPending = _oracle.HasPendingTransaction }); }
                    break;
                case "connection.list":
                    await SendProfilesAsync(sender, id);
                    break;
                case "connection.organization":
                    try { var organization = await Task.Run(() => _profiles.ChangeOrganizationAsync(payload)); await SendProfilesAsync(sender); Send(sender, new { type = "connection.organization", requestId = id, success = true, organization }); }
                    catch (Exception error) { Send(sender, new { type = "connection.organization", requestId = id, success = false, message = error.Message }); }
                    break;
                case "connection.setGroup":
                    var profileId = payload.TryGetProperty("profileId", out var profileIdValue) ? profileIdValue.GetString() : null;
                    var group = payload.TryGetProperty("group", out var groupValue) && groupValue.ValueKind == JsonValueKind.String ? groupValue.GetString() : null;
                    await _profiles.SetConnectionGroupAsync(profileId ?? string.Empty, group);
                    await SendProfilesAsync(sender);
                    Send(sender, new { type = "connection.groupSaved", requestId = id, profileId, group });
                    break;
                case "tns.add":
                    await AddTnsFileAsync(sender);
                    break;
                case "connection.save":
                case "connection.delete":
                case "connection.rename":
                case "connection.test":
                    await ManageConnectionAsync(sender, id, command, payload);
                    break;
                case "connection.connect":
                    await ConnectAsync(sender, id, payload);
                    break;
                case "debug.objects": case "debug.compile": case "debug.start": case "debug.continue": case "debug.values": case "debug.source": case "debug.stop":
                    await Host.HandleDebugCommandAsync(Context);
                    break;
                case "ssh.trustHost":
                {
                    var host = payload.GetProperty("host").GetString() ?? "";
                    var port = payload.GetProperty("port").GetInt32();
                    var fingerprint = payload.GetProperty("fingerprint").GetString() ?? "";
                    try { await SshTunnelRegistry.Shared.TrustHostAsync(host, port, fingerprint); Send(sender, new { type = "ssh.hostTrusted", requestId = id, host, port, success = true }); }
                    catch (Exception error) when (error is InvalidOperationException or IOException or UnauthorizedAccessException) { Send(sender, new { type = "ssh.hostTrusted", requestId = id, host, port, success = false, message = error.Message }); }
                    break;
                }
                case "connection.disconnect":
                    if (_oracle.HasPendingTransaction) throw new InvalidOperationException("Commit or roll back before disconnecting.");
                    await _oracle.DisconnectAsync(rollbackPending: false);
                    Send(sender, new { type = "connection.disconnected", requestId = id });
                    break;
                case "result.export":
                    await ExportResultAsync(sender, id, payload);
                    break;
                case "result.cancelExport":
                    if (_resultExports.TryGetValue(tabId, out var exportCancellation)) exportCancellation.Cancel();
                    break;
                case "result.openUrl":
                    if(Uri.TryCreate(payload.GetProperty("url").GetString(),UriKind.Absolute,out var url)&&url.Scheme is "http" or "https" or "mailto")await Windows.System.Launcher.LaunchUriAsync(url);
                    break;
                case "result.columnDefinition": {
                    var column=payload.GetProperty("column");var definition=await Task.Run(()=>_oracle.GetColumnDefinitionAsync(column.GetProperty("sourceSchema").GetString()??"",column.GetProperty("sourceTable").GetString()??"",column.GetProperty("sourceColumn").GetString()??column.GetProperty("name").GetString()!));Send(sender,new{type="result.columnDefinition",requestId=id,definition});break;
                }
                case "result.updateDraft": {
                    var columns=JsonSerializer.Deserialize<SqlColumn[]>(payload.GetProperty("columns").GetRawText(),WebJsonOptions)??[];
                    var rows=payload.GetProperty("rows").EnumerateArray().Select(row=>row.EnumerateArray().Select(ReadWireValue).ToArray()).ToArray();
                    var updateSource=columns.FirstOrDefault(c=>!string.IsNullOrEmpty(c.SourceTable))??throw new InvalidOperationException("Result source metadata is unavailable.");
                    var sql=await Task.Run(()=>_oracle.UpdateDraftAsync(updateSource.SourceSchema??"",updateSource.SourceTable!,columns,rows));Send(sender,new{type="result.related",requestId=id,sql});break;
                }
                case "result.primaryKey": {
                    var metadata=await Task.Run(()=>_oracle.GetPrimaryKeyAsync(payload.GetProperty("schema").GetString()??"",payload.GetProperty("table").GetString()??""));
                    Send(sender,new{type="result.primaryKey",requestId=id,metadata.Schema,metadata.Table,metadata.Columns,message="No primary key found."});break;
                }
                case "result.relations": {
                    var relationOwner = payload.GetProperty("schema").GetString() ?? "";
                    var relationTable = payload.GetProperty("table").GetString() ?? "";
                    try
                    {
                        var relations = await Task.Run(() => _oracle.GetRelationsAsync(relationOwner, relationTable));
                        Send(sender, new { type = "result.relations", requestId = id, tabId, schema = relationOwner, table = relationTable, children = relations.Children, parents = relations.Parents });
                    }
                    catch (Exception ex) { Send(sender, new { type = "result.relations", requestId = id, tabId, schema = relationOwner, table = relationTable, children = Array.Empty<object>(), parents = Array.Empty<object>(), error = ex.Message }); }
                    break;
                }
                case "result.constraintInfo": {
                    var constraintOwner = payload.GetProperty("owner").GetString() ?? "";
                    var constraintName = payload.GetProperty("name").GetString() ?? "";
                    try
                    {
                        var info = await Task.Run(() => _oracle.GetConstraintInfoAsync(constraintOwner, constraintName));
                        Send(sender, new { type = "result.constraintInfo", requestId = id, tabId, owner = constraintOwner, name = constraintName, found = info is not null, constraintType = info?.Type, condition = info?.Condition, columns = info?.Columns ?? [], referenced = info?.ReferencedConstraint });
                    }
                    catch (Exception ex) { Send(sender, new { type = "result.constraintInfo", requestId = id, tabId, owner = constraintOwner, name = constraintName, found = false, error = ex.Message }); }
                    break;
                }
                case "result.editIdentity": {
                    // Primary key columns of the single source table; editing needs a reliable row identity and never guesses one.
                    try
                    {
                        var identity = await Task.Run(() => _oracle.GetPrimaryKeyAsync("\"" + (payload.GetProperty("schema").GetString() ?? "").Replace("\"", "\"\"") + "\"", "\"" + (payload.GetProperty("table").GetString() ?? "").Replace("\"", "\"\"") + "\""));
                        // Unknown privileges claim nothing: a wrong lock is worse than Oracle refusing a statement.
                        EditPrivileges? privileges = null;
                        try { privileges = await Task.Run(() => _oracle.GetEditPrivilegesAsync(payload.GetProperty("schema").GetString() ?? "", payload.GetProperty("table").GetString() ?? "")); }
                        catch (Exception error) when (error is Oracle.ManagedDataAccess.Client.OracleException or InvalidOperationException) { Debug.WriteLine("Edit privileges: " + error.Message); }
                        Send(sender, new { type = "result.editIdentity", requestId = id, tabId, schema = payload.GetProperty("schema").GetString(), table = payload.GetProperty("table").GetString(), columns = identity.Columns.Select(column => column.Name).ToArray(), privileges });
                    }
                    catch (Exception ex) { Send(sender, new { type = "result.editIdentity", requestId = id, tabId, schema = payload.GetProperty("schema").GetString(), table = payload.GetProperty("table").GetString(), columns = Array.Empty<string>(), error = ex.Message }); }
                    break;
                }
                case "result.lookupSql": {
                    var schema=payload.GetProperty("schema").GetString()??"";var table=payload.GetProperty("table").GetString()??"";
                    var metadata=await Task.Run(()=>_oracle.GetPrimaryKeyAsync("\""+schema.Replace("\"","\"\"")+"\"","\""+table.Replace("\"","\"\"")+"\""));
                    var values=payload.GetProperty("values").EnumerateObject().ToDictionary(p=>p.Name,p=>p.Value.GetString()??"");
                    Send(sender,new{type="result.related",requestId=id,sql=OracleSessionService.BuildPrimaryKeySql(metadata.Schema,metadata.Table,metadata.Columns,values)});break;
                }
                case "result.children": {
                    var column=payload.GetProperty("column");var values=payload.GetProperty("rowValues").EnumerateObject().ToDictionary(p=>p.Name,p=>ReadWireValue(p.Value));
                    var links=await Task.Run(()=>_oracle.ChildRecordsSqlAsync(column.GetProperty("sourceSchema").GetString()??"",column.GetProperty("sourceTable").GetString()??"",values));Send(sender,new{type="result.children",requestId=id,links,message="No child relationship with all required values was found."});break;
                }
                case "result.exportSql": {
                    var picker = new FileSavePicker { SuggestedStartLocation = PickerLocationId.DocumentsLibrary, SuggestedFileName = "merge-draft.sql" };
                    picker.FileTypeChoices.Add("SQL file", new List<string> { ".sql" });
                    InitializeWithWindow.Initialize(picker, OwnerWindowHandle);
                    var file = await picker.PickSaveFileAsync();
                    if (file is not null) await File.WriteAllTextAsync(file.Path, payload.GetProperty("sql").GetString() ?? "", new UTF8Encoding(false));
                    Send(sender, new { type = "result.sqlExported", requestId = id, cancelled = file is null });
                    break;
                }
                case "result.openSql":
                    Send(sender,new{type="result.related",requestId=id,sql=payload.GetProperty("sql").GetString()});break;
                case "result.related":
                    var relatedColumn = payload.GetProperty("column");
                    var relatedValue = payload.GetProperty("value");
                    object? value = ReadWireValue(relatedValue);
                    var relatedRow = payload.TryGetProperty("rowValues", out var rowValues) ? rowValues.EnumerateObject().ToDictionary(p => p.Name, p => ReadWireValue(p.Value)) : null;
                    var relatedSql = await Task.Run(() => _oracle.RelatedRecordsSqlAsync(relatedColumn.GetProperty("sourceSchema").GetString() ?? "", relatedColumn.GetProperty("sourceTable").GetString() ?? "", relatedColumn.GetProperty("sourceColumn").GetString() ?? relatedColumn.GetProperty("name").GetString()!, value, relatedRow));
                    Send(sender, new { type = "result.related", requestId = id, sql = relatedSql, message = "No foreign key with all required non-NULL columns was found for this value." });
                    break;
                case "sql.closeResult":
                    await _oracle.CloseResultAsync(payload.GetProperty("resultId").GetString() ?? "");
                    break;
                case "sql.fetchNext":
                    await FetchSqlPageAsync(sender, id, payload);
                    break;
                case "sql.readLob":
                    await ReadLobAsync(sender, id, payload);
                    break;
                case "session.context":
                    try { var context = await Task.Run(() => _oracle.ReadSessionContextAsync()); Send(sender, new { type = "session.context", requestId = id, epoch = payload.GetProperty("epoch").GetInt32(), context }); }
                    catch (Exception error) { Send(sender, new { type = "session.context", requestId = id, epoch = payload.GetProperty("epoch").GetInt32(), error = error.Message }); }
                    break;
                case "session.nls":
                    try { var report=await Task.Run(()=>_oracle.ReadNlsAsync());Send(sender,new {type="session.nls",requestId=id,epoch=payload.TryGetProperty("epoch",out var epoch)?epoch.GetInt32():0,report}); }
                    catch(Exception error){Send(sender,new {type="session.nls",requestId=id,error=error.Message});}
                    break;
                case "connection.nls.save":
                case "connection.nls.test":
                    try {
                        var nlsProfileId=payload.GetProperty("profileId").GetString()!;
                        var profile=(await _profiles.GetProfilesAsync()).FirstOrDefault(item=>item.Id==nlsProfileId)??throw new InvalidOperationException("Connection profile no longer exists.");
                        var requested=payload.GetProperty("overrides").EnumerateObject().ToDictionary(item=>item.Name,item=>item.Value.GetString()??"");
                        var validated=OracleNlsSettings.Validate(requested);
                        if(command=="connection.nls.save"){await _profiles.SetNlsAsync(nlsProfileId,validated);await SendProfilesAsync(sender);Send(sender,new {type=command,requestId=id,profileId=nlsProfileId,success=true});}
                        else {using var cancellation=new CancellationTokenSource(TimeSpan.FromSeconds(45));var user=payload.TryGetProperty("user",out var username)?username.GetString()??"":"";var password=payload.TryGetProperty("password",out var secret)?secret.GetString()??"":"";var report=await Task.Run(()=>_credentials.TestNlsAsync(profile,validated,user,password,cancellation.Token));Send(sender,new {type=command,requestId=id,profileId=nlsProfileId,report});}
                    }catch(Exception error){Send(sender,new {type=command,requestId=id,error=error.Message});}
                    break;
                case "analysis.begin":
                    await Task.Run(() => _oracle.BeginReadOnlyAnalysisAsync());
                    Send(sender, new { type = "analysis.state", requestId = id, enabled = true, transactionPending = _oracle.HasPendingTransaction });
                    break;
                case "analysis.end":
                    if (_oracle.AnalysisReadOnly) await Task.Run(() => _oracle.RollbackAsync());
                    Send(sender, new { type = "analysis.state", requestId = id, enabled = _oracle.AnalysisReadOnly, transactionPending = _oracle.HasPendingTransaction });
                    break;
                case "sql.runtimePlan":
                    try { var sqlId = payload.GetProperty("sqlId").GetString() ?? ""; var lines = await Task.Run(() => _oracle.LoadRuntimePlanAsync(sqlId)); Send(sender, new { type = "sql.runtimePlan", requestId = id, sqlId, lines }); }
                    catch (Exception error) { Send(sender, new { type = "sql.runtimePlan", requestId = id, error = error.Message }); }
                    break;
                case "script.execute":
                    await ExecuteScriptAsync(sender, id, payload);
                    break;
                case "sql.execute":
                    await ExecuteSqlAsync(sender, id, payload);
                    break;
                case "sql.rollbackGridBatch":
                    // Returns the session to the start of the last grid Apply. Everything the session did after that point is undone too.
                    try
                    {
                        await Task.Run(() => _oracle.ExecuteAsync("ROLLBACK TO SAVEPOINT fbsdb_grid_batch", null, 1, default, timeoutSeconds: 30));
                        Send(sender, new { type = "sql.gridBatchRolledBack", requestId = id, tabId, ok = true, transactionPending = _oracle.HasPendingTransaction });
                    }
                    catch (Exception ex) { Send(sender, new { type = "sql.gridBatchRolledBack", requestId = id, tabId, ok = false, error = ex.Message, transactionPending = _oracle.HasPendingTransaction }); }
                    break;
                case "sql.stopApplyDml":
                    // Only stops sending new statements; the one already running finishes and is reported.
                    if (_gridApplies.TryGetValue(tabId, out var applying)) { try { applying.Cancel(); } catch (ObjectDisposedException) { } }
                    break;
                case "sql.applyDml":
                    await ApplyGridDmlAsync(sender, id, payload);
                    break;
                case "sql.evaluate":
                    await EvaluateExpressionAsync(sender, id, payload);
                    break;
                case "sql.explain":
                    await ExplainSqlAsync(sender, id, payload);
                    break;
                case "sql.cancel":
                    if (_scriptRuns.TryGetValue(tabId, out var runningScript)) { try { runningScript.Cancel(); } catch (ObjectDisposedException) { } }
                    var active = _oracle.CancelCurrentOperation();
                    Send(sender, new { type = "sql.cancelled", requestId = id, complete = !active, active, transactionPending = _oracle.HasPendingTransaction });
                    break;
                case "transaction.commit":
                    try
                    {
                        await Task.Run(() => _oracle.CommitAsync());
                        Send(sender, new { type = "transaction.state", state = "committed", pending = false, requestId = id });
                    }
                    catch (Exception ex) when (!_oracle.IsConnected)
                    {
                        // The connection failed during Commit: Oracle may or may not have committed, so neither success nor failure is claimed.
                        Send(sender, new { type = "transaction.state", state = "commit outcome unknown", pending = _oracle.HasPendingTransaction, unconfirmed = true, connected = false, message = ex.Message, requestId = id });
                    }
                    break;
                case "transaction.autoCommit":
                    await Task.Run(() => _oracle.SetAutoCommitAsync(payload.GetProperty("enabled").GetBoolean()));
                    Send(sender, new { type = "transaction.autoCommit", requestId = id, enabled = _oracle.AutoCommit });
                    break;
                case "transaction.rollback":
                    try
                    {
                        await Task.Run(() => _oracle.RollbackAsync());
                        Send(sender, new { type = "transaction.state", state = "rolled back", pending = false, requestId = id });
                    }
                    catch (Exception ex) when (!_oracle.IsConnected)
                    {
                        Send(sender, new { type = "host.error", requestId = id, message = ex.Message, transactionPending = _oracle.HasPendingTransaction, connected = false });
                    }
                    break;
                case "schema.refresh":
                    await SendSchemaAsync(sender, id);
                    break;
                case "schema.cancel":
                    if (payload.TryGetProperty("requestId", out var schemaRequestId) && _schemaRequests.TryGetValue($"{Context.Tab?.Id}:{schemaRequestId.GetString()}", out var schemaCancellation)) { try { schemaCancellation.Cancel(); } catch (ObjectDisposedException) { } }
                    break;
                case "completion.vocabulary":
                    await SendCompletionVocabularyAsync(sender, id);
                    break;
                case "completion.metadata":
                case "completion.definition":
                case "completion.systemObjects":
                case "completion.objectAnalysis":
                case "completion.objectDraftMetadata":
                case "completion.plscope":
                    await SendLanguageMetadataAsync(sender, id, command, payload);
                    break;
                case "completion.cancel":
                    var cancelledId = payload.GetProperty("requestId").GetString();
                    if (_completionRequests.TryGetValue($"{Context.Tab?.Id}:{cancelledId}", out var metadataCancellation)) { try { metadataCancellation.Cancel(); } catch (ObjectDisposedException) { } }
                    break;
                case "schema.tableDetails":
                    await SendTableDetailsAsync(sender, id, payload);
                    break;
                case "schema.objectDetails":
                    await SendTableDetailsAsync(sender, id, payload, objectDetails: true);
                    break;
                default: throw new InvalidOperationException($"Unsupported command: {command}");
            }
        }

        private async Task ManageConnectionAsync(CoreWebView2 sender, string? requestId, string command, JsonElement payload)
        {
            string Read(string key) => payload.TryGetProperty(key, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() ?? "" : "";
            ConnectionDiagnosticReport? diagnostics = null;
            try
            {
                var profileId = Read("profileId");
                var ssh = SshTunnelSettings.Parse(Read("sshHost"), Read("sshPort"), Read("sshUser"), Read("sshKeyFile"));
                if (command == "connection.rename") await _profiles.RenameProfileAsync(profileId, Read("name"));
                else if (command == "connection.delete")
                {
                    if (_sessions.Sessions.Any(tab => tab.Oracle.ProfileId == profileId)) throw new InvalidOperationException("Disconnect this profile in all tabs before deleting it.");
                    await _profiles.DeleteProfileAsync(profileId);
                    await _oracle.DeleteCredentialsAsync(profileId);
                }
                else if (command == "connection.save")
                {
                    if (_sessions.Sessions.Any(tab => tab.Oracle.ProfileId == profileId)) throw new InvalidOperationException("Disconnect this profile in all tabs before editing it.");
                    var old = (await _profiles.GetProfilesAsync()).FirstOrDefault(p => p.Id == profileId);
                    profileId = await _profiles.SaveProfileAsync(string.IsNullOrEmpty(profileId) ? null : profileId, Read("name"), Read("alias"), Read("source"), Read("user"), Read("environment"), Read("method") is { Length: > 0 } method ? method : "tns", Read("host"), Read("port"), Read("service"), Read("targetType"), Read("descriptor"), Read("folderId"), payload.TryGetProperty("groupIds", out var groupIds) ? groupIds.EnumerateArray().Select(g => g.GetString()!).ToArray() : null, ssh);
                    var updated = (await _profiles.GetProfilesAsync()).First(p => p.Id == profileId);
                    if (old is not null && (old.User != updated.User || old.Method != updated.Method || old.Source != updated.Source || old.Descriptor != updated.Descriptor)) await _oracle.DeleteCredentialsAsync(profileId);
                    if (!string.IsNullOrEmpty(Read("password")) && payload.TryGetProperty("remember", out var savePassword) && savePassword.ValueKind == JsonValueKind.True) await _oracle.SaveCredentialsAsync(profileId, Read("user"), Read("password"));
                }
                else
                {
                    ConnectionProfile? profile;
                    if (!string.IsNullOrEmpty(Read("method")) || !string.IsNullOrEmpty(Read("alias")))
                        profile = await _profiles.ResolveTargetAsync(Read("method") is { Length: > 0 } method ? method : "tns", Read("alias"), Read("source"), Read("host"), Read("port"), Read("service"), Read("targetType"), Read("descriptor"));
                    else profile = (await _profiles.GetProfilesAsync()).FirstOrDefault(p => p.Id == profileId);
                    if (profile is null) throw new InvalidOperationException("Choose an available connection profile.");
                    if (!string.IsNullOrEmpty(profileId)) profile = profile with { Id = profileId };
                    if (!string.IsNullOrEmpty(Read("method")) || !string.IsNullOrEmpty(Read("alias"))) profile = profile with { Ssh = profile.Method == "basic" ? ssh : null };
                    diagnostics = await Task.Run(() => _credentials.DiagnoseConnectionAsync(profile, Read("user"), Read("password")));
                }
                if (command != "connection.test") await SendProfilesAsync(sender);
                Send(sender, new { type = "connection.managed", requestId, operation = command, profileId, success = diagnostics?.Success ?? true, diagnostics, message = diagnostics?.Steps.LastOrDefault(step => step.Status == "Failed")?.Message });
            }
            catch (Exception ex) { Send(sender, new { type = "connection.managed", requestId, operation = command, success = false, message = ex.Message }); }
        }

        private async Task AddTnsFileAsync(CoreWebView2 sender)
        {
            var picker = new FileOpenPicker { SuggestedStartLocation = PickerLocationId.DocumentsLibrary };
            picker.FileTypeFilter.Add(".ora");
            InitializeWithWindow.Initialize(picker, OwnerWindowHandle);
            var file = await picker.PickSingleFileAsync();
            if (file is null) return;
            await _profiles.AddTnsFileAsync(file.Path);
            await SendProfilesAsync(sender);
        }

        private async Task ConnectAsync(CoreWebView2 sender, string? requestId, JsonElement payload)
        {
            var id = payload.TryGetProperty("profileId", out var aliasValue) ? aliasValue.GetString() : null;
            var profile = (await _profiles.GetProfilesAsync()).FirstOrDefault(p => string.Equals(p.Id, id, StringComparison.OrdinalIgnoreCase));
            if (profile is null) throw new InvalidOperationException($"Connection profile '{id}' was not found. Configure TNS_ADMIN or add a tnsnames.ora path in settings.");
            var user = payload.TryGetProperty("user", out var userValue) ? userValue.GetString() ?? profile.User : profile.User;
            var password = payload.TryGetProperty("password", out var passwordValue) ? passwordValue.GetString() ?? string.Empty : string.Empty;
            bool? remember = payload.TryGetProperty("remember", out var rememberValue) ? rememberValue.ValueKind == JsonValueKind.True : null;
            try { await Task.Run(() => _oracle.ConnectAsync(profile, user, password, remember)); }
            catch (SshHostKeyUnknownException unknown)
            {
                // The page asks the user to confirm the fingerprint; the error that follows ends this attempt.
                Send(sender, new { type = "connection.sshHostKey", requestId, profileId = profile.Id, host = unknown.Host, port = unknown.Port, keyType = unknown.KeyType, fingerprint = unknown.Fingerprint });
                throw;
            }
            await SendProfilesAsync(sender);
            if (_activeFilePath is not null) await _workspace.SetFileConnectionAsync(_activeFilePath, profile.Id);
            Send(sender, new { type = "connection.connected", requestId, serverVersion = _oracle.ServerVersion, tunnel = _oracle.TunnelVia is { } via ? new { via, localPort = _oracle.TunnelPort } : null, profile = new { id = profile.Id, nls = profile.Nls, host = profile.Host, port = profile.Port, service = profile.Service, env = profile.Environment } });
            await SendWorkspaceAsync(sender);
            await SendSchemaAsync(sender);
            await SendCompletionVocabularyAsync(sender, requestId);
        }

        private async Task SendCompletionVocabularyAsync(CoreWebView2 sender, string? requestId)
        {
            var session = _oracle;
            var vocabulary = await Task.Run(() => session.LoadCompletionVocabularyAsync());
            Send(sender, new { type = "completion.vocabulary", requestId, profileId = session.ProfileId, version = vocabulary.Version, words = vocabulary.Words, error = vocabulary.Error });
        }

        private async Task SendLanguageMetadataAsync(CoreWebView2 sender, string? requestId, string command, JsonElement payload)
        {
            var key = $"{Context.Tab?.Id}:{requestId}";
            using var cancellation = new CancellationTokenSource(TimeSpan.FromSeconds(12));
            _completionRequests[key] = cancellation;
            var epoch = payload.TryGetProperty("epoch", out var epochValue) ? epochValue.GetInt32() : 0;
            var session = _oracle;
            try
            {
                var owner = payload.TryGetProperty("owner", out var ownerValue) ? ownerValue.GetString() ?? "" : "";
                var name = payload.TryGetProperty("name", out var nameValue) ? nameValue.GetString() ?? "" : "";
                var type = payload.TryGetProperty("objectType", out var typeValue) ? typeValue.GetString() ?? "TABLE" : "TABLE";
                object result;
                if (command == "completion.systemObjects") result = await Task.Run(() => session.LoadSystemCompletionObjectsAsync(cancellation.Token));
                else if (command == "completion.objectDraftMetadata") result = await Task.Run(() => session.LoadObjectDraftMetadataAsync(owner, name, type, cancellation.Token));
                else if (command == "completion.objectAnalysis") result = await Task.Run(() => session.LoadObjectAnalysisAsync(owner, name, type, cancellation.Token));
                else if (command == "completion.definition") result = await Task.Run(() => session.LoadCompletionDefinitionAsync(owner, name, type, payload.TryGetProperty("body", out var body) && body.ValueKind == JsonValueKind.True, cancellation.Token));
                else if (command == "completion.plscope") result = await Task.Run(() => session.LoadPlscopeAsync(owner, name, type, payload.TryGetProperty("member", out var member) ? member.GetString() : null, cancellation.Token));
                else result = await Task.Run(() => session.LoadCompletionMetadataAsync(owner, name, type, cancellation.Token));
                Send(sender, new { type = "completion.reply", requestId, epoch, result });
            }
            catch (OperationCanceledException) { Send(sender, new { type = "completion.reply", requestId, epoch, cancelled = true }); }
            catch (Exception ex) { Send(sender, new { type = "completion.reply", requestId, epoch, error = ex.Message }); }
            finally { _completionRequests.TryRemove(key, out _); }
        }

        private async Task SendSchemaAsync(CoreWebView2 sender, string? requestId = null)
        {
            var tabId = Context.Tab.Id;
            using var cancellation = new CancellationTokenSource();
            var key = $"{tabId}:{requestId}";
            if (requestId is not null) _schemaRequests[key] = cancellation;
            Send(sender, new { type = "schema.loading", requestId });
            try
            {
                var snapshot = await Task.Run(() => _oracle.LoadSchemaAsync(cancellation.Token), cancellation.Token);
                await SendAsync(sender, new { type = "schema.loaded", requestId, schema = snapshot.Owner, objects = snapshot.Objects });
            }
            catch (OperationCanceledException) { Send(sender, new { type = "schema.cancelled", requestId }); }
            catch (Exception ex)
            {
                Send(sender, new { type = "schema.error", requestId, message = ex.Message });
            }
            finally { if (requestId is not null) _schemaRequests.TryRemove(key, out _); }
        }

        private async Task SendTableDetailsAsync(CoreWebView2 sender, string? requestId, JsonElement payload, bool objectDetails = false)
        {
            var tableName = payload.TryGetProperty("tableName", out var name) ? name.GetString() : null;
            if (string.IsNullOrWhiteSpace(tableName) && payload.TryGetProperty("name", out var objectName)) tableName = objectName.GetString();
            if (string.IsNullOrWhiteSpace(tableName)) throw new InvalidOperationException("A table name is required to load its columns.");
            var owner = payload.TryGetProperty("owner", out var ownerValue) ? ownerValue.GetString() : null;
            var type = payload.TryGetProperty("objectType", out var typeValue) ? typeValue.GetString() : payload.TryGetProperty("type", out var typeValue2) ? typeValue2.GetString() : null;
            try
            {
                var details = await Task.Run(() => _oracle.LoadTableDetailsAsync(tableName, owner, type));
                await SendAsync(sender, new { type = objectDetails ? "schema.object" : "schema.table", requestId, item = details });
            }
            catch (Exception ex) { Send(sender, new { type = "schema.error", requestId, tableName, owner, objectType = type, message = ex.Message }); }
        }

        private async Task ExecuteScriptAsync(CoreWebView2 sender, string? requestId, JsonElement payload)
        {
            var tabId = Context.Tab.Id;
            if (!payload.TryGetProperty("statements", out var values) || values.ValueKind != JsonValueKind.Array || values.GetArrayLength() is < 1 or > 2000) throw new InvalidOperationException("A script must contain 1–2000 statements.");
            if (!_oracle.IsConnected) throw new InvalidOperationException("Connect this SQL tab before running a script.");
            using var cancellation = new CancellationTokenSource();
            if (!_scriptRuns.TryAdd(tabId, cancellation)) throw new InvalidOperationException("A script is already running for this SQL tab.");
            var continueOnError = payload.TryGetProperty("continueOnError", out var continueValue) && continueValue.ValueKind == JsonValueKind.True;
            var statements = values.EnumerateArray().Select(item => item.Clone()).ToArray();
            var completed = 0; var failed = 0;
            try
            {
                Send(sender, new { type = "script.started", requestId, count = statements.Length });
                for (var index = 0; index < statements.Length; index++)
                {
                    if (cancellation.IsCancellationRequested) break;
                    var statement = statements[index];
                    var sql = statement.GetProperty("sql").GetString() ?? "";
                    var offset = statement.TryGetProperty("start", out var start) ? start.GetInt32() : 0;
                    string? sourceReviewId = null;
                    if (OracleSqlUnit.CompilationTarget(sql) is not null)
                    {
                        var pending = Host._scriptSourceReviews.Begin(tabId,requestId ?? "",index);
                        try
                        {
                            Send(sender,new {type="script.sourceReviewRequired",requestId,index,sql,offset,reviewNonce=pending.Nonce,transactionPending=_oracle.HasPendingTransaction});
                            sourceReviewId = await pending.Completion.Task.WaitAsync(cancellation.Token);
                        }
                        catch (OperationCanceledException) { cancellation.Cancel(); break; }
                        finally { Host._scriptSourceReviews.Remove(tabId); }
                    }
                    Send(sender, new { type = "script.step", requestId, index, sql, offset, status = "Running", transactionPending = _oracle.HasPendingTransaction });
                    var timer = Stopwatch.StartNew();
                    var step = JsonSerializer.SerializeToElement(new { sql, sourceReviewId, scriptIndex = index, parameters = statement.TryGetProperty("parameters", out var parameters) ? parameters : JsonSerializer.SerializeToElement(Array.Empty<object>()), pageSize = payload.TryGetProperty("pageSize", out var page) ? page.GetInt32() : 1000, timeoutSeconds = payload.TryGetProperty("timeoutSeconds", out var timeout) ? timeout.GetInt32() : 0 });
                    SqlExecutionResult? stepResult = null; string? stepError = null;
                    var success = await ExecuteSqlAsync(sender, requestId, step, cancellation.Token, result => stepResult = result, error => stepError = error);
                    completed++; if (!success) failed++;
                    Send(sender, new { type = "script.step", requestId, index, sql, offset, status = cancellation.IsCancellationRequested ? "Cancelled" : success ? "Succeeded" : "Failed", elapsedMs = timer.ElapsedMilliseconds, transactionPending = _oracle.HasPendingTransaction, rowsAffected = stepResult?.RowsAffected, returnedRows = stepResult?.ReturnedRows, resultId = stepResult?.ResultId, error = stepError });
                    if (cancellation.IsCancellationRequested || !success && !continueOnError) break;
                }
            }
            finally
            {
                Host._scriptSourceReviews.Remove(tabId);
                _scriptRuns.TryRemove(tabId, out _);
                Send(sender, new { type = "script.completed", requestId, completed, failed, cancelled = cancellation.IsCancellationRequested, transactionPending = _oracle.HasPendingTransaction });
            }
        }

        private async Task<bool> ExecuteSqlAsync(CoreWebView2 sender, string? requestId, JsonElement payload, CancellationToken cancellationToken = default, Action<SqlExecutionResult>? onResult = null, Action<string>? onError = null)
        {
            var sql = payload.TryGetProperty("sql", out var sqlValue) ? sqlValue.GetString() ?? string.Empty : string.Empty;
            if (payload.TryGetProperty("miniTool", out var miniToolValue) && miniToolValue.ValueKind == JsonValueKind.True) MiniToolService.AssertSelect(sql);
            var rowLimit = (payload.TryGetProperty("pageSize", out var rowLimitValue) || payload.TryGetProperty("rowLimit", out rowLimitValue)) && rowLimitValue.TryGetInt32(out var requestedRowLimit)
                ? Math.Clamp(requestedRowLimit, 100, 10000)
                : 1000;
            var parameters = new List<SqlBindParameter>();
            if (payload.TryGetProperty("parameters", out var parameterValues) && parameterValues.ValueKind == JsonValueKind.Array)
            {
                foreach (var item in parameterValues.EnumerateArray())
                {
                    var name = item.TryGetProperty("name", out var nameValue) ? nameValue.GetString() : null;
                    var type = item.TryGetProperty("type", out var typeValue) ? typeValue.GetString() : null;
                    var value = item.TryGetProperty("value", out var valueValue) && valueValue.ValueKind == JsonValueKind.String ? valueValue.GetString() : null;
                    var direction = item.TryGetProperty("direction", out var directionValue) ? directionValue.GetString() ?? "IN" : "IN";
                    if (!string.IsNullOrWhiteSpace(name) && !string.IsNullOrWhiteSpace(type)) parameters.Add(new SqlBindParameter(name, type, value, direction));
                }
            }
            if (OracleSqlUnit.CompilationTarget(sql) is null && payload.TryGetProperty("previousResultId", out var previousResult) && previousResult.ValueKind == JsonValueKind.String) await _oracle.CloseResultAsync(previousResult.GetString()!);
            SqlExecutionResult result;
            var timeout = payload.TryGetProperty("timeoutSeconds", out var timeoutValue) && timeoutValue.TryGetInt32(out var seconds) ? Math.Clamp(seconds, 0, 86400) : 0;
            var stageTab = Context.Tab;
            int? scriptIndex = payload.TryGetProperty("scriptIndex",out var scriptIndexValue) ? scriptIndexValue.GetInt32() : null;
            var progress = new Progress<string>(stage => Post(sender, SerializeReply(new { type = "sql.stage", requestId, stage, scriptIndex }, stageTab)));
            var sourceReviewId = payload.TryGetProperty("sourceReviewId", out var reviewValue) && reviewValue.ValueKind == JsonValueKind.String ? reviewValue.GetString() : null;
            try { result = await Task.Run(() => _oracle.ExecuteAsync(sql, parameters, rowLimit, cancellationToken, timeoutSeconds: timeout, progress: progress, sourceReviewId: sourceReviewId, deferLobs: true)); }
            catch (TimeoutException ex)
            {
                onError?.Invoke(ex.Message);
                Send(sender, new { type = "sql.timeout", requestId, message = ex.Message, timeoutSeconds = timeout, transactionPending = _oracle.HasPendingTransaction });
                return false;
            }
            catch (OperationCanceledException)
            {
                onError?.Invoke("Query cancelled.");
                Send(sender, new { type = "sql.cancelled", requestId, complete = true, active = false, transactionPending = _oracle.HasPendingTransaction });
                return false;
            }
            catch (Exception ex)
            {
                onError?.Invoke(ex.Message);
                // No transaction state is claimed when the automatic Commit's outcome is unknown; the interface then says it is unconfirmed.
                Send(sender, new { type = "host.error", requestId, message = ex.Message, transactionPending = ex is OracleCommitOutcomeUnknownException ? null : (bool?)_oracle.HasPendingTransaction, connected = _oracle.IsConnected });
                return false;
            }
            onResult?.Invoke(result);
            if (OracleSqlUnit.CompilationTarget(sql) is not null)
            {
                try
                {
                    var compilation = await Task.Run(() => _oracle.LoadCompilationDiagnosticsAsync(sql, cancellationToken));
                    await SendAsync(sender, new { type = "sql.compilation", requestId, compilation, result.ElapsedMs, result.TransactionPending, result.Output, sqlVersion = Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(Encoding.UTF8.GetBytes(sql))) });
                    var successful = compilation is null || !compilation.Errors.Any(error => error.Attribute == "ERROR");
                    if (!successful) onError?.Invoke("Oracle compilation errors are available in Problems.");
                    return successful;
                }
                catch (Exception ex) { Send(sender, new { type = "sql.compilation", requestId, metadataError = ex.Message, result.ElapsedMs, result.TransactionPending, result.Output }); }
                return false;
            }
            await SendAsync(sender, new
            {
                type = "sql.result", requestId, result.Columns, result.Rows, result.RowsAffected,
                result.ElapsedMs, result.ReturnedRows, result.Truncated, result.TransactionPending, result.Output, result.OutParameters, result.SqlId, result.ResultId, result.HasMore, result.PageSize, result.Offset,
                profileId = _oracle.ProfileId, sqlVersion = Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(Encoding.UTF8.GetBytes(sql)))
            });
            return true;
        }

        // Runs the batch in GridDmlBatch and reports it to the tab that asked; sql.stopApplyDml reaches it through _gridApplies.
        private async Task ApplyGridDmlAsync(CoreWebView2 sender, string? requestId, JsonElement payload)
        {
            var tabId = Context.Tab.Id;
            var items = payload.GetProperty("statements").EnumerateArray().ToList();
            var timeout = payload.TryGetProperty("timeoutSeconds", out var timeoutValue) && timeoutValue.TryGetInt32(out var seconds) ? Math.Clamp(seconds, 1, 300) : 60;
            var keepOnFailure = payload.TryGetProperty("onFailure", out var policy) && policy.GetString() == "keep";
            using var stop = new CancellationTokenSource();
            _gridApplies[tabId] = stop;
            try
            {
                var result = await GridDmlBatch.RunAsync(_oracle, items, timeout, keepOnFailure, stop.Token);
                if (result.Error is { } error) Send(sender, new { type = "sql.dmlApplied", requestId, tabId, outcomes = Array.Empty<object>(), transactionPending = _oracle.HasPendingTransaction, autoCommit = _oracle.AutoCommit, error });
                else Send(sender, new { type = "sql.dmlApplied", requestId, tabId, outcomes = result.Outcomes, transactionPending = _oracle.HasPendingTransaction, autoCommit = _oracle.AutoCommit, recovery = result.Recovery, stoppedByUser = result.StoppedByUser });
            }
            finally { _gridApplies.TryRemove(tabId, out _); }
        }

        // Runs one explicit "SELECT (expression) FROM dual" in the tab's session; the result never reaches the result grid or history.
        private async Task EvaluateExpressionAsync(CoreWebView2 sender, string? requestId, JsonElement payload)
        {
            var sql = payload.TryGetProperty("sql", out var sqlValue) ? sqlValue.GetString() ?? string.Empty : string.Empty;
            var tabId = Context.Tab.Id;
            try
            {
                MiniToolService.AssertSelect(sql);
                var parameters = new List<SqlBindParameter>();
                if (payload.TryGetProperty("parameters", out var values) && values.ValueKind == JsonValueKind.Array)
                {
                    foreach (var item in values.EnumerateArray())
                    {
                        var name = item.TryGetProperty("name", out var nameValue) ? nameValue.GetString() : null;
                        var type = item.TryGetProperty("type", out var typeValue) ? typeValue.GetString() : null;
                        var value = item.TryGetProperty("value", out var valueValue) && valueValue.ValueKind == JsonValueKind.String ? valueValue.GetString() : null;
                        if (!string.IsNullOrWhiteSpace(name) && !string.IsNullOrWhiteSpace(type)) parameters.Add(new SqlBindParameter(name, type, value));
                    }
                }
                var timeout = payload.TryGetProperty("timeoutSeconds", out var timeoutValue) && timeoutValue.TryGetInt32(out var seconds) ? Math.Clamp(seconds, 1, 300) : 30;
                var limit = payload.TryGetProperty("rowLimit", out var limitValue) && limitValue.TryGetInt32(out var requestedLimit) ? Math.Clamp(requestedLimit, 1, 50) : 1;
                var result = await Task.Run(() => _oracle.ExecuteAsync(sql, parameters, limit, default, timeoutSeconds: timeout));
                if (result.ResultId is { } resultId) await _oracle.CloseResultAsync(resultId);
                Send(sender, new { type = "sql.evaluated", requestId, tabId, columns = result.Columns, rows = result.Rows, elapsedMs = result.ElapsedMs, transactionPending = result.TransactionPending, truncated = result.Truncated || result.HasMore });
            }
            catch (Exception ex)
            {
                Send(sender, new { type = "sql.evaluated", requestId, tabId, error = ex.Message, transactionPending = _oracle.HasPendingTransaction });
            }
        }

        private async Task ExportResultAsync(CoreWebView2 sender, string? requestId, JsonElement payload)
        {
            var tabId = Context.Tab.Id;
            using var cancellation = new CancellationTokenSource();
            if (!_resultExports.TryAdd(tabId, cancellation)) throw new InvalidOperationException("An export is already running for this SQL tab.");
            var resultId = payload.TryGetProperty("resultId", out var idValue) ? idValue.GetString() : null;
            var consumed = false; var count = 0; string? temporaryPath = null;
            var clock = System.Diagnostics.Stopwatch.StartNew(); long bytes = 0;
            try {
                var format=payload.TryGetProperty("format",out var formatValue)?formatValue.GetString()??"csv":"csv";
                if(format is not ("csv" or "csv.gz" or "xlsx"))throw new InvalidOperationException("Unsupported export format.");
                var extension=format=="xlsx"?".xlsx":format=="csv.gz"?".csv.gz":".csv";
                var picker = new FileSavePicker { SuggestedStartLocation = PickerLocationId.DocumentsLibrary, SuggestedFileName = payload.TryGetProperty("fileName", out var name) ? name.GetString() ?? "results"+extension : "results"+extension };
                picker.FileTypeChoices.Add(format.ToUpperInvariant(), new List<string> { format=="csv.gz"?".gz":extension });
                InitializeWithWindow.Initialize(picker, OwnerWindowHandle);
                var file = await picker.PickSaveFileAsync();
                if (file is null) { Send(sender, new { type = "result.exportComplete", requestId, resultId, consumed, cancelled = true, success = false, message = "Export cancelled." }); return; }
                temporaryPath = file.Path + "." + Guid.NewGuid().ToString("N") + ".partial";
                var columns = payload.GetProperty("columns").EnumerateArray().Select(c => c.GetProperty("name").GetString() ?? "").ToArray();
                var initialRows = await ExportRowsAsync(payload.GetProperty("rows"));
                var hasMore = payload.TryGetProperty("hasMore", out var more) && more.GetBoolean();
                if(format=="xlsx") {
                    var metadata=JsonSerializer.Deserialize<SqlColumn[]>(payload.GetProperty("columns").GetRawText(),WebJsonOptions)??[];
                    var materialized=initialRows.ToArray();
                    await Task.Run(()=>{using var output=File.Create(temporaryPath);ResultXlsxExporter.Write(output,metadata,materialized,cancellation.Token,payload.TryGetProperty("includeMetadata",out var includeMetadata)&&includeMetadata.GetBoolean());},cancellation.Token);
                    count=materialized.Length;
                } else {
                    await using var fileStream=File.Create(temporaryPath);
                    var measured = fileStream;
                    await using Stream stream=format=="csv.gz"?new System.IO.Compression.GZipStream(fileStream,System.IO.Compression.CompressionLevel.Optimal,true):fileStream;
                    var csvOptions=payload.TryGetProperty("csvOptions",out var csvValue)?JsonSerializer.Deserialize<CsvExportOptions>(csvValue.GetRawText(),WebJsonOptions):null;
                    var encodingName=csvValue.ValueKind==JsonValueKind.Object&&csvValue.TryGetProperty("encoding",out var encodingValue)?encodingValue.GetString():"utf-8";
                    var bom=csvValue.ValueKind!=JsonValueKind.Object||!csvValue.TryGetProperty("bom",out var bomValue)||bomValue.GetBoolean();
                    Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
                    var encoding=encodingName=="utf-16"?new UnicodeEncoding(false,bom,true):encodingName=="windows-1254"?Encoding.GetEncoding(1254,EncoderFallback.ExceptionFallback,DecoderFallback.ExceptionFallback):new UTF8Encoding(bom,true);
                    await using var writer=new StreamWriter(stream,encoding,1024,true);
                    count = await ResultCsvExporter.WriteAsync(writer, columns, initialRows,
                        hasMore && !string.IsNullOrEmpty(resultId) ? async token => { consumed = true; return await Task.Run(() => _oracle.FetchNextPageAsync(resultId, 1000, token)); } : null,
                        written => SendAsync(sender, new { type = "result.exportProgress", requestId, resultId, rowsWritten = written, bytesWritten = measured.Length, elapsedMs = clock.ElapsedMilliseconds, message = $"{written:N0} rows written…" }), cancellation.Token,csvOptions);
                    await writer.FlushAsync(cancellation.Token);
                }
                cancellation.Token.ThrowIfCancellationRequested(); File.Move(temporaryPath, file.Path, true); temporaryPath = null;
                bytes = new FileInfo(file.Path).Length;
                Send(sender, new { type = "result.exportComplete", requestId, resultId, consumed, success = true, rowsWritten = count, bytesWritten = bytes, elapsedMs = clock.ElapsedMilliseconds, message = $"Exported {count:N0} rows to {file.Name}." });
            }
            catch (OperationCanceledException) { Send(sender, new { type = "result.exportComplete", requestId, resultId, consumed, cancelled = true, success = false, rowsWritten = count, message = "Export cancelled. Partial file removed." }); }
            catch (Exception ex) { Send(sender, new { type = "result.exportComplete", requestId, resultId, consumed, success = false, message = "Export failed: " + ex.Message }); }
            finally { if (temporaryPath is not null) { try { File.Delete(temporaryPath); } catch (IOException) { } } _resultExports.TryRemove(tabId, out _); }
        }

        // Rows already in the grid; large values sent as previews are read whole through their locators.
        private async Task<object?[][]> ExportRowsAsync(JsonElement rows)
        {
            var result = new List<object?[]>();
            foreach (var row in rows.EnumerateArray())
            {
                var cells = new List<object?>();
                foreach (var cell in row.EnumerateArray())
                {
                    if (cell.ValueKind == JsonValueKind.Object && cell.TryGetProperty("kind", out var kind) && kind.GetString() == "lob")
                    {
                        var lobId = cell.TryGetProperty("lobId", out var lobValue) ? lobValue.GetString() : null;
                        if (string.IsNullOrEmpty(lobId)) throw new InvalidOperationException("A large value in this result can no longer be read. Run the query again before exporting.");
                        var whole = await Task.Run(() => _oracle.ReadWholeLobAsync(lobId));
                        cells.Add(whole.Text ?? whole.Base64);
                    }
                    else cells.Add(cell.ValueKind == JsonValueKind.Null ? null : cell.ValueKind == JsonValueKind.Number ? cell.GetDecimal() : cell.ValueKind == JsonValueKind.Object && cell.TryGetProperty("base64", out var binary) ? binary.GetString() : cell.ValueKind == JsonValueKind.String ? cell.GetString() : cell.ToString());
                }
                result.Add(cells.ToArray());
            }
            return result.ToArray();
        }

        private async Task ReadLobAsync(CoreWebView2 sender, string? requestId, JsonElement payload)
        {
            var lobId = payload.GetProperty("lobId").GetString() ?? "";
            try
            {
                var offset = payload.TryGetProperty("offset", out var offsetValue) && offsetValue.TryGetInt64(out var start) ? Math.Max(0, start) : 0;
                var requested = payload.TryGetProperty("count", out var countValue) && countValue.TryGetInt32(out var size) ? size : int.MaxValue;
                var chunk = await Task.Run(() => _oracle.ReadLobAsync(lobId, offset, Math.Max(1, requested)));
                await SendAsync(sender, new { type = "sql.lobChunk", requestId, chunk.LobId, chunk.LobType, chunk.Offset, chunk.Length, chunk.Count, chunk.Text, chunk.Base64, chunk.Complete });
            }
            catch (Exception ex) { Send(sender, new { type = "sql.lobChunk", requestId, lobId, error = ex.Message }); }
        }

        private async Task FetchSqlPageAsync(CoreWebView2 sender, string? requestId, JsonElement payload)
        {
            var resultId = payload.GetProperty("resultId").GetString() ?? "";
            var size = payload.TryGetProperty("pageSize", out var sizeValue) && sizeValue.TryGetInt32(out var requested) ? Math.Clamp(requested, 100, 10000) : 1000;
            try
            {
                var result = await Task.Run(() => _oracle.FetchNextPageAsync(resultId, size, deferLobs: true));
                await SendAsync(sender, new { type = "sql.page", requestId, result.Columns, result.Rows, result.ElapsedMs, result.ReturnedRows, result.TransactionPending, result.ResultId, result.HasMore, result.PageSize, result.Offset });
            }
            catch (Exception ex) { Send(sender, new { type = "sql.pageError", requestId, resultId, message = ex.Message }); }
        }

        private async Task ExplainSqlAsync(CoreWebView2 sender, string? requestId, JsonElement payload)
        {
            var sql = payload.TryGetProperty("sql", out var sqlValue) ? sqlValue.GetString() ?? string.Empty : string.Empty;
            try
            {
                var result = await Task.Run(() => _oracle.ExplainPlanAsync(sql));
                await SendAsync(sender, new
                {
                    type = "sql.explainResult", requestId, result.Columns, result.Rows,
                    result.ElapsedMs, result.ReturnedRows, result.TransactionPending,
                    profileId = _oracle.ProfileId
                });
            }
            catch (OperationCanceledException)
            {
                Send(sender, new { type = "sql.cancelled", requestId, complete = true, active = false, transactionPending = _oracle.HasPendingTransaction });
            }
            catch (Exception ex)
            {
                Send(sender, new { type = "host.error", requestId, message = ex.Message, transactionPending = _oracle.HasPendingTransaction, explain = true });
            }
        }

        private static object? ReadWireValue(JsonElement value) => value.ValueKind switch {
            JsonValueKind.Null => null,
            JsonValueKind.Number => value.GetDecimal(),
            JsonValueKind.String => value.GetString(),
            JsonValueKind.True => true,
            JsonValueKind.False => false,
            JsonValueKind.Object when value.TryGetProperty("kind",out var kind)&&kind.GetString()=="temporal" => JsonSerializer.Deserialize<OracleTemporalCell>(value.GetRawText(),WebJsonOptions),
            JsonValueKind.Object when value.TryGetProperty("kind",out var lob)&&lob.GetString()=="lob" => throw new InvalidOperationException("Open the large value in the cell viewer and load it fully before using it here."),
            JsonValueKind.Object when value.TryGetProperty("base64",out var bytes) => Convert.FromBase64String(bytes.GetString()??""),
            _ => value.ToString()
        };
    }
}
