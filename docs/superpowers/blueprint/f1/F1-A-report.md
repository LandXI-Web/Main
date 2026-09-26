# F1-A 보고서: XI맵 운영판 프론트, 2차 판정 불합격 6건 반영 (2026-09-26)

## 판정 지적별 처리

| 지적 | 처리 | 확인(제출 영상 · 로그) |
|---|---|---|
| 하강 먹색 프레임(4.80 s 89.6 %) | ① `engine/lx-map.js`: 바탕을 전 줌 `#F2F4F6`으로 고정 ② `engine/ladder.js`: VIIRS는 z12.6→13.2에 나가고, V-World가 z ≥ 11 화면 타일을 다 그린 뒤(`isSourceLoaded` · `holdUnder`)에야 나간다 ③ **V-World 받침층**(같은 V-World · maxzoom 9 · HLS 바로 밑). VIIRS만 연장하면 새 줌 타일이 받히는 동안 어제 구름이 0.5 s 하얗게 보였기 때문이다 ④ VIIRS·HLS `raster-brightness-min 0.1`(깊은 바다 검정점) ⑤ 필지 크롭 칸 바탕 종이색 | `diag-descent.mjs f1a.webm`: 하강 최대 **0.05 %** · AOI **0.17 %** · 전체 **0.52 %** · 1 %를 넘은 프레임 0 (이전 제출본은 77.9 / 6.9 / 85.8 %) |
| HLS 검은 no-data 블록 | `engine/sources.js` `lxext://` 프로토콜: HLS 타일을 `createImageBitmap`으로 받아 RGB ≤ 6 픽셀은 투명으로, 90 % 넘게 검정이면 통째로 투명 | `strips/strip-descent-100ms.png`(첫 HLS 칩 −0.2 s부터 12장)에 검은 사각 0 · `__xi.EXT_LOG` |
| 극장이 연극이 아님 | `fx/job-theater.js` 표시 큐: 칸 사이 ≥ D.d120, 걷힘은 빔 ≥ D.d500 뒤. 이벤트 순서·개수는 그대로다. 줄이 24개를 넘으면 D.d40/D.d120으로 좁힌다. 제출 202 응답으로 `접수 · 큐 대기`를 즉시 띄우고, 이어 `job.queued`/`job.started` → `큐 대기 · 순번` / `워커 배정` | 영상 칸 켜짐 간격 122–132 ms, 칸마다 빔 0.81–0.82 s 뒤 걷힘(`marks.json job.done.shown`) · e2e `f1a-theater`에 간격 ≥ 100 ms · 빔 ≥ 400 ms 단언 추가(on/off 통과) |
| GPU 수치 귀속 | `ui/hud.js`: `GPU0 이용률(공유) n%`(nvidia-smi 카드 전체) + job.done 뒤 `이 작업 {gpu_s} GPU·s · {elapsed_s} s` | 영상 최종 줄 `… GPU0 이용률(공유) 29% · 12.0칩/s · 이 작업 0.56 GPU·s · 2.4 s`(`stills/hud-jobdone-on.png`). 결과 문서 §2 문장 정정 |
| 공개 탭 백지 1초 | `xi.js openCanvas`: `?cam=` 복원도 첫 idle까지 `#map` 불투명도 0, HUD `공개 결과 도착 중`, 받힌 뒤 500 페이드 · `data-canvas=open`. `record.mjs`는 이음매를 원본 밝기로 정한다. 녹화 시계가 mark 시계보다 0.3–0.4 s 이른 것이 이전 흰 프레임의 원인이었다 | 영상 40.2 s 이음매 앞뒤 12장에 흰 프레임 0 |
| 결과 문서 정직성 | §2의 '먹색 프레임 0' 문장을 제출 영상 실측표(이전본 · 이번본)로 바꿨다. `diag-descent.mjs`는 이제 제출 영상 파일을 입력으로 받고(20 fps · max(RGB) < 24 · 무채색 비율 병기), `record.mjs`가 녹화 끝에 이 도구를 자동으로 돌린다 | `shots/f1/A/logs/dark-frames.json` |

