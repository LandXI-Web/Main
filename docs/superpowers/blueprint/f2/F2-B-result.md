# F2-B 결과 — 실추론 백엔드 v2: 1차 후속 5 · Hyper Performance 실측 필드 · 재부팅 자동 복구 · 기관 스트림 · 확장 훅 (v1.2 · 판정 재작업 반영)

- 작성 2026-09-27 04시 · **v1.2 개정 05:45(1차 판정 불합격 4건 재작업 · §R)** · 브랜치 plan1-foundation(커밋 없음 · 통합 단계에서) · 정본 계약 `F1-CONTRACT.md` v1.1 절 · 브리프 `f2/F2-B.md`
- 숫자 규칙: **[실측]** = 이 PC에서 잰 값(출처 파일·로그 명시) · **[추정]** = 계수 계산 · **[기록]** = 과거 문서 값
- 판정 영상(v1.2 재녹화 05:27–05:33): `shots/f2/B/f2b.mp4`(1440×900 · **313 s 실시간 · 배속·편집 없음** — 길어진 이유는 전력 게이트 v3 가 다른 에픽의 GPU1 vLLM 부하 동안 추론을 실제로 멈췄기 때문 · §R-2) + `f2b-60s.mp4`(같은 녹화의 7구간 발췌 54.2 s · 배속 없음 · '발췌 n/7' 표기) · 사본 `shots/f2/F2-B/` · v1.1 영상은 `shots/f2/B/_v2/`
- GPU 전력 규칙: 워커 = GPU0 한 장 · `power:hot` 임대 1슬롯 · Ollama/vLLM 은 건드리지 않음(§7 — 녹화 중 GPU1 vLLM 이 다른 에픽 부하로 최대 203 W 까지 올라가 **임대 밖 부하 게이트**를 새로 넣었다)

---

## §R 1차 판정 불합격 4건 재작업(v1.2 · 2026-09-27 04:45–05:45)

| # | 판정 증상 | 원인(실측) | 수정 | 검증 [실측] |
|---|---|---|---|---|
| R-1 | V-World 가 200 으로 준 **JSON 이 깨진** ERROR 본문(INVALID_RANGE · text 안 `단일검색="Y"`)이 7일 캐시 → `200 · X-LX-Cache: hit` · purge 는 `error_bodies 0` | `upstream_status_error()`·`_key_error()` 가 `json.loads` 실패 시 `None` 을 돌려줌 | `proxy._raw_status_error()` — JSON 파싱과 무관하게 **원문 바이트 `"status"\s*:\s*"ERROR"` 정규식 + `"code"` 추출**. 파싱 실패 경로·JSONP·기타 모두 이 판정으로 → 캐시 금지 · 502 `upstream_error{upstream_code, cached:false}`. `purge_vworld_error_cache.purge()` 가 게이트웨이와 **같은 함수**로 판정(키 오류 포함) | ① 판정 재현 요청 `GET …/proxy/vworld/data?service=data&request=GetFeature&data=LP_PA_CBND_BUBUN&size=1` 2회 → **둘 다 502 · INVALID_RANGE · cached false · X-LX-Cache 없음**, 캐시 파일 `54/5431ffc0….bin` 은 읽는 순간 삭제(04:52) ② 그 본문을 같은 경로에 되살려 purge → `error_bodies 1(INVALID_RANGE)` → 재실행 **남은 ERROR 0 / 9**(`shots/f2/B/purge-v3.txt`) ③ 원문 바이트 그대로 픽스처 `server/fixtures/upstream/vworld-invalid-range-broken-json.bin` + pytest 3(`test_broken_json_*`) ④ e2e f1b-public-guard 에 같은 요청 2회 단언 추가 |
| R-2 | 게이트 v2 뒤에도 `power-log.csv` GPU0·GPU1 동시 >100 W 12표본(04:09:18–21 · 04:11:04–10) | ① 30 s 폴백(batch 4 진행) ② 이미 읽어 간 16칸 묶음은 끝까지 돌림 ③ nvidia-smi 0.5 s 스트림은 램프업을 0.5–1 s 늦게 앎 | **게이트 v3**(`gpu_worker.gate_block/power_gate/hold_while_other_hot` · `pools.yaml power`): ① **폴백 삭제** — 다른 GPU 가 `other_gpu_hot_w 100 W`(판정 선과 같게) 이상이면 대기 시간과 무관하게 0 shard · 15 s 마다 로그·하트비트·`job.progress.power_gate{waiting, gpu, w, waited_s, quiet_left_s, reason}`(HUD 사유)만 갱신 ② **묶음 안 게이트** — 읽어 간 묶음도 `gate_chunk 8` 칸마다 재확인 · 멈춘 동안 임대 TTL·비행 기록 ts 갱신(고아 감시가 재배정 안 함) · 멈춘 초는 gpu_s 계량에서 뺌 ③ **NVML 0.1 s 순간 전력**(`workers/nvml_power.py` · ctypes · pynvml 없이) ④ **히스테리시스** `other_quiet_s 20` — 내려간 뒤 20 s 조용해야 재개(에이전트 LLM 호출은 몇 초 간격으로 몰려 옴) ⑤ **협조 임대** `bus.llm_power_request()/llm_power_done()` — LLM 호출자가 부르면 워커가 GPU1 이 오르기 **전에** 멈추고 호출자는 GPU0 평균 전력 < 100 W 를 확인(유휴면 0 s) | §7 표 — **워커가 먼저 오른 겹침 0**(모든 실행) · 협조 임대 실행 **동시 >100 W 0 / 293 표본** · 협조 안 한 외부 vLLM 램프업 때만 GPU0 전력 **평균값 꼬리 ≤ 4표본(≤ 2 s) · 그 표본 GPU0 이용률 0 %** · GPU1 고부하 23.5 s 동안 GPU0 진행 **0 shard**(v2 는 30 s 뒤 진행) |
| R-3 | 없는 세트(`/results/lx/namwon-greenhouse-2023-vh/stats` · 접두 `results/` 빠짐)가 **200 · total 0** | `resolve()` 가 모르는 이름을 정적 세트로 간주 | `results.static_set_exists()` — 정적 = `config/sets.yaml` 의 `results/*` 키 또는 detections 행 존재 · 게시 = `published_sets`/manifest. 어디에도 없으면 **404 `not_found{set, hint}`** | 판정 URL → **404 · not_found · set `lx/namwon-greenhouse-2023-vh`** · 별칭 정본 URL 200 · 2,819 유지 · pytest `test_unknown_set_404_not_silent_zero`(stats·features × 접두 누락·오타 4경우 + 시드 세트 200) |
| R-4 | 복구 작업 `job_01M3FJ0BD46Y98QGCEZWXSB784` 에 `job.recovered` 가 12 s 간격 2회(04:10:36 scheduler sweep · 04:10:48 gateway sweep · 둘 다 208/378) | 두 번째 sweep 이 "워커 없음"만 보고 다시 재개(resume_seq 2) | `recovery.already_resumed()` — `recovered_at` 있음 + `recovered_seq == resume_seq` + 완료 수 동일이면 **건너뜀**(로그 `이미 재개됨 … 중복 알림 건너뜀` · `stats.already`). 진척이 생긴 뒤 다시 죽으면 새 resume_seq 로 한 번 더(정상). `recovery:last` 는 앞선 sweep 기록을 덮지 않고 `/health.recovered_at_boot` 가 그것을 보임 + `gateway_sweep{resumed, already, skipped}` | 판정 재현(영상 05:30:45 scheduler sweep 재개 176/378 → 05:31:00 게이트웨이 sweep **이미 재개됨 · 중복 알림 없음**) → `job.recovered` **1건 · resume_seq [1]** → 완료 counts 115 = 무중단 · e2e f2b-recovery `job_recovered_count 1` 단언 · pytest `test_second_sweep_same_resume_seq_does_not_reannounce` |

