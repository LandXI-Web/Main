# YouTube RDytbVDzMF4 정밀 분석 — "Claude Design FINALLY Solved Motion Graphics"

- **URL**: https://www.youtube.com/watch?v=RDytbVDzMF4
- **채널**: Jack Roberts (@Itssssss_Jack) — 테크 스타트업 매각 후 AI 스타트업/커뮤니티 운영
- **길이/해상도**: 16:31 (991초), 1920×1080 AV1
- **원본 자산**: `build/yt/RDytbVDzMF4.{mp4.webm,en.vtt,transcript.txt,info.json,description}`
- **프레임**: `shots/yt/RDytbVDzMF4/` 92장 (씬 전환 55개 + 11초 그리드, 최소 간격 6.5초) — **전량 육안 확인 완료**
- **분석일**: 2026-08-26 / 브랜치 `plan1-foundation`

---

## 0. 이 영상의 정체 — 한 문장

**"Claude Design이 만든 모션그래픽이 AI 슬롭으로 읽히지 않게 하는 5단계"** 를 다루는 워크플로우 튜토리얼이며, 겉보기 주제(모션그래픽)보다 **부수적으로 노출된 두 가지가 우리에게 훨씬 값지다**:

1. **화면 안의 실제 산출물** — 발표자가 Claude Design으로 만든 다크 에디토리얼 덱(`claude-motion-graphics/index-*.html`), 리포트 페이지(`rdf-chapter5.html`), 트랜스크립트 딜리버러블(`design-genius-transcript.html`), 로컬 "Claude Code OS"(메모리 3D 그래프 · 이미지 생성 갤러리). 이들이 **우리가 지금 만들고 있는 것과 같은 종류의 화면**이고, 몇몇은 우리 취향 프로필 §4/§5를 통과할 만한 완성도다.
2. **데이터 → 시각화 파이프라인** — Firecrawl `branding` 포맷으로 임의 URL에서 디자인 토큰(색·폰트·타이포·라운드)을 기계 판독 가능하게 추출하는 것, 로컬 Whisper로 워드레벨 타임스탬프를 뽑아 그것을 **시간 밀도 스트립**과 **모멘트 칩**으로 시각화하는 것.

주의: 영상의 **명시적 조언(레벨 1~3: 아이콘팩·Lottie·생성 이미지 붙이기)은 우리 취향 프로필 §3(거부 목록)과 정면충돌한다.** 아래 §6에 정리했다. 훔칠 것은 조언이 아니라 **화면**이다.

---

## 1. 타임스탬프 분해 (챕터 + 프레임 관찰)

