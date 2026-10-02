param(
    [ValidateSet('list', 'test', 'run', 'install', 'uninstall')]
    [string]$Action = 'list',
    [string]$PrinterName = '',
    [string]$PortName = 'USB001',
    [string]$ConfigPath = "$PSScriptRoot\config.json"
)

$ErrorActionPreference = 'Stop'
$AgentVersion = '2.1.0'
$LogPath = Join-Path $PSScriptRoot 'agent.log'
$TaskName = 'Facto Printer Agent'

function Write-AgentLog {
    param([string]$Message, [ValidateSet('INFO', 'WARN', 'ERROR')][string]$Level = 'INFO')
    if ((Test-Path -LiteralPath $LogPath) -and (Get-Item -LiteralPath $LogPath).Length -gt 2MB) {
        Move-Item -LiteralPath $LogPath -Destination (Join-Path $PSScriptRoot 'agent.previous.log') -Force
    }
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') [$Level] $Message"
    Add-Content -LiteralPath $LogPath -Value $line -Encoding UTF8
    if ($Level -eq 'ERROR') { Write-Warning $Message } else { Write-Host $line }
}

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public static class FactoRawPrinter {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public class DOC_INFO_1 {
        [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
    }

    [DllImport("winspool.drv", SetLastError = true, CharSet = CharSet.Unicode)]
    public static extern bool OpenPrinter(string printerName, out IntPtr printerHandle, IntPtr defaults);

    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool ClosePrinter(IntPtr printerHandle);

    [DllImport("winspool.drv", SetLastError = true, CharSet = CharSet.Unicode)]
    public static extern int StartDocPrinter(IntPtr printerHandle, int level, [In] DOC_INFO_1 documentInfo);

    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool EndDocPrinter(IntPtr printerHandle);

    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool StartPagePrinter(IntPtr printerHandle);

    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool EndPagePrinter(IntPtr printerHandle);

    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool WritePrinter(IntPtr printerHandle, byte[] bytes, int count, out int written);

    public static void Send(string printerName, byte[] bytes, string documentName) {
        IntPtr handle;
        if (!OpenPrinter(printerName, out handle, IntPtr.Zero)) {
            throw new InvalidOperationException("No se pudo abrir la impresora. Error Windows: " + Marshal.GetLastWin32Error());
        }

        try {
            var info = new DOC_INFO_1 {
                pDocName = documentName,
                pOutputFile = null,
                pDataType = "RAW"
            };
            if (StartDocPrinter(handle, 1, info) == 0) throw new InvalidOperationException("No se pudo iniciar el documento RAW.");
            try {
                if (!StartPagePrinter(handle)) throw new InvalidOperationException("No se pudo iniciar la página RAW.");
                try {
                    int written;
                    if (!WritePrinter(handle, bytes, bytes.Length, out written) || written != bytes.Length) {
                        throw new InvalidOperationException("La impresora no recibió todos los bytes.");
                    }
                } finally { EndPagePrinter(handle); }
            } finally { EndDocPrinter(handle); }
        } finally { ClosePrinter(handle); }
    }
}
'@

function Get-FactoPrinters {
    Get-CimInstance Win32_Printer | Select-Object Name, DriverName, PortName, PrinterStatus, WorkOffline
}

function Resolve-FactoPrinterName {
    param([string]$RequestedName, [string]$RequestedPort)

    if ($RequestedName) {
        $match = Get-FactoPrinters | Where-Object Name -eq $RequestedName
        if (-not $match) { throw "No existe una impresora instalada con el nombre '$RequestedName'." }
        return $match.Name
    }

    $matches = @(Get-FactoPrinters | Where-Object PortName -eq $RequestedPort)
    if ($matches.Count -eq 0) { throw "No encontramos una impresora instalada en el puerto $RequestedPort." }
    if ($matches.Count -gt 1) { throw "Hay más de una impresora en $RequestedPort. Indica PrinterName en config.json." }
    return $matches[0].Name
}

function Add-Bytes {
    param(
        [System.Collections.Generic.List[byte]]$Buffer,
        [byte[]]$Bytes
    )
    $Buffer.AddRange($Bytes)
}

function Add-Text {
    param(
        [System.Collections.Generic.List[byte]]$Buffer,
        [string]$Text
    )
    Add-Bytes $Buffer ([System.Text.Encoding]::GetEncoding(1252).GetBytes($Text))
}

function New-TestReceipt {
    $bytes = [System.Collections.Generic.List[byte]]::new()
    Add-Bytes $bytes ([byte[]](0x1B, 0x40))             # Inicializar
    Add-Bytes $bytes ([byte[]](0x1B, 0x74, 0x10))       # Windows-1252
    Add-Bytes $bytes ([byte[]](0x1B, 0x61, 0x01))       # Centrar
    Add-Bytes $bytes ([byte[]](0x1D, 0x21, 0x11))       # Doble ancho y alto
    Add-Text $bytes "FACTO`n"
    Add-Bytes $bytes ([byte[]](0x1D, 0x21, 0x00))
    Add-Text $bytes "PRUEBA DE IMPRESIÓN`n"
    Add-Text $bytes "POS-8360 / PAPEL 80 mm`n"
    Add-Text $bytes "ÁÉÍÓÚ áéíóú Ññ`n"
    Add-Text $bytes "------------------------------------------`n"
    Add-Bytes $bytes ([byte[]](0x1B, 0x61, 0x00))       # Izquierda
    Add-Text $bytes "PREVENTA: #35354`n"
    Add-Text $bytes "ESTADO: PAGADO POR GENERAR DTE`n"
    Add-Text $bytes "1 x PRODUCTO DE PRUEBA`n"
    Add-Text $bytes "SKU: TEST-35354`n"
    Add-Text $bytes "------------------------------------------`n"
    Add-Bytes $bytes ([byte[]](0x1B, 0x61, 0x01))
    Add-Bytes $bytes ([byte[]](0x1D, 0x68, 0x50))       # Altura código
    Add-Bytes $bytes ([byte[]](0x1D, 0x77, 0x02))       # Ancho código
    Add-Bytes $bytes ([byte[]](0x1D, 0x48, 0x02))       # Texto debajo
    $barcode = [System.Text.Encoding]::ASCII.GetBytes('{B35354')
    Add-Bytes $bytes ([byte[]](0x1D, 0x6B, 0x49, [byte]$barcode.Length))
    Add-Bytes $bytes $barcode
    Add-Text $bytes "`n`nPRUEBA CORRECTA`n`n`n"
    Add-Bytes $bytes ([byte[]](0x1D, 0x56, 0x42, 0x00)) # Corte parcial
    return $bytes.ToArray()
}

function Add-WrappedText {
    param([System.Collections.Generic.List[byte]]$Buffer, [string]$Text, [int]$Width = 42)
    $remaining = $Text.Trim()
    while ($remaining.Length -gt $Width) {
        $cut = $remaining.LastIndexOf(' ', $Width)
        if ($cut -lt 1) { $cut = $Width }
        Add-Text $Buffer ($remaining.Substring(0, $cut).Trim() + "`n")
        $remaining = $remaining.Substring($cut).Trim()
    }
    if ($remaining) { Add-Text $Buffer ($remaining + "`n") }
}

function New-OrderReceipt {
    param($Order)
    $bytes = [System.Collections.Generic.List[byte]]::new()
    Add-Bytes $bytes ([byte[]](0x1B, 0x40))
    Add-Bytes $bytes ([byte[]](0x1B, 0x74, 0x10))
    Add-Bytes $bytes ([byte[]](0x1B, 0x61, 0x01))
    Add-Bytes $bytes ([byte[]](0x1D, 0x21, 0x11))
    Add-Text $bytes "PREVENTA #$($Order.documentNumber)`n"
    Add-Bytes $bytes ([byte[]](0x1D, 0x21, 0x00))
    Add-Text $bytes "PAGADO POR GENERAR DTE`n"
    Add-Text $bytes ((Get-Date $Order.createdAt).ToLocalTime().ToString('dd-MM-yyyy HH:mm') + "`n")
    Add-Text $bytes "PEDIDO WEB: #$($Order.checkoutId)`n"
    Add-Text $bytes "------------------------------------------`n"
    Add-Bytes $bytes ([byte[]](0x1B, 0x61, 0x00))
    if ($Order.customerName) { Add-WrappedText $bytes ("CLIENTE: " + $Order.customerName) }
    if ($Order.customerPhone) { Add-WrappedText $bytes ("TELÉFONO: " + $Order.customerPhone) }
    if ($Order.customerEmail) { Add-WrappedText $bytes ("EMAIL: " + $Order.customerEmail) }
    if ($Order.pickupStore) {
        Add-Bytes $bytes ([byte[]](0x1B, 0x45, 0x01))
        Add-WrappedText $bytes ("RETIRO EN TIENDA: " + $Order.pickupStore)
        Add-Bytes $bytes ([byte[]](0x1B, 0x45, 0x00))
    } elseif ($Order.address) { Add-WrappedText $bytes ("DIRECCIÓN: " + $Order.address) }
    if ($Order.shippingMethod) { Add-WrappedText $bytes ("ENVÍO: " + $Order.shippingMethod) }
    if ($Order.shippingComment) {
        Add-Bytes $bytes ([byte[]](0x1B, 0x45, 0x01))
        Add-WrappedText $bytes ("COMENTARIO: " + $Order.shippingComment)
        Add-Bytes $bytes ([byte[]](0x1B, 0x45, 0x00))
    }
    if ($Order.paymentTypeName) { Add-WrappedText $bytes ("FORMA DE PAGO: " + $Order.paymentTypeName) }
    elseif ($Order.paymentTypeId) { Add-Text $bytes "FORMA DE PAGO BSALE: #$($Order.paymentTypeId)`n" }
    Add-Text $bytes "------------------------------------------`n"
    foreach ($item in $Order.items) {
        Add-Bytes $bytes ([byte[]](0x1B, 0x45, 0x01))
        Add-Text $bytes ("[ ] $($item.quantity) x $($item.sku)`n")
        Add-Bytes $bytes ([byte[]](0x1B, 0x45, 0x00))
        Add-WrappedText $bytes ([string]$item.item_name)
        Add-Text $bytes "`n"
    }
    Add-Text $bytes "------------------------------------------`n"
    Add-Text $bytes ("TOTAL UNIDADES: " + $Order.totalUnits + "`n")
    Add-Bytes $bytes ([byte[]](0x1B, 0x61, 0x02))
    Add-Text $bytes ("TOTAL: `$" + ([decimal]$Order.total).ToString('N0') + "`n")
    Add-Bytes $bytes ([byte[]](0x1B, 0x61, 0x01))
    $barcodeValue = [string]$Order.documentNumber
    $barcode = [System.Text.Encoding]::ASCII.GetBytes('{B' + $barcodeValue)
    Add-Bytes $bytes ([byte[]](0x1D, 0x68, 0x50))
    Add-Bytes $bytes ([byte[]](0x1D, 0x77, 0x02))
    Add-Bytes $bytes ([byte[]](0x1D, 0x48, 0x02))
    Add-Bytes $bytes ([byte[]](0x1D, 0x6B, 0x49, [byte]$barcode.Length))
    Add-Bytes $bytes $barcode
    Add-Text $bytes "`n`nESCANEAR PARA INICIAR PICKING`n`n`n"
    Add-Bytes $bytes ([byte[]](0x1D, 0x56, 0x42, 0x00))
    return $bytes.ToArray()
}

function Read-AgentConfig {
    if (-not (Test-Path -LiteralPath $ConfigPath)) { return $null }
    return Get-Content -Raw -LiteralPath $ConfigPath | ConvertFrom-Json
}

switch ($Action) {
    'install' {
        $scriptPath = Join-Path $PSScriptRoot 'FactoPrinterAgent.ps1'
        $taskAction = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoLogo -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$scriptPath`" -Action run"
        $taskTrigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
        $taskSettings = New-ScheduledTaskSettingsSet -RestartCount 10 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
        Register-ScheduledTask -TaskName $TaskName -Action $taskAction -Trigger $taskTrigger -Settings $taskSettings -Description 'Imprime automáticamente las preventas pendientes de Facto.' -Force | Out-Null
        Start-ScheduledTask -TaskName $TaskName
        Write-Host "Agente instalado. Se iniciará automáticamente con la sesión de Windows."
        Write-Host "Registro: $LogPath"
    }
    'uninstall' {
        if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
            Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
        }
        Write-Host 'Inicio automático eliminado.'
    }
    'list' {
        Get-FactoPrinters | Format-Table -AutoSize
    }
    'test' {
        $config = Read-AgentConfig
        $configuredName = if ($PrinterName) { $PrinterName } elseif ($config.printerName) { [string]$config.printerName } else { '' }
        $configuredPort = if ($PortName) { $PortName } elseif ($config.portName) { [string]$config.portName } else { 'USB001' }
        $resolvedName = Resolve-FactoPrinterName -RequestedName $configuredName -RequestedPort $configuredPort
        Write-Host "Enviando prueba RAW a '$resolvedName'..."
        [FactoRawPrinter]::Send($resolvedName, (New-TestReceipt), 'Facto - prueba POS-8360')
        Write-Host 'Trabajo enviado. Confirma que imprimió texto, código de barras y corte.'
    }
    'run' {
        $config = Read-AgentConfig
        if (-not $config) { throw 'Falta config.json. Copia config.example.json y completa apiBaseUrl y deviceToken.' }
        if (-not $config.apiBaseUrl -or -not $config.deviceToken) { throw 'Completa apiBaseUrl y deviceToken en config.json.' }
        $resolvedName = Resolve-FactoPrinterName -RequestedName ([string]$config.printerName) -RequestedPort ([string]$config.portName)
        $apiBase = ([string]$config.apiBaseUrl).TrimEnd('/')
        $headers = @{ Authorization = "Bearer $($config.deviceToken)"; 'X-Device-Name' = ([string]$config.deviceName); 'X-Agent-Version' = $AgentVersion }
        $pollSeconds = [Math]::Max(2, [int]$config.pollSeconds)
        $syncSeconds = if ($config.syncSeconds) { [Math]::Max(30, [int]$config.syncSeconds) } else { 60 }
        $nextSyncAt = [DateTime]::MinValue
        $pendingAck = $null
        Write-AgentLog "Agente Facto $AgentVersion activo. Impresora: '$resolvedName'. API: $apiBase."
        while ($true) {
            try {
                if ($pendingAck) {
                    try {
                        Invoke-RestMethod -Uri "$apiBase/api/printer/jobs/ack" -Headers $headers -Method Post -ContentType 'application/json' -Body $pendingAck.body | Out-Null
                        Write-AgentLog $pendingAck.successMessage
                        $pendingAck = $null
                    } catch {
                        Write-AgentLog "La impresión física terminó, pero Facto aún no confirma el estado: $($_.Exception.Message)" 'ERROR'
                        Start-Sleep -Seconds $pollSeconds
                        continue
                    }
                }
                if ((Get-Date) -ge $nextSyncAt) {
                    try {
                        $syncResult = Invoke-RestMethod -Uri "$apiBase/api/picking/sync" -Headers $headers -Method Post
                        $nextSyncAt = (Get-Date).AddSeconds($syncSeconds)
                        Write-AgentLog "Sincronización completada: $(@($syncResult.imported).Count) pedidos revisados."
                    } catch {
                        $nextSyncAt = (Get-Date).AddSeconds($syncSeconds)
                        Write-AgentLog "No se pudieron sincronizar los pedidos recientes: $($_.Exception.Message)" 'WARN'
                    }
                }
                $response = Invoke-WebRequest -UseBasicParsing -Uri "$apiBase/api/printer/jobs/next" -Headers $headers -Method Get
                if ($response.StatusCode -eq 200 -and $response.Content) {
                    $job = $response.Content | ConvertFrom-Json
                    try {
                        [FactoRawPrinter]::Send($resolvedName, (New-OrderReceipt $job.order), "Facto - preventa $($job.order.documentNumber)")
                        $ack = @{ jobId = [int64]$job.jobId; success = $true } | ConvertTo-Json
                        $pendingAck = @{ body = $ack; successMessage = "Impreso y confirmado: preventa #$($job.order.documentNumber)" }
                        Invoke-RestMethod -Uri "$apiBase/api/printer/jobs/ack" -Headers $headers -Method Post -ContentType 'application/json' -Body $pendingAck.body | Out-Null
                        Write-AgentLog $pendingAck.successMessage
                        $pendingAck = $null
                    } catch {
                        if (-not $pendingAck) {
                            $printError = $_.Exception.Message
                            $ack = @{ jobId = [int64]$job.jobId; success = $false; error = $printError } | ConvertTo-Json
                            $pendingAck = @{ body = $ack; successMessage = "Error de impresión registrado para la preventa #$($job.order.documentNumber)." }
                            try {
                                Invoke-RestMethod -Uri "$apiBase/api/printer/jobs/ack" -Headers $headers -Method Post -ContentType 'application/json' -Body $pendingAck.body | Out-Null
                                Write-AgentLog "Falló la impresión de la preventa #$($job.order.documentNumber): $printError" 'ERROR'
                                $pendingAck = $null
                            } catch {
                                Write-AgentLog "Falló la impresión y no pudimos registrar el error: $printError" 'ERROR'
                            }
                        } else {
                            Write-AgentLog "La preventa #$($job.order.documentNumber) se imprimió, pero no pudimos confirmarla en Facto: $($_.Exception.Message)" 'ERROR'
                        }
                    }
                }
            } catch {
                if ($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -eq 204) {
                    # No hay trabajos pendientes.
                } else {
                    Write-AgentLog "No se pudo consultar Facto: $($_.Exception.Message)" 'WARN'
                }
            }
            Start-Sleep -Seconds $pollSeconds
        }
    }
}