**R-4 에서 드러난 잠복 결함(같이 고침)**: 스케줄러 자신의 기동 sweep 이 재개하면 `restore()` 가 같은 resume_seq 로 작업을 올려 두고, 뒤따른 resume 항목에서 `_resume()` 이 "이미 같은 seq" 로 **그냥 return → `recovering=1` 표시가 남아 pick() 이 그 작업을 영영 건너뛴다**(05:15 첫 재녹화에서 192/378 정지로 실측). 1차에선 중복 sweep 의 resume_seq 2 가 우연히 풀어 주고 있었다. → `_resume` 이 같은 seq 여도 `recovering` 을 풀고, `restore()` 도 올릴 때 푼다(pytest `test_scheduler_resume_same_seq_after_restore_clears_recovering`). 정지됐던 작업은 스케줄러 재기동으로 완료(counts 115 · job.recovered 1건).

## §0 D0 — 다른 에픽이 기다리던 것(첫 작업으로 끝냄)

| 무엇 | 위치 | 시그니처 · 규칙 |
|---|---|---|
| 확장 라우터 훅 | `server/landxi_api/main.py` | `for name in ("survey","agent"): importlib.import_module(f"landxi_api.{name}")` → `app.include_router(m.router, prefix="/api/v1")`. 모듈이 **없으면** 로그 1줄 후 건너뜀(`EXT_ROUTERS[name]="absent"`) · **있는데 깨졌으면** 예외 그대로 → 기동 실패로 드러남. `/health.ext_routers` 에 상태. 실측: F2-S `survey`(7 routes) · F2-E `agent`(10 routes) 둘 다 `mounted` |
| 마이그레이션 번호순 | `server/migrate.py`(신규) · `start-landxi.ps1` 1.5단계 · `setup.ps1` | `migrations/*.sql` 을 번호순 전부 적용 · `schema_migrations(name, sha256)` 로 바뀐 파일만(`--all` 전부) · 실패해도 나머지 적용 후 exit 1. 실측: `0001_init · 0002_survey(F2-S) · 0003_agent(F2-E) · 0004_f2b` 전부 적용 · failed [] |
| `scheduler.plan` kind 훅 | `server/workers/scheduler.py plan_job()` · `registry_scan.plan_hook()/normalize_plan()/adapter_for_kind()` | 어댑터 모듈에 `plan(job: dict) -> list[dict]`(모듈 함수 또는 Adapter 메서드)가 있으면 그것. `shard_id` 외 키는 `params` 로. kind `survey`/`join` 은 `adapter_for_kind()`(ADAPTER `kinds` 또는 `kind`, `pool:'cpu'` → device cpu) · 게이트웨이 견적도 같은 `plan_job()` 을 부른다 |
| cpu 어댑터 계약(F2-S 가 이미 이 모양으로 구현) | `server/workers/cpu_worker.py run_cpu_shards/finalize_cpu` | `ShardResult.metrics.classes{R1..}` → `shard.done.classes` + `job:{id}:counts` 누적 · `metrics.events=[{event, data}]` → 그대로 발행(`survey.finding`) · 모듈 `finalize(job)->{counts?, …}` 가 있으면 job.done 에 합침 |
| 기관 스트림 헬퍼 | `server/workers/bus.py` | **`bus.tenant_event(tenant_id, event, data) -> entry_id \| None`** — `events:tenant:{tenant}` XADD(MAXLEN 10,000 · MINID 24h) · `tenant_id`·`at` 자동. `bus.ops_event()` 는 `job.state · usage.delta · deploy.changed` 에 `tenant_id` 가 있으면 **자동 복사**(finding.state 는 F2-S 가 직접 헬퍼 호출 — 중복 0). 게이트웨이 async 판 `landxi_api.jobs.tenant_event()` |
| `GET /api/v1/events/tenant` | `server/landxi_api/events.py` | 아래 §4 |

## §1 1차 후속 5건(must_fix) — 전부 단언 + 실측

| # | 1차 결함 | 2차 구현 | 실측(2026-09-27) | 단언 |
|---|---|---|---|---|
| 1 | 이름 붙은 세트 `results/lx/namwon-greenhouse-2023-vh` features [] · stats 0 | `published_sets` 표(0004) + manifest `job_id` 대체 → `resolve()` 가 job_id 로 해석 · finalize 의 publish 가 표에 행 추가 · `migrate.py` 가 manifest 와 맞춤 | `stats?by=emd` **합 2,819** · 금지면 319 · 운봉읍 271 · 주생면 242 · 산내면 19(1차 대조표와 동일) · `features` total 2,819 · `by=cls` 합 2,819 | pytest `test_alias_*` 3 |
| 2 | `gpu[].util_pct` 1 s 순간값 0↔100 깜빡임 | `smi_sampler` = `nvidia-smi -lms 500` 스트림(DriverStore 최신 `nv_dispwi…/nvidia-smi.exe` · `LX_NVSMI` 우선) → GPU 별 링버퍼 5 → `util_pct`=5표본 이동평균 · `util_raw` · `samples` · `power_w` · `shared:true` · `gpu_s_so_far`(이 작업·그 GPU 워커 몫) · `mem_used_mib`(연결 어댑터면 PDH `phys_i` 값 + `mem_note`) | e2e `f2b-perf-fields` 13표본 `[20, 52, 39, 27.8, 20.8, 21.4, 24.6, 27.6, 40.2, 51.2, 56, 53.2, 51.6]` · 연속 차 최대 31.2 · **0↔100 튐 0** · power_w 54.9–176.4 W · 같은 창의 nvidia-smi 원값은 51표본 중 40개가 0 또는 100 | pytest `test_gpu_util_moving_average_no_flicker` · e2e |
| 3 | 마지막 progress 368/378 에서 멈춤 | 마지막 shard 뒤 `progress_lock` 우회 · `job:{id}:final_progress` NX 로 **정확히 1회** · `final:true` | 378/378 progress 1건(모든 실행) · J1 재녹음 1,369/1,369 | pytest `test_progress_rules` · e2e f1b-sse |
| 4 | V-World status ERROR 가 7일 캐시 | `upstream_status_error()` — 200 본문의 `status:"ERROR"`(키 오류 아님)면 **캐시 안 함 · 502 `upstream_error`** `{upstream_code, cached:false, upstream_body}` · **v1.2: JSON 이 깨진 본문도 원문 바이트 정규식으로(§R-1)** · 예전에 캐시된 ERROR 본문은 읽을 때 지우고 상류 재호출 · 정리 스크립트 `pipelines/purge_vworld_error_cache.py`(같은 판정 함수) | 정리 전 캐시 6건 중 ERROR 2건 → 1차 판정이 찾은 깨진-JSON 1건(INVALID_RANGE)까지 → **v1.2 재실측 9건 중 0건**(04:52 · `purge-v3.txt`) · 같은 잘못된 요청 2회 → 둘 다 502 · `X-LX-Cache` 없음 | pytest `test_status_error_not_cached_502` · `test_legacy_cached_error_body_is_dropped` · `test_broken_json_*` 3 · e2e f1b-public-guard(PARAM_REQUIRED · INVALID_RANGE) |
| 5 | 동시 3건 첫 shard 5.1 s | 스케줄러 **첫 묶음 선점**: 아직 시작 안 한 작업은 깊이와 상관없이 첫 16 shard 를 바로(`pools.yaml first_chunk`) · pick 순서 `(priority, 미시작 우선, deficit, cursor, created)` · finalize **작은 작업 레인** `finalize:cpu:small`(≤16 shard · 별도 스레드) | **동시 3건 첫 shard.done [1,235 · 1,932 · 2,667] ms** · [1,427 · 2,891 · 2,162] · [1,522 · 3,015 · 2,259](e2e 3회) — 전부 ≤ 8 s · 단독 1.07–2.23 s(f1b-sse 1,069·1,149·1,196 ms · pytest 2.23 s) ≤ 5 s | e2e `f1b-quote-submit` 동시 3건 · pytest `test_first_shard_single_le_5s` |

- 정직 표기(5번): **단독 ≤ 5 s 는 GPU1 이 유휴일 때**다. §7 전력 게이트가 GPU1(vLLM) 고부하 중에는 새 묶음을 미루므로, 그때 첫 shard 는 게이트 대기만큼 늦다 — 03:47:37 실측 GPU1 196.9 W → 8.8 s 대기 → 첫 shard 10.8 s. 계약 문구 제안은 §10.

## §2 Hyper Performance — `job.done` 두 줄 · 4곳 일치

