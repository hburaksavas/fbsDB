$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$qaRoot = Join-Path $repoRoot ('.artifacts\workspace-phase12-qa-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path (Join-Path $qaRoot 'Alpha\queries'),(Join-Path $qaRoot 'Alpha\target'),(Join-Path $qaRoot 'Beta'),(Join-Path $qaRoot 'Relocated') -Force | Out-Null
Set-Content -LiteralPath (Join-Path $qaRoot 'Alpha\queries\first.sql') -Value 'SELECT 1 AS phase12_token FROM dual;' -Encoding utf8
Set-Content -LiteralPath (Join-Path $qaRoot 'Alpha\outside.sql') -Value 'SELECT 2 AS phase12_token FROM dual;' -Encoding utf8
$settingsPath = Join-Path $qaRoot 'settings.json'
$catalog = @(
    @{id='alpha';path=(Join-Path $qaRoot 'Alpha');name='Alpha';description='';pinned=$false;lastOpened='2026-10-29T12:00:00Z'},
    @{id='beta';path=(Join-Path $qaRoot 'Beta');name='Beta';description='';pinned=$false;lastOpened='2026-10-28T12:00:00Z'},
    @{id='missing';path=(Join-Path $qaRoot 'Missing');name='Missing';description='';pinned=$false;lastOpened='2026-10-27T12:00:00Z'}
)
@{fbsdbSettingsVersion=2;lastWorkspace=(Join-Path $qaRoot 'Alpha');workspaceCatalog=$catalog;connectionProfiles=@();connectionOrganization=@{version=1;folders=@();groups=@();assignments=@{}}} | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $settingsPath -Encoding utf8NoBOM
Set-Content -LiteralPath (Join-Path $repoRoot '.artifacts\workspace-phase12-qa-path.txt') -Value $settingsPath -Encoding utf8NoBOM
Write-Output $settingsPath
