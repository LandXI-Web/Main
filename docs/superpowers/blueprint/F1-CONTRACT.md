# F1-CONTRACT — Land-XI 1차 플래그십 API·데이터 계약 (D0 고정 · 2026-09-24 · Fable 5.1)

- 이 문서는 **정본**이다. 네 에픽(F1-A 프론트 · F1-B 백엔드 · F1-C 관제 · F1-D 글로벌)은 이 문서만 보고 병렬로 구현한다. 설계서(`LANDXI-HYPER-BLUEPRINT.md` v1.1)와 어긋나면 이 문서가 이긴다.
- 변경 절차: 계약을 바꾸고 싶은 에픽은 코드를 바꾸지 말고 자기 결과 문서 `f1/F1-<id>-result.md`의 '계약 변경 요청' 절에 `절 번호 · 현재 · 제안 · 이유`를 적는다. Fable이 판정해 이 문서를 고치고 판을 올린다(v1.0 → v1.1). **동결 파일**(`landxi/shared/api-v1.js` · `landxi/assets/css/v2/tokens-v2.css`)도 같다.
- 표기: 예시 JSON의 숫자는 **이 PC에서 잰 값**(manifest.json · pipeline-run.md · nvidia-smi 2026-09-24)만 쓴다. 지어낸 값은 `"[예시]"` 주석을 달았다.
- 두 모드: **`LX_API=on`**(게이트웨이 :8700 살아 있음) / **`LX_API=off`**(정적만 · `api-v1.js`가 픽스처·리플레이로 같은 이벤트 형식을 낸다 · 마스트에 `시연 · 서버 연결 없음` 또는 `시연 · 저장 결과 재생`). 모든 프론트 화면은 두 모드에서 콘솔 오류 0으로 뜬다. e2e는 두 프로젝트로 돈다.

---

## 1. 포트 · 오리진 · 경로

| 무엇 | 값 | 소유 | 비고 |
|---|---|---|---|
| 정적 프론트 | `http://localhost:4173` (`tools/serve.mjs` · **끄지 말 것 · 수정 금지**) | 기존 | `/landxi/xi/` `/landxi/global/` `/landxi/shared/` `/landxi/assets/` 모두 여기서 |
| API 게이트웨이 | `http://localhost:8700` · 접두 **`/api/v1`** · 타일 `/tiles` · SSE `/api/v1/events` | F1-B | FastAPI · CORS allow-origin `http://localhost:4173` `http://localhost:8702` · `Authorization: Bearer` |
| 목(mock) 게이트웨이 | `http://localhost:8701` | F1-B(D0+1 산출) | 계약 예시 JSON 그대로 응답 + `server/fixtures/replay/*.ndjson` 리플레이. 프론트는 `localStorage.lx_api_base`로 8700/8701 전환 |
| LX/OPS 관제 정적 | `http://localhost:8702` (`landxi/ops/serve-ops.mjs`) | F1-C | 별도 origin. 허용 경로 접두: `/landxi/ops/` `/landxi/assets/` `/landxi/shared/` `/landxi/xi/engine/` `/landxi/xi/fx/` `/landxi/proto/vendor/` `/landxi/proto/fonts-system.css` `/landxi/data/`(junction). 그 밖은 404 |
| Redis | `localhost:6380` (`redis:7-alpine` · compose 프로젝트 `landxi`) | F1-B | 6379는 cleanriver 컨테이너 내부용 — 충돌 없음. `docker compose -p landxi` 로만 조작 |
| PostGIS | `localhost:5433` (`postgis/postgis:16-3.4` · 1회 pull 필요) | F1-B | DB `landxi` · 스키마 `migrations/0001_init.sql` |
| AXIS-Label | `:8001` [미검증 · 2차] | – | 1차 라우트 없음 |
| Prometheus | – | – | Phase 1 |
| **데이터 루트** | `LX_DATA_ROOT = E:/Land-XI 플랫폼/02. 데이터` | F1-B(쓰기) · F1-D(`global/` 하위만 쓰기) · 나머지 읽기 | 이미 `tiles/ vector/ results/ models/ manifest.json`이 있다(P1·P3·P4·P5·P6 완료). 새 산출은 `results/{tenant}/` `cog/` `cache/` `global/` `parcels/` 아래 |
| **off 모드 데이터 별칭** | `/landxi/data/…` = 저장소 `landxi/data` **junction** → `LX_DATA_ROOT` | 통합 단계가 `.gitignore`에 `landxi/data` 1줄. 각 에픽은 로컬에서 `New-Item -ItemType Junction "landxi/data" -Target "E:/Land-XI 플랫폼/02. 데이터"` 1회 | `serve.mjs`가 Range 206을 지원하므로 `.pmtiles`가 그대로 열린다(pipeline-run §1 실측) |
| 환경 | 게이트웨이·워커 = **시스템 Python 3.11.4**(fastapi 0.136 · uvicorn 0.49 · rasterio 1.4.4 · ultralytics 8.3.234 · torch 2.5.1+cu118 · shapely 2.1 · pyproj 3.7 · httpx **있음 [실측]**; asyncpg · redis · pmtiles · argon2-cffi · sse-starlette **없음 → D0 설치**) · GDAL CLI = conda `gcs` `Library/bin`(`ogr2ogr -f PMTiles`) | F1-B | conda `gcs`에 ultralytics 없음(env.md). 두 env를 섞지 않는다: 추론은 시스템 Py, 벡터 PMTiles는 `gcs` ogr2ogr 서브프로세스 |
| GPU | A6000 ×2 · 드라이버 522.06 WDDM · **각 23,396 MiB를 Ollama `llama-server` 4개가 점유 [실측 09-24]** · 여유 ≈ 25,700 MiB | – | **종료 금지(사용자 결정).** 워커 VRAM 예산 = `free − 2,048 MiB` |

---

## 2. 숫자 봉투(Envelope) — 모든 수치 필드의 유일한 형식

```json
{ "value": 129420, "unit": "polygons", "basis": "inferred", "as_of": "2026-09-24",
  "source": "results/namwon-landcover-2023.pmtiles", "note": "검수 전 · C01 2023 25cm × aerial25/best" }
```

| 필드 | 형 | 규칙 |
|---|---|---|
| `value` | number \| null | null = 없음(결손). 프론트는 점선 무채 + `note` |
| `unit` | string | `polygons` `필지` `동` `ha` `km2` `m2` `%` `s` `gpu_s` `MiB` `GB` `chips_per_s` `ms` `count` `ratio` `ndvi` `°C` `W` |
| `basis` | enum | `measured` 실측 · `estimate` 추정(계수 계산) · `demo` 시연(결과를 남기지 않음) · `history` 이력(발주자 구술 사업 연혁 · cards.js DEPLOYS) · `inferred` AI 추론·검수 전 · `recorded` 기록 재생(끝난 학습 로그 · 캐시) |
| `as_of` | ISO date/datetime | 값을 잰 시각. 실시간 텔레메트리는 datetime |
| `source` | string | 파일 경로 · API · 스크립트 · `nvidia-smi` |
| `note` | string? | 한 줄 조건(예: `외부 점유 23,396 MiB 동시`) |

- 서버 직렬화기는 봉투 없는 숫자를 내보내지 않는다(개발 모드 500). 프론트 `prov(el, env)`는 봉투 없으면 throw. `id` · 좌표 · 줌 · 카운트의 분자/분모 등 **구조 필드**(`shards_total` 등)는 봉투가 아니라 정수다 — 화면에 "숫자로서" 보여 줄 때 서버가 `*_env`를 함께 준다(아래 예시 참조).
- 프론트 꼬리표 매핑: `measured→실측` `estimate→추정` `demo→시연` `history→이력` `inferred→AI 추론 · 검수 전` `recorded→기록`.

---

## 3. 인증 · 세션 · 역할

- **Phase 0 = Bearer 토큰**(cross-origin 4173/8702 → 8700 이라 쿠키를 쓰지 않는다). Phase 1 nginx 동일 origin에서 HttpOnly 쿠키로 바꿔도 프론트 `api-v1.js` 밖은 안 바뀐다.
- SSE(`EventSource`)는 헤더를 못 넣으므로 **`?access_token=`** 쿼리를 SSE 경로에서만 허용한다.

```http
POST /api/v1/auth/login
{ "realm": "lx", "login": "lx-staff", "password": "…" }
{ "realm": "tenant", "tenant_id": "namwon", "login": "namwon-manager", "password": "…" }
→ 200
{ "token": "lxs_…", "realm": "lx", "role": "staff", "tenant_id": null, "user": {"id":"u_lx_staff","name":"LX 직원"}, "expires_at": "2026-09-25T09:00:00+09:00" }
{ "token": "lxt_…", "realm": "tenant", "role": "manager", "tenant_id": "namwon", "user": {...}, "expires_at": "…" }
POST /api/v1/auth/logout → 204
GET  /api/v1/me → { "realm":"lx", "role":"admin", "tenant_id":null, "caps":["jobs.submit","results.edit","deploys.write","ops.read","ops.write"] }
GET  /api/v1/health → { "ok": true, "version":"0.1.0", "redis": true, "pg": true, "workers": {"gpu":2,"cpu":1}, "at":"…" }
```

| realm · role | caps | 관문 |
|---|---|---|
| `lx` · `admin` | 전부 + `ops.*` `deploys.*` `quota.write` | `/ops/*` `/deploys` 쓰기 · `/events/ops` 는 **Origin `http://localhost:8702`**(또는 Origin 없음 = 서버 간)만 |
| `lx` · `staff` | `jobs.submit` `results.edit` `results.read` `catalog.lx` `registry.read` | `demo:false` 허용 |
| `lx` · `sales` | `jobs.submit(demo only)` `results.read` `catalog.lx` | `POST /jobs`에 `demo:true` 강제(아니면 403 `demo_required`) · 계량은 `tenant_id='lx-demo'` |
| `tenant` · `manager` | `results.read(own)` `feedback.write` `usage.read(own)` `catalog.tenant` | `/t/{tenant}/*` 는 `tenant_id` 일치일 때만 · 원본(`tier='raw'` · COG) 라우트 0 |
| `tenant` · `viewer` | `results.read(own)` `catalog.tenant` | – |
| (없음) | `catalog.public` `results.read(public)` | **영상 층 = `xdworld-satellite`만**(R6) · 결과는 `export_policy='public'`만 |

개발 계정(`server/.env.example` · 실운영 전 교체): `lx-admin` `lx-staff` `lx-sales` / `namwon-manager` `gj-manager` `kgz-agri-manager` `kgz-land-manager` · 비밀번호는 `.env`의 `DEV_PASSWORD` 한 값. **e2e는 `POST /auth/login`으로 토큰을 받아 `localStorage.lx_api_session`에 심는다**(아래 §12 픽스처).

프론트 세션 키: `localStorage.lx_api_session` = `{"token","realm","role","tenant_id","expires_at"}`. 기존 `lx_logged_in` · `lx_role` · `lx_tenant_session`(E0-1 계약)은 **건드리지 않는다** — 새 화면(xi · ops · global)은 `lx_api_session`만 본다. off 모드에서는 `api-v1.js`가 기존 키를 읽어 `realm/role`을 흉내 낸다(토큰 없음).

---

## 4. 엔드포인트

공통: JSON UTF-8 · 시간은 ISO 8601 `+09:00` · 좌표 GeoJSON EPSG:4326 · 오류 형식 §10 · 목록은 `{ "items": [...], "total": n, "as_of": "…" }`.

### 4.1 카탈로그(사다리 · 보유 영상 · 결과 레이어)

```http
GET /api/v1/catalog/layers?stage=domestic|global&build=lx|tenant|public&bbox=127.1,35.2,127.7,35.6&z=12.5&locale=ko|en
→ 200 { "items": [ LayerItem, … ], "ladder": { "domestic": ["gibs-viirs-truecolor","gibs-hls-s30","xdworld-satellite","ap25-namwon-2023","namwon-city-2504","namwon-city-2510","namwon-aoi-2504","namwon-aoi-2506","namwon-aoi-2508","namwon-aoi-2510"], "global": ["gibs-viirs-truecolor","eox-s2cloudless-2025","gibs-hls-s30","pc-s2-mosaic","pc-worldcover-2021","maxar-mm-meiktila"] }, "as_of": "…" }
```

