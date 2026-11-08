using FbsDb.Bridge;
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
    private sealed class FileCommandHandler(MainPage host, NativeCommandContext context) : NativeCommandHandler(host, context)
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
                case "file.new":
                    _activeFilePath = null;
                    break;
                case "file.activate":
                    _activeFilePath = payload.TryGetProperty("path", out var activePath) && activePath.ValueKind == JsonValueKind.String
                        ? Path.GetFullPath(activePath.GetString()!)
                        : null;
                    break;
                case "file.open":
                    await OpenSqlFileAsync(sender);
                    break;
                case "file.openPath":
                    await OpenSqlFilePathAsync(sender, payload);
                    break;
                case "file.save":
                    await SaveSqlFileAsync(sender, id, payload);
                    break;
                case "file.history.list":
                case "file.history.read":
                {
                    var historyPath = payload.GetProperty("path").GetString()!;
                    if (!_sessions.Sessions.Any(tab => string.Equals(tab.FilePath, historyPath, StringComparison.OrdinalIgnoreCase))) throw new InvalidOperationException("Open the file to inspect its local history.");
                    if (command == "file.history.list") Send(sender, new { type = "file.history", requestId = id, operation = "list", path = historyPath, entries = await Task.Run(() => LocalHistoryService.List(historyPath)) });
                    else
                    {
                        var versionId = payload.GetProperty("id").GetString()!;
                        Send(sender, new { type = "file.history", requestId = id, operation = "read", path = historyPath, id = versionId, content = await Task.Run(() => LocalHistoryService.Read(historyPath, versionId)) });
                    }
                    break;
                }
                case "file.bindConnection":
                    await BindFileConnectionAsync(sender, id);
                    break;
                case "file.poll":
                    var allowedPaths = _sessions.Sessions.Where(tab => tab.FilePath is not null).Select(tab => tab.FilePath!).ToHashSet(StringComparer.OrdinalIgnoreCase);
                    var watches = payload.GetProperty("files").EnumerateArray().Take(100).Select(item => (Path: item.GetProperty("path").GetString()!, Version: item.GetProperty("version").GetString(), HadError: item.TryGetProperty("hasError", out var watchError) && watchError.GetBoolean())).Where(item => allowedPaths.Contains(item.Path)).ToArray();
                    var changes = await Task.Run(async () => {
                        var found = new List<object>(); long bytes = 0; var processed = 0;
                        foreach (var watch in watches) {
                            var snapshot = await WorkspaceFileService.ReadAsync(watch.Path); processed++;
                            bytes += snapshot.Content?.Length * 2L ?? 0;
                            if (snapshot.Version != watch.Version || snapshot.Error is not null || watch.HadError) found.Add(new { path = watch.Path, expectedVersion = watch.Version, snapshot });
                            if (bytes > 32 * 1024 * 1024) break;
                        }
                        return new { found, processed };
                    });
                    Send(sender, new { type = "file.changes", requestId = id, changes = changes.found, changes.processed });
                    break;
                default: throw new InvalidOperationException($"Unsupported command: {command}");
            }
        }

        private async Task OpenSqlFilePathAsync(CoreWebView2 sender, JsonElement payload)
        {
            var path = payload.TryGetProperty("path", out var value) ? value.GetString() : null;
            if (string.IsNullOrWhiteSpace(path) || !File.Exists(path)) throw new FileNotFoundException("SQL file no longer exists.", path);
            await OpenSqlFileAtPathAsync(sender, path, payload.TryGetProperty("forceNew", out var forceNew) && forceNew.GetBoolean());
        }

        private async Task OpenSqlFileAtPathAsync(CoreWebView2 sender, string path, bool forceNew = false)
        {
            var filePath = Path.GetFullPath(path);
            var snapshot = await Task.Run(() => WorkspaceFileService.ReadAsync(filePath));
            if (snapshot.Missing || snapshot.Error is not null) throw new IOException(snapshot.Error ?? "The SQL file no longer exists.");
            var profileId = await _workspace.GetFileConnectionAsync(filePath);
            Send(sender, new { type = "file.opened", path = filePath, fileName = Path.GetFileName(filePath), content = snapshot.Content, diskVersion = snapshot.Version, profileId, forceNew });
        }

        private async Task BindFileConnectionAsync(CoreWebView2 sender, string? requestId)
        {
            if (_activeFilePath is null) throw new InvalidOperationException("Save this SQL file in the active workspace before binding a connection.");
            if (_oracle.ProfileId is not { } profileId) throw new InvalidOperationException("Connect to an Oracle profile before binding this file.");
            if (!_workspace.IsUnderRoot(_activeFilePath)) throw new InvalidOperationException("This SQL file is outside the active workspace and cannot store a file connection.");
            await _workspace.SetFileConnectionAsync(_activeFilePath, profileId);
            Send(sender, new { type = "file.connectionBound", requestId, path = _activeFilePath, profileId });
        }

        private async Task OpenSqlFileAsync(CoreWebView2 sender)
        {
            var picker = new FileOpenPicker { SuggestedStartLocation = PickerLocationId.DocumentsLibrary };
            foreach (var extension in _workspace.WorkspaceSourceExtensions) picker.FileTypeFilter.Add(extension);
            InitializeWithWindow.Initialize(picker, OwnerWindowHandle);
            var file = await picker.PickSingleFileAsync();
            if (file is null) return;

            await OpenSqlFileAtPathAsync(sender, file.Path);
        }

        private async Task SaveSqlFileAsync(CoreWebView2 sender, string? requestId, JsonElement payload)
        {
            var save = NativeBridgeContract.ReadPayload<FileSavePayload>(payload);
            var content = save.Content;
            var path = save.Path;
            StorageFile? file = null;

            if (!string.IsNullOrWhiteSpace(path) && File.Exists(path))
            {
                file = await StorageFile.GetFileFromPathAsync(path);
            }
            else
            {
                var picker = new FileSavePicker { SuggestedStartLocation = PickerLocationId.DocumentsLibrary };
                picker.SuggestedFileName = save.FileName ?? "query.sql";
                var suggestedExtension = Path.GetExtension(save.FileName ?? "query.sql").ToLowerInvariant();
                var extensions = _workspace.WorkspaceSourceExtensions.OrderBy(extension => extension == suggestedExtension ? 0 : 1).ToList();
                picker.FileTypeChoices.Add("Oracle source file", extensions);
                InitializeWithWindow.Initialize(picker, OwnerWindowHandle);
                file = await picker.PickSaveFileAsync();
            }

            if (file is null)
            {
                Send(sender, new { type = "file.saveCancelled", requestId });
                return;
            }
            var expectedVersion = string.Equals(path, file.Path, StringComparison.OrdinalIgnoreCase) ? save.DiskVersion : null;
            if (expectedVersion is null && string.Equals(path, file.Path, StringComparison.OrdinalIgnoreCase))
            {
                var review = await Task.Run(() => WorkspaceFileService.ReadAsync(file.Path));
                if (review.Missing || review.Error is not null || review.Content != content)
                {
                    Send(sender, new { type = "file.conflict", requestId, path = file.Path, snapshot = review, baselineUnknown = true }); return;
                }
                expectedVersion = review.Version;
            }
            var savedSnapshot = await Task.Run(() => WorkspaceFileService.SaveAsync(file.Path, content, expectedVersion));
            if (savedSnapshot.Conflict) { Send(sender, new { type = "file.conflict", requestId, path = file.Path, snapshot = savedSnapshot }); return; }
            _activeFilePath = file.Path;
            if (_oracle.ProfileId is { } profileId) await _workspace.SetFileConnectionAsync(file.Path, profileId);
            Send(sender, new FileSavedReply
            {
                RequestId = requestId, Path = file.Path, FileName = file.Name,
                DiskVersion = savedSnapshot.Version, ProfileId = _oracle.ProfileId
            });
            await SendWorkspaceAsync(sender);
        }

    }
}
