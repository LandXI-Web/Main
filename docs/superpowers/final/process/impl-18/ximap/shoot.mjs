/* impl-18 XI맵 바퀴 5 증거 — 바깥 주소에서 지금 새로 찍는다(원칙 162). 로그인은 LX 직원 로그인 폼 한 번(세션 주입 0).
   node docs/superpowers/final/process/impl-18/ximap/shoot.mjs   (01. 디자인 에서) → shots/*.png + run.json(시각 · 첫 화면 시간 · 콘솔 오류 · 이 PC 주소 호출)
   흐름: XI맵 열기(재기) → 1440 · 1265×710 → 남원 비닐하우스 객체 확대 · 누르기 → 모양 고치기(꼭짓점 끌기 · 저장 안 함) → 분류 바꾸기(시험 표시) → 되돌리기 → 키르기스스탄 구획.
   객체 자리는 이 PC DB 에서 미리 고른 값(남원 비닐하우스 결과 · 신뢰도 높은 것) — 화면 동작은 모두 클릭. */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { frontDoor } from '../../../../../../landxi/v3/kit/lint/forbidden.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(DIR, 'shots');
fs.mkdirSync(OUT, { recursive: true });
const APP = process.env.APP || 'https://app.land-xi.dev';
const OBJ = [127.50489, 35.39510];                     // 남원 비닐하우스 결과 한 객체(가운데)
const KG = [74.45, 42.88];                             // 추이 주 평야(구획이 있는 곳)
const run = { at: new Date().toISOString(), app: APP, shots: {}, measure: {}, errors: [], local: [] };
const hm = () => new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }).slice(11, 16).replace(':', '');
const shot = async (page, name) => { const f = `${name}-${hm()}.png`; await page.screenshot({ path: path.join(OUT, f) }); run.shots[f] = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }); return f; };
setTimeout(() => { fs.writeFileSync(path.join(DIR, 'run.json'), JSON.stringify({ ...run, timeout: true }, null, 2)); process.exit(2); }, 240000);

const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
p.on('console', (m) => { if (m.type() === 'error') run.errors.push(m.text()); });
p.on('pageerror', (e) => run.errors.push(String(e)));
p.on('request', (r) => { if (/\/\/(127\.0\.0\.1|localhost|\[::1\])|:8700|:4173/.test(r.url())) run.local.push(r.url()); });
await frontDoor(p, APP, 'test@lx.or.kr', 'app');
await p.waitForURL((u) => !/\/login\/?$/.test(u.pathname), { timeout: 30000 });

/* 1) 열자마자 전국 결과 — 주소를 연 순간부터 시군구 칠이 지도에 그려지고 로딩 판이 걷힐 때까지 */
const t0 = Date.now();
await p.goto(APP + '/landxi/v3/xi-clean/?test=1', { waitUntil: 'commit' });
await p.waitForFunction(() => { const x = window.__xc; return x?.boot?.shown && x.map?.getLayer('xb-sgg-f') && x.map.queryRenderedFeatures({ layers: ['xb-sgg-f'] }).length > 0; }, null, { timeout: 30000, polling: 50 });
run.measure.first_view_ms = Date.now() - t0;
run.measure.page = await p.evaluate(() => ({ boot: window.__xc.boot, board: { regions: window.__xc.board.regions, services: window.__xc.board.services, at_ms: window.__xc.board.at }, hud: window.__xc.hud }));
await p.waitForTimeout(1500);
run.measure.layout = await p.evaluate(() => {
  const r = (s) => { const b = document.querySelector(s)?.getBoundingClientRect(); return b ? { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) } : null; };
  return { rail: [...document.querySelectorAll('.k-rail .k-rail-i')].map((x) => x.textContent.trim()), rail_on: document.querySelector('.k-rail .k-rail-i[aria-current="true"]')?.textContent.trim(),
    tools: [...document.querySelectorAll('.xc-tool')].map((x) => x.textContent.trim()), tools_box: r('.xc-tools'), top_box: r('.xc-top'), vw: innerWidth,
    pills: document.querySelectorAll('.xb-pill:not([hidden])').length, legend: [...document.querySelectorAll('.xb-chip')].map((x) => x.textContent.trim()), over: document.documentElement.scrollWidth - innerWidth };
});
await shot(p, 'a1-open-national-1440');
await p.setViewportSize({ width: 1265, height: 710 });
await p.waitForTimeout(1500);
await shot(p, 'a2-open-national-1265');
await p.setViewportSize({ width: 1440, height: 900 });
await p.waitForTimeout(800);

