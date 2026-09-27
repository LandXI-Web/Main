# F2-C — 관제 LX/OPS v2: 조건부 합격 6건 + GPU 실측(이동평균·W·주의 앰버) + `?job=` 계보 + LLM 띠 + 복구 칩 + 일원화 반화면 재녹화

- 모델 **Opus 5** · 난이도 L · 기간 5–6일 [추정] · 판정 Fable 5.1(Craft · 영상 · 실측 대조 nvidia-smi)
- 읽을 것(순서): ① `F1-CONTRACT.md` v1.0 §4.9 · §5.2–5.3 + **v1.1-2(7·15) · v1.1-5(28·29) · v1.1-6** ② `f1/F1-C.md` · `f1/F1-C-result.md`(§4 요청 6) ③ 저널 gate:F1-C must_fix 원문(아래) ④ `agent/AGENT-SPEC.md` §4.3(관제 LLM 노드 · 최소만) ⑤ `landxi/ops/js/{lanes,rail,rings,telemetry,deploy-map}.js` · `server/ops/gpu_poller.py` 현재 코드(lanes.js는 이미 `?job=` `is-focus`를 읽는다 — 펼침·스크롤·강조 완성) ⑥ `design/system-v2.md` §2 Ops 열 · §4 Ops `--ring`
- 공통 규칙: **git 금지** · 소유 밖 수정 0 · 테스트 자기 것만(`tests/e2e/f1c- f2c- --workers=2` · 순차 권장) · 4173·8700·vLLM·Ollama 끄지 말 것 · **GPU 전력 규칙: 재녹화는 GPU0 워커 한 장(F2-B J1 황등 378 shard) · GPU1 vLLM은 유휴 상태로 두고 부하 걸지 말 것** · 영상 생성 API 금지 · 행정 문서화 금지.
- 판정 5축(특히 **Hyper Performance 실측 정확** · **일원화**: 같은 job id가 XI맵→관제→배포로 이어지고 실시간) + 관리자 '우와'.

## 목표

1차 관제는 "인프라·배포 두 화면은 우와, 운영 현황은 업무 시스템"(조건부 합격). 2차는 (1) 6건을 0으로 하고, (2) GPU 수치를 **틀려 보이지 않게**(이동평균 · W · 주의 앰버), (3) XI맵·Global에서 온 `?job=`가 **행을 펼치고 강조하고 스크롤**하며, 재부팅 복구된 작업에 `복구 · 재개 a/b` 칩이 붙고, (4) LLM(vLLM) 띠·토큰 계량 링이 서고, (5) **같은 시각 반화면(왼쪽 XI맵 실추론 · 오른쪽 관제)**으로 "관리-생산-서비스 일원화"를 영상으로 증명한다.

## 근거 — 1차 must_fix 원문(저널 gate:F1-C · ac1b69c5 · 6건 · 조건부 합격 → 통합 전 필수)

