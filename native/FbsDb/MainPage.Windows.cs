using System.Text.Json;
using Microsoft.Web.WebView2.Core;
using WinRT.Interop;
using FbsDb.Services;

namespace FbsDb;

// Moving SQL tabs between application windows. A tab's database session,
// open cursors and transaction stay in this process; only the owning window
// changes. The tab's documents and fetched results travel as an opaque
// transfer text from the old window's page to the new window's page.
public sealed partial class MainPage
{
    public static MainPage? Current { get; private set; }
    private readonly TabWindowOwnership _owners = new();
    private readonly Dictionary<string, SqlWindow> _sqlWindows = new(StringComparer.Ordinal);
    private bool _closeMainWhenAlone;

    internal CoreWebView2? WebViewFor(string windowId) =>
        windowId == TabWindowOwnership.Main ? EditorWebView.CoreWebView2 : _sqlWindows.TryGetValue(windowId, out var window) ? window.Core : null;

    internal nint WindowHandle(string windowId) =>
        windowId != TabWindowOwnership.Main && _sqlWindows.TryGetValue(windowId, out var window) ? WindowNative.GetWindowHandle(window)
        : MainWindow.Current is { } main ? WindowNative.GetWindowHandle(main) : 0;

    internal void ApplyWindowThemes() { foreach (var window in _sqlWindows.Values) window.ApplyTheme(); }

    private IEnumerable<string> OpenWindowIds() => new[] { TabWindowOwnership.Main }.Concat(_sqlWindows.Keys);

    private object WindowList(string current) => new
    {
        type = "window.list", current, label = TabWindowOwnership.Label(current),
        windows = OpenWindowIds().Select(id => new { id, label = TabWindowOwnership.Label(id) }).ToArray()
    };

    private void BroadcastWindows()
    {
        foreach (var id in OpenWindowIds())
        {
            try { if (WebViewFor(id) is { } view) Send(view, WindowList(id)); }
            catch (Exception error) { System.Diagnostics.Debug.WriteLine($"Window list not delivered to {id}: {error.Message}"); }
        }
    }

    private void ActivateWindow(string windowId)
    {
        if (windowId == TabWindowOwnership.Main) MainWindow.Current?.Activate();
        else if (_sqlWindows.TryGetValue(windowId, out var window)) window.Activate();
    }

    private void HandleWindowCommand(NativeCommandContext context)
    {
        var sender = context.Sender; var payload = context.Payload; var from = context.WindowId;
        string? Text(string name) => payload.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() : null;
        switch (context.Command)
        {
            case "window.state":
                Send(sender, WindowList(from));
                break;
            case "window.focus":
            {
                var target = Text("target");
                if (target is null || !OpenWindowIds().Contains(target)) throw new InvalidOperationException("That window is closed.");
                ActivateWindow(target);
                break;
            }
            case "window.moveTab":
                try { MoveTabs(context, Text("target") ?? "", Text("transfer") ?? "", payload.TryGetProperty("closeWindow", out var close) && close.ValueKind == JsonValueKind.True); }
                catch (InvalidOperationException error)
                {
                    if (_sqlWindows.TryGetValue(from, out var refusing)) refusing.CloseRefused();
                    _closeMainWhenAlone = false;
                    Send(sender, new { type = "window.moveFailed", requestId = context.RequestId, tabId = context.Tab.Id, message = error.Message });
                }
                break;
            case "window.close":
                if (_sqlWindows.TryGetValue(from, out var empty)) _ = ForceCloseAsync(empty);
                break;
            case "window.closeCancelled":
                // The page refused to close (running work); the user sees its reason there.
                _closeMainWhenAlone = false;
                if (_sqlWindows.TryGetValue(from, out var busy)) { busy.CloseRefused(); busy.Activate(); }
                break;
        }
    }