| 시각 | 챕터 | 화면에서 실제로 본 것 |
|---|---|---|
| 0:00–0:26 | Stop Making Generic AI Slop | 콜드오픈: 다크 사이트에 3D 큐브가 회전하며 "LET'S DO IT" 글자가 면에 매핑됨. 좌측 세로 소셜 레일, 우하단 초대형 반투명 "08" 숫자. |
| 0:26–1:20 | How Claude Design Works | `claude.ai/design` — "What should we create?" 프롬프트 바 + **템플릿 12종**(Blank / Long-form explainer / Mobile app / Slides / Document / Wireframe / Animation / UI mockups / Résumé / **3D object** / Research / HTML email, 스크롤 시 Color+type pairing / Diagram / Flier 추가). 좌측 Design system 칩("Smash & Grab Design Sys…"), 모델 셀렉터 `Opus 5` → 후반부 `Fable 5`. |
| 1:20–2:22 | Animated Bar Chart With Real Data | 프롬프트에 **실수치를 직접 붙여넣음**("OpenAI is 700 and Claude is 595"). 산출: `?file=Varieties+and+Customers.dc.html` — 다크 바탕, 바 10개, 각 바 세로 그라디언트가 **인디고→마젠타→크림슨→오렌지 램프**를 순서대로 밟고, 바 상단 캡 안에 각 랩의 **로고 글리프(흰색 단색)**, 값 라벨은 바 고유 색조의 mono, 카테고리 라벨은 letterspaced mono, **격자선은 500/400 두 줄만**. 헤드라인 "Where every lab *actually* sits." 의 이탤릭 세리프 강조어에 **차트와 동일한 그라디언트가 텍스트 그라디언트로 적용**됨. |
| 2:05 | — | "Dial the style **in**" — 축·격자를 완전히 제거한 6바 버전. 최고값 바에만 발광. |
| 2:16 | Level 1 | "Same style, **every** chart" — 팔레트 5칩을 **`STYLE ASSET` 카드**로 코드화, 발광 테두리 + 점선 커넥터가 밖으로 뻗음. "이 스타일을 앞으로 모든 차트에 써라"라고 지시해 자산화. |
| 2:25–3:22 | 폰트 = 슬롭의 최대 원흉 | **같은 덱을 폰트만 바꿔 3벌 렌더**: `claude-motion-graphics-cotham.html`(Cotham, 지오메트릭 그로테스크) / `index-montserrat.html` / Poppins. 파일을 분리해 나란히 비교. |
| 3:22–4:08 | Scrape Any Site's Typography | **Firecrawl** `firecrawl.dev/app/.../playground?endpoint=scrape` → URL 투입 → `Format: Branding` 체크. 결과 탭 3개: **Markdown(−93% tokens 뱃지)** / **Branding** / **JSON**. Branding 출력 = Colors(primary `#0091FF`, secondary `#6647F0`, accent `#292D34`, background `#FFFFFF`, text primary `#202020`), Fonts(Plus Jakarta Sans / Inter / Roboto), Typography(primary·heading·h1 38px·h2 48px·body 12px), **Border Radius 12px**. 비용 **$0.22**. |
| 4:08–5:44 | 폰트 소스 | fontsinuse.com(실사용 사례 아카이브, 스크린샷을 그대로 Claude에 첨부) → fontshare.com(무료 100종, 웨이트/사이즈 슬라이더 라이브 프리뷰) → open-foundry.com → typewolf.com → Google Fonts. |
| 5:44–7:55 | Level 2 — 아이콘 | flaticon.com 팩 단위 다운로드(예: "Travel \| Gradient fill" 20 icons, SVG/EPS/PNG/PSD). **"프레젠테이션 하나당 스타일 하나로 고정"**. 산출: `Anatomy+of+a+Trip.dc.html` — 6×2 아이콘 타일 그리드, 각 타일은 라운드 사각 카드 + 아이콘 + letterspaced mono 캡션(FLY/PACK/PAPERS/SHOOT/PLAN/ORIENT/CLIMB/REST/SLEEP/DRIFT/SAIL/RETURN), 상단에 `▮ ANATOMY OF A TRIP` 오렌지 틱 키커. **하단에 타임라인 스크러버**: 눈금 2s/4s/6s + **이름 붙은 구간 `Snap · 2.0s` / `Focus · 3.2s` / `Out · 0.8s`**. |
| 7:55–9:42 | Level 3 — Lottie | lordicon / iconscout(1.3M Lottie) → **Lottie JSON 다운로드 → 로컬 라이브러리 리포지토리로 만들어 Claude에 통째로 넘김**. 라이선스(CC-BY 등) 확인 강조. 산출: `Reel+Story.dc.html` — **9:16 세로 릴 6페이지**. |
| 9:03–11:27 | Reel Story 해부 | 상단 3열 **머스트헤드** `AUG *2026 ‖ JACK ROBERTS ‖ AI SYSTEMS`(초소형 letterspaced mono). 섹션 키커 `01 · MOMENTUM`. 2행 헤드라인 + **이탤릭 세리프 강조어**("burning"/"ready"/"orbit"/"alien"). 이탤릭 부제 1줄. 중앙에 Lottie 1개 + **그 오브젝트 색조와 같은 라디얼 글로우**. 하단 `BACK ‖ 01 02 03 04 05 06 ‖ NEXT` 페이지네이션(활성 칩만 섹션 색조로 채움). 타임라인 구간명 `Launch·4s / Alone·4s / Orbit·4s / Outlier·4s / Dream·5s`, 총 25초. **섹션마다 액센트 색조가 다르다**(앰버/페리윙클/민트/크림슨). |
| 9:53–11:27 | AI-Generated Images | 로컬 `localhost:8083/design` — 자작 "Claude Code OS"의 Design 탭(BETA, Dieter Rams 인용). 매스너리 갤러리 + 하단 도크: 모델 `Nano Banana Pro`/`Nano Banana 2`, Reference 첨부, Still/Video 토글, 비율 칩 1:1·16:9, 해상도 1K·2K·4K, 장수 1·2·4·8, `THIS RUN 4 credits`. **생성 상세 패널이 결정적**: PROMPT(Copy) / Generation cost 2 credits("Quote saved at generation") / **PROVENANCE**: Model `nano_banana_pro`, Engine `Higgsfield`, Size 2048×2048px, Ratio 1:1, Quality 2k, File 11.2 MB, Created 11/08/2026 23:27:15 / 액션 Remix·Reference·Download·Copy for chat·Delete / **"Animate image — Use this as the opening frame"** / `BUILT IN /Users/jackroberts/.claude-os/design/generations`. |
| 6:14, 11:43 | (여담) 메모리 그래프 | `localhost:8083/memory` — **3D 포스 그래프**: "25 workspaces · 312 memory files · 0 vector indexes", 범례 Core/Workspace/Vector index/Stale + File/Decision/Session/Skill, **LOD 3단(MID / MICRO / FULL)**, Pause/Flow 토글, LINKS 밀도 슬라이더, 카운터 `Nodes 380 Edges 456 Recall 7d 12`, CTA "Enter the Brain". |
| 11:47–13:07 | Level 4 — 영상 투입 | 프롬프트: *"데스크톱에 방금 녹화한 영상이 있다. 전체 트랜스크립트를 뽑고 **RTF**(=워드레벨 타임스탬프)로 만들어 HTML 파일로 달라."* 산출 `design-genius-transcript.html`: 제목 + 메타 `Recorded 11 Aug 2026 · Part 1 ≈ 8 min · Part 2 ≈ 18.5 min · **transcribed locally with Whisper**`, Part 1/2 섹션, 그리고 **좌측 mono 타임스탬프 거터(`03:21`, 액센트색) + 우측 본문**의 2열 그리드. |
| 12:37 | Works On Any Video Source | "Point it anywhere" — YouTube / Desktop / Any file 3카드(각 카드 테두리가 항목 고유 색조, 라인 아이콘), 아래로 **점선 곡선 커넥터가 하나의 허브 노드로 수렴**. |
| 12:21 | — | "The video becomes **words**" — 프레임 필름스트립(5칸, 가운데만 실제 썸네일) + **오디오 파형 바 차트**(무채 바 사이에 인디고 바가 강세로 섞임) + 칩 `VIDEO`/`RECORDED`/`DESKTOP`/`TRANSCRIPT`(각각 다른 색조의 발광 아웃라인 pill). |
| 12:32 | — | "Claude can jump **anywhere**" — **수평 스테퍼 타임라인**: 노드 5개, 각 노드 아래 라벨 + **워드레벨 타임스탬프**(VIDEO 12:19.9 / RECORDED 12:20.9 / DESKTOP 12:21.6 / TRANSCRIPT 12:25.3 / RTF 12:27.4). 활성 노드만 채워지고 라벨이 볼드+컬러. |
| 13:07–16:18 | Level 5 — 스킬 자동화 | 프롬프트: *"스킬로 전체 트랜스크립트를 뽑고, **애니메이션이 값어치 있을 지점**을 찾아라. Firecrawl로 리서치해서 내가 말한 것을 뒷받침할 인사이트/통계를 채우고, 그 순간들에 대한 그래픽을 만들어 데스크톱에 저장하라."* 근거: **"대부분이 리서치 단계를 건너뛰어 부정확한 데이터를 만든다 → 인리치먼트 사이클이 필요하다."** |
| 15:10–16:18 | 산출물 = `rdf-chapter5.html` | **이 영상의 진짜 결론.** 아래 §2에서 따로 해부. |
| 16:18–16:31 | What's Next | 다음 영상 예고. |

