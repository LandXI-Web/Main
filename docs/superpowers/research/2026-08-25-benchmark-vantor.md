# Vantor(vantor.com) 심층 벤치마크 — 위성·지리공간 AI 기업의 최상급 웹 브랜딩 해부

작성 2026-08-25 · 조사자: 디자인 리서치 에이전트
대상: https://vantor.com (구 Maxar Intelligence, 2025-10 리브랜드)
목적: Land-XI 플랫폼 전면 재개편의 **시각 언어 기준선**을 실측으로 확보한다.

---

## 0. 조사 방법과 산출물

추측을 쓰지 않기 위해 실제 브라우저로 붙어서 뜯었다.

- Playwright + 실 Chrome(headed), 1440×900 / 1920×1080 두 뷰포트, deviceScaleFactor 2로 캡처
- 홈 + 4개 하위 페이지(Tensorglobe Platform, WorldView 3D, Vivid Terrain, Defense) 스크롤 전 구간 캡처
- `getComputedStyle`로 타이포·색·트랜지션 전수 추출, `document.styleSheets` 원문에서 `@font-face`/`@keyframes`/`clip-path` 규칙 직접 파싱
- 네트워크 로그 362건 수집 → 폰트/영상/이미지 원본 URL·바이트·코덱 확인
- 히어로 및 제품 타일 영상 5편(총 31.5MB) 전량 내려받아 ffmpeg로 프레임 85장 추출
- 모션은 65~90ms 간격 연사(burst) + 애니메이션 도중 DOM 상태 샘플링으로 프레임 단위 재구성
- 웹 검색으로 리브랜드 주체(Lippincott / Grafik) 확인

산출물 위치 — 전부 `shots/`(gitignore 대상)에 남겨 두었다. 총 468MB.

| 경로 | 내용 |
|---|---|
| `shots/bench/vantor/shot1440/` | 홈·하위 4페이지 스크롤 전 구간 + 풀페이지(38장) |
| `shots/bench/vantor/shot1920/` | 1920 대조군 |
| `shots/bench/vantor/motion/` | 카운트업·컬러웨이 반전·카드 호버·섹션 리빌 연사 + 콘택트시트 4장 |
| `shots/bench/vantor/detail/` | 내비 드롭다운 개폐, 스티키 스플릿 8단계, 히어로 패럴랙스 |
| `shots/bench/vantor/frames/` | 영상 5편 × 17프레임 |
| `shots/bench/vantor/assets/` | 영상 원본 5편, 원본 위성/인물 이미지 4장, **TWKEverett-Medium.woff2** |
| `shots/bench/vantor/dom/` | computed style·CSS 변수·스타일시트 규칙·전체 카피 JSON |
| `shots/bench/vantor/net/` | 네트워크 로그 |

---

## 1. 요약 — 한 문단

Vantor는 **서체 1종(웨이트 1개) + 색 2개(순흑·순백) + 이징 1개**로 전 사이트를 끌고 간다. 장식이 없다. 카드가 없다. 그림자가 없다. 라운드 코너가 없다. 차트가 없다. 홈 전체 카피가 **4,773자(약 700단어)**뿐이다. 대신 화면의 절반 이상을 **풀블리드 위성영상·3D 메쉬**에 내주고, 그 위에 헤어라인 벡터 도형과 지명·날짜 캡션만 올린다. 숫자는 본문 크기의 **7.75배(124px)**로 키워서 문장 대신 쓴다. 우리가 지금까지 만든 화면과 정확히 반대다. 우리는 요소를 더해서 밀도를 만들었고, Vantor는 요소를 빼서 밀도를 만들었다.

---

## 2. 브랜드 시스템 실측

### 2.1 서체 — TWK Everett Medium 단 하나

`@font-face` 규칙은 전 사이트에 **딱 2개**뿐이다.

```css
@font-face { font-family: Everett; font-style: normal; font-weight: 500;
  src: url("/_nuxt/TWKEverett-Medium.87ClDCwb.woff2") format("woff2"), ... ;
  font-display: swap; }
@font-face { font-family: Everett; font-style: italic; font-weight: 500; ... }
```

- 디스플레이/UI 전부 = **TWK Everett Medium(500)**, 자체 호스팅, woff2 58,356바이트
- 본문 = **Inter Regular(400)**, Google Fonts v20 woff2 35,148바이트
- 그게 전부다. Regular도 Bold도 Black도 없다. 굵기 대비를 아예 포기하고, **크기 대비와 색 대비만으로** 위계를 만든다.

Everett은 Nolan Paparelli 디자인, Weltkern(TWK) 배급. 리브랜드 아이덴티티 기초는 **Lippincott**, 런치 캠페인·데이터 비주얼라이제이션 툴킷은 **Grafik**이 맡았고 캠페인 라인이 "Total clarity from space to ground"다.

### 2.2 타이포 스케일 — 1440과 1920이 완전히 동일

가장 중요한 발견 하나. **헤딩에 fluid type을 쓰지 않는다.** 1440에서 잰 값과 1920에서 잰 값이 소수점까지 같다. 유동적인 것은 여백과 거터뿐이다.

