# Palantir 벤치마크 심층 리서치 — Land-XI 개편용

- 작성일: 2026-08-25
- 대상: Land-XI (LX 국토정보공사 Geo-AI 플랫폼) 화면 개편
- 배경: 발주처가 Palantir를 벤치마크로 지정. 1차 시안은 "뻣뻣하다 / 시네마가 없다 / 인터랙션이 없다 / 사람 냄새가 없다"는 이유로 반려됨.
- 제약: 지도 바탕은 **라이트**(밝은 지도) + 글라스 패널. 단, 시네마틱 장면에 한해 **다크 "ops 모드"** 허용.

---

## 0. 조사 방법과 1차 출처

이 문서는 (a) Palantir 공식 제품/개발자 문서, (b) Blueprint 디자인 시스템 **소스 코드**(SCSS 변수 원본), (c) Palantir 블로그·마케팅 페이지, (d) 언론·커뮤니티 기록을 교차 확인해 작성했다. 마케팅 페이지 상당수는 JS 렌더링이라 본문 추출이 막혀 있어, **개발자 문서(docs)를 1차 사료**로 삼았다. 문서는 실제 제품 UI의 라벨을 그대로 쓰기 때문에 마케팅 카피보다 훨씬 정확하다.

주요 출처:

- Blueprint 색 토큰 원본: https://raw.githubusercontent.com/palantir/blueprint/develop/packages/colors/src/_colors.scss
- Blueprint 코어 변수 원본: https://raw.githubusercontent.com/palantir/blueprint/develop/packages/core/src/common/_variables.scss
- Blueprint 색 별칭(라이트/다크 매핑): https://raw.githubusercontent.com/palantir/blueprint/develop/packages/core/src/common/_color-aliases.scss
- Blueprint 타이포그래피: https://raw.githubusercontent.com/palantir/blueprint/develop/packages/core/src/_typography.scss
- Blueprint 저장소/문서: https://github.com/palantir/blueprint , https://blueprintjs.com/docs/
- Blueprint 4.x 체인지로그(다크 테마 변경): https://github.com/palantir/blueprint/wiki/4.x-Changelog
- Blueprint 아이콘 16/20px 규칙: https://github.com/palantir/blueprint/tree/develop/resources/icons/16px , https://deepwiki.com/palantir/blueprint/9-icons-system
- 디자인시스템 서베이: https://designsystems.surf/design-systems/palantir
- Foundry Workshop Map 위젯(전체 옵션): https://www.palantir.com/docs/foundry/workshop/widgets-map
- Foundry Map 스타일링: https://www.palantir.com/docs/foundry/map/styling
- Foundry Map 포인트 렌더링: https://www.palantir.com/docs/foundry/map/visualize-points
- Foundry Map 히스토그램/필터: https://www.palantir.com/docs/foundry/map/histogram
- Foundry Map 레이어 에디터: https://www.palantir.com/docs/foundry/map/layer-editor
- Foundry Map 설정: https://www.palantir.com/docs/foundry/map/settings
- Workshop 위젯 카탈로그: https://www.palantir.com/docs/foundry/workshop/concepts-widgets
- Workshop 레이아웃: https://www.palantir.com/docs/foundry/workshop/concepts-layouts
- Gotham 연동(심볼로지/MIL-STD 2525/Gaia): https://www.palantir.com/docs/foundry/object-link-types/enable-gotham-integration
- Vertex 그래프 탐색: https://www.palantir.com/docs/foundry/vertex/explore-object-relationships
- Object Explorer 차트/필터: https://www.palantir.com/docs/foundry/object-explorer/explore-charts , https://www.palantir.com/docs/foundry/object-explorer/filter-results
- Quiver 시계열: https://www.palantir.com/docs/foundry/quiver/overview , https://www.palantir.com/docs/foundry/quiver/timeseries-visualize , https://www.palantir.com/docs/foundry/quiver/timeseries-search-anomalies
- AIP Logic 핵심 개념(디버거/CoT): https://www.palantir.com/docs/foundry/logic/core-concepts
- AIP Agent 위젯: https://www.palantir.com/docs/foundry/workshop/widgets-aip-agent
- AIP Chatbot 위젯: https://www.palantir.com/docs/foundry/workshop/widgets-aip-chatbot
- AIP Evals: https://www.palantir.com/docs/foundry/aip-evals/overview , https://www.palantir.com/docs/foundry/aip-evals/analyze-run-results
- Palantir 블로그(생성형 AI 평가 필드매뉴얼): https://blog.palantir.com/evaluating-generative-ai-a-field-manual-0cdaf574a9e1
- Palantir 블로그(책임있는 AI, 테스트/평가): https://blog.palantir.com/from-prototype-to-production-engineering-responsible-ai-3-ea18818cd222
- Palantir 블로그(Blueprint로 제품 디자인 확장): https://blog.palantir.com/scaling-product-design-with-blueprint-25492827bb4a
- Ontology 핵심 개념: https://www.palantir.com/docs/foundry/ontology/overview , https://www.palantir.com/docs/foundry/ontology/core-concepts
- Action types: https://www.palantir.com/docs/foundry/action-types/overview
- Gotham/Titanium 제품 페이지: https://www.palantir.com/platforms/gotham/ , https://www.palantir.com/titanium/ , https://www.palantir.com/palantir-gotham/titan/
- Titan 릴리스 인터뷰: https://ctovision.com/the-titan-release-of-palantir-gotham/
- MetaConstellation: https://www.palantir.com/offerings/metaconstellation/ , https://www.youtube.com/watch?v=r8LtdKFcAvg
- Edge AI in Space 블로그: https://blog.palantir.com/updates-from-palantir-edge-ai-in-space-1b4d8b8f97a0
- AIPCon 데모: https://www.palantir.com/aipcon/ , https://www.palantir.com/aipcon4/demos/ , https://www.youtube.com/watch?v=Xt_RLNx1eBM , https://www.youtube.com/watch?v=akieze8_tSE , https://www.youtube.com/watch?v=nQW4dPh1Vzs
- 언론/외부 기록: https://time.com/6293398/palantir-future-of-warfare-ukraine/ , https://www.vice.com/en/article/revealed-this-is-palantirs-top-secret-user-manual-for-cops/
- Gotham 서비스 정의서(G-Cloud 14): https://assets.applytosupply.digitalmarketplace.service.gov.uk/g-cloud-14/documents/92736/801146272055049-service-definition-document-2024-11-26-1253.pdf
- 커뮤니티(다크테마 요구): https://community.palantir.com/t/dark-color-theme-for-foundry/1471
- Foundry 다크 모드 설정: https://www.palantir.com/docs/foundry/carbon/dark-mode , https://www.palantir.com/docs/foundry/custom-widgets/dark-theme
- 디자인 사례: https://dribbble.com/shots/1624908-Palantir-Gotham-Case-Study , https://dribbble.com/tags/palantir

---

## 1. Palantir의 시각·인터랙션 언어 해부

### 1.1 Blueprint 토큰 — 실측값 (추정 아님, 소스 원본)

Palantir의 모든 제품 UI는 오픈소스 디자인 시스템 **Blueprint**를 뼈대로 한다. designsystems.surf는 Blueprint를 "데스크톱 애플리케이션의 복잡하고 데이터 밀도가 높은 인터페이스 구축에 최적화된 툴킷"으로 정의한다. Foundry의 Slate 앱 문서도 Slate가 "Palantir 오픈소스 Blueprint 프레임워크 위에 구축되어 위젯에 일관된 룩앤필과 내장 다크모드 토글을 제공한다"고 명시한다. 실제 SCSS 원본에서 뽑은 값은 다음과 같다.

**그레이 램프 (11단계 + 흑백)**

- black `#111418`, white `#ffffff`
- dark-gray: `#1c2127` / `#252a31` / `#2f343c` / `#383e47` / `#404854`
- gray: `#5f6b7c` / `#738091` / `#8f99a8` / `#abb3bf` / `#c5cbd3`
- light-gray: `#d3d8de` / `#dce0e5` / `#e5e8eb` / `#edeff2` / `#f6f7f9`

핵심: 그레이가 **완전 중성이 아니라 청록 쪽으로 기운 슬레이트**다. `#5f6b7c`는 R<G<B. 이 미세한 한기(寒氣)가 "군용 계기판" 느낌의 8할을 만든다. 우리 `--ink:#111C2D`는 오히려 Blueprint보다 더 파랗다 — 방향은 맞다.

**코어 인텐트 (각 5단계, 3번이 기준값)**

- blue: `#184a90 / #215db0 / #2d72d2 / #4c90f0 / #8abbff` → intent-primary = blue3 `#2d72d2`
- green: `#165a36 / #1c6e42 / #238551 / #32a467 / #72ca9b` → intent-success = `#238551`
- orange: `#77450d / #935610 / #c87619 / #ec9a3c / #fbb360` → intent-warning = `#c87619`
- red: `#8e292c / #ac2f33 / #cd4246 / #e76a6e / #fa999c` → intent-danger = `#cd4246`

**확장 팔레트 (데이터 시각화용 10색)**: vermilion `#d33d17`, rose `#db2c6f`, violet `#9d3f9d`, indigo `#7961db`, cerulean `#147eb3`, turquoise `#00a396`, forest `#29a634`, lime `#8eb125`, gold `#d1980b`, sepia `#946638` (각각 1~5단계 보유). **범주형 색은 반드시 이 확장 팔레트에서, 상태색은 인텐트 4색에서** — 이 분리가 Palantir 차트가 절대 촌스러워지지 않는 이유다.

