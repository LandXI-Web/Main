/* impl-46 영농 속도 — 기관 필지 카드 '시점 비교' → XI맵 가르기 · 위 띠까지 시간을 잰다(원칙 251).
   바깥 기관 주소(https://namwon.land-xi.dev) · 로그인 폼(frontDoor)으로만 · PC 1440 · 390.
   node prof.mjs <label> [pc|mob|all] [runs=3] [--headed]  → ./timings-<label>.json
   잼: 단추 누름 → 위 띠(.gx-cmp-t) · XI맵 부팅 표시(window.__xc.boot) · '불러오는 중' 구간 · 요청 폭포(앞 40개 · 주소의 ? 뒤는 지움)
   + 같은 필지 XI맵(가르기 없이) 열기 → 판이 걷힐 때(boot.shown). */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';

const ROOT = 'E:/Land-XI 플랫폼/01. 디자인';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const HW = 'C:/Users/User/AppData/Local/ms-playwright';
if (fs.existsSync(path.join(HW, 'chromium-1234'))) process.env.PLAYWRIGHT_BROWSERS_PATH = HW;
const { chromium } = createRequire(path.join(ROOT, 'package.json'))('playwright');
const { frontDoor } = await import(pathToFileURL(path.join(ROOT, 'landxi/v3/kit/lint/forbidden.mjs')).href);

