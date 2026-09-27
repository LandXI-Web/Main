# Land-XI Phase 0 설치 스모크(F1-B §0) — 멱등. 결과 표를 server/.setup-smoke.json 과 화면에 낸다.
# 사용: powershell -File server/setup.ps1 [-SkipPull] [-SkipSeed]
# Ollama llama-server · cleanriver 컨테이너는 건드리지 않는다(docker 는 -p landxi 로만).
param([switch]$SkipPull, [switch]$SkipSeed)
$ErrorActionPreference = "Continue"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $here
$env:PYTHONIOENCODING = "utf-8"
$env:PYTHONPATH = $here
$rows = @()
function Row($item, $ok, $detail) { $script:rows += [pscustomobject]@{ item = $item; ok = $ok; detail = $detail }; Write-Host ("[{0}] {1} — {2}" -f ($(if ($ok) { "OK " } else { "NO " })), $item, $detail) }

# 0) .env
if (-not (Test-Path .env)) { Copy-Item .env.example .env; Row ".env" $true "server/.env 생성(.env.example 복사)" } else { Row ".env" $true "있음(건드리지 않음)" }
$envText = Get-Content .env -Raw -Encoding utf8
$local = Join-Path (Split-Path $here -Parent) ".env.local"
if ((Test-Path $local) -and ($envText -match "(?m)^VWORLD_KEY=\s*$")) {
  $kv = @{}; Get-Content $local | % { if ($_ -match "^(VWORLD_KEY|VWORLD_DOMAIN)=(.*)$") { $kv[$Matches[1]] = $Matches[2] } }
  foreach ($k in $kv.Keys) { $envText = $envText -replace "(?m)^$k=.*$", "$k=$($kv[$k])" }
  [IO.File]::WriteAllText((Join-Path $here ".env"), $envText, (New-Object Text.UTF8Encoding $false))
  Row "VWORLD_KEY" $true "저장소 .env.local 에서 server/.env 로 옮김(값은 표시하지 않음)"
}

# 1) Docker · PostGIS pull · compose up
$dv = (docker version --format "{{.Server.Version}}" 2>$null)
Row "docker" ([bool]$dv) "server $dv"
$img = docker images postgis/postgis:16-3.4 --format "{{.ID}}" 2>$null
if (-not $img -and -not $SkipPull) { docker pull postgis/postgis:16-3.4 | Out-Null; $img = docker images postgis/postgis:16-3.4 --format "{{.ID}}" }
Row "postgis/postgis:16-3.4 pull" ([bool]$img) "image $img"
docker compose -p landxi -f docker-compose.phase0.yml up -d 2>&1 | Out-Null
$ps = docker compose -p landxi -f docker-compose.phase0.yml ps --format "{{.Name}} {{.Status}}" 2>$null
Row "compose -p landxi up (6380/5433)" (($ps -join " ") -match "landxi-redis Up" -and ($ps -join " ") -match "landxi-postgis Up") ($ps -join " | ")
$pong = docker exec landxi-redis redis-cli ping 2>$null
Row "redis-cli -p 6380 ping" ($pong -eq "PONG") "$pong (컨테이너 내부 6379 → 호스트 6380)"
$pg = docker exec landxi-postgis psql -U postgres -d landxi -tAc "select postgis_full_version()" 2>$null
Row "PostGIS" ([bool]$pg) (($pg -split " ")[0..1] -join " ")

# 2) pip (시스템 Python 3.11.4)
$pyv = python -c "import sys;print(sys.version.split()[0])"
Row "python" ($pyv -like "3.11*") $pyv
python -m pip install -q asyncpg "redis[hiredis]" pmtiles argon2-cffi sse-starlette python-multipart pyyaml "psycopg[binary]" mapbox-vector-tile pytest 2>&1 | Out-Null
$mods = python -c "import importlib.util as u,json;ms=['asyncpg','redis','pmtiles','argon2','sse_starlette','multipart','yaml','psycopg','mapbox_vector_tile','fastapi','uvicorn','rasterio','ultralytics','torch','shapely','pyproj','httpx'];print(json.dumps({m:bool(u.find_spec(m)) for m in ms}))" | ConvertFrom-Json
foreach ($p in $mods.PSObject.Properties) { Row "pip $($p.Name)" $p.Value "" }
$tv = python -c "import torch;print(torch.__version__, torch.cuda.is_available(), torch.cuda.device_count())" 2>$null
Row "torch CUDA" ($tv -match "True") $tv
$ul = python -c "import ultralytics;print(ultralytics.__version__)" 2>$null
Row "ultralytics" ([bool]$ul) $ul

