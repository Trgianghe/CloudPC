param()
$ErrorActionPreference = 'Stop'
Write-Host '=== GPUs ==='
Get-CimInstance Win32_VideoController | Select-Object Name,DriverVersion,Status | Format-Table
Write-Host '=== Display and audio devices ==='
Get-PnpDevice -PresentOnly | Where-Object { $_.Class -in 'Display','Monitor','Media','AudioEndpoint' } | Select-Object Class,FriendlyName,Status | Format-Table
Write-Host '=== ViGEmBus ==='
Get-PnpDevice | Where-Object { $_.FriendlyName -match 'ViGEm|Virtual Gamepad' } | Select-Object FriendlyName,Status | Format-Table
Write-Host '=== Current session (do not run the host in Session 0) ==='
Write-Host ([Diagnostics.Process]::GetCurrentProcess().SessionId)
Write-Host '=== FFmpeg ==='
& ffmpeg.exe -hide_banner -filters 2>&1 | Select-String 'ddagrab|scale_d3d11'
& ffmpeg.exe -hide_banner -encoders 2>&1 | Select-String 'h264_nvenc|av1_nvenc|hevc_nvenc|h264_amf|libopus'
Write-Host 'This check only reads device state. It does not install drivers or change displays.'
