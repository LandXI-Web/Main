# recon-0924 / env — 연산·도구 환경 조사 (집 PC, 2026-09-24)

읽기 전용 조사다. 기존 파일은 옮기거나 수정하지 않았다. 동작 확인은 스크래치패드에서 합성 데이터로만 했다.

## 결론

**이 PC에서 웹 타일 파이프라인을 전부 돌릴 수 있다.** 메모리의 "집 PC에는 GDAL이 없다"는 기록은 **틀렸다.** conda env `gcs`에 **GDAL 3.12.4**(COG·WEBP·MBTiles 쓰기, 벡터 PMTiles·MVT·FlatGeobuf 쓰기 지원), rasterio 1.4.4, rio-cogeo 7.0.2, morecantile, geopandas, CUDA torch가 모두 설치돼 있다.

- 래스터: GeoTIFF(EPSG:5186) → COG(WEBP, GoogleMapsCompatible) / gdal2tiles XYZ(WEBP) / `gdal raster tile`. 세 경로 모두 실행 확인.
- 벡터: GeoJSON/SHP → `ogr2ogr -f PMTiles` / FlatGeobuf. 둘 다 실행 확인.
- 래스터 PMTiles: 아직 없다. GDAL은 래스터 PMTiles를 쓰지 못한다. `gdal raster tile`이나 `gdal_translate`로 **MBTiles**를 만든 뒤 `pmtiles convert`(go-pmtiles 단일 바이너리) 또는 `pip install pmtiles`로 변환해야 한다. 아니면 XYZ 폴더를 정적 서빙한다.
- tippecanoe: 없다. 대용량 점·폴리곤(해양쓰레기 3.8만 건, 필지 등)에서 품질이 더 필요하면 WSL Ubuntu 26.04에 `apt install tippecanoe`하면 된다. 그 전에는 GDAL PMTiles 드라이버로 충분하다.
- AI 추론: GPU 2장(RTX A6000 48GB)과 ultralytics가 있어 정사영상 위 YOLO11-seg 추론 결과를 벡터로 뽑아 PMTiles로 올리는 파이프라인을 바로 구성할 수 있다.

## 하드웨어

| 항목 | 값 |
|---|---|
| CPU | AMD Threadripper PRO 3995WX, 64코어/128스레드 |
| RAM | 512 GB (WSL에 251 GB 할당) |
| GPU | **NVIDIA RTX A6000 48GB ×2** (드라이버 522.06, 조사 시점에 장당 약 23GB 사용 중), AMD RX 5700 XT, ASPEED |
| CUDA Toolkit | v11.8(PATH 우선), v11.3. `nvcc` 있음 |
| nvidia-smi | PATH에 없다. 실행 경로: `C:\Windows\System32\DriverStore\FileRepository\nv_dispui.inf_amd64_f2b06cc19dadc00f\nvidia-smi.exe` |
| 디스크 여유 | C: 124 GB / D: 363 GB(사용 7.1 TB) / **E: 2,085 GB**(사용 5.4 TB) |

E:에 약 2 TB 여유가 있어 타일 산출물을 둘 수 있다. C:는 124 GB만 남았으니 GDAL 캐시와 임시 파일은 E:로 지정해야 한다(`CPL_TMPDIR`).

## Python 환경

| env | Python | GDAL(osgeo) | rasterio | ultralytics | torch (CUDA) | 기타 |
|---|---|---|---|---|---|---|
| **gcs** ★ | 3.11.15 | **3.12.4** | 1.4.4 | – | 2.5.1+cu118 (O, 2 GPU) | geopandas 1.1.3, rio-cogeo 7.0.2, morecantile 7.0.3, segment_anything |
| **yolo** ★ | 3.9.21 | – | 1.4.3 | **8.3.131** | 2.7.0+cu118 (O) | geopandas 1.0.1 |
| 시스템 Py3.11 (`AppData\Local\Programs\Python\Python311`, PATH 1순위) | 3.11.4 | – | 1.4.4 | **8.3.234** | 2.5.1+cu118 (O) | geopandas 1.1.4, segment_anything |
| lx | 3.9.16 | 바인딩 없음(exe만) | 1.3.2 | –(`yolo.exe` 있음) | 1.12.1+cu113 (O) | open3d 0.17 |
| geo | 3.8.18 | 3.8.4 | 1.3.8 | – | 2.2.1 CPU | |
| river | 3.9.18 | 3.7.2 | – | – | – | |
| base (anaconda3) | 3.9.12 | – | – | – | 2.0.1 CPU | |
| lx_wav | 3.7.16 | – | – | – | – | 비어 있음 |
| pycaret | 폴더만 있고 python.exe 없음(깨진 env) | | | | | |

