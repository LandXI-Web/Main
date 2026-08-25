# 대시보드 기능 대조표 (parity) — 원본 ↔ Ops Atlas

원본: <https://mini531.github.io/namwon-smart-village/landxi7/dashboard.html>
(좌측 레일은 `include/header.html`, 로더는 `assets/js/layout.js`)
우리 구현: `landxi/proto/dashboard.html` + `dashboard.js` + `db-*.js`

원칙(클라이언트 지시, 2026-08-26): **"최대한 기능적으로 추가가 없게. 왼쪽 메뉴(데이터 관리 등)도
구현. 현재 구현된 기능에 디자인을 입힌다."** → 이 표의 모든 행이 1:1로 대응해야 하고,
표에 없는 기능은 새로 만들지 않는다. 세 레지스터(01/02/03)는 **기능이 아니라 원본 내용의 표현 방식**이다.

## A. 좌측 내비게이션 레일 (`include/header.html` · `aside.app-sidebar`)

| # | 원본 항목 | data-menu | 원본 링크 | 우리 구현에서 어디에 있나 |
|---|---|---|---|---|
| A1 | 브랜드 심볼 `sb-logo` (`lx_symbol.png`, 마이페이지에서 교체 가능) | — | — | `#rail .rail-mark` — LX 심볼(`assets/images/lx_symbol.png`), 클릭 시 `../home.html` |
| A2 | 대시보드 | `dashboard` | `dashboard.html` | `#rail [data-menu=dashboard]` · **현재 페이지**(`aria-current="page"`) |
| A3 | 데이터 관리 | `media` | `dataset.html` | `#rail [data-menu=media]` → 레지스터 **02 학습데이터**(`?tab=train`) |
| A4 | 프로젝트 | `project` | `ai-project.html` | `#rail [data-menu=project]` → 원장 **FIG. 12 AI 개발 프로젝트 현황**으로 스크롤 |
| A5 | 분석 서비스 | `analysis` | `analysis-ai.html` | `#rail [data-menu=analysis]` → 레지스터 **01 추론 현황**(`?tab=infer`) |
| A6 | 지도 서비스 | `map` | `ximap.html` | `#rail [data-menu=map]` → 레지스터 **03 결과 누적**(`?tab=results`) |
| A7 | 서비스 지원 | `support` | `notice.html` | `#rail [data-menu=support]` → 원장 **FIG. 08 공지**로 스크롤 |
| A8 | 카드 발행 관리 | `publish-admin` | `admin-publish.html` | `#rail [data-menu=publish-admin]` → 원장 **FIG. 13 카드 발행 승인 대기**로 스크롤 |
| A9 | 서비스 관리 | `admin` | `admin-notice.html` | `#rail [data-menu=admin]` → 원장 **FIG. 14 사용자·콘텐츠 관리**로 스크롤 |
| A10 | MY (플라이아웃) · 마이 페이지 `mypage.html` | `my` | — | `#rail [data-menu=my]` + `.rail-fly` 플라이아웃 — 항목 동일 |
| A11 | 로그아웃 (`data-action=logout` → `lx_logged_in` 삭제 후 `home.html`) | — | — | `.rail-fly [data-action=logout]` — **동작까지 1:1**(localStorage 삭제 → `../home.html`) |

> 원본 페이지(`dataset.html` 등)는 이 콘티 저장소에 존재하지 않는다. 그래서 링크를 지어내지 않고,
> **같은 데이터를 담고 있는 우리 화면의 자리로 보낸다**(레지스터 전환 또는 원장 스크롤).
> 레일 항목에는 원본 파일명을 `title`로 달아 대응 관계를 남긴다.

## B. 본문 위젯 (`dashboard.html`)

