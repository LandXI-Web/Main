# F1-B 결과 — 실추론 백엔드(FastAPI :8700 · Redis Streams · GPU/CPU 워커 · 타일 · 프록시 · PostGIS)

- 작성 2026-09-26 22시 · 브랜치 plan1-foundation(커밋 없음 · 통합 단계에서) · 정본 계약 `blueprint/F1-CONTRACT.md`
- 숫자 규칙: **[실측]** = 이 PC에서 잰 값(출처 파일·로그 명시) · **[추정]** = bench 기반 계산 · **[기록]** = 과거 문서 값
- 이번 재개 직전 사정: **PC가 20:53 전후 꺼졌다가 20:55:41 재부팅**(`LastBootUpTime`) — 직전 세션(J1 녹음·bench 직후)이 끊긴 원인. 재부팅 뒤 Docker 컨테이너·Ollama(llama-server ×4)는 자동 복귀, 게이트웨이·워커는 이 세션에서 다시 띄웠다. 이후 GPU 고부하는 **GPU0 한 장만**(전력 임대 `power:hot` 1슬롯 · 200 W 상한 표시).

## §0 설치 스모크(setup.ps1 · 2026-09-26 21:5x 재실행 · `server/.setup-smoke.json`)

| 항목 | 결과 | 내용 |
|---|---|---|
| docker | OK | server 29.6.2 |
| postgis/postgis:16-3.4 pull | OK | image 44126d872ac9 |
| compose -p landxi up | OK | landxi-postgis :5433 · landxi-redis :6380 — 둘 다 healthy |
| redis ping / PostGIS | OK | PONG · POSTGIS 3.4.3 |
| python | OK | 3.11.4(시스템) |
| pip asyncpg · redis · pmtiles · argon2 · sse-starlette · multipart · yaml · psycopg · mapbox_vector_tile · fastapi · uvicorn · rasterio · ultralytics · torch · shapely · pyproj · httpx | OK | 전부 import 가능 |
| torch CUDA | OK | 2.5.1+cu118 · cuda True · 2장 |
| ultralytics | OK | 8.3.234 |
| titiler.core(선택) | OK | 설치됨(`/tiles/cog` 는 rasterio 직접 렌더 + titiler 가능) |
| ogr2ogr -f PMTiles(gcs) | OK | GDAL 3.12.4 · 스모크 958 bytes |
| nvidia-smi | OK | 드라이버 **597.16** · WDDM · 전력 상한 200 W × 2 |
| **WDDM 연결 어댑터** | 주의 | 두 A6000 이 한 LUID(phys_0/phys_1)로 묶여 `memory.used` 가 **두 장 모두 같은 값(43,268 MiB)**. PDH 로 갈라 보면 phys_0 43,275 · phys_1 10,033 MiB. 장별 값이 아니므로 워커 예산은 외부 점유 하한 24,585 MiB(522.06 시절 마지막 정상 실측)로 계산 → **예산 22,507 MiB** |
| Ollama llama-server | OK | 4개 생존(종료 금지 · 건드리지 않음) |
| junction landxi/data | OK | 있음 |
| countCheck | OK | exit 0 |

## §1 계약 · 테스트

- `GET /api/v1/health` → `{"ok":true,"redis":true,"pg":true,"workers":{…}}` [실측].
- **pytest `server/tests` 52건**: 계약 키 집합·봉투 형(`test_contract` 32 라우트) · 관문 11 · 프록시 4 · SSE 재개 2 · VRAM 4 · countCheck. 이 세션에서 실패 2건(/ops/gpus 봉투 · 스윔레인 키)을 고쳤다(§12) → 최종 **52 통과**(50 + 완료 J1 조회 범위를 넓힌 SSE 재개 2) · `shots/f1/B/pytest-run.txt`.
- **Playwright `tests/e2e/f1b-*.spec.mjs` 5파일 12건 통과**(`LX_API=on` · 40.6s · `shots/f1/B/e2e-f1b-run.txt`): health · 계약 라우트 존재 · 봉투 500 · bench 표 · public 가드 · tenant 403 · 무서명 403 · V-World 503 · 견적→제출→206 스냅샷 · SSE 순서+Last-Event-ID 재개 · /events/ops · demo 계량.
- countCheck [실측]: farmland 2,098 · greenhouse 1,674 · change 456 · landcover 129,420(건물 49,800 · 경작지 76,215 · 주차장 2,677 · 비닐하우스 728) · lc-gt 4,889 · sido 17 · sigungu 249 · emd 39 · P3 88,404 — 파일·DB 모두 일치.

