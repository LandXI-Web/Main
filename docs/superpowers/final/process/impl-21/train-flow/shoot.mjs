/* impl-21 학습-작업흐름-v3 · 불러오는중 증거 — 바깥 주소에서 지금 새로 찍는다(원칙 162). 로그인은 LX 직원 로그인 폼 한 번(세션 주입 0). GPU 0(학습을 돌리지 않음).
   node docs/superpowers/final/process/impl-21/train-flow/shoot.mjs   (01. 디자인 에서) → shots/*.png · run.json
   ① 프로젝트 학습 화면(비닐하우스 2026 · 처음 보이는 판 · 세로 전체 · 학습 설정 블록 서랍)
   ② 불러오는 중 — 학습 화면 기록 응답을 이 시험에서만 1.5초 늦춰 가운데 판을 찍음(서버 · 화면 코드는 그대로) · XI맵 첫 열기
   (0.4초 안에 끝나는 기다림은 가운데 판이 뜨지 않음 — kit/loader.js SHOW_AFTER 400 · e2e impl21-train-board) */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { frontDoor } from '../../../../../../landxi/v3/kit/lint/forbidden.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(DIR, 'shots');
fs.mkdirSync(OUT, { recursive: true });
const APP = process.env.APP || 'https://app.land-xi.dev';
const kst = () => new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' });
const hm = () => kst().slice(11, 16).replace(':', '');
const run = { at: kst(), app: APP, shots: {}, errors: [], local: [], loader: {} };
const shot = async (page, name, opts = {}) => { const f = `${name}-${hm()}.png`; await page.screenshot({ path: path.join(OUT, f), ...opts }); run.shots[f] = kst(); return f; };
setTimeout(() => { fs.writeFileSync(path.join(DIR, 'run.json'), JSON.stringify({ ...run, timeout: true }, null, 2)); process.exit(2); }, 240000);

const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ko-KR' });
const p = await ctx.newPage();
p.on('console', (m) => { if (m.type() === 'error') run.errors.push(`${p.url().replace(/[?#].*$/, '').slice(-40)} · ${m.text().slice(0, 300)}`); });
p.on('pageerror', (e) => run.errors.push(String(e).slice(0, 300)));
p.on('request', (r) => { if (/\/\/(127\.0\.0\.1|localhost|\[::1\])|:8700|:4173/.test(r.url())) run.local.push(r.url()); });
await frontDoor(p, APP, 'test@lx.or.kr', 'app');
await p.waitForURL((u) => !/\/login\/?$/.test(u.pathname), { timeout: 30000 });

/* 비닐하우스 2026 프로젝트 id — 프로젝트 목록에서(고정값 없음) */
const pid = await p.evaluate(async () => {
  const s = JSON.parse(localStorage.getItem('lx_api_session') || 'null');
  const j = await fetch('/api/v1/projects?scope=all', { headers: s ? { authorization: 'Bearer ' + s.token } : {} }).then((r) => r.json()).catch(() => null);
  return (j?.items || []).find((x) => /비닐하우스/.test(x.name))?.id || null;
});
run.project = pid ? '비닐하우스 2026' : null;
const TRAIN = (q = '') => `${APP}/landxi/v3/lx-train/?project=${pid}&stage=train${q}`;
const watchLoader = () => p.evaluate(() => {
  window.__ld = { shownAt: null, t0: performance.now() };
  const mo = new MutationObserver(() => { const el = document.querySelector('.k-ld.is-on'); if (el && window.__ld.shownAt == null) window.__ld.shownAt = Math.round(performance.now() - window.__ld.t0); });
  mo.observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['class', 'hidden'], childList: true });
});

/* 학습 화면 열기(늦추지 않음) */
await p.goto(TRAIN(), { waitUntil: 'commit' });
await p.evaluate(() => 0).catch(() => {});
await p.waitForFunction(() => document.documentElement.dataset.trainBoard === '1', null, { timeout: 30000 });
await p.waitForTimeout(1200);

/* ① 학습 화면 — 처음 보이는 판 · 세로 전체 · 서랍 */
run.shots.board = await shot(p, 'train-board-1440');
const full = await p.evaluate(() => document.querySelector('.tb-col').scrollHeight + 64 + 64 + 40);
await p.setViewportSize({ width: 1440, height: Math.max(900, full) });
await p.waitForTimeout(600);
run.shots.full = await shot(p, 'train-board-full-1440');
await p.setViewportSize({ width: 1440, height: 900 });
await p.locator('.tb-node[data-kind="cfg"]').first().click();
await p.waitForTimeout(400);
run.shots.drawer = await shot(p, 'train-drawer-cfg-1440');
run.board = await p.evaluate(() => ({
  nodes: [...document.querySelectorAll('.tb-node')].map((n) => n.innerText.replace(/\s+/g, ' ').trim()),
  big: document.querySelector('.tb-big')?.innerText.replace(/\s+/g, ' '),
  keys: document.querySelector('.tb-kv')?.innerText.replace(/\s+/g, ' '),
  hist: [...document.querySelectorAll('.tb-tbl tbody tr')].map((r) => r.innerText.replace(/\s+/g, ' ').trim()),
  go: document.querySelector('.tb-go')?.innerText,
}));

/* ② 불러오는 중 — 학습 기록 응답만 이 시험에서 1.5초 늦춤 */
await p.route(/\/api\/v1\/projects\/[^/]+\/train(\?|$)/, async (r) => { await new Promise((ok) => setTimeout(ok, 1500)); await r.continue(); });
await p.goto(TRAIN(), { waitUntil: 'commit' });
await p.waitForSelector('.k-ld.is-on', { timeout: 15000 });
await p.waitForTimeout(250);
run.shots.loading = await shot(p, 'loading-train-1440');
run.loader.slow_train_label = await p.evaluate(() => document.querySelector('.k-ld-t')?.textContent);
await p.waitForFunction(() => document.documentElement.dataset.trainBoard === '1', null, { timeout: 30000 });
await p.unroute(/\/api\/v1\/projects\/[^/]+\/train(\?|$)/);

/* XI맵 첫 열기 — 가운데 판(늦추지 않음 · 같은 로그인으로 새 창 — 화면 파일 보관 전 첫 열기) */
const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ko-KR', storageState: await ctx.storageState() });
const p2 = await ctx2.newPage();
p2.on('console', (m) => { if (m.type() === 'error') run.errors.push(`xi-clean · ${m.text().slice(0, 300)}`); });
p2.on('pageerror', (e) => run.errors.push(String(e).slice(0, 300)));
await p2.goto(APP + '/landxi/v3/xi-clean/', { waitUntil: 'commit' });
const xiShown = await p2.waitForSelector('.k-ld.is-on', { timeout: 8000 }).then(() => true).catch(() => false);
run.loader.ximap_first_open_shown = xiShown;
if (xiShown) { run.shots.ximap = await shot(p2, 'loading-ximap-1440'); run.loader.ximap_label = await p2.evaluate(() => document.querySelector('.k-ld-t')?.textContent); }
await p2.waitForFunction(() => window.__xc?.boot?.shown, null, { timeout: 30000 }).catch(() => {});
await p2.waitForTimeout(1500);

fs.writeFileSync(path.join(DIR, 'run.json'), JSON.stringify(run, null, 2));
console.log(JSON.stringify({ shots: run.shots, errors: run.errors, local: run.local.length, loader: run.loader, board: run.board }, null, 1));
await browser.close();
process.exit(0);
