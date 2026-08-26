# 대시보드 벤치 2차 — 갤러리 큐레이션 (흰 바탕 B안 전용)

2026-08-26 · 캡처 `shots/bench/dash2/` (실측 JSON `_measure-gal-*.json`, 갤러리 시트 `_sheet-gallery.jpg`)
전제: 클라이언트 지시 그대로 — **B안 흰 종이 아틀라스**(`#FFFFFF` 바탕 · 잉크 · 헤어라인 · 라운드 0 · 그림자 0 · 액센트 `#006DF7` 하나 · 124px 숫자 · 실제 영상이 1급 시민)에 **부합하는 것만** 담는다.
1차 조사(`2026-08-26-bench-geo-admin-dashboards.md`)가 제품 실물의 조판을 실측했다면, 이번은 **디자인 커뮤니티/어워드가 "좋다"고 고른 것 가운데 흰 바탕인 것**을 골라 골격별로 묶는다.

---

## 0. 방법과 정직 기록

| 출처 | 접근 | 결과 |
|---|---|---|
| Dribbble 검색(popular) 12 쿼리 | 헤드리스 OK(쿠키 배너 처리) | 367 샷 인덱싱(`_drib-index.json`) → 썸네일 시트 육안 1차 → 20 후보 원본 렌더 → **15 채택** |
| Behance 검색 | **403** — 헤드리스 차단, 그리드 빈 채로 렌더 | 0 (거짓 목록을 만들지 않았다) |
| Awwwards `data-visualization` 카테고리 31건 + inspiration 31건 | 목록은 WebFetch, 라이브 사이트는 Playwright | 9 캡처 → **2 채택**(나머지 7은 어두운 바탕) |
| SaaSFrame / Land-book / Siteinspire | 렌더 OK | 전부 범용 SaaS(좌측 레일+카드) 또는 검색 필터 무시 → 0 채택 |
| 라이브 지오·데이터 사이트(직접 지정) | Playwright, `cap.mjs` 재사용 | 23 캡처 → **11 채택** |

캡처 규격 1440×900 · 흰 배경 1440 폭에 원본을 깔아 렌더(드리블은 원본 800~5600px, 파일마다 원본 해상도 기록).
**드리블 목업의 수치는 화상 추정(±10%)**, 라이브 사이트는 DOM 실측.

**거부 집계(캡처 낭비 없이 시트에서 걸러낸 것)**: 드리블 367 중 어두운/네온/글래스/FUI **≈ 140**, 흰 바탕이지만 "좌측 레일 + 균일 카드" 범용 SaaS **≈ 170**(1차 §4-A10 그대로), 무관(브랜딩·모바일·일러스트) ≈ 40. Awwwards 데이터비주얼 31 중 어두운 바탕 **7/9 캡처**(1000 Whales, Everest, Subdivisions, WC26 Portraits, Consider Story, Obama Oral History 크림+검정). 라이브 12 거부: Overture·FIRMS·Sentinel Explorer(어두움), GSW Explorer(파랑 3색), OpenAQ(청록 바닥), Felt(로그인), Reuters(봇 차단), Mercury·Wise(범용 SaaS), Pudding(일러스트 카드), Ember(레일+드롭다운), Covid Dashboard(마젠타 히어로).

---

## 1. 골격별 채택 목록 (28건 · ★ = 핵심 15)

각 항목: 출처 · 디자이너/제작 · 라이브 여부 · 첫 900px 실측 · **B안이 가져갈 한 가지**.

### S1. 한 장 포스터 — 화면에 수(또는 문장) 하나

