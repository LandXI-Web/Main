# 대시보드 기능 대조표 (parity) — 원본 ↔ B5 판 스택 대시보드

원본: <https://mini531.github.io/namwon-smart-village/landxi7/dashboard.html>
(좌측 레일은 `include/header.html`, 로더는 `assets/js/layout.js`)
우리 구현: `landxi/proto/dashboard.html` + `dashboard.css` + `dashboard.js` + `db-data.js`(데이터 조립) + `db-geo.js`(지오메트리 투영)

원칙(클라이언트 지시, 2026-08-26): **"최대한 기능적으로 추가가 없게. 왼쪽 메뉴(데이터 관리 등)도
구현. 현재 구현된 기능에 디자인을 입힌다."** → 이 표의 모든 행이 1:1로 대응해야 하고,
표에 없는 기능은 새로 만들지 않는다.
추가 지시(2026-08-27): **"로그인 하면 관리자 대시보드도 구형인데 신형으로 바꾼다"** · 글꼴 Paperlogy + Pretendard, 톤 T3 ·
**"불필요한 글자는 전체 다 삭제한다"** — 설명 문장 0, 수치·칩만. 자세한 값은 호버 콜아웃에.

**채택안: `design-canvas/v2/B5-Dashboard.dc.html` rev2 "SPLIT-5050 지도 그리드 스택"**(NOTES.md §12.5, 커밋 `493a76b`).
지도 위젯 없음. 좌 = **AI 분석 결과** 판 스택(B5 발행 분석 카드의 실체), 우 = **AI 학습데이터 구축 현황** 판 스택(B10 AI 개발 프로젝트 현황의 실체).
그 아래 KPI 텍스트 띠(B4·B6·B7·B8 | B11 | B12) → B9 한 줄 → B13 원장 → B14 칩 레일 → B15 푸터. B3·B2 는 마스트헤드.
이전 구현(A안 "지도 위 원장" Ops Atlas — 판·스캔 스트립·시간 스크러버·임계 범례·락온)은 **전부 삭제**했다(`db-plate.js` `db-strip.js` `db-charts.js`).

## A. 좌측 내비게이션 레일 (`include/header.html` · `aside.app-sidebar`)

| # | 원본 항목 | data-menu | 원본 링크 | 우리 구현에서 어디에 있나 |
|---|---|---|---|---|
| A1 | 브랜드 심볼 `sb-logo` | — | — | `#rail-mark` — `LAND XI` 워드마크, 클릭 시 메인 `scrub/index.html` |
| A2 | 대시보드 | `dashboard` | `dashboard.html` | `#rail [data-menu=dashboard]` · **현재 페이지**(`aria-current="page"`) · 누르면 맨 위 |
| A3 | 데이터 관리 | `media` | `dataset.html` | `#rail [data-menu=media]` → **`dataset.html`**(신형 데이터 관리 화면으로 이동) |
| A4 | 프로젝트 | `project` | `ai-project.html` | `#rail [data-menu=project]` → 우 스택 **AI 학습데이터 구축 현황**(`#stack-r`, 앞 판에 포커스 = 호버 장치) |
| A5 | 분석 서비스 | `analysis` | `analysis-ai.html` | `#rail [data-menu=analysis]` → 좌 스택 **AI 분석 결과**(`#stack-l`) |
| A6 | 지도 서비스 | `map` | `ximap.html` | `#rail [data-menu=map]` → 좌 스택 `#stack-l`(결과 지오메트리가 서 있는 곳) |
| A7 | 서비스 지원 | `support` | `notice.html` | `#rail [data-menu=support]` → 마스트헤드 **공지**(`#b-notice`) |
| A8 | 카드 발행 관리 | `publish-admin` | `admin-publish.html` | `#rail [data-menu=publish-admin]` → **카드 발행 승인 대기**(`#b-approve`) |
| A9 | 서비스 관리 | `admin` | `admin-notice.html` | `#rail [data-menu=admin]` → **관리 바로가기** 칩 레일(`#ad-rows`) |
| A10 | MY (플라이아웃) · 마이 페이지 `mypage.html` | `my` | — | `#rail [data-menu=my]` + `#rail-my` 플라이아웃 — 항목 동일(마이 페이지 · 로그아웃) |
| A11 | 로그아웃 (`data-action=logout` → `lx_logged_in` 삭제 후 이동) | — | — | `[data-action=logout]` — localStorage 삭제 → 메인 `scrub/index.html` |

> 원본 페이지(`ai-project.html` 등)는 이 콘티 저장소에 존재하지 않는다. 링크를 지어내지 않고,
> **같은 데이터를 담고 있는 우리 화면의 자리로 보낸다**. 레일 항목에는 원본 파일명을 `title`로 달아 대응 관계를 남긴다.
> 로그인 관문: 플래그가 없으면 `login.html?next=dashboard.html`(+query) 로 보낸다.

