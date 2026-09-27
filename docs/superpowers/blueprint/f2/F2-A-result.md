# F2-A 결과: XI맵 운영판 v2 — must_fix 6 + 실태조사 모드(S-1) + 브리지 `window.XI` + 에이전트 마운트 (2차 판정 대응판)

- 작성: 2026-09-27 · Opus 5.5 · 2차 판정 불합격 6건 반영(§8) · **3차 판정 불합격 4건 반영(§9)**
- 판정 영상 `shots/f2/A/f2a.mp4`(사본 `shots/f2/F2-A/`) · 1440×900 · **69.6 s**(3차 재녹화 · 아래 수치 중 2차 값은 §2 원표 그대로 두고 3차 실측은 §9) · **on 모드**(게이트웨이 :8700 · 실추론 GPU0 1작업 · 실제 대조 작업 kind:'survey' SSE · 실제 상태 쓰기 · 실제 관제 롤백 · 실제 .docx 다운로드). 녹화 중 게이트웨이 재기동 0(boot_at 04:52:10 전후 동일) · 콘솔 오류 0(A·B 두 화면). 원본 `raw/f2a-{A,B}.webm` · 편집 표 `marks.json(pieces · reedit)`.
- 편집: 부팅 · 세션 전환(직원 → 남원시 기관) · 관제 화면 이동 · 공개 탭 읽기 · **실추론 작업의 GPU 큐 대기 11.5 s(접수 → 첫 칸 도착 전, 화면 변화 없음)** · 보고서 초안 LLM 서술 대기를 잘랐다(초안 구간 5.5 s = 탭 열림 2.8 s + .docx 켜짐·다운로드 2.7 s). HUD 의 벽시계·경과 수치는 잘라 낸 시간을 포함한 실측 그대로다(제출 영상 작업 elapsed 1.2 s · §2 통합 정정). 배정·롤백 두 구간은 **반화면 합성**(왼 = XI맵 기관 화면 2/3 · 오른 = 관제 :8702 실화면 · 같은 시각).
- e2e(자기 spec 59개 · `--workers=2`): **off 58 통과 · 1 건너뜀(on 전용)** · **on 56 통과 · 3 건너뜀(off 전용 리플레이 가로채기)** — `shots/f2/A/logs/e2e-off-r3.txt` · `e2e-on-r5.txt`. on 은 `DEV_PASSWORD` 를 줘야 한다(f1a-motion-law 등은 기본값 없음 · 없으면 401).

## 0. 브리지 `window.XI` 표(D0 · F2-E · F2-C · F2-D · F2-R 가 읽는다)

파일 `landxi/xi/bridge.js`(ES 모듈 · `import { XI } from '/landxi/xi/bridge.js'` 또는 전역 `window.XI`). xi.js 가 부팅 끝에 구현을 꽂는다 — 그 전에 부르면 `XI.ready` 를 기다린다. **봉투(F1-CONTRACT §2) 없는 숫자는 `arrive` · `hud.set` 이 throw**(`EnvelopeError`).

| 함수 | 인자 | 반환 · 동작 |
|---|---|---|
| `XI.ready` | — | `Promise<XI>` — 지도·HUD·층이 선 뒤 resolve |
| `XI.session()` | — | `{realm, role:'guest'\|'staff'\|'sales'\|'agency', tenant_id, api:'on'\|'off', build, public, gates}` (동기 · 부팅 전 null) |
| `XI.view()` | — | `{center, zoom, pitch, bearing, bbox, on:[setId], frame, svc, mode:'read'\|'survey', epoch, api, role, scene, job}` (동기) |
| `XI.layerOn(setId, opts?)` | `setId` = 카탈로그 id(예 `namwon-landcover-2023`) · `'survey:findings'`(실태조사 의심 층) · `opts.filter`(MapLibre 식 · survey 면 `{rule:[..], priority:[..]}`) · `opts.features`(GeoJSON FC → 임시 층) · `opts.label` · `opts.count`(봉투) · `opts.kind` | `{id, layers}` — `features` 로 만든 층은 레이어 패널 '에이전트 질의 · 저장 안 됨' 절에 한 줄 |
| `XI.layerOff(setId)` | 위 id 또는 임시 층 id(`ag-n`) | — |
| `XI.arrive(o)` | `{count: Envelope(필수), bbox?, setId? \| features?, head?:{scene,title,unit}, note?:[html], camera?, label?, kind?}` | 7문법 #1 도착(카메라 → 스윕 1000 → 락온 380×3 → 124px 숫자 40/글자). 봉투 아니면 throw |
| `XI.flyTo(cam, ms=1600)` | `{bbox \| center, zoom?, pitch?, bearing?}` · ms ∈ 1000·1250·1600·2400(밖이면 1600) | 사다리 카메라(점프 0) |
| `XI.frame(geojson)` | Polygon | 프레임 → **견적 카드까지**(실행은 사람이 누른다 · 역할에 프레임이 없으면 throw) |
| `XI.parcelCard(x)` | `pnu`(19자리) 또는 `{lng, lat}` | 필지 카드 v2(EVIDENCE-PAIR). 의심 필지면 카메라 1600 z17 → 카드 |
| `XI.openDrawer(kind, opts)` | `'findings'`(의심 큐 · `{rule, priority, emd_cd, state}`) · `'report'`(`{tab:'draft'\|'std', emd_cd, rule, top, pnu}`) · `'stats'` | 서랍 열기 |
| `XI.closeDrawer()` | — | 보고서·통계·의심 큐 서랍 닫기 |
| `XI.setMode(m, opts?)` | `'read'` \| `'survey'` · `{animate}` | 모드 전환(실태조사: 필지 층 도착 → 대조 스윕 → 락온 → HUD) |
| `XI.hud.set(env, head?)` | 봉투 · `{scene, title, unit, sub, provLabel}` | HUD 큰 숫자·부제를 **봉투째 교체**(한 패널 한 출처) · 봉투 아니면 throw |
| `XI.hud.status(text)` | 문자열 | HUD 상태 줄 |
| `XI.toast(msg, basis?)` | `basis` = `'demo'` 등 | 토스트 한 줄(꼬리표) |
| `XI.slot(name)` | `'agent'` \| `'cmdk'` \| `'report-draft'` | 마운트 지점 요소 |
| `XI.provide(name, fn)` | `'report-draft'` → `fn(slotEl, {emd_cd, rule, top, pnu})` · true(또는 undefined)면 그 슬롯을 맡는다 · `false` 면 F2-A 규칙 초안으로 | 해제 함수 |
| `XI.provider(name)` · `XI.listeners(evt)` | — | 등록 여부 확인 |
| `XI.on(evt, fn)` | 아래 이벤트 | 해제 함수 |

