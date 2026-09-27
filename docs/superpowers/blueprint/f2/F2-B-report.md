# F2-B 보고 — 실추론 백엔드 v2 (판정용 요약 · v1.2 판정 재작업 · 2026-09-27 05:45)

상세·원자료는 `f2/F2-B-result.md` §R(재작업) · §7(전력). 영상 `shots/f2/B/f2b.mp4`(**v1.2 재녹화 313 s 실시간** · 배속·편집 없음) · `f2b-60s.mp4`(같은 녹화 7구간 발췌 54.2 s) · 사본 `shots/f2/F2-B/` · v1.1 영상 `shots/f2/B/_v2/`.

## v1.2 — 1차 판정 불합격 4건

| # | 판정 | 결과 [실측] |
|---|---|---|
| 1 | V-World 깨진 JSON ERROR(INVALID_RANGE)가 7일 캐시 → 200·hit | 원문 바이트 `"status"\s*:\s*"ERROR"` 판정(게이트웨이·purge 같은 함수) → 판정 URL 2회 **502 · INVALID_RANGE · cached false · X-LX-Cache 없음** · 캐시 파일 즉시 삭제 · purge 재현 1 → **남은 ERROR 0/9** · 원문 바이트 픽스처 + pytest 3 · e2e 단언 |
| 2 | 게이트 v2 뒤 동시 >100 W 12표본 | **게이트 v3**: 폴백 삭제(대기만 · 로그/하트비트/`job.progress.power_gate` 사유) · 묶음 안 8칸마다 재확인 · NVML 0.1 s · 조용 20 s · 협조 임대 `bus.llm_power_request()`. 워커가 먼저 오른 겹침 **0**(전 실행) · 협조 실행 **0/293** · GPU1 고부하 24 s 동안 GPU0 **0 shard** · 남는 것 = 협조 안 한 외부 vLLM 램프업 때 GPU0 power.draw 평균 꼬리 ≤ 4표본(영상 9/604 · 그 표본 GPU0 이용률 **0 %**) → 계약 v1.1-18 문구 제안 + F2-E 협조 요청 |
| 3 | 없는 세트가 200 · total 0 | **404 not_found{set}**(정적 sets.yaml·detections / 게시 published_sets 어디에도 없으면) · 별칭 2,819 유지 · pytest |
| 4 | job.recovered 12 s 간격 2회 | `recovered_seq == resume_seq` + 진척 0 이면 건너뜀 → 영상에서 scheduler sweep 재개 176/378 → gateway sweep '이미 재개됨' → **job.recovered 1건** · counts 115 = 무중단 · e2e 단언 · **잠복 결함 동반 수정**(같은 seq 면 스케줄러가 `recovering` 을 안 풀어 작업이 멈추던 것 — 첫 재녹화에서 실측 발견) |
| 부수 | F2-A HUD '지금 GPU0 이용률' | 결과 문서 §10 에 'job.done 뒤 마지막 표본 hh:mm:ss' 요청 추가 |

- 테스트: **pytest 100 통과**(89 + 11) · **e2e f1b/f2b 17 통과**(재실행 05:41).
- 4곳 일치(v1.2 영상 무중단): HUD `GPU 초당 26.9칩 · 벽시계 3.0칩/s · 14.07 GPU·s · 125.9 s` = job.done = GET /jobs. 벽시계가 낮은 것은 다른 에픽 vLLM 버스트 3번 동안 게이트 v3 가 실제로 멈춘 대가(정직 표기) · 게이트 없는 e2e 재실행 28.7 · 20.7 · 13.19 · 18.3 s.
- Ollama·vLLM 은 끄거나 재시작하지 않았다(게이트 실측용 vLLM 생성 요청 8건만 보냄).

---

## v1.1(참고 · 1차 제출)

## 한 줄
숫자가 틀려 보이지 않고(창 짧음 · 이동평균 · 두 줄 = GET), 재부팅(워커 kill + 게이트웨이 재기동)해도 작업이 `복구 · 재개 181/378` 로 스스로 돌아와 **결과 115건이 무중단과 같다**. 기관은 자기 배포본 롤백을 **434 ms** 안에 받는다.

## 완료 기준 대조

