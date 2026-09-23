# 실측 감사 — 공용 셸 · 대시보드 · 마이페이지 (영역키 `shell-dash`)

- 감사일: 2026-09-23 · 읽기 전용(소스 수정 0)
- 방법: Playwright(Chrome) 1440×900 기본, 1280×800 · 1920×1080 · 1440×745 · 390×844 추가. 3계정(LX 관리자 · LX 직원 · 영업용)을 **로그인 폼의 역할 고르개로 실제 로그인**해 레일 전 메뉴를 눌러 이동을 확인하고, 권한 밖 화면 12곳을 주소로 직접 열었다. 계산 스타일로 14px 미만 글자 · 그림자 · 라운드 · 그라디언트 · 유리 · 가로 넘침 · `#CCCCCC` 글자를 셌다.
- 스크립트: `shots/audit-0923/shell-dash/audit.mjs`, `tile.mjs` · 원자료: `shots/audit-0923/shell-dash/result.json` · 스크린샷 80장: 같은 폴더
- 기준: `design/system.md`, 9/20 스펙 4종(two-tier · platform-roles · card-architecture · production), 인벤토리 §1 · §2 · §10, 지난 감사 `review/2026-09-20-auto-audit.md` §1.3 · C1–C9

---

## 0. 한 줄 판정

**공용 셸은 제대로 섰다. 대시보드는 셸 밖에 남았고 역할도 잘못 맞춰져 있다.** `shell.js` 로 옮긴 화면들은 레일·마스트헤드·푸터·MY 플라이아웃·관문이 한 벌로 돌고, 법전 위반도 0이다. 그런데 `dashboard.html` 은 여전히 **자기 레일을 따로 그리는 옛 복제본**이다. 게다가 들어갈 수 있는 계정은 **LX 직원뿐**인데 제목은 "LX 관리자 대시보드"이고, 직원이 쓸 수 없는 승인·관리 기능으로 채워져 있다. 누르면 대부분 **말없이 프로젝트 화면으로 돌려보내진다.** 마이페이지는 원본 기능을 1:1로 다 갖췄고 모든 흐름이 동작한다. 다만 세 계정 모두 같은 "관리자 · admin@namwon.go.kr" 프로필이 나온다.

| 화면 | 판정 | 근거 |
|---|---|---|
| 공용 셸 (`shell.js` · `shell.css` · `parts.css`) | **complete** | 3계정 레일 전 메뉴 17건 모두 실제 화면으로 이동. 콘솔 오류·실패 요청 0, 셸 부위 법전 위반 0 (`role-*-nav-*.png`) |
| `dashboard.html` (직원 전용) | **partial / 일부 broken** | 셸 미적용, 역할 불일치, 관리 타일 글자 겹침, 390에서 441px 넘침 |
| `dashboard-128/` (구 시안) | **stub(잔존 시안)** | 로그인만 하면 어느 계정이든 열림, 14px 미만 글자 80곳 이상 (`dash128-1440.png`) |
| `mypage.html` | **complete(기능) / partial(역할)** | 모달 4 + 탈퇴 + 수정 뷰 + 빈 상태 + 딥링크 전부 동작. 프로필이 역할을 모름, 브랜드 심볼이 다른 화면 레일에 안 나옴 |
| 관리자 홈 `admin-home.html` | **partial** | 동작함. 레일 활성 표시가 `서비스 관리`에 잘못 걸림 |
| 영업용 계정 홈 | **complete(구조) / missing(전용 홈)** | 전용 홈 화면이 없고 `ximap.html` 이 곧 홈이다. `account-*` 파일은 마이페이지 부품이지 영업 홈이 아니다 |

---

## 1. 3계정 레일 — 실측 (`result.json roles.*`)

