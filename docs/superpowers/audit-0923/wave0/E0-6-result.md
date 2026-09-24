# E0-6 결과 — 대시보드: 셸 이관 · 직원 화면 · 링크 전수 · dashboard-128 삭제

## ① 한 줄 결과

대시보드를 공용 셸(`mountShell({active:'dashboard'})`)로 옮기고 **직원 화면**으로 바꿨다. 레일은 `roles.js staff.menus` 7개와 로그아웃이 전부다. 승인 KPI 3 · EVIDENCE-PAIR · 관리 타일 4 · '7일 방문' 탭은 화면에서 내렸다(데이터 배열은 `db-data.js` 에 남겼다). 링크는 모두 실제 목적지로 가고, 판 셀은 `ximap.html?result=<id>` 로 간다. `dashboard-128/` 는 삭제했다. `proto-dashboard.spec.mjs` 37건이 녹색이다. 재작업: 우 패널 안 빈 띠를 콘텐츠로 채웠다(스토리지 = 랭크드 바 · 행 높이 맞춤 · 높은 화면은 두 목록 한 패널 · 행 상한 구간은 용량 비중 띠) · 탭 호버 = 밑줄 스윕 — ⑤ 실측표.

> 보고서 경로: 브리프의 `new_files_allowed` 는 `E0-6-result.md` 이다. 하네스 과제문은 `E0-6-report.md` 라고 적었지만 허용 경로가 아니라서 이 파일 하나로 낸다.
> 스크린샷 경로: 과제문은 `shots/wave0/E0-6/` 이지만 허용 경로가 `shots/w0/E0-6/**` 라서 그쪽에 저장했다.

## ② 완료 기준별 증거

