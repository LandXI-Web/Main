# c2-numbers — 숫자 한 출처 + 실태조사 데이터 잔여
> 시작 전 필수: `E:/Land-XI 플랫폼/CLAUDE.md`, `01. 디자인/docs/CORE.md`, `01. 디자인/docs/USER-DIRECTIVES.md`, `01. 디자인/docs/PROCESS.md`, 이 폴더의 `assess.md`·`plan.md`(특히 3절 공통 계약·4절 기본값)를 읽는다. 보고 첫 줄은 "브리핑 확인: (규칙 3개)"로 쓴다.
> 공통 금지(plan.md 7절): git commit·reset·checkout·restore 금지 · vLLM·Ollama 종료 금지 · GPU 한 장씩 · 소유 밖 파일 수정 금지 · 확인은 로그인 폼으로만 · 증거는 `shots/process/C2/c2-numbers/`.

## 목표 한 줄
"의심 필지"와 "현장 확인 필요"가 어느 화면·어느 질문에서든 같은 값이다. AI 결과의 읍면동 이름이 비지 않고, 여수 필지가 제자리에 있고, 시도 이름이 하나다.

## 소유 파일
- `server/landxi_api/survey.py` · `summary.py` · `regions.py`
- `server/agent/tools/survey.py` · `survey_local.py` · `summary_lookup.py` · `results.py` · `scope.py`
- `server/workers/postprocess.py`
- `server/survey/nation.py` · `server/survey/rules*` · `server/survey/pipelines/*` · `server/survey/tests/*`(보고서 테스트 제외)
- DB 보정은 서버 안 관리 작업으로 한다(백그라운드 · CPU).

## 할 일
1. **한 출처 함수**: `survey_counts(sgg_cd)` → `{suspect, field_check, state, as_of}`. 원천은 `survey_sgg` 하나다. `field_check` 정의를 한 줄로 적는다. `GET /survey/stats`·`/summary`·에이전트 `survey_stats`·`summary_lookup` 이 이 함수를 쓴다. 상태별(`dismissed` 등) 제외 규칙도 하나로 정해 적는다. 남원 20,852/20,872/21,303 과 여수 10,499/10,504 가 왜 다른지 원인을 기록하고 한 값으로 맞춘다.
2. **적재 중 표시**: 적재가 진행 중(`building`)이면 봉투 `basis` 를 '집계 중'으로 두고, 숫자 대신 상태를 낸다(plan 3.5).
3. **차트 블록**: `survey_stats(by=emd)` 결과에 `chart` 블록(plan 3.3)을 붙인다. 값은 봉투 id 로만 쓴다.
4. **읍면동 빈칸**: 최근 전역 분석 결과의 emd 가 전량 빈칸인 원인(읍면동 색인 없음·좌표계·범위)을 `postprocess.py` 에서 고친다. 새 결과의 빈칸은 0 이어야 한다. 기존 detections 67,141건은 서버 관리 작업(CPU)으로 채운다. 경계 밖은 `emd=null` 대신 '관할 밖' 표지를 단다.
5. **여수 93필지**: 여수(12130·46130) 필지 가운데 경계 +3km 밖 93개의 원인(좌표계·코드 중복)을 찾아 바로잡거나 적재에서 뺀다. 의심 필지 영향 0 을 유지한다.
6. **시도 이름 하나**: `regions.py` 에 `sido_label(code)` 를 두고 한 가지(plan 4절: 광주전남특별시)만 내보낸다. 보고서(c2-report-law)·요약·에이전트가 이 함수를 쓴다.
7. 다른 작업이 부를 수 있게 `survey_counts`·`sido_label` 사용법을 이 파일 끝에 한 줄씩 덧붙인다.

## 완료 기준 (측정 가능 · 화면만으로 · 두 시도 이상)
- K8: 남원(전북)·여수(전남광주)에서 "의심 필지"가 XI맵 머리·오른쪽 판·첫 화면·에이전트·보고서 5곳 모두 같은 값이다(스크린샷 + 값 표).
- 같은 세션에서 같은 질문을 3번 하면 같은 값이 나온다.
- K15: detections 읍면동 빈칸 67,141 → 0(관할 밖 표지 제외 · SQL 집계 기록). 새 분석 작업 1건(두 시도 중 1곳, c2-xi 와 함께)의 빈칸 0. 여수 경계 밖 필지 93 → 0.
- 시도 이름: 모든 화면·docx 에서 1가지(grep·docx 텍스트 검사).
- `server/survey/tests`·`server/agent/tests` 녹색.

## 사용법 (다른 작업이 부를 때 · c2-numbers 가 덧붙임 2026-09-30)
- 숫자 한 출처(비동기 · 게이트웨이): `from landxi_api.survey import survey_counts, counts_env` → `c = await survey_counts(conn, "12130")` → `c["suspect"]`(의심 필지) · `c["field_check"]`(현장 확인 필요) · `c["state"]`('building' 이면 두 값 None = '집계 중') · 봉투는 `counts_env(c, "suspect")`.
- 숫자 한 출처(동기 · 보고서·파이프라인): `from survey.nation import counts_sync` → `counts_sync(psycopg_conn, "52190")`(같은 식 · 같은 값).
- 시도 이름 하나: `from landxi_api.regions import sido_label, full_label` → `sido_label("12130") == "광주전남특별시"` · `full_label("전남광주통합특별시 여수시 …")` 는 머리 시도만 바꾼다.
- 화면이 읽을 자리: `GET /summary` 항목 `metrics.suspect`(label '의심 필지') · `metrics.field_check`(현장 확인 필요) · 적재 중이면 `survey_state:'building'` + note '집계 중'. `GET /survey/stats?sgg=` 의 `total`(= 의심 필지) · `field_check` · `state`. 읍면동 칸 합 = total.
