# 영상 분석 — "Claude Design Just Solved its #1 Problem" (Jack Roberts)

- **URL**: https://www.youtube.com/watch?v=cM5n9priMjo
- **채널**: Jack Roberts (@Itssssss_Jack) — AI 스타트업 빌더, "AI Automations by Jack" 커뮤니티 운영
- **길이**: 20:14 · 1080p · 영어(자동자막)
- **수집물**: `build/yt/cM5n9priMjo.mp4.webm`, `.description`, `.transcript.txt`(타임스탬프 텍스트), `build/yt/crops/`(원해상도 확대 캡처), 프레임 164장 `shots/yt/cM5n9priMjo/`(장면전환 83 + 15초 간격 81), 컨택트시트 19장 `build/yt/sheets_cM5n9priMjo/`
- **분석 일자**: 2026-08-26 / 브랜치 `plan1-foundation`

---

## 0. 한 줄 요약과 우리에게 갖는 의미

이 영상은 "AI로 예쁜 화면 하나 만들기"가 아니라 **"한 번 잘 나온 디자인을 재현 가능한 자산으로 고정하는 법"** 을 다룬다. 화자의 표현으로 "the consistency problem" — 열 번 시키면 열 개의 다른 브랜드가 나오는 문제다. 해법은 두 단계뿐이다. ① 디자인 루프(다중 비평가 서브에이전트)로 한 개를 진짜 좋게 만든다 ② **왜 좋은지를 측정 가능한 규칙 파일로 코드화(codify)** 해서 스킬로 저장한다.

Land-XI 개편에 이게 중요한 이유는 명확하다. 우리는 이미 `docs/superpowers/specs/2026-08-25-client-taste-profile.md`에 §4(서체·색·모션 v3)와 §5(판정 규칙 11개)를 갖고 있다. 즉 **우리는 이미 이 영상이 말하는 "규칙 파일"을 절반쯤 썼다.** 이 영상이 추가로 주는 것은 (a) 그 규칙 파일에 무엇이 빠졌는지에 대한 체크리스트(비율·거절·부재·명명된 레이아웃), (b) 규칙을 **자동으로 검증**하는 3-비평가 루프 구조, (c) 규칙 파일 자체를 **화면으로 만들어 클라이언트에게 파는 법**(디자인 시스템 페이지) 이다. 세 번째가 우리 `landxi/proto/system.html`(컴포넌트 시트)과 정확히 같은 자리를 노린다.

동시에 이 영상은 우리 취향 프로필의 **거부 목록에 정면으로 걸리는 것들**도 많이 들고 있다(마스코트 캐릭터, 듀오링고식 파스텔, 무료 폰트 잔치, 만화풍 삽화). 그래서 아래에서 "훔칠 것"과 "하지 말 것"을 분명히 갈랐다.

---

## 1. 정체 — 무엇을 만들고 어떻게 만드는가

화자는 세 레벨의 결과물을 만든다.

| 레벨 | 결과물 | 참조 원본 | 사용 도구 |
|---|---|---|---|
| 1 | AI 컨퍼런스 포스터 "FRONTIER SUMMIT" | Savee에서 고른 스튜디오 명단 포스터(주황 바탕 + 이름 리스트) | Claude Design + design-loop 스킬 |
| 2 | "Neuro — The Fun Way to learn AI" 웹사이트 | Duolingo(duolingo.com) — Refero의 DESIGN.md 경유 | Claude Code + Higgsfield CLI(이미지·비디오) + 자체 카피 시스템 |
| 3 | Vox 스타일 10초 모션 그래픽(잉글리시 스프링거 스패니얼) | Vox 유튜브 상어 크기 비교 클립 | Claude + Higgsfield + Fish Audio(내레이션·효과음) |

그리고 영상의 내레이션 화면 전부가 **직접 만든 로컬 HTML 프레젠테이션**(`file:///Users/jackroberts/Desktop/claude-design-consistency.html`)이다. 이게 영상에서 배울 게 가장 많은 물건이다 — §3에서 따로 다룬다.

### 언급된 URL / 제품 (전부 확인)

- **Claude Design** (`claude.ai/design`) — 캔버스형 디자인 도구. 홈이 "What should we create?" 한 줄 + 포맷 타일 그리드(Blank / Long-form explainer / Mobile app design / Slides / Document / Wireframe / Animation / UI mockups / Rebrand / 3D object / Research / HTML email …), 하단에 최근 프로젝트 테이블(Bakery growth analysis, Free fire animation graphic, Motion graphic animation request, Claw motion graphics showcase). 모델 드롭다운에 "Fable 5", "Opus 5", 노력도 "Medium".
- **Savee** (`savee.com`) — 디자이너용 이미지 북마크 서비스. 벽돌형 무한 그리드, 카드 호버 시 Save 버튼만 노출. 화자는 여기서 원본 포스터를 저장/스크린샷해 참조로 쓴다. 실제 참조원본은 `savee.com/ProELOh` — 주황 바탕에 스튜디오 이름(Arquette, Autoban, Coco Flip, Cult, Design by Them, Didier, Fritz Hansen, Great Dane, Hay, Herman Miller, Jason Miller, Luca Nichetto, Manuel Aires Mateus, Mutto, Ross Gardam, SP01, Studioilse, Tom Dixon, Trit, Vitra)이 밑줄과 함께 좌정렬로 쌓인 라인업 포스터.
- **Refero Styles** (`styles.refero.design`) — 확인 결과 **"High-quality DESIGN.md examples for AI agents"**. 실제 제품 웹사이트 2,000+개의 디자인 시스템을 AI가 읽을 수 있는 형태로 추출해 둔 카탈로그. 탭이 `DESIGN.md / Tailwind v4 / CSS Variables / Design Tokens`이고 `Compact / Extended` 토글 + Copy 버튼이 있다. 토큰은 `| Name | Value | Token | Role |` 표 형식. 필터 칩: Light Canvas / Neo Brutal / Color Neon / Editorial Minimal / Bare Serif / Friendly Squish / Technical Sans / Futuristic. Cursor·Claude Code·Codex·v0·Lovable에 그대로 붙여 쓰라는 포지셔닝. Refero MCP(유료 베타)도 있음.
- **Higgsfield** (`higgsfield.ai`) — "AI IMAGE GENERATOR BUILT FOR PROFESSIONALS". 여러 이미지/비디오 모델(Nano Banana Pro 등)을 한 곳에서 쓰고, **MCP 커넥터 + CLI**로 Claude/ChatGPT/Cursor/OpenClaw에 붙인다("HIGGSFIELD MCP & CLI FOR ANY AI"). 3단계 안내: 커넥터 URL 복사 → Claude Customize에 붙여넣기 → 로그인 후 생성 시작. 영상에서 웹사이트 삽화·마스코트·배경 비디오를 전부 여기서 뽑았다.
- **Fish Audio** (`fish.audio`) — TTS/보이스 클로닝. 확인 결과 시드 $52M, 8M+ 사용자. 모델 **S2.1 Pro**("most expressive, emotionally controllable real-time voice model"). 핵심은 **감정 태그**(`[emphasis]`, `[short pause]`, `[crying loudly]`, angry/sad/whispering/breathy/excited …)와 **Auto Tag All** 버튼. Sound Effects 라이브러리(River·Thunder·Gunshot·Explosion·Rain·Applause·Wind …)도 있고 Developer → API keys → Create API key 후 Claude에 연결한다. 화자는 "대안 대비 3~7배 싸다"고 말한다. Claude가 Morgan Freeman 보이스 사용을 거부했다는 언급도 나온다.
- **Notion 문서 2종** — `Design DNA: One beautiful design into a permanent skill`(설명란 링크)과 `The Design Loop — Free Guide`. 두 문서의 본문이 화면에 그대로 노출되며, 이 영상의 실질적 알맹이다.
- **Duolingo / Mercury** — 참조 대상. Mercury의 DESIGN.md 발췌가 화면에 보인다: "Mercury operates in an alpine banking aesthetic: a near-black canvas (#171717) sets a cinematic, observatory-like atmosphere…". 이 문장 톤이 우리가 써야 할 DESIGN.md 톤의 좋은 견본이다.