## B. 본문 위젯 (`dashboard.html`) — 각 **1회**

| # | 원본 위젯 | 원본 값·동작 | 우리 구현에서 어디에 있나 |
|---|---|---|---|
| B1 | 페이지 제목 `LX 관리자 대시보드` + 부제 | 정적 | `#b1`(Paperlogy 32). 부제 문장은 "불필요한 글자 삭제" 지시로 **뺐다** |
| B2 | 기준일 `#dash-now-date` + "기준일 현재" | `new Date()` | 마스트헤드 `#b2` — 콘티 원칙상 오늘이 아니라 데이터 기준시점(`results.js` 마지막 분석일 `2026.06.08`) |
| B3 | 공지 스트립 · 제목 링크 · 날짜 · `전체 보기 ›` | `고위험 탐지 건 긴급 처리 안내 · 2026.04.15` | 마스트헤드 `#b-notice` → `../notice.html?notice=8` |
| B4 | KPI ① 전체 사용자 | `21명` / `정상 19 · 가입 승인 대기 1` | 띠 `#b-kpi .k`(1/4) — Paperlogy 28 액센트, 카운트업 900ms easeOutQuart, 부제는 수치만 `정상 19 · 대기 1` |
| B5 | KPI ② 발행 분석 카드 | `8건` / `공개 7 · 비공개 1` | **좌 스택 헤더** `#b5` `발행 분석 카드 8 · 공개 7 · 비공개 1` — 스택 6장이 이 8건의 실체 |
| B6 | KPI ③ 카드 발행 승인 대기 | `2건` / `검토 필요` → `?status=대기` | `#b-kpi a.k` → `dashboard.html?status=대기` (B16) |
| B7 | KPI ④ 가입 승인 대기 | `1건` / `승인 필요` | `.k`(3/4) |
| B8 | KPI ⑤ 미답변 문의 | `6건` / `전체 12 · 답변 필요` | `.k`(4/4) — `전체 12` |
| B9 | AI 기반 모델(백본) 카드 | `XI-VFM v2.1` · 최종 적용 `2026.03.12` · 연결된 분석 과제 `14개` | `#b-bb` **한 줄** — `XI-VFM v2.1 · 최종 적용 2026.03.12 · 연결된 분석 과제 14개 (측정 10 · AOI 미지정 4)` |
| B10 | 차트 ① AI 개발 프로젝트 현황 + `전체 보기` | ECharts 가로막대 Top5 (GB) | **우 스택 헤더** `#b10` `프로젝트 용량 Top5 1,326 GB 시연` + 2행 Top5 수치(1위만 잉크) + `전체 보기 ›` → `../ai-project.html`. 판 7장 = `imagery.js` 시점(GSD·범위·줌) |
| B11 | 차트 ② 사용자 이용 현황 | ECharts 세로막대 `최근 7일 방문` | `#t-visit` — SVG **폴리라인**, 7값 전부(요일 축), 양끝·최대만 잉크 + 직접 라벨, 합계 5,575 |
| B12 | 차트 ③ 전체 스토리지 사용량 | ECharts 도넛 + 범례, `44.5 / 184 TB` | `#t-store` — SVG **스택 바 16px** + 6분류 범례 + 잔여 |
| B13 | 카드 발행 승인 대기 + `카드 발행 관리` | `CARD_APPROVALS` **2건**, 행 → `?open=<id>` | `#ap-table` 2행(# · 카드명 · 버전 · 요청 일시 `시연` · 요청 지역 `추정` · 상태 · 진입) → `dashboard.html?open=pa-1|pa-6` |
| B14 | 사용자·콘텐츠 관리 타일 4 | 사용자 / 공지사항 / 문의 / FAQ 관리 + 부제 수치 | `#ad-rows` **CHIP-RAIL** 4 — 이름·수치 원본 그대로, `../admin-*.html` |
| B15 | 푸터 include | 회사 정보 · 고객센터 | `#foot` — 한 줄 + `Family Site ▾`. 콜로폰 문장은 **뺐다** |
| B16 | 딥링크 규약 | KPI `?status=대기`, 승인 행 `?open=<id>` | `?status=대기` → `#b-approve` 에 `aria-current` + 브래킷 + 스크롤 · `?open=<id>` → 그 행 `aria-current`(틴트 #D6E6FF) + 포커스. 없는 id 는 `#say` 로 자백 |

### B-표 밖 = 원본 위젯의 다른 표현 (새 기능 아님)

| 장치 | 무엇을 하나 | 대응하는 원본 기능 |
|---|---|---|
| 좌 판 스택 `#plates-l` 6장 | 01 남원 농지이용 2,098필지 · 02 남원 비닐하우스 9,664동·1,674필지 · 03 여수 항공 1,860건 · 04 여수 드론 2,078건 · 05 남원 변화지수 456폴리곤(비지도, 점선 고스트) · 06 도로안전 다시점 조사(준비 중, 빈 점선 판). 실크롭(`crops.js`) + 흰 그래티큘 4×2 + **청록 결과 지오메트리(GeoJSON 투영)** | B5 발행 분석 카드 · A5/A6 분석·지도 서비스가 가리키는 실측 산출물 |
| 우 판 스택 `#plates-r` 7장 | 01 남원 2025-06(GSD 1.69, 라벨 연결) · 02 2025-04 · 03 2025-08 · 04 2025-10(전역 2 m) · 05 국산리 A68·A71 · 06 제주 2020·2022 · 07 여수(타일 미등록 고스트) | B10 AI 개발 프로젝트 현황(용량은 시연·추정 태그로 콜아웃에) |
| 호버·포커스 장치 | 판 `translateY(-8px)` 180ms, 나머지 `.54`(dim-not-delete), 코너 브래킷 4 + 리더선 + 콜아웃(180×128, 액센트 테두리) — **화면의 액센트는 이 장치 1종**(+ T3 허용: KPI 숫자·링크·선택 행) | 그리드 셀의 내용 보기(발주 원문 "마우스를 올리면 그리드에 어떤 결과들이 있는지") |
| 유휴 1 | 앞 판(01)의 결과 지오메트리가 6 s 마다 1 s 스윕 — 실데이터에 묶인 유일한 움직임. `prefers-reduced-motion` = 정지 | 시스템 §4 |

### 지오메트리 투영 (`db-geo.js`)

크롭(`crops.js`)은 `tools/crops/make_crops.py` 가 Web Mercator 타일을 스티칭해 중심 `lnglat` 기준 가로 `window_m` 미터 창을 640×420 으로 리샘플한 것이다.
`window_m` 은 `crops.js` 에 없지만 규칙이 결정적이다 — 결과 크롭: **앵커 피처**(대표점이 크롭 중심인 피처) bbox 의 긴 변 × 배율을 clamp
(남원 ×2.0 → 70–120 m, 여수 ×8 → 20–70 m), 시계열 크롭: 고정(남원 4시점 90 m, 국산리 80 m).
`projector(crop, winM)` 가 lnglat → 크롭 픽셀로 옮기고(`k = (winM/640)/res_z19(lat)`), `featuresIn` 이 창과 겹치는 피처만 골라
`<path>`(면적 36 px² 미만은 5×5 `<rect>`)로 그린다. SVG 는 `viewBox 0 0 640 420 · xMidYMid slice` 라 `object-fit:cover` 사진과 정확히 겹치고,
`vector-effect:non-scaling-stroke` 로 스큐·축소 후에도 1 px 이다. 검증: 파이프라인이 그린 `2.jpg` 파란 외곽선 위에 우리 투영(빨강)이 정확히 겹친다(`shots/proto-dash/chk-projection.png`).
콜아웃의 `판 위 n필지 · 읍면동 m` 은 실제로 판에 선 피처 수와 그 안 최빈 `emd` 의 `results.js` 집계다.

## C. 원본에 없어서 만들지 않은 것

| 항목 | 실측 | 우리 처리 |
|---|---|---|
| 탭 UI | `[role=tab]` **0개** | 없음. e2e 가 `탭 0개`를 검증한다 |
| 커버리지 위젯 · 처리 대기 큐 | 없다 | 없음 |
| 지도 | 원본 대시보드에 지도 요소는 **없다** | **지도 위젯 0**(MapLibre 미로드). 판은 위젯이 아니라 실크롭 사진 위 결과 지오메트리다 |

## D. 화면이 자백하는 것 (지어내지 않는다)

| 자백 | 값 | 어디 |
|---|---|---|
| `카드 ↔ 결과 매핑 미확정` | 8 ↔ 6 | 좌 스택 2행 칩 |
| `측정 10 · AOI 미지정 4` | 14 − 10 | B9 |
| `준비 중 · 결과 파일 없음` | 도로안전 다시점 조사 | 좌 06 고스트 판 + 콜아웃 |
| `타일 카탈로그 미등록 · 결과만 보유` | 여수 | 우 07 고스트 판 |
| `라벨 연결 없음` | 남원 2025-04·08 | 우 라벨 |
| `시연` / `추정` | 원본 시드 / 우리가 이은 값 | 태그 |
| GSD `추정` | 농지이용 결과가 어느 시점 영상에서 나왔는지는 데이터에 없다 → 2025-06 · 1.69 cm 를 추정 태그로 | 좌 콜아웃 |