| # | 캡처 | 출처 / 제작 | 라이브 | 실측(첫 900px) | 가져갈 것 |
|---|---|---|---|---|---|
| ★1 | `gal-eclipses-1/2.jpg` | Awwwards 〔Where the Shadow Fell〕 Aleksandr Bogachev | `eclipses.bogachev.fr` | 캔버스 1440×900 = **100%**, 배경 `#F4F3EE` 계열 흰 종이, 텍스트 13px Space Mono 24회 / 44px 1회, radius 0(999px는 원형 버튼 4개뿐), **그림자 0**, 선 1px `rgba(92,74,52,.28)` | **연도 하나(`2000 BCE`)가 캡션이고 그림 하나가 화면 전부**. 우리 "기준시점 스트립"을 이 크기로 |
| ★2 | `gal-drib-climate-foresight-1.jpg` | Dribbble 27395449 · Diana Advokatova | 목업 | 흰 바탕, 신문 제호급 세리프 ≈ 180px(1600 기준), 위성 영상 우상단 ≈ 35% 폭, **`CO2 REDUCTION: 2.4 MILLION TONS` / `SENSOR NETWORK: 50,000 ACTIVE SITES`** 두 줄이 1px 룰로 구분 | **큰 수는 문장 안에 산다** — 라벨:값 한 줄, 박스 없음. 우리 124px 숫자의 정확한 이웃 |
| ★3 | `gal-drib-patient-health-os-1.jpg` | Dribbble 27380550 · Mondaysys | 목업 | 흰, "Healthcare that reads like *a letter*, not a chart." 세리프 이탤릭 혼용 ≈ 64px, 본문 14px, 좌 헤드라인 40% / 우 앱 목업 60% | **"차트가 아니라 편지"** — 관리툴 어휘 대신 문장이 데이터를 소개하는 방식 |
| ★4 | `gal-stateofaidesign-1/2.jpg` | Awwwards 〔AI in Design Report 2026〕 ++hellohello / Designer Fund | `stateofaidesign.com` | 흰 바탕, **120px 1회 / 80px 6회 / 40px 14회** Beausite, ls −1.6px, 액센트 1개(파랑 링크 `#0000EE` 375회), radius 0, 그림자 0, 파트너 로고 열은 1px 룰로만 | **타입 스케일 3단(120/80/40)만으로 위계**. 우리 64/52/16 + 124 수와 같은 전략의 실물 |
| 5 | `gal-drib-central-hub-1.jpg` | Dribbble 27502189 · Airzon Agency | 목업(Framer) | 흰, 세리프 이탤릭 헤드라인 ≈ 56px, 아래 대시보드 목업 60% | 헤드라인 세리프 + 인터페이스 산세리프 대비(우리는 SUIT/Pretendard 대비로 대응) |
| 6 | `gal-drib-smart-home-climate-1.jpg` | Dribbble 27387425 · Dima Strizhak | 목업 | 베이지 `#EDE9E4` 계열(흰 아님·경고), 수 `47 62 22` ≈ 96px 세 개, 원형 게이지 1개, 사진 좌 40% | 수 세 개가 화면 전부인 배분 — 단, 바탕은 흰으로 되돌려야 함 |

### S2. 신문/편집 지면 — 서사 + 표

| # | 캡처 | 출처 / 제작 | 라이브 | 실측 | 가져갈 것 |
|---|---|---|---|---|---|
| ★7 | `gal-drib-editorial-day63-1/2.jpg` | Dribbble 27579073 · Sneha S | 목업 | 크림 `#F5F1E8`, 제호 `THE CITY EDIT` 세리프 ≈ 72px, 볼륨/날짜 캡션 모노 11px, **본문 2단 + 인용 1단**, 룰 1px 검정 | **캡션 `VOL · 날짜`** 문법 — 우리 `장소 · 날짜` 캡션과 동형 |
| ★8 | `gal-drib-crosscheck-verdict-1.jpg` | Dribbble 27572034 · Suhayel Ahmed Nasim | 목업 | 흰, 인용문 세리프 ≈ 40px, 판정 스탬프 `FALSE` 적색 테두리 박스 1개(면 채움 없음), 신뢰 점수 `97` 이웃, 좌 레일 180px 회색 텍스트만 | **판정 = 테두리 스탬프 1개 + 점수 1개**. 탐지 결과 표시를 이렇게(면 채움 금지, 1차 §4-A1) |
| 9 | `gal-drib-crosscheck-explorer-1.jpg` | Dribbble 27574835 · Suhayel Ahmed Nasim | 목업 | 흰, `Reuters` 소스명 세리프 28px + 점수 `98` 우측, 막대 10칸 회색→녹색 1칸, 표 행 ≈ 40px | 점수 바를 **10칸 이산 셀**로 — 게이지·도넛 대신 |

### S3. 영상/지도 전면 + 헤어라인 UI