---

## 2. `rdf-chapter5.html` 해부 — 우리가 만들 리포트의 참조 설계

로컬 `localhost:4340`에 서빙된 정적 HTML 한 장. 다크 에디토리얼. 섹션 4개로 구성된다.

**① 히어로** — 키커 `HERMES MASTERCLASS · CHAPTER 5`(letterspaced mono, 회색), 2행 헤드라인 "The video finds / its own *inserts*"(강조어만 이탤릭 세리프, 페리윙클), 부제 "Watch it, score it, draw the quiet parts.", 그 아래 3D 렌더 필름스트립 1개. 배경은 검정 + 아주 옅은 색조 라디얼.

**② THE SCAN — "24 minutes, *one bar*"** ← **이 영상 전체에서 가장 값진 한 컴포넌트**

24분짜리 영상 전체를 **가로 막대 하나**로 압축한다. 배경에는 낮은 무채 틱들이 촘촘히 깔려 발화 밀도를 만들고, 그 위에 **분류된 키 모멘트만 키 큰 컬러 틱**으로 솟는다. 축은 `00:00 / 06:00 / 12:00 / 18:00 / 24:23`. 범례는 4범주:

`● BUILT`(그린) · `● PROPOSED`(인디고) · `● HELD BACK`(앰버) · `● QUIET SCREEN`(그레이).

즉 **시간축 × 밀도 × 분류**를 한 줄에 담았고, 색은 4개뿐이며 값은 라벨이 아니라 위치로 읽힌다.

**③ THE BUILD — "The ministry, *drawn*"**

생성된 15초 인서트 영상을 인라인 플레이어로 임베드. 플레이어 하단 바에 **`05:31`(원본 영상에서의 출처 타임스탬프, 그린 mono) + `15S`(길이 뱃지) + 번호 붙은 비트 칩 3개**(`1 One question, three models` / `2 No one copies homework` / `3 Blind spots covered`), 현재 재생 중인 비트 칩이 하이라이트. 인서트 내부 장면도 확인됨: "One question, three models"(3개 광선이 수렴하는 3D), "Blind spots covered"(좌측 ANSWER ONE/TWO/THREE 리더선 → 중앙 발광 오브 → 우측 `FABLE 5 / MERGES IT` 배지).

**④ FOR THE NEXT ONE — "Three *numbers*"**

스탯 타일 3장인데 **셋 다 형태가 다르다**:

- `243` (인디고) / 우측 2행 mono 캡션 `WORDS / A MINUTE` / 하단 **미니 바 스파크라인**
- `13:44` (앰버) / `PLAYS ON A / STILL SCREEN` / **도넛 게이지 56%**
- `97` (코럴) / `REPEATS OF / FIVE PHRASES` / **랭크드 수평 바 리스트**(which is 33 / really 30 / cool 17 / basically 10 / fantastic 7)

그 위에는 모멘트 링크 칩 행(`13:29 The judge loop` / `18:10 Morning brief` / `20:57 Parallel tool calls` / `23:12 Hermes and Claude Code`).

**⑤ SOURCE — "The *transcript*"** — 타임스탬프 거터 2열 레이아웃, 현재 행만 배경 하이라이트.

**⑥ 콜로폰(푸터)** — 회색 1줄:

> *"Whisper timed it, ffmpeg scored it, every frame was checked by eye. Odd spellings belong to the machine."*

**방법론을 명시하고 오차의 출처까지 자백하는 한 줄.** 우리 §5-9("HUD의 모든 숫자가 해설인가")를 문장 단위로 구현한 사례다.

