# Prints the path of a dotnet.exe whose SDK satisfies global.json. Every build and test script asks here,
# so nobody has to install an SDK by hand: the system SDK is used when it is new enough, otherwise the
# workspace-local one under .tools/dotnet, which is downloaded on first use.
$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$localDotnet = Join-Path $repoRoot ".tools\dotnet\dotnet.exe"

function Test-DotnetSdk([string]$Executable) {
    if (-not (Test-Path -LiteralPath $Executable -PathType Leaf)) { return $false }
    # Run from the repository root, so the .NET host applies global.json itself and fails when no installed
    # SDK satisfies it. Its complaint goes to stderr, which must not stop the script.
    $previousPreference = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    Push-Location $repoRoot
    try {
        & $Executable --version 2>$null | Out-Null
        return $LASTEXITCODE -eq 0
    }
    catch { return $false }
    finally {
        Pop-Location
        $ErrorActionPreference = $previousPreference
    }
}

$systemDotnet = Get-Command dotnet.exe -ErrorAction SilentlyContinue
if ($systemDotnet -and (Test-DotnetSdk $systemDotnet.Source)) { return $systemDotnet.Source }

if (-not (Test-DotnetSdk $localDotnet)) {
    & (Join-Path $PSScriptRoot "setup-dotnet.ps1") | Out-Host
    if (-not (Test-DotnetSdk $localDotnet)) { throw "The workspace-local .NET SDK does not satisfy global.json." }
}
return $localDotnet
