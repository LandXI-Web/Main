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
  // 10-09 둘째 답 뒤: 셋째는 새 문구 후보 셋을 1440 으로 한 장씩 · 넷째는 점 없는 면만 1440 한 장
  ['?v=c2&w=1', 'ch2-w1-1440.png', [1440, 900], 6400],
  ['?v=c2&w=2', 'ch2-w2-1440.png', [1440, 900], 6400],
  ['?v=c2&w=3', 'ch2-w3-1440.png', [1440, 900], 6400],
  // 넷째는 ① 지도에 그리기 상태(금지면 창 · 비닐하우스 면)로 — 왼쪽 단계 ①을 눌러 멈추고 찍는다
  ['?v=c3', 'ch3-1440.png', [1440, 900], 2000, async (p) => { await p.click('#ch3-steps li[data-i="0"]'); await p.waitForTimeout(7000); }],
];
// --only ch2,ch3 처럼 파일 이름 앞부분으로 골라 찍기
const ONLY = (arg('--only', '') || '').split(',').filter(Boolean);
const TODO = ONLY.length ? LIST.filter(([, out]) => ONLY.some((k) => out.startsWith(k))) : LIST;
const browser = await chromium.launch({ channel: 'chromium' }).catch(() => chromium.launch());
const report = [];
for (const [src, out, [w, h], ms, pre] of TODO) {
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
const prev = fs.existsSync(path.join(SHOTS, 'measure.json')) ? JSON.parse(fs.readFileSync(path.join(SHOTS, 'measure.json'), 'utf8')) : [];
fs.writeFileSync(path.join(SHOTS, 'measure.json'), JSON.stringify([...prev.filter((p) => !report.some((r) => r.out === p.out)), ...report], null, 1));
await browser.close();
