using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace FbsDb.Services;

public sealed record SourceAssociation(string Extension, string Type);
public sealed record PackagePathPair(string Specification, string Body);
public sealed record ProjectBindVariable(string Name,string Type,bool Required=false,string Description="");
public sealed record ProjectRunSettings(int TimeoutSeconds=0,int PageSize=1000,bool ContinueOnError=false);
public sealed record ProjectDictionaryTerm(string Name,string Abbreviation,string Aliases="");
public sealed record ProjectNamingDictionary(string Style,IReadOnlyList<ProjectDictionaryTerm> Terms);
public sealed record WorkspaceProjectOptions(IReadOnlyDictionary<string,string> Areas,IReadOnlyList<string> ConnectionIds,string? DefaultConnectionId,IReadOnlyList<ProjectBindVariable> Variables,ProjectRunSettings Run,ProjectNamingDictionary? Dictionary=null);
public sealed record WorkspaceProjectRules(int Version, IReadOnlyList<SourceAssociation> Associations, IReadOnlyList<PackagePathPair> PackagePairs, IReadOnlyList<string> TestPatterns,WorkspaceProjectOptions? Project=null);
public sealed record ProjectRulesSnapshot(WorkspaceProjectRules Rules, string Revision);

public sealed partial class WorkspaceService
{
    public static WorkspaceProjectOptions DefaultProjectOptions => new(new Dictionary<string,string>{{"packages","packages"},{"migrations","migrations"},{"scripts","scripts"},{"tests","tests"}},[],null,[],new(),new("snake",[]));
    public static WorkspaceProjectOptions ValidateProjectOptions(WorkspaceProjectOptions? input)
    {
        var project=input??DefaultProjectOptions;
        var areaKeys=new[]{"packages","migrations","scripts","tests"};
        if(project.Areas is null||project.Areas.Count!=4||project.Areas.Keys.Any(key=>!areaKeys.Contains(key))||project.ConnectionIds is null||project.ConnectionIds.Count>64||project.Variables is null||project.Variables.Count>128||project.Run is null)throw new InvalidOperationException("Invalid project areas, connections, variables or run settings.");
        var areas=new Dictionary<string,string>();
        foreach(var pair in project.Areas){
            var path=pair.Value?.Replace('\\','/');
            if(string.IsNullOrWhiteSpace(path)||path.Length>240||Path.IsPathRooted(path)||path.Split('/').Any(part=>string.IsNullOrWhiteSpace(part)||part.StartsWith('.')||part is "bin" or "obj" or "node_modules"||part.IndexOfAny(Path.GetInvalidFileNameChars())>=0||part.EndsWith('.')||part.EndsWith(' ')))throw new InvalidOperationException("Project areas must be visible relative workspace folders.");
            areas[pair.Key]=path;
        }
        if(project.ConnectionIds.Any(id=>string.IsNullOrWhiteSpace(id)||id.Length>250||id.Any(char.IsControl))||project.ConnectionIds.Distinct(StringComparer.OrdinalIgnoreCase).Count()!=project.ConnectionIds.Count||!string.IsNullOrEmpty(project.DefaultConnectionId)&&!project.ConnectionIds.Contains(project.DefaultConnectionId,StringComparer.OrdinalIgnoreCase))throw new InvalidOperationException("Choose unique saved profile IDs and a default from the project connections.");
        var types=new[]{"VARCHAR2","NUMBER","DATE","TIMESTAMP","CLOB"};
        if(project.Variables.Any(item=>item is null||!Regex.IsMatch(item.Name??"",@"^[A-Za-z][A-Za-z0-9_]{0,127}$")||!types.Contains(item.Type)||item.Description is null||item.Description.Length>1000)||project.Variables.Select(item=>item.Name).Distinct(StringComparer.OrdinalIgnoreCase).Count()!=project.Variables.Count)throw new InvalidOperationException("Project variables require unique bind names, supported types and descriptions up to 1000 characters. Values are entered at execution.");
        if(project.Run.TimeoutSeconds is <0 or >86400||!new[]{100,500,1000,5000,10000}.Contains(project.Run.PageSize))throw new InvalidOperationException("Project run settings have an unsupported timeout or page size.");
        var dictionary=project.Dictionary??new ProjectNamingDictionary("snake",[]);
        if(!new[]{"snake","camel","pascal","upper"}.Contains(dictionary.Style)||dictionary.Terms is null||dictionary.Terms.Count>100)throw new InvalidOperationException("Project dictionary needs a supported style and at most 100 terms.");
        var spellings=new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach(var term in dictionary.Terms){
            if(term is null||!Regex.IsMatch(term.Name??"",@"^[A-Za-z][A-Za-z0-9]{0,63}$")||!Regex.IsMatch(term.Abbreviation??"",@"^[A-Za-z][A-Za-z0-9]{0,63}$")||term.Aliases is null||term.Aliases.Length>500)throw new InvalidOperationException("Dictionary terms and abbreviations need letters or digits and may be up to 64 characters.");
            var aliases=term.Aliases.Split(',',StringSplitOptions.TrimEntries|StringSplitOptions.RemoveEmptyEntries);
            if(aliases.Length>10||aliases.Any(alias=>!Regex.IsMatch(alias,@"^[A-Za-z][A-Za-z0-9]{0,63}$")))throw new InvalidOperationException("Use at most 10 comma-separated aliases per dictionary term.");
            foreach(var spelling in new[]{term.Name!,term.Abbreviation!}.Concat(aliases))if(!spellings.Add(spelling))throw new InvalidOperationException("Dictionary spellings must be unique across terms.");
        }
        return project with {Areas=areas,DefaultConnectionId=string.IsNullOrEmpty(project.DefaultConnectionId)?null:project.DefaultConnectionId,Variables=project.Variables.Select(item=>item with {Name=item.Name.ToUpperInvariant()}).ToArray(),Dictionary=dictionary};
    }
    public static WorkspaceProjectRules DefaultProjectRules => new(1,
        [new(".sql", "SQL"), new(".pks", "PACKAGE"), new(".pkb", "PACKAGE BODY"), new(".prc", "PROCEDURE"), new(".fnc", "FUNCTION"), new(".trg", "TRIGGER")],
        [], ["tests/test_{name}.sql", "tests/{name}.test.sql"],DefaultProjectOptions);
    public WorkspaceProjectRules ProjectRules { get; private set; } = DefaultProjectRules;
    public IEnumerable<string> WorkspaceSourceExtensions => ProjectRules.Associations.Select(item => item.Extension);
    public bool IsWorkspaceSourceFile(string path) => WorkspaceSourceExtensions.Contains(Path.GetExtension(path), StringComparer.OrdinalIgnoreCase);

