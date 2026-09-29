브리핑 확인: (1) 숫자는 도구 결과에서만 쓰고, 같은 이름의 숫자는 모든 화면에서 같은 값이다 (2) 확인은 로그인 폼으로만 한다. GPU 는 한 장씩 쓰고 vLLM·Ollama 는 종료하지 않는다 (3) 개발 정보(API 이름·파일 경로·작업 번호·좌표)와 지어낸 용어(관제·AG-n 등)를 화면에 내지 않는다

# C2 vLLM 기반 GeoAI 서비스 — ② 기획 (2026-09-30)

- 입력: `assess.md`(① 평가, 32문 · 5계정), `CORE.md` C2, `AGENT-SPEC.md` §1·§3, `USER-DIRECTIVES.md`, `PROCESS.md`
- **목표 한 줄:** 기관·LX 직원·LX 관리자·해외 기관이 **말 한마디로** 지도를 움직이고, 분석을 돌리고, 올린 대장과 AI 결과를 겹쳐 보고, 근거(실제 지역·조문·영상)가 달린 보고서를 받는다. 모든 숫자는 도구 결과 한 출처에서 나온다.
- 이번 차수 범위: C2 ①–⑨ 백본 + 지난 차수 잔여 6건. 디자인은 **기능이 보이는 최소 UI**다. 모양은 Fable 이 나중에 바꾼다.

## 1. 흐름 (역할별 — 명령줄 단계 0)
| 역할 | 말 한마디 → 화면에서 끝나는 흐름 |
|---|---|
| 기관 담당자(남원·광주전남) | 첫 화면 → 대장 올리기 → "의심 필지 몇 건?" → 숫자 + 지도 채색 → "읍면동별 차트로" → 막대 차트 → "이 필지 영상 설명해 줘" → 영상 조각 + 의견 → "운봉읍 보고서 초안" → .docx 내려받기(법령 조문 인용 포함) |
| LX 직원(XI맵) | "구례군 보여 줘"(결과가 없어도 이동) → "영상 켜 줘 / 확대 / 3D 로" → "구례군 전역 분석 실행해 줘" → 확인 카드 → 대기열 → 결과가 읍면동 이름과 함께 차오름 → "실태조사 결과 만들어 줘" → 확인 카드 |
| 해외 기관(kgz-agri) | 영어 질문 → 영어 답 + 해외 결과(NDVI·시즌) 수치·지도 이동 |
| LX 관리자 | LX 관리자 대시보드에서 Ctrl K → "GPU 와 대기열 상태 알려 줘" · "경보 요약" · "기관별 AI 도우미 사용량" → 숫자 칩 답. 기관 사용량 표에 AI 도우미 사용량(토큰) 줄. 법령 원문 올리기·색인 버튼. 언어 모델 상태·승격 자리(연결 전) |

