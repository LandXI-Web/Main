# F1-B 보고 — 실추론 백엔드(재개 세션 2026-09-26 21:04–)

> 상세 수치·표는 `F1-B-result.md`(§0 설치 스모크 ~ §13 남은 것). 이 문서는 변경 파일 · 실행 방법 · 실측 요약 · 폴백 · 남은 것.

## 0. 재개 배경

- 직전 세션은 J1 녹음·bench 직후 **PC 전원 차단(20:53경) → 20:55:41 재부팅**으로 끊겼다. 사용자가 본 "프롬프트가 켜졌다 꺼졌다"는 이 재부팅과 맞물린다. 재부팅 뒤 Docker·Ollama 는 자동 복귀, 게이트웨이·워커는 이 세션에서 다시 띄웠다.
- 전력 규칙을 지켰다: 무거운 GPU 작업은 **GPU0 한 장**(`power:hot` 임대 1슬롯). GPU1 은 이 에픽에서 한 번도 고부하로 쓰지 않았다(실측 18–19 W). Ollama llama-server 는 건드리지 않았다(지금 4개 생존).

## 1. 변경 파일

에픽 전체(소유 범위 `server/**` − ops · adapters/global · pipelines/global):
- 게이트웨이 `server/landxi_api/{main,config,deps,envelope,auth,catalog,tiles,proxy,jobs,events,results,registry,deploys,quota,ops,parcels,feedback}.py`
- 워커 `server/workers/{scheduler,gpu_worker,cpu_worker,vram,tiling,postprocess,metering,registry_scan,bus}.py` · 어댑터 `server/adapters/{base,adapter_yolo_seg,adapter_yolo_obb}.py`
- 파이프라인 `server/pipelines/{p8_parcels,p15_axis_cog,seed_replay_record,snapshot_pmtiles,j2b_vinyl,_common}.py` · `server/bench/throughput.py` · `server/mock/mock_api.py`
- 설정·시드 `server/config/{sets,pools,quotas,alerts,region_profiles,ladder}.yaml` · `server/migrations/0001_init.sql` · `server/seed/{seed_from_cards_js.py,accounts.dev.json,count_check.py}`
- 운영 `server/{docker-compose.phase0.yml,.env.example,requirements.txt,setup.ps1,run-gateway.ps1,run-workers.ps1,run-mock.ps1,run-one-worker.ps1}`
- 계약·리플레이 `server/fixtures/contract/*.json` · `server/fixtures/replay/j1-hwangdeung.ndjson(+summary)`
- 테스트 `server/tests/{conftest,test_contract,test_count_check,test_guards,test_proxy,test_sse_resume,test_vram}.py` · `server/tests/e2e-on.ps1` · `tests/e2e/f1b-{health,quote-submit,sse,public-guard,demo-metering}.spec.mjs`
- 데이터(LX_DATA_ROOT · 추가만) `results/lx/**` · `cog/axis_iksan_hwangdeung.*` · `cache/**` · `parcels/**`
- 산출 `shots/f1/B/**`(사본 `shots/f1/F1-B/`) · `docs/superpowers/blueprint/f1/F1-B-{result,report}.md`

이 세션에서 고친 곳(실측으로 드러난 결함):
| 파일 | 무엇 |
|---|---|
| `workers/cpu_worker.py` | finalize 전용 스레드(느린 index shard 가 스냅샷을 +280 s 막던 것) · index shard 1개씩 |
| `workers/vram.py` · `workers/gpu_worker.py` | WDDM 연결 어댑터(두 장 memory.used 같은 값) 감지 → 예산 22,507 MiB · 진행 이벤트 util/mem 은 nvidia-smi 원값 |
| `workers/scheduler.py` | 같은 기관·우선순위 안 작업 단위 공정 분배(대형 전역 뒤 소형 작업 기아 해소) |
| `workers/bus.py` | 스윔레인 블록 갱신 위치 · 계약 키(from · tenant_id) 채움 |
| `landxi_api/ops.py` | 폴러의 프로세스별 VRAM 맨 숫자 → 봉투(`/ops/gpus` 500 해소) |
| `config/ladder.yaml` | 황등 1.36cm 원본을 domestic 사다리에(lx 빌드만 · public/tenant 는 걸러짐) — F1-A 화면이 황등으로 내려갈 수 있게 |
| `mock/mock_api.py` | 한글 note 헤더 500 · `?speed=` 배속 |
| `setup.ps1` | 연결 어댑터 행 추가 |
| `pipelines/j2b_vinyl.py` | A/B 이미지 범례 색 정정 |
| `tests/test_sse_resume.py` | 완료 J1 조회 limit 20→200(다른 에픽 작업이 늘어 skip 되던 것) |
| 새 파일 | `run-one-worker.ps1` · `tests/e2e-on.ps1` · `tests/e2e/f1b-*.spec.mjs` 5 · `shots/f1/B/_tools/{termfeed.py,term.html,record.mjs,compose.py,bench_shot.mjs,j1_probe.py,explore.mjs}` |

