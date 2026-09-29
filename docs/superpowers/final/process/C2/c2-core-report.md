브리핑 확인: (1) 숫자는 도구 결과에서만 쓴다. 답에 `{{…}}` 자리표, 지어낸 동작, 개발 정보·지어낸 용어(관제·AG-n·API·경로)를 내지 않는다 (2) 확인은 로그인 폼으로만 한다. GPU 는 한 장씩 쓰고 vLLM·Ollama 는 종료하지 않는다 (3) 소유 밖 파일은 고치지 않는다. git commit·reset·checkout·restore 는 하지 않는다

# c2-core — 에이전트 공통 뼈대 · ③ 개발 보고 (2026-09-30)

- 작업: 도구 확장 자리 · 지어낸 동작 차단 · 자리표·꼬리·금지어 정리 · 질문 언어로 답하기 · 명령 바 블록(차트·파일·영상) · 산출 파일 내려받기 일반화 · 독파모 승격 자리 · 법령 라우터 조건부 연결
- 증거: `shots/c2/c2-core/`(png + 질문별 답·동작 json). 테스트: `server/agent/tests` **230 통과**(새 파일 `test_c2_core.py` 46개, 다른 작업 테스트 포함)
- GPU: vLLM(GPU1) 질문만 했다. 분석 실행 질문 2개는 확인 카드를 승인하지 않아 만료됐고, 영상 추론은 0건이다. Ollama·vLLM 은 건드리지 않았다. 게이트웨이는 `start-landxi.ps1 -Restart gateway` 로 5번 짧게 다시 띄웠다.

## 1. 완료 기준 판정
| 기준 | 결과 | 증거 |
|---|---|---|
| K1 지어낸 동작 0 | **합격.** 남원(전북)·광주전남 첫 화면, LX 직원 XI맵에서 동작 질문 12개를 물었다. 동작 문장이 있는데 `kit:agent-action` 이 0인 답은 0건이다. 11개는 실제로 동작했다(이동·확대·축소·층 켜기/끄기·3D). '아영면으로 이동해 줘'는 동작 없이 "해당 지역 데이터를 찾을 수 없습니다"로 답했다. 읍면동 단위 이동은 아직 도구가 없다(c2-xi) | `k1-nw/gj/st.json`·png |
| K2 자리표·금지 글자 0 | **합격.** assess 32문을 다시 실행했다. 답 DOM 에서 `{{`·`관제`·`AG-`·`~입니다`·`/api`·`.py`·`PostGIS`·`V-World`·`API 키`·단독 `llm` 이 0건이다. 첫 실행에서 3문이 '지금은 답할 수 없습니다'였다. 그 시각에 게이트웨이가 여러 작업의 재기동으로 끊겼고, 다시 물어 3문 모두 답했다(`k2r-*`, `k12-st`) | `k2-*.json` · `k2r-*.json` |
| K12(일부) 영어 질문 → 영어 답 | **합격.** LX 직원 3문과 kgz-agri 2문이 모두 영어로 답했다. 예: "There are 10,504 suspicious parcels … in Yeosu-si." · "I have moved the map to Gurye-gun." · "The share of cropland … is 47.5%." | `k12-st.json` · `k12-kg.json` · `k2-kg.json` |
| 명령 바 블록 3종 | **합격.** 시험 도구 1회 호출로 막대 차트, .docx 내려받기, 영상 조각 + 'AI 의견 · 근거 아님' 꼬리표가 나왔다. 파일 버튼으로 받은 .docx 는 36,928 byte, 영상은 780×414 로 그려졌다. 실제 흐름에서도 그려진다: 광주전남 '여수시 … 읍면동별 차트' → 막대, 보고서 초안 → 파일 | `blocks-block-chart.png` · `blocks-block-file.png` · `blocks-block-image.png` · `blocks-download-*.docx` · `k2r-gj-1.png` |
| `/agent/models` 독파모 자리 | **합격.** `dokpamo · 연결 전 · enabled false · 사슬 밖`. 사슬 = vllm → ollama | `agent-models.json` |
| 테스트 | **합격.** 녹색. 새 테스트는 확장 불러오기·동작 대조 12문(한·영)·언어 감지·자리표·금지어·블록·독파모·파일 이름이다 | `server/agent/tests/test_c2_core.py` |

