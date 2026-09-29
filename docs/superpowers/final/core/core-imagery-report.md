브리핑 확인: (1) 지역 하드코딩 금지 — 남원은 예시, 여수는 남원과 같은 코드 경로 (2) 영상이 없으면 지어내지 않고 '영상 등록 필요' + '영상 등록' 행동 (3) 화면에 개발 정보(파일 경로·좌표·ms·API 이름) 노출 금지, 실측은 보고서에만

# core-imagery 보고서: 전국 시군구 영상 공급 (2026-09-29)

## 요약
- 2023년 25cm 비도시 정사영상 5,381장(전남·전북·충청 폴더)을 도엽 색인 한 파일로 모았습니다. 이 색인을 시군구 경계와 겹쳐 **66개 시군구**에 영상을 등록했습니다(VRT + `imagery` 행). 남원은 이미 있는 행을 그대로 두고 건너뛰었습니다.
- `GET /regions?has_imagery=1` 결과는 **69곳**입니다(이번 66곳 + 기존 남원·제주·익산). 여수(전남, 새 코드 12130 · 옛 코드 46130), 남원(전북), 청양(충남) 세 곳 모두 `best_imagery` 가 2023 25cm 영상을 돌려줍니다.
- 로그인 폼(lx-staff)으로 들어가 lx-ingest에서 여수를 고르면 영상이 **'2023 25cm 항공 · 지역의 33%'** 로 보입니다. XI맵에서 여수를 확대하면 그 영상 타일이 나옵니다. 남원·청양도 같은 코드 경로로 같은 동작을 합니다(1440·390 스크린샷).
- V-World 위성영상을 AI 분석 입력으로 쓰는 것은 **불명확하다고 판정해 쓰지 않았습니다**. 그래서 로컬 영상이 없는 가평(경기)은 lx-ingest에 `영상 등록 필요` 와 `영상 등록` 버튼이 보이고, `best_imagery` 는 `no_imagery` + `next: "영상 등록"` 을 돌려줍니다.

## 완료 조건 대조
| 조건 | 결과 | 증거 |
|---|---|---|
| 전남·전북·충청 시군구 25cm 행 등록, `/regions` has_imagery=true, 여수·남원·충청 1곳의 best_imagery | 통과: 66행 등록, has_imagery 69곳(전남 20 · 충남 16 · 전북 13 · 충북 9 · 경남 4 · 경기 3 · 경북 2 · 제주 1 · 강원 1). 이웃 시도 가장자리 도엽이 5% 이상 덮는 곳도 포함했습니다. | `shots/core/core-imagery/imagery-rows.jsonl`, `test_best_imagery_three_regions[12130/46130/52190/44790]` |
| 로그인 폼 → lx-ingest → 여수 '있음(2023 25cm)', XI맵 여수 확대 시 타일 표시, 남원 동일 (1440·390) | 통과 | `yeosu-ingest-{1440,390}.png` · `yeosu-xi-zoom-{1440,390}.png` · `namwon-*` · `cheongyang-*` · 로그 `shots-*.json`(xi_rendered 에 `img-img-12130-2023-aerial` 표시) |
| 로컬 영상 없는 경기·경상 1곳: V-World 판정대로 (a) 또는 (b) | (b) 통과: 가평 41820에 `영상 등록 필요` + `영상 등록` 표시 | `gapyeong-ingest-{1440,390}.png`, `test_no_local_imagery_honest` |
| test_imagery_nation.py: open_imagery로 여수 VRT 칩 읽기, `pytest server/tests` | imagery 시험 14/14 통과. 전체 suite 는 179~180 통과, 3~5개는 연결 끊김으로 실패(아래 설명) | `server/tests/test_imagery_nation.py` |
| forbidden(lx-staff · lx-ingest · 두 지역 이상) 지어낸 용어 0, 콘솔 오류 0 | 통과: 4개 URL(여수·남원·가평 lx-ingest, 여수 XI맵) 모두 forbidden 0 · console_errors [] · 390 여수 0. 두 번째 촬영 이후 콘솔 오류 0 | `forbidden-1440.json`, `shots-*.json` |

