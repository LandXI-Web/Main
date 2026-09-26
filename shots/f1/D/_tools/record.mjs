// F1-D 판정 영상 · 1440×900 · lang=en · off(리플레이 표기) — node shots/f1/D/_tools/record.mjs
import { chromium } from '@playwright/test';
import fs from 'node:fs';
const OUT = 'shots/f1/D';
const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, recordVideo: { dir: OUT + '/_raw', size: { width: 1440, height: 900 } } });
await ctx.addInitScript(() => { if (sessionStorage.getItem('b')) return; sessionStorage.setItem('b', 1); localStorage.setItem('lx_api_mode', 'off'); localStorage.setItem('lx_logged_in', '1'); localStorage.setItem('lx_role', 'staff'); });
const t0 = Date.now();
const p = await ctx.newPage();
const errs = [];
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
p.on('pageerror', (e) => errs.push('pageerror ' + e.message));
await p.goto('http://localhost:4173/landxi/global/index.html?tenant=lx&locale=en&from=namwon&tour=1');
const tg = Date.now();
await p.waitForFunction(() => document.documentElement.dataset.lx === 'ready', null, { timeout: 60000, polling: 50 });
const ready_ms = Date.now() - tg;
const firstPaint = await p.evaluate(() => ({ pf_visible: !document.getElementById('pf').hidden, map_opacity: getComputedStyle(document.getElementById('map')).opacity }));
await p.waitForFunction(() => window.__f1dTour === 'rolling' || window.__f1dTour === 'done', null, { timeout: 90000 });
const origin = await p.evaluate(() => performance.timeOrigin);
await p.evaluate(() => { window.__td = []; setInterval(() => { try { const R = document.getElementById('root').dataset; const cover = R.bcover === '1'; const a = cover ? window.__f1d.tileDeficitB() : window.__f1d.tileDeficit(); const b = R.swipe && !cover ? window.__f1d.tileDeficitB() : null; window.__td.push({ t: performance.now(), max: Math.max(a.max, b ? b.max : 0), scene: R.scene }); } catch { /* */ } }, 100); });
await p.waitForFunction(() => window.__f1dTour === 'done', null, { timeout: 120000, polling: 250 });
const marks = await p.evaluate(() => window.__f1dMarks);
const td = await p.evaluate(() => window.__td);
const runs = []; { let c = null; for (const x of td) { if (x.max >= 2) { c ||= { t0: x.t, t1: x.t, worst: 0, scene: x.scene }; c.t1 = x.t; c.worst = Math.max(c.worst, x.max); } else if (c) { runs.push(c); c = null; } } if (c) runs.push(c); }
const perf = await p.evaluate(() => window.__f1d.perf());
const state = await p.evaluate(() => window.__f1d.state());
const extra = await p.evaluate(() => ({ warm: window.__f1dWarm, transit: window.__f1dTransit, pf: window.__f1dPf }));
// 43–45 s: fonts-compare 나란히(같은 창 · 판정 제출 프레임)
await p.goto('http://localhost:4173/landxi/global/fonts-compare.html');
await p.waitForTimeout(2600);
const tEnd = Date.now();
await p.close(); const vpath = await p.video().path(); await ctx.close(); await b.close();
const toVid = (perfT) => (origin + perfT - t0) / 1000;
const tiles = { samples: td.length, runs: runs.map((r) => ({ at_s: +(toVid(r.t0) - toVid(marks[0].t)).toFixed(2), ms: Math.round(r.t1 - r.t0 + 100), worst: r.worst, scene: r.scene })), long_runs_over_500ms: runs.filter((r) => r.t1 - r.t0 + 100 > 500).length };
const meta = { tiles, video_raw: vpath, t_start_s: toVid(marks[0].t), t_end_s: (tEnd - t0) / 1000, marks: marks.map((m) => ({ k: m.k, s: +(toVid(m.t) - toVid(marks[0].t)).toFixed(2) })), perf, ready_ms, firstPaint, ...extra, errors: errs, mode: state.mode, reason: state.reason };
fs.writeFileSync(OUT + '/_raw/meta.json', JSON.stringify(meta, null, 1));
console.log(JSON.stringify(meta, null, 1));
