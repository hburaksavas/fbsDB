param([Parameter(Mandatory = $true)][string]$OutputPath)
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
if (-not (Test-Path -LiteralPath $vswhere)) { throw 'Install Visual Studio Build Tools with Desktop development with C++ to build the portable launcher.' }
$installation = & $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if (-not $installation) { throw 'The portable launcher requires the MSVC x64 build tools and Windows SDK.' }
$vcvars = Join-Path $installation 'VC\Auxiliary\Build\vcvars64.bat'
$compilerEnvironment = & $env:ComSpec /d /s /c "call `"$vcvars`" >nul && set"
if ($LASTEXITCODE -ne 0) { throw 'Could not initialize the x64 C++ build environment.' }
$previous = @{}
foreach ($line in $compilerEnvironment) {
    if ($line -match '^(PATH|INCLUDE|LIB|LIBPATH)=(.*)$') {
        $name = $Matches[1]
        $previous[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
        [Environment]::SetEnvironmentVariable($name, $Matches[2], 'Process')
    }
}
$buildDirectory = Join-Path $repoRoot '.artifacts\portable-launcher'
$output = [IO.Path]::GetFullPath($OutputPath)
New-Item -ItemType Directory -Path $buildDirectory, (Split-Path -Parent $output) -Force | Out-Null
Push-Location (Join-Path $repoRoot 'native\PortableLauncher')
try {
    $resource = Join-Path $buildDirectory 'Launcher.res'
    $object = Join-Path $buildDirectory 'Launcher.obj'
    & rc.exe /nologo /fo $resource Launcher.rc
    if ($LASTEXITCODE -ne 0) { throw 'The portable launcher icon resource could not be built.' }
    & cl.exe /nologo /W4 /WX /O1 /GS- /Zl /std:c17 /utf-8 "/Fo$object" Launcher.c $resource `
        /link /NODEFAULTLIB /MACHINE:X64 /SUBSYSTEM:WINDOWS /ENTRY:wWinMainCRTStartup `
        /DYNAMICBASE /NXCOMPAT /HIGHENTROPYVA "/OUT:$output" kernel32.lib user32.lib
    if ($LASTEXITCODE -ne 0) { throw 'The portable launcher could not be built.' }
}
finally {
    Pop-Location
    foreach ($name in $previous.Keys) { [Environment]::SetEnvironmentVariable($name, $previous[$name], 'Process') }
}
