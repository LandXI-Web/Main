브리핑 확인: (① 남원은 예시 — 지역은 변수, 하드코딩 금지·두 지역 이상으로 보인다 ② 개발 정보(작업 id·ms·경로·좌표) 화면 노출 금지 · 숫자 한 출처 ③ 확인은 로그인 폼으로만, GPU는 게이트웨이 대기열로 한 장·git 커밋 금지)

# core-survey 보고서 — 필지 실태조사를 어느 시군구에서나 (코어 ②)

2026-09-29 · Opus 5.5 · 계약 `contract-parcel-ai.md` 착수 첫 단계에 게시(core-fusion·core-flow 사용 — 실제로 착수 중 기관 계정·다른 작업이 `POST /survey/build` 를 호출했다).

## 완료 조건 대조
| 조건 | 결과 | 증거 |
|---|---|---|
| 여수(전남 · 새 지역): core-xi 여수 추론 → `POST /survey/build` → 적재·결합·의심 실측 | **완료** — 필지 307,137(로컬 연속지적 2022-02) · 분석 범위 안 81,667필지 · AI 겹친 필지 27,946 · 의심 10,504건(R1 1,072 · R2 9,322 · R4 7 · R5 46 · R6 57) | 아래 실측 · `survey_sgg` 12130 |
| 로그인 폼(gj-manager) 기관 화면 여수 의심 필지 목록·지도 | 완료 | `shots/core/core-survey/yeosu-1440-01-suspects.png` · `yeosu-1440-02-detail.png` · `yeosu-390-01-suspects.png` · 녹화 `yeosu-flow.webm`(16.3초) |
| lx-staff 결과 확인 1건 | 완료(남면 화태리 423 · '맞음' · "판정을 저장했습니다") | `yeosu-1440-04-review.png` · `yeosu-1440-05-reviewed.png` · `yeosu-390-04-review.png` |
| 기관 조치 기록 | 완료(현장 확인 배정 → 판정 위반 → 조치 시정명령 · 농지법 제42조 · 2026.10.31) | `yeosu-1440-03-todo.png` · `yeosu-1440-06-action-form.png` · `yeosu-1440-07-action-saved.png` · `yeosu-390-02-todo.png` |
| 보고서 docx(기관·시군구·읍면동 이름이 여수 것) | 완료 — 머리 "광주전남특별시 · 여수시 남면", 대상 "전남광주통합특별시 여수시 남면", 문서 안 '남원' 0회 | `yeosu-실태조사_초안_12130340.docx` · `yeosu-1440-08-report.png` |
| 남원(전북 · 기준) 같은 흐름 | 완료(namwon-manager: 의심 필지 → 배정 → lx-staff 결과 확인 → 판정·조치 → docx "남원시 금지면") | `namwon-*.png` · `namwon-실태조사_초안_남원시_금지면_20260929.docx` · `namwon-flow.log` |
| 규칙 일반화 전후 의심 수 회귀표 | 아래 표(차이 사유 기록) | `tests/test_survey_nation.py` |
| `GET /results/{set}/parcels` 첫 응답 ≤ 3초(두 지역) | 남원 **1.56초**(전 21.5초) · 여수 **0.54초**(전 3.9초) | 아래 실측 |
| `contract-parcel-ai.md` 첫 단계 게시 | 완료 | `docs/superpowers/final/core/contract-parcel-ai.md` |
| forbidden(gj-manager·namwon-manager·lx-staff · 1440·390) 0 | 16 화면 모두 0 | `forbidden-*-1440.txt` · `forbidden-*-390.txt` |
| 콘솔 오류 0 | 0(흐름 두 번 + forbidden 모두) | `*-flow.log` 끝줄 · forbidden `console_errors: []` |
| `server/tests` · `server/survey/tests` | `survey/tests` 26 통과 · `tests/test_survey_nation.py` 12 통과 · `tests` 204 중 196 통과(실패 5는 `test_recovery`·`test_perf_fields` — 가동 중 워커와 겹치는 기존 시험, 내 변경과 무관 · 아래 '남은 것') | — |