/* 2) 확대 → 객체 → 그 자리 칸 */
await p.evaluate((c) => window.__xc.map.easeTo({ center: c, zoom: 18.2, duration: 0 }), OBJ);
await p.waitForTimeout(6000);
const cv = await p.locator('canvas.maplibregl-canvas').first().boundingBox();
const at = await p.evaluate((c) => window.__xc.map.project(c), OBJ);
await p.mouse.click(cv.x + at.x, cv.y + at.y);
await p.locator('.xe-card .xe-act').waitFor({ timeout: 15000 });
await p.waitForTimeout(1200);
run.measure.card = (await p.locator('.xe-card').innerText()).replace(/\n+/g, ' | ');
run.measure.hud_region = await p.evaluate(() => window.__xc.hud);
await shot(p, 'b1-object-card-1440');

/* 3) 모양 고치기 — 꼭짓점 하나를 끌어 본다(저장하지 않고 '그만') */
await p.locator('.xe-act button', { hasText: '모양 고치기' }).click();
await p.waitForTimeout(1500);
const v = await p.evaluate(() => { const m = window.__xc.map; const f = m.queryRenderedFeatures({ layers: ['xe-vtx'] })[0]; return f ? m.project(f.geometry.coordinates) : null; });
if (v) { await p.mouse.move(cv.x + v.x, cv.y + v.y); await p.mouse.down(); await p.mouse.move(cv.x + v.x + 28, cv.y + v.y + 18, { steps: 6 }); await p.mouse.up(); }
await p.waitForTimeout(800);
run.measure.vertex_bar = (await p.locator('.xe-bar').innerText()).replace(/\n+/g, ' | ');
await shot(p, 'b2-reshape-vertex-1440');
await p.locator('.xe-bar button', { hasText: '그만' }).click();
await p.waitForTimeout(800);

/* 4) 분류 바꾸기(시험 표시) → 고친 것 n건 → 프로젝트 학습으로 · 그다음 되돌리기 */
await p.locator('.xe-act button', { hasText: '분류 바꾸기' }).click();
await p.locator('.xe-chip').first().click();
await p.locator('.xe-hist').waitFor({ timeout: 10000 });
await p.locator('.xe-foot a, .xe-foot b').first().waitFor({ timeout: 10000 }).catch(() => null);
await p.waitForTimeout(1000);
run.measure.after_edit = (await p.locator('.xe-card').innerText()).replace(/\n+/g, ' | ');
run.measure.train_href = await p.locator('.xe-train').getAttribute('href').catch(() => null);
await shot(p, 'b3-reclass-test-1440');
await p.locator('.xe-undo').first().click();
await p.waitForTimeout(2500);
run.measure.after_undo = (await p.locator('.xe-card').innerText()).replace(/\n+/g, ' | ');

/* 5) 해외 — 키르기스스탄 구획 */
await p.keyboard.press('Escape');
await p.locator('.xn-b', { hasText: '키르기스스탄' }).click();
await p.waitForTimeout(2500);
await p.evaluate((c) => window.__xc.map.jumpTo({ center: c, zoom: 12.6 }), KG);
await p.waitForTimeout(3500);
const b = await p.evaluate(() => { const m = window.__xc.map; const fs = m.queryRenderedFeatures({ layers: ['xn-blk-f'] }); const f = fs.sort((a, c) => c.properties.area_ha - a.properties.area_ha)[0]; if (!f) return null;
  const g = f.geometry.coordinates[0]; let x = 0, y = 0; for (const q of g) { x += q[0]; y += q[1]; } return { n: fs.length, pt: m.project([x / g.length, y / g.length]) }; });
if (b) { await p.mouse.click(cv.x + b.pt.x, cv.y + b.pt.y); await p.waitForTimeout(1500); }
run.measure.kg = { blocks_in_view: b?.n || 0, hud: (await p.locator('.xn-hud').innerText()).replace(/\n+/g, ' | ') };
await shot(p, 'c1-kg-blocks-1440');

fs.writeFileSync(path.join(DIR, 'run.json'), JSON.stringify(run, null, 2));
console.log(JSON.stringify({ first_view_ms: run.measure.first_view_ms, boot: run.measure.page.boot, errors: run.errors, local: run.local.length, shots: Object.keys(run.shots) }));
await browser.close();
process.exit(0);
