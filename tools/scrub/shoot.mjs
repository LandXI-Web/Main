// tools/scrub/shoot.mjs — 스크럽 페이지를 스스로 스크롤하며 촬영·측정한다.
//
//   node tools/scrub/shoot.mjs                 # 12지점 스크린샷 + 20초 스크롤 측정 + webm
//   node tools/scrub/shoot.mjs --reduced       # reduced-motion 계약 촬영
//   node tools/scrub/shoot.mjs --no-video      # 영상 녹화 생략
//
// 측정 항목(scroll-craft scripts/shoot.mjs + worldflight-assert.mjs 의 취지를 그대로):
//   · dead scroll  — 0.12vh 이상 움직였는데 재생헤드도 크로스페이드도 카피도 안 변한 구간
//   · 씸 플래시    — 씸 통과 중 프레임 평균 휘도가 앞뒤보다 급락하는 지점(검은 프레임)
//   · 프레임타임   — 20초 자동 스크롤 동안 rAF 간격의 표준편차
//   · 포스터에 갇힌 레그 / 풀 불투명도에 도달 못한 레그
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const FFMPEG = process.env.FFMPEG || 'ffmpeg';

const argv = process.argv.slice(2);
const flag = n => argv.includes('--' + n);
const val = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };

const PORT = process.env.PORT || 4173;
const URL = val('url', `http://localhost:${PORT}/landxi/proto/scrub/`);
const REDUCED = flag('reduced');
const W = 1440, H = 900;
const root = process.cwd();
const OUT = path.resolve(root, val('out', REDUCED ? 'shots/scrub/reduced' : 'shots/scrub'));
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--force-color-profile=srgb', '--disable-lcd-text', '--hide-scrollbars',
         '--autoplay-policy=no-user-gesture-required'],
});
const ctx = await browser.newContext({
  viewport: { width: W, height: H },
  deviceScaleFactor: 1,
  reducedMotion: REDUCED ? 'reduce' : 'no-preference',
  recordVideo: (!flag('no-video') && !REDUCED) ? { dir: path.join(OUT, '_vid'), size: { width: W, height: H } } : undefined,
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });

await page.goto(URL, { waitUntil: 'load' });
await page.waitForFunction('window.__scrub && window.__scrub.ready === true', null, { timeout: 30000 });
await page.waitForTimeout(600);

const meta = await page.evaluate(() => ({
  spacerVh: window.__scrub.spacerVh(),
  scrollHeight: document.documentElement.scrollHeight,
  innerHeight: innerHeight,
  legs: window.__scrub.legs.map(l => ({ id: l.id, label: l.label, w: l.weightVh, s: l.seconds })),
  stagePos: getComputedStyle(document.querySelector('[data-sc-world]')).position,
  // 문서 흐름에 스페이서 말고 뭐가 더 있는지 — 불변식 1
  flow: Array.from(document.querySelectorAll('body > *, [data-sc-mode] > *'))
    .filter(e => { const p = getComputedStyle(e).position; return p === 'static' || p === 'relative'; })
    .map(e => e.tagName + '.' + (e.className || '').toString().slice(0, 40)),
}));