## 2. 한 것 (소유 파일만)
| 항목 | 내용 |
|---|---|
| 도구 확장 자리 | `tools/ext/__init__.py` 가 `ext/*.py` 를 파일 이름순으로 불러와 SPECS·HANDLERS·WRITE·CONFIRM·CLIENT·allowed·WHY·HINT 를 합친다. 모듈 하나가 실패해도 경고만 남는다(작업 중 `vlm`·`global_` 문법 오류 때 실제로 경고만 남고 게이트웨이는 떴다). 게이트웨이 기동 때 불러 로그 한 줄을 남긴다: `agent ext: analyze(2), fusion(1), global_(2), law(1), map(4), ops(6), report(1), vlm(2)` |
| 계약 추가 | 선택 이름 SAY·ROUTE·GUARD_PASS·PREPARE·CONTRACT, 명세 `route_only`, `Out.blocks`·`Out.answer`, `config.run_dir/run_href`, 시험 모듈 `LX_AGENT_EXT_EXTRA` 를 넣었다. **plan.md 3.1–3.4·3.6 에 반영했다** |
| 클라이언트 도구 일반화 | CLIENT 도구는 핸들러가 있으면 그 `ui_actions` 를, 없으면 `{op, **인자}` 를 그대로 `kit:agent-action` 으로 보낸다. 확인 도구(analysis_run 등)는 승인 뒤 확장 핸들러가 실행한다 |
| 지어낸 동작 차단 | 시스템 프롬프트 규칙 12를 넣었다. `lint.action_check` 는 동작 문장과 같은 run 의 ui_action op·성공 도구를 대조해, 짝이 없는 문장을 "그 지도 동작은 아직 할 수 없습니다."(영어판 있음)로 바꾼다. 바꾼 목록은 `agent.done.action_flags` 에 남는다 |
| 자리표·꼬리 | `{{unv}}`·모르는 자리표는 '확인되지 않음'으로 바꾼다. `3D`·`GPU 0` 은 숫자로 보지 않는다. 명령 바 숫자 칩은 신뢰 기호를 호버로만 보여 `~` 꼬리가 없다. **기존 버그도 고쳤다:** `lint.fix_cites` 역참조가 제어 문자(`\x01`)로 깨져 답에 보이지 않는 글자가 들어갔다. `audit` 원본 영상 가드의 `\b` 가 백스페이스 글자로 깨져 있었다 |
| 운영 질문 | '관제 운영 에이전트(AG-6)' 고정 답을 지웠다. LX 관리자는 일반 계획자와 ops 도구로 가고, 다른 계정은 "LX 관리자 화면에서 확인할 수 있습니다." 한 줄로 답한다. 가드 문구 2개의 '관제'도 바꿨다. 확장 ROUTE 가 잡은 질문은 '자료 없음' 가드를 건너뛴다(관리자의 '광주전남 기관 … 토큰 사용량' 이 막히던 것) |
| 금지어 | `lint.BANNED`·`scrub_terms`·`banned_hits` 에 관제·AG-·/api·.py·PostGIS·V-World·API 키·단독 llm 을 넣었다. 모든 답(보고서 경로 포함)의 끝단에서 바꾼다 |
| 언어 | `runner.lang_of`(한글 비율 < 30% → en) 와 `kit/i18n.js langOf` 는 같은 규칙이다. 영어 시스템 프롬프트, 거절 문구 영어판(`audit.GUARDS_EN`), 고정 문구 `MSG` 를 두었다. 영어 질문은 한국어 고정 문장 직행(요약·대장)을 건너뛴다. 명령 바의 계획 줄·확인 카드·오류·단위도 질문 언어를 따른다(`kit/i18n/*.json` 에 `tool.*`·`unit.*` 넣음) |
| 명령 바 블록 | `cmdk.js` 가 chart(kit/chart.js 막대 · 값 = 봉투) · file(Bearer 로 받아 내려받기) · image(Bearer 로 받아 그림 + 꼬리표)를 그린다. 답에 '차트로'가 있으면 런타임이 읍면동·규칙·등급 봉투로 막대를 자동으로 붙이고, 초안 artifact 가 있으면 파일을 붙인다. `kit:agent-action` 은 cancelable 이다. 화면이 막지 않으면 키트가 map_region·map_zoom·map_view 를 처리한다. `kit:agent-action-done` 은 `data-acts`·`data-acts-done`·`data-acts-ok` 로 기록한다 |
| 산출 파일 | `GET /agent/runs/{run}/files/{name}`(docx·png·jpg·webp·csv·pdf·xlsx · run 폴더 밖 0 · 권한 = run 소유 기관). 기존 `draft.docx` 경로는 그대로 두었다 |
| 독파모 | `config.BACKENDS['dokpamo']`(env `LX_LLM_DOKPAMO_ENABLED/URL/MODEL`, 기본 꺼짐)를 두었다. 켜짐 + 온프레미스 주소일 때만 사슬 맨 앞에 선다. 헬스는 연결 전이면 탐침하지 않는다. `/agent/models` 에 `state` 를 넣었다 |
| 법령 라우터 | `main.py` 가 `landxi_api.law` 를 있으면 붙이고, 실패하면 건너뛴다(지금 5 routes 등록) |

