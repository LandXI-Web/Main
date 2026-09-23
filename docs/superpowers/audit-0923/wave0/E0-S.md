# E0-S XI맵 시그니처 스파이크 — S1 도착 · S3 시점 스크럽 · S6 스와이프를 실데이터로

- 모델: **Opus 5.5** · 난이도 L · 화면 변화 = 이 에픽의 전부(**움직이는 화면**)
- 전제: `wave0/00-COMMON.md` · `MASTER-PLAN.md §1`(S1 · S3 · S6 정의) · `map-critique.md` §2 9–11 · `analysis-critique.md` §4 A1 · A3 · A5 · 법전 §2(청록 · 앰버 380ms) · §4(모션 전부) · **`superpowers:brainstorming` 은 건너뛴다 — 설계는 이 브리프가 확정했다. 구현 판단만 자유.**

## 목표

사용자는 네 차례 '딱딱한 목업' 을 거부했고 "동작하는 화면으로 판단" 한다. Wave 0–1 은 배관 작업이라 3주 동안 보여 줄 '우와' 가 없다(C-36). 그래서 Wave 0 와 병렬로 **XI맵 한 화면에 시그니처 문법 셋을 실데이터로 세운 스파이크**를 만들어 W1 중간에 사용자에게 보여 준다. 제품 파일은 건드리지 않는다 — 이 코드는 W2 E2-0 이 부품(`arrive.js` · `timescrub.js` · `swipe`)으로 쪼개는 출발점이 된다. **결과물은 스크린샷이 아니라 프레임 스트립과 영상으로 판정받는다.**

## 실데이터 (전부 저장소에 있음 · 값을 지어내지 않는다)

- 결과: `landxi/assets/data/geo/results/namwon-farmland-2025.geojson`(2,098 필지 · 클래스 경작지 1,291 / 비경작지 807 · bbox `results.js RESULTS[0].stats.bbox` = `[127.185031, 35.307309, 127.657689, 35.556752]`) — `results.js` 의 `stats` 만 숫자 출처.
- 정사영상 4시점: `imagery.js IMAGERY` `namwon_2504` · `namwon_2506` · `namwon_2508` · `namwon_2510`(bounds `[127.3481, 35.5276, 127.3567, 35.5347]` · z12–19 · `assets/tiles/<id>/{z}/{x}/{y}.webp` · GSD 1.08 / 1.69 / 1.54 / 1.68 cm). 남원 전역 2시점 `namwon_city_2504/2510`(z11–17 · 2 m)은 **S1 도시 스케일 바탕**으로 쓸 수 있다(선택).
- 변화 지수: `change.js CHANGE` 3 pair(2504→2506 · 2506→2508 · 2508→2510 · '변화 지수(비지도) · 학습 결과 아님' 표기 필수) — S3 자동 정지 시점의 근거.
- 읍면동: `geo/namwon-emd.geojson`(32).
- 부품: `landxi/proto/map-gl.js`(`createMap` · `addResult` · `removeResult` · `setResultFilter` · `setEpoch` · `fit` · `inView` · `scaleBar` · `setEmd`) · `js/sources.js` · `map-data.js`(`TEAL` · `clsLabel` · `EPOCHS` · `epochById`). **import 만.** `setEpoch` 는 한 층만 다루므로 두 층 크로스페이드는 스파이크 안에서 `map.addSource/addLayer` 로 직접(부품화는 E2-0).

## owned_files

없음(기존 파일 수정 0).

## new_files_allowed

`landxi/proto/spikes/ximap-signature.html` · `landxi/proto/spikes/ximap-signature.js` · `landxi/proto/spikes/ximap-signature.css` · (필요하면) `landxi/proto/spikes/ximap-signature/*.js` 보조 모듈 · `tests/e2e/spike-ximap-signature.spec.mjs` · `shots/w0/E0-S/**` · `docs/superpowers/audit-0923/wave0/E0-S-result.md`

## 화면 골격

