param([switch]$Stop)
$ErrorActionPreference='Stop'
$projectRoot=Split-Path -Parent $PSScriptRoot
$stateFile=Join-Path $projectRoot 'runtime_logs\public-connection.json'
$binary=Join-Path $projectRoot '.tools\cloudflared\cloudflared.exe'
if(Test-Path -LiteralPath $stateFile){
 $state=Get-Content -LiteralPath $stateFile -Raw|ConvertFrom-Json
 $owned=Get-CimInstance Win32_Process -Filter "ProcessId=$([int]$state.pid)" -ErrorAction SilentlyContinue
 if($owned -and $owned.ExecutablePath -eq $binary){if($Stop){Stop-Process -Id ([int]$state.pid);Remove-Item -LiteralPath $stateFile;exit}else{Write-Output $state.origin;exit}}
 Remove-Item -LiteralPath $stateFile
}
if($Stop){exit}
New-Item -ItemType Directory -Force -Path (Split-Path $binary),(Join-Path $projectRoot 'runtime_logs')|Out-Null
if(!(Test-Path -LiteralPath $binary)){
 $release=Invoke-RestMethod 'https://api.github.com/repos/cloudflare/cloudflared/releases/latest'
 $asset=$release.assets|Where-Object name -eq 'cloudflared-windows-amd64.exe'|Select-Object -First 1
 if(!$asset -or $asset.digest -notmatch '^sha256:([a-f0-9]{64})$'){throw 'Cloudflare release has no SHA256 digest; download was not executed.'}
 $expectedHash=$Matches[1];$download=$binary+'.download'
 Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $download
 if((Get-FileHash -LiteralPath $download -Algorithm SHA256).Hash -ne $expectedHash){Remove-Item -LiteralPath $download;throw 'Cloudflare executable checksum mismatch.'}
 Move-Item -LiteralPath $download -Destination $binary
}
$cfg=Get-Content -LiteralPath (Join-Path $projectRoot 'config.json') -Raw|ConvertFrom-Json
$port=if($cfg.port){[int]$cfg.port}else{8443}
if($port -lt 1 -or $port -gt 65535){throw 'Invalid web port.'}
if($cfg.tls_cert){throw 'Host uses TLS; set public_origin to your existing HTTPS reverse proxy.'}
$stamp=Get-Date -Format 'yyyyMMdd-HHmmss-fff'
$outLog=Join-Path $projectRoot "runtime_logs\tunnel-$stamp.log"
$errLog=Join-Path $projectRoot "runtime_logs\tunnel-$stamp-error.log"
$process=Start-Process -FilePath $binary -ArgumentList @('tunnel','--no-autoupdate','--url',"http://127.0.0.1:$port") -WindowStyle Hidden -RedirectStandardOutput $outLog -RedirectStandardError $errLog -PassThru
for($attempt=0;$attempt -lt 90;$attempt++){
 if($process.HasExited){throw "Tunnel stopped; see $errLog"}
 $text=Get-Content -LiteralPath $errLog -Raw -ErrorAction SilentlyContinue
 if($text -match 'https://[a-z0-9-]+\.trycloudflare\.com'){
  @{origin=$Matches[0];pid=$process.Id}|ConvertTo-Json|Set-Content -LiteralPath $stateFile -Encoding UTF8
  Write-Output $Matches[0];exit
 }
 Start-Sleep -Seconds 1
}
Stop-Process -Id $process.Id
throw "Tunnel did not become ready; see $errLog"
