# server 보고 — 최종 명세 §3 서버 변경 S-1…S-12

소유 파일만 고쳤다(§3 목록 + `server/seed/**` · `server/tests/**` · `server/adapters/**`). git 조작 0 · Ollama·vLLM 재기동 0 · GPU 직접 스크립트 0(추론 시험은 게이트웨이 작업 큐 · GPU0 한 장).

## 1. 결과 한 줄
- S-1…S-12 모두 실서버(:8700)에 있다. `server/tests` **122개 통과**(2분 44초 · 실서버 대상 · 19:45 실행). 전력 게이트 시험은 이제 실서버의 LLM 호출 예고와 격리되어, **동시 LLM 활동이 있어도 결과가 같다**(아래 §2-1 ⑥에서 실측).
- **실서버 pytest 는 기관 대장 의심을 지우지 않는다**(§2-1 ②에서 실측).
- `start-landxi.ps1 -Restart all` 3회 연속 → 매번 헬스 정상 · 워커 gpu 1 / cpu 2 · 이어서 e2e 묶음(계약 30 + S-1·S-3·S-4·S-8·S-9·S-12) 3회 모두 통과.
- 계약 문서 `docs/superpowers/blueprint/F1-CONTRACT.md` 끝에 **v1.2 절**(22항)을 붙였다.
- 정문 로그인으로 확인: 정문 기관 목록 = 서버 값(`/auth/tenants`) · 관리자 집 · 기관 집이 모두 서버 응답으로 뜬다. 촬영 중 API 응답 전부 2xx · 콘솔 오류 0.

## 2-1. 2차 판정 불합격 → 해결(이번)

| # | 문제 | 조치 | 확인 |
|---|---|---|---|
| ① S-2 정합성 | 새 반입의 규칙 판정이 그 기관의 규칙 L-* open 의심을 **반입 구분 없이** 지움. 반입 행 `findings{L*}` 는 저장값이라 남원 최신 반입 `imp_…1297` 이 L1 431 로 보고되는데 실제는 0 | ① 지우는 범위를 **같은 기관 · 같은 종류(kind) 반입**이 만든 open 의심으로 좁힘(판정·조치 붙은 의심 제외). ② 의심 id 를 기관별 `f_{rule}_{tenant}_{pnu}` 로(같은 필지를 두 기관이 올려도 서로 덮어쓰지 않음). ③ 반입 행 `findings{L*}` = `survey_findings` **실시간 집계**(한 출처 · 저장값은 '어떤 규칙을 돌렸나'만). ④ 최신 반입을 지우면 이전 반입이 최신으로 돌아오고 규칙을 **다시 판정** | 남원 `imp_01M3H6MGMA46QQEA5XV8RB1297` 재평가 → **L1 431 복구**(`survey_findings` 431 = 반입 행 보고 431 = `findings?rule=L1&ledger=` 431, 정문 로그인 `namwon-manager` 로 확인). 광주·전남 최신 반입 `imp_01M3H6P2E0P9AFRFA601BVVSQR` 는 하천 점용허가(river_permit) — 이 종류를 쓰는 규칙 L-* 가 없어 의심 0 이 정답(`findings {}`). 시험 `test_s2_reimport_supersedes_and_delete_restores` 신설 |
| ② 시험 격리 | `test_s2_ledger_flow` 가 실기관 남원에서 돌아 남원 대장 의심을 지움 | 대장 시험 3건(흐름 · 재반입/철회 · 기동 복구)을 **시험 기관 `lx-demo`**(공개 디렉터리 제외)로 옮김. 시험 계정 `pytest-ledger` 는 시험 모듈이 만들고 끝에서 지움. 대장 시험 2건은 시작·끝에 **실기관(lx-demo 밖) 대장 의심 · 반입 상태 스냅샷이 같음**을 단언 | **실측**: 전체 122개 실행 전 `survey_findings` L-* = `namwon · L1 · imp_…1297 · open · 431`, 실행 뒤 같은 값 431. 실행 뒤 `lx-demo` 반입 0 · 시험 계정 0 |
| ③ 계약 v1.2-16 | `PUT /registry/cards/{id}/ledger_schema` 에 `columns: ["pnu"]` → 500 | 객체가 아닌 항목 = 400 `bad_request` `{index, got}`(계약 오류 형식 그대로) · 계약 문서 16항에 한 줄 | `["pnu"]` · `[null]` · `[1, {...}]` 모두 400(`test_s6_cards`) · 정문 로그인 `lx-staff` 로 400 확인 |
| ④ 보고 정정 | §6 '`dp-gwangju-jeonnam-living-26` · `farm-26` 건드리지 않았다(반려·정리 필요)' 가 사실과 다름 | 삭제·정정(§6) | `audit_log`: `u_lx_admin` `deploy.delete` 14:23:41(living-26) · 14:50:34(farm-26) · 지금 `deploys` 에 없음 |
| ⑤ S-12 표기 | `-Status` 감시 문구 '15 s 헬스 · 3회 실패 시 재기동' ≠ 실제 감시 | 117행 `응답 대기 20 s × 연속 3회 실패 시 재기동(15 s 간격)` · 8행 주석도 같은 값 | 스크립트 본문(149–153행)과 일치 |
| ⑥ 시험 조건 | `test_power_gate` 2건이 실서버의 LLM 호출 예고(`power:llm_request` · 백엔드 프로브·에이전트 실행이 건다)가 켜져 있으면 실패 | 시험 프로세스 안에서만 예고 키 이름을 시험 전용으로 바꿈(autouse 픽스처). **실키는 지우지 않는다** — 지우면 실워커가 LLM 과 동시에 GPU 를 올릴 수 있어 전력 규칙 위반 | 실키를 60초 걸어 둔 채(`proof-concurrent-llm`) `test_power_gate.py` 5개 통과 → 실키 그대로 남아 있음을 확인한 뒤 해제 |