| 이벤트 | detail |
|---|---|
| `view` | `XI.view()` 와 같은 모양(카메라가 멈출 때 · 180 ms 디바운스) |
| `job` | `{phase:'submit'\|'job.started'\|'job.done'\|'snapshot.ready'\|'restore'\|'state', job_id, kind, live}` — 대조 작업은 `kind:'survey'` |
| `mode` | `{mode:'read'\|'survey', survey?, deploy?}` |
| `parcel` | `{pnu, findings:[id]}` — 필지 카드 v2 가 열릴 때 |
| `finding` | `{id, pnu, state, saved, open?}` — 행 열기 · 상태 쓰기(배정·오탐) |
| `frame` | `{geom, quote:{area_km2, shards, allowed, via}, model, imagery}` |
| `drawer` | `{kind:'findings'\|'report', open, tab?, …opts}` |
| `cmdk` | `{view}` — ⌘K/Ctrl+K(구독자가 없으면 장소 검색에 포커스 + '에이전트 연결 없음' 토스트) |
| `deploy` | `{deploy_id, version, model, via, lag_ms}` — 계보 칩이 바뀔 때(tenant 스트림 `deploy.changed` 또는 폴링) |
| `ready` | `{version}` |

마운트 지점(`landxi/xi/index.html`): `<div id="agent-slot" data-slot="agent">`(우상 HUD 아래 · 폭 420 · `--agent-top` 은 HUD 바닥 + 8 로 자동) · `<div id="cmdk-slot">`(상단 중앙 480) · 보고서 서랍 `초안 작성` 탭 안 `<section id="report-draft-slot">`. 에이전트 마운트는 **서비스 워커와 분리**(2차): 모듈 존재 표 `landxi/xi/data/modules.json`(`node landxi/xi/data/build-modules.mjs` · 통합 단계에서 다시 굽는다)이 `present:true` 라고 할 때만 `import('../agent/panel.js').then(m => m.mount?.(window.XI))`. SW 가 이 창을 제어 중이면 표와 무관하게 import(파일이 없으면 `sw.js` 가 빈 모듈 · 404 0). `__xi.agent` = `mounted` · `missing`(SW 빈 모듈) · `absent`(표에 없음 · 요청 0) · `error` · `skipped`(게스트·공개만). SW 없는 창(첫 방문 · 시크릿 · 차단)에서도 콘솔 0 — 외부 타일(GIBS · V-World xdworld · EOX)은 전용 Worker fetch 방패(`engine/sources.js extFetch` · `lxw://` 프로토콜)가 받고 실패는 투명 + 계기 `외부 타일 결손 n · 투명 대체`.

URL 상태(새로고침 복원 · v1.1-29): `?mode=survey&survey=farmland&rule=R1&priority=A&emd=52190450&state=assigned&queue=1&finding=f_R1_…&pnu=…&job=job_…&deploy=dp-nw-farm-25` (+ F1 의 `cam on epoch swipe frame card model pick svc result panel drawer 3d`).


## 1. 완료 기준 대조

