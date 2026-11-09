using FbsDb.Bridge;
using System.Collections.Concurrent;
using System.Diagnostics;
using System.Text;
using System.Text.Json;
using Microsoft.UI.Xaml.Controls;
using Microsoft.Web.WebView2.Core;
using Microsoft.UI.Xaml;
using Windows.Storage;
using Windows.Storage.Pickers;
using WinRT.Interop;
using FbsDb.Services;
using Oracle.ManagedDataAccess.Client;

// To learn more about WinUI, the WinUI project structure,
// and more about our project templates, see: http://aka.ms/winui-project-info.

namespace FbsDb;

/// <summary>
/// The main content page displayed inside the application window.
/// Add your UI logic, event handlers, and data binding here.
/// </summary>
public sealed partial class MainPage : Page
{
    private readonly Microsoft.UI.Xaml.Media.Animation.Storyboard StartupEntrance = new();
    private readonly Microsoft.UI.Xaml.Media.Animation.Storyboard StartupBreathing = new();
    private readonly ConcurrentDictionary<string, CancellationTokenSource> _scriptRuns = new();
    private readonly ScriptSourceReviewGate _scriptSourceReviews = new();
    private readonly ConcurrentDictionary<string, CancellationTokenSource> _resultExports = new();
    private readonly ConcurrentDictionary<string, CancellationTokenSource> _gridApplies = new();
    private readonly ConcurrentDictionary<string, CancellationTokenSource> _completionRequests = new();
    private readonly ConcurrentDictionary<string, CancellationTokenSource> _schemaRequests = new();
    private readonly TnsProfileService _profiles = new();
    private readonly TabSessionRegistry _sessions = new();
    private readonly OracleSessionService _credentials = new();
    private readonly WorkspaceService _workspace = new();
    private readonly SemaphoreSlim _workspaceCommands = new(1, 1);
    private double _interfaceScale = 1;
    private WorkspaceDevelopmentService? _development;
    private WorkspaceDevelopmentService Development => LazyInitializer.EnsureInitialized(ref _development, () => new(_workspace));
    private IReadOnlyList<ConnectionProfile>? _startupProfiles;
    private Microsoft.UI.Dispatching.DispatcherQueueTimer? _idleTimer;
    public MainPage()
    {
        Current = this;
        InitializeComponent();
        WorkspaceFileService.PreviousVersionCaptured = (path, previous) => LocalHistoryService.Capture(path, previous);
        RequestedTheme = NativeTheme.RequestedTheme;
        EditorWebView.DefaultBackgroundColor = NativeTheme.Color("--bg");
        _idleTimer = DispatcherQueue.CreateTimer();
        _idleTimer.Interval = TimeSpan.FromSeconds(30);
        _idleTimer.Tick += async (_, _) => {
            foreach (var tab in _sessions.Sessions) {
                if (_scriptRuns.ContainsKey(tab.Id) || _resultExports.ContainsKey(tab.Id)) continue;
                try { if (await tab.Oracle.SuspendIfIdleAsync(TimeSpan.FromMinutes(10)))
                    Post(WebViewFor(_owners.OwnerOf(tab.Id) ?? TabWindowOwnership.Main), JsonSerializer.Serialize(new { type="connection.inactive", tabId=tab.Id }));
                } catch (Exception error) { Debug.WriteLine(error.Message); }
            }
        };
        _idleTimer.Start();
        Unloaded += (_, _) => _idleTimer.Stop();
        SizeChanged += (_, _) => ApplyInterfaceScale();
        var entrance = new Microsoft.UI.Xaml.Media.Animation.DoubleAnimation
        {
            From = 0, To = 1, Duration = new Duration(TimeSpan.FromMilliseconds(450))
        };
        Microsoft.UI.Xaml.Media.Animation.Storyboard.SetTarget(entrance, StartupBrand);
        Microsoft.UI.Xaml.Media.Animation.Storyboard.SetTargetProperty(entrance, "Opacity");
        StartupEntrance.Children.Add(entrance);
        var breathing = new Microsoft.UI.Xaml.Media.Animation.DoubleAnimation
        {
            From = 0.40, To = 0.85, Duration = new Duration(TimeSpan.FromSeconds(1.6)),
            AutoReverse = true, RepeatBehavior = Microsoft.UI.Xaml.Media.Animation.RepeatBehavior.Forever,
            EasingFunction = new Microsoft.UI.Xaml.Media.Animation.SineEase
            { EasingMode = Microsoft.UI.Xaml.Media.Animation.EasingMode.EaseInOut }
        };
        Microsoft.UI.Xaml.Media.Animation.Storyboard.SetTarget(breathing, StartupDatabase);
        Microsoft.UI.Xaml.Media.Animation.Storyboard.SetTargetProperty(breathing, "Opacity");
        StartupBreathing.Children.Add(breathing);
        Loaded += OnLoaded;
        Unloaded += (_, _) => StopStartupAnimation();
    }