---

## 2. 타임스탬프 분해

- **00:00–01:13 — 문제 제기.** 오프닝이 "Builds beautiful websites and motion *graphics*" 타이핑 자막 + 참조 사이트 카드 슬라이드쇼(Run Club, Jupiter/Europa 와인, Resend "Email for developers", Spline "FROM 3D TO WEB", "The Renaissance Edition"). 자막의 **마지막 단어만 이탤릭 세리프**로 바꿔 강조하는 장치가 반복된다.
- **01:13–01:42 — "The consistency problem".** 로컬 HTML 슬라이드: 헤드라인 `Ask twice. Get two different brands.` + 부제 "It makes pretty things. It can't make the same pretty thing again." 아래에 양피지 톤 일러스트 카드 `THE CONSISTENCY PROBLEM` — 좌측 RANDOM(제각각 와이어프레임 9장) / 우측 ONE FAMILY(정렬된 9장). 하단 스탬프 `● LIVE · SAME PROMPT, THREE TIMES`.
- **01:42–02:13 — "Two jobs. Both, or it breaks."** JOB 01 `Make one great design`(적색 프레임) + JOB 02 `Write down why it's good`(녹색 프레임). 이어 `+ STEP ONE` 마커와 `The Design Loop` — "Pick something great. Rebuild until three critics say yours is better."
- **02:13–02:59 — 디자인 루프 설명.** `Give it the dream outcome` → `They challenge it in a loop`(AGENT 01/02/03이 원형 궤도에 배치되고 가운데 녹색 체크). 이어 `Turn the look into rules` — 양피지 카드 `DECONSTRUCT THE DNA`: 분해된 레이어 스택 → GRID / COLOR / TYPE / TEXTURE 라벨 → `REBUILD`. 하단 탭 `GRID | COLOUR | TYPE | TEXTURE | MOTION`. 마지막에 `One set of rules. Three tests.` 목록: `01 The Poster (ONE FRAME)` / `02 The Website (TWELVE SECTIONS)` / `03 The Vox Graphic (THIRTY SECONDS)`.
- **02:59–03:45 — Savee에서 원본 고르기.** 무한 그리드 스크롤 → 마음에 드는 포스터 저장. "design loop 스킬을 다운로드해 Claude에 넣고 '이걸 스킬로 만들어줘'라고만 하면 된다. 그 다음엔 `/design-loop`."
- **03:45–04:41 — 3-비평가 구조 설명(핵심).** §4-1 표 참조.
- **04:41–05:30 — Higgsfield 연결.** MCP 커넥터 URL 복사 → Claude Customize에 붙여넣기 → CLI. 프롬프트: "이 디자인의 AI 컨퍼런스 버전을 만들어줘. 끝나면 **디자인 비평가들이 어떻게 작동했는지 설명하는 두 번째 파일**도 만들어줘."
- **05:30–07:10 — 결과 비교 + 디테일 검증.** 원본 vs Claude 결과 나란히. 화자가 확대해 보여주는 건 "라인 하이트를 넘지 않는 텍스트", "우하단 요소 높이가 좌하단과 미러링되는가" 같은 **측정 가능한 것**들. 결과물: `FRONTIER SUMMIT — Lineup`(라임 `#CFF` 계열 바탕 위 검정 산세리프 이름 22개 — Andrej Karpathy / Andrew Ng / Aravind Srinivas / Arthur Mensch / Clem Delangue / Dario Amodei / Demis Hassabis / Fei-Fei Li / Geoffrey Hinton / Greg Brockman / Ilya Sutskever / Jensen Huang / Lex Fridman / Liang Wenfeng / Matt Wolfe / Mira Murati / Mustafa Suleyman / Sam Altman / swyx / Yann LeCun / Yoshua Bengio — 각 이름 뒤에 작은 pill 배지, 좌측에 세로 회전 캡션, 확대하면 배지가 **숫자**(650/730/3,900/240/940/210)로 드러난다).
- **07:10–08:48 — Design DNA Notion 문서.** "One design. One system. Any format." 붉은 카드. 60초 요약 7단계, 여섯 항목 표, "how much do you write down?" 딜레마, `Why "never" beats "always"`.
- **08:48–09:22 — 색 변주.** 완성된 포스터를 라임 → 핑크 → 파랑으로 재생성. URL이 `localhost:4462/index.html?theme=pink` — **테마를 쿼리 파라미터로 뽑아 둔 것**이 보인다. 스킬로 저장 후 `/poster`로 재사용하며, 스킬이 역으로 "subject / foreground / background가 필요하다"고 **되묻는다**.
- **09:22–14:46 — 레벨 2, 웹사이트.** Refero → Duolingo DESIGN.md → `/design-loop` + Higgsfield CLI + 자체 website design system 스킬. 결과물 `neuro-ai-pl9i.vercel.app`("Neuro — The Fun Way to learn AI"). 그리고 결과물에 **4탭 시스템 페이지**가 붙어 있다: `WEBSITE / SYSTEM / GRAPHICS / COPY`.
- **14:46–19:54 — 레벨 3, Vox 모션 그래픽.** Vox 원본 클립(`youtube.com/watch?v=QM6HLF_nsjo`)의 "video URL at current time"을 복사해 골드 스탠다드로 제시. Fish Audio에서 보이스 선택(Clear Young Narrator / Phat phạc(3n))·감정 태그·Auto Tag All → API 키 → Claude 연결. 결과: 10초 클립(Higgsfield가 만든 **낙엽 떨어지는 숲 배경 비디오** + 잘라낸 스패니얼 + 주황 스와시 밑줄 + `20 in` 치수선 + `Young ── Adult` 실루엣 스케일 바). 마지막에 "이 프롬프트는 결국 **에셋을 역분해**한다 — 화살표가 있고, 비디오 배경이 있고, 이런 텍스트가 있다 — 그리고 그걸 단계별 컴포넌트로 쪼갠다"고 정리.
- **19:54–20:14 — 마무리.** "디자인 이해는 다면 시스템의 한 조각일 뿐" → 에이전틱 OS / 디자인 OS 영상으로 유도.