**라이트/다크 별칭 매핑** (`_color-aliases.scss`)

| 역할 | 라이트 | 다크 |
|---|---|---|
| app 배경 | light-gray5 `#f6f7f9` | dark-gray1 `#1c2127` |
| 보조 배경 | white | dark-gray1 (배경과 동일) |
| 상승 배경(elevated) | light-gray4 `#edeff2` | dark-gray3 `#2f343c` |
| 본문 텍스트 | dark-gray1 `#1c2127` | light-gray5 `#f6f7f9` |
| 뮤티드 텍스트 | gray1 `#5f6b7c` | gray4 `#abb3bf` |
| 비활성 텍스트 | rgba(gray1,.6) | rgba(gray4,.6) |
| 아이콘 기본 | 뮤티드 텍스트색 | 뮤티드 텍스트색 |
| 아이콘 hover | 본문 텍스트색 | 본문 텍스트색 |
| 아이콘 selected | intent-primary | intent-primary |
| 디바이더 | rgba(black,.15) / muted .1 | rgba(black,.4), rgba(white,.2) / muted .1 |

**중요한 구조적 통찰 3가지**

1. **아이콘 기본색 = 뮤티드 텍스트색**. Palantir UI에서 아이콘은 기본 상태에서 "꺼져" 있고, hover에서 본문색으로 올라오고, 선택되면 파랑으로 켜진다. 툴바에 아이콘 20개가 있어도 시끄럽지 않은 이유. 우리 시안이 뻣뻣해 보이는 흔한 원인이 "모든 아이콘이 처음부터 진하게 켜져 있음"이다.
2. **다크 테마 배경과 보조 배경이 같다** (둘 다 dark-gray1). 다크에서는 면 분리를 배경색이 아니라 **1px 흰색 반투명 보더**(rgba(white,.2))로 한다. 다크 ops 모드를 만들 때 카드마다 다른 회색을 쓰면 즉시 아마추어처럼 보인다.
3. 4.x 체인지로그는 "다크 테마 스타일이 팔레트에서 한 단계 더 어두워졌고, 그 결과 기본 배경이 더 어두워져 Card/Dialog/Button/Popover 전반에 흰색 보더를 더 일관되게 쓸 수 있게 됐다"고 기록한다. 즉 **다크 = 더 어두운 배경 + 더 또렷한 1px 라인**이라는 명시적 설계 결정이다.

**치수·타이포 (실측)**

- 기본 간격 단위 spacing `4px` (레거시 grid-size `10px` 병존), 라운드 `4px`
- 본문 `14px` / large `16px` / small `12px`, line-height `1.28581`
- 헤딩: h1 36/40, h2 28/32, h3 22/25, h4 18/21, h5 16/19, h6 14/16 (px, font-size/line-height)
- 버튼 높이 30 / small 24 / smaller 20 / large 40 · 인풋 30 / 24 / 40 · **네비바 50px**
- 아이콘 16px(표준) / 20px(라지). 아이콘은 16px·20px **두 벌의 별도 SVG**로 관리되며(`resources/icons/16px`, `resources/icons/20px`, 동일 kebab-case 파일명이 곧 iconName), 컴포넌트가 요청 크기에 따라 가까운 글리프를 고른다(20px 미만이면 16px 패스, 이상이면 20px 패스). 즉 벡터 스케일이 아니라 **옵티컬 사이즈를 갖는 아이콘 시스템**이다.
- 모션: transition-duration `100ms`, ease `cubic-bezier(0.4, 1, 0.75, 0.9)`, 바운스 `cubic-bezier(0.54, 1.12, 0.38, 1.11)`
- 그림자: 보더 섀도 opacity `.1`, 드롭 섀도 `.2` (다크에서 `.2` / `.4`). elevation 0~4 단계.
- z-index: base 0 / content 10 / overlay 20 / dialog-header 30
- 폰트: 시스템 스택(-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Oxygen, Ubuntu, Cantarell, Open Sans, Helvetica Neue) + 아이콘 폰트 + 모노스페이스
- 텍스트 유틸: running-text(장문용 행간 확대, 헤딩 상단 마진 10×spacing / 하단 5×spacing), text-large, text-small, text-muted(WCAG 2.1 대비를 충족하는 순한 그레이), text-disabled(장식·비활성 전용), code(모노, 한 단계 작게), code-block(본문-1px, 행간 1.4)

**해석**: 100ms 트랜지션은 "부드럽다"가 아니라 **즉답성**을 위한 값이다. Palantir는 애니메이션을 감성 장치가 아니라 *상태 변화의 물리적 알리바이*로 쓴다. 반면 마케팅 영상의 카메라 무브는 1.2~2.5초로 길다. **두 개의 시간 축을 명확히 분리**한다는 것이 핵심 — UI는 100ms, 시네마는 1200ms 이상. (우리 토큰의 `--t-fast:.15s` / `--t-cam:1.2s` 분리는 정확히 맞는 방향이다.)

또한 Blueprint 문서는 "전역 동작과 스타일링은 타이포그래피와 크로스브라우저 정규화로 제한되며, 나머지는 전부 CSS 클래스나 인터랙티브 컴포넌트의 명시적 사용을 통해 opt-in"이라고 밝힌다. 즉 **기본값은 최소, 표현은 명시적 선택**. 이것이 Palantir 화면이 과장 없이 조용한 이유다.

### 1.2 Gotham의 지도 — Gaia, 심볼로지, 개체 글리프

Gotham의 지도 애플리케이션은 **Gaia**다. Foundry-Gotham 연동 문서에 따르면, Foundry 온톨로지의 객체 타입은 **type mapping**을 통해 Gotham에 동일 표현으로 나타나며, "타입 매핑된 객체가 Gaia 지도에 표시되려면 geopoint 프로퍼티를 가져야 한다. 이 프로퍼티는 객체 타입의 백킹 데이터셋에 네이티브로 존재하거나 위/경도 쌍에서 파생될 수 있다."

심볼로지는 4계층으로 지원된다:

1. **커스텀 심볼로지** — 전술 그래픽이나 2525에 없는 기호
2. **전술 그래픽(tactical graphics)**
3. **MIL-STD 2525 심볼** — 군 표준 기호 체계
4. **Blueprint 심볼** — "타입 매핑 유무와 관계없이 지원됨"

또한 문서는 "Gotham이 Foundry의 데이터셋 보안과 마킹을 모델링하므로, 타입 매핑을 통해 Gotham에 제공되는 Foundry 데이터는 동일한 접근 통제와 분류를 그대로 가져간다"고 명시한다. **보안 등급이 UI 요소로 계속 따라다닌다**는 뜻이며, 공공 플랫폼인 Land-XI에도 그대로 적용할 만한 원칙이다(개인정보 포함 필지, 비공개 조사 대상 등).

이 4계층 심볼 구조가 Land-XI에 주는 함의는 결정적이다. Palantir 지도의 개체가 "살아 보이는" 이유는 예쁜 핀 때문이 아니라, **기호 자체가 도메인 표준을 따르는 정보 밀도 높은 글리프**이기 때문이다. 우리도 드론/항공/위성/지적/불법건축물/AI탐지 각각에 대해 **의미를 갖는 글리프 체계**를 정의해야 한다 — 일반 지도 핀이 아니라.

Gotham의 지도 도구는 유출된 경찰용 매뉴얼 기록(VICE)에서 3가지로 요약된다: 반경 내 지오서치, 객체 밀도 히트맵, ALPR(차량번호판) 조회. 그리고 "도형을 그리고 그 검색 영역 안의 객체/속성을 검색"한다. 즉 **지도는 뷰가 아니라 쿼리 인터페이스**다.

또한 Gotham에는 **COV(Context of View)** 개념이 있어, 임의의 엔티티/객체에 대해 관련 정보를 보여주며 "표시되는 위젯은 코딩 없이 사용자 요구에 맞게 커스터마이즈 가능"하다. Titan 릴리스에서는 이것이 **Custom Object Views**로 발전해 "Gotham 내 엔티티와 주요 레코드에 대한 맞춤 인텔리전스를 표시하며, 개인·팀·기관의 구체적 필요에 맞게 구성 가능"하다고 소개된다. **Federated Search**는 외부 엔터프라이즈 데이터 시스템과 연결해 검색·발견을 확장한다. Titan 소개문은 "전장, 작전 센터, 본부에서의 10년 이상의 파트너십 학습 위에 구축된 차세대 Gotham"이며 플랫폼 업그레이드가 Gotham을 "더 성능 좋고, 더 열려 있고, 더 선제적으로(more performant, open, and proactive)" 만든다고 표현한다. **"proactive"** — 사용자가 묻기 전에 시스템이 먼저 말한다는 것, 이것이 정적 대시보드와의 결정적 차이다.

### 1.3 "객체 → 속성 패널" 플로우와 그래프 분석

