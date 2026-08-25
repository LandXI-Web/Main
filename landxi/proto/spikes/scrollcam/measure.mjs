/* SPIKE 계측 — 스크린샷 12장 + 20초 영상 + 수치.
   실행: node tools/serve.mjs & node landxi/proto/spikes/scrollcam/measure.mjs   */
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

const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-gpu', '--ignore-gpu-blocklist'] });

async function open(ctx) {
  const p = await ctx.newPage();
  const errs = [];
  p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 200)); });
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  await p.goto(URL, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('body[data-ready="1"]', { timeout: 120000 });
  await wait(4500);
  return { p, errs };
}

/* ── 1. 20초 자동재생 영상 ─────────────────────────────────── */
{
  const ctx = await browser.newContext({ viewport: VP, recordVideo: { dir: OUT, size: VP } });
  const { p, errs } = await open(ctx);
  await p.evaluate(() => window.__rail.seek(0));
  await wait(2500);
  await p.evaluate(() => window.__rail.reset());
  await p.evaluate(() => window.__rail.play(0, 1, 20000));
  await wait(21500);
  R.play = await p.evaluate(() => window.__rail.metrics());
  R.playErrors = errs.slice(0, 8);
  const vid = p.video();
  await ctx.close();
  const src = await vid.path();
  fs.renameSync(src, path.join(OUT, 'rail.webm'));
  console.log('video ->', path.join(OUT, 'rail.webm'), 'fps', R.play.fps, 'worst', R.play.worstFrameMs);
}

/* ── 2. 스크린샷 + 수치 ─────────────────────────────────────── */
const ctx = await browser.newContext({ viewport: VP, deviceScaleFactor: 1 });
const { p, errs } = await open(ctx);
const MARKS = await p.evaluate(() => window.__rail.MARKS);

for (const which of ['map', 'globe']) {
  await p.evaluate((w) => window.__rail.demo(w), which);
  await wait(600);
  for (const [name, q] of MARKS) {
    await p.evaluate((v) => window.__rail.seek(v), q);
    await wait(which === 'map' ? 3800 : 1500);
    await p.screenshot({ path: `${OUT}/${which}-${name}.png` });
    console.log('shot', which, name);
  }
}

/* 레일 수학 감사 */
await p.evaluate((w) => window.__rail.demo(w), 'map');
R.audit = await p.evaluate(() => window.__rail.auditRail(4000));

/* 실제 휠 입력 지연 — play() 가 아니라 진짜 wheel 이벤트로 잰다 */
await p.evaluate(() => window.__rail.seek(0.35));
await wait(2500);
await p.evaluate(() => window.__rail.reset());
await p.mouse.move(720, 450);
for (let i = 0; i < 55; i++) { await p.mouse.wheel(0, 110); await wait(55); }
await wait(1200);
R.wheel = await p.evaluate(() => window.__rail.metrics());

/* 정지 잔떨림 — 4초 가만히 두고 카메라 값이 흔들리는지 */
await wait(4200);
R.rest = await p.evaluate(() => window.__rail.metrics());

/* 키보드 동등성 */
await p.evaluate(() => window.__rail.reset());
await p.keyboard.press('Home'); await wait(1800);
const kHome = await p.evaluate(() => window.__rail.rail.progress);
await p.keyboard.press('ArrowRight'); await wait(1600);
const k1 = await p.evaluate(() => window.__rail.rail.progress);
await p.keyboard.press('ArrowRight'); await wait(1600);
const k2 = await p.evaluate(() => window.__rail.rail.progress);
await p.keyboard.press('End'); await wait(2000);
const kEnd = await p.evaluate(() => window.__rail.rail.progress);
R.keyboard = { home: +kHome.toFixed(4), ch1: +k1.toFixed(4), ch2: +k2.toFixed(4), end: +kEnd.toFixed(4),
               metrics: await p.evaluate(() => window.__rail.metrics()) };

/* 투영 불연속 */
R.projection = [];
for (const z of [4.6, 5.4, 5.9, 6.6]) {
  R.projection.push(await p.evaluate((zz) => window.__rail.measureProjectionPop(zz), z));
}

/* jumpTo 비용 */
await p.evaluate(() => window.__rail.seek(0.62));
await wait(3500);
R.jump = await p.evaluate(() => window.__rail.measureJumpCost(240));

/* 지형 on/off fps */
await p.evaluate(() => window.__rail.seek(0.66));
await wait(3000);
await p.evaluate(() => window.__rail.reset());
await p.evaluate(() => window.__rail.play(0.60, 0.74, 6000));
await wait(6600);
R.fpsNoTerrain = await p.evaluate(() => window.__rail.metrics());
await p.check('#o-terrain');
await wait(4500);
await p.evaluate(() => window.__rail.seek(0.60));
await wait(3500);
await p.evaluate(() => window.__rail.reset());
await p.evaluate(() => window.__rail.play(0.60, 0.74, 6000));
await wait(6600);
R.fpsTerrain = await p.evaluate(() => window.__rail.metrics());
await p.uncheck('#o-terrain');

/* three.js 데모 fps */
await p.evaluate(() => window.__rail.demo('globe'));
await p.evaluate(() => window.__rail.seek(0));
await wait(2000);
await p.evaluate(() => window.__rail.reset());
await p.evaluate(() => window.__rail.play(0, 1, 8000));
await wait(8600);
R.fpsGlobe = await p.evaluate(() => window.__rail.metrics());

/* 게이트 효과 — 캐시를 비우고 빠르게 스크럽했을 때 게이트가 실제로 개입하는지 */
R.errors = errs.slice(0, 12).concat(await p.evaluate(() => window.__rail.errors().slice(0, 8)));
R.gpu = await p.evaluate(() => {
  const c = document.createElement('canvas'); const gl = c.getContext('webgl2');
  const d = gl && gl.getExtension('WEBGL_debug_renderer_info');
  return d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'n/a';
});

await ctx.close();
await browser.close();

fs.writeFileSync(`${OUT}/metrics.json`, JSON.stringify(R, null, 2));
console.log(JSON.stringify(R, null, 2));
