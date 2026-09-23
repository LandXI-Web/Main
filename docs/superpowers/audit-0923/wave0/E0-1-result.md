# E0-1 결과 — 경계 세우기 (세션 계약 · 관문 판정표 · 기관 완전 별도 · S8 한 줄 안내)

## ⓪ 재판정(불합격) 수정 — 2026-09-24

| 지적 | 고친 것 | 증거 |
|---|---|---|
| [차단] `#pl-deny` 가 서면 폼이 카드 밑으로 흘렀다(1440: +40px · 1920: +71px) | `portal-login.css` `.pl-card` 를 `height:min(560px,100%)` → `min-height:min(560px,100%); max-height:100%` 로 바꿨습니다. 카드 높이를 사진이 부풀리지 않도록 얼굴 `img`·`.em` 을 `position:absolute; inset:0` 으로 뺐고, 좁은 화면(≤860) 줄 정의도 `minmax(auto,1fr)` 로 바꿔 800×900 에서 나던 10px 넘침도 막았습니다. 안내가 없는 문은 예전과 똑같이 560입니다 | 새 e2e `proto-session` "기관 문 — 안내가 서도 카드 안에 들어온다" 6건(1366×768 · 1440×900 · 1920×1080 × 안내 있음/없음): `.pl-form.scrollHeight ≤ .pl-card 높이` · `≤ clientHeight` · `.pl-note` 바닥 ≤ 카드 바닥 · `.pl-face-c` 바닥 ≤ 카드 바닥 · 페이지 넘침 0. 프로브 `shots/w0/E0-1/measure-door.mjs` 실측: 1440 안내 있음 카드 601 / 폼 599 · 1920 632 / 630 · 1366·1280 560 / 558 · 안내 없음 전부 560 / 558 |
| `.pl-b` 가 `shell.css .lx button{border:0}` 에 밀려 테두리가 없었다 | 선택자를 `.lx .pl-b`(+ `:hover` · `:focus-visible`) 로 올렸습니다. 두께는 **2px** 로 바꿨습니다. 1.5px 는 Chrome 이 계산값과 화면 모두 1px 로 내려 긋기 때문입니다(DPR 1·2 실측, 계산값 `1px`). 그래서 1.5px 단언은 성립할 수 없고, 입력칸 1px 보다 한 단 굵게 2px 로 세웠습니다. 테두리가 살아나자 글자가 왼쪽 끝에 붙어 보여서 `text-align:center; padding:0 16px` 도 더했습니다 | 새 e2e "로그인 단추 — 상징색 테두리 2px + 상징색 글자": 계산값 `border-top-width 2px` · `solid` · 테두리색 = 글자색 = 계산된 `--accent`. 스크린샷 `08-portal-door-notice-1440/1280.png` |
| 프레임 00~07 8장이 전부 최종 프레임이었다 | 이 8장은 지웠습니다. `shoot.mjs` 를 고쳐 애니메이션을 `pause()` 한 뒤 `currentTime` 을 0/100/250/400/500ms 로 옮겨 찍습니다 | `08-portal-door-notice-t000/t100/t250/t400/t500.png`. 찍을 때 잰 opacity · translateY 값은 0 · 6px → 0.76 · 1.44px → 0.97 · 0.17px → 0.999 · 0.007px → 1 · 0 입니다(실제 중간 프레임) |

재실행 출력:
```
npx playwright test tests/e2e/proto-session.spec.mjs tests/e2e/proto-shell.spec.mjs tests/e2e/proto-portal.spec.mjs --reporter=line
  123 passed (1.9m)      # session 38 · shell 32 · portal 53
```
스크린샷 16장(01~08 × 1440·1280)을 고친 CSS 로 **전부 다시 찍었습니다**. 저장 경로는 하네스 지시문의 `shots/wave0/E0-1/` 이 아니라, 브리프가 허용한 새 파일 경로인 `shots/w0/E0-1/` 입니다.

## ① 한 줄 결과

관리자·직원·영업·기관, 네 주체가 서로의 화면으로 넘어가지 않습니다. 기관 로그인은 이제 `lx_tenant_session` 만 세우고 LX 키는 지웁니다(portal P0-1 해소). 기관 세션은 LX 화면에 들어오지 못하고 자기 기관 홈으로 돌아가며 안내 한 줄을 받습니다. LX 세션은 관리자여도 기관 작업공간에 들어가지 못하고, 그 기관의 로그인 문 위에 안내 한 줄이 섭니다. 로그아웃하면 세 키가 전부 지워집니다. `?denied=` 로 튕기면 어느 경우든 안내 한 줄이 나오고, 그 뒤 주소에서 `denied` 가 사라집니다. `proto-session`, `proto-shell`, `proto-portal` 스펙은 123건 모두 녹색입니다(재판정 수정 뒤 · 아래 ⓪).

