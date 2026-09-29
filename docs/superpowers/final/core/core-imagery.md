# core-imagery — 전국 시군구 영상 공급(모든 코어의 추론 입력)

**먼저:** `_common.md` 전체를 읽는다. 이 작업은 코어 ①②④의 바닥이다 — **가장 먼저 1단계(전남·전북·충청 25cm 시군구 등록)를 끝내 다른 작업이 여수 영상을 쓸 수 있게 한다.**

## 왜
지금 추론 가능한 영상은 남원(25cm VRT)·제주·국산리·익산뿐이다(`imagery` 표). 그래서 XI맵에서 여수를 골라도 분석할 영상이 없다. 원천은 이미 로컬에 있다: 2023 25cm 비도시 정사 전남 2,117장·전북 1,609장·충청 1,655장(`D:/2023_정사영상_비도시_25/…`, TFW · CRS 태그 없음 → EPSG:5186).

## 소유 파일
- `server/landxi_api/catalog.py` · `server/landxi_api/tiles.py` · `server/landxi_api/proxy.py`
- `server/seed/backfill_imagery_sgg.py` · **신설** `server/pipelines/p16_imagery_nation.py`(도엽 색인 → 시군구별 VRT·등록)
- **신설** `server/workers/imagery_src.py`(워커가 영상 경로를 여는 도우미 — gpu_worker 는 import 만)
- `server/workers/cpu_worker.py`(영상 등록 `tile` 작업 부분) · `server/config/ladder.yaml`
- `landxi/v3/lx-ingest/**`(영상 등록 화면 · 결합률 표시는 core-survey 응답을 읽기만)
- **신설** `server/tests/test_imagery_nation.py` · 마이그레이션 `0006_*`(필요할 때만)

## 할 일
1. **도엽 색인(전남·전북·충청 전부):** TFW 로 도엽 외곽(5186 → 4326)을 뽑아 `02. 데이터/_work/c01_index.gpkg`(시도·파일·외곽) 한 파일로. 기존 `c01_jeonbuk_index.gpkg`·`c01_namwon_sheets.gpkg` 는 지우지 않는다.
2. **시군구별 등록:** 시군구 경계(서버 `regions_base()` 의 시군구 도형 — V-World `LT_C_ADSIGG_INFO` 캐시 우선)와 겹치는 도엽으로 `02. 데이터/_work/ap25_2023_{sgg}.vrt`(`-a_srs EPSG:5186`)를 만들고 `imagery` 행으로 등록: `id` = 기존 규칙(`img-{sgg}-2023-aerial` 류), `sgg_cd`, `footprint`(도엽 합집합 ∩ 시군구), `gsd_m 0.25`, `tier raw`, `layer.cog_path`= VRT, `tile_ready` = COG 동적 타일로 바로 보이면 true. 이름은 기존 규칙 `{시군구 이름} 2023 25cm 항공`. **전남·전북·충청 전 시군구**를 한 번에(남원 기존 행 `ap25-namwon-2023` 은 그대로 두고 중복 등록하지 않는다 — 같은 시군구에 이미 25cm 행이 있으면 건너뜀).
   - 여수처럼 옛/새 시군구 코드가 둘인 곳: `sgg_cd` 는 `regions_base()` 가 주는 코드로, 다른 코드로도 찾히게(계약 참고).
   - '비도시' 영상이라 도심 도엽이 빠질 수 있다 → `footprint` 가 실제 덮는 곳만. 비는 곳은 계약의 `coverage` 로 정직하게.
3. **V-World 위성영상 경로(로컬 영상 없는 시도):** V-World 오픈API 이용약관·WMTS 이용 조건(ASSET-LEDGER E01, 공식 약관 페이지)을 확인해 **AI 분석 입력으로 쓸 수 있는지** 판정하고 근거(조항·URL)를 보고서에 남긴다.
   - 허용되면: 게이트웨이 프록시 WMTS(Satellite, z18–19)를 GDAL 이 읽는 XML(VRT/WMS 드라이버)로 감싼 **가상 영상** `img-{sgg}-vworld-sat` 을 시군구 요청 시 만들어 등록(tier `external`, 출처 표기 `V-World`, 서버 디스크 캐시 재사용, 원본 재배포 0). 분석 결과는 `참고`로 표시(기존 규칙: AI 결과 = 참고자료).
   - 허용되지 않거나 불명확하면: 추론 입력으로 쓰지 않는다. 그 지역은 `영상 등록 필요` + 다음 행동(`영상 등록` → lx-ingest)으로 정직하게.
4. **추론 입력 선택 함수(계약):** 시군구·범위 → 가장 좋은 영상 하나(해상도·연도·덮는 비율 순) 또는 없음+사유.
5. **lx-ingest:** 지역을 고르면 그 시군구의 영상 목록·덮는 비율이 보이고, 영상이 없는 시군구는 `영상 등록` 시트(기존)로 서버 경로/파일 등록 → 타일 작업 → `있음`으로 바뀐다. 기존 디자인 그대로, 새 말 금지.
6. 남원 전용 코드 제거(소유 범위): `catalog.py`·`tiles.py`·`proxy.py`·`backfill_imagery_sgg.py` 의 지역 문자열.

## 계약(다른 작업이 쓴다 — 바꾸면 요청으로 알릴 것)
- `catalog.best_imagery(sgg_cd: str | None, geom_4326: dict | None) -> {"imagery_id", "gsd_m", "year", "coverage": 0..1, "source": "local"|"vworld"} | {"imagery_id": None, "reason": "no_imagery"|"partial"|"terms"}` — core-xi(jobs.py 견적)·core-flow(배포 적용)가 import.
- `GET /api/v1/catalog/layers?region={sgg}` 가 그 시군구 영상을 돌려준다(기존 형식 · `sgg_cd` · `tile_ready` · `bounds`). 옛/새 시군구 코드 모두로 찾힌다.
- 워커 쪽: `imagery_src.open_imagery(imagery_id)` → rasterio 데이터셋(VRT·가상 영상 공통). core-xi 의 gpu_worker 가 이것만 부른다.
- `GET /regions` 의 `has_imagery`(core-xi 소유 regions.py)는 `imagery.footprint` 로 계산되므로 등록만 하면 켜진다.

## 완료 조건
- `imagery` 에 전남·전북·충청 시군구 25cm 행이 등록되고, `GET /regions` 에서 그 시군구들의 `has_imagery=true`(수를 보고서에). **여수(전남)·남원(전북)·충청 1곳** 모두 `best_imagery` 가 영상을 돌려준다.
- **로그인 폼(lx-staff)** → lx-ingest → 여수 선택 → 영상 `있음`(2023 25cm) · XI맵에서 여수 확대 시 그 영상 타일이 보인다(1440·390 스크린샷). 남원도 같은 화면에서 같은 동작.
- 로컬 영상 없는 시군구(경기 또는 경상 1곳): V-World 판정 결과대로 **(a)** 가상 영상으로 `best_imagery` 성공 + 작은 범위 추론 1회 통과, 또는 **(b)** lx-ingest·XI맵에서 `영상 등록 필요` + `영상 등록` 행동이 보인다. 판정 근거를 보고서에.
- `gpu_worker` 가 `imagery_src.open_imagery` 로 여수 VRT 에서 칩을 읽는 시험 통과(`test_imagery_nation.py`, GPU 불필요 — 읽기만).
- forbidden(lx-staff · lx-ingest · 두 지역) 지어낸 용어 0 · 콘솔 오류 0 · `python -m pytest server/tests` 통과.
