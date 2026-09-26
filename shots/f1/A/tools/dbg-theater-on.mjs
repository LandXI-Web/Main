// on 모드 theater 디버그 — 콘솔·이벤트 로그
import { chromium } from '@playwright/test';
const API = 'http://localhost:8700';
const r = await fetch(API + '/api/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ realm: 'lx', login: 'lx-staff', password: process.env.DEV_PASSWORD }) });
const s = await r.json();
const b = await chromium.launch({ channel: 'chrome' });
const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
page.on('console', (m) => console.log('[c]', m.type(), m.text().slice(0, 300)));
page.on('pageerror', (e) => console.log('[pe]', e.message));
page.on('requestfailed', (q) => console.log('[rf]', q.url().slice(0, 160), q.failure()?.errorText));
await page.addInitScript(([s, api]) => { localStorage.setItem('lx_api_base', api); localStorage.removeItem('lx_api_mode'); localStorage.setItem('lx_api_session', JSON.stringify(s)); localStorage.setItem('lx_logged_in', '1'); localStorage.setItem('lx_role', 'staff'); }, [s, API]);
await page.goto('http://localhost:4173/landxi/xi/index.html?cam=127.3524,35.5308,16.2,35,0&on=namwon-landcover-2023');
await page.waitForFunction(() => document.documentElement.dataset.restored === '1', null, { timeout: 60000 });
await page.click('#tool-rect');
const fr = await page.evaluate(() => { const X = window.__xi, A = X.CAMS.A01; const a = X.A.project([A[0] + 0.001, A[3] - 0.001]), b = X.A.project([A[2] - 0.001, A[1] + 0.0015]); return [a.x, a.y, b.x, b.y]; });
await page.mouse.move(fr[0], fr[1]); await page.mouse.down(); await page.mouse.move(fr[2], fr[3], { steps: 12 }); await page.mouse.up();
await page.waitForSelector('#quote-card .xi-run', { timeout: 15000 });
await page.click('#quote-card .xi-run');
for (let i = 0; i < 20; i++) {
  await page.waitForTimeout(1000);
  const st = await page.evaluate(() => ({ log: window.__xi.theater?.S.log.map((l) => l[0]).join(','), ph: window.__xi.PHASES.slice(-4).map((x) => x.p).join(','), job: document.getElementById('hud-job').textContent }));
  console.log(i, JSON.stringify(st));
  if (/snapshot/.test(st.ph)) break;
}
await b.close();
