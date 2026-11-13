$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$dotnetExe = & (Join-Path $PSScriptRoot "resolve-dotnet.ps1")

# winapp starts dotnet from PATH, so the resolved SDK has to come first there.
$previousPath = $env:PATH
$env:PATH = "$(Split-Path -Parent $dotnetExe);$previousPath"
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
