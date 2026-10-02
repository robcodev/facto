@echo off
title Facto - Quitar inicio automatico
cd /d "%~dp0"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0FactoPrinterAgent.ps1" -Action uninstall
echo.
pause
