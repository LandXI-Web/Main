# 글로벌 사업 세계 지도: 실데이터 조사 (recon-0924)

- 조사일: 2026-09-24 (KST). 아래 HTTP 결과는 모두 이날 이 PC에서 `curl`로 직접 호출해 확인한 것이다. `Origin: https://example.com` 헤더를 붙여 CORS 응답을 확인했다.
- 대상 카드: `landxi/assets/data/cards.js` 의 SCOPES `global`, `card-global-farm`, `card-global-disaster`. 두 카드 모두 지금은 "대상국 미정"이다.
- 결론 요약
  1. **키 없이 브라우저에서 바로 쓸 수 있고 CORS도 열린 세계 데이터가 충분하다.** EOX S2 cloudless, NASA GIBS(일자별 MODIS/VIIRS와 **HLS 30m**), Planetary Computer(STAC와 타일러: **Sentinel-2 L2A 장면별·기간 모자이크·NDVI 식**, ESA WorldCover, Copernicus DEM), Overture buildings PMTiles, geoBoundaries, Natural Earth, Terrarium, USGS 지진이 여기에 해당한다.
  2. **대상국은 키르기스스탄으로 한다.** 로컬 1순위 자료(D:/SSD3/글로벌사업)와 LX 공식 사업현황 모두 키르기스스탄을 "진행 중인 국토부 ODA 사업국"으로 확인해 준다. 농업 AI 제안서는 **추이(Chuy) 주 으슥아타(Ysyk-Ata) 군**을 시범지로 명시하고, **Land-XI 플랫폼 연계**도 적어 두었다.
  3. **재해 카드는 키르기스스탄 사례가 Copernicus EMS에 없다.** 대신 LX 사업 이력국(ODA 대상 지역)과 겹치는 **미얀마 지진(EMSR798, 2025-03-28)** 을 쓴다. 이 사례에는 EMS의 실제 건물 피해 판독 벡터, Maxar 전후 영상(0.5m), Overture 건물이 모두 공개돼 있다.

---

## 1. 브라우저용 세계 실데이터 검증표

표기: ✅ 키 없음, CORS 허용(`*` 또는 Origin 반사) / ⚠️ 동작하지만 조건 있음 / ❌ 브라우저에서 직접 부를 수 없음(프록시·사전 가공 필요)

### 1-1. 위성 배경

| 소스 | 검증 URL(템플릿) | 결과 | CORS | 최대 줌 | 라이선스·표기 | 판정 |
|---|---|---|---|---|---|---|
| **EOX Sentinel-2 cloudless** 연도별 | `https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-{YYYY}_3857/default/g/{z}/{y}/{x}.jpg` (행/열 순서가 **z/y/x**) | 200 (2016~**2025** 레이어가 Capabilities에 있음. 2020·2023·2024·2025 호출 확인) | Origin 반사 | TileMatrix 22단계. 비슈케크에서 z13~z17 모두 200이지만 z15부터는 업샘플이다(원본 10m). **실사용 z14 전후** | **2016·2017 = CC BY 4.0. 2018~2025 = CC BY-NC-SA 4.0(비상업)**. 상업용은 cloudless.eox.at에서 별도 계약. 표기 예: "Sentinel-2 cloudless – https://s2maps.eu by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2024)" | ✅ 공공 시연 가능. 수출(유상) 서비스에 넣으려면 2017년판 또는 상용 계약 |
| **NASA GIBS** 일자별 TrueColor | `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/{Layer}/default/{YYYY-MM-DD}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg` | 200. `MODIS_Terra_CorrectedReflectance_TrueColor` 기본값 2026-09-24(당일). `VIIRS_SNPP_…`, `VIIRS_NOAA20_…`, `VIIRS_NOAA21_…` 기본값 2026-09-23 | `*` | **z9** (250m급) | NASA 데이터라 제한 없음. 표기 권장: "Imagery: NASA GIBS / ESDIS" | ✅ 글로브의 **'오늘의 지구'**. 날짜 슬라이더로 live 느낌을 낸다 |
| **NASA GIBS HLS** (Harmonized Landsat–Sentinel, 30m) | `…/HLS_S30_Nadir_BRDF_Adjusted_Reflectance/default/{date}/GoogleMapsCompatible_Level12/{z}/{y}/{x}.png` (L30도 있음) | 200 (비슈케크 z12, 2026-09-18, 137KB 실영상). 기본값 2026-09-21 | `*` | **z12** (30m) | 위와 같음 | ✅ **키 없이 쓰는 일자별 Sentinel-2 계열 영상**. 지역 줌 단계에 적합 |
| GIBS 기타 | `VIIRS_SNPP_Thermal_Anomalies_375m_All`(화재, z8), `MODIS_Combined_Flood_2-Day`(홍수, z9), `MODIS_Terra_NDVI_8Day`(z9), `OPERA_L3_DIST-ALERT-HLS`(교란), `VIIRS_Black_Marble` | Capabilities에서 확인 | `*` | 표기 | NASA | ✅ 재해·식생 오버레이를 키 없이 쓸 수 있다 |
| **Esri World Imagery** | `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}` | 200 (z13~z19 응답, 최대 LOD 23) | `*` | ~z19 이상(지역마다 다름) | copyrightText: "Source: Esri, Vantor, Earthstar Geographics, and the GIS User Community". **약관상 ArcGIS 계정·라이선스(Location Platform 키, premium basemap 권한)가 필요하고 상업 이용은 불가**. 키 없는 레거시 엔드포인트는 기술적으로 응답만 할 뿐이다 | ⚠️ 내부 시연 참고용. 공개·수출 화면의 기본 배경으로 쓰지 않는다 |

