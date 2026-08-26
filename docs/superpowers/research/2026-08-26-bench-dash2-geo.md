# 벤치 2 — GEO / 위성 / EO-AI 제품 대시보드 (로그인 없이 보이는 실제 UI)

날짜 2026-08-26 · 캡처 `shots/bench/dash2/<slug>-N.jpg` + DOM 실측 `shots/bench/dash2/_measure-<slug>.json`
(shots는 gitignore, 컨택트 시트 `shots/bench/dash2/_sheet-geo.jpg` 만 `git add -f` 로 커밋) ·
하네스 `shots/bench/dash2/_tools/{cap,b1..b5}.mjs` (기존 `dash/_tools/cap.mjs` 재사용, Playwright 1.62, 1440×900, 첫 화면 + 스크롤/호버 1장).

**전제 — 이 조사는 B안(흰 종이 바탕 편집 아틀라스, `design/system.md`)에 부합하는 것만 남긴다.**
흰 `#FFFFFF` 바탕 · 잉크 · 헤어라인 · 라운드 0 · 그림자 0 · 액센트 1색 · 124px 숫자 · 실영상 1급 시민.
다크 셸(콘솔/FUI/네온)은 열어 본 뒤 **한 줄로 "제외 — 다크 셸"** 만 남긴다. 이미 `2026-08-26-bench-geo-admin-dashboards.md`
§0·§7 에 실측된 것(Esri Dashboards, Earthdata, kepler, Copernicus Browser, V-World, UP42/Planet/Cesium/Mapbox 문서)은 반복하지 않는다.

접근 등급: **LIVE** = 실제 제품 UI, 로그인 없이 DOM 실측 · **DOC** = 공식 문서 스크린샷 · **MKTG** = 마케팅 페이지.

---

## 0. 결과 요약

- 시도 46개 URL → **실캡처 42개 대상 / 100장**. 그중 **흰 바탕 + LIVE** 로 가져올 것이 있는 대상 **10개**(§1).
- 죽은 것: Sentinel Hub Dashboard(폐기 모달 — `sentinelhub-dash-1.jpg`), Pachama Explorer(→ Carbon Direct 마케팅으로 리다이렉트), Descartes Labs·Orbital Insight(인수로 소멸, 시도 안 함), Kontur Disaster Ninja(`disaster.ninja`·`lima.kontur.io`·`atlas.kontur.io` 전부 SSL/타임아웃), 카카오 데이터랩(도메인 없음), 국가공간정보포털(NXDOMAIN), KARI AIRS(타임아웃), KARI NSIC(Oops ERROR 페이지 `kari-nsic` 실패), 국토정보플랫폼 지도(`map.ngii.go.kr/ms/map/NlipMap.do` — 좌측 레일만 뜨고 지도 캔버스 회색, `ngii-platform-1..4.jpg`).
- 로그인 벽(한 번 시도 후 스킵): Picterra, Mapflow, Satellogic Aleph, Umbra Canopy, Planet Explorer(이전 조사 M), UP42(이전 조사 D).
- **제외 — 다크 셸**(한 줄씩, §3): NASA Worldview, Windy, Ventusky, Zoom Earth, earth.nullschool, NASA FIRMS, Esri Landsat/Sentinel-2 Explorer, Esri Wayback, EOS LandViewer, DEA Maps, Felt 공개맵(Kontur Population), Umbra Open Data.
- **제외 — 마케팅 다크 히어로**: Blackshark, Synspective, Ursa, Hydrosat, Overstory, Regrow, Climate X, Picterra, Satellogic. 가져올 것 없음.

---

# §1. 가져올 것이 있는 대상 (흰 바탕, LIVE)

## 1.1 SkyFi Explore — `app.skyfi.com/explore` 〔**LIVE**, 로그인 없이 Open 탭·AOI 검색까지 동작〕 ★

**무엇**: 상업/오픈 위성영상 마켓플레이스의 탐색 화면. 좌 66px 검정 아이콘 레일 + **440px 흰 패널** + 구글 위성 지도.
"Open" 탭 → AOI 그리기 → "SEARCH THIS AREA" 까지 비로그인으로 진행되고, 결과 카드가 실데이터(Sentinel-2/1, 2026-08-18~21)로 채워진다.
캡처 `skyfi-1.jpg`(초기) `skyfi-3/4.jpg`(Open 탭) **`skyfi-5.jpg`(검색 결과 카드 목록 — 이 조사 최고의 한 장)**.

