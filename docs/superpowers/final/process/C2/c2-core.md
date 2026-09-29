# c2-core — 에이전트 공통 뼈대
> 시작 전 필수: `E:/Land-XI 플랫폼/CLAUDE.md`, `01. 디자인/docs/CORE.md`, `01. 디자인/docs/USER-DIRECTIVES.md`, `01. 디자인/docs/PROCESS.md`, 이 폴더의 `assess.md`·`plan.md`(특히 3절 공통 계약·4절 기본값)를 읽는다. 보고 첫 줄은 "브리핑 확인: (규칙 3개)"로 쓴다.
> 공통 금지(plan.md 7절): git commit·reset·checkout·restore 금지 · vLLM·Ollama 종료 금지 · GPU 한 장씩 · 소유 밖 파일 수정 금지 · 확인은 로그인 폼으로만 · 증거는 `shots/process/C2/c2-core/`.

## 목표 한 줄
어느 화면의 Ctrl K 든 **지어낸 동작 없이**, 질문한 언어로, 도구 결과 숫자만으로 답한다. 차트·파일·영상 조각을 명령 바 안에 바로 보인다. 다른 작업은 자기 파일에서 도구를 붙인다.

## 소유 파일
- `server/agent/runner.py` · `config.py` · `lint.py` · `backends.py` · `audit.py` · `record.py`
- `server/agent/tools/__init__.py` · `tools/registry.py` · `tools/from_contract.py` · `tools/ext/__init__.py`(신규 · `ext/` 안 다른 모듈은 각 작업 소유)
- `server/landxi_api/agent.py` · `server/landxi_api/main.py`
- `landxi/v3/kit/cmdk.js` · `kit/cmdk.css` · `kit/chart.js` · `kit/i18n.js` · `kit/i18n/*.json`
- `server/agent/tests/*`(기존 + 이 작업 테스트)

## 할 일
1. **도구 확장 자리**(plan 3.1): `tools/ext/__init__.py` 가 `ext/*.py` 를 불러와 `registry.SPECS/HANDLERS/WRITE/CONFIRM`·허용 검사·`WHY`·시스템 프롬프트 `HINT` 에 합친다. 불러오기에 실패하면 경고만 남긴다. runner.py 안의 대장·요약 도구 붙이기는 지금처럼 두어도 된다. **이 항목을 가장 먼저 끝내고 plan.md 3.1 과 다르면 고쳐 알린다.**
2. **클라이언트 도구 일반화**: `CLIENT` 집합의 도구는 서버에서 `ui_actions` 로 나간다(기존 map_* 처리와 같은 길). 새 op(`map_region`·`map_zoom`·`map_view`·`map_layer`·`analysis_watch`)가 그대로 `kit:agent-action` 으로 흐르게 한다.
3. **지어낸 동작 차단**(plan 3.4): 시스템 프롬프트에 "지도 동작은 도구를 불러야만 일어난다. 맞는 도구가 없으면 '할 수 없습니다'"를 넣는다. 끝낼 때 동작 문장과 실제 `ui_actions` 를 대조해, 짝이 없는 동작 문장을 바꾼다. 테스트: 동작 문장 12종(한·영).
4. **자리표·꼬리**: 답에 `{{unv:…}}`·`{{env:…}}` 가 그대로 남는 경로를 없앤다. 확인 못 한 숫자는 "확인되지 않음"으로 한다. 숫자 칩 뒤의 `~` 꼬리를 없앤다(`20,852 필지 ~입니다` → `20,852필지입니다`).
5. **운영 질문 경로**: runner 의 "관제 운영 에이전트(AG-6)" 고정 답을 지운다. 운영 질문은 일반 계획자로 보낸다(`ext/ops.py` 도구는 관리자에게만 허용된다 · c2-ops). 관리자가 아니면 "LX 관리자 화면에서 확인할 수 있습니다." 한 줄로 답한다. `lint` 금지어에 `관제`·`AG-`·`/api`·`.py`·`PostGIS`·`V-World`·`API 키`·단독 `llm` 을 넣고, 답과 보고서 서술을 모두 검사한다.
6. **언어**(plan 3.6): 한글 비율로 언어를 정한다. 영어면 영어 시스템 프롬프트, 영어 거절·실패 문구(`kit/i18n/en.json`), 영어 단위로 답한다. 라우터·규칙 경로(요약·관할 가드)의 고정 한국어 문구에도 영어판을 둔다.
7. **명령 바 블록**(plan 3.3): `cmdk.js` 가 답 아래에 `chart`(kit/chart.js 막대 · 값은 봉투에서) · `file`(.docx 내려받기 버튼) · `image`(조각 + 꼬리표)를 그린다. `kit:agent-action-done` 을 받아 동작 성공을 기록한다. `agent.py` 의 run 산출 파일(docx·png) 내려받기 경로를 일반화한다(기존 draft.docx 경로 확장 · 권한 = run 소유 기관).
8. **모델 승격 자리**: `config.BACKENDS['dokpamo']` 를 추가한다(`enabled: False`, URL·모델명은 환경 변수, 기본 빈칸). `CHAIN` 에는 켜졌을 때만 작성자 맨 앞에 넣는다. `GET /agent/models` 는 이 자리를 '연결 전' 으로 보고한다. 외부 호출 금지(`host_allowed`)는 그대로 둔다.
9. **라우터 자리**: `main.py` 는 `landxi_api.law`(c2-report-law)가 있으면 라우터로 붙이고, 불러오기에 실패하면 건너뛴다.

## 완료 기준 (측정 가능 · 화면만으로 · 두 시도 이상)
- K1: 남원(전북)·광주전남 계정 첫 화면과 LX 직원 XI맵에서 동작 질문 12개(확대·영상 층·3D·결과 없는 지역 이동 등)를 묻는다. 동작 문장이 있는데 `kit:agent-action` 이 0인 답이 0건이어야 한다. c2-xi 가 끝나기 전에는 "할 수 없습니다" 답도 합격이다.
- K2: assess 32문 재실행 답 DOM 에서 `{{`·`관제`·`AG-`·`~입니다` 0건.
- K12(일부): LX 직원·kgz-agri 영어 질문 4개 → 영어 답. 해외 수치는 c2-vlm-global 이후에 본다.
- 명령 바가 테스트 도구로 만든 chart·file·image 블록을 각 1개씩 그린다(스크린샷 3장).
- `/agent/models` 에 승격 자리가 '연결 전'. `server/agent/tests` 녹색. 새 테스트(확장 불러오기·동작 대조·언어 감지·자리표)를 추가한다.
