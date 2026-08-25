# Awwwards 급 인터랙션 문법 리서치 — Land-XI 재설계용

조사일: 2026-08-25 · 대상: 2023–2026 수상작(SOTD/SOTM/SOTY/Honorable Mention), Codrops 케이스스터디/튜토리얼, 스튜디오 자체 BTS
전제: Land-XI(LX 국토정보 Geo-AI 플랫폼) · vanilla ES modules, 번들러 없음, CDN 라이브러리, MapLibre GL v5(globe/map) + 실제 정사영상 타일, 밝은 지도 바탕 + 유리 패널

---

## 0. 진단 — 클라이언트가 말한 "시네마 없음 / 인간미 없음"의 정체

수상작과 우리 1차안의 격차는 "효과가 부족하다"가 아니라 **연출(choreography)이 없다**는 것이다.
리서치한 30여 개 사이트에서 공통적으로 관찰되는 3가지 구조적 차이:

1. **하나의 연속된 카메라** — 수상작은 페이지를 "넘기지" 않는다. San Rita Project는 3D 지형 캔버스를 라우터 바깥에 "글로벌 캔버스"로 마운트해서, 프로젝트를 클릭하면 페이지 전환 대신 **카메라가 그 좌표로 다이브**한다. 하나의 롱테이크.
   https://www.awwwards.com/mapping-the-uncharted-the-san-rita-project.html
2. **모든 것을 구동하는 단일 정규화 값** — Trionn은 `scrollProgressRef` 하나(0–1)를 만들고, 섹션별 타이밍 창(0.35–0.53 파티클 폭발, 0.56–1.0 카드 등장)으로 리맵해서 DOM·WebGL·오디오를 전부 같은 심장박동에 물린다. 시스템 간 통신이 필요 없다.
   https://tympanus.net/codrops/2026/07/15/the-architecture-behind-trionn-coordinating-gsap-three-js-lenis-and-web-audio/
3. **불규칙성의 의도적 주입** — Podium/Trionn/PX PUSH 전부 텍스트 리빌에 `stagger: { from: "random" }`을 쓴다. Cerebrium은 네트워크 경로마다 오프셋·속도·펄스 간격을 랜덤화해 "동기화된 기계적 외형"을 피한다. **균일함 = AI가 만든 티**라는 인식이 이미 업계 담론이다.
   https://www.925studios.co/blog/ai-slop-web-design-guide

우리 안이 "스케치 목업"으로 읽힌 이유는 요소가 부족해서가 아니라, 요소들이 **같은 이징으로 동시에** 나타나기 때문이다.

---

## 1. 수상작 문법 카탈로그 (30개 사이트)

### 1-A. 색인표

| # | 사이트 | 스튜디오 | 수상/출처 | 핵심 장치 |
|---|--------|----------|-----------|-----------|
| 1 | Igloo Inc (igloo.inc) | abeto | SOTY 2024 | 실시간 인트로→본편 심리스, 씬 전환 = 색수차+변위+서리 디졸브, UI 전체를 WebGL로, SDF 오프셋 텍스트 스크램블 |
| 2 | Messenger (messenger.abeto.co) | abeto | SOTY 2025 | 스크롤 대신 **플레이**. 미니 행성 1바퀴 30초, 물리·조명·애니 전부 GPU, 멀티플레이 이모지 |
| 3 | Lando Norris (landonorris.com) | OFF+BRAND | SOTY 2025 + Users' Choice | 3D 헬멧 회전, Rive 모션 + WebGL 혼용, 스크롤 시네마틱, Webflow 위에서 구현 |
| 4 | Lusion v3 (lusion.co) | Lusion | SOTY 2023 | Houdini 사전 시뮬 → ArrayBuffer/PNG 텍스처로 굽기, 인터랙티브 천 시뮬(220KB gzip), 아날리티컬 볼류메트릭 라이트 |
| 5 | Oryzo AI (oryzo.ai) | Lusion | SOTM 2026-04 | **히어로 오브젝트 딱 하나**. 관성/무게가 있는 이징, 레이어 패럴랙스가 아닌 **진짜 Z축 카메라 이동** |
| 6 | Trionn | Trionn | Codrops 2026-07 | 단일 스크롤 드라이버, hold-to-blast, 용접 스파크, Web Audio 실시간 합성, 오디오 반응 포그 |
| 7 | The Sleepers | — | Codrops 2026-07 | 저사양 지향: 텍스처 R채널을 **픽셀별 threshold**로 쓰는 소용돌이 리빌, 가짜 포그(월드 Y 블렌드 + 도메인 워핑 노이즈), 3×3 무한 타일 |
| 8 | HAOQI.DESIGN | — | Codrops 2026-08 | Lenis 내부 루프를 끄고 three.js 렌더 사이클에 병합 → DOM/WebGL 1프레임 지연 제거, ScrollBus/PointerBus, 도트매트릭스 전환 언어 |
| 9 | ZERO | — | Codrops 2026-07 | 6스테이지 + **5개 인터랙션 게이트**(제로 그리기, 홀드해서 유리 깨기), 가상 스크롤 1개가 로딩·셰이더·텍스트 전부 구동, 3단 적응형 품질 |
| 10 | PX PUSH | — | Codrops 2026-08 | 스크롤 속도 = 회전 속도(15프레임 인물 회전), 히어로 "speed" 단어 호버 시 카메라 배속 0.2→2, CRT 오버레이가 페이지 전환을 관통 |
| 11 | Podium | — | Codrops 2026-06 | "느림의 연출" — 요소가 나타나지 않고 **배어나온다**, difference 블렌딩 마우스 트레일, 픽셀 단위 호버 |
| 12 | Cerebrium | — | Codrops 2026-07 | 추상 인프라의 물성화: UV 따라 흐르는 절차적 불투명 마스크 = "펄스 신호", Fresnel 실드 + 육각 그리드가 마우스를 "잠깐 기억" |
| 13 | MERSI | — | Codrops 2026-07 | "quiet luxury" 에디토리얼, 세로형 이미지를 **제약이 아닌 구성 자산**으로, 커튼 와이프 전환 |
| 14 | Bisous | — | Codrops 2026-06 | 시네마틱 로더(큐레이션 비주얼 연속), 4컬럼 그리드, 산세리프+모노 2종 대비, 양방향 무한 세로 슬라이더 |
| 15 | Shopify Editions Spring '26 | Shopify Design | SOTM 2026-02 | "스크롤이 uniform을 구동하지 React 렌더를 구동하지 않는다", **GPU 4티어**(0=WebGL 없음 정적 → 3=풀 데스크톱) |
| 16 | **San Rita Project** | — | Awwwards CS | 실제 GPS/하이트맵 지형, 글로벌 캔버스, 클릭 = 좌표로 카메라 다이브(원 컷), 머티리얼에 노이즈·그레인 주입해 종이 질감 |
| 17 | Stas Bondar '25 (stabondar.com) | 개인 | Codrops 2025-03, GSAP SOTM | `gsap.quickTo()` 전면 사용, Bayer 8×8 디더, 스크롤 속도 → 왜곡 강도, Flip 프로젝트 전환 |
| 18 | Cartier Watches & Wonders | Immersive Garden | — | 시계 1점당 3D 알코브 6개, 스크롤로 순회, GLSL + Web Audio 내러티브 스코어 |
| 19 | Hubtown (hubtown.co.in) | Unseen Studio | — | 발광 3D 모놀리스 + **마우스 리빌**(커서가 지오메트리/라이팅 디테일을 벗겨냄) |
| 20 | Explore Primland | — | — | 실제 지형 시네마틱 항공 플라이스루, 대기 포그, 스크롤 제어 카메라 글라이드 |
| 21 | Bruno's Portfolio 2025 | Bruno Simon | SOTM 2026-01 | TSL(WebGL/WebGPU 양쪽 컴파일), Cannon 프리미티브 물리, Matcap으로 라이트 없이 룩 확보 |
| 22 | LXSTNGHT / FRONTIER | Filip | Codrops 2026-08 | 카메라를 오디오에 실시간 반응시키지 않고 **오프라인 분석 후 `audio.currentTime` 룩업**, 모달 제거하고 레인 위 헥스 게이트로 선택 |
| 23 | Dash Creative | — | Codrops 2026-07 | 커서 자기장 왜곡이 **진행 방향으로 모멘텀을 끌고 가다가** 감쇠, iOS식 촉각 카드 |
| 24 | IVRESS (brand.ivress.co.jp) | Utsubo | — | WebGPURenderer + WebGL 폴백을 TSL 하나로 (코드 포크 없음) |
| 25 | Chems.Studio 아카이브 | — | Codrops 2026-08 | 콘텐츠 주도 유연 아카이브 레이아웃 |
| 26 | Sketching the Impossible | — | Codrops 2026-06 | **3D 모델 0개로 만든 3D 포트폴리오** (전부 셰이더/절차적) |
| 27 | Floema | Bürocratik | SOTM 2026-05 | Developer Award |
| 28 | GQ × AP The Extraordinary Lab | Immersive Garden | SOTM 2026-03 | 브랜드 인터랙티브 랩 |
| 29 | Mat Voyce (matvoyce.tv) | — | — | 글자가 스크롤에 늘어나고/튕기고/재조합되는 타임라인 구동 키네틱 타입 |
| 30 | Uncommon Studio / By-Kin / Iventions / Minh Pham | — | Awwwards | "카메라 무브처럼 느껴지는 섹션 전환", 무게감 있는 스무스 스크롤, 스포트라이트 3D 씬 |

