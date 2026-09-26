// 정지 화면 1280/1440/1920 × 5화면(브리지 실측) + off 모드 1440 + 레퍼런스(Vantor · Blueprint dark) 캡처
import { chromium } from 'playwright';
import fs from 'node:fs';
const OUT = 'shots/f1/C/stills'; fs.mkdirSync(OUT, { recursive: true });
const OPS = 'http://localhost:8702'; const B = OPS + '/landxi/ops/bridge'; const PW = process.env.DEV_PASSWORD || 'landxi-dev-2026';
const b = await chromium.launch({ channel: 'chrome' });
const s = await (await fetch(B + '/api/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ realm: 'lx', login: 'lx-admin', password: PW }) })).json();
for (const W of [1280, 1440, 1920]) {
  const H = W === 1920 ? 1080 : W === 1440 ? 900 : 800;
  const ctx = await b.newContext({ viewport: { width: W, height: H } }); const p = await ctx.newPage();
  await p.goto(OPS + '/landxi/ops/login.html?stay'); await p.waitForFunction(() => document.documentElement.dataset.lx === 'ready'); await p.waitForTimeout(2500);
  await p.screenshot({ path: `${OUT}/login-${W}.png` });
  await p.evaluate(([s, base]) => { localStorage.setItem('lx_api_session', JSON.stringify(s)); localStorage.setItem('lx_ops_base', base); localStorage.setItem('lx_api_base', base); }, [s, B]);
  for (const pg of ['index', 'infra', 'tenants', 'deploys']) {
    await p.goto(`${OPS}/landxi/ops/${pg}.html`); await p.waitForFunction(() => document.documentElement.dataset.lx === 'ready'); await p.waitForTimeout(3500);
    await p.screenshot({ path: `${OUT}/${pg}-${W}.png` });
  }
  await ctx.close();
}
{ const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }); const p = await ctx.newPage();
  await p.addInitScript(() => { localStorage.setItem('lx_api_mode', 'off'); localStorage.setItem('lx_logged_in', '1'); localStorage.setItem('lx_role', 'admin'); });
  for (const pg of ['infra', 'deploys']) { await p.goto(`${OPS}/landxi/ops/${pg}.html`); await p.waitForFunction(() => document.documentElement.dataset.lx === 'ready'); await p.waitForTimeout(3000); await p.screenshot({ path: `${OUT}/off-${pg}-1440.png` }); }
  await ctx.close(); }
for (const [name, url] of [['ref-vantor', 'https://vantor.com/'], ['ref-blueprint-dark', 'https://blueprintjs.com/docs/#core/components/card']]) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' }); const p = await ctx.newPage();
  try { await p.goto(url, { timeout: 30000, waitUntil: 'domcontentloaded' }); await p.waitForTimeout(5000);
    if (name.includes('blueprint')) await p.evaluate(() => document.body.classList.add('bp5-dark', 'bp4-dark'));
    await p.screenshot({ path: `${OUT}/${name}.png` }); } catch (e) { console.log('ref fail', name, e.message); }
  await ctx.close();
}
await b.close(); console.log('stills done');
