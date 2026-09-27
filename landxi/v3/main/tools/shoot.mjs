/* 게스트 메인 스틸 — node landxi/v3/main/tools/shoot.mjs [outDir] [--mobile]
   챕터마다 스크롤 위치로 이동해 1440×900(또는 390×844) 스틸을 남기고, 콘솔 오류·K16 검사를 함께 적는다. */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const mobile = args.includes('--mobile');
const out = args.find((a) => !a.startsWith('--')) || 'shots/final/main';
fs.mkdirSync(out, { recursive: true });
const BASE = process.env.BASE || 'http://localhost:4173';
const vp = mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 };

const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

const t0 = Date.now();
await page.goto(BASE + '/landxi/v3/main/', { waitUntil: 'domcontentloaded' });
// 첫 뷰(지도 첫 타일 전) — 검정 면 0 확인용
await page.waitForTimeout(450);
await page.screenshot({ path: path.join(out, `main-${mobile ? '390' : '1440'}-00-hero-first.png`) });
const lcp = await page.evaluate(() => new Promise((res) => { let v = 0; new PerformanceObserver((l) => { for (const e of l.getEntries()) v = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true }); setTimeout(() => res(v), 3000); }));
await page.waitForTimeout(3500);

const { forbiddenScan } = await import('./scan.mjs');
const first = await page.evaluate(forbiddenScan);

const H = vp.height;
const shots = [
  ['00-hero', 'A', 0.15],
  ['01-nation', 'A', 2.5 + 4 * 0.62],
  ['02-parcel-join', 'A', 6.5 + 4 * 0.4],
  ['02-parcel-card', 'A', 6.5 + 4 * 0.62],
  ['02-parcel-list', 'A', 6.5 + 4 * 0.85],
  ['03-ask-typing', 'A', 10.5 + 4.5 * 0.4],
  ['03-ask-answer', 'A', 10.5 + 4.5 * 0.86],
  ['04-services', 'S', 0],
  ['05-deploy', 'B', 3 * 0.5],
  ['06-global', 'B', 3 + 3.5 * 0.72],
  ['07-finale', 'B', 6.5 + 2.5 * 0.8],
];
const report = { viewport: vp, lcp_ms: Math.round(lcp), first_view: first, shots: [] };
for (const [name, tr, x] of shots) {
  const y = await page.evaluate(([tr, x, H]) => {
    if (tr === 'S') return document.querySelector('#ch4').getBoundingClientRect().top + scrollY + 40;
    const el = document.querySelector(tr === 'A' ? '#trackA' : '#trackB');
    return el.getBoundingClientRect().top + scrollY + x * H;
  }, [tr, x, H]);
  await page.evaluate((y) => scrollTo(0, y), y);
  await page.waitForTimeout(name.startsWith('04') ? 1600 : 3200);
  const file = path.join(out, `main-${mobile ? '390' : '1440'}-${name}.png`);
  await page.screenshot({ path: file });
  const sc = await page.evaluate(forbiddenScan);
  report.shots.push({ name, file, chars: sc.chars, buttons: sc.buttons, hits: sc.hits });
}
report.console_errors = errors;
report.ms = Date.now() - t0;
fs.writeFileSync(path.join(out, `report-${mobile ? '390' : '1440'}.json`), JSON.stringify(report, null, 1));
console.log(JSON.stringify({ lcp: report.lcp_ms, first: { chars: first.chars, buttons: first.buttons, hits: first.hits }, errors, shots: report.shots.map((s) => [s.name, s.chars, s.buttons, s.hits.length]) }, null, 1));
await browser.close();
