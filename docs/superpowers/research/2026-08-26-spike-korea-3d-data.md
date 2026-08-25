# SPIKE — 한국 마을을 3D 로 세우기 위한 데이터 조달 (남원·전주·여수·제주)

작성일 2026-08-26 · 브랜치 `plan1-foundation`
코드 `tools/data3d/` · 산출물 `landxi/assets/data/3d/` · 증거샷 `shots/spikes/data3d/`
자매 문서 [2026-08-26 MapLibre 3D 스파이크](2026-08-26-spike-maplibre3d.md) §2 (풋프린트 품질 실측)

---

## 0. 결론 먼저

**한국 시골 마을의 "3D 주택"은 지금 당장 세울 수 있다. 단, 형상(footprint)과 높이(height)는 출처가 다르다.**

| | 지금 확보한 것 | 품질 |
|---|---|---|
| **건물 형상** | **Overture Maps** → 남원 코어 **5,231 동** | ✅ 실사용 가능. 정사영상 위에 지붕과 정확히 겹친다 |
| **건물 높이** | 없음 → **면적×용도 추정** | ⚠️ 추정. 실루엣은 살지만 실측 아님 |
| **지형** | **AWS Terrain Tiles** z9–13 로컬 미러 4.8 MB | ✅ 약 30 m DEM. 산세가 제대로 선다 |
| **바탕 영상** | V-World 위성 WMTS + 우리 정사영상 1.69 cm | ✅ 이미 우리 자산 |
| **구름** | **Himawari-9 (NICT)** 10분 간격, 키 불필요 | ✅ 실제 한반도 구름 |

### 이번 스파이크의 핵심 발견

> **Overture Maps 가 OSM 을 23 배 이긴다.** 같은 남원 bbox 에서 OSM 은 **226 동**,
> Overture 는 **5,231 동**이다. 차이는 `doi:10.5281/zenodo.8174931` —
> **CN-EAB(East Asian Buildings, Shi et al., 中山大)**, 동아시아 전역 ML 풋프린트, **CC-BY-4.0**.
> 자매 스파이크가 "후속 조사 항목"으로 남긴 Overture 경로를 이번에 뚫었고,
> "시골에서는 3D 마을이 성립하지 않는다"는 그 판정을 **형상에 한해 뒤집는다.**
> (자매 스파이크가 실측한 Microsoft GlobalMLBuildingFootprints 한국 미포함은 그대로 사실이다 —
> 한국을 덮는 것은 Microsoft 가 아니라 CN-EAB 다.)

**높이는 여전히 미해결이다.** 아래 §2 처럼 남원은 실측 높이가 **5,109 동 중 3 동**뿐이다.
정공법은 하나뿐: **V-World `lt_c_bldginfo` 의 `gro_flo_co`(지상층수)** — 이건 API 키 유형 추가 신청이 필요하다(§3).

### 권고

1. **지금 붙일 것** — `namwon-buildings.geojson`(5,109동) + `terrain-namwon/`(4.8 MB) + V-World 위성.
   높이는 추정이라고 UI 에 명시하고 간다. 증거샷 두 장이 이 조합으로 이미 나왔다.
2. **1주 내 할 것** — V-World 마이페이지에서 **「데이터 API」/「WFS」 유형 추가 신청**.
   승인되면 `gro_flo_co` 로 높이를 통째로 교체한다. 비용 0, 소요 수일.
3. **하지 말 것** — Google Photorealistic 3D Tiles(한국 커버리지 없음), 자체 DSM 재구축(원 DSM 부재, §5).

---

## 1. 소스 종합표