주요 출처:
- SOTY 아카이브 https://www.awwwards.com/websites/sites_of_the_year/
- SOTM 아카이브 https://www.awwwards.com/websites/sites_of_the_month/
- Igloo Inc 케이스스터디 https://www.awwwards.com/igloo-inc-case-study.html
- Lusion 케이스스터디 https://www.awwwards.com/case-study-for-lusion-by-lusion-winner-of-site-of-the-month-may.html
- Lusion 인터뷰 https://tympanus.net/codrops/2026/04/13/lusion-where-digital-craft-meets-ambitious-experimentation/
- Three.js 사이트 2026 정리 https://www.utsubo.com/blog/best-threejs-websites-2026
- 2026 수상작 심사 노트 https://www.hontran.dev/blog/best-award-winning-websites-2026

---

### 1-B. 장치별 해부

#### (1) 프리로더 → 히어로 리빌 연출

- **Igloo Inc**: 인트로가 프리렌더 영상이 아니라 **실시간 렌더**. 그래서 인트로 끝프레임이 곧 본편 첫프레임 → 이음매가 없다. 파일 크기도 줄어든다.
- **Bisous**: 로딩 중 큐레이션된 비주얼이 연속 재생 = "로딩"이 아니라 "오프닝 타이틀 시퀀스".
- **ZERO**: 프리로더가 실제로는 **가상 스크롤 0 지점**. 로딩·셰이더 워밍·텍스트가 전부 같은 값에 물려 있어 로딩과 첫 씬이 하나의 타임라인.
- **Shopify**: 투명 비디오는 "첫 복원 프레임이 페인트될 때까지 포스터를 유지" — 빈 화면/깜빡임을 절대 노출하지 않는다.
- **업계 관행**: 오버사이즈 롤링 카운터가 **랜덤 스텝**으로 100까지 오르고, 실제 `window.load`(폰트/이미지 포함)에 동기화. 가짜 프로그레스바는 금물.
- **핵심 원리**: 프리로더는 *지연을 숨기는 장치*가 아니라 *리듬을 세팅하는 장치*. 프리로더의 마지막 모션이 히어로의 첫 모션으로 **물리적으로 이어져야** 한다(같은 요소가 이동/스케일/모프).

#### (2) 스크롤 구동 카메라

- **패턴 A — pin + scrub 1:1**
  `ScrollTrigger.create({ trigger, start: "top top", end: "+=" + totalScroll, pin: true, onUpdate: renderTick })`.
  카메라 웨이포인트는 `ease: "none"`, `duration = end - start`로 스크롤과 선형 결합. 스크롤 공간은 `500vh`(짧은 시퀀스) ~ `900vh`(긴 내러티브).
  https://tympanus.net/codrops/2025/11/19/how-to-build-cinematic-3d-scroll-experiences-with-gsap/
- **패턴 B — 정규화 값 1개 + 타이밍 창** (Trionn)
  `linear`(0–1) → 리맵 → 371프레임 WebP 시퀀스 인덱스, 파티클 폭발(0.35–0.53), 카드(0.56–1.0). 프레임 인덱스조차 `idx += (target - idx) * 0.12`로 이징해 스크럽의 계단현상을 없앤다.
- **패턴 C — 가상 스크롤** (ZERO)
  브라우저 스크롤 대신 자체 값이 타겟으로 ease. 9개 세그먼트가 각각 enter/scrub/update/teardown 라이프사이클 → 어느 스테이지로 점프해도 앞 세그먼트를 리플레이해 디버깅 가능.
- **패턴 D — 카메라 = 내비게이션** (San Rita)
  페이지 전환이 아예 없다. 카메라가 좌표로 다이브. **Land-XI 지도 플랫폼에 그대로 이식 가능한 최상위 아이디어.**
- **깊이 규칙(Oryzo)**: 레이어 패럴랙스(2D 슬라이딩)가 아니라 **진짜 Z축 카메라 이동**. 이 차이가 "템플릿" vs "제작물"을 가른다.

#### (3) 커서 물리

- **자기장(Dash Creative)**: 단순 호버 반응이 아니라, 왜곡이 **이동 방향으로 모멘텀을 끌고 가다가 서서히 정착**한다.
  실측 파라미터: `motionTarget *= 0.86`(속도 감쇠), `motionGain: 220`, 셰이더 `radius 0.41 / amplitude 0.082 / frequency 13 / speed 0.98 / carry 6 / stagger 12`.
- **감쇠 팔로우 lerp 계수 실측치**: 0.06(Trionn 심볼 회전), 0.10(Stas Bondar 범용), 0.12(프레임 스크럽), 0.16(PX PUSH 로고 스핀), `dampAngle` lambda 6(HAOQI 링라이트).
- **커서 상태 머신**: `data-cursor="..."` 속성으로 색/크기/문구 전환, 방향 인지 회전 배지("View Project"). 이동 트윈은 0.2s `power2.out` 또는 `gsap.quickTo()`.
- **스포트라이트 커서(Hubtown)**: 커서가 씬의 디테일을 벗겨내는 마스크. 지도 레이어 렌즈로 직행 이식 가능.
- **PointerBus(HAOQI)**: 브라우저 좌표 → 정규화 UV 변환을 **한 곳에서 한 번만**. WebGL엔 mutable Vector2, DOM엔 immutable 스냅샷.

#### (4) 텍스트 모션

- **랜덤 스태거가 사실상 표준**: `stagger: { each: 0.08, from: "random" }`(Trionn), `0.03`(PX PUSH), `0.02` 문자 / `0.1` 라인(Stas Bondar). "균일 페이드"는 즉시 템플릿으로 읽힌다.
- **블러 + 알파 동시 해제**: 컨테이너 `autoAlpha 0→1` 0.5s, 문자 `filter: blur(N px)→blur(0)` 0.8s `power2.out`.
- **스크램블**: Igloo은 **SDF 텍스처 오프셋** 조정(HTML/CSS 재계산보다 훨씬 저렴). HAOQI는 모든 인스턴스가 **40ms 티커 하나**를 공유하고, 뷰포트 진입 + 전환 시작 이후에만 구독.
- **가변폰트**: 무게/폭 축을 스크롤·호버로 연속 보간. CSS scroll-driven animation과 조합하면 JS 없이 가능.
- **마퀴 3D 리빌(PX PUSH)**: 섹션 타이틀 8회 반복, 단어가 **랜덤 순서로** 약간의 3D 원근 회전과 함께 등장, 이탈 시 20px 지점에서 블러 페이드.
- **키네틱(Mat Voyce)**: 글자가 늘어나고 스냅되고 재조합 — 전부 타임라인 구동.

#### (5) 이미지/텍스처 전환

- **threshold 리빌(The Sleepers)**: 흑백 텍스처의 R채널 = 픽셀별 임계값. progress와 비교해 프래그먼트가 순차 전환 → 유기적 소용돌이 리빌을 **연산 거의 없이**. ← 정사영상 4시점 전환에 최적.
- **디스플레이스먼트 호버**: 변위 이미지로 A→B 전환. https://tympanus.net/codrops/2018/04/10/webgl-distortion-hover-effects/
- **RGB 시프트 + 그리드 변위(GPGPU)**: https://tympanus.net/codrops/2024/08/27/grid-displacement-texture-with-rgb-shift-using-three-js-gpgpu-and-shaders/
- **디더(Stas Bondar)**: Bayer 8×8, threshold `-0.88`, 호버 전환 1s. 저사양에서도 거의 무료이고 "제작된 룩"을 즉시 만든다. 실시간 디더 셰이더 https://tympanus.net/codrops/2025/06/04/building-a-real-time-dithering-shader/
- **색수차/글리치(Igloo)**: 셰이더 처리라 성능 영향 없음. 씬 전환 = 색수차 + 변위 + 서리 디졸브 3중.
- **GLSL 컴포짓 패스(Shopify)**: 씬 전환을 오프스크린 FBO 간 합성으로. 인접 씬만 마운트해 크로스페이드.
- **SDF/노이즈 전환 종합**: https://tympanus.net/codrops/2025/01/22/webgl-shader-techniques-for-dynamic-image-transitions/

