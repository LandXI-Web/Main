# server/ops — LX/OPS 폴러 (F1-C)

관제(:8702)와 게이트웨이(:8700)가 읽는 **실측 텔레메트리**를 만든다. 둘 다 **읽기 전용**이다 — GPU 위 어떤 프로세스도 멈추거나 건드리지 않는다(Ollama `llama-server` 종료 금지 · 사용자 결정).

| 파일 | 주기 | 읽는 것 | 쓰는 것(계약 §5.3) |
|---|---|---|---|
| `gpu_poller.py` | 2s | `nvidia-smi --query-gpu` · `--query-compute-apps` · Windows PDH `GPU Adapter Memory` / `GPU Process Memory` · `worker:{id}:vram` | `ops:gpu:{node}:{idx}` hash · `ops:gpu` stream(MAXLEN ~3600) · `node:{node}` hash + TTL 30s(10s 하트비트) |
| `storage_poller.py` | 60s | `shutil.disk_usage`(E: D: C:) · `du`(LX_DATA_ROOT `tiles/` `results/` `vector/` · 기관별) | `ops:storage` hash + TTL 180s |
| `llm_poller.py` (F2-C) | 10s | vLLM `:8000` `:8001` `/metrics`(generation_tokens_total 차분 → tps · 요청 · KV) · Ollama `/api/ps`(자기 보고 VRAM) · `docker inspect`(GPU 배치 · 읽기만) · Redis `agent:models` | `ops:llm`(SET EX 120) → gpu_poller 가 `external[].llm` 띠로 싣는다 |
| `audit_read.py` (F2-C) | 요청 시 | PostGIS `audit_log` · `approvals` · `usage_events(dim='llm_tokens')` — **SELECT 만** | — (게이트웨이 직결 관제의 이력·결재·LLM 링을 :8702 가 대신 읽는다) |
| `run-pollers.ps1` | — | 세 폴러 기동·정지 · 단독 검증 | — |

## 실행

```powershell
# 단독 검증(Redis 없이 · 한 번 읽고 JSON 한 줄씩)
powershell -File server/ops/run-pollers.ps1 -Stdout -Once
python server/ops/gpu_poller.py --stdout --once --redis=
python server/ops/storage_poller.py --stdout --once --redis=

# 운영(게이트웨이 단독 운영 시) — Redis 는 server/.env 의 REDIS_URL(기본 redis://localhost:6380)
powershell -File server/ops/run-pollers.ps1            # 백그라운드 · 로그 02. 데이터/_logs/f1c-*-poller.err
powershell -File server/ops/run-pollers.ps1 -Stop      # 이 스크립트가 띄운 PID(.pollers.pids)만 멈춘다
```

`landxi/ops/serve-ops.mjs`(:8702)는 두 폴러를 `--stdout` 자식으로 직접 띄운다(`OPS_NO_POLLERS=1`이면 끈다). 이때도 Redis 가 닿으면 같은 키를 함께 쓰므로 게이트웨이 `/ops/gpus`·`/events/ops`가 같은 값을 본다.

환경: `LX_NODE_ID`(기본 `node-tr3995wx`) · `LX_REDIS_URL` · `LX_NVSMI`(nvidia-smi 경로 고정) · `LX_PHYS_MAP`(PDH phys ↔ nvidia index, 예 `1:0,0:1`) · `LX_DATA_ROOT` · `LX_WORKER_VRAM_URL`(Redis 가 없을 때 `worker:{id}:vram` 대신 읽을 JSON URL).

## 이 PC에서 확인한 것(2026-09-26)

- **드라이버가 522.06 → 597.16으로 바뀌었다.** DriverStore 에 `nv_dispwi.inf_…\nvidia-smi.exe`가 새로 생겼다. `find_nvsmi()`는 이제 DriverStore 안의 nvidia-smi 중 **가장 최근 것**을 쓴다(계약 §1 경로는 옛 폴더).
- **597.16 WDDM에서 GPU에 상주 프로세스가 없으면 `memory.used`가 `17,592,186,044,414 MiB`(음수 언더플로)로 나온다.** 이때 `memory.free`도 CUDA 할당을 반영하지 않았다(F1-B bench가 GPU0을 100% 쓰는 동안 free 48,573 MiB). 폴러는 값을 지어내지 않는다:
  1. `memory.used ≤ memory.total`이면 그대로(`source: nvidia-smi memory.used`)
  2. 이상값이면 **Windows 커널 집계**(PDH `\GPU Adapter Memory(luid_…_phys_N)\Dedicated Usage`)로 대체하고 `note`에 이상값과 대체 사실을 적는다
  3. PDH도 없으면 `memory.total − memory.free`(하한이라고 `note`에 적는다)
