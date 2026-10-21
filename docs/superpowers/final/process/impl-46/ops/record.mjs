// 실제 브라우저로 화면별 요청 목록 + 화면 시간 기록 (저장 · 제출 없음)
import { createRequire } from 'module';
import fs from 'fs';
const require = createRequire('E:/Land-XI 플랫폼/01. 디자인/package.json');
const { chromium } = require('playwright');
const ENV = fs.readFileSync('E:/Land-XI 플랫폼/01. 디자인/server/.env', 'utf8');
const PW = process.env.LX_PW || /^DEV_PASSWORD=(.*?)\s*$/m.exec(ENV)[1];
const OUT = process.argv[2] || 'rec.json';
const TAG = process.argv[3] || 'rec';
const APP = 'https://app.land-xi.dev', ORG = 'https://namwon.land-xi.dev';

const b = await chromium.launch();
const res = { tag: TAG, pages: [] };
async function visit(ctx, name, url, waitFn) {
  const page = await ctx.newPage();
  const reqs = []; const t0 = Date.now();
  page.on('requestfinished', async (r) => { const t = r.timing(); let st = 0; try { st = (await r.response())?.status() || 0; } catch {} reqs.push({ u: r.url(), m: r.method(), st, ms: Math.round(t.responseEnd), at: Date.now() - t0 }); });
  page.on('requestfailed', (r) => reqs.push({ u: r.url(), m: r.method(), st: -1, err: r.failure()?.errorText, at: Date.now() - t0 }));
  let ok = true, err = null;
  try { await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }); if (waitFn) await waitFn(page); await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {}); } catch (e) { ok = false; err = String(e).slice(0, 200); }
  const tReady = Date.now() - t0;
  // '불러오는 중' 글이 사라질 때까지
  let tLoading = null;
  for (let i = 0; i < 60; i++) { const has = await page.evaluate(() => /불러오는 중/.test(document.body?.innerText || '')).catch(() => false); if (!has) { tLoading = Date.now() - t0; break; } await page.waitForTimeout(500); }
  const shot = `${OUT.replace(/\.json$/, '')}-${name}.png`; await page.screenshot({ path: shot }).catch(() => {});
  res.pages.push({ name, url: page.url(), ok, err, ready_ms: tReady, loading_gone_ms: tLoading, n_req: reqs.length, reqs });
  return page;
}
// 1) LX 직원 로그인(폼)
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
{
  const p = await ctx.newPage(); const t0 = Date.now();
  await p.goto(APP + '/landxi/v3/login/', { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#id', { timeout: 30000 });
  await p.fill('#id', 'test@lx.or.kr');
  await p.fill('#pw', PW);
  await Promise.all([p.waitForURL((u) => !/\/login\//.test(u.pathname), { timeout: 60000 }), p.click('#go')]);
  await p.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  res.login = { ms: Date.now() - t0, landed: p.url() };
  res.storage = await p.evaluate(() => ({ ls: Object.keys(localStorage), ss: Object.keys(sessionStorage) }));
  await p.close();
}
await visit(ctx, 'staff-home', res.login.landed);
await visit(ctx, 'ximap', APP + '/landxi/v3/lx-map/');
// 2) 기관(남원) 로그인 → 기관 화면
const ctx2 = await b.newContext({ viewport: { width: 1440, height: 900 } });
{
  const p = await ctx2.newPage(); const t0 = Date.now();
  await p.goto(ORG + '/', { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.__govHome?.ready, null, { timeout: 30000 });
  await p.fill('.gh-form input[name=login]', 'lxadmin@lx.or.kr');
  await p.fill('.gh-form input[name=password]', PW);
  await Promise.all([p.waitForURL((u) => u.pathname.startsWith('/landxi/v3/gov-select/'), { timeout: 90000, waitUntil: 'domcontentloaded' }), p.click('.gh-go')]);
  await p.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  res.gov_login = { ms: Date.now() - t0, landed: p.url() };
  res.gov_links = await p.evaluate(() => [...document.querySelectorAll('a[href]')].map((a) => [a.innerText.trim().slice(0, 30), a.getAttribute('href')]).filter((x) => x[0]));
  await p.close();
}
await visit(ctx2, 'gov-main', res.gov_login.landed);
await visit(ctx2, 'gov-farm', ORG + '/landxi/v3/gov-select/?service=card-farm');
await visit(ctx2, 'gov-ximap', ORG + '/landxi/v3/xi-clean/');
fs.writeFileSync(OUT, JSON.stringify(res, null, 1));
console.log(JSON.stringify({ login: res.login, gov_login: res.gov_login, pages: res.pages.map((x) => ({ n: x.name, url: x.url, ok: x.ok, ready: x.ready_ms, loading: x.loading_gone_ms, req: x.n_req, bad: x.reqs.filter((r) => r.st >= 400 || r.st < 0).length })) }, null, 1));
console.log(JSON.stringify(res.gov_links.slice(0, 60)));
await b.close();