**LayerItem**
```json
{
  "id": "ap25-namwon-2023",
  "name": { "ko": "2023 25cm 항공 · 남원", "en": "2023 aerial 25 cm · Namwon" },
  "kind": "raster",                       // raster | vector | terrain
  "role": "imagery",                      // imagery | reference | result | terrain
  "source": "pmtiles",                    // pmtiles | xyz | external | cog
  "set": "imagery/namwon_ap25_2023",      // pmtiles/xyz 세트 id (§8)
  "path": "tiles/pmtiles/namwon_ap25_2023.pmtiles",   // LX_DATA_ROOT 상대 · off 모드 URL 조립용
  "url": "http://localhost:8700/tiles/pmtiles/imagery/namwon_ap25_2023.pmtiles",  // on 모드 해석값(서명 필요 시 sig 포함)
  "tiles": null,                          // external 일 때 XYZ 템플릿
  "scheme": "xyz",                        // xyz | tms ; EOX·GIBS 는 {z}/{y}/{x} 순서 → 서버가 템플릿에 이미 반영
  "layer": null,                          // vector 일 때 MVT source-layer
  "promote_id": null,                     // vector 일 때 feature-state 키
  "minzoom": 10, "maxzoom": 18,
  "bounds": [127.166748, 35.290469, 127.683105, 35.576917],
  "gsd_m": 0.25, "epoch": "2023", "crs": "EPSG:3857",
  "tier": "tile",                         // raw | tile | result
  "license": "확인 중", "attribution": "2023 비도시 정사영상(전북) · 권리 확인 중",
  "export_policy": "tenant",              // never | tenant | public
  "security_review": "pending",           // pending | cleared | n/a   (public 은 cleared 일 때만)
  "rights_holder": "확인 중",
  "ladder": { "stage": "domestic", "from": 10, "to": 18, "order": 30 },
  "count": { "value": 88404, "unit": "count", "basis": "measured", "as_of": "2026-09-24", "source": "manifest.json#namwon_ap25_2023.pmtiles" },
  "signed": false
}
```
- `build=public` 결과에는 `role='imagery'` 항목이 **`xdworld-satellite`·`gibs-*`·`eox-*`·`pc-*`(외부 위성)만** 남는다. 자체 영상(`source ∈ pmtiles|xyz|cog` · `role='imagery'`)은 전부 제외. 결과는 `export_policy='public'`만.
- `build=tenant`: 그 기관 `deploys`에 묶인 결과 + 참조 + 자체 영상 중 `export_policy ∈ tenant|public`. `tier='raw'`·`cog`는 절대 없음.
- 외부 사다리 항목의 `tiles` 예(서버가 그대로 준다 · 2026-09-24 검증 URL):
  - `xdworld-satellite`: `https://xdworld.vworld.kr/2d/Satellite/service/{z}/{x}/{y}.jpeg` · minzoom 5 · maxzoom 19
  - `gibs-hls-s30`: `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/HLS_S30_Nadir_BRDF_Adjusted_Reflectance/default/{date}/GoogleMapsCompatible_Level12/{z}/{y}/{x}.png` · `params.date` 기본 = 어제(UTC) · maxzoom 12
  - `gibs-viirs-truecolor`: `…/VIIRS_NOAA20_CorrectedReflectance_TrueColor/default/{date}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`
  - `eox-s2cloudless-2025`(비상업 · `build=export`에서 제외) / `eox-s2cloudless-2017`(CC BY): `https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-{year}_3857/default/g/{z}/{y}/{x}.jpg`
  - `pc-worldcover-2021`: `https://planetarycomputer.microsoft.com/api/data/v1/item/tiles/WebMercatorQuad/{z}/{x}/{y}@1x?collection=esa-worldcover&item={item}&assets=map&colormap_name=esa-worldcover` · `params.items` = `["ESA_WorldCover_10m_2021_v200_N42E072","ESA_WorldCover_10m_2021_v200_N42E075"]`
  - `pc-s2-mosaic`: `…/mosaic/tiles/{searchid}/WebMercatorQuad/{z}/{x}/{y}@1x.png?collection=sentinel-2-l2a&assets=visual&asset_bidx=visual|1,2,3&nodata=0` · `params.months` = `{ "2025-03": "<searchid>", … }`(F1-D G2 사전 수집 · `02. 데이터/global/pc-mosaics.json`)
  - `overture-buildings`: `pmtiles://https://overturemaps-extras-us-west-2.s3.us-west-2.amazonaws.com/tiles/2026-09-23.0/buildings.pmtiles` · layer `building`

```http
GET /api/v1/catalog/imagery/{id} → LayerItem + { "path_internal": "(lx admin 만)", "footprint": GeoJSON }
```

### 4.2 타일 · 파일

```http
GET  /tiles/pmtiles/{set}.pmtiles                 Range 206 · Accept-Ranges · ETag · 공용(imagery/reference/results/lx/*) 무서명, results/{tenant≠lx}/* 는 서명 필수
GET  /tiles/xyz/{set}/{z}/{x}/{y}.webp            LX_DATA_ROOT/tiles/{folder}/… 직접 · 없는 타일 = 204(콘솔 오류 0)
GET  /tiles/cog/{imagery_id}/{z}/{x}/{y}.webp     lx 전용 · TiTiler(titiler.core) 붙으면 200, 아니면 501 {"error":{"code":"cog_unavailable"}}
GET  /tiles/sign?set=results/namwon/dp-nw-farm-25@2.1 → { "url": "http://localhost:8700/tiles/pmtiles/results/namwon/dp-nw-farm-25@2.1.pmtiles?exp=1758770000&sig=…", "expires_at": "…" }   (유효 12h · 만료 30분 전 프론트가 재호출)
GET  /files/models/{path}                          lx 전용 · LX_DATA_ROOT/models/… (모델 카드 WebP·results.csv)
```
`set` → 파일 매핑은 `server/config/sets.yaml`(F1-B가 manifest.json에서 생성):
```yaml
imagery/namwon_ap25_2023:   tiles/pmtiles/namwon_ap25_2023.pmtiles
imagery/namwon_city_2504:   tiles/pmtiles/namwon_city_2504.pmtiles
imagery/namwon_2504:        tiles/pmtiles/namwon_2504.pmtiles      # 2506 · 2508 · 2510 동일
imagery/namwon_change_2504_2510: tiles/pmtiles/namwon_change_2504_2510.pmtiles
imagery/kuksan_a68: …   imagery/jeju_2020: …   terrain/terrain-namwon: tiles/pmtiles/terrain-namwon.pmtiles
imagery/namwon_lc_gt_2020:  tiles/pmtiles/namwon_lc_gt_2020.pmtiles
reference/sido: vector/pmtiles/sido.pmtiles         reference/sigungu · reference/namwon-emd · reference/korea-outline 동일 패턴
reference/parcels-namwon:   parcels/namwon-parcels.pmtiles           # P8 산출(F1-B) · layer parcels · promote_id pnu · 2021-12 기준
vector/namwon-lc-gt-2020:   vector/namwon-lc-gt-2020.pmtiles          # layer lc_gt
results/lx/namwon-landcover-2023:  results/namwon-landcover-2023.pmtiles   # layer landcover · promote_id id · 129,420
results/lx/namwon-farmland-2025:   vector/pmtiles/namwon-farmland-2025.pmtiles   # layer namwon_farmland_2025 · 2,098
results/lx/namwon-greenhouse-2025: vector/pmtiles/namwon-greenhouse-2025.pmtiles # 1,674
results/lx/namwon-change:          vector/pmtiles/namwon-change.pmtiles           # 456
results/lx/namwon-greenhouse-2023-vh: results/lx/namwon-greenhouse-2023-vh.pmtiles   # J2b 산출(없으면 404 → 프론트 결손 표시)
results/{tenant}/{job_id}:  results/{tenant}/{job_id}.pmtiles         # 워커 스냅샷
results/namwon/dp-nw-farm-25@2.1 → results/lx/namwon-farmland-2025 (별칭)      results/namwon/dp-nw-farm-25@2.0 → results/lx/namwon-landcover-2023 (별칭 · cls 필터는 스타일에서)
```

### 4.3 프록시(키는 서버에만)

```http
GET /api/v1/proxy/vworld/{wmts|wms|data|search|address}?…   → 키·domain 주입 · 디스크 캐시 cache/vworld/ · 일일 계량(vworld_calls_day)
   2026-09-24 현재: Data API 권한 미반영 → 503 { "error": { "code": "vworld_key_pending", "message": "V-World 키 권한 반영 대기" } }  (프론트는 결손 칩 · 재시도 안 함)
POST /api/v1/proxy/pc/mosaic/register     본문 그대로 PC 로 · 응답 searchid 를 cache/pc/ 에 30일 캐시
POST /api/v1/proxy/pc/statistics?collection=&item=   PC item/statistics 대리 · 캐시
GET  /api/v1/proxy/pc/stac/search?bbox=&datetime=&collections=sentinel-2-l2a&query=eo:cloud_cover<15   대리 · 캐시 6h
(PC·GIBS·EOX·Overture **타일**은 CORS `*` 이므로 브라우저가 직접 부른다. 프록시는 등록·통계·검색만.)
```

### 4.4 작업(jobs) — 프레임 → 견적 → 제출

```http
POST /api/v1/jobs/quote
{ "kind": "infer", "model_id": "car_v2_obb", "imagery_id": "axis-iksan-hwangdeung",
  "aoi": { "type": "Polygon", "coordinates": [[[126.9440,35.9950],[126.9490,35.9950],[126.9490,35.9990],[126.9440,35.9990],[126.9440,35.9950]]] },
  "options": { "chip": 1024, "overlap": 0.2, "conf": 0.25 }, "demo": false }
→ 200
{ "area_km2": { "value": 0.199, "unit": "km2", "basis": "measured", "as_of": "…", "source": "shapely area(EPSG:5186)" },
  "shards": 1120, "shards_env": { "value": 1120, "unit": "count", "basis": "measured", "as_of": "…", "source": "scheduler.tile(1024, 0.2, gsd 0.0136)" },
  "gpu_s": { "value": null, "unit": "gpu_s", "basis": "estimate", "as_of": "…", "source": "models.perf(car_v2_obb) 없음 — bench 전", "note": "bench 후 채워짐" },
  "eta_s": { "value": null, "unit": "s", "basis": "estimate", "as_of": "…", "source": "同上" },
  "quota": { "tenant_id": "lx", "dim": "gpu_s_month", "remaining": { "value": null, "unit": "gpu_s", "basis": "measured", "as_of": "…", "source": "quotas(lx hard=null)", "note": "무제한" }, "policy": "queue_low" },
  "allowed": true, "reasons": [], "pool": "a6000" }
```
`allowed:false` 사유 코드: `quota_exceeded` · `demo_required` · `imagery_forbidden`(기관이 raw/cog 요청) · `model_input_mismatch`(모델 `input`과 영상 `kind` 불일치) · `aoi_outside_footprint` · `aoi_too_large`(> `options.max_km2` 기본 5).

```http
POST /api/v1/jobs   (quote 와 같은 본문 + "priority": 0..3, "deploy_id"?, "card_id"?, "label"?)
→ 202 { "job": Job, "events_url": "/api/v1/events/jobs/job_01J9K…" }
GET  /api/v1/jobs?state=&tenant_id=&limit=50 → { "items":[Job] }
GET  /api/v1/jobs/{id} → Job
POST /api/v1/jobs/{id}/cancel | requeue | priority {"priority":1}  → Job     (제출자 · admin)
```

**Job**
```json
{ "id": "job_01J9K3P7Q8R2S4T6V8W0X2Y4Z6", "tenant_id": "lx", "submitted_by": "u_lx_staff",
  "kind": "infer", "state": "running",          // queued | running | done | failed | cancelled
  "priority": 0, "demo": false, "pool": "a6000",
  "model_id": "car_v2_obb", "imagery_id": "axis-iksan-hwangdeung", "deploy_id": null, "card_id": null,
  "aoi": { "type": "Polygon", "coordinates": [[…]] }, "options": { "chip": 1024, "overlap": 0.2, "conf": 0.25 },
  "shards_total": 1120, "shards_done": 96, "shards_failed": 0,
  "counts": { "vehicle": 1284 },                                   // [예시]
  "counts_env": { "value": 1284, "unit": "count", "basis": "inferred", "as_of": "…", "source": "job_01J9K…", "note": "[예시] 진행 중 누적" },
  "chips_per_s": { "value": null, "unit": "chips_per_s", "basis": "measured", "as_of": "…", "source": "gpu_worker 계량", "note": "첫 shard 뒤 채워짐" },
  "gpu_s": { "value": 0, "unit": "gpu_s", "basis": "measured", "as_of": "…", "source": "usage_events" },
  "workers": ["a6000-0", "a6000-1"],
  "result_set": "results/lx/job_01J9K3P7Q8R2S4T6V8W0X2Y4Z6", "snapshot_ready": false,
  "created_at": "…", "started_at": "…", "finished_at": null, "error": null }
```
`kind`: `infer`(GPU · AOI 1건) · `reinfer`(GPU · 영상 footprint 전체 · P1 우선순위 · 예: J2b) · `index`(CPU · 지수·통계 계산 · 예: G-J1). 우선순위 `0` 시연/대화형 · `1` 기관 배치 · `2` 재학습 · `3` backfill.

### 4.5 결과 · 피드백

