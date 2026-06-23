@echo off
cd /d "%~dp0"
start "LoopNote Server" powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1"
timeout /t 2 /nobreak >nul
start "" "http://localhost:4173"
exit