## 2. 작업 7개 (파일 소유 겹침 0)
| id | 작업 | 소유(요지 — 전체는 각 브리프) | 먼저 풀 평가 항목 |
|---|---|---|---|
| **c2-core** | 에이전트 공통 뼈대: 도구 확장 자리, 지어낸 동작 차단, 자리표·꼬리 정리, 언어 따라 답하기, 명령 바 블록(차트·파일·영상), 승격 설정 | `server/agent/{runner,config,lint,backends}.py` · `tools/{registry,from_contract}.py` · `tools/__init__.py` · `tools/ext/__init__.py`(신규) · `landxi_api/agent.py` · `landxi_api/main.py` · `landxi/v3/kit/{cmdk.js,cmdk.css,chart.js,i18n.js,i18n/*}` | ① 지어낸 동작 · `{{unv}}` · ⑦ 언어 · ⑧ 관제/AG-6 문구 · ⑨ 승격 설정 |
| **c2-xi** | XI맵: 말로 지도 제어·분석 실행 + 영상 층 전 등록 시군구 + 보고서 서랍 기본값 | `landxi/v3/xi-clean/*` · `server/agent/tools/ext/map.py`·`ext/analyze.py`(신규) · `landxi_api/tiles.py` · `landxi_api/catalog.py` · `server/agent/tools/jobs.py` | ①② · 잔여: 영상 층 · 인용 [1] 운봉읍 기본값 |
| **c2-fusion** | 첫 화면 대장 필터 가로채기 해소 + 행정데이터 융합 질의 | `landxi/v3/gov-fusion/*` · `server/agent/tools/ledger_*.py` · `tools/parcel_lookup.py` · `landxi_api/ledger.py` | ③ · 잔여: '의심 필지 몇 건?' |
| **c2-numbers** | 숫자 한 출처 + 실태조사 데이터 잔여(읍면동 빈칸·여수 93필지·시도 이름) | `landxi_api/{survey,summary,regions}.py` · `server/agent/tools/{survey,survey_local,summary_lookup,results,scope}.py` · `server/workers/postprocess.py` · `server/survey/{nation.py,rules*,pipelines/*}` | ⑨ 숫자 · 잔여: 읍면동 빈칸 · 여수 93필지 · 시도 이름 두 가지 |
| **c2-report-law** | 말로 보고서 → .docx(실제 지역 근거·개발 문구 0) + 법령 RAG | `server/agent/report.py` · `server/survey/{report,explain,db}.py` · `server/agent/rag/*`(신규) · `tools/ext/{report,law}.py`(신규) · `landxi_api/law.py`(신규) · `landxi/v3/gov-report/*` · `landxi/v3/ops-infra/js/law.js`(신규) | ④⑤ · 잔여: docx 개발 문구 |
| **c2-vlm-global** | 영상 검수 보조(VLM) + 해외 결과 도구(영어) | `tools/ext/{vlm,global_}.py`(신규) · `server/agent/vlm/*`(신규) · `landxi/v3/global/*` | ⑥⑦ |
| **c2-ops** | LX 관리자 운영 요약(말로) + 기관 사용량에 AI 도우미 토큰 + 모델 상태·승격 자리 | `landxi/v3/ops-core/*` · `landxi/v3/ops-infra/*`(law.js 제외) · `landxi_api/{ops,quota}.py` · `tools/ext/ops.py`(신규) · `server/ops/*` | ⑧ · ⑨ 토큰 화면 · C9 언어 모델 켜기 |

순서: **c2-core 와 c2-numbers 가 뼈대**다. 나머지 5개는 아래 3절 계약만 보고 동시에 시작한다. 계약을 바꿔야 하면 c2-core 가 이 파일 3절을 고치고 알린다.

## 3. 공통 계약 (모든 작업이 지킨다)
### 3.1 도구 확장 자리 (c2-core 가 만든다)
- `server/agent/tools/ext/` 아래 `*.py` 를 서버가 켜질 때 모두 불러온다. 모듈은 다음 이름만 내보낸다.
  - `SPECS: dict[name → {description, properties, required?}]`
  - `HANDLERS: dict[name → async (args, ctx) → Out]`
  - `WRITE: set` · `CONFIRM: set`(사람이 확인 카드로 승인해야 실행) · `CLIENT: set`(브라우저가 실행하는 지도 도구)
  - `def allowed(name, principal) -> bool`(없으면 기관·LX 모두 허용)
  - `WHY: dict[name → 한 줄]`(선택) · `HINT: str`(시스템 프롬프트에 붙일 규칙 1–2줄, 선택)
- 모듈 하나가 불러오기에 실패해도 서버는 뜬다(경고 기록만). 같은 이름이 겹치면 먼저 불린 것이 이기고 경고를 남긴다.
- **(c2-core 09-30 구현 · 추가 선택 이름)** 파일 이름순으로 부르고 기본 도구가 먼저다. 게이트웨이 기동 로그에 `agent ext: map(4), ops(5) …` 한 줄이 남는다(`/health` 는 그대로).
  - `SAY: dict[name → 사용자 말]` — 명령 바 계획 줄·확인 카드 문구(없으면 `kit/i18n/*.json` 의 `tool.<name>`)
  - `ROUTE(msg, ctx) → {"tool", "args"} | None`(sync/async) — 모델 앞 결정적 직행. 관할 가드 뒤, 요약·대장 직행 앞에서 파일 이름순으로 묻는다. 권한 밖 도구면 건너뛴다
  - `GUARD_PASS: re.Pattern` — 이 문장은 '해당 지역 데이터가 없습니다' 가드를 건너뛴다(결과 없는 지역 이동·분석 실행 등). 관할 밖 가드는 그대로
  - `PREPARE: dict[name → (args, ctx) → args]` — 확인 카드 전에 인자 해석. 승인 뒤에는 `HANDLERS[name]` 이 실행된다
  - `CONTRACT: dict[name → (None, method, path)]` — 계약 경로가 있으면(없으면 설명에 경로 꼬리 없음)
  - CLIENT 도구는 `HANDLERS` 가 있으면 그것이 `Out.ui_actions` 를 만들고, 없으면 `{op: 이름, **인자}` 가 그대로 나간다
  - `Out.blocks`(3.3) · `Out.answer`(ROUTE 직행 때 런타임 답 · `{{봉투key}}` 자리표 허용 → `{{env:eN}}`)
  - 산출 파일: `config.run_dir(ctx.run_id)` 에 쓰고 `config.run_href(run_id, 이름)` 을 file·image 블록에 넣는다(`GET /agent/runs/{run}/files/{name}` · 권한 = run 소유 기관 · docx·png·jpg·webp·csv·pdf·xlsx)
  - 명세에 `"route_only": True` 를 두면 모델에게 내놓지 않고 ROUTE 직행으로만 부른다
  - 시험 모듈은 환경 변수 `LX_AGENT_EXT_EXTRA`(모듈 경로 쉼표 목록)로만 더한다
