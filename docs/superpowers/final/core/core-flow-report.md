브리핑 확인: (1) 남원은 예시일 뿐 — 지역 하드코딩 금지, 새 지역(여수)이 남원과 같은 코드 경로로 돈다 (2) 화면에 작업 id·GPU 이름·경로·ms 노출 0, 용어는 CLAUDE.md §2 표만(이식·심기 → 다른 지역에 적용) (3) GPU 한 장·게이트웨이 대기열로만, 확인은 로그인 폼으로만, git commit/reset 금지

# core-flow 보고 — 관리·생산·서비스를 한 흐름으로, 새 지역에서 (코어 ④)

2026-09-29 · Opus 5.5 · 브리프 `core-flow.md` · 공통 `_common.md`

## 한 줄 요약
LX 직원이 여수에 서비스를 적용하면, LX 관리자가 결재하는 순간부터 사람 손을 거치지 않고 흐름이 끝까지 이어집니다. 순서는 영상 선택 → 시범 단계 전환 → 시군구 전역 AI 분석(GPU 한 장, 4,453칸) → 결과 반영 → 실태조사 적재입니다. 광주전남 담당자의 첫 화면에는 여수 영농관리 결과 **AI 탐지 17,612건**이 따로 설정하지 않아도 나타납니다. LX 관리자 화면에서는 같은 작업의 GPU 사용량, 기관별 사용량, 배포 단계가 한 덩어리로 보입니다. 영상이 없는 시흥시는 AI 분석을 돌리지 않고 `영상 등록 필요` 상태로 두며, LX 직원 할 일로 남습니다. 남원 수치는 바뀌지 않았습니다(회귀 0).

## 2차 보완(21:40–21:55) — 확인 부족 2건 해결
| 지적 | 원인 | 조치 | 증거 |
|---|---|---|---|
| lx-deploy '다른 지역에 적용' 시트가 10초 안에 배포본 서랍으로 덮임 | 10초 폴링이 `JSON.stringify(flow)`를 비교했는데, `flow.imagery.coverage.as_of`가 요청마다 새 시각이라 매번 '변경'으로 판정 | `lx-deploy/app.js` 폴링: ① 열린 서랍이 배포본 서랍이 아니면(적용 시트 등) 아무것도 하지 않음 ② 비교 키를 `state · job_id · survey_job_id · steps[].state`로 한정 | `shots/core/core-flow/r2/staff-plant-sheet-kept.webm`(약 20초), `staff-plant-sheet-kept-15s-1440.png`, `.log`. 시흥(기본 선택)에서 적용 시트를 연 채 21초 동안 `/deploys` 재요청 0건, 입력값 '목포' 유지 |
| 광주전남 담당자 첫 화면·서비스 화면에 목포·여수 결과 수치가 안 보임 | gov-fusion: (a) 상태 카드는 AI 색인이 없는 관할에서만 (b) `slice(0,2)` (c) `?region=`을 무시. service-detail: 배포본에 `scale` 봉투가 있어야만 summary 항목과 이어 줌 → 새 배포본은 늘 '첫 결과 전' | **gov-fusion**: summary 한 출처의 '내 서비스' 줄(항목마다 시군구 · 서비스 · AI 탐지, 누르면 `?region=시군구`)을 첫 화면 좌상단에 항상 표시. `?region=시군구`면 그 시군구 배포본 범위로 열고(대장 이어 열기 없이) 상태 카드에 그 시군구 항목만. 상태 카드 최대 4개. **service-detail**: 시군구에 적용된 배포본(`sgg_cd`, 초안 아님)은 같은 카드 · 같은 시군구 summary 항목과 바로 연결. 영상 조각이 없는 지역은 결과 자리에 '{시군구} · AI 탐지 n건' | `r2/gj-manager-home-1440/390`(목포 2,066 · 여수 17,612 · 여수 해양쓰레기 1,857), `r2/gj-manager-mokpo-gov-*`, `r2/gj-manager-yeosu-gov-*`, `r2/gj-manager-mokpo-svc-*`, `r2/gj-manager-yeosu-svc-*`(서비스 지역 표: 목포 시범 · 현장 확인 필요 113필지, 여수 시범 · 524필지) |

