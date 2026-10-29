using System.Text.Json;
using System.Text.Json.Nodes;
using FbsDb.Services;

var root = Path.Combine(Path.GetTempPath(), $"fbsdb-workspace-smoke-{Guid.NewGuid():N}");
var workspaceRoot = Path.Combine(root, "workspace");
var settingsFile = Path.Combine(root, "app-settings.json");
var firstSql = Path.Combine(workspaceRoot, "queries", "first.sql");
var secondSql = Path.Combine(workspaceRoot, "nested", "second.sql");

try
{
    Directory.CreateDirectory(Path.GetDirectoryName(firstSql)!);
    Directory.CreateDirectory(Path.GetDirectoryName(secondSql)!);
    Directory.CreateDirectory(Path.Combine(workspaceRoot, ".fbsdb"));
    Directory.CreateDirectory(Path.Combine(workspaceRoot, "bin"));
    await File.WriteAllTextAsync(firstSql, "SELECT 1 FROM dual;");
    await File.WriteAllTextAsync(secondSql, "SELECT 2 FROM dual;");
    await File.WriteAllTextAsync(Path.Combine(workspaceRoot, ".fbsdb", "ignored.sql"), "-- ignored");
    await File.WriteAllTextAsync(Path.Combine(workspaceRoot, "bin", "ignored.sql"), "-- ignored");

    var workspace = new WorkspaceService(settingsFile);
    await workspace.RestoreAsync();
    await workspace.SetRootAsync(workspaceRoot);
    var files = workspace.ListSqlFiles();
    Require(files.Count == 2, $"Expected two workspace SQL files; got {files.Count}.");
    Require(files.Any(file => Path.GetFullPath(file.Path) == Path.GetFullPath(firstSql)), "The first SQL file was not listed.");
    Require(files.Any(file => Path.GetFullPath(file.Path) == Path.GetFullPath(secondSql)), "The nested SQL file was not listed.");

    var workspaceConfig = Path.Combine(workspaceRoot, ".fbsdb", "workspace.json");
    await File.WriteAllTextAsync(workspaceConfig, "{\"display\":{\"density\":\"compact\"}}");
    await workspace.SetFileConnectionAsync(firstSql, "FBSDB_SMOKE");
    var preserved = JsonNode.Parse(await File.ReadAllTextAsync(workspaceConfig))!;
    Require(preserved["display"]?["density"]?.GetValue<string>() == "compact", "Unrelated workspace settings were lost.");
    Require(preserved[NativeSettingsStore.VersionKey]?.GetValue<int>() == 1, "Legacy settings were not versioned.");
    await Task.WhenAll(workspace.SetFileConnectionAsync(firstSql, "FBSDB_SMOKE"), workspace.SetFileConnectionAsync(secondSql, "SECOND"));
    Require(await workspace.GetFileConnectionAsync(secondSql) == "SECOND", "Concurrent workspace writes lost a profile.");
    await workspace.SetFileConnectionAsync(secondSql, "");
    Require(await workspace.GetFileConnectionAsync(firstSql) == "FBSDB_SMOKE", "The per-file Oracle profile was not persisted.");
    Require(await workspace.GetFileConnectionAsync(secondSql) == "", "A profile leaked to a different SQL file.");
    await workspace.SetFileConnectionAsync(Path.Combine(root, "outside.sql"), "SHOULD_NOT_PERSIST");
    Require(await workspace.GetFileConnectionAsync(Path.Combine(root, "outside.sql")) is null, "An out-of-workspace profile was persisted.");

    var restored = new WorkspaceService(settingsFile);
    await restored.RestoreAsync();
    Require(Path.GetFullPath(restored.Root!) == Path.GetFullPath(workspaceRoot), "The last workspace was not restored.");
    Require(restored.Recent.Count == 1, "Recent workspace history was not restored.");
    var children = workspace.ListDirectory();
    Require(children.All(item => item.IsDirectory) && children.Count == 2, "Directory listing must include visible folders without flattening or exposing ignored folders.");
    var folder = await workspace.CreateEntryAsync(workspaceRoot, "empty", true);
    Require(workspace.ListDirectory(folder.Path).Count == 0, "Empty folders must be browsable.");
    var created = await workspace.CreateEntryAsync(folder.Path, "created.sql", false);
    await workspace.SetFileConnectionAsync(created.Path, "KEEP_PROFILE");
    var movedFolder = Path.Combine(workspaceRoot, "renamed");
    await workspace.MoveEntryAsync(folder.Path, movedFolder);
    var movedFile = Path.Combine(movedFolder, "created.sql");
    Require(File.Exists(movedFile), "Folder move did not preserve its SQL file.");
    Require(await workspace.GetFileConnectionAsync(movedFile) == "KEEP_PROFILE", "Folder rename lost the file's connection preference.");
    Require(await workspace.GetFileConnectionAsync(created.Path) is null, "Old file connection mapping was not removed.");
    Require(WorkspaceService.RemapPath(created.Path, folder.Path, movedFolder) == movedFile, "Native tab paths must follow folder moves.");
    Require(WorkspaceService.RemapPath(folder.Path + "-other/file.sql", folder.Path, movedFolder) is null, "Sibling prefixes must not be remapped.");
    var collisionRejected = false;
    try { await workspace.MoveEntryAsync(firstSql, movedFile); } catch (IOException) { collisionRejected = true; }
    Require(collisionRejected && File.Exists(firstSql), "Move must never overwrite an existing file.");
    var traversalRejected = false;
    try { await workspace.CreateEntryAsync(workspaceRoot, "../outside.sql", false); } catch (InvalidOperationException) { traversalRejected = true; }
    Require(traversalRejected, "Workspace operations must reject path traversal.");
    var nestedRejected = false;
    try { await workspace.MoveEntryAsync(movedFolder, Path.Combine(movedFolder, "inside")); } catch (InvalidOperationException) { nestedRejected = true; }
    Require(nestedRejected, "Folders must not be moved into themselves.");
    await restored.CloseAsync();
    var closed = new WorkspaceService(settingsFile); await closed.RestoreAsync();
    Require(closed.Root is null && closed.Recent.Count == 1, "Closing a workspace must retain recents without reopening it at startup.");
    using var document = JsonDocument.Parse(await File.ReadAllTextAsync(Path.Combine(workspaceRoot, ".fbsdb", "workspace.json")));
    Require(document.RootElement.TryGetProperty("fileConnections", out _), "Workspace profile settings were not written.");
    Require(!document.RootElement.ToString().Contains("password", StringComparison.OrdinalIgnoreCase), "Credentials must never be stored in workspace settings.");

    foreach (var invalid in new[]{"{\"fbsdbSettingsVersion\":99}","{\"fbsdbSettingsVersion\":{}}","{broken"})
    {
        await File.WriteAllTextAsync(workspaceConfig, invalid);
        var rejected = false;
        try { await workspace.SetFileConnectionAsync(firstSql, "REJECT"); }
        catch (Exception exception) when (exception is InvalidOperationException or JsonException) { rejected = true; }
        Require(rejected && await File.ReadAllTextAsync(workspaceConfig) == invalid, "Unsupported or corrupt settings were overwritten.");
    }
    Console.WriteLine("Workspace smoke checks passed: directory tree, create/move, profile remapping, collisions, traversal, recents/close, restore, concurrent settings writes and corruption preservation.");
}
finally
{
    if (Directory.Exists(root)) Directory.Delete(root, recursive: true);
}

static void Require(bool condition, string message)
{
    if (!condition) throw new InvalidOperationException(message);
}