규칙(v1.1-5·6·7 · 순수 함수 `server/workers/perf.py` 를 워커와 pytest 가 같이 쓴다):
- 진행 중 `chips_per_s` = 최근 10 s 창의 shard 수 ÷ 창 — **창 ≥ 1 s 이고 완료 ≥ 8 일 때만** 값, 아니면 `value:null · note:'창 짧음'`(예전 n/0.5 = 12.0칩/s 인공값 제거).
- `job.done` += `chips_per_gpu_s` = shards_total ÷ gpu_s(**usage_events 합** · measured) · `chips_per_wall_s` = shards_total ÷ elapsed_s(첫 배정 → job.done · 전역 NMS 포함 · 스냅샷 제외) · `gpu_s` · `elapsed_env`(봉투) — `elapsed_s` 숫자는 호환 유지. `GET /jobs/{id}` 에 같은 세 봉투(`chips_per_gpu_s · chips_per_wall_s · elapsed_s`) · jobs 표 `perf jsonb`(0004)에 영속.

**4곳 일치 표 — 판정 영상의 무중단 실행 `job_01M3FG1JY631ZFHVKF2H03JYB6`(황등 378 shard · XI맵에서 직접 프레임→견적→실행)** [실측]

| 값 | XI맵 HUD(F2-A · `.xi-own1/2`) | `job.done` SSE | `GET /jobs/{id}` | 관제(F2-C 큐 행 = 같은 GET 필드) | nvidia-smi 0.5 s(터미널 패널 · `power-log.csv`) |
|---|---|---|---|---|---|
| GPU 초당 칩 | 25.8 | 25.8 | 25.8 | 25.8(같은 필드) | — |
| 벽시계 칩/s | 13.2 | 13.2 | 13.2 | 13.2 | — |
| 이 작업 GPU·s | 14.63 | 14.63 | 14.63 | 14.63 | — |
| 경과 s | 28.6 | 28.6 | 28.6 | 28.6 | — |
| GPU0 전력 W(작업 창 평균) | 161 W(마지막 표본) | — | — | 폴러 이동평균 | progress 표본 평균 125.8 W ↔ nvidia-smi 51표본 평균 122.1 W |
| GPU0 이용률 | 42.8 %(이동평균 · 공유) | — | — | 이동평균 | progress 이동평균 평균 37.4 % ↔ nvidia-smi 원값 평균 29.5 %(원값 51표본 중 40개가 0 또는 100 — 그래서 이동평균) |

- 이 실행은 벽시계가 느리다(13.2칩/s): 실행 중 GPU1 이 다른 에픽 vLLM 부하로 올라가 전력 게이트가 두 번 기다렸다(03:36:10 · 03:36:27 · 합 6.8 s · 워커 로그). GPU 초당 칩(25.8)은 게이트와 무관한 모델+창 읽기 처리량.
- GPU1 유휴 때의 같은 AOI: `job_01M3FCDA8MPEGB83MHG340V92N` GPU 초당 27.8 · 벽시계 19.3 · 13.6 GPU·s · 19.6 s / e2e `f2b-perf-fields` 27.1 · 19.6 · 13.94 · 19.3 — **HUD 두 줄 문자열 `GPU 초당 27.1칩 · 벽시계 19.6칩/s` · `이 작업 13.94 GPU·s · 19.3 s` = job.done = GET** (e2e 단언).
- 원자료 `shots/f2/B/_raw/agreement.json`(progress 14표본 · nvidia-smi 창 · GET · job.done).
- **v1.2 재녹화 실행(05:27 · 게이트 v3)** `job_01M3FPED31F06NX48KGDWPBZZM`: XI맵 HUD `GPU 초당 26.9칩 · 벽시계 3.0칩/s` · `이 작업 14.07 GPU·s · 125.9 s` = job.done(26.9 · 3.0 · 14.07 · 125.9) = `GET /jobs`(같음 · `agreement-v3.txt`) · final progress 378/378 1회. 벽시계 3.0 은 **게이트 v3 가 다른 에픽의 GPU1 vLLM 버스트 3번 동안 실제로 멈춘 결과**(워커 로그 대기 3구간 42.2 · 64.6 · 24.6 s — 05:28:40 · 05:30:02 · 05:30:31 해제) — GPU 초당 26.9 는 그대로라 '느려진 것은 전력 규칙 대기'임이 두 줄에서 갈린다. progress 19건 중 5건이 `power_gate.waiting` 사유를 실었다. 게이트 대기 중 이동평균 이용률 0 은 GPU0 가 실제로 멈춘 값(깜빡임 아님 · 0↔100 튐 단언은 게이트 없는 e2e f2b-perf-fields 로 · v1.2 재실행 HUD `GPU 초당 28.7칩 · 벽시계 20.7칩/s · 13.19 GPU·s · 18.3 s`).

## §3 재부팅 복구(v1.1-15) · 고아 shard(v1.1-14)

**구현** `server/workers/recovery.py sweep(who)` — 게이트웨이 lifespan(`_boot_recovery`) · `scheduler.restore()` 가 같은 함수를 부른다(Redis `recovery:lock` NX 120 s · 멱등 · 결과 `recovery:last`).
1. 대상 = DB `jobs.state in (queued, running)` ∪ Redis 미러. **running** 인데 `workers[]` 가 전부 죽음(하트비트 TTL 30 s 초과 **또는 같은 호스트 PID 소멸** — psutil 로 즉시 판정 · TTL 을 기다리지 않음)
   → 영상·가중치·배포본 존재 확인(없으면 `failed(error:'recovery_failed')`) → 완료(`job:{id}:done`)·실패 shard 를 뺀 **미완료 shard 만** `jobshards:{job}` 로 다시 적고 · `shards:{pool}` 의 이 작업 항목(미배달 + PEL)과 `inflight` 를 정리 · `jobs:{pool}` 에 `resume` 항목 → 스케줄러가 커서 0 부터 다시 채움(`resume_seq` 로 이중 적용 방지 · `recovering` 플래그로 경합 차단).
2. 전 shard 는 끝났는데 finalize 전이면 finalize 레인에 재투입(`resumed · remaining 0`).
3. **queued** 인데 스트림에 없음(미배달 아님)·계획 없음 → `jobs:{pool}` 재투입(`requeued`).
4. 알림: 작업 스트림 `job.recovered{job_id, mode, shards_done, shards_total, remaining, reason, at}` · ops `job.state{…, reason:'recovered', mode, shards_done, shards_total}`(+ 기관 스트림 자동 복사) · `audit_log('job.recovered')` · Redis 미러 `recovered_*` → `GET /jobs/{id}.recovered{mode, shards_done, shards_total, reason, at, chip:'복구 · 재개 a/b'}` · `/health.recovered_at_boot{resumed, requeued, failed, by, at, jobs[]}`.

**실증(실프로세스 · GPU0 한 장)** — 황등 378 shard → 40% 지점 `Stop-Process gpu_worker` → `start-landxi.ps1 -Restart gateway`(게이트웨이 재기동 + 빠진 워커만 기동) → 완료:

| 실행 | kill 시점 progress | 복구 로그(게이트웨이) | 재배정 | 최종 counts | 무중단 기준 |
|---|---|---|---|---|---|
| 첫 실증 `job_01M3FCEVNBEKDY69D50BTFZ92P` 02:33 | 176 | resumed **224/378** | 154 · 스트림 정리 48 | vehicle **115** | 115 |
| e2e `f2b-recovery` 03:10 | 176 | resumed 192/378 | 186 | 115 | 115 |
| **판정 영상** `job_01M3FG2ZA6ZRFEDN7K72J17RMB` 03:37 | 160 | resumed **181/378** · 관제 칩 `복구 · 재개 181/378` | 197 · 정리 96 | 115 | 115 |
| e2e 최종 03:46 · 04:10(←job.recovered 2회 · §R-4) | 176 · — | resumed 192/378 · 208/378 | 186 · 170 | 115 · 115 | 115 |
| **v1.2 판정 영상** `job_01M3FPJGMY8K96XE12537Z6RMP` 05:30 · e2e 05:10 · 05:41 | 160 · 176 · 176 | scheduler resumed **176/378** + gateway 이미 재개 · 208 · 192 | 202 · 170 · 186 | 115 · 115 · 115 | 115 · **job.recovered 각 1건** |

