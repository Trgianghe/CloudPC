param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$pythonExe = Join-Path $PSScriptRoot '.venv\Scripts\python.exe'
if (!(Test-Path -LiteralPath $pythonExe) -or !(Test-Path -LiteralPath 'config.json')) {
  throw 'Run start.ps1 -Setup once to create the Python environment and private config.'
}
$webConfig = Get-Content -LiteralPath 'config.json' -Raw | ConvertFrom-Json
$webPort = if ($webConfig.port) { [int]$webConfig.port } else { 8443 }
if ($webPort -lt 1 -or $webPort -gt 65535) { throw 'Invalid port in config.json.' }
$scheme = if ($webConfig.tls_cert -and $webConfig.tls_key) { 'https' } else { 'http' }
$webUrl = "$scheme`://127.0.0.1:$webPort/"
function Test-PCCloud {
  try {
    $health = Invoke-RestMethod -Uri ($webUrl + 'api/health') -TimeoutSec 2
    return ($health.ok -eq $true -and $health.protocol -eq 'webrtc')
  } catch { return $false }
}
$pathHash = [Security.Cryptography.SHA256]::Create()
try { $lockSuffix = [BitConverter]::ToString($pathHash.ComputeHash([Text.Encoding]::UTF8.GetBytes($PSScriptRoot))).Replace('-','').Substring(0,16) } finally { $pathHash.Dispose() }
$launchMutex = New-Object Threading.Mutex($false, "Local\PCCloudLaunch-$lockSuffix")
$lockHeld = $false
try {
  $lockHeld = $launchMutex.WaitOne(10000)
  if (!$lockHeld) { throw 'Another launch is still running. Try again shortly.' }
  & (Join-Path $PSScriptRoot 'start_native_backend.ps1')
  if (!(Test-PCCloud)) {
    $logDir = Join-Path $PSScriptRoot 'runtime_logs'
    New-Item -ItemType Directory -Force -Path $logDir | Out-Null
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
    $outLog = Join-Path $logDir "host-$stamp.log"
    $errLog = Join-Path $logDir "host-$stamp-error.log"
    $serverFile = Join-Path $PSScriptRoot 'server.py'
    # A detached user-session process survives the launcher and browser closing.
    # The authenticated web guest endpoint must be reachable from the configured network.
    $hostProcess = Start-Process -FilePath $pythonExe -ArgumentList @('-u',('"'+$serverFile+'"'),'--bind',$(if ($webConfig.host) { [string]$webConfig.host } else { '0.0.0.0' }),'--port',$webPort) -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -RedirectStandardOutput $outLog -RedirectStandardError $errLog -PassThru
    $ready = $false
    for ($attempt=0; $attempt -lt 40; $attempt++) {
      if (Test-PCCloud) { $ready=$true; break }
      if ($hostProcess.HasExited) { throw "Host stopped. Read $errLog" }
      Start-Sleep -Milliseconds 250
    }
    if (!$ready) { throw "Host not ready yet. Read $errLog" }
  }
  Write-Host "PC Cloud ready: $webUrl"
  if (!$NoBrowser) { Start-Process $webUrl }
} finally {
  if ($lockHeld) { $launchMutex.ReleaseMutex() }
  $launchMutex.Dispose()
}