- 두 번째 새 지역 **목포(12110)**: 한 흐름이 끝까지 돌아 LX 관리자 배포 시트에 적용 요청 → 결재 → AI 분석 → 실태조사 → 기관 결과가 모두 완료로 나옵니다(`r2/lx-admin-admin-flow-mokpo-1440/390.png`: 'GPU 서버 · 끝 · 2분', 'GPU 사용 26초', '사용량 광주전남특별시 · GPU 26초', '배포 단계 검증'). 이로써 여수 · 목포 두 지역에서 같은 코드 경로로 확인했습니다.
- 검사(로그인 폼만): gj-manager · lx-staff · lx-admin, 1440 · 390 모두 금지어 **0**(`r2/lint.log`), 콘솔 오류 **0**(`r2/console.log`). 이전 gj-manager 금지어 2건(대장 파일 이름)은 이번 첫 화면에서 재현되지 않았습니다.
- `python -m pytest server/tests`: **205 passed**(실패 0).
- 남원 영향: service-detail 연결 규칙 변경으로 남원 생활환경 · 도로 배포본도 summary 항목과 이어지지만 두 항목 모두 summary 가 '첫 결과 전'이라 화면 변화 없음. summary 값 자체는 손대지 않음(회귀 0 유지). 참고로 summary 현장 확인 필요 값은 실태조사 결과 확인이 진행되며 조금씩 바뀝니다(목포 110→113, 남원 1,079→1,078) — 모든 화면이 같은 시각 같은 값을 읽습니다.
- 소유 밖 수정(코어 막힘 해소용 최소 수정, core-fusion · 서비스 상세 담당에 알림): `landxi/v3/gov-fusion/app.js`(서비스 줄 · `?region` · 상태 카드 4개), `landxi/v3/gov-fusion/gov-fusion.css`(`.gf-svcbar` 추가분만), `landxi/v3/service-detail/app.js`(`itemOfDeploy` · 결과 자리 문구). 수정 전 사본은 스크래치 `cf/*.bak`.
- 기본값으로 정한 것: 서비스 줄 표기 '{시군구} {서비스 이름} AI 탐지 n건', 정렬은 시군구 코드 → 탐지 수, 최대 6줄. 배치 · 위계는 Fable 몫.

## 완료 조건 대조
| 조건 | 결과 | 증거 |
|---|---|---|
| 여수: lx-staff 로그인 폼 → lx-deploy에서 서비스(영농관리)를 여수에 적용 | 통과 | `shots/core/core-flow/yeosu-01-staff-plant-1440.png`, `yeosu-02-staff-requested-1440.png`, 영상 `video/yeosu-1-staff-plant.webm`(약 10초) |
| lx-admin 로그인 폼 → 결재 | 통과 | `yeosu-03-admin-inbox-1440/390.png`, `yeosu-04-admin-sheet-1440.png`, `yeosu-05-admin-approved-1440.png`, 영상 `video/yeosu-2-admin-approve.webm` |
| 결재 뒤 자동 AI 분석(대기열, GPU 한 장) | 통과 | 작업 1건(`aerial25/best` × `img-12130-2023-aerial`, 시군구 전역, 4,453칸) 20:54:48 → 21:05:56, GPU 261.8초(계량 561행) |
| 실태조사 적재 | 통과(1회 자동 재시도 포함) | `survey_sgg` 12130: 필지 307,137 · 결합 27,946 · 의심 36,992. 첫 적재는 core-survey 쪽 SQL 오류로 실패했고, 흐름이 실패를 감지해 실태조사만 다시 돌렸습니다(아래 실측 참고) |
| 광주전남 담당자(로그인 폼) 첫 화면·서비스 화면에 여수 결과 수치(summary) | 통과 | `yeosu-gov-home-1440/390.png`: '영농관리 행정서비스 · 시범 · 여수시 · AI 탐지 17,612건'. `yeosu-gov-svc0-*.png`는 `?region=12130` 화면 |
| lx-admin 로그인 폼 → LX 관리자 대시보드에서 같은 작업의 GPU·사용량·배포 단계 | 통과 | `yeosu-admin-flow-1440/390.png`: 적용 요청 → 결재 → AI 분석 → 실태조사 → 기관 결과가 모두 완료로 표시되고, 'GPU 서버 · 끝', 'GPU 사용 4분', '사용량 광주전남특별시 · GPU 4분', '배포 단계 검증'이 한 시트에 나옵니다. `yeosu-admin-home-*.png`는 현황 할 일에 'AI 분석 진행 n'이 뜨는 화면 |
| audit_log에 같은 deploy_id·job_id가 이어짐(보고서에만) | 통과 | 아래 '감사 기록' 및 `yeosu-audit_log.txt` |
| 남원: 기존 배포본 sgg_cd 백필 뒤 summary 회귀 0 | 통과 | 백필 전·후 summary 전체 항목 비교 결과 'same'. 시험 `test_summary_namwon_unchanged_by_backfill`. 로그인 폼 화면 `namwon-gov-home-*.png`, `namwon-staff-deploy-*.png`, `namwon-staff-console-1440.png` |
| 영상 없는 시군구 1곳 → 실행 없이 '영상 등록 필요' + LX 직원 할 일 | 통과(경기 시흥시 41390) | `siheung-01-staff-plant-1440.png`(현지에서 준비할 것 '영상 등록 필요'), `siheung-staff-deploy-1440/390.png`(데이터 올리기 '할 일' + 영상 등록 버튼, 결과 확인 '영상이 등록되면 AI 분석이 이어집니다'). 작업 0건, 단계는 적용 요청(draft) 그대로, 감사 기록 `deploy.port` → `flow.need_imagery` |
| forbidden(lx-staff·lx-admin·gj-manager, 1440·390) 0 | lx-staff 0 · lx-admin 0 · **gj-manager 2**(내 소유 화면 아님) | `lint.log`. gj-manager에서 걸린 2건은 gov-fusion 대장 카드의 파일 이름 `gj_ledger.csv`입니다(경로·코드 식별자 규칙). core-fusion에 요청 |
| 콘솔 오류 0 | 내 소유 화면(lx-deploy · lx-console · ops-core · ops-infra) 0 | `console.log`. gov-fusion에서 404 1건(`/landxi/data/survey/gwangju-jeonnam-parcel-survey.pmtiles`, 내 소유 아님, 요청). CONNECTION_RESET/REFUSED 줄은 다른 작업이 게이트웨이를 다시 띄운 순간에 찍힌 것이라 다시 찍었습니다 |
| server/tests 통과 | 내 시험 10/10 통과 · 전체 197 통과, 실패 7 → 내 몫 3건 수정 뒤 남은 실패 4건은 다른 작업 몫 | 아래 '시험' |

