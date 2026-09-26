import { chromium } from 'playwright';
const b = await chromium.launch({ channel: 'chrome' });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(() => { localStorage.setItem('lx_logged_in', '1'); localStorage.setItem('lx_role', 'staff'); localStorage.setItem('lx_api_mode', 'off'); });
const p = await ctx.newPage();
await p.setViewportSize({ width: 560, height: 820 });
await p.goto('http://localhost:4173/landxi/proto/stats-standard.html?embed=1&period=2025');
await p.waitForTimeout(3500);
const out = await p.evaluate(() => {
  const walk = (el, d) => { if (d > 4) return []; const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); const line = `${'  '.repeat(d)}${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : ''} [${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}] ${cs.position}`; return [line, ...[...el.children].flatMap((c) => walk(c, d + 1))]; };
  return walk(document.body, 0).join('\n');
});
console.log(out);
await p.screenshot({ path: 'shots/f1/A/raw/probe-drawer.png' });
await b.close();
