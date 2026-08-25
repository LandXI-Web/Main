# 영상 분석 — "Claude Code + Seedance 2.5 = Insane Websites" (Kyle Skelly)

> 상태: **조사 완료** (2026-08-26) · 키프레임 87장 전량 육안 판독 · 트랜스크립트 대조 완료
> 조사 대상: https://www.youtube.com/watch?v=YUWBku1cNEA
> 목적: Land-XI 전면 개편(흰 에디토리얼 아틀라스 / Vantor 급)에 이식 가능한 **프런트엔드 기법**과 **데이터·AI 제작 노하우**를 추출한다.
> 근거 자료: `build/yt/YUWBku1cNEA.info.json` · `build/yt/YUWBku1cNEA.transcript.txt` · `shots/yt/YUWBku1cNEA/`(키프레임 87장: 15초 등간격 42 + 장면전환 45, 전량 육안 판독)

---

## 0. 영상의 정체

| 항목 | 값 |
|---|---|
| 제목 | Claude Code + Seedance 2.5 = Insane Websites |
| 채널 | **Kyle Skelly** (@kyleslyf) · 구독 56,600 · 카테고리 Education |
| 업로드 | 2026-08-09 · 길이 **10:29(629초)** · 1920×1080 / 24fps |
| 반응 | 조회 213,591 · 좋아요 5,999 · 댓글 121 |
| 스폰서 | **Higgsfield**(higgsfield.ai) — Seedance 2.5 프로모션 |
| 저자 링크 | futuredesigner.io(유료 강좌 $349) · x.com/KyleSkelly · kyleskelly.com |

**한 줄 요약**: "클라이언트가 사진을 한 장도 안 줬을 때, Figma에서 디자인하고 → AI로 사진과 **영상**을 만들고 → Claude Code로 실제 사이트를 구현하는" 10분짜리 풀 워크플로우 실연.

**우리에게 중요한 지점은 두 가지다.**

1. 튜토리얼의 클라이맥스는 "AI가 코드를 짰다"가 아니라 **스크롤로 스크러빙되는 20초짜리 타임랩스 영상 섹션**이다. 스크롤 위치와 `video.currentTime`을 묶고, UI는 sticky로 고정하고, 4분할 진행바가 채워진다. 이건 Land-XI의 "**한 대의 연속 카메라**"(취향 프로필 §2)를 *3D 없이* 구현하는 가장 값싼 방법이다.
2. 영상 후반 Claude Code의 출력 로그가 화면에 통째로 남는데, 여기에 **스크럽 재생을 실무 품질로 만드는 구체 수치와 인코딩 옵션**이 전부 적혀 있다(`-g 5`, 400vh 러너웨이, rAF lerp, 백그라운드 탭 direct-seek 폴백, poster 승계). 남의 블로그 요약이 아니라 실행된 결과의 자백이라 신뢰도가 높다.

디자인 자체(어두운 건설사 랜딩)는 우리의 **B안(흰 에디토리얼 아틀라스)과 정반대**이므로, 색·톤은 버리고 **메커니즘과 조판 문법만** 가져온다.

---

## 1. 타임스탬프 브레이크다운

### 00:00–00:31 · 오프닝 / 완성본 티저
- 완성 히어로가 먼저 나온다: 풀블리드 야간 건설현장 사진 위에 초대형 `BUILD` 워드마크. 굴착기 붐대가 글자 **U와 I 사이를 관통**한다(텍스트가 피사체 뒤로 들어감).
- 스킷: 소파에 누운 저자에게 "Hey Kyle, I need a site for my construction company…" → "Yup, no problem!" 아이메시지 오버레이. 튜토리얼 문제 설정.

### 00:31–01:05 · Figma 셋업 (프레임 s004–s006, t011)
- Frame = **MacBook Pro 14"(1512×982)**, 최종 페이지 프레임은 1512×5368.
- 배경 색 선택 패널에 Hex `151515` → 최종 `141615`(약간 초록 도는 검정). 저자 원문: *"We don't want to go full black… a slight black, but then also a slight green."* → **완전 검정 대신 아주 낮은 채도의 색조 검정**. (우리 §4의 `#010102`와 같은 사고, 방향만 반대)
- 컬럼: **12 columns** 레이아웃 가이드.
- 서체는 **Geist**(본문/UI), 브랜드 워드마크는 `CONSTRUX` + 4장 회전 사각형 로고, 액센트 `FF4D00`(주황).
- 네비게이션은 **알약형 글래스 필(pill)** — 다크 라운드 캡슐 안에 Home/Projects/Services/About, 활성 항목만 더 밝은 칩.

### 01:05–01:53 · AI 이미지 생성(Higgsfield / Nano Banana Pro) (s007–s010, t007–t009)
- higgsfield.ai/ai/image?model=nano-banana-pro. 상단 네비: Explore / Image / Video / Audio / Cinema Studio / **MCP & CLI** / Supercomputer / Academy / Community / Contests / Plugins / Marketing Studio / Canvas / Originals.
- 이미지 모델 카탈로그(t006): Higgsfield Soul 2.0, Soul Cinema, GPT Image 2, **Seedream 5.0 Pro**, Nano Banana 2 Lite, **Nano Banana Pro**, Recraft V4.1, Grok Imagine, FLUX.2, Z-Image, **Topaz**(업스케일). 기능 메뉴: Cinematic Cameras, Canvas, Soul Moodboard, Soul ID Character, Relight, Inpaint, Image Upscale, Face Swap 등.
- 실제 프롬프트(전문, 화면에서 판독):
  > Cinematic luxury construction site at night, a large yellow excavator centered in the frame in front of a modern architectural home, low-angle composition, dramatic storm clouds, moody blue-black sky, warm work lights illuminating the excavator and house, atmospheric haze, wet muddy ground with subtle reflections, bold contrast, **simplified forms with slightly reduced micro-detail**, premium architectural visualization, ultra-realistic, volumetric lighting, minimalist composition, **no people, no text, no logos, no UI**, 16:9.
