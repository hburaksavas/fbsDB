$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$localDotnet = Join-Path $repoRoot ".tools\dotnet"
$project = Join-Path $repoRoot "native\FbsDb\FbsDb.csproj"
$artifactsRoot = Join-Path $repoRoot "artifacts"
$publishDir = Join-Path $artifactsRoot "fbsDB-win-x64"
$archivePath = Join-Path $artifactsRoot "fbsDB-win-x64.zip"
$appDir = Join-Path $publishDir "app"
$launcherPath = Join-Path $repoRoot ".artifacts\portable-launcher\fbsDB.exe"

if (-not (Test-Path (Join-Path $localDotnet "dotnet.exe"))) {
    & (Join-Path $PSScriptRoot "setup-dotnet.ps1")
    if ($LASTEXITCODE -ne 0) { throw "The local .NET SDK setup failed." }
}

$previousPath = $env:PATH
$env:PATH = "$localDotnet;$env:PATH"
Push-Location $repoRoot
try {
    & (Join-Path $PSScriptRoot "build-portable-launcher.ps1") -OutputPath $launcherPath

    npm run build
    if ($LASTEXITCODE -ne 0) { throw "The editor bundle build failed." }

    node scripts/sync-webcontent.mjs
    if ($LASTEXITCODE -ne 0) { throw "The editor bundle sync failed." }

    New-Item -ItemType Directory -Path $artifactsRoot -Force | Out-Null
    if (Test-Path $publishDir) {
        $resolvedPublish = (Resolve-Path $publishDir).Path
        if (-not $resolvedPublish.StartsWith(([IO.Path]::GetFullPath($artifactsRoot).TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar), [StringComparison]::OrdinalIgnoreCase)) {
            throw "Refusing to remove a publish directory outside artifacts/."
        }
        Remove-Item -LiteralPath $resolvedPublish -Recurse -Force
    }
    if (Test-Path $archivePath) { Remove-Item -LiteralPath $archivePath -Force }

    & (Join-Path $localDotnet "dotnet.exe") publish $project -c Release -r win-x64 `
        -p:Platform=x64 -p:WindowsPackageType=None -p:WindowsAppSDKSelfContained=true `
        --self-contained true -o $appDir
    if ($LASTEXITCODE -ne 0) { throw "The x64 desktop publish failed." }

    Copy-Item -LiteralPath $launcherPath -Destination (Join-Path $publishDir 'fbsDB.exe')
    foreach ($required in @('FbsDb.exe', 'Assets\AppIcon.ico', 'Assets\AppIcon.png', 'WebContent\index.html')) {
        if (-not (Test-Path -LiteralPath (Join-Path $appDir $required) -PathType Leaf)) {
            throw "The portable package is missing app/$required."
        }
    }

    @'
fbsDB portable Windows x64 build

Extract the entire ZIP, then run fbsDB.exe in this folder.
Keep the app/ folder next to fbsDB.exe when moving or sharing this build.

fbsDB.exe           Application launcher (no extra runtime required)
app/                Application, bundled .NET/Windows App SDK, locales and web UI
README-portable.txt  This guide

All application dependencies are grouped under app/. Do not move its individual files.
Microsoft Edge WebView2 Runtime (Evergreen) must be installed on the machine.

Configure Oracle aliases through a tnsnames.ora file. ODP.NET Core is bundled;
an Oracle client installation is not needed for ordinary TCP connections.
'@ | Set-Content -LiteralPath (Join-Path $publishDir "README-portable.txt") -Encoding UTF8

    Compress-Archive -Path (Join-Path $publishDir "*") -DestinationPath $archivePath -CompressionLevel Optimal
    Write-Host "Portable package created: $archivePath"
}
finally {
    Pop-Location
    $env:PATH = $previousPath
}