| 역할 | 서체 | size | line-height | letter-spacing | 색 |
|---|---|---|---|---|---|
| 히어로 H1 | Everett 500 | 64px | 80px (1.25) | −0.16px | #fff |
| 섹션 H2 | Everett 500 | 52px | 57.2px (1.10) | −0.52px (−0.01em) | #fff |
| 서브섹션 H4 | Everett 500 | 28px | 36.4px (1.30) | **+0.28px** (+0.01em) | #fff |
| 진술문 H5 | Everett 500 | 24px | 31.2px (1.30) | −0.16px | #fff |
| 제품명 H5 | Everett 500 | 16px | 20px (1.25) | −0.16px | #fff |
| 섹션 라벨 H6 `.text-label` | Everett 500 | 12px | 13.2px (1.10) | +0.12px, `capitalize` | #ccc |
| 내비 | Everett 500 | 14px | 14px (1.00) | +0.24px | #fff / rgba(1,1,2,.7) |
| CTA | Everett 500 | 16px | 20px (1.25) | −0.16px | 컬러웨이 텍스트색 |
| 리드 문단 | Inter 400 | 20px | 29px (1.45) | −0.2px | #fff |
| 본문 | Inter 400 | 16px | 23.2px (1.45) | −0.16px | #fff |
| 캡션 `.small` | Inter 400 | 12px | 16.8px (1.40) | −0.12px | #ccc / #686868 |
| **통계 숫자** `.char` | Everett 500 | **124px** | 142.6px (1.15) | −1.24px | 컬러웨이 |

규칙이 두 개로 정리된다.

1. **letter-spacing은 예외 없이 ±0.01em.** 흐르는 텍스트와 큰 헤딩은 −0.01em, 라벨·내비·H4는 +0.01em. 히어로 H1만 −0.16px로 눌러 놨다(−0.0025em) — 64px에서 −0.64px면 너무 붙어서 손으로 잡은 값으로 보인다.
2. **line-height는 세 계단.** 디스플레이 1.10–1.25 / 본문 1.45 / 라벨 1.10. 중간값이 없다.

본문 대비 최대 숫자 비율 = 124 ÷ 16 = **7.75배**. 우리 B안의 최대 비율은 86 ÷ 13 ≈ 6.6배이나 그 86px가 한글 헤드라인이고, 숫자(38,057)는 40px 남짓이다. Vantor는 **숫자 자체를 디스플레이 타입으로 승격**했다.

### 2.3 색 — 실제 토큰 전량

`:root`에서 뽑은 브랜드 토큰(쿠키배너 `--cc-*` 제외):

```
--color-black        #010102     ← 순흑이 아니라 파랑 1 섞인 흑
--color-white        #fff
--color-purple       #8e0dd1     ← 유일한 액센트
--color-light-grey   #ccc
--color-dark-grey    #686868
--color-dark-stroke  #272727
--color-light-stroke #ddd
--color-code-amber   #f59e0b     ← 상태 표기용, 화면에 거의 안 나옴
--color-code-red     red
--color-black-nav-bg rgba(1,1,2,.85)
--color-white-nav-bg hsla(0,0%,100%,.85)
```

그리고 진짜 장치는 **컬러웨이 토큰 레이어**다.

```
--colorway-bg      #010102
--colorway-text    #fff
--colorway-label   #ccc
--colorway-body    #ccc
--colorway-stroke  #272727
--colorway-nav-bg  rgba(1,1,2,.85)
```

섹션마다 이 6개를 갈아끼운다. 다크 섹션이 기본이고, "By The Numbers"에서 통째로 라이트로 뒤집힌다. **그라데이션 없이 칼로 자른 경계**이고, 그 순간 내비 바 배경·글자색까지 같이 뒤집힌다. 다크모드 토글이 아니라 **스크롤 위치에 따른 편집적 반전**이다.

액센트 #8e0dd1은 극도로 아낀다. 실제 등장 지점은 세 곳뿐이었다.
- 히어로 브랜드 필름 속 지구 궤도선·노드 글로우
- Tensorglobe 섹션 와이어프레임 지구의 궤도 아크와 노드
- 3D 도시 실루엣(전체를 보라 단색으로 칠함), 벡터 도로망 레이어
- 그리고 **내비에서 열린 메뉴 항목의 ○ 링이 ● 보라 점으로 바뀌는 것** — 지름 6px짜리 이 점 하나가 UI에서 유일한 컬러다.

즉 보라는 "버튼 색"이 아니라 **데이터가 살아 있음을 표시하는 색**이다.

### 2.4 그리드·여백

```
--grid-column-count : 16
--header-height     : 79px
--bp-min 375 / --bp-phone 768 / --bp-mobile 940 / --bp-tablet 1100 / --bp-desktop 1440 / --bp-mega 1920
gap  : clamp(1rem, .751vw + .824rem, 1.5rem)      → 16–24px
pad  : clamp(1rem, .296rem + 3.005vw, 3rem)       → 16–48px
```

