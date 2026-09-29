브리핑 확인: (1) 거절 문구는 명세 그대로만 쓴다: `이 기관의 데이터가 아닙니다`, `해당 지역 데이터가 없습니다`, 실패 시 `지금은 답할 수 없습니다`. 화면이 따로 만든 관할 문구는 없앤다. (2) 숫자는 한 곳에서만 읽는다. 답의 수는 `GET /api/v1/summary` 와 같아야 하고, 지어낸 숫자는 0이다. (3) 확인은 로그인 폼으로만 한다(세션 주입 금지). vLLM 재기동·종료 0, git 조작 0, 디자인 판단은 Fable 몫.

# fix-agent-scope 보고: 관할 밖 한 줄 안내와 실제 보유 데이터 답

## 원인
| 증상 | 원인 |
|---|---|
| 남원 담당자가 `여수시 해양쓰레기 몇 건이야?`를 물으면 응답이 없는 것처럼 보임 | 서버 가드는 이미 `이 기관의 데이터가 아닙니다`로 거절하고 있었다(0.6초, API 로 확인). 그런데 남원 첫 화면인 **gov-fusion 은 자체 관할 검사가 먼저 가로챈다**(`app.js` 652행, 캡처 단계). 그래서 명세에 없는 문구 `관할 밖 지역입니다 · 남원시 안에서 물어 주세요`를 띄우고 **2.6초 뒤 바를 닫는다**. 화면이 그대로여서 무응답처럼 보였다. 이 파일은 이 작업 소유가 아니다 → 아래 `요청`에 적었다 |
| 키트 바(cmdk)가 끝나지 않을 수 있음 | SSE 연결 실패는 무한 재연결이었고 타임아웃이 없었다. 빈 `answer_md` 는 빈 칸으로 끝났다. POST 오류는 `forbidden` 만 서버 문구를 보였다. 끝 상태를 표시하지 않았다 |
| 직원이 `여수시 해양쓰레기 결과 보여줘`를 물으면 `결과가 확인되지 않습니다` | 모델이 `results_stats` 를 **기본 세트(남원 토지피복)**로 불렀다. 여수 세트와 배포본의 관계를 아는 도구가 없었다 |

## 바꾼 것 (소유 파일만)
- **신설** `server/agent/tools/summary_lookup.py`
  - 도구 `summary_lookup(region?, card?)` 를 추가했다. 이 도구는 `landxi_api.summary.build(conn, tenant, region, card)` 를 부른다. 이 작업 도중 fix-server-summary 가 `summary.py` 를 만들었고, 지금은 그 정본을 쓴다.
  - `summary.py` 가 없을 때는 같은 시그니처의 얇은 어댑터 `build_fallback` 이 대신한다. `summary.py` 는 직접 만들지 않았다.
  - tenant 규약은 요약 API 와 같다: 기관 세션 = 기관 id, LX 세션 = `'lx'`, 게스트 = `None`.
  - 한 지역으로 모이면 `map_flyto` 로 지도를 그 시군구 범위로 옮긴다. 결과가 0이면 지도는 그대로 둔다.
  - 문장 속 지역·서비스 인식: 지역은 scope_guard 와 같은 규칙으로 찾는다. 서비스 낱말은 DB 카드 이름에서 뽑는다(예 `해양쓰레기`, `영농`, `도로`).
- `server/agent/runner.py`
  - `summary_lookup` 을 레지스트리에 등록했다(계약 `GET /api/v1/summary?region=&card=` · 읽기 · 로그인 세션만).
  - **요약 직행 `summary_route` → `answer_summary`** 를 추가했다.
    - 범위 가드를 통과한 질문 중 보유 서비스 낱말이 있는 질문(`몇 건`, `결과`, `현황`)이나 보유 질문(`어느 지역에 어떤 결과`, `보유`, `뭐가 있어`)은 **LLM 없이** 요약 도구로 답한다.
    - 답은 숫자 칩 자리표만 쓴다. 예: `… 해양쓰레기 실태조사 서비스는 운영 중입니다. AI 탐지 {{env:e1}} · 기관 신고 {{env:e2}}입니다.`
    - 항목이 0이면 `agent.rejected(no_region_data)` 로 `해당 지역 데이터가 없습니다` 를 낸다.
    - 실태조사 세부 질문(의심·필지·대장·지번·규칙·배포·실행 등)은 기존 도구 경로에 남긴다.
  - 시스템 프롬프트 9번을 추가했다: 보유 데이터 질문은 `summary_lookup` 으로 답한다.
  - `needs_llm()` 를 추가했다. LLM 사슬이 죽어도 거절·요약 한 줄은 낸다.
  - 회귀 판정을 `redteam_case()` 로 분리했다. 테스트와 LX 관리자 대시보드의 LLM 줄이 같은 판정을 쓴다.
