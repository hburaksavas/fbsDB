namespace FbsDb.Services;

// Records which application window owns each SQL tab's database session.
// All windows share one process and one TabSessionRegistry; ownership decides
// which window may send commands for a tab and where its events are delivered.
public sealed class TabWindowOwnership
{
    public const string Main = "main";
    private readonly Dictionary<string, string> _owners = new(StringComparer.Ordinal);
    private readonly object _gate = new();
    private int _nextWindow = 2;

    public static string Label(string windowId) =>
        windowId == Main ? "Main Window" : windowId.StartsWith('w') && int.TryParse(windowId.AsSpan(1), out var number) ? $"Window {number}" : windowId;

    public static bool IsWindowId(string? value) =>
        value == Main || value is { Length: > 1 } && value[0] == 'w' && int.TryParse(value.AsSpan(1), out var number) && number >= 2;

    public string NextWindowId() { lock (_gate) return $"w{_nextWindow++}"; }

    public string? OwnerOf(string tabId) { lock (_gate) return _owners.TryGetValue(tabId, out var owner) ? owner : null; }

    // A tab belongs to the first window that uses it. Another window's command
    // for it is refused, so one session never has two editors.
    public void Claim(string tabId, string windowId)
    {
        lock (_gate)
        {
            if (!_owners.TryGetValue(tabId, out var owner)) { _owners[tabId] = windowId; return; }
            if (owner != windowId) throw new InvalidOperationException($"This tab's session belongs to {Label(owner)}. Use that window or move the tab back first.");
        }
    }

    public void Move(string tabId, string fromWindow, string toWindow)
    {
        lock (_gate)
        {
            if (_owners.TryGetValue(tabId, out var owner) && owner != fromWindow) throw new InvalidOperationException($"This tab's session belongs to {Label(owner)}.");
            _owners[tabId] = toWindow;
        }
    }

    public void Release(string tabId) { lock (_gate) _owners.Remove(tabId); }

    public IReadOnlyList<string> TabsOf(string windowId) { lock (_gate) return _owners.Where(item => item.Value == windowId).Select(item => item.Key).ToArray(); }

    // Every tab of a closing window goes back to the main window with its session.
    public IReadOnlyList<string> ReturnToMain(string windowId)
    {
        lock (_gate)
        {
            var tabs = _owners.Where(item => item.Value == windowId).Select(item => item.Key).ToArray();
            foreach (var tab in tabs) _owners[tab] = Main;
            return tabs;
        }
    }
}