## ② 완료 기준별 증거

| # | 기준 | 증거 |
|---|---|---|
| 1 | §7.2 판정표 20칸 + 손상 1 + 전환 3 | `tests/e2e/proto-session.spec.mjs` 38건 녹색(재판정에서 문 맞춤 6 + 단추 1 추가): 판정표 20칸(세션 5 × 화면 4, 칸마다 착지 파일, 요청 기록의 `?denied`/`?next`, 안내 종류, `denied` 제거, 키 불변 단언) · 안내 문구 3 · 손상 1(LX 화면·포털 화면 둘 다 → `login.html` + 세 키 0) · 전환 3(기관→직원 전환, admin→문→기관 로그인→LX 키 제거 뒤 두드리던 작업공간으로, 여정 ③ 앞부분) · signOut 4 |
| 2 | signOut 뒤 세 키 0 | `proto-session` "signOut" 4건(기관·admin·staff·sales) · `proto-shell` "로그아웃 = signOut"(잔존 `lx_tenant_session` 까지 제거) · "MY 플라이아웃의 로그아웃도 같은 signOut" · `proto-portal` "기관 레일 로그아웃 → 그 기관의 문 · 세션 키 0". 구현: `landxi/proto/shell.js:166` `signOut` (`ALL_SESSION_KEYS` 전부 제거) · `:173` `logout = signOut` |
| 3 | `?denied=` → `#say` + 쿼리 제거(LX 3 + 기관 1) | `proto-shell` "?denied — admin/staff/sales …" 3건(정확한 문구 · `toHaveURL(...html$)`) · `proto-portal` "기관 세션이 LX 화면을 두드리면…" 1건. 구현: `shell.js:178` `deniedLine`, `:187` `takeDenied`(replaceState), `portal-ui.js:84` |
| 4 | 기관 세션 ximap → `portal.html?denied=ximap.html` + 토스트 | `proto-session` "tenant:namwon × ximap.html" 칸 + 전환 "여정 ③" 의 요청 기록 `/portal\.html\?denied=ximap\.html$/`. 스크린샷 `07-denied-toast-tenant-*.png` |
| 5 | LX admin 세션 farm-25 → `portal-login-namwon.html?denied=` + 문 위 안내 | `proto-session` "admin × portal-dp-nw-farm-25.html" 칸 · `proto-portal` "LX 관리자 세션은 기관 작업공간에 못 들어간다"(`#pl-deny` 문구, LX 키는 자동으로 지우지 않음). 구현: `shell-gate.js:56-66`, `portal-login.js:45-55` |
| 6 | 관리자 화면 전부 `html[data-site=admin]` · FAMILY 기관 href = 로그인 문 | `proto-shell` "관리자 화면 전부 html[data-site=admin]"(11화면: admin-home·publish·notice·users·inquiry·faq·map·produce·ai-card·dataset·mypage, 직원·영업은 속성 없음) · "Family Site 기관 항목 = 그 기관의 로그인 문". 구현: `shell-gate.js:76`(그리기 전, 셸을 안 쓰는 dataset·dashboard 도 포함) · `shell.js:298` · `shell.js:82-83` |
| 7 | journeys 재실행 | `shots/w0/E0-1/journeys.mjs`(복사본, 바꾼 줄 3개는 머리 주석에 적음) → `journeys.json`: `portal.leak_ximap/analysis-ai/dashboard.html` 착지 3/3 모두 `portal.html`, 레일 `["내 서비스","로그아웃"]` · `admin/staff/sales.denied.query` = `denied=ai-project.html` / `denied=admin-home.html` / `denied=admin-publish.html` (3/3) · `portal.storage` = `{role:null, logged:null, tenant:"{\"tenant\":\"namwon\",…}"}` · `pageErrors: []` |
| 8 | proto-shell · proto-portal 녹색 | 이번 작업 전 기준선 74건 녹색(shell 25 + portal 49 — 파라미터 전개 포함). 지금 shell **32**건(+7), portal **53**건(+4) 녹색. 바꾼 기대값: 로그아웃 착지 `scrub/index.html` → `login.html` + 세 키 0, 기관 레일 → `['내 서비스','로그아웃']`. 나머지는 `boot` → `bootAs`/`bootTenant` 교체와 새 테스트 추가뿐 |
| 9 | 스크린샷 | `shots/w0/E0-1/`: `01-rail-admin` · `02-rail-staff` · `03-rail-sales` · `04-rail-tenant-namwon` · `05-denied-toast-staff`(admin-publish 시도) · `06-denied-toast-sales`(notice 시도) · `07-denied-toast-tenant` · `08-portal-door-notice`. 각 `-1440.png` · `-1280.png` 로 16장. 문 안내 텍스트 인(500ms) 중간 프레임 `08-portal-door-notice-t000/t100/t250/t400/t500.png`(애니메이션 정지 + currentTime 이동). 촬영 스크립트는 `shots/w0/E0-1/shoot.mjs` |

