// SPIKE 러너 — 실 GPU 크롬으로 띄우고 단계별 FPS 를 재고 5스케일 스크린샷을 뜬다.
// 실행: node landxi/proto/spikes/maplibre3d/_run.mjs        (전체)
//       SHOTS=0 node ... _run.mjs                            (FPS 만)
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const PORT = process.env.PORT || 4173;
const OUT = 'shots/spikes/maplibre3d';
fs.mkdirSync(OUT, { recursive: true });
const SHOTS = process.env.SHOTS !== '0';

// headless shell 이면 SwiftShader 로 떨어진다 → channel:'chrome' 로 실 GPU 를 붙인다.
// vsync 를 풀지 않으면 전 구간이 30fps 로 평평해져 상대 비교가 불가능하다(실측).
const b = await chromium.launch({ channel: 'chrome', args: [
  '--disable-frame-rate-limit', '--disable-gpu-vsync', '--use-angle=d3d11',
] });
const p = await b.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
const errs = [];
p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
const net = { fail: 0, byHost: {} };
p.on('requestfailed', (r) => { net.fail++; try { net.byHost[new URL(r.url()).host] = (net.byHost[new URL(r.url()).host] || 0) + 1; } catch {} });

await p.goto(`http://localhost:${PORT}/landxi/proto/spikes/maplibre3d/`, { waitUntil: 'domcontentloaded' });
await p.waitForSelector('body[data-ready="1"]', { timeout: 120000 });
console.log('GPU:', await p.evaluate(() => {
  const gl = document.createElement('canvas').getContext('webgl2');
  const d = gl && gl.getExtension('WEBGL_debug_renderer_info');
  return d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'unknown';
}));

// 타일이 다 붙을 때까지 기다린다 — 흐린 스크린샷 방지
async function prewarm(ms = 22000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await p.evaluate(() => window.__spike.ready())) { await p.waitForTimeout(900); return Math.round((Date.now() - t0) / 100) / 10; }
    await p.waitForTimeout(300);
  }
  return -1;
}

// 정지 상태 + 스크롤 중 두 가지를 잰다
async function fpsAt(prog, { scrub = false, secs = 3 } = {}) {
  await p.evaluate((v) => window.__spike.jump(v), prog);
  const warm = await prewarm();
  const samples = await p.evaluate(async ({ v, scrub, secs }) => {
    const t0 = performance.now(); let n = 0, worst = 1e9, last = t0;
    return await new Promise((res) => {
      const tick = (t) => {
        const dt = t - last; last = t; n++;
        if (n > 3) worst = Math.min(worst, 1000 / dt);
        if (scrub) window.__spike.jump(v + 0.04 * Math.sin((t - t0) / 700));
        if (t - t0 < secs * 1000) requestAnimationFrame(tick);
        else res({ avg: n / ((t - t0) / 1000), min: worst });
      };
      requestAnimationFrame(tick);
    });
  }, { v: prog, scrub, secs });
  return { warm, avg: +samples.avg.toFixed(1), min: +samples.min.toFixed(1) };
}

// ── 1) 단계별 FPS ────────────────────────────────────────────────────
const STAGES = [
  ['S1 궤도 z1.35',        0.00],
  ['S2 대기권 z4.4',       0.18],
  ['S3 국토 z6.6 p44',     0.29],
  ['S4 남원 z11.8 지형ON', 0.50],
  ['S5 마을 z14.2 지형ON', 0.59],
  ['S6 거리 z17.5 p68 3D', 0.74],
  ['S7 금지면 z17.2 온실', 0.88],
  ['S8 전주 z17.3 밀집',   1.00],
];
const rows = [];
for (const [label, v] of STAGES) {
  const stat = await fpsAt(v, { secs: 3 });
  const scr = await fpsAt(v, { scrub: true, secs: 3 });
  const c = await p.evaluate(() => window.__spike.counts());
  rows.push({ label, v, stat, scr, c });
  console.log(`${label.padEnd(24)} 정지 ${String(stat.avg).padStart(6)} (min ${stat.min})  스크럽 ${String(scr.avg).padStart(6)} (min ${scr.min})  프리웜 ${stat.warm}s  건물 ${c.bld} 온실 ${c.gh}`);
}

