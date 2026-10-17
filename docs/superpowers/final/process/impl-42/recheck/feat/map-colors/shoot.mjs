/* 구현 40 · 지도 서비스 — 색 바꾸기(공용 kit/colors.js) · 객체 다루기(마우스 · 겹침 · 클래스 켜끄기) 증거.
   바깥 주소 · 로그인 폼 LX 직원 한 번(세션 주입 0). node docs/superpowers/final/process/impl-40/map-colors/shoot.mjs   (01. 디자인 에서)   ONLY=shots,video
   → shots/*.png(파일 끝 네 자리 = 찍은 시각) · run.json · map-colors-10s.mp4 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
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
const OUT = path.join(DIR, 'shots'), VID = path.join(DIR, 'video-raw');
fs.mkdirSync(OUT, { recursive: true });
const APP = process.env.APP || 'https://app.land-xi.dev';
const ONLY = new Set((process.env.ONLY || 'shots,video').split(','));
const kst = () => new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' });
const hm = () => kst().slice(11, 16).replace(':', '');
const RF = path.join(DIR, 'run.json');
const run = { at: kst(), app: APP, shots: {}, errors: [], bad: [], local: [], colors: {}, objects: {}, classes: {}, small: [] };
const save = () => fs.writeFileSync(RF, JSON.stringify(run, null, 1));
setTimeout(() => { run.timeout = true; save(); process.exit(2); }, 900000).unref();

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...(ONLY.has('video') ? { recordVideo: { dir: VID, size: { width: 1440, height: 900 } } } : {}) });
const p = await ctx.newPage();
const T0 = Date.now();
p.on('console', (m) => { if (m.type() === 'error') run.errors.push(`${kst().slice(11)} ${m.text().slice(0, 300)}`); });
p.on('pageerror', (e) => run.errors.push(`${kst().slice(11)} pageerror ${String(e).slice(0, 300)}`));
p.on('request', (r) => { if (/\/\/(127\.0\.0\.1|localhost|\[::1\])|:8700|:4173/.test(r.url())) run.local.push(r.url()); });
p.on('response', (r) => { if (r.status() >= 400 && !/favicon/.test(r.url())) run.bad.push(`${kst().slice(11)} ${r.status()} ${r.url().replace(/[?#].*$/, '').slice(0, 160)}`); });
let CDP = null;
const shot = async (name) => {
  const f = `${name}-1440-${hm()}.png`;
  try { await p.screenshot({ path: path.join(OUT, f), timeout: 8000 }); }
  catch { CDP ||= await ctx.newCDPSession(p); const { data } = await CDP.send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(OUT, f), Buffer.from(data, 'base64')); run.cdpShots = (run.cdpShots || 0) + 1; }   // 화면 캡처가 글꼴 대기에 걸리면 같은 화면을 브라우저 캡처로
  run.shots[f] = kst(); save(); return f;
};
const settle = () => p.waitForFunction(() => !window.__lm.map.isMoving() && window.__lm.map.areTilesLoaded(), null, { timeout: 25000 }).catch(() => {});
const small = (tag) => p.evaluate(() => { const out = []; for (const el of document.querySelectorAll('.kc *, .lm-cls *, .lm-pick *, .lm-ovl, .lm-sum *, .lm-lgd *')) { if (!el.textContent.trim() || el.children.length) continue; const r = el.getBoundingClientRect(); if (!r.width) continue; const fs = parseFloat(getComputedStyle(el).fontSize); if (fs < 14) out.push([el.className, fs, el.textContent.trim().slice(0, 20)]); } return out; }).then((x) => { if (x.length) run.small.push({ tag, x }); });
const fillOf = (job) => p.evaluate((job) => JSON.stringify(window.__lm.map.getPaintProperty(`lm-r-${job}-fill`, 'fill-color')), job);
const opOf = (job) => p.evaluate((job) => JSON.stringify(window.__lm.map.getPaintProperty(`lm-r-${job}-fill`, 'fill-opacity')).slice(0, 160), job);

async function expandAll() { for (let i = 0; i < 30; i++) { const g = p.locator('.lm-gt[aria-expanded="false"]').first(); if (!(await g.count())) break; await g.click(); await p.waitForTimeout(120); } }
async function open() {
  await p.goto(APP + '/landxi/v3/lx-map/', { waitUntil: 'commit' });
  await p.waitForSelector('body[data-ready="1"]', { timeout: 90000 });
  await settle(); await p.waitForTimeout(1200);
}

await frontDoor(p, APP, 'test@lx.or.kr', 'app');
await p.waitForURL((u) => !/\/login\/?$/.test(u.pathname), { timeout: 30000 });
run.login_at = kst();
await open();
await p.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('lx.colors.v1.')) localStorage.removeItem(k); });   // 이 시험의 처음 = 기본 색
await open();

/* 여러 클래스가 있는 층 · 같은 지역에 층이 둘 이상인 곳을 고른다(겹침 시험) */
const LS = await p.evaluate(() => window.__lm.layers());
const usable = LS.filter((l) => !l.empty);
const byReg = (r) => usable.filter((l) => l.region === r);
const target = usable.filter((l) => l.cls.length > 1).sort((a, b) => byReg(b.region).length - byReg(a.region).length)[0] || usable[0];
run.layers = { n: LS.length, target: { region: target.region, cls: target.cls, same: byReg(target.region).length } }; save();
const job = target.job;
await expandAll();
const rowOf = (j) => p.locator('.lm-ly li').filter({ has: p.locator(`.lm-cd[data-job="${j}"]`) });
for (const l of LS.filter((l) => l.on && l.job !== job)) { await rowOf(l.job).locator('.lm-sw').click(); await p.waitForTimeout(400); }
if (!LS.find((l) => l.job === job).on) { await rowOf(job).locator('.lm-sw').click(); }
await settle(); await p.waitForTimeout(2000);
const dot = p.locator(`.lm-cd[data-job="${job}"]`);
run.colors.job = job;
run.colors.defaultFill = await fillOf(job);
await shot('01-map-default');

