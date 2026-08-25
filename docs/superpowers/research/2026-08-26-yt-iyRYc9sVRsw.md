# YouTube 분석 — `iyRYc9sVRsw` "Claude Design OS Changes Everything (Insane)"

> Land-XI 전면 개편(흰 에디토리얼 아틀라스 · Vantor 급) 관점에서의 벤치마크.
> 취향 기준: `docs/superpowers/specs/2026-08-25-client-taste-profile.md` §2 / §4 / §5 / §6.

---

## 0. 수집물 · 재현 방법

| 항목 | 값 |
|---|---|
| URL | https://www.youtube.com/watch?v=iyRYc9sVRsw |
| 제목 | Claude Design OS Changes Everything (Insane) |
| 채널 | **Jack Roberts** (@Itssssss_Jack) · 구독 263,000 |
| 업로드 | 2026-08-24 · 길이 **13:49 (829s)** · 조회 10,292 · 좋아요 250 · 카테고리 Education |
| 영상 | `build/yt/iyRYc9sVRsw.webm` (AV1 1920×1080 / opus) |
| 메타 | `build/yt/iyRYc9sVRsw.info.json`, `.description` (31개 챕터 스탬프 포함) |
| 자막 | `build/yt/iyRYc9sVRsw.en.vtt` → `build/yt/iyRYc9sVRsw.en.transcript.txt` (443줄, `[mm:ss]` 타임스탬프) |
| 프레임 | `shots/yt/iyRYc9sVRsw/` — 15초 격자 **t001–t055**, 장면전환(scene>0.4) **sc001–sc062**, 총 117장 (전량 정독) |
| 장면 타임코드 | `build/yt/iy_scene_times.txt` |

한국어 자막은 YouTube 429(Too Many Requests)로 받지 못했다. 영어 원본 자막(en / en-orig)만으로 충분했다. 재현 명령은 `yt-dlp --write-description --write-info-json --write-auto-sub --sub-langs "ko,en" -f "bv*[height<=1080]+ba/b"` + `ffmpeg -vf "fps=1/15"` 및 `select='gt(scene,0.4)',showinfo`. **주의:** 이 환경의 ffmpeg은 `-vsync` 를 거부한다(`-fps_mode vfr` 로 대체해야 한다).

---

## 1. 정체 — 이 영상은 무엇인가

**결론부터: 이것은 "예쁜 화면"의 레퍼런스가 아니라, "디자인 시스템을 기계가 실행 가능한 문서로 고정하고, 그 문서를 여러 화면·여러 모델·여러 출력 경로에 재사용하는 파이프라인"의 레퍼런스다.**

Jack Roberts는 스타트업을 매각한 뒤 AI 워크플로 콘텐츠를 만드는 크리에이터다. 이 영상은 **"Claude Design(claude.ai/design)에서 만든 디자인 시스템을 project archive로 내보내, 로컬에서 돌아가는 자기 소유의 Design OS(localhost:8083/design)에 심고, 어떤 모델로도 그 시스템대로 화면을 뽑고, 그 결과물을 Blotato API로 9개 플랫폼에 발행한다"** 는 3단계(Level 1/2/3) 튜토리얼이다.

영상은 실제로 **두 개의 서로 다른 시각 언어**를 병렬로 보여준다. 이 이중 구조가 우리에게 가장 중요한 관찰이다.

1. **설명 페이지(`127.0.0.1:8767/design-os.html`)** — 근흑(near-black) 바탕 위 **양피지(parchment) 액자에 담긴 손그림 판화 일러스트** + 대형 산세리프 헤드라인 + 이탤릭 세리프 강조어 + 오른쪽 도트 레일(스크롤 진행). 페이지 자체가 이번 영상의 대본이다. 즉 **문서가 곧 디자인 산출물**이다.
2. **작업 도구(Design OS · Claude Design)** — 다크 UI, 실사 이미지 그리드, 얇은 라벨, 숫자 배지, 우측 스펙 패널. 관리툴이지만 §3의 "SaaS 크롬" 함정을 일부 회피한 장치가 있다.

우리 프로젝트에 직결되는 지점은 세 가지다. (a) **"THE SYSTEM" 패널** — 산문+수치로 된 실행 가능한 디자인 법전. (b) **provenance/증거 표기** — 모든 생성물에 모델·엔진·크기·비용·경로를 붙인다. (c) **3D 메모리 그래프의 LOD·정직 캡션** — deck.gl/three로 곧바로 옮길 수 있는 대량 노드 렌더링 문법.

---

## 2. 타임스탬프 분해 (실제 프레임 근거)

### 00:00–00:32 훅 — "Design OS Future"
- t001: 화자 클로즈업 + **초대형 자막 번인**(2행, 흰 산세리프). 유튜브 훅 문법.
- sc013 / t002(00:15): 검정 바탕 + 녹색 발광 그리드 위 **7단 플로우 다이어그램** `TRIGGER → CAPTURE → ROUTE → AUTOMATE → AUTOMATE → REVIEW → OUTCOME`. 카드가 **좌측부터 순차로 발광 테두리를 얻으며** 켜진다(스태거). 헤드라인은 "100% tailored / to your business."
  - **관찰:** 어두운 무대 + 단색(녹색) 발광 + 순차 점등. 우리 §2.1 "어두운 무대 위 발광 데이터"와 동일 문법이지만, 여기선 **데이터가 아니라 개념 스텝**에 썼다. 이것이 이 영상 최대의 약점이자 우리가 피해야 할 지점(§6-1).

### 00:32–01:40 문제 정의 — 락인
- t004 / sc020(00:57): `design-os.html` 히어로. 섹션 칩 `● | 01 · THE CEILING`(붉은 코랄), 헤드라인 **"Beautiful. But *locked in*."**, 부제 이탤릭 세리프 1줄, 그 아래 **양피지 액자 판화**("BEAUTIFUL. BUT LOCKED IN." — 자물쇠 채워진 온실 앞의 사람, 손글씨 지시선 주석). 우측 세로 도트 레일에 현재 섹션만 코랄로 점등.
- t006: **풀블리드 번인 그래픽** "You can't send it to *clients*" + 보라 발광 프레임 안 `DESIGN --◇-- CLIENT` 2노드 다이어그램 + "It's all just design" 알약 버튼.
- t007(01:12): 3열 문제 카드 `The design can't go anywhere / You wait for what they build / Everyone ships the same design`. 각 카드 **상단에만 1px 컬러 룰**(녹/보/적)이 있고 나머지는 무테. 카드 사이는 **수직 발광 커넥터 라인**(섹션과 섹션을 잇는 실 한 가닥)이 아래로 흐른다.
  - **관찰:** "카드 그리드"를 쓰면서도 §3-1의 "균일 카드 그리드" 함정을 피한 방법 = **테두리를 없애고 상단 1px 룰만 남기고, 카드 밖의 커넥터 선으로 서사 흐름을 그린다.**

