# F2-A — XI맵 운영판 v2: 1차 must_fix 6 + **실태조사 모드(S-1)** + 브리지 `window.XI` + 에이전트 마운트

- 모델 **Opus 5.5** · 난이도 XL · 기간 8–10일 [추정] · 판정 Fable 5.1(Craft · 영상 · 세 사용자 · 5축)
- 읽을 것(순서): ① `F1-CONTRACT.md` **v1.1 절 전문**(v1.1-1·2·3·5·6) ② `design/system-v2.md` ③ `SURVEY-SPEC.md` §0 · §2 · §4.1–4.3 · §4.5 · §8.1 ④ `f1/F1-A.md` · `f1/F1-A-result.md`(§5 계약 변경 요청 12건 — 어느 것이 v1.1로 채택됐는지 대조) ⑤ `02. 데이터/survey/README.md` 전문 ⑥ `agent/AGENT-SPEC.md` §4.1(마운트 자리만)
- 공통 규칙: **git commit/reset/stash/checkout/restore 절대 금지**(통합 단계만 커밋 · 되돌림은 수동 편집) · 소유 밖 수정 0 · 테스트는 자기 spec만(`npx playwright test tests/e2e/f1a- tests/e2e/f2a- tests/e2e/f2s- --workers=2`) · 서버 4173·8700·8702·vLLM·Ollama 끄지 말 것 · 영상 생성 API 금지 · **GPU 전력 규칙**(무거운 GPU 작업은 GPU0 워커 한 장 · 벤치·재추론 금지) · 행정·조달 문서화 금지(기능·퍼포먼스·서비스·UI/UX만).
- 판정 5축: 완성형(목업·가짜진행·죽은 버튼 0) · 유일함 · Hyper Solution(판독→필지·대장 대조→조치·보고) · Hyper Performance(실측 수치 정확히) · 관리-생산-서비스 일원화(같은 id 딥링크·실시간) + 공무원·시민·LX 직원 '우와'.

## 목표

1차 XI맵(`landxi/xi/`)은 실추론 극장까지는 "진짜"라는 판정을 받았지만 마감 6곳에서 불합격했다. 2차는 **그 6곳을 0으로 만든 뒤, 같은 페이지 위에 실태조사 모드를 얹어 공무원이 "판독 → 필지·대장 대조 → 의심 큐 → 이력 → 조치 표시 → 보고서 초안"을 한 화면에서 끝까지 한다.** 데이터는 지어내지 않는다 — `02. 데이터/survey/`의 실값(남원 연속지적 **332,084필지** × 2023 AI 129,420 결합 · 의심 **20,872건 / 20,852필지** · 규칙 R1 4,140 · R2 15,651 · R3 20 · R4 33 · R5 464 · R6 564 · 등급 A 1,053 / B 7,386 / C 12,433 · 이력 6,818필지)만 화면에 오른다. 동시에 다른 에픽(F2-E 에이전트 · F2-C 관제 · F2-D Global · F2-R 레일)이 이 페이지에 붙을 수 있게 **브리지 `window.XI`**와 마운트 지점을 D0에 낸다.

## 근거 — 1차 must_fix 원문(저널 regate:F1-A · a6e07ee0 · 6건 · 전부 필수)