| # | 기준 | 증거 |
|---|---|---|
| 1 | staff 레일 = roles.js 7항목 · 자체 레일/로그아웃/인라인 관문 0 | e2e `직원 레일 = roles.js staff.menus 7 + 로그아웃` — `['대시보드','데이터 관리','프로젝트','분석 서비스','지도 서비스','서비스 지원','MY','로그아웃']` 일치, `publish/produce/admin/ops/usecase` 0, `#rail[data-shell-part]`(셸이 그린 레일 1벌). e2e `자체 레일 · 관문 · 로그아웃 코드 0`: 세 파일 소스에 `rail-top · NAV_FOOT · NAV_MY · removeItem('lx_logged_in') · getItem('lx_logged_in')` 0. 브리프 grep: `grep -n "rail-top\|NAV_FOOT\|removeItem('lx_logged_in')" landxi/proto/dashboard.js landxi/proto/db-data.js` → 출력 없음(종료 코드 1). 로그아웃: e2e `로그아웃 — 셸 로그아웃이 세션 키를 전부 지우고 떠난다` → `lx_logged_in · lx_role · lx_tenant_session` 잔존 0(C-09 · 현재 셸 `signOut`). `dashboard.html:5` `shell-gate.js` 만 남았다. |
| 2 | 제목 '대시보드' · 승인/관리 문구 0 · 데이터 배열 유지 · 빈 띠 ≤ 80 | `<title>대시보드 — Land-XI</title>`(`dashboard.html:3`) · `#page-title` = '대시보드'. e2e `관리 문구 0`: body 텍스트에 `LX 관리자 · 관리자 · 승인 대기 · 가입 대기 · 미답변 · 관리 바로가기 · 카드 발행 관리 · 서비스 관리 · 생산 관리 · 7일 · 방문` 0. `#b-approve #ap-rows #b-admin #ad-rows .tiles #pane-visit` DOM 0. `db-data.js` 에 `KPI`(act 3 포함) · `APPROVALS` · `ADMIN_TILES` · `VISITS` export 그대로. 빈 띠: e2e `한 화면 — 1440×900 · 1280×720 · 1920×1200 · 1920×1017 · 1440×1000 · 1101×640` 이 `#main` 자식 사이 · 마지막 자식↔푸터 · 판/패널 아래를 재서 최댓값 ≤ 80(실측 1440: 18 · 0 · 20 · 0 · 0). 패널 **안**: e2e `paneBands` — 여섯 뷰포트 × 두 탭, 목록 위·아래 ≤ 80 · 행 사이 ≤ 32(실측 ⑤ 표, 최대 68 = 1920×1017 용량 탭). |
| 3 | 링크 전수 제자리 0 · denied 0 | e2e `링크 전수`: 페이지의 `a[href]` 전부(레일 · 마스트 · KPI · 셀 · 패널 · 푸터, 패밀리 제외) — `dashboard.html` 은 레일의 `aria-current="page"` 한 곳뿐 · 직원 금지 화면(`SCREEN_MENU` 중 staff 밖 11개) 0 · 고유 링크마다 200 + 이동 뒤 `denied=`/`login.html` 0. 패밀리 사이트: e2e `Family Site` 3링크 200. 레일 5메뉴 클릭 → 실화면(denied 0). |
| 4 | 셀 클릭 → `ximap.html?result=<id>` | e2e `셀 클릭 → XI맵 ?result=`: 셀 href 에 `cell=`·`mode=res` 0 · `ximap.html?result=` 셀 ≥ 3(남원 `namwon-farmland-2025` · 여수 · 변화지수 `namwon-change-2504-2510`) · 남원 셀 클릭 → XI맵 도착(`?on=namwon-farmland-2025` 로 정규화 · denied 0). 스크린샷 `06-cell-to-ximap.png` = 결과가 체크된 채 열린 XI맵. 학습데이터 모드의 영상 셀 → `dataset.html?tab=archive`, 조사 예정 셀 → `analysis-ai.html?card=<id>`(`dashboard.js` `targetOf`). |
| 5 | 타일 겹침 0 · 1100 H1/KPI 겹침 0 · 390 넘침 0 · MY Esc | 관리 타일 DOM 과 `dashboard.css:328-333` 절대 배치 규칙 삭제(겹침 재현 불가). e2e `반응형` 이 1100 · 1000 에서 `#page-head`/`#page-title` 아래에 `#b-kpi` 가 있음을 `boundingBox` 로 단언하고 가로 넘침 0. e2e `390` → `scrollWidth − clientWidth ≤ 0` · KPI 한 줄에 하나. e2e `MY 플라이아웃` → 포커스로 열림 · Esc 닫힘 · 안에서 Esc → MY 로 복귀. |
| 6 | `dashboard-128/` 삭제 · 참조 0 | 폴더 7파일 삭제(`git status` `D` 7줄) · `curl …/dashboard-128/dashboard.html` → **404**. `grep -rn "dashboard-128" landxi tests docs/superpowers/specs` → **소유 밖 3곳 남음**: ④ 요청 1–3. 내 파일의 참조는 0. |
| 7 | 행선지 표 · 원본 위젯 8종 전부 행 | 아래 §행선지 표. |
| 8 | spec 22 + 추가 녹색 · 스크린샷 | `npx playwright test tests/e2e/proto-dashboard.spec.mjs --reporter=line` → **`37 passed (1.4m)`**(재게이트 2 반영 후 · 재게이트 1 33 · 전 판 27). 원래 22건 중 관리 위젯 전용 5건(`B13` · `B14` · `?status=` · `?open=` · warn 자리)은 직원 화면에서 그 위젯이 없어졌으므로 '없다'를 단언하는 테스트로 바꿨다. 추가: 자체 코드 0 · 로그아웃 키 0 · MY Esc · Family 200 · 관리 문구 0 · 셀 → `?result=` · 링크 전수 · 390 · `?tab=` · 1280×720 한 화면 · (재게이트) 1920×1017 · 1440×1000 · 1101×640 한 화면 · 용량 비중 띠 · 낮은 행 · 탭 호버 · (재게이트 2) 비중 띠 라벨 잘림 0 × 4 뷰포트. unit `dashboard-cells` · `dashboard-geo` 12/12 녹색(`db-cells.js` · `db-geo.js` 는 손대지 않음). |

스크린샷(`shots/w0/E0-6/`): `01-dash-staff-1440.png` · `02-dash-1280.png`(1280×720) · `03-dash-1920.png` · `04-dash-1100.png`(전체 페이지) · `05-dash-390.png`(전체 페이지) · `06-cell-to-ximap.png` · 덧붙여 `06a-cell-hover-1440.png`(콜아웃 — 필지 · 동 병기와 행선지 줄). 새로 만든 모션은 없다(카운트업 · 막대는 기존 것, 지속 900 → 1000ms 로 법전 4단에 맞췄다). 그래서 프레임 스트립은 찍지 않았다.

