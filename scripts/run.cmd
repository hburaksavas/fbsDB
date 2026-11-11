@echo off
rem Launches the last desktop build without rebuilding. Use build-run.cmd to rebuild first.
for %%I in ("%~dp0..\native\FbsDb\bin\x64\Debug\net10.0-windows10.0.26100.0\win-x64\FbsDb.exe") do set "FBSDB_EXE=%%~fI"
if not exist "%FBSDB_EXE%" (
  echo No desktop build found. Run scripts\build-run.cmd first.
  exit /b 1
)
rem Launch through the Windows shell, not as a child of this terminal. A terminal inside a packaged app
rem (an AI coding app, for example) gives its children a private copy of %LOCALAPPDATA%, so the app would
rem read that app's stale fbsDB\settings.json instead of the real one. Explorer always exits with 1.
explorer.exe "%FBSDB_EXE%"
exit /b 0