| # | 기준 | 결과 | 증거 |
|---|---|---|---|
| 1 | must_fix 6 = 0 | ⓪ **2차: 필지 카드 v2 ∩ HUD 124px 숫자 = 0** — `planCard()` 가 숫자(`#hud-big`+`#hud-unit`)·HUD 유리·마스트·검색·모드 스위치·층 패널·서랍/레일·스크러버·계기를 **getBoundingClientRect 로 재고**(숫자 좌우 24 · 위아래 8 여백) 가장 긴 빈 세로 칸에 둔다. 1280/1440/1920 × 판독·실태조사·서랍+카드 9경우 × 매 프레임 900 ms 교차 0(`f2a-mustfix ①-2`) ① 카드 자리 = CSS `translate` 속성 · 진입 애니메이션은 transform 만 → 첫 프레임부터 제자리(4px 아래 → 0) · 마스트·검색·모드 스위치·레일 교차 0(견적 · 필지 카드 v2 · 읍면동 카드) ② 가르기 칩 두 개 = 그립 좌/우 · 스크러버 위 한 줄(아래 152) · 1280/1440/1920 × 20/50/80 % 에서 HUD·계기·카드 교차 0 ③ 진행 중 `칩/s — · 창 짧음`(v1.1-5) → job.done 두 줄 `GPU 초당 6.8칩 · 벽시계 3.3칩/s` / `이 작업 0.59 GPU·s · 1.2 s`(= GET /jobs · §2 · 제출 영상 job_01M3FT14AF687CG7MVDPGX7MBX) ④ HLS = 하강 경로 3 카메라의 화면 커버리지 실측(2026-09-23: z5.7 19 % · z7.6 52 % · z9.1 98 %) → 최소 19 % < 70 % → 층 끔 + 칩 `HLS 30m · 궤도 밖 · 화면 19%` · V-World 받침 z6.5 · 글로브 칩 `어제 · 구름 81%`(VIIRS 2026-09-25 한국 상공 z4 · 밝기 평균 211) ⑤ HUD 한 패널 한 출처(작업 결과가 떠 있으면 스크럽이 HUD 불변 — 영상 `scrub.hud same:true` · AOI 변화 숫자일 때만 pair 봉투째 교체) ⑥ 락온 꼬리표 `칸 1/4 · 도착 14건 · 경작지 13 · 건물 1` … `칸 4/4` 네 개 모두(shard id 는 title) | `f2a-mustfix` 10 · `f1a-*` 개정 · 영상 0–8.7 s(하강) · 16–27 s(카드·견적·극장) · `strips/` |
| 2 | 브리지 · 슬롯 · import · URL | §0 표 · `#agent-slot` `#cmdk-slot` `#report-draft-slot` · F2-E `panel.js` 마운트(영상 · 보고서 초안 탭) · **SW 없이도 마운트**(모듈 존재 표) · 콘솔 0 · URL 복원 | `f2a-bridge` 4(SW 막음 케이스 추가: `agent = mounted` · 외부 404 두 건 → 결손 2 · 콘솔 0) · `f2a-deeplink` 3 |
| 3 | 실태조사 모드 | 기관 세션 기본 = 실태조사 · 업무 판 10행(farmland 만 · 나머지 `배포본 없음` 점선) · 규칙 6행 · 필지 층 도착(연속지적 332,084 · 기록 봉투) → **실제 `POST /jobs kind:'survey'` 39칸 SSE**(영상: 8.4 s · 4.6칸/s · CPU · GPU 0) → 락온 3(R1 A 90.5 아영면 아곡리 1053-12 · R4 A 83.8 운봉읍 화수리 1110 · R5 A 77.5 사매면 월평리 478-9) → HUD **의심 필지 20,852**(= F2-S 정본 findings-emd.json 합 · inferred). off = F2-S 실행 녹음 재생(recorded) → 없으면 39행 합성(demo). 이벤트 없이 진행 0(리플레이를 5칸에서 끊으면 5칸만 걷힘) | `f2s-sweep` 3 · `f2s-no-fabrication` 2 · 영상 32–44 s |
| 4 | 의심 큐 서랍 | 상태 칩 5 · 규칙 6 · 등급 3 · 읍면동 39(막대 · 서→동) · 정렬 3 · 검색 · 삼각 호버 · 서버 페이저 50 · CSV(BOM · 고정 문구 · 성명 열 0) · 빈 상태 `의심 0 · 대조 완료 hh:mm` · 숫자 = README(R1 4,140 · … · A 1,053 · R1·A **759**) | `f2s-queue` 3 |
| 5 | 필지 카드 v2 | EVIDENCE-PAIR 7행 × 2열 같은 높이 · 2023/2025 라디오 → 막대 500 재성장 + 그 필지 시점 스크러버(배경 2023 25cm → A03 2m · AOI 안이면 드론 4시점) · 왜 의심인가 줄 수 = findings 수(2규칙 필지 2줄) · skipped 줄 · 결손 점선 3종(건축물대장 · 소유구분 · 용도지역 미결합 19필지) · 이력 ▾ 750 · ◆▣●▲■▶ · 스크러버 커서 동기 | `f2s-parcel-card` 3 · 영상 49–59 s |
| 6 | 조치 표시 | 배정 → 서버 응답 뒤 칩(253 ms) · ■ 마커 · 관제 운영 현황 기관 막대 `배정` 반영(반화면) · 다른 탭 on 288 ms(tenant 스트림 finding.state) / off 5 ms(BroadcastChannel · `시연 · 저장 안 됨`) · 오탐 사유 필수 · 역방향 버튼 비활성 · 직원 쓰기는 서버가 demo 로 남기고 화면 `· 시연` | `f2s-actions` · 영상 59–68 s |
| 7 | 보고서 초안 › | F2-E `XI.provide('report-draft')` 가 초안 탭을 그린다(영상 68–83 s). F2-E 가 없으면 F2-A 규칙 초안: F2-S docx → 없으면 브라우저 조립 .docx(실데이터 · 고정 문구) + CSV — 죽은 버튼 0 | `report-draft.js` |
| 8 | Hyper Performance | §2 표 — HUD = `GET /jobs/{id}` | 영상 25.4 s |
| 9 | 계보 칩 실시간 | `dp-nw-farm-25 · v2.1 · namwon/cultivate_uncultivate/train`(GET /deploys + /registry/lineage) → 관제 롤백 클릭 뒤 **256 ms**(제출 영상 marks.json)에 `v2.0 · aerial25/best`(tenant 스트림 deploy.changed · 서버 at → 화면 116 ms) · 스트림이 없으면 10 s 폴링 + `폴링 10s` 표기 | 영상 84–88 s(반화면) |
| 10 | 가드 · 성능 · 법전 · **종이 면적** | public/게스트: 스위치 없음 · survey 모듈·데이터·API·tenant 스트림·agent 요청 0 · 브리지 거부 · 봉투 `AI 추론 · 검수 전` · p95 스윕 16.8 / 서랍+카드+이력 16.9 ms · 캔버스 100 % · 유리 14.2 % · **종이(서랍/레일 ∪ 카드) 33.0 % ≤ 35 %**(1차 55.2 %) · **지도 가시 52.8 %**(유리 ∪ 종이 밖 · 1440) · 큐 행 1280×800 **6줄** / 1440 7 / 1920 10 · 14px 미만 0 · motion-law 통과 · 소유 밖 수정 0 | `f2s-public-guard` 2 · `f2a-layout` 3 · `f1a-motion-law` |