**실측** (`_measure-skyfi.json`, 초기 상태): 본문 Inter, 첫 화면 폰트 12/14/16/18px **최대 18px**. 바탕 `#FFFFFF` ×9, `#F5F5F5` ×3.
잉크 `rgb(9,9,11)` ×121, 보조 `rgb(161,161,170)` ×50. radius 2/4/6/8px 혼재(우리는 0). 그림자 2개(카드 호버). 헤어라인 `#E4E4E7` 1px. 행 높이 중앙값 41px.

**훔칠 장치**
1. **영상 카드 = 썸네일 96×96 + 4행 메타(센서 · 날짜+UTC 칩 · GSD(등급) · 운량%) + 하단 "Intersection: 25.00 km² ($0.00/km²)" + 가격 버튼.** 한 카드 168px 높이에 판단에 필요한 다섯 숫자가 전부 있고 라벨은 아이콘으로 대체. 우리 "데이터 관리" 영상 카드의 골격 그대로.
2. **지도 위 AOI 라벨 "25km² · 258 images available"** — AOI 사각형 상단 좌측에 면적(주황)과 건수(흰)를 검정 반투명 칩으로 붙인다. 면적과 건수만 지도에 올리고 나머지는 패널로 보낸다.
3. **탭 3개(Commercial / Open / Basemaps) 아래 카운트 줄 "258 Images already captured"** — 탭 아래 첫 줄은 항상 결과 수 + 정렬/필터 아이콘. 우리 원장 헤더 규약으로 채택.
4. **운량 %를 숫자 + 해 아이콘**으로만 표기(16% ☼, 3% ☼) — 색으로 좋고 나쁨을 안 나눈다. dim-not-delete 원칙과 맞는다.
5. **날짜 옆 `UTC` 미니칩**(12px/700 테두리 칩) — 기준시각 표기를 칩으로 박는 관례. 우리 HUD 숫자 "단위·기준시점 필수" 규칙의 실물.

**안티패턴**: 카드마다 검정 `$0.00` 버튼이 반복되어 무료 데이터인데도 장바구니 UI가 시각적 1순위를 차지한다(버튼 4개 = 카드 4개). 우리는 가격이 없으니 이 자리에 "결과 있음/준비 중" 상태를 놓는다.

## 1.2 OpenAerialMap — `map.openaerialmap.org` 〔**LIVE**〕 ★

**무엇**: 오픈 드론/위성 영상 카탈로그. **흰 480px 좌 패널 + 회색 벡터 지도(`#D1D7D9`)**. 캡처 `openaerialmap-1.jpg` `oam-item-1/2.jpg`.

**실측** (`_measure-openaerialmap.json`): Yantramanav 14px/400 ×40(날짜·GSD 줄), 13px/500 제목, 최대 25px(줌 버튼). 첫 화면 이미지 35%.
바탕 회색 `#D1D7D9` ×12 · 흰 ×7. 잉크 `rgba(0,0,0,.75)` ×510, 딥틸 `#203C46` ×108, 링크 청록 `#449BB5` ×42. radius 2px. 그림자 `0 0 6px rgba(0,0,0,.09)` ×20(카드). 행 높이 48px.

**훔칠 장치**
1. **"Latest uploads" 2열 카드 — 제목 1줄 / `2026-08-24 / 5 cm` / 업로더 밑줄 / 실영상 풋프린트 썸네일(회색 바탕 위 잘린 정사영상 모양 그대로)**. 썸네일이 직사각형이 아니라 **실제 촬영 폴리곤 형태**라 "이건 실영상"이 즉시 읽힌다. 우리 남원 4시점 정사영상·드론 자산의 썸네일을 이렇게 폴리곤 실루엣으로 낸다.
2. **날짜 / GSD 를 한 줄에 슬래시로**(`2026-08-21 / 53 cm`) — 라벨 없이 두 숫자만. 12~13px.
3. **무채색 지도 위에 영상 풋프린트만 색을 가진다** — 바탕 지도가 `#D1D7D9` 회색이라 실영상이 유일한 채도. B안의 "실영상 1급 시민"을 지도 톤으로 보장하는 방법.
4. 패널 상단 4줄 소개문(18px)이 로그인 없이도 사용 목적을 설명 — 우리 "데이터 관리" 첫 탭 상단에 같은 자리.

**안티패턴**: 쿠키 배너가 하단 170px을 검정으로 덮어 첫 화면의 19%를 잃는다(`openaerialmap-1.jpg`). 우리 화면에 하단 고정 배너 금지.

## 1.3 STAC Browser / Earth Search (Element 84) — `radiantearth.github.io/stac-browser` 〔**LIVE**〕 ★