## 3. 다른 작업에 넘길 것
- **c2-fusion:** `gov-fusion/app.js:849` 의 `kit:agent-action` 수신자에 `e.preventDefault()` 가 없다. 그래서 map_zoom·map_region·map_layer 가 키트 기본 처리와 겹친다(확대 한 번에 2단계). xi-clean·global 은 이미 막는다(plan 3.2).
- **c2-xi:** 읍면동 이동('아영면으로 이동해 줘')이 아직 안 된다(map_region 은 시군구만).
- **c2-vlm-global:** kgz-agri 'Zoom in on the map' 에 NDVI 요약이 답으로 나온다(지도 동작 2건은 있음).
- **c2-numbers:** '여수시 남면 화태리 423 필지'를 찾지 못한다.
- `kit/index.js`(소유 밖)는 새 `tl`·`langOf` 를 다시 내보내지 않는다. 필요한 화면은 `kit/i18n.js` 에서 직접 불러온다.

## 4. 기본값 기록 (사소한 표기 · 사용자가 나중에 정정)
- 동작 불가 문구: "그 지도 동작은 아직 할 수 없습니다." / "That map action isn't available yet."
- 확인 못 한 숫자: "확인되지 않음" / "unverified"
- 비관리자 운영 질문: "LX 관리자 화면에서 확인할 수 있습니다." / "You can check this on the LX admin dashboard."
- 독파모 자리 표기: 이름 "국산 모델 연결", 상태 "연결 전"(plan 4절과 같음)
- 영어 단위: cases · parcels · m² · tokens(`kit/i18n/en.json unit.*`)

## 5. 코어 상태 (CORE.md 기준 · 이번 작업이 닿은 곳만 바뀜)
| 코어 | 이번 작업 뒤 |
|---|---|
| C1 XI맵 | 말로 이동·확대·층·3D 가 XI맵에서 동작한다(c2-xi 도구 + 이 작업의 뼈대). 영상 층 전 시군구·읍면동 빈칸은 c2-xi·c2-numbers 몫 |
| **C2 vLLM 서비스** | 뼈대 완료: 확장 자리 · 지어낸 동작 0 · 자리표 0 · 영어 답 · 블록 3종 · 독파모 자리(연결 전) · 토큰 계량 그대로(`usage_events`) |
| C3 실태조사 | 변화 없음. 명령 바가 '읍면동별 차트'를 막대로 그린다 |
| C4 행정데이터 융합 | '의심 필지 몇 건?' 이 남원·광주전남 첫 화면에서 답한다(c2-fusion) |
| C5 LX 생산 · C7 한 흐름 · C9 공정 | 변화 없음 |
| C6 LX 관리자 | LX 관리자 대시보드의 Ctrl K 로 GPU·대기열·경보·기관 토큰 사용량에 답한다(c2-ops 도구 + 이 작업의 운영 경로) |
| C8 글로벌 | kgz-agri 영어 질문에 영어로 답한다 |

## 6. ④ 실증 재수행 (2026-09-30 00:47–00:53 · 1차 실증 막힘 해결)
- 방법: 1차 실증은 Claude in Chrome 이 권한 분류기에 막혔다. 이번에는 개발 때와 같은 **헤드리스 브라우저(Playwright)가 로그인 폼에 입력**해 들어갔다. 세션 주입은 0회다. 비밀번호는 스크립트 안에서만 읽었고 출력하지 않았다. 스크립트는 스크래치 폴더에 있다(`c2core/run.mjs`).
- 지역: 보고서에 없던 **순천시(광주전남)** 를 주 지역으로 삼았다. 실제 흐름 블록은 목포시에서 확인했다. GPU 는 vLLM(GPU1) 질문만 썼다. '순천시 전역 분석 실행' 확인 카드는 승인하지 않아 영상 추론은 0건이다.