### 1-2. 토지피복

| 소스 | 경로 | 결과 | CORS | 라이선스 | 판정 |
|---|---|---|---|---|---|
| **ESA WorldCover 10m** — Terrascope WMS/WMTS | `https://services.terrascope.be/wms/v2`, `/wmts/v2` (레이어 `WORLDCOVER_2021_MAP`) | **이 PC에서 연결 리셋(HTTP/2 INTERNAL_ERROR, HTTP/1.1 reset)**. 확인 불가 | – | CC BY 4.0 | ⚠️ 다른 네트워크에서 다시 확인 필요 |
| ESA WorldCover — AWS S3 COG | `https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/ESA_WorldCover_10m_2021_v200_N42E072_Map.tif` | 200/206 (Range 지원, 68MB) | **없음**(OPTIONS 403) | CC BY 4.0 | ❌ 브라우저 직접 COG 불가 → 서버 쪽 가공 또는 PC 타일러 사용 |
| **ESA WorldCover — Planetary Computer 타일러** | `https://planetarycomputer.microsoft.com/api/data/v1/item/tiles/WebMercatorQuad/{z}/{x}/{y}@1x?collection=esa-worldcover&item=ESA_WorldCover_10m_2021_v200_N42E072&assets=map&colormap_name=esa-worldcover` | 200 PNG (비슈케크 z12 확인. 공식 색상표 적용) | `*` | CC BY 4.0. 표기 "© ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data (2021) processed by ESA WorldCover consortium" | ✅ **키 없음. 권장 경로** |
| ESA WorldCover — 통계 API | `POST …/api/data/v1/item/statistics?collection=esa-worldcover&item=…&assets=map&categorical=true` (본문: GeoJSON Feature) | 200. 으슥아타 군 경계로 클래스 히스토그램을 받았다(§3-1 참조) | `*` | 〃 | ✅ 카드 차트 값을 **실측 통계**로 채울 수 있다 |
| **Esri/Impact Observatory Land Cover 10m 연도별** | `https://ic.imagery1.arcgis.com/arcgis/rest/services/Sentinel2_10m_LandCover/ImageServer/exportImage?bbox=…&bboxSR=4326&imageSR=3857&size=512,512&format=png&time={epoch_ms}&f=image` | 200 PNG. timeExtent **2017-01-01 ~ 2025-12-31** | Origin 반사 | copyright "Impact Observatory, Microsoft, and Esri". 데이터 CC BY 4.0 | ✅ 연도별 변화(2017→2025) 비교용. 타일이 아니라 exportImage이므로 MapLibre `image` 소스나 deck.gl BitmapLayer로 붙인다 |
| 같은 데이터 — PC `io-lulc-annual-v02` | STAC 컬렉션 200 | `*` | CC BY 4.0, 2017~2023 | ✅ 대안 |

### 1-3. 건물

| 소스 | 경로 | 결과 | CORS | 라이선스 | 판정 |
|---|---|---|---|---|---|
| **Overture Maps buildings PMTiles** | `https://overturemaps-extras-us-west-2.s3.us-west-2.amazonaws.com/tiles/2026-09-23.0/buildings.pmtiles` (최신 릴리스 2026-09-23.0. 같은 경로에 `base`, `divisions`, `transportation` 등) | 206 Range (파일 180.6GB) | `*` | ODbL(OSM 유래)과 CDLA-Permissive 혼합. 표기 "© OpenStreetMap contributors, Overture Maps Foundation" | ✅ **pmtiles 프로토콜로 MapLibre에서 바로 벡터 건물(높이 포함)을 쓸 수 있다.** 옛 `overturemaps-tiles-us-west-2-beta` 버킷은 AllAccessDisabled 상태 |
| **VIDA Google+Microsoft Open Buildings 결합 PMTiles** | `https://data.source.coop/vida/google-microsoft-open-buildings/pmtiles/go_ms_building_footprints.pmtiles` | 206 (208GB) | `*` | Google CC BY 4.0 / MS ODbL | ✅ Overture 대체·비교용 |
| **Microsoft Global ML Building Footprints** | `https://minedbuildings.z5.web.core.windows.net/global-buildings/dataset-links.csv` → 국가·쿼드키별 `.csv.gz`(GeoJSONL) | 200. **Kyrgyzstan 70개 쿼드키 파일**(2026-02-03 릴리스) | 없음 | ODbL | ❌ 직접 사용 불가 → 사전 가공(tippecanoe로 PMTiles 변환)해서 쓴다 |
| Google Open Buildings v3 | GCS 폴리곤 CSV(`open-buildings-data/v3/...`) | 확인한 경로 404. 커버리지는 아프리카·남/동남아·중남미 중심이다(키르기스스탄 포함 여부는 이번에 미확인) | – | CC BY 4.0 / ODbL | ⚠️ 키르기스스탄에는 VIDA나 Overture 사용 |

### 1-4. 행정경계

