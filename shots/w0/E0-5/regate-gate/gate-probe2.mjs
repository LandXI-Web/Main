// 게이트 보조 검증 — 기본 모드 좌 판 펼침 상태의 하단 띠 스크롤바 · 범례/시점 스트립 겹침이 새 경로(#l-open) 탓인지, 원래 상태인지
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
const BASE = 'http://localhost:4173/landxi/proto/';
const OUT = fileURLToPath(new URL('./', import.meta.url));
const FARM = 'namwon-farmland-2025';
const b = await chromium.launch({ channel: 'chrome' });
const log = {};
async function open(w, h, url) {
  const ctx = await b.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  await page.addInitScript(() => { localStorage.setItem('lx_logged_in', '1'); localStorage.setItem('lx_role', 'staff'); localStorage.removeItem('lx-map-props'); });
  await page.goto(BASE + url);
  await page.waitForFunction(() => document.documentElement.dataset.shell === 'ready');
  await page.waitForFunction(() => window.__lxMap?.A?.getSource?.('namwon-farmland-2025') != null, null, { timeout: 20000 });
  return page;
}
const geo = (p) => p.evaluate(() => {
  const r = (s) => { const e = document.querySelector(s); if (!e) return null; const q = e.getBoundingClientRect(); return { x: Math.round(q.left), y: Math.round(q.top), w: Math.round(q.width), h: Math.round(q.height) }; };
  const mb = document.querySelector('.mb-collapsed');
  const legend = document.querySelector('#legend, .mw-legend, [class*="legend"]');
  const strip = document.querySelector('#strip');
  const overlap = legend && strip ? (() => { const a = legend.getBoundingClientRect(), s = strip.getBoundingClientRect(); return Math.max(0, Math.min(a.right, s.right) - Math.max(a.left, s.left)) * Math.max(0, Math.min(a.bottom, s.bottom) - Math.max(a.top, s.top)); })() : null;
  return { left: document.querySelector('#mw').dataset.left, url: location.search, mb: mb ? { over: mb.scrollWidth - mb.clientWidth, ox: getComputedStyle(mb).overflowX, ...r('.mb-collapsed') } : null, legend: legend ? { cls: legend.className, id: legend.id, ...r('#' + legend.id) } : null, strip: r('#strip'), overlapPx: overlap };
});
for (const [w, h] of [[1440, 900], [1280, 720]]) {
  // 1. 기본 착지(좌 판 on · 기본 fold)
  let p = await open(w, h, `ximap.html?on=${FARM}`);
  await p.waitForTimeout(900);
  log[`${w} landing`] = await geo(p);
  await p.screenshot({ path: OUT + `p2-landing-${w}.png` });
  await p.close();
  // 2. 옛 경로: left=off 착지 → #l-open
  p = await open(w, h, `ximap.html?on=${FARM}&left=off`);
  await p.waitForTimeout(600);
  log[`${w} left=off`] = await geo(p);
  await p.locator('#l-open').click(); await p.waitForTimeout(700);
  log[`${w} left=off → l-open`] = await geo(p);
  await p.screenshot({ path: OUT + `p2-old-lopen-${w}.png` });
  await p.close();
  // 3. 새 경로: 정보 판 → #l-open (700ms 뒤 · 2000ms 뒤)
  p = await open(w, h, `ximap.html?on=${FARM}&fold=0`);
  await p.locator('#tbody tr[data-row]').first().click(); await p.waitForTimeout(600);
  await p.locator('#l-open').click(); await p.waitForTimeout(700);
  log[`${w} info → l-open @700`] = await geo(p);
  await p.waitForTimeout(1500);
  log[`${w} info → l-open @2200`] = await geo(p);
  await p.screenshot({ path: OUT + `p2-new-lopen-${w}.png` });
  await p.close();
}
await b.close();
console.log(JSON.stringify(log, null, 1));
