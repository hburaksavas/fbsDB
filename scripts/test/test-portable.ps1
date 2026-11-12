param([string]$ArchivePath, [int]$DesktopDebugPort = 9351)
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if (-not $ArchivePath) { $ArchivePath = Join-Path $repoRoot 'artifacts\fbsDB-win-x64.zip' }
$runRoot = Join-Path $repoRoot ('.artifacts\portable-smoke\' + [Guid]::NewGuid().ToString('N'))
$extracted = Join-Path $runRoot 'Taşınmış portable paket'
New-Item -ItemType Directory -Path $extracted -Force | Out-Null
Expand-Archive -LiteralPath $ArchivePath -DestinationPath $extracted
$rootEntries = @(Get-ChildItem -LiteralPath $extracted | Sort-Object Name | Select-Object -ExpandProperty Name)
if (($rootEntries -join '|') -ne 'app|fbsDB.exe|README-portable.txt') { throw "Unexpected portable root entries: $rootEntries" }
foreach ($file in @('app\FbsDb.exe', 'app\Assets\AppIcon.ico', 'app\Assets\AppIcon.png', 'app\WebContent\index.html')) {
    if (-not (Test-Path -LiteralPath (Join-Path $extracted $file))) { throw "Missing $file" }
}
$portProbe = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $DesktopDebugPort)
try { $portProbe.Start() } finally { $portProbe.Stop() }
$settings = Join-Path $runRoot 'settings.json'
[IO.File]::WriteAllText($settings, '{}')
$environment = @{
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=$DesktopDebugPort"
    WEBVIEW2_USER_DATA_FOLDER = (Join-Path $runRoot 'webview-profile')
    FBSDB_THEME_SETTINGS_PATH = $settings
    FBSDB_LOG_PATH = (Join-Path $runRoot 'logs')
    FBSDB_WORKSPACE_SETTINGS_PATH = $settings
    FBSDB_CONNECTION_SETTINGS_PATH = $settings
}
$previous = @{}
$launcher = $null
try {
    foreach ($name in $environment.Keys) {
        $previous[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
        [Environment]::SetEnvironmentVariable($name, $environment[$name], 'Process')
    }
    # Use an unrelated working directory and a relocated Unicode path.
    $launcher = Start-Process -FilePath (Join-Path $extracted 'fbsDB.exe') -WorkingDirectory $env:TEMP -WindowStyle Hidden -PassThru
    if (-not $launcher.WaitForExit(15000)) { throw 'The portable launcher did not finish.' }
    if ($launcher.ExitCode -ne 0) { throw "Launcher failed: $($launcher.ExitCode)" }
    node (Join-Path $repoRoot 'tests\portable-native.mjs') "http://127.0.0.1:$DesktopDebugPort"
    if ($LASTEXITCODE -ne 0) { throw 'The extracted portable desktop did not become ready.' }
    $expectedApp = Join-Path $extracted 'app\FbsDb.exe'
    $app = Get-Process FbsDb -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $expectedApp } | Select-Object -First 1
    if (-not $app) { throw 'The portable application process could not be found.' }
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class PortableIconProbe {
    [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr window, uint message, IntPtr wParam, IntPtr lParam);
    [DllImport("shell32.dll", CharSet = CharSet.Unicode)] public static extern uint ExtractIconEx(string path, int index, IntPtr large, IntPtr small, uint count);
}
'@
    $app.Refresh()
    $big = [PortableIconProbe]::SendMessage($app.MainWindowHandle, 0x7F, [IntPtr]1, [IntPtr]::Zero)
    $small = [PortableIconProbe]::SendMessage($app.MainWindowHandle, 0x7F, [IntPtr]::Zero, [IntPtr]::Zero)
    if ($big -eq [IntPtr]::Zero -or $small -eq [IntPtr]::Zero) { throw 'The running portable window is missing its large or small icon.' }
    foreach ($exe in @((Join-Path $extracted 'fbsDB.exe'), $expectedApp)) {
        if ([PortableIconProbe]::ExtractIconEx($exe, -1, [IntPtr]::Zero, [IntPtr]::Zero, 0) -lt 1) { throw "No embedded icon: $exe" }
    }
    @{ rootEntries = $rootEntries; relocatedPath = $extracted; workingDirectory = $env:TEMP; windowIcon = $true; executableIcons = $true; editorReady = $true } |
        ConvertTo-Json | Set-Content -LiteralPath (Join-Path $runRoot 'report.json') -Encoding UTF8
    Write-Output "PASS portable root, relocated launch, editor, EXE icons and running window icons. Report: $runRoot\report.json"
}
finally {
    foreach ($name in $previous.Keys) { [Environment]::SetEnvironmentVariable($name, $previous[$name], 'Process') }
    if ($launcher -and -not $launcher.HasExited) { Stop-Process -Id $launcher.Id }
    $expectedApp = Join-Path $extracted 'app\FbsDb.exe'
    Get-Process FbsDb -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $expectedApp } | Stop-Process
}
