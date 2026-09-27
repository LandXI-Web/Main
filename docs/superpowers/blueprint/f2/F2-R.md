# F2-R — 레일 정본화 · 기존 셸 편입: '지도 서비스' = 새 XI맵 · 관리자 레일 → 관제(:8702) · 글로벌 진입 · `embed=1` · 생산 딥링크(`?card=` `?deploy=`) · 기존 테스트 개정

- 모델 **Opus 5** · 난이도 M · 기간 3–4일 [추정] · 판정 Fable 5.1(기존 e2e 전량 · 레일 캡처 · 세 계정)
- 읽을 것(순서): ① `LANDXI-HYPER-BLUEPRINT.md` §2.1(원본 35화면 1:1) · **§2.2 사이트별 레일** ② `F1-CONTRACT.md` §3(인증 · realm/role) · **v1.1-5(29) · v1.1-6** ③ 저널 integrate result(`금지된 git checkout … 기존 로그인·레일에서 새 화면으로 들어가는 링크는 넣지 못했습니다. 레일에 넣으려면 shell.js NAV와 roles.js, 레일 테스트를 함께 고쳐야 합니다 … '지도 서비스' 레일의 정본을 새 XI맵으로 할지 기존 화면으로 할지 결정이 필요합니다.`) → **결정(Fable · 사용자 지시)**: 정본 = 새 XI맵 `landxi/xi/` ④ `landxi/proto/shell.js`(NAV 37–68 · 레일 렌더 239–257) · `shell-gate.js` · `landxi/assets/data/roles.js`(ROLES · menus · rail · home · SCREEN_MENU) · `landxi/proto/login.js` ⑤ `tests/e2e/{proto-shell,proto-login,proto-session,shell,proto-map}.spec.mjs`(레일 수 admin 6 · staff 7 · sales 4 · HOME 표 · `ximap.html` 기대값) ⑥ `f1/F1-A-result.md §5` 요청 9(`stats/report-standard ?embed=1`) ⑦ `docs/superpowers/specs/2026-09-20-{two-tier,platform-roles,card-architecture,production}.md`(생산 = 카드 버전 · 배포 계보)
- 공통 규칙: **git 금지**(integrate가 어긴 `git checkout` 재발 0 — 되돌림은 수동 편집) · 소유 밖 수정 0 · 테스트 자기 것만(`tests/e2e/proto-shell proto-login proto-session shell proto-map f2r- --workers=2`) · 4173 끄지 말 것 · **p0926 작업이 `landxi/proto/ximap.html`을 개편 중 — 그 파일과 `map*.js`(map-stats·map-report 제외)는 만지지 않는다** · 행정 문서화 금지 · 원본 기능 삭제 0(구 XI맵은 레일에서 빠지되 파일·테스트 유지).
- 판정: 완성형(레일에서 새 화면까지 죽은 링크 0 · 세션 인계) · 일원화(생산 ↔ 서비스 ↔ 관리가 레일·딥링크로 이어짐) + 세 계정(관리자 · 직원 · 영업) + 기관 계정.

## 목표

1차 통합은 새 화면 넷(XI맵 · 관제 · Global · 백엔드)을 만들었지만 **기존 셸(로그인 → 레일)에서 거기로 가는 길이 없다**. 사용자는 로그인하면 옛 `ximap.html`을 본다. 이 에픽은 레일을 정본화한다: 직원·영업의 **'지도 서비스' = `landxi/xi/`**, 관리자 레일에 **관제 4항(운영 현황 · 인프라 관제 · 기관·할당 · 배포 제어 → `:8702`)**, XI맵·기관 포털에서 **Global 진입**, 기존 통계·보고서 화면의 `embed=1`(XI맵 서랍 iframe 크롬 0), 생산 화면(`ai-card.html` · `produce.html`)에 **`?card=` `?deploy=` 딥링크 수신**(관제 배포 행 · XI맵 계보 칩에서 카드 버전으로 점프 = 일원화의 '생산' 꼭짓점). 기존 e2e를 **함께 개정**해 573+건이 새 정본으로 통과한다.

