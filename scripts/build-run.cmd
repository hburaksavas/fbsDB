@echo off
rem Builds the web bundle and the desktop app, then launches it.
powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0build-desktop.ps1"
if errorlevel 1 exit /b 1
call "%~dp0run.cmd"
