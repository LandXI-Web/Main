# 프로토타입 브리프 — `landxi/proto/dive.html` "국토가 숨쉬는 지휘소" 증명

목적: 클라이언트가 "딱딱한 목업"이라 거부한 1차 구현을 대체할 **방향 증명용 단일 페이지**. 스펙이 아니라 감각을 판정받는다. 완성도 기준 = Awwwards SOTD 후보급 첫 30초. 목업·플레이스홀더·"이 자리에 들어갑니다" 절대 금지. 모든 픽셀이 실제 데이터·실제 영상이어야 한다.

## 반드시 읽을 것 (순서대로)
1. `docs/superpowers/research/2026-08-25-webgl-stack-feasibility.md` §0, §2, §3, §4.3, §5, §6.1, §7.3, §9, §11 — 검증된 스택·CDN 핀·함정
2. `docs/superpowers/proto/verified-stack-probe3.html` — 실제 브라우저에서 오류 0으로 검증된 통합 페이지. **여기서 시작해라** (복사 후 확장)
3. `docs/superpowers/research/2026-08-25-awwwards-interaction-grammar.md` — M01, M03, M08 스토리보드(라인 394–620), 이징 쿡북, 안티패턴 20개
4. `docs/superpowers/research/2026-08-25-cinematic-geo-references.md` — 방향 1·2, 안티패턴 7개
5. `docs/superpowers/research/2026-08-25-benchmark-palantir.md` — 디밍 필터, 시간 자동재생, 아이콘 muted 원칙, 100ms cubic-bezier(0.4,1,0.75,0.9)
6. `docs/superpowers/research/2026-08-25-benchmark-roboflow.md` — 신뢰도 슬라이더 라이브 필터, 검출 팔레트, 변화탐지 색문법
7. `docs/superpowers/research/2026-08-25-self-critique.md` §3 격차표 — 반복 금지 목록
8. Skills: `maplibre-terrain-patterns`, `maplibre-cartography`, `maplibre-tile-sources` (Skill 도구로 로드)

## 고정 스택 (변경 금지)
- MapLibre GL **5.6.0** (v6 금지 — deck.gl 파손), deck.gl 9.3.10 UMD, three 0.185.1 importmap, GSAP 3.15 (+ScrollTrigger), Lenis, SunCalc. 전부 CDN. 빌드 없음. `landxi/proto/` 안에 자체 완결 (기존 `assets/js/map/shell.js`는 쓰지 않아도 됨 — 프로토는 자유).
- 베이스 영상: 글로브/전국 = EOX Sentinel-2 cloudless (키 없음), 국토 z6–19 = V-World Satellite WMTS. 키는 `.env.local`의 `VWORLD_KEY` — `tools/serve.mjs`에 `/landxi/proto/env.js` 응답을 추가해 `window.VWORLD_KEY`로 주입(파일이 없으면 키 없는 `https://xdworld.vworld.kr/2d/Satellite/service/{z}/{x}/{y}.jpeg` 폴백). 키를 소스에 하드코딩하지 말 것.
- 라벨/도로/경계 = OpenFreeMap 벡터를 영상 위 오버레이(halo 필수 — cartography 스킬).
- 지형: Mapterhorn/AWS terrarium (`encoding:'terrarium'` 필수). **연출 구간에서만 ON**, 착지 후 OFF.
- AOI 정사영상: `landxi/assets/data/imagery.js` `IMAGERY`의 `namwon_2504/2506/2508/2510` (bounds 127.3481–127.3567 / 35.5276–35.5347, z12–19, webp), `kuksan_*`, `jeju_*`.
- 실탐지: `landxi/assets/data/geo/marine-debris.geojson` (5,000 polygons, `confidence` 0.51–1.0), `marine-debris-grid.geojson` (9,032 cells, `count`, `mean_conf`), `jeju-illegal.geojson`. `landxi/assets/data/services.js` `SERVICES` 13개(lnglat, count, lastRun, real).
- 서체: Gothic A1 900 (표시), IBM Plex Sans KR, IBM Plex Mono. 토큰: `landxi/assets/css/tokens.css` (`--lx #006DF7` CI 블루, `--ai #0FA9A0`, 상태색). 새 색이 필요하면 토큰으로 추가.
- 카피는 스펙 비전 문안 그대로: 모토 "LX 전 직원이 Geo-AI 전문가입니다", 비전 "범부처 AI 기반 국토정보 통합조사". 축: 노코드 · 워크플로우 기반 AI 모델 개발 · 전국단위 AI 실태조사.