### 01:40–03:44 "Every Model, One Platform" — Design OS 실물 데모
- t003 / t010 / sc021: `localhost:8083/design`. 좌측 사이드바 `Home / Dashboard / Memory / Knowledge Graph` + `AGENTS: HERMES-AGENT, OPENCLAW`. 상단 브레드크럼 `Operator / local / V3.0 · f50ad0f`(**빌드 해시 노출**), 우측 `HERMES-AGENT ● Hermes ONLINE`.
- 페이지 헤더: **`Design` (BETA) + "Good design is as little design as possible." — Dieter Rams 인용**. 탭은 밑줄형 `#1 Create · #2 Library · #3 Insights · #4 Studio`(번호가 붙어 있다).
- 하단 상주 컴포저: 모델 칩(`Nano Banana Pro` / `Nano Banana 2`), `2 refs`, `Still|Video`, `1K/2K/4K`, `16:9`, `PNG`, `IMAGES 1 2 4 8`, 그리고 **`THIS RUN $0.06` / `2 credits`** 라이브 비용 표시 + `Generate`.
- t012 / t013 / sc022(03:01): **Library 탭** — "Find any visual on this machine without remembering the filename." 카운터 배지 `19,049 found · 594 images · 6 videos · 439 folders`. 두 개의 인덱서 카드: **`Magic Scan` (AUTOMATIC · FREE)** — "Finds file changes and reads visible words locally. Nothing leaves this Mac. `2,124 text searchable · Checked 1m ago`", **`Visual understanding` (OPTIONAL SETUP)** — "Adds scene and subject descriptions, so search understands what is actually shown. `3,987 understood · $0.038 recorded`".
  - 검색어 `burger` → 로딩 상태가 스피너가 아니라 **문장**("Searching your visuals… Results will appear together when the search is ready.")이고, 결과는 **한꺼번에** 뜬다(부분 렌더링 금지).
- t014 / sc024(03:20): 생성물 상세 — 우측 `Generation details` 패널에 `PROMPT`(복사 가능), `Generation cost 2 credits (Quote saved at generation)`, **`PROVENANCE` 블록: Model `nano_banana_flash` / Engine `Higgsfield` / Size `2752×1536px` / Ratio `16:9` / Quality `2k` / File `9.8 MB` / Created `18/08/2026, 21:14:48`**, 액션 `Remix / Reference / Download / Copy for chat / Delete / Animate image`, 최하단 `BUILT IN /Users/jackroberts/.claude-os/design/generations`.

### 03:44–07:06 Level 1 — 디자인 시스템 이식
- t015 / sc031: 레벨 표지 = `| LEVEL 01` 라벨 + **거대 이탤릭 세리프 숫자 `01`**(코랄, 발광 후광) + "Runs on *your machine*" + 양피지 판화. **레벨마다 색이 바뀐다: 01 코랄 · 02 인디고/보라 · 03 마젠타.** 섹션 간 커넥터 선도 그 색으로 그라디언트 전환.
- t017 / t018(04:15–04:30): **claude.ai/design/p/24a7ed75-…** — "Jack Roberts Design System" 문서. 좌측 목차: `Readme / Templates(Long-form explainer) / Brand(Illustration language · Logos in the wild · Voice · Elevation & the matte · Motion) / Colors(Ember — signature accent · Chapter accents · Ground — near-black indigo · Lines & ink · Parchment · Platform colours · Page wash) / Components(Brand · Content · Data · Layout · Media) / Explainer Page / Spacing(Corner radii · Page rhythm · Spacing scale · Measure & max-widths)`.
  - 본문에 **`Sources` 표**(무엇에서 이 규칙을 읽었는가: `uploads/Montenegro Lessons.html` — "The ground-truth artifact — a self-contained scrollytelling essay. Every token, component and layout rule in this system was read out of this file."), **`Not received` 문단**(브리프에 있었지만 안 온 파일: `bundle.py, gen.py, regen.py, gen_hf.sh` … "No Jack Roberts logo/wordmark was supplied"), **`Index` 표**(`styles.css` = 단일 진입점, `tokens/` = fonts·colors·typography·spacing·radii·elevation·motion·semantic, `components/brand/` = Eyebrow·SectionTag·SectionHead+Em·LeadIn·TagRow, `components/layout/` = Stage·Connector·TocRail, `components/media/` = ParchmentFrame·LogoMark, `components/data/` = StatTile+StatGrid·FlowStep+FlowRow·DotGrid·VolumeBar+VolumeStack, `components/content/` = Chip·PlanCard+PlanGrid·QuoteCallout·CtaBanner·Button, `ui_kits/longform-explainer/` = 전체 재현판).
  - 색 토큰 실물: `--ember / --ember-2 / --gold / --claude / --claude-2`(주황~코랄 5단), 챕터 액센트 `--sea-2 / --ig-2 / --gold / --green-2 / --clickup-2 / --yt-2`, 바닥 `--bg #070810 / --card #0f1119 / --card-2 #131623 / --ui #171a27`, 잉크 `--border / --border-2 / --text / --muted / --dim / --faint`.
  - 좌측 채팅에 **"What I need from you to make this perfect: 1. Send the logo. 2. Send the generation scripts. 3. Tell me the other surfaces."** — 모델이 결손 자료를 스스로 목록화해 요구한다.
  - 버튼: `Share → project HTML → project archive → Export`, 그리고 `Save as standalone HTML: the current design`.
- t019 / t031 / sc035: Claude Code 홈 "What's up next, Jack?" — `Sessions 1,882 / Messages 126,560 / Total tokens 145.3M / Active days 46 / Current streak 14d / Longest streak 14d / Peak hour 10 PM / Favorite model moonshotai/kim…` + GitHub식 기여도 히트맵 + **문장 캡션이 프레임마다 바뀐다**: "You've used ~931× more tokens than *Pride and Prejudice*." → "~1411× … *Harry Potter and the Philosopher's Stone*." → "~6605× … *The Little Prince*."
- t022(05:15): Design OS가 다운로드 폴더를 스캔해 띄우는 모달 — `DESIGN SYSTEM FOUND` / **Jack Roberts Design System** / 경로 `/Users/jackroberts/Downloads/Jack Roberts Design System (1)…` / "A full Claude Design export — … components, specimen pages. Add it and every build in this room follows it." / `Not now | Add the system`.
- t023–t027: **Studio 탭** — "Purpose-built rooms. Each one owns a format, end to end." 컴포저에 **모델 칩 + 디자인 시스템 칩 + EFFORT `Low|Medium|High|Max` + `THIS RUN: Claude plan` + `Make it`**. 결과물은 "the wall"에 **실제 페이지 썸네일**로 쌓이고, 캡션은 `Neuro login — night stage / page · Claude Fable 5 · Neuro (Duolingo idiom)` 형식(= **무엇을 · 어떤 모델로 · 어떤 시스템으로** 만들었는지).

