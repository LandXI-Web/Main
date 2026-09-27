# F2-B — 실추론 백엔드 v2: 1차 후속 5 + Hyper Performance 실측 필드 + **재부팅 후 멈춘 작업 자동 복구** + 기관 스트림 + 확장 라우터 훅

- 모델 **Opus 5.5** · 난이도 XL · 기간 6–8일 [추정] · 판정 Fable 5.1(Craft · 영상 · 실측 대조)
- 읽을 것(순서): ① `F1-CONTRACT.md` v1.0 §4–§7 + **v1.1 절 전문** ② `f1/F1-B.md` · `f1/F1-B-result.md`(§12–13) ③ `f1/F1-A-result.md §5`(요청 6·11·12) · `f1/F1-D-result.md §4`(요청 1–8) · `f1/F1-C-result.md §4`(요청 1–6) ④ `server/workers/{scheduler,gpu_worker,cpu_worker,bus}.py` · `server/landxi_api/{jobs,results,proxy,events,main}.py` 현재 코드 ⑤ 저널 integrate result(재부팅 뒤 `job_01M3EV13GGZHYXBNJ459CWFEK1` 7/8 정지 · 수동 취소)
- 공통 규칙: **git 금지** · 소유 밖 수정 0 · 테스트 자기 것만(`server/tests/**` pytest · `tests/e2e/f1b- f2b- --workers=2`) · 4173·8702·vLLM·Ollama 끄지 말 것 · **GPU 전력 규칙: 워커는 GPU0 한 장 · `power:hot` 임대 ≤ 1 유지 · 벤치·재추론(J2b ×4 등) 금지** · 영상 생성 API 금지 · 행정 문서화 금지.
- 판정 5축 + 세 사용자. 이 에픽의 "우와"는 LX 직원·관리자 것이다: **숫자가 틀려 보이지 않고, 재부팅해도 작업이 스스로 돌아온다.**

## 목표

1차 백엔드는 합격(52 pytest · 12 e2e · J1 황등 378 shard 18.5s · J2b 85분)했지만 세 화면이 그 숫자를 보여 줄 때 **`12.0칩/s` 인공값 · GPU 이용률 0↔100 깜빡임 · 마지막 progress 누락 · 이름 붙은 세트 0건 · 재부팅 뒤 고아 작업**이 남았다. 2차는 (1) 후속 5건 + 각 화면이 요청한 계약 변경을 v1.1로 구현하고, (2) **게이트웨이·스케줄러 기동 시 running인데 워커 하트비트가 없는 작업을 자동 재개/실패 표기**하며, (3) 기관 화면·XI맵이 자기 작업·배포·실태조사 상태를 실시간으로 받을 **tenant 스트림**을 열고, (4) F2-S(실태조사)·F2-E(에이전트) 라우터가 main.py를 만지지 않고 붙을 **확장 훅**을 D0에 낸다.

## 근거 — 1차 must_fix 원문(저널 gate:F1-B · af0ef19f · 후속 5 · 전부 필수)

