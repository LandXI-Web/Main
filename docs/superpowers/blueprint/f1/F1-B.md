# F1-B — 실추론 백엔드 (FastAPI 게이트웨이 · Redis 큐 · GPU/CPU 워커 · 타일 서빙 · 프록시 · PostGIS)

- 모델 **Opus 5.5** · 난이도 XL · 기간 10–12일 [추정] · 판정 Fable 5.1(계약 준수 + F1-A 화면에서 실추론이 보이는가)
- 읽을 것(순서): ① `blueprint/F1-CONTRACT.md` 전문(**정본**) ② `LANDXI-HYPER-BLUEPRINT.md` §3.3·§5·§10.1·§10.4(v1.1) ③ `recon-0924/{env.md,stack.md,pipeline-run.md,vworld.md}` ④ `02. 데이터/manifest.json` · `_scripts/p4_infer.py` · `p4_merge.py`(칩·NMS·후처리 방식 재사용) ⑤ `landxi/assets/data/cards.js`(시드 원본)
- 공통 규칙: git 금지 · 소유 밖 수정 0 · 서버 4173 끄지 말 것 · **Ollama `llama-server` 절대 종료 금지** · 원본 영상은 읽기만 · `docker compose -p landxi`로만 조작(cleanriver 스택 건드리지 않음).

## 목표

`F1-CONTRACT.md`의 모든 라우트·이벤트·키·스키마를 **그 형식 그대로** 구현하고, A6000 두 장이 **실제로** 추론해 SSE로 결과가 흐르게 한다. 첫 실추론 J1(익산 황등 1.36cm × 차량 OBB), 큐 뒤에 J2b(남원 비닐하우스 YOLO11x-seg × 25cm 전역 · P1), 그리고 F1-D가 붙일 CPU 인덱스 작업(G-J1)이 같은 워커 프레임에서 돈다. 처리량은 **재서** `models.perf`에 쓴다 — 화면의 예상 소요는 그 값에서만 나온다.

## 근거 발견
- 설계서 §10.1: PostGIS 이미지 없음(pull 필요) · WDDM(프로세스별 VRAM N/A) · Ollama 23,396 MiB × 2 · CSP 불가.
- §10.3: `gcs`에 ultralytics 없음 → **워커는 시스템 Py 3.11.4**(ultralytics 8.3.234 · torch cu118 확인 [실측]). asyncpg · redis · pmtiles · argon2-cffi · sse-starlette **미설치** → D0 설치 스모크.
- §10.4: SSE가 Node 프록시를 지나면 버퍼링 위험 → **역프록시 없음**. 프론트가 :8700을 직접 부른다(CORS). `serve.mjs` 수정 0.
- pipeline-run §3: P4 실측 — 1024칩 · overlap 128 · batch 16 fp16 · 장당 +11GB · ≈26칩/s/GPU · 후처리 규칙(simplify .3m · <4m² 제거 · 동일 클래스 50% 겹침 제거 · 법정동 밖 제외). 이것이 워커 후처리의 정본.
- pipeline-run §6-2: 비닐하우스 25cm에서 728건 — `Vinyl_house/train2`(yolo11x-seg · .938) 재추론 J2b는 도메인 이식 실험. 정직 표기.
- vworld.md: Data API CORS 없음 · 키 권한 미반영 → 프록시는 코드만, 503 `vworld_key_pending`.

