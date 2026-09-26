# Land-XI 하이퍼 GeoAI 플랫폼 — 시스템 아키텍처 설계안 (패널 S · 2026-09-24)

- 관점: 시스템 아키텍처 주도(프론트 엔진 · 백엔드 · 데이터 파이프라인 · 성능 예산 · 보안 · 단계적 구축). 다른 두 패널과 독립 작성.
- 근거(모두 읽음): 메모리 9편(`landxi-ximap-core` `landxi-quality-bar` `landxi-relaunch-0923` `landxi-redesign-direction` `landxi-user-prefs` `landxi-local-assets` `landxi-status-0922` `landxi-portable-copy`) · `recon-0924/`의 ASSET-LEDGER와 env · vworld · stack · e-projects · e-landcover · d-drive · global-map · aihub-shortlist · `specs/2026-09-20-{two-tier,platform-roles,card-architecture,production}.md` · `audit-0923/MASTER-PLAN.md` · `strategy.md` · `specs/2026-08-26-landxi7-function-inventory.md` · 코드(`tools/serve.mjs`, `landxi/assets/data/{infra,cards,portal}.js`, `landxi/proto/map-gl.js`, `spikes/ximap-signature.*`, `design/system.md`).
- 표기 규칙(콘티 원칙 7): **[실측]** = recon 또는 이 PC에서 잰 값 · **[목표]** = 설계 예산(아직 안 잰 값) · **[추정]** = 계수로 계산한 값 · **[시연]** = 결과를 남기지 않는 연출. 이 문서에 이 네 표기 없이 나오는 숫자는 모두 recon 원문을 인용한 것이다.
- 자산 표기: ASSET-LEDGER의 ID(A01–A13, B01–B14, C01–C10, D01–D11, E01–E04)를 쓴다. 공개 데이터는 URL을 직접 적는다(`global-map.md`에서 2026-09-24에 호출 검증한 것만).

---

## 0. 논지 — 왜 지금은 "목업"이고, 무엇이 있으면 "운영"인가

**지금 Land-XI에는 서버가 없다.** 화면 57장이 전부 정적 HTML이고, "분석 실행"은 `setInterval` 카운터이며(`strategy.md §2.3`), 인프라 수치는 `infra.js`의 상수다. 그 상수(`CAPACITY.gpuCards: 4`)는 실제 장비(RTX A6000 48GB × 2, `env.md` [실측])와도 맞지 않는다. V-World 키는 `serve.mjs`가 `env.js`로 브라우저에 평문으로 내려보낸다. 게다가 그 키는 만료됐다(E01). 사용자가 "목업"이라고 부른 것의 절반은 디자인 문제다. 나머지 절반은 **보이는 모든 동작 뒤에 진짜 계산이 없다**는 데서 온다.

이 설계안의 논지는 한 문장이다.

> **XI맵 위에서 사용자가 영역을 긋는 순간, 이 PC의 A6000이 실제로 돌기 시작하고, 조각(shard)마다 끝나는 대로 결과가 지도 위에 도착하며, 같은 순간 관리자 관제 화면의 GPU 사용률 막대가 실제로 오르고, 그 기관의 할당량이 실제로 줄어든다.**

이 한 흐름이 끝까지 실데이터로 닫히면 "운영 가능"이다. 닫히지 않으면 아무리 예뻐도 목업이다. 그래서 구축 순서는 **수직 절단(vertical slice) 하나를 먼저 운영 수준으로** 만드는 것이다(§12 Phase 0). 이는 메모리 8차 교훈("한 화면을 운영 수준으로 먼저 끝까지 만들어 영상으로 판정받고 확산")과 같은 방향이다.

WebGL급 몰입감은 이 설계에서 장식이 아니다. 계산이 실제로 흐르고 있다는 것을 **보이게 하는 장치**다. 스캔 스윕은 실제 shard 진행률을 따라 움직이고, 격자 셀은 실제 워커가 끝낸 순서대로 불이 켜지며, 숫자는 실제 DB 행 수로 올라간다. 그래서 공무원·시민·LX 직원 세 관점의 "우와"와 콘티 원칙(지어낸 수치 금지)이 충돌하지 않는다. 움직임의 원천이 실측이기 때문이다.

---

## 1. 목표 아키텍처 한 장

```
┌──────────────────────────── EXPERIENCE PLANE (브라우저, 정적 배포 + 오프라인 벤더링) ─────────────────────────────┐
│  ① 게스트 필름(scrub)   ② LX 플랫폼(staff/sales)   ③ LX/OPS 관리자(잉크 반전, 별도 origin)   ④ 기관 포털 × n (CI 한 벌)   │
│        └──────────── 공통 지도 엔진  landxi/engine/lx-map.js ─────────────┘                                          │
│   MapLibre GL 5.6.0(globe · terrain · sky) + deck.gl 9.3.10(MapboxOverlay interleaved) + three 0.185.1(CustomLayer)   │
│   + pmtiles 4.5.0(addProtocol) · 부품: arrive · timescrub · swipe · jobTheater · provenance · lineage                 │
└───────────────┬───────────────────────────────────────────────────────────┬──────────────────────────────────────────┘
                │ HTTPS  /api/v1/*  ·  /tiles/*  ·  SSE /events                │ (관리자 전용 origin :8702, IP allowlist)
┌───────────────┴────────────────────────── SERVICE PLANE (FastAPI 게이트웨이) ─┴──────────────────────────────────────────┐
│ auth(realm=lx|tenant) · catalog(STAC 유사) · tiles(PMTiles Range · COG 동적=TiTiler) · proxy(V-World · GIBS · PC · FIRMS · EMS) │
│ jobs(제출·견적·SSE) · results(편집=LX만) · registry(모델·카드·버전) · deploy(단계 배포·롤백·승인) · quota(견적·집행·계량)      │
│ ops(메트릭 질의·경보·노드 등록)                                                                                              │
└───────┬──────────────────────┬───────────────────────────────┬──────────────────────────────┬───────────────────────────┘
        │ Redis Streams        │ SQL (RLS)                     │ 파일/객체                    │ Prometheus 질의
┌───────┴────────┐   ┌─────────┴──────────┐        ┌───────────┴────────────┐       ┌─────────┴───────────┐
│ COMPUTE PLANE  │   │ PostgreSQL 16      │        │ DATA PLANE             │       │ OBSERVABILITY       │
│ scheduler      │   │ + PostGIS 3        │        │ E:/landxi-data/        │       │ Prometheus          │
│ GPU worker×GPU │──▶│ tenants·jobs·      │        │  raw(링크·반출 금지)   │       │ + nvidia-smi 수집기 │
│ (A6000×2 →     │   │ detections(분할)·  │        │  cog · pmtiles ·       │       │ (→ DCGM exporter)   │
│  A100×4 ×2)    │   │ models·deploys·    │        │  parquet · cache ·     │       │ + Alertmanager 규칙 │
│ CPU 워커(타일링)│   │ usage·alerts       │        │  models · tenants/*    │       │ → ops_alerts 테이블 │
└────────────────┘   └────────────────────┘        │ (Phase 2: MinIO S3)    │       └─────────────────────┘
                                                   └────────────────────────┘
```

원칙은 다섯 가지다.

1. **단계가 바뀌어도 인터페이스는 같다.** 큐는 Redis Streams, 저장은 "경로 = 객체 키", DB는 PostgreSQL이다. Phase 0(이 PC) → Phase 2(A100 클러스터)에서 바뀌는 것은 배치 위치뿐이고 API · 스키마 · 프론트 코드는 그대로다.
2. **프론트는 빌드 없는 정적 배포를 유지한다**(`stack.md §4.1`). 서버가 죽어도 정적 시연 모드로 떨어진다. 이 폴백은 `[시연]` 표식으로 스스로 밝힌다.
3. **원본은 LX 밖으로 나가지 않는다**(R7, `card-architecture §5.2`). 게이트웨이에는 원본 경로를 여는 라우트가 아예 없다.
4. **모든 숫자는 출처 행을 가진다.** API 응답의 숫자 필드는 `{value, unit, basis: measured|demo|estimate, as_of, source}` 봉투로 나간다. 봉투가 없는 숫자는 `provenance.js`가 렌더하지 않는다(MASTER-PLAN R4를 서버 쪽으로 확장).
5. **세 기둥은 한 기록에서 나온다.** 관제(infra) · 할당(quota) · 배포(deploy)는 같은 `deploys` 행과 같은 `usage_events`에서 계산한다. `infra.js`의 계수(RATES)는 서버 `quota/estimator.py`로 옮겨 **견적**으로만 쓰고, 실제 사용량은 워커 계량으로 덮어쓴다.

---

## 2. 프론트 엔진 — `landxi/engine/`

### 2.1 왜 엔진을 하나로 합치나

`stack.md`는 이렇게 진단했다. "엔진은 이미 있다(MapLibre 5.6.0 · deck 9.3.10 · three 0.185.1이 dive와 스파이크에서 실측으로 돌았다). 운영 화면이 쓰지 않을 뿐이다." 지금 `map-gl.js` · `analysis-map.js` · `publish-map.js` · `admin-map.js` · `drift-map.js` 다섯 벌은 모두 `dragRotate:false`로 잠긴 2D다. 여기서 하는 일은 새 엔진을 만드는 것이 아니다. 검증된 능력을 **한 모듈 뒤에 모으는 것**이다.

### 2.2 파일 구성