어느 env에도 mercantile·pmtiles·laspy가 없다.

**권장 조합**
- 타일링과 좌표 변환: `C:\Users\User\anaconda3\envs\gcs`
- YOLO 추론: `envs\yolo` 또는 시스템 Py3.11(ultralytics가 더 최신)
- 추론 결과 벡터화(rasterio·geopandas): 위 두 환경 모두 가능

## GIS CLI

| 도구 | 경로 / 상태 |
|---|---|
| gdalinfo / gdal_translate / gdalwarp / gdaladdo / gdalbuildvrt / ogr2ogr / **gdal(3.12 통합 CLI)** / gdal2tiles.exe·py | `C:\Users\User\anaconda3\envs\gcs\Library\bin\` (Scripts에 `rio.exe` 포함) |
| 구버전 GDAL exe | `envs\lx\Library\bin`, `envs\geo\Library\bin`, `envs\river\Library\bin` |
| PATH의 `gdal2tiles.py` | `envs\lx\Scripts\gdal2tiles.py`. 대응하는 GDAL 바인딩이 없어 **실제로는 쓸 수 없다**. gcs 것을 써야 한다 |
| QGIS | `C:\Program Files\QGIS 3.28.3` |
| tippecanoe | 없음(Windows·WSL 모두) |
| pmtiles CLI | 없음. npm 전역 패키지도 비어 있음 |
| OSGeo4W | 없음 |

gcs GDAL 드라이버 확인 결과: `COG (wv)`, `WEBP`, `JPEG`, `MBTiles (raster,vector rw)`, `PMTiles -vector- (rw+v)`, `MVT`, `FlatGeobuf`, `GeoJSONSeq`, `GPKG`.

gcs env를 쓸 때 설정할 환경변수는 다음과 같다.
```
PATH=C:\Users\User\anaconda3\envs\gcs\Library\bin;%PATH%
GDAL_DATA=C:\Users\User\anaconda3\envs\gcs\Library\share\gdal
PROJ_DATA=C:\Users\User\anaconda3\envs\gcs\Library\share\proj   (PROJ_LIB도 같은 값)
```

## 기타 런타임

| 도구 | 버전 / 상태 |
|---|---|
| Node | v22.21.1 (npm 전역 패키지 없음) |
| ffmpeg | 8.1.2 full_build (WinGet) |
| Docker | 29.6.2. 데몬이 실행 중이다. **cleanriver 스택(nginx 80/443, flask, redis)이 가동 중이므로 80·443 포트는 이미 쓰이고 있다**. 이미지: nginx:alpine, python:3.12-slim, redis:7-alpine, certbot, trivy |
| WSL2 | `Ubuntu 26.04 LTS`(Running, 128 vCPU, 251 GB), docker-desktop |
| Java | jdk-20. Planetiler(Java 21 이상 필요)를 쓰려면 JDK 업그레이드가 필요하다 |
| Go / Rust | 없음 |
| 네트워크 | cloudflared, Tailscale, ngrok가 PATH에 있어 외부 공개 터널을 바로 쓸 수 있다 |

## 스모크 테스트 (스크래치패드, 합성 2048² 이미지, EPSG:5186)

1. `gdal_translate -of COG -co COMPRESS=WEBP -co TILING_SCHEME=GoogleMapsCompatible`: 성공
2. `gdal2tiles.py --xyz -z 14-18 --processes=8 --tiledriver=WEBP`: 성공(42개 타일, 2.2초)
3. `gdal raster tile --help`: 사용 가능(GDAL 3.12의 새 타일러)
4. `ogr2ogr -f PMTiles v.pmtiles p.geojson -dsco MINZOOM=5 -dsco MAXZOOM=14`: 성공. `ogrinfo`로 다시 읽기도 확인
5. `ogr2ogr -f FlatGeobuf`: 성공

실데이터 헤더 확인: `D:\2023_정사영상_비도시_25\*` 도엽 tif를 gcs의 gdalinfo로 정상적으로 읽었다(9.6k×11.5k px, 0.25 m, 도엽당 약 333 MB). **grep 결과에 EPSG가 나오지 않았다.** 좌표계가 tif에 들어 있지 않거나 tfw/prj로 따로 있을 수 있다. 타일화 전에 `-a_srs EPSG:5186`(중부원점) 또는 도엽별 원점을 확인해야 한다(`전북비도시\중부원점\` 폴더명 참고).

## 권장 파이프라인

```
[래스터 정사영상 EPSG:5186 GeoTIFF / 도엽 다수]
  gdalbuildvrt mosaic.vrt *.tif   (필요하면 -a_srs EPSG:5186)
  → gdal raster tile  또는  gdal2tiles --xyz --tiledriver=WEBP -z 10-20 --processes=48
      (남원 1.5cm 원본은 z21~22까지 가능하다. 웹에서는 AOI만 z20으로 자른다)
  → 정적 XYZ 폴더  또는  MBTiles → pmtiles convert → 단일 .pmtiles
  → MapLibre raster source (pmtiles:// protocol)

[AI 결과 벡터 (YOLO seg → polygon, SHP/GeoJSON)]
  ogr2ogr -t_srs EPSG:4326 -f PMTiles out.pmtiles in.shp -dsco MINZOOM=8 -dsco MAXZOOM=16
  (대용량이면 WSL에 tippecanoe 설치 후 -zg --drop-densest-as-needed)
  → MapLibre vector source, 클래스별 fill/line 스타일

[COG 직접 서빙]
  gdal_translate -of COG -co TILING_SCHEME=GoogleMapsCompatible -co COMPRESS=WEBP
  → 뷰어에서 geotiff.js / maplibre-cog-protocol로 Range 요청
```

부족한 도구와 설치 방법(설치는 이번 조사 범위 밖이다)
- `pmtiles`(go-pmtiles) 단일 exe: 래스터 MBTiles를 PMTiles로 변환하고, 검증(`pmtiles show`)과 로컬 서빙(`pmtiles serve`)에 쓴다
- WSL `tippecanoe`: 대용량 벡터 품질을 높일 때 쓴다
- Java 21: Planetiler를 쓸 때만 필요하다

## 이 PC에서 확인한 웹 활용 가치 상위 자산 (환경 조사 중 확인분 + 메모리)

자산 전체 목록은 다른 recon 키의 보고서에서 다룬다. 여기서는 파이프라인과 연결되는 것만 적는다.

| # | 자산 | 경로 | 요점 | 웹 활용 / Land-XI 화면 | 우선 |
|---|---|---|---|---|---|
| 1 | 2023 비도시 정사영상 25cm | `D:\2023_정사영상_비도시_25\{전남,전북,충청}비도시` | tif 5,381장(전남 2,117 / 전북 1,609 / 충청 1,655), 도엽당 약 333 MB, 0.25 m | VRT → XYZ/PMTiles 배경 영상. 모니터링 지도 기본 레이어 | 최상 |
| 2 | 남원 비닐하우스 seg 데이터+모델 | `E:\namwon\Vinyl_house` | 이미지 1,956, YOLO-seg 2클래스(단동/다동), `runs\segment\train\weights\best.pt` | 시설물 탐지 레이어와 AI 추론 데모 | 최상 |
| 3 | 남원 경작/비경작 seg | `E:\namwon\cultivate_uncultivate` | 이미지 1,825, 2클래스, best.pt, `위성` 폴더 | 휴경지 모니터링 화면 | 상 |
| 4 | 남원 생육기(사료작물) seg | `E:\namwon\growth_baseline` | 이미지 8,801, 3클래스(IRG/수단그라스/옥수수), best.pt | 작물 분류 주제도와 시계열 | 상 |
| 5 | 남원 곤포사일리지 seg | `E:\namwon\Silage` | 이미지 2,013, 1클래스, best.pt | 객체 카운트 KPI | 상 |
| 6 | AI Hub 토지피복 124/125/126/304 | `E:\124.~`, `125.~`, `126.~`, `304.~` | 항공·위성 토지피복 라벨 | 토지피복 분류 화면과 학습 데이터 카탈로그 | 상 |
| 7 | 드론 차량 탐지 모델(OBB 포함) | `E:\drone_runs\car_v1`, `car_v2_obb`, `drone_v2` | best.pt 다수 | 드론 영상 객체 탐지 데모 | 중상 |
| 8 | 아산 하천부지 점유현황 | `E:\294.아산시 하천부지 점유현황 데이터` | 하천 점용 라벨 데이터 | 하천 점용 단속 화면(cleanriver와 연계) | 중상 |
| 9 | 재난피해 다중객체 학습셋 | `E:\재난피해상황 다중객체 학습데이터셋` | 재난 객체 라벨 | 재난 대응 시나리오 화면 | 중 |
| 10 | 범용 YOLO11 가중치 | `E:\yolo11x-seg.pt`, `yolo11m-seg.pt`, `E:\best.pt`, `E:\runs\segment\train*` | 사전학습·파인튜닝 가중치 | 추론 API 백엔드 | 중 |

메모리에 기록된 남원 1.5cm 4시점 초대용량 정사영상(`E:\namwon_final`, `F:\namwon_final`)과 F:\ 드론 정사영상은 이 PC에서 **확인되지 않았다**. `E:\namwon`에는 학습 데이터만 있다.