## owned_files (모두 새 경로)
`server/README.md` · `server/docker-compose.phase0.yml`(redis :6380 · postgis :5433 · 프로젝트명 landxi) · `server/.env.example` · `server/requirements.txt` · `server/setup.ps1`(설치 스모크 · junction 안내) · `server/run-gateway.ps1` `run-workers.ps1` `run-mock.ps1` · `server/landxi_api/{__init__,main,config,deps,envelope,auth,catalog,tiles,proxy,jobs,events,results,registry,deploys,quota,ops,parcels,feedback}.py` · `server/migrations/0001_init.sql` · `server/seed/{seed_from_cards_js.py,accounts.dev.json,count_check.py}` · `server/config/{sets.yaml,pools.yaml,quotas.yaml,alerts.yaml,region_profiles.yaml}` · `server/workers/{scheduler,gpu_worker,cpu_worker,vram,tiling,postprocess,metering,registry_scan}.py` · `server/adapters/{__init__,base,adapter_yolo_seg,adapter_yolo_obb}.py` · `server/pipelines/{p8_parcels.py,p15_axis_cog.py,seed_replay_record.py,snapshot_pmtiles.py}` · `server/bench/throughput.py` · `server/mock/mock_api.py` · `server/fixtures/contract/*.json` · `server/fixtures/replay/*.ndjson` · `server/tests/{test_contract.py,test_count_check.py,test_vram.py,test_sse_resume.py,e2e-on.ps1}` · `tests/e2e/f1b-*.spec.mjs`(`f1b-health` `f1b-quote-submit` `f1b-sse` `f1b-public-guard` `f1b-demo-metering`) · `shots/f1/B/**` · `blueprint/f1/F1-B-result.md` · `LX_DATA_ROOT/{results/**,cog/**,cache/**,parcels/**}` · `LX_DATA_ROOT/manifest.json`(항목 **추가만**)

제외(다른 에픽): `server/ops/**`(F1-C 폴러) · `server/adapters/global/**` · `server/pipelines/global/**`(F1-D). 어댑터 스캔이 이 폴더들을 **자동 등록**하게 만든다(`ADAPTER` 상수 · 계약 §7).

## 단계별 할 일

### 0. D0–D1 설치 스모크(결과 문서 §0에 표로)
- `docker pull postgis/postgis:16-3.4`(네트워크) · compose up(-p landxi · 6380/5433) · `redis-cli -p 6380 ping`.
- `pip install asyncpg redis[hiredis] pmtiles argon2-cffi sse-starlette python-multipart pyyaml` (시스템 Py 3.11.4). titiler.core는 **선택**(`--no-deps` 시도 · 실패하면 `/tiles/cog` 501 유지 · 결과 문서에 기록).
- `ogr2ogr -f PMTiles` 경로 = `C:\Users\User\anaconda3\envs\gcs\Library\bin\ogr2ogr.exe`(env.md) 서브프로세스 스모크.
- nvidia-smi 경로 실행 · WDDM 확인 · 예산 계산(`vram.py`) 단위 테스트.
- `setup.ps1`이 위 전부를 idempotent하게 돌리고 junction 안내를 찍는다.

