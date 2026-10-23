// 바깥 주소 · 로그인 폼으로 들어가 화면이 부르는 GET 을 모은 뒤, 가벼운 동시 부하(동시 N)로 다시 불러 p50/p95 를 잰다.
import { pathToFileURL } from 'node:url';
import fs from 'node:fs';
const C = await import(pathToFileURL('E:/Land-XI 플랫폼/01. 디자인/tools/check/common.mjs').href);
const out = process.argv[2] || 'measure.json';
const CONC = +(process.env.CONC || 6), ROUNDS = +(process.env.ROUNDS || 4);
const PAGES = { gov: ['/landxi/v3/xi-clean/'], app: ['/landxi/v3/lx-analyze/'] };
const browser = await C.launch();
const res = { at: new Date().toISOString(), conc: CONC, rounds: ROUNDS, load: {}, ep: {} };
const norm = (u) => { const x = new URL(u); return x.pathname.replace(/\/ranges\/[^/?]+/g, '/ranges/:id').replace(/\/(job_|chg_)[A-Za-z0-9_@.-]+/g, '/:id').replace(/\/\d+\/\d+\/\d+(\.\w+)?$/, '/{z}/{x}/{y}') + (x.search ? '?' + [...x.searchParams.keys()].sort().join('&') : ''); };
for (const role of ['gov', 'app']) {
  const { ctx, page, home } = await C.login(browser, role);
  for (const p of PAGES[role]) {
    const seen = [];
    const t0 = Date.now();
    page.on('requestfinished', async (rq) => { if (!/\/api\/v1\//.test(rq.url()) || rq.method() !== 'GET') return; const t = rq.timing(); seen.push({ url: rq.url(), ms: Math.round(t.responseEnd) }); });
    await page.goto(home + p, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {});
    if (role === 'app') { // 변화 패널 — 대상지 고르기가 있으면 첫 대상지
      await page.waitForTimeout(3000);
    }
    await page.waitForTimeout(2000);
    res.load[role + p] = { ms: Date.now() - t0, calls: seen.map((s) => ({ ep: norm(s.url), ms: s.ms })) };
    page.removeAllListeners('requestfinished');
    // 부하: 모은 GET(타일 제외 · 고유 주소) 을 동시 CONC 로 ROUNDS 번
    const urls = [...new Set(seen.map((s) => s.url))].filter((u) => !/\/tiles?\//.test(u));
    let extra = role === 'app' ? ['/api/v1/change/ranges'] : ['/api/v1/ximap/boot', '/api/v1/regions/52190/results', '/api/v1/summary?region=52190', '/api/v1/survey/stats?by=emd'];
    if (role === 'app') {
      const id = await page.evaluate(async () => { const s = JSON.parse(localStorage.getItem('lx_api_session') || 'null'); const r = await fetch('/api/v1/change/ranges', { headers: { authorization: 'Bearer ' + s.token } }); return ((await r.json()).items || [])[0]?.id; });
      if (id) extra.push('/api/v1/change/ranges/' + id, '/api/v1/change/ranges/' + id + '/imagery');
    }
    const all = [...new Set([...urls, ...extra.map((e) => home + e)])];
    const r = await page.evaluate(async ({ all, CONC, ROUNDS }) => {
      const s = JSON.parse(localStorage.getItem('lx_api_session') || sessionStorage.getItem('lx_api_session') || 'null');
      const H = s?.token ? { authorization: 'Bearer ' + s.token } : {};
      const jobs = []; for (let i = 0; i < ROUNDS; i++) for (const u of all) jobs.push(u);
      const outp = [];
      let k = 0;
      async function w() { while (k < jobs.length) { const u = jobs[k++]; const t = performance.now(); let st = 0; try { const r = await fetch(u, { headers: H, credentials: 'include', cache: 'no-store' }); st = r.status; await r.arrayBuffer(); } catch { st = -1; } outp.push({ u, ms: performance.now() - t, st }); } }
      await Promise.all(Array.from({ length: CONC }, w));
      return outp;
    }, { all, CONC, ROUNDS });
    for (const x of r) { const e = (res.ep[role + ' ' + norm(x.u)] ||= { ms: [], bad: 0 }); e.ms.push(Math.round(x.ms)); if (x.st !== 200) e.bad++; }
  }
  await ctx.close();
}
await browser.close();
const pct = (a, q) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
for (const [k, v] of Object.entries(res.ep)) { v.p50 = pct(v.ms, 0.5); v.p95 = pct(v.ms, 0.95); v.max = Math.max(...v.ms); v.n = v.ms.length; }
fs.writeFileSync(out, JSON.stringify(res, null, 1));
for (const [k, v] of Object.entries(res.ep).sort((a, b) => b[1].p95 - a[1].p95)) console.log(String(v.p50).padStart(6), String(v.p95).padStart(6), String(v.max).padStart(6), v.n, v.bad, k);
for (const [k, v] of Object.entries(res.load)) console.log('LOAD', k, v.ms, 'ms', v.calls.length, 'calls');
