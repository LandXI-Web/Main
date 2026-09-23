// 비평자 재확인 2 — 정보 판 열림 상태의 지도 몫과 하단 표 (1440×900 · 1920×1080). 읽기 전용.
import { chromium } from '@playwright/test';
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const OUT = path.dirname(fileURLToPath(import.meta.url));
const BASE = 'http://localhost:4173/landxi/proto/';
const R = {}; const log = (k, v) => { R[k] = v; console.log('·', k, JSON.stringify(v).slice(0, 400)); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const share = (p) => p.evaluate(() => { const c = document.querySelector('#map-a canvas'); const r = c.getBoundingClientRect(); const w = innerWidth - 72, h = innerHeight - 64 - 36; return { canvasW: Math.round(r.width), canvasH: Math.round(r.height), pctArea: Math.round((r.width * r.height) / (w * h) * 100) }; });
for (const vp of [{ width: 1440, height: 900 }, { width: 1920, height: 1080 }]) {
  const c = await browser.newContext({ viewport: vp });
  await c.addInitScript(() => { localStorage.setItem('lx_logged_in', '1'); localStorage.setItem('lx_role', 'staff'); });
  const p = await c.newPage();
  await p.goto(BASE + 'ximap.html?on=namwon-farmland-2025&fold=0'); await p.waitForFunction(() => window.__lxMap?.A?.loaded?.(), null, { timeout: 30000 }); await wait(3000);
  const k = vp.width;
  log(`${k}.tableOpen.share`, await share(p));
  const rows = await p.evaluate(() => { const tb = document.querySelector('#tbody'); if (!tb) return null; const all = [...tb.querySelectorAll('tr')]; const vis = all.filter((tr) => { const r = tr.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight - 36; }); return { rows: all.length, fullyVisible: vis.length }; });
  log(`${k}.tableOpen.rows`, rows);
  await p.locator('#tbody tr[data-row]').first().click(); await wait(1800);
  log(`${k}.infoSide.share`, await share(p));
  const stack = await p.evaluate(() => { const els = [...document.querySelectorAll('#mb-b button, .mb button, .mb-tabs button, .mb-crumb *')].filter((e) => e.getBoundingClientRect().width > 0 && e.textContent.trim().length >= 3); const narrow = els.filter((e) => { const r = e.getBoundingClientRect(); return r.height > r.width * 1.5; }); return { textEls: els.length, tallerThanWide: narrow.length, sample: narrow.slice(0, 5).map((e) => e.textContent.trim().slice(0, 12)) }; });
  log(`${k}.infoSide.verticalStack`, stack);
  const left = await p.evaluate(() => ({ left: document.querySelector('#mw').dataset.left, side: document.querySelector('#mw').dataset.side, leftW: Math.round(document.querySelector('.mw-l').getBoundingClientRect().width), sideW: Math.round(document.querySelector('#side').getBoundingClientRect().width) }));
  log(`${k}.infoSide.panels`, left);
  await p.screenshot({ path: path.join(OUT, `crit-05-info-${k}.png`) });
  await c.close();
}
fs.writeFileSync(path.join(OUT, 'critique2.json'), JSON.stringify(R, null, 2));
await browser.close();
