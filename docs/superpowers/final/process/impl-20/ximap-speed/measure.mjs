/* XI맵 확대 속도 재기(impl-20 ximap-speed · 원칙 157) — 바깥 주소에서 LX 직원 로그인 폼 한 번(세션 주입 0).
   node docs/superpowers/final/process/impl-20/ximap-speed/measure.mjs before|after   (01. 디자인 에서) → time-<tag>.json
   지역 셋(남원 · 보령 · 원주)마다: 전국(줌 7)에서 그 시군구의 가장 빛나는 칸(서버 밀도 격자에서 고름 — 좌표 고정값 0)을 눌러 날아간다.
   잼: 누름 → 날아감 끝 → 객체가 다 그려짐(그 자리 결과 층이 모두 다 받아지고 지도가 멈춤) · 그사이 '빈 지도'(빛이 빠졌는데 객체가 최종의 절반 미만) 시간 ·
   결과 조각 요청 수 · 받은 바이트. '처음' = 로그인 뒤 첫 방문, '다시' = 화면을 다시 열고(브라우저 보관은 그대로) 같은 순서로. */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { frontDoor } from '../../../../../../landxi/v3/kit/lint/forbidden.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const TAG = process.argv[2] || 'before';
const APP = process.env.APP || 'https://app.land-xi.dev';
const NAMES = (process.env.REGIONS || '남원,보령,원주').split(',');
const VIDEO = process.env.VIDEO === '1';
const kst = () => new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' });
const run = { tag: TAG, at: kst(), app: APP, rounds: [], errors: [], local: [] };
setTimeout(() => { fs.writeFileSync(path.join(DIR, `time-${TAG}.json`), JSON.stringify({ ...run, timeout: true }, null, 2)); process.exit(2); }, 420000);

