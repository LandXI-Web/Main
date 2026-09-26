# Land-XI 1차 플래그십 한 번에 기동 (F1-∑ 통합) — Redis·PostGIS · 게이트웨이 :8700 · 목 :8701 · 워커(scheduler·cpu-0·a6000-0) · 관제 :8702 · 정적 :4173
# 사용:
#   powershell -File server/start-landxi.ps1            # 빠진 것만 띄운다(이미 LISTEN/실행 중이면 건너뜀 · 멱등)
#   powershell -File server/start-landxi.ps1 -Status    # 상태 표만
#   powershell -File server/start-landxi.ps1 -Stop      # 이 스크립트·run-workers 가 띄운 PID 만 멈춘다(4173·Docker·Ollama 는 그대로)
#   -NoMock  목 게이트웨이 생략 · -Gpus 0  워커 GPU 목록(전력 규칙: 동시 고부하 1장 — 기본 0 한 장)
# 절대 하지 않는 것: Ollama llama-server 종료 · 4173 serve.mjs 종료 · cleanriver 컨테이너 조작(docker 는 -p landxi 로만).
param([switch]$Status, [switch]$Stop, [switch]$NoMock, [int[]]$Gpus = @(0))
$ErrorActionPreference = "Continue"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$repo = Split-Path -Parent $here
$logs = "E:\Land-XI 플랫폼\02. 데이터\_logs"
$pidFile = Join-Path $here ".start-landxi.pids"
New-Item -ItemType Directory -Force $logs | Out-Null

function Listening([int]$port) { [bool](Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue) }
function ProcLike([string]$pat) { Get-CimInstance Win32_Process -Filter "Name='python.exe'" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -match $pat } }
function Http([string]$url) { try { (Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 $url).StatusCode } catch { if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 } } }

function Show-Status {
  $rows = @(
    @{ n = "정적 프론트 :4173"; ok = (Listening 4173); d = "http://localhost:4173/landxi/xi/" },
    @{ n = "Redis :6380"; ok = (Listening 6380); d = "docker landxi-redis" },
    @{ n = "PostGIS :5433"; ok = (Listening 5433); d = "docker landxi-postgis" },
    @{ n = "게이트웨이 :8700"; ok = ((Http "http://localhost:8700/api/v1/health") -eq 200); d = "http://localhost:8700/api/v1/health" },
    @{ n = "목 게이트웨이 :8701"; ok = (Listening 8701); d = "계약 픽스처·리플레이" },
    @{ n = "관제 :8702"; ok = (Listening 8702); d = "http://localhost:8702/landxi/ops/" },
    @{ n = "scheduler"; ok = [bool](ProcLike "workers/scheduler\.py"); d = "" },
    @{ n = "cpu-0"; ok = [bool](ProcLike "workers/cpu_worker\.py"); d = "" },
    @{ n = "gpu 워커"; ok = [bool](ProcLike "workers/gpu_worker\.py"); d = "전력 규칙: 동시 고부하 1장" }
  )
  foreach ($r in $rows) { Write-Host ("[{0}] {1,-18} {2}" -f ($(if ($r.ok) { "OK" } else { "--" })), $r.n, $r.d) }
}

if ($Status) { Show-Status; return }

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
  for ($i = 0; $i -lt 30 -and (Http "http://localhost:8700/api/v1/health") -ne 200; $i++) { Start-Sleep -Seconds 1 }
}

# 4) 목 :8701 (off 모드 e2e · 시연 재생)
if (-not $NoMock -and -not (Listening 8701)) {
  $p = Start-Process python -ArgumentList @("-m", "uvicorn", "mock.mock_api:app", "--host", "127.0.0.1", "--port", "8701", "--log-level", "warning") `
    -WorkingDirectory $here -RedirectStandardOutput "$logs\f1b-mock.log" -RedirectStandardError "$logs\f1b-mock.err" -WindowStyle Hidden -PassThru
  $started += $p.Id; Write-Host "[mock] :8701 pid $($p.Id)"
}

# 5) 워커 — 하나라도 없으면 run-workers.ps1 로 한 벌(자기 PID 파일만 정리)
if (-not ((ProcLike "workers/scheduler\.py") -and (ProcLike "workers/cpu_worker\.py") -and (ProcLike "workers/gpu_worker\.py"))) {
  & powershell -NoProfile -File (Join-Path $here "run-workers.ps1") -Gpus $Gpus
}

# 6) 관제 :8702 (폴러 2개를 스스로 자식으로 띄운다)
if (-not (Listening 8702)) {
  $p = Start-Process node -ArgumentList "landxi/ops/serve-ops.mjs" -WorkingDirectory $repo -RedirectStandardOutput "$logs\f1c-ops.log" -RedirectStandardError "$logs\f1c-ops.err" -WindowStyle Hidden -PassThru
  $started += $p.Id; Write-Host "[ops] :8702 pid $($p.Id)"
  Start-Sleep -Seconds 2
}

$started | Select-Object -Unique | Set-Content $pidFile
Write-Host ""
Show-Status
Write-Host ""
Write-Host "입구: 워크벤치 http://localhost:4173/landxi/login.html · XI맵 http://localhost:4173/landxi/xi/ · 글로벌 http://localhost:4173/landxi/global/ · 관제 http://localhost:8702/landxi/ops/login.html"