| 파일 | 역할 | 출처·재사용 |
|---|---|---|
| `landxi/engine/lx-map.js` | `createMap(el, {mode:'2d'|'3d'|'globe', tier, basemap, locale})`. 글로브 ↔ 메르카토르 줌 보간, `setSky`, 장면 단위 `setTerrain`, deck `MapboxOverlay({interleaved:true})` 부착, three `CustomLayerInterface` 슬롯 | `map-gl.js`(269줄) 흡수 + `js/dive.js:252`(글로브) + `js/style.js:55`(DEM) |
| `landxi/engine/sources.js` | **소스 사다리**(§4.2 표). 서버 카탈로그 `/api/v1/catalog/layers`를 읽고, 없으면 내장 목록으로 폴백. z/x/y 순서 차이(EOX · GIBS = `{z}/{y}/{x}`, xdworld = `{z}/{x}/{y}`)를 여기 한 곳에서만 처리 | `js/sources.js` `resolveVWorld()` 확장 |
| `landxi/engine/tier.js` | 품질 티어 판정(§2.4) | 신규 |
| `landxi/engine/fx/arrive.js` | S1 도착(스윕 → 락온 380ms → 숫자 현상). **입력이 shard 진행 이벤트일 수 있다**(§5.3) | `spikes/ximap-signature.js:285 arrive()` 승격 |
| `landxi/engine/fx/timescrub.js` | S3 시점 스크럽(raster 두 층 크로스페이드, 정수 정지 750ms) | 스파이크 `setEpoch` 승격 |
| `landxi/engine/fx/swipe.js` | S6 스와이프(지도 2개 동기, `--swipe`) | 스파이크 + `js/swipe.js` |
| `landxi/engine/fx/job-theater.js` | **실시간 분석 프레임**: shard 격자 · 진행 · 결과 도착(§5.3) | 신규 — 이 설계의 핵심 부품 |
| `landxi/engine/fx/provenance.js` | 숫자 봉투(`basis/as_of/source`) 렌더. 봉투 없는 숫자는 거부 | MASTER-PLAN S5 |
| `landxi/engine/fx/lineage.js` | 모델 → 카드 → 배포본 → 기관 계보 띠. 이제 `/api/v1/registry/lineage/{id}`를 읽는다 | MASTER-PLAN S2 |
| `landxi/engine/api.js` | fetch 래퍼(세션 쿠키, realm 헤더, 봉투 해제, SSE 재연결, 서버 부재 시 `demo` 폴백) | 신규 |
| `landxi/engine/i18n/{ko,en,ru}.json` | 글로벌 에디션 문자열(러시아어 = 키르기스스탄 행정 공용어) | 신규 |

### 2.3 벤더링 — 오프라인 시연 필수

`landxi/proto/vendor/`에 한 번만 받아 고정한다. CDN 호출은 0이다(감사 C9 해결 방향을 그대로 잇는다).

| 패키지 | 버전(핀) | 받을 파일 | 근거 |
|---|---|---|---|
| maplibre-gl | **5.6.0**(이미 있음) | – | v6은 ESM 전용이고 deck 9.3.10과 호환되지 않는다(`webgl-stack-feasibility` 실측) |
| deck.gl | 9.3.10 | `dist.min.js` 1파일(gzip 446KB) | `stack.md §4.2` |
| three | 0.185.1 | `build/three.module.js` + `three.core.js` + `GLTFLoader` · `RoomEnvironment` | 궤도 인트로 · 스캔 빔 셰이더 |
| pmtiles | 4.5.0 | `pmtiles.js` | `addProtocol` 실측 |
| gsap / lenis | 3.15.0 / 1.3.26 | 각 1파일 | 현재 3종이 섞여 있어 통일 |
| h3-js | 4.x | UMD 1파일 | deck UMD 포함 여부 미검증(`stack.md §6`) → 별도로 둔다 |

### 2.4 품질 티어와 프론트 성능 예산

측정 근거: 4090 풀 스택에서 드롭 0, 지형 ON 232 → 96fps, SwiftShader 지형 66 → 2.4fps(`perf-thispc.md`) · 스파이크 S1/S3 p95 16.8ms(`E0-S-result.md`, 헤드리스 1440×900). 이 모두 **[실측]**이다. **iGPU(사무용 노트북 — 공무원이 실제로 여는 장비)는 한 번도 재지 않았다.** 그래서 T2 기준 측정이 Phase 0 필수 과제다.

| 티어 | 판정 | 켜는 것 | 프레임 예산 [목표] |
|---|---|---|---|
| **T1** 워크스테이션 dGPU | `WEBGL_debug_renderer_info`가 NVIDIA/AMD 전용 GPU이고 첫 60프레임 p95 ≤ 20ms | 글로브 · 대기 · 장면 지형 · deck interleaved · three · DPR 2 | p95 ≤ 16.7ms |
| **T2** 사무용 iGPU | Intel/Apple 내장이거나 T1 측정 실패 | 글로브 · deck · three 궤도(저폴리) · DPR 1.5 · **지형은 버튼으로만** | p95 ≤ 33ms |
| **T3** 폴백 | SwiftShader · `prefers-reduced-motion` · 캔버스 실패 | 2D · `jumpTo` · 스윕 없이 결과 즉시 표시 | – |

전 티어 공통 예산 [목표]: 화면당 WebGL 캔버스 ≤ 2(S6 스와이프만 2) · JS 힙 ≤ 300MB(4090 실측 118MB의 약 2.5배 여유) · 한 레이어 GeoJSON 직접 로드 ≤ 5MB 또는 50k 피처(넘으면 서버가 PMTiles로 준다) · 첫 의미 있는 지도(배경 + 결과 1층) ≤ 2.5s(LAN) · 지형은 장면 진입 때만 `setTerrain`, 나갈 때 해제한다.

---

## 3. 서비스 플레인 — FastAPI 게이트웨이

### 3.1 위치와 실행 환경 (이 PC 기준)

| 항목 | 결정 | 이유 |
|---|---|---|
| 코드 | 저장소 안 `server/` (디자인 저장소와 같이 버전 관리) | 프론트 `api.js`와 스키마를 한 커밋으로 맞춘다 |
| 게이트웨이 env | 새 conda env **`landxi-srv`** = `gcs` 복제(GDAL 3.12.4 · rasterio 1.4.4 · rio-cogeo · geopandas · torch cu118) + `fastapi uvicorn[standard] asyncpg redis titiler.core rio-tiler pmtiles argon2-cffi prometheus-client` | `gcs`를 오염시키지 않는다. GDAL CLI 경로를 그대로 쓴다(`env.md`) |
| GPU 워커 env | 같은 `landxi-srv` + `ultralytics==8.3.234` | 시스템 Py3.11의 ultralytics 8.3.234 · torch 2.5.1+cu118과 같은 버전(`env.md` [실측]) |
| 포트 | 게이트웨이 **:8700** · 관리자 origin **:8702** · Redis **:6380** · Postgres **:5433** · Prometheus **:9090** | 80·443·6379는 cleanriver Docker가 쓰고 있다(`env.md`) |
| 컨테이너 | Redis = 로컬에 있는 `redis:7-alpine` 이미지로 **cleanriver와 별개 인스턴스** · Postgres = `postgis/postgis:16-3.4`(한 번 pull) · nginx는 Phase 1부터(`nginx:alpine` 이미지 있음) | Docker 29.6.2 데몬 가동 중 [실측] |
| 정적 서빙 | Phase 0은 `tools/serve.mjs`를 그대로 두고 `/api/*` · `/tiles/*` · `/events/*`만 :8700으로 역프록시(20줄 추가) | serve.mjs는 Range 206을 이미 구현했다(코드 확인). PMTiles 정적 서빙 조건을 충족한다 |

### 3.2 모듈 배치

```
server/
  landxi_api/
    main.py                 # FastAPI 앱, 라우터 등록, 봉투 미들웨어, realm 가드
    auth/                   # 세션(argon2) · realm=lx|tenant · roles(admin/staff/sales) · tenant_users 별도 표
    catalog/                # 레이어·영상 카탈로그(STAC 유사 JSON) — 라이선스·출처·GSD·시점·CRS 필드 필수
    tiles/                  # /tiles/pmtiles/{set}.pmtiles (Range) · /tiles/cog/{item}/{z}/{x}/{y} (TiTiler, LX realm 전용)
    proxy/                  # vworld · gibs · planetary · firms · ems — 키 주입 · 디스크 캐시 · ACAO 부착 · 일일 한도 계량
    jobs/                   # 제출 · 견적 · 샤딩 · SSE · 취소 · 재큐
    results/                # 조회 · 편집(LX만) · 스냅샷(PMTiles) · 내보내기(권한별)
    registry/               # 모델 · 카드 · 카드버전 · 모듈 · 계보
    deploy/                 # 배포본 · 단계 배포 · 롤백 · 승인
    quota/                  # 견적(estimator.py = infra.js RATES 이관) · 집행 · 계량 집계
    ops/                    # 노드 · GPU · 큐 · 스토리지 · 경보 조회, 노드 가입 토큰
  workers/
    gpu_worker.py           # GPU 하나당 프로세스 하나(CUDA_VISIBLE_DEVICES), 모델 LRU, 배치 추론
    cpu_worker.py           # 타일링 · PMTiles 스냅샷 · 통계 집계
    scheduler.py            # 우선순위 · 기관 공정 분배 · 선점 · 풀 라우팅
    adapters/               # yolo_seg.py · yolo_obb.py · sam2.py · stats_pc.py(Planetary Computer 통계) · ndvi.py
  pipelines/                # 전처리 배치(§6) — 멱등 스크립트, 산출물은 catalog에 등록
  bench/throughput.py       # 모델 × GPU 처리량 실측 → registry.perf
  migrations/               # SQL(§3.4)
  config/{pools,quotas,sources,alerts}.yaml
  .env                      # VWORLD_KEY · FIRMS_MAP_KEY · SESSION_SECRET — 저장소 제외(.gitignore)
```

