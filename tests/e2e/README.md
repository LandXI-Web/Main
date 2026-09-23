# tests/e2e

`npx playwright test` — `tests/e2e/*.spec.mjs` 를 돈다. `_legacy/` 는 `playwright.config.mjs` 의 `testIgnore` 로 제외된다.

## 역할 픽스처 규칙

2026-09-21 `cd03cb9`(LX 관리자 · 직원 · 영업 3단 위계)가 들어오면서 화면마다 필요한 `lx_role` 이
달라졌다. `localStorage.lx_logged_in` 만 세우고 역할을 안 심는 옛 `boot()` 는 기본값(`admin`)으로
간주돼 대부분의 화면에서 관문에 튕긴다 — 자세한 근거는
`docs/superpowers/audit-0923/tests.md` §2, 정본 계약은
`docs/superpowers/audit-0923/MASTER-PLAN.md` §7(특히 §7.3 역할 픽스처 코드)에 있다.

**정본**은 `tests/e2e/_roles.mjs`(`HOME` · `TENANT_HOME` · `TENANT_DOOR` · `bootAs` · `bootTenant` ·
`switchTo`) 다. **Wave 0 동안은 이 파일을 import 하지 않는다** — 병렬로 여러 에픽이 동시에
스펙을 고치므로, 각 스펙 파일은 이 6개를 자기 파일 안에 그대로 복사해 쓴다. 통합 단계가 모든
스펙을 `_roles.mjs` 의 import 로 일원화한다.

세 함수:

| 함수 | 하는 일 |
|---|---|
| `bootAs(page, url, role = 'staff', extra = {})` | LX 세션(`lx_logged_in` · `lx_role`)을 심고 화면을 연다. `lx_tenant_session` 은 지운다. 세션은 **첫 로드에서만** 심는다(`sessionStorage` 가드) — 그 뒤 같은 `page` 로 다시 부르면 두 번째 role 은 무시된다(가드 때문에 세션 없는 상태로 되돌릴 수 없다). |
| `bootTenant(page, url, tenant = 'namwon')` | 기관 세션(`lx_tenant_session`)을 심고 포털 화면을 연다. `lx_logged_in` · `lx_role` 은 지운다. |
| `switchTo(page, role)` | 같은 탭에서 LX 역할을 바꾼다(로그아웃 없이 계정 전환 e2e 용) — 다음 `page.goto` 부터 적용된다. |

화면별 기본 역할(00-COMMON · MASTER-PLAN §7.3 그대로):

| 화면군 | 기본 역할 |
|---|---|
| `map` · `analysis` · `project` · `dashboard` · `dataset` · `support`(notice/faq/contact/manual) | `staff` |
| `usecase` | `sales`(영업 레일 항목) — 다만 서비스 지원 탭 맥락에서 여는 테스트는 `staff` 로 열어도 통과한다(`usecase.html` 은 `SCREEN_MENU` 에 없어 role 무관하게 통과) |
| `admin-*` · `admin-publish` · `ai-card*` · `produce` | `admin` |
| `portal*` | `bootTenant('namwon')` |

세션 키(정본 `landxi/assets/data/storage-keys.js` · 요약은
`docs/superpowers/audit-0923/MASTER-PLAN.md` §7.1 표):

| 키 | 값 | 세션 |
|---|---|---|
| `lx_logged_in` | `'1'` | LX |
| `lx_role` | `'admin' \| 'staff' \| 'sales'` | LX |
| `lx_tenant_session` | `{"tenant":"namwon","at":"<ISO>"}` | 기관 |

**주의**: `?next=` 관문 검사처럼 **세션 없이 시작하는 테스트**는 `bootAs` 를 쓰지 않고
`page.goto` 를 그대로 쓴다 — `bootAs` 의 `sessionStorage` 가드가 같은 `page` 안에서 세션 없는
상태로 되돌리는 것을 막기 때문에, 그런 테스트는 항상 **새 `page`**(Playwright 기본 — 테스트마다
새 `page`)에서 시작해야 한다.

## 은퇴한 스펙 (`_legacy/`)

2026-08 에 구 Ops-Atlas 화면이 `landxi/proto/*` 로 대체되면서 다음 진입점은 meta refresh 리다이렉트 스텁만 남았다.

| 구 페이지 | 지금 | 옮긴 스펙 | 현행 스펙 |
|---|---|---|---|
| `landxi/home.html` (궤도→하강 씬 홈) | → `proto/scrub/index.html` | `_legacy/home.spec.mjs` | `proto-scrub.spec.mjs` |
| `landxi/login.html` | → `proto/login.html` | `_legacy/login.spec.mjs` | `proto-login.spec.mjs` |
| `landxi/dashboard.html` (Ops-Atlas 대시보드) | → `proto/dashboard.html` | `_legacy/dashboard.spec.mjs`, `_legacy/dashboard-coverage.spec.mjs` | `proto-dashboard.spec.mjs` |

스펙 파일은 참고용으로 남긴다(구 화면의 동작 명세). 삭제해도 무방하다.

## 같은 이유로 고친 스펙

- `smoke.spec.mjs` — 구 홈의 `[data-test=title]` 대신, 리다이렉트 스텁 3종이 각자의 proto 페이지로 실제로 넘어가는지 본다.
- `tokens.spec.mjs` — 토큰 측정 대상을 `home.html` → `dev/shell.html`(같은 `assets/css/tokens.css`)로 바꾸고, 구 홈 전용 `--scene-bg` 단언을 뺐다.

## 남아 있는 실패 (2026-08-27 기준, 이 정리 범위 밖)

proto-* 스펙은 손대지 않았다. 아래 4건은 페이지가 스펙보다 앞서 바뀐 것(은퇴가 아니라 표류)이라 페이지 소유자가 스펙을 갱신해야 한다.

- `proto-login.spec.mjs:49` — 로그인 버튼 서체가 Pretendard → `Paperlogy, Pretendard, …` 로 바뀜.
- `proto-system.spec.mjs:26` — `.lx-index__row` 13 → 15 (services.js 가 15종).
- `proto-system.spec.mjs:53`, `:173` — h1 64/80px → 66/82px.
