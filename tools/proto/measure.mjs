import { chromium } from '@playwright/test';
const b = await chromium.launch({ channel: 'chrome' });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto('http://localhost:4173/landxi/proto/dive.html', { waitUntil: 'domcontentloaded' });
await p.waitForSelector('body[data-ready="1"]', { timeout: 120000 });
await p.evaluate(() => window.__dive.seek(0.90));
await p.waitForTimeout(4000);
const out = await p.evaluate(() => {
  const g = (s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return [Math.round(r.top), Math.round(r.height)]; };
  const blocks = [...document.querySelectorAll('.rb')].map((e,i)=>[i, e.scrollHeight, e.clientHeight]);
  return { left: g('#res-left'), lab: g('#res-lab'), menu: g('#res-menu'), blocks: g('#res-blocks'), cta: g('#cta'), rb: blocks };
});
console.log(JSON.stringify(out, null, 1));
await b.close();
