param(
    [ValidateSet("Debug", "Release")]
    [string]$Configuration = "Debug"
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$outputDirectory = Join-Path $repoRoot "native\FbsDb\bin\x64\$Configuration\net10.0-windows10.0.26100.0\win-x64"
$executable = Join-Path $outputDirectory "FbsDb.exe"

if (-not (Test-Path -LiteralPath $executable -PathType Leaf)) {
    throw "No existing $Configuration desktop build was found at '$executable'. Build the desktop app first; this script does not build or restore anything."
}

$localDotnet = Join-Path $repoRoot ".tools\dotnet"
$previousPath = $env:PATH
try {
    $systemDotnet = Get-Command dotnet.exe -ErrorAction SilentlyContinue
    $useSystemDotnet = $false
    if ($systemDotnet) {
        $systemVersion = & $systemDotnet.Source --version
        $useSystemDotnet = $LASTEXITCODE -eq 0 -and $systemVersion -match '^10\.'
    }
    if (-not $useSystemDotnet -and (Test-Path -LiteralPath (Join-Path $localDotnet "dotnet.exe"))) {
        $env:PATH = "$localDotnet;$env:PATH"
    }
    # Keep the desktop launch flow, but skip compilation and package restore.
    winapp run (Join-Path $repoRoot "native\FbsDb") --no-build --no-restore --detach -c $Configuration --arch x64 -p Platform=x64 -p WindowsPackageType=None
    if ($LASTEXITCODE -ne 0) { throw "The existing fbsDB desktop build failed to launch." }
}
finally {
    $env:PATH = $previousPath
}
