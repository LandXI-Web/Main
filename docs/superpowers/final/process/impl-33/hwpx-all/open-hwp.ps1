# 구현 33 · 받은 한글 문서를 한글 2020 으로 사람이 여는 것처럼 열어(파일 열기 · 자동화 없음) 화면을 찍는다 → opened/<곳>.png
# powershell -File docs/superpowers/final/process/impl-33/hwpx-all/open-hwp.ps1
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
Add-Type @"
using System; using System.Runtime.InteropServices;
public class W { [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c); [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h); }
"@
$D = Split-Path -Parent $MyInvocation.MyCommand.Path
$HWP = 'C:\Program Files (x86)\HNC\Office 2020\HOffice110\Bin\Hwp.exe'
$out = Join-Path $D 'opened'; New-Item -ItemType Directory -Force $out | Out-Null
$run = Get-Content (Join-Path $D 'run.json') -Raw -Encoding UTF8 | ConvertFrom-Json
foreach ($k in ($run.got.PSObject.Properties.Name | Sort-Object)) {
  $f = Join-Path (Join-Path $D 'got') $run.got.$k.file
  $p = Start-Process -FilePath $HWP -ArgumentList ('"' + $f + '"') -PassThru
  Start-Sleep -Seconds 9
  $p.Refresh()
  if ($p.MainWindowHandle -ne 0) { [W]::ShowWindow($p.MainWindowHandle, 3) | Out-Null; [W]::SetForegroundWindow($p.MainWindowHandle) | Out-Null }
  Start-Sleep -Seconds 3
  $b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
  $bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
  $g = [System.Drawing.Graphics]::FromImage($bmp); $g.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size)
  $png = Join-Path $out ("$k.png"); $bmp.Save($png, [System.Drawing.Imaging.ImageFormat]::Png); $g.Dispose(); $bmp.Dispose()
  Write-Output ("{0} {1} title={2}" -f $k, $png, $p.MainWindowTitle)
  $p.CloseMainWindow() | Out-Null
  Start-Sleep -Seconds 3
}
