using System.Text.Json;
using System.Text.Json.Nodes;

namespace FbsDb.Services;

public sealed record WorkspaceMove(string Source, string Destination);
public sealed record WorkspaceWorksetFile(string Path, int Line = 1, int Column = 1);
public sealed record WorkspaceWorkset(string Id, string Name, IReadOnlyList<WorkspaceWorksetFile> Files, string? ActivePath);
public sealed record WorkspaceRecycleResult(IReadOnlyList<string> Removed, string? Error);

public sealed partial class WorkspaceService
{
    public IReadOnlyList<string> NormalizeSelection(IEnumerable<string> paths)
    {
        var selected = paths.Select(path => SafePath(path)).Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
        if (selected.Length is < 1 or > 200) throw new InvalidOperationException("Select between 1 and 200 items.");
        foreach (var path in selected)
            if (!File.Exists(path) && !Directory.Exists(path)) throw new FileNotFoundException("An item no longer exists.", path);
        return selected.Where(path => !selected.Any(parent => Directory.Exists(parent) && path.StartsWith(parent + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))).ToArray();
    }

    private void RemapReferences(JsonObject settings, IReadOnlyList<WorkspaceMove> moves)
    {
        string Map(string path) => moves.Select(move => RemapPath(path, move.Source, move.Destination)).FirstOrDefault(mapped => mapped is not null) ?? path;
        if (settings["fileConnections"] is JsonObject mappings)
        {
            var items = mappings.Select(item => (Path: item.Key, Value: item.Value?.DeepClone())).ToArray();
            foreach (var item in items) if (Map(item.Path) != item.Path) mappings.Remove(item.Path);
            foreach (var item in items) if (Map(item.Path) != item.Path) mappings[Map(item.Path)] = item.Value;
        }
        if (settings["worksets"] is JsonArray worksets)
            foreach (var node in worksets.OfType<JsonObject>())
            {
                if (node["files"] is JsonArray files)
                    foreach (var file in files.OfType<JsonObject>())
                        if (file["path"]?.GetValue<string>() is { } relative)
                            file["path"] = Path.GetRelativePath(_root!, Map(Path.GetFullPath(Path.Combine(_root!, relative)))).Replace('\\', '/');
                if (node["activePath"]?.GetValue<string>() is { } active)
                    node["activePath"] = Path.GetRelativePath(_root!, Map(Path.GetFullPath(Path.Combine(_root!, active)))).Replace('\\', '/');
            }
    }