- **WDDM에서도 프로세스별 VRAM을 읽을 수 있다.** nvidia-smi `used_memory`는 `[N/A]`이지만 PDH `\GPU Process Memory(pid_…_phys_N)\Dedicated Usage`는 값을 준다. `external[]`의 `mem_mib`가 그 값이다(없으면 `null` + `note: WDDM: 프로세스별 VRAM N/A`). 예: Ollama `llama-server.exe` 8,647 MiB + 3,956 MiB가 GPU 두 장에 나뉘어 올라 있었다.
- **phys ↔ nvidia index는 반대다.** 두 A6000은 한 luid 아래 `phys_0`/`phys_1`로 보이고, F1-B bench(pid 39660)가 nvidia-smi GPU0 · 카운터 `phys_1`에만 있었다 → 기본 대응 `phys_1→0 · phys_0→1`. 한 장에만 있는 pid가 보일 때마다 다시 배운다(두 장에 걸친 Ollama 분할은 증거로 쓰지 않는다).
- `nvidia-smi --query-compute-apps`는 `[Insufficient Permissions]` 행(pid 4)을 낸다 — 이름을 모르므로 목록에서 뺀다.

## Redis 키 샘플(2026-09-26 실측 · redis://localhost:6380)

`HGETALL ops:gpu:node-tr3995wx:0`
```
driver 597.16 · mode WDDM · name "NVIDIA RTX A6000" · index 0 · worker a6000-0 · job_id ""
util_pct 0 · mem_used_mib 24585 · mem_total_mib 49140 · temp_c 53 · power_w 17.75
external_used_mib 24585 · external_n 0 · external_names "" · at 2026-09-26T20:38:24.385+09:00
json {"index": 0, "name": "NVIDIA RTX A6000", "util_pct": {"value": 0, "unit": "%", "basis": "measured", "as_of": "…", "source": "nvidia-smi utilization.gpu"}, … "external_used_mib": {"value": 24585, "unit": "MiB", "basis": "measured", "source": "memory.used − 워커 자기 보고", "note": "워커 미기동 시 = memory.used"}, "worker": "a6000-0", "job_id": null, "worker_vram": null, "driver": "522.06", "mode": "WDDM"}
```
`XLEN ops:gpu` → 169(MAXLEN ~3600) · 항목 필드 `{node, at, json}` · `TTL node:node-tr3995wx` → 29(하트비트 10s · TTL 30s)

`HGETALL ops:storage` → `at` · `E_free_gb 2054` · `D_free_gb 363` · `C_free_gb 133` · `json {…/ops/storage 응답 전체}` · `TTL` 179

## GpuSample 한 장(`gpu_poller.py --stdout --once` · 2026-09-26 20:45 · GPU0에서 F1-B bench 실행 중)

```json
{ "node": "node-tr3995wx", "at": "2026-09-26T20:45:27.999+09:00",
  "gpus": [ { "index": 0, "name": "NVIDIA RTX A6000",
    "util_pct":      { "value": 100, "unit": "%", "basis": "measured", "source": "nvidia-smi utilization.gpu" },
    "mem_used_mib":  { "value": 567, "unit": "MiB", "basis": "measured", "source": "nvidia-smi memory.total − memory.free",
                       "note": "memory.used 이상값 17,592,186,044,415 → total−free 로 대체(드라이버 597.16 WDDM)" },
    "mem_total_mib": { "value": 49140, "unit": "MiB", "basis": "measured", "source": "nvidia-smi memory.total" },
    "temp_c":        { "value": 82, "unit": "°C", "basis": "measured", "source": "nvidia-smi temperature.gpu" },
    "power_w":       { "value": 170.5, "unit": "W", "basis": "measured", "source": "nvidia-smi power.draw" },
    "external": [ { "pid": 39660, "name": "python.exe", "mem_mib": null, "note": "WDDM: 프로세스별 VRAM N/A" } ],
    "external_used_mib": { "value": 567, "unit": "MiB", "basis": "measured", "source": "memory.used − 워커 자기 보고", "note": "워커 미기동 시 = memory.used" },
    "worker": "a6000-0", "job_id": null, "worker_vram": null, "driver": "597.16", "mode": "WDDM" } ] }
```
위 샘플은 PDH 보강 **전** 출력이다. 그 567 MiB가 틀렸다는 것(bench가 실제로 3,362 MiB를 쓰고 있었다 — PDH 확인)이 PDH 경로를 넣은 이유다. 보강 뒤 같은 상황은 `source: Windows PDH GPU Adapter Memory · Dedicated Usage`로 나온다.

