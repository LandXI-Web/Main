# F1-D — Land-XI Global (키르기스스탄 으슥아타·소쿨룩·비슈케크 + 미얀마 메이크틸라 · 글로벌판 영문)

- 모델 **Opus 5** · 난이도 L · 기간 7–9일 [추정] · 판정 Fable 5.1(글로브 무대 Craft · Inter 나란히 렌더 · 영상)
- 읽을 것(순서): ① `blueprint/F1-CONTRACT.md` §1·§2·§4.1·§4.3·§4.4·§5.1·§7·§8·§11·§12 ② `design/system-v2.md`(§2 GLOBE-STAGE · §7 글로벌 타이포) ③ `recon-0924/global-map.md` 전문(**URL·수치의 유일한 출처** · 2026-09-24 검증) ④ `LANDXI-HYPER-BLUEPRINT.md` §3.2 글로벌 · §10.0 X3·X4(v1.1 R4·R5) ⑤ `landxi/assets/data/cards.js`(`card-global-farm` · `card-global-disaster` · `card-change`)
- 공통 규칙: git 금지 · 소유 밖 수정 0 · 영상 크레딧 0 · **CORS 없는 소스(EMS · MS buildings · WorldCover S3 · Esri 통계)는 반드시 사전 수집해 정적 파일로** · 라이선스 가드(EOX 2018+ · Maxar CC BY-NC = 시연 한정 표기 · `build=export`에서 제외).

## 목표

같은 XI맵 엔진(F1-A `landxi/xi/engine`)이 글로브에서 키르기스스탄으로 내려가 (K-1) 으슥아타의 한 해가 월별 Sentinel-2 모자이크로 흐르고, **작업 큐를 거친 NDVI 월별 지수(G-J1 · CPU 워커)**가 shard = 월 8칸으로 도착하고, (K-3) 소쿨룩·비슈케크 외곽의 시가지 확산이 2017→2025 built 차이와 Overture 건물 밀도로 보이고, (K-2) 미얀마 메이크틸라 지진 전후가 한 선으로 갈린다. 글로벌판은 `lang=en` · Inter 600/700 · 단위 ha/km² · 키릴 지명 병기. 사전 수집 열람만 있는 글로벌 = 불합격(X3).

## 근거 발견
- X3: 글로벌이 열람뿐 → `adapters/global/adapter_ndvi_pc.py`(계약 §7 · CPU · `kind:'index'`).
- X4: 소쿨룩·`kgz-land` 카드 없음 → 시나리오 B + `dp-kgz-land-change-26`(F1-C 이식 장면이 만들고, off 픽스처에는 있음).
- §10.3: NDVI 107장면은 T43TEH+T43TDH 합 → **T43TEH만 따로 센다** · LX 사업국 목록은 36개 확인 · 사할린은 나라가 아님(점 표기 또는 제외).
- §10.5: `ru` UI · USGS 1분 폴링 · GIBS 화재 · EMS 크론은 **뺀다**. 글로브 오버레이 = 사업국 채색 + GIBS 어제 + LX 사업국 목록.
- global-map §1: EOX z/y/x · PC 타일러 keyless CORS `*` · WorldCover S3 CORS 없음(서버) · Overture 2026-09-23.0 PMTiles · geoBoundaries LFS 실파일 URL · Esri LULC `exportImage&time=`.