Palantir 분석 UX의 원자 단위는 **온톨로지**다. 공식 문서는 온톨로지를 "조직의 디지털 트윈"으로 정의하며, **시맨틱 요소**(object types, properties, link types)와 **키네틱 요소**(action types, functions, dynamic security)로 나눈다. 액션은 "사용자 정의 로직에 기반해 하나 이상의 객체의 속성을 변경하는 단일 트랜잭션"이고, 액션 타입은 "사용자가 한 번에 취할 수 있는 객체·속성값·링크 변경 집합의 정의"다. 온톨로지는 "플랫폼에 통합된 디지털 자산(데이터셋, 가상 테이블, 모델) 위에 앉아 이를 실세계의 대응물과 연결한다."

**이것이 UI에 미치는 영향이 가장 중요한 지점이다.** Palantir 화면에서 무엇을 클릭하든, 그것은 "행"이나 "픽셀"이 아니라 **객체**다. 그래서:

- 지도의 점 → 클릭 → 속성 패널 → 링크된 객체 → 그래프로 확장 → 시계열로 확장
- 표의 행 → 같은 객체 → 같은 패널
- 차트의 막대 → 같은 객체 집합 → 지도에 하이라이트

Vertex(그래프 앱)에서는 노드를 클릭하면 "**selection panel**이 자동으로 열려 객체 속성을 표시"하고, `(+)`로 패널을 확장해 관련 객체 전반의 집계 지표를 계산하는 파생 속성 함수를 추가할 수 있다. 우클릭 컨텍스트 메뉴의 **Search Around**는 "각 타입별 객체의 총 개수"를 드롭다운에 보여주고, 필터 아이콘으로 다단계 순회를 만든다. Search Around 패널은 "포인트앤클릭으로 필터링된 다단계 그래프 생성 로직을 구성"하게 하며, 앞 단계의 결과 객체 집합이 다음 단계 입력이 되어 "뉴욕주 공항으로 출발하는 157편의 항공편" 같은 **파라미터 카운트**를 표시한다. 구성한 Search Around는 리소스로 **저장·재사용**할 수 있다(템플릿화).

**히스토그램**은 Palantir 분석의 시그니처다. Map 문서의 Histogram 패널 사양:

- 객체 타입별 개수를 표시하고, 표시된 모든 객체 타입의 각 프로퍼티 타입별 섹션을 가진다
- 컬럼 헤딩 클릭으로 정렬 토글: "Value"는 알파벳순, "Count"는 내림차순 → 오름차순 → "Selected Count" 순환
- 숫자·날짜 프로퍼티는 **Binning** 옵션 — 날짜는 Year/Month/Quarter/Day, 숫자는 "No binning" / "Equal size" / "Logarithmic"
- 행 클릭 = 해당 객체 선택. Shift+클릭 = 범위, Ctrl/Cmd+클릭 = 여러 섹션에 걸친 다중 추가
- **"Filter to"** = 선택 행에 매칭되는 객체만, **"Filter out"** = 매칭되지 않는 것만. 행 더블클릭 = 그 행으로 단독 필터
- 필터 적용 시 **비매칭 객체는 불투명도가 낮아지고 비상호작용 상태가 되며 히스토그램 통계에서도 제외**된다
- 메인 툴바 위에 **필터 바**가 나타나고, 개별 필터 제거 또는 "Clear filters"로 전체 초기화
- 필터는 임시이며 지도와 함께 저장되지 않는다 (탐색은 가볍게, 저장은 명시적으로)

이 감쇠 항목이 "살아있음"의 핵심 메커니즘이다: **필터링이 삭제가 아니라 감쇠(dimming)다.** 데이터가 사라지지 않고 배경으로 물러난다. 사용자는 자기가 무엇을 걸러냈는지 계속 본다. 유출 매뉴얼은 히스토그램 도구를 TV에 나오는 "형사 벽(detective wall)"에 비유하며 "객체들 사이의 상관과 추세를 찾도록 돕는다"고 설명한다.

Object Explorer는 Gotham의 톱다운 분석 앱으로, 데이터를 "필터, 정렬, 지도화, 분석, 내보내기"하며 시각화는 **숫자 차트·히스토그램·타임라인·파이 차트** 4종으로 한다. 유출 매뉴얼 기록에 따르면 검색은 이름·전화번호·번호판·사건일자 같은 **최소 단서 하나**로 시작되고, 결과는 여러 기관 데이터 소스를 가로질러 하나의 엔티티 카드로 통합된다. **"최소 입력 → 통합 카드"**가 Gotham 검색의 서사다.

Quiver(시계열 분석 앱)는 "온톨로지의 객체·시계열 데이터에 대해 포인트앤클릭으로 데이터 분석을 수행"하며, 특히 **모든 시계열 차트의 시간 축을 자동으로 연동**한다 — "한 차트의 시간 축을 팬하거나 줌하면 다른 시계열 차트의 줌 범위가 동기적으로 갱신된다." 또 "시계열 검색 카드"로 사용자 정의 조건에 맞는 구간마다 이벤트를 생성해 **이상 탐지**를 수행한다. Vertex 그래프는 시계열과 상호작용해 "시스템 전반의 변화를 시각화하고, 과거 결정·현재 상태·미래 가능성의 영향을 보여준다."

### 1.4 Foundry Map / Workshop 위젯 — 실제 옵션 카탈로그

Workshop Map 위젯 문서에서 뽑은 **실제 UI 라벨 전량**은 우리 XI맵 기능 스펙의 골든 레퍼런스가 된다.

**레이어 3종**: Base map(배경 이미지, "Show base layer picker" 토글) / Object layers(객체 데이터를 점·도형으로) / Overlay layers(재사용 가능한 사전 구성 지오공간 뷰)

**레이어 설정**: "Label", "Selected objects"(양방향 객체집합 변수), "Layer visibility"(정적 또는 변수), "Lock layer"(선택 방지), Style 섹션(기본 색/불투명도/라벨·툴팁), Geometry 섹션("Add geometry", 드래그로 순서 변경, 휴지통 삭제), "Loading methods [beta]", 범례 표시 토글

**드로잉/선택 도구**: "Draw options", "Drawn shape colors", "Drawn shape opacity", "Shape output type"(GeoJSON feature vs geometry collection), "Enable single draw mode", "Clear shapes after operation", "Enable shaped-based selection"(Select intersecting 버튼), "Enable geospatial object search"(Search within 버튼), "Enable shape-based track tools"(Track search, Filter breadcrumbs), "Enable shape editing tools"(Modify), "Enable measurements"(폴리곤 둘레, 면적, 선)

**시간 축(타임라인)** — 이 부분이 특히 중요:
"Enable timeline", "Open timeline by default", "Allow user to change selected time", **"Enable user facing live mode toggle"(View Latest 옵션)**, "Selected time"(Timestamp/Date 변수), "Time window"(2개 변수), "Time zone"(Local/UTC), **"Playback state"(불리언 변수)**, **"Playback position"(밀리초 숫자 출력)**, **"Auto pause at"(타임스탬프 배열 변수)**

즉 Palantir의 시간 슬라이더는 **재생(playback) 상태와 위치가 애플리케이션 변수로 노출되어 다른 위젯과 동기화**되고, 특정 이벤트 시각에 **자동으로 멈춘다**. 이것이 "시간 슬라이더를 끌면 지도가 바뀐다"와 "시간이 스스로 흐르며 사건에서 멈춰 서서 이야기를 한다"의 차이다. **Land-XI 4시점 정사영상(남원)에 그대로 이식할 수 있는 패턴이다.**

**인터페이스 옵션**: "Legend" 패널, "Collapse legend panel", "Panel size"(full/compact), "Enable search around", "Enable advanced selection tools", "Show selection panel", "Viewport auto zoom"(Object set / All objects / 조건부), "Viewport bounds"(양방향 GeoJSON 변수), "Viewport follow object set"(동적 센터링), **"Enable transition to full Map application"**

마지막 항목은 철학이다: 대시보드의 작은 지도에서 **전체 지도 앱으로 컨텍스트를 유지한 채 승격**된다.

**스타일링** (Map styling 문서):
- 색 모드 4종 — Fixed / Property / Function / **Measure(시계열 값 기반)**. 숫자는 그래디언트 에디터로 구간 → 색 매핑, 문자열은 수동 매핑·자동 할당·헥스 해석 중 선택
- **Opacity "by time"** — active/inactive 불투명도, **fade duration**, "hide until occurred"
- Zoom levels — "레이어 객체의 가시 범위 제어"
- Stroke width / Stroke style(solid, dashed, dotted + 화살표 표시) / Fill polygons
- Icon source — "Object default"(온톨로지에 지정된 아이콘), "Media image", "Fixed icon", "Property"(속성값 → 아이콘 매핑)
- **Marker shape — Circle / Pin / None** (아이콘을 감싸는 프레임)
- **Rotation** — 값 기반 회전, 트랙 지오메트리는 "객체 이동 방향으로 회전"
- 라벨/툴팁 — 프로퍼티, 함수, 시리즈 데이터, **링크된 객체 개수** 표시
- 객체 레이어 스타일러: icon, circle, line segment, **track breadcrumbs, track line** (이동 지오메트리 보간 모드 설정 가능)
- **Saved styles** — 서로 다른 분석 관점을 위한 스타일 프리셋 전환
- 포인트는 아이콘/원 두 방식, 둘 다 대량 객체를 위한 **타일 기반 로딩** 지원

