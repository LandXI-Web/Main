// E0-5 재게이트 must_fix 4건 확인 — node shots/w0/E0-5/regate-probe.mjs [shot]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const BASE = 'http://localhost:4173/landxi/proto/';
import { fileURLToPath } from 'node:url';
const OUT = fileURLToPath(new URL('./regate/', import.meta.url));
mkdirSync(OUT, { recursive: true });
const SHOT = process.argv.includes('shot');
const FARM = 'namwon-farmland-2025';
const b = await chromium.launch({ channel: 'chrome' });
const log = {};
async function open(w, h, url) {
  const ctx = await b.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  await page.addInitScript(() => { localStorage.setItem('lx_logged_in', '1'); localStorage.setItem('lx_role', 'staff'); localStorage.removeItem('lx-map-props'); });
  await page.goto(BASE + url);
  await page.waitForFunction(() => document.documentElement.dataset.shell === 'ready');
  return page;
}
const ratio = (p) => p.evaluate(() => { const c = document.querySelector('#map-a canvas').getBoundingClientRect(), m = document.querySelector('#mw').getBoundingClientRect(); return +((c.width * c.height) / (m.width * m.height)).toFixed(3); });
const shot = async (p, n) => { if (SHOT) await p.screenshot({ path: OUT + n + '.png' }); };
const scrollbars = (p) => p.evaluate(() => [...document.querySelectorAll('#mw *')].filter((e) => { const cs = getComputedStyle(e); return /auto|scroll/.test(cs.overflowX) && e.scrollWidth > e.clientWidth + 1 && e.offsetParent; }).map((e) => (e.id ? '#' + e.id : '.' + [...e.classList].join('.')) + ` ${e.scrollWidth}>${e.clientWidth}`));

for (const [w, h] of [[1440, 900], [1280, 720]]) {
  // ① 겹쳐보기 → 변경 › → 변화 결과 보기 ›
  let p = await open(w, h, `ximap.html?on=${FARM}&mode=overlay`);
  await p.waitForFunction(() => window.__lxMap?.B?.getStyle() != null, null, { timeout: 20000 });
  await p.locator('#ch-base').click(); await p.waitForTimeout(600);
  log[`${w} overlay left-open scrollbars`] = await scrollbars(p);
  await shot(p, `r2-left-open-${w}`);
  await p.locator('[data-cmp-open]').click(); await p.waitForTimeout(600);
  log[`${w} overlay left+cmp`] = { left: await p.evaluate(() => document.querySelector('#mw').dataset.left), ratio: await ratio(p) };
  await shot(p, `r1-left+cmp-${w}`);
  // 비교 판 열린 채 #l-open
  await p.locator('#l-open').click(); await p.waitForTimeout(600);
  log[`${w} overlay cmp then l-open`] = { side: await p.locator('.mw-side .mi').count(), ratio: await ratio(p) };
  await p.close();
  // ② 기본 — 정보 판 열린 채 #l-open, 그 뒤 행 고르기(핀 뒤 정보 판)
  p = await open(w, h, `ximap.html?on=${FARM}&fold=0`);
  await p.waitForFunction(() => window.__lxMap?.A?.getSource?.('namwon-farmland-2025') != null, null, { timeout: 20000 });
  await p.locator('#tbody tr[data-row]').first().click(); await p.waitForTimeout(600);
  log[`${w} info`] = { ratio: await ratio(p) };
  const pk = await p.evaluate(() => { const el = document.querySelector('.mb-peek'), r = el.querySelector('.row'), pr = el.getBoundingClientRect();
    return { row: r.textContent, pkS: el.querySelector('.pk-s').scrollWidth - el.querySelector('.pk-s').clientWidth, rowClip: r.scrollWidth - r.clientWidth, peekOver: el.scrollWidth - el.clientWidth,
      out: [...el.querySelectorAll('[data-peek],[data-ttab],#mb-full')].filter((x) => { const q = x.getBoundingClientRect(); return q.left < pr.left - 1 || q.right > pr.right + 1; }).length }; });
  log[`${w} peek`] = pk;
  await shot(p, `r3-peek-${w}`);
  await p.locator('#l-open').click(); await p.waitForTimeout(600);
  log[`${w} info then l-open`] = { side: await p.evaluate(() => document.querySelector('#mw').dataset.side), ratio: await ratio(p) };
  await p.locator('#mb-open').click(); await p.locator('#tbody tr[data-row]').nth(2).click(); await p.waitForTimeout(600);
  log[`${w} pinned then row`] = { left: await p.evaluate(() => document.querySelector('#mw').dataset.left), ratio: await ratio(p) };
  await p.close();
}
// ④ 레이어 탭 머리 · 통계 기준 줄
let p = await open(1440, 900, `ximap.html?panel=layer`);
await p.waitForTimeout(800);
log['mt-note'] = await p.evaluate(() => { const e = document.querySelector('.mt-note'); return { text: e.innerText, h: e.getBoundingClientRect().height }; });
await shot(p, 'r4-layer-tab-1440');
await p.close();
p = await open(1440, 900, `stats-standard.html?result=${FARM}&left=off`);
await p.waitForTimeout(1500);
log['basis demo'] = await p.locator('.dw-basis li[aria-disabled="true"]').evaluateAll((l) => l.map((x) => ({ t: x.innerText.replace(/\s+/g, ' '), n: (x.innerText.match(/시연/g) || []).length })));
await p.locator('.dw-basis').screenshot({ path: OUT + 'r4-stats-basis-1440.png' }).catch(() => {});
await p.close();
await b.close();
console.log(JSON.stringify(log, null, 1));
