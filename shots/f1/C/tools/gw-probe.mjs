// 게이트웨이 직결 모드 점검(lx_ops_src=gateway) — F1-B 게이트웨이가 관제 경로 13개를 모두 200 으로 줄 때 다섯 화면이 콘솔 오류 0 으로 뜨는가.
//   LX_GW=http://localhost:8712 node shots/f1/C/tools/gw-probe.mjs   (serve-ops 는 LX_GATEWAY 를 같은 값으로 기동)
import { chromium } from 'playwright';
import fs from 'node:fs';
const OPS = 'http://localhost:8702'; const GW = process.env.LX_GW || 'http://localhost:8700'; const PW = process.env.DEV_PASSWORD || 'landxi-dev-2026';
const s = await (await fetch(GW + '/api/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ realm: 'lx', login: 'lx-admin', password: PW }) })).json();
if (!s.token) { console.log('login fail', JSON.stringify(s)); process.exit(1); }
const b = await chromium.launch({ channel: 'chrome' });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(([s, base]) => { localStorage.setItem('lx_ops_src', 'gateway'); localStorage.setItem('lx_ops_base', base); localStorage.setItem('lx_api_base', base); localStorage.setItem('lx_api_session', JSON.stringify(s)); }, [s, GW + '/api/v1'.replace('/api/v1', '')]);
const p = await ctx.newPage(); const out = {};
for (const pg of ['index', 'infra', 'tenants', 'deploys']) {
  const errs = []; const on = (m) => m.type() === 'error' && errs.push(m.text()); p.on('console', on); p.on('pageerror', (e) => errs.push(String(e)));
  await p.goto(`${OPS}/landxi/ops/${pg}.html`); await p.waitForFunction(() => document.documentElement.dataset.lx === 'ready', null, { timeout: 20000 }).catch(() => errs.push('not ready'));
  await p.waitForTimeout(4000);
  out[pg] = { src: await p.evaluate(() => document.documentElement.dataset.src), mast: await p.locator('.og-src, [data-k="src"]').first().textContent().catch(() => null), errs };
  if (pg === 'infra') await p.screenshot({ path: 'shots/f1/C/stills/gateway-direct-infra-1440.png' });
  p.off('console', on);
}
fs.writeFileSync('shots/f1/C/logs/gw-probe.json', JSON.stringify({ gw: GW, at: new Date().toISOString(), out }, null, 1));
console.log(JSON.stringify(out, null, 1)); await b.close();
