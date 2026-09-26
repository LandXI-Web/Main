# F1-A — XI맵 운영판 프론트 (남원 전역 25cm 도착 → cm 하강 → 프레임 → 열람)

- 모델 **Opus 5.5** · 난이도 XL · 기간 8–10일 [추정] · 판정 Fable 5.1(Craft · 영상)
- 읽을 것(순서): ① `blueprint/F1-CONTRACT.md` 전문 ② `design/system-v2.md` 전문 ③ `blueprint/LANDXI-HYPER-BLUEPRINT.md` §0·§1·§3·§6·§7(v1.1 표식 있는 곳 우선) ④ `docs/superpowers/audit-0923/wave0/E0-S-result.md`(실측 합격 스파이크 — 승격 대상) ⑤ `recon-0924/pipeline-run.md`(P3·P4 산출) ⑥ `02. 데이터/manifest.json`
- 공통 규칙: `wave0/00-COMMON.md` 절대 규칙 1–5·8 유지(**git 금지 · 소유 밖 수정 0 · 영상 크레딧 0 · 서버 4173 끄지 말 것**). 법전은 v2(`system-v2.md`)로 바뀐다 — v1 §4 "이징 하나·지속 넷"은 폐기.

## 목표

**하나의 XI맵 페이지 `landxi/xi/index.html`**을 운영 수준으로 끝까지 만든다. 글로브에서 남원으로 내려오면 2023 25cm 항공(P3) 위에 P4 재추론 129,420 폴리곤이 스캔 스윕으로 도착하고, 읍면동 집계가 붙고, 드론 AOI로 cm 하강하면 그 안의 실제 결과(5필지 · 변화 456)가 도착하며, 프레임을 그리면 견적 → 실행 → shard 도착이 **SSE(on) 또는 리플레이(off)**로 판 위에서 돈다. 공무원·시민·LX 직원이 각자의 첫 15초에 "우와" 해야 한다. 정적 카드 그리드 · `setInterval` 진행률 · 봉투 없는 숫자 = 불합격.

## 근거 발견
- X1(설계서 §10.0): A02 2,098 중 A01 AOI 안 **5건**, 비닐하우스 0건 → 도착은 시 전역, cm는 AOI 안 실제 결과로(R1).
- E0-S 실측: 도착 4.0s · p95 16.8ms · 락온 380 = 180/80/120 · 타일 페이드 500 · 캔버스 96.2% — 이 값을 `fx/`로 승격한다. `ximap-signature.js:285 arrive()` `:333 sweepFrame()` `CAM_EASE`(해상도 공간 이징)는 **읽고 옮긴다**(import 아님 · 파일 복사 후 개작 · 출처 주석).
- 사용자 결정: 게스트/공개(`?public=1`)에는 자체 영상 0 — `build=public` 카탈로그만 · 25cm/cm 층이 없으니 공개 모드 도착은 xdworld z12 위 결과 벡터.
- V-World Data API 미반영 → 필지 = C04 P8 PMTiles(F1-B 산출 · 없으면 `필지 · P8 대기` 결손 칩). `/proxy/vworld/*` 503은 재시도 없이 결손.

## owned_files (모두 새 경로)
`landxi/xi/index.html` · `landxi/xi/xi.css` · `landxi/xi/xi.js`(부팅·URL 상태·역할 관문) · `landxi/xi/engine/{lx-map.js,sources.js,ladder.js,tier.js,camera.js}` · `landxi/xi/fx/{arrive.js,job-theater.js,timescrub.js,swipe.js,frame.js,extrude.js,filament.js,provenance.js,lineage.js,glass.js}` · `landxi/xi/ui/{layers-panel.js,hud.js,parcel-card.js,drawer-stats.js,drawer-report.js,search.js}` · `landxi/xi/css/{canvas-full.css,hud.css,panels.css}` · `landxi/xi/data/{catalog-fixture.json,deploys-fixture.json,replay/*.ndjson,i18n-ko.json}` · `landxi/xi/vendor/pmtiles/`(4.5.0 사본 허용) · `tests/e2e/f1a-*.spec.mjs`(`f1a-ladder` `f1a-arrive` `f1a-theater` `f1a-parcel` `f1a-scrub-swipe` `f1a-public` `f1a-motion-law` `f1a-contract`) · `shots/f1/A/**` · `blueprint/f1/F1-A-result.md`