| 소스 | 경로 | 결과 | CORS | 라이선스 | 비고 |
|---|---|---|---|---|---|
| **geoBoundaries API** | `https://www.geoboundaries.org/api/current/gbOpen/KGZ/ALL/` | 200 JSON | `*` | KGZ ADM0·ADM1: **ODbL**(OSM 출처, 2017). ADM2: **CC BY-SA 3.0**(2010, 41개 district) | ADM1은 **7개 주만** 있고 비슈케크·오시 시는 별도 단위가 아니다(비슈케크는 Chuy Region 안) |
| geoBoundaries 파일 | API가 주는 `github.com/.../raw/...`는 **302 리디렉트에 CORS 없음** → 대신 `https://media.githubusercontent.com/media/wmgeolab/geoBoundaries/9469f09/releaseData/gbOpen/KGZ/ADM{0,1,2}/geoBoundaries-KGZ-ADM{n}_simplified.geojson` 사용(Git LFS 실파일) | 200/206 | `*` | 〃 | `raw.githubusercontent.com` 경로는 LFS 포인터(131B)만 준다. 주의 |
| **Natural Earth** | `https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json` (TopoJSON) / `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_countries.geojson` (13MB) | 200 | `*` | 퍼블릭 도메인 | 글로브 전 세계 국경용 |
| Overture divisions PMTiles | `…/tiles/2026-09-23.0/divisions.pmtiles` | 206 | `*` | ODbL | 국가·지역 경계를 벡터 타일로 받는 대안 |

### 1-5. 표고·지형

| 소스 | 경로 | 결과 | CORS | 최대 줌 | 라이선스 |
|---|---|---|---|---|---|
| **AWS Terrain Tiles (Terrarium)** | `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png` | 200 (z12, z15). **z16 = 404** | `*` | **z15** | 여러 출처 혼합(SRTM, GMTED, ETOPO1 등). 표기 "Terrain Tiles: Mapzen/AWS Open Data" 및 출처 목록 링크. MapLibre `raster-dem` `encoding: "terrarium"` |
| Copernicus DEM GLO-30 — AWS COG | `https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_N42_00_E074_00_DEM/…DEM.tif` | 206 | **없음** | – | 상업 포함 무료. 표기 "© DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the EU and ESA" |
| Copernicus DEM — PC 타일러 | `…/api/data/v1/item/tiles/WebMercatorQuad/{z}/{x}/{y}@1x.png?collection=cop-dem-glo-30&item=Copernicus_DSM_COG_10_N42_00_E074_00_DEM&assets=data&rescale=500,3000&colormap_name=terrain` | 200 | `*` | 제한 없음 | 색상 음영용. 3D 지형에는 Terrarium을 쓴다 |

### 1-6. 재해·실시간

| 소스 | 경로 | 결과 | CORS | 키 | 판정 |
|---|---|---|---|---|---|
| **USGS 지진 GeoJSON 피드** | `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/{all_hour,all_day,4.5_week,…}.geojson` | 200. all_day 257건(생성 시각 2026-09-24) | `*` | 없음 | ✅ 퍼블릭 도메인. 1분 주기로 갱신 |
| **NASA FIRMS API** | `https://firms.modaps.eosdis.nasa.gov/api/area/csv/{MAP_KEY}/VIIRS_SNPP_NRT/{w,s,e,n}/{days}` | 잘못된 키로 400, CORS 헤더 없음 | 없음 | **MAP_KEY 무료**(이메일 입력 → 메일로 발급, 5,000 트랜잭션/10분) | ⚠️ 키를 브라우저에 노출하지 않도록 **서버 프록시** 경유 |
| FIRMS 공개 CSV(키 없음) | `https://firms.modaps.eosdis.nasa.gov/data/active_fire/suomi-npp-viirs-c2/csv/SUOMI_VIIRS_C2_Global_24h.csv` (NOAA-20: `noaa-20-viirs-c2/.../J1_VIIRS_C2_Global_24h.csv`, MODIS: `modis-c6.1/...`) | 200 (8.8MB) | **없음** | 없음 | ❌ 직접 불가 → 크론으로 받아 정적 JSON으로 제공하거나, 브라우저에서는 **GIBS 화재 레이어(`VIIRS_SNPP_Thermal_Anomalies_375m_All`)** 사용 |
| **Copernicus EMS Rapid Mapping** 목록 | `https://rapidmapping.emergency.copernicus.eu/backend/dashboard-api/public-activations-info/?limit=300` | 200. 총 265건(최신 EMSR932, 2026-09-15) | **없음** | 없음 | ❌ 목록은 프록시나 사전 수집 |
| EMS 활성화 상세 | `…/dashboard-api/public-activations/?code=EMSR798` (AOI별 제품, `downloadPath`, extent) | 200 | 없음 | 없음 | 사전 수집 |
| EMS 제품 ZIP | `…/backend/EMSR798/AOI04/GRA_PRODUCT/EMSR798_AOI04_GRA_PRODUCT_v2.zip` → 302 → `rapidmapping.s3.amazonaws.com/...`(서명 URL) | 206 | S3 쪽 `*` | 없음 | ZIP 안에 **GeoJSON(builtUpP = 건물 피해 점, `damage_gra` 필드)**, SHP, PDF 지도가 들어 있다. 표기 "© European Union, Copernicus Emergency Management Service" |
| Maxar Open Data (재해 전후 고해상도) | `https://maxar-opendata.s3.amazonaws.com/events/catalog.json` → `Earthquake-Myanmar-March-2025/collection.json` | 200 | `*` | 없음 | **CC BY-NC 4.0**(비상업). 0.5m COG(visual/ms/pan) |

