// XI맵 확대 속도(impl-20 ximap-speed · 원칙 157). 로그인 폼 입력만(세션 주입 0) · 게이트웨이 :8700 · GPU 0 · 쓰기 = 시험 고치기 한 건(test=1 · 끝에 되돌림).
// ① 결과 층 = 판 번호 조각 주소(/tiles/mvt/…?v=) · 다시 열면 조각이 브라우저 보관에서 온다(받은 바이트 0)
// ② 무효화: 객체를 고치고(분류 바꾸기 · 시험) 다시 열어도 고친 모습 · 되돌리고 다시 열면 원래 모습(조각 보관 때문에 옛 모습 0)
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { frontDoor } from '../../landxi/v3/kit/lint/forbidden.mjs';

const ENV = path.resolve('server/.env');
const PW = fs.existsSync(ENV) ? (/DEV_PASSWORD=(.+)/.exec(fs.readFileSync(ENV, 'utf8')) || [])[1]?.trim() : null;
const up = async (request) => { try { return (await request.get('http://127.0.0.1:8700/api/v1/health', { timeout: 3000 })).ok(); } catch { return false; } };
const objLayers = () => { const m = window.__xc.map; return (m.getStyle().layers || []).map((l) => l.id).filter((id) => /^xb-r-.*-fill$/.test(id) && m.getLayoutProperty(id, 'visibility') !== 'none'); };

test('결과 조각 = 판 번호 주소 · 다시 열면 보관에서 · 고치기는 다시 열어도 새 모습', async ({ page, baseURL, request }) => {
  test.skip(!PW, 'server/.env DEV_PASSWORD 없음');
  test.skip(!(await up(request)), '게이트웨이 꺼짐');
  test.setTimeout(180000);
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await frontDoor(page, new URL(baseURL).origin, 'test@lx.or.kr', 'app');
  await page.waitForURL((u) => u.pathname.startsWith('/landxi/v3/lx-console/'), { timeout: 20000 });
  await page.goto('v3/xi-clean/?test=1');
  await page.waitForFunction(() => window.__xc?.board?.nat?.layers?.length > 0 && window.__xc.boot?.shown, null, { timeout: 30000 });

  // 결과 객체가 가장 많은 시군구로 확대 → 객체 하나의 가운데(자리 고정값 없음)
  const hot = await page.evaluate(() => window.__xc.board.hot);
  await page.evaluate((c) => window.__xc.map.jumpTo({ center: c, zoom: 12.5 }), hot);
  let spot = null;
  for (let i = 0; i < 20 && !spot; i++) {
    await page.waitForTimeout(700);
    spot = await page.evaluate((src) => { const m = window.__xc.map, ls = eval(src)();
      const f = ls.length ? m.queryRenderedFeatures({ layers: ls }).find((q) => q.geometry.type === 'Polygon') : null; if (!f) return null;
      const g = f.geometry.coordinates[0]; let x = 0, y = 0; for (const p of g) { x += p[0]; y += p[1]; } return [x / g.length, y / g.length]; }, `(${objLayers})`);
  }
  test.skip(!spot, '화면에 그려진 객체 없음');
  // ① 결과 층 주소
  const tpl = await page.evaluate(() => { const st = window.__xc.map.getStyle(); return Object.entries(st.sources).filter(([k]) => /^xb-r-/.test(k)).map(([, s]) => s.tiles?.[0] || s.url || ''); });
  expect(tpl.length).toBeGreaterThan(0);
  for (const t of tpl) expect(t).toMatch(/\/tiles\/mvt\/.+\/\{z\}\/\{x\}\/\{y\}\.pbf\?v=[0-9a-f]{10}/);

  const open = async () => {
    await page.evaluate((c) => window.__xc.map.jumpTo({ center: c, zoom: 18 }), spot);
    await page.waitForFunction((src) => { const m = window.__xc.map, ls = eval(src)(); return !m.isMoving() && ls.length && m.queryRenderedFeatures({ layers: ls }).length > 0; }, `(${objLayers})`, { timeout: 30000 });
    await page.waitForTimeout(800);
    const box = await page.locator('.k-stage-map canvas, canvas.maplibregl-canvas').first().boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.locator('.xe-card .xe-act')).toBeVisible({ timeout: 15000 });
    return page.locator('.xe-h h3').innerText();
  };
  const reopen = async () => {
    await page.goto('v3/xi-clean/?test=1');                    // 같은 주소로 다시 열기(브라우저 보관 그대로)
    await page.waitForFunction(() => window.__xc?.board?.nat?.layers?.length > 0 && window.__xc.boot?.shown, null, { timeout: 30000 });
  };
  const before = await open();
  // ② 고치기(분류 바꾸기 · 시험)
  const [res] = await Promise.all([
    page.waitForResponse((r) => /\/ximap\/edits$/.test(new URL(r.url()).pathname) && r.request().method() === 'POST'),
    (async () => { await page.locator('.xe-act button', { hasText: '클래스 바꾸기' }).click(); await page.locator('.xe-chip').first().click(); })(),
  ]);
  const ej = await res.json();
  const eid = ej.edit?.id;
  expect(eid).toBeTruthy();
  await expect(page.locator('.xe-h h3')).not.toHaveText(before, { timeout: 10000 });
  const after = await page.locator('.xe-h h3').innerText();

  // 다시 열기(브라우저 보관 그대로) — 조각은 보관에서, 고친 모습은 그대로 보인다
  const got = [];
  const onFin = async (r) => { if (/\/tiles\/mvt\//.test(r.url())) { try { got.push((await r.sizes()).responseBodySize); } catch { /* */ } } };
  page.on('requestfinished', onFin);
  // 다시 연 화면이 받는 고친 자리 층(no-store)에 이 고치기가 있어야 한다
  const liveP = page.waitForResponse(async (r) => {
    if (!/\/ximap\/edits$/.test(new URL(r.url()).pathname) || r.request().method() !== 'GET') return false;
    try { return (await r.json()).features?.some((f) => f.properties?.edit === eid); } catch { return false; }
  }, { timeout: 90000 });
  await reopen();
  expect(await open()).toBe(after);
  expect(await liveP.then(() => true, () => false)).toBe(true);
  page.off('requestfinished', onFin);
  expect(got.length).toBeGreaterThan(0);
  expect(got.filter((n) => n <= 0).length).toBeGreaterThan(0);                 // 다시 연 화면의 조각이 보관에서(받은 바이트 0)

  // 되돌리고 다시 열면 원래 모습(옛 고친 모습이 보관에서 나오지 않음)
  const undo = await page.evaluate(async (id) => { const { api } = await import('/landxi/shared/api-v1.js'); return api('/ximap/edits/' + id + '/undo', { method: 'POST' }).then(() => true, (e) => String(e?.message || e)); }, eid);
  expect(undo).toBe(true);
  await reopen();
  expect(await open()).toBe(before);
  expect(errs).toEqual([]);
});
