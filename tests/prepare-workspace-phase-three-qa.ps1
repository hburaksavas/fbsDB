$ErrorActionPreference = 'Stop'
$settingsPath = & (Join-Path $PSScriptRoot 'prepare-workspace-management-qa.ps1')
$qaRoot = Split-Path -Parent $settingsPath
Set-Content -LiteralPath (Join-Path $qaRoot 'Alpha\queries\first.sql') -Value "SELECT 1 FROM dual;`nSELECT 2 FROM dual;" -Encoding utf8
Set-Content -LiteralPath (Join-Path $qaRoot 'Alpha\queries\second.sql') -Value 'SELECT 3 FROM dual;' -Encoding utf8
Set-Content -LiteralPath (Join-Path $qaRoot 'Alpha\queries\third.sql') -Value 'SELECT 4 FROM dual;' -Encoding utf8
Write-Output $settingsPath
