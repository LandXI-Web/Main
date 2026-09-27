# Land-XI 1차 플래그십 한 번에 기동 (F1-∑ 통합) — Redis·PostGIS · 게이트웨이 :8700 · 목 :8701 · 워커(scheduler·cpu-0·a6000-0) · 관제 :8702 · 정적 :4173
# 사용:
#   powershell -File server/start-landxi.ps1            # 빠진 것만 띄운다(이미 LISTEN/실행 중이면 건너뜀 · 멱등)
#   powershell -File server/start-landxi.ps1 -Status    # 상태 표만
#   powershell -File server/start-landxi.ps1 -Stop      # 이 스크립트·run-workers 가 띄운 PID 만 멈춘다(4173·Docker·Ollama 는 그대로)
#   -NoMock  목 게이트웨이 생략 · -Gpus 0  워커 GPU 목록(전력 규칙: 동시 고부하 1장 — 기본 0 한 장)
#   -Restart gateway|workers|all   해당 프로세스만 멈췄다가 다시(게이트웨이 lifespan · scheduler 기동이 재부팅 복구 sweep 을 돈다 · v1.1-15)
#   기동 전 migrations/*.sql 을 번호순으로 전부 적용(server/migrate.py · 멱등 · 0002 F2-S · 0003 F2-E 포함)
# 절대 하지 않는 것: Ollama llama-server 종료 · 4173 serve.mjs 종료 · cleanriver 컨테이너 조작(docker 는 -p landxi 로만).
param([switch]$Status, [switch]$Stop, [switch]$NoMock, [int[]]$Gpus = @(0), [ValidateSet("", "gateway", "workers", "all")][string]$Restart = "")
$ErrorActionPreference = "Continue"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$repo = Split-Path -Parent $here
$logs = "E:\Land-XI 플랫폼\02. 데이터\_logs"
$pidFile = Join-Path $here ".start-landxi.pids"
New-Item -ItemType Directory -Force $logs | Out-Null

$script:listenCache = $null
function Listening([int]$port) {
  if ($script:listenCache) { return [bool]($script:listenCache | Where-Object { $_ -match "^\s*TCP\s+\S+:$port\s" }) }
  [bool](Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue)
}
$script:procCache = $null
function ProcLike([string]$pat) {
  $list = if ($script:procCache) { $script:procCache } else { Get-CimInstance Win32_Process -Filter "Name='python.exe'" -ErrorAction SilentlyContinue }
  $list | Where-Object { $_.CommandLine -match $pat }
}
function Http([string]$url) { try { (Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 $url).StatusCode } catch { if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 } } }

function Show-Status {
  $script:procCache = @(Get-CimInstance Win32_Process -Filter "Name='python.exe'" -ErrorAction SilentlyContinue)   # 한 번만 읽는다(-Status 13 s → 수 초)
  $script:listenCache = @(netstat -ano -p tcp | Select-String "LISTENING" | ForEach-Object { $_.Line })
  $rows = @(
    @{ n = "정적 프론트 :4173"; ok = (Listening 4173); d = "http://localhost:4173/landxi/xi/" },
    @{ n = "Redis :6380"; ok = (Listening 6380); d = "docker landxi-redis" },
    @{ n = "PostGIS :5433"; ok = (Listening 5433); d = "docker landxi-postgis" },
    @{ n = "게이트웨이 :8700"; ok = ((Http "http://127.0.0.1:8700/api/v1/health") -eq 200); d = (Health-Line) },
    @{ n = "목 게이트웨이 :8701"; ok = (Listening 8701); d = "계약 픽스처·리플레이" },
    @{ n = "관제 :8702"; ok = (Listening 8702); d = "http://localhost:8702/landxi/ops/" },
    @{ n = "scheduler"; ok = [bool](ProcLike "workers/scheduler\.py"); d = "" },
    @{ n = "cpu-0"; ok = [bool](ProcLike "workers/cpu_worker\.py$|workers/cpu_worker\.py\s*$|cpu_worker\.py(?!.*--id cpu-1)"); d = "shard + finalize" },
    @{ n = "cpu-1"; ok = [bool](ProcLike "cpu_worker\.py --id cpu-1"); d = "shard 전용" },
    @{ n = "gpu 워커"; ok = [bool](ProcLike "workers/gpu_worker\.py"); d = "전력 규칙: 동시 고부하 1장" }
  )
  foreach ($r in $rows) { Write-Host ("[{0}] {1,-18} {2}" -f ($(if ($r.ok) { "OK" } else { "--" })), $r.n, $r.d) }
  $script:procCache = $null; $script:listenCache = $null
}