```http
GET  /api/v1/results/{set}/features?bbox=&cls=&limit=2000&offset=0&min_conf=   → GeoJSON FeatureCollection + "lx": { "count": Envelope, "total": n }
GET  /api/v1/results/{job_id}/shards/{shard_id}.geojson                        → 그 shard 의 폴리곤(shard.done polys_url)
GET  /api/v1/results/{set}/stats?by=emd|cls                                    → { "items":[{ "key":"운봉읍", "cd":"52190250", "n": Envelope, "area_ha": Envelope, "conf_mean": Envelope }], "total": {…} }   (P4 는 results/namwon-landcover-2023-emd-stats.json 그대로)
PATCH /api/v1/results/{job_id}/features/{fid}   { "geometry"?: …, "cls"?: "…", "edit_state": "edited|deleted" }   lx staff 만 → Feature
POST /api/v1/feedback  { "job_id"|"set", "fid", "pnu"?, "lnglat":[lng,lat], "kind": "fp|fn|other", "note" }  tenant → 201 { "id":"fb_…", "state":"open" }
GET  /api/v1/parcels?lng=&lat=   → { "pnu":"5219025021100010000", "jibun":"…", "jimok":"전", "area_m2": Envelope, "price_krw_m2": Envelope(as_of 2021-12), "owner_kind":"…", "source":"reference/parcels-namwon", "as_of":"2021-12" }   (P8 전 404 parcels_unavailable)
```

Feature 속성 정본(결과 벡터): `id` · `cls` · `cls_en` · `cid` · `conf` · `area_m2` · `emd` · `emd_cd` · `pnu?` · `edit_state`(`raw|edited|deleted`) · `job_id` · `shard_id?` · `chip_edge?`.

### 4.6 레지스트리 · 계보

```http
GET /api/v1/registry/models → { "items":[ Model ] }
Model = { "id":"namwon/Vinyl_house/train2", "family":"yolo11x-seg", "task":"seg", "classes":["비닐하우스_단동","비닐하우스_다동"], "weights_uri":"E:\\namwon\\Vinyl_house\\runs\\segment\\train2\\weights\\best.pt", "input":["ortho"], "gsd_trained_m":0.02, "tile_size":1024, "infer_shape":[1024,1024], "image":null,
          "metrics": { "mask_mAP50": { "value": 0.93808, "unit":"ratio", "basis":"recorded", "as_of":"2026-01", "source":"models/namwon/Vinyl_house/train2/results.csv", "note":"best epoch 89" } },
          "perf": null, "status":"registered", "card_url":"/files/models/namwon/Vinyl_house/train2/card.json" }
        { "id":"car_v2_obb", "family":"yolo11-obb", "task":"obb", "classes":["vehicle"], "weights_uri":"E:\\drone_runs\\car_v2_obb\\run\\weights\\best.pt", "metrics":{ "mAP50": { "value":0.992, "unit":"ratio","basis":"recorded","as_of":"2026-06","source":"ASSET-LEDGER B05" } }, "perf": null }
        { "id":"aerial25/best", "family":"yolo11-seg", "task":"seg", "classes":["건물","주차장","경작지","비닐하우스"], "metrics":{ "mask_mAP50": { "value":0.88592,"unit":"ratio","basis":"recorded","as_of":"2026-05-16","source":"ckpt train_metrics","note":"results.csv 없음 — 체크포인트 내장 지표" } } }
GET /api/v1/registry/models/{id}
GET /api/v1/registry/cards → cards.js CARDS 이관 { "items":[{ "id":"card-farm", "name":"영농관리 행정서비스", "scope":"local", "status":"운영", "versions":[ "card-farm@2.0", "card-farm@2.1" ], "modules": {"core":[…7], "ext":[…]} }] }
GET /api/v1/registry/lineage/{deploy_id} → { "chain": [ {"kind":"dataset","id":"E:/aerial_dataset","label":"항공 토지피복 15.3만"}, {"kind":"run","id":"aerial_v2_finetune44"}, {"kind":"model","id":"aerial25/best"}, {"kind":"card_version","id":"card-farm@2.0"}, {"kind":"deploy","id":"dp-nw-farm-25"}, {"kind":"tenant","id":"namwon"}, {"kind":"job","id":"P4-2026-09-24","label":"남원 전역 재추론 22,737칩"} ] }
```
`perf`(bench 뒤): `{ "chips_per_s": Envelope(measured · note 'A6000 · batch 16 · fp16 · 외부 점유 23,396 MiB 동시'), "vram_mib": Envelope, "bench_at": "…" }`. 지금 유일한 실측: `aerial25/best` 1024칩 **≈26 chips/s/GPU**(P4 · 읽기 포함).

### 4.7 배포(deploys) — 단계 배포 · 롤백 · 이식

```http
GET  /api/v1/deploys?tenant_id=&card_id=&stage=   → { "items":[Deploy] }      (lx 전체 · 기관은 자기 것)
GET  /api/v1/deploys/{id}                          → Deploy
POST /api/v1/deploys                               (lx admin) — **이식** = 배포본 하나 더
{ "from_deploy_id": "dp-nw-change", "tenant_id": "kgz-land", "region_profile": "kgz-sokuluk",
  "aoi": { "type":"Polygon", "coordinates":[[…]] }, "name": "소쿨룩 시가지 변화 · 2026", "gpu_pool": "cpu" }
→ 201 Deploy (stage "draft" · card_version_id 는 from 의 것 · snapshot 없음 · results 0)
POST /api/v1/deploys/{id}/rollout  { "stage": "shadow|canary|ga" }   → Deploy   (ga 는 approvals 에 approve 1건 이상 필요 → 없으면 409 approval_required)
POST /api/v1/deploys/{id}/rollback {}                                  → Deploy   (stage "rolled_back" · card_version_id ← prev · snapshot_current ↔ snapshot_prev)
POST /api/v1/deploys/{id}/approve  { "decision": "approve|reject", "reason": "…" } → { "approval": {...}, "deploy": Deploy }
POST /api/v1/deploys/{id}/pin      { "card_version_id": "card-farm@2.1" | null }
POST /api/v1/deploys/{id}/modules  { "ext": { "mod-farm-cycle": false } }       (core 7 은 잠금 → 400 module_locked)
POST /api/v1/deploys/{id}/model    { "model_id": "namwon/Vinyl_house/train2" }  (card_version 새로 만들지 않고 override 기록)
POST /api/v1/deploys/{id}/gpu      { "pool": "a6000|cpu" }
```

**Deploy**
```json
{ "id": "dp-nw-farm-25", "name": "남원 영농관리 2025", "tenant_id": "namwon", "card_id": "card-farm",
  "card_version_id": "card-farm@2.1", "version": "v2.1", "prev_card_version_id": "card-farm@2.0",
  "region_profile": "namwon", "region_name": { "ko": "전북특별자치도 남원시", "en": "Namwon-si, Jeonbuk" },
  "aoi": { "type": "MultiPolygon", "coordinates": [[…]] },          // A11 namwon-emd 합집합
  "stage": "ga",                                                     // draft | shadow | canary | ga | rolled_back
  "pinned": false, "gpu_pool": "a6000", "from_deploy_id": null,
  "modules": { "core": ["mod-auth","mod-map","mod-result","mod-stats","mod-report","mod-feedback","mod-usage"], "ext": { "mod-farm-cycle": true, "mod-farm-parcel": true } },
  "model_override": null,
  "snapshot_current": "results/namwon/dp-nw-farm-25@2.1", "snapshot_prev": "results/namwon/dp-nw-farm-25@2.0",
  "year": 2025, "status_history": "운영",
  "scale": { "value": 2098, "unit": "필지", "basis": "measured", "as_of": "2026-06-08", "source": "results/namwon-farmland-2025.geojson", "note": "cards.js '비닐하우스 9,664 동' 은 출처 없음 → 미표시" },
  "basis": "history",
  "approvals": [ { "id":"ap_…", "decision":"approve", "by":"u_lx_admin", "at":"…", "reason":"시드" } ],
  "created_at": "…", "updated_at": "…" }
```
상태기계: `draft → shadow → canary → ga` (순방향 rollout · 건너뛰기 허용 안 함) · `canary|ga → rolled_back`(rollback · 직전 버전으로 · 스냅샷 교체) · `rolled_back → shadow|canary|ga`(다시 rollout). 모든 쓰기는 `audit_log`. XI맵 `?svc={deploy_id}`는 `snapshot_current`를 연다.

### 4.8 테넌트 · 쿼터 · 사용량

```http
GET /api/v1/tenants                       (lx) → { "items":[Tenant] }
GET /api/v1/t/{tenant}/usage              (본인 · lx) → Usage
PUT /api/v1/tenants/{id}/quota            (lx admin) { "dims": { "gpu_s_month": { "soft": 30000, "hard": 36000, "policy": "queue_low" } }, "reason": "…" } → Tenant  (+ approvals 행 · audit_log)
```
```json
Tenant = { "id": "namwon", "name": { "ko": "전북특별자치도 남원시", "en": "Namwon-si" }, "kind": "user", "scope": "local", "crs": "EPSG:5186", "locale": "ko", "profile_id": "namwon", "home": "portal", "status": "active" }
Usage  = { "tenant_id": "namwon", "month": "2026-09",
  "dims": {
    "storage_gb":       { "used": Envelope(measured · du), "soft": 400, "hard": 500, "policy": "notify", "note": "[추정 기반 초기값]" },
    "gpu_s_month":      { "used": Envelope(measured · usage_events), "soft": 30000, "hard": 36000, "policy": "queue_low" },
    "area_km2_month":   { "used": Envelope, "soft": 1500, "hard": 2000, "policy": "notify" },
    "concurrent_jobs":  { "used": Envelope(now), "soft": 2, "hard": 2, "policy": "queue_low" },
    "egress_gb_month":  { "used": Envelope, "soft": 40, "hard": 50, "policy": "notify" },
    "vworld_calls_day": { "used": Envelope, "soft": 4000, "hard": 5000, "policy": "reject" } },
  "isolation": { "prefix": "tenants/namwon/", "rls": true, "signed_tiles": true, "raw_routes": 0 },
  "forecast": { "gpu_s_month": { "exceed_month": null, "basis": "estimate", "source": "quota.estimator 선형" } } }
```
쿼터 시드(`server/config/quotas.yaml` · 전부 `[추정 기반 초기값]` · Q-E ② 승인 전): `lx` hard null(무제한) · `namwon` 위 값 · `gwangju-jeonnam` storage 300/gpu 21,600/area 1,000/conc 1/egress 30/vworld 3,000 · `kgz-agri` storage 200/gpu 18,000/area 5,000/conc 1/egress 30/vworld 0 · `kgz-land` 동일 · `lx-demo` gpu 7,200/conc 1(영업 시연 계량 전용 · 화면에는 '시연'). 초과 정책: `queue_low` = P3로 강등 · `reject` = 400 `quota_exceeded` · `notify` = 진행 + `ops_alerts`.

### 4.9 관제(ops) — `:8702` origin · lx admin

```http
GET /api/v1/ops/nodes    → { "items":[ { "id":"node-tr3995wx", "hostname":"…", "role":"control+gpu", "pool":"a6000", "cpu":"Threadripper PRO 3995WX 64C", "ram_gb": Envelope(512), "gpus":[0,1], "joined_at":"…", "last_seen":"…", "state":"up" },
                                        { "id":"node-a100-1", "state":"pending", "note":"A100 80GB×4 · 등록 대기 · 가입 토큰 발급 시 채워짐" }, { "id":"node-a100-2", "state":"pending" } ] }
GET /api/v1/ops/gpus     → GpuSample (최신 · Redis ops:gpu:{node}:{idx})
GET /api/v1/ops/queues   → { "pools": { "a6000": { "queued": 1, "running": 1, "workers": 2, "p95_wait_s": Envelope }, "cpu": {…} }, "lanes": [ { "worker":"a6000-0", "blocks":[ { "job_id":"…", "from":"…", "to":"…", "state":"running", "tenant_id":"lx" } ] } ], "as_of":"…" }
GET /api/v1/ops/storage  → { "volumes":[ { "mount":"E:", "free_gb": Envelope(2085 · measured · statfs), "total_gb": Envelope }, { "mount":"D:", "free_gb": Envelope(363) }, { "mount":"C:", "free_gb": Envelope(124) } ],
                             "by_tier": { "raw": Envelope(null · note '원본은 LX_DATA_ROOT 밖 · 목록만'), "tile": Envelope(du tiles/), "result": Envelope(du results/ vector/) }, "by_tenant": { "lx": Envelope, "namwon": Envelope } }
GET /api/v1/ops/alerts   → { "items":[ { "id":"al_…", "rule":"gpu_temp_gt_85_5m", "level":"caution|fault", "node":"…", "gpu":0, "value": Envelope, "opened_at":"…", "closed_at":null } ], "last_check":"…" }   (규칙 config/alerts.yaml · 임계 [목표])
GET /api/v1/ops/models   → { "items":[ { "model_id":"car_v2_obb", "resident_on":["a6000-0"], "vram_mib": Envelope, "perf": {...}|null, "pinned": false } ] }
GET /api/v1/ops/tenants  → { "items":[ Usage ] }
GET /api/v1/ops/bench    → { "items":[ { "model_id":"aerial25/best", "gpu":"A6000", "batch":16, "fp16":true, "chips_per_s": Envelope(26 · measured · note 'P4 2026-09-24 · 읽기 포함 · 외부 점유 23,396 MiB'), "at":"2026-09-24" } ] }
POST /api/v1/ops/nodes/join-token → { "token":"nj_…", "expires_at":"…", "compose_hint":"docker compose -f node.yml up  (Phase 2)" }
POST /api/v1/ops/models/{id}/load   { "worker":"a6000-1" } → 202     POST …/unload → 202
```