| # | 캡처 | 출처 / 제작 | 라이브 | 실측 | 가져갈 것 |
|---|---|---|---|---|---|
| ★10 | `gal-zoom-earth-1.jpg` | 라이브 〔Zoom Earth〕 | `zoom.earth` | 캔버스 1440×900 **100%** 위성 실영상, UI는 상단 지명 라벨 13px 흰 글자 + 좌측 아이콘 열, 배경 흰 57회(툴팁·검색), 선 1px 검정 46회 | **UI는 영상 위에 글자와 헤어라인만**. 우리 판정 규칙 1(영상 60%↑)의 최대치 |
| ★11 | `gal-protomaps-1.jpg` | 라이브 〔Protomaps light〕 | `maps.protomaps.com` | 지도 1440×767 = **85%**, 상단 바 133px 흰, 폰트 12/16px 시스템 산세리프 + 모노, radius 4px 9회, 액센트 파랑 `#3131DC` 1개 | 회색 벡터 바닥 + 검정 라벨 + 파랑 하나 — **B안 아틀라스의 기본 팔레트 실물** |
| ★12 | `gal-electricitymaps-1.jpg` | 라이브 〔Electricity Maps · light〕 | `app.electricitymaps.com/map?theme=light` | 지도 1232×900 **86%**, 좌 레일 208px 투명(글자만), Inter 14/12/10 세 단, 색은 데이터(코로플레스)만, 흰 UI 패널 반투명 | **레일이 배경 없이 글자만** — 데이터가 색을 다 가져가고 UI는 무채 |
| 13 | `gal-drib-satellite-grayscale-1.jpg` | Dribbble 2397164 · Funsize | 목업(800×600 원본, 저해상) | **무채 위성 영상 100%**, 관심영역 사각 브래킷 흰 1px, 우측 캡션 `INCIDENCE ANGLE / GROUND RESOLUTION / DOWNLINK TIME` 모노 대문자 ls 넓게 | **코너 브래킷 + 모노 캡션**이 오버레이의 전부 (취향 §4 "HUD 스티커 금지"의 대안 실물). 바탕이 검정이라 ★ 제외 — 문법만 |
| ★14 | `gal-drib-ecocity-1.jpg` | Dribbble 27040406 · Orizon | 목업 | 항공 사진 **≈ 65%**, 흰 패널 두 장(우 32%) 라운드 큼(경고), 핀 라벨 `Green Regulations` 흰 알약 | 사진이 바닥·패널이 손님인 배분. 라운드/알약은 버림 |
| 15 | `gal-drib-agrotech-1.jpg` | Dribbble 26792930 · Cansaas | 목업 | 항공 필지 영상 ≈ 55%, 좌 흰 패널 45%, 수 `43kPa 12% 32°C` ≈ 40px, 룰 1px | 실측 수 + 필지 영상 병치 (남원 온실 레그와 같은 소재) |
| 16 | `gal-drib-agrova-1.jpg` | Dribbble 27189397 · Emura | 목업 | 흰 바탕, 필지 영상 우 42%, 좌 텍스트 KPI 2×3(박스 없음, 1px 룰), 수 `95% 6.4 87%` ≈ 32px | **KPI를 박스 없이 룰로만** 나눈 실물 (1차 §3 "큰 수 박스 없음"과 일치) |

### S4. 지도 70% + 큐(행) 한 줄

| # | 캡처 | 출처 / 제작 | 라이브 | 실측 | 가져갈 것 |
|---|---|---|---|---|---|
| ★17 | `gal-usgs-quakes-1.jpg` | 라이브 〔USGS Earthquakes〕 | `earthquake.usgs.gov/earthquakes/map/` | 지도 1120×850 = **78%**, 좌 목록 320px `#F4F4F4`, 행 높이 ≈ 60px, 규모 수 22px 굵게 + 지명 16px + 시각 12px, 선 1px `#DDD` 40회, 흰 배경 48회, radius 4px | **행 = 수(규모) · 장소 · 시각** 세 칸. 우리 탐지 큐 행의 정확한 원형 |
| ★18 | `gal-watchduty-1.jpg` | 라이브 〔Watch Duty〕 | `app.watchduty.org` | 지도 1065×836 **74%**, 우 목록 375px 흰, Inter 14px 46회 / 16px 6회, 색 `#2F2A2A` 잉크 3단 투명도(1.0/.7/.54), 액센트 앰버 `#FBB92D` 1회(로고) | **잉크 한 색을 투명도 3단으로** 위계 — 회색 3개 대신 |
| 19 | `gal-drib-maritime-cloud-1.jpg` | Dribbble 27211303 · Fariz Mirza Abdillah | 목업 | 지도 ≈ 70% 파랑 코로플레스(단색), 좌 레일 140px 흰, 우 플로팅 `Vessel List` | 지도 단색(파랑 하나)에 선박 점 — 색 규율 사례 |
| 20 | `gal-drib-urban-planning-gis-1.jpg` | Dribbble 18908784 · Sunnyday Lab | 목업 | 밝은 벡터 지도 ≈ 75%, 좌 레이어 트리 흰 25%, 범례 색 6개(경고) | 레이어 트리가 지도 위에 흰 종이로 뜨는 배분 |
| 21 | `gal-drib-damiun-spatial-1.jpg` | Dribbble 26933389 · Adam Rezki | 목업 | 흰 좌 리포트 텍스트 45% + 우 밝은 지도 55%(적색 히트 폴리곤), 룰 1px | **왼쪽이 리포트 본문, 오른쪽이 지도** — 서사 페이지 구성 |

