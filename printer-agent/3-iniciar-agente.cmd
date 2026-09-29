@echo off
title Facto - Agente de impresion
cd /d "%~dp0"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0FactoPrinterAgent.ps1" -Action run
echo.
pause