| 계정 | 로그인 후 첫 화면 | 레일(위→아래) | 이동 결과 |
|---|---|---|---|
| LX 관리자 | `admin-home.html` (`role-admin-home.png`) | 운영 현황 · 데이터 관리 · 카드 발행 관리 · 생산 관리 · 서비스 관리 · MY · 로그아웃 | 6/6 이동. 단 운영 현황 화면에서 **활성 표시가 `서비스 관리`에 걸린다** (`admin-home.js:33-34` `active: 'admin'`) |
| LX 직원 | `ai-project.html` (`role-staff-home.png`) | 대시보드 · 데이터 관리 · 프로젝트 · 분석 서비스 · 지도 서비스 · 서비스 지원 · MY · 로그아웃 | 7/7 이동. 대시보드로 가면 **레일이 셸 레일에서 대시보드 자체 레일로 바뀐다**(아래 D-1) |
| 영업용 | `ximap.html` (`role-sales-home.png`) | 분석 서비스 · 지도 서비스 · 활용 사례 · MY · 로그아웃 | 4/4 이동. `활용 사례` 화면에서는 **레일 활성 표시가 없다**. 화면 제목은 `서비스 지원`이고 탭 5개(공지·FAQ·문의·활용사례·매뉴얼)가 열린다 (`role-sales-nav-usecase.png`, `support.js:22-23` `active:'support'`) |

권한 밖 화면을 주소로 직접 열었을 때 (`result.json roles.*.deny`):
- 관문은 제대로 막는다. 직원이 `admin-publish · admin-users · produce · admin-home` 을 열면 `ai-project.html?denied=…`, 영업이 `dashboard · dataset · ai-project` 를 열면 `ximap.html?denied=…` 로 간다.
- 그런데 **`?denied=` 를 읽는 코드가 저장소에 하나도 없다.** 사용자는 "권한이 없다"는 말 없이 다른 화면에 떨어진다 (`shell-gate.js:30`, `shell.js:133`, 전체 검색 결과 0건).
- 막히지 않는 곳: `dashboard-128/dashboard.html` 은 모든 계정에 열린다. `shell-gate.js` 를 싣지 않았고, 인라인 스크립트가 로그인 여부만 본다. 영업용 계정도 내부 운영 KPI를 본다. `shell-demo.html`(개발용 부품 견본)도 모든 계정에 열린다.

로그인 화면의 역할 고르개(`login-*-roles.png`): 3종 라디오와 한 줄 설명이 있고, 이미 로그인한 상태면 "지금 ○○로 들어와 있습니다"가 뜬다. 계정 전환 동선은 동작한다(`login.js:170-183`). 지난 감사 D12 "역할 전환 UI 없음"은 **해결**.

---

## 2. 대시보드 — 발견 사항

증거: `dash-1440-full.png` · `dash-1440-vp.png` · `dash-tab-{proj,visit,store}.png` · `dash-seg-train.png` · `dash-cell-hover.png` · `dash-my-flyout.png` · `dash-footer.png` · `dash-follow-*.png`(19장) · `dash-{1280x800,1920x1080,1440x745,390x844}.png` · `dash-admin-tiles-overlap.png`