### 1-7. 동적 위성: Microsoft Planetary Computer

- **키 필요 여부: STAC 검색과 데이터 API 타일에는 키가 필요 없다(익명, 속도 제한 있음).** SAS 토큰은 원본 blob(COG)을 직접 읽을 때만 필요하다. 모든 응답에 `access-control-allow-origin: *`.
- STAC 검색 (검증):
  `POST https://planetarycomputer.microsoft.com/api/stac/v1/search`
  `{"collections":["sentinel-2-l2a"],"bbox":[74.4,42.7,74.8,43.0],"datetime":"2026-06-01/2026-09-23","query":{"eo:cloud_cover":{"lt":10}},"sortby":[{"field":"datetime","direction":"desc"}]}`
  → 비슈케크 최신 장면 `S2C_MSIL2A_20260919T055631_R091_T43TDH_…`(구름 2.3%). **닷새 전 영상까지 조회된다.**
- 장면별 트루컬러 타일 (검증, z13·z16 200):
  `…/api/data/v1/item/tiles/WebMercatorQuad/{z}/{x}/{y}@1x.png?collection=sentinel-2-l2a&item={id}&assets=visual&asset_bidx=visual|1,2,3&nodata=0`
- 장면별 **NDVI 타일** (검증, 200):
  `…&expression=(B08-B04)/(B08+B04)&asset_as_band=true&rescale=-0.2,0.8&colormap_name=rdylgn`
  (`B08_b1` 형식은 500 오류. **`asset_as_band=true`와 밴드명 그대로** 써야 한다.)
- **기간 모자이크** (검증): `POST …/api/data/v1/mosaic/register`에 CQL2 필터(영역, 기간, 구름 ≤10%)를 넣으면 `searchid`가 나온다. 이후 `…/mosaic/tiles/{searchid}/WebMercatorQuad/{z}/{x}/{y}@1x.png?collection=sentinel-2-l2a&assets=visual&asset_bidx=visual|1,2,3&nodata=0` 로 200(211KB) 응답. 월별 모자이크를 만들어 **시계열 슬라이더**에 쓸 수 있다.
- 라이선스: Sentinel-2는 Copernicus 무료·공개 데이터(상업 포함). 표기 "Contains modified Copernicus Sentinel data {year}", "Microsoft Planetary Computer".
- 주의: PC 데이터 API는 무료 공개 서비스라 SLA가 없다. 운영 단계에서는 자체 titiler로 옮길 수 있게 URL 빌더를 한 곳에 모아 둔다.

### 1-8. 권장 레이어 구성 (MapLibre 글로브 + deck.gl)

| 줌 | 배경 | 오버레이 |
|---|---|---|
| 0~5 (글로브) | GIBS VIIRS/MODIS TrueColor (**어제 날짜**, 매일 바뀜) | Natural Earth 국경, LX 사업국 강조(§2 표), USGS 지진, GIBS 화재 |
| 5~9 (국가) | EOX s2cloudless-2025 (비상업) 또는 -2017 (CC BY) | geoBoundaries ADM1/ADM2, Terrarium hillshade |
| 9~14 (주·군) | PC Sentinel-2 기간 모자이크 / GIBS HLS | WorldCover(PC), Esri LULC 연도 비교, NDVI |
| 14~17 (현장) | PC S2 장면(10m) → Maxar(재해 지역, 0.5m) | Overture buildings PMTiles, EMS 피해 점 |

---

## 2. LX 해외 사업 이력 (출처 있는 것만)

### 2-1. 로컬 1순위 자료: `D:/SSD3/글로벌사업/`

읽기만 했다. 출장비 내역, 개인정보 동의서, 사업자 서류, 개인 이름은 옮기지 않았다. `[중간보고서] … V.1.0.pdf`(105쪽, 2023-02)는 한글 폰트에 ToUnicode 정보가 없어 텍스트 추출이 되지 않았다(OCR 필요). 같은 사업 내용은 착수보고 pptx에서 확인했다. hwp 파일은 파서가 없어 읽지 못했다.

