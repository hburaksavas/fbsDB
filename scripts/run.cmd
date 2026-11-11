@echo off
rem Launches the last desktop build without rebuilding. Use build-run.cmd to rebuild first.
set "FBSDB_EXE=%~dp0..\native\FbsDb\bin\x64\Debug\net10.0-windows10.0.26100.0\win-x64\FbsDb.exe"
if not exist "%FBSDB_EXE%" (
  echo No desktop build found. Run scripts\build-run.cmd first.
  exit /b 1
)
start "" "%FBSDB_EXE%"
