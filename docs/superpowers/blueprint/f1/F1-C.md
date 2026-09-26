# F1-C — 관리자 관제 LX/OPS (:8702 · 종이 로그인 → 잉크 반전 · GPU 실측 · 대기열 · 기관 쿼터 · 배포 제어)

- 모델 **Opus 5.5** · 난이도 L+ · 기간 7–9일 [추정] · 판정 Fable 5.1(Ops 무대 Craft · 영상)
- 읽을 것(순서): ① `blueprint/F1-CONTRACT.md` §1·§2·§3·§4.7–4.9·§5.2–5.3·§6·§9·§11·§12 ② `design/system-v2.md`(특히 §2 Ops 열 · §4 `--ring` · §6 데이터 잉크) ③ `LANDXI-HYPER-BLUEPRINT.md` §4(v1.1) · §6.5 · §10.1 ④ `recon-0924/env.md`(하드웨어 · nvidia-smi 경로) ⑤ `landxi/assets/data/{infra.js,cards.js,ops.js,matching.js}`(원본 기능 · 읽기) ⑥ `landxi/proto/admin-home.html` `admin.css`(원본 관리자 골격 — 재스킨 금지 · 기능 인벤토리 대조용)
- 공통 규칙: git 금지 · 소유 밖 수정 0 · 서버 4173 끄지 말 것 · **Ollama 종료 금지** · 지어낸 운영 수치 0(임계는 `[목표]` · 견적은 `[추정]`).

## 목표

**별도 origin :8702**의 관제실 다섯 화면(`login` → `index` 운영 현황 · `infra` 인프라 관제 · `tenants` 기관·할당 · `deploys` 배포 제어)을 잉크 반전 OPS-GRID로 만든다. 모든 숫자는 실측·측정 시각 표기, **값이 바뀔 때만 움직인다**(2s 수집 · 40ms 현상). 종이 무대 admin-login이 로그인 뒤 1600ms에 잉크로 반전해 "다른 집"임을 몸으로 느끼게 한다. 배포 제어는 이번 차수 요구 4의 세 번째 기둥 — 롤백 한 장면 · 이식 한 장면이 영상에 있어야 한다. 상수 인프라 % · Grafana 임베드 · 정적 카드 그리드 = 불합격.

## 근거 발견
- X2(§10.0): 배포 제어·이식이 1차에 없었다 → 계약 §4.7 `POST /deploys` · rollback 스냅샷 교체.
- §10.1: WDDM → 프로세스별 VRAM N/A(프로세스 이름만) · Ollama 23,396 MiB × 2 · Prometheus 미설치 → 폴러 직결(계약 §5.3 `ops:gpu`).
- §10.5: 종이 무대 15s가 영상에 없었다 → `landxi/ops/login.html`이 그 장면.
- 사용자 요구(메모리 ximap-core): "관리자 화면에는 인프라 제어 같은 기능이 잘 되어야겠지" · 기관별 저장소·GPU·면적·동시작업 할당 · 모듈형 배포 제어(버전 고정 · 단계 · 롤백 · 모듈 on/off · 모델 교체 · GPU 배치 · 승인).
- `infra.js CAPACITY.gpuCards: 4`는 실장비(2)와 다르다 → `nodes`로 대체 · `capacityPlan()`은 `[추정]` 별도 칸.

## owned_files (모두 새 경로)
`landxi/ops/serve-ops.mjs`(:8702 정적 · 허용 접두만 · Range 206 · `.pmtiles` octet-stream) · `landxi/ops/{login,index,infra,tenants,deploys}.html` · `landxi/ops/ops.css` · `landxi/ops/js/{boot.js,rail.js,telemetry.js,rings.js,sparkline.js,lanes.js,deploy-map.js,matrix.js,lineage.js,quota.js,alerts.js,palette.js}` · `landxi/ops/data/{fixtures/*.json,replay/ops-sample.ndjson,i18n-ko.json}` · `landxi/assets/css/v2/ops-grid.css` · `server/ops/{gpu_poller.py,storage_poller.py,run-pollers.ps1,README.md}` · `tests/e2e/f1c-*.spec.mjs`(`f1c-login-flip` `f1c-infra-live` `f1c-tenants-quota` `f1c-deploys-rollback-port` `f1c-origin-guard` `f1c-motion-law` `f1c-contract`) · `shots/f1/C/**` · `blueprint/f1/F1-C-result.md`

