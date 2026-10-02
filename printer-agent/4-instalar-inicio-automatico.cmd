@echo off
title Facto - Instalar inicio automatico
cd /d "%~dp0"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0FactoPrinterAgent.ps1" -Action install
echo.
pause