**pytest 전체 결과:** 이번 차수에는 다른 코어 작업들이 같은 게이트웨이(:8700)를 수시로 `-Restart gateway` 했습니다. 그래서 전체 suite를 돌릴 때마다 다른 시험이 `ConnectError`/`ReadError 10054`(연결 거부·끊김)로 실패했습니다(3회 실행: 3 · 5 · 5+8 error, 실패 목록이 매번 다름). assert 실패는 한 건도 없었습니다. `test_imagery_nation.py` 는 게이트웨이가 떠 있을 때 14/14 통과합니다.

## 바꾼 파일
- **신설** `server/pipelines/p16_imagery_nation.py`: 하위 명령은 `index` · `register [--sgg …] [--dry]` · `pmtiles <sgg|id>` · `status`.
  - 도엽 색인: TFW + 헤더를 12개 프로세스로 읽어 `_work/c01_index.gpkg` 에 기록(5,381장 · 25 s).
  - 시군구별 VRT: `_work/ap25_2023_{sgg}.vrt`, SRS `EPSG:5186`. 밴드는 RGB + **알파**이고, 알파는 ComplexSource ScaleRatio 0 · Offset 255로 도엽이 있는 곳만 불투명하게 만듭니다.
  - 등록: id `img-{sgg}-2023-aerial`, tier raw, export never. footprint = 도엽 합집합 ∩ 시군구, `layer.coverage` 에 덮는 비율을 둡니다.
  - 같은 급(±20% 해상도) 영상이 이미 절반 이상 덮는 시군구는 건너뜁니다. 그래서 남원은 중복 등록하지 않습니다.
  - PMTiles 굽기: 가장 큰 줌(z18)만 원본 창에서 렌더하고, z17~z11은 자식 타일 4장을 줄여 만듭니다.
- **신설** `server/workers/imagery_src.py`: `open_imagery(id)`(스레드별 핸들 캐시) · `imagery_path` · `best_imagery_sync` · `choose` · `target_geom`(옛/새 코드) · `ImageryUnavailable`.
- **신설** `server/tests/test_imagery_nation.py`: 14개 시험.
- `server/landxi_api/catalog.py`
  - `best_imagery()`(async · 계약) 추가.
  - `GET /catalog/best_imagery?region=|bbox=`(LX) 추가.
  - `/catalog/layers?region=` 는 그 시군구 영상만 돌려줍니다. 옛/새 코드 모두 받고, 응답에 `region` 을 붙입니다.
  - 항목에 `coverage` 를 봉투로 넣었습니다.
  - 사다리 설정에 없는 등록 영상은 `ladder.domestic` 뒤에 order 순으로 붙습니다.
  - `imagery/img-*` 세트는 `tiles/imagery/` 에서 찾습니다.
- `server/landxi_api/tiles.py`: `imagery/img-*` 세트를 LX 전용 서명 세트로 취급합니다.
- `server/config/ladder.yaml`
  - `local_sources`: 원천 폴더 · CRS · 해상도 · 연도 · 라이선스 · 최소 덮는 비율 · 사다리 · PMTiles 줌.
  - `vworld_analysis: {allowed: false, reason: terms}`.
- `server/workers/cpu_worker.py`: 영상 id로 `region="namwon"` 을 추정하던 줄을 없앴습니다. 남원 읍면동 붙이기는 postprocess 가 좌표로 판단하므로 동작은 같습니다.
- `server/seed/backfill_imagery_sgg.py`: 주석의 남원 예시를 일반 표기로 바꿨습니다.
- `landxi/v3/lx-ingest/app.js` · `data.js`
  - 원본 동적 타일(`source: cog`)은 `/tiles/sign` 서명 주소로 바꿔 지도에 쌓습니다. 이전에는 잘못된 pmtiles 주소가 만들어졌습니다.
  - 영상 줄에 **'지역의 N%'** 를 표시합니다(95% 미만일 때만).
