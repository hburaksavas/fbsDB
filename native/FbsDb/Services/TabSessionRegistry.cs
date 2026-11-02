using System.Collections.Concurrent;
namespace FbsDb.Services;

public sealed class TabSession(string id) : IDisposable
{
    public string Id { get; } = id;
    public OracleSessionService Oracle { get; } = new();
    public string? FilePath { get; set; }
    public void Dispose() => Oracle.Dispose();
}
public sealed class TabSessionRegistry : IDisposable
{
    private readonly ConcurrentDictionary<string, TabSession> _tabs = new();
    private readonly ConcurrentDictionary<string, byte> _closed = new();
    public IEnumerable<TabSession> Sessions => _tabs.Values;
    public TabSession Get(string id)
    {
        if (string.IsNullOrWhiteSpace(id) || id.Length > 250) throw new InvalidOperationException("Invalid SQL tab identity.");
        if (_closed.ContainsKey(id)) throw new InvalidOperationException("This SQL tab has been closed.");
        return _tabs.GetOrAdd(id, key => new TabSession(key));
    }
    // A fresh frontend may reuse its starter identity after the old tab was
    // fully closed. Ordinary commands still pass through Get's tombstone check.
    public TabSession InitializeUiTab(string id)
    {
        if (string.IsNullOrWhiteSpace(id) || id.Length > 250) throw new InvalidOperationException("Invalid SQL tab identity.");
        _closed.TryRemove(id, out _);
        return Get(id);
    }
    public async Task CloseAsync(string id)
    {
        if (!_tabs.TryGetValue(id, out var tab)) return;
        tab.Oracle.CancelCurrentOperation();
        await tab.Oracle.DisconnectAsync(rollbackPending: false);
        if (_tabs.TryRemove(id, out var removed)) { _closed[id] = 0; removed.Dispose(); }
    }
    public void Dispose() { foreach (var tab in _tabs.Values) tab.Dispose(); _tabs.Clear(); }
}
