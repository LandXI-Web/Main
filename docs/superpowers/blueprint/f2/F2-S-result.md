# F2-S 결과 — 실태조사 백엔드(남원 실데이터 PostGIS · `/api/v1/survey/*` · 상태 쓰기 · 대조 작업 어댑터 · docx 초안)

- 작성 2026-09-27 03:00 · Opus 5.5 · GPU 사용 0 · git 조작 0 · 소유 밖 코드 수정 0
- 판정 영상 `shots/f2/S/f2s.mp4`(44.6 s · 1440×900 · h264) · 100 ms 프레임 446장 → `shots/f2/S/strip/sheet_01..05.jpg`(10×10) · 스크린샷 `01-verify` … `07-word.png` · Word 캡처 `word-open*.png` · API 실측 `bench-api.json`. 요청 경로 사본: `shots/f2/F2-S/`.

## 1. 완료 기준 대조표

| # | 기준 | 결과 | 증거 |
|---|---|---|---|
| 1 | s5 멱등 적재 count = README 표 → 통과 시에만 findings-emd.json | **통과(23/23 항목 OK)** — 332,084 · 749.25 km² · 20,872 / 20,852 · 6,818 · 39 · R1 4,140 R2 15,651 R3 20 R4 33 R5 464 R6 564 · A 1,053 B 7,386 C 12,433 · 규칙×등급 6행 · 읍면동 39행 불일치 0 | `_logs/f2s-s5-load.log`(전체 92.4 s) · 영상 0–3 s(`--verify` 0.66 s) · psql 카운트 |
| 2 | 읽기 API 5 · 봉투 · 오류 코드 · p95 ≤ 200 ms · 게스트 401 · 타 기관 0 · 성명 0 | **통과** — findings 200행 서버 p95 **93–101 ms**(4 형태 × 100회) · 단건+explain 14 ms · parcels with=all 13 ms · stats?by=emd 49 ms | `bench-api.json` · pytest `test_p95_findings_200_rows` · e2e `f2sapi-contract/guard` |
| 3 | 상태기계 → audit_log · events 표 · tenant/ops SSE ≤ 1 s | **통과** — 6 전이 · 역방향/건너뛰기 409 `finding_state_invalid` · client_id 멱등(같은 키 재전송 = `idempotent:true`, 다른 finding에 재사용 = 409) · POST→기관 스트림 도착 **17 ms**(e2e) · 영상 curl 원문 수신 | `f2sapi-state-sse` · `06-state-sse.png` |
| 4 | kind:'survey' cpu 어댑터 39 shard · 기본 임계 = 정본 · 녹음 · 칸당 ms | **통과** — POST /jobs → 39 `shard.done{n, classes R1..R6, ms}` + 39 `survey.finding`(상위 3) + `job.progress` → `job.done counts` = 정본, `survey.canon.equal:true` · 칸당 중앙값 **46–48 ms**, 최대 139 ms(목표 ≤ 2 s) · 작업 벽시계 5.3–6.0 s(큐 한가할 때) | `05-job-done.png` · `02. 데이터/survey/replay/survey-namwon.ndjson`(127줄 · basis recorded) |
| 5 | report.build_draft → survey-emd docx · GET …/draft?format=json\|docx · Word 열림 | **통과** — 아영면 R1 상위 20(표 21행) · ①–⑥ · 고정 문구 · 꼬리표 · `[법령 확인 · 2차 RAG]` · 성명 열 0 · 실제 Microsoft Word 2016 창 캡처 | `실태조사_초안_아영면_20260927.docx` · `word-open.png` · `07-word.png` |
| 6 | explain 정직성 | **통과** — 규칙별 6줄 · 임계 전부 `basis:estimate` + `[추정 초기값]` · 대장 결손 `건축물대장 미대조`(+규칙별 허가 대장) · R2 "과다 추정 가능 · 2025 반증 시 감점" · R1/R6 "오탐 요인" · R3 "과소 추정" · 점수 분해 재계산 = 정본 점수 | `03-explain.png` · pytest `test_explain_honesty_each_rule` |
| 7 | pytest / e2e | **pytest 25 passed** · **e2e 7 passed**(workers 2) | 아래 §5 |

**정본 재현(규칙 SQL 재평가)**: 기본 임계 전역 재평가 = 정본 20,872 (rule, pnu) 집합 **완전 일치** · 점수 20,872/20,872 **소수 1자리까지 일치**.
원인·조치: gpkg 는 면적을 0.1 ㎡ 로 반올림 저장 → 임계 경계(32.96 → 33.0)에서 R1 +2 · R6 +2, R3 는 `a25_gh_in_m2` 열이 gpkg 에 없어 −9 가 났다. s5 가 `s3_survey.py` 와 같은 교차 계산(2023 AI 129,420 · A02 3,772, CPU 33 s)으로 원값을 되살려 싣고, 재계산값을 반올림하면 gpkg 저장값과 10개 열 모두 불일치 0 임을 검사한 뒤에만 적재한다.

## 2. 만든 것(전부 소유 경로 · 신규)

