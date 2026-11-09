using System.Collections.Concurrent;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Web.WebView2.Core;
using FbsDb.Services;

namespace FbsDb;

// FI-007: one PL/SQL debug run per tab. The page enables debugging, then runs
// its statement with the ordinary sql.execute command; this side drives the
// debugger and reports each pause and the end as events.
public sealed partial class MainPage
{
    private sealed class DebugRun(string tabId, TabSession tab, PlsqlDebugger debugger)
    {
        public string TabId { get; } = tabId;
        public TabSession Tab { get; } = tab;
        public PlsqlDebugger Debugger { get; } = debugger;
        public CancellationTokenSource Stop { get; } = new();
        public volatile string State = "waiting";
        public int Ended;
    }

    private readonly ConcurrentDictionary<string, DebugRun> _debugRuns = new();
    private static readonly Regex DebugVariable = new(@"^[A-Za-z][A-Za-z0-9_$#]{0,127}(\.[A-Za-z][A-Za-z0-9_$#]{0,127}){0,3}$");

    // Events may come from the debugger's worker thread; WebViews are used on the UI thread only.
    private void PushDebug(DebugRun run, object value)
    {
        void Deliver() { if (WebViewFor(_owners.OwnerOf(run.TabId) ?? TabWindowOwnership.Main) is { } view) Send(view, value, run.Tab); }
        if (DispatcherQueue.HasThreadAccess) Deliver(); else DispatcherQueue.TryEnqueue(Deliver);
    }

    private static IEnumerable<(string Owner, string Name, string Type)> DebugObjects(JsonElement payload) =>
        payload.TryGetProperty("objects", out var objects) && objects.ValueKind == JsonValueKind.Array
            ? objects.EnumerateArray().Take(100).Select(item =>
            {
                var type = item.GetProperty("type").GetString() ?? "";
                if (!PlsqlDebugger.DebuggableTypes.Contains(type)) throw new InvalidOperationException($"{type} units cannot be debugged.");
                var owner = item.TryGetProperty("owner", out var o) && o.ValueKind == JsonValueKind.String && o.GetString() is { Length: > 0 } text ? PlsqlDebugger.Validate(text, "schema") : "";
                return (owner, PlsqlDebugger.Validate(item.GetProperty("name").GetString() ?? "", "unit"), type);
            }).ToArray()
            : [];

    private async Task<bool> IsProductionAsync(TabSession tab) =>
        (await _profiles.GetProfilesAsync()).FirstOrDefault(p => p.Id == tab.Oracle.ProfileId)?.Environment == "PROD";