1440에서 실측한 값:

- 페이지 좌우 거터 **64px**
- 16컬럼, gap 16px → 1컬럼 ≈ 67px
- 본문 컬럼 폭 **477px** = 정확히 6컬럼(6×67 + 5×16 = 482)
- 헤드라인 블록 `.block-text { max-width: 800px }` — 고정값
- 3열 카드 폭 347px, 카드 사이는 128px씩 벌어져 있음
- 섹션 상단 패딩 **143px**, 하단 32px — 위가 4배 이상 넓다

여백 감각을 숫자로 못박아 두면: "By The Numbers" 섹션에서 통계 행 하나의 높이는 약 **450px**인데 그 안의 콘텐츠(124px 숫자 + 2줄 캡션)는 실제로 150px를 넘지 않는다. **300px가 그냥 비어 있다.** 그게 이 사이트가 "고급"으로 읽히는 첫 번째 이유다.

### 2.5 로고와 아이콘

- 워드마크: Everett 커스텀. 앞의 심볼은 **조리개/레티클** — 원 안에 원, 바깥 링이 4조각으로 갈라져 있다. 위성 광학계와 조준경을 동시에 읽히게 한 형태.
- 섹션 라벨 앞의 불릿이 그냥 점이 아니라 **◉ 레티클 글리프**다. 비활성일 때 회색 실점, 뷰포트에 들어오면 흰 링+점으로 바뀐다.
- 링크 화살표는 **가는 →** 하나뿐. 아이콘 세트가 사실상 없다.
- 푸터 하위 항목 앞에는 **↳** 훅 화살표를 쓴다. 트리 구조를 아이콘 없이 글리프로만 표현.
- 버튼은 **채워진 사각형이 아니라 코너 브래킷**이다. ⌐ ¬ ⌐ ¬ 네 귀퉁이 L자 마크만 있고 변은 뚫려 있다. 크롭 마크이자 조준 프레임. 전 사이트의 모든 CTA가 이 형태다("Our Mission", "Get in Touch", "Contact Us", "Task 3D", "Learn More").

### 2.6 이미지 정책

Sanity CDN(`ava0h2e5`)에서 서빙, 파라미터는 예외 없이 `?w=1920&q=85&auto=format` → 브라우저엔 **AVIF**로 내려온다. 원본은 2592×1728부터 **7516×5010, 7210×7210**까지 있다. 즉 위성 원본을 "지도 타일"이 아니라 **사진 원판**으로 취급해서 한 장으로 굽는다.

이미지는 두 계열로 딱 갈린다.

**(A) 제품 = 위성/3D.** 채도를 거의 죽인 흑백에 가까운 그레이딩. 그런데 **분석된 영역만 색이 살아 있다.** 히어로의 항만 장면에서 크롭 박스 안의 파란 방수포와 붉은 컨테이너만 컬러고, 나머지는 무채색이다. "AI가 본 곳"을 색으로 표시하는 문법.

**(B) 산업 = 사람.** 얕은 심도, 따뜻한 역광, 손과 장비의 클로즈업. 군인의 장갑 낀 손, 오렌지 안전복 작업자의 손과 휴대폰, 관제실 모니터 앞의 인물. **얼굴은 거의 안 나오고 손과 장비가 주인공**이다. 그리고 이 사진들은 **모니터 화면을 실물로 촬영**한다 — Hub UI가 평면 목업이 아니라 실제 방 안 모니터에 비스듬히 찍혀 있고 배경이 흐려져 있다.

---

## 3. 기술 스택 — 가장 중요한 실무적 발견

`window` 전역 스캔 결과:

```
AnimeJS, lenisVersion, SwiperElementRegisterParams
```

그리고 없는 것:

```
THREE 없음 · Cesium 없음 · deck.gl 없음 · mapbox/maplibre 없음 · WebGL 캔버스 없음
```

**Vantor 사이트에는 3D 엔진이 한 줄도 없다.** 그 화려한 와이어프레임 지구, 보라색 3D 도시, 포인트클라우드 항만, 등고선 지형 — 전부 **미리 렌더한 mp4**다.

| 영상 | 해상도 | fps | 길이 | 비트레이트 | 용량 | 용도 |
|---|---|---|---|---|---|---|
| df240ed6 | 1280×720 | 25 | 33.0s | 1.15 Mbps | 4.7MB | 히어로 브랜드 필름 |
| 0a2c3afa | 720×720 | 25 | 16.0s | 3.90 Mbps | 8.5MB | 제품 타일 |
| cddca764 | 750×750 | 25 | 9.7s | 4.99 Mbps | 6.4MB | Vivid Features 벡터 |
| 6c92f397 | 750×750 | 25 | 8.5s | 3.97 Mbps | 4.6MB | 제품 타일 |
| feaf5527 | 720×720 | 25 | 13.8s | 3.86 Mbps | 7.3MB | 제품 타일 |

