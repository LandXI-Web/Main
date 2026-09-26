# Land-XI 목(mock) 게이트웨이 :8701 — 계약 픽스처 + 녹음 리플레이(F1-CONTRACT §1). DB·Redis·GPU 불필요.
param([int]$Port = 8701)
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $here
$env:PYTHONIOENCODING = "utf-8"
$env:PYTHONUTF8 = "1"
$env:PYTHONPATH = $here
Write-Host "[mock] http://localhost:$Port/api/v1/health"
python -m uvicorn mock.mock_api:app --host 127.0.0.1 --port $Port --log-level warning
