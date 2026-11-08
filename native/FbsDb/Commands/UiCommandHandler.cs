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
    [System.Runtime.InteropServices.StructLayout(System.Runtime.InteropServices.LayoutKind.Sequential)]
    private struct FlashWindowInfo { public uint Size; public IntPtr Window; public uint Flags; public uint Count; public uint Timeout; }
    [System.Runtime.InteropServices.DllImport("user32.dll")]
    [return: System.Runtime.InteropServices.MarshalAs(System.Runtime.InteropServices.UnmanagedType.Bool)]
    private static extern bool FlashWindowEx(ref FlashWindowInfo info);

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
                case "ui.setTaskbarProgress":
                    TaskbarProgress.TrySet(OwnerWindowHandle, payload.GetProperty("state").GetString() switch { "indeterminate" => TaskbarProgress.State.Indeterminate, "error" => TaskbarProgress.State.Error, _ => TaskbarProgress.State.None });
                    break;
                case "ui.requestAttention":
                    // Flashes the taskbar button until the window is focused; it never steals focus.
                    {
                        var info = new FlashWindowInfo { Size = (uint)System.Runtime.InteropServices.Marshal.SizeOf<FlashWindowInfo>(), Window = OwnerWindowHandle, Flags = 0x2 | 0xC, Count = 0, Timeout = 0 };
                        FlashWindowEx(ref info);
                    }
                    break;
                case "ui.openTerminal":
                {
                    string? Text(string name) => payload.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() : null;
                    var plan = ExternalTerminalService.Build(Text("tool") ?? "", Text("userName"), Text("identifier"), Text("directory"), Text("tnsSource"), name => ExternalTerminalService.FindOnPath(name));
                    string message;
                    if (plan.Error is null)
                    {
                        try { ExternalTerminalService.Start(plan); message = "Opened an external terminal in the project directory. It has its own session and transaction."; }
                        catch (Exception ex) when (ex is System.ComponentModel.Win32Exception or InvalidOperationException) { plan = plan with { Error = ex.Message }; message = ex.Message; }
                    }
                    else message = plan.Error;
                    Send(sender, new { type = "ui.terminal", requestId = id, tabId, opened = plan.Error is null, message });
                    break;
                }
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
                case "window.state":
                case "window.moveTab":
                case "window.focus":
                case "window.close":
                case "window.closeCancelled":
                    Host.HandleWindowCommand(Context);
                    break;
                default: throw new InvalidOperationException($"Unsupported command: {command}");
            }
        }

    }
}
