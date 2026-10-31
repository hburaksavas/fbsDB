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
    Require(preserved[NativeSettingsStore.VersionKey]?.GetValue<int>() == NativeSettingsStore.CurrentVersion, "Legacy settings were not versioned.");
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

    var registration = workspace.Catalog.Single();
    await workspace.UpdateRegistrationAsync(registration.Id, "Reporting", "Team SQL", true);
    Require(workspace.DisplayName == "Reporting" && Directory.Exists(workspaceRoot), "Display name must not rename the folder.");
    var duplicate = await workspace.DuplicateEntryAsync(firstSql, "first copy.sql");
    Require(await File.ReadAllTextAsync(duplicate.Path) == await File.ReadAllTextAsync(firstSql), "Duplicate must preserve SQL bytes.");
    var duplicateCollision = false;
    try { await workspace.DuplicateEntryAsync(firstSql, "first copy.sql"); } catch (IOException) { duplicateCollision = true; }
    Require(duplicateCollision, "Duplicate must never overwrite existing files.");
    Require(workspace.SearchSqlFiles("SELECT 2", scope: Path.GetDirectoryName(firstSql)).Matches.Count == 0, "Scoped search escaped its folder.");
    Require(workspace.SearchSqlFiles("SELECT 1", scope: Path.GetDirectoryName(firstSql)).Matches.Count == 2, "Scoped search did not find nested SQL files.");
    await workspace.SetFileConnectionAsync(duplicate.Path, "DUPLICATE_PROFILE");
    var recycleFailed = false;
    try { await workspace.RecycleEntryAsync(duplicate.Path, (_, _) => throw new IOException("Fixture recycle failure")); } catch (IOException) { recycleFailed = true; }
    Require(recycleFailed && File.Exists(duplicate.Path) && await workspace.GetFileConnectionAsync(duplicate.Path) == "DUPLICATE_PROFILE", "Failed recycle must keep file and connection reference.");
    var fixtureTrash = Path.Combine(root, "fixture-trash.sql");
    await workspace.RecycleEntryAsync(duplicate.Path, (path, directory) => { Require(!directory, "Expected a SQL file."); File.Move(path, fixtureTrash); });
    Require(File.Exists(fixtureTrash) && await workspace.GetFileConnectionAsync(duplicate.Path) is null, "Successful recycle did not remove the obsolete profile reference.");
    var rootRecycleRejected = false;
    try { workspace.ValidateRecyclePath(workspaceRoot); } catch (InvalidOperationException) { rootRecycleRejected = true; }
    Require(rootRecycleRejected, "The workspace root must never be recycled through entry operations.");
    var outsideRejected = false;
    try { workspace.ValidateEntryPath(Path.Combine(root, "outside.sql")); } catch (InvalidOperationException) { outsideRejected = true; }
    Require(outsideRejected, "Entry operations escaped the active workspace.");
    var otherRoot = Path.Combine(root, "other"); Directory.CreateDirectory(otherRoot);
    await workspace.SetRootAsync(otherRoot);
    var otherRegistration = workspace.Catalog.Single(w => w.Active);
    Directory.Delete(otherRoot);
    var missing = new WorkspaceService(settingsFile); await missing.RestoreAsync();
    Require(missing.Root is null && missing.Catalog.Count == 2 && !missing.Catalog.Single(w => w.Id == otherRegistration.Id).Available, "Missing workspaces must remain registered.");
    var relocated = Path.Combine(root, "relocated"); Directory.CreateDirectory(relocated);
    await missing.RelocateAsync(otherRegistration.Id, relocated);
    Require(missing.Catalog.Single(w => w.Id == otherRegistration.Id).Path == relocated, "Relocation changed workspace identity.");
    await missing.ForgetAsync(otherRegistration.Id);
    Require(Directory.Exists(relocated) && missing.Catalog.Count == 1, "Forget must retain the physical folder.");
    await missing.SetRootAsync(workspaceRoot);
    Require(missing.Catalog.Single().Pinned && missing.DisplayName == "Reporting", "Workspace properties were not persisted.");
    await missing.ForgetAsync(registration.Id);
    Require(missing.Root is null && missing.Catalog.Count == 0 && File.Exists(firstSql) && File.Exists(workspaceConfig), "Forgetting the active workspace must only remove its registration.");
    var forgotten = new WorkspaceService(settingsFile); await forgotten.RestoreAsync();
    Require(forgotten.Catalog.Count == 0, "Forgotten workspace returned after reload.");

    await workspace.SetRootAsync(workspaceRoot);
    foreach (var invalid in new[]{"{\"fbsdbSettingsVersion\":99}","{\"fbsdbSettingsVersion\":{}}","{broken"})
    {
        await File.WriteAllTextAsync(workspaceConfig, invalid);
        var rejected = false;
        try { await workspace.SetFileConnectionAsync(firstSql, "REJECT"); }
        catch (Exception exception) when (exception is InvalidOperationException or JsonException) { rejected = true; }
        Require(rejected && await File.ReadAllTextAsync(workspaceConfig) == invalid, "Unsupported or corrupt settings were overwritten.");
    }
    Console.WriteLine("Workspace smoke checks passed: directory tree, create/move, profile remapping, collisions, traversal, catalog/pins/properties, missing folders, relocation, forget, duplicate/scoped search, recents/close, restore, concurrent settings writes and corruption preservation.");
}
finally
{
    if (Directory.Exists(root)) Directory.Delete(root, recursive: true);
}

static void Require(bool condition, string message)
{
    if (!condition) throw new InvalidOperationException(message);
}
