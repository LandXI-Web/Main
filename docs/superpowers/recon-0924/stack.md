# 정찰 0924 · stack — 현재 렌더 스택 진단과 "WebGL급 Geo-AI" 스택 제안

작성 2026-09-24 · 읽기 전용 조사(이 보고서 외 파일 변경 없음) · 대상 `E:/Land-XI 플랫폼/01. 디자인`
환경: gdalinfo·rasterio 없음. 이 사본에는 원천 TIF(`build/`)와 `02. 데이터`가 없다(README-portable.md). 그래서 이 보고서의 래스터 수치는 **웹 타일 폴더에서 직접 계산한 값**(파일 수, 줌, XYZ→WGS84 경계)과 `assets/data/imagery.js` 메타(파이프라인이 자동 생성)를 쓴다.

---

## 0. 결론

1. **엔진은 이미 갖춰져 있다. 운영 화면이 그 엔진을 쓰지 않을 뿐이다.** MapLibre 5.6.0은 로컬 vendor에 있고, deck.gl 9.3.10, three 0.185.1, 글로브, 지형, fill-extrusion은 `dive.html`과 `spikes/`에서 실측으로 돌아갔다. 반면 실제 서비스 화면(`map-gl.js`, `analysis-map.js`, `publish-map.js`, `admin-map.js`, `drift-map.js`)은 모두 다음 조건으로 굳어 있다.
   - `dragRotate:false, pitchWithRotate:false, touchPitch:false`
   - 래스터 배경 + GeoJSON fill/line만 사용
   - 지형·deck·3D 없음

   정리하면 운영 화면은 "평면 2D 지도"이고 시네마틱은 랜딩(dive)에만 있다. 사용자가 느낀 "목업 수준"이 바로 이 간극이다.
2. **외부 CDN 의존이 남아 있다.** deck.gl, three, gsap, lenis, suncalc, Cesium은 jsdelivr/unpkg에서 받는다. 로컬에 있는 것은 maplibre(920KB)와 scrollcraft뿐이다. `node_modules`에도 playwright 외에는 지도·3D 라이브러리가 없다. 운영과 오프라인 시연을 하려면 vendoring이 필요하다.
3. **버전 핀은 유지해야 한다.** MapLibre는 5.6.0에 고정하고 v6(ESM 전용, UMD 제거)로 올리지 않는다. 2026-08-25 실측에서 deck.gl 9.3.10이 v6와 호환되지 않았다(`webgl-stack-feasibility.md` §2).
4. **성능에서 유일한 절벽은 지형이다.** 기준은 두 가지로 측정됐다.
   - SwiftShader: 지형 OFF 66fps → ON 2.4fps
   - 4090 마을 장면: 232 → 96fps

   그래서 지형은 상시로 켜지 않고 장면 단위로만 켠다. 나머지 스택(글로브, deck 인터리브, three glTF, 5천 폴리곤, 블러 패널, DPR2)은 4090에서 프레임 드롭이 없었다(`perf-thispc.md`).
5. **실데이터 웹 자산은 이미 약 100MB가 웹용으로 구워져 있다.** 구성은 다음과 같다.
   - 타일 12세트, 파일 6,822개, 63MB
   - 지형 4.9MB
   - AI 추론 GeoJSON 약 20MB
   - glb 3종

   이 자산이 서비스 화면에 연결되어 있지 않은 것이 가장 큰 기회다. 지금 타일을 참조하는 곳은 `dive.js`, `wf-map.js`, `change.js`, `imagery.js`, 스파이크뿐이다.

---

## 1. 현재 렌더 스택 인벤토리