1. `server/landxi_api/results.py — 이름 붙은 게시 세트(results/lx/namwon-greenhouse-2023-vh · manifest 에 J2b 로 등록됨)를 /results/{set}/features · /stats?by=emd 로 부르면 features [] · total 0 · area_ha 0 이 돌아온다(detections 는 job_01M3EW9F… 아래에만 있고 PMTiles/GeoJSON 만 복사됨). 기대: publish_as 세트 → job_id 별칭 해석(또는 cpu_worker finalize 의 publish 단계에서 detections 를 set id 로도 조회 가능하게) 하여 lx 카탈로그가 노출하는 결과 레이어는 전부 features/stats 로 대조·통계가 나와야 한다(읍면동 대조표가 API 로 재현되는 것이 Hyper Solution 의 최소선).` → v1.1-19
2. `server/workers/gpu_worker.py progress() · smi_sampler() — job.progress.gpu[].util_pct 가 nvidia-smi 1 초 순간값이라 WDDM 에서 0↔100 으로 깜빡이고(내 실측 12 표본 중 0·1·4·16·18·29 가 절반), HUD 에 '150 W 로 추론 중인데 GPU0 이용률 0%' 가 뜬다. 기대: 최근 3–5 표본 이동평균(또는 nvidia-smi --query-gpu … -lms 200 스트림 평균) 을 util_pct 로, power_w(power.draw 는 120–163 W 로 안정) 를 gpu[] 에 같이 실어 보내고 F1-A 가 W 를 표시할 수 있게 계약 §5.1 gpu 항목에 power_w 추가 요청을 결과 문서 '계약 변경 요청' 절에 적을 것.` → v1.1-7
3. `server/workers/gpu_worker.py progress() — 마지막 shard 완료 시 progress_lock(900 ms) 때문에 최종 job.progress 가 안 나가 스트림의 마지막 progress 가 368/378 에서 멈춘다(녹화 HUD·내 실측 동일). 계약은 'HUD 는 job.progress 에서만 읽는다' 이므로 마지막 shard 처리 뒤에는 lock 을 우회해 shards_done == shards_total 인 job.progress 를 1회 반드시 발행할 것.` → v1.1-8
4. `server/landxi_api/proxy.py vworld() — V-World 가 status ERROR(PARAM_REQUIRED 등 키 오류가 아닌 오류) 를 200 으로 주면 그대로 7일 캐시된다(내가 잘못 보낸 ?data=LP_PA_CBND_BUBUN 요청이 cache/vworld 에 ERROR 본문으로 남아 hit). 기대: response.status == 'ERROR' 이면 캐시하지 않고 502 upstream_error 로 봉투 오류 반환. 또한 키가 살아났으므로(Data API 실필지·WMTS 200 실측) F1-B-result.md §9 와 F1-B-report.md §4 의 '503 vworld_key_pending' 서술을 '키 활성 실측(시각·요청·X-LX-Cache)' 로 갱신하고 F1-A 마스트 '장소 검색 · V-World 키 대기' 문구 해제를 F1-A 에 통보할 것.`
5. `docs/superpowers/blueprint/f1/F1-B-result.md §4 — 첫 shard.done ≤ 5 s 는 단독 실행에서만 성립(1.2–2.4 s). 같은 기관 P0 작업 3건 동시(playwright 5 워커) 에서는 5.1 s 로 목표를 넘겼다(내 e2e 재실행 first_shard_done_ms 5108). 기대: 동시 작업 시 첫 shard 지연 실측을 표에 추가하고, 스케줄러 fill 이 새 작업의 첫 chunk 를 우선 배정(작업 단위 공정 분배에서 '첫 묶음 선점') 하도록 조정하거나 목표를 '단독 ≤ 5 s · 동시 3건 ≤ 8 s [실측]' 로 정직하게 고칠 것.` → v1.1-17

다른 에픽 판정에서 이 에픽 몫으로 넘어온 것:
- F1-A must_fix 3(원문 F2-A.md 근거 3): `'12.0칩/s'는 gpu_worker 10초 창의 하한 0.5s 아티팩트(n/0.5)` → v1.1-5·6.
- F1-D must_fix 2: `server/workers/cpu_worker.py 241행 index.month 가 hist·p10/p50/p90·valid_px 를 뺀다 → on 모드 화면 슬롯에 분포 막대 0, CSV p10/p50/p90 빈칸. 판정 영상의 리플레이(하니스 기록)는 차 있다.` → v1.1-10. F1-D 요청 5(`cpu index 작업도 job.progress 발행`) → v1.1-9 · 요청 2(`워커 재시작 뒤 고아 shard … XAUTOCLAIM이나 shard 타임아웃 → shard.failed가 계약에 있어야`) → v1.1-14 · 요청 1·3·6·7·8 → v1.1-13·11·12·20.
- integrate result: `멈춰 있던 작업 하나를 취소했습니다. job_01M3EV13GGZHYXBNJ459CWFEK1(kgz-agri NDVI)이 9/26 재부팅 뒤 7/8에서 멈춘 채 관제 큐에 '실행 중'으로 남아 있어 … 재부팅 뒤 실행 중이던 작업을 되살리는 로직이 없습니다.` → v1.1-15.
- F1-C 요청 1·2·6(nvidia-smi 경로 · memory.used 언더플로 · `power_budget` claim 사유) → v1.1-18(게이트웨이 쪽 `/ops/gpus` 봉투 · 500 재발 0).
- AGENT-SPEC §3.4: `GET /results/{set}/parcels`(결합 API · 일반 API라 F1-B 소유) → v1.1-21.