읽기·import만: `landxi/shared/api-v1.js` · `landxi/assets/css/v2/tokens-v2.css` · `landxi/xi/engine/lx-map.js`(배포 지도 — F1-A 산출이 오기 전에는 `landxi/proto/vendor/maplibre` 직접) · `landxi/xi/fx/{arrive,provenance,lineage}.js`(있으면) · `landxi/proto/fonts-system.css` · `landxi/assets/data/*.js` · `landxi/assets/icons.svg`

## 단계별 할 일

### 0. D0 — origin · 픽스처 · 폴러
- `serve-ops.mjs`: `PORT=8702` · root = 저장소 루트 · 허용 접두 목록(계약 §1) 밖 404 · `/landxi/ops/` → `index.html`. 4173과 같은 저장소를 읽되 origin이 다르므로 `localStorage`가 분리된다 — **관제 세션은 :8702에만 있다**(계약 §3 · `Origin` 검사).
- `data/fixtures/`: `ops-gpus.json` `ops-nodes.json` `ops-queues.json` `ops-storage.json` `ops-alerts.json` `ops-models.json` `ops-tenants.json` `deploys.json`(시드 8 + `dp-kgz-land-change-26`) `bench.json` — 계약 예시 그대로(실측값: 23,396/49,140 MiB · 63°C · 15.81/32.47W · E: 2,085GB…). `replay/ops-sample.ndjson` = 합성 2s 샘플 60초(`basis:'demo'` · util은 0 고정 — 지어낸 부하 곡선 금지 · "폴러 미기동 · 시연"으로 표기).
- `server/ops/gpu_poller.py`: nvidia-smi 경로(계약 §1) 2s → `ops:gpu:{node}:{idx}` HSET + `ops:gpu` XADD(MAXLEN 3600) · `--query-compute-apps` 프로세스 이름 · `worker:{id}:vram`을 읽어 `external_used_mib` 계산 · 폴러 자체 하트비트 `node:{id}`. `storage_poller.py`: `shutil.disk_usage` + `du`(LX_DATA_ROOT tiers · tenants) 60s → `ops:storage`. Redis 없으면 `--stdout`로 JSON 흘림(단독 검증).

### 1. `login.html` — 종이 무대 → 잉크 반전(L-1 · 15s)
- 종이 무대(`data-stage=paper` · v1 법전 그대로): 플랫폼 소개(모토 · 3축 · 비전 — 원본 로그인 카피 역할) + **관제 요약 한 줄**(`/health` + `/ops/gpus` 봉투: `노드 1 · GPU 2 · 큐 0 · 마지막 점검 hh:mm:ss` · off면 `시연`) + 실결과 얼굴판 미니맵(xdworld z12 남원 + `results/lx/namwon-farmland-2025` 정적 스냅샷 · 카메라 고정).
- 로그인 `POST /auth/login {realm:'lx'}` → role≠admin이면 `관제실은 관리자 전용입니다` 한 줄(세션 저장 안 함). admin이면 **반전 전환 1600 `--e-cam`**: 바탕 흰→잉크 · 글자 잉크→흰 · 미니맵이 잉크 스타일로 · `LX/OPS` 마크 등장 → `index.html`로 `replaceState`(카메라 점프 0 — 같은 미니맵이 운영 현황 배포 지도로 자란다).
- `f1c-login-flip`: 전환 길이 1600±60 · 전환 중 프레임 12장 상이 쌍 ≥ 8.