// ── 2) 구름 3안 비교 (국토 스케일 + 마을 스케일) ─────────────────────
const CLOUD = [
  ['a CSS 시차',    { 't-css': true,  't-gibs': false, 't-three': false }],
  ['b GIBS 래스터', { 't-css': false, 't-gibs': true,  't-three': false }],
  ['c three 스프라이트', { 't-css': false, 't-gibs': false, 't-three': true }],
  ['전부 OFF',      { 't-css': false, 't-gibs': false, 't-three': false }],
  ['a+c 동시',      { 't-css': true,  't-gibs': false, 't-three': true }],
];
console.log('\n── 구름 안별 비용 ──');
const cloudRows = [];
for (const [name, cfg] of CLOUD) {
  for (const [k, v] of Object.entries(cfg)) await p.evaluate(([k, v]) => window.__spike.toggle(k, v), [k, v]);
  const nat = await fpsAt(0.20, { secs: 2.5 });
  const town = await fpsAt(0.59, { secs: 2.5 });
  cloudRows.push({ name, nat, town });
  console.log(`${name.padEnd(20)} 대기권 ${String(nat.avg).padStart(6)}  마을 ${String(town.avg).padStart(6)}`);
  if (SHOTS && name !== '전부 OFF') {
    await p.evaluate((v) => window.__spike.jump(v), 0.20);
    await prewarm(); await p.waitForTimeout(1200);
    await p.screenshot({ path: `${OUT}/cloud-${name[0]}.png` });
  }
}
// 기본값 복구
for (const [k, v] of Object.entries({ 't-css': true, 't-gibs': false, 't-three': true }))
  await p.evaluate(([k, v]) => window.__spike.toggle(k, v), [k, v]);

// ── 3) OpenFreeMap building 커버리지 비교 ────────────────────────────
await p.evaluate((v) => window.__spike.jump(v), 0.74);
await prewarm();
await p.evaluate(() => window.__spike.toggle('t-ofm', true));
await p.waitForTimeout(2500);
const ofmNamwon = await p.evaluate(() => {
  const f = map.querySourceFeatures('ofm', { sourceLayer: 'building' });
  return { n: f.length, h: f.filter((x) => x.properties.render_height != null).length,
           sample: f.slice(0, 3).map((x) => x.properties) };
});
console.log('\nOpenFreeMap building @남원 z17.5:', JSON.stringify(ofmNamwon));
await p.evaluate((v) => window.__spike.jump(v), 1.00);
await prewarm(); await p.waitForTimeout(2200);
const ofmJeonju = await p.evaluate(() => {
  const f = map.querySourceFeatures('ofm', { sourceLayer: 'building' });
  return { n: f.length, h: f.filter((x) => x.properties.render_height != null).length };
});
console.log('OpenFreeMap building @전주 z17.3:', JSON.stringify(ofmJeonju));
await p.evaluate(() => window.__spike.toggle('t-ofm', false));

// ── 4) 5스케일 스크린샷 ──────────────────────────────────────────────
if (SHOTS) {
  const FRAMES = [
    ['01-globe',        0.00],
    ['02-atmosphere',   0.18],
    ['03-korea',        0.29],
    ['04-namwon-terrain', 0.50],
    ['05-town-ortho',   0.59],
    ['06-street-3d',    0.74],
    ['07-geumji-greenhouse', 0.88],
    ['08-jeonju-dense', 1.00],
  ];
  console.log('\n── 스크린샷 ──');
  for (const [name, v] of FRAMES) {
    // seek() 는 스크롤 위치까지 옮긴다 → 섹션 카피가 장면과 맞는다
    await p.evaluate((x) => window.__spike.seek(x), v);
    const w = await prewarm(26000);
    await p.waitForTimeout(1500);
    await p.screenshot({ path: `${OUT}/${name}.png` });
    console.log('shot', name, 'prewarm', w + 's');
  }
}

console.log('\n네트워크 실패:', net.fail, JSON.stringify(net.byHost));
console.log('오류:', errs.length ? '\n' + errs.slice(0, 25).join('\n') : '없음');
fs.writeFileSync(`${OUT}/_measure.json`, JSON.stringify({ rows, cloudRows, ofmNamwon, ofmJeonju, net, errs: errs.slice(0, 40) }, null, 2));
await b.close();