## 2. 실측 수치(판정 영상의 그 작업)

> **통합 정정(F2-∑ · 2026-09-27)** — 이 표는 제출 영상 `f2a.mp4`(3차) 의 `marks.json`(`job.done2` · `survey.result` · `assign.*` · `rollback.lineage`)에서 다시 뽑았다. 이전 표는 재녹화 전 작업(`job_01M3FN03W94NYN6KKABQPRG2RA` · 7.0 · 0.3 · 0.57 GPU·s · 15.2 s · 33 % · 132 W · 대조 5.3 s · 7.4칸/s)이었다.

| 항목 | 화면(HUD · 제출 영상) | 게이트웨이 `GET /jobs/job_01M3FT14AF687CG7MVDPGX7MBX` |
|---|---|---|
| shard | 4/4 · shard 합 65 → 전역 NMS 후 54 · 꼬리표 칸 1/4 · 2/4 · 3/4 · 4/4 | shards_total 4 |
| GPU 초당 | 6.8칩 | chips_per_gpu_s 6.8 (4 ÷ 0.59) |
| 벽시계 | 3.3칩/s | chips_per_wall_s 3.3 (4 ÷ 1.2) |
| 이 작업 | 0.59 GPU·s · 1.2 s | gpu_s 0.59(usage_events) · elapsed_s 1.2 |
| 카드 이용률 | 영상: `GPU0 이용률(공유) 0% · 18 W`(job.done 뒤 순간값 — 판정 must_fix) → **통합에서 교체**: `작업 중 GPU0 최대 n% · w W · 표본 k · 마지막 hh:mm:ss`(job.started→done 창 안 progress.gpu 표본 · 프론트 집계 봉투) · 표본 0 이면 `이용률 · 표본 없음(작업 < 1 s)` | progress.gpu util_ma5 · power_w(카드 전체 · 공유) |
| 진행 중 처리량 | 칩/s — · 창 짧음 | chips_per_s null(창 ≥ 1 s · shard ≥ 8 미충족) |
| 대조 작업 | 39/39 · 의심 20,852필지 · 20,872건 · 3.2 s · 벽시계 12.2칸/s | kind survey · cpu · gpu_s 0 |
| 배정 → 상태 칩 / 관제 막대 | 253 ms / 355 ms(반화면) | POST /survey/findings/{id}/state → tenant 스트림 finding.state |
| 관제 롤백 → 계보 칩 | 256 ms(v2.1 → v2.0 · 실시간 · deploy.changed) | 서버 at 기준 932 ms(토스트) |
| .docx | 초안 `.docx` 다운로드 | F2-E `내보내기 .docx`(서버 파일 · Bearer) |

**티어 창(2차 판정 ③)** — 판정 창을 부팅 창에서 떼었다: 부팅 창(첫 60프레임) = '부팅 계측' 꼬리표로 기록만(판정 제외 · 계기에는 판정 전 `티어 · 부팅 계측 중`), 판정 = 첫 idle 뒤 60프레임 + 재판정 2회(2.4 s 간격 · 과반), 표기 = 최근 60프레임 p95(2.4 s 마다 갱신).

| 실행 | 부팅 창 p95 | 정상 창 1 / 재판정 1 / 재판정 2 | 판정 · 화면 표기 |
|---|---|---|---|
| 판정 영상 직원 세션(글로브 부팅) | (영상 재녹화 · marks `city.arrived.tier`) | 16.8 / 16.8 / 16.8 ms | T1 · `T1 · p95 16.8 ms 실측` — **오프닝 0–8 s 내내 16.8**(1차: T2 33.4) |
| 판정 영상 기관 세션(카메라 복원) | — | 16.8 / 16.8 / 16.8 ms | T1 |
| `tools/probe-tier.mjs` 글로브 부팅 | 16.9 ms | 16.8 / 16.8 / 16.8 ms | T1 |
| `tools/probe-tier.mjs` 카메라 복원 | 17.0 ms | 17.0 / 16.9 / 16.8 ms | T1 |
| 1차 판정 영상(참고) | 33.4 ms(글로브·GIBS 적재) | — | 이 값으로 세션 전체 T2 강등 → 이번 회차 제거 |
| 헤드리스 e2e(GPU 플래그 없음 · 2 워커) | — | 33.7 ms | T2(정직한 판정 · f1a 압출 spec 은 티어별로 단언) |

