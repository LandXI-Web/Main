import { chromium, frontDoor, SHOTS, HERE } from './_lib.mjs'; import path from 'node:path'; import fs from 'node:fs';
const [,, HOST = 'https://app.land-xi.dev', LOGIN = 'test@lx.or.kr', TAG = 'staff', BUBBLE = '강진군 경작지', W = '1440', OPTS = '{}'] = process.argv;
const W_ = Number(W), H_ = W_ < 600 ? 844 : 900, o = JSON.parse(OPTS);
const b = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await (await b.newContext({ viewport: { width: W_, height: H_ } })).newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 200))); p.on('console', m => { if (m.type() === 'error') errs.push('C:' + m.text().slice(0, 200)); });
const out = { host: HOST, w: W_, steps: {} }; const shot = (n) => p.screenshot({ path: path.join(SHOTS, `${TAG}-${W_}-${n}.png`) });
const T = (n, v) => { out.steps[n] = v; console.log(n, JSON.stringify(v)); };
await frontDoor(p, HOST, LOGIN, o.tenant ? { tenant: o.tenant } : undefined); await p.waitForTimeout(3000);
const open = async () => {
  await p.goto(HOST + '/landxi/v3/xi-clean/', { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => document.querySelector('canvas') && document.querySelector('.xb-hud button'), null, { timeout: 90000 }); await p.waitForTimeout(4000);
};
const st = () => p.evaluate(() => { const m = window.__xc.map; const f = (id, k) => m.getLayer(id) ? m.getPaintProperty(id, k) : null; const mp = document.querySelector('.xo-mp');
  return { z: +m.getZoom().toFixed(1), tint: window.__xc.tint, fillZero: JSON.stringify(f('xo-fill', 'fill-opacity')).slice(0, 60), sw: document.querySelector('.xo-tint')?.getAttribute('aria-checked'), scaleVisible: !!(mp && mp.querySelector('.xo-scale')?.getClientRects().length), dnVisible: !!(mp && mp.querySelector('.xo-dn')?.getClientRects().length), natVis: [...(window.__xc.map.getStyle().layers || [])].filter(l => /-face$|-f$/.test(l.id) && l.layout?.visibility !== 'none').length }; });
await open();
if (o.layersFirst) { await p.locator('.xc-tool', { hasText: '층' }).click(); await p.waitForTimeout(800); T('layers-before-stats', await p.evaluate(() => !!document.querySelector('[data-tint-row]'))); await shot('layers-nostats'); }
await p.evaluate((t) => ([...document.querySelectorAll('.xs-c-bub')].find((e) => e.innerText.includes(t)) || document.querySelector('.xs-c-bub'))?.click(), BUBBLE);
await p.waitForFunction(() => document.querySelector('.xo:not([hidden]) .xo-mp') && window.__xc?.dash?.fill === 'done', null, { timeout: 120000 }).catch(() => {});
await p.waitForTimeout(3000);
if (false) {}
T('on-open', await st()); await shot('1-on-mini');
await p.locator('.xo-mini .xo-tint').click(); await p.waitForTimeout(1200); T('mini-off', await st()); await shot('1a-mini-off'); await p.locator('.xo-mini .xo-tint').click(); await p.waitForTimeout(1000); T('mini-on', await st());
await p.evaluate(() => document.querySelector('.xo-mini .xo-mini-b')?.click()); await p.waitForTimeout(1800); await shot('1b-on-panel');
await p.locator('.xo:not([hidden]) .xo-tint').click(); await p.waitForTimeout(1500);
T('off', await st()); await shot('2-off');
// 층 판
await p.locator('.xc-tool', { hasText: '층' }).click().catch(() => {}); await p.waitForTimeout(800);
T('layers-row', await p.evaluate(() => { const r = document.querySelector('[data-tint-row]'); return r ? { pressed: r.getAttribute('aria-pressed'), text: r.innerText } : null; })); await shot('3-layers-off');
// 객체 높이로 확대
const c = await p.evaluate(() => { const m = window.__xc.map; return m.getCenter(); });
await p.evaluate(({ lng, lat }) => window.__xc.map.jumpTo({ center: [lng, lat], zoom: 15.5 }), c); await p.waitForTimeout(6000);
T('off-zoom15', await st()); await shot('4-off-zoom');
// 켜기 + 줌 바깥/안 비교
await p.evaluate(() => document.querySelector('.xc-tool.is-on, .xc-tool[aria-pressed=true]')?.click()).catch(() => {});
await p.locator('.xo:not([hidden]) .xo-tint').click(); await p.waitForTimeout(1500);
T('on-zoom15', await st()); await shot('5-on-zoom15-autofade');
await p.evaluate(({ lng, lat }) => window.__xc.map.jumpTo({ center: [lng, lat], zoom: 11 }), c); await p.waitForTimeout(3000); await shot('6-on-zoom11');
// 진하기
await p.locator('.xo-dn input').evaluate((e) => { e.value = '40'; e.dispatchEvent(new Event('input', { bubbles: true })); }); await p.waitForTimeout(1500);
T('k40', await st()); await shot('7-k40');
await p.waitForTimeout(1500);
// 새로고침 → 저장값
await open();
T('reload-tint', await p.evaluate(() => window.__xc.tint));
await p.evaluate((t) => ([...document.querySelectorAll('.xs-c-bub')].find((e) => e.innerText.includes(t)) || document.querySelector('.xs-c-bub'))?.click(), BUBBLE);
await p.waitForFunction(() => document.querySelector('.xo:not([hidden]) .xo-mp') && window.__xc?.dash?.fill === 'done', null, { timeout: 120000 }).catch(() => {}); await p.waitForTimeout(3000);
if (false) {}
T('reload-open', await st()); await shot('8-reload');
// 원래대로(기본 켬 · 100%)
await p.locator('.xo-dn input').evaluate((e) => { e.value = '100'; e.dispatchEvent(new Event('input', { bubbles: true })); }); await p.waitForTimeout(1000);
T('restored', await st()); await p.waitForTimeout(1200);
out.errs = errs; console.log('errs', errs);
fs.writeFileSync(path.join(HERE, `result-${TAG}-${W_}.json`), JSON.stringify(out, null, 1)); await b.close();