### 1. 게이트웨이 `landxi_api/`
- FastAPI · uvicorn `--port 8700` · CORS(`http://localhost:4173` `http://localhost:8702`) · `envelope.py`가 응답 직렬화 전 **숫자 필드 스캔**(개발 모드 봉투 없으면 500 `envelope_missing` · 구조 필드 화이트리스트).
- `auth.py`: argon2 · Bearer(`sessions` 표 · 만료 24h) · SSE `access_token` 쿼리 · `deps.py`가 요청마다 `SET LOCAL app.realm/app.tenant_id`.
- `catalog.py`: `imagery` + `config/sets.yaml` + 외부 사다리(`config/ladder.yaml` — 계약 §4.1 URL 그대로) → LayerItem · **`build=public` 가드**(자체 영상 제외 · `security_review='cleared'`만) · `build=tenant` 가드.
- `tiles.py`: PMTiles Range(206 · ETag · `Accept-Ranges`) · XYZ 204 · 서명(HMAC-SHA256 · `exp` 12h) · `/tiles/sign` · `/files/models/*`(lx).
- `jobs.py`: quote(면적 EPSG:5186 · shard 수 = `tiling.py` · gpu_s = `models.perf` × shards 없으면 null) · 쿼터 집행(`quota.py` · 정책 3종) · submit → `jobs` 행 + `XADD jobs:{pool}` · cancel/requeue/priority.
- `events.py`: `sse-starlette` · `XREAD events:{job}` tail + `Last-Event-ID`/`last_event_id` 재개 · 10s `: hb` · `X-Accel-Buffering: no`. `/events/ops`는 `ops:gpu` · `ops:queue` · `ops:alerts` 스트림 tail + `deploy.changed` · `job.state`.
- `results.py`: features(bbox · cls · min_conf · 페이지) · shards GeoJSON(`results/{tenant}/{job}/shards/*.geojson` 파일) · stats(P4 emd-stats 파일 그대로 → 봉투) · PATCH(lx staff · `edit_state`) · `parcels.py`(P8 PMTiles를 서버에서 `pmtiles` 파이썬으로 조회 · 없으면 404 `parcels_unavailable`).
- `registry.py`: `models/index.json`(9런) + `car_v2_obb` + `aerial25/best` → `models` 행(`registry_scan.py`) · cards.js → cards/card_versions(시드) · lineage.
- `deploys.py`: 계약 §4.7 전부 · 상태기계 · `approval_required` · 이식 `POST /deploys`(from_deploy_id 계보 · draft · aoi 필수) · 모든 쓰기 `audit_log` + `deploy.changed` 이벤트.
- `quota.py`: `/t/{tenant}/usage`(du 60s 캐시 · usage_events 합 · forecast 선형 [추정]) · `PUT /tenants/{id}/quota`(admin · approvals 행).
- `ops.py`: `/ops/*` 읽기(Redis `ops:*` 해시·스트림은 **F1-C 폴러가 채운다** — 비어 있으면 봉투 null + `note:'폴러 미기동'`) · nodes(자기 노드 + A100 pending 2) · queues(XINFO · lanes) · storage(statfs + du) · alerts(`alerts.yaml` 평가 · 60s) · models(resident 집합) · bench · join-token · load/unload(워커에 `XADD control:{worker}`).
- `proxy.py`: vworld(키 `.env` · 캐시 · **503 vworld_key_pending** 분기 · 키 살아나면 즉시 활성 · 일일 계량) · pc(register/statistics/search 대리 + 캐시).

### 2. 시드 · 마이그레이션
- `0001_init.sql` = 계약 §6 그대로(RLS 정책 포함 · 파티션 `detections` LIST tenant 6 + `usage_events` RANGE 월).
- `seed_from_cards_js.py`: Node로 `cards.js` `portal.js` `results.js`를 JSON 덤프(`node -e import`)해 tenants 6 · cards 9 · card_versions 8 · deploys 8(§6 시드 ID · `basis:'history'` · `scale` 봉투는 출처 있는 것만) · imagery(manifest + 외부) · quotas(`quotas.yaml`) · accounts(`accounts.dev.json` · `DEV_PASSWORD`).
- `count_check.py`(pytest): farmland 2,098 · greenhouse 1,674 · change 456 · landcover 129,420(4클래스 수) · lc-gt 4,889 · sido 17 · sigungu 249 · emd 39 · P3 88,404 — 하나라도 다르면 실패.

### 3. 워커 `workers/` · 어댑터 `adapters/`
- `scheduler.py`: `XREADGROUP g:sched jobs:{pool}` → `tiling.py`(AOI ∩ footprint → 1024칩 · overlap 128 · `r{row}c{col}` · 래스터 창) 또는 `params` shard(index) → `XADD shards:{pool}` · 우선순위·기관 deficit RR · `concurrent_jobs` 집행 · `job.queued/started` 이벤트 · 하트비트 감시 `XAUTOCLAIM` 30s.
- `gpu_worker.py`(GPU 1장 = 프로세스 1 · `CUDA_VISIBLE_DEVICES`): 시작 시 `vram.py` 예산(`total − used − 2048` · `set_per_process_memory_fraction`) · 어댑터 스캔(`server/adapters/**/adapter_*.py`) · 모델 상주(LRU · `ops:models`) · shard 창 읽기(`rasterio` COG/GeoTIFF · 원본 경로는 `imagery.path_internal`) · `run_shard` · 칩 내 NMS · 4326 변환 · `COPY detections`(`ON CONFLICT DO NOTHING`) · shard GeoJSON 파일 · `shard.done` · `job.progress`(≤1/s · chips/s 10s 창 · nvidia-smi util/mem 스냅샷) · 계량(`usage_events` · demo → `lx-demo`) · `worker:{id}:vram` 2s · 하트비트 10s.
- `adapter_yolo_obb.py`(B05 · `car_v1/infer_orthomosaic.ipynb` 방식) · `adapter_yolo_seg.py`(P4 `p4_infer.py` 방식 · `upsample` 옵션 · 클래스명은 가중치에서 읽음).
- `cpu_worker.py`: 전역 NMS + 후처리(P4 규칙) → `results/{tenant}/{job}.pmtiles`(`ogr2ogr -f PMTiles` · layer `results` · promote `id`) → `snapshot.ready` · manifest 항목 추가 · index kind는 `index_results` 저장 + `index.month` 이벤트 · 어댑터 `device:'cpu'` 실행.
- `postprocess.py`: simplify .3m · <4m² 제거 · 동일 클래스 50% 겹침 → 낮은 conf 제거 · `emd/emd_cd` 부여(A11) · `chip_edge`.