먹색(제출 영상 자체 · `tools/diag-descent.mjs` · 20 fps · max(RGB) < 24): 글로브→남원 하강 최대 **0.05 %** · 드론 AOI 하강 **0.15 %** · 두 구간 1 % 초과 프레임 0. 영상 전체 1 % 초과 218프레임은 반화면의 관제 화면(Ops 먹색 무대 · 의도) 두 구간이다. 하강 100 ms 스트립(`strip-descent`) 12칸: 구름 → V-World 로 바로 이어지고 HLS 조각 띠 0.
유리 면적(backdrop-filter · 8 px 칸 합집합 · 스윕+서랍(레일)+카드+이력 동시): **14.2 %**. 종이 시트: 1차 55.2 % → **33.0 %**(카드가 열리면 서랍이 120 레일로 접힘 · 카드 높이는 종이 예산 33 % 로 자른다).

## 3. 세 사용자 자기 점검

- **공무원(남원시 농정과)**: 로그인하면 바로 실태조사 — 업무 판에서 '농지이용 실태조사 · dp-nw-farm-25'만 켜져 있고, 연속지적 332,084필지 위를 잉크 선이 읍면동마다 지나가며 걷히고 파란 의심만 남는다. 숫자는 '의심 필지 20,852'. R1·A 759건에서 한 줄을 누르면 필지로 날아가 대장(답 · 3,040㎡ · 농림지역 · 공시지가 12,100원)과 AI 현황(건물 3동 2,184㎡ · 72 %)이 같은 줄에 놓이고 '왜 의심인가'가 규칙 한 줄로 설명된다. 배정 → 관제에 바로 반영 → 보고서 초안. 약점: 건축물대장 키가 없어 R1 오탐(축사·창고)을 걸러 주지 못한다(점선 정직 표기). 1280×800 서랍 목록은 이제 6줄(필터 접기 + HUD 집중 64px) — 필터는 `필터 ▸` 한 줄 요약으로 접힌다.
- **일반 시민(공개)**: 실태조사는 보이지 않는다(스위치·층·요청 0 — 행정 내부 정보). 공개 결과 2,098필지 `AI 추론 · 검수 전`. 약점: 시민의 다음 행동(내 필지 신고)은 여전히 없다(범위 밖).
- **LX 직원**: 같은 화면에서 실추론(4칸 · GPU 초당 6.8칩)을 돌리고 가르기 오른쪽이 '이 작업 · 54건'으로 따라온다. 계보 칩이 배포본·버전·모델을 실시간으로 보여 주고 관제 롤백이 0.3 s 안에 도착한다. 약점: 이번 하강 스트립은 구름(VIIRS) → V-World 가 100 ms 한 칸에서 바뀐다(타일 경계 프레임 0 · 1차의 경계 한 칸은 사라짐) — 전환이 급해 보일 수 있어 받침 층 500 페이드를 다음 회차 후보로 둔다. 헤드리스(GPU 플래그 없음) 실행에서는 티어가 T2(33.7 ms)로 정직하게 떨어진다.

## 4. e2e

- off `npx playwright test tests/e2e/f1a- tests/e2e/f2a- tests/e2e/f2s- --workers=2` → **58 통과 · 1 건너뜀(on 전용)** — `shots/f2/A/logs/e2e-off-r3.txt`.
- on `LX_API=on DEV_PASSWORD=landxi-dev-2026 …` → **56 통과 · 3 건너뜀(off 전용)** — `e2e-on-r5.txt`. 그 전 세 번(`e2e-on-r2/r3/r4`)은 실행 중 게이트웨이가 다른 에픽에 의해 재기동(boot_at 05:10:52 · 05:13:32 · 05:20:41)되거나 `DEV_PASSWORD` 없이 돌려 401 이 섞였다 — 재기동 없는 창에서 전부 통과.
- 2차 추가 단언: `f2a-mustfix ①-2`(1280/1440/1920 × 판독·실태조사·서랍+카드 · 매 프레임 카드 ∩ `#hud-big`/`#hud-unit` = 0 · 레일 교차 0) · `f2a-layout`(종이 ≤ 35 % · 지도 가시 ≥ 50 % · 레일 120 · 1280×800 / 1440×900 큐 행 ≥ 6 · HUD 64 · `‹ 큐` 로 복귀) · `f2a-bridge`(serviceWorkers:'block' — `agent = mounted` · extMode worker · 외부 404 두 건 = 결손 2 · 계기 표기 · 콘솔 0) · `f2s-parcel-card`(▶ 마커 0 · 날짜 없는 결손 줄 1 · 모든 마커·목록 날짜 ≤ 오늘 · 원천 날짜 집합 안).
- 개정: `f1a-scrub-swipe` 압출 — 티어 T2 면 pitch ≤ 45 로 단언(정상 창 판정으로 헤드리스 T2 가 정직하게 나올 수 있다) · `f1a-motion-law` 의 GPU 기록 파일을 `shots/f2/A/logs/gpu.json` 으로(소유 밖 쓰기 0).
- 서버 원복: 녹화가 쓴 finding(`f_R1_5219035021114580005`)은 F2-S `dev_state reset` 으로 open · dp-nw-farm-25 는 롤백 뒤 v2.1 ga 로 되돌림(확인 `v2.1 ga card-farm@2.1`).