1. `[조건부 합격 · 통합 전 필수] landxi/ops/login.html flip() · js/deploy-map.js mountOverview/inkMix · ops.css .is-flip — 증상: 반전이 --e-cam 으로 300ms 안에 80% 끝나고, 6.9–8.0s 약 1초가 순수 검정 화면(7.6–7.9 중앙 패널 완전 검정 → 8.0 전국 외곽선 페이드인 → 9.1 점 도착). 남원 z12 → 전국 카메라 이동이 보이지 않아 '같은 미니맵이 자란다'가 페이드-스루-블랙으로 읽힌다. 기대: 시도·시군구 헤어라인이 유지된 채 연속 easeTo(1600 --e-cam)로 자라는 것이 프레임 스트립에서 보이고, 셸(레일·패널)은 카메라 이동 중에 세워져 검정 공백 0.`
2. `완료 기준 4 · shots/f1/C/tools/record.mjs · f1c.webm 12–30s — 증상: F1-B J1 대신 standin_worker, 반화면 동시 녹화 없음. 지금 F1-B gpu_worker(workers/gpu_worker.py --gpu 0)가 살아 있고 게이트웨이 job 이 큐 행에 '게이트웨이' 라벨로 중계되는 것을 확인했으므로, F1-B J1 실행과 같은 시각 반화면(왼쪽 F1-B, 오른쪽 infra.html)으로 사용률 0→상승→하강·스윔레인 블록·usage.delta 막대를 재녹화하고 marks.json 갱신. 전력 규칙(GPU 한 장) 유지.`
3. `landxi/ops/js/deploy-map.js mountOverview · index.html — 증상: 운영 현황 중앙 배포 지도가 70% 빈 잉크(국내 점 7개가 전북·전남에 뭉침), grown 표시 뒤에도 점이 늦게 도착(21:16:40 스크린샷 점 1개). 기대: 초기 카메라를 배포 밀집 bbox 에 맞추거나(전국은 인셋/토글) 헤어라인 대비를 올려 빈 판으로 읽히지 않게, data-flip=grown 은 점 S1 도착 뒤에 찍을 것. kepler.gl 옆에서 밀리지 않는 밀도.`
4. `landxi/ops/js/rings.js · landxi/assets/css/v2/ops-grid.css [data-caution=1] — 증상: GPU VRAM 88.1%(임계 76% [목표] 초과)인데 링 숫자·트랙이 흰색 그대로, 눈금 하나만 앰버라 주의 상태가 한눈에 안 읽힌다. 기대: caution 이면 중앙 % 와 링 값 세그먼트가 Ops 주의 앰버(임계 80% 규칙 · [목표] 꼬리표)로, fault 는 경고색.`
5. `shots/f1/C/stills/ref-blueprint-dark.png · side-blueprint-vs-infra.png · F1-C-result.md §2 — 증상: 레퍼런스가 Blueprint 문서 사이트 라이트 테마 캡처라 '다크 고밀도 카드'와 나란히 비교가 성립하지 않는다. 기대: Blueprint dark 테마(예: docs 다크 모드 또는 Palantir 데모) 캡처로 교체하고 장치표 문구 정합.`
6. `F1-CONTRACT 변경 요청(F1-C-result.md §4 1·2·4·6) 반영 결정 필요 — 외부 점유 예시 23,396 MiB → '실측 표시', nvidia-smi 경로 DriverStore 최신 자동 선택, memory.used 언더플로 시 PDH 대체, 전력 규칙 claim hold(power_budget). 게이트웨이 /ops/gpus 500 복구 뒤 lx_ops_src=gateway 직결로 5화면 콘솔 오류 0 재확인(tools/gw-probe.mjs).` → 결정: 전부 채택(v1.1-18 · 28). 관제는 `lx_ops_src=gateway` 직결이 기본 · 브리지는 게이트웨이 죽었을 때만 자동 전환 + 마스트 `브리지 · 메모리` 표기.

다른 판정에서 온 것: F1-B 게이트 LX 직원 평 `job.progress 의 GPU 이용률이 WDDM 1초 순간값이라 0↔100 으로 깜빡여 … 'Hyper Performance 를 실측으로 증명' 하는 숫자가 틀려 보인다` · integrate 영상 결함 `관제 GPU 이용률이 0%에 머뭅니다 · 관제 잉크 반전 뒤 약 1초 검정 화면 · 관제 자막 시각 '1시 28분 9초' → 01:28:09` · F1-D 요청 9 `관제 딥링크 ?job= … 해당 작업 행을 펼치도록` · integrate: `Global 카드의 '관제 딥링크 결손' 칩을 실제 링크로 교체 (관제가 이제 ?job=을 받습니다)`.

## owned_files
`landxi/ops/**`(`index.html` `infra.html` `tenants.html` `deploys.html` `login.html` `ops.css` `serve-ops.mjs` `js/*` `data/*`) · `server/ops/**`(`gpu_poller.py` `storage_poller.py` `run-pollers.ps1` + 신설 `llm_poller.py`) · `landxi/assets/css/v2/ops-grid.css` · `tests/e2e/f1c-*.spec.mjs`(개정) · `tests/e2e/f2c-*.spec.mjs` · `shots/f2/C/**` · `blueprint/f2/F2-C-result.md`.
읽기만: `landxi/shared/api-v1.js` · `landxi/xi/fx/*`(import) · `server/landxi_api/ops.py`(F2-B) · F2-E `agent:models` Redis 해시. **만지지 말 것**: `landxi/xi/**` · `landxi/global/**` · `landxi/proto/**` · `server/landxi_api/**`.

