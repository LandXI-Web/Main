/* 구현 40 · XI맵 색 바꾸기(공용 kit/colors.js) · 지도 서비스 '목록' 끈 클래스 빠짐 — 증거.
   바깥 주소 · 로그인 폼 LX 직원 한 번(세션 주입 0). node docs/superpowers/final/process/impl-40/ximap-colors/shoot.mjs   (01. 디자인 에서)
   → shots/*.png(파일 끝 네 자리 = 찍은 시각) · run.json */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';

const ROOT = 'E:/Land-XI 플랫폼/01. 디자인';
const HW = 'C:/Users/User/AppData/Local/ms-playwright';
if (fs.existsSync(HW)) process.env.PLAYWRIGHT_BROWSERS_PATH = HW;
if (!process.env.DEV_PASSWORD) { const m = fs.readFileSync(path.join(ROOT, 'server/.env'), 'utf8').match(/^DEV_PASSWORD=(.*?)\s*$/m); if (m) process.env.DEV_PASSWORD = m[1]; }
process.env.LX_PW ||= process.env.DEV_PASSWORD;
const { chromium } = createRequire(path.join(ROOT, 'package.json'))('playwright');
const { frontDoor } = await import(pathToFileURL(path.join(ROOT, 'landxi/v3/kit/lint/forbidden.mjs')).href);
const DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(DIR, 'shots');
fs.mkdirSync(OUT, { recursive: true });
const APP = process.env.APP || 'https://app.land-xi.dev';
const kst = () => new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' });
const hm = () => kst().slice(11, 16).replace(':', '');
const RF = path.join(DIR, 'run.json');
const run = { at: kst(), app: APP, shots: {}, errors: [], bad: [], local: [], xi: {}, stat: {}, list: {}, small: [] };
const save = () => fs.writeFileSync(RF, JSON.stringify(run, null, 1));
setTimeout(() => { run.timeout = true; save(); process.exit(2); }, 1500000).unref();

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
p.on('console', (m) => { if (m.type() === 'error') run.errors.push(`${kst().slice(11)} ${m.text().slice(0, 300)}`); });
p.on('pageerror', (e) => run.errors.push(`${kst().slice(11)} pageerror ${String(e).slice(0, 300)}`));
p.on('request', (r) => { if (/\/\/(127\.0\.0\.1|localhost|\[::1\])|:8700|:4173/.test(r.url())) run.local.push(r.url()); });
p.on('response', (r) => { if (r.status() >= 400 && !/favicon/.test(r.url())) run.bad.push(`${kst().slice(11)} ${r.status()} ${r.url().replace(/[?#].*$/, '').slice(0, 160)}`); });
let CDP = null;
const shot = async (name) => {
  const f = `${name}-1440-${hm()}.png`;
  try { await p.screenshot({ path: path.join(OUT, f), timeout: 8000 }); }
  catch { CDP ||= await ctx.newCDPSession(p); const { data } = await CDP.send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(OUT, f), Buffer.from(data, 'base64')); run.cdpShots = (run.cdpShots || 0) + 1; }
  run.shots[f] = kst(); save(); return f;
};
const small = (tag, sel) => p.evaluate((sel) => { const out = []; for (const el of document.querySelectorAll(sel)) { if (!el.textContent.trim() || el.children.length) continue; const r = el.getBoundingClientRect(); if (!r.width) continue; const fs = parseFloat(getComputedStyle(el).fontSize); if (fs < 14) out.push([el.className, fs, el.textContent.trim().slice(0, 20)]); } return out; }, sel).then((x) => { if (x.length) run.small.push({ tag, x }); });
const settle = () => p.waitForFunction(() => !window.__xc.map.isMoving() && window.__xc.map.areTilesLoaded(), null, { timeout: 30000 }).catch(() => {});
async function home() {
  await p.goto(APP + '/landxi/v3/xi-clean/', { waitUntil: 'commit' });
  await p.waitForFunction(() => window.__xc?.map && window.__xc.boot?.shown && window.__xc?.board?.nat?.layers?.length > 0, null, { timeout: 90000, polling: 200 });
  await settle(); await p.waitForTimeout(1200);
}
async function jump(c, z) { await p.evaluate(([c, z]) => { window.__xc.map.jumpTo({ center: c, zoom: z }); }, [c, z]); await p.waitForTimeout(800); await settle(); await p.waitForTimeout(1500); }
async function layersPop(open = true) {
  const isOpen = await p.evaluate(() => !document.querySelector('.xc-pop')?.hidden && !!document.querySelector('.xc-pop .xc-row--cls'));
  if (isOpen !== open) await p.locator('.xc-tool[data-tool="layers"]').click();
  await p.waitForTimeout(500);
}
/** 지도에서 그 클래스의 색 — 전국 결과 객체 층 · 서비스 결과 층의 fill-color 식에 그 색이 들었는가 */
const paintHas = (col) => p.evaluate((col) => {
  const m = window.__xc.map, out = { nat: 0, natWith: 0, svc: 0, svcWith: 0 };
  for (const L of m.getStyle().layers) {
    if (L.type !== 'fill') continue;
    const isNat = /^xn-.*(-f|-face)$/.test(L.id), isSvc = /^xb-r-.*-fill$/.test(L.id);
    if (!isNat && !isSvc) continue;
    const s = JSON.stringify(m.getPaintProperty(L.id, 'fill-color') || '').toLowerCase();
    if (isNat) { out.nat++; if (s.includes(col.toLowerCase())) out.natWith++; } else { out.svc++; if (s.includes(col.toLowerCase())) out.svcWith++; }
  }
  return out;
}, col);
const PURPLE = '#7c5cfa';
const NAMWON = [127.3905, 35.4086];

