# 대시보드 기능 대조표 (parity) — 원본 ↔ B5 판 스택 대시보드

원본: <https://mini531.github.io/namwon-smart-village/landxi7/dashboard.html>
(좌측 레일은 `include/header.html`, 로더는 `assets/js/layout.js`)
우리 구현: `landxi/proto/dashboard.html` + `dashboard.css` + `dashboard.js` + `db-data.js`(데이터 조립) + `db-geo.js`(지오메트리 투영)

원칙(클라이언트 지시, 2026-08-26): **"최대한 기능적으로 추가가 없게. 왼쪽 메뉴(데이터 관리 등)도
구현. 현재 구현된 기능에 디자인을 입힌다."** → 이 표의 모든 행이 1:1로 대응해야 하고,
표에 없는 기능은 새로 만들지 않는다.
추가 지시(2026-08-27): **"로그인 하면 관리자 대시보드도 구형인데 신형으로 바꾼다"** · 글꼴 Paperlogy + Pretendard, 톤 T3 ·
**"불필요한 글자는 전체 다 삭제한다"** — 설명 문장 0, 수치·칩만. 자세한 값은 호버 콜아웃에.

**채택안(발주자 정정 2026-08-27 "이 대시보드로 적용해야지"): `design-canvas/v2/B5-Dashboard-Data.dc.html`** — 발주자 보드.
마스트헤드(B3·B2) → B1 → KPI 5(B4–B8, Paperlogy 56 액센트) → SPLIT: 좌 B9 백본 헤더 + **대한민국 전도 판**(MapLibre · EOX Sentinel-2 cloudless 2024,
0.25° 그리드를 SVG 로 투영, 셀 = 실자산 위치, 토글 `AI 분석 결과 | AI 학습데이터 구축 현황`, 셀 호버 콜아웃, 클릭 → `ximap.html?cell=`) /
우 **탭 패널 1**(`AI 개발 프로젝트 현황 | 사용자 이용 현황 | 전체 스토리지 사용량` = B10 | B11 | B12, 판과 같은 254 높이, 키보드·localStorage·카운트업)
→ B13 표 → B14 칩 레일 → B15 푸터. 이전 두 구현(A안 Ops Atlas, rev2 twin-stack)은 git 이력에만 남는다.

## A. 좌측 내비게이션 레일 (`include/header.html` · `aside.app-sidebar`)