**무엇**: STAC 카탈로그 범용 브라우저. Sentinel-2 L2A 컬렉션 페이지. 캡처 `stac-browser-1.jpg`(첫 화면) `stac-browser-2.jpg`(스크롤).

**실측** (`_measure-stac-browser.json`): system-ui. 12px/700 칩 ×128(!), 16px/400 본문 ×123, H1 29px, 섹션 제목 26px ×3. 첫 화면 이미지 47%.
흰 ×111, 회색 `#6C757D` 칩, 액센트 청록 `#188191` ×37(버튼·링크 단일 액센트). 헤어라인 `#DEE2E6` 1px ×19. radius 6px ×154(Bootstrap — 우리는 0). 그림자 사실상 0.

**훔칠 장치**
1. **`Items` 제목 옆 회색 카운트 칩 `50933904`** — 제목 26px + 12px/700 숫자 칩. 목록 크기를 제목에 붙이는 최소 형식.
2. **좌 = 메타(설명·라이선스·Temporal Extent `2015-06-27 10:25:31 UTC until present`·풋프린트 미니맵 696×352·Providers 표) / 우 = 아이템 타일**. 컬럼 2개, 좌 48% 우 48%. 우리 `EVIDENCE-PAIR` 그대로.
3. **Providers 표: 이름(링크) + 우측 역할 칩(PRODUCER / PROCESSOR / HOST)** — 헤어라인 행 40px. 출처(provenance) 표의 정답 조판.
4. **아이템 타일 = 실영상 썸네일(검정 여백 포함) + ID 링크 + 포맷 칩(COG / JPEG 2000) + 시각 `2026-08-26 0:52:24 UTC`** — 썸네일에 검정 널 영역을 감추지 않는다(스와스 가장자리 그대로). 우리 결손 표기 "점선 무채 + 이유" 와 같은 정직성.
5. 페이지네이션 `« First ‹ Previous Next ›` 를 목록 **위**에 둔다.

**안티패턴**: Bootstrap 기본 radius 6px가 154회 — 칩·카드·버튼이 전부 둥글어 카탈로그가 "관리자 템플릿"으로 읽힌다.

## 1.4 Google Earth Timelapse — `earthengine.google.com/timelapse` 〔**LIVE**〕

**무엇**: 1984→현재 연도 스크럽 영상. **흰 340px 좌 레일 + 전면 위성 영상**. 캡처 `gee-timelapse-1..4.jpg`.

**실측** (`_measure-gee-timelapse.json`, iframe이라 셸만 측정): Google Sans 14px ×21, 18px ×2, 배너 `#DFF3FF`. radius 0, 그림자 1(헤더). 행 59px.

**훔칠 장치**
1. **"Timelapses around the world" 목록 = 썸네일 60×60 + 제목 13px + 지명 11px, 선택 행만 연한 파랑 바탕** — 선택 상태를 색 채움 하나로. 앰버/액센트 없이.
2. **하단 연도 스트립 `‹ 2020 2021 2022 · 1984 1985 1986 1987 ›` + 현재 연도만 파랑 칩 + 재생 ▶ + 속도 `0.5×`** — 시간축을 숫자 나열로 두고 현재만 칩. 우리 XI맵 타임라인의 골격.
3. **"NOW VIEWING · Columbia Glacier Retreat" 검정 토스트**가 영상 위 하단 중앙에 — 무엇을 보고 있는지 한 줄.

**안티패턴**: 좌 레일 안에 소개문·목록이 iframe으로 들어가 스크롤이 이중이 된다.

## 1.5 Global Nature Watch (구 Global Forest Watch) — `globalforestwatch.org/map` 〔**LIVE**〕

**무엇**: 산림 변화 모니터링 지도. 76px 회색 레일 + **흰 340px 레이어 패널** + 지도 100%. 캡처 `gfw-1.jpg`(레전드) `gfw-2.jpg`(Analysis 탭). 첫 캡처 때는 환영 모달(`gfw-1` 1차, 재캡처로 제거).

**실측** (`_measure-gfw.json`): Fira Sans 12px ×18, 14px ×9, 11px/−0.2px ×8. **첫 화면 최대 16px** — 대시보드형 지도 UI 중 가장 작은 최대치. 이미지 79%.
흰 ×21, 레일 `#F2F2F2` 76px. 잉크 `#555` ×233. 헤어라인 `#E5E5DF` 1px ×4. radius 6px ×7, 20px ×3(토글). 그림자 3개(패널).

