# lx-ingest 보고 — ① 반입(영상 · 대장 · V-World) · 2026-09-27 (3차 · 판정 불합격 3건 반영)

명세: `LANDXI-FINAL-SPEC.md` §2.4. 소유 `landxi/v3/lx-ingest/**`. 이 밖의 파일은 고치지 않았다(키트 · 서버 · proto 는 읽기/호출만). git 조작 0.

## 0-4. 9/29 재확인(같은 코드 · 정문 로그인 `lx-staff` · 실서버 · 변경 파일 0)

- 광주·전남 27개 시군구 전수(광주 5구 + 전남 22 시군): 서버 `/regions/{sgg}?geom=1` 사각형 **0** · 화면 경계 `real` **27/27**(실제 폴리곤 아닌 곳 0). 서버 뼈대에 실제 경계가 들어온 것으로 보임(여수 = 서버 MultiPolygon 3,635점 · 9/27 은 V-World 43,221점) → 서버 요청 3 은 해소로 보이며, 사각형이 다시 오면 `isBoxGeom()` → V-World 폴백이 그대로 동작.
- 여수시 서랍: 실제 경계(다도해 섬 포함) · `연속지적 있음 ✓ · 용도지역·농업진흥 있음 ✓ · 건축물대장 있음 ✓` · 대장 확인 3.7 s — `lx-ingest-1440-yeosu.png` · `lx-ingest-390-yeosu.png` 재촬영. 순천·목포·광양·나주·신안 모두 연속지적·건축물대장 있음(거짓 '없음' 0).
- 390×844 김해: 결손 블록 한 줄(높이 22) · 제목 `영상 반입 필요` y 625–649 < 행동 줄 713 → `visibleAboveActs: true` · `lx-ingest-390-empty.png` = `judge2/390-03-empty.png` 재촬영.
- 첫 화면 남원시 `필지 결합률 55.2 %`(도착 약 30 s — 서버 요청 2 그대로) · 콘솔 오류 0 · 페이지 오류 0(1440 · 390). 실측 원본 `judge2/_result4.json`.

## 0-3. 3차에서 고친 것(판정 불합격 → 해결)

| # | 판정 지적 | 원인 | 조치 | 증빙(정문 로그인 `lx-staff` · 실서버) |
|---|---|---|---|---|
| 1 | 전남·광주 42개 시군구 경계가 사각형 · 연속지적·건축물대장 거짓 '없음' | `/regions/{sgg}?geom=1` 이 뼈대만 있는 지역에 **5점 사각형(= bbox)** 을 준다(예: `12130` 여수시). 기존 폴백은 `geometry` 가 없을 때만 동작 | `data.js` `isBoxGeom()` — 고리 1개 · 5점 이하 · x/y 값이 2개씩이면 사각형으로 보고 경계로 쓰지 않음 → V-World `LT_C_ADSIGG_INFO` 폴리곤(`sig_cd` · 실패 시 이름 + 범위). 결과에 `real` 표시. 실제 폴리곤이면(남원 35점 등) 서버 경계 그대로 | 여수시 경계 = **MultiPolygon 43,221점**(다도해 섬 전부) · 대장 `연속지적 있음 ✓ · 용도지역·농업진흥 있음 ✓ · 건축물대장 있음 ✓` · `lx-ingest-1440-yeosu.png` · `lx-ingest-390-yeosu.png`. 같은 실행에서 순천·목포·광양·나주·신안 모두 실제 경계 + `연속지적 있음` `건축물대장 있음` |
| 2 | 대장 표본점이 바다 · 오류와 없음 구분 | 표본이 bbox 중심 + 6×6 격자 중 3점 · 오류(`false`)가 일부만 섞이면 '없음' | `samples()` — 폴리곤 안에서만 뽑는다. bbox 중심이 밖이면 격자를 6→10→16→24 로 촘촘히 해 육지 후보를 모은 뒤 가장 먼 점 순으로 **4점**(최소 3점) 고르게. `inside()` 에 고리별 범위 선검사(섬 많은 폴리곤 가속). `ledgerOne()` — '없음' 은 **모든 조회가 성공(NOT_FOUND 포함)했고 실제 경계 안 표본 ≥ 3** 일 때만. V-World 오류가 하나라도 있거나 경계가 사각형뿐이면 `—`(unknown) | 여수 대장 확인 12 s(경계 1.7 MB 첫 조회 포함) · 다른 시군구 2.5 s · 거짓 '없음' 0 |
| 3 | 390×844 김해: `영상 반입 필요` 제목이 행동 줄에 가림 | 결과 없는 지역에도 큰 숫자 자리(104 px '—' + 안내)가 그대로 | `app.js` `noResult()` — 결과가 없으면 큰 숫자 자리를 **한 줄**(`필지 결합률 — 아직 결과가 없습니다`, 22 px)로 접음(`lxi-big--none`). 결과가 오면 원래 크기로 | 390 김해: 제목 y **625–649** · 행동 줄 713– → 첫 뷰에서 보임(`visibleAboveActs: true`) · `lx-ingest-390-empty.png` = `judge2/390-03-empty.png` 재촬영 |