/* 1 색 칸 열기 → 색 묶음(색약 구분) */
await dot.click(); await p.waitForTimeout(400);
run.colors.classes = await p.locator('.kc-c span').allTextContents();
await shot('02-colors-open'); await small('open');
await p.locator('.kc-set[aria-label="색약 구분"]').click(); await p.waitForTimeout(700);
run.colors.afterSet = await fillOf(job);
await shot('03-colors-set-cvd');
/* 2 직접 고르기(첫 클래스 → 색 칸 보라) + 최근 색 */
const multi = (await p.locator('.kc-set').count()) > 0;
if (multi) { await p.locator('.kc-c').first().click(); await p.waitForTimeout(200); }
await p.locator('.kc-grid .kc-sw[aria-label="#7C5CFA"]').first().click(); await p.waitForTimeout(700);
run.colors.afterDirect = await fillOf(job);
run.colors.recent = await p.locator('.kc-rc .kc-sw').count();
await shot('04-colors-direct'); await small('direct');
/* 3 투명도 40% */
await p.locator('.kc-op').evaluate((el) => { el.value = '40'; el.dispatchEvent(new Event('input', { bubbles: true })); });
await p.waitForTimeout(700);
run.colors.afterOpacity = await opOf(job);
run.colors.opText = await p.locator('.kc-opr .num').textContent();
await shot('05-colors-opacity');
/* 4 신뢰도 색 띠(색약 구분 띠 · 단계) */
await p.locator('.kc-seg button', { hasText: '신뢰도' }).click(); await p.waitForTimeout(300);
await p.locator('.kc-ramp[aria-label="색약 구분"]').click(); await p.waitForTimeout(300);
await p.locator('.kc-seg button', { hasText: '단계' }).click(); await p.waitForTimeout(900);
run.colors.afterRamp = (await fillOf(job)).slice(0, 200);
await shot('06-colors-ramp-step'); await small('ramp');
await p.locator('.kc-ramp[aria-label="발산"]').click(); await p.locator('.kc-seg button', { hasText: '연속' }).click(); await p.waitForTimeout(900);
run.colors.afterDiverging = (await fillOf(job)).slice(0, 200);
await shot('07-colors-ramp-diverging');
/* 5 다시 열어도 기억 */
await p.keyboard.press('Escape');
await open();
await expandAll();
if ((await rowOf(job).locator('.lm-sw').getAttribute('aria-checked')) !== 'true') await rowOf(job).locator('.lm-sw').click();   // 다시 열면 가장 최근 층만 켜짐 — 시험 층을 다시 켠다
await p.waitForFunction((j) => !!window.__lm.map.getLayer(`lm-r-${j}-fill`), job, { timeout: 30000 }); await settle(); await p.waitForTimeout(1500);
run.colors.afterReload = { fill: (await fillOf(job)).slice(0, 200), dot: await p.locator(`.lm-cd[data-job="${job}"]`).getAttribute('style') };
await p.locator(`.lm-cd[data-job="${job}"]`).click(); await p.waitForTimeout(500);
run.colors.reloadState = await p.evaluate(() => ({ mode: document.querySelector('.kc-seg button[aria-checked="true"]')?.textContent, ramp: document.querySelector('.kc-ramp[aria-checked="true"]')?.getAttribute('aria-label'), op: document.querySelector('.kc-opr .num')?.textContent }));
await shot('08-colors-remembered');
/* 6 기본 색으로 */
await p.locator('.kc-reset').click(); await p.waitForTimeout(900);
run.colors.afterReset = await fillOf(job);
run.colors.resetSame = run.colors.afterReset === run.colors.defaultFill;
await shot('09-colors-reset');
await p.keyboard.press('Escape');
save();

