# Land-XI 워커 — scheduler · cpu-0 · cpu-1 · a6000-0 (시스템 Python 3.11.4)
# 사용: powershell -File server/run-workers.ps1 [-Stop] [-Tail] [-Gpus 0] [-NoWait]   (-Gpus 0,1 은 대기 워커 1장 추가 — 전력 임대로 동시 고부하는 1장뿐)
# 전력 규칙(2026-09-26): GPU 2장 동시 풀로드 금지 → 기본은 GPU0 한 장. 두 장을 띄워도 power:hot 임대(pools.yaml power.max_hot_gpus=1)가 한 장만 돌린다.
# S-12: PID 잠금 — .workers.lock 을 다른 살아 있는 프로세스가 쥐고 있으면(동시 기동) 새로 띄우지 않는다. 띄운 PID 는 .workers.pids.
# Ollama llama-server · vLLM 은 절대 건드리지 않는다 — 여기서 멈추는 것은 이 스크립트가 띄운 PID(server/.workers.pids)뿐.
param([switch]$Stop, [switch]$Tail, [int[]]$Gpus = @(0), [switch]$NoWait)
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $here
$pidFile = Join-Path $here ".workers.pids"
$lockFile = Join-Path $here ".workers.lock"
$logs = "E:\Land-XI 플랫폼\02. 데이터\_logs"
New-Item -ItemType Directory -Force $logs | Out-Null

if (-not $Stop -and (Test-Path $lockFile)) {
  $l = Get-Content $lockFile | Select-Object -First 1
  $holder = if ($l) { [int]($l.Split(" ")[0]) } else { 0 }
  $parent = (Get-CimInstance Win32_Process -Filter "ProcessId=$PID" -ErrorAction SilentlyContinue).ParentProcessId
  if ($holder -and $holder -ne $PID -and $holder -ne $parent -and (Get-Process -Id $holder -ErrorAction SilentlyContinue)) {
    Write-Host "[workers] 다른 기동(pid $holder)이 워커를 올리는 중 — 건너뜀(.workers.lock)"
    return
  }
}

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
# 자식이 부모 파이프를 상속하지 않게 ShellExecute(cmd /c · 핸들 상속 0)로 띄운다 — Start-Process -Redirect* 는 핸들을 상속해
# 'start-landxi.ps1 | Select-Object' · bash 파이프가 게이트웨이가 죽을 때까지 끝나지 않았다(S-12 · 2026-09-27 실측). 반환 = 실제 프로그램 프로세스.
function Start-Hidden([string]$exe, [string[]]$argv, [string]$wd, [string]$out, [string]$err) {
  $q = { param($s) if ($s -match '[\s&|<>^]') { '"' + $s + '"' } else { $s } }
  $cmdline = (& $q $exe) + ' ' + (($argv | ForEach-Object { & $q $_ }) -join ' ') + ' > "' + $out + '" 2> "' + $err + '"'
  $c = Start-Process cmd.exe -ArgumentList ('/d /s /c "' + $cmdline + '"') -WorkingDirectory $wd -WindowStyle Hidden -PassThru
  for ($i = 0; $i -lt 40; $i++) {
    $ch = Get-CimInstance Win32_Process -Filter "ParentProcessId=$($c.Id)" -ErrorAction SilentlyContinue | Where-Object { $_.Name -ne 'conhost.exe' } | Select-Object -First 1
    if ($ch) { return (Get-Process -Id $ch.ProcessId -ErrorAction SilentlyContinue) }
    Start-Sleep -Milliseconds 100
  }
  return $c
}
function Launch($name, $argv, $cuda) {
  if ($cuda -ne $null) { $env:CUDA_VISIBLE_DEVICES = "$cuda" } else { Remove-Item Env:CUDA_VISIBLE_DEVICES -ErrorAction SilentlyContinue }
  $p = Start-Hidden "python" $argv $here "$logs\f1b-$name.log" "$logs\f1b-$name.err"
  $script:started += $p.Id
  Write-Host "[workers] $name pid $($p.Id)  log $logs\f1b-$name.log"
}
Launch "scheduler" @("workers/scheduler.py") $null
Launch "cpu-0" @("workers/cpu_worker.py") $null
Launch "cpu-1" @("workers/cpu_worker.py", "--id", "cpu-1", "--no-finalize") $null   # shard 전용(느린 원격 지수가 빠른 실태조사를 굶기지 않게)
foreach ($g in $Gpus) { Launch "a6000-$g" @("workers/gpu_worker.py", "--gpu", "$g") $g }
$started | Set-Content $pidFile
Remove-Item Env:CUDA_VISIBLE_DEVICES -ErrorAction SilentlyContinue
if ($NoWait) { return }          # start-landxi.ps1 는 하트비트로 기다린다(고정 sleep 0)
Start-Sleep -Seconds 12
foreach ($n in @("scheduler", "cpu-0", "cpu-1") + ($Gpus | % { "a6000-$_" })) { Get-Content "$logs\f1b-$n.log" -Encoding utf8 -ErrorAction SilentlyContinue | Select -First 6 }
if ($Tail) { Get-Content ($Gpus | % { "$logs\f1b-a6000-$_.log" }) -Wait -Tail 5 -Encoding utf8 }