## 한 흐름 설계(기본값으로 정한 것 포함)
- **결재가 곧 실행입니다.** `POST /approvals/{id}/decide`에서 적용(port) 결재가 승인되면 `deploys.on_port_decided`가 호출되고, 이어서 `flow_start`가 배경 작업으로 돕니다.
  1. 영상을 고릅니다(`catalog.best_imagery`, core-imagery 계약). 계약 함수가 없으면 같은 모양으로 `imagery` 표에서 고르는 대체 경로를 탑니다.
  2. 영상이 없으면 `need_imagery`로 두고 LX 직원 할 일을 '영상 등록'으로 남깁니다. 배포본은 draft(적용 요청)로 남습니다.
  3. 영상이 있으면 모델을 고르고, draft를 shadow(검증/시범)로 올린 뒤 `POST /jobs {kind:infer, options:{scope:"sgg", sgg_cd}, deploy_id}`(core-xi 계약)를 보냅니다.
- **감시 루프:** 게이트웨이 수명 동안 5초마다 돕니다. `ops.alert_loop`가 띄우므로 main.py는 고치지 않았습니다.
  - 작업이 done이 되면 `snapshot_current`를 그 결과 세트로 바꿉니다.
  - 카드에 `*-parcel` 모듈이 있으면 `POST /survey/build {sgg_cd, job_id}`(core-survey 계약)를 부르고, 적재가 done이면 흐름도 done입니다.
  - `need_imagery` 상태는 60초마다 영상을 다시 찾습니다. 영상이 등록되면 자동으로 이어집니다.
  - 흐름 상태는 `deploys.flow`(jsonb)에 있어서 게이트웨이를 다시 띄워도 이어집니다.
- **계약 경로 호출 방식:** HTTP나 토큰을 거치지 않고, 게이트웨이 라우트 함수를 같은 프로세스에서 결재자 권한으로 직접 부릅니다(`_call_route`). 경로가 아직 없으면 `failed(survey not_found)`로 남기고, 경로가 생기면 1분 안에 실태조사만 이어 갑니다.
- **실패 처리:** 적재 작업이 done인데 `survey_sgg.state=failed`이면 흐름을 '다시 실행 필요'로 두고 실태조사만 자동 재시도합니다(최대 5회). 직원 화면에는 '다시 실행' 버튼이 있고(`POST /deploys/{id}/flow`), AI 분석이 이미 끝났다면 실태조사만 다시 돌립니다(GPU 재사용 0).

