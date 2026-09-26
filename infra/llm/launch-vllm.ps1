<#
.SYNOPSIS
  Land-XI vLLM 기동/정지/상태/스모크 — 전력·VRAM 안전 점검을 통과해야만 기동한다.

.DESCRIPTION
  규칙 (2026-09-26 전력 부족 셧다운 이후):
    - GPU 한 장만(기본 GPU1). 다른 GPU 가 고부하면 기동 거부(-Force 로도 이 규칙은 못 넘는다).
    - Ollama(종료 금지) · Land-XI gpu_worker 와 공존: 실측 여유 VRAM - 2,048MiB 안에서 gpu-memory-utilization 계산.
    - 드라이버가 CUDA 이미지 요구치 미만이면 기동하지 않는다. CPU 모드 대체 기동도 하지 않는다.
    - 부하 테스트·벤치 없음. -Smoke 는 짧은 요청 3개뿐.

.EXAMPLE
  .\launch-vllm.ps1 -Check            # 점검만(기동 안 함)
  .\launch-vllm.ps1                   # 두뇌(Gemma 4 12B) 기동, GPU1
  .\launch-vllm.ps1 -Router           # 두뇌 + 라우터(HyperCLOVAX 1.5B), 같은 GPU
  .\launch-vllm.ps1 -Gpu 0            # 스케줄러가 GPU0 을 LLM 에 배정했을 때
  .\launch-vllm.ps1 -Status
  .\launch-vllm.ps1 -Smoke
  .\launch-vllm.ps1 -Stop
#>
[CmdletBinding()]
param(
  [ValidateSet(0, 1)][int]$Gpu = 1,
  [switch]$Router,
  [switch]$Check,
  [switch]$Status,
  [switch]$Smoke,
  [switch]$Stop,
  [switch]$Force   # 대상 GPU 가 바빠도 기동(다른 GPU 고부하 규칙은 무시 불가)
)
$ErrorActionPreference = 'Stop'
$Here    = Split-Path -Parent $MyInvocation.MyCommand.Path
$Compose = Join-Path $Here 'docker-compose.vllm.yml'
$EnvFile = Join-Path $Here '.env'
$LogDir  = Join-Path $Here 'logs'
$Smi     = 'C:\Windows\System32\nvidia-smi.exe'
if (-not (Test-Path $Smi)) { $Smi = 'nvidia-smi' }
New-Item -ItemType Directory -Force $LogDir | Out-Null
$Log = Join-Path $LogDir ('launch-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.log')
function Say([string]$m) { $l = '[' + (Get-Date -Format 'HH:mm:ss') + '] ' + $m; Write-Host $l; Add-Content -Path $Log -Value $l -Encoding UTF8 }

$ReserveMiB      = 2048    # workers/vram.py 와 같은 여유분
$GemmaMinMiB     = 14000   # 가중치 ~10.3GB + 활성/KV 최소
$GemmaMaxUtil    = 0.45    # 장당 상한(Ollama 공존 전제)
$RouterUtil      = 0.09    # ≈4.3GiB
$BusyUtilPct     = 30      # 이 이상이면 '고부하'로 본다
$MinDriverMajor  = 580     # v0.30.0 기본 이미지(CUDA 13.0)
$MinDriverCu129  = 575     # cu129 이미지

function Invoke-Compose([string[]]$a) {
  $base = @('compose', '-f', $Compose, '--env-file', $EnvFile)
  if ($Router) { $base += @('--profile', 'router') }
  & docker @($base + $a)
}

function Get-Gpus {
  $rows = & $Smi --query-gpu=index,driver_version,memory.used,memory.total,utilization.gpu,power.draw,power.limit --format=csv,noheader,nounits
  foreach ($r in $rows) {
    $c = $r.Split(',') | ForEach-Object { $_.Trim() }
    [pscustomobject]@{ Index = [int]$c[0]; Driver = $c[1]; UsedMiB = [int]$c[2]; TotalMiB = [int]$c[3]; UtilPct = [int]$c[4]; PowerW = $c[5]; LimitW = $c[6] }
  }
}

if (-not (Test-Path $EnvFile)) { Copy-Item (Join-Path $Here '.env.example') $EnvFile; Say '.env 없음 → .env.example 복사' }