**GpuSample**(§5.2 SSE와 같은 형)
```json
{ "node": "node-tr3995wx", "at": "2026-09-24T14:02:11.480+09:00",
  "gpus": [
    { "index": 0, "name": "NVIDIA RTX A6000",
      "util_pct":     { "value": 0,     "unit": "%",   "basis": "measured", "as_of": "…", "source": "nvidia-smi utilization.gpu" },
      "mem_used_mib": { "value": 23396, "unit": "MiB", "basis": "measured", "as_of": "…", "source": "nvidia-smi memory.used" },
      "mem_total_mib":{ "value": 49140, "unit": "MiB", "basis": "measured", "as_of": "…", "source": "nvidia-smi memory.total" },
      "temp_c":       { "value": 63,    "unit": "°C",  "basis": "measured", "as_of": "…", "source": "nvidia-smi temperature.gpu" },
      "power_w":      { "value": 15.81, "unit": "W",   "basis": "measured", "as_of": "…", "source": "nvidia-smi power.draw" },
      "external": [ { "pid": 0, "name": "llama-server.exe", "mem_mib": null, "note": "WDDM: 프로세스별 VRAM N/A" } ],
      "external_used_mib": { "value": 23396, "unit": "MiB", "basis": "measured", "as_of": "…", "source": "memory.used − 워커 자기 보고", "note": "워커 미기동 시 = memory.used" },
      "worker": "a6000-0", "job_id": null, "driver": "522.06", "mode": "WDDM" },
    { "index": 1, "…": "…" } ] }
```

---

## 5. SSE 이벤트

### 5.1 `GET /api/v1/events/jobs/{job_id}?access_token=`
- `Content-Type: text/event-stream` · `Cache-Control: no-store` · `X-Accel-Buffering: no` · 10s마다 `: hb` 주석 · `id:` = Redis 스트림 entry id → `Last-Event-ID`로 재개(`XRANGE events:{job} (id +`). 완료 후에도 24h 동안 재생 가능(스트림 MAXLEN 10,000).
- 이벤트(`event:` 이름 · `data:` JSON 한 줄):

| event | data | 언제 |
|---|---|---|
| `job.queued` | `{ "job_id", "position": 0, "pool": "a6000", "at" }` | 제출 직후 |
| `job.started` | `{ "job_id", "shards_total": 1120, "workers": ["a6000-0","a6000-1"], "at" }` | 첫 shard 배정 |
| `shard.started` | `{ "job_id", "shard_id": "r003c007", "bbox": [126.9440,35.9950,126.9447,35.9956], "worker": "a6000-0", "at" }` | |
| `shard.done` | `{ "job_id", "shard_id", "bbox", "n": 7, "classes": { "vehicle": 7 }, "polys_url": "/api/v1/results/job_…/shards/r003c007.geojson", "ms": 412, "worker", "at" }` | **프론트는 이 칸만 걷고 그 칸의 폴리곤을 락온으로 도착시킨다** |
| `shard.failed` | `{ "job_id", "shard_id", "error": "cuda_oom", "retry": 1, "at" }` | |
| `job.progress` | `{ "job_id", "shards_done": 96, "shards_total": 1120, "counts": {"vehicle": 1284}, "chips_per_s": Envelope(measured · 창 10s), "elapsed_s": 41.2, "gpu": [ { "index":0, "util_pct": 71, "mem_used_mib": 34400 } ], "at" }` | 값 변화 시 · ≤ 1회/s. **HUD는 여기서만 읽는다**(`탐지 n · shard a/b · GPU0 u% · v칩/s`) |
| `job.done` | `{ "job_id", "counts", "counts_env": Envelope(inferred), "gpu_s": Envelope(measured), "elapsed_s", "result_set", "at" }` | 전 shard 완료 + 전역 NMS |
| `snapshot.ready` | `{ "job_id", "set": "results/lx/job_…", "url": "http://localhost:8700/tiles/pmtiles/results/lx/job_….pmtiles", "features": 1284, "at" }` | cpu_worker PMTiles 스냅샷 |
| `job.failed` · `job.cancelled` | `{ "job_id", "error"?, "at" }` | |
| `index.month` (kind index 전용 · `shard.done`과 함께 발행) | `{ "job_id", "shard_id": "m2025-06", "month": "2025-06", "ndvi_mean": Envelope(measured · 'PC S2 L2A B04/B08 · WorldCover 40 마스크'), "n_scenes": 14, "cloud_max": 15, "at" }` | G-J1 |

리플레이(off 모드) 파일 형식 `*.ndjson`: 한 줄 = `{ "t": 0, "event": "job.queued", "data": {…} }`(`t` = 시작 후 ms). `api-v1.js replay()`가 `t`대로 발행하고 `data`에 `"basis":"demo"` 꼬리표를 덧댄다. 정본 리플레이는 F1-B가 **실제 J1 실행을 녹음**해 `server/fixtures/replay/j1-hwangdeung.ndjson`로 낸다(그 전에는 각 프론트 에픽의 `data/replay/*.ndjson`은 A02 등 저장 결과를 bbox 격자로 나눈 합성 리플레이 · `시연 · 저장 결과 재생` 표기).

### 5.2 `GET /api/v1/events/ops?access_token=` (lx admin · Origin 8702)

| event | data | 주기 |
|---|---|---|
| `gpu.sample` | GpuSample(§4.9) | 2s(F1-C 폴러가 Redis `ops:gpu` 스트림에 XADD → 게이트웨이 tail) |
| `queue.sample` | `/ops/queues` 응답 | 2s(값 변화 시) |
| `usage.delta` | `{ "tenant_id", "dim": "gpu_s_month", "amount": 12.4, "job_id", "at" }` | 계량 시 |
| `deploy.changed` | `{ "deploy_id", "action": "rollout|rollback|port|approve|pin", "stage", "card_version_id", "by", "at" }` | 쓰기 시 |
| `alert` | alerts item | 열림·닫힘 |
| `job.state` | `{ "job_id", "tenant_id", "state", "aoi_centroid": [lng,lat], "pool", "at" }` | 상태 변화(운영 현황 지도 점) |

### 5.3 Redis 키(F1-B ↔ F1-C 접점)

| 키 | 형 | 쓰는 쪽 | 읽는 쪽 |
|---|---|---|---|
| `jobs:{pool}` | stream | 게이트웨이 | scheduler(`XREADGROUP g:sched`) |
| `shards:{pool}` | stream `{job_id, shard_id, bbox, window|params}` | scheduler | gpu/cpu_worker(`g:workers` · `XAUTOCLAIM` 30s) |
| `events:{job_id}` | stream MAXLEN 10000 | 워커·scheduler | 게이트웨이 SSE |
| `job:{job_id}` | hash(Job 미러) | 워커 | 게이트웨이(HUD 즉답) |
| `node:{node_id}` | hash + TTL 30s(하트비트 10s) | 워커·폴러 | 게이트웨이 `/ops/nodes` |
| `ops:gpu:{node}:{idx}` | hash(GpuSample.gpus[i] 평탄화) | **F1-C `server/ops/gpu_poller.py`** 2s | 게이트웨이 `/ops/gpus` |
| `ops:gpu` | stream MAXLEN 3600 (`{node, at, json}`) | F1-C 폴러 | 게이트웨이 `/events/ops` |
| `ops:storage` | hash(60s) | F1-C `storage_poller.py` | `/ops/storage` |
| `ops:alerts` | stream | 게이트웨이 규칙 평가(config/alerts.yaml) | `/ops/alerts` · SSE |
| `worker:{id}:vram` | hash `{budget_mib, used_mib, model_id}` | 워커 | 폴러(`external_used_mib` 계산) |

---

## 6. 저장소 스키마(정본 `server/migrations/0001_init.sql` · F1-B)

```sql
tenants(id text pk, name jsonb, kind text check(kind in('maker','user')), scope text check(scope in('local','global')), crs text, locale text, profile_id text, status text default 'active')
lx_users(id text pk, login text unique, pw_hash text, role text check(role in('admin','staff','sales')), status text)
tenant_users(id text pk, tenant_id text fk, login text, pw_hash text, role text check(role in('manager','viewer')), status text, unique(tenant_id,login))
sessions(token_hash text pk, realm text, user_id text, tenant_id text, role text, expires_at timestamptz)
quotas(tenant_id fk, dim text, soft numeric, hard numeric, policy text check(policy in('queue_low','reject','notify')), note text, pk(tenant_id,dim))
usage_events(id bigserial, tenant_id text, dim text, amount numeric, job_id text, basis text, at timestamptz) PARTITION BY RANGE(at)   -- 월 파티션
imagery(id text pk, name jsonb, tier text, gsd_m numeric, epoch text, crs text, footprint geometry(MultiPolygon,4326), path_internal text, pmtiles_set text, xyz_folder text,
        license text, attribution text, export_policy text check(export_policy in('never','tenant','public')), security_review text default 'pending', rights_holder text, asset_ref text, ladder jsonb)
models(id text pk, family text, version text, weights_uri text, sha256 text, task text check(task in('seg','obb','det','index')), classes jsonb, input jsonb, gsd_trained_m numeric,
       metrics jsonb, perf jsonb, status text, image text, tile_size int, infer_shape int[])
cards(id text pk, name jsonb, scope text, domain text, kind text, status_history text, portable bool)
card_versions(id text pk, card_id fk, version text, model_ids text[], modules jsonb, changelog text, approved_by text, approved_at timestamptz)
deploys(id text pk, name text, tenant_id fk, card_id fk, card_version_id fk, prev_card_version_id text, region_profile text, region_name jsonb, aoi geometry(MultiPolygon,4326),
        stage text check(stage in('draft','shadow','canary','ga','rolled_back')), pinned bool default false, gpu_pool text, from_deploy_id text, modules jsonb, model_override text,
        snapshot_current text, snapshot_prev text, year int, status_history text, scale jsonb, basis text default 'history', created_at timestamptz, updated_at timestamptz)
approvals(id text pk, subject_type text, subject_id text, requested_by text, decided_by text, decision text, reason text, at timestamptz)
jobs(id text pk, tenant_id fk, submitted_by text, kind text, state text, priority int, demo bool, pool text, model_id fk, imagery_id fk, deploy_id text, card_id text,
     aoi geometry(Polygon,4326), options jsonb, shards_total int, shards_done int, shards_failed int, counts jsonb, gpu_s numeric, workers text[], result_set text, snapshot_ready bool,
     created_at, started_at, finished_at timestamptz, error text)
detections(id bigserial, tenant_id text, job_id text, shard_id text, cls text, cls_en text, cid int, conf real, area_m2 numeric, geom geometry(MultiPolygon,4326), pnu text, emd text, emd_cd text,
           edited_by text, edit_state text default 'raw', chip_edge bool) PARTITION BY LIST(tenant_id)
index_results(id bigserial, tenant_id, job_id, shard_id, key text, metrics jsonb, geom geometry, at)          -- kind index 산출(월별 NDVI 등)
feedback(id text pk, tenant_id, job_id, set_id, fid text, pnu text, lnglat geometry(Point,4326), kind text, note text, state text, at)
nodes(id text pk, hostname text, role text, gpus jsonb, pool text, joined_at, last_seen timestamptz, state text)
ops_alerts(id text pk, rule text, level text, node text, gpu int, value jsonb, opened_at, closed_at)
audit_log(id bigserial, actor text, realm text, action text, subject text, before jsonb, after jsonb, at timestamptz)
-- RLS: detections · jobs · feedback · usage_events · deploys(읽기) 에  USING (tenant_id = current_setting('app.tenant_id', true) OR current_setting('app.realm', true) = 'lx')
-- 요청마다 SET LOCAL app.realm / app.tenant_id
```

