using System.Text;
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
    Require(await workspace.GetFileConnectionAsync(firstSql.ToLowerInvariant()) == "FBSDB_SMOKE", "File connection lookup must preserve Windows path identity.");
    Require((await workspace.GetFileConnectionsAsync()).Values.Contains("FBSDB_SMOKE"), "File/profile associations were not available for workspace badges.");
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
    var sourcesFolder = await workspace.CreateEntryAsync(workspaceRoot, "oracle-sources", true);
    foreach (var extension in WorkspaceService.SourceExtensions)
    {
        var source = await workspace.CreateEntryAsync(sourcesFolder.Path, "billing" + extension.ToUpperInvariant(), false);
        var text = await File.ReadAllTextAsync(source.Path);
        Require(extension == ".sql" ? text == "" : text.Contains("CREATE OR REPLACE") && text.Contains("billing"), "Source template was not selected by extension.");
        Require(workspace.ListDirectory(sourcesFolder.Path).Any(item => item.Path == source.Path), "Source missing from directory listing.");
        Require(workspace.ListSqlFiles().Any(item => item.Path == source.Path), "Source missing from recursive file listing.");
        await workspace.SetFileConnectionAsync(source.Path, "SOURCE_PROFILE");
        var renamed = Path.Combine(sourcesFolder.Path, "renamed" + extension);
        await workspace.MoveEntryAsync(source.Path, renamed);
        Require(await workspace.GetFileConnectionAsync(renamed) == "SOURCE_PROFILE", "Source rename lost connection preference.");
        var copy = await workspace.DuplicateEntryAsync(renamed, "copied" + extension);
        Require(await File.ReadAllTextAsync(copy.Path) == text, "Source duplication changed content.");
    }
    Require(workspace.SearchSqlFiles("CREATE OR REPLACE", scope: sourcesFolder.Path).Matches.Count == 10, "Content search omitted Oracle source files.");
    var sourceWorkset = await workspace.SaveWorksetAsync(null, "Oracle sources", [new("oracle-sources/renamed.pks", 3, 2), new("oracle-sources/renamed.pkb", 4, 1)], "oracle-sources/renamed.pkb");
    Require(sourceWorkset.Files.Count == 2, "Worksets rejected Oracle source files.");
    var quoted = await workspace.CreateEntryAsync(sourcesFolder.Path, "billing report.prc", false);
    Require((await File.ReadAllTextAsync(quoted.Path)).Contains("PROCEDURE \"billing report\""), "Template object names must be quoted when needed.");
    var unsupportedRejected = false;
    try { await workspace.CreateEntryAsync(sourcesFolder.Path, "billing.txt", false); }
    catch (InvalidOperationException) { unsupportedRejected = true; }
    Require(unsupportedRejected && !File.Exists(Path.Combine(sourcesFolder.Path, "billing.txt")), "Unsupported extensions must not create files.");
    var originalRules = await workspace.GetProjectRulesAsync(workspaceRoot);
    var customRules = originalRules.Rules with { Associations = originalRules.Rules.Associations.Concat(new[] { new SourceAssociation(".spec", "PACKAGE"), new SourceAssociation(".impl", "PACKAGE BODY") }).ToArray(), PackagePairs = [new("spec/{name}.spec", "impl/{name}.impl")], TestPatterns = ["tests/test_{name}.sql"],Project=WorkspaceService.DefaultProjectOptions with {Areas=new Dictionary<string,string>{{"packages","sources"},{"migrations","db/migrations"},{"scripts","scripts"},{"tests","tests"}},ConnectionIds=["DEV","PROD"],DefaultConnectionId="DEV",Variables=[new("customer_id","NUMBER",true,"Customer key")],Run=new(17,500,true)} };
    var savedRules = await workspace.SaveProjectRulesAsync(workspaceRoot, customRules, originalRules.Revision);
    var staleRulesRejected = false;
    try { await workspace.SaveProjectRulesAsync(workspaceRoot, originalRules.Rules, originalRules.Revision); } catch (InvalidOperationException) { staleRulesRejected = true; }
    Require(staleRulesRejected, "Stale rule editors must not overwrite newer project rules.");
    var customFile = await workspace.CreateEntryAsync(sourcesFolder.Path, "billing.spec", false);
    Require((await File.ReadAllTextAsync(customFile.Path)).Contains("CREATE OR REPLACE PACKAGE billing"), "Custom association did not select its template.");
    Require(workspace.ListSqlFiles().Any(file => file.Path == customFile.Path) && workspace.ListDirectory(sourcesFolder.Path).Any(file => file.Path == customFile.Path), "Custom sources missing from workspace listings.");
    Require(workspace.SearchSqlFiles("PACKAGE billing", scope: sourcesFolder.Path).Matches.Any(file => file.Path == customFile.Path), "Custom sources missing from content search.");
    await workspace.DuplicateEntryAsync(customFile.Path, "billing-copy.spec");
    await workspace.MoveEntryAsync(customFile.Path, Path.Combine(sourcesFolder.Path, "billing-renamed.spec"));
    var reloadedRules = new WorkspaceService(settingsFile); await reloadedRules.RestoreAsync();
    Require(reloadedRules.IsWorkspaceSourceFile("billing.spec") && reloadedRules.ProjectRules.TestPatterns.Single() == "tests/test_{name}.sql", "Project rules were not restored.");
    Require(reloadedRules.ProjectRules.Project?.Variables.Single().Name=="CUSTOMER_ID"&&reloadedRules.ProjectRules.Project.Run.PageSize==500&&reloadedRules.ProjectRules.Project.DefaultConnectionId=="DEV", "Project context was not validated and restored with its workspace.");
    var project=customRules.Project!;
    foreach(var invalidProject in new[]{project with {Areas=new Dictionary<string,string>{{"packages","../outside"},{"migrations","migrations"},{"scripts","scripts"},{"tests","tests"}}},project with {DefaultConnectionId="MISSING"},project with {ConnectionIds=["DEV","dev"]},project with {Variables=[new("x","NUMBER"),new("X","DATE")]},project with {Variables=[new("bad-name","NUMBER")]},project with {Run=new(-1,500)},project with {Run=new(10,22)}}){
        var before=await File.ReadAllTextAsync(workspaceConfig);var rejected=false;
        try{await workspace.SaveProjectRulesAsync(workspaceRoot,customRules with {Project=invalidProject},savedRules.Revision);}catch(InvalidOperationException){rejected=true;}
        Require(rejected&&before==await File.ReadAllTextAsync(workspaceConfig),"Invalid project context changed shared settings.");
    }
    Require(await workspace.GetFileConnectionAsync(Path.Combine(sourcesFolder.Path, "renamed.pks")) == "SOURCE_PROFILE", "Saving rules damaged unrelated file preferences.");
    var beforeInvalidRules = await File.ReadAllTextAsync(workspaceConfig);
    foreach (var invalidRules in new[] { customRules with { Version = 2 }, customRules with { TestPatterns = ["../{name}.sql"] }, customRules with { TestPatterns = ["C:/outside/{name}.sql"] }, customRules with { Associations = [new(".sql", "PACKAGE")] } })
    {
        var rejected = false;
        try { await workspace.SaveProjectRulesAsync(workspaceRoot, invalidRules, savedRules.Revision); } catch (InvalidOperationException) { rejected = true; }
        Require(rejected && await File.ReadAllTextAsync(workspaceConfig) == beforeInvalidRules, "Invalid project rules changed workspace settings.");
    }
    var discovered = await workspace.ReadSourceFilesAsync(workspaceRoot);
    Require(discovered.Files.Any(file => file.Path.EndsWith("renamed.pks") && file.ConnectionProfileId == "SOURCE_PROFILE" && file.Content.Contains("CREATE OR REPLACE")), "Source discovery lost content or connection identity.");
    Require(!discovered.Truncated && discovered.Skipped.Count == 0, "Small source discovery should be complete.");
    var largeSource = Path.Combine(sourcesFolder.Path, "large.pkb");
    await File.WriteAllTextAsync(largeSource, new string('x', 1024 * 1024 + 1));
    discovered = await workspace.ReadSourceFilesAsync(workspaceRoot);
    Require(discovered.Skipped.Any(item => item.Contains("large.pkb")) && discovered.Files.All(file => file.Path != largeSource), "Discovery must skip oversized files.");
    var staleRootRejected = false;
    try { await workspace.ReadSourceFilesAsync(Path.Combine(root, "other")); } catch (InvalidOperationException) { staleRootRejected = true; }
    Require(staleRootRejected, "Source discovery accepted a stale workspace root.");
    for (var index = 0; index < 9; index++) await File.WriteAllTextAsync(Path.Combine(sourcesFolder.Path, $"budget-{index}.sql"), new string('x', 1024 * 1024));
    discovered = await workspace.ReadSourceFilesAsync(workspaceRoot);
    Require(discovered.Truncated && discovered.Files.Sum(file => System.Text.Encoding.UTF8.GetByteCount(file.Content)) <= 8 * 1024 * 1024, "Discovery exceeded its total content budget.");
    var manySources = await workspace.CreateEntryAsync(workspaceRoot, "many-sources", true);
    for (var index = 0; index < 310; index++) await File.WriteAllTextAsync(Path.Combine(manySources.Path, $"file-{index:D3}.sql"), "SELECT 1 FROM dual;");
    discovered = await workspace.ReadSourceFilesAsync(workspaceRoot);
    Require(discovered.Truncated && discovered.Files.Count <= 300, "Discovery exceeded its file count budget.");
    foreach (var invalid in new[]{"{\"fbsdbSettingsVersion\":99}","{\"fbsdbSettingsVersion\":{}}","{broken"})
    {
        await File.WriteAllTextAsync(workspaceConfig, invalid);
        var rejected = false;
        try { await workspace.SetFileConnectionAsync(firstSql, "REJECT"); }
        catch (Exception exception) when (exception is InvalidOperationException or JsonException) { rejected = true; }
        Require(rejected && await File.ReadAllTextAsync(workspaceConfig) == invalid, "Unsupported or corrupt settings were overwritten.");
    }
    foreach (var template in new[] { "blank", "oracle-package", "migrations" })
    {
        var templateRoot = Path.Combine(root,"template-"+template);
        await WorkspaceTemplates.CreateAsync(templateRoot,template);
        if(template=="blank") Require(!Directory.EnumerateFileSystemEntries(templateRoot).Any(),"Blank template must remain empty.");
        else {
            var templateWorkspace=new WorkspaceService(Path.Combine(root,"template-settings-"+template+".json"));await templateWorkspace.SetRootAsync(templateRoot);
            var templateRules=await templateWorkspace.GetProjectRulesAsync(templateRoot);
            Require(templateRules.Rules.Project!.ConnectionIds.Count==0&&templateRules.Rules.Project.DefaultConnectionId is null,"Template must not configure a connection.");
            Require(File.Exists(Path.Combine(templateRoot,"scripts","session.sql")),"Template session draft missing.");
            if(template=="oracle-package")Require(File.ReadAllText(Path.Combine(templateRoot,"packages","example_api.pks")).Contains("PROCEDURE ping"),"Package specification draft missing.");
        }
        try {await WorkspaceTemplates.CreateAsync(templateRoot,template);throw new Exception("Existing template folder must be refused.");}catch(IOException){}
    }
    var invalidTemplateRoot=Path.Combine(root,"invalid-template");
    try{await WorkspaceTemplates.CreateAsync(invalidTemplateRoot,"unknown");throw new Exception("Unknown template must be refused.");}catch(InvalidOperationException){}
    Require(!Directory.Exists(invalidTemplateRoot),"Unknown template created files.");
    var generated = await workspace.CreateFileWithContentAsync("generated/tests/billing_test.sql", "-- draft\nBEGIN NULL; END;\n/\n");
    Require(File.ReadAllText(generated.Path).Contains("BEGIN NULL") && generated.RelativePath == "generated/tests/billing_test.sql", "Generated file content or nested folders were not written.");
    foreach (var invalidRelative in new[] { "generated/tests/billing_test.sql", "../escape.sql", "/abs.sql", "generated/../../escape.sql", "generated/notes.txt", "", "generated/./x.sql" })
    {
        var refused = false;
        try { await workspace.CreateFileWithContentAsync(invalidRelative, "x"); } catch (Exception error) when (error is InvalidOperationException or IOException) { refused = true; }
        Require(refused, "Generated file must refuse existing, escaping or unsupported targets: " + invalidRelative);
    }
    Require(!File.Exists(Path.Combine(Path.GetDirectoryName(workspaceRoot)!, "escape.sql")), "Generated file escaped the workspace.");
    var bindSource = Path.Combine(workspaceRoot, "queries", "binds.sql");
    await File.WriteAllTextAsync(bindSource, "select :id, :password from dual");
    var savedForm = await BindFormService.SaveAsync(workspaceRoot, bindSource, [new("id", "NUMBER", "Customer", "Key", true, "42"), new("password", "VARCHAR2", "", "", false, "hunter2"), new("note", "CLOB", "", "", false, "long text")]);
    Require(savedForm!.Definitions.Count == 3 && savedForm.Definitions[0].DefaultValue == "42" && savedForm.Definitions[0].Label == "Customer", "Bind form was not normalized.");
    Require(savedForm.Definitions[1].DefaultValue is null && savedForm.Definitions[2].DefaultValue is null, "Sensitive and CLOB defaults must not be stored.");
    var bindFiles = Directory.GetFiles(Path.Combine(workspaceRoot, ".fbsdb", "binds"), "*.json");
    Require(bindFiles.Length == 1 && !File.ReadAllText(bindFiles[0]).Contains("hunter2"), "Companion bind form leaked a sensitive default.");
    var loadedForm = await BindFormService.LoadAsync(workspaceRoot, bindSource.ToUpperInvariant());
    Require(loadedForm is not null && loadedForm.Definitions[0].Name == "ID", "Bind form was not restored by its workspace-relative path.");
    var bindRejected = false;
    try { await BindFormService.SaveAsync(workspaceRoot, Path.Combine(root, "outside.sql"), [new("x", "NUMBER", "", "", false, null)]); } catch (InvalidOperationException) { bindRejected = true; }
    Require(bindRejected, "Bind forms outside the workspace must be refused.");
    bindRejected = false;
    try { await BindFormService.SaveAsync(workspaceRoot, bindSource, [new("a", "NUMBER", "", "", false, null), new("A", "DATE", "", "", false, null)]); } catch (InvalidOperationException) { bindRejected = true; }
    Require(bindRejected, "Duplicate bind names must be refused.");
    await BindFormService.SaveAsync(workspaceRoot, bindSource, []);
    Require(await BindFormService.LoadAsync(workspaceRoot, bindSource) is null, "An empty bind form must remove the companion file.");
    var historyRoot = Path.Combine(root, "history");
    var historyFile = Path.Combine(workspaceRoot, "queries", "history.sql");
    await File.WriteAllTextAsync(historyFile, "v1");
    var historySaves = new List<(string Path, byte[] Previous)>();
    WorkspaceFileService.PreviousVersionCaptured = (savedPath, previous) => { historySaves.Add((savedPath, previous)); LocalHistoryService.Capture(savedPath, previous, historyRoot); };
    var firstRead = await WorkspaceFileService.ReadAsync(historyFile);
    var firstSave = await WorkspaceFileService.SaveAsync(historyFile, "v2", firstRead.Version);
    await WorkspaceFileService.SaveAsync(historyFile, "v2", firstSave.Version);
    await WorkspaceFileService.SaveAsync(historyFile, "v3", firstSave.Version);
    WorkspaceFileService.PreviousVersionCaptured = null;
    Require(historySaves.Count == 2 && Encoding.UTF8.GetString(historySaves[0].Previous) == "v1" && Encoding.UTF8.GetString(historySaves[1].Previous) == "v2", "Previous disk content must be captured for real changes only.");
    var versions = LocalHistoryService.List(historyFile, historyRoot);
    Require(versions.Count == 2 && LocalHistoryService.Read(historyFile, versions[0].Id, historyRoot) == "v2" && LocalHistoryService.Read(historyFile, versions[1].Id, historyRoot) == "v1", "History order or content is wrong.");
    var badHistoryId = false;
    try { LocalHistoryService.Read(historyFile, "../x", historyRoot); } catch (InvalidOperationException) { badHistoryId = true; }
    Require(badHistoryId, "History ids must not allow path traversal.");
    for (var index = 0; index < 60; index++) LocalHistoryService.Capture(historyFile, Encoding.UTF8.GetBytes("bulk " + index), historyRoot);
    Require(LocalHistoryService.List(historyFile, historyRoot).Count == LocalHistoryService.MaxEntries, "History must be bounded.");
    LocalHistoryService.Capture(historyFile, new byte[LocalHistoryService.MaxSnapshotBytes + 1], historyRoot);
    Require(LocalHistoryService.List(historyFile, historyRoot).Count == LocalHistoryService.MaxEntries, "Oversized snapshots must be skipped.");
    LocalHistoryService.Clear(historyFile, historyRoot);
    Require(LocalHistoryService.List(historyFile, historyRoot).Count == 0, "History was not cleared.");
    var present = new Func<string, string?>(name => "C:\tools\\" + name + ".exe");
    var absent = new Func<string, string?>(_ => null);
    var launch = ExternalTerminalService.Build("sqlcl", "APP", "FIN_DEV", workspaceRoot, null, present);
    Require(launch.Error is null && launch.Arguments == "/d /k sql APP@FIN_DEV" && launch.WorkingDirectory == workspaceRoot, "SQLcl must start in the project directory with a password-free connect string.");
    Require(ExternalTerminalService.Build("sqlplus", null, null, workspaceRoot, null, present).Arguments == "/d /k sqlplus /nolog", "Without a user the tool starts disconnected.");
    Require(ExternalTerminalService.Build("sqlcl", "APP&calc", "X", workspaceRoot, null, present).Error is not null, "Shell metacharacters must be rejected.");
    Require(ExternalTerminalService.Build("sqlcl", "APP", "X|dir", workspaceRoot, null, present).Error is not null, "Pipes must be rejected.");
    Require(ExternalTerminalService.Build("sqlcl", "APP", "X", workspaceRoot, null, absent).Error!.Contains("not found"), "A missing tool is reported.");
    Require(ExternalTerminalService.Build("shell", null, null, Path.Combine(root, "missing"), null, present).Error is not null, "A missing directory is reported.");
    Require(ExternalTerminalService.Build("rm", null, null, workspaceRoot, null, present).Error is not null, "Unknown tools are rejected.");
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
