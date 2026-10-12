/* impl-25 경작지 v2 실험 · 고치면 저절로 증거 — 바깥 주소에서 지금 새로 찍는다. 로그인 폼(세션 주입 0). 학습을 시작 · 멈추지 않는다(보기만).
   node docs/superpowers/final/process/impl-25/retrain-farm/shoot.mjs   (01. 디자인 에서) → shots/*.png · run.json
   ① LX 직원 — 프로젝트 '경작지 v2 — 항공 · API 영상' 학습 화면(작업 흐름 v3): 이번 학습 반복마다 정확도 그래프
   ② LX 관리자 — 배포 → XI 재학습: 서비스 줄 'n / 200장' · 고친 자리 한 칸 = 1장 안내 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { frontDoor } from '../../../../../../landxi/v3/kit/lint/forbidden.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(DIR, 'shots');
fs.mkdirSync(OUT, { recursive: true });
const APP = process.env.APP || 'https://app.land-xi.dev';
const ADMIN = process.env.ADMIN || 'https://admin.land-xi.dev';
const PRJ = 'prj_aa6c836803';
const kst = () => new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' });
const hm = () => kst().slice(11, 16).replace(':', '');
const run = { at: kst(), app: APP, shots: {}, errors: [], local: [], notes: {} };
const shot = async (page, name, opts = {}) => { const f = `${name}-1440-${hm()}.png`; await page.screenshot({ path: path.join(OUT, f), timeout: 90000, ...opts }); run.shots[f] = kst(); return f; };
const cdpShot = async (page, f, full = false) => {
  const c = await page.context().newCDPSession(page);
  let clip;
  if (full) { const m = await c.send('Page.getLayoutMetrics'); const cs = m.cssContentSize || m.contentSize; clip = { x: 0, y: 0, width: cs.width, height: cs.height, scale: 1 }; }
  const r = await c.send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip, captureBeyondViewport: true } : {}) });
  fs.writeFileSync(path.join(OUT, f), Buffer.from(r.data, 'base64')); run.shots[f] = kst(); return f;
};
const save = () => fs.writeFileSync(path.join(DIR, 'run.json'), JSON.stringify(run, null, 2));
setTimeout(() => { save(); process.exit(2); }, 280000);

const browser = await chromium.launch({ channel: 'chrome' });
const watch = (p) => {
  p.on('console', (m) => { if (m.type() === 'error') run.errors.push(`${p.url().replace(/[?#].*$/, '').slice(-40)} · ${m.text().slice(0, 300)}`); });
  p.on('pageerror', (e) => run.errors.push(String(e).slice(0, 300)));
  p.on('request', (r) => { if (/\/\/(127\.0\.0\.1|localhost|\[::1\])|:8700|:4173/.test(r.url())) run.local.push(r.url()); });
};

/* ① LX 직원 — 학습 화면 */
if (process.env.ONLY_ADMIN) { try { const old = JSON.parse(fs.readFileSync(path.join(DIR, 'run.json'), 'utf8')); run.shots = old.shots || {}; run.notes = old.notes || {}; } catch { /* 처음 */ } } else {
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ko-KR' });
const p = await ctx.newPage();
watch(p);
p.setDefaultNavigationTimeout(90000);
await frontDoor(p, APP, 'test@lx.or.kr', 'app');
await p.waitForURL((u) => !/\/login\/?$/.test(u.pathname), { timeout: 30000 });
const evs = [];
p.on('request', (r) => { if (/\/events\/jobs\//.test(r.url())) evs.push(r.url().replace(/^https?:\/\/[^/]+/, '').replace(/[?].*$/, '')); });
await p.goto(`${APP}/landxi/v3/lx-train/?project=${PRJ}&stage=train`, { waitUntil: 'domcontentloaded' });
await p.waitForSelector('.tb-perf svg, .tb-perf canvas, .tb-perf .tb-chart', { timeout: 45000 }).catch(() => null);
await p.waitForTimeout(3000);
run.notes.events = evs;
run.notes.train_text = (await p.locator('body').innerText()).slice(0, 1500);
await shot(p, 'train-board');
await shot(p, 'train-board-full', { fullPage: true });
save();

}
/* ② LX 관리자 — XI 재학습 */
const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ko-KR' });
const a = await ctx2.newPage();
watch(a);
a.setDefaultNavigationTimeout(90000);
await frontDoor(a, ADMIN, 'lxadmin@lx.or.kr', 'admin');
await a.waitForURL((u) => !/\/login\/?$/.test(u.pathname), { timeout: 90000, waitUntil: 'commit' });
await a.goto(`${ADMIN}/landxi/v3/ops-infra/#/deploys/retrain`, { waitUntil: 'commit' });
const pend = new Set(); a.on('request', (r) => pend.add(r.url())); a.on('requestfinished', (r) => pend.delete(r.url())); a.on('requestfailed', (r) => { pend.delete(r.url()); run.errors.push('failed ' + r.url().slice(-80)); });
try { await a.locator('.rt-tbl tbody tr').first().waitFor({ timeout: 90000 }); } catch (e) { run.notes.pending = [...pend].map((u) => u.slice(-90)); await a.screenshot({ path: path.join(DIR, 'fail-admin.png') }); save(); throw e; }
await a.waitForTimeout(1500);
run.notes.retrain_rows = await a.locator('.rt-tbl tbody tr').allInnerTexts();
await cdpShot(a, `admin-retrain-1440-${hm()}.png`, true);
await a.setViewportSize({ width: 390, height: 844 });
await a.waitForTimeout(1200);
await a.locator('.rv-note', { hasText: '조용하면' }).scrollIntoViewIfNeeded();
await cdpShot(a, `admin-retrain-note-390-${hm()}.png`);
run.notes.fonts = await a.evaluate(() => [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family + ' ' + f.weight));
save();
await browser.close();
process.exit(0);