| 항목 | 현황 | 위치 |
|---|---|---|
| MapLibre GL JS | **v5.6.0** UMD (920KB) + css | `landxi/proto/vendor/maplibre/` |
| 기타 vendor | scrollcraft(80KB, 스크롤 연출) | `landxi/proto/vendor/scrollcraft/` |
| deck.gl | 9.3.10 `dist.min.js`, **CDN**, `dive.html`에서만 사용(`MapboxOverlay interleaved:false` + LineLayer/ArcLayer) | `landxi/proto/js/dive.js:268-308` |
| three.js | 0.185.1 ESM, **CDN** importmap, `js/orbit.js`(글로브 위 궤도 glTF 오버레이)와 스파이크 | `js/orbit.js`, `spikes/three-globe`, `spikes/clouds` |
| 지형 | Mapterhorn(원격, terrarium 512, maxzoom 12) `dem/dem2`, dive에서만 `setTerrain` | `js/style.js:55-58`, `js/dive.js:954` |
| 글로브 | `setProjection globe↔mercator`, dive에서만 | `js/dive.js:252` |
| fill-extrusion | dive 스타일에 grid/det/change/rain/res 3D 레이어 정의 | `js/style.js:172-230` |
| 배경 소스 | V-World(키 WMTS 확인 후, 없으면 xdworld 키 없는 z5–19, 그다음 EOX s2cloudless) · OpenFreeMap 벡터·glyph · Mapterhorn DEM | `js/sources.js` |
| 서비스 지도 공통 | `map-gl.js`(269줄): V-World 위성/Base/midnight/Hybrid 래스터 4종과 GeoJSON 소스 8개(emd/sr/hl/num/msr/aoi…), **회전·피치 잠금** | `landxi/proto/map-gl.js` |
| 피치 허용 화면 | `wf-map.js`만 `pitch:62, dragRotate:true` | `landxi/proto/wf-map.js:93` |
| 로컬 서버 | `node tools/serve.mjs`가 `.env.local`의 VWORLD_KEY를 `/landxi/proto/env.js`로 주입 | `tools/serve.mjs` |

MapLibre를 싣는 HTML은 23개다: admin-map, admin-publish, ai-card(-edit), ai-project(-create, -label), ai-publish-create, analysis-ai, dashboard, dataset, dive, map-drift, portal-dp-* 6개, report-standard(-issue), stats-standard, workflow, ximap.

---

## 2. `landxi/assets` 데이터·타일 목록 (실측)

### 2.1 래스터 타일 `landxi/assets/tiles/` — XYZ WebP, EPSG:3857

경계는 최대 줌 타일 인덱스에서 역산했다(WGS84). GSD와 촬영 시점은 `imagery.js` 값이다.

| 세트 | 줌 | 파일수 | 크기 | WGS84 경계 (W,S,E,N) | GSD | 촬영 | 비고 |
|---|---|---|---|---|---|---|---|
| namwon_2504 | 12–19 | 280 | 2.7MB | 127.3480, 35.5272, 127.3569, 35.5350 | 1.08cm | 2025-04 | 남원 농경지 AOI (약 0.8×0.9km) |
| namwon_2506 | 12–19 | 280 | 2.5MB | 동일 | 1.69cm | 2025-06 | |
| namwon_2508 | 12–19 | 280 | 2.5MB | 동일 | 1.54cm | 2025-08 | |
| namwon_2510 | 12–19 | 280 | 2.4MB | 동일 | 1.68cm | 2025-10 | |
| namwon_change_2504_2510 | 14–19 | 219 | 1.3MB | 동일 | – | 04→10 | 변화탐지 오버레이 타일 |
| namwon_city_2504 | 11–17 | 1,598 | 16MB | 127.2903, 35.3174, 127.3590, 35.3734 (z17 실타일) / 메타 경계 127.183–127.637, 35.303–35.562 | 웹 2.0m, 코어 0.6m(z16–17), 원본 1.68cm | 2025-04 | 남원 전역 |
| namwon_city_2510 | 11–17 | 1,756 | 20MB | 동일 | 동일 | 2025-10 | 남원 전역 |
| kuksan_a68 | 13–19 | 877 | 7.2MB | 126.9738, 35.8256, 126.9923, 35.8384 | 5cm | 2025-08 | 국산리 드론 |
| kuksan_a71 | 13–19 | 877 | 7.2MB | 동일 | 5cm | 2025-08 | 국산리 드론(다른 비행) |
| jeju_2020 | 13–19 | 117 | 1.5MB | 126.8948, 33.5145, 126.9003, 33.5202 | 10cm | 2020-12 | 불법건축물 도엽 |
| jeju_2022 | 13–19 | 129 | 1.2MB | 126.8193, 33.5048, 126.8255, 33.5105 | 12cm | 2022-12 | 제주 항공 |
| jeju_landcover | 13–19 | 129 | 172KB | 동일(jeju_2022) | 12cm | 2022-12 | 토지형질 세그멘테이션 결과 래스터 |

합계는 6,822파일, 63MB다. 남원 4시점은 **z12–19**, 전역은 **z11–17**이다.

### 2.2 지형 `landxi/assets/data/3d/terrain-namwon/`