    private void ApplyInterfaceScale()
    {
        // Scale the XAML host rather than CSS so WebView coordinates, fixed
        // popovers, native hit testing and the logical viewport stay consistent.
        if (_interfaceScale == 1)
        {
            EditorWebView.RenderTransform = null;
            EditorWebView.Width = double.NaN; EditorWebView.Height = double.NaN;
            EditorWebView.HorizontalAlignment = HorizontalAlignment.Stretch;
            EditorWebView.VerticalAlignment = VerticalAlignment.Stretch;
            return;
        }
        EditorWebView.HorizontalAlignment = HorizontalAlignment.Left;
        EditorWebView.VerticalAlignment = VerticalAlignment.Top;
        EditorWebView.Width = Math.Max(1, ActualWidth / _interfaceScale);
        EditorWebView.Height = Math.Max(1, ActualHeight / _interfaceScale);
        EditorWebView.RenderTransform = new Microsoft.UI.Xaml.Media.ScaleTransform { ScaleX = _interfaceScale, ScaleY = _interfaceScale };
    }

    private void StopStartupAnimation()
    {
        StartupEntrance.Stop();
        StartupBreathing.Stop();
    }

    private async void OnLoaded(object sender, RoutedEventArgs e)
    {
        if (new Windows.UI.ViewManagement.UISettings().AnimationsEnabled)
        {
            StartupEntrance.Begin();
            StartupBreathing.Begin();
        }
        try
        {
            UpdateStartupProgress(0, 0, "Reading workspace settings…", 10);
            await _workspace.RestoreAsync();
            UpdateStartupProgress(1, 1, "Loading saved connections…", 30);
            _startupProfiles = await _profiles.GetProfilesAsync();
            UpdateStartupProgress(2, 2, "Starting SQL editor…", 64);
            await EditorWebView.EnsureCoreWebView2Async();
            EditorWebView.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
            EditorWebView.CoreWebView2.Settings.IsStatusBarEnabled = false;
            EditorWebView.CoreWebView2.Settings.IsPasswordAutosaveEnabled = false;
            EditorWebView.CoreWebView2.Settings.IsGeneralAutofillEnabled = false;
            EditorWebView.CoreWebView2.NavigationStarting += OnNavigationStarting;
            EditorWebView.CoreWebView2.WebMessageReceived += OnWebMessageReceived;
            EditorWebView.CoreWebView2.NavigationCompleted += (_, _) =>
            {
                StartupStatus.Text = "Loading the SQL workbench…";
                EditorWebView.CoreWebView2.PostWebMessageAsJson("{\"type\":\"host.ready\"}");
            };

            var webContent = Path.Combine(AppContext.BaseDirectory, "WebContent");
            var editorPath = Path.Combine(webContent, "index.html");
            if (!File.Exists(editorPath))
            {
                StopStartupAnimation();
                StartupOverlay.Visibility = Visibility.Collapsed;
                EditorError.Text = $"The editor bundle is missing: {editorPath}";
                EditorErrorPanel.Visibility = Visibility.Visible;
                MainWindow.Current?.ShowWorkbench();
                return;
            }

            EditorWebView.CoreWebView2.SetVirtualHostNameToFolderMapping("fbsdb.local", webContent, CoreWebView2HostResourceAccessKind.DenyCors);
            EditorWebView.Source = new Uri("https://fbsdb.local/index.html");
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"WebView2 initialization failed: {ex}");
            StopStartupAnimation();
                StartupOverlay.Visibility = Visibility.Collapsed;
            EditorError.Text = $"The editor could not start. Install or update Microsoft Edge WebView2 Runtime.\n\n{ex.Message}";
            EditorErrorPanel.Visibility = Visibility.Visible;
            MainWindow.Current?.ShowWorkbench();
        }
    }

    private void OnNavigationStarting(CoreWebView2 sender, CoreWebView2NavigationStartingEventArgs args) => GuardNavigation(args);
    internal static void GuardNavigation(CoreWebView2NavigationStartingEventArgs args)
    {
        if (!Uri.TryCreate(args.Uri, UriKind.Absolute, out var target) || target.Scheme != Uri.UriSchemeHttps || !string.Equals(target.Host, "fbsdb.local", StringComparison.OrdinalIgnoreCase))
            args.Cancel = true;
    }

    private void UpdateStartupProgress(int completedSteps, int activeStep, string status, double progress)
    {
        SetStartupStep(0, completedSteps, activeStep, WorkspaceStepPending, WorkspaceStepDone, WorkspaceStepCheck, WorkspaceStepRunning, WorkspaceStepLabel, WorkspaceStepState);
        SetStartupStep(1, completedSteps, activeStep, ConnectionsStepPending, ConnectionsStepDone, ConnectionsStepCheck, ConnectionsStepRunning, ConnectionsStepLabel, ConnectionsStepState);
        SetStartupStep(2, completedSteps, activeStep, EditorStepPending, EditorStepDone, EditorStepCheck, EditorStepRunning, EditorStepLabel, EditorStepState);
        SetStartupStep(3, completedSteps, activeStep, DriverStepPending, DriverStepDone, DriverStepCheck, DriverStepRunning, DriverStepLabel, DriverStepState);
        StartupStatus.Text = status;
        StartupPercent.Text = $"{(int)progress}%";
        StartupProgress.Value = progress;
    }

    private static void SetStartupStep(int index, int completedSteps, int activeStep, UIElement pending, UIElement done,
        UIElement check, UIElement running, TextBlock label, TextBlock state)
    {
        var isDone = index < completedSteps;
        var isRunning = index == activeStep;
        pending.Visibility = isDone || isRunning ? Visibility.Collapsed : Visibility.Visible;
        done.Visibility = isDone ? Visibility.Visible : Visibility.Collapsed;
        check.Visibility = isDone ? Visibility.Visible : Visibility.Collapsed;
        running.Visibility = isRunning ? Visibility.Visible : Visibility.Collapsed;
        state.Text = isDone ? "DONE" : isRunning ? "RUNNING" : string.Empty;
        label.FontWeight = isRunning ? Microsoft.UI.Text.FontWeights.SemiBold : Microsoft.UI.Text.FontWeights.Normal;
        label.Foreground = NativeTheme.Brush(isRunning ? "--foreground" : "--muted");
    }

    private void OnWebMessageReceived(CoreWebView2 sender, CoreWebView2WebMessageReceivedEventArgs args) => HandleWebMessage(sender, args, TabWindowOwnership.Main);

    // Every window's WebView reports here, so all windows share one session
    // registry; windowId says which window sent the message.
    internal async void HandleWebMessage(CoreWebView2 sender, CoreWebView2WebMessageReceivedEventArgs args, string windowId)
    {
        string? requestId = null;
        string? receivedCommand = null;
        var workspaceLock = false;
        TabSession? tab = null;
        try
        {
            if (!Uri.TryCreate(args.Source, UriKind.Absolute, out var source) || source.Host != "fbsdb.local") return;
            using var message = JsonDocument.Parse(args.TryGetWebMessageAsString());
            var root = message.RootElement;
            var tabId = root.TryGetProperty("tabId", out var tabValue) && tabValue.ValueKind == JsonValueKind.String ? tabValue.GetString()! : "tab-1";
            var type = root.TryGetProperty("type", out var typeValue) ? typeValue.GetString() : null;
            if (type == "ui.ready")
            {
                tab = _sessions.InitializeUiTab(tabId);
                _owners.Claim(tabId, windowId);
                if (windowId != TabWindowOwnership.Main)
                {
                    Post(sender, "{\"type\":\"host.ready\"}");
                    await SendProfilesAsync(sender);
                    await SendWorkspaceStateAsync(sender, null);
                    Send(sender, WindowList(windowId));
                    return;
                }
                UpdateStartupProgress(3, 3, "Preparing Oracle driver…", 88);
                Post(sender, "{\"type\":\"host.ready\"}");
                await SendProfilesAsync(sender);
                await SendWorkspaceAsync(sender);
                await Task.Run(() => _ = typeof(OracleConnection).Assembly.GetName());
                UpdateStartupProgress(4, -1, "Workspace ready", 100);
                StopStartupAnimation();
                StartupOverlay.Visibility = Visibility.Collapsed;
                MainWindow.Current?.ShowWorkbench();
                return;
            }

            if (type != "command") return;
            requestId = root.TryGetProperty("id", out var idValue) && idValue.ValueKind == JsonValueKind.String ? idValue.GetString() : null;
            var envelope = NativeBridgeContract.ReadCommand(root);
            tabId = envelope.TabId;
            var id = envelope.Id;
            var command = envelope.Command;
            // UI preferences and locale are process-wide and may arrive before
            // ui.ready after a WebView reload. They need no SQL tab/session.
            // Moving a tab names that tab; its ownership is checked by the move itself.
            var sessionless = NativeBridgeContract.HandlerFor(command) == "ui" && command != "window.moveTab";
            tab = _sessions.Get(sessionless ? "ui-bootstrap" : tabId);
            if (!sessionless && command != "window.moveTab") _owners.Claim(tabId, windowId);
            receivedCommand = command;
            // Cancellation must reach its token without waiting for the operation's session gate.
            if (NativeBridgeContract.RequiresSessionResume(command)) {
                var wasInactive = tab.Oracle.IsInactive;
                await tab.Oracle.ResumeIfInactiveAsync();
                if (wasInactive) Send(sender, new { type="connection.resumed", tabId, requestId=id }, tab);
            }

            receivedCommand = command;
            var payload = envelope.Payload;
            Debug.WriteLine($"fbsDB UI command: {command}");

            if (_scriptRuns.ContainsKey(tabId) && command is "sql.execute" or "script.execute" or "sql.fetchNext" or "sql.explain" or "connection.connect" or "connection.disconnect" or "tab.close" or "transaction.commit" or "transaction.rollback" or "result.export" or "analysis.begin" or "analysis.end") throw new InvalidOperationException("Finish or cancel this tab's script first.");
            if (_resultExports.ContainsKey(tabId) && command is "script.execute" or "sql.execute" or "sql.fetchNext" or "sql.explain" or "connection.connect" or "analysis.begin" or "analysis.end") throw new InvalidOperationException("Finish or cancel the streaming export first.");
            if (command is "tab.close" or "connection.disconnect" && _resultExports.TryGetValue(tabId, out var closingExport)) closingExport.Cancel();
            if (command is "tab.close" or "connection.disconnect" or "connection.connect") StopDebug(tabId);
            if (_debugRuns.ContainsKey(tabId) && command is "script.execute" or "sql.explain" or "connection.connect" or "transaction.commit" or "transaction.rollback" or "analysis.begin") throw new InvalidOperationException("Stop debugging first.");
            if (command is "tab.close" or "connection.disconnect" or "connection.connect")
                foreach (var request in _completionRequests.Where(item => item.Key.StartsWith(tabId + ":", StringComparison.Ordinal))) { try { request.Value.Cancel(); } catch (ObjectDisposedException) { } }
            if (command is "tab.close" or "connection.disconnect" or "connection.connect")
                foreach (var request in _schemaRequests.Where(item => item.Key.StartsWith(tabId + ":", StringComparison.Ordinal))) { try { request.Value.Cancel(); } catch (ObjectDisposedException) { } }
            if (command.StartsWith("workspace.", StringComparison.Ordinal))
            {
                await _workspaceCommands.WaitAsync(); workspaceLock = true;
                EnsureWorkspaceRoot(payload);
            }
            var context = new NativeCommandContext(sender, id, command!, payload, tab, windowId);
            NativeCommandHandler handler = NativeBridgeContract.HandlerFor(command) switch
            {
                "file" => new FileCommandHandler(this, context),
                "workspace" => new WorkspaceCommandHandler(this, context),
                "oracle" => new OracleCommandHandler(this, context),
                "ui" => new UiCommandHandler(this, context),
                _ => throw new InvalidOperationException($"Unsupported desktop command: {command}")
            };
            await handler.HandleAsync();
            if (command == "tab.close" && !_sessions.Contains(tabId)) _owners.Release(tabId);
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"fbsDB WebView message failed: {ex.Message}");
            try
            {
                if (receivedCommand?.StartsWith("workspace.", StringComparison.Ordinal) == true)
                    Send(sender, new { type = "workspace.error", requestId, message = ex.Message }, tab);
                else PostError(sender, requestId, ex.Message, tab);
            }
            catch (Exception replyError) { Debug.WriteLine($"fbsDB error reply failed: {replyError.Message}"); }
        }
        finally { if (workspaceLock) _workspaceCommands.Release(); }
    }

    private async Task SendProfilesAsync(CoreWebView2 sender, string? requestId = null, TabSession? tab = null)
    {
        var startupProfiles = _startupProfiles;
        _startupProfiles = null;
        var response = await Task.Run(async () =>
        {
            var profiles = startupProfiles ?? await _profiles.GetProfilesAsync();
            var organization = await _profiles.GetOrganizationAsync();
            var items = new List<object>(profiles.Count);
            foreach (var p in profiles)
            {
                var savedCredentials = await _credentials.GetSavedCredentialsAsync(p.Id);
                items.Add(new
                {
                    id = p.Id, nls = p.Nls, name = p.Name, method = p.Method, targetType = p.TargetType, descriptor = p.Method == "descriptor" ? p.Descriptor : "", alias = p.Alias, user = p.User, available = p.Available, host = p.Host, port = p.Port, service = p.Service, source = p.Source,
                    env = p.Environment, duplicate = p.Duplicate,
                    ssh = p.Ssh is { } ssh ? new { host = ssh.Host, port = ssh.Port, user = ssh.User, keyFile = ssh.KeyFile } : null,
                    folderId = organization["assignments"]?[p.Id]?["folderId"]?.GetValue<string>(),
                    groups = organization["groups"]!.AsArray().OfType<System.Text.Json.Nodes.JsonObject>().Where(g => organization["assignments"]?[p.Id]?["groupIds"]?.AsArray().Any(id => id?.GetValue<string>() == g["id"]?.GetValue<string>()) == true).Select(g => g["name"]!.GetValue<string>()).ToArray(),
                    hasSavedCredentials = savedCredentials is not null, savedUser = savedCredentials?.User
                });
            }
            return new { items, organization };
        });
        await SendAsync(sender, new { type = "connection.profiles", requestId, profiles = response.items, organization = response.organization, aliases = (await _profiles.GetAliasesAsync()).Select(a => new { id = a.Id, source = a.Source, host = a.Host, port = a.Port, service = a.Service, duplicate = a.Duplicate }) }, tab);
    }

    private void EnsureWorkspaceRoot(JsonElement payload)
    {
        if (payload.TryGetProperty("root", out var expected) && !string.Equals(expected.GetString(), _workspace.Root, StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("The workspace changed. Retry in the current workspace.");
    }

    private async Task SendWorkspaceAsync(CoreWebView2 sender, TabSession? tab = null)
    {
        // The file watcher reports to the main window, which owns the workspace.
        if (ReferenceEquals(sender, EditorWebView.CoreWebView2))
        {
            try { EnsureWorkspaceWatcher(sender); }
            catch (Exception watcherError) { _workspaceWatcher?.Dispose(); _workspaceWatcher = null; Debug.WriteLine("Workspace watcher: " + watcherError.Message); }
        }
        await SendWorkspaceStateAsync(sender, tab);
    }

    private async Task SendWorkspaceStateAsync(CoreWebView2 sender, TabSession? tab)
    {
        var root = _workspace.Root;
        await _workspace.LoadProjectRulesAsync();
        var projectRules = _workspace.ProjectRules;
        var fileConnections = await _workspace.GetFileConnectionsAsync();
        var catalog = await Task.Run(() => _workspace.Catalog);
        var files = await Task.Run(() => _workspace.ListSqlFiles());
        IReadOnlyList<WorkspaceEntry> entries = []; string? error = null;
        try { entries = await Task.Run(() => _workspace.ListDirectory()); }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException) { error = ex.Message; }
        if (root is not null && !Directory.Exists(root)) error = "Workspace folder unavailable. Locate it or retry.";
        await SendAsync(sender, new { type = "workspace.state", root, name = _workspace.DisplayName, files, entries, recent = _workspace.Recent, catalog, error, projectRules, fileConnections }, tab);
    }

    private static readonly JsonSerializerOptions WebJsonOptions = NativeBridgeContract.JsonOptions;
    private static string SerializeReply(object value, TabSession? tab)
    {
        var node = JsonSerializer.SerializeToNode(value, WebJsonOptions)!.AsObject();
        if (tab is not null) { node["tabId"] = tab.Id; node["autoCommit"] = tab.Oracle.AutoCommit; }
        NativeBridgeContract.ValidateReply(node);
        return node.ToJsonString();
    }
    private static void Send(CoreWebView2 sender, object value, TabSession? tab = null) => Post(sender, SerializeReply(value, tab));
    // A reply can outlive the window that asked: a closed WebView refuses
    // messages with an invalid-state error, which must not end the process.
    internal static void Post(CoreWebView2? target, string json)
    {
        if (target is null) return;
        try { target.PostWebMessageAsJson(json); }
        catch (Exception error) when (error is System.Runtime.InteropServices.COMException or ObjectDisposedException or InvalidOperationException)
        { Debug.WriteLine($"Reply not delivered to a closed window: {error.Message}"); }
    }
    private static async Task SendAsync(CoreWebView2 sender, object value, TabSession? tab = null)
    {
        var json = await Task.Run(() => SerializeReply(value, tab));
        Post(sender, json);
    }

    private static void PostError(CoreWebView2 sender, string? requestId, string message, TabSession? tab = null)
    {
        Send(sender, new HostErrorReply { RequestId = requestId, Message = message, TransactionPending = tab?.Oracle.HasPendingTransaction }, tab);
    }

    protected override void OnNavigatedFrom(Microsoft.UI.Xaml.Navigation.NavigationEventArgs e)
    {
        _sessions.Dispose();
        _credentials.Dispose();
        base.OnNavigatedFrom(e);
    }
}