| # | 국가·도시 | 사업명 | 연도·기간 | 재원·발주·수원기관 | LX 역할·AI 과업 | 근거 파일 | 상태 |
|---|---|---|---|---|---|---|---|
| L1 | **키르기스스탄** (시범지: **비슈케크, 으슥아타(Ysyk-Ata), 소쿨룩(Sokuluk)**. 수직기준: **잘랄아바트 주, 이식쿨 주**) | 키르기즈 공화국 세계측지계 전환 및 국토정보관리 선진화 컨설팅 시범 사업 | 2022~2025 (36개월) | 사업금액 48.85억 원. **수원기관: 키르기즈 토지자원청**(State Agency on Land Resources). 관계기관: 지적처(Kadaster), Kyrgyzgiprozem, Goskartografiya. 기술자문: 주키르기즈 한국대사관 | LX, ㈜이지스, ㈜지오투정보기술 공동 수행. 과업 7개: 마스터플랜과 역량강화, **연속지적도 시범 구축(고해상도 정사영상 연계)**, SK-42/Kyrg-06→세계측지계 전환(0~3등 기준점 4,498점 재측량), 수직기준체계(중력측량), 성과활용 시스템, Pre-F/S, 초청연수 | `키르기즈/old/PPT/[현지착수보고]…_민감정보 삭제.pptx` (2022.10), `[중간보고서]…V.1.0.pdf` (2023.02) | 진행(공식 사이트 기준 22.08~25.11) |
| L2 | **키르기스스탄 추이(Chuy) 주 으슥아타 군** → 주 단위로 확대 | 키르기스스탄 농업 업무 혁신을 위한 인공지능 서비스 개발 및 환경조성 | 2023 (민간지능정보서비스 확산 사업) | 수요기관 **키르기스스탄 농업부**, 전담기관 **정보통신산업진흥원(NIPA)** | LX는 **드론 촬영과 Land-XI 플랫폼 제공·연계**. AI 과업: 농작물 탐지·분류(1차년 **옥수수, 밀, 감자, 보리, 당근, 양파** 6종, 학습데이터 6만 건), 재배면적 산출, **수확량 예측**, 농경지 변화 분석, 한국형 팜맵 이식. Semantic segmentation(DeepLab v3+, PSPNet, SegNet, U-Net 비교). 농업부 요구: 재배작물·수확량 예측, 토양 모니터링, **대상지 Chui 주** | `키르기즈/old/PPT/(양식원본)키르기스스탄 농업 업무 혁신…_LX_v2.pptx`, `키르기스스탄 _발표자료_v0.3_230327_LX수정.pptx` | 제안 단계 자료. 선정 여부는 로컬 자료로 확인 불가 |
| L3 | **키르기스스탄 비슈케크시** (주요 교차로 4개 후보 중 2곳) | 비슈케크시 디지털트윈 교통관리 시스템 구축 실증사업 (LDM 기반 교통 모니터링, 영상·IoT 센서 통합관제) | 2023.07~2024.05 (계획) | 국토교통부 **2023 K-City Network 스마트솔루션 해외실증**(공고 제2023-417호, KAIA 운영). 총사업비 5.556억 원(정부 5억, LX 몫 1.5억). 해외협력기관 **비슈케크 시립 디지털기술센터**(LOI) | 주관 웨이즈원, **LX 참여**(조사, 실증 지원, 해외협력기관 대응). 드론 기반 정밀지도, LDM | `2023년_K-City-Network…/03. 사업계획서_웨이즈원_LX_230530_최종.pdf`, `교통 모니터링 시스템_키르기즈_LOI(WAYS1, LX)_ENG_v1.0.docx`, 공고문 PDF | 제안서. 선정 여부 미확인(공개 검색에서도 확인 못 함) |
| L4 | 키르기스스탄 (실증국) → 다른 개발도상국으로 확대 | 멀티센서 영상데이터 기반 공간정보 제작 솔루션 개발 (2023 데이터 플래그십) | 2023.05~12 (계획) | NIA 데이터 플래그십. 주관 ㈜올포랜드, 참여 ㈜제이시스, **수요기관 LX**. 5억 원(현금 4.1억, 현물 0.9억) | 위성·항공·드론 영상으로 영상지도·주제도·지형모델 제작, CV/AI, **Land-XI 연계**, 키르기스스탄 지적도 구축 사업과 연계 | `NIA_23년 데이터 플래그십…/발표자료/데이터플래그쉽 사업_발표자료.pptx` | 제안서 |
| L5 | (전체) | LX 글로벌사업처 주요사업 공유 (2023) | 2006~ | – | "2006년부터 **38개국, 79개 사업, 961억 원** 수주". 2023년 진행: 키르기스 세계측지계 48억, 탄자니아 공간정보혁신센터 29억, 인도네시아 3D 지적 예타 3억, 에티오피아 LIS EDCF 컨설팅 34억(본사업 400억 규모), 방글라데시 디지털토지관리 EDCF 27억(본사업 350억 규모), 아르메니아 NSDI 표준화 ADB 6억, 베트남 UPIS 102억. 2023 신규 수주: 탄자니아 토지정보인프라 개선 컨설팅(EDCF, 75억), 우즈베키스탄 국가 공간정보 역량강화(국토부 ODA, 50억), 파키스탄 토지행정 현대화(세계은행, 14억), 우즈베키스탄 문화재(2억), 파라과이 연수(1.5억) | `키르기즈/old/PPT/[붙임2] 주요사업 공유_글로벌사업처_최종.pptx` | 내부 자료 |

### 2-2. 공개 자료(LX 공식 사업현황): https://www.lx.or.kr/kor/sub01_05_04_02.do

2026-09-24 조회. 페이지에 표시된 2019년 이후 항목이다. 영문 번역은 조회 도구가 요약한 것이라 한국어 원문 사업명은 페이지에서 다시 확인해야 한다.