---

## 3. 프런트엔드 기법 — 그리고 우리 스택 적용법

우리 스택 전제: **MapLibre GL JS 5.6 / deck.gl 9.3 / three 0.185 / 바닐라 JS / 정적 배포**(빌드 스텝 없음, `tools/serve.mjs`).

### 3-1. 로컬 HTML 프레젠테이션을 "제품처럼" 만든다 ★★★★★
영상의 내레이션 화면 전부가 단일 `claude-design-consistency.html`이다. 챕터 마커(`+ THE FIX`, `+ STEP ONE`, `+ THE PROOF`, `+ THE PROBLEM`), 대형 로마자 숫자(`01` `02` `03`) + 이탤릭 세리프 제목(`The Poster` / `The Website` / `The Vox Graphic`) + 한 줄 부제("One frame. Nowhere to hide." / "Does it hold for twelve sections?" / "Does the look survive moving?"), 우측 세로 진행 도트 레일, 하단 상태 스탬프(`● LIVE · BUILT AND DEPLOYED`, `WHAT IT STILL COSTS · MAKE IT MOVE`).
- **우리 적용**: 지금 `landxi/proto/dive.html`이 하는 스크롤 서사를 이 챕터 문법으로 재단한다. `+ 악장` 마커 → 로마자 챕터 넘버 → 짧은 부제 → 도트 레일. **취향 프로필 §4의 "하드 반전"과 정확히 호환**된다(챕터 경계 = 반전 경계). 바닐라 `IntersectionObserver` + `position:sticky`로 충분.
- **난이도**: 하 (CSS 90%)
- **대상 화면**: `dive.html` 서사 구간, 신규 "리포트" 화면.

### 3-2. 문장 안에서 마지막 한 단어만 서체를 바꾸는 강조 ★★★★☆
`Two jobs. **Both, or it breaks.**` — 앞은 산세리프 볼드, 뒤는 세리프 이탤릭 + 액센트색. `Turn the look into *rules*`, `Ten times, ten *different* things`, `Ask twice. Get *two different brands.*`, `One set of rules. *Three tests.*` 전부 같은 장치다. 밑줄·박스·형광 없이 **서체 대비 하나로** 위계를 만든다.
- **우리 적용**: §4가 표시 서체를 SUIT Medium 단일 굵기로 못박았으므로, 우리 버전은 "굵기"가 아니라 **이탤릭 세리프 1종(또는 SUIT + 국문 명조 1종)** 을 강조 전용으로만 추가한다. 예: "부처는 다섯, 영상은 *하나다*". 남용 금지 — 문단당 1회.
- **난이도**: 하
- **대상 화면**: 전 화면 헤드라인.

### 3-3. `?theme=` 쿼리 파라미터로 테마 변주를 뽑아 두기 ★★★★★
`localhost:4462/index.html?theme=pink`. 같은 레이아웃·같은 타이포에 팔레트만 스왑해 라임/핑크/블루 세 버전을 즉석에서 비교한다. **디자인이 시스템인지 우연인지 증명하는 가장 싼 방법**이다.
- **우리 적용**: `landxi/proto/js/style.js`와 `v3-tokens.css`가 이미 토큰 레이어를 갖고 있다. `:root[data-theme]` 블록 + `new URLSearchParams(location.search).get('theme')` 3줄이면 끝. LX 블루 `#006DF7` 기본, 대체안 검증용 1~2개. **더 중요한 건 지도 쪽** — MapLibre `map.setPaintProperty()`로 같은 토큰을 레이어 색에 주입하면 "웹 UI와 지도가 한 팔레트"임을 즉시 증명할 수 있다(현 프로토의 약점).
- **난이도**: 하~중(지도 레이어까지 묶으면 중)
- **대상 화면**: 전 화면 + `system.html`에 스위처 노출.

### 3-4. 서체 후보 베이크오프 컴포넌트 ★★★★★
가장 인상적인 물건. `THE TYPE SET — TEN CANDIDATES FOR THE DISPLAY FACE`. 각 행이 **같은 단어("Neuro")를 후보 서체로 실제 렌더**하고, 오른쪽에 `[ITALIC/NO ITALIC]` 칩 · 분류 라벨 · 서체명 · **점수**를 붙인다:

```
Bricolage Grotesque  NO ITALIC   (기준/현재)         100
Cabinet Grotesk      NO ITALIC   display grotesk     103
Gabarito             NO ITALIC   geometric display   103
Ranade               ITALIC      quirked sans        103
Chubbo               ITALIC      chunky slab         103   ← RECOMMENDED +
Fraunces             ITALIC      soft serif           94
Erode                ITALIC      carved serif         94
Zodiak               ITALIC      high contrast        94
Boska                ITALIC      editorial display    94
Gambarino            ITALIC      —                    91
```

하단 컨트롤: `COMPARE TWO` / `REVERSE OUT` / `RESET`. 즉 **두 개만 골라 나란히 보기**와 **흰 글자/검은 바닥 반전 미리보기**가 버튼 하나다. 옆 블록의 설명 문구가 방법론까지 말해 준다 — "Ten faces that could carry this brand, none of them the ones a generator reaches for first. Every specimen below is live type… The stack below is the comparison — one word, one scale, one left edge, ten faces."
- **우리 적용**: 우리 판정 규칙에서 "반전"은 핵심 장치다(§4 하드 반전). 한글 표시 서체 후보(SUIT / Pretendard / Noto Sans KR / 본고딕 변형 등)를 **"국산리"·"여수"·"Land-XI" 같은 실제 단어**로 렌더하고 `REVERSE OUT` 토글을 붙인 베이크오프 블록을 `system.html`에 추가한다. 점수는 임의로 매기지 말고 **측정치**(x-height 비율, 숫자 tabular 여부, 한글 자소 균질성)로 라벨링한다.
- **난이도**: 중 (웹폰트 서브셋 로딩 비용 — `font-display:swap` + 필요한 글자만 서브셋)
- **대상 화면**: `system.html`(컴포넌트 시트).

### 3-5. `WEBSITE / SYSTEM / GRAPHICS / COPY` 4탭 세그먼트 ★★★★★
완성 사이트 우하단에 알약형 4탭이 고정되어, 같은 배포물 안에서 **완성 화면 ↔ 디자인 시스템 ↔ 에셋 인벤토리 ↔ 카피 시스템**을 왕복한다. 클라이언트에게 "이건 우연이 아니라 시스템"임을 증명하는 판매 도구다.
- **우리 적용**: 우리는 이미 `system.html`(시트)과 `dashboard.html`이 별 파일로 있다. 이걸 **하나의 고정 세그먼트로 묶는다**: `아틀라스 / 시스템 / 증거 / 카피`. "증거"는 우리 강점 — 남원 4시점·여수·제주·국산리 실제 크롭과 GSD·촬영일자 메타. 취향 프로필 §5-9("모든 숫자가 해설인가")를 이 탭이 통과시킨다.
- **난이도**: 하 (라우팅 없이 `location.hash` + 섹션 토글)
- **대상 화면**: 프로토 전체의 셸.