1. `[landxi/xi/xi.js onFrame + fx/glass.js panelIn] 견적 카드 진입 글리치: 인라인 transform:translate(88px,132px)를 panelIn 의 WAAPI transform 애니메이션(translateY(4px)→none · 380ms)이 덮어써 카드가 0.3–0.4초 동안 (0,0)에 마스트·검색창·레일 위로 뜬 뒤 (88,132)로 순간이동한다(제출 영상 22.35–22.7초 · 내 계측 d=0/100/300ms 위치 (0,3)/(0,1)/(0,0) → 600ms (88,132)). 기대: 위치는 left/top 또는 CSS translate 속성으로 주고 진입 애니메이션은 composite:'add' 또는 opacity+별도 래퍼로 — 첫 프레임부터 최종 위치에서 4px 아래→제자리, 마스트 위 프레임 0. 필지 카드 등 panelIn+transform 조합 전부 같은 규칙으로 점검.`
2. `[landxi/xi/css/panels.css .xi-swchip--r · fx/swipe.js] 스와이프 우측 출처 칩(top:132px · max-width 30vw)이 우상 HUD 124px 숫자 위에 겹친다(제출 영상 36.8–39.5초 '+ AI 결과 남원 농경지 2025 · 남원 변화 탐지' 칩이 '71' 위를 덮음 · 내 스크린샷 동일). 기대: 칩은 HUD 폭(우 16+420px) 밖 또는 HUD 아래(y ≥ HUD bottom+8)에 두고, 두 칩 모두 그립에 붙거나 스크러버 위 한 줄로 — 1280/1440/1920 세 폭에서 HUD·카드와 교차 0을 e2e 로 단언.`
3. `[landxi/xi/ui/hud.js job()/jobFinal()] '12.0칩/s [실측]'은 gpu_worker 10초 창의 하한 0.5s 아티팩트(n/0.5)라 처리량이 아니다(내 실행 10.0 = 5/0.5). Hyper Performance 축은 실측 숫자로 증명해야 하므로: chips_per_s 는 계량 창이 ≥1s 이고 shard ≥ 8 일 때만 표시하고, 그 전엔 '칩/s — · 창 짧음'; job.done 뒤에는 이 작업 기준 실측(shards ÷ gpu_s → 'GPU 초당 n.n칩', shards ÷ elapsed_s → '벽시계 n.n칩/s')을 두 줄로 나눠 적는다. 결과 문서 §2 의 '12.0칩/s' 문장 정정 + 계약 변경 요청 13(서버 창 하한·첫 묶음 처리).` → 서버 쪽은 v1.1-5·6·7(F2-B). 프론트는 `job.done`의 `chips_per_gpu_s` · `chips_per_wall_s` · `gpu_s` · `elapsed_s`를 두 줄로, 진행 중 `util_pct`는 `GPU0 이용률(공유) n% · w W`.
4. `[landxi/xi/engine/ladder.js CURVE gibs-hls-s30 · xi.js 하강 시나리오] 글로브→남원 하강 3–6초가 '고장난 지도'로 읽힌다: 어제 VIIRS 전면 구름 위에 HLS 하루 궤도 띠가 들쭉날쭉한 L자 조각으로 떠서(descent 스트립 6장) 타일 깨짐처럼 보인다. 기대: HLS 는 계약대로 z9–13 토글 층으로 두고 하강 서사에서는 뷰포트 중심을 덮고 화면 커버리지 ≥ 70% 일 때만 자동 표시(아니면 칩 'HLS 30m · 궤도 밖'으로 결손 표기하고 층은 끄기), V-World 받침을 z6.5 부터 들여 구름→V-World→25cm 로 잇기. 구름 많은 날(VIIRS 화면 밝기 평균 > 200)은 글로브 첫 화면에서 '어제 · 구름 n%' 칩을 붙여 의도된 실영상임을 밝힌다. 판정 영상 100ms 스트립에 조각 띠 프레임 0.`
5. `[landxi/xi/xi.js 스크럽·HUD 상태줄] 프레임 작업 결과(큰 숫자 71건)가 떠 있는 채 스크럽/스와이프를 하면 HUD 상태줄이 '변화 지수(비지도) · 2025-08 → 2025-10 · 109건'으로 바뀌어 한 패널에 두 문맥의 숫자가 섞인다(내 extrude·swipe 스크린샷). 기대: 스크럽 문구는 스크러버 라벨/히스토그램에만 두고 HUD 상태줄은 현재 큰 숫자의 봉투와 같은 출처만 쓰거나, 스크럽 시 큰 숫자도 시점 변화 봉투로 함께 교체(hud.set) — 한 패널에 한 출처.`
6. `[landxi/xi/fx/job-theater.js lock html] 락온 꼬리표 'r001c001 도착 12' 처럼 내부 shard id 를 사용자에게 보이지 말 것. 기대: '칸 4/6 · 도착 12건 · 경작지 11 · 건물 1' 형식(i18n-ko 클래스명), id 는 title 툴팁으로.`