| ID | 등급 | 내용 | 증거 |
|---|---|---|---|
| D-1 | **P0** | **셸 밖에 남은 유일한 핵심 화면.** `dashboard.html` 은 `mountShell` 을 부르지 않고 `db-data.js` 의 자체 `NAV` · `NAV_FOOT` 로 레일을 그린다. 이 레일은 역할을 모르기 때문에 **직원에게도 `카드 발행 관리 · 생산 관리 · 서비스 관리` 가 보이고**, 누르면 `ai-project.html?denied=…` 로 튕긴다. 셸 레일(7항목)과 대시보드 레일(10항목)이 한 계정 안에서 번갈아 나타난다. 지난 감사 C1 "공용 셸 없음"은 **대시보드에 한해 미해결**이다. | `dashboard.js:50-53` · `db-data.js:91-106` · `dash-follow-rail-publish-admin.png` · `dash-follow-rail-produce.png` · `dash-follow-rail-admin.png` |
| D-2 | **P0** | **역할과 내용이 어긋난다.** 대시보드에 들어갈 수 있는 계정은 직원뿐이다(`roles.js:66,75`). 그런데 제목은 `LX 관리자 대시보드`(`dashboard.html:3,45`)이고, 화면 절반이 직원이 할 수 없는 일이다: KPI `가입 승인 대기 · 미답변 문의`, `카드 발행 승인 대기` EVIDENCE-PAIR, `관리 바로가기` 4타일. roles.js 는 "만든 사람이 스스로 승인하면 검수가 아니다"(`roles.js:73-74`)라며 직원의 승인 권한을 뺐는데, 대시보드는 승인 업무를 직원에게 보여 준다. | `dash-1440-vp.png` · `roles.js:73-77` |
| D-3 | **P1** | **링크 11개 중 8개가 제자리로 돌거나 말없이 튕긴다.** KPI `카드 발행 승인 대기` → `dashboard.html?status=대기`(자기 자신). 승인 카드 `검토 ›` ×2 → `dashboard.html?open=pa-1`(자기 자신). `카드 발행 관리 ›` · 관리 타일 4 → `ai-project.html?denied=…`(설명 없음). 제대로 가는 것은 공지 · `전체 보기 ›`(프로젝트) · 셀 클릭 3개뿐이다. | `dashboard.js:90,274` · `result.json dash.follow` · `dash-follow-approve-more.png` · `dash-follow-tile0..3.png` |
| D-4 | **P1** | **관리 바로가기 타일 글자 겹침(깨짐).** 짧은 화면용 규칙이 큰 숫자를 `position:absolute; right:12px; top:0` 으로 머리띠 위에 올려, 타일 이름(`사용자 관리` · `공지사항 관리` · `문의 관리` · `자주 묻는 질문 관리`)과 숫자·단위가 겹친다. 1280 · 1440 · 1920 모두 재현된다. `.th` 와 `.tb` 의 top 이 같다(708.39px). | `dashboard.css:328-333` · `dash-admin-tiles-overlap.png` · `dash-1920x1080.png` |
| D-5 | P1 | **셀 클릭 → XI맵이 셀을 받지 않는다.** `ximap.html?cell=127.25,35.25&mode=res` 로 이동하지만 `cell` 파라미터를 읽는 코드가 없어 기본 남원 화면이 뜬다. "판에서 누른 자리로 간다"는 약속이 끊겨 있다. | `dashboard.js:182` · 전체 검색 `get('cell')` 0건 · `dash-follow-cell.png` |
| D-6 | P1 | **390px 에서 깨진다.** 가로 넘침 441px, 마스트헤드의 기준일 글자가 한 글자씩 세로로 쪼개지고, H1이 KPI와 겹친다. 반응형은 1100px 아래 한 단계뿐이다. | `dash-390x844.png` · `dashboard.css:279-286` |
| D-7 | P2 | 글자 바닥 14px 위반 12곳(지난 감사 D5 **미해결**): 레일 라벨 12.5px ×11, 마크 `LAND` 13px. 셸 레일은 14px 로 맞췄는데 대시보드만 옛 값이다. | `dashboard.css:53,60` · `result.json dash.audit.small` |
| D-8 | P2 | `Paperlogy 400` 렌더 1곳(D6 **미해결**) · `#CCCCCC` 글자 `(측정 10 · AOI 미지정 4)`(D8 일부 미해결). | `result.json dash.audit.fonts/ccc` · `dashboard.js:96` |
| D-9 | P2 | KPI 5개 중 4개가 여전히 `<div>` 이고, 출처는 `title="원본 admin-users.html"` 에만 있다(D2 · C5 **미해결**). `title` 에 파일명 12곳(`원본 로그아웃`, `원본 mypage.html`, `원본 admin-publish.html?open=pa-1` …). 방문 차트·프로젝트 용량이 `시연`이라는 사실도 `title` 에만 있어 키보드·터치로는 볼 수 없다(D7 **미해결**). | `dashboard.js:49,56,91,212-216,276,288` · `result.json dash.titleAttrs` |
| D-10 | P2 | 대시보드 MY 플라이아웃: `role` 없음, **Esc 로 닫히지 않음**(D9 대시보드 쪽 **미해결**. 셸 쪽은 해결됨: `role="group"`, 방향키, Esc). | `dashboard.js:69` · `result.json dash.myEscCloses=false` |
| D-11 | P2 | 푸터 `Family Site ▾` 는 `<span class="chip">`, 눌러도 아무 일 없음(D11 대시보드 쪽 **미해결**). 전화번호 `063-713-1213` 이 셸 푸터 `1213, 1216` + 주소와 다르다(C3 대시보드 쪽 미해결). | `dashboard.html:128` · `dashboard.js:292` · `dash-footer.png` |
| D-12 | P2 | **9/20 스펙 미반영.** card-architecture §3 "대시보드 = 분기별 카드 집계 + 남원 연도별 배포 현황", platform-roles §5-4 "발행 카드 집계를 분기별로", two-tier §6 "지금 몇 개를 만들고 있나 · 발행 대기 · 어디에 깔렸나 · 다음 무엇" — `dashboard.js` · `db-data.js` 에 `scope` · `DEPLOYS` · 지자체/글로벌 구분이 한 줄도 없다. 원본 인벤토리 §2 위젯(공지 · KPI 5 · 백본 · 3탭 · 승인 목록 · 관리 타일 4 · 기준일)은 있다. | 전체 검색 `scope|DEPLOYS|global` 0건 |
| D-13 | P3 | 대시보드 머리의 인라인 로그인 관문과 `shell-gate.js` 가 이중으로 돈다. 동작은 문제없지만 규칙이 두 곳에 있다. | `dashboard.html:5-12` |

