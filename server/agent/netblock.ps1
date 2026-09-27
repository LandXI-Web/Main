# F2-E 판정 장면용 — LLM 백엔드 '네트워크 차단'(hosts 규칙). 컨테이너(vLLM · Ollama)는 종료·재기동하지 않는다.
#   -Setup   : hosts 에 LandXI-LLM 절(3개 이름 → 127.0.0.1) + 게이트웨이 런타임 덮어쓰기(Redis agent:backends)를 이름 URL 로
#   -Block   : 3개 이름 → 0.0.0.0 (연결 즉시 실패) → 게이트웨이 사슬 vLLM → Ollama 전부 실패 → llm_unavailable 503 → 프론트 리플레이
#   -Unblock : 3개 이름 → 127.0.0.1 (원상)
#   -Reset   : Redis 덮어쓰기 삭제(env 기본 127.0.0.1 URL 로) + hosts 절 제거
#   -Status  : hosts 절 · Redis 덮어쓰기 · 이름 해석
# 관리자 권한 필요(hosts). 로그: 02. 데이터/_logs/f2e-netblock.log
param([switch]$Setup, [switch]$Block, [switch]$Unblock, [switch]$Reset, [switch]$Status)
$ErrorActionPreference = "Stop"
$hosts = "$env:SystemRoot\System32\drivers\etc\hosts"
$names = @("llm-gemma.landxi.internal", "llm-router.landxi.internal", "llm-ollama.landxi.internal")
$urls = @{ vllm_url = "http://llm-gemma.landxi.internal:8000/v1"; router_url = "http://llm-router.landxi.internal:8001/v1"; ollama_url = "http://llm-ollama.landxi.internal:11434/v1" }
$log = "E:\Land-XI 플랫폼\02. 데이터\_logs\f2e-netblock.log"
function Say($m) { $l = "{0} {1}" -f (Get-Date -Format "yyyy-MM-ddTHH:mm:ss.fff"), $m; Write-Host $l; Add-Content -Path $log -Value $l -Encoding UTF8 }

function Write-Section([string]$ip) {
  $lines = Get-Content $hosts -Encoding ASCII
  $out = New-Object System.Collections.Generic.List[string]
  $skip = $false
  foreach ($x in $lines) {
    if ($x -eq "# LandXI-LLM-BEGIN") { $skip = $true; continue }
    if ($x -eq "# LandXI-LLM-END") { $skip = $false; continue }
    if (-not $skip) { $out.Add($x) }
  }
  if ($ip) {
    $out.Add("# LandXI-LLM-BEGIN")
    foreach ($n in $names) { $out.Add("$ip $n") }
    $out.Add("# LandXI-LLM-END")
  }
  for ($i = 0; $i -lt 20; $i++) {       # DNS 클라이언트가 hosts 를 읽는 순간과 겹치면 잠김 → 짧게 재시도
    try { [System.IO.File]::WriteAllLines($hosts, $out, [System.Text.Encoding]::ASCII); break } catch { Start-Sleep -Milliseconds 250 }
  }
  ipconfig /flushdns | Out-Null
}
function Redis-Set { foreach ($k in $urls.Keys) { docker exec landxi-redis redis-cli HSET agent:backends $k $urls[$k] | Out-Null } }
function Redis-Del { docker exec landxi-redis redis-cli DEL agent:backends | Out-Null }

if ($Setup) { Write-Section "127.0.0.1"; Redis-Set; Say "setup: hosts 127.0.0.1 · agent:backends → 이름 URL" }
if ($Block) { Write-Section "0.0.0.0"; Say "block: LLM 이름 3개 → 0.0.0.0 (컨테이너 종료 0)" }
if ($Unblock) { Write-Section "127.0.0.1"; Say "unblock: LLM 이름 3개 → 127.0.0.1" }
if ($Reset) { Redis-Del; Write-Section $null; Say "reset: agent:backends 삭제 · hosts 절 제거" }
if ($Status -or -not ($Setup -or $Block -or $Unblock -or $Reset)) {
  Select-String -Path $hosts -Pattern "landxi.internal" | ForEach-Object { $_.Line }
  docker exec landxi-redis redis-cli HGETALL agent:backends
  foreach ($n in $names) { try { "{0} -> {1}" -f $n, ([System.Net.Dns]::GetHostAddresses($n) -join ",") } catch { "{0} -> 해석 실패" -f $n } }
}
