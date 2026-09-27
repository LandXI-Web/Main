# Land-XI 한 번에 기동 (F1-∑ 통합 · F3 §3 S-12 기동 안정) — Redis·PostGIS · 게이트웨이 :8700 · 목 :8701 · 워커(scheduler·cpu-0·cpu-1·a6000-0) · 관제 :8702 · 정적 :4173
# 사용:
#   powershell -File server/start-landxi.ps1            # 빠진 것만 띄운다(이미 LISTEN/실행 중이면 건너뜀 · 멱등)
#   powershell -File server/start-landxi.ps1 -Status    # 상태 표만
#   powershell -File server/start-landxi.ps1 -Stop      # 이 스크립트·run-workers 가 띄운 PID 만 멈춘다(4173·Docker·Ollama·vLLM 은 그대로)
#   -NoMock  목 게이트웨이 생략 · -Gpus 0  워커 GPU 목록(전력 규칙: 동시 고부하 1장 — 기본 0 한 장)
#   -Restart gateway|workers|all   해당 프로세스만 멈췄다가 다시. gateway 는 '짧게'(마이그레이션 → 게이트웨이 → 헬스 대기만 · 수 초)
#   -Watch   게이트웨이 감시(15 s 간격 헬스 · 응답 대기 20 s × 연속 3회 실패면 게이트웨이만 재기동) — 기본 기동이 숨은 창으로 하나 띄운다(-NoWatch 로 끔)
# S-12: 워커 PID 잠금(.workers.lock · 이중 기동 0) · 전력 규칙 검사(장당 상한 · max_hot_gpus · 고부하 GPU 수) · 헬스 대기 순서
#       (Redis·PG → 마이그레이션 → 게이트웨이 헬스 → 워커 하트비트 → 관제) · 게이트웨이 감시 · 관제에 가동 시간(GET /ops/uptime).
# 절대 하지 않는 것: Ollama llama-server 종료 · vLLM 컨테이너 조작 · 4173 serve.mjs 종료 · cleanriver 컨테이너 조작(docker 는 -p landxi 로만).
param([switch]$Status, [switch]$Stop, [switch]$NoMock, [int[]]$Gpus = @(0), [ValidateSet("", "gateway", "workers", "all")][string]$Restart = "",
      [switch]$Watch, [switch]$NoWatch)
$ErrorActionPreference = "Continue"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$repo = Split-Path -Parent $here
$logs = "E:\Land-XI 플랫폼\02. 데이터\_logs"
$pidFile = Join-Path $here ".start-landxi.pids"
$lockFile = Join-Path $here ".workers.lock"
$watchPid = Join-Path $here ".watch.pid"
New-Item -ItemType Directory -Force $logs | Out-Null
$t0 = Get-Date
function Step([string]$msg) { Write-Host ("[{0,5:n1}s] {1}" -f ((Get-Date) - $t0).TotalSeconds, $msg) }

$script:listenCache = $null
function Listening([int]$port) {
  if ($script:listenCache) { return [bool]($script:listenCache | Where-Object { $_ -match "^\s*TCP\s+\S+:$port\s" }) }
  [bool](Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue)
}
$script:procCache = $null
function Refresh-Procs { $script:procCache = @(Get-CimInstance Win32_Process -Filter "Name='python.exe'" -ErrorAction SilentlyContinue) }
function ProcLike([string]$pat) {
  if (-not $script:procCache) { Refresh-Procs }
  $script:procCache | Where-Object { $_.CommandLine -match $pat }
}
function Http([string]$url, [int]$t = 3) { try { (Invoke-WebRequest -UseBasicParsing -TimeoutSec $t $url).StatusCode } catch { if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 } } }
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

function Health {
  # 워커 부팅 직후 게이트웨이가 복구 sweep 으로 잠깐 바쁠 수 있다 → 3회까지(각 5 s) 다시 묻는다
  for ($i = 0; $i -lt 3; $i++) { try { return (Invoke-RestMethod -TimeoutSec 5 "http://127.0.0.1:8700/api/v1/health") } catch { Start-Sleep -Milliseconds 500 } }
  return $null
}

function Health-Line {
  $h = Health
  if (-not $h) { return "http://localhost:8700/api/v1/health" }
  $rb = $h.recovered_at_boot
  return ("health ok · workers gpu {0} cpu {1} · recovered_at_boot resumed {2} requeued {3} failed {4} · boot {5}" -f $h.workers.gpu, $h.workers.cpu, $rb.resumed, $rb.requeued, $rb.failed, $h.boot_at)
}