### 4. bench · J1 · J2b · 리플레이 녹음
- `bench/throughput.py`: 모델 × A6000 · 1024칩 · batch {8,16} · fp16 · 60s → `models.perf`(`chips_per_s` 봉투 · note `외부 점유 {external_used_mib} MiB 동시`) · `/ops/bench`. **Phase 0 첫 작업.** 느리면 영상용 AOI를 "완료 ≤ 40s"로 역산해 결과 문서에 적는다.
- `p15_axis_cog.py`: B04 익산 황등 → COG(WEBP · `cog/axis_iksan_hwangdeung.tif`) + `axis.db` 자동차 라벨 픽셀→5186→4326 GeoJSON → **황등 AOI 안 GT 수를 센다**(봉투 measured · `results/lx/axis-hwangdeung-gt.geojson`) · 라벨 있는 칩 마스크. `imagery` 행(tier raw+cog · export never).
- J1 실행(직원 계정 · demo false) → 정답 대비 P/R(IoU ≥ 0.5 OBB↔폴리곤 · 라벨 있는 칩 안만) → `results/lx/job_…/qa.json` 봉투. AXIS 루프가 car 모델을 썼는지 `axis.db audit`로 확인해 `자기 일치` 여부 표기.
- J2b: `POST /jobs {kind:'reinfer', model_id:'namwon/Vinyl_house/train2', imagery_id:'ap25-namwon-2023', priority:1, options:{upsample:2}}` — 한 도엽(35710074) A/B(upsample 1/2/4)를 먼저 돌려 시각 점검 → 전역. 결과 `results/lx/namwon-greenhouse-2023-vh` · 읍면동 대조표(A02 1,674 · P4 728 · J2b n) 결과 문서.
- `seed_replay_record.py`: J1 SSE를 녹음해 `fixtures/replay/j1-hwangdeung.ndjson`(계약 §5.1 형식 · 프론트 에픽에 전달).
- `demo:true` 경로: sales 계정 J1 재실행 → `detections` 0행 · `usage_events tenant='lx-demo'` n행 단언(`f1b-demo-metering`).

### 5. 목 게이트웨이 · 계약 테스트
- `mock/mock_api.py`(:8701 · D0+1): `fixtures/contract/*.json` 그대로 응답 + `/events/jobs/*`를 `fixtures/replay/*.ndjson`로 흘림 + `/events/ops` 합성 샘플(`basis:'demo'`). 프론트 세 에픽이 첫 주에 붙는 대상.
- `test_contract.py`: 라우트 응답 키 집합 = 픽스처 키 집합 · 봉투 형 검사 · SSE 이벤트 이름 집합 · 오류 코드 집합.
- `test_sse_resume.py`: 끊고 `Last-Event-ID`로 이어 받기 · `test_vram.py`: 예산 계산.
- `e2e-on.ps1`: compose up → 마이그레이션 → 시드 → 게이트웨이 → 워커 2 → `LX_API=on npx playwright test tests/e2e/f1b-`.