### 3.2 화면 동작(`ui_actions`) — `kit:agent-action` 이벤트로 흘러간다
| op | 인자 | 처리 화면 |
|---|---|---|
| `map_region` | `sgg_cd, name, bbox` | XI맵 · 첫 화면 · 해외 |
| `map_zoom` | `zoom` 또는 `delta` | XI맵 · 첫 화면 · 해외 |
| `map_view` | `pitch, bearing` | XI맵 · 해외 |
| `map_layer` | `layer: imagery|results|findings|parcels, on: bool` | XI맵 · 첫 화면 |
| `analysis_watch` | `job_id, sgg_cd` | XI맵 |
| 기존 `map_on` · `map_arrive` · `map_flyto` · `parcel_card` · `drawer_open` | 그대로 | 그대로 |
- 화면은 동작을 끝내면 `kit:agent-action-done {op, ok}` 를 낸다. c2-core 는 이것으로 "했다"는 문장을 확인한다(3.4).
- **(c2-core 09-30)** `kit:agent-action` 은 `cancelable` 이다. 화면이 그 op 를 직접 처리하면 `e.preventDefault()` 하고, 끝나면 done 을 낸다. 아무도 막지 않으면 키트가 `stage.map` 으로 `map_region`(bbox)·`map_zoom`·`map_view` 를 기본 처리하고 done 을 낸다. `map_layer`·`analysis_watch` 는 화면만 처리할 수 있다(막지 않으면 키트가 `ok:false` 로 기록). 명령 바 요소에 `data-acts`(보낸 동작 수)·`data-acts-done`·`data-acts-ok` 가 남는다.
### 3.3 명령 바 블록 (c2-core 가 그린다)
- 도구는 `Out.blocks` 에 넣는다. 구분자 `type` 을 꼭 둔다(c2-core 09-30). 서버가 `agent.done.blocks`(와 `agent.tool.result.blocks`)로 보낸다.
- `chart`: `{type:'chart', kind:'bar', title, rows:[{label, env}]}` — `env` 는 **같은 Out 의 봉투 key**(서버가 eN 으로 바꾼다). 숫자 직접 값은 버린다. 최대 12막대
- `file`: `{type:'file', label, href}` — .docx 내려받기(`config.run_href` · 화면에 경로 글자 노출 0 · 버튼만)
- `image`: `{type:'image', src, caption, tag:'AI 의견 · 근거 아님'}` — `src` 도 `config.run_href`(Bearer 로 받아 그린다)
- 런타임 자동 블록: 질문에 '차트·그래프·막대·chart' 가 있고 도구 봉투에 `emd_*`·`rule_*`·`pri_*` key 가 2개 이상이면 막대 1개. `agent.done.artifact.docx_url` 이 있으면 file 1개.
### 3.4 지어낸 동작 차단 (c2-core)
- 답에 동작 문장(확대·켰·기울·이동·칠했·열었 / zoomed·turned on·moved 등)이 있는데 같은 run 에 그 동작의 `ui_action` 이 없으면, 그 문장을 "그 지도 동작은 아직 할 수 없습니다."(영어면 영어) 로 바꾼다.
- **(c2-core 09-30)** 대조 표 = `lint.ACTIONS`(확대·축소 ↔ map_zoom · 층 ↔ map_layer/map_on · 3D·기울 ↔ map_view · 이동 ↔ map_region/map_flyto/map_arrive · 칠 ↔ map_on/map_arrive/map_layer · 서랍·카드 ↔ drawer_open/parcel_card · 분석 시작 ↔ analysis_watch/jobs_submit/analysis_run/survey_build). 성공한 도구 이름도 짝으로 친다. 부정·조건 문장('할 수 없', '려면', can't)은 검사하지 않는다. 바꾼 목록은 `agent.done.action_flags`.
- 같은 끝단에서 `{{unv:…}}`·모르는 자리표 → '확인되지 않음'(영어 'unverified'), 숫자 칩 뒤 `~` 제거, 금지어(`관제`·`AG-n`·`/api…`·`*.py`·`PostGIS`·`V-World`·`API 키`·단독 `llm`) 치환(`lint.scrub_terms` · 보고서 서술도 이 함수를 쓴다).
### 3.5 숫자 한 출처 (c2-numbers 가 만든다)
- **의심 필지 수**(이름: "의심 필지") = `survey_sgg.findings` 하나. `GET /survey/stats`, `/summary`, 에이전트 `survey_stats`·`summary_lookup`, XI맵 머리·오른쪽 판, 첫 화면, 보고서가 모두 이 값을 쓴다.
- **현장 확인 필요** = 같은 표의 A 등급 수(또는 c2-numbers 가 정한 한 정의) 하나. 정의를 `survey.py` 맨 위 설명에 한 줄로 적는다.
- 적재가 진행 중이면 숫자 대신 "집계 중"을 보인다. 이미 결과가 있을 때는 '첫 결과 전'을 보이지 않는다.
### 3.6 언어
- 질문이 영어(한글 비율 < 30%)면 답·고정 문구·숫자 단위를 영어로 한다. 도구가 내는 지역 이름은 원문 그대로 둔다.
- **(c2-core 09-30)** 서버 `runner.lang_of` · 화면 `kit/i18n.js langOf` 같은 규칙. `ctx.lang` 을 도구가 읽을 수 있다. 영어 질문은 요약·대장 직행(한국어 고정 문장)을 건너뛰고 모델 경로로 간다(같은 도구). 거절 문구는 `audit.GUARDS_EN`. `agent.done.lang`.

## 4. 기본값 결정 (사소한 명칭·표기 — 묻지 않고 기록, 사용자가 나중에 정정)
| 항목 | 기본값 |
|---|---|
| 시도 이름 | 한 가지만 쓴다: 기관 표기 **광주전남특별시**(`regions.py` 의 기존 매핑). 문서·화면 모두 같은 함수로 뽑는다 |
| 관리자 사용량 줄 이름 | **AI 도우미 사용량**(단위: 토큰) |
| VLM 꼬리표 | **AI 의견 · 근거 아님** |
| 법령 원문 대상 | 농지법·동 시행령·시행규칙, 건축법, 국토의 계획 및 이용에 관한 법률, 산지관리법, 농지이용실태조사 요령(공개 원문 · 국가법령정보센터) |
| 독파모 자리 | 설정에 `dokpamo`(꺼짐). 관리자 화면 표기 "국산 모델 연결 · 연결 전" |
| 법령 답 꼬리표 | 조문 원문 인용 + "요약 · 원문 아님"(요약할 때만) |

## 5. 완료 기준 (차수 전체 — 측정 가능, 화면만으로, 두 시도 이상)
공통 조건: 로그인 폼으로만 들어간다. 명령줄 단계 0. 계정은 **남원(전북)**, **광주전남(여수·목포)**, LX 직원, kgz-agri, LX 관리자다. ④ 실증 때는 확인자가 무작위로 고른 시군구 1곳을 더한다. GPU 는 vLLM(GPU1) + 영상 추론 대기열 한 장씩이다.

| # | 기준 | 측정 |
|---|---|---|
| K1 | 지어낸 동작 답 0 | 32문 재실행 + 지도 동작 질문 12개(두 시도). 동작 문장이 있으면 `kit:agent-action` 이 1건 이상 있어야 한다. 위반 0 |
| K2 | 자리표·개발 글자 0 | 모든 답 DOM 에 `{{`, `관제`, `AG-`, `/api`, `.py`, `PostGIS`, `V-World`, `API 키`, `llm` 0건(lint 자동 검사) |
| K3 | 말로 지도 제어 | 지역(결과 없는 곳 포함)·줌·영상 층·3D 네 가지를 두 시도에서 각각 성공(지도 상태 변화 확인) |
| K4 | 말로 분석 실행 | 두 시도 각 1곳에서 "전역 분석 실행해 줘" → 확인 카드 → 대기열 → 결과 1건 이상. 전력 검사 거절 시 이유 한 줄 |
| K5 | 즉시 시각화 | "읍면동별 차트로" → 막대 차트 1개. 막대 값 = 같은 이름의 숫자(K8) |
| K6 | 의심 필지 몇 건 | 남원·광주전남 첫 화면에서 대장을 올린 뒤 "의심 필지 몇 건?" → 숫자 답 + 지도 채색. "지금은 답할 수 없습니다" 0 |
| K7 | 가로채기 0 | 첫 화면에서 보고서·법령·차트·영상 질문 8개가 대장 필터로 새지 않는다(답에 대장 필터 문장 0) |
| K8 | 숫자 한 출처 | 두 시도에서 "의심 필지" 가 XI맵 머리·오른쪽 판·첫 화면·에이전트·보고서 5곳 모두 같은 값 |
| K9 | 보고서 | 두 시도에서 말로 "○○ 보고서 초안" → .docx 내려받기. 인용 [1] 이 요청 지역. 개발 문구 0(K2 목록 + `inspected/closed/dismissed`, `2차`). 시도 이름 1가지. XI맵 서랍 기본 대상 = 현재 지역 |
| K10 | 법령 RAG | 관리자 화면에서 법령 원문 올리기·색인 → 조문 질문 6개(두 시도) 모두 조·항·시행일 인용. 색인에 없는 조문은 "법령 데이터에 없습니다" |
| K11 | VLM | 두 시도에서 의심 필지 1곳씩 "영상 설명해 줘" 또는 필지 카드 버튼 → 영상 조각 + 설명 + 꼬리표 |
| K12 | 다국어 | kgz-agri 영어 질문 4개 모두 영어 답 + 수치(도구 결과). LX 직원 영어 질문도 영어 답 |
| K13 | 관리자 운영 요약 | LX 관리자 대시보드 Ctrl K 로 GPU·대기열·경보·기관 사용량 4문 답. 기관 사용량 표에 AI 도우미 사용량 줄(값 = usage_events 합계) |
| K14 | 관할 가드 유지 | 남원↔여수, 광주전남↔남원 교차 질문 막힘(회귀 0) |
| K15 | 잔여 | XI맵 영상 층이 등록 시군구 전체(현재 72개)에서 그려짐(무작위 5곳 확인) · 새 분석 결과 읍면동 빈칸 0 + 기존 빈칸 67,141 → 0(경계 밖은 '관할 밖' 표기) · 여수 경계 밖 필지 93 → 0 |
| K16 | 테스트 | `server/agent/tests` · `server/survey/tests` 녹색, 새 도구마다 테스트 1개 이상 |

## 6. 작업 브리프
`c2-core.md` · `c2-xi.md` · `c2-fusion.md` · `c2-numbers.md` · `c2-report-law.md` · `c2-vlm-global.md` · `c2-ops.md` (이 폴더)

## 7. 공통 금지
- git commit·reset·checkout·restore 금지(Ship 단계만). 임시 스크립트는 스크래치 폴더에 둔다.
- vLLM·Ollama 종료·재시작 금지. GPU 두 장 동시 고부하 금지. 영상 추론은 대기열로만 한다.
- 자기 소유 밖 파일은 고치지 않는다. 고쳐야 하면 그 작업 담당에게 3절 계약으로 요청한다.
- 확인은 로그인 폼으로만 한다(세션 주입 금지). 평가 스크립트 참고: `C:/Users/User/AppData/Local/Temp/claude/E--Land-XI----/8755e9e1-c9d4-4ccc-ae31-8eb0e35a24df/scratchpad/c2/run.mjs`
- 증거는 `shots/process/C2/<id>/` 에 둔다(png + 질문별 답·동작 json).