    public static WorkspaceProjectRules ValidateProjectRules(WorkspaceProjectRules rules)
    {
        if (rules.Version != 1 || rules.Associations is null || rules.PackagePairs is null || rules.TestPatterns is null || rules.Associations.Count is < 1 or > 32 || rules.PackagePairs.Count > 16 || rules.TestPatterns.Count > 32)
            throw new InvalidOperationException("Unsupported project rules or too many entries.");
        var types = new[] { "SQL", "PACKAGE", "PACKAGE BODY", "PROCEDURE", "FUNCTION", "TRIGGER" };
        if (rules.Associations.Any(item => item is null || !Regex.IsMatch(item.Extension ?? "", @"^\.[A-Za-z0-9_]{1,12}$") || !types.Contains(item.Type)) || rules.Associations.Select(item => item.Extension).Distinct(StringComparer.OrdinalIgnoreCase).Count() != rules.Associations.Count || !rules.Associations.Any(item => item.Extension.Equals(".sql", StringComparison.OrdinalIgnoreCase) && item.Type == "SQL"))
            throw new InvalidOperationException("Use unique extensions and supported Oracle types. Keep .sql associated with SQL.");
        string Pattern(string pattern)
        {
            if (string.IsNullOrWhiteSpace(pattern) || pattern.Length > 240) throw new InvalidOperationException("Enter a relative source pattern up to 240 characters.");
            var value = pattern.Replace('\\', '/');
            if (value.Split("{name}").Length != 2 || value.Split("{directory}").Length > 2 || value.Contains("{directory}") && !value.StartsWith("{directory}/")) throw new InvalidOperationException("Patterns require one {name}; optional {directory}/ must appear at the start.");
            var sample = value.Replace("{name}", "example").Replace("{directory}", "folder");
            if (Path.IsPathRooted(sample) || sample.Split('/').Any(part => string.IsNullOrWhiteSpace(part) || part is "." or ".." || part.StartsWith('.') || part is "bin" or "obj" or "node_modules" || part.IndexOfAny(Path.GetInvalidFileNameChars()) >= 0 || part.Contains('{') || part.Contains('}') || part.EndsWith('.') || part.EndsWith(' ')) || !rules.Associations.Any(item => Path.GetExtension(sample).Equals(item.Extension, StringComparison.OrdinalIgnoreCase)))
                throw new InvalidOperationException("Patterns must stay inside visible workspace folders and use an associated extension.");
            return value;
        }
        return rules with { Project=ValidateProjectOptions(rules.Project), Associations = rules.Associations.Select(item => item with { Extension = item.Extension.ToLowerInvariant() }).ToArray(), PackagePairs = rules.PackagePairs.Select(pair => pair is null ? throw new InvalidOperationException("Invalid package path pair.") : new PackagePathPair(Pattern(pair.Specification), Pattern(pair.Body))).ToArray(), TestPatterns = rules.TestPatterns.Select(Pattern).Distinct(StringComparer.OrdinalIgnoreCase).ToArray() };
    }

