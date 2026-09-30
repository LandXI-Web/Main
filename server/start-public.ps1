# Land-XI 바깥 주소 — 공개 관문(tools/public-gate.mjs :4180) + Cloudflare 터널(landxi → app.land-xi.dev) 을 숨김으로 띄운다.
# 사용: powershell -File server/start-public.ps1 [-Stop] [-Status]
# 로그온 때 자동: 예약 작업 'LandXI-Public'(이 스크립트). 게이트웨이(:8700)는 start-landxi.ps1 이 띄운다.
param([switch]$Stop, [switch]$Status)
$ErrorActionPreference = "Continue"
$repo = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$logs = Join-Path $repo "server\logs"; New-Item -ItemType Directory -Force $logs | Out-Null
$cf = "C:\Program Files (x86)\cloudflared\cloudflared.exe"
$cfg = "$env:USERPROFILE\.cloudflared\landxi.yml"   # 영문 경로에 둔다(PowerShell 5.1 은 BOM 없는 스크립트의 한글 경로를 깨뜨린다)

function Gate { Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like "*public-gate.mjs*" } }
function Tunnel { Get-CimInstance Win32_Process -Filter "Name='cloudflared.exe'" | Where-Object { $_.CommandLine -like "*landxi.yml*" } }

if ($Status) { "gate: " + [bool](Gate); "tunnel: " + [bool](Tunnel); exit 0 }
if ($Stop) { Gate | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }; Tunnel | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }; "stopped"; exit 0 }

if (-not (Gate)) {
  Start-Process -WindowStyle Hidden -FilePath "node" -ArgumentList @("`"$repo\tools\public-gate.mjs`"") -WorkingDirectory $repo `
    -RedirectStandardOutput "$logs\public-gate.log" -RedirectStandardError "$logs\public-gate.err"
}
if (-not (Tunnel)) {
  Start-Process -WindowStyle Hidden -FilePath $cf -ArgumentList @("--no-autoupdate", "--protocol", "http2", "--config", "`"$cfg`"", "tunnel", "run") `
    -RedirectStandardOutput "$logs\tunnel.log" -RedirectStandardError "$logs\tunnel.err"
}
Start-Sleep -Seconds 3
"gate: " + [bool](Gate); "tunnel: " + [bool](Tunnel)