- `server/landxi_api/agent.py`: `POST /agent/runs` 가 LLM 사슬 없음(503)을 **LLM 이 필요한 질문에만** 내도록 바꿨다. 거절·요약 직행은 LLM 이 없어도 202 로 실행된다.
- `landxi/v3/kit/cmdk.js`
  - 끝 상태를 `data-state = busy → done | rejected | failed`(+`aria-busy`)로 분명히 했다.
  - 서버 거절 문구는 그대로 한 줄로 보인다(`forbidden`, `out_of_scope`, `unauthorized`).
  - 다음 경우에는 `지금은 답할 수 없습니다` 를 보이고 끝낸다: SSE 연결 실패 3회, 끝 이벤트 없이 45초, 빈 답, 확인 카드 전송 실패. 확인 카드·분석 진행 중에는 10분까지 기다린다.
  - 이전 질문의 늦은 이벤트는 무시한다(질문 순번 확인).
  - 계획 줄 이름에 `보유 결과 확인` 을 추가했다.
- `landxi/v3/kit/cmdk.css`: 거절·오류 한 줄을 굵기 500, `--ink` 로 표시한다. 한 줄만 추가했다.
- `server/agent/redteam.yaml`
  - RT51–RT66 **16문항**을 추가했다: 관할 밖 4, 요약 직행 답 8, 자료 없음 3, 실태조사 질문이 요약으로 끌려오지 않는지 1.
  - RT42 의 기대 도구를 `results_stats` 에서 `summary_lookup` 으로 바꿨다.
- `server/agent/tests/`
  - `test_redteam.py` 는 50문항 이전(20문항 고정) 상태였다. 이번 작업 전에 이미 31개가 실패하고 있었다. `redteam_case` 로 전 문항을 판정하도록 다시 썼다. 매 테스트마다 새 연결 풀을 쓴다.
  - `test_tools.py` 는 대장 도구 5개와 요약 도구를 반영했다.
  - **신설** `test_summary_lookup.py`: 서비스 낱말 인식, 답 문장(숫자는 자리표로만, 명세 문구), tenant 규약을 검사한다. 게이트웨이가 떠 있으면 **에이전트 도구 값과 `GET /api/v1/summary` 값이 같은지**도 확인한다(직원·광주전남).
- `server/agent/tools/__init__.py`, `config.py`: 바꾸지 않았다. 등록은 기존 대장 도구와 같이 runner 에서 한다.

## 완료 조건 확인
확인은 모두 로그인 폼 입력 후 Ctrl K 로 했다. 세션 주입은 없다. 스크립트는 스크래치 폴더에 두었다.

| 조건 | 결과 | 증거 (`shots/fix/fix-agent-scope/`) |
|---|---|---|
| `namwon-manager@namwon` → `여수시 해양쓰레기 몇 건이야?` → 명세 문구 한 줄 | **합격(2차)**: 첫 화면(gov-fusion)과 XI맵 모두 `이 기관의 데이터가 아닙니다`. 바 유지, 지도 이동 0. 1차에는 첫 화면이 명세 밖 문구였다 → 2차 정비 | 첫 화면 `r2/after-1440-namwon-first.png` · `r2/after-390-namwon-first.png` · XI맵 `r2/after-1440-namwon-xi.png` · `after-390-namwon-xi.png` · 전 `after-1440-namwon-first.png`(1차, 명세 밖 문구) · `before-1440-namwon-yeosu.png` |
| `lx-staff` → `여수시 해양쓰레기 결과 보여줘` → summary 와 같은 수·상태 + 지도 이동 | `전남광주통합특별시 여수시 해양쓰레기 실태조사 서비스는 운영 중입니다. AI 탐지 1,857건 · 기관 신고 1건입니다.` 요약 API 도 같다(stage 운영, detected 1857, reports 1). 지도가 여수시로 이동. 1.6초, LLM 호출 0 | `after-1440-staff-console.png` · `after-390-staff-console.png` · 전 `before-1440-staff-yeosu.png`(`확인되지 않음`) |
| 광주전남 담당자 → 자기 관할 해양쓰레기 | **합격(2차)**: 첫 화면(gov-fusion)·XI맵 모두 같은 수·같은 상태(1,857건 · 운영 중), 바 유지. 1차에는 첫 화면이 `대장 필지 486필지`였다 → 2차 정비 | 첫 화면 `r2/after-1440-gj-first.png` · `r2/after-390-gj-first.png` · XI맵 `r2/after-1440-gj-xi.png` · 전 `after-1440-gj-first.png`(1차, 486필지) · `r2/before-1440-gj-xi-closed.png` |
| redteam 관할 밖·보유 데이터 10문항 이상 + 회귀 | 16문항 추가, 전체 66문항. 가드 수준(LLM 0): **정확도 100%, 거절 44/44, 답 22/22** | `redteam-guard.json` |
| 테스트 | `server/agent/tests` **128 통과**(라이브 라우터 4개 제외) | `pytest-agent.txt` |
| 화면 문구 forbidden `지어낸 용어` 0 | 답이 열린 바 + 화면 전체 스캔(키트 `scan`, 5장면): 모든 규칙 0건. CLI `forbidden.mjs --login lx-staff lx-console`: 0 · `namwon xi-clean`: 0 | `forbidden-*.json`, 장면별 스캔 결과는 이 보고서 |
| vLLM 재기동·종료 0 | `landxi-vllm-gemma` · `landxi-vllm-router` 모두 `Up 2 days`. 재기동은 `start-landxi.ps1 -Restart gateway` 한 번(게이트웨이만) | — |

