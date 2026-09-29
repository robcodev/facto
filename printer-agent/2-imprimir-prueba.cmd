@echo off
title Facto - Prueba POS-8360
cd /d "%~dp0"
echo Se enviara una comanda de prueba a la impresora instalada en USB001.
echo.
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0FactoPrinterAgent.ps1" -Action test -PortName USB001
echo.
pause