**시드 ID(고정 · 네 에픽이 같은 문자열을 쓴다)**
- tenants: `lx` · `namwon` · `gwangju-jeonnam` · `kgz-agri`(scope global · locale en · region 으슥아타) · `kgz-land`(global · en · 소쿨룩/비슈케크) · `lx-demo`(영업 시연 계량)
- cards: cards.js CARDS 9 그대로(`card-farm` `card-living` `card-road` `card-crowd` `card-change` `card-marine` `card-forest` `card-global-farm` `card-global-disaster`)
- card_versions: `card-farm@2.0`(model `aerial25/best` · 2023 25cm) · `card-farm@2.1`(model `namwon/cultivate_uncultivate/train` · 2025 드론) · `card-living@1.3` · `card-road@2.1` · `card-change@1.0`(model `unsupervised-change` · A04) · `card-marine@1.2` · `card-global-farm@0.1`(model `index/ndvi_pc` · draft) · `card-global-disaster@0.1`(EMS 판독 열람 · draft)
- deploys(cards.js DEPLOYS 7 이관 · `basis:'history'` · stage 매핑 `운영→ga` `구축→canary` `예정→draft`): `dp-nw-living-23` · **`dp-nw-farm-25`**(ga · 2.1 · prev 2.0 · snapshot 별칭 §4.2) · `dp-nw-road-26` · `dp-nw-crowd-27` · `dp-nw-change` · `dp-gj-marine-25` · `dp-gj-marine-27` + 글로벌 **`dp-kgz-agri-farm-26`**(card-global-farm@0.1 · kgz-agri · region `kgz-ysykata` · stage canary · aoi = geoBoundaries Ysyk-Ata 북부 평원 [74.70,42.75,75.20,43.00]) · **`dp-mm-meiktila-25`**(card-global-disaster@0.1 · tenant `lx` · region `mm-meiktila` · stage shadow · 시연 한정). `dp-kgz-land-change-26`은 **시드에 없다** — F1-C 이식 장면이 `POST /deploys`로 만든다(off 모드 픽스처에는 있음).
- imagery: `ap25-namwon-2023` · `namwon-city-2504` `namwon-city-2510` · `namwon-aoi-2504` `-2506` `-2508` `-2510` · `namwon-change-2504-2510` · `kuksan-a68` `-a71` · `jeju-2020` `-2022` `-landcover` · `terrain-namwon` · `namwon-lc-gt-2020` · `axis-iksan-hwangdeung`(B04 1.36cm · tier raw + cog · P15 · export never) · 외부 사다리 항목(§4.1)
- region_profiles: `namwon` · `gwangju-jeonnam` · `iksan-hwangdeung` · `kgz-ysykata` · `kgz-sokuluk` · `kgz-bishkek` · `mm-meiktila`
- countCheck(서버 unit · 1건이라도 다르면 실패): farmland 2,098 · greenhouse 1,674 · change 456 · landcover-2023 129,420(건물 49,800 · 경작지 76,215 · 주차장 2,677 · 비닐하우스 728) · lc-gt 4,889 · sido 17 · sigungu 249 · emd 39 · P3 타일 88,404.

---

## 7. 워커 · 어댑터 인터페이스(Python · F1-B 프레임 · F1-D 글로벌 어댑터)

```python
# server/adapters/base.py  (F1-B)
@dataclass
class Shard:      id: str; job_id: str; bbox4326: tuple[float,float,float,float]; window: dict|None; params: dict|None
@dataclass
class Detection:  geom4326: shapely.Geometry; cls: str; cls_en: str; cid: int; conf: float; attrs: dict
@dataclass
class ShardResult: features: list[Detection]; metrics: dict; n: int; ms: int

ADAPTER = {  # 모듈 상단 상수 — 워커가 server/adapters/**/adapter_*.py 를 스캔해 등록
  "id": "yolo_obb", "kinds": ["infer","reinfer"], "device": "gpu",     # gpu | cpu
  "input": "raster-window",                                            # raster-window | params
  "output": "polygons",                                                # polygons | metrics
  "models": ["car_v2_obb"] }

class Adapter(Protocol):
    def load(self, model: dict, device: str, vram_budget_mib: int) -> None: ...   # budget 안에서 batch 결정 · 초과 시 RuntimeError('vram_budget')
    def run_shard(self, shard: Shard, read: Callable[[Shard], tuple[np.ndarray, Affine, CRS]], opts: dict) -> ShardResult: ...
    def unload(self) -> None: ...
```
- **VRAM 규칙**: 워커 시작 시 `nvidia-smi --query-gpu=memory.used,memory.total`로 `budget = total − used − 2048`. `torch.cuda.set_per_process_memory_fraction(budget/total)`. 외부 프로세스(Ollama)는 절대 건드리지 않는다. 자기 사용량을 `worker:{id}:vram`에 2s마다 쓴다.
- shard id: 래스터 `r{row:03d}c{col:03d}` · 인덱스 `m{YYYY-MM}` · 멱등(`ON CONFLICT (job_id, shard_id) DO NOTHING`).
- 칩 규칙(P4 실측 채택): `chip 1024 · overlap 128px(≈ 12.5%)`(계약 기본) — `overlap 0.2`는 옵션. 칩 중심이 겹침 폭 절반 안에 있는 것만 채택 · 칩 내 NMS → 전역 NMS(cpu_worker) → 동일 클래스 겹침 50% 초과 시 낮은 conf 제거 · 4m² 미만 제거 · simplify 0.3m.
- 계량: shard마다 `usage_events(dim='gpu_s', amount=wall_s × gpus_used, basis='measured')` · `demo:true`면 `tenant_id='lx-demo'`.
- 글로벌 어댑터(F1-D · `server/adapters/global/adapter_ndvi_pc.py`): `ADAPTER = {"id":"index/ndvi_pc","kinds":["index"],"device":"cpu","input":"params","output":"metrics"}` · shard.params = `{"month":"2025-06","aoi":…,"cloud_max":15}` · PC STAC 검색(`T43TEH`만) → SAS 토큰(`/api/sas/v1/token/sentinel-2-l2a`) → `rasterio` `/vsicurl/` B04·B08 창 읽기 → WorldCover COG(S3 · `map==40`) 마스크 → 평균 NDVI → `ShardResult(metrics={"ndvi_mean":…, "n_scenes":…}, n=n_scenes)`. PC 장애 시 `02. 데이터/global/ysykata-ndvi-2025.json`으로 `basis:'recorded'`.

---

## 8. 타일 · PMTiles URL 규약(프론트 해석기 `api-v1.js tileUrl()`)

| 상황 | URL |
|---|---|
| on · 공용 세트 | `http://localhost:8700/tiles/pmtiles/{set}.pmtiles` → MapLibre 소스 `url: "pmtiles://" + 그 URL` |
| on · 기관 결과 세트 | `GET /tiles/sign?set=` 응답 `url`(12h) · 만료 30분 전 재서명 후 `map.getSource(id).setUrl()` |
| on · XYZ 폴백 | `http://localhost:8700/tiles/xyz/{folder}/{z}/{x}/{y}.webp` |
| off | `/landxi/data/{LayerItem.path}`(junction) → `pmtiles:///landxi/data/tiles/pmtiles/namwon_ap25_2023.pmtiles` · XYZ는 `/landxi/data/tiles/namwon_ap25_2023/{z}/{x}/{y}.webp` |
| 외부 | `LayerItem.tiles` 템플릿 그대로(`{date}` `{year}` `{searchid}` `{item}`은 `params`로 치환) |
| 기존 자산(읽기) | `/landxi/assets/tiles/{set}/{z}/{x}/{y}.webp`(A01·A03 XYZ · serve.mjs가 빈 타일 투명 PNG) — 새 화면은 PMTiles를 우선하고 이것은 폴백 |

MVT 레이어명 규칙: 파일명의 `-`→`_`(P1 실측: `namwon_farmland_2025`) · P4 `landcover` · P5 `lc_gt` · P8 `parcels`. `promote_id`: 결과 `id` · 필지 `pnu` · 행정경계 `code`.

pmtiles 라이브러리: `https://cdn.jsdelivr.net/npm/pmtiles@4.5.0/dist/pmtiles.js`(1차 · 벤더링은 2차). MapLibre는 기존 `landxi/proto/vendor/maplibre` **v5.6.0** 읽기 사용.

---

## 9. 배포·이식 규약(카드 아키텍처와의 접점)

- 카드 = 공통 모듈 7 + 전용 모듈 n + 모델 조합(cards.js `CORE_MODULES` · `EXT_MODULES`). **이식 = 같은 `card_version_id`로 배포본 하나 더**(`from_deploy_id` 계보). draft로 시작 · 결과 0 · 첫 job이 돌아야 스냅샷이 생긴다 — 화면은 이것을 숨기지 않는다(`결과 0 · 첫 분석 대기`).
- 롤백 = `card_version_id ← prev` + `snapshot_current ↔ snapshot_prev`. 스냅샷은 불변 PMTiles이므로 즉시. XI맵 `?svc=`는 다음 로드에서 바뀐 스냅샷을 연다. F1-C 배포 지도 점은 앰버 380 → 이전 버전 색.
- `ga` 전 `approve` 1건(Phase 0). 2인 승인은 Q-E ③ 결정 뒤 `APPROVALS_REQUIRED=2`.

---

## 10. 오류 형식

```json
{ "error": { "code": "quota_exceeded", "message": "gpu_s_month 한도 36,000 초과 예상", "detail": { "dim": "gpu_s_month", "remaining": 120.5, "requested": 800 } }, "request_id": "req_01J9…" }
```
코드: `unauthorized` 401 · `forbidden` 403 · `demo_required` 403 · `not_found` 404 · `parcels_unavailable` 404 · `vworld_key_pending` 503 · `cog_unavailable` 501 · `quota_exceeded` 400 · `aoi_outside_footprint` 400 · `aoi_too_large` 400 · `model_input_mismatch` 400 · `module_locked` 400 · `approval_required` 409 · `invalid_stage_transition` 409 · `envelope_missing` 500(개발 모드) · `worker_unavailable` 503(워커 0 → 프론트는 `시연 · 저장 결과 재생`으로 전환).

---

## 11. 소유 경계(파일 · 데이터 · 포트) — 겹침 0

| 소유 | 경로 |
|---|---|
| **Fable(동결)** | `design/system-v2.md` · `landxi/assets/css/v2/tokens-v2.css` · `landxi/shared/api-v1.js` · `docs/superpowers/blueprint/F1-CONTRACT.md` · `blueprint/f1/F1-*.md`(브리프) |
| **F1-A** | `landxi/xi/**`(`index.html` · `engine/` · `fx/` · `css/` · `data/` · `vendor/`) · `tests/e2e/f1a-*.spec.mjs` · `shots/f1/A/**` · `blueprint/f1/F1-A-result.md` |
| **F1-B** | `server/**` **단** `server/ops/**` · `server/adapters/global/**` · `server/pipelines/global/**` 제외 · `LX_DATA_ROOT/{results,cog,cache,parcels,manifest.json}` · `tests/e2e/f1b-*.spec.mjs` · `shots/f1/B/**` · `blueprint/f1/F1-B-result.md` |
| **F1-C** | `landxi/ops/**`(`serve-ops.mjs` 포함) · `server/ops/**`(폴러) · `landxi/assets/css/v2/ops-grid.css` · `tests/e2e/f1c-*.spec.mjs` · `shots/f1/C/**` · `blueprint/f1/F1-C-result.md` |
| **F1-D** | `landxi/global/**` · `server/adapters/global/**` · `server/pipelines/global/**` · `LX_DATA_ROOT/global/**` · `landxi/assets/css/v2/globe-stage.css` · `tests/e2e/f1d-*.spec.mjs` · `shots/f1/D/**` · `blueprint/f1/F1-D-result.md` |
| **읽기·import만(모두)** | `landxi/proto/**`(특히 `map-gl.js` `map-data.js` `spikes/ximap-signature.js` `vendor/`) · `landxi/assets/data/*.js` · `landxi/assets/tiles/**` · `tools/serve.mjs` · `tests/e2e/_roles.mjs` |
| **통합 단계** | `.gitignore`(`landxi/data` · `server/.env`) · `landxi/assets/data/storage-keys.js`에 `lx_api_session` 1줄 · 커밋 |

크로스 의존은 **데이터로만**(API·Redis 키·파일 경로) — 이 문서가 그 형식이다. 상대 에픽 파일을 고치고 싶으면 결과 문서 '요청' 절.

---

## 12. e2e 픽스처 · 두 모드

```js
// 각 spec 파일 안에 복사(_roles.mjs import 금지 — Wave 0 규약 유지)
const API = process.env.LX_API === 'on' ? 'http://localhost:8700' : null;
async function bootApi(page, url, { realm = 'lx', role = 'staff', tenant = null } = {}) {
  let session = null;
  if (API) {
    const r = await fetch(API + '/api/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(realm === 'lx' ? { realm, login: `lx-${role}`, password: process.env.DEV_PASSWORD } : { realm, tenant_id: tenant, login: `${tenant}-manager`, password: process.env.DEV_PASSWORD }) });
    session = await r.json();
  }
  await page.addInitScript(([s, api, realm, role, tenant]) => {
    if (sessionStorage.getItem('lx_e2e_boot')) return; sessionStorage.setItem('lx_e2e_boot', '1');
    if (api) localStorage.setItem('lx_api_base', api); else localStorage.setItem('lx_api_mode', 'off');
    if (s) localStorage.setItem('lx_api_session', JSON.stringify(s));
    // off 모드 흉내(기존 E0-1 키) — 새 화면은 lx_api_session 이 없으면 이 키를 읽어 realm/role 을 정한다
    if (realm === 'lx') { localStorage.setItem('lx_logged_in', '1'); localStorage.setItem('lx_role', role); localStorage.removeItem('lx_tenant_session'); }
    else { localStorage.removeItem('lx_logged_in'); localStorage.removeItem('lx_role'); localStorage.setItem('lx_tenant_session', JSON.stringify({ tenant, at: '2026-09-24T09:00:00+09:00' })); }
  }, [session, API, realm, role, tenant]);
  await page.goto(url);
  await page.waitForFunction(() => document.documentElement.dataset.lx === 'ready');   // 새 화면 준비 신호(기존 data-shell 과 별개)
}
```
- playwright 프로젝트 둘: `off`(기본 · 기존 573건과 같은 조건) · `on`(`LX_API=on` · 게이트웨이 필요 · F1-B가 `server/tests/e2e-on.ps1`로 띄운다). 각 에픽은 자기 spec만 돈다: `npx playwright test tests/e2e/f1a- --reporter=line`.
- 새 화면 준비 신호: `document.documentElement.dataset.lx = 'ready'`(첫 타일 idle 뒤). 기존 `data-shell`은 proto 셸 것 — 새 화면은 쓰지 않는다.
- 콘솔 오류 0 규칙: 없는 타일은 204/투명 · 서버 없음은 `probe()`가 1,500ms 안에 판정해 off로 전환(fetch 실패 로그 0 — `AbortController`).