- 관문 없음(스파이크 · `review/` `spikes/` 는 integrity 크롤 제외). `<title>XI맵 시그니처 — 스파이크 · 제품 아님</title>`. 상단 헤어라인 띠 한 줄 `스파이크 · 제품 아님 · 실데이터: 남원 농지이용 2025(2,098 필지) · LX 정사영상 4시점` — 시연 표식.
- `<link>` 순서: `../fonts-system.css` → `../vendor/maplibre/maplibre-gl.css` → `../shell.css`(토큰만 쓴다 · 레일 없음) → `../parts.css` → `ximap-signature.css`. 스크립트: `../vendor/maplibre/maplibre-gl.js` 클래식 → `ximap-signature.js` 모듈.
- 레이아웃 = **PLATE-FULL**: 지도 캔버스가 뷰포트 전부(콘텐츠 ≥ 90 %). 위에 뜨는 것은 흰 판(헤어라인 · 그림자 0 · 라운드 0) 셋 — 좌상 HUD(장면 이름 · 큰 숫자) · 하단 시점 스크러버 띠 · 우하 장면 전환 세그먼트(`S1 도착` `S3 시점` `S6 스와이프` 3칸 브래킷). 다른 것은 없다.
- 폭 1280 · 1440 · 1920 모두 캔버스 ≥ 90 %. 390 은 대상 아님(스파이크).

## 장면 정의 (지속값은 법전 값만: 180 · 380(=180+80+120) · 500 · 750 · 1000 · 1250 · 40 · 60)

### S1 도착 — 판독 결과는 지도 위에 "도착" 한다 (열자마자 자동 · 1회)
1. t=0 지도는 남원 전역(결과 bbox) 무채 바탕(`setBase` 위성 또는 `namwon_city_2504` 타일)에 **결과 0**. HUD `남원시 농지이용 현황 · 2025 · 드론 · 판독 결과 도착 중` · 큰 숫자 자리 `—`.
2. `frame`(= `map.fitBounds` 1250ms · 이징 하나) 로 결과 bbox 에 맞춘다.
3. **스캔 스윕 1.0s**: 청록 수직선(1px + 8px 틴트 띠 · DOM 오버레이)이 좌→우로 지나간다. 지나간 자리에만 결과가 남는다 — 구현: 피처마다 중심 경도 `cx` 속성을 미리 넣고(`centroid`) 매 프레임 `setResultFilter(map, key, ['<=', ['get','cx'], sweepLng])`(또는 `-pt` 레이어 필터) 로 스윕 뒤쪽만 보이게. 도형이 나타나는 순간 fill-opacity 0 → 0.18 은 MapLibre `fill-opacity-transition 500` 로.
4. **락온 380ms**(스윕 종료 직후 3곳 자동 + 이후 클릭마다): 필지 중심에 코너 브래킷(12px · `map.project` 로 DOM 위치 · `map.on('move')` 갱신) — 브래킷 성장 180ms → 앰버 `#FFB633` 80ms → 청록 `#0FA9A0` 정착 120ms. 앰버는 이 80ms 외 어디에도 없다.
5. **숫자 현상**: HUD 큰 숫자 `2,098`(Paperlogy 700 · ≥ 32px) 글자별 40ms · 단위 `필지` · 아래 해설 줄 `경작지 1,291 · 비경작지 807 · 315.9 ha · 신뢰도 중앙값 0.41 · 기준 2026.06.08`(`results.js stats` 값 · 텍스트 인 600/60 스태거). 끝나면 `window.__spike.state().arrived = true` · `document.documentElement.dataset.phase = 'arrived'`(진행 중 `sweep` → `lock` → `count` → `arrived` 순서로 갱신 — 스펙이 읽는다).
6. `다시 보기` 버튼(브래킷 · 잉크 글자) 으로 1–5 재생. `prefers-reduced-motion` = 스윕·락온 생략 · 최종 상태 즉시.

