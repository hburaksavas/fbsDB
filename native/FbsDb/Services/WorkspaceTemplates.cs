using System.Text;
using System.Text.Json;
namespace FbsDb.Services;

public static class WorkspaceTemplates
{
    public static async Task CreateAsync(string path, string template)
    {
        if (template is not ("blank" or "oracle-package" or "migrations")) throw new InvalidOperationException("Unknown workspace template.");
        path = Path.GetFullPath(path);
        if (Directory.Exists(path) || File.Exists(path)) throw new IOException("The template requires a new workspace folder. Existing files are preserved.");
        Directory.CreateDirectory(path);
        if (template == "blank") return;
        try { await WriteTemplateAsync(path, template); }
        catch
        {
            // The folder did not exist before this call, so removing it cannot discard user files.
            try { Directory.Delete(path, true); } catch (IOException) { } catch (UnauthorizedAccessException) { }
            throw;
        }
    }

    private static async Task WriteTemplateAsync(string path, string template)
    {
        foreach (var area in new[] { "packages", "scripts", "migrations", "tests", ".fbsdb" }) Directory.CreateDirectory(Path.Combine(path, area));
        var rules = WorkspaceService.DefaultProjectRules with { PackagePairs = [new("packages/{name}.pks", "packages/{name}.pkb")], TestPatterns = ["tests/{name}_test.sql"], Project = WorkspaceService.DefaultProjectOptions };
        var files = new Dictionary<string, string>
        {
            [".fbsdb/workspace.json"] = JsonSerializer.Serialize(new { projectRules = WorkspaceService.ValidateProjectRules(rules) }, new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase, WriteIndented = true }),
            ["scripts/session.sql"] = "-- Review your connection before running. This file is not run on creation.\nSELECT SYS_CONTEXT('USERENV', 'CURRENT_SCHEMA') AS current_schema FROM dual;\n",
            ["README.md"] = "# Oracle workspace\n\nGenerated locally; no SQL has been executed and no connection is configured.\n\nUse Project rules to set saved profile references and run defaults.\nReview source comparisons before compiling packages. Tests are drafts and run only on explicit request.\n"
        };
        if (template == "oracle-package")
        {
            files["packages/example_api.pks"] = "CREATE OR REPLACE PACKAGE example_api AS\n  -- A public no-op example. Replace it with your API.\n  PROCEDURE ping;\nEND example_api;\n/\n";
            files["packages/example_api.pkb"] = "CREATE OR REPLACE PACKAGE BODY example_api AS\n  PROCEDURE ping IS\n  BEGIN\n    NULL;\n  END ping;\nEND example_api;\n/\n";
            files["tests/example_api_test.sql"] = "-- Example call draft; this is not a configured test framework.\n-- Compile the reviewed specification and body before explicitly running.\nBEGIN\n  example_api.ping;\nEND;\n/\n";
        }
        else files["migrations/V001__initial.sql"] = "-- Initial migration draft. Add and review schema changes here.\n-- No migration tracking or application is performed by this template.\n";
        foreach (var file in files)
        {
            var target = Path.GetFullPath(Path.Combine(path, file.Key));
            if (!target.StartsWith(path + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)) throw new IOException("Template target is outside its workspace.");
            await using var stream = new FileStream(target, FileMode.CreateNew, FileAccess.Write, FileShare.None, 4096, true);
            await stream.WriteAsync(Encoding.UTF8.GetBytes(file.Value));
        }
    }
}
