param([Parameter(Mandatory=$true)][string]$NodePath)
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $taskRoot
# One process per Windows session. Database claims also protect other machines.
$taskMutex = New-Object System.Threading.Mutex($false, 'Local\FactoIntelSalesWorker')
try {
    try { $taskAcquired = $taskMutex.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { $taskAcquired = $true }
    if (-not $taskAcquired) { exit 0 }
    # Console output is redundant: the runner writes a bounded, non-personal log.
    & $NodePath 'lib/intel/sales-runner.mjs' 2>$null | Out-Null
    $taskExit = $LASTEXITCODE
} finally {
    if ($taskAcquired) { $taskMutex.ReleaseMutex() }
    $taskMutex.Dispose()
}
exit $taskExit
