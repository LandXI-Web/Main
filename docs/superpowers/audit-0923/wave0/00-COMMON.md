# Wave 0 공통 규약 — 모든 브리프가 이 파일을 전제한다

- 저장소: `E:/Land-XI 플랫폼/01. 디자인` · 브랜치 `plan1-foundation` · 서버 `http://localhost:4173` 이 이미 떠 있다(**끄지 말 것** · `playwright.config.mjs reuseExistingServer`). Playwright: `channel: 'chrome'` · 기본 뷰포트 1440×900 · baseURL `http://localhost:4173/landxi/`.
- 읽을 것(이 순서): ① 이 파일 ② 자기 브리프 `wave0/<ID>.md` ③ 법전 `design/system.md`(전문) ④ `docs/superpowers/audit-0923/MASTER-PLAN.md` §7(세션 계약) · §8(소유 대조표) · 자기 에픽 행 ⑤ 브리프의 '근거 발견' 이 가리키는 감사 문서 절만. 그 밖은 필요할 때만.

## 절대 규칙

1. **git commit / reset / stash / checkout / branch 금지.** 커밋은 통합 단계가 한다. 완료 보고에 `git diff --stat` 을 첨부한다(소유 밖 파일 0 을 증명).
2. **소유 파일만 수정.** 브리프 `owned_files` 밖의 파일은 읽기·import 만. 꼭 고쳐야 하면 고치지 말고 결과 문서 '요청' 절에 `파일:줄 · 바꿀 값 · 이유` 로 적는다(소유자가 1줄 PR 로 받는다).
3. **새 파일은 브리프 `new_files_allowed` 경로만.** 스크린샷·JSON 은 `shots/w0/<ID>/` 아래.
4. **테스트는 자기 에픽 spec 만** 돌린다: `npx playwright test tests/e2e/<spec> --reporter=line`. 전체 e2e 는 통합 단계가 돈다. unit 은 E0-3 만.
5. **영상 생성 API(kie · kling 등) 호출 절대 금지**(Q6 · 크레딧 0). mp4 재렌더 · 포스터 재생성도 하지 않는다.
6. **콘티 원칙**(법전 §5): 지어낸 운영 서사 · 담당자명 · 대기 일수 · KPI 추세 금지. 숫자는 `results.js` `services.js` `models.js` `imagery.js`(+`cards.js` `registry.js`)에서만. 결과 없는 것 = `준비 중` · 원본 데모 시드 = `시연` · 추정 = `[추정]`. 결손은 점선 무채 + 이유 한 줄.
7. **법전**(`design/system.md`): 서체 Paperlogy 700/800 + Pretendard 400/500 + Inter 400 tabular(숫자) · 바닥 14px · 흰 바탕 · 잉크 `#010102` · 액센트 `#006DF7`(채운 파랑 버튼 금지 — 1차 버튼은 잉크 채움, 2차는 코너 브래킷) · 경고 `#D1352B` 글자만 · 청록 `#0FA9A0` AI 결과 전용 · 앰버 `#FFB633` 탐지 순간 380ms 만 · 라운드 0 · 그림자 0 · 그라디언트 0 · 유리 0 · 이징 `cubic-bezier(0.15,1,0.3,1)` 하나 · 지속 500/750/1000/1250ms 만 · 호버 180ms 물리 반응 · 텍스트 인 600/60 스태거 · 숫자 글자별 40ms · 이미지 clip-path 1s · 유휴 화면당 1개 ≥ 6s · `prefers-reduced-motion` 정지. 토큰은 `shell.css :root`(`--ink --grey --line --accent --teal --warn --t1 --t2 --ease --d1..--d4 --hov --hove`).
8. **사용자 기준**: "딱딱한 업무 시스템 목업" 금지 · **동작하는 화면으로 판단** · 말만 하는 버튼 0(실동작 또는 `disabled` + '준비 중 · 이유').
9. 셸 부품은 `landxi/proto/shell.js` 것을 쓴다: `mountShell` `say` `openModal` `confirmDialog` `mountPager` `bindRows` `allowed` `ROLE` `AS_OF` `logout` `esc` `icon` `nf` `ymd`. 화면 안에 `if (ROLE === 'admin')` 분기를 쓰지 않는다 — `allowed(cap)` · `roles.js` 선언만 읽는다(R5).

## 세션 계약 (MASTER-PLAN §7 — 요약 · 정본은 §7)

| 키 | 값 | 규칙 |
|---|---|---|
| `lx_logged_in` | `'1'` | LX 세션 |
| `lx_role` | `'admin' \| 'staff' \| 'sales'` | LX 세션 |
| `lx_tenant_session` | `{"tenant":"namwon","at":"<ISO>"}` JSON | 기관 세션 |

- LX signIn = `lx_logged_in` · `lx_role` 세우고 **`lx_tenant_session` 제거**. 기관 signIn = `lx_tenant_session` 세우고 **`lx_logged_in` · `lx_role` 제거**. signOut = 세 키 전부 제거. 두 세션이 동시에 있으면 손상 → 전부 지우고 `login.html`.
- 기관 홈(임시): `namwon → portal.html` · `gwangju-jeonnam → portal-dp-gj-marine-25.html`. 기관 문: `portal-login-<tenant>.html`.
- 화면의 자체 로그아웃 코드(대시보드 · 데이터 관리)는 삭제하고 셸 `logout()` 만 쓴다.

