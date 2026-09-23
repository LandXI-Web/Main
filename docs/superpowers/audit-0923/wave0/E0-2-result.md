# E0-2 결과 — 로그인 문 복구(G-01 · 액센트 · 워드마크 · 세션 계약)

## ① 한 줄 결과

1280×720 에서 로그인 버튼이 창 밖(730)으로 나가던 P0 를 닫았다. 카드 높이를 콘텐츠 높이로 바꾸고, 계정 종류를 한 줄 세그먼트로 줄였다. 로그인 버튼은 잉크 채움이고, 정지 상태의 액센트는 3곳이다. 워드마크는 `scrub/index.html` 로 간다. 로그인과 로그아웃은 §7.1 세션 계약을 지킨다. `proto-login.spec.mjs` 는 **35/35 녹색**이다(기존 18건 갱신 + 신규 17건).

## ② 완료 기준별 증거

| # | 기준 | 증거 |
|---|---|---|
| 1 | 4폭에서 `#lgSubmit` 하단 < 뷰포트 · `.lg-card` ∩ `.lg-foot` = 0 | spec `G-01 ${w}×${h}` 4건 녹색(boundingBox 교차 면적 0 · 발 하단 ≤ 뷰포트 · 스크롤 0). 실측 1280×720: 카드 526 · 버튼 하단 592 · 발 하단 689 / 1440×900: 버튼 682 · 발 779. 오류 2줄이 들어온 상태도 1280×720 에서 창 안(`G-01 1280×720 — 빈 제출…`). `login.css:164-169`(body.lg-login 흐름 액자 · `--lg-login-h:526px` 바닥) |
| 2 | 정지 액센트 ≤ 3 · 채운 파랑 0 · 라운드/그림자/그라디언트 0 · 14px 미만 0 | spec `시스템 법 …` 녹색: 정지 액센트 = `['lg-brand::after','lg-find__a','lg-find__a']`(의사 요소까지 셈), `#lgSubmit` 배경 = `rgb(1, 1, 2)`, radius/shadow/gradient 0, small = []. 체크박스 체크 = 잉크(`login.css` `.lg-login .lx-check input:checked`). 색만 바꾸던 호버 4곳 → 밑줄 스윕 · 브래킷 성장 · 화살표 4px |
| 3 | 워드마크 href = `scrub/index.html` | `login.html:23` · spec `워드마크 — …` 녹색(링크 200 · `dive.html` 링크 0) |
| 4 | 성공 = §7.1 signIn(`lx_tenant_session` 제거) · 목적지 = `homeOf(role)`, `?next` 우선 | `login.js:27-28` signIn/signOut · `login.js:48` `destination = nextTarget() \|\| homeOf(role)`(roles.js import · 중복 HOME 표 삭제). spec `성공 — LX 관리자/LX 직원/영업용 계정` 3건 → `admin-home.html` · `ai-project.html` · `ximap.html`, 키 `{in:'1', role, tenant:null}`. `기관 세션에서 LX 로그인` → `lx_tenant_session` null. `?next 우선` → `analysis-ai.html`. 허용 목록 밖 next → `homeOf('admin')` |
| 5 | `?logout` = 세 키 전부 제거 | spec `?logout — 세 키 …` 녹색: 세 키 null · `lx_saved_email` 유지 · 안내 줄 0 |
| 6 | 3칸 한 줄 세그먼트 · 라디오 변경 시 캡션 `ROLES[].what` 갱신 | `login.html:59-66` · spec `계정 종류 — 3칸 한 줄 세그먼트…`(한 줄 · 높이 40 · 채움 0 · 선택 = ::before/::after 12px 잉크 2px · 호버 6px · 방향키 선택). spec `계정 캡션 — …`: admin → staff → sales 로 what/CAPS 문구 변화 단언 + 애니메이션 타이밍 `[600, 0/60/120/180, cubic-bezier(0.15, 1, 0.3, 1)]`. 축소 모션 = 애니메이션 0 |
| 7 | 390 `scrollWidth === clientWidth` | spec `390 — 1열 스택…` 녹색(sw = cw = 390 · 창 밖 요소 0 · 필름 → 캡션 → 폼 순). 원인이던 워드마크 이미지(396px) → `max-width:100%` |
| 8 | spec 18 + 추가 전부 녹색 | `npx playwright test tests/e2e/proto-login.spec.mjs --reporter=line` → `35 passed (32.5s)` |
| 9 | 스크린샷 6장 | `shots/w0/E0-2/01-login-1280x720.png` · `02-login-1366x768.png` · `03-login-1440x900.png` · `04-login-1920x1080.png` · `05-login-390.png` · `06-role-caption-sales.png` + 캡션 스태거 모션 프레임 `caption-frame-00..08.png`(100ms 간격 · md5 9장 전부 다름). `shots/` 는 `.gitignore` 대상 |

