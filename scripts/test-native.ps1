param([string]$DotnetExe = '', [string]$ReportDirectory = '')
$ErrorActionPreference = 'Stop'
$nativeTestRepo = Split-Path -Parent $PSScriptRoot
if (-not $DotnetExe) {
    $nativeTestSystemDotnet = Get-Command dotnet.exe -ErrorAction SilentlyContinue
    $DotnetExe = if ($nativeTestSystemDotnet) { $nativeTestSystemDotnet.Source } else { Join-Path $nativeTestRepo '.tools\dotnet\dotnet.exe' }
}
if (-not (Test-Path -LiteralPath $DotnetExe -PathType Leaf)) { throw 'A .NET SDK matching global.json is required.' }
if (-not $ReportDirectory) { $ReportDirectory = Join-Path $nativeTestRepo '.artifacts\ci\native' }
$ReportDirectory = [System.IO.Path]::GetFullPath($ReportDirectory)
New-Item -ItemType Directory -Path $ReportDirectory -Force | Out-Null

# Explicit allowlist: OracleAcceptance, OracleLiveRegression, PagingSmoke and
# TabSessionsSmoke require live credentials/database access and are not CI tests.
$nativeTestProjects = @(
    'tests/BridgeContractSmoke/BridgeContractSmoke.csproj'
    'tests/ConnectionOrganizationSmoke/FbsDb.ConnectionOrganizationSmoke.csproj'
    'tests/ConnectionSmoke/FbsDb.ConnectionSmoke.csproj'
    'tests/MiniToolsSmoke/FbsDb.MiniToolsSmoke.csproj'
    'tests/native-sql/NativeSqlTests.csproj'
    'tests/SessionServicesSmoke/SessionServicesSmoke.csproj'
    'tests/ThemePaletteSmoke/FbsDb.ThemePaletteSmoke.csproj'
    'tests/workspace-development/WorkspaceDevelopmentTests.csproj'
    'tests/WorkspaceAdvancedSmoke/WorkspaceAdvancedSmoke.csproj'
    'tests/WorkspaceSmoke/FbsDb.WorkspaceSmoke.csproj'
)
$nativeTestResults = @()
$nativeTestStarted = [DateTimeOffset]::UtcNow
Push-Location $nativeTestRepo
try {
    foreach ($nativeTestProject in $nativeTestProjects) {
        $nativeTestName = [System.IO.Path]::GetFileNameWithoutExtension($nativeTestProject)
        $nativeTestLog = Join-Path $ReportDirectory ($nativeTestName + '.log')
        $nativeTestClock = [System.Diagnostics.Stopwatch]::StartNew()
        Write-Output "Running $nativeTestProject"
        & $DotnetExe run --project $nativeTestProject -c Release --no-launch-profile 2>&1 | Tee-Object -FilePath $nativeTestLog
        $nativeTestExitCode = $LASTEXITCODE
        $nativeTestResults += [pscustomobject]@{
            project = $nativeTestProject
            status = $(if ($nativeTestExitCode -eq 0) { 'passed' } else { 'failed' })
            exitCode = $nativeTestExitCode
            elapsedMs = $nativeTestClock.ElapsedMilliseconds
            log = [System.IO.Path]::GetFileName($nativeTestLog)
        }
    }
} finally {
    $nativeTestSummary = [pscustomobject]@{
        startedAt = $nativeTestStarted.ToString('o')
        completedAt = [DateTimeOffset]::UtcNow.ToString('o')
        status = $(if ($nativeTestResults.Count -eq $nativeTestProjects.Count -and @($nativeTestResults | Where-Object status -eq 'failed').Count -eq 0) { 'passed' } else { 'failed' })
        results = $nativeTestResults
    }
    $nativeTestSummary | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $ReportDirectory 'summary.json') -Encoding utf8
    Pop-Location
}
if ($nativeTestSummary.status -ne 'passed') { throw "Native smoke checks failed. See $ReportDirectory" }
Write-Output "PASS $($nativeTestResults.Count) native smoke projects (no Oracle database)."
