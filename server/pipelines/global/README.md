# server/pipelines/global — F1-D 사전 수집(G1–G5)

정본 산출은 `LX_DATA_ROOT/global/`(기본 `E:/Land-XI 플랫폼/02. 데이터/global`), 화면용 사본은 `landxi/global/data/`.
원천 응답은 `LX_DATA_ROOT/global/raw/`에 캐시하고, `fetched_at`은 캐시 메타(`*.meta.json`)에서 읽는다.
`--refresh` 없이 다시 돌리면 산출 파일이 바이트 단위로 같다. 2026-09-26에 g1·g3를 두 번 연속 돌려 `cmp`로 같음을 확인했다.

| 스크립트 | 원천(CORS) | 산출 | 비고 |
|---|---|---|---|
| `g1_boundaries.py` | geoBoundaries KGZ ADM1/ADM2 simplified(LFS 실파일 · 9469f09) · Natural Earth 50m | `kgz-adm1.geojson`(7) · `kgz-adm2.geojson`(42 피처 · 41군 + 시) · `lx-countries.json`(36 + 사할린 점) | 비슈케크 시 = bbox + `boundary not acquired` |
| `g2_pc_cache.py` | PC `mosaic/register` · `item/statistics` · STAC(T43TEH만) | `pc-mosaics.json`(2025-03…10 searchid) · `ysykata-landcover.json`(비율 봉투) · `ysykata-ndvi-2025.json`(월별 n_scenes · G-J1 결과 캐시) | 비율만 유효 · 정밀 ha = `adapter_worldcover.py` |
| `g3_esri_lulc.py` | Esri/IO Sentinel-2 10m LULC `exportImage&time=`(CORS 없음 → 서버 수집) | `kgz-sprawl-2017-2025.json`(500 m 격자 built 2017/2025/델타) | 연도별 모델 차이가 델타에 섞여 있음(note) |
| `g4_ems_meiktila.py` | Copernicus EMS EMSR798 AOI11 GRA ZIP · Overture buildings PMTiles(Range) | `mm-meiktila-damage.geojson`(38점 · 15 m 최근접 조인 38/38) · `mm-meiktila-aoi.geojson` | Destroyed 4 · Damaged 23 · Possibly 11 |
| `g5_maxar_tiles.py` | Maxar Open Data visual COG(ARD 46 · 사분 4) | `tiles/maxar_meiktila_{pre,post}/{z}/{x}/{y}.webp` z12–17(각 1163타일) | CC BY-NC 4.0 · 시연 한정 · `build=export` 제외 |

## 실행

```
python -m server.pipelines.global.g1_boundaries
python -m server.pipelines.global.g2_pc_cache            # PC 키 없음(anonymous SAS)
python -m server.pipelines.global.g3_esri_lulc
python -m server.pipelines.global.g4_ems_meiktila
python -m server.pipelines.global.g5_maxar_tiles --workers 12
```

`global`은 파이썬 예약어라서 다른 모듈은 `importlib.import_module("server.adapters.global")`으로 불러야 한다.

## 어댑터(`server/adapters/global/`)

- `adapter_ndvi_pc.py`: `ADAPTER = {"id": "index/ndvi_pc", "kinds": ["index"], "device": "cpu", …}`. F1-B `workers/registry_scan.py`가 AST로 읽어 등록한다.
  - 단독 실행: `python -m server.adapters.global.adapter_ndvi_pc --month 2025-06 --aoi 74.70,42.75,75.20,43.00`
  - 전체 8개월 실행 후 캐시 갱신: `--all`
  - F1-B가 없을 때 쓰는 개발 하니스: `--serve 8711`. F1-B 게이트웨이(8700)가 뜬 뒤로는 쓰지 않는다.
  - PC 장애 시 `ysykata-ndvi-2025.json`의 캐시 값으로 폴백하고 `basis:'recorded'`를 붙인다.
- `adapter_worldcover.py`: `index/worldcover_hist`(클래스 히스토그램 · 원해상도 재집계 ha).