    public async Task<IReadOnlyList<WorkspaceMove>> MoveEntriesAsync(IEnumerable<string> paths, string destination)
    {
        var sources = NormalizeSelection(paths); var folder = SafePath(destination, true);
        if (!Directory.Exists(folder)) throw new DirectoryNotFoundException("The destination folder is unavailable.");
        var moves = sources.Select(source => new WorkspaceMove(source, SafePath(Path.Combine(folder, Path.GetFileName(source))))).ToArray();
        if (moves.Select(move => move.Destination).Distinct(StringComparer.OrdinalIgnoreCase).Count() != moves.Length)
            throw new IOException("Selected items have the same name. Choose separate destinations.");
        foreach (var move in moves)
        {
            if (move.Destination.Equals(move.Source, StringComparison.OrdinalIgnoreCase) || move.Destination.StartsWith(move.Source + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
                throw new InvalidOperationException("Choose a different folder outside the selected items.");
            if (File.Exists(move.Destination) || Directory.Exists(move.Destination)) throw new IOException("An item named " + Path.GetFileName(move.Destination) + " already exists. Nothing was moved.");
        }
        var gate = NativeSettingsStore.Gate(WorkspaceSettingsPath); await gate.WaitAsync();
        var completed = new List<(WorkspaceMove Move, bool Directory)>();
        try
        {
            var settings = await NativeSettingsStore.ReadAsync(WorkspaceSettingsPath);
            RemapReferences(settings, moves);
            foreach (var move in moves)
            {
                var directory = Directory.Exists(move.Source);
                if (directory) Directory.Move(move.Source, move.Destination); else File.Move(move.Source, move.Destination);
                completed.Add((move, directory));
            }
            if (settings.ContainsKey("fileConnections") || settings.ContainsKey("worksets")) await NativeSettingsStore.WriteAsync(WorkspaceSettingsPath, settings);
            return moves;
        }
        catch (Exception error)
        {
            var failures = new List<string>();
            foreach (var item in completed.AsEnumerable().Reverse())
                try { if (item.Directory) Directory.Move(item.Move.Destination, item.Move.Source); else File.Move(item.Move.Destination, item.Move.Source); }
                catch (Exception rollback) { failures.Add(rollback.Message); }
            if (failures.Count > 0) throw new IOException("Some moves could not be reversed. Refresh the workspace. " + string.Join(" ", failures), error);
            throw;
        }
        finally { gate.Release(); }
    }

    public async Task<WorkspaceRecycleResult> RecycleEntriesAsync(IEnumerable<string> paths, Action<string, bool> recycle)
    {
        var sources = NormalizeSelection(paths);
        foreach (var path in sources) ValidateRecyclePath(path);
        ValidateRecycleSettings(await NativeSettingsStore.ReadAsync(WorkspaceSettingsPath));
        var removed = new List<string>();
        foreach (var path in sources)
            try { await RecycleEntryAsync(path, recycle); removed.Add(path); }
            catch (Exception error) { if (!File.Exists(path) && !Directory.Exists(path)) removed.Add(path); return new(removed, error.Message); }
        return new(removed, null);
    }

    private string WorksetPath(string relative)
    {
        if (Path.IsPathRooted(relative) || !relative.EndsWith(".sql", StringComparison.OrdinalIgnoreCase)) throw new InvalidOperationException("Worksets contain only relative SQL paths inside this workspace.");
        return SafePath(Path.Combine(_root ?? throw new InvalidOperationException("Open a workspace first."), relative));
    }

    public async Task<IReadOnlyList<WorkspaceWorkset>> ListWorksetsAsync()
    {
        if (_root is null) return [];
        var settings = await NativeSettingsStore.ReadAsync(WorkspaceSettingsPath);
        return settings["worksets"]?.Deserialize<List<WorkspaceWorkset>>(CatalogJson) ?? [];
    }

    public async Task<WorkspaceWorkset> SaveWorksetAsync(string? id, string name, IReadOnlyList<WorkspaceWorksetFile>? files, string? activePath)
    {
        if (string.IsNullOrWhiteSpace(name) || name.Trim().Length > 80) throw new InvalidOperationException("Enter a workset name up to 80 characters.");
        if (_root is null) throw new InvalidOperationException("Open a workspace first.");
        var gate = NativeSettingsStore.Gate(WorkspaceSettingsPath); await gate.WaitAsync();
        try
        {
            var settings = await NativeSettingsStore.ReadAsync(WorkspaceSettingsPath);
            var worksets = settings["worksets"]?.Deserialize<List<WorkspaceWorkset>>(CatalogJson) ?? [];
            var existing = id is null ? null : worksets.SingleOrDefault(item => item.Id == id) ?? throw new InvalidOperationException("The workset no longer exists.");
            if (worksets.Any(item => item.Id != id && item.Name.Equals(name.Trim(), StringComparison.OrdinalIgnoreCase))) throw new InvalidOperationException("A workset with this name already exists.");
            if (existing is null && worksets.Count >= 50) throw new InvalidOperationException("A workspace supports up to 50 worksets.");
            var selected = files ?? existing?.Files ?? [];
            if (selected.Count is < 1 or > 100) throw new InvalidOperationException("Save between 1 and 100 SQL files in a workset.");
            var normalized = selected.Select(file => new WorkspaceWorksetFile(Path.GetRelativePath(_root, WorksetPath(file.Path)).Replace('\\', '/'), Math.Clamp(file.Line, 1, 1000000), Math.Clamp(file.Column, 1, 1000000)))
                .DistinctBy(file => file.Path, StringComparer.OrdinalIgnoreCase).ToArray();
            var active = files is null ? existing?.ActivePath : activePath;
            if (active is not null) { active = Path.GetRelativePath(_root, WorksetPath(active)).Replace('\\', '/'); if (!normalized.Any(file => SamePath(file.Path, active))) active = null; }
            var workset = new WorkspaceWorkset(existing?.Id ?? Guid.NewGuid().ToString("N"), name.Trim(), normalized, active);
            settings["worksets"] = JsonSerializer.SerializeToNode(worksets.Where(item => item.Id != workset.Id).Append(workset), CatalogJson);
            await NativeSettingsStore.WriteAsync(WorkspaceSettingsPath, settings);
            return workset;
        }
        finally { gate.Release(); }
    }

    public async Task DeleteWorksetAsync(string id)
    {
        var gate = NativeSettingsStore.Gate(WorkspaceSettingsPath); await gate.WaitAsync();
        try
        {
            var settings = await NativeSettingsStore.ReadAsync(WorkspaceSettingsPath);
            var worksets = settings["worksets"]?.Deserialize<List<WorkspaceWorkset>>(CatalogJson) ?? [];
            settings["worksets"] = JsonSerializer.SerializeToNode(worksets.Where(item => item.Id != id), CatalogJson);
            await NativeSettingsStore.WriteAsync(WorkspaceSettingsPath, settings);
        }
        finally { gate.Release(); }
    }

    public string ResolveWorksetFile(string relative) => WorksetPath(relative);
}