| 기준 | 결과 [실측] |
|---|---|
| 후속 5 · 별칭 stats | `results/lx/namwon-greenhouse-2023-vh/stats?by=emd` 합 **2,819**(금지면 319 · 운봉읍 271) |
| 후속 5 · util 이동평균 + W | nvidia-smi `-lms 500` 5표본 이동평균 · 13표본 **0↔100 튐 0**(같은 창 원값은 51개 중 40개가 0/100) · power_w 55–176 W · shared · gpu_s_so_far |
| 후속 5 · 마지막 progress | 378/378 **정확히 1회**(`final:true`) |
| 후속 5 · V-World ERROR | 캐시 금지 · **502 upstream_error**(cached false) · 옛 ERROR 캐시 2 → 0 · **키 활성 200/hit**(Data API 연속지적 · WMTS jpeg) — F1-B §9 '503 키 대기' 서술 정정 |
| 후속 5 · 동시 3건 | 첫 shard **1.2–3.0 s**(3회 · ≤ 8 s) · 단독 1.1–2.2 s(≤ 5 s · GPU1 유휴 시) |
| chips_per_s 창 규칙 · 두 줄 | 창 ≥ 1 s & 완료 ≥ 8 전 `null · 창 짧음` · job.done `chips_per_gpu_s · chips_per_wall_s · elapsed · gpu_s` — **HUD = job.done = GET /jobs** (영상 25.8 · 13.2 · 14.63 · 28.6 / e2e 27.1 · 19.6 · 13.94 · 19.3) |
| 재부팅 복구 | lifespan + scheduler `recovery.sweep()` · PID 소멸로 즉시 판정 · 미완료 shard 만 재배정 · `job.recovered resumed` · ops `job.state reason recovered` · `/health.recovered_at_boot` — 실증 5회 모두 counts 115 = 무중단 |
| 고아 shard | 타임아웃 → `shard.failed{timeout, retry 1}` → 재배정 → 재실패 `job.failed` (강제 sleep 어댑터 pytest 2) |
| D0 | ext 라우터 훅(survey 7 · agent 10 routes mounted) · migrations 0001–0004 번호순 · plan 훅(**survey 39 shard → 20,872** = 정본) · `bus.tenant_event` · `/events/tenant` |
| cpu progress · index.month · eta · 측지 · index/parcels API | 전부 구현 · 으슥아타 **1,133 km²**(geodesic) · parcels 결합 **88.7 s → 1.0 s**(RLS 가 GIST 를 막던 것 우회 · 격리는 SQL 직접) |
| 전력 규칙 | GPU0 한 장 · 임대 1슬롯 · **임대 밖(vLLM) 부하 게이트 신설** — 검증 실행 동시 >100 W **0** · 두 장 합 최대 360 W(< 200 W × 2) · Ollama/vLLM 생존 · /ops/gpus 500 0 |
| 테스트 | **pytest 89 통과**(52 + 신규 37) · **e2e f1b/f2b 17 통과** |

## 정직 표기
- GPU1 ≤ 30 W 는 지키지 못했다 — 다른 에픽이 같은 시간에 vLLM 을 썼다(최대 203 W). 대신 워커가 물러나는 게이트를 넣었고, 그 대가로 그때의 첫 shard 는 대기만큼 늦다(10.8 s 실측).
- 판정 영상 무중단 실행의 벽시계가 13.2칩/s 로 낮은 것은 게이트 대기 6.8 s 때문(GPU 초당 25.8 은 정상).
- XI맵 무대 연출은 백엔드 완료보다 20–25 s 늦게 끝난다(F2-A 통보). kill 순간 `shard.done` 이벤트 1건이 빠질 수 있다(카운트는 정확).
- 판정 영상의 관제 롤백(dp-nw-farm-25)은 직후 원상 복원했다(감사 기록 남음).

## 세 사용자
- LX 직원: 가짜 12.0칩/s 가 사라졌고, 재부팅해도 작업이 돌아온다.
- 관리자: `-Status` · `/health` · 관제 마스트 · 전력 임대 · GPU1 W 가 한 줄로 맞물린다.
- 공무원: 자기 기관 이벤트만 1초 안에 · 결합 숫자(운봉읍 1,691 필지)는 'AI 추론 · 검수 전' 꼬리표와 함께.
