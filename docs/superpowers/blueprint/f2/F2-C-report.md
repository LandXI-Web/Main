# F2-C 보고 — 3차(2026-09-27 05:45 · 판정 불합격 7건 처리)

결과 문서: `F2-C-result.md` §0(7건 + 복구 spec 표) · §4-1(판정식 (a) 갱신) · 3차 계약 요청.

## 3차에 한 일
- **GPU 행 재구성**: 큰 숫자 = 10 s 추세(util_ma10) · 한 줄 아래 '반응 2.5 s · 25표본 막대 · 순간'(≤ 900 겹침 0 · e2e 4폭). 노드 카드 · 큐 행도 같은 필드.
- **화면 이동 검정 0**: 4화면 정적 첫 페인트 골격 + 직전 화면 스냅샷(pagehide 저장 · 꼬리표) + `unveil()` + View Transitions · 게이트웨이 재기동 때 관리자를 로그인으로 튕기던 `/me` 세션 삭제 결함 수정.
- **전력 고부하 정의**: 이용률 ≥ 50% **또는 W ≥ power.limit × 0.5** · caution_why 'W' · 칩 title GPU 별 W · 녹화 도구 같은 정의(실제로 2회 자동 중단).
- **LLM 띠**: 3 s 폴링 · '처리량(10 s 평균)' + '생성 속도'(time_per_output_token/inter_token_latency 히스토그램 Δcount÷Δsum) · 에이전트 질문과 같은 시각 영상(화면 53.5 vs /metrics 53.8 tok/s).
- **큐 행**: 진행 중 '최근 창 칩/s(창 k s)' · 끝나면 두 줄만.
- **녹화**: 왼쪽 탭 미리 띄움 + 밝기 3연속 통과 뒤 전환 · 롤백 칩은 남원시 기관 세션 탭(0.53 s) · 대기 구간 잘라냄 · 81.8 s.
- **복구 칩 spec**: 핀 행 단건 GET 을 ready 전에 · spec 은 행 도착 대기 · 3회 연속 통과.

## 실측 요약
| 항목 | 값 |
|---|---|
| 오른쪽 판 검정(720×800 · 자막 제외 · 20 fps) | 0 / 1,461 · 흰 판 0 |
| 왼쪽 판 흰 판(mean > 235) | 0 / 1,461 · 검정 0 |
| 화면 이동 검정(navcheck 720 · 9회 이동) | 첫 방문 0/450 · 스냅샷 0/450 |
| 황등 378 | 378/378 · 14.55 GPU·s · 20.1 s · GPU 초당 26.0 · 벽시계 18.8칩/s · 최대 155 W |
| 큰 숫자(10 s) 연속 변동 | 정상 부하 ≤ 6%p · 폴러 방출 최대 8.6%p(상승 포함) |
| 두 장 동시 고부하(W 포함) | 0 |
| 롤백 → 남원시 XI맵 칩 | 0.53 s |
| finding.state → 관제 막대 | 0.003 s |
| LLM 생성 속도 화면 / 실측 | 53.5–56.4 / 53.8 tok/s · 148 토큰 |
| e2e | 53개 순차 52 통과 · 1 조건부 skip · 복구 칩 3회 연속 |

## 3차 변경 파일(소유 범위 안 · git 0)
- `landxi/ops/{index,infra,tenants,deploys}.html` · `ops.css` · `serve-ops.mjs`(LLM 3 s) · `js/{boot,rail,lanes,overview,telemetry}.js`
- `server/ops/{gpu_poller,llm_poller}.py` · `run-pollers.ps1`
- `tests/e2e/{f1c-infra-live,f2c-gpu-ma,f2c-llm-lane,f2c-recovered-chip}.spec.mjs` · 신설 `f2c-nav-skeleton.spec.mjs`
- `shots/f2/C/tools/{record.mjs,compose.py,blackcheck.py,strips.py,pb-watch.py}` · 신설 `{navcheck.mjs,chipprobe.mjs,imgmean.py}` · 산출물 · `shots/f2/F2-C/` 사본
- 소유 밖 수정 0. 다른 에픽이 내린 GPU 워커는 `server/start-landxi.ps1`(빠진 프로세스만 기동)로 다시 세웠다(05:2x).

## 실행
```
node shots/f2/C/tools/record.mjs && python shots/f2/C/tools/compose.py && python shots/f2/C/tools/strips.py
python shots/f2/C/tools/blackcheck.py shots/f2/C/f2c.mp4 --from 8.74 --side right --white   # 오른쪽 판 검정
python shots/f2/C/tools/blackcheck.py shots/f2/C/f2c.mp4 --from 8.74 --side left --white    # 왼쪽 판 백지
node shots/f2/C/tools/navcheck.mjs [--cold]      # 관제 화면 이동 검정
WHO=namwon node shots/f2/C/tools/chipprobe.mjs   # 계보 칩 실시간(기관 세션)
npx playwright test tests/e2e/f1c- tests/e2e/f2c- --workers=1
```