---

## 13. 계약 검증

- F1-B: `server/tests/test_contract.py` — 이 문서의 모든 예시 JSON을 `server/fixtures/contract/*.json`로 두고 라우트 응답이 같은 **키 집합·봉투 형**인지 검사(값은 검사하지 않음). `countCheck` unit. SSE 이벤트 이름 집합 = §5.1 표.
- F1-A/C/D: 자기 `data/fixtures/*.json`이 `server/fixtures/contract/*.json`과 키 집합이 같은지 `tests/e2e/f1x-contract.spec.mjs`로 검사(파일은 읽기 import).
- 통합(F1-∑): `LX_API=on`으로 네 에픽 spec 전부 + 기존 573건(off).

---

## 부록 — 이 PC에서 확인한 값(계약 예시의 출처)

| 값 | 출처 |
|---|---|
| A6000 ×2 · 23,396 / 49,140 MiB · 63°C · 15.81 / 32.47 W · 522.06 | `nvidia-smi` 2026-09-24 14:0x KST |
| P3 88,404타일 · 946MB · bounds [127.166748,35.290469,127.683105,35.576917] · z10–18 | manifest.json `namwon_ap25_2023.pmtiles` |
| P4 129,420(건물 49,800 · 경작지 76,215 · 주차장 2,677 · 비닐하우스 728) · 22,737칩 · 14.4분 · 2 GPU · ≈26칩/s/GPU | pipeline-run.md §3 · `results/namwon-landcover-2023-emd-stats.json` |
| 운봉읍 경작지 1,324.8ha · 비닐하우스 운봉읍 232 | 같은 파일 |
| GT 대조 건물 IoU .57 · 경작지 .71(2020 GT vs 2023 추론) | `results/namwon-landcover-2023-gtcheck-35710074.json` |
| 모델 9런 · Vinyl_house/train2 = yolo11x-seg mask mAP50 .93808 · aerial25/best .88592(ckpt) | `models/index.json` |
| A01 bounds [127.3481,35.5276,127.3567,35.5347] · 1.08~1.69cm · 4시점 | imagery.js · manifest |
| A02 2,098 · 1,674 · A04 456 | manifest P1 |
| B04 익산 황등 1.36cm · bbox [126.9419,35.9915,126.9512,36.0048] · 1.5GB | ASSET-LEDGER B04 · `E:\Auto_Label_project\data\images\` 실존 확인 |
| B05 `E:\drone_runs\car_v2_obb\run\weights\best.pt` 118MB | 실존 확인 |
| Docker: redis:7-alpine 있음 · postgis 없음 · cleanriver 80/443 · Docker 29.6.2 | `docker images` · `docker ps` |
| Python 3.11.4: fastapi 0.136.3 · uvicorn 0.49.0 · rasterio 1.4.4 · ultralytics 8.3.234 · torch 2.5.1+cu118 · httpx 0.28.1 · numpy 2.4.6 · asyncpg/redis/pmtiles/argon2/sse-starlette 없음 | `python -c import` |
| 포트 4173 LISTEN(serve.mjs) · 8700/8702/6380/5433 비어 있음 | `netstat` |
| 으슥아타 WorldCover 초지 40.3 · 농경지 33.0 · 나지 12.6 · 수목 4.8 · 시가화 3.1 · 눈 2.7 (%) · S2 2025-03~10 구름<15% 107장면(T43TEH+T43TDH 합) · Meiktila EMS 점 38(23/4/11) | recon `global-map.md` §3 |


---
## ⚠ 전력 규칙 (2026-09-26 필수, 모든 에픽)
GPU 2장 동시 풀로드로 PC가 전력 부족 셧다운됨. **무거운 GPU 작업(추론·재추론·벤치·vLLM)은 한 번에 GPU 한 장만** — `CUDA_VISIBLE_DEVICES=0` 기본, 워커 동시 고부하 GPU 수 ≤ 1, 배치 보수적. 두 장을 동시에 쓰는 벤치·재추론 금지. 스케줄러는 전력 예산(동시 고부하 ≤1)을 1급 제약으로 구현. Ollama 종료 금지.


---
## 사용자 결정 추가 (2026-09-26, 추천안 채택)
- 정사영상 범위 밖 흰 바탕 금지 → **V-World 위성(키 사용, 폴백 xdworld)으로 밑깔개**. 게스트 화면도 V-World 는 허용(자체 고해상 원본만 금지).
- EOX s2cloudless 2018+ 비상업 → 공개·게스트·수출 화면에서는 **자동 스왑**(Sentinel-2 L2A/GIBS 등 허용 라이선스), 글로벌판 영문 서체 **Inter**.
- A6000 TCC 전환 **하지 않음** — WSL2/Docker GPU(vLLM)가 WDDM 필요. 프로세스별 VRAM 은 결손으로 정직 표기.


---
## 판정 기준 추가 — 플랫폼 정체성 (2026-09-26 사용자)
"완성형 플랫폼 · 유일한 플랫폼 · **Hyper Solution 플랫폼 · Hyper Performance 플랫폼**이 Land-XI 다." 모든 Craft 게이트는 세 사용자 관점에 더해 다음 네 축으로도 판정한다:
1. **완성형** — 목업·자리표·가짜 진행·죽은 버튼 0, 끝까지 동작(시작→결과→다음 행동).
2. **유일함** — 국내외 어떤 GeoAI 서비스(Esri·Google Earth AI·Palantir·V-World·국토정보플랫폼)와 나란히 놓아도 Land-XI 만의 장면이 있는가(실추론 도착·필지 실태조사·국내+글로벌 한 지도).
3. **Hyper Solution** — 행정 문제를 끝까지 푸는가(판독→필지·대장 대조→조치·보고).
4. **Hyper Performance** — 성능을 **실측 수치로 화면에 증명**하는가(GPU 칩/s·면적/분·지연 ms, 봉투 basis=measured).
5. **관리-생산-서비스 일원화된 퍼포먼스** (2026-09-26 사용자) — 하나의 작업이 세 층을 한 흐름으로 관통해 보여야 한다: 생산(LX: 데이터→모델→카드 발행) · 서비스(기관: 요청→결과 도착→행정 조치) · 관리(관제: 같은 작업의 GPU·대기열·쿼터·배포 실측). 같은 job/card id 로 세 화면이 서로 이어지고(계보·딥링크), 한 화면의 행동이 다른 화면에 실시간 반영된다.


---
## 포지셔닝 확정 (2026-09-26 사용자)
**"공공기관(LX)이 제공하는 유일한 GeoAI 솔루션 — 정부 부처·지자체의 실태조사 업무를 지원하는 특화 솔루션."**
- 제품의 중심 축 = 실태조사(SURVEY-SPEC). XI맵·생산·관제·에이전트는 모두 실태조사를 끝까지 해결하기 위해 존재한다.
- 부처별 실태조사 카탈로그로 서비스를 편성: 농식품부(농지이용실태조사·농지전용)·국토부(개발행위 사후관리·토지이용·지목불부합)·행안부(공유재산 실태조사)·환경부(하천점용·방치폐기물)·산림청(산림훼손)·해수부(해양쓰레기)·지자체(무허가건축물·개발제한구역).
- "유일함"의 근거: 지적(필지)·측량 공공기관 LX 의 공신력 + 연속지적 PNU 결합 + 실추론 GPU + 대장 대조 규칙 + 현장조사 연계. 민간 GeoAI(Esri·Google)가 못 하는 필지 단위 행정 실태조사.
- 화면 언어: 첫 화면·로그인·글로벌판에서 "실태조사 특화"가 즉시 읽혀야 한다.


---
# v1.1 — 2차(F2) 개정 (2026-09-27 · Fable 5.1 · 1차 판정 must_fix 23건 + 결과 문서 '계약 변경 요청' 반영)

v1.0 본문은 그대로 두고 **이 절이 이긴다**. 근거 = `f1/F1-{A,B,C,D}-result.md` §계약 변경 요청 · 저널 gate/regate must_fix · `SURVEY-SPEC.md §3` · `agent/AGENT-SPEC.md §3.4`. 브리프 `f2/F2-*.md`가 이 절의 번호를 인용한다.

## v1.1-1 봉투 · 단위 · 표기
1. §2 단위 목록에 `krw_m2`(공시지가 · basis `recorded` · as_of V-World 기준년월) · `power_w` · `chips_per_gpu_s` · `chips_per_wall_s` · `tokens` · `ms` 추가. (F1-A 요청 4)
2. 결과 층 개수 봉투는 **`basis:'inferred'` + `note:'검수 전 · …'`로 통일**. 변화 지수(비지도)는 `note:'변화 지수(비지도) · 검수 전'`. `namwon-change-2504-2510`은 `role:'result'` · `ladder:null`. (F1-A 요청 1·2 · 시민 화면 봉투 불일치 must_fix)
3. 자체 촬영 층(A01 4시점) `attribution/license 'LX 자체 촬영'` · `rights_holder 'LX'` · `gsd_m` 실측 2504 0.0108 / 2506 0.0169 / 2508 0.0154 / 2510 0.0168. job `counts` 클래스 키가 영문이면 카탈로그 `models[].classes[]`에 `{key, ko, en}` 라벨을 싣는다. (F1-A 요청 8)
4. 게스트는 `/deploys`를 부르지 않는다(프론트 규칙) — 서버 401 유지. `snapshot.ready.url`은 클라이언트가 `pmtiles://`로 연다. (F1-A 요청 3·5)

## v1.1-2 작업(jobs) · SSE — Hyper Performance 실측
5. **`chips_per_s`(진행 중)**: 계량 창 ≥ 1 s **이고** 완료 shard ≥ 8일 때만 값, 그 전엔 `value:null · note:'창 짧음'`. 창 하한 0.5 s 인공값(n/0.5) 금지. (F1-A must_fix · gpu_worker progress())
6. **`job.done`에 두 줄 실측 추가**: `chips_per_gpu_s = shards_total ÷ gpu_s`(usage_events · measured) · `chips_per_wall_s = shards_total ÷ elapsed_s` · `elapsed_s` · `gpu_s`. HUD 최종 줄은 `GPU 초당 n.n칩 · 벽시계 n.n칩/s · 이 작업 x.xx GPU·s · y.y s`.
7. **`job.progress.gpu[]`**: `util_pct`는 **최근 5표본(≈2.5 s) 이동평균**(nvidia-smi 0.5 s 표본 · WDDM 순간값 0↔100 금지) · `power_w`(power.draw · measured) · `shared:true`(카드 전체 이용률임을 표기) · `gpu_s_so_far`(usage_events 누적 · 이 작업 몫). 프론트 표기 `GPU0 이용률(공유) n% · w W`. (F1-B must_fix 2 · F1-A 요청 12)
8. **마지막 shard 뒤 `job.progress`는 반드시 1회**(`shards_done == shards_total`) — `progress_lock` 우회. (F1-B must_fix 3)
9. **모든 kind(`infer` · `reinfer` · `index` · `join` · `survey`)가 `job.progress{shards_done, shards_total, elapsed_s, counts}`를 shard마다(≤ 1회/s 합치기 허용) 낸다.** cpu 작업도 예외 없음. (F1-D 요청 5)
10. **`index.month`는 어댑터 metrics의 `hist[]`(bins 20) · `p10 p50 p90` · `valid_px` · `ms`를 그대로 싣는다.** 라이브가 리플레이보다 가난하면 안 된다. (F1-D must_fix 2)
11. `quote.eta_s`(kind index · survey): `index_results`/`survey_runs` 최근 N건 shard ms 중앙값 × shards로 `estimate` 봉투. (F1-D 요청 3·6)
12. `quote.area_km2`: AOI 중심이 한국 밖(EPSG:5186 유효 범위 밖)이면 **중심 UTM zone** 또는 측지 면적(`source:'geodesic'`). (F1-D 요청 7)
13. `kind:'index'`는 `imagery_id` 생략 가능 · `options.source`에 원천. (F1-D 요청 1)
14. **shard 고아 방지**: scheduler 감시 — `shard.started` 뒤 `max(120 s, 5×중앙값 ms)` 안에 done/failed 없으면 `shard.failed{error:'timeout', retry:1}` → 1회 재배정 → 재실패 시 job `failed`. (F1-D 요청 2 · 2026-09-26 21:28 고아 job)
15. **재부팅 복구(신설 이벤트 `job.recovered`)**: 게이트웨이 기동(lifespan) + scheduler 기동 시 `state in (queued, running)` 작업을 전수 점검. `running`인데 `workers[]` 하트비트(`worker:{id}:hb` TTL 30 s) 0 → 미완료 shard만 재배정(`mode:'resumed'` · 완료분 유지) · 영상/모델/배포본이 사라졌으면 `failed(error:'recovery_failed')`. 작업 스트림에 `job.recovered{job_id, mode:'resumed'|'requeued'|'failed', shards_done, shards_total, reason, at}` · ops 스트림에 `job.state{…, reason:'recovered'}`. `/health`에 `recovered_at_boot:{resumed,failed}`. HUD/관제 칩 `복구 · 재개 a/b`.
16. **기관 스트림 신설 `GET /api/v1/events/tenant?access_token=`**(realm tenant · lx staff는 자기 tenant): `job.state`(자기 작업) · `deploy.changed`(자기 배포본 · XI맵 계보 칩 실시간) · `finding.state`(실태조사 상태 변화) · `usage.delta`(자기 것). ops 스트림 §5.2는 그대로.
17. **작은 작업 우선 레인**: finalize 큐에서 ≤ 16 shard 작업 선순위 · 동시 작업 3건일 때 새 작업의 첫 chunk 선점(`first_shard_done ≤ 8 s [실측 목표 · 동시 3건]` · 단독 ≤ 5 s). (F1-A 요청 6 · F1-B must_fix 5)
18. 견적·스케줄러: `claim` 응답에 `power_budget` 보류 사유 · 동시 고부하 GPU ≤ 1. nvidia-smi 경로는 DriverStore 최신 자동(`LX_NVSMI` 우선) · `memory.used` 언더플로 시 PDH 대체 + `note`. (F1-C 요청 1·2·6)

