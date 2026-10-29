$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$localDotnet = Join-Path $repoRoot ".tools\dotnet"
$project = Join-Path $repoRoot "tests\WorkspaceSmoke\FbsDb.WorkspaceSmoke.csproj"

if (-not (Test-Path (Join-Path $localDotnet "dotnet.exe"))) {
    & (Join-Path $PSScriptRoot "setup-dotnet.ps1")
    if ($LASTEXITCODE -ne 0) { throw "The local .NET SDK setup failed." }
}

& (Join-Path $localDotnet "dotnet.exe") run --project $project -c Release
if ($LASTEXITCODE -ne 0) { throw "Workspace smoke checks failed." }
