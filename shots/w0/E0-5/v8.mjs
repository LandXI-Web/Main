import { chromium } from '@playwright/test';
const OUT = 'shots/w0/E0-5/';
const b = await chromium.launch({ channel: 'chrome' });
const errs = [];
const X = (a, c) => Math.max(0, Math.min(a.right, c.right) - Math.max(a.left, c.left)) * Math.max(0, Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top));
async function page(w, h, url) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  p.on('pageerror', (e) => errs.push(e.message));
  await p.addInitScript(() => { localStorage.setItem('lx_logged_in', '1'); localStorage.setItem('lx_role', 'staff'); localStorage.removeItem('lx-map-props'); });
  await p.goto('http://localhost:4173/landxi/proto/' + url);
  await p.waitForFunction(() => document.querySelector('#map-a')?.dataset.map === 'ready', null, { timeout: 30000 });
  return p;
}
const measureCmp = (p) => p.evaluate((xs) => {
  const X = new Function('return ' + xs)();
  const r = (s) => document.querySelector(s)?.getBoundingClientRect();
  const c = r('#map-a canvas'), m = r('#mw'), ha = r('#ov-a .mw-ov--tl'), hb = r('#ov-b .mw-ov--tl');
  const scales = [...document.querySelectorAll('.mw-scale')].map((e) => { const q = e.getBoundingClientRect(); return [Math.round(q.width), Math.round(q.height)]; });
  const mv = [...document.querySelectorAll('.mv[data-ep]')].map((row) => { const k = row.querySelector('.mv-k'); if (!k) return 0; const kr = k.getBoundingClientRect(); return [...row.querySelectorAll('.mv-m')].reduce((s, e) => s + X(kr, e.getBoundingClientRect()), 0); });
  const mvClip = [...document.querySelectorAll('.mv[data-ep] .mv-m')].filter((e) => e.scrollWidth > e.clientWidth + 1).length;
  return { ratio: +((c.width * c.height) / (m.width * m.height)).toFixed(3), aW: Math.round(c.width), headX: Math.round(X(ha, hb)), ha: [Math.round(ha.left), Math.round(ha.right), Math.round(ha.bottom)], hb: [Math.round(hb.left), Math.round(hb.right), Math.round(hb.top)], scales, side: document.querySelector('#mw').dataset.side, left: document.querySelector('#mw').dataset.left, sideMi: document.querySelectorAll('.mw-side .mi').length, mvBadgeOverlap: mv, mvClip };
}, X.toString());
for (const [w, h] of [[1440, 900], [1280, 720]]) {
  // 1) 겹쳐보기 — 비교 결과 판을 연 뒤 `변경 ›`
  const p = await page(w, h, 'ximap.html?on=namwon-farmland-2025&mode=overlay');
  await p.waitForFunction(() => window.__lxMap?.B?.getStyle() != null, null, { timeout: 20000 });
  await p.locator('[data-cmp-open]').click(); await p.waitForTimeout(400);
  console.log(w, 'cmp-open', JSON.stringify(await measureCmp(p)));
  await p.locator('#ch-base').click(); await p.waitForTimeout(900);
  const m1 = await measureCmp(p); console.log(w, 'after 변경(base)', JSON.stringify(m1));
  await p.screenshot({ path: `${OUT}v8-cmp-left-open-${w}.png` });
  // 다른 시점 골라도 배지가 글자를 덮지 않는지 — 시점 행 전부 클릭
  const n = await p.locator('.mv[data-ep]').count();
  for (let i = 0; i < n; i++) { await p.locator('.mv[data-ep]').nth(i).click(); await p.waitForTimeout(250); const m = await measureCmp(p); console.log(w, 'ep', i, JSON.stringify({ mv: m.mvBadgeOverlap, clip: m.mvClip, headX: m.headX, ratio: m.ratio })); }
  await p.screenshot({ path: `${OUT}v8-cmp-epochs-${w}.png` });
  await p.close();
  // 2) 겹쳐보기 결과 없음(nopair)
  const q = await page(w, h, 'ximap.html?mode=overlay');
  await q.waitForFunction(() => window.__lxMap?.B?.getStyle() != null, null, { timeout: 20000 });
  await q.locator('#ch-cmp').click(); await q.waitForTimeout(900);
  console.log(w, 'nopair 변경(cmp)', JSON.stringify(await measureCmp(q)));
  await q.screenshot({ path: `${OUT}v8-overlay-nopair-${w}.png` });
  await q.close();
  // 3) peek 줄
  const r = await page(w, h, 'ximap.html');
  await r.locator('input[data-layer="namwon-farmland-2025"]:not([data-sub])').check();
  await r.waitForFunction(() => window.__lxMap?.A?.getSource('namwon-farmland-2025'), null, { timeout: 20000 });
  await r.locator('#mb-open').click();
  await r.locator('#tbody tr[data-row]').first().click(); await r.waitForTimeout(1000);
  const pk = await r.evaluate(() => { const el = document.querySelector('.mb-peek'), pr = el.getBoundingClientRect();
    const vis = [...el.querySelectorAll('[data-peek],[data-ttab],#mb-full')].map((x) => { const q = x.getBoundingClientRect(); return [x.textContent.trim(), q.left >= pr.left - 1 && q.right <= pr.right + 1, Math.round(q.height) < Math.round(q.width)]; });
    return { sw: el.scrollWidth, cw: el.clientWidth, font: getComputedStyle(el.querySelector('.row')).fontSize, vis };
  });
  console.log(w, 'peek', JSON.stringify(pk));
  await r.screenshot({ path: `${OUT}v8-peek-${w}.png` });
  await r.close();
}
console.log('errs', errs);
await b.close();