## owned_files (모두 새 경로)
`landxi/global/index.html`(글로벌판 XI맵 · `?tenant=kgz-agri|kgz-land|lx&svc=&locale=en`) · `landxi/global/login.html`(기관 문 · `portal-login-kgz-*` 대체 · 영문) · `landxi/global/global.css` · `landxi/global/js/{boot.js,globe-stage.js,ladder-global.js,cards-global.js,ndvi-theater.js,sprawl.js,disaster-swipe.js,i18n.js,fonts-compare.js}` · `landxi/global/css/{fonts-v2.css}` · `landxi/global/fonts/Inter-{600,700}.woff2`(@fontsource/inter · OFL · Q-D(b) ③ 뒤 확정 — 그 전엔 CDN 로드 허용) · `landxi/global/fonts-compare.html`(Paperlogy 라틴 vs Inter 나란히 · 판정 제출용) · `landxi/global/data/{kgz-adm1.geojson,kgz-adm2.geojson,lx-countries.json,ysykata-landcover.json,ysykata-ndvi-2025.json,pc-mosaics.json,kgz-sprawl-2017-2025.json,mm-meiktila-damage.geojson,mm-meiktila-aoi.geojson,deploys-fixture.json,catalog-fixture-global.json,replay/gj1-ysykata.ndjson,i18n-en.json,i18n-ko.json}` · `landxi/assets/css/v2/globe-stage.css` · `server/adapters/global/{__init__.py,adapter_ndvi_pc.py,adapter_worldcover.py}` · `server/pipelines/global/{g1_boundaries.py,g2_pc_cache.py,g3_esri_lulc.py,g4_ems_meiktila.py,g5_maxar_tiles.py,README.md}` · `LX_DATA_ROOT/global/**` · `tests/e2e/f1d-*.spec.mjs`(`f1d-globe` `f1d-ysykata-ndvi` `f1d-sprawl` `f1d-meiktila` `f1d-i18n-fonts` `f1d-license-guard` `f1d-contract`) · `shots/f1/D/**` · `blueprint/f1/F1-D-result.md`

읽기·import만: `landxi/shared/api-v1.js` · `landxi/assets/css/v2/tokens-v2.css` · `landxi/xi/engine/*` · `landxi/xi/fx/{arrive,timescrub,swipe,job-theater,provenance,filament}.js`(F1-A 산출 · **첫 주는 오지 않는다 → `landxi/proto/vendor/maplibre` 직접 + 자기 `js/` 안 최소 부품으로 시작하고, F1-A `fx/`가 도착하면 교체** · 인터페이스는 `system-v2.md §5`) · `landxi/proto/fonts-system.css` · `landxi/assets/data/cards.js` · `server/adapters/base.py`(F1-B) · `server/landxi_api/*`(호출만)

## 단계별 할 일

### 0. D0–D2 사전 수집 `server/pipelines/global/`(멱등 · 산출은 `LX_DATA_ROOT/global/` + 화면용 사본 `landxi/global/data/`)
- `g1_boundaries.py`: geoBoundaries KGZ ADM1(7주)·ADM2(41) simplified(`media.githubusercontent.com/.../9469f09/...`) → `kgz-adm{1,2}.geojson`(Ysyk-Ata shapeID `92254566B31675215078110` · Sokuluk · Alamudun · Bishkek 시는 ADM 단위 아님 → bbox [74.45,42.78,74.72,42.93] 사각 + `경계 미확보`) · Natural Earth 50m + `lx-countries.json`(LX 사업국 **목록 확인 36** · ISO3 · 사할린 = 점 `[142.7, 50.3]` 별도 · 출처 `LX 공식 사업현황 + 내부자료 2023`).
- `g2_pc_cache.py`: PC `mosaic/register` 월별 2025-03…10(CQL2 · bbox 으슥아타 북부 [74.70,42.75,75.20,43.00] · 구름 ≤ 10%) → `pc-mosaics.json {"2025-03": searchid, …}` · `item/statistics`(WorldCover 두 타일 · 군 경계) → `ysykata-landcover.json`(비율 봉투 · `비율만 유효` note) · **T43TEH 장면 수만** 따로 → `ysykata-ndvi-2025.json`(월별 n_scenes · 캐시용 NDVI 평균은 G-J1 결과가 채움 · 그 전엔 null).
- `g3_esri_lulc.py`: Esri Sentinel-2 10m LULC `exportImage` 2017 · 2025 built(7) 클래스 → 소쿨룩·비슈케크 bbox 격자 500m 집계 → `kgz-sprawl-2017-2025.json`(`built_2017_pct` · `built_2025_pct` · `delta` 봉투 measured · 출처 URL·time 파라미터 기록). 응답 CORS 없으면 서버 수집(이 스크립트).
- `g4_ems_meiktila.py`: EMSR798 AOI11 GRA ZIP → `builtUpP`(38점 · `damage_gra`) · `areaOfInterestA` → `mm-meiktila-damage.geojson`(Overture 건물 최근접 15m 조인 · Overture는 PMTiles Range 읽기 `pmtiles` 파이썬) · `mm-meiktila-aoi.geojson`.
- `g5_maxar_tiles.py`(선택 · 무거우면 `visual` COG를 브라우저 geotiff 대신 **서버 XYZ z12–18 WebP**로 `LX_DATA_ROOT/global/tiles/maxar_meiktila_{pre,post}/` · 계약 §4.2 `tiles/xyz`) · 실패하면 S2 전후(PC STAC · 사전 `2025-03-01/03-27` · 사후 `03-29/04-20`)로 대체하고 표기.
- `catalog-fixture-global.json`: 계약 §4.1 형식 · `ladder.global` 순서 · 외부 URL 그대로 · Maxar 항목 `license:'CC BY-NC 4.0' · export_policy:'never' · note:'시연 한정'`.