#### (6) 깊이 & 패럴랙스

- 레이어드 캔버스 대신 **단일 글로벌 캔버스 + 진짜 카메라**(San Rita, Oryzo).
- 마우스 패럴랙스는 항목별 랜덤 배수(기본 0.6 × 개별 랜덤 변동).
- DOF/블러는 풀 포스트프로세싱보다 **머티리얼 안 포그 색 블렌딩**으로 대체(Sleepers): 월드 Y 기준 선형 포그 + 도메인 워핑 노이즈, 씬을 감싸는 구체로 수평선 포그.
- 파티클 관성: `momentum = momentum * 0.92 + vel * 0.15`.

#### (7) 라이팅 / 분위기

- **그레인을 머티리얼에 주입(San Rita)**: 포스트 그레인이 아니라 셰이더 안에서 노이즈+그레인 → "종이 같은" 촉감. 프레임레이트가 떨어지면 **그림자 해상도와 그레인 밀도를 자동 감소**.
- **Matcap(Bruno Simon)**: 라이트/그림자 없이 재질감 확보. iGPU에서 가장 저렴한 "고급스러움".
- **Fresnel(Cerebrium)**: 그레이징 앵글에서 밝아지는 구형 실드 + 육각 그리드 투영 + 마우스 근처 국소 발광 후 서서히 페이드("잠깐 기억한다").
- **아날리티컬 볼류메트릭 라이트(Lusion)**: 레이마칭 없이 수식으로 갓레이.
- **라이트 슬롯 함정(LXSTNGHT)**: intensity 0인 라이트도 **셰이더 라이트 카운트 슬롯을 차지한다**. 끄려면 제거해야 함.
- **픽셀 예산(LXSTNGHT)**: devicePixelRatio가 아니라 **드로잉 버퍼 메가픽셀**로 상한을 잡아라. 그리고 median이 아니라 **p95 프레임타임**을 측정하라.

#### (8) 사운드

- **런타임 합성(Trionn)**: 오디오 파일 대신 오실레이터 3개(기본 / 옥타브 / 3배음) + 피드백 딜레이 0.14s로 플럭 생성 → 대역폭 0. 감쇠는 GSAP `duration: 0.9, ease: "expo.out"`.
- **오디오 반응 포그**: AnalyserNode 중역 에너지를 lerp 스무딩해 셰이더 morph 속도에 주입 (`morphOffset += (4.0 + freqEnergy * 16.0 + hoverBoost * 2.8) * dt`).
- **프레임 동기(ZERO)**: 유리 깨짐 소리를 타이머가 아니라 **첫 렌더 프레임**에 동기 → 저사양에서 소리가 먼저 나는 사고 방지. Howler.js 사용.
- **UX 원칙**: 자동재생 금지, 명시적 토글 필수, 앰비언트는 눈에 띄지 않게. https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices
- **LX 공공 플랫폼 결론**: 기본 OFF + 우측 상단 작은 파형 토글. UI 사운드는 24kHz 이하 짧은 클릭/틱 2~3종만(런타임 합성 권장).

#### (9) HUD / 데이터 마이크로 인터랙션

- **모달을 없앤다(FRONTIER)**: 업그레이드 선택을 "스크림 뒤 3장 카드 모달"에서 **레인 위에 실제로 서 있는 헥스 게이트**로 이동 → 선택에 공간적 결과가 생기고 코어 루프가 멈추지 않는다. **대시보드 필터/설정 패널 설계에 직결.**
- **펄스 = 신호(Cerebrium)**: 메시를 움직이지 않고 UV 따라 흐르는 절차적 불투명 마스크. 경로마다 오프셋/속도/펄스 간격 랜덤.
- **픽셀 단위 호버(Podium)**: 큰 장식 애니메이션 대신 "작은 픽셀 같은 거동".
- **카드 호버**: 스케일 1.12로 **스냅이 아닌 lerp**.
- **스크롤 속도의 물리화(PX PUSH)**: 스크롤이 빠르면 로고가 빨리 돌고, 역방향이면 역회전. 사용자의 입력이 곧 물리량.

#### (10) 페이지 전환

- **Flip 기반 공유 요소**: 그리드 위치의 미디어가 그대로 프로젝트 히어로로 확장(Podium). Stas Bondar은 1.3s `power3.inOut`.
- **커튼 와이프(MERSI)**: 데스크톱 우측 커튼 1.2s, 모바일 clip-path 이중 커튼. 커버 플립 전환 1.2s `expo.inOut`으로 위치·크기·종횡비 동시 모프.
- **드로어 오버레이(PX PUSH)**: 새 페이지로 안 가고 종이 질감 드로어가 덮음. **모든 WebGL 씬이 렌더된 뒤에야 열리고**, 닫힘 애니메이션이 끝난 뒤에야 라우팅을 반환 → 슬러그 URL·스키마 유지(SEO).
- **CRT 래퍼(PX PUSH)**: 모든 전환을 관통하는 고정 오버레이 하나로 시각적 연속성 확보.
- **View Transitions API**: 2026년 기준 cross-document 상호운용 확보(Chrome/Edge 126+, Safari 18, Firefox 144), 글로벌 커버리지 약 92%. 저사양에서 GSAP 대비 2–3배 체감 스냅. 미지원 시 평범한 페이지 스왑으로 우아하게 degrade.
  https://developer.chrome.com/docs/web-platform/view-transitions/cross-document

#### (11) "스토리 모드 ↔ 툴 모드" 핸드오프

정면으로 푼 사례 3개:

- **San Rita**: 3D 세계는 배경에서 계속 돌고 HTML 레이어가 타이포/UI 담당. 툴(프로젝트 리스트) 스크롤과 3D 반응이 **중첩 스크롤**로 공존. 캔버스가 라우터 밖에 있어 언마운트되지 않음. "스크롤 무게"를 몇 주간 캘리브레이션.
- **ZERO**: 자동 진행 내러티브 사이에 **5개 게이트**를 두고, 게이트는 반드시 사용자 제스처(그리기/홀드)로만 통과. 수동 관람 → 능동 조작의 리듬 전환.
- **Shopify**: 각 콘텐츠 섹션 = 씬 프리셋. 활성 씬 + 인접 씬만 마운트하고 합성. 모드 전환이 곧 씬 크로스페이드.

→ **Land-XI 공식**: 스토리 모드와 툴 모드가 *같은 카메라·같은 캔버스*를 공유하고, 전환은 "UI가 사라지고 나타나는 것"이 아니라 **카메라 목표점과 HUD 밀도의 변화**여야 한다.

#### (12) 인간미를 지키는 법

- **랜덤 스태거·랜덤 파라미터** (위 전부). 균일 = 기계.
- **재질(materiality)**: MERSI — 인터랙션이 "덧붙인 장식"이 아니라 "사이트의 시각 언어와 연결"되어야 한다. 플립 전환이 내비게이션을 *물리적*으로 만든다.
- **에디토리얼 구성**: MERSI — "페이지는 채워지는 게 아니라 **구성된다**". 세로 이미지가 만드는 수직 리듬과 긴장으로 뻔한 풀블리드 연속을 회피.
- **타입 2종 대비(Bisous)**: 럭셔리 산세리프 + 프로덕션 모노. 한 서체로 전부 처리하지 않는다.
- **의도적 느림(Podium)**: "요소는 즉시 나타나지 않고 배어나온다."
- **이스터에그**: PX PUSH의 "speed" 호버 배속, Bisous의 'Bisous' 글자 치환. 탐색을 보상한다.
- **덜어내기(San Rita)**: 나는 새, 인터랙티브 날씨, 낮/밤 사이클을 **전부 삭제**. 기능 수보다 분위기의 일관성.
- **Lusion 원칙**: "최고의 아이디어는 템플릿에 억지로 밀어넣는 순간 무너진다. 그래서 모든 프로젝트는 자기만의 시스템, 자기만의 로직, 자기만의 풍미를 갖는다."
- **Dash 원칙**: "새 효과를 추가하는 것보다 **타이밍·이징·카피를 조금 조정하는 것**이 임팩트가 더 컸다."