## owned_files
`server/**` **단** 제외: `server/ops/**`(F2-C) · `server/adapters/global/**` · `server/pipelines/global/**`(F2-D) · `server/survey/**` · `server/adapters/survey/**` · `server/landxi_api/survey.py` · `server/migrations/0002_survey.sql`(F2-S) · `server/agent/**` · `server/landxi_api/agent.py` · `server/migrations/0003_agent.sql`(F2-E). 포함: `server/landxi_api/{main,jobs,results,proxy,events,parcels,ops,catalog,quota,deploys,tiles,auth,deps,envelope,config,registry,feedback}.py` · `server/workers/**` · `server/adapters/{base,adapter_yolo_*}.py` · `server/pipelines/*.py`(global 제외) · `server/migrations/0001_init.sql`(+ 신규 `0004_*.sql` 이후 번호 — 0002·0003은 예약) · `server/config/**` · `server/fixtures/**` · `server/tests/**` · `server/*.ps1` · `server/mock/**` · `tests/e2e/f1b-*.spec.mjs`(개정) · `tests/e2e/f2b-*.spec.mjs` · `shots/f2/B/**` · `blueprint/f2/F2-B-result.md`.
읽기만: `landxi/**` · `02. 데이터/survey/**`(F2-S가 적재 · F2-B는 `survey_parcels` 표를 **읽어** v1.1-21 결합에 쓴다 — 표 이름·열은 F2-S 브리프 §1과 같다).

## 단계별 할 일

### 0. D0(첫 날 오전) — 다른 에픽이 기다리는 것
- `server/landxi_api/main.py`: 확장 라우터 훅 — `for name in ("survey", "agent"): try: m = importlib.import_module(f"landxi_api.{name}"); app.include_router(m.router, prefix=API) except ModuleNotFoundError: log`(모듈이 없으면 조용히 · 있는데 import 오류면 기동 실패로 드러나게). `setup.ps1`/기동 스크립트가 `migrations/*.sql`을 번호순으로 전부 적용(멱등 `IF NOT EXISTS`).
- `scheduler.plan(job)`에 kind별 훅: 어댑터가 `plan(job) -> [shard]`를 정의하면 그것을 쓴다(`kind:'survey'|'join'`은 F2-S 어댑터가 읍면동 39개를 돌려준다). `jobs.quote/submit`이 `kind:'survey'`를 받아 `pool:'cpu'` · `shards_total = len(plan)` · `eta_s`(v1.1-11).
- `GET /api/v1/events/tenant?access_token=`(v1.1-16) — Redis `events:tenant:{tenant_id}` 스트림(MAXLEN 10,000 · 24h 재생 · `Last-Event-ID`) · 발행 헬퍼 `bus.tenant_event(tenant_id, event, data)` — `job.state`(jobs.py) · `deploy.changed`(deploys.py) · `usage.delta`(metering) · `finding.state`는 F2-S가 헬퍼로 발행. 결과 문서 D0 절에 헬퍼 시그니처를 먼저 적는다.

### 1. Hyper Performance 실측 필드(D1–D2)
- `gpu_worker.smi_sampler()`: nvidia-smi `--query-gpu=index,utilization.gpu,power.draw,memory.used -lms 500` 스트림(DriverStore 최신 경로 자동 · `LX_NVSMI` 우선 · 언더플로 값은 PDH 대체 + note) → 링버퍼 5 → `util_ma5` · `power_w`. `progress()`의 `gpu[] = {index, util_pct: util_ma5, power_w, mem_used_mib, shared:true, gpu_s_so_far}`.
- `chips_per_s`: 창 ≥ 1s **and** done ≥ 8일 때만 값 · 아니면 `null · note:'창 짧음'`. 마지막 shard 뒤 `progress_lock` 우회 1회 발행.
- `job.done`: `chips_per_gpu_s` · `chips_per_wall_s` · `elapsed_s` · `gpu_s`(usage_events 합) 봉투 4개. `GET /jobs/{id}`에도 같은 필드.
- `cpu_worker`: 모든 kind에서 shard마다 `job.progress`(≤ 1회/s 합치기) · `index.month`에 어댑터 metrics `hist/p10/p50/p90/valid_px/ms` 그대로 · finalize 작은 작업 우선 레인 · index shard 1개씩(기존) 유지.
- `quote`: `eta_s`(index/survey 최근 실측 중앙값) · 한국 밖 AOI 측지 면적(`source:'geodesic'` · 으슥아타 1,133 km² 재현) · `kind:'index'` imagery_id 생략 허용 · `power_budget` 보류 사유.
- 스케줄러 fill: 새 작업의 첫 chunk 선점(동시 3건 첫 shard ≤ 8 s 실측 · 단독 ≤ 5 s) — `f1b-quote-submit` e2e에 동시 3건 시나리오 추가.

