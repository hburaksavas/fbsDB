using System.Text.Json;
using System.Text.Json.Nodes;

namespace FbsDb.Services;

public sealed record WorkspaceRegistration(string Id, string Path, string Name, string Description, bool Pinned, DateTimeOffset? LastOpened);
public sealed record WorkspaceRegistrationView(string Id, string Path, string Name, string Description, bool Pinned, DateTimeOffset? LastOpened, bool Available, bool Active);

public sealed partial class WorkspaceService
{
    private static readonly JsonSerializerOptions CatalogJson = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };
    private List<WorkspaceRegistration> _catalog = [];
    private static bool SamePath(string? a, string? b) => string.Equals(a, b, StringComparison.OrdinalIgnoreCase);
    private void RefreshRecent() => _recent = _catalog.OrderByDescending(w => w.Pinned).ThenByDescending(w => w.LastOpened).Select(w => w.Path).ToArray();
    public string DisplayName => _catalog.FirstOrDefault(w => SamePath(w.Path, _root))?.Name ?? Path.GetFileName(_root) ?? "No workspace";
    public IReadOnlyList<WorkspaceRegistrationView> Catalog => _catalog.OrderByDescending(w => w.Pinned).ThenByDescending(w => w.LastOpened)
        .Select(w => new WorkspaceRegistrationView(w.Id, w.Path, w.Name, w.Description, w.Pinned, w.LastOpened, Directory.Exists(w.Path), SamePath(w.Path, _root))).ToArray();

    private async Task SaveCatalogAsync(List<WorkspaceRegistration> next, string? root)
    {
        var rules = SamePath(root, _root) ? ProjectRules : await ReadRulesAtRootAsync(root);
        var gate = NativeSettingsStore.Gate(_appSettingsPath); await gate.WaitAsync();
        try
        {
            var settings = await NativeSettingsStore.ReadAsync(_appSettingsPath);
            settings["workspaceCatalog"] = JsonSerializer.SerializeToNode(next, CatalogJson);
            settings["recentWorkspaces"] = JsonSerializer.SerializeToNode(next.OrderByDescending(w => w.LastOpened).Select(w => w.Path).Take(10));
            settings["lastWorkspace"] = root;
            await NativeSettingsStore.WriteAsync(_appSettingsPath, settings);
            _catalog = next; _root = root; ProjectRules = rules; RefreshRecent();
        }
        finally { gate.Release(); }
    }

    public async Task UpdateRegistrationAsync(string id, string name, string description, bool pinned)
    {
        if (string.IsNullOrWhiteSpace(name) || name.Length > 100 || description.Length > 1000) throw new InvalidOperationException("Enter a name up to 100 characters and a description up to 1000 characters.");
        if (!_catalog.Any(w => w.Id == id)) throw new InvalidOperationException("Workspace registration no longer exists.");
        await SaveCatalogAsync(_catalog.Select(w => w.Id == id ? w with { Name = name.Trim(), Description = description.Trim(), Pinned = pinned } : w).ToList(), _root);
    }

    public Task ForgetAsync(string id)
    {
        var item = _catalog.Single(w => w.Id == id);
        return SaveCatalogAsync(_catalog.Where(w => w.Id != id).ToList(), SamePath(item.Path, _root) ? null : _root);
    }

    // Relocation changes only the local registration. The user explicitly confirms the selected folder.
    public Task RelocateAsync(string id, string path)
    {
        var item = _catalog.Single(w => w.Id == id);
        var target = Path.TrimEndingDirectorySeparator(Path.GetFullPath(path));
        if (!Directory.Exists(target)) throw new DirectoryNotFoundException("The selected folder is unavailable.");
        if (_catalog.Any(w => w.Id != id && SamePath(w.Path, target))) throw new InvalidOperationException("This folder is already registered.");
        return SaveCatalogAsync(_catalog.Select(w => w.Id == id ? w with { Path = target } : w).ToList(), SamePath(item.Path, _root) ? target : _root);
    }

    public string ValidateEntryPath(string path, bool allowRoot = false) => SafePath(path, allowRoot);
    public IReadOnlyList<WorkspaceSqlFile> ScopedSqlFiles(string? scope)
    {
        if (string.IsNullOrEmpty(scope)) return ListSqlFiles();
        var folder = SafePath(scope, true);
        return ListSqlFiles().Where(file => file.Path.StartsWith(folder.TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)).ToArray();
    }

    public async Task<WorkspaceEntry> DuplicateEntryAsync(string source, string name)
    {
        source = SafePath(source); ValidateName(name);
        if (!IsWorkspaceSourceFile(source) || !IsWorkspaceSourceFile(name)) throw new InvalidOperationException("Choose an Oracle source file and a supported destination extension.");
        var target = SafePath(Path.Combine(Path.GetDirectoryName(source)!, name));
        await using (var input = new FileStream(source, FileMode.Open, FileAccess.Read, FileShare.Read, 4096, true))
        await using (var output = new FileStream(target, FileMode.CreateNew, FileAccess.Write, FileShare.None, 4096, true))
            await input.CopyToAsync(output);
        return new(target, Path.GetRelativePath(_root!, target).Replace('\\', '/'), name, false);
    }

    public void ValidateRecyclePath(string path)
    {
        var full = SafePath(path);
        if (!File.Exists(full) && !Directory.Exists(full)) throw new FileNotFoundException("The item no longer exists.");
        if (Directory.Exists(full))
        {
            // Do not traverse junctions or links hidden below the selected folder.
            var pending = new Stack<string>(); pending.Push(full);
            while (pending.TryPop(out var directory))
                foreach (var item in Directory.EnumerateFileSystemEntries(directory))
                {
                    var attributes = File.GetAttributes(item);
                    if (attributes.HasFlag(FileAttributes.ReparsePoint)) throw new InvalidOperationException("Folders containing linked files or directories cannot be recycled here.");
                    if (attributes.HasFlag(FileAttributes.Directory)) pending.Push(item);
                }
        }
    }

    public async Task RecycleEntryAsync(string path, Action<string, bool> recycle)
    {
        path = SafePath(path); ValidateRecyclePath(path);
        var configPath = WorkspaceSettingsPath;
        var gate = NativeSettingsStore.Gate(configPath); await gate.WaitAsync();
        try
        {
            var settings = await NativeSettingsStore.ReadAsync(configPath);
            ValidateRecycleSettings(settings);
            var mappings = settings["fileConnections"] as JsonObject;
            if (mappings is not null)
                foreach (var key in mappings.Select(item => item.Key).ToArray())
                    if (RemapPath(key, path, path) is not null) mappings.Remove(key);
            recycle(path, Directory.Exists(path));
            if (mappings is not null)
                try { await NativeSettingsStore.WriteAsync(configPath, settings); }
                catch (Exception ex) { throw new IOException("The item was moved to the Recycle Bin, but its saved connection references could not be cleared. Refresh the workspace. " + ex.Message, ex); }
        }
        finally { gate.Release(); }
    }

    private static void ValidateRecycleSettings(JsonObject settings)
    {
        if (settings.ContainsKey(NativeSettingsStore.VersionKey) && (settings[NativeSettingsStore.VersionKey] is not JsonValue value || !value.TryGetValue<int>(out var version) || version < 1 || version > NativeSettingsStore.CurrentVersion))
            throw new InvalidOperationException("Workspace settings have an unsupported version. Nothing was recycled.");
        if (settings["fileConnections"] is not null and not JsonObject)
            throw new InvalidOperationException("Workspace connection references are invalid. Nothing was recycled.");
    }
}