- 실측 원본: `shots/final/lx-ingest/judge2/_result3.json`. 콘솔 오류 **0**(1440 · 390) · 페이지 오류 0 · 금지어 0.
- 영상 `lx-ingest.mp4` 재촬영(18.5 s · 1440×900 · 원본 74.5 s 를 4배속): 정문 로그인 → 남원시 결합률 55.2% → 여수시(실제 경계 · 연속지적 있음) → 순천·목포·광양·나주·신안 → 김해(캐릭터). 프레임 `judge2/vid3-*.jpg`.
- 첫 화면 `lx-ingest-1440.png` · `lx-ingest-390.png` · `lx-ingest-1440-empty.png` 도 이번 실행으로 다시 찍음.
- 측정 중 게이트웨이(:8700)가 두 번 잠시 내려갔다 올라옴(이 화면 밖의 재기동 · 정문 로그인이 `서버에 연결할 수 없습니다` 를 보임). 스크립트는 로그인 재시도로 통과했고, 서버는 건드리지 않음.

### 서버 요청(화면 밖 · 그대로 유지)

1. `kind:join` `finalize()` 가 `counts: {joined_parcels, parcels}` 반환 — 합격선 '결합률 = /jobs/{id}'. 화면 코드 경로(`jobRate`)는 준비됨.
2. `/results/{set}/parcels` 19–21 s → 첫 큰 숫자 지연(이번 실행 첫 화면 큰 숫자까지 약 26 s · 두 번째 방문부터는 1시간 캐시).
3. `regions` 뼈대에 전남·광주 42개 시군구 실제 경계 추가(지금은 사각형 → 화면이 V-World 로 대신 받음. 여수 1.7 MB).
4. 시드 `lx-staff` 의 이름이 'LX 직원' 이라 마스트 역할 칩이 `LX 직원 · LX 직원` 으로 겹침 — 이름 시드 교체.

## 0. 2차에서 고친 것(판정 1차 불합격 → 해결)