function Health-Line {
  try {
    $h = Invoke-RestMethod -TimeoutSec 3 "http://127.0.0.1:8700/api/v1/health"
    $rb = $h.recovered_at_boot
    return ("health ok · workers gpu {0} cpu {1} · recovered_at_boot resumed {2} requeued {3} failed {4}" -f $h.workers.gpu, $h.workers.cpu, $rb.resumed, $rb.requeued, $rb.failed)
  } catch { return "http://localhost:8700/api/v1/health" }
}

if ($Status) { Show-Status; return }

function Stop-Gateway {
  foreach ($c in (Get-NetTCPConnection -State Listen -LocalPort 8700 -ErrorAction SilentlyContinue)) {
    $proc = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue
    if ($proc -and $proc.ProcessName -eq "python") { Stop-Process -Id $proc.Id -Force; Write-Host "[restart] gateway :8700 pid $($proc.Id) 멈춤" }
  }
  for ($i = 0; $i -lt 20 -and (Listening 8700); $i++) { Start-Sleep -Milliseconds 250 }
}
if ($Restart -in @("gateway", "all")) { Stop-Gateway }
if ($Restart -in @("workers", "all")) { & powershell -NoProfile -File (Join-Path $here "run-workers.ps1") -Stop }

if ($Stop) {
  & powershell -NoProfile -File (Join-Path $here "run-workers.ps1") -Stop
  if (Test-Path $pidFile) {
    foreach ($p in (Get-Content $pidFile)) {
      $proc = Get-Process -Id $p -ErrorAction SilentlyContinue
      if ($proc -and ($proc.ProcessName -in @("python", "node"))) { Stop-Process -Id $p -Force; Write-Host "[stop] $p $($proc.ProcessName)" }
    }
    Remove-Item $pidFile
  }
  Write-Host "[stop] Docker(landxi-redis·postgis)·4173·Ollama 는 그대로 둔다. 컨테이너까지 내리려면: docker compose -p landxi -f server/docker-compose.phase0.yml stop"
  return
}

$started = @(); if (Test-Path $pidFile) { $started = @(Get-Content $pidFile) }
$env:PYTHONIOENCODING = "utf-8"; $env:PYTHONUTF8 = "1"; $env:PYTHONPATH = $here; $env:PYTHONUNBUFFERED = "1"
$env:LX_DATA_ROOT = "E:/Land-XI 플랫폼/02. 데이터"

# 0) .env · off 모드 데이터 junction
if (-not (Test-Path (Join-Path $here ".env"))) { Copy-Item (Join-Path $here ".env.example") (Join-Path $here ".env"); Write-Host "[env] server/.env 생성(.env.example)" }
$junction = Join-Path $repo "landxi\data"
if (-not (Test-Path $junction)) { New-Item -ItemType Junction $junction -Target "E:\Land-XI 플랫폼\02. 데이터" | Out-Null; Write-Host "[data] landxi/data junction 생성" }

# 1) Redis · PostGIS (compose 프로젝트 landxi 로 한정)
if (-not ((Listening 6380) -and (Listening 5433))) {
  docker compose -p landxi -f (Join-Path $here "docker-compose.phase0.yml") up -d redis postgis 2>&1 | Out-Host
  for ($i = 0; $i -lt 30 -and -not ((Listening 6380) -and (Listening 5433)); $i++) { Start-Sleep -Seconds 1 }
}

# 1.5) 마이그레이션 — migrations/*.sql 번호순 전부(멱등 · 바뀐 파일만)
$mig = & python (Join-Path $here "migrate.py") 2>&1
$mig | Select-Object -Last 1 | ForEach-Object { Write-Host "[migrate] $_" }
if ($LASTEXITCODE -ne 0) { Write-Host "[migrate] 실패 파일 있음 — 위 목록 확인" -ForegroundColor Red }