이전 회차에서 이미 고쳐진 것(재발 금지 · e2e 유지): 하강 먹색 프레임(제출 영상 20fps `max(RGB)<24` 비율 ≤ 1%) · HLS 검은 no-data 블록 · 공개 탭 백지 1초 · on 극장 칸 간격 ≥ 100ms · 덕과면 AOI 서사 · 통계 서랍 크롬 숨김 · 글로브 첫 2초 빈 원반. F1-B 게이트가 통보한 것: **마스트 `장소 검색 · V-World 키 대기` 문구 해제**(키 활성 실측 · 프록시 200) — 503일 때만 결손 칩. F1-B §13: 가르기 오른쪽 칩이 작업 결과가 아닌 `남원 토지피복`을 표기 · HUD 기본 헤드가 익산에서도 `남원 전역 129,420`으로 시작 → 현재 카메라 bbox와 켜진 층 기준으로.

## owned_files
`landxi/xi/**` 전부(F1-A 목록 + 신설 `landxi/xi/bridge.js` · `landxi/xi/survey/{survey-panel.js,reconcile-sweep.js,drawer-findings.js,parcel-card-v2.js,parcel-timeline.js,actions.js,survey.css}` · `landxi/xi/survey/data/{rules-fixture.json,findings-emd.json,replay/survey-namwon.ndjson}` · `landxi/xi/data/replay/*`) · `tests/e2e/f1a-*.spec.mjs`(개정) · `tests/e2e/f2a-*.spec.mjs` · `tests/e2e/f2s-*.spec.mjs` · `shots/f2/A/**` · `blueprint/f2/F2-A-result.md`.
읽기·import만: `landxi/shared/api-v1.js`(수정 금지 · 새 엔드포인트는 `landxi/xi/survey/api-survey.js` 안에서 `api()` 래퍼) · `tokens-v2.css` · `landxi/proto/vendor/maplibre/*` · `landxi/data/**`(junction · `landxi/data/survey/namwon-parcel-survey.pmtiles` = 레이어 `parcels`(pnu jibun jimok emd area_m2 yongdo nongup bld_m2 crop_m2 park_m2 gh_m2 r23_farm flags sus_rule sus_priority sus_score) · `suspects`(rank priority score rule rule_nm pnu addr jimok parcel_m2 evid_m2 conf corroboration img_date evidence) · z11–16 · 108.6MB) · `namwon-parcel-emd-summary.json` · `namwon-parcel-timeline.json`.
**만지지 말 것**: `landxi/agent/**`(F2-E) · `landxi/ops/**` · `landxi/global/**` · `landxi/proto/**` · `server/**`.

## 단계별 할 일

### 0. D0(첫 날 오전) — 브리지 · 마운트 · 모드 훅 (다른 에픽이 기다린다)
- `landxi/xi/bridge.js` → `window.XI` (모듈 export도): `ready:Promise` · `session()` · `view() → {center, zoom, bbox, on:[setId], frame, svc, mode, epoch}` · `layerOn(setId, {filter?})` / `layerOff(setId)` · `arrive({bbox, setId|features, count:Envelope, camera?})`(fx/arrive 그대로) · `flyTo({bbox|center, zoom?, pitch?}, ms=1600)` · `frame(geojson)`(견적 카드까지) · `parcelCard(pnu | {lng,lat})` · `openDrawer('report'|'stats'|'findings', opts)` / `closeDrawer()` · `hud.set(env, {title, sub})` · `toast(msg, basis)` · `on(evt, fn)` evt ∈ `view job mode parcel finding frame`. 봉투 없는 숫자는 `arrive`·`hud.set`이 throw(기존 `prov()` 규칙).
- `index.html`: `<div id="agent-slot" data-slot="agent">`(우상 HUD 아래 · 유리 총면적 ≤ 15% 규칙 안) + `<div id="cmdk-slot">`(상단 중앙 폭 480) + 부팅 끝에 `import('../agent/panel.js').then(m=>m.mount?.(window.XI)).catch(()=>{})`(파일 없으면 콘솔 오류 0). `⌘K`/`Ctrl+K` → `window.XI` 이벤트 `cmdk`(에이전트가 없으면 기존 검색창 포커스).
- URL 상태 확장(v1.1-29): `?mode=survey&survey=farmland&rule=R1&priority=A&emd=52190250&finding=<id>&pnu=&job=&deploy=` 새로고침 복원. `?job=`로 열리면 그 작업 HUD·계보 칩을 즉시 복원(`GET /jobs/{id}` + SSE `Last-Event-ID` 재생).
- 결과 문서에 브리지 표(함수 · 인자 · 이벤트)를 D0에 먼저 쓴다(F2-E가 읽는다).