# ── 전력 규칙 검사(2026-09-26 필수) — 장당 power.limit · 설정 max_hot_gpus · 지금 고부하 GPU 수 ──────────────
function Power-Check {
  # 32비트 셸(Git Bash 가 부르는 powershell)은 System32 → SysWOW64 로 리디렉트돼 nvidia-smi 를 못 찾는다 → Sysnative 먼저(S-12 · 2026-09-27 실측)
  $smi = @("$env:windir\Sysnative\nvidia-smi.exe", "$env:windir\System32\nvidia-smi.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
  if (-not $smi) { $c = Get-Command nvidia-smi -ErrorAction SilentlyContinue; if ($c) { $smi = $c.Source } }
  if (-not $smi) { Write-Host "[power] nvidia-smi 를 찾지 못해 전력 검사를 못 했습니다 — GPU 워커는 서버 전력 임대(power:hot)로만 돕니다" -ForegroundColor Yellow; return $false }
  $maxHot = 1
  try { $y = Get-Content (Join-Path $here "config\pools.yaml") -Encoding utf8 -Raw; if ($y -match "max_hot_gpus:\s*(\d+)") { $maxHot = [int]$Matches[1] } } catch {}
  $ok = $true
  if ($smi) {
    $rows = & $smi --query-gpu=index,power.limit,power.draw --format=csv,noheader,nounits 2>$null
    $hot = 0
    foreach ($r in $rows) {
      $v = $r.Split(",") | ForEach-Object { $_.Trim() }
      $lim = [double]$v[1]; $draw = [double]$v[2]
      if ($lim -gt 250) { Write-Host ("[power] GPU{0} 상한 {1} W — 200 W 권장(LandXI-GPU-PowerLimit-200W 예약 작업 확인)" -f $v[0], $lim) -ForegroundColor Yellow; $ok = $false }
      if ($draw -gt 100) { $hot++ }
    }
    Write-Host ("[power] 장당 상한 {0} · 지금 고부하 GPU {1}/{2}(max_hot_gpus)" -f (($rows | ForEach-Object { ($_.Split(",")[1]).Trim() + " W" }) -join " · "), $hot, $maxHot)
    if ($hot -gt $maxHot) { Write-Host "[power] 경고: 동시 고부하 GPU 가 한도를 넘습니다 — 새 GPU 워커는 임대(power:hot)로 대기합니다" -ForegroundColor Red; $ok = $false }
  }
  if ($Gpus.Count -gt $maxHot) { Write-Host ("[power] GPU 워커 {0}장 — 고부하는 임대로 {1}장만(나머지는 대기)" -f $Gpus.Count, $maxHot) -ForegroundColor Yellow }
  return $ok
}

# ── 워커 PID 잠금(이중 기동 0) ─────────────────────────────────────────────
function Lock-Held {
  if (-not (Test-Path $lockFile)) { return $false }
  $l = Get-Content $lockFile -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $l) { return $false }
  $pidL = 0; [void][int]::TryParse($l.Split(" ")[0], [ref]$pidL)
  if (((Get-Date) - (Get-Item $lockFile).LastWriteTime).TotalMinutes -gt 5) { return $false }   # 5분 넘은 잠금 = 죽은 기동(PID 재사용 오판 방지)
  $p = Get-Process -Id $pidL -ErrorAction SilentlyContinue
  return [bool]($p -and $p.ProcessName -eq "powershell")
}
function Lock-Take { "$PID $(Get-Date -Format s) start-landxi" | Set-Content $lockFile -Encoding utf8 }
function Lock-Free { if (Test-Path $lockFile) { $l = Get-Content $lockFile | Select-Object -First 1; if ($l -and [int]($l.Split(" ")[0]) -eq $PID) { Remove-Item $lockFile -Force } } }