- 히어로는 **가로 720p / 1.15Mbps**로 눌러 놓고 전화면에 늘려 쓴다. 어차피 어둡고 대비 낮은 영상이라 티가 안 난다.
- 제품 타일은 **정사각형**이고 비트레이트를 히어로의 3~4배로 올렸다. 작게 쓰되 선명하게.
- 프론트엔드는 **Nuxt 3(Vue)**, CMS는 **Sanity**.

Land-XI 관점에서의 함의는 분명하다. **"WebGL급 몰입감"의 90%는 WebGL 없이 만든다.** 우리는 MapLibre 인터랙션을 유지하되, 히어로와 챕터 전환처럼 조작이 필요 없는 구간은 미리 구운 영상/시퀀스로 대체하는 편이 훨씬 싸고 훨씬 예쁘다. 로컬 남원 4시점 정사영상과 제주·여수 자산으로 30초짜리 필름 한 편을 뽑는 것이 인터랙티브 3D를 붙이는 것보다 우선이다.

---

## 4. 모션 — 프레임 단위 해부

### 4.1 이징이 하나다

전체 트랜지션을 세어 봤다. 종류가 **딱 하나**다.

```
cubic-bezier(0.15, 1, 0.3, 1)
```

- opacity 0.5s × 48개 요소
- color 0.5s × 24개
- transform 0.5s × 23개
- background-color/width/height/border 0.5s × 16개
- 나머지 0.75s / 1s / 1.25s가 소수

이 커브는 **매우 강한 expo-out**이다. 처음 15%에서 이미 목표의 100%에 근접했다가 뒤에서 아주 길게 정착한다. 결과적으로 "튕기지 않으면서 즉각 반응하고 부드럽게 앉는" 느낌이 난다. 우리 프로젝트에 그대로 이식할 값 하나를 꼽으라면 이것이다.

지속시간 사다리: **500 / 750 / 1000 / 1250ms.** 250ms 미만이 없다. 웹앱 UI의 "빠릿함"을 포기하고 편집물의 "묵직함"을 택했다.

### 4.2 키프레임은 5개뿐

```css
@keyframes text-underline          { 0%{right:100%} 100%{right:0} }
@keyframes text-underline-unhover  { 0%{left:0}     100%{left:100%} }
@keyframes pulse-dot   { 0%{opacity:.6; transform:translateY(-50%) scale(.7)}
                        50%{opacity:1;  transform:translateY(-50%) scale(1)}
                       100%{opacity:.6; transform:translateY(-50%) scale(.7)} }
@keyframes pulse-ring  { 0%{opacity:0; transform:translateY(-50%) scale(1)}
                        50%{opacity:.6}
                       100%{opacity:0; transform:translateY(-50%) scale(2)} }
@keyframes hover-line  { 0%{left:0} 100%{left:100%} }
```

밑줄이 **들어올 때는 왼쪽에서 오른쪽으로 그어지고, 나갈 때는 그은 방향 그대로 오른쪽으로 빠져나간다.** 되감기가 아니라 통과다. 디테일 하나로 품격이 갈리는 지점.

`pulse-dot` + `pulse-ring` 조합은 센서 핑 마커다. 링이 scale 1→2로 퍼지면서 0.6→0에서 사라지고, 안쪽 점은 0.7↔1로 숨쉰다. 우리 프로토의 "펄스 1개" 제약과 정확히 같은 문법인데, Vantor는 **링과 점을 분리**해서 두 트랙으로 돌린다.

### 4.3 clip-path가 리빌 엔진

```css
[data-line] { clip-path: inset(-5px 0px); overflow: clip; }               /* 줄 단위 마스크 */
header .sub-menu-wrapper { clip-path: inset(0 0 100%); }                  /* 위→아래 펼침 */
.article-card .image-wrapper { clip-path: inset(0 0 100%); }              /* 이미지 위→아래 */
.image-card .hover-img { clip-path: inset(100% 0 0);
                         transition: clip-path 1s cubic-bezier(.15,1,.3,1); }
.image-card.w-hover-img:hover .hover-img { clip-path: inset(0); }         /* 아래→위 와이프 */
```

- 텍스트 리빌은 opacity가 아니라 **줄 단위 클립 마스크 + translateY**다. `inset(-5px 0)`으로 위아래 5px 여유를 줘서 디센더가 잘리지 않게 했다.
- 카드 호버 시 두 번째 이미지가 **아래에서 위로 1초에 걸쳐 차오른다.** 페이드가 아니다. 1000ms는 웹 호버로는 대단히 느린데, 그래서 "무거운 장비가 움직이는" 느낌이 난다.

### 4.4 카운트업 — 70ms 연사로 잡은 실제 거동

"By The Numbers" 진입 순간을 70ms 간격으로 16프레임 찍고, 동시에 `.char` 스팬의 computed style을 샘플링했다.

```
t=  0ms  배경 #010102(흑)   숫자 안 보임
t= 70ms  배경 중간 회색      "9"와 "6"만 보임 (첫 글자만)
t=140ms  배경 거의 흰색      "90%" 보이나 "%"는 아직 옅은 회색
t=210ms  배경 #fff           "90%" "60+" 완전
```