**훔칠 장치**
1. **레이어 항목 = 제목(14px) · 부제(12px) · 컬러 스와치 원 8px · 연도 슬라이더(2000–2020 눈금 라벨 11px)** — 한 레이어가 60px 안에 시간 범위까지 갖는다.
2. **LEGEND / ANALYSIS 2탭 고정** — 같은 패널이 "보기"와 "재기"를 오간다. 우리 XI맵 우측 패널 규약으로.
3. **탭 상단 연두 공지 밴드(`#F7F9E6`, 12px)** — 이름 변경 안내를 지도 위가 아니라 헤더 아래 밴드로. 시스템 공지 자리.
4. 하단 좌 "GOOGLE SATELLITE IMAGERY (GLOBAL)" 베이스맵 셀렉터가 **검정 칩**으로 유일한 검정 — 바탕 출처 표기.

**안티패턴**: 첫 진입 시 3카드 환영 모달이 지도 전체를 덮는다(`gfw` 1차 캡처). 진입 모달 금지.

## 1.6 Microsoft Planetary Computer Explorer — `planetarycomputer.microsoft.com/explore` 〔**LIVE**〕

**무엇**: STAC 기반 데이터셋 탐색. **흰 400px 좌 패널 + 회백색 지도(Esri light gray)**. 캡처 `planetary-computer-1/2.jpg`.

**실측** (`_measure-planetary-computer.json`): Segoe UI 11–14px, 최대 24px(H). 이미지 64%. 흰 ×18, `#F3F2F1` ×2. 잉크 `#323130` ×75, 액센트 파랑 `#0078D4` ×23 하나. 헤어라인 `#EDEBE9`/`#E1DFDD`. radius 2px ×9. 그림자 `0 0 4px rgba(0,0,0,.16)` ×15. 행 32px(가장 촘촘).

**훔칠 장치**
1. **빈 상태 3단 셀렉트 "Select a dataset to visualize / Select a preset filter / Select a rendering option"** — 데이터 없을 때 패널이 절차를 순서대로 보여준다. 우리 "준비 중" 서비스의 빈 상태 형식.
2. 지도가 **회백 단색**이라 데이터가 올라오기 전엔 아무 채도도 없다 — B안 90/8/2 색 분량의 지도판 실물.
3. 헤더 아래 **연두 공지 1줄(`#DFF6DD`, 12px)** — GNW와 같은 자리.

**안티패턴**: 카드 15개에 전부 `0 0 4px` 그림자 — 흰 위에 흰 카드를 그림자로 구분한다. 우리는 헤어라인으로 대체.

## 1.7 서울 열린데이터광장 — 서울 생활인구 대시보드 `data.seoul.go.kr/dataVisual/seoul/seoulLivingPopulation.do` 〔**LIVE**〕 ★(숫자 조판)

**무엇**: 서울시 공공 통계 대시보드. 캡처 `seoul-dash-1.jpg`(첫 화면) `seoul-dash-2.jpg`(막대). 포털 홈 `seoul-data-1/2.jpg`.

**실측** (`_measure-seoul-dash.json`): Noto Sans KR. **첫 화면 최대 72px(`11,393`) + 40px ×3(원 안 숫자)** — 이 조사 전체에서 제품 화면 최대 숫자. 15px/400 본문 ×24, 14px/700 라벨 ×18, 자간 −0.525px.
흰 ×39, 연파랑 `#F2F5FB` ×8. 헤어라인 `#CAD0DD` 1px ×34. 이미지 7%.

**훔칠 장치**
1. **"일일평균 생활인구 11,393천명" — 라벨 24px 위, 숫자 72px, 단위 `천명` 24px 베이스라인 정렬** — 우리 124px 통계 밴드의 국내 실물. 단위 크기 = 숫자의 1/3.
2. **제목 옆 `(2026.08.21. 기준)` 헤어라인 칩** — 기준시점을 제목 줄에 칩으로. HUD 규칙 그대로.
3. **큰 숫자 = 부분합 3개(10,917 + 331 + 145)** 를 `»` 와 `+` 로 이어 한 줄에 — 총계와 구성의 등식이 첫 화면에 있다.
4. 섹션 제목(20px/600) 아래 **1px 헤어라인 전폭** — 제목·본문 분리를 선 하나로.

**안티패턴**: 붉은 원 3개(`#E35E61`) + 막대 6색 — 데이터색이 6개. 우리는 액센트 1색 + 회색.

## 1.8 네이버 데이터랩 — `datalab.naver.com` 〔**LIVE**〕

**무엇**: 검색어 트렌드·쇼핑인사이트. 캡처 `naver-datalab-1..3.jpg`, `naver-datalab-trend-*.jpg`.