## v1.1-3 결과 · 필지 · 실태조사(`/api/v1/survey/*` · 소유 F2-S)
19. **이름 붙은 게시 세트 별칭**: `results/{tenant}/{publish_as}`(예 `namwon-greenhouse-2023-vh`)를 `/results/{set}/features` · `/stats`가 job_id로 해석해 detections를 돌려준다(빈 [] 금지). (F1-B must_fix 1)
20. `GET /api/v1/results/{set}/index?format=json|csv|geojson` — `index_results` 월별 값(봉투 · hist · p10/p50/p90). (F1-D 요청 8)
21. `GET /api/v1/results/{set}/parcels?cls=&jimok=&emd_cd=&min_conf=&limit=2000` — PostGIS `ST_Intersects(detections, survey_parcels)` 필지 FeatureCollection + `lx.count`(inferred) + `by_emd[]`. (AGENT-SPEC §3.4 · 에이전트 도구 · 소유 F2-B)
22. **실태조사 읽기 API(SURVEY-SPEC §3.2 최소 + 상태 쓰기 1개)** — 정본 데이터 = `02. 데이터/survey/`(V-World 연속지적 332,084 · 의심 20,872 · 규칙 R1–R6 · 이력 6,818):
    - `GET /survey/findings?deploy_id=&rule=R1..R6&priority=A|B|C&emd_cd=&state=&bbox=&q=&sort=score|evid_m2|updated&limit=200&offset=` → `{items:[Finding], total: Envelope, counts:{open,assigned,inspected,closed,dismissed}, by_rule, as_of}` — Finding = suspects 행 + `state` + `geom`(대표점 · 폴리곤은 PMTiles 층)
    - `GET /survey/findings/{id}` → Finding + `explain`(규칙 조건 · 근거면적 · 비율 · 신뢰도 · 보강근거 · 임계 `[추정 초기값]` · 대장 결손 `건축물대장 미대조`) + `history[]`(timeline 이벤트)
    - `GET /survey/parcels/{pnu}?with=facts,findings,history` → 대장(지목 · 면적 · 용도지역 · 농업진흥 · 공시지가 as_of) vs 현황(a23_* · a25_* 면적·비율·객체수·신뢰도 · 시점별) · findings · history
    - `GET /survey/stats?by=emd|rule|priority|state` → 봉투 배열(`namwon-parcel-emd-summary.json`과 동일 값)
    - `GET /survey/rules` → R1–R6 정의 · 임계 · 건수 · `basis:'estimate'` 꼬리표
    - **`POST /survey/findings/{id}/state`** `{state:'assigned'|'dismissed'|'inspected'|'closed', reason?, assignee?, planned_for?, client_id}` → Finding · `audit_log` · SSE `finding.state`(tenant 스트림 + ops 스트림) — realm tenant manager · lx staff(시연 표기). 1차 유일한 쓰기.
    - `GET /survey/reports/draft?emd_cd=&rule=&top=20&format=json|docx` → 구조화 초안 데이터 또는 `.docx`(python-docx · 서식 `survey-emd` · 숫자마다 봉투 · `AI 추론 · 검수 전 · 현장 확인 전` 고정 문구) — LLM 없이도 닫힌다(F2-E는 이 함수를 import해 서술문만 더한다).
    - `POST /jobs/quote|/jobs` `kind:'survey'` `{survey_id:'farmland', rules:[…], emd_cd?:[]}` → shards = 읍면동 39 · pool cpu · SSE `shard.done{shard_id:'emd-52190250', n, classes:{R1:n,…}}` + `survey.finding`(칸 안 상위 3) · adapter `survey/rules`(cpu)가 PostGIS에서 규칙을 재평가(임계 오버라이드 허용 · 결과는 `survey_runs`).
    - 오류 `registry_unavailable` 404 · `rule_requires_missing` 400 · `finding_state_invalid` 409.
    - 게스트(`public`) 라우트 0 · 소유자 성명 열 없음(연속지적에 없음 · OWNER_NM 미사용).

## v1.1-4 에이전트(`/api/v1/agent/*` · 소유 F2-E · AGENT-SPEC §3.4 그대로 + 아래)
23. 백엔드 우선순위: **vLLM `http://127.0.0.1:8000/v1` gemma-4-12b-it(tools · `tool_choice:'auto'`)** → 라우터 `:8001` hyperclovax-seed-1.5b(의도 분류 · `map|report|ops|smalltalk` 4클래스) → Ollama `:11434` 폴백 → 셋 다 죽으면 `llm_unavailable` 503 + 프론트 리플레이. `agent.done.model`에 실제 쓴 백엔드·모델·`tokens` 봉투(chat/completions usage · measured).
24. 도구(1차): `catalog_layers` · `results_stats` · `results_features` · `parcel_at` · `results_parcels_join`(21) · **`survey_findings` · `survey_stats` · `survey_parcel`**(22) · `jobs_quote` · `jobs_submit`(**확인 카드 필수** · sales `demo:true`) · 클라이언트 `map_on map_arrive map_flyto map_frame drawer_open parcel_card`(F2-A `window.XI` 브리지). 쓰기 도구는 `jobs_submit` · `survey_state`(확인 카드) 둘뿐. `deploys.*` 0.
25. **숫자 검증기**: `answer_md`의 자리표 밖 숫자는 도구 봉투와 대조 → 불일치 `unverified_numbers[]`(프론트 취소선 + `검증 안 된 숫자` 칩). 연도·좌표·PNU·조문 번호는 화이트리스트.
26. `POST /agent/report/draft{template:'survey-emd', emd_cd, rule?, top?}` → v1.1-22의 draft 데이터 + LLM 서술 3단락(개요 · 소견 · 조치 제안 · 각 문장 끝 `[n]` 인용) → `.docx`(F2-S `server/survey/report.py` import) · `artifact.docx_url` · `citations[]`.
27. 스키마 `migrations/0003_agent.sql`(AGENT-SPEC §3.4) · `usage_events(dim='llm_tokens')` · 쿼터 `llm_tokens_month` 시드 `[추정 기반 초기값]`.

## v1.1-5 관제 · 계량
28. `GpuSample.gpus[i]`에 `util_ma5`(이동평균) · `power_w` · `caution:bool`(VRAM ≥ 76% [목표] 또는 util ≥ 80%) · `fault:bool`. `external[]`에 `llm:{backend:'vllm', model, tps: Envelope|null, reqs_active, note:'WSL 프로세스 VRAM 미노출'}`(vLLM `/metrics` 대리 읽기 · 소유 F2-C 폴러).
29. 관제 `?job=`(행 펼침 + 강조 + 스크롤) · `?deploy=` · `?tenant=` 딥링크는 계약(모든 화면이 같은 규칙). XI맵 `?job=&pnu=&mode=survey&rule=&priority=&finding=` · Global `?job=` · 생산(proto `ai-card.html?card=` · `produce.html?deploy=`)도 같은 규칙.

## v1.1-6 소유 경계 v2(2차 · 겹침 0)

| 소유 | 경로 |
|---|---|
| **Fable(동결)** | `design/system-v2.md` · `tokens-v2.css` · `landxi/shared/api-v1.js`(v1.1 함수 `survey*` `agent*` `tenantEvents`는 각 에픽이 **자기 파일 안에서** `api()`·`sse()` 래퍼로 쓴다 — api-v1.js 수정 금지 · 통합 때 Fable이 옮긴다) · 이 문서 · `f2/F2-*.md` |
| **F2-A** | `landxi/xi/**`(survey 모드 · `bridge.js` 포함) · `tests/e2e/f1a-*` `f2a-*` `f2s-*.spec.mjs` · `shots/f2/A/**` · `f2/F2-A-result.md` |
| **F2-B** | `server/**` **단** `server/ops/**` · `server/adapters/global/**` · `server/pipelines/global/**` · `server/survey/**` · `server/adapters/survey/**` · `server/agent/**` · `server/landxi_api/survey.py` · `server/landxi_api/agent.py` · `server/migrations/0002_survey.sql` · `0003_agent.sql` 제외 · `tests/e2e/f1b-*` `f2b-*` · `shots/f2/B/**` |
| **F2-S** | `server/survey/**` · `server/adapters/survey/**` · `server/landxi_api/survey.py` · `server/migrations/0002_survey.sql` · `02. 데이터/survey/{replay/,findings-emd.json}` · `tests/e2e/f2sapi-*.spec.mjs` · `server/survey/tests/**` · `shots/f2/S/**` |
| **F2-E** | `landxi/agent/**` · `server/agent/**` · `server/landxi_api/agent.py` · `server/migrations/0003_agent.sql` · `tests/e2e/f2e-*` · `shots/f2/E/**` |
| **F2-C** | `landxi/ops/**` · `server/ops/**` · `landxi/assets/css/v2/ops-grid.css` · `tests/e2e/f1c-*` `f2c-*` · `shots/f2/C/**` |
| **F2-D** | `landxi/global/**` · `server/adapters/global/**` · `server/pipelines/global/**` · `landxi/assets/css/v2/globe-stage.css` · `tests/e2e/f1d-*` `f2d-*` · `shots/f2/D/**` |
| **F2-R** | `landxi/proto/shell.js` · `shell-gate.js` · `login.js` · `login.html` · `stats-standard.html` · `report-standard*.html` · `map-stats.js` · `map-report.js` · `ai-card.html`(+js) · `produce.html`(+js) · `landxi/assets/data/roles.js` · `landxi/login.html` · `tests/e2e/{proto-shell,proto-login,proto-session,shell,proto-map}.spec.mjs` · `f2r-*` · `shots/f2/R/**` |
| **통합(F2-∑)** | `server/landxi_api/main.py`의 ext 라우터 등록은 **F2-B가 D0에** 넣는다(`try: from . import survey, agent`) · `.gitignore` · 커밋 · `shots/f2/F2-integrated.mp4` |

---

# v1.2 — 최종 명세 §3 서버 변경 S-1…S-12 (2026-09-27 · 서버 팀)

봉투·오류 형식은 v1.1 그대로. 아래 키는 v1.1 픽스처(`server/fixtures/contract/*.json`)에 **선택 키**로 더해진다(검사: `server/tests/test_contract.py` `V12_OPTIONAL` · `V12_NESTED`). 게이트는 :8700 실서버만.