## 단계별 할 일

### 1. must_fix 1·3·4·5 (D1–D2)
- 반전: `flip()`을 **연속 카메라**로 — 남원 z12 → 전국 easeTo 1600 `--e-cam` 동안 시도·시군구 헤어라인 유지 · 셸(레일·패널)은 카메라 이동 시작과 함께 서고(검정 공백 0) · 명도 반전은 `--d-1600` 한 번(법전 §0) · 20fps 픽셀 실측 `max(RGB)<24` 프레임 비율 0(제출 영상 자체) · 100ms 스트립.
- 운영 현황 지도: 초기 카메라 = 배포 밀집 bbox(호남) + 전국 인셋 토글 · 시군구 헤어라인 대비 ↑ · 점은 `job.state` 도착 시 앰버 락온 → 청록 · `data-flip=grown`은 첫 점 도착 뒤 · 배포 7건 + 작업 점 + 기관 라벨로 kepler.gl 밀도.
- 링: `caution`(VRAM ≥ 76% [목표] 또는 util ≥ 80%) → 중앙 %·값 세그먼트 앰버(`--cw-caution` · Ops 무대 상시 허용) · `fault` 경고색 · 임계 꼬리표 `[목표]` · e2e `[data-caution=1]` 색 단언.
- 레퍼런스: Blueprint **dark** 캡처(docs 다크 모드) + Palantir 데모 다크 → 나란히 재제출 · 장치표 정합.

### 2. GPU 실측 · 폴러 (D2–D3 · v1.1-18 · 28)
- `gpu_poller.py`: nvidia-smi `-lms 500` 스트림 · 링버퍼 5 → `util_ma5` · `power_w` · `caution` · `fault` · DriverStore 최신 경로 자동(`LX_NVSMI` 우선) · `memory.used` 언더플로 → PDH 대체 + `note` · `external[]` 실측 표시(예시값 문구 삭제) · `power_budget`(Redis `power:hot:*` 임대 상태 → `고부하 GPU n/1` 칩).
- `llm_poller.py`(신설 · 30s): vLLM `:8000/metrics`(Prometheus 텍스트 · `vllm:num_requests_running` · `vllm:generation_tokens_total` 차분 → tps 봉투) + `:8001` · `agent:models` 해시 → `ops:gpu` 샘플 `external[].llm{backend, model, tps, reqs_active, note:'WSL 프로세스 VRAM 미노출'}`. 컨테이너 제어 0(읽기만).
- 인프라 화면: GPU 행 `이용률(이동평균) n% · w W · 주의` · 외부 점유 띠 옆 **LLM(vLLM) 띠**(합치지 않음) · 모델 배치 매트릭스 행 `gemma-4-12b-it · vllm · GPU1` + 토큰/초 스파크라인 24px(값 변화 시 40ms) · 기관·할당 링 6 → **8**(`llm_tokens_month` · `llm_runs_day` · F2-E 계량 · 없으면 결손 링).

### 3. 계보 · 복구 · 실시간 (D3–D4 · v1.1-15 · 16 · 29)
- `?job=`: 큐 행 펼침(shard 진행 · gpu_s_so_far · 워커 · 기관 · 배포본 · `GPU 초당/벽시계` 최종 두 줄) + 강조 + 스크롤 · 행 안에 `XI맵에서 보기 ↗`(`/landxi/xi/?job=`) · `Global ↗`(kgz 작업) · 배포 `?deploy=` · 기관 `?tenant=`. e2e `f2c-deeplink`.
- `job.state{reason:'recovered'}` → 큐 행 `복구 · 재개 a/b` 칩 + 경보 스트립 한 줄(`재부팅 복구 n건 · 실패 m`) · `/health.recovered_at_boot` 마스트.
- `finding.state`(ops 스트림 · F2-S) → 운영 현황 기관 카드에 `실태조사 open/assigned/…` 미니 막대가 40ms 현상(값 변화 시만) — 서비스 층의 행동이 관리 층에 실시간.
- `deploy.changed` 발행 확인(롤백 → XI맵 칩 ≤ 1s는 F2-A·F2-B와 함께 영상).