if ($Stop) {
  Say 'vLLM 컨테이너 정지(GPU 메모리 반환). Ollama 는 건드리지 않는다.'
  & docker compose -f $Compose --env-file $EnvFile --profile router down
  exit 0
}

if ($Status) {
  & docker compose -f $Compose --env-file $EnvFile --profile router ps
  Get-Gpus | Format-Table -AutoSize
  foreach ($p in 8000, 8001) {
    try {
      $m = Invoke-RestMethod -Uri ('http://127.0.0.1:' + $p + '/v1/models') -TimeoutSec 3
      Say (':' + $p + ' OK  models=' + (($m.data | ForEach-Object { $_.id }) -join ','))
    } catch { Say (':' + $p + ' 응답 없음') }
  }
  exit 0
}

if ($Smoke) {
  # 짧은 요청 3개만(부하 테스트 아님)
  $u = 'http://127.0.0.1:8000/v1'
  $m = Invoke-RestMethod -Uri "$u/models" -TimeoutSec 5
  Say ('models: ' + (($m.data | ForEach-Object { $_.id }) -join ','))
  $body = @{ model = 'gemma-4-12b-it'; max_tokens = 64; temperature = 0
             messages = @(@{ role = 'user'; content = '남원시는 어느 도에 있나? 한 문장으로.' }) } | ConvertTo-Json -Depth 6
  $r = Invoke-RestMethod -Uri "$u/chat/completions" -Method Post -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($body)) -TimeoutSec 120
  Say ('chat: ' + $r.choices[0].message.content + '  usage=' + ($r.usage | ConvertTo-Json -Compress))
  $tool = @{ type = 'function'; function = @{ name = 'parcel_at'; description = '좌표의 필지(지번·지목) 조회'
             parameters = @{ type = 'object'; properties = @{ lon = @{ type = 'number' }; lat = @{ type = 'number' } }; required = @('lon', 'lat') } } }
  $body = @{ model = 'gemma-4-12b-it'; max_tokens = 128; temperature = 0; tools = @($tool); tool_choice = 'auto'
             messages = @(@{ role = 'user'; content = '경도 127.39, 위도 35.41 필지 알려줘' }) } | ConvertTo-Json -Depth 10
  $r = Invoke-RestMethod -Uri "$u/chat/completions" -Method Post -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($body)) -TimeoutSec 120
  Say ('tool_calls: ' + ($r.choices[0].message.tool_calls | ConvertTo-Json -Compress -Depth 6))
  try {
    $body = @{ model = 'hyperclovax-seed-1.5b'; max_tokens = 16; temperature = 0
               messages = @(@{ role = 'user'; content = '의도 분류: "비닐하우스 분석해줘" → query/analyze/report 중 하나만' }) } | ConvertTo-Json -Depth 6
    $r = Invoke-RestMethod -Uri 'http://127.0.0.1:8001/v1/chat/completions' -Method Post -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($body)) -TimeoutSec 60
    Say ('router: ' + $r.choices[0].message.content)
  } catch { Say 'router(:8001) 미기동 — 건너뜀' }
  exit 0
}

# ── 기동 전 점검 ──────────────────────────────────────────────────────
Say "== 점검 (대상 GPU $Gpu, 라우터=$([bool]$Router))"
$gpus  = @(Get-Gpus)
$drv   = [double]$gpus[0].Driver
$major = [int][math]::Floor($drv)
Say ("드라이버 " + $gpus[0].Driver)
$envText = Get-Content $EnvFile -Raw -Encoding UTF8
$usesCu129 = $envText -match '(?m)^VLLM_IMAGE=.*cu129'
$need = if ($usesCu129) { $MinDriverCu129 } else { $MinDriverMajor }
if ($major -lt $need) {
  Say ("중단: 드라이버 $($gpus[0].Driver) < R$need. vLLM v0.30.0 이미지는 CUDA " + $(if ($usesCu129) { '12.9' } else { '13.0' }) + ' 가 필요하다.')
  Say '       GPU 로 기동할 수 없다. CPU 모드로 대체 기동하지 않는다. → DRIVER-UPGRADE.md 참고(사용자 조치).'
  Say '       그동안 에이전트는 Ollama http://localhost:11434/v1 로 폴백한다.'
  exit 2
}