---

## 3. 프런트엔드 기법 → 우리 스택 이식

우리 스택: MapLibre GL JS 5.6 / deck.gl 9.3 / three 0.185 / 바닐라 JS / 정적 배포.

| # | 기법 (출처 프레임) | 우리 스택에서의 구현 | 난이도 | 대상 화면 |
|---|---|---|---|---|
| F1 | **원-바 시간 밀도 스캔 스트립** (f087) — 배경 무채 틱 = 밀도, 전경 컬러 틱 = 분류, 축 4점, 범례 4범주 | 순수 CSS/SVG. `<svg viewBox="0 0 1000 60">`에 `<rect>` 반복. 밀도 배열은 빌드타임 JSON. 클릭 시 `map.flyTo` 또는 시간 슬라이더 `t` 갱신 — **차트가 곧 컨트롤**(§5-8) | **낮음** | `dive.html` 시간 스크러버 교체, `dashboard.html` |
| F2 | **이름 붙은 비트 타임라인** (f042, f053) — `Snap·2.0s / Focus·3.2s / Out·0.8s`, `Launch·4s…Dream·5s` | 카메라 시퀀스를 `[{name:'궤도',ms:1250},{name:'돌파',ms:1000},…]` 배열로 선언하고 `camera.js`가 그것만 재생. 눈금·구간명을 화면 하단에 노출 → **연출이 자기 자신을 설명한다** | **낮음** | `js/camera.js`, `dive.html` |
| F3 | **워드레벨 스테퍼 타임라인** (f071) — 노드 + 라벨 + `12:19.9` 소수점 타임스탬프, 활성 노드만 채움 | 4시점(2504/2506/2508/2510)을 노드로. 노드 간 선은 SVG, 라벨은 Inter tabular. 활성 노드만 LX 블루 채움 + 라벨 볼드 | **낮음** | `dive.html` 변화탐지, `dashboard.html` |
| F4 | **드래그 리빌 비교 슬라이더 + 양끝 코너 마이크로 라벨** (f046–f048) — `WHAT YOU SEARCHED FOR` ↔ `WHAT YOU GENERATED`, 핸들이 액센트 색 | 이미 `js/swipe.js` 존재. 추가할 것은 **양끝 하단 mono 캡션**(`2025-04 · 원본` / `2025-10 · 탐지`)과 상단 `▮ TRY IT` 키커, 우상단 힌트 `drag across`. §4의 "캡션 `장소 · 날짜`" 규칙과 정확히 일치 | **낮음** (증분) | `js/swipe.js`, 변화탐지 판 |
| F5 | **강조어 그라디언트 = 차트 램프** (f012, f013) — 헤드라인 이탤릭 강조어의 텍스트 그라디언트가 차트 색 램프와 동일 | `background:linear-gradient(...); -webkit-background-clip:text`. **단, 우리 §4는 액센트 1색이므로 램프가 아니라 LX 블루 단색.** 그라디언트 자체는 §4에서 금지 → **강조어는 색만 바꾸고 이탤릭 세리프로** 대체 | **낮음** | 전 화면 헤드라인 |
| F6 | **3열 머스트헤드** (f053) — `AUG *2026 ‖ JACK ROBERTS ‖ AI SYSTEMS` 초소형 letterspaced mono | `display:grid; grid-template-columns:1fr auto 1fr`. 우리 버전: `2026-08 ‖ LAND-XI ‖ 남원 · 정사영상 4시점`. 흰 종이 위 `#686868` | **낮음** | `atlas.js` 페이지 헤더, `dashboard.html` |
| F7 | **타임스탬프 거터 2열 트랜스크립트** (f074, f091) — `grid-template-columns: 4.5rem 1fr`, 좌측 mono 액센트, 현재 행 배경 하이라이트 | 변화 이벤트 로그/탐지 로그를 같은 형태로. `04:12` 자리에 `2025-06-14`. 행 호버 시 지도에서 해당 폴리곤 락온(§5-3 물리적 반응) | **낮음** | `js/results.js`, `js/detect.js` |
| F8 | **형태가 서로 다른 스탯 타일 3종** (f090) — 스파크라인 / 도넛 게이지 / 랭크드 바, 각각 거대 숫자 + 2행 mono 캡션 | §3-1(균일 카드 그리드 금지)의 정답. 124px 숫자(§4) + 우측 정렬 2행 캡션 + **타일마다 다른 차트 형태**. 도넛은 SVG `stroke-dasharray` 스윕으로 "도착"(§5-5) | **중간** | `db-charts.js`, `dashboard.html` |
| F9 | **범주별 발광 아웃라인 pill 칩** (f070, f088) — 항목마다 다른 색조, 활성만 채움, 번호 접두 | 우리는 색조 다양화 금지 → **활성만 LX 블루, 비활성은 `#DDD` 헤어라인**. 번호 접두(`1 ` `2 `)는 유지 | **낮음** | 전 화면 필터/레이어 칩 |
| F10 | **로고/글리프를 바 캡 안에 삽입** (f012) — 값 라벨은 바 밖 위, 아이덴티티는 바 안 | 13개 서비스 막대에서 서비스 픽토그램을 막대 캡 안에 흰 단색으로. 범례 제거 효과 | **중간** | `db-charts.js` |
| F11 | **격자선 2줄만 + 축 제거** (f012→f013 진화) | `db-charts.js`에서 축·격자를 헤어라인 2줄로 축소. §4 "데이터 잉크만"과 동일 | **낮음** | 모든 차트 |
| F12 | **호버 시 그라디언트 히트업 + 글로우** (f083→f084) — 바 하나만 밝아지고 발광 | 우리 규칙: 180ms `cubic-bezier(.22,1,.36,1)`, **색만 바꾸면 실패(§5-3)** → 캡이 2px 솟고 헤어라인이 코너 브래킷으로 바뀌는 식의 물리적 반응 추가 | **낮음** | 모든 차트/타일 |
| F13 | **3D 포스 그래프 + LOD 3단 + 링크 밀도 슬라이더 + 라이브 카운터** (f035, f067) — `Nodes 380 Edges 456`, MID/MICRO/FULL, Pause/Flow | deck.gl `ScatterplotLayer` + `LineLayer`, 또는 three로 직접. LOD는 노드 필터 임계값. **우리 맥락에서는 지식그래프가 아니라 "13 서비스 ↔ 실제 결과" 관계망**. 다만 §2.2에 따라 **메인에서는 제외**하고 별도 화면으로 | **높음** | 별도(보류) |
| F14 | **점선 곡선 커넥터로 허브 수렴** (f072, f075) — 입력 3개 → 허브 1개, SVG 점선 베지어 | `<path stroke-dasharray>` + `stroke-dashoffset` 애니메이션으로 "흐름". §4 "결손은 무채, 예측은 점선 고스트"와 어휘가 맞음 | **낮음** | `system.html`, 파이프라인 설명부 |
| F15 | **파일 분리 폰트 A/B 하네스** (f015, f016) — `index-montserrat.html` / `-cotham.html` / Poppins를 각각 빌드해 나란히 비교 | `tools/serve.mjs`에 `?font=suit|pretendard|inter` 쿼리로 `v3-tokens.css` 변수만 스왑. 또는 `tools/_shots.mjs`로 3벌 캡처 후 병치 | **낮음** | `v3-tokens.css`, `tools/` |
| F16 | **9:16 세로 릴 아트보드를 같은 캔버스에서** (f053–f066) — 6페이지 + BACK/NEXT + 페이지 인디케이터 | 발표/공유용 세로 요약. `aspect-ratio:9/16` 컨테이너 + 스크롤 스냅 | **중간** | 별도 공유 자산 |
| F17 | **스크롤 스냅 섹션 덱 + 우측 진행 도트** (f006 이후 전편) — 도트 6개, 활성만 액센트 채움 | `scroll-snap-type:y mandatory` + `IntersectionObserver`. **주의: §2.1 "페이지 전환이 아니라 카메라 이동"** — 스냅 덱은 아틀라스 악장(서사)에만 쓰고 지도 뷰에는 쓰지 말 것 | **낮음** | `atlas.js` |
| F18 | **프로비넌스 카드** (f064) — Model/Engine/Size/Ratio/Quality/File/Created + 온디스크 경로 + Copy·Download·Remix | **우리 판에 그대로 이식**: `센서 / GSD 0.10m / 촬영 2025-10-14 / 좌표계 EPSG:5186 / 파일 namwon_2510.tif 1.2GB / 모델 v3`. §5-9(모든 숫자가 해설인가)를 만족시키는 정식 컴포넌트 | **낮음** | `js/plate.js`, `js/sources.js` |
| F19 | **오디오 파형 밀도 바** (f070) — 무채 바 사이 강세 바만 컬러 | 시계열(월별 변화 면적)을 같은 형식으로. 임계 초과 월만 앰버 | **낮음** | `db-charts.js` |
| F20 | **`STYLE ASSET` 토큰 칩 카드** (f014) — 팔레트 5칩 + 라벨, 발광 테두리, 점선 커넥터가 밖으로 | `system.html`(디자인 시스템 시트)에 v3 토큰 카드로. 다만 발광→헤어라인 프레임으로 치환 | **낮음** | `system.html` |