- 원본은 AWS Terrain Tiles(Terrarium) 로컬 미러다.
- 크기 4.9MB, z9–13, 256px PNG다.
- 경계: tiles.json 기준 127.24, 35.28, 127.54, 35.54 / 타일 실경계 127.222, 35.246, 127.573, 35.568
- 해상도는 약 30m다(z13이 원본 해상도).
- 오프라인에서도 지형을 쓸 수 있는 유일한 소스다. 현재 dive는 원격 Mapterhorn을 쓰고 있어 이 미러를 **쓰지 않는다**.

### 2.3 벡터 GeoJSON (EPSG:4326)

| 파일 | 피처 | 형 | WGS84 경계 | 주요 속성 | 성격 |
|---|---|---|---|---|---|
| geo/results/namwon-greenhouse-2025 | 1,674 | MultiPolygon | 127.189–127.662, 35.306–35.553 | cls, cid, conf, sam, area, **pnu**, emd | **AI 추론(비닐하우스)** |
| geo/results/namwon-farmland-2025 | 2,098 | Polygon | 127.185–127.658, 35.307–35.557 | cls, cid, conf, sam, area, pnu, emd | **AI 추론(농경지)** |
| geo/results/yeosu-marine-2025-aerial | 1,857 | Polygon | 127.509–127.750, 34.555–34.750 | cls, cid, conf, area | 해양쓰레기, 항공 |
| geo/results/yeosu-marine-2025-aerial-grid100 | 813 | Polygon | 동상 | count, mean_conf, top, top_share | 100m 격자 집계 |
| geo/results/yeosu-marine-2026-drone | 2,078 | Polygon | 127.643–127.713, 34.568–34.636 | cls, cid, cat, conf, area, **mask**, color | 해양쓰레기, 드론 |
| geo/results/yeosu-marine-2026-drone-grid100 | 86 | Polygon | 동상 | count, mean_conf… | 격자 |
| geo/marine-debris | 5,000 | Polygon | 125.777–126.998, 34.250–35.249 | confidence, class, area_m2 | 서남해 해양쓰레기 |
| geo/marine-debris-grid | 9,032 | Polygon | 동상 | count, conf_n, mean_conf | 격자(2.1MB) |
| geo/namwon-change | 456 | Polygon | 127.348–127.357, 35.528–35.535 | pair, cls, area_m2, score | 4시점 변화탐지 |
| geo/namwon-change-grid | 452 | Polygon | 동상 | pair, count, dominant | 격자 |
| 3d/namwon-buildings | 5,109 | Polygon | 127.346–127.434, 35.374–35.446 | area_m2, **height_m(추정)**, floors_est, use_est | Overture/CN-EAB 형상 + 추정 높이 |
| 3d/_raw-namwon-overture / _osm | 5,231 / 226 | Polygon | 동상 | – | 원천 |
| geo/namwon-emd | 39 | Polygon | 남원 전역 | nm, cd | 읍면동 경계 |
| geo/sido · sigungu · korea-outline | 17 · 249 · 1 | Polygon | 전국 | code, name | 행정경계 |
| geo/jeju-illegal | 2 | Polygon | 제주 | FID | 불법건축 라벨 |
| geo/detections-sample · orgs · projects-extent · sigungu-sample | 50 · 5 · 8 · 14 | – | – | – | **샘플/합성 성격. 운영 화면에 실데이터로 쓰지 말 것** |

### 2.4 기타

- `assets/proto/models/`: `drone.glb`(126KB), `aircraft.glb`(119KB), `satellite.glb`(174KB). deck ScenegraphLayer와 three에서 바로 쓸 수 있다.
- `assets/proto/crops/`: 결과별 크롭 이미지 7세트, 144장, 5.3MB. 카드와 갤러리용이다.
- `assets/proto/review/`: 신·구 비교 jpg, 14MB.
- `assets/proto/film/`: 1.1GB. 대부분 legs mp4/webp 스크럽 필름이다. 웹 배포 전에 선별이 필요하다.
- `assets/data/*.js`: 카탈로그·메타 모듈(imagery, change, models, registry 등).

---

## 3. 과거 스파이크 결론 요약