| 연도 | 국가 | 사업 | 재원 | 기간 |
|---|---|---|---|---|
| 2026 | 자메이카 | 토지행정 역량강화 PMC | KOICA ODA | 26.01~31.03 |
| 2025 | 인도네시아 | 디지털 스마트시티용 3D 지적 구축 시범 | 국토부 ODA | 25.05~27.11 |
| 2025 | 콜롬비아 | 토지정보 디지털 전환 | 국토부 ODA | 25.05~28.02 |
| 2025 | 네팔 | 토지관리시스템 현대화 역량강화 | 세계은행 KWPF | 25.01~25.11 |
| 2024 | 네팔 | 소농 토지소유·친환경 토지이용 지원 | UN-Habitat | 24.08~26.07 |
| 2024 | 파키스탄 | 토지정보 현대화 역량강화 2단계 | 세계은행 | 24.03~24.05 |
| 2023 | 파라과이 | 고위공무원 토지행정·공간정보 연수 | 국토부 ODA | 23.09 |
| 2023 | 우즈베키스탄 | 국가 공간정보 통합 역량 체계 | 국토부 ODA | 23.09~26.04 |
| 2023 | 파키스탄 | 토지정보 현대화 역량강화 1단계 | 세계은행 KWPF | 23.08~23.11 |
| 2022 | 인도네시아 | 3D 토지소유 등록·디지털트윈 데이터 | KAIA ODA | 22.09~23.06 |
| **2022** | **키르기스스탄** | **세계측지계 전환 및 국토정보관리 선진화 시범** | **국토부 ODA** | **22.08~25.11** |
| 2021 | 베트남 | 도시정보관리시스템(UPIS) | KOICA ODA | 21.12~25.12 |
| 2021 | 탄자니아 | 공간정보혁신센터·역량강화 | 국토부 ODA | 21.07~24.06 |
| 2021 | 아르메니아 | 국가공간정보 표준화 | ADB | 21.09~23.02 |
| 2021 | 방글라데시 | 디지털토지관리시스템 컨설팅 | 수출입은행 EDCF | 21.09~26.10 |
| 2021 | 우즈베키스탄 | 디지털트윈 문화유산 플랫폼 | NIPA ODA | 21.05~21.12 |
| 2021 | 에티오피아 | 토지정보시스템 구축 컨설팅 | 수출입은행 EDCF | 21.09~27.01 |
| 2021 | 우즈베키스탄 | 부동산 통합시스템·IT 인프라 2단계 | 세계은행 KWPF | 21.09~27.01 |
| 2020 | 캄보디아 | 공간정보 인프라 기초데이터 시범 | 국토부 ODA | 20.06~22.06 |
| 2020 | 라오스 | 토지정보 인프라·역량강화 | 국토부 ODA | 20.06~24.06 |
| 2020 | 우즈베키스탄 | NGIS 공간정보 표준화 컨설팅 | 국토부 ODA | 20.06~21.10 |
| 2020/2019 | 사할린 | 한인 묘역 조사 3차/2차 | 행안부 ODA | 20.08~12 / 19.06~12 |
| 2019 | 인도네시아 | 지적정보 인프라 통합 마스터플랜 | 국토부 ODA | 19.06~20.04 |
| 2019 | 스리랑카 | 토지정보 인프라·시스템 타당성조사 | 수출입은행 | 19.04~19.10 |
| 2019 | 르완다 | 공간정보 인프라·토지이용 모니터링(KSP) | 수출입은행 | 19.03~19.09 |
| 2019 | 우즈베키스탄 | 부동산 통합시스템 1단계 | 세계은행 | 19.11~21.09 |

- 보조 출처: 이데일리, 국토부 장관 키르기스스탄 인프라 협력 기사(키르기스스탄 세계측지계 전환·국토정보관리 선진화 **50억 원 규모 ODA, 2022년 착수**를 언급) https://edaily.co.kr/News/Read?mediaCodeNo=257&newsId=02810966632496856
- 공간정보산업 해외진출지원센터 사업목록: https://gisc.lx.or.kr/bidInfo/projectList.do (이번에는 열람하지 않음)
- 2006년 이전 사업과 2019년 이전 전체 목록은 공식 페이지에서 페이지를 넘겨 추가로 확인해야 한다(미수행).

**글로벌 화면용 LX 사업국 목록**: 2023 내부자료의 38개국 목록(아제르바이잔, 우즈베키스탄, 투르크메니스탄, 라오스, 말레이시아, 캄보디아, 베트남, 필리핀, 모로코, 방글라데시, 에티오피아, 사우디, 아르메니아, 튀니지, 몽골, 스리랑카, 키르기스, 자메이카, 아이티, 사할린, 페루, 칠레, 우루과이, 네팔, 마다가스카르, 카자흐스탄, 탄자니아, 미얀마, 인도네시아, 파라과이, 콜롬비아, 르완다, 도미니카공화국, 이집트, 부르키나파소, 아르헨티나)에 2023년 이후 공식 목록의 파키스탄을 더한다. 이 목록에 ISO3 코드를 붙여 Natural Earth 국가 면을 채색하면 글로브 첫 화면에 **실제 LX 사업국**이 표시된다.

---

## 3. 실제 공개 데이터 기반 시나리오

### 시나리오 A: 키르기스스탄 추이 주 으슥아타 군, 위성 기반 농지 이용 (`card-global-farm`)

근거: L2(농업부 요구 "Chui 주", 1차 대상 "추이주 으슥아타군", 작물 6종), L1(연속지적도 시범지에 Ysyk-Ata 포함).

