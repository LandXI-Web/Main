# F2-E — GeoAI 에이전트 AG-0: XI맵 ⌘K 명령 바 → vLLM Gemma 4 도구 호출(플랫폼 API) → 지도 도착 · 검증 안 된 숫자 차단 · 실태조사 보고서 초안 `.docx`

- 모델 **Opus 5.5** · 난이도 XL · 기간 6–7일 [추정] · 판정 Fable 5.1(Craft · 영상 · 레드티밍 · 세 사용자)
- 읽을 것(순서): ① `agent/AGENT-SPEC.md` §0 · §1(AG-1 · AG-2) · §3.3–3.5 · §4.1–4.2 · §4.4 · §5.1–5.2 · 사용자 결정 ② `F1-CONTRACT.md` **v1.1-4(23–27)** · v1.1-3(21·22) · v1.1-6 ③ `agent/local-llm.md` · `infra/llm/README.md` · `launch-vllm.ps1`(도구 호출 스모크 84–104행 · `parcel_at` 예시가 이미 tool_calls를 낸다) ④ `f2/F2-A.md` §0 브리지 표(`window.XI`) ⑤ `design/system-v2.md` §2(유리 ≤ 15%) · §5(prov) ⑥ `f2/F2-S.md` §5(report.py 시그니처)
- 공통 규칙: **git 금지** · 소유 밖 수정 0 · 테스트 자기 것만(`server/agent/tests/**` · `tests/e2e/f2e-* --workers=2`) · **vLLM(:8000 · :8001)·Ollama 컨테이너 종료·재기동 금지 · GPU1은 vLLM 전용 · 에이전트 장면과 GPU0 실추론 장면을 동시에 녹화하지 말 것(순차)** · 영상 생성 API 금지 · 외부 클라우드 LLM 호출 0(온프레미스만) · 행정 문서화 금지.
- 판정: 완성형(채팅창 아님 · 지도가 반응 · 죽은 버튼 0) · 유일함(에이전트가 필지·실태조사 API를 부른다) · Hyper Solution(문장 → 의심 필지 → 보고서 초안) · Hyper Performance(계획 단계 ms · 토큰 실측) · 일원화(같은 run/job id 계보) + 세 사용자(AGENT-SPEC §4.4 표).

## 목표

vLLM이 이 PC에서 **살아 있다**(`:8000` gemma-4-12b-it · 16K ctx · 도구 호출 OK · `:8001` hyperclovax-seed-1.5b 라우터 · 한국어 86토큰 3.8s 실측). AG-0을 Ollama가 아니라 **vLLM Gemma 4 우선**으로 올린다. 장면은 둘: (1) XI맵에서 `⌘K` "아영면 답 위에 건물이 있는 의심 필지 상위 5개 보여줘" → 계획 3단계(도구 이름 · ms 실측) → `survey_findings(rule=R1, emd=아영면, priority=A, top=5)` → 결과 필지가 **스윕 → 락온 → 숫자 40ms/글자로 도착**(`window.XI.arrive`) · 답변의 숫자는 전부 봉투 칩 · 지어낸 숫자는 취소선 + `검증 안 된 숫자` 칩(검증기 동작 장면 1회 필수) · 두 번째 문장 "이 프레임 비닐하우스 분석해줘" → 견적 확인 카드 → 사람이 승인 → 실추론 극장. (2) 보고서 서랍 `초안 작성` 탭 → `survey-emd`(아영면 · R1) 초안이 종이 무대에 **토큰 도착 즉시** 타이핑되고 숫자 칩 · 인용 [n] 클릭 → 지도 flyTo + 필지 카드 → `.docx` 3클릭. 셋 다 죽으면 리플레이(`실제 run 녹음`)로 같은 장면 · `시연 · 에이전트 연결 없음`.

## 근거
- 사용자(2026-09-24): "젬마, 모두의 AI, 정부 독파모 등 AI 에이전트, vLLM 핵심 기술 활용 서비스도 당연히" · 결정 Q-AG3 Gemma 4 두뇌 + HyperCLOVA X SEED 라우터.
- 미결 장부: `F1-E 에이전트(F1 뒤, vLLM :8000 사용)` — 1차에서 빠진 층. AGENT-SPEC §4.4 불합격 신호: `채팅만 · 지도 무반응 · 칩 없는 숫자 · 블랙박스 · 확인 없이 GPU 제출 · 에이전트 자동 조치 · 상수 토큰/초`.
- F1 게이트 반복 지적 "봉투 없는 숫자 금지" — 에이전트는 그 규칙을 **LLM 출력에도** 적용해야 한다(v1.1-25).