## 역할 픽스처 코드 — **자기 spec 파일 안에 그대로 복사**(Wave 0 동안 `_roles.mjs` import 금지 · 병렬 충돌 방지)

```js
const HOME = { admin: 'admin-home.html', staff: 'ai-project.html', sales: 'ximap.html' };
const TENANT_HOME = { namwon: 'portal.html', 'gwangju-jeonnam': 'portal-dp-gj-marine-25.html' };
const TENANT_DOOR = { namwon: 'portal-login-namwon.html', 'gwangju-jeonnam': 'portal-login-gwangju-jeonnam.html' };
/** LX 세션으로 화면을 연다. 세션은 첫 로드에서만 심는다(sessionStorage 가드). */
async function bootAs(page, url, role = 'staff', extra = {}) {
  await page.addInitScript(([r, ex]) => {
    if (sessionStorage.getItem('lx_e2e_boot')) return;
    sessionStorage.setItem('lx_e2e_boot', '1');
    localStorage.setItem('lx_logged_in', '1');
    localStorage.setItem('lx_role', r);
    localStorage.removeItem('lx_tenant_session');
    for (const [k, v] of Object.entries(ex)) (v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v));
  }, [role, extra]);
  await page.goto(url);
  await page.waitForFunction(() => document.documentElement.dataset.shell === 'ready');
}
/** 기관 세션으로 화면을 연다. */
async function bootTenant(page, url, tenant = 'namwon') {
  await page.addInitScript((t) => {
    if (sessionStorage.getItem('lx_e2e_boot')) return;
    sessionStorage.setItem('lx_e2e_boot', '1');
    localStorage.removeItem('lx_logged_in'); localStorage.removeItem('lx_role');
    localStorage.setItem('lx_tenant_session', JSON.stringify({ tenant: t, at: '2026-06-08T09:00:00+09:00' }));
  }, tenant);
  await page.goto(url);
  await page.waitForFunction(() => document.documentElement.dataset.shell === 'ready');
}
/** 같은 탭에서 LX 계정을 바꾼다(역할 전환 e2e). 다음 goto 부터 적용. */
const switchTo = (page, role) => page.evaluate((r) => {
  localStorage.setItem('lx_logged_in', '1'); localStorage.setItem('lx_role', r); localStorage.removeItem('lx_tenant_session');
}, role);
```

기존 스펙의 `boot()` 를 이 `bootAs` 로 바꿀 때 화면별 기본 역할: `map` `analysis` `project` `dashboard` `dataset` `support` = `staff` · `usecase` = `sales` · `admin-*` `admin-publish` `ai-card*` `produce` = `admin` · `portal*` = `bootTenant('namwon')`. 스펙이 추가로 기다리던 것(`dataset.map === 'ready'` 등)은 그대로 둔다. `?next=` 관문 검사 등 **세션 없이 시작하는 테스트는 `page.goto` 그대로**(가드 때문에 `bootAs` 뒤에는 세션 없는 상태를 만들 수 없다 — 그런 테스트는 새 `page` 로).

## 스크린샷 · 모션 캡처 규약

- 정지 스크린샷: `shots/w0/<ID>/<번호>-<이름>-<폭>.png` — Playwright `page.screenshot({ fullPage: false })`. 폭은 브리프가 정한다(기본 1440×900).
- **모션(움직임이 있는 에픽 — E0-S 필수, 다른 에픽은 모션을 만들었을 때만)**: 100ms 간격 프레임 ≥ 8장 `<이름>-frame-00.png …` 스트립 + Playwright `test.use({ video: 'on' })` 또는 `browser.newContext({ recordVideo: { dir, size: {width:1440,height:900} } })` 로 5–10s webm 1편. 프레임 사이 픽셀이 실제로 다른지(연속 2장 동일 0) 스펙에서 단언한다.
- 재촬영이 요구된 스크린샷(`x22` 등)은 감사 스크립트(`shots/audit-0923/<영역>/*.mjs`)를 **복사해** `shots/w0/<ID>/` 에서 돌린다(원본 스크립트는 수정 금지).

## 결과 문서

- 경로 `docs/superpowers/audit-0923/wave0/<ID>-result.md`. 절: ① 한 줄 결과 ② 완료 기준 항목별 증거(파일:줄 · 스크린샷 · spec 결과 줄) ③ `git diff --stat` ④ 소유 밖 **요청**(파일:줄 · 값 · 이유 · 받는 에픽) ⑤ 남은 것 · 알려진 결손. 하네스가 `.md` 쓰기를 거부하면 같은 내용을 구조화 결과 본문에 담아 반환한다(R11).
- 완료 선언 전에 `superpowers:verification-before-completion` 규칙: 완료 기준의 명령을 **실제로 돌린 출력**을 첨부한다. 자평 금지.