지난 감사 대비 **해결된 것**: D3(레일이 제자리 스크롤 → 이제 실제 이동), D4(화면 글자 `?status=`/`?open=` 노출 → 0건), D10(탭별 `전체 보기` → 프로젝트 탭에서만), D1 일부(공지·마이페이지가 `landxi/*.html` 리다이렉트로 실제 화면 도착), C2(레일 막다른 길 → 0), C9(CDN → `vendor/` 로컬, 실패 요청 0).

## 3. 공용 셸

증거: `role-*-home.png` · `role-*-nav-*.png` · `shell-family-open.png` · `my-rail-flyout.png` · `admin-home-390.png`

- 치수: 레일 72px · 마스트헤드 64px · 푸터 36px · 레일 라벨 14px. 법전 §3과 맞다(`result.json pages.shellMetrics`).
- 법전: 셸을 쓰는 표본 화면(운영 현황 · 프로젝트 · XI맵 · 마이페이지)에서 그림자 0, 라운드 0, 그라디언트 0, 유리 0, 14px 미만 0.
- MY 플라이아웃: `role="group"`, 호버·포커스로 열리고 ↓→ 방향키로 들어가 Esc로 닫힌다(`shell.js:243-267`). 로그아웃하면 `scrub/index.html` 로 간다(`result.json my.staff.afterLogout`).
- Family Site: `<details>` 에 실제 링크 3개(Land-XI 소개 · 남원시 · 광주전남)가 있다(`shell-family-open.png`). 원본 7링크 가운데 외부 4개가 빠졌지만 스펙("실제로 갈 수 있는 곳만", `shell.js:66-74`)과는 맞다.

