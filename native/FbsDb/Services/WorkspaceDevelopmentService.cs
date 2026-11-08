using System.Diagnostics;
using System.Security.Cryptography;
using System.Text;

namespace FbsDb.Services;

public sealed class WorkspaceDevelopmentService(WorkspaceService workspace)
{
    private sealed record Replacement(string Path, byte[] Original, byte[] Updated, string Text);
    private sealed record ReplacementPlan(string Root, DateTime Created, IReadOnlyList<Replacement> Files);
    private readonly Dictionary<string, ReplacementPlan> _previews = new();
    private readonly SemaphoreSlim _gate = new(1, 1);
    private readonly SemaphoreSlim _gitGate = new(1, 1);

    private string SafeSqlPath(string path)
    {
        var root = Path.TrimEndingDirectorySeparator(workspace.Root ?? throw new InvalidOperationException("Open a workspace first."));
        var full = Path.GetFullPath(path);
        if (!workspace.IsUnderRoot(full) || !workspace.IsWorkspaceSourceFile(full)) throw new InvalidOperationException("Only SQL files inside the workspace are supported.");
        for (var cursor = full; !string.Equals(cursor, root, StringComparison.OrdinalIgnoreCase); cursor = Path.GetDirectoryName(cursor)!)
            if ((File.Exists(cursor) || Directory.Exists(cursor)) && File.GetAttributes(cursor).HasFlag(FileAttributes.ReparsePoint)) throw new InvalidOperationException("Linked files and directories are excluded.");
        return full;
    }