**실측** (`_measure-naver-datalab.json`): 첫 화면 **최대 24px**, 22px/700 날짜 헤더 ×13, 14px 순위·항목 ×223. 이미지 0%. 흰 ×36. 헤어라인 `#D4D8DB` ×22, `#C3CBD7` ×11. radius 0. 그림자 `1px 1px 0 #D6DBE1`(카드 오른쪽·아래 1px 선 = 사실상 헤어라인). 행 72px.

**훔칠 장치**
1. **날짜별 Top-10 열 4개 나란히(`2026.08.21.(금)` 22px/700 위, 아래 순위 번호 helvetica 14px/700 + 항목 나눔고딕 14px)** — 숫자 서체와 한글 서체를 분리. 우리 Inter tabular + Pretendard 분리 규칙의 선례.
2. radius 0 · 그림자 0(1px 오프셋 선) · 액센트 = 로고 초록 1색 — B안 규율과 가장 가까운 국내 대형 서비스.
3. 카드 사이 간격 16px, 카드 폭 (1440−2×112)/4.

**안티패턴**: 순위 목록만 있고 숫자(검색량)가 없다 — 이름만 나열하는 목록.

## 1.9 공공데이터포털 공공데이터맵 — `data.go.kr/tcs/opd/ndm/view.do` 〔**LIVE**〕

**무엇**: 95,147건 데이터셋 분류 트리맵. 캡처 `datago-viz-1/2.jpg`. 포털 홈(AI 검색) `datago-1/2.jpg`.

**실측** (`_measure-datago-viz.json`): Pretendard GOV 17px/400 ×34, 16px/700 ×18, 19px/700 ×5, 제목 40px. 잉크 `#1E2124` ×229 단일. 그림자 0. radius 6px ×11. 좌 248px 분류 레일.

**훔칠 장치**
1. **`전체 총 건수: 95,147`** 를 트리맵 좌상단에 15px 굵게 — 총계 한 줄이 시각화의 제목 역할.
2. 좌 248px 분류 목록 + 우 트리맵 1080×900(75%×100%) — `LEDGER` 비율(248:1080 ≈ 1:4.4).
3. 잉크 색 하나(`#1E2124`)로 모든 텍스트 — 색으로 위계를 만들지 않는다.

**안티패턴**: 트리맵 셀 4색 그라디언트(보라·빨강·주황·주황) — 범주색이 의미 없이 다르다.

## 1.10 SGIS 대화형 통계지도 — `sgis.kostat.go.kr/view/map/interactiveMap` 〔**LIVE**〕

**무엇**: 통계청 지도. 캡처 `sgis-map-1/2.jpg`, 홈 `sgis-home-1/2.jpg`.

**실측** (`_measure-sgis-map.json`): 11px ×59, 12px ×54, 13px ×31 — **첫 화면 최대 16px**, 노드 654개(가장 밀도 높음). 흰 220px 좌 레일 ×2, 지도 100%×81%. 헤어라인 `#CCC`/`#DCDCDC`. radius 50% ×50(원형 버튼) 15px ×27(칩). 행 31px.

**훔칠 장치**
1. **좌하단 색 범례 = 7단 계급 + 각 단 인구수 숫자(`8,059명 …`)** — 범례가 색이 아니라 숫자로 읽힌다.
2. 상단 헤어라인 툴바 1줄에 통계 선택·지역 검색·실행이 전부(48px).

**안티패턴**: 원형 버튼 50개 + 시안 `#00BCD4` 19회 + 파랑 `#1778CC` 9회 — 액센트 2색·둥근 버튼 남용.

---

# §2. 가져올 것이 적은 흰 바탕 대상 (짧게)