`.char` 색상 샘플(70ms 간격): `rgb(255,255,255) → (99,99,100) → (53,53,54) → (22,22,23) → (12,12,13) → (5,5,6) → (3,3,4) → (1,1,2)`

정리하면 **세 겹이 동시에 돈다.**

1. 컬러웨이 배경이 흑 → 백으로 크로스페이드 (약 200ms 안에 대부분 진행)
2. 글자 색이 백 → 흑으로 같은 커브를 타고 넘어감 (완전 정착까지 약 560ms, expo-out 그대로)
3. 그 위에 **글자 하나씩 순차 등장** — 글자당 약 35~50ms 스태거, 한 행 전체가 200~300ms

중간 프레임에서 "100 milli"의 마지막 글자들이 **명도가 다른 회색 세로 막대**로 보인다. 글자가 아직 배경과 같은 회색이라 글리프 형태가 안 잡히고 블록으로만 읽히는 순간이다. 의도했든 아니든, 결과적으로 **"현상되는 필름"** 같은 인상을 준다. anime.js의 텍스트 분할 유틸로 `.char` 스팬을 만들고 스태거를 먹인 구조.

행마다 스크롤 위치에 걸려 있어서 아래로 내리면 90% → 60+ → 1 billion+ → 15x → ~7 million → 100% → 100 million+ 순으로 **하나씩 현상된다.** 콘택트시트에서 "15x"의 x가, "~7m"의 m이 아직 회색인 프레임이 그대로 잡혔다.

### 4.5 내비 드롭다운

"Products"에 마우스를 올리면:

1. 헤더 아래에서 **흰 패널이 clip-path로 아래로 펼쳐진다**
2. 동시에 뒤 페이지 전체에 **밝은 스크림**이 덮여서 히어로 영상이 뿌옇게 죽는다
3. 4개 컬럼(그룹 라벨 14px → 제품명 18px → ↳ 하위항목)이 **컬럼별·항목별로 스태거되며 밝아진다** — 중간 프레임에서 라벨은 이미 진하고 제품명은 아직 회색
4. 활성 내비 항목의 **○ 링이 ● 보라 점으로** 바뀐다

### 4.6 스티키 스플릿 스크롤 — 홈의 척추

홈 중반 "Fueling every part of the spatial intelligence cycle" 이후 구간이 이 사이트의 핵심 레이아웃이다.

- 화면을 **50 : 50**으로 가른다
- **왼쪽**: 좌우 패딩 0의 풀블리드 미디어 패널. 위성 정사영상, 시안 와이어프레임 도시, 보라 벡터 도로망, 실물 모니터 사진, SAR/수심 영상이 **끊김 없는 세로 필름 스트립**으로 흐른다
- 왼쪽 상단에는 4개 챕터 메뉴가 얹혀 있다: `Mission Solutions / Dynamic Foundation / Real-time Tasking / Spatial Intelligence Platform`. **순서는 고정이고 활성 항목만 흰색**으로 바뀌면서 아래에서 위로 올라간다
- **오른쪽**: 순흑. ◉라벨 → H2(28px) → "Products" 소제목 → 제품 리스트. 각 행은 헤어라인으로 구분되고, 대표 제품 행에만 우측에 썸네일이 붙고 나머지는 이름 + → 만 있다
- 이미지 상단에는 **`Misrata Port LIBYA   12 FEB 2…`** 형태의 **지명 + 날짜 캡션 바**가 붙는다

마지막 항목이 결정적이다. 우리가 "인쇄 아틀라스처럼 FIG. 0n 캡션"이라고 부르던 장치를 Vantor는 **지명(대문자) + 촬영일(DD MMM YYYY)**로 쓴다. 이게 위성영상에 "이건 어딘가의 어느 날이다"라는 저널리즘적 무게를 얹는다.

---

## 5. 카피 — 홈 전체가 700단어다

`document.body.innerText` 전량이 **4,773자**. 이 안에 히어로, 매니페스토, 3개 진술문, 3개 산업 카드, 4개 제품군 × 4~5개 제품, 7개 통계, 전체 푸터가 다 들어 있다.

문법을 뽑으면:

**1. 헤드라인은 동사 명령형으로 시작한다.**
> Own the ground truth… / Fuse all your sensors… / Keep pace with change… / Gain operational clarity… / Model and interact with the world… / Understand what's happening anywhere… / Build your own AI-ready living globe / Put every pixel in its place / Maximize every minute on orbit / See every contour on Earth in stunning 3D / Refresh 3D terrain from space, on demand.

**2. 2인칭을 집요하게 쓴다.** your sensors / your intelligence / your own / your terms / your mission.

**3. 형용사 대신 숫자를 쓴다.** 90% · 60+ · 1 billion+ · 15x · ~7 million · 100% · 100 million+ · 50 cm · 15 cm · 30 cm · 3 m · 4 m CE90 · 3 m SE90 · 24시간 · 95%.

**4. 통계는 "숫자 + 한 문장"이고 그 문장이 20단어를 안 넘는다.**
> **90%** — of foundational geospatial intelligence used by the U.S. Government is powered by Vantor.
> **~7 million** — sq km of daily high-resolution imagery collection capacity, including 3.5M+ 30 cm.