## /ops/storage 한 장(`storage_poller.py --stdout --once`)

```json
{ "volumes": [ { "mount": "E:", "free_gb": { "value": 2065, "unit": "GB", "basis": "measured", "source": "shutil.disk_usage (statfs)" },
                 "total_gb": { "value": 7452, … }, "used_gb": { "value": 5387, … } }, { "mount": "D:", … }, { "mount": "C:", … } ],
  "by_tier": { "raw":    { "value": null, "note": "원본은 LX_DATA_ROOT 밖 · 목록만" },
               "tile":   { "value": 1.86, "unit": "GB", "source": "du …/02. 데이터\\tiles", "note": "90,404 파일" },
               "result": { "value": 0.27, "unit": "GB", "source": "du …\\results + …\\vector", "note": "37,455 파일" } },
  "by_tenant": { "lx": { "value": 0.27, "note": "results/lx + 평면 산출물(results/*.* · vector/**) 합" },
                 "namwon": { "value": 0.0, "note": "tenants/namwon/ · results/namwon/ 없음 — 0" }, … } }
```

## 검증

`tests/e2e/f1c-contract.spec.mjs` — 폴러 단독 실행(`--stdout --once`)의 GpuSample·`/ops/storage` 형 · Redis 키 형식(`ops:gpu:{node}:{idx}` hash · `ops:gpu` stream · `node:{id}` TTL ≤ 30 · `ops:storage` hash).

## F2-C(2026-09-27) — v1.1-18 · 28

- **0.5 s 표본 스트림**: `nvidia-smi --query-gpu=index,utilization.gpu,power.draw,temperature.gpu -lms 500` 한 프로세스를 띄워 두고 GPU 별 링버퍼. 2 s 마다 내는 GpuSample 에
  `util_ma5`(최근 5표본 = 2.5 s 이동평균 · `samples[]` 원표본을 봉투 안에) · `power_w`(5표본 평균) · `power_w_now` · `util_pct`(순간 · 화면은 쓰지 않음) · `caution`(VRAM ≥ 76% 또는 이동평균 ≥ 80% [목표]) · `fault`(VRAM ≥ 95% · 온도 ≥ 85°C [목표]) · `caution_why[]`.
  WDDM 순간값 0↔100 깜빡임 제거. 폴러가 죽으면 Windows Job Object(KILL_ON_JOB_CLOSE)가 nvidia-smi 도 끝낸다(고아 0).
- **nvidia-smi 경로**: `--nvsmi` → `LX_NVSMI` → DriverStore 안 **응답하는(-L 성공)** 최신 → 기본 → PATH. 고른 이유가 `nvsmi.why`.
- **memory.used 이상**: 597.16 WDDM 에서 (a) 음수 언더플로 (b) **두 장이 같은 값**(2026-09-27 02:15 · 43,256 / 43,256 — 실제 GPU0 16,281 · GPU1 43,275) → PDH `GPU Adapter Memory` 로 대체 + `note` 에 원값·이유.
- **외부 점유 실측 표시**: 예시값 문구 없음. PDH 프로세스별 + **미귀속 잔차** `unattributed_mib`(basis estimate · 어댑터 − Σ프로세스 − 워커 = WSL/vLLM 몫 추정).
- **LLM 띠**: `external[]` 에 `{name:'vLLM · gemma-4-12b-it', mem_mib:null, llm:{backend, model, role, endpoint, tps, prompt_tps, reqs_active, reqs_waiting, kv_cache_pct, gen_tokens_total, note:'WSL 프로세스 VRAM 미노출'}}` — 외부 점유(프로세스)와 합치지 않는다.
- **전력 예산**: `power_budget{max_hot(pools.yaml), leases[](Redis power:hot:*), leases_n, hot_now(이동평균 ≥ 50%)}` → 화면 칩 `고부하 GPU n/1 · 임대 n/1`.
- 게이트웨이 봉투 검사(맨 숫자 금지)를 통과하도록 새 숫자는 전부 봉투 안(원표본은 `util_ma5.samples`).

