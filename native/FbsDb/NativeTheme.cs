using FbsDb.Services;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Media;
using Windows.UI;

namespace FbsDb;

public static class NativeTheme
{
    public static readonly string SettingsPath = Environment.GetEnvironmentVariable("FBSDB_THEME_SETTINGS_PATH")
        ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "fbsDB", "settings.json");
    private static readonly string PalettePath = Path.Combine(AppContext.BaseDirectory, "Assets", "theme-palettes.json");
    public static ThemePalette Current { get; private set; } = ThemePaletteService.Load(PalettePath, "default");
    public static ElementTheme RequestedTheme => Current.Name == "light" ? ElementTheme.Light : ElementTheme.Dark;
    public static Color Color(string token)
    {
        var value = Current.Tokens[token];
        return Windows.UI.Color.FromArgb(255, Convert.ToByte(value.Substring(1, 2), 16), Convert.ToByte(value.Substring(3, 2), 16), Convert.ToByte(value.Substring(5, 2), 16));
    }
    public static SolidColorBrush Brush(string token) => new(Color(token));

    public static void Apply(string name)
    {
        Current = ThemePaletteService.Load(PalettePath, name);
        var resources = Application.Current.Resources;
        foreach (var (role, token) in new[] { ("Background", "--bg"), ("Surface", "--surface"), ("Input", "--input"), ("Chrome", "--chrome"), ("Border", "--line"), ("Text", "--foreground"), ("Muted", "--muted"), ("Accent", "--accent"), ("OnAccent", "--on-accent") })
        {
            resources[$"Shell{role}Color"] = Color(token);
            var key = $"Shell{role}Brush";
            if (resources.TryGetValue(key, out var existing) && existing is SolidColorBrush brush) brush.Color = Color(token);
            else resources[key] = Brush(token);
        }
        foreach (var key in new[] { "SystemAccentColor", "SystemAccentColorLight1", "SystemAccentColorLight2", "SystemAccentColorLight3", "SystemAccentColorDark1", "SystemAccentColorDark2", "SystemAccentColorDark3" }) resources[key] = Color("--accent");
        foreach (var (key, token) in new[] { ("AccentFillColorDefaultBrush", "--accent"), ("AccentFillColorSecondaryBrush", "--accent-strong"), ("AccentFillColorTertiaryBrush", "--accent-strong"), ("AccentTextFillColorPrimaryBrush", "--accent"), ("TextOnAccentFillColorPrimaryBrush", "--on-accent") })
        {
            if (resources.TryGetValue(key, out var existing) && existing is SolidColorBrush brush) brush.Color = Color(token);
            else resources[key] = Brush(token);
        }
        MainWindow.Current?.ApplyTheme();
    }
}
