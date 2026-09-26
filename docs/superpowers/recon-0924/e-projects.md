# recon-0924 · e-projects — E:\ 작업 폴더 실데이터 조사

조사일 2026-09-24 · 읽기 전용(파일 이동·수정 없음) · 대용량 파일은 헤더·메타만 읽음(rasterio 1.4.4 / 내장 GDAL 3.10.3, PIL EXIF, torch 체크포인트 메타, SQLite/GPKG 읽기전용).

> **환경 정정**: 이 PC에는 GDAL **CLI**(gdalinfo·ogr2ogr·gdal2tiles)는 없지만, Python 3.11 에 **rasterio 1.4.4(GDAL 3.10.3 번들)·geopandas 1.1.4·fiona·pyogrio·pyproj·shapely** 가 설치되어 있다. 좌표 변환, COG 변환, XYZ 타일 생성, GPKG→GeoJSON 변환은 Python 으로 가능하다. `landxi-portable-copy` 메모의 "GDAL 없음"은 CLI 기준으로만 맞다. ultralytics 8.3.234 + torch 2.5.1+cu118 도 있다(모델 추론 가능).

---

## 0. 한눈에 — 가장 가치 있는 자산 상위 10

| # | 자산 | 경로 | 핵심 수치 | Land-XI 화면 | 우선 |
|---|---|---|---|---|---|
| 1 | **전국 하천구역 건물 점유 분석 결과(GPKG)** | `E:\행안부\03. 분석결과_v2\<시도_시군구>\*.gpkg` | 252개 시군구, 건물 651,478건(주소 미확인 182,458), 레이어 4종, EPSG:5186, 20GB | 국토 모니터링 · 하천 불법시설 탐지 결과 지도 · 통계 대시보드 | ★★★ |
| 2 | **전국 하천 벡터타일 + 하천 폴리곤(운영 중)** | `E:\행안부\07. 대국민 서버\data\river_vt` (pbf z6–14, 868개), `river_dedup`(252 시군구 GeoJSON.gz, WGS84), `river_mask`·`river_raster`·`river_grid_uni` | cleanriver.kr 실서비스에 쓰는 데이터. manifest built 2026-08-05 | 전국 베이스 레이어(하천) · 바로 MapLibre `vector` 소스 | ★★★ |
| 3 | **LX 본사(전주 혁신도시) 드론 3D 일체** | `E:\Image\본사촬영\220413_본사일대(1)\` | 정사 3.42cm(12614×12773, RGBA) + DSM float32 + **텍스처 3D 메시(OBJ 72MB·FBX·texture.jpg)** + 고밀도 점군 LAS 약 2,329만점(792MB), 2022-04-13, EPSG:5186, 127.0636–127.0684 / 35.8358–35.8398 | 히어로·3D 디지털트윈 데모(LX 우선 서사), 드론 정사 비교 | ★★★ |
| 4 | **남원 AI 모델 5종(YOLO11x-seg) + 학습 지표** | `E:\namwon\<과제>\runs\segment\train*\` | 사일리지 mask mAP50 0.968 / 비닐하우스 0.945 / 경작·비경작 0.947 / 생육기 사료작물 0.985 / 생산기 0.972 | AI 모델 카탈로그 · 성능 카드 · 분석 실행 화면 | ★★★ |
| 5 | **AXIS-Label 라벨링 플랫폼 + 드론 정사 2장 + 라벨 2,662건** | `E:\Auto_Label_project\` (`data\images\*.tif`, `data\axis.db`) | 47720_001.tif 2.95cm (128.4503–128.4778 / 36.3066–36.3288), 익산 황등3·4지구 1.36cm (126.9419–126.9512 / 35.9915–36.0048), 둘 다 EPSG:5186 + 오버뷰. 라벨: 자동차 2,462·맨홀 200(SAM 정제 폴리곤) | 학습데이터 생산·검수 화면, 라벨 오버레이 지도 | ★★★ |
| 6 | **차량 탐지 모델(OBB, mAP50 0.992) + 정사 타일추론 노트북** | `E:\drone_runs\car_v2_obb\run\weights\best.pt`, `car_v1\infer_orthomosaic.ipynb` | 18만 장 학습, 정사영상 타일링→전역 NMS→GeoJSON 파이프라인 완비 | 실시간 객체 탐지 데모(#5 정사에 추론→GeoJSON) | ★★★ |
| 7 | **밀양 드론 정사 140도엽** | `E:\Image\3_밀양 (TIFF)\B*.tif(+tfw/prj)` | 457GB, 3.37cm, RGBA, TM(WGS84, 중부원점), 전체 범위 128.579–128.992 / 35.345–35.618 | 대용량 정사 타일 서비스 시연(광역 드론 커버리지) | ★★☆ |
| 8 | **항공 토지피복 세그 모델 + 15만 장 데이터셋** | `E:\best.pt`, `E:\aerial_dataset` | 건물·주차장·경작지·비닐하우스, 153k장(512², 25cm, 경기·경상·전라·제주), 폴리곤 205만 개 | 모델 카탈로그, 데이터셋 현황, 탐지 결과 샘플 갤러리 | ★★☆ |
| 9 | **드론 4클래스 세그 모델 + 15만 장 데이터셋** | `E:\drone_runs\drone_v2\weights\best.pt`, `E:\drone_dataset` | 경작지·비닐하우스·가건물·천막, mask mAP50 0.863, 154k장(1024², 약 527GB) | 불법 가설건축물 탐지 시나리오 | ★★☆ |
| 10 | **청정전남 제안 사이트 데이터(해양)** | `E:\land-xi.dev\jeonnam\src\data\` | 전남 시군 경계, 신안 수심 래스터(ETOPO 2022), 해양쓰레기 집하장 현황(2025.4), 읍면동 중심점, 위성·항공·드론·수중 이미지 | 해양 모니터링 화면, 스토리텔링 스크롤 연출 참고 | ★★☆ |

---

## 1. 남원 사료작물·농지 AI (`E:\namwon`, 57GB, 51,266 파일)

5개 과제 모두 **YOLO11x-seg**, imgsz 1024, 학습 이미지는 1024×1024 RGB tif(deflate). **지오레퍼런스가 없다**(tfw·GeoTIFF 태그 없음). 파일명 `1F001D40305` 에서 `D4/D6/D8` 은 촬영 시기(4·6·8월 드론, nw_2504/2506/2508 과 대응하는 것으로 추정)이고, `위성` 하위 `0C00xS7…` 는 위성 512² 타일이다.

| 과제 | 클래스 | train/val | 최고 성능(Mask) | 가중치 |
|---|---|---|---|---|
| Silage | 곤포사일리지 | 1,608 / 402 | P .979 R .943 **mAP50 .968** mAP50-95 .923 (ep626/738) | `Silage\runs\segment\train\weights\best.pt` 125MB, 2026-01-09 |
| Vinyl_house | 비닐하우스_단동, _다동 | 1,549 / 404 | mAP50 .945 / .824 (train, n모델 6MB) · train2(x) .931 / .827 | `Vinyl_house\runs\segment\train{,2}\weights\best.pt` (+`Vinyl_house_pt.zip`) |
| cultivate_uncultivate | 경작지, 비경작지 | 1,418 / 404 (+위성 3,155 / 1,058) | mAP50 .947 / .818 | `…\train\weights\best.pt` 125MB, 2026-01-07 |
| growth_baseline | IRG, 수단그라스, 옥수수, 호밀 (생육기) | 7,036 / 1,762 | **mAP50 .985** / .890 (1000 ep) | `train, train2, train22` 3종 |
| production_baseline | IRG, 수단그라스, 옥수수, 호밀 (생산기) | 5,365 / 1,344 | mAP50 .972 / .863 | `…\train\weights\best.pt` |

- 각 run 폴더에 `results.csv`, `results.png`, PR/F1 곡선, `confusion_matrix*.png`, `val_batch*_labels.jpg / _pred.jpg`(정답·예측 비교) 가 있다. 웹 **모델 카드에 그대로 쓸 수 있는 실제 이미지**다.
- **추론 결과(남원 전역)**: `3. yolo predict n(비닐하우스).ipynb` 출력 기록상 `gj_6m.tif`(267,466×435,707 px, 1.81cm, EPSG:5186 원점 224303/308702) → 145,613 타일 추론 → **비닐하우스 27,676개 폴리곤**(단동 18,736 · 다동 8,940) GeoJSON 이 만들어졌다. 저장 위치는 `D:\python\Namwon\namwon_tif\tiles\Vinyl_house_final_results\detections.geojson` 인데 **이 PC의 D:\python\Namwon 은 없다**(사무실 PC 또는 다른 디스크). 확보되면 ★★★ 자산이다.
- 원천 분류 폴더도 `D:\python\Namwon\Class_sorted`(13 클래스: 작물×생육/생산기, 비닐하우스 2, 곤포사일리지, 경작/비경작)이며 이 PC에는 없다.
- 웹 활용: 모델 카탈로그(5개 모델·클래스·지표), "남원 스마트 농지" 시나리오. 지도 위 결과는 detections.geojson 확보가 필요하다. 없으면 `val_batch*_pred.jpg` 를 샘플 갤러리로 쓴다.

## 2. 항공 데이터셋·모델 (`E:\aerial_dataset`, `E:\aerial_runs`, `E:\best.pt`, `E:\runs`)

- **데이터셋**: YOLO-seg 폴리곤, 4클래스 `건물·주차장·경작지·비닐하우스`, train 105,036 / val 22,506 / test 25,753(512×512 PNG, 지오태그 없음). 파일명 `LC_{GG|GS|JL|JJ}_AP25_{도엽번호}_{nnn}_{연도}` 는 AI Hub 토지피복 25cm 항공(경기·경상·전라·제주, 2019–2021)이다. **1:5000 도엽번호가 있어 도엽 단위로 역지오레퍼런싱할 수 있다**.
- `label_quality_report.json` (이 데이터셋 기준 추정): 폴리곤 수 건물 1,059,267 · 주차장 147,469 · 경작지 739,204 · 비닐하우스 110,091. 클래스별 꼭짓점·compactness 통계가 들어 있다(데이터 품질 대시보드용).
- `_inspect_greenhouse\overlay` 60장, `crop\large|medium` 은 비닐하우스 라벨 검수 오버레이 이미지다.
- **모델**:
  - `E:\best.pt` 45MB: 클래스 동일 4종, 2026-05-16, 최종 스트립본(aerial_v2_finetune2 계열로 추정). 지표 파일은 동봉되지 않았다.
  - `E:\runs\segment\train\weights\best.pt` 90MB: **드론 4클래스**(경작지·비닐하우스·가건물·천막), 45 ep, mask mAP50 .887.
  - `runs\segment\train2` (항공 4클래스, 1ep, mAP50 .876) · train3/4 는 가중치가 비어 있다.
  - `aerial_runs\aerial_v1, v2`: 가중치 없음. v2 train.log 는 1 epoch 도중에 끊겼다(13,130 it/epoch).
- 스크립트: `aerial_train.py`/`aerial_train_4090.py`(yolo11x-seg, 1280, 200ep), `aerial_predict.py`(폴더 추론·클래스 통계), `drone_train.py`(GPU1), `sequential_launcher.py`(드론 종료 후 항공 자동 시작), `monitor.py`(results.csv+로그 → ETA·ASCII 차트).
- 웹 활용: "학습 파이프라인·모델 버전" 화면의 실제 수치 근거, 학습 모니터 UI(실시간 ETA·mAP 곡선) 디자인의 원형.

## 3. 드론 데이터셋·모델 (`E:\drone_dataset`, `E:\drone_runs`)

- **drone_dataset**: YOLO-seg, `경작지·비닐하우스·가건물·천막`, train 107,776 / val 23,092 / test 23,103(1024² PNG). 원천은 AI Hub 아산 환경 드론(JSON 메타 예: `create_date 2022.08.02`, `create_gsd 2`(cm), 지역코드 `Asan/B1`). 이미지 자체의 좌표는 없다. 용량은 AXIS 문서 기준 약 527GB이고, `du` 는 시간 초과로 끝까지 재지 못했다.
- **drone_v2** `weights\best.pt` 249MB(+epoch0–110 체크포인트): 114 ep, 최고 ep110 Box mAP50 .875 / **Mask mAP50 .863**, mAP50-95 .614.
- **차량(vehicle) 3종**, 원천 JSON 18만 건(class_id 001… 폴리곤, 1024² 타일):
  - car_v1 (yolo11x det, 1024): 31ep, **mAP50 .984 / 50-95 .916**, best.pt 228MB
  - car_v2 (x-seg): 26ep, Mask mAP50 .983 / .896, `best(Car).pt` 249MB
  - **car_v2_obb** (x-obb): 200ep, **mAP50 .992 / mAP50-95 .959**, `run\weights\best.pt` 118MB
- `car_v1\infer_orthomosaic.ipynb`: GeoTIFF를 rasterio로 읽고 1024 타일·20% 겹침으로 추론한 뒤 전역 NMS를 거쳐 CSV와 GeoJSON(transform+crs)으로 내보내는 **완성 파이프라인**이다. 기본 입력 `car_v1\sample\ortho.tif` 는 비어 있다.
- 웹 활용: 차량 OBB 모델을 AXIS 정사(#5)나 LX 본사 정사(#3)에 돌리면 **실제 탐지 GeoJSON** 이 바로 나온다. "AI 탐지 실행 → 지도에 결과가 쏟아지는" 데모의 가장 현실적인 경로다.

## 4. AXIS-Label (`E:\Auto_Label_project`, 7.6GB, 약 2.1만 파일)

- **정체**: "LX GeoAI 자율진화 라벨링 플랫폼". DINOv2 ViT-L/14 임베딩, 클래스별 경량 head(sklearn), SAM2 정제, YOLO 재학습 루프로 돈다. **FastAPI + Uvicorn + SQLite(WAL) + Vanilla JS SPA**(`app.py` 289KB, `static\`), ngrok 배포.
- 모델: `sam2_b.pt` 162MB, `mobileclip_blt.ts` 600MB, `yoloe-11s-seg.pt`, `yolov8s-worldv2.pt`, `yolo11n(-seg).pt`, `data\heads\class14_v1…` 등 head 73개.
- **정사영상(지오레퍼런스 확인됨, 합계 3.6GB)**:
  - `data\images\47720_001.tif`: 82,467×82,674×3, **2.95cm**, EPSG:5186, WGS84 128.45034–128.47780 / 36.30657–36.32884 (경북 내륙), 오버뷰 2–256
  - `data\images\익산_황등3,4지구.tif`: 61,582×108,889×3, **1.36cm**, EPSG:5186, WGS84 126.94188–126.95118 / 35.99146–36.00481, 오버뷰 있음
- `axis.db`(읽기전용 조회): image 2 · tile 166,916(256px) · label 2,662(자동차 2,462 · 맨홀 200; `polygon_geojson` 은 정사 픽셀 좌표이므로 영상 transform 으로 곧바로 지리좌표 변환 가능) · head 60 · audit 3,727 · round 2.
- `data\exports\yolo_all_seg` 등 6,716 파일(841MB)의 YOLO export, `data\ingested` 13,825 파일(외부 셋 반입), `data\embeddings\1.npy, 2.npy`(653MB, 타일 임베딩 → **유사도 히트맵** 시각화 가능).
- 문서: `CLAUDE.md`(전체 명세), `UI_REDESIGN.md`(Roboflow 벤치마크 UI 개편안: 파이프라인 스테퍼·카운트 배지·헬스체크), `DATASETS_E_DRIVE.md`(E:\ 학습데이터 인벤토리와 반입 순위), `IDEAS.md`(78KB).
- 웹 활용: Land-XI "학습데이터 생산" 모듈의 실동작 백엔드 후보다. 두 정사는 COG/XYZ 로 타일링해 지도에 올리고, 라벨 2,662건은 GeoJSON 으로 변환해 오버레이한다. 임베딩 유사도 히트맵은 "AI가 보는 지도" 연출에 쓸 수 있다.

## 5. Image (`E:\Image`, 10 폴더)

| 폴더 | 내용 | 메타 | 활용 |
|---|---|---|---|
| **3_밀양 (TIFF)** | 정사 140 도엽 B1…B140 (tif+tfw+prj) **457GB** | 예: B1 46,324×27,583×4, 3.37cm, LZW, 오버뷰 없음. CRS = TM(WGS84, 원점 38N/127E). 전체 128.5792–128.9924 / 35.3450–35.6176 | 광역 드론 정사. COG·오버뷰 생성 후 XYZ 타일 필요 |
| **본사촬영** | `220411_본사정사영상.tif` 58MB(6,858×5,770×4, 3.42cm, 127.06439–127.06699 / 35.83702–35.83880) · Pix4D 프로젝트 2벌 `220413_본사일대`, `…1` | 각 프로젝트: 모자이크 249MB(12,614×12,773×4, EPSG:5186), DSM 293MB float32, **3D 메시 OBJ/FBX + 19MB 텍스처**, **LAS 1.2 점군 792MB(약 2,329만점, fmt3 RGB)**, tie-point LAS | **LX 본사 3D 트윈 히어로**. OBJ→glTF/3D Tiles, LAS→Potree/COPC, DSM→terrain-rgb |
| 45130_001_1 | Mavic 2 Pro 원본 280장(2022-11-27, 35.984/126.668 부근) + 자체 스티칭 파이프라인 v200(CLAUDE.md, stitcher_v*.py) | 5472×3648 | 스티칭 연구. 웹 활용도는 낮음 |
| 45710-002-07 | L1D-20c 55장, 2022-12-15, 35.815/127.005 | EXIF GPS | 원본 사진 포인트 |
| A140 / high resolution | FC6510 538장(+보정본), 2021-09-03, 34.529/127.355(고흥 부근) | EXIF GPS | 사진 위치 포인트 레이어 |
| F12 | FC6510 2,705장, 2021-06-29, 34.751/127.332 | EXIF GPS | 〃 |
| image | FC6520 480장, 2021-11-23, 35.104/129.006(부산) | | 〃 |
| 맨홀 | FC6520 542장, 2021-10-05, 35.488/128.932 | | 맨홀 탐지 샘플(AXIS 맨홀 클래스와 연결) |
| 방치쓰레기 예제\김제 | RX1R II 7952×5304, 2022-01-04, 35.820/126.929 + PNG 358 | | 방치쓰레기 탐지 시나리오 샘플 |

## 6. 기존 웹앱 구조 요약

### 6-1. land-xi.dev (`E:\land-xi.dev`, 40MB, git)
- `site\`: **개인 사이트**(김태진). Node 빌드 스크립트(`build.mjs`)가 `data.json` 을 정적 HTML 30쪽으로 만들고, Cloudflare Pages(`wrangler pages deploy`)로 배포한다. `assets\media\landxi.mp4`, `landxi-poster.webp` 와 카드 이미지(namwon, cls_farm, cls_trash, label, geoax 등)는 **Land-XI 홍보 영상·썸네일로 재활용**할 수 있다.
- `jeonnam\`: **청정전남 AI시스템 제안 사이트**. 빌드 결과는 단일 HTML(약 2.1MB), 의존성은 Chart.js 와 Google Fonts 뿐이다. 캔버스 기반 자체 지도 엔진(전남 실경계), **스크롤 스크럽 카메라와 13챕터 시나리오**, 격자 5층 3D 레이어 뷰어, 히트맵·해류 입자·O-D 모델, 침적 예측(ETOPO 2022 수심 등심선), 통합관제 대시보드를 갖췄다. Cloudflare Pages Functions + KV(노트·인증), GitHub PR 미리보기로 운영한다. 데이터는 전부 `src\data\*.html` 의 `window.X = {...}` 인라인이다(JN 시군 경계 bbox 125.08–127.90 / 33.97–35.49, BATHY, DEPOT_DATA 2025.4, HI_DATA 이미지).
  - **Land-XI 에 주는 시사점**: 인터랙티브 스토리텔링 수준(스크롤 연동 카메라·입자·3D 레이어 분해)이 이미 여기서 구현되어 있다. Land-XI 개편에서 "목업 수준" 비판을 넘으려면 최소한 이 수준의 연출을 MapLibre/WebGL 위에서 재현해야 한다.
- `design\*.dc.html`: PR 사이트 디자인 시안(Direction A–D, Main* 12종).

### 6-2. rivercheck-app (`E:\rivercheck-app`, 181MB)
- "MOIS 하천점검"(`kr.go.mois.rivercheck`)은 **Capacitor 8 WebView 래퍼**다. `server.url` 이 ngrok 고정 도메인을 가리키고, 실제 서버는 `E:\행안부\05. 서버운영`(Jupyter `04_server_v10_*.ipynb` 기반 Flask 계열)이다. allowNavigation 에 `xdworld.vworld.kr`·`api.vworld.kr` 이 있어 **브이월드 2D/3D 를 직접 호출**한다. 앱 자체에는 화면이 없다.

### 6-3. cr_build / cleanriver_lx_out (청정 하천·계곡 관리시스템, 대국민)
- `cr_build`: `kr.go.mois.cleanriver` Capacitor 8.4.2 래퍼로 `https://cleanriver.kr` 을 띄운다(`CLEANRIVER_URL` env 로 교체). Play 등록 자산(feature graphic, 스크린샷)과 release 서명 스크립트가 있다.
- `cleanriver_lx_out` → 심볼릭 링크 `E:\행안부\07. 대국민 서버\deploy-lx\out`(11GB): LX 이관 패키지. 데이터 tar 3조각(river 3.0G + river_grid_uni 7.1G + river_mask 307M + river_raster 311M + shops), docker 이미지, nginx 이미지, static, APK 1.1.0-5, 브이월드 키 파일(`vworld-key.txt` 가 있다는 것만 확인했고 값은 옮기지 않음).
- 원본 서비스 `E:\행안부\07. 대국민 서버`: **Nginx + Gunicorn/Flask + Redis 구조, DB 없음, 읽기전용**. 브이월드 WMTS 배경과 LX맵 WMS를 서버 측 키 주입으로 쓰고, 동접 2,000~4,000명을 대기열로 받는다. 데이터: `river_vt`(MVT pbf z6–14), `river_dedup`(시군구별 하천 폴리곤 GeoJSON.gz, WGS84), `river_grid(_uni)`(0.05° 격자 분할 GeoJSON), `river_raster`·`river_mask`(z10–14 래스터·마스크 타일, 등급별 국가/지방/소하천), `shops`(참여업소 40곳 좌표).
- 분석 결과 `E:\행안부\03. 분석결과_v2`: 시군구별 GPKG(EPSG:5186, 20GB). 레이어는 `지방하천`, `소하천`(하천구역 폴리곤, 관리번호·고시정보 포함), `건물분석결과_하천 내 위치`, `건물분석결과_하천 구역 걸침`(속성: 하천등급·하천명·종류·용도·층수·건물면적·점유면적·점유율·주소)이다. `_처리결과.csv` 기준 **252 시군구, 건물 651,478건**. 시군구별 `.qgs` 와 `_리포트.xlsx` 도 있다(`03. 분석결과`).

