param([switch]$Diagnose)
$ErrorActionPreference='Stop'
Set-Location -LiteralPath $PSScriptRoot
if ($Diagnose) { & .\bin\pccloud-host.exe -config host.config.json -diagnose }
else { & .\bin\pccloud-host.exe -config host.config.json }