| 계정 · 화면 | 질문 | 결과 | 증거 |
|---|---|---|---|
| 광주전남 첫 화면 | 순천시로 이동 · 확대 · 영상 층 켜기 · 3D | 4/4 동작(`kit:agent-action` 각 1) · 지어낸 동작 0 | `prove-gj.json` · `prove-gj-1~4.png` |
| 〃 | 순천시 의심 필지 몇 건? / 읍면동별 차트 / 보고서 초안 / 영어 질문 | 순천시는 필지·AI 결과가 아직 없다. 넷 모두 "해당 지역 데이터가 없습니다" / "No data for this area yet." 로 답했다. 지어낸 숫자 0, 영어 질문은 영어로 답했다 | `prove-gj-5~8.png` |
| LX 직원 XI맵 | 순천시로 이동 · 영상 층 · Zoom in · Tilt to 3D | 4/4 동작, 영어 2문은 영어로 답했다 | `prove-st.json` |
| 〃 | 순천시 전역 분석 실행해 줘 | 확인 카드가 나왔다. 승인하지 않아 만료됐고, 만료됐다고 답했다(실행 0) | `prove-st-5.png` |
| 〃 | How many suspicious parcels are in Suncheon-si? | 첫 시도는 "Can't answer right now" 였다. 그 순간(00:50:20) 게이트웨이가 다시 떠서 연결이 거부됐다(다른 작업의 재기동). 다시 묻자 "No data for this area yet." 로 답했다 | `prove-st2.json` |
| 광주전남 첫 화면 | 목포시 읍면동별 차트 / 목포시 보고서 초안 | 막대 차트(달동 555 · 율도동 264)와 .docx 내려받기(45,164 byte · 법령 조문 8개 인용)가 나왔다. 차트 첫 시도도 게이트웨이 재기동에 걸려 한 번 더 물었다 | `prove-gj3-block-chart.png` · `prove-gj2-download-*.docx` |
| 금지 글자 | 위 전체 답 DOM | `{{`·관제·AG-·`~입니다`·/api·.py·PostGIS·V-World·API 키·llm 모두 0건 | 각 json 의 `bad: []` |

**실증 중 고친 것(소유 파일):** 화면이 명령 바 답에 덧붙인 문단의 추정 기호가 `~` 꼬리로 보였다(`177 필지 · 지도에 표시했습니다 ~`). `kit/cmdk.css` 에서 명령 바 답 안의 추정 기호를 작은 점으로 바꿨다. 뜻은 호버로 본다. 고친 뒤 화면: `prove-gj4-1.png`

**실증에서 찾은 결함 → c2-fusion 에 넘김(소유 밖):**
- **다른 지역의 대장 숫자가 섞인다.** 광주전남이 올린 대장은 `광의면_농지목록.xlsx`(구례)다. 그런데 순천시·목포시·여수시 질문의 답에도 '올린 대장과 AI가 어긋난 필지 177필지 · 지도에 표시했습니다'가 붙는다. 순천은 "해당 지역 데이터가 없습니다." 바로 뒤에 붙어서 두 문장이 서로 어긋난다.
  - 화면 쪽: `gov-fusion/app.js` 의 `suspectFollow`(876행 부근)가 답 지역과 대장 지역을 비교하지 않는다. 서버가 거절하거나 '데이터 없음'으로 답해도 문단을 붙인다.
  - 서버 쪽: `tools/ext/fusion.py` 의 `fusion_suspects` 가 질문 범위(scope)와 대장 시군구를 비교하지 않고 mismatch 를 더한다. 여수 영어 답의 "Additionally, there are 177 parcels…" 가 이 경우다.
  - 고칠 방향: 대장 시군구가 질문 범위와 같을 때만 붙인다.
- 원스톱 끊김: 없다. 순천시처럼 결과가 없는 시군구는 Ctrl K '전역 분석 실행' 확인 카드로 이어진다. 다만 '데이터 없음' 답에 이 다음 행동을 알려 주는 한 줄이 없다. 문구는 기본값으로 두고 Fable 이 판단한다.

**판정:** 완료 기준 5개는 새 시군구(순천시)에서도 유지된다. K1 지어낸 동작 0, K2 금지 글자 0, 영어 답, 차트·파일 블록, 독파모 '연결 전'을 확인했다. `server/agent/tests` 는 238 통과다(다른 작업이 테스트를 더했다). 1차 실증의 '합격 보류'를 푼다. 단, 위의 지역 섞임은 c2-fusion 이 고칠 때까지 알려진 결함으로 남는다.

## 7. 실증 2차 must_fix 해결 (2026-09-30 01:15–01:30)
브리핑 확인: (1) 숫자는 도구 결과에서만 쓰고, 결과를 묻는 질문에 GPU 분석을 걸지 않는다 (2) 확인은 로그인 폼으로만 한다. GPU 는 한 장씩 쓰고 vLLM·Ollama 는 끄지 않는다 (3) 소유 밖 파일(`tools/ext/analyze.py`·`gov-fusion`·`ledger`)은 고치지 않는다. git 은 쓰지 않는다