## 구조 — 지도는 한 번만 만들고 절대 파괴하지 않는다
`#map` 풀스크린 고정. Lenis 스크롤 + GSAP ScrollTrigger의 **정규화된 단일 진행값 p∈[0,1]** 하나가 카메라·조명·레이어 투명도·타이포를 전부 구동한다(챕터 구간별 키프레임 보간, `map.jumpTo` 매 프레임). 휠을 멈추면 카메라도 멈춘다. 자동재생 없음(단, 4시점 타임라인은 예외).

### 챕터 1 · 궤도 (p 0–0.25) — "국토가 깨어난다"
- 프리로더: 워드마크가 위성 데이터 스트림처럼 한 글자씩 mono로 스캔되며 등장(1.2s), 실제 타일 프리페치 진행률을 보여준다(가짜 로딩 금지).
- 글로브 투영, EOX 위성 + 대기광(`setSky`/atmosphere-blend), SunCalc로 **현재 시각의 실제 터미네이터**(밤 쪽은 어둡게, 도시광 없음 OK). 카메라는 한반도가 터미네이터 근처에 오도록 초기 bearing.
- three.js CustomLayer: 위성 1(glTF — `assets/proto/models/`에 gltf-transform으로 최적화한 CC0 모델 또는 프로시저럴 박스+패널 메쉬), 궤도 링 1개만(점선 타원 3개 금지). 위성이 지구 자전과 반대로 천천히 움직인다.
- 타이포: 좌하단 Gothic A1 900 56px 모토 2행, 글자 단위 `from:"random"` 스태거 0.03, blur 14→0. 우측 상단 mono HUD: 실제 시각(KST)·위성 고도·한반도까지 거리(카메라 고도에서 계산).
- p 0.15–0.25: 글로브가 회전하며 한반도로 다가온다(zoom 1.4→4.5, pitch 0→30), 대기광이 강해지고 터미네이터가 화면 밖으로.

### 챕터 2 · 전국 점등 (p 0.25–0.5) — "전국이 켜진다"
- zoom 4.5→6.8, 글로브→mercator 자동 전환 구간. 한반도 실루엣이 명확해야 함(영상 자체 + 해안선 라인 레이어 `korea-outline.geojson`을 옅게).
- 13개 서비스가 `lastRun` 순으로 **스태거 점등**(deck.gl ScatterplotLayer 반경 애니메이션 + 링 1회 확산, 이후 정지). 실데이터 4개(marine·farmland·pothole·change)만 링이 한 번 더 뛴다. 라벨은 최근 4개만 리더선 없이 점 옆에 mono로(13개 라벨 금지).
- 우하단에 **타임라인 바**(2025-04 → 2026-08)가 스스로 재생(Palantir 방식)되며 점등을 이끈다. 스크롤을 멈추면 타임라인도 멈춘다.
- deck.gl ArcLayer: LX 전주 본사(127.15, 35.82) → 각 서비스로 호가 흐른다(TripsLayer trail 또는 ArcLayer 폭 애니메이션), 1.6s 동안, 이후 옅게 유지.
- 좌측 카피: "범부처 AI 기반 국토정보 통합조사" + 부처 칩 5개(농식품부·환경부·국토부·해수부·행안부)가 해당 서비스 점등과 동기화되어 켜진다.

### 챕터 3 · 남원 사면 강하 (p 0.5–0.8) — "1.5cm까지"
- 카메라 다중 키프레임(최소 5개): 전국(z6.8,p30) → 전북(z8.5,p45,b-15) → 지리산 서쪽 능선 위(z11,p68,b-35, **terrain ON**, exaggeration 1.4) → 남원 분지로 활강(z13.5,p62,b-20) → AOI 상공(z16,p40) → 정사영상 착지(z18.2,p0,b0, terrain OFF 크로스페이드). 이징은 구간별로 다르게(expo.inOut / power3.out), bearing이 계속 조금씩 드리프트한다.
- 지형 ON/OFF는 시각 튐 없이: 지형 켜기 직전 카메라 pitch가 이미 높고, 끄기는 착지 후 opacity 크로스페이드와 함께.
- V-World 위성 → 우리 정사영상 `namwon_2508` 크로스페이드(`raster-opacity` p 기반). 착지 시 HUD가 실제 메타로 갱신: GSD 1.54cm · 촬영 2025-08 · 좌표 · 축척(실계산 — 기존 `rulebar.js` 로직 재사용 가능).
- 착지 순간 "카메라 셔터" 대신 **스캔라인 1회**(CSS 그라디언트가 위→아래 0.8s)가 지나가며 챕터 4로 넘긴다.

