# F2-E 결과 — GeoAI 에이전트 AG-0 (Opus 5.5 · 2026-09-27)

XI맵 ⌘K → vLLM Gemma 4(:8000) 도구 호출 → 실태조사·플랫폼 계약 API → 지도 도착 · 숫자 검증기 · 확인 카드 → GPU0 실추론 · 보고서 초안 `.docx` · 실제 run 녹음 리플레이.
판정 영상 `shots/f2/E/f2e.mp4`(**3차 재녹화 58.7 s** · 1440×900 · 30 fps · on 모드 · 게이트웨이 :8700 · take6 · 작업 대기 19 s 한 곳 생략·자막 표기) · 사본 `shots/f2/F2-E/`. 1차 판정 수정 = **§12** · 2차 판정 불합격 7건 수정 = **§13**.

## 1. 한 줄 판정용 요약
| 축 | 이 에픽이 보이는 것(영상 초) |
|---|---|
| 완성형 | 채팅창이 아니라 지도가 반응: 계획 행 → 5필지 도착(HUD 124px `5 필지`) · 인용 [n] → flyTo + 필지 카드 v2 · 승인 → 9칸 극장 → job.done → XI.arrive → **HUD 124px `155 개` · '에이전트 · 실추론 도착'**(3차: 영상 ⑨ 43.4–51.3 s · `still-06-q3-arrived.png` · e2e `f2e-confirm` 가 `dataset.agentJobArrive` 뒤 HUD 텍스트 단언 — 2차까지는 `XI.hud?.set`(브리지에 없는 이름)과 폴리곤 fetch 경합으로 '스캔 중'에 남았다). 죽은 버튼 0(off 모드에서도 전 버튼이 녹음 재생·CSV 로 닫힘) |
| 유일함 | 에이전트가 **LX 실태조사 API**(`survey_stats` · `survey_findings`)와 **연속지적 필지**를 부르고, 답의 숫자가 전부 봉투 칩 |
| Hyper Solution | 문장 → 의심 필지 → 필지 카드(대장 vs 현황) → 보고서 초안(문장마다 [n]) → `.docx`(Word 렌더 확인) → 프레임 실추론까지 한 화면 |
| Hyper Performance | 화면 ms = `agent_tool_calls.ms`(e2e 단언) · 첫 토큰 · tok/s · 토큰 봉투 measured · GPU0 이용률(공유)·W · GPU 초당 7.50칩 · 벽시계 3.60칩/s |
| 일원화 | 같은 `run_…` id: 레인 칩 ↔ `agent_runs`/`agent_tool_calls`/`audit_log` ↔ SSE 스트림 ↔ 녹음 파일 · 같은 `job_…` id: 레인 극장 ↔ `GET /jobs` ↔ 관제 `?job=` 링크 · `usage_events(dim='llm_tokens', job_id=run_id)` → ops:events `usage.delta` |

## 2. 구현(소유 파일만)
| 경로 | 내용 |
|---|---|
| `server/agent/backends.py` | 사슬 vLLM `gemma-4-12b-it`(tools · `tool_choice:auto` · stream · `include_usage`) → 라우터 `hyperclovax-seed-1.5b`(map/report/ops/smalltalk · 형식 위반 시 규칙 보정 표기) → Ollama `qwen3:4b-instruct` → `LLMUnavailable`. 첫 토큰·tok/s·usage 실측 · 헬스 → Redis `agent:models`(30 s) · 인라인 도구호출 JSON 파서(폴백) · **외부 호스트 거부**(루프백·`*.landxi.internal` 만) |
| `server/agent/runner.py` | run 실행기 · SSE `agent.route/plan/tool.call/tool.result/tool.progress/confirm/confirm.decided/token/fallback/done/failed/rejected`(Redis `agent:runs:{id}` · 24 h) · 봉투 id(eN) 부여·데이터 블록·인용 전역 번호 · 확인 카드(60 s · Redis) · 런타임 단계(`map_arrive` 자동 · 실행 의도면 `jobs_submit` 확인 카드) · 승인 뒤 **작업 끝(job.done)까지 LLM 대기 → GPU0/GPU1 순차** · PG 영속·계량 |
| `server/agent/lint.py` | 숫자 검증기(자리표 밖 숫자 → **그 문장의 인용 [n] 봉투로만** 승격(`Scope` · 보고서 strict) · % 는 인용 필지 ratio 만 · 천단위/반올림/만·억 · 화이트리스트: 연도·날짜·좌표·PNU·법정동코드·지번·조문·규칙코드·서수·인용·**구조 코드(AG-6)·차수(2차)·포트(:8702)**) · nearest = 같은 답의 자리표 → 주 봉투 → 값 근접 · **봉투 뜻 검사 `meaning_rules`**(리·지번 뒤 집계 봉투 · 다른 규칙 건수 · 다른 필지 봉투 · '평균·전체' 주어에 필지 값) · **비교 방향 검사 `compare_check`** · 없는 인용 번호 제거 · 인용 없는 문장 검출 |
| `server/agent/tools/*` | `from_contract.py`(픽스처 method·path → OpenAI tools · 계약 밖이면 ValueError) · `registry.py`(명세·caps 교집합·쓰기=확인 2개·금지 이름) · `survey.py`(F2-S API 우선 · 404 때만 `survey_local.py` 정본 파일) · `results.py` · `jobs.py`(모델×영상 후보 순회 견적 · 제출 · job.done 대기) |
| `server/agent/report.py` | `POST /agent/report/draft` 사슬 5행: `survey_stats` → `survey_findings` → `llm_write`(봉투 뜻 표를 받은 Gemma 서술 3단락 · 토큰 스트림) → **`llm_review`**(strict 검증기 + 봉투 뜻 검사: 결정적 규칙 + LLM 교정자 표) → `survey_reports_draft`(**F2-S `build_draft(fmt='docx', realm, tenant)` 정본 서식** · 에이전트 인용 → F2-S 인용 번호 · 필지 = `(③ No k)` · 값 옆 뜻 라벨) |
| `server/agent/audit.py` | PII 마스킹 · 권한 밖 8범주 사전 차단 · 답변 경로 가림 · 데이터 블록 |
| `server/agent/record.py` · `bench.py` · `netblock.ps1` · `devserver.py` | 녹음기 · D0 벤치 · hosts 차단 스크립트 · 훅 전 개발 게이트웨이(:8703 · 지금은 안 씀) |
| `server/landxi_api/agent.py` | 라우터(F2-B 훅이 마운트 · `ext_routers.agent: mounted`) — runs · SSE · confirm · client ms · runs 목록/상세 · models · **alive** · report/draft · draft.docx |
| `server/migrations/0003_agent.sql` | `agent_runs · agent_tool_calls · agent_confirms` + RLS(detections 와 같은 정책) + 쿼터 시드 `llm_tokens_month`·`llm_runs_day`(추정 기반 초기값) · 멱등(2회 적용 확인) |
| `landxi/agent/*` | `panel.js mount(XI)` · **`marks.js`(도착 락온 마커 · 윤곽 강조 층)** · `cmdbar.js`(⌘K) · `plan-list.js` · `answer.js`(봉투 칩·취소선·인용) · `confirm-card.js` · `job-watch.js`(에이전트 쪽 극장) · `report-writer.js`(종이 SPLIT-5050) · `replay.js` · `api-agent.js` · `css/agent.css` · `data/replay/ag0-{namwon,verify,frame,report}.ndjson`(**전부 실제 run 녹음**) |
| `tests/e2e/f2e-*.spec.mjs` 8개 · `server/agent/tests/` 3개 | 아래 §4 |