- 파라미터: 16:9 / 1K(뒤에 4K) / 4장 배치 / Unlimited 토글. 비교군으로 **GPT Image 2**를 동시에 돌려 결과를 나란히 본다.
- 생성물 각 장에 **Reference / Animate / Create 3D scene** 액션이 붙는다(이미지 → 영상 → 3D 씬 파이프라인이 UI에 내장).

### 01:53–03:14 · 히어로 조판 — 세 가지 핵심 기법 (s011–s014, t010, t012, t013)
1. **CTA 유리 카드**: Fill `141615` @ **80%**, Stroke `FFFFFF` @ **10%** Inside 1px, **Corner radius 0**, Effects = **Background blur**. 오토레이아웃 W329/H244 Hug, padding 32, gap 32. → *"라운드 0 + 1px 흰선 10% + 배경 블러"* 가 이 화면의 유일한 유리 문법.
2. **텍스트 뒤 피사체(오클루전)**: 굴착기 실루엣을 따라 벡터 도형을 그린 뒤(펜툴, stroke `FF4D00` 2px, 텍스트 opacity를 낮춰 아래를 보면서 트레이스), **텍스트 + 도형 선택 → Boolean `Subtract`**. 3D도 마스크 이미지도 없이 "글자가 피사체 뒤로" 들어간다.
3. **헤드라인 처리**: `BUILD` — 서체 **Goldman Bold**, size **440**, line-height 120%, **letter-spacing −10%**, Fill = **Linear gradient**(0% `F0F1DA` 100% → 100% `8A687E` 60%), 하단에 **progressive blur**. 저자 표현: *"that kind of adds a bit of that like sort of depth to it."*

### 03:14–04:07 · 완성 디자인 스크롤스루 (s018, s019, s022–s024, s037, s038)
페이지 구조(위→아래):
- 히어로(BUILD) — 우하단에 `///` 슬래시 마크 + `OPERATING SINCE 1912`
- 인트로: `/// BROOKLYN BASED` 아이브로우 + **"Probably the / fastest builders / on the planet."**(가운데 줄만 주황) + `About us` 코너 화살표 버튼 + 우측 사진 카드 + 캡션
- **TYPICAL BUILD TIMELINE** 풀블리드 섹션 + `Set the foundations` + `2 - 4 WEEKS` 칩 + 하단 **4분할 진행바 `01`**
- 통계 4칸: `250+` / `30+` / `4.9★` / `$120M+` (Built Value)
- 서비스 2카드: Residential / Commercial — **블렌드모드 청사진 스케치 + glow**
- `/// RECENT PROJECTS` 2열 사진(Casablanca House / Abbots Lane)
- `Let's start a project` CTA + `CONSTRUX is currently booking projects for Q2 2027`
- 박스형 푸터

저자 강조: *"every single image we've used on this design is an AI image."* — 클라이언트에 사진이 없을 때의 **컨셉 시각화** 수단으로 AI 이미지를 쓴다는 태도.

### 04:07–04:40 · Figma → Claude Code 인계 (t019)
두 가지 경로를 명시한다.
- (a) 프레임 전체를 **JPEG로 export**해서 넘긴다 → 폰트/사이즈는 추측, 에셋은 수동 export 필요.
- (b) **유료 Figma 플랜**이면 프레임 선택 → **Dev Mode → "Copy example prompt"** → 그대로 Claude Code에 붙여넣기. 실제 붙여넣은 프롬프트:

  ```
  Implement this design from Figma.
  @https://www.figma.com/design/Af0PLttPU3NTgwmxZxpLIT/Construction?node-id=1-2&m=dev

  Build me out this landing page design
  ```

- 모델 선택 UI에서 **Opus 5**를 고르다가 *"for an even better result, let's use **Fable 5**"* 로 바꾼다. reasoning effort는 **High**.

### 04:40–05:28 · Seedance 2.5 영상 생성 (t020–t023, s025–s027)
- higgsfield.ai/ai/video. 좌측 패널: References / Extend Video, Prompt, Model **Seedance 2.5**, `8s` / `16:9` / `720p` / Bitrate **High** / Unlimited mode / Generate(약 52–60 크레딧).
- **레퍼런스 이미지**로 "이미 만든 기초 사진"을 물려서 룩 연속성을 확보한다.
- 프롬프트 1:
  > This should be an orbiting flyover over foundations getting built. Orbit should be around 90 degrees. Starting from the dirt and the floor concrete getting poured and then the walls going up. End result is a house with foundations and walls up. **No people doing the work. Just the house timelapse as if being built by itself.**
- 사운드는 끔(웹 배경용). Seedance 2.5는 **최대 30초**까지 가능하지만 이번엔 8초 4개로 쪼갠다.
- 영상 모델 카탈로그(s025): Seedance 2.5 / Seedance 2.0 4K / Gemini Omni Flash / Kling 3.0 / Kling Motion Control / FLUX.2 Video / MiniMax M3 / Kling 3.0 Omni Edit / **Sora 2** / **Google Veo 3.1** / HappyHorse / Grok Imagine 1.5 / Wan 2.7 / Minimax Hailuo 2.3 / Higgsfield DOP.