숫자와 문장이 문법적으로 이어진다. 숫자가 문장의 주어다.

**5. 제품 설명은 한 줄, 8~12단어.**
> Raptor™ — Unlock maximum GPS resilience for autonomous systems
> Sentry™ — Persistent monitoring solution delivering predictive intelligence at global scale
> Forge™ — Spatial data fusion in real-time
> Nexus™ — The gateway to your living globe

**6. 전환은 em dash 하나로.**
> …unified intelligence is harder than ever—too many sensors, siloed insights.

**7. 자기 제품명에 ™를 빠짐없이 붙인다.** 사소해 보이지만 화면에서 이게 **작은 상첨자 리듬**을 만들어서 제품 리스트가 그냥 텍스트가 아니라 카탈로그로 읽히게 한다.

---

## 6. Land-XI 현재 시안과 나란히 놓고 — 냉정하게

`design-canvas/B-Home`(에디토리얼 아틀라스, 현재 권고안), `shots/proto/ch3.png`(전국 챕터), `shots/proto/svc-marine-close.png`(여수 해양쓰레기)를 Vantor 캡처와 같은 배율로 놓고 비교했다.

### 6.1 정면으로 밀린 지점 8가지

**① 위성영상을 사진으로 다루지 않는다.**
`ch3.png`의 한반도는 **웹맵 기본 렌더**다. 전 영역이 균일한 채도로 켜져 있고, 그레이딩도 크롭도 없고, 캡션도 없다. Vantor의 위성 이미지는 전부 (a) 무채색에 가깝게 눌리고 (b) 분석 영역만 색이 살고 (c) 상단에 지명·날짜가 붙는다. 우리 것은 "지도를 띄웠다", Vantor 것은 "한 장을 골라 실었다".

**② HUD 스티커를 코너에 붙이고 있다.**
`ch3.png`에 떠 있는 우상단 위성 상태 패널, 우하단 타임 스크러버, 좌상단 부처 칩 — **모서리마다 라운드+반투명 다크 패널**이 붙어 있다. Vantor는 이런 패널을 **한 개도** 쓰지 않는다. 오버레이는 전부 이미지 좌표계 안에 있는 **헤어라인 벡터 도형(수집 풋프린트 다각형, 타깃 링, 크롭 박스)**이고, 크롬은 상단 79px 바 하나뿐이다. 우리 화면의 "미래적 HUD"는 실제로는 **2016년 대시보드 관용구**다.

**③ 여백이 없다.**
`B-Home`은 1440×900 안에 13종 색인표 + 지도 + 결과 플레이트 + 86px 헤드라인 + CTA + 푸터 통계를 **전부 동시에** 넣었다. Vantor 홈은 같은 뷰포트에서 첫 화면에 **H1 5단어 + 서브헤드 8단어 + CTA 1개**만 보여준다. 두 번째 화면은 문장 하나만 있고 위아래로 300px 이상이 비어 있다.

**④ 최대 숫자가 작다.**
우리 최대 숫자는 `38,057`(약 40px)과 `1,857`(약 20px, 표 안). Vantor는 `90%`를 **124px**로 놓는다. 우리가 "숫자로 말한다"고 했지만 실제로는 숫자를 표에 가뒀다.

**⑤ 카드·그림자·라운드가 남아 있다.**
`B-Home`의 흰 플레이트, `svc-marine-close`의 다크 글래스 패널 — 둘 다 라운드 코너와 그림자를 쓴다. Vantor는 전 사이트에 **border-radius도 box-shadow도 사실상 없다.** 구획은 오직 **1px 헤어라인**과 **면 색 반전**으로만 한다. 푸터가 대표적으로, 헤어라인만으로 짜인 격자다.

**⑥ 증거가 안 보이는 축척에서 보여준다.**
`svc-marine-close.png`는 화면의 85%가 밋밋한 파란 바다이고 스티로폼 객체는 몇 픽셀짜리 주황 점이다. **이 축척에서는 아무것도 안 보인다.** Vantor는 이 문제를 크롭 인셋으로 푼다 — 넓은 컨텍스트는 그대로 두고, "Acquired" 라벨이 붙은 **박스 안에만 확대된 실물**을 넣는다. 한 화면에 광역과 근접이 동시에 있다.

**⑦ 차트를 쓴다.**
우리는 신뢰도 히스토그램을 전면에 놓는다. Vantor 마케팅 화면에는 **차트가 단 하나도 없다.** 대신 숫자 하나 + 문장 하나. 차트는 작업 화면(C안)의 언어이고, 진입/발표 화면의 언어가 아니다.

**⑧ 서체 웨이트를 낭비한다.**
Gothic A1 900 / 700 / 500 / 400을 섞어 쓰고 있다. Vantor는 **웨이트 하나**로 버틴다. 웨이트를 줄이면 크기와 여백으로 위계를 만들 수밖에 없고, 그게 화면을 정돈한다.