await frontDoor(p, APP, 'test@lx.or.kr', 'app');
await p.waitForURL((u) => !/\/login\/?$/.test(u.pathname), { timeout: 30000 });
run.login_at = kst();
await home();
await p.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('lx.colors.v1.')) localStorage.removeItem(k); });
await home();
await jump(NAMWON, 15.2);
await shot('01-xi-default');

/* 1 '층' 판 클래스 줄 색 점 → 색 칸(클래스마다) */
await layersPop(true);
run.xi.classes = await p.evaluate(() => [...document.querySelectorAll('.xc-pop .xc-cdot')].map((b) => [b.dataset.cls, b.firstElementChild.style.background]));
await shot('02-layers-dots');
const target = run.xi.classes.find(([c]) => c === '비닐하우스')?.[0] || run.xi.classes[0]?.[0];
run.xi.target = target;
await p.locator(`.xc-pop .xc-cdot[data-cls="${target}"]`).click(); await p.waitForTimeout(500);
await small('panel', '.kc *, .xc-pop *');
await shot('03-color-open');
await p.locator(`.kc-row[data-k="${target}"] .kc-sw[title="${PURPLE.toUpperCase()}"]`).click(); await p.waitForTimeout(400); await settle(); await p.waitForTimeout(800);
run.xi.afterPick = { paint: await paintHas(PURPLE), boardColor: await p.evaluate((c) => window.__xc.board ? null : null, target), colors: await p.evaluate(() => window.__xc.colors),
  dot: await p.evaluate((c) => document.querySelector(`.xc-pop .xc-cdot[data-cls="${c}"] i`)?.style.background, target),
  reclassColor: await p.evaluate((c) => window.__xc.colorFor('x', c), target), hudDots: await p.evaluate(() => [...document.querySelectorAll('.xv-dot i, .xv-it i, .xb-p i, .xb-rows i')].map((i) => i.style.background).slice(0, 8)) };
save();
await shot('04-color-purple');
/* 색 묶음 '색약 구분' · 투명도 40% */
await p.locator('.kc-set[aria-label="색약 구분"]').click(); await p.waitForTimeout(600);
await p.locator('.kc-op').evaluate((el) => { el.value = '40'; el.dispatchEvent(new Event('input', { bubbles: true })); });
await p.waitForTimeout(600); await settle(); await p.waitForTimeout(800);
run.xi.afterSet = { colors: await p.evaluate(() => window.__xc.colors), opacity: await p.evaluate(() => { const m = window.__xc.map; const L = m.getStyle().layers.find((l) => /^xn-o-.*-f$/.test(l.id)); return L ? JSON.stringify(m.getPaintProperty(L.id, 'fill-opacity')).slice(0, 200) : null; }) };
save();
await shot('05-color-cvd-op40');
await p.keyboard.press('Escape'); await p.waitForTimeout(300);

/* 2 다시 열어도 기억 */
await home(); await jump(NAMWON, 15.2);
await layersPop(true);
run.xi.reload = { colors: await p.evaluate(() => window.__xc.colors || null), dots: await p.evaluate(() => [...document.querySelectorAll('.xc-pop .xc-cdot')].map((b) => [b.dataset.cls, b.firstElementChild.style.background])) };
run.xi.reload.paintCvd = await paintHas('#e69f00');
save();
await shot('06-reload-remembered');
await layersPop(false);