| 파일 | 내용 |
|---|---|
| `server/migrations/0002_survey.sql` | survey_parcels(원값 · GIST) · survey_findings(state · demo · point) · survey_finding_events(client_id unique) · survey_timeline · survey_emd(39 · bbox) · survey_rules · survey_runs · survey_meta · RLS(tenant namwon 열 + realm lx) — **정책의 current_setting 을 스칼라 부분질의(InitPlan)로 감쌈**: 행마다 평가하던 원형은 계획기가 인덱스를 못 써 200행 조회 23 ms → 0.2 ms · 탭 카운트용 커버링 인덱스(index-only) |
| `server/survey/{db,rules,explain,report}.py` · `rules/R1..R6.yaml` | 정본 수치·경로 · YAML → SQL(점수식 포함) · 봉투 응답 모양·explain·점수 분해 · docx 초안(python-docx · 맑은 고딕 · 인용 검사) |
| `server/survey/pipelines/s5_load_pg.py` | 마이그레이션 → 원값 재계산 → COPY(332,084 · 31 s) → findings **upsert(상태 보존)** → 검증 → findings-emd.json. 총 92 s · `--verify` 0.7 s |
| `…/s6_replay_record.py` | 실제 작업 1회 SSE 녹음(발행 시각 기준 t · 단조) · 정본과 다르면 파일 안 씀 |
| `…/s7_fixtures_bench.py` · `…/dev_state.py` | 계약 응답 예시 6개(실제 응답 저장) + 지연 실측 · 시험 표본 고르기/원복 |
| `server/landxi_api/survey.py` | 읽기 5 + 상태 쓰기 + 초안 · 오류 `registry_unavailable 404` `finding_state_invalid 409` `conflict 409` · lx staff 쓰기 = `basis:'demo'` + 24h 자동 원복(10분 주기 지연 실행 · 원복도 이벤트로 남김) · SSE `events:tenant:{t}` + `ops:events` |
| `server/adapters/survey/adapter_rules.py` | `ADAPTER{id survey/rules · kinds [survey] · cpu}` · 모듈 `plan(job)`(39칸 · options.emd_cd/rules/thresholds) · `run_shard` → metrics.classes · metrics.events(survey.finding) · `finalize(job)` → counts + canon + 칸당 ms |
| `server/adapters/survey/adapter_join.py` | kind join 뼈대(hidden · 쓰기 없음) — 읍면동 PostGIS 재교차 → 적재값 대조. 천거동 333필지 대조 오차 < 1 ㎡(pytest). 전역 재결합(적재값 교체)은 2차 — 추정 39칸 × 칸당 수 초~수십 초 [추정] |
| `server/survey/devapp.py` · `sse_fallback.py` | :8705 개발 게이트웨이(= landxi_api.main 앱 그대로 + 최신 survey.py · 관제 경보 루프 제외) · /events/tenant 대체(F2-B 것이 있으면 안 붙음 — 현재 F2-B 것이 붙어 있음) |
| `server/survey/fixtures/survey-*.json` | findings · finding · parcel · stats-emd · rules · report-draft(실응답) |
| `02. 데이터/survey/findings-emd.json` · `replay/survey-namwon.ndjson` | 검증 통과본 39행 · 실제 실행 녹음 |
| `tests/e2e/f2sapi-{contract,guard,state-sse}.spec.mjs` · `server/survey/tests/*` | §5 |
| `shots/f2/S/{console.html,term_server.py,record.mjs,word-capture.ps1}` | 판정 영상 장치 — 터미널 출력은 실제 명령(curl.exe · python · docker psql · powershell) stdout 중계. 'loadlog' 한 칸만 92 s 전체 적재의 **기록 로그**(화면에 `기록` 표기) |

## 3. API 실측(서버 X-LX-Time-ms · 100회 · :8705 · DEV 봉투 검사 켠 상태)

| 경로 | p50 | p95 | 크기 |
|---|---|---|---|
| findings 200행(전체 · score) | 60.2 | 97.9 ms | 356 KB |
| findings 200행(R1·A) | 56.5 | 94.6 | 356 KB |
| findings 200행(읍면동 · evid_m2) | 58.2 | 96.0 | 346 KB |
| findings 200행(open · R2 · offset 400) | 62.8 | 100.4 | 349 KB |
| findings/{id} + explain + history | 12.4 | 14.0 | 9 KB |
| parcels/{pnu}?with=facts,findings,history | 11.5 | 13.1 | 14 KB |
| stats?by=emd | 46.9 | 49.0 | 182 KB |
| stats?by=rule · rules | 17.9 · 9.6 | 19.6 · 11.0 | |

200행 지연의 대부분은 직렬화(항목당 봉투 7개 · DEV 봉투 검사). SQL 은 0.2–6 ms.