### 6-4. jeju_breath (`E:\jeju_breath`, 185KB)
- 제주 탄소중립 시연 데모(Flask + **Leaflet 1.9.4** + Esri Wayback 위성). 필지 클릭 시 **브이월드 GetFeature(LT_C_LANDINFOBASEMAP)를 서버 프록시(`/api/parcel`)로 실호출**하고, 탄소값은 결정론적 모의 데이터다. `static\jeju_boundary.js`(70KB, 제주 해안선) 와 CI 이미지(lx_ci, lx_ci_white, lx_mark, jeju_ci)가 있다. **주의**: `app.py` 에 브이월드 키가 하드코딩되어 있다(재사용 시 서버 env 로 옮길 것).

### 6-5. DockerData
- `E:\DockerData\DockerDesktopWSL\{disk,main}`: Docker Desktop WSL 가상디스크 저장소다. 데이터 자산이 아니므로 목록만 확인했다.

---

## 7. 모델 전체 목록(.pt, 클래스는 체크포인트에서 직접 읽음)

| 경로 | 크기 | 과제 | 클래스 | 성능(최고) |
|---|---|---|---|---|
| `E:\best.pt` | 45MB | 항공 seg | 건물, 주차장, 경작지, 비닐하우스 | 미동봉 |
| `E:\runs\segment\train\weights\best.pt` | 90MB | 드론 seg | 경작지, 비닐하우스, 가건물, 천막 | Mask mAP50 .887 |
| `E:\runs\segment\train2\weights\best.pt` | 90MB | 항공 seg(1ep) | 항공 4종 | .876 |
| `E:\drone_runs\drone_v2\weights\best.pt` | 249MB | 드론 seg | 드론 4종 | Mask mAP50 .863 |
| `E:\drone_runs\car_v1\weights\best.pt` | 228MB | 차량 det | vehicle | mAP50 .984 |
| `E:\drone_runs\car_v2\weights\best(Car).pt` | 249MB | 차량 seg | vehicle | Mask .983 |
| `E:\drone_runs\car_v2_obb\run\weights\best.pt` | 118MB | 차량 OBB | vehicle | **.992 / .959** |
| `E:\namwon\Silage\…\best.pt` | 125MB | 곤포사일리지 | 1종 | .968 |
| `E:\namwon\Vinyl_house\…\train\best.pt` | 6MB (n) | 비닐하우스 | 단동·다동 | .945 |
| `E:\namwon\Vinyl_house\…\train2\best.pt` | 125MB (x) | 〃 | 〃 | .931 |
| `E:\namwon\cultivate_uncultivate\…\best.pt` | 125MB | 경작/비경작 | 2종 | .947 |
| `E:\namwon\growth_baseline\…\train{,2,22}\best.pt` | 125MB×3 | 사료작물 생육기 | IRG·수단그라스·옥수수·호밀 | .985 |
| `E:\namwon\production_baseline\…\best.pt` | 125MB | 사료작물 생산기 | 〃 | .972 |
| `E:\Auto_Label_project\sam2_b.pt`, `yoloe-11s-seg.pt`, `yolov8s-worldv2.pt`, `mobileclip_blt.ts` | | 파운데이션/오픈보캐블러리 | — | — |
| `E:\yolo11{n,m-seg,x-seg}.pt` | | 사전학습 베이스 | COCO | — |