### 3.3 API 목록 (v1)

| 메서드 · 경로 | realm | 무엇 | 실데이터 |
|---|---|---|---|
| `POST /api/v1/auth/login` · `/logout` · `GET /me` | lx · tenant(별도 표) | 세션. 응답에 `realm` · `role` · `tenant_id` | MASTER-PLAN Q1 ② 완전 별도를 서버에서 강제 |
| `GET /api/v1/catalog/layers?bbox=&z=&locale=` | 공통 | 소스 사다리 + 보유 영상 + 결과 레이어. 각 항목은 `license` · `attribution` · `gsd` · `epoch` · `crs` · `tier`(raw/tile/result) | A01–A13 · C01 · global-map §1 URL들 |
| `GET /api/v1/catalog/imagery/{id}` | 공통 | 영상 한 벌의 메타(원본 경로는 LX realm + admin만) | A01 imagery.js 메타 이관 |
| `GET /tiles/pmtiles/{set}.pmtiles` | 서명 URL | 정적 PMTiles Range 서빙. 기관 전용 세트는 HMAC 서명(10분) | P1 산출 |
| `GET /tiles/cog/{item}/{z}/{x}/{y}.webp` | lx | 로컬 COG 동적 타일(TiTiler). 원본 GeoTIFF가 아니라 **COG 사본**만 연다 | B03 · B04 · B06 · C01 COG |
| `GET /api/v1/proxy/vworld/{wmts|wms|data|search|address}` | 공통 | 키 서버 주입 · `domain` 주입 · 디스크 캐시 `E:/landxi-data/cache/vworld/` · ACAO | E01(키 갱신 대기) · `vworld.md §6` |
| `GET /api/v1/proxy/pc/{stac|tiles|stats|mosaic}` | 공통 | Planetary Computer 호출을 한 곳에 모은다(SLA 없음 → 응답 캐시 + 자체 TiTiler 전환 지점) | `global-map §1-7` |
| `GET /api/v1/proxy/{gibs|usgs}` · `GET /api/v1/feeds/{firms|ems}` | 공통 | GIBS · USGS는 CORS가 있어 통과. FIRMS · EMS는 CORS가 없어 **크론 수집 정적 JSON** | global-map §1-6 |
| `POST /api/v1/jobs/quote` | lx · tenant | AOI · 카드 · 소스 → 면적 · shard 수 · 예상 GPU·s · 할당 잔여 · 허용 여부 | quota.estimator |
| `POST /api/v1/jobs` | lx(staff) · tenant(권한 있을 때) · sales는 `demo:true`만 | 제출. `demo:true`면 결과를 DB에 쓰지 않고 이벤트만 흘린다(MASTER-PLAN Q4 ② '시연 실행'을 서버에서 구현) | – |
| `GET /events/jobs/{id}` (SSE) | 제출자 · admin | `queued → shard.started → shard.done{bbox, n, polys_url} → job.done{counts} → snapshot.ready` | job-theater 입력 |
| `DELETE /api/v1/jobs/{id}` · `POST /jobs/{id}/requeue` | 제출자 · admin | 취소 · 재큐 | – |
| `GET /api/v1/results/{job}/features?bbox=` · `PATCH /results/{job}/features/{fid}` | 조회: 권한자 / 편집: **lx staff만** | 결과 조회 · 수정(품질 책임 = LX, two-tier §3) · 기관은 `POST /feedback`만 | – |
| `POST /api/v1/feedback` | tenant | 오탐 · 누락 신고(위치 · fid · pnu) → LX 라벨링 큐 | 피드백 고리 |
| `GET /api/v1/registry/models` · `/cards` · `/lineage/{id}` | lx | 모델 · 카드 · 계보 | B01 · D03 · D04 · B05 · C09 지표 |
| `POST /api/v1/deploy/{deploy}/rollout` · `/rollback` · `/approve` | lx admin | 단계 배포 · 롤백 · 승인(§8) | cards.js DEPLOYS 이관 |
| `GET /api/v1/ops/{nodes|gpus|queues|storage|alerts}` · `POST /ops/nodes/join-token` | lx admin(:8702만) | 관제(§9) | nvidia-smi · 디스크 · Redis · PG |
| `GET /api/v1/t/{tenant}/usage` | tenant 본인 | 기관 포털의 자기 사용량 | usage_events |

모든 JSON 응답 숫자는 봉투 `{value, unit, basis, as_of, source}`로 나간다. 예: `{"value":2098,"unit":"필지","basis":"measured","as_of":"2026-06-08","source":"results/namwon-farmland-2025.geojson"}`.

### 3.4 데이터 모델 (PostgreSQL 16 + PostGIS 3)

```sql
-- 기관(테넌트) — LX 는 tenant_id='lx' 하나. 기관 사용자는 LX users 와 다른 표다(Q1 ②).
tenants(id text pk, name, kind 'maker'|'user', scope 'local'|'global', crs int, locale, profile_id, created_at)
lx_users(id, login, pw_hash, role 'admin'|'staff'|'sales', status)
tenant_users(id, tenant_id fk, login, pw_hash, role 'manager'|'viewer', status)

-- 할당과 계량
quotas(tenant_id, dim 'storage_gb'|'gpu_s_month'|'area_km2_month'|'concurrent_jobs'|'egress_gb_month'|'vworld_calls_day',
       soft, hard, policy 'queue_low'|'reject'|'notify')
usage_events(id, tenant_id, dim, amount, job_id, basis 'measured'|'estimate', at)   -- 월 파티션

-- 카탈로그와 자산 등급(R7)
imagery(id, name, tier 'raw'|'tile'|'result', gsd_m, epoch, crs, footprint geometry(4326), path_internal, pmtiles_set,
        license, attribution, export_policy 'never'|'tenant'|'public', asset_ref 'A01'|'C01'|…)

-- 모델 · 카드 · 배포(cards.js 세 겹을 정식 기록으로)
models(id, family, version semver, weights_uri, sha256, task 'seg'|'obb'|'det'|'stats', classes jsonb,
       metrics jsonb /* results.csv 원문 */, dataset_ref, perf jsonb /* bench 실측: chips/s per gpu type */, status)
cards(id, name, scope, domain, kind jsonb /* input·output·viz 선언 */)
card_versions(id, card_id, version, model_ids text[], modules jsonb, changelog, created_by, approved_by, approved_at)
deploys(id, tenant_id, card_version_id, region_profile, aoi geometry, status '운영'|'구축'|'예정',
        stage 'draft'|'shadow'|'canary'|'ga'|'rolled_back', pinned bool, gpu_pool text)
approvals(id, subject_type, subject_id, requested_by, decided_by, decision, reason, at)

-- 작업과 결과
jobs(id, tenant_id, deploy_id, card_version_id, source_imagery_id, aoi geometry, priority 0..3, demo bool,
     state, shards_total, shards_done, gpu_s_measured, submitted_by, submitted_at, started_at, finished_at)
detections(id bigserial, tenant_id, job_id, cls, conf real, area_m2, geom geometry(MultiPolygon,4326),
           pnu, emd, edited_by, edit_state 'raw'|'edited'|'deleted') PARTITION BY LIST (tenant_id);
feedback(id, tenant_id, job_id, fid, pnu, lnglat geometry(Point,4326), kind 'fp'|'fn'|'other', state, at)

-- 관제
nodes(id, hostname, role 'gpu'|'cpu'|'ctl', gpus jsonb, pool, joined_at, last_seen)
ops_alerts(id, rule, severity, subject, value jsonb, fired_at, acked_by, resolved_at)
audit_log(id, actor, realm, action, subject, detail jsonb, at)
```

**격리 장치**: `detections` · `jobs` · `feedback` · `usage_events`에 RLS를 건다. `USING (tenant_id = current_setting('app.tenant_id') OR current_setting('app.realm') = 'lx')`. 게이트웨이는 요청마다 트랜잭션 시작 시 `SET LOCAL app.tenant_id / app.realm`을 넣는다. 기관 A의 세션으로 기관 B의 행을 볼 수 있는 경로는 SQL 수준에서 0이다. MASTER-PLAN §2.5가 짚은 "Family Site 링크로 광주전남 작업공간이 열린다"는 누출을 브라우저가 아니라 DB가 막는다.

**왜 PostGIS와 PMTiles를 둘 다 쓰나**: 결과는 **편집된다**(LX가 수정·삭제한다, two-tier §3 "품질 책임"). 편집에는 트랜잭션 저장소가 필요하므로 정본은 PostGIS에 둔다. 지도 전달은 **불변 스냅샷**이 빠르고 캐시가 쉬우므로 job이 끝나거나 편집이 확정될 때마다 PMTiles를 새로 굽는다(`ogr2ogr -f PMTiles`, `env.md` [실측] 동작). 보관·교환용은 GeoParquet다(`pipelines/export_parquet.py`). 기관에 "다운로드"로 내주는 것은 GeoJSON/GPKG다.

---

## 4. XI맵 = 글로벌 GeoAI 맵 — 아키텍처

### 4.1 한 지도, 두 반구

XI맵은 화면 하나가 아니다. **엔진 인스턴스 하나에 두 개의 "무대 프리셋"**이 있다. 카메라가 글로브 줌 0–5에서 한국으로 내려가면 국내 사다리가, 키르기스스탄이나 미얀마로 내려가면 글로벌 사다리가 켜진다. 전환은 `sources.js`가 카메라 중심의 국가 코드(Natural Earth 폴리곤 hit-test)로 판정한다. 페이지 이동은 없다. 이것은 메모리의 "지도는 한 번만 만들고 카메라가 이동" 원칙을 글로벌까지 늘린 것이다.

