# recon-0924 · vworld — V-World API 실호출 조사

조사일 2026-09-24 · 읽기 전용(파일 변경 없음, 이 보고서만 작성) · 키 값은 적지 않음(`{KEY}` 로 가림)
호출 스크립트: 스크래치패드 `vw1.py`~`vw4.py` (python urllib, `Origin: http://localhost:4173` 헤더 부착)

---

## 0. 결론 먼저 (가장 중요)

1. **`.env.local` 의 `VWORLD_KEY` 는 만료됐다.** WMTS·Data·검색·주소·WMS 모두 같은 응답이다.
   - WMTS: HTTP **200**, `application/xml`, `ExceptionReport … locator="key"`, 문구는 "인증키가 만료되었습니다."(EUC-KR)
   - Data/검색/주소 API: HTTP 200 JSON `{"status":"ERROR","error":{"level":"1","code":"EXPIRE_KEY"}}`
   - 비교용으로 가짜 키를 넣으면 `INVALID_KEY`("등록되지 않은 인증키")가 온다. 그러니 키 자체는 등록돼 있고 **기한만 지났다**. V-World 마이페이지에서 기간을 연장하거나 다시 발급하면 된다(개발키는 보통 3개월, 운영키는 도메인 심사 후 연장).
2. **그래서 지금 모든 지도 화면은 키 없는 `xdworld.vworld.kr` 로 폴백해서 돌아가고 있다.** `sources.js` 의 `resolveVWorld()` 가 확인용 타일(z9)의 content-type 이 `image` 인지 보고 판단하므로 폴백 자체는 정상으로 동작한다(200+XML 응답도 걸러냄).
3. 키 없는 xdworld 는 **Base·Satellite 가 z19**, Hybrid z6–19, midnight·white z6–18까지 나오고 `Access-Control-Allow-Origin: *` 이다. 배경지도로는 지금도 운영 수준이다. **`gray` 레이어만 xdworld 에 없다**(모든 줌 404). 현재 코드는 gray 를 Base 에 채도 -1 을 줘서 흉내 내므로 문제없다.
4. **Data API(연속지적·행정구역·건물·도로·용도지역·임상도)는 키가 살아나기 전까지 검증할 수 없다.** 응답에 **CORS 헤더가 없다**(`Access-Control-Allow-Origin` 없음, OPTIONS 에도 없음). 그래서 브라우저에서 `fetch` 로 직접 부를 수 없고, 쓸 수 있는 길은 **JSONP(`callback=`)** 와 **서버 프록시** 둘뿐이다. JSONP 는 만료 키로도 `application/javascript` + `cb123({...})` 형태로 응답하는 것을 확인했다.
5. **V-World 는 MapLibre 가 쓸 수 있는 DEM(raster-dem) 타일을 공개하지 않는다.** 3D 는 자체 WebGL SDK(`map.vworld.kr/js/webglMapInit.js.do`, XDWorld 엔진) 안에서만 쓸 수 있다. 3D 지형은 **AWS Terrarium(검증 완료: z15까지 CORS `*`)** 이나 이미 쓰는 **Mapterhorn(z12, 512px)**, 또는 로컬 미러 `terrain-namwon` 으로 간다.

---

## 1. 기존 코드에서 V-World 를 쓰는 방식

| 위치 | 내용 |
|---|---|
| `tools/serve.mjs` L8–17, L41–44 | `envJs()` 가 `.env.local` 에서 `VWORLD_KEY=` 를 정규식으로 읽어 `/landxi/proto/env.js` 요청에 `window.VWORLD_KEY="…"` 를 돌려준다(`no-store`). 소스 코드에는 키가 없다. 다만 **브라우저에 평문으로 노출**되므로, 운영 환경에서는 도메인을 제한한 키를 쓰거나 서버 프록시를 둬야 한다. |
| `landxi/proto/js/sources.js` | `VSAT_FREE`/`VHYB_FREE` = xdworld 템플릿. `keyed()` = `https://api.vworld.kr/req/wmts/1.0.0/{key}/{layer}/{z}/{y}/{x}.{ext}` (**y/x 순서**에 주의). `resolveVWorld()` 는 z9/204/437 타일 1장으로 키 상태를 확인하고, 살아 있으면 keyed 템플릿에 z7–18, 아니면 xdworld 에 z5–19 로 설정한다. `DEM` = Mapterhorn webp, `OFM` = OpenFreeMap 벡터, `GLYPHS` = OpenFreeMap 폰트. |
| `landxi/proto/map-gl.js` L14–31 | `createMap()` 이 raster 소스 4개(vsat·vbase·vnight·vhyb)를 만든다. `swap()` 은 Satellite 템플릿의 레이어명과 확장자만 바꿔 Base(png)·midnight(png)를 만든다. `setBase()` 의 gray 는 Base 레이어에 `raster-saturation -1` 을 주는 방식이다. `maxZoom 18.4`. |
| `landxi/proto/admin-map.js` L142–147 | map-gl 과 같은 swap 로직을 복제해 두었다. |
| `landxi/proto/js/dive.js`, `js/style.js` | 시네마틱 다이브. `resolveVWorld()` 와 `DEM`(Mapterhorn terrarium, tileSize 512, maxzoom 12)을 쓰고, hillshade 소스(`dem`)와 3D terrain 소스(`dem2`)를 분리했다. |
| `landxi/proto/spikes/maplibre3d/spike.js` | keyed/xdworld 선택 로직을 직접 넣었다. DEM 은 **로컬** `/landxi/assets/data/3d/terrain-namwon/{z}/{x}/{y}.png`. |
| `landxi/assets/js/map/style.js`, `tools/crops/lib.py` | xdworld Satellite 하드코딩. crops 는 xdworld 타일을 받아 학습·시연용 크롭을 만든다. |
| 전체 | **Data·검색·주소·WMS API 를 호출하는 코드는 없다.** 행정경계는 `tools/fetch-boundaries.mjs` 가 GitHub(vuski/admdongkor 2021-04 스냅샷)에서 받아 `sigungu.geojson` 등으로 정적화했다. |