### 2. `index.html` 운영 현황(OPS-GRID)
- 중앙 판 = 배포 지도(잉크 스타일 · xdworld 없이 A11 sido/sigungu 헤어라인 + `korea-outline` · 글로벌 배포본은 소형 글로브 인셋) · `deploys()` 8+1점 stage 색(draft 점선 · shadow 슬레이트 · canary 액센트 · ga 청록 · rolled_back 앰버 테두리) · `/events/ops` `job.state`로 실행 중 job AOI 점 S1 도착 · `basis:'history'` 배포본은 점 옆 `이력` 꼬리표(운영 서사 아님).
- 좌: 결재 대기(approvals 실카운트 · 0이면 `0 · 대기 없음`) · 우: 노드 요약(A6000 ×2 링 2개 · A100 노드 2 점선 `등록 대기`) · 최근 경보(`경보 없음 · 마지막 점검 hh:mm:ss`).
- 레일 8(운영 현황 · 인프라 관제 · 기관·할당 · 배포 제어 · 카드 발행 · 데이터 관리 · 서비스 관리 · MY) — 뒤 넷은 **원본 관리자 화면으로 링크**(`http://localhost:4173/landxi/proto/admin-publish.html` 등 · 새 탭 · 2차에 이식) · `⌘K` 팔레트(노드·기관·배포본 검색 → 해당 화면).

### 3. `infra.html` 인프라 관제(A-1)
- `telemetry.js`: on → `sse('/events/ops')` · off → `replay('data/replay/ops-sample.ndjson')`. **값이 바뀐 필드만** DOM 갱신(diff) · 40ms 현상(`.cw-digit`) · 2s 넘게 샘플 없으면 링 테두리 슬레이트 + `수신 없음 n s`.
- 노드 카드(`node-tr3995wx`): GPU 행 2 — 이름 · 사용률 스파크라인 60s(24px 데이터 잉크 · `sparkline.js`) · VRAM 링(`rings.js` · used/total · **`외부 점유` 띠 23,396 MiB를 링 안 별색 슬레이트로 · 툴팁 `llama-server.exe ×4 · 프로세스별 VRAM N/A(WDDM)`**) · 온도 · 전력 · 현재 job · 워커 예산(`worker:{id}:vram`). 앰버 주의 = 온도 > 68(85×.8) · VRAM > 76%(95×.8) 등 **임계 80% 규칙 · [목표] 꼬리표**.
- A100 노드 2 = 점선 자리 · `POST /ops/nodes/join-token` 버튼(토큰 표시 · 복사) · 실동작.
- 작업 대기열 스윔레인(`lanes.js` · 행 = 워커 · 가로 30분 · 블록 = job · tenant 색) · 큐 행 → 노드 카드 **리더선**(SVG · 배정 순간 380 · `--e-ui`) · 취소/재큐/우선순위 버튼 실동작(`POST /jobs/{id}/…` · off면 `disabled` + `준비 중 · 서버 없음`).
- 모델 배치 매트릭스(모델 × GPU 상주 · VRAM 막대 · bench chips/s 봉투 · 고정/해제 `load/unload`) · 스토리지 링(E/D/C 실측 · 등급별 · 기관별) · 경보 스트립 · 용량 계획 칸(`infra.js capacityPlan()` import · **[추정] 점선 고스트** · `CAPACITY.gpuCards` 표시 대신 `nodes` 합계).