## owned_files
`landxi/proto/shell.js` · `landxi/proto/shell-gate.js` · `landxi/proto/login.js` · `landxi/proto/login.html` · `landxi/login.html` · `landxi/assets/data/roles.js` · `landxi/proto/stats-standard.html` · `landxi/proto/report-standard.html` · `landxi/proto/report-standard-issue.html` · `landxi/proto/map-stats.js` · `landxi/proto/map-report.js` · `landxi/proto/ai-card.html` · `landxi/proto/ai-card-edit.html` · `landxi/proto/publish-card-edit.js` · `landxi/proto/publish-cards.js` · `landxi/proto/produce.html` · `landxi/proto/produce.js` · `landxi/proto/portal-ui.js` · `landxi/proto/portal-login.js`(기관 포털 → XI맵 실태조사 모드 · Global 링크) · `tests/e2e/{proto-shell,proto-login,proto-session,shell,proto-map,proto-publish,proto-portal}.spec.mjs`(개정) · `tests/e2e/f2r-*.spec.mjs` · `shots/f2/R/**` · `blueprint/f2/F2-R-result.md`.
읽기만: `landxi/xi/**`(URL 규약 `?job= ?deploy= ?mode=survey ?pnu=`) · `landxi/ops/**`(`login.html?next=`) · `landxi/global/**` · `landxi/assets/data/storage-keys.js`(`lx_api_session`) · `landxi/shared/api-v1.js session`. **만지지 말 것**: `landxi/proto/ximap.html` · `map.js` `map-gl.js` `map-data.js` `map-drift.html` `map-pledge.js`(p0926) · `landxi/xi/**` · `landxi/ops/**` · `landxi/global/**`.

## 단계별 할 일

### 1. 레일 정본(D1)
- `shell.js NAV`: `map` → `{ name:'지도 서비스', href:'../xi/index.html' }`(상대 · base 규칙 유지) · 관리자 항목 신설 `ops`(운영 현황 → `http://localhost:8702/landxi/ops/login.html?next=index.html` · 관제 세션이 이미 있으면 `index.html`) · `infra`(인프라 관제 → `…?next=infra.html`) · `tenants`(기관·할당) · `deploys`(배포 제어) · 기존 `publish` `produce` `media` `admin` `my` 유지 → **관리자 레일 9**(설계서 §2.2의 8 + 생산 관리 — 원본 기능 삭제 금지 원칙 · 결과 문서에 근거) · 직원 7(대시보드 · 데이터 · 프로젝트 · 분석 · **지도(새 XI맵)** · 서비스 지원 · MY) · 영업 4(분석 서비스 · 활용 사례 · **XI맵** · MY · 첫 화면 = 새 XI맵). 외부 origin 항목은 `target=_self` · `rel` 없이 · 아이콘 기존 세트(새 아이콘 발명 0 · 없으면 글자).
- `roles.js`: `menus`/`rail`/`home`(sales home → `../xi/index.html`) · `SCREEN_MENU`에 새 경로 · `sees()`가 외부 origin 키(ops·infra·tenants·deploys)를 admin만 허용.
- `shell-gate.js`: 새 XI맵으로 갈 때 세션 인계 — `lx_api_session`/역할을 XI맵 `session.shadow()`가 읽는 형식 그대로(이미 같은 origin 4173 localStorage · 검증만) · 관제로 갈 때는 origin이 달라 세션이 없으므로 `?next=` + 관제 로그인(자동 인계는 2차 · 정직).
- `login.js`/`login.html`: 로그인 뒤 `homeOf(role)` · `?next=../xi/…` 허용(화이트리스트 · open redirect 0) · 역할 캡션(`WHAT`)에 '지도 서비스 = XI맵 실시간 분석' 한 줄(기존 문구 규칙 안).
- Global 진입: XI맵 마스트(있음) + 기관 포털 `portal-ui.js` 레일에 `Global ↗`(scope global 기관만 · kgz-agri) + 직원 레일은 항목 추가 없이 XI맵 마스트로(레일 7 유지).

### 2. `embed=1` (D2 · F1-A 요청 9)
- `stats-standard.html` · `report-standard*.html` + `map-stats.js` · `map-report.js`: `?embed=1`이면 `mountShell` 생략(레일 · 마스트 · 공지 · 푸터 · 쪽 제목 · 안쪽 닫기 버튼 0) · 본문 패널 100% 폭 · `postMessage({type:'lx:embed:ready', height})` · 기간 칩 URL 인자 수신 · XI맵 서랍(F2-A)의 스타일 주입 없이도 크롬 0 e2e(`iframe` 안 `#rail #mast #foot` 부재).

### 3. 생산 딥링크 (D2–D3 · v1.1-29 · 일원화 '생산' 꼭짓점)
- `ai-card.html?card=<id>&version=<v>` → 그 카드 열림 + 버전 행 강조 + `배포 계보` 칩(`dp-nw-farm-25 · v2.1 → 관제 배포 제어 ↗ ?deploy=` · `XI맵에서 보기 ↗ ?svc=`) · `produce.html?deploy=<id>` → 생산 공정 행 강조 · `ai-card-edit.html` 저장 시 localStorage `시연` 표기 유지(원본 규칙). 관제 배포 행 · XI맵 계보 칩의 '카드 ↗'가 여기로 온다(F2-C·F2-A에 URL 통보).
- 기관 포털(`portal-ui.js`): '지도' 탭 → `../xi/index.html?mode=survey&svc=dp-nw-farm-25&survey=farmland&embed=1`(iframe) · '결과' 탭에 `의심 큐 ↗`(XI맵 서랍 딥링크 `?mode=survey&drawer=findings`).

