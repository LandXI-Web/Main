# c2-ops — LX 관리자: 말로 운영 요약 + AI 도우미 사용량 + 언어 모델 상태
> 시작 전 필수: `E:/Land-XI 플랫폼/CLAUDE.md`, `01. 디자인/docs/CORE.md`, `01. 디자인/docs/USER-DIRECTIVES.md`, `01. 디자인/docs/PROCESS.md`, 이 폴더의 `assess.md`·`plan.md`(특히 3절 공통 계약·4절 기본값)를 읽는다. 보고 첫 줄은 "브리핑 확인: (규칙 3개)"로 쓴다.
> 공통 금지(plan.md 7절): git commit·reset·checkout·restore 금지 · **vLLM·Ollama 종료·재시작 금지** · GPU 한 장씩 · 소유 밖 파일 수정 금지 · 확인은 로그인 폼으로만 · 증거는 `shots/process/C2/c2-ops/`. 화면 용어는 "LX 관리자 대시보드"다(금지어 `관제`).

## 목표 한 줄
LX 관리자가 LX 관리자 대시보드에서 Ctrl K 로 GPU·대기열·경보·기관 사용량을 말로 묻고 숫자 답을 받는다. 기관 사용량에 AI 도우미 사용량(토큰)이 보이고, 언어 모델 상태와 국산 모델 연결 자리를 화면에서 본다.

## 소유 파일
- `landxi/v3/ops-core/*` · `landxi/v3/ops-infra/*`(단 `js/law.js` 는 c2-report-law 소유 · 이 작업은 `mountLaw(host)` 를 불러 붙이기만)
- `server/landxi_api/ops.py` · `server/landxi_api/quota.py`
- `server/agent/tools/ext/ops.py`(신규)
- `server/ops/*`(poller)

## 할 일
1. **명령 바**: ops-core·ops-infra 에 `K.mountCmdk` 를 붙인다. context 에 화면 이름을 넣는다. 관리자 계정만 쓴다.
2. **운영 읽기 도구**(`ext/ops.py`, `allowed` = LX 관리자): `ops_gpus` · `ops_queues` · `ops_alerts` · `ops_usage(tenant?, dim?)` · `ops_models`. 모두 기존 `/ops/*` 응답을 읽기만 하고 수치는 봉투로 낸다. GPU 는 "GPU 1·GPU 2"처럼 순번으로 부른다(제품명 노출 0). 조치(재큐·우선순위·모델 내리기)는 제안 문장까지만 낸다. 실행은 화면 버튼으로 하고, 모델 내리기 제안에서 vLLM·Ollama 는 뺀다.
3. **AI 도우미 사용량**: `/ops/tenants`(또는 사용량 응답)에 `llm_tokens` 월 합계와 한도(초기값 표기)를 더한다. 기관 사용량 표에 "AI 도우미 사용량" 줄을 추가한다(plan 4절). 값은 `usage_events` 합계 한 출처다.
4. **언어 모델 상태**: 인프라 화면의 '언어 모델' 한 줄을 모델별 상태(두뇌·라우터·예비 · 켜짐/꺼짐 · 사용 GPU 순번)로 넓힌다. 국산 모델 연결 자리("국산 모델 연결 · 연결 전")는 `/agent/models` 의 `dokpamo` 로 보인다. 모델명은 사용자에게 의미 있는 이름(Gemma 4 · HyperCLOVA X SEED)만 쓰고 포트·경로는 쓰지 않는다.
5. **꺼져 있을 때만 켜기**(원스톱 C9): 언어 모델이 꺼져 있을 때만 '켜기' 버튼을 연다. 서버가 전력·GPU 점유 검사 후 기존 가동 스크립트를 백그라운드로 부른다. 켜져 있으면 버튼을 잠근다. 끄기·재시작 버튼은 두지 않는다. 테스트는 모의 상태로 한다(실제 vLLM 을 내리지 않는다).
6. **법령 색인 칸**: ops-infra 에 c2-report-law 의 `mountLaw` 칸을 붙인다.
7. 화면·답에 `관제`·`AG-` 0.

## 완료 기준 (측정 가능 · 화면만으로)
- K13: LX 관리자 로그인 → LX 관리자 대시보드 Ctrl K → "GPU 상태", "대기열 요약", "경보 있어?", "기관별 AI 도우미 사용량" 4문 모두 숫자 칩 답. 수치 = `/ops/*` 응답과 같음(기록).
- 기관 사용량 표 "AI 도우미 사용량" 값 = `usage_events llm_tokens` 기관별 합계. 전북(남원)·광주전남·kgz-agri·LX 4기관을 대조한다.
- 관리자가 아닌 계정(남원·광주전남)이 운영 질문을 하면 "LX 관리자 화면에서 확인할 수 있습니다." 한 줄이 나온다. 금지어 0.
- 언어 모델 상태 줄 3개와 국산 모델 자리 '연결 전'이 보인다. 켜진 동안 '켜기' 버튼이 잠겨 있다(스크린샷). 모의 테스트 녹색.
- ops 화면 스크린샷에 GPU 제품명·포트·경로 0.
