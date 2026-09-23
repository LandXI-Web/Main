import { chromium } from '@playwright/test';
const b = await chromium.launch({ channel: 'chrome' });
const errs = [];
for (const [w, h] of [[1440, 900], [1280, 720]]) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  p.on('pageerror', (e) => errs.push(e.message));
  await p.addInitScript(() => { localStorage.setItem('lx_logged_in', '1'); localStorage.setItem('lx_role', 'staff'); });
  await p.goto('http://localhost:4173/landxi/proto/ximap.html');
  await p.waitForFunction(() => document.querySelector('#map-a')?.dataset.map === 'ready', null, { timeout: 30000 });
  await p.locator('input[data-layer="namwon-farmland-2025"]:not([data-sub])').check();
  await p.waitForFunction(() => window.__lxMap?.A?.getSource('namwon-farmland-2025'), null, { timeout: 20000 });
  await p.locator('#mb-open').click();
  await p.locator('#tbody tr[data-row]').first().click();
  await p.waitForTimeout(1200);
  const r = await p.evaluate(() => { const c = document.querySelector('#map-a canvas').getBoundingClientRect(), m = document.querySelector('#mw').getBoundingClientRect(), t = [...document.querySelectorAll('.mb-t [data-ttab]')].map((x) => { const q = x.getBoundingClientRect(); return [Math.round(q.width), Math.round(q.height)]; });
    return { canvas: [c.width, c.height], mw: [m.width, m.height], ratio: (c.width * c.height) / (m.width * m.height), left: document.querySelector('#mw-l').getBoundingClientRect().width, mb: document.querySelector('#mb').getBoundingClientRect().height, tabs: t }; });
  console.log(w, h, JSON.stringify(r));
  await p.close();
}
console.log('errs', errs);
await b.close();