| 문서 | 결론 |
|---|---|
| `2026-08-25-webgl-stack-feasibility.md` | MapLibre 5.6.0 고정(v6는 deck 비호환). 위성 베이스는 키 없이 가능(xdworld/EOX/GIBS/Esri, CORS 허용). 글로브+대기+지형+deck interleaved+three glTF+블룸을 한 페이지에서 동시에 띄워 오류 0으로 실측. `addProtocol('pmtiles')`(pmtiles 4.5.0) 동작 확인. 성능 절벽은 `setTerrain` 하나다. |
| `2026-08-25-perf-thispc.md` | 4090 기준 풀 스택(a~g, DPR2)에서 드롭 0(디스플레이 29Hz 천장). 지형만 드롭이 감지됐다. JS 힙은 17MB에서 118MB로 증가. iGPU는 검증되지 않았다. |
| `2026-08-26-spike-maplibre3d.md` | "지구 → 마을 3D → 구름"을 MapLibre+GSAP+Lenis+three로 한 번의 스크롤에 구현. 전주 6,289동 232fps. 남원은 OSM 226동뿐이라 데이터가 병목이다. **AI 검출 온실 1,674동을 압출한 장면이 가장 좋은 3D 자산**이다. V-World 키로 WMTS는 되지만 건물 WFS/데이터 API는 `INCORRECT_KEY`라 유형 추가 신청이 필요하다. `raster-translate`는 v5에 없다. |
| `2026-08-26-spike-korea-3d-data.md` | Overture(CN-EAB)가 OSM보다 23배 많다(남원 5,231동). 높이는 추정이고, 실측 층수(`gro_flo_co`)는 V-World 데이터 API 승인 후 교체한다. AWS terrarium 미러 4.8MB. 구름은 Himawari-9(키 불필요). |
| `2026-08-26-spike-google3d.md` | Google Photorealistic 3D Tiles는 한국에 메시가 없어 **채택하지 않는다**(키와 결제 필수). 한국 지표는 자체 정사영상과 자체 3D로 채운다. |
| `2026-08-26-spike-three-globe.md` | three 글로브와 로컬 디오라마 두 씬을 합성하고, 필름 레그를 결정론적으로 렌더했다. 산출물 일부가 0바이트로 손상돼 재구웠다. |
| `2026-08-26-spike-clouds.md` | 구름은 고도대별 하이브리드로 처리한다. 250km 위는 구름 구, 170–8km는 빌보드 데크, 8km 아래는 볼류메트릭이다. |
| `2026-08-26-spike-scrollcam.md` | 스크롤 카메라 레일(p 공간 스무딩, 구심 Catmull-Rom, 화면속도 재매개변수화). 계측은 GPU 경합으로 완주하지 못했다. |

---

## 4. 스택 제안: "WebGL급 동적 Geo-AI 플랫폼"

### 4.1 원칙
- **엔진 하나, 모든 화면**: `map-gl.js`를 공통 엔진으로 격상하고, dive에서 검증된 능력(글로브, 지형, extrusion, deck)을 옵션으로 연다. 화면마다 `createMap(el,{mode:'2d'|'3d'|'globe'})`로 고른다.
- **로컬 우선 데이터**: 자체 정사, 추론 결과, 지형은 로컬 PMTiles에서 읽는다. V-World는 배경과 실시간 조회(WMTS, 데이터 API)에만 쓴다.
- **빌드 없는 정적 배포 유지**: UMD와 importmap으로 로드하고 전부 `landxi/proto/vendor/`에 둔다.

### 4.2 레이어 구성 (버전 핀)

| 층 | 선택 | 버전 | 번들 | 오프라인 vendoring |
|---|---|---|---|---|
| 지도 엔진 | MapLibre GL JS UMD | **5.6.0 (현 vendor)** | 920KB | 이미 완료 |
| 글로브/대기 | `setProjection` 줌 보간(`vertical-perspective`→`mercator`) + `setSky` | 5.6.0 | – | 이미 완료 |
| 지형 | raster-dem terrarium. 남원은 **로컬 미러**, 전국은 Mapterhorn/AWS | – | 4.9MB(로컬) | 로컬 미러는 있음. 전국은 필요 AOI만 추가로 미러 |
| 데이터 시각화 | deck.gl `dist.min.js` + `MapboxOverlay({interleaved:true})` | **9.3.10** | 1.6MB(gzip 446KB) | jsdelivr에서 1파일 복사하면 된다 |
| 3D/연출 | three.js ESM + importmap(`three`, `three/addons/`) | **0.185.1** | 약 1.3MB와 addons 일부 | build/three.module.js(+three.core.js) 및 GLTFLoader/RoomEnvironment 등 사용 모듈만 복사 |
| 타일 패키징 | pmtiles JS(`addProtocol`) | 4.x(4.5.0 실측) | 약 50KB | 1파일 |
| 모션 | gsap + ScrollTrigger, lenis | 3.15.0 / 1.3.26 | 약 100KB | 1파일씩. 현재 3.12/3.13/3.15, lenis 3종이 혼재하므로 통일이 필요하다 |
| 태양 | suncalc | 1.9.0 | 약 8KB | 1파일 |

