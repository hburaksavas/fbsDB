$ErrorActionPreference = "Stop"
$env:NLS_LANG = "TURKISH_TURKEY.AL32UTF8"
$oracleHome = if ($env:ORACLE_HOME -and (Test-Path (Join-Path $env:ORACLE_HOME "bin\sqlplus.exe"))) { $env:ORACLE_HOME } else { "D:\OracleFree26ai\dbhomeFree" }
$sqlplus = Join-Path $oracleHome "bin\sqlplus.exe"
$dataDirectory = "D:\ORACLEFREE26AI\ORADATA\FREE\BANKING_DB"
$repoRoot = Split-Path -Parent $PSScriptRoot

if (-not (Test-Path -LiteralPath $sqlplus)) { throw "sqlplus.exe was not found at $sqlplus. Set ORACLE_HOME to the local Oracle Free home." }

$probe = "SET HEADING OFF FEEDBACK OFF PAGESIZE 0;`nSELECT COUNT(*) FROM v`$pdbs WHERE name = 'BANKING_DB';`nEXIT;"
$pdbCountLines = $probe | & $sqlplus -S "/ as sysdba"
if ($LASTEXITCODE -ne 0) { throw "Could not inspect local Oracle PDBs." }
$pdbCount = ($pdbCountLines | Where-Object { $_.Trim() -match '^\d+$' } | Select-Object -Last 1).Trim()

$randomBytes = New-Object byte[] 12
[Security.Cryptography.RandomNumberGenerator]::Fill($randomBytes)
$demoPassword = "BankDemo_" + [Convert]::ToHexString($randomBytes)

if ($pdbCount -eq "0") {
    if (-not (Test-Path -LiteralPath $dataDirectory)) { New-Item -ItemType Directory -Path $dataDirectory | Out-Null }
    $demoPassword | & $sqlplus -S "/ as sysdba" "@$(Join-Path $repoRoot 'scripts\create-banking-pdb.sql')"
    if ($LASTEXITCODE -ne 0) { throw "Could not create BANKING_DB. Review the Oracle output above." }
} else {
    $openPdb = "ALTER PLUGGABLE DATABASE BANKING_DB OPEN;`nALTER PLUGGABLE DATABASE BANKING_DB SAVE STATE;`nALTER SYSTEM REGISTER;`nEXIT;"
    $openPdb | & $sqlplus -S "/ as sysdba"
    if ($LASTEXITCODE -ne 0) { throw "Could not open BANKING_DB. Review the Oracle output above." }
}

$demoPassword | & $sqlplus -S "/ as sysdba" "@$(Join-Path $repoRoot 'scripts\create-banking-db.sql')"
if ($LASTEXITCODE -ne 0) { throw "Could not create the banking schemas and sample rows. Review the Oracle output above." }
$demoPassword | & $sqlplus -S "/ as sysdba" "@$(Join-Path $repoRoot 'scripts\create-indemnity-schema.sql')"
if ($LASTEXITCODE -ne 0) { throw "Could not create the indemnity schema and sample rows. Review the Oracle output above." }

$settingsPath = Join-Path $env:LOCALAPPDATA "fbsDB\settings.json"
if (Test-Path -LiteralPath $settingsPath) {
    $settings = Get-Content -LiteralPath $settingsPath -Raw | ConvertFrom-Json
    $newProfiles = @(
        [pscustomobject]@{ id = "BANKING_DB_CUSTOMER_APP"; name = "BANKING_DB · Customer"; alias = ""; source = ""; user = "CUSTOMER_APP"; environment = "TEST"; method = "basic"; host = "127.0.0.1"; port = "1521"; service = "BANKING_DB"; targetType = "service"; descriptor = "" },
        [pscustomobject]@{ id = "BANKING_DB_ACCOUNT_APP"; name = "BANKING_DB · Account"; alias = ""; source = ""; user = "ACCOUNT_APP"; environment = "TEST"; method = "basic"; host = "127.0.0.1"; port = "1521"; service = "BANKING_DB"; targetType = "service"; descriptor = "" },
        [pscustomobject]@{ id = "BANKING_DB_LOAN_APP"; name = "BANKING_DB · Loan"; alias = ""; source = ""; user = "LOAN_APP"; environment = "TEST"; method = "basic"; host = "127.0.0.1"; port = "1521"; service = "BANKING_DB"; targetType = "service"; descriptor = "" },
        [pscustomobject]@{ id = "BANKING_DB_INDEMNITY_APP"; name = "BANKING_DB · Indemnity"; alias = ""; source = ""; user = "INDEMNITY_APP"; environment = "TEST"; method = "basic"; host = "127.0.0.1"; port = "1521"; service = "BANKING_DB"; targetType = "service"; descriptor = "" }
    )
    $settings.connectionProfiles = @(@($settings.connectionProfiles | Where-Object { $_.id -notin $newProfiles.id }) + $newProfiles)
    [System.IO.File]::WriteAllText($settingsPath, (ConvertTo-Json $settings -Depth 20), [System.Text.UTF8Encoding]::new($false))
}

Write-Host "BANKING_DB is ready. Service: BANKING_DB · Host: 127.0.0.1 · Port: 1521"
Write-Host "Schemas: CUSTOMER_APP, ACCOUNT_APP, LOAN_APP, INDEMNITY_APP"
Write-Host "Demo password: $demoPassword"
Write-Host "Use the same password for each schema login."