### 07:06–08:15 Level 2 — 모델 교체
- t028(07:15): X(트위터)의 **Design Arena** 게시물 — "GLM-5.3 places 3rd overall … Elo 1351", 막대그래프 `Overall Frontend (Non-Agentic)`.
- t029 / sc037: `| LEVEL 02` + 거대 이탤릭 `02`(인디고) + "Any model, *one desk*" + **빅토리아식 파이프오르간 콘솔 판화**(모델 = 스톱 레버) → 그 아래 **3×6 균일 로고 그리드**: `CLAUDE · OPENAI · GEMINI · SEEDANCE · DEEPSEEK · QWEN / KIMI · MINIMAX · MISTRAL · GROK · LLAMA · GLM / FAL · REPLICATE · OPENROUTER · ELEVENLABS · HIGGSFIELD · "…and any you want"`.
- t033 / sc038: 컴포저 모델 칩이 `GPT 5.6 Sol` + **`CODEX PLAN` 배지**로 바뀐다(= API 크레딧이 아니라 기존 구독으로 붙는다는 것을 배지 하나로 증명).
- t021 / sc027: **Insights 탭** — `LAST 30 DAYS 81 outputs created`, `TRACKED SPEND $2.16 USD-priced generations`, `PROVIDER CREDITS 66`, `CONNECTED 4 (6 providers available)` + `Usage by provider` 가로 막대(Higgsfield 40 outputs · 66 credits / Kie.ai 39 outputs · $2.16 / …) + `Balances and access`(Higgsfield 694.26 credits, Kie.ai 4,710 credits, OpenRouter $88.54, OpenAI `Balance hidden`, fal `Setup`, Replicate `Setup`).

### 08:15–09:22 Level 3 도입 · 메모리/지식그래프
- t035: Dashboard — 메모리 요약 `312 memories · 20 types · 25 projects · 278 stale · 18 missing`(범례 Memory Core / Workspace / File / Decision / Session / Skill), 그리고 **`Project knowledge graph · POWERED BY graphify · power-design · 88 communities`** 캔버스, 하단 캡션 `densest 1,000 of 2,935 nodes` + **`Code edges are EXTRACTED (free, AST).`**
- t036 / sc049: **`MEMORY GRAPH · 3D`** — `25 workspaces · 312 memory files · 0 vector indexes`, 범례 Core/Workspace/Vector index/Stale, 우상단 `↗ Enter the Brain`. 하단 컨트롤 바: LOD 프리셋 썸네일 3개(`MID / MICRO / **FULL**`) + `⏸ Pause` / `✳ Flow` / `LITE | ✦ FULL` / `LINKS ——●——` 슬라이더 + 실시간 계수 `Nodes 380 · Edges 456 · Recall 7d 12`. 노드는 가산 발광 스프라이트, 엣지는 얇은 곡선, 축 하나가 굵은 발광 기둥.

### 09:22–13:26 Level 3 — 캐러셀 시스템 + 발행
- t039 / sc050: Blotato 랜딩(마젠타→퍼플 그라디언트, "Automate Social Media Inside ChatGPT & Claude", "Unified API + MCP … 9+ social platforms").
- t043–t046: `my.blotato.com/settings` OAuth 연결(9개 플랫폼 버튼), LinkedIn 동의 화면, `Copy Account ID / Reconnect / Disconnect`.
- t048: `Recent API requests` — `Method / Route / Status / Duration / Info / Time` 표에 **`SAMPLE` 배지가 붙은 예시 행 3개**를 미리 넣어두고 "The rows below are samples so you know what to expect once you start making calls." — **빈 상태(empty state)를 샘플 행으로 가르친다.**
- t050 / t051 / sc061(11:56–): **Carousel 룸.** 상단 룸 탭 `Carousel (Instagram · 4:5 · system-driven)` / `Design (Build anything · any model)`. 덱 셀렉터 `The Seven AI Tools ▾` + 메타 `8 slides · 1080×1350 · design-loop winner — growithalex bar`. 뷰 토글 `Strip | Phone`, 우상단 `Publish ▾`.
- 우측 **`THE SYSTEM` 패널**(경로 `/Users/jackroberts/.claude-os/design/modes/carous…`, 연필/확대 아이콘) — **팔레트 칩 `#ffffff · #111111 · #2e7d4f` 3개만**. 프레임에서 판독한 전문(발췌 아님, 거의 전량):
  - "Design system — AI Tools carousel (adapted from growithalex reference, demo purposes)"
  - "Canvas: 1080 × 1350 px (4:5). Eight slides. All type centered on the vertical axis except chrome and CTA corners."
  - **COLOUR** — "Text: `#ffffff` on dark photos, `#111111` on light photos. **No third text colour.**" / "**One accent allowed in the entire carousel**: the cover's green chip `#2e7d4f` (element-chip style). Nowhere else." / "**Backgrounds are photographs, never flat colour.**"
  - **TYPE (GOOGLE FONTS / SYSTEM)** — Quiet label: Inter 600, 44px, ls 0.5px(또는 대비되는 인격체 서체 Caveat / Playfair Display Italic) / **LOUD name: 200–300px, 슬라이드마다 다른 디스플레이 서체**(Archivo Black, Playfair Display, Anton, Bebas Neue, STIX Two Text, Archivo Black italic-skewed) — "**Never reuse the previous slide's face.**" / Subtitle: Inter 700, 58–64px, plain: "Tool — what it does in four words" / Chrome: Inter 600, 22px, ls 2.5px, uppercase.
  - **LAYOUT GRID** — "Top meta row: y = 56px centerline. Three items: `AUG 02026`(left, x=72), `JACK ROBERTS`(center), `AI SYSTEMS`(right, x=1008 right-aligned)." / "Type lockup block: starts y = 170px, ends by y = 640px." / 커버와 최종 CTA 슬라이드만 이 그리드를 깬다는 예외 규정.
  - 번호 규칙 4–7: "**Small subject, big scale.** 사진의 초점 피사체는 하단 절반의 작은 하나(말·오두막·등산객·점프하는 사람)이고 풍경/하늘에 압도된다. 피사체의 정서가 슬라이드의 메시지와 일치해야 한다. 타입은 절대 피사체를 덮지 않는다." / "**Fixed chrome on every interior slide.** 상단 메타 3항목(날짜·핸들·역할, ~10–11px 자간 캡스)이 화면 최상단에, 하단 레일은 `BACK ←— 01 02 … 08 —→ NEXT` 로 현재 인덱스를 표시. 모든 슬라이드에서 위치·크기 동일." / "**Monochrome typography.** 어두운 사진 위 순백, 밝은 사진 위 순흑. 타입에 액센트 색 0." / "**Cover and CTA break the grid the same way the reference does.**"
  - 하단 `REFERENCE ASSETS · 16` 썸네일 그리드.