- 게이트웨이 로그 원문(`shots/f2/B/recovery-log-latest.txt`): `[recovery] job_… resumed 192/378 (worker heartbeat 0 (a6000-0) · 재부팅/종료)` → `미완료 186 shard 재배정 · 스트림 정리 80 · resume_seq 1` → `sweep by gateway: resumed 1 · requeued 0 · failed 0 (점검 1 · 671 ms)` · 스케줄러 `resume job_… 미완료 186 shard`.
- **v1.2 멱등 실증(§R-4)**: 판정 재현 순서(워커 kill → scheduler 재기동 sweep → 게이트웨이 재기동 sweep) — 영상 `job_01M3FPJGMY8K96XE12537Z6RMP` kill 160 → scheduler `resumed 176/378 · resume_seq 1`(05:30:45) → gateway `이미 재개됨(resume_seq 1 · 176/378) — 중복 알림 건너뜀`(05:31:00) → `/health.recovered_at_boot{by scheduler · resumed 1 · gateway_sweep{already 1}}` → **job.recovered 1건** → 완료 counts 115 · e2e 최종(05:41) `job_recovered_count 1 · resume_seq [1]`. 1차 결과의 '04:10 208/378' 행은 이 중복(2회)이 있던 실행이다(counts 는 정확).
- 정직 표기: kill 순간 워커가 `sadd done` 과 `shard.done` 발행 사이에 있으면 그 칸의 `shard.done` 이벤트 1건이 빠질 수 있다(영상 작업: shard.done 377건 · shards_done 378 · counts 동일). 이벤트를 소비하는 화면은 `job.progress`/`job.done` 의 카운트를 정본으로 볼 것.
- 1차의 고아 `job_01M3EV13GGZHYXBNJ459CWFEK1`(kgz-agri NDVI 7/8)은 이미 수동 취소돼 있어 재현 대상에서 뺐다.

**고아 shard 감시(v1.1-14)** — 워커가 `shard.started` 때 `inflight:{pool}[job|shard] = {entry, attempt, ts, worker}`, 끝나면 지움. 스케줄러 10 s 마다: `max(120 s, 5×중앙값 ms)` 초과 → `shard.failed{error:'timeout', retry:1}` → 같은 항목 attempt 1 로 재배정 → 다시 초과면 `shard.failed{retry:2, final:true}` + `job.failed(shard_timeout)`. 늦게 끝난 옛 시도의 결과는 `inflight_owned()` 가 버린다(이중 집계 0). 재배정 뒤 아직 아무도 집지 않은 항목은 시간을 재지 않는다. 워커 `XAUTOCLAIM 30 s` 유지.
- 실증: 강제 sleep 어댑터 `adapters/adapter_test_sleep.py`(`test/sleep` · hidden · 개발 모드에서 `options.adapter` 로만 · `options.orphan_timeout_s` 개발 모드 전용) — ① 첫 시도 14 s · 한도 2 s → `shard.failed timeout retry 1` → cpu-1 이 재시도 완료 → job.done · 늦은 첫 시도 `결과 버림` 로그 ② 두 시도 모두 13 s → `retry 1 → retry 2 final` → `job.failed shard_timeout` (pytest `test_orphan` 2).

## §4 기관 스트림 `GET /api/v1/events/tenant?access_token=`(v1.1-16)

- realm tenant = 자기 기관만(`tenant=` 다른 값 → 403) · realm lx = 기본 `lx`, `?tenant=` 로 기관 지정(XI맵 직원 세션이 남원 배포본 계보 칩을 받는 경로) · 게스트 401 · 허용 오리진(4173·8702) 밖 403.
- 이벤트: `job.state`(자기 작업 · 복구 reason 포함) · `deploy.changed`(`tenant_id` · `snapshot_current` 추가) · `finding.state`(F2-S 헬퍼) · `usage.delta`(계량 시 자동). `?events=a,b` 거르기 · `id` = Redis entry id → `Last-Event-ID` 재개 · `?replay=24h|Nh|Nm` 최근 구간 먼저.
- 실측: 관리자 쓰기 → 남원 스트림 `deploy.changed` **20 · 25 · 29 ms**(e2e 3회) · 판정 영상에서 **관제 화면 롤백 클릭(F2-C 배포 제어 UI) 45.532 → 도착 45.966(434 ms · UI 왕복 포함)** · 직원 시연 상태 쓰기 → `finding.state` 39 ms · 광주전남 스트림 0건 · 24h 재생에 같은 id.
- 영상 롤백 뒤 `dp-nw-farm-25` 는 `shots/f2/B/_tools/restore_deploy.py` 로 원상 복원(ga · 2.1 · prev 2.0 · 스냅샷 2.1/2.0 · 승인 사유 'F2-B 영상 복원' 감사 기록). 영상의 finding 상태 쓰기는 **직원 시연 쓰기**(F2-S 규칙: basis demo · 24 h 뒤 자동 원복).

## §5 결과 · 결합 · 프록시

| API | 구현 | 실측 |
|---|---|---|
| v1.1-19 별칭 | §1-1 | 2,819 |
| v1.1-20 `GET /results/{set}/index?format=json\|csv\|geojson` | index_results 월별 · `ndvi_mean` · `p10/p50/p90`(ndvi 봉투) · `valid_px` 봉투 · `hist{bins[21], counts[20]}` · `ms` · CSV(UTF-8 BOM) · GeoJSON(AOI + months) · 기관 관문 | pytest(3칸 · p50 0.43 · hist[11]=40 · CSV 4행) |
| v1.1-21 `GET /results/{set}/parcels?cls=&jimok=&emd_cd=&min_conf=&min_hit_m2=1&limit=2000` | `ST_Intersects(detections, survey_parcels)` 한 번 결합(MATERIALIZED) · 겹침 면적 EPSG:5186 평면 · 탐지가 필지 안이면 교차 계산 생략 · `lx.count`(필지 · inferred) · `lx.by_emd[]` · `lx.ms` · `min_hit_m2`(기본 1 m² — 경계 슬리버 제외) · survey_parcels 없으면 404 `parcels_unavailable` | J2b 2,819 탐지 × 필지 332,084 → **16,988 필지 · 2.3 s** · 운봉읍 필터 1,691 필지 **1.0 s** · 지목 '전' 843 필지 0.21 s · 남원 기관 세션 자기 배포본 별칭 결합 OK · 광주전남 403 |
| 프록시 | §1-4 | — |

- **v1.1-21 성능 실측·수정**: 처음 구현(앱 역할 · RLS)은 운봉읍 필터 **88.7 s** · 전체는 60 s 타임아웃이었다. 원인 = `survey_parcels`·`detections` RLS 보안 장벽 때문에 비 leakproof `ST_Intersects` 가 GIST 조건으로 내려가지 못함 + geography 면적 · CTE 3회. → 결합만 **시스템 역할 풀(`deps.pool_sys()` · BYPASSRLS)** 로 읽고 **기관 격리는 SQL 에 직접**(`p.tenant_id = 세션 기관` · 탐지 쪽은 `resolve()` 가 허용한 job_id) + 평면 면적 + MATERIALIZED 1회 → 88.7 s → 1.0 s(×88).
- 결합 결과 해석(정직): J2b 탐지는 도메인 이식 모델 산출이라 폴리곤이 크다(중앙값 2,614 m² · 최대 14,158 m²) → 탐지 1개가 평균 6–8 필지와 겹친다. 1 m² 미만 슬리버 1,854쌍은 기본 제외.

**V-World 키 활성 실측 · F1-B-result §9 · F1-B-report §4 정정**(F1 문서는 소유 밖이라 여기 정정문을 둔다)
- 정정 전(1차): "키 권한 미반영 → 503 `vworld_key_pending`".
- **정정: 키 활성 [실측 2026-09-27]** — `GET /api/v1/proxy/vworld/data?service=data&request=GetFeature&data=LP_PA_CBND_BUBUN&geomFilter=POINT(127.5235 35.4607)&size=1` → **200 · `X-LX-Cache: miss` → 재요청 `hit`** · `response.status OK` · 연속지적 pnu `5219025032112290003`(03:13:25) · WMTS `…/wmts?layer=Satellite&z=15&x=27976&y=12879` → **200 image/jpeg 12,463 B · miss**(04:12:08) · domain `test.com`(서버 `.env`). 503 경로는 키가 비었거나 키 오류(EXPIRE/INVALID/권한)일 때만 남는다.
- F2-A(F1-A) 통보: XI맵 마스트 '장소 검색 · V-World 키 대기' 문구 해제 가능(프록시 200 실측).