### 4.2 소스 사다리(줌별 자동 전환)

**국내** (`vworld.md` · ASSET-LEDGER §4.2)

| 줌 | 배경 | 전환 조건 | 자산 |
|---|---|---|---|
| 0–5 | GIBS VIIRS NOAA-20 TrueColor **어제 날짜**(매일 바뀐다) | 글로브 | `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_NOAA20_CorrectedReflectance_TrueColor/default/{date}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg` |
| 6–19 | xdworld Satellite(키 없음, 2026-03 갱신, z19 ≈ 0.25m) | 기본 | A13 · `maxzoom 18.4 → 19` 교정 |
| 10–18 | **LX 보유 2023 25cm 항공**(남원 · 전주 · 익산 · 김제 도엽) | 카탈로그 footprint 안 | C01 → P3 산출 `pmtiles/imagery/ap25_2023_{sigungu}.pmtiles` |
| 11–17 | 남원 전역 2시점 | footprint 안 | A03 |
| 12–19(20) | 남원 AOI 4시점 1–2cm · 국산리 5cm · 본사 3.42cm · AXIS 1.36/2.95cm · 석면 3세트 | footprint 안 | A01 · A09 · B03 · B04 · B06 |
| 라벨 | xdworld Hybrid z6–19 | 토글 | A13 |
| 필지 | V-World 연속지적 WMS(키 갱신 후) **또는** 국토정보기본도 2.0 PMTiles(키 없이) | z15+ | E01 · C04 → P8 |
| 지형 | 로컬 terrain-namwon z9–13 → AWS Terrarium z≤15 → 본사 DSM · 용지 DSM terrarium(cm급) | 3D 장면 | A08 · E02 · B03 · C02 |
| 폐쇄망 폴백 | EOX s2cloudless-**2017**(CC BY) 한국 z0–10 로컬 PMTiles + A03/C01 + A11 경계 | 외부 호스트 실패 | MASTER-PLAN E3-3 |

**글로벌** (`global-map.md §1-8`)

| 줌 | 배경 | 오버레이 |
|---|---|---|
| 0–5 | GIBS TrueColor 어제 | Natural Earth 국경(`cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json`) · **LX 사업국 채색**(38개국 + 파키스탄, L5) · USGS `all_day.geojson` · GIBS 화재 `VIIRS_SNPP_Thermal_Anomalies_375m_All` |
| 5–9 | EOX `s2cloudless-2017`(CC BY — **수출본 기본값**) / `-2025`(비상업, 공공 시연만) | geoBoundaries KGZ ADM1/ADM2(`media.githubusercontent.com/.../geoBoundaries-KGZ-ADM{1,2}_simplified.geojson`) |
| 9–14 | PC Sentinel-2 L2A **월별 모자이크**(`/api/data/v1/mosaic/register` → searchid) · GIBS HLS 30m | WorldCover(`collection=esa-worldcover`) · NDVI 식(`expression=(B08-B04)/(B08+B04)&asset_as_band=true`) · Esri LULC 2017→2025(`exportImage&time=`) |
| 14–18 | PC S2 장면(10m) → **Maxar Open Data 0.5m**(미얀마만) | Overture buildings PMTiles(`overturemaps-extras-us-west-2…/tiles/2026-09-23.0/buildings.pmtiles`) · EMS 피해 점(사전 수집) |

라이선스 가드: 카탈로그 `license` 필드가 `CC-BY-NC*`(EOX 2018+ · Maxar)이면 `build=export`(수출 · 유상) 배포에서 게이트웨이가 그 항목을 목록에서 뺀다. 프론트가 아니라 **서버가 지키는 규칙**이다.

### 4.3 글로벌 시나리오 세 개 — 실데이터로만 채운다

| # | 무대 | AOI(bbox) | 실데이터 | 우리 AI가 하는 것 | 표기 |
|---|---|---|---|---|---|
| G-A | **키르기스스탄 추이 주 으슥아타 군** 농지(L2 농업부 AI 사업 시범지) | [74.70, 42.75, 75.20, 43.00] | WorldCover 통계 [실측: 초지 40.3 · **농경지 33.0** · 나지 12.6 %](비율만 유효) · S2 T43TEH/T43TDH 2025-03~10 구름 < 15 % 장면 107개 · geoBoundaries ADM2 `Ysyk-Ata` | ① 월별 모자이크 × WorldCover 40번 마스크 안 **평균 NDVI 곡선**(PC `statistics`, GPU 불필요) ② 농지 필지화: WorldCover 40 → `gdal_polygonize` → PMTiles ③ **작물 분류는 하지 않는다**: 공개 데이터에 작물 라벨이 없다. 카드 `gap`에 "L2 사업 학습데이터 필요" | 통계 = [실측 · PC API 응답 캐시일] |
| G-B | **비슈케크 · 소쿨룩** 시가지 확산(L1 연속지적 시범지) | 비슈케크 [74.45, 42.78, 74.72, 42.93] · 소쿨룩 [74.125, 42.43, 74.559, 43.241] | MS Global ML Buildings KGZ 70 쿼드키 → PMTiles · Overture 건물 · Esri LULC 2017 vs 2025 built · EOX 2017/2025 | **건물 세그 추론(C09 `E:\best.pt` 4클래스)을 S2 10m가 아니라 공개 고해상 영상에 돌리지 않는다.** 10m에서는 건물이 안 보인다. 대신 "2017년 농지 → 2025년 건물" 교차 집계(GeoParquet 조인)를 한다 | 조인 결과 = [실측], 모델 추론 없음 명시 |
| G-C | **미얀마 메이크틸라 지진**(EMSR798, 2025-03-28) | AOI11 ≈ [95.824, 20.856, 95.903, 20.918] | EMS GRA 피해 점 38개(Damaged 23 · Destroyed 4 · Possibly 11) · Maxar 사전 2025-02-07/03-06 · 사후 04-03 COG 0.5m · Overture 건물 | ① Maxar 사후 COG를 `/vsicurl/`로 읽어 **실제 GPU 추론**(C09 항공 4클래스 → 건물 윤곽). 한국 25cm로 학습한 모델이므로 **"도메인 이식 실험 · 시연"**으로 표기 ② 추론 건물 × EMS 점 최근접 조인(15m) → 등급 채색 ③ 사전·사후 S6 스와이프 | EMS 판독 = 출처 "© EU, Copernicus EMS"(우리 AI 아님) · 우리 추론 = [시연] |

이 세 시나리오가 사용자가 말한 "글로벌 사업도 같은 지도에서"를 증명한다. 동시에 "하지 않는 것"(작물 분류 · 10m 건물 추론)을 화면에 적어 정직성을 지킨다.

### 4.4 기관 · 에디션

글로벌 기관(예: 키르기스 토지자원청)도 `tenants.scope='global'`, `crs=4326`, `locale='ru'`인 **같은 테넌트 모델**이다. 포털 골격은 한 벌이고 CI만 바꾼다(`brand.js` R8). 데이터 거주(residency)가 요구되면 Phase 2에서 그 테넌트의 `tenants/{id}/` 접두어만 별도 버킷이나 국외 노드로 옮긴다. 경로가 곧 객체 키이므로 코드는 바꾸지 않는다.

---

## 5. 실시간 분석 프레임 — 작업 큐 + GPU 워커

### 5.1 흐름

```
XI맵에서 AOI 긋기 / 영상·카드 선택
  └▶ POST /jobs/quote     면적·shard 수·예상 GPU·s [추정]·할당 잔여 → 화면에 견적 카드(provenance 봉투)
  └▶ POST /jobs           승인(할당 통과) → jobs 행 + Redis XADD jobs:{pool}
        scheduler: AOI를 shard로 쪼갠다(1024 px 칩 · 20 % 겹침, car_v1/infer_orthomosaic.ipynb 방식)
                   → XADD shards:{pool} (priority, tenant 가중 공정 분배)
        gpu_worker(GPU별): XREADGROUP → rasterio window read(COG, 로컬 또는 /vsicurl/) → 배치 추론
                   → 칩 내 NMS → 폴리곤(원 CRS→4326) → COPY detections → XADD events:{job} shard.done
        cpu_worker: 모든 shard 완료 → 전역 NMS(겹침 경계) → PMTiles 스냅샷 → snapshot.ready
  └▶ SSE /events/jobs/{id} → job-theater: shard 격자 점등 · 스윕 · 결과 도착 · 숫자 현상
```

### 5.2 스케줄러 규칙 (`server/workers/scheduler.py`, `config/pools.yaml`)