- 편집(t052): 캔버스 아래 상주 바 `[Slide 01 | Whole set]` + 자유문 입력 `"make it a misty valley at dawn"` + `Regenerate` → 진행 표시가 `Working…` + "Regenerating the photograph…" **문장**. 즉 **스코프(한 장/전체) + 자연어 + 부위별 재생성**.
- t054: `Publish ▾` → "WHERE THIS DECK GOES" 팝오버 — Instagram/LinkedIn/Threads/X는 계정 선택 드롭다운, Bluesky는 `first 4` 같은 제약 라벨, 버튼 **"Push to 5 platforms"**, 캡션 "Rides your Blotato account — one call, native carousels everywhere."

### 13:26–13:49 아웃트로
- 다음 영상(코드로 모션그래픽) 예고. 실질 정보 없음.

---

## 3. 프런트엔드 기법 → 우리 스택(MapLibre 5.6 / deck.gl 9.3 / three 0.185 / 바닐라 · 정적) 이식표

| # | 기법 (관찰 위치) | 무엇인가 | 우리 스택 구현 | 난이도 | 대상 화면 |
|---|---|---|---|---|---|
| F1 | **TocRail 도트 레일** (t004·t015 우측) | 화면 우측 고정 세로 도트, 현재 섹션만 액센트로 점등·확대. 컴포넌트 인덱스에 `components/layout/TocRail` 로 정식 등록되어 있다 | `IntersectionObserver` + `position:fixed` `<nav>`; 점 8px→10px, 색 `#DDD → #006DF7`, 180ms `cubic-bezier(.22,1,.36,1)`. 지도 화면에서는 **악장 인덱스**(디센트/아틀라스)로 사용 | 하 | 메인 스크롤리, 리포트 |
| F2 | **Connector — 섹션을 잇는 발광 실 한 가닥** (t007·t008·t042) | 섹션 사이 여백에 1px 세로선이 흐르고, 다음 섹션 색으로 그라디언트 전환. 이것 하나로 "페이지 전환"이 "한 줄기 흐름"이 된다 | 단일 `<div class="connector">` + `background:linear-gradient(var(--from),var(--to))` + `scaleY` 스크롤 바인딩. **§5-4 "같은 지도의 카메라 이동"의 문서판** | 하 | 아틀라스 서사 |
| F3 | **ParchmentFrame — 액자에 담긴 설명 그림** (t004·t016·t034·t042) | 카드가 아니라 **1px 액자 + 종이 질감 + 손글씨 지시선 주석**. 다이어그램을 "삽화"로 대접 | 우리는 이미 §6에서 "Frame-not-Card"를 확정했다. 추가로 가져올 것은 **지시선 주석(leader line + 소문자 캡션)**: SVG `<path>` + 8px 라벨. 양피지 질감은 버리고 **정사영상 실사**로 대체 | 중 | 서비스 설명, 방법론 |
| F4 | **레벨 표지 — 거대 이탤릭 세리프 숫자** (t015·t029·t034) | `| LEVEL 01` 라벨 + 300px 이탤릭 숫자 + 후광 + 헤드라인. 챕터마다 **색이 하드 전환**(코랄→인디고→마젠타) | 우리는 액센트 1개(LX 블루) 원칙이므로 **색이 아니라 명도 램프**로 챕터를 구분한다. 숫자는 Inter tabular 200–300px, `clip-path: inset(-5px 0)` 라인 마스크 리빌 | 하 | 악장 표지 |
| F5 | **상단 1px 룰만 남긴 무테 카드** (t009) | 카드 테두리를 지우고 상단 컬러 룰 1개만 → 그리드가 "카드 나열"로 안 읽힌다 | `border:0; border-top:1px solid var(--accent)`; 배경은 바탕과 동일. §3-1 회피의 가장 값싼 수단 | 하 | 13 서비스 목록 |
| F6 | **번호 붙은 밑줄형 탭** `#1 Create #2 Library #3 Insights #4 Studio` (t011) | 탭에 번호를 붙이면 "메뉴"가 아니라 "순서·장(chapter)"으로 읽힌다 | 순수 CSS. 우리 결과 뷰 탭(영상/탐지/변화/리포트)에 번호 부여 | 하 | 결과 매칭 뷰 |
| F7 | **상주 컴포저 바 + 라이브 비용 배지** (`THIS RUN $0.06`) (t003·t011) | 화면 하단에 고정된 조작 바에 **이번 실행의 비용/플랜**이 실시간으로 뜬다 | 우리 버전 = **`THIS VIEW` 배지**: 현재 뷰포트에서 로드된 타일 수·피처 수·마지막 갱신 시각. `map.on('idle')` + `queryRenderedFeatures().length` | 중 | 옵서버토리/분석 뷰 |
| F8 | **문장형 로딩·빈 상태** ("Searching your visuals… Results will appear together when the search is ready.") (sc022) | 스피너 대신 **무슨 일이 일어나는지 문장으로**. 결과는 한꺼번에(부분 팝인 금지) | §5-11 "로더는 스피너가 아니라 3단 조립"의 텍스트판. `aria-live="polite"` 한 줄 + 3단 조립 애니메이션 | 하 | 전 화면 |
| F9 | **SAMPLE 배지가 붙은 예시 행으로 빈 상태 교육** (t048) | 데이터가 없을 때 표를 비우지 않고, **`SAMPLE` 라벨을 단 예시 행**을 보여준다 | 우리 §3-6("가짜 숫자 금지")과 충돌하지 않는 유일한 형태 = **명시적 SAMPLE 라벨 + 무채색 + 점선 테두리**. 남원 이외 지역 결손 슬롯에 적용 | 하 | 결과 매칭 뷰 |
| F10 | **3D 그래프 LOD 프리셋 + 라이브 계수** (t036) | `MID/MICRO/FULL` 썸네일 프리셋 + `Pause/Flow` + `LITE/FULL` + LINKS 밀도 슬라이더 + `Nodes 380 · Edges 456` 실시간 표시 | deck.gl `ScatterplotLayer`(가산 혼합) + `LineLayer`, LOD는 `updateTriggers` 로 `radiusMinPixels`/`sizeScale` 프리셋 전환. 계수는 `layer.props.data.length` 직접 표시 | 중 | 탐지 밀도 뷰 |
| F11 | **"densest 1,000 of 2,935 nodes" 정직 캡션** (t035) | 렌더링 상한을 숨기지 않고 캡션에 쓴다 | §5-9(모든 숫자는 해설)의 정확한 실행례. `표출 N / 전체 M · 기준: 신뢰도 상위` 를 범례 하단 고정 | 하 | 전 분석 뷰 |
| F12 | **정지 스탬프가 아니라 순환하는 위트 캡션** (t019/t031/sc035) | 유휴 상태에서 **실데이터로 계산된 비유**가 계속 바뀐다(Pride and Prejudice → Harry Potter → The Little Prince) | §5-2("5초간 아무것도 안 해도 실데이터 때문에 움직인다")의 최저비용 구현. 우리 버전: "남원 정사영상 1도엽 = 축구장 N개", "이번 스캔 면적 = 여의도 N배"를 6–9초 주기로 교체 | 하 | 히어로, 리포트 |
| F13 | **스코프 토글 + 자연어 부분 재생성** (`[Slide 01 | Whole set]`) (t052) | 편집 대상 범위를 먼저 고르고, 그 다음 자유문. 결과는 그 부위만 다시 만든다 | 자연어 입력은 과하다. **스코프 칩만** 채택: 슬라이더·임계 조작이 `[이 도엽 | 전체 지역]` 중 어디에 걸리는지 항상 보이게 | 중 | 옵서버토리 |
| F14 | **결과물 캡션 = 무엇 · 모델 · 시스템** (`Neuro login — night stage / page · Claude Fable 5 · Neuro (Duolingo idiom)`) (t027) | 썸네일 아래 12px 캡션이 **출처를 밝힌다** | §6 "1px 액자 + 바깥 위쪽 12px 캡션"에 센서/일자를 추가: `여수 신항 · KOMPSAT-3A · 2025-11-04 · GSD 0.55m` | 하 | 모든 이미지 액자 |
| F15 | **판독 가능한 빌드 해시 + ONLINE 상태등** (`V3.0 · f50ad0f`, `● Hermes ONLINE`) (t011) | 도구가 "살아있는 시스템"으로 읽히게 하는 최소 장치 | `● LIVE` 스탬프(§5-10)에 **데이터 최종 수집일**을 붙여 `● LIVE · 2026-08-24 수집` | 하 | 전 화면 헤더 |