## §6 cpu 작업 · 견적(v1.1-9·10·11·12·13·17·18)

- **모든 kind job.progress**: cpu 워커가 shard 마다(≤ 1회/s 합치기 · 마지막 1회 반드시) `{shards_done, shards_total, shards_failed, counts, chips_per_s(누적 shard ÷ 경과 · 창 짧음 규칙), gpu_s_so_far(0), elapsed_s, final, gpu:[], pool:'cpu'}`.
- **index.month** += `hist · p10 · p50 · p90 · valid_px · crop_px · ms · basis`(어댑터 metrics 그대로 · 라이브 = 리플레이).
- **kind survey(F2-S 어댑터 · plan 훅)** 실측: 견적 `shards 39 · pool cpu · eta_s 1.7 s [추정] = perf:shard_ms:survey/rules 78건 중앙값 44 ms × 39` → 제출 → 39 shard 5.6 s → `job.done counts R1 4,140 · R2 15,651 · R3 20 · R4 33 · R5 464 · R6 564 = 20,872`(정본과 동일) · `survey.finding` 발행.
- **eta_s(index · survey)** = `perf:shard_ms:{어댑터}` 최근 100건 중앙값 × shards(없으면 `index_results.metrics.ms`) · estimate 봉투.
- **측지 면적**: AOI 중심이 EPSG:5186 범위(124–132°E · 33–39°N) 밖이면 `pyproj.Geod(GRS80)` · `source:'geodesic(…)'` — 으슥아타 [74.70,42.75,75.20,43.00] = **1,133 km²**(±2 단언). 한국 안은 5186 그대로.
- **kind index imagery_id 생략** 허용(`options.source`) · 모르는 kind → 400 `bad_request` · 어댑터 없는 survey/join → 404 `registry_unavailable`.
- **power_budget**(견적 · a6000 풀): `{max_hot_gpus 1, leases[{slot, holder, ttl_s}], hot_now, hold_reason:'power_budget'|null, note:'고부하 GPU n/1', power_limit_w 200}`.
- **cpu 풀 굶김 수정(실측 발견)**: F2-D 원격 NDVI 8칸(칸당 25–56 s · 321 s)이 cpu-0 을 독점해 F2-S 실태조사 39칸(보통 5.6 s)이 **201–295 s** 기다렸다(04:00 cpu-0 로그). → ① `cpu-1`(shard 전용 · finalize 는 cpu-0) 추가 ② 중앙값 ≥ `slow_shard_ms`(5 s) 어댑터 작업은 **한 번에 1 shard** 만 배정 ③ cpu 스트림 깊이 8→4. 이후 pytest 전체 339 s → 114 s.

## §7 전력 규칙 준수 로그

- 워커: GPU0 한 장(`a6000-0`) · `power:hot:0` 임대 보유자는 기록 전 구간에서 `a6000-0` 또는 없음(`power-log.csv` · 0.5 s · 3,534 표본쌍 · 03:15:47–04:12). GPU1 에 워커를 띄운 적 없음 · 벤치·재추론(J2b ×4 등) 없음 · 영상 생성 API 없음.
- **GPU1 ≤ 30 W 유지는 F2-B 가 통제할 수 없었다**: GPU1 의 vLLM(:8000 gemma · :8001 router)을 다른 에픽(F2-E 에이전트 등)이 같은 시간에 썼다 — GPU1 최대 203 W. 그래서 **임대 밖 부하 게이트**를 넣었고, 1차 판정(동시 >100 W 12표본 · 폴백과 이미 읽은 묶음이 원인) 뒤 **게이트 v3** 로 바꿨다(§R-2): 폴백 없음 · 묶음 안 재확인 · NVML 0.1 s · 조용 20 s · 협조 임대. `pools.yaml power: other_gpu_hot_w 100 · other_wait_log_s 15 · gate_chunk 8 · other_quiet_s 20 · fast_poll_s 0.1`(`other_wait_max_s` 삭제).

| 구간 | GPU0 >100 W 표본 | **동시 >100 W 표본** | 두 장 합 최대 | 비고 |
|---|---|---|---|---|
| 게이트 전(03:15–03:22) | 82 | 6 | 281 W | 다른 에픽 vLLM 과 겹침 |
| 게이트 v1(이동평균만 · 03:22–03:47) | 531 | 56 | 360 W | 이동평균이 램프업을 2.5 s 늦게 앎 |
| 게이트 v2(최신 표본 포함 · 03:47 검증 실행) | 38 | 0 | — | 대신 첫 shard 10.8 s(8.8 s 대기) |
| 게이트 v2 · 1차 판정관 실측 04:09–04:11 | — | **12**(판정관 실행 3/41) | 369 W | 30 s 폴백(batch 4) + 이미 읽은 묶음 |

**v1.2 게이트 v3 실측**(nvidia-smi `-lms 500` power.draw · 판정 power-log 와 같은 방식 · `shots/f2/B/power-overlap-v3.json`):

| 실행 | 표본쌍 | GPU0 >100 W | GPU1 >100 W | **동시 >100 W** | 그중 GPU0 이용률 > 0 | 두 장 합 최대 | 무엇 |
|---|---|---|---|---|---|---|---|
| `gate-v3` 04:54–04:56(v3 첫판 · 조용 확인 없음) | 217 | — | — | 14(3구간) | 1 | 318 W | 재개 2 s·14 s 뒤 다시 온 LLM 호출과 겹침 → 히스테리시스 추가 근거 |
| `gate-v3b` 04:58–05:00(+조용 20 s) | 279 | 70 | 94 | 4(1구간 · 1.5 s) | 0 | 320 W | GPU0 추론 중 외부 vLLM 램프업 1번 — GPU0 는 즉시 멈췄으나(이용률 0) power.draw 1 s 평균값 꼬리 |
| **`gate-v3c` 05:02–05:04(+협조 임대)** | 293 | 77 | 95 | **0** | 0 | 280 W | LLM 호출 전 `bus.llm_power_request()` — 워커가 먼저 멈추고(2.16 s 식힘 대기) 그다음 GPU1 |
| **v1.2 판정 영상 05:27–05:33** | 604 | 83 | 129 | 9(3구간 · 각 ≤ 1.6 s) | **0** | 327 W | 다른 에픽의 협조 안 한 vLLM 버스트 3번이 GPU0 추론 중 시작 — 워커는 매번 멈췄다(9표본 모두 GPU0 이용률 0 %) |

- **정직 결론(계약 v1.1-18 문구 제안 · §10-6)**: 워커가 **먼저 오른** 겹침(다른 GPU 가 고부하인데 GPU0 가 시작)은 v3 에서 모든 실행 **0**. 남는 것은 **협조하지 않는 호출자(vLLM 직접 호출)가 GPU0 추론 중에 GPU1 을 올릴 때**의 GPU0 전력 **평균값 꼬리 ≤ 4표본(≤ 2 s)** 뿐이고, 그 표본들에서 GPU0 이용률은 0 %(이미 멈춤). F2-B 는 vLLM 호출 경로(`server/agent/**` F2-E · `server/ops/llm_poller.py` F2-C)를 소유하지 않아 이 꼬리를 혼자 0 으로 만들 수 없다 → **협조 임대 헬퍼를 F2-E 에 요청**(§10 통보) — 적용하면 `gate-v3c` 처럼 0.
- GPU1 고부하가 먼저일 때: `gate-v3c` B 구간 GPU1 24.4 s 고부하 동안 GPU0 진행 **0 shard**(v2 는 30 s 뒤 batch 4 로 진행했다) → vLLM 끝 + 조용 20 s 뒤 재개 → 완료 counts 115.
- 대가(정직): 다른 에픽이 vLLM 을 자주 쓰면 추론 벽시계가 크게 늘어난다(영상 무중단 실행 125.9 s · 벽시계 3.0칩/s · 게이트 대기 3구간 42 · 65 · 25 s). 사용자 절대 규칙이 성능보다 우선이며, HUD 는 `power_gate.reason` 으로 이유를 보일 수 있다.