function Show-Status {
  Refresh-Procs
  $script:listenCache = @(netstat -ano -p tcp | Select-String "LISTENING" | ForEach-Object { $_.Line })
  $rows = @(
    @{ n = "정적 프론트 :4173"; ok = (Listening 4173); d = "http://localhost:4173/landxi/v3/login/" },
    @{ n = "Redis :6380"; ok = (Listening 6380); d = "docker landxi-redis" },
    @{ n = "PostGIS :5433"; ok = (Listening 5433); d = "docker landxi-postgis" },
    @{ n = "게이트웨이 :8700"; ok = ((Http "http://127.0.0.1:8700/api/v1/health") -eq 200); d = (Health-Line) },
    @{ n = "목 게이트웨이 :8701"; ok = (Listening 8701); d = "계약 픽스처·리플레이" },
    @{ n = "관제 :8702"; ok = (Listening 8702); d = "http://localhost:8702/landxi/ops/" },
    @{ n = "vLLM :8000/:8001"; ok = ((Listening 8000) -and (Listening 8001)); d = "게이트웨이 /agent/runs 경유만" },
    @{ n = "scheduler"; ok = [bool](ProcLike "workers/scheduler\.py"); d = "" },
    @{ n = "cpu-0"; ok = [bool](ProcLike "cpu_worker\.py(?!.*--id cpu-1)"); d = "shard + finalize" },
    @{ n = "cpu-1"; ok = [bool](ProcLike "cpu_worker\.py --id cpu-1"); d = "shard 전용" },
    @{ n = "gpu 워커"; ok = [bool](ProcLike "workers/gpu_worker\.py"); d = "전력 규칙: 동시 고부하 1장" },
    @{ n = "게이트웨이 감시"; ok = ((Test-Path $watchPid) -and [bool](Get-Process -Id ([int](Get-Content $watchPid)) -ErrorAction SilentlyContinue)); d = "응답 대기 20 s × 연속 3회 실패 시 재기동(15 s 간격)" }
  )
  foreach ($r in $rows) { Write-Host ("[{0}] {1,-18} {2}" -f ($(if ($r.ok) { "OK" } else { "--" })), $r.n, $r.d) }
  $script:procCache = $null; $script:listenCache = $null
}

if ($Status) { Show-Status; return }

$env:PYTHONIOENCODING = "utf-8"; $env:PYTHONUTF8 = "1"; $env:PYTHONPATH = $here; $env:PYTHONUNBUFFERED = "1"
$env:LX_DATA_ROOT = "E:/Land-XI 플랫폼/02. 데이터"

