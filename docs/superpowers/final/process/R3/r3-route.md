# r3-route — 에이전트 길 나누기·가드 (C2)
> 시작 전에 반드시 읽는다: `E:/Land-XI 플랫폼/CLAUDE.md`, `01. 디자인/docs/CORE.md`, `USER-DIRECTIVES.md`, `PROCESS.md`, 이 폴더의 `plan.md`(특히 1·3·4·7절), `process/C2/c2-core-prove.md`(3차), `process/C2/c2-report-law-prove.md`(3차), `process/C2/c2-vlm-global-prove.md`(3차 권고).
> 보고 첫 줄은 "브리핑 확인: (규칙 3개)"로 쓴다. 보고서는 `R3/r3-route-report.md`, 증거는 `shots/process/R3/r3-route/` 에 둔다.

## 목표 한 줄
말한 대로 간다. 지도·분석 요청은 지도·분석 도구로, 법령 질문은 법령 도구로 간다. 실패한 동작은 실패라고 말하고, 도구가 낸 가드 문구는 그대로 전한다.

## 소유 파일
- `server/agent/runner.py` · `lint.py` · `backends.py` · `config.py` · `audit.py`
- `server/agent/tools/registry.py` · `from_contract.py` · `server/agent/tools/ext/__init__.py`
- `server/landxi_api/agent.py`
- `landxi/v3/kit/cmdk.js` · `cmdk.css` · `i18n.js` · `i18n/*`
- 새 테스트 `server/agent/tests/test_r3_route.py`

## 할 일
1. **M1 운영 안내 오분기** (`runner.py` 의 `route["intent"] == "ops" and not is_admin` 분기)
   - 운영 안내로 닫는 것은 `OPS_ASK`(GPU·대기열·경보·토큰·사용량·전력·서버 등)가 **글자로 맞을 때만** 한다.
   - 라우터가 ops 라고 해도 `MAPWORD`(zoom·layer·imagery·확대·축소·층·3D·이동)나 분석 실행 말(분석 실행·돌려·run analysis)이 있으면 도구 경로로 보낸다.
   - 기관 '○○군 전역 분석 실행해 줘/돌려 줘'가 같은 계정의 다른 시군구(강진)처럼 확인 카드로 가야 한다. 구례에서만 갈리는 이유를 찾아 적는다(관할·자료 가드, 라우터 분류 중 어느 쪽인지).
2. **M2 법령 질문 가로채기** (`ledger_route` · `summary_route`)
   - `LAW_ASK` 판정 함수를 만든다(plan 3.5). 맞으면 대장·요약 직행을 건너뛰고 법령 도구 경로로 간다.
   - 회귀: 대장을 올린 세션에서 "농지 전용 허가 없이 창고를 지으면 원상회복 조문은?" → 「농지법」 제42조를 인용한다(법령 순위 자체는 r3-law-report 몫이므로 여기서는 '법령 도구가 불렸다'로 판정한다).
   - 대장 조건 질문('대장상 농지인데 AI 가 건물')은 대장 직행을 그대로 유지한다(회귀 0).
3. **M3 개정일 숫자 가드** (`lint.py`) — 법령 도구 결과(원문 인용 · 개정·시행 연월일 `<개정 2023. 8. 30.>`)의 숫자는 가드에서 뺀다. 조·항·호 번호도 뺀다.
4. **서수·질문 숫자** (`lint.py`) — 질문에 나온 숫자와 서수(1st·2nd·3rd·3위·세 번째)는 허용한다. 'unverifiedrd' 0.
5. **M5 거짓 성공**
   - `cmdk.js` 는 `kit:agent-action-done` 의 `ok`·`reason` 을 run 에 모은다(plan 3.1).
   - 동작 문장을 낸 run 에서 동작이 모두 `ok:false` 이면, 답 끝 문장을 "지도를 {동작}하지 못했습니다 — {reason}"(영어 "Couldn't {op} — {reason}")으로 바꿔 보인다.
   - 서버 기록(run 상태)에도 `acts_ok=0` 을 남긴다(`landxi_api/agent.py` 에 동작 결과를 받는 자리가 없으면 만든다).
   - 3초 안에 done 이 없으면 '확인되지 않음'으로 표시한다.
6. **M10 가드 문구 그대로** (plan 3.2) — 도구 결과가 `status: no_data|outside|not_found` 이면 모델 경로를 끝내고 `text`(+`next`)를 그대로 답한다. 보고서·요약·영상 설명 도구 모두 같다.
7. **목록 답 모수**
   - `runner.py` 목록 답 모양의 두 자리가 같은 봉투를 쓰지 않게 한다. 모수는 해당 지역의 의심 필지 수 봉투(`survey_stats`), 상위 n 은 `shown` 을 쓴다.
   - 한국어 목록 답도 상위 5개 지번을 모두 말한다(영어와 같음).
8. **조사** — 숫자·단위 뒤 조사를 받침에 맞춘다('10필지를', '3건을'). 대장 직행 문장을 포함한다.
9. **명령 바 입력 사라짐** (`cmdk.js`) — '물어보기'·검색창으로 열자마자 친 글자가 사라지지 않게 한다. 연 직후 친 글자를 입력 칸에 넘긴다. 같은 입력이 두 번 붙는 일('읍면동별 차트로읍면동별 차트로')도 0으로 만든다.
10. **확인 카드 제목** (plan 3.4) — 도구 결과의 `title` 을 확인 카드에 그린다. 없으면 지금 글자를 쓴다.

## 완료 기준 (측정 가능 · 화면만으로 · 두 시도 이상)
- M1: 두 계정 조합에서 'Zoom in'·'Turn off the imagery layer'·'Zoom out' 각 3회가 모두 지도 동작 1건 이상 + 상태 변화로 끝난다. 운영 안내 0. 조합은 LX 직원 XI맵(전북 남원·경남 산청 화면)과 관리자 대시보드다. 기관 두 시도(광주전남 구례·전북 남원)에서 '○○ 전역 분석 실행해 줘'·'○○ AI 분석 돌려 줘' → 확인 카드 3/3. 비관리자의 진짜 운영 질문('GPU 상태', 'Show GPU status')은 여전히 운영 안내 한 줄이다.
- M2: 대장을 올린 두 시도 계정에서 법령 질문 4개(원상회복·허가 없이 건물·개발행위허가 대상·농지 전용 신고)가 모두 법령 도구로 가고 대장 필지 수 답은 0이다. 대장 조건 질문 회귀 0(값 = 도구 결과).
- M3·서수: 조문 답 5개에 '확인되지 않음' 0. 'Describe the imagery of the 3rd parcel'에 'unverified' 0.
- M5: 더 확대할 수 없는 상태에서 'Zoom in'을 하고, 해외 화면에서 'Turn off the imagery layer'를 한다(r3-global 이 ok:false 를 낼 때). 두 경우 모두 답이 실패를 말한다. 성공 문장 0.
- M10: 관할 안이지만 결과가 없는 시군구 2곳(광주전남 해남·나주, 전북 1곳) 보고서 요청에 "해당 지역 데이터가 없습니다" + 다음 할 일 한 줄이 나온다. 관할 밖 문구 0.
- 목록: "목포시 의심 필지 5곳 지번 보여 줘" → 모수 = 목포 의심 필지 값(화면과 같음), 지번 5개.
- 회귀: C2 3차 합격 항목(요약 ≠ 실행, 영어 단위, 관할 가드 K14) 재현 0. `server/agent/tests` 녹색 + `test_r3_route.py` 에 위 문장 전부 테스트.