## 5. 레퍼런스 장치 사용표

| 레퍼런스 | 장치 | 적용 |
|---|---|---|
| Vantor | 124px 숫자 · 락온 브래킷 | HUD `332,084 → 의심 필지 20,852` · 대표 3필지 락온 380(스태거 120) |
| kepler.gl | 유리 사이드 패널 · 시간 막대 | 조사 탭(업무 판 · 규칙) · 필지 시점 스크러버 |
| Palantir | 관계 순회 · 디밍 | 이력 ◆ 대장 → ▣ 영상 → ● 판독 → ▲ 의심 → ■ 현장 → ▶ 조치 · 대조 전 베일(잉크 .32) |
| Linear | 밀도 목록 · 다중 선택 액션 바 | 의심 큐 56px 행 · 체크 → `n건 현장조사 배정 ›` |
| Roboflow | 클래스 고정색 · 이미지 1급 | 현황 막대(건물 잉크 · 경작지 청록 · 주차장 슬레이트 · 비닐하우스 청록 딥) · 필지 크롭 3–5장 |
| all4land/FUI | 스캔 스트립 | 대조 스윕 = 잉크 헤어라인 + 격자 점선 꼬리(청록 AI 스윕과 다른 재질) |

나란히 비교(2차 · 왼 = 레퍼런스 원본 실화면 캡처 · 오른 = 이 회차 정지 화면 1440):
- `shots/f2/A/refs/side-vantor-vs-hud.png` — Vantor(vantor.com) 대형 헤드라인·브래킷 ↔ HUD 124px `의심 필지 20,852` + 락온 3
- `shots/f2/A/refs/side-palantir-vs-timeline.png` — Palantir Vertex *Search Around*(객체 → 링크 순회 · docs 원본 이미지) ↔ 필지 이력 ◆ 대장 → ▣ 영상 → ● 판독 → ▲ 의심(→ ■ 현장) 순회 + 레일(큐)
- `shots/f2/A/refs/side-linear-vs-queue.png` — Linear(linear.app) 밀도 목록 ↔ 의심 큐 56px 행 · 상태 5 · 규칙 6 · 등급 · 막대(삼각 호버)
- 원본: `refs/src-*.png`(`tools/refs-capture.mjs` 로 공개 페이지 캡처 · 2026-09-27)

## 6. 계약 변경 요청

