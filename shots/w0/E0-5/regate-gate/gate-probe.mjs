// E0-5 재게이트 — 게이트 독립 검증. node shots/w0/E0-5/regate-gate/gate-probe.mjs [headed]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const BASE = 'http://localhost:4173/landxi/proto/';
const OUT = fileURLToPath(new URL('./', import.meta.url));
mkdirSync(OUT, { recursive: true });
const HEADED = process.argv.includes('headed');
const FARM = 'namwon-farmland-2025';
const b = await chromium.launch({ channel: 'chrome', headless: !HEADED });
const log = {}; const errs = [];
async function open(w, h, url) {
  const ctx = await b.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(`${url} pageerror ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(`${url} console ${m.text().slice(0, 200)}`); });
  await page.addInitScript(() => { localStorage.setItem('lx_logged_in', '1'); localStorage.setItem('lx_role', 'staff'); localStorage.removeItem('lx-map-props'); });
  await page.goto(BASE + url);
  await page.waitForFunction(() => document.documentElement.dataset.shell === 'ready');
  return page;
}
const ratio = (p) => p.evaluate(() => { const c = document.querySelector('#map-a canvas').getBoundingClientRect(), m = document.querySelector('#mw').getBoundingClientRect(); return +((c.width * c.height) / (m.width * m.height)).toFixed(3); });
const state = (p) => p.evaluate(() => { const mw = document.querySelector('#mw'); return { left: mw.dataset.left, side: mw.dataset.side, lw: Math.round(document.querySelector('#mw-l').getBoundingClientRect().width), sw: Math.round(document.querySelector('#side').getBoundingClientRect().width), mi: document.querySelectorAll('.mw-side .mi').length, url: location.search }; });
const shot = (p, n) => p.screenshot({ path: OUT + n + '.png' });
const scrollbars = (p) => p.evaluate(() => [...document.querySelectorAll('#mw *')].filter((e) => { const cs = getComputedStyle(e); return /auto|scroll/.test(cs.overflowX) && e.scrollWidth > e.clientWidth + 1 && e.offsetParent; }).map((e) => (e.id ? '#' + e.id : '.' + [...e.classList].join('.')) + ` ${e.scrollWidth}>${e.clientWidth}`));
const anyOverflowX = (p) => p.evaluate(() => [...document.querySelectorAll('#mw *')].filter((e) => e.offsetParent && e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX !== 'visible').map((e) => (e.id ? '#' + e.id : '.' + [...e.classList].join('.')) + ` ${e.scrollWidth}>${e.clientWidth} ox=${getComputedStyle(e).overflowX}`));
const tag = HEADED ? 'h-' : '';

for (const [w, h] of [[1440, 900], [1280, 720]]) {
  // A. 겹쳐보기: 변경 › → 변화 결과 보기 › → side-x(자동 접힘 복귀?) → 다시 판 열기 → #l-open
  let p = await open(w, h, `ximap.html?on=${FARM}&mode=overlay`);
  await p.waitForFunction(() => window.__lxMap?.B?.getStyle() != null, null, { timeout: 20000 });
  log[`${w} A0 enter`] = { ...(await state(p)), ratio: await ratio(p) };
  await p.locator('#ch-base').click(); await p.waitForTimeout(600);
  log[`${w} A1 ch-base`] = { ...(await state(p)), ratio: await ratio(p), bars: await scrollbars(p), ox: await anyOverflowX(p) };
  await shot(p, `${tag}a1-left-open-${w}`);
  await p.locator('[data-cmp-open]').click(); await p.waitForTimeout(700);
  log[`${w} A2 cmp-open`] = { ...(await state(p)), ratio: await ratio(p), bars: await scrollbars(p) };
  await shot(p, `${tag}a2-left+cmp-${w}`);
  await p.locator('#side-x').click(); await p.waitForTimeout(600);
  log[`${w} A3 side-x (auto restore?)`] = { ...(await state(p)), ratio: await ratio(p) };
  await shot(p, `${tag}a3-after-side-x-${w}`);
  // 판 다시 열고 #l-open
  const btn = p.locator('[data-cmp-open]');
  if (await btn.count()) { await btn.click(); await p.waitForTimeout(600); }
  log[`${w} A4 cmp-open again`] = { ...(await state(p)), ratio: await ratio(p) };
  await p.locator('#l-open').click(); await p.waitForTimeout(600);
  log[`${w} A5 l-open`] = { ...(await state(p)), ratio: await ratio(p) };
  await shot(p, `${tag}a5-l-open-${w}`);
  // 뒤로가기(popstate) 뒤 판 셋?
  await p.goBack(); await p.waitForTimeout(700);
  log[`${w} A6 back`] = { ...(await state(p)), ratio: await ratio(p) };
  // 하단 띠 줄바꿈 상태
  log[`${w} A7 band`] = await p.evaluate(() => [...document.querySelectorAll('.mw-band')].map((e) => ({ h: Math.round(e.getBoundingClientRect().height), w: Math.round(e.getBoundingClientRect().width), t: e.innerText.replace(/\n/g, '|') })));
  await p.close();

  // B. 기본: 정보 판 → #l-open → 표 상태 → 행 고르기 → side-x → 좌 판 복귀?
  p = await open(w, h, `ximap.html?on=${FARM}&fold=0`);
  await p.waitForFunction(() => window.__lxMap?.A?.getSource?.('namwon-farmland-2025') != null, null, { timeout: 20000 });
  log[`${w} B0 table open`] = { ...(await state(p)), ratio: await ratio(p) };
  await p.locator('#tbody tr[data-row]').first().click(); await p.waitForTimeout(600);
  log[`${w} B1 info`] = { ...(await state(p)), ratio: await ratio(p), bars: await scrollbars(p) };
  log[`${w} B1 peek`] = await p.evaluate(() => { const el = document.querySelector('.mb-peek'), r = el.querySelector('.row'), s = el.querySelector('.pk-s'), pr = el.getBoundingClientRect();
    const q = (x) => { const b = x.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.width)]; };
    return { row: r.textContent.trim(), h: Math.round(pr.height), sClip: s.scrollWidth - s.clientWidth, rClip: r.scrollWidth - r.clientWidth, btns: [...el.querySelectorAll('[data-peek],[data-ttab],#mb-full')].map((x) => [x.textContent.trim(), ...q(x)]) }; });
  await shot(p, `${tag}b1-peek-${w}`);
  await p.locator('.mb-peek').screenshot({ path: OUT + `${tag}b1-peek-crop-${w}.png` });
  await p.locator('#l-open').click(); await p.waitForTimeout(600);
  log[`${w} B2 l-open`] = { ...(await state(p)), ratio: await ratio(p), fold: await p.evaluate(() => document.querySelector('.mb')?.className + ' ' + [...document.querySelector('.mb')?.attributes || []].map((a) => a.name).join(',')), peek: await p.locator('.mb-peek').count() };
  await shot(p, `${tag}b2-l-open-${w}`);
  await p.locator('#mb-open').click(); await p.waitForTimeout(300);
  log[`${w} B3 table reopened`] = { ...(await state(p)), ratio: await ratio(p) };
  await p.locator('#tbody tr[data-row]').nth(2).click(); await p.waitForTimeout(700);
  log[`${w} B4 pinned then row`] = { ...(await state(p)), ratio: await ratio(p) };
  await shot(p, `${tag}b4-pinned-row-${w}`);
  await p.locator('#side-x').click(); await p.waitForTimeout(600);
  log[`${w} B5 side-x`] = { ...(await state(p)), ratio: await ratio(p) };
  await shot(p, `${tag}b5-side-x-${w}`);
  // 서랍(통계) 열린 채 #l-open
  const st = p.locator('#stats-open, [data-side="stats"], #st-open').first();
  await p.close();

  // C. 서랍(통계) + #l-open
  p = await open(w, h, `ximap.html?on=${FARM}&side=stats`);
  await p.waitForTimeout(1200);
  log[`${w} C0 drawer`] = { ...(await state(p)), ratio: await ratio(p), lopen: await p.locator('#l-open').isVisible().catch(() => 'n/a') };
  if (await p.locator('#l-open').isVisible().catch(() => false)) {
    await p.locator('#l-open').click(); await p.waitForTimeout(600);
    log[`${w} C1 drawer l-open`] = { ...(await state(p)), ratio: await ratio(p) };
    await shot(p, `${tag}c1-drawer-lopen-${w}`);
  }
  await p.close();
}
// D. 레이어 탭 · 통계 기준 줄 (1440)
let p = await open(1440, 900, `ximap.html?panel=layer`);
await p.waitForTimeout(800);
log['D mt-note'] = await p.evaluate(() => { const e = document.querySelector('.mt-note'); return { text: e.innerText, h: Math.round(e.getBoundingClientRect().height), wb: getComputedStyle(e).wordBreak }; });
await p.locator('#mw-l').screenshot({ path: OUT + `${tag}d-layer-tab.png` });
await p.close();
p = await open(1440, 900, `ximap.html?on=${FARM}&side=stats`);
await p.waitForTimeout(1500);
log['D basis'] = await p.locator('.dw-basis li').evaluateAll((l) => l.map((x) => ({ t: x.innerText.replace(/\s+/g, ' '), n: (x.innerText.match(/시연/g) || []).length, h: Math.round(x.getBoundingClientRect().height) })));
await p.locator('.dw-basis').screenshot({ path: OUT + `${tag}d-basis.png` }).catch((e) => { log['D basis shot err'] = e.message; });
await p.close();
await b.close();
log.errs = errs;
console.log(JSON.stringify(log, null, 1));
