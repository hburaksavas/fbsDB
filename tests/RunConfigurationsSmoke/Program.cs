using System.Text.Json;
using FbsDb.Services;

void Require(bool condition, string message) { if (!condition) throw new Exception(message); }
var options = new JsonSerializerOptions(JsonSerializerDefaults.Web);
var root = Path.Combine(Path.GetTempPath(), "fbsdb-runs-" + Guid.NewGuid().ToString("N"));
try
{
    Directory.CreateDirectory(root);
    using var document = JsonDocument.Parse("""
    {"version":1,"id":"","name":"Pay","owner":"APP","packageName":"BILLING","routineName":"PAY","kind":"PROCEDURE","returnBindType":"","revision":0,
    "parameters":[{"name":"P_SECRET","oracleType":"VARCHAR2","bindType":"VARCHAR2","mode":"IN","sensitive":true,"value":"SECRET_VALUE"},
    {"name":"P_RESULT","oracleType":"NUMBER","bindType":"NUMBER","mode":"OUT"}],"password":"SECRET_PASSWORD","values":{"arg_0":"SECRET_VALUE"},"profileId":"SECRET_PROFILE"}
    """);
    var saved = await RunConfigurationService.SaveAsync(root, document.RootElement);
    var file = Path.Combine(root, ".fbsdb", "runs", saved.Id + ".json");
    Require(!(await File.ReadAllTextAsync(file)).Contains("SECRET_VALUE") && !(await File.ReadAllTextAsync(file)).Contains("SECRET_PASSWORD") && !(await File.ReadAllTextAsync(file)).Contains("SECRET_PROFILE"), "Runtime values or connection data were persisted.");
    Require(saved.Revision == 1 && saved.Parameters[0].Sensitive, "Parameter definitions did not roundtrip.");
    var sql = RunConfigurationService.BuildSql(saved);
    Require(sql == "BEGIN\n  \"APP\".\"BILLING\".\"PAY\"(\"P_SECRET\" => :arg_0, \"P_RESULT\" => :arg_1);\nEND;", "Named call SQL changed.");
    await RunConfigurationService.SaveAsync(root, JsonSerializer.SerializeToElement(saved with { Name = "Pay edited" }, options));
    var staleRejected = false;
    try { await RunConfigurationService.SaveAsync(root, JsonSerializer.SerializeToElement(saved, options)); } catch (InvalidOperationException) { staleRejected = true; }
    Require(staleRejected, "A stale editor overwrote a saved call.");
    var catalog = await RunConfigurationService.ListAsync(root);
    Require(catalog.Configurations.Count == 1 && catalog.Configurations[0].Name == "Pay edited", "Saved calls could not be reloaded.");
    foreach (var invalid in new[] { saved with { Version = 2 }, saved with { Id = "../escape" }, saved with { Parameters = [new("P", "NUMBER", "NUMBER", "OUT", true, true)] } })
    {
        var rejected = false;
        try { await RunConfigurationService.SaveAsync(root, JsonSerializer.SerializeToElement(invalid, options)); } catch (InvalidOperationException) { rejected = true; }
        Require(rejected, "Invalid run configuration was accepted.");
    }
    await File.WriteAllTextAsync(Path.Combine(root, ".fbsdb", "runs", Guid.NewGuid().ToString("N") + ".json"), "{broken");
    catalog = await RunConfigurationService.ListAsync(root);
    Require(catalog.Configurations.Count == 1 && catalog.Errors.Count == 1, "Corrupt call files prevented valid calls from loading.");
    Console.WriteLine("PASS run configurations: definition-only persistence, quoting, revisions, parameter modes, corrupt files and invalid identities.");
}
finally { if (Directory.Exists(root)) Directory.Delete(root, true); }