### 1. must_fix 6 (D1–D2)
- 1 견적·필지·집계 카드 전부 `left/top` + WAAPI `opacity/translate` 분리 래퍼. e2e: 카드 첫 프레임 bbox가 마스트(64px)·레일(72px)과 교차 0 · 100ms 스트립.
- 2 스와이프 칩 두 개를 스크러버 위 한 줄(그립 기준 좌/우) · 1280/1440/1920에서 HUD·카드·칩 교차 0 e2e.
- 3 HUD `job()`: `chips_per_s.value===null`이면 `칩/s — · 창 짧음` · `GPU0 이용률(공유) n% · w W`(v1.1-7) · `jobFinal()`: `GPU 초당 n.n칩 · 벽시계 n.n칩/s · 이 작업 x.xx GPU·s · y.y s`(v1.1-6). 서버가 아직 필드를 안 주면 프론트가 `shards/gpu_s`·`shards/elapsed_s`를 계산하되 `source:'프론트 계산'` 봉투.
- 4 `ladder.js`: HLS 자동 표시 조건(뷰포트 중심 포함 + 커버리지 ≥ 70% · `map.querySourceFeatures`/타일 존재 검사) · 아니면 `HLS 30m · 궤도 밖` 결손 칩 + 층 off · V-World(xdworld 폴백) 받침 **z6.5부터** · VIIRS 밝기 평균 > 200이면 `어제 · 구름 n%` 칩. 100ms 스트립 12장에 조각 띠 0.
- 5 HUD 한 패널 한 출처: 스크럽·스와이프 문맥은 스크러버 라벨/히스토그램 · 큰 숫자를 바꿀 때는 `hud.set`으로 봉투째 교체.
- 6 락온 꼬리표 `칸 a/b · 도착 n건 · 경작지 x · 건물 y`(i18n-ko `cls`) · id는 `title`.
- 부수: V-World 키 문구 해제 · 가르기 우측 칩 = 현재 작업 결과 · HUD 기본 헤드 = 현재 뷰의 켜진 층 · 시민 화면 봉투 `AI 추론 · 검수 전` 통일(v1.1-2) · 필지 카드 크롭 캡션 = 카탈로그 `gsd_m`(v1.1-3) · 계보 칩 `dp-nw-farm-25 · v2.1 · aerial25/best` = `GET /deploys` 값 + tenant 스트림 `deploy.changed`(v1.1-16)로 **실시간 갱신**(관제가 롤백하면 XI맵 칩이 1초 안에 v2.0) — 스트림이 없으면 10s 폴링 + `폴링` 표기.

