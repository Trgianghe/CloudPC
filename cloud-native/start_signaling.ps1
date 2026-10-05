$ErrorActionPreference='Stop'
Set-Location -LiteralPath $PSScriptRoot
$nodeExe=Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
if (!(Test-Path $nodeExe)) { $nodeExe=(Get-Command node.exe -ErrorAction Stop).Source }
& $nodeExe server.js