### 3.1 모션·타이포 관찰(수치)
- 순차 점등(t002): 카드 7개가 좌→우로 켜지며, 켜진 카드는 **테두리 발광 + 미세 상승**. 프레임 판독상 60–80ms 스태거. 우리 §5-11(60ms 스태거)과 일치한다.
- 헤드라인 조판: **굵은 산세리프 + 마지막 1–2 단어만 이탤릭 세리프 + 액센트색**("Beautiful. But *locked in*.", "Any model, *one desk*", "Create, *then post*", "Edit it, make it *yours*"). 한 문장 안에서 서체를 갈아끼워 강조한다.
  - **우리 적용 주의:** §4는 SUIT Medium 단일 굵기를 확정했고 한글에는 이탤릭 세리프 대응이 없다. → **서체 교체가 아니라 "액센트 색 + 낱말 단위 clip-path 리빌"** 로 번역해야 한다. 예: "부처는 다섯, **영상은 하나다**".
- 부제는 항상 **이탤릭 1줄, 회색, 헤드라인 대비 약 28% 크기**. 이 "헤드라인 + 부제 1줄" 리듬이 페이지 전체에서 한 번도 깨지지 않는다. 우리 아틀라스에도 같은 강제 리듬이 필요하다.
- 섹션 칩: `● | 01 · THE CEILING` — 불릿 + 파이프 + 번호 + 자간 넓은 캡스. 알약 테두리는 액센트색 20% 알파. 우리 `SectionTag` 대응물로 그대로 쓸 수 있다(라운드만 0으로).

---

## 4. 데이터/AI 노하우 → 우리 스택 이식표