---

## 2. "AI가 만든 / 템플릿" 으로 읽히는 안티패턴과 반격수

각 항목: **증상 → 왜 그렇게 읽히는가 → 반격수(구체적 대안)**

| # | 안티패턴 | 왜 티가 나는가 | 반격수 |
|---|----------|----------------|--------|
| 1 | **균일 카드 그리드** (3×N, 동일 비율, 동일 라운드) | 콘텐츠가 레이아웃을 결정하지 않았음이 드러남 | MERSI식 구성: 항목별 종횡비를 콘텐츠에서 가져오고, 1~2개를 의도적으로 크게/작게. 그리드 1행마다 오프셋 |
| 2 | **가운데 정렬 히어로 + 아래 통계 3개** | 2021년 SaaS 템플릿의 지문 | 히어로를 비대칭으로: 타이포는 좌하단 앵커, 시각 무게는 우측 3D. 통계는 스크롤 중 HUD로 **점진 노출** |
| 3 | **균등 간격 유리 패널 나열** | backdrop-filter를 "디자인"으로 착각한 결과 | 유리는 **1~2개만**, 나머지는 불투명 종이/단색. 유리 패널은 지도 위 실제 기능이 있는 곳에만 |
| 4 | **범용 펄싱 점 / 로딩 스피너** | Bootstrap 시절 잔재 | Cerebrium식 **경로를 따라 흐르는 절차적 마스크** — 데이터가 실제로 흐르는 방향을 표현 |
| 5 | **모든 곳에 동일 이징**(대개 `ease-in-out` 0.3s) | 위계가 없음 = 연출 없음 | 무게별 이징 사전(3장) 적용: 가벼움 `power2.out` 0.2–0.3s / 중간 `power3.out` 0.4–0.6s / 무거움 `expo.out`·`power4.out` 0.9–1.4s |
| 6 | **Inter(또는 Pretendard) 단일 서체 전부** | AI 슬롭의 대표 지문 | 2종 대비(디스플레이 + 모노) + 가변축 활용. 국문은 본문 산세리프, 수치/좌표/코드는 모노 고정폭 |
| 7 | **보라→파랑 그라디언트, 라운드 카드** | 명시적으로 "AI slop"으로 호명되는 조합 | 실제 정사영상/지형 색에서 팔레트를 추출. LX 브랜드색 + 흙/식생/수계 계열 중성색 |
| 8 | **동시에 등장하는 모든 요소** | 카메라 감독이 없다는 신호 | 랜덤 스태거(0.02–0.08 each, `from: "random"`), 요소별 시작 오프셋 최소 3단계 |
| 9 | **레이어 패럴랙스로 만든 가짜 깊이** | Z가 없어서 시차가 어긋남 | Oryzo식 진짜 카메라 Z 이동 또는 MapLibre pitch/zoom 실제 변경 |
| 10 | **스톡 아이콘 세트 + 이모지** | 브랜드 부재 | 도메인 고유 픽토그램(필지·지적선·드론 궤적·해양쓰레기)을 직접 그림. 아이콘은 텍스트와 같은 스트로크 두께 |
| 11 | **"AI 기반" 배지 / 마케팅 상투구** | 카피가 생성물처럼 읽힘 | 실제 숫자로 말함: "남원 4시점, 2019–2024, 12.7cm GSD" 같은 구체 |
| 12 | **호버 = scale(1.05) + shadow** | 어디서나 본 것 | 자기장 왜곡(Dash), 디더 전환(Stas Bondar), 스포트라이트 리빌(Hubtown) 중 **하나만 골라 일관 적용** |
| 13 | **스크롤 = 페이드인 반복** | 시퀀스가 아니라 목록 | 섹션마다 다른 동사: 다이브 / 와이프 / 스크럽 / 홀드 게이트. 최소 4종 |
| 14 | **모달/드로어로 모든 상세 처리** | 흐름이 매번 끊김 | FRONTIER식: 상세를 공간 안에 배치. 또는 PX PUSH식 드로어 + 라우팅 지연 |
| 15 | **완벽하게 대칭인 여백** | 손이 안 닿은 느낌 | 옵티컬 정렬(숫자·괄호·따옴표 hanging), 타이틀 커닝 수동 조정 |
| 16 | **의미 없는 3D 오브젝트 회전** | 장식으로 보임 | 오브젝트가 데이터여야 함 — 지구본은 실제 좌표, 큐브는 실제 타일 |
| 17 | **로딩 없이 갑자기 나타나는 지도** | 앱이 아니라 위젯으로 읽힘 | 지도 첫 타일 페인트를 프리로더 종료 조건에 포함(Shopify 포스터 원칙) |
| 18 | **프로그레스바가 가짜** | 신뢰 손상 | 실제 `window.load` + 타일 로드 이벤트에 동기, 랜덤 스텝 카운터로 인간적 리듬 |
| 19 | **다크모드=색 반전만** | 시스템 없음 | 지도 스타일 자체를 밝은/어두운 2종 준비, 유리 패널 대비비 각각 재계산 |
| 20 | **접근성 무시한 모션** | 공공기관 치명적 | `prefers-reduced-motion`에서 스핀 속도 절반(Trionn 실제 구현: 0.0042 → 0.0015), 스크럽 → 즉시 상태 전환 |

---

## 3. 이징 & 타이밍 쿡북 (전부 실제 수상작에서 채집한 수치)

### 3-1. 히어로 리빌
```
컨테이너 blur/alpha 해제 : duration 0.5   ease power2.out            (Trionn)
문자 단위 리빌           : duration 0.8   stagger { each: 0.08, from: "random" }  ease power2.out  (Trionn)
문자 스태거 (촘촘형)     : stagger 0.02                              (Stas Bondar)
단어 스태거              : stagger 0.03                              (PX PUSH)
라인 스태거              : stagger 0.1                               (Stas Bondar)
그리드 대량 재배치       : duration 2.0   ease expo.inOut  stagger 0.05  (MERSI 확장)
같은 동작의 복귀         : duration 1.2   ease power4.inOut               (MERSI 축소)
이미지 등장              : duration 0.8                                   (HAOQI)
사진 산개 스태거         : duration 1.2   stagger 0.34                    (Trionn 갤러리)
```

### 3-2. 씬/페이지 전환
```
공유요소 Flip 전환   : duration 1.3  ease power3.inOut     (Stas Bondar)
커버 플립(모프)      : duration 1.2  ease expo.inOut       (MERSI)
커튼 와이프          : duration 1.2                        (MERSI)
카메라 세그먼트      : duration 1.0 ~ 3.5  ease "none"(scrub 결합)  (Codrops cinematic)
임팩트 색 스냅백     : 200ms   ← 400ms는 "눈에 띄게 약했다"고 명시   (ZERO)
```

### 3-3. 호버 / 마이크로
```
커서 추종 트윈    : duration 0.2  ease power2.out         (Stas Bondar)
오브젝트 회전     : quickTo duration 0.4                  (Stas Bondar)
카드 호버 스케일  : target 1.12, lerp (스냅 금지)          (Trionn)
카드 밀침         : out 0.34s → back 0.52s (스프링백)      (Trionn)
호버 디더 전환    : duration 1.0                          (Stas Bondar)
스파크 간격       : 0.04 + random()*0.06  (40–100ms), 버스트 5–6발  (Trionn)
스크램블 티커     : 40ms 공유 인터벌                       (HAOQI)
홀드 게이트       : 0.5s 차징 후 프레임당 +0.02 (≈50프레임) / 별도 게이트 1.4s  (Trionn, ZERO)
```

### 3-4. 스크롤 스크럽 / 스무딩
```
Lenis 기본        : lerp 0.1 · duration 1.2 · ease (t)=>Math.min(1, 1.001 - Math.pow(2, -10*t))
Lenis 타이트      : lerp 0.08
Lenis 스냅        : duration 0.9 · ease (t)=>1 - Math.pow(1-t, 4)
GSAP 연동         : gsap.ticker.add(t => lenis.raf(t*1000)); gsap.ticker.lagSmoothing(0)
ScrollSmoother    : smooth 4 · smoothTouch 0.1 · effects false
스크롤 공간       : 500vh(단일 시퀀스) / 900vh(장편 내러티브)
프레임 스크럽 lerp: 0.12       회전 lerp: 0.16       마우스 lerp: 0.06
파티클 관성       : momentum = momentum*0.92 + vel*0.15
커서 왜곡 감쇠    : motionTarget *= 0.86, gain 220
스크롤 속도 정규화: clamp(0,60) / 20.0 → pow(x, 1.2)로 왜곡 강도
```

