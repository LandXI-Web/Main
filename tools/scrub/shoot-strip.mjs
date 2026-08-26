// tools/scrub/shoot-strip.mjs — 레그 1–3(AI 레그) 구간을 9지점으로 훑으며 촬영한다.
//
//   node tools/scrub/shoot-strip.mjs                 # shots/scrub/legs-1-3-*.png
//   node tools/scrub/shoot-strip.mjs --out shots/x   # 출력 폴더
//
// 지점은 트랙 진행도(window.__scrub.seek 의 p)다. 씸 밴드(0.16vh)의 한가운데와 양끝을
// 반드시 포함시킨다 — 이음매의 크로스페이드가 실제 스크린샷에서 어떻게 보이는지 보기 위해.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const val = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const PORT = process.env.PORT || 4173;
const URL = val('url', `http://localhost:${PORT}/landxi/proto/scrub/`);
const OUT = path.resolve(process.cwd(), val('out', 'shots/scrub'));
const PREFIX = val('prefix', 'legs-1-3');
const W = 1440, H = 900;
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--force-color-profile=srgb', '--disable-lcd-text', '--hide-scrollbars',
         '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
await page.goto(URL, { waitUntil: 'load' });
await page.waitForFunction('window.__scrub && window.__scrub.ready === true', null, { timeout: 30000 });
await page.waitForTimeout(600);

const M = await page.evaluate(() => window.__scrub.manifest);
let run = 0;
const cum = M.legs.map(l => { const a = run; run += l.weightVh; return [a, run]; });
const total = run;
const seam = M.seam;
const P = v => +(v / total).toFixed(4);
// 9지점: 레그 1 안 2곳 · 씸 01→02 한가운데 · 레그 2 안 · 씸 02→03 한가운데 · 레그 3 안 ·
//        씸 03→04 (시작 · 한가운데 · 끝) — 렌더러가 바뀌는 이음매라 세 장.
const POINTS = [
  { p: P(0.10), tag: 'L1-open' },
  { p: P(cum[0][1] - 0.45), tag: 'L1-mid' },
  { p: P(cum[0][1]), tag: 'seam-01-02-mid' },
  { p: P(cum[1][0] + 0.55), tag: 'L2-mid' },
  { p: P(cum[1][1]), tag: 'seam-02-03-mid' },
  { p: P(cum[2][0] + 0.55), tag: 'L3-mid' },
  { p: P(cum[2][1] - seam / 2), tag: 'seam-03-04-in' },
  { p: P(cum[2][1]), tag: 'seam-03-04-mid' },
  { p: P(cum[2][1] + seam / 2), tag: 'seam-03-04-out' },
];

async function settle() {
  await page.waitForFunction(() => {
    const I = window.ScrollCraft && window.ScrollCraft.instances[0];
    if (!I) return true;
    return I.clips.every(c => !c.ready || Math.abs(c.cur - c.target) < 0.0015);
  }, null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(320);
}

// 첫 번째 훑기 — 레그 1–4 클립을 미리 받아 두게 한다(지연 로딩 ±1.6vh).
for (const q of [0, 0.25, 0.5]) { await page.evaluate(p => window.__scrub.seek(p), q); await page.waitForTimeout(900); }

const rows = [];
for (let i = 0; i < POINTS.length; i++) {
  const { p, tag } = POINTS[i];
  await page.evaluate(q => window.__scrub.seek(q), p);
  await settle();
  const st = await page.evaluate(() => {
    const segs = Array.from(document.querySelectorAll('[data-sc-segment]'));
    return {
      leg: window.__scrub.leg(), t: +window.__scrub.trackVh().toFixed(3),
      film: +window.__scrub.filmTime().toFixed(2),
      op: segs.map(s => +(+s.style.opacity || 0).toFixed(2)),
      painted: segs.map(s => !!s.querySelector('video.sb-painted')),
      alt: document.getElementById('sb-alt').textContent,
      caption: document.getElementById('sb-caption').textContent,
    };
  });
  const f = path.join(OUT, `${PREFIX}-${i + 1}-${tag}.png`);
  await page.screenshot({ path: f });
  rows.push({ i: i + 1, tag, p, ...st, file: path.basename(f) });
  console.log(`${i + 1} ${tag.padEnd(16)} p=${p} t=${st.t}vh leg=${st.leg + 1} film=${st.film}s op=[${st.op.join(' ')}] alt=${st.alt}`);
}
fs.writeFileSync(path.join(OUT, `${PREFIX}-strip.json`), JSON.stringify({ url: URL, errors, rows }, null, 2));
console.log(errors.length ? `오류 ${errors.length}건:\n` + errors.join('\n') : '콘솔/페이지 오류 0');
await browser.close();