## 한 일(백본)
1. **필지 적재(시군구 단위 · 요청 시)** — `POST /api/v1/survey/build {sgg_cd, job_id?}` → 게이트웨이 대기열 CPU 작업(kind `survey`, 어댑터 `survey/rules` 의 build 칸 1개). `server/survey/nation.py`:
   - 로컬 연속지적 전국 `LSMD_CONT_LDREG_{시도}` 에서 그 시군구만 뽑아 캐시(`02. 데이터/cache/survey/parcels/lsmd-{sgg}.csv`, 두 곳 동시 추출 잠금). **원천 좌표계는 EPSG:5174**(실측: V-World 같은 필지와 1e-7° 일치 — 5186 으로 읽으면 100 km 남쪽으로 밀림).
   - 없거나 빈 시군구만 V-World `LP_PA_CBND_BUBUN`(칸 나눔 · 페이지 · 디스크 캐시 30일 · 한 번 적재 호출 상한 300쪽).
   - **PNU·시군구 코드는 지금 V-World 코드로 저장**(여수 46130 → 12130, 원본은 `pnu_src`) → 기관 대장(12130…)과 그대로 맞는다. 주소 = 시도·시군구(regions) + 읍면동(core-xi `regions.emd_fc`) + 리(V-World `LT_C_ADRI_INFO`).
   - 관할 기관 = `config/regions.yaml` 접두 → 여수 `gwangju-jeonnam`, 남원 `namwon`, 관할 없는 곳 `lx`. 기관 manager 는 관할만(남원 담당자가 여수 요청 → 403 확인).
2. **AI × 필지 결합 저장** — 새 표 `survey_parcel_ai(job_id, pnu, cls, hit_m2, in_m2, n, conf, ids, n1, hit1_m2, conf1_sum, …)`. 식은 정본 `s3_survey.py`(교차 > 0.01㎡ · 과반 포함 · 신뢰도 ≥ 0.5)와 같다 — 남원 운봉읍 31,211필지에서 옛 적재값과 **최대 차이 0.0㎡**.
3. **규칙 일반화** — R1–R6 SQL 은 이제 피연산자 열(`bld_in`·`r_farm` …)만 읽고, 원천은 `rules/_operands.yaml` 대응표로 둘: `ai`(survey_parcel_ai) · `legacy`(남원 옛 a23_* 열). 임계는 기존 값 그대로.
   - **분석 범위 제한(새로 발견해 고침)**: 여수 전역 작업은 영상이 시군구의 29%만 덮는다. 범위를 안 거르면 '휴경(AI 경작 부재)' R2 가 영상 밖 필지에서 켜져 35,719건이 나왔다 → 분석 범위(작업 범위 ∩ 영상 footprint)를 `survey_sgg.coverage` 로 저장, 그 안 필지만 평가(10,504건).
   - 등급 A/B = **그 시군구 안** 점수 상위 5% · 다음 20%(보고서 문장 `{시군구} 전체`).
4. **의심 저장** — `survey_findings` upsert(상태·판정·조치 기록 보존, 기록 없는 옛 의심만 삭제) · `survey_emd` · `survey_sgg` · 끝 이벤트 `survey.done{sgg_cd, tenant_id, counts}`(작업·ops·기관 스트림 — 실측 확인).
5. **결과 × 필지 ≤ 3초** — `GET /results/{set}/parcels` 가 저장 결합을 읽는다(필지 속성 사본 → 큰 필지 표 조인 없음). 저장 없는 옛 세트·`min_conf`·기본값 아닌 겹침만 공간 결합 + 10분 캐시.
6. **읽기 필터** — `?sgg=`(옛/새 코드 모두) on `/survey/findings` · `/survey/stats`, 새 `GET /survey/regions` · `GET /survey/build/{sgg}`.
7. **필지 조회 전국화** — `GET /parcels?lng&lat`: 적재된 시군구 = PostGIS, 아니면 V-World 한 점(서울 시청 앞 실측 응답 확인). 남원 PMTiles 고정 경로 삭제.
8. **결과 확인 → 조치 → 보고서** — 보고서(`survey/report.py`)의 기관·시군구·읍면동·영상 표기를 데이터에서(`survey_sgg` · `tenants` · regions), '남원 전체 상위 5%'·'전북특별자치도 남원시 ' 잘라내기 삭제. `gov-report` 의 `/남원/` 치환 우회 삭제.
9. **기능이 보이는 최소 UI** — `gov-report` 에 `의심 필지` 탭(관할 시군구 고르기 · 큰 숫자 · 표 · 지도 점 · `현장 확인 배정`) + 보고서 탭 `문서 내려받기`(서버 문서 · LLM 없이) + 시군구 고르기. `lx-review` 큐에 시군구 필터(상자 겹침 방지). 기존 키트 부품만.
10. 남원 하드코딩 제거(소유 범위): `sse_fallback` 기본 기관 · `adapter_join` 기본 세트 · `adapter_rules` 기관 고정 · `results.py` 남원 통계 파일 이름 · `parcels.py` PMTiles · `survey/*` 설명 문구. 남원 정본 적재 파이프라인(s5)과 그 상수는 재현용으로 둠(`survey/db.py` 에 '재현 전용' 표시).