---

## 4. 데이터/AI 노하우 → 우리 파이프라인 이식

| # | 노하우 | 우리 적용 | 난이도 |
|---|---|---|---|
| D1 | **Firecrawl `branding` 포맷** — 임의 URL → `{colors:{primary,secondary,accent,background,textPrimary}, fonts:[…], typography:{h1,h2,body}, borderRadius}` 를 기계 판독 JSON으로. 마크다운 모드는 HTML 제거로 **토큰 93% 절감, 1건 $0.22** | **벤치마크 사이트(Vantor / All4Land / Planet / Palantir)의 실측 토큰을 추정이 아니라 값으로 확보.** 지금 `2026-08-25-benchmark-vantor.md`의 "Vantor 실측"을 재검증·보강할 수 있다. 산출을 `docs/superpowers/research/tokens/*.json`으로 커밋 | **낮음** |
| D2 | **"리서치 단계를 건너뛰면 부정확한 데이터가 나온다 → 인리치먼트 사이클"** — 시각화 전에 리서치 에이전트가 수치의 출처를 채운다 | 우리 §3-6(가짜 숫자 금지)의 실행 절차판. **모든 화면 수치는 `sources.js`에 `{value, unit, asOf, source, method}` 5필드가 없으면 렌더 금지**로 규칙화 | **낮음** |
| D3 | **로컬 Whisper 워드레벨 타임스탬프(RTF) → HTML 딜리버러블** — mp4를 로컬 전사, 파트 분할, 워드-타임 매핑 파일 별도 저장 | 우리 대응물: **탐지 결과를 폴리곤-타임 매핑으로 저장**. `results.js`가 `{polygonId, t, bbox, conf}`를 갖고 있으면 F1 스트립·F3 스테퍼·F7 거터가 전부 같은 소스에서 나온다. **하나의 타임인덱스 → 여러 시각화**가 이 영상 전체의 구조적 교훈 | **중간** |
| D4 | **"애니메이션이 값어치 있는 순간을 찾아라"** — 스크립트를 스캔해 그래픽이 필요한 지점을 스킬이 스스로 고른다 | 우리 버전: **변화량 시계열에서 "사건"(급변 구간)을 자동 검출해 카메라 비트를 생성**. §2 "탐지의 사건화"의 자동화. 임계 초과 구간만 F2의 이름 붙은 비트로 승격 | **중간** |
| D5 | **분류 스킴을 4범주로 고정** (BUILT / PROPOSED / HELD BACK / QUIET SCREEN) | 우리도 **4범주 이상 만들지 말 것**. 예: `탐지 / 변화 / 무변화 / 결손`. §4 "액센트 1개"와 결합하면 색은 블루·앰버·무채·점선 4개면 끝 | **낮음** |
| D6 | **비용·출처를 산출물에 각인** ("Quote saved at generation", `BUILT IN /Users/…/generations`) | 처리 산출물마다 **생성 시점·엔진·경로를 파일 옆 사이드카 JSON**으로. `build/`의 GDAL 산출물에 이미 적용 가능 | **낮음** |
| D7 | **콜로폰 한 줄** ("Whisper timed it, ffmpeg scored it, every frame was checked by eye.") | 모든 리포트/대시보드 푸터에 **방법 1줄 + 오차 귀속 1줄**. 예: *"GDAL이 정합했고, 모델 v3이 판정했으며, 폴리곤은 사람이 눈으로 확인했다. 좌표 오차는 원본 정사영상에 귀속된다."* | **낮음** |
| D8 | **디자인 시스템을 프롬프트 1급 시민으로** (Design system 칩 상시 부착) | `docs/superpowers/specs/2026-08-25-client-taste-profile.md` + `v3-tokens.css`를 **모든 화면 작업의 고정 첨부**로. 이미 하고 있으나 스킬로 강제 | **낮음** |

