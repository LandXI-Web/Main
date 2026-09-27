# F2-S — 실태조사 백엔드: 남원 실데이터 PostGIS 적재 · `/api/v1/survey/*` · 대조 작업 어댑터(39 읍면동) · 상태 쓰기 1개 · 보고서 초안 `.docx`(LLM 없이)

- 모델 **Opus 5** · 난이도 L · 기간 5–6일 [추정] · 판정 Fable 5.1(API 실측 · 정직성 · F2-A 화면과 함께)
- 읽을 것(순서): ① `F1-CONTRACT.md` **v1.1-3(19–22)** · v1.1-2(9·11·14·16) · v1.1-6 소유 ② `02. 데이터/survey/README.md` 전문 + `namwon-parcels.meta.json` + `namwon-parcel-emd-summary.json` 구조(`totals` · `rules` · `by_emd[39]`) + `namwon-parcel-timeline.json`(`parcels[].events[]` kind ledger|ai|change) + `namwon-parcel-suspects.csv` 열 ③ `SURVEY-SPEC.md` §2 · §3 · §5 · §8.1 ④ `server/adapters/base.py` · `server/adapters/global/*`(cpu 어댑터 등록 방식 · `ADAPTER` 상수 · registry_scan) · `server/workers/cpu_worker.py` · `server/landxi_api/{results,parcels,deps,envelope,auth}.py`(봉투 · realm 관문 · RLS 방식) ⑤ `f1/F1-B-result.md`(detections 파티션 · RLS · audit_log 규약)
- 공통 규칙: **git 금지** · 소유 밖 수정 0 · 테스트 자기 것만(`server/survey/tests/**` pytest · `tests/e2e/f2sapi-* --workers=2`) · GPU 사용 0(전부 CPU·PostGIS) · 4173·8700·8702·vLLM·Ollama 끄지 말 것 · 행정 문서화 금지 · **지어낸 수치 0 — 이 브리프의 숫자는 전부 README 실값이며 API 응답이 그 값과 같아야 한다.**

## 목표

`02. 데이터/survey/`에 이미 **필지 단위 실태조사 엔진의 산출물**이 있다(2026-09-24 V-World 연속지적 수집 → 2023 AI 129,420 공간결합 → 규칙 R1–R6 → 의심 20,872건 → 이력 6,818필지). 지금은 파일(gpkg · PMTiles · CSV · JSON)일 뿐이라 XI맵이 서랍·카드·이력을 **서버 없이** 그릴 수밖에 없고, 상태(배정·오탐)를 남길 곳이 없다. 이 에픽은 그것을 **PostGIS 표 + 읽기 API + 상태 쓰기 1개 + 대조 작업 어댑터 + docx 초안**으로 올려, F2-A(화면)·F2-E(에이전트 도구)·F2-C(관제 finding.state)·F2-B(결합 API)가 같은 정본을 읽게 한다. 정본 수치: 필지 **332,084**(749.25 km²) · 의심 **20,872 / 20,852필지** · R1 4,140 · R2 15,651 · R3 20 · R4 33 · R5 464 · R6 564 · A 1,053 · B 7,386 · C 12,433 · 임계는 전부 `[추정 초기값]`.

## 근거
- 사용자(2026-09-24): "필지와 이력대조 등 실태조사 핵심 기능" · 포지셔닝(2026-09-26): "실태조사 업무 특화 솔루션 · 유일함 = LX 지적 공신력 + PNU 결합 + 대장 대조 + 현장조사 연계".
- integrate result 공무원 평: `시 전역 판독 → 1cm → 필지 카드까지는 성립합니다. 필지 대장 대조 → 조치 → 보고까지 끝내는 흐름은 아직 없습니다.`
- F1-A 게이트 시민 평: `시민이 다음에 할 행동(내 필지 보기·신고)이 없어 15초 뒤에는 '예쁜 지도'에서 멈춘다.` / 공무원 평(F1-D): `job.done 뒤에 남는 것은 비활성 'Done' 버튼뿐 — 결과 열기·내보내기·조치·보고로 이어지는 다음 행동이 0`.
- SURVEY-SPEC §8.1: "로컬 자산만으로 닫히고, 지어낸 수치 없이, 공무원이 '내 일이 줄어드는 것'을 본다" · README §6 한계(R2 과다 추정 · 25cm 모델 비닐하우스 약함 · 대장 시점 불일치)는 API `note`로 그대로 노출.