## §2 관문(사용자 결정 2026-09-24)

- `build=public` 카탈로그 자체 영상 **0**(외부 위성 xdworld · gibs 만) · 게스트가 `build=lx` 요청해도 public.
- tenant 세션: raw/cog 항목 0 · `/catalog/imagery/axis-iksan-hwangdeung` **403 imagery_forbidden** · `/tiles/cog/…` 403 · 원본 PMTiles 403.
- 기관 결과 세트 무서명 **403** · 서명 **206**(Accept-Ranges · ETag) · 다른 기관 서명 요청 403.
- 개발 모드 봉투 없는 숫자 → **500 envelope_missing**.
- 이번 추가: 황등 1.36cm 원본을 `ladder.domestic` 에 올림 — **lx 빌드에만** 남고 public·tenant 에서는 항목째 빠진다(e2e 로 확인).

## §3 bench(`/ops/bench` · `server/bench/throughput.py` · 2026-09-26 20:43–20:47 · GPU0 한 장)

| model | batch | imgsz | chips/s [실측] | peak VRAM MiB | util % | external_used MiB |
|---|---|---|---|---|---|---|
| car_v2_obb | 8 | 1024 | 28.72 | 2,486 | 76.8 | 24,585 |
| car_v2_obb | 16 | 1024 | **32.11** | 5,184 | 97.7 | 24,585 |
| aerial25/best | 8 | 1280 | 18.78 | 3,756 | 50.5 | 24,585 |
| aerial25/best | 16 | 1280 | 20.49 | 7,250 | 55.8 | 24,585 |
| namwon/Vinyl_house/train2 | 8 | 1024 | 24.08 | 3,064 | 84.2 | 24,585 |
| namwon/Vinyl_house/train2 | 16 | 1024 | **26.56** | 6,090 | 89.7 | 24,585 |

- 각 40s · 칩 미리 적재(읽기 제외) · fp16 · 외부 점유(Ollama 포함) 24,585 MiB 동시. 계약 예시의 23,396 MiB 는 9/24 값 [기록]. 스크린샷 `shots/f1/B/f1b-bench-ops.png`.
- Ollama: bench 전 llama-server 4 → bench 후 1(**PID 가 모두 다름** — Ollama 자체 keep-alive 로 러너를 내리고 다시 띄운 것. 워커는 종료 신호를 보낸 적 없음) → 지금 4 생존(`ollama-tasklist-*.txt`).
- 견적의 GPU·s·ETA 는 이 표의 `models.perf` 에서만 나온다(basis estimate · source `models.perf(car_v2_obb) 32.11 chips/s/GPU × n shard`).

## §4 J1 — 익산 황등 1.36cm × car_v2_obb(OBB)

| 실행 | shard | 첫 shard.done | job.done/스냅샷 | 탐지(전역 NMS 후) | GPU·s |
|---|---|---|---|---|---|
| J1 정본 AOI(0.20 km² · 리플레이 녹음) `job_01M3EV47…1515` | 1,369 | **1.88 s** | 66.4 s / 67.3 s | 386 | 48.3 |
| 영상용 AOI(0.053 km² · 완료 ≤25s 역산) `job_01M3EW5H…P8K` | 378 | 1.2–2.0 s(4회) | 18.5 s | 115 | 13.3 |
| SSE e2e(작은 AOI) | 81 | 1.19 s | 5.5 s | — | — |

- 견적(영상 AOI) [실측/추정]: 면적 0.053 km²(EPSG:5186 · measured) · shard 378 · GPU·s 11.8(estimate · bench) · ETA 14.8 s · 할당 잔여 무제한(lx). 실측 18.5 s — 차이는 창 읽기(1.36cm COG)·후처리 몫.
- SSE 순서 `job.queued → job.started → shard.started/shard.done … job.progress … → job.done → snapshot.ready` (녹음 2,785 이벤트 · `fixtures/replay/j1-hwangdeung.summary.json`). **첫 shard.done ≤ 5s 목표 충족**.
- 스냅샷: `results/lx/{job}.pmtiles`(ogr2ogr · layer results) → 서명 206.
- **정답 대비 P/R**(IoU≥0.5 · OBB↔SAM 폴리곤 · AXIS 검토 타일 안) — `results/lx/{job}/qa.json` 봉투:

| AOI | GT(범위 안) | 예측 | TP | FP | FN | P | R | P(yes 타일) | R(yes 타일) | mean IoU |
|---|---|---|---|---|---|---|---|---|---|---|
| 정본 0.20 km² | 19 | 211 | 15 | 196 | 4 | 0.071 | 0.789 | 0.923 | 0.80 | 0.792 |
| 영상 0.053 km² | 13 | 62 | 9 | 53 | 4 | 0.145 | 0.692 | 0.875 | 0.70 | 0.783 |

  - P 가 낮은 것은 **정답이 전수 라벨이 아니기 때문**: AXIS 'no' 타일(256px)에도 실제 차량이 있다. 'yes' 타일만 보면 P 0.88–0.92 · R 0.70–0.80. 전체 P 는 하한으로 표기(note).
  - GT 수 [실측]: 황등 전체 60(decision=yes) · 정본 AOI 20 · 검토 타일 2,380(AOI 안 751) · unsure 26 제외.
  - **자기 일치 아님**: `axis.db audit` 3,727행 중 car_v2*/drone_runs 참조 0 — AXIS 라벨 루프는 DINOv2 헤드 + 자체 YOLO seg 로 만들었고 car_v2_obb 를 쓰지 않았다.
- **F1-A 화면에서 도착 확인**: 직원 세션 on 모드 — 황등 1.36cm 칩(`LX 드론 1.36cm 2025`) → 사각 프레임 → 견적 카드 → 실행 → shard 격자 점등 → HUD `실측 · 지금 탐지 n · shard a/b · GPU0 u% · v칩/s` → `115건`(job.done) · 스냅샷 교체(`f1b-03/04/05*.png` · 영상).

## §5 J2b — 남원 비닐하우스 재추론(Vinyl_house/train2 × ap25-namwon-2023 · P1 · upsample 2)

- 큐 제출 `j2b-submit-terminal.txt` [실측]: kind reinfer · priority 1 · **81,574 shard** · 면적 1,011.3 km²(footprint · measured) · GPU·s 3,071(estimate · 26.56 chips/s) · 202 queued → `job_01M3EW9F7T8BF276Q44QM9JMQP` · `publish_as namwon-greenhouse-2023-vh`.
- 도엽 35710074 A/B(각각 큐 작업 · P1) — `shots/f1/B/j2b-ab-upsample{1,2,4}.jpg`:

| upsample | shard | 탐지 | 단동 | 다동 | GPU·s |
|---|---|---|---|---|---|
| ×1 | 143 | 15 | 5 | 10 | 9.5 |
| ×2 | 572 | 28 | 8 | 20 | 27.2 |
| ×4 | 2,236 | 96 | 27 | 69 | 99.6 |

  시각 점검: ×1·×2 는 줄지은 하우스 대부분을 놓치고 논 경계에 다동 오탐이 섞인다. ×4 에서 검출이 3.4배로 늘어 **드론(cm) 학습 모델은 영상이 커 보일수록 잘 잡는다**(도메인 이식 한계 · 정답 아님 · 검수 전). 전역은 브리프대로 ×2 로 돌렸다(×4 는 GPU·s 4배 — 결정 필요).
### §5-1 전역 결과 · 읍면동 대조표

- 21:51:08 시작 → 23:16:34 finalize(**85.4 분** · GPU0 한 장 · 5,126 s 중 A/B 3건·J1 영상 녹화·e2e 작업이 사이사이 섞임) · 3,933.8 GPU·s [실측] (견적 3,071 GPU·s [추정] — 창 읽기·upsample 몫).
- 후처리(P4 규칙): raw 4,170 → 동일 클래스 겹침 −582 · 읍면동 밖 −769 → **2,819**(다동 2,154 · 단동 665) · 전역 NMS 140 s · PMTiles 6.7 s.
- 게시 `results/lx/namwon-greenhouse-2023-vh.{pmtiles,geojson}` + manifest 항목 추가 · 서명 206 확인. 대조표 `results/lx/namwon-greenhouse-2023-vh-emd.json`.