### 3-6. 3D "입술(lip)" 버튼 — 눌리는 물리 반응 ★★★☆☆
Duolingo 클론의 버튼 명세가 화면에 그대로 있다(`BUTTONS — THE LIP`): 기본 상태에 아래쪽 립 그림자를 두고, `:active`에서 `translateY(4px)` + 그림자 붕괴. 호버는 `filter: brightness()`. 명세문 요약: "Fill and then shadow live on a `::before`, `bo-shadow: 0 4px 0` with no colour, so the `currentColor` points to the lip. Press collapses the shadow and drops the button 4px."
- **우리 적용**: **원리만 훔치고 형태는 버린다.** §4가 "그림자·라운드 0"을 못박았으므로 립 대신 **코너 브래킷 프레임의 두께/오프셋 변화**로 같은 물리감을 만든다. 취향 프로필 §5-3("색 변화만은 실패")을 통과시키는 가장 값싼 방법이다. 180ms `cubic-bezier(.22,1,.36,1)`.
- **난이도**: 하
- **대상 화면**: 전 화면 CTA·필터 칩·레이어 토글.

### 3-7. "EVERY LINE, BEFORE → AFTER" 카피 대조 패널 ★★★★☆
카피 시스템 페이지가 사이트의 **모든 문장**을 좌(BEFORE·적색)/우(AFTER·녹색) 카드로 나열하고, 각 쌍에 섹션 태그(`THE HERO`, `THE HABIT`, `HOW IT WORKS`, `YOUR PATH`, `THE SKY BAND`, `NEURO PRO`)와 줄 수(`3 LINES`, `2 LINES`)를 붙인다. 예: `Start free` → `Everyone uses AI. Almost nobody is good at it.` / `The hard part is day four` → `you don't read it. you do it.`
- **우리 적용**: 우리의 "관리툴 어휘 금지"(§3-6, §5-7)를 **검증 가능한 형태로** 만든다. `docs/design/copy.md`에 프로토의 모든 카피를 BEFORE/AFTER로 적어두면, 다음 세션의 Claude가 그 표를 규칙으로 읽는다. 화면으로도 노출(위 4탭의 "카피").
- **난이도**: 하 (문서 작업)
- **대상 화면**: 신규 `copy` 탭 + `docs/design/`.

### 3-8. 데이터 라벨이 이미지 위에 "치수선"으로 앉는 Vox 문법 ★★★★★
Vox 원본과 재현물 모두: 사진/영상 풀블리드 → **노란 치수선 + `15 feet` / `4 feet 4 inches` / `20 in`** → 주황 화살표가 비교 대상을 가리킴 → 하단에 `Young ── Adult` 실루엣 스케일 바(현재 위치가 노란 박스로 하이라이트). 텍스트는 배경 위 얇은 흰 산세리프, 밑줄 대신 **손그림 느낌의 주황 스와시**.
- **우리 적용**: 이건 §4의 "떠 있는 HUD 스티커 금지 / 오버레이는 이미지 안에 헤어라인 벡터·코너 브래킷·캡션 `장소 · 날짜`"와 **완전히 같은 철학**이다. 정사영상 위에 (a) 축척 치수선(예: `12 m`), (b) 대상 지시 화살표, (c) 시계열 스케일 바(2019 ── 2026, 현재 프레임 하이라이트)를 얹는다. deck.gl `LineLayer`/`TextLayer`보다 **지도 위 SVG 오버레이**가 통제력이 높다(선 굵기가 줌에 안 흔들림). `map.project(lngLat)` → SVG 좌표 갱신, `map.on('move')`에 바인딩.
- **난이도**: 중
- **대상 화면**: `dive.html` 탐지 구간, "Acquired" 크롭 인셋.

### 3-9. 양피지/블루프린트 다이어그램 카드 ★★☆☆☆ (주의)
`DECONSTRUCT THE DNA`, `THE CONSISTENCY PROBLEM`, `THE DESIGN LOOP`(BUILD → CRITICS → THE BAR 원형 궤도 + 저울 + 모나리자), `THE WEBSITE SYSTEM`(시스템 카드 → 데스크톱/모바일 → `SAME DNA`), `THE MOTION GRAPHIC`(필름 스트립 + `FRAMES` / `TIMELINE`) 등 모든 설명이 **크림색 종이 질감 카드 + 갈색 잉크 아이소메트릭 삽화**로 그려진다. 코너 크롭 마크, 등거리 그리드 같은 아날로그 은유.
- **우리 적용**: **질감은 버리고 구조만.** 우리 §4는 그라디언트·그림자·라운드 0이다. 다만 "설명을 스크린샷이 아니라 **한 장의 도해**로 만든다"는 원칙은 훔칠 만하다 → 흰 종이 + `#272727` 헤어라인 SVG 아이소메트릭. 예: "궤도 → 정사영상 → 타일 → 탐지 → 대장" 파이프라인 도해.
- **난이도**: 중~상 (SVG 손작업)
- **대상 화면**: 리포트/서비스 설명 섹션.

### 3-10. 에셋 인벤토리 + 모델 시트 ★★★★☆
`ASSET INVENTORY`가 8개 삽화를 카드로 나열하고 각각에 **ID · 종횡비 · 애니메이션 이름 · 주기**를 붙인다: `S1 · HERO / 4:3 · float 4.1s`, `S2 · LESSON / 4:3 · float 3.8s`, `S5 · PATH / 4:3 · float-alt 3.4s`, `S8 · CERTIFICATE / 4:3 · sway 3.1s`, `MASCOT / 1:1 · logo + scenes`. 별도의 `MODEL SHEET`는 "한 줄, 한 스케일, 머리/어깨/엉덩이 높이 규칙, 좌측을 따라 내려가는 여섯 art colour" — 새 에셋 생성 시 `cast-sheet.png`와 **함께 전달**하라고 명시. `ART PALETTE`는 색마다 이름·hex·역할을 준다(ink / atomic / slate / paper / parchment / ochre) + "Six colours per scene, maximum. Parchment appears once per illustration."
- **우리 적용**: 우리의 "에셋"은 캐릭터가 아니라 **정사영상 크롭·탐지 오버레이·차트**다. 같은 표를 만든다: `P3 · 남원-2024 / 16:9 · GSD 25cm / drift 8.0s`, `D1 · 여수-해양쓰레기 / 1:1 · lock-on 3beat`. 앰비언트 주기를 6~9s로 **위상 분산**(§5-11)해 적는 순간, "화면당 움직이는 요소 1개" 규칙이 자동 검증된다. `ART PALETTE`의 "장면당 6색 최대, parchment는 삽화당 1회"는 우리 §4의 액센트 규칙을 어떻게 문서화할지의 정확한 모범이다.
- **난이도**: 하 (표 + 데이터 파일)
- **대상 화면**: `system.html` / `js/plate.js`·`js/atlas.js`의 데이터 소스.

