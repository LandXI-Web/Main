// 구현 22 · XI맵 전국 결과 자산(원칙 218 · 10-12 12:45 확인) — 빛나는 밀도 대신 실제 결과 면 · 아직인 곳은 빗금 '분석 예정'(숫자 없음).
// 로그인 폼 입력만(세션 주입 0) · 게이트웨이 :8700 · GPU 0 · 쓰기 0.
// 열자마자: 빛 층 0 · 전국 결과 자산 칸(진행 % = GET /national/progress) · 빗금 층 · 지도 조각은 판 번호 주소 → 올리면 그 읍면동 요약 → 누르면 날아감 → 자산 바꾸기.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { frontDoor } from '../../landxi/v3/kit/lint/forbidden.mjs';

const ENV = path.resolve('server/.env');
const PW = fs.existsSync(ENV) ? (/DEV_PASSWORD=(.+)/.exec(fs.readFileSync(ENV, 'utf8')) || [])[1]?.trim() : null;
const up = async (request) => { try { return (await request.get('http://127.0.0.1:8700/api/v1/health', { timeout: 3000 })).ok(); } catch { return false; } };

test('전국 결과 자산 — 결과 면 · 분석 예정 · 올리면 요약 · 누르면 날아감', async ({ page, baseURL, request }) => {
  test.skip(!PW, 'server/.env DEV_PASSWORD 없음');
  test.skip(!(await up(request)), '게이트웨이 꺼짐');
  test.setTimeout(120000);
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await frontDoor(page, new URL(baseURL).origin, 'test@lx.or.kr', 'app');
  await page.waitForURL((u) => u.pathname.startsWith('/landxi/v3/lx-console/'), { timeout: 20000 });
  const prog = page.waitForResponse((r) => /\/national\/progress$/.test(new URL(r.url()).pathname));
  await page.goto('v3/xi-clean/');
  const pj = await (await prog).json();
  await page.waitForFunction(() => window.__xc?.board?.nat?.layers?.length > 0 && window.__xc.boot?.shown, null, { timeout: 30000 });

  // 빛나는 밀도 0 · 결과 면 · 빗금 · 판 번호 주소
  const st = await page.evaluate(() => { const m = window.__xc.map, s = m.getStyle();
    return { heat: s.layers.filter((l) => l.type === 'heatmap').length, ids: s.layers.filter((l) => /^xn-/.test(l.id)).map((l) => l.id), tiles: s.sources.xn?.tiles?.[0] || '' }; });
  expect(st.heat).toBe(0);
  for (const id of ['xn-hatch', 'xn-face', 'xn-hit']) expect(st.ids).toContain(id);
  expect(st.tiles).toMatch(/\/tiles\/national\/farm\/\d{4}\/\{z\}\/\{x\}\/\{y\}\.pbf\?v=/);
  expect(st.tiles).toContain('v=' + encodeURIComponent(pj.v.farm));

  // 진행 % = 서버 한 출처
  const card = page.locator('.xb-hud .xna-card');
  await expect(card).toBeVisible();
  const pct = pj.assets.farm.pct.value;
  await expect(card.locator('.xna-p')).toContainText(`${pct > 0 && pct < 1 ? pct.toFixed(1) : Math.floor(pct)}%`);
  await expect(card.locator('.xna-p')).toContainText(`${pj.assets.farm.done.value.toLocaleString('ko-KR')}곳`);
  await expect(card.locator('.xna-leg')).toContainText('분석 예정');

  // 올리면 그 읍면동 요약(끝난 곳 = 장부 숫자 · 아직인 곳 = '분석 예정') → 누르면 날아감
  await page.evaluate(() => window.__xc.map.jumpTo({ center: [127.2, 35.75], zoom: 8 }));
  await page.waitForFunction(() => { const m = window.__xc.map; return !m.isMoving() && m.queryRenderedFeatures({ layers: ['xn-hit'] }).length > 0; }, null, { timeout: 20000 });
  let pt = null;
  for (let k = 0; k < 10 && !pt; k++) {                // 조각이 다 오기 전이면 잠시 뒤 다시(HUD 칸 밖 · 지도 오른쪽 반에서 찾는다)
    if (k) await page.waitForTimeout(500);
    pt = await page.evaluate(() => { const m = window.__xc.map, c = m.getCanvas(), r = c.getBoundingClientRect();
      for (let y = r.height * 0.15; y < r.height * 0.95; y += 19) for (let x = r.width * 0.42; x < r.width * 0.92; x += 19) {
        if (m.queryRenderedFeatures([x, y], { layers: ['xn-hit'] }).length) return [x + r.x, y + r.y];
      } return null; });
  }
  expect(pt).not.toBeNull();
  await page.mouse.move(pt[0] - 5, pt[1]);
  await page.mouse.move(pt[0], pt[1]);
  const tip = page.locator('.xb-tipcard');
  await expect(tip).toBeVisible({ timeout: 5000 });
  await expect(tip).toContainText('누르면 이 자리로 갑니다');
  const done = await tip.getAttribute('data-done');
  await expect(tip).not.toContainText('null');
  if (done === '0') await expect(tip).toContainText('분석 예정');
  else await expect(tip.locator('.xb-tc-rows li').first()).toContainText(/곳|동/);
  const z0 = await page.evaluate(() => window.__xc.map.getZoom());
  await page.mouse.click(pt[0], pt[1]);
  await page.waitForFunction((z) => { const m = window.__xc.map; return !m.isMoving() && m.getZoom() >= Math.min(12.5, Math.max(z + 3, 11.6)) - 0.05; }, z0, { timeout: 15000 });
  await expect(tip).toBeHidden();

  // 자산 바꾸기 — 하천 · 계곡(같은 조각 주소 방식)
  await page.evaluate(() => window.__xc.map.jumpTo({ center: [127.8, 36.1], zoom: 6.6 }));
  await page.waitForTimeout(800);
  await card.locator('.xna-chip', { hasText: '하천' }).click();
  await expect(card.locator('.xna-chip', { hasText: '하천' })).toHaveAttribute('aria-pressed', 'true');
  await expect(card.locator('.xna-leg')).toContainText('건물');
  await expect(card.locator('.xna-p')).toContainText('전국 하천 띠의');
  const t2 = await page.evaluate(() => window.__xc.map.getStyle().sources.xn.tiles[0]);
  expect(t2).toMatch(/\/tiles\/national\/river\//);
  expect(errs).toEqual([]);
});
