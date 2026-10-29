param([Parameter(Mandatory=$true)][string]$NodePath)
$ErrorActionPreference='Stop'
$taskRoot=Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $taskRoot
$taskMutex=New-Object System.Threading.Mutex($false,'Local\FactoIntelCompletion')
try {
 try { $taskAcquired=$taskMutex.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { $taskAcquired=$true }
 if(-not $taskAcquired){exit 0}
 & $NodePath 'lib/intel/completion-runner.mjs' 2>$null | Out-Null
 $taskExit=$LASTEXITCODE
} finally {
 if($taskAcquired){$taskMutex.ReleaseMutex()}
 $taskMutex.Dispose()
}
exit $taskExit