"opacity by time + fade duration + track breadcrumbs"의 조합이 Palantir 지도가 **살아 숨 쉬는** 이유다. 오래된 것은 흐려지고, 움직인 것은 꼬리를 남긴다.

**레이어 에디터**는 Vector(GeoJSON/MVT) / Raster(타일셋, 선형보간 vs 최근접이웃 샘플링, 줌 제약) / Object(온톨로지 직결, Object Explorer 탐색 결과 로드 가능) / Mapbox JSON(GL 스타일 스펙 직접 편집, sources·layers만) 4종을 지원하며, "오른쪽 Layer Preview 패널의 라이브 프리뷰"로 즉시 확인한다. JSON 문법을 검증하고 설정 오류를 하이라이트한다. **설정 UI 옆에 항상 라이브 프리뷰**가 붙고 **포인트앤클릭과 원시 코드 편집이 같은 화면에 공존**한다는 것이 Palantir 도구의 일관된 규칙이다.

**Map 앱 설정**: Units(Metric / Imperial / Nautical), GeoJSON 패널 토글, Polling interval("View Latest" 모드에서 새 시계열 값 로딩 주기), Time series buckets, Time zone(Local/UTC), Time format(12h/24h/Local), **Theme("지도 앱의 Light와 Dark 모드 전환")**, Experimental labels("겹침을 최소화하는 고급 라벨 배치 알고리즘"). 즉 **라이트/다크는 사용자 설정**이지 브랜드 고정값이 아니다 — 우리의 "라이트 기본 + 다크 ops" 전략에 정당성을 준다.

**Workshop 위젯 카탈로그**(요약): Object Table, Object List, Object View, Property List, Links, Object Set Title / Chart XY, Vega Chart, Map, Gantt, Pie, Stepper, Markdown, Metric Card, Pivot Table, Timeline, Resource List, Media Preview, Video Display, Audio and Transcription Display, PDF Viewer, **Image Annotation**, Free-form Analysis, Time Series Analysis, **Data Freshness**, **Edit History**, Linked Compass Resources, **Action Log Timeline** / Filter List, Object Dropdown, String Selector, Date and Time Picker, Numeric Input, Text Input, Exploration Filter Pills, Exploration Search Bar, Prominent Term, User Select / Button Group, Media Uploader, **Comments**, Tabs, Inline Action, Audio Recorder / **AIP Analyst, AIP Chatbot, AIP Generated Content** / Observability Chart / **Scenario Manager, Scenario Selector, Scenario Summary** / Iframe, QR Code Reader, Current Location Manager, Mobile Navigation Bar

여기서 배울 3가지: (1) **Data Freshness / Edit History / Action Log Timeline / Comments**가 1급 위젯이다 — 즉 "이 숫자가 언제 것이고, 누가 무엇을 바꿨고, 누가 뭐라 했는가"가 화면의 정식 시민이다. 이것이 발주처가 말한 "사람 냄새"의 정체다. (2) **Scenario** 위젯군 — 가정 시나리오를 만들고 비교하는 것이 기본 기능. (3) **Image Annotation** — 우리 AI 탐지 검수에 그대로 대응.

**레이아웃**: Header(수평/수직, 커스텀 색·로고, 수직일 때 접기 가능, "titles, tabs, and buttons" 표시, 모든 페이지에 상주) → Pages(각각 독립 화면, 헤더만 유지) → Sections(Columns/Rows, Tabs, Flow(세로 스크롤), **Toolbar**(컴팩트 위젯 최적화), Loop(객체 집합에 대해 임베디드 모듈 반복)) → Overlays(drawer 측면 슬라이드 / modal 중앙, "Variable based visibility"). 패딩은 compact~large 또는 커스텀, 보더 스타일은 bordered / drop shadow / **inner shadow** / borderless. **"위젯이 배경 밝기에 따라 텍스트 대비를 자동 조정"**한다.

### 1.5 MetaConstellation — 궤도 태스킹 UI

MetaConstellation은 "저궤도 수천 개 위성의 이미지를 표시하고 사용자가 특정 질문에 답하도록 위성에 태스킹"하게 한다. Palantir는 이를 "위성 이미징 전반의 엔드투엔드 소프트웨어 + 이미지 분석용 운용 UI"로 설명한다. 공식 마케팅 문구: "Optimize orbital sensors. Leverage AI models. **Task and track. Reduce time to insights.**"

Edge AI in Space 블로그에 따르면 2022년 11월 NewSat 27 다중분광 카메라로 다중 캡처 태스킹을 시연해 100장 이상의 이미지를 획득했고, 2022-10-30 시리아 타르투스 상공에서 라이브 촬영 및 온보드 처리 테스트를 수행했다. 향후에는 "Edge AI 탑재 위성에서 야전의 전술 인스턴스로 직접 다운링크해 **수 분 내**에 탐지 결과와 이미지를 운용자에게 전달"하는 구상이다.

**UI 문법 요약** (영상/보도 기준): 지구본 위 궤도 트레이스 → 시간 축을 밀면 위성이 궤도를 따라 이동 → 관심 AOI를 그리면 **가용 패스(pass) 윈도우가 큐로 나열됨** → 태스킹 요청 제출 → 큐의 상태가 pending → scheduled → captured → downlinked → processed로 진행 → 결과 이미지가 지도에 타일로 낙하 → AI 탐지 오버레이가 그 위에 켜짐.

**이 "요청 → 큐 → 상태 진행 → 결과 낙하" 파이프라인이 Land-XI의 드론/항공 촬영 발주 및 AI 분석 작업에 1:1로 대응한다.** 우리 플랫폼의 가장 강력한 시네마틱 자산은 바로 이것이다. 우주 위성이 없어도, "드론 출동 → 촬영 → 업로드 → 정합 → AI 추론 → 검수 대기"라는 동일한 시간 서사를 갖고 있다.

### 1.6 AIP — LLM 추론을 UI로 보여주는 방식

**AIP Logic**: 로직 함수는 **Blocks**로 구성되며, 블록은 "온톨로지를 읽거나 쓰고, 계산하고, 데이터를 집계하고, 함수를 호출하고, 컬렉션을 순회하고, 조건을 평가하거나, LLM과 상호작용"한다. 블록을 순차 연결해 한 단계 출력을 다음 단계로 넘긴다. 함수를 실행하면 **Debugger 패널**이 열려 "구성 블록들에 대한 LLM chain-of-thought(CoT)"를 보여준다. 문서 표현: CoT를 살펴보는 것은 "LLM의 '사고 과정'의 개별 단계 각각을 보여주고 LLM이 사용한 지원 도구에 대한 정보를 제공하므로 디버깅을 쉽게 만든다."

**AIP Agent/Chatbot 위젯**: "chatbot reasoning을 표시할지" 토글이 있고, Reasoning 탭의 Object query 섹션이 에이전트의 CoT를 보여준다. **각 도구 호출(tool call)마다** Reasoning 섹션에서 CoT를 볼 수 있어 "도구가 있는 상황에서 에이전트가 왜 의도대로 응답하지 않는지 이해"하도록 돕는다. 도구 유형은 semantic search, actions, Workshop applications, functions 4종. 사용자가 입력창에 타이핑하는 동안 **앱 변수가 실시간 업데이트**된다. 문서는 "AIP Logic 도구는 Logic chain of thought 위젯과 함께 쓰라"고 반복해서 권한다 — **추론 표시는 옵션이 아니라 권장 기본값**이다.

**신뢰도(confidence)를 다루는 방식 — 이 부분이 핵심 인사이트다.** Palantir는 LLM 출력 옆에 "87% 확신" 같은 **가짜 신뢰도 배지를 붙이지 않는다.** 대신 **AIP Evals**라는 별도의 평가 체계를 둔다. 문서: "AIP Evals는 LLM의 비결정적 성질을 다루도록 설계된, AIP Logic 함수·AIP Chatbot 함수·코드 작성 함수의 성능을 평가하기 위한 테스트 환경이다." "LLM 기반 워크플로를 프로덕션에 올리거나 기존 구현을 변경하려면 **확신(confidence)이 필수**이며, AIP Evals가 평가 수단을 제공해 그 확신을 쌓게 한다." 평가자(evaluator)는 ground truth 대비 지표를 생산하며 "Exact Match"부터 정규식·키워드·코사인 유사도 같은 퍼지 매칭, 그리고 **LLM-as-a-judge**(사용자 정의 조건이 참인지 LLM이 판정)까지 있다. 메트릭이 해당 없는 케이스는 **"No value"**로 표시되고 집계에서 제외된다. 그리고 Rubric grader 같은 평가자는 **네이티브 Logic 디버거에 접근**할 수 있어 "왜 그 평가 결과가 나왔는지" 다시 추적 가능하다.

**Land-XI 번역**: AI 탐지 결과에 대해 우리가 보여야 할 것은 (a) 모델 점수, (b) **그 점수가 어떤 검증 셋에서 어떤 정밀도/재현율을 냈는지**, (c) 사람이 확인/반려한 이력, (d) 값이 없을 때 정직하게 "값 없음". 그냥 "AI 신뢰도 92%" 게이지만 띄우면 Palantir 문법이 아니라 그 반대다.

### 1.7 마케팅 영상의 시네마틱 문법