### 6.2 우리가 이미 맞게 가고 있던 것 3가지

공정하게 적어 둔다.

- **밝은 지도 바탕 + 데이터 저널리즘 톤** 방향은 Vantor의 컬러웨이 반전 구조와 충돌하지 않는다. 오히려 "다크가 기본, 숫자 섹션만 라이트"라는 반전 리듬으로 발전시킬 수 있다.
- **`FIG. 0n` 캡션 발상**은 Vantor의 `지명 + 날짜` 캡션과 정확히 같은 계열이다. 형식만 `여수시 국동항 · 드론 GSD 1.1cm · 2026-05-13`처럼 바꾸면 된다.
- **실데이터만 쓴다는 원칙**(로렘·지어낸 숫자 금지)은 Vantor가 90%/60+/15x를 쓰는 방식과 동일하다. 계속 지킬 것.

---

## 7. Land-XI 이식안 — 우선순위대로

### Tier 1 · 지금 바로 (비용 낮고 효과 큼)

1. **이징 통일.** 전 프로젝트 `--ease: cubic-bezier(.15, 1, .3, 1)`, 지속시간 `500 / 750 / 1000 / 1250ms` 네 계단만 허용. 다른 커브 금지.
2. **웨이트 축소.** 한글 디스플레이는 **한 웨이트**로 고정. 크기·색으로만 위계.
3. **최대 숫자를 124px급으로.** `73,223`, `38,057`, `2,098` 같은 실측 수치를 디스플레이 타입으로 승격하고, 옆에 20단어 이하 문장 하나만 붙인다. 표 밖으로 꺼낼 것.
4. **코너 브래킷 CTA.** 채운 파란 버튼을 걷어내고 ⌐¬ 네 귀퉁이 프레임으로 교체. 호버 시 브래킷이 안쪽으로 4px 수축.
5. **밑줄 통과 애니메이션.** 진입 `right:100%→0`, 이탈 `left:0→100%`. 되감지 말 것.
6. **레티클 불릿 ◉.** 섹션 라벨 앞 글리프를 통일. 뷰포트 진입 시 회색 실점 → 흰 링+점.
7. **라운드·그림자 제거.** border-radius 0, box-shadow 0. 구획은 1px 헤어라인과 면 반전만.

### Tier 2 · 이번 스프린트

8. **컬러웨이 토큰 레이어 도입.** `--colorway-bg / -text / -label / -body / -stroke / -nav-bg` 6개를 섹션 단위로 스왑. 다크 기본 + 통계 섹션 라이트 반전. **그라데이션 없는 칼경계**, 헤더도 함께 반전.
9. **카운트업 3겹 구현.** 배경 크로스페이드 + 글자색 크로스페이드 + 글자 단위 스태거(35~50ms/자). 스크롤 위치에 걸어서 행마다 순차 현상.
10. **줄 단위 clip-path 리빌.** `[data-line]{clip-path:inset(-5px 0); overflow:clip}` + 내부 translateY. opacity 페이드보다 훨씬 비싸 보인다.
11. **스티키 스플릿 스크롤을 서비스 섹션 척추로.** 좌 50% 풀블리드 미디어 필름스트립(패딩 0) + 우 50% 순색 텍스트. 좌측 상단에 고정 챕터 메뉴(활성만 흰색). 13개 서비스를 5개 부처 챕터로 묶어 태우면 그대로 맞는다.
12. **지명·날짜 캡션 바.** 모든 영상/정사영상 상단에 `전남 여수시 국동항 · 드론 GSD 1.1 cm · 2026-05-13` 형식. 아틀라스 톤을 완성하는 가장 싼 장치.
13. **선택적 채도.** 정사영상 전체를 채도 15~25%로 눌러 두고, **AI가 탐지한 폴리곤 내부만 원본 채도**로 복원. `filter: saturate()` + 마스크로 CSS만으로도 가능. 이게 "AI가 봤다"를 설명 없이 전달한다.
14. **여백 규율.** 섹션 상단 패딩 = 하단의 4배. 본문 컬럼 최대 6컬럼(≈480px). 헤드라인 블록 max-width 800px. 첫 화면에 3개 요소 이상 넣지 말 것.

### Tier 3 · 구조 결정