- **Dynamic World** (`gee-dynamicworld-1/2.jpg`, LIVE): 흰 헤더 + 9색 범례 원 + Earth Engine App iframe. 헤드라인 35px/400 Quicksand, 본문 25px. 가져올 것: 범례를 **색 원 9개 + 이름 없이** 상단 우측에 두는 과감함 — 우리는 안 씀(색 9개).
- **USGS EarthExplorer** (`earthexplorer-1/2.jpg`, LIVE): 흰 좌 380px 폼 + 지도 69%×81%. 12px Arial 밀도. 가져올 것: **"1. Enter Search Criteria → Data Sets → Additional Criteria → Results" 탭 4단을 절차 번호로** — 파이프라인 탭의 원형. 안티: 2004년식 파란 그라디언트 버튼.
- **Felt Map Gallery** (`felt-gallery-1/2.jpg`, MKTG): 흰 바탕 + 2열 지도 카드(482×418, radius 6, 헤어라인 `rgba(0,0,0,.15)`) + 우측 카테고리 목록 18px/400. 헤드라인 세리프 50px. 가져올 것: **카드 안이 실제 지도 스크린샷 그대로**(레전드·패널 포함) — 지도 제품 갤러리는 UI째 보여준다.
- **Overture Explorer** (`overture-explore-1/2.jpg`, LIVE): 흰 헤더 + 라이트/다크 스와이프 지도. 가져올 것: **스와이프 핸들 = 4px 잉크 세로선 + 원**. 나머지 없음.
- **Source Cooperative** (`source-coop-1/2.jpg`, MKTG): 회백 바탕 `#E5E3E4`, Berkeley Mono 66px 헤드라인, 하프톤 지구. 가져올 것: **데이터 제품 카드 = 모노스페이스 13px 제목 + "Provided by …" 13px** 2줄 규격. 안티: 초록 글로우 그림자.
- **GEE Case Studies** (`gee-apps-1/2.jpg`, MKTG): 흰 바탕 히어로 + 2열. 앱 갤러리 자체는 `google.earthengine.app/view/*` 개별 앱 URL이 필요하고 `global-forest-change` 는 404("Invalid trajectory!", `gee-app-forest-1.jpg`).

---

# §3. 제외 — 다크 셸 (한 줄씩, 캡처만 보관)

| 대상 | 파일 | 한 줄 |
|---|---|---|
| NASA Worldview | `worldview-1/2.jpg` | 제외 — 다크 셸. 다만 하단 **날짜 스트립(월 눈금 + `2026 AUG 25` 36px + 1 DAY 스텝)** 은 시간축 참고. 최대 36px, 이미지 400%(캔버스 4겹). |
| Windy | `windy-1/2.jpg` | 제외 — 다크 셸 + 14px radius ×14 + 노랑 프리미엄. 온도 67px 표기 하나만 참고. |
| Ventusky | `ventusky-1/2.jpg` | 제외 — 다크 셸. |
| Zoom Earth | `zoom-earth-1/2.jpg` | 제외 — 다크 셸. |
| earth.nullschool | `nullschool-1/2.jpg` | 제외 — 다크 셸(검정 + 네온 유선). |
| NASA FIRMS | `firms-1/2.jpg` | 제외 — 다크 셸 + 붉은 면책 모달. |
| Esri Landsat / Sentinel-2 Explorer | `landsat-explorer-*`, `sentinel2-explorer-*` | 제외 — 다크 셸. 하단 **"Interesting Places" 썸네일 그리드 + Renderer 스와치** 만 참고. |
| Esri Wayback | `wayback-1/2.jpg` | 제외 — 다크 레일. 좌측 **버전 날짜 목록(`2026-08-05`, "Only versions with local changes" 체크)** 은 시점 원장의 참고. |
| EOS LandViewer | `landviewer-1/2.jpg` | 제외 — 다크 온보딩 모달(6카드 용도 선택). |
| DEA Maps (TerriaJS) | `dea-maps-1/2.jpg` | 제외 — 다크 셸(Cesium). |
| Felt 공개맵 Kontur Population | `felt-map-1/2.jpg` | 제외 — 다크 베이스맵. 좌상단 **범례 계급 9단 숫자** 는 SGIS와 같은 장치. |
| Umbra Open Data | `umbra-open-1/2.jpg` | 제외 — 검정 SAR 히어로 마케팅. |

---

# §4. 첫 화면 실측 표 (1440×900, `_measure-*.json`의 `fold`)

