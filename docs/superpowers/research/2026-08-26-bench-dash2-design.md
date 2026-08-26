# 대시보드 벤치마크 2 — "디자인이 뛰어나고 로그인 없이 실제 UI가 보이는" 흰 바탕 대시보드 실측

- 작성일: 2026-08-26 · 브랜치 `plan1-foundation` · 캡처 `shots/bench/dash2/`(gitignore, 시트만 `git add -f`)
- 선행 조사: `2026-08-26-bench-geo-admin-dashboards.md`(지오/관리자, §4 안티패턴 A1–A15). **Esri·Earthdata·Linear 마케팅·Vercel 문서·Stripe 문서는 재조사하지 않았다.**
- 발주자 범위 정정(원문): **"B안, 흰색 배경이 주요 기본인거지.. 알지? 엉뚱한건 스킵하고 우리 목표에 부합하는것만 조사한다."**
  → 우리 기준은 `design/system.md`의 **흰 종이 아틀라스**: 바탕 `#FFFFFF`, 잉크 `#010102`, 헤어라인 `#DDD`, radius 0, shadow 0, 액센트 1개 `#006DF7`, 큰 수 124px, 실사 이미지 1급.
  그래서 **다크 셸은 한 번 보고 한 줄로 제외**했고, 흰/종이 바탕에서 **빌려올 수 있는 장치**(스켈레톤·숫자 조판·헤어라인 차트·시간 스트립·출처 표기·"지우지 말고 흐리기")만 실측했다.

## 0. 방법 · 등급 · 제외 목록

Playwright(Chromium headless, 저장소 `@playwright/test@1.62.1`) 1440×900, 첫 화면 + 호버/스크롤 상태 1–2장, 각 대상마다 DOM 실측 JSON(`_measure-<slug>.json`):
첫 900px 최대 폰트 px · 차트/이미지 점유율(`<canvas><img><svg>` 면적 합 / 1440×900) · 카드 수(테두리·그림자·배경으로 구획된 140×70 이상 블록) · radius/shadow 사용 횟수 · 채도 0.45 이상 액센트 색 빈도 · 서체.
하네스: `shots/bench/dash2/_tools/cap2.mjs`(cap.mjs 확장) + `w1~w3.mjs` 배치, 요약 `summ2.mjs`.

| 등급 | 뜻 |
|---|---|
| **LIVE** | 실제 제품 UI, 실데이터, 로그인 없음 |
| **DOC** | 문서/갤러리/템플릿 페이지 안의 실제 렌더 |
| **MKTG** | 마케팅 페이지 목업 |

**제외(한 줄 사유, 캡처는 남김)** — Grafana play(`grafana-play-1.jpg`) 제외 — 다크 셸 · TradingView 마켓/차트는 **흰 테마로 열려** 유지 · Windy(`windy-1.jpg`) 제외 — 다크 셸 · ADS-B Exchange(`adsbx-1.jpg`) 제외 — 다크 지도 셸 · Reuters 코로나 트래커(`reuters-graphics-1.jpg`) 제외 — 다크 랜딩 · Linear/Raycast(`linear-demo-1.jpg` `raycast-1.jpg`) 제외 — 다크 마케팅, 제품 UI 0 · Carbon 대시보드 패턴(`carbon-dash-1.jpg`) 404 · Blueprint 문서 컴포넌트 페이지, 대시보드 아님 · Tremor `dashboard.tremor.so`/`blocks.tremor.so/templates/dashboard` 404 · PostHog demo 로그인 벽(`posthog-demo-1.jpg`) · Sentry demo 로그인 벽 · Metabase demo 영상 마케팅 · NYT 봇 차단 · Bloomberg 공개 데모 없음 · 네이버 데이터랩 실시간검색어 페이지 404(메인은 유지). **Ventusky**는 흰 크롬이지만 지도 색면이 화면 전부라 참고만.

**살아남은 것 16개**: Plausible · Umami · Cloudflare Radar · Observable Framework(EIA 전력망, 웹로그) · Our World in Data(Grapher, Explorer) · FT 코로나 차트 · GitHub Insights(Pulse, Contributors) · TradingView(차트, Markets) · 스마트서울뷰(서울시) · 기상청 날씨누리 · 토스증권 · 국민안전24 · 네이버 데이터랩 · Datawrapper River · shadcn dashboard-01 · Vercel Observability.

---

## 1. 대상별 해부

숫자는 전부 1440×900 첫 화면 실측 px. "빌려올 것"은 B안(흰 아틀라스) 규율에 통과하는 것만 적었다.

