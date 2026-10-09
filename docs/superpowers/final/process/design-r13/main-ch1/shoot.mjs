/* 설계 13차 · 메인 장면 시안 촬영 — 미리보기(landxi/proto/review/main-ch1) 네 장면을 1440 · 390 으로 1장씩.
   사용: node shoot.mjs [--base https://app.land-xi.dev]  (기본 http://localhost:4173) */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../../../..');
const HW = 'C:/Users/User/AppData/Local/ms-playwright';
if (fs.existsSync(path.join(HW, 'chromium-1234'))) process.env.PLAYWRIGHT_BROWSERS_PATH = HW;
const { chromium } = createRequire(path.join(ROOT, 'package.json'))('playwright');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg('--base', 'http://localhost:4173') + '/landxi/proto/review/main-ch1/';
const SHOTS = path.join(HERE, 'shots'); fs.mkdirSync(SHOTS, { recursive: true });
// [주소, 파일, 크기, 기다림 ms, 찍기 전 할 일]
const LIST = [
  ['?v=a', 'ch1-a-1440.png', [1440, 900], 1200, async (p) => { await p.click('#ch1-list li[data-id="river"]'); await p.waitForTimeout(2200); }],
  ['?v=a', 'ch1-a-390.png', [390, 844], 1200, async (p) => { await p.click('#ch1-list li[data-id="river"]'); await p.waitForTimeout(2200); }],
  ['?v=b', 'ch1-b-1440.png', [1440, 900], 2600, async (p) => { await p.click('#ch1-list li[data-id="marine"]'); await p.waitForTimeout(1800); }],
  ['?v=b', 'ch1-b-390.png', [390, 844], 2600, async (p) => { await p.click('#ch1-list li[data-id="marine"]'); await p.waitForTimeout(1800); }],
  ['?v=c2', 'ch2-1440.png', [1440, 900], 6400],
  ['?v=c2', 'ch2-390.png', [390, 844], 6400],
  ['?v=c3', 'ch3-1440.png', [1440, 900], 16000],
  ['?v=c3', 'ch3-390.png', [390, 844], 16000],
];
const browser = await chromium.launch({ channel: 'chromium' }).catch(() => chromium.launch());
const report = [];
for (const [src, out, [w, h], ms, pre] of LIST) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const bad = [], errs = [];
  page.on('requestfailed', (r) => bad.push(r.url()));
  page.on('response', (r) => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url()); });
  page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 160)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)); });
  await page.goto(BASE + src, { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(ms);
  if (pre) await pre(page);
  // 타일이 덜 찼으면 조금 더
  await page.waitForFunction(() => { const s = document.querySelector('#stage .k-stage'); return s && s.classList.contains('is-ready'); }, null, { timeout: 8000 }).catch(() => {});
  await page.addStyleTag({ content: '.p-pick{display:none!important}' });   // 시안 고르기 띠는 캡처에서 뺀다
  await page.waitForTimeout(600);
  const m = await page.evaluate(() => ({ overflowX: document.documentElement.scrollWidth - innerWidth, text: document.querySelector('#ch1-big, .m-pc, #chat')?.innerText?.slice(0, 120) || '' }));
  await page.screenshot({ path: path.join(SHOTS, out) });
  report.push({ out, ...m, bad: bad.filter((u) => !/vworld|eox/.test(u)).slice(0, 5), errs: errs.slice(0, 5) });
  console.log(out, JSON.stringify(report.at(-1)));
  await page.close();
}
fs.writeFileSync(path.join(SHOTS, 'measure.json'), JSON.stringify(report, null, 1));
await browser.close();
