/* 휠 사람 속도 검증 — node landxi/v3/main/tools/wheel.mjs [outDir] [--cold]
   ① ch1→ch2: 휠 120px 6번씩 끊어 굴리며 매 프레임 필지 중심이 창 안에 있는지 적는다(z10–16 중간 스틸 14-ch2-wheel-mid).
   ② ch4→ch5→ch6: 같은 속도로 굴리며 매 프레임 위성 층 적재 여부 · 막 불투명도를 적는다(이동 중 스틸 15-ch6-wheel-mid).
   --cold: ch4 에 머물지 않고 곧바로 트랙 B 로(데우기 ② 없이 ①·③ 만) */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
const args = process.argv.slice(2);
const cold = args.includes('--cold'), mobile = args.includes('--mobile');
const out = args.find((a) => !a.startsWith('--')) || 'shots/final/main';
fs.mkdirSync(out, { recursive: true });
const BASE = process.env.BASE || 'http://localhost:4173';
const vp = mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 };
const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(BASE + '/landxi/v3/main/?dev=1', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__lxm && window.__lxm.live && window.__lxm.data.parcel && window.__lxm.data.kgz, null, { timeout: 30000 });
await page.waitForTimeout(2500);
const READ = +(args.find((a) => a.startsWith('--read='))?.slice(7) || 0);
const H = vp.height;
const at = (sel, x) => page.evaluate(([sel, x, H]) => document.querySelector(sel).getBoundingClientRect().top + scrollY + x * H, [sel, x, H]);
const sampler = () => page.evaluate(() => {
  const S = window.__lxm; S.rec = [];
  const pb = S.data.parcel.bbox, pc = [(pb[0] + pb[2]) / 2, (pb[1] + pb[3]) / 2];
  const tick = () => {
    if (!S.rec) return;
    const m = S.map, w = S.win, p = m.project(pc);
    try { const sc = m.style.sourceCaches['k-eox']; S.seen = S.seen || new Set(); for (const t of Object.values(sc._tiles)) { const c = t.tileID.canonical; S.seen.add(`${c.z}/${c.y}/${c.x}`); } } catch { }
    let loaded = true; try { loaded = m.isSourceLoaded('k-eox'); } catch { }
    S.rec.push({ z: +m.getZoom().toFixed(2), px: Math.round(p.x), py: Math.round(p.y), in: !!w && p.x >= w.x && p.x <= w.x + w.w && p.y >= w.y && p.y <= w.y + w.h, loaded, veil: +S.veilO.toFixed(2), gap: +(S.gap || 0).toFixed(2), ax: S.active, tb: +window.__lxmT?.toFixed?.(2) || 0 });
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});
const stop = () => page.evaluate(() => { const r = window.__lxm.rec; window.__lxm.rec = null; return r; });
async function wheelTo(yEnd, shoot) {
  await page.mouse.move(vp.width / 2, vp.height / 2);
  let n = 0;
  while ((await page.evaluate(() => scrollY)) < yEnd) {
    await page.mouse.wheel(0, 120); n++;
    await page.waitForTimeout(90);
    if (n % 6 === 0) await page.waitForTimeout(450);
    if (shoot) await shoot();
  }
  await page.waitForTimeout(1200);
}
const res = {};
// ① ch2
await page.evaluate((y) => scrollTo(0, y), await at('#trackA', 6.1));
await page.waitForTimeout(2500);
await sampler();
let shot2 = false;
await wheelTo(await at('#trackA', 6.5 + 4 * 0.5), async () => {
  const z = await page.evaluate(() => window.__lxm.map.getZoom());
  if (!shot2 && z > 11.5 && z < 15) { shot2 = true; await page.screenshot({ path: path.join(out, `${mobile ? '390' : '1440'}-14-ch2-wheel-mid.png`) }); }
});
let r = await stop();
if (READ) await page.waitForTimeout(READ);
const mid = r.filter((f) => f.z >= 10 && f.z <= 16);
res.ch2 = { frames: r.length, out: r.filter((f) => !f.in).length, midFrames: mid.length, midOut: mid.filter((f) => !f.in).length, shot: shot2 };
// ② ch4 → ch6
if (!cold) {
  await page.evaluate((y) => scrollTo(0, y), await at('#ch4', 0));
  for (let i = 0; i < 7; i++) { await page.waitForTimeout(500); if (i === 0 || i === 6) res['dwell' + i] = await page.evaluate(() => [window.__lxm.warm, window.__lxm.warmN, window.__lxm.warmMs, document.querySelector('#stage').className]); }
}
await page.evaluate((y) => scrollTo(0, y), await at('#trackB', 0.2));
await page.waitForTimeout(cold ? 300 : 2000);
await page.evaluate((y) => scrollTo(0, y), await at('#trackB', 2.9));
await page.waitForTimeout(1500);
await sampler();
let k = 0;
await wheelTo(await at('#trackB', 3 + 3.5 * 0.6), async () => {
  if (k < 10) { k++; await page.screenshot({ path: path.join(out, `${mobile ? '390' : '1440'}-15-ch6-wheel-mid-${k}.png`) }); }
});
r = await stop();
const warm = await page.evaluate(() => [window.__lxm.warm, window.__lxm.warmN, window.__lxm.warmMs]);
res.ch6 = { warm, frames: r.length, notLoaded: r.filter((f) => !f.loaded).length, exposed: r.filter((f) => !f.loaded && f.veil < 0.5).length, veilMax: Math.max(...r.map((f) => f.veil)), gapHi: r.filter((f) => f.gap > 0.34).length, gaps: r.filter((_, i) => i % 6 === 0).map((f) => f.gap + '/' + f.z).join(' ') };
if (args.includes('--twice')) {
  await page.evaluate((y) => scrollTo(0, y), await at('#trackB', 2.9)); await page.waitForTimeout(2500);
  await sampler(); await wheelTo(await at('#trackB', 3 + 3.5 * 0.6)); r = await stop();
  res.ch6b = { frames: r.length, gapHi: r.filter((f) => f.gap > 0.34).length, gaps: r.filter((_, i) => i % 6 === 0).map((f) => f.gap + '/' + f.z).join(' ') };
}
res.pre = await page.evaluate(() => window.__lxm.preN);
res.cover = await page.evaluate(() => { const S = window.__lxm, a = [...(S.seen || [])], hit = a.filter((k) => S.preSet?.has(k)); const byz = {}; for (const k of a) { const z = k.split('/')[0]; byz[z] = byz[z] || [0, 0]; byz[z][0]++; if (S.preSet?.has(k)) byz[z][1]++; } return { seen: a.length, hit: hit.length, byz }; });
res.errors = errors;
console.log(JSON.stringify(res));
await browser.close();