## v1.2-1 정문 · 지역 · 공개
1. **S-1** `GET /auth/tenants`(인증 없음) → `{items:[{id, name:{ko,en}, scope:'local'|'global'}], as_of}` — active · 이용 기관만 · `lx` · `lx-demo` 제외 · 국내 먼저. 계정·쿼터·경로 0.
2. `POST /auth/login` 의 비밀번호 검증은 스레드에서(이벤트 루프를 막지 않음). 응답 형식 불변.
3. **S-3** `GET /regions?public=&q=&sido=&has_imagery=` → `{items:[{sgg_cd, name, sido, full, bbox, center, has_imagery, deploys:[{id,card,stage}], n_findings?(env · 로그인), in_scope?(bool · 로그인), prev_cd?}], total(env), source, public, as_of}`. 게스트·`public=1` = 운영/시범 배포본만 · `n_findings` 없음. 기관 세션 = 자기 배포본만 · 관할 밖 `n_findings` 0(RLS).
   - `GET /regions/{sgg_cd}?geom=` → 위 항목 + 로그인 시 `imagery[]`(LX = 전부 · 기관 = tenant/public 정책만) · `parcels`(env 필지) · `ledger[{kind, import_id, rows, matched_pct}]` · `has_ledger` · `n_findings` · `?geom=1` 이면 `geometry`. 없는 코드 404 `not_found`.
   - 뼈대 = `server/seed/regions-sgg.json`(252) + V-World `LT_C_ADSIGG_INFO` 캐시 90일(`02. 데이터/cache/regions/vworld-adsigg.json`). **코드가 바뀐 시군구**(예: 전남광주 12xxx ← 옛 46xxx·29xxx)는 이름으로 옛 코드를 이어 옛 경계·필지·의심 수를 그대로 쓰고 `prev_cd` 로 알린다. 새로 생긴 구(인천 제물포·영종·검단·서해, 화성 4구)는 V-World 실제 경계. 사각형(bbox) 경계 0.
   - 기관 관할 = `server/config/regions.yaml tenants.*.sgg`(접두) — 에이전트 범위 가드와 같은 표.
4. **S-4** `GET /public/stats?set=river-occupy&by=sigungu[&geom=1]` → `{set, by, label, export_policy:'public', total(env), n_sgg(env), breaks[env], top, items:[{sgg_cd, name, value(env)}], geojson?}` · 없는 세트 404. `GET /public/sample-parcel` → `{place(리까지 · 지번 0), pnu_masked(끝 두 칸 ****), ledger{jimok, yongdo, area(env)}, ai{cls, n(env), area(env), year}, verdict:'현장 확인 필요', bbox, parcel(Feature), ai_fc, export_policy, as_of}`. 공개 타일 `/tiles/pmtiles/public/{set}.pmtiles` · `/tiles/xyz/public/{set}/{z}/{x}/{y}.pbf` = 서명 면제 · 경로 탈출 400/404.

## v1.2-2 대장 반입·융합·판정·조치(S-2)
5. `POST /t/{tenant}/survey/registry/import`(multipart `file` · `kind` ∈ farm_ledger|dev_permit|public_asset|river_permit|greenhouse · 20MB · xlsx csv shp zip gpkg geojson) → 202 `{import_id, rows(env), columns, columns_guess{원본열: pnu|jibun|status|use|…}, dropped[성명·연락처 열 이름만], sample[], needs[]}` — 성명·연락처 **값 저장 0**.
6. `GET …/registry?latest=1` · `GET …/registry/{import_id}` → `{state: uploaded|matching|matched|failed, matched(env), matched_pct(env % · measured), by_step{pnu, jibun, vworld}(env), unmatched[{seq, reason}], findings{L1…}(env), error?}` · `POST …/{import_id}/confirm{mapping?}` → 202 매칭(PNU → 지번 → V-World BOX) · 성명 열 매핑 400 · `DELETE …/{import_id}` = 반입 철회(판정 붙은 의심은 보존 · 최신 반입을 지우면 이전 반입이 최신으로 돌아오고 규칙 L-* 재판정). **`findings{L*}` = `survey_findings` 실시간 집계(`import_id` 기준 · 저장값 아님)**. 새 반입의 규칙 판정은 **같은 기관 · 같은 종류(kind) 반입**이 만든 open 의심만 갈아 끼운다(다른 기관 · 다른 종류 · 판정·조치 붙은 의심 불변). 의심 id `f_{rule}_{tenant}_{pnu}`(기관별). 타 기관 403. **게이트웨이 재기동으로 끊긴 매칭은 기동 시 이어 돌림**(원본 임시 파일이 없으면 `failed` + `서버가 다시 시작되어 매칭이 멈췄습니다 — 파일을 다시 올려 주세요`).
7. 조회: `GET /survey/findings?ledger=` · `GET /survey/stats?by=emd&ledger=`(`ledger_matched` · `ledger_findings{L*}`) · `GET /survey/parcels/{pnu}?with=ledger,…`(`ledger[]` 또는 `ledger_note`) · `GET /survey/rules/ledger`. 규칙 `server/survey/rules/L*.yaml`(대장 피연산자 `ledger.<kind>.<col>`). 의심 상세 `explain.three{ledger, ai, vworld}` — AI 값(`ratio` · `m2`)은 봉투.
8. **상태 확장** `POST /survey/findings/{fid}/state{state, verdict, verdict_code, note, assignee, planned_for, reason, client_id}` — 전이 `open→assigned|dismissed` · `assigned→assigned(담당 재지정 · assignee 필수)|inspected|dismissed` · `inspected→closed(verdict 필수 · 400 verdict_required)`. `closed+match_fp` 또는 `dismissed` → `feedback(kind fp)` 자동 · 응답 `feedback_id`. 목록 항목에도 `verdict` · `verdict_code`.
9. **LX 표본 검수** 같은 경로에 LX 세션이 `{verdict: match|match_fp|unclear, verdict_code?, note?}`(state 없음)를 보내면 `finding_verdicts(realm lx)`에 영구 기록 · 기관 필지 상태 불변 · 응답 `lx_verdict` + `lx_stats`. 영업 403.
10. `GET /survey/rules/{id}/stats` → 기존 키 + `lx{judged, precision(%), verdicts{match, match_fp, unclear}}`(필지당 마지막 LX 판정) · `field{judged, precision}`(기관 현장 판정) · `reviewed` · `gate`(80 % · 추정 초기값) · `gate_samples`(100). `POST /survey/rules/{id}/recalibrate?scope=lx|field` → `{key, scope, current, proposed(env|null), samples, need}`.
11. `POST /survey/rules/{id}/activate{thresholds?, note?, review?}` → 202 `{approval_id, review}`(approvals 행 · 중복 409). `review`(기본 = 임계 없이 부르면 true) = **검수 전 떼기** — LX 표본 < 100 또는 정밀도 < 80 % 면 409(메시지 `표본 {k}/100`). 관리자 승인 시 임계 적용 + `review` 면 규칙 `reviewed:true`(`GET /survey/rules` 항목에 `reviewed` · `reviewed_at`).
12. `POST /survey/actions{finding_id, kind, law?, due?, note?}` → 201 · kind = `notice|correction|penalty|restore|revisit|referral|none|other` 또는 화면 말(안내 · 시정명령 · 이행강제금 · 원상복구 · 없음) · `law` = 근거 조문 · `GET /survey/actions?finding_id=` · `POST /survey/actions/{id}{state}`.
13. 스키마 `migrations/0004_ledger.sql`: `ledger_imports` · `registry_snapshots.import_id` · `survey_actions(+law)` · `survey_rules(state, version, pending, reviewed, reviewed_at)` · `finding_verdicts` · RLS tenant(LX realm 전체).

## v1.2-3 영상 · 카드 · 배포
14. **S-5** `POST /catalog/imagery{path | upload(multipart), region(sgg_cd), year, gsd?, kind?(ortho|aerial|drone|satellite), name?}`(LX staff·admin) → 201 카탈로그 항목(`catalog/layers` 항목 형식 · tier raw · LX 전용) + `job{id, kind:'tile'}`(CPU · inspect → overview) · 없는 파일 404 · 기관 403.
15. `catalog/layers` · `catalog/imagery/{id}` 영상 항목 + `sgg_cd`(소유 시군구 · 기존 행은 `seed/backfill_imagery_sgg.py` 로 채움) + `tile_ready`(등록 영상 = 타일 작업 마감 뒤 true).
16. **S-6** `GET /registry/cards[?public=1]` 항목 + `ledger_schema{kind, columns[]}` · `intro{headline, line}` · `crop_url` · `status_label`(운영|시범|첫 결과 전) · 공개 = 실결과 있는 운영·시범만 · `ledger_schema`·버전 0. `PUT /registry/cards/{id}/ledger_schema`(LX staff·admin · 성명 열 400 · `columns[]` 항목이 객체가 아니면 400 `bad_request` `{index, got}` · 영업 403).
17. **S-7** `POST /deploys{from_deploy_id | card_id, region(sgg_cd), ci{name, short, mark, color, tint, unit_word, crs, contact, seal}, reason?}`(LX staff·admin) → 201 draft + `approval_id`(approvals pending · action port) + `results`(env 0). 심기 결재 전 `rollout draft→shadow` 409 `approval_required`. `GET /deploys?with=health` → 항목 `health{precision, judged, fp_reports, last_train, last_train_days, next_action: retrain|sample_review|update_deploy|none, next_action_label, thresholds}` · `?public=1` = 운영·시범·실결과만(요약 필드). 시험 배포본(`test`) 기본 제외 · `DELETE /deploys/{id}`(관리자 · 시험 또는 결과 0 draft만). `region` 은 `/regions` 목록의 시군구 코드(구가 있는 시의 상위 코드 예: 52110 은 거절 — 구 코드로).

## v1.2-4 작업 · 관제 · 결재
18. **S-8** `POST /jobs/quote|/jobs` — 서버측 AOI × 영상 × chip shard 계획 · 상한 초과 `too_large` · `kind:'train'{base_model, samples, options}` 견적 · **전력 예산**: 동시 고부하 GPU > `pools.yaml power.max_hot_gpus`(1) 요청 = 견적 `allowed:false, reasons:['power_budget']` · 제출 409 `power_budget`. 영업 = `demo:true` 강제. `GET /jobs?since=` → `count`(env · 기간 전체 건수 · 목록 상한 500 무관). `kind:'join'` 마감 `counts{joined_parcels, parcels}`.
19. **S-9** `GET /events/ops` Origin :4173 허용(admin role) · 그 밖 Origin/역할 403. `GET /ops/gpus` + `power_budget{max_hot, hot_now, ok, hot[], threshold_w, power_limit_w, leases, unit}` — 고부하 기준 = 장별 `power.draw > power.other_gpu_hot_w`(100 W) 또는 `power:hot` 임대. `GET /approvals?state=pending` → `{items:[{id, kind: deploy|deploy_ga|rule|quota, kind_label, subject, title, requested_by, at, state, payload}], pending(env), counts{deploy, deploy_ga, rule, quota}(env)}` · `POST /approvals`(기관 quota 요청 · 타 기관 403) · `POST /approvals/{id}/decide{decision, reason?}`(관리자 · 결정된 것 409). `GET /ops/queues` 레인 블록 중 이미 끝난 작업은 작업 표 상태·종료 시각으로 닫는다. `GET /ops/uptime`(S-12) → `items[{name, boot_at?, pid_alive, uptime_s(env), heartbeat_age_s(env), state}]`. `GET /ops/llm` → `redteam{accuracy, reject_accuracy, answer_accuracy, cases}` · `backends{router, vllm, ollama}(probe_ms env)`.

## v1.2-5 에이전트 · 글로벌
20. **S-10** 범위 가드(LLM 전): 기관 세션이 관할 밖 시군구 → SSE `agent.rejected{message:'이 기관의 데이터가 아닙니다'}` · 데이터 없는 시군구 → `해당 지역 데이터가 없습니다`(도구·LLM 호출 0). 도구 + `ledger_ingest ledger_match ledger_rule(확인 카드) ledger_findings parcel_lookup` · `survey_stats by=emd` · 인용 1부터 · 자리표 뒤 단위 제거(조사 앞 단위 포함 · `건물` 같은 낱말은 그대로). 회귀셋 `server/agent/redteam.yaml` 50문 → `/ops/llm`.
21. **S-11** `GET /proxy/tiles/global/{z}/{x}/{y}` EOX → PC → V-World 사다리 · 서버 캐시(`x-lx-tile-source` · `x-lx-cache: hit|miss`) · `POST /proxy/tiles/warm{bbox, zmin, zmax}` 202 · `GET /proxy/tiles/stats` · `GET /proxy/global/s2-index?deploy_id=` · `POST …/precompute` 202.

## v1.2-6 기동(S-12)
22. `server/start-landxi.ps1`: Redis·PG → 마이그레이션 → 게이트웨이 헬스 → 전력 검사(32비트 셸은 `Sysnative\nvidia-smi`) → 워커(`.workers.lock` · 다른 기동이 쥐고 있으면 ≤ 90 s 기다린 뒤 빠진 것만 · 5분 넘은 잠금 무시) → 관제 → 감시(`-Watch` · 20 s 응답 대기 × 3회 실패일 때만 게이트웨이 재기동 · 경로 따옴표). `-Restart gateway|workers|all`. Ollama · vLLM · :4173 은 건드리지 않는다. 게이트웨이 기동 시 시군구 뼈대를 스레드에서 미리 읽는다 · Redis SCAN 은 `count=2000`(헬스 0.33 s → 0.01 s).