// lerp 가 수렴할 때까지 기다린다. 수렴 전에 찍은 프레임은 페이지가 실제로는 한 번도
// 붙잡지 않는 프레임이라 촬영이 재현되지 않는다.
async function settle() {
  await page.waitForFunction(() => {
    const I = window.ScrollCraft && window.ScrollCraft.instances[0];
    if (!I) return true;
    return I.clips.every(c => !c.ready || Math.abs(c.cur - c.target) < 0.0015);
  }, null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(REDUCED ? 120 : 260);
}

async function goto(p) {
  await page.evaluate(q => window.__scrub.seek(q), p);
  await settle();
}
const state = () => page.evaluate(() => {
  const segs = Array.from(document.querySelectorAll('[data-sc-segment]'));
  const I = window.ScrollCraft.instances[0];
  return {
    p: window.__scrub.progress(),
    t: window.__scrub.trackVh(),
    leg: window.__scrub.leg(),
    label: window.__scrub.legLabel(),
    filmTime: window.__scrub.filmTime(),
    cam: window.__scrub.camera(),
    handoff: window.__scrub.handoffActive(),
    op: segs.map(s => +(+s.style.opacity || 0).toFixed(3)),
    hasClip: segs.map(s => s.classList.contains('sc-has-clip')),
    ct: I.clips.map(c => +(c.el.currentTime || 0).toFixed(3)),
    copy: Array.from(document.querySelectorAll('[data-sc-copy]')).map(c => +(+c.style.opacity || 0).toFixed(3)),
    copyTf: Array.from(document.querySelectorAll('[data-sc-copy]')).map(c => c.style.transform),
  };
});

/* ── 1. 12지점 스크린샷 ───────────────────────────────────────────────────── */
// 12지점: 히어로 2 + 씸 4 + 카피 플래토 중앙 5 + 인계 1.
// 플래토 중앙에서 찍는 이유 — 램프 중간에 찍으면 불투명 흰 판이 유리 카드처럼 보인다.
const SHOTS = [0, 0.13, 0.221, 0.2935, 0.378, 0.4495, 0.5795, 0.632, 0.703, 0.765, 0.836, 0.99];
const shots = [];
for (let i = 0; i < SHOTS.length; i++) {
  await goto(SHOTS[i]);
  const s = await state();
  const f = path.join(OUT, `s_${String(i).padStart(2, '0')}_p${String(Math.round(SHOTS[i] * 1000)).padStart(4, '0')}.png`);
  await page.screenshot({ path: f });
  shots.push({ p: SHOTS[i], file: path.basename(f), leg: s.leg, label: s.label,
    filmTime: +s.filmTime.toFixed(2), op: s.op, copy: s.copy, handoff: s.handoff });
  console.log(`  ${path.basename(f)}  leg ${s.leg} ${s.label}  film ${s.filmTime.toFixed(2)}s  op [${s.op.join(' ')}]`);
}

/* ── 2. 촘촘한 트랙 샘플 — dead scroll + 씸 플래시 ────────────────────────── */
const N = 120;
const samples = [];
for (let i = 0; i <= N; i++) {
  await page.evaluate(q => window.__scrub.seek(q), i / N);
  await page.waitForTimeout(REDUCED ? 24 : 46);
  samples.push(await state());
}
let dead = 0;
const deadAt = [];
for (let i = 1; i < samples.length; i++) {
  const a = samples[i - 1], b = samples[i];
  if (Math.abs(b.t - a.t) < 0.12) continue;
  const ctMoved = b.ct.some((v, j) => Math.abs(v - a.ct[j]) > 0.004);
  const opMoved = b.op.some((v, j) => Math.abs(v - a.op[j]) > 0.004);
  const cpMoved = b.copy.some((v, j) => Math.abs(v - a.copy[j]) > 0.004);
  if (!ctMoved && !opMoved && !cpMoved) { dead++; deadAt.push(+b.t.toFixed(3)); }
}
// 카피 transform 상한 — 불변식 7. translate3d(0, Xvh, 0) 의 X 절대값이 2 를 넘으면 안 된다.
let copyTfMax = 0;
for (const s of samples) for (const tf of s.copyTf) {
  const m = /translate3d\(0(?:px)?,\s*(-?[\d.]+)vh/.exec(tf || '');
  if (m) copyTfMax = Math.max(copyTfMax, Math.abs(parseFloat(m[1])));
}
// 풀 불투명도에 도달하지 못한 레그 / 포스터에 갇힌 레그
const nLegs = meta.legs.length;
const maxOp = Array.from({ length: nLegs }, (_, j) => Math.max(...samples.map(s => s.op[j])));
const everClip = Array.from({ length: nLegs }, (_, j) => samples.some(s => s.hasClip[j]));

/* ── 3. 씸 플래시 — 씸 밴드를 가로지르며 프레임 평균 휘도를 본다 ──────────── */

const stageBox = await page.locator('[data-sc-world]').boundingBox();
// 실제 휘도는 페이지 안에서 잰다: 현재 보이는 leg 들의 opacity 가중 평균으로는 알 수 없으므로
// 무대를 그대로 캔버스에 그릴 수 없다(비디오 taint 없음 — same-origin 이라 가능하다).
// 화면에 실제로 그려진 것을 잰다. 캔버스 합성으로 재면 디코더가 시크 중인 순간
// 검은 프레임을 그려 넣어 있지도 않은 플래시를 보고한다(첫 판이 정확히 그랬다).
const TMPSHOT = path.join(OUT, '_seam');
fs.mkdirSync(TMPSHOT, { recursive: true });
function pngLuma(f) {
  let out = '';
  try {
    out = execFileSync(FFMPEG, ['-hide_banner', '-i', f, '-lavfi',
      'format=gray,signalstats,metadata=print:file=-', '-f', 'null', '-'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) { out = String(e.stdout || ''); }
  const m = out.match(/lavfi\.signalstats\.YAVG=([\d.]+)/);
  return m ? parseFloat(m[1]) : NaN;
}
const stageClip = { x: 0, y: 90, width: W, height: H - 200 };   // 마스트헤드·계기판 제외
async function stageLuma(p, tag) {
  await page.evaluate(q => window.__scrub.seek(q), p);
  await settle();
  const f = path.join(TMPSHOT, tag + '.png');
  await page.screenshot({ path: f, clip: stageClip });
  return pngLuma(f);
}
const seamFlashes = [];
const seamLuma = [];
if (!REDUCED) {
  const M = JSON.parse(fs.readFileSync(path.resolve(root, 'landxi/assets/proto/film/legs/manifest.json'), 'utf8'));
  let run = 0; const c0 = M.legs.map(l => { const a = run; run += l.weightVh; return a; });
  const totalVh = run;
  for (let i = 1; i < M.legs.length; i++) {
    const centre = c0[i] / totalVh;
    const band = 0.16 / totalVh;
    const pts = [];
    for (let k = -6; k <= 6; k++) pts.push(Math.max(0, Math.min(1, centre + (band * k) / 8)));
    const ls = [];
    for (let k = 0; k < pts.length; k++) ls.push(await stageLuma(pts[k], `${M.legs[i-1].id}_${M.legs[i].id}_${k}`));
    seamLuma.push({ seam: `${M.legs[i - 1].id}→${M.legs[i].id}`, luma: ls.map(v => +v.toFixed(2)) });
    // 급락 판정: 밴드 안 최소 휘도가 양 끝 평균의 0.55 배 아래이면 플래시(검은 프레임)다.
    const ends = (ls[0] + ls[ls.length - 1]) / 2;
    const min = Math.min(...ls);
    if (min < ends * 0.55) seamFlashes.push({ seam: `${M.legs[i - 1].id}→${M.legs[i].id}`, min: +min.toFixed(2), ends: +ends.toFixed(2) });
  }
}

/* ── 4. 20초 자동 스크롤 프레임타임 ───────────────────────────────────────── */
let smooth = null;
if (!REDUCED) {
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForTimeout(400);
  smooth = await page.evaluate(async () => {
    const DUR = 20000;
    const max = document.documentElement.scrollHeight - innerHeight;
    const dts = [], drift = [];
    let last = performance.now(), t0 = last;
    return await new Promise(res => {
      function step(now) {
        const e = now - t0;
        dts.push(now - last); last = now;
        scrollTo(0, Math.round((e / DUR) * max));
        const I = window.ScrollCraft.instances[0];
        for (const c of I.clips) if (c.live && c.ready) drift.push(Math.abs(c.cur - c.target));
        if (e < DUR) requestAnimationFrame(step);
        else {
          const d = dts.slice(2);
          const m = d.reduce((a, b) => a + b, 0) / d.length;
          const sd = Math.sqrt(d.reduce((a, b) => a + (b - m) ** 2, 0) / d.length);
          const sorted = d.slice().sort((a, b) => a - b);
          res({
            frames: d.length, meanMs: +m.toFixed(2), sdMs: +sd.toFixed(2),
            p95Ms: +sorted[Math.floor(sorted.length * 0.95)].toFixed(2),
            maxMs: +sorted[sorted.length - 1].toFixed(2),
            longFrames: d.filter(x => x > 33).length,
            fps: +(1000 / m).toFixed(1),
            playheadDriftMean: +(drift.reduce((a, b) => a + b, 0) / Math.max(drift.length, 1)).toFixed(4),
          });
        }
      }
      requestAnimationFrame(step);
    });
  });
}

const report = {
  url: URL, reduced: REDUCED, viewport: [W, H], at: new Date().toISOString(),
  errors, meta, shots,
  invariants: {
    stageFixed: meta.stagePos === 'fixed',
    spacerHeightOk: Math.abs(meta.scrollHeight - meta.spacerVh * meta.innerHeight) < meta.innerHeight * 0.06,
    flowElements: meta.flow,
    copyTranslateMaxVh: copyTfMax,
    copyTranslateWithinCap: copyTfMax <= 2.05,
    deadScrollSamples: dead, deadScrollAt: deadAt,
    legsReachFullOpacity: maxOp.map(v => +v.toFixed(3)),
    legsStuckOnPoster: everClip.map((v, i) => (v ? null : i)).filter(v => v !== null),
  },
  seamLuma, seamFlashes, smooth,
};
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2) + '\n');

await ctx.close();
if (!flag('no-video') && !REDUCED) {
  const vd = path.join(OUT, '_vid');
  const f = fs.readdirSync(vd).find(x => x.endsWith('.webm'));
  if (f) { fs.renameSync(path.join(vd, f), path.join(OUT, 'scrub.webm')); fs.rmSync(vd, { recursive: true, force: true }); }
}
await browser.close();

console.log('\n── 판정 ───────────────────────────────');
console.log('  콘솔 오류        ', errors.length, errors.slice(0, 4));
console.log('  스테이지 fixed   ', report.invariants.stageFixed);
console.log('  스페이서 높이    ', meta.scrollHeight, 'px  기대', Math.round(meta.spacerVh * meta.innerHeight));
console.log('  문서 흐름 요소   ', meta.flow);
console.log('  카피 translate   ', copyTfMax, 'vh (상한 2)');
console.log('  dead scroll      ', dead, deadAt.slice(0, 6));
console.log('  레그 최대 불투명도', report.invariants.legsReachFullOpacity.join(' '));
console.log('  포스터에 갇힌 레그', report.invariants.legsStuckOnPoster);
console.log('  씸 플래시        ', seamFlashes.length, seamFlashes);
if (smooth) console.log('  프레임타임       ', JSON.stringify(smooth));
console.log('  →', path.relative(root, path.join(OUT, 'report.json')));
