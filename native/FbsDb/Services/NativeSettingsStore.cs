using System.Collections.Concurrent;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace FbsDb.Services;

public static class NativeSettingsStore
{
    public const string VersionKey="fbsdbSettingsVersion";
    public const int CurrentVersion=2;
    private static readonly ConcurrentDictionary<string,SemaphoreSlim> Gates=new(StringComparer.OrdinalIgnoreCase);
    public static SemaphoreSlim Gate(string path)=>Gates.GetOrAdd(Path.GetFullPath(path),_=>new SemaphoreSlim(1,1));
    public static async Task<JsonObject> ReadAsync(string path)
    {
        if(!File.Exists(path))return new JsonObject();
        return JsonNode.Parse(await File.ReadAllTextAsync(path)) as JsonObject??throw new InvalidOperationException("Settings must be a JSON object; existing preferences were preserved.");
    }
    public static async Task WriteAsync(string path,JsonObject settings)
    {
        if(settings.ContainsKey(VersionKey)&&(settings[VersionKey] is not JsonValue version||!version.TryGetValue<int>(out var number)||number<1||number>CurrentVersion))throw new InvalidOperationException("These settings belong to an unsupported application version and cannot be overwritten.");
        // Versions 1 and 2 use the same extensible JSON object. Bumping the version
        // preserves unknown legacy keys while letting each service migrate on write.
        settings[VersionKey]=CurrentVersion;
        var full=Path.GetFullPath(path);Directory.CreateDirectory(Path.GetDirectoryName(full)!);
        var temporary=full+"."+Guid.NewGuid().ToString("N")+".tmp";
        try{await File.WriteAllTextAsync(temporary,settings.ToJsonString(new JsonSerializerOptions{WriteIndented=true}));File.Move(temporary,full,true);}
        finally{if(File.Exists(temporary))File.Delete(temporary);}
    }
}
