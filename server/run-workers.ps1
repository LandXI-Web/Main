# Land-XI 워커 — scheduler · cpu-0 · a6000-0 · a6000-1 (시스템 Python 3.11.4)
# 사용: powershell -File server/run-workers.ps1 [-Stop] [-Tail] [-Gpus 0]   (-Gpus 0,1 은 대기 워커 1장 추가 — 전력 임대로 동시 고부하는 1장뿐)
# 전력 규칙(2026-09-26): GPU 2장 동시 풀로드 금지 → 기본은 GPU0 한 장. 두 장을 띄워도 power:hot 임대(pools.yaml power.max_hot_gpus=1)가 한 장만 돌린다.
# Ollama llama-server 는 절대 건드리지 않는다 — 여기서 멈추는 것은 이 스크립트가 띄운 PID(server/.workers.pids)뿐.
param([switch]$Stop, [switch]$Tail, [int[]]$Gpus = @(0))
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $here
$pidFile = Join-Path $here ".workers.pids"
$logs = "E:\Land-XI 플랫폼\02. 데이터\_logs"
New-Item -ItemType Directory -Force $logs | Out-Null

if (Test-Path $pidFile) {
  foreach ($p in (Get-Content $pidFile)) {
    $proc = Get-Process -Id $p -ErrorAction SilentlyContinue
    if ($proc -and $proc.ProcessName -eq "python") { Stop-Process -Id $p -Force; Write-Host "[workers] stop $p" }
  }
  Remove-Item $pidFile
}
if ($Stop) { return }

$env:PYTHONIOENCODING = "utf-8"
$env:PYTHONUTF8 = "1"
$env:PYTHONPATH = $here
$env:PYTHONUNBUFFERED = "1"
$started = @()
function Launch($name, $argv, $cuda) {
  if ($cuda -ne $null) { $env:CUDA_VISIBLE_DEVICES = "$cuda" } else { Remove-Item Env:CUDA_VISIBLE_DEVICES -ErrorAction SilentlyContinue }
  $p = Start-Process python -ArgumentList $argv -RedirectStandardOutput "$logs\f1b-$name.log" -RedirectStandardError "$logs\f1b-$name.err" -WindowStyle Hidden -PassThru
  $script:started += $p.Id
  Write-Host "[workers] $name pid $($p.Id)  log $logs\f1b-$name.log"
}
Launch "scheduler" @("workers/scheduler.py") $null
Launch "cpu-0" @("workers/cpu_worker.py") $null
Launch "cpu-1" @("workers/cpu_worker.py", "--id", "cpu-1", "--no-finalize") $null   # shard 전용(느린 원격 지수가 빠른 실태조사를 굶기지 않게)
foreach ($g in $Gpus) { Launch "a6000-$g" @("workers/gpu_worker.py", "--gpu", "$g") $g }
$started | Set-Content $pidFile
Remove-Item Env:CUDA_VISIBLE_DEVICES -ErrorAction SilentlyContinue
Start-Sleep -Seconds 12
foreach ($n in @("scheduler", "cpu-0", "cpu-1") + ($Gpus | % { "a6000-$_" })) { Get-Content "$logs\f1b-$n.log" -Encoding utf8 -ErrorAction SilentlyContinue | Select -First 6 }
if ($Tail) { Get-Content ($Gpus | % { "$logs\f1b-a6000-$_.log" }) -Wait -Tail 5 -Encoding utf8 }
