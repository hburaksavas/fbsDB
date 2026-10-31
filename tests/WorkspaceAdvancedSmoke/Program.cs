using System.Text;
using System.Text.Json.Nodes;
using FbsDb.Services;

var temporary = Path.GetFullPath(Path.Combine(Path.GetTempPath(), "fbsdb-workspace-advanced-" + Guid.NewGuid().ToString("N")));
var root = Path.Combine(temporary, "workspace"); Directory.CreateDirectory(root);
void Check(bool condition, string label) { if (!condition) throw new Exception(label); }
async Task Reject<T>(Func<Task> action, string label) where T : Exception { try { await action(); } catch (T) { return; } throw new Exception(label); }
try
{
    var workspace = new WorkspaceService(Path.Combine(temporary, "user.json")); await workspace.SetRootAsync(root);
    var source = Path.Combine(root, "queries"); var destination = Path.Combine(root, "target"); Directory.CreateDirectory(source); Directory.CreateDirectory(destination);
    var a = Path.Combine(source, "a.sql"); var b = Path.Combine(source, "b.sql");
    await File.WriteAllTextAsync(a, "SELECT 1 FROM dual;\nSELECT 2 FROM dual;\n"); await File.WriteAllTextAsync(b, "SELECT 3 FROM dual;");
    await workspace.SetFileConnectionAsync(a, "PROFILE_REFERENCE");
    var set = await workspace.SaveWorksetAsync(null, "Investigation", [new("queries/a.sql", 2, 8), new("queries/b.sql", 1, 4)], "queries/a.sql");
    var manifest = Path.Combine(root, ".fbsdb", "workspace.json");
    var json = await File.ReadAllTextAsync(manifest);
    Check(!json.Contains("SELECT") && !json.Contains("password") && !json.Contains("content") && !json.Contains("bindValues"), "Worksets must store file references only.");
    Check(workspace.NormalizeSelection([a, source, b, source]).SequenceEqual([source]), "Selected descendants must not be moved twice.");
    var collision = Path.Combine(destination, "b.sql"); await File.WriteAllTextAsync(collision, "keep");
    await Reject<IOException>(() => workspace.MoveEntriesAsync([a, b], destination), "Batch collision was accepted.");
    Check(File.Exists(a) && File.Exists(b) && !File.Exists(Path.Combine(destination, "a.sql")), "Preflight collision must move no files.");
    File.Delete(collision);
    var moves = await workspace.MoveEntriesAsync([a, b], destination);
    var movedA = Path.Combine(destination, "a.sql"); var movedB = Path.Combine(destination, "b.sql");
    Check(moves.Count == 2 && File.Exists(movedA) && File.Exists(movedB), "Batch move failed.");
    Check(await workspace.GetFileConnectionAsync(movedA) == "PROFILE_REFERENCE", "Move lost profile reference.");
    set = (await workspace.ListWorksetsAsync()).Single();
    Check(set.Files[0].Path == "target/a.sql" && set.ActivePath == "target/a.sql" && set.Files[0].Line == 2 && set.Files[0].Column == 8, "Batch move must remap worksets and retain caret.");
    var oldId = set.Id; set = await workspace.SaveWorksetAsync(set.Id, "Renamed", null, null);
    Check(set.Id == oldId && set.Files.Count == 2, "Rename replaced workset files or identity.");
    await Reject<InvalidOperationException>(() => workspace.SaveWorksetAsync(null, "renamed", [new("target/a.sql")], null), "Duplicate workset name was accepted.");
    await Reject<InvalidOperationException>(() => workspace.SaveWorksetAsync(null, "Outside", [new("../escape.sql")], null), "Workset escaped the root.");
    var target2 = Path.Combine(root, "target2"); Directory.CreateDirectory(target2);
    var validManifest = await File.ReadAllTextAsync(manifest);
    await File.WriteAllTextAsync(manifest, "{\"fbsdbSettingsVersion\":99,\"fileConnections\":{}}");
    await Reject<InvalidOperationException>(() => workspace.MoveEntriesAsync([movedA, movedB], target2), "Unsupported settings were overwritten.");
    Check(File.Exists(movedA) && File.Exists(movedB) && !File.Exists(Path.Combine(target2, "a.sql")), "Failed metadata write must roll back every move.");
    await File.WriteAllTextAsync(manifest, validManifest);
    await workspace.MoveEntryAsync(destination, Path.Combine(root, "renamed-folder"));
    set = (await workspace.ListWorksetsAsync()).Single(); Check(set.Files[0].Path == "renamed-folder/a.sql", "Single folder rename did not remap worksets.");
    movedA = Path.Combine(root, "renamed-folder", "a.sql"); movedB = Path.Combine(root, "renamed-folder", "b.sql");
    var first = await WorkspaceFileService.ReadAsync(movedA); Check(first.Content!.Contains("SELECT 1"), "Snapshot did not read SQL.");
    await File.WriteAllTextAsync(movedA, "SELECT 9 FROM dual;\n");
    var conflict = await WorkspaceFileService.SaveAsync(movedA, "unsaved editor", first.Version);
    Check(conflict.Conflict && (await File.ReadAllTextAsync(movedA)).Contains("SELECT 9"), "Stale save overwrote external data.");
    var saved = await WorkspaceFileService.SaveAsync(movedA, "editor chosen", conflict.Version);
    Check(!saved.Conflict && (await WorkspaceFileService.ReadAsync(movedA)).Version == saved.Version, "Explicit save did not update baseline.");
    File.Delete(movedA);
    var missing = await WorkspaceFileService.SaveAsync(movedA, "do not recreate", saved.Version);
    Check(missing.Conflict && missing.Missing && !File.Exists(movedA), "Deleted-file conflict recreated the file.");
    await File.WriteAllTextAsync(movedA, "SELECT 'unicode' FROM dual;", Encoding.Unicode);
    Check((await WorkspaceFileService.ReadAsync(movedA)).Content == "SELECT 'unicode' FROM dual;", "UTF-16 reload did not detect its BOM.");
    var callbacks = 0;
    var recycleManifest = await File.ReadAllTextAsync(manifest);
    await File.WriteAllTextAsync(manifest, "{\"fbsdbSettingsVersion\":99}");
    await Reject<InvalidOperationException>(() => workspace.RecycleEntriesAsync([movedA, movedB], (_, _) => callbacks++), "Unsupported settings allowed recycling.");
    Check(callbacks == 0 && File.Exists(movedA) && File.Exists(movedB), "Unsupported settings must be rejected before recycling starts.");
    await File.WriteAllTextAsync(manifest, recycleManifest);
    await Reject<FileNotFoundException>(() => workspace.RecycleEntriesAsync([movedA, Path.Combine(root, "missing.sql")], (_, _) => callbacks++), "Missing selection was accepted.");
    Check(callbacks == 0 && File.Exists(movedA), "Recycle preflight must complete before the first deletion.");
    var recycled = await workspace.RecycleEntriesAsync([movedA, movedB], (path, _) => { if (++callbacks == 2) throw new IOException("fixture error"); File.Move(path, Path.Combine(temporary, Path.GetFileName(path))); });
    Check(recycled.Removed.SequenceEqual([movedA]) && recycled.Error is not null && File.Exists(movedB), "Partial recycling must report exact completed items.");
    Check((await workspace.ListWorksetsAsync()).Single().Files.Count == 2, "Recycling silently removed workset references.");
    await workspace.DeleteWorksetAsync(set.Id); Check((await workspace.ListWorksetsAsync()).Count == 0 && File.Exists(movedB), "Deleting a workset deleted SQL files.");
    Console.WriteLine("PASS advanced workspace: batch preflight/rollback/remapping, workset identity/validation, references-only persistence, exact partial recycle, external versions/conflicts and BOM reload.");
}
finally
{
    if (temporary.StartsWith(Path.GetFullPath(Path.GetTempPath()), StringComparison.OrdinalIgnoreCase) && Path.GetFileName(temporary).StartsWith("fbsdb-workspace-advanced-", StringComparison.Ordinal)) Directory.Delete(temporary, true);
}
