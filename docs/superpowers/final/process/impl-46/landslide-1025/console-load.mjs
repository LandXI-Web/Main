// LX 직원 대시보드 첫 열림 재기(10-25 검사 문 'main 이 안 보임') — 바깥 주소 · 로그인 폼 · 5번 · 느린 요청
import { chromium } from 'playwright';
import { frontDoor } from '../../../../../../landxi/v3/kit/lint/forbidden.mjs';
import fs from 'node:fs';
const [BASE = 'https://app.land-xi.dev', N = '5'] = process.argv.slice(2);
const out = { runs: [] };
const br = await chromium.launch();
for (let i = 0; i < +N; i++) {
  const ctx = await br.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const reqs = new Map(), slow = [];
  page.on('request', (r) => reqs.set(r, Date.now()));
  page.on('requestfinished', (r) => { const t = Date.now() - (reqs.get(r) || Date.now()); if (/\/api\//.test(r.url())) slow.push([t, r.url().replace(/^.*\/api\/v1/, '').slice(0, 90)]); });
  await frontDoor(page, BASE, 'test@lx.or.kr', 'app');
  const t0 = Date.now();
  await page.goto(BASE + '/landxi/v3/lx-console/', { waitUntil: 'domcontentloaded' });
  let main = null;
  try { await page.waitForSelector('main', { timeout: 60000 }); main = Date.now() - t0; } catch { main = 'timeout'; }
  await page.waitForTimeout(1500);
  slow.sort((a, b) => b[0] - a[0]);
  out.runs.push({ i, main_ms: main, mainCount: await page.locator('main').count(), slow: slow.slice(0, 6) });
  console.log(JSON.stringify(out.runs.at(-1)));
  await ctx.close();
}
fs.writeFileSync(new URL('./console-load.json', import.meta.url), JSON.stringify(out, null, 1));
await br.close();