| 읍면동 | A02 드론 2025 | P4 25cm aerial25 2023 | **J2b 25cm Vinyl ×2 2023** |
|---|---|---|---|
| 금지면 | 397 | 38 | 319 |
| 운봉읍 | 275 | 232 | 271 |
| 주생면 | 103 | 17 | 242 |
| 송동면 | 119 | 16 | 230 |
| 아영면 | 147 | 109 | 205 |
| 대산면 | 33 | 9 | 182 |
| 대강면 | 65 | 20 | 177 |
| 수지면 | 82 | 9 | 160 |
| 산동면 | 41 | 11 | 132 |
| 사매면 | 34 | 15 | 119 |
| 이백면 | 30 | 23 | 110 |
| 인월면 | 157 | 56 | 105 |
| 주천면 | 37 | 41 | 76 |
| 덕과면 | 18 | 6 | 64 |
| 보절면 | 28 | 18 | 63 |
| 산내면 | 41 | 91 | 19 |
| 동(洞) 23곳 합 | 67 | 18 | 317 |
| **합계** | **1,674** | **728** | **2,819** |

- 정직 표기: 세 열은 **연도·해상도·모델·범위가 다르다**(A02 = 2025 드론 판독 · 남원 일부 · P4 = 2023 25cm 4클래스 모델 · J2b = 2023 25cm × 드론 학습 비닐하우스 모델 = **도메인 이식**). 어느 것도 정답이 아니며 모두 AI 추론 · 검수 전. A/B 이미지에서 본 것처럼 J2b 는 ×2 에서도 줄 하우스를 놓치고 논 경계 다동 오탐이 섞인다 — 2,819 는 "비닐하우스 수"가 아니라 "이 모델이 이 영상에서 낸 폴리곤 수". 산내면처럼 P4 > J2b 인 곳도 있다.

## §6 demo:true(영업 세션)

- sales 계정이 `demo:false` 를 보내도 `demo_required` → 시연으로만. 영상 시연 작업 `job_01M3EW6CP34ER73RPQ7VP7BFWZ`(81 shard · 5.3 s · 탐지 34): **detections 0행** · usage_events **tenant_id='lx-demo' 2 dim(area_km2 1 · gpu_s 6행 · 3.16 GPU·s)** — psql 출력이 영상 35–53 s · `f1b-07-terminal-psql.png`. e2e `f1b-demo-metering`: detections 0 · lx-demo 7행 · 다른 테넌트 0.
- F1-A 마스트 `영업 · 시연` · HUD `시연`.

## §7 /events/ops

- F1-C 폴러가 살아 있어 `ops:gpu` 스트림을 tail(`gpu.sample`) · `queue.sample`(값이 바뀔 때) · `ops:events`(job.state 38 · usage.delta 362 · deploy.changed 39 — 누적 795건 중 [실측]). 폴러가 없으면 봉투 null + note(코드 경로 유지).
- 폴러가 드라이버 597.16 에서 프로세스별 VRAM(PDH)을 **맨 숫자**로 주기 시작해 `/ops/gpus` 가 500 envelope_missing → 게이트웨이가 봉투로 감싸도록 고침(§9).

## §8 이식 · 배포 상태기계

- `POST /deploys`(from_deploy_id 계보 · aoi 필수) → **draft** · ga 직행 409 **invalid_stage_transition** · canary→ga 409 **approval_required** → approve 후 ga · 잠금 모듈 400 **module_locked** · rollback: `snapshot_current ↔ snapshot_prev` 교체 + card_version 되돌림 · 모든 쓰기 `audit_log` + `deploy.changed`(pytest `test_deploy_state_machine` · `test_audit_log_written`).

## §9 V-World · PC 프록시

- 키 권한 미반영 → **503 vworld_key_pending**(e2e 실호출). 키 투입 시 캐시 경로·만료 키 503 → 정상 키 200+캐시 적중은 단위 테스트(실키 없이 목 전송) · PC register/statistics 캐시 적중 단위 테스트.

## §10 리플레이 · 목 · 어댑터 스캔 · 소유

