// 바퀴 5 · XI맵 — 열자마자 전국 결과 · 왼쪽 메뉴 그대로 · 도구 오른쪽 · 객체를 눌러 그 자리 고치기(시험 표시 → 되돌림) · 해외 구획.
// 로그인 폼 입력만(세션 주입 0) · 게이트웨이 :8700 · GPU 0 · 쓰기 = 시험 고치기 한 건(test=1 · 끝에 되돌림).
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { frontDoor } from '../../landxi/v3/kit/lint/forbidden.mjs';

const ENV = path.resolve('server/.env');
const PW = fs.existsSync(ENV) ? (/DEV_PASSWORD=(.+)/.exec(fs.readFileSync(ENV, 'utf8')) || [])[1]?.trim() : null;
const up = async (request) => { try { return (await request.get('http://127.0.0.1:8700/api/v1/health', { timeout: 3000 })).ok(); } catch { return false; } };

test.describe('XI맵 바퀴 5', () => {
  test.beforeEach(async ({ request }) => {
    test.skip(!PW, 'server/.env DEV_PASSWORD 없음');
    test.skip(!(await up(request)), '게이트웨이 꺼짐');
  });

  test('열자마자 전국 결과 · 직원 메뉴 그대로 · 도구 오른쪽', async ({ page, baseURL }) => {
    test.setTimeout(90000);
    const errs = [];
    page.on('pageerror', (e) => errs.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    await frontDoor(page, new URL(baseURL).origin, 'test@lx.or.kr', 'app');
    await page.waitForURL((u) => u.pathname.startsWith('/landxi/v3/lx-console/'), { timeout: 20000 });
    await page.goto('v3/xi-clean/');
    await page.waitForFunction(() => window.__xc?.board && window.__xc.boot?.shown, null, { timeout: 30000 });
    const x = await page.evaluate(() => ({ board: window.__xc.board, hud: window.__xc.hud, sgg: !!window.__xc.map.getLayer('xb-sgg-f') }));
    expect(x.board.regions).toBeGreaterThan(0);
    expect(x.board.nat.layers.length).toBeGreaterThan(0);             // 고르기 · 조회 없이 지도에 바로 — 바퀴 8: 빛나는 밀도 대신 전국 결과 자산 면 · 분석 예정(원칙 218)
    expect(x.sgg).toBe(false);
    await expect(page.locator('.xb-pill')).toHaveCount(0);
    expect(x.hud.label).toBe('전국 AI 분석 결과');
    await expect(page.locator('.xb-hud .xb-h')).toHaveText('전국 AI 분석 결과');
    await expect(page.locator('.k-rail .k-rail-i[aria-current="true"] > span:last-child')).toHaveText('XI맵');
    const tb = await page.locator('.xc-tools').boundingBox(), vw = page.viewportSize().width;
    expect(tb.x).toBeGreaterThan(vw / 2);                               // 도구 = 지도 오른쪽
    await expect(page.locator('.xc-img-b').first()).toHaveText('최신 영상');
    expect(errs).toEqual([]);
  });

  test('객체를 누르면 그 자리 고치기 — 분류 바꾸기(시험) → 되돌리기', async ({ page, baseURL }) => {
    test.setTimeout(120000);
    await frontDoor(page, new URL(baseURL).origin, 'test@lx.or.kr', 'app');
    await page.waitForURL((u) => u.pathname.startsWith('/landxi/v3/lx-console/'), { timeout: 20000 });
    await page.goto('v3/xi-clean/?test=1');
    await page.waitForFunction(() => window.__xc?.board, null, { timeout: 30000 });
    // 결과가 있는 첫 시군구 가운데로 확대 → 화면에 그려진 객체 하나를 누른다(자리 고정값 없음)
    const centers = await page.evaluate(() => window.__xc.board.centers || []);
    let pt = null;
    for (const c of centers.slice(0, 6)) {
      await page.evaluate((cc) => window.__xc.map.jumpTo({ center: cc, zoom: 12.5 }), c);
      for (let i = 0; i < 8 && !pt; i++) {
      await page.waitForTimeout(800);
      pt = await page.evaluate(() => { const m = window.__xc.map; const ls = (m.getStyle().layers || []).map((l) => l.id).filter((id) => /^xb-r-.*-fill$/.test(id) && m.getLayoutProperty(id, 'visibility') !== 'none');
        const f = ls.length ? m.queryRenderedFeatures({ layers: ls }).find((q) => q.geometry.type === 'Polygon') : null; if (!f) return null;
        const g = f.geometry.coordinates[0]; let x = 0, y = 0; for (const p of g) { x += p[0]; y += p[1]; } m.jumpTo({ center: [x / g.length, y / g.length], zoom: 18 }); return true; });
      }
      if (pt) break;
    }
    test.skip(!pt, '화면에 그려진 객체 없음');
    await page.waitForTimeout(2500);
    const box = await page.locator('.k-stage-map canvas, canvas.maplibregl-canvas').first().boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.locator('.xe-card .xe-act')).toBeVisible({ timeout: 15000 });
    for (const t of ['지우기', '분류 바꾸기', '모양 고치기', '새로 그리기', '메모']) await expect(page.locator('.xe-act button', { hasText: t })).toHaveCount(1);
    const before = await page.locator('.xe-h h3').innerText();
    await page.locator('.xe-act button', { hasText: '분류 바꾸기' }).click();
    await page.locator('.xe-chip').first().click();
    await expect(page.locator('.xe-h h3')).not.toHaveText(before, { timeout: 10000 });
    await expect(page.locator('.xe-hist')).toContainText('시험');
    await page.locator('.k-toast button', { hasText: '되돌리기' }).first().click();
    await expect(page.locator('.xe-h h3')).toHaveText(before, { timeout: 10000 });
  });
});