| # | 판정 지적 | 조치 | 증빙(정문 로그인 · 실서버) |
|---|---|---|---|
| 1 | `saveLedgerSchema` · `LEDGER_KINDS` · `MEANINGS` 가 S-6 계약과 다름 | 본문을 `{kind, columns:[{key:<열 이름>, label:<열 이름>, role}]}` 로 바꿈. `role` ∈ `pnu·jibun·status·date`. kind 는 서버 `KINDS` 5개만(`farm_ledger` `dev_permit` `public_asset` `river_permit` `greenhouse`) — `building_ledger` 삭제. 카드에 이미 있던 다른 역할 열(`use` · `permit_no` 등)은 지우지 않고 그대로 붙여 보냄. 시트는 `GET /registry/cards` 의 현재 형식으로 미리 채움 | `PUT /registry/cards/card-farm/ledger_schema` → **200** · 토스트 `등록했습니다` · 콘솔 오류 **0** · `lx-ingest-1440-ledger-saved.png`. 실제 전송 본문: `{"kind":"farm_ledger","columns":[{"key":"필지고유번호","label":"필지고유번호","role":"pnu"},{"key":"소재지번",…,"role":"jibun"},{"key":"경작 여부",…,"role":"status"},{"key":"기준일",…,"role":"date"},{"key":"use","role":"use","label":"작물"}]}` |
| 2 | 첫 지역 동률 처리 | 순서: 의심 필지가 있는 지역(결과 있음) → 배포 수 → `has_imagery` → `n_findings` 값(`/regions` 가 LX 세션에 주는 봉투). 결합 가능 여부는 `n_findings`(결합된 실태조사 결과)로 대신함 | 새 컨텍스트(최근 지역 없음 · localStorage 빈 상태)에서 첫 화면 = **남원시**(배포 8 동률: 남원·곡성·구례 → 의심 필지 20,868 인 남원) · `lx-ingest-1440.png` · `lx-ingest-390.png` |
| 3 | 1440×900 `영상 반입 필요` 에서 서랍 버튼 2개가 첫 뷰 밖 | ① 행동 줄을 서랍 **바닥에 고정**(스크롤 영역 밖 · 서랍 요소 끝에 붙임) ② 드론 빈 상태 카드 높이 **132**(≤ 140) | 김해시(영상 없음) · 버튼 `영상 등록`·`대장 형식 등록` 위치 y **820–864**(뷰 900 안) · 카드 높이 132 · `lx-ingest-1440-empty.png`(판정 j-1440-empty 와 같은 장면) |
| 4 | 결합 중 `st.geo('parcels')` 재표시 | `pick()` 의 `joinRate.then` 에서 결합이 돌고 있으면 필지·채색을 `held` 로 보류(큰 숫자만 채움) → `end()`(완료·실패·취소)에서 한 번에 반영 | `?dev=1` 상태 조회: 클릭 25 s 뒤 결합률 도착 → `held:true` · 필지 층 **없음** · 읍면동은 완료 셔드만 1 → 3 차오름. 이어 보기: 새 탭에서 **채색 5 = 서버 shards_done 5/39** (SSE 가 `XRANGE -` 로 처음부터 재생 → `shard.done` 재생으로 복원 확인). `lx-ingest-1440-joining.png` · `lx-ingest-1440-resume.png` |
| 5 | 390 에서 시트 + 지역 서랍 머리 2개 겹침 · 등록 실패 사유 없음 | K5 스택 규칙 '같은 자리 이전 서랍 닫힘'을 화면에서 적용: 시트가 열린 동안 지역 서랍을 숨기고(`lxi-under`), 시트가 닫히면(× · 저장 · 등록) 되돌림 — 1440 도 같게. 등록 실패는 서버 사유를 한 줄로: `그 경로에 영상 파일이 없습니다` · `이 지역을 찾지 못했습니다` · `GeoTIFF 같은 영상 파일만 등록할 수 있습니다` 등 + `다시 시도` | 390 에서 보이는 서랍 머리 = `대장 형식` 1개 / `영상 등록` 1개 · `lx-ingest-390-sheet-ledger.png` · `lx-ingest-390-sheet-imagery.png`. 없는 경로 → 토스트 `그 경로에 영상 파일이 없습니다 · 다시 시도` · `lx-ingest-1440-register-fail.png` |
| 6 | 보고 갱신 · 실파일 S-5 등록 1회 | 아래 §2 · §3 | 아래 |

## 1. 만든 것