## 행선지 표 — 원본 대시보드 위젯이 어디로 가나 (C-26 · Q8)

원본 = `landxi7/dashboard.html`, 대조표 `docs/superpowers/proto/2026-08-26-dashboard-parity.md` 의 B1–B16.

| 원본 위젯 | 행선지 | 이 에픽에서 한 일 · 사유 |
|---|---|---|
| B1 제목 `LX 관리자 대시보드` | 대시보드 제목 행(셸) `대시보드` | 관리자는 이 화면에 들어오지 못한다(roles.js admin.menus 에 dashboard 없음). 제목을 화면 주인(직원)에게 맞췄다. |
| B2 기준일 | 셸 마스트 `#mast-asof` = `AS_OF` 2026.06.08 + `시연` | `db-data T1` 과 값이 같다(2026-06-08). 셸 값을 쓴다. |
| B3 공지 스트립 `?notice=8` | 셸 마스트 공지 띠 `notice.html?notice=8`(유지) | `db-data NOTICE` 와 셸 `NOTICE` 는 id 8 · 제목 · 2026-04-15 로 같다. 셸 값을 쓴다. |
| B4 KPI `전체 사용자 21` | **운영 현황(E1-6)** | 사용자 관리 지표이고, 링크 대상 `admin-users.html` 은 직원이 들어갈 수 없다. `KPI[0]` 는 `db-data.js` 에 남겼다. |
| B5 KPI `발행 분석 카드 8` | **대시보드 KPI(유지)** — `시연` 꼬리표 · 링크 → `analysis-ai.html` | 원래 링크 `ai-card.html` 은 publish 권한이 필요하다(직원 금지). 직원이 카드를 보는 곳인 분석 서비스로 보냈다. |
| B6–B8 KPI `카드 발행 승인 대기 · 가입 승인 대기 · 미답변 문의` | **운영 현황(E1-6) 결재 대기 3칸** | 조치 필요 숫자(warn)는 승인권자의 것이다. 직원이 스스로 승인하면 검수가 아니다(roles.js). `KPI` 의 act 3항목은 남겼다. |
| B9 백본 모델 카드 `XI-VFM v2.1` | **대시보드(유지)** | 그대로 둔다(최종 적용 · 연결 과제 14 · 측정 10 · AOI 미지정 4). |
| 판(대한민국 전도 0.25° · 토글 2) | **대시보드(유지)** — 셀 클릭 → `ximap.html?result=` | 셀 좌표(`?cell=`)는 XI맵이 받지 않았다(D-5). 결과 id 로 보낸다. MapLibre interactive 판은 E2-3 에서 한다. |
| B10 운영 지표 탭 `AI 개발 프로젝트 현황(용량 Top5)` | **대시보드 탭(유지)** · 합계 `시연` · 전체 보기 → `ai-project.html` | — |
| B11 운영 지표 탭 `사용자 이용 현황(7일 방문)` | **제거** — 어느 화면에도 세우지 않는다 | **콘티 위반(지어낸 추세)**: 접속 로그가 없다. `DASH.visits` 7값(812…356)은 원본 목업의 손 값이다. 법전 §5 는 'KPI 추세 금지 · 숫자는 데이터 파일에서만'이고, Q8 의 인벤토리 대조에서도 사유를 이렇게 적는다. E2-3 도 세우지 않는다(MASTER-PLAN E2-3). `VISITS` 배열은 기록으로 `db-data.js` 에 남겼다. |
| B12 운영 지표 탭 `전체 스토리지 사용량` | **대시보드 탭(유지)** · `분류 배분 시연` 꼬리표 · 링크 → `dataset.html?tab=archive` | 사용량 44.5 TB 는 측정값이고 분류 배분은 시연이라고 꼬리표로 밝혔다. |
| B13 EVIDENCE-PAIR 카드 발행 승인 대기 2(실크롭) | **운영 현황(E1-6) 카드 발행 승인 칸** | `APPROVALS[i].crop` 실크롭 2 · `?status=대기` 딥링크를 그쪽에서 세운다. `DASH.queue` 와 `APPROVALS` 는 남겼다. 대시보드의 `?status=` · `?open=` 수신은 지웠다(저장소 안에 이 딥링크를 거는 곳 0 — `grep "dashboard.html?"` 0). |
| B14 관리 바로가기 타일 4(사용자 · 공지 · 문의 · FAQ) | **운영 현황(E1-6) 관리 네 축** | 네 목적지(`admin-*`)가 모두 직원 금지 화면이다(D-3 · 타일 → denied). `ADMIN_TILES` 는 남겼다. 절대 배치로 글자가 겹치던 규칙(D-4)도 같이 없어졌다. |
| B15 푸터 · Family Site · 고객센터 | 셸 푸터(유지) | 셸 한 벌로 통일했다. 전화번호 불일치(자체 `063-713-1213` 과 셸 `063-713-1213, 1216`)와 죽은 `Family Site ▾` 칩(D-11)이 해소됐다. |
| B16 딥링크 `?tab=` · `?status=` · `?open=` | `?tab=proj\|store` 는 유지. `?status=` · `?open=` 은 운영 현황(E1-6)으로 | — |

