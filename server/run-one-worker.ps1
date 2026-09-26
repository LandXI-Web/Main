# 워커 하나만 재시작(나머지는 그대로) — 코드 수정 반영용. Ollama 는 건드리지 않는다.
# 사용: powershell -File server/run-one-worker.ps1 -Name scheduler|cpu-0|a6000-0
param([Parameter(Mandatory = $true)][ValidateSet("scheduler", "cpu-0", "a6000-0", "a6000-1")][string]$Name)
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $here
$logs = "E:\Land-XI 플랫폼\02. 데이터\_logs"
$pidFile = Join-Path $here ".workers.pids"
$map = @{ "scheduler" = "workers/scheduler.py"; "cpu-0" = "workers/cpu_worker.py"; "a6000-0" = "workers/gpu_worker.py"; "a6000-1" = "workers/gpu_worker.py" }
$pids = @(Get-Content $pidFile)
$keep = @()
foreach ($p in $pids) {
  $cl = (Get-CimInstance Win32_Process -Filter "ProcessId=$p" -ErrorAction SilentlyContinue).CommandLine
  if (-not $cl) { continue }   # 이미 죽은 PID 는 버린다
  $gpuArg = if ($Name -like "a6000-*") { "--gpu " + $Name.Split("-")[1] } else { "" }
  if ($cl -and $cl -match [regex]::Escape($map[$Name]) -and ($gpuArg -eq "" -or $cl -match [regex]::Escape($gpuArg))) { Stop-Process -Id $p -Force; Write-Host "[worker] stop $Name $p" } else { $keep += $p }
}
$env:PYTHONIOENCODING = "utf-8"; $env:PYTHONUTF8 = "1"; $env:PYTHONPATH = $here; $env:PYTHONUNBUFFERED = "1"
$argv = @($map[$Name])
if ($Name -like "a6000-*") { $g = $Name.Split("-")[1]; $argv += @("--gpu", $g); $env:CUDA_VISIBLE_DEVICES = $g } else { $env:CUDA_VISIBLE_DEVICES = "" }
if (Test-Path "$logs\f1b-$Name.log") { Copy-Item "$logs\f1b-$Name.log" "$logs\f1b-$Name.prev.log" -Force }
$p = Start-Process python -ArgumentList $argv -RedirectStandardOutput "$logs\f1b-$Name.log" -RedirectStandardError "$logs\f1b-$Name.err" -WindowStyle Hidden -PassThru
$keep += $p.Id
$keep | Set-Content $pidFile
Write-Host "[worker] $Name pid $($p.Id)"
