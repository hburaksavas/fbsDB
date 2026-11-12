using System.Text.Json;
using Microsoft.UI.Windowing;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.Web.WebView2.Core;
using Windows.Graphics;

namespace FbsDb;

// A lightweight SQL window that holds tabs moved out of the main window: tab
// strip, editor and results only. Its page talks to the shared MainPage, which
// keeps every window's database sessions.
public sealed class SqlWindow : Window
{
    private readonly WebView2 _view;
    private readonly string _label;
    private string? _transfer;
    private string? _bootstrapScript;
    private bool _closeAllowed;
    private DateTimeOffset? _closeRequestedAt;
    private bool _closing;

    public string Id { get; }
    // Nothing is sent to a page whose window is closing.
    public CoreWebView2? Core => _closing ? null : _view.CoreWebView2;

    public SqlWindow(string id, string label, string transfer)
    {
        Id = id; _label = label; _transfer = transfer;
        Title = $"fbsDB · {label}";
        _view = new WebView2 { DefaultBackgroundColor = NativeTheme.Color("--bg") };
        Content = new Grid { Background = NativeTheme.Brush("--bg"), RequestedTheme = NativeTheme.RequestedTheme, Children = { _view } };
        AppWindow.SetIcon(Path.Combine(AppContext.BaseDirectory, "Assets", "AppIcon.ico"));
        ApplyTheme();
        if (MainWindow.Current is { } main)
        {
            var area = DisplayArea.GetFromWindowId(main.AppWindow.Id, DisplayAreaFallback.Primary).WorkArea;
            int width = Math.Min(1280, area.Width - 80), height = Math.Min(860, area.Height - 80);
            AppWindow.MoveAndResize(new RectInt32(area.X + (area.Width - width) / 2 + 40, area.Y + (area.Height - height) / 2 + 30, width, height));
        }
        AppWindow.Closing += OnClosing;
        // Release the page at once so no stale editor page outlives its window.
        Closed += (_, _) => _view.Close();
        _ = InitializeAsync();
    }

    public void ApplyTheme()
    {
        if (Content is Grid root) { root.RequestedTheme = NativeTheme.RequestedTheme; root.Background = NativeTheme.Brush("--bg"); }
        var titleBar = AppWindow.TitleBar;
        titleBar.BackgroundColor = titleBar.ButtonBackgroundColor = NativeTheme.Color("--chrome");
        titleBar.ForegroundColor = titleBar.ButtonForegroundColor = NativeTheme.Color("--foreground");
        titleBar.InactiveBackgroundColor = titleBar.ButtonInactiveBackgroundColor = NativeTheme.Color("--chrome");
        titleBar.InactiveForegroundColor = titleBar.ButtonInactiveForegroundColor = NativeTheme.Color("--muted");
        titleBar.ButtonHoverBackgroundColor = NativeTheme.Color("--surface-raised");
        titleBar.ButtonHoverForegroundColor = NativeTheme.Color("--foreground");
    }

    private async Task InitializeAsync()
    {
        try
        {
            await _view.EnsureCoreWebView2Async();
            var core = _view.CoreWebView2;
            core.Settings.AreDefaultContextMenusEnabled = false;
            core.Settings.IsStatusBarEnabled = false;
            core.Settings.IsPasswordAutosaveEnabled = false;
            core.Settings.IsGeneralAutofillEnabled = false;
            core.NavigationStarting += (_, args) => MainPage.GuardNavigation(args);
            core.WebMessageReceived += (sender, args) => MainPage.Current?.HandleWebMessage(sender, args, Id);
            core.ProcessFailed += MainPage.LogWebViewProcessFailure;
            core.SetVirtualHostNameToFolderMapping("fbsdb.local", Path.Combine(AppContext.BaseDirectory, "WebContent"), CoreWebView2HostResourceAccessKind.DenyCors);
            _bootstrapScript = await core.AddScriptToExecuteOnDocumentCreatedAsync(Bootstrap(_transfer));
            core.NavigationCompleted += async (_, _) =>
            {
                // A reload must not adopt the same tabs a second time.
                if (_transfer is not null && _bootstrapScript is not null)
                {
                    core.RemoveScriptToExecuteOnDocumentCreated(_bootstrapScript);
                    _transfer = null;
                    _bootstrapScript = await core.AddScriptToExecuteOnDocumentCreatedAsync(Bootstrap(null));
                }
                MainPage.Post(core, "{\"type\":\"host.ready\"}");
            };
            _view.Source = new Uri($"https://fbsdb.local/index.html?window={Id}");
        }
        catch (Exception error)
        {
            System.Diagnostics.Debug.WriteLine($"SQL window failed to start: {error}");
            Content = new TextBlock { Text = $"This window could not start its editor.\n\n{error.Message}", Margin = new Thickness(24), TextWrapping = TextWrapping.Wrap };
        }
    }

    private string Bootstrap(string? transfer) =>
        "window.__fbsdbWindow=" + JsonSerializer.Serialize(new { id = Id, label = _label, transfer }) + ";";

    // The page moves its tabs back to the main window, then closes the window.
    public void RequestClose()
    {
        if (Core is null) { CloseNow(); return; }
        _closeRequestedAt = DateTimeOffset.UtcNow;
        MainPage.Post(Core, "{\"type\":\"window.closeRequested\"}");
    }

    public void CloseRefused() => _closeRequestedAt = null;

    // Closing is deferred out of the page's own message handler, which may be
    // the caller, so the WebView is not torn down while it is still reporting.
    public void CloseNow()
    {
        if (_closing) return;
        _closing = true; _closeAllowed = true;
        DispatcherQueue.TryEnqueue(() => Close());
    }

    private void OnClosing(AppWindow sender, AppWindowClosingEventArgs args)
    {
        if (_closeAllowed) return;
        args.Cancel = true;
        // A page that has not answered for a few seconds is closed anyway; the
        // sessions it still owns are closed with it.
        if (_closeRequestedAt is { } requested && DateTimeOffset.UtcNow - requested > TimeSpan.FromSeconds(4)) MainPage.Current?.ForceCloseWindow(this);
        else if (_closeRequestedAt is null) RequestClose();
    }
}