## 변경 파일 (모두 소유 범위 안)
- `landxi/xi/engine/lx-map.js`: 바탕색 고정
- `landxi/xi/engine/ladder.js`: VIIRS 곡선, `holdUnder`, V-World 받침층(`L.floor`), 검정점
- `landxi/xi/engine/sources.js`: `lxext` 프로토콜, `clearNoData`, `EXT_LOG`, prewarm의 lxext → https
- `landxi/xi/fx/job-theater.js`: 표시 큐(`gate`), `S.shown`, backlog, `onSubmitted`, jobFinal에 gpu_s·elapsed 전달, close 뒤 이벤트 무시
- `landxi/xi/ui/hud.js`: 공유 이용률 표기, 이 작업 몫 줄, `jobState(live)`
- `landxi/xi/xi.js`: `openCanvas`(복원 페이드 · 공개 HUD), 제출 즉시 HUD, 받침층 선적재, `EXT_LOG` 노출
- `landxi/xi/css/hud.css`(`.xi-own`), `landxi/xi/css/panels.css`(크롭 바탕)
- `tests/e2e/f1a-theater.spec.mjs`: 간격·빔 단언
- `shots/f1/A/tools/{record,diag-descent,probe-descent}.mjs`, 산출물 전부(사본 `shots/f1/F1-A/`)
- `docs/superpowers/blueprint/f1/F1-A-result.md`(§2 정정 · 계약 변경 요청 11·12 추가)
- 기존 `landxi/proto/*`, `landxi/shared/*`, 서버, 다른 에픽 파일은 수정하지 않았다. git 미사용. 4173 서버, 게이트웨이, Ollama는 건드리지 않았다.

## 실행 방법
- 화면: `http://localhost:4173/landxi/xi/index.html`(공개 `?public=1`)
- e2e: `npx playwright test tests/e2e/f1a- --reporter=line` · on: `LX_API=on DEV_PASSWORD=… npx playwright test tests/e2e/f1a-`
- 영상: `LX_API=on DEV_PASSWORD=… node shots/f1/A/tools/record.mjs` → 편집본, marks.json, 스트립 5장(arrive · descent · descent-vworld · aoi · theater), 먹색 측정
- 먹색 측정만: `node shots/f1/A/tools/diag-descent.mjs shots/f1/A/f1a.webm shots/f1/A/marks.json`
- 정지 화면: `node shots/f1/A/tools/stills.mjs`

## 실측 수치
- e2e off **25/25** · on **23 통과 + 2 건너뜀**(on 전용 조건)
- p95 16.8–16.9 ms(유휴 · AOI · 극장) · 캔버스 100 % · 14px 미만 0 · 앰버 CSS 1회 · 콘솔 오류 0(녹화 errors 0)
- 락온 384/384/385 ms · 도착 off 2.93 s / on 3.12 s · 정지 759/751/751/751 ms
- 먹색(제출 영상 · max(RGB) < 24): 하강 0.05 % · AOI 0.17 % · 전체 0.52 %, 1 %를 넘은 프레임 0/874
- 영상 43.7 s on: 칩 VIIRS → 3.37 HLS → 4.68 V-World → 5.40 25cm · 9.0 s 129,420 · 17.3 s 456 · 19.5 s 필지 카드(크롭 4) · 23.9 실행 → 25.6 워커 배정 → 칸 26.8–28.2 → 28.2 job.done(71 · 0.56 GPU·s · 2.4 s) → 28.8 snapshot · 29.9–35.9 스크럽 · 36.8–39.5 스와이프 · 40.2 공개(자체 영상 요청 0, 2,098 AI 추론 · 검수 전)

## 폴백 여부
- 판정 영상은 **on**이다(실제 GPU 추론 · SSE · 게이트웨이 스냅샷). 녹화 때 같은 a6000 풀에서 lx reinfer 81,574 shard 작업이 돌고 있었다. 그래서 GPU %는 '공유'로 표기한다.
- off 경로(픽스처 · 실파일 · 리플레이)는 e2e로 검증했고, 화면에 `시연 · …`으로 표기한다.

## 남은 것
1. 계약 변경 요청 12건(결과 문서 §5). 새로 넣은 11(shard 이벤트를 묶지 않거나 `at` ms 정밀도)과 12(progress에 작업별 gpu_s 누적)는 F1-B 처리가 필요하다.
2. 표시 큐 때문에 칸 도착 화면은 실제 완료보다 최대 약 1.4 s(6칸) 늦게 끝난다. 순서와 개수는 같다.
3. 깊은 바다 검정점 보정(`raster-brightness-min 0.1`)은 표시 보정이다. 원본 픽셀값은 바뀌지 않고, 결과 문서에 적었다.
4. V-World Data API 키 반영 뒤 검색 · 필지 on 경로를 다시 확인해야 한다.
5. 기존 stats/report 화면 `embed=1`(요청 9)은 담당 에픽이 처리해야 한다.