    private static WorkspaceProjectRules RulesFromSettings(JsonObject settings) => settings.ContainsKey("projectRules")
        ? ValidateProjectRules(settings["projectRules"]?.Deserialize<WorkspaceProjectRules>(CatalogJson) ?? throw new InvalidOperationException("Invalid project rules.")) : DefaultProjectRules;
    private static string RulesRevision(WorkspaceProjectRules rules) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(rules, CatalogJson))));
    private static string ProjectRulesPath(string root)
    {
        var path=Path.Combine(Path.GetFullPath(root),".fbsdb","workspace.json");
        foreach(var entry in new[]{Path.GetFullPath(root),Path.GetDirectoryName(path)!,path})
            if((File.Exists(entry)||Directory.Exists(entry))&&File.GetAttributes(entry).HasFlag(FileAttributes.ReparsePoint))throw new InvalidOperationException("Linked project settings are not supported.");
        return path;
    }
    private static async Task<WorkspaceProjectRules> ReadRulesAtRootAsync(string? root) => root is null ? DefaultProjectRules : RulesFromSettings(await NativeSettingsStore.ReadAsync(ProjectRulesPath(root)));
    public async Task LoadProjectRulesAsync() => ProjectRules = await ReadRulesAtRootAsync(_root);
    public async Task<ProjectRulesSnapshot> GetProjectRulesAsync(string root)
    {
        if (!SamePath(root, _root)) throw new InvalidOperationException("The workspace changed. Reopen project rules.");
        var rules = await ReadRulesAtRootAsync(root);
        if (!SamePath(root, _root)) throw new InvalidOperationException("The workspace changed. Reopen project rules.");
        ProjectRules = rules;
        return new(rules, RulesRevision(rules));
    }
    public async Task<ProjectRulesSnapshot> SaveProjectRulesAsync(string root, WorkspaceProjectRules rules, string expectedRevision)
    {
        if (!SamePath(root, _root)) throw new InvalidOperationException("The workspace changed. Reopen project rules.");
        rules = ValidateProjectRules(rules);
        var path = ProjectRulesPath(root);
        var gate = NativeSettingsStore.Gate(path); await gate.WaitAsync();
        try
        {
            var settings = await NativeSettingsStore.ReadAsync(path);
            if (RulesRevision(RulesFromSettings(settings)) != expectedRevision) throw new InvalidOperationException("Project rules changed on disk. Reopen the dialog before saving.");
            if (!SamePath(root, _root)) throw new InvalidOperationException("The workspace changed. Reopen project rules.");
            settings["projectRules"] = JsonSerializer.SerializeToNode(rules, CatalogJson);
            await NativeSettingsStore.WriteAsync(path, settings);
            ProjectRules = rules;
            return new(rules, RulesRevision(rules));
        }
        finally { gate.Release(); }
    }
}