### 기본값으로 정한 것(사용자가 나중에 정정)
- 흐름은 **결재 승인 시점**에 시작합니다. 영상이 있으면 서버가 draft를 **shadow('검증')** 로 올립니다. 화면(ops-core)은 적용 결재 뒤 단계를 올리지 않습니다.
- 영상이 없으면 **draft 그대로** 둡니다. LX 직원 대시보드의 '적용 요청' 할 일로 남습니다.
- 모델은 배포본 교체 모델 → 카드 버전 모델 → 카드의 다른 버전 모델 순으로 고르고, 모두 영상 해상도(2.5배 이내)에 맞지 않으면 같은 해상도의 기본 분할 모델을 씁니다. 여수 25cm 영상에는 `aerial25/best`가 선택됐습니다. 카드 v2.1 모델이 드론 2cm라서입니다.
- 새 배포본 id는 `dp-{sgg}-{카드}-{연도 두 자리}`, 이름은 '{시군구 전체 이름} · 적용'(이전 '· 이식')입니다.
- 결재 요청 사유 기본값과 `KIND_LABEL`은 '다른 지역에 적용'입니다(이전 '심기').
- 옛 시군구 코드(46130)로 적용 요청이 와도 지금 코드(12130)로 저장합니다. 국내 적용은 `region`(시군구 코드)만 받고, `region_profile`은 해외만 받습니다.
- 백필: 해외 배포본 3개(키르기스 2, 미얀마 1)는 sgg_cd가 없는 것이 맞아 비워 두었습니다. 광주전남 해양쓰레기 두 배포본은 결과 중심과 같은 기관·카드 기준으로 12130을 넣었습니다(summary 결과 그대로).
- LX 관리자 시트의 사용량 줄에는 **GPU 시간만** 싣습니다. 분석 면적 계량값이 작업 범위 문제로 부풀어 있어서입니다(아래 요청).
- 결재함 대상 표기: 기관 배포본을 시군구에 적용한 경우 '광주전남특별시 여수시 영농관리'로 씁니다. 배포 표의 기관 칸도 같은 규칙입니다.

## 감사 기록(보고서 전용) — 여수 dp-12130-farm-26
```
deploy.port      u_lx_staff 20:52:40
approval.approve u_lx_admin 20:54:44   (ap_0ea34c3548ca)
deploy.rollout   u_lx_admin 20:54:45   draft→shadow (via flow)
flow.analyze     u_lx_admin 20:54:47   job_01M3PG8XKPP2X0S3RMKR60CQXY
flow.result      u_lx_admin 21:05:56   job_01M3PG8XKPP2X0S3RMKR60CQXY  → snapshot results/lx/job_01M3PG8X…
flow.survey      u_lx_admin 21:05:56   job_01M3PG8X… · 적재 job_01M3PGXB0Q8X9CNZ0K408FCX7X (survey_sgg failed — core-survey SQL 오류)
flow.retry       u_lx_staff 21:07:07   job_01M3PG8X…
flow.survey      u_lx_admin 21:07:08   job_01M3PG8X… · 적재 job_01M3PGZGHB4JJZSJVASB4BV9DJ
flow.done        system     21:10:56   job_01M3PG8X… · job_01M3PGZG…
```
- `jobs.deploy_id = dp-12130-farm-26`
- `usage_events`(작업 귀속, `workers.metering.OWNER_EXPR`): gwangju-jeonnam gpu_s 261.8 (561행) · area_km2 3,617.5 (1행, 부풀려짐 · 요청 참고)
- 시흥 dp-41390-farm-26: `deploy.port` 20:55:22 → `flow.need_imagery` 20:55:45. 작업 0건

