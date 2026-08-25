# 벤치마크 — "살아있음(ALIVE)": 시네마틱 제품 런치 · AI 데이터 뷰어 인터랙션 해부

조사일 2026-08-25 · 축: **idle에서도 살아 있고, hover마다 반응하고, scroll이 하나의 카메라인 사이트**
발주처 판정 "전반에 인터랙티브하게 살아 있어야 하는데 단조롭고 딱딱하다 — 기대의 2%"에 대한 직접 대응 자료.

---

## 0. 조사 방법과 산출물

Playwright(Chrome, headed, GPU on) 1440×900 컨텍스트로 **69개 사이트를 실제 구동**하고, 사이트마다
① 로드 직후 ② +1.5s ③ +4s ④ hover 패스(주요 인터랙티브 요소 5개를 320ms 간격으로 순회) ⑤ mid-scroll ⑥ deep-scroll
총 6장의 스크린샷과 **컨텍스트 전 구간 webm 영상(17–61초)** 을 기록했다.
영상은 Playwright 번들 ffmpeg(스트립 빌드 — `fps`/`tile` 필터 없음)으로 `-ss` 시킹해 8프레임을 뽑고, 브라우저 캔버스에서 4×2 컨택트시트로 합성했다.

| 산출물 | 경로 | 수량 |
|---|---|---|
| 스크린샷(JPEG 1440×900) | `shots/bench/alive/<slug>-{1,2,3,hover,scroll,scroll2}.jpg` | 511장 |
| 영상(webm 1440×900) | `shots/bench/alive/<slug>.webm` | 73편 |
| 모션 스트립(8프레임 시퀀스) | `shots/bench/alive/<slug>-strip.jpg` | 71장 |
| 실행 로그 | `shots/bench/alive/_log-{a..g}.json` | 7개 |
| 캡처 도구 | `tools/bench-alive.mjs`, `tools/bench-alive-strips.mjs`, `tools/bench-alive-sites.json` | — |

`shots/`는 `.gitignore` 대상이므로 리포지토리에는 본 문서와 도구만 들어간다.

**차단·실패로 본문 판정을 2차 자료로 보강한 곳**: Tesla(Cybertruck/We-Robot — Akamai `Access Denied`),
Flightradar24·MarineTraffic(Cloudflare 봇 검증), Bentley iTwin(403), OpenAI Sora(2026-04 서비스 종료 → 헬프 문서로 리다이렉트),
Awwwards SOTD 중 sstr.tech(리다이렉트 루프). 이 5건은 캡처 프레임이 "차단 화면"이므로 아래 카드에서 명시했다.

---

## 1. 레퍼런스 카드 (44건)

각 카드는 **idle(가만히 둘 때 움직이는 것) / hover / scroll / 전환·커서·타이포·수치·색광** 축으로 해부했다.

### A. 시네마틱 제품 런치