- **행정경계**: geoBoundaries KGZ ADM2 `Ysyk-Ata` (shapeID `92254566B31675215078110`), bbox **[74.687, 42.419, 75.183, 43.004]**. 상위 ADM1 `Chuy Region` bbox [73.058, 41.832, 77.227, 43.267]. 인접 district `Sokuluk` [74.125, 42.43, 74.559, 43.241], `Alamudun` [74.393, 42.398, 74.769, 43.164].
  - 남쪽 절반은 산지(키르기스 알라토)라서 농지 분석 AOI는 **북쪽 추이 평원 [74.70, 42.75, 75.20, 43.00]** 으로 좁힌다.
- **실측 통계** (이번에 PC `item/statistics`로 받은 값. ESA WorldCover 2021을 N42E072·N42E075 두 타일로 나눠 군 경계로 집계. max_size=2048 다운샘플이므로 **비율만 유효**):
  - 초지(30) 40.3% · **농경지(40) 33.0%** · 나지(60) 12.6% · 수목(10) 4.8% · 영구수역(80)·습지 등 소량 · 시가화(50) 3.1% · 눈·빙하(70) 2.7%
  - 정밀 면적(ha)은 원해상도(10m)로 다시 집계해야 한다. 전처리 스크립트에서 COG를 직접 읽어 계산하면 된다.
- **Sentinel-2 시계열**: MGRS **T43TEH**(으슥아타)와 T43TDH(비슈케크 서쪽). 2025-03~10 구름 15% 미만 장면이 **107개**(두 타일 합계, 월 8~21개)라 **월별 NDVI 곡선을 만들기에 충분하다.** 예시 장면: `S2C_MSIL2A_20250924T055651_R091_T43TEH_20250924T092330`(구름 1.7%).
- **레이어**:
  1. 배경: PC 모자이크(월별, `mosaic/register` → searchid). 비교용으로 EOX `s2cloudless-2017` / `-2025`
  2. WorldCover cropland 마스크: PC item 타일, `expression=map==40`, 또는 colormap을 그대로 쓰고 40번 클래스만 필터
  3. NDVI: PC item 타일, `expression=(B08-B04)/(B08+B04)&asset_as_band=true&colormap_name=rdylgn`
  4. 연도 변화: Esri LULC `exportImage&time=`(2017, 2021, 2025) → 농지 확대·축소
  5. 경계: geoBoundaries ADM2. 지형: Terrarium hillshade
- **카드 차트**: (a) 클래스 비율 막대(위 실측값), (b) 농지 마스크 안 평균 NDVI 월별 곡선(PC `statistics` 엔드포인트를 월별 모자이크에 호출), (c) 2017→2025 농지 면적 변화(Esri LULC 통계). **수치를 지어내지 않고** 모두 API 응답으로 채운다.
- **전처리** (빌드 때 1회, Node/Python):
  1. geoBoundaries ADM2 simplified → `kgz-adm2.geojson`(정적 파일)
  2. PC `statistics` 호출 결과 → `ysykata-landcover.json`, `ysykata-ndvi-2025.json` 캐시(PC 장애 대비)
  3. 필지 단위 표현이 필요하면 WorldCover 40번 클래스를 폴리곤화(gdal_polygonize)한 뒤 tippecanoe로 PMTiles 생성. 이 PC에는 GDAL이 없으므로 원래 PC에서 작업한다(메모리 기록 참조)
- **한계**: 작물 종류(밀·옥수수 등) 구분은 공개 데이터로 할 수 없다. ESA WorldCover와 Esri LULC 모두 "cropland" 단일 클래스다. 작물 분류는 L2 사업의 학습데이터가 필요한 **'AI 과업'** 으로 남겨 카드 `gap`에 명시한다.

### 시나리오 B: 키르기스스탄 비슈케크·으슥아타·소쿨룩, 건물·시가지 변화 (연속지적도 시범지 맥락. `card-global-disaster`의 '변화' 문법을 재사용하거나 새 카드로)

근거: L1(연속지적도 시범 3개 지역, 고해상도 정사영상 연계), L3(비슈케크 교차로 LDM).

- **bbox**: 비슈케크 [74.45, 42.78, 74.72, 42.93]. 소쿨룩 군 [74.125, 42.43, 74.559, 43.241]
- **데이터**: Overture buildings PMTiles(높이 포함 → deck.gl 3D 압출), MS Global ML Buildings(Kyrgyzstan 70개 쿼드키, 사전 가공), WorldCover 시가화(50), Esri LULC 2017 대비 2025 built area, Sentinel-2 모자이크 2017·2025
- **보여줄 것**: 도시 외곽(소쿨룩·알라무둔 경계)의 신축 확산을 Esri LULC built area 차이와 건물 footprint 밀도로 시각화한다. 경계 레이어로 L1 연속지적도 시범지 3곳을 강조한다.
- **전처리**: MS 쿼드키 파일(`…/RegionName=Kyrgyzstan/quadkey=…csv.gz`)을 병합한 뒤 tippecanoe로 `kgz-buildings.pmtiles`를 만든다. 건물마다 WorldCover·Esri LULC 연도 클래스를 붙여 "2017년엔 농지였던 곳의 건물"을 집계한다.

### 시나리오 C: 미얀마 만달레이·메이크틸라 지진 2025-03-28, 재해 전후 건물 피해 (`card-global-disaster`)

근거: 미얀마는 LX 38개 사업국에 들어 있다(L5). Copernicus EMS 활성화 **EMSR798**(AOI 57개, 제품 93개)이다. 키르기스스탄은 EMS 활성화 이력이 없다(265건 전수 확인).