- 합 최대(v1: 360 W · v3: 327 W)는 장당 상한 200 W × 2(= 400 W · 예약 작업 `LandXI-GPU-PowerLimit-200W`) 안. 셧다운 이력(600 W+) 조건에는 닿지 않았다. 게이트 실측(`_tools/gate_check.py`)은 황등 378 shard × 2 + vLLM 생성 2–3건씩 3회뿐(벤치·재추론 아님 · GPU0 워커 한 장).
- Ollama · vLLM 생존(`shots/f2/B/llm-alive.txt` 03:46:48): llama-server ×4 · `landxi-vllm-gemma` · `landxi-vllm-router` Up 7 h(healthy) · `:8000/v1/models gemma-4-12b-it` · `:8001 hyperclovax-seed-1.5b` · `:11434 qwen3:4b-instruct` — F2-B 는 어떤 LLM 프로세스도 멈추거나 재시작하지 않았다.
- `/ops/gpus` 500 재발 0: 폴러(F2-C)가 새 필드(`util_ma5 · util_ma10 · power_w_now · caution_why · unattributed_mib · llm`…)를 계속 더해도 게이트웨이가 맨 숫자를 봉투로 감싸고 결손은 `null + note` · 계약 테스트는 폴러 추가 키를 허용(`*`) — pytest `test_ops_gpus_v11_fields_no_500` 3회 + 계약 `ops_gpus`.

## §8 테스트 · 픽스처

- **v1.2: pytest `server/tests` 100 통과**(`shots/f2/B/pytest-run-v3.txt` · 126 s) = v1.1 89 + 판정 재작업 11(`test_proxy` 깨진 JSON 3 · `test_f2b_api` 없는 세트 404 1 · `test_recovery` 중복 알림 0 1 + 스케줄러 recovering 해제 1 · 신규 `test_power_gate` 5(폴백 없음 · NVML 순간값 · 조용 확인 · 묶음 안 멈춤+비행 ts · 협조 임대)). **e2e f1b/f2b 17 통과**(`e2e-run-v3.txt` · 2.3 min · f1b-public-guard INVALID_RANGE 단언 · f2b-recovery `job_recovered_count 1` 단언).
- v1.1: **pytest `server/tests` 89 통과**(`shots/f2/B/pytest-run.txt` · 114 s) = 기존 52 + 신규 37: `test_perf_fields` 6(창 규칙 · 이동평균 · 실추론 378 · 두 줄 = GET · 단독 첫 shard) · `test_recovery` 7(재개 · 살아 있는 워커 무시 · 모델 소실 failed · queued 재투입/미배달 유지 · finalize 재투입 · 잠금 멱등 · /health) · `test_orphan` 2 · `test_f2b_api` 16(별칭 3 · 결합 3 · 측지/한국 · plan 훅 3 · kind 400 · cpu progress+index.month+/index 3형식 · 타 기관 · /ops/gpus · 확장 훅 부재/존재/깨짐) · `test_tenant_stream` 4 · `test_proxy` +2.
- **e2e `tests/e2e/f1b-* f2b-*` 17 통과**(`LX_API=on` · `--workers=1` · 2.7 min · `shots/f2/B/e2e-run.txt`): f1b 개정(V-World 키 활성 200/hit · ERROR 502 캐시 없음 · **동시 3건** · SSE 창 짧음/마지막 1회/두 줄 = GET) + `f2b-recovery`(실프로세스 kill → `-Restart gateway` → resumed → counts 동일) · `f2b-perf-fields`(이동평균 튐 0 · XI맵 `?job=` HUD 두 줄 = GET = job.done) · `f2b-tenant-stream`(관문 · deploy.changed ≤ 1 s · 광주전남 0건 · 24h 재생).
- **픽스처**: `fixtures/contract/_make_fixtures.py` v1.1 — `job`(chips_per_gpu_s · chips_per_wall_s · elapsed_s · recovered) · `health`(recovered_at_boot) · `jobs_quote`(power_budget) · `ops_gpus`(폴러 추가 키) · 신규 `results_index` · `results_parcels` · `_events_v11.json`(progress · 창 짧음 · job.done · job.recovered · index.month · tenant 6건) · `_sse_and_errors.json`(jobs += job.recovered · survey.finding · ops += finding.state · tenant 4 · errors += upstream_error · registry_unavailable).
- **리플레이 재녹음**: `fixtures/replay/j1-hwangdeung.ndjson`(03:11 · 게이트웨이 SSE 실수신 · 1,369 shard · 2,787 이벤트 · 첫 shard 4.0 s · job.done 26.4 GPU 초당 · 15.6 벽시계 · 51.84 GPU·s · 87.5 s · 386건 — 새 필드 전부 포함) · 신규 `f2b-recovery.ndjson`(복구 실증 작업 790 이벤트 · `--timing at` = data.at 간격 보존 · 22.0 s 에 job.recovered).
- **v1.2 픽스처**: `_events_v11.json` += `job.progress.power_gate` · `job.progress(전력 대기)` 예시(05:29 실측) · `job.recovered.resume_seq` · `health.recovered_at_boot.gateway_sweep` · 신규 `fixtures/upstream/vworld-invalid-range-broken-json.bin`(상류 원문 바이트).
- **목 :8701**: `/events/tenant`(`_events_v11.json` tenant 6건 3 s 순환 · basis demo) · `/results/{set}/index|parcels` 픽스처 · `job.recovered` 는 f2b-recovery 녹음.

## §9 계약 v1.1 번호별 구현표

| 번호 | 내용 | 상태 | 근거 |
|---|---|---|---|
| 5 | chips_per_s 창 ≥ 1 s & done ≥ 8 · '창 짧음' | ✓ | `workers/perf.py` · pytest · e2e |
| 6 | job.done 두 줄 + GET /jobs | ✓ | §2 표 |
| 7 | gpu[] util 5표본 이동평균 · power_w · shared · gpu_s_so_far | ✓ | §1-2 |
| 8 | 마지막 progress 1회 | ✓ | §1-3 |
| 9 | 모든 kind job.progress | ✓ | cpu_progress · pytest |
| 10 | index.month hist/p10/p50/p90/valid_px/ms | ✓ | pytest(test/sleep 어댑터 metrics) · F2-D 실작업 로그 |
| 11 | eta_s(index · survey) 중앙값 | ✓ | survey 1.7 s [추정] |
| 12 | 한국 밖 측지 면적 | ✓ | 1,133 km² |
| 13 | index imagery_id 생략 | ✓ | pytest |
| 14 | 고아 shard 타임아웃 → retry 1 → failed | ✓ | §3 |
| 15 | 재부팅 복구 · job.recovered · /health | ✓ | §3 |
| 16 | 기관 스트림 | ✓ | §4 |
| 17 | 작은 작업 우선 레인 · 첫 묶음 선점 | ✓ | §1-5 |
| 18 | power_budget · nvidia-smi 경로 · 언더플로 PDH | ✓(견적 필드 + 워커 게이트 **v3 · 폴백 없음 · 협조 임대** — 남는 겹침 조건은 §7 · §10-6) · 언더플로 PDH 는 워커 진행 이벤트 쪽(연결 어댑터 PDH phys_i) · 관제 쪽 PDH 는 F2-C 폴러 | §6 · §7 |
| 19 | 이름 붙은 세트 별칭 | ✓ | §1-1 |
| 20 | /results/{set}/index | ✓ | §5 |
| 21 | /results/{set}/parcels | ✓ | §5 |
| 28 | /ops/gpus v1.1 통과 · 결손 null | ✓ | §7 |
| 29 | `?job=` 응답 필드 유지(GET /jobs 가 관제·XI맵 딥링크의 정본) | ✓ | recovered · 두 줄 포함 |

## §10 계약 변경 요청(Fable) · 다른 에픽 통보