| 규칙 | 내용 |
|---|---|
| **풀** | Phase 0: `pool:a6000`(GPU 0, 1). Phase 2: `pool:a100-n1` · `pool:a100-n2`(각 4장) + `pool:a6000`(개발 · 시연 전용). 모델마다 `models.perf`에 허용 풀을 적는다 |
| **우선순위** | P0 시연/대화형(영업 시연 · XI맵 "지금 돌려 보기") · P1 기관 배치 · P2 재학습 · P3 재추론 backfill. 시연 작업은 **shard 경계에서** 배치 작업을 선점한다(진행 중 칩은 끝낸다) |
| **공정 분배** | 기관별 가중치 = `quotas.gpu_s_month` 비율. 한 기관이 큐를 독점하지 못한다(deficit round-robin) |
| **VRAM 인지** | 워커는 `nvidia-smi --query-gpu=memory.free`를 읽고 배치 크기를 정한다. 조사 시점에 **장당 약 23GB가 이미 사용 중**이었으므로([실측] `env.md`) 여유 VRAM 기준으로 입장시킨다 |
| **모델 상주** | 워커당 VRAM LRU(예: OBB 118MB · YOLO11x-seg 125MB · SAM2-b 162MB). `deploys.gpu_pool` · `models.pin`으로 관리자가 상주를 고정한다(§9 ③) |
| **실패** | 워커 하트비트 10s. 30s 끊기면 `XAUTOCLAIM`으로 shard를 회수해 재할당. shard id `{job}:{row}:{col}`로 멱등 기록(중복 COPY 방지 = `ON CONFLICT DO NOTHING`) |
| **계량** | shard마다 `torch.cuda.Event` 경과 시간 + 벽시계 → `usage_events(dim='gpu_s_month', basis='measured')`. 견적(estimate)과 실측(measured)을 같은 표에 두고 관리자 화면에서 나란히 보여 준다. **견적 계수는 실측으로 보정한다**(`infra.js RATES.gpuHourPerKm2 0.9`의 근거를 대체) |

**왜 Celery나 Ray가 아닌가**: Celery는 GPU에 상주하는 모델 · shard 스트리밍 · 선점을 다루기 불편하다. Ray는 강력하지만 Windows 지원이 베타이고 Phase 0이 이 Windows PC다. Redis Streams + 자체 워커 약 600줄이면 Phase 0부터 Phase 2까지 같은 구조로 간다(Streams는 다중 노드 소비자 그룹을 그대로 지원한다). Phase 2에서 Ray Serve로 옮길 필요가 생기면 교체 지점은 `workers/` 한 폴더다.

### 5.3 job-theater — "실시간"이 눈에 보이는 방식

- **판**: AOI를 shard 격자(deck `PolygonLayer`, 헤어라인)로 먼저 깐다. 상태 세 가지: 대기(무채 점선) → 실행(청록 스캔 빔이 그 칸을 지난다. three 셰이더 또는 deck `SolidPolygonLayer` 알파 램프) → 완료(칸이 걷히고 그 칸의 결과 폴리곤이 S1 락온으로 도착).
- **숫자**: 좌상단 HUD `탐지 1,284 · shard 96/240 · GPU 0 71 % · 1.9 칩/s`. 모두 SSE 이벤트 값이며 **[실측 · 지금]** 봉투를 단다. GPU 사용률은 ops 수집기 값을 그대로 보낸다.
- **영업 시연 모드**(`demo:true`): 같은 파이프라인이 실제 GPU로 돈다. 다만 `detections` COPY와 `usage_events` 기록을 건너뛴다. 결과는 세션 메모리에만 있다. MASTER-PLAN Q4 ②의 "세션에 남지 않는 도착 연출"을 **가짜 애니메이션이 아니라 진짜 추론**으로 구현한다. 이것이 영업이 "돌아가는 것"을 보여 줄 때 설득력의 원천이다.
- **서버 부재 폴백**: `api.js`가 게이트웨이 연결 실패를 감지하면 이미 구운 결과(A02 등)를 스파이크 방식 S1로 재생하고 마스트에 `[시연 · 서버 연결 없음]`을 단다.

### 5.4 첫 번째 실추론 조합 (이 PC, Phase 0)

| # | 영상 | 모델 | 왜 첫 번째인가 | 산출 |
|---|---|---|---|---|
| J1 | B04 AXIS 익산 황등3,4지구 1.36cm(오버뷰 있음 → COG 변환이 쉽다) | B05 `car_v2_obb` mAP50 .992 | 추론 노트북이 이미 완성돼 있다(`infer_orthomosaic.ipynb`). 검수 라벨 2,462(자동차)가 있어 **정답 대비 실측 정확도**를 화면에 보일 수 있다 | `results/iksan-car-obb.pmtiles` + GT 비교 |
| J2 | C01 25cm 남원 도엽(P3) | C09 `E:\best.pt` 4클래스 | 남원 비닐하우스 27,676건 결과가 이 PC에 없다. 이 공백을 **실제 재추론**으로 메운다 | `results/namwon-landcover-2023.pmtiles` |
| J3 | B03 LX 본사 3.42cm | B05 차량 OBB + D11 SAM2 | 메인 히어로 3D 트윈과 같은 장소 → 필름 → XI맵 인계의 착지점 | `results/hq-*.pmtiles` |
| J4 | B06 의성 · 구미 · 군산 석면 세트 | (석면 모델 없음) → D05 대구경북 6클래스 학습 후보 | 라벨 751건이 짝으로 있어 **학습 → 배포 → 추론**의 전 주기를 한 번 보여 줄 수 있다 | Phase 1 |
| J5 | Maxar 메이크틸라 사후 COG(`/vsicurl/`) | C09 | 글로벌 시연(G-C) | [시연] |

처리량은 아직 한 번도 재지 않았다. `server/bench/throughput.py`가 모델 × GPU(A6000)마다 칩/s를 재서 `models.perf`에 쓰는 것이 Phase 0의 첫 작업이다. 화면의 "예상 소요"는 이 실측값에서만 나온다.

---

## 6. 데이터 파이프라인

### 6.1 저장 배치 (`E:/landxi-data/`, E: 여유 2,085GB [실측])

```
E:/landxi-data/
  raw/            원본 링크(심볼릭/경로 목록만). 게이트웨이 라우트 없음 = 반출 불가(R7)
  cog/            WEBP COG, GoogleMapsCompatible (TiTiler 입력 · 추론 입력)
  pmtiles/
    basemap/      korea_s2c2017_z0-10.pmtiles (폐쇄망), kgz_*.pmtiles
    imagery/      namwon_2504.pmtiles …(A01·A03·A09·A10 재포장), ap25_2023_*.pmtiles(C01), hq_2204.pmtiles(B03)
    reference/    river_vt(A05 그대로), river_occupancy.pmtiles(B02), parcels_namwon.pmtiles(C04), dronemap_idx.pmtiles(B07)
    results/{tenant}/{job}.pmtiles
  parquet/        결과·참조 GeoParquet(교환·보관)
  cache/          vworld/ pc/ gibs/ ems/ firms/  (프록시 디스크 캐시)
  models/         {family}/{version}/weights.pt + card.json(sha256)
  tenants/{id}/   uploads/ exports/  (기관 격리 · 쿼터 계량 대상)
  _tmp/           CPL_TMPDIR (C: 여유 124GB뿐 [실측])
```

### 6.2 배치 목록 — 전부 멱등 스크립트 · 산출물은 카탈로그에 자동 등록

| ID | 입력 | 명령(요지) | 산출 | 소요(ledger 추정) |
|---|---|---|---|---|
| P1 | A01–A10 XYZ 12세트 6,822파일 | XYZ → MBTiles → `pmtiles convert`(go-pmtiles 설치) | `pmtiles/imagery/*.pmtiles` 12개 | 0.5일 |
| P3 | C01 전북비도시 남원 도엽 | `gdalbuildvrt -a_srs EPSG:5186`(TFW에 CRS 태그 없음) → `gdal raster tile` WEBP z10–18 → MBTiles → PMTiles | `ap25_2023_namwon.pmtiles` + COG | 0.5–1일 |
| P4 | P3 × C09 | **job J2**(파이프라인이 아니라 작업 큐로 돌린다 — 같은 경로를 검증) | `results/lx/namwon-landcover-2023` | GPU [측정 과제] |
| P5 | B09 125 전라 남원 도엽 칩 483 + META | 칩 지오레퍼런싱 → merge → 3857 | `reference/namwon_lc_gt_2019.pmtiles` | 0.5일 |
| P6 | B01 5종 run 폴더 | `results.csv` · PR · confusion · val_pred 복사 → `models` 행 등록(metrics=원문) | registry 5행 | 0.5일 |
| P8 | C04 국토정보기본도 2.0 남원 | `ogr2ogr -t_srs EPSG:4326 -f PMTiles -dsco MINZOOM=12 -dsco MAXZOOM=17` | `parcels_namwon.pmtiles`(PNU · 지목 · 공시지가) — **V-World 키 없이 필지 카드** | 0.5일 |
| P9 | E01 | 게이트웨이 `proxy/vworld` + 디스크 캐시 | – | 0.5일(+키 발급) |
| P10 | A02 · A04 · P4 × A11 | geopandas sjoin | 읍면동 집계 → `stats` 테이블 | 0.5일 |
| P13 | B02 GPKG 252 시군구 20GB | ogr2ogr 4326 → 건물 PMTiles z10–16(tippecanoe WSL) + 시군구 집계 | `river_occupancy.pmtiles` + 단계구분도 | 1일 |
| P14 | B03 본사 정사 · DSM · OBJ | 정사 → COG/PMTiles z15–22 · DSM → terrarium(rasterio) · OBJ → GLB(`obj2gltf`) | 히어로 트윈 | 1일 |
| P15 | B04 AXIS 2장 + `axis.db` 라벨 | COG 변환 · 픽셀 → 5186 → 4326 | COG 2 + GT GeoJSON(J1 비교용) | 0.5일 |
| G1 | geoBoundaries KGZ ADM0–2 | 다운로드 → 정적 | `kgz-adm{0,1,2}.geojson` | 0.1일 |
| G2 | PC `statistics`(WorldCover · 월별 NDVI) | 크론 → `cache/pc/ysykata-*.json` | G-A 차트 원천 | 0.5일 |
| G3 | MS Buildings KGZ 70 쿼드키 | csv.gz 병합 → tippecanoe | `kgz-buildings.pmtiles` | 0.5일 |
| G4 | EMS EMSR798 AOI04 · AOI11 GRA ZIP | 추출 → `builtUpP` GeoJSON | `mm-emsr798-*.geojson` | 0.2일 |
| G5 | Maxar 메이크틸라 사전 · 사후 visual COG | (선택) PMTiles z12–18 사전 굽기 또는 `/vsicurl/` 동적 | 스와이프 원천 | 0.5일 |
| G6 | FIRMS 24h CSV(키 없음) · EMS 목록 | 1시간 크론 → 정적 JSON | 글로브 live 층 | 0.2일 |