## 3. D0 실측(`shots/f2/E/d0-bench.json` · 2026-09-27 02:57 · 순차 요청 · GPU0 유휴 확인 후)
| 항목 | 값 |
|---|---|
| 도구 호출 성공률(20문 × 3회) | **도구 이름 60/60** · JSON 유효 60/60 · **한국어 인자 정확 57/60**(실패 3 = '금지면 휴경' 에서 emd 누락 ×3) |
| 도구 라운드 첫 토큰 | p50 **197 ms** · p95 221 ms(프롬프트 p50 2,308 토큰) · 라운드 총 p50 698 ms |
| 서술 생성 | 첫 토큰 평균 70 ms · **58.8 tok/s**(256 토큰 × 3) |
| 라우터 :8001 | 18/18(모델 단독 16 · 형식 위반 2건은 규칙 보정 · 화면에 `router+rules` 표기) · p50 **105 ms** · p95 110 ms |
| 폴백 전환 | vLLM 연결 실패 감지 625–697 ms → Ollama 첫 토큰 428–647 ms(도구 호출 유지) · 사슬 전부 죽음 판정 1,254 ms · hosts 차단 시 17 ms(POST 503) — connect timeout 2.0→0.6 s 로 줄인 뒤 재측정(Windows 거부 SYN 재시도 ≈2 s 회피) |
| 운영 run(영상 · 게이트웨이) | 라우터 261–363 ms · 계획 첫 토큰 0.9 s 안팎 · 장면 1 제출→done 3.7–4.9 s · 도착 2.9–3.4 s(브라우저) · 보고서 5.6–7.9 s |
| GPU 전력 | 벤치 중 GPU1 평균 179 W · 최대 200.8 W(상한 200 W) · **GPU0 이용률 최대 0%** · 실추론(영상)은 GPU0 이용률(공유) 24.2%·58.7 W 동안 LLM 대기(순차) |
| 외부 클라우드 호출 | 0(코드 경로 없음 · 비루프백 URL 은 `host_not_allowed` · 테스트 `test_onprem_only`) |
| 컨테이너 조작 | vLLM·Ollama 종료·재기동 0(차단은 hosts/Redis 덮어쓰기만) |

## 4. 테스트
- pytest `server/agent/tests` **76 passed**(2차: `test_meaning.py` 17 추가 — 인용 범위 승격 · % 범위 · 봉투 뜻 4규칙 · 비교 방향 · 구조 숫자 · nearest 순서 · 뜻 라벨 평문 · F2-S 서식 매핑 · **F2-S 모듈 있으면 정본 경로 선택** · 실패 사유 기록 · 실제 시그니처): 검증기 13 · 레드티밍 20문 + 부속 7(게스트 401 실 HTTP 포함) · 도구 스키마/caps/열거·필수/온프레미스/라우터 규칙·실측 4클래스/인라인 파서/리플레이 녹음 형식 4.
- e2e(on · 게이트웨이 :8700 · `--workers=1`) **18 passed**(2차 재실행 · 04:45) — 추가 단언: 제출 즉시 바 닫힘 · 마커 수 = 필지 인용 수 · 화면 안 · ≥ 40px · 락온 시각이 스윕 ≥ · 숫자 ≤ · 윤곽 강조 층 · ops 질문 취소선 0 + '런타임 안내 · LLM 호출 0' + 이전 필지 카드 닫힘 + 다음 ⌘K 열림 · 초안 계획 5행 · **필지 문장에 연속지적 필지 수·다른 규칙 건수 자리표가 표기 없이 들어가면 실패** · .docx 경로 = f2s · 취소선 옆 칩 = 뜻 라벨 + 같은 답의 봉투. 1차 기록:: `f2e-cmdk`(계약 이름 · 화면 ms = 서버 ms · 벗은 숫자 0 · 칩 = 봉투 · 모델 칩 = run.model · 인용 → flyTo) + 게스트 요청 0 · `f2e-unverified`(on · off 녹음 취소선) · `f2e-confirm`(거부 → jobs 불변 · 승인 전 jobs 불변 → 승인 후 정확히 1개 → 극장 job.done) · `f2e-report`(토큰 길이 3회 이상 관측 · 인용 없는 문장 0 · 검증 안 된 숫자 0 · [3] → flyTo · `.docx` > 20 KB 파일명) · `f2e-redteam` UI 5문 · `f2e-off` 2(요청 0 · 콘솔 0) · `f2e-unavailable`(POST 0 · 콘솔 0 · 리플레이) · `f2e-law` 2.
- 판정 영상 녹화 run 콘솔 오류 **0**(503 콘솔 줄은 `/agent/alive` 선확인으로 제거).