| # | 대상 | 요청 | 이유 |
|---|---|---|---|
| 1 | F2-S `findings-emd.json` | 행 모양 하나로 고정(`items[].{name, suspects}` 또는 `rows[].{emd, findings}`) | F2-A 가 두 모양을 다 읽고 있다 |
| 2 | F2-S `shard.done`(survey) | `emd_cd` · `name` · `parcels`(의심 필지 수) 싣기 | 지금은 shard_id 에서 떼고 필지 수는 정본 행에서 |
| 3 | F2-E 패널 | `.ag-mast` 앰버(#FFB633) 상시 사용 → 법전 §2 앰버 = 380 ms 락온만 | motion-law |
| 4 | 통합(F2-∑) | 게이트웨이 재기동 주기 공지 또는 시험 창 분리 | 5분 주기 재기동이 on e2e·녹화를 끊었다 |
| 5 | 법전 §2 | ~~'유리 ≤ 15 %'는 흐림 패널만 센다~~ → 2차: 요청 철회 대신 **종이 시트 상한 35 %** 를 법전에 추가 제안(레일 접힘으로 33 % 달성) | 2차 판정 · 지도가 주역 |
| 6 | 브리프 판정 시나리오 | '서랍 R1·A → 1,053' → **759**(README R1 의 A · 1,053 은 전 규칙 A 합) | 지어낸 수 0 |
| 7 | 계보 칩 예시 | `aerial25/best` 는 v2.0 모델 · v2.1 은 `namwon/cultivate_uncultivate/train`(/registry/lineage 실값) | 화면은 실값 |
| 8 | F2-S 시연 표본 | 공용 finding(README 사례 1 · R1 A 상위)을 여러 에픽 시험이 동시에 쓴다 — 에픽별 표본 구역 배정 | 녹화 대상이 다른 시험에 의해 배정되어 있었다 |

## 7. 산출 파일

`landxi/xi/bridge.js` · `data/modules.json` · `data/build-modules.mjs` · `engine/opt.js` · `survey/{survey-mode,survey-panel,reconcile-sweep,drawer-findings,parcel-card-v2,parcel-timeline,actions,report-draft,api-survey}.js` · `survey/survey.css` · `survey/data/{build-survey-data.py,findings-emd.json,findings-lite.json,rules-fixture.json,detail/*.json,replay/survey-namwon.ndjson}` · 개정 `xi.js` `index.html` `sw.js` `ui/{hud,search,layers-panel,drawer-stats}.js` `fx/{glass,job-theater}.js` `engine/{ladder,sources}.js` `css/{hud,panels}.css` · spec `f2a-{bridge,mustfix,layout,deeplink}` `f2s-{sweep,queue,parcel-card,actions,no-fabrication,public-guard}` + `f1a-*` 개정 · 도구 `shots/f2/A/tools/{record,stills,probe,probe-ops,probe-agency,diag-descent}.mjs` · 영상 `shots/f2/A/f2a.mp4` · 스트립 6 · 정지 9(1280/1440/1920 × 실태조사 · 서랍+카드 · 가르기 80 %).

## 8. 2차 판정 불합격 6건 — 무엇을 바꿨나

| # | 지적 | 조치 | 증거 |
|---|---|---|---|
| 1 | 필지 카드 v2 가 HUD 124px 숫자를 덮음(`col=16+420+44` 가정) | `parcel-card-v2.js` `planCard()`/`obstacles()` — 숫자·유리·크롬·서랍/레일·스크러버를 실측해 후보 x(레일 왼쪽 · 숫자 왼쪽 끝 −24−560 · 오른쪽 · 왼쪽)마다 가장 긴 빈 세로 칸 · 없으면 층 패널을 접고 다시 · 카드는 보이지 않게 펼쳐 실제 높이를 잰 뒤 같은 프레임에 제자리 · HUD 크기가 바뀌면(ResizeObserver) 다시 잰다. 필지 카메라는 계획된 카드 자리 밖 가장 넓은 빈 곳(`freeSpot` · 24px 격자 최대 여유)으로 | `f2a-mustfix ①-2` 9경우 교차 0 · 스트립 `strip-card-read` · `strip-card-survey` · 정지 `drawer-card-{1280,1440,1920}` |
| 2 | 서랍 420 + 카드 560 종이 55.2 % · 1280×800 큐 1–2줄 | 카드가 열리면 서랍이 **120 레일**(행 = 등급 막대 + 리 지번 · 고정 표시 · `‹ 큐` = 카드 닫고 서랍 복귀) · 종이 예산 33 % 로 카드 높이 제한 · 큐 집중 때 HUD 숫자 124 → 64(380 전이) · 서랍 밀도 개편(머리 한 줄 · 상태 칩 짧은 이름 한 줄 + `필터 ▸` · 규칙/등급/읍면동·정렬·검색 두 줄 · 발 = 액션 + 페이저 한 줄) · 목록이 6줄 미만이면 필터 자동 접기(사용자 선택 우선) | `f2a-layout` 종이 33.0 % · 지도 가시 52.8 % · 1280×800 6줄 · 정지 `queue-1280` |
| 3 | 부팅 첫 60프레임 p95 로 세션 T2 강등 · 오프닝 내내 33.4 노출 | `engine/tier.js` 판정 창 = 첫 idle 뒤 60 + 재판정 2 · 부팅 창은 '부팅 계측' 기록만 · 표기 = 최근 창 2.4 s 갱신 · 판정 전 `티어 · 부팅 계측 중` | §2 티어 표 · 영상 오프닝 `T1 · p95 16.8 ms` |
| 4 | 이력 ▶ `2026-12` 지어낸 미래 날짜 마커 | ▶ 마커는 실제 종결(closed) 전이가 있을 때만(서버 updated_at) · 없으면 목록 끝 **날짜 없는 결손 줄** `조치 · 현장 확인(inspected) 뒤 기록 · 2차` · 촬영월 미상 판독은 `2023`·`2025`(연도만 · 1차 `2023-06`·`2025-07` 도 지운 값) · 현장 ■ 는 서버 updated_at 만(오늘 날짜 대체값 삭제) · 같은 자리 마커는 윗줄로 비킴 | `f2s-parcel-card` 이력 spec |
| 5 | 에이전트 마운트가 SW 에 의존(없으면 skipped) · SW 없는 창에서 외부 500 콘솔 누출 | 모듈 존재 표 `data/modules.json` + `build-modules.mjs` · SW 무관 import · 외부 타일·표본 fetch 를 전용 Worker 로(`extFetch` · `lxw://`) — Worker 안 fetch 실패는 페이지 콘솔에 남지 않음(실측) · 결손 수를 계기에 | `f2a-bridge` SW 막음 케이스 · `f2s-sweep`(SW 막음) 통과 |
| 6 | 레퍼런스 나란히 비교 없음 · 영상 92 s · 락온 꼬리표 2·3·4 만 | 나란히 3장(§5) · 영상 71.9 s(초안 5.5 s) · 꼬리표 최대 4개 유지(`clearLocks(3)`) → 칸 1/4–4/4 모두 | `refs/side-*.png` · 영상 25 s 전후 · `strip-theater-100ms.png` |

## 9. 3차 판정 불합격 4건 — 무엇을 바꿨나(재녹화 69.6 s · on · 게이트웨이 재기동 0 · 콘솔 오류 0)

| # | 지적 | 조치 | 증거 |
|---|---|---|---|
| 1 | 카드 v2 안 `<small>` 8곳 11.67px | `survey.css` `.sv-card small { font-size: 14px }`(보조 정보는 색 `--cw-sub`·굵기 400 으로만 위계) | `f2a-layout`: 카드 **스크롤 맨 위(대장/현황 행 보이는 상태)** + 2025 라디오 뒤에 카드 안 모든 글자 ≥ 14px 단언(`cardSmall`) · 보고서 서랍 3폭 테스트에서도 단언 · 1280/1440/1920 실측 14px 미만 0 |
| 2 | '보고서 초안 ›' 서랍 962/842px 가 카드·HUD 덮음 | ① `#drawer` 는 HUD 아래(`--dr-top` = HUD 바닥 + 8, xi.js 가 ResizeObserver 로 잰다) · 폭 `clamp(480, 100vw − 760, 600)`(1280 = 520 · 1440/1920 = 600) — F2-E `data-agent-draft` 960 확장보다 우선(`#drawer` 특정성 · agent.css 수정 0) ② 서랍이 열리면 `xi:rdrawer` → 카드 v2 **요약(머리 + 버튼)** 으로 `planCard` 장애물에 `#drawer` 포함 · 서랍 왼쪽 칸 ③ 초안 동안 의심 큐 레일·시점 스크러버(유리)는 비키고 닫으면 복귀 ④ 락온 필지가 서랍 밑이면 카메라 1000 으로 빈 곳에 | `f2a-layout` 1280/1440/1920(on): 서랍 진입 8표본 × 카드∩서랍 = 카드∩HUD = 서랍∩HUD = 카드∩숫자 = **0** · 유리 **9.1 / 7.2 / 4.5 %** · 지도 가시 **52.8 / 54.6 / 66.4 %** · 닫으면 카드 원복·레일 복귀 · 정지 `shots/f2/F2-A/r3/report-{1280,1440,1920}.png` · 영상 53.7–58.7 s |
| 3 | 하강 3.8 s 단독 V-World 타일 · 세션 전환 백지 17프레임 | ① `engine/ladder.js gateIn` — V-World 받침+위성 이득 0 으로 두고 받침 소스의 렌더 가능 타일이 **뷰포트 100 %**(24px 격자)를 덮은 뒤 **500 ms** 페이드 · z < 6.0 이면 재무장 · 출처 칩도 이득 반영(`ladder:gate`) ② 편집: 원본 A 의 흰 프레임(luma ≥ 235 가 90 %↑)을 실측해 keep 에서 제외(`record.mjs whiteSpans`) + 복원 화면은 타일 적재 완료(`areTilesLoaded`) 뒤부터 · 반화면 합성 바탕을 입력 A 에서 만들어 첫 프레임 백지 0 | e2e `f2a-mustfix ④-2`: 열림 순간 cov **1.0** · 페이드 510 ms · 켜진 뒤 받침 결손 프레임 0 · z6.45 아래 이득 0 · 녹화 게이트 로그 open z7.08 cov 1 → in z8.83 · **제출 영상 자체 실측**(`tools/diag-final.mjs` → `logs/diag-final.json`): 흰 프레임 **0**(2차 18) · 하강 0–8.5 s 곧은 타일 경계 프레임 **0**(같은 도구로 2차 영상 3.84 s 1프레임 검출) · 스트립 `strip-descent-100ms.png`(구름 → 뷰포트 전체 페이드 → V-World) |
| 4 | 공개·게스트 도착 뒤 HLS 스크러버 자동 표시(19 % 스와스) | `buildScrub('hls')` 게이트 두 겹: 그 날짜의 하강 경로 판정(`M.hlsGate` · 칩 `HLS 30m · 궤도 밖 · 화면 19%`와 같은 값) **그리고** 지금 뷰포트 실측(`sources.hlsViewCoverage` · 32px 격자 · 궤도 안 · 구름 아님 ≥ 70 % · 중심 유효). 미달 → `img-hls-*` 전부 visibility none · opacity 0 · 스크러버 결손 `시점 · 궤도 밖 · 화면 19% · 70% 미만이라 끔` + **`그래도 보기 ›`**(누를 때만 `hls-force` 로 층 표시 · 죽은 버튼 0) | `f2s-public-guard`(public·guest): **HLS 층 visible 0**(cov<70%) · 결손 문구 · 버튼 → 누르면 층 > 0 · 녹화 `public.hls {mode:'hls-off', vis:0, chip:'출처 V-World 위성'}` · 정지 `r3/public-{public,guest}.png` · 영상 66.2–69.6 s |

**e2e(3차)** — off `e2e-off-r5.txt` **62 통과 · 1 건너뜀** · on `e2e-on-r7.txt` **60 통과 · 3 건너뜀**(자기 spec 63 · `--workers=2`). `f1a-motion-law` 스윕 1000 ±120 은 한 번 2 워커 경합으로 1222 ms 가 나와 단독 재실행 통과 후 전체 재실행 통과(플레이키 기록 `e2e-off-r4.txt`).

**남은 약점(정직)** — 하강 z8.7–8.9 에서 받침(z9 확대) 위로 선명한 V-World 타일이 들어올 때 해상도 차 경계가 1–2 프레임 보인다(같은 출처 · 구름 위 회색 조각은 아님). 헤드리스 뷰포트 실측으로 z12 남원 중심의 HLS 는 궤도 안 96 % 지만, 하강 경로 판정(19 %)에 묶어 공개에서는 끈다 — '그래도 보기'로 사용자가 켤 수 있다.
