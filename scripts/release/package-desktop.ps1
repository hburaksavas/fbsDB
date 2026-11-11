param([string]$CertificateThumbprint = "", [switch]$RequireSigned)
$ErrorActionPreference = "Stop"
if ($RequireSigned -and -not $CertificateThumbprint) { throw 'A code-signing certificate thumbprint is required for a signed release.' }
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$localDotnet = Join-Path $repoRoot ".tools\dotnet"
$project = Join-Path $repoRoot "native\FbsDb\FbsDb.csproj"
$artifactsRoot = Join-Path $repoRoot "artifacts"
$publishDir = Join-Path $artifactsRoot "fbsDB-win-x64"
$archivePath = Join-Path $artifactsRoot "fbsDB-win-x64.zip"
$appDir = Join-Path $publishDir "app"
$launcherPath = Join-Path $repoRoot ".artifacts\portable-launcher\fbsDB.exe"
# package.json is the single source of the release version.
$version = (Get-Content -LiteralPath (Join-Path $repoRoot "package.json") -Raw -Encoding UTF8 | ConvertFrom-Json).version

if (-not (Test-Path (Join-Path $localDotnet "dotnet.exe"))) {
    & (Join-Path (Split-Path -Parent $PSScriptRoot) "build\setup-dotnet.ps1")
    if ($LASTEXITCODE -ne 0) { throw "The local .NET SDK setup failed." }
}

$previousPath = $env:PATH
$env:PATH = "$localDotnet;$env:PATH"
Push-Location $repoRoot
try {
    & (Join-Path (Split-Path -Parent $PSScriptRoot) "build\build-portable-launcher.ps1") -OutputPath $launcherPath

    npm run build
    if ($LASTEXITCODE -ne 0) { throw "The editor bundle build failed." }

    node scripts/build/sync-webcontent.mjs
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
        "-p:Version=$version" --self-contained true -o $appDir
    if ($LASTEXITCODE -ne 0) { throw "The x64 desktop publish failed." }

    Copy-Item -LiteralPath $launcherPath -Destination (Join-Path $publishDir 'fbsDB.exe')
    foreach ($required in @('FbsDb.exe', 'Assets\AppIcon.ico', 'Assets\AppIcon.png', 'WebContent\index.html')) {
        if (-not (Test-Path -LiteralPath (Join-Path $appDir $required) -PathType Leaf)) {
            throw "The portable package is missing app/$required."
        }
    }

    (@'
fbsDB __VERSION__ portable Windows x64 build

Extract the entire ZIP, then run fbsDB.exe in this folder.
Keep the app/ folder next to fbsDB.exe when moving or sharing this build.

fbsDB.exe           Application launcher (no extra runtime required)
app/                Application, bundled .NET/Windows App SDK, locales and web UI
README-portable.txt  This guide

All application dependencies are grouped under app/. Do not move its individual files.
Microsoft Edge WebView2 Runtime (Evergreen) must be installed on the machine.

Configure Oracle aliases through a tnsnames.ora file. ODP.NET Core is bundled;
an Oracle client installation is not needed for ordinary TCP connections.
'@).Replace('__VERSION__', $version) | Set-Content -LiteralPath (Join-Path $publishDir "README-portable.txt") -Encoding UTF8

    $signTargets = @((Join-Path $publishDir 'fbsDB.exe'), (Join-Path $appDir 'fbsDB.exe'))
    if ($CertificateThumbprint) {
        $certificate = Get-Item -LiteralPath ("Cert:\CurrentUser\My\" + $CertificateThumbprint)
        if (-not $certificate.HasPrivateKey) { throw 'The selected certificate has no private key.' }
        foreach ($target in $signTargets) {
            $signature = Set-AuthenticodeSignature -LiteralPath $target -Certificate $certificate -HashAlgorithm SHA256 -TimestampServer 'http://timestamp.digicert.com'
            if ($signature.Status -ne 'Valid') { throw "Code signing failed for $target : $($signature.StatusMessage)" }
        }
    }
    Compress-Archive -Path (Join-Path $publishDir "*") -DestinationPath $archivePath -CompressionLevel Optimal
    $archiveHash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
    [IO.File]::WriteAllText("$archivePath.sha256", "$archiveHash  $(Split-Path -Leaf $archivePath)`n")
    Write-Host "Portable package $version created: $archivePath"
}
finally {
    Pop-Location
    $env:PATH = $previousPath
}