    private static Task<(int ExitCode, string Output)> GitAsync(string root, params string[] arguments) => GitAsync(root, TimeSpan.FromSeconds(8), arguments);
    private static async Task<(int ExitCode, string Output)> GitAsync(string root, TimeSpan timeout, params string[] arguments)
    {
        using var cancellation = new CancellationTokenSource(timeout);
        var start = new ProcessStartInfo("git") { UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true, StandardOutputEncoding = Encoding.UTF8, StandardErrorEncoding = Encoding.UTF8 };
        foreach (var argument in new[] { "--literal-pathspecs", "-C", root }.Concat(arguments)) start.ArgumentList.Add(argument);
        start.Environment["GIT_OPTIONAL_LOCKS"] = "0";
        using var process = Process.Start(start) ?? throw new InvalidOperationException("Git could not be started.");
        try
        {
            var output = ReadLimitedAsync(process.StandardOutput, 2 * 1024 * 1024, cancellation.Token);
            var error = ReadLimitedAsync(process.StandardError, 65536, cancellation.Token);
            await Task.WhenAll(output, error, process.WaitForExitAsync(cancellation.Token));
            return (process.ExitCode, process.ExitCode == 0 ? await output : await error);
        }
        catch { if (!process.HasExited) process.Kill(true); throw; }
    }
    private static async Task<string> ReadLimitedAsync(StreamReader reader, int limit, CancellationToken token)
    {
        var text = new StringBuilder(); var buffer = new char[4096]; int count;
        while ((count = await reader.ReadAsync(buffer.AsMemory(), token)) > 0) { text.Append(buffer, 0, count); if (text.Length > limit) throw new InvalidOperationException("Git output exceeds the display limit."); }
        return text.ToString();
    }
    public async Task<WorkspaceGitState> GitStateAsync()
    {
        var root = workspace.Root ?? throw new InvalidOperationException("Open a workspace first.");
        var repository = await GitAsync(root, "rev-parse", "--show-toplevel");
        if (repository.ExitCode != 0) return new(false, "", [], "Workspace is not in a Git repository.");
        var status = await GitAsync(root, "-c", "core.quotepath=false", "status", "--porcelain=v1", "-z", "--untracked-files=all", "--", ".");
        if (status.ExitCode != 0) throw new InvalidOperationException(status.Output);
        // Status lists the whole repository so staged files outside the SQL list can be reported before a commit.
        var all = await GitAsync(root, "-c", "core.quotepath=false", "status", "--porcelain=v1", "-z", "--untracked-files=no");
        var otherStaged = new List<string>();
        var files = new List<WorkspaceGitFile>(); var entries = status.Output.Split('\0');
        for (var index = 0; index < entries.Length; index++)
        {
            var entry=entries[index];
            if (entry.Length < 4 || entry[2] != ' ') continue;
            var code = entry[..2]; var relative = entry[3..];
            if (code.Contains('R') || code.Contains('C')) index++;
            if (!workspace.IsWorkspaceSourceFile(relative)) continue;
            var path = Path.GetFullPath(Path.Combine(repository.Output.Trim(), relative));
            if (!workspace.IsUnderRoot(path)) continue;
            files.Add(new(path, Path.GetRelativePath(root,path).Replace('\\','/'), code.Trim(), code[0] is ' ' or '?' ? "" : code[0].ToString(), code[1] == ' ' ? "" : code[1].ToString()));
        }
        if (all.ExitCode == 0)
        {
            var listed = files.Where(file => file.Index.Length > 0).Select(file => file.Path).ToHashSet(StringComparer.OrdinalIgnoreCase);
            var repositoryEntries = all.Output.Split('\0');
            for (var index = 0; index < repositoryEntries.Length; index++)
            {
                var entry = repositoryEntries[index];
                if (entry.Length < 4 || entry[2] != ' ') continue;
                if (entry[0] is 'R' or 'C' || entry[1] is 'R' or 'C') index++;
                if (entry[0] is ' ' or '?') continue;
                var path = Path.GetFullPath(Path.Combine(repository.Output.Trim(), entry[3..]));
                if (!listed.Contains(path)) otherStaged.Add(entry[3..].Replace('\\', '/'));
            }
        }
        var branch = await GitAsync(root, "branch", "--show-current");
        return new(true, branch.Output.Trim(), files, null) { OtherStaged = otherStaged };
    }
    public async Task<WorkspaceGitDiff> GitDiffAsync(string path)
    {
        path = SafeSqlPath(path); var root = workspace.Root!;
        var diff = await GitAsync(root, "diff", "--no-ext-diff", "--no-textconv", "HEAD", "--", path);
        if (diff.ExitCode != 0) { var staged = await GitAsync(root,"diff","--cached","--no-ext-diff","--no-textconv","--",path); var unstaged = await GitAsync(root,"diff","--no-ext-diff","--no-textconv","--",path); diff = (0,staged.Output+unstaged.Output); }
        var commit = await GitAsync(root, "log", "-1", "--format=%h%n%an%n%aI%n%s", "--", path);
        var stagedOnly = await GitAsync(root, "diff", "--cached", "--no-ext-diff", "--no-textconv", "--", path);
        var unstagedOnly = await GitAsync(root, "diff", "--no-ext-diff", "--no-textconv", "--", path);
        var text = diff.Output;
        if (string.IsNullOrWhiteSpace(text) && File.Exists(path))
        {
            var tracked = await GitAsync(root, "ls-files", "--error-unmatch", "--", path);
            if (tracked.ExitCode != 0) { var bytes = await File.ReadAllBytesAsync(path); if (bytes.Length > 2 * 1024 * 1024) throw new InvalidOperationException("SQL file exceeds the diff limit."); var lines = Decode(bytes).Text.Replace("\r\n", "\n").TrimEnd('\n').Split('\n'); text = string.Join('\n', lines.Select((line,index)=>$"+ {index+1}: {line}")); unstagedOnly = (0, $"@@ -0,0 +1,{lines.Length} @@ untracked file\n" + string.Join('\n', lines.Select(line => "+" + line))); }
        }
        return new(path, text, commit.ExitCode == 0 ? commit.Output : "No commit for this SQL file.") { Staged = stagedOnly.ExitCode == 0 ? stagedOnly.Output : "", Unstaged = unstagedOnly.ExitCode == 0 ? unstagedOnly.Output : "" };
    }

    // Stages or unstages SQL files inside the workspace only; deletions are staged as removals.
    public async Task<WorkspaceGitState> GitStageAsync(IReadOnlyList<string> paths, bool stage)
    {
        if (paths.Count == 0) throw new InvalidOperationException("Choose at least one SQL file.");
        var root = workspace.Root ?? throw new InvalidOperationException("Open a workspace first.");
        var safe = paths.Select(SafeSqlPath).Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
        await _gitGate.WaitAsync();
        try
        {
            if (stage)
            {
                var added = await GitAsync(root, ["add", "-A", "--", .. safe]);
                if (added.ExitCode != 0) throw new InvalidOperationException(added.Output.Trim());
            }
            else
            {
                var restored = await GitAsync(root, ["restore", "--staged", "--", .. safe]);
                if (restored.ExitCode != 0)
                {
                    // Before the first commit there is no HEAD to restore from; removing from the index unstages.
                    var head = await GitAsync(root, "rev-parse", "--verify", "-q", "HEAD");
                    if (head.ExitCode == 0) throw new InvalidOperationException(restored.Output.Trim());
                    var removed = await GitAsync(root, ["rm", "--cached", "-q", "--", .. safe]);
                    if (removed.ExitCode != 0) throw new InvalidOperationException(removed.Output.Trim());
                }
            }
        }
        finally { _gitGate.Release(); }
        return await GitStateAsync();
    }