Palantir는 사내에 모션 디자이너·비주얼 디자이너 직군을 별도로 두고 "커스텀 애니메이션, 데모 영상, 서사형 단편 영화"를 제작한다. 채용 공고는 "엔지니어링을 모르는 사람에게 Palantir가 어떻게 작동하는지 설명하는 것"을 최대 난제로 꼽고 모션 그래픽 익스플레이너를 그 해법으로 든다. AIPCon은 NGA, Aramark, bp, Anduril, L3Harris, 국무부 등 100개 이상 조직의 **실사용 데모**를 무대에 올린다 — 즉 마케팅의 본체가 "우리가 만든 영상"이 아니라 "고객이 실제로 쓰는 화면"이다.

반복되는 촬영·연출 문법:

1. **어두운 바탕 + 단 하나의 발광원**. 알라미 스톡 캡션조차 "어둠 속 노트북에 Gotham UI가 떠 있고, 배경의 신비로운 푸른 빛이 이 데이터 분석 플랫폼의 첩보기관적 아우라를 강조한다"고 적는다.
2. **위성 → 대륙 → 도시 → 개체로 이어지는 연속 줌**. 컷이 아니라 하나의 이동. 스케일 전환이 곧 서사.
3. **데이터 폭포(data waterfall)** — 원시 로그·좌표·파일명이 모노스페이스로 흘러내리다가 정렬되어 객체 카드로 응결.
4. **HUD 오버레이** — 화면 가장자리의 코너 브래킷, 십자선, 눈금자, 좌표 리드아웃, 스케일 바. 실제 제품 UI보다 과장되어 있고, 이는 의도적이다.
5. **카운트업 숫자와 카운트다운 타이머** — 처리 중인 프레임 수, 탐지 개수, ETA.
6. **관계선의 순차적 점등** — 노드가 하나씩 나타나고 링크가 그려지며 그래프가 자란다.
7. **실제 사람의 손과 얼굴** — 조작하는 분석가, 야전의 오퍼레이터. TIME의 우크라이나 취재 기사가 그 전형이다. **UI만 나오는 영상은 없다.**
8. **타이포그래피 카드** — 검은 화면에 짧은 문장 하나. 침묵의 비트.

한편 Palantir의 다크 편향은 미학이 아니라 포지셔닝이라는 외부 분석도 있다: 제품 UI가 고대비 다크인 것은 "호감을 사려는 게 아니라 신뢰를 얻으려는 것이며, 검정은 친근함보다 유능함을 말한다"는 해석이다. 동시에 사내 커뮤니티에는 "밝은 배경에서 눈이 빨리 피로한데 대부분의 Foundry 앱에는 우회로가 없다"는 다크 테마 요구가 올라와 있고, Carbon 관리자는 조직 기본 테마를 다크로 설정할 수 있다. 즉 **Palantir 자신도 라이트/다크를 상황 변수로 다룬다.**

**결론**: "시네마"란 예쁜 트랜지션이 아니라 **스케일 이동 + 시간 압축 + 사람의 개입**이다. 우리 1차 시안이 "시네마가 없다"는 지적을 받은 이유는 애니메이션이 없어서가 아니라, **화면이 이야기를 하지 않아서**다.

---

## 2. 우리 정적 패널과 다른 점 — "살아있음"을 만드는 14가지 패턴

각 항목은 [사용자 행동] → [시스템 반응] → [왜 강력한가] 형식.

**P1. 감쇠 필터 (Dimming, not deleting)**
사용자가 히스토그램 행을 클릭하고 "Filter to"를 누른다 → 비매칭 객체가 사라지지 않고 **불투명도가 낮아지고 상호작용 불가 상태**가 되며, 상단에 제거 가능한 필터 칩 바가 생긴다 → 자기가 무엇을 배제했는지 계속 보이므로 **분석의 되돌리기 비용이 0**이 된다. 정적 테이블 필터가 주는 "데이터가 없어졌다"는 불안이 사라진다.

**P2. 브러시-링크 (Cross-filtering)**
차트의 막대를 드래그로 브러시한다 → 같은 순간에 지도의 점, 표의 행, 타임라인의 이벤트가 **동시에** 하이라이트된다 → 모든 뷰가 하나의 객체 집합(object set)의 다른 투영이라는 것이 몸으로 이해된다. 이것이 "패널 여러 개"와 "하나의 분석 도구"를 가르는 선이다.

**P3. Search Around (관계 순회)**
객체를 우클릭한다 → 컨텍스트 메뉴에 **"각 타입별 관련 객체 개수"가 미리 표시된 목록**이 뜬다("연결된 필지 41", "탐지 이력 7") → 클릭 전에 결과 규모를 알기 때문에 탐색이 도박이 아니라 항법이 된다.

**P4. 시간 재생 + 자동 정지 (Playback with Auto pause at)**
재생 버튼을 누른다 → 시간이 흐르며 지도가 변하다가 **사건이 있는 시각에서 스스로 멈춘다** → 시스템이 "여기를 보라"고 말한다. 사용자가 우연히 발견하기를 기다리지 않는다. **남원 4시점 정사영상에 즉시 적용 가능.**

**P5. 시간 기반 감쇠와 궤적 (opacity by time + track breadcrumbs)**
시간 창을 좁힌다 → 창 밖의 객체는 fade duration에 걸쳐 흐려지고, 이동체는 **빵부스러기 궤적과 궤적선**을 남기며, 아이콘은 이동 방향으로 회전한다 → 지도가 스냅샷이 아니라 **흐름**으로 보인다.

**P6. 도형으로 질의하기 (Draw to query)**
지도 위에 폴리곤을 그린다 → 즉시 "Select intersecting", "Search within", "Track search", "Filter breadcrumbs", "Modify", 그리고 둘레·면적 측정값이 나타난다 → 지도가 배경 그림이 아니라 **입력 장치**가 된다. 손으로 그린 것이 곧 쿼리다.

**P7. 승격 (Promote to full app)**
대시보드의 작은 지도 우상단 버튼을 누른다 → **현재 필터·선택·시점을 그대로 유지한 채** 전체 지도 앱으로 전환된다 → 위젯이 장난감이 아니라 도구의 축소판임을 증명한다.

**P8. 라이브 프리뷰가 붙은 설정 (Config with live preview)**
레이어 스타일 옵션을 만진다 → 오른쪽 프리뷰 패널이 **즉시** 결과를 그린다 → 설정이 "저장하고 확인하는 양식"이 아니라 **연주하는 악기**가 된다.

**P9. 값 없음의 정직한 표시 ("No value")**
평가 지표가 해당 케이스에 적용되지 않는다 → **"No value"로 표시하고 집계에서 제외**한다 → 0으로 눙치지 않는다. 신뢰는 여기서 만들어진다.

**P10. 추론 체인 펼치기 (Chain-of-thought disclosure)**
AI 결과 옆 "Reasoning"을 연다 → 블록·도구 호출 단위로 **사고 단계가 순차 스트리밍**되며 각 단계가 어떤 데이터를 봤는지 표시된다 → AI가 블랙박스가 아니라 **동료의 작업 노트**가 된다.

**P11. 스트리밍 타이핑과 변수 실시간 반영**
사용자가 프롬프트를 타이핑한다 → 타이핑 중에 앱 변수가 갱신되고, 응답은 토큰 단위로 흘러나오며, 참조된 객체는 **클릭 가능한 칩**으로 인라인 삽입된다 → 대화가 화면 상태와 물리적으로 연결돼 있음이 보인다.

**P12. 아이콘의 3단 상태 (muted → hover → selected)**
툴바에 아이콘 20개가 있다 → 기본은 뮤티드 그레이, 마우스 오버 시 본문색, 활성 시 인텐트 블루 → 화면이 조용하다가 손끝을 따라 **깨어난다**. 뻣뻣함을 없애는 가장 저렴하고 효과 큰 한 수.

**P13. 이력의 상시 노출 (Data Freshness / Edit History / Action Log Timeline / Comments)**
어떤 값을 본다 → 그 옆에 "3분 전 갱신", "김OO이 2시간 전 상태 변경", 그리고 코멘트 스레드가 있다 → 데이터가 **누군가 돌보는 것**으로 느껴진다. 발주처가 말한 "사람 냄새"는 아바타 일러스트가 아니라 **여기서** 나온다.

**P14. 시나리오 분기 (Scenario Manager)**
"만약 이 필지를 재조사한다면"을 누른다 → 현재 상태를 복제한 시나리오가 생기고, 원본과 나란히 비교되며, 채택 시 실제 액션으로 커밋된다 → 화면이 보고서가 아니라 **의사결정 도구**가 된다.

**보너스 P15. 100ms 규칙** — 모든 상태 변화 트랜지션은 100ms / cubic-bezier(0.4,1,0.75,0.9). 느린 UI 애니메이션은 고급스러움이 아니라 지연으로 읽힌다. 시네마는 별도 시간 축(1.2s 이상)에서만.

**보너스 P16. 축 동기화** — Quiver처럼 여러 시계열 차트의 시간 축이 **자동으로 함께 움직인다**. 한 차트를 줌하면 나머지가 따라온다. 이것 하나로 "차트 여러 개"가 "하나의 계기판"이 된다.

---

## 3. Land-XI 화면별 번역안