| # | 노하우 (관찰 위치) | 요지 | Land-XI 적용 | 난이도 | 대상 |
|---|---|---|---|---|---|
| D1 | **디자인 시스템 = 기계가 실행하는 법전** (t050/t051 `THE SYSTEM`) | 색 3개, 서체 역할 4개, **좌표 수치(y=56, x=72, x=1008, y=170→640)**, 금지 규칙("No third text colour", "Never reuse the previous slide's face")까지 산문으로 못박음. 파일 하나(`modes/carousel/…`)에 산다 | 우리 §4를 **`design/system.md` + `design/tokens/*.css` 로 승격**하고, 화면 생성 프롬프트가 항상 이 파일을 참조하게 한다. 특히 "허용 액센트 1개", "숫자는 Inter tabular", "라운드 0", "유리 화면당 1개"를 **금지문**으로 기술 | 중 | 저장소 전체 |
| D2 | **Sources / Not received / Index 3종 세트** (t017) | 무엇을 근거로 만들었는가 · 무엇이 없어서 못 만들었는가 · 산출물이 어디 있는가 | 우리 리포트·화면 모두에 동일 3종 적용. §6 "결손은 점선 무채 액자 + 이유 한 줄"의 상위 문서판 | 하 | research/, 리포트 화면 |
| D3 | **Provenance 블록** (t014: Model/Engine/Size/Ratio/Quality/File/Created/경로) | 모든 산출물에 생성 조건 전량 부착 | 지오 버전: **센서 / 촬영일 / GSD / 좌표계 / 도엽번호 / 처리단계(정사보정·모자이크) / 모델·버전 / 신뢰도 임계**. 클릭하면 펼쳐지는 `<details>` | 하 | 모든 결과 이미지 |
| D4 | **로컬 우선 인덱스 + 선택적 VLM 이해** (t012: Magic Scan FREE vs Visual understanding OPTIONAL, `$0.038 recorded`) | 1단계는 무료·로컬(파일 변화·가시 문자 OCR), 2단계는 유료·선택(장면·피사체 설명). **비용을 화면에 기록** | 우리 자산(남원 4시점 정사영상, 드론, 제주, 해양쓰레기)에 동일한 2단 인덱스: (1) GDAL로 메타·썸네일·범위 추출(무료), (2) 선택적으로 타일 캡셔닝. `docs/`에 비용 로그 | 중 | 자산 카탈로그 |
| D5 | **graphify — AST 결정론 파싱 + 엣지 출처 태깅** (t035: "Code edges are EXTRACTED (free, AST)") | 엣지를 `EXTRACTED`(소스에 명시) / `INFERRED`(모델이 해석) / `AMBIGUOUS`(미해결)로 **구분해 표기**. 벡터스토어 없음, 전량 로컬 | **이번 조사 최대의 수확.** 우리 탐지 레이어에 그대로: `측정(EXTRACTED)` / `추정(INFERRED)` / `미확정(AMBIGUOUS)`. 색이 아니라 **선 종류**로 구분(실선/점선/파선), 범례에 정의문 1줄. §3-6(가짜 신뢰도 금지)을 지키면서도 예측을 화면에 올릴 수 있는 유일한 길 | 중 | 옵서버토리, 변화탐지 |
| D6 | **비용/사용량 대시보드를 제품 안에** (t021 Insights) | 4스탯 + provider별 막대 + 잔액표. `Balance hidden`, `Setup` 같은 **미연결 상태도 노출** | 우리 관리자 리포트: `처리 도엽 수 / 처리 시간 / GPU-시간 / 연결 데이터소스(V-World·국토지리정보원·자체)` + **미연결 소스도 회색으로 남긴다** | 중 | 관리자 리포트 |
| D7 | **메모리 stale/missing 계수** (t035: `278 stale · 18 missing`) | 신선하지 않은 것과 없는 것을 **수치로 자백** | `기준시점 경과 N일 · 미수집 도엽 M` 배지. §5-9의 강제 이행 | 하 | 자산 카탈로그 |
| D8 | **모델 무관 실행층 + plan badge** (t033 `CODEX PLAN`) | 어떤 모델·어떤 결제수단으로 이 결과가 나왔는지 배지 하나로 | 우리는 모델을 바꾸지 않지만, **"어떤 알고리즘 버전으로 탐지했는가"** 배지를 동일 위치에: `YOLOv11-seg · v2.3 · conf 0.45` | 하 | 탐지 결과 |
| D9 | **Design Arena Elo 벤치마크 활용** (t028) | 프런트엔드/디자인 태스크 전용 Elo 리더보드. 30+ 카테고리(Website, UI Components, Web Apps, Image, Logo, SVG, Game Dev, Data Visualization, HTML Slides 등) | 우리 UI 생성 작업의 모델 선택 근거. 특히 `Data Visualization`, `SVG`, `Website` | 하 | 작업 프로세스 |
| D10 | **참조 자산 고정(REFERENCE ASSETS · 16)** (t051) | 스타일 재현에 쓸 레퍼런스 이미지를 시스템 옆에 **고정 16장**으로 묶어둠 | `shots/bench/` 중 Vantor·planet·all4land 대표 16장을 `design/references/` 로 승격, 화면 작업 시 항상 동반 참조 | 하 | 저장소 |
| D11 | **발행 = 하나의 호출, 다중 대상** (t054 "Push to 5 platforms") | 산출물이 도구 밖으로 나가는 경로가 제품 안에 있다 | 우리 대응: **리포트 내보내기**(PDF·PNG·GeoJSON·WMTS 링크)를 결과 화면 안에서 한 번에. 지자체 담당자가 "가져갈 수 있는" 것이 §5의 실무 증거 | 중 | 리포트 |
| D12 | **결손 자료를 모델이 스스로 목록화해 요구** (t017 "What I need from you to make this perfect: 1…2…3…") | 산출물이 자기 한계를 명시하고 다음 입력을 지정한다 | 우리 리포트 말미에 **"이 화면을 완성하려면 필요한 것"** 3항 고정(예: 여수 2025 하반기 정사영상, 국산리 현장 검증 좌표, 제주 해안 클래스 정의) | 하 | 리포트, research/ |

---

## 5. "지금 훔칠 것" TOP 5

1. **`design/system.md` — 수치까지 박힌 실행 가능한 법전 (D1)**
   지금의 §4는 서술형이다. Jack의 `THE SYSTEM`처럼 **좌표·픽셀·금지문**으로 바꾼다. 초안 골격:
   `캔버스 1440 · 12열 · 여백 72px. 상단 메타행 y=56 센터라인, 3항목(지역 좌 x=72 · 센서 중앙 · 수집일 우 x=1368 우측정렬). 헤드라인 락업 y=170 시작, y=640 종료. 텍스트 색: 어두운 사진 위 #FFFFFF, 밝은 종이 위 #010102 — 제3의 텍스트 색 없음. 액센트는 화면 전체에 1개(#006DF7), 탐지 순간에만 #FFB633 380ms — 그 외 어디에도 없음. 라운드 0. 그림자 0. 유리 화면당 1개. 배경은 정사영상 사진이며 단색 면을 배경으로 쓰지 않는다.`
2. **EXTRACTED / INFERRED / AMBIGUOUS 3단 출처 태깅 (D5)**
   graphify의 문법을 지오 데이터로 번역한다. `측정 = 실선 + 채움` / `추정 = 점선 고스트` / `미확정 = 무채 파선 + 이유 한 줄`. 범례에 정의를 반드시 노출. 이것 하나로 §3-6(가짜 신뢰도)과 §5-10(예측은 점선 고스트)을 동시에 만족한다.
3. **Connector + TocRail 2종 레이아웃 컴포넌트 (F2 · F1)**
   구현 반나절. 효과는 "페이지 전환이 아니라 한 줄기 흐름"이라는 §2 핵심 요구의 문서판 충족. 지도 악장 전환과 결합하면 스크롤 = 카메라 = 실 한 가닥이 된다.
4. **정직 캡션 3종 세트 (F11 · D7 · D3)**
   `표출 1,000 / 전체 2,935 (신뢰도 상위)` · `278건 기준시점 경과 · 18건 미수집` · Provenance `<details>`. 총 작업량 1일 미만인데 §5-9를 통째로 충족한다.
5. **문장형 로딩 + 순환 위트 캡션 (F8 · F12)**
   스피너를 전부 제거하고 "무슨 일이 일어나는지"를 문장으로. 유휴 시 실데이터 기반 비유가 6–9초 주기로 교체된다. §5-2·§5-11을 최저비용으로 통과한다.

---

## 6. "하지 말 것" 리스트 (이 영상에서 명확히 배제할 것)

