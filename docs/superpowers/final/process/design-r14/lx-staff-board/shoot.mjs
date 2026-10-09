/* 설계 14차 시안 촬영 · 점검 — landxi/proto/review/lx-staff-board 를 1440×900 으로 찍고 빈 여백 · 가로 넘침 · 한 단어 줄 · 깨진 그림 · 금지어를 잰다(PC만 · 원칙 139).
   로그인 없음(정적 파일). 사용: node shoot.mjs [--base http://localhost:4173] */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../../../..');
const { RULES, scan } = await import(pathToFileURL(path.join(ROOT, 'landxi/v3/kit/lint/forbidden.mjs')).href);
const HW = 'C:/Users/User/AppData/Local/ms-playwright';
if (fs.existsSync(path.join(HW, 'chromium-1234'))) process.env.PLAYWRIGHT_BROWSERS_PATH = HW;
const { chromium } = createRequire(path.join(ROOT, 'package.json'))('playwright');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg('--base', 'http://localhost:4173') + '/landxi/proto/review/lx-staff-board/';
const SHOTS = path.join(HERE, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
const scanSrc = `(() => { const RULES = [${RULES.map(([k, re]) => `[${JSON.stringify(k)}, ${re}]`).join(',')}]; const check = (s) => RULES.filter(([, re]) => re.test(s)).map(([k]) => k); return (${scan.toString()})(document); })()`;

const LIST = [
  ['dashboard.html', 'new-dash-1440.png'],
  ['dashboard-ex.html', 'new-dash-ex-1440.png'],
  ['progress.html', 'new-progress-1440.png'],
  ['my.html', 'new-my-1440.png'],
  ['admin.html', 'new-admin-1440.png'],
];

const MEASURE = () => {
  const main = document.querySelector('.k-main').getBoundingClientRect();
  const W = Math.min(innerWidth, main.right), H = innerHeight, X0 = main.left, Y0 = main.top;
  const S = 4, cols = Math.ceil((W - X0) / S), rows = Math.ceil((H - Y0) / S);
  const mk = () => new Uint8Array(cols * rows);
  const paint = (g, r) => { const x1 = Math.max(0, Math.floor((r.left - X0) / S)), x2 = Math.min(cols, Math.ceil((r.right - X0) / S)), y1 = Math.max(0, Math.floor((r.top - Y0) / S)), y2 = Math.min(rows, Math.ceil((r.bottom - Y0) / S)); for (let y = y1; y < y2; y++) for (let x = x1; x < x2; x++) g[y * cols + x] = 1; };
  const vis = (e) => { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.top < H; };
  const skip = (e) => !!e.closest('.k-chat-root,.k-md-bg,script,style');
  const box = mk();
  document.querySelectorAll('.k-main .t-card, .k-main .sb-set, .k-main .sb-tbl, .k-main .sb-dr, .k-main .acc-h, .k-main .acc-tabs').forEach((e) => { if (vis(e) && !skip(e)) paint(box, e.getBoundingClientRect()); });
  const sum = (g) => g.reduce((a, b) => a + b, 0) / (cols * rows);
  let L = 0, R = 0; for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (box[y * cols + x]) (x < cols / 2 ? L++ : R++);
  const lonely = [];
  for (const el of document.querySelectorAll('.k-main h2, .k-main p, .k-main li, .k-main b, .k-main dd, .k-md p, .k-md li')) {
    if (!vis(el) || (skip(el) && !el.closest('.k-md'))) continue;
    const r = document.createRange(); r.selectNodeContents(el);
    const tops = [...new Set([...r.getClientRects()].map((x) => Math.round(x.top)))];
    if (tops.length < 2) continue;
    const words = el.innerText.trim().split(/\s+/);
    const last = Math.max(...tops); let lastWords = 0;
    const w = document.createTreeWalker(el, 4); let t;
    while ((t = w.nextNode())) { const rr = document.createRange(); let m; const rx = /\S+/g; while ((m = rx.exec(t.nodeValue))) { rr.setStart(t, m.index); rr.setEnd(t, m.index + m[0].length); const b = rr.getBoundingClientRect(); if (b.width && Math.abs(Math.round(b.top) - last) < 6) lastWords++; } }
    if (words.length > 2 && lastWords === 1) lonely.push(el.innerText.trim().slice(0, 30));
  }
  /* 글자 중간 끊김 — 한글 어절이 두 줄에 걸치면 */
  const mid = [];
  const tw = document.createTreeWalker(document.querySelector('.k-main'), 4); let n;
  while ((n = tw.nextNode())) { const el = n.parentElement; if (!el || skip(el) || !vis(el)) continue; const rx = /[가-힣]{2,}/g; let m; while ((m = rx.exec(n.nodeValue))) { const rr = document.createRange(); rr.setStart(n, m.index); rr.setEnd(n, m.index + m[0].length); if ([...new Set([...rr.getClientRects()].map((b) => Math.round(b.top)))].length > 1) mid.push(m[0]); } }
  return { box: Math.round(sum(box) * 1000) / 10, left: Math.round((L / (L + R || 1)) * 100), height: document.documentElement.scrollHeight,
    overflowX: document.documentElement.scrollWidth - innerWidth, lonely: lonely.slice(0, 6), mid: mid.slice(0, 6),
    broken: [...document.images].filter((i) => vis(i) && !(i.complete && i.naturalWidth > 0)).map((i) => i.getAttribute('src')),
    modalOverflow: (() => { const b = document.querySelector('.k-md-b'); return b ? b.scrollHeight - b.clientHeight : 0; })() };
};

const browser = await chromium.launch({ channel: 'chromium' }).catch(() => chromium.launch());
const report = [];
for (const [src, out] of LIST) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const bad = [];
  page.on('requestfailed', (r) => bad.push(r.url()));
  page.on('response', (r) => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url()); });
  await page.goto(BASE + src, { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  const m = await page.evaluate(MEASURE);
  await page.screenshot({ path: path.join(SHOTS, out) });
  const lint = await page.evaluate(scanSrc).catch(() => null);
  const row = { shot: out, ...m, gap_outside: Math.round((100 - m.box) * 10) / 10, lint: (lint?.hits || []).slice(0, 6), bad: bad.slice(0, 4) };
  report.push(row);
  console.log(JSON.stringify(row));
  await page.close();
}
await browser.close();
fs.writeFileSync(path.join(SHOTS, 'measure.json'), JSON.stringify(report, null, 1));