읽기·import만: `landxi/shared/api-v1.js` · `landxi/assets/css/v2/tokens-v2.css` · `landxi/proto/vendor/maplibre/*`(5.6.0) · `landxi/proto/map-gl.js`(`haversine` 등 순수 함수만) · `landxi/proto/map-data.js` · `landxi/proto/fonts-system.css` · `landxi/assets/data/{results,imagery,change,cards,portal}.js` · `landxi/assets/tiles/**`(XYZ 폴백) · `landxi/data/**`(junction · 로컬 1회 생성 · `git add` 금지)

## 단계별 할 일

### 0. D0 — 계약 픽스처 · junction · 준비 신호
- `New-Item -ItemType Junction "landxi/data" -Target "E:/Land-XI 플랫폼/02. 데이터"`(로컬 1회). `curl -r 0-126 http://localhost:4173/landxi/data/tiles/pmtiles/namwon_ap25_2023.pmtiles` 206 확인.
- `data/catalog-fixture.json` = 계약 §4.1 형식으로 manifest 42항목 + 외부 사다리(계약 URL 그대로). `build` 세 벌(`lx` `tenant:namwon` `public`)을 한 파일 안에 `{"lx":{items,ladder},"tenant:namwon":…,"public":…}`.
- `data/deploys-fixture.json` = 계약 §6 시드 8건 + `dp-kgz-land-change-26`(off 전용).
- 부팅: `probe()` → on이면 `catalog()`, off면 픽스처 → `document.documentElement.dataset.lx='ready'`는 첫 `idle` 뒤. 마스트 우측에 `mastLabel()`(on이면 빈 문자열). 콘솔 오류 0(fetch abort 로그 0).

### 1. 엔진 `engine/`
- `lx-map.js createMap({container, stage:'domestic'|'global', mode:'2d'|'3d'|'globe'})` — MapLibre 5.6.0 · `projection: globe`(z<5) → mercator 전환 · 스타일 전이 0 · `raster-fade-duration 500` · `pmtiles` Protocol 등록 · `maxPitch` T1 60/T2 45(`tier.js`: `WEBGL_debug_renderer_info` + 첫 60프레임 p95로 T1/T2 판정 · 결과 봉투로 HUD 구석에 `T1 · p95 9.8ms [실측]`).
- `ladder.js` — 카탈로그 `ladder.order`·`from/to`로 층을 자동 켜고 끈다(줌 보간 `raster-opacity`: E0-S ③ 방식 — 위 층이 들어올 때 아래 층은 z+1.5에서 0). 카메라 중심 국가 코드(Natural Earth hit-test · `world-atlas@2/countries-50m.json`)로 domestic/global 무대 전환(글로벌 무대 자체는 F1-D가 `landxi/global/`에서 같은 엔진을 import한다 — 여기서는 `stage` 옵션과 이벤트 `stagechange`만 제공).
- **국내 사다리(계약 §4.1 ladder.domestic)**: GIBS VIIRS(z0–5) → GIBS HLS S30 어제(z9–13 토글 · 날짜 파라미터) → xdworld z5–19 → `ap25-namwon-2023` z10–18(**로그인 사용자만**) → `namwon-city-*` z11–17 → `namwon-aoi-*` z12–19. HUD 출처 칩이 층마다 바뀐다(`V-World 위성 z14` → `2023 25cm 항공 · 권리 확인 중` → `LX 드론 1.08cm 2025-04`).
- `sources.js` — LayerItem → `tileUrl()` → 소스/레이어 정의 한 곳. z/x/y 순서 차이는 계약 템플릿에 이미 반영(건드리지 않음).
- `camera.js` — `flyLadder(to)`: E0-S `CAM_EASE`(해상도 공간)로 1600/2400 · 도착 직전 pitch 0→35°(`--e-cam`) · `prefers-reduced-motion`이면 `jumpTo`. `sessionStorage.lx_cam` 인계(필름 → 지도) 읽기.

