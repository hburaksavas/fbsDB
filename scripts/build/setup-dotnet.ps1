$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$installDir = Join-Path $repoRoot ".tools\dotnet"
$installer = Join-Path $env:TEMP "fbsdb-dotnet-install.ps1"
# global.json is the single source of the SDK version.
$version = (Get-Content -LiteralPath (Join-Path $repoRoot "global.json") -Raw -Encoding UTF8 | ConvertFrom-Json).sdk.version

Invoke-WebRequest -Uri "https://dot.net/v1/dotnet-install.ps1" -OutFile $installer
try {
    & $installer -Version $version -InstallDir $installDir -NoPath
    if ($LASTEXITCODE -ne 0) { throw "The workspace-local .NET SDK installation failed." }
}
finally {
    Remove-Item -LiteralPath $installer -Force -ErrorAction SilentlyContinue
}