### 4. `tenants.html` 기관·할당(T-1)
- 좌 기관 목록 6(`lx` · `namwon` · `gwangju-jeonnam` · `kgz-agri` · `kgz-land` · `lx-demo`) · 우 쿼터 링 6(`/ops/tenants` Usage · 사용 실측 vs 한도 `[추정 기반 초기값]`) · 초과 정책 칩 · **데이터 격리 표시**(`prefix` · `RLS` · `서명 타일` · `원본 라우트 0`) · 견적 대비 실측 ±%(job별 `gpu_s` 봉투 vs quote) · 포털 CI 라이브 미리보기(`brand.js` 읽기) · 화면 요구(`REQUESTS` — `matching.js` 읽기 · `이력`).
- 한도 편집: 슬라이더 → 링 여유 구간 500ms로 자라고 초과 예상 월 `[추정]` 점선 고스트(`forecast`) → `PUT /tenants/{id}/quota`(사유 필수 · approvals 행) → `usage.delta`로 링이 따라온다. off면 저장 버튼 `disabled` + 사유.
- MY '디스크 증량 신청'(원본 §10) 결재 자리: `approvals subject_type='quota'` 목록 → 승인 = 위 PUT. 신청 화면 자체는 2차(포털) — 여기서는 결재만.

### 5. `deploys.html` 배포 제어(R-1 · P-1)
- 매트릭스(`matrix.js` · 행 = 카드 9 · 열 = 기관 6 · 셀 = stage 색 + 버전 칩 · 빈 셀 점선 `+ 이식`) · 셀 클릭 → 우 열람 판: 버전 고정(pin) · 단계 배포(draft→shadow→canary→ga 버튼 · `approval_required`면 승인 버튼이 먼저 켜짐) · **롤백**(확인 다이얼로그 · 사유) · 모듈 on/off(공통 7 잠금 표시 · 전용 토글) · 모델 교체(레지스트리 목록 · 지표 봉투 나란히 · `aerial25/best`는 `체크포인트 내장 지표`) · GPU 풀 · 계보 띠(`lineage.js` · `/registry/lineage/{id}` · 데이터셋 → run → 모델 → 카드 버전 → 배포본 → 기관 → job).
- **R-1 롤백**: `dp-nw-farm-25` v2.1 → v2.0 → 배포 지도 점 앰버 380 → 이전 버전 색 · 계보 띠 한 칸 되감김 · 열람 판 `snapshot_current`가 `…@2.0`(= 2023 25cm 경작지 76,215)으로 바뀌고 미니맵이 그 스냅샷을 연다(2,098 필지 → 76,215 폴리곤 · 둘 다 봉투).
- **P-1 이식**: 빈 셀(`card-change` × `kgz-land`) `+ 이식` → 폼(from `dp-nw-change` · region `kgz-sokuluk` · AOI = `landxi/global/data/kgz-adm2.geojson`의 Sokuluk — F1-D 산출 · 없으면 계약 bbox 사각형 · `경계 미확보` 표기) → `POST /deploys` → 새 셀이 draft로 **S1 도착**(락온) · 글로브 인셋에 소쿨룩 점 · `결과 0 · 첫 분석 대기` 정직 표기.
- 모든 쓰기는 `audit_log` 결과를 열람 판 하단 이력에(실카운트).

### 6. 관문 · 법전 · 테스트
- `f1c-origin-guard`: 4173에서 `landxi/ops/index.html` 열면 404(serve.mjs는 파일이 있으니 200이 나온다 → **`boot.js`가 `location.port !== '8702'`면 안내 화면으로 교체** · 서버 측은 `/events/ops` Origin 검사) · staff 세션은 관제 진입 불가.
- Ops 무대 법전: 잉크 88/흰 10/색 2 · 앰버 주의 상시(Ops만) · 값 변화 시만 모션 · `motion-law` · 14px 미만 0 · 파이/도넛 금지(링은 데이터 링).

