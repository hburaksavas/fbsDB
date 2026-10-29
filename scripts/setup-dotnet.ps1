$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$installDir = Join-Path $repoRoot ".tools\dotnet"
$installer = Join-Path $env:TEMP "fbsdb-dotnet-install.ps1"

Invoke-WebRequest -Uri "https://dot.net/v1/dotnet-install.ps1" -OutFile $installer
try {
    & $installer -Channel 10.0 -Version 10.0.402 -InstallDir $installDir -NoPath
    if ($LASTEXITCODE -ne 0) { throw "The workspace-local .NET SDK installation failed." }
}
finally {
    Remove-Item -LiteralPath $installer -Force -ErrorAction SilentlyContinue
}
