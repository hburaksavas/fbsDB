using System.Text.Json;
using FbsDb.Services;

static void Require(bool condition, string message) { if (!condition) throw new Exception(message); }
static void Reject(Action action) { try { action(); } catch (InvalidOperationException) { return; } throw new Exception("Expected SELECT rejection."); }
foreach (var sql in new[] { "select :id from dual; -- end", "with a as (select :id id from dual) select * from a", "select q'[delete; ( :hidden)]' text, \"UPDATE\" from dual", "select nq'{insert;}' from dual" }) MiniToolService.AssertSelect(sql);
foreach (var sql in new[] { "delete from t", "select 1 from dual; delete from t", "with a as (select 1 from dual) update t set n=1", "select * from t for update", "select n into :n from t", "begin null; end;", "select 'oops", "select (1 from dual", "select 1) from dual", "select 1 from dual;;" }) Reject(() => MiniToolService.AssertSelect(sql));

var root = Path.Combine(Path.GetTempPath(), "fbsdb-mini-tools-" + Guid.NewGuid().ToString("N"));
try
{
    Directory.CreateDirectory(root);
    using var document = JsonDocument.Parse("""
    {"version":1,"id":"../../escape","name":"Customer lookup","sql":"SELECT :id, :region FROM dual",
    "fields":[{"name":"ID","label":"Customer ID","type":"NUMBER","required":true,"description":"Identifier","value":"SECRET_VALUE"},
    {"name":"REGION","label":"Region","type":"VARCHAR2","required":false,"description":""}],
    "columns":[{"index":0,"name":"ID","visible":true},{"index":1,"name":"REGION","visible":false}],
    "password":"SECRET_PASSWORD","profileId":"SECRET_PROFILE","rows":[["SECRET_ROW"]]}
    """);
    var saved = await MiniToolService.SaveAsync(root, document.RootElement);
    Require(saved.Id.Length == 32, "Unsafe ID was not replaced.");
    var file = Path.Combine(root, ".fbsdb", "tools", saved.Id + ".json");
    var text = await File.ReadAllTextAsync(file);
    Require(!text.Contains("SECRET"), "Runtime data escaped into the tool file.");
    Require(text.Contains("Customer ID") && text.Contains("NUMBER"), "Field definition was lost.");
    Require(saved.Revision == 1, "Initial revision missing.");
    var update = saved with { Description = "Look up a customer", Usage = "Supply :ID", ChangeNotes = "Document usage" };
    var updated = await MiniToolService.SaveAsync(root, JsonSerializer.SerializeToElement(update, new JsonSerializerOptions(JsonSerializerDefaults.Web)));
    Require(updated.Revision == 2 && updated.Description == update.Description && updated.Usage == update.Usage && updated.ChangeNotes == update.ChangeNotes, "Sharing metadata did not roundtrip.");
    try { await MiniToolService.SaveAsync(root, JsonSerializer.SerializeToElement(update, new JsonSerializerOptions(JsonSerializerDefaults.Web))); throw new Exception("Stale tool save overwrote a newer revision."); }
    catch (InvalidOperationException) { }
    var catalog = JsonSerializer.SerializeToElement(await MiniToolService.ListAsync(root));
    Require(catalog.GetProperty("tools").GetArrayLength() == 1, "Saved tool was not listed.");
    var second = Path.Combine(root, "second-workspace"); Directory.CreateDirectory(Path.Combine(second, ".fbsdb", "tools"));
    File.Copy(file, Path.Combine(second, ".fbsdb", "tools", Path.GetFileName(file)));
    var transferred = JsonSerializer.SerializeToElement(await MiniToolService.ListAsync(second));
    Require(transferred.GetProperty("tools")[0].GetProperty("Name").GetString() == saved.Name, "Transferred tool did not open.");
    await File.WriteAllTextAsync(Path.Combine(root, ".fbsdb", "tools", "broken.json"), "{broken");
    catalog = JsonSerializer.SerializeToElement(await MiniToolService.ListAsync(root));
    Require(catalog.GetProperty("tools").GetArrayLength() == 1 && catalog.GetProperty("errors").GetArrayLength() == 1, "Invalid file blocked valid tools.");
    using var newer = JsonDocument.Parse(text.Replace("\"version\": 1", "\"version\": 2"));
    Reject(() => MiniToolService.Normalize(newer.RootElement));
    foreach (var good in new[] { "UPDATE \"APP\".\"T\" SET \"A\" = :c1 WHERE \"ID\" = :uk1", "DELETE FROM \"T\" WHERE \"ID\" = :dk1", "INSERT INTO \"APP\".\"T\" (\"A\") VALUES (:i1)" }) FbsDb.Services.GridDmlGuard.Assert(good);
    foreach (var bad in new[] { "", "SELECT 1 FROM dual", "DROP TABLE \"T\"", "UPDATE T SET A = 1", "DELETE FROM \"T\" WHERE \"ID\" = :a; DELETE FROM \"U\" WHERE 1=1", "UPDATE \"T\" SET \"A\" = 1 -- x", "BEGIN NULL; END;" })
        Reject(() => FbsDb.Services.GridDmlGuard.Assert(bad));
    Console.WriteLine("PASS SELECT classification, definition-only persistence, workspace transfer, corrupt files and format versions.");
}
finally { if (Directory.Exists(root)) Directory.Delete(root, true); }