const ORG = 'https://namwon.land-xi.dev', CARD = 'card-farm';
const LIST = `/landxi/v3/gov-report/?service=${CARD}&tab=sus`;
const [label = 'run', which = 'all', runsArg = '3'] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const HEADED = process.argv.includes('--headed');
const RUNS = +runsArg || 3;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const strip = (u) => String(u).replace(/[?#].*$/, '').replace(/^https?:\/\/[^/]+/, '');
const INIT = `(() => { window.__ld = { runs: [], cur: null };
  addEventListener('click', (e) => { if (e.target.closest && e.target.closest('.sp-cmp')) try { sessionStorage.setItem('__clk', String(Date.now())); } catch {} }, true);
  setInterval(() => { const on = !!document.body && /불러오는 중/.test(document.body.innerText); const t = performance.now();
    if (on && window.__ld.cur === null) window.__ld.cur = t;
    if (!on && window.__ld.cur !== null) { window.__ld.runs.push([Math.round(window.__ld.cur), Math.round(t)]); window.__ld.cur = null; } }, 50); })();`;

const browser = await chromium.launch(HEADED ? { channel: 'chrome', headless: false } : { channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const OUT = { label, at: new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }), site: ORG, headed: HEADED, runs: {} };

const pageFacts = (p) => p.evaluate(() => {
  const X = window.__xc || {};
  const L = window.__ld || { runs: [], cur: null };
  const ld = L.runs.map(([a, b]) => b - a); if (L.cur !== null) ld.push(Math.round(performance.now() - L.cur));
  const res = performance.getEntriesByType('resource').map((e) => ({ u: e.name, s: Math.round(e.startTime), e: Math.round(e.responseEnd), t: e.initiatorType }));
  const marks = performance.getEntriesByType('mark').map((m) => [m.name, Math.round(m.startTime)]);
  return { boot: { t0: Math.round(X.t0 || 0), ...(X.boot || {}) }, ld, res, marks };
});

async function run(vp) {
  const mob = vp === 'mob';
  const ctx = await browser.newContext({ viewport: mob ? { width: 390, height: 844 } : { width: 1440, height: 900 }, locale: 'ko-KR', deviceScaleFactor: 1, ...(mob ? { isMobile: true, hasTouch: true } : {}) });
  await ctx.addInitScript(INIT);
  const p = await ctx.newPage();
  const R = OUT.runs[vp] = { compare: [], plain: [], errors: [] };
  p.on('pageerror', (e) => R.errors.push(String(e).slice(0, 160)));
  await frontDoor(p, ORG, 'lxadmin@lx.or.kr#namwon', 'gov');
  await p.waitForURL((u) => !/\/login\/?(\?|$)/.test(u.pathname), { timeout: 60000 }).catch(() => {});
  for (let i = 0; i < RUNS; i++) {
    await p.goto(ORG + LIST, { waitUntil: 'domcontentloaded' });
    await p.locator('#sus-table:not(.is-busy) tbody tr').first().waitFor({ timeout: 20000 });
    await p.locator('#sus-table tbody tr').nth(i % 5).locator('td').nth(1).click();
    await p.locator('#det-x .sp-cmp').waitFor({ timeout: 10000 });
    const href = await p.locator('#det-x .sp-cmp').getAttribute('href');
    const t0 = Date.now();
    await p.locator('#det-x .sp-cmp').click();
    let band = null, grip = null;
    try { await p.locator('.xc-grip:not([hidden])').waitFor({ timeout: 20000 }); grip = Date.now() - t0; } catch { /* */ }
    let bandAbs = null;
    try { await p.locator('.gx-cmp-t').waitFor({ timeout: 20000 }); bandAbs = Date.now(); band = bandAbs - t0; } catch { /* */ }
    const clk = +(await p.evaluate(() => sessionStorage.getItem('__clk')).catch(() => 0)) || t0;
    if (bandAbs) band = bandAbs - clk;   // 실제 누른 순간(click 사건)부터 — 도구가 단추를 기다린 시간은 빼고
    if (grip != null) grip = grip + t0 - clk;
    await sleep(3000);
    const f = await pageFacts(p);
    if (i === RUNS - 1) { fs.mkdirSync(path.join(HERE, 'shots'), { recursive: true }); await p.screenshot({ path: path.join(HERE, 'shots', `${vp}-compare-${label}.png`) }); }
    const navAt = Math.round(await p.evaluate(() => performance.timeOrigin) - t0);   // 누름 → 새 화면 출발(앞 화면이 비키는 시간)
    R.compare.push({ i, band, grip, navAt, boot: f.boot, loading: f.ld, marks: f.marks, waterfall: f.res.filter((r) => !/\.(png|jpg|webp|pbf|mvt)$/.test(strip(r.u)) && !/\/tiles\/|\/proxy\//.test(r.u)).filter((r) => /\/api\/|\.json$/.test(r.u) || r.s > 600).slice(0, 60).map((r) => `${String(r.s).padStart(5)}→${String(r.e).padStart(5)} ${strip(r.u)}`) });
    console.log(vp, 'compare', i, 'grip', grip, 'band', band, 'shown', f.boot.shown, 'ready', f.boot.ready, 'loading', f.ld.join(','));
    // 같은 필지 · 가르기 없이
    const u = new URL(href, ORG); u.searchParams.delete('compare');
    const t1 = Date.now();
    await p.goto(ORG + u.pathname + u.search, { waitUntil: 'domcontentloaded' });
    let shown = null;
    try { await p.waitForFunction(() => window.__xc?.boot?.shown, null, { timeout: 20000 }); shown = Date.now() - t1; } catch { /* */ }
    await sleep(2500);
    const g = await pageFacts(p);
    R.plain.push({ i, shown, boot: g.boot, loading: g.ld });
    console.log(vp, 'plain', i, 'shown', shown, 'boot', JSON.stringify(g.boot), 'loading', g.ld.join(','));
  }
  await ctx.close();
}
for (const v of which === 'all' ? ['pc', 'mob'] : [which]) await run(v);
await browser.close();
const med = (a) => { const b = a.filter((x) => x != null).sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : null; };
OUT.summary = Object.fromEntries(Object.entries(OUT.runs).map(([k, r]) => [k, {
  band_med: med(r.compare.map((x) => x.band)), grip_med: med(r.compare.map((x) => x.grip)),
  loading_max_med: med(r.compare.map((x) => Math.max(0, ...x.loading))), plain_shown_med: med(r.plain.map((x) => x.shown)) }]));
console.log(JSON.stringify(OUT.summary));
fs.writeFileSync(path.join(HERE, `timings-${label}.json`), JSON.stringify(OUT, null, 1));
