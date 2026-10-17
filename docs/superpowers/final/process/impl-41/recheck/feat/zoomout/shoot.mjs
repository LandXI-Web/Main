/* 구현 41 · 줌아웃-보이게(원칙 267) — 지도 서비스 · XI맵에서 줌 9 · 11 · 13 · 15 결과 모양 + 그려진 객체 수.
   바깥 주소 · 로그인 폼 LX 직원 한 번(세션 주입 0) · PC 1440.
   node docs/superpowers/final/process/impl-41/zoomout/shoot.mjs <before|after>   (01. 디자인 에서)
   → shots/<phase>-<장면>-z<줌>-1440-<시각>.png(저장소 밖) · run-<phase>.json(장면 · 줌마다 그려진 객체 수 · 콘솔 오류) */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';

const ROOT = 'E:/Land-XI 플랫폼/01. 디자인';
const HW = 'C:/Users/User/AppData/Local/ms-playwright';
if (fs.existsSync(HW)) process.env.PLAYWRIGHT_BROWSERS_PATH = HW;
if (!process.env.DEV_PASSWORD) { const m = fs.readFileSync(path.join(ROOT, 'server/.env'), 'utf8').match(/^DEV_PASSWORD=(.*?)\s*$/m); if (m) process.env.DEV_PASSWORD = m[1]; }
process.env.LX_PW ||= process.env.DEV_PASSWORD;
const { chromium } = createRequire(path.join(ROOT, 'package.json'))('playwright');
const { frontDoor } = await import(pathToFileURL(path.join(ROOT, 'landxi/v3/kit/lint/forbidden.mjs')).href);
const DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(DIR, 'shots');
fs.mkdirSync(OUT, { recursive: true });
const APP = process.env.APP || 'https://app.land-xi.dev';
const PHASE = process.argv[2] || 'before';
const ZS = (process.env.ZS || '9,11,13,15').split(',').map(Number);
const kst = () => new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' });
const hm = () => kst().slice(11, 16).replace(':', '');
const RF = path.join(DIR, `run-${PHASE}${process.env.ONLY ? '-' + process.env.ONLY : ''}${process.env.XIONLY ? '-xi' : ''}.json`);
const run = { phase: PHASE, at: kst(), app: APP, shots: {}, map: {}, xi: {}, errors: [], bad: [], local: [] };
const save = () => fs.writeFileSync(RF, JSON.stringify(run, null, 1));
setTimeout(() => { run.timeout = true; save(); process.exit(2); }, 1500000).unref();

const browser = await chromium.launch({ channel: 'chrome', headless: true }).catch(() => chromium.launch({ channel: 'chromium' })).catch(() => chromium.launch());
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
// 콘솔 기록은 화면 안에서 짧게 모은다(아주 긴 콘솔 글 하나가 시험 도구 통로를 넘쳐 멈추게 한 일이 있어서 — 길이 · 앞 200자만)
if (process.env.NOCON) await p.addInitScript(() => { window.__con = []; for (const k of ['error', 'warn']) { const o = console[k].bind(console); console[k] = (...a) => { let t = ''; try { t = a.map((x) => (typeof x === 'string' ? x : x?.message || JSON.stringify(x))).join(' '); } catch { t = String(a[0]); } window.__con.push([k, t.length, t.slice(0, 200)]); if (t.length < 5000) o(...a); }; } });
if (!process.env.NOCON) p.on('console', (m) => { if (m.type() === 'error') run.errors.push(`${kst().slice(11)} ${m.text().slice(0, 300)}`); });
p.on('pageerror', (e) => run.errors.push(`${kst().slice(11)} pageerror ${String(e).slice(0, 300)}`));
if (!process.env.NOLISTEN) p.on('request', (r) => { if (/\/\/(127\.0\.0\.1|localhost|\[::1\])|:8700|:4173/.test(r.url())) run.local.push(r.url()); });
if (!process.env.NOLISTEN) p.on('response', (r) => { if (r.status() >= 400 && !/favicon/.test(r.url())) run.bad.push(`${kst().slice(11)} ${r.status()} ${r.url().replace(/[?#].*$/, '').slice(0, 160)}`); });
let CDP = null;
const shot = async (name) => {
  const f = `${PHASE}-${name}-1440-${hm()}.png`;
  try { await p.screenshot({ path: path.join(OUT, f), timeout: 10000 }); }
  catch { CDP ||= await ctx.newCDPSession(p); const r = await Promise.race([CDP.send('Page.captureScreenshot', { format: 'png' }), new Promise((res) => setTimeout(() => res(null), 30000))]); if (!r) { run.errors.push(`shot timeout ${f}`); save(); return null; } fs.writeFileSync(path.join(OUT, f), Buffer.from(r.data, 'base64')); }
  run.shots[f] = kst(); save(); return f;
};

