# `tools/prepare-assets.py` — 실자산 파이프라인

원본(정사영상 수백 GB, 탐지 벡터 40MB급, 학습 모델 `.pt`)에서 프론트엔드가 바로 쓰는
작은 산출물만 만든다. **원본은 절대 수정하지 않는다.**

## 실행

```powershell
& "C:\Users\oem\anaconda3\envs\yolo\python.exe" tools/prepare-assets.py
```

| 옵션 | 뜻 |
| --- | --- |
| `--force` | 산출물이 있어도 다시 만든다(기본은 건너뜀 = 멱등) |
| `--only a,b` | `namwon,kuksan,jeju,vectors,models,brand` 중 일부만 |

GDAL 3.12 + Pillow 가 있는 conda 환경 `yolo` 에서만 돌아간다. `gdal_translate` / `ogr2ogr`
는 `envs\yolo\Library\bin`, `gdal2tiles.py` 는 `envs\yolo\Scripts` 에서 찾는다.

## 산출물

| 단계 | 산출물 |
| --- | --- |
| (a) 남원 4시점 | `landxi/assets/tiles/namwon_2504|2506|2508|2510/{z}/{x}/{y}.webp` (z12–19) |
| (b) 국산리 드론 | `landxi/assets/tiles/kuksan_a68|kuksan_a71/…` (z13–19) |
| (c) 제주 항공·세그먼트 | `landxi/assets/tiles/jeju_2022|jeju_landcover|jeju_2020/…` (z13–19) |
| (a~c) 카탈로그 | `landxi/assets/data/imagery.js` (`IMAGERY`) |
| (d) 벡터 | `landxi/assets/data/geo/marine-debris.geojson`, `marine-debris-grid.geojson`, `jeju-illegal.geojson` |
| (e) 모델 메타 | `landxi/assets/data/models.js` (`MODELS`) |
| (f) 브랜드·CI | `landxi/assets/brand/*.png`, `landxi/assets/css/tokens.css` 의 `--lx*` |

중간 GeoTIFF 는 `build/` 에 남으며 `.gitignore` 대상이다. 지우면 다음 실행 때 다시 만든다.

## 원본을 다루는 규칙

- 남원 원본은 1.5cm GSD 에 0.3~2.1TB(+`.ovr`)다. **절대 전체를 읽지 않는다.**
  `gdal_translate -projwin <EPSG:5186 창> -tr 0.15 0.15 -r average` 로 오버뷰를 타고
  AOI 만 잘라 70MB 남짓한 작업 파일을 만든 뒤 타일링한다. 한 시점당 3~5초.
- 국산리 드론(32790×28110, 5cm)은 오버뷰가 없어 `-tr 0.2` 로 4배 데시메이션한다.
- 제주 항공/세그멘테이션은 3903×4648 로 작아 원본을 그대로 타일링한다
  (세그멘테이션은 색을 섞으면 안 되므로 `-r near`).
- `gdal2tiles.py --xyz -w none -r bilinear --processes 4 -x` → PNG 를 Pillow 로
  webp(q80)로 바꾸고 PNG 는 지운다.

## 남원 AOI 를 옮긴 이유

계획서의 AOI 는 도통동·시청 일대(127.379–127.401 / 35.399–35.421)였지만, 4시점의
알파밴드를 20m 격자로 교차해 보니 **시청 일대는 2508·2510 에 촬영분이 아예 없다.**
네 시점 원본의 bbox 는 모두 그 창을 품지만, bbox 안이 다 촬영된 것은 아니다.

| 시점 | 계획서 AOI 알파 커버리지 | 현행 AOI 알파 커버리지 |
| --- | --- | --- |
| 2504 | 1.25% | 99.79% |
| 2506 | 85.30% | 100.00% |
| 2508 | 0.00% | 99.87% |
| 2510 | 0.00% | 100.00% |
| **4시점 공통** | **0.00%** | **99.68%** |

계획서 AOI 에서는 4시점 시계열 비교가 성립하지 않는다(공통 0%). 그래서 4시점이
99.68% 겹치는 **800m 창**(시청 북서 13km, 계단식 논·비닐하우스 지대)으로 옮겼다.