- `fixtures/replay/j1-hwangdeung.ndjson` **재녹음**(21:31 · 게이트웨이 SSE 실수신 · 2,785 이벤트 · job.done·snapshot.ready 포함 — 직전 녹음은 재부팅 직전에 1,130 이벤트에서 끊겨 있었다).
- `mock/mock_api.py :8701` 가동 중 — 계약 픽스처 32 라우트 전부 픽스처 상태코드 그대로 · `/events/jobs/*` 가 녹음을 흘림(`?speed=` 배속 추가 · 20배속 3.6 s) · `/events/ops` 합성(basis demo). 한글 note 헤더 때문에 일부 라우트가 500 이던 것 고침.
- 어댑터 스캔: 워커 기동 로그 `adapters: yolo_obb(core·gpu), yolo_seg(core·gpu), index/ndvi_pc(global·cpu), index/worldcover_hist(global·cpu)` — `server/adapters/global/**`(F1-D) 자동 등록 · models 동기화.
- 소유 밖 수정 0(landxi/** · server/ops/** · adapters/global · pipelines/global 손대지 않음).

## §11 판정 영상 · 캡처(`shots/f1/B/` · 사본 `shots/f1/F1-B/`)

- `f1b.webm` / `f1b.mp4` — 1440×900 · **53.8 s 실시간(배속·편집 없음)** · 왼쪽 480 px 터미널(실명령·실로그 · `_tools/termfeed.py`) + 오른쪽 F1-A XI맵(on 모드 녹화 1440×900 축소). 원본 해상도: `f1b-screen-1440x900.mp4`(F1-A 화면만) · `f1b-terminal-480x900.mp4`.
  - 0–4 s compose ps(redis·postgis healthy) · 워커 로그 `vram budget 22,507 MiB · external 24,585 MiB(llama-server ×4, python ×1)` · tasklist llama-server · nvidia-smi 1 s 패널
  - 4–16 s 익산 황등 z13→z17 하강(1.36cm 칩) · 사각 프레임 · 견적 카드(0.053 km² · 378 · 11.8 GPU·s · 무제한)
  - 16–35 s 실행 → 격자 점등 ↔ 워커 `shard.done r0xxc0yy n=… 33ms a6000-0` · GPU0 사용률 0→99 % · HUD 실측 · finalize 로그
  - 35–40 s job.done 115건 · 스냅샷 교체 · 가르기 · 터미널 qa.json P/R 봉투 · 자기 일치 아님
  - 40–54 s 영업 세션 재접속 → `영업 · 시연` · 작은 프레임 실행(5 s) · psql detections 0 · usage_events lx-demo
- 100 ms 프레임 스트립 `f1b-strip-{run,mid,snapshot,sales}-100ms.png` · 핵심 컷 `f1b-01…07*.png` · 합성 프레임 `f1b-composite-frame-*.png` · 타임라인 `f1b-timeline.json`.
- 영상 길이가 ≈40 s 대신 54 s 인 이유: 실시간 녹화이고 영업 세션 재접속(페이지 부팅 ≈5 s)을 자르지 않았다.

## §12 이 세션에서 실측으로 드러나 고친 것

1. **finalize 가 index 작업 뒤에 막힘**: CPU 워커가 F1-D 의 NDVI(PC 원격 · shard 당 수십 초)와 finalize 를 한 줄로 돌려 J1 스냅샷이 +280 s 늦어짐(실측 178 s) → finalize 전용 스레드 · index shard 는 1개씩. 이후 영상 AOI 20.0 s.
2. **VRAM 예산 오판**: 연결 어댑터 합계값(43,268) 때문에 예산이 3,824 MiB 로 계산됨 → 두 장 값이 같으면 장별 값으로 쓰지 않고 CUDA 측정 + 외부 하한(24,585)으로 → 22,507 MiB. 진행 이벤트의 util/mem 은 nvidia-smi 원값.
3. **P1 작업 기아**: 같은 기관·같은 우선순위는 오래된 작업 먼저 → 8만 shard 전역 뒤에 143 shard 도엽 작업이 무한 대기 → 배정 shard 수가 적은 작업 먼저(작업 단위 공정 분배). 재시작 뒤 A/B 3건이 전역과 섞여 5분 안에 끝남.
4. **스윔레인 블록 키 누락**(`from`·`tenant_id`): 작업이 섞이면 머리 블록이 다른 작업 → 최근 50 블록에서 찾아 갱신 · 새 블록은 계약 키를 채움(기존 3 블록 복구).
5. `/ops/gpus` 폴러 맨 숫자 → 봉투 · 목 서버 한글 헤더 500 · A/B 이미지 범례 색(하늘색=단동 · 주황=다동).

## §13 남은 것

- F1-A 쪽 후속(소유 밖 · 제안만): 가르기 오른쪽 칩이 작업 결과가 아닌 `남원 토지피복`을 표기 · HUD 상단 기본 헤드가 남원 전역(129,420)으로 시작 · 정답(GT) 층 토글이 없어 P/R 카드는 터미널로 보였다.
- V-World Data API 키 권한 반영 대기(프록시는 즉시 활성 코드).
- A100 노드 2(pending) 가입 토큰 발급 후 실측.
