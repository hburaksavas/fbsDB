using System.Text.Json;

namespace FbsDb.Services;

public sealed record ThemePalette(string Name, IReadOnlyDictionary<string, string> Tokens);

public static class ThemePaletteService
{
    public static string Normalize(string? name) => name is "default" or "dark" or "light" ? name : "default";

    public static ThemePalette Load(string path, string? name)
    {
        var theme = Normalize(name);
        using var document = JsonDocument.Parse(File.ReadAllText(path));
        var tokens = document.RootElement.GetProperty(theme).GetProperty("tokens").EnumerateObject()
            .ToDictionary(item => item.Name, item => item.Value.GetString()!, StringComparer.Ordinal);
        foreach (var key in new[] { "--bg", "--surface", "--input", "--chrome", "--line", "--foreground", "--muted", "--accent", "--on-accent" })
            if (!tokens.TryGetValue(key, out var value) || value.Length != 7 || value[0] != '#' || !uint.TryParse(value[1..], System.Globalization.NumberStyles.HexNumber, null, out _))
                throw new InvalidOperationException($"The shared theme palette has an invalid {key} color.");
        return new(theme, tokens);
    }

    public static async Task<string> ReadPreferenceAsync(string settingsPath)
    {
        try { var settings = await NativeSettingsStore.ReadAsync(settingsPath); return Normalize(settings["interfaceTheme"]?.GetValue<string>()); }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException or JsonException or InvalidOperationException) { return "default"; }
    }

    public static async Task SavePreferenceAsync(string settingsPath, string name)
    {
        if (name != Normalize(name)) throw new InvalidOperationException("Choose a supported interface theme.");
        var gate = NativeSettingsStore.Gate(settingsPath); await gate.WaitAsync();
        try
        {
            var settings = await NativeSettingsStore.ReadAsync(settingsPath);
            if (settings["interfaceTheme"] is System.Text.Json.Nodes.JsonValue value && value.TryGetValue<string>(out var previous) && previous == name) return;
            settings["interfaceTheme"] = name; await NativeSettingsStore.WriteAsync(settingsPath, settings);
        }
        finally { gate.Release(); }
    }
}