| 대상 | 등급 | 바탕 | 첫 화면 이미지 % | 최대 글자 px(무엇) | 카드/행 수(첫 화면) | 행 높이 중앙값 | radius | 그림자 | 액센트 |
|---|---|---|---|---|---|---|---|---|---|
| SkyFi Explore | LIVE | 흰 패널 + 위성지도 | 50.6 | 18 (패널 제목) | 카드 4(결과) | 41 | 2–8px | 2 | 검정 버튼 / 주황 면적 |
| OpenAerialMap | LIVE | 흰 + 회색 지도 | 35.3 | 25 (줌 `+`) | 카드 4(2열) | 48 | 2px | 20 | 청록 `#449BB5` |
| STAC Browser | LIVE | 흰 | 47.1 | 29 (H1) | 타일 2 + 표 4행 | 40 | 6px ×154 | 0 | 청록 `#188191` |
| GEE Timelapse | LIVE | 흰 레일 + 영상 | (iframe) | 18 | 목록 4 | 59 | 0 | 1 | 파랑 `#3B78E7` |
| Global Nature Watch | LIVE | 흰 패널 + 지도 | 79.1 | 16 | 레이어 4 | 43 | 6px | 3 | 연두 `#97BE32` |
| Planetary Computer | LIVE | 흰 + 회백 지도 | 64.0 | 24 | 셀렉트 3 | 32 | 2px | 15 | 파랑 `#0078D4` |
| 서울 생활인구 | LIVE | 흰 | 7.4 | **72** (`11,393`) | 숫자 4 + 막대 6 | 57 | 4px | 4 | 빨강 `#E35E61` |
| 네이버 데이터랩 | LIVE | 흰 | 0 | 24 | 열 4 × 10행 | 72 | 0 | 0(1px 선) | 초록 |
| 공공데이터맵 | LIVE | 흰 | 75.0 | 40 (제목) | 셀 ~12 | 44 | 6px | 0 | 4색 셀 |
| SGIS 대화형지도 | LIVE | 흰 레일 + 지도 | 50.6 | 16 | 레전드 7단 | 31 | 50%/15px | 4 | 시안+파랑 |
| USGS EarthExplorer | LIVE | 흰 + 지도 | 94.8 | 22 | 폼 1 | 50 | 2px | 8 | 남색 |
| Felt Gallery | MKTG | 흰 | 72.9 | 50 | 카드 2열 | 36 | 6px | 0 | 주황 |
| (참고) Worldview | LIVE 다크 | 검정 | 400 | 36 | — | 43 | 6px | 0 | 파랑 |
| (참고) Windy | LIVE 다크 | 검정 | 100 | 67 | — | 55 | 14–33px | 18 | 노랑 |

읽기: **흰 바탕 지도 제품은 첫 화면 최대 글자가 16–29px** 로 작고(밀도형), **숫자를 크게 쓰는 것은 서울 생활인구(72px) 하나뿐**이다. 우리 B안의 124px 통계 밴드는 이 표 어디에도 없는 자리 — 차별점이자, 서울 생활인구의 "라벨 위·단위 1/3" 조판을 참고해 채운다.

---

# §5. "첫 화면에서 압도하는 것" Top 5 (B안 기준)

1. **SkyFi — 실영상 카드 4장이 실데이터로 채워진 흰 패널**(`skyfi-5.jpg`). 카드 168px 안에 센서·날짜UTC·GSD·운량·면적 5숫자 + 지도 위 `25km² · 258 images` 칩. 영상이 상품이라는 것을 첫 화면이 증명한다. → 우리 "데이터 관리" 카드 규격 + XI맵 AOI 라벨.
2. **서울 생활인구 — `11,393천명` 72px + 부분합 등식**(`seoul-dash-1.jpg`). 국내 공공 대시보드 중 유일하게 숫자가 화면을 지배. 기준시점 칩 `(2026.08.21. 기준)`. → 우리 대시보드 상단 큰 숫자 밴드의 조판 근거.
3. **OpenAerialMap — 회색 지도 위 폴리곤 실루엣 썸네일**(`openaerialmap-1.jpg`). 바탕에 채도가 없어 실영상만 색을 가진다. `날짜 / GSD` 한 줄. → 우리 영상 썸네일은 폴리곤 실루엣으로, 지도는 무채로.
4. **STAC Browser — 좌 메타·우 타일의 EVIDENCE-PAIR + Providers 표 + 카운트 칩**(`stac-browser-1.jpg`). 출처·기간·라이선스·풋프린트 미니맵이 한 화면. → 우리 출처(provenance) 패널과 결과 카운트 칩.
5. **Google Earth Timelapse — 흰 레일 썸네일 목록 + 하단 연도 스트립**(`gee-timelapse-1.jpg`). 선택 행 연파랑 1색, 현재 연도만 칩. → 우리 XI맵 타임라인 + 시점 목록.

차점: Global Nature Watch(레이어 = 제목·부제·스와치·연도 슬라이더 60px, 최대 16px 밀도), Planetary Computer(빈 상태 3단 절차, 회백 지도).

---

# §6. 우리 B안으로 옮길 때의 규칙 (이 조사에서 확정)