### 05:28–06:01 · Claude 1차 빌드 결과 (t024, t026, t029)
Claude Code 출력 로그 전문(판독):
> The landing page is built and running — the Figma design is now a working **Astro** site at `APPS/construx`, live in the preview at http://localhost:4323.
>
> **What I did:**
> - Pulled the full design context from your Figma file and matched your existing project conventions (Astro 5, same structure as woty-workshops/RosewoodCabin).
> - **Downloaded all 16 Figma assets** (hero, blueprints, project photos, logo, arrows, glow) into `public/assets` **since the remote URLs expire in 7 days**.
> - Implemented the page in `index.astro` + `global.css` with **Geist/Goldman loaded from Google Fonts**, and the orange shard logo mark **rebuilt in pure CSS** (rotated blocks, scaled down) for the footer.
>
> Sections, all verified in the browser against the Figma screenshot: glass pill nav + hero with "BUILD" backdrop and hire card · … · boxed footer. **Layout landed pixel-accurate at the 1512px design width (I measured key elements — e.g. the heading sits at exactly x290/y1134 as in Figma)**, and I added responsive breakpoints at **1400/1180/640px** so it degrades sensibly. Production `astro build` passes with no console errors.

주목: 스스로 **미리보기 서버를 띄우고 브라우저로 스크린샷을 찍어 Figma와 대조**했고, 픽셀 좌표를 측정해 검증했다. 저자 평은 *"a few little bugs with the border strokes… but stuff we could easily fix"*.

### 06:01–06:48 · **스크롤 스크럽 영상 섹션** — 이 영상의 핵심 (t026, s035, t027–t028, t031)
사용자 프롬프트:
```
Make our hero 100vh.
Also make the build timeline section 100vh too.
For the build timeline I want it to be this video (attached)
And I want it to be scroll based playback that takes the step 1 progress from 0 to finished
as we scroll through. All the UI remains sticky for the scroll animation play through.
```