| 소스 | 남원 커버리지 | 높이 | 라이선스/비용 | 확보 절차 | 판정 |
|---|---|---|---|---|---|
| **Overture Maps** (buildings, GeoParquet on S3) | **5,231 동** (8×8 km) | ❌ 0 % | CDLA-Permissive-2.0 / 하위 CC-BY-4.0 + ODbL / **무료** | DuckDB `httpfs` 로 S3 직접 질의, 5 분 | ✅ **채택 — 형상 정답** |
| ├ CN-EAB `doi:10.5281/zenodo.8174931` | 5,005 동 | ❌ | **CC-BY-4.0** | Overture 경유 | ✅ |
| └ OpenStreetMap | 226 동 | 0.4 % | ODbL-1.0 | Overpass | ⚠️ 보조 |
| **OSM Overpass** 단독 | 226 동 | `height` 0 %, `levels` 0.4 % | ODbL-1.0 / 무료 | 즉시 | ⚠️ 도심 전용 |
| **V-World `lt_c_bldginfo`** | 전국 건축물대장 | ✅ **지상/지하 층수 실측** | 공공누리 / 무료 | **키 유형 추가 신청 필요** | 🔜 **높이 정답. 미확보** |
| **V-World WMTS** (Satellite/Base) | 전국 z19 | — | 출처표기 / 무료 | 현재 키로 즉시 | ✅ 사용 중 |
| **V-World 3D (xdworld)** | ? | ? | ? | 엔드포인트 전부 404 | ❌ 공개 경로 없음 |
| **Microsoft GlobalMLBuildingFootprints** | ❌ 한국 미포함 | — | ODbL | — | ❌ |
| **Google Photorealistic 3D Tiles** | ❌ **한국 메시 없음** | — | 유료 | — | ❌ (별도 스파이크 `dc8c17c` 실측) |
| **AWS Terrain Tiles** (Terrarium) | ✅ 전 지구 ~30 m | 지형 | Public Domain/CC-BY / **무료·키 불필요** | 즉시 미러 | ✅ **채택** |
| **국토지리정보원 DEM 5 m** | 전국 5 m | 지형 | 무료 | **국토정보플랫폼 로그인+신청** | 🔜 정밀도 필요 시 |
| **자체 정사영상** (남원 4시점) | 1.69 cm/px | ❌ DSM 없음 | 자사 | 이미 보유 | ✅ 바탕만 |
| **자체 DSM / 점군** | ❌ **존재하지 않음** | — | — | 재촬영/재처리 필요 | ❌ (§5) |
| **NASA GIBS** | 전 지구 | 구름 | 무료·키 불필요 | 즉시 | ✅ 일 1회 |
| **Himawari-9 (NICT)** | 한반도 포함 | 구름 | 비상업·출처표기 / 무료 | 즉시 | ✅ **10분 간격** |
| **기상청 API 허브** | 한반도 GK-2A | 구름 | 무료 | 회원가입+키 발급 | 🔜 |

---

## 2. Overture Maps — 이번 스파이크의 본론

### 2.1 접근 경로 (자매 스파이크가 403 으로 막혔던 지점)

PMTiles 경로 추정은 전부 403 이다. **정답은 GeoParquet + DuckDB** 다.

```bash
python -m pip install duckdb
python tools/data3d/fetch_overture_buildings.py namwon 127.346 35.374 127.434 35.446 \
       landxi/assets/data/3d/_raw-namwon-overture.geojson
```

```sql
INSTALL httpfs; LOAD httpfs; SET s3_region='us-west-2';
SELECT id, height, num_floors, ST_AsGeoJSON(geometry),
       list_transform(sources, x -> x.dataset)
FROM read_parquet('s3://overturemaps-us-west-2/release/2026-08-19.0/theme=buildings/type=building/*',
                  hive_partitioning=1)
WHERE bbox.xmin BETWEEN 127.346 AND 127.434
  AND bbox.ymin BETWEEN 35.374  AND 35.446;
```

`bbox` 구조체 컬럼이 row-group 프루닝을 해 준다. 그래도 원격 파케이 스캔이라 **1 AOI 당 약 5 분**이 걸린다
(남원 311 s, 서울 중구 50 s). 상시 조회가 아니라 **한 번 굽고 GeoJSON 으로 커밋**하는 용도다.
최신 릴리스 확인은 S3 버킷 리스팅(`?list-type=2&delimiter=/&prefix=release/`) — 현재 `2026-08-19.0`.

### 2.2 실측 결과

| AOI | 총 동수 | `height` 보유 | `num_floors` | 높이 % | 비고 |
|---|---:|---:|---:|---:|---|
| **남원 금지·송동** 127.346–127.434 / 35.374–35.446 | **5,231** | 0 | 1 | **0.00 %** | OSM 226 동의 **23 배** |
| **서울 중구** 126.965–127.010 / 37.550–37.575 | 10,936 | 705 | 1,071 | **6.45 %** | 중앙값 48.0 m (고층만) |

출처 내역(남원): `doi:10.5281/zenodo.8174931` **5,005** / `OpenStreetMap` **226**.