## 완료 기준(acceptance)
1. `setup.ps1` 스모크 표(PostGIS pull · pip · ogr2ogr · nvidia-smi · titiler 여부) — 결과 문서 §0.
2. `GET /health` ok · 계약 §4 라우트 전부 존재 · `test_contract.py` 통과 · `count_check` 통과.
3. `build=public` 카탈로그에 자체 영상 0(spec) · tenant 세션으로 `tier=raw`·cog 라우트 403/없음 · 서명 없는 기관 결과 세트 403.
4. bench 표(`/ops/bench`) — 최소 `car_v2_obb` · `aerial25/best` · `Vinyl_house/train2` × batch 2종 · `external_used_mib` 기록.
5. J1: quote → submit → SSE(`job.queued … snapshot.ready` 순서) → PMTiles 스냅샷 · 첫 `shard.done` ≤ 5s [목표 · 실측 기록] · P/R 봉투 · `results/lx/job_…` 열림. F1-A 화면(또는 목 프론트 `server/mock/theater.html` 금지 — F1-A 화면만)에서 도착이 보인다.
6. J2b 큐 제출 · 도엽 A/B 시각 점검 이미지 · 전역 결과 세트 · 읍면동 대조표(정직 표기).
7. `demo:true` 계량 분리(`lx-demo`) · detections 0.
8. `/events/ops`가 F1-C 폴러 스트림을 tail(폴러 없으면 봉투 null) · `deploy.changed` · `job.state` 발행.
9. 이식 `POST /deploys` → draft · rollback 스냅샷 교체 · `approval_required` · `invalid_stage_transition` 코드.
10. V-World 프록시 503 `vworld_key_pending` · 키 투입 시 캐시 경로 동작(단위 테스트 · 실키 없이).
11. `fixtures/replay/j1-hwangdeung.ndjson` 녹음본 · `mock_api.py` 동작 · 소유 밖 수정 0 · Ollama 프로세스 생존 확인(전후 `tasklist`).

## 판정용 동작 영상(≈ 40s · F1-A 화면 + 터미널 반화면 · `shots/f1/B/f1b.webm`)
| 초 | 무엇 |
|---|---|
| 0–5 | 터미널: `docker compose -p landxi ps`(redis·postgis up) · `run-workers.ps1` 로그에 `vram budget 25,700 MiB · external 23,396 MiB(llama-server ×4)` · `nvidia-smi` 표(Ollama 살아 있음) |
| 5–12 | F1-A 화면(직원 세션): 익산 황등 1.36cm로 하강 · 사각 프레임 → 견적 카드(면적 · shard 1,120 · GPU·s [추정 · bench 값] · 할당 잔여) |
| 12–30 | 실행 → shard 격자 점등 · 터미널 워커 로그가 `shard.done r003c007 n=7 412ms a6000-0`로 흐르고 화면 칸이 같은 순서로 걷힘 · HUD `탐지 n · shard a/b · GPU0 u% · v칩/s [실측·지금]` · nvidia-smi 사용률이 0 → 60–90%로 |
| 30–35 | `job.done` 도착 · `snapshot.ready` 소스 교체 · 스와이프로 GT(황등 AOI n건) 대비 P/R 봉투 카드 |
| 35–40 | 영업 세션으로 같은 프레임 `demo:true` → 마스트 `시연` · 터미널 `psql: select count(*) from detections where job_id=…` → 0 · `usage_events tenant_id='lx-demo'` n행 |
+ J2b 큐 제출 터미널 캡처 · 도엽 A/B 이미지 3장 · bench 표 스크린샷.


---
## ⚠ 전력 규칙 (2026-09-26 필수, 모든 에픽)
GPU 2장 동시 풀로드로 PC가 전력 부족 셧다운됨. **무거운 GPU 작업(추론·재추론·벤치·vLLM)은 한 번에 GPU 한 장만** — `CUDA_VISIBLE_DEVICES=0` 기본, 워커 동시 고부하 GPU 수 ≤ 1, 배치 보수적. 두 장을 동시에 쓰는 벤치·재추론 금지. 스케줄러는 전력 예산(동시 고부하 ≤1)을 1급 제약으로 구현. Ollama 종료 금지.


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
