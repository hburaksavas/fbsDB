param([int]$DesktopDebugPort = 9348, [switch]$SkipBuild, [switch]$LoadTest, [switch]$ProjectRulesTest, [switch]$DragTest)
$ErrorActionPreference = 'Stop'
$regressionRepo = Split-Path -Parent $PSScriptRoot
$regressionRoot = Join-Path $regressionRepo ('.artifacts\desktop-regression\' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [Guid]::NewGuid().ToString('N').Substring(0, 8))
$regressionApp = Join-Path $regressionRoot 'app'
$regressionDotnet = Join-Path $regressionRepo '.tools\dotnet\dotnet.exe'
if (-not (Test-Path -LiteralPath $regressionDotnet)) { throw 'Run scripts/setup-dotnet.ps1 first.' }
# Refuse to attach to an unrelated application already using this port.
$regressionPortProbe = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $DesktopDebugPort)
try { $regressionPortProbe.Start() } finally { $regressionPortProbe.Stop() }
New-Item -ItemType Directory -Path $regressionRoot -Force | Out-Null
$regressionSettings = Join-Path $regressionRoot 'settings.json'
if ($ProjectRulesTest) {
    $rulesTestFiles = Join-Path $regressionRoot 'files'
    New-Item -ItemType Directory -Path $rulesTestFiles -Force | Out-Null
    [System.IO.File]::WriteAllText($regressionSettings, (@{lastWorkspace=$rulesTestFiles} | ConvertTo-Json))
} else { [System.IO.File]::WriteAllText($regressionSettings, '{}') }
$regressionEnvironment = @{
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=$DesktopDebugPort"
    WEBVIEW2_USER_DATA_FOLDER = (Join-Path $regressionRoot 'webview-profile')
    FBSDB_THEME_SETTINGS_PATH = $regressionSettings
    FBSDB_WORKSPACE_SETTINGS_PATH = $regressionSettings
    FBSDB_CONNECTION_SETTINGS_PATH = $regressionSettings
}
$regressionPreviousEnvironment = @{}
$regressionProcess = $null
Push-Location $regressionRepo
try {
    if (-not $SkipBuild) {
        npm run build
        if ($LASTEXITCODE -ne 0) { throw 'Web build failed.' }
    }
    node scripts/sync-webcontent.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Web content sync failed.' }
    & $regressionDotnet build native/FbsDb/FbsDb.csproj -c Debug -r win-x64 -p:Platform=x64 -p:WindowsPackageType=None "-p:OutDir=$regressionApp\"
    if ($LASTEXITCODE -ne 0) { throw 'Isolated desktop build failed.' }
    foreach ($regressionKey in $regressionEnvironment.Keys) {
        $regressionPreviousEnvironment[$regressionKey] = [Environment]::GetEnvironmentVariable($regressionKey, 'Process')
        [Environment]::SetEnvironmentVariable($regressionKey, $regressionEnvironment[$regressionKey], 'Process')
    }
    $regressionProcess = Start-Process -FilePath (Join-Path $regressionApp 'FbsDb.exe') -WorkingDirectory $regressionApp -WindowStyle Hidden -PassThru
    if ($DragTest) {
        node tests/drag-to-sql-native.mjs "http://127.0.0.1:$DesktopDebugPort" $regressionRoot
    } elseif ($ProjectRulesTest) {
        node tests/project-rules-native.mjs "http://127.0.0.1:$DesktopDebugPort" $regressionRoot
        if ($LASTEXITCODE -ne 0) { throw "Project rules test failed. Artifacts: $regressionRoot" }
        node tests/source-compile-native.mjs "http://127.0.0.1:$DesktopDebugPort" $regressionRoot
        if ($LASTEXITCODE -ne 0) { throw "Source comparison test failed. Artifacts: $regressionRoot" }
        node tests/run-configurations-native.mjs "http://127.0.0.1:$DesktopDebugPort" $regressionRoot
        if ($LASTEXITCODE -ne 0) { throw "Run configuration test failed. Artifacts: $regressionRoot" }
        node tests/script-source-native.mjs "http://127.0.0.1:$DesktopDebugPort" $regressionRoot
    } elseif ($LoadTest) {
        node tests/desktop-load-native.mjs "http://127.0.0.1:$DesktopDebugPort" $regressionRoot
    } else {
        node tests/desktop-regression-native.mjs "http://127.0.0.1:$DesktopDebugPort" $regressionRoot
    }
    if ($LASTEXITCODE -ne 0) { throw "Desktop test failed. Artifacts: $regressionRoot" }
    if (-not $LoadTest -and -not $ProjectRulesTest -and -not $DragTest) {
        node tests/review-improvements-native.mjs "http://127.0.0.1:$DesktopDebugPort" $regressionRoot
        if ($LASTEXITCODE -ne 0) { throw "Review improvement UI tests failed. Artifacts: $regressionRoot" }
    }
    $regressionReportName = if ($ProjectRulesTest) { 'project-rules-report.json' } elseif ($DragTest) { 'drag-to-sql-report.json' } else { 'report.json' }
    Write-Output "Desktop test report: $(Join-Path $regressionRoot $regressionReportName)"
} finally {
    foreach ($regressionKey in $regressionPreviousEnvironment.Keys) {
        [Environment]::SetEnvironmentVariable($regressionKey, $regressionPreviousEnvironment[$regressionKey], 'Process')
    }
    if ($regressionProcess -and -not $regressionProcess.HasExited) { Stop-Process -Id $regressionProcess.Id }
    # Old runs only: this run is among the newest kept. A cleanup problem must not change the test result.
    try {
        node scripts/clean-test-output.mjs --apply
        if ($LASTEXITCODE -ne 0) { Write-Warning 'Could not clean old test output.' }
    } catch { Write-Warning "Could not clean old test output: $_" }
    Pop-Location
}