**빈자리 채움**: 원본 KPI 5 가운데 직원 몫은 `발행 분석 카드` 하나다. 밴드가 숫자 하나로 비지 않게 **데이터 파일에서 센 값** 둘을 더했다. `AI 분석 결과 4건 · 남원 2 · 여수 2`(`results.js`) → `ximap.html`, `학습데이터 영상 11종 · 정사영상 10 · 피복 1`(`imagery.js`) → `dataset.html?tab=archive`. 둘 다 `db-data.js KPI_STAFF` 에서 계산하고, 지어낸 값은 없다.

## ③ git diff --stat (소유 파일만 · `git status` 로 확인)

```
 landxi/proto/dashboard-128/dashboard.css           | 235 ----------
 landxi/proto/dashboard-128/dashboard.html          | 118 -----
 landxi/proto/dashboard-128/dashboard.js            | 279 ------------
 landxi/proto/dashboard-128/db-charts.js            |  76 ----
 landxi/proto/dashboard-128/db-data.js              | 483 ---------------------
 landxi/proto/dashboard-128/db-plate.js             | 223 ----------
 .../dashboard-128/proto-dashboard-128.spec.mjs.txt | 469 --------------------
 landxi/proto/dashboard.css                         | 466 +++++++-------------
 landxi/proto/dashboard.html                        | 106 +----
 landxi/proto/dashboard.js                          | 296 ++++++------
 landxi/proto/db-data.js                            |  44 +-
 tests/e2e/proto-dashboard.spec.mjs                 | 496 +++++++++++---------
```
재게이트 반영분(위 누적에 더해): `dashboard.js` +22/−6 · `dashboard.css` +18/−2 · spec +59/−2 · 이 문서. 스크린샷 `10`–`18` 9장 추가.
새 파일은 `shots/w0/E0-6/*.png` 10장(재작업으로 `07`–`09` 스토리지 3장 추가)과 이 문서뿐이다. `db-cells.js` · `db-geo.js` 는 바꾸지 않았다. `git status` 의 다른 `M` 줄(shell.js · map*.js · dataset* 등)은 병렬 에픽이 바꾼 것이고, 이 에픽은 건드리지 않았다.

## ④ 소유 밖 요청

