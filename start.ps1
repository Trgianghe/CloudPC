param([switch]$Setup)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$runtimePython = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
if (!(Test-Path '.venv\Scripts\python.exe')) {
  if (Test-Path $runtimePython) { & $runtimePython -m venv .venv }
  else { py -3 -m venv .venv }
  if ($LASTEXITCODE) { throw 'Could not create the Python environment.' }
  $Setup = $true
}
if ($Setup) {
  & .\.venv\Scripts\python.exe -m pip install -r requirements.txt
  if ($LASTEXITCODE) { throw 'Could not install the required packages.' }
}
if (!(Test-Path 'config.json')) {
  $cfg = Get-Content config.example.json -Raw | ConvertFrom-Json
  $cfg.access_code = [Guid]::NewGuid().ToString('N') + [Guid]::NewGuid().ToString('N')
  $cfg | ConvertTo-Json -Depth 8 | Set-Content config.json -Encoding utf8
  Write-Host 'Created a private access code in config.json.'
}
& (Join-Path $PSScriptRoot 'start_native_backend.ps1')
Set-Location -LiteralPath $PSScriptRoot
& .\.venv\Scripts\python.exe server.py