### 2. 도착 `fx/arrive.js` (S1 승격 · 결과 층이 PMTiles 벡터여도 동작)
- 입력: `{layerId, bbox, count: Envelope, camera}`. 순서 frame 1250 → 스윕 1000(지나간 뒤에만 현상 500 — `feature-state` 4단 양자화 · `promoteId`) → 락온 3곳 380 스태거 120 → 숫자 40/글자(`.cw-digit`) → `arrived`.
- **장면 A(남원 전역)**: z12.5 · 층 `results/lx/namwon-landcover-2023`(layer `landcover` · 129,420) · 클래스 4색은 `--det-*` 아니라 **역할색**: 경작지 청록 `--cw-ai` · 건물 잉크 .35 · 주차장 슬레이트 · 비닐하우스 앰버 아님(앰버는 탐지 순간 전용) → 비닐하우스는 청록 진하게. HUD 124px `129,420` · 해설 줄 `건물 49,800 · 경작지 76,215 · 주차장 2,677 · 비닐하우스 728 · AI 추론 · 검수 전 · 2023 25cm` · 프로비넌스 칩(봉투 그대로).
- **장면 B(cm 하강)**: 운봉 AOI로 `flyLadder` 1250 → 배경 25cm→2m→1.08cm → AOI 안 A02 5필지 + A04 456 변화 도착(둘 다 봉투 `measured`). A02가 AOI 밖이면 걷힘(E0-S `rOp`).
- 129,420 폴리곤의 feature-state 스윕은 **뷰포트 안 렌더된 피처만**(`queryRenderedFeatures`) 대상으로 하고 나머지는 스타일 표현식(`sweep_x` uniform 대신 `["<", ["get","cx"], x]` 불가 → 화면 x를 경도로 바꿔 `["<=", ["get","lon"], lon]` 필터 · P4 피처에 `lon`이 없다면 `cx` 계산은 F1-B에 요청하지 말고 **타일 쿼리 후 feature-state로만** — 성능 p95 ≤ 20ms 실측해 방법을 결과 문서에 적는다).

### 3. 프레임 → 견적 → 실행 → 도착 `fx/frame.js` · `fx/job-theater.js`
- V2 프레임: 사각 드래그 · 폴리곤 · 읍면동 클릭(A11 `namwon-emd`). 프레임 밖 `--dim`. 확정 즉시 `quote()`(on) / 픽스처(off)로 **견적 카드(elev-2 유리)**: 면적 · shard 수 · 예상 GPU·s(봉투 null이면 `bench 전 · —`) · 할당 잔여 · 허용 여부. 카드·모델 선택은 `registry/models` 중 `input`이 현재 층 kind와 맞는 것만 활성.
- V3 실행: `submit()` → `sse('/events/jobs/'+id)`; off면 `replay('data/replay/j1-hwangdeung.ndjson')`(F1-B 녹음본이 오기 전에는 A02를 bbox 격자 8×6으로 나눈 합성 리플레이 · `시연 · 저장 결과 재생`).
- theater: AOI 헤어라인 → shard 격자 점선(`shards_total`로 행·열 계산) → `shard.started` 칸 청록 빔 → `shard.done` 칸 걷힘 + `polys_url` GeoJSON 소스에 추가 + 그 칸 락온 → `job.progress`로만 HUD(`탐지 n · shard a/b · GPU0 u% · v칩/s` 전부 봉투·`[실측·지금]`은 on일 때만, off는 `[시연]`) → `job.done` 도착 → `snapshot.ready`면 GeoJSON 소스를 PMTiles 소스로 교체(끊김 없이 · opacity 크로스 500).
- 실패·취소·재접속 상태를 HUD 한 줄로. `worker_unavailable`이면 자동 리플레이 전환 + 마스트 표기.