- `proxy.py`: 변경 없음(지역 문자열 없음).
- 마이그레이션 `0006_*`: 필요 없음. 기존 열만 사용합니다.

## 실측 (보고서에만)
- 원천 도엽 5,381장(전남 2,117 · 전북 1,609 · 충청 1,655)이고 전부 EPSG:5186 중부원점 좌표입니다. TFW 기준으로 서해 섬 도엽(x≈55 km)도 5186 범위 안입니다.
- 등록 소요: 66개 시군구 5 s(VRT 작성 + upsert).
- 동적 타일(원본 창, 캐시 없음, 여수 VRT): z18 0.28 s · z16 0.26 s · z15 0.5 s · z14 2.9 s · z13 10 s. 그래서 사다리 시작 줌을 z15로 정했습니다.
- PMTiles(CPU 24 프로세스 · GPU 0)
  - 여수: z18 14,674장 · 모두 21,086장 · 98.6 MB · 205 s
  - 청양: 43,022장 · 355.5 MB · 399 s
  - 굽는 시간대는 20:42~20:52입니다.
- 덮는 비율(비도시 영상이라 도심 도엽이 없음): 여수 32.6% · 청양 97.6% · 남원(기존) 100%. 순천·광양·광주는 원천 폴더에 도엽이 거의 없어 5% 미만이므로 등록하지 않았습니다.