## 완료 기준(acceptance)
1. `:8702`에서만 관제가 열리고(`serve-ops.mjs` 허용 접두 · `boot.js` 포트 검사) admin 세션만 통과 · 4173 origin 세션과 분리.
2. `login.html` 종이 무대 → 로그인 → 1600ms 잉크 반전 → `index.html`(같은 미니맵 · 점프 0).
3. `infra.html`: on 모드에서 GPU 링·스파크라인·온도·전력이 `gpu.sample`(2s)로 **값 변화 시만** 갱신 · `외부 점유 23,396 MiB` 띠 · A100 점선 2자리 · join-token 실동작 · 큐 행 → 노드 리더선 380 · 취소/재큐 실동작.
4. F1-B J1 실행과 **같은 시각** 반화면에서 사용률이 0 → 상승 → 하강(영상) · 스윔레인 블록 생성 · `usage.delta`로 lx 막대 변화.
5. `tenants.html`: 6기관 링 · 격리 표시 · 슬라이더 → 링 500ms · 고스트 `[추정]` · PUT 성공 → `usage.delta` 반영 · approvals 행 표시.
6. `deploys.html`: 매트릭스 9×6 · 롤백 R-1(앰버 380 → 정착 · 스냅샷 교체 · 계보 되감김) · 이식 P-1(`POST /deploys` → draft 셀 S1 도착 · 결과 0 표기) · `approval_required` 흐름 · 모듈 잠금 · 모델 교체 지표 나란히.
7. off 모드: 픽스처·리플레이로 다섯 화면 전부 콘솔 오류 0 · 쓰기 버튼 `disabled + 이유`.
8. 폴러 2개 단독 실행(`--stdout`) · Redis 키 형식 = 계약 §5.3(`f1c-contract` + `server/ops/README.md` 샘플).
9. `f1c-motion-law` 통과 · 14px 미만 0 · 파이 차트 0 · 앰버는 Ops 주의 규칙 안에서만 · 소유 밖 수정 0.
10. 결과 문서: 레퍼런스 장치표(Vantor 컬러웨이 스왑 · Palantir Blueprint dark · Linear 밀도·⌘K · f1-dash 텔레메트리 · NASA Worldview) + 세 사용자(관리자 관점 포함) 점검 + 계약 변경 요청.

## 판정용 동작 영상(≈ 50s · 1440×900 · `shots/f1/C/f1c.webm` · 12–30s 구간은 F1-B J1과 동시 녹화)
| 초 | 무엇 |
|---|---|
| 0–6 | `login.html` 종이 무대: 플랫폼 소개 · 관제 요약 한 줄(실측 시각) · 얼굴판 미니맵 |
| 6–9 | 로그인 → **1600ms 잉크 반전** → 운영 현황(미니맵이 배포 지도로 자람 · 8+1점 stage 색 · A100 점선) |
| 9–12 | 레일 → 인프라 관제: GPU 0/1 링(23,396 MiB 외부 점유 띠 · 온도 63°C · 전력) · 스파크라인 · 스토리지 링 E/D/C |
| 12–30 | (F1-B J1 시작) 큐 행 등장 → 노드 카드로 리더선 380 → 스윔레인 블록 → 사용률 스파크라인 상승 · VRAM 링 워커 구간 자람 · 값 바뀔 때만 40ms 현상 · 경보 없음 |
| 30–36 | 기관·할당: 6기관 · `lx` gpu_s 막대가 `usage.delta`로 늘어남 · 슬라이더 → 링 500 → 고스트 [추정] → 저장(사유) |
| 36–46 | 배포 제어: `dp-nw-farm-25` 셀 → 롤백(사유) → 지도 점 앰버 380 → v2.0 색 · 계보 되감김 · 미니맵 2,098 → 76,215 |
| 46–50 | 빈 셀 `card-change × kgz-land` `+ 이식` → 소쿨룩 AOI → draft 셀 S1 도착 · 글로브 인셋 점 · `결과 0 · 첫 분석 대기` |
+ 100ms 스트립(반전 · 리더선 · 롤백) · 정지 화면 1280/1440/1920 · 레퍼런스 나란히(Vantor 다크 · Palantir Blueprint 각 1장).