### 2. 재부팅 복구(D3) — v1.1-14·15
- `landxi_api/main.py lifespan` 기동 직후 `recovery.sweep()`: DB+Redis `state in (queued,running)` 전수 → 각 job의 `workers[]` 하트비트 `worker:{id}:hb`(TTL 30s) 확인 · `shards:{pool}` XPENDING 오래된 항목 확인 → (a) 하트비트 0 · 미완료 shard 있음 → 완료 shard(`detections`·shard 파일) 유지하고 미완료만 `shards:{pool}`에 재투입 · `job.recovered{mode:'resumed', shards_done, shards_total, reason:'worker heartbeat 0 (reboot)'}` + ops `job.state{reason:'recovered'}` · HUD 칩 `복구 · 재개 a/b` (b) 영상·모델·배포본 없음 → `failed(error:'recovery_failed')` (c) `queued`인데 스트림에 없음 → 재투입 `requeued`. `/health.recovered_at_boot{resumed,requeued,failed}` · `audit_log('job.recovered')`.
- `scheduler.restore()`도 같은 sweep을 부른다(게이트웨이보다 먼저 뜰 수 있음 · 멱등 · Redis `recovery:lock`).
- shard 고아 감시(scheduler 루프 · 10s): `shard.started` 뒤 `max(120s, 5×중앙값 ms)` 초과 → `shard.failed{error:'timeout', retry:1}` → 1회 재배정 → 재실패 → job `failed`. 워커 `XAUTOCLAIM 30s`는 유지.
- 테스트(실제 재현 · GPU0만): 황등 378 shard 제출 → 40% 지점에서 `gpu_worker` 프로세스 kill → 게이트웨이 재기동(`start-landxi.ps1 -Restart gateway`) → `job.recovered resumed` → 나머지 shard 완료 → `snapshot.ready` · 최종 counts가 무중단 실행과 동일(±0) · 관제 큐 행 `복구` 칩. pytest `test_recovery.py`(Redis 가짜 하트비트) + e2e `f2b-recovery`(실프로세스).

### 3. 결과 · 결합 · 프록시(D4–D5)
- v1.1-19 별칭: `results/{tenant}/{publish_as}` → `sets` 표(또는 manifest) → job_id → detections. `GET /results/lx/namwon-greenhouse-2023-vh/stats?by=emd`가 대조표(금지면 319 · 운봉읍 271 · 합 2,819)와 일치 — pytest.
- v1.1-20 `GET /results/{set}/index?format=` · v1.1-21 `GET /results/{set}/parcels`(PostGIS `ST_Intersects(detections, survey_parcels)` · 2,000 한도 · `lx.count` inferred · `by_emd`) — F2-S 표가 없으면 `parcels_unavailable` 404 봉투.
- 프록시: V-World `status:'ERROR'` 캐시 금지 → 502 `upstream_error` · 캐시에 남은 ERROR 본문 제거 스크립트 · `X-LX-Cache` 헤더 유지 · 결과 문서에 키 활성 실측(시각 · 요청 · hit).
- `/ops/gpus` 500 재발 0(폴러 맨 숫자 봉투 감싸기 유지 · PDH note) · `GpuSample.gpus[i].util_ma5/power_w/caution/fault`(v1.1-28 · 폴러는 F2-C가 채우고 게이트웨이는 그대로 통과 + 결손 null).

### 4. 테스트 · 녹화(D6)
- pytest: 기존 52 + `test_perf_fields`(chips 창 규칙 · done 두 줄) · `test_recovery` · `test_alias_sets` · `test_tenant_stream` · `test_geodesic_area` · `test_index_month_hist` · `test_plan_hook`.
- e2e: `f1b-*` 개정 + `f2b-recovery` · `f2b-perf-fields`(HUD 두 줄 = `GET /jobs/{id}`) · `f2b-tenant-stream`(롤백 → XI맵 칩 ≤ 1s · F2-C 배포 화면과 함께 · 없으면 curl SSE 원문으로).
- `fixtures/replay/j1-hwangdeung.ndjson` **재녹음**(새 필드 포함) · `mock_api.py`에 v1.1 라우트 픽스처(`/events/tenant` · `/results/{set}/index` · `/results/{set}/parcels` · `job.recovered`) — F2-A·C·D·E의 off 모드가 여기서 읽는다.