## 2. 실행 방법

```powershell
# 1) 설치 스모크(멱등 · compose up · pip · ogr2ogr · nvidia-smi · countCheck)
powershell -File server/setup.ps1            # -SkipSeed 면 시드 건너뜀(실행 중 작업 보존)
# 2) 게이트웨이 :8700 · 워커(스케줄러 · cpu-0 · a6000-0) · 목 :8701
powershell -File server/run-gateway.ps1
powershell -File server/run-workers.ps1      # 기본 GPU0 한 장(전력 규칙)
powershell -File server/run-one-worker.ps1 -Name a6000-0   # 하나만 재시작
powershell -File server/run-mock.ps1
# 3) 검사
cd server; python -m pytest -q tests          # 52건
powershell -File server/tests/e2e-on.ps1 -SkipSetup   # LX_API=on playwright f1b-* 12건
# 4) J1 · 리플레이 녹음 · J2b
python server/pipelines/seed_replay_record.py --submit j1
python server/pipelines/j2b_vinyl.py ab ; python server/pipelines/j2b_vinyl.py global --upsample 2 ; python server/pipelines/j2b_vinyl.py table --job <id>
# 5) 판정 영상 재녹화: python shots/f1/B/_tools/termfeed.py(:8799) → node shots/f1/B/_tools/record.mjs → python shots/f1/B/_tools/compose.py
```
지금 떠 있는 것: 게이트웨이 :8700 · 워커 3 · 목 :8701(녹화용 termfeed :8799 는 껐다) · 정적 서버 :4173(건드리지 않음).

## 3. 실측 요약

| 항목 | 값 |
|---|---|
| J1 첫 shard.done | **1.19–2.04 s**(6회) — 목표 ≤5 s 충족 |
| J1 정본 AOI | 1,369 shard · 67.3 s · 탐지 386 · 48.3 GPU·s |
| J1 영상 AOI | 378 shard · 18.5 s · 탐지 115 · 견적 ETA 14.8 s[추정] |
| GT 대비(정본) | P 0.071(하한 · 비전수 라벨) · R 0.789 · yes 타일 P 0.923 / R 0.80 · mean IoU 0.792 · 자기 일치 아님 |
| bench | car_v2_obb 32.11 · aerial25 20.49 · Vinyl_house 26.56 chips/s(batch 16 · 외부 24,585 MiB 동시) |
| 워커 예산 | 22,507 MiB(외부 하한 24,585 · 연결 어댑터) |
| GPU0 부하 중 | 사용률 79–100 % · 150–173 W(상한 200 W) · 85 °C · GPU1 18–19 W |
| demo | detections 0 · usage_events lx-demo n행 |
| J2b 전역 | 81,574 shard · 85.4 분 · 3,933.8 GPU·s · 2,819 폴리곤(다동 2,154 · 단동 665) → results/lx/namwon-greenhouse-2023-vh · 대조 A02 1,674 · P4 728 |

## 4. 폴백 여부(정직 표기)

- 상대 에픽은 모두 살아 있어 **실연결**: F1-A 화면은 on 모드로 이 게이트웨이를 불렀다(시연 재생 아님 · 마스트·HUD `실측 · 지금`). F1-C 폴러 스트림(`ops:gpu`)을 실제 tail. F1-D 전역 어댑터(index/ndvi_pc 등)를 스캔으로 자동 등록해 실제로 돌렸다.
- 게이트웨이 내부 폴백 경로(쓰지 않았음 · 코드 유지): 폴러가 없으면 `/ops/gpus` 가 nvidia-smi 직접(note) · `/events/ops` 봉투 null.
- VRAM: nvidia-smi 장별 값이 연결 어댑터 합계라 **외부 점유를 하한값(24,585 MiB · 9/26 20:39 정상 실측)**으로 둔다 — 예산은 보수적.
- V-World Data: 키 권한 미반영 → 503 `vworld_key_pending`(필지는 P8 PMTiles 대체 소스).
- 영상 속 P/R 카드는 F1-A 화면에 GT 토글이 없어 **터미널(qa.json 봉투)** 로 보였다.

## 5. 남은 것

1. J2b 결과 검수(도메인 이식 · 줄 하우스 누락·논 경계 오탐 확인됨) — 채택 여부 결정.
2. F1-A 후속 제안(소유 밖): 가르기 오른쪽 칩이 작업 결과 대신 `남원 토지피복` 표기 · 헤드 기본값 남원 전역 · GT 층 토글.
3. J2b upsample ×4(검출 3.4배 · GPU·s 4배) 전역 여부 — 사용자 결정.
4. A100 노드 가입 후 실측 · V-World 키 반영 후 프록시 실호출.
5. 통합 단계 커밋(이 에픽은 커밋하지 않음).
