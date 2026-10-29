param([Parameter(Mandatory=$true)][string]$NodePath)
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskNode = (Resolve-Path -LiteralPath $NodePath).Path
$taskScript = Join-Path $PSScriptRoot 'intel-sales-worker.ps1'
$taskUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$taskAction = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "{0}" -NodePath "{1}"' -f $taskScript, $taskNode) -WorkingDirectory $taskRoot
$taskTrigger = New-ScheduledTaskTrigger -AtLogOn -User $taskUser
$taskPrincipal = New-ScheduledTaskPrincipal -UserId $taskUser -LogonType Interactive -RunLevel Limited
$taskSettings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName 'FactoIntelSalesWorker' -Action $taskAction -Trigger $taskTrigger -Principal $taskPrincipal -Settings $taskSettings -Description 'Importa ventas de Facto por lotes con reanudacion y reintentos. Requiere equipo encendido y sesion de Windows iniciada.' -Force | Out-Null
Start-ScheduledTask -TaskName 'FactoIntelSalesWorker'
Get-ScheduledTask -TaskName 'FactoIntelSalesWorker' | Select-Object TaskName,State