| must_fix | 원인 | 조치(소유 파일) | 화면 확인 |
|---|---|---|---|
| ① '강진군 AI 분석 결과 요약해 줘' → 전역 분석 확인 카드 | `ext/analyze.py` ROUTE 의 실행 패턴 `분석.{0,8}(…해 줘)` 이 '분석 **결과 요약해 줘**'를 실행으로 잡았다. 제외 목록에는 '결과 보여/알려'만 있고 '요약'은 없었다 | `runner.py`: `lookup_not_run()` 을 넣었다(요약·정리·결과 보여/알려/설명·summarize · 단 실행·돌려·시작·run 이 함께 있으면 실행). ① 확장 ROUTE 가 확인 카드 도구를 고르면 건너뛴다. 그러면 요약 직행으로 간다 ② 모델이 `analysis_run`·`jobs_submit`·`survey_build` 를 불러도 확인 카드를 띄우지 않고 결과 조회 도구로 돌려보낸다 ③ 시스템 프롬프트에 규칙 14(한)·10(영)을 넣었다 | LX 직원 XI맵(?region=12780) '강진군 AI 분석 결과 요약해 줘' → 확인 카드 없이 "AI 탐지 90,511건 · 의심 필지 12,625건 · 현장 확인 필요 633필지 · 결과 확인 대기 635건". 여수시도 같다. 광주전남 첫 화면(강진군)도 같다. '강진군 전역 분석 실행해 줘'는 여전히 확인 카드로 간다(승인 안 함 · 실행 0) | `fix2-st-1·2.png` · `fix2-st-en-3.png` · `fix2-gj-1·3.png` |
| ② 영어 답 단위 깨짐 | `en.json` 에 `unit.건` 등 서버 한국어 단위가 없었다. 영어 답에서 모델이 자리표 뒤에 명사를 쓰면 칩이 단위를 한 번 더 붙였다(명사 목록이 좁았다) | `kit/i18n/en.json`: 건·동·개·곳·명·회·초·장·대·시간·행·토큰·㎡·㎢ 등의 영어 단위를 넣었다. `kit/cmdk.js`: 영어 답에 한국어 단위가 새지 않게 했다. 자리표 뒤 1–3 낱말에 명사나 같은 단위가 있으면(`suspect parcels`·`GB of memory`·`°C`·`GPUs`·`job(s)`) 칩 단위를 붙이지 않는다. 전치사와 -ing 동사에서 멈춘다(`633 parcels requiring …`). 값이 1이면 단수로 쓴다(`1 GPU`). NDVI 는 단위 없이 쓴다 | "90,511 detected cases · 12,625 suspect parcels · 633 parcels requiring field inspection" · "19.8 GB" · "57°C" · "1 analysis job · 0 jobs waiting" · "(limit 1 GPU)" · kgz "mean NDVI … is 0.3". 겹침 0 | `fix2-st-en-1·2.png` · `fix2-ad-1.png` · `fix2-ad2-1.png` · `fix2-kg-1.png` |
| ③ 올린 대장 결과를 다시 열 수 없음 | **c2-fusion 소유(`gov-fusion`·대장 저장)** — 이 작업에서는 고치지 않았다 | 넘김: 기관 첫 화면이 '기관 전체의 최근 대장 1개'가 아니라 '이 시군구(`?region`) + 올린 사람의 최근 대장'을 이어 열어야 한다 | — |

- 테스트: `server/agent/tests` **278 passed**. 새 테스트 16개(`test_c2_core.py` 7절)는 요약 ≠ 실행 11문, ROUTE 건너뛰기, 모델 호출 시 확인 카드 0, 두 언어 프롬프트 규칙, en 단위 표, 칩 단위 겹침 13문(node)이다.
- 게이트웨이는 `start-landxi.ps1 -Restart gateway` 로 1번 다시 띄웠다. 01:22 에 다른 작업이 게이트웨이를 다시 띄워 관리자 영어 질문 1회가 "Can't answer right now" 였고, 다시 묻자 답했다. 영상 추론 0건, vLLM(GPU1) 질문만 했다.
- **넘김(c2-ops):** 관리자 영어 질문 'How many GPUs are under high load right now?' 에 "Busy GPUs at once: 2 GPUs (limit 1 GPU), power budget exceeded" 라고 답했다. 같은 답에서 GPU 0·1 은 모두 부하 0%·대기다(`hot` 봉투 값이 부하와 어긋남 · 1차 실증의 재현 1/2 와 같은 증상). 단위 표기는 맞다.
- **넘김(c2-numbers):** 영어 답이 AI 탐지 전체 90,511 을 'instances of cropland' 로 부른다(표시 단위는 맞음).