const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...(VIDEO ? { recordVideo: { dir: path.join(DIR, '.vid'), size: { width: 1440, height: 900 } } } : {}) });
const p = await ctx.newPage();
const t00 = Date.now();
p.on('console', (m) => { if (m.type() === 'error') run.errors.push(m.text().slice(0, 300)); });
p.on('pageerror', (e) => run.errors.push(String(e).slice(0, 300)));
p.on('request', (r) => { if (/\/\/(127\.0\.0\.1|localhost|\[::1\])|:8700|:4173/.test(r.url())) run.local.push(r.url()); });
let NET = null;
p.on('requestfinished', async (r) => {
  if (!NET || !/\/tiles\/(pmtiles|mvt)\//.test(r.url())) return;
  const rec = { u: r.url().replace(/[?#].*$/, '').replace(/^https?:\/\/[^/]+/, ''), end: Date.now() - (NET.t || 0) };
  NET.push(rec);
  try { const s = await r.sizes(); rec.bytes = s.responseBodySize; const res = await r.response(); rec.status = res?.status(); rec.cached = res?.fromServiceWorker() || false; rec.cf = res?.headers()['cf-cache-status'] || null; rec.enc = res?.headers()['content-encoding'] || null; rec.ms = Math.round(r.timing().responseEnd); } catch { /* */ }
});

await frontDoor(p, APP, 'test@lx.or.kr', 'app');
await p.waitForURL((u) => !/\/login\/?$/.test(u.pathname), { timeout: 30000 });
const ready = () => { const x = window.__xc; const m = x?.map; return x?.boot?.shown && x.board?.glow > 0 && m && m.getStyle().layers.some((l) => l.type === 'heatmap' && /^xb-glow1/.test(l.id)); };

async function open() {
  await p.goto(APP + '/landxi/v3/xi-clean/', { waitUntil: 'commit' });
  await p.waitForFunction(ready, null, { timeout: 40000, polling: 100 });
  await p.waitForTimeout(1500);
}
await open();
/* 지역마다 가장 빛나는 칸(가까이 격자) — 화면이 쓰는 같은 서버 밀도에서 고른다 */
const spots = await p.evaluate(async (names) => {
  const { api } = await import('/landxi/shared/api-v1.js');
  const d = await api('/ximap/density?g=1');
  const out = {};
  for (const nm of names) {
    let k = -1, best = 0; const agg = new Map();
    for (let i = 0; i < d.cells.length; i += 4) {
      const s = d.sets[d.cells[i + 2]]; if (!String(s.region || '').includes(nm)) continue;
      const key = d.cells[i] + ',' + d.cells[i + 1]; const v = (agg.get(key) || 0) + d.cells[i + 3]; agg.set(key, v);
      if (v > best) { best = v; k = key; }
    }
    if (k !== -1) { const [x, y] = k.split(',').map(Number); out[nm] = [(x + 0.5) * d.g, (y + 0.5) * d.g]; }
  }
  return out;
}, NAMES);
run.spots = Object.keys(spots);

async function fly(nm) {
  const c = spots[nm]; if (!c) return { region: nm, skipped: true };
  await p.mouse.move(5, 450);
  await p.evaluate((cc) => window.__xc.map.jumpTo({ center: cc, zoom: 7 }), c);
  await p.waitForTimeout(1800);
  const pt = await p.evaluate((cc) => { const m = window.__xc.map, q = m.project(cc), r = m.getCanvas().getBoundingClientRect(); return [q.x + r.x, q.y + r.y]; }, c);
  await p.mouse.move(pt[0] - 4, pt[1]); await p.mouse.move(pt[0], pt[1]);
  await p.waitForTimeout(400);
  NET = []; NET.t = Date.now();
  const tClick = Date.now();
  // 화면 안에서 100ms 마다: 움직임 · 줌 · 빛 붙듦 · 그려진 객체 수 · 결과 층이 다 받아졌는가
  await p.evaluate(() => {
    const m = window.__xc.map, S = (window.__spd = { t0: performance.now(), s: [] });
    S.iv = setInterval(() => {
      const st = m.getStyle(), ids = st.layers.filter((l) => /^xb-r-.*-(fill|pt)$/.test(l.id) && m.getLayoutProperty(l.id, 'visibility') !== 'none').map((l) => l.id);
      const srcs = Object.keys(st.sources).filter((s) => /^xb-r-/.test(s));
      const g = st.layers.find((l) => /^xb-glow1-/.test(l.id));
      const hold = g ? JSON.stringify(m.getPaintProperty(g.id, 'heatmap-opacity')).includes('13.5') : false;
      let n = 0; try { n = ids.length ? m.queryRenderedFeatures({ layers: ids }).length : 0; } catch { /* */ }
      S.s.push({ t: Math.round(performance.now() - S.t0), z: +m.getZoom().toFixed(2), mv: m.isMoving(), hold, n, srcs: srcs.length, loaded: srcs.filter((s) => m.isSourceLoaded(s)).length, tiles: m.areTilesLoaded() });
    }, 100);
  });
  await p.mouse.click(pt[0], pt[1]);
  // 끝: 멈춤 · 결과 층 있음 · 모두 받아짐 · 객체 > 0 이 1.2초 동안 그대로(늦게 붙는 층까지)
  let done = null;
  for (let i = 0; i < 300 && !done; i++) {
    await p.waitForTimeout(100);
    done = await p.evaluate(() => {
      const s = window.__spd.s; if (s.length < 12) return null;
      const last = s.slice(-12);
      const ok = last.every((x) => !x.mv && x.srcs > 0 && x.loaded === x.srcs && x.n > 0 && x.srcs === last[0].srcs && x.n === last[0].n);
      return ok ? last[0].t : null;
    });
  }
  const S = await p.evaluate(() => { clearInterval(window.__spd.iv); return window.__spd.s; });
  const land = S.find((x, i) => i > 3 && !x.mv && S.slice(i).every((y) => !y.mv))?.t ?? null;
  const fin = S.length ? S[S.length - 1].n : 0;
  // 빈 지도 = 빛이 빠지는 줌(12 이상 · 붙들지 않음) 또는 붙듦이 풀렸는데 객체가 최종의 절반 미만인 시간(날아가는 중 제외)
  const blank = S.filter((x) => !x.mv && !x.hold && x.n < fin * 0.5).length * 100;
  const net = NET.slice(); NET = null;
  if (process.env.DUMP) fs.writeFileSync(path.join(process.env.TMPDIR || DIR, `dump-${TAG}-${nm}-${run.rounds.length}.json`), JSON.stringify({ S: S.filter((x, i) => i % 3 === 0), net: net.map((r) => [r.end, r.ms, r.status, Math.round((r.bytes || 0) / 1024), r.u.slice(-40)]) }));
  // 객체가 다 그려짐 = 그 뒤로 계속 멈춤 · 결과 층 모두 받아짐 · 그려진 객체 수가 최종과 같음이 처음 시작된 때
  let done_ms = null;
  if (done != null) for (let i = S.length - 1; i >= 0; i--) { const x = S[i]; if (x.mv || x.loaded !== x.srcs || x.n !== fin) break; done_ms = x.t; }
  const first = S.find((x) => x.n > 0)?.t ?? null, n90 = S.find((x) => x.n >= fin * 0.9)?.t ?? null;
  return { region: nm, click_s: (tClick - t00) / 1000, first_ms: first, n90_ms: n90, zoom: S.length ? S[S.length - 1].z : null, land_ms: land, objects_ms: done_ms, blank_ms: blank, objects: fin, wall_ms: Date.now() - tClick,
    req: net.length, kb: Math.round(net.reduce((a, r) => a + (r.bytes || 0), 0) / 1024), max_req_kb: Math.round(Math.max(0, ...net.map((r) => r.bytes || 0)) / 1024),
    status: net.reduce((a, r) => { a[r.status] = (a[r.status] || 0) + 1; return a; }, {}), enc: [...new Set(net.map((r) => r.enc))], cf: [...new Set(net.map((r) => r.cf))], slow_ms: Math.max(0, ...net.map((r) => r.ms || 0)) };
}
const recFrom = (Date.now() - t00) / 1000;
for (const round of ['처음', '다시']) {
  if (round === '다시') await open();
  for (const nm of NAMES) { const r = await fly(nm); r.round = round; run.rounds.push(r); console.log(JSON.stringify(r)); }
}
const v = VIDEO ? p.video() : null;
await ctx.close();
if (v) {
  // 10초 녹화 = 처음 남원 날아가기(누르기 1.5초 전 → 8.5초 뒤) · 자르지 않은 한 장면
  const raw = await v.path(), c = run.rounds[0].click_s, mp4 = path.join(DIR, 'fly-10s.mp4');
  const { execFileSync } = await import('node:child_process');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(Math.max(0, c - 1.5)), '-i', raw, '-t', '10', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '26', '-an', mp4]);
  fs.rmSync(path.join(DIR, '.vid'), { recursive: true, force: true });
  run.video = { file: 'fly-10s.mp4', at: kst(), scene: `${run.rounds[0].region} 처음 — 누르기 1.5초 전부터 10초` };
}
fs.writeFileSync(path.join(DIR, `time-${TAG}.json`), JSON.stringify(run, null, 2));
console.log('errors', run.errors.length, 'local', run.local.length);
await browser.close(); process.exit(0);