| 파일 | 역할 |
|---|---|
| `landxi/v3/lx-ingest/index.html` | 셸 없는 빈 판 + `kit.css` · maplibre · pmtiles |
| `landxi/v3/lx-ingest/app.js` | 조합: K2 관문 → K1 셸(레일 6단 · ① 현재) → K3 무대 → K4 지역 카드(좌상) → K8 공정 카드(좌하 · 가로 4 + `결합 실행` + 진행 막대 1) → K5 서랍 392(지역 · 행동 줄 바닥 고정) |
| `landxi/v3/lx-ingest/data.js` | 데이터 한 곳(봉투만) · S-3/S-5/S-6 호출 · 경로가 없을 때만 쓰는 폴백 |
| `landxi/v3/lx-ingest/sheets.js` | `영상 등록` 시트 · `대장 형식` 시트(K5 + K11 + K13) · 시트 동안 지역 서랍 숨김 |
| `landxi/v3/lx-ingest/ingest.css` | 배치만 |

흐름: 정문 `/landxi/v3/login/` → `lx-staff` → `/landxi/v3/lx-ingest/` → 첫 지역(URL `?region=` → 최근 → 위 동률 규칙) → 서랍(큰 숫자 `필지 결합률` · 절 `영상` · 절 `대장` · `영상 등록` `대장 형식 등록`) → `결합 실행` → 진행 막대 + 읍면동이 서→동으로 차오름.

## 2. 데이터 · API — S-3 · S-5 · S-6 도착 반영

게이트웨이 openapi 에 `/regions` · `/regions/{sgg_cd}` · `POST /catalog/imagery` · `PUT /registry/cards/{cid}/ledger_schema` 가 모두 있다. 화면은 이 경로를 쓰고, 어댑터는 경로가 없을 때만 쓰는 **폴백**으로 남겼다(`hasRoute` 로 자동 판단).

| 명세 | 이 화면 | 상태 |
|---|---|---|
| `GET /regions`(S-3) | 키트 `loadRegions()` → 256 시군구(`has_imagery` · `deploys` · `n_findings`) | **실서버** |
| `GET /regions/{sgg}`(S-3) | `?geom=1` 로 경계 + 지역 영상 목록(`imagery` · 등록 직후 행 포함) · 카탈로그와 id 로 이어 범위·사다리 | **실서버** (V-World 경계 · 카탈로그 bounds 대조는 폴백) |
| `GET /catalog/layers` | 자체 영상 점(전국) · footprint · 사다리 타일 | 실서버 |
| V-World `GET /proxy/vworld/data` | 대장 5줄 갖춤 확인 · 읍면동 경계 | 실서버 |
| `POST /catalog/imagery`(S-5) | 본문 `{path, region, year, gsd, kind}`(kind = `drone`/`aerial`/`satellite`, 해상도로 정함) · 성공 뒤 카탈로그·지역 상세를 새로 받음 · 실패 사유 → 사용자 말 1줄 | **실서버** (브라우저 보관은 폴백) |
| `PUT /registry/cards/{id}/ledger_schema`(S-6) | §0-1 본문 · 대장 종류→카드: 농지대장·시설원예 등록 → `card-farm` · 개발행위 허가·하천 점용 허가 → `card-change` · 공유재산 → `card-living` | **실서버** |
| 결합 `POST /jobs/quote{kind:join}` → `POST /jobs` → SSE | 그대로(본문에 `adapter:'survey/join'` 함께 · 서버 요청 1) | 실서버 |
| 결합률 숫자 | `GET /results/{set}/parcels` ÷ `GET /survey/stats?by=emd` 봉투(`inferred` · 검수 전). **결합 완료 응답(`/jobs/{id}`)의 `counts` 에 `joined_parcels` + `parcels` 가 오면 그 값을 큰 숫자로 쓰는 코드 경로(`jobRate`)를 넣어 둠** | 실서버 · 서버 요청 1 |

### S-5 실파일 등록 1회(실서버)