### S3 시점 스크럽 — 정사영상 4시점을 끌면 바탕이 따라 바뀐다
1. 세그먼트 `S3 시점` 을 누르면 `frame` 1000ms 로 정사영상 bounds(`namwon_2504.bounds`) 로 내려간다(z ≈ 16). 결과 폴리곤(2,098 중 이 범위 안의 것)은 그대로 위에 남는다 — "이 필지가 4월엔 비어 있었고 6월엔 경작지로 판독됐다".
2. 하단 띠 = 연속 스크러버 `<input type="range" min="0" max="3" step="0.01">` + 눈금 4(`2025.04 · 06 · 08 · 10` · GSD 표기 `imagery.js gsd`) + 재생 버튼 1. 값 `e`(0–3 소수): 층 A = `IMAGERY[floor(e)]` · 층 B = `IMAGERY[ceil(e)]` 두 raster 소스/레이어를 `emd-fill` 앞에 두고 `raster-opacity` = `1 - frac` / `frac`(크로스페이드). 정수에서는 한 층만.
3. URL `?scene=s3&epoch=1.5` 로 `replaceState`(소수 기록) · 새로고침에 복원.
4. **재생 = 화면 유휴 1개**: 6s 에 0→3 왕복이 아니라 0→3 한 방향 진행 뒤 0 으로(주기 6s) · **정수 시점(변화 pair 경계 · `change.js`)마다 750ms 자동 정지** · 그때 HUD 에 `변화 지수(비지도) · ${pair.label} · ${stats.n}건 · 학습 결과 아님` 한 줄. 사용자가 스크러버를 잡으면 재생 정지.
5. 카메라가 정사영상 bounds 밖으로 나가거나 z < 12 면 띠 위에 `이 자리엔 정사영상이 없습니다 — 남원 농경지 0.62 km² 만 4시점` 한 줄 + 스크러버 `disabled`.
6. 키보드: 스크러버 포커스 ←/→ = ±0.25 · Home/End · `aria-valuetext="2025.06 → 2025.08 · 50 %"`.

### S6 스와이프 — 원본 ↔ AI 판독을 한 선으로 가른다
1. 세그먼트 `S6 스와이프`: 같은 정사영상 범위에서 **좌 = 원본 정사영상(현재 시점 · 결과 없음)** · **우 = 같은 영상 + 결과(청록)**. 구현은 XI맵 겹쳐보기와 같은 방식 — 지도 B 를 절대 배치로 겹치고 `clip-path: inset(0 0 0 var(--swipe))`(`map.css:33` 참조 · B 는 `jumpTo` 동기 · WebGL 컨텍스트 2개 = 예산 상한).
2. 핸들 1개(1px 흰 선 + 44px 그립 · 라운드 0) 드래그 → `--swipe` %(6–94 클램프) · ←/→ ±4 % · URL `?scene=s6&swipe=42`.
3. 좌·우 상단 라벨 `원본 · 2025.06 · 1.69 cm` / `AI 판독 · 경작지 · 비경작지` (14px 이상 · 흰 판 · 헤어라인).
4. 재생(유휴 1개)은 이 장면에서 **없다**(화면당 1개 규칙 — S3 의 재생만).

### 공통
- HUD 숫자는 전부 해설 동반(단위 · 범위 · 기준시점 — 법전 §5). 장식 숫자 0.
- 호버 180ms 물리 반응(세그먼트 4px 이동 · 브래킷 성장). 색만 바꾸는 호버 금지.
- `window.__spike = { state(), perf(), play(scene), setEpoch(e), setSwipe(pct) }` 테스트 훅. `perf()` 는 최근 장면 동안 rAF 프레임 간격 배열의 p95(ms) 와 `document.querySelectorAll('canvas').length`.
- 콘솔 오류 0(V-World 타일 `net::ERR_ABORTED` 류 제외).

## 테스트 (`tests/e2e/spike-ximap-signature.spec.mjs` · 세션 없이 `page.goto('proto/spikes/ximap-signature.html')`)