### 3-5. cubic-bezier 사전 (CSS 직결)
```
cinematicSilk    cubic-bezier(0.45, 0.05, 0.55, 0.95)   미묘한 가감속, 카메라용
cinematicSmooth  cubic-bezier(0.25, 0.10, 0.25, 1.00)   부드러운 상승, 텍스트용
cinematicFlow    cubic-bezier(0.33, 0.00, 0.20, 1.00)   반응적, UI용
cinematicLinear  cubic-bezier(0.40, 0.00, 0.60, 1.00)   제어된 블렌드, 루프용
expo.out 근사    cubic-bezier(0.16, 1.00, 0.30, 1.00)
power4.out 근사  cubic-bezier(0.22, 1.00, 0.36, 1.00)
power3.inOut 근사cubic-bezier(0.65, 0.00, 0.35, 1.00)
```

### 3-6. 일반 규칙
- `power4.out`이 강력한 기본값. 가벼운 요소(툴팁/모달) `power1~2.out`, 중간(카드/섹션) `power2~3.out`, 무거운 것(히어로/페이지) `power3~4.out`.
- `power3.out`의 스위트 스팟은 **0.4초 부근**. 0.1초는 이징이 안 보이고, 2초 이상은 늘어진다.
- 스태거 리빌은 `power2.out` 또는 `expo.out`이 리듬이 산다.

---

## 4. 번들러 없는 환경에서의 구현 노트

### 4-1. CSS만으로 되는 것 (JS 0줄, iGPU에 가장 안전)

| 효과 | 기법 | 비고 |
|------|------|------|
| 스크롤 진행 바 / 스크럽 리빌 | `animation-timeline: scroll()` | Chrome/Edge 115+, Firefox 132+, Safari 18+ (전세계 ~84%) |
| 요소 등장/이탈 스크럽 | `animation-timeline: view()` + `animation-range` | 섹션 진입 리빌에 최적 |
| 폴백 | `@supports (animation-timeline: scroll()) { ... }` | 미지원 시 정적 최종 상태 |
| 그라디언트/각도 애니메이션 | `@property --angle { syntax: "<angle>"; }` | 보간 가능한 커스텀 속성 |
| 마스크 와이프 / 소용돌이 리빌 | `mask-image` + `mask-position/size` 애니메이션 | 텍스처 threshold 리빌의 CSS 버전 |
| 스포트라이트 커서 | `mask-image: radial-gradient()` + CSS 변수(마우스 좌표) | JS는 좌표 대입만 |
| 텍스트 클립 리빌 | `clip-path: inset()` + 라인별 딜레이 | SplitText 없이도 라인 단위 가능 |
| 가변폰트 모션 | `font-variation-settings` transition + scroll-timeline | 무게/폭 스크럽 |
| 필름 그레인 | 고정 `<div>` + SVG `feTurbulence` data URI + `mix-blend-mode: overlay` + `opacity .04~.08` | **GPU 거의 무료. MapLibre 위에 얹기 최적** |
| 비네트 | 고정 `<div>` + `radial-gradient` + `pointer-events:none` | 동일 |
| 스캔라인/CRT | `repeating-linear-gradient` 8s 루프 | PX PUSH 방식 |
| 페이지 전환 | View Transitions API + `::view-transition-old/new` | cross-document 지원, 저사양에 유리 |
| 접근성 | `@media (prefers-reduced-motion: reduce)` | 필수 |

참고: https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Scroll-driven_animations

### 4-2. CDN 라이브러리가 필요한 것

```html
<!-- importmap 하나로 번들러 없이 three.js ESM 사용 -->
<script type="importmap">
{ "imports": {
    "three": "https://unpkg.com/three@0.16x.x/build/three.module.js",
    "three/addons/": "https://unpkg.com/three@0.16x.x/examples/jsm/"
} }
</script>
<script type="module"> import * as THREE from "three"; </script>
```

- **GSAP 3** (core + ScrollTrigger + SplitText + Flip). 2025년에 SplitText·MorphSVG가 **무료 공개**됨 → 라이선스 부담 없음. 타임라인/스태거/scrub/Flip은 CSS로 대체 불가.
- **Lenis** — 스크롤 무게감. `gsap.ticker`에 물리고 `lagSmoothing(0)`.
- **three.js** — 오버레이 캔버스(파티클, 지구본 대기, 지형 프록시, 포스트 이펙트).
- **Howler.js** (선택) — 사운드 토글. 또는 Web Audio 직접 합성(파일 0바이트).
- **Splitting.js** — GSAP SplitText 대신 쓸 수 있는 초경량 대안.

### 4-3. MapLibre 위에 WebGL 포스트 이펙트를 얹는 3가지 방법

**옵션 A — MapLibre GL 컨텍스트 공유 (CustomLayerInterface)**
```js
map.addLayer({
  id: "fx", type: "custom", renderingMode: "3d",
  onAdd(map, gl) { /* three.js WebGLRenderer({ canvas: map.getCanvas(), context: gl }) */ },
  render(gl, args) { /* args의 카메라 행렬 사용, renderer.resetState() 필수 */ }
});
```
- 장점: 깊이 버퍼 공유(3D 오브젝트가 건물/지형에 가려짐), 캔버스 1개 → 메모리·컴포짓 비용 최소.
- 단점: **MapLibre가 그린 결과 자체를 포스트프로세싱할 수 없다**(별도 FBO로 뽑으려면 `preserveDrawingBuffer: true`가 필요하고 이건 iGPU에서 비쌈).
- 참고: https://maplibre.org/maplibre-gl-js/docs/API/interfaces/CustomLayerInterface/ , https://maplibre.org/maplibre-gl-js/docs/examples/add-a-3d-model-using-threejs/

**옵션 B — 별도 투명 오버레이 캔버스 (권장 기본값)**
- `position: fixed; pointer-events: none;` 캔버스를 지도 위에 겹치고, `map.on("move"/"render")`에서 `map.transform`(center, zoom, pitch, bearing)을 읽어 three.js 카메라를 동기.
- 여기에만 bloom/godray/파티클/DOF를 건다. 지도 픽셀은 건드리지 않는다.
- 오버레이는 **0.5~0.75 해상도**로 렌더 후 CSS로 업스케일 — 글로우/포그 계열은 열화가 거의 안 보인다.
- 지도가 정지 상태면 오버레이 rAF를 **멈춘다**(HAOQI/Trionn의 "뷰포트 밖이면 티커 정지" 원칙).

**옵션 C — 순수 CSS/SVG 오버레이 (그레인·비네트·스캔라인·색보정)**
- 가장 저렴하고 실패가 없다. **분위기의 70%는 여기서 나온다.**
- `mix-blend-mode: overlay/soft-light` + 아주 낮은 opacity. 애니메이션은 `transform: translate3d`만(리페인트 없음).

### 4-4. Intel iGPU 60fps 예산표

```
devicePixelRatio        : min(window.devicePixelRatio, 1.5)  — 4K에서는 1.25
드로잉 버퍼 상한        : 2.0~2.5 메가픽셀 (DPR이 아니라 MP로 캡)   ← LXSTNGHT 원칙
antialias               : false + FXAA 1패스 (MSAA 금지)
포스트 패스 수          : 최대 2 (예: bloom 1 + composite 1). 각 패스 = 풀스크린 리드백
backdrop-filter 패널    : 동시 3개 이하, blur ≤ 12px, 크기/블러 애니메이션 금지
                          (블러 반경 애니메이션은 매 프레임 전체 재블러 → iGPU 킬러)
그림자                  : 끄고 Matcap/베이크로 대체
라이트                  : 사용 안 하면 remove (intensity 0도 슬롯 차지)
텍스처                  : KTX2/Basis 우선, GPU에 압축 상태로 상주. 없으면 WebP
지오메트리              : Draco (디코더 자체 호스팅)
업로드 타이밍           : requestIdleCallback으로 텍스처 업로드 분산
셰이더 컴파일           : 섹션 보이기 전에 워밍(1x1 픽셀 더미 렌더)
MapLibre                : fadeDuration: 0, preserveDrawingBuffer: false,
                          powerPreference: "high-performance", 필요할 때만 triggerRepaint
측정                    : median이 아니라 p95 프레임타임. 프레임 스파이크 목표 < 50ms
적응형 품질 3티어       : T0 = WebGL 없음(CSS 그레인/비네트만 + 정적 지도)
                          T1 = 오버레이 캔버스, 포스트 없음, 파티클 1/4
                          T2 = 풀 (bloom + 파티클 + 시네마틱)
                          최근 60프레임 평균이 예산 초과하면 자동 강등 (San Rita/ZERO/Shopify 공통)
```