감사(audit-0923) 지적 사항과 연결: 지도 화면이 모두 xdworld 라는 외부 망에 기대므로 폐쇄망에서는 빈 화면이 된다. 키를 갱신해도 이 문제는 그대로다. 로컬 배경 폴백(정사영상 타일 + 행정경계)은 별도로 필요하다.

---

## 2. WMTS 배경지도 실측

남원 중심 (127.39, 35.416) 타일, `Origin: http://localhost:4173`.

### 2-1. 인증키 WMTS `api.vworld.kr/req/wmts/1.0.0/{KEY}/{layer}/{z}/{y}/{x}`
Base·Satellite·Hybrid·gray·midnight·white 모두, z6–20 전 구간, 그리고 `WMTSCapabilities.xml` 까지 **HTTP 200 + 444B XML 예외(키 만료)** 가 왔다. 그러니 이 키로는 최대 줌을 확인할 수 없다. 공식 문서 기준(미검증)은 z6/7–19(Satellite 19)이며, 코드는 보수적으로 7–18 을 쓴다. 에러 응답에도 `ACAO: *` 가 붙어 있어서 브라우저는 CORS 오류 대신 "이미지 디코드 실패"를 낸다.

### 2-2. 키 없는 xdworld `xdworld.vworld.kr/2d/{layer}/service/{z}/{x}/{y}.{ext}` (**x/y 순서**)

| 레이어 | z5 | z6 | z7 | z10 | z14 | z17 | z18 | z19 | z20 | CORS |
|---|---|---|---|---|---|---|---|---|---|---|
| Base (png) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 404 | `*` |
| Satellite (jpeg) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 404 | `*` |
| Hybrid (png) | 404 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 404 | `*` |
| gray | 404 | 404 | 404 | 404 | 404 | 404 | 404 | 404 | 404 | — |
| midnight (png) | 404 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 404 | 404 | `*` |
| white (png) | 404 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 404 | 404 | `*` |

- 여수 해안 (127.66, 34.74) Satellite z19 도 200 image/jpeg 로 확인했다.
- 응답 헤더: `ETag`, `Last-Modified: Tue, 17 Mar 2026` 이다. 영상은 2026년 3월에 갱신됐고, `Cache-Control` 은 없다.
- **z19 Satellite ≈ 0.25 m/px(위도 35°)** 로, 드론 정사영상과 비교해 보여 주기에 충분하다.
- **개선안**: map-gl 의 `maxZoom 18.4` 와 keyed 경로의 `maxzoom 18` 을 레이어별로 나눈다(Sat·Base 19, midnight·white 18, Hybrid minzoom 6). `raster` 소스에 `maxzoom:19` 를 주면 그 위 줌은 오버줌된다.

---

## 3. Data API 2.0 (GetFeature)

