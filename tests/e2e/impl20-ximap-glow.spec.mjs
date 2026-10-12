// 바퀴 6 · XI맵 빛나는 밀도 → 실제 객체(원칙 204 · 10-12 답). 로그인 폼 입력만(세션 주입 0) · 게이트웨이 :8700 · GPU 0 · 쓰기 0.
// 열자마자 서비스 색 빛(시군구 칠 · 알약 0) → 올리면 그 자리 요약(수 = 밀도 칸의 실제 수) → 누르면 그 자리로 날아감 → 객체 줌에서 결과 도형이 같은 서비스 색.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { frontDoor } from '../../landxi/v3/kit/lint/forbidden.mjs';

const ENV = path.resolve('server/.env');
const PW = fs.existsSync(ENV) ? (/DEV_PASSWORD=(.+)/.exec(fs.readFileSync(ENV, 'utf8')) || [])[1]?.trim() : null;
const up = async (request) => { try { return (await request.get('http://127.0.0.1:8700/api/v1/health', { timeout: 3000 })).ok(); } catch { return false; } };

test('빛나는 밀도 · 올리면 요약 · 누르면 날아감 · 확대하면 객체', async ({ page, baseURL, request }) => {
  test.skip(!PW, 'server/.env DEV_PASSWORD 없음');
  test.skip(!(await up(request)), '게이트웨이 꺼짐');
  test.setTimeout(120000);
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await frontDoor(page, new URL(baseURL).origin, 'test@lx.or.kr', 'app');
  await page.waitForURL((u) => u.pathname.startsWith('/landxi/v3/lx-console/'), { timeout: 20000 });
  await page.goto('v3/xi-clean/');
  await page.waitForFunction(() => window.__xc?.board?.glow > 0 && window.__xc.boot?.shown, null, { timeout: 30000 });
  const g = await page.evaluate(() => { const m = window.__xc.map; return { heat: m.getStyle().layers.filter((l) => l.type === 'heatmap' && /^xb-glow/.test(l.id)).length, sgg: !!m.getLayer('xb-sgg-f') }; });
  expect(g.heat).toBeGreaterThan(0);
  expect(g.sgg).toBe(false);
  await expect(page.locator('.xb-pill')).toHaveCount(0);

  const c = await page.evaluate(() => window.__xc.board.hot);   // 객체가 가장 많이 모인 칸(자리 고정값 없음)
  await page.evaluate((cc) => window.__xc.map.jumpTo({ center: cc, zoom: 7 }), c);
  await page.waitForTimeout(1500);
  const pt = await page.evaluate((cc) => { const m = window.__xc.map, q = m.project(cc), r = m.getCanvas().getBoundingClientRect(); return [q.x + r.x, q.y + r.y]; }, c);
  await page.mouse.move(pt[0] - 6, pt[1]);
  await page.mouse.move(pt[0], pt[1]);
  await expect(page.locator('.xb-tipcard')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('.xb-tipcard .xb-tc-rows li').first()).toContainText('개');
  const tipN = (await page.locator('.xb-tipcard .xb-tc-rows li b').first().innerText()).trim();   // 그 시군구의 전국 결과 수(숫자 한 출처)
  const z0 = await page.evaluate(() => window.__xc.map.getZoom());
  await page.mouse.click(pt[0], pt[1]);
  await page.waitForFunction((z) => { const m = window.__xc.map; return !m.isMoving() && m.getZoom() >= Math.min(12.5, Math.max(z + 3, 11.6)) - 0.05; }, z0, { timeout: 15000 });
  await expect(page.locator('.xb-hud .xb-rows')).toContainText(tipN, { timeout: 10000 });   // 날아간 자리의 HUD 수 = 올렸을 때 요약 수

  // 객체 줌 — 결과 도형이 그려지고(같은 서비스 색) 밀도는 거의 꺼짐
  await page.evaluate(() => window.__xc.map.jumpTo({ zoom: 12.5 }));
  await page.waitForFunction(() => { const m = window.__xc.map; const ls = m.getStyle().layers.filter((l) => /^xb-r-.*-fill$/.test(l.id) && m.getLayoutProperty(l.id, 'visibility') !== 'none').map((l) => l.id);
    return ls.length && m.queryRenderedFeatures({ layers: ls }).length > 0; }, null, { timeout: 30000 });
  await expect(page.locator('.xb-tipcard')).toBeHidden();
  expect(errs).toEqual([]);
});