### S5. 차트 전폭, 레일 없음

| # | 캡처 | 출처 / 제작 | 라이브 | 실측 | 가져갈 것 |
|---|---|---|---|---|---|
| ★22 | `gal-climate-reanalyzer-1.jpg` | 라이브 〔Climate Reanalyzer · UMaine〕 | `climatereanalyzer.org/clim/t2_daily/` | 차트 1150×610 = **첫 900px의 54%**, 바탕 `#F8F8F8`/흰, Helvetica 16px 32회 / 32px 1회, **그림자 0, radius 4px 6회**, 연도 30개는 회색 선 + 올해 1개만 적색 | **데이터 잉크만** — 회색 다중 선 + 액센트 1개. 취향 §4 "차트" 항목의 실물 |
| ★23 | `gal-plausible-1/2.jpg` | 라이브 〔Plausible · public demo〕 | `plausible.io/plausible.io` | 상단 KPI 6개 **박스 없음** 19px 라벨 + 굵은 수, 면 차트 1032×306 전폭, 아래 2열 표, ls 0, radius 4px 57회(작음), 그림자 1 | **KPI 행이 텍스트 열**이고 차트가 그 아래 전폭 — 카드 없는 분석 화면 |
| 24 | `gal-owid-grapher-2/3.jpg` | 라이브 〔Our World in Data · Grapher〕 | `ourworldindata.org/grapher/co2-emissions-per-capita?tab=map` | 흰 450회, 코로플레스 지도 + 우 국가 표(수 tabular), Lato 13/14px, radius 2px 217회, 선 1px `#F2F2F2`/`#DADADA` | **지도 옆 표의 수가 지도 색과 1:1** — 슬라이더(연도) 하나가 둘을 동시에 움직임(판정 8) |
| 25 | `gal-owid-explorer-1.jpg` | 같은 출처 · Explorer | `ourworldindata.org/explorers/co2` | 좌 선택 열 260px 회색 `#EBEEF2`, 차트 916×408, 데이터 출처 캡션 하단 고정 | **출처·기준시점 캡션 고정줄** (1차 C11·C16) |
| 26 | `gal-climate-pulse-1/2.jpg` | 라이브 〔Copernicus Climate Pulse · ECMWF〕 | `pulse.climate.copernicus.eu` | 좌 시계열 + 우 지구본(696×657, 48%), 흰 패널, 파랑 상단바 `#006EAF`, radius 8px(경고), 쿠키 모달이 첫 클릭(1차 A6) | 시계열과 지구본이 **같은 날짜 하나**에 묶이는 구성 |
| 27 | `gal-drib-treemap-1.jpg` | Dribbble 7091118 · Jamie Fang | 목업 | 흰, 트리맵 좌 55% + 우 KPI, 녹/분홍 2색(경고) | 카드 대신 **면적이 값**인 한 장 — 다만 색은 1개로 |

### S6. 문장 속 큰 수 + 지도(국가 대시보드)

| # | 캡처 | 출처 / 제작 | 라이브 | 실측 | 가져갈 것 |
|---|---|---|---|---|---|
| 28 | `gal-gfw-korea-1/2.jpg` | 라이브 〔Global Forest Watch · KOR〕 | `globalforestwatch.org/dashboards/country/KOR/` | 좌 텍스트 40% 흰: "In 2020, **South Korea** had **4.7 Mha** of natural forest…" 20px/32, 우 지도 496×900(34%), 좌 레일 검정(경고), radius 10px 62회 + 녹색 `#97BE32` 63회(경고) | **수가 문장의 목적어** — "4.7 Mha, 47%, 83 kha, 15 Mt"가 볼드로만 구분. 껍질(검정 레일·녹색·라운드)은 버리고 이 문장 문법만 |