참고: https://maplibre.org/maplibre-gl-js/docs/guides/large-data/ , https://deepwiki.com/maplibre/maplibre-gl-js/5.2-performance-optimization-techniques

### 4-5. 아키텍처 권고 (우리 코드 기준)

1. **단일 `Clock` 모듈**: 앱 전체에 rAF 루프는 **하나**. Lenis도 여기에 물린다(HAOQI 방식 — 1프레임 지연 제거).
2. **`ScrollBus` / `PointerBus`**: 정규화 값 하나만 발행. 지도·오버레이·DOM이 각자 구독.
3. **`Director` 모듈**: 씬(모먼트) 정의를 데이터로 — `{ id, camera: {center, zoom, pitch, bearing}, hud: {...}, enter/scrub/exit }`. ZERO의 세그먼트 라이프사이클을 그대로 차용하면 임의 지점으로 점프/디버깅이 가능해진다.
4. **지도가 곧 캔버스**: 페이지 라우팅에서 지도를 언마운트하지 않는다. 라우트 변경 = 카메라 이동 + HUD 밀도 변경(San Rita).
5. **`gsap.quickTo()`**를 커서/패럴랙스/회전 등 매 프레임 갱신에 쓴다. 프레임마다 트윈 수백 개 생성 금지(Stas Bondar 최대 최적화 포인트).

---

## 5. Land-XI 12 모먼트 스토리보드

표기: t는 해당 모먼트 시작 기준 초. 난이도 하/중/상.

---

### M01 · 홈 랜딩 — "국토가 깨어난다" (프리로더 → 히어로)
**장치**: Igloo 실시간 인트로 연속성 + Bisous 시네마틱 로더 + Shopify 포스터 원칙
```
t=0.00  검정에 가까운 딥 네이비. 화면 좌하단에 모노 폰트로 좌표 텍스트가
        랜덤 스텝으로 갱신 (35.4166 → 127.3893, 실제 남원 좌표로 수렴).
        우하단 오버사이즈 카운터 00 → 100, 랜덤 스텝, window.load + 첫 타일 페인트에 동기.
t=0.60  배경에 정사영상 타일이 하나씩(무작위 순서, 각 40ms 간격) 아주 낮은 밝기로 페인트.
        "로딩 중"이 아니라 "위성이 스캔 중"으로 읽히게.
t=1.80  카운터 100 도달 → 카운터 숫자가 그 자리에서 히어로 지표("전국 필지 39,4xx,xxx")로
        모프 (같은 요소, FLIP). 검정 오버레이가 아래로 clip-path 커튼 1.2s expo.inOut.
t=2.10  MapLibre globe가 이미 회전 중인 상태로 드러남 (로딩 중 뒤에서 계속 돌고 있었음).
        절대 정지 상태에서 시작하지 않는다.
t=2.40  CSS 그레인(opacity .05) + 비네트 페이드인 0.8s.
```
난이도: **중** (카운터→지표 FLIP과 타일 페인트 동기가 핵심)

---

### M02 · 홈 히어로 — 카피 리빌
**장치**: Trionn 랜덤 스태거 + 블러 해제, Bisous 2종 타입 대비
```
t=0.00  (M01 t=2.10에서 이어짐) 히어로 카피 컨테이너 autoAlpha 0→1, blur(14px)→0, 0.5s.
t=0.15  국문 대제목 문자 단위: duration 0.8, stagger {each: 0.06, from: "random"},
        y: 18 → 0, blur(8px) → 0, ease power2.out.
t=0.55  모노 서브 라인(좌표/촬영일/GSD)이 타이핑이 아니라 40ms 스크램블 후 정착.
t=0.90  CTA 버튼 등장. 이후 항상 마그네틱 (아래 M05).
비고    대제목은 가변폰트. 스크롤 0→1 구간에서 wght 700→400으로 연속 감소
        (animation-timeline: scroll(), JS 0줄).
```
난이도: **하** (GSAP SplitText만 있으면 됨)

---

### M03 · 홈 스크롤 — 지구 → 한반도 → 남원 카메라 다이브
**장치**: San Rita 카메라=내비게이션 + Codrops 시네마틱 scrub + Oryzo 진짜 Z 이동
```
스크롤 공간 600vh, pin, scrub. 진행도 p(0–1) 하나가 전부를 구동.

p=0.00  globe. zoom 1.6, pitch 0, bearing 25. 대기 글로우(오버레이 캔버스 Fresnel).
p=0.00~0.28  bearing 25→ -10, zoom 1.6→3.4. 카피 A 고정.
p=0.28  카피 A 이탈: 위로 -40px + blur 12px, 0.4s. (등장의 역재생 아님 — 다른 곡선)
p=0.30~0.55  한반도로 zoom 3.4→7.2, pitch 0→28. 시도 경계 라인이
             Cerebrium식 UV 펄스 마스크로 순차 점등 (경로별 랜덤 오프셋).
p=0.55~0.80  전북 → 남원. zoom 7.2→13.5, pitch 28→52.
             이 구간에서 정사영상 타일이 threshold 리빌(Sleepers R채널)로 벡터 위에 덮임.
p=0.80~1.00  카메라가 실제 촬영 대상(예: 특정 필지) 위로 정착. pitch 52→46, 미세 오버슛 후 정지.
             HUD 4개 지표가 stagger 0.12로 우측에서 슬라이드 인.
전 구간  ease "none" (스크럽), 카메라 웨이포인트 간 duration = 구간 길이.
         스크롤 방향 전환 시 역재생이 자연스럽도록 상태 기반으로만 구현.
```
난이도: **상** (MapLibre easeTo가 아니라 `map.jumpTo`를 scrub 값으로 매 프레임 구동해야 함. 카메라 키프레임 배열 + 보간 함수 필요)

---

### M04 · 홈 — 남원 4시점 정사영상 타임슬라이스
**장치**: Sleepers threshold 리빌 + Stas Bondar 디더 + Igloo 색수차
```
t=0.00  가로 타임라인 4개 노드(2019/2021/2023/2024). 드래그 또는 스크롤 스크럽.
t=0.00~ 노드 사이를 이동하면 두 시점 타일 레이어가 raster-opacity로 교차하되,
        **직선 페이드 금지**. 오버레이 캔버스에서 노이즈 텍스처 R채널을 임계값으로
        써서 얼룩덜룩하게 갈아엎듯 전환 (진행도 0→1, 1.0s power2.inOut).
t=+0.05 전환 중에만 색수차 오프셋 0 → 0.004 → 0 (총 0.35s). 씬이 "필름처럼" 갈린다.
호버    커서 주변 반경 180px만 다음 시점이 보이는 렌즈 (Hubtown 마우스 리빌).
        radial-gradient mask, 커서 lerp 0.12.
```
난이도: **중** (MapLibre raster 레이어 2장 + CSS mask 렌즈면 옵션 C로도 가능. 셰이더 버전은 상)

---

### M05 · 홈 — 지표 HUD & 마그네틱 CTA
**장치**: Dash 자기장 + Cerebrium 펄스 + Podium 픽셀 호버
```
t=0.00  지표 4개. 숫자는 tabular-nums 모노. 등장 시 카운트업 1.2s expo.out,
        각 지표 stagger 0.12. (동시 등장 금지)
호버    지표 카드: scale 1.0→1.02만, 대신 카드 배경에 1px 격자가
        커서 위치 기준으로 국소 발광 후 0.6s 페이드 (Cerebrium "잠깐 기억").
CTA     자기장: 커서가 버튼 반경 1.6배 안에 들어오면 버튼이 커서 쪽으로
        최대 12px 끌려감. offset = dist_norm^2 (거리 제곱 — 실제 자석처럼 가까울수록 급증),
        quickTo duration 0.4 power3.out. 이탈 시 0.6s elastic 아님 — power4.out으로 정직하게 복귀.
        커서 자체는 반경 8px 링 → 버튼 위에서 반경 36px 채워진 원 + 라벨, 0.25s power2.out.
```
난이도: **하**

---