### 2. 실태조사 모드 S-1 (D3–D7 · SURVEY-SPEC §4.1 그대로 · 데이터는 실값만)
- **진입**: 레이어 패널 상단 모드 스위치 `판독 ◉ 실태조사 ○`(기관 세션 기본 = 실태조사 · 게스트 `public=1`은 스위치 없음 · survey 층 요청 0 e2e). 업무 선택 판 10행(농지이용 · 농지전용 · 개발행위 사후관리 · 지목불부합 · 공유재산 · 하천점용 · 방치폐기물 · 산림훼손 · 해양쓰레기 · 무허가건축물) — **남원 `dp-nw-farm-25`에 연결된 `farmland`만 켜짐**, 나머지 `배포본 없음 · 점선`. 규칙 6행(R1–R6 · 이름 · 조건 · 건수 봉투 `estimate` 임계 꼬리표) 체크로 층 필터.
- **필지 층**: `survey/namwon-parcel-survey.pmtiles` `parcels`(z12 읍면동 집계 격자 → z14+ outline 흰 .35) 도착 1250 · pitch 0→25.
- **대조 스윕 `fx/reconcile-sweep.js`**(`--sweep-ink`: 1px `#010102` .6 + 격자 점선 꼬리 · 청록 아님): on 모드 = `POST /jobs kind:'survey'`(v1.1-22 · shard 39 읍면동) SSE `shard.done` 칸마다 그 읍면동이 걷히고(일치 필지 fill 0 · outline 유지) 의심만 액센트 해치(`suspects` 층 `rule`·`priority` 필터) · off 모드 = `survey/data/replay/survey-namwon.ndjson`(F2-S가 실행 녹음 · 그 전엔 `findings-emd.json` 39행 합성 · `시연 · 저장 결과 재생`). 39칸 순서 · 이벤트 없이는 진행 안 함.
- **락온 3 + HUD**: 가장 큰 의심 3필지(score 상위 · README 대표 사례: 아영면 아곡리 1053-12 R1 A 90.5 · 운봉읍 화수리 1110 R4 A · 사매면 월평리 478-9 R5 A) 락온 380 스태거 120 · HUD 124px `의심 필지 20,852`(봉투 inferred · 정본 = `findings-emd.json`/`GET /survey/stats` 합) · 부제 `읍면동 39/39 대조 · 규칙 6 · 연속지적 2026-09-24 · 건축물대장 미대조 [추정 초기 임계]`.
- **의심 큐 서랍 `drawer-findings.js`**(우 유리 420): 상태 칩 5(`open assigned dismissed inspected closed` 봉투) · 정렬(score · 근거면적 · 갱신) · 필터(규칙 · 등급 A/B/C · 읍면동 · 시점) · 검색(PNU·지번) · 행 56px `A ▮▮▮ · 아영면 아곡리 1053-12 · 답 → AI 건물 3동 2,415㎡(53%) · R1 · open` · 행↔도형↔읍면동 막대 삼각 호버 · 체크 다중 선택 → 하단 액션 바 `n건 현장조사 배정 › · 오탐(사유)` · 페이저(서버 offset) · CSV(BOM · 성명 열 없음 · public 비활성) · 빈 상태 `의심 0 · 대조 완료 hh:mm`.
- **필지 카드 v2 `parcel-card-v2.js`**(EVIDENCE-PAIR 560 · 판독 모드의 카드도 이 부품으로 통일): 좌 대장(지목 · 면적 · 용도지역 · 농업진흥/보호 · 공시지가 `₩/㎡ 기준년월` · 건축물대장 `키 없음 · 점선` · 소유구분 `연속지적 미제공 · 점선`) / 우 현황(2023 AI 클래스 4 면적·비율 막대 + conf · 2025 A02 경작/비경작·비닐하우스 · 시점 라디오 2023 ◉ 2025 ○ → 막대 500 재성장 + 배경 시점 갈림) · 크롭 2장(A03 2시점) / 4장(A01 AOI 안) · **왜 의심인가** = `explain` 규칙 한 줄 = 한 규칙(`R1 v1.0 · A 90.5 │ 지목 답 4,556㎡ · 농림지역 · 농업진흥구역 │ AI 건물 3동 2,415㎡(53%) · 신뢰도 0.97 · 2023 25cm │ 임계 33㎡ [추정 초기값] · 건축물대장 미대조`) · 버튼 `현장조사 배정 ›` `오탐 신고` `이력 ▾` `보고서 초안 ›` · 상태 칩.
- **이력 타임라인 `parcel-timeline.js`**(H-1): `namwon-parcel-timeline.json`(6,818) 또는 `GET /survey/parcels/{pnu}?with=history` → 수평 레일 · 마커 ◆ 대장 · ▣ 영상 · ● 판독 · ▲ 의심 · ■ 현장 · ▶ 조치 · **V5 스크러버와 같은 시간축**(스크러버를 끌면 커서·배경 영상이 따라옴) · 요약문(`2023 경작 → 2025 비경작 우세(휴경 전환 후보)` 등 README 5절 4종) · 이력 없는 필지 `이력 · 2023 단일 시점` 결손.
- **조치 표시 `actions.js`**(1차 유일 쓰기 · v1.1-22 `POST /survey/findings/{id}/state`): `현장조사 배정 ›` → 시트(담당자 텍스트 · 예정일 · 사유) → 낙관적 갱신 0 · 서버 응답 후 상태 칩 교체 + 타임라인 ■ 마커 + tenant 스트림 `finding.state`로 **다른 탭·관제가 1초 안에** 바뀜 · off 모드는 `시연 · 저장 안 됨` 토스트 + localStorage 없이 메모리만 · 실패 코드 3(`finding_state_invalid` 등) 결손 표기.
- **보고서 초안 연결**: `보고서 초안 ›`(카드·서랍 액션 바) → `openDrawer('report', {tab:'draft', emd_cd, rule, top:20})` — 서랍 탭 `초안 작성`은 F2-E가 채운다; F2-E 미도착·`llm_unavailable`이면 `GET /survey/reports/draft?format=docx`(F2-S · LLM 없이) 다운로드 버튼으로 **반드시 닫힌다**. 둘 다 없으면 점선 `초안 · 서버 없음`.
- 역할: 게스트 모드 없음(층·API 요청 0 e2e) · LX staff 열람 + 상태 쓰기 `시연` 표기 · 기관 manager 전부 · 영업 `demo`.

