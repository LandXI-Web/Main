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

남원 **전역**(시 단위) 바탕은 이 스크립트가 아니라 `tools/citywide/namwon_city.py` 가
만든다 — 아래 [도시 전역 타일](#도시-전역-타일--toolscitywidenamwon_citypy) 참고.

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

## 도시 전역 타일 — `tools/citywide/namwon_city.py`

800m AOI 는 4시점 시계열 비교용이라, 발주처 AI 결과(**농지이용 현황·비닐하우스, 남원시
전역**)를 얹을 바탕이 못 된다. 같은 원본에서 전역 바탕만 따로 만드는 스크립트다.

```powershell
& "C:\Users\oem\anaconda3\envs\yolo\python.exe" tools/citywide/namwon_city.py
& "…\python.exe" tools/citywide/namwon_city.py --only 2510 --force --skip-core 2504
```

`prepare-assets.py` 를 `importlib` 로 읽어 `run/tif_ok/png_to_webp/wgs84_bounds/write_module`
을 그대로 쓴다(파일명에 `-` 가 있어 일반 import 가 안 된다). 멱등·`--force` 규칙도 같다.
webp 만 q80 → **q75** 로 낮췄다(장수가 4배다).

### 2단 해상도

원본 전체를 z17 까지 타일링하면 예산을 몇 배로 넘긴다. 해상도를 두 단으로 나눈다.

| 패스 | `-tr` | 줌 | 근거 |
| --- | --- | --- | --- |
| 전역 | 2.0m | z11–15 | z15 는 위도 35.4°에서 3.89m/px — 2m 작업본이 한 단계 여유 |
| 코어 | 0.6m | z16–17 | z17 은 0.97m/px — 0.6m 작업본이 한 단계 여유 |

두 패스가 **같은 타일 폴더를 줌 단위로 나눠 쓴다.** `prepare-assets.make_tiles` 는 폴더를
통째로 지우므로 쓸 수 없어서, 스테이징(`build/citywide_tiles/`)에 만든 뒤 `{z}` 폴더만
옮기는 `tiles_pass()` 를 따로 뒀다.

원본은 `.ovr` 오버뷰를 타므로 1.8TB 를 훑지 않는다 — 전역 컷 43–53초, 코어 컷 12–14초.
중간 GeoTIFF 는 88–257MB(≤4GB)로 `build/` 에 남는다.

### 코어 창을 남서부 평야로 잡은 이유

계획은 "시가지 + 농경지" 였지만 **시청 일대는 애초에 촬영분이 거의 없다**(800m AOI 를
옮긴 것과 같은 사정). 시청 중심 6km 창의 알파 커버리지는 2510 30.2% / 2504 15.3% 다.
그래서 50m 격자 알파 적분영상으로 6km 창을 전수 탐색해 **금지·송동 평야**를 골랐다.

- EPSG:5186 projwin `226608 308438 232608 302438` (정확히 6×6km)
- WGS84 `127.2926, 35.3180, 127.3588, 35.3723`
- 논·비닐하우스 지대라 발주처 AI 결과와 정확히 겹친다(z16 퀵룩에 비닐하우스 군집이 보인다).
- 실제 알파(부분 화소까지 센 값)로 재검증: 현행 창의 두 시점 합이 138.5%, 전수 탐색
  최적값이 140.1% — 1.6%p 차이라 다시 굽지 않았다.

### 실측

| 시점 | bbox | 실촬영(전역) | 코어 실촬영 | 타일 | 용량 |
| --- | --- | --- | --- | --- | --- |
| `namwon_city_2510` | 1,176km² | 307km² (26.1%) | 96.6% | 1,756장 | 16.4MB |
| `namwon_city_2504` | 1,110km² | 89km² (8.0%) | 41.9% | 1,598장 | 12.3MB |
| **합계** | | | | **3,354장** | **28.7MB** (예산 60MB) |

줌별(2510): z11 9 · z12 23 · z13 62 · z14 196 · z15 672 · z16 169 · z17 625장.

**bbox 가 다 촬영된 것이 아니다.** 2510 은 남원시(약 752km²)의 41%에 해당하는 307km² 를
띠 모양으로 덮고, 2504 는 그중에서도 농경지 위주 89km² 뿐이다. 전역 퀵룩
`shots/citywide/namwon_city_*_z13.png` 이 그 실제 모양이다(체커 배경 = 미촬영).

퀵룩은 마젠타/청록 체커 위에 알파 합성한다 — 검거나 흰 구멍(잘못 채워진 화소)과 정상적인
투명(미촬영)이 눈으로 갈린다. z13 전역 1장, z16 코어 1장씩 낸다.

### `IMAGERY` 항목

```js
{ id: 'namwon_city_2510', kind: 'ortho', coverage: 'city',
  gsd: 2.0, sourceGsd: 0.0168, minzoom: 11, maxzoom: 17,
  bounds: [127.182606, 35.302858, 127.637309, 35.561786],
  core: { bounds: […], gsd: 0.6, minzoom: 16, maxzoom: 17 } }
```

`coverage: 'city'` 로 800m AOI 시점(`namwon_25xx`)과 구분한다. **z16 부터는 `core.bounds`
안에만 타일이 있다** — 바깥에서 z16 이상으로 들어가면 z15 부모 타일이 확대되어 보인다.
전역까지 z16 을 굽는 데는 타일이 4배(≈35MB/시점) 더 든다.

> ⚠ `prepare-assets.py` 를 `--only` 없이 돌리면 `imagery.js` 를 통째로 다시 쓰면서
> `coverage:'city'` 항목이 사라진다. 그때는 `namwon_city.py` 를 다시 돌리면 된다
> (전부 건너뛰고 카탈로그만 9초에 복구한다). `tests/unit/data.test.mjs` 의
> `city-wide namwon imagery…` 가 이 사고를 잡아 준다.

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

### 대비(WCAG 2.1)

92% 틴트 공식은 그대로 두되, **틴트 배경 위 텍스트는 `--lx` 가 아니라 `--lx-deep`** 을 쓴다.

| 조합 | 대비 | AA(4.5:1) |
| --- | --- | --- |
| `--lx` `#006DF7` on `--lx-tint` `#EBF3FE` | 4.15:1 | ✗ |
| `--lx-deep` `#0052B9` on `--lx-tint` `#EBF3FE` | **6.46:1** | ✓ |
| `--lx` `#006DF7` on 흰색 | 4.64:1 | ✓ (레일 등 흰 바탕은 `--lx` 유지) |
| `--lx-deep` `#0052B9` on 흰색 | 7.22:1 | ✓ (AAA) |

적용: `shell.css` 의 `.ctx__tag`, `.secondary__item[aria-current=page]`.

### 색의 단일 출처

CI 색을 바꿀 때 JS 하드코딩이 따라오지 않는 사고를 막으려고, 지도·상태색은 리터럴 대신
`landxi/assets/js/tokens.js` 의 `cssVar(name, fallback)` 로 tokens.css 에서 읽는다.
`--s-info` 는 `var(--lx)` 로 주색에 묶여 있다. 리터럴은 DOM 이 없는 환경(node:test)의
폴백일 뿐이며, `tests/unit/status.test.mjs` 가 리터럴과 tokens.css 값의 일치를 검사한다.

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
도시 전역 타일(`namwon_city_2510|2504`, 3,354장) **28.7MB** 를 더해도 `landxi/assets/tiles`
합계는 약 50MB — 예산의 25%.

| 데이터셋 | 용량 | 타일 |
| --- | --- | --- |
| namwon_2504 / 2506 / 2508 / 2510 | 2.1 / 1.9 / 1.9 / 1.8MB | 각 280장 |
| kuksan_a68 / a71 | 5.7 / 5.7MB | 각 877장 |
| jeju_2022 / jeju_landcover / jeju_2020 | 0.9 / 0.04 / 1.2MB | 129 / 129 / 117장 |