---

## 2. 골격 요약 — B안이 실제로 쓸 수 있는 다섯 장

1차 §3의 권고(`ESRI-STATUS`: 지도 58% + 박스 없는 큰 수)를 갤러리가 **다시 확인**한다. 갤러리에서 "흰 + 좋다"는 것은 거의 예외 없이 다음 다섯 중 하나였다.

| 골격 | 실물 근거 | 우리 화면 대응 |
|---|---|---|
| **A. 포스터** — 수/문장 1 + 그림 1 | Eclipses(캔버스 100% + 캡션 1), Climate Foresight(수 두 줄), AiiD(120/80/40) | 홈 첫 프레임, 레그 전환 카드 |
| **B. 영상 100% + 글자·헤어라인** | Zoom Earth, Protomaps, Electricity Maps(light), Funsize 위성(문법만) | 남원/제주 정사영상 뷰 |
| **C. 지도 74–78% + 큐 320–375px** | USGS, Watch Duty | 탐지 큐(사건 목록) |
| **D. 차트 전폭 + KPI 텍스트 행** | Plausible, Climate Reanalyzer, OWID | 시계열·변화량 화면 |
| **E. 리포트 지면** — 좌 본문, 우 지도/표 | Damiun, Crosscheck Verdict, City Edit | 사업 보고 페이지 |

**수치 합의(라이브 실측 5곳 교집합)**: 지도/영상 **74–100%** · 목록 폭 **320–375px** · 본문 **13–16px** · 큰 글자는 **1–2회만**(32/44/120) · 선 **1px `#DDD`~`#F2F2F2`** · 그림자 0–3 · radius 0–4px.
이 교집합은 취향 §4(라운드 0·그림자 0)와 **충돌하지 않는다** — 4px는 버리면 되고, 나머지는 이미 같다.

---

## 3. 갤러리에서 본 안티패턴 (1차 §4에 추가)

- **A16. "흰 대시보드"의 90%는 레일+카드다** — 드리블 `light dashboard` 46건 중 좌측 레일 없는 것 2건. 흰 바탕이라고 B안이 아니다. 골격이 바뀌지 않으면 색만 바뀐 1차 A10.
- **A17. 흰 바탕에 라운드 16–24px + 알약 라벨** — EcoCity·Urban Planning·GFW. 국내(1차 A9)만이 아니라 글로벌 목업의 기본값. 우리는 골격만 가져오고 모서리는 0으로.
- **A18. 위성/우주 = 검정** — `satellite dashboard` 44건 중 흰 바탕 **1건**(Funsize, 2016). 영상 소재가 우리와 같아도 바탕이 반대라 거의 전부 탈락. **밝은 정사영상 위의 흰 UI는 갤러리에 선례가 거의 없다** = 우리가 만들면 차별점.
- **A19. 어워드 데이터비주얼 = 어두운 몰입** — Awwwards 카테고리 9 캡처 중 흰 2. 서사 몰입 사이트는 검정을 택한다. 우리 B안은 이 흐름을 **의도적으로 거스르는 것**이므로 근거는 어워드가 아니라 편집 디자인(신문·리포트)에서 가져와야 한다(S2).
- **A20. 크림 바탕을 흰으로 착각** — Editorial day63 `#F5F1E8`, Smart Home `#EDE9E4`, Eclipses `#F4F3EE`. 편집 느낌은 크림에서 오지만 취향 §4는 `#FFFFFF`. 타이포·룰만 가져오고 종이색은 순백 유지(또는 사용자에게 크림 허용 여부를 한 번 물을 것).

---

## 4. 파일

- 캡처 28건 × 1–2장: `shots/bench/dash2/gal-*.jpg` (`gal-drib-*` 는 Dribbble 원본을 1440 폭으로 렌더, `-2`는 전체 높이)
- 실측: `shots/bench/dash2/_measure-gal-*.json` (라이브 13건)
- 인덱스: `_drib-index.json`(367), `_drib-picks.json`(20 후보 메타: 샷 URL·디자이너·원본 해상도), `_gal-index.json`
- 시트: `_sheet-gallery.jpg` (28건 5열), 트리아지 `_tri-drib.jpg` `_tri-live2.jpg`
- 도구: `shots/bench/dash2/_tools/` (`cap.mjs` 1차 복제, `drib.mjs` 검색 인덱서, `dribcap.mjs` 원본 렌더, `sheet.mjs` 시트, `batchA/B/C.mjs`)