### 3. 성능 · 법전 · 테스트 (D8)
- p95 ≤ 20ms 전 구간(입체+서랍+표 동시 구간 포함 · iframe은 열릴 때만 src · 닫으면 비움) · 캔버스 ≥ 90% · 유리 ≤ 15%(서랍 420 + 카드 560이 동시에 열리면 카드가 서랍 위로 — 면적 계산 e2e) · 14px 미만 0 · 콘솔 오류 0(on/off/public 3모드) · motion-law.
- e2e: `f1a-*` 개정(칩 교차 · HUD 두 줄 · HLS 조건) · `f2a-bridge`(window.XI 함수 전수 · 봉투 없는 숫자 throw) · `f2a-deeplink`(`?job=` `?deploy=` `?pnu=` 복원) · `f2s-sweep`(39칸 순서 · 일치 fill 0 · 의심 해치 · 이벤트 없이 진행 0) · `f2s-queue`(필터·정렬·삼각 호버·페이저·CSV BOM) · `f2s-parcel-card`(대장/현황 행 정렬 · explain 줄 수 = findings 규칙 수 · skipped 점선) · `f2s-timeline`(스크러버 동기) · `f2s-actions`(상태 쓰기 → 칩 · SSE 반영 · off 시연) · `f2s-no-fabrication`(HUD 합 = `findings-emd.json` 합 20,852 · by_rule 합 20,872) · `f2s-public-guard`(public=1에 survey 요청 0 · 모드 없음).

## 완료 기준(acceptance)
1. must_fix 6 전부 0 — 각각 e2e 단언 + 100ms 스트립(카드 진입 · 스와이프 · 하강 3–6s) 제출 · 결과 문서 §2에 제출 영상 자체 실측(먹색 ≤ 1% · 조각 띠 0 · 카드 마스트 교차 0).
2. `window.XI` 브리지 표 + e2e 전수 통과 · `#agent-slot`·`#cmdk-slot` 존재 · `landxi/agent/panel.js` 없이도 콘솔 0.
3. 실태조사 모드: 모드 스위치 → 필지 층 도착 → 대조 스윕 39칸(on = `kind:'survey'` 실작업 · off = 리플레이) → 락온 3 → HUD `의심 필지 20,852`(봉투 · 정본 합과 일치) ≤ 8s(off).
4. 의심 큐 서랍 필터(규칙 6 · 등급 3 · 읍면동 39) · 정렬 3 · 검색 · 삼각 호버 · CSV(BOM) · 빈 상태 정직.
5. 필지 카드 v2: 대장 vs 현황 같은 행 높이 · 시점 라디오 → 막대·배경 동기 · '왜 의심인가' 규칙 줄 = findings 수 · 결손 점선 3종(건축물대장 · 소유구분 · 용도지역 미결합 19필지) · 이력 ▾ 750 펼침 · 스크러버 동기.
6. 조치 표시: 배정/오탐 쓰기 → 상태 칩 · 타임라인 ■ · **다른 탭 관제(`?job=`/큐)에 1초 안 반영**(on) · off `시연`.
7. 보고서 초안 ›: F2-E 탭 또는 F2-S docx 다운로드 중 하나로 반드시 닫힘 · 죽은 버튼 0.
8. Hyper Performance: job.done 뒤 HUD 두 줄(GPU 초당 · 벽시계) + `GPU0 이용률(공유) n% · w W` — 게이트웨이 `GET /jobs/{id}` 값과 일치(결과 문서 표).
9. 계보 칩 실시간: 관제 롤백 → XI맵 칩 v2.1→v2.0 ≤ 1s(on · 스트림) — 영상에 나란히.
10. 역할 4종 + public 가드 + URL 복원 spec · p95 ≤ 20ms · 캔버스 ≥ 90% · 유리 ≤ 15% · 14px 미만 0 · 콘솔 0 · 소유 밖 수정 0.
11. 결과 문서: 레퍼런스 장치표(Vantor 124px · kepler 유리 · Palantir 관계 순회=이력 · Linear 밀도=큐 · Roboflow 클래스색) · 세 사용자 자기 점검 · 계약 변경 요청 절 · **브리지 표**.