### 챕터 4 · 증명 (p 0.8–1.0) — "AI가 본 것"
- 정사영상 위에 4시점 타임라인(2025-04/06/08/10)이 **자동 재생**(Palantir Playback: 각 시점 1.2s 정지, 마지막에 멈춤). 하단에 4장의 실제 썸네일 필름스트립(타일에서 캔버스로 캡처하거나 z15 타일 그대로) — 클릭하면 그 시점으로.
- 스와이프 핸들(`@maplibre/maplibre-gl-compare` 또는 자체 clip-path)로 2504 vs 2510 비교. 변화탐지 색문법은 **없는 데이터를 꾸미지 말 것** — 남원 4시점엔 탐지 결과가 없으므로 순수 영상 비교만.
- 우측 유리 패널(단 하나): "해양쓰레기 실탐지 38,057건 (전남)" — 클릭하면 카메라가 전남 신안 해안(125.9, 34.7)으로 2.2s 플라이(같은 지도!), `marine-debris-grid` 히트 → z14부터 `marine-debris` 폴리곤 5,000. **신뢰도 슬라이더(0.5–1.0)**가 `setFilter`로 실시간 필터, 옆의 카운트·히스토그램(작은 canvas)이 같은 프레임에 갱신. 필터 밖 폴리곤은 삭제가 아니라 디밍(opacity .12).
- 마지막 CTA 두 개: "로그인하고 시작하기" / "플랫폼 둘러보기" — 호버 시 자석 효과(lerp 0.12), 200ms 스냅백.

## 분위기 레이어 (CSS, 지도 위)
- 필름 그레인(SVG feTurbulence, opacity .05, 다크 챕터에서만), 비네트, 챕터 전환 시 아주 짧은 노출 플래시(120ms) 금지 — 대신 색온도 이행(챕터 1 새벽 5600K → 챕터 3 정오).
- `backdrop-filter` 패널은 동시 3개 이하. 블러 애니메이션 금지.
- 커서: 지도 위에서 작은 십자선 + 좌표 mono가 따라다님(lerp 0.16). 버튼 위에선 원으로.

## 성능·접근성
- 3단 티어: `full`(WebGL2 + 60fps 추정) / `lite`(지형·three 제거, deck만) / `still`(reduced-motion: 각 챕터 최종 프레임 정지 + 스크롤로 점프). 첫 2초 안에 rAF로 프레임 측정해 자동 강등. 티어를 우하단 mono로 표시.
- DPR 캡 1.5, `antialias:false`, `fadeDuration:0`.
- 키보드: ←/→ 챕터 이동, 슬라이더 포커스 링.
- 콘솔 오류 0. Playwright 스모크 1개: `tests/e2e/proto-dive.spec.mjs` — 페이지 로드 → 오류 0 → p를 4 챕터로 강제 세팅(`window.__dive.seek(p)`)해 각 챕터 스크린샷 `shots/proto/ch1..4.png` → 슬라이더 조작 후 카운트 감소 확인. 폴백(타일 차단) 상태에서도 페이지가 살아야 함.

## 산출물
- `landxi/proto/dive.html`, `landxi/proto/dive.css`, `landxi/proto/dive.js` (+ `camera.js`, `chapters.js`, `layers.js`, `hud.js` 등 책임별 분리), `landxi/proto/env.js`는 서버가 생성, `tools/serve.mjs` 수정, `tests/e2e/proto-dive.spec.mjs`, `shots/proto/*.png` + `shots/proto/dive.webm`(Playwright recordVideo 30초 스크롤 자동 재생).
- 커밋 메시지 한국어 + `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`. `.env.local` 커밋 금지.

## 판정 기준 (자가 채점 후 보고)
Palantir 체크리스트(벤치마크 문서 말미)·Roboflow 체크리스트·Awwwards 안티패턴 20개로 스스로 채점하고 점수와 근거를 리포트에 적을 것. 스스로 "예쁜 템플릿"이라 느끼면 완성이 아니다.
