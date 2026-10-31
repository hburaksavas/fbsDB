using System.Text.Json;
using System.Text.Json.Nodes;
using FbsDb.Bridge;

using var fixtures = JsonDocument.Parse(await File.ReadAllTextAsync(Path.Combine(AppContext.BaseDirectory, "bridge-fixtures.json")));
var count = 0;
foreach (var fixture in fixtures.RootElement.EnumerateArray())
{
    var valid = true;
    try
    {
        if (fixture.GetProperty("direction").GetString() == "command") NativeBridgeContract.ReadCommand(fixture.GetProperty("message"));
        else NativeBridgeContract.ValidateReply(fixture.GetProperty("message"));
    }
    catch (Exception error) when (error is InvalidOperationException or JsonException or KeyNotFoundException) { valid = false; }
    if (valid != fixture.GetProperty("valid").GetBoolean()) throw new Exception($"Contract disagreement: {fixture.GetProperty("name").GetString()}");
    if (fixture.GetProperty("direction").GetString() == "reply")
    {
        var nodeValid = true;
        try { NativeBridgeContract.ValidateReply(JsonNode.Parse(fixture.GetProperty("message").GetRawText())!.AsObject()); }
        catch (Exception error) when (error is InvalidOperationException or JsonException or KeyNotFoundException) { nodeValid = false; }
        if (nodeValid != valid) throw new Exception($"Reply validator disagreement: {fixture.GetProperty("name").GetString()}");
    }
    count++;
}
foreach (var command in new[] { "sql.cancel", "schema.cancel", "completion.cancel" })
    if (NativeBridgeContract.RequiresSessionResume(command)) throw new Exception($"Cancellation waits for the session gate: {command}");
if (!NativeBridgeContract.RequiresSessionResume("sql.execute")) throw new Exception("SQL execution lost session resume.");
if (NativeBridgeContract.HandlerFor("file.save") != "file" || NativeBridgeContract.HandlerFor("workspace.moveEntry") != "workspace" || NativeBridgeContract.HandlerFor("sql.execute") != "oracle")
    throw new Exception("Incorrect command routing.");
var payload = new FileSavePayload { Content = "SELECT 1", Path = "a.sql", DiskVersion = "v1" };
var wirePayload = JsonSerializer.SerializeToElement(payload, NativeBridgeContract.JsonOptions);
if (NativeBridgeContract.ReadPayload<FileSavePayload>(wirePayload) != payload) throw new Exception("Typed payload round trip failed.");
NativeBridgeContract.ValidateReply(JsonSerializer.SerializeToElement(new FileSavedReply { Path = "a.sql", FileName = "a.sql", DiskVersion = "v2", TabId = "a", RequestId = "r-1" }, NativeBridgeContract.JsonOptions));
Console.WriteLine($"PASS bridge contract: {count} shared fixtures, cancellation routing and typed DTO round trips.");
