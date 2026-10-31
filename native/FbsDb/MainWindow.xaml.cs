using Microsoft.UI.Xaml;
using Microsoft.UI.Windowing;
using Windows.Graphics;
using WinRT.Interop;
using System.Runtime.InteropServices;

// To learn more about WinUI, the WinUI project structure,
// and more about our project templates, see: http://aka.ms/winui-project-info.

namespace FbsDb;

/// <summary>
/// The application window. This hosts a Frame that displays pages. Add your
/// UI and logic to MainPage.xaml / MainPage.xaml.cs instead of here so you
/// can use Page features such as navigation events and the Loaded lifecycle.
/// </summary>
public sealed partial class MainWindow : Window
{
    public new static MainWindow? Current { get; private set; }

    public MainWindow()
    {
        Current = this;
        InitializeComponent();
        ApplyTheme();

        Title = "fbsDB · Oracle SQL Workspace";

        // Portable apps can be launched by Explorer, shortcuts, or a launcher
        // whose working directory differs from the application directory.
        AppWindow.SetIcon(System.IO.Path.Combine(AppContext.BaseDirectory, "Assets", "AppIcon.ico"));
        AppTitleBar.Visibility = Visibility.Collapsed;
        AppWindow.Resize(new SizeInt32(640, 400));
        if (AppWindow.Presenter is OverlappedPresenter presenter)
        {
            presenter.SetBorderAndTitleBar(false, false);
            presenter.IsResizable = false;
            presenter.IsMaximizable = false;
            presenter.IsMinimizable = false;
        }

        var workArea = DisplayArea.GetFromWindowId(AppWindow.Id, DisplayAreaFallback.Primary).WorkArea;
        AppWindow.MoveAndResize(new RectInt32(
            workArea.X + Math.Max(0, (workArea.Width - 640) / 2),
            workArea.Y + Math.Max(0, (workArea.Height - 400) / 2),
            640,
            400));

        // Navigate the root frame to the main page on startup.
        RootFrame.Navigate(typeof(MainPage));
    }

    public void ShowStartupSplash()
    {
        Activate();
        var hwnd = WindowNative.GetWindowHandle(this);
        SetForegroundWindow(hwnd);
    }

    public void ApplyTheme()
    {
        if (WindowRoot is null) return;
        WindowRoot.RequestedTheme = NativeTheme.RequestedTheme;
        WindowRoot.Background = NativeTheme.Brush("--bg");
        AppTitleBar.Background = NativeTheme.Brush("--chrome");
        AppTitleBar.Foreground = NativeTheme.Brush("--foreground");
        var titleBar = AppWindow.TitleBar;
        titleBar.BackgroundColor = titleBar.ButtonBackgroundColor = NativeTheme.Color("--chrome");
        titleBar.ForegroundColor = titleBar.ButtonForegroundColor = NativeTheme.Color("--foreground");
        titleBar.InactiveBackgroundColor = titleBar.ButtonInactiveBackgroundColor = NativeTheme.Color("--chrome");
        titleBar.InactiveForegroundColor = titleBar.ButtonInactiveForegroundColor = NativeTheme.Color("--muted");
        titleBar.ButtonHoverBackgroundColor = NativeTheme.Color("--surface-raised");
        titleBar.ButtonHoverForegroundColor = NativeTheme.Color("--foreground");
        titleBar.ButtonPressedBackgroundColor = NativeTheme.Color("--line");
        titleBar.ButtonPressedForegroundColor = NativeTheme.Color("--foreground");
    }

    public object ThemeSnapshot()
    {
        static string? Hex(Windows.UI.Color? color) => color is { } value ? $"#{value.R:x2}{value.G:x2}{value.B:x2}" : null;
        return new
        {
            requestedTheme = WindowRoot.RequestedTheme.ToString(),
            background = Hex((WindowRoot.Background as Microsoft.UI.Xaml.Media.SolidColorBrush)?.Color),
            titleBar = Hex((AppTitleBar.Background as Microsoft.UI.Xaml.Media.SolidColorBrush)?.Color),
            foreground = Hex((AppTitleBar.Foreground as Microsoft.UI.Xaml.Media.SolidColorBrush)?.Color),
            captionBackground = Hex(AppWindow.TitleBar.ButtonBackgroundColor),
            captionForeground = Hex(AppWindow.TitleBar.ButtonForegroundColor)
        };
    }

    public void ShowWorkbench()
    {
        AppTitleBar.Visibility = Visibility.Visible;
        ExtendsContentIntoTitleBar = true;
        SetTitleBar(AppTitleBar);
        if (AppWindow.Presenter is OverlappedPresenter presenter)
        {
            presenter.SetBorderAndTitleBar(true, true);
            presenter.IsResizable = true;
            presenter.IsMaximizable = true;
            presenter.IsMinimizable = true;
            presenter.Maximize();
        }

        Activate();
        var hwnd = WindowNative.GetWindowHandle(this);
        ShowWindow(hwnd, SwShowMaximized);
        SetForegroundWindow(hwnd);
    }

    private const int SwShowMaximized = 3;

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool ShowWindow(nint hwnd, int command);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool SetForegroundWindow(nint hwnd);
}
