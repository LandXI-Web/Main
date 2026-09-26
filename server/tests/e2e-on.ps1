# F1-B 실서버 e2e — compose up → 마이그레이션·시드(setup.ps1 이 idempotent) → 게이트웨이 :8700 → 워커(GPU0 한 장 · 전력 규칙) → LX_API=on playwright f1b-*
# 사용: powershell -File server/tests/e2e-on.ps1 [-SkipSetup]
# Ollama llama-server 는 건드리지 않는다. 게이트웨이·워커가 이미 떠 있으면 그대로 쓴다.
param([switch]$SkipSetup)
$ErrorActionPreference = "Stop"
$server = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$repo = Split-Path -Parent $server
docker compose -p landxi -f "$server\docker-compose.phase0.yml" up -d | Out-Null
if (-not $SkipSetup) { powershell -NoProfile -File "$server\setup.ps1" }
$ok = $false
try { $ok = (Invoke-RestMethod http://127.0.0.1:8700/api/v1/health -TimeoutSec 3).ok } catch {}
if (-not $ok) {
  $env:PYTHONIOENCODING = "utf-8"; $env:PYTHONUTF8 = "1"; $env:PYTHONPATH = $server
  $p = Start-Process python -WorkingDirectory $server -ArgumentList @("-m", "uvicorn", "landxi_api.main:app", "--host", "127.0.0.1", "--port", "8700") `
    -RedirectStandardOutput "$env:TEMP\landxi-gw.out" -RedirectStandardError "$env:TEMP\landxi-gw.err" -WindowStyle Hidden -PassThru
  $p.Id | Set-Content "$server\.gateway.pid"
  for ($i = 0; $i -lt 30 -and -not $ok; $i++) { Start-Sleep 1; try { $ok = (Invoke-RestMethod http://127.0.0.1:8700/api/v1/health -TimeoutSec 2).ok } catch {} }
}
$h = Invoke-RestMethod http://127.0.0.1:8700/api/v1/health
if ($h.workers.gpu -lt 1) { Start-Process powershell -ArgumentList @("-NoProfile", "-File", "$server\run-workers.ps1") -WindowStyle Hidden; Start-Sleep 20 }
Set-Location $repo
$env:LX_API = "on"
npx playwright test tests/e2e/f1b- --reporter=list --workers=1