await frontDoor(p, APP, 'test@lx.or.kr', 'app');
await p.waitForURL((u) => !/\/login\/?$/.test(u.pathname), { timeout: 30000 });
run.login_at = kst(); save();

/* ── 1. 지도 서비스 ── */
const settleM = () => p.waitForFunction(() => !window.__lm.map.isMoving() && window.__lm.map.areTilesLoaded(), null, { timeout: 30000 }).catch(() => {});
await p.goto(APP + '/landxi/v3/lx-map/', { waitUntil: 'commit' });
await p.waitForSelector('body[data-ready="1"]', { timeout: 90000 });
await settleM(); await p.waitForTimeout(1500);
const D = await p.evaluate(async () => { const { api } = await import('/landxi/v3/kit/util.js'); return api('/me/analyses'); });
const items = D.groups.flatMap((g) => g.items.map((it) => ({ ...it, group: g.name })));
const n = (it) => (it.found && typeof it.found === 'object' ? it.found.value : it.found);
run.mapItems = items.map((it) => ({ job: it.job, group: it.group, region: it.region, n: n(it), cls: (it.by_class || []).filter((c) => c.n).map((c) => `${c.cls} ${c.n}`).join(' · '), set: it.set, empty: it.empty }));
save();
const pick = (f) => items.find((it) => !it.empty && it.bounds && f(it));
const T = [
  ['namwon-greenhouse', pick((it) => /남원/.test(it.region) && /비닐하우스/.test(it.group) && n(it) === 703) || pick((it) => /남원/.test(it.region) && /비닐하우스/.test(it.group))],
  ['hamyang', pick((it) => /함양/.test(it.region) && /비닐하우스|건축|건물/.test(it.group)) || pick((it) => /함양/.test(it.region))],
  ['parking', pick((it) => /주차장 분석/.test(it.group)) || pick((it) => /주차장/.test(it.group))],
  ['building', pick((it) => /건축물|건물/.test(it.group) && !/함양/.test(it.region)) || pick((it) => /건축물|건물/.test(it.group))],
].filter(([k, it]) => it && (!process.env.ONLY || process.env.ONLY.split(',').includes(k)));
run.map.targets = T.map(([k, it]) => ({ k, job: it.job, group: it.group, region: it.region, n: n(it) })); save();