### 4. 재녹화 · 테스트 (D5)
- must_fix 2: **같은 시각 반화면**(좌 XI맵 황등 378 shard 실추론 · 우 infra.html) — 사용률 0→상승(이동평균)→하강 · 전력 W · 스윔레인 블록 · `usage.delta` 막대 · 큐 행 같은 job id 강조 · job.done 두 줄. `marks.json` 갱신 · 자막 시각 `01:28:09` 형식.
- e2e: `f1c-*` 개정(반전 픽셀 · caution 색 · gateway 직결 콘솔 0 5화면) + `f2c-gpu-ma`(폴러 표본 12 튐 0 · power_w) · `f2c-llm-lane` · `f2c-deeplink` · `f2c-recovered-chip` · `f2c-finding-state`.

## 완료 기준(acceptance)
1. 6건 전부 0 — 반전 검정 프레임 0(제출 영상 픽셀 실측) · 지도 빈 판 아님(정지 1440 · 점 도착 시각) · caution 앰버 · Blueprint dark 나란히 · v1.1-18·28 채택 구현 · `lx_ops_src=gateway` 5화면 콘솔 0.
2. GPU 행 = nvidia-smi 0.5s 표본 이동평균 ±3%p · W ±2 · 튐 0(12표본 표) · LLM 띠 tps = `/metrics` 차분.
3. `?job=` 행 펼침·강조·스크롤 · XI맵/Global 왕복 링크 · `?deploy=` `?tenant=`.
4. 복구 칩(F2-B 실증과 같은 시각) · `finding.state` 미니 막대(F2-S) · `deploy.changed` → XI맵 칩(F2-A) — 셋 다 영상.
5. 쿼터 링 8(결손 정직) · 전력 예산 칩 `고부하 GPU n/1` · 브리지 폴백 표기.
6. 반화면 재녹화 `shots/f2/C/f2c.mp4` + marks · 100ms 스트립(반전 · 점 도착) · 정지 1280/1440/1920 · 레퍼런스 나란히(Blueprint dark · Palantir · kepler 밀도).
7. e2e 통과(순차) · 소유 밖 수정 0 · 결과 문서(장치표 · 세 사용자 · 계약 요청).

## 판정용 동작 영상(≈ 60s · `shots/f2/C/f2c.mp4` · 반화면 · GPU0 한 장)
| 초 | 무엇 |
|---|---|
| 0–8 | 종이 로그인 → 잉크 반전: 남원 → 전국 카메라 1600이 **보이며** 셸이 선다(검정 0) → 운영 현황 지도 밀집(호남 bbox · 인셋) · 점 락온 |
| 8–30 | 반화면: 좌 XI맵 황등 378 shard 제출 → 우 infra 큐 행 같은 id `is-focus` · GPU0 이용률(이동평균) 0→80% 대 · 151 W · 스윔레인 · usage.delta 막대 · VRAM 링 caution 앰버 · job.done → 행 안 두 줄 `GPU 초당 · 벽시계` |
| 30–38 | LLM(vLLM) 띠 · gemma 행 tps 스파크 · 링 8(llm_tokens) · 전력 칩 `고부하 GPU 1/1` |
| 38–48 | 배포 제어 롤백 v2.1→v2.0 → (좌) XI맵 계보 칩 v2.0 ≤ 1s · 스냅샷 76,215 |
| 48–56 | 복구 칩: (F2-B 실증) 재기동 뒤 큐 행 `복구 · 재개 152/378` · 경보 한 줄 |
| 56–60 | 기관 카드 실태조사 미니 막대가 (F2-A 배정 클릭에) 40ms 현상 · Global `?job=`에서 관제 행 도착 |

## 계약 · 요청
- 구현 = v1.1-18 · 28 · 29(관제 쪽) · 15(칩) · 16(수신). F2-B가 `/ops/gpus`에서 새 필드를 통과시키지 않으면 브리지 경로로 표시하되 마스트 표기.
- F2-D에 준다: `?job=` 처리 완료 → 결손 칩 교체 통보(결과 문서 D3 절).
- F2-E에서 받는다: `agent:models` · `usage_events llm_tokens`.
