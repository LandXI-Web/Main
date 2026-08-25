import { chromium } from '@playwright/test';
import fs from 'node:fs';
const PORT = process.env.PORT || 4181;
const OUT = 'shots/spikes/clouds/film'; fs.mkdirSync(OUT, { recursive: true });
const TS = (process.env.TS || '0,0.35,0.5,0.6,0.66,0.72,0.85,1').split(',').map(Number);
const TECH = Number(process.env.TECH || 2);
const b = await chromium.launch({ channel: 'chrome', args: ['--use-gl=angle','--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
await p.goto(`http://localhost:${PORT}/landxi/proto/spikes/clouds/`, { waitUntil: 'domcontentloaded' });
await p.waitForSelector('body[data-ready="1"]', { timeout: 180000 });
await p.evaluate((n) => { window.__spike.setTech(n); window.__spike.clean(true); }, TECH);
await p.waitForTimeout(1000);
for (const t of TS) {
  await p.evaluate((v) => window.__spike.film(v), t);
  const t0 = Date.now();
  while (Date.now() - t0 < 15000) {
    if (await p.evaluate(() => { const m = window.__map; return m.loaded() && m.areTilesLoaded(); })) break;
    await p.waitForTimeout(70);
  }
  await p.evaluate((v) => window.__spike.film(v), t);
  await p.waitForTimeout(120);
  await p.screenshot({ path: `${OUT}/t${TECH}-${String(t).replace('.','_')}.png` });
  const st = await p.evaluate((v) => window.__spike.filmState(v), t);
  console.log('t=' + t, 'alt=' + st.alt.toFixed(1) + 'km');
}
await b.close();