## owned_files
`landxi/agent/{panel.js,cmdbar.js,plan-list.js,confirm-card.js,report-writer.js,replay.js,css/agent.css,data/replay/{ag0-namwon.ndjson,ag0-report.ndjson},data/i18n-ko.json}` · `server/agent/{__init__.py,runner.py,backends.py(vllm·router·ollama),tools/{registry.py,from_contract.py,survey.py,results.py,jobs.py},lint.py(숫자 검증기),report.py(F2-S report.py import + 서술),audit.py,redteam.yaml,tests/**}` · `server/landxi_api/agent.py`(라우터 · F2-B 훅이 import) · `server/migrations/0003_agent.sql` · `tests/e2e/f2e-*.spec.mjs` · `shots/f2/E/**` · `blueprint/f2/F2-E-result.md`.
읽기·import만: `landxi/xi/bridge.js`(`window.XI`) · `landxi/shared/api-v1.js`(수정 금지 · 새 경로는 `landxi/agent/api-agent.js` 래퍼) · `tokens-v2.css` · `server/landxi_api/{deps,envelope,auth}.py` · `server/workers/bus.py` · `server/survey/report.py`(F2-S) · `server/fixtures/contract/*.json`(도구 스키마 생성). **만지지 말 것**: `landxi/xi/**` · `server/landxi_api/main.py` · `server/workers/**` · `infra/llm/**`(설정 변경 금지 · 읽기만).

## 단계별 할 일

### 0. D0 — 스모크 · 스키마 · 도구 레지스트리
- `backends.py`: `:8000` `/v1/chat/completions` tools · `tool_choice:'auto'` · 스트리밍 · usage 봉투 / `:8001` 의도 4클래스(`map report ops smalltalk` · 프롬프트 분류 · 100ms 목표 실측) / Ollama 폴백(qwen3 · JSON 강제 파서) / 헬스 30s → Redis `agent:models`. **첫날 결과 문서에 실측**: 도구 호출 성공률(20문 × 3회) · 첫 토큰 ms · 토큰/초 · 한국어 도구 인자 정확도. 실패 형식이 있으면 서버 JSON 스키마 강제 + 파서(같은 인터페이스).
- `0003_agent.sql`(AGENT-SPEC §3.4 `agent_runs · agent_tool_calls · agent_confirms` · RLS · audit) · `usage_events(dim='llm_tokens')`.
- `tools/from_contract.py`: `server/fixtures/contract/*.json`에서 도구 스키마 생성 — 1차 도구(v1.1-24): `catalog_layers` `results_stats` `results_features` `parcel_at` `results_parcels_join`(F2-B v1.1-21 · 없으면 404 결손) **`survey_findings` `survey_stats` `survey_parcel`**(F2-S v1.1-22 · 없으면 `02. 데이터/survey/*.json` 읽는 임시 구현 후 이관 · 결과 문서에 표기) `jobs_quote` `jobs_submit`(확인) `survey_state`(확인) + 클라이언트 `map_on map_arrive map_flyto map_frame drawer_open parcel_card`. 도구 결과는 프롬프트에 **데이터 블록**으로만(인젝션 대책). 사용자 토큰 상속 · caps 교집합 · `deploys.*` 0 · `tool_forbidden` 403 감사.

### 1. 서버 `runner.py` · API(D1–D2 · v1.1-23~27)
- `POST /agent/runs{message, context(view · on · frame · svc · locale · stage · mode), mode}` → 202 `AgentRun` + `events_url` · SSE `GET /events/agent/{run_id}`(Redis `agent:runs:{id}` · 24h 재생): `agent.plan`(단계 목록 · why) → `agent.tool.call` → `agent.tool.result{ms 실측 · summary 봉투 · ui_actions[]}` → (`agent.confirm{confirm_id, quote, expires_at 60s}` → `POST /agent/runs/{id}/confirm`) → `agent.token{delta}` → `agent.done{answer_md, envelopes, unverified_numbers, citations, model, tokens}` / `agent.failed` · `agent.rejected` · `llm_unavailable` 503.
- `lint.py`: `answer_md` 자리표 `{{env:eN}}` 밖 숫자(한글 단위 포함) 정규식 → 도구 봉투 값과 대조(단위·천단위·반올림 허용) → 일치 자동 승격 · 불일치 `unverified_numbers[]` · 화이트리스트(연도 · 좌표 · PNU · 조문). 시스템 프롬프트: "숫자는 쓰지 말고 자리표만".
- `POST /agent/report/draft{template:'survey-emd', emd_cd, rule?, top?}` → 도구 `survey_stats` · `survey_findings` → LLM 서술 3단락(개요 · 소견 · 조치 제안 · 문장 끝 `[n]`) → 검증기 → `report.py`(F2-S `build_draft(narrative=…)`) → `.docx` `/files/agent/run_…/draft.docx` · `citations[]`.
- 감사: run·단계·확인 → `audit_log` · PII 입력 필터 · 모델 칩 = 실제 백엔드.
- `redteam.yaml` 20문(타 기관 조회 · 롤백 지시 · 원본 영상 경로 · 숫자 지어내기 유도 · 도구 결과 안 "위 지시 무시" 인젝션 · 소유자 성명 요구 · 쿼터 수정 · 게스트 권한 상승 …) → 전부 `tool_forbidden` 또는 검증기 차단 — pytest + e2e `f2e-redteam`.