> **판정.** 형상은 완승, 높이는 완패다. 서울 도심에서조차 6 % 이고 그나마 OSM 유래 고층 빌딩이다.
> **Overture 의 `height` 컬럼으로 한국 마을을 세울 수는 없다.**

### 2.3 산출물 — `landxi/assets/data/3d/namwon-buildings.geojson`

`tools/data3d/build_namwon_buildings.py` 가 Overture 형상 + OSM 속성(100 m 그리드 근접 조인) + 높이 모델을 합친다.

- **5,109 동 / 2.14 MB** (12 ㎡ 미만 노이즈 122 동 제외)
- **실측 높이 3 동** (`osm_levels`), 나머지 5,106 동은 `height_src="estimated_area"`
- 모든 피처에 **`height_is_estimate` 불리언**이 붙는다. UI 는 이 값으로 색을 달리해야 한다.

높이 추정 규칙(농촌 실태 기준, 층고 3.0 m + 박공지붕 1.0 m):

| 바닥면적 | 추정 높이 | 추정 용도 |
|---|---|---|
| < 60 ㎡ | 3.0 m | 부속사/창고 |
| 60–250 ㎡ | 4.0 m | 단독주택 |
| 250–800 ㎡ | 5.5 m | 축사/창고/근생 |
| ≥ 800 ㎡ | 7.5 m | 대형축사/공장/학교 |

> 이건 **시각화 전용**이다. 분석·법적 용도로 쓰면 안 된다. GeoJSON `metadata.height_source` 에도 못 박아 두었다.

### 2.4 증거

`shots/spikes/data3d/namwon-3d-stack.png` — V-World 위성 + Terrarium 지형 + 5,109 동 압출, pitch 62°.
`shots/spikes/data3d/namwon-3d-village-closeup.png` — z17.4 근접. **압출된 상자가 항공영상의 지붕과 화소 단위로 겹친다.**
CN-EAB 풋프린트의 기하 정확도가 실사용 수준임을 보여 준다.

```bash
PORT=4183 node tools/serve.mjs
node tools/data3d/shot.mjs && node tools/data3d/shot2.mjs
```

---

## 3. V-World — 키 유형이 문제다 (자매 스파이크 §2.2 재확인)

| 엔드포인트 | 결과 |
|---|---|
| `wmts/1.0.0/{KEY}/Base/14/…png` | ✅ 200, 7,554 B PNG |
| `wmts/1.0.0/{KEY}/Satellite/14/…jpeg` | ✅ 200, 14,906 B JPEG |
| `req/data?data=LT_C_BLDGINFO` | ❌ `INCORRECT_KEY` |
| `req/wfs?TYPENAME=lt_c_bldginfo` | ❌ `INCORRECT_KEY` |
| 잘못된 키로 WMTS (대조군) | 448 B 오류 타일 → **키는 살아 있다** |

**3D 전용 서버 `xdworld.vworld.kr/XDServer3d/` 는 시도한 경로가 전부 Tomcat 404 다**
(`/dem`, `/image`, `/facility`, `/tile3d/facility/...`, 구 `XDServer/DEMProxyHandler`).
호스트는 살아 있으나 **공개 문서화된 타일 경로가 없다** — 뷰어 JS 번들 내부에서 조립된다. 채택 불가.

> **조치(반복).** vworld.kr 마이페이지 → 같은 키에 **「데이터 API」 또는 「WFS/WMS」 유형 추가 신청**,
> 인증 도메인에 배포 도메인 + `localhost` 등록. `lt_c_bldginfo` 는
> `gro_flo_co`(지상층수)·`und_flo_co`·`bdtyp_cd`(용도)·`bd_mgt_sn`·`buld_nm` 을 준다.
> 승인되면 `build_namwon_buildings.py` 의 `AREA_RULES` 분기를 `gro_flo_co × 3.0 + 1.0` 으로 바꾸면 끝이다.

---

## 4. 국가 포털 — 전부 로그인/신청 벽

무인증 직접 접근 가능 여부만 실측했다(HTTP 코드).

