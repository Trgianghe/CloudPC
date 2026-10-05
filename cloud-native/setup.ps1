param([switch]$Build)
$ErrorActionPreference='Stop'
Set-Location -LiteralPath $PSScriptRoot
$workspaceRoot = Split-Path -Parent $PSScriptRoot
$bundledNodeRoot = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node'
$nodeExe = Join-Path $bundledNodeRoot 'bin\node.exe'
if (!(Test-Path -LiteralPath $nodeExe)) { $nodeExe = (Get-Command node.exe -ErrorAction Stop).Source }
$env:PATH = (Split-Path -Parent $nodeExe) + ';' + $env:PATH
$pnpmFile = Join-Path $bundledNodeRoot 'node_modules\pnpm\bin\pnpm.cjs'
if (Test-Path -LiteralPath $pnpmFile) { & $nodeExe $pnpmFile install --frozen-lockfile }
else { & npm.cmd install }
if ($LASTEXITCODE) { throw 'Could not install signaling dependencies.' }
if (!(Test-Path 'server.config.json')) {
  $server = Get-Content 'server.config.example.json' -Raw | ConvertFrom-Json
  $clientToken = [Guid]::NewGuid().ToString('N') + [Guid]::NewGuid().ToString('N')
  $hostToken = [Guid]::NewGuid().ToString('N') + [Guid]::NewGuid().ToString('N')
  $server.rooms.'my-pc'.client_token = $clientToken
  $server.rooms.'my-pc'.host_token = $hostToken
  $server | ConvertTo-Json -Depth 10 | Set-Content 'server.config.json' -Encoding utf8
  $hostConfig = Get-Content 'host.config.example.json' -Raw | ConvertFrom-Json
  $hostConfig.host_token = $hostToken
  # This hybrid laptop needs CPU download between the AMD display and NVIDIA encoder.
  # Set gpu on a cloud VM with VDD on the same adapter as the encoder.
  $hostConfig.capture_mode = 'copy'
  $hostConfig | ConvertTo-Json -Depth 8 | Set-Content 'host.config.json' -Encoding utf8
  @{ room='my-pc'; client_token=$clientToken } | ConvertTo-Json | Set-Content 'client.config.json' -Encoding utf8
  Write-Host 'Created distinct host and client credentials. Do not share server.config.json or host.config.json.'
}
if ($Build -or !(Test-Path 'bin\pccloud-host.exe')) {
  $goExe=Join-Path $workspaceRoot '.tools\go\bin\go.exe'
  if (!(Test-Path -LiteralPath $goExe)) { $goExe=(Get-Command go.exe -ErrorAction Stop).Source }
  New-Item -ItemType Directory -Force 'bin' | Out-Null
  # Some Windows controlled-folder policies block a new compiler from creating
  # temporary files under Documents. Build in a dedicated temporary directory.
  $taskBuildDir = Join-Path $env:TEMP ('pccloud-build-' + [Guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Force $taskBuildDir | Out-Null
  Get-ChildItem -LiteralPath 'host' -File | Where-Object { $_.Extension -eq '.go' -or $_.Name -in 'go.mod','go.sum' } | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination $taskBuildDir }
  Push-Location $taskBuildDir
  try {
    & $goExe mod download
    if ($LASTEXITCODE) { throw 'Could not download Go modules.' }
    & $goExe build -trimpath -o 'pccloud-host.exe' .
    if ($LASTEXITCODE) { throw 'Host build failed.' }
  } finally { Pop-Location }
  Copy-Item -LiteralPath (Join-Path $taskBuildDir 'pccloud-host.exe') -Destination 'bin\pccloud-host.exe'
}
Write-Host 'Setup complete. Run start_signaling.ps1 and start_host.ps1 in separate terminals.'