---

# 운영 — 백업 · 재부팅 뒤 복귀 · 게이트웨이 여러 프로세스 (impl-46 · 오픈 전 필수 6-1 · 6-2 · 6-3 · 원칙 300)

## 매일 DB 백업(6-2)

| 무엇 | 어디 |
|---|---|
| 스크립트 | `server/ops/db_backup.py` — 컨테이너 `landxi-postgis` 안에서 `pg_dump -Fc` → 표준 출력으로 받아 E: 에 바로 쓴다(C: 임시 파일 0 · 비밀번호 안 씀) |
| 둘 곳 | `E:/Land-XI 플랫폼/02. 데이터/_backup/db/daily/landxi-YYYYMMDD-HHMM.dump`(+ `-globals.sql` 역할) · `weekly/landxi-YYYY-Www.dump`(하드링크) |
| 보관 | 매일 7개 · 매주 4개(그보다 오래된 것은 지움) |
| 시험 | 매번 `pg_restore -l`(목차를 끝까지 읽음 · 표 데이터 항목 > 0) · 일요일은 임시 DB `landxi_restore_check` 에 실제로 되살려 표 수를 맞춰 보고 지운다(`--restore-test`) |
| 예약 | `powershell -File server/ops/register-backup.ps1` → `LandXI-DB-Backup`(월~토 03:30) · `LandXI-DB-Backup-RestoreTest`(일 03:30) · `-RunNow` 지금 한 번 |
| 기록 | `_backup/db/backup.log`(한 줄씩) · `status.json`(마지막 성공 · 실패 · 크기 · 걸린 시간 · 되살리기 시험) · `python server/ops/db_backup.py --status` |
| 경보 | 게이트웨이 경보(60초 · `ops.evaluate_alerts_once`)가 status.json 을 읽는다 — `db_backup_failed`(실패 · 고장) · `db_backup_older_30h`(30시간 넘게 성공 없음 · 주의). C: 여유 30GB 경보와 같은 길(ops_alerts → LX 관리자 대시보드 '경보 n' → 인프라 화면) |

되살리기(실제 사고 때): `docker exec -i landxi-postgis pg_restore -U postgres -d landxi --clean --if-exists < 덤프파일` — 먼저 게이트웨이 · 워커를 멈추고(`start-landxi.ps1 -Stop`), 역할이 없어졌으면 `-globals.sql` 을 `psql -U postgres` 로 먼저.

## 재부팅 · Docker 정지 뒤 저절로 복귀(6-3)

| 층 | 어떻게 돌아오나 |
|---|---|
| 컨테이너(landxi-postgis · landxi-redis · landxi-vllm-gemma · landxi-vllm-router) | 재시작 정책 `unless-stopped`(2026-10-21 `docker inspect` 확인 · compose 에도 같음) — Docker 엔진이 뜨면 저절로 |
| Docker Desktop | 로그온 때 자동 실행(HKCU Run `Docker Desktop`) |
| 게이트웨이 · 워커 · 정적 · 관제 · 감시 | 예약 작업 `LandXI-Server`(로그온 + 1분 30초 · `start-landxi.ps1`) — 이제 Docker 엔진이 답할 때까지 최대 5분 기다린 뒤 PostGIS · Redis 를 기다리고(90초) 마이그레이션 → 게이트웨이 → 워커 순서 |
| 게이트웨이가 죽으면 | 감시(`-Watch` · 15초 간격)가 연속 3회 실패 때 다시 띄운다 · 여러 프로세스 중 하나가 죽으면 uvicorn 감독이 그 프로세스만 다시 띄운다 |
| 바깥 주소 | 예약 작업 `LandXI-Public`(로그온 · 터널 + 공개 관문) |
| GPU 전력 상한 | 예약 작업 `LandXI-GPU-PowerLimit-200W`(부팅) |

