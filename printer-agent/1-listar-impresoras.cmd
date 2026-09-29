@echo off
title Facto - Detectar impresora
cd /d "%~dp0"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0FactoPrinterAgent.ps1" -Action list
echo.
echo Revisa si la POS-8360 aparece en el puerto USB001.
echo.
pause
