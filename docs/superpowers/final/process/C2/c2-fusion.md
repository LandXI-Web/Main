# c2-fusion — 첫 화면(행정데이터 융합) 가로채기 해소 + 융합 질의
> 시작 전 필수: `E:/Land-XI 플랫폼/CLAUDE.md`, `01. 디자인/docs/CORE.md`, `01. 디자인/docs/USER-DIRECTIVES.md`, `01. 디자인/docs/PROCESS.md`, 이 폴더의 `assess.md`·`plan.md`(특히 3절 공통 계약·4절 기본값)를 읽는다. 보고 첫 줄은 "브리핑 확인: (규칙 3개)"로 쓴다.
> 공통 금지(plan.md 7절): git commit·reset·checkout·restore 금지 · vLLM·Ollama 종료 금지 · GPU 한 장씩 · 소유 밖 파일 수정 금지 · 확인은 로그인 폼으로만 · 증거는 `shots/process/C2/c2-fusion/`.

## 목표 한 줄
기관 첫 화면에서 대장을 올린 뒤 무엇을 물어도 맞는 길로 간다. 대장 열 조건이 있는 질문만 대장 필터로 간다. "의심 필지 몇 건?"·보고서·법령·차트·영상 질문은 서버 에이전트로 가서 숫자·지도·블록으로 답한다.

## 소유 파일
- `landxi/v3/gov-fusion/*`(app.js · ask.js · ledger.js · match.js · registry.js · land.js · aiindex.js · srvindex.js · vworld.js · css · html)
- `server/agent/tools/ledger_findings.py` · `ledger_ingest.py` · `ledger_match.py` · `ledger_rule.py` · `parcel_lookup.py`
- `server/landxi_api/ledger.py`

## 할 일
1. **경로 나누기**(`app.js` submit 처리 · `ask.js`): 질문에 대장 열 조건(지목·신고·허가·면적·주소 열 등 `keysOf` 가 잡는 말)이 있을 때만 대장 필터 경로로 보낸다. 나머지는 명령 바 기본 경로(`POST /agent/runs`, context 에 tenant·region·ledger)로 보낸다. `where: []` 는 실패로 처리하지 않고 서버 경로로 넘긴다.
2. **'의심 필지 몇 건?'**: 서버 경로에서 `survey_stats`(c2-numbers 한 출처)로 답하고 `map_on survey/findings` 로 칠한다. 대장이 있으면 `ledger_findings` 건수를 한 문장 더한다. 이 숫자에는 다른 이름("대장과 AI 가 어긋난 필지")을 쓴다.
3. **지도 동작 처리**: 첫 화면 지도가 `map_region`·`map_zoom`·`map_layer`·`map_on`·`map_arrive`·`map_flyto` 를 처리하고 `kit:agent-action-done` 을 낸다(plan 3.2).
4. **필지 카드 '영상 설명'**: 버튼을 누르면 명령 바에 "{지번} 영상 설명해 줘"를 보낸다(도구는 c2-vlm-global).
5. **대장 도구 보강**: `ledger_findings` 에 `by=emd` 집계와 `chart` 블록을 더한다. 도구 결과 밖의 숫자는 0. 관할 가드는 유지한다.
6. 첫 화면 큰 숫자와 에이전트 답은 이름이 같으면 값도 같다(plan 3.5).

## 완료 기준 (측정 가능 · 화면만으로 · 두 시도 이상)
- K6: 남원(전북)·광주전남 각각 로그인 → 화면에서 샘플 대장 올리기 → "의심 필지 몇 건?" → 숫자 답 + 지도 채색. "지금은 답할 수 없습니다" 0.
- K7: 두 시도에서 보고서·법령·차트·영상 질문 8개(assess 의 `건축법…조문`·`운봉읍 보고서`·`화양면 보고서`·`여수시 읍면동별 차트` 포함)가 대장 필터 문장("AI는 건물 N필지", "조건에 맞는 필지가 없습니다")으로 답하지 않는다.
- 대장 조건 질문(`대장상 농지인데 AI가 건물`) 회귀 0: 남원 431 · 광주전남 73 과 같은 값이다. 데이터가 바뀌었으면 도구 결과와 같은 값이다.
- K14: 교차 관할 질문 2개가 막힌다.