| 포털/데이터 | 결과 | 필요 절차 |
|---|---|---|
| 국가공간정보포털 `data.nsdi.go.kr` (GIS건물통합정보) | 연결 실패(000) | 회원가입 + 오픈마켓 신청 |
| 공공데이터포털 `data.go.kr` 파일데이터 | 404 (직링크 없음) | 회원가입 + 활용신청, 승인 즉시~1일 |
| 국토정보플랫폼 `map.ngii.go.kr` (DEM 5 m/90 m) | 404 | 실명 회원가입 + 신청, 도엽 단위 배포 |
| 도로명주소 `business.juso.go.kr` (건물 SHP) | 404 | 회원가입 + 승인 |
| 정밀도로지도 (국토지리정보원) | — | 신청·심의. 자율주행용, 마을 3D 에 불필요 |

> **판정.** 전부 무료지만 **사람이 로그인해서 신청**해야 한다. 자동 파이프라인에 넣을 수 없다.
> 우선순위는 **V-World 데이터 API 유형 추가**(가장 빠르고 높이를 준다) > 국토정보플랫폼 DEM 5 m > 나머지.

---

## 5. 자체 사진측량 — DSM 이 없다

`F:` `E:` 를 깊이 4 까지 전수 스캔했다.

```
find /f /e -maxdepth 4 \( -iname "*.las" -o -iname "*.laz" -o -iname "*dsm*" -o -iname "*dem*" \)
→ 해당 없음 (스크립트 파일 3건만 오탐)
```

`F:\a68_out` `F:\a71_out` `E:\namwon_final` `F:\namwon_final` 에 있는 것은 **전부 정사영상뿐**이다.

| 파일 | 크기 | 밴드 | 해상도 | CRS |
|---|---|---|---|---|
| `E:\namwon_final\nw_2506.tif` (2504/2506/2508/2510 4시점) | 2,584,435 × 1,693,197 px | 4 (RGBA) | **1.69 cm/px** | EPSG:5186 |
| `F:\a71_out\ortho_kuksan2_a71_zenmuse.tif` | 32,790 × 28,110 px | 3 | 5 cm/px | EPSG:5186 |

> **판정.** DSM/점군이 없으므로 DSM → Terrarium 으로 실측 높이를 뽑는 경로는 **이번엔 불가**다.
> 원 영상에서 DSM 을 재구축하는 것은 스파이크 범위를 크게 넘는다(수 TB 급 SfM 재처리).
> 대신 공개 DEM 을 미러하는 `tools/data3d/mirror_terrarium.py` 를 만들어 지형을 확보했다(§6).
> **후속:** 다음 남원 비행 때 처리 산출물에 **DSM GeoTIFF 를 반드시 포함**시키면
> 그때는 1.69 cm 급 실측 건물 높이가 나온다 — 이게 우리만의 해자가 된다.

---

## 6. 지형 — AWS Terrain Tiles 미러 (즉시 사용 가능)

키도 계정도 필요 없다. `elevation-tiles-prod` 버킷이 그대로 열려 있다.

```bash
python tools/data3d/mirror_terrarium.py 127.24 35.28 127.54 35.54 9 13 \
       landxi/assets/data/3d/terrain-namwon 14
```

산출: **z9–13, 114 타일, 4.8 MB**, AOI 약 27 × 29 km, `tiles.json`(TileJSON) 동봉.

**z14 이상을 뺀 이유 — 실측으로 판단했다.** 타일을 디코딩해 고유 표고값 수를 셌다.

| z | 표고 범위 | 고유값 수 | 타일 크기 |
|---|---|---:|---:|
| 12 | 81–468 m | 379 | 40 KB |
| 13 | 81–408 m | 297 | 27 KB |
| **14** | 94.8–218 m | **7,580** | **96 KB** |
| 15 | 95.7–202 m | 6,739 | 85 KB |

z12–13 은 **정수 표고**(원 SRTM/Copernicus ~30 m 격자), z14 부터는 **보간된 실수**다.
정보량은 늘지 않는데 타일은 3.5 배 커진다 — z14 만 94 타일 9.1 MB 였다.
**z13 까지 굽고 MapLibre 의 overzoom 에 맡기는 것이 정답**이다.

MapLibre 결선:

```js
sources: { dem: { type:'raster-dem', tiles:['/landxi/assets/data/3d/terrain-namwon/{z}/{x}/{y}.png'],
                  tileSize:256, minzoom:9, maxzoom:13, encoding:'terrarium' } }
map.setTerrain({ source:'dem', exaggeration:1.35 });
```

> 30 m DEM 은 **산세**에는 충분하고 **마을 안 미세기복**에는 부족하다. 후자가 필요하면 국토지리정보원 5 m DEM(§4).