- **영상 카드 규격**: 썸네일 96px 정사각(폴리곤 실루엣, 회색 바탕) · 제목 14px · `YYYY-MM-DD HH:MM UTC` 12px + 칩 · `GSD / 운량%` 한 줄 · 하단 헤어라인 위 `교차 면적 km²`. 버튼 없음. (SkyFi + OAM)
- **원장 헤더**: 탭 아래 첫 줄 = `N건` 12px 굵게 + 정렬·필터 아이콘. 제목 옆 회색 카운트 칩. (SkyFi + STAC)
- **큰 숫자 밴드**: 라벨 위 · 숫자 124px Inter tabular · 단위 = 숫자의 1/3 크기 베이스라인 정렬 · 제목 줄에 `(기준 YYYY.MM.DD)` 헤어라인 칩 · 총계 = 부분합 등식. (서울 생활인구)
- **시간축**: 연도/일자 숫자 나열 + 현재만 액센트 칩 + 스텝 버튼. 지도 위 "NOW VIEWING" 검정 토스트 1줄. (Timelapse + Worldview 스트립)
- **출처 표**: 이름(링크) + 우측 역할 칩, 헤어라인 행 40px. Temporal Extent 는 `시작 UTC until present` 문장형. (STAC)
- **빈 상태**: 절차 3단 셀렉트를 순서대로 보여주는 패널. 모달 금지, 하단 고정 배너 금지. (Planetary Computer / 안티: GNW·OAM)
- **지도 바탕**: 회백 단색(`#D1D7D9` 급). 실영상·AI 폴리곤만 채도. (OAM + Planetary Computer)
- **안 가져오는 것**: radius(2–8px 전부), 카드 그림자(OAM 20개·PC 15개), 데이터 다색(서울 6색·공공데이터맵 4색·SGIS 2액센트), 가격 버튼 반복, 진입 모달.

---

# §7. 캡처 색인 (`shots/bench/dash2/`)

| slug | 장수 | 등급 | URL |
|---|---|---|---|
| `skyfi` | 5 | LIVE | `app.skyfi.com/explore` |
| `openaerialmap` `oam-item` | 4 | LIVE | `map.openaerialmap.org` |
| `stac-browser` | 2 | LIVE | `radiantearth.github.io/stac-browser/#/external/earth-search.aws.element84.com/v1/collections/sentinel-2-l2a` |
| `gee-timelapse` | 4 | LIVE | `earthengine.google.com/timelapse/` |
| `gfw` | 2 | LIVE | `globalforestwatch.org/map/` |
| `planetary-computer` | 2 | LIVE | `planetarycomputer.microsoft.com/explore` |
| `seoul-dash` `seoul-data` | 4 | LIVE | `data.seoul.go.kr/dataVisual/seoul/seoulLivingPopulation.do` |
| `naver-datalab` | 3 | LIVE | `datalab.naver.com` |
| `datago-viz` `datago` | 4 | LIVE | `data.go.kr/tcs/opd/ndm/view.do` |
| `sgis-map` `sgis-home` | 4 | LIVE | `sgis.kostat.go.kr/view/map/interactiveMap` |
| `earthexplorer` | 2 | LIVE | `earthexplorer.usgs.gov` |
| `gee-dynamicworld` `gee-apps` `gee-app-forest` | 6 | LIVE/MKTG/404 | `dynamicworld.app/explore`, `earthengine.google.com/case_studies`, `google.earthengine.app/view/global-forest-change` |
| `felt-gallery` `felt-map` | 4 | MKTG/LIVE | `felt.com/gallery`, `felt.com/map/Kontur-Population-…` |
| `overture-explore` `source-coop` | 4 | LIVE/MKTG | `explore.overturemaps.org`, `source.coop` |
| 다크 제외 | `worldview` `windy` `ventusky` `zoom-earth` `nullschool` `firms` `landsat-explorer` `sentinel2-explorer` `wayback` `landviewer` `dea-maps` `umbra-open` (각 2) | LIVE | §3 |
| 마케팅 제외 | `blackshark` `synspective` `ursa` `hydrosat` `overstory` `regrow` `climatex` `picterra` `mapflow` `satellogic` `pachama`(→Carbon Direct) (각 2) | MKTG | — |
| 죽음/오류 | `sentinelhub-dash`(폐기 모달) `ngii-platform`(회색 캔버스) `ngii-main` `kari-sat` `ksat-open` `egis` | — | — |

컨택트 시트 `_sheet-geo.jpg`: 4열 × 6행, 앞 16칸 = 흰 바탕 대상(순서: skyfi-5, skyfi-1, openaerialmap, stac-browser, gee-timelapse, gfw, planetary-computer, seoul-dash, naver-datalab, datago-viz, sgis-map, earthexplorer, gee-dynamicworld, felt-gallery, overture-explore, source-coop), 뒤 8칸 = 다크 제외(worldview, windy, ventusky, zoom-earth, nullschool, landsat-explorer, wayback, landviewer).
