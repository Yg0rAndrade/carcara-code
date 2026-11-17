param([int]$ProcessId, [string]$Out)
# Põe a janela por cima de tudo por um instante e fotografa a TELA naquele retângulo
# (pega os botões nativos e o conteúdo da GPU, que o PrintWindow às vezes perde).
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class W {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint f);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
}
"@
$h = (Get-Process -Id $ProcessId).MainWindowHandle
if ($h -eq [IntPtr]::Zero) { throw "sem janela" }
[void][W]::ShowWindow($h, 9)
# 0x0001 NOSIZE | 0x0002 NOMOVE | 0x0040 SHOWWINDOW; -1 = TOPMOST, -2 = NOTOPMOST
[void][W]::SetWindowPos($h, [IntPtr](-1), 0, 0, 0, 0, 0x43)
Start-Sleep -Milliseconds 700
$r = New-Object W+RECT
[void][W]::GetWindowRect($h, [ref]$r)
$w = $r.R - $r.L; $hh = $r.B - $r.T
$bmp = New-Object System.Drawing.Bitmap $w, $hh
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($r.L, $r.T, 0, 0, $bmp.Size)
[void][W]::SetWindowPos($h, [IntPtr](-2), 0, 0, 0, 0, 0x43)
$bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
"${w}x${hh}"