---

# F2-C 보고 — 2차(2026-09-27 04:20 · 판정 불합격 5건 처리)

결과 문서: `F2-C-result.md` §0(5건 표) · §4-1(이동평균 판정식 경위·새 기준).

## 2차에 한 일
- **null 3곳 0**
  - `infra.html` 호출부를 `filter(Boolean)`로 고쳤다.
  - `js/boot.js`에 안전망을 넣었다. `append`·`prepend`·`replaceChildren`이 null과 undefined를 거른다.
  - e2e는 5화면 본문 TreeWalker로 `/\bnull\b|undefined|NaN/`이 0인지 확인한다.
- **GPU 카드 '현재 job'**
  - 폴러가 `worker:{w}:hb.job_id`를 읽는다.
  - 관제는 `job.state running`을 받으면 즉시 카드를 세운다. 동시 n건도 표시한다.
  - e2e는 주입 뒤 2 s 안에 카드가 서는지 본다.
- **폴러 창 변경**
  - `-lms 100` × 25표본(2.5 s)으로 바꾸고, 보조 `util_ma10`(10 s 추세)을 추가했다.
  - 부하 창 대조 결과는 독립 샘플러와 ±8.0%p다(기준 ±10 ✔).
  - 연속 변동은 2.5 s 창에서 22%p ✘로, 실제 부하 주기 때문이다. 10 s 추세에서는 8%p ✔. 결과 문서에 정직하게 표기했다.
- **record.mjs 전력 감시**
  - 관제 `power_budget`을 0.5 s마다 읽는다(`tools/pb-watch.py`).
  - 제출 전과 제출 직전에 대기하고, 작업 중 반대편 GPU가 고부하면 즉시 취소하고 중단한다.
  - **전체 재녹화** 결과: 88 s, 04:13–04:14, 두 장 동시 고부하 0/57, 검정 0/1,761.
- **간헐 404**
  - 원인: 다른 에픽 pytest가 가짜 job.state를 내면 `GET /jobs/{id}`가 404를 낸다.
  - 이벤트 조회를 목록 GET(늘 200)으로 바꿨다.
  - 콘솔 오류에 리소스 URL과 응답 ≥ 400을 기록하고, 3회 연속 0건이다.
- e2e f1c+f2c 43개 순차 실행: 42 통과, 1 조건부 skip.

## 2차 변경 파일(소유 범위 안)
- `landxi/ops/`: `infra.html`, `ops.css`, `serve-ops.mjs`(`--lms 100`), `js/boot.js`, `js/telemetry.js`
- `server/ops/gpu_poller.py`
- `tests/e2e/`: `f2c-gpu-ma.spec.mjs`, `f1c-login-flip.spec.mjs`
- `shots/f2/C/`
  - 도구 개정: `tools/record.mjs`, `tools/compose.py`, `tools/restart-ops.ps1`(제어 문자 고침)
  - 도구 신설: `tools/pb-watch.py`, `tools/ma-table.py`, `tools/strips.py`, `tools/shot1.mjs`
  - 산출물: 영상 · marks · strips · stills · logs
- 결과 문서.
- git은 쓰지 않았다. 소유 밖 수정 0.

## 실행(2차 추가)
```
node shots/f2/C/tools/record.mjs && python shots/f2/C/tools/compose.py && python shots/f2/C/tools/strips.py
python shots/f2/C/tools/ma-table.py        # 부하 창 대조 표(logs/gpu-ma-load.md)
python shots/f2/C/tools/blackcheck.py shots/f2/C/f2c.mp4 --json shots/f2/C/logs/blackcheck.json
```

---

# (1차) F2-C 보고 — 관제 LX/OPS v2 (2026-09-27)

결과 문서: `F2-C-result.md`. 여기에는 한 일, 파일, 실행 방법, 폴백, 남은 것만 적는다.

## 한 일
- 1차 must_fix 6건을 0으로 만들었다.
  - 검정 프레임: 제출 영상 1,919프레임 중 0.
  - 운영 현황 지도: 배포 밀집 bbox로 잡고 전국 인셋을 붙였다. grown은 첫 점이 도착한 뒤에 찍힌다.
  - 주의 앰버: 링과 중앙 % 모두.
  - 레퍼런스: Blueprint dark로 다시 찍었다.
  - 계약 v1.1-18·28: 구현했다.
  - 게이트웨이 직결: 기본값이 됐고, 5화면 콘솔 오류 0.