## 5. 법전
- 에이전트 소유 요소의 blur(유리) **0** — 명령 바 = Linear 어두운 팔레트(잉크 .86) · 레인 = Palantir 디밍 잉크 스크림(.58) · 종이 작성기 = 흰 종이. `f2e-law` 가 에이전트 요소 blur 0 을 단언.
- **정직 표기(절대값 · 2차 재측정 04:45 e2e)**: 유리 면적 = 기본 **16.14%**(에이전트 없음) · ⌘K 열림 16.14% · 도착 뒤 **20.85%**(XI HUD 아래 카드). 판정자 측정은 기본 21.9% · 도착 뒤 20.85%(측정 창·패널 상태 차이). **≤ 15% 불충족** — 증가분은 전부 XI 크롬(F2-A)이고 에이전트 요소의 blur 는 0(e2e 단언) · 도착 마커는 blur 없는 브래킷 + 흰 90% 꼬리표. 에이전트가 `layerOn('survey:findings')` 를 부르면 XI 실태조사 패널이 열려 31.5% 가 되므로 **부르지 않고** 임시 층(도착)만 쓴다.
- 14px 미만 0(DOM·소스 스캔) · motion-law: 사다리 밖 지속 0(DOM `getAnimations` + CSS 소스) · 락온 380 = tokens-v2 `cw-lock-*` 키프레임 재사용.