/* 3 지도 위 통계 — 판 '지도 색' 점 → 색 띠 · 단계 */
const say = async (q) => { const inp = p.locator('.k-chat-root[data-dock] .k-ck-i'); await inp.click(); await inp.fill(''); await inp.pressSequentially(q, { delay: 15 }); await inp.press('Enter'); };
await say('남원시 현황 보여 줘');
const ok = await p.waitForFunction(() => window.__xc.dash?.mode === 'map' && window.__xc.dash.fill === 'done', null, { timeout: 120000 }).then(() => true, () => false);
run.stat.shown = ok;
if (ok) {
  await p.waitForTimeout(2500);
  await p.locator('.xo-mini-b').click().catch(() => {});
  await p.waitForFunction(() => window.__xc.dash?.step === 2, null, { timeout: 15000 }).catch(() => {});
  await p.waitForTimeout(1500);
  const cols = () => p.evaluate(() => { const s = window.__xc.map.getSource('xo-f'); const d = s?._data || s?.serialize?.().data; const fs = (d?.features || []).filter((f) => f.properties.v != null); return fs.slice(0, 6).map((f) => f.properties.col); });
  run.stat.before = { cols: await cols(), legend: await p.evaluate(() => document.querySelector('.xo-mp > div')?.outerHTML.slice(0, 300)), cat: await p.evaluate(() => [...document.querySelectorAll('.xo-leg li')].map((li) => [li.textContent.trim().slice(0, 12), li.querySelector('i')?.style.background])) };
  await shot('07-stat-panel');
  await p.locator('.xo-cd').click(); await p.waitForTimeout(500);
  await small('stat-panel', '.kc *, .xo-mp *');
  await shot('08-stat-color-open');
  await p.locator('.kc-ramp[aria-label="색약 구분"]').click(); await p.waitForTimeout(500);
  await p.locator('.kc-seg button', { hasText: '단계' }).click(); await p.waitForTimeout(800);
  run.stat.after = { cols: await cols(), legend: await p.evaluate(() => document.querySelector('.xo-mp > div')?.outerHTML.slice(0, 300)), colors: await p.evaluate(() => window.__xc.colors?.stat),
    dot: await p.evaluate(() => document.querySelector('.xo-cd')?.getAttribute('style')), cat: await p.evaluate(() => [...document.querySelectorAll('.xo-leg li')].map((li) => [li.textContent.trim().slice(0, 12), li.querySelector('i')?.style.background])) };
  save();
  await shot('09-stat-viridis-step');
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  /* 기본 색으로(통계) */
  await p.locator('.xo-cd').click(); await p.waitForTimeout(400);
  await p.locator('.kc-reset').click(); await p.waitForTimeout(800);
  run.stat.reset = { cols: await cols(), same: JSON.stringify(await cols()) === JSON.stringify(run.stat.before.cols) };
  await p.keyboard.press('Escape');
  await p.locator('.xo .xo-x').click().catch(() => {});
  await p.waitForTimeout(1500);
}
save();

/* 4 기본 색으로(클래스) */
await jump(NAMWON, 15.2);
await layersPop(true);
await p.locator('.xc-pop .xc-cdot').first().click(); await p.waitForTimeout(400);
await p.locator('.kc-reset').click(); await p.waitForTimeout(800); await settle();
run.xi.reset = { colors: await p.evaluate(() => window.__xc.colors), paintPurple: await paintHas(PURPLE), paintCvd: await paintHas('#e69f00') };
await shot('10-reset');
await p.keyboard.press('Escape');
save();

/* 5 지도 서비스 '목록' — 끈 클래스 빠짐 */
await p.goto(APP + '/landxi/v3/lx-map/', { waitUntil: 'commit' });
await p.waitForSelector('body[data-ready="1"]', { timeout: 90000 });
await p.waitForFunction(() => !window.__lm.map.isMoving() && window.__lm.map.areTilesLoaded(), null, { timeout: 25000 }).catch(() => {});
await p.waitForTimeout(1500);
for (let i = 0; i < 30; i++) { const g = p.locator('.lm-gt[aria-expanded="false"]').first(); if (!(await g.count())) break; await g.click(); await p.waitForTimeout(120); }
const LS = await p.evaluate(() => window.__lm.layers());
const tl = LS.filter((l) => !l.empty && l.cls.length > 1)[0];
run.list.layer = tl ? { region: tl.region, cls: tl.cls } : null;
if (tl) {
  const row = p.locator('.lm-ly li').filter({ has: p.locator(`.lm-cd[data-job="${tl.job}"]`) });
  if (!tl.on) { await row.locator('.lm-sw').click(); await p.waitForTimeout(1500); }
  await row.locator('.lm-lsb').click();
  await p.waitForFunction(() => /건/.test(document.querySelector('.lm-rsub')?.textContent || ''), null, { timeout: 30000 }).catch(() => {});
  run.list.before = await p.evaluate(() => ({ sub: document.querySelector('.lm-rsub')?.textContent, cls: [...new Set([...document.querySelectorAll('.lm-row b')].map((b) => b.textContent))] }));
  await shot('11-list-all');
  const off = tl.cls[0];
  await p.locator(`.lm-cb[data-cls="${off}"]`).click();
  await p.waitForFunction((o) => /보이는 것 기준/.test(document.querySelector('.lm-rsub')?.textContent || ''), off, { timeout: 30000 }).catch(() => {});
  await p.waitForTimeout(800);
  run.list.off = off;
  run.list.after = await p.evaluate(() => ({ sub: document.querySelector('.lm-rsub')?.textContent, cls: [...new Set([...document.querySelectorAll('.lm-row b')].map((b) => b.textContent))], left: document.querySelector('.lm-sum')?.innerText.replace(/\s+/g, ' ') }));
  run.list.offGone = !run.list.after.cls.includes(off);
  await small('list', '.lm-rsub, .lm-row *');
  await shot('12-list-class-off');
  await p.locator(`.lm-cb[data-cls="${off}"]`).click(); await p.waitForTimeout(1500);
}
save();
await browser.close();
run.done = kst(); save();
console.log(JSON.stringify({ errors: run.errors.length, bad: run.bad.length, local: run.local.length, shots: Object.keys(run.shots).length }));
