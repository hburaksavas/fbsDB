$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$project = Join-Path $repoRoot "tests\WorkspaceSmoke\FbsDb.WorkspaceSmoke.csproj"
$dotnetExe = & (Join-Path (Split-Path -Parent $PSScriptRoot) "build\resolve-dotnet.ps1")

& $dotnetExe run --project $project -c Release
if ($LASTEXITCODE -ne 0) { throw "Workspace smoke checks failed." }