## 2. 1차에서 고친 것(앞선 서버 작업 위에서 판정 불합격 → 해결)

| # | 문제 | 조치 | 확인 |
|---|---|---|---|
| 1 | 대장 의심 상세·필지 카드가 500(`explain.three.ai.ratio` 맨 숫자) | AI 값 `ratio` · `m2` 를 봉투로 | `test_s2_ledger_flow` |
| 2 | `/ops/llm` 500(해시를 문자열로 읽음) | 해시로 읽고 `probe_ms` 봉투 | `test_s10_redteam_50_and_guard` |
| 3 | 에이전트 답의 `{{env}}필지이고` 단위가 안 지워짐 | 단위 뒤에 조사(이고·입니다·에서 …)가 와도 지움 · `건물` 같은 낱말은 그대로 | 같은 시험 |
| 4 | 옛 상태 전이 시험이 S-7(심기 결재)과 충돌 + 시험 배포본·`test restore` 결재 행을 남김 | 시험을 S-7 흐름으로 고치고 끝에서 지움 · 남은 시험 배포본 2건 정리 | `test_deploy_state_machine` · 시험 뒤 DB 잔여 0 |
| 5 | 계약 시험이 v1.2 새 키를 '계약에 없는 키'로 막음 | 픽스처는 그대로 두고 v1.2 선택 키 표를 시험에 둠 | `test_contract.py` 30개 |
| 6 | 게이트웨이 재기동이 기관의 대장 매칭을 끊으면 `matching` 으로 영영 멈춤 | 기동 시 이어 돌림(원본 없으면 사용자 문구로 `failed`) | 실제로 끊겼던 반입 1건이 재기동 뒤 `matched` · 시험 추가 |
| 7 | 기동 스크립트의 전력 검사가 Git Bash(32비트 셸)에서 조용히 건너뜀 | `Sysnative\nvidia-smi` 먼저 · 못 찾으면 경고 | `[power] 장당 상한 200 W · 고부하 0/1` 줄이 나옴 |
| 8 | 게이트웨이 감시가 기동 직후 바로 죽음(경로 공백 따옴표 누락) | 따옴표 · 감시는 20초 대기 × 3회 실패일 때만 재기동(바쁜 게이트웨이를 죽이지 않게) | `-Status` 감시 OK |
| 9 | 다른 기동이 워커 잠금을 쥐면 워커 없이 '정상'으로 끝남 | 잠금이 풀릴 때까지(≤ 90초) 기다렸다가 빠진 것만 · 5분 넘은 잠금 무시 | 3회 재기동 모두 워커 4개 |
| 10 | 게이트웨이가 몇 초씩 멈춤(감시가 한 번 재기동함) | Redis 키 훑기를 한 번에 크게(헬스 0.33초 → 0.01초) · 로그인 비밀번호 확인을 스레드로 · 시군구 경계를 기동 때 미리 · 꼬인 경계 62곳을 시드에서 바로잡음(첫 `/regions` 11.8초 → 0.7초) | 헬스 3회 0.01초 · 시험 3분 8초 → 2분 12초 |