추가로 확인한 장면:
- 직원 `순천시 해양쓰레기 몇 건이야?` → `해당 지역 데이터가 없습니다`, 지도 그대로(`after-1440-staff-nodata.png`).
- 직원 `어느 지역에 어떤 결과가 있어?` → 결과가 있는 서비스 3곳(상태와 AI 탐지 수 포함)을 답함(`after-1440-staff-inventory.png`).

## 2차 정비 (09-29 18:5x): 첫 화면에서도 합격
1차 확인에서 남원 합격 증거가 XI맵에서만 나왔다. 첫 화면(gov-fusion)과 광주전남 XI맵에는 아래 문제가 남아 있었다. 오케스트레이터 지시로 이 세 가지를 **최소 수정**했다. 두 파일은 이 작업의 소유 파일 밖이다(gov-fusion = fix-service-user-screens, xi-clean = fix-xi-live). 그래서 해당 줄만 고쳤다. 원본은 스크래치 `as2/gov-fusion-app.before.js`, `as2/xi-clean-app.before.js` 에 두었다.

| 문제 | 수정 | 파일 |
|---|---|---|
| gov-fusion 이 자체 관할 검사로 명세 밖 문구 `관할 밖 지역입니다 · {지역} 안에서 물어 주세요`를 띄우고 2.6초 뒤 바를 닫음 | 로컬 판정이 관할 밖이면 **키트 기본(서버 `/agent/runs`)으로 넘긴다.** 서버 범위 가드의 `이 기관의 데이터가 아닙니다`가 그대로 한 줄로 남는다. 자동 닫힘은 없다. 넘길 때 앞선 질문의 닫기 타이머와 요청은 끊는다(`askSeq`·`asking.abort`) | `landxi/v3/gov-fusion/app.js` 제출 처리부 |
| 대장이 결합된 기관에서는 모든 질문이 대장 질의로 감. 그래서 광주전남 `여수시 해양쓰레기 몇 건이야?` → `대장 필지 486필지` | 새 판정 `ledgerAsk(q)`를 둔다. 다음 중 하나라도 있으면 대장 질의로 본다: 대장·필지·지번·지목·용도지역·농업진흥·현장 확인/배정·리별 낱말, `keysOf` AI 조건(건물·주차장·비닐하우스·경작 흔적·농지·농업진흥), 규칙 매핑 결과, 대장 열 이름, 대장에 있는 리·읍면 이름. 그 밖의 질문은 `/agent/runs`로 넘긴다 | 같은 파일 |
| xi-clean: `map_flyto`를 받으면 1.6초 뒤 바를 닫아 답을 읽을 수 없음 | 답(`.k-ck-a` 글자)이 있거나 답이 오는 중이면 닫지 않는다(`hasAnswer()`). 답이 없는 지도 동작만 이전처럼 접는다 | `landxi/v3/xi-clean/app.js` `onAgent` |
| xi-clean: 이동 뒤에도 머리글이 이전 지역에 남음 | 보유 결과 답의 `map_flyto`에는 시군구 코드가 들어 있다. 이 코드로 지역을 바꾼다(`setRegion`). 요약은 새 코드(12130)를 쓰고 지도 경계는 옛 코드(46130)를 쓴다. 그래서 코드가 맞지 않으면 **범위 중심이 가장 가까운 시군구**로 맞춘다. 지역 문자열 하드코딩은 0이다 | 같은 파일 |
| xi-clean 광주전남 기본 지역 종로구(11110) | **이번 확인 시점에는 이미 여수시(46130)로 열림.** fix-xi-live 의 `homeRegion()`(요약 결과가 있는 시군구 우선)이 먼저 반영됐다. 이 작업에서는 바꾸지 않았다 | — |