## V-World 위성영상 판정: 분석 입력으로 쓰지 않음(불명확)
- **공식 약관 페이지** `https://www.vworld.kr/dev/v4dv_apicla_a001.do`(오픈API 이용약관)는 2026-09-29 조회 때 '시스템 에러'로 본문을 받지 못했습니다. `https://www.vworld.kr/dev/v4dv_apiuse_s001.do`(오픈API 소개)에는 이용 조건 본문이 없습니다.
- **근거 자료:** 공개 기록(https://www.vw-lab.com/53)에 따르면 공간정보산업진흥원이 **API 이용약관 제10조(서비스의 이용) 6항 4호와 제12조(저작권)** 위배 소지를 이유로 V-World 자료의 파일 저장 코드를 삭제하도록 요청한 사례가 있습니다. 3차원 자료는 국가공간정보 보안관리규정상 '공개제한'으로 분류됐습니다.
- **판정:** AI 분석 입력으로 쓰려면 위성 타일을 받아 칩으로 저장하고 가공해야 합니다. 저장·복제를 제한하는 조항이 있고 약관 원문을 확인할 수 없으므로 브리프의 '불명확 → 쓰지 않음'을 따랐습니다.
  - 설정: `config/ladder.yaml vworld_analysis.allowed: false`
  - 경기·경상처럼 로컬 영상이 없는 시군구는 `best_imagery` 가 `{imagery_id: None, reason: "no_imagery", vworld: {allowed: false, reason: "terms"}, next: "영상 등록"}` 을 돌려줍니다.
  - 배경지도 표시(xdworld 위성)는 그대로 둡니다.
- **사용 조건이 확인되면:** `allowed: true` 로 바꾸고 프록시 WMTS를 GDAL 가상 영상 `img-{sgg}-vworld-sat` 으로 감싸는 경로를 추가합니다. `choose()` 는 source 필드만 늘리면 됩니다.

## 기본값으로 정한 것 (사용자가 나중에 정정)
- 영상 이름: `{시군구 이름} 2023 25cm 항공`. id: `img-{sgg}-2023-aerial`(S-5 등록과 같은 규칙).
- 새로 생긴 시군구 코드(여수 12130)로 `sgg_cd` 를 등록했습니다. 옛 코드 46130으로도 찾을 수 있습니다.
- 권리 표기: 라이선스 '국토지리정보원 항공정사영상(LX 보유 · 내부 분석용)', 출처 '국토지리정보원 2023 정사영상', export never(LX 세션 전용).
- 시군구 경계의 **5% 미만**만 덮으면 등록하지 않습니다. 이웃 시도 가장자리 도엽을 거르기 위해서입니다.
- best_imagery 순위: 대상의 절반 이상을 덮는가 → 해상도 급 → 최근 연도 → 덮는 비율. 대상의 2% 미만만 덮는 작은 칩은 후보에서 뺍니다.
- 동적 타일은 z15부터 씁니다. PMTiles는 z11~z18로 **여수·청양 두 곳만** 구웠습니다.
- lx-ingest 부분 덮음 표기는 '지역의 N%'(회색 작은 글씨, 95% 미만일 때만)입니다.

## 남은 것
- PMTiles는 여수·청양 두 곳만 있습니다. 나머지 64곳은 XI맵에 z15 이상에서만 보일 수 있고, XI맵이 cog 항목을 받아야 합니다(요청 1). 시군구 하나에 3~7분(CPU)이 걸리고, 전체 66곳은 약 5~7시간·15 GB로 추정됩니다. `python server/pipelines/p16_imagery_nation.py pmtiles <sgg>` 로 순차 실행하면 됩니다.
- 새 영상 등록(S-5 타일 작업)에 PMTiles 굽기 단계를 붙이는 일: `adapters/adapter_tile_cog.py` 는 소유 밖이라 요청으로 남깁니다.
- 20초 이내 영상 녹화는 하지 않았습니다(스크린샷 + 로그로 대체).

## Fable 에게 넘길 것
- lx-ingest 영상 줄의 부분 덮음 표기('지역의 33%')를 어떤 모양으로 보일지.
- 여수처럼 도심이 비는 지역에서 XI맵 영상 층의 빈 곳(도엽 밖)을 어떻게 보일지. 지금은 배경 위성이 비치고 경계는 점선입니다.

## 요청
1. **core-xi (`landxi/v3/xi-clean/app.js` buildLayers):** 영상 사다리 필터 `i.source === 'pmtiles'` 에 `cog` 도 받아 주십시오. 서명은 `/tiles/sign?set=cog/{id}` → `{url}` 을 쓰고, 방법은 lx-ingest `cogAsTiles` 참고. 그러면 PMTiles를 굽지 않은 64개 시군구도 z15 이상에서 영상이 보입니다.
2. **core-xi (`workers/gpu_worker.py`):** `imagery_path()`/`_ds()` 대신 `workers.imagery_src.open_imagery(imagery_id)` 를 쓰십시오. VRT 4번째 밴드가 알파이므로 `read_window` 의 `count >= 4` 분기가 도엽 밖 칩을 그대로 건너뜁니다.
3. **core-xi (`workers/postprocess.py`):** 읍면동 붙이기가 `namwon-emd.geojson` 과 남원 좌표 범위에 묶여 있습니다. cpu_worker 쪽 `region="namwon"` 추정은 없앴습니다.
4. **core-xi · core-flow:** 영상 선택은 `await catalog.best_imagery(sgg, geom)` 로 하십시오(async). 워커 쪽은 `imagery_src.best_imagery_sync`. 결과의 `partial: true` 이면 footprint 안만 분석합니다.
5. **`adapters/adapter_tile_cog.py` 소유자:** S-5 등록 타일 작업 끝에 `p16_imagery_nation.cmd_pmtiles(id)` 를 부르는 단계를 붙이면, 새로 등록한 영상도 XI맵 저배율에서 보입니다.
6. **core-survey:** 기동 때 마이그레이션 `0005_survey_nation.sql` 이 `subquery uses ungrouped column "p.pnu"` 로 실패합니다(start-landxi 로그).
