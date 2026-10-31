using Microsoft.Web.WebView2.Core;

namespace FbsDb;

public sealed partial class MainPage
{
    private FileSystemWatcher? _workspaceWatcher;
    private string? _watchedWorkspaceRoot;
    private Microsoft.UI.Dispatching.DispatcherQueueTimer? _workspaceWatchTimer;
    private bool _workspaceWatchAttached, _workspaceWatchBusy, _workspaceWatchDirty;

    private void EnsureWorkspaceWatcher(CoreWebView2 sender)
    {
        if (!_workspaceWatchAttached)
        {
            _workspaceWatchAttached = true;
            Unloaded += (_, _) => { _workspaceWatcher?.Dispose(); _workspaceWatcher = null; _workspaceWatchTimer?.Stop(); };
        }
        var root = _workspace.Root;
        if (string.Equals(root, _watchedWorkspaceRoot, StringComparison.OrdinalIgnoreCase) && _workspaceWatcher is not null) return;
        _workspaceWatcher?.Dispose(); _workspaceWatcher = null; _workspaceWatchTimer?.Stop(); _watchedWorkspaceRoot = root;
        if (root is null || !Directory.Exists(root)) return;
        var watcher = new FileSystemWatcher(root) { IncludeSubdirectories = true, NotifyFilter = NotifyFilters.FileName | NotifyFilters.DirectoryName | NotifyFilters.LastWrite };
        _workspaceWatcher = watcher;
        _workspaceWatchTimer = DispatcherQueue.CreateTimer(); _workspaceWatchTimer.Interval = TimeSpan.FromMilliseconds(650);
        _workspaceWatchTimer.Tick += async (_, _) =>
        {
            if (_workspaceWatchBusy) return;
            _workspaceWatchTimer?.Stop();
            if (!_workspaceWatchDirty || !ReferenceEquals(watcher, _workspaceWatcher)) return;
            _workspaceWatchBusy = true; _workspaceWatchDirty = false;
            await _workspaceCommands.WaitAsync();
            try { if (string.Equals(root, _workspace.Root, StringComparison.OrdinalIgnoreCase)) await SendWorkspaceAsync(sender); }
            catch (Exception error) { System.Diagnostics.Debug.WriteLine("Workspace refresh: " + error.Message); }
            finally { _workspaceCommands.Release(); _workspaceWatchBusy = false; }
        };
        void Changed(string path)
        {
            var relative = Path.GetRelativePath(root, path);
            if (relative != "." && relative.Split(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar).Any(part => part.StartsWith('.') || part is "bin" or "obj" or "node_modules")) return;
            DispatcherQueue.TryEnqueue(() => { if (!ReferenceEquals(watcher, _workspaceWatcher)) return; _workspaceWatchDirty = true; _workspaceWatchTimer?.Start(); });
        }
        watcher.Created += (_, args) => Changed(args.FullPath);
        watcher.Deleted += (_, args) => Changed(args.FullPath);
        watcher.Changed += (_, args) => Changed(args.FullPath);
        watcher.Renamed += (_, args) => { Changed(args.OldFullPath); Changed(args.FullPath); };
        watcher.Error += (_, _) => Changed(root);
        watcher.EnableRaisingEvents = true;
    }
}