- 지역 남원시(52190) · 경로 `_work/p5/chips/LC_JL_AP25_35710074_001_2020_FGT.tif`(AP25 25cm · 2020 · EPSG:5186 · 실제 위치가 남원시 안임을 V-World 점 조회로 확인) · 연도 2020 · 해상도 25cm.
- `POST /catalog/imagery` → **201** · 카탈로그 행 `img-52190-2020-aerial` · 타일 작업(`kind tile` · **CPU 풀**) → **done 2/2**(약 1분). GPU 사용 0.
- 화면: 토스트 `등록했습니다` → 절 `영상` 에 `2020 25cm 항공` 줄 추가(4줄) · 콘솔 오류 0 · `lx-ingest-1440-sheet-imagery.png` → `lx-ingest-1440-registered.png`.
- 이 행은 서버 카탈로그에 남아 있다(삭제 경로 없음 · 같은 칩이 원천 칩 세트로도 있어 중복 · 필요하면 관리자가 정리).
- 타일 작업이 끝나도 서버 `tier` 는 `raw` 로 남는다 → 화면은 카탈로그에 범위(bounds)가 생겼는지로 '타일 작업 중'(호버 설명) 여부를 판단한다.

## 3. 합격선 실측(정문 로그인 · 1440×900 / 390×844)