- GPU 폴러:
  - `-lms 500` 스트림으로 이동평균 · W · 주의/장애를 낸다.
  - nvidia-smi가 두 장에 같은 값을 주는 문제를 PDH로 대체한다.
  - 전력 예산 칩을 붙였다.
- 신설 `llm_poller.py`: vLLM tok/s와 GPU 배치를 LLM 띠로 보여 주고, 모델 매트릭스에 gemma 행과 스파크라인을 넣었다.
- 딥링크와 계보:
  - `?job=`이면 행을 펼치고(done 두 줄 · XI맵/Global 왕복) 강조한다.
  - `?deploy=`에는 `카드 ↗`를, `?tenant=`와 `?next=`도 처리한다.
- 서비스 → 관리 실시간 연동:
  - 복구 칩과 경보 한 줄.
  - finding.state를 받는 실태조사 미니 막대.
  - 링 8(LLM 토큰 · 실행).
- 재녹화: 같은 시각 반화면(왼쪽 XI맵 · 오른쪽 관제), GPU0 한 장으로 황등 378 shard를 실제 추론했다.

## 변경·산출 파일(소유 범위 안)
- `landxi/ops/`
  - `login.html`, `index.html`, `infra.html`, `tenants.html`, `deploys.html`, `ops.css`, `serve-ops.mjs`
  - `js/{boot,rail,telemetry,lanes,deploy-map,matrix,quota}.js`
  - 신설: `js/overview.js`, `data/survey-density.json`
  - `data/i18n-ko.json`
- `landxi/assets/css/v2/ops-grid.css`: 링 주의·장애 색.
- `server/ops/`
  - 개정: `gpu_poller.py`, `run-pollers.ps1`, `README.md`
  - 신설: `llm_poller.py`, `audit_read.py`
- `tests/e2e/`
  - 개정: `f1c-{login-flip,infra-live,motion-law,tenants-quota,deploys-rollback-port}.spec.mjs`
  - 신설: `f2c-{gpu-ma,llm-lane,deeplink,recovered-chip,finding-state}.spec.mjs`
- `shots/f2/C/**`
  - 영상 · marks · 스트립 · 정지 · 레퍼런스 · 로그
  - `tools/{record,compose.py,blackcheck.py,flip,stills,refs,side.py,probe,restart-ops.ps1,e2e-util}.mjs`
- 사본: `shots/f2/F2-C/`(워크플로 지정 경로).
- git은 쓰지 않았다(커밋·되돌림 0). 소유 밖 파일 수정 0(XI맵 · 게이트웨이 · api-v1.js는 읽기만).

## 실행
```
powershell -File server/start-landxi.ps1 -Status          # 4173·6380·5433·8700·8701·8702·워커 녹색 확인
powershell -File shots/f2/C/tools/restart-ops.ps1         # :8702 만 재기동(폴러 3개 포함 · 다른 프로세스 무관)
npx playwright test tests/e2e/f1c- tests/e2e/f2c- --workers=1
node shots/f2/C/tools/record.mjs && python shots/f2/C/tools/compose.py   # 판정 영상(두 GPU 한가할 때만 제출)
python shots/f2/C/tools/blackcheck.py shots/f2/C/f2c.mp4                  # 검정 프레임 실측
python server/ops/gpu_poller.py --stdout --once --redis=
python server/ops/llm_poller.py --stdout --once --redis=
```
관제: http://localhost:8702/landxi/ops/login.html (lx-admin · DEV_PASSWORD)

## 폴백
- 기본은 **게이트웨이 직결**이다. 게이트웨이가 꺼지면 브리지로 자동 전환하고 마스트에 `브리지 · 메모리`를 표기한다. 작업 중 F2-B가 게이트웨이를 여러 번 재기동했고, 관제·녹화 도구는 그때마다 기다렸다가 이어 갔다.
- 게이트웨이에 없는 계약 밖 읽기(audit · approvals · LLM 계량)는 `audit_read.py`가 PostGIS를 SELECT만 해서 채운다.

## 관측(중요)
- 03:12:00–08에 GPU0(내 378 작업 + F2-B의 1,369 shard 작업)과 GPU1(vLLM 199.8 W · F2-E)이 **동시에 고부하**였다. 녹화 시작 전에는 두 GPU가 한가한지 확인했다. vLLM이 `power:hot` 임대 밖에 있어서 생긴 일이다(결과 §5 · 계약 요청 2).

## 남은 것
- 계약 요청 6건(결과 §7): 이동평균 창 · vLLM 전력 임대 · `/ops/gpus` 최상위 필드 통과 · audit 라우트 · 롤백 scale 스왑 · XI맵 계보 칩 실시간.
- 영상 마지막 장면에 `null` 한 곳이 찍혔다(녹화 뒤 코드 수정 · 재녹화 안 함).