### M06 · 로그인 진입 — 커튼 전환
**장치**: MERSI 커튼 와이프 + San Rita 배경 지속
```
t=0.00  홈에서 "로그인" 클릭. 페이지가 바뀌지 않는다.
        우측에서 종이 질감 패널이 clip-path inset(0 100% 0 0 → 0 0 0 0), 1.2s expo.inOut.
t=0.10  동시에 배경 지도는 **계속 살아 있고** 아주 느리게 서행 (bearing +0.6°/s),
        blur는 CSS backdrop-filter 대신 지도 스타일 자체를 저채도 프리셋으로 0.8s 크로스페이드.
        (backdrop-filter 애니메이션 금지 원칙)
t=1.00  폼 요소가 아래→위 12px, stagger 0.07, power3.out.
t=1.40  URL은 /login으로 갱신 (라우팅은 애니메이션 종료 후 반환 — PX PUSH 원칙).
```
난이도: **중**

---

### M07 · 로그인 — 입력 상태와 실패 피드백
**장치**: Cerebrium Fresnel rim + ZERO 200ms 스냅
```
포커스   인풋 테두리가 아니라, 인풋 뒤 1px 라인이 좌→우로 채워짐 0.45s power3.out.
         동시에 라벨이 위로 -14px + 0.82배 축소, 0.3s power2.out.
타이핑   캐럿 옆에 아주 작은 모노 카운터(예: 8/32)가 페이드로만 갱신.
성공     라인 색이 LX 브랜드 그린으로 0.3s. 버튼이 스피너로 바뀌지 않고,
         버튼 라벨이 문자 스크램블(40ms 티커)로 "인증 중"으로 변형.
실패     **200ms**에 배경이 딥 레드로 스냅했다가 되돌아옴 (400ms는 임팩트가 죽는다 — ZERO 실측).
         흔들림(shake)은 x: ±5px, 3회, 총 0.28s. 그 이상은 유치해진다.
```
난이도: **하**

---

### M08 · 대시보드 진입 — 스토리 → 툴 핸드오프 (가장 중요한 모먼트)
**장치**: San Rita 글로벌 캔버스 + Shopify 씬 프리셋 + FRONTIER 모달 제거
```
t=0.00  로그인 성공. 화면이 전환되지 않는다. 커튼이 좌측으로 회수 0.9s expo.inOut.
t=0.20  같은 지도, 같은 카메라. 다만 목표점이 바뀐다:
        pitch 46→18, zoom 13.5→9.2, 1.6s cinematicSilk(0.45,0.05,0.55,0.95).
        "다른 페이지"가 아니라 "카메라가 물러선 것".
t=0.35  시네마 HUD(큰 타이포, 카피)가 밀도 높은 툴 HUD로 교체:
        좌측 레일 아이콘 8개가 stagger 0.04로 위→아래, 각 y:-8 → 0, 0.35s power3.out.
t=0.90  우측 패널(유리 1장 — 전체에서 유리는 여기 하나뿐)이 오른쪽에서 슬라이드,
        1.0s power4.out. backdrop-filter blur는 고정값 10px, 애니메이션 안 함.
t=1.60  카메라 정착. 그레인 opacity .05 → .03 (툴 모드는 조금 더 선명하게).
역방향  "개요로" 클릭 시 완전 역경로 — 단, 이징을 expo.inOut으로 바꿔 다른 느낌을 준다.
```
난이도: **상** (라우팅 구조가 지도 인스턴스를 절대 파괴하지 않도록 앱 셸 재설계 필요)

---

### M09 · 대시보드 — 작업대 레이아웃 & 카드 → 전체화면
**장치**: MERSI 에디토리얼 구성 + GSAP Flip
```
레이아웃 균일 3×N 카드 금지. 4컬럼 그리드 위에서 항목별 콘텐츠 비율대로
         span이 1/2/4로 달라지고, 각 행이 8px씩 오프셋 (완벽 정렬 회피).
t=0.00   카드 클릭.
t=0.00~1.30  Flip: 카드가 그 자리에서 전체 뷰포트로 확장, 1.3s power3.inOut.
         내부 썸네일은 동일 요소가 그대로 히어로가 됨(Podium 원칙 — 새 이미지 로드 금지).
t=0.15   주변 카드들이 클릭 지점 반대 방향으로 밀려남:
         x: dir * random(18,34)px, rotation: dir * random(1.4,2.8)deg, 0.34s
         → 이어서 0.52s로 원위치 (Trionn 스프링백 실측).
t=1.30   상세 콘텐츠가 stagger 0.05로 등장.
닫기     역 Flip 1.1s (같은 시간 아님 — 닫힘은 늘 조금 빠르게).
```
난이도: **중**

---

### M10 · 대시보드 — 라이브 데이터 파이프라인
**장치**: Cerebrium UV 펄스 마스크 + Podium 픽셀 호버
```
표현     "AI 분석 파이프라인"을 스피너/프로그레스바가 아니라, 노드 사이를 잇는
         곡선 경로 위로 **절차적 불투명 마스크가 흐르는** 형태로.
         메시는 움직이지 않는다. uv.x 기준 smoothstep 윈도우가 이동할 뿐.
파라미터 경로마다 phase offset random(0, 2π), speed random(0.7, 1.3),
         pulse interval random(1.4s, 3.2s). → 절대 동기화되지 않는다.
호버     노드에 커서가 오면 해당 노드로 들어오는 경로만 밝기 1.0 → 나머지 0.35,
         0.4s power2.out. 노드 옆에 모노 수치가 스크램블로 갱신.
완료     펄스가 종착 노드에 닿는 순간 노드가 1프레임 백색 플래시 후 0.5s expo.out 감쇠.
         (사운드 토글이 켜져 있으면 Trionn식 3오실레이터 플럭 — 파일 0바이트)
```
난이도: **중** (2D 캔버스나 SVG + `stroke-dashoffset`으로도 구현 가능 → 그러면 난이도 하)

---

### M11 · 분석 지도 — 레이어 토글 = 물질 전환
**장치**: Codrops 디스플레이스먼트/threshold 전환 + Igloo 3중 전환
```
t=0.00  레이어 칩(지적/정사/DSM/식생) 클릭. 체크박스 페이드 금지.
t=0.00~0.9  새 레이어가 클릭한 칩의 화면 좌표를 원점으로,
        노이즈 threshold 원형 파문이 퍼지며 덮임. progress 0→1, power2.inOut.
t=0.05  파문의 프론트 엣지(폭 약 6% 진행도 구간)에만 색수차 + 미세 밝기 부스트.
        Cerebrium "ember rim"과 같은 원리 — 경계가 살아있어야 물질처럼 보인다.
t=0.90  칩 자체는 배경이 채워지는 게 아니라 1px 언더라인이 좌→우로 그어짐 0.3s.
끄기    같은 파문의 역방향, 단 0.6s (켜기보다 빠르게).
성능    이 효과는 오버레이 캔버스에서 알파 마스크만 그린다.
        MapLibre raster-opacity는 그 마스크 진행도에 맞춰 단순 보간.
```
난이도: **중~상**

---

### M12 · 분석 지도 — 시계열 스크럽 + 렌즈 + 리포트 전환
**장치**: Trionn 단일 스크럽 드라이버 + Hubtown 렌즈 커서 + View Transitions
```
하단 타임라인 드래그 = 정규화 t(0–1) 하나.
t 구동 대상 동시 3개:
  (a) 정사영상 시점 크로스페이드 (M04와 동일 threshold)
  (b) 좌측 지표 4개 카운터 (트윈 없이 t에서 직접 계산 — 스크럽이므로)
  (c) 지도 카메라의 미세 드리프트 (bearing ±3°) — 정지 화면을 만들지 않는다
드래그 중 커서가 렌즈로 변형: 반경 0 → 160px, 0.3s power3.out.
         렌즈 안쪽만 "비교 시점"이 보인다. 렌즈 추종 lerp 0.12 (스냅 금지).
관성     놓으면 드래그 속도로 t가 계속 흐르다 감쇠:
         v = v * 0.92, t += v * 0.15. (Codrops 실측 관성 계수)
리포트   "리포트 생성" → View Transitions API cross-document.
         지도 캔버스에 view-transition-name을 주면 리포트 페이지 헤더 이미지로
         자연스럽게 모프. 미지원 브라우저는 일반 페이지 전환으로 degrade.
```
난이도: **상**

---

### 12 모먼트 난이도/우선순위 요약

