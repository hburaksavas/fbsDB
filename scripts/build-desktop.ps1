$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$localDotnet = Join-Path $repoRoot ".tools\dotnet"
$project = Join-Path $repoRoot "native\FbsDb\FbsDb.csproj"

if (-not (Test-Path (Join-Path $localDotnet "dotnet.exe"))) {
    & (Join-Path $PSScriptRoot "setup-dotnet.ps1")
}

$env:PATH = "$localDotnet;$env:PATH"
Push-Location $repoRoot
try {
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "The editor bundle build failed." }

    node scripts/sync-webcontent.mjs
    if ($LASTEXITCODE -ne 0) { throw "The editor bundle sync failed." }

    & (Join-Path $localDotnet "dotnet.exe") build $project -c Debug -r win-x64 -p:Platform=x64 -p:WindowsPackageType=None
    if ($LASTEXITCODE -ne 0) { throw "The WinUI app build failed." }
}
finally {
    Pop-Location
}