- AOI(WGS84): `127.3481, 35.5276, 127.3567, 35.5347` (≈780×790m)
- EPSG:5186 projwin: `231569.376 326475.956 232352.168 325685.416`

AOI 가 작아진 만큼 최대 줌을 z18 → z19 로 올리고 작업 해상도를 0.3m → 0.15m 로 높여
상세도를 되찾았다(총 용량은 그대로 예산 안).

다른 AOI 로 옮기려면 `NAMWON_AOI` 만 고치고 `--only namwon --force` 로 다시 돌린다.

## 벡터

- `marine-debris.geojson` — 전남 해양쓰레기 38,057건 중 신뢰도 상위 5,000건.
  `ogr2ogr -sql "… ORDER BY confidence DESC LIMIT 5000" -simplify 0.00002
  -lco COORDINATE_PRECISION=5`. OGR SQL 방언이 실패하면 `-dialect SQLite` 로 재시도한다.
- `marine-debris-grid.geojson` — 38,057건 **전체**를 0.0045°(≈500m) 격자로 집계
  (`count`, `conf_n`, `mean_conf`). `result_wgs84.geojson` 26,049건의 `giin`(기인) 분포를
  같은 셀에 `giin: {분류: 건수}` 로 얹는다. 원본을 통째로 파싱하지 않고 OGR 로 스트리밍한다.
  원본 38,057건 중 **13건은 `confidence` 가 비어 있다.** 0 으로 세면 평균이 내려가므로
  값이 있는 건(38,044)만 평균에 넣고 몇 건으로 낸 평균인지를 `conf_n` 에 적는다.
  `conf_n === 0` 인 셀(2개)의 `mean_conf` 는 `0` 이 아니라 `null` 이다.
- `jeju-illegal.geojson` — `detected_objects.shp`(EPSG:5179) → EPSG:4326.

## CI 블루 샘플링

Land-XI 워드마크는 `LAND`(짙은 파랑) → `XI`(시안) 그라디언트라서 전체 중앙값을 잡으면
시안(hue ≈ 199°)으로 끌려간다. 그래서 채도 높은 파랑(hue 195–250°) 중 **hue 상위 15%**
(= 그라디언트의 가장 파란 끝)의 중앙값을 주색으로 쓴다 → `#006DF7` (hue 213.5°).

`--lx-deep` 은 HSL 명도 −25%, `--lx-tint` 는 흰색 92% 혼합으로 파생한다.

## 중단된 실행에서 이어 돌리기

멱등성은 "산출물 파일이 있으면 건너뛴다" 만으로는 부족하다. 실행이 중간에 죽으면
**있지만 쓸 수 없는** 산출물이 남기 때문이다. 두 경우를 스스로 고친다.

- `build/*.tif` 가 헤더만 있고 전 화소가 비어 있는 경우 → `tif_ok()` 가 마지막 밴드를
  512px 로 훑어 최대값 0 이면 지우고 다시 자른다.
- 타일 폴더에 PNG 가 남아 있는 경우(webp 변환 중 중단) → 남은 PNG 만 이어서 변환한다.
  그중 잘린 PNG 가 하나라도 나오면 구멍 난 타일셋을 남기지 않으려고 그 데이터셋만
  통째로 다시 만든다.
- 요청한 줌(z12–19 등)이 하나라도 비어 있으면 `complete_zooms()` 가 미완성으로 보고
  다시 만든다.

## 용량 예산

`landxi/assets/tiles` 합계 200MB 이하. 스크립트가 끝날 때 데이터셋별 용량과 타일 수를
찍는다. 넘치면 해당 데이터셋의 최대 줌을 한 단계 내린다.

실측(9개 데이터셋, 3,249장): **21.3MB** — 예산의 11%.

| 데이터셋 | 용량 | 타일 |
| --- | --- | --- |
| namwon_2504 / 2506 / 2508 / 2510 | 2.1 / 1.9 / 1.9 / 1.8MB | 각 280장 |
| kuksan_a68 / a71 | 5.7 / 5.7MB | 각 877장 |
| jeju_2022 / jeju_landcover / jeju_2020 | 0.9 / 0.04 / 1.2MB | 129 / 129 / 117장 |