### 4. 열람 · 필지 · 시계열 · 스와이프 · 압출
- V8 `ui/layers-panel.js`(좌상 유리 360/접힘 48): 카탈로그 `role` 별 그룹 · 결과 줄은 `deploys-fixture`/`deploys()`의 `snapshot_current` 순 · 실자료 없는 줄 `시연 · 지도 미연결` 점선. 표 3종(지목별/필지별/도로 `준비 중 · 도로 결과 없음`) · 페이저 · 표 행 ↔ 도형 ↔ 막대 삼각 호버 · 내보내기 GeoJSON/CSV(BOM · `export_policy` 검사 · public 모드 비활성).
- `ui/parcel-card.js`: 필지 클릭 380ms 뒤 유리 카드 — `parcelAt()`(on) / `reference/parcels-namwon` PMTiles `queryRenderedFeatures`(off) → PNU · 지목 · 면적 · 공시지가 `2021-12 기준` + 겹치는 결과 conf + **A01 타일 실시간 크롭 4장(AOI 안만 · canvas drawImage · clip-path 1000)** · AOI 밖은 `A03 2시점` 2장 + `4시점은 드론 AOI 안만` 한 줄. P8 없으면 `필지 · P8 대기`.
- V5 `fx/timescrub.js`(S3 승격): 하단 유리 스크러버 60% · 0–3 소수 · 재생 6s · 정수 750 정지 · 변화 히스토그램(A04 `pair` 실측 · 스크러버 위 24px 데이터 잉크) · `?epoch=`.
- V6 `fx/swipe.js`(S6 승격): 지도 2 동기 · 양쪽 출처 칩 · `?swipe=`.
- V7 `fx/extrude.js`: 배경지도 서브메뉴 '지형·입체' 기본 OFF · A02 비닐하우스 1,674 `fill-extrusion` conf×상수 · `terrain/terrain-namwon` · pitch ≤ 60 · 호버 +20% 솟음 + 유리 카드.
- 통계·보고서 우 서랍: 기존 `stats-standard.html?embed=1` · `report-standard.html?embed=1`을 **iframe**으로(수정 없음) · 기간 칩은 URL로 전달.
- `ui/search.js`: `/proxy/vworld/search` 503이면 검색창에 `장소 검색 · V-World 키 대기` 결손 · 대신 읍면동 39 로컬 검색은 동작.

### 5. 역할 · URL · 공개 모드
- 관문: `session.shadow()` realm/role → 게스트 = V1 V5 V6 V8(public 결과만) · 직원 = 전부 · 영업 = V3 `demo:true` 강제 · 기관 = V2 V3 없음 + 필지 카드 + 오류 신고(`POST /feedback` · off면 `시연` 토스트).
- URL 상태(설계서 §3.1 전부): `?on=&epoch=&swipe=&frame=&card=&model=&pick=&public=1&svc=&result=&job=&embed=1&locale=` 새로고침 복원.
- `?public=1`: `build=public` 카탈로그 · 마스트만 · 착지 = 남원 z12 xdworld + `results/lx/namwon-farmland-2025`(export public) 도착. **25cm·cm 층 요청 0**(spec으로 네트워크 검사).

### 6. 성능 · 법전 · 테스트
- p95 ≤ 20ms(T1) · 캔버스 ≥ 90% · WebGL 캔버스 ≤ 2 · 14px 미만 0 · `motion-law`: `document.getAnimations()` 지속·이징 ⊆ 사다리 · 락온 380±20 · 스윕 1000 · 정지 750±40 · 타일 페이드 500 · 앰버 CSS 1회.
- 기존 e2e 573건 영향 0(새 경로만) — `npx playwright test tests/e2e/f1a- --reporter=line` 두 프로젝트.
- Chrome이 어느 GPU로 그리는지(`WEBGL_debug_renderer_info`) 결과 문서에 적는다(설계서 R9 "4090 96fps [다른 PC]" 교체).

