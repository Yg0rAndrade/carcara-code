param([string]$Hwnd, [string]$Action, [int]$Seconds = 5)
# Mexe numa janela pelo HWND: min | restore | top | untop | state | front | cover
# cover: abre uma janela opaca, sempre-no-topo, do tamanho da janela-alvo, por $Seconds s.
Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class W2 {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint f);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
}
"@
$h = [IntPtr][Int64]$Hwnd
switch ($Action) {
  'min' { [void][W2]::ShowWindow($h, 6) }
  'restore' { [void][W2]::ShowWindow($h, 9) }
  'top' { [void][W2]::SetWindowPos($h, [IntPtr](-1), 0, 0, 0, 0, 0x43) }
  'untop' { [void][W2]::SetWindowPos($h, [IntPtr](-2), 0, 0, 0, 0, 0x43) }
  'front' { [void][W2]::SetForegroundWindow($h) }
  'state' { return ('iconic=' + [W2]::IsIconic($h) + ' foreground=' + ([W2]::GetForegroundWindow() -eq $h)) }
  'cover' {
    $r = New-Object W2+RECT
    [void][W2]::GetWindowRect($h, [ref]$r)
    $f = New-Object System.Windows.Forms.Form
    $f.FormBorderStyle = 'None'; $f.StartPosition = 'Manual'; $f.TopMost = $true
    $f.BackColor = [System.Drawing.Color]::DarkSlateGray; $f.ShowInTaskbar = $false
    $f.Bounds = New-Object System.Drawing.Rectangle ($r.L - 20), ($r.T - 20), ($r.R - $r.L + 40), ($r.B - $r.T + 40)
    $f.Show()
    $end = (Get-Date).AddSeconds($Seconds)
    while ((Get-Date) -lt $end) { [System.Windows.Forms.Application]::DoEvents(); Start-Sleep -Milliseconds 50 }
    $f.Close()
  }
}
"ok $Action"