### 1.1 Plausible Analytics — `plausible.io/plausible.io` 〔LIVE〕 `plausible-demo-1~4.jpg`
정체: 프라이버시 웹분석. 자사 트래픽을 **공개 실데이터**로 보여준다(방문 304k, 현재 49명).
- **KPI 띠 하나.** 6개 KPI가 카드가 아니라 **한 줄 띠**(1088px 폭, 높이 64) 안에 `|` 헤어라인으로 나뉜다. 라벨 12px/600 대문자 자간 → 값 **19px/600** → 델타 12px 화살표. 카드 수 3(띠·차트·두 표)이 전부.
- **선택된 KPI만 연한 배경**(`oklch(0.97 0.014 254)` 청회색 8px radius)으로 표시. 나머지는 바탕과 같다 — "강조 = 배경 1단계 어둡게".
- **단일 액센트.** 채도 0.45 이상의 색이 **0개**로 측정됐다(보라 `#6366f1`은 채도 0.6이지만 면적이 차트 선 1개뿐). 라인 차트 1개, 축 라벨 12px, 그리드 헤어라인.
- **표의 막대 = 셀 배경.** Top Pages의 순위 막대가 별도 차트가 아니라 **행 배경의 일부 폭 채움**(`/:dashboard` 226k = 행 폭 60%). 숫자는 우측 정렬 14px/500. 행 높이 36 → 900px에 25행.
- 서체 `ui-sans-serif`(시스템), 타입 4단(19/16/14/12).
- 안티패턴: KPI 띠 안 값이 19px — 6개를 한 줄에 넣느라 **첫 화면의 최대 폰트가 19px**. 우리 124px 규율과 정반대. 형태는 빌리되 값 크기는 4배 키운다.

### 1.2 Umami — `us.umami.is/share/…/umami.is` 〔LIVE〕 `umami-demo-1~3.jpg`
정체: 오픈소스 웹분석 공유 대시보드.
- 레일 `240 | 1200` 그리드. KPI 5개 값 **32px/700 Inter** — 이번 조사 흰 바탕 LIVE 중 **가장 큰 KPI**. 라벨 14px 위, 델타 14px 아래.
- 차트 1개가 첫 화면 **34%**(1158×340) — 24시간 막대, 파랑 1색 2톤(방문/조회). 액센트 실측 `rgb(38,128,235)` 단 1색, 등장 177회.
- 헤어라인 `1px lab(84.92)` 16회, shadow 4회(전부 투명). radius는 pill(3.3e7px) 196회 — **버튼/칩만 둥글고 패널은 각**.
- 하단 `Pages | Sources` 두 표가 `579 | 579` 균등 2열.
- 안티패턴: KPI 5개가 **균일 5열 카드**(폭 각 232). 위계 없음(선행 조사 A10).