## 판정용 동작 영상(≈ 70s · 1440×900 · `shots/f2/A/f2a.mp4` · on 모드 · 게이트웨이 살아 있을 때 · GPU0 한 장)
| 초 | 무엇 |
|---|---|
| 0–8 | 글로브(`어제 · 구름 n%` 칩) → 한국 → 남원 하강: HLS 조각 띠 0 · V-World 받침 z6.5 · 출처 칩 3회 · 먹색 0 |
| 8–14 | 129,420 도착 · 운봉읍 카드 → `덕과면 드론 AOI로 이동 ›` → 필지 카드 v2(판독 모드) 진입 글리치 0 |
| 14–20 | 사각 프레임 → 견적 카드(첫 프레임부터 제자리) → 실행 → 칸 점등(꼬리표 `칸 a/b · 도착 n건 · 경작지 x`) → job.done → HUD 두 줄 `GPU 초당 · 벽시계` + `이용률(공유) n% · w W` |
| 20–24 | 스와이프 20→80(칩이 HUD 밖) · 스크럽(HUD 한 출처) |
| 24–30 | 모드 스위치 `실태조사` → 업무 판(farmland만 켜짐) → 필지 층 도착 → **대조 스윕 39칸이 지나가며 일치 필지가 걷히고 의심만 해치로 남는다** |
| 30–34 | 락온 3(아영면 아곡리 · 운봉읍 화수리 · 사매면 월평리) · HUD `의심 필지 20,852` 카운트업 · 부제 |
| 34–44 | 서랍: 규칙 R1 · 등급 A 필터 → 1,053 → 첫 행 호버(삼각) → 클릭 → z17 하강 → 필지 카드 v2 대장 vs 현황 · 시점 라디오 2023↔2025 · 왜 의심인가 · 결손 점선 |
| 44–52 | 이력 ▾ → 타임라인 ◆▣●▲ · 스크러버 끌기 동기 → `현장조사 배정 ›` → 상태 assigned · ■ 마커 · (반화면) 관제 큐/기관 화면 1초 안 반영 |
| 52–60 | `보고서 초안 ›` → 서랍 탭(F2-E) 또는 docx 다운로드(F2-S) — 파일 열린 화면 |
| 60–70 | 관제에서 롤백(반화면) → XI맵 계보 칩 v2.1→v2.0 실시간 · `?public=1` 새 탭: 실태조사 스위치 없음 · survey 요청 0 |
+ 100ms 스트립 ≥ 12장(하강 · 카드 진입 · 스윕 · 락온) · 정지 1280/1440/1920 · 레퍼런스 나란히(Palantir 관계 순회 vs 이력 · Linear 목록 vs 큐).

## 계약 · 요청
- v1.1 항목 인용: 1·2·3·5·6·7·15·16·22·24·29. 서버가 늦으면 프론트 계산·폴링으로 닫되 봉투 `source`에 그렇게 적는다.
- F2-E에 준다: 브리지 표(D0) · `#agent-slot` · `#cmdk-slot` · 서랍 `report` 탭 슬롯 `openDrawer('report',{tab:'draft',…})`.
- F2-S에서 받는다: `survey-namwon.ndjson` 녹음 · `findings-emd.json`(정본 합) · API 22.
- F2-R에서 받는다: 레일 '지도 서비스' → 이 페이지 · 세션(realm/role) 인계 규약은 기존 `session.shadow()` 그대로.