- **이벤트**: EMSR798 "Earthquakes in Myanmar". 전체 extent [95.172, 18.908, 97.201, 23.785]. 통계: 피해 건물 17,838동(Built-up No.)
- **AOI 후보** (전후 영상이 겹치는 곳):
  - **AOI11 Meiktila** (bbox 약 [95.824, 20.856, 95.903, 20.918]): EMS GRA 피해 점 **38개**(Damaged 23 / Destroyed 4 / Possibly damaged 11), 도로 1,014개. **Maxar 사전 영상 2025-02-07 / 03-06, 사후 2025-04-03**(collection `10300101112F4700`)
  - **AOI04 Lamaing** ([96.168, 22.190, 96.209, 22.216]): 피해 점 **283개**(Destroyed 129 / Damaged 77 / Possibly 77). Maxar 커버리지 밖이므로 S2 전후와 EMS 판독 조합으로 쓴다
  - 만달레이 남부 [96.093, 21.853, 96.173, 21.987]: Maxar 사전 **2025-02-15**(`10400100A19FD600`), 사후 **2025-04-03**(`103001011008D900`). 만달레이 시가지 [95.95, 21.85, 96.10, 21.99]: 사후 03-31 / 04-03
- **데이터 URL**:
  - EMS 목록: `https://rapidmapping.emergency.copernicus.eu/backend/dashboard-api/public-activations/?code=EMSR798`
  - EMS 제품: `https://rapidmapping.emergency.copernicus.eu/backend/EMSR798/AOI11/GRA_PRODUCT/EMSR798_AOI11_GRA_PRODUCT_v1.zip`, `…/AOI04/GRA_PRODUCT/EMSR798_AOI04_GRA_PRODUCT_v2.zip`, 전체 `…/EMSR798/EMSR798_products.zip`
  - Maxar: `https://maxar-opendata.s3.amazonaws.com/events/Earthquake-Myanmar-March-2025/collection.json` → `ard/acquisition_collections/*.json` → 아이템의 `visual` COG
  - Sentinel-2 전후: PC STAC `bbox=[95.82,20.85,95.91,20.92]`, 사전 `2025-03-01/2025-03-27`, 사후 `2025-03-29/2025-04-20`
  - 건물: Overture buildings PMTiles(같은 URL)
- **화면**: 좌우 스와이프(사전·사후 Maxar), EMS 피해 점을 가장 가까운 Overture 건물 폴리곤에 공간조인해 등급별로 채색한다. 차트는 등급별 동수(실측)와 AOI별 합계다.
- **전처리**:
  1. EMS ZIP → `builtUpP_*.json`, `areaOfInterestA_*.json` 추출 → 정적 GeoJSON (CORS가 없으므로 반드시 사전 수집)
  2. Maxar visual COG → (선택) gdal로 z12~z18 래스터 PMTiles나 WebP 타일 생성. 원본 COG는 S3 CORS `*`가 있으므로 geotiff.js로 직접 읽을 수도 있지만 무겁다
  3. Overture 건물 × EMS 점 공간조인(최근접, 반경 15m) → `mm-meiktila-damage.geojson`
- **라이선스 주의**: Maxar Open Data는 **CC BY-NC 4.0**이라 공공·시연 화면에서만 쓰고 유상 서비스에는 넣지 않는다. EMS 제품은 출처를 표기하면 자유롭게 쓸 수 있다. 대체 사후 영상은 Sentinel-2(10m, 상업 가능)다.

### (보조) 글로브 첫 화면, 'live' 레이어

- GIBS `VIIRS_NOAA20_CorrectedReflectance_TrueColor` 어제 날짜, USGS `all_day.geojson`(1분 폴링), GIBS 화재 레이어, Natural Earth 위에 LX 사업국 채색(§2), EMS 최신 활성화 점(사전 수집 JSON. 1시간 크론)

---

## 4. 구현 메모

- deck.gl `TileLayer`나 MapLibre `raster` 소스에 쓸 URL 템플릿의 z/x/y 순서는 소스마다 다르다. **EOX와 GIBS는 `{z}/{y}/{x}`**, PC·Esri(`/tile/{z}/{y}/{x}`)·Terrarium은 각각 확인해서 쓴다.
- PMTiles: `pmtiles` npm의 `Protocol`을 MapLibre에 등록한다. Overture는 릴리스 날짜가 URL에 들어가므로 설정 한 곳에서 관리한다(월 1회 갱신. 옛 버킷은 이미 닫혔다).
- CORS가 없는 소스(FIRMS CSV, EMS API, MS buildings, WorldCover S3, Copernicus DEM S3)는 **빌드 또는 크론에서 수집해 정적 파일**로 둔다. 브라우저에서 직접 부르지 않는다.
- 표기(attribution)는 레이어별로 MapLibre `attribution` 필드에 넣는다. EOX는 비상업 조건이라 수출용 배포본(`portable: true`)에서는 2017년판이나 GIBS·PC로 바꾼다.
- 미확인 항목: Terrascope WMS/WMTS(이 네트워크에서 차단), Google Open Buildings의 키르기스스탄 커버리지, FIRMS API의 키 사용 시 CORS, K-City·NIPA 제안의 선정 여부, 중간보고서 본문(OCR 필요).