---

## 8. 웹 적용 권고(전처리 필요도)

| 자산 | 웹 포맷 | 전처리 | 도구(이 PC에서 가능) |
|---|---|---|---|
| 하천 벡터타일 `river_vt` | MVT(pbf) | 없음. 바로 서빙(또는 PMTiles 로 묶기) | 정적 서버 |
| 하천 폴리곤 `river_dedup` | GeoJSON | 필요 시 시군구 선택 로드 | — |
| 하천 건물 분석 GPKG | PMTiles/GeoJSON | 5186→4326 변환, 속성 축약, 시군구 통계 집계 | geopandas/pyogrio (tippecanoe 없음 → Python MVT 또는 GeoJSON 분할) |
| LX 본사 정사·DSM | XYZ PNG/WebP, terrain-rgb | 5186→3857 워프, 타일링 z15–22 | rasterio (+직접 타일러 스크립트) |
| LX 본사 3D 메시 | glTF/GLB | OBJ→GLB(텍스처 압축), 원점 5186 좌표 | trimesh 미설치 → Node `obj2gltf` 또는 설치 필요 |
| LX 본사 점군 | Potree/COPC | LAS 1.2 → 다운샘플 | laspy·PDAL 미설치 |
| AXIS 정사 2장 | XYZ 또는 COG | 오버뷰가 이미 있어 COG 변환 쉬움 | rasterio |
| AXIS 라벨 2,662 | GeoJSON | 픽셀→5186→4326 | rasterio transform |
| 차량 OBB 추론 | GeoJSON | 정사 위 추론 실행(GPU) | ultralytics + 노트북 파이프라인 |
| 밀양 140도엽 | XYZ | 오버뷰 없음, 457GB → 우선 소수 도엽만 | rasterio (시간 큼) |
| 모델 지표·곡선·예측 이미지 | PNG/CSV | 복사만 | — |
| jeonnam 데이터 | JSON | `window.X=` 래핑 제거 | — |