### 1. 글로브 무대 `globe-stage.js`(GLOBE-STAGE · `globe-stage.css`)
- 순백 배경(`#FFFFFF` · 크림 금지) · MapLibre `projection: globe` · GIBS VIIRS 어제 · 국경 헤어라인 · **LX 사업국 36 채색**(액센트 틴트 2단 · 진행 중 = `#006DF7` .35 · 이력 = `--cw-tint-2`) · 우 사업국 목록(국가명 en · 사업명 · 출처 칩) · 상단 날짜 스크러버(GIBS `{date}` · 어제 기준 −30일 · 타일 페이드 500).
- 남원(F1-A) ↔ 글로벌: `?from=namwon`이면 남원 카메라에서 글로브로 후퇴 2400 → 비슈케크로 하강 2400(같은 지도 · 페이지 이동 0 — F1-A와 같은 엔진 인스턴스이므로 실제 통합은 F1-∑ 에서 한 페이지로 잇는다 · 이 에픽은 `landxi/global/index.html` 단독으로도 같은 장면).
- 국가 hit-test로 글로벌 사다리: EOX 2025(`build=lx|tenant` · 비상업 표기) / 2017(`build=export`) → HLS → PC 월별 모자이크(`pc-mosaics.json`) → WorldCover(`pc-worldcover-2021`) → NDVI 타일(PC expression) → Overture buildings(pmtiles) → Maxar/S2 전후.

### 2. K-1 으슥아타 + G-J1 `ndvi-theater.js`
- `dp-kgz-agri-farm-26`(canary) 카드 · 경계 도착(락온) · WorldCover 비율 막대(봉투 `비율만 유효`) · 월별 스크러버(3→10 · timescrub 문법 · 모자이크 크로스페이드).
- **G-J1**: 프레임 = ADM2 Ysyk-Ata 북부 평원 AOI(`frame.js` 행정경계 모드) → `quote({kind:'index', model_id:'index/ndvi_pc', imagery_id:'pc-s2-mosaic', aoi, options:{months:['2025-03',…,'2025-10'], cloud_max:15, mask:'worldcover-40'}})` → `submit` → SSE: shard = 월 8칸이 스크러버 위 **히스토그램 자리**에 순서대로 도착(`index.month` → 막대 + 곡선 점 · `n_scenes`) · HUD `지수 계산 · 모델 추론 아님 · T43TEH n장면 · cpu-0` · `job.done` → 곡선 완성 + `ysykata-ndvi-2025.json` 캐시 갱신(서버) · off면 `replay('data/replay/gj1-ysykata.ndjson')`(G2 캐시로 합성 · `시연 · 저장 결과 재생`).
- 어댑터 `adapter_ndvi_pc.py`(계약 §7): STAC 검색 T43TEH · `cloud_cover<15` · SAS 토큰 · `/vsicurl/` B04·B08 창 · WorldCover 40 마스크 · 평균 → `ShardResult(metrics)` · PC 오류 시 캐시 `basis:'recorded'`. `adapter_worldcover.py`: 클래스 히스토그램(선택 · 정밀 면적 ha).
- 작물 분류 = `AI 과업 · 학습데이터 필요`(카드 `gap`) 정직 표기 · 6종 작물명은 L2 제안서 출처 칩.