    // Commits what is staged, as git itself would: hooks run and nothing is pushed.
    public async Task<WorkspaceGitCommit> GitCommitAsync(string message)
    {
        var root = workspace.Root ?? throw new InvalidOperationException("Open a workspace first.");
        if (string.IsNullOrWhiteSpace(message)) throw new InvalidOperationException("Enter a commit message.");
        await _gitGate.WaitAsync();
        try
        {
            var staged = await GitAsync(root, "diff", "--cached", "--quiet");
            if (staged.ExitCode == 0) throw new InvalidOperationException("Nothing is staged to commit.");
            var commit = await GitAsync(root, TimeSpan.FromSeconds(120), "commit", "-m", message.Trim());
            if (commit.ExitCode != 0) throw new InvalidOperationException(string.IsNullOrWhiteSpace(commit.Output) ? "Git refused the commit." : commit.Output.Trim());
            var head = await GitAsync(root, "log", "-1", "--format=%h%n%s");
            var lines = head.Output.Split('\n');
            return new(lines.ElementAtOrDefault(0)?.Trim() ?? "", lines.ElementAtOrDefault(1)?.Trim() ?? "");
        }
        finally { _gitGate.Release(); }
    }

    private static (string Text, Encoding Encoding, int Bom) Decode(byte[] bytes)
    {
        if (bytes.AsSpan().StartsWith(new byte[] {0xef,0xbb,0xbf})) return (new UTF8Encoding(false,true).GetString(bytes,3,bytes.Length-3),new UTF8Encoding(true,true),3);
        if (bytes.AsSpan().StartsWith(new byte[] {0xff,0xfe})) return (new UnicodeEncoding(false,true,true).GetString(bytes,2,bytes.Length-2),new UnicodeEncoding(false,true,true),2);
        if (bytes.AsSpan().StartsWith(new byte[] {0xfe,0xff})) return (new UnicodeEncoding(true,true,true).GetString(bytes,2,bytes.Length-2),new UnicodeEncoding(true,true,true),2);
        return (new UTF8Encoding(false,true).GetString(bytes),new UTF8Encoding(false,true),0);
    }
    public async Task<WorkspaceReplacePreview> PreviewReplaceAsync(string search, string replacement, bool caseSensitive, IReadOnlyList<string> excluded, string? scope = null)
    {
        if (string.IsNullOrEmpty(search)) throw new InvalidOperationException("Enter literal text to find.");
        await _gate.WaitAsync();
        try
        {
            var excludedSet = excluded.Select(Path.GetFullPath).ToHashSet(StringComparer.OrdinalIgnoreCase);
            var result = new List<WorkspaceReplaceFile>(); var plan = new List<Replacement>(); var skipped = new List<string>();
            long bytesScanned = 0;
            foreach (var file in workspace.ScopedSqlFiles(scope))
            {
                if (excludedSet.Contains(file.Path)) { skipped.Add(file.RelativePath + ": unsaved editor changes"); continue; }
                try
                {
                    var path = SafeSqlPath(file.Path); var length = new FileInfo(path).Length;
                    if (length > 2 * 1024 * 1024 || bytesScanned + length > 20 * 1024 * 1024 || result.Count >= 100) { skipped.Add(file.RelativePath + ": preview size limit"); continue; }
                    bytesScanned += length;
                    var bytes = await File.ReadAllBytesAsync(path); var decoded = Decode(bytes);
                    var updated = decoded.Text.Replace(search, replacement, caseSensitive ? StringComparison.Ordinal : StringComparison.OrdinalIgnoreCase);
                    if (decoded.Text == updated) continue;
                    var encoded = decoded.Encoding.GetBytes(updated); var updatedBytes = decoded.Encoding.GetPreamble().Concat(encoded).ToArray();
                    plan.Add(new(path,bytes,updatedBytes,updated));
                    result.Add(new(path,file.RelativePath,decoded.Text,updated));
                }
                catch (Exception error) when (error is IOException or UnauthorizedAccessException or DecoderFallbackException or InvalidOperationException) { skipped.Add(file.RelativePath + ": " + error.Message); }
            }
            _previews.Clear(); var id = Guid.NewGuid().ToString("N");
            _previews[id] = new(workspace.Root!,DateTime.UtcNow,plan);
            return new(id,result,skipped);
        }
        finally { _gate.Release(); }
    }
    public async Task<WorkspaceReplaceResult> ApplyReplaceAsync(string previewId, IReadOnlyList<string> selected, IReadOnlyList<string> excluded)
    {
        await _gate.WaitAsync();
        try
        {
            if (!_previews.Remove(previewId,out var plan) || plan.Root != workspace.Root || DateTime.UtcNow-plan.Created > TimeSpan.FromMinutes(10)) throw new InvalidOperationException("Replace preview expired; preview again.");
            var chosen = selected.Select(Path.GetFullPath).ToHashSet(StringComparer.OrdinalIgnoreCase);
            var blocked = excluded.Select(Path.GetFullPath).ToHashSet(StringComparer.OrdinalIgnoreCase);
            var applied = new List<WorkspaceReplacedFile>(); var skipped = new List<string>();
            foreach (var file in plan.Files.Where(file=>chosen.Contains(file.Path)))
            {
                string? temporary = null;
                try
                {
                    var path = SafeSqlPath(file.Path);
                    if (blocked.Contains(path)) throw new InvalidOperationException("File now has unsaved editor changes.");
                    // Lock writers while checking the reviewed bytes; publish a fully written replacement atomically.
                    temporary = Path.Combine(Path.GetDirectoryName(path)!,".fbsdb-replace-"+Guid.NewGuid().ToString("N")+".tmp");
                    await File.WriteAllBytesAsync(temporary,file.Updated);
                    await using var stream = new FileStream(path,FileMode.Open,FileAccess.Read,FileShare.Read|FileShare.Delete);
                    if (stream.Length != file.Original.Length) throw new InvalidOperationException("File changed since preview.");
                    var current = new byte[file.Original.Length]; await stream.ReadExactlyAsync(current);
                    if (!CryptographicOperations.FixedTimeEquals(SHA256.HashData(current),SHA256.HashData(file.Original))) throw new InvalidOperationException("File changed since preview.");
                    File.Replace(temporary,path,null); temporary=null;
                    applied.Add(new(path,file.Text,Convert.ToHexString(SHA256.HashData(file.Updated))));
                }
                catch (Exception error) when (error is IOException or UnauthorizedAccessException or InvalidOperationException) { skipped.Add(file.Path+": "+error.Message); }
                finally { if (temporary is not null && File.Exists(temporary)) File.Delete(temporary); }
            }
            return new(applied,skipped);
        }
        finally { _gate.Release(); }
    }
}
// Index and WorkTree are the porcelain X and Y codes; an empty Index means nothing of the file is staged.
public sealed record WorkspaceGitFile(string Path,string RelativePath,string Status,string Index = "",string WorkTree = "");
public sealed record WorkspaceGitState(bool Repository,string Branch,IReadOnlyList<WorkspaceGitFile> Files,string? Message) { public IReadOnlyList<string> OtherStaged { get; init; } = []; }
public sealed record WorkspaceGitDiff(string Path,string Diff,string Commit) { public string Staged { get; init; } = ""; public string Unstaged { get; init; } = ""; }
public sealed record WorkspaceGitCommit(string Hash,string Subject);
public sealed record WorkspaceReplaceFile(string Path,string RelativePath,string Before,string After);
public sealed record WorkspaceReplacePreview(string Id,IReadOnlyList<WorkspaceReplaceFile> Files,IReadOnlyList<string> Skipped);
public sealed record WorkspaceReplacedFile(string Path,string Content,string? DiskVersion = null);
public sealed record WorkspaceReplaceResult(IReadOnlyList<WorkspaceReplacedFile> Applied,IReadOnlyList<string> Skipped);