**남은 빈틈(사용자 결정):** 모두 '로그온' 때 돈다 — PC 가 다시 켜진 뒤 누군가 로그인하기 전까지는 서비스가 멈춘다. 자동 로그온(Windows `netplwiz`) 또는 '로그온 여부와 관계없이 실행' 예약 작업으로 바꾸는 것은 계정 비밀번호가 필요해 사용자가 정한다. 재부팅 실측은 아직 없다(운영 중이라 일부러 끄지 않음).

## 게이트웨이 여러 프로세스(6-1)

- `start-landxi.ps1` 이 `uvicorn --workers N` 으로 띄운다. N = `server/.env` 의 `LX_GATEWAY_WORKERS`(없으면 4 · 1 이면 예전처럼 한 프로세스). Windows 에서도 `--workers` 동작 확인(감독 1 + 자식 N · 듣는 소켓 공유).
- 멈추기 · 다시 띄우기(`-Restart gateway` · 감시)는 :8700 을 듣는 프로세스에서 uvicorn 감독까지 올라가 그 **PID 묶음**만 `taskkill /T` 한다(이름으로 죽이지 않음 · 공개 관문 · cloudflared 는 건드리지 않음).
- 프로세스 안 상태 점검(`landxi_api/procs.py` 머리말):
  - 원래 공유되던 것 — 세션(sessions 표) · 로그인 실패 수 · 계정 잠금(Redis · DB) · SSE · 작업 진행(Redis 스트림) · 작업 대기열(Redis/DB) · 경보(ops_alerts).
  - 한 번만 돌아야 하는 것 → **대표 프로세스 하나만**(파일 잠금 `server/.gateway-primary.lock` · 죽으면 15초 안에 다른 프로세스가 이어받음): 기동 복구 sweep · 대장 매칭 잇기 · 경보 · 배포 흐름(`ops.alert_loop` → `deploys.flow_loop`) · XI 재학습 스케줄러(`core.loop`) · 기관 공간 60초 주기(`spaces`) · 읍면동 빈칸 채우기(`survey`).
  - 여러 프로세스가 동시에 하면 안 되는 것 → Redis 로: 장부 채우기(`ext_api.ledger_sync` · 1분에 한 번은 전체 통틀어) · 관리 작업 '한 번에 하나'와 상태(`survey` maintenance) · 기관 사용 현황 계산 결과(`ops` · 다른 프로세스가 수십 초 다시 세지 않게).
  - 쓰기 뒤 '바로 같은 값' 캐시 → 비운 프로세스가 Redis 채널 `lx:gw:inval` 로 알리고 다른 프로세스도 비운다: 요약(summary) · 공유 목록 · 지역 파생 · 저장 공간 · 기관 사용 현황 · 서비스 보이기 규칙 · XI맵 판 · 필지 색인.
  - 프로세스마다 따로여도 되는 것 — 읽기 캐시(시간 제한 · 크기 제한) · 지도 조각 보관 · 좌표 변환기.
- DB 연결 묶음: 프로세스마다 14(한 프로세스면 16 · 4 프로세스 × (14 + 시스템 4) = 72) — `LX_PG_POOL_MAX` 로 바꿈. PostgreSQL max_connections 100 안.
- 알려진 작은 차이: 배포 흐름 '준비' 2분 넘음 재시작 판단(`deploys.flow_tick`)은 대표 프로세스의 배경 일만 본다 — 다른 프로세스가 막 시작한 흐름은 수 초 안에 '분석 중'으로 넘어가므로 2분 문턱에 걸리지 않는다.

## Redis 키 훑기 · 오래된 작업 키(impl-46)

- 게이트웨이는 `worker:*:hb` · `worker:*:vram` · `lane:*` · `ops:gpu:*` 를 직접 훑지 않고 `deps.keys_like()`(10초 목록 · 모든 프로세스가 같이 씀)를 쓴다 — 키가 27만 개일 때 훑기 한 번이 0.6초였다.
- `server/ops/redis_expiry.py`(게이트웨이 대표 프로세스가 1시간마다 · `--dry` 로 세기만): 끝난 지 24시간 넘은 작업의 `job:{id}:*` 부속 키 1시간 뒤 만료 · `jobshards:{id}` · `events:{id}` 는 하루로 줄임. 진행 중 · 대기 · 최근 작업 · 본 해시 `job:{id}` 는 그대로.
- 감시(`-Watch`)는 여러 프로세스 + 소켓이 살아 있으면 8회 연속 실패 때만 다시 띄운다(바쁜 게이트웨이를 죽여 502 를 만들지 않게).
