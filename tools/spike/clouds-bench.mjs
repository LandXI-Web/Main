import { chromium } from '@playwright/test';
import fs from 'node:fs';
const PORT = process.env.PORT || 4181;
const OUT = 'shots/spikes/clouds';
fs.mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ channel: 'chrome', args: ['--use-gl=angle','--enable-gpu','--ignore-gpu-blocklist','--disable-gpu-vsync'] });
const page = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5 });
const errs = [];
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0,300)); });
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message.slice(0,400)));
page.on('requestfailed', (r) => errs.push('reqfail: ' + r.url().slice(0,160)));
page.on('response', (r) => { if (r.status() >= 400) errs.push('http' + r.status() + ': ' + r.url().slice(0,160)); });
await page.goto(`http://localhost:${PORT}/landxi/proto/spikes/clouds/`, { waitUntil: 'domcontentloaded' });
try { await page.waitForSelector('body[data-ready="1"]', { timeout: 180000 }); }
catch { console.log('NOT READY. note=', await page.textContent('#note').catch(()=>'')); }
await page.waitForTimeout(1500);

console.log('renderer:', await page.evaluate(() => { const c=document.createElement('canvas'); const g=c.getContext('webgl2'); const d=g.getExtension('WEBGL_debug_renderer_info'); return d?g.getParameter(d.UNMASKED_RENDERER_WEBGL):'?'; }));
console.log('sunElev:', await page.evaluate(() => window.__spike?.sunElevDeg?.().toFixed(1)));
const PS = (process.env.PS || '0.05,0.10,0.18,0.24,0.28,0.32,0.40,0.60').split(',').map(Number);
const table = [];
for (const t of [1,2,3,4]) {
  await page.evaluate((n) => window.__spike.setTech(n), t);
  for (const p of PS) {
    await page.evaluate((v) => window.__spike.seek(v), p);
    await page.waitForTimeout(1400);
    const s = await page.evaluate(() => window.__spike.benchFrames(90));
    table.push({ tech: t, p, ...(s || {}) });
    await page.screenshot({ path: `${OUT}/t${t}-p${String(p).replace('.','')}.png` });
    if (t === 1) await page.evaluate(() => window.__spike.setTech(1));
    console.log(`t${t} p=${p}`, JSON.stringify(s));
  }
}
fs.writeFileSync(`${OUT}/fps.json`, JSON.stringify(table, null, 1));
console.log('--- errors ---'); console.log([...new Set(errs)].slice(0,25).join('\n') || '(none)');
await b.close();