    private async Task HandleDebugCommandAsync(NativeCommandContext context)
    {
        var (sender, id, payload, tab) = (context.Sender, context.RequestId, context.Payload, context.Tab);
        switch (context.Command)
        {
            case "debug.objects":
            {
                var states = await Task.Run(() => tab.Oracle.DebugObjectStatesAsync(DebugObjects(payload)));
                Send(sender, new { type = "debug.objects", requestId = id, production = await IsProductionAsync(tab), objects = states }, tab);
                break;
            }
            case "debug.compile":
                try
                {
                    // Recompiling changes shared database objects; never on a production connection.
                    if (await IsProductionAsync(tab)) throw new InvalidOperationException("Units are not recompiled for debugging on a PROD connection. Ask for them to be compiled with debug information, or debug on another environment.");
                    await Task.Run(() => tab.Oracle.CompileForDebugAsync(DebugObjects(payload)));
                    Send(sender, new { type = "debug.compiled", requestId = id, success = true }, tab);
                }
                catch (Exception error) when (error is InvalidOperationException or Oracle.ManagedDataAccess.Client.OracleException)
                { Send(sender, new { type = "debug.compiled", requestId = id, success = false, message = error.Message }, tab); }
                break;
            case "debug.start":
            {
                if (_debugRuns.ContainsKey(tab.Id)) throw new InvalidOperationException("This tab is already debugging.");
                if (_scriptRuns.ContainsKey(tab.Id) || _resultExports.ContainsKey(tab.Id)) throw new InvalidOperationException("Finish the running script or export before debugging.");
                var breakpoints = payload.TryGetProperty("breakpoints", out var list) && list.ValueKind == JsonValueKind.Array
                    ? list.EnumerateArray().Take(500).Select(item => new DebugBreakpoint(
                        PlsqlDebugger.Validate(item.GetProperty("owner").GetString() ?? "", "schema"), PlsqlDebugger.Validate(item.GetProperty("name").GetString() ?? "", "unit"),
                        PlsqlDebugger.DebuggableTypes.Contains(item.GetProperty("type").GetString() ?? "") ? item.GetProperty("type").GetString()! : throw new InvalidOperationException("Unsupported breakpoint unit."),
                        item.GetProperty("line").GetInt32() is var line and > 0 ? line : throw new InvalidOperationException("Invalid breakpoint line."))).ToArray()
                    : [];
                var sessionId = await Task.Run(() => tab.Oracle.EnableDebugAsync());
                PlsqlDebugger debugger;
                try { debugger = await Task.Run(() => tab.Oracle.AttachDebuggerAsync(sessionId, CancellationToken.None)); }
                catch { _ = tab.Oracle.DisableDebugAsync(); throw; }
                var run = new DebugRun(tab.Id, tab, debugger);
                _debugRuns[tab.Id] = run;
                Send(sender, new { type = "debug.ready", requestId = id }, tab);
                // Without breakpoints the run pauses where the first PL/SQL unit is entered.
                _ = DriveDebugAsync(run, async token =>
                {
                    await run.Debugger.WaitForStartAsync(token);
                    if (breakpoints.Length == 0) return await run.Debugger.ContinueAsync("into", token);
                    var results = await run.Debugger.SetBreakpointsAsync(breakpoints, token);
                    PushDebug(run, new { type = "debug.breakpoints", breakpoints = results });
                    return await run.Debugger.ContinueAsync("continue", token);
                });
                break;
            }
            case "debug.continue":
            {
                var run = PausedRun(tab.Id);
                var mode = payload.GetProperty("mode").GetString() ?? "";
                if (mode is not ("continue" or "over" or "into" or "out")) throw new InvalidOperationException("Unknown debugger step.");
                _ = DriveDebugAsync(run, token => run.Debugger.ContinueAsync(mode, token));
                break;
            }
            case "debug.values":
            {
                var run = PausedRun(tab.Id);
                var frame = payload.GetProperty("frame").GetInt32();
                var names = payload.GetProperty("names").EnumerateArray().Select(item => item.GetString() ?? "").Where(name => DebugVariable.IsMatch(name)).ToArray();
                var values = await Task.Run(() => run.Debugger.ValuesAsync(frame, names, CancellationToken.None));
                Send(sender, new { type = "debug.values", requestId = id, frame, values }, tab);
                break;
            }
            case "debug.source":
            {
                var run = PausedRun(tab.Id);
                var owner = PlsqlDebugger.Validate(payload.GetProperty("owner").GetString() ?? "", "schema");
                var name = PlsqlDebugger.Validate(payload.GetProperty("name").GetString() ?? "", "unit");
                var unitType = payload.GetProperty("unitType").GetString() ?? "";
                if (!PlsqlDebugger.DebuggableTypes.Contains(unitType)) throw new InvalidOperationException("This unit has no source to show.");
                var text = await Task.Run(() => run.Debugger.SourceAsync(owner, name, unitType, CancellationToken.None));
                Send(sender, new { type = "debug.source", requestId = id, owner, name, unitType, text }, tab);
                break;
            }
            case "debug.stop":
                StopDebug(tab.Id);
                break;
        }
    }

    private DebugRun PausedRun(string tabId) =>
        _debugRuns.TryGetValue(tabId, out var run) && run.State == "paused" ? run : throw new InvalidOperationException("The debugger is not paused.");

    private void StopDebug(string tabId)
    {
        if (!_debugRuns.TryGetValue(tabId, out var run)) return;
        // A paused target is told to abort its call; a running one stops waiting here and the page cancels its statement.
        if (run.State == "paused") _ = DriveDebugAsync(run, token => run.Debugger.ContinueAsync("abort", token));
        else run.Stop.Cancel();
    }

    private async Task DriveDebugAsync(DebugRun run, Func<CancellationToken, Task<DebugStop>> step)
    {
        run.State = "running";
        PushDebug(run, new { type = "debug.running" });
        try
        {
            var stop = await Task.Run(() => step(run.Stop.Token));
            if (stop.Terminated) { await EndDebugAsync(run, null); return; }
            run.State = "paused";
            PushDebug(run, new { type = "debug.paused", owner = stop.Owner, name = stop.Name, unitType = stop.Type, line = stop.Line, depth = stop.Depth, reason = stop.Reason, frames = stop.Frames });
        }
        catch (Exception error)
        {
            await EndDebugAsync(run, run.Stop.IsCancellationRequested ? "Debugging stopped." : error.Message);
        }
    }

    private async Task EndDebugAsync(DebugRun run, string? message)
    {
        if (Interlocked.Exchange(ref run.Ended, 1) == 1) return;
        run.State = "ended";
        _debugRuns.TryRemove(new KeyValuePair<string, DebugRun>(run.TabId, run));
        PushDebug(run, new { type = "debug.ended", message });
        // The statement may still make calls of its own; they pass through until it ends and DEBUG_OFF runs.
        try { await run.Tab.Oracle.FinishDebugAsync(run.Debugger); }
        catch (Exception error) { System.Diagnostics.Debug.WriteLine(error.Message); }
        try { await run.Debugger.DisposeAsync(); } catch (Exception error) { System.Diagnostics.Debug.WriteLine(error.Message); }
        run.Stop.Dispose();
    }
}
