// 하강 선명도 계측 — 투어 전체를 돌리며 100 ms 마다 tileDeficit(맨 위 불투명 래스터 타일 줌 부족분)을 기록
// 판정: deficit ≥ 2 가 500 ms 넘게 이어지는 구간 0. node shots/f1/D/_tools/descent.mjs [url]
import { chromium } from '@playwright/test';
import fs from 'node:fs';
const url = process.argv[2] || 'http://localhost:4173/landxi/global/index.html?tenant=lx&locale=en&from=namwon&tour=1';
const PROF = process.env.PROF;   // 지정하면 디스크 캐시가 남는 프로필(재방문 사용자) · 없으면 빈 캐시(첫 방문)
const b = PROF ? null : await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const ctx = PROF ? await chromium.launchPersistentContext(PROF, { channel: 'chrome', viewport: { width: 1440, height: 900 }, args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] }) : await b.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(() => { if (sessionStorage.getItem('b') && 0) return; sessionStorage.setItem('b', 1); localStorage.setItem('lx_api_mode', 'off'); localStorage.setItem('lx_logged_in', '1'); localStorage.setItem('lx_role', 'staff'); });
const p = await ctx.newPage();
const errs = [];
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
p.on('pageerror', (e) => errs.push('pageerror ' + e.message));
await p.goto(url);
await p.waitForFunction(() => window.__f1d && window.__f1dTour, null, { timeout: 90000 });
await p.evaluate(() => {
  window.__td = []; const t0 = performance.now();
  setInterval(() => { try { const R = document.getElementById('root').dataset; const cover = R.bcover === '1'; const a = cover ? window.__f1d.tileDeficitB() : window.__f1d.tileDeficit(); const bb = R.swipe && !cover ? window.__f1d.tileDeficitB() : null;
    window.__td.push({ t: Math.round(performance.now()), max: Math.max(a.max, bb ? bb.max : 0), a, b: bb, scene: document.getElementById('root').dataset.scene, card: !document.getElementById('card').hidden }); } catch (e) { window.__td.push({ t: Math.round(performance.now()), err: String(e) }); } }, 100);
});
await p.waitForFunction(() => window.__f1dTour === 'done', null, { timeout: 180000, polling: 500 });
const r = await p.evaluate(() => ({ td: window.__td, marks: window.__f1dMarks, pf: window.__f1dPf, warm: window.__f1dWarm, perf: window.__f1d.perf() }));
await (b || ctx).close();
const start = r.marks[0].t;
const runs = []; let cur = null;
for (const s of r.td) {
  const bad = (s.max ?? 0) >= 2;
  if (bad && !cur) cur = { t0: s.t, t1: s.t, worst: s.max, samples: [s] };
  else if (bad) { cur.t1 = s.t; cur.worst = Math.max(cur.worst, s.max); if (cur.samples.length < 3) cur.samples.push(s); }
  else if (cur) { runs.push(cur); cur = null; }
}
if (cur) runs.push(cur);
const long = runs.filter((x) => x.t1 - x.t0 + 100 > 500);
const out = { url, errors: errs, marks: r.marks.map((m) => ({ k: m.k, s: +((m.t - start) / 1000).toFixed(2) })), pf: r.pf, warm: r.warm, perf: r.perf, samples: r.td.length,
  runs: runs.map((x) => ({ from_s: +((x.t0 - start) / 1000).toFixed(2), dur_ms: x.t1 - x.t0 + 100, worst: x.worst, scene: x.samples[0].scene, eg: x.samples[0].a?.pts?.map((p) => `${p.layer}:${p.z}/${p.ideal}`).join(' ') })),
  long_runs: long.length };
fs.mkdirSync('shots/f1/D/logs', { recursive: true });
fs.writeFileSync('shots/f1/D/logs/descent-tiles.json', JSON.stringify({ ...out, td: r.td.map((s) => ({ t: +((s.t - start) / 1000).toFixed(2), max: s.max, z: s.a?.zoom, scene: s.scene })) }, null, 1));
console.log(JSON.stringify(out, null, 1));
