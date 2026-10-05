$ErrorActionPreference = 'Stop'
$nativeDir = Join-Path $PSScriptRoot 'cloud-native'
$nodeExe = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
if (!(Test-Path -LiteralPath $nodeExe)) { $nodeExe = (Get-Command node.exe -ErrorAction Stop).Source }
if (!(Test-Path -LiteralPath (Join-Path $nativeDir 'server.config.json')) -or !(Test-Path -LiteralPath (Join-Path $nativeDir 'node_modules\ws'))) {
  & (Join-Path $nativeDir 'setup.ps1')
  if ($LASTEXITCODE) { throw 'Native setup failed.' }
}
$nativeConfig = Get-Content -LiteralPath (Join-Path $nativeDir 'server.config.json') -Raw | ConvertFrom-Json
$nativePort = if ($nativeConfig.port) { [int]$nativeConfig.port } else { 9443 }
$nativeScheme = if ($nativeConfig.tls_cert) { 'https' } else { 'http' }
$healthUrl = "$nativeScheme`://127.0.0.1:$nativePort/health"
$logDir = Join-Path $PSScriptRoot 'runtime_logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
$ready = $false
try { $ready = (Invoke-RestMethod $healthUrl -TimeoutSec 2).ok -eq $true } catch {}
if (!$ready) {
  $signalingProcess = Start-Process -FilePath $nodeExe -ArgumentList ('"'+(Join-Path $nativeDir 'server.js')+'"') -WorkingDirectory $nativeDir -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDir "signal-$stamp.log") -RedirectStandardError (Join-Path $logDir "signal-$stamp-error.log") -PassThru
  for ($i=0;$i -lt 30;$i++) {
    try { $ready = (Invoke-RestMethod $healthUrl -TimeoutSec 1).ok -eq $true } catch {}
    if ($ready) { break }
    if ($signalingProcess.HasExited) { throw 'Signaling stopped. See runtime_logs.' }
    Start-Sleep -Milliseconds 200
  }
  if (!$ready) { throw 'Signaling did not become ready.' }
}
$hostExe = Join-Path $nativeDir 'bin\pccloud-host.exe'
$existingHost = Get-Process -Name 'pccloud-host' -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $hostExe }
if (!$existingHost) {
  Start-Process -FilePath $hostExe -ArgumentList @('-config',('"'+(Join-Path $nativeDir 'host.config.json')+'"')) -WorkingDirectory $nativeDir -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDir "native-$stamp.log") -RedirectStandardError (Join-Path $logDir "native-$stamp-error.log") | Out-Null
}
Write-Host 'Native signaling and host started.'