# 3) titiler.core (선택) — --no-deps 시도. 실패해도 /tiles/cog 는 rasterio 직접 렌더로 200
$tt = python -c "import importlib.util as u;print(bool(u.find_spec('titiler')))"
if ($tt -ne "True") { python -m pip install -q --no-deps titiler.core 2>&1 | Out-Null; $tt = python -c "import titiler.core as t;print('import ok')" 2>&1 }
Row "titiler.core(선택)" ($tt -match "ok|True") ("$tt" -replace "`r?`n", " ").Substring(0, [Math]::Min(160, ("$tt").Length))

# 4) ogr2ogr PMTiles (conda gcs · 서브프로세스)
$gdal = "C:\Users\User\anaconda3\envs\gcs\Library\bin"
$env:GDAL_DATA = "C:\Users\User\anaconda3\envs\gcs\Library\share\gdal"; $env:PROJ_DATA = "C:\Users\User\anaconda3\envs\gcs\Library\share\proj"
$tmp = Join-Path $env:TEMP "lx_smoke"; New-Item -ItemType Directory -Force $tmp | Out-Null
'{"type":"FeatureCollection","features":[{"type":"Feature","properties":{"id":"a"},"geometry":{"type":"Polygon","coordinates":[[[127.39,35.41],[127.40,35.41],[127.40,35.42],[127.39,35.41]]]}}]}' | Set-Content "$tmp\s.geojson" -Encoding ascii
Remove-Item "$tmp\s.pmtiles" -ErrorAction SilentlyContinue
& "$gdal\ogr2ogr.exe" -f PMTiles "$tmp\s.pmtiles" "$tmp\s.geojson" -dsco MINZOOM=10 -dsco MAXZOOM=14 2>&1 | Out-Null
$gv = (& "$gdal\gdalinfo.exe" --version) 2>$null
Row "ogr2ogr -f PMTiles (gcs)" (Test-Path "$tmp\s.pmtiles") "$gv · $((Get-Item "$tmp\s.pmtiles" -ErrorAction SilentlyContinue).Length) bytes"

# 5) nvidia-smi · WDDM · 예산
$smi = "C:\Windows\System32\nvidia-smi.exe"
$q = & $smi --query-gpu=index,name,memory.used,memory.total,driver_model.current,driver_version --format=csv,noheader,nounits
$usedSet = @($q | % { ($_ -split ",\s*")[2] } | Select -Unique)
if ($q.Count -gt 1 -and $usedSet.Count -eq 1) { Row "WDDM 연결 어댑터" $true "두 장 memory.used 가 같은 값($($usedSet[0]) MiB) — 장별 값 아님(PDH phys_0/phys_1 로 갈림). 워커 예산은 외부 하한 24,585 MiB 로 계산 → 22,507 MiB" }
foreach ($l in $q) { $v = $l -split ",\s*"; if ([double]$v[2] -gt [double]$v[3]) { Row "GPU$($v[0]) memory.used" $false "nvidia-smi 무효값 $($v[2]) — 드라이버 $($v[5]) 재부팅 전? 워커는 cudaMemGetInfo 로 대신 잰다"; continue }; $b = [int]$v[3] - [int]$v[2] - 2048; Row "GPU$($v[0]) $($v[1])" ($v[4] -eq "WDDM") "$($v[4]) · driver $($v[5]) · used $($v[2]) / $($v[3]) MiB · 예산 $b MiB(total−used−2,048)$(if ($usedSet.Count -eq 1 -and $q.Count -gt 1) { ' ← 연결 어댑터 합계값이라 참고용 · 실제 워커 예산은 위 줄' })" }
$ll = (tasklist /FI "IMAGENAME eq llama-server.exe" | Select-String "llama-server").Count
Row "Ollama llama-server(종료 금지)" ($ll -ge 1) "$ll 개 살아 있음 — 워커는 남는 메모리만 쓴다"

# 6) junction 안내(off 모드 /landxi/data)
$j = Join-Path (Split-Path $here -Parent) "landxi\data"
Row "junction landxi/data" (Test-Path $j) $(if (Test-Path $j) { "있음" } else { "없음 — 필요 시: New-Item -ItemType Junction `"landxi/data`" -Target `"E:/Land-XI 플랫폼/02. 데이터`" (통합 단계가 .gitignore 1줄)" })

# 7) 마이그레이션 · 시드 · countCheck
if (-not $SkipSeed) { python seed/seed_from_cards_js.py 2>&1 | Select -Last 3 | % { Write-Host "  $_" } }
$mg = python migrate.py 2>&1 | Out-String
Row "migrations/*.sql 번호순(0001·0002·0003·0004 …)" ($LASTEXITCODE -eq 0) (($mg -split "`n" | Select-Object -Last 2) -join " ")
$cc = python seed/count_check.py 2>$null | Out-String
Row "countCheck" ($LASTEXITCODE -eq 0) ("exit $LASTEXITCODE")

$rows | ConvertTo-Json -Depth 3 | Set-Content (Join-Path $here ".setup-smoke.json") -Encoding utf8
Write-Host ""
$rows | Format-Table -AutoSize | Out-String -Width 220 | Write-Host