## owned_files
`server/survey/{__init__.py,db.py,rules.py,explain.py,report.py,pipelines/{s5_load_pg.py,s6_replay_record.py},tests/**}` · `server/adapters/survey/{adapter_rules.py,adapter_join.py}` · `server/landxi_api/survey.py`(라우터 · F2-B 훅이 import) · `server/migrations/0002_survey.sql` · `server/survey/rules/R1..R6.yaml`(`server/config/**`는 F2-B 소유 — 거기 두지 않는다) · `02. 데이터/survey/{replay/survey-namwon.ndjson,findings-emd.json}` · `tests/e2e/f2sapi-*.spec.mjs` · `shots/f2/S/**` · `blueprint/f2/F2-S-result.md`.
읽기만: `02. 데이터/survey/*.gpkg|.pmtiles|.csv|.json`(원본 수정 금지 · 재생성 금지) · `server/landxi_api/*`(봉투·관문·audit 헬퍼 import) · `server/workers/bus.py`(emit · tenant_event · pg). **만지지 말 것**: `server/landxi_api/main.py` · `server/workers/*` · `landxi/**`.

## 단계별 할 일

### 1. 적재 `s5_load_pg.py`(D1 · 멱등 · conda gcs GDAL/geopandas · 약 5분 [추정])
- `0002_survey.sql`: `survey_parcels`(pnu pk · addr emd emd_cd ri jibun jimok jimok_nm area_m2 jiga jiga_ym yongdo nongup geom 4326 · a23_{bld,crop,park,gh}_m2 · a23_*_in_m2/_n/_conf · a25_* · chg · flags sus_rule sus_priority sus_score · GIST) · `survey_findings`(id = `f_{rule}_{pnu}` · rank priority score rule rule_nm pnu emd_cd jimok parcel_m2 yongdo nongup evid_m2 conf corroboration img_date evidence ai_ids lon lat · **state text default 'open'** · assignee planned_for reason updated_at updated_by · geom point) · `survey_finding_events`(finding_id · from_state to_state · by · reason · at · client_id unique) · `survey_timeline`(pnu · events jsonb · summary text[]) · `survey_runs`(job_id · rules jsonb · thresholds jsonb · counts jsonb · ms_by_emd jsonb · at) · `survey_rules`(id name condition thresholds jsonb basis 'estimate' counts) · 인덱스(emd_cd · rule · priority · state · score desc). RLS: 1차는 tenant `namwon` 고정 열 + realm 관문(다른 기관 0건).
- 적재 순서: `namwon-parcels.gpkg`(332,084) → `namwon-parcel-survey.gpkg` `parcels`(속성 병합) · `suspects`(20,872) → timeline json(6,818) → emd-summary(rules · totals 검증) → `survey_rules`. 끝에 **검증 스크립트**: 표 count가 README 표와 정확히 같으면 `findings-emd.json`(39행 · by_rule · by_priority · totals · as_of · provenance)을 쓴다 — 하나라도 다르면 쓰지 않고 실패.

### 2. 읽기 API `landxi_api/survey.py`(D2–D3 · v1.1-22 그대로)
- `GET /survey/findings`(필터 rule/priority/emd_cd/state/bbox/q · 정렬 · offset · `total` 봉투 · `counts` 상태별 · `by_rule`) · `GET /survey/findings/{id}`(+`explain` = `explain.py`: 규칙 조건 원문 · 근거면적 · 필지 대비 % · 신뢰도 · 보강근거 · 임계 `[추정 초기값]` · 대장 결손 `건축물대장 미대조` · README §6 해당 한계 note 1줄(R2면 "과다 추정 가능 · 2025 반증 시 감점") + `history[]`) · `GET /survey/parcels/{pnu}?with=` (대장 vs 현황 · 시점 2023/2025 · findings · history · 용도지역 미결합 19필지 결손 · 소유구분 `연속지적 미제공`) · `GET /survey/stats?by=emd|rule|priority|state` · `GET /survey/rules`. 모든 수치 봉투(`inferred`/`recorded`/`estimate`) · `as_of 2026-09-24` · `source` 파일명.
- 관문: realm tenant(namwon) · lx staff/admin · 게스트 401 · sales 읽기 OK. 응답 ≤ 200ms p95(findings 200행 · 인덱스) 실측.