### 3. K-3 소쿨룩·비슈케크 `sprawl.js`(`kgz-land` · `dp-kgz-land-change-26`)
- `deploys()`에 `dp-kgz-land-change-26`이 있으면(F1-C 이식 뒤 · off 픽스처) 카드 on · 없으면 `이식 전 · 관제에서 배포본 생성` 결손 칩(정직).
- 소쿨룩 ADM2 + 비슈케크 bbox · Esri LULC 2017 vs 2025 built 격자(`kgz-sprawl-2017-2025.json` · 델타 램프 = `--conf-*` 아닌 **앰버 금지** → 액센트 램프) · Overture 건물 `fill-extrusion`(높이 있음 · pitch 45 · 기본 OFF 토글) · 필라멘트(격자 built 밀도 · z9–11) · 스와이프 2017 ↔ 2025 EOX 모자이크 · **연속지적 시범지 3곳(비슈케크·으슥아타·소쿨룩) 라벨 + `경계 미확보`** · `Сокулук` `Бишкек` 키릴 병기.

### 4. K-2 메이크틸라 `disaster-swipe.js`(`dp-mm-meiktila-25` · lx · 시연 한정)
- Maxar 전(2025-03-06) ↔ 후(2025-04-03) 스와이프(G5 XYZ · 실패 시 S2 전후) · EMS 피해 점 38 → Overture 건물 등급 채색(Destroyed 4 잉크 · Damaged 23 액센트 · Possibly 11 슬레이트 — 빨강은 조치 글자만) · 차트 등급별 동수(봉투 measured · 출처 EMS) · 출처 칩 `© EU Copernicus EMS · Maxar Open Data CC BY-NC 4.0 · 시연 한정` · `build=export`에서 Maxar 층 없음(spec).

### 5. 글로벌판 · i18n · 서체
- `i18n.js`: `?locale=en` 기본(기관 kgz-*) · `ko`(lx 직원) · 단위 ha/km² · 날짜 ISO · `<html lang>` 스왑으로 `fonts-v2.css`가 Inter 600/700 표시체 적용. `ru`는 **지명 병기만**(UI 아님).
- `fonts-compare.html`: 같은 H1/HUD 문구를 Paperlogy 라틴 vs Inter 600/700 나란히(Q-D(b) ③) → 스크린샷 제출 → Fable 판정 → 확정.
- `login.html`(기관 문 · en): `POST /auth/login {realm:'tenant', tenant_id:'kgz-agri'}` · off면 `lx_tenant_session` 흉내. LX 셸과 완전 분리(계약 §3).

### 6. 라이선스 가드 · 테스트
- `f1d-license-guard`: `build=export`(catalog 쿼리)에 EOX 2018+ · Maxar 없음 · 화면 출처 칩 문구 검사.
- `f1d-globe`: 순백 배경 · 사업국 36 채색 · 날짜 스크러버 타일 페이드 500. `f1d-ysykata-ndvi`: SSE/리플레이 8칸 순서 도착 · HUD 문구 `지수 계산 · 모델 추론 아님`. `f1d-sprawl`: 델타 격자 · 필라멘트 · 결손 칩. `f1d-meiktila`: 스와이프 · 38점 등급 수. `f1d-i18n-fonts`: `lang=en`에서 H1 computed font-family Inter · 14px 미만 0.