    private void MoveTabs(NativeCommandContext context, string target, string transfer, bool closeWindow)
    {
        var from = context.WindowId;
        if (target == from) throw new InvalidOperationException("The tab is already in this window.");
        if (target != "new" && !OpenWindowIds().Contains(target)) throw new InvalidOperationException("That window is closed. Choose another window.");
        if (closeWindow && from == TabWindowOwnership.Main) throw new InvalidOperationException("The main window stays open.");
        if (transfer.Length == 0) throw new InvalidOperationException("Nothing to move.");
        var tabIds = new List<string> { context.Tab.Id };
        if (context.Payload.TryGetProperty("tabIds", out var ids) && ids.ValueKind == JsonValueKind.Array)
            tabIds.AddRange(ids.EnumerateArray().Where(item => item.ValueKind == JsonValueKind.String).Select(item => item.GetString()!).Where(id => id.Length is > 0 and <= 250));
        tabIds = tabIds.Distinct(StringComparer.Ordinal).ToList();
        foreach (var tabId in tabIds)
        {
            if (_scriptRuns.ContainsKey(tabId)) throw new InvalidOperationException("Finish or cancel this tab's script before moving it.");
            if (_resultExports.ContainsKey(tabId)) throw new InvalidOperationException("Finish or cancel the streaming export before moving the tab.");
            if (_gridApplies.ContainsKey(tabId)) throw new InvalidOperationException("Wait for the grid changes to finish applying before moving the tab.");
            var owner = _owners.OwnerOf(tabId);
            if (owner is not null && owner != from) throw new InvalidOperationException($"This tab's session belongs to {TabWindowOwnership.Label(owner)}.");
        }
        var destination = target == "new" ? _owners.NextWindowId() : target;
        foreach (var tabId in tabIds) _owners.Move(tabId, from, destination);
        Send(context.Sender, new { type = "window.moved", requestId = context.RequestId, tabId = context.Tab.Id, target = destination, label = TabWindowOwnership.Label(destination) });
        if (target == "new")
        {
            var window = new SqlWindow(destination, TabWindowOwnership.Label(destination), transfer);
            _sqlWindows[destination] = window;
            window.Closed += (_, _) => OnSqlWindowClosed(destination);
            window.Activate();
        }
        else
        {
            if (WebViewFor(destination) is { } view)
                Send(view, new { type = "window.incoming", transfer, from, fromLabel = TabWindowOwnership.Label(from) });
            if (!closeWindow || !_closeMainWhenAlone) ActivateWindow(destination);
        }
        if (closeWindow && _sqlWindows.TryGetValue(from, out var closing)) closing.CloseNow();
        BroadcastWindows();
    }

    // Closing without the page's cooperation (it did not answer, or it said it
    // has nothing left) closes the sessions that window still owns.
    private async Task ForceCloseAsync(SqlWindow window)
    {
        foreach (var tabId in _owners.TabsOf(window.Id))
        {
            try { await _sessions.CloseAsync(tabId); } catch (Exception error) { System.Diagnostics.Debug.WriteLine(error.Message); }
            _owners.Release(tabId);
        }
        window.CloseNow();
    }

    internal void ForceCloseWindow(SqlWindow window) => _ = ForceCloseAsync(window);

    private void OnSqlWindowClosed(string windowId)
    {
        _sqlWindows.Remove(windowId);
        BroadcastWindows();
        if (_closeMainWhenAlone && _sqlWindows.Count == 0)
        {
            // Give the main page a moment to take in the returned tabs and save its drafts.
            var timer = DispatcherQueue.CreateTimer();
            timer.Interval = TimeSpan.FromMilliseconds(600);
            timer.IsRepeating = false;
            timer.Tick += (_, _) => MainWindow.Current?.Close();
            timer.Start();
        }
    }

    // Called when the main window is asked to close. Other windows first hand
    // their tabs back to the main window; the main window closes after them.
    internal bool CloseOtherWindowsFirst()
    {
        if (_sqlWindows.Count == 0) return false;
        _closeMainWhenAlone = true;
        foreach (var window in _sqlWindows.Values.ToArray()) window.RequestClose();
        return true;
    }
}