### 추가로 한 것
- **손상 처리**: LX 세션과 기관 세션이 함께 있으면 세 키를 지우고 로그인 화면에 머문다(spec `손상 — …`).
- **기관 세션 + `?next`**: 기관 세션으로는 LX 화면으로 넘어가지 않는다(Q1 · spec `기관 세션 + ?next`).
- **현재 계정 안내**: 기관 세션이면 `지금 전북특별자치도 남원시 계정으로 들어와 있습니다 — LX 계정으로 로그인하면 기관 세션은 끝납니다.` 를 띄운다(`portal.js tenantById`, 기관 세션일 때만 동적 import). LX 문장은 조사를 고쳤다(`영업용 계정로` → `영업용 계정으로`).
- **캡션 띠**: 캡션은 필름 **아래** 흰 띠에 둔다. 필름 안 글자 0(발주 지시 5차)은 그대로이고 `#lgPlate` 텍스트는 비어 있다. 문구는 전부 `roles.js`(ROLES[].what · CAPS 앞 3개)에서 가져온다.
- 테스트 결함 2건: 정규식 `waitForURL(/map\.html/)` 가 `login.html?next=map.html` 에도 걸려 이동 전에 통과하던 것을 pathname 비교로 바꿨다.

## ③ git diff --stat (소유 파일만 변경)

```
 landxi/proto/login.css         | 116 ++++++++++++--
 landxi/proto/login.html        |  47 +++---
 landxi/proto/login.js          | 140 ++++++++++++-----
 tests/e2e/proto-login.spec.mjs | 342 +++++++++++++++++++++++++++++++++++------
 4 files changed, 524 insertions(+), 121 deletions(-)
```
새 파일: `docs/superpowers/audit-0923/wave0/E0-2-result.md` · `shots/w0/E0-2/*`(gitignore). 워킹트리의 다른 M 파일(roles.js · shell-gate.js 등)은 병렬 에픽이 바꾼 것이다. E0-2 는 건드리지 않았다.

## ④ 소유 밖 요청

1. **`tests/e2e/proto-auth.spec.mjs:49-60`('제목 · 필드 · 푸터가 로그인과 같은 자리 · 같은 글자') · 받는 에픽 E1-1(또는 E0-3)**. 이 테스트는 `login.html?logout` 과 `find-id.html` 의 h1 · lead · field · foot · head **좌표**가 같은지 비교한다. 로그인 카드가 526 높이의 흐름 액자로 바뀌었고 워드마크 밑줄(+8px)이 생겨서 y 좌표가 달라진다. 이 테스트는 **실패가 예상된다**(규칙상 남의 spec 이라 돌리지 않았다). 방법은 둘이다. (a) 비교를 x 좌표와 글자 속성으로 줄인다. (b) E1-1 에서 인증 가족에도 `body.lg-login` 과 같은 흐름 액자를 씌운다. 인증 가족 화면(find-* · signup)의 자리와 모습은 바꾸지 않았다. 로그인 전용 규칙은 전부 `body.lg-login` 아래에 있다.
2. **`design/system.md` §2 · 받는 에픽 E1-4(O7)**. 로그인 예외(액센트 채움 CTA)가 사라졌다는 1줄을 법전 개정 4줄에 넣어야 한다.
3. **인증 가족(`auth.css` · find-* · signup) · 받는 에픽 E1-1**. 같은 워드마크에 밑줄 · 호버를 맞출지 정해야 한다. 체크박스 체크 = 액센트, 찾기/정책 링크 색만 바꾸는 호버가 가족 쪽에 남아 있다(법전 §4 '색만 바꾸는 호버 금지').

## ⑤ 남은 것 · 알려진 결손

- 영업용 계정 캡션의 '할 수 있는 일'은 1개다(`roles.js sales.caps = ['export']`). Q4 의 '시연 실행 · 활용 사례'를 캡션에 보이려면 roles.js 에 필드를 더해야 한다(E0-1 소유 · 필요하면 요청).
- 관리자 칸은 Q7 답이 오기 전까지 세그먼트 3칸으로 둔다. 관리자 전용 입구(`admin-login.html`)는 E1-6 몫이다.
- 정책 링크 3개는 계속 `preventDefault` 한다(`site/policy.html` 은 E1-1 몫).
- 창 높이가 약 690px 보다 낮으면 페이지가 세로로 스크롤된다. 잘리지 않고 스크롤되게 했다. 예전에는 `overflow:hidden` 이라 닿을 수 없었다.
- 보고서 파일명: 하네스 지시는 `E0-2-report.md` 였지만 브리프가 새 파일로 허용한 경로가 `E0-2-result.md` 뿐이라 이 경로에 썼다. 스크린샷도 같은 이유로 `shots/wave0/` 이 아니라 `shots/w0/E0-2/` 에 두었다.