실행 출력(최종):
```
npx playwright test tests/e2e/proto-session.spec.mjs tests/e2e/proto-shell.spec.mjs tests/e2e/proto-portal.spec.mjs --reporter=line
Running 116 tests using 3 workers
  123 passed (1.9m)
```

### 바뀐 것 요약
- `landxi/assets/data/storage-keys.js`(신설): `KEYS` 표(owner · life · **store**(실제 저장소를 grep 으로 확인한 값) · reset) · `SESSION_KEYS` · `ALL_SESSION_KEYS`.
- `roles.js`: 기관 단을 넣지 않았다는 주석을 달았습니다(Q1). `SCREEN_MENU` 에 `report-standard-issue` · `map-drift` → map, `notice/faq/contact/manual` → support 를 더했고, `ai-publish-create` 는 publish 에서 **project** 로 바꿨습니다.
- `portal.js TENANTS`: namwon 과 gwangju-jeonnam 의 `menus: ['portal']` · `home`(광주전남 = `portal-dp-gj-marine-25.html`, 임시) · `login`. 다른 export 는 손대지 않았습니다.
- `shell-gate.js`: §7.2 판정표 전체(손상 → 세 키 삭제 + `login.html` · 포털 화면 `data-login` 판정 · 기관 세션은 LX 화면에서 기관 홈 `?denied` · admin 일 때 `data-site=admin`). 미러 표는 `MENU` · `MENUS` · `HOME` · `TENANT_HOME` 네 개입니다.
- `shell.js`: `TENANT` · `gate(base, portal)`(같은 표를 미러) · `signOut`/`logout` 별칭 · `deniedLine` · `takeDenied` · `mountShell({tenant})` 기관 레일(내 서비스 + 로그아웃, MY 없음) · `data-site=admin` · `applyCustomSymbol()` · FAMILY 가 로그인 문을 가리키게 변경. `bindRail` 은 MY 가 없는 레일에서도 동작합니다.
- `portal-ui.js`: `mountShell({tenant: t, active:'portal'})` · 레일 거르기 코드와 `svcNav` 개조 코드 삭제 · 마크 href = `t.home` · denied 안내(LX 화면 / 다른 기관). 블록 렌더 함수는 손대지 않았습니다.
- `portal-login.js/css`: 기관 signIn(R-S1) · 이미 같은 기관 세션이면 바로 `nextOf()` · `?denied` 문 위 안내 `#pl-deny`(잉크 글자 · 헤어라인 · 왼쪽 3px 잉크 · 라운드 0 · 텍스트 인 500ms · 축소 모션이면 정지). denied 를 걷어 낼 때 두드리던 작업공간은 `next` 로 남겨, 기관 로그인 뒤 그 화면으로 곧장 갑니다. 홈 = `TENANTS.home`.

## ③ git diff --stat (내 소유 파일만 · 작업 트리에는 병렬 에픽의 변경도 섞여 있음)

```
 landxi/assets/data/portal.js    |   9 ++-
 landxi/assets/data/roles.js     |  11 +++-
 landxi/proto/portal-login.css   |  36 ++++++++----
 landxi/proto/portal-login.js    |  41 +++++++++++---
 landxi/proto/portal-ui.js       |  36 ++++++------
 landxi/proto/shell-gate.js      | 111 ++++++++++++++++++++++++------------
 landxi/proto/shell.js           | 121 ++++++++++++++++++++++++++++++++--------
 tests/e2e/proto-portal.spec.mjs |  83 +++++++++++++++++++++++----
 tests/e2e/proto-shell.spec.mjs  | 107 +++++++++++++++++++++++++++++++----
 9 files changed, 431 insertions(+), 124 deletions(-)
?? landxi/assets/data/storage-keys.js
?? tests/e2e/proto-session.spec.mjs
(shots/ 는 .gitignore — shots/w0/E0-1/** 에 스크립트 · PNG · journeys.json)
```
`git status` 에 보이는 나머지 변경(analysis*, map*, dashboard*, dataset*, login*, project-*, publish-*, 다른 스펙, `_roles.mjs`, spikes)은 병렬 에픽 E0-2~E0-8·E0-S 의 것이고, 이 에픽은 **손대지 않았습니다**. 소유 밖 수정은 0건입니다.

## ④ 소유 밖 요청

