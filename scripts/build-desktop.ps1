$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$localDotnet = Join-Path $repoRoot ".tools\dotnet"
$project = Join-Path $repoRoot "native\FbsDb\FbsDb.csproj"
$runningExecutable = Join-Path $repoRoot "native\FbsDb\bin\x64\Debug\net10.0-windows10.0.26100.0\win-x64\FbsDb.exe"

$runningApp = Get-Process FbsDb -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $runningExecutable }
if ($runningApp) {
    throw "Close the running fbsDB desktop app before rebuilding it, then run this script again."
}

$systemDotnet = Get-Command dotnet.exe -ErrorAction SilentlyContinue
$dotnetExe = $null
if ($systemDotnet) {
    $systemVersion = & $systemDotnet.Source --version
    if ($LASTEXITCODE -eq 0 -and $systemVersion -match '^10\.') {
        $dotnetExe = $systemDotnet.Source
    }
}

if (-not $dotnetExe) {
    $dotnetExe = Join-Path $localDotnet "dotnet.exe"
    if (-not (Test-Path -LiteralPath $dotnetExe -PathType Leaf)) {
        & (Join-Path $PSScriptRoot "setup-dotnet.ps1")
        if ($LASTEXITCODE -ne 0) { throw "The local .NET SDK setup failed." }
    }
}

$previousPath = $env:PATH
$env:PATH = "$(Split-Path -Parent $dotnetExe);$previousPath"
Push-Location $repoRoot
try {
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "The editor bundle build failed." }

    node scripts/sync-webcontent.mjs
    if ($LASTEXITCODE -ne 0) { throw "The editor bundle sync failed." }

    & $dotnetExe build $project -c Debug -r win-x64 -p:Platform=x64 -p:WindowsPackageType=None
    if ($LASTEXITCODE -ne 0) { throw "The WinUI app build failed." }
}
finally {
    Pop-Location
    $env:PATH = $previousPath
}
