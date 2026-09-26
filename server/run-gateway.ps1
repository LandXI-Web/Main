# Land-XI 게이트웨이 :8700 — 시스템 Python 3.11.4
# 사용: powershell -File server/run-gateway.ps1 [-Port 8700] [-Reload]
param([int]$Port = 8700, [switch]$Reload)
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $here
$env:PYTHONIOENCODING = "utf-8"
$env:PYTHONUTF8 = "1"
$env:PYTHONPATH = $here
$args2 = @("-m", "uvicorn", "landxi_api.main:app", "--host", "127.0.0.1", "--port", "$Port", "--log-level", "info", "--timeout-graceful-shutdown", "3", "--timeout-keep-alive", "75")
if ($Reload) { $args2 += "--reload" }
Write-Host "[gateway] http://localhost:$Port/api/v1/health  (docs /api/v1/docs)"
python @args2
