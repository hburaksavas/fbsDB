$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$project = Join-Path $repoRoot "native\FbsDb\FbsDb.csproj"
$runningExecutable = Join-Path $repoRoot "native\FbsDb\bin\x64\Debug\net10.0-windows10.0.26100.0\win-x64\FbsDb.exe"

$runningApp = Get-Process FbsDb -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $runningExecutable }
if ($runningApp) {
    throw "Close the running fbsDB desktop app before rebuilding it, then run this script again."
}

$dotnetExe = & (Join-Path $PSScriptRoot "resolve-dotnet.ps1")

$previousPath = $env:PATH
$env:PATH = "$(Split-Path -Parent $dotnetExe);$previousPath"
Push-Location $repoRoot
try {
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "The editor bundle build failed." }

    node scripts/build/sync-webcontent.mjs
    if ($LASTEXITCODE -ne 0) { throw "The editor bundle sync failed." }

    & $dotnetExe build $project -c Debug -r win-x64 -p:Platform=x64 -p:WindowsPackageType=None
    if ($LASTEXITCODE -ne 0) { throw "The WinUI app build failed." }
}
finally {
    Pop-Location
    $env:PATH = $previousPath
}
