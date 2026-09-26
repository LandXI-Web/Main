import { chromium } from 'playwright';
const b = await chromium.launch({ channel: 'chrome' });
const ctx = await b.newContext({ viewport: { width: 560, height: 820 } });
await ctx.addInitScript(() => { localStorage.setItem('lx_logged_in', '1'); localStorage.setItem('lx_role', 'staff'); localStorage.setItem('lx_api_mode', 'off'); });
const p = await ctx.newPage();
for (const u of ['stats', 'report']) { await p.goto(`http://localhost:4173/landxi/proto/${u}-standard.html?embed=1`); await p.waitForTimeout(2000);
console.log(await p.evaluate(() => [...document.querySelectorAll('#side button, #side a')].filter((e) => /×|닫기|close/i.test(e.textContent + (e.getAttribute('aria-label') || ''))).map((e) => e.outerHTML.slice(0, 200)).join('\n'))); }
await b.close();