## 완료 기준(acceptance)
1. 사전 수집 6파일 존재 · 각 파일에 `source` · `fetched_at` · 라이선스 필드 · 스크립트 멱등 재실행.
2. 글로브: 순백 · GIBS 어제 · 사업국 36(사할린 점) · 목록 · 날짜 스크러버 · 남원→글로브→비슈케크 카메라 연속(2400×2 · 페이지 이동 0).
3. 으슥아타: 경계 도착 · WorldCover 비율 막대(비율만 유효 표기) · 월별 모자이크 스크럽 · **G-J1이 큐를 거쳐 8칸 도착**(on: 실제 PC 읽기 · off: 리플레이 표기) · 곡선 · `n_scenes`(T43TEH만) · 작물 분류 결손 정직.
4. 소쿨룩·비슈케크: 2017→2025 built 델타 격자 · Overture 압출 토글 · 스와이프 · 시범지 3곳 라벨 + `경계 미확보` · `dp-kgz-land-change-26` 유무 분기.
5. 메이크틸라: 전후 스와이프 · 38점 등급 채색 · 차트 · CC BY-NC 시연 칩 · export 빌드 제외.
6. `lang=en` Inter 600/700 · 단위 · 키릴 병기 · `fonts-compare.html` 제출.
7. `adapter_ndvi_pc.py`가 F1-B 워커 스캔에 등록되고(`ADAPTER` 상수) 단독 실행 테스트(`python -m server.adapters.global.adapter_ndvi_pc --month 2025-06 --aoi …`) 통과 · PC 장애 시 `recorded` 폴백.
8. 두 모드 콘솔 오류 0 · p95 ≤ 20ms · 캔버스 ≥ 90% · `f1d-motion-law`(F1-A spec 방식 복사) · 소유 밖 수정 0.
9. 결과 문서: 레퍼런스 장치표(kepler 시간 재생 · planet 비교 · NASA Worldview 날짜 · Vantor 컬러웨이) + 해외 기관 관점 점검 + 계약 변경 요청.

## 판정용 동작 영상(≈ 45s · 1440×900 · `shots/f1/D/f1d.webm` · `lang=en`)
| 초 | 무엇 |
|---|---|
| 0–5 | 남원 카메라에서 글로브로 후퇴 2400 · 순백 글로브 · GIBS 어제 · LX 사업국 36 채색 · 우측 목록 · 날짜 스크러버 한 칸 |
| 5–10 | 비슈케크·으슥아타 하강 2400 · 출처 칩 `EOX S2 cloudless 2025 (CC BY-NC-SA)` → `PC S2 mosaic 2025-06` · Ysyk-Ata 경계 락온 · `Ысык-Ата` 병기 |
| 10–14 | WorldCover 비율 막대(농경지 33.0% · 비율만 유효) · 월별 스크러버 3→10 크로스페이드 |
| 14–26 | 프레임(ADM2 평원) → 견적 → **실행: 8칸(3월…10월)이 히스토그램 자리에 순서대로 도착** · HUD `Index calc · not model inference · T43TEH n scenes · cpu-0` · `job.done` 곡선 완성 · 작물 분류 결손 칩 |
| 26–34 | 소쿨룩으로 이동 1600 · 2017→2025 built 델타 격자 · Overture 압출 토글(pitch 45) · 스와이프 2017↔2025 · 시범지 3 라벨 `boundary not acquired` |
| 34–43 | 글로브 후퇴 → 미얀마 하강 · 메이크틸라 Maxar 전후 스와이프 · EMS 38점 등급 채색 · 차트 · CC BY-NC 시연 칩 |
| 43–45 | `fonts-compare.html` 나란히 프레임 1장(Paperlogy 라틴 vs Inter) |
+ 100ms 스트립(글로브→하강 · 8칸 도착 · 스와이프) · 정지 화면 1280/1440/1920 · 레퍼런스 나란히(kepler.gl 시간 재생 · planet 비교 뷰 각 1장).


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
