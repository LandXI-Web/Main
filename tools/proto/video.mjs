/* tools/proto/video.mjs — 메인 프로토(흰 아틀라스) 통주행 녹화.
 *
 *   node tools/serve.mjs &
 *   node tools/proto/video.mjs            → shots/proto/dive-white.webm
 *   node tools/proto/video.mjs --sec 40
 *
 * 스크롤을 사람이 굴리는 대신 api.ramp(from, to, sec) 로 p 를 일정 속도로 민다.
 * 구간마다 속도를 달리한다 — 궤도·구름은 빠르게, 아틀라스와 결과 행은 읽을 시간을 준다.
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const argv = process.argv.slice(2);
const val = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const PORT = process.env.PORT || 4173;
const OUT = path.resolve('shots/proto');
const W = 1440, H = 900;
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({
  viewport: { width: W, height: H },
  recordVideo: { dir: OUT, size: { width: W, height: H } },
});
const T0 = Date.now();   // 녹화는 컨텍스트 생성 시점부터 시작된다
const page = await ctx.newPage();
const errs = [];
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));

await page.goto(`http://localhost:${PORT}/landxi/proto/dive.html`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('body[data-ready="1"]', { timeout: 120000 });
// 결과 판을 미리 구워 둔다 — 녹화 중에 판이 비어 있는 프레임을 남기지 않는다.
await page.evaluate(() => window.__dive.seek(0.94));
await page.waitForTimeout(9000);
await page.evaluate(() => { window.__dive.suppressAuto = false; window.__dive.seek(0); });
await page.waitForTimeout(4000);

// [from, to, 초] — 합계가 대략 --sec 이 되게 잡은 구간별 속도.
const k = Number(val('sec', 46)) / 46;
const LEGS = [
  [0.000, 0.155, 5.0],   // 궤도 — 지구본 · Sentinel-2 통과
  [0.155, 0.300, 4.5],   // 성층운 돌파
  [0.300, 0.345, 2.0],   // 판이 아틀라스 격자로 앉는다
  [0.345, 0.545, 9.0],   // 전국 색인 자동 재생
  [0.545, 0.815, 6.0],   // 남원 강하
  [0.815, 0.888, 6.5],   // 착지 · 4시점 필름스트립
  [0.888, 0.988, 11.0],  // 결과 아틀라스 7행
  [0.988, 1.000, 2.0],
];
const TSTART = Date.now();   // 여기부터가 실제 통주행 — 앞의 예열 구간은 잘라낸다
for (const [a, b, sec] of LEGS) {
  await page.evaluate(([from, to, s]) => window.__dive.ramp(from, to, s), [a, b, sec * k]);
}
await page.waitForTimeout(1200);

await ctx.close();
await browser.close();

// Playwright 는 파일명을 스스로 정한다 — 가장 최근 webm 을 우리 이름으로 옮긴다.
const webms = fs.readdirSync(OUT)
  .filter((f) => /\.webm$/.test(f) && f !== 'dive-white.webm')
  .map((f) => ({ f, t: fs.statSync(path.join(OUT, f)).mtimeMs }))
  .sort((x, y) => y.t - x.t);
if (webms.length) {
  const dst = path.join(OUT, 'dive-white.webm');
  const raw = path.join(OUT, webms[0].f);
  fs.rmSync(dst, { force: true });
  const skip = Math.max(0, (TSTART - T0) / 1000 - 0.6);
  let trimmed = false;
  try {
    execFileSync(process.env.FFMPEG || 'ffmpeg',
      ['-y', '-loglevel', 'error', '-ss', skip.toFixed(2), '-i', raw, '-c', 'copy', dst],
      { stdio: ['ignore', 'ignore', 'pipe'] });
    trimmed = fs.existsSync(dst) && fs.statSync(dst).size > 0;
  } catch (e) { trimmed = false; }
  if (trimmed) fs.rmSync(raw, { force: true });
  else fs.renameSync(raw, dst);
  console.log('video', dst, (fs.statSync(dst).size / 1024 / 1024).toFixed(2) + 'MB',
    trimmed ? `(예열 ${skip.toFixed(1)}s 잘라냄)` : '(원본 그대로)');
} else {
  console.log('no video produced');
}
console.log('console errors:', errs.length);
if (errs.length) console.log(errs.slice(0, 8).join('\n'));