### 2차 확인 (로그인 폼 → 역할별 첫 화면 → Ctrl K, 세션 주입 0)
증거는 `shots/fix/fix-agent-scope/r2/`에 있다. json 은 질문 뒤 0.7–13초 표본(바 열림·상태·답·머리글)이다.

| 장면 | 결과 | 증거 |
|---|---|---|
| 남원 담당자 **첫 화면**(gov-fusion) → `여수시 해양쓰레기 몇 건이야?` | `이 기관의 데이터가 아닙니다` 0.7초. 13초 뒤에도 바가 열려 있음(`state=rejected`). 지도 이동 0 | `after-1440-namwon-first.png` · `after-390-namwon-first.png` · `nw-first*.json` |
| 남원 담당자 XI맵 → 같은 질문 | 같은 문구. 바 유지 | `after-1440-namwon-xi.png` |
| 남원 대장 질의 회귀 `대장상 답인데 건물 있는 필지` | 이전처럼 대장 질의로 답함: `대장은 답 · AI는 건물 183필지`(지도 채색) | `after-1440-namwon-ledger.png` · `nw-ledger.json` |
| 광주전남 담당자 **첫 화면**(gov-fusion) → `여수시 해양쓰레기 몇 건이야?` | `… 해양쓰레기 실태조사 서비스는 운영 중입니다. AI 탐지 1,857건 · 기관 신고 1건입니다.` 지도 여수로 이동. 바 유지. (전: `대장 필지 486필지`) | `after-1440-gj-first.png` · `after-390-gj-first.png` |
| 광주전남 XI맵 → 같은 질문 | 여수시로 열림(머리글 `AI 탐지 · 여수시 1,857건`). 답 같은 수. 13초 뒤에도 바 유지. (전: 2.3초에 닫힘) | `after-1440-gj-xi.png` · 전 `before-1440-gj-xi-closed.png` |
| 직원 첫 화면(LX 직원 대시보드) → `여수시 해양쓰레기 결과 보여줘` | 같은 수·상태, `map_flyto` 1회, 바 유지 | `after-1440-staff-console.png` |
| 직원 XI맵(전국) → 같은 질문 | 답 같은 수. 지역이 여수시로 바뀌고 머리글 `AI 탐지 · 여수시 1,857건`이 답과 일치(전: `전국 1,079` 그대로) | `after-1440-staff-xi.png` |
| 요약 API 대조 | `GET /summary?region=12130&card=card-marine` 직원·광주전남 모두 `운영 · detected 1857 · reports 1` | `summary-yeosu-marine.json` |
| forbidden CLI `--login namwon-manager@namwon`, `--login gj-manager@gwangju-jeonnam` (gov-fusion · xi-clean) | 4화면 모두 금지어 0(지어낸 용어 포함), 콘솔 오류 0. 답이 열린 상태의 화면 스캔(키트 `scan`, 위 11장면)도 모두 0 | `forbidden-cli-namwon-manager.txt` · `forbidden-cli-gj-manager.txt` · `r2/*.json`의 `forb` |
| vLLM | `landxi-vllm-gemma`·`landxi-vllm-router` `Up 2 days (healthy)`. 이번 차수 재기동 0(게이트웨이도 재기동 안 함), 서버·에이전트 파일 변경 0 | — |

## 남은 것
- 요약 직행 답은 런타임이 쓰는 정해진 문장이다(LLM 호출 0). 요약 API 와 같은 수를 보장하려고 이렇게 했다. 문장을 더 자연스럽게 하려면 LLM 이 자리표를 쓰게 할 수 있다. 다만 그러면 GPU1 부하와 틀릴 위험이 생긴다.
- 도구 선택 정확도(LLM 이 실제로 `summary_lookup` 을 고르는지)는 `--llm` 모드로 재야 하고 GPU1 을 쓴다. 이번에는 돌리지 않았다. 요약 질문은 직행이라 LLM 을 거치지 않는다.
- 요약 항목 `imagery.has` 가 여수에서 `false` 로 나온다(항공영상 결과는 있음). 이것은 summary.py 소유다.
- 알림: 초기 기준 테스트 실행 두 번에 `test_router_live` 4문항이 포함됐다. 이 테스트는 라우터 :8001(HyperCLOVA 1.5B, GPU1)을 게이트웨이를 거치지 않고 직접 부른다. 짧은 분류 호출 8회였다. 그 뒤로는 제외하고 돌렸다.

