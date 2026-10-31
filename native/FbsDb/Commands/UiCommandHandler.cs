using System.Collections.Concurrent;
using System.Diagnostics;
using System.Text;
using System.Text.Json;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.Web.WebView2.Core;
using Windows.Storage;
using Windows.Storage.Pickers;
using WinRT.Interop;
using FbsDb.Services;

namespace FbsDb;

public sealed partial class MainPage
{
    private sealed class UiCommandHandler(MainPage host, NativeCommandContext context) : NativeCommandHandler(host, context)
    {
        public override async Task HandleAsync()
        {
            var sender = Context.Sender;
            var id = Context.RequestId;
            var tabId = Context.Tab.Id;
            var command = Context.Command;
            var payload = Context.Payload;
            switch (command)
            {
                case "ui.setTheme":
                    try
                    {
                        var selectedTheme = payload.GetProperty("theme").GetString() ?? "default";
                        if (selectedTheme != ThemePaletteService.Normalize(selectedTheme)) throw new InvalidOperationException("Choose a supported interface theme.");
                        NativeTheme.Apply(selectedTheme); Host.RequestedTheme = NativeTheme.RequestedTheme;
                        Host.EditorWebView.DefaultBackgroundColor = NativeTheme.Color("--bg");
                        await ThemePaletteService.SavePreferenceAsync(NativeTheme.SettingsPath, selectedTheme);
                        Send(sender, new { type = "ui.theme", requestId = id, theme = selectedTheme, background = NativeTheme.Current.Tokens["--bg"], foreground = NativeTheme.Current.Tokens["--foreground"], accent = NativeTheme.Current.Tokens["--accent"], nativeTheme = Host.RequestedTheme.ToString(), chrome = MainWindow.Current?.ThemeSnapshot() });
                    }
                    catch (Exception error) { Send(sender, new { type = "ui.theme", requestId = id, error = error.Message }); }
                    break;
                case "ui.setZoom":
                    if (payload.TryGetProperty("factor", out var zoom) && zoom.TryGetDouble(out var factor) && double.IsFinite(factor) && factor >= 0.8 && factor <= 1.5)
                    {
                        Host._interfaceScale = factor;
                        Host.ApplyInterfaceScale();
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
                default: throw new InvalidOperationException($"Unsupported command: {command}");
            }
        }

    }
}
