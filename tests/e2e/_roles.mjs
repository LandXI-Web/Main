// 역할 픽스처 정본 — MASTER-PLAN.md §7.3 · wave0/00-COMMON.md 그대로.
// Wave 0 동안 각 스펙은 이 코드를 import 하지 않고 자기 파일 안에 그대로 복사해 쓴다
// (병렬 작업 중인 다른 에픽이 이 파일을 동시에 건드리면 충돌하므로). 통합 단계가
// 모든 스펙을 이 파일의 import 로 일원화한다 — 그때까지 이 파일의 함수 시그니처를
// 바꾸지 않는다(다른 스펙의 사본과 정확히 같은 계약을 유지해야 통합이 기계적이다).
export const HOME = { admin: 'admin-home.html', staff: 'ai-project.html', sales: 'ximap.html' };
export const TENANT_HOME = { namwon: 'portal.html', 'gwangju-jeonnam': 'portal-dp-gj-marine-25.html' };
export const TENANT_DOOR = { namwon: 'portal-login-namwon.html', 'gwangju-jeonnam': 'portal-login-gwangju-jeonnam.html' };

/** LX 세션으로 화면을 연다. 세션은 첫 로드에서만 심는다(sessionStorage 가드). */
export async function bootAs(page, url, role = 'staff', extra = {}) {
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
export async function bootTenant(page, url, tenant = 'namwon') {
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
export const switchTo = (page, role) => page.evaluate((r) => {
  localStorage.setItem('lx_logged_in', '1'); localStorage.setItem('lx_role', r); localStorage.removeItem('lx_tenant_session');
}, role);
