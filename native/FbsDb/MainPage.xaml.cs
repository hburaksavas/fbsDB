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
    private readonly ConcurrentDictionary<string, CancellationTokenSource> _resultExports = new();
    private readonly ConcurrentDictionary<string, CancellationTokenSource> _completionRequests = new();
    private readonly TnsProfileService _profiles = new();
    private readonly TabSessionRegistry _sessions = new();
    private readonly OracleSessionService _credentials = new();
    private static readonly AsyncLocal<TabSession?> CommandTab = new();
    private OracleSessionService _oracle => CommandTab.Value?.Oracle ?? _credentials;
    private readonly WorkspaceService _workspace = new();
    private double _interfaceScale = 1;
    private WorkspaceDevelopmentService? _development;
    private WorkspaceDevelopmentService Development => LazyInitializer.EnsureInitialized(ref _development, () => new(_workspace));
    private IReadOnlyList<ConnectionProfile>? _startupProfiles;
    private string? _activeFilePath { get => CommandTab.Value?.FilePath; set { if (CommandTab.Value is { } tab) tab.FilePath = value; } }
    private Microsoft.UI.Dispatching.DispatcherQueueTimer? _idleTimer;
    public MainPage()
    {
        InitializeComponent();
        _idleTimer = DispatcherQueue.CreateTimer();
        _idleTimer.Interval = TimeSpan.FromSeconds(30);
        _idleTimer.Tick += async (_, _) => {
            foreach (var tab in _sessions.Sessions) {
                if (_scriptRuns.ContainsKey(tab.Id) || _resultExports.ContainsKey(tab.Id)) continue;
                try { if (await tab.Oracle.SuspendIfIdleAsync(TimeSpan.FromMinutes(10)))
                    EditorWebView.CoreWebView2?.PostWebMessageAsJson(JsonSerializer.Serialize(new { type="connection.inactive", tabId=tab.Id }));
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
                EditorError.Visibility = Visibility.Visible;
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
            EditorError.Visibility = Visibility.Visible;
            MainWindow.Current?.ShowWorkbench();
        }
    }

    private void OnNavigationStarting(CoreWebView2 sender, CoreWebView2NavigationStartingEventArgs args)
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
        label.Foreground = new Microsoft.UI.Xaml.Media.SolidColorBrush(isRunning ? Microsoft.UI.Colors.White : Microsoft.UI.Colors.LightSlateGray);
    }

    private async void OnWebMessageReceived(CoreWebView2 sender, CoreWebView2WebMessageReceivedEventArgs args)
    {
        string? requestId = null;
        string? receivedCommand = null;
        try
        {
            if (!Uri.TryCreate(args.Source, UriKind.Absolute, out var source) || source.Host != "fbsdb.local") return;
            using var message = JsonDocument.Parse(args.TryGetWebMessageAsString());
            var root = message.RootElement;
            var tabId = root.TryGetProperty("tabId", out var tabValue) && tabValue.ValueKind == JsonValueKind.String ? tabValue.GetString()! : "tab-1";
            CommandTab.Value = _sessions.Get(tabId);
            var type = root.TryGetProperty("type", out var typeValue) ? typeValue.GetString() : null;
            if (type == "ui.ready")
            {
                UpdateStartupProgress(3, 3, "Preparing Oracle driver…", 88);
                sender.PostWebMessageAsJson("{\"type\":\"host.ready\"}");
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
            var id = root.TryGetProperty("id", out var idValue) ? idValue.GetString() : null;
            requestId = id;
            var command = root.TryGetProperty("command", out var commandValue) ? commandValue.GetString() : null;
            receivedCommand = command;
            if (command is not null && command != "sql.cancel" && (command.StartsWith("sql.") || command.StartsWith("schema.") || command.StartsWith("completion.") || command is "script.execute" or "analysis.begin" or "session.nls" or "result.related" or "result.children" or "result.columnDefinition")) {
                var wasInactive = _oracle.IsInactive;
                await _oracle.ResumeIfInactiveAsync();
                if (wasInactive) Send(sender, new { type="connection.resumed", tabId, requestId=id });
            }

            receivedCommand = command;
            var payload = root.TryGetProperty("payload", out var payloadValue) ? payloadValue : default;
            Debug.WriteLine($"fbsDB UI command: {command}");

            if (_scriptRuns.ContainsKey(tabId) && command is "sql.execute" or "script.execute" or "sql.fetchNext" or "sql.explain" or "connection.connect" or "connection.disconnect" or "tab.close" or "transaction.commit" or "transaction.rollback" or "result.export" or "analysis.begin" or "analysis.end") throw new InvalidOperationException("Finish or cancel this tab's script first.");
            if (_resultExports.ContainsKey(tabId) && command is "script.execute" or "sql.execute" or "sql.fetchNext" or "sql.explain" or "connection.connect" or "analysis.begin" or "analysis.end") throw new InvalidOperationException("Finish or cancel the streaming export first.");
            if (command is "tab.close" or "connection.disconnect" && _resultExports.TryGetValue(tabId, out var closingExport)) closingExport.Cancel();
            if (command is "tab.close" or "connection.disconnect" or "connection.connect")
                foreach (var request in _completionRequests.Where(item => item.Key.StartsWith(tabId + ":", StringComparison.Ordinal))) { try { request.Value.Cancel(); } catch (ObjectDisposedException) { } }
            switch (command)
            {
                case "ui.setZoom":
                    if (payload.TryGetProperty("factor", out var zoom) && zoom.TryGetDouble(out var factor) && double.IsFinite(factor) && factor >= 0.8 && factor <= 1.5)
                    {
                        _interfaceScale = factor;
                        ApplyInterfaceScale();
                    }
                    break;
                case "system.locale":
                    Send(sender, new
                    {
                        type = "system.locale",
                        requestId = id,
                        uiLanguage = System.Globalization.CultureInfo.CurrentUICulture.Name,
                        region = System.Globalization.CultureInfo.CurrentCulture.Name,
                        datePattern = System.Globalization.CultureInfo.CurrentCulture.DateTimeFormat.ShortDatePattern,
                        decimalSeparator = System.Globalization.CultureInfo.CurrentCulture.NumberFormat.NumberDecimalSeparator,
                        thousandSeparator = System.Globalization.CultureInfo.CurrentCulture.NumberFormat.NumberGroupSeparator
                    });
                    break;
                case "tab.close":
                    try { await _sessions.CloseAsync(tabId); Send(sender, new { type = "tab.closed", requestId = id }); }
                    catch (Exception ex) { Send(sender, new { type = "tab.closeFailed", requestId = id, message = ex.Message, transactionPending = _oracle.HasPendingTransaction }); }
                    break;
                case "workspace.git":
                    try { var state = await Task.Run(() => Development.GitStateAsync()); Send(sender,new {type="workspace.git",requestId=id,state}); }
                    catch(Exception error){ Send(sender,new {type="workspace.git",requestId=id,error=error.Message}); }
                    break;
                case "workspace.gitDiff":
                    try { var diff = await Task.Run(() => Development.GitDiffAsync(payload.GetProperty("path").GetString()!)); Send(sender,new {type="workspace.gitDiff",requestId=id,diff}); }
                    catch(Exception error){ Send(sender,new {type="workspace.gitDiff",requestId=id,error=error.Message}); }
                    break;
                case "workspace.replacePreview":
                case "workspace.replaceApply":
                    try {
                        var excluded=payload.GetProperty("excluded").EnumerateArray().Select(item=>item.GetString()!).ToArray();
                        if(command=="workspace.replacePreview") { var preview=await Task.Run(()=>Development.PreviewReplaceAsync(payload.GetProperty("search").GetString()!,payload.GetProperty("replacement").GetString()??"",payload.GetProperty("caseSensitive").GetBoolean(),excluded)); Send(sender,new {type="workspace.replacePreview",requestId=id,preview}); }
                        else { var selected=payload.GetProperty("selected").EnumerateArray().Select(item=>item.GetString()!).ToArray();var result=await Task.Run(()=>Development.ApplyReplaceAsync(payload.GetProperty("previewId").GetString()!,selected,excluded)); Send(sender,new {type="workspace.replaceApply",requestId=id,result}); }
                    } catch(Exception error){ Send(sender,new {type=command,requestId=id,error=error.Message}); }
                    break;
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
                case "file.bindConnection":
                    await BindFileConnectionAsync(sender, id);
                    break;
                case "connection.list":
                    await SendProfilesAsync(sender, id);
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
                    var entry = await Task.Run(() => _workspace.CreateEntryAsync(payload.GetProperty("parent").GetString()!, payload.GetProperty("name").GetString()!, payload.GetProperty("directory").GetBoolean()));
                    Send(sender, new { type = "workspace.changed", requestId = id, root = _workspace.Root, entry });
                    await SendWorkspaceAsync(sender);
                    break;
                case "workspace.moveEntry":
                    var movedSource = Path.GetFullPath(payload.GetProperty("path").GetString()!);
                    var destination = Path.GetFullPath(payload.GetProperty("destination").GetString()!);
                    await Task.Run(() => _workspace.MoveEntryAsync(movedSource, destination));
                    foreach (var tab in _sessions.Sessions)
                        if (WorkspaceService.RemapPath(tab.FilePath, movedSource, destination) is { } mapped) tab.FilePath = mapped;
                    Send(sender, new { type = "workspace.changed", requestId = id, root = _workspace.Root, source = movedSource, destination });
                    await SendWorkspaceAsync(sender);
                    break;
                case "workspace.create":
                    await CreateWorkspaceAsync(sender);
                    break;
                case "workspace.refresh":
                    await SendWorkspaceAsync(sender);
                    break;
                case "workspace.search":
                {
                    var query = payload.TryGetProperty("query", out var queryValue) && queryValue.ValueKind == JsonValueKind.String ? queryValue.GetString() ?? string.Empty : string.Empty;
                    var search = await Task.Run(() => _workspace.SearchSqlFiles(query));
                    await SendAsync(sender, new { type = "workspace.searchResults", requestId = id, results = search.Matches, search.Truncated });
                    break;
                }
                case "connection.save":
                case "connection.delete":
                case "connection.test":
                    await ManageConnectionAsync(sender, id, command, payload);
                    break;
                case "connection.connect":
                    await ConnectAsync(sender, id, payload);
                    break;
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
                    if(Uri.TryCreate(payload.GetProperty("url").GetString(),UriKind.Absolute,out var url)&&url.Scheme is "http" or "https")await Windows.System.Launcher.LaunchUriAsync(url);
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
                    InitializeWithWindow.Initialize(picker, WindowNative.GetWindowHandle(MainWindow.Current!));
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
                case "sql.explain":
                    await ExplainSqlAsync(sender, id, payload);
                    break;
                case "sql.cancel":
                    if (_scriptRuns.TryGetValue(tabId, out var runningScript)) { try { runningScript.Cancel(); } catch (ObjectDisposedException) { } }
                    var active = _oracle.CancelCurrentOperation();
                    Send(sender, new { type = "sql.cancelled", requestId = id, complete = !active, active, transactionPending = _oracle.HasPendingTransaction });
                    break;
                case "transaction.commit":
                    await Task.Run(() => _oracle.CommitAsync());
                    Send(sender, new { type = "transaction.state", state = "committed", pending = false, requestId = id });
                    break;
                case "transaction.rollback":
                    await Task.Run(() => _oracle.RollbackAsync());
                    Send(sender, new { type = "transaction.state", state = "rolled back", pending = false, requestId = id });
                    break;
                case "schema.refresh":
                    await SendSchemaAsync(sender, id);
                    break;
                case "completion.vocabulary":
                    await SendCompletionVocabularyAsync(sender, id);
                    break;
                case "completion.metadata":
                case "completion.definition":
                case "completion.systemObjects":
                case "completion.objectAnalysis":
                case "completion.plscope":
                    await SendLanguageMetadataAsync(sender, id, command, payload);
                    break;
                case "completion.cancel":
                    var cancelledId = payload.GetProperty("requestId").GetString();
                    if (_completionRequests.TryGetValue($"{CommandTab.Value?.Id}:{cancelledId}", out var metadataCancellation)) { try { metadataCancellation.Cancel(); } catch (ObjectDisposedException) { } }
                    break;
                case "schema.tableDetails":
                    await SendTableDetailsAsync(sender, id, payload);
                    break;
                case "schema.objectDetails":
                    await SendTableDetailsAsync(sender, id, payload, objectDetails: true);
                    break;
                default:
                    PostError(sender, id, $"Unsupported desktop command: {command}");
                    break;
            }
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"fbsDB WebView message failed: {ex.Message}");
            if (receivedCommand?.StartsWith("workspace.", StringComparison.Ordinal) == true)
                Send(sender, new { type = "workspace.error", requestId, message = ex.Message });
            else PostError(sender, requestId, ex.Message);
        }
    }

    private async Task SendProfilesAsync(CoreWebView2 sender, string? requestId = null)
    {
        var startupProfiles = _startupProfiles;
        _startupProfiles = null;
        var response = await Task.Run(async () =>
        {
            var profiles = startupProfiles ?? await _profiles.GetProfilesAsync();
            var groups = await _profiles.GetConnectionGroupsAsync();
            var items = new List<object>(profiles.Count);
            foreach (var p in profiles)
            {
                var savedCredentials = await _oracle.GetSavedCredentialsAsync(p.Id);
                items.Add(new
                {
                    id = p.Id, nls = p.Nls, name = p.Name, method = p.Method, targetType = p.TargetType, descriptor = p.Method == "descriptor" ? p.Descriptor : "", alias = p.Alias, user = p.User, available = p.Available, host = p.Host, port = p.Port, service = p.Service, source = p.Source,
                    env = p.Environment, group = groups.TryGetValue(p.Id, out var customGroup) ? customGroup : null, duplicate = p.Duplicate,
                    hasSavedCredentials = savedCredentials is not null, savedUser = savedCredentials?.User
                });
            }
            return items;
        });
        await SendAsync(sender, new { type = "connection.profiles", requestId, profiles = response, aliases = (await _profiles.GetAliasesAsync()).Select(a => new { id = a.Id, source = a.Source, host = a.Host, port = a.Port, service = a.Service, duplicate = a.Duplicate }) });
    }

    private async Task ManageConnectionAsync(CoreWebView2 sender, string? requestId, string command, JsonElement payload)
    {
        string Read(string key) => payload.TryGetProperty(key, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() ?? "" : "";
        ConnectionDiagnosticReport? diagnostics = null;
        try
        {
            var profileId = Read("profileId");
            if (command == "connection.delete")
            {
                if (_sessions.Sessions.Any(tab => tab.Oracle.ProfileId == profileId)) throw new InvalidOperationException("Disconnect this profile in all tabs before deleting it.");
                await _profiles.DeleteProfileAsync(profileId);
                await _oracle.DeleteCredentialsAsync(profileId);
            }
            else if (command == "connection.save")
            {
                if (_sessions.Sessions.Any(tab => tab.Oracle.ProfileId == profileId)) throw new InvalidOperationException("Disconnect this profile in all tabs before editing it.");
                var old = (await _profiles.GetProfilesAsync()).FirstOrDefault(p => p.Id == profileId);
                profileId = await _profiles.SaveProfileAsync(string.IsNullOrEmpty(profileId) ? null : profileId, Read("name"), Read("alias"), Read("source"), Read("user"), Read("environment"), Read("method") is { Length: > 0 } method ? method : "tns", Read("host"), Read("port"), Read("service"), Read("targetType"), Read("descriptor"));
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
        InitializeWithWindow.Initialize(picker, WindowNative.GetWindowHandle(MainWindow.Current!));
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
        await Task.Run(() => _oracle.ConnectAsync(profile, user, password, remember));
        await SendProfilesAsync(sender);
        if (_activeFilePath is not null) await _workspace.SetFileConnectionAsync(_activeFilePath, profile.Id);
        Send(sender, new { type = "connection.connected", requestId, serverVersion = _oracle.ServerVersion, profile = new { id = profile.Id, nls = profile.Nls, host = profile.Host, port = profile.Port, service = profile.Service, env = profile.Environment } });
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
        var key = $"{CommandTab.Value?.Id}:{requestId}";
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

    private async Task OpenWorkspaceAsync(CoreWebView2 sender)
    {
        var picker = new FolderPicker { SuggestedStartLocation = PickerLocationId.DocumentsLibrary };
        picker.FileTypeFilter.Add("*");
        InitializeWithWindow.Initialize(picker, WindowNative.GetWindowHandle(MainWindow.Current!));
        var folder = await picker.PickSingleFolderAsync();
        if (folder is null) return;
        await _workspace.SetRootAsync(folder.Path);
        await SendWorkspaceAsync(sender);
    }

    private async Task CreateWorkspaceAsync(CoreWebView2 sender)
    {
        var picker = new FolderPicker { SuggestedStartLocation = PickerLocationId.DocumentsLibrary };
        picker.FileTypeFilter.Add("*");
        InitializeWithWindow.Initialize(picker, WindowNative.GetWindowHandle(MainWindow.Current!));
        var parent = await picker.PickSingleFolderAsync();
        if (parent is null) return;

        var nameInput = new TextBox { PlaceholderText = "sql-workspace", Text = "sql-workspace" };
        var dialog = new ContentDialog
        {
            Title = "Create SQL workspace",
            Content = nameInput,
            PrimaryButtonText = "Create workspace",
            CloseButtonText = "Cancel",
            DefaultButton = ContentDialogButton.Primary,
            XamlRoot = XamlRoot,
        };
        if (await dialog.ShowAsync() != ContentDialogResult.Primary) return;
        var name = nameInput.Text.Trim();
        if (string.IsNullOrWhiteSpace(name) || name.IndexOfAny(Path.GetInvalidFileNameChars()) >= 0 || name is "." or "..")
            throw new InvalidOperationException("Enter a valid workspace folder name.");
        var path = Path.Combine(parent.Path, name);
        Directory.CreateDirectory(path);
        await _workspace.SetRootAsync(path);
        await SendWorkspaceAsync(sender);
    }

    private async Task SendWorkspaceAsync(CoreWebView2 sender)
    {
        var root = _workspace.Root;
        var files = await Task.Run(() => _workspace.ListSqlFiles());
        var entries = await Task.Run(() => _workspace.ListDirectory());
        await SendAsync(sender, new { type = "workspace.state", root, name = root is null ? "No workspace" : Path.GetFileName(root), files, entries, recent = _workspace.Recent });
    }

    private async Task OpenSqlFilePathAsync(CoreWebView2 sender, JsonElement payload)
    {
        var path = payload.TryGetProperty("path", out var value) ? value.GetString() : null;
        if (string.IsNullOrWhiteSpace(path) || !File.Exists(path)) throw new FileNotFoundException("SQL file no longer exists.", path);
        await OpenSqlFileAtPathAsync(sender, path);
    }

    private async Task OpenSqlFileAtPathAsync(CoreWebView2 sender, string path)
    {
        var filePath = Path.GetFullPath(path);
        var content = await File.ReadAllTextAsync(filePath);
        var profileId = await _workspace.GetFileConnectionAsync(filePath);
        Send(sender, new { type = "file.opened", path = filePath, fileName = Path.GetFileName(filePath), content, profileId });
    }

    private async Task BindFileConnectionAsync(CoreWebView2 sender, string? requestId)
    {
        if (_activeFilePath is null) throw new InvalidOperationException("Save this SQL file in the active workspace before binding a connection.");
        if (_oracle.ProfileId is not { } profileId) throw new InvalidOperationException("Connect to an Oracle profile before binding this file.");
        if (!_workspace.IsUnderRoot(_activeFilePath)) throw new InvalidOperationException("This SQL file is outside the active workspace and cannot store a file connection.");
        await _workspace.SetFileConnectionAsync(_activeFilePath, profileId);
        Send(sender, new { type = "file.connectionBound", requestId, path = _activeFilePath, profileId });
    }

    private async Task SendSchemaAsync(CoreWebView2 sender, string? requestId = null)
    {
        Send(sender, new { type = "schema.loading" });
        try
        {
            var snapshot = await Task.Run(() => _oracle.LoadSchemaAsync());
            await SendAsync(sender, new { type = "schema.loaded", requestId, schema = snapshot.Owner, objects = snapshot.Objects });
        }
        catch (Exception ex)
        {
            Send(sender, new { type = "schema.error", requestId, message = ex.Message });
        }
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
        var tabId = CommandTab.Value!.Id;
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
                Send(sender, new { type = "script.step", requestId, index, sql, offset, status = "Running", transactionPending = _oracle.HasPendingTransaction });
                var timer = Stopwatch.StartNew();
                var step = JsonSerializer.SerializeToElement(new { sql, scriptIndex = index, parameters = statement.TryGetProperty("parameters", out var parameters) ? parameters : JsonSerializer.SerializeToElement(Array.Empty<object>()), pageSize = payload.TryGetProperty("pageSize", out var page) ? page.GetInt32() : 1000, timeoutSeconds = payload.TryGetProperty("timeoutSeconds", out var timeout) ? timeout.GetInt32() : 0 });
                SqlExecutionResult? stepResult = null; string? stepError = null;
                var success = await ExecuteSqlAsync(sender, requestId, step, cancellation.Token, result => stepResult = result, error => stepError = error);
                completed++; if (!success) failed++;
                Send(sender, new { type = "script.step", requestId, index, sql, offset, status = cancellation.IsCancellationRequested ? "Cancelled" : success ? "Succeeded" : "Failed", elapsedMs = timer.ElapsedMilliseconds, transactionPending = _oracle.HasPendingTransaction, rowsAffected = stepResult?.RowsAffected, returnedRows = stepResult?.ReturnedRows, resultId = stepResult?.ResultId, error = stepError });
                if (cancellation.IsCancellationRequested || !success && !continueOnError) break;
            }
        }
        finally
        {
            _scriptRuns.TryRemove(tabId, out _);
            Send(sender, new { type = "script.completed", requestId, completed, failed, cancelled = cancellation.IsCancellationRequested, transactionPending = _oracle.HasPendingTransaction });
        }
    }

    private async Task<bool> ExecuteSqlAsync(CoreWebView2 sender, string? requestId, JsonElement payload, CancellationToken cancellationToken = default, Action<SqlExecutionResult>? onResult = null, Action<string>? onError = null)
    {
        var sql = payload.TryGetProperty("sql", out var sqlValue) ? sqlValue.GetString() ?? string.Empty : string.Empty;
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
                if (!string.IsNullOrWhiteSpace(name) && !string.IsNullOrWhiteSpace(type)) parameters.Add(new SqlBindParameter(name, type, value));
            }
        }
        if (OracleSqlUnit.CompilationTarget(sql) is null && payload.TryGetProperty("previousResultId", out var previousResult) && previousResult.ValueKind == JsonValueKind.String) await _oracle.CloseResultAsync(previousResult.GetString()!);
        SqlExecutionResult result;
        var timeout = payload.TryGetProperty("timeoutSeconds", out var timeoutValue) && timeoutValue.TryGetInt32(out var seconds) ? Math.Clamp(seconds, 0, 86400) : 0;
        var stageTabId = CommandTab.Value!.Id;
        int? scriptIndex = payload.TryGetProperty("scriptIndex",out var scriptIndexValue) ? scriptIndexValue.GetInt32() : null;
        var progress = new Progress<string>(stage => sender.PostWebMessageAsJson(SerializeReply(new { type = "sql.stage", requestId, stage, scriptIndex }, stageTabId)));
        try { result = await Task.Run(() => _oracle.ExecuteAsync(sql, parameters, rowLimit, cancellationToken, timeoutSeconds: timeout, progress: progress)); }
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
            Send(sender, new { type = "host.error", requestId, message = ex.Message, transactionPending = _oracle.HasPendingTransaction });
            return false;
        }
        onResult?.Invoke(result);
        if (OracleSqlUnit.CompilationTarget(sql) is not null)
        {
            try
            {
                var compilation = await Task.Run(() => _oracle.LoadCompilationDiagnosticsAsync(sql, cancellationToken));
                await SendAsync(sender, new { type = "sql.compilation", requestId, compilation, result.ElapsedMs, result.TransactionPending, result.Output });
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
            result.ElapsedMs, result.ReturnedRows, result.Truncated, result.TransactionPending, result.Output, result.SqlId, result.ResultId, result.HasMore, result.PageSize, result.Offset,
            profileId = _oracle.ProfileId
        });
        return true;
    }

    private async Task ExportResultAsync(CoreWebView2 sender, string? requestId, JsonElement payload)
    {
        var tabId = CommandTab.Value!.Id;
        using var cancellation = new CancellationTokenSource();
        if (!_resultExports.TryAdd(tabId, cancellation)) throw new InvalidOperationException("An export is already running for this SQL tab.");
        var resultId = payload.TryGetProperty("resultId", out var idValue) ? idValue.GetString() : null;
        var consumed = false; var count = 0; string? temporaryPath = null;
        try {
            var format=payload.TryGetProperty("format",out var formatValue)?formatValue.GetString()??"csv":"csv";
            if(format is not ("csv" or "csv.gz" or "xlsx"))throw new InvalidOperationException("Unsupported export format.");
            var extension=format=="xlsx"?".xlsx":format=="csv.gz"?".csv.gz":".csv";
            var picker = new FileSavePicker { SuggestedStartLocation = PickerLocationId.DocumentsLibrary, SuggestedFileName = payload.TryGetProperty("fileName", out var name) ? name.GetString() ?? "results"+extension : "results"+extension };
            picker.FileTypeChoices.Add(format.ToUpperInvariant(), new List<string> { format=="csv.gz"?".gz":extension });
            InitializeWithWindow.Initialize(picker, WindowNative.GetWindowHandle(MainWindow.Current!));
            var file = await picker.PickSaveFileAsync();
            if (file is null) { Send(sender, new { type = "result.exportComplete", requestId, resultId, consumed, message = "Export cancelled." }); return; }
            temporaryPath = file.Path + "." + Guid.NewGuid().ToString("N") + ".partial";
            var columns = payload.GetProperty("columns").EnumerateArray().Select(c => c.GetProperty("name").GetString() ?? "").ToArray();
            var initialRows = payload.GetProperty("rows").EnumerateArray().Select(row => row.EnumerateArray().Select(cell => cell.ValueKind == JsonValueKind.Null ? null : cell.ValueKind == JsonValueKind.Number ? (object?)cell.GetDecimal() : cell.ValueKind==JsonValueKind.Object&&cell.TryGetProperty("base64",out var binary)?binary.GetString():cell.ValueKind == JsonValueKind.String ? cell.GetString() : cell.ToString()).ToArray());
            var hasMore = payload.TryGetProperty("hasMore", out var more) && more.GetBoolean();
            if(format=="xlsx") {
                var metadata=JsonSerializer.Deserialize<SqlColumn[]>(payload.GetProperty("columns").GetRawText(),WebJsonOptions)??[];
                var materialized=initialRows.ToArray();
                await Task.Run(()=>{using var output=File.Create(temporaryPath);ResultXlsxExporter.Write(output,metadata,materialized,cancellation.Token,payload.TryGetProperty("includeMetadata",out var includeMetadata)&&includeMetadata.GetBoolean());},cancellation.Token);
                count=materialized.Length;
            } else {
                await using var fileStream=File.Create(temporaryPath);
                await using Stream stream=format=="csv.gz"?new System.IO.Compression.GZipStream(fileStream,System.IO.Compression.CompressionLevel.Optimal,true):fileStream;
                var csvOptions=payload.TryGetProperty("csvOptions",out var csvValue)?JsonSerializer.Deserialize<CsvExportOptions>(csvValue.GetRawText(),WebJsonOptions):null;
                var encodingName=csvValue.ValueKind==JsonValueKind.Object&&csvValue.TryGetProperty("encoding",out var encodingValue)?encodingValue.GetString():"utf-8";
                var bom=csvValue.ValueKind!=JsonValueKind.Object||!csvValue.TryGetProperty("bom",out var bomValue)||bomValue.GetBoolean();
                Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
                var encoding=encodingName=="utf-16"?new UnicodeEncoding(false,bom,true):encodingName=="windows-1254"?Encoding.GetEncoding(1254,EncoderFallback.ExceptionFallback,DecoderFallback.ExceptionFallback):new UTF8Encoding(bom,true);
                await using var writer=new StreamWriter(stream,encoding,1024,true);
                count = await ResultCsvExporter.WriteAsync(writer, columns, initialRows,
                    hasMore && !string.IsNullOrEmpty(resultId) ? async token => { consumed = true; return await Task.Run(() => _oracle.FetchNextPageAsync(resultId, 1000, token)); } : null,
                    written => SendAsync(sender, new { type = "result.exportProgress", requestId, resultId, rowsWritten = written, message = $"{written:N0} rows written…" }), cancellation.Token,csvOptions);
                await writer.FlushAsync(cancellation.Token);
            }
            cancellation.Token.ThrowIfCancellationRequested(); File.Move(temporaryPath, file.Path, true); temporaryPath = null;
            Send(sender, new { type = "result.exportComplete", requestId, resultId, consumed, rowsWritten = count, message = $"Exported {count:N0} rows to {file.Name}." });
        }
        catch (OperationCanceledException) { Send(sender, new { type = "result.exportComplete", requestId, resultId, consumed, rowsWritten = count, message = "Export cancelled. Partial file removed." }); }
        catch (Exception ex) { Send(sender, new { type = "result.exportComplete", requestId, resultId, consumed, message = "Export failed: " + ex.Message }); }
        finally { if (temporaryPath is not null) { try { File.Delete(temporaryPath); } catch (IOException) { } } _resultExports.TryRemove(tabId, out _); }
    }

    private async Task FetchSqlPageAsync(CoreWebView2 sender, string? requestId, JsonElement payload)
    {
        var resultId = payload.GetProperty("resultId").GetString() ?? "";
        var size = payload.TryGetProperty("pageSize", out var sizeValue) && sizeValue.TryGetInt32(out var requested) ? Math.Clamp(requested, 100, 10000) : 1000;
        try
        {
            var result = await Task.Run(() => _oracle.FetchNextPageAsync(resultId, size));
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
        JsonValueKind.Object when value.TryGetProperty("base64",out var bytes) => Convert.FromBase64String(bytes.GetString()??""),
        _ => value.ToString()
    };
    private static readonly JsonSerializerOptions WebJsonOptions = new(JsonSerializerDefaults.Web);
    private static string SerializeReply(object value, string? tabId)
    {
        var node = JsonSerializer.SerializeToNode(value, WebJsonOptions)!.AsObject();
        if (tabId is not null) node["tabId"] = tabId;
        return node.ToJsonString();
    }
    private static void Send(CoreWebView2 sender, object value) => sender.PostWebMessageAsJson(SerializeReply(value, CommandTab.Value?.Id));
    private static async Task SendAsync(CoreWebView2 sender, object value)
    {
        var tabId = CommandTab.Value?.Id;
        var json = await Task.Run(() => SerializeReply(value, tabId));
        sender.PostWebMessageAsJson(json);
    }

    private async Task OpenSqlFileAsync(CoreWebView2 sender)
    {
        var picker = new FileOpenPicker { SuggestedStartLocation = PickerLocationId.DocumentsLibrary };
        picker.FileTypeFilter.Add(".sql");
        InitializeWithWindow.Initialize(picker, WindowNative.GetWindowHandle(MainWindow.Current!));
        var file = await picker.PickSingleFileAsync();
        if (file is null) return;

        await OpenSqlFileAtPathAsync(sender, file.Path);
    }

    private async Task SaveSqlFileAsync(CoreWebView2 sender, string? requestId, JsonElement payload)
    {
        var content = payload.TryGetProperty("content", out var contentValue) ? contentValue.GetString() ?? string.Empty : string.Empty;
        var path = payload.TryGetProperty("path", out var pathValue) && pathValue.ValueKind == JsonValueKind.String
            ? pathValue.GetString()
            : null;
        StorageFile? file = null;

        if (!string.IsNullOrWhiteSpace(path) && File.Exists(path))
        {
            file = await StorageFile.GetFileFromPathAsync(path);
        }
        else
        {
            var picker = new FileSavePicker { SuggestedStartLocation = PickerLocationId.DocumentsLibrary };
            picker.SuggestedFileName = payload.TryGetProperty("fileName", out var nameValue) ? nameValue.GetString() ?? "query.sql" : "query.sql";
            picker.FileTypeChoices.Add("SQL file", new List<string> { ".sql" });
            InitializeWithWindow.Initialize(picker, WindowNative.GetWindowHandle(MainWindow.Current!));
            file = await picker.PickSaveFileAsync();
        }

        if (file is null)
        {
            Send(sender, new { type = "file.saveCancelled", requestId });
            return;
        }
        await File.WriteAllTextAsync(file.Path, content, new UTF8Encoding(false));
        _activeFilePath = file.Path;
        if (_oracle.ProfileId is { } profileId) await _workspace.SetFileConnectionAsync(file.Path, profileId);
        Send(sender, new
        {
            type = "file.saved",
            requestId,
            path = file.Path,
            fileName = file.Name,
            profileId = _oracle.ProfileId
        });
        await SendWorkspaceAsync(sender);
    }

    private static void PostError(CoreWebView2 sender, string? requestId, string message)
    {
        Send(sender, new { type = "host.error", requestId, message, transactionPending = CommandTab.Value?.Oracle.HasPendingTransaction });
    }

    protected override void OnNavigatedFrom(Microsoft.UI.Xaml.Navigation.NavigationEventArgs e)
    {
        _sessions.Dispose();
        _credentials.Dispose();
        base.OnNavigatedFrom(e);
    }
}