## 실측(보고서 전용)
- 여수 시군구 전역 AI 분석: 4,453칸, 영상이 덮는 비율 0.286(비도시 도엽만), 20:54:48 → 21:05:56(약 11분). GPU 261.8초이고 대기열에서 다른 작업과 번갈아 돌았습니다.
- 실태조사 적재: 1회차는 5.3초 만에 실패(`IndeterminateDatatype $5`). 2회차는 약 3분 50초에 done.
- summary(LX 기준 · 여수 영농관리): AI 탐지 17,612 · 현장 확인 필요 26,345 · 결과 확인 대기 26,350 · 기관 신고 1
  - 기관 신고 1건은 광주전남에 결과 세트 없이 들어온 신고입니다. '대표 항목' 규칙(실태조사 항목 우선)에 따라 해양쓰레기 항목에서 영농관리 항목으로 옮겨 붙었고, 기관 합계는 같습니다.
- 남원 summary: 영농관리 2,098 / 1,079 / 1,101 / 23, 국토 변화 456. 백필 전과 같습니다.

## 바꾼 파일
- `server/landxi_api/deploys.py`
  - 한 흐름 엔진: `flow_start` · `flow_tick` · `flow_loop` · `on_port_decided`
  - 새 경로: `POST/GET /deploys/{id}/flow`
  - 적용 시 sgg_cd 필수, 옛 코드는 지금 코드로, AOI는 시군구 경계, 카드 버전 모듈 사용
  - 용어 정리(이식·심기 제거)
- `server/landxi_api/approvals.py`: 적용 결재 → 흐름 시작, 용어 정리
- `server/landxi_api/summary.py`: `canonical()`이 `results/{기관}/{작업}`을 그 작업으로 셉니다. sets.yaml에 손으로 넣지 않아도 새 결과가 잡힙니다
- `server/landxi_api/ops.py`: `GET /ops/flows`(관리자), 흐름 감시 루프 기동
- `server/landxi_api/registry.py`
  - 학습 계보를 모델 카드(`card.json`의 `dataset`)에서 읽습니다
  - 남원 고정 문자열과 `dp-nw-farm-25` 특례를 뺐습니다
  - 적용 흐름이 고른 모델을 반영합니다
- `server/ops/storage_poller.py`: 기관 목록을 tenants 표에서 읽습니다(고정 목록 제거)
- `server/config/region_profiles.yaml`: `aoi_from: namwon-emd.geojson` 파일 의존 제거
- `server/seed/backfill_deploy_sgg.py`(신설, 1회 실행 완료 · 멱등)
- `server/seed/seed_from_cards_js.py`: namwon-emd 파일 대신 기관 관할 경계를 쓰고, 시드 끝에 sgg_cd 백필
- `server/migrations/0007_flow.sql`(신설): `deploys.flow` 열과 색인
- `server/tests/test_flow_nation.py`(신설, 10개)
- `landxi/v3/lx-deploy/app.js`
  - 배포본 서랍이 서버 흐름을 읽습니다(영상 등록 필요 · AI 분석 중 · 실태조사 중 · 결과 반영 · 다시 실행)
  - 적용 시트의 영상 판정을 `/regions`의 has_imagery로 바꿨습니다
  - 진행 중이면 10초마다 갱신합니다
- `landxi/v3/ops-core/js/app.js`, `landxi/v3/ops-core/js/data.js`
  - 적용 결재 뒤 화면에서 단계를 올리지 않습니다
  - 결재 대상에 시군구 이름을 붙입니다
  - 현황 할 일에 'AI 분석 진행 n'을 넣었습니다
- `landxi/v3/ops-infra/js/deploys.js`, `landxi/v3/ops-infra/js/data.js`, `landxi/v3/ops-infra/ops-infra.css`
  - 배포 시트에 '한 흐름'(단계 5칸 + 진행 · AI 분석 · GPU 사용 · 실태조사 · 사용량 · 배포 단계)을 넣었습니다
  - 표 단계 칸에 진행 상태를 작게 붙였습니다
- 소유 범위 밖(내 계약 때문에 필요한 최소 수정)
  - `server/tests/test_contract.py`: `flow` 키를 v1.2 선택 키로 허용
  - `server/tests/test_summary.py`: 작업 결과 세트의 행 수도 정본으로 셈
  - 모델 카드 데이터 `02. 데이터/models/{aerial25, namwon/cultivate_uncultivate/train, namwon/Vinyl_house/train2}/card.json`: `dataset` 블록 추가(학습 계보를 코드에서 데이터로 옮김)

