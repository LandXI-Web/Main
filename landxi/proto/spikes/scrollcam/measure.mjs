/* SPIKE 계측 — 스크린샷 6장 + 결과 판 4장 + 20초 영상 + 수치.
   실행: node tools/serve.mjs &   node landxi/proto/spikes/scrollcam/measure.mjs
   headless 로 돌리면 Chrome 이 rAF 를 30 Hz 로 조인다 — fps 를 재려면 반드시 headed. */
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const PORT = process.env.PORT || 4173;
const URL = `http://localhost:${PORT}/landxi/proto/spikes/scrollcam/index.html`;
const OUT = 'shots/spikes/scrollcam';
fs.mkdirSync(OUT, { recursive: true });
const VP = { width: 1440, height: 900 };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const R = {};

const browser = await chromium.launch({
  channel: 'chrome', headless: false,
  args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding',
         '--disable-backgrounding-occluded-windows', '--ignore-gpu-blocklist'],
});

async function open(ctx) {
  const p = await ctx.newPage();
  const errs = [];
  p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 180)); });
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  await p.goto(URL, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('body[data-ready="1"]', { timeout: 120000 });
  await wait(5000);
  return { p, errs };
}

/* ── 1. 20초 자동재생 영상 ─────────────────────────────────── */
{
  const ctx = await browser.newContext({ viewport: VP, recordVideo: { dir: OUT, size: VP } });
  const { p, errs } = await open(ctx);
  await p.evaluate(() => window.__rail.seek(0));
  await wait(3000);
  await p.evaluate(() => window.__rail.reset());
  await p.evaluate(() => window.__rail.play(0, 1, 20000));
  await wait(21500);
  R.play = await p.evaluate(() => window.__rail.metrics());
  R.playErrors = errs.slice(0, 6);
  const vid = p.video();
  await ctx.close();
  fs.renameSync(await vid.path(), path.join(OUT, 'rail.webm'));
  console.log('video ->', OUT + '/rail.webm', '| fps', R.play.fps, '| worst', R.play.worstFrameMs, 'ms');
}

/* ── 2. 스크린샷 + 수치 ─────────────────────────────────────── */
const ctx = await browser.newContext({ viewport: VP, deviceScaleFactor: 1 });
const { p, errs } = await open(ctx);
const MARKS = await p.evaluate(() => window.__rail.MARKS);

for (const [name, q] of MARKS) {
  await p.evaluate((v) => window.__rail.seek(v), q);
  await wait(4200);
  await p.screenshot({ path: `${OUT}/${name}.png` });
  console.log('shot', name);
}

/* 결과 판 — 클릭 → 실제 지점으로 비행(게이트 포함) */
await p.evaluate(() => window.__rail.seek(0.62));
await wait(3000);
for (const pl of await p.evaluate(() => window.__rail.PLATES.map((x) => x.id))) {
  await p.evaluate(() => window.__rail.reset());
  const t0 = Date.now();
  await p.evaluate((id) => window.__rail.plate(id), pl);
  await wait(6500);
  await p.screenshot({ path: `${OUT}/plate-${pl}.png` });
  (R.plates ||= {})[pl] = { ms: Date.now() - t0, ...(await p.evaluate(() => window.__rail.metrics())).gate };
  console.log('plate', pl);
}
// 스크롤이 판을 놓아주는지
await p.mouse.move(720, 450);
await p.mouse.wheel(0, 300);
await wait(2500);
R.plateRelease = await p.evaluate(() => window.__rail.rail.focused);

/* 레일 수학 감사 + 이징 경계 린트 */
R.audit = await p.evaluate(() => window.__rail.auditRail(40000));
R.easeJoins = await p.evaluate(() => window.__rail.rail.easeJoinReport());

/* 실제 휠 입력 지연 */
await p.evaluate(() => window.__rail.seek(0.35));
await wait(3000);
await p.evaluate(() => window.__rail.reset());
for (let i = 0; i < 60; i++) { await p.mouse.wheel(0, 110); await wait(50); }
await wait(1200);
R.wheel = await p.evaluate(() => window.__rail.metrics());