function Start-Gateway {
  $p = Start-Hidden "python" @("-m", "uvicorn", "landxi_api.main:app", "--host", "127.0.0.1", "--port", "8700", "--timeout-graceful-shutdown", "3", "--timeout-keep-alive", "75") `
    $here "$logs\f1b-gateway.log" "$logs\f1b-gateway.err"
  for ($i = 0; $i -lt 60 -and (Http "http://127.0.0.1:8700/api/v1/health") -ne 200; $i++) { Start-Sleep -Milliseconds 500 }
  return $p
}

function Stop-Gateway {
  foreach ($c in (Get-NetTCPConnection -State Listen -LocalPort 8700 -ErrorAction SilentlyContinue)) {
    $proc = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue
    if ($proc -and $proc.ProcessName -eq "python") { Stop-Process -Id $proc.Id -Force; Write-Host "[restart] gateway :8700 pid $($proc.Id) 멈춤" }
  }
  for ($i = 0; $i -lt 20 -and [bool](Get-NetTCPConnection -State Listen -LocalPort 8700 -ErrorAction SilentlyContinue); $i++) { Start-Sleep -Milliseconds 250 }
}

# ── 게이트웨이 감시(-Watch) ─────────────────────────────────────────────────
if ($Watch) {
  "$PID" | Set-Content $watchPid -Encoding utf8
  $fail = 0
  while ($true) {
    Start-Sleep -Seconds 15
    # 감시는 "죽었을 때"만 살린다 — 바쁜 게이트웨이(무거운 요청 · 동시 로그인)를 죽이지 않게 응답 대기 20 s · 연속 3회(≈ 2분) 실패일 때만
    if ((Http "http://127.0.0.1:8700/api/v1/health" 20) -eq 200) { $fail = 0; continue }
    $fail++
    Add-Content "$logs\gateway-watch.log" ("{0} health 실패 {1}/3" -f (Get-Date -Format s), $fail) -Encoding utf8
    if ($fail -ge 3) {
      Stop-Gateway
      $p = Start-Gateway
      Add-Content "$logs\gateway-watch.log" ("{0} 게이트웨이 재기동 pid {1} · health {2}" -f (Get-Date -Format s), $p.Id, (Http "http://127.0.0.1:8700/api/v1/health")) -Encoding utf8
      $fail = 0
    }
  }
}

if ($Restart -in @("gateway", "all")) { Stop-Gateway }
if ($Restart -in @("workers", "all")) { & powershell -NoProfile -File (Join-Path $here "run-workers.ps1") -Stop }

if ($Stop) {
  & powershell -NoProfile -File (Join-Path $here "run-workers.ps1") -Stop
  Stop-Gateway
  if (Test-Path $watchPid) { $w = [int](Get-Content $watchPid); Stop-Process -Id $w -Force -ErrorAction SilentlyContinue; Remove-Item $watchPid -Force }
  if (Test-Path $pidFile) {
    foreach ($p in (Get-Content $pidFile)) {
      $proc = Get-Process -Id $p -ErrorAction SilentlyContinue
      if ($proc -and ($proc.ProcessName -in @("python", "node"))) { Stop-Process -Id $p -Force; Write-Host "[stop] $p $($proc.ProcessName)" }
    }
    Remove-Item $pidFile
  }
  Write-Host "[stop] Docker(landxi-redis·postgis)·4173·Ollama·vLLM 은 그대로 둔다. 컨테이너까지 내리려면: docker compose -p landxi -f server/docker-compose.phase0.yml stop"
  return
}

$started = @(); if (Test-Path $pidFile) { $started = @(Get-Content $pidFile) }

# ── 빠른 길: -Restart gateway = 마이그레이션 → 게이트웨이 → 헬스(워커·관제·정적은 건드리지 않음) ────────────
if ($Restart -eq "gateway") {
  $mig = & python (Join-Path $here "migrate.py") 2>&1
  $mig | Select-Object -Last 1 | ForEach-Object { Step "[migrate] $_" }
  $p = Start-Gateway
  $started += $p.Id; $started | Select-Object -Unique | Set-Content $pidFile
  Step ("[gateway] :8700 pid {0}" -f $p.Id)
  Write-Host ("[OK] " + (Health-Line))
  return
}

# 0) .env · off 모드 데이터 junction
if (-not (Test-Path (Join-Path $here ".env"))) { Copy-Item (Join-Path $here ".env.example") (Join-Path $here ".env"); Write-Host "[env] server/.env 생성(.env.example)" }
$junction = Join-Path $repo "landxi\data"
if (-not (Test-Path $junction)) { New-Item -ItemType Junction $junction -Target "E:\Land-XI 플랫폼\02. 데이터" | Out-Null; Write-Host "[data] landxi/data junction 생성" }

# 1) Redis · PostGIS (compose 프로젝트 landxi 로 한정)
if (-not ((Listening 6380) -and (Listening 5433))) {
  docker compose -p landxi -f (Join-Path $here "docker-compose.phase0.yml") up -d redis postgis 2>&1 | Out-Host
  for ($i = 0; $i -lt 30 -and -not ((Listening 6380) -and (Listening 5433)); $i++) { Start-Sleep -Seconds 1 }
}
Step "[1] Redis·PostGIS"

# 1.5) 마이그레이션 — migrations/*.sql 번호순 전부(멱등 · 바뀐 파일만)
$mig = & python (Join-Path $here "migrate.py") 2>&1
$mig | Select-Object -Last 1 | ForEach-Object { Step "[migrate] $_" }
if ($LASTEXITCODE -ne 0) { Write-Host "[migrate] 실패 파일 있음 — 위 목록 확인" -ForegroundColor Red }

# 2) 정적 :4173 — 없을 때만 띄운다(있으면 절대 건드리지 않음)
if (-not (Listening 4173)) {
  $p = Start-Hidden "node" @("tools/serve.mjs") $repo "$logs\serve-4173.log" "$logs\serve-4173.err"
  $started += $p.Id; Step "[static] :4173 pid $($p.Id)"
}

# 3) 게이트웨이 :8700 — 헬스 200 까지 기다린 뒤 다음 단(워커가 게이트웨이보다 먼저 복구 sweep 을 잡지 않게)
if ((Http "http://127.0.0.1:8700/api/v1/health") -ne 200) {
  if (Listening 8700) { Stop-Gateway }
  $p = Start-Gateway
  $started += $p.Id; Step "[gateway] :8700 pid $($p.Id) · health $(Http 'http://127.0.0.1:8700/api/v1/health')"
} else { Step "[gateway] :8700 이미 동작" }

# 4) 목 :8701 (off 모드 e2e · 리플레이)
if (-not $NoMock -and -not (Listening 8701)) {
  $p = Start-Hidden "python" @("-m", "uvicorn", "mock.mock_api:app", "--host", "127.0.0.1", "--port", "8701", "--log-level", "warning") `
    $here "$logs\f1b-mock.log" "$logs\f1b-mock.err"
  $started += $p.Id; Step "[mock] :8701 pid $($p.Id)"
}