1. **`tests/unit/cells.test.mjs:8`** — 삭제한 `landxi/proto/dashboard-128/db-data.js` 를 import 한다. 지금 이 unit 은 모듈을 찾지 못해 **실패한다**. 값: 파일 삭제. 이유: 고아 12.8 초안(`cellsFor · baseFootprints · jejuFootprint`)의 테스트이고, 현행 판 집계는 `tests/unit/dashboard-cells.test.mjs` 가 본다. 받는 에픽: **E0-3**(unit 소유).
2. **`landxi/proto/spikes/dash3d/index.html:42`** — `../../dashboard-128/db-data.js` 를 import 한다. 지금 이 스파이크는 깨진다. 값: 스파이크 폴더 삭제, 또는 `../../db-cells.js`(`buildCells` 등)로 다시 연결. 이유: 12.8 초안 위의 실험이다. 받는 곳: 통합 단계 / E0-3.
3. **`landxi/proto/review/masters.html:6`** — 카드 설명에 '구현 사본 landxi/proto/dashboard-128/' 라는 글이 있다(링크는 아님). 값: 그 구절 삭제. 이유: 완료 기준 6 의 grep 을 0 으로 만들기 위해서다. 받는 곳: 통합 단계.
4. **`landxi/proto/shell.css` `#foot`** — `white-space:nowrap` 한 줄이라 390 에서 푸터가 527px 로 넘친다. 지금은 `dashboard.css` 의 `@media (max-width:720px)` 안에서 이 페이지만 줄바꿈으로 막았다. 값: 셸 쪽에 `@media (max-width:720px){ #foot{flex-wrap:wrap;height:auto;white-space:normal} }`. 390 마스트에서 공지 띠와 기준일이 겹치는 것도 셸 몫이다. 받는 에픽: **E3-2**(모바일) / E0-1.
5. **`design/system.md` §6 대시보드 줄** — 지금은 '승인 대기 EVIDENCE-PAIR + 관리 타일 4(큰 수)' · '판 254→420' 으로 적혀 있다. 값: '큰 숫자 밴드(정보) + 판/탭 패널(뷰포트를 따라 254 이상으로 자라 빈 띠 ≤80) — 승인 · 관리 위젯은 운영 현황' 으로. 이유: Q3 · D-2 로 대시보드는 직원 화면이 됐고, 아래 두 구역을 뺀 자리를 판이 받는다. 420 에서 멈추면 1920×1200 에서 약 380px 의 빈 띠가 생긴다. 받는 곳: 법전 소유자.
6. **E1-6** — `db-data.js` 의 `APPROVALS`(EVIDENCE-PAIR 실크롭 2) · `ADMIN_TILES` · `KPI` act 3 을 운영 현황에 세울 때 여기서 import 하면 된다. 구 렌더 코드는 git 이력(`dashboard.js` B13 · B14 블록)에 있다.

## ⑤ 남은 것 · 알려진 결손