## 4. 세 사용자 자기 점검
- **공무원**: "아영면 R1 A 5건 → 왜 걸렸는지 6줄(근거 53% · 신뢰도 0.97 · 임계 추정 · 건축물대장 미대조) → 배정(담당·예정일) → 그 자리에서 Word 초안" — 판독에서 보고까지 한 id(`f_R1_…`)로 닫힌다. 남는 것: 건축물대장 실대조(키 대기) 전이라 R1 상위는 축사·창고 오탐 가능 — 문서가 그렇게 말한다.
- **시민**: 게스트는 실태조사 라우트 0(401) · 소유자 성명 없음 — 필지 의심 목록이 공개되지 않는다(정당). 시민 행동(신고)은 F2-A/피드백 영역.
- **LX 직원**: 39칸 대조가 6초, 칸당 50 ms 실측 · 임계 오버라이드로 재평가(예 R1 100 ㎡ → 건수 감소) · 쓰기는 `demo` 꼬리표 + 24h 원복 — 시연이 기관 데이터를 더럽히지 않는다.

## 5. 테스트
- `cd server && python -m pytest survey/tests -q` → **25 passed / 16 s**(적재 count · findings-emd.json · 성명 열 0 · SQL 재평가 = 정본(집합·점수) · 임계 오버라이드 · 공통 임계 잠금 · 어댑터 39칸 합 = 정본 + finalize canon · join 뼈대 · 게스트 401 · 타 기관 0 · 필터/정렬/페이저 · 봉투 전수 · explain 6규칙 · 이력/필지 · stats = 요약 json · rules · p95 · 6 전이+409 · 멱등 · 쓰기 관문 · SSE tenant/ops 발행 · 가짜 bus · docx 행 수 = top · 인용 검사 · docx API)
- `LX_SURVEY_API=http://127.0.0.1:8705 npx playwright test tests/e2e/f2sapi-*.spec.mjs --workers=2` → **7 passed / 3.5 s**(기본 대상 :8700 · `LX_API=on`). 시험이 바꾼 상태는 끝나면 원복.

## 6. 정직 표기 · 남은 것
- **:8700 에는 02:28 시점 survey.py 가 올라가 있다**(F2-B 가 확장 훅을 넣고 재기동한 시각). 그 뒤 고친 것(탭 카운트 단일 집계 · KST 시각 · stats 가속 · RLS InitPlan 은 DB 쪽이라 이미 반영)은 :8700 재기동(통합 단계) 때 들어간다. 영상·실측은 같은 앱을 띄운 :8705 로 했고 화면 하단에 적었다.
- 영상의 F2-A 반화면 스윕: 녹화 시점 XI맵 실태조사 모드가 `시연 · 저장 결과 재생`(서버 작업 미제출)이라 넣지 않았다. 대신 콘솔 오른쪽 39 읍면동 지도가 **같은 SSE 의 shard.done 으로만** 칸을 채운다.
- 단일 cpu 워커 head-of-line: 녹화 1차에서 F2-D index 작업(PC 원격 28 s)이 앞에 있어 survey 39칸이 29 s 걸렸다(칸 처리 자체는 48 ms). → F2-B 요청 ①.
- 녹화 표본 `f_R1_5219025032112290003` 은 끝나고 open 으로 원복(현재 전 20,872건 open · 이벤트 0).
- 이 PC Word 는 '제품 인증 실패' 안내 창을 띄운다 — 캡처 스크립트가 닫고 찍는다(문서와 무관). 캡처 때 강제 종료로 생긴 Word 복구 목록(HKCU Resiliency · 우리 docx 2건)은 지웠다.
- 2차로 미룸: 현장조사 모바일 · 건축HUB 대조 · 규칙 편집기 · 재교정 · 정밀도 보드 · 전역 재결합 join · 법령 RAG.

## 7. 다른 에픽에 주는 것 / 요청
| 받는 쪽 | 무엇 |
|---|---|
| F2-A | `findings-emd.json` · `replay/survey-namwon.ndjson`(recorded · 127줄) · `server/survey/fixtures/survey-*.json` · 상태 쓰기 응답 `{…Finding, event{from,to,at,basis}, allowed_next}` · 목록 `counts`(state 필터 제외) · `by_rule`(rule 필터 제외) = 탭 숫자 그대로 |
| F2-E | `from survey.report import build_draft` — `build_draft(emd_cd, rule, top, narrative, fmt='dict'|'docx', realm, tenant)` · narrative = `{overview|findings|actions: [문장 … [n]]}` · 인용 번호 = 반환 `citations[].n` · 불통과 시 정형 문장 + `narrative_rejected[]` · 에이전트 도구는 읽기 5 그대로 |
| F2-C | ops 스트림 `finding.state{id,pnu,rule,priority,emd_cd,from,to,by,realm,lnglat,basis,at}` |
| F2-B | 표 이름 `survey_parcels`(v1.1-21 · 열은 원값 double) · 모델 행 `survey/rules`(task index · 작업 FK용). **요청 ①** cpu 풀 두 번째 워커 또는 kind별 레인(index 원격 shard 가 survey 를 막음) **②** :8700 재기동 시 최신 survey.py 반영 **③** `deps.ERROR_STATUS` 에 `finding_state_invalid 409 · registry_unavailable 404` 추가(지금은 호출부에서 status 지정) |
