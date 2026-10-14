/* 구현 31 · 해외바탕-교체 증거 — 바깥 주소 로그인 폼(LX 직원 · 세션 주입 0)으로 XI맵 해외 세 곳 + 나라 전체를 PC 1440 으로 찍는다.
   node docs/superpowers/final/process/impl-31/overseas-s2/shoot.mjs before|after   (01. 디자인 에서) → shots/*.png · run-{phase}.json
   after 일 때는 줌 단계별(5–14) 해외 바탕 조각 응답을 세어 빈 조각(관문이 대신 준 빈 그림 · 오류) 0 을 확인한다. */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { frontDoor } from '../../../../../../landxi/v3/kit/lint/forbidden.mjs';

const PHASE = process.argv[2] || 'after';
const DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(DIR, 'shots');
fs.mkdirSync(OUT, { recursive: true });
const APP = process.env.APP || 'https://app.land-xi.dev';
const kst = () => new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' });
const hm = () => kst().slice(11, 16).replace(':', '');
const run = { phase: PHASE, at: kst(), app: APP, shots: {}, errors: [], tiles: { ok: 0, blank: 0, bad: [] }, sweep: [] };
setTimeout(() => { fs.writeFileSync(path.join(DIR, `run-${PHASE}.json`), JSON.stringify({ ...run, timeout: true }, null, 2)); process.exit(2); }, 900000);

const PLACES = [
  { id: 'kg-country', nation: true },
  { id: 'bishkek', center: [74.598, 42.872], zoom: 13 },
  { id: 'ysykata', center: [74.94, 42.86], zoom: 12 },
  { id: 'meiktila', center: [95.862, 20.878], zoom: 13 },
];

const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
p.on('console', (m) => { if (m.type() === 'error') { const l = m.location(); run.errors.push(`${m.text().slice(0, 200)} @ ${(l.url || '').split('/landxi/')[1] || ''}:${l.lineNumber}`); } });
p.on('response', (r) => { if (r.status() >= 500) run.errors.push(`${r.status()} ${r.url().split('?')[0].slice(-120)}`); });
p.on('pageerror', (e) => run.errors.push(String(e).slice(0, 300)));
p.on('response', async (r) => {
  if (!/overseas-s2\/[\w-]+\/\d+\/\d+\/\d+\.webp/.test(r.url())) return;
  const ct = r.headers()['content-type'] || '';
  if (r.status() === 200 && /webp/.test(ct)) run.tiles.ok++;
  else { run.tiles.blank++; run.tiles.bad.push(`${r.status()} ${ct} ${r.url().split('overseas-s2/')[1]}`); }
});
await frontDoor(p, APP, 'test@lx.or.kr', 'app');
await p.waitForURL((u) => !/\/login\/?$/.test(u.pathname), { timeout: 30000 });
await p.goto(APP + '/landxi/v3/xi-clean/?nation=kg', { waitUntil: 'commit' });
await p.waitForFunction(() => window.__xc?.map && window.__xc.boot?.shown, null, { timeout: 60000, polling: 100 });
const idle = () => p.evaluate(() => new Promise((res) => { const m = window.__xc.map; let done = false; const fin = () => { if (!done) { done = true; res(); } }; m.once('idle', fin); setTimeout(fin, 12000); }));
const shot = async (name) => { const f = `${PHASE}-${name}-1440-${hm()}.png`; await p.screenshot({ path: path.join(OUT, f) }); run.shots[f] = kst(); return f; };

for (const pl of PLACES) {
  if (pl.nation) {
    if (!(await p.evaluate(() => /kg/.test(location.search)))) await p.locator('.xn-b', { hasText: '키르기스스탄' }).click();
    await p.waitForTimeout(2500);
  } else {
    await p.evaluate(({ c, z }) => window.__xc.map.jumpTo({ center: c, zoom: z, pitch: 0, bearing: 0 }), { c: pl.center, z: pl.zoom });
  }
  await idle(); await p.waitForTimeout(1500);
  await shot(pl.id);
}
run.credit = await p.evaluate(() => document.querySelector('.k-credit')?.textContent || null);

if (PHASE === 'after') {
  for (const pl of PLACES.filter((x) => x.center)) for (let z = 5; z <= 14; z++) {
    const b0 = run.tiles.blank, o0 = run.tiles.ok;
    await p.evaluate(({ c, z }) => window.__xc.map.jumpTo({ center: c, zoom: z }), { c: pl.center, z });
    await idle(); await p.waitForTimeout(300);
    const st = await p.evaluate(() => { const m = window.__xc.map, out = {};
      for (const id of Object.keys(m.style.sourceCaches)) if (/^k-s2-/.test(id)) { const t = Object.values(m.style.sourceCaches[id]._tiles); out[id] = { n: t.length, err: t.filter((x) => x.state === 'errored').length }; }
      return out; });
    run.sweep.push({ at: pl.id, z, ok: run.tiles.ok - o0, blank: run.tiles.blank - b0, src: st });
  }
}
run.done = kst();
fs.writeFileSync(path.join(DIR, `run-${PHASE}.json`), JSON.stringify(run, null, 2));
console.log(JSON.stringify({ shots: Object.keys(run.shots), errors: run.errors.length, tiles: { ok: run.tiles.ok, blank: run.tiles.blank }, credit: run.credit }));
await browser.close();
process.exit(0);
