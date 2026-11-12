param([int]$DesktopDebugPort = 9348, [switch]$SkipBuild, [switch]$LoadTest, [switch]$ProjectRulesTest, [switch]$DragTest, [switch]$OracleFlowTest, [switch]$SshTunnelTest, [string]$OracleProfile = 'FBSDB_LOCAL')
$ErrorActionPreference = 'Stop'
$regressionRepo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$regressionRoot = Join-Path $regressionRepo ('.artifacts\desktop-regression\' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [Guid]::NewGuid().ToString('N').Substring(0, 8))
$regressionApp = Join-Path $regressionRoot 'app'
$regressionDotnet = Join-Path $regressionRepo '.tools\dotnet\dotnet.exe'
if (-not (Test-Path -LiteralPath $regressionDotnet)) { throw 'Run scripts/build/setup-dotnet.ps1 first.' }
# Refuse to attach to an unrelated application already using this port.
$regressionPortProbe = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $DesktopDebugPort)
try { $regressionPortProbe.Start() } finally { $regressionPortProbe.Stop() }
New-Item -ItemType Directory -Path $regressionRoot -Force | Out-Null
$regressionSettings = Join-Path $regressionRoot 'settings.json'
if ($ProjectRulesTest) {
    $rulesTestFiles = Join-Path $regressionRoot 'files'
    New-Item -ItemType Directory -Path $rulesTestFiles -Force | Out-Null
    [System.IO.File]::WriteAllText($regressionSettings, (@{lastWorkspace=$rulesTestFiles} | ConvertTo-Json))
} elseif ($OracleFlowTest) {
    # Only the named local test profile is copied, pointed at the test's relay. Its saved credentials stay where they are and are read by the app.
    $oracleSource = Join-Path $env:LOCALAPPDATA 'fbsDB\settings.json'
    $oracleEntry = @((Get-Content -LiteralPath $oracleSource -Raw | ConvertFrom-Json).connectionProfiles | Where-Object { $_.name -eq $OracleProfile })
    if ($oracleEntry.Count -ne 1) { throw "Connection profile '$OracleProfile' was not found." }
    $oracleEntry = $oracleEntry[0]
    if ($oracleEntry.host -notin '127.0.0.1', 'localhost', '::1' -or $oracleEntry.environment -eq 'PROD' -or $oracleEntry.method -ne 'basic') { throw "The Oracle flow test only runs against a local, non-production basic profile." }
    $oracleTargetPort = [string]$oracleEntry.port
    $oracleRelayProbe = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
    $oracleRelayProbe.Start(); $oracleRelayPort = $oracleRelayProbe.LocalEndpoint.Port; $oracleRelayProbe.Stop()
    $oracleEntry.host = '127.0.0.1'; $oracleEntry.port = [string]$oracleRelayPort
    [System.IO.File]::WriteAllText($regressionSettings, (@{connectionProfiles=@($oracleEntry)} | ConvertTo-Json -Depth 6))
} elseif ($SshTunnelTest) {
    # FI-069: the local test profile goes through an SSH tunnel. A stand-in ssh (tests/SessionServicesSmoke/fake-ssh.mjs)
    # opens a real local forward to the database, so Oracle traffic crosses the tunnel; known_hosts is the test's own file.
    $sshSource = Join-Path $env:LOCALAPPDATA 'fbsDB\settings.json'
    $sshEntry = @((Get-Content -LiteralPath $sshSource -Raw | ConvertFrom-Json).connectionProfiles | Where-Object { $_.name -eq $OracleProfile })
    if ($sshEntry.Count -ne 1) { throw "Connection profile '$OracleProfile' was not found." }
    $sshEntry = $sshEntry[0]
    if ($sshEntry.host -notin '127.0.0.1', 'localhost', '::1' -or $sshEntry.environment -eq 'PROD' -or $sshEntry.method -ne 'basic') { throw "The SSH tunnel test only runs against a local, non-production basic profile." }
    $sshEntry | Add-Member -NotePropertyName ssh -NotePropertyValue ([pscustomobject]@{ host = 'unknown.test'; port = 2222; user = 'qa'; keyFile = '' }) -Force
    [System.IO.File]::WriteAllText($regressionSettings, (@{connectionProfiles=@($sshEntry)} | ConvertTo-Json -Depth 6))
    $sshKeyFile = Join-Path $regressionRoot 'ssh_host_key'
    & (Join-Path $env:WINDIR 'System32\OpenSSH\ssh-keygen.exe') -q -t ed25519 -N '""' -f $sshKeyFile
    if ($LASTEXITCODE -ne 0) { throw 'Could not create the test SSH host key.' }
    $sshFake = Join-Path $regressionRepo 'tests\SessionServicesSmoke'
    [System.IO.File]::WriteAllText((Join-Path $regressionRoot 'fake-ssh.cmd'), "@node `"$sshFake\fake-ssh.mjs`" %*`r`n")
    [System.IO.File]::WriteAllText((Join-Path $regressionRoot 'fake-ssh-keyscan.cmd'), "@node `"$sshFake\fake-ssh-keyscan.mjs`" %*`r`n")
} else { [System.IO.File]::WriteAllText($regressionSettings, '{}') }
$regressionEnvironment = @{
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=$DesktopDebugPort"
    WEBVIEW2_USER_DATA_FOLDER = (Join-Path $regressionRoot 'webview-profile')
    FBSDB_THEME_SETTINGS_PATH = $regressionSettings
    FBSDB_LOG_PATH = (Join-Path $regressionRoot 'logs')
    FBSDB_WORKSPACE_SETTINGS_PATH = $regressionSettings
    FBSDB_CONNECTION_SETTINGS_PATH = $regressionSettings
}
if ($SshTunnelTest) {
    $regressionEnvironment.FBSDB_SSH_PATH = Join-Path $regressionRoot 'fake-ssh.cmd'
    $regressionEnvironment.FBSDB_SSH_KEYSCAN_PATH = Join-Path $regressionRoot 'fake-ssh-keyscan.cmd'
    $regressionEnvironment.FBSDB_SSH_KNOWN_HOSTS = Join-Path $regressionRoot 'known_hosts'
    $regressionEnvironment.FAKE_HOST_KEY = (Get-Content -LiteralPath "$sshKeyFile.pub" -Raw).Split(' ')[1]
}
$regressionPreviousEnvironment = @{}
$regressionProcess = $null
Push-Location $regressionRepo
try {
    if (-not $SkipBuild) {
        npm run build
        if ($LASTEXITCODE -ne 0) { throw 'Web build failed.' }
    }
    node scripts/build/sync-webcontent.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Web content sync failed.' }
    & $regressionDotnet build native/FbsDb/FbsDb.csproj -c Debug -r win-x64 -p:Platform=x64 -p:WindowsPackageType=None "-p:OutDir=$regressionApp\"
    if ($LASTEXITCODE -ne 0) { throw 'Isolated desktop build failed.' }
    foreach ($regressionKey in $regressionEnvironment.Keys) {
        $regressionPreviousEnvironment[$regressionKey] = [Environment]::GetEnvironmentVariable($regressionKey, 'Process')
        [Environment]::SetEnvironmentVariable($regressionKey, $regressionEnvironment[$regressionKey], 'Process')
    }
    $regressionProcess = Start-Process -FilePath (Join-Path $regressionApp 'FbsDb.exe') -WorkingDirectory $regressionApp -WindowStyle Hidden -PassThru
    if ($OracleFlowTest) {
        node tests/oracle-flow-native.mjs "http://127.0.0.1:$DesktopDebugPort" $regressionRoot $oracleRelayPort $oracleTargetPort
    } elseif ($SshTunnelTest) {
        node tests/ssh-tunnel-native.mjs "http://127.0.0.1:$DesktopDebugPort" $regressionRoot $OracleProfile
    } elseif ($DragTest) {
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
    if (-not $LoadTest -and -not $ProjectRulesTest -and -not $DragTest -and -not $OracleFlowTest -and -not $SshTunnelTest) {
        node tests/review-improvements-native.mjs "http://127.0.0.1:$DesktopDebugPort" $regressionRoot
        if ($LASTEXITCODE -ne 0) { throw "Review improvement UI tests failed. Artifacts: $regressionRoot" }
    }
    $regressionReportName = if ($ProjectRulesTest) { 'project-rules-report.json' } elseif ($DragTest) { 'drag-to-sql-report.json' } elseif ($OracleFlowTest) { 'oracle-flow-report.json' } elseif ($SshTunnelTest) { 'ssh-tunnel-report.json' } else { 'report.json' }
    Write-Output "Desktop test report: $(Join-Path $regressionRoot $regressionReportName)"
} finally {
    foreach ($regressionKey in $regressionPreviousEnvironment.Keys) {
        [Environment]::SetEnvironmentVariable($regressionKey, $regressionPreviousEnvironment[$regressionKey], 'Process')
    }
    if ($regressionProcess -and -not $regressionProcess.HasExited) { Stop-Process -Id $regressionProcess.Id }
    # Old runs only: this run is among the newest kept. A cleanup problem must not change the test result.
    try {
        node scripts/test/clean-test-output.mjs --apply
        if ($LASTEXITCODE -ne 0) { Write-Warning 'Could not clean old test output.' }
    } catch { Write-Warning "Could not clean old test output: $_" }
    Pop-Location
}
