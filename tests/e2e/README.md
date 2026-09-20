# tests/e2e

`npx playwright test` — `tests/e2e/*.spec.mjs` 를 돈다. `_legacy/` 는 `playwright.config.mjs` 의 `testIgnore` 로 제외된다.

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