/* 객체 다루기 — 켜진 층 둘 이상(같은 지역)으로 겹침을 만든다 */
const _unused = async () => p.evaluate(async () => {
  const rows = [...document.querySelectorAll('.lm-ly li')].filter((li) => li.querySelector('.lm-sw'));
  const on = rows.find((li) => li.classList.contains('is-on'));
  const reg = on?.querySelector('.lm-li b')?.textContent.split(' · ')[0];
  const more = rows.filter((li) => !li.classList.contains('is-on') && li.querySelector('.lm-li b')?.textContent.startsWith(reg + ' ·') && li.querySelector('.lm-cd:not(.is-none)'));
  return { reg, n: more.length };
});
await expandAll();
let added = 0;
for (const l of byReg(target.region).filter((l) => l.job !== job).slice(0, 2)) { const sw = rowOf(l.job).locator('.lm-sw'); if ((await sw.getAttribute('aria-checked')) !== 'true') { await sw.click(); added++; await p.waitForTimeout(1500); } }
await p.evaluate((j) => { const x = window.__lm.layers().find((l) => l.job === j); }, job);
await p.locator(`.lm-cd[data-job="${job}"]`).locator('xpath=..').locator('.lm-li').click();   // 시험 층 범위로
run.objects.added = added;
await settle(); await p.waitForTimeout(1500);
/* 지도 가운데를 가까이 → 객체 · 겹침 자리 찾기 */
const find = async () => p.evaluate(() => {
  const c = window.__lm.map.getCanvas().getBoundingClientRect(); let one = null, two = null, none = null;
  for (let y = 80; y < c.height - 80 && !(one && two && none); y += 9) for (let x = 60; x < c.width - 60; x += 9) {
    const n = window.__lm.objectsAt(x, y).length;
    if (n >= 2 && !two) two = { x, y, n }; else if (n === 1 && !one) one = { x, y }; else if (n === 0 && !none && x > 300) none = { x, y };
  }
  return { one, two, none, c: { x: c.x, y: c.y } };
});
let F = await find();
for (let z = 0; z < 3 && !F.two; z++) {
  const tgt = F.one || null;
  if (tgt) await p.evaluate((t) => window.__lm.map.easeTo({ center: window.__lm.map.unproject([t.x, t.y]), zoom: window.__lm.map.getZoom() + 1.5, duration: 0 }), tgt);
  await settle(); await p.waitForTimeout(1500); F = await find();
}
run.objects.found = F;
if (F.one) {
  await p.mouse.move(F.c.x + F.one.x, F.c.y + F.one.y); await p.waitForTimeout(400);
  run.objects.cursorObject = await p.evaluate(() => window.__lm.hover);
  await shot('10-mouse-object');
}
if (F.none) {
  await p.mouse.move(F.c.x + F.none.x, F.c.y + F.none.y); await p.waitForTimeout(400);
  run.objects.cursorEmpty = await p.evaluate(() => window.__lm.hover);
}
if (F.two) {
  await p.mouse.move(F.c.x + F.two.x, F.c.y + F.two.y); await p.waitForTimeout(500);
  run.objects.overlapHover = await p.evaluate(() => ({ ...window.__lm.hover, badge: document.querySelector('.lm-ovl:not([hidden])')?.textContent || null }));
  await shot('11-overlap-hover');
  await p.mouse.click(F.c.x + F.two.x, F.c.y + F.two.y); await p.waitForTimeout(700);
  run.objects.pick = await p.evaluate(() => ({ list: window.__lm.pick, rows: [...document.querySelectorAll('.lm-pick-r')].map((b) => b.innerText.replace(/\s+/g, ' ').trim()) }));
  await shot('12-overlap-pick'); await small('pick');
  await p.locator('.lm-pick-r').nth(1).click(); await p.waitForTimeout(1500);
  run.objects.picked = await p.evaluate(() => ({ props: !document.querySelector('.lm-props').hidden, title: document.querySelector('.lm-props h2')?.textContent }));
  await shot('13-overlap-picked');
}
save();

