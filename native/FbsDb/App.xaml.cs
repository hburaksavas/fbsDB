using Windows.ApplicationModel;
using Windows.ApplicationModel.Activation;
using Windows.Foundation;
using Windows.Foundation.Collections;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Controls.Primitives;
using Microsoft.UI.Xaml.Data;
using Microsoft.UI.Xaml.Input;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Navigation;
using Microsoft.UI.Xaml.Shapes;

// To learn more about WinUI, the WinUI project structure,
// and more about our project templates, see: http://aka.ms/winui-project-info.

namespace FbsDb;

/// <summary>
/// Provides application-specific behavior to supplement the default Application class.
/// </summary>
public partial class App : Application
{
    private Window? _window;
    
    /// <summary>
    /// Initializes the singleton application object.  This is the first line of authored code
    /// executed, and as such is the logical equivalent of main() or WinMain().
    /// </summary>
    public App()
    {
        InitializeComponent();
        // Recording only: none of these marks an exception as handled, so the app behaves as it did without the log.
        UnhandledException += (_, e) => Services.DiagnosticLog.Exception("app/ui-thread", e.Exception, e.Message);
        AppDomain.CurrentDomain.UnhandledException += (_, e) => Services.DiagnosticLog.Exception("app/process", e.ExceptionObject as Exception, e.IsTerminating ? "the process is ending" : null);
        TaskScheduler.UnobservedTaskException += (_, e) => Services.DiagnosticLog.Exception("app/task", e.Exception);
        var version = System.Reflection.Assembly.GetExecutingAssembly().GetName().Version;
        Services.DiagnosticLog.Info("app", $"fbsDB {version} started on {Environment.OSVersion.VersionString}, .NET {Environment.Version}");
    }

    /// <summary>
    /// Invoked when the application is launched.
    /// </summary>
    /// <param name="args">Details about the launch request and process.</param>
    protected override async void OnLaunched(Microsoft.UI.Xaml.LaunchActivatedEventArgs args)
    {
        var theme = await Services.ThemePaletteService.ReadPreferenceAsync(NativeTheme.SettingsPath);
        NativeTheme.Apply(theme);
        _window = new MainWindow();
        ((MainWindow)_window).ShowStartupSplash();
    }
}