호출 형식(검증됨, 키만 만료):
```
https://api.vworld.kr/req/data?service=data&request=GetFeature&data=<LAYER>&key={KEY}
 &geomFilter=BOX(minx,miny,maxx,maxy)&size=10&page=1&format=json&geometry=true&attribute=true
 &crs=EPSG:4326&domain=<등록도메인>[&callback=<fn>]
```
- 시험한 레이어(남원 BOX(127.38,35.40,127.40,35.42)): `LP_PA_CBND_BUBUN`(연속지적), `LT_C_ADSIGG_INFO`(시군구), `LT_C_ADEMD_INFO`(읍면동), `LT_C_SPBD`(도로명주소 건물), `LT_L_MOCTLINK`(교통 링크/도로), `LT_C_UQ111`(용도지역 도시지역), `LT_C_FSDIFRSTS`(임상도). **모두 `EXPIRE_KEY`** 였고, 레이어명 오류(`INVALID_DATA` 류)는 한 건도 없었다. 서버가 레이어명보다 키를 먼저 검사하는 것으로 보여서, 레이어명이 맞는지도 아직 확정하지 못했다.
- 응답 형식: `application/json;charset=UTF-8`. 본문 구조는 `response.service/status/error`, 성공하면 `response.result.featureCollection`(GeoJSON), `response.page{total,current,size}`(문서 기준).
- **CORS: 없음.** GET·OPTIONS 모두 `Access-Control-*` 헤더가 없다. 브라우저에서 직접 `fetch` 하면 차단된다.
- **JSONP: 동작한다.** `callback=cb123` 을 주면 `application/javascript` 로 `cb123({...})` 가 온다. 브라우저에서 부를 수는 있지만, `domain` 파라미터가 키에 등록된 도메인과 맞아야 한다(문서상 제약).
- 문서상 제약(미검증): `size` 최대 1000, `page` 로 페이징, BOX 면적 제한(너무 크면 오류), 일일 호출 한도. 남원 전체 필지(수십만 건)를 실시간으로 받는 것은 불가능하다. **AOI 단위(1–2 km BOX)로 페이징해 받고 서버에서 캐시**하는 방식이 현실적이다.
- **WMS**(`/req/wms`, `lp_pa_cbnd_bubun` 스타일 이미지)도 키 만료로 `ServiceExceptionReport` 가 왔고 CORS 헤더가 없다. 다만 `<img>`/MapLibre raster 로 쓰면 CORS 가 없어도 **표시는 된다**(캔버스 픽셀을 읽지 않으면 문제없음). **키만 갱신되면 연속지적 WMS 를 raster 소스로 바로 얹을 수 있고, 가장 싸게 "실데이터 지적도"를 보여 줄 수 있다.** MapLibre 는 raster 소스를 fetch 로 받으므로 CORS 가 필요하다. `ACAO` 가 없으면 실패하므로 **프록시 경유가 안전하다.**

## 4. 검색 / 주소 API
- `req/search` (place, "남원시청") → `EXPIRE_KEY`, CORS 헤더 없음.
- `req/address` (getcoord, 도로명) → `EXPIRE_KEY`, CORS 헤더 없음.
- 형식은 Data API 와 같다(JSON, JSONP 가능할 것으로 봄). 이 두 API 가 살아나면 XI맵 상단 **장소·주소 검색 → flyTo** 가 가능하다.

## 5. 3D / DEM
- V-World 는 **raster-dem(표고) 공개 타일을 주지 않는다.** 3D 는 WebGL SDK(`map.vworld.kr/js/webglMapInit.js.do?version=3.0`, 200 OK, XDWorld 엔진 전용)로만 제공되고 MapLibre 와 섞을 수 없다. 국토지리정보원 수치표고(DEM 5 m/90 m)는 파일로만 배포되고 V-World Data API 에는 없다(문서 기준).
- 대안 실측:

| 소스 | URL | 결과 | 비고 |
|---|---|---|---|
| **AWS Terrain Tiles (Terrarium)** | `s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png` | z12·z15 200 PNG, `ACAO *` | 256px, 키 불필요. 한국은 SRTM 30 m 기반이라 z13 이 원해상도. 퍼블릭 도메인/CC-BY |
| **Mapterhorn** (현재 dive 사용) | `tiles.mapterhorn.com/{z}/{x}/{y}.webp` | z12 200 webp(124 KB) `ACAO *`, 남원 z13·z14 **404** | 512px. 한국은 z12 까지만 있다. 코드의 `maxzoom:12` 가 맞다 |
| **로컬 미러** `landxi/assets/data/3d/terrain-namwon/` | tiles.json | z9–13, 114장, 4.9 MB, bounds [127.24,35.28,127.54,35.54] | AWS Terrarium 을 남원 30×30 km 만 잘라 둔 것. **오프라인 3D 가 가능하다**. 여수는 없다 |
| MapTiler Terrain RGB | `api.maptiler.com/tiles/terrain-rgb-v2/…?key=` | 미호출(키 없음) | 유료/무료 쿼터. 굳이 쓸 필요 없다 |
| 참고: Esri World Imagery | `server.arcgisonline.com/…/World_Imagery/MapServer/tile/{z}/{y}/{x}` | z18 200 jpeg, `ACAO *` | V-World 가 막혔을 때의 영상 대체재(약관상 출처 표기 필요) |
| 참고: EOX s2cloudless-2023 | `tiles.maps.eox.at/…` | z12 200, ACAO 헤더 없음(Origin 을 줘도) | 현재 최종 폴백 |
| 참고: OpenFreeMap planet | `tiles.openfreemap.org/planet` | TileJSON 200, 빌드 20260913 | 벡터 라벨·도로(키 불필요) |

