# Land-XI 실자산 대장 (ASSET-LEDGER) — recon-0924 종합

작성 2026-09-24 · 근거: 같은 폴더의 `stack.md`, `env.md`, `vworld.md`, `e-projects.md`, `e-landcover.md`, `d-drive.md`, `aihub-shortlist.md` 7편을 종합. 읽기 전용 조사 결과의 정리이며 파일 이동·수정은 없다.
좌표 표기: WGS84 `[서, 남, 동, 북]`. 5186 = Korea 2000 중부원점.

---

## 0. 결론 다섯 줄

1. **이 PC에 "웹에 바로 올릴 수 있는" 실데이터가 이미 약 100MB 있다**(남원 정사 4시점·전역 2시점 타일, AI 추론 GeoJSON 약 20MB, 지형, 건물 3D, 해양쓰레기). 문제는 자산이 아니라 **운영 화면이 이 자산을 쓰지 않는 것**이다(`stack.md`).
2. **원천 자산은 TB급이다.** cm급 드론 정사 약 3.9TB(도로 6개 시군 3.4TB, 밀양 457GB, 용지 96GB+DSM), 25cm 항공 1.79TB(전남·전북·충청 2023), AI Hub 토지피복 GT 124GB(4권역), 하천 점유 분석 GPKG 20GB(전국), 학습 모델 20여 종(mAP50 0.86~0.99). 전량 서빙은 불가능하므로 **지구를 골라 타일화**해야 한다.
3. **이 PC에서 전처리 파이프라인을 전부 돌릴 수 있다.** conda `gcs`에 GDAL 3.12.4(COG·WEBP·MBTiles·벡터 PMTiles), rasterio, geopandas, CUDA torch, A6000 48GB×2, 64코어, E: 여유 2TB. 메모리의 "GDAL 없음"은 틀렸다(`env.md`). 부족한 것은 pmtiles CLI, tippecanoe, ECW 드라이버, LAS/OBJ 변환기 네 가지다.
4. **V-World 키는 만료됐다(EXPIRE_KEY).** 지금 화면은 키 없는 xdworld(z19, CORS `*`)로 돌아가고 있어 배경지도는 운영 수준이다. 연속지적·행정경계·검색·건물은 키 갱신 + `serve.mjs` 프록시가 있어야 한다.
5. **플래그십은 남원 "농지·시설물 AI 모니터링"이다.** 정사 4시점·AI 추론·변화탐지·3D 건물·지형·모델 5종 지표·토지피복 GT·Land-XI OBB 학습데이터·포털 화면(portal-dp-nw-*)이 한 지역에 겹치는 유일한 곳이다. 2순위 확장 축은 **전북 서부(LX 본사 전주–익산–김제 용지–군산, 만경강)**로, 원천 두께는 더 크지만 전처리가 무겁다.

---

## 1. 실자산 대장 (우선순위순)

등급 기준
- **Tier 0**: 이미 웹 포맷(XYZ WebP·GeoJSON·pbf). 화면에 연결만 하면 된다.
- **Tier 1**: 반나절~1일 전처리(재투영·타일화·GeoJSON 변환·추론 1회).
- **Tier 2**: 수일 전처리 또는 대용량. 시연 지구만 골라서 한다.
- **Tier 3**: 좌표 없음. 모델·카탈로그·갤러리·학습 KPI로만 쓴다.
- **Ext**: 외부 API·다운로드 필요.

### 1.1 Tier 0 — 즉시 사용 가능

| # | 자산 | 경로 | 종류 | 크기·개수 | 좌표·범위(WGS84) | 해상도 | 시점 | 라벨·속성 | 웹 형태 → 화면 | 우선 |
|---|---|---|---|---|---|---|---|---|---|---|
| A01 | 남원 농경지 AOI 정사 4시점 | `landxi/assets/tiles/namwon_2504·2506·2508·2510` | XYZ WebP z12–19 | 280장×4, 약 10MB | 3857 / [127.3480, 35.5272, 127.3569, 35.5350] (0.8×0.9km) | 1.08~1.69cm | 2025-04/06/08/10 | – | 타일 → XI맵 타임슬라이더·스와이프, 포털 nw-farm | ★★★★★ |
| A02 | 남원 비닐하우스·농경지 AI 추론 | `assets/data/geo/results/namwon-greenhouse-2025.geojson`, `namwon-farmland-2025.geojson` | GeoJSON | 1,674 + 2,098 | 4326 / 남원 전역 [127.185, 35.306, 127.662, 35.557] | – | 2025 | cls, cid, conf, sam, area, **pnu, emd** | 벡터(3D 압출, conf 색) → 분석 결과, XI맵, 대시보드 읍면동 집계 | ★★★★★ |
| A03 | 남원 전역 정사 2시점 | `tiles/namwon_city_2504·2510` | XYZ WebP z11–17 | 1,598+1,756장, 36MB | [127.183, 35.303, 127.637, 35.562] | 웹 2m(코어 0.6m) | 2025-04/10 | – | 타일 → XI맵 시 단위 비교, 대시보드 줌인 | ★★★★☆ |
| A04 | 남원 변화탐지 | `geo/namwon-change(-grid).geojson`, `tiles/namwon_change_2504_2510` | GeoJSON + XYZ z14–19 | 456 + 452 격자, 219장 | A01 범위 | – | 04→10 | pair, cls, area_m2, score | 벡터+타일 → 분석(변화), 포털 nw-change | ★★★★☆ |
| A05 | 전국 하천 벡터타일·폴리곤(cleanriver 운영) | `E:\행안부\07. 대국민 서버\data\river_vt`, `river_dedup`, `river_raster`, `river_mask` | MVT pbf z6–14, GeoJSON.gz, 래스터 z10–14 | pbf 868개; 시군구 252 | 4326/3857, 전국 | – | built 2026-08-05 | 하천 등급(국가/지방/소하천), 하천명 | 벡터 → 메인·XI맵·대시보드 전국 하천 레이어(**변환 없음**) | ★★★★☆ |
| A06 | 여수 해양쓰레기(항공 2025·드론 2026) | `geo/results/yeosu-marine-2025-aerial(-grid100)`, `yeosu-marine-2026-drone(-grid100)` | GeoJSON | 1,857 / 2,078 + 격자 813 / 86 | [127.509, 34.555, 127.750, 34.750] | – | 2025, 2026 | cls, cat, conf, area, mask, color | 벡터(헥사·컬럼) → 포털 gj-marine, 대시보드 | ★★★★☆ |
| A07 | 서남해 해양쓰레기 | `geo/marine-debris(-grid).geojson` | GeoJSON | 5,000 + 격자 9,032 | [125.777, 34.250, 126.998, 35.249] | – | – | confidence, class, area_m2 | 히트맵·헥사 → 메인 글로브, 대시보드 | ★★★☆☆ |
| A08 | 남원 건물 3D + 지형 | `assets/data/3d/namwon-buildings.geojson`, `3d/terrain-namwon/` | GeoJSON, Terrarium PNG z9–13 | 5,109동 / 114장 4.9MB | [127.346, 35.374, 127.434, 35.446] / [127.24, 35.28, 127.54, 35.54] | 지형 약 30m | – | height_m(**추정**), floors_est | fill-extrusion + raster-dem → 메인 3D, XI맵 3D 모드 | ★★★☆☆ |
| A09 | 국산리(김제 용지면 일대) 드론 정사 2비행 | `tiles/kuksan_a68·a71` | XYZ z13–19 | 877장×2, 14MB | [126.9738, 35.8256, 126.9923, 35.8384] | 5cm | 2025-08 | – | 타일 → 워크플로(드론) + drone.glb | ★★★☆☆ |
| A10 | 제주 정사 2시점 + 토지형질 세그 + 불법건축 라벨 | `tiles/jeju_2020·2022·jeju_landcover`, `geo/jeju-illegal.geojson` | XYZ z13–19, GeoJSON | 117+129+129장, 2 라벨 | [126.819, 33.505, 126.900, 33.520] | 10~12cm | 2020-12, 2022-12 | 세그 래스터 | 타일 → 분석(세그멘테이션 비교) | ★★☆☆☆ |
| A11 | 행정경계 | `geo/sido·sigungu·korea-outline·namwon-emd.geojson` | GeoJSON | 17·249·1·39 | 전국 | – | 2021-04 스냅샷 | code, name | 벡터 → 전 화면 공통 | ★★★☆☆ |
| A12 | 3D 모델·크롭 | `assets/proto/models/{drone,aircraft,satellite}.glb`, `proto/crops/` | GLB, jpg | 3종 / 144장 | – | – | – | – | ScenegraphLayer, 카드 갤러리 | ★★☆☆☆ |
| A13 | xdworld 배경(V-World 키 없음) | `xdworld.vworld.kr/2d/{Satellite,Base,Hybrid,midnight,white}` | 외부 XYZ | – | 전국, Sat·Base z5–19 | z19 ≈ 0.25m | 2026-03 갱신 | – | 배경 → 전 지도 화면(**maxZoom 19로 올릴 것**) | ★★★★★ |

