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