### 3-11. 스크롤로 성장하는 히어로 삽화 밴드 ★★★☆☆
Neuro 사이트 히어로에서 캐릭터+아이콘들이 **곡선 파형(wave) 경계**를 따라 배치되고, 스크롤에 따라 아이콘이 흩어졌다 모인다. 하단 네비는 가로 스크롤 칩 레일(`PROMPTING · AGENTS · ML BASICS · AUTOMATION · AI SAFETY · VIBE CODING · IMAGE GEN · RAG · FINE-TUNING · EVALS · VOICE AI`).
- **우리 적용**: 파형·마스코트는 버린다. 가져올 건 **가로 칩 레일** — 13개 서비스를 가로 스크롤 칩으로 두고, 칩 선택 시 지도 카메라가 해당 실증지로 이동. §5-4("화면 전환이 같은 지도의 카메라 이동인가")를 통과한다.
- **난이도**: 중
- **대상 화면**: 메인(서비스 ↔ 결과 매칭).

---

## 4. 데이터/AI 노하우 — 그리고 우리 적용법

### 4-1. 3-비평가 하드코딩 루프 ★★★★★ (이 영상 최고의 자산)

Notion 원문:

> **The three critics** — You never write a critic. The three roles are hardcoded so they never converge into the same opinion — but each one's specific brief is written per run, because "does it hit the brief" means something different for an animation than for a pricing page.

| Critic | Judges against | Model | Why |
|---|---|---|---|
| **Brief** | The stated goal only, ignoring aesthetics | Sonnet | Simple judgment, no vision needed |
| **System** | `design-system.md` only | Haiku | Mechanical adherence checking |
| **Craft** | `bar.md` **and rendered frames, never the code** | Strongest available | **Never downgrade this one.** A cheap craft critic approves everything and the loop dies on round one. |

세 가지가 중요하다. ① **역할은 고정, 브리프는 매 실행마다 작성** — 애니메이션의 "브리프 적중"과 가격표의 그것은 다르다. ② **Craft 비평가는 코드가 아니라 렌더된 프레임을 본다.** ③ **Craft에만 최상위 모델을 쓴다** — 싸구려 Craft는 전부 통과시키고 루프가 1라운드에 죽는다. 영상 별도 화면(`Ten times, ten different things`)에서도 같은 말을 반복한다: "세 역할은 하드코딩되어 절대 같은 의견으로 수렴하지 않는다."

- **우리 적용**: 즉시 가능. 우리는 이미 `tools/_shots.mjs`·`tools/film/`으로 프로토를 스크린샷한다. 세 파일만 만들면 된다:
  - `docs/design/brief.md` — 그 화면이 답해야 할 질문(예: "5초 안에 '13개 서비스가 실제 결과와 매칭된다'를 이해시킨다")
  - `docs/design/design-system.md` — 취향 프로필 §4를 기계 검증 가능한 형태로 옮긴 것(토큰 값·이징·지속시간 사다리·금지 목록)
  - `docs/design/bar.md` — §5의 11개 판정 규칙 + 아래 4-2의 "측정 가능한 문장"으로 재작성
  그리고 리뷰 시 **스크린샷을 붙여** 3개 서브에이전트를 돌린다. Craft에는 반드시 최고 모델.
- **난이도**: 하 (문서 3개 + 기존 스크린샷 파이프라인 재사용)
- **대상 화면**: 전 화면 (개발 프로세스)

### 4-2. "bar"는 형용사가 아니라 측정치여야 한다 ★★★★★

> The teardown converts your reference into **mechanisms a critic can check by looking**. This is the step that does the real work, and it is also the step people get wrong. Adjectives are unfalsifiable; measurements are not.

| ❌ Useless | ✅ Checkable |
|---|---|
| "Feels premium" | "Headline is 5x body size" |

- **우리 적용**: 우리 §5는 이미 절반쯤 측정치다(180ms, 6s, 3비트 락온, 60%). 나머지를 마저 숫자로 바꾼다. "절제된 색" → **"한 뷰포트 안에 액센트 픽셀이 3% 미만"**. "관리툴 어휘 금지" → **"헤드라인에 지명 또는 숫자가 반드시 1개"**. "떠 있는 HUD 금지" → **"오버레이 배경 불투명도 0, 테두리 1px `#272727`만"**. 이렇게 쓰면 스크린샷만 보고도 통과/불통을 말할 수 있다.
- **난이도**: 하
- **대상 화면**: `bar.md`

### 4-3. 60초 요약 7단계 (규칙 파일 만드는 절차) ★★★★★

1. Find a design you love.
2. **Take it apart. Measure it, do not describe it.**
3. Argue with yourself about which bits actually matter.
4. Write the rules down as a file.
5. **Write tests that a bad copy would fail.**
6. **Rebuild the original from your rules alone. Whatever you get wrong is a rule you forgot. Add it. Go again.**
7. Save the whole thing as a skill.

> Step 6 is the one nobody does, and it is the one that works.

- **우리 적용**: 우리는 Vantor를 실측했다(§4 "Vantor 실측 기반, 확정"). 하지만 **6단계를 안 했다** — 규칙만으로 Vantor 히어로를 다시 그려본 적이 없다. 반나절 스파이크로 `landxi/proto/spikes/vantor-rebuild.html`을 만들어 원본과 나란히 놓으면, 우리 §4에서 빠진 규칙이 그 자리에서 드러난다. **이 영상에서 우리가 당장 해야 할 단 하나의 행동이 이것이다.**
- **난이도**: 중 (반나절)
- **대상 화면**: 신규 스파이크 → §4 갱신

앞선 진단도 같은 결에 있다: "This is not the model being lazy. Every rule you do not write down, the model has to guess. And it does not guess randomly. **It guesses the average of everything it has ever seen.** That average is what people call AI slop. Slop is just the sound of an unwritten rule."

### 4-4. "사람들이 엉뚱한 걸 적는다" — 실제로 룩을 지탱하는 여섯 가지 ★★★★★

Notion 표(`The six things that actually make a design a design`) 요약:

| 항목 | 뜻 |
|---|---|
| **Ratios, not numbers** | "헤드라인 96px"은 거의 쓸모없다. "헤드라인이 본문의 8배, 본문은 6px 아래로 안 감"이 실제 스타일이다. **룩은 사이(gap)에 있지 어느 한쪽에 있지 않다.** |
| **How much, not just what** | 같은 3색이라도 60/30/10과 90/8/2는 완전히 다른 디자인이다. 각 색이 페이지의 몇 %인지 항상 적어라. |
| **The one weird move** | 거의 모든 훌륭한 디자인은 자기 규칙을 정확히 한 번 깬다. 사진을 가로지르는 타입, 마진을 삐져나온 선, 가장자리에 잘린 거대한 숫자. **가장 중요한 단 하나이자, 복사할 때 가장 먼저 잃는 것** — 시스템을 복사하느라 시스템에서의 이탈을 못 베낀다. |
| **The refusals** | 색을 여섯 개 나열하면 모델에게 여섯 개를 써도 된다고 말한 것이다. 실제 디자인은 액센트 1개를 페이지의 3%에 썼다. **그 디자인의 진짜 내용은 거절이었다. 거절을 적어라.** |
| **What is missing** | 그림자 없음. 아이콘 없음. 곡선 없음. 중앙정렬 없음. **부재는 디자인 결정이다.** 다른 것과 똑같이 기록하라. |
| **Named layouts** | 레이아웃에 이름을 안 붙이면 8번 슬라이드가 1번과 안 맞는다. 색은 맞는데 배열이 틀려서 "엉성해" 보인다. |

- **우리 적용**: 이 여섯 가지로 §4를 감사하면 결손이 바로 보인다.
  - *비율*: 우리는 절대값(H1 64/80, 통계 124px)만 적었다. → **"통계 숫자 = 본문의 7.75배", "H1 = 본문의 4배"** 로 다시 쓴다. 그래야 모바일에서도 룩이 유지된다.
  - *분량*: `#FFFFFF` 몇 %, `#010102` 몇 %, `#006DF7` 몇 %인지 안 적혀 있다. → **90/8/2**로 못박는다(액센트 2%).
  - *한 번의 일탈*: §4에 없다. → 후보를 정한다: **"정사영상 판(plate)이 좌우 마진을 뚫고 화면 밖으로 나가는 것, 페이지당 정확히 1회."**
  - *거절*: §3의 거부 목록 6개가 이미 이 역할이다. 잘 되어 있다. 다만 "그라디언트 없음, 유리 없음, 그림자 없음, 라운드 0"을 **`design-system.md` 최상단**으로 올린다.
  - *부재*: 위와 동일.
  - *명명된 레이아웃*: **없다. 가장 큰 구멍.** → `PLATE-FULL`(정사영상 풀블리드 + 캡션), `SPLIT-5050`(Vantor 스티키 50/50), `LEDGER`(좌 라벨/우 값 표), `EVIDENCE-PAIR`(원본 ↔ Acquired 크롭), `CHIP-RAIL`(가로 서비스 레일) — 다섯 개를 이름 붙여 `system.html`에 렌더한다.
- **난이도**: 하 (문서) ~ 중 (`system.html` 렌더)
- **대상 화면**: `docs/design/design-system.md` + `system.html`

### 4-5. "얼마나 적을 것인가" — 양쪽 다 옳다 ★★★★☆
문서는 딜레마를 정직하게 남긴다. *Write everything*: 뭘 물어봐도 답이 나온다. 어디에 뭐가 있는지 아무도 모른다. *Write about nothing*: 카피가 원본과 못 맞는다. 값은 있는데 형태가 없다. 결론은 **두 문서로 쪼개는 것** — `Compile, do not paste`. 좁고 서로 다른 문서 둘.
- **우리 적용**: 정확히 우리 문제다. 취향 프로필 한 파일이 발화·벤치마크·토큰·판정을 다 안고 있어 비대해졌다(85행). → **`design-system.md`(기계가 검사하는 토큰·금지·레이아웃 이름)** 와 **`bar.md`(사람/Craft 비평가가 눈으로 보고 판정하는 측정 문장)** 로 분리. 취향 프로필은 출처 문서로 남긴다.
- **난이도**: 하
- **대상 화면**: `docs/design/`

### 4-6. `"never"`가 `"always"`를 이긴다 ★★★★☆
문서 소제목 `Why "never" beats "always"`. 요지: **이미지 모델에서 부정 프롬프트는 약하다** — 샘플러가 프롬프트 벡터와 부정 벡터를 하나의 확률 지형으로 합쳐 갈아버린다. 그래서 이미지 쪽은 **원하는 것을 긍정으로** 쓴다("Use an asymmetric layout", "Never centre the hero", "a single subject on a white canvas"). 반면 **텍스트/코드 모델에서 부정 지시는 강하다** — "절대 그라디언트를 쓰지 마라"는 확인 가능한 검사로 잘라낼 수 있고, 애매한 평균에서 벗어나게 한다. 문서 결론: "Bans are also checkable. 'Is the hero centred?' has a yes or no answer. 'Does it feel editorial?' does not."
- **우리 적용**: Higgsfield/이미지 생성은 우리 워크플로에 거의 없지만, **Claude로 화면을 짤 때 금지형이 강하다**는 결론은 그대로 쓴다. 우리 §3 거부 목록이 실제로 잘 작동해 온 이유의 설명이기도 하다. `design-system.md`를 **금지형 문장 우선**으로 배치한다.
- **난이도**: 하
- **대상 화면**: 프롬프트/문서

### 4-7. 레퍼런스를 DESIGN.md로 뽑아 오는 경로(Refero) ★★★★☆
Refero는 실제 제품 사이트를 `DESIGN.md / Tailwind v4 / CSS Variables / Design Tokens` 네 포맷으로 변환해 둔다. 화면에 보인 Mercury 항목은 산문 + 토큰 표 혼합체다: `# Mercury — Style Reference` → `## Theme → dark`("Mercury operates in an alpine banking aesthetic: a near-black canvas (#171717) sets a cinematic, observatory-like atmosphere…") → `## Tokens — Colors`(`| Name | Value | Token | Role |`, 예: `Graphite Card | #1c1c1c | --color-graphite-card | Dominant page background, hero overlay base, footer and section canvases`) → `## Tokens — Typography`(`--font-size`, `--line-height`, `--letter-spacing`, `--font-weight`를 역할별로).
- **우리 적용**: Vantor·Palantir·Planet·all4land·vw-lab에 대해 우리가 이미 쓴 벤치마크 문서 6종을 **이 스키마로 정규화**한다(산문 1문단 + 토큰 표 4개: Colors / Typography / Spacing / Motion). 그러면 다음 세션의 Claude가 바로 소비한다. Refero MCP는 유료 베타이므로 지금은 **포맷만 차용**하고 붙이지 않는다.
- **난이도**: 하
- **대상 화면**: `docs/superpowers/research/2026-08-25-benchmark-*.md`