# 5) 워커 — 전력 규칙 검사 → 잠금 → 빠진 것만(살아 있는 워커는 건드리지 않음) → 하트비트 대기
[void](Power-Check)
# 다른 기동이 워커를 올리는 중이면 끝날 때까지(≤ 90 s) 기다렸다가 빠진 것만 다시 본다 — 바로 건너뛰면 하트비트 잔상만 보고 '정상'으로 착각한다
for ($i = 0; $i -lt 180 -and (Lock-Held); $i++) { if ($i -eq 0) { Step "[workers] 다른 기동이 워커를 올리는 중(.workers.lock) — 끝나길 기다림" }; Start-Sleep -Milliseconds 500 }
if (Lock-Held) {
  Step "[workers] 잠금이 90 s 넘게 풀리지 않음 — 건너뜀(.workers.lock 확인)"
} else {
  Lock-Take
  try {
    Refresh-Procs
    $hasS = [bool](ProcLike "workers/scheduler\.py"); $hasC = [bool](ProcLike "cpu_worker\.py(?!.*--id cpu-1)"); $hasC1 = [bool](ProcLike "cpu_worker\.py --id cpu-1")
    $missingG = @($Gpus | Where-Object { -not (ProcLike "workers/gpu_worker\.py --gpu $_") })
    if (-not $hasS -and -not $hasC -and $missingG.Count -eq $Gpus.Count) {
      & powershell -NoProfile -File (Join-Path $here "run-workers.ps1") -Gpus $Gpus -NoWait
    } else {
      if (-not $hasS) { & powershell -NoProfile -File (Join-Path $here "run-one-worker.ps1") -Name scheduler }
      if (-not $hasC) { & powershell -NoProfile -File (Join-Path $here "run-one-worker.ps1") -Name cpu-0 }
      if (-not $hasC1) { & powershell -NoProfile -File (Join-Path $here "run-one-worker.ps1") -Name cpu-1 }
      foreach ($g in $missingG) { & powershell -NoProfile -File (Join-Path $here "run-one-worker.ps1") -Name "a6000-$g" }
    }
    $want = $Gpus.Count
    for ($i = 0; $i -lt 40; $i++) {
      $h = Health
      if ($h -and $h.workers.cpu -ge 2 -and $h.workers.gpu -ge $want) { break }
      Start-Sleep -Milliseconds 500
    }
    $h = Health
    Step ("[workers] 하트비트 gpu {0} · cpu {1}" -f $h.workers.gpu, $h.workers.cpu)
  } finally { Lock-Free }
}

# 6) 관제 :8702 (폴러 2개를 스스로 자식으로 띄운다 · 레일에서는 빠졌지만 폴러가 ops:gpu 를 쓴다)
if (-not (Listening 8702)) {
  $p = Start-Hidden "node" @("landxi/ops/serve-ops.mjs") $repo "$logs\f1c-ops.log" "$logs\f1c-ops.err"
  $started += $p.Id; Step "[ops] :8702 pid $($p.Id)"
}

# 7) 게이트웨이 감시 — 없으면 하나(숨은 창)
if (-not $NoWatch) {
  $alive = (Test-Path $watchPid) -and [bool](Get-Process -Id ([int](Get-Content $watchPid)) -ErrorAction SilentlyContinue)
  if (-not $alive) {
    # 경로에 공백(‘Land-XI 플랫폼’ · ‘01. 디자인’)이 있어 따옴표 필수 — PS 5.1 Start-Process 는 배열 인자를 따옴표로 싸지 않는다(감시가 바로 죽던 원인)
    $w = Start-Process powershell -ArgumentList @("-NoProfile", "-WindowStyle", "Hidden", "-File", ('"' + $MyInvocation.MyCommand.Path + '"'), "-Watch") -WindowStyle Hidden -PassThru
    Step "[watch] 게이트웨이 감시 pid $($w.Id)"
  }
}

$started | Select-Object -Unique | Set-Content $pidFile
Write-Host ""
if ($Restart) { Write-Host ("[OK] " + (Health-Line)); return }
Show-Status
Write-Host ""
Write-Host "입구: 정문 http://localhost:4173/landxi/v3/login/ · 관제(레일 밖) http://localhost:8702/landxi/ops/"
