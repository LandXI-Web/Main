// F2-D · 관제 실링크(계약 v1.1-29) — 결과 카드 'Ops lineage →' = :8702 관제 login.html?next=infra.html?job=<id>(관리자 세션이면 곧바로 행 펼침) ·
// 'XI map · KR ↗' 에는 ?job= 을 붙이지 않는다(판정 2차: XI맵이 글로벌 index 작업을 복원하지 못해 남원 계보 = 죽은 딥링크 · F2-A 요청) · 기관 화면(Global)이 ?job= 을 받으면 그 작업의 결과 절을 연다. off(리플레이) = 정직한 결손 칩.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const GW = 'http://localhost:8700';
const pw = () => process.env.DEV_PASSWORD || (fs.existsSync('server/.env') ? (fs.readFileSync('server/.env', 'utf8').match(/^DEV_PASSWORD=(.*)$/m) || [])[1]?.trim() : null);
async function gateway() { try { return (await (await fetch(GW + '/api/v1/health', { signal: AbortSignal.timeout(1500) })).json()).ok; } catch { return false; } }
async function login(body) { return (await fetch(GW + '/api/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json(); }
function watch(page) {
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/CORS policy|net::ERR_FAILED|ERR_CONNECTION_RESET|ERR_HTTP2_SERVER_REFUSED_STREAM|ERR_NO_BUFFER_SPACE/.test(m.text()) && !/:8702/.test(m.location()?.url || '')) errs.push(m.text()); });
  page.on('pageerror', (e) => { if (!/:8702/.test(page.url())) errs.push('pageerror ' + e.message); });
  return errs;
}

test.describe('F2-D ops lineage link', () => {
  test.setTimeout(150000);

  test('off(리플레이) — 기록 job 은 관제에 없다 → 링크 0 · 결손 칩 · 계보 3마디(fx/lineage · 영문)', async ({ page }) => {
    const errs = watch(page);
    await page.addInitScript(() => { if (sessionStorage.getItem('b')) return; sessionStorage.setItem('b', 1); localStorage.setItem('lx_api_mode', 'off'); localStorage.setItem('lx_logged_in', '1'); localStorage.setItem('lx_role', 'staff'); });
    await page.goto('/landxi/global/index.html?tenant=lx&locale=en');
    await page.waitForFunction(() => document.documentElement.dataset.lx === 'ready');
    await page.evaluate(() => window.__f1d.go('ysykata'));
    await page.evaluate(async () => { const y = window.__f1d.scenes.ys; y.frame(); await y.quote(); y.run({ speed: 200 }); });
    await page.waitForSelector('#ys-next');
    await expect(page.locator('#ys-next a.g-lineage__ops')).toHaveCount(0);
    await expect(page.locator('#ys-next .g-lineage__wait')).toContainText('live runs only');
    await expect(page.locator('#ys-next .xi-ln i')).toHaveText(['deploy', 'tenant', 'job']);
    expect(errs).toEqual([]);
  });

  test('on — ?job=<완료 index 작업> → 결과 절 열림 · 분포(서버) · Ops lineage → 관제 infra.html?job= 행 초점 · XI map 링크에 ?job= 0', async ({ page, context }) => {
    test.skip(!(await gateway()) || !pw(), '게이트웨이 :8700 · DEV_PASSWORD 필요');
    const errs = watch(page);
    const staff = await login({ realm: 'lx', login: 'lx-staff', password: pw() });
    const admin = await login({ realm: 'lx', login: 'lx-admin', password: pw() });
    const list = await (await fetch(GW + '/api/v1/jobs?limit=200', { headers: { authorization: 'Bearer ' + admin.token } })).json();
    const job = (list.items || []).find((j) => j.kind === 'index' && j.state === 'done' && j.deploy_id === 'dp-kgz-agri-farm-26');
    test.skip(!job, '완료된 index 작업 없음');
    await context.addInitScript(([s, a, gw]) => {
      if (location.port === '8702') { localStorage.setItem('lx_api_base', gw); localStorage.setItem('lx_ops_base', gw); localStorage.setItem('lx_api_session', JSON.stringify(a)); return; }
      if (sessionStorage.getItem('b')) return; sessionStorage.setItem('b', 1);
      localStorage.setItem('lx_api_base', gw); localStorage.removeItem('lx_api_mode'); localStorage.setItem('lx_api_session', JSON.stringify(s)); localStorage.setItem('lx_logged_in', '1'); localStorage.setItem('lx_role', 'staff');
    }, [staff, admin, GW]);
    await page.goto(`/landxi/global/index.html?tenant=lx&locale=en&job=${job.id}`);
    await page.waitForFunction(() => document.documentElement.dataset.lx === 'ready');
    await page.waitForSelector('#ys-next #ys-table:not([hidden])', { timeout: 60000 });
    const st = await page.evaluate(() => ({ ops: document.querySelector('a.g-lineage__ops')?.getAttribute('href'), xi: document.querySelector('.g-go a[data-go="xi"]')?.href, dist: [...document.querySelectorAll('.g-slot')].filter((s) => s.dataset.dist === 'on').length, rows: document.querySelectorAll('#ys-table tr').length, tenant: [...document.querySelectorAll('.xi-ln b')].map((b) => b.textContent) }));
    expect(st.ops).toBe(`http://localhost:8702/landxi/ops/login.html?next=${encodeURIComponent('infra.html?job=' + job.id)}`);
    expect(st.xi).not.toContain('job=');   // 죽은 딥링크 0(XI맵이 kind=index · dp-kgz-* 를 복원하면 되살린다)
    expect(st.rows).toBe(9);
    expect(st.dist).toBe(8);
    expect(st.tenant).toContain(job.tenant_id);
    await page.click('a.g-lineage__ops');
    await page.waitForURL(/:8702\/landxi\/ops\/infra\.html\?job=/, { timeout: 20000 });
    await page.waitForSelector(`[data-job="${job.id}"]`, { timeout: 30000 });
    await expect(page.locator(`[data-job="${job.id}"]`).first()).toHaveClass(/is-focus/);
    fs.mkdirSync('shots/f2/D/still', { recursive: true });
    await page.screenshot({ path: 'shots/f2/D/still/ops-lineage-row-1440.png' });
    await page.goBack();
    await page.waitForFunction(() => document.documentElement.dataset.lx === 'ready', null, { timeout: 30000 });
    expect(page.url()).toContain(`job=${job.id}`);
    expect(errs).toEqual([]);
  });
});