> 샘플이라 운영에 쓰면 안 되는 것: `detections-sample`, `orgs`, `projects-extent`, `sigungu-sample`, `C:/parcels.zip`.

### 1.2 Tier 1 — 짧은 전처리(반나절~1일)

| # | 자산 | 경로 | 종류 | 크기·개수 | 좌표·범위 | 해상도 | 시점 | 라벨·속성 | 전처리 → 웹 형태 → 화면 | 우선 |
|---|---|---|---|---|---|---|---|---|---|---|
| B01 | 남원 YOLO11x-seg 모델 5종 + 학습 지표 | `E:\namwon\{Silage,Vinyl_house,cultivate_uncultivate,growth_baseline,production_baseline}\runs\segment\train*` | .pt + results.csv, PR/F1, confusion_matrix, val_batch_pred.jpg | 125MB×6 등 | 좌표 없음 | – | 2026-01 | 사일리지 .968 / 비닐하우스 .945 / 경작·비경작 .947 / 생육기 .985 / 생산기 .972 (mask mAP50) | 이미지·CSV 복사 → 모델 카드, 학습 모니터 곡선(실측) | ★★★★★ |
| B02 | 전국 하천구역 건물 점유 분석 | `E:\행안부\03. 분석결과_v2\<시도_시군구>\*.gpkg` | GPKG 4레이어 | 252 시군구, 건물 651,478건, 20GB | 5186, 전국 | – | 2026 | 하천등급·하천명·용도·층수·건물면적·점유면적·점유율·주소 | ogr2ogr 4326 → 시군구 집계 GeoJSON + 건물 PMTiles → 대시보드 단계구분도, 분석(하천 점유) | ★★★★★ |
| B03 | LX 본사(전주 혁신도시) 드론 3D 일체 | `E:\Image\본사촬영\220413_본사일대(1)\` (+ 경량본 `D:\SSD4\철도연\220411_본사정사영상.tif` 60MB) | 정사 RGBA + DSM float32 + OBJ/FBX 메시 + LAS 점군 | 정사 249MB, DSM 293MB, OBJ 72MB, LAS 792MB(2,329만점) | 5186 / [127.0636, 35.8358, 127.0684, 35.8398] | 3.42cm | 2022-04-13 | – | 정사→XYZ z15–22, DSM→terrarium, OBJ→GLB(three), LAS→COPC(선택) → **메인 히어로 3D 트윈**, 워크플로 | ★★★★★ |
| B04 | AXIS 드론 정사 2장 + 검수 라벨 | `E:\Auto_Label_project\data\images\{익산_황등3,4지구,47720_001}.tif`, `data\axis.db` | GeoTIFF(오버뷰 있음) + SQLite 라벨 | 3.6GB; 라벨 2,662(자동차 2,462·맨홀 200) | 5186 / 익산 [126.9419, 35.9915, 126.9512, 36.0048], 경북 [128.4503, 36.3066, 128.4778, 36.3288] | 1.36cm / 2.95cm | – | polygon_geojson(픽셀좌표) | COG 또는 XYZ + 픽셀→4326 GeoJSON → 라벨링 화면 오버레이 | ★★★★☆ |
| B05 | 차량 OBB 추론 파이프라인 | `E:\drone_runs\car_v2_obb\run\weights\best.pt`, `car_v1\infer_orthomosaic.ipynb` | 모델 + 노트북 | 118MB | – | – | – | vehicle, mAP50 .992 | B03·B04 정사에 실추론 → GeoJSON → "AI 실행 → 결과 쏟아짐" 데모, 분석 | ★★★★☆ |
| B06 | 석면지붕 세트(정사+폴리곤 짝) | `D:\SSD4\testdata\{의성,gumi2,kunsan2}` | GeoTIFF(오버뷰 2/4/8) + SHP | 정사 약 49GB, 폴리곤 751(의성 529·구미 100·군산 122) | 5186 / 의성 [128.324, 36.437, 128.366, 36.454], 구미 [128.378, 36.198, 128.395, 36.212], 군산 [126.728, 35.891, 126.758, 35.909] | 2.97~3.37cm | – | asbestos | COG 변환 + SHP→GeoJSON → 분석(석면 탐지 결과) | ★★★★☆ |
| B07 | 2022 LX 드론맵 인덱스·촬영면적·산불 | `D:\SSD3\환경부\LX드론맵 구축관리(0.062km GRID)_작성중\` | SHP | 격자 136,025셀, 촬영면적 55 SHP(1,298 폴리곤), 동해·울진 산불 | 5186, 전국 | – | 2022 | 시군구명, 민간/자체 | →GeoJSON/PMTiles → 메인·대시보드 "LX 드론맵 커버리지" | ★★★★☆ |
| B08 | 만경강 유입쓰레기 드론(EXIF GPS) | `E:\AI학습데이터\해양쓰레기\269.청청 서해안…` | JPG 5472×3648 + JSON bbox | 2,000장 20GB, bbox 24,863 | EXIF GPS [126.72, 35.86, 127.19, 35.95] | 고도 60~93m | 2022-07~11 | 재질 9종(플라스틱 경질 18,800…) | EXIF→포인트 GeoJSON + 썸네일 WebP → 하천 쓰레기 모니터링 지도, 사진 팝업 | ★★★☆☆ |
| B09 | 125 전라 토지피복 GT — 남원·전주 도엽 | `E:\125.토지 피복지도…(전라)\01.데이터\` | 512/1024 칩 TIF + GeoJSON(5186) + 마스크 TIF + META | 남원 35710074: 512 384 + 1024 52 + Val 47 / 전주 2,586칩 | 남원 도엽 [127.325, 35.305, 127.349, 35.324]; 전주 도엽 35701053 등 | 0.25m | 2019·2020 | ANN_CD 10~100(건물·논·밭·산림·도로…) | 칩+META→GeoTIFF→도엽 모자이크→XYZ; 라벨 4326 병합 → XI맵 토지피복 레이어, 분석 GT-vs-추론 스와이프 | ★★★★☆ |
| B10 | 304 경기 토지피복 GT(건물용도·용도지역 속성) — 이천 도엽 | `E:\304.토지피복지도 항공위성 이미지\01-1.정식개방데이터\` | 위와 같음 | 512 45,000 + 1024 4,500 | [126.628, 36.976, 127.725, 38.047]; 이천 36701004·36701005 | 0.25m(AP12는 0.12m) | 2021-03 | + **BD_TYPE, USE_TYPE** | 위와 같음 → 토지행정 대시보드(용도 교차 집계) | ★★★☆☆ |
| B11 | Land-XI 고유 OBB 6클래스 학습데이터 | `D:\SSD4\Land-XI_학습데이터_{1,2,3}차.zip`, `D:\SSD4\남원\{images,labels}` | 드론 원본 + YOLO OBB | 약 1,900 + 1,899장, 15.7GB | EXIF GPS 있을 가능성(확인 필요) | – | 2021-06~08 | 일반건물·불법소각장·폐가·포트홀·석면지붕·비닐하우스 | 썸네일·라벨 렌더 + EXIF 포인트 → 데이터 관리 카탈로그, 라벨링 샘플, 포털 nw-living | ★★★☆☆ |
| B12 | 토지피복 UNet 추론 전후 32쌍 + best.pth | `D:\yongji\토지피복\{input,output,weights}` | tif 쌍, .pth 69MB | 32쌍 | – | – | 2023-03 | – | PNG 오버레이 → 분석 비교 뷰어 | ★★☆☆☆ |
| B13 | 청정전남 제안 사이트 데이터 | `E:\land-xi.dev\jeonnam\src\data\` | 인라인 JSON(`window.X=`) | 시군 경계, 신안 수심(ETOPO 2022), 집하장(2025.4) | [125.08, 33.97, 127.90, 35.49] | – | 2025 | – | 래핑 제거 → 포털 gj-marine 보강 | ★★☆☆☆ |
| B14 | 브랜딩 | `D:\웨일 다운로드(임시저장 폴더)\LX_CI.zip`, `E:\jeju_breath\static\lx_ci*` | ai·jpg·png | – | – | – | – | – | 메인·포털 CI | ★★☆☆☆ |

### 1.3 Tier 2 — 무거운 전처리(수일, 지구 선택 필수)

| # | 자산 | 경로 | 종류 | 크기·개수 | 좌표·범위 | 해상도 | 시점 | 라벨·속성 | 전처리 → 화면 | 우선 |
|---|---|---|---|---|---|---|---|---|---|---|
| C01 | 2023 25cm 비도시 항공 정사(전남·전북·충청) | `D:\2023_정사영상_비도시_25\{전남,전북,충청}비도시` | GeoTIFF + TFW(**CRS 태그 없음**) | 5,381장 1.79TB(전남 2,117·전북 1,609·충청 1,655), 도엽 약 333MB | 5186 추정 / 전남 [125.08, 33.96, 127.94, 35.25], 전북 [125.96, 35.27, 127.76, 36.18], 충청 [125.53, 36.19, 128.02, 37.23] | 0.25m | 2023 | – | `-a_srs EPSG:5186` VRT → **남원·전주·익산·김제 도엽만** XYZ z10–18 → XI맵 "LX 보유 2023 정사" 배경, 25cm 모델(C09) 추론 입력 | ★★★★☆ |
| C02 | 김제 용지면 초고해상 정사 + DSM + 이전 시점 | `D:\yongji\TIF\yongji.tif`, `TIF\DSM\yongji_dsm.tif`, `용지면 TIF\45210_0{17..30}.tif`, `512\`(82,129타일) | GeoTIFF | 96GB + 23GB + 44GB + 86GB | 5186 / [126.974, 35.826, 127.000, 35.857] (A09 국산리와 겹침) | 1.44cm / 2.89cm / 3.67cm | 2024 vs 이전 | – | 정사→XYZ z14–22, DSM→terrarium RGB → XI맵 3D 지형(cm급), 변화탐지 스와이프 | ★★★★☆ |
| C03 | 도로 드론 정사 6개 시군 + 도로 라벨 + 학습셋 | `D:\도로\Source\*.tif`, `D:\도로\Shp\*_label.shp`, `D:\도로\datasets` | GeoTIFF(오버뷰 없음), SHP, YOLO-seg | 302장 3.4TB; 폴리곤 46,991; 타일 311,531 | 5186 / 강화·고양·시흥·군산·익산·김제(표는 `d-drive.md` §1) | 1.3~13.6cm | 2022 추정 | Road 1클래스 | 시연 도엽 2~3장만 COG + SHP→PMTiles → 분석(AI 도로 추출 3단 시연) | ★★★☆☆ |
| C04 | LX 국토정보기본도 2.0 필지 + 연속지적도 전국 | `D:\SSD1\Mobility Convergence\01_…\1. 국토정보기본도2.0_202112\`, `4. 연속지적도_전국_20220209\` | SHP | 전국(제주시만 517,280필지); 연속지적 약 14GB | 5186 | – | 2021-12 / 2022-02 | PNU, 지목, 면적, 소유구분, **공시지가**, 도로명, 건물명 | 남원·전주 시군만 PMTiles z12–17 → XI맵 필지 클릭 카드(**V-World 키 없이 필지 제공 가능**) | ★★★★☆ |
| C05 | 지적재조사 4지구 ECW + 경계조정선 | `C:\screening_data` → `E:\재조사\{1. 드론영상, 2. 측량성과}`; `D:\SSD1\재조사\고감1지구_세계동부2.ecw` | ECW + SHP | 김제 용신·수원 망포1·순창 내동·익산 황등3,4 + 고감1 4.3GB | 5186/5187 | – | – | 경계조정선, 종전지적선 | **ECW 드라이버 없음** → QGIS로 GeoTIFF 변환 후 타일 → 분석(지적재조사 전후) | ★★★☆☆ |
| C06 | 밀양 드론 정사 140도엽 | `E:\Image\3_밀양 (TIFF)\B*.tif` | GeoTIFF(오버뷰 없음) | 457GB | TM 중부 / [128.579, 35.345, 128.992, 35.618] | 3.37cm | 미상 | – | 소수 도엽만 → 광역 드론 커버리지 시연 | ★★☆☆☆ |
| C07 | 구미·예천 재난·송정동 ECW/TIF | `D:\SSD3\Ecw\47190_*.ecw`(9), `D:\SSD3\예천 재난\ECW\백석리백석리.ecw`, `D:\SSD1\K-드론시스템\…\송정동.tif` | ECW/GeoTIFF | 7.2GB / 2.5GB / 0.73GB | 5186·5187 / 예천 [128.437, 36.801, 128.447, 36.808] | 3~3.7cm / 1.75cm / 4.07cm | 예천 2023 수해 추정 | – | ECW 변환 → 재난 대응 화면 | ★★☆☆☆ |
| C08 | 124 경상·126 제주 토지피복 GT | `E:\124.…(경상)`, `E:\126.…(제주도)` | B09와 같음 | 49,813칩 / 13,421칩 | [127.99, 34.93, 129.41, 36.84] / [126.17, 33.23, 126.90, 33.55] | 0.25m | 2019 | 클래스 동일(제주는 비닐하우스 55 포함) | 칩 중심점 히트맵(전수) + 대표 도엽 1~2장 → 데이터 관리 카탈로그 | ★★☆☆☆ |
| C09 | 항공 25cm 4클래스 모델 → 남원 전역 추론 | `E:\best.pt`(건물·주차장·경작지·비닐하우스) × C01 남원 도엽 | 모델 45MB | – | 남원 전역 | – | – | 4클래스 | GPU 추론 → 폴리곤 GeoJSON/PMTiles → **없어진 27,676 비닐하우스 결과의 대체**, XI맵·대시보드 | ★★★★☆ |
| C10 | 서울 도로명주소 전자지도 건물 | `D:\웨일 다운로드(임시저장 폴더)\서울특별시\11000\*.shp` | SHP | 건물 593,757 | 5179 추정 | – | – | 높이 없음 | 서울 시연이 필요할 때만 | ★☆☆☆☆ |

### 1.4 Tier 3 — 좌표 없음(모델·학습 KPI·갤러리 전용)

| # | 자산 | 경로 | 규모 | 클래스 | 웹 용도 | 우선 |
|---|---|---|---|---|---|---|
| D01 | 남원 학습 데이터셋 5종(1024² tif) | `E:\namwon\<과제>\{train,val}` | 사일리지 2,010 · 비닐하우스 1,953 · 경작 1,822(+위성 4,213) · 생육기 8,798 · 생산기 6,709 | 위 B01 | 데이터 관리 카탈로그, 라벨링 샘플 | ★★★★☆ |
| D02 | 항공 토지피복 YOLO-seg 15.3만 + 품질 리포트 | `E:\aerial_dataset`(=`D:\aerial_dataset`), `label_quality_report.json` | 153,295장, 폴리곤 205만(건물 1,059,267·주차장 147,469·경작지 739,204·비닐하우스 110,091) | 4클래스 | 학습 KPI, 라벨 품질 대시보드; 파일명 도엽번호로 역지오레퍼런싱 가능 | ★★★☆☆ |
| D03 | 드론 4클래스 YOLO-seg 15.4만 + drone_v2 | `E:\drone_dataset`, `E:\drone_runs\drone_v2\weights\best.pt` | 153,971장(약 527GB), mask mAP50 .863 | 경작지·비닐하우스·가건물·천막 | 불법 가설건축물 시나리오, 모델 카드 | ★★★☆☆ |
| D04 | 차량 모델 3종 | `E:\drone_runs\car_v1`, `car_v2`, `car_v2_obb` | mAP50 .984 / .983 / **.992** | vehicle | 모델 레지스트리(B05와 연결) | ★★★☆☆ |
| D05 | 대구경북 YOLO 6클래스 | `E:\AI학습데이터\대구경북` | 61,566장 5.1GB | GreenHouse/House Normal·Abnormal, asbestos_roof, waste | 빈집·석면·쓰레기 모델 카탈로그 | ★★★☆☆ |
| D06 | 294 아산 하천부지 점유 + DeepLabv3+ | `E:\294.아산시 하천부지 점유현황 데이터`, `E:\도로공사\아산시…\아산하천_산출물\latest.pth` | 650GB, 라벨 180,024, 모델 349MB(+도커 7.5GB) | 001~009(**명칭 미확인**) | 하천 점유 세그 분석 화면(Val 수백 장 샘플), 모델 카드 | ★★☆☆☆ |
| D07 | 방치쓰레기 통합 | `E:\AI학습데이터\방치쓰레기*`, `D:\SSD4\방치쓰레기`(COCO 7,150장) | YOLO 약 30k + 원본 105GB | waste | 방치폐기물 화면 갤러리(원본 `_GeoTag`이지만 EXIF 없음) | ★★☆☆☆ |
| D08 | 기타 현안 학습셋 | `E:\AI학습데이터\{'23년 올포랜드, 소각장, 폐가, 태양광, 맨홀}`, `D:\SSD4\재난피해상황…`, `D:\SSD4\x1.v1i(incinerator)` | 올포랜드 6,858 · 태양광 3,682 · 맨홀 1,946 · 재난 6,448 · 소각장 2,176 | 폐가·석면·소각장·포트홀·태양광·홀 | 현안 모델 카탈로그 | ★★☆☆☆ |
| D09 | 항공영상 lms2021 COCO + 도로 클립 | `E:\AI학습데이터\항공영상`, `E:\AI학습데이터\도로` | 객체 28,770 / 223,418장(라벨 19,778) | house·vinylhouse / 도로 | 학습 KPI | ★☆☆☆☆ |
| D10 | AXIS-Label 플랫폼(동작하는 앱) | `E:\Auto_Label_project\app.py`, `static\` | FastAPI+SQLite+JS, DINOv2·SAM2·YOLO 루프, 타일 166,916, 임베딩 653MB | – | **프로젝트 라벨링 화면의 실동작 백엔드 후보**, 임베딩 유사도 히트맵 | ★★★★☆ |
| D11 | 파운데이션·베이스 모델 | `sam2_b.pt`, `yoloe-11s-seg.pt`, `yolov8s-worldv2.pt`, `mobileclip_blt.ts`, `E:\yolo11{n,m-seg,x-seg}.pt` | – | 오픈보캐블러리 | 추론 API 백엔드 | ★★☆☆☆ |

### 1.5 Ext — 외부·다운로드 필요

| # | 자산 | 상태 | 웹 용도 | 우선 |
|---|---|---|---|---|
| E01 | V-World 키(WMTS·Data·WMS·검색·주소) | **만료(EXPIRE_KEY)**, 등록은 살아 있음 | §2 참조 | P0 |
| E02 | AWS Terrarium DEM z≤15 (CORS `*`, 무키) / Mapterhorn z12 | 동작 | 전국 지형(남원 외 지역), 여수 지형 미러 추가 | P1 |
| E03 | AI Hub 24종 후보(`aihub-shortlist.md`) — 71712 탄소(전라·제주 EPSG:5186), 71363 국립공원 변화탐지(SHP), 71766 비점오염 드론 2.5cm(영산강·새만금), 588 전라 산림수종, 634 제주 작물, 506 해안오염(위경도) | 신청·승인 후 부분 다운로드(1~10위 약 15GB) | 탄소·산림·해양 화면 확장 | P2 |
| E04 | Esri World Imagery z18 / OpenFreeMap 벡터 | 동작, CORS `*` | 폐쇄망·폴백 배경 | P2 |

### 1.6 이 PC에 없는 것(메모·기록상 존재)

| 자산 | 기록된 위치 | 영향 | 대안 |
|---|---|---|---|
| 남원 원본 1.5~1.8cm 정사 4시점(`gj_6m.tif` 등) | `E:\namwon_final`, `F:\` | 남원 AOI 재타일링·줌 확장 불가 | A01·A03 웹 타일 그대로 사용 |
| 남원 비닐하우스 전역 탐지 27,676개 GeoJSON | `D:\python\Namwon\…\detections.geojson` | 전역 비닐하우스 레이어 없음 | A02(1,674) 사용 + C09로 25cm 재추론 |
| `lx_2023`, `jeonnamdo`(제주 세그·불법건축 shp·전남 해양쓰레기 38,057) | `D:\python\` | 전남 해양쓰레기 원본 없음 | A06·A07 웹 GeoJSON 사용 |
| `E:\best.pt` 학습 run(aerial_v2_finetune2) | – | 지표 없음 | C09 추론 후 자체 검증 |

---

## 2. V-World로 가능한 것 / 불가능한 것 (`vworld.md` 실호출 기준)

### 2.1 지금 당장(키 없이) 가능
| 항목 | 내용 | 조치 |
|---|---|---|
| Satellite·Base 배경 | xdworld z5–19, CORS `*`, 2026-03 갱신, z19 ≈ 0.25m | `map-gl.js` maxZoom 18.4 → **19** |
| Hybrid 라벨 z6–19, midnight·white z6–18 | 동작 | 레이어별 zoom 범위 코드 반영 |
| gray | xdworld에 없음(404) | 현행 Base 채도 -1 유지 |

### 2.2 키 갱신 후 가능(운영키 재발급 또는 기간 연장, 등록 상태는 유효)
| 항목 | 레이어 | 화면 | 조건 |
|---|---|---|---|
| 연속지적도 | `LP_PA_CBND_BUBUN` WMS 이미지 + GetFeature(PNU·지목·공시지가) | XI맵 필지 클릭 카드 | **CORS 없음** → `serve.mjs` `/api/vworld/*` 프록시 필수(JSONP는 프로토용) |
| 현행 행정경계 | `LT_C_ADSIGG_INFO`, `LT_C_ADEMD_INFO`, `LT_C_ADRI_INFO` | 전 화면(2021-04 로컬본 교체) | 프록시 + 디스크 캐시 |
| 건물(층수) | `LT_C_SPBD` | 남원 건물 추정 높이 → 실측 층수 보강 | 키에 **Data API 유형 추가 신청** 필요(과거 `INCORRECT_KEY`) |
| 용도지역·임상도 | `LT_C_UQ111`, `LT_C_FSDIFRSTS` | 탐지 결과 교차 분석(불법 개간×보전산지) | 프록시 |
| 장소·주소 검색 | `req/search`, `req/address` | XI맵 검색 → flyTo | 프록시 |
| 제약 | size ≤ 1000/page, BOX 면적 제한, 일일 한도 | AOI 1~2km BOX 페이징 + 서버 캐시 | 남원 전 필지 실시간 수신은 불가 |

### 2.3 V-World로 불가능한 것
| 항목 | 이유 | 대안 |
|---|---|---|
| MapLibre 3D 지형(raster-dem) | V-World는 DEM 타일을 공개하지 않음. 3D는 자체 XDWorld SDK 전용 | AWS Terrarium(z≤15, 무키), Mapterhorn(z12), 로컬 `terrain-namwon`; cm급은 **용지 DSM·본사 DSM**을 terrarium으로 직접 변환 |
| 브라우저 직접 fetch(Data·WMS·검색) | CORS 헤더 없음 | 프록시 |
| 키를 브라우저에 두는 현행 방식(`env.js`) | 평문 노출, 도메인 제한 없으면 도용 | 서버 보관 + 프록시 |
| 폐쇄망 배경 | xdworld·EOX 모두 외부망 | 자체 정사 타일(C01) + 행정경계 + Protomaps 저줌 PMTiles |
| 자체 필지 대체 | – | C04 국토정보기본도 2.0 PMTiles(35속성, 공시지가 포함)가 V-World 없이도 필지 카드를 만들 수 있다 |

---

## 3. 이 PC 파이프라인 가능 여부 (`env.md`)

| 단계 | 가능 | 도구(경로) | 비고 |
|---|---|---|---|
| GeoTIFF/TFW → 재투영 → COG(WEBP) | **O** | `gcs` env GDAL 3.12.4 `gdal_translate -of COG -co TILING_SCHEME=GoogleMapsCompatible -co COMPRESS=WEBP` | 실행 확인 |
| 도엽 다수 → VRT → XYZ WebP 타일 | **O** | `gdalbuildvrt`(+`-a_srs EPSG:5186`) → `gdal raster tile` 또는 `gdal2tiles --xyz --tiledriver=WEBP --processes=48` | 실행 확인. PATH의 `envs\lx\Scripts\gdal2tiles.py`는 깨져 있으니 gcs 것을 쓴다 |
| 래스터 PMTiles | **△** | GDAL → MBTiles까지만. `pmtiles convert`는 **go-pmtiles 미설치**(단일 exe 설치 또는 `pip install pmtiles`) | XYZ 정적 폴더로 대체 가능 |
| 벡터 → PMTiles/MVT/FlatGeobuf | **O** | `ogr2ogr -t_srs EPSG:4326 -f PMTiles -dsco MINZOOM= -dsco MAXZOOM=` | 실행 확인. 대용량 품질은 **tippecanoe 미설치**(WSL Ubuntu 26.04 apt) |
| GPKG → GeoJSON/집계 | **O** | geopandas 1.1.3 / pyogrio | – |
| DSM → Terrarium RGB | **O** | rasterio(numpy 인코딩) 또는 rio-rgbify 설치 | – |
| ECW 읽기 | **X** | GDAL에 ECW 드라이버 없음 | QGIS 3.28.3으로 GeoTIFF 변환 |
| LAS → COPC/Potree | **X** | laspy·PDAL 없음 | 설치 필요(선택 과제) |
| OBJ → GLB | **X** | trimesh·obj2gltf 없음 | Node `obj2gltf` 설치(Node 22 있음) |
| YOLO 추론(seg/OBB) → 폴리곤 | **O** | 시스템 Py3.11 ultralytics 8.3.234 또는 `yolo` env 8.3.131, torch cu118, A6000 48GB×2(조사 시 장당 23GB 사용 중) | `infer_orthomosaic.ipynb` 파이프라인 있음 |
| 정적 서빙 | **O** | `tools/serve.mjs`(Node 22) | PMTiles에 필요한 HTTP Range(206) 지원 **미검증** |
| 외부 공개 | **O** | cloudflared·Tailscale·ngrok | 80·443은 cleanriver Docker가 사용 중 → 다른 포트 |
| 임시 디스크 | 주의 | C: 124GB만 남음 | `CPL_TMPDIR=E:\_tmp`, 산출물은 E:(여유 2.0TB) |
| Planetiler | X | Java 20(21 필요) | 필요 없음(GDAL PMTiles로 충분) |

권장 실행 순서: `gcs` env 활성화 → 환경변수 `PATH=…\envs\gcs\Library\bin; GDAL_DATA; PROJ_DATA` → 래스터는 VRT→XYZ WebP, 벡터는 `ogr2ogr -f PMTiles`, 추론은 시스템 Py3.11.

---

## 4. Land-XI 기존 기능별 실데이터 매핑

형태 약어: **T**=래스터 타일(XYZ/PMTiles), **V**=벡터(GeoJSON/PMTiles), **I**=이미지·차트, **3D**=fill-extrusion/raster-dem/GLB, **API**=프록시 경유 실시간.

### 4.1 메인(`dive.html`, 랜딩·히어로)
| 연출 | 자산 | 형태 |
|---|---|---|
| 글로브 → 전국 줌 보간 | 전국 하천 `river_vt`(A05), 드론맵 커버리지 격자·촬영면적(B07), 시군구 경계(A11) | V |
| 전국 히트맵 | 서남해 해양쓰레기 5,000(A07), 하천 점유 건물 651,478 시군구 집계(B02) | V(heatmap/hexagon) |
| **히어로 3D 트윈** | LX 본사 정사 3.42cm + DSM + 텍스처 메시(B03) | T + 3D(raster-dem, GLB 커스텀 레이어) |
| 마을 다이브 | 남원 AOI 4시점(A01), 건물 5,109 압출(A08), 지형 로컬(A08) | T + 3D |
| 궤도 인트로 | satellite.glb·drone.glb(A12) | 3D |
| CI | LX_CI(B14) | I |

### 4.2 XI맵(`ximap.html`, `map-gl.js` 공통 엔진)
| 기능 | 자산 | 형태 |
|---|---|---|
| 배경 | xdworld Sat·Base·Hybrid·midnight·white(A13), 폐쇄망 폴백은 C01 남원·전주 도엽 | T |
| "LX 보유 정사" 레이어 | 남원 city 2시점(A03), 남원 AOI 4시점(A01), 국산리 5cm(A09), 제주(A10), LX 본사(B03), 용지 1.44cm(C02), 2023 25cm 선택 도엽(C01) | T(줌 구간별 자동 전환: V-World → 25cm → cm급) |
| 타임슬라이더·스와이프 | A01 4시점, A03 2시점, C02(3.67cm→1.44cm) | T |
| AI 결과 | 비닐하우스·농경지(A02), 변화(A04), C09 남원 전역 4클래스, 석면 751(B06), 차량 OBB(B05) | V(3D 압출·conf 색·pickable) |
| 토지피복 GT | 125 남원·전주 도엽(B09), 304 이천(B10) | T(모자이크) + V(클래스 색) |
| 하천 | river_vt(A05) + 하천 점유 건물(B02) | V |
| 필지 | V-World 연속지적 WMS/GetFeature(§2.2) 또는 국토정보기본도 2.0 PMTiles(C04) | API 또는 V |
| 검색 | 로컬 읍면동(A11) → 키 갱신 후 `req/search`(§2.2) | API |
| 3D 모드 | 지형 terrain-namwon(A08)·AWS Terrarium(E02)·용지/본사 DSM(C02·B03), 건물 압출(A08) | 3D |

### 4.3 분석 서비스(`analysis-ai.html`, `workflow.html`, `map-drift.html`, `report-standard*.html`, `stats-standard.html`)
| 기능 | 자산 | 형태 |
|---|---|---|
| 탐지 결과 뷰어 | A02(pnu·emd·conf 패널), A04 변화, A06 여수, B06 석면, B05 차량 OBB 실추론 | V + 크롭 이미지(A12) |
| GT vs 추론 스와이프 | B09·B10 토지피복 GT ↔ C09 추론; 토지피복 UNet in/out 32쌍(B12); 제주 세그 래스터(A10) | T + V |
| 하천 점유 분석 | B02 GPKG 4레이어(하천구역·하천 내 건물·걸침 건물) + river_vt(A05) | V + 통계 |
| 하천 유입쓰레기 | 만경강 EXIF 포인트 2,000 + bbox(B08), 여수·서남해(A06·A07) | V(포인트) + I(팝업) |
| 도로 추출 | C03 시연 도엽 + 도로 라벨 SHP + 학습셋 KPI | T + V |
| 지적재조사 | C05 종전지적선 vs 경계조정선 + ECW 정사 | T + V |
| 재난 | 예천 백석리 1.75cm(C07), 산불 폴리곤(B07), 재난피해 학습셋 갤러리(D08) | T + V + I |
| 워크플로(드론) | kuksan 5cm(A09) + drone.glb(A12) + 촬영면적(B07); 비행 궤적은 실측 없음(합성이면 "예시" 표기) | T + 3D |
| 표준 리포트·통계 | B02 시군구 통계, A02 읍면동 집계, B01 모델 지표 | I(차트) |

### 4.4 데이터 관리(`dataset.html`, `produce.html`)
| 기능 | 자산 | 형태 |
|---|---|---|
| 데이터셋 카탈로그(실측 수치) | AI Hub 토지피복 4권역 칩 수·클래스 분포·촬영연도(B09·B10·C08), aerial 153k·drone 154k·도로 311k(D02·D03·C03), 남원 5셋(D01), OBB 6클래스(B11), 현안 학습셋(D05·D07·D08) | I(카드·차트) |
| 커버리지 지도 | 토지피복 칩 중심점 히트맵(META 전수 추출), 드론맵 인덱스 136k(B07), 25cm 도엽 인덱스(C01 TFW), 도로 정사 302장 경계 | V |
| 라벨 품질 | `label_quality_report.json`(D02), `_inspect_greenhouse` 오버레이 220장 | I |
| 원천 미리보기 | 전북 25cm jpg 미리보기 1,609장(C01), 크롭(A12) | I |
| 배포·게시 | 웹 타일 세트 12개·GeoJSON 목록(A01~A10) → PMTiles 패키지 | – |

### 4.5 프로젝트 라벨링/학습(`ai-project*.html`, `ai-card*.html`, `ai-publish-create.html`)
| 기능 | 자산 | 형태 |
|---|---|---|
| 라벨링 캔버스(실동작) | AXIS 익산 황등 1.36cm·경북 2.95cm 정사(B04) + 검수 라벨 2,662 오버레이; 백엔드 후보 AXIS-Label(D10) | T + V |
| 자동 라벨(모델 보조) | SAM2·YOLO-E·YOLO-World(D11), 임베딩 유사도 히트맵(D10) | API |
| 모델 카드 | 남원 5종(B01: mAP·PR·F1·혼동행렬·예측 이미지), 차량 3종(D04), drone_v2(D03), 항공 best.pt(D02), DeepLabv3+(D06) | I |
| 학습 모니터 | `results.csv` 실측 곡선(B01·D03), `monitor.py` 원형(e-projects §2) | I(라이브 차트) |
| 학습데이터 샘플 | OBB 6클래스 1,899(B11), 남원 1024² 칩(D01), val_batch labels/pred 쌍(B01) | I |
| 모델 게시 → 지도 | B05 OBB 추론 → GeoJSON, C09 25cm 추론 → PMTiles | V |

### 4.6 대시보드(`dashboard.html`, `charts.html`)
| KPI·차트 | 자산 |
|---|---|
| 전국 하천 점유 건물 단계구분도(252 시군구, 651,478건, 주소 미확인 182,458) | B02 |
| 해양쓰레기 헥사·컬럼(여수 2년 비교, 서남해 격자 9,032) | A06·A07 |
| LX 드론맵 커버리지(136,025셀, 촬영면적 55, 산불) | B07 |
| 남원 비닐하우스·농경지 읍면동 집계(1,674 / 2,098), 변화 456 | A02·A04 |
| 학습데이터·모델 KPI(칩 수, 폴리곤 205만, mAP) | D01~D05, B01 |
| 글로브 → 전국 → 과제 지역 줌 보간 | A05·A11 + deck HexagonLayer/HeatmapLayer |
| 기관 → 과제 Arc | 현재 `orgs.geojson`은 5점 샘플 → 실제 기관·과제 목록으로 교체 필요 |

### 4.7 기관 포털(`portal*.html`, `portal-dp-*.html`, `portal-login-*.html`)
| 포털 화면 | 실데이터 | 상태 |
|---|---|---|
| `portal-dp-nw-farm-25` 남원 농지 | A01·A02·A03·B01·B09·C09 | **실데이터 충분** |
| `portal-dp-nw-change` 남원 변화 | A04 + A01 4시점 | 충분 |
| `portal-dp-nw-road-26` 남원 도로 | OBB 포트홀 클래스(B11), 맨홀·hole 학습셋(D08) — **좌표 없음** | 갤러리·모델 카드만 가능. 지도 결과는 없음 |
| `portal-dp-nw-living-23` 남원 생활 현안 | OBB 6클래스(B11: 폐가·소각장·석면·쓰레기), 대구경북 6클래스(D05) — EXIF 확인 필요 | B11 EXIF가 있으면 포인트 가능 |
| `portal-dp-nw-crowd-27` 인파 | **실데이터 없음**(AI Hub 71368도 좌표 없음) | "예시" 표기 또는 제외 |
| `portal-dp-gj-marine-25·27` 광주전남 해양 | A06·A07·B13(집하장 2025.4, 수심) | 충분 |
| 하천(cleanriver 연계) | A05·B02 | 충분, 운영 중 서비스와 동일 데이터 |
| `portal-login-namwon`, `-gwangju-jeonnam` | 기관 CI | – |

### 4.8 관리자(`admin-map.html`, `admin-publish.html`)
행정경계(A11) + 게시 데이터셋 목록(A01~A10, B02, B07). `admin-map.js`의 swap 로직은 `map-gl.js`와 중복이므로 공통 엔진으로 합친다(`stack.md`).

---

## 5. 플래그십 추천: 남원 "농지·시설물 AI 모니터링"

### 5.1 왜 남원인가
| 기준 | 남원 | 전북 서부(LX본사–익산–김제–군산) | 여수·전남 해양 |
|---|---|---|---|
| 웹 준비 완료 자산 | 정사 4시점+전역 2시점, AI 추론 3,772건, 변화 456, 건물 5,109, 지형 (Tier 0 8종) | kuksan 5cm 타일, 본사 60MB만 | GeoJSON 4종 |
| 원천 두께 | 모델 5종+지표, 학습셋 2.1만 장, OBB 1,899장, 토지피복 GT 도엽, 25cm 2023 도엽, 25cm 4클래스 모델 | **가장 두터움**: 1.44cm+DSM, 3.4TB 도로 정사+라벨, 본사 3D 메시·LAS, AXIS 라벨, 하천 점유, 만경강 쓰레기 GPS, 지적재조사 | 원본 없음(lx_2023 소실) |
| 화면 준비 | 포털 5화면(nw-*)이 이미 남원 기준 | 없음 | gj-marine 2화면 |
| 전처리 부담 | 낮음(1~2일) | 높음(1~2주, ECW·LAS·OBJ 도구 설치 포함) | 낮음 |
| 결손 | 원본 정사·27,676 탐지 결과 없음 → C09로 대체 | 촬영일 미상(밀양), 오버뷰 없음 | 지형 미러 없음 |

**결론**: "실제 운영 가능 수준"을 가장 빨리 증명할 수 있는 곳은 남원이고, 한 지역에서 영상→AI→변화→3D→통계→포털까지 **전 기능이 실데이터로 닫힌다**. 전북 서부는 원천이 더 두텁지만 플래그십 뒤에 붙일 2단계 확장(LX 본사 히어로 3D는 메인 랜딩 한 장면으로 먼저 끌어온다).

### 5.2 플래그십 서비스 정의
- **지역**: 남원시 전역(배경·통계) + 농경지 AOI 0.8×0.9km(cm급 시계열).
- **화면**: `ximap.html` 남원 모드, `analysis-ai.html`, `portal-dp-nw-farm-25`, `portal-dp-nw-change`, `dashboard.html` 남원 탭, `ai-card.html` 모델 5종.
- **데이터 흐름**: xdworld z19 → 2023 25cm 남원 도엽(C01) → city 2m(A03) → AOI 1~2cm 4시점(A01) 줌 자동 전환 / 위에 비닐하우스·농경지·변화(A02·A04) 3D 압출 / 읍면동 집계(A11) / 토지피복 GT(B09) / 남원 전역 4클래스 재추론(C09) / 지형·건물(A08) / 모델 카드(B01) / 필지(C04 또는 V-World).

### 5.3 필요한 전처리 작업 목록(순서대로)

| # | 작업 | 입력 | 도구 | 산출물 | 예상 |
|---|---|---|---|---|---|
| P1 | 기존 웹 타일 12세트 + GeoJSON을 PMTiles로 패키징(선택) 및 `serve.mjs` Range 지원 확인 | A01~A10 | `gdal raster tile`→MBTiles→`pmtiles convert`(설치) 또는 XYZ 유지 | `namwon_*.pmtiles` 또는 현행 XYZ | 0.5일 |
| P2 | `map-gl.js` 공통 엔진화: 회전·피치 잠금 해제, maxZoom 19, 2D/3D/글로브 모드, 로컬 지형·건물 토글 | – | JS | 화면 공통 엔진 | 1일 |
| P3 | 2023 25cm 전북비도시에서 남원 도엽 추출 → VRT(`-a_srs EPSG:5186`) → XYZ WebP z10–18 | C01 전북 1,609장 중 남원 도엽(TFW로 인덱스, **비도시 커버 범위 확인**) | gcs GDAL | `tiles/namwon_ap25_2023/` | 0.5~1일(도엽 수십 장) |
| P4 | 남원 전역 4클래스 추론 | P3 도엽 × `E:\best.pt`(건물·주차장·경작지·비닐하우스) | ultralytics + rasterio 타일 추론(`infer_orthomosaic.ipynb` 응용) → 폴리곤 | `results/namwon-landcover-2023.geojson` → `ogr2ogr -f PMTiles` | 1일(GPU) |
| P5 | 125 전라 남원 도엽 35710074 모자이크 + GT 벡터 | zip 내 칩 483장 + META + GeoJSON | rasterio(칩 지오레퍼런싱→merge→3857) + pyproj | `tiles/namwon_lc_gt_2019/`, `geo/namwon-lc-gt.geojson` | 0.5일 |
| P6 | 모델 카드 자산 복사 | B01 `results.csv`, PR·F1, confusion, val_batch_pred | 복사·WebP 변환 | `assets/models/namwon/*` | 0.5일 |
| P7 | OBB 6클래스 남원 1,899장 EXIF GPS 추출 + 썸네일 + 라벨 렌더 | B11 | PIL EXIF | `geo/namwon-obb-points.geojson`, 썸네일 | 0.5일(GPS 없으면 갤러리만) |
| P8 | 필지 레이어: 국토정보기본도 2.0 남원 SHP → 4326 → PMTiles z12–17 | C04 전북\남원 | ogr2ogr PMTiles(대용량이면 WSL tippecanoe) | `namwon-parcels.pmtiles`(PNU·지목·공시지가) | 0.5일 |
| P9 | V-World 키 갱신 + `serve.mjs` `/api/vworld/*` 프록시·디스크 캐시 | E01 | Node | 연속지적 WMS, GetFeature, 검색 | 0.5일(키 발급 대기 별도) |
| P10 | 읍면동 집계·KPI JSON 사전 계산 | A02·A04·P4 × `namwon-emd` | geopandas sjoin | `stats/namwon-*.json` | 0.5일 |
| P11 | 지형 보강: AWS Terrarium 남원 z14–15 미러 추가(현 z9–13) | E02 | 다운로드 스크립트 | `terrain-namwon` 확장 | 0.5일 |
| P12 | 벤더링: deck.gl 9.3.10, three 0.185.1, pmtiles 4.x, gsap 3.15, lenis 1.3.26을 `vendor/`로 | – | npm(1회 네트워크) | 오프라인 시연 가능 | 0.5일 |

합계 약 7~8일. P1~P6까지(약 4일)만 끝나도 "영상 4시점 + 25cm 전역 배경 + AI 결과 3D + 모델 카드 실측"이 한 화면에서 실데이터로 닫힌다.

### 5.4 2단계 확장(플래그십 뒤에 붙일 것)
1. **LX 본사 3D 트윈**(B03): 정사 XYZ + DSM terrarium + OBJ→GLB → 메인 히어로. 필요 도구: Node `obj2gltf`.
2. **전북 서부 농지·시설물**: 용지 1.44cm+DSM(C02), AXIS 익산 정사+라벨(B04), 차량 OBB 실추론(B05), 만경강 쓰레기 GPS(B08), 하천 점유(B02), 지적재조사(C05, QGIS ECW 변환).
3. **전국 대시보드**: river_vt(A05), 드론맵 커버리지(B07), 하천 점유 651,478 단계구분도(B02), 토지피복 칩 히트맵(C08).
4. **여수·전남 해양**: A06·A07·B13 + 여수 지형 미러 + AI Hub 506·71363 부분 다운로드.

---

## 6. 미확인·리스크
- 2023 25cm "비도시" 정사가 남원 어느 도엽까지 덮는지(시가지 제외 가능성) — TFW 인덱스로 확인해야 함(P3 선행).
- OBB 6클래스 학습데이터의 EXIF GPS 존재 여부(방치쓰레기 원본은 `_GeoTag` 파일명임에도 EXIF가 없었음).
- `serve.mjs` HTTP Range(206) 지원, deck UMD 내 h3-js 포함 여부.
- 294 아산 클래스 001~009 명칭, 밀양 촬영일, `E:\best.pt` 검증 지표.
- 사무용 노트북(iGPU) 성능: 지형·DPR2는 티어별 강등 필요.
- V-World Data API 레이어명은 키 만료로 미검증(레이어명 오류가 아닌 EXPIRE_KEY만 확인).