/* 키보드 동등성 */
await p.evaluate(() => window.__rail.reset());
await p.keyboard.press('Home'); await wait(1900);
const kHome = await p.evaluate(() => window.__rail.rail.progress);
await p.keyboard.press('ArrowRight'); await wait(1800);
const k1 = await p.evaluate(() => window.__rail.rail.progress);
await p.keyboard.press('ArrowRight'); await wait(1800);
const k2 = await p.evaluate(() => window.__rail.rail.progress);
await p.keyboard.press('PageDown'); await wait(1400);
const k3 = await p.evaluate(() => window.__rail.rail.progress);
await p.keyboard.press('End'); await wait(2200);
R.keyboard = { home: +kHome.toFixed(4), ch1: +k1.toFixed(4), ch2: +k2.toFixed(4), pgdn: +k3.toFixed(4),
               end: +(await p.evaluate(() => window.__rail.rail.progress)).toFixed(4),
               latency: (await p.evaluate(() => window.__rail.metrics())).latency };

/* 정지 잔떨림 — 6초 가만히 */
await p.evaluate(() => window.__rail.seek(0.66));
await wait(3500);
await p.evaluate(() => window.__rail.reset());
await wait(6000);
R.rest = await p.evaluate(() => window.__rail.metrics());

/* 투영 불연속 */
R.projection = [];
for (const z of [4.6, 5.4, 5.9, 6.6]) R.projection.push(await p.evaluate((zz) => window.__rail.measureProjectionPop(zz), z));

/* jumpTo 비용 */
await p.evaluate(() => window.__rail.seek(0.62));
await wait(3500);
R.jump = await p.evaluate(() => window.__rail.measureJumpCost(240));

/* 지형 on/off fps */
const sweep = async () => {
  await p.evaluate(() => window.__rail.seek(0.60));
  await wait(4000);
  await p.evaluate(() => window.__rail.reset());
  await p.evaluate(() => window.__rail.play(0.60, 0.74, 6000));
  await wait(6600);
  return p.evaluate(() => window.__rail.metrics());
};
R.fpsNoTerrain = await sweep();
await p.check('#o-terrain'); await wait(5000);
R.fpsTerrain = await sweep();
await p.uncheck('#o-terrain'); await wait(1500);

/* 게이트 on/off — 빠른 스크럽에서 게이트가 실제로 개입하는지 */
const scrub = async () => {
  await p.evaluate(() => window.__rail.seek(0.30));
  await wait(4000);
  await p.evaluate(() => window.__rail.reset());
  await p.evaluate(() => window.__rail.play(0.30, 0.95, 2500));
  await wait(3200);
  return p.evaluate(() => window.__rail.metrics());
};
R.gateOn = await scrub();
await p.uncheck('#o-gate'); await wait(500);
R.gateOff = await scrub();
await p.check('#o-gate');

/* 모션 감소 */
await p.check('#o-reduced');
await p.evaluate(() => window.__rail.reset());
await p.evaluate(() => window.__rail.seek(0.1));
await wait(600);
await p.evaluate(() => window.__rail.seek(0.9));
await wait(600);
R.reduced = await p.evaluate(() => ({ p: window.__rail.rail.progress, m: window.__rail.metrics() }));
await p.uncheck('#o-reduced');

R.errors = errs.slice(0, 10).concat(await p.evaluate(() => window.__rail.errors().slice(0, 6)));
R.gpu = await p.evaluate(() => {
  const c = document.createElement('canvas'); const gl = c.getContext('webgl2');
  const d = gl && gl.getExtension('WEBGL_debug_renderer_info');
  return d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'n/a';
});

await ctx.close();
await browser.close();
fs.writeFileSync(`${OUT}/metrics.json`, JSON.stringify(R, null, 2));
console.log(JSON.stringify(R, null, 2));