계약 변경 요청(`절 · 현재 · 제안 · 이유`):
1. §5.1 job.done · `elapsed_s` 숫자 · **`elapsed_env` 봉투 추가**(숫자는 호환 유지) · HUD 가 봉투 꼬리표를 붙일 수 있게.
2. §4.4 Job · 없음 · **`chips_per_gpu_s · chips_per_wall_s · elapsed_s`(봉투) · `recovered{mode, shards_done, shards_total, reason, at, chip}`** · 관제·XI맵 딥링크의 정본.
3. §5.1 job.progress · `gpu[{index, util_pct, mem_used_mib}]` · **`shards_failed · final · gpu_s_so_far`(작업 봉투) + gpu[] `util_raw · samples · power_w · mem_note · shared · worker · gpu_s_so_far · source`** · 이동평균의 근거를 화면에서 볼 수 있게.
4. v1.1-16 · `/events/tenant` · **lx realm `?tenant=` · `?replay=24h|Nh|Nm` · `?events=`** · XI맵 직원 세션이 남원 배포본 칩을 받는 경로 · 재생 범위 명시.
5. §3 /health · — · **`recovered_at_boot{resumed, requeued, failed, by, at, jobs[]}` · `boot_at` · `ext_routers`**.
6. v1.1-17·18 · '단독 ≤ 5 s' · 전력 규칙 · **v1.2 문구 제안**: '워커는 다른 GPU 전력(NVML 순간값·nvidia-smi 최신·5표본 이동평균 중 큰 값)이 100 W 이상이거나 내려간 지 20 s 가 안 됐으면 **진행하지 않는다(폴백 없음)** · 읽어 간 묶음도 8칸마다 멈춘다 · 대기 사유는 `job.progress.power_gate`. **남는 겹침 조건**: 협조 임대(`power:llm_request`)를 걸지 않은 호출자가 GPU0 추론 중에 GPU1 을 올리면 GPU0 power.draw(1 s 평균) 꼬리가 ≤ 4표본(≤ 2 s) 100 W 를 넘을 수 있다(그 표본 GPU0 이용률 0 % · 실측 v1.2 영상 9/604 · 협조 실행 0/293). 단독 ≤ 5 s 는 GPU1 유휴 + 조용 20 s 경과 조건.'
11. §5.1 job.progress · — · **`power_gate{waiting, gpu, w, limit_w, waited_s, where, quiet_left_s, reason}` · 비대기 시 `{waiting:false, waited_total_s}`** · HUD 가 '전력 규칙 대기' 를 숫자 옆에 보일 수 있게.
12. §5.1 job.recovered · — · **`resume_seq`** · §3 /health.recovered_at_boot · — · **`gateway_sweep{resumed, already, skipped}`**(앞선 sweep 이 이미 재개한 작업 수).
13. §10 오류 · — · **없는 결과 세트 404 `not_found{set, hint}`**(정적·게시 세트 어디에도 없을 때 · 200 total 0 금지).
7. v1.1-21 · — · **`min_hit_m2`(기본 1) · `lx.ms` · properties `hit_m2 · ratio · conf_mean · classes`**.
8. §10 오류 · — · **`registry_unavailable` 404 을 게이트웨이도 사용**(kind survey/join 어댑터 없음) · 모르는 kind 400 `bad_request`.
9. §7 어댑터 · — · **`plan(job)` · `metrics.classes` · `metrics.events[{event,data}]` · 모듈 `finalize(job)`** 를 어댑터 인터페이스로 승격(F2-S 가 이미 사용).
10. §5.3 Redis 키 · — · **`events:tenant:{tenant}` · `inflight:{pool}` · `recovery:lock|last` · `perf:shard_ms:{adapter}` · `finalize:cpu:small`** 추가.

통보:
- **F2-A(v1.2 추가)**: ④ **끝난 작업의 HUD '실측 · 지금 GPU0 이용률(공유) n % · W' 표기는 `job.done` 뒤 '마지막 표본 hh:mm:ss' 로 바꿔 주기를 요청**(영상 v1.2 두 줄 HUD 아래 `GPU0 이용률(공유) 12.4 % · 40 W` 가 완료 뒤에도 '지금' 처럼 남음 — 값은 마지막 job.progress 의 `gpu[0]` · 시각은 그 progress 의 `at`) ⑤ 대기 사유: `job.progress.power_gate.waiting` 이면 HUD 에 `전력 규칙 대기 · GPU1 202 W` 표기 권함(§10-11).
- **F2-A**: ① V-World 키 활성 → '장소 검색 · V-World 키 대기' 문구 해제 가능(§5) ② on 모드 XI맵 무대 연출이 백엔드 `job.done` 보다 **약 20–25 s 늦게** 끝난다(영상: 백엔드 03:36:36 완료 → HUD 두 줄 03:36:47 · 칸 도착 애니메이션 backlog) — `job.done` 을 받으면 HUD 두 줄을 먼저 올리는 것을 권함 ③ HUD 복구 칩은 `GET /jobs/{id}.recovered.chip` 문자열을 그대로 써도 된다.
- **F2-C**: 폴러 필드가 계속 늘어난다(`util_ma10` 등) — 게이트웨이는 통과시키지만 계약(v1.1-28)에 올려 달라. 관제 복구 칩은 영상에서 동작 확인(`복구 · 재개 181/378`).
- **F2-D**: NDVI shard 25–56 s 실측 → 스케줄러가 느린 작업을 한 번에 1 shard 로 배정한다(§6). `index.month` 새 필드 · `/results/{set}/index` 사용 가능.
- **F2-S**: plan 훅 · metrics.classes/events · finalize 훅 전부 연결 확인(39 shard → 20,872). survey_parcels RLS 가 공간 조인 GIST 를 막는 문제는 §5 대로 게이트웨이에서 우회(격리는 SQL 직접).
- **F2-E(v1.2 요청 · 전력 규칙)**: vLLM(:8000)·라우터(:8001)·Ollama 호출 직전에 `from workers.bus import llm_power_request, llm_power_done` → `llm_power_request('agent:<session>')`(GPU0 가 놀면 0 s · 추론 중이면 GPU0 평균 전력 < 100 W 까지 최대 6 s) → 호출 → `llm_power_done('agent:<session>')`. 스트리밍 긴 세션은 30 s 안에 다시 부르면 갱신. 이것이 적용되면 §7 의 남은 겹침(외부 램프업 꼬리)이 0 이 된다(`gate-v3c` 실측 0/293). `server/ops/llm_poller.py`(F2-C)는 측정 호출만이라 대상 아님.
- **F2-E**: 계량은 `workers.metering.meter()` 그대로 — `usage.delta` 는 ops_event 가 기관 스트림에도 자동 복사한다. vLLM 부하가 GPU0 추론과 겹치면 워커가 미룬다(§7) — 에이전트 대량 테스트는 추론 녹화와 시간을 나눠 달라.

## §11 세 사용자 자기 점검(숫자의 정직성)

- **LX 직원**: 화면의 '칩/s' 가 이제 거짓 숫자를 내지 않는다(8칸 전엔 '창 짧음'). 끝나면 두 줄 — GPU 가 실제로 일한 속도(GPU 초당)와 기다림까지 포함한 체감 속도(벽시계)가 갈라져, 전력 게이트로 느려진 날은 벽시계만 떨어지는 것이 보인다. 재부팅해도 작업이 '복구 · 재개 181/378' 로 스스로 돌아오고 결과 115건이 같다. — 남은 거슬림: XI맵 무대가 백엔드보다 20 s 늦게 끝난다(F2-A 통보).
- **관리자**: `start-landxi -Status` 한 줄에 `recovered_at_boot` · `/health` · 관제 마스트 '재부팅 복구 n건' · 전력 임대 보유자 · GPU1 W 가 같은 값으로 이어진다. GPU1 을 다른 팀이 쓰는 순간 추론이 스스로 물러나는 로그가 남는다. 이름 붙은 결과(2,819)도 API 로 대조된다.
- **공무원(기관)**: 자기 기관 스트림으로 배포본이 롤백되면 1 초 안에 안다(434 ms · UI 포함) · 다른 기관 이벤트는 0건. 비닐하우스 결과를 필지와 결합하면 '운봉읍 1,691 필지'가 1 초에 나온다 — 단 이 숫자는 AI 추론 · 검수 전이며, 큰 폴리곤이 여러 필지에 걸치는 도메인 이식 결과라는 꼬리표(`note`)가 함께 간다.