- **법전과 다르게 한 곳**: 판 · 패널 높이 상한 420 을 풀었다(1101px 이상 · 640px 이상 높이에서 뷰포트를 채운다). 하한 254 는 지킨다(800px 이하 높이에서는 180). 사유와 법전 갱신 요청은 ④-5 에 적었다.
- **재작업(불합격 판정 반영) — 우 패널 안 빈 띠**: 전 판은 `#main` 자식 사이만 재서 패널 **안**의 공기를 놓쳤다(1440 store 105/105 · 1920 proj 80/80 + 행 간격 62×5 · 1920 store 275/275). 고친 것:
  1. 스토리지 탭을 **쌓은 막대 + 6분류 랭크드 바 + 잔여 행**으로 바꿨다(프로젝트 탭과 같은 `.rk` 행 조판 · 행 견본 = 막대의 같은 칸 색). 값은 `db-data.js STORAGE` 그대로.
  2. `dashboard.js fitPanel()` — 패널 안쪽 높이를 행 수로 나눠 행 높이 `--rh`(24–58px)를 준다. `space-evenly` 로 행 사이에 공기를 뿌리던 것을 없앴다(행 사이 0).
  3. 두 목록(6 + 7행)이 행 ≥ 26px 로 다 들어가면(1101px 이상 폭) **탭을 내리고 프로젝트 랭크 아래에 스토리지를 같은 패널로 상시 노출**한다(`#panel[data-lay=both]` · 목록 머리 `.ph` 에 각자의 '전체 보기 › / 데이터 관리 ›'). 1920×1200 이 이 조판이다. 그보다 낮으면 탭 2개.
  4. e2e `한 화면`(이제 6건)에 `paneBands()` — 보이는 tabpanel 마다 첫 자식 위 · 마지막 자식 아래 · 자식 사이(`#s-lg` 행을 펼쳐서)를 재 ≤ 80 · 행 사이 ≤ 32 단언, **두 탭 모두**(탭 조판이면 탭을 눌러서) · 두 목록 조판이면 패널 위 · 목록 사이 · 패널 아래도. 1920×1200 은 두 목록 조판임을 단언. 두 목록 잘림 0.

  5. **재게이트(regate:E0-6) 반영** — 행이 상한 58px 에 닿는 구간(1920×1017 = 1920×1080 모니터의 Chrome 창 · 1440×1000 · 1600×1000 · 1512×982 · 1440×980)에서 용량 탭 위아래가 82–100 이었다.
     - 행을 늘리지 않고 **실값으로 채운다**: 탭 조판에서 행이 상한을 넘을 자리만 `fitPanel()` 이 용량 목록 위에 **용량 비중 띠**(`.p-share` — 5건의 몫을 쌓은 막대 + `01 31% · 02 24% · 03 19% · 04 15% · 05 11%`)를 세운다. 값 = `db-data.js PROJECTS` 의 `gb ÷ 합계 1,326`, 지어낸 숫자 0(e2e 가 같은 파일에서 기대값을 계산해 대조). 두 목록 조판·낮은 화면에서는 내린다.
     - 낮은 행: `--rh < 34` 면 `.dense` → 1위 값 26 → 20px(1680×1050 에서 '412 GB'·'318 GB' 맞닿음 해소), `--rh < 26` 면 `.tight` → 값 17px. 값 글자 `line-height:1` 로 두 목록 조판의 목록 잘림(clip 3–7px)도 0–1 로.
     - 1101×640(한 화면 하한)에서 스토리지 탭이 행 하한 24 로도 19px 넘치던 것(위아래 −9) → 행이 하한 밑이면 스토리지 쌓은 막대를 내리고(분류 값은 행 막대가 그대로 말한다) 행 바닥 21px.
     - 탭 호버(법전 §4): `#tabs [role=tab]` · `#seg [role=tab]` 에 `::after` 2px 밑줄이 `scaleX 0→1 · 180ms(--hov)` 로 쓸려 선다. 선택 상태 색 규칙은 그대로.
     - e2e: `한 화면` 매트릭스에 **1920×1017 · 1440×1000 · 1101×640** 추가 · `용량 비중 띠` · `낮은 행` · `탭 호버 = 물리 반응` 3건 추가 — 33 passed.

  6. **재게이트 2 — 비중 띠 라벨 잘림(1101–1300 폭) 해소.** 칸이 `flex:none; width:<몫>%; overflow:hidden` 이라 패널이 약 700px 아래면 마지막 칸 '05 11%'(글자 57px)가 폭 42–53px 에 들어가 '05 11' 로 잘렸다. → `.p-pct span{ flex:0 1 auto; min-width:max-content }`(`overflow:hidden` 삭제): 칸 폭은 여전히 몫(`width:%` = flex-basis)이되 라벨보다 좁아지지 않고, 모자란 만큼은 넓은 앞 칸이 몫에 비례해 양보한다. 줄임표 0. e2e `용량 비중 띠 라벨 — 1920×1017 · 1440×900 · 1280×800 · 1101×1000` 4건: 칸마다 `scrollWidth ≤ ceil(clientWidth)+1` · 텍스트 `/^\d\d \d+%$/` · 마지막 칸이 띠 안 — 37 passed.
     - 실측(칸 폭/글자 폭, px): 1280×800 `01 31% 148/148 · 02 24% 113/113 · 03 19% 91/91 · 04 15% 70/70 · 05 11% 57/57` · 1101×1000 `116/116 · 89/89 · 71/71 · 57/57 · 57/57` · 1440×900 `175 · 134 · 108 · 83 · 59`(전부 폭 = 글자 폭 이상, 잘림 0).

  '탭 + 비중 띠' 조건(`dashboard.js fitPanel`): 탭 조판에서 **띠 없이 행이 상한 58 을 넘으면 띠를 세우고, 띠를 세워도 행이 `ROW_MIN+10`(34) 이상이면 그대로 둔다**(아니면 다시 내린다). 그래서 행이 58 에 닿는 구간만이 아니라 1440×900(띠 선 뒤 행 55) · 1280×800(47) · 1101×1000(58) 에서도 띠가 선다.

  실측(스태프 세션 · 로드 후 1.2s · 탭 조판이면 탭을 눌러 0.3s · 값 = 목록 위 / 아래 / 최대 자식 간격, px. 위·아래에는 패널 안쪽 여백 12–18 이 포함된다. 스크립트 = scratchpad `e06/measure.mjs`):

  | 뷰포트 | 패널 높이 | 조판 | 행 `--rh`(용량 · 스토리지) | 용량(pane-proj) | 스토리지(pane-store) | 패널 가장자리(위/목록 사이/아래) |
  |---|---|---|---|---|---|---|
  | 1920×1017 | 548 | 탭 + 비중 띠 | 58 · 58 | 68 / 68 / 14 | 24 / 24 / 10 | — |
  | 1440×1000 | 531 | 탭 + 비중 띠 | 58 · 57 | 60 / 60 / 14 | 19 / 19 / 10 | — |
  | 1600×1000 | 531 | 탭 + 비중 띠 | 58 · 57 | 60 / 60 / 14 | 19 / 19 / 10 | — |
  | 1512×982 | 513 | 탭 + 비중 띠 | 58 · 54 | 51 / 51 / 14 | 20 / 20 / 10 | — |
  | 1440×980 | 511 | 탭 + 비중 띠 | 58 · 54 | 50 / 50 / 14 | 19 / 19 / 10 | — |
  | 1920×940 | 471 | 탭 + 비중 띠 | 58 · 48 | 30 / 30 / 14 | 20 / 20 / 10 | — |
  | 1440×900 | 431 | 탭 + 비중 띠 | 55 · 42 | 19 / 19 / 14 | 21 / 21 / 10 | — |
  | 1536×864 | 395 | 탭 + 비중 띠 | 49 · 37 | 19 / 19 / 14 | 21 / 21 / 10 | — |
  | 1280×800 | 373 | 탭 + 비중 띠 | 47 · 40 | 14 / 14 / 14 | 15 / 15 / 6 | — |
  | 1366×768 | 341 | 탭 | 52 · 36 | 15 / 15 / 0 | 13 / 13 / 6 | — |
  | 1280×720 | 293 | 탭 | 44 · 29 | 15 / 15 / 0 | 13 / 13 / 6 | — |
  | 1101×640 | 213 | 탭(스토리지 막대 내림) | 31 · 21 | 14 / 14 / 0 | 13 / 13 / 6 | — |
  | 1920×1040 | 571 | 두 목록 | 27 | 0 / 0 / 6 | 15 / 0 / 10 | 13 / 22 / 13 |
  | 1920×1080 | 611 | 두 목록 | 30 | 0 / 0 / 6 | 15 / 0 / 10 | 14 / 22 / 14 |
  | 1680×1050 | 581 | 두 목록 | 28 | 0 / 0 / 6 | 15 / 0 / 10 | 12 / 22 / 12 |
  | 1280×1024 | 555 | 두 목록 | 26 | 0 / 0 / 6 | 15 / 0 / 10 | 12 / 22 / 12 |
  | 1920×1200 | 731 | 두 목록 | 39 | 0 / 0 / 6 | 15 / 0 / 10 | 15 / 22 / 15 |
  | 2560×1300 | 831 | 두 목록 | 47 | 0 / 0 / 6 | 15 / 0 / 10 | 13 / 22 / 13 |

  탭 조판의 최대 높이(두 목록으로 넘어가기 직전, 패널 ≈ 554)에서도 용량 탭 위아래 ≈ 71 — 폭 ≥ 1101 · 높이 ≥ 640 의 모든 뷰포트에서 ≤ 80. 가로 넘침 0(모든 행 `over 0`).

  스크린샷: `10-dash-1920x1017-proj.png` · `11-dash-1920x1017-store.png` · `12-dash-1440x1000-proj.png` · `13-dash-1680x1050-both.png` · `14-dash-1101x640-store.png` · `15-dash-1440x900-proj.png` · `16/17-tab-hover-*.png` · `18-seg-hover-done.png`. 전 판 01–09 는 그대로.
- KPI 가 브리프가 예상한 2개가 아니라 3개다. `전체 사용자` 를 행선지 표대로 운영 현황에 보냈고, 빈자리를 데이터에서 센 값 2개로 채웠다.
- 셀은 이제 `<a>` 링크다(전에는 button + JS 이동). Tab 으로 셀 사이를 오가고 Enter 로 연다. `role=listitem` 을 걷어 링크 뜻이 살아 있다.
- `dashboard.js` 가 `map-data.js` 의 `ALL_LAYERS` 를 import 한다(변화지수 레이어 id `namwon-change-2504-2510` 을 XI맵과 같은 표에서 얻으려고). E0-5 가 이 export 이름을 바꾸면 셀 링크가 깨진다. 현재 녹색이다.
- `db-data.js NOTICE · T1` export 는 화면이 더 부르지 않는다. 기록으로 남겼다.
- `?status=` · `?open=` 옛 딥링크는 이제 조용히 무시된다(기본 탭으로 연다). 저장소 안에서 이 딥링크를 거는 곳은 0이다.