## 회귀표(남원 · 규칙 일반화 전후 · 의심 건수)
| 규칙 | 정본(적재 20,872) | 일반 SQL × 옛 열 | 일반 SQL × 저장 결합(단일 AI 작업) | 차이 사유 |
|---|---|---|---|---|
| R1 무허가 건축 | 4,140 | 4,140 | 4,140 | 0 |
| R2 휴경·전용 | 15,651 | 15,651 | 15,651 | 0 |
| R3 비농지 위 비닐하우스 | 20 | 20 | 11 | −9: 정본은 2025 드론(두 번째 시점) 비닐하우스를 함께 본다 — 단일 작업 경로엔 두 번째 시점 없음 |
| R4 주차장 | 33 | 33 | 33 | 0 |
| R5 산지 개간 | 464 | 464 | 459 | −5: 같은 이유(2025 비닐하우스 면적) |
| R6 공공용지 | 564 | 564 | 564 | 0 |
| 합 | 20,872 | **20,872(필지·점수 모두 같음)** | 20,858 | −14 |
남원 정본 의심은 그대로 둔다(두 번째 시점·변화 근거 포함). 저장 결합 경로는 남원에서 대조용으로만 돈다.

## 실측(보고서 전용 — 화면 노출 없음)
- 여수 필지 적재: 연속지적 추출 3분 28초(전남 1.7 GB · 첫 번만, 이후 캐시) → 307,137필지 삽입 39–48초 · 읍면동 이름 58 · 리 이름 63.
- 여수 결합: 탐지 17,612 × 필지 → 쌍 54,002 · 저장 32,114행 · 24.5–164초(첫 계산 164초 · 두 번째 25초) · 규칙 1.4–3.7초 · 의심 저장 3–5초 · 적재 작업 전체 34초(필지 재사용 시).
- 남원 결합: 쌍 414,146 · 저장 222,335행 · 168초.
- `/results/{set}/parcels?limit=2000` 첫 응답: 남원 1.56초(서버 1,083 ms) · 여수 0.54초(394 ms) · 남원 읍면동 필터 0.27초. 옛 공간 결합(같은 결과 184,791필지): 21.5초.
- 정직성: 증평군(충북 · 영상 있음 · AI 결과 없음) 적재 → 42,928필지 · 상태 `no_ai`(화면: 'AI 분석 전입니다'). 확인 시간대 21:01–21:38(CPU 워커만, GPU 0).

## 바꾼 파일
- 신설: `server/survey/nation.py` · `server/survey/rules/_operands.yaml` · `server/migrations/0005_survey_nation.sql` · `server/tests/test_survey_nation.py` · `docs/superpowers/final/core/contract-parcel-ai.md` · `shots/core/core-survey/_tools/flow.mjs` · `video.mjs`
- 수정: `server/survey/rules.py` · `explain.py` · `report.py` · `db.py` · `sse_fallback.py` · `__init__.py` · `server/survey/tests/test_api.py` · `test_load_and_rules.py` · `test_state_report.py`(정본 검증을 정본 행으로 한정 — L-* 행·다른 시군구 행이 같은 표에 있음) · `server/adapters/survey/adapter_rules.py` · `adapter_join.py` · `server/landxi_api/survey.py` · `results.py` · `parcels.py` · `server/pipelines/p8_parcels.py`(시군구 인자 적재 도구) · `landxi/v3/gov-report/index.html` · `app.js` · `gov-report.css` · `landxi/v3/lx-review/app.js` · `data.js`
- 소유 밖 1줄: `server/tests/test_f2b_api.py` 견적 시험에 `options.sgg_cd`(전국화 뒤 무범위 견적 = 전국 97칸이 맞음) — 아래 '요청'에 기록.

