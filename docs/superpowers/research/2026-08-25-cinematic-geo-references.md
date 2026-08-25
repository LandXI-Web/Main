# Land-XI 리디자인 레퍼런스 리서치 — "살아 있는, 시네마틱한, 인터랙티브한 Geo-AI 웹"

- 작성일: 2026-08-25
- 목적: 클라이언트 피드백("뻣뻣하다 / 영화적이지 않다 / 인터랙션이 없다 / 인간미가 없다 / 시안 목업 수준")을 뒤집을 수 있는 최고 수준 레퍼런스 수집·분석
- 전제 스택: 바닐라 JS + MapLibre GL JS v5 + WebGL(three.js / deck.gl, CDN 허용), 밝은 지도 바탕 + 글래스 패널, 실제 정사영상 타일 + 실제 탐지 GeoJSON 보유
- 결론 요약: **"영화적"의 정체는 화려한 셰이더가 아니라 (1) 카메라 연출 (2) 시간(빛/타임라인) (3) 데이터의 자기 증명(proof of life) (4) 스토리 모드 ↔ 도구 모드의 무봉합 전환** 네 가지다. 이 네 축을 각각 담당하는 레퍼런스를 아래에 정리했다.

---

## 0. 먼저 — 첫 시안이 "뻣뻣하다"는 진단의 번역

클라이언트가 말한 4개 단어를 기술 요구사항으로 번역하면 다음과 같다. 이후 모든 레퍼런스는 이 표의 어느 칸을 채우는지로 읽으면 된다.

| 클라이언트 표현 | 실제로 없는 것 | 채워야 할 기술 요소 |
|---|---|---|
| 뻣뻣하다 (stiff) | 카메라가 점프한다. 상태 전환이 즉시(0ms)다 | `easeTo`/`flyTo` 커스텀 이징, pitch/bearing 동반 이동, 관성 스크롤, 레이어 opacity 트랜지션 |
| 시네마가 없다 | 빛·대기·시간이 없다. 항상 정오, 항상 위에서 봄 | sky/fog/atmosphere, 태양 각도, 그림자, 지형 기복, 저고도 오블리크 카메라 |
| 인터랙션이 없다 | 클릭해도 아무것도 응답하지 않음. 커서가 죽어 있음 | hover 하이라이트, 커서 렌즈, 스크럽 슬라이더, 실시간 카운터, 사운드 |
| 인간미가 없다 | 데이터가 "진짜"라는 증거가 없음 | 실제 좌표/시각/촬영일 툴팁, 라이브 피드 느낌, 현장 사진, 담당자 시점 |

> GitHub Globe 팀이 정확히 같은 문제를 겪었다. "arc만 보여줬더니 그냥 디자인 애니메이션처럼 보였다. **proof of life가 필요했다**. 그래서 hover 시 PR·레포·타임스탬프·언어·위치를 노출했다." — 이게 "인간미"의 실체다.
> https://github.blog/engineering/engineering-principles/how-we-built-the-github-globe/

---

## 1. 레퍼런스 카탈로그 (24개)

### A. 지도 스토리텔링 / 카메라 연출

#### A-1. Mapbox Storytelling Template
- URL: https://github.com/mapbox/storytelling · 해설: https://www.mapbox.com/blog/how-to-build-a-scrollytelling-map · 3D판: https://www.mapbox.com/blog/interactive-storytelling-3d-maps-with-mapbox-gl-js-v2
- 무엇: 스크롤 챕터 ↔ 지도 카메라 상태(center/zoom/pitch/bearing)를 1:1로 묶는 오픈소스 템플릿. SF Chronicle의 Kincade 화재, Washington Post의 1968 DC 폭동 기사가 이 형식으로 제작됨.
- 살아 있게 만드는 것: **챕터마다 pitch/bearing이 함께 바뀐다는 점**. 위치만 옮기면 지도가 뻣뻣하고, 카메라 각도가 같이 돌아가야 "촬영"처럼 보인다. `onChapterEnter`에서 레이어 opacity를 동시 트랜지션시켜 "장면 전환"을 만든다. MapLibre로 100% 이식 가능(설정 JSON 구조를 그대로 베껴도 됨).
- Land-XI 적용: 홈 히어로를 "남원 4시점 정사영상"으로 4챕터 스크롤리텔링화. 챕터=시점(년도).

#### A-2. Mapbox GL Director
- URL: https://developmentseed.org/gl-director/
- 무엇: 카메라 키프레임을 GUI로 찍어 지도 애니메이션을 뽑는 도구 (Development Seed 제작).
- 살아 있게 만드는 것: 지형 + sky 스타일 + 카메라 API 조합. 카메라 경로를 "타임라인 키프레임"으로 다루는 사고방식 자체가 참고 대상.

#### A-3. Google Earth Studio
- URL: https://www.google.com/earth/studio/ · 키프레임 문서: https://earth.google.com/studio/docs/making-animations/keyframes/
- 무엇: 브라우저에서 지구 전역 시네마틱 영상을 만드는 무료 키프레임 애니메이터. After Effects식 타임라인으로 카메라 위치·회전·고도·FOV·**태양 위치**까지 애니메이션.
- 살아 있게 만드는 것: 프리셋 5종 — **Orbit(대상 주위 선회), Point-to-Point(A→B 비행), Zoom-to-Point, Spiral, Overview**. 이 5개가 사실상 "지오 시네마 문법"의 전부다. Land-XI의 모든 카메라 이동은 이 5개 중 하나로 분류·구현할 수 있다.
- Land-XI 적용: 탐지 대상 클릭 → `Orbit` 프리셋(중심 고정 + bearing 360° 회전 + pitch 55°)이 가장 "우와"를 만드는 저비용 연출.

#### A-4. Esri ArcGIS StoryMaps — 3D Sidecar / "Mapping Everest"
- URL: https://www.esri.com/arcgis-blog/products/arcgis-storymaps/mapping/choreograph-your-maps-with-arcgis-storymaps/ · 3D 사례: https://storymaps.arcgis.com/stories/ed52cfb9de4d4ec6b87dae906b171e66 · 3D 스토리텔링론: https://www.esri.com/arcgis-blog/products/arcgis-storymaps/mapping/the-pleasures-of-3d-storytelling-with-arcgis-storymaps
- 무엇: "sidecar 블록" = 고정 미디어 패널 + 스크롤 내러티브 패널. Esri는 이걸 명시적으로 **"map choreography(지도 안무)"**라 부른다.
- 살아 있게 만드는 것: 좌측 텍스트가 흐르는 동안 우측 3D 씬만 바뀌는 비대칭 레이아웃. "논리적이고 심지어 영화적인 뷰 진행(cinematic progression of related map views)"이라는 표현이 핵심.
- Land-XI 적용: 대시보드의 "사업 성과 리포트" 모드를 이 sidecar 문법으로. 글래스 패널이 곧 내러티브 패널.

#### A-5. Google Earth Voyager
- URL: https://earth.google.com/web/ (배 키 아이콘) · 제작 후일담: https://ubilabs.net/en/projects/google-earth-remake-voyager
- 무엇: BBC Earth / NASA / National Geographic 등이 만든 큐레이션 가이드 투어 + 퀴즈 + 360 이미지.
- 살아 있게 만드는 것: **"지도 앱 안의 잡지"** 개념. 도구를 열자마자 빈 지도가 아니라 "오늘의 이야기 카드"가 떠 있다. 사용자가 뭘 봐야 할지 모를 때의 공백을 없앤다.
- Land-XI 적용: 대시보드 첫 진입 시 "오늘의 탐지 하이라이트" 카드 3장 → 클릭하면 카메라가 그 현장으로 flyTo.

---

### B. 글로브 / WebGL 히어로