## 완료 기준(acceptance)
1. 후속 5건 전부 pytest/e2e 단언 + 결과 문서 §2 실측(별칭 stats 합 2,819 · util_ma5 표본 12개 중 0↔100 튐 0 · 마지막 progress 378/378 · ERROR 캐시 0 · 동시 3건 첫 shard ≤ 8s).
2. `job.done` 두 줄(`chips_per_gpu_s` · `chips_per_wall_s`) + `gpu[].power_w/util_ma5/gpu_s_so_far` — 황등 378 shard 실행에서 HUD·관제·`GET /jobs/{id}`·nvidia-smi 패널 4곳 값 일치 표.
3. **재부팅 복구 실증**: 워커 kill → 게이트웨이 재기동 → `job.recovered resumed` → 완료 · counts 동일 · `/health.recovered_at_boot` · 관제 칩. 고아 shard 타임아웃 → `shard.failed` → 재배정 실증(강제 sleep 어댑터).
4. `kind:'survey'` 견적·제출·39 shard·SSE가 F2-S 어댑터로 돈다(F2-S 미도착 시 `plan` 훅 단위 테스트 + 가짜 어댑터).
5. tenant 스트림: `deploy.changed` · `job.state` · `finding.state` · `usage.delta` 24h 재생 · Origin/realm 관문(다른 기관 0건 e2e).
6. 확장 훅: `landxi_api/survey.py`·`agent.py` 없이 기동 OK · 있으면 라우트 등록(가짜 모듈로 pytest).
7. `index.month` hist/p10/p50/p90 · cpu `job.progress` · `eta_s` · 측지 면적 · `/results/{set}/index|parcels` — 각 pytest + F2-D/F2-E가 읽을 픽스처 갱신.
8. 전력 규칙 준수 로그(nvidia-smi 0.5s 표본 · GPU1 ≤ 30 W 유지 · `power:hot` 임대 1) · Ollama·vLLM 생존.
9. 결과 문서: 실측 표 · 계약 v1.1 대비 구현표(번호별 ✓/보류 사유) · F1-B-result §9 `503 vworld_key_pending` 서술 정정 · 세 사용자 자기 점검(LX 직원 · 관리자 · 공무원이 보는 숫자의 정직성).

## 판정용 동작 영상(≈ 60s · `shots/f2/B/f2b.mp4` · 왼쪽 480px 터미널(실로그 · nvidia-smi 0.5s · `_tools/termfeed.py`) + 오른쪽 XI맵/관제 · GPU0 한 장)
| 초 | 무엇 |
|---|---|
| 0–5 | `start-landxi.ps1 -Status` 전부 녹색 · `/health` `recovered_at_boot` |
| 5–22 | 황등 378 shard 제출 → 터미널 `shard.done r0xxc0yy 33ms` ↔ HUD `GPU0 이용률(공유) 87% · 151 W`(이동평균 · 튐 없음) · `칩/s — · 창 짧음` → 8칸 뒤 실값 → job.done `GPU 초당 20.4칩 · 벽시계 20.1칩/s · 18.6 GPU·s · 18.8 s`(예시 형식 · 값은 실측) · `GET /jobs/{id}` curl 나란히 |
| 22–40 | **복구**: 새 378 shard 제출 → 40%에서 `taskkill gpu_worker` → 터미널에서 게이트웨이 재기동 → 로그 `recovery: job_… resumed 152/378 (worker heartbeat 0)` → HUD `복구 · 재개 152/378` → 완료 · counts 동일 |
| 40–50 | `results/lx/namwon-greenhouse-2023-vh/stats?by=emd` curl → 대조표 값 · V-World ERROR 요청 → 502 봉투 · 캐시 없음 |
| 50–60 | tenant 스트림 curl → 관제(반화면) 롤백 → `deploy.changed` 도착 ≤ 1s · `finding.state`(F2-S와 함께 · 없으면 curl POST) |
+ 정지 캡처: nvidia-smi 패널 · pytest 요약 · e2e 요약 · 복구 로그 원문.

## 계약 · 요청
- 구현 = v1.1-5~21 · 28(통과) · 29(`?job=` 응답 필드 유지). 미구현 항목은 결과 문서에 번호와 사유.
- F2-C에서 받는다: 폴러 `ops:gpu` 필드(`util_ma5 power_w caution fault llm`) — 게이트웨이는 통과 + 결손 null.
- F2-S에서 받는다: `survey_parcels` 표(v1.1-21 결합) · 어댑터 `survey/rules` `plan()`.
- F2-E에서 받는다: `usage_events(dim='llm_tokens')` 계량 행 형식(기존 `metering.py` 헬퍼 재사용 · 수정 요청은 결과 문서로).