## 기본값으로 정한 것(사용자가 나중에 정정)
- 탭 이름 `의심 필지`, 큰 숫자 이름 `의심 후보`(lx-review 의 '현장 확인 필요'와 값이 다르므로 같은 이름을 쓰지 않음), 배정 버튼 `현장 확인 배정`, 등급 표기 `우선·보통·참고`, 보고서 버튼 `문서 내려받기`.
- 저장 PNU·시군구 코드 = 지금 V-World 코드(옛 코드는 `pnu_src`).
- 새 시군구 필지의 용도지역·농업진흥은 빈 값(설명에 '용도지역·농업진흥지역 층 대조 전') — V-World 일일 호출 보호. 그래서 새 지역엔 '농업진흥구역' 보강점수가 없다.
- 관할 기관 없는 시군구의 의심 소유 = `lx`.
- 등급 절단은 정본 식 그대로(점수 ≥ 분위, 동점 포함) — 여수 B 가 66%로 큰 이유는 R2 동점(57.5점) 때문.
- 남원 적재(정본) 시군구는 `/survey/build` 가 의심을 바꾸지 않는다(결합 저장 + 회귀 대조만).

## 남은 것
- R2(휴경) 는 새 지역에서도 가장 많다(여수 9,322) — 규칙 note 대로 과다 추정. 현장 판정이 쌓이면 재보정(lx-review 임계 조정 경로).
- `tests/test_recovery.py`(5) · `test_perf_fields.py`(1) 실패 — 가동 중인 워커·다른 작업과 겹쳐 생기는 기존 시험(내 파일 무관). 조용한 시간에 다시.
- 2022-02 연속지적이라 그 뒤 분할·합병 필지는 V-World 로 보완 필요(지금은 빈 시군구만 V-World).
- 결합 첫 계산이 큰 시군구에서 2–3분(남원 168초) — 읍면동 칸을 CPU 워커 2개로 나누면 절반.

## Fable 에게 넘길 것
- 기관 첫 화면에서 `의심 필지 · 할 일 · 보고서` 세 탭의 위계와 첫 탭 선택(지금은 할 일이 비면 의심 필지로 연다).
- 시군구 여러 곳(광주전남) 고르기 위치 · 지도 점 밀도(수천 점) 표현.
- 보고서 탭의 'AI 초안'과 '문서 내려받기' 두 버튼 관계.

## 요청
- **core-xi**: 여수 전역 작업이 `lx` 소유라 gj-manager 가 `/results/{job}/parcels`·지도 층을 읽으면 403(다른 기관의 결과). 관할 기관 배포본 별칭(published_sets) 또는 작업 tenant 를 관할 기관으로.
- **main.py 소유자**: CORS expose 에 `x-lx-report-name` 추가(지금은 화면이 파일 이름을 자료로 다시 만든다).
- **core-fusion**: L-* 평가에 `survey.nation.ai_operands(conn, pnus)` 사용(옛 a23_* 이름으로 채워 줌 · 계약 §2.2). 광주전남 L1 행이 이미 생겼다.
- **8705 개발 게이트웨이**(`survey/devapp.py` 로 띄운 옛 프로세스)가 옛 코드로 떠 있어 `survey/tests` 가 기본으로 그쪽을 친다 — 띄운 쪽이 내리거나 `LX_SURVEY_API=http://127.0.0.1:8700` 로 시험(이번 결과는 8700 기준).
- **test_f2b_api.py 소유자**: `survey` 견적 시험에 시군구 인자 추가한 1줄 확인.