| ID | 등급 | 내용 | 증거 |
|---|---|---|---|
| S-1 | P1 | `?denied=` 에 대한 안내가 없다(§1). 권한 밖 링크를 누르면 조용히 다른 화면에 떨어진다. 대시보드(D-3)와 결합하면 고장처럼 보인다. | `shell.js:133` · `shell-gate.js:30` |
| S-2 | P2 | 활성 표시 오류 2건: 운영 현황 화면에서 `서비스 관리`가 켜진다(`admin-home.js:34`). 영업 `활용 사례`에서는 아무것도 안 켜진다(`support.js:23`). | `role-admin-home.png` · `role-sales-nav-usecase.png` |
| S-3 | P2 | 모바일 390px: 셸을 쓰는 화면도 가로로 137px 넘친다(운영 현황 · 마이페이지). 마스트헤드의 공지와 기준일이 겹친다. 레일 72px 이 계속 남고 드로어 전환이 없다. | `admin-home-390.png` · `my-390x844.png` · `shell.css:176` |
| S-4 | P2 | 브랜드 심볼(마이페이지에서 올린 것)이 **마이페이지 레일에만** 붙는다. `applyCustomSymbol()` 을 부르는 곳이 `mypage.js` 하나뿐이라 데이터 관리 · 대시보드 레일에는 안 나온다. 원본은 계정 전체 레일에 적용된다(인벤토리 §10). | `result.json my.staff.symOnDatasetRail=false, symOnDashRail=false` · `account-brand.js:1-4` 주석 · `my-symbol-not-on-dashboard.png` |
| S-5 | P2 | 기준일이 화면마다 다르다: 셸 기본값 `2026.06.08` / 서비스 지원 `2026.04.22`(C7 **미해결**). | `role-sales-nav-usecase.png` · `shell.js:77` |
| S-6 | P3 | 직원 홈(프로젝트)의 마스트헤드가 비어 있다(`notice:false`, 기준일 없음). 64px 흰 띠만 남는다. | `role-staff-home.png` · `project.js:76` |
| S-7 | P3 | `shell-demo.html`(개발용 부품 견본)이 모든 계정에 열린다. | `result.json roles.sales.deny` |

## 4. 마이페이지

증거: `my-{admin,staff,sales}-1440.png` · `my-modal-{pwdconfirm,password,storage,brand,withdraw}.png` · `my-edit-view.png` · `my-after-{save,storage,brand}.png` · `my-history-empty.png` · `my-{1280x800,1920x1080,1440x745,390x844}.png` · `my-rail-flyout.png`

동작 확인(모두 통과): 회원정보 수정 → 본인 확인 모달(빈 값이면 `비밀번호를 입력해 주세요.`) → 수정 뷰 → 전화번호 빈 값 오류 → 저장하면 원장 갱신(`010-1234-5678 · 대리`). 비밀번호 약하면 원본 문구로 오류가 나고, Esc 로 닫힌다. 증량 신청: 프리셋 256 → 사유 빈 값 오류 → 저장하면 이력 맨 위에 `+256` 이 붙고 칸 판에 점선 고스트 19칸이 생긴다. 브랜드 심볼: PNG 올리기 → 저장 → `localStorage` 에 기록되고 레일에 반영. 탈퇴 모달(`추정` 꼬리표). `?history=empty` 빈 상태. 1280 · 1440×745 · 1920 한 화면, 법전 위반 0, 콘솔 오류 0. 인벤토리 §10의 5기능이 모두 있다.

| ID | 등급 | 내용 | 증거 |
|---|---|---|---|
| M-1 | P1 | **계정을 모른다.** 관리자 · 직원 · 영업 세 계정 모두 `관리자 · admin@namwon.go.kr · 공간정보사업처 주무관` 이 나온다. LX 계정인데 남원시 도메인이고, 영업용 계정에도 "내 디스크 2,048GB · 증량 신청"이 있다. 영업용은 roles.js 상 `export` 권한뿐이다. 마이페이지에는 지금 계정 종류가 표시되지 않고, 계정 전환 입구도 없다. | `account-data.js:49-51` · `my-admin-1440.png` · `my-sales-1440.png` · `roles.js:94-95` |
| M-2 | P2 | 390px: 가로 넘침 137px, 마스트헤드 공지와 기준일 겹침. | `my-390x844.png` |
| M-3 | P3 | 브랜드 심볼이 계정 전체에 적용되지 않는다(S-4와 같은 원인). | S-4 |

