# c2-report-law — 말로 보고서 → .docx + 법령 근거(RAG)
> 시작 전 필수: `E:/Land-XI 플랫폼/CLAUDE.md`, `01. 디자인/docs/CORE.md`, `01. 디자인/docs/USER-DIRECTIVES.md`, `01. 디자인/docs/PROCESS.md`, 이 폴더의 `assess.md`·`plan.md`(특히 3절 공통 계약·4절 기본값)를 읽는다. 보고 첫 줄은 "브리핑 확인: (규칙 3개)"로 쓴다.
> 공통 금지(plan.md 7절): git commit·reset·checkout·restore 금지 · vLLM·Ollama 종료 금지 · GPU 한 장씩(임베딩도 GPU 를 쓰면 vLLM 과 같은 GPU1 에서 가볍게, 아니면 CPU) · 소유 밖 파일 수정 금지 · 확인은 로그인 폼으로만 · 증거는 `shots/process/C2/c2-report-law/`.

## 목표 한 줄
"○○ 보고서 초안 써 줘" 한마디에 그 지역을 근거로 한 .docx 가 명령 바에 뜬다. 문서에는 개발 문구가 없고 법령 조문이 원문 그대로 인용된다. "근거 조문은?" 질문에는 조·항·시행일로 답한다.

## 소유 파일
- `server/agent/report.py` · `server/survey/report.py` · `server/survey/explain.py` · `server/survey/db.py`(보고서 문구 상수)
- `server/agent/rag/*`(신규 · 색인·검색) · `server/agent/tools/ext/report.py` · `ext/law.py`(신규)
- `server/landxi_api/law.py`(신규 · 법령 원문 올리기·색인 상태 · 관리자 전용 · c2-core 가 main.py 에 붙인다)
- `landxi/v3/gov-report/*` · `landxi/v3/ops-infra/js/law.js`(신규 · `export function mountLaw(host)` — c2-ops 가 화면에 붙인다)
- `server/survey/tests/test_state_report.py` 와 이 작업 테스트

## 할 일
1. **말로 보고서**(`ext/report.py`): `report_draft(region|emd, rule?)` 는 기존 보고서 생성(`/agent/report/draft` 경로)과 같은 함수를 쓰고, 결과를 `file` 블록(plan 3.3)으로 낸다. 대상 지역은 질문 → 화면 현재 지역 → 없으면 "지역을 알려 주세요" 순서로 정한다. 기본값에 지역을 하드코딩하지 않는다.
2. **인용**: [n] 은 요청 지역의 실제 출처만 가리킨다. 문장과 인용 대상이 맞는지 검사한다(예: 평균 신뢰도 문장에 '후보 필지 수' 인용 금지). 숫자는 c2-numbers 의 `survey_counts` 한 출처에서 가져오고, 시도 이름은 `sido_label` 로 쓴다.
3. **개발 문구 제거**: docx 와 화면 설명에서 `PostGIS …(emd_cd …)`, `V-World 연속지적`, `건축HUB API 키 대기`, `inspected/closed/dismissed`, `2차 RAG`, `서술: llm(…)`, 잘린 줄 `이 문서는 `, `전북 비도시 도엽 … 덕과면 AOI` 고정 문구를 없앤다. 사용자 말로 바꾼다: 연속지적도, 건축물대장 대조 전, 현장조사 배정·오탐·완료, 법령 근거, AI 가 작성한 초안(사람 확인 필요). 영상 근거 문구는 그 지역 영상 정보(연도·해상도)에서 만든다.
4. **법령 원문과 색인**(`server/agent/rag/`): 대상 법령(plan 4절)의 공개 원문을 `LX_DATA_ROOT/law/` 에 조·항 단위(법령명·조·항·시행일·원문)로 둔다. 색인은 `rank-bm25` 로 만들고, 임베딩(`sentence-transformers`, 다국어 소형)은 선택이다. 색인과 원문은 파일로 두고 DB 표는 선택이다.
5. **`law_search`**(`ext/law.py`): `law_search(query, acts?)` 는 조문 원문 + `law_ref{법령, 조, 항, 시행일}` 를 인용으로 낸다. 명령 바는 조문을 원문 그대로 보인다. 요약할 때만 "요약 · 원문 아님" 을 붙인다. 색인에 없으면 "법령 데이터에 없습니다" 로 답한다(지어내기 0). 보고서의 법령 근거 칸도 이 도구로 채운다.
6. **관리자 화면 버튼**(`landxi_api/law.py` + `ops-infra/js/law.js`): 법령 원문 파일(텍스트·HTML·XML)을 올리고, 색인을 다시 만들고, 상태(법령 수·조문 수·마지막 색인 시각)를 본다. 명령줄 단계 0.
7. 원문 첫 반입: 국가법령정보센터 공개 원문을 받아 관리자 화면 버튼으로 올린다. 이 PC 에서 받을 수 없으면 사용자 조치로 보고한다(지어낸 조문 0).

## 완료 기준 (측정 가능 · 화면만으로 · 두 시도 이상)
- K9: 남원(전북)·광주전남(여수 또는 목포) 계정에서 말로 "○○ 보고서 초안" → 명령 바 .docx 버튼 → 내려받기. 인용 [1] 이 요청 지역을 가리킨다. docx 텍스트 검사에서 plan K2 목록·`inspected`·`closed`·`dismissed`·`2차`·`이 문서는 ` 끝 줄 0건. 시도 이름 1가지.
- K10: LX 관리자 화면에서 법령 원문 올리기 → 색인(상태 숫자 표시). 두 시도 계정에서 조문 질문 6개(농지법 전용·건축법 무허가·국토계획법 용도지역·산지관리법 전용·실태조사 요령·색인에 없는 법 1개)를 묻는다. 5개는 조·항·시행일 인용, 1개는 "법령 데이터에 없습니다".
- 보고서 법령 근거 칸이 조문 인용으로 채워진다(`[법령 확인 · 2차 RAG]` 0).
- `server/survey/tests` 녹색. rag 색인·검색 테스트를 추가한다.
