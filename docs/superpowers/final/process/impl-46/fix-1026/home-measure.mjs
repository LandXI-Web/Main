// 첫 화면(메인 대시보드) 불러오는 중 · API 응답 시간 재기. 사용: node home-measure.mjs <출력폴더> [역할,역할]  (역할 admin|app|gov)
import path from 'node:path'; import fs from 'node:fs'; import { pathToFileURL } from 'node:url';
const ROOT = 'E:/Land-XI 플랫폼/01. 디자인';
process.chdir(ROOT);
const fsx = fs.readFileSync(ROOT + '/server/.env', 'utf8').match(/^DEV_PASSWORD=(.*?)\s*$/m); process.env.LX_PW ||= fsx?.[1];
const { launch, login } = await import(pathToFileURL(path.join(ROOT, 'tools/check/common.mjs')).href);
const OUT = process.argv[2]; fs.mkdirSync(OUT, { recursive: true });
const roles = (process.argv[3] || 'admin,app,gov').split(',');
const b = await launch(); const all = {};
for (const role of roles) {
  let s; try { s = await login(b, role); } catch (e) { console.log(role, 'LOGIN FAIL', e.message); continue; }
  const page = s.page; const reqs = new Map(); const t0 = Date.now();
  page.on('request', (r) => { if (/\/api\//.test(r.url())) reqs.set(r, { url: r.url().replace(/^https?:\/\/[^/]+/, '').slice(0, 110), start: Date.now() - t0 }); });
  page.on('requestfinished', async (r) => { const x = reqs.get(r); if (x) { x.end = Date.now() - t0; try { x.bytes = (await r.sizes()).responseBodySize; } catch {} } });
  page.on('requestfailed', (r) => { const x = reqs.get(r); if (x) x.fail = true; });
  const loadSeen = []; let t1 = Date.now();
  await page.goto(s.page.url(), { waitUntil: 'domcontentloaded' }); const t00 = Date.now(); reqs.clear();
  const poll = setInterval(async () => { try { const n = await page.evaluate(() => [...document.querySelectorAll('*')].filter((e) => !e.childElementCount && /불러오는 중/.test(e.textContent) && e.offsetParent !== null).map((e) => (e.closest('section,article,[class*=card]')?.className || e.className || e.tagName).toString().slice(0, 40))); loadSeen.push({ t: Date.now() - t00, n }); } catch {} }, 300);
  await page.waitForTimeout(20000); clearInterval(poll);
  const first = loadSeen.filter((x) => x.n.length); const last = first.at(-1);
  await page.screenshot({ path: path.join(OUT, `home-${role}.png`) });
  const list = [...reqs.values()].map((x) => ({ ...x, ms: x.end != null ? x.end - x.start : null })).sort((a, b) => (b.ms || 0) - (a.ms || 0));
  all[role] = { url: page.url().replace(/\?.*/, ''), loadingUntilMs: last ? last.t : 0, loadingLabels: [...new Set(first.flatMap((x) => x.n))], slow: list.slice(0, 12), count: list.length };
  console.log(role, JSON.stringify(all[role], null, 1));
  await s.ctx.close();
}
fs.writeFileSync(path.join(OUT, 'home-measure.json'), JSON.stringify({ at: new Date().toISOString(), all }, null, 1));
await b.close();