# 2) 정적 :4173 — 없을 때만 띄운다(있으면 절대 건드리지 않음)
if (-not (Listening 4173)) {
  $p = Start-Process node -ArgumentList "tools/serve.mjs" -WorkingDirectory $repo -RedirectStandardOutput "$logs\serve-4173.log" -RedirectStandardError "$logs\serve-4173.err" -WindowStyle Hidden -PassThru
  $started += $p.Id; Write-Host "[static] :4173 pid $($p.Id)"
}

# 3) 게이트웨이 :8700
if (-not (Listening 8700)) {
  $p = Start-Process python -ArgumentList @("-m", "uvicorn", "landxi_api.main:app", "--host", "127.0.0.1", "--port", "8700", "--timeout-graceful-shutdown", "3", "--timeout-keep-alive", "75") `
    -WorkingDirectory $here -RedirectStandardOutput "$logs\f1b-gateway.log" -RedirectStandardError "$logs\f1b-gateway.err" -WindowStyle Hidden -PassThru
  $started += $p.Id; Write-Host "[gateway] :8700 pid $($p.Id)"
  for ($i = 0; $i -lt 30 -and (Http "http://127.0.0.1:8700/api/v1/health") -ne 200; $i++) { Start-Sleep -Seconds 1 }
}

# 4) 목 :8701 (off 모드 e2e · 시연 재생)
if (-not $NoMock -and -not (Listening 8701)) {
  $p = Start-Process python -ArgumentList @("-m", "uvicorn", "mock.mock_api:app", "--host", "127.0.0.1", "--port", "8701", "--log-level", "warning") `
    -WorkingDirectory $here -RedirectStandardOutput "$logs\f1b-mock.log" -RedirectStandardError "$logs\f1b-mock.err" -WindowStyle Hidden -PassThru
  $started += $p.Id; Write-Host "[mock] :8701 pid $($p.Id)"
}

# 5) 워커 — 빠진 것만 하나씩(run-one-worker.ps1 · 살아 있는 워커는 건드리지 않음). 아무것도 없으면 run-workers.ps1 한 벌.
$hasS = [bool](ProcLike "workers/scheduler\.py"); $hasC = [bool](ProcLike "cpu_worker\.py(?!.*--id cpu-1)"); $hasC1 = [bool](ProcLike "cpu_worker\.py --id cpu-1")
$missingG = @($Gpus | Where-Object { -not (ProcLike "workers/gpu_worker\.py --gpu $_") })
if (-not $hasS -and -not $hasC -and $missingG.Count -eq $Gpus.Count) {
  & powershell -NoProfile -File (Join-Path $here "run-workers.ps1") -Gpus $Gpus
} else {
  if (-not $hasS) { & powershell -NoProfile -File (Join-Path $here "run-one-worker.ps1") -Name scheduler }
  if (-not $hasC) { & powershell -NoProfile -File (Join-Path $here "run-one-worker.ps1") -Name cpu-0 }
  if (-not $hasC1) { & powershell -NoProfile -File (Join-Path $here "run-one-worker.ps1") -Name cpu-1 }
  foreach ($g in $missingG) { & powershell -NoProfile -File (Join-Path $here "run-one-worker.ps1") -Name "a6000-$g" }
}

# 6) 관제 :8702 (폴러 2개를 스스로 자식으로 띄운다)
if (-not (Listening 8702)) {
  $p = Start-Process node -ArgumentList "landxi/ops/serve-ops.mjs" -WorkingDirectory $repo -RedirectStandardOutput "$logs\f1c-ops.log" -RedirectStandardError "$logs\f1c-ops.err" -WindowStyle Hidden -PassThru
  $started += $p.Id; Write-Host "[ops] :8702 pid $($p.Id)"
  Start-Sleep -Seconds 2
}

$started | Select-Object -Unique | Set-Content $pidFile
Write-Host ""
if ($Restart) { Write-Host ("[OK] " + (Health-Line)); return }      # -Restart: 표 대신 한 줄(재기동 시간 단축)
Show-Status
Write-Host ""
Write-Host "입구: 워크벤치 http://localhost:4173/landxi/login.html · XI맵 http://localhost:4173/landxi/xi/ · 글로벌 http://localhost:4173/landxi/global/ · 관제 http://localhost:8702/landxi/ops/login.html"
