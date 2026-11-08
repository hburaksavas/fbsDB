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
    private sealed class WorkspaceCommandHandler(MainPage host, NativeCommandContext context) : NativeCommandHandler(host, context)
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
                case "workspace.binds.load":
                case "workspace.binds.save":
                    var bindRoot = _workspace.Root ?? throw new InvalidOperationException("Open a workspace to share bind forms.");
                    var bindPath = payload.GetProperty("path").GetString()!;
                    BindFormDocument? bindForm;
                    if (command == "workspace.binds.load") bindForm = await Task.Run(() => BindFormService.LoadAsync(bindRoot, bindPath));
                    else
                    {
                        var submitted = payload.GetProperty("definitions").EnumerateArray().Select(item => new BindFormDefinition(
                            item.GetProperty("name").GetString() ?? "", item.TryGetProperty("type", out var bindType) ? bindType.GetString() ?? "VARCHAR2" : "VARCHAR2",
                            item.TryGetProperty("label", out var bindLabel) ? bindLabel.GetString() ?? "" : "", item.TryGetProperty("description", out var bindDescription) ? bindDescription.GetString() ?? "" : "",
                            item.TryGetProperty("required", out var bindRequired) && bindRequired.ValueKind == JsonValueKind.True,
                            item.TryGetProperty("defaultValue", out var bindDefault) && bindDefault.ValueKind == JsonValueKind.String ? bindDefault.GetString() : null)).ToArray();
                        bindForm = await Task.Run(() => BindFormService.SaveAsync(bindRoot, bindPath, submitted));
                    }
                    Send(sender, new { type = "workspace.binds", requestId = id, path = bindPath, operation = command == "workspace.binds.load" ? "load" : "save", definitions = bindForm?.Definitions ?? Array.Empty<BindFormDefinition>() });
                    break;
                case "workspace.runs.list":
                case "workspace.runs.save":
                    var runRoot = _workspace.Root ?? throw new InvalidOperationException("Open a workspace to save or load call definitions.");
                    if (payload.GetProperty("root").GetString() != runRoot) throw new InvalidOperationException("The workspace changed. Reopen run configurations.");
                    if (command == "workspace.runs.list")
                    {
                        var runCatalog = await Task.Run(() => RunConfigurationService.ListAsync(runRoot));
                        Send(sender, new { type = "workspace.runs.list", requestId = id, root = runRoot, catalog = runCatalog });
                    }
                    else
                    {
                        var runDocument = payload.GetProperty("configuration").Clone();
                        var savedConfiguration = await Task.Run(() => RunConfigurationService.SaveAsync(runRoot, runDocument));
                        Send(sender, new { type = "workspace.runs.saved", requestId = id, root = runRoot, configuration = savedConfiguration });
                    }
                    break;
                case "workspace.projectRules":
                case "workspace.projectRules.save":
                    var rulesRoot = payload.GetProperty("root").GetString()!;
                    var rulesSnapshot = command == "workspace.projectRules"
                        ? await _workspace.GetProjectRulesAsync(rulesRoot)
                        : await _workspace.SaveProjectRulesAsync(rulesRoot, payload.GetProperty("rules").Deserialize<WorkspaceProjectRules>(WebJsonOptions)!, payload.GetProperty("revision").GetString()!);
                    Send(sender, new { type = "workspace.projectRules", requestId = id, root = rulesRoot, snapshot = rulesSnapshot });
                    if (command == "workspace.projectRules.save") await SendWorkspaceAsync(sender);
                    break;
                case "workspace.sources":
                    var sourceRoot = payload.GetProperty("root").GetString()!;
                    var sources = await Task.Run(() => _workspace.ReadSourceFilesAsync(sourceRoot));
                    Send(sender, new { type = "workspace.sources", requestId = id, sources });
                    break;
                case "workspace.tools.list":
                case "workspace.tools.save":
                    var toolRoot = _workspace.Root ?? throw new InvalidOperationException("Open a workspace to use mini tools.");
                    if (!payload.TryGetProperty("root", out var toolRootValue) || toolRootValue.GetString() != toolRoot) throw new InvalidOperationException("The active workspace changed. Reopen mini tools.");
                    if (command == "workspace.tools.list")
                    {
                        var catalog = await Task.Run(() => MiniToolService.ListAsync(toolRoot));
                        Send(sender, new { type = command, requestId = id, root = toolRoot, catalog });
                    }
                    else
                    {
                        var toolDocument = payload.GetProperty("tool").Clone();
                        var savedTool = await Task.Run(() => MiniToolService.SaveAsync(toolRoot, toolDocument));
                        Send(sender, new { type = command, requestId = id, root = toolRoot, tool = savedTool });
                    }
                    break;
                case "workspace.git":
                    try { var state = await Task.Run(() => Development.GitStateAsync()); Send(sender,new {type="workspace.git",requestId=id,state}); }
                    catch(Exception error){ Send(sender,new {type="workspace.git",requestId=id,error=error.Message}); }
                    break;
                case "workspace.gitStage":
                case "workspace.gitUnstage":
                    try { var paths = payload.GetProperty("paths").EnumerateArray().Select(item => item.GetString() ?? "").ToArray(); var state = await Task.Run(() => Development.GitStageAsync(paths, command == "workspace.gitStage")); Send(sender,new {type=command,requestId=id,state}); }
                    catch(Exception error){ Send(sender,new {type=command,requestId=id,error=error.Message}); }
                    break;
                case "workspace.gitCommit":
                    try { var commit = await Task.Run(() => Development.GitCommitAsync(payload.GetProperty("message").GetString() ?? "")); var state = await Task.Run(() => Development.GitStateAsync()); Send(sender,new {type=command,requestId=id,commit,state}); }
                    catch(Exception error){ Send(sender,new {type=command,requestId=id,error=error.Message}); }
                    break;
                case "workspace.gitDiff":
                    try { var diff = await Task.Run(() => Development.GitDiffAsync(payload.GetProperty("path").GetString()!)); Send(sender,new {type="workspace.gitDiff",requestId=id,diff}); }
                    catch(Exception error){ Send(sender,new {type="workspace.gitDiff",requestId=id,error=error.Message}); }
                    break;
                case "workspace.replacePreview":
                case "workspace.replaceApply":
                    try {
                        var excluded=payload.GetProperty("excluded").EnumerateArray().Select(item=>item.GetString()!).ToArray();
                        if(command=="workspace.replacePreview") { var preview=await Task.Run(()=>Development.PreviewReplaceAsync(payload.GetProperty("search").GetString()!,payload.GetProperty("replacement").GetString()??"",payload.GetProperty("caseSensitive").GetBoolean(),excluded,payload.TryGetProperty("scope",out var replaceScope)?replaceScope.GetString():null)); Send(sender,new {type="workspace.replacePreview",requestId=id,preview}); }
                        else { var selected=payload.GetProperty("selected").EnumerateArray().Select(item=>item.GetString()!).ToArray();var result=await Task.Run(()=>Development.ApplyReplaceAsync(payload.GetProperty("previewId").GetString()!,selected,excluded)); Send(sender,new {type="workspace.replaceApply",requestId=id,result}); }
                    } catch(Exception error){ Send(sender,new {type=command,requestId=id,error=error.Message}); }
                    break;
                case "workspace.worksets":
                    var sets = await Task.Run(() => _workspace.ListWorksetsAsync());
                    Send(sender, new { type = "workspace.worksets", requestId = id, root = _workspace.Root, worksets = sets });
                    break;
                case "workspace.worksetSave":
                    var worksetId = payload.TryGetProperty("id", out var setId) ? setId.GetString() : null;
                    IReadOnlyList<WorkspaceWorksetFile>? setFiles = payload.TryGetProperty("files", out var setFilesValue) ? setFilesValue.EnumerateArray().Select(file => new WorkspaceWorksetFile(file.GetProperty("path").GetString()!, file.GetProperty("line").GetInt32(), file.GetProperty("column").GetInt32())).ToArray() : null;
                    await Task.Run(() => _workspace.SaveWorksetAsync(worksetId, payload.GetProperty("name").GetString()!, setFiles, payload.TryGetProperty("activePath", out var setActive) ? setActive.GetString() : null));
                    Send(sender, new { type = "workspace.worksets", requestId = id, root = _workspace.Root, worksets = await _workspace.ListWorksetsAsync() });
                    break;
                case "workspace.worksetDelete":
                    await _workspace.DeleteWorksetAsync(payload.GetProperty("id").GetString()!);
                    Send(sender, new { type = "workspace.worksets", requestId = id, root = _workspace.Root, worksets = await _workspace.ListWorksetsAsync() });
                    break;
                case "workspace.worksetOpen":
                    var workset = (await _workspace.ListWorksetsAsync()).Single(set => set.Id == payload.GetProperty("id").GetString());
                    var openedSet = await Task.Run(async () => {
                        var files = new List<object>(); var skipped = new List<string>(); long size = 0;
                        foreach (var entry in workset.Files) {
                            var snapshot = await WorkspaceFileService.ReadAsync(_workspace.ResolveWorksetFile(entry.Path));
                            size += snapshot.Content?.Length * 2L ?? 0;
                            if (snapshot.Missing || snapshot.Error is not null || size > 20 * 1024 * 1024) { skipped.Add(entry.Path + ": " + (snapshot.Error ?? (snapshot.Missing ? "File missing" : "Workset size limit"))); continue; }
                            var profileId = await _workspace.GetFileConnectionAsync(snapshot.Path);
                            files.Add(new { path = snapshot.Path, content = snapshot.Content, diskVersion = snapshot.Version, fileName = Path.GetFileName(snapshot.Path), profileId, entry.Line, entry.Column });
                        }
                        return new { files, skipped };
                    });
                    Send(sender, new { type = "workspace.worksetOpened", requestId = id, root = _workspace.Root, workset, openedSet.files, openedSet.skipped });
                    break;
                case "workspace.moveEntries":
                    var batchMoves = await Task.Run(() => _workspace.MoveEntriesAsync(payload.GetProperty("paths").EnumerateArray().Select(item => item.GetString()!).ToArray(), payload.GetProperty("destination").GetString()!));
                    foreach (var tab in _sessions.Sessions)
                        foreach (var move in batchMoves)
                            if (WorkspaceService.RemapPath(tab.FilePath, move.Source, move.Destination) is { } remapped) { tab.FilePath = remapped; break; }
                    Send(sender, new { type = "workspace.changed", requestId = id, root = _workspace.Root, moves = batchMoves });
                    await SendWorkspaceAsync(sender);
                    break;
                case "workspace.recycleEntries":
                    if (!payload.GetProperty("confirmed").GetBoolean()) throw new InvalidOperationException("Confirm moving the selected items to the Recycle Bin first.");
                    var recyclePaths = _workspace.NormalizeSelection(payload.GetProperty("paths").EnumerateArray().Select(item => item.GetString()!));
                    if (_sessions.Sessions.Any(tab => recyclePaths.Any(path => WorkspaceService.RemapPath(tab.FilePath, path, path) is not null))) throw new InvalidOperationException("Close all SQL tabs in the selected items first. Nothing was recycled.");
                    var recycled = await Task.Run(() => _workspace.RecycleEntriesAsync(recyclePaths, (path, directory) => {
                        if (directory) Microsoft.VisualBasic.FileIO.FileSystem.DeleteDirectory(path, Microsoft.VisualBasic.FileIO.UIOption.OnlyErrorDialogs, Microsoft.VisualBasic.FileIO.RecycleOption.SendToRecycleBin);
                        else Microsoft.VisualBasic.FileIO.FileSystem.DeleteFile(path, Microsoft.VisualBasic.FileIO.UIOption.OnlyErrorDialogs, Microsoft.VisualBasic.FileIO.RecycleOption.SendToRecycleBin);
                    }));
                    Send(sender, new { type = "workspace.changed", requestId = id, root = _workspace.Root, removedPaths = recycled.Removed, error = recycled.Error is null ? null : $"{recycled.Removed.Count} items recycled. {recycled.Error}" });
                    await SendWorkspaceAsync(sender);
                    break;
                case "workspace.update":
                    await Task.Run(() => _workspace.UpdateRegistrationAsync(payload.GetProperty("id").GetString()!, payload.GetProperty("name").GetString()!, payload.GetProperty("description").GetString() ?? "", payload.GetProperty("pinned").GetBoolean()));
                    await SendWorkspaceAsync(sender);
                    Send(sender, new { type = "workspace.operation", requestId = id });
                    break;
                case "workspace.forget":
                    await _workspace.ForgetAsync(payload.GetProperty("id").GetString()!);
                    await SendWorkspaceAsync(sender);
                    Send(sender, new { type = "workspace.operation", requestId = id });
                    break;
                case "workspace.pickLocation":
                    var locationPicker = new FolderPicker { SuggestedStartLocation = PickerLocationId.DocumentsLibrary };
                    locationPicker.FileTypeFilter.Add("*");
                    InitializeWithWindow.Initialize(locationPicker, OwnerWindowHandle);
                    var location = await locationPicker.PickSingleFolderAsync();
                    Send(sender, new { type = "workspace.location", requestId = id, path = location?.Path });
                    break;
                case "workspace.relocate":
                    if (!payload.GetProperty("confirmed").GetBoolean()) throw new InvalidOperationException("Confirm the workspace location first.");
                    await Task.Run(() => _workspace.RelocateAsync(payload.GetProperty("id").GetString()!, payload.GetProperty("path").GetString()!));
                    await SendWorkspaceAsync(sender);
                    Send(sender, new { type = "workspace.operation", requestId = id });
                    break;
                case "workspace.reveal":
                    var revealPath = Path.GetFullPath(payload.GetProperty("path").GetString()!);
                    if (!_workspace.Catalog.Any(w => string.Equals(w.Path, revealPath, StringComparison.OrdinalIgnoreCase))) _workspace.ValidateEntryPath(revealPath, true);
                    if (!File.Exists(revealPath) && !Directory.Exists(revealPath)) throw new FileNotFoundException("The location is unavailable.");
                    var reveal = new ProcessStartInfo("explorer.exe") { UseShellExecute = true };
                    if (File.Exists(revealPath)) reveal.Arguments = "/select,\"" + revealPath + "\"";
                    else reveal.ArgumentList.Add(revealPath);
                    Process.Start(reveal);
                    Send(sender, new { type = "workspace.operation", requestId = id });
                    break;
                case "workspace.duplicateEntry":
                    EnsureWorkspaceRoot(payload);
                    var duplicate = await Task.Run(() => _workspace.DuplicateEntryAsync(payload.GetProperty("path").GetString()!, payload.GetProperty("name").GetString()!));
                    Send(sender, new { type = "workspace.changed", requestId = id, root = _workspace.Root, entry = duplicate });
                    await SendWorkspaceAsync(sender);
                    break;
                case "workspace.recycleEntry":
                    EnsureWorkspaceRoot(payload);
                    var recyclePath = _workspace.ValidateEntryPath(payload.GetProperty("path").GetString()!);
                    if (!payload.GetProperty("confirmed").GetBoolean()) throw new InvalidOperationException("Confirm moving this item to the Recycle Bin first.");
                    if (_sessions.Sessions.Any(tab => WorkspaceService.RemapPath(tab.FilePath, recyclePath, recyclePath) is not null))
                        throw new InvalidOperationException("Close the open SQL tabs in this item before moving it to the Recycle Bin. Save changes and resolve pending transactions first.");
                    await Task.Run(() => _workspace.RecycleEntryAsync(recyclePath, (path, directory) => {
                        if (directory) Microsoft.VisualBasic.FileIO.FileSystem.DeleteDirectory(path, Microsoft.VisualBasic.FileIO.UIOption.OnlyErrorDialogs, Microsoft.VisualBasic.FileIO.RecycleOption.SendToRecycleBin);
                        else Microsoft.VisualBasic.FileIO.FileSystem.DeleteFile(path, Microsoft.VisualBasic.FileIO.UIOption.OnlyErrorDialogs, Microsoft.VisualBasic.FileIO.RecycleOption.SendToRecycleBin);
                    }));
                    Send(sender, new { type = "workspace.changed", requestId = id, root = _workspace.Root, removed = recyclePath });
                    await SendWorkspaceAsync(sender);
                    break;
                case "workspace.open":
                    await OpenWorkspaceAsync(sender);
                    break;
                case "workspace.openRecent":
                    var recentPath = payload.GetProperty("path").GetString()!;
                    if (!_workspace.Recent.Contains(recentPath, StringComparer.OrdinalIgnoreCase)) throw new InvalidOperationException("Choose a recent workspace.");
                    await _workspace.SetRootAsync(recentPath);
                    await SendWorkspaceAsync(sender);
                    break;
                case "workspace.close":
                    await _workspace.CloseAsync();
                    await SendWorkspaceAsync(sender);
                    break;
                case "workspace.children":
                    var directoryPath = payload.GetProperty("path").GetString()!;
                    var directoryRoot = _workspace.Root;
                    var directoryEntries = await Task.Run(() => _workspace.ListDirectory(directoryPath));
                    Send(sender, new { type = "workspace.children", requestId = id, root = directoryRoot, path = directoryPath, entries = directoryEntries });
                    break;
                case "workspace.createEntry":
                    EnsureWorkspaceRoot(payload);
                    var entry = await Task.Run(() => _workspace.CreateEntryAsync(payload.GetProperty("parent").GetString()!, payload.GetProperty("name").GetString()!, payload.GetProperty("directory").GetBoolean()));
                    Send(sender, new { type = "workspace.changed", requestId = id, root = _workspace.Root, entry });
                    await SendWorkspaceAsync(sender);
                    break;
                case "workspace.createFile":
                    EnsureWorkspaceRoot(payload);
                    var created = await Task.Run(() => _workspace.CreateFileWithContentAsync(payload.GetProperty("relativePath").GetString()!, payload.GetProperty("content").GetString()!));
                    Send(sender, new { type = "workspace.changed", requestId = id, root = _workspace.Root, entry = created });
                    await SendWorkspaceAsync(sender);
                    break;
                case "workspace.moveEntry":
                    EnsureWorkspaceRoot(payload);
                    var movedSource = Path.GetFullPath(payload.GetProperty("path").GetString()!);
                    var destination = Path.GetFullPath(payload.GetProperty("destination").GetString()!);
                    await Task.Run(() => _workspace.MoveEntryAsync(movedSource, destination));
                    foreach (var tab in _sessions.Sessions)
                        if (WorkspaceService.RemapPath(tab.FilePath, movedSource, destination) is { } mapped) tab.FilePath = mapped;
                    Send(sender, new { type = "workspace.changed", requestId = id, root = _workspace.Root, source = movedSource, destination });
                    await SendWorkspaceAsync(sender);
                    break;
                case "workspace.create":
                    await CreateWorkspaceAsync(sender,payload.TryGetProperty("template",out var templateValue)?templateValue.GetString()??"blank":"blank");
                    break;
                case "workspace.refresh":
                    await SendWorkspaceAsync(sender);
                    break;
                case "workspace.search":
                {
                    var query = payload.TryGetProperty("query", out var queryValue) && queryValue.ValueKind == JsonValueKind.String ? queryValue.GetString() ?? string.Empty : string.Empty;
                    var search = await Task.Run(() => _workspace.SearchSqlFiles(query, scope: payload.TryGetProperty("scope", out var searchScope) ? searchScope.GetString() : null));
                    await SendAsync(sender, new { type = "workspace.searchResults", requestId = id, results = search.Matches, search.Truncated });
                    break;
                }
                default: throw new InvalidOperationException($"Unsupported command: {command}");
            }
        }

        private async Task OpenWorkspaceAsync(CoreWebView2 sender)
        {
            var picker = new FolderPicker { SuggestedStartLocation = PickerLocationId.DocumentsLibrary };
            picker.FileTypeFilter.Add("*");
            InitializeWithWindow.Initialize(picker, OwnerWindowHandle);
            var folder = await picker.PickSingleFolderAsync();
            if (folder is null) return;
            await _workspace.SetRootAsync(folder.Path);
            await SendWorkspaceAsync(sender);
        }

        private async Task CreateWorkspaceAsync(CoreWebView2 sender,string template)
        {
            var picker = new FolderPicker { SuggestedStartLocation = PickerLocationId.DocumentsLibrary };
            picker.FileTypeFilter.Add("*");
            InitializeWithWindow.Initialize(picker, OwnerWindowHandle);
            var parent = await picker.PickSingleFolderAsync();
            if (parent is null) return;

            var nameInput = new TextBox { PlaceholderText = "sql-workspace", Text = "sql-workspace" };
            var dialog = new ContentDialog
            {
                RequestedTheme = NativeTheme.RequestedTheme,
                Background = NativeTheme.Brush("--surface"),
                Foreground = NativeTheme.Brush("--foreground"),
                Title = "Create SQL workspace",
                Content = nameInput,
                PrimaryButtonText = "Create workspace",
                CloseButtonText = "Cancel",
                DefaultButton = ContentDialogButton.Primary,
                XamlRoot = Host.XamlRoot,
            };
            if (await dialog.ShowAsync() != ContentDialogResult.Primary) return;
            var name = nameInput.Text.Trim();
            if (string.IsNullOrWhiteSpace(name) || name.IndexOfAny(Path.GetInvalidFileNameChars()) >= 0 || name is "." or "..")
                throw new InvalidOperationException("Enter a valid workspace folder name.");
            var path = Path.Combine(parent.Path, name);
            if (Directory.Exists(path) || File.Exists(path)) throw new IOException("A folder or file with this name already exists.");
            await WorkspaceTemplates.CreateAsync(path,template);
            await _workspace.SetRootAsync(path);
            await SendWorkspaceAsync(sender);
        }

    }
}