**설치할 도구 네 가지**(`env.md`): go-pmtiles 단일 exe · WSL `apt install tippecanoe` · Node `obj2gltf` · (선택) PDAL. ECW(C05 · C07)는 QGIS 3.28.3으로 GeoTIFF 변환한 뒤 들어온다.

### 6.3 재추론 파이프라인 — "능동 운영"(`ops.js`)을 실제 작업으로

모델 v(n+1)이 registry에 `staging`으로 올라오면 다음 순서로 돈다.
1. `deploy`가 그 카드를 쓰는 배포본마다 **shadow 재추론 작업**(P3 우선순위)을 자동 제출한다.
2. 결과는 `detections`의 별도 job으로 쌓인다. 기관에는 보이지 않는다.
3. `cpu_worker`가 v(n) 대비 **diff 레이어**를 만든다(추가 · 소멸 · 변경 필지, IoU 기준 `THRESHOLDS.iou 0.70`).
4. 관리자 배포 제어 화면(§8)에서 diff를 S6 스와이프로 검토하고 canary → GA로 올린다.

`ops.js`의 `actionsFor()` 규칙(신뢰도 0.60 · IoU 0.70 · 365일 · 표본 100)이 이제 상수 판정이 아니라 **이 작업들의 실측 결과**로 발화한다.

---

## 7. 테넌트 · 할당(쿼터) · 격리

### 7.1 할당 차원과 초과 정책 (`config/quotas.yaml`, 관리자에서 편집)

| 차원 | 계량 지점 | 초과 시 기본 정책 |
|---|---|---|
| `storage_gb` | `tenants/{id}/` + 그 기관 결과 PMTiles 합(일 1회 `du` + 쓰기 시 증분) | soft: 경고 · hard: 업로드 거부 |
| `gpu_s_month` | 워커 계량(§5.2) | soft: P1 → **P3 저우선 큐로 강등**(멈추지 않는다) · hard: 제출 거부 + 사유 한 줄 |
| `area_km2_month` | 제출 AOI 면적(견적 단계에서 선차감) | hard: 견적 단계에서 거부 |
| `concurrent_jobs` | 실행 중 jobs 수 | 대기열에서 순번 대기 |
| `egress_gb_month` | 게이트웨이 타일 응답 바이트(기관 서명 URL 기준) | soft: 알림 |
| `vworld_calls_day` | 프록시 계량 — **V-World 일일 한도는 LX 키 하나를 모두가 나눠 쓴다** | 캐시 우선 · 한도 80 %에서 경보 |

견적은 `infra.js`의 계수를 그대로 서버로 옮긴 것이다(`RATES` · `COVER_RATIO`). 그래서 기존 생산 관리 `인프라` 탭의 `costOfNewRegion()`이 서버 응답이 되고, 영업 · 계약의 근거가 된다. 모든 견적 값은 `basis:'estimate'`로 표시한다. 실사용이 쌓이면 관리자 화면에 "견적 대비 실측 ±%"를 함께 보인다.

### 7.2 격리 층위 — 다섯 겹

1. **세션**: `realm=lx|tenant` 쿠키가 따로다. LX 셸 라우트는 `realm=lx`만, `/api/v1/t/{tenant}/*`는 realm=tenant이면서 id가 일치할 때만 연다(MASTER-PLAN Q1 ②와 §7.2 판정표를 서버로 옮긴 것).
2. **DB**: RLS(§3.4).
3. **파일**: `tenants/{id}/` 접두어. 게이트웨이의 파일 해석기가 세션 tenant 접두어 밖 경로를 거부한다.
4. **타일**: 기관 결과 PMTiles는 HMAC 서명 URL(`?exp=&sig=`, 10분)로만 연다. 공용 참조 레이어(하천 A05 등)만 무서명이다.
5. **원본**: `imagery.tier='raw'` 행에는 서빙 라우트가 없다. COG 동적 타일은 `realm=lx`에만 연다. 기관에는 구운 `tile` 등급만 간다(R7).

---

## 8. 모듈형 AI 서비스 배포 제어

`cards.js`의 세 겹(MODULES → CARDS → DEPLOYS)을 DB의 정식 기록으로 올린다(§3.4). 화면은 레지스트리만 읽는다는 규칙(R5)은 그대로다. 달라지는 것은 읽는 대상이 JS 상수가 아니라 API라는 점뿐이다.

| 기능 | 동작 | 기록 |
|---|---|---|
| **조립** | 카드 버전 = 모델 id 목록 + 공통 7 + 전용 모듈(owner lx/local) + kind 선언 | `card_versions` |
| **버전** | semver. major = 결과 스키마 변경(기관 확인 필요) · minor = 모델 교체 · patch = 임계값 | `registry.updateState` 규칙 이관 |
| **단계 배포** | `draft → shadow`(LX 표본 AOI 재추론, §6.3) → `canary`(기관 1곳) → `ga`(나머지). 배포본마다 `pinned`면 자동 갱신을 받지 않는다 | `deploys.stage` |
| **롤백** | `rollback`은 배포본의 `card_version_id`를 직전 버전으로 되돌린다. 그 버전의 결과 스냅샷 PMTiles가 남아 있으므로 **즉시**다(재추론 불필요) | `approvals` + `audit_log` |
| **모델 교체** | 새 모델 → 새 minor 카드 버전 → 위 단계 | – |
| **이식** | 새 테넌트 + 지역 프로파일 + 배포본 한 줄. 라벨 · 모델 사본은 따라가고 영상은 현지 확보(R3 · R7). `transplantAssets()`가 서버 응답이 된다 | `deploys` |
| **GPU 배치** | 배포본 → 풀 지정(`gpu_pool`), 모델 → 상주 고정 | §9 ③ |
| **승인** | GA 전환 · 롤백 · 이식은 관리자 승인 1건 필수. 승인 화면은 **계보 띠 + 그 기관 카드 덱 미리보기**(MASTER-PLAN Q3 ①) | `approvals` |
| **계보** | `GET /registry/lineage/{any}` → 데이터셋 → 학습 run(results.csv) → 모델 → 카드 버전 → 배포본 → 기관 → 결과 job | lineage.js |

---

## 9. 관리자 = 인프라 관제실 (`:8702`, 잉크 반전 "다른 집")

관리자 사이트는 별도 origin(포트 · 호스트명 `ops.`)으로 세운다. LX 직원 쿠키로는 열리지 않고 IP 허용 목록 안에서만 연다. 디자인은 MASTER-PLAN Q3 ①(잉크 바탕 명도 반전 · `LX/OPS` 마크)을 따른다. 아래는 화면별 데이터 계약이다.

| # | 화면 | 보이는 것(전부 실측 · 측정 시각 표기) | 데이터 원천 | 제어 |
|---|---|---|---|---|
| ① | **관제 판**(첫 화면) | 노드 카드(호스트 · GPU별 사용률 · VRAM · 온도 · 전력) · 큐 깊이 · 실행 중 job을 **전국/세계 지도 위 AOI 점**으로(S1 도착) · 최근 경보 | nvidia-smi 수집기(Phase 0 경로: `C:\Windows\System32\DriverStore\FileRepository\nv_dispui.inf_amd64_f2b06cc19dadc00f\nvidia-smi.exe --query-gpu=... -lms 2000` [실측 경로]) → Prometheus · Redis `XINFO` · `jobs` | – |
| ② | **작업 대기열** | 풀별 · 기관별 · 우선순위별 대기/실행, 대기 시간 p50/p95 | Redis Streams + `jobs` | 취소 · 재큐 · 우선순위 변경 · 선점 |
| ③ | **모델 배치** | GPU × 모델 상주 행렬(VRAM 막대), 모델별 처리량(bench 실측) | 워커 하트비트(`resident_models`) · `models.perf` | 상주 고정/해제 · 풀 이동 |
| ④ | **스토리지** | 볼륨(E: · D: → Phase 2 MinIO) 여유 · 등급별(raw/tile/result) · 기관별 사용 | `du` 일 1회 + 쓰기 증분 · `imagery` | 보존 정책(시점 수 `keepEpochs`) |
| ⑤ | **기관 · 할당** | 기관 표: 차원별 사용/한도 막대 · 초과 정책 · 견적 대비 실측 | `quotas` · `usage_events` | 한도 · 정책 편집(승인 기록) |
| ⑥ | **배포 제어** | 카드 버전 × 기관 행렬(stage 색) · 승인 대기 · shadow diff | `card_versions` · `deploys` · `approvals` | 단계 전환 · 롤백 · 승인 |
| ⑦ | **경보** | 활성 · 확인 · 해소 | Alertmanager → `ops_alerts` | 확인(ack) · 규칙 편집 |
| ⑧ | **노드 등록** | 가입 토큰 발급 → 새 노드 `workers/join.py --token` → `nodes` 행 | – | 풀 지정 · 격리(drain) |

**경보 규칙(초기, `config/alerts.yaml`)**: GPU 온도 > 85 °C 5분 · VRAM > 95 % 5분 · 워커 하트비트 30s 누락 · 큐 대기 p95 > 10분 · E: 여유 < 200GB · V-World 일일 호출 80 % · PC API 오류율 > 10 %(15분) · job 실패율 > 5 %(1시간) · 백업 실패. 임계값은 [목표]이며 Phase 0 운영 2주 뒤 실측 분포로 조정한다.