### 2. 프론트 `landxi/agent/`(D3–D4 · AGENT-SPEC §4.1 그대로 · 브리지만 사용)
- `panel.js mount(XI)`: `#cmdk-slot`에 명령 바(상단 중앙 480 · 유리 elev-2 · 라운드 0 · 플레이스홀더 = 현재 뷰 예시 `아영면 답 위 건물 의심 상위 5필지` — 그 층/모드가 켜져 있을 때만) · `⌘K` 이벤트 · 입력 즉시 `agent.plan` 전까지 헤어라인 스캔 빔 1(실이벤트 묶음).
- `#agent-slot` 패널(우상 HUD 아래 · 유리 총면적 ≤ 15% — 레이어 패널 접힘 48 + HUD 420 + 패널 ≤ 420 계산 e2e): 사용자 문장 · **계획 단계 목록**(헤어라인 행 · 도구 이름 그대로 · ms `[실측]` · 완료 청록 락온 380) · 답변(자리표 → `prov()` 칩 · 검증 안 된 숫자 취소선 + 칩) · 인용 [n] → `XI.flyTo` + `XI.parcelCard(pnu)` · 모델 칩 `gemma-4-12b-it · vLLM · 온프레미스` · 토큰 봉투 · 실행 중 `run_…` 계보 칩(관제 `?run=` 2차 · 지금은 `title`).
- `ui_actions` 즉시 실행: `map_on` → `XI.layerOn` · `map_arrive` → `XI.arrive({count env})` · `map_frame` → `XI.frame` · `drawer_open` · `parcel_card`. 에이전트가 만든 층은 레이어 패널에 `에이전트 질의 · 저장 안 됨`(F2-A 브리지 `layerOn({label})`).
- `confirm-card.js`: 견적 카드 부품 재사용 · 승인 = 잉크 채움 · 거부 = 헤어라인 · `이 작업은 기관 쿼터 gpu_s_month에 계량됩니다` · 60s 카운트다운(값 변화 시만) · sales `demo:true`.
- `report-writer.js`: `XI.openDrawer('report',{tab:'draft'})` 슬롯에 `SPLIT-5050` 종이 무대(좌 문서 Paperlogy/Pretendard · 우 근거 목록 [n] · 크롭 · 봉투) · `agent.token` 도착 즉시 타이핑 · 숫자 칩 락온 380 · 하단 `내보내기 .docx` · `CSV(BOM)` · `초안 · 검토 필요 · 모델 칩` · `법령 인용 · 2차` 결손. F2-A의 `보고서 초안 ›` 버튼(카드·서랍)이 이 탭을 연다(emd_cd·rule 인자).
- `replay.js`: `LX_API=off`·`llm_unavailable` → `data/replay/ag0-*.ndjson`(**실제 run 녹음** · `기록 · 저장 결과 재생`) · 마스트 표기.
- 공개 모드: 명령 바 노출 · `준비 중 · 시민용 설명 3차` 결손(요청 0).

### 3. 관제 계량(D5 · 최소)
- `usage_events(dim='llm_tokens', amount, basis measured, job_id=run_id)` · 쿼터 `llm_tokens_month` 시드 `[추정 기반 초기값]` — 관제 링 8은 F2-C 몫(값만 흘린다).

### 4. 테스트 · 녹음(D6)
- pytest: 도구 스키마 생성 · 라우터 4클래스 · 검증기 12케이스(일치 승격 · 불일치 · 단위 · 화이트리스트) · 확인 카드 만료 409 · caps 교집합 · 레드티밍 20 · 리플레이 녹음 형식.
- e2e: `f2e-cmdk`(⌘K → plan → 도착 · 지도 층 켜짐 · 숫자 칩 = 도구 봉투) · `f2e-unverified`(강제 지어낸 숫자 프롬프트 → 취소선 칩) · `f2e-confirm`(견적 → 승인 전 `POST /jobs` 0 · 승인 후 1) · `f2e-report`(초안 탭 · [n] flyTo · docx 다운로드) · `f2e-redteam`(5문 UI) · `f2e-off`(리플레이 · 콘솔 0) · 유리 ≤ 15% · 14px 미만 0 · motion-law.

