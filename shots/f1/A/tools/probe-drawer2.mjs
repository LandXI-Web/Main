import { chromium } from 'playwright';
const CSS = process.argv[2];
const b = await chromium.launch({ channel: 'chrome' });
const ctx = await b.newContext({ viewport: { width: 560, height: 820 } });
await ctx.addInitScript(() => { localStorage.setItem('lx_logged_in', '1'); localStorage.setItem('lx_role', 'staff'); localStorage.setItem('lx_api_mode', 'off'); });
const p = await ctx.newPage();
for (const u of ['stats', 'report']) {
await p.goto(`http://localhost:4173/landxi/proto/${u}-standard.html?embed=1&period=2025`);
await p.waitForTimeout(2500);
await p.addStyleTag({ content: CSS });
await p.waitForTimeout(400);
console.log(await p.evaluate(() => ['#main', '#mw', '#side', '.mw-stage', '.dw', 'body'].map((s) => { const e = document.querySelector(s); if (!e) return s + ' -'; const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return `${s} [${r.x},${r.y} ${r.width}x${r.height}] pad ${cs.padding} m ${cs.margin} disp ${cs.display} grid ${cs.gridTemplateColumns}`; }).join('\n')));
await p.screenshot({ path: `shots/f1/A/raw/probe-${u}.png` });
}
await b.close();
