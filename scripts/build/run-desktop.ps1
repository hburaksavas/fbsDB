$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$localDotnet = Join-Path $repoRoot ".tools\dotnet"

$systemDotnet = Get-Command dotnet.exe -ErrorAction SilentlyContinue
$useSystemDotnet = $false
if ($systemDotnet) {
    $systemVersion = & $systemDotnet.Source --version
    $useSystemDotnet = $LASTEXITCODE -eq 0 -and $systemVersion -match '^10\.'
}

$previousPath = $env:PATH
if (-not $useSystemDotnet) {
    $env:PATH = "$localDotnet;$previousPath"
}
Push-Location $repoRoot
try {
    & (Join-Path $PSScriptRoot "build-desktop.ps1")
    if ($LASTEXITCODE -ne 0) { throw "The fbsDB desktop build failed." }

    winapp run native/FbsDb -p WindowsPackageType=None
    if ($LASTEXITCODE -ne 0) { throw "The fbsDB desktop app failed to build or launch." }
}
finally {
    Pop-Location
    $env:PATH = $previousPath
}