| 파일:줄 | 바꿀 값 | 이유 | 받는 곳 |
|---|---|---|---|
| `tests/e2e/proto-drift.spec.mjs:31-33` `boot` | `DRIFT`(map-drift.html) → `bootAs(page,url,'staff')`, `P25`·`P27`(광주전남 포털) → `bootTenant(page,url,'gwangju-jeonnam')` | `lx_logged_in` 만 심으면 DEFAULT admin 이 됩니다. 그러면 ① `map-drift.html` 은 이제 `map` 관문이라 `admin-home?denied` 로 튕기고 ② 포털은 LX 세션이라 기관 문으로 튕깁니다(§7.2 대로 동작한 것). **통합 e2e 에서 실패가 예상됩니다** | 통합 · E0-3(픽스처) |
| `tests/e2e/proto-mypage.spec.mjs:310` | `waitForURL(/scrub\/index\.html/)` → `/login\.html/` · `:311` 에 `lx_role` 까지 null 단언 | 탈퇴는 `logout('')` = `signOut` 입니다. 착지가 R-S2 에 따라 `login.html` 이 됐습니다 | 통합 · E1-6 |
| `tests/e2e/proto-mypage.spec.mjs:19,32` · `proto-admin.spec.mjs:19,58` · `palette/tokens/shell.spec.mjs` | `bootAs(page,url,'admin')` | 지금은 DEFAULT admin 덕분에 통과합니다. 뒤에 `DEFAULT_ROLE` 을 거두려면 명시적인 역할이 필요합니다 | E0-3 · 통합 |
| `landxi/proto/dashboard.js:57` · `dataset.js:72` | 자체 로그아웃 → `import { signOut } from './shell.js'` | `lx_logged_in` 만 지우고 `scrub/index.html` 로 가서 C-09 가 남아 있습니다(`lx_role` 잔존). 이 두 화면은 셸 레일을 쓰지 않아 제 코드가 닿지 않습니다 | E0-6 · E0-7 |
| `tests/e2e/proto-dashboard.spec.mjs:57-66` A11 | 착지 `login.html` + 세 키 null | 위 항목과 짝 | E0-6 |
| `landxi/proto/login.js` | ② 여정의 "지금 LX 관리자로 들어와 있습니다" 안내와 `?logout` 세 키 삭제는 이미 `K.tenant` 가 있어 반영된 것으로 보입니다. `?denied`/기관 세션 도착 시(기관이 `login.html` 을 연 경우) 안내 한 줄을 요청합니다 | 여정 ④ | E0-2 |

## ⑤ 남은 것 · 알려진 결손

- **`DEFAULT_ROLE = 'admin'` 은 그대로 두었습니다.** `lx_logged_in` 만 있고 `lx_role` 이 없으면 여전히 관리자로 판정됩니다. 기관 로그인 경로는 이제 LX 키를 세우지 않아 P0-1 은 해소됐지만, 다른 스펙 20여 개가 `lx_logged_in` 만 심고 있어 W0 중에는 바꾸지 않았습니다. 통합 단계에서 `bootAs` 로 이관한 뒤 "역할 없음 = 세션 없음" 으로 바꾸기를 권합니다(`roles.js DEFAULT_ROLE` · `shell-gate.js` 의 `'admin'` 폴백 2곳).
- **관리자 착지는 `login.html`** 입니다(W0 규칙). E1-6 이 `admin-login.html` 을 세우면 `shell.js signOut` 1줄을 바꿔야 합니다.
- **광주전남 홈은 임시**(`portal-dp-gj-marine-25.html`)입니다. E1-2 가 `portal-gwangju-jeonnam.html` 을 만들면 `portal.js TENANTS[].home` · `shell-gate.js TENANT_HOME` · `shell.js TENANT_HOME` 세 곳을 함께 고쳐야 합니다(미러 2개).
- **`applyCustomSymbol()` 을 모든 LX 셸 화면에서 부릅니다.** 심볼 이미지 모양 CSS 는 `account.css`(마이페이지)에만 있어서, 저장된 심볼이 있으면 다른 화면 레일 마크에서는 인라인 폭만 적용됩니다. 모양 CSS 를 셸로 옮기는 일은 E1-6 몫입니다.
- ~~기관 문의 `로그인` 단추 테두리가 보이지 않음~~ → 재판정에서 고쳤습니다(⓪). **기존부터 있던 문제(이번 변경과 무관):** 1280×720 포털 홈의 영농관리 카드에서 연도 줄과 제목이 겹칩니다(`07-denied-toast-tenant-1280.png` · 블록 렌더는 이 에픽 소유가 아님).
- 보고서 경로: 하네스 지시문은 `E0-1-report.md` 를 적었지만, 새 파일 허용 목록과 00-COMMON 이 `E0-1-result.md` 여서 이 파일로 썼습니다.