| # | 원본 항목 | data-menu | 원본 링크 | 우리 구현에서 어디에 있나 |
|---|---|---|---|---|
| A1 | 브랜드 심볼 `sb-logo` | — | — | `#rail-mark` — `LAND XI` 워드마크, 클릭 시 메인 `scrub/index.html` |
| A2 | 대시보드 | `dashboard` | `dashboard.html` | `#rail [data-menu=dashboard]` · **현재 페이지**(`aria-current="page"`) · 누르면 맨 위 |
| A3 | 데이터 관리 | `media` | `dataset.html` | `#rail [data-menu=media]` → **`dataset.html`**(신형 데이터 관리 화면으로 이동) |
| A4 | 프로젝트 | `project` | `ai-project.html` | `#rail [data-menu=project]` → 우 패널 **탭 1 AI 개발 프로젝트 현황** |
| A5 | 분석 서비스 | `analysis` | `analysis-ai.html` | `#rail [data-menu=analysis]` → 판(결과 셀에 포커스 = 콜아웃) |
| A6 | 지도 서비스 | `map` | `ximap.html` | `#rail [data-menu=map]` → 판. 셀 클릭이 `ximap.html?cell=<lon>,<lat>&mode=` |
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
| B4 | KPI ① 전체 사용자 | `21명` / `정상 19 · 가입 승인 대기 1` | `#b-kpi .k`(1/5) — Paperlogy 56 액센트, 카운트업 900ms easeOutQuart |
| B5 | KPI ② 발행 분석 카드 | `8건` / `공개 7 · 비공개 1` | `#b-kpi .k`(2/5) |
| B6 | KPI ③ 카드 발행 승인 대기 | `2건` / `검토 필요` → `?status=대기` | `#b-kpi a.k` → `dashboard.html?status=대기` (B16) |
| B7 | KPI ④ 가입 승인 대기 | `1건` / `승인 필요` | `.k`(4/5) |
| B8 | KPI ⑤ 미답변 문의 | `6건` / `전체 12 · 답변 필요` | `.k`(5/5) |
| B9 | AI 기반 모델(백본) 카드 | `XI-VFM v2.1` · 최종 적용 `2026.03.12` · 연결된 분석 과제 `14개` | 좌 헤더 `#b-bb` + `#bb-sub` `최종 적용 2026.03.12 · 연결된 분석 과제 14개 (측정 10 · AOI 미지정 4)` — 그 아래 판이 이 모델의 입력(학습데이터)·출력(결과) 위치 |
| B10 | 차트 ① AI 개발 프로젝트 현황 + `전체 보기` | ECharts 가로막대 Top5 (GB) | 우 패널 **탭 1** `#pane-proj` — 랭크드 바 5(1위 액센트·22px), 합계 1,326 GB, `전체 보기 ›` → `../ai-project.html` |
| B11 | 차트 ② 사용자 이용 현황 | ECharts 세로막대 `최근 7일 방문` | 우 패널 **탭 2** `#pane-visit` — SVG 폴리라인 150px, 7값 직접 라벨(최대 액센트), 합계 5,575 |
| B12 | 차트 ③ 전체 스토리지 사용량 | ECharts 도넛 + 범례, `44.5 / 184 TB` | 우 패널 **탭 3** `#pane-store` — 44.5 큰 숫자 + 스택 바 40px + 6분류 범례 + 잔여 |
| B13 | 카드 발행 승인 대기 + `카드 발행 관리` | `CARD_APPROVALS` **2건**, 행 → `?open=<id>` | `#ap-table` 2행(# · 카드명 · 버전 · 요청 일시 `시연` · 요청 지역 `추정` · 상태 · 진입) → `dashboard.html?open=pa-1|pa-6` |
| B14 | 사용자·콘텐츠 관리 타일 4 | 사용자 / 공지사항 / 문의 / FAQ 관리 + 부제 수치 | `#ad-rows` **CHIP-RAIL** 4 — 이름·수치 원본 그대로, `../admin-*.html` |
| B15 | 푸터 include | 회사 정보 · 고객센터 | `#foot` — 한 줄 + `Family Site ▾`. 콜로폰 문장은 **뺐다** |
| B16 | 딥링크 규약 | KPI `?status=대기`, 승인 행 `?open=<id>` | `?status=대기` → `#b-approve` 에 `aria-current` + 브래킷 + 스크롤 · `?open=<id>` → 그 행 `aria-current`(틴트 #D6E6FF) + 포커스. 없는 id 는 `#say` 로 자백 |

### B-표 밖 = 원본 위젯의 다른 표현 (새 기능 아님)

| 장치 | 무엇을 하나 | 대응하는 원본 기능 |
|---|---|---|
| 판 `#plate-wrap` | MapLibre(EOX Sentinel-2 cloudless 2024, 상호작용 없음) 위 0.25° 그리드(SVG)와 셀(DOM 버튼). 셀 위치 = `db-cells.js` 가 실좌표에서 투영(`fitProjector` = MapLibre 카메라와 같은 수식이라 타일과 정확히 겹친다). WebGL 없으면 그리드·셀만 |
| 셀 등급(결과 모드) | 결과 3건 이상 / 2 / 1(청록 .82/.55/.3) · 학습데이터만(흰 외곽) · 조사 예정(점선). 결과 = `results.js` camera.center 의 셀, 변화지수 = `change.js` bounds 중심(비지도, 1건으로 셈), 영상 = `imagery.js` bounds 가 겹치는 셀 전부 |
| 셀 등급(학습데이터 모드) | 정사영상 시점 수 4+ / 2–3 / 1(파랑) · 결과만(영상 미등록, 청록 점선) |
| 콜아웃 | `남원 127.25–127.50 E · 35.25–35.50 N / AI 분석 결과 2건 / 농지이용 2,098필지 · 비닐하우스 9,664동` — 전부 results.js 값. 학습데이터 모드는 시점·GSD |
| 탭 패널 | B10·B11·B12 각 1회. ←/→/Home/End, `lx_dash_tab` 기억, `?tab=` 딥링크, 전환 시 카운트업 |

### 자백 (지어내지 않는다)

| 자백 | 값 |
|---|---|
| 남원 셀 = 결과 **2건** | 발주자 보드는 3건(변화지수 포함)이라 썼지만 `change.js` bounds(35.53 N)는 북쪽 셀 `127.25,35.50` 이다 → 그 셀에 1건으로 따로 선다 |
| 조사 예정 0셀 | 결과·영상 없는 real 서비스(도로안전)의 lnglat 가 남원 결과 셀 안이라 별도 셀이 없다 → 범례 행 자체가 없다 |
| `측정 10 · AOI 미지정 4` | B9 14개 ↔ 실측 10건 |
| `시연` / `추정` | 원본 시드 / 우리가 이은 값 |

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
