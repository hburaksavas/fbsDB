using System.Text.Json.Nodes;
using FbsDb.Services;
static void Require(bool condition,string message) { if(!condition)throw new Exception(message); }
var palettes=Path.GetFullPath("src/themePalettes.json");
foreach(var name in new[]{"default","dark","light"}) {var palette=ThemePaletteService.Load(palettes,name);Require(palette.Name==name&&palette.Tokens["--foreground"]!=palette.Tokens["--bg"],"Invalid palette.");}
Require(ThemePaletteService.Load(palettes,"future").Name=="default","Unknown theme did not fall back.");
var directory=Path.Combine(Path.GetTempPath(),"fbsdb-themes-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(directory);var settings=Path.Combine(directory,"settings.json");
try {
 await File.WriteAllTextAsync(settings,"""{"lastWorkspace":"D:/SQL","profiles":[{"id":"keep"}],"interfaceTheme":42,"unknownFutureKey":{"value":1}}""");
 Require(await ThemePaletteService.ReadPreferenceAsync(settings)=="default","Invalid preference did not recover.");
 await ThemePaletteService.SavePreferenceAsync(settings,"light");Require(await ThemePaletteService.ReadPreferenceAsync(settings)=="light","Theme did not persist.");
 var saved=JsonNode.Parse(await File.ReadAllTextAsync(settings))!;Require(saved["lastWorkspace"]!.GetValue<string>()=="D:/SQL"&&saved["profiles"]![0]!["id"]!.GetValue<string>()=="keep"&&saved["unknownFutureKey"]!["value"]!.GetValue<int>()==1,"Theme write changed unrelated settings.");
 saved[NativeSettingsStore.VersionKey]=999;await File.WriteAllTextAsync(settings,saved.ToJsonString());var before=await File.ReadAllTextAsync(settings);
 try {await ThemePaletteService.SavePreferenceAsync(settings,"dark");throw new Exception("A future settings version was overwritten.");}catch(InvalidOperationException){}
 Require(await File.ReadAllTextAsync(settings)==before,"Future settings were changed.");
 Console.WriteLine("PASS shared palettes, persisted theme, malformed preference recovery, unrelated settings and future-version preservation.");
}finally {Directory.Delete(directory,true);}
