// 정지 화면 1280/1440/1920 × 장면 — node shots/f1/D/_tools/stills.mjs
import { chromium } from '@playwright/test';
import fs from 'node:fs';
const O = 'shots/f1/D/still/';
fs.mkdirSync(O, { recursive: true });
const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const out = {};
for (const [w, h] of [[1280, 800], [1440, 900], [1920, 1080]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h } });
  await ctx.addInitScript(() => { localStorage.setItem('lx_api_mode', 'off'); localStorage.setItem('lx_logged_in', '1'); localStorage.setItem('lx_role', 'staff'); });
  const p = await ctx.newPage();
  const errs = [];
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
  p.on('pageerror', (e) => errs.push('pageerror ' + e.message));
  await p.goto('http://localhost:4173/landxi/global/index.html?tenant=lx&locale=en');
  await p.waitForFunction(() => document.documentElement.dataset.lx === 'ready', null, { timeout: 30000 });
  await p.waitForTimeout(5000);
  await p.screenshot({ path: `${O}globe-${w}.png` });
  await p.evaluate(() => window.__f1d.go('ysykata')); await p.waitForTimeout(6000);
  await p.evaluate(async () => { const y = window.__f1d.scenes.ys; y.frame(); await y.quote(); y.run(); }); await p.waitForTimeout(13000);
  await p.screenshot({ path: `${O}ysykata-gj1-${w}.png` });
  await p.evaluate(() => window.__f1d.go('sokuluk')); await p.waitForTimeout(4000);
  await p.evaluate(async () => { const k = window.__f1d.scenes.sk; k.grid(true); await k.filament(true); }); await p.waitForTimeout(2500);
  await p.screenshot({ path: `${O}sokuluk-${w}.png` });
  await p.evaluate(() => window.__f1d.go('meiktila')); await p.waitForTimeout(9000);
  await p.evaluate(() => window.__f1d.scenes.mk.swipeOn(55)); await p.waitForTimeout(3000);
  await p.screenshot({ path: `${O}meiktila-${w}.png` });
  // 캔버스 점유율 · 14px 미만 글자
  const m = await p.evaluate(() => {
    const c = document.querySelector('.maplibregl-canvas'); const r = c.getBoundingClientRect();
    let small = 0; for (const el of document.querySelectorAll('body *')) { if (!el.childNodes.length) continue; const t = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()); if (!t) continue; const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') continue; if (parseFloat(cs.fontSize) < 14 && el.getClientRects().length) small++; }
    return { canvas_pct: +(100 * r.width * r.height / (innerWidth * innerHeight)).toFixed(1), small_lt14: small };
  });
  out[w] = { ...m, perf: await p.evaluate(() => window.__f1d.perf()), errors: errs };
  await ctx.close();
}
await b.close();
fs.writeFileSync(O + 'stills-meta.json', JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