| 항목 | 기준 | 실측 |
|---|---|---|
| 첫 뷰 글자 · 버튼 | ≤ 300 · ≤ 8 | 1차 실측 그대로(165 / 101 · 버튼 6 / 4) — 이번 변경은 문구를 늘리지 않음(행동 줄 위치만 바뀜) |
| 금지어 | 0 | 0 (`grep 시연|데모|준비 중|namwon|남원` lx-ingest/*.js = 0) |
| 콘솔 오류(lx-ingest) | 0 | **0** — 첫 화면·대장 형식 저장·빈 지역·실파일 등록·390 시트 2종·결합·이어 보기·취소, 녹화 원본까지 전부. **예외 1건(의도한 실패 시험)**: 없는 경로로 영상 등록 → 서버 404 를 Chrome 이 `Failed to load resource … 404` 로 기록(페이지 코드 오류 아님 · 사용자에게는 토스트 한 줄) |
| 장면: 영상 없는 지역 → 캐릭터 → 등록 → 있음 | 필수 | 캐릭터 = 김해시(`lx-ingest-1440-empty.png`) · 등록 → 있음 = 남원시 실파일(`…-registered.png`). 김해에 맞는 실제 영상 파일이 로컬에 없어 김해 등록은 하지 않았다(다른 지역 파일을 김해로 등록하면 거짓 데이터) |
| 결합률 = `/jobs/{id}` 결과 | 필수 | **서버 요청으로 남김** — `kind:join` 이 결합 수를 내지 않는다(`counts` 비어 있음). 화면 코드 경로는 준비됨(§2) |
| 첫 지역(신규 컨텍스트) | 결과 있는 지역 | 남원시(1440 · 390 모두) |

## 4. 증빙 — `shots/final/lx-ingest/`

- `lx-ingest-1440.png` — 신규 컨텍스트 첫 화면 남원시 · 결합률 55.2% · 읍면동 채색 차오르는 중
- `lx-ingest-1440-sheet-ledger.png` · `lx-ingest-1440-ledger-saved.png` — 대장 형식(서버 현재 형식으로 채움 · 지역 서랍 숨김) → 저장 → `등록했습니다`
- `lx-ingest-1440-empty.png` — 김해시 `영상 반입 필요` · 버튼 2개 첫 뷰 안
- `lx-ingest-1440-register-fail.png` — 없는 경로 → `그 경로에 영상 파일이 없습니다 · 다시 시도`
- `lx-ingest-1440-sheet-imagery.png` · `lx-ingest-1440-registered.png` — 실파일 S-5 등록 → `2020 25cm 항공`
- `lx-ingest-1440-joining.png` · `lx-ingest-1440-resume.png` — 결합 중(필지 층 없음 · 완료 읍면동만) · 새 탭 이어 보기(채색 5 = 완료 셔드 5)
- `lx-ingest-390.png` · `lx-ingest-390-sheet-ledger.png` · `lx-ingest-390-sheet-imagery.png` · `lx-ingest-390-empty.png`
- `lx-ingest.mp4`(18.5 s · 1440×900) — 정문 로그인부터 한 번에 찍은 원본 119 s 편집: 로그인 4배속 → 결합률 도착·읍면동 차오름·대장 형식 저장 2.5배속 → 김해(캐릭터)→남원·`결합 실행` 3배속 → 결합 진행 60 s 12배속. 결합률 계산 대기 18 s 잘라냄. 원본 콘솔 오류 0
- 시험 뒤 정리: 띄운 `kind:join` 작업 2건은 `POST /jobs/{id}/cancel` 로 취소(쓰기 없음). `card-farm` 대장 형식은 시험 저장 뒤 시드 원본으로 되돌려 놓음(같은 PUT 경로)

## 5. 키트 요청(구현은 명세대로 · 키트는 손대지 않음)

1. **K5 스택 규칙** — `drawer()` 는 같은 `slot` 만 닫는다. `slot:'sheet'` 가 좁은 화면에서 `right` 서랍과 같은 자리(하단 시트)인데 닫히지 않아 머리 2개가 겹친다 → 화면이 `lxi-under` 로 숨기고 되돌린다. 키트에 `stack:'hide-below'` 같은 옵션 또는 390 에서 `right`·`sheet` 를 같은 자리로 보는 규칙이 있으면 이 우회가 필요 없다.
2. **K5 서랍 바닥 행동 줄** — `drawer({ foot })` 가 없어 화면이 서랍 요소 끝에 행동 줄을 붙였다. 공식 슬롯 요청.
3. K16 CLI 로그인 실패(역할 탭 클릭을 `<span>` 이 가로챔) · K6 허용 라벨에 `필지 결합률` 추가 · K6 결손 `—` 검은 막대 · K4 `regionPicker({ items })` · K3 choropleth/dash 모양 — 1차 보고와 같음(미해결).

## 6. 서버 요청 · 정직 항목

1. **`kind:join` 결과에 결합 수가 없다** — `adapters/survey/adapter_join.py` 는 여전히 `hidden: True` · `stage: skeleton` · 셔드 metrics(`parcels` `pairs`)가 작업 `counts` 로 모이지 않는다. 요청: join 어댑터 `finalize()` 가 `counts: {joined_parcels, parcels}` 를 내면 화면은 코드 변경 없이 그 값을 큰 숫자로 쓴다(합격선 '결합률 = /jobs/{id}' 충족). 그때까지 큰 숫자는 `/results/{set}/parcels` + `/survey/stats` 봉투.
2. **결합이 느리다** — 셔드당 약 30 s(CPU · PostGIS) → 39 읍면동 약 20 분 · `/results/{set}/parcels` 결합 계산 20–30 s(첫 화면 큰 숫자 도착 22–31 s 실측). GPU 0.
3. **영상 등록 뒤 `tier` 가 `raw` 그대로** — 타일 작업이 끝나도 바뀌지 않는다. 화면은 카탈로그 범위로 판단(§2). 작업 완료 시 `tier` 갱신 요청.
4. **`/jobs/{id}` 에 완료 셔드 목록이 없다** — 이어 보기는 SSE 처음부터 재생으로 복원됨(확인). Redis 스트림이 만료된 뒤에는 복원 근거가 없으니 `shards_done_ids` 필드 요청.
5. `/regions/{sgg}` 의 LX 영상 목록에서 원천 칩 세트(`AI Hub … 원천 칩`) · 지수 · 지형은 화면이 이름·종류로 거른다.
6. 영상 등록 시트의 `파일 또는 경로` 는 서버 경로 입력만 받는다(서버는 multipart 업로드도 받고, `data.js registerImagery({file})` 경로는 넣어 둠). 파일 선택 UI(K11)는 2GB 영상 업로드 UX 결정 뒤에.
