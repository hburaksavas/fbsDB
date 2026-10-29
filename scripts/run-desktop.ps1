$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$localDotnet = Join-Path $repoRoot ".tools\dotnet"

if (-not (Test-Path (Join-Path $localDotnet "dotnet.exe"))) {
    & (Join-Path $PSScriptRoot "setup-dotnet.ps1")
    if ($LASTEXITCODE -ne 0) { throw "The local .NET SDK setup failed." }
}

$env:PATH = "$localDotnet;$env:PATH"
Push-Location $repoRoot
try {
    & (Join-Path $PSScriptRoot "build-desktop.ps1")
    if ($LASTEXITCODE -ne 0) { throw "The fbsDB desktop build failed." }

    winapp run native/FbsDb -p WindowsPackageType=None
    if ($LASTEXITCODE -ne 0) { throw "The fbsDB desktop app failed to build or launch." }
}
finally {
    Pop-Location
}