1. **개념 스텝을 발광 다이어그램으로 만드는 것** (t002 `TRIGGER→…→OUTCOME`). 데이터가 아닌 것을 발광시키면 즉시 "AI 슬롭"이다. 우리 §2.1의 발광은 **실측 탐지 결과에만** 허용한다.
2. **챕터마다 액센트 색을 바꾸는 것** (코랄→인디고→마젠타, `--sea-2/--ig-2/--yt-2` 챕터 팔레트). §4는 액센트 1개를 확정했다. 챕터 구분은 **명도 램프와 하드 반전**으로.
3. **양피지 질감 · 손그림 판화 삽화.** Jack의 시그니처지만 우리와 정반대다. §2.1은 "이미지를 사진으로 대접"이 원칙 — 설명 그림이 필요하면 **정사영상 크롭 + 헤어라인 벡터 주석**으로 그린다.
4. **한 문장 안 서체 교체(산세리프 + 이탤릭 세리프).** 한글 대응이 불가능하고 §4의 단일 굵기 원칙에 위배된다. 강조는 색 + 라인 마스크 리빌로.
5. **보라/마젠타 그라디언트 히어로** (t039 Blotato 랜딩). §2 "AI 슬롭" 판정 대상 그 자체.
6. **유튜브식 초대형 자막 번인 + 얼굴 PiP.** 웹 화면 문법이 아니다.
7. **사이드바 + 상단 탭 + 우측 스펙 패널 3중 크롬** (t050 캐러셀 룸). §3-5 "관리자 SaaS 크롬이 첫인상"에 정확히 걸린다. 우측 스펙 패널의 **내용**(THE SYSTEM)은 훔치되 **배치**는 훔치지 않는다 — 그 내용은 문서로 빼고 화면에서는 캡션 한 줄로만 노출한다.
8. **`BETA` 배지 + 디자이너 인용구(Dieter Rams) 헤더.** 제품이 스스로를 설명하는 장치는 관리툴 냄새를 강화한다.
9. **크레딧/코인 경제 UI**(`2 credits`, `THIS RUN $0.06`). 개념(F7)은 좋지만 **화폐 단위는 우리 도메인에 없다** — 면적·도엽·처리시간으로 환산해야 한다.
10. **알약형 라운드 버튼·라운드 카드(12–16px).** §4는 라운드 0을 확정했다. 이 영상은 전면 라운드다.

---

## 7. 취향 프로필 적합성 판정

### §2 (레퍼런스 공통분모) 대비
- **위성영상을 사진으로 다룬다** — ✕. 이 영상은 사진 대신 판화 삽화를 쓴다. 다만 캐러셀 시스템이 "Backgrounds are photographs, never flat colour"를 **명문화**한 점은 정확히 우리 편이다. 규칙 문장 자체를 가져올 가치가 있다.
- **어두운 바닥 위 발광 데이터** — △. 바닥은 맞으나 발광 대상이 데이터가 아니다(§6-1). 예외적으로 **3D 메모리 그래프(t036)만** 우리 기준을 통과한다: 실제 노드 380개, 가산 발광, LOD 프리셋, 실시간 계수.
- **한 대의 연속 카메라** — ○(문서판). Connector 실선 + TocRail로 스크롤을 하나의 흐름으로 묶었다. 지도 카메라의 대체물로 유효.
- **탐지의 사건화** — ✕. "도착의 순간"이 없다. 값은 그냥 떠 있다. 이것이 이 영상이 §5-5를 통과하지 못하는 이유다.
- **절제된 색** — △. 캐러셀 시스템은 3색(백·흑·녹 1) 규칙으로 모범적이지만, 설명 페이지는 챕터마다 색을 바꾸어 스스로 규칙을 깬다.
- **숫자는 mono, 제목은 굵고 짧게** — ○. `Inter tabular` 명시, 헤드라인 3–5 단어.
- **살아있음의 최소 조건** — ○(부분). 순환 위트 캡션(F12)과 순차 점등(3.1)이 유휴/도착을 채운다.

### §4 (서체·색·모션 체계 v3) 대비
- 우리 확정값과 **직접 충돌**하는 것: 챕터 액센트 6색(우리는 1색), 이탤릭 세리프 강조(우리는 SUIT 단일 굵기), 라운드 카드·발광 테두리(우리는 라운드 0 · 그림자 0).
- 우리 확정값을 **강화**하는 것: "액센트는 전체에 1개, 그 외 어디에도 없음", "타입에 액센트 색 0", "제3의 텍스트 색 없음" — 이 3개 금지문은 §4에 **그대로 추가할 만하다**. 우리 §4는 "액센트 1"을 서술했을 뿐 "그 외 어디에도 없음"을 금지문으로 못박지 않았다.
- 모션: 60–80ms 스태거, 순차 점등, `Working…` 문장 진행 — §5-11(60ms 스태거, 로더 3단 조립)과 정합.

### §5 (판정 규칙 10문항) 대비 — 이 영상의 화면을 우리 기준으로 채점
1. 첫 프레임 실영상 60% — **✕**(얼굴/삽화)
2. 5초 무동작 시 실데이터 기반 움직임 — **○**(순환 캡션, 3D 그래프 flow 모드)
3. 호버 물리 반응 — **판정 불가**(호버 전이가 프레임에 미포착). 액자 코너 브래킷 문법은 없음 → 우리 쪽이 앞선다
4. 화면 전환 = 같은 지도 카메라 이동 — **N/A**(지도 없음). 문서판 대체(Connector)는 유효
5. 데이터가 나타날 때 사건 — **✕**
6. 단색 + 액센트 1 — **캐러셀 ○ / 설명 페이지 ✕**
7. 헤드라인 짧고 구체적 — **○**
8. 차트 값 도착 + 슬라이더 동기 — **✕**(Insights 막대는 정적)
9. 모든 숫자가 해설인가 — **◎ 최고점**(`densest 1,000 of 2,935`, `278 stale · 18 missing`, `Code edges are EXTRACTED (free, AST)`, `$0.038 recorded`, `2,124 text searchable · Checked 1m ago`)
10. 화면당 움직임 1개 + LIVE 스탬프 + 락온 3비트 — **△**(`● Hermes ONLINE` 있음, 락온 없음)

**총평: 시각적으로는 우리가 배제한 방향(삽화·다색·라운드)이지만, 정보 위생(§5-9)에서는 지금까지 본 어떤 벤치마크보다 앞선다.** 우리가 가져올 것은 룩이 아니라 **"모든 숫자에 출처·상한·결손을 붙인다"는 습관**과 **"디자인 시스템을 수치로 못박은 단일 파일"** 두 가지다.