$t = $gpus | Where-Object { $_.Index -eq $Gpu }
$o = $gpus | Where-Object { $_.Index -ne $Gpu }
foreach ($g in $gpus) { Say ("GPU{0}: used {1}/{2} MiB, util {3}%, {4}W / limit {5}W" -f $g.Index, $g.UsedMiB, $g.TotalMiB, $g.UtilPct, $g.PowerW, $g.LimitW) }

# 전력 규칙: 동시 고부하 GPU ≤ 1
if ($o.UtilPct -ge $BusyUtilPct) {
  Say ("중단: 다른 GPU{0} 가 고부하({1}%) — 두 장 동시 고부하 금지(전력). 그 작업이 끝난 뒤 기동하거나 스케줄러가 배정하게 한다." -f $o.Index, $o.UtilPct)
  exit 3
}
if ($t.UtilPct -ge $BusyUtilPct -and -not $Force) {
  Say ("중단: 대상 GPU{0} 사용률 {1}% — 추론 워커가 도는 중일 수 있다. 끝난 뒤 다시(또는 -Force)." -f $t.Index, $t.UtilPct)
  exit 3
}
foreach ($g in $gpus) { if ([double]$g.LimitW -gt 200.5) { Say ("주의: GPU{0} 전력 상한 {1}W — 관리자 PowerShell 에서 nvidia-smi -i {0} -pl 200 권장(DRIVER-UPGRADE.md §4)" -f $g.Index, $g.LimitW) } }

# VRAM 예산
$free   = $t.TotalMiB - $t.UsedMiB
$budget = $free - $ReserveMiB
$rMiB   = if ($Router) { [int]($RouterUtil * $t.TotalMiB) } else { 0 }
$gMiB   = [math]::Min($budget - $rMiB, [int]($GemmaMaxUtil * $t.TotalMiB))
Say ("여유 {0} MiB - 예비 {1} = 예산 {2} MiB → Gemma {3} MiB, 라우터 {4} MiB" -f $free, $ReserveMiB, $budget, $gMiB, $rMiB)
if ($gMiB -lt $GemmaMinMiB) {
  Say ("중단: Gemma 예산 {0} MiB < 최소 {1} MiB. Ollama 상주(OLLAMA_KEEP_ALIVE) 또는 워커 배정을 스케줄러가 조정해야 한다(Ollama 종료는 금지)." -f $gMiB, $GemmaMinMiB)
  exit 4
}
$gUtil = [math]::Round($gMiB / $t.TotalMiB, 3)
$env:VLLM_GPU        = "$Gpu"
$env:GEMMA_GPU_UTIL  = "$gUtil"
$env:ROUTER_GPU_UTIL = "$RouterUtil"
Say ("gpu-memory-utilization: gemma=$gUtil" + $(if ($Router) { ", router=$RouterUtil" } else { '' }))

# 가중치 확인
$models = 'E:\Land-XI 플랫폼\_env\models\hf-cache'
$weights = @('models--google--gemma-4-12B-it-qat-w4a16-ct\snapshots\1d2c2d7f2466070e69d6fb3fd5ce9a7d75f2f6ee\model.safetensors')
if ($Router) { $weights += 'models--naver-hyperclovax--HyperCLOVAX-SEED-Text-Instruct-1.5B\snapshots\0728a47d632019a8da5f53b663db1c175dc04115\model.safetensors' }
foreach ($n in $weights) { if (-not (Test-Path (Join-Path $models $n))) { Say "중단: 가중치 없음 $n → python download_models.py"; exit 5 } }
New-Item -ItemType Directory -Force 'E:\Land-XI 플랫폼\_env\models\vllm-cache' | Out-Null

if ($Check) { Say '점검 통과(-Check: 기동하지 않음).'; exit 0 }

Say '== 기동'
$svc = @('gemma'); if ($Router) { $svc += 'router' }
Invoke-Compose (@('up', '-d') + $svc)
Say '로그: docker logs -f landxi-vllm-gemma   (첫 기동은 컴파일·CUDA graph 로 수 분)'
Say '확인: .\launch-vllm.ps1 -Status  → 준비되면 .\launch-vllm.ps1 -Smoke'