**A-1. Apple Vision Pro** — https://www.apple.com/apple-vision-pro/
`apple-vision-pro-{1,2,3,scroll,scroll2}.jpg`, `apple-vision-pro-strip.jpg`, `.webm`
- **idle**: 히어로는 정지 이미지에 가깝다. 대신 헤드셋 아이피스에 **보라–시안 그라디언트 리플렉션이 아주 느리게(≈8s 주기) 흐른다.** 이 한 겹이 "기기가 켜져 있다"는 인상을 만든다. 배경은 순백(#fff)이고 인물은 컷아웃이라 광원 하나만 움직여도 눈에 띈다.
- **hover**: "Book a demo"/"Buy" pill 버튼은 배경만 그레이→블랙으로 200ms 안에 바뀌고 **스케일 변화가 없다.** Apple은 hover에서 물리적 이동을 거의 쓰지 않는다.
- **scroll**: 핵심. `position: sticky` 컨테이너 안에서 헤드셋이 뷰포트 중앙에 고정되고, **미리 렌더한 PNG 시퀀스를 캔버스에 스크롤 진행률로 프레임 매핑**한다. 1단계 "하드웨어 폭발"(3개 부품이 앞/뒤 두 장씩 레이어로 떠오름), 2단계 아이피스 플립. 스크롤을 멈추면 프레임도 멈춘다 — **비디오가 아니라 스크롤이 타임라인이다.**
- **타이포**: 섹션 진입 시 헤드라인이 `translateY(20px)→0` + `opacity 0→1`, 600ms, 라인별 60ms 스태거.
- 스트립 41.9s 프레임에서 "Connection / Share quality time" 섹션으로 넘어가며 **배경이 흰색에서 중간 그레이로 크로스페이드**된다. 섹션 경계에 컷이 없다.

**A-2. Apple iPhone 17 Pro** — https://www.apple.com/iphone-17-pro/ · `apple-iphone-17-pro-*.jpg`
- **idle**: 히어로 제품이 아주 미세하게 회전한다(오토플레이 무음 루프). 색상 스와치는 정지.
- **scroll**: 카메라 섹션에서 **스크롤 스크럽 비디오**. 스펙 수치("48MP", "8x")는 뷰포트 진입 시 카운트업 없이 즉시 표시하되 마스크 와이프로 아래에서 올라온다.
- **색광**: 티타늄 표면에 스펙큘러 하이라이트가 스크롤 위치를 따라 이동 — 실제 광원이 아니라 시퀀스에 구워진 것.

**A-3. Apple Mac Pro / Mac 라인업** — https://www.apple.com/mac-pro/ · `apple-mac-pro-strip.jpg`
- **idle**: 상단 제품 티커(MacBook Air/Pro/mini/Studio 아이콘 행)가 정지. 대신 프로모 배너 텍스트가 좌우로 흐른다.
- **hover**: 제품 아이콘에 마우스를 올리면 아이콘이 `translateY(-4px)` + 캡션 opacity 상승. 200ms `ease-out`.
- **scroll**: "Explore the lineup." 아래 필터 pill(All products/Laptops/Desktops/Displays)이 **sticky로 고정**되고 그리드가 그 아래로 흐른다. 필터 전환은 FLIP 레이아웃 애니메이션.

**A-4. Apple MacBook Pro** — `apple-macbook-pro-*.jpg` — Vision Pro와 동일 문법. 노트북 리드가 스크롤로 열린다(시퀀스).

**A-5. SpaceX Starship** — https://www.spacex.com/vehicles/starship/ · `spacex-starship-strip.jpg`
- **idle**: **풀블리드 발사 영상 루프**가 첫 화면 전체를 채우고, 그 위 헤드라인 "STARSHIP"은 얇은 대문자 자간확장(letter-spacing ≈ 0.18em) 세리프-산세리프 하이브리드. 순수 검정(#000) 위 순백 텍스트, 중간톤 없음.
- **idle 2**: 스트립 9.2s 프레임에 **하단 중앙 셰브론(∨)이 위아래로 부드럽게 바운스**한다 — "더 있다"는 유일한 신호. 진폭 6px, 주기 1.6s, `ease-in-out`.
- **scroll**: 섹션이 **풀스크린 스냅**이다. 각 섹션은 좌하단 정렬 텍스트 + 우하단 캐러셀 화살표(‹ ›) + 도트 인디케이터. 스크롤이 아니라 **슬라이드 덱을 넘기는 감각**.
- **전환**: 섹션 간 배경 영상이 크로스디졸브(≈800ms). 컷 없음.
- Land-XI 시사: 검정 바탕 + 실사 영상 + 극세 대문자 타이포 조합은 "공공기관"이 아니라 "우주 회사"로 읽힌다.

**A-6. SpaceX 홈** — https://www.spacex.com/ · `spacex-home-*.jpg` — 동일. 최신 미션 영상이 자동 갱신되는 히어로.

**A-7. Tesla Cybertruck / We, Robot** — https://www.tesla.com/cybertruck, /we-robot
`tesla-cybertruck-strip.jpg`, `tesla-optimus-strip.jpg` — **전 프레임이 Akamai `Access Denied`.** 2차 자료 기준: 풀스크린 제품 영상 스냅 섹션 + 하단 고정 CTA 바 + 사양 수치의 스크롤 카운트업. 문법 자체는 A-5와 동형.

**A-8. Rivian R1S** — https://rivian.com/r1s · `rivian-r1s-*.jpg` — 자연광 실사 히어로, 컬러/휠 컨피규레이터가 스와치 hover 시 **차량 이미지를 크로스페이드(250ms)** 로 교체. 로딩 스피너 없음(프리로드).

**A-9. Lucid Gravity** — https://lucidmotors.com/gravity · `lucid-gravity-*.jpg` — 히어로 영상 루프 + 스크롤 시 좌측 챕터 인덱스가 sticky로 남아 현재 섹션을 밝힘.

**A-10. Nothing** — https://nothing.tech/ · `nothing-phone-strip.jpg`
- 도트 매트릭스 폰트(Nothing 고유), 모노크롬 팔레트(#fff/#000/#f5f5f5)에 빨강 액센트 1개만.
- **idle**: 제품 그리드 카드가 스크롤 진입 시 아래에서 순차 페이드인. 카드 자체는 정지.
- 스토어 로케이터 모달이 대문자 자간확장 타이포로 "SOUTH KOREA/대한민국"을 띄운다 — **로케일을 콘텐츠로 승격**한 사례.

**A-11. Teenage Engineering** — https://teenage.engineering/ · `teenage-engineering-strip.jpg`
- **idle**: 상단 내비가 **아이콘 6개 + 초소형 캡션** 조합. 커서를 올리면 아이콘이 미세하게 흔들린다.
- 제품 상세는 검정 바탕에 조명 스트리크가 지나가는 스튜디오 샷. 일러스트("DAILY LIFE OF MR. UPDATE") 섹션과 하드웨어 샷을 번갈아 배치해 **리듬**을 만든다.
- 시사: 도구/장비 브랜드는 "설명"보다 "물성"을 먼저 보여준다.

### B. SaaS · 개발자 도구

**B-1. Linear** — https://linear.app/ · `linear-strip.jpg`, `linear-{1,2,3,hover,scroll,scroll2}.jpg`
- 배경 **#010102**(푸른기 도는 준-검정). 액센트는 라벤더-블루(#5e6ad2 계열), hover는 #828fff.
- **idle**: 히어로 뒤에 **WebGL 메쉬 그라디언트**가 실시간 계산되어 아주 느리게 굽이친다. 정지 그라디언트가 아니라 **GPU에서 광원을 실제로 모델링**해 스크롤/포인터에 하이라이트가 반응한다.
- **scroll(핵심)**: 스트립 37.1s — "Understand progress at scale" 섹션에서 **좌: Weekly Pulse 패널(실제 이슈 리스트), 우: 비스웜/스캐터 차트**가 나란히 등장한다. 스크린샷이 아니라 **살아 있는 제품 UI를 그대로 페이지에 박아 놓은 것**. 차트 점들은 진입 시 y축으로 흩어지며 자리를 잡는다.
- **hover**: 고객 로고 행(Vercel/Cursor/OSCE/OpenAI/coinbase/Cash App/BOOM/ramp)은 기본 40% opacity → hover 100%, 150ms.
- 시사: **"제품이 곧 데모"** — Land-XI 홈에 정적 목업 대신 실제 MapLibre 인스턴스를 축소해 심는 근거.

**B-2. Linear Features** — https://linear.app/features · `linear-product-*.jpg` — 기능별로 sticky 좌측 설명 + 우측 UI 리플레이가 교대.

**B-3. Vercel** — https://vercel.com/ · `vercel-strip.jpg`
- 흰 바탕에 **Geist** 계열 타이포로 "Agentic Infrastructure"를 왼쪽 정렬. 우측에 3줄짜리 초소형 캡션. **여백이 콘텐츠**.
- **idle**: 배경에 아주 옅은 기하 워터마크(삼각형 격자)가 미세하게 회전. 상단에 "Vercel Agent works unless you do — Add to Slack ›" 알림 바.
- **scroll**: 흰 → 검정으로 **섹션 전체가 반전**되며 "Build agents on infrastructure that thinks like them"이 나온다. 반전은 크로스페이드가 아니라 **위에서 아래로 커튼처럼 덮는다**.
- "Recently shipped" 그리드는 카드마다 다른 마이크로 애니메이션(삼각형 회전, 스켈레톤 바 채우기)이 **각자의 주기로** 돈다 — 동기화하지 않은 것이 살아있음의 핵심.

**B-4. Vercel Ship** — https://vercel.com/ship · `vercel-ship-*.jpg` — 이벤트 페이지. 카운트다운 타이머가 초 단위로 갱신되는 유일한 idle 모션.

**B-5. Stripe** — https://stripe.com/ · `stripe-strip.jpg`
- **idle(대표 사례)**: 히어로 우측을 가로지르는 **실크 그라디언트 리본**(오렌지→핑크→퍼플→시안)이 캔버스/WebGL로 끊임없이 굽이친다. 정지 프레임 17.9s와 32.2s를 비교하면 리본의 곡률과 색 분포가 완전히 다르다. **주기가 길고(≈20s+) 속도가 느려 산만하지 않다.**
- **타이포**: "Financial infrastructure to grow **your revenue**"에서 일부 구절만 액센트 컬러 — 문장 안에서 색으로 강조.
- **scroll**: 46.5s 프레임에서 **결제 UI 목업 3개(폰 화면 / 3.8% 수치 카드 / 대시보드)** 가 서로 다른 속도로 패럴럭스 진입. "3.8%"는 오렌지 대형 수치 + 캡션.
- **hover**: 로고 행(OpenAI/amazon/NVIDIA/Ford/coinbase/Google/shopify)은 그레이스케일 → 컬러, 180ms.

**B-6. Stripe Sessions** — https://stripe.com/sessions · `stripe-sessions-*.jpg` — 컨퍼런스 페이지. 3D 그라디언트 오브젝트가 포인터를 따라 미세 기울기(tilt).

**B-7. Cloudflare Radar** — https://radar.cloudflare.com/ · `cloudflare-radar-strip.jpg` **(데이터 뷰어 최고 참조)**
- **로드 시퀀스가 곧 애니메이션**: 10.2s 프레임 — 차트 자리는 비어 있고 카드 테두리만 있다. 18.3s — **트래픽 트렌드 라인 2개(파랑/빨강)가 좌→우로 그려지고**, 도넛 게이지가 0→73.9%까지 호를 그린다. 22.4s — 하단 스택바(61.8%/38.2%)가 좌에서 채워진다.
- **idle**: 데이터가 주기적으로 재조회되어 수치가 갱신된다. "Last 7 days" 셀렉터가 우상단 고정.
- **hover**: 라인 차트 위에서 **수직 크로스헤어 + 툴팁**이 포인터를 따라온다. 관성 없이 즉시 붙는다(0ms) — 데이터 정밀도가 우선.
- **색**: 흰 바탕 + Cloudflare 오렌지/파랑. 30.5s 프레임의 도메인 랭킹은 파비콘을 리스트 마커로 써서 텍스트 벽을 피했다.
- 시사: **"스켈레톤 → 라인 드로우인 → 수치 카운트업"** 3단 로딩은 Land-XI 대시보드에 그대로 이식 가능하고 가장 값싸다.

**B-8. GitHub** — https://github.com/ · `github-home-strip.jpg`
- 배경 **#0d1117 → #161b22** 수직 그라디언트 위에 **보라(#8957e5) 라디얼 블룸**이 히어로 뒤에서 은은히 맥동한다(≈6s 주기).
- **scroll**: 29.5s 프레임 — 중앙에 큰 다크 패널이 뜨고 **내부에서 보라/시안 오로라가 흐른다**. Copilot 데모 영역.
- **hover**: 초록 "Sign up for GitHub" 버튼은 밝기만 8% 상승, 120ms.
- 이메일 입력 필드에 포커스하면 테두리가 보라로 200ms에 걸쳐 물든다.

**B-9. Resend** — https://resend.com/ · `resend-*.jpg` — 검정 바탕, 코드 블록이 언어 탭 전환 시 **글자 단위 crossfade**.

**B-10. Clerk** — https://clerk.com/ · `clerk-*.jpg` — 로그인 컴포넌트가 히어로에서 **실제로 동작**한다. 탭 전환·필드 포커스가 살아 있음.

### C. AI 제품

**C-1. Cursor** — https://cursor.com/ · `cursor-strip.jpg` **(가장 강력한 장치)**
- **idle**: 히어로 아래 에디터 스크린샷이 **정지 이미지가 아니라 에이전트가 코드를 타이핑하는 루프 리플레이**다. 스트립 1.3s→8.9s→11.4s를 비교하면 우측 패널에 **초록/빨강 diff 줄이 실제로 추가·삭제된다.** 사용자는 아무것도 하지 않았는데 제품이 일하고 있다.
- **hover**: "Download for macOS ⇩" pill은 배경 반전 + 아이콘 미세 하강 4px, 180ms.
- **scroll**: 13.9s — "Work autonomously, runs in parallel" 섹션에서 다중 에이전트 패널이 **재생 버튼과 함께** 등장. 16.4s — 고객 인용 3열. 19.0s — 상단에 **릴리스 티커**(Cursor 2.1 · Cursor Slack · Introducing Grok 4.6)가 가로로 흐른다.
- **색**: 크림/오프화이트(#f5f3ef) 바탕 + 검정 텍스트 + 코드 신택스 컬러만이 채도를 담당.
- 시사: Land-XI "라이브 분석" 패널에 **실제 추론 로그가 흐르는 리플레이**를 idle 상태로 두는 근거.

**C-2. Krea** — https://www.krea.ai/ · `krea-strip.jpg`
- **idle**: 로그인 전 랜딩이 곧 **앱 셸**이다(좌측 사이드바 + 우측 캔버스). 상단 "Introducing Seedance Studio" 카드 2장이 자동 재생 영상.
- **scroll**: 14.8s / 17.5s / 20.2s — **컬러 필드 그리드가 계속 색을 바꾼다.** 색면 하나하나가 생성 결과 썸네일이고, 서로 다른 타이밍으로 교체되어 전체가 살아 움직인다.
- 시사: **"타일이 각자 다른 주기로 갱신되는 그리드"** 는 Land-XI의 시군구 매트릭스·모델 카탈로그에 그대로 쓸 수 있다.

**C-3. Runway** — https://runwayml.com/ · `runway-strip.jpg`
- **idle**: 히어로가 풀블리드 루프 영상이고, 6.3s(푸른 안개)와 8.8s(주황 불꽃 궤적)를 보면 **완전히 다른 장면으로 크로스디졸브**된다. 텍스트는 좌하단 고정, 영상만 바뀐다.
- **scroll**: 11.3s — 초록 지형 항공샷으로 전환. 텍스트 블록이 흰 카드로 얹힌다.
- 검정 푸터에 초소형 링크를 5열로 빽빽하게 — **정보 밀도를 미학으로** 쓴다.

**C-4. Luma** — https://lumalabs.ai/ · `luma-strip.jpg`
- 검정 바탕, 중앙 정렬 세리프-라이크 헤드라인 "Luma is your creative partner".
- **idle**: 히어로 하단에 **가짜 프롬프트 입력창**("What's due this week?")이 떠 있고 placeholder 텍스트가 타이핑된다.
- **scroll**: 13.3s — "Open Physical AI Lab" 대형 타이틀 카드. 18.1s — 실사 이미지 2열(촛불 만찬 / 빛을 만지는 손) — **감성 이미지로 리듬 전환**.

**C-5. Perplexity** — https://www.perplexity.ai/ · `perplexity-strip.jpg`
- 오프화이트 앱 셸. **idle**: "What do you want to know?" 아래 입력창의 placeholder가 순환한다.
- **hover**: 14.2s / 16.8s — 사이드바 아이콘에 커서를 올리면 **다크 툴팁이 즉시(0ms 딜레이 없이) 우측에 뜬다.** 16.8s에서 추천 카드 2장이 입력창 아래에 슬라이드인.
- 액센트: 틸(#20808d). 상단 공지 바가 같은 틸.

**C-6. Anthropic** — https://www.anthropic.com/ · `anthropic-home-strip.jpg`
- 바탕 **#f0eee6**(따뜻한 종이색), 텍스트 #191919. 채도 낮은 코럴 액센트.
- **타이포(장치)**: "AI **research** and **products** that put safety at the frontier" — 두 단어에만 **밑줄**이 그어져 있고, 스크롤 진입 시 밑줄이 좌→우로 그려진다.
- **scroll**: 13.0s — 흰 카드 위에 **작은 아이소메트릭 일러스트 아이콘들이 흩어져 배치**되고 각각 미세하게 떠 있다(float, 진폭 3px, 서로 다른 위상).
- 15.4s — "Core to our safety / Anthropic's Responsible Scaling Policy / ..." 리스트가 **얇은 구분선 + 우측 카테고리 라벨**로 정렬. 표가 아니라 목록인데 표처럼 읽힌다.

**C-7. Anthropic Claude** — https://www.anthropic.com/claude · `anthropic-claude-*.jpg` — 동일 시스템, 제품 UI 리플레이 추가.

**C-8. OpenAI** — https://openai.com/ · `openai-index-*.jpg` — 검정/흰 극단 대비, 대형 그리드.
**C-9. OpenAI Sora** — https://openai.com/sora/ · `openai-sora-strip.jpg` — **2026-04-26 서비스 종료**로 헬프 문서 리다이렉트. 캡처는 FAQ 페이지.

**C-10. Scale AI** — https://scale.com/ · `scale-ai-*.jpg` — 데이터 파이프라인을 **노드 그래프**로 시각화하고 노드 사이를 점이 흐른다.

### D. 지오·EO·물리 AI

**D-1. Blackshark.ai** — https://blackshark.ai/ · `blackshark-strip.jpg` **(Land-XI 최근접)**
- 배경 **순수 검정**, 액센트 **애시드 옐로우-그린(#c8ff00 계열)** 단 하나.
- **idle**: 16.5s 프레임 — 우측에 **흰 선으로만 그려진 와이어프레임 지구**가 천천히 자전한다. 면이 없고 위경선과 해안선만 있는 벡터 글로브.
- **수치**: 좌상단에 "**1,00 M+ ⟋ <1% ⟋ 99% Lost Insights**" 라인, 본문에 "**7M** / **TRILLIONS** / **100M**" 대형 수치 블록 + 초소형 캡션. 수치는 카운트업하지 않고 **크기 대비**로 압도한다.
- **scroll**: "Platform For Understanding The Physical World" 아래 3열 카드(01 Sensing / 02 Perception / 03 World Model Compute)가 각각 **작은 영상 썸네일**을 물고 있다.
- 시사: LX의 "국토 전체를 이해한다"를 표현할 때 **와이어프레임 글로브 + 단일 애시드 액센트 + 초대형 수치**는 즉시 채택 가능한 조합.

**D-2. Vantor(구 Maxar)** — https://www.vantor.com/ · `vantor-strip.jpg`
- 49.9s 프레임: 검정 바탕 중앙에 **야간 조명(night lights) 텍스처를 입힌 지구**가 자전하고, 그 위에 "Total clarity from space to ground"가 얹힌다. 지구는 화면 밖으로 잘려 나가며 **크기가 아니라 곡률로 스케일**을 전달한다.
- **hover**: 우하단 "Our Mission" 아웃라인 버튼 — 테두리만 흰색으로 밝아진다.
- 57.6s — 제품 목록(WorldView™ 3D / Radar / Space)이 **얇은 구분선 + 우측 화살표(→)** 로 나열. 화살표는 hover 시 4px 우측 이동.

**D-3. Planet** — https://www.planet.com/ · `planet-strip.jpg`
- 히어로 배경이 **딥 틸-그린 그라디언트(#0a1f1a → #06120f)**, "Unlock a Clearer World"는 라이트 웨이트 산세리프.
- **scroll(핵심)**: 9.7s 프레임 — **정사영상을 3D 평면 슬래브로 기울여 렌더**하고 그 아래 캡션("Broad-Scale Management over the state of Washington, USA, using Planet monthly mosaics"). 위성사진을 지도가 아니라 **물체**로 다룬 사례.
- 11.9s — "See. Decide. Act." 3단어를 틸 컬러로 크게. 문장이 아니라 **리듬**이다.
- 시사: 남원 4시점 정사영상을 이 방식(기울인 슬래브 + 시점 슬라이더)으로 보여주는 것이 평면 지도보다 훨씬 강하다.

**D-4. Umbra** — https://umbra.space/ · `umbra-strip.jpg`
- **로드 자체가 연출**: 1.2s 흰 화면 → 3.7s 회색 그라디언트에 "Expanding what can be done in and through space." 텍스트만 → 6.2s **SAR 영상(모래언덕 능선)이 아래에서 페이드인**. 텍스트가 먼저, 이미지가 나중.
- 11.2s — 검정 카드에 위성 하드웨어 렌더가 스포트라이트 조명으로. 우측에 "Space Systems / Flight-proven Hardware. Mission-Ready Advantage." + 아웃라인 pill.
- 푸터 로고 "UMBRA"가 **화면 폭의 1/4을 차지**한다. 브랜드를 마감재로 쓴 사례.

**D-5. ICEYE** — https://www.iceye.com/ · `iceye-*.jpg` — SAR 이미지의 흑백 텍스처를 그대로 배경으로. 재난 사례(홍수 범위)를 before/after 슬라이더로.

**D-6. Rerun** — https://rerun.io/ · `rerun-strip.jpg`
- 흰 바탕 + 세리프 헤드라인 "The Data Layer **for Physical AI**". 액센트는 빨강 pill 하나.
- 33.8s — 4열 카드(QUERY DATA WITH SQL / REFINE YOUR DATA WITHOUT COPIES / TRACK WITHOUT AN EXPORT STEP / EVERYONE WORKS FROM THE SAME DATA)가 **모두 대문자 초소형 라벨 + 본문**. 개발자 문서 톤을 마케팅에 쓴다.
- 아래 "Spotlight: Better labels for 3D reconstruction" 뉴스 카드에 실제 3D 재구성 썸네일.
- 39.0s — 푸터에 **실제 CLI 명령(`pip install rerun-sdk`)과 URL이 복사 가능한 코드 블록**으로.

**D-7. Rerun Viewer** — https://rerun.io/viewer · `rerun-viewer-strip.jpg` — WASM 뷰어. 캡처 34초 내내 "Loading application bundle…" — **무거운 뷰어의 로딩 UX가 빈약하면 그 자체가 죽은 화면**이라는 반면교사.

**D-8. Foxglove** — https://foxglove.dev/ · `foxglove-strip.jpg`
- 배경 #0d0d12, 액센트 바이올렛(#7c5cff). 헤드라인 "Speed up **Physical AI** development"에서 두 단어만 바이올렛.
- **idle**: 히어로 아래가 **로봇 작업 실사 영상 루프**(창고에서 사람이 로봇 팔 옆에서 작업, 초록 바운딩 박스가 물체를 추적). **검출 박스가 프레임마다 움직이는 것이 idle 모션의 전부이고, 그것으로 충분하다.**
- 33.6s — 고객 로고 탭(Shield AI / Scout AI / DEXTERITY / …)을 누르면 우측 케이스 스터디가 교체. 탭 전환은 텍스트 크로스페이드 + 이미지 슬라이드.

**D-9. Felt** — https://felt.com/ · `felt-strip.jpg`
- **의외의 선택**: 히어로 배경이 **올리브-그린 단색(#4a5a2a 계열)** 이고 그 위에 세리프 "Make maps, apps, and dashboards in seconds". 지도 회사인데 히어로에 지도가 없다.
- 상단에 **오렌지 공지 바**("Ask a question. Get a map. The new era of GIS powered by Felt AI")가 항상 떠 있다.
- 34.6s — 스크롤하면 **실제 Felt 앱 화면**(다크 UI, 좌측 레이어 트리, 중앙 지도, 우측 인스펙터)이 카드로 등장. Linear와 같은 "제품이 데모" 전략.

**D-10. Mapbox** — https://www.mapbox.com/ · `mapbox-strip.jpg`
- 검정 바탕 + Mapbox 블루(#4264fb). 36.8s — "Explore Mapbox live" 섹션. 42.5s — 모바일 지도 UI 목업에 **레이어 토글 패널**이 열려 있다.
- 상단 **파란 이벤트 배너**(BUILD | mapbox · SEPTEMBER 16–17 | VIRTUAL · Register)가 고정.

**D-11. Google Earth Engine** — https://earthengine.google.com/ · `earthengine-strip.jpg`
- 히어로가 **정사영상(해안선 + 농지 패턴) 풀블리드**. 그 위 "A planetary-scale platform for Earth science data & analysis". **위성사진 자체가 배경**인 정공법.
- 25.4s — 푸터 앞에 **일러스트 지구 + 위성** 벡터 그래픽으로 톤을 낮춘다.
- idle 모션 사실상 없음 — 2026 기준으로는 정적이다.

**D-12. NVIDIA Earth-2** — https://www.nvidia.com/en-us/high-performance-computing/earth-2/ · `nvidia-earth2-strip.jpg`
- 검정 바탕에 지구 렌더 + **주변에 6개 원형 아이콘(각각 다른 데이터 도메인)이 궤도처럼 배치**. 아이콘들은 지구 주위를 아주 느리게 공전한다.
- NVIDIA 그린(#76b900)은 로고와 CTA에만.
- 53.6s — "From Global Insights to Local Action" 섹션 — **글로벌→로컬 줌 내러티브**를 문구로 명시.

**D-13. NVIDIA Omniverse** — https://www.nvidia.com/en-us/omniverse/ · `nvidia-omniverse-*.jpg` — 디지털 트윈 렌더 루프. 캡처 영상 길이 이슈로 스트립 불완전.

**D-14. Bentley iTwin** — 403 차단. `bentley-itwin-strip.jpg`는 에러 페이지.

**D-15. Esri UC** — https://www.esri.com/en-us/about/events/uc/overview · `esri-uc-*.jpg` — 키노트 무대 사진 + 세션 카드 그리드. 인터랙션은 보수적.

**D-16. Foursquare Studio** — https://location.foursquare.com/products/studio/ · `foursquare-studio-*.jpg` — kepler.gl 계보. 3D 육각 그리드/아크 레이어 스크린샷.

**D-17. deck.gl 쇼케이스** — https://deck.gl/showcase · `deckgl-showcase-strip.jpg`
- 흰 바탕에 **좌측 썸네일 + 우측 제목/저자/설명**의 리스트. Toronto Dot Density Map, Taxa&Map Biodiversity, Internet Speed Tests Map, The Bad Bet, SandDance, Autonomous Visualization System, BusRouter SG, FlightMapper, Kepler.gl, Minecraft Chunk Viewer…
- 각 썸네일이 **결과물 스크린샷 그대로**. 꾸미지 않는 것이 개발자 신뢰를 만든다.
- Land-XI 시사: "적용 사례" 페이지의 골격으로 그대로 차용 가능.

**D-18. Overture Maps** — https://overturemaps.org/ · `overturemaps-*.jpg` — 오픈 데이터 재단 사이트. 테마별(Buildings/Places/Transportation/Divisions) 색 코딩.

**D-19. Safran Electronics & Defense** — `safran-ai-*.jpg` — 방산 톤. 검정 + 실사 + 최소 모션.

### E. 라이브 지도 (실데이터 idle의 교과서)

**E-1. earth.nullschool.net** — https://earth.nullschool.net/ · `nullschool-strip.jpg` **(idle 모션의 원형)**
- **로드 시퀀스 자체가 서사**: 4.2s 검정 → 7.0s **위경선만 있는 반투명 와이어 구** → 9.9s **해안선 벡터가 그려짐** → 12.7s **바람장 파티클이 전면에 칠해지며 파랑–초록–노랑 컬러맵 완성**.
- **idle**: 파티클 수만 개가 **각자 궤적을 그리며 흘렀다가 수명이 다하면 소멸·재생성**한다. 캔버스 2D. 프레임마다 이전 프레임을 반투명 검정으로 덮어 트레일을 만드는 고전 기법.
- **UI**: 좌하단 "earth" 링크 하나. 컨트롤이 거의 보이지 않는다 — **데이터가 UI**.
- 시사: Land-XI 홈 배경에 이 문법(느린 파티클 흐름 + 실데이터 컬러맵)을 국토 스케일로 이식하면 idle 문제가 단번에 해결된다.

**E-2. Windy** — https://www.windy.com/ · `windy-strip.jpg`
- 11.5s — 회색 베이스맵 + 해안선만. 14.8s — **바람 컬러 필드가 전면에 칠해지고 태풍 소용돌이가 선명해진다**.
- **idle**: 파티클 흐름 + 하단 **타임라인 슬라이더가 자동 재생**되면 시간이 흐른다. 좌상단에 현재 지점 온도("29°")와 아이콘.
- **hover**: 지도 위 어디든 포인터를 올리면 그 지점 수치가 즉시 갱신. 우측 레이어 스택(Wind/Rain/Temp/…)은 아이콘 세로 배열.

**E-3. Zoom Earth** — https://zoom.earth/ · `zoomearth-strip.jpg`
- **레이어 순서가 연출**: 7.9s 검정 → 11.1s **라벨 + 국경 벡터만** → 20.6s **위성 실사 구름 이미지가 벡터 위로 크로스페이드**. 태풍 트랙(주황 점선 + 원뿔 오차범위 + 등급 마커)이 항상 위.
- **idle**: 구름 타일이 시간 순으로 자동 애니메이트.
- **색**: 순수 검정 바다 + 실사 구름 흰색 + 육지 위성 컬러. 라벨은 흰색 초소형.

**E-4. Ventusky** — https://www.ventusky.com/ · `ventusky-strip.jpg`
- 10.0s — **지명 라벨만 있는 회색 화면**(지도 없음). 12.9s — 온도 수치가 도시별로. 15.8s — **바람 스트림라인(가는 흰 곡선)이 전면에 흐른다**. 21.5s — 회색 지형 음영 완성.
- 좌측 레이어 리스트(Temperature/Feels-like/Precipitation/Rain/Satellite/Clouds/Wind speed/Wind gusts/…) 12개가 항상 펼쳐져 있다. **선택지를 숨기지 않는다.**
- 우측에 **세로 컬러 레전드**(무지개 스케일)가 상시 노출.

**E-5. Flightradar24** — Cloudflare 봇 검증으로 차단(`flightradar24-strip.jpg`는 verification 화면). 2차 자료: 3D View는 **Cesium 글로브 + Mapbox 이미지리/지형** 위에 Infinite Flight 제공 항공기 3D 모델을 얹고, **고도 500m 이하 강하 시 실제 태양 위치 기준 그림자**를 드리운다. 주변 항공편의 트레일도 동시 표시.

**E-6. MarineTraffic** — Cloudflare 차단(`marinetraffic-strip.jpg`는 blocked 페이지). 문법은 E-2와 동형(선박 아이콘 방위각 회전 + 항적선).

### F. 국내

**F-1. 카카오모빌리티** — https://www.kakaomobility.com/ · `kakaomobility-strip.jpg` **(국내 최고 참조)**
- 28.3s — **서울 한강 일대 야간 항공/위성 영상을 풀블리드 배경**으로 깔고, 좌측에 카카오 옐로우로 "we / move" 두 줄, 33.4s에 "life."가 추가되어 **세 줄이 순차 타이핑**된다.
- **우측에 "오늘 하루의 누적 이동 거리 **0**km"** — 실시간 카운터. 이것이 idle 모션의 전부이자 핵심이다. **실데이터에 묶인 느린 수치 증가 하나가 화면 전체를 살린다.**
- 아래 "우리의 기술로 생활을 움직입니다." 한 줄.
- 시사: Land-XI 히어로에 **"오늘 분석된 필지 N건 / 누적 탐지 변화 N㎡"** 같은 실데이터 카운터를 그대로 이식.

**F-2. 토스** — https://toss.im/ · `toss-strip.jpg`
- 30.4s — **풀블리드 실사 영상**(지하철 창가에서 폰을 보는 인물)에 하단 대형 한글 카피 "금융부터 일상까지 마침내 토스 하나로".
- 43.8s 프레임에서 배경 영상이 **모션 블러가 걸린 상태로 이동**하고 카피는 **자간이 벌어지며 재배치**된다 — 텍스트가 영상의 속도에 반응.
- 상단 내비는 흰색 반투명, 스크롤 시 배경 블러 강도 상승.

**F-3. 토스뱅크** — https://www.tossbank.com/ · `tossbank-*.jpg` — 카드 제품을 3D로 기울여 회전. 금리 수치가 뷰포트 진입 시 카운트업.

**F-4. 우아한형제들** — https://www.woowahan.com/ · `baemin-brand-*.jpg` — 배민 특유의 한글 레터링(한나체/주아체)과 일러스트. 스크롤 시 캐릭터가 패럴럭스로 따라온다. **브랜드 폰트 자체가 인터랙션의 성격을 규정**한 사례.

**F-5. 현대 IONIQ 5** — https://www.hyundai.com/worldwide/en/eco/ioniq5 · `hyundai-ioniq-strip.jpg`
- 1.4s→12.8s: 히어로 배경이 **일몰(주황) → 주간(청회색) → 도시 야경**으로 순환한다. 차량은 고정, **배경 시간대만 바뀌는 루프**.
- 15.7s — 차량 후면 클로즈업 영상 + "Power Your World". 18.6s — "Tempting electrifying experiences."
- 좌하단 "WINNER 2022 World Car Awards" 배지가 상시 노출.

**F-6. 삼성 Unpacked** — `samsung-unpacked-*.jpg` — 뉴스룸 태그 페이지로 리다이렉트. 카드 그리드.

**F-7. 쏘카** — https://www.socar.kr/ · `socar-strip.jpg`
- 1.6s→11.1s: **카드 썸네일이 스켈레톤(회색 박스)에서 실제 이미지로 순차 교체**된다. 로딩을 숨기지 않고 연출로 쓴 사례.
- 상단 예약 폼(날짜/장소)이 히어로를 대신한다 — **기능이 곧 히어로**.
- 20.5s — FAQ 아코디언. 17.4s — 공항/지역 링크를 **칩 그리드**로 나열하고 hover 시 테두리가 파랑으로.

**F-8. LX 한국국토정보공사** — https://www.lx.or.kr/ · `lx-korea-*.jpg` — 현행 공공기관 표준 레이아웃(배너 슬라이드 + 공지 탭 + 바로가기 아이콘). **본 조사에서 확인한 모든 레퍼런스와 가장 먼 지점.** 개편의 출발선.

**F-9. 네이버 D2** — `naver-d2-*.jpg` — 텍스트 중심. 코드 블록 신택스 하이라이팅.
**F-10. LG SIGNATURE** — 인증서 오류로 lg.com/global로 대체 캡처.

### G. Awwwards SOTD (최근 60일, 지도·3D·데이터 중심)

**G-1. The state of the gallery** — https://mesh3d.gallery/the-state-of-the-gallery (SOTD 2026-08-22) · `aw-mesh3d-gallery-strip.jpg` **(종합 1위 참조)**
- **로딩이 작품**: 13.8s 검정 화면에 좌하단 "**0%**" (초대형 라이트 웨이트 숫자) → 19.3s "**95%**". 퍼센트가 화면의 주인공이다.
- 24.8s — 로딩 완료 후 "**The state**"(좌상단) / "**of the gallery**"(우하단) **대각선 분할 타이포**. 30.3s — 그 사이 공간에 **애시드-그린 파티클 지형 웨이브가 흐른다.** 35.8s / 41.3s를 비교하면 웨이브의 능선이 계속 이동한다 — WebGL 노이즈 기반.
- 우상단 "AUDIO OFF" 토글, 좌상단 "mesh▶" 로고. 우하단 "MADE BY BALKAN BROTHERS".
- **문법 총합**: 퍼센트 로더 → 대각 타이포 → 무한 파티클 지형 → 오디오 토글. Land-XI가 그대로 배울 수 있는 완결된 세트.

**G-2. WC 2026 — Data Portraits** — https://wc26.bogachev.fr/ · `aw-wc26-data-portraits-strip.jpg` **(데이터→지형 메타포)**
- 13.0s — 딥 바이올렛(#1a1332) 바탕에 "Football Data / Portraits". 부제 "**It's an impression, but one built entirely from data. Nothing is staged; each match is reconstructed from roughly 1,500 recorded events — every touch, pass, shot and card.**"
- 16.8s — 제목 아래 "Portraits" 단어가 **다색 그라디언트로 칠해지고**, 배경에 **저폴리 컬러 지형 메쉬**가 등장. 우측에 "104" 대형 수치. 좌하단 "**01 Knockout**" 챕터 번호.
- 20.5s / 24.2s / 27.9s — 경기 결과 행(국기 + 스코어)이 **어두운 배경 위에 격자로 흩어졌다가 정렬**된다.
- **핵심**: "약 1,500개 이벤트 → 읽을 수 있는 지형(readable terrain)". Land-XI의 "탐지 결과 → 국토 지형"과 정확히 같은 메타포. 문구까지 참고할 가치가 있다.

**G-3. Where the Shadow Fell (eclipses)** — https://eclipses.bogachev.fr/ · `aw-eclipses-strip.jpg`
- 바탕 **크림/종이색(#e8e2cf)**, 화면 정중앙에 **작은 원(태양) 하나**. 그 아래 "Charting 11,898 eclipses…" 로딩 텍스트.
- 1.9s→28.3s: 원 안의 퍼센트가 올라가면서 **달 그림자가 태양 위를 실제로 가로질러 간다.** 로딩 진행률 = 식(蝕) 진행률. **로더와 주제를 하나로 묶은 최고 사례.**
- 우하단 "MUSIC ON/OFF" 토글.
- 시사: Land-XI 로딩을 "타일 로드 진행률 = 정사영상이 흑백에서 컬러로 채워지는 진행률"로 묶을 수 있다.

**G-4. Alethia** — https://alethia.earth/ (SOTD 2026-08-05) · `aw-alethia-earth-strip.jpg` — 검정 화면 중앙에 **점 하나만** 40초간 유지. 극단적 미니멀 로더(캡처 구간에서 본편 진입 실패).

**G-5~G-8**: Noomo Showcase, MIU MIU Immersive Bags, The Watch(60fps.fr), Rechroma, Signal IQ, Subdivisions, LIKOVA — 네트워크 타임아웃/차단으로 캡처 실패. Awwwards 목록상 태그는 3D·WebGL·Data Visualization.

---

## 2. "살아있음" 문법 20개 — 타이밍·이징·최저비용 구현

각 항목은 **[관측 출처] · [타이밍/이징] · [가장 싼 구현]** 순으로 정리했다.

| # | 문법 | 관측 출처 | 타이밍 / 이징 | 최저비용 구현 |
|---|---|---|---|---|
| 1 | **느린 앰비언트 그라디언트** — 히어로 뒤 광원이 20초 이상 주기로 굽이침 | Stripe, Linear, GitHub | 주기 18–24s, `linear` 무한, 진폭은 화면폭의 15% 이내 | **CSS**: 2~3겹 `radial-gradient` + `@keyframes`로 `background-position`/`transform: translate` 이동, `filter: blur(60px)`. GPU 부하 거의 0. WebGL은 과잉 |
| 2 | **실데이터 카운터** — 누적 수치가 초당 몇 단위씩 증가 | 카카오모빌리티("오늘 누적 이동 거리 0km") | 60fps `requestAnimationFrame`, `easeOutExpo`로 목표값 접근, 도달 후 실데이터 tick마다 재개 | **JS 8줄**: `performance.now()` 기반 lerp + `Intl.NumberFormat`. `font-variant-numeric: tabular-nums` 필수 |
| 3 | **파티클 흐름장** — 수만 개 입자가 벡터장을 따라 흐르고 소멸·재생 | nullschool, Windy, Ventusky | 입자 수명 40–80프레임, 매 프레임 이전 캔버스를 `rgba(0,0,0,0.04)`로 덮어 트레일 | **Canvas 2D**: 입자 배열 + 바이리니어 보간. WebGL 불필요(2만 개까지 60fps). MapLibre에선 `CustomLayer` |
| 4 | **스크롤=타임라인 시퀀스** — 스크롤 진행률이 프레임 인덱스 | Apple Vision Pro / iPhone / MacBook | `pin` + `scrub: 1`(1초 스무딩)이 스윗스팟. 프레임 60–120장 | **GSAP ScrollTrigger** `pin:true, scrub:1` + 캔버스 `drawImage`. 프리로드 필수. 비디오 스크럽은 **all-intra 인코딩** 아니면 끊김 |
| 5 | **스켈레톤 → 라인 드로우인 → 수치** 3단 로딩 | Cloudflare Radar, 쏘카 | 스켈레톤 shimmer 1.4s `linear` 무한 → 라인 `stroke-dashoffset` 900ms `easeOutCubic` → 수치 카운트업 700ms | **CSS + SVG**: `stroke-dasharray/offset` 전환만으로 라인 드로잉. 라이브러리 0 |
| 6 | **레이어 순차 조립** — 와이어 → 벡터 → 실사 | nullschool, Zoom Earth, Ventusky, Umbra | 레이어 간격 400–700ms, 각 레이어 `opacity` 600ms `easeOutQuad` | **MapLibre**: `map.setPaintProperty(id,'raster-opacity',...)`를 `setTimeout` 체인으로. 또는 `once('idle')` 후 순차 |
| 7 | **마그네틱 버튼** — 커서가 반경에 들어오면 요소가 끌려옴 | Awwwards 다수, Linear CTA | 끌림 최대 8–12px, 추종 `lerp 0.15`/프레임, 이탈 시 `elastic.out(1, 0.4)` 600ms | **JS 15줄**: `mousemove`에서 `getBoundingClientRect` 거리 계산 → `transform: translate3d()`. GSAP `quickTo`가 가장 매끄러움 |
| 8 | **150–250ms 물리 반응** — 모든 인터랙티브 요소의 최소 예의 | Apple(200ms), Cursor(180ms), Stripe(180ms), GitHub(120ms) | `transition: 180ms cubic-bezier(0.22,1,0.36,1)` (easeOutQuint). **300ms 넘으면 굼뜨고, 100ms 미만이면 안 보인다** | **CSS 1줄**. 토큰으로 `--dur-hover: 180ms; --ease-out: cubic-bezier(.22,1,.36,1)` |
| 9 | **제품이 곧 데모** — 스크린샷 대신 동작하는 UI를 심음 | Linear, Cursor, Clerk, Felt | idle 리플레이 루프 12–20s, 끊김 없이 seamless loop | **iframe/컴포넌트 재사용**이 최선. 차선은 **에이전트 로그 타이핑 리플레이**(JSON 스크립트 + `setInterval`) |
| 10 | **비동기 타일 그리드** — 타일들이 각자 다른 주기로 갱신 | Krea 컬러 필드, Vercel "Recently shipped" | 타일별 지연 `Math.random()*4000`, 교체 500ms 크로스페이드 | **CSS**: 타일마다 `animation-delay` 랜덤 인라인 변수. **동기화하지 않는 것이 핵심** |
| 11 | **섹션 반전 커튼** — 흰↔검정이 크로스페이드가 아니라 덮음 | Vercel, Anthropic | `clip-path: inset()` 또는 sticky 오버레이, 스크롤 스크럽 | **CSS `clip-path`** + ScrollTrigger `scrub`. `background-color` 트랜지션보다 훨씬 인상적 |
| 12 | **밑줄 드로잉 타이포** — 강조어 밑줄이 좌→우로 그려짐 | Anthropic("research", "products") | 500ms `easeOutCubic`, 뷰포트 진입 시 1회 | **CSS**: `background-image: linear-gradient` + `background-size: 0% 2px → 100% 2px`. `IntersectionObserver` 트리거 |
| 13 | **대각 분할 타이포** — 제목을 화면 양 끝으로 찢고 그 사이를 비움 | mesh3d.gallery, WC26 | 정적. 진입 시 각 조각 `translateX(∓40px)` 700ms, 200ms 스태거 | **CSS Grid** 2×2에 대각 배치. 폰트는 라이트 웨이트 대형(clamp 4–9rem) |
| 14 | **주제와 묶인 로더** — 진행률이 콘텐츠의 은유 | eclipses(식 진행률), mesh3d(0→95%) | 실제 자산 로드에 연동. 최소 표시 1.2s(너무 빠르면 연출이 안 보임) | **JS**: `Promise.all` 진행 카운트 → CSS 변수. 퍼센트는 `tabular-nums` 초대형 |
| 15 | **기울인 정사영상 슬래브** — 위성사진을 지도가 아닌 물체로 | Planet | 진입 시 `rotateX(58deg) rotateZ(-12deg)` → 목표각까지 900ms `easeOutCubic` | **CSS 3D**: `perspective: 1200px` + `transform`. 그림자는 `filter: drop-shadow`. WebGL 불필요 |
| 16 | **와이어프레임 글로브** — 면 없이 위경선·해안선만 자전 | Blackshark, Vantor, nullschool 초기 | 자전 주기 60–90s(느릴수록 고급), `linear` | **Canvas 2D + 정사도법 투영 직접 구현**(nullschool 방식)이 three.js보다 가볍다. 해안선은 저해상도 GeoJSON |
| 17 | **초대형 수치 + 초소형 캡션** — 크기 대비로 압도 | Blackshark(7M/TRILLIONS/100M), WC26(104) | 수치 `clamp(3rem, 8vw, 9rem)`, 캡션 11–12px 대문자 자간 0.12em. 카운트업은 **선택** — 크기만으로 충분할 때가 많다 | **CSS만**. `tabular-nums` + `font-weight: 300` |
| 18 | **상시 노출 레전드·레이어 리스트** — 선택지를 숨기지 않음 | Ventusky(12개 레이어 상시), Windy | 없음(정적). 활성 항목만 180ms 하이라이트 | **CSS**. 접근성상 `aria-pressed` 필수 |
| 19 | **크로스헤어 툴팁** — 차트/지도 위 포인터에 즉시 붙는 수치 | Cloudflare Radar, Windy | **지연 0ms, 이징 없음.** 데이터 정밀도가 우선이므로 관성을 넣으면 안 된다 | **JS**: `pointermove` → `transform: translate3d()`. `will-change: transform` |
| 20 | **셰브론 바운스 + 오디오 토글** — "더 있다"와 "이건 경험이다"의 신호 | SpaceX(셰브론), mesh3d/eclipses(오디오) | 셰브론 진폭 6px, 주기 1.6s `ease-in-out` 무한. 오디오는 **기본 OFF**, 토글은 항상 같은 자리 | **CSS `@keyframes`** + `<button aria-pressed>`. 오디오는 `prefers-reduced-motion` 존중 |

**보조 원칙 3가지**

- **주기를 서로 어긋나게 하라.** Vercel의 "Recently shipped" 카드들과 Krea의 컬러 필드가 살아 보이는 이유는 각 요소가 **다른 주기·다른 위상**으로 움직이기 때문이다. 같은 `animation-duration`을 쓰면 즉시 기계적으로 보인다.
- **느릴수록 고급이다.** Stripe 리본 20s+, 와이어 글로브 자전 60–90s, GitHub 블룸 6s. 3초 이하 반복 앰비언트는 산만하고 싸구려로 읽힌다.
- **hover는 빠르고 idle은 느리다.** hover 150–250ms, idle 6–90s. 이 두 시간축이 섞이면 둘 다 망가진다.

---

## 3. Land-XI 전 화면 통과 체크리스트 (idle / hover / scroll)

각 화면은 아래 3개 관문을 **모두** 통과해야 리뷰에 올린다. 하나라도 미달이면 "딱딱함" 판정이 재발한다.

### idle — 아무도 만지지 않을 때

- [ ] **I1.** 화면에 **실데이터에 묶인 느린 앰비언트 모션이 최소 1개** 있다. (파티클 흐름장 / 실시간 카운터 / 타일 순차 갱신 / 앰비언트 그라디언트 중 택1 이상)
  - 장식용 루프는 인정하지 않는다. "오늘 분석된 필지 N건", "누적 탐지 변화 N㎡", "최근 수신 위성영상 N시간 전" 처럼 **숫자의 출처가 있어야** 한다.
- [ ] **I2.** 앰비언트 모션의 **반복 주기가 6초 이상**이고, 화면 내 복수 요소는 **서로 다른 주기·위상**을 갖는다.
- [ ] **I3.** 로딩 상태가 **빈 화면이나 무한 스피너가 아니다.** 스켈레톤 → 레이어 순차 조립 → 수치 확정의 3단이 보인다. (반면교사: Rerun Viewer의 34초 "Loading application bundle…")
- [ ] **I4.** `prefers-reduced-motion: reduce`에서 I1~I3이 **정적 대체 표현**으로 안전하게 내려앉는다.
- [ ] **I5.** 화면을 캡처해 8프레임 스트립으로 만들었을 때, **프레임 간 차이가 육안으로 보인다.** (본 조사와 동일한 검증법 — `tools/bench-alive-strips.mjs` 재사용)

### hover — 포인터가 닿을 때

- [ ] **H1.** **모든 인터랙티브 요소**(버튼·링크·카드·탭·범례 항목·지도 피처·차트 계열)가 **150–250ms 안에 물리적으로 반응**한다. 색만 바뀌는 것은 최저선이고, 이동/스케일/그림자/테두리 중 하나가 더 붙어야 한다.
  - 표준 토큰: `--dur-hover: 180ms`, `--ease-out: cubic-bezier(.22,1,.36,1)`
- [ ] **H2.** 반응하지 않는 요소는 **커서가 `default`** 다. 클릭 가능해 보이는데 죽어 있는 요소는 0개.
- [ ] **H3.** 데이터 위(차트·지도)의 hover는 **지연 0ms·이징 없음**의 크로스헤어/툴팁이다. 여기에 관성을 넣지 않는다.
- [ ] **H4.** 주요 CTA 최소 1개에 **마그네틱 반응**(끌림 8–12px, 이탈 시 elastic 600ms)이 걸려 있다.
- [ ] **H5.** hover 상태가 **키보드 포커스(`:focus-visible`)에서도 동일하게** 나타난다.

### scroll — 페이지를 훑을 때

- [ ] **S1.** 한 페이지 안에 **연속된 카메라가 하나** 있다. 섹션마다 다른 연출을 붙이지 않고, 지도/지구/영상 중 **하나의 피사체가 스크롤 내내 이어진다.** (Apple 시퀀스 · SpaceX 크로스디졸브 · Planet 슬래브 회전)
- [ ] **S2.** 섹션 경계에 **하드 컷이 없다.** 배경 반전은 크로스페이드 또는 `clip-path` 커튼으로 처리한다.
- [ ] **S3.** 최소 1개 섹션이 **pin + scrub**(`scrub: 1`)으로 고정되어, 스크롤을 멈추면 모션도 멈춘다. 스크롤과 무관하게 재생되는 비디오는 S1을 만족하지 않는다.
- [ ] **S4.** 뷰포트 진입 시 텍스트는 **`translateY(20px)→0` + fade, 600ms, 라인당 60ms 스태거**로 들어온다. 전체가 한 번에 나타나지 않는다.
- [ ] **S5.** 수치·차트는 **진입 시점에 그려진다.** 이미 그려진 채로 스크롤되어 들어오지 않는다.
- [ ] **S6.** 모바일/터치에서는 `gsap.matchMedia()`로 **pin을 쓰지 않는 대체 흐름**을 제공한다(관성 스크롤과 충돌).

### 통과 판정 방법

새 화면을 만들 때마다 `node tools/bench-alive.mjs`의 캡처 루틴(로드/+1.5s/+4s/hover/scroll/scroll2 + webm)을 **자기 화면에 그대로 돌려** 스트립을 만든다.
그 스트립을 본 문서의 `blackshark-strip.jpg` · `cloudflare-radar-strip.jpg` · `kakaomobility-strip.jpg` · `aw-mesh3d-gallery-strip.jpg` 옆에 나란히 놓고,
**"어느 쪽이 정지 화면처럼 보이는가"** 를 눈으로 판정한다. 이것이 "기대의 2%" 판정을 재현 가능한 기준으로 바꾸는 유일한 방법이다.

---

## 4. Land-XI 즉시 적용 우선순위 (비용 대비 효과순)

1. **히어로 실데이터 카운터** (문법 #2, 카카오모빌리티) — JS 8줄. 오늘 안에 idle 문제의 절반이 해결된다.
2. **hover 토큰 일괄 적용** (문법 #8) — CSS 변수 2개. 전 화면 일괄. "딱딱함"의 직접 원인.
3. **대시보드 3단 로딩** (문법 #5, Cloudflare Radar) — SVG `stroke-dashoffset`만으로 차트가 살아난다.
4. **MapLibre 레이어 순차 조립** (문법 #6, nullschool/Zoom Earth) — 기존 레이어 순서를 시간축으로 펼치기만 하면 된다.
5. **정사영상 기울인 슬래브** (문법 #15, Planet) — 남원 4시점 자산을 CSS 3D만으로 "물체"로 승격.
6. **와이어프레임 국토 + 애시드 액센트** (문법 #16/#17, Blackshark/Vantor) — 홈 히어로의 브랜드 정체성.
7. **파티클 흐름장** (문법 #3, nullschool) — Canvas 2D 커스텀 레이어. 가장 강력하지만 구현 비용도 가장 큼. 5번까지 끝낸 뒤 착수.

---

## 참고 링크

- Apple Vision Pro 스크롤 시퀀스 해부 — https://css-tricks.com/lets-make-one-of-those-fancy-scrolling-animations-used-on-apple-product-pages/
- Stripe 글로브 제작기(3레이어 구조) — https://stripe.com/blog/globe
- GSAP ScrollTrigger pin/scrub 공식 문서 — https://gsap.com/docs/v3/Plugins/ScrollTrigger/
- Linear Liquid Glass(실시간 GPU 광원) — https://linear.app/now/linear-liquid-glass
- Flightradar24 3D View(Cesium + Mapbox, 실제 태양 위치 그림자) — https://www.flightradar24.com/blog/inside-flightradar24/introducing-enhanced-3d-view-on-flightradar24/
- Awwwards Sites of the Day — https://www.awwwards.com/websites/sites_of_the_day/
- Awwwards Data Visualization 컬렉션 — https://www.awwwards.com/websites/data-visualization/