### §6 (옵서버토리 확정표) 대비
- **액자 원칙(Frame-not-Card)** — 이 영상의 ParchmentFrame이 정확히 같은 사상이다. 다만 우리는 "면적의 70% 이상이 실제 픽셀" 조건이 있으므로 삽화가 아니라 정사영상이어야 한다.
- **유리 화면당 1개** — 이 영상은 위반(다중 패널). 우리 규칙 유지.
- **임계 컨트롤 = 히스토그램 위 마커** — 이 영상에는 없다. 우리 고유 강점으로 유지.
- **결손 처리** — D2(Not received) / D7(stale·missing) / D12(필요 자료 요구)가 우리 "점선 무채 액자 + 이유 한 줄"을 **문서 레벨까지 확장**한다. §6 표에 **"리포트 문서에도 Sources / 미수신 / Index 3종을 붙인다"** 항을 추가할 것.
- **중단 가능한 연출** — 이 영상에는 해당 장치가 없다(스크롤리 뿐). 우리 규칙 유지.

---

## 8. 설치·도입할 도구와 스킬

### 즉시 도입 (무료 · 로컬)
| 도구 | 용도 | 근거 |
|---|---|---|
| **graphify** (`Graphify-Labs/graphify`, tree-sitter 36개 언어, 로컬 AST, 벡터스토어 없음, EXTRACTED/INFERRED/AMBIGUOUS 태깅, Claude Code용 `/graphify` 스킬 제공) | (a) 우리 저장소의 코드 지식그래프 → 프로토 간 의존 파악 (b) **출처 태깅 어휘 차용**(D5) | t035 캡션 + 공식 저장소 |
| **Design Arena** (designarena.ai, 30+ 리더보드) | UI 생성 작업의 모델 선택 근거 | t028 |
| **Claude Design project archive export** (`Share → project HTML → project archive → Export`) + `Save as standalone HTML` | 우리 디자인 시스템을 저장소 밖으로 이식 가능한 아카이브로 고정 | t016 · t017 |

### 저장소에 만들 것 (우리 손으로)
1. `design/system.md` — D1의 수치 법전(§4 승격판, 금지문 포함).
2. `design/tokens/` — `colors.css` `typography.css` `spacing.css` `motion.css` `semantic.css` (Jack의 `tokens/` 구성만 차용, 값은 §4).
3. `design/references/` — Vantor·planet·all4land 대표 16장 고정(D10).
4. `landxi/proto/js/provenance.js` — D3 블록 렌더러(센서·촬영일·GSD·좌표계·도엽·처리단계·모델·임계).
5. `landxi/proto/js/toc-rail.js` + `connector.js` — F1·F2(반나절).
6. `docs/superpowers/research/` 템플릿에 **Sources / 미수신 / Index** 3종 섹션 상시화(D2) — 본 문서가 그 첫 적용례다.

### 도입하지 않을 것
- **Blotato** (blotato.com · MCP `mcp.blotato.com/mcp` · 28 tools · 9 플랫폼 · $29/mo) — SNS 자동 발행은 Land-XI(공공 지오 플랫폼) 도메인과 무관. 다만 "산출물이 도구 밖으로 나가는 경로가 제품 안에 있어야 한다"는 **사상(D11)** 만 리포트 내보내기로 번역한다.
- Higgsfield / Kie.ai / fal / Replicate / Nano Banana Pro 등 이미지 생성 프로바이더 — 우리는 §3-6에 따라 **실제 정사영상만** 쓴다. 생성 이미지는 어떤 화면에도 들어가지 않는다.
- Spline 3D — three 0.185 직접 제어가 우리 요구(카메라 연속 · 중단 가능)에 더 맞다.

---

## 9. 남은 리스크 · 후속 확인

- 호버/전이 마이크로 인터랙션은 15초 격자·장면전환 프레임으로는 포착되지 않았다. 필요하면 스크롤리 구간(00:40–01:30, 06:50–07:10, 08:40–09:10)을 대상으로 **0.2초 간격 부분 추출**을 별도로 돌려야 한다.
- 한국어 자막은 YouTube 429로 미수집(영어로 충분). 재시도 시 요청 간격을 두어야 한다.
- graphify의 스타 수(85,000+)는 3자 블로그 주장이라 공식 저장소에서 별도 확인이 필요하다. 우리가 차용하는 것은 스타가 아니라 **엣지 출처 태깅 어휘**이므로 도입 결정에는 영향이 없다.

---

## Sources
- 영상: [Claude Design OS Changes Everything (Insane) — Jack Roberts](https://www.youtube.com/watch?v=iyRYc9sVRsw) (2026-08-24, 13:49)
- [Graphify-Labs/graphify (GitHub)](https://github.com/Graphify-Labs/graphify) · [How Graphify works: concepts](https://graphify.com/concepts) · [What is a code knowledge graph?](https://graphify.com/blog/code-knowledge-graph-vs-grep)
- [Design Arena](https://www.designarena.ai/)
- [Blotato — Social Media APIs for AI Agents](https://www.blotato.com/) · [Blotato MCP](https://www.blotato.com/mcp)

## 미수신 / 확인 불가
- 한국어 자막(HTTP 429).
- 호버·전이 프레임(샘플링 간격 한계).
- `design-os.html` 원본 소스 — 로컬 `127.0.0.1:8767` 이며 공개되지 않음.
- Jack Roberts Design System 아카이브 실물 — 비공개 URL `claude.ai/design/p/24a7ed75-8b82-41a3-8573-00b9347d2bc4`.
- Design OS(`localhost:8083`) 자체 — 유료 강좌(claude-code-curriculum-deploy.vercel.app) 산출물로, 코드 비공개.

## Index — 이 조사가 남긴 것
| 경로 | 내용 |
|---|---|
| `docs/superpowers/research/2026-08-26-yt-iyRYc9sVRsw.md` | 본 보고서 |
| `shots/yt/iyRYc9sVRsw/t001–t055.jpg` | 15초 격자 프레임 55장 |
| `shots/yt/iyRYc9sVRsw/sc001–sc062.jpg` | 장면전환 프레임 62장 |
| `build/yt/iyRYc9sVRsw.{webm,info.json,description}` | 원본 영상 · 메타 · 설명(챕터 31개) |
| `build/yt/iyRYc9sVRsw.en.transcript.txt` | 타임스탬프 대본 443줄 |
| `build/yt/iyRYc9sVRsw.en.vtt` / `.en-orig.vtt` | 원본 자막 |
| `build/yt/iy_scene_times.txt` | 장면전환 타임코드 62개 |