## 6. 장치표(레퍼런스 → 자리)
| 장치 | 어디 |
|---|---|
| **Palantir AIP 단계 노출** | 계획 행: 순번 · 도구 이름(계약 API 그대로) · 왜 · ms 실측 · `런타임`/`서식` 출처 · 실행 중 행 스캔 빔 · 완료 락온 브래킷 |
| **Palantir 디밍** | 레인 바탕 = 무채 잉크 스크림(유리 대신) — 지도를 가리지 않고 글을 읽게 |
| **Linear ⌘K** | 상단 중앙 480 어두운 팔레트 · 예시 목록 ↑↓ · ↵ 실행 · esc · 실행 뒤 닫히고 레인으로 |
| FUI 브래킷 · 스캔 스트립 | 확인 카드 앰버 모서리 · 제출~plan 사이 1px 청록 빔(실이벤트에만) · 극장 미니 격자(shard.done 칸 점등) |
| 프로비넌스 칩(#7) | 답·초안·확인 카드의 모든 숫자 — 호버 = 꼬리표·뜻·출처·시각·note |
| Vantor 124px | 에이전트 도착 · 실추론 누적이 XI HUD 큰 숫자(브리지 `arrive`·`hud.set`)로 |
| Roboflow 타일별 진행 | 극장 9칸 점등 · 칸마다 탐지 누적 |

## 7. 세 사용자 표(AGENT-SPEC §4.4)
| 관점 | 첫 5초 | 손을 대면 | 끝나는가 | 불합격 신호 점검 |
|---|---|---|---|---|
| 공무원 | 한 문장 → 계획 3행 → 아영면 5필지 도착 | 칩 호버 → 출처 · [n] → 필지 카드(대장 vs 현황) | 초안 탭 → 타이핑 → `.docx` 3클릭(Word 렌더 확인) | 채팅만 ✕ · 지도 반응 ○ · 칩 없는 숫자 0(e2e) |
| LX 직원 | 도구 이름이 계약 API 이름(`survey_findings` · `jobs_quote`) | '이 프레임 비닐하우스' → 견적 확인 카드 → 승인 | GPU0 9 shard 극장 → 155 도착 · GPU 초당 7.50칩 | 블랙박스 ✕ · 확인 없이 제출 0(e2e: 승인 전 jobs 불변) |
| 관리자 | 모델 칩 = 실제 백엔드(헬스 ms) · 토큰 봉투 | `usage_events llm_tokens` · ops `usage.delta` · run 감사 | 관제 링 8 은 F2-C 몫(값은 흐름) | 에이전트 자동 조치 0 · 상수 tok/s 0(전부 usage 실측) |
| 공통 | 레인이 지도 위에 떠 있고 유리 증가 0 | 락온 380 · 토큰 도착 즉시 | 모델 칩 = run.model | 지어낸 숫자 → 취소선(영상 14.5–19.6 s) |

## 8. 레드티밍(`server/agent/redteam.yaml`)
20문 전부 차단: 타 기관 3 · 배포 롤백/교체 2 · 원본 경로 2 · 소유자 성명 2 · 쿼터 1 · 권한 상승 2 · 인젝션 2 · 검수 편집 1(모두 LLM 호출 전 `agent.rejected tool_forbidden` + `audit_log agent.tool_forbidden`) · 숫자 유도 2(검증기) · 도구 결과 안 인젝션 → `deploys_rollback` 호출 시 `run_tool` 403 · 기관 매니저 `jobs_quote`(caps 밖) · 게스트 401. UI 5문 e2e 통과.

## 9. 결손·한계(정직 · 2차 판정 뒤 갱신)
- **1차에서 실제로 일어난 검증기 오용(판정 지적 그대로)**: ① 영상 초안의 '평균 신뢰도는 97%' 가 1위 필지 conf 0.967 로 값만 같아 승격 ② 운봉읍 R2 초안 '공안리 31,211필지(연속지적 필지 수 e3) 및 화수리 431건(R1 건수 e4)는 등급 A로 분류' 가 '검증 안 된 숫자 0' 으로 통과 ③ 'GPU1 왜 느려?' 런타임 문구의 6·2·8702 가 취소선 ④ 취소선 옆 칩이 값-근접 무관 봉투(529건 · 20,872건). 모두 §12 에서 고쳤고 pytest 로 재현·차단한다.
- **봉투 뜻 검사의 범위**: 결정적 규칙 4종(리·지번 뒤 읍면동 집계 · 다른 규칙 건수 · 다른 필지 봉투 · '평균/전체/합계/모든' 주어에 필지 한 개 값) + 비교 방향 + LLM 교정자(Gemma 4 · temperature 0 · 문장 × ⟨eN: 뜻⟩ 표 → 어긋난 문장 번호 JSON). 교정자 없이(LLM 불가) 규칙만으로도 돈다. 규칙 밖의 미묘한 오용(예: 뜻은 맞지만 해석이 과장된 서술)은 여전히 사람이 칩 호버로 본다 → 표기 문장은 '봉투 뜻 확인 필요'(화면 · .docx).
- **LLM 산술 없음**: 차이·비율 산술 도구는 3차. 지금은 WRITER 프롬프트가 '퍼센트·평균·합계·차이 계산 금지' 이고, 계산해 쓴 숫자는 strict 검증기가 취소선 처리.
- **F2-S 정본 서식의 인용 체계**: .docx 의 [n] 은 F2-S '인용' 목록 번호다(화면 초안의 [n] 과 다름). 에이전트 봉투는 같은 값·같은 뜻 낱말로 F2-S 인용에 옮기고, 필지는 '(③ No k)' 로 ③ 표 행을, 등급별 건수는 '(② 집계표 R1 B)' 로 칸을 가리킨다. F2-S 인용 목록·표 어디에도 없는 사실(예: 전 규칙 합계)을 쓴 문장은 **거짓 인용 대신 .docx 에서 빼고 수를 `artifact.source` 에 적는다**(take4 초안은 0문장 제외).
- 에이전트 `survey_findings` 의 등급별 건수 봉투(`pri_A/B/C`)는 1차에서 첫 200행 페이지로 세던 결함 발견(아영면 R1 387행) → 전 행 페이지 순회 · 전 행을 못 받으면 봉투를 내지 않음(2차 수정 · F2-S ② 집계표와 67/272/48 일치 확인).
- `survey_findings` 의 `jimok` 필터는 v1.1-22 API 에 없어 에이전트가 받은 행(200행 페이지 순회 · 2,000행 상한)에서 거른다(봉투 source 에 표기).
- 'Word 열림': 이 PC Office 2016 정품 인증 마법사가 창을 가려, 영상 ⑧은 받은 .docx 를 Word COM 으로 PDF 내보내기 한 렌더 정지 컷 3 s(`rec/raw2/take4/draft-word.pdf`).
- 도착 마커는 브리지에 마커·투영 부품이 없어 `window.__xi.A`(XI 가 테스트용으로 내놓은 MapLibre 핸들)를 **읽기만** 하고, 그리는 것은 에이전트 소유 DOM(`#locks` 안 `.ag-mks`)과 `ag-hl-*` 임시 층뿐이다 → F2-A 요청 §10-4.
- 필지 카드 닫기: 브리지 `closeCard` 가 없어 새 질문 `reset()` 이 카드의 닫기 버튼(`#pcard2 .xi-x`)을 누른다 → F2-A 요청.
- 게이트웨이 재기동 중 run 은 `agent_runs.state='writing'` 으로 남는다(take3 04:37:04 에 다른 에픽이 게이트웨이를 재기동해 초안 run 1건 중단 — 녹화 재시도). 복구 sweep 에 agent_runs 포함은 F2-B 요청.
- 판정 영상 55.4 s(목표 ≈45 s) — ops 장면(취소선 0 증명)이 추가됐고 구간 안은 1배속 그대로(속도 조작 0). 잘라낸 곳은 장면 사이 대기뿐(`rec/build2.json` 에 원본 구간 시각).
- 비닐하우스 프레임 분석은 원본 래스터가 있는 25 cm(`ap25-namwon-2023` · `aerial25/best`)로 돈다.
- `landxi/agent/data/i18n-ko.json` 은 만들지 않음(다국어 제외 범위).

## 10. 계약 변경 요청 · 다른 에픽 요청
1. **v1.1-23 이벤트 추가**: `agent.route{intent, ms, backend, model}` · `agent.tool.progress{i, ui_actions}`(승인 직후 극장 열기) · `agent.tool.client{i, ms, ms_source:'browser'}` · `agent.fallback` · `agent.confirm.decided`. `agent.done` 에 `env_meta` · `unverified[]`(객체) · `promoted` · `bad_cites` · `uncited` · `perf{router_ms, first_token_ms, tps, total_ms, rounds}`.
2. **엔드포인트 추가**: `GET /agent/alive`(200 · 사슬 선확인 — 503 콘솔 오류 없이 리플레이) · `POST /agent/runs/{id}/client` · `GET /agent/runs/{id}/draft.docx`(계약의 `/files/agent/run_…/draft.docx` 대신 — `/files` 는 /api/v1 밖이라 훅 라우터로 못 붙음).
3. **인용 종류**: `citations[].kind ∈ stats | list | parcel`(목록 인용 = 조치 문장의 근거) · `geom`(필지 윤곽 SVG).
4. **F2-A**: ① XI 크롬 유리 16.14%(기본 · e2e)·20.85%(도착 뒤) → ≤15%(판정 측정 기본 21.9%) ⓐ `XI.lock({lngLat, bbox, html})` · `XI.project(lngLat)` 마커 부품(지금은 `window.__xi.A` 읽기 + 에이전트 DOM) ⓑ `XI.closeCard()`(지금은 카드 닫기 버튼 클릭) ② `XI.watchJob(jobId)` 브리지(XI 극장을 에이전트가 열게 — 지금은 `job-watch.js` 가 같은 SSE 로 레인 극장 + HUD + 도착) ③ 서랍 폭 모드(`:root[data-agent-draft="1"] .xi-drawer` 960 을 agent.css 가 임시로 둔다) ④ 첫 방문(서비스 워커 제어 전)에도 `panel.js` import ⑤ `XI.frame()` 이 XI 견적 카드를 함께 여는데 에이전트 확인 카드와 같은 견적이 두 번 보임 — 옵션 `{card:false}`.
5. **F2-B**: 원본 래스터 없는 영상 견적이 500(`TypeError path None`) → `cog_unavailable` 400 · 기동 스크립트가 `0003_agent.sql` 적용(이번엔 수동 2회 · 멱등).
6. **F2-S**: `GET /survey/findings?jimok=` · (정정) `build_draft(emd_cd, rule, top, narrative, fmt, realm, tenant)` 는 1차 때 **이미 있었고**(02:53) 에이전트가 `format=` 으로 잘못 불러 TypeError → 로컬 임시 서식으로 조용히 폴백하며 'F2-S 미도착' 이라 거짓 표기했다. 2차: `fmt='docx', realm=p.realm, tenant=tenant_of(p)` 로 정본 경로 사용 · 실패 시 예외 사유를 `artifact.source` 에 그대로(pytest 단언). 요청: `narrative` 에 필지 행 참조(예 `{"refs":[{"pnu"}]}`)를 받아 ③ 표 행 번호를 서식이 붙여 주기 · 인용 목록에 '전 규칙 합계' 추가.
8. **F2-B**: 게이트웨이 복구 sweep 에 `agent_runs.state ∈ (planning, tool, writing, waiting_confirm)` → `failed(gateway_restart)` 포함.
7. **F2-C**: `agent:models` 해시(30 s) · `usage_events(dim='llm_tokens')` · ops:events `usage.delta{dim:'llm_tokens'}` 흘림 — 링 8 은 관제 몫.

## 11. 산출물
`shots/f2/E/`: `f2e.mp4`(2차 · 55.4 s) · `strip-{arrive,verifier,typing,theater}.png`(100 ms) · `still-01…08-*.png` · `e2e-*.png` · `d0-bench.json` · `rec/record2.mjs`(녹화) · `rec/build2.py`(조립 · 구간표 `rec/build2.json`) · `rec/raw2/take4/`(원본 webm · marks.json · run id · 받은 .docx · Word PDF) · `rec/gpu-power-take3-4.csv`(500 ms 전력 로그) · `rec/debug-arrive.mjs` · 사본 `shots/f2/F2-E/`.
재현: `server/agent/netblock.ps1 -Setup` → `node shots/f2/E/rec/record2.mjs take4` → `python shots/f2/E/rec/build2.py take4` → `netblock.ps1 -Reset`. 리플레이 녹음 = take4 실제 run(`python -m agent.record run_… landxi/agent/data/replay/ag0-*.ndjson`).

## 12. 1차 판정 불합격 → 2차 수정(2026-09-27 04:00–04:47)
| 판정 지적 | 수정 | 증거 |
|---|---|---|
| lint · report: 진짜 봉투를 틀린 뜻으로 쓴 문장이 통과·승격('평균 신뢰도 97%' · 운봉읍 R2 '공안리 31,211필지 … 화수리 431건 … 등급 A') | ① 승격 후보 = **그 문장의 인용 [n] 봉투만**(`lint.Scope` · 보고서 strict · 지도 답은 + 첫 도구 주 봉투) · % 는 인용 필지 ratio 만 → '평균 신뢰도는 97% [1]' = 취소선(`value_outside_citation`) ② `llm_review` 단계: 결정적 뜻 규칙 4종 + LLM 교정자(⟨eN: 뜻⟩ 표) → 어긋난 문장 `meaning_flags` → 화면 `ag-uncited ag-meaning` + '봉투 뜻 확인 필요' 꼬리표 · .docx '[봉투 뜻 확인 필요]' ③ `render_plain` = '21,080필지(실측 · 아영면 연속지적 필지 수)' 뜻 라벨 ④ 입력단: WRITER 에 '쓸 수 있는 봉투' 뜻 표(규칙 보고서면 다른 규칙·전 규칙 합계 제외) | pytest `test_value_match_not_promoted_outside_citation` · `test_meaning_parcel_count_after_ri_is_flagged`(판정 문장 그대로) · e2e `f2e-report` 뜻 단언 · take4 초안 오용 0 · 운봉읍 R2 재현 2회 오용 0 |
| report.build_docx: F2-S `build_draft` 가 있는데 `format=` TypeError → 로컬 폴백 + 'F2-S 미도착' 거짓 표기 | `build_draft(emd_cd, rule, top, None, 'dict', realm, tenant)` 로 F2-S 인용·표를 받고 → 서술을 F2-S 인용 번호로 옮겨 `build_draft(…, narrative, 'docx', realm, tenant)` · `check_narrative` 통과 여부 · 제외 문장 수를 source 에 · 실패 시 `F2-S build_draft TypeError: …` 그대로 | pytest `test_build_docx_uses_f2s_canonical_path` · `test_build_docx_failure_reason_is_recorded` · take4 `artifact.source` = 'server/survey/report.py build_draft(fmt='docx', realm=lx) · F2-S 정본 서식 · LLM 서술 인용 검사 통과 · 서술 6문장' · 영상 ⑧ Word 렌더 |
| runner ops: 런타임 문구 6·2·8702 취소선 · '0 토큰' · 모델 없음 | `finish(…, lint_on=False)` · 모델 = `{id:'런타임 안내', backend:'runtime', label:'LLM 호출 0'}` · 토큰 칩 숨김 · 화이트리스트 AG-n · n차 · :포트 | pytest `test_structural_codes_ports_ordinals` · e2e ops 테스트 · 영상 ⑤ |
| answer.js · lint._nearest: 무관한 값-근접 봉투 | nearest = ① 같은 답에서 쓴 자리표 ② 첫 도구 주 봉투 ③ 값 근접(`nearest_by`) · 칩 앞 '도구 봉투 · {뜻}' · 뜻 없으면 칩 안 붙임 · 단위 중복 제거 | pytest `test_nearest_prefers_used_placeholder_then_primary` · e2e `f2e-unverified`(by=used · 라벨) · 영상 ④ '도구 봉투 · 남원시 전체 의심 필지 수 20,852' |
| panel map_arrive: 지도에 5필지 락온·마커 없음 | `marks.js`: 스윕 선이 필지 x 를 지나는 순간 [n] 브래킷(줌 무관 ≥ 40px · 흰 테두리 · cw-lock 380) + 주소 꼬리표 · 락온 단계에 윤곽 강조 층(흰 casing + 청록) · 마커 클릭 = 인용 · 새 질문 때 지움 | e2e 단언(마커 = 필지 인용 수 · 화면 안 · 스윕 ≤ 락온 ≤ 숫자) · `strip-arrive.png` · 영상 ③(스윕 20.37 s → 첫 락온 20.37+ → 도착 21.94 s 원본 기준) |
| panel · cmdbar: plan 없는 경로에서 바가 남음 · 이전 필지 카드 남음 | `startRun` 성공 즉시(그리고 리플레이·failed 에서도) `bar.close()` · `reset()` 에서 카드 닫기 | e2e ops 테스트(바 숨김 · 카드 닫힘 · 다음 ⌘K = 열기) |
| 결과 문서 §9·§10 사실 불일치 | 이 절 + §5·§9·§10 갱신(유리 절대값 · F2-S 정정 · 오용 사례) · 추가 발견: `pri_A/B/C` 첫 페이지만 세던 결함 수정 | — |

**판정 영상(take4 · 55.4 s)**: ⌘K → 라우터 map(341 ms) → 계획 3행(survey_stats 95.8 · survey_findings 156.4 · map_arrive 2,859 브라우저 ms) → 스윕 → [3]–[7] 락온 마커 → 124px '5 필지' → 칩 호버 → '대략 3만?' 취소선 + '도구 봉투 · 남원시 전체 의심 필지 수' 20,852 → 'GPU1 왜 느려?' 런타임 안내 · LLM 호출 0 · 취소선 0 → 초안 작성 5행(llm_write 6,785 ms · llm_review 162 ms) · 봉투 뜻 확인 필요 0 · 검증 안 된 숫자 0 → [3] flyTo + 필지 카드 → .docx(F2-S 정본) → Word 렌더 → 프레임 → 확인 카드 → 승인 → GPU0 극장 → LLM 답 → hosts 차단 → 리플레이 마스트. 녹화 콘솔 오류 0.
**GPU 전력(take4 창 04:40:20–04:41:40 · 500 ms)**: GPU1 최대 200.1 W(상한 200 W) · 평균 70.1 W · GPU0 최대 117.0 W(실추론 1회 · 이용률 최대 29%) · **두 장 동시 100 W 초과 0 샘플** — 실추론(04:41:22–23) 동안 GPU1 20 W(LLM 대기) → 끝난 뒤 LLM. (take3 창에는 다른 에픽의 GPU0 작업과 겹친 12 샘플이 있었고 그 take 는 버렸다.) vLLM·Ollama 종료·재기동 0 · 외부 클라우드 호출 0.


## 13. 2차 판정 불합격 → 3차 수정(2026-09-27 05:05–05:40)
| 판정 지적 | 수정 | 증거 |
|---|---|---|
| 확인 카드 '승인 · 실행' y=963(뷰포트 밖) · 레인 clientH 351/scrollH 624 · `focus({preventScroll:true})` | `confirm-card.js` 의 preventScroll 포커스 제거 → `panel.showConfirm(card)`: 카드가 레인보다 크면 그때만 `.ag-lane[data-confirm="1"]`(HUD 아래 가용 높이 − 16px · agent.css) · 카드 아래끝을 레인 아래끝에 맞춰 `scrollTop` · 두 프레임 뒤 한 번 더 · 그 뒤 포커스. 극장(job-watch)·승인 뒤 LLM 답도 같은 함수로 레인 안에 | e2e `f2e-confirm`: 카드·승인·거부 `getBoundingClientRect ⊂ viewport` 이고 레인 안 · 포커스 = 승인. 녹화 take6 마크: 버튼 top 823 · bottom 859 / vh 900 · 레인 clientH 463(넓힘) · scrollTop 140(자동) · `still-05-q3-confirm.png`(손 스크롤 0) |
| 초안 '387건 … [1]'([1]=21,080) 거짓 인용 | **원인 조사**: take4 `.docx`·`draft-word.pdf`·영상 ⑧(33.4–36.4 s) 셋 다 실제 텍스트는 `387건(… R1 무허가 건축 의심 건수)임 [2]`(python-docx·PyMuPDF 추출 · 영상 프레임 확인). '[1]'이 있는 파일은 **1차 산출물**(03:37–03:40 · run_260927034027b01602 · 로컬 임시 서식 · 에이전트 인용 번호라 [1]=「아영면 집계 · GET /survey/stats」)인 `shots/f2/E/draft-word.pdf` 와 `rec/실태조사_초안_아영면_20260927.docx` 로, 2차 때 교체하지 않고 남겨 둔 것이다 — 04:41 게이트웨이는 구버전 프로세스가 아니었다(take4 .docx 자체가 [2] · 에이전트 report.py 04:10 · F2-S report.py 02:53 이후 불변). 두 파일은 `rec/r1-stale/`(README)로 옮기고 현 산출물로 바꿨다. **대신 조사 중 take4 에 다른 거짓 인용 1건을 찾았다**: '점수 상위로 반환한 필지 수는 8필지 (③ 의심 상위 8건 표) [2]'([2]=387) — 집계 숫자가 표 칸만 가리키고 같은 값 인용이 없을 때 대체 번호(fallback)를 붙이던 경로. 수정: `narrative_for_f2s` 는 집계 숫자가 있는데 같은 값·같은 뜻 F2-S 인용이 없으면 **문장을 빼고 센다**(대체 번호는 집계 숫자 없는 조치·필지 목록 문장에만) · `_f2s_cite_for` 에 `_same_meaning`(미조치·A등급·연속지적 한정어 · 다른 규칙 코드면 같은 값이어도 인용 불가) | pytest `test_meaning.py` +3: `test_ay_aggregate_sentences_cite_same_value_same_meaning`(21,080↔[1] · 387 R1↔[2] · 8필지 문장 제외 · 모든 집계 문장 [n] 값 ∈ 문장 숫자) · `test_ay_same_value_other_meaning_never_cited`(387 이 [2][4][5][6] 모두 같은 값 — 미조치가 먼저 와도 R1↔[2]) · `test_ay_real_f2s_build_draft_citations`(F2-S `build_draft` 실호출 · PostGIS). 도구 실호출 재현 `shots/f2/E/rec/repro_draft.py`(POST /agent/report/draft → .docx → 문장별 인용 값 검사): run_2609270520144fff7a 거짓 인용 0 · take6 녹화 run_260927053142f6eea0 거짓 인용 0 · 영상 ⑦ Word 렌더 `[1] 21,080` · `[2] 387 R1` |
| 확인 카드 '면적 0.00 km²' | `answer.fmtVal` → `sig()`: \|v\| < 1 은 유효숫자 2자리(0.003 · 0.39 · 0.97) · 0 이 아닌 값이 '0'/'0.00' 으로 보이는 경우 0 · 칩에 `data-v`(원값) | e2e `f2e-confirm`: 칩마다 `data-v ≠ 0` 이면 표시값 ≠ 0 · 0.003 km² → '0.003' 단언(실측 로그 `q_area 0.003 → "0.003"`) |
| 리플레이 ms '실측' 꼬리표 | `replay.play` 가 모든 이벤트에 `recorded_at`(녹음 시각) · `recAt()` → 라우터 `341.2 ms 기록 · 09-27 04:41 녹음` · 계획 행 `95.8 ms 기록 04:41`(title = 녹음 시각 · '이 세션에서 잰 값 아님') · 발문 첫 토큰 칩 basis recorded · tok/s `기록 hh:mm` · 토큰 칩 recorded. '실측'은 이 세션 값만(map_arrive 는 지금 브라우저가 재므로 '브라우저') | e2e `f2e-off`(라우터 '기록 · MM-DD hh:mm 녹음' · 행 '기록 hh:mm' · 라우터·행·발문에 '실측' 0) · `f2e-unavailable`(같은 단언) · `still-08-q4-done.png` |
| [n] 클릭 뒤 2–4 s 늦게 열린 필지 카드가 새 답 위에 남음 | `S.tok`(질문 토큰) — `reset()` 이 올리고 `cite()` 는 flyTo·parcelCard 뒤마다 확인 → 무효면 카드가 열린 직후 `closeCards()`(다음 프레임 한 번 더) · `dataset.agentCiteStale` | e2e `f2e-off` 신규 '인용 카드가 열리는 중에 새 질문 → 이전 필지 카드 0'(여는 중 확인 → 새 질문 → stale 표지 → 카드 0) · `e2e-off-cite-race.png` |
| job.done 뒤 HUD '스캔 중' · 큰 숫자 안 보임 | 원인 2: ① `XI.hud?.set` — 브리지 이름은 `XI.hudSet`(진행 중 누적이 HUD 에 안 감) ② job.done 순간 shard 폴리곤 fetch 가 덜 끝나 `XI.arrive` 가 빈/부분 폴리곤으로 돌거나 호출 조건 실패. 수정: shard 폴리곤 fetch 를 모아 `Promise.allSettled`(최대 4 s) 뒤 `await XI.arrive` · 실패·폴리곤 0 이면 `XI.hudSet(counts_env)` · `dataset.agentJobArrive = arrive|hud` · `agentJobArrived = N` | e2e `f2e-confirm` approve: `agentJobArrive` 뒤 `#hud-status` ≠ '스캔 중' · `#hud-scene` = '에이전트 · 실추론 도착' · `#hud` ∋ N(19) · take6 마크 `q3.arrived {how:arrive, n:155}` + HUD 텍스트 · 영상 ⑨ · `still-06-q3-arrived.png`(HUD 124px `155 개`) · `e2e-confirm-theater.png`(`19 개`) |
| 유리 ≤ 15% · XI 견적 카드 중복(F2-A) | **F2-E 단독으로 닫을 수 없음** — 유리는 XI 크롬(#scrub · #hud-bot · .cw-glass · #panel)이고 에이전트 요소 blur 0(e2e). XI 견적 카드는 `XI.frame(geom)` 이 연다(`{card:false}` 없음 · 영상 ⑧ 왼쪽 카드). `f2e-law` 에 `F2A_GLASS=1` 이면 절대값 ≤ 15%(기본 · 도착 뒤) 단언을 켜는 스위치를 넣었다 → **F2-A 이관 · 통합 판정에서 F2-A 반영 뒤 `F2A_GLASS=1` 로 재실행** | §10-4 ① ⑤ |

**검증(3차 · 05:40)**: pytest `server/agent/tests` **79 passed**(+3) · e2e `tests/e2e/f2e-*` **19 passed**(+1 · on · `--workers=1`/off `--workers=2`) — 같은 lx 계정으로 다른 에픽이 동시에 job 을 내 '새 job = 1개' 단언이 한 번 깨져 **이 run 의 `jobs_submit` 성공 단계 = 1 · 브라우저 POST /jobs = 0 · 새 job 중에 agentJob 포함**으로 바꿨다.
**판정 영상(take6 · 58.7 s)**: ① ⌘K · 모델 칩 → ② 라우터 map · 계획 3행 ms → ③ 스윕 → 락온 마커 → `5 필지` · 칩 호버 → ④ '대략 3만?' → `3만` 취소선 + '검증 안 된 숫자' + '도구 봉투 · 남원시 전체 의심 필지 수' 20,852 → ⑤ 초안 작성 타이핑 · 5행 → ⑥ [3] flyTo + 필지 카드 → ⑦ .docx → Word 렌더(21,080↔[1] · 387 R1↔[2]) → ⑧ 프레임 · 확인 카드 전체 화면 안 → 승인 → ⑨ GPU0 극장 → (작업 19 s 생략 · 자막) → job.done → HUD `155 개` → LLM 답 → ⑩ hosts 차단 → llm_unavailable → 리플레이 마스트 · ms '기록 04:41'. ops 장면('GPU1 왜 느려?')은 길이 때문에 뺐다(2차 영상 ⑤ · e2e 로 유지). 녹화 콘솔 오류 0 · 브라우저 POST /jobs 0.
**GPU 전력(take6 창 05:31:03–05:33:0x · 0.5 s · `rec/gpu-power-take6.csv`)**: GPU1 최대 200.2 W(상한 200) · 평균 62.1 W · GPU0 최대 167.8 W(실추론) · **두 장 동시 이용률 > 50% 0 샘플** · 두 장 동시 100 W 초과 5 샘플(05:31:11–12 페이지 부팅 때 GPU0 105 W·이용률 0% + vLLM 99 W · 05:32:34–35 실추론 직후 GPU0 전력 꼬리 117–132 W·이용률 0% 에 LLM 답 시작) — 실추론(05:32:29–33) 동안 GPU1 21 W(대기) · 합계 최대 ≈ 300 W. vLLM·Ollama 종료·재기동 0 · netblock `-Reset` 완료. (take5 는 전력 로거 실패로 버렸다.)
**작업 중 환경**: 05:15 다른 에픽이 GPU 워커를 멈춰 첫 approve e2e 가 90 s 초과(내 job 0/1 대기) → 05:20 워커 복구 · 다른 에픽 378 shard 작업이 끝나 GPU0 유휴를 확인한 뒤에만 vLLM 장면·녹화를 돌렸다. 게이트웨이는 report.py 반영을 위해 05:14 `-Restart gateway` 1회(running 0 확인 뒤).
**산출물 교체**: `shots/f2/E/f2e.mp4` · `strip-*.png` · `still-01…08-*.png`(이름 바뀜: 03 report-done · 04 report-cite3 · 05 q3-confirm · 06 q3-arrived · 07 q3-done) · `draft-word.pdf` · `실태조사_초안_아영면_20260927.docx`(take6) · `rec/record3.mjs` · `rec/build3.py`(`rec/build3.json`) · `rec/raw3/take6/` · `rec/repro_draft.py` · `rec/repro/*.json|docx` · 1차 잔재 `rec/r1-stale/` · 2차 정지 컷 `shots/f2/F2-E/r2-stale/`.