Claude 응답(수치 전부 판독, 이 문서에서 가장 값나가는 대목):
> - Hero is now 100vh — verified: section height 980px = window height, **with a 640px floor for short windows**.
> - Build timeline is a **sticky 100vh scroll-scrub section**. The section now lives inside a **400vh scroll runway** (`foundations-wrap`), so you get **three viewport-heights of scrubbing**.
> - Your video (copied to `foundations-build.mp4`) plays **frame-by-frame tied to scroll position** — **I re-encoded it with dense keyframes (`-g 5`) so seeking is smooth rather than snapping between keyframes.**
> - The "01" progress bar fills from 0% to 100% across the full scrub, **with the segment ticks staying as markers**.
> - All UI stays pinned: heading, "2 - 4 WEEKS" chip, `/// TYPICAL BUILD TIMELINE` tag, side rules, and the progress bar (**I re-anchored them to the section's bottom edge so they hold position at any viewport height**).
> - Verified: at 0/25/50/75/100% scroll the bar reads 0/25/50/75/100% with video time at 0/2.0/4.0/6.0/8.0s of the 8s clip. **The scrub itself lerps via `requestAnimationFrame` for a smooth film feel, with a direct-seek fallback for backgrounded tabs.**
> - One note: **the old still image now serves as the video's `poster`, so there's no flash before the video loads.**

### 06:48–08:12 · 4단계 확장과 **실패** (t030, t032, t033, s034)
- 2단계 프롬프트: *"This should be an orbiting flyover. Orbiting 90 degrees. **Starting with the end state of this video reference** with the finished foundations and walls. …all the timber framing being constructed, windows going in, roof going on. No workers, just the house timelapse."* → **직전 영상 자체를 레퍼런스로** 물려 연속성을 노림.
- 진행바 규격 지시: `01(25%) 02(25%) 03(25%) 04(25%)`.
- Claude가 3단계까지 붙인 뒤 스스로 보고: *"the scroll runway auto-scaled to three stages (now **700vh** total, **200vh of scrub per stage**). Verified the full sequence: 20% → stage 1 at 60% fill; 50% → 'Framing & Roofing' with segment 02 at half; 75% → swaps to 'Interior and Furnishings' with 03 filling; 100% → 03 complete, 04 still empty and outlined."*
- **그런데 실패한다.** 저자: *"keep an eye at the floor plan. As we go into phase two here, **we lose some of that consistency**… stage three, it's kind of like a different roof shape. Not a big fan of the end result… **where's all the freaking windows?**"* → **4개 분리 영상 방식 폐기.**

### 08:12–09:03 · 재설계: 목표 이미지 앵커 + 단일 20초 (t035–t037, s039, s040)
- **완성 상태 이미지(Recent Projects에 쓴 럭셔리 주택 렌더)를 레퍼런스로 넣고**, 한 번에 20초를 뽑는다.
  > This should be an orbiting **360** flyover.
  > Step 1: (5 seconds) The video should start with this house as dirt, and then concrete foundations being poured.
  > Step 2: (5 seconds) The timber framing goes up, walls get completed, windows in and roof on.
  > Step 3: (5 seconds) roof comes off and exterior starts going in, kitchen, bathroom, painted walls
  > Step 4: (5 seconds) the landscape gets completed to match the end image reference.
  > **Keep it consistent.** No workmen, just a house animate construction.
- 20s / 16:9 / 720p / High / 130 크레딧. (중간에 `Failed · Credits refunded` 도 한 번 뜬다 — 실패 시 크레딧 환불.)
- 저자 총평: *"we already know what the finished stage should look like… this is just going to be a better workflow anyway."* → **끝 상태를 고정하면 중간 상태가 정렬된다.**

### 09:03–09:38 · 마감 폴리싱 루프 (s042)
사용자 지시와 Claude 수정이 짧게 오간다. 전부 **1px·%·px 단위의 조판 교정**이다.
- *"cards now use a **1px stroke at 10% opacity** (cream `rgba(240, 241, 218, 0.1)` instead of full cream)… the cards now read as gradient surfaces with **just a whisper of an outline** rather than hard cream frames."*
- *"Lets add another **160px whitespace**"* → *"the gap … is now **256px** (the original 96px plus the extra 160px), measured and confirmed in the preview."*
- *"timeline border lines on left and right should be **50% opacity**"* / *"the orange progress bar should not show the white stroke around it, **it needs to fill the 1px edge of the box**"* → *"Progress bar stroke is now drawn **beneath the fills** (moved from a border on the container to an underlying layer), so the orange fills the full **31px** box height and bleeds right to the edge… The cream outline only shows on the **empty** parts of the track, and the segment ticks stay as dividers."*

### 09:38–10:29 · 강좌 홍보 / 클로징
futuredesigner.io — 40+ 레슨, 25+ 템플릿, "Become the designer AI can't replace." 마지막에 다른 프로젝트(RoomAI)와 **12-Column Grid 정렬 규칙** 아트보드가 잠깐 스친다.

---

## 2. 프런트엔드 기법 — 관찰 → 우리 스택 이식

우리 스택: **MapLibre GL JS 5.6.0 + deck.gl 9.3.10 + three 0.185.1 + 바닐라 ESM, 정적 서빙(`tools/serve.mjs`)**. 번들러 없음. 아래 표의 "이식" 열은 그 전제 위에서 쓴다.

| # | 기법 | 관찰 근거 | 우리 스택 이식 | 난이도 | 대상 화면 |
|---|---|---|---|---|---|
| F1 | **스크롤 스크럽 비디오 + sticky UI** | 06:01–06:48, s035 | `position:sticky; top:0; height:100vh` 를 스테이지당 200vh 러너웨이 안에 넣고 `scrollY→progress→video.currentTime`. 이미 `landxi/proto/js/plate.js`에 스크럽 기반 clip-path 엔진과 `EASE=cubic-bezier(.15,1,.3,1)`이 있으므로 **같은 progress 소스를 비디오에 하나 더 물리면 된다** | 중 | 히어로 디센트, 서비스↔결과 매칭 섹션 |
| F2 | **`-g 5` 밀집 키프레임 재인코딩** | s035 원문 | `ffmpeg -i in.mp4 -g 5 -c:v libx264 -crf 20 -pix_fmt yuv420p -movflags +faststart out.mp4`. 이걸 안 하면 `currentTime` 시킹이 GOP 단위로 **툭툭 끊긴다**. 우리 남원 4시점 정사영상 타임랩스에 그대로 적용 | 하 | 시계열 변화탐지 |
| F3 | **rAF lerp + 백그라운드 탭 direct-seek 폴백** | s035 원문 | 목표값을 스크롤에서 계산하고 `cur += (target-cur)*0.12` 를 rAF로 감쇠. `document.hidden`이면 즉시 대입. 필름 같은 관성이 여기서 나온다 | 중 | 전 스크럽 섹션 |
| F4 | **still → `poster` 승계** | s035 원문 | 정사영상 첫 프레임 JPEG를 `<video poster>`로. 로드 전 검은 플래시 제거 — 흰 종이 위에서 검은 플래시는 §4의 "하드 반전"을 망친다 | 하 | 전부 |
| F5 | **분할 진행바(세그먼트 틱이 marker로 잔류)** | t031/t032/t033 | 4칸 트랙, 채워진 부분만 액센트, **빈 칸은 1px 아웃라인만**, 틱은 divider로 유지. 우리 §6의 "히스토그램 위 드래그 마커"와 같은 계열 — 다만 **자동 스크럽 표시자**로 | 하 | 타임라인/시간 스크러버 |
| F6 | **진행바 stroke를 fill 아래 레이어로** | s042 원문 | `border`를 컨테이너에서 떼고 `::before` 언더레이로. 그래야 액센트가 **1px 가장자리까지 꽉** 찬다(31px 높이 기준) | 하 | 모든 게이지/바 |
| F7 | **Boolean Subtract 오클루전(텍스트가 피사체 뒤로)** | 02:43–02:58, s013 | 웹 이식 두 가지: (a) 정사영상에서 대상(굴착기 자리 = 우리는 **탐지 폴리곤**)의 알파 컷아웃 PNG를 만들어 `z-index`로 헤드라인 위에 겹치기, (b) `mask-image`로 헤드라인에 컷아웃 적용. **AI가 본 폴리곤만 컬러 복원**(§4 선택적 채도)과 결합하면 "글자 뒤에서 탐지 대상이 솟는" 장면이 된다 | 중 | 히어로, 결과 행 |
| F8 | **초대형 워드마크 + progressive blur + 그라디언트 fill** | s013, t012 | `font-size: clamp(…, 22vw, …)`, `letter-spacing:-0.1em`, `line-height:1.2`, `background-clip:text` 선형 그라디언트, 하단만 `mask-image` 페이드 + 뒤 레이어 blur. **단 우리 §4는 SUIT Medium 단일 굵기 / 하드 반전이라 그라디언트 fill·블러는 채택 금지**(§5 참조) | 중 | — (참고만) |
| F9 | **라운드 0 + 1px 10% 흰선 + background-blur 카드** | t010 | `border-radius:0; border:1px solid rgba(255,255,255,.1); backdrop-filter:blur(…); background:rgba(20,22,21,.8)`. 우리 §6은 "**화면당 유리 1개**"이므로 하단 상주 타임라인에만 | 하 | 옵서버토리 타임라인 |
| F10 | **`///` 슬래시 아이브로우 + 2행 라벨** | 전편 | `/// BROOKLYN BASED`, `/// TYPICAL BUILD TIMELINE`, `/// RECENT PROJECTS`. 순수 텍스트 3글자로 만든 무료 브랜드 시그널. 우리는 `/// 남원 · 2024-11` 처럼 **장소·날짜 캡션**과 결합 | 하 | 전 섹션 아이브로우 |
| F11 | **1px 세로 사이드 룰(50% opacity)** | s042, t027 | 풀블리드 이미지 좌우에 1px 세로선을 50% 투명도로. 사진을 "판(plate)"으로 규정하는 가장 싼 장치. 우리 `plate.js`의 창 개념과 직결 | 하 | 모든 사진 판 |
| F12 | **코너 화살표 버튼(채운 사각 + →)** | 전편 | `About us [→]`. 우리 §4는 "**채운 버튼 금지, 코너 브래킷 프레임**"이므로 **화살표 아이콘만 차용**하고 채운 사각은 버린다 | 하 | CTA |
| F13 | **블렌드모드 청사진 + glow 카드** | s037, s039 | 선화(청사진)를 `mix-blend-mode: screen/overlay`로 사진 위에 얹고 뒤에 radial glow. 우리 버전 = **지적도/필지 경계 벡터를 정사영상 위에 screen 블렌드** | 중 | 서비스 카드 |
| F14 | **1512px 디자인 폭 + 1400/1180/640 브레이크포인트** | t026 | Claude가 스스로 잡은 값. 우리도 데스크톱 고정 폭을 정하고 3단 브레이크포인트를 **명시적으로 지시**해야 "알아서 반응형"의 품질이 확보된다 | 하 | 전역 |
| F15 | **hero 100vh + `min-height:640px` 바닥** | s035 | 짧은 창에서 100vh가 무너지는 것 방지. `100svh`/`100dvh` 병기 권장 | 하 | 히어로 |
| F16 | **로고 마크를 순수 CSS로 재구성** | t026 | Claude가 SVG 대신 회전 블록 4개 CSS로 만듦. LX 심볼은 SVG가 맞지만 **작은 장식 마크는 CSS로** 만들면 에셋이 준다 | 하 | 푸터 |
| F17 | **256px 급 대형 여백을 "측정해서" 지시** | s042 | *"another 160px whitespace"* → 96+160=256px. 여백을 **숫자로** 말하고 **측정으로** 확인하는 루프 | 하 | 전역 |

### 즉시 쓸 수 있는 F1+F3 골격 (우리 규칙에 맞춘 참고 구현)

```js
// 스테이지당 200vh 러너웨이, 섹션은 sticky 100vh.
const wrap = document.querySelector('.timeline-wrap');   // height: calc(100vh + N*200vh)
const vid  = wrap.querySelector('video');                // -g 5 로 재인코딩된 소스
let target = 0, cur = 0;

function progress() {
  const r = wrap.getBoundingClientRect();
  const run = wrap.offsetHeight - window.innerHeight;
  return Math.min(1, Math.max(0, -r.top / run));
}

addEventListener('scroll', () => {
  target = progress() * (vid.duration || 0);
  if (document.hidden) { vid.currentTime = target; cur = target; } // 백그라운드 탭 폴백
}, { passive: true });

(function tick() {
  cur += (target - cur) * 0.12;                 // lerp = 필름 같은 관성
  if (Math.abs(target - cur) > 0.004) vid.currentTime = cur;
  requestAnimationFrame(tick);
})();
```

진행바는 같은 `progress()`를 4로 나눠 세그먼트 인덱스와 잔여분을 계산하고, **빈 세그먼트는 1px 아웃라인만** 남긴다(F5·F6).

---

## 3. 데이터·AI 노하우

프런트엔드보다 오히려 **에셋 제작 방법론**의 이식 가치가 더 크다. Land-XI는 "실제 데이터"가 자산이지만, **아직 촬영되지 않은 미래 상태·설명용 씬**은 우리도 만들어야 하기 때문이다.

| # | 노하우 | 근거 | Land-XI 적용 | 난이도 |
|---|---|---|---|---|
| D1 | **끝 상태(목표 이미지)를 레퍼런스로 고정하고 중간을 생성** | 08:12–08:47 | 4개 분리 생성은 일관성이 깨졌고, "완성 이미지"를 앵커로 준 단일 20초는 성공했다. → 우리 시계열 시각화도 **최종 정사영상(현재 시점)을 앵커**로 두고 과거→현재를 만든다 | 중 |
| D2 | **"단계 × 초"를 프롬프트에 명시** | s035, t035 | `Step 1: (5 seconds) …` 형식. 영상 길이를 UI 진행바 분할과 **1:1로 맞춘다**(20초 = 4×5초 = 진행바 4칸). 우리 시간 스크러버도 동일 규칙 | 하 |
| D3 | **부정 프롬프트로 UI 오염 차단** | 01:36 | `no people, no text, no logos, no UI`. 배경 이미지에 **가짜 UI·가짜 좌표가 섞여 들어가는 것**을 원천 차단(§3-6 "가짜 숫자 금지") | 하 |
| D4 | **`simplified forms with slightly reduced micro-detail`** | 01:36 | AI 이미지의 "과잉 디테일 = 슬롭" 냄새를 줄이는 관용구. 배경으로 쓸 이미지에 유용 | 하 |
| D5 | **두 모델 동시 비교(Nano Banana Pro vs GPT Image 2)** | 01:36–01:53 | 한 프롬프트를 두 모델에 병렬로 던지고 **나란히 놓고 고른다**. 우리도 후보를 2모델×4장으로 뽑아 §5 판정 규칙으로 거른다 | 하 |
| D6 | **레퍼런스 체이닝 실패 사례** | 07:37–08:12 | *"we lose some of that consistency… different roof shape… where's the windows?"* — **영상→영상 체이닝은 구조 일관성을 보장하지 않는다**. 우리 정사영상은 실측이라 무관하지만, **설명용 3D 씬을 AI로 만들 때는 반드시 D1 방식** | — |
| D7 | **Figma 원격 에셋 URL은 7일 만료** | t026 | Claude가 자동으로 `public/assets`에 내려받았다. 외부 이미지 참조는 **반드시 로컬 커밋**(현재 `shots/` 정책과 동일) | 하 |
| D8 | **AI가 브라우저로 자기 결과를 검증** | t024, t026, s035 | 미리보기 서버 + 스크린샷 + **좌표 측정**(x290/y1134) + `0/25/50/75/100%` 스크럽 상태 검증. 우리 `tools/_shots.mjs`·`tests/e2e/*.spec.mjs`가 이미 그 골격 — **"측정값을 보고서에 쓰게" 하는 규약**을 추가할 것 | 중 |
| D9 | **실패는 크레딧 환불** | t035–t037 | `Failed · Credits refunded`. 도입 시 비용 리스크 낮음 | — |
| D10 | **Higgsfield MCP & CLI** | s025 네비 | *"Turn Claude into a creative engine."* — Claude Code에서 직접 이미지/영상을 생성·수급하는 MCP 서버가 존재. 채택 시 에셋 제작 루프가 세션 안으로 들어온다 | 중 |

---

## 4. "지금 훔칠 것" TOP 5

1. **스크롤 스크럽 타임랩스 섹션(F1+F2+F3+F4+F15).** Land-XI 판: `남원 2021 → 2022 → 2023 → 2024` 4시점 정사영상을 **한 편의 20초 타임랩스**로 잇고, sticky 100vh 안에서 스크롤로 스크럽. 헤드라인·`/// 남원 · GSD 12cm`·연도 칩·4분할 진행바는 전부 pinned. **§5-4("화면 전환이 같은 지도의 카메라 이동인가")를 3D 비용 없이 만족시키는 유일한 저가 수단.** `-g 5` 재인코딩이 이 항목의 성패를 가른다.
2. **분할 진행바 문법(F5+F6).** 채워진 부분은 액센트가 **1px 가장자리까지 꽉**, 빈 부분은 아웃라인만, 세그먼트 틱은 divider로 잔류. 우리 §6의 "히스토그램 위 드래그 마커"와 형제. 스크러버·신뢰도 범례·공정률을 이 규격 하나로 통일한다.
3. **`///` 아이브로우 + 1px 사이드 룰 + 이미지 바깥 캡션(F10+F11).** §4의 "떠 있는 HUD 스티커 금지 / 헤어라인 벡터·코너 브래킷·`장소 · 날짜` 캡션"을 **가장 값싸게 구현한 실물 예시**. 즉시 `plate.js` 판 테두리에 적용 가능.
4. **끝 상태 앵커 + 단계×초 프롬프트(D1+D2).** 우리가 만들 모든 설명용 애니메이션(공정·복원·개발 시나리오)의 표준 프롬프트 형식. 그리고 **영상 길이 = 진행바 분할 = 스크럽 러너웨이**를 하나의 숫자로 묶는 규율.
5. **"측정하고 보고하는" 구현 루프(D8+F17).** *"the heading sits at exactly x290/y1134"*, *"the gap is now 256px, measured and confirmed"*, *"at 0/25/50/75/100% scroll the bar reads 0/25/50/75/100%"*. 우리 프로토 작업 지시에 **"수치를 측정해서 보고할 것"** 을 상시 규약으로 넣는다. §5의 11개 판정 규칙이 말로만 지켜지는 걸 막는 장치다.

---

## 5. "하지 말 것" 리스트

1. **어두운 바탕 전면 채택 금지.** 이 영상은 `141615` 단일 다크다. 우리 §2.2 정정은 **흰 종이가 바탕**이고 어두움은 **사진 판 안**에서만. 스크럽 섹션도 판 안쪽만 어둡게.
2. **그라디언트 텍스트 fill(`F0F1DA→8A687E` 60%) 금지.** §4는 "그라디언트·유리·그림자·라운드 0". 헤드라인은 단색 SUIT Medium.
3. **progressive blur로 만든 "깊이감" 금지.** 저자가 *"adds a bit of that sort of depth"* 라고 한 그 장치가 정확히 우리가 거부한 "무드용 흐림"이다. 깊이는 **판의 크기 변화와 카메라**로 낸다(`plate.js`).
4. **알약형 글래스 필 네비 금지.** §3-1(유리 패널 나열)·§6(화면당 유리 1개)에 정면 위배. 우리 네비는 헤어라인 + 텍스트.
5. **채운 주황 CTA 버튼 금지.** `FF4D00` 채운 사각 + 화살표는 SaaS 어휘. §4대로 **코너 브래킷 프레임**, 액센트는 LX 블루 `#006DF7` 하나.
6. **Geist / Goldman 도입 금지.** §4 확정: SUIT Medium 500 / Pretendard 400 / Inter tabular. 라틴 디스플레이를 새로 들이면 §3-2 재발.
7. **통계 4칸 카드 그리드(`250+ / 30+ / 4.9★ / $120M+`) 금지.** §3-1 "균일한 카드 그리드", §5-9 "장식 숫자 삭제"에 걸린다. 우리는 **화면당 초대형 숫자 하나 + 8–11px 캡션**(§6).
8. **AI 생성 사진을 "실적"으로 쓰지 말 것.** 저자는 클라이언트에 사진이 없어서 전부 AI로 만들었다. 우리는 **여수·남원·제주·국산리 실자산**이 있고 §3-6은 가짜 데이터를 명시적으로 금지한다. AI 이미지는 **설명용 씬(미래 시나리오·공정 다이어그램)** 에만, 그것도 캡션에 "시뮬레이션" 표기와 함께.
9. **영상→영상 레퍼런스 체이닝 금지(D6).** 구조가 흔들린다. 끝 상태 앵커 방식만.
10. **"AI가 반응형 알아서 했다"에 만족 금지.** 저자도 *"a little buggy… a few bugs with the border strokes"* 라 했다. 브레이크포인트는 숫자로 지시하고 측정으로 확인.

---

## 6. 취향 프로필 대조 (§2 / §4 / §5)

**§2 공통분모와의 정합**
- *"위성영상을 사진으로 다룬다"* ↔ 이 영상은 **모든 섹션이 풀블리드 사진/영상**이고 텍스트는 그 위 얇은 층이다. `TYPICAL BUILD TIMELINE` 섹션은 화면의 100%가 픽셀. **§5-1(첫 프레임에 실영상 60% 이상) 통과 사례**로 삼을 만하다.
- *"한 대의 연속 카메라"* ↔ 스크롤 스크럽이 정확히 그 대체재다. 페이지 전환이 아니라 **하나의 오비팅 플라이오버가 스크롤에 묶여** 계속된다. 우리 궤도→돌파→강하 서사에 **"지상 궤도 선회"라는 네 번째 악장**을 추가할 근거.
- *"탐지의 사건화"* ↔ **여기엔 없다.** 이 사이트는 스캔·브래킷·카운트업이 전무하다. §5-5는 우리가 별도로 채워야 한다.
- *"절제된 색"* ↔ 단색 바탕 + 액센트 1개(`FF4D00`) 원칙은 동일. 색상값만 우리 `#006DF7`로 치환.
- *"숫자는 mono, 큰 제목은 굵고 짧게"* ↔ `BUILD`(5글자), `2 - 4 WEEKS`, `01`. 데이터 저널리즘 톤은 아니지만 **짧고 구체적**이라는 점은 일치.
- *"살아있음의 최소 조건"* ↔ **부분 미달.** 유휴 상태에서 움직이는 것이 없다(스크럽은 사용자 입력 의존). §5-2("5초 동안 아무것도 안 해도 실데이터 때문에 움직이는가")를 만족시키려면 **스크럽 + 앰비언트 1개**를 병치해야 한다. 예: 스크럽 정지 시 아주 느린 `playbackRate 0.15` 자동 진행, 또는 `● LIVE` 스탬프의 6초 주기 호흡.

**§4 체계와의 충돌·수용**
- 수용: 라운드 0, 1px 헤어라인, 이미지 바깥 캡션, 대형 여백(256px), 12컬럼, 단일 액센트, 데스크톱 고정 폭 + 명시 브레이크포인트.
- 충돌: 그라디언트 텍스트, progressive blur, 글래스 필, 채운 CTA, Geist/Goldman, 카드 그리드 통계(§5 "하지 말 것"에 정리).
- 모션: 이 영상엔 이징 규격이 안 나온다. 우리 `cubic-bezier(0.15,1,0.3,1)` + 500/750/1000/1250ms 사다리를 그대로 유지하되, **스크럽 lerp 계수 0.12**를 새 상수로 추가한다(약 8프레임 감쇠, 필름 관성).

**§5 판정 규칙 11개로 이 사이트를 채점하면**

| 규칙 | 판정 |
|---|---|
| 1. 실영상 60% 이상 | **통과**(AI 이미지지만 사진으로 대접) |
| 2. 유휴 시 실데이터 움직임 | **탈락** |
| 3. 호버 물리 반응 | 미확인/약함(영상에 호버 데모 없음) |
| 4. 같은 지도의 카메라 이동 | **통과 상당**(스크럽 = 연속 카메라) |
| 5. 데이터 도착 사건 | **탈락** |
| 6. 단색 + 액센트 1 | **통과** |
| 7. 짧고 굵고 구체적 헤드라인 | **통과** |
| 8. 차트-슬라이더 동기 | **부분 통과**(진행바 ↔ 영상 시간이 정확히 동기) |
| 9. 모든 숫자가 해설인가 | **탈락**(`250+ / 30+ / 4.9★` 는 장식 숫자) |
| 10. 움직이는 요소 1개 + LIVE | **통과**(스크럽 섹션에서 움직이는 건 영상 하나) |
| 11. 수치 규칙 | 부분(스크럽 수치는 정밀, 호버·텍스트 인 수치는 없음) |

→ **결론: 이 영상에서 가져올 것은 "메커니즘(1·4·8·10)"이고, 우리가 이미 강한 "사건화(5)·살아있음(2)·해설 숫자(9)"는 우리 것으로 채운다.** 두 축을 합치면 §5 11개를 전부 통과하는 섹션 하나가 나온다: *흰 종이 위, 남원 4시점 판 안에서 스크롤로 스크러빙되는 타임랩스 + 스크럽이 멈추면 시작되는 탐지 사건(브래킷 180ms → 확정 80ms → 라벨 120ms) + 해설 붙은 초대형 숫자 하나.*

---

## 7. 도입 검토 대상 (도구·스킬)

| 항목 | 무엇 | 판단 |
|---|---|---|
| **ffmpeg `-g` 재인코딩 스크립트** | `tools/film/scrub-encode.mjs` 추가 (`-g 5 -crf 20 -movflags +faststart`, 720p/1080p 2종 출력) | **도입 권장.** F2 없이는 F1이 실패한다. `tools/film/`은 이미 존재 |
| **Figma Dev Mode "Copy example prompt"** | 유료 플랜 필요. 프레임 URL + `m=dev` 를 Claude Code에 직접 물림 | **조건부.** 우리는 코드가 원본이라 우선순위 낮음. 클라이언트가 Figma 시안을 줄 경우의 최단 경로로만 기억 |
| **Higgsfield (higgsfield.ai)** | Seedance 2.5(최대 30초) / Nano Banana Pro / Seedream 5.0 Pro / Topaz 업스케일 + **MCP & CLI** | **조건부 도입.** 실데이터 원칙상 상시 사용 금지. **설명용 씬·미래 시나리오 한정**, 캡션에 시뮬레이션 표기 필수. MCP는 세션 내 에셋 루프를 만들어주지만 §3-6 위험이 커지므로 **수동 승인 경로만** |
| **`superpowers:verification-before-completion` 상시 적용** | D8의 "측정해서 보고" 규약 | **도입 권장.** 이미 설치된 스킬. 프로토 작업 지시 템플릿에 "픽셀 좌표·스크럽 %·여백 px를 측정 로그로 남길 것"을 고정 문구로 추가 |
| **`tools/_shots.mjs` 확장** | 스크럽 0/25/50/75/100% 지점 자동 캡처 | **도입 권장.** s035의 검증 방식을 우리 회귀 테스트로 |
| **신규 스킬 불필요** | `maplibre-*` 5종, `dataviz`, `frontend-design`은 이미 보유 | 추가 설치 불요 |

---

## 8. 부록 — 원문 프롬프트 아카이브

**이미지 (Nano Banana Pro / GPT Image 2, 16:9, 4K)**
```
Cinematic luxury construction site at night, a large yellow excavator centered in the frame
in front of a modern architectural home, low-angle composition, dramatic storm clouds,
moody blue-black sky, warm work lights illuminating the excavator and house, atmospheric haze,
wet muddy ground with subtle reflections, bold contrast, simplified forms with slightly reduced
micro-detail, premium architectural visualization, ultra-realistic, volumetric lighting,
minimalist composition, no people, no text, no logos, no UI, 16:9.
```

**영상 v1 (Seedance 2.5, 8s / 16:9 / 720p / High) — 실패한 분할 방식**
```
This should be an orbiting flyover over foundations getting built. Orbit should be around
90 degrees. Starting from the dirt and the floor concrete getting poured and then the walls
going up. End result is a house with foundations and walls up. No people doing the work.
Just the house timelapse as if being built by itself.
```

**영상 v2 (Seedance 2.5, 20s) — 채택된 끝상태 앵커 방식**
```
This should be an orbiting 360 flyover.
Step 1: (5 seconds) The video should start with this house as dirt, and then concrete
        foundations being poured.
Step 2: (5 seconds) The timber framing goes up, walls get completed, windows in and roof on.
Step 3: (5 seconds) roof comes off and exterior starts going in, kitchen, bathroom,
        painted walls
Step 4: (5 seconds) the landscape gets completed to match the end image reference.
Keep it consistent. No workmen, just a house animate construction.
[reference: 완성된 주택 이미지]
```

**Claude Code 지시 1 (Figma Dev Mode)**
```
Implement this design from Figma.
@https://www.figma.com/design/.../Construction?node-id=1-2&m=dev

Build me out this landing page design
```

**Claude Code 지시 2 (스크럽 섹션 — 이 영상의 핵심 프롬프트)**
```
Make our hero 100vh.
Also make the build timeline section 100vh too.
For the build timeline I want it to be this video (attached)
And I want it to be scroll based playback that takes the step 1 progress from 0 to finished
as we scroll through. All the UI remains sticky for the scroll animation play through.
```

**Claude Code 지시 3 (단계 추가 규격)**
```
Heres the second video for stage 2.
let's have the text change to say Framing & Roofing (4-6 weeks)
Progress bar should be 01(25%) 02(25%) 03(25%) 04(25%)
I will get video 2 and 3 ready
```

**측정 기반 폴리싱 지시(발췌)**
```
Lets add another 160px whitespace under our initial about section before our timeline section
timeline border lines on left and right should be 50% opacity
the orange progress bar should not show the white stroke around it, it needs to fill the
1px edge of the box
```

**추출된 색·타이포 스펙(참고용, 채택 아님)**

| 대상 | 값 |
|---|---|
| 페이지 배경 | `#141615` (초안 `#151515`) |
| 액센트 | `#FF4D00` |
| 크림(선·텍스트) | `#F0F1DA` — 선은 `rgba(240,241,218,0.1)`, 사이드 룰은 50% |
| 헤드라인 | Goldman Bold 440 / LH 120% / LS −10% / Linear `F0F1DA 100%` → `8A687E 60%` |
| 본문·UI | Geist (Google Fonts) |
| CTA 카드 | Fill `141615` 80% · Stroke `FFFFFF` 10% inside 1px · radius 0 · background blur · padding 32 · gap 32 |
| 그리드 | 12 columns / 디자인 폭 1512px / BP 1400·1180·640 |
| 진행바 | 높이 31px, 4분할, 채운 부분 액센트 풀블리드, 빈 부분 1px 아웃라인 |
| 스크럽 | 스테이지당 200vh, 3스테이지 = 700vh, lerp 0.12, `-g 5` |

---

## 9. 다음 액션 제안

1. `tools/film/scrub-encode.mjs` — 정사영상 4시점 → 20초 타임랩스 → `-g 5` 재인코딩 파이프라인.
2. `landxi/proto/js/scrub.js` — `plate.js`의 progress 소스를 공유하는 스크럽 모듈(F1/F3/F4/F5/F6). 흰 종이 + 판 안 어두움 규칙 준수.
3. `tests/e2e/`에 0/25/50/75/100% 스크럽 상태 회귀 스펙 추가(D8).
4. 스크럽 정지 시 앰비언트 1개(§5-2)와 탐지 사건 3비트(§5-5)를 같은 섹션에 병치 — 이 영상이 비어 있던 두 칸을 우리가 채워 넣는 지점.