## 5. 사용자 품질 기준 대비 — 인터랙티브 · 몰입감 **3 / 10**

- 가장 나은 장면은 대시보드의 위성 전도 판이다. EOX Sentinel-2 위에 0.25° 그리드가 깔리고, 실제 좌표 셀에 호버하면 콜아웃(`농지이용 2,098필지 · 비닐하우스 9,664동`)이 뜨고, 모드 토글과 카운트업이 있다. 그러나 판이 `interactive:false` 라 줌·팬이 없고(`dashboard.js:196`), 셀 클릭은 XI맵에서 끊기며(D-5), 한 판에 셀이 9개뿐이라 "전국 Geo-AI"의 무게가 실리지 않는다.
- 마이페이지의 칸 판(16GB/칸, 검토 중 증량이 점선 고스트로 자라는 것)은 동작하는 시각 장치로서 좋다. 하지만 화면 전체는 "업무 폼"의 문법이다.
- 운영 현황(관리자 홈)은 결재 대기 3줄과 네 축의 숫자 표다. 칸마다 높이 400px 가운데 숫자 세 줄만 떠 있어 빈 면이 크다(`admin-home-1440-full.png`). 관리자가 "다른 사이트"라는 표시는 검은 마스트헤드 하나뿐이다.
- 사용자가 거부한 "딱딱한 업무 시스템 목업"에서 이 영역은 아직 벗어나지 못했다. 가장 많이 보는 자리(대시보드)가 깨진 타일과 튕기는 링크를 안고 있어 신뢰를 먼저 깎는다.

## 6. 권장 순서 (구현 에이전트용)

1. **D-1 · D-2 · D-3 한 번에** — 대시보드를 `mountShell({active:'dashboard'})` 로 옮긴다(자체 레일 · 마스트 · 푸터 · MY · `say` 삭제). 내용을 직원 관점으로 다시 짠다: `내 발행 요청 상태`(승인 대기 → 검토 중 → 발행) · 프로젝트/학습 대기열 · 분기별(지자체/글로벌) 카드 집계 · 남원 연도별 배포본(`DEPLOYS`). 승인 KPI · 관리 타일은 관리자 운영 현황으로 보내고 제목을 `대시보드`로 바꾼다. (Opus 급)
2. **S-1** — 셸이 `?denied=` 를 읽어 `say('○○ 화면은 LX 관리자 전용입니다')` 한 줄을 띄운다. (Sonnet)
3. **D-4 · D-7 · D-8 · D-10 · D-11** — 1을 하면 대부분 저절로 사라진다. 남는 타일 겹침은 `dashboard.css:328` 을 제거한다. (Sonnet)
4. **D-5** — `ximap.html` 이 `?cell=lon,lat&mode=` 를 받아 그 셀로 `fitBounds`. (Sonnet)
5. **M-1 · S-4** — `PROFILE` 을 역할별 3벌로(`시연` 유지), 마이페이지 머리에 계정 종류 칩 + `계정 바꾸기 ›`(login.html), `mountShell` 끝에서 `applyCustomSymbol()` 호출. (Sonnet)
6. **S-2 · S-5 · S-7 · dashboard-128** — 활성 키 수정, 기준일 단일화, `shell-demo.html` · `dashboard-128/` 에 관문을 달거나 배포에서 뺀다. (Sonnet)
7. **D-6 · S-3 · M-2** — 1100px 아래에서 레일을 하단 탭바나 드로어로 바꾸고 마스트헤드를 한 줄 줄인다. (Opus 5)
8. **몰입감** — 대시보드 판을 인터랙티브(줌 · 팬 · 셀 클릭 시 그 자리로 플라이)하게 바꾸고 XI맵과 같은 엔진을 공유한다. 운영 현황의 빈 칸은 실데이터(infra 용량 막대 · 배포본 지도)로 채운다. (Opus 5.5)