## Fable 에게 넘길 것
- 에이전트 바 답 안의 숫자 칩(`numHtml`)이 문장 안에서 약 40px 큰 숫자로 커져 한 줄 읽기가 끊긴다(1440·390 모두). 답 문장 안 칩의 크기와 줄 흐름은 디자인 판단이 필요하다.
- 거절 한 줄(`이 기관의 데이터가 아닙니다`)은 지금 본문 한 줄에 굵기 500 만 준 상태다. 행동 하나(예: 자기 관할로 돌아가기)를 붙일지, K9 관할 밖 빈 상태와 어떻게 맞출지 정해야 한다.
- 직원 첫 화면에서 여수시로 이동해도 오른쪽·아래가 바다와 빈 타일 격자로 채워진다(시군구 범위가 섬까지 넓다). 이동 뒤 구도(결과 층 켜기 여부)를 정해야 한다.

- (2차) XI맵에서 답 바가 열린 채 유지되면서 왼쪽 위 큰 머리글 숫자(`1,857`)가 바 뒤로 가려진다(1440). 답이 있을 때 바와 머리글의 자리를 정해야 한다.
- (2차) 남원 첫 화면 390: 바 아래 지도에 회색 빈 띠가 보인다(fix-service-user-screens 보고의 '바다색 칸'과 같은 현상으로 보인다). 확인과 구도 판단이 필요하다.

## 요청 (남의 파일)
※ 1·2는 2차 정비에서 이 작업이 직접 최소 수정했다(위 표). 소유 작업(fix-service-user-screens · fix-xi-live)은 **이 수정을 덮어쓰지 말고 합쳐 달라.**
1. ~~완료~~ **gov-fusion(`landxi/v3/gov-fusion/app.js`, fix-service-user-screens 소유)**
   - 관할 가드 문구 `관할 밖 지역입니다 · {지역} 안에서 물어 주세요` 를 명세 `이 기관의 데이터가 아닙니다` 로 바꿔 달라. 또는 가드를 없애고 키트·서버 거절을 그대로 쓰게 해 달라.
   - 거절 한 줄을 2.6초 뒤 자동으로 닫지 말아 달라(무응답처럼 보인 원인).
   - 대장이 결합된 상태에서는 모든 질문을 대장 질의(`ask`)가 가로챈다. 그래서 광주전남의 `여수시 해양쓰레기 몇 건이야?` 가 `대장 필지 486필지` 로 답한다. 대장 낱말이 없는 질문은 키트 기본(서버 `/agent/runs`)으로 넘겨 달라.
2. ~~완료~~ **xi-clean(`landxi/v3/xi-clean/app.js`)**
   - 광주전남 기관의 기본 지역이 `11110`(종로구)으로 열린다(service-detail 보고와 같은 문제).
   - `map_flyto` 를 받으면 1.6초 뒤 바를 닫는다. 요약 답은 이동과 동시에 오므로, 답을 읽기 전에 닫힐 수 있다. 답이 있는 run 은 닫지 말아 달라.
3. **regions.py `derived()`**: 배포본 `dp-gj-marine-25` 의 AOI 가 광역이라 남원(52190) 등 60여 개 시군구에 붙는다. `scope_guard` 의 `no_region_data` 판정이 이 값을 쓴다. 요약 API 의 결과 중심 판정으로 바꾸는 것을 권한다. 이번 작업에서는 요약 직행이 항목 0 을 `해당 지역 데이터가 없습니다` 로 처리해서 화면에는 문제가 없다.
4. **`landxi/v3/kit/lint/forbidden.mjs` `frontDoor`**: 첫 실행에서 기관 탭 라디오를 누를 때 `<span>기관</span> intercepts pointer events` 로 30초 타임아웃이 났다(두 번째 실행은 통과, 불안정). `label.seg__c` 를 누르게 바꾸는 것을 권한다. 이 작업의 화면 확인은 같은 폼을 label 클릭으로 입력하는 스크래치 스크립트로 했다.