npm은 있고 오프라인 설치 경로도 있다. `npm i` 후 `node_modules/<pkg>/dist/*`를 `vendor/`로 복사한다. 다만 현재 `node_modules`에는 해당 패키지가 없으므로 한 번은 네트워크가 필요하다. Cesium은 채택하지 않는다(google3d 결론).

### 4.3 deck.gl 레이어와 Land-XI 화면 매핑

| deck 레이어 | 데이터(실자산) | 화면 | 비고 |
|---|---|---|---|
| **GeoJsonLayer**(extruded, `getElevation=conf`) | greenhouse 1,674 / farmland 2,098 / namwon-change 456 / jeju-illegal | 분석 결과(analysis-ai), 지도 서비스, 공개 카드 | pickable 호버 → pnu·emd·conf 패널. MapLibre fill-extrusion으로 대체할 수도 있다 |
| **H3HexagonLayer** 또는 **HexagonLayer/GridLayer** | marine-debris 5,000(중심점), yeosu 1,857+2,078 | 대시보드, 해양 결과 | 기존 grid100 집계를 그대로 ColumnLayer/PolygonLayer 압출로 쓸 수 있다. **H3는 UMD에 h3-js가 포함되는지 미검증**. HexagonLayer는 포함이 확인됐다 |
| **HeatmapLayer** | marine-debris, detections(실데이터만) | 대시보드 전국 뷰 | 글로브에서 동작 실측 |
| **BitmapLayer / TileLayer** | 남원 4시점, city 2시점, kuksan, jeju | 시계열 스와이프, 타임슬라이더 | MapLibre raster로도 충분하다. 스와이프 clip은 deck TileLayer가 편하다 |
| **TerrainLayer** | terrain-namwon + 정사 텍스처 | 3D 현장 뷰 | MapLibre `setTerrain`과 중복되므로 **MapLibre 지형 하나로 통일**하는 것을 권장한다 |
| **ScenegraphLayer** | drone.glb / aircraft.glb / satellite.glb | 드론 촬영 계획, 궤도 인트로 | kuksan_a68/a71 커버리지 위에 드론 배치 |
| **TripsLayer** | 촬영 비행경로(원천에 로그가 있을 때만) | 워크플로 "수집" 단계 | **현재 로컬에 실측 궤적 없음**. 합성 경로는 "예시"라고 표기 |
| **ArcLayer** | orgs(본사 HQ → 과제 지역) | 대시보드 | orgs.geojson은 5점짜리 샘플이므로 실제 기관·과제 목록으로 교체해야 한다 |
| **Tile3DLayer** | (없음) | – | 한국 포토리얼 3D Tiles 없음. V-World 3D 데이터는 키 유형 승인 후 재검토 [미검증] |

### 4.4 three.js 커스텀 레이어
- 쓸 곳: 궤도 인트로(satellite.glb + 대기림), 구름 데크, 추론 결과 "스캔 빔" 셰이더, 온실 압출 위 파티클 등 deck으로 안 되는 연출.
- 방식: MapLibre `CustomLayerInterface`(`renderingMode:'3d'`, WebGL2 컨텍스트 공유). `defaultProjectionData.projectionTransition`으로 글로브/평면 전환을 추종한다(실측).

### 4.5 PMTiles 전환 (권장)
- 현재 63MB가 6,822개의 작은 파일로 흩어져 있다. 세트별로 raster PMTiles(webp)로 묶으면 파일 12개가 된다. 정적 호스팅, 캐시, 배포가 단순해지고 HTTP Range로 읽힌다.
- GeoJSON(특히 marine-debris-grid 2.1MB, greenhouse 1.2MB, buildings 2.1MB)은 벡터 PMTiles(MVT)로 바꾼다. tippecanoe가 필요하지만 현재 PC에 설치 여부는 확인하지 않았다. 대안은 WSL, Docker 또는 `pmtiles convert`(mbtiles→pmtiles)다.
- 오프라인 배경: V-World와 EOX는 네트워크가 필요하다. 완전 오프라인 시연이 필요하면 한국 저줌(z0–10) 위성 또는 Protomaps 벡터 추출본을 PMTiles로 로컬 보관한다.
- 서버 조건: `tools/serve.mjs`가 Range 요청(206)을 지원하는지 확인해야 한다 [미검증].