---

## 5. 지금 훔칠 것 — Top 5

1. **원-바 시간 밀도 스캔 스트립 (F1)** — "24 minutes, one bar". 남원 4시점(2504→2510)의 변화 밀도를 막대 하나로 압축하고, 임계 초과 구간만 앰버 틱으로 솟게 한 뒤, **클릭하면 그 시점으로 지도 카메라가 이동**하게 한다. 저비용·고임팩트이며 §5-8(차트와 슬라이더 동기화)을 한 컴포넌트로 만족시킨다. → `dive.html`
2. **프로비넌스 카드 (F18)** — 모든 판(plate) 옆에 `센서 · GSD · 촬영일 · 좌표계 · 파일 · 모델버전`. §3-6과 §5-9를 동시에 해결하는 가장 값싼 신뢰 장치. → `js/plate.js`
3. **이름 붙은 비트 타임라인 (F2)** — 카메라 시퀀스를 `Snap 2.0s / Focus 3.2s / Out 0.8s` 처럼 **선언·명명·노출**. §4의 500/750/1000/1250ms 사다리를 코드가 아니라 **데이터**로 만들면 연출을 튜닝할 수 있게 된다. → `js/camera.js`
4. **Firecrawl `branding` 추출 (D1)** — Vantor·All4Land·Planet의 실제 토큰을 값으로 확보해 §4 "Vantor 실측 기반"을 문자 그대로 실측으로 승격. 1건 $0.22. → `docs/superpowers/research/tokens/*.json`
5. **형태가 다른 스탯 타일 3종 (F8) + 콜로폰 (D7)** — §3-1(균일 그리드 금지)을 정면 돌파하는 레이아웃 + 방법을 자백하는 푸터 1줄. 대시보드 첫 화면의 인상을 "관리 툴"에서 "리포트"로 바꾼다. → `dashboard.html`

---

## 6. 하지 말 것 (이 영상의 조언 중 우리에게 독인 것)