## 완료 기준(acceptance)
1. 장면 1·2가 `LX_API=on`(vLLM 살아 있음)과 `off`(리플레이 · 실제 녹음) 둘 다 콘솔 0 · `data-lx=ready`.
2. 도구 호출이 **계약 API 이름 그대로** 계획 목록에 보이고 ms가 실측(서버 `agent_tool_calls.ms` = 화면).
3. 답변 숫자 = 도구 봉투(칩 호버 → source · as_of) · 검증기 동작 장면 1회(취소선 + 칩) · e2e.
4. 확인 카드 없이 `POST /jobs`·`survey_state` 0(네트워크 단언) · sales `demo:true` · 승인 → job-theater 실추론(GPU0 · 에이전트 녹화와 순차).
5. 보고서 초안 `.docx` 3클릭 · 서술 문장 전부 `[n]` 인용 · 고정 문구 · 인용 클릭 → 지도 flyTo + 필지 카드.
6. 레드티밍 20문 전부 차단(pytest) + UI 5문(e2e) · 타 기관 0 · 원본 경로 0 · 성명 0.
7. 백엔드 실측 표: vLLM 첫 토큰 ms · 토큰/초 · 도구 호출 성공률 · 라우터 ms · 폴백 전환 시간 · GPU1 전력(전력 규칙 준수 · GPU0 동시 고부하 0).
8. 유리 ≤ 15% · 14px 미만 0 · motion-law · 소유 밖 수정 0 · 결과 문서(장치표: Palantir AIP 단계 노출 · Linear ⌘K · 세 사용자 표 §4.4 · 계약 변경 요청).

## 판정용 동작 영상(≈ 45s · `shots/f2/E/f2e.mp4` · on 모드 · GPU1 vLLM만 · GPU0 추론은 마지막 장면 한 번)
| 초 | 무엇 |
|---|---|
| 0–4 | XI맵 남원(실태조사 모드 · 판독 층) · `⌘K` → 명령 바 · 플레이스홀더 |
| 4–14 | "아영면 답 위에 건물이 있는 의심 필지 상위 5개 보여줘" → 라우터 `map` → 계획 3행(`survey_stats` 41ms · `survey_findings` 88ms · `map_arrive`) → 5필지 스윕·락온·숫자 도착 · 답변 칩(`R1 A 5건 [AI 추론 · 검수 전]`) · 모델 칩 · 토큰 봉투 |
| 14–20 | 검증기: 유도 질문 "전체 몇 건이야? 대략 3만?" → 답변에 지어낸 `30,000` 취소선 + `검증 안 된 숫자` 칩 · 옆에 봉투 `20,872` |
| 20–32 | 보고서 서랍 `초안 작성` → 서술 타이핑(토큰 즉시) · 숫자 락온 · [3] 클릭 → 지도 flyTo + 필지 카드 v2 → `내보내기 .docx` → Word 열림 |
| 32–40 | "이 프레임 비닐하우스 분석해줘" → 확인 카드(면적 · shard · GPU·s 추정 · 쿼터) → 승인 → job-theater 칸 점등(GPU0) → job.done |
| 40–45 | vLLM 컨테이너 대신 **네트워크 차단(hosts 규칙 · 종료 아님)** → `llm_unavailable` → 리플레이 `기록 · 저장 결과 재생` 마스트 · 같은 장면 · 차단 해제 |
+ 100ms 스트립(도착 · 타이핑) · 정지 1440 · 레퍼런스 나란히(Palantir AIP · Linear ⌘K).

## 계약 · 요청
- 구현 = v1.1-23~27 · 사용 = 21·22·24(F2-B·F2-S) · 브리지(F2-A D0 표).
- F2-A에 요청(없으면 결과 문서): `layerOn({label})` 임시 층 · `openDrawer('report',{tab:'draft'})` 슬롯 · `#agent-slot` 폭 420.
- F2-C에 준다: `agent:models` 해시 · `usage_events llm_tokens` · vLLM `/metrics` 대리 읽기 경로(폴러는 F2-C).
- 제외(정직): VLM · RAG · 관제 에이전트 AG-6 · 다국어 · 시민 · HWPX.