**`infra.js` 교정**: `CAPACITY`(`gpuCards: 4` "시연 값")는 `nodes` 테이블의 실제 등록 장비로 대체한다. Phase 0에서는 A6000 48GB × 2가 등록되고, A100 노드는 등록되는 순간 용량 계산에 들어간다. 생산 관리의 `인프라` 탭과 관리자 ⑤는 같은 API를 읽는다.

---

## 10. 관측(Observability)

- **메트릭**: Phase 0 = `prometheus-client`(게이트웨이 · 워커 내장 `/metrics`) + nvidia-smi 폴러(2s) + `windows_exporter`. Phase 2 = NVIDIA **DCGM exporter**(Linux) + node_exporter.
- **로그**: JSON 줄 로그, `job_id` · `tenant_id` · `shard_id` 상관 키. Phase 2에서 Loki.
- **추적**: 요청 → job → shard를 `trace_id` 하나로 잇는다(OpenTelemetry, Phase 1).
- **관리자 UI는 Grafana를 끼워 넣지 않는다.** 게이트웨이가 PromQL을 대리 질의해(`/api/v1/ops/*`) 우리 디자인 문법(헤어라인 · 데이터 잉크 차트)으로 그린다. 운영팀용 Grafana는 내부에만 둔다.

---

## 11. 보안

| 위협 | 지금 | 조치 |
|---|---|---|
| 키 노출 | `serve.mjs`가 VWORLD_KEY를 `env.js`로 브라우저에 평문 주입 · `jeju_breath/app.py`에 키 하드코딩 · `deploy-lx/out/vworld-key.txt` 존재(e-projects) | 키는 `server/.env`에만 둔다. 프록시가 주입한다. `env.js` 경로는 운영 빌드에서 404. 저장소 전체 키 스캔(gitleaks) · jeju_breath 재사용 시 env 이관 |
| 기관 간 누출 | 브라우저 관문뿐(Q1 이후 `lx_tenant_session`) | §7.2 다섯 겹 |
| 원본 반출 | 공유 모달이 R7 위반(감사 dataset) | 원본 서빙 라우트 0 · 내보내기는 `export_policy` 검사 |
| 관리자 탈취 | 같은 origin | 별도 origin :8702 · IP 허용 · 세션 짧게(30분) · 승인 2인 규칙(GA · 롤백 · 한도 상향) |
| 라이선스 위반 | EOX 2018+ · Maxar는 비상업 | 카탈로그 `license` → export 빌드에서 서버가 제외 |
| 외부 API 장애 | PC 무SLA · V-World 만료 | 프록시 캐시 재생 · 폐쇄망 폴백 사다리 · 경보 |
| 웹 기본 | – | CSP(`script-src 'self'` — 벤더링이라 가능) · SameSite=strict 쿠키 · CSRF 토큰 · 감사 로그 전 쓰기 작업 |

---

## 12. 단계적 구축

### Phase 0 — 이 PC에서 도는 최소 백엔드 (수직 절단 1개, 약 2주)

**완료 정의(이것이 영상으로 판정받을 장면이다)**: 1440×900 동작 영상 90초 한 편.
1. (LX 직원) XI맵 글로브 → 한국 → 익산 황등으로 카메라가 내려간다(B04 1.36cm가 xdworld 위로 걷혀 나온다).
2. AOI를 긋는다 → 견적 카드(면적 · shard 수 · GPU·s [추정] · 할당 잔여) → 실행.
3. shard 격자가 켜지고 **실제 A6000 두 장**이 차량 OBB를 돌린다. 칸마다 결과가 도착하고, HUD의 탐지 수와 칩/s가 실측으로 오른다.
4. 완료 → 검수 라벨 2,462(GT)와 S6 스와이프 → "정답 대비 일치 n %" [실측].
5. 화면을 반으로 나눠 관리자 관제 판(:8702)을 보인다. 같은 시각 GPU 0/1 사용률 막대가 올라갔다 내려오고, 대기열이 비고, 남원시(시연 기관) 할당 막대가 줄어든 것이 보인다.

세 사용자 관점 판정표: **LX 직원**(내가 그은 영역이 내 GPU로 지금 돈다) · **공무원**(결과가 필지 · 건물 단위로 지도에 서고 출처가 붙는다) · **시민**(위성에서 동네로 내려오는 카메라 + 결과가 쏟아지는 순간).

구축 목록(Phase 0):

| 순서 | 작업 | 파일 |
|---|---|---|
| 0-1 | Docker로 Redis :6380 · PostGIS :5433 기동(cleanriver와 분리) | `server/docker-compose.phase0.yml` |
| 0-2 | `landxi-srv` env · 마이그레이션 · 시드(tenants: lx · namwon · gwangju-jeonnam / cards · deploys: `cards.js` 이관 스크립트) | `server/migrations/0001_init.sql` · `server/pipelines/seed_from_cards_js.py` |
| 0-3 | 게이트웨이 최소 라우트: auth · catalog · tiles(pmtiles) · jobs · events · ops(gpus · queues) | `server/landxi_api/*` |
| 0-4 | gpu_worker(yolo_obb 어댑터) · scheduler · bench | `server/workers/*` |
| 0-5 | P1(PMTiles 재포장) · P15(AXIS COG + GT) · nvidia-smi 폴러 | `server/pipelines/*` |
| 0-6 | 엔진: `lx-map.js` · `api.js` · `job-theater.js`(스파이크 arrive 승격) · `tier.js` | `landxi/engine/*` |
| 0-7 | serve.mjs 역프록시 20줄(`/api` `/tiles` `/events` → :8700) | `tools/serve.mjs` |
| 0-8 | 관리자 ① 관제 판 최소판 | `landxi/ops/index.html`(새 origin 루트) |
| 0-9 | T2 iGPU 성능 측정 1회(사무용 노트북, Tailscale로 이 PC에 접속) | `shots/phase0/perf-igpu.json` |
| 0-10 | 동작 영상 녹화(Playwright `recordVideo`, 영상 생성 크레딧 0) → SendUserFile | `shots/phase0/slice.webm` |

### Phase 1 — 이 PC를 단일 노드 운영기로 (약 4–6주)

- 수직 절단을 넓힌다: J2(C09 × C01 남원 재추론) · J3(본사 트윈) · 글로벌 G-A · G-C · V-World 프록시(키 갱신 시) · 필지 P8.
- nginx(`nginx:alpine` 이미지 있음)가 정적 · 역프록시 · TLS를 맡는다. 외부 시연은 cloudflared 터널을 쓴다(80/443은 cleanriver가 쓰므로 별도 호스트명).
- 관리자 ②–⑧ 화면 · 경보 · 쿼터 집행 · 배포 제어(shadow · canary · rollback).
- 기관 포털이 API를 읽는다(`portal-gen.mjs` 산출 화면의 데이터 소스를 JS 상수에서 `/api/v1/t/{tenant}/*`로).
- 워커를 WSL2 Ubuntu 26.04(GPU 패스스루)로 옮길지 검토한다. Phase 2 리눅스 클러스터와 이미지를 맞추려는 것이다. **리스크**: 드라이버 522.06(구버전)은 WSL CUDA 12 이미지와 맞지 않을 수 있다. 드라이버 갱신은 사용자 승인을 받는다.
- 백업: `pg_dump` 일 1회 + `E:/landxi-data/pmtiles`는 D:로 주 1회 동기화(D: 여유 363GB [실측]이므로 결과 · 메타만).

### Phase 2 — A100×4 서버 2대 붙이기 (장비 도착 시)

| 역할 | 배치 |
|---|---|
| 제어 평면(게이트웨이 · Postgres · Redis · Prometheus · MinIO 메타) | 별도 VM 또는 현 Threadripper(512GB). **GPU 노드에 상태를 두지 않는다** |
| GPU 노드 n1 · n2 | 각 A100 × 4. k3s 에이전트 + NVIDIA device plugin. **MIG**로 작은 모델(OBB 118MB · n-seg)을 슬라이스에 나눠 태우고, x-seg · SAM2 · 재학습은 풀 GPU에 태운다. 풀 `a100-n1` · `a100-n2` 등록은 §9 ⑧ 가입 토큰으로 |
| 개발 · 시연 노드 | 현 PC A6000 × 2 = `pool:a6000`(P0 시연은 여기 고정 → 운영 배치와 간섭 없음) |
| 저장 | MinIO(S3 API) on NVMe. 경로가 곧 객체 키이므로(§6.1) 코드 변경은 저장 어댑터 하나. 원본(raw)은 여전히 LX 내부 NAS에 두고 MinIO에는 COG · PMTiles · 결과만 |
| 네트워크 | 노드 간 25GbE 이상 [목표] — COG window read가 네트워크를 타기 때문이다 |
| 오케스트레이션 | Phase 0/1 compose 파일을 k3s 매니페스트로 옮긴다(Helm 차트 `server/deploy/helm/`). 스케줄러 · 워커 코드는 그대로 |

**단계 사이에 바뀌지 않는 것**: API 경로 · DB 스키마 · Redis 스트림 이름 · 저장 키 · 프론트 코드 전부. 이것이 "처음부터 다중 노드로 확장 가능한 구조"(메모리 `landxi-ximap-core` 인프라 항목)의 실체다.

### 서버 성능 예산 [목표 — Phase 0 운영 2주 뒤 실측으로 교체]