#### B-1. GitHub Globe ★핵심 레퍼런스
- URL: https://github.blog/engineering/engineering-principles/how-we-built-the-github-globe/ · 오픈소스 클론: https://github.com/janarosmonaliev/github-globe
- 무엇: three.js 5레이어 구성 — halo(1.15배 스케일 백페이스 셰이더 구), 글로브 본체, 약 12,000개 5각 원으로 만든 육지, 파란 스파이크(open PR), 분홍 arc(merged PR).
- 살아 있게 만드는 것 (구현 디테일이 전부 재사용 가능):
  - **텍스처 0장.** 조명 4개 + 점 배치 알고리즘만으로 지구를 만든다 → 가볍고 "인포그래픽스럽게" 세련됨.
  - 육지 판정: 세계지도 PNG를 canvas `getImageData()`로 읽어 alpha > 90/255 인 곳에만 원을 찍음.
  - arc = **cubic Bézier + `TubeBufferGeometry` + `setDrawRange()`** 로 그려지는 애니메이션. 도착점에 실선 원 + 지수 이징으로 퍼지며 사라지는 링.
  - 이징 공식: `current += (target - current) * 0.06` — 프레임 독립적이지 않지만 극히 저렴하고 부드럽다.
  - **성능 티어링**: 50프레임 동안 FPS가 55.5 미만이면 픽셀 밀도 2.0→1.5, 원 개수 12,000→8,000, raycast 빈도, PR 개수를 순차 강등.
  - **모아레 제거**: 프래그먼트 셰이더에서 카메라 거리 기반 페이드 → 부수 효과로 "대기 원근감"이 생김.
  - **체감 속도**: Figma에서 그라디언트만으로 만든 SVG를 먼저 띄우고, Web Animations API로 canvas와 크로스페이드 + 동시 스케일업. DOM은 전환 중 건드리지 않음.
  - **첫 회전각을 디바이스 타임존으로 결정**: `rotationOffset.y = Math.PI * (tzOffset / tzMaxOffset)` → IP 조회 대기 없이 "내 지역이 보이는" 개인화.

#### B-2. Stripe Globe ★핵심 레퍼런스
- URL: https://stripe.com/blog/globe (실물: https://stripe.com)
- 무엇: 1:4천만 스케일 인터랙티브 3D 지구. three.js.
- 살아 있게 만드는 것:
  - **3중 구 레이어**: 반투명 바다 구(50 세그먼트) + **해바라기 나선(sunflower spiral) 배치로 60,000개 점** + cubic Bézier 튜브 arc.
  - **오로라 같은 빛의 일렁임**을 별도 레이어로 추가 → 정적인 구를 "숨쉬게" 만드는 최소 비용 트릭.
  - "지도를 훑는 것보다 **지구를 돌려보는 게 훨씬 만족스럽다**" — 인터랙션 만족감에 대한 명시적 디자인 논거.
  - 성능: **antialias 끄기**가 전 디바이스에서 결정적 개선. 점 60,000→20,000 축소(서비스 국가만). 스크롤 핸들러 60fps 스로틀, 스크롤 중 애니메이션 일시정지.
  - arc는 대권항로(great circle) 위를 d3 보간으로 **2.5초에 걸쳐 `setDrawRange`로 그려짐**.
- Land-XI 적용: "전국" 스케일 히어로에 그대로 이식 가능. arc = 드론/항공 촬영 미션 노선, 점 = 탐지 건수.

#### B-3. globe.gl / three-globe (구현 지름길)
- URL: https://github.com/vasturiano/globe.gl · https://github.com/vasturiano/three-globe
- 무엇: 위 두 글로브의 기능(점/arc/링/HTML 마커/커스텀 레이어)을 CDN 한 줄로 쓰는 컴포넌트.
- 살아 있게 만드는 것: `ringsData`(퍼지는 파동), `arcsData`(dash 애니메이션), `htmlElementsData`(3D 좌표에 붙는 DOM 라벨)가 즉시 사용 가능 → 프로토타입 1일 컷.

---

### C. 대규모 데이터 / 파티클 / 흐름

#### C-1. deck.gl Showcase & Script Gallery
- URL: https://deck.gl/showcase · https://deck.gl/gallery/ · MapLibre 연동: https://deck.gl/gallery/maplibre-overlay · 문서: https://deck.gl/docs/developer-guide/base-maps/using-with-maplibre
- 주목할 개별 사례:
  - **Wind Map** https://philogb.github.io/page/wind/ — GPU 보간 + 파티클
  - **Internet Speed Tests Map** https://fairinternetreport.com/research/internet-speed-map-single-day — 360만 포인트를 커스텀 셰이더 + 바이너리 포맷으로 애니메이션
  - **Toronto Dot Density** https://schoolofcities.github.io/dot-density/ — 3D 점밀도
  - **Flowmap.blue** https://flowmap.blue/ — 집계된 이동 흐름
  - **Radiance** https://useradiance.com — Google 3D Tiles 위에 태양광 flux 시각화 (= 정사영상 위 AI 결과 오버레이의 직접 유사 사례)
- 살아 있게 만드는 것: `MapboxOverlay`의 **interleaved 모드** — deck.gl 레이어를 MapLibre 스타일 레이어 사이(`beforeId`)에 끼워 넣어 라벨이 데이터 위로 올라오게 함. 이게 없으면 오버레이가 "붕 떠 보이고" 그게 정확히 "뻣뻣함"의 원인이다.

#### C-2. kepler.gl
- URL: https://kepler.gl/ · Time Playback 문서: https://docs.kepler.gl/docs/user-guides/h-playback · 소개: https://www.uber.com/blog/keplergl/
- 무엇: Uber의 오픈소스 지오 분석 도구. deck.gl 기반.
- 살아 있게 만드는 것: 사용자들이 가장 좋아한 3가지가 명확히 문서화되어 있음 — **arc 레이어, 3D 헥사곤, 시간 애니메이션**. 시간 필드를 필터로 걸면 하단에 재생 창이 뜨고 1x/2x/4x 속도 조절.
- Land-XI 적용: 대시보드 하단 **타임 스크러버**는 논쟁의 여지 없이 필수. "촬영일" 필드가 있는 순간 재생 버튼이 생겨야 한다.

#### C-3. Windy.com
- URL: https://www.windy.com/ · 원리 해설: https://blog.mapbox.com/how-i-built-a-wind-map-with-webgl-b63022b5537f · 구현: https://github.com/mapbox/webgl-wind
- 무엇: 100만 파티클을 60fps로 흘리는 바람 지도.
- 살아 있게 만드는 것: 파티클 위치를 **텍스처에 인코딩(R=u, G=v)하고 GPU에서 갱신**, 각 파티클에 TTL을 주어 만료 시 랜덤 재배치. 잔상(fade) 프레임 누적으로 "흐름의 궤적"이 생김. 정지 화면인데 계속 살아 있다.
- Land-XI 적용: 해양쓰레기 = 해류 파티클, 농지 = 계절 변화 흐름. **파티클은 "데이터가 살아 있다"는 신호를 가장 싸게 주는 장치.**

#### C-4. Flightradar24 3D View / ADS-B Exchange
- URL: https://www.flightradar24.com/ (3D 해설: https://www.flightradar24.com/blog/inside-flightradar24/exploring-the-new-flightradar24-3d-view/) · https://globe.adsbexchange.com/
- 무엇: Cesium 글로브 + Mapbox 영상/지형 위에 실시간 3D 항공기. 약 58,000개 자원자 수신기 피드가 수 초마다 갱신. 베이스맵 타일부터 아이콘·궤적까지 전부 GPU 렌더.
- 살아 있게 만드는 것: **콕핏 뷰 + 우하단 미니맵**. "따라가는 카메라(chase cam)"와 "전체 맥락(minimap)"을 동시에 주는 조합. 그리고 무엇보다 **아무 조작도 안 해도 화면이 계속 움직인다**.
- Land-XI 적용: "드론 미션 리플레이" — 실제 비행 경로를 따라 카메라가 지형을 따라가고, 우하단 미니맵에 진행률 표시.

