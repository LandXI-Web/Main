// 기관 결과 지도(1280)에서 결과 카드 × 대화 입력줄 겹침을 API 지연을 바꿔 가며 잼(로그인 한 번)
import path from 'node:path'; import fs from 'node:fs'; import { pathToFileURL } from 'node:url';
const ROOT = 'E:/Land-XI 플랫폼/01. 디자인'; process.chdir(ROOT);
process.env.LX_PW ||= fs.readFileSync(ROOT + '/server/.env', 'utf8').match(/^DEV_PASSWORD=(.*?)\s*$/m)?.[1];
const { launch, login } = await import(pathToFileURL(path.join(ROOT, 'tools/check/common.mjs')).href);
const ov = await import(pathToFileURL(path.join(ROOT, 'tools/check/overlap.mjs')).href);
const OUT = process.argv[2]; fs.mkdirSync(OUT, { recursive: true });
const b = await launch(); const s = await login(b, 'gov'); const page = s.page;
await page.setViewportSize({ width: 1280, height: 720 });
await page.goto(s.home + '/landxi/v3/gov-select/?list=1', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__govSelect?.ready, null, { timeout: 30000 });
const card = await page.evaluate(() => { const g = window.__govSelect.groups || []; return (g[0]?.cards || [])[0] || (window.__govSelect.services || [])[0]; });
await page.goto(s.home + '/landxi/v3/gov-select/?service=' + encodeURIComponent(card), { waitUntil: 'domcontentloaded' });
const a = page.locator('.gs-tabs a[href*="xi-clean"]').first(); await a.waitFor({ timeout: 30000 });
const u = new URL(await a.getAttribute('href'), page.url()); const map = s.home + u.pathname + u.search;
for (const delay of [0, 800, 2000, 3500, 0, 1500]) {
  await page.unrouteAll?.();
  if (delay) await page.route('**/api/**', async (r) => { await new Promise((z) => setTimeout(z, delay)); r.continue().catch(() => {}); });
  await page.goto(map, { waitUntil: 'domcontentloaded' }); await page.waitForSelector('.xc-tools', { timeout: 60000 }).catch(() => {});
  for (const t of [1500, 4000, 7000]) { await page.waitForTimeout(t === 1500 ? 1500 : 2500 + (t === 7000 ? 0 : 0));
    const r = await page.evaluate(() => { const q = (sel) => document.querySelector(sel)?.getBoundingClientRect(); const a = q('.k-ck-f.k-chat-in'), c = q('.gx-card');
      if (!a || !c) return { a: !!a, c: !!c }; const w = Math.min(a.right, c.right) - Math.max(a.left, c.left), h = Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top);
      return { card: [c.left, c.top, c.right, c.bottom].map(Math.round), input: [a.left, a.top, a.right, a.bottom].map(Math.round), ov: w > 0 && h > 0 ? `${Math.round(w)}x${Math.round(h)}` : 0, fold: document.querySelector('.gx-card')?.classList.contains('is-fold') }; });
    console.log('delay', delay, 't', t, JSON.stringify(r)); }
}
await s.ctx.close(); await b.close();