### 3. 상태 쓰기 `POST /survey/findings/{id}/state`(D3)
- 상태기계 `open → assigned → inspected → closed` · `open|assigned → dismissed` · 역방향 409 `finding_state_invalid` · `client_id` 멱등 · `audit_log('finding.state')` · `survey_finding_events` 행 · **SSE**: `bus.tenant_event('namwon','finding.state',{id,pnu,rule,from,to,by,at})` + `ops_event('finding.state', …)`. lx staff는 `demo:true`처럼 `basis:'demo'` 꼬리표 + 별도 열(시연 쓰기는 24h 뒤 자동 원복 스크립트 · 정직 표기).

### 4. 대조 작업 어댑터 `adapters/survey/adapter_rules.py`(D4 · cpu · kind `survey`)
- `ADAPTER = {id:'survey/rules', pool:'cpu', kind:['survey'], plan(job) → [{shard_id:'emd-52190250', emd_cd, name}] × 39}` · shard 실행 = 해당 읍면동 필지를 PostGIS에서 규칙 R1–R6 SQL(`rules.py` · `server/survey/rules/*.yaml` 임계 · job.options.thresholds 오버라이드 허용)로 재평가 → `survey_runs` 기록 → `shard.done{n, classes:{R1..R6}, ms}` + `survey.finding`(상위 3 `{pnu, rule, priority, score}`) · `job.progress`(v1.1-9) · 39칸 뒤 `job.done{counts by rule}`. 기본 임계로 돌리면 결과가 정본 20,872와 **정확히 같아야 한다**(pytest). 읍면동 1칸 ≤ 2s [목표 · 실측 기록].
- `s6_replay_record.py`: 실제 작업 한 번을 SSE로 녹음 → `02. 데이터/survey/replay/survey-namwon.ndjson`(F2-A off 모드 정본 · `basis:'recorded'`).
- `adapter_join.py`(kind `join` · 2023 P4 × parcels 재결합)는 **뼈대 + 단위 테스트만**(전역 재결합은 2차 확산 · 결과 문서에 시간 추정).

### 5. 보고서 초안 `server/survey/report.py`(D5)
- `build_draft(emd_cd, rule=None, top=20, narrative=None) → dict|docx bytes`: 서식 `survey-emd` ① 개요(읍면동 · 필지 수 · 영상 `2023 25cm 항공 · 2025 드론(A02)` · 대장 `V-World 연속지적 2026-09-24` · 규칙 · 임계 `[추정 초기값]`) ② 집계표(규칙 × 등급 × 상태 · 봉투) ③ 의심 상위 N(pnu · 지번 · 지목 · 규칙 · 근거면적 · 신뢰도 · 상태) ④ 근거 영상 표기(AOI 안 4시점 · 밖 2시점) ⑤ 법적 근거 `[법령 확인 · 2차 RAG]` 결손 ⑥ 조치 제안(현장조사 대상 · **`AI 추론 · 검수 전 · 현장 확인 전 · 위법 판정 아님` 고정 문구**) · `narrative` 인자(F2-E가 LLM 단락을 넣음 · 각 문장 `[n]` 인용 검사 · 없으면 정형 문장). `GET /survey/reports/draft?emd_cd=&rule=&top=&format=json|docx` · python-docx · 표 Inter tabular 대신 서식은 기관 문서 표준(맑은 고딕 허용 · 종이 무대) · 파일명 `실태조사_초안_{읍면동}_{yyyymmdd}.docx` · 성명 열 0.

