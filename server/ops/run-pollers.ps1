# LX/OPS 폴러 2개(gpu 2s · storage 60s) — F1-CONTRACT §5.3 Redis 키를 쓴다. 읽기 전용: GPU 위 어떤 프로세스도 건드리지 않는다(Ollama 종료 금지).
# 사용:
#   powershell -File server/ops/run-pollers.ps1                  # Redis(기본 redis://localhost:6380)로 백그라운드 기동
#   powershell -File server/ops/run-pollers.ps1 -Stdout -Once    # 단독 검증: 한 번 읽어 JSON 한 줄씩 표준출력(Redis 없이)
#   powershell -File server/ops/run-pollers.ps1 -Stop            # 이 스크립트가 띄운 PID(server/ops/.pollers.pids)만 멈춘다
# 참고: :8702 serve-ops.mjs 는 스스로 두 폴러를 --stdout 자식으로 띄운다(OPS_NO_POLLERS=1 이면 끈다). 이 스크립트는 게이트웨이(:8700) 단독 운영용.
param([switch]$Stop, [switch]$Stdout, [switch]$Once, [string]$Redis = "", [double]$GpuInterval = 2, [double]$StorageInterval = 60)
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$pidFile = Join-Path $here ".pollers.pids"
$env:PYTHONIOENCODING = "utf-8"
$env:PYTHONUTF8 = "1"
$env:PYTHONUNBUFFERED = "1"

if (-not $Redis) {
  $Redis = $env:LX_REDIS_URL
  if (-not $Redis) {
    $envFile = Join-Path (Split-Path -Parent $here) ".env"
    if (Test-Path $envFile) {
      $m = Select-String -Path $envFile -Pattern '^\s*REDIS_URL\s*=\s*(\S+)' -Encoding utf8 | Select-Object -First 1
      if ($m) { $Redis = ($m.Matches[0].Groups[1].Value -replace '/0$', '') }
    }
  }
  if (-not $Redis) { $Redis = "redis://localhost:6380" }
}

if (Test-Path $pidFile) {
  foreach ($p in (Get-Content $pidFile)) {
    $proc = Get-Process -Id $p -ErrorAction SilentlyContinue
    if ($proc -and $proc.ProcessName -eq "python") { Stop-Process -Id $p -Force; Write-Host "[pollers] stop $p" }
  }
  Remove-Item $pidFile
}
if ($Stop) { return }

if ($Stdout) {
  $extra = @(); if ($Once) { $extra += "--once" }
  python (Join-Path $here "gpu_poller.py") --stdout "--redis=" --interval $GpuInterval @extra
  python (Join-Path $here "storage_poller.py") --stdout "--redis=" --interval $StorageInterval @extra
  return
}

$logs = if ($env:LX_DATA_ROOT) { Join-Path $env:LX_DATA_ROOT "_logs" } else { "E:\Land-XI 플랫폼\02. 데이터\_logs" }
New-Item -ItemType Directory -Force $logs | Out-Null
$started = @()
foreach ($spec in @(@("gpu", "gpu_poller.py", $GpuInterval), @("storage", "storage_poller.py", $StorageInterval))) {
  $p = Start-Process python -ArgumentList @(("`"" + (Join-Path $here $spec[1]) + "`""), "--redis", $Redis, "--interval", "$($spec[2])") `
    -RedirectStandardOutput "$logs\f1c-$($spec[0])-poller.log" -RedirectStandardError "$logs\f1c-$($spec[0])-poller.err" -WindowStyle Hidden -PassThru
  $started += $p.Id
  Write-Host "[pollers] $($spec[0]) pid $($p.Id) → $Redis  log $logs\f1c-$($spec[0])-poller.err"
}
$started | Set-Content $pidFile
Start-Sleep -Seconds 4
Get-Content "$logs\f1c-gpu-poller.err" -Encoding utf8 -ErrorAction SilentlyContinue | Select-Object -Last 3