전제: 기본 테마는 **라이트 + 글라스**(현행 토큰 `--mist:#E9EEF1`, `--glass:rgba(255,255,255,.82)`, `--lx:#006DF7`, `--ai:#0FA9A0` 유지). Blueprint에서 가져올 것은 색이 아니라 **구조·밀도·상태 규칙**이다. 다만 아래 세 곳에서만 다크 ops 모드를 쓴다: 홈의 오프닝 궤도 장면, XI맵의 "야간/판독 모드", 프로젝트 캔버스의 실행 모니터링. 현행 `--scene-dark-*` 토큰이 이미 그 자리를 잡고 있다.

라이트에서 Palantir 밀도를 얻기 위한 치환 규칙:
- 그레이 램프를 Blueprint 방식으로 재정의(한기 있는 슬레이트 11단). `--ink-3` 계열을 **아이콘 기본색으로 승격**하고 hover에서 `--ink`, active에서 `--lx`.
- 컨트롤 높이 30px / small 24px, 아이콘 16px·20px 두 벌, 라운드 6px(현행 `--r-ctl:6px` 유지), 본문 13~14px.
- 면 분리는 그림자보다 **1px 라인**(`--line`) 우선. 글라스 패널에만 `--sh-float`.
- 범주형 색은 Blueprint 확장 팔레트 10색을 매핑한 테이블 하나를 만들어 차트·레이어에서 공용.
- 상태색은 현행 `--s-found/--s-doing/--s-done/--s-hold/--s-error` 5색으로 고정하고, 절대 범주형과 섞지 않는다.

### 3.1 홈 (공개 랜딩) — "국토가 스스로 말하게 하라"

Palantir 등가물: 제품 페이지가 아니라 **작동하는 시스템의 창**. 3막 구조 — (1) 다크 궤도 오프닝: 위성·드론 아이콘이 한반도 위 궤도를 그리고 실시간 카운터("오늘 처리된 프레임 128,442"). (2) **스케일 다이브**: 스크롤 1회에 궤도 → 전국 → 남원 → 필지 1개로 **연속 줌**하면서 배경이 다크에서 라이트 지도로 크로스페이드(다크→라이트 전환 자체를 시네마 장치로 사용). (3) 라이트 지도 위 글라스 패널로 착지 — 실제 AI 탐지 결과 3건이 카드로 뜨고, 하나를 클릭하면 로그인으로 유도.

