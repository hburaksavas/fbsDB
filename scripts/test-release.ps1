param([Parameter(Mandatory=$true)][string]$OracleProfile, [string]$CertificateThumbprint = '', [switch]$RequireSigned)
$ErrorActionPreference = 'Stop'
$releaseRepo = Split-Path -Parent $PSScriptRoot
Push-Location $releaseRepo
try {
    npm test
    if ($LASTEXITCODE -ne 0) { throw 'JavaScript regression failed.' }
    npm run typecheck:bridge
    if ($LASTEXITCODE -ne 0) { throw 'Bridge types failed.' }
    npm run typecheck:domain
    if ($LASTEXITCODE -ne 0) { throw 'Domain types failed.' }
    npm run test:load -- --profile smoke --enforce-budgets
    if ($LASTEXITCODE -ne 0) { throw 'Load smoke budgets failed.' }
    & ./scripts/test-native.ps1
    & ./scripts/test-desktop.ps1
    & ./.tools/dotnet/dotnet.exe run --project tests/OracleLiveRegression/OracleLiveRegression.csproj -c Release -- $OracleProfile
    if ($LASTEXITCODE -ne 0) { throw 'Live Oracle release checks failed.' }
    & ./scripts/package-desktop.ps1 -CertificateThumbprint $CertificateThumbprint -RequireSigned:$RequireSigned
    & ./scripts/test-portable.ps1
    if ($LASTEXITCODE -ne 0) { throw 'Portable smoke failed.' }
    & ./scripts/package-hash.ps1 -ArchivePath ./artifacts/fbsDB-win-x64.zip | Format-List
}
finally { Pop-Location }