### 4. 테스트 개정(D3–D4)
- `proto-shell.spec`: HOME 표(sales → `../xi/index.html`) · 레일 수 admin 9 · staff 7 · sales 4 · 'map' 클릭 → `/landxi/xi/` 도착 + `data-lx=ready` · 관리자 `data-site=admin` 목록 유지 · 외부 origin 항목 href 단언(네비게이션은 mock route로 8702 차단해 `?next=` 확인) · 접근성 탭 순서.
- `proto-login.spec`: HOME · `?next=ximap.html` → `?next=../xi/index.html` 화이트리스트 · 역할 캡션 · 사이드 캡션 유지.
- `proto-session.spec` · `shell.spec` · `proto-map.spec`(구 XI맵은 직접 URL로만 열림 · `keep-all` 1건은 p0926 영역 — 건드리지 않음 · 레일 클릭 경로만 새 화면으로) · `proto-publish` · `proto-portal`(딥링크).
- `f2r-rail`(세 계정 레일 캡처 1440 · 죽은 링크 0 · 모든 href HEAD 200 또는 8702 `?next=`) · `f2r-embed` · `f2r-deeplink-card` · `f2r-portal-survey`.
- 전량: `npx playwright test --workers=2`(자기 spec 뒤 **전체 순차 1회** 결과를 결과 문서에 · 다른 에픽 spec 실패는 소유자 표기).

## 완료 기준(acceptance)
1. 세 계정 로그인 → 레일: 직원 '지도 서비스' → 새 XI맵 `data-lx=ready` · 영업 첫 화면 = 새 XI맵 · 관리자 레일 9(관제 4항 `:8702 ?next=`) — 캡처 3장 + e2e.
2. 세션 인계: XI맵이 `session.shadow()`로 realm/role을 읽어 역할 관문이 맞다(직원 전부 · 영업 demo · 기관 실태조사 기본).
3. `embed=1`: XI맵 서랍 iframe에 포털 크롬 0(주입 없이) · 기간 칩 수신 · e2e.
4. 생산 딥링크 `ai-card.html?card=&version=` · `produce.html?deploy=` 강조 + 계보 칩(관제 · XI맵 왕복) · 기관 포털 지도 탭 = 실태조사 모드 임베드 · 결과 탭 큐 링크.
5. 기존 e2e 개정 후 자기 spec 전부 통과 · 전체 순차 1회 결과표(실패 0 또는 소유자 명시) · `git checkout` 등 금지 명령 0 · 소유 밖 수정 0.
6. 죽은 링크 0(레일 · 마스트 · Family Site · 딥링크 전수 HEAD) · 14px 미만 0 · 콘솔 0 · 원본 기능 삭제 0(구 `ximap.html` 직접 URL 동작).
7. 결과 문서: 레일 표(계정 × 항목 × href) · 딥링크 규약 표(v1.1-29 · 화면 × 인자) · 세 사용자 자기 점검 · F2-A/C/D에 준 URL 목록.

## 판정용 동작 영상(≈ 40s · `shots/f2/R/f2r.mp4` · 1440×900)
| 초 | 무엇 |
|---|---|
| 0–8 | 로그인(LX 직원) → 레일 7 → '지도 서비스' 클릭 → 새 XI맵 부팅(세션 인계 · 마스트 역할 표기) |
| 8–14 | XI맵 통계 서랍 → `stats-standard?embed=1` 크롬 0 · 기간 칩 |
| 14–22 | XI맵 계보 칩 `카드 ↗` → `ai-card.html?card=…&version=v2.1` 강조 → `관제 배포 제어 ↗` → 관제 로그인 `?next=deploys.html` → 행 `?deploy=` |
| 22–30 | 로그아웃 → 관리자 로그인 → 레일 9 · '인프라 관제' → `:8702 ?next=infra.html` |
| 30–36 | 영업 로그인 → 첫 화면 새 XI맵 `영업 · 시연` |
| 36–40 | 기관(남원) 포털 로그인 → 지도 탭 = 실태조사 모드 임베드 · 결과 탭 `의심 큐 ↗` · (kgz-agri) `Global ↗` |

## 계약 · 요청
- 구현 = v1.1-29(생산 쪽) · 세션 규약은 v1.0 §3 그대로.
- F2-A에 준다: 레일 진입 URL · `?embed=1` 완성 통보(스타일 주입 제거 요청) · 카드 딥링크 URL.
- F2-C에 준다: 배포 행 '카드 ↗' URL · `?next=` 로그인 인계 요청(관제 로그인이 `next` 화이트리스트 처리).
- 2차로 미룸(정직): 4173↔8702 자동 세션 인계 · 구 `ximap.html` 폐기 여부(p0926 결과 뒤 사용자 결정).