async function expandAll() { for (let i = 0; i < 40; i++) { const g = p.locator('.lm-gt[aria-expanded="false"]').first(); if (!(await g.count())) break; await g.click(); await p.waitForTimeout(120); } }
await expandAll();
const rowOf = (j) => p.locator('.lm-ly li').filter({ has: p.locator(`.lm-cd[data-job="${j}"]`) });
const onNow = async () => (await p.evaluate(() => window.__lm.layers())).filter((l) => l.on).map((l) => l.job);
for (const [k, it] of (process.env.XIONLY ? [] : T)) {
  // 이 층만 켠다
  for (const j of await onNow()) if (j !== it.job) { await rowOf(j).locator('.lm-sw').click().catch(() => {}); await p.waitForTimeout(300); }
  if (!(await onNow()).includes(it.job)) { await rowOf(it.job).locator('.lm-sw').click(); await p.waitForTimeout(600); }
  const b = it.bounds, c = [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
  run.map[k] = { job: it.job, n: n(it), z: {} };
  for (const z of ZS) {
    await p.evaluate(([c, z]) => { window.__lm.map.jumpTo({ center: c, zoom: z }); }, [c, z]);
    await p.waitForTimeout(900); await settleM(); await p.waitForTimeout(1800);
    run.map[k].z[z] = await p.evaluate((job) => {
      const m = window.__lm.map, ids = [`lm-r-${job}-fill`, `lm-r-${job}-line`].filter((l) => m.getLayer(l));
      const fs = m.queryRenderedFeatures({ layers: ids });
      const u = new Set(fs.map((f) => f.properties.id ?? f.id));
      const by = {}; for (const f of fs) { const c = f.properties.cls || '-'; (by[c] ||= new Set()).add(f.properties.id ?? f.id); }
      const lw = m.getLayer(`lm-r-${job}-line`) ? m.getPaintProperty(`lm-r-${job}-line`, 'line-width') : null;
      return { zoom: +m.getZoom().toFixed(2), drawn: u.size, byCls: Object.fromEntries(Object.entries(by).map(([k, v]) => [k, v.size])), minzoom: m.getSource(`lm-r-${job}`)?.minzoom ?? null, lineWidth: JSON.stringify(lw).slice(0, 80) };
    }, it.job);
    await shot(`map-${k}-z${z}`);
    save();
  }
}

/* ── 2. XI맵 — 서비스 결과 · 전국 결과 ── */
if (process.env.ONLY) { run.done = kst(); save(); await browser.close(); console.log(JSON.stringify(run.map, null, 1)); process.exit(0); }
const settleX = () => p.waitForFunction(() => !window.__xc.map.isMoving() && window.__xc.map.areTilesLoaded(), null, { timeout: 30000 }).catch(() => {});
await p.goto(APP + '/landxi/v3/xi-clean/', { waitUntil: 'commit' });
await p.waitForFunction(() => window.__xc?.map && window.__xc.boot?.shown && window.__xc?.board?.nat?.layers?.length > 0, null, { timeout: 90000, polling: 200 }).catch(() => {});
await settleX(); await p.waitForTimeout(1500);
const nw = T.find(([k]) => k === 'namwon-greenhouse')?.[1];
const scenes = [];
if (nw) scenes.push(['service', [(nw.bounds[0] + nw.bounds[2]) / 2, (nw.bounds[1] + nw.bounds[3]) / 2]]);
// 전국 결과가 끝난 칸 하나(진행 장부 · 화면에 있는 끝난 칸)
const nat = await p.evaluate(async () => {
  const m = window.__xc.map;
  m.jumpTo({ center: [127.8, 36.2], zoom: 6.5 });
  await new Promise((r) => setTimeout(r, 4000));
  const src = Object.keys(m.getStyle().sources).filter((s) => /^xn-[a-z]+$/.test(s));
  for (const s of src) {
    const fs = m.querySourceFeatures(s, { sourceLayer: 'cells' }).filter((f) => f.properties.done && (f.properties.n2 || f.properties.n3 || f.properties.n1));
    fs.sort((a, b) => (b.properties.n2 || 0) + (b.properties.n3 || 0) - (a.properties.n2 || 0) - (a.properties.n3 || 0));
    const f = fs[0];
    if (f) { const g = f.geometry.coordinates.flat(3); let x0 = 999, y0 = 999, x1 = -999, y1 = -999; for (let i = 0; i < g.length; i += 2) { x0 = Math.min(x0, g[i]); x1 = Math.max(x1, g[i]); y0 = Math.min(y0, g[i + 1]); y1 = Math.max(y1, g[i + 1]); } return { src: s, cd: f.properties.cd, name: `${f.properties.sgg || ''} ${f.properties.name || ''}`.trim(), c: [(x0 + x1) / 2, (y0 + y1) / 2] }; }
  }
  return null;
});
run.xi.national = nat; save();
if (nat) scenes.push(['national', nat.c]);
for (const [k, c] of scenes.filter(([k]) => !process.env.SCENE || k === process.env.SCENE)) {
  run.xi[k] = { c, z: {} };
  for (const z of ZS) {
    const ok = await Promise.race([p.evaluate(([c, z]) => { window.__xc.map.jumpTo({ center: c, zoom: z }); }, [c, z]).then(() => true), new Promise((r) => setTimeout(() => r(false), 60000))]);
    if (!ok) { run.xi[k].z[z] = { skipped: 'page busy' }; save(); continue; }
    await p.waitForTimeout(1200); await settleX(); await p.waitForTimeout(2500);
    await shot(`xi-${k}-z${z}`);
    // 그려진 객체 수 — 화면 가운데 960×600 칸(전체 화면 질의는 객체가 10만이 넘으면 오래 걸린다) · 20초 넘으면 건너뜀
    if (process.env.NOQ) { run.xi[k].z[z] = { zoom: z, shot: true }; save(); continue; }
    run.xi[k].z[z] = await Promise.race([p.evaluate(() => {
      const m = window.__xc.map, W = m.getCanvas().clientWidth, H = m.getCanvas().clientHeight;
      const ids = m.getStyle().layers.map((l) => l.id).filter((id) => /^(xb-r-|xn-o-|xc-ai-).*(-fill|-f)$/.test(id) && m.getLayoutProperty(id, 'visibility') !== 'none');
      const fs = m.queryRenderedFeatures([[W / 2 - 480, H / 2 - 300], [W / 2 + 480, H / 2 + 300]], { layers: ids });
      const by = {}; for (const f of fs) { const g = f.layer.id.startsWith('xn-o-') ? '전국' : f.layer.id.startsWith('xb-r-') ? '서비스' : '지역'; const c = `${g} ${f.properties.cls || '-'}`; (by[c] ||= new Set()).add(f.properties.id ?? f.id); }
      return { zoom: +m.getZoom().toFixed(2), box: '가운데 960×600', byCls: Object.fromEntries(Object.entries(by).map(([k, v]) => [k, v.size])), drawn: Object.values(by).reduce((a, v) => a + v.size, 0) };
    }), new Promise((r) => setTimeout(() => r({ skipped: 'query timeout' }), 20000))]);
    save();
  }
}
if (process.env.NOCON) run.con = await p.evaluate(() => window.__con).catch(() => null);
run.done = kst(); save();
await browser.close();
console.log(JSON.stringify({ map: run.map, xi: run.xi, errors: run.errors.length, bad: run.bad.length, local: run.local.length }, null, 1));