### 1.3 Cloudflare Radar — `radar.cloudflare.com` 〔LIVE〕 `cloudflare-radar-1~4.jpg` `cloudflare-radar-kr-1~3.jpg`
정체: 인터넷 트래픽 공개 관측. 라이트 테마 기본, 실시간.
- 셸 `288 | 1152`. 바탕 `oklch(0.965)`(≈#F5F5F5) 위 **흰 패널** — 패널이 곧 카드(7–8개), 그림자 **0**, 테두리 `1px oklch(0.145/0.1)`.
- **패널 제목 옆 오렌지 ↗ 아이콘**(`rgb(246,130,31)` 160회 — 액센트가 CTA가 아니라 "더 보기" 링크에만 쓰인다). 본문 선은 남색 `rgb(0,43,103)` + 하늘색 2톤.
- **시계열 위 점선 = 지난 7일**(범례 `••• Previous 7 days`). 비교 기간을 색이 아니라 **선 스타일**로 구분.
- 우측 `Protocols` 반원 게이지 + 값 **20px/700**. 비율 KPI는 `61.9% | 38.1%` 값 위, **2톤 스택 막대** 아래(높이 30).
- 차트 점유 13.8%, 최대 폰트 24(제목). 타입 14/16/20 3단, `system-ui`.
- 안티패턴: "New on Radar: Radar Researcher" 일러스트 배너가 본문 위 64px를 먹는다(A7 변형).

### 1.4 Observable Framework — EIA 전력망 `…/framework-example-eia/` · 웹로그 `…/framework-example-api/` 〔LIVE〕 `observable-eia-1~3.jpg` `observable-framework-1~3.jpg`
정체: Observable의 정적 데이터앱 프레임워크 예제. 실데이터, 흰 바탕, 세리프 제목.
- **제목 34px/700 Source Serif** 한 줄 + 4열 그리드 `332×4 gap16`(폭 1376). 카드 4, radius 12 헤어라인 `1px srgb(0.875)` 5회, shadow 0.
- **시간 스크러버가 곧 KPI**: `7 AM` **28px/700** 아래 `13 Apr 2024`, 그 아래 `-27 hrs ──●── now` 슬라이더(폭 250). 시점이 화면의 가장 큰 숫자다.
- 지도(미국 전력망 노드-링크)가 왼쪽 큰 카드(680×660)에, 우측에 **얇은 카드 3개**(막대·시계열·인터체인지 영역차트) — 좌 1 : 우 3 비대칭.
- 발산 색 범례(-15%…+15%) 폭 460, 축 라벨 **10px**. 데이터 표는 카드 밖 **전폭 헤어라인 표**(행 22px).
- 웹로그 예제: **본문이 세리프 17px/26 산문**이고 차트가 산문 사이에 끼는 "설명하는 대시보드". 차트 81.8% 점유.
- 안티패턴: 축 라벨 10px/800 대문자 54회 — 확대 없인 안 읽힌다.

### 1.5 Our World in Data — Grapher `grapher/life-expectancy` · Explorer `explorers/co2` 〔LIVE〕 `owid-grapher-1~3.jpg` `owid-explorer-1~2.jpg`
정체: 세계 최대 공개 데이터 차트. 흰 바탕 + Playfair 세리프 제목 + Lato.
- 차트 프레임 `960 | 320` (차트 | 국가 선택). 첫 화면 차트 30%.
- **탭 4개(Table·Map·Line·Bar)가 같은 데이터의 뷰 전환** — 탭 높이 32, 선택 탭만 연한 파랑 바탕.
- **호버 툴팁 = 연도 제목 + 정렬된 표**(`1913` 14px/700, 값 14px/700 우측 정렬, 색 사각 12px). 표시 안 된 시리즈(Africa)는 **회색으로 흐려짐, 삭제 아님**.
- 라인 끝 **직접 라벨**(Oceania·Europe…) + ⓘ. 범례 박스 없음.
- 하단 **출처 줄** `Data source: Riley (2005); Zijdeman et al. (2015); HMD (2025); UN WPP (2024)` 13px + `OurWorldinData.org/life-expectancy | CC BY` — 다운로드/공유/전체화면 3버튼과 같은 줄.
- **재생 ▶ + 1770 ──── 2023 레인지 슬라이더**(폭 760) 차트 바로 아래.
- 우측 목록: 체크 + 이름 + 값 우측정렬, 행 34px(900px에 25.7행), 선택된 행만 연한 회청 바탕.
- radius 2px 275회(체크박스·칩), shadow 3. 액센트: 남색 `rgb(29,61,99)` 707회(텍스트·선), 빨강 Donate 1개.
- 안티패턴: 헤더 남색 바 + 빨강 헤어라인 + 파랑 Subscribe + 빨강 Donate — 상단 72px에 색이 4개.

### 1.6 FT 코로나 차트 — `ig.ft.com/coronavirus-chart/` 〔LIVE〕 `ft-covid-1~3.jpg`
정체: FT 데이터 저널리즘의 원조 트래커. 살구색 종이 `#FFF1E5` 바탕(FT 브랜드), 실데이터.
- **본문 18px/22 MetricWeb** 산문 + 국가 **칩 행**(`European Union ×` 검정 테두리 칩, 높이 28) + **토글 4개**(Deaths/Cases/New/Cumulative)가 차트 위 컨트롤 전부.
- 차트 폭 800(화면 55%) 높이 500, 축 라벨 18px/400 회색, **선 끝 국가명 직접 라벨**, 격자 헤어라인 `1px rgb(38,42,51)` 12회.
- radius 3px 12회, shadow 0, 카드 1(= 차트 하나). 채도 액센트는 청록 `rgb(13,118,128)` 1색(링크·제목).
- **"이 페이지는 더 이상 갱신되지 않습니다"** 노트가 본문 첫 줄에 — 죽은 데이터를 지우지 않고 **날짜와 함께 남겨둔** 사례(선행 A4의 반대 답).
- 안티패턴: 최대 폰트 24 — 숫자 KPI가 없다(차트만).

### 1.7 GitHub Insights — Pulse · Contributors `github.com/maplibre/maplibre-gl-js/pulse|graphs/contributors` 〔LIVE〕 `github-insights-1~2.jpg` `github-contrib-1~2.jpg`
정체: 저장소 활동 현황. 흰 바탕, Mona Sans.
- 좌 레일 `220` + 본문 `1108`. 기간 제목 `August 18, 2026 – August 25, 2026` 20px/600 + 우측 `Period: 1 week ▾`.
- **비율 막대 1개**(보라/초록 2톤, 높이 8) 위에 `44 Active pull requests | 11 Active issues` 값 16px/600 — Cloudflare와 같은 "값 위 / 얇은 막대 아래" 문법.
- **4열 소수치**: `37 Merged PR · 7 Open · 11 Closed issues · 4 New` — 값 16px/600, 라벨 12px 아래, 카드 없이 헤어라인 셀. 아래 산문 요약(`Excluding merges, 15 authors have pushed 36 commits…`) 14px에 **숫자만 볼드**.
- Contributors: 큰 커밋 막대차트(폭 1040, 파랑 1색) + 기여자 카드 **2열 `1px rgb(209,217,224)` 테두리 radius 6**, 카드 안 미니 막대차트.
- radius 6px 23–33회, shadow 사실상 0(inset 1px). 액센트: 보라 `rgb(130,80,223)` 352회(PR), 초록 `rgb(26,127,55)` 110회, 파랑 링크 58회 → **의미별 3색이지만 각각 데이터 종류에 고정**.
- 안티패턴: 첫 화면 차트 4% — Pulse는 거의 텍스트. 8px 폰트 14회(잔디 라벨).

### 1.8 TradingView — 차트 `chart/?symbol=NASDAQ:AAPL` · Markets `markets/` 〔LIVE〕 `tradingview-1~2.jpg` `tradingview-markets-1~3.jpg`
정체: 금융 차트. **흰 테마가 기본**으로 열렸다.
- 차트 캔버스 첫 화면 **122%**(1034×900 + 캔버스 중첩) — 화면이 곧 차트. 좌 툴레일 52, 우 워치리스트 `300`, 최우측 아이콘 레일 46.
- **현재가 309.90 = 28px/600**, 그 옆 `USD −0.44 −0.14%` 14px 빨강. 차트 위 마지막 가격은 **축 라벨 자리에 색 박스**(`309.90` 빨강 배경 흰 글씨) — 값이 축을 뚫고 나온다.
- 상승/하락 2색만(초록 `rgb(34,171,148)` 60회 / 빨강 `rgb(242,54,69)` 54회). 캔들 + 하단 거래량 20% 높이 반투명.
- 워치리스트 행 30px(900px에 29행), 값 우측정렬 13px/600, 등락 색 글씨만(배경 없음).
- 시간 버튼 `1D 5D 1M 3M 6M YTD 1Y 5Y All` 14px 하단 상주, 우측 `03:45:20 UTC`.
- Markets: 제목 **56px/600** `Markets, everywhere ▾` + 지수 4칩 + 전폭 영역차트(폭 1440, 빨강 1색 그라디언트 채움). 차트 58%.
- 안티패턴: radius 1171회(Markets), pill 336 — 칩 남발. 차트 화면은 아이콘 레일 3개가 화면 폭 100px을 상시 점유.

### 1.9 스마트서울뷰 — `scpm.seoul.go.kr` (서울시 디지털 시민시장실 공개판) 〔LIVE〕 `seoul-smartview-1~3.jpg`
정체: 서울시 실시간 도시 현황판. **국내 공공 중 유일하게 첫 화면이 지도+실수치**다.
- 그리드 `좌 340 | 지도 1060`. 지도가 첫 화면 **108%**(캔버스 중첩) — 화면 위쪽 상태 스트립(`2026년 8월 26일 | 오후 12:40 | 흐림 30.7°C | 속보 열대야주의보`, 높이 48, 16px)이 **날짜·시각·날씨·경보 4토큰**을 한 줄에.
- **큰 수 48px/600 SUIT** `30.7 ℃`(서울시 평균) — 국내 대상 중 최대. 연한 파랑 박스(radius 8) 안.
- **지도 위 구별 원형 라벨**(지름 48, 초록 `rgb(109,150,43)` 채움 흰 글씨 14px/700, 값 `29.5`) 25개 — 색이 값이 아니라 **행정구 채움**이고, 값은 글자로 직접 쓴다. 점(·) 밀도로 인구를 보여주는 도트맵이 밑에 깔린다.
- 좌 패널: 제목 `[폭염] 재난속보` + ◀▶ 캐러셀(점 7개), 4시간 미니 라인차트(폭 260, 축 라벨 12), `재난 발생 이력` 3행(시각 + 종류, 행 40).
- 우상단 **날씨 미니카드**(현재 기온 31°C·풍향·풍속·습도·강수, 높이 100) + 버튼 3.
- radius 50% 26회(구 라벨), 8px 8회; shadow 4. 액센트: 남색 `rgb(39,62,176)` 105회 + 파랑 80회 + 초록 26회 + 빨강 경보 1회.
- 안티패턴: 상단 파란 관공서 바 + 흰 로고 바 + 회색 스트립 = 지도 위 **156px 헤더 3층**. 로고 그라디언트.

### 1.10 기상청 날씨누리 — `weather.go.kr/w/index.do` · 도시별관측 〔LIVE〕 `kma-weather-1~3.jpg` `kma-obs-1~2.jpg`
정체: 국가 기상 포털. Pretendard GOV.
- 지도(한반도 분포도, 700×620, 캔버스 85%) 좌 + 우측 **내 지역 카드**(폭 470): `32.8°C` **50px/500** + `체감(32.9°C)` 15px 옆. 그 아래 원형 아이콘 3개(자외선·미세먼지·강수확률) 값 16px/500.
- **관측 시각 스트립** `-12시간 -3시간 -1시간 [현재] +1시간 +3시간` 18px — 시간 오프셋을 절대시각이 아니라 **상대 토큰**으로.
- 도시별관측 표: 12px 352회 — 전국 시군 값을 지도 위 라벨로 직접 찍는다(라벨 그림자 `2px 2px 2px #999` 88회 — 흰 배경 위 검정 글씨의 가독 보조).
- radius 5px 101회, 액센트 파랑 2톤(`rgb(0,154,224)` 29회, `rgb(2,142,221)` 12회) + 노랑 경보.
- 안티패턴: 값 라벨마다 `2px 2px 2px` 하드 그림자 → 확대하면 지저분. 8px 폰트 72회.

### 1.11 토스증권 — `tossinvest.com` · 종목 `stocks/A005930/order` 〔LIVE〕 `toss-securities-1~3.jpg` `toss-stock-1~2.jpg`
정체: 증권 거래 웹. **국내에서 가장 밀도 높은 흰 대시보드**. 바탕 `rgb(251,252,253)` 거의 흰색.
- `1072 | 368` 2컬럼(관심종목 레일이 오른쪽). 종목 헤더: `삼성전자 005930` 14 + **`264,000원` 18px/700** + `어제보다 +7,000원(2.72%)` 빨강 13 + 우측으로 `1일 범위 · 52주 범위(미니 레인지 바) · 거래대금 · 체결강도 · 외국인/기관 순매수` 6쌍 13px 라벨-값 한 줄.
- **패널 = 탭 헤더 + 헤어라인**(`차트 ×` `호가 ×` `일반주문 +`). radius 7px 55회, 8px 27회 — 패널 모서리 8, 그림자 `0 0 0 0.5px inset` 18회(= 헤어라인을 그림자로 그림).
- 등락 색 **글씨만**(빨강 `rgb(222,43,57)` 156회, 파랑 `rgb(34,114,235)` 140회) — 배경 채움 없음. 개인·외국인·기관 수급 **3행 슬라이더 막대**(높이 6).
- 행 30–44px, 900px에 20.5행. 서체 `Toss Product Sans` 13/600이 218회로 **본문 기본이 13px 세미볼드**.
- 하단 상주 티커 `달러 인덱스 98.95 +0.04 · 달러 환율 1,386.7 · 코스피 6,860.24 · 코스닥 824.95` 13px.
- 안티패턴: radius 865회(메인), pill 286회, shadow 140회 — 선행 A9 국내 관례 그대로. 로그인 벽 패널(`호가를 보려면 로그인이 필요해요`)이 첫 화면 한가운데.

### 1.12 국민안전24(행안부) — `safekorea.go.kr` 〔LIVE〕 `safekorea-1~2.jpg`
정체: 재난안전 포털 메인. PretendardGOV.
- `사고속보 | 재난특보` 탭 + 종류 칩(`특보` 빨강 pill, `호우`…) + 제목 + 시각(`2026/08/26 13:50`) 행 40px. `재난 문자` 목록(발송기관 + 본문 2줄 + 시각).
- 제목 31px/600 7회, 24px 8회 — 큰 글씨가 **여러 개**라 위계가 없다.
- 액센트 파랑 `rgb(0,116,229)` 10회 + 빨강 `rgb(217,49,49)` 3회(특보) + 주황 2회(주의).
- 안티패턴: 첫 화면 정중앙 **이벤트 팝업**(장점찾기 EVENT 340×480) — 자동화가 닫지 못했고, 사람도 매번 닫는다(A6). 하단 `빠른메뉴 서비스` 원형 아이콘 7개 — 대시보드가 아니라 포털.

### 1.13 네이버 데이터랩 — `datalab.naver.com` 〔LIVE〕 `naver-datalab-1~3.jpg`
정체: 검색 트렌드 포털. 흰 바탕, 초록 브랜드 바 1줄.
- 첫 화면 = **날짜별 인기검색어 4열 카드**(`2026.08.21(금)` 헤더 14/700, 10행 순위 목록 행 26px). radius **0** 실측(카드가 `1px rgb(212,216,219)` 테두리만, shadow는 `1px 1px 0` 오프셋 그림자 11회 = 실질 헤어라인).
- 액센트 채도색이 **거의 없다**(`rgb(74,143,218)` 2회, 초록 로고 2회) — 흑백 표 + 브랜드색 1줄.
- 안티패턴: 서체 `helvetica`+`나눔고딕`+`굴림` 혼용, 순위 숫자 14px/700 — 차트 0%(첫 화면에 그래프 없음).

### 1.14 Datawrapper River — `river.datawrapper.de` 〔DOC〕 `datawrapper-river-1~3.jpg`
정체: 재사용 가능한 차트 갤러리. 흰 바탕 Roboto, 제목 48px Bitter.
- 카드 `4열 gap48`, radius 4 + `0 1px 4px rgba(0,0,0,.05)` 52회 — 가장 약한 그림자. 액센트 청록 `rgb(0,125,160)` 1색 351회.
- 카드 안 차트 썸네일이 **실제 SVG 렌더**(37% 점유). 참고 가치는 **차트 하나가 카드 하나**(제목 16/500 + 부제 12 + 차트 + 출처 12).
- 안티패턴: 히어로 일러스트(손그림 "Welcome to the River") — A7.

### 1.15 shadcn/ui dashboard-01 — `ui.shadcn.com/examples/dashboard` 〔DOC〕 `shadcn-dash-1~2.jpg`
정체: 가장 많이 복제되는 오픈소스 대시보드 템플릿. Geist.
- 레일 `240` + 본문. KPI 4열: 라벨 14/500 → **값 24px/600** → 델타 칩(`+12.5%` 12px 아웃라인 pill) → 설명 2줄 12px. 그 아래 전폭 영역차트(`Total Visitors`, 1150×260, 회색 1색 그라디언트) + 기간 토글 3개.
- radius 8px 94회, 테두리 `1px lab(90.95)` 57회, shadow 55회(전부 투명 = 0). 액센트 **0**(무채).
- 안티패턴: KPI 4개 균일 카드 + 값 24px — 이것이 "AI가 만든 대시보드" 냄새의 원형(A10).

### 1.16 Vercel Observability — `vercel.com/analytics` 〔MKTG〕 `vercel-analytics-1~3.jpg`
정체: 마케팅 페이지지만 **차트 목업이 실제 DOM/SVG**(선행 조사 §1.6은 문서; 이건 제품 페이지).
- 제목 **64px/GeistSans** `Understand production from the inside out` + 우측 헤어라인 라인차트(라벨 `Visitors 597,717` 14px, 90% 점유).
- 12열 그리드 `94px×12 gap24`(1392). 보조 라벨 `Geist Mono 11px` 68회 — **숫자·시각은 모노스페이스**.
- 액센트: 초록 `rgb(69,165,87)` 40회(정상) + 빨강 16(에러) + 주황 9(경고) — 상태색 3, 브랜드색 0.
- 안티패턴: MKTG. 실제 대시보드는 로그인 벽.

---

## 2. 빌려올 장치 — B안(흰 아틀라스) 규율 통과분

| # | 장치 | 출처(실측) | 우리 대입 |
|---|---|---|---|
| D1 | **KPI 띠 1줄, 카드 아님** — `\|` 헤어라인 분할, 선택 항목만 배경 1단계 | Plausible(1088×64, 6칸) | 첫 화면 상단 띠 1줄, 값은 19→**124px**로 |
| D2 | **값 위 · 2톤 얇은 막대 아래** 비율 KPI | Cloudflare `61.9% \| 38.1%` + 30px 막대, GitHub PR/issue 8px 막대 | 진행률·비율은 이 문법 하나로 통일 |
| D3 | **시점이 가장 큰 숫자** — `7 AM` 28px + 날짜 + `-27 hrs ──●── now` | Observable EIA | 데이터 기준시각 스트립을 KPI급으로 |
| D4 | **재생 ▶ + 레인지 슬라이더** 차트 바로 아래 | OWID(760px, 1770–2023) | 남원 4시점 정사영상 타임라인 |
| D5 | **직접 라벨 + 흐리기** — 선 끝 이름, 미선택은 회색(삭제 아님) | OWID, FT | 범례 박스 금지, dim-not-delete |
| D6 | **출처 줄** `Data source: … \| CC BY` + 다운로드/공유/전체화면 같은 줄 | OWID 13px, Observable 각주 | 모든 패널 하단 provenance 1줄 |
| D7 | **비교 기간 = 점선** | Cloudflare `••• Previous 7 days` | 전년/전시점 비교선 |
| D8 | **표 안의 막대 = 행 배경 부분 채움** | Plausible Top Pages | 목록 수치의 미니 막대 |
| D9 | **등락/상태는 글씨색만, 배경 채움 없음** | TradingView, 토스 | 경보·변화량 표기 |
| D10 | **값이 축을 뚫는 현재가 박스** | TradingView `309.90` 축 라벨 박스 | 차트 최신값 표시 |
| D11 | **상대 시각 토큰** `-12시간 … 현재 … +3시간` | 기상청 | 시계열 스크러버 눈금 |
| D12 | **지도 위 값 = 글자**, 색은 구역 채움만 | 스마트서울뷰 구별 라벨 25개 | 남원 읍면 라벨 |
| D13 | **하단 상주 티커/상태줄** 13px | 토스 하단, TradingView `03:45:20 UTC` | 시스템 상태·기준시각 밴드 |
| D14 | **좌 1 : 우 3 비대칭** 카드 | Observable EIA(680 지도 : 3 얇은 차트) | 지도 큰 칸 + 보조 3칸 |
| D15 | **날짜·시각·날씨·경보 4토큰 스트립** | 스마트서울뷰 48px 헤더 | 첫 화면 상단 컨텍스트 줄 |
| D16 | **숫자·시각은 모노스페이스** | Vercel Geist Mono 11px | 표·축·타임스탬프 |
| D17 | **죽은 데이터는 날짜와 함께 남긴다** | FT "더 이상 갱신되지 않음" 노트 | 시점별 데이터 신선도 표기 |

**반드시 바꿀 것**: radius(shadcn 8·토스 7–8·Cloudflare 6 → **0**), 그림자(Datawrapper `0 1px 4px` → **0**), 균일 N열 KPI 카드(shadcn·Umami → **띠 1줄 + 큰 수 1개**), 헤더 다층(스마트서울뷰 156px → 1줄), 팝업(국민안전24 → 없음).

---

## 3. 안티패턴 요약 (이번 조사분, 선행 A1–A15에 추가)

- **B1 KPI 값이 첫 화면 최대 폰트보다 작다** — Plausible(값 19, 최대 19), Cloudflare(값 20, 제목 24), 토스(값 18). 숫자가 제목보다 작으면 대시보드가 아니라 문서다.
- **B2 균일 N열 KPI 카드** — shadcn 4열, Umami 5열, 네이버 데이터랩 4열. (A10 재확인)
- **B3 헤더 3층** — 스마트서울뷰 156px, OWID 72px에 색 4개.
- **B4 첫 화면 팝업/배너** — 국민안전24 이벤트 팝업, Cloudflare 신기능 배너 64px.
- **B5 10px 이하 축 라벨 남발** — Observable 10px 54회, 기상청 8px 72회, GitHub 8px 14회.
- **B6 칩·pill 폭주** — TradingView radius 1171회, 토스 865회.
- **B7 라벨 그림자로 가독성 때우기** — 기상청 `2px 2px 2px #999` 88회. 답은 헤일로/흰 바탕 상자.
- **B8 흰 크롬 + 색면 지도 100%** — Ventusky. 지도가 화면 전부면 흰 바탕 규율이 무의미해진다.

---

## 4. "첫 화면에서 압도하는 것" Top 5

1. **스마트서울뷰 — 지도 위 구별 실측값 25개 + `30.7℃` 48px** (`seoul-smartview-1.jpg`). 흰 바탕에 도트맵·행정구 채움·값 라벨이 한 화면. 국내 공공 중 유일하게 "지금 이 도시"가 첫 화면에서 읽힌다. 우리와 가장 가까운 골격(좌 340 패널 + 지도).
2. **Observable EIA — `7 AM` 시점 스크러버가 곧 KPI** (`observable-eia-1.jpg`). 세리프 34px 제목, 좌 지도 1 : 우 3 비대칭, 헤어라인 표. 흰 아틀라스에 가장 가까운 완성형.
3. **TradingView 차트 — 캔버스 100%, 값이 축을 뚫는다** (`tradingview-1.jpg`). 흰 바탕에 2색만으로 만든 밀도. 현재가 28px + 색 박스.
4. **OWID Grapher — 툴팁이 표이고, 슬라이더가 재생기다** (`owid-grapher-2.jpg`). 직접 라벨·흐리기·출처 줄·CC BY까지 "설명하는 차트"의 교과서.
5. **Plausible — 카드 없는 KPI 띠 + 단일 액센트** (`plausible-demo-1.jpg`). 형태는 가장 조용한데 정보는 전부 있다. 값 크기만 키우면 그대로 B안이다.

## 5. 첫 화면 표 (1440×900 실측)

| 대상 | 등급 | 차트/이미지 % | 가장 큰 숫자 px | 최대 폰트 px | 카드 수 | radius / shadow 횟수 | 서체 | 액센트(채도≥.45) |
|---|---|---|---|---|---|---|---|---|
| Plausible | LIVE | 30.1 | 19 (304k) | 19 | 3 | 86 / 9(투명) | ui-sans-serif | 0색 |
| Umami | LIVE | 34.4 | **32** (3.17k) | 32 | 8 | 274 / 4 | Inter | 파랑 1 |
| Cloudflare Radar | LIVE | 13.8 | 20 (73.9%) | 24 | 7 | 234 / 0 | system-ui | 오렌지·남색·하늘 3 |
| Observable EIA | LIVE | 43.0 | 28 (7 AM) | 34 | 4 | 6 / 0 | Source Serif + system-ui | 파랑·분홍·청록 |
| Observable 웹로그 | LIVE | 81.8 | 10 | 34 | 1 | 12 / 0 | Source Serif Pro | 파랑·초록 |
| OWID Grapher | LIVE | 30.2 | 14 (79.1) | 25 | 4 | 301 / 3 | Lato + Playfair | 남색·주황 등 6 |
| OWID Explorer | LIVE | 29.8 | 13 | 25 | 6 | 28 / 7 | Lato + Playfair | 남색 |
| FT 코로나 | LIVE | 27.3 | 18 (축) | 24 | 1 | 12 / 0 | MetricWeb + Georgia | 청록 1 |
| GitHub Pulse | LIVE | 4.0 | 16 (5,121) | 20 | 6 | 52 / 3 | Mona Sans | 보라·초록·파랑 |
| GitHub Contributors | LIVE | 25.0 | 12 | 24 | 6 | 50 / 7 | Mona Sans | 파랑 |
| TradingView 차트 | LIVE | 100+ | 28 (309.90) | 28 | 4 | 121 / 0 | -apple-system | 초록·빨강 2 |
| TradingView Markets | LIVE | 58.2 | 16 (7,677.28) | **56** | 0 | 1171 / 26 | -apple-system | 파랑·보라·주황·초록·빨강 |
| 스마트서울뷰 | LIVE | 100+ (지도) | **48** (30.7) | 48 | 5 | 50 / 4 | SUIT | 남색·파랑·초록·빨강 |
| 기상청 날씨누리 | LIVE | 85.3 (지도) | 16 (`32.8°C`는 50px 텍스트) | **50** | 1 | 138 / 73 | Pretendard GOV | 파랑 2톤·노랑 |
| 토스증권 종목 | LIVE | 0 (캔버스 미탐지) | 18 (264,000원) | 18 | 19 | 236 / 55 | Toss Product Sans | 빨강·파랑 2 |
| 국민안전24 | LIVE | 17.4 | 16 | 31 | 6 | 47 / 6 | PretendardGOV | 파랑·빨강·주황 |
| 네이버 데이터랩 | LIVE | 0 | 14 | 24 | 11 | **0** / 13 | helvetica + 나눔고딕 | 거의 0 |
| Datawrapper River | DOC | 37.4 | — | 48 | 5 | 171 / 55 | Roboto + Bitter | 청록 1 |
| shadcn dashboard-01 | DOC | 100 | 24 (1,234) | 48(랜딩) | 8 | 151 / 55(투명) | Geist | 0색 |
| Vercel Observability | MKTG | 89.8 | 14 (597,717) | **64** | 0 | 182 / 18 | GeistSans + Geist Mono | 초록·빨강·주황 |

**표가 말하는 것**: 흰 바탕 LIVE 대시보드 20개 중 **첫 화면 가장 큰 숫자가 32px를 넘는 곳은 스마트서울뷰(48) 하나**뿐이고, 최대 폰트가 큰 곳은 전부 제목(TradingView Markets 56, Vercel 64)이다. 즉 **"124px 숫자 + 흰 바탕 + radius 0"은 이 시장에 선례가 없다** — 베낄 대상이 아니라 우리가 만드는 차별점이다. 골격(D1·D3·D14)과 문법(D2·D5·D6·D9)만 빌린다.

## 6. 파일

- 캡처 `shots/bench/dash2/<slug>-N.jpg`(총 60여 장, gitignore) · 실측 `_measure-<slug>.json` · 콘택트시트 **`shots/bench/dash2/_sheet-design.jpg`**(20칸, `git add -f` 커밋) · 트리아지 `_triage.jpg` `_triage1.jpg` `_triage2.jpg`.
- 하네스 `shots/bench/dash2/_tools/cap2.mjs` `w1.mjs` `w2.mjs` `w3.mjs` `summ2.mjs`.
- 같은 폴더에 다른 조사(지오 이미지리: `earthexplorer` `firms` `gfw` `nullschool` `worldview` `wayback` `zoom-earth` `landsat-explorer` `sentinel2-explorer`)의 캡처가 함께 있다 — 이 문서 범위 밖.