### 4.6 화면별 적용 우선순위
1. **지도 서비스(ximap/map-gl)**: 회전·피치 잠금을 해제하고, 남원 4시점 타임슬라이더와 스와이프, 온실·농경지 3D 압출(conf 색상), 로컬 지형 토글을 넣는다.
2. **대시보드**: 글로브에서 전국으로, 다시 과제 지역으로 줌 보간한다. 해양쓰레기 헥사 압출, 히트맵, 시군구 커버리지를 싣는다.
3. **분석 결과/공개 카드**: 결과 GeoJSON을 pickable 3D로 만들고 크롭 이미지를 연동한다.
4. **워크플로/드론**: kuksan 5cm 정사와 drone.glb ScenegraphLayer를 쓴다.
5. **랜딩(dive)**: 이미 구현돼 있으므로 CDN을 vendor로 교체하는 것만 남았다.

---

## 5. 가장 가치 있는 자산 상위 10

| # | 자산 | 경로 | 이유 / 웹 활용 | 우선순위 |
|---|---|---|---|---|
| 1 | 남원 정사 4시점(2504·2506·2508·2510) | `assets/tiles/namwon_25xx/` | 1–2cm, z12–19, 10MB. 타임슬라이더, 스와이프, 변화의 서사 | 최상 |
| 2 | 남원 비닐하우스 AI 추론 1,674 | `assets/data/geo/results/namwon-greenhouse-2025.geojson` | 전역 커버리지, conf·pnu·emd 속성. 3D 압출, 필지 연동 | 최상 |
| 3 | 남원 농경지 AI 추론 2,098 | `.../results/namwon-farmland-2025.geojson` | 같은 스키마. 분석과 통계 | 최상 |
| 4 | 남원 전역 정사 2시점(2504·2510) | `assets/tiles/namwon_city_25xx/` | z11–17, 36MB. 시 단위 비교와 대시보드 줌인 대상 | 상 |
| 5 | 남원 변화탐지 456 + 격자 + 변화 타일 | `geo/namwon-change*.geojson`, `tiles/namwon_change_2504_2510` | 4시점 쌍별 cls·score. 변화 분석 화면 | 상 |
| 6 | 해양쓰레기 여수(항공 2025 1,857 / 드론 2026 2,078 + grid100) | `geo/results/yeosu-*` | 2개 연도, 항공과 드론 비교. mask·cat 속성. 헥사와 컬럼 | 상 |
| 7 | 서남해 해양쓰레기 5,000 + 격자 9,032 | `geo/marine-debris*.geojson` | 광역. 히트맵과 헥사, 대시보드 | 상 |
| 8 | 남원 건물 5,109(Overture, 추정 높이) + 지형 z9–13 | `assets/data/3d/` | 오프라인 3D 마을과 지형. 높이는 "추정"으로 표기 | 상 |
| 9 | 국산리 드론 정사 A68·A71(5cm) | `assets/tiles/kuksan_a*/` | 드론 워크플로, ScenegraphLayer 시연 | 중 |
| 10 | 제주 2020·2022 정사 + 토지형질 세그 + 불법건축 라벨 | `assets/tiles/jeju_*`, `geo/jeju-illegal.geojson` | 세그멘테이션 결과 래스터를 보유한 유일한 세트. AI 라벨 시연 | 중 |

보조 자산: glb 3종(드론·항공기·위성), 시도/시군구/읍면동 경계, 크롭 144장.
샘플이라 운영에 쓰면 안 되는 것: detections-sample, orgs, projects-extent, sigungu-sample.

---

## 6. 리스크와 미검증 항목
- iGPU(사무용 노트북) 성능이 검증되지 않았다. 지형과 DPR2는 티어에 따라 강등해야 한다.
- deck UMD 안의 h3-js 포함 여부, `serve.mjs`의 Range 지원, tippecanoe 설치 여부는 확인하지 않았다.
- 이 E: 사본에는 원천 TIF와 라벨 원본(`build/`, `02. 데이터`)이 없다. 추가 줌이나 재타일링이 필요하면 원 PC(F:)가 필요하다.
- V-World 키로 건물 WFS/데이터 API가 막혀 있다(`INCORRECT_KEY`). 유형 추가 신청이 선행돼야 한다.
- 스파이크 문서의 경로 일부는 과거 PC(F:, C:\Users\oem) 기준이다.