#### C-5. Global Fishing Watch
- URL: https://globalfishingwatch.org/our-map/ · 가이드: https://globalfishingwatch.org/user-guide/
- 무엇: 위성 + 머신러닝으로 65,000척 이상의 조업 활동을 2012년부터 현재까지 공개 시각화.
- 살아 있게 만드는 것: **"AI가 추론한 활동(apparent fishing activity)"을 궤적 히트로 그린다**는 점 — 원본 데이터가 아니라 AI 판단 결과가 주인공인 지도. Land-XI와 문제 구조가 동일.

#### C-6. The Ocean Cleanup — Plastic Tracker ★도메인 직결
- URL: https://theoceancleanup.com/plastic-tracker/ · Mapbox 쇼케이스: https://www.mapbox.com/showcase/the-ocean-cleanup · 관련: https://www.mapbox.com/blog/tackling-ocean-plastic-pollution-in-4-maps
- 무엇: 지도에 위치를 찍으면 그 자리에 버려진 플라스틱 한 조각이 **20년 동안 어디로 흘러갈지** Lagrangian 확산 모델로 경로를 그려 보여준다. Mapbox GL JS + Studio.
- 살아 있게 만드는 것: **"내가 찍은 한 점"에서 이야기가 시작된다.** 개인화된 입력 → 즉각적 시네마틱 궤적 애니메이션. 해양쓰레기 도메인에서 "우와"를 만든 검증된 유일한 사례.
- Land-XI 적용: **홈에 "우리 동네 찍어보기" 인터랙션** — 사용자가 지도를 클릭하면 그 지점의 실제 정사영상으로 zoom-in하며 탐지 결과가 하나씩 pop-in. 이 하나만 잘 만들어도 첫인상이 뒤집힌다.
- EarthTime(https://earthtime.org/) 도 같은 계열 — CMU CREATE Lab, 지구 규모 시계열 스크럽.

---

### D. 위성/항공 영상 뷰어 (도구 모드의 정석)

#### D-1. Planet Explorer / Planet Basemaps
- URL: https://www.planet.com/explorer · https://www.planet.com/basemaps/ · 소개: https://www.planet.com/pulse/introducing-planet-explorer-beta/
- 무엇: 지도에 **시간 축을 붙인** 위성 영상 브라우저. 월별/분기별 Timelapse Basemap을 로그인 없이 스크럽. 베이스맵 1장이 200만 장 이상의 위성 영상 자동 합성.
- 살아 있게 만드는 것: 지도 하단의 **월 단위 프리뷰 썸네일 스트립**. 시간 이동이 "드롭다운 선택"이 아니라 "필름 스트립 스크럽"이라는 게 결정적 차이.
- Land-XI 적용: 남원 4시점 → 상단/하단 필름 스트립. 4개뿐이라도 스트립으로 보여주면 "아카이브가 있다"는 인상을 준다.

#### D-2. NASA Worldview
- URL: https://worldview.earthdata.nasa.gov/
- 무엇: 1,200종 이상 위성 데이터 레이어를 브라우즈/비교/애니메이션/다운로드. GIBS 타일 서비스 + OpenLayers.
- 살아 있게 만드는 것: **레이어 스택 UI + 하단 날짜 타임라인 + A/B 비교 모드 + GIF 애니메이션 내보내기**. "관측 도구"의 UI 문법 표준. 특히 **애니메이션을 GIF로 내보내는 버튼**은 공공기관 발표 자료 제작 니즈와 정확히 맞는다 (LX 보고자료 캡처 니즈).

#### D-3. NASA Eyes on the Earth
- URL: https://eyes.nasa.gov/apps/earth/ · 소개: https://science.nasa.gov/eyes/
- 무엇: 운영 중인 15개 지구관측 위성의 실시간 위치를 3D로. 위성에 "탑승"해 함께 비행 가능.
- 살아 있게 만드는 것: **"관측 장비 자체를 캐릭터로 만든다."** 데이터만이 아니라 데이터를 얻는 기계가 화면에 등장한다. → Land-XI에서 **드론/항공기 자체를 3D로 띄우는 것**이 정당화된다. 공공기관 클라이언트에게 "우리 장비"가 화면에 나오는 것은 감정적으로 큰 값이다.

#### D-4. Zoom Earth
- URL: https://zoom.earth/
- 무엇: 실시간 기상 위성 + 태풍 트래킹. Neave Interactive 제작.
- 살아 있게 만드는 것: **엄청난 데이터량에도 인터페이스가 유체처럼 유지된다**는 평. 빠른 회선에서 위성 이미지를 **프리로드**해서 스크럽 시 끊김이 없음. 조작은 드래그/스크롤/토글 클릭뿐 — 극단적 단순함.
- 교훈: 시네마틱함은 기능 수가 아니라 **끊김 없음**에서 온다. 남원 4시점도 프리로드해두면 스크럽이 영상처럼 느껴진다.

#### D-5. Sentinel Hub EO Browser
- URL: https://www.sentinel-hub.com/explore/eobrowser/
- 무엇: Sentinel/Landsat 등 무료 위성 영상 탐색기.
- 살아 있게 만드는 것: **Compare 패널 — 여러 날짜를 핀으로 담아두고 split slider / opacity slider로 비교.** "핀에 담기(collect)" → "비교(compare)"의 2단계 워크플로가 우수.

#### D-6. Esri Swipe / Spyglass 위젯 & World Imagery Wayback
- URL: https://www.esri.com/arcgis-blog/products/arcgis-online/mapping/swipe-compare-apps · Wayback: https://livingatlas.arcgis.com/wayback/
- 무엇: 영상 비교 UI의 산업 표준 3형태 — **수평 스와이프 / 수직 스와이프 / 스파이글래스(돋보기)**.
- 살아 있게 만드는 것: 스파이글래스는 **커서가 곧 렌즈**가 되는 인터랙션. 마우스를 움직이는 것만으로 과거/현재가 뚫린다. 구현 난이도 대비 체감 임팩트가 가장 높은 패턴 중 하나.

#### D-7. Nearmap AI / Vexcel Viewer
- URL: https://www.nearmap.com/ · https://vexceldata.com/ (뷰어 업데이트: https://vexceldata.com/stories/your-view-just-got-an-upgrade-new-updates-to-viewer/)
- 무엇: Nearmap AI는 항공영상에서 지붕 유형·태양광 패널·식생 등 **130종 이상 속성을 자동 탐지/분류**하고 과거 영상 아카이브와 비교. Vexcel Viewer는 정사(ortho)/사각(oblique) 뷰 전환 + 시계열 비교.
- 살아 있게 만드는 것: **ortho ↔ oblique 토글**. 수직 정사영상만 보다가 비스듬한 시점으로 전환되는 순간 "3D구나"가 인지된다. Land-XI가 정사영상만 갖고 있어도, **MapLibre의 pitch를 60°로 눕히고 terrain을 켜면** 유사 효과를 만들 수 있다.

#### D-8. Umbra Open Data Catalog / BlackSky Spectra
- URL: https://open-data.umbra.space/browse/ · https://umbra.space/open-data/ · https://blacksky.com/
- 무엇: Umbra는 최대 16cm 해상도 SAR 영상 250장 이상을 공개(20+ 지점 주간 갱신). BlackSky Spectra는 **약 30초에 위성 태스킹, 90분 내 영상+분석 전달**.
- 살아 있게 만드는 것: BlackSky 마케팅의 핵심은 **"속도의 시각화"** — 태스킹 클릭 → 카운트다운 → 결과 도착. 시간 자체가 연출 소재.
- Land-XI 적용: "AI 분석 요청 → 진행 바 → 결과 pop-in" 을 **일부러 1.5초쯤 연출**하는 것이 즉시 표시보다 임팩트가 크다 (단, 페이크 로딩은 지양하고 실제 처리 시간을 시각화).

---

### E. 3D 도시 / 사실감

#### E-1. Cesium ion + Google Photorealistic 3D Tiles
- URL: https://cesium.com/platform/cesium-ion/ · https://cesium.com/blog/2023/10/26/photorealistic-3d-tiles-in-cesium-ion/
- 무엇: 2,500개 도시 / 49개국의 실사 3D 타일을 3D Tiles로 스트리밍. Cesium ion으로 대용량 포토그래메트리(멜버른 스트리트레벨 30GB / 메시 50만 개)를 단순화 없이 웹 스트리밍.
- 살아 있게 만드는 것: **LOD 스트리밍이 시각적으로 드러나지 않는 것**. Land-XI가 자체 정사영상 타일을 쓸 때도 동일 원칙 — 타일 로딩 시 흰 사각형이 보이면 즉시 "목업"이 된다. **placeholder를 저해상도 블러로 깔아라.**

#### E-2. Mapbox Standard — 동적 조명 프리셋 ★핵심 아이디어
- URL: https://docs.mapbox.com/map-styles/standard/guides/ · https://www.mapbox.com/blog/standard-core-style · https://www.mapbox.com/blog/global-cities-3d-landmarks
- 무엇: **Day / Night / Dusk / Dawn 4가지 조명 프리셋.** 프리셋이 색온도, 그림자 방향, 앰비언트/디렉셔널 광량을 한꺼번에 바꾼다. 태양이 이동하면 그림자가 따라 움직이고, 밤에는 건물 진입구 조명 같은 보조 광원이 켜진다. 랜드마크 6,500개(450개 도시)가 조명에 반응.
- 살아 있게 만드는 것: **"시간대 = 하나의 슬라이더"**. 이 발상 하나로 정적인 밝은 지도가 영화가 된다. MapLibre에는 Mapbox Standard가 없지만 `sky` + `light` + `fog` + hillshade 조합으로 **직접 4프리셋을 만들 수 있다** (아래 패턴 P-2).
- **Land-XI에 가장 직접적으로 이식 가능한 "시네마" 요소.** 밝은 지도 바탕 요구와도 충돌하지 않는다(기본값 Day, 연출 시에만 Dawn/Dusk).

#### E-3. MapLibre GL JS v5 — Globe + Sky/Fog/Terrain
- URL: https://maplibre.org/projects/gl-js/ · v5 릴리스: https://github.com/maplibre/maplibre-gl-js/releases/tag/v5.0.0 · Globe 로드맵: https://maplibre.org/roadmap/maplibre-gl-js/globe-view/
- 예제: 대기 있는 지구 https://maplibre.org/maplibre-gl-js/docs/examples/display-a-globe-with-an-atmosphere/ · Sky/Fog/Terrain https://maplibre.org/maplibre-gl-js/docs/examples/sky-fog-terrain/ · 3D 지형 https://maplibre.org/maplibre-gl-js/docs/examples/3d-terrain/ · 점 주위 카메라 회전 https://maplibre.org/maplibre-gl-js/docs/examples/animate-map-camera-around-a-point/ · 카메라 이징 커스터마이즈 https://maplibre.org/maplibre-gl-js/docs/examples/customize-camera-animations/ · 천천히 flyTo https://maplibre.org/maplibre-gl-js/docs/examples/slowly-fly-to-a-location/
- 스타일 스펙: Sky https://maplibre.org/maplibre-style-spec/sky/ · Root(light) https://maplibre.org/maplibre-style-spec/root/
- 무엇: **2025년 1월 v5.0.0에서 Globe Projection 정식 출시.** 동일한 Mercator 벡터/래스터 타일을 클라이언트 사이드에서 재투영(Adaptive Composite Map Projection)하므로 **타일을 새로 만들 필요가 없다.**
- 사용 가능한 시네마 파라미터: `sky-color`, `sky-horizon-blend`, `horizon-color`, `horizon-fog-blend`, `fog-color`, `fog-ground-blend`, `atmosphere-blend`(3D 모드 전용, pitch 60° 이하에서 페이드아웃). **모두 interpolate 표현식 지원 + transitionable** → 줌/시간에 따라 하늘색을 부드럽게 바꿀 수 있다.
- 참고 구현: https://github.com/jonathanlurie/maplibre-demo (globe + light + sky + fog 한 파일 데모), Stadia 튜토리얼 https://docs.stadiamaps.com/tutorials/3d-globe-view-with-maplibre-gl-js/
- **주의(제약)**: v5 릴리스 노트상 Globe + Terrain3D 조합에서 Fog 렌더가 비활성화됨. 지구 뷰와 지형 뷰는 **분리된 씬으로 설계**하는 편이 안전하다.

#### E-4. Apple Maps Look Around / Flyover
- URL: https://www.apple.com/maps/ · 웹판 https://maps.apple.com · 비공식 뷰어 https://lookmap.skzk.dev/
- 살아 있게 만드는 것: **장면 간 전환이 스티칭된 사진 시퀀스가 아니라 거의 영상처럼 매끄럽다.** Google Street View의 "점프"와 결정적으로 다른 지점이 여기다. 지연 없이 미끄러지듯 이동.
- 교훈: Land-XI에서 지점 A → 지점 B 이동은 **절대 jumpTo 금지**. 모든 이동은 보간되어야 한다. 이것 하나가 "뻣뻣함"의 절반을 해결한다.

#### E-5. 네이버 지도 "플라잉뷰 3D" ★한국 사례
- URL: https://map.naver.com/ · 기사: https://www.sedaily.com/article/20044797
- 무엇: **3D Gaussian Splatting + NVS(Novel View Synthesis)** 로 실제 항공 촬영 이미지로부터 새로운 시점의 화면을 실시간 생성. 오차 약 4cm 이내.
- 살아 있게 만드는 것: "나뭇가지, 전선, 빛 반사 같은 복잡한 요소도 자연스럽게 렌더링" — 폴리곤 모델링으로는 불가능한 사실감. 향후 거리뷰 3D와 연계해 **공중↔지상을 끊김 없이 오가는 탐색**을 목표.
- Land-XI 적용: 한국 클라이언트가 이미 알고 있는 "최신 기준선". **경쟁 기준이 여기로 올라갔다는 사실 자체가 논거**다. 실제 3DGS 도입은 예산 밖일 수 있으나, "공중→지상 무봉합 전환" 개념은 카메라 연출만으로 흉내낼 수 있다(P-9).

#### E-6. V-World 3.0 (국토교통부/공간정보산업진흥원) ★한국 사례
- URL: https://www.vworld.kr/ · 3단계 서비스 보도: https://www.molit.go.kr/USR/NEWS/m_71/dtl.jsp?id=95090602 · https://www.etnews.com/20250115000170
- 무엇: 국가 공간정보 오픈 플랫폼. 3단계 고도화에서 **맞춤지도 제작, 3D 분석 5종 + 시뮬레이션 1종(일조권 분석, 드론 모의주행 등)** 추가.
- 살아 있게 만드는 것 / 반면교사: 기능은 풍부하나 **연출이 없다.** LX 클라이언트가 "우리도 V-World랑 뭐가 다르냐"는 질문을 반드시 할 것이므로, Land-XI의 차별점은 데이터가 아니라 **경험(카메라·시간·응답성)** 이라는 포지셔닝이 필요하다.
- 관련: K-Geo 플랫폼 https://kgeop.go.kr/ · 공간빅데이터 분석플랫폼 http://geobigdata.go.kr/ · 국토지리정보원 지도 https://map.ngii.go.kr/ · LX https://www.lx.or.kr/

#### E-7. 서울시 S-MAP ★한국 사례
- URL: https://smap.seoul.go.kr/ · 오픈랩 https://openlab.eseoul.go.kr/ · 소개: https://mediahub.seoul.go.kr/archives/2001139
- 무엇: 서울 전역 지형 + 약 60만 동 건물/시설물 3D. 공공건축물 388개 실내지도, 공시지가, CCTV 실시간 교통정보. **국내 최초 1인칭 "도보 모드"** 도입.
- 살아 있게 만드는 것: 공공기관이 "1인칭 시점"을 도입했다는 사실 — 즉 **공공 발주처도 이미 "체험"을 요구한다는 국내 선례.** 제안 설득 재료로 유용.

#### E-8. 카카오맵 3D 스카이뷰 ★한국 사례
- URL: https://map.kakao.com/
- 무엇: 모바일 앱은 벡터 지도 기반 360° 회전/기울이기 + 하늘에서 보는 실사 3D 스카이뷰. 항공사진 50cm급.
- 주의: **웹 버전은 여전히 비트맵 방식**으로 3D가 없다 → 웹에서 3D 지도 경험을 제공하면 국내 웹 기준으로는 그 자체가 차별점.

---

### F. AI 탐지 결과 시각화 / 제품 사이트

#### F-1. Terminal Industries (Awwwards SOTD, 2025-09-03) ★톤 레퍼런스
- URL: https://terminal-industries.com/ · Awwwards: https://www.awwwards.com/sites/terminal-industries · 제작: REJOUICE® + PROPAGANDE
- 무엇: AI 기반 야드(물류 하역장) 운영 플랫폼. 종합 7.68/10, 그중 **애니메이션·트랜지션 8.80/10** (최고점).
- 살아 있게 만드는 것: **항공 영상(aerial imagery) + 절제된 타이포 + 매끄러운 인터랙션**으로 복잡한 야드 물류를 서사로 바꿈. "3D → 와이어프레임" 스크롤 전환 마이크로 애니메이션. 모듈러 레이아웃 + 집중된 컬러 시스템.
- **Land-XI와 가장 유사한 문제 구조**(산업/B2B/공공 톤 + 항공 영상 + AI). "화려하지 않으면서 살아 있는" 정확한 좌표. 톤 레퍼런스로 최우선 제시 권장.

#### F-2. Skydio (X10 / 3D Scan)
- URL: https://www.skydio.com/x10 · https://www.skydio.com/blog/introducing-skydio-3d-scan
- 무엇: 자율 비행 드론. 3D Scan은 AI가 스캔 경로를 자율 계획해 구조물 전 표면을 촬영.
- 살아 있게 만드는 것: 제품 페이지가 **드론의 시점(POV) 영상**을 히어로로 쓴다. "장비 사진"이 아니라 "장비가 보는 것"을 보여준다.

#### F-3. DroneDeploy
- URL: https://www.dronedeploy.com/
- 무엇: 드론 영상 → 2D/3D 맵·포인트클라우드 처리 + 진행률 추적·품질 검증 레이어.
- 살아 있게 만드는 것: **"같은 장소, 여러 날짜"를 진행률(progress)로 서사화.** 정적인 측량 결과를 시간의 이야기로 바꾸는 것이 이 제품의 UX 핵심.

#### F-4. Pix4D
- URL: https://www.pix4d.com/ · Skydio 연동: https://support.pix4d.com/hc/processing-imagery-from-skydio-drones-with-pix4d-software
- 무엇: 포토그래메트리 처리 표준. 정사영상/DSM/포인트클라우드.
- 살아 있게 만드는 것: 처리 과정(sparse → dense → mesh)을 시각적으로 보여주는 것 자체가 콘텐츠. **"AI가 일하는 과정"의 시각화** 아이디어 소스.

#### F-5. Roboflow Playground / Workflows
- URL: https://playground.roboflow.com/object-detection · https://docs.roboflow.com/workflows/workflow-blocks/visualize-predictions/bounding-box-visualization
- 무엇: 브라우저에서 이미지 업로드 → 클래스 입력 → 실시간 바운딩 박스 결과. Bounding Box Visualization 블록은 색상/두께/모서리 라운딩 커스터마이즈.
- 살아 있게 만드는 것: **"내 이미지로 즉시 해보기"** 라는 단 하나의 인터랙션. 설명 없이 능력을 증명한다.
- Land-XI 적용: 홈에 **"이 정사영상에서 AI가 무엇을 찾았는지 직접 보기"** 데모 위젯. 실제 GeoJSON이 있으므로 페이크가 아니다.

#### F-6. Palantir Foundry Map / Gotham (HUD 문법)
- URL: https://www.palantir.com/docs/foundry/map/map-overview · https://www.palantir.com/platforms/gotham/
- 무엇: 좌측 패널(Layers / Find / Histogram / Info) + 상단 툴바(Select / Capture / Measure / Annotate / Delete) + 우측 패널(Selection / Time Selection / Series).
- 살아 있게 만드는 것: **"시간 선택(Time Selection)"이 우측 1급 패널로 승격**되어 있다는 점. 시간이 부가 기능이 아니라 축이다. 또한 히스토그램이 좌측 상시 노출 → 선택할 때마다 분포가 즉각 반응 = **브러싱-링킹(brushing & linking)**. 이게 "도구가 살아 있다"는 감각을 만든다.
- 톤 주의: Gotham의 다크 밀리터리 톤은 Land-XI의 "밝은 지도 + 유리 패널" 방향과 충돌한다. **레이아웃 문법만 가져오고 색은 가져오지 말 것.**

#### F-7. Felt
- URL: https://felt.com/ · UI 개선기: https://felt.com/blog/ui-upgrades · 인터페이스 투어: https://help.felt.com/getting-started/tour-the-interface
- 무엇: 협업형 웹 GIS. "지오스페이셜 FigJam"이라는 평.
- 살아 있게 만드는 것: **성능이 곧 디자인이라는 명시적 주장** — "일반 인터넷 지도는 팬/줌 리프레시에 30초 이상 걸리지만 Felt는 300ms 미만." 사용자 평 "the UI is immaculate."
- 교훈: **Land-XI의 "뻣뻣함"은 상당 부분 지연(latency)이다.** 300ms 이내 응답을 성능 예산으로 못 박아라.

---

### G. 서사/스크롤 연출 (지도 밖 레퍼런스, 문법용)

#### G-1. Awwwards Sites of the Year & 최근 몰입형 트렌드
- URL: https://www.awwwards.com/websites/sites_of_the_year/ · Three.js 컬렉션 https://www.awwwards.com/awwwards/collections/three-js/ · 분석 글 https://metabole.studio/en/blog/immersive-website-examples · https://www.utsubo.com/blog/best-threejs-websites-2026
- 핵심 발견: **스크롤 기반 3D 서사가 정적 3D 쇼케이스보다 Awwwards 10점 척도에서 평균 1.8점 높다.** → "멋진 3D 오브젝트"보다 "스크롤로 진행되는 3D 장면"이 심사·클라이언트 모두에게 강하다.
- Lando Norris (OFF+BRAND, SOTY 2025): 시네마틱 스크롤 시퀀스 + 읽기 진행에 맞춰 회전하는 3D 헬멧.
- Cartier Watches & Wonders (Immersive Garden): Three.js + GLSL + **GSAP + Lenis** + Web Audio. 스크롤로 6개의 3D 방을 이동. https://www.cartier.com/watchesandwonders
- Explore Primland: https://explore.ownprimland.com — **실제 지형 위를 안개 효과와 함께 스크롤로 카메라를 제어하며 비행.** Land-XI 히어로와 가장 유사한 구조.
- Shopify Editions: https://www.shopify.com/editions — 스크롤 시퀀스 제품 공개 + 파티클로 흩어지는 타이포그래피.
- 성능 원칙(공통): "instancing, baked lighting, BVH collision, byte budgets" — 그리고 **"one hard idea" — 효과를 쌓지 말고 하나의 강한 아이디어에 집중.**

#### G-2. NYT Visual Investigations (moviescroller)
- URL: https://www.nytimes.com/spotlight/visual-investigations · 사례 해설 https://data.europa.eu/apps/data-visualisation-guide/scrollytelling-moviescroller · Derek Watkins https://dwtkns.com/ ("Hell On Earth: The first 12 hours of California's Deadliest Wildfire", Malofiej 27 Gold Best Map)
- 살아 있게 만드는 것: **"moviescroller"** — 항공 영상과 3D 렌더 사이를 스크롤로 전환하며 사건을 설명. 즉 **실사(정사영상) ↔ 추상(3D/데이터) 사이의 크로스페이드**가 서사 장치.
- Land-XI 적용: 정사영상 ↔ AI 탐지 마스크 ↔ 통계 추상화, 3단 크로스페이드. 정확히 우리가 가진 재료로 만들 수 있다.

---

## 2. 재사용 가능한 인터랙션 패턴 15개 (바닐라 JS + MapLibre v5 + WebGL)

난이도: ★ = 반나절, ★★ = 1~2일, ★★★ = 3~5일, ★★★★ = 1주+

| # | 패턴 | 무엇을 하는가 | 구현 핵심 | 난이도 | 출처 |
|---|---|---|---|---|---|
| P-1 | **시네마틱 카메라 5문법** | 모든 지도 이동을 Orbit / Point-to-Point / Zoom-to-Point / Spiral / Overview 5종으로 통일 | `map.easeTo({center, zoom, pitch, bearing, duration, easing})`. Orbit은 rAF로 `bearing += 0.08` 지속 회전(`animate-map-camera-around-a-point` 예제). `jumpTo` 전면 금지 | ★ | Google Earth Studio, Apple Flyover |
| P-2 | **시간대 조명 프리셋 (Dawn/Day/Dusk/Night)** | 슬라이더 하나로 지도 전체의 색온도·하늘·안개·hillshade 방향이 바뀜 | MapLibre `map.setSky({'sky-color','horizon-color','fog-color','horizon-fog-blend','atmosphere-blend'})` + `setLight({anchor:'map', position:[r,az,polar], color, intensity})` + hillshade `hillshade-illumination-direction`. 모든 값 transitionable이라 CSS transition처럼 부드럽게 전환 | ★★ | Mapbox Standard, MapLibre Sky spec |
| P-3 | **스크롤 안무 (map choreography)** | 스크롤 챕터 ↔ 카메라 상태 + 레이어 opacity를 바인딩 | `IntersectionObserver`로 챕터 진입 감지 → `easeTo` + `setPaintProperty(layer,'raster-opacity', v)`. 관성은 Lenis(CDN) 또는 직접 lerp. Mapbox storytelling의 config JSON 스키마를 그대로 채택 | ★★ | Mapbox Storytelling, Esri Sidecar, NYT |
| P-4 | **스파이글래스 렌즈 (커서=과거)** | 마우스를 따라다니는 원형 창 안에만 과거 영상/AI 마스크가 보임 | 방법 A: MapLibre 2개 인스턴스 동기화 + 상단 지도에 `clip-path: circle(140px at Xpx Ypx)`. 방법 B(고급): 커스텀 레이어 프래그먼트 셰이더에서 화면좌표 거리로 mix(). 커서 위치는 lerp로 지연 추종시켜야 "무겁고 부드럽게" 느껴짐 | ★★ | Esri Spyglass, Vexcel |
| P-5 | **필름 스트립 타임 스크러버** | 하단에 시점(촬영일) 썸네일 스트립, 드래그 스크럽 + 재생 버튼 | 시점별 raster source를 모두 등록해두고 opacity 크로스페이드. **모든 시점 타일을 사전 프리로드**(Zoom Earth 방식)해야 스크럽이 영상처럼 느껴짐. 1x/2x/4x 속도 | ★★ | Planet Explorer, kepler.gl playback, NASA Worldview |
| P-6 | **탐지 pop-in 시퀀스** | 카메라 도착 후 AI 탐지 박스/폴리곤이 0.04초 간격으로 순차 등장 | GeoJSON feature마다 `t` 속성을 부여하고 `['interpolate',['linear'],['get','t'], ...]` 또는 deck.gl `getFillColor` + `transitions:{getFillColor:400}`. 등장은 scale-up + 알파 페이드, 이징은 `easeOutBack` 소량 | ★★ | Roboflow, Nearmap AI |
| P-7 | **파동 링 / 펄스 마커** | 탐지 지점에서 링이 퍼지며 사라짐. "지금 감지됨"의 신호 | deck.gl `ScatterplotLayer` 2겹 + rAF로 radius/alpha 갱신, 또는 MapLibre `addImage`에 canvas 애니메이션 이미지 등록(공식 pulsing-dot 예제 패턴). 지수 이징 `v += (1-v)*0.06` | ★ | GitHub Globe, Stripe |
| P-8 | **arc 흐름 (미션/물류/해류)** | 곡선 arc가 2.5초에 걸쳐 그려지고 잔광이 남음 | deck.gl `ArcLayer` + `getTilt`, 또는 three.js `TubeBufferGeometry` + `setDrawRange()` 증분. 대권/베지어 경로. **흐르는 dash**는 `LineLayer` + 셰이더 uniform time | ★★ | Stripe Globe, GitHub Globe, kepler.gl |
| P-9 | **공중 → 지상 무봉합 하강** | 전국 뷰에서 한 지점으로 내려가며 pitch 0°→65°로 눕고 지형이 솟아오름 | `flyTo({curve:1.42, speed:0.5, pitch:65, zoom:16.5})` 한 번에. 도착 직전 `setTerrain({source:'dem', exaggeration:1.4})` 활성화 + `atmosphere-blend` 페이드. **한 번의 연속 동작으로** 처리하는 것이 핵심 | ★★★ | 네이버 플라잉뷰, Apple Flyover, Explore Primland |
| P-10 | **파티클 흐름 레이어** | 해류/바람/확산을 GPU 파티클로 표현 | mapbox/webgl-wind 코드를 MapLibre `CustomLayerInterface`로 포팅(구조 거의 동일). 위치를 텍스처(R=u,G=v)에 인코딩, TTL 만료 시 랜덤 재배치, 이전 프레임 fade 누적으로 궤적 | ★★★★ | Windy, deck.gl Wind Map |
| P-11 | **브러싱 & 링킹 HUD** | 지도에서 영역 선택 → 히스토그램·KPI·리스트가 동시 갱신, 역방향도 동일 | 단일 상태 저장소 + `queryRenderedFeatures()`. hover 시 `feature-state`로 하이라이트(리렌더 없이). 숫자는 CountUp lerp로 **굴러가며** 변경 | ★★ | Palantir Foundry Map, kepler.gl |
| P-12 | **proof-of-life 툴팁** | hover 시 실제 촬영일·좌표·신뢰도·모델명·처리시각을 노출 | 마우스 추종 글래스 카드. **반드시 실제 메타데이터**여야 함. 좌표는 소수점 6자리까지 그대로 노출 — "진짜"의 증거 | ★ | GitHub Globe (핵심 교훈) |
| P-13 | **SVG → Canvas 크로스페이드 부팅** | 첫 페인트에 즉시 지도/글로브 정지 이미지가 보이고, WebGL 준비되면 크로스페이드 | 저해상도 정적 이미지(또는 그라디언트 SVG)를 미리 두고 Web Animations API로 opacity+scale 동시 전환. 전환 중 DOM 미접촉 | ★ | GitHub Globe, Stripe |
| P-14 | **성능 자동 강등(quality tiers)** | FPS 저하 시 파티클 수·픽셀비·raycast 빈도를 단계적으로 낮춤 | 50프레임 이동평균 FPS < 55.5 → tier 강등. `devicePixelRatio` 2.0→1.5, deck.gl 레이어 개수 축소, **antialias:false 기본** | ★★ | GitHub Globe, Stripe (antialias 끄기가 결정적) |
| P-15 | **앰비언트 사운드 + 인터랙션 사운드 (옵션)** | 저음의 대기음 + 탐지 pop 시 짧은 클릭음. 기본 OFF, 우상단 토글 | Web Audio API. **반드시 명시적 opt-in.** 공공기관 발표 환경에서 자동 재생은 금물이나, 토글이 존재하는 것만으로 "제작 수준"의 신호가 됨 | ★★ | Cartier W&W, Awwwards 상위작 공통 |

### 스택 결정 노트
- **deck.gl은 `MapboxOverlay`의 interleaved 모드로 붙일 것.** `beforeId`를 지정해 라벨 아래에 데이터가 깔리게 해야 오버레이가 "붕 뜨지" 않는다. https://deck.gl/docs/developer-guide/base-maps/using-with-maplibre · https://deck.gl/gallery/maplibre-overlay
- **MapLibre v5 Globe + Terrain3D 동시 사용 시 Fog가 비활성화**된다(v5 릴리스 노트). 지구 씬과 지형 씬을 분리 설계하라.
- `atmosphere-blend`는 3D 모드 전용이며 **pitch 60° 이하에서 페이드아웃, 그 아래로는 사라진다** — 대기감을 원하면 pitch를 유지해야 한다.
- three.js는 글로브 히어로 전용으로만 쓰고, 지도 화면에서는 deck.gl로 통일하는 편이 유지보수·성능 모두 유리하다.

---

## 3. Top-3 방향 제안 — LX 클라이언트가 "우와" 할 지점

### 방향 1 (최우선 권장) — **"국토가 숨쉰다": 시간이 주인공인 홈**
> 한 줄 컨셉: **스크롤 한 번으로 지구 → 대한민국 → 남원의 한 필지까지, 끊김 없이 4년을 통과한다.**

- **구성**: 진입 시 MapLibre v5 **globe projection** + 대기(atmosphere) 위에 한반도가 자전으로 들어옴 (P-13으로 첫 페인트 즉시 이미지). 스크롤 챕터 1 → 전국 탐지 밀도가 파동 링으로 순차 점화(P-7). 챕터 2 → **P-9 무봉합 하강**으로 남원 상공에 도착, pitch 65°로 눕고 지형이 솟음. 챕터 3 → 정사영상 4시점이 필름 스트립으로 스크럽(P-5), 스크럽에 맞춰 AI 탐지 폴리곤이 나타나고 사라짐. 챕터 4 → 카메라가 대상 주위를 천천히 Orbit 하며(P-1) 실제 메타데이터 툴팁이 붙음(P-12). 배경 조명은 챕터 진행에 따라 Dawn → Day → Dusk로 이행(P-2).
- **왜 "우와"인가**: 
  1. 한국 공공 발주처가 본 적 있는 최고치는 V-World 3.0과 S-MAP인데, 둘 다 **"기능은 있고 연출은 없다."** 같은 데이터를 가지고 "영화처럼 움직이는" 화면을 보여주는 순간 비교 우위가 즉시 성립한다.
  2. 네이버 플라잉뷰 3D가 이미 국내 기준선을 올려놨다(3DGS, 4cm). 우리는 3DGS를 못 하지만 **"공중↔지상 무봉합"이라는 그 경험적 약속은 카메라 연출만으로 만족시킬 수 있다.** 클라이언트는 기술명이 아니라 그 느낌을 기억한다.
  3. **시간축은 LX의 본질적 자산**이다. 지적/국토 조사는 곧 "변화의 기록"이므로, 시간 스크럽은 장식이 아니라 사업 정체성의 시각화다. "왜 이런 화면이 필요한가"에 대한 방어 논리가 자동으로 선다.
- **리스크**: 스크롤 하이재킹 피로. → 챕터 4개 이하로 제한하고, 상단에 "건너뛰고 지도 열기" 상시 노출.

### 방향 2 — **"AI가 일하는 것을 본다": 증명형 데모 위젯**
> 한 줄 컨셉: **설명하지 말고, 눈앞에서 찾아내라.**

- **구성**: 홈 중단에 실제 남원 정사영상 타일을 띄운 소형 인터랙티브 카드. 사용자가 클릭(또는 자동 재생) → 스캔 라인이 한 번 훑고 지나가며(P-6 + 얇은 그라디언트 라인 셰이더) 탐지 결과가 0.04초 간격으로 pop-in. 각 박스에 신뢰도 %가 카운트업. 좌하단에 "모델 v2.3 · 처리 1.42초 · 탐지 37건 · 촬영 2025-04-11" 같은 **실제 메타데이터 HUD**(P-12). 카테고리 탭(해양쓰레기 / 농지 / 불법건축물 / 포트홀)을 누르면 같은 영상 위에서 마스크만 교체되며 크로스페이드.
- **왜 "우와"인가**: Roboflow Playground가 증명한 구조 — **"내 눈앞에서 즉시"가 어떤 설명보다 강하다.** 그리고 이 위젯은 페이크가 아니다. 실제 GeoJSON이 있으므로 클라이언트가 "이거 진짜예요?"라고 물었을 때 좌표를 짚어줄 수 있다. **바로 이 순간이 "인간미/신뢰"가 생기는 지점**이며, 클라이언트가 지적한 "시안 목업 수준"을 가장 직접적으로 반박한다.
- **보너스**: 4개 도메인을 한 위젯에서 탭 전환하면 "플랫폼"이라는 주장이 시각적으로 증명된다. 페이지를 4개 만드는 것보다 강하다.

### 방향 3 — **"지휘소": 살아 있는 대시보드**
> 한 줄 컨셉: **도구 모드에서도 화면은 절대 멈추지 않는다.**

- **구성**: 밝은 지도 + 글래스 패널 3분할 — 좌측 레이어/필터, 하단 타임 스크러버, 우측 선택/히스토그램/시리즈(Palantir Foundry 레이아웃 문법, 색은 라이트 글래스). 핵심은 **브러싱-링킹(P-11)**: 지도에서 사각형 드래그 → 우측 히스토그램·KPI가 lerp 카운트업으로 굴러가며 갱신, 히스토그램 막대에 hover → 지도의 해당 탐지들이 동시 하이라이트. 상시 미세 모션으로 (a) 최신 탐지 3건이 파동 링으로 점멸(P-7), (b) 드론 미션 경로가 dash 흐름(P-8), (c) 조명 프리셋이 실제 현재 시각을 따라감(P-2). "리포트 모드" 버튼 → 같은 지도가 sidecar 스토리 레이아웃으로 접히며 발표용 서사로 전환(P-3), "지도 모드"로 되돌아옴 — **스토리 ↔ 도구의 무봉합 전환.**
- **왜 "우와"인가**: 
  1. 공공기관 실무자는 결국 **"보고서를 뽑아야 한다."** 대시보드가 그대로 발표 장표로 접히는 전환은 심미가 아니라 업무 가치이고, 의사결정권자에게 가장 잘 팔린다(NASA Worldview의 GIF 내보내기와 같은 논리).
  2. Felt의 교훈 — **300ms 미만 응답이 곧 "고급스러움"이다.** hover 하이라이트는 `feature-state`로 리렌더 없이, 숫자는 굴러가며, 패널은 미끄러진다. 이 세 가지만으로 "뻣뻣하다"는 평가는 사라진다.
  3. 상시 미세 모션(a/b/c)은 **비용이 거의 0인데 체감 차이가 가장 크다.** 정지된 대시보드는 스크린샷처럼 보이고, 3개 요소만 움직이면 "가동 중인 시스템"으로 보인다.

### 세 방향의 관계
방향 1은 **첫인상(홈 상단)**, 방향 2는 **신뢰 획득(홈 중단)**, 방향 3은 **실사용 가치(대시보드)** 를 담당한다. 셋은 경쟁 관계가 아니라 하나의 퍼널이며, **P-2(조명 프리셋)·P-1(카메라 5문법)·P-12(proof-of-life 툴팁)** 세 패턴을 공유해 전 화면의 톤을 통일한다.

### 만약 하나만 만들어야 한다면
**방향 2 (증명형 데모 위젯)** 를 먼저 만들어라. 구현비가 가장 낮고(★★), "목업이 아니다"라는 반박이 가장 직접적이며, 클라이언트 회의실에서 노트북 하나로 시연 가능하다. 그 다음 방향 1의 P-9 하강 한 컷을 붙이면 회의 분위기가 바뀐다.

---

## 4. 안티패턴 (하지 말 것)

1. **`jumpTo` / 즉시 상태 변경** — "뻣뻣함"의 1순위 원인. 모든 전환에 duration을 부여하라.
2. **효과 쌓기** — Awwwards 분석의 결론은 "one hard idea". 파티클·블룸·글리치를 동시에 쓰면 싸구려로 보인다.
3. **Palantir 다크 밀리터리 톤 차용** — LX는 공공 서비스 기관이다. 레이아웃 문법만 가져오고 색은 밝은 글래스 유지.
4. **타일 로딩 시 흰 사각형 노출** — 즉시 "미완성"으로 읽힌다. 저해상도 블러 placeholder 필수.
5. **자동 재생 사운드** — 공공기관 시연 환경에서 치명적. 반드시 opt-in 토글.
6. **가짜 로딩 애니메이션** — 실제 처리 시간을 시각화하는 것은 좋지만, 없는 대기를 만들면 들킨다.
7. **`antialias: true` 기본값 방치** — Stripe가 명시한 결정적 성능 함정.

---

## 5. 출처 목록

**스토리텔링/카메라**
- https://github.com/mapbox/storytelling
- https://www.mapbox.com/blog/how-to-build-a-scrollytelling-map
- https://www.mapbox.com/blog/interactive-storytelling-3d-maps-with-mapbox-gl-js-v2
- https://developmentseed.org/gl-director/
- https://www.google.com/earth/studio/
- https://earth.google.com/studio/docs/making-animations/keyframes/
- https://www.esri.com/arcgis-blog/products/arcgis-storymaps/mapping/choreograph-your-maps-with-arcgis-storymaps/
- https://www.esri.com/arcgis-blog/products/arcgis-storymaps/mapping/the-pleasures-of-3d-storytelling-with-arcgis-storymaps
- https://storymaps.arcgis.com/stories/ed52cfb9de4d4ec6b87dae906b171e66
- https://earth.google.com/web/
- https://ubilabs.net/en/projects/google-earth-remake-voyager

**글로브/WebGL**
- https://github.blog/engineering/engineering-principles/how-we-built-the-github-globe/
- https://github.com/janarosmonaliev/github-globe
- https://stripe.com/blog/globe
- https://github.com/vasturiano/globe.gl
- https://github.com/vasturiano/three-globe

**데이터/파티클**
- https://deck.gl/showcase
- https://deck.gl/gallery/
- https://deck.gl/gallery/maplibre-overlay
- https://deck.gl/docs/developer-guide/base-maps/using-with-maplibre
- https://philogb.github.io/page/wind/
- https://fairinternetreport.com/research/internet-speed-map-single-day
- https://useradiance.com
- https://flowmap.blue/
- https://kepler.gl/
- https://docs.kepler.gl/docs/user-guides/h-playback
- https://www.uber.com/blog/keplergl/
- https://www.windy.com/
- https://blog.mapbox.com/how-i-built-a-wind-map-with-webgl-b63022b5537f
- https://github.com/mapbox/webgl-wind
- https://www.flightradar24.com/blog/inside-flightradar24/exploring-the-new-flightradar24-3d-view/
- https://globe.adsbexchange.com/
- https://globalfishingwatch.org/our-map/
- https://theoceancleanup.com/plastic-tracker/
- https://www.mapbox.com/showcase/the-ocean-cleanup
- https://www.mapbox.com/blog/tackling-ocean-plastic-pollution-in-4-maps
- https://earthtime.org/

**영상 뷰어**
- https://www.planet.com/explorer
- https://www.planet.com/pulse/introducing-planet-explorer-beta/
- https://worldview.earthdata.nasa.gov/
- https://eyes.nasa.gov/apps/earth/
- https://zoom.earth/
- https://www.sentinel-hub.com/explore/eobrowser/
- https://www.esri.com/arcgis-blog/products/arcgis-online/mapping/swipe-compare-apps
- https://livingatlas.arcgis.com/wayback/
- https://www.nearmap.com/
- https://vexceldata.com/stories/your-view-just-got-an-upgrade-new-updates-to-viewer/
- https://open-data.umbra.space/browse/
- https://blacksky.com/

**3D 도시/엔진**
- https://cesium.com/platform/cesium-ion/
- https://cesium.com/blog/2023/10/26/photorealistic-3d-tiles-in-cesium-ion/
- https://docs.mapbox.com/map-styles/standard/guides/
- https://www.mapbox.com/blog/standard-core-style
- https://www.mapbox.com/blog/global-cities-3d-landmarks
- https://www.mapbox.com/blog/3d-maps-showcase
- https://maplibre.org/projects/gl-js/
- https://github.com/maplibre/maplibre-gl-js/releases/tag/v5.0.0
- https://maplibre.org/roadmap/maplibre-gl-js/globe-view/
- https://maplibre.org/maplibre-style-spec/sky/
- https://maplibre.org/maplibre-gl-js/docs/examples/display-a-globe-with-an-atmosphere/
- https://maplibre.org/maplibre-gl-js/docs/examples/sky-fog-terrain/
- https://maplibre.org/maplibre-gl-js/docs/examples/animate-map-camera-around-a-point/
- https://maplibre.org/maplibre-gl-js/docs/examples/customize-camera-animations/
- https://maplibre.org/maplibre-gl-js/docs/examples/slowly-fly-to-a-location/
- https://github.com/jonathanlurie/maplibre-demo
- https://docs.stadiamaps.com/tutorials/3d-globe-view-with-maplibre-gl-js/
- https://www.apple.com/maps/
- https://lookmap.skzk.dev/

**한국 사례**
- https://www.sedaily.com/article/20044797 (네이버 플라잉뷰 3D, 3D Gaussian Splatting)
- https://www.vworld.kr/
- https://www.molit.go.kr/USR/NEWS/m_71/dtl.jsp?id=95090602
- https://www.etnews.com/20250115000170
- https://smap.seoul.go.kr/
- https://mediahub.seoul.go.kr/archives/2001139
- https://openlab.eseoul.go.kr/
- https://kgeop.go.kr/
- http://geobigdata.go.kr/
- https://map.ngii.go.kr/
- https://map.kakao.com/
- https://www.lx.or.kr/

**드론/AI 제품 & 톤**
- https://terminal-industries.com/
- https://www.awwwards.com/sites/terminal-industries
- https://www.skydio.com/x10
- https://www.skydio.com/blog/introducing-skydio-3d-scan
- https://www.dronedeploy.com/
- https://www.pix4d.com/
- https://playground.roboflow.com/object-detection
- https://docs.roboflow.com/workflows/workflow-blocks/visualize-predictions/bounding-box-visualization
- https://www.palantir.com/docs/foundry/map/map-overview
- https://www.palantir.com/platforms/gotham/
- https://felt.com/
- https://felt.com/blog/ui-upgrades
- https://help.felt.com/getting-started/tour-the-interface

**서사/연출 트렌드**
- https://www.awwwards.com/websites/sites_of_the_year/
- https://www.awwwards.com/awwwards/collections/three-js/
- https://metabole.studio/en/blog/immersive-website-examples
- https://www.utsubo.com/blog/best-threejs-websites-2026
- https://explore.ownprimland.com
- https://www.cartier.com/watchesandwonders
- https://www.shopify.com/editions
- https://data.europa.eu/apps/data-visualisation-guide/scrollytelling-moviescroller
- https://dwtkns.com/