/* 클래스 끄기 — 가장 많은 클래스를 끈다 */
const cls = (await p.evaluate(() => [...document.querySelectorAll('.lm-cb')].map((b) => ({ c: b.dataset.cls, n: b.querySelector('em')?.textContent })))).sort((a, b) => Number(String(b.n).replace(/,/g, '')) - Number(String(a.n).replace(/,/g, '')));   // 가장 많은 클래스부터
run.classes.list = cls;
if (cls.length) {
  const c = cls[0].c;
  const before = await p.evaluate((c) => ({ sum: document.querySelector('.lm-sum b')?.textContent, drawn: window.__lm.map.queryRenderedFeatures({ layers: window.__lm.map.getStyle().layers.map((l) => l.id).filter((i) => /^lm-r-.*-fill$/.test(i) && window.__lm.map.getLayoutProperty(i, 'visibility') !== 'none') }).filter((f) => f.properties.cls === c).length }), c);
  await p.locator(`.lm-cb[data-cls="${c}"]`).click(); await p.waitForTimeout(1200);
  const after = await p.evaluate((c) => ({ sum: document.querySelector('.lm-sum b')?.textContent, vis: document.querySelector('.lm-vis')?.textContent || null, drawn: window.__lm.map.queryRenderedFeatures({ layers: window.__lm.map.getStyle().layers.map((l) => l.id).filter((i) => /^lm-r-.*-fill$/.test(i) && window.__lm.map.getLayoutProperty(i, 'visibility') !== 'none') }).filter((f) => f.properties.cls === c).length, checked: document.querySelector(`.lm-cb[data-cls="${c}"]`)?.getAttribute('aria-checked') }), c);
  run.classes.off = { cls: c, before, after };
  await shot('14-class-off'); await small('cls');
  await p.locator(`.lm-cb[data-cls="${c}"]`).click(); await p.waitForTimeout(800);
  run.classes.backOn = await p.evaluate(() => document.querySelector('.lm-sum b')?.textContent);
}
save();

/* 10초 녹화 구간 — 색 점 → 묶음 → 직접 → 투명도 → 띠 → 기본 색으로 → 클래스 끄기 · 켜기 → 겹침 고르기 */
if (ONLY.has('video')) {
  run.videoStart = (Date.now() - T0) / 1000;
  const d = p.locator(`.lm-cd[data-job="${job}"]`);
  await d.click(); await p.waitForTimeout(700);
  await p.locator('.kc-set[aria-label="선명"]').click(); await p.waitForTimeout(800);
  if (multi) { await p.locator('.kc-c').nth(1).click(); await p.waitForTimeout(400); }
  await p.locator('.kc-grid .kc-sw[aria-label="#F04452"]').first().click(); await p.waitForTimeout(700);
  for (const v of ['20', '40', '60']) { await p.locator('.kc-op').evaluate((el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }, v); await p.waitForTimeout(250); }
  await p.locator('.kc-seg button', { hasText: '신뢰도' }).click(); await p.waitForTimeout(900);
  await p.locator('.kc-reset').click(); await p.waitForTimeout(800);
  await p.keyboard.press('Escape');
  if (cls.length) { await p.locator(`.lm-cb[data-cls="${cls[0].c}"]`).click(); await p.waitForTimeout(900); await p.locator(`.lm-cb[data-cls="${cls[0].c}"]`).click(); await p.waitForTimeout(600); }
  if (F.two) { await p.mouse.move(F.c.x + F.two.x, F.c.y + F.two.y, { steps: 8 }); await p.waitForTimeout(600); await p.mouse.click(F.c.x + F.two.x, F.c.y + F.two.y); await p.waitForTimeout(1200); }
  await p.waitForTimeout(2500);
  run.videoEnd = (Date.now() - T0) / 1000;
}
save();
const vpath = ONLY.has('video') ? await p.video()?.path() : null;
await ctx.close(); await browser.close();
if (vpath) {
  const out = path.join(DIR, 'map-colors-10s.mp4');
  const ss = Math.max(0, run.videoStart - 0.5);   // 녹화는 페이지가 열린 때부터
  const len = Math.max(10, Math.min(14, run.videoEnd - run.videoStart));
  try { execFileSync('ffmpeg', ['-y', '-ss', ss.toFixed(1), '-i', vpath, '-t', len.toFixed(1), '-vf', 'scale=1280:-2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '28', '-an', out], { stdio: 'ignore' }); run.video = { out: path.basename(out), from_s: +ss.toFixed(1), len_s: +len.toFixed(1) }; } catch (e) { run.video = { error: String(e).slice(0, 200) }; }
  fs.rmSync(VID, { recursive: true, force: true });
}
save();
console.log(JSON.stringify({ errors: run.errors.length, bad: run.bad.length, local: run.local.length, small: run.small.length, resetSame: run.colors.resetSame, two: !!F.two, cls: run.classes.off?.after }, null, 0));