- **v1.2 자기 점검(판정 재작업 뒤)**: LX 직원 — 잘못 부른 세트는 이제 '0건'이 아니라 404 로 막혀 "남원 비닐하우스 0건" 같은 거짓 숫자가 보고서에 실리지 않는다. 관리자 — 재부팅 뒤 복구 알림이 한 번만 오고(`복구 · 재개 176/378`), GPU1 을 다른 팀이 쓰는 동안 추론이 **정말로 멈춰 있는** 것이 로그·HUD 사유·power-log 로 확인된다(대가: 벽시계 3.0칩/s — 숫자가 그 대가를 숨기지 않는다). 공무원 — 지도 검색이 V-World 오류를 받으면 캐시된 가짜 '성공'이 아니라 오류로 보여 다시 시도할 수 있다.

## §12 판정 영상 구성 — v1.2 재녹화(`f2b.mp4` 313 s · 아래 표) · v1.1(118 s · `_v2/`)은 그 아래 표

| 초(v1.2) | 장면 |
|---|---|
| 0–10 | `start-landxi.ps1 -Status` 전부 [OK] · `/health.recovered_at_boot` · ext 라우터 |
| 10–144 | XI맵 황등 378 → 실행 · 터미널 `power gate 대기(묶음 전) · GPU1 202 W … 폴백 진행 없음` / `식는 중(조용 20s 확인 · 남은 n s)` / `해제` — **실제로 멈췄다 재개** → job.done HUD 두 줄 `GPU 초당 26.9칩 · 벽시계 3.0칩/s · 14.07 GPU·s · 125.9 s` = GET |
| 148–292 | 새 378 → 160 에서 `Stop-Process gpu_worker` → `run-one-worker -Name scheduler`(sweep **resumed 176/378**) → `start-landxi -Restart gateway`(sweep **이미 재개됨 · 중복 알림 없음**) → `/health{by scheduler · gateway_sweep.already 1}` → 관제 칩 `복구 · 재개 176/378` → 완료 counts 115 = 무중단 · `job.recovered 1건 · resume_seq [1]` |
| 293–299 | 별칭 stats 2,819 · **접두 없는 세트 404** · **V-World INVALID_RANGE(JSON 깨짐) 2회 → 502 · cached false · X-LX-Cache 없음** · purge ERROR 0 · 키 활성 200 hit |
| 299–301 | 게이트 v3 설정 · 협조 임대 실측 동시 >100 W 0 · GPU1 고부하 18 s 동안 GPU0 0 shard |
| 301–313 | 기관 스트림 → 관제 롤백 클릭 → `deploy.changed` · 직원 시연 `finding.state`(롤백은 `restore_deploy.py` 로 원상 복원) |

- v1.2 정지 캡처·스트립: `f2b-0*.png` · `f2b-strip-{run,done,kill,recovered,tenant}-100ms.png` · `f2b-timeline.json` · `power-overlap-v3.json` · `agreement-v3.txt` · 원 v1.1 산출물 `shots/f2/B/_v2/`.

### v1.1 영상(118 s · 왼쪽 480 px 터미널 `_tools/termfeed2.py` 실명령·실로그·nvidia-smi 0.5 s + 오른쪽 관제 :8702 / XI맵 :4173 · GPU0 한 장)

| 초 | 장면 |
|---|---|
| 0–8 | `start-landxi.ps1 -Status` 전부 [OK](cpu-0 · cpu-1 포함) · `/health.recovered_at_boot` · ext 라우터 survey·agent · 오른쪽 관제 인프라 |
| 8–52 | XI맵(직원) 황등 1.36cm 프레임 → 견적(0.053 km² · 378 · 11.8 GPU·s [추정]) → 실행 · 터미널 `shard.done r0xxc0yy 35ms` · nvidia-smi 0.5 s · `power gate 대기 · GPU1 121 W` → job.done `GPU 초당 25.8칩 · 벽시계 13.2칩/s · 14.63 GPU·s · 28.6 s` → `GET /jobs` 같은 값 · HUD 두 줄 |
| 52–100 | 새 378 → 관제 `?job=` 행 → 160/378 에서 `Stop-Process gpu_worker` → `start-landxi -Restart gateway` → `[recovery] … resumed 181/378 (worker heartbeat 0)` → 관제 칩 `복구 · 재개 181/378` → 완료 · counts `{"vehicle":115}` = 무중단 → 동일(±0) |
| 100–106 | 별칭 stats(금지면 319 … total 2,819) · V-World ERROR 2회 → 502 · cached false · X-LX-Cache 없음 · 정리 스크립트 ERROR 0 · 키 활성 200 hit |
| 106–118 | 기관 스트림 curl → 관제 배포 제어 UI 롤백 클릭 → `deploy.changed` 434 ms · 직원 시연 상태 쓰기 → `finding.state` 39 ms |

- 정지 캡처: `f2b-01…06*.png`(관제 · XI맵 견적/진행/두 줄 · 복구 칩 · 롤백 · 터미널 기관 스트림) · 100 ms 스트립 `f2b-strip-{run,done,kill,recovered,tenant}-100ms.png` · 타임라인 `f2b-timeline.json` · 전력 `power-log.csv` · 녹화 도구 `_tools/{termfeed2.py,term.html,record.mjs,compose.py,cut.py,restore_deploy.py}`.
- 영상이 60 s 가 아닌 118 s 인 이유: 실시간(배속·편집 없음)이고, 전력 게이트 대기(GPU1 을 다른 에픽이 사용)와 게이트웨이 재기동(16 s)을 자르지 않았다. 60 s 판정용은 같은 녹화에서 구간만 발췌한 `f2b-60s.mp4`(51.6 s · 배속 없음).

## §13 소유 · 남은 것

- 수정한 파일: `server/landxi_api/{main,jobs,events,results,proxy,ops,deps,deploys,envelope}.py` · `server/workers/{bus,scheduler,gpu_worker,cpu_worker,registry_scan}.py` + 신규 `workers/{recovery,perf}.py` · `server/adapters/adapter_test_sleep.py`(신규 · 숨김) · `server/migrate.py`(신규) · `server/migrations/0004_f2b.sql`(신규) · `server/pipelines/{seed_replay_record,purge_vworld_error_cache}.py` · `server/config/pools.yaml` · `server/{start-landxi,setup,run-workers,run-one-worker}.ps1` · `server/fixtures/**` · `server/mock/mock_api.py` · `server/tests/**` · `tests/e2e/f1b-{public-guard,quote-submit,sse}.spec.mjs` · `tests/e2e/f2b-{recovery,perf-fields,tenant-stream}.spec.mjs` · `shots/f2/B/**` · `shots/f2/F2-B/**`(과제 지정 사본). **소유 밖 수정 0**(`server/ops/** · server/survey/** · adapters/survey|global/** · landxi_api/survey.py|agent.py · 0002/0003 · landxi/**` 손대지 않음 — 0002/0003 은 `migrate.py` 가 **적용만** 했다). git 명령 0.
- v1.2 추가 수정 파일: `server/landxi_api/{proxy,results,main,envelope}.py` · `server/pipelines/purge_vworld_error_cache.py` · `server/workers/{gpu_worker,recovery,scheduler,bus}.py` + 신규 `workers/nvml_power.py` · `server/config/pools.yaml` · `server/fixtures/contract/{_make_fixtures.py,health.json,_events_v11.json …}` + 신규 `fixtures/upstream/` · `server/tests/{test_proxy,test_f2b_api,test_recovery}.py` + 신규 `test_power_gate.py` · `tests/e2e/{f1b-public-guard,f2b-recovery}.spec.mjs` · `shots/f2/B/_tools/{termfeed2.py,record.mjs,compose.py,gate_check.py(신규)}`. 소유 밖 수정 0 · git 명령은 `git status`(읽기)만.
- 남은 것: ① 협조 임대를 쓰지 않는 vLLM 호출자가 GPU0 추론 중에 GPU1 을 올리면 GPU0 power.draw 평균 꼬리 ≤ 4표본(이용률 0 %)이 남는다 — F2-E 협조 적용 대기(§10) ② kill 순간의 `shard.done` 이벤트 1건 누락 가능성(§3) ③ XI맵 무대 지연(F2-A) ④ 관제의 PDH 언더플로 대체는 F2-C 폴러 몫.