---
## ⚠ 전력 규칙 (2026-09-26 필수, 모든 에픽)
GPU 2장 동시 풀로드로 PC가 전력 부족 셧다운됨. **무거운 GPU 작업(추론·재추론·벤치·vLLM)은 한 번에 GPU 한 장만** — `CUDA_VISIBLE_DEVICES=0` 기본, 워커 동시 고부하 GPU 수 ≤ 1, 배치 보수적. 두 장을 동시에 쓰는 벤치·재추론 금지. 스케줄러는 전력 예산(동시 고부하 ≤1)을 1급 제약으로 구현. Ollama 종료 금지.


---
## 사용자 결정 추가 (2026-09-26, 추천안 채택)
- 정사영상 범위 밖 흰 바탕 금지 → **V-World 위성(키 사용, 폴백 xdworld)으로 밑깔개**. 게스트 화면도 V-World 는 허용(자체 고해상 원본만 금지).
- EOX s2cloudless 2018+ 비상업 → 공개·게스트·수출 화면에서는 **자동 스왑**(Sentinel-2 L2A/GIBS 등 허용 라이선스), 글로벌판 영문 서체 **Inter**.
- A6000 TCC 전환 **하지 않음** — WSL2/Docker GPU(vLLM)가 WDDM 필요. 프로세스별 VRAM 은 결손으로 정직 표기.


---
## 판정 기준 추가 — 플랫폼 정체성 (2026-09-26 사용자)
"완성형 플랫폼 · 유일한 플랫폼 · **Hyper Solution 플랫폼 · Hyper Performance 플랫폼**이 Land-XI 다." 모든 Craft 게이트는 세 사용자 관점에 더해 다음 네 축으로도 판정한다:
1. **완성형** — 목업·자리표·가짜 진행·죽은 버튼 0, 끝까지 동작(시작→결과→다음 행동).
2. **유일함** — 국내외 어떤 GeoAI 서비스(Esri·Google Earth AI·Palantir·V-World·국토정보플랫폼)와 나란히 놓아도 Land-XI 만의 장면이 있는가(실추론 도착·필지 실태조사·국내+글로벌 한 지도).
3. **Hyper Solution** — 행정 문제를 끝까지 푸는가(판독→필지·대장 대조→조치·보고).
4. **Hyper Performance** — 성능을 **실측 수치로 화면에 증명**하는가(GPU 칩/s·면적/분·지연 ms, 봉투 basis=measured).
5. **관리-생산-서비스 일원화된 퍼포먼스** (2026-09-26 사용자) — 하나의 작업이 세 층을 한 흐름으로 관통해 보여야 한다: 생산(LX: 데이터→모델→카드 발행) · 서비스(기관: 요청→결과 도착→행정 조치) · 관리(관제: 같은 작업의 GPU·대기열·쿼터·배포 실측). 같은 job/card id 로 세 화면이 서로 이어지고(계보·딥링크), 한 화면의 행동이 다른 화면에 실시간 반영된다.


---
## 포지셔닝 확정 (2026-09-26 사용자)
**"공공기관(LX)이 제공하는 유일한 GeoAI 솔루션 — 정부 부처·지자체의 실태조사 업무를 지원하는 특화 솔루션."**
- 제품의 중심 축 = 실태조사(SURVEY-SPEC). XI맵·생산·관제·에이전트는 모두 실태조사를 끝까지 해결하기 위해 존재한다.
- 부처별 실태조사 카탈로그로 서비스를 편성: 농식품부(농지이용실태조사·농지전용)·국토부(개발행위 사후관리·토지이용·지목불부합)·행안부(공유재산 실태조사)·환경부(하천점용·방치폐기물)·산림청(산림훼손)·해수부(해양쓰레기)·지자체(무허가건축물·개발제한구역).
- "유일함"의 근거: 지적(필지)·측량 공공기관 LX 의 공신력 + 연속지적 PNU 결합 + 실추론 GPU + 대장 대조 규칙 + 현장조사 연계. 민간 GeoAI(Esri·Google)가 못 하는 필지 단위 행정 실태조사.
- 화면 언어: 첫 화면·로그인·글로벌판에서 "실태조사 특화"가 즉시 읽혀야 한다.