| # | 원본 위젯 | 원본 값·동작 | 우리 구현에서 어디에 있나 |
|---|---|---|---|
| B1 | 페이지 제목 `LX 관리자 대시보드` + 부제 | 정적 | `#mast-l` 마스트헤드 — `LAND-XI` 마크 + `LX 관리자 대시보드` |
| B2 | 기준일 `#dash-now-date` + "기준일 현재" | `new Date()` | `#mast-asof` — 단 **콘티 원칙**상 오늘이 아니라 데이터 기준시점(`results.js` 마지막 분석일) |
| B3 | 공지 스트립: 태그 `공지` · 제목 링크 · 날짜 · `전체 보기 ›` | `SP_NOTICES` 최상단(고정 우선, 날짜 역순) → `notice.html?notice=<id>` | 원장 **FIG. 08 공지** 한 행 (`#ops-notice`) — 제목·날짜·`전체 보기` 동일 |
| B4 | KPI ① 전체 사용자 | `21명` / `정상 19 · 가입 승인 대기 1` → `admin-users.html` | `#ops-kpi .k`(1/5) — 값·부제 원본과 동일 |
| B5 | KPI ② 발행 분석 카드 | `8건` / `공개 7 · 비공개 1` → `ai-card.html` | `#ops-kpi .k`(2/5) |
| B6 | KPI ③ 카드 발행 승인 대기 | `2건` / `검토 필요` → `admin-publish.html?status=대기` | `#ops-kpi .k`(3/5) — 클릭 시 FIG. 13으로 |
| B7 | KPI ④ 가입 승인 대기 | `1건` / `승인 필요` → `admin-users.html` | `#ops-kpi .k`(4/5) |
| B8 | KPI ⑤ 미답변 문의 | `6건` / `전체 12 · 답변 필요` → `admin-inquiry.html` | `#ops-kpi .k`(5/5) |
| B9 | AI 기반 모델(백본) 카드 | `XI-VFM v2.1` · 최종 적용 `2026.03.12` · 연결된 분석 과제 `14개` | 레지스터 01 원장 **FIG. 03 모델 카드** 머리줄 + 원장 **FIG. 09 백본** |
| B10 | 차트 ① AI 개발 프로젝트 현황 + `전체 보기` | ECharts 가로막대 Top5 (GB) → `ai-project.html` | 원장 **FIG. 12** — `db-charts.js` 미니 막대(같은 5개 값) |
| B11 | 차트 ② 사용자 이용 현황 (`최근 7일 방문`) | ECharts 세로막대 7일 | 원장 **FIG. 12** 두 번째 미니 차트 |
| B12 | 차트 ③ 전체 스토리지 사용량 | ECharts 도넛 + 범례 7항목, `44.5 / 184 TB` | 원장 **FIG. 12** 스토리지 막대 + 총계 캡션 |
| B13 | 카드 발행 승인 대기 목록 + `카드 발행 관리` 버튼 | `CARD_APPROVALS` 2건 (카드명 / 요청자 / 요청시각), 행 → `admin-publish.html?open=<id>`, `검토` 버튼, 빈 상태 문구 | 원장 **FIG. 13** `#ops-rows` — 2행, 같은 카드명·요청자·요청시각, 행 클릭 = 지도 핀으로 카메라 이동(원본의 `?open=` 자리) |
| B14 | 사용자·콘텐츠 관리 타일 4 | 사용자 관리 / 공지사항 관리 / 문의 관리 / 자주 묻는 질문 관리 (각 부제 수치 포함) | 원장 **FIG. 14** `#ops-admin` — 4행, 이름·부제 동일 |
| B15 | 푸터 include | 회사 정보 | `#led-foot` 원장 꼬리 |
| B16 | 딥링크 | KPI `?status=대기`, 승인 행 `?open=<id>` | 우리 딥링크는 `?tab=infer|train|results` (레지스터 전환) — **원본에 없는 화면을 만들지 않고, 원본 내용을 나눠 보여 주는 용도** |

## C. 원본에 없어서 만들지 않는 것

- 원본 대시보드에는 **지도가 없다.** 우리 판(V-World 정사영상)은 위젯이 아니라 **바탕**이다 —
  B14까지의 위젯을 지도 위 헤어라인 계기로 조판하기 위한 것이며, 새 기능이 아니다.
- 원본의 "처리 대기 큐"(우리가 7건으로 합쳐 놓았던 것)는 **원본에 없다.**
  원본은 `카드 발행 승인 대기` 2건뿐이다 → FIG. 13을 2행으로 되돌렸고,
  사용자·문의 건수는 원본대로 **KPI 부제**로만 남는다.
- 원본에 없는 `전국 커버리지` 매트릭스는 원본 `ai-project`/`ximap` 로 넘어가는 내용이라
  대시보드에서는 **레지스터 03의 지도 표현**으로만 남기고 별도 위젯을 만들지 않는다.