### 4-8. 카피 안티슬롭 시스템 ★★★★☆
출처를 화면에 명시한다: GitHub 안티-슬롭 레포(스타 36,087), Wikipedia "Signs of AI writing", "GPT-5.6 cleanse", 세계적 카피라이터 원칙. 산출: `World-class copy`(카테고리 최고 수준 벤치마크), `65 words · 8 shapes`(전체 사이트 카피가 65단어·8가지 형태), 그리고 5원칙 — **Don't make me think / Name the pain first / Specific or silent / One ask per screen / Under five minutes**. 모든 문장을 BEFORE→AFTER로 감사하고 `3/5 → 5/5` 점수까지 표시한다.
- **우리 적용**: 5원칙 중 **"Specific or silent"** 와 **"One ask per screen"** 이 우리 §5-7·§5-9와 같은 말이다. 국문으로 옮긴다: *구체적이지 않으면 침묵한다*, *화면당 요청 하나*, *통증을 먼저 이름 붙인다*. 다만 "Under five minutes"는 소비자 앱 문법이라 공공/기업 대상인 우리에겐 **"근거를 먼저"** 로 치환한다. `65 words` 같은 총량 제약도 좋다 — 우리 메인 카피 총량을 숫자로 못박으면 §3-1(카드 나열) 재발을 구조적으로 막는다.
- **난이도**: 하
- **대상 화면**: 카피 전반

### 4-9. 스킬이 사용자에게 되묻는다 ★★★☆☆
저장된 `/poster` 스킬이 실행 시 "subject / foreground / background가 필요하다"고 **먼저 질문**한다. 슬롯이 정의된 스킬은 빈칸을 상상으로 채우지 않는다.
- **우리 적용**: 우리 화면 생성 스킬도 슬롯을 명시한다 — `장소`, `촬영일자`, `GSD`, `센서`, `탐지 대상`, `근거 이미지 경로`. 이 여섯이 없으면 진행 거부. 그러면 §3-6("가짜 숫자·가짜 신뢰도 게이지 금지")이 구조적으로 강제된다.
- **난이도**: 하
- **대상 화면**: 스킬 정의

### 4-10. 참조를 "에셋 목록"으로 역분해한다 ★★★★☆
레벨 3의 마지막 설명이 방법론이다: 참조 클립을 주면 시스템이 먼저 **구성 에셋을 열거**한다 — "화살표가 있다, 비디오 배경이 있다, 이런 종류의 텍스트가 있다, 노란 설명 박스에 리더선이 있다" — 그 다음 단계별 컴포넌트로 쪼갠다. 즉 **스타일 모사 이전에 부품 목록**.
- **우리 적용**: 우리 벤치마크 문서들이 "인상"을 적고 있지 "부품 목록"을 적고 있지 않다. Vantor/Planet 히어로를 **부품 목록**으로 다시 쓴다: 풀블리드 영상 1 / 좌상단 워드마크 / 우측 세로 캡션 / 하단 GSD·센서 라인 / 코너 브래킷 4 / 스크롤 힌트 1. 이게 곧 §4-4의 "명명된 레이아웃"의 재료가 된다.
- **난이도**: 하
- **대상 화면**: 벤치마크 문서 → `system.html`

### 4-11. 감정 태그 TTS + 효과음 (Fish Audio) ★★☆☆☆
`[emphasis]`, `[short pause]`, `[laughing]` 인라인 태그 + `Auto Tag All` 자동 부착. S2.1 Pro. Sound Effects 라이브러리(River/Thunder/Rain/Wind/Applause/Explosion). API 키 → Claude 연결.
- **우리 적용**: **지금은 보류.** 우리 제품은 정적 웹이고 §5는 소리를 다루지 않는다. 단, 향후 LX 홍보 필름(플레이아데스 네오 스타일 하강 영상)에 한국어 내레이션이 필요해지면 첫 후보다. 한국어 품질 검증 필요.
- **난이도**: 하 (도구) / 판단은 보류
- **대상 화면**: 해당 없음(향후 필름)

---

## 5. 지금 훔칠 것 — Top 5

1. **3-비평가 루프를 우리 리뷰에 그대로 이식** (Brief/System/Craft, Craft만 최상위 모델, 코드가 아니라 렌더된 스크린샷을 본다). `docs/design/{brief,design-system,bar}.md` 3파일 + 기존 `tools/_shots.mjs` 재사용. — *반나절, 효과 최대*
2. **7단계 중 6단계 "규칙만으로 원본 재구축"을 Vantor로 실행.** `landxi/proto/spikes/vantor-rebuild.html`. 틀린 것 = 우리가 빠뜨린 규칙. §4를 그 결과로 갱신. — *반나절*
3. **§4를 "비율 · 분량 % · 한 번의 일탈 · 명명된 레이아웃"으로 재작성.** 특히 **명명된 레이아웃 5종**(`PLATE-FULL` / `SPLIT-5050` / `LEDGER` / `EVIDENCE-PAIR` / `CHIP-RAIL`)이 지금 가장 큰 구멍이다. — *2~3시간*
4. **`WEBSITE / SYSTEM / GRAPHICS / COPY` 4탭 셸**을 우리 어휘(`아틀라스 / 시스템 / 증거 / 카피`)로 프로토에 고정. 시스템 탭 안에 **서체 베이크오프 + REVERSE OUT 토글**과 **에셋 인벤토리 표**(ID·종횡비·앰비언트 주기)를 넣는다. — *1일*
5. **Vox식 치수선 오버레이**를 정사영상 판에 적용 — 축척선(`12 m`), 지시 화살표, 시계열 스케일 바. 지도 위 SVG + `map.project()` 재투영. §5-5("데이터가 도착하는 사건")와 §5-9("모든 숫자가 해설")를 동시에 통과시킨다. — *1일*

---

## 6. 하지 말 것

1. **마스코트·캐릭터 일러스트 도입 금지.** Neuro의 부엉이/저폴리 인물은 소비자 학습앱 문법이다. 우리 §3-1(균일 카드 그리드)·§4(라운드 0)와 정면 충돌하고, 공공·국토 도메인에서 신뢰를 깎는다.
2. **양피지 질감·크림색 종이·갈색 잉크 삽화 금지.** 영상의 설명 카드는 매력적이지만 텍스처+드롭섀도우 조합이다. 우리는 흰 종이 + `#272727` 헤어라인. 구조만 가져오고 질감은 버린다.
3. **무료 폰트 10종 베이크오프를 "많이 보여주기"로 오해하지 말 것.** 베이크오프는 **고르기 위한 도구**다. 최종 화면에 서체가 2종을 넘으면 §4 위반. 강조용 이탤릭 1종까지가 상한.
4. **Higgsfield/AI 생성 이미지를 제품 화면에 넣지 말 것.** 우리 §5-1은 "첫 프레임에 실제 영상 사진 60% 이상"이다. 우리는 남원 4시점·제주·여수·해양쓰레기 **실자산**을 갖고 있다. 생성 이미지는 그 강점을 스스로 지운다. (도해용 SVG는 별개.)
5. **"열 번 시켜서 마음에 드는 걸 고르기" 금지.** 영상이 통째로 비판하는 안티패턴이다. 규칙 없이 뽑아 고르면 다음 화면에서 다시 흔들린다.
6. **Refero MCP·Higgsfield MCP를 지금 붙이지 말 것.** 유료 베타 + 외부 의존. 정적 배포 원칙과 반대 방향이고, 우리가 필요한 건 포맷이지 서비스가 아니다.
7. **감정 태그 TTS를 UI 사운드로 쓰지 말 것.** 대시보드에 음성은 §5 어디에도 근거가 없다.
8. **`?theme=`를 사용자 노출 기능으로 만들지 말 것.** 이건 **개발/검증 도구**다. 최종 사용자에게 팔레트 선택권을 주는 순간 §4의 "액센트 1개" 원칙이 무너진다. `system.html`에만 노출.
9. **점수(103/94/91)를 흉내 내지 말 것.** 영상의 서체 점수는 근거가 불투명하다. 우리가 숫자를 쓸 거면 §5-9대로 **단위·범위·기준**이 있어야 한다. 없으면 점수 대신 판정 문장을 쓴다.