## 3. 화면 팀 요청 중 반영한 것(코드 변경 없이 화면이 바로 쓰는 것)
- **lx-ingest**: 전남·광주 42개 시군구 경계가 사각형 → 새 코드(12xxx)를 옛 코드와 이어 실제 경계 · 새로 생긴 구 8곳은 V-World 실제 경계(사각형 0). 필지·의심 수도 옛 코드 자료를 그대로 이어 받음(`prev_cd`). `kind:join` 마감에 `counts{joined_parcels, parcels}`. 영상 항목에 `tile_ready`(등록 영상은 타일 작업이 끝나야 true).
- **lx-train**: 카탈로그 영상 항목에 소유 시군구 `sgg_cd` — 기존 16건은 이름 → 영문 id → 범위 겹침 순으로 채움(`seed/backfill_imagery_sgg.py`).
- **lx-review**: LX 표본 판정을 기관 필지 상태를 바꾸지 않고 영구 기록(`state` 없이 `verdict` 만 보내면 됨) · 규칙 통계에 `lx{judged, precision, verdicts}` 와 `field` 분리 · 재보정 `?scope=lx` · `검수 전 떼기`는 서버가 조건(표본 100 · 정밀도 80%)을 검사하고 승인되면 규칙 `reviewed:true`.
- **gov-report**: 담당 재지정(`assigned → assigned` + 담당) · 목록 항목에 `verdict` · 조치 종류를 화면 말 그대로(안내 · 시정명령 · 이행강제금 · 원상복구 · 없음) + 근거 조문 `law`.
- **ops-infra**: `/ops/queues` 의 끝난 작업이 '진행 중' 막대로 남던 것 정리 · `/jobs?since=` 기간 건수(`count`) · 고부하 기준은 `power_budget.threshold_w`(100 W)로 한 곳.
- **login**: 기관 목록 국내 먼저.

## 4. 반영하지 않은 것(이유)
- **lx-deploy** `health` 를 기관 단위 → 업무(규칙·결과 층) 단위로: 카드 ↔ 규칙 연결표가 서버에 없다. 연결을 지어내지 않았다. 카드에 `rules[]`(또는 결과 층)를 붙이는 결정이 필요하다. 지금 `health` 는 기관 단위 그대로.
- **gov-report** 보고서 초안 문구·.docx 개발 문자열(`server/agent/report.py`) · **gov-fusion** `/feedback kind: imagery_request`(`feedback.py`) · **ops-infra** `PUT /tenants/{id}/quota` → 결재(`quota.py`): 세 파일 모두 이 팀 소유 밖.
- **lx-ingest** 결합 속도(셔드당 약 30초) · `/jobs/{id}` 완료 셔드 목록: 이번 범위 밖.
- 시드 계정 이름이 역할과 같아 `LX 관리자 · LX 관리자` 로 겹치는 문제: 실명을 지어내지 않았다(키트 표기 처리 권장).

## 5. 정문 로그인 확인(촬영)
`shots/final/server/` — `_tools/capture.mjs` 로 다시 찍을 수 있다(세션 주입 0 · 서버 쓰기 0).
- `server-1440.mp4`(15초 · 1440×900 · 19:47 재촬영): 정문 → `기관` 탭(목록 = 서버) → `LX 관리자` 로그인 → 관리자 집(결재 대기 · 전력 예산).
- `server-1440-login-tenants.png` · `server-390-login-tenants.png`: 기관 목록 = `/auth/tenants`.
- `server-1440-ops-core.png` · `server-390-ops-core.png`: `/approvals?state=pending` · `/ops/gpus.power_budget` · `/events/ops`(:4173 에서).
- `server-1440-gov-fusion.png` · `server-390-gov-fusion.png`: 남원 담당자 → 대장 × AI 결합(S-2 · S-3) — 최신 반입 `imp_…1297` 을 읽음(반입 행 L1 = 실시간 431).
- `_capture.json`: 장면별 API 호출 표(전부 2xx) · 콘솔 오류 0.

