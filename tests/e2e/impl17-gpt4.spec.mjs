// 외부 검수 바퀴 4 보완(GPT4-1 · 2 · 3 · 4) — 지도 서비스 거르기로 빠진 도형의 속성 칸 닫기 · 속성 칸 'null' 0 · 직원 대시보드 종류별 합 = 상태별 합 · XI맵 도구 글자만.
// 로그인 폼 입력만(세션 주입 0) · 게이트웨이 :8700 · GPU 0 · 언어 모델 0(거르기는 채팅창이 받는 동작을 그대로 흉내 — 서버 직행 답과 같은 모양) · 쓰기 0.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { frontDoor } from '../../landxi/v3/kit/lint/forbidden.mjs';

const ENV = path.resolve('server/.env');
const PW = fs.existsSync(ENV) ? (/DEV_PASSWORD=(.+)/.exec(fs.readFileSync(ENV, 'utf8')) || [])[1]?.trim() : null;
const up = async (request) => { try { return (await request.get('http://127.0.0.1:8700/api/v1/health', { timeout: 3000 })).ok(); } catch { return false; } };
const RAW = /\bnull\b|\bundefined\b|\bNaN\b/;

test.describe('외부 검수 바퀴 4 보완', () => {
  test.beforeEach(async ({ request }) => {
    test.skip(!PW, 'server/.env DEV_PASSWORD 없음');
    test.skip(!(await up(request)), '게이트웨이 :8700 꺼짐');
  });

  test('지도 서비스 — 도형을 지도에서 고르면 속성 칸에 null 없음 · 조건에서 빠지면 선택과 속성 칸을 닫고, 조건을 풀면 다시 고를 수 있다', async ({ page, baseURL }) => {
    test.setTimeout(150000);
    const errs = []; page.on('pageerror', (e) => errs.push(String(e))); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    await page.addInitScript(() => { try { localStorage.removeItem('lx-map.ui'); } catch { /* */ } });
    await frontDoor(page, new URL(baseURL).origin, 'test@lx.or.kr', 'app');
    await page.waitForURL((u) => u.pathname.startsWith('/landxi/v3/lx-console/'), { timeout: 20000 });
    await page.goto('v3/lx-map/');
    await expect(page.locator('body[data-ready="1"]')).toHaveCount(1, { timeout: 60000 });
    await page.waitForFunction(() => document.documentElement.dataset.mapReady === '1', null, { timeout: 60000 });
    // 켜진 레이어 가운데 가장 작은 도형 하나(면적 < 1,000㎡)를 지도에서 직접 누른다
    const pick = async () => page.evaluate(() => {
      const m = window.__lm.map;
      const ids = m.getStyle().layers.map((l) => l.id).filter((i) => i.startsWith('lm-r-') && i.endsWith('-fill') && m.getLayoutProperty(i, 'visibility') !== 'none');
      const fs = m.queryRenderedFeatures({ layers: ids }).filter((f) => Number(f.properties.area_m2) < 1000);
      return fs.length ? { area: fs[0].properties.area_m2, b: (() => { const c = fs[0].geometry.type === 'Polygon' ? fs[0].geometry.coordinates[0] : fs[0].geometry.coordinates[0][0]; const xs = c.map((p) => p[0]), ys = c.map((p) => p[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; })() } : null;
    });
    await page.waitForTimeout(2500);
    const f = await pick();
    test.skip(!f, '켜진 결과에 1,000㎡ 아래 도형 없음');
    await page.evaluate((b) => window.__lm.map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { duration: 0, maxZoom: 18, padding: 240 }), f.b);
    await page.waitForTimeout(2000);
    const at = await page.evaluate((b) => { const m = window.__lm.map; const c = m.getCanvas().getBoundingClientRect(); const ids = m.getStyle().layers.map((l) => l.id).filter((i) => i.startsWith('lm-r-') && i.endsWith('-fill') && m.getLayoutProperty(i, 'visibility') !== 'none');
      // 도형 안의 한 점(가운데에서 도형이 잡히는 곳)
      for (let i = 0; i <= 8; i++) for (let j = 0; j <= 8; j++) { const p = m.project([b[0] + (b[2] - b[0]) * i / 8, b[1] + (b[3] - b[1]) * j / 8]); if (m.queryRenderedFeatures([p.x, p.y], { layers: ids }).some((x) => Number(x.properties.area_m2) < 1000)) return { x: c.left + p.x, y: c.top + p.y }; }
      return null; }, f.b);
    expect(at).not.toBeNull();
    await page.mouse.click(at.x, at.y);
    const props = page.locator('.lm-props[data-view="props"]');
    await expect(props).toBeVisible({ timeout: 20000 });
    await expect(props.locator('.lm-kv').nth(1)).not.toContainText('불러오는 중', { timeout: 20000 });
    expect(RAW.test(await props.innerText()), '속성 칸 원시 값').toBe(false);
    // XI ChatGEO 의 거르기(서버 직행 답과 같은 모양) — '면적 1,000㎡ 넘는 것만'
    await page.evaluate(() => document.dispatchEvent(new CustomEvent('kit:agent-action', { cancelable: true, detail: {
      op: 'map_filter', label: '1,000㎡ 넘음', n: 0, area_min: 1000, area_op_min: '>', chips: [{ k: 'area', label: '1,000㎡ 넘음' }] } })));
    await expect(page.locator('.lm-props')).toBeHidden();
    await expect(page.locator('.lm-ly li.is-pick')).toHaveCount(0);
    await expect(page.locator('.k-toast, [role="status"]').filter({ hasText: '조건에서 빠져' }).first()).toBeVisible();
    // 칩 풀기 → 그 도형이 지도에 다시 → 다시 고를 수 있다
    await page.locator('.lm-chip', { hasText: '㎡' }).locator('button').click();
    await expect(page.locator('.lm-flt')).toHaveCount(0);
    await page.waitForTimeout(1500);
    await page.mouse.click(at.x, at.y);
    await expect(props).toBeVisible({ timeout: 20000 });
    // 조건에 맞는 도형은 그대로(면적 0 넘음 — 고른 도형도 들어간다)
    await page.evaluate(() => document.dispatchEvent(new CustomEvent('kit:agent-action', { cancelable: true, detail: {
      op: 'map_filter', label: '0㎡ 넘음', area_min: 0, area_op_min: '>', chips: [{ k: 'area', label: '0㎡ 넘음' }] } })));
    await expect(props).toBeVisible();
    expect(errs, errs.join('\n')).toEqual([]);
  });

  test('직원 대시보드 — 내가 돌린 작업: 종류별 합 = 상태별 합(다섯 갈래가 넘으면 기타)', async ({ page, baseURL }) => {
    await frontDoor(page, new URL(baseURL).origin, 'test@lx.or.kr', 'app');
    await page.waitForURL((u) => u.pathname.startsWith('/landxi/v3/lx-console/'), { timeout: 20000 });
    const card = page.locator('.ld-jobs');
    await expect(card.locator('.ld-cell b').first()).toBeVisible({ timeout: 20000 });
    const num = (t) => Number(String(t).replace(/[^\d]/g, '')) || 0;
    const cells = (await card.locator('.ld-cell b').allInnerTexts()).map(num).reduce((a, b) => a + b, 0);
    const kinds = (await card.locator('.ld-kinds b.num').allInnerTexts()).map(num).reduce((a, b) => a + b, 0);
    expect(kinds).toBe(cells);
    expect(await card.locator('.ld-kinds > span:not(.ld-k)').count()).toBeLessThanOrEqual(5);
  });

  test('XI맵 도구(층 · 가르기 · 보고서 · 분석) — 이전 모습 아이콘 + 글자(원칙 199 되돌림)', async ({ page, baseURL }) => {
    await frontDoor(page, new URL(baseURL).origin, 'test@lx.or.kr', 'app');
    await page.waitForURL((u) => u.pathname.startsWith('/landxi/v3/lx-console/'), { timeout: 20000 });
    await page.goto('v3/xi-clean/');
    const rail = page.locator('.k-rail[aria-label="도구"], .k-rail').first();
    await expect(rail.locator('.k-rail-i').first()).toBeVisible({ timeout: 30000 });
    const labels = await rail.locator('.k-rail-i > span:last-child').allInnerTexts();
    expect(labels.slice(0, 3)).toEqual(['층', '가르기', '보고서']);
    expect(await rail.locator('.k-rail-i svg').count()).toBe(labels.length);
  });
});