핵심은 **랜딩이 데모 그 자체**라는 것. 스톡 히어로 이미지 금지, 실데이터 사용.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ LX  Land-XI          플랫폼  기술  사례  공개데이터            [로그인]      │  ← 50px 네비
├──────────────────────────────────────────────────────────────────────────────┤
│  ░░░░░ SCENE 1 : 다크 궤도 (--scene-dark-*) ░░░░░                             │
│        ·  ⌒⌒⌒⌒⌒ 궤도 트레이스 ⌒⌒⌒⌒⌒                                        │
│      ◐ 한반도 지구본                    ┌─ HUD ─────────────────┐            │
│         ▲ 드론  ▣ 항공  ✦ 위성          │ 처리 프레임  128,442 ↑│            │
│                                          │ 활성 미션         7   │            │
│   "국토의 변화를, 사람이 보기 전에."     │ 최근 다운링크 00:41   │            │
│                                          └───────────────────────┘            │
│                          ↓ scroll = 연속 줌 (컷 없음)                         │
├──────────────────────────────────────────────────────────────────────────────┤
│  ▓▓▓ SCENE 2 : 스케일 다이브 · 다크→라이트 크로스페이드 ▓▓▓                   │
│   전국 ──→ 전북 ──→ 남원 ──→ 필지   (좌측 스케일 눈금자 실시간 갱신)         │
│   우측 모노스페이스 데이터 폭포: 2024-04-11_ORTHO_5cm.tif … 정렬 → 카드로 응결│
├──────────────────────────────────────────────────────────────────────────────┤
│  ░ SCENE 3 : 라이트 지도 + 글라스 (실데이터) ░                                │
│  ┌──────────────────────────────────────┐  ┌──────── 글라스 패널 ─────────┐  │
│  │  밝은 정사영상 (남원, 2024-04-11)     │  │ AI 탐지 · 최근 3건           │  │
│  │      ▢ 탐지박스 3개, 순차 점등        │  │ ● 무허가 건축물  score .91   │  │
│  │      ├ 시간 슬라이더 ◀━━●━━▶ 4시점    │  │   검수: 대기 · 2시간 전      │  │
│  │      └ [▶ 재생]  ⏸ 자동정지: 변화시점 │  │ ● 지목 불일치    score .77   │  │
│  └──────────────────────────────────────┘  │ ● 도로 신설      score .95   │  │
│                                             │ [지도에서 보기 →]            │  │
│                                             └──────────────────────────────┘  │
├──────────────────────────────────────────────────────────────────────────────┤
│  숫자 3개 (카운트업) │ 사례 3개 (현장 사람 사진 + 인용) │ 공개데이터 다운로드 │
└──────────────────────────────────────────────────────────────────────────────┘
```

적용 패턴: P4, P5, P12, 시네마 문법 1·2·3·5·7.

### 3.2 로그인 — "관문이 아니라 도킹"

Palantir 등가물: 로그인 화면 자체를 시스템 상태의 축약판으로. 왼쪽 60%는 다크 ops 배경에서 **저속으로 도는 궤도·전국 히트맵 루프**(무음, 사용자 조작 불가), 오른쪽 40%는 라이트 글라스 폼. 폼 자체는 **극도로 절제**: 라벨 12px 뮤티드, 인풋 높이 40px, 버튼 40px, 포커스 링은 `--lx` 2px. 하단에 시스템 상태 라인(가용성, 최근 배포 시각, API 응답) — 이것이 "살아있는 시스템에 접속한다"는 느낌을 만든다. 현행 `login.html`/`login.css`에 배경 레이어와 상태 라인만 추가하면 되는 저비용 고효과 항목.

```
┌───────────────────────────────────┬──────────────────────────────────────────┐
│  ░░ 다크 ops 루프 (30s, 무한) ░░  │                                          │
│    ◐ 전국 야간 히트맵 서서히 맥동  │        LX  Land-XI                       │
│    ⌒ 궤도선 1개가 천천히 통과      │        국토정보 통합 분석 플랫폼         │
│                                    │                                          │
│  ┌ HUD (좌하단, 고정) ──────────┐  │        ┌──────────────────────────┐      │
│  │ NODE  KR-SEOUL-01            │  │        │ 아이디                   │      │
│  │ TILES 매일 04:00 갱신        │  │        └──────────────────────────┘      │
│  │ LAST  2026-08-25 03:58 KST   │  │        ┌──────────────────────────┐      │
│  └──────────────────────────────┘  │        │ 비밀번호            👁   │      │
│                                    │        └──────────────────────────┘      │
│                                    │        [ ▸ 접속 ]   GPKI 인증서 로그인   │
│                                    │                                          │
│                                    │  ── 시스템 상태 ─────────────────────    │
│                                    │  ● 정상 · API 42ms · v2.4.1 · 03:58 배포 │
└───────────────────────────────────┴──────────────────────────────────────────┘
```

적용 패턴: 시네마 문법 1·4, P13(배포 이력 노출).

### 3.3 대시보드 (관리자) — "Workshop 모듈"

Palantir 등가물: Workshop 모듈. 좌측 수직 헤더(접기 가능, 현행 `--rail-w:64px`), 상단 컨텍스트 바(현행 `--ctx-h:48px`), 본문은 Sections(Rows/Columns/Tabs) 조합. 정적 KPI 카드 나열을 버리고 **Metric Card + Data Freshness + 클릭 시 하위 객체집합으로 드릴다운**으로 바꾼다. 모든 KPI는 클릭 가능해야 하며, 클릭하면 그 숫자를 구성하는 객체 집합이 하단 Object Table과 우측 미니맵에 **동시에** 반영된다(P2).

필수 추가: **Action Log Timeline**(누가 무엇을 언제) + **Comments** + **AI 작업 큐**(MetaConstellation의 태스킹 큐 문법 그대로: pending → running → review → done, 각 항목에 ETA와 진행 막대, 실행 노드명).

```
┌──┬──────────────────────────────────────────────────────────────────────────┐
│LX│ 전국 ▾ │ 2026 상반기 ▾ │ 전체 사업 ▾        🔍  ⓘ 03:58 갱신   👤 김OO │ 48px
│  ├──────────────────────────────────────────────────────────────────────────┤
│🏠│ ┌ Metric ─┐┌ Metric ─┐┌ Metric ─┐┌ Metric ─┐  ← 전부 클릭 가능(드릴다운) │
│🗺│ │ 촬영면적 ││ 탐지건수 ││ 검수대기 ││ 정확도  │                            │
│📊│ │ 12,480㎢ ││  8,142  ││   317▲  ││ 94.2%   │                            │
│📁│ │ ▁▂▄▆█ +7%││ ▃▅▂▇▄   ││ 3분전   ││ n=2,140 │                            │
│⚙ │ └─────────┘└─────────┘└─────────┘└─────────┘                            │
│  │ ┌─ 진행 중 작업 큐 ────────────────┐┌─ 전국 현황 (라이트 미니맵) ──────┐ │
│  │ │ ▶ 남원 정사영상 정합   ███░░ 62% ││   ░ 시군구 코로플레스            │ │
│  │ │   ETA 00:18 · 노드 GPU-03       ││   ● 탐지 클러스터 (크기=건수)     │ │
│  │ │ ▶ 제주 해안 변화탐지   ██████ 91%││   [전체 지도로 →]  ← P7 승격      │ │
│  │ │ ⏸ 김제 지목불일치      대기 3/7  ││                                   │ │
│  │ └─────────────────────────────────┘└───────────────────────────────────┘ │
│  │ ┌─ 최근 활동 (Action Log) ─────────────────────────────────────────────┐ │
│  │ │ 14:02 김OO   탐지 #8102 '무허가' 승인            💬 2                │ │
│  │ │ 13:47 시스템 남원 4시점 타일 배포 완료                                │ │
│  │ │ 13:31 이OO   검수 반려 — "그림자 오탐"          💬 1  [보기]         │ │
│  │ └──────────────────────────────────────────────────────────────────────┘ │
└──┴──────────────────────────────────────────────────────────────────────────┘
```

적용 패턴: P2, P7, P13, P16.

### 3.4 XI맵 (분석 지도) — 이 프로젝트의 심장

Palantir 등가물: **Gaia + Foundry Map + Object Explorer 히스토그램**의 합. 여기서 승부가 난다. 3.1~3.3은 이 화면을 위한 도입부다.

필수 구성:
- 라이트 베이스맵 + 레이어 패널(가시성 토글, 잠금, 불투명도, 순서 드래그, 범례)
- 좌하단 **히스토그램/필터 패널**(접이식): 프로퍼티별 섹션, Value/Count 정렬 토글, 숫자·날짜 비닝, "필터 적용"/"필터 제외", 필터 칩 바, **비매칭은 감쇠**(P1)
- 우측 **선택 패널**: 객체 클릭 → 속성 목록 → "연결된 객체 (개수 미리보기)" → 주변 탐색(P3)
- 하단 **시간 슬라이더**: 4시점 스텝 + 재생/일시정지 + 자동 정지 지점 + 스와이프 비교(A/B 커튼)
- 드로잉 툴바: 폴리곤/원/선, 면적·둘레 측정, "이 영역 내 검색", "교차 선택"
- 우상단 **모드 토글**: 라이트 분석 모드 ↔ **다크 판독 모드**(정사영상 대비 극대화, HUD 십자선·좌표 리드아웃 표시)
- AI 레이어: 탐지 박스 + score 그래디언트 색, 검수 상태(대기/승인/반려)별 **stroke style**(solid/dashed/dotted — Palantir 규칙 그대로)
- 우측 하단 **AI 어시스턴트 도크**: "이 영역에서 작년 대비 늘어난 건축물은?" → 추론 체인 펼침(P10) → 결과가 지도에 필터로 적용

```
┌──┬────────────────────────────────────────────────────────────────────────────┐
│LX│ 남원시 ▾ │ 정사영상 2024-04-11 ▾ │ 🔍 객체 검색     ☀/☾ 판독모드   👤     │
│  ├─────────┬────────────────────────────────────────────────┬─────────────────┤
│🗺│ 레이어  │  ▓ 필터: 지목=대 ✕ │ score ≥ 0.8 ✕ │ 필터 초기화 │ 선택 객체     │
│📊│ ─────── │                                                │ ───────────── │
│📁│ ☑ 정사  │        (밝은 정사영상 / 지적도 오버레이)        │ ▣ 탐지 #8102  │
│⚙ │   ▮ 82% │                                                │ 무허가 건축물 │
│  │ ☑ 지적  │      ▢ ▢   ▢         ← 탐지박스(감쇠된 것 포함) │ ───────────── │
│  │ ☑ AI탐지│          ▢◉▢    ◉=선택됨(글로우+펄스)           │ score   0.91  │
│  │   🔒잠금│      ▢     ▢                                    │ 면적  142.6㎡ │
│  │ ☐ 3D    │                                                │ 지목      대  │
│  │ ☐ 변화  │   ┌ 측정 ─────┐                                │ 검수    대기  │
│  │ ─────── │   │ 4,182㎡    │   [◻폴리곤][○원][/선][📏측정] │ 최종   2h 전  │
│  │ 범례    │   │ 둘레 268m  │                                │ ───────────── │
│  │ ● 대기  │   └───────────┘                                │ 연결된 객체   │
│  │ ● 승인  │                                                │ ▸ 필지     3  │
│  │ ● 반려  │                                                │ ▸ 이전탐지 4  │
│  │         │                                                │ ▸ 민원     1  │
│  │         │                                                │ [주변 탐색 →] │
│  ├─────────┴────────────────────────────────────────────────┤ [승인] [반려] │
│  │ ┌ 히스토그램 ────────────────┐  ┌ AI 어시스턴트 ───────┐ │ 💬 코멘트 2   │
│  │ │ 지목    Value ▾  Count ▾   │  │ ▸ 추론 1/4 영역 파싱 │ ├───────────────┤
│  │ │  대     ████████ 412       │  │ ▸ 추론 2/4 2023 조회 │ │ 시점 비교     │
│  │ │  전     ████ 208           │  │ ▸ 추론 3/4 차분 계산 │ │ ◀ A ▮ B ▶     │
│  │ │  답     ██ 96              │  │ ● 결과: 신축 17건    │ │ 2023 ↔ 2024   │
│  │ │ [필터 적용] [필터 제외]    │  │ [지도에 적용]        │ └───────────────┘
│  │ └────────────────────────────┘  └──────────────────────┘                 │
│  ├────────────────────────────────────────────────────────────────────────────┤
│  │ ⏮ ◀ [▶ 재생] ▶ ⏭  2021-05 ●━━━━━━●━━━━━━●━━━━━━● 2024-04  ⏸자동정지 ▾  │ 36px
└──┴────────────────────────────────────────────────────────────────────────────┘
```

적용 패턴: P1, P2, P3, P4, P5, P6, P9, P10, P12, P13.

### 3.5 프로젝트/워크플로우 캔버스 — "AIP Logic + Apollo"

Palantir 등가물: **AIP Logic의 블록 파이프라인** + Apollo의 배포 상태 시각화. 노드 그래프 캔버스에 데이터 소스 → 전처리 → 모델 추론 → 후처리 → 검수 → 산출물 블록을 연결. 실행 중에는 **다크 ops 모드**로 전환하고, 데이터가 엣지를 따라 흐르는 파티클 애니메이션 + 각 노드의 처리량·ETA를 표시한다. 노드를 클릭하면 우측에 **Debugger 패널**: 입력 샘플, 출력 샘플, 로그, 그리고 LLM/모델 블록이면 **추론 체인**.

핵심: 실행이 진행 막대 하나가 아니라 **관측 가능한 파이프라인**이어야 한다.

```
┌──┬────────────────────────────────────────────────────────────────────────────┐
│LX│ 프로젝트 · 남원 2024 정기조사   [초안|검토중|실행중|완료]   [▶ 실행] [⋯]  │
│  ├────────────────────────────────────────────────────┬───────────────────────┤
│🗺│  ░░░ 실행 중: 다크 ops 캔버스 ░░░                   │ 블록 상세             │
│📊│                                                     │ ─────────────────     │
│📁│  ┌─────────┐   ┌──────────┐   ┌───────────┐        │ ▣ 03 AI 추론          │
│⚙ │  │01 소스  │──▶│02 전처리 │──▶│03 AI 추론 │──┐     │ 모델 LX-DET v3.2      │
│  │  │ 정사 4  │·· │ 타일/정합│···│ ███░ 62%  │  │     │ GPU  A100 ×2          │
│  │  │ ✔ 완료  │   │ ✔ 완료   │   │ ETA 00:18 │  │     │ 처리 3,412 / 5,500    │
│  │  └─────────┘   └──────────┘   └───────────┘  │     │ 초당 41 tile          │
│  │       ▲                                       ▼     │ ─────────────────     │
│  │  ┌─────────┐                          ┌───────────┐│ 추론 체인             │
│  │  │01b 지적 │                          │04 후처리  ││ ▸ 타일 로드           │
│  │  │ ✔ 완료  │─────────────────────────▶│ 대기      ││ ▸ NMS 임계 0.55       │
│  │  └─────────┘                          └───────────┘│ ▸ 지적 교차 검증      │
│  │                                             │       │ ─────────────────     │
│  │                                             ▼       │ 최근 로그             │
│  │                                       ┌───────────┐ │ 13:58 tile 3400 ok    │
│  │                                       │05 검수    │ │ 13:57 warn cloud .3   │
│  │                                       │ 대기 317  │ │ ─────────────────     │
│  │                                       └───────────┘ │ [샘플 출력 보기]      │
│  │  · · · 엣지 위 파티클 = 실제 데이터 흐름 · · ·      │ [블록 로그 전체]      │
│  ├────────────────────────────────────────────────────┴───────────────────────┤
│  │ 실행 이력 ▏2026-08-25 13:40 실행 (김OO) ▏08-20 실행 ✔ ▏08-14 실패 ✕ [비교]│
└──┴────────────────────────────────────────────────────────────────────────────┘
```

적용 패턴: P8, P10, P13, P14(실행 이력 비교 = 시나리오 비교의 씨앗), 시네마 문법 3·5·6.

### 3.6 데이터 관리 — "Object Explorer + Data Freshness"

Palantir 등가물: Object Explorer / Foundry 데이터셋 뷰. 폴더 트리 + 파일 목록이라는 탐색기 은유를 버리고 **객체 집합 탐색**으로 간다. 상단에 검색 + Exploration Filter Pills, 좌측에 히스토그램형 패싯(연도/지역/센서/해상도/상태), 본문은 표 + **미니 지도 프리뷰**(선택한 데이터셋의 공간 범위가 즉시 지도에 그려짐), 우측은 선택 항목의 메타·계보(lineage)·신선도·이력·권한.

핵심 차별점 2가지: (1) **모든 행이 공간 범위를 가지므로 표와 지도가 항상 연동**된다. (2) **계보(lineage) 그래프** — 이 산출물이 어느 원본에서 어떤 처리를 거쳐 나왔는지 노드 그래프로. 이것이 공공 플랫폼에서 신뢰를 만드는 결정적 장치이며, Gotham의 마킹·분류 상속 원칙과도 같은 계열이다.

```
┌──┬────────────────────────────────────────────────────────────────────────────┐
│LX│ 🔍 데이터 검색            [연도 2024 ✕][센서 드론 ✕][상태 배포됨 ✕] 초기화 │
│  ├───────────────┬───────────────────────────────────────┬────────────────────┤
│🗺│ 패싯          │ 이름                해상도 갱신  상태 │ 선택: 남원_2024_04 │
│📊│ ───────────── │ ───────────────────────────────────── │ ────────────────── │
│📁│ 연도          │ ▣ 남원_2024_04_정사   5cm  3분전  ●   │ ┌ 공간 범위 ─────┐ │
│⚙ │  2024 ███ 128 │ ▢ 남원_2023_10_정사   5cm  10개월 ●   │ │ (라이트 미니맵) │ │
│  │  2023 ██  91  │ ▢ 제주_해안_2024      10cm 2일전  ●   │ │  ▭ 범위 폴리곤  │ │
│  │  2022 █   44  │ ▢ 김제_지적_2024      -    1주    ○   │ └────────────────┘ │
│  │ 센서          │ ▢ 해양쓰레기_2024     3cm  4일전  ●   │ 크기    41.2 GB    │
│  │  드론 ████ 96 │ ▢ 남원_DSM_2024       25cm 3분전  ●   │ 좌표계  EPSG:5186  │
│  │  항공 ███ 71  │                                       │ 타일    12,480     │
│  │  위성 ██  38  │                                       │ 신선도  ● 3분 전   │
│  │ 해상도        │                                       │ 등급    내부공개   │
│  │  ≤5cm ███ 88  │                                       │ ────────────────── │
│  │  ≤10cm██  52  │                                       │ 계보               │
│  │ 상태          │                                       │  원시 → 정합 → 정사│
│  │  배포 ████201 │                                       │        ↘ AI 탐지   │
│  │  처리 ██  33  │                                       │ ────────────────── │
│  │ [적용][제외]  │                                       │ 이력 · 권한 · 💬 3 │
│  │               │                                       │ [지도에서 열기 →]  │
└──┴───────────────┴───────────────────────────────────────┴────────────────────┘
```

적용 패턴: P1, P2, P7, P13.

---

## 4. "Palantir-ness" 체크리스트 (18항목)

각 화면을 이 표로 채점한다. 0(없음) / 1(부분) / 2(완전). 화면당 만점 36점, **28점 미만이면 반려**.

| # | 항목 | 판정 기준 |
|---|---|---|
| 1 | **객체가 1급 시민인가** | 지도·표·차트에서 클릭한 대상이 동일한 "객체"이며 동일한 속성 패널을 여는가 |
| 2 | **모든 숫자가 클릭 가능한가** | KPI·카운트·막대를 클릭하면 그 숫자를 구성하는 객체 집합으로 갈 수 있는가 |
| 3 | **뷰가 상호 연동되는가 (cross-filter)** | 한 뷰의 선택이 다른 모든 뷰에 즉시 반영되는가 |
| 4 | **필터가 삭제가 아니라 감쇠인가** | 비매칭 항목이 흐려진 채 남고, 제거 가능한 필터 칩 바가 보이는가 |
| 5 | **관계를 탐색할 수 있는가** | "연결된 객체 N개"를 미리 보여주고 순회(Search Around)할 수 있는가 |
| 6 | **시간이 1급 축인가** | 슬라이더뿐 아니라 재생·일시정지·자동 정지·시점 비교가 있는가 |
| 7 | **시간 기반 시각 감쇠가 있는가** | 오래된 것이 흐려지고, 이동체가 궤적을 남기는가 |
| 8 | **지도가 입력 장치인가** | 도형을 그려 질의·측정·선택할 수 있는가 (배경 그림이 아닌가) |
| 9 | **레이어가 통제 가능한가** | 가시성·불투명도·순서·잠금·범례를 사용자가 조작하는가 |
| 10 | **심볼로지가 의미를 갖는가** | 일반 핀이 아니라 도메인 글리프 + 상태별 stroke·색 규칙이 있는가 |
| 11 | **AI가 사고 과정을 보여주는가** | 추론 체인·도구 호출·참조 데이터를 펼쳐 볼 수 있는가 |
| 12 | **AI 신뢰도를 정직하게 다루는가** | 점수 + 검증 근거(n, 정밀도) + 사람 검수 이력 + "값 없음" 표기가 있는가 |
| 13 | **사람의 흔적이 보이는가** | 갱신 시각, 변경 이력, 담당자, 코멘트가 화면에 상주하는가 |
| 14 | **아이콘이 3단 상태를 갖는가** | muted → hover(본문색) → selected(인텐트색) |
| 15 | **밀도가 충분한가** | 컨트롤 30px, 본문 13~14px, 4px 배수 간격, 여백보다 정보 우선 |
| 16 | **상태 전환이 100ms인가** | UI 마이크로 인터랙션 150ms 이하, 시네마틱 무브는 별도 축(1.2s 이상)으로 분리 |
| 17 | **승격 경로가 있는가** | 작은 위젯에서 전체 앱으로 컨텍스트를 유지한 채 이동 가능한가 |
| 18 | **화면이 이야기를 하는가** | 스케일 이동 · 시간 압축 · 사람의 개입 중 최소 1개가 연출되어 있는가 |

**빠른 자가진단**: 스크린샷을 정지 이미지로 놓고 "이 화면에서 무엇을 클릭할 수 있고, 클릭하면 무엇이 변하는가"를 5개 이상 말할 수 없으면 그 화면은 여전히 뻣뻣하다.

---

## 5. 실행 우선순위 (투자 대비 효과 순)

1. **P12 아이콘 3단 상태 + 밀도 재조정** — CSS만으로 하루. 뻣뻣함의 절반이 사라진다.
2. **XI맵 히스토그램 패널 + 감쇠 필터(P1)** — 이 하나가 "Palantir 같다"는 인상을 만든다.
3. **시간 슬라이더 재생 + 자동 정지(P4) + 시점 비교 커튼** — 남원 4시점 실자산이 이미 있다.
4. **선택 패널 + 연결 객체 개수 프리뷰(P3)** — 온톨로지 감각의 최소 구현.
5. **Data Freshness / Action Log / Comments 상시 노출(P13)** — "사람 냄새" 요구에 대한 직답.
6. **홈 스케일 다이브 시네마(다크 → 라이트 크로스페이드)** — 발주처 시연용 킬러 장면.
7. **AI 추론 체인 펼침(P10) + Evals식 근거 표시(#12)** — 공공 플랫폼 신뢰성의 핵심.

## 6. 주의사항 (Palantir를 잘못 베끼는 법)

- **다크로 다 칠하기**: Palantir가 다크인 이유는 상황실 조도와 포지셔닝 때문이지 멋 때문이 아니다. 그들조차 Map 앱에 Light/Dark 사용자 설정을 둔다. 우리는 밝은 정사영상을 판독하는 플랫폼이고, 라이트 베이스가 옳다. 다크는 **연출 장치와 판독 모드**로만.
- **Blueprint 색을 그대로 쓰기**: LX 브랜드(`--lx:#006DF7`)를 버리면 안 된다. 가져올 것은 **구조**(그레이 램프 11단, 인텐트 4색 분리, 확장 팔레트 10색, 아이콘 3단 상태, 4px 그리드, 30px 컨트롤, 50px 네비바)이지 헥스값이 아니다.
- **가짜 HUD**: 아무 데이터도 연결되지 않은 코너 브래킷과 십자선은 즉시 들킨다. HUD의 모든 숫자는 **실제 값**이어야 한다.
- **가짜 신뢰도 게이지**: "AI 신뢰도 94%" 원형 게이지는 Palantir 문법의 정반대다. 근거를 보여줘라.
- **느린 UI 애니메이션**: 400ms 페이드는 고급스러움이 아니라 렉이다. 시네마는 시네마 자리에서만.
- **위젯 나열**: 위젯 개수가 아니라 **위젯 간 연동**이 Palantir다. 연동되지 않는 패널 6개보다 연동되는 패널 3개가 낫다.

---

*문서 끝. 후속 작업: 이 체크리스트로 현행 `landxi/home.html`, `login.html`, `dashboard.html` 채점 → 갭 리스트 → 구현 계획 수립.*