### 6. 테스트(D6)
- pytest: 적재 count 검증 · findings 필터/정렬/페이저 · explain 규칙별 6건 · parcels with=all · stats = emd-summary 값 · 상태기계 6 전이 · 멱등 · SSE 발행(가짜 bus) · 어댑터 기본 임계 = 정본 · docx 생성(python-docx 열어 표 행 수 = top).
- e2e `f2sapi-contract`(응답 봉투 규약 · 오류 3) · `f2sapi-guard`(게스트 401 · 타 기관 0 · 성명 열 0) · `f2sapi-state-sse`(POST → tenant 스트림 도착 ≤ 1s).

## 완료 기준(acceptance)
1. PostGIS 적재 count = README 표(332,084 · 20,872 · 6,818 · 39 · R1–R6 · A/B/C) — 검증 스크립트 통과 시에만 `findings-emd.json` 생성.
2. 읽기 API 5 + 상태 쓰기 1 + 초안 1 — 계약 v1.1-22 봉투·오류 코드 그대로 · p95 ≤ 200ms(findings 200행) 실측 표.
3. `kind:'survey'` 작업: 39 shard SSE · 기본 임계 결과 = 정본 · 녹음 `survey-namwon.ndjson` 제출 · 칸당 ms 실측.
4. `POST …/state` → audit_log · events 표 · tenant/ops SSE ≤ 1s(curl 원문 캡처).
5. docx 초안: 아영면 R1 상위 20 — 파일 열림 캡처 · 고정 문구 · 봉투 꼬리표 · 성명 0.
6. explain 정직성: R2에 "과다 추정 가능" note · R1·R6 오탐 요인 note · 건축물대장 미대조 · 임계 `[추정 초기값]` — README §6 대응표.
7. 게스트 401 · 타 기관 0 · 소유 밖 수정 0 · pytest/e2e 통과 · 결과 문서(수치 대조표 · 세 사용자 자기 점검 · F2-A/F2-E/F2-C에 주는 것 표).

## 판정용 동작 영상(≈ 40s · `shots/f2/S/f2s.mp4` · 터미널 + 브라우저 JSON 뷰 · F2-A 화면이 있으면 반화면)
| 초 | 무엇 |
|---|---|
| 0–8 | `s5_load_pg.py` 로그 → count 검증 통과 → `findings-emd.json` 생성 · psql `SELECT rule, count(*)` = README |
| 8–18 | `GET /survey/findings?rule=R1&priority=A&limit=5` · `/findings/f_R1_5219045021110530012`(explain 6줄 · 임계 꼬리표 · 결손) · `/parcels/5219045021110530012?with=facts,findings,history` |
| 18–28 | `POST /jobs kind:survey` → SSE 39 `shard.done` 터미널 스크롤(칸당 ms) → job.done counts = 정본 · (F2-A 반화면이면 스윕이 같은 시각 걷힘) |
| 28–34 | `POST …/state assigned` → 409 역방향 → tenant 스트림 curl에 `finding.state` 도착 |
| 34–40 | `GET /survey/reports/draft?emd_cd=52190450&rule=R1&format=docx` → Word로 열린 초안(표 · 고정 문구) |

## 계약 · 요청
- 구현 = v1.1-22 전부 · v1.1-9(어댑터 progress) · v1.1-16(finding.state 발행) · v1.1-26(report.py를 F2-E가 import).
- F2-B에 요청: `plan()` 훅 · tenant_event 헬퍼(D0 약속) · `survey_parcels` 표 이름 고정(v1.1-21 결합).
- F2-A에 준다: `findings-emd.json` · `survey-namwon.ndjson` · 응답 예시 JSON 6개(`server/fixtures/contract/survey-*.json` — F2-B 소유 폴더이므로 `server/survey/fixtures/`에 두고 결과 문서에 경로).
- 2차 확산으로 미룸(정직 표기): 현장조사 모바일 · 건축HUB · 규칙 편집기 · 재교정 · 정밀도 보드 · 전역 재결합 join.
