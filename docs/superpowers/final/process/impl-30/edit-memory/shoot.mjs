/* 구현 30 · 전국 결과 객체 그 자리 고치기 증거 — 바깥 주소 · 로그인 폼(LX 직원 · 세션 주입 0) · PC 1440.
   node docs/superpowers/final/process/impl-30/edit-memory/shoot.mjs   (01. 디자인 에서 · CENTER=경도,위도 = 끝난 전국 결과 객체 하나)
   XI맵 ?test=1(고치기는 시험 표시) → 그 자리 줌 16 → 전국 결과 객체 누름 → 그 자리 고치기 칸 → 지우기(시험) → 되돌리기.
   → shots/*.png · run.json(콘솔 오류 · 4xx/5xx · 이 PC 주소 호출) */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { frontDoor } from '../../../../../../landxi/v3/kit/lint/forbidden.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(DIR, 'shots');
fs.mkdirSync(OUT, { recursive: true });
const APP = process.env.APP || 'https://app.land-xi.dev';
const CENTER = (process.env.CENTER || '').split(',').map(Number);
const kst = () => new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' });
const hm = () => kst().slice(11, 16).replace(':', '');
const run = { at: kst(), app: APP, center: CENTER, shots: {}, errors: [], local: [], bad: [], steps: {} };
const shot = async (page, name) => { const f = `${name}-1440-${hm()}.png`; await page.screenshot({ path: path.join(OUT, f) }); run.shots[f] = kst(); return f; };
const save = () => fs.writeFileSync(path.join(DIR, 'run.json'), JSON.stringify(run, null, 2));
const guard = setTimeout(() => { run.timeout = true; save(); process.exit(2); }, 240000);

const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
p.on('console', (m) => { if (m.type() === 'error') run.errors.push(m.text().slice(0, 300)); });
p.on('pageerror', (e) => run.errors.push(String(e).slice(0, 300)));
p.on('request', (r) => { if (/\/\/(127\.0\.0\.1|localhost|\[::1\])|:8700|:4173/.test(r.url())) run.local.push(r.url()); });
p.on('response', (r) => { if (r.status() >= 400) run.bad.push(`${r.status()} ${r.url().replace(/[?#].*$/, '').slice(0, 160)}`); });

await frontDoor(p, APP, 'test@lx.or.kr', 'app');
await p.waitForURL((u) => !/\/login\/?$/.test(u.pathname), { timeout: 30000 });
await p.goto(APP + '/landxi/v3/xi-clean/?test=1', { waitUntil: 'commit' });
await p.waitForFunction(() => window.__xc?.board?.nat?.layers?.length > 0 && window.__xc.boot?.shown, null, { timeout: 60000, polling: 100 });
await p.evaluate((c) => window.__xc.map.jumpTo({ center: c, zoom: 16.2 }), CENTER);
// 객체 층(줌 11+)이 붙고 그려질 때까지
const settle = () => p.waitForFunction(() => !window.__xc.map.isMoving() && window.__xc.map.areTilesLoaded(), null, { timeout: 30000 }).catch(() => {});
await settle();
await p.waitForFunction(() => window.__xc.map.getStyle().layers.some((l) => /^xn-o-.*-f$/.test(l.id)), null, { timeout: 30000 });
await settle(); await p.waitForTimeout(1500);
// 화면 가운데에서 가장 가까운 전국 결과 객체 하나를 누른다
const pt = await p.evaluate(() => {
  const m = window.__xc.map, ls = m.getStyle().layers.filter((l) => /^xn-o-.*-f$/.test(l.id)).map((l) => l.id);
  const fs = m.queryRenderedFeatures({ layers: ls });
  const c = m.getCanvas(), cx = c.clientWidth / 2, cy = c.clientHeight / 2, r = c.getBoundingClientRect();
  let best = null;
  for (const f of fs) {
    const g = f.geometry.type === 'Polygon' ? f.geometry.coordinates[0] : f.geometry.coordinates[0][0];
    const sx = g.reduce((a, q) => a + q[0], 0) / g.length, sy = g.reduce((a, q) => a + q[1], 0) / g.length;
    const s = m.project([sx, sy]);
    const hit = m.queryRenderedFeatures(s, { layers: ls })[0];
    if (!hit || hit.properties.id !== f.properties.id) continue;
    const d = Math.hypot(s.x - cx, s.y - cy);
    if (!best || d < best.d) best = { d, x: s.x + r.x, y: s.y + r.y, id: f.properties.id, cls: f.properties.cls, n: fs.length };
  }
  return best;
});
run.steps.pick = pt;
await p.mouse.click(pt.x, pt.y);
await p.waitForFunction(() => { const c = document.querySelector('.xe-card:not([hidden])'); return c && !/불러오는 중/.test(c.innerText); }, null, { timeout: 30000 });
await p.waitForTimeout(800);
run.steps.card = await p.evaluate(() => document.querySelector('.xe-card:not([hidden])')?.innerText || null);
await shot(p, 'n1-national-object');
// 지우기(시험) — 칸 안 단추 → 확인
await p.locator('.xe-card .xe-act button', { hasText: '지우기' }).first().click();
await p.locator('.xe-card .xe-ask button', { hasText: '지우기' }).first().click();
await p.waitForFunction(() => /지움/.test(document.querySelector('.xe-card:not([hidden]) .xe-st')?.innerText || ''), null, { timeout: 20000 });
await p.waitForTimeout(1500);
run.steps.deleted = await p.evaluate(() => ({ card: document.querySelector('.xe-card:not([hidden])')?.innerText || null,
  live: window.__xc.map.getSource('xe-live')?._data?.features?.length ?? null }));
await shot(p, 'n2-national-deleted');
// 되돌리기(칸 이력 줄)
await p.locator('.xe-card .xe-undo').first().click();
await p.waitForFunction(() => !/지움/.test(document.querySelector('.xe-card:not([hidden]) .xe-st')?.innerText || ''), null, { timeout: 20000 });
await p.waitForTimeout(1200);
run.steps.undone = await p.evaluate(() => document.querySelector('.xe-card:not([hidden])')?.innerText || null);
await shot(p, 'n3-national-undo');
clearTimeout(guard);
run.done = kst();
save();
await browser.close();
console.log(JSON.stringify({ errors: run.errors.length, bad: run.bad.length, local: run.local.length, shots: Object.keys(run.shots) }));