## 6. 정직 항목
- 게이트웨이를 여러 번 재기동했다(`-Restart gateway` 짧게 + `-Restart all` 9회). 그 사이 다른 팀 화면이 잠깐 `서버에 연결할 수 없습니다`를 볼 수 있었다. 재기동으로 끊긴 기관 대장 매칭 3건 중 1건은 이어 돌려 `matched`, 원본 임시 파일이 없던 2건은 `failed`(사용자 문구) — 해당 팀이 파일을 다시 올려야 한다.
- 19:15 감시가 게이트웨이를 한 번 재기동했다(헬스 3초 대기 × 3회 실패). 원인(Redis 훑기 · 로그인 확인이 이벤트 루프를 막음)을 고쳤고 감시 기준도 20초로 늘렸다.
- 성능 시험 1건(`첫 셔드 ≤ 5초`)은 워커 재기동 직후 모델이 식어 있을 때 67초로 떨어졌고, 데운 뒤 다시 돌리면 통과한다. 이 한 건은 추론 1회(GPU0 한 장)를 쓴다.
- S-10 회귀 50문 정확도 100%는 **범위 가드(LLM 전)** 수준이다. 각본 밖 질문에 대한 LLM 답의 정답률은 재지 않았다(GPU 부하 회피).
- `검수 전 떼기` 서버 경로는 시험에서 가짜 판정 100건을 넣어 확인하고 지웠다. 실데이터에는 LX 표본 판정이 아직 0건이라 실제로 떨어진 규칙은 없다.
- 새로 생긴 구 8곳 경계는 V-World 에서 한 번 받아 캐시에 넣었다(8회 호출).
- (정정) 1차 보고의 '`dp-gwangju-jeonnam-living-26` · `farm-26` 을 건드리지 않았다(반려·정리 필요)'는 틀렸다. `audit_log` 기준 두 draft 는 `u_lx_admin` 이 이미 `deploy.delete` 했다(14:23:41 living-26 · 14:50:34 farm-26). 지금 배포 목록에 없고 정리할 것도 없다.
- 남원 대장 반입이 오늘 18건(대부분 다른 팀의 화면 시험)이다. 이번 수정 전에는 반입마다 이전 의심을 기관 전체에서 지웠기 때문에, 이전 반입 행의 저장값 'L1 431' 은 모두 낡은 숫자였다. 이제는 이전 반입의 수가 실시간 0(최신 반입으로 넘어감)으로 보인다.
- 이번에 게이트웨이를 `-Restart gateway` 로 1회 재기동했다(수 초).

## 7. 키트 요청
- 없음(서버 쪽). 화면 팀이 보고한 역할 칩 중복(`LX 관리자 · LX 관리자`)은 키트 표기에서 한 번만 쓰는 쪽을 권한다.

## 8. 바꾼 파일
이번(2차): `server/landxi_api/{ledger,registry}.py` · `server/tests/{test_f3_server,test_power_gate}.py` · `server/start-landxi.ps1`(8·117행 문구) · `docs/superpowers/blueprint/F1-CONTRACT.md`(v1.2-6 · v1.2-16 한 줄씩) · `shots/final/server/**`(재촬영). 데이터: 남원 최신 반입 규칙 L-* 재평가(`survey_findings` L1 431 행 · id `f_L1_namwon_*`).

1차: `server/landxi_api/{auth,survey,ledger,regions,approvals,catalog,jobs,ops,main}.py` · `server/agent/runner.py` · `server/adapters/survey/adapter_join.py` · `server/workers/{scheduler,gpu_worker,recovery}.py`(SCAN 한 줄씩) · `server/migrations/0004_ledger.sql`(끝에 추가) · `server/seed/{build_regions.py, sgg-simplified.geojson, backfill_imagery_sgg.py(신설)}` · `server/tests/{test_contract,test_guards,test_f3_server}.py` · `server/start-landxi.ps1` · `docs/superpowers/blueprint/F1-CONTRACT.md`(v1.2 절) · `shots/final/server/**`. 데이터: `02. 데이터/cache/regions/vworld-adsigg.json`(새 구 경계 8) · DB `imagery.sgg_cd` 16행.