---

## 6. Land-XI 활용안 (키 갱신 전과 후)

| 화면 | 지금 당장(키 없이) | 키 갱신 후 |
|---|---|---|
| XI맵 `ximap.html`/map-gl | xdworld Satellite z19·Hybrid 라벨 z19·Base·midnight·white. maxzoom 을 19 로 올린다 | 연속지적 WMS 오버레이(z15+), 필지 클릭 시 `LP_PA_CBND_BUBUN` GetFeature(점 BOX) → PNU·지목·공시지가 패널 |
| 분석 AOI/결과 | 로컬 `sigungu.geojson`·`namwon-emd.geojson` 행정경계 | `LT_C_ADEMD_INFO`·`LT_C_ADRI_INFO` 로 최신 경계 교체, 용도지역(`LT_C_UQ*`)·임상도로 탐지 결과를 교차 분석(예: 불법 개간 × 보전산지) |
| 검색 바 | 로컬 읍면동 이름 검색 | `req/search`·`req/address` → flyTo |
| 3D·다이브 | Mapterhorn z12 + 로컬 terrain-namwon | 변화 없음(V-World 에는 DEM 이 없다) |
| 건물 3D 압출 | `3d/namwon-buildings.geojson`(Overture, 2.1 MB) | `LT_C_SPBD`(층수 속성)로 높이 보강 |

**아키텍처 권고**: `serve.mjs` 에 `/api/vworld/*` 프록시를 추가한다(키는 서버에만 두고, `domain` 헤더를 주입하고, 응답을 디스크에 캐시하고, `ACAO` 를 붙인다). 이렇게 하면 CORS·키 노출·일일 한도·폐쇄망 시연(캐시 재생)을 한 번에 해결할 수 있다. `env.js` 로 키를 브라우저에 내리는 현재 방식은 프로토타입용으로만 쓴다.

---

## 7. 가치 상위 10 (이 조사 범위)

| # | 자산 | 상태 | 우선순위 |
|---|---|---|---|
| 1 | **VWORLD_KEY 갱신/재발급** (Data·WMS·검색·주소가 전부 이 키에 걸려 있다) | 만료(EXPIRE_KEY) | **P0** |
| 2 | xdworld Satellite z5–19 (2026-03 갱신, CORS `*`) | 동작 | P0 · 이미 사용 중, maxzoom 19 로 확장 |
| 3 | 연속지적 `LP_PA_CBND_BUBUN` (WMS 이미지 + GetFeature 속성) | 키 대기 | P0 · 키 갱신 직후 |
| 4 | `serve.mjs` V-World 프록시+캐시 (CORS 없음, JSONP 만 가능하므로 필수) | 미구현 | P0 |
| 5 | 로컬 DEM `terrain-namwon` z9–13 (오프라인 3D) | 동작 | P1 · 여수판 추가 |
| 6 | AWS Terrarium z≤15 (CORS `*`, 무키) | 동작 | P1 · Mapterhorn z12 한계의 보완/대체 |
| 7 | xdworld Hybrid(라벨) z6–19 · Base z5–19 · midnight/white z6–18 | 동작 | P1 · 레이어별 줌 범위를 코드에 반영 |
| 8 | 행정구역 `LT_C_ADSIGG_INFO`/`LT_C_ADEMD_INFO` (현행 경계, 로컬본은 2021-04 스냅샷) | 키 대기 | P1 |
| 9 | 용도지역 `LT_C_UQ111` 등, 임상도 `LT_C_FSDIFRSTS` (탐지 결과 교차 분석) | 키 대기 | P2 |
| 10 | 검색/주소 API (`req/search`, `req/address`) | 키 대기 | P2 |

(참고 대체재: Esri World Imagery z18 CORS `*`, OpenFreeMap 벡터 20260913)

---
## 추가 (2026-09-24 10:0x) — Data API 개통 확인
새 키(.env.local VWORLD_KEY)는 2D데이터·WMS/WFS·WMTS·검색·지오코더 등 전 API 활용 체크됨. **Data API 는 `domain=test.com` 일 때 OK** (등록 서비스 URL 기준, `.env.local` 의 `VWORLD_DOMAIN=test.com`). 실측: LP_PA_CBND_BUBUN 남원 쌍교동 BOX 에서 112필지, pnu·지번·지목 반환. CORS 없음 → 서버 프록시에서 domain 파라미터를 붙여 호출할 것.