1. **S1**: `waitForFunction(() => window.__spike?.state().arrived, null, { timeout: 8000 })` → HUD 텍스트에 `2,098` · `필지` · phase 순서 기록(`MutationObserver` 로 `data-phase` 변화 배열 = `['sweep','lock','count','arrived']`).
2. **모션 프레임**: 로드 직후 100ms 간격으로 `page.screenshot()` 12장 → `shots/w0/E0-S/s1-frame-00.png …` · 연속 두 장의 `Buffer.equals` 가 false 인 쌍 ≥ 8(움직임 증명).
3. **락온**: 필지 중심 클릭 → 브래킷 요소 존재 → `getAnimations()` 지속 합 ≈ 380(±20) 또는 `data-lock` 타임스탬프 차.
4. **S3**: `__spike.play('s3')` → 스크러버 `fill('1.5')`/`setEpoch(1.5)` → URL `epoch=1.5` · `state().layers` = `{a:'namwon_2506', b:'namwon_2508', opA:0.5, opB:0.5}` · 재생 클릭 → 2s 뒤 `epoch` 증가 · 정수 시점에서 `paused` 750ms · 스크린샷 `s3-epoch-0..3.png` + `s3-epoch-0.5.png` `s3-epoch-2.5.png`.
5. **S6**: `__spike.play('s6')` → 핸들 드래그(`mouse.down/move/up`) → `--swipe` 변화 · `ArrowRight` +4 · 스크린샷 `s6-swipe-20.png` `50` `80`.
6. **법전**: 페이지의 `.spk *`(지도 라이브러리 내부 제외) radius/shadow/gradient/backdrop 0 · 14px 미만 0 · `ximap-signature.css` + `.js` 의 `ms` 숫자 집합 ⊆ {180, 380, 500, 750, 1000, 1250, 40, 60, 80, 120} · `cubic-bezier` 는 `(0.15,1,0.3,1)` · `(.22,1,.36,1)` 만 · `#FFB633` 은 락온 규칙 한 곳.
7. **성능**: `__spike.perf().p95 <= 20` (S1 · S3 재생 각 1회) · `canvas` ≤ 2.
8. **reduced-motion**: `page.emulateMedia({ reducedMotion: 'reduce' })` → 로드 1s 안 `arrived` · 프레임 12장 중 동일 쌍 ≥ 10.
9. **영상**: `test.use({ video: 'on' })` 인 별도 `describe` 1건이 S1 → S3 재생 → S6 를 8–10s 동안 조작 → 테스트 끝에 `testInfo.attachments` 의 webm 을 `shots/w0/E0-S/signature.webm` 으로 복사.
10. 콘솔 오류 0 · 폭 1280 · 1440 · 1920 캔버스 ≥ 90 %.

## 완료 기준

위 테스트 1–10 전부 녹색(`npx playwright test tests/e2e/spike-ximap-signature.spec.mjs --reporter=line`) + `shots/w0/E0-S/` 에 프레임 12 · S3 6 · S6 3 · webm 1 + 결과 문서에 **Craft 게이트 제출 묶음**(프레임 스트립 경로 · webm 경로 · perf 값 · 어떤 법전 값을 어디에 썼는지 표). Craft 비평가(Fable 5.1)는 이 묶음만 보고 '움직이는 화면인가' 를 판정한다 — 불합격이면 보고 금지, 다시.

## 돌릴 spec

`tests/e2e/spike-ximap-signature.spec.mjs`

## 금지

- 기존 파일 수정 0(`map-gl.js` 포함 — 부족하면 스파이크 안에서 직접 `map.addLayer`) · 제품 화면(`ximap.html` 등)에서 스파이크로 링크 · 3D(`setTerrain` · pitch > 0 · `fill-extrusion` — D22 보류) · 외부 CDN 추가(vendor 만) · 영상 생성 API · 지어낸 숫자(`results.js` `imagery.js` `change.js` 외 출처 0) · 앰버 상시 사용 · 지속값 임의 · 유휴 2개 이상 · 라운드/그림자/그라디언트/유리 · 스크린샷만으로 완료 선언.
