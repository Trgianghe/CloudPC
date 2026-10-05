param([switch]$Watch, [int]$SessionId = -1)
$ErrorActionPreference = 'Stop'
$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (!$principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'Run this script as Administrator inside the RDP session you own.'
}
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class CloudSession {
  [DllImport("wtsapi32.dll", SetLastError=true)]
  static extern bool WTSQuerySessionInformationW(IntPtr h, int session, int info, out IntPtr buffer, out int bytes);
  [DllImport("wtsapi32.dll")] static extern void WTSFreeMemory(IntPtr buffer);
  public static int Query(int session, int info) {
    IntPtr p; int bytes;
    if (!WTSQuerySessionInformationW(IntPtr.Zero, session, info, out p, out bytes))
      throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
    try { return bytes == 2 ? Marshal.ReadInt16(p) : Marshal.ReadInt32(p); }
    finally { WTSFreeMemory(p); }
  }
}
'@
$ownedSession = [Diagnostics.Process]::GetCurrentProcess().SessionId
if ($SessionId -lt 0) { $SessionId = $ownedSession }
if ($SessionId -ne $ownedSession) { throw 'Only transfer the current session; do not take over another user session.' }
if ([CloudSession]::Query($SessionId,16) -ne 2) { Write-Host 'This is not an RDP session. Nothing changed.'; exit 0 }
$tsconPath = Join-Path $env:WINDIR 'System32\tscon.exe'
if ($Watch) {
  Write-Host "Watching your RDP session $SessionId. Keep this process running before disconnecting RDP."
  while ([CloudSession]::Query($SessionId,8) -ne 4) { Start-Sleep -Milliseconds 500 }
}
Write-Host "Returning RDP session $SessionId to console. The RDP connection will disconnect."
& $tsconPath $SessionId /dest:console
if ($LASTEXITCODE -ne 0) { throw "tscon failed (exit $LASTEXITCODE). Check session ownership and permissions." }