15. **히어로를 프리렌더 필름으로.** MapLibre 실시간 렌더 대신 30초 브랜드 필름. 남원 4시점 정사영상 + 여수 드론 + 제주 자산으로: 궤도의 한반도 → 남원 광역 정사 → 3D 메쉬 압출 → 드론 근접 → 탐지 박스 점등 → 다시 광역. **1280×720 / 25fps / 1.2Mbps h264면 충분**하다(Vantor 히어로가 정확히 그 스펙). 인터랙션은 그 아래 섹션부터.
16. **제품/서비스 타일 영상은 정사각형 + 고비트레이트.** 720×720, 8~16초 루프, 4~5Mbps. 작게 쓰되 선명하게.
17. **벡터 데이터를 아트로 렌더.** Vantor의 Vivid Features 타일 영상이 정답지다 — 순흑 배경, 창백한 얼음빛 압출 건물, **마젠타/보라 도로 벡터**, 흰 그래티큘 그라운드 그리드, 스펙트럴 등고선. 우리 지적·건축물 GPKG를 이 문법으로 굽으면 "지도"가 아니라 "작품"이 된다.
18. **UI는 실물 촬영으로.** 플랫 목업 대신 실제 모니터/태블릿에 띄워 얕은 심도로 촬영. 사람 손과 장비가 프레임에 들어오게. 사무실이든 현장이든.
19. **액센트 색을 1개로, 데이터 전용으로.** LX 블루를 "버튼 색"이 아니라 **"살아 있는 데이터 표시색"**으로 재정의. UI 컬러는 흑·백·회색만.
20. **홈 카피를 700단어로 깎기.** 현재 카피 덱을 Vantor 문법으로 다시 씀: 동사 명령형 헤드라인 · 2인칭 · 형용사 대신 숫자 · 제품 설명 한 줄 8~12단어 · 통계는 숫자+한 문장.

---

## 8. 한글 서체 페어링 제안

Everett은 **기하학적 그로테스크에 인간적 곡률**을 섞은 서체다(단일 층 a, 열린 터미널, 넓은 카운터, 대문자 폭 균등). 한글로 대응할 후보:

| 후보 | 근거 | 리스크 |
|---|---|---|
| **Pretendard Medium(500)** 단독 | 폭·자족 균형이 Everett와 가장 근접, 라틴 폴백이 Inter 계열이라 숫자·영문 혼용이 자연스럽다. 웨이트 하나로 버티는 전략에 가장 안전 | 너무 흔해서 "기본값"으로 읽힐 위험 |
| **SUIT Medium** | 기하학적 성향이 Everett에 더 가깝고 카운터가 넓다. 디스플레이에서 개성이 산다 | 소문자 라틴 품질이 Pretendard보다 약함 |
| **Wanted Sans Medium** | 큰 사이즈에서 매우 강하고 현대적. 124px 숫자에 최적 | 본문 16px 가독성 검증 필요 |

**권고: 디스플레이 = SUIT Medium(500) 단독, 본문 = Pretendard Regular(400), 숫자·영문·좌표 = Inter 400.**
현재 Gothic A1 900을 쓰는 86px 헤드라인은 **웨이트를 500으로 낮추고 크기를 키우는** 방향으로 바꾼다. 굵기로 소리치는 대신 크기와 여백으로 말하게 하는 것이 Vantor 방식이고, 한글에서는 900 웨이트가 큰 사이즈에서 획이 뭉쳐 보이기 때문에 실제 가독성도 좋아진다.

letter-spacing은 한글에도 같은 규칙을 적용한다: 흐르는 텍스트·큰 헤딩 −0.01em, 라벨·내비 +0.01em. line-height는 한글 특성상 한 계단 올려서 **디스플레이 1.20–1.35 / 본문 1.60 / 라벨 1.20**.

---

## 9. 하지 말아야 할 것 — Vantor가 안 하는 것들

의도적으로 **없는** 것들을 목록으로 남긴다. 우리가 유혹받을 항목들이다.

- 스크롤 진행 바 / 프로그레스 링 — 없음
- 커스텀 커서 — 없음(기본 커서 그대로)
- 패럴랙스 배경 — 없음(히어로도 고정)
- 텍스트 글로우·네온 — 없음
- 유리 블러 패널(glassmorphism) — 없음. 스크림은 불투명도만 조절
- 아이콘 세트 — 화살표 → 와 훅 ↳ 외에 없음
- 차트·그래프 — 마케팅 페이지에 단 하나도 없음
- 그라데이션 — 배경·버튼·텍스트 전부 없음
- 로딩 스피너 / 스켈레톤 — 없음
- 모달 — 쿠키 배너 외에 없음
- 자동 재생 캐러셀 — 없음(Swiper는 로드되지만 홈에서 안 씀)
- 마이크로 인터랙션 사운드 — 없음
- 다크모드 토글 — 없음(컬러웨이는 콘텐츠가 정한다)

**빼기의 목록이 더하기의 목록보다 길다.** 그게 이 사이트의 설계 결론이다.

---

## 10. 참고 자료

- Vantor 홈: https://vantor.com
- Tensorglobe Platform: https://vantor.com/product/platform/
- WorldView 3D: https://vantor.com/product/worldview/3d/
- Vivid Terrain: https://vantor.com/product/vivid/terrain/
- Vivid Mosaic: https://vantor.com/product/vivid/mosaic/
- Defense: https://vantor.com/industries/defense/
- About: https://vantor.com/company/about/
- Careers: https://vantor.com/careers/
- Grafik 브랜드 런치 케이스스터디: https://grafik.agency/case-study/vantor/
- TWK Everett(Weltkern): https://maxibestof.one/typefaces/everett
- Lippincott: https://www.lippincott.com/about/
- Maxar → Vantor/Lanteris 분사 보도: https://breakingdefense.com/2025/10/whats-in-a-name-goodbye-maxar-hello-vantor-and-lanteris/