1. **다색 그라디언트 램프(인디고→마젠타→크림슨→오렌지)** — 영상의 시그니처지만 우리 §3에서 "무지개 히트맵·보라→파랑 그라디언트는 즉시 AI 슬롭으로 읽힘"으로 이미 폐기된 것. **차용 금지.** 액센트는 LX 블루 1색, 탐지 순간만 앰버.
2. **Flaticon/Lottie 팩을 통째로 붙이기 (레벨 2·3)** — 여행 이모지풍 그라디언트 아이콘은 지오-AI 플랫폼의 신뢰도를 정확히 반대 방향으로 민다. 우리 오버레이 어휘는 §4대로 **헤어라인 벡터 · 코너 브래킷 · 캡션**뿐이다.
3. **Nano Banana / Higgsfield 생성 이미지를 콘텐츠로 사용** — 우리는 **실측 정사영상이 자산**이다. 생성 이미지는 §5-1(첫 프레임에 실제 영상 사진 60% 이상)을 정면으로 위반한다. 프로비넌스 카드 UI는 훔치되 생성 이미지 자체는 쓰지 않는다.
4. **발광 테두리 / 네온 글로우 카드** — Reel Story·Instagram 카드의 마젠타 글로우 아웃라인. §4는 "그림자·라운드 0, 유리 금지". **글로우 → 헤어라인 프레임으로 치환.**
5. **섹션마다 액센트 색을 바꾸기** — 영상은 레벨별로 코럴/페리윙클/민트/핑크를 돌린다. 우리는 §4대로 **단색 + 액센트 1**. 섹션 구분은 색이 아니라 **바탕의 하드 반전(#FFFFFF ↔ #010102)** 으로.
6. **스크롤 스냅 덱을 지도 뷰에 적용** — §2.1은 "페이지 전환이 아니라 카메라 이동". 스냅 덱은 아틀라스(서사) 구간 한정.
7. **Poppins/Montserrat 계열 도입 검토** — 영상은 이 둘을 슬롭 탈출책으로 제시하나, 우리 §4는 **SUIT 500 / Pretendard 400 / Inter tabular 확정**. 흔들지 말 것. (다만 F15의 **A/B 하네스 방법론**은 유효.)
8. **"3D object" 템플릿류의 장식적 3D 렌더** — 필름스트립 3D 렌더 같은 장식 오브젝트는 §3-1·§5-1 위반.

---

## 7. 취향 프로필 적합성 판정

**§2 (공통분모)와의 관계** — 이 영상은 우리 §2의 "위성영상을 사진으로 다룬다"·"한 대의 연속 카메라"에는 기여하지 않는다(지도가 없다). 그러나 **"탐지의 사건화"**(→ F1의 컬러 틱이 솟는 순간, F12의 호버 히트업), **"숫자는 mono, 큰 제목은 굵고 짧게"**(→ 전 화면이 정확히 그 규칙), **"절제된 색"**(→ 위반. 반면교사)에 강하게 걸린다. 특히 §2 "데이터 저널리즘 톤"의 실물 사례가 `rdf-chapter5.html`이다: 키커 → 짧은 헤드라인 → 이탤릭 한 줄 → 증거 → 콜로폰.

**§2.2 (흰 바탕 정정)와의 관계** — 영상 산출물은 전부 다크다. 그대로 쓰면 §2.2 위반. **구조는 가져오되 명도를 반전**해야 한다: 검정 위 컬러 틱 → **흰 종이 위 무채 틱 + LX 블루 강세 틱**. 헤어라인은 `#DDD`, 라벨은 `#686868`. 유일하게 어두워도 되는 곳은 판(plate) 안이며, F1 스트립은 판 아래 흰 바탕에 놓는 것이 맞다.

**§4 (서체·색·모션 v3)와의 관계** — 서체 규율은 방향이 같다(단일 굵기, mono 숫자, letterspaced 마이크로 라벨). 색은 **정면 충돌**(다색 램프). 모션은 **영상 쪽이 더 나은 점이 하나 있다**: 우리 §4는 이징·지속을 값으로 고정했지만 **비트에 이름이 없다.** F2를 도입하면 `cubic-bezier(0.15,1,0.3,1)` 1250ms가 아니라 "**하강 1250ms**"가 되고, 이는 튜닝과 리뷰를 가능하게 한다. §4에 **"모션 비트는 명명하고 화면 하단에 노출한다"** 를 1줄 추가 제안.

**§5 (판정 규칙 10+1)와의 관계** — 영상 산출물을 §5로 채점하면:

- §5-1(실영상 60%) **불합격** — 생성 아트가 주인공
- §5-2(유휴 시 실데이터 움직임) **부분 합격** — 타임라인 자동 재생은 있으나 실데이터 구동은 아님
- §5-3(물리적 호버) **합격** — 바 히트업+글로우, 칩 활성화
- §5-4(카메라 이동) **해당 없음**
- §5-5(도착 사건) **합격** — 카운트업·스윕
- §5-6(단색+액센트1) **불합격**
- §5-7(짧고 굵은 헤드라인) **합격** — "24 minutes, one bar"는 우리 "부처는 다섯, 영상은 하나다"와 같은 문형
- §5-8(차트↔슬라이더 동기) **합격** — 스캔 스트립·비트 칩이 곧 컨트롤
- §5-9(모든 숫자가 해설) **최고점** — 프로비넌스 카드 + 콜로폰
- §5-10(화면당 움직이는 요소 1개) **합격** — 릴 각 페이지에 Lottie 1개뿐

결론: **§5-9와 §5-8에서 우리보다 앞서 있고, §5-1·§5-6에서 뒤처져 있다.** 정확히 그 두 축만 가져오면 된다.

---

## 8. 설치·도입할 도구/스킬

| 대상 | 용도 | 판단 |
|---|---|---|
| **Firecrawl** (firecrawl.dev) — `scrape` + `format: branding` | 벤치마크 사이트 디자인 토큰 실측 추출. `/v2/scrape` API, `formats:["markdown","branding","json"]`. 1건 ≈$0.22 | **도입 권장.** Vantor/All4Land/Planet 3건만 뽑아도 §4의 "실측" 주장이 증거를 얻는다 |
| **Whisper (로컬)** | 우리는 yt-dlp 자막을 쓰지만, **워드레벨 타임스탬프**는 자막으로 안 나온다. `faster-whisper` + `word_timestamps=True`를 `yolo` env에 설치하면 향후 영상 벤치마크에서 D3 수준의 인덱스 확보 | **선택.** 현재 vtt로 충분하나, 정밀 벤치마크가 늘면 도입 |
| **자체 스킬 `landxi-plate-provenance`** | F18 프로비넌스 카드를 생성하는 스킬. GeoTIFF 경로를 주면 `gdalinfo`로 GSD·EPSG·크기를 뽑아 캡션 HTML을 반환 | **직접 작성 권장.** `yolo` env의 GDAL이 이미 있음 |
| **자체 스킬 `landxi-scan-strip`** | 시계열 배열 → F1 SVG 스트립 생성기. 4범주 고정, 흰 바탕/무채 틱/LX 블루 강세 | **직접 작성 권장** |
| **fontsinuse.com / fontshare.com / open-foundry.com / typewolf.com** | 서체 리서치 소스. 우리는 SUIT/Pretendard/Inter 확정이므로 **당장 불필요**, 향후 국문 디스플레이 대안 탐색 시 참조 | 북마크 |
| **flaticon / lottiefiles / iconscout / lordicon / Higgsfield** | 아이콘·Lottie·생성 이미지 | **도입하지 않음** (§6-2, §6-3) |
| **Claude Design 자체** | `.dc.html` 아트보드, 타임라인 스크러버, 디자인 시스템 칩 | 참고. 우리는 정적 HTML 직접 작성이 요구사항이므로 산출물이 아니라 **UI 패턴만** 차용 |

---

## 9. 다음 액션 제안 (우선순위)

1. `dive.html`에 **F1 스캔 스트립**을 흰 바탕 버전으로 구현하고 시간 슬라이더와 결선 — 가장 큰 인상 변화 대비 최저 비용
2. `js/plate.js`에 **F18 프로비넌스 캡션** 추가 — `gdalinfo` 값 그대로, 장식 숫자 금지
3. `js/camera.js`를 **F2 명명 비트 배열**로 리팩터 + 하단 눈금 노출
4. `dashboard.html` 상단을 **F8 3종 이형 스탯 타일 + F6 머스트헤드 + D7 콜로폰**으로 교체
5. Firecrawl로 벤치마크 3사 토큰 추출 → `docs/superpowers/research/tokens/` 커밋 → §4 실측 근거 갱신

---

## 10. 언급된 외부 리소스 전량

| 리소스 | URL | 성격 | 우리 판단 |
|---|---|---|---|
| Claude Design | claude.ai/design | 아트보드 기반 디자인 생성 (`.dc.html`), 템플릿 15종, 디자인 시스템 첨부, 타임라인 스크러버 | 패턴 참고 |
| Firecrawl | firecrawl.dev | 웹 스크레이핑 (markdown / **branding** / json), 토큰 93% 절감 | **도입** |
| LottieFiles | lottiefiles.com | Lottie JSON 라이브러리 | 미도입 |
| IconScout | iconscout.com | Lottie 1.3M + 3D 아이콘 + 일러스트, MP4/JSON 다운로드 | 미도입 |
| Lordicon | lordicon.com | 애니메이션 아이콘 | 미도입 |
| Flaticon | flaticon.com | 아이콘 팩 (SVG/EPS/PNG/PSD), 유료 ≈$8/월 | 미도입 |
| Fonts In Use | fontsinuse.com | 실사용 타이포그래피 아카이브 34,281건 | 북마크 |
| Fontshare | fontshare.com | 무료 서체 100종, 라이브 프리뷰 | 북마크 |
| Open Foundry | open-foundry.com | 오픈소스 서체 큐레이션 | 북마크 |
| Typewolf | typewolf.com | 서체 조합 레퍼런스 | 북마크 |
| Google Fonts | fonts.google.com | 무료 서체 | 기 사용 |
| Higgsfield | (제휴 링크) | 이미지/영상 생성 엔진 — Nano Banana Pro / Nano Banana 2 백엔드 | 미도입 |
| Mobbin | mobbin.com | UI/UX 레퍼런스 라이브러리 (스폰서 배너로 노출) | 북마크 |
| ClickUp | clickup.com | Firecrawl 데모 대상 사이트 | — |
| Glaido | (제휴 링크) | 영상 스폰서 | — |

*(제휴/스폰서 링크는 `bit.ly` 단축 URL로 제공되어 최종 목적지 확인 불가. Higgsfield·Glaido·Firecrawl 링크가 여기 해당.)*

---

*작성: 2026-08-26 · 원본 영상 991초 전량 · 키프레임 92장 육안 확인 · 트랜스크립트 522행 전문 독해 · 프레임은 `shots/yt/RDytbVDzMF4/`, 원자산은 `build/yt/`에 보존.*