---

## 7. 취향 프로필과의 적합도

**§2(레퍼런스 공통분모)와의 관계 — 부분 일치.** 영상의 참조군(Duolingo, Resend, Spline, Mercury)은 SaaS·소비자 앱 계열이고, 우리 §2는 위성/지구관측(planet, Vantor, all4land, kepler) 계열이다. **소재는 반대지만 방법론은 같다.** 특히 §2의 "탐지의 사건화"와 영상의 Vox 치수선 문법은 같은 뿌리다 — 데이터가 이미지 위에 *도착*하게 만드는 것. §2.1의 "명암 교대 리듬 / 악장 전환은 하드 엣지"는 영상의 챕터 마커·`01 02 03` 전환과 정확히 호응한다. 반면 §2.2의 "메인은 흰 바탕"과 영상의 다크 프레젠테이션은 어긋나므로, **챕터 문법만 취하고 색은 우리 것으로 반전**한다. §2의 "한 대의 연속 카메라"는 영상에 대응물이 없다(영상은 슬라이드 전환이다) — 이 지점은 우리가 더 앞서 있다.

**§4(서체·색·모션 v3)와의 관계 — 보강재.** 영상은 §4에 없는 세 가지를 정확히 지적한다: (a) 절대 크기가 아니라 **비율**, (b) 색의 **분량 %**, (c) **명명된 레이아웃**. 셋 다 지금 추가 가능하며, 추가하는 순간 §4는 "취향 메모"에서 "기계 검증 가능한 시스템"으로 승격된다. 서체 베이크오프는 §4가 SUIT/Pretendard/Inter를 확정한 근거를 **화면으로 증명**해 주는 부속물이다(현재 근거가 문장으로만 남아 있다). 반대로 §4가 영상보다 나은 점: 이징 하나 + 500/750/1000/1250ms **사다리**로 모션을 못박은 것 — 영상의 `float 4.1s / float-alt 3.4s / sway 3.1s`는 임의 값이라 위상 분산은 되지만 시스템은 아니다.

**§5(판정 규칙 11개)와의 관계 — 실행 엔진.** §5는 훌륭한 `bar.md`지만 **아무도 자동으로 채점하지 않는다.** 영상의 3-비평가 루프가 바로 그 채점기다. §5-1(영상 60%), §5-3(호버 물리 반응), §5-6(액센트 1개), §5-7(헤드라인), §5-10(움직이는 요소 1개)은 스크린샷만 보고 판정 가능하므로 Craft 비평가에게 그대로 넘길 수 있다. §5-2(5초 앰비언트)·§5-4(카메라 이동)·§5-8(차트 동기화)은 정지 이미지로 못 보므로 **짧은 GIF 또는 연속 프레임 3장**을 비평가에게 준다(`tools/film/`이 이미 이걸 만든다). §5-9(모든 숫자가 해설인가)는 영상의 "Adjectives are unfalsifiable"과 같은 정신이다.

**한 줄 결론**: 이 영상은 우리에게 새 미학을 주지 않는다(미학은 이미 §4에 있다). 대신 **우리 미학을 배신하지 않게 만드는 공정**을 준다. 우리가 지금 겪는 "화면마다 조금씩 다르다"는 문제의 정확한 처방전이다.

---

## 8. 설치/구축할 도구·스킬

**즉시(외부 의존 0)**
- `docs/design/brief.md` / `design-system.md` / `bar.md` — 3-비평가용 3파일. 취향 프로필에서 분할(`Compile, do not paste`).
- `.claude/skills/design-loop/SKILL.md` — Brief/System/Craft 서브에이전트를 순차 실행하고, 각 라운드마다 `tools/_shots.mjs` 스크린샷을 첨부하는 스킬. Craft는 모델 오버라이드로 최상위 고정.
- `.claude/skills/landxi-screen/SKILL.md` — 화면 생성 스킬. 필수 슬롯 6종(장소·촬영일자·GSD·센서·탐지대상·근거이미지) 미입력 시 진행 거부.
- `docs/design/copy.md` — 전 화면 카피 BEFORE→AFTER 표 + 총 단어수 상한.
- `landxi/proto/spikes/vantor-rebuild.html` — 6단계 재구축 스파이크.

**프로토 코드 (기존 파일 확장)**
- `landxi/proto/v3-tokens.css` — `:root[data-theme]` 블록 + 색 분량 % 주석(90/8/2).
- `landxi/proto/js/style.js` — `?theme=` 파서, 지도 페인트 프로퍼티까지 토큰 주입.
- `landxi/proto/system.html` — 4탭 셸 / 서체 베이크오프(+`REVERSE OUT`) / 명명된 레이아웃 5종 렌더 / 에셋 인벤토리 표.
- 신규 `landxi/proto/js/dimline.js` — 지도 위 SVG 치수선·지시 화살표·시계열 스케일 바(`map.project()` 바인딩).

**보류 (필요해지면)**
- Fish Audio API(한국어 내레이션 품질 검증 후, LX 홍보 필름 전용)
- Refero MCP / Higgsfield MCP — 유료 베타, 정적 배포 원칙과 상충. 지금은 **DESIGN.md 포맷만** 차용.
- Savee 계정 — 레퍼런스 수집용으로는 유용하나, 우리 레퍼런스는 이미 벤치마크 문서 6종에 정리되어 있다.

---

## 부록 — 원문 인용 (그대로 보존할 가치가 있는 문장)

- "There is no point building something that is beautiful and fits for purpose unless we can actually replicate it."
- "You never write a critic. The three roles are hardcoded so they never converge into the same opinion."
- "Never downgrade this one. A cheap craft critic approves everything and the loop dies on round one."
- "Adjectives are unfalsifiable; measurements are not."
- "Step 6 is the one nobody does, and it is the one that works."
- "It guesses the average of everything it has ever seen. That average is what people call AI slop. Slop is just the sound of an unwritten rule."
- "If you list six colours, you have told the model it may use six. The real design used one accent on 3% of the page. The design's actual content was a **refusal**. Write refusals down."
- "Absence is a design decision. Record it like you record anything else."
- "The look lives in the **gap** between things, not in either thing."
- "Nearly every great design breaks its own rules exactly once. … it is the first thing you lose when you copy it, because you copy the system and this is a break from the system."
- "Bans are also checkable. 'Is the hero centred?' has a yes or no answer. 'Does it feel editorial?' does not."
- "Compile, do not paste."
