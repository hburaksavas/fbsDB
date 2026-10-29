$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$localDotnet = Join-Path $repoRoot ".tools\dotnet"
$project = Join-Path $repoRoot "native\FbsDb\FbsDb.csproj"
$artifactsRoot = Join-Path $repoRoot "artifacts"
$publishDir = Join-Path $artifactsRoot "fbsDB-win-x64"
$archivePath = Join-Path $artifactsRoot "fbsDB-win-x64.zip"

if (-not (Test-Path (Join-Path $localDotnet "dotnet.exe"))) {
    & (Join-Path $PSScriptRoot "setup-dotnet.ps1")
    if ($LASTEXITCODE -ne 0) { throw "The local .NET SDK setup failed." }
}

$env:PATH = "$localDotnet;$env:PATH"
Push-Location $repoRoot
try {
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "The editor bundle build failed." }

    node scripts/sync-webcontent.mjs
    if ($LASTEXITCODE -ne 0) { throw "The editor bundle sync failed." }

    New-Item -ItemType Directory -Path $artifactsRoot -Force | Out-Null
    if (Test-Path $publishDir) {
        $resolvedPublish = (Resolve-Path $publishDir).Path
        if (-not $resolvedPublish.StartsWith($artifactsRoot, [StringComparison]::OrdinalIgnoreCase)) {
            throw "Refusing to remove a publish directory outside artifacts/."
        }
        Remove-Item -LiteralPath $resolvedPublish -Recurse -Force
    }
    if (Test-Path $archivePath) { Remove-Item -LiteralPath $archivePath -Force }

    & (Join-Path $localDotnet "dotnet.exe") publish $project -c Release -r win-x64 `
        -p:Platform=x64 -p:WindowsPackageType=None -p:WindowsAppSDKSelfContained=true `
        --self-contained true -o $publishDir
    if ($LASTEXITCODE -ne 0) { throw "The x64 desktop publish failed." }

    @'
fbsDB portable Windows x64 build

Run FbsDb.exe. Windows App SDK and .NET are bundled with this folder.
Microsoft Edge WebView2 Runtime (Evergreen) must be installed on the machine.

Configure Oracle aliases through a tnsnames.ora file. ODP.NET Core is bundled;
an Oracle client installation is not needed for ordinary TCP connections.
'@ | Set-Content -LiteralPath (Join-Path $publishDir "README-portable.txt") -Encoding UTF8

    Compress-Archive -Path (Join-Path $publishDir "*") -DestinationPath $archivePath -CompressionLevel Optimal
    Write-Host "Portable package created: $archivePath"
}
finally {
    Pop-Location
}