| 항목 | 목표 |
|---|---|
| API p95(카탈로그 · 결과 bbox 조회) | ≤ 150ms(LAN) |
| PMTiles 타일 p95(로컬 디스크) | ≤ 80ms |
| 시연 작업(P0) 첫 shard 결과까지 | ≤ 5s(AOI ≤ 0.25km², 모델 상주 상태) |
| SSE 이벤트 지연 | ≤ 500ms |
| 결과 스냅샷(PMTiles) 생성 | 10만 피처 ≤ 60s |
| 게이트웨이 동시 세션 | Phase 1 ≥ 200 · Phase 2 ≥ 2,000(cleanriver 운영 동접 2,000~4,000 대기열 경험 참고) |

---

## 13. 디자인 법전(`design/system.md`) 재작성에 대한 아키텍처 쪽 제안

사용자 지시 6("인쇄물식 제약이 WebGL 감각을 막았다 — 재작성 대상, 단 과거 확정 선호는 존중하고 근거를 댈 것")에 대해 시스템 관점에서 바꿀 것과 지킬 것을 적는다.

| 조항(현재) | 제안 | 근거 |
|---|---|---|
| §4 "유휴 움직이는 요소 화면당 1개" | **개수 규칙 → 예산 규칙**: "유휴 애니메이션은 T1에서 GPU 프레임 예산 2ms 이내, T2에서 1ms 이내. 모든 움직임은 실데이터 이벤트(SSE · 계측)에 묶인다" | job-theater는 shard 수만큼 동시에 움직인다. 개수로 막으면 실시간 분석을 보일 수 없다. 대신 성능과 정직성으로 묶는다 |
| §2 "그림자 · 깊이 금지" | **지도 판 안(WebGL 캔버스)에서는 해제**: 지형 음영 · fill-extrusion · 대기 · 빛 허용. HTML 패널(문서 층)의 그림자 0 · 라운드 0은 유지 | 흰 바탕 에디토리얼(사용자 확정)은 문서 층이다. 깊이는 지도 층의 일이다. 두 층을 나누면 둘 다 산다 |
| MASTER-PLAN D22 "3D 보류" | **T1에서 결과 3D 압출 모드를 허용(기본 OFF · pitch ≤ 60)**. S4 인계는 2D 유지 | 8/25 핵심 서사("결과가 지도 위에 입체로 겹친다")가 사용자 원 요구다. 성능 절벽은 지형 하나뿐이다(`stack.md` [실측]) |
| §1 서체 · §2 흰 바탕 · 청록 = AI 결과 · 앰버 380ms | **유지** | 사용자 확정(T3 · Paperlogy + Pretendard · 흰 바탕) |
| 관리자 사이트 | 잉크 반전 유지 + **데이터 잉크 차트 · 실측 시각 표기 필수** | Q3 ① |

---

## 14. 콘티 원칙을 시스템이 지키는 방법

1. **봉투 강제**: 서버 직렬화기가 숫자 필드에 `basis`가 없으면 500을 낸다(개발 모드). 프론트 `provenance.js`는 봉투 없는 숫자를 그리지 않는다.
2. **시연은 스스로 밝힌다**: `demo:true` 작업 · 서버 부재 폴백 · 도메인 이식 실험(G-C)은 응답 자체에 `basis:'demo'`가 들어간다.
3. **견적과 실측을 한 화면에**: 쿼터 · 인프라 · 소요 시간은 `estimate`와 `measured`를 나란히 두고, 차이를 숨기지 않는다.
4. **지어낸 운영 서사 0**: 관제 화면의 모든 행은 `nodes` · `jobs` · `ops_alerts` 실제 행이다. 담당자명 · 활동 기록 · KPI 추세를 만들 필드가 스키마에 아예 없다. 추세는 실제 `usage_events`가 쌓인 기간만큼만 그린다.
5. **하지 않는 것을 적는다**: 카드 `gap`(작물 분류 · 10m 건물 · 인파 좌표 없음)은 API가 내려주고 화면이 반드시 표시한다.

---

## 15. 리스크와 열린 결정

| # | 리스크/결정 | 영향 | 제안 |
|---|---|---|---|
| R1 | 처리량 미측정 — "실시간"의 속도가 실제로 얼마인지 모른다 | 영상 판정에서 느리면 역효과 | Phase 0 첫 작업 = bench. 느리면 시연 AOI를 줄이고 모델을 n/m 크기로 바꾼다(정직하게 표기) |
| R2 | GPU를 이미 다른 프로세스가 장당 약 23GB 쓰고 있다 [실측] | VRAM 부족 · 추론 실패 | 스케줄러 VRAM 인지 입장 · 관리자 ③에서 점유 프로세스를 보인다 |
| R3 | Windows에서 서비스 상주(게이트웨이 · 워커) | 재부팅 시 중단 | NSSM 서비스 등록 또는 Docker Desktop 자동 기동. Phase 1 WSL 이관 검토 |
| R4 | V-World 키 만료(E01) | 연속지적 · 검색 불가 | C04 PMTiles로 필지는 키 없이 해결 · 검색은 로컬 읍면동 → 키 갱신 후 프록시 |
| R5 | Planetary Computer 무SLA | 글로벌 시연 중 실패 | 프록시 캐시 + G2 사전 수집 · Phase 2 자체 TiTiler(S2 COG는 Azure blob, SAS 필요) |
| R6 | 라이선스(EOX 2018+ · Maxar 비상업) | 수출 · 유상 서비스 위반 | 카탈로그 서버 가드(§4.2) |
| R7 | 백엔드 도입이 기존 정적 프로토(e2e 573건)를 깨뜨림 | 회귀 | `api.js` 폴백으로 서버 없이도 기존 동작 유지 · e2e는 `LX_API=off`(기존)와 `on`(신규) 두 프로젝트로 |
| R8 | 드라이버 522.06 · CUDA 11.8 고정 | 최신 torch · WSL CUDA 12 불가 | Phase 1 드라이버 갱신은 **사용자 승인 후**(다른 업무 영향) |
| D1 | 관리자 origin을 포트로 가를지 호스트명으로 가를지 | – | Phase 0 포트(:8702), Phase 1 `ops.` 호스트명 + 터널 |
| D2 | 시연 기관 계정(남원 · 광주전남)의 할당 초기값 | 관제 화면 숫자 | `infra.js resourcesOf()` 견적의 1.5배로 시작하고 `[추정 기반 초기값]`으로 표기 |
| D3 | 결과 정본을 PostGIS로 옮길 때 기존 `results.js` 수치(2,098 · 1,674 등)와의 일치 | 콘티 정합 | 시드 스크립트가 GeoJSON을 그대로 적재하고 `countCheck()`를 서버 unit 테스트로 이식 — 건수가 1건이라도 다르면 실패 |

---

## 부록 A. 새로 생기는 파일 한눈에

```
server/                                  (신규 — FastAPI 게이트웨이 · 워커 · 파이프라인)
  docker-compose.phase0.yml              Redis :6380 · PostGIS :5433 · Prometheus :9090
  landxi_api/{main,auth,catalog,tiles,proxy,jobs,results,registry,deploy,quota,ops}/
  workers/{scheduler,gpu_worker,cpu_worker,join}.py · workers/adapters/*.py
  pipelines/{P1_pmtiles,P3_ap25,P5_lc_gt,P6_models,P8_parcels,P10_stats,P13_river,P14_hq,P15_axis,G1..G6,seed_from_cards_js}.py
  bench/throughput.py
  migrations/0001_init.sql
  config/{pools,quotas,sources,alerts}.yaml
landxi/engine/                           (신규 — 공통 지도 엔진)
  lx-map.js sources.js tier.js api.js
  fx/{arrive,timescrub,swipe,job-theater,provenance,lineage}.js
  i18n/{ko,en,ru}.json
landxi/ops/                              (신규 — 관리자 관제 origin 루트)
landxi/proto/vendor/{deck.gl@9.3.10,three@0.185.1,pmtiles@4.5.0,gsap@3.15.0,lenis@1.3.26,h3-js@4}/
tools/serve.mjs                          (+ /api /tiles /events 역프록시 20줄)
E:/landxi-data/                          (저장소 밖 — 데이터 평면)
```

## 부록 B. 자산 ID → 이 설계에서 쓰이는 자리

| 자산 | 자리 |
|---|---|
| A01 · A03 · A09 · A10 | P1 PMTiles · 국내 사다리 · S3 스크럽 |
| A02 · A04 | 시드 결과(정본 이관) · P10 집계 · countCheck |
| A05 · B02 · B07 | reference PMTiles · 대시보드 · 전국 뷰 |
| A06 · A07 | 해양 배포본 결과 시드 |
| A08 · E02 · B03 · C02 | 지형 사다리 · 히어로 트윈(P14) |
| A11 | 경계 · 집계 · 폐쇄망 폴백 |
| A13 · E01 | 배경 · V-World 프록시 |
| B01 · D01–D05 | registry 모델 · 계보 · bench |
| B04 · B05 | **Phase 0 수직 절단 J1** |
| B06 · D05 | J4 학습→배포 전 주기(Phase 1) |
| B09 · B10 | GT 레이어 · 추론 대비 스와이프 |
| C01 · C09 | J2 남원 25cm 재추론(27,676 결손 대체) |
| C04 | 키 없는 필지 카드(P8) |
| D10 AXIS-Label | 라벨링 백엔드 후보(FastAPI+SQLite) — 게이트웨이와 같은 스택이라 Phase 1에서 `feedback → 라벨링 큐` 연결 |
| D11 | SAM2 · YOLO-World 어댑터(대화형 보조) |
| 글로벌 URL(§4.2 · §4.3) | G-A 으슥아타 · G-B 비슈케크 · 소쿨룩 · G-C 메이크틸라 |