## 시험
- `server/tests/test_flow_nation.py` **10 passed**
  - 백필(국내 배포본 모두 sgg_cd · 멱등)
  - 국내 region_profile만 보낸 적용은 400 · 옛 코드는 지금 코드로
  - 영상 없는 시군구는 실행 0 · 할 일 · 다시 실행해도 같은 판정
  - 모의 계약으로 전체 흐름: 같은 deploy_id·job_id로 `deploy.rollout` → `flow.analyze` → `flow.result` → `flow.survey` → `flow.done`
  - summary의 작업 세트 매핑 · 남원 회귀 · `/ops/flows`는 관리자 전용 · 계보에 지역 문자열 0
- 전체 `python -m pytest server/tests`: 197 통과, 1 건너뜀, 실패 7
  - 내 몫 3건(`test_contract` deploy/deploys_list의 새 `flow` 키, `test_summary` 작업 세트)은 수정 뒤 통과
  - **남은 실패 4건은 다른 작업 몫입니다:**
    - `test_contract[parcels]`(core-survey)
    - `test_f2b_api::test_survey_kind_39_shards_via_f2s_adapter`(core-survey)
    - `test_f3_server::test_s2_ledger_flow`, `test_s2_reimport_supersedes_and_delete_restores`(대장 · core-fusion)

## 남은 것
- 여수 영상은 '비도시' 도엽만 있어 시군구의 28.6%만 분석됐습니다. 도심은 경계만 남습니다(core-imagery 정직 표기).
- 적용 시트(390)에서 지역 목록을 여는 자동화는 모바일 레이아웃에서 목록이 뜨지 않아 1440에서만 적용 동작을 녹화했습니다. 390 증거는 적용 뒤 배포본 서랍, 결재함, 관리자 흐름 화면입니다.
- 새 적용 배포본은 결과가 없는 동안 같은 시군구의 기존 배포본(해양쓰레기)과 한 점으로 묶이고, 점 이름이 기관 이름('광주전남특별시')으로 나옵니다.

## Fable 에게 넘길 것
- LX 관리자 배포 시트의 '한 흐름' 덩어리(단계 5칸 + 6줄)의 위치와 위계. 지금은 기존 키트 stepper와 dl만 썼습니다.
- lx-deploy 지도 점: 한 시군구에 기관 배포본이 여럿일 때 점 이름을 시군구로 할지 기관으로 할지.
- LX 직원 첫 화면 '오늘'에서 '영상 등록 필요'를 '적용 요청'과 따로 셀지(지금은 적용 요청에 포함).

## 요청
- **core-survey**
  - ① `POST /survey/build` 첫 적재가 `IndeterminateDatatype: could not determine data type of parameter $5`로 실패했는데, 작업은 state done으로 끝났습니다. 흐름은 `survey_sgg.state`로 실패를 감지해 재시도합니다. 작업 상태도 failed로 맞춰 주세요.
  - ② 적재 작업에 본문의 `deploy_id`를 실어 주세요. 계량과 감사 기록이 같은 배포본으로 이어지게 하려는 것입니다.
  - ③ 여수 우선순위 분포가 A 26,350 · B 0 · C 10,642로, 계약의 '상위 5% A · 다음 20% B'와 다릅니다. summary의 '현장 확인 필요 26,345'가 AI 탐지 수보다 큽니다.
  - ④ `test_contract[parcels]`, `test_f2b…survey_kind` 실패.
- **core-xi**
  - ① 시군구 전역 작업(scope sgg)의 `jobs.aoi`가 분석 범위(145.7㎢)가 아니라 약 3,617㎢로 들어가 있어서, `area_km2` 계량과 기관 사용량 면적이 부풀었습니다. 그래서 관리자 화면에서 면적을 뺐습니다.
  - ② 같은 작업의 `jobs.finished_at`과 `perf`가 비어 있습니다. 흐름 화면은 워커 해시로 보완했습니다.
- **core-fusion(gov-fusion 소유)**
  - ① gj-manager 첫 화면 대장 카드에 파일 이름 `gj_ledger.csv`가 보입니다(forbidden 2건).
  - ② `/landxi/data/survey/gwangju-jeonnam-parcel-survey.pmtiles` 404(콘솔 오류). 이 파일은 core-survey 몫일 수도 있습니다.
  - ③ `test_f3_server` 대장 시험 실패 2건.
- **seed 기관 목록**: `seed_from_cards_js.py`의 남원 시드 데이터 id(dp-nw-* · 남원 결과 세트)는 '예시 지역 원천 자료' 적재라 그대로 두었습니다. 코드 경로에는 지역 분기가 없습니다.