**권장 1차 묶음(가장 빨리 "실데이터 느낌"을 내는 조합)**: ① 전국 하천 MVT(바로 쓸 수 있음) + 하천 건물 점유 통계(시군구 단계구분도), ② LX 본사 정사 타일과 3D 메시(히어로·트윈), ③ AXIS 익산/경북 정사 + 라벨 오버레이 + 차량 OBB 실추론 GeoJSON, ④ 남원 5개 모델 카드(실제 mAP·혼동행렬·예측 이미지).

## 9. 확인하지 못한 것 / 결손
- `D:\python\Namwon\…\detections.geojson`(남원 비닐하우스 27,676개): 이 PC에 없다.
- drone_dataset·aerial_dataset 의 정확한 용량: du 시간 초과. AXIS 문서값(527GB·88GB)을 인용했다.
- `E:\best.pt` 의 검증 지표 원본 run 폴더(aerial_v2_finetune2)는 E:\ 에 없다.
- 밀양 정사 촬영일: 메타에 없다(폴더 수정일 2024-08-29).
- 조사 범위 밖이지만 발견한 것: `E:\육군본부\data\b1_merged`(9클래스 20k), `E:\AI학습데이터`, `E:\재난피해상황…`, AI Hub 124/125/126/304 토지피복, 294 아산 하천부지(649GB). 각각 별도 recon 키에서 다룰 것.