## 완료 기준(acceptance)
1. `landxi/xi/index.html`이 on/off 두 모드에서 콘솔 오류 0으로 뜨고 `data-lx=ready`.
2. 글로브 → 남원 하강 중 HUD 출처 칩이 최소 3번 바뀐다(VIIRS/HLS → xdworld → 25cm → 1cm).
3. 남원 전역 도착: P3 25cm 위에 129,420 폴리곤이 스윕 뒤에만 현상되고 HUD 124px 숫자가 40ms/글자로 오르며 4.5s 안 `arrived`(off 기준 · on은 타일 대기 포함 6s).
4. 읍면동 클릭 → 집계 카드(`results/…/stats?by=emd` 또는 `emd-stats.json`) 봉투 표기.
5. 드론 AOI 하강 → 배경 3단 갈림 → A02 5필지 + A04 456 도착 · 필지 클릭 → PNU·지목·공시지가(2021-12) + 4시점 실시간 크롭(AOI 안) · P8 없으면 결손 칩.
6. 프레임 → 견적 카드(봉투 · null은 `bench 전`) → 실행 → shard 격자가 SSE/리플레이 이벤트로만 걷히고 HUD가 `job.progress`로만 갱신 → `job.done` 도착 → `snapshot.ready` 소스 교체.
7. 스크럽 6s 재생·정수 정지 750·히스토그램 · 스와이프 ±4% · 압출 기본 OFF·켜면 pitch ≤ 60.
8. `?public=1`: 자체 영상 타일 요청 0(네트워크 단언) · 결과는 public만 · 내보내기 비활성.
9. 역할 4종 관문 spec 통과 · URL 상태 복원 spec 통과.
10. `f1a-motion-law` 통과 · perf 봉투 p95 ≤ 20ms · 캔버스 ≥ 90% · 14px 미만 0 · 소유 밖 수정 0(`git diff --stat`).
11. 결과 문서: 레퍼런스 장치 사용표(Vantor 124px · kepler 유리 패널 · planet 비교 뷰 · all4land 스윕/브래킷 · Roboflow 타일별 추론) + 세 사용자 관점 자기 점검 + 계약 변경 요청 절.

## 판정용 동작 영상(≈ 45s · 1440×900 · Playwright recordVideo · `shots/f1/A/f1a.webm`)
| 초 | 무엇 |
|---|---|
| 0–4 | 글로브(순백 · GIBS 어제) → 한국으로 카메라 2400 · 국가 hit-test로 국내 무대 |
| 4–10 | 남원 하강 1600 · 출처 칩 `HLS 30m` → `V-World 위성` → `2023 25cm 항공`으로 바뀜 · pitch 0→35° |
| 10–15 | 스캔 스윕 1.0s → 129,420 도착 · 락온 3곳 · 124px 카운트업 · 프로비넌스 칩 |
| 15–19 | 운봉읍 클릭 → 집계 카드 · 드론 AOI로 1250 하강 · 배경 25cm→1cm |
| 19–24 | AOI 안 5필지 + 변화 456 도착 · 필지 클릭 380 → 유리 카드(PNU·지목·공시지가·4시점 크롭 clip-path) |
| 24–32 | 사각 프레임 드래그 → 견적 카드 → 실행 → shard 격자 점등 · 칸마다 결과 도착 · HUD 갱신 · `job.done` |
| 32–38 | 하단 스크러버 재생 6s(정수 정지 750 · 히스토그램) |
| 38–42 | 스와이프 핸들 20→80% · 양쪽 출처 칩 |
| 42–45 | `?public=1` 새 탭: 같은 카메라 · xdworld만 · 결과 벡터 도착 · 마스트 `공개 · 위성 + AI 결과` |
+ 100ms 프레임 스트립 12장(도착 · 하강 · theater 각각) · 정지 화면 1280/1440/1920 · 레퍼런스 나란히(Vantor · kepler.gl 각 1장).


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
