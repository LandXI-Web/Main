// tools/film/frames.mjs — render.html 의 결정론적 타임라인을 프레임 PNG 로 굽는다.
//
//   node tools/serve.mjs &                       # 4173 포트
//   node tools/film/frames.mjs                   # 전체 575 프레임 → build/film/frames/
//   node tools/film/frames.mjs --keys            # 12 키프레임만 → shots/film/
//   node tools/film/frames.mjs --from 350 --to 440
//
// 프레임마다 window.__film.seek(t) 로 상태를 못박고, map 이 idle + areTilesLoaded()
// 될 때까지 기다린 뒤 캡처한다. 흐린 타일/빈 프레임이 나오지 않는 이유가 이것이다.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const flag = n => argv.includes('--' + n);
const val = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };

const PORT = process.env.PORT || 4173;
const URL = `http://localhost:${PORT}/tools/film/render.html`;
const W = 1280, H = 720;
const SETTLE_MS = Number(val('settle', 90));      // idle 이후 컴포지트 안정용 여유
const TIMEOUT_MS = Number(val('timeout', 45000));

const root = process.cwd();
const outDir = path.resolve(root, val('out', flag('keys') ? 'shots/film' : 'build/film/frames'));
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--force-color-profile=srgb', '--disable-lcd-text', '--hide-scrollbars',
         '--use-angle=default', '--enable-gpu-rasterization'],
});
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
page.on('pageerror', e => console.error('PAGEERROR', e.message));
page.on('console', m => { if (m.type() === 'error') console.error('CONSOLE', m.text()); });

console.log('open', URL);
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__filmReady === true', null, { timeout: 120000 });
const meta = await page.evaluate(() => ({ ...window.__film.meta, frames: window.__film.frames, fps: window.__film.fps, dur: window.__film.duration, seg: window.__film.segments }));
console.log('film', JSON.stringify(meta));

// 프레임 목록 결정
let list;
if (flag('keys')) {
  // 숏마다 대표 프레임 — 12장 (S1 궤도 2 · S2/S3 구름·한반도 3 · S4 하강 2 ·
  //                              S5 정사영상 2 · S6 비닐하우스 1 · S7 여수 2)
  const KEYS = [0.90, 2.60, 4.40, 6.10, 7.40, 9.20, 11.20, 13.00, 14.20, 17.20, 19.60, 22.60];
  list = KEYS.map(t => ({ t, name: 'k_' + String(Math.round(t * 100)).padStart(4, '0') + '.png' }));
} else {
  const total = meta.frames;
  const from = Number(val('from', 0)), to = Number(val('to', total - 1)), step = Number(val('step', 1));
  list = [];
  for (let i = from; i <= to; i += step) list.push({ t: i / meta.fps, name: 'f_' + String(i).padStart(4, '0') + '.png' });
}

const t0 = Date.now();
let slow = 0;
for (let n = 0; n < list.length; n++) {
  const { t, name } = list[n];
  await page.evaluate(tt => window.__film.seek(tt), t);
  try {
    await page.waitForFunction('window.__film.settled()', null, { timeout: TIMEOUT_MS, polling: 40 });
  } catch {
    slow++;
    console.warn('  ! settle timeout @', t.toFixed(2));
  }
  await page.waitForTimeout(SETTLE_MS);
  await page.screenshot({ path: path.join(outDir, name), clip: { x: 0, y: 0, width: W, height: H }, animations: 'disabled' });
  if (n % 25 === 0 || n === list.length - 1) {
    const el = (Date.now() - t0) / 1000;
    console.log(`  ${n + 1}/${list.length}  t=${t.toFixed(2)}s  ${el.toFixed(0)}s elapsed  eta ${(el / (n + 1) * (list.length - n - 1)).toFixed(0)}s`);
  }
}
await browser.close();
console.log('done ->', outDir, 'slowFrames=', slow);
