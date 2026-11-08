# Sets up, or with -Remove undoes, what the live regression needs beyond the FBSQA user's own schema: grants from another owner, and rights to create identity columns, triggers and views.
# Changes the local BANKING_DB test database through operating system authentication; never run it elsewhere.
param([switch]$Remove)
$ErrorActionPreference = 'Stop'
$oracleHome = if ($env:ORACLE_HOME -and (Test-Path (Join-Path $env:ORACLE_HOME 'bin\sqlplus.exe'))) { $env:ORACLE_HOME } else { 'D:\OracleFree26ai\dbhomeFree' }
$sqlplus = Join-Path $oracleHome 'bin\sqlplus.exe'
if (-not (Test-Path -LiteralPath $sqlplus)) { throw "sqlplus.exe was not found at $sqlplus. Set ORACLE_HOME to the local Oracle Free home." }
$script = Join-Path $PSScriptRoot $(if ($Remove) { 'remove-fbsqa-fixtures.sql' } else { 'setup-fbsqa-fixtures.sql' })
& $sqlplus -S -L '/ as sysdba' "@$script"
if ($LASTEXITCODE -ne 0) { throw "The fixture script failed. Review the Oracle output above." }
Write-Output $(if ($Remove) { 'FBSQA fixtures removed.' } else { 'FBSQA fixtures are ready.' })