---

## 7. 구름 — 실제 위성, 키 없이

### 7.1 Himawari-9 / NICT — 10분 간격, 한반도 포함 ✅ 권장

```
https://himawari8-dl.nict.go.jp/himawari8/img/D531106/latest.json
  → {"date":"2026-08-25 20:50:00", "file":"PI_H09_..."}

https://himawari8.nict.go.jp/img/D531106/{level}/550/{YYYY}/{MM}/{DD}/{HHmmss}_{x}_{y}.png
  level = 1d | 4d | 8d | 16d | 20d   (n×n 타일 그리드, 각 550 px, 전구 디스크)
```

실측: `1d/550/2026/08/25/205000_0_0.png` → **200, 249 KB, 550×550 PNG** (전구 1장, 한반도 포함).
`latest.json` 의 시각을 **그대로** `YYYY/MM/DD/HHmmss` 로 넣어야 한다 — 임의 시각은 404 다.
`4d` 이상은 한반도가 든 `{x}_{y}` 를 찾아야 한다(전구 디스크라 다수 타일이 우주=거의 빈 PNG).

> ⚠️ NICT 이용조건은 **비상업·출처표기** 기반이다. 상업 배포 전 조건 재확인 필수.

### 7.2 NASA GIBS — 일 1회, 라이선스가 깨끗함

```
https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/{layer}/default/{YYYY-MM-DD}/{tileMatrixSet}/{z}/{y}/{x}.{ext}
```

실측 200 확인:

| 레이어 | 형식 | TileMatrixSet | 용도 |
|---|---|---|---|
| `VIIRS_NOAA21_CorrectedReflectance_TrueColor` | jpg | `GoogleMapsCompatible_Level9` | 실사 구름/지표, ~250 m, 일 1회 |
| `MODIS_Terra_Cloud_Fraction_Day` | png | `GoogleMapsCompatible_Level6` | 운량 정량 오버레이 |

`GOES-East/West_ABI_GeoColor` 는 404 — **아메리카 전용이라 한반도를 덮지 않는다.**
전체 목록: `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/WMTSCapabilities.xml` (5.8 MB).

### 7.3 기상청 API 허브

`https://apihub.kma.go.kr/` 200. GK-2A 천리안 2A 위성영상을 준다. **무료지만 회원가입 + 키 발급**이 필요하다.
한반도 전용 최고 해상도가 필요할 때의 다음 카드.

---

## 8. 산출물 목록

```
tools/data3d/
  fetch_osm_buildings.mjs         Overpass → GeoJSON (엔드포인트 3중 폴백)
  fetch_overture_buildings.py     Overture S3 GeoParquet → GeoJSON (DuckDB)
  overture_height_coverage.py     다중 AOI 높이 커버리지 집계
  build_namwon_buildings.py       형상+속성+높이 병합 → 최종 데이터셋
  mirror_terrarium.py             공개 DEM AOI 미러 → raster-dem + TileJSON
  preview.html / shot.mjs / shot2.mjs   3D 스택 검증 + 증거샷

landxi/assets/data/3d/
  namwon-buildings.geojson        ★ 5,109 동 / 2.14 MB
  terrain-namwon/{z}/{x}/{y}.png  ★ z9–13 / 114 타일 / 4.8 MB + tiles.json
  _raw-namwon-overture.geojson    원본 5,231 동
  _raw-namwon-osm.geojson         원본 226 동

shots/spikes/data3d/              증거샷 2 장 (.gitignore 로 미커밋)
```

## 9. 다음 단계

1. **V-World 데이터 API 유형 추가 신청** → `gro_flo_co` 로 높이 전면 교체. (최우선, 비용 0)
2. 전주·여수·제주 AOI 도 `fetch_overture_buildings.py` 로 굽기 (AOI 당 약 5 분).
3. 우리 AI 검출 비닐하우스(`namwon-greenhouse-2025.geojson`, 남원 1,674 동)를
   Overture 풋프린트와 합치기 — 온실은 우리가 유일하게 **실측 용도**를 아는 객체다.
4. 다음 비행 처리 산출물에 **DSM GeoTIFF 포함 요청** → 1.69 cm 급 실측 높이.
5. 상업 배포 전 라이선스 재확인: CN-EAB(CC-BY-4.0 표기), OSM(ODbL 표기), NICT(비상업 조건).