| 모먼트 | 난이도 | 임팩트 | 권장 순서 |
|--------|--------|--------|-----------|
| M02 히어로 카피 리빌 | 하 | 중 | 1 |
| M05 마그네틱 CTA / HUD | 하 | 중 | 2 |
| M07 로그인 상태 피드백 | 하 | 중 | 3 |
| M01 프리로더 연속성 | 중 | **상** | 4 |
| M04 4시점 타임슬라이스 | 중 | **상** | 5 |
| M09 카드 Flip | 중 | 중 | 6 |
| M06 커튼 전환 | 중 | 중 | 7 |
| M10 파이프라인 펄스 | 중 | 중 | 8 |
| M11 레이어 파문 전환 | 중상 | **상** | 9 |
| M03 지구→남원 다이브 | 상 | **최상** | 10 |
| M08 스토리→툴 핸드오프 | 상 | **최상** | 11 |
| M12 시계열 스크럽+렌즈 | 상 | 상 | 12 |

**전략 권고**: M03과 M08이 "Web3GL feel"의 90%를 결정한다. 나머지는 그 두 개가 성립한 뒤에 얹는 디테일이다. 반대로 M03/M08 없이 M02·M05만 잘 만들면 여전히 "예쁜 템플릿"으로 읽힌다.

---

## 6. 출처 (전체)

**Awwwards**
- Sites of the Year 아카이브 — https://www.awwwards.com/websites/sites_of_the_year/
- Sites of the Month 아카이브 — https://www.awwwards.com/websites/sites_of_the_month/
- Igloo Inc 케이스스터디 — https://www.awwwards.com/igloo-inc-case-study.html
- Igloo Inc SOTD — https://www.awwwards.com/sites/igloo-inc
- Lusion 케이스스터디 — https://www.awwwards.com/case-study-for-lusion-by-lusion-winner-of-site-of-the-month-may.html
- San Rita Project 케이스스터디 — https://www.awwwards.com/mapping-the-uncharted-the-san-rita-project.html
- Bruno's Portfolio 케이스스터디 — https://www.awwwards.com/brunos-portfolio-case-study.html
- Messenger SOTD — https://www.awwwards.com/sites/messenger
- Lando Norris SOTD — https://www.awwwards.com/sites/lando-norris
- Oryzo AI SOTD — https://www.awwwards.com/sites/oryzo-ai
- 지도/지오로케이션 컬렉션 — https://www.awwwards.com/awwwards/collections/maps-geolocation-streetview/

**Codrops (케이스스터디 · 튜토리얼)**
- 케이스스터디 태그 — https://tympanus.net/codrops/tag/case-study/
- Trionn 아키텍처 — https://tympanus.net/codrops/2026/07/15/the-architecture-behind-trionn-coordinating-gsap-three-js-lenis-and-web-audio/
- The Sleepers (경량 WebGL) — https://tympanus.net/codrops/2026/07/10/the-sleepers-creating-an-atmospheric-webgl-experience-with-lightweight-techniques/
- HAOQI.DESIGN (DOM+WebGL) — https://tympanus.net/codrops/2026/08/15/inside-haoqi-design-letting-dom-and-webgl-share-a-retro-futurist-stage/
- ZERO (내러티브 엔지니어링) — https://tympanus.net/codrops/2026/07/17/zero-the-engineering-behind-a-defiant-interactive-narrative/
- PX PUSH — https://tympanus.net/codrops/2026/08/07/the-department-is-open-building-the-px-push-website/
- Podium — https://tympanus.net/codrops/2026/06/23/podium-building-a-website-where-running-becomes-storytelling/
- Cerebrium — https://tympanus.net/codrops/2026/07/23/building-cerebrium-making-serverless-infrastructure-tangible/
- MERSI — https://tympanus.net/codrops/2026/07/27/between-print-and-digital-the-making-of-mersis-website/
- Bisous — https://tympanus.net/codrops/2026/06/29/inside-bisous-designing-an-editorial-experience-for-cinematic-cgi/
- Shopify Editions Spring '26 — https://tympanus.net/codrops/2026/06/26/engineering-the-web-experience-behind-shopifys-spring-26-edition-everywhere/
- Dash Creative (Magnetic Commerce) — https://tympanus.net/codrops/2026/07/21/magnetic-commerce-building-the-dash-creative-website/
- Sixty Frames for the Record (LXSTNGHT/FRONTIER) — https://tympanus.net/codrops/2026/08/22/sixty-frames-for-the-record-a-three-js-game-seven-fly-throughs-and-a-wall-of-crts/
- Sketching the Impossible — https://tympanus.net/codrops/2026/06/11/sketching-the-impossible-a-3d-portfolio-built-without-a-single-3d-model/
- Chems.Studio 아카이브 — https://tympanus.net/codrops/2026/08/08/designing-a-flexible-digital-archive-for-chems-studios-creative-practice/
- Lusion 인터뷰 — https://tympanus.net/codrops/2026/04/13/lusion-where-digital-craft-meets-ambitious-experimentation/
- 14islands 인터뷰 — https://tympanus.net/codrops/2025/11/24/building-a-different-kind-of-agency-inside-14islands-people-first-creative-vision/
- Stas Bondar '25 — https://tympanus.net/codrops/2025/03/25/stas-bondar-25-the-code-techniques-behind-a-next-level-portfolio/
- 시네마틱 3D 스크롤 (GSAP) — https://tympanus.net/codrops/2025/11/19/how-to-build-cinematic-3d-scroll-experiences-with-gsap/
- 스크롤 리빌 WebGL 갤러리 — https://tympanus.net/codrops/2026/02/02/building-a-scroll-revealed-webgl-gallery-with-gsap-three-js-astro-and-barba-js/
- 3D 스크롤 텍스트 (CSS+GSAP) — https://tympanus.net/codrops/2025/11/04/creating-3d-scroll-driven-text-animations-with-css-and-gsap/
- WebGL 이미지 전환 셰이더 기법 — https://tympanus.net/codrops/2025/01/22/webgl-shader-techniques-for-dynamic-image-transitions/
- 실시간 디더링 셰이더 — https://tympanus.net/codrops/2025/06/04/building-a-real-time-dithering-shader/
- 그리드 변위 + RGB 시프트 (GPGPU) — https://tympanus.net/codrops/2024/08/27/grid-displacement-texture-with-rgb-shift-using-three-js-gpgpu-and-shaders/
- WebGL 디스토션 호버 — https://tympanus.net/codrops/2018/04/10/webgl-distortion-hover-effects/
- 2025 결산 — https://tympanus.net/codrops/2025/12/29/2025-a-very-special-year-in-review/

**기술 레퍼런스**
- MapLibre CustomLayerInterface — https://maplibre.org/maplibre-gl-js/docs/API/interfaces/CustomLayerInterface/
- MapLibre + three.js 3D 모델 예제 — https://maplibre.org/maplibre-gl-js/docs/examples/add-a-3d-model-using-threejs/
- MapLibre 3D 타일 + three.js — https://maplibre.org/maplibre-gl-js/docs/examples/add-3d-tiles-using-threejs/
- MapLibre 대용량 데이터 최적화 — https://maplibre.org/maplibre-gl-js/docs/guides/large-data/
- MapLibre 성능 최적화 기법 — https://deepwiki.com/maplibre/maplibre-gl-js/5.2-performance-optimization-techniques
- MapLibre FPS 측정 — https://maplibre.org/maplibre-gl-js/docs/examples/display-performance-metrics/
- CSS scroll-driven animations (MDN) — https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Scroll-driven_animations
- View Transitions cross-document — https://developer.chrome.com/docs/web-platform/view-transitions/cross-document
- View Transition API (MDN) — https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API
- Web Audio 베스트 프랙티스 — https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices
- Lenis — https://github.com/darkroomengineering/lenis
- Howler.js — https://github.com/goldfire/howler.js/
- pmndrs/postprocessing — https://github.com/pmndrs/postprocessing
- GSAP 치트시트 — https://gsap.com/cheatsheet/

**트렌드 · 안티패턴**
- AI Slop Web Design 가이드 — https://www.925studios.co/blog/ai-slop-web-design-guide
- Anti-AI 디자인 트렌드 2026 — https://crea8ivesolution.net/anti-ai-design-trends-2026/
- 2026 수상작 심사 노트 — https://www.hontran.dev/blog/best-award-winning-websites-2026
- Best Three.js Websites 2026 — https://www.utsubo.com/blog/best-threejs-websites-2026
- 수상 심사 기준 해설 — https://www.utsubo.com/blog/award-winning-website-design-guide
- Oryzo BTS (Lusion 블로그) — https://blog.lusion.co/oryzo-bts-part-1-7-concept-and-creative-direction
- Immersive Garden 수상 이력 — https://immersive-g.com/the-studio/awards
- Awwwards 최다 수상 프로필 — https://www.awwwards.com/winner-list/
