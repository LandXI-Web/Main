// 구현 14차 b · 바퀴 3 — 지도 서비스 UI(원칙 192 · Q7) · 층 내려받기(Q6 ⓑ · 원칙 59) · 말로 거르기 반영(원칙 193).
// 로그인 폼 입력만(세션 주입 0) · 게이트웨이 :8700 · GPU 0 · 언어 모델 0(거르기는 채팅창이 받는 동작을 그대로 흉내 — 서버 직행 답과 같은 모양).
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { frontDoor } from '../../landxi/v3/kit/lint/forbidden.mjs';

const ENV = path.resolve('server/.env');
const PW = fs.existsSync(ENV) ? (/DEV_PASSWORD=(.+)/.exec(fs.readFileSync(ENV, 'utf8')) || [])[1]?.trim() : null;
const up = async (request) => { try { return (await request.get('http://127.0.0.1:8700/api/v1/health', { timeout: 3000 })).ok(); } catch { return false; } };

test.describe('구현 14차 b · 지도 서비스', () => {
  test.beforeEach(async ({ request }) => {
    test.skip(!PW, 'server/.env DEV_PASSWORD 없음');
    test.skip(!(await up(request)), '게이트웨이 :8700 꺼짐');
  });

  test('슬림 왼쪽(접고 펴기 · 한 줄 높이 · 칸 안 스크롤) · 범례 오른쪽(글자 단추로 접힘) · 거르기 바로 반영 · 내려받기(동의 한 줄 · 기록)', async ({ page, baseURL }) => {
    test.setTimeout(150000);
    const errs = []; page.on('pageerror', (e) => errs.push(String(e))); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    await page.addInitScript(() => { try { sessionStorage.setItem('lx.chat.test', '1'); localStorage.removeItem('lx-map.ui'); } catch { /* */ } });
    await frontDoor(page, new URL(baseURL).origin, 'test@lx.or.kr', 'app');
    await page.waitForURL((u) => u.pathname.startsWith('/landxi/v3/lx-console/'), { timeout: 20000 });
    await page.goto('v3/lx-map/');
    await expect(page.locator('body[data-ready="1"]')).toHaveCount(1, { timeout: 60000 });
    // 왼쪽 — 폭 300 이하 · 레이어 줄 한 줄(32) · 레이어 칸만 스크롤(overflow auto)
    expect((await page.locator('.lm-left').boundingBox()).width).toBeLessThanOrEqual(300);
    const card = page.locator('.lm-grp', { hasText: '비닐하우스 분석서비스' });
    if ((await card.locator('.lm-gt').getAttribute('aria-expanded')) !== 'true') await card.locator('.lm-gt').click();
    while (await page.locator('.lm-sw[aria-checked="true"]').count()) await page.locator('.lm-sw[aria-checked="true"]').first().click();
    const row = card.locator('li', { hasText: '남원시' }).first();
    await row.locator('.lm-sw').click();
    await expect(row.locator('.lm-sw')).toHaveAttribute('aria-checked', 'true');
    expect(Math.round((await row.boundingBox()).height)).toBeLessThanOrEqual(34);
    expect(await page.locator('.lm-groups').evaluate((e) => getComputedStyle(e).overflowY)).toBe('auto');
    // 범례 — 지도 오른쪽 · 글자 단추 '접기/펴기'(아이콘 없음)
    const lg = page.locator('.lm-lgd');
    await expect(lg).toBeVisible({ timeout: 20000 });
    const mapBox = await page.locator('.lm-map').boundingBox(), lgBox = await lg.boundingBox();
    expect(lgBox.x + lgBox.width).toBeGreaterThan(mapBox.x + mapBox.width - 40);
    await expect(lg.locator('.lm-lgb small')).toHaveText('접기');
    await lg.locator('.lm-lgb').click();
    await expect(lg.locator('.lm-lg')).toHaveCount(0);
    await expect(lg.locator('.lm-lgb small')).toHaveText('펴기');
    await lg.locator('.lm-lgb').click();
    // 접기 · 펴기
    await page.locator('.lm-fold').click();
    await expect(page.locator('.lm-unfold')).toBeVisible();
    await expect.poll(async () => Math.round((await page.locator('.lm-left').boundingBox())?.width || 0)).toBe(0);
    await page.locator('.lm-unfold').click();
    await expect.poll(async () => Math.round((await page.locator('.lm-left').boundingBox()).width)).toBeGreaterThan(200);
    // 말로 거르기 — 채팅창이 받는 동작(map_filter)을 이 화면이 바로 건다 · 조건 줄 · 풀기
    await page.waitForTimeout(2500);
    const done = page.evaluate(() => new Promise((res) => document.addEventListener('kit:agent-action-done', (e) => res(e.detail), { once: true })));
    await page.evaluate(() => document.dispatchEvent(new CustomEvent('kit:agent-action', { cancelable: true, detail: { op: 'map_filter', label: '1,000㎡ 넘음', n: 152, area_min: 1000, area_op_min: '>' } })));
    expect((await done).ok).toBe(true);
    await expect(page.locator('.lm-flt')).toContainText('1,000㎡ 넘음');
    const f = await page.evaluate(() => { const m = window.__lm.map; const id = m.getStyle().layers.map((l) => l.id).find((i) => i.startsWith('lm-r-') && i.endsWith('-fill') && m.getLayoutProperty(i, 'visibility') !== 'none'); return JSON.stringify(m.getFilter(id)); });
    expect(f).toContain('area_m2');
    await page.locator('.lm-flt .lm-tbtn', { hasText: '조건 풀기' }).click();
    await expect(page.locator('.lm-flt')).toHaveCount(0);
    // 내려받기 — 줄의 글자 단추 → 동의 한 줄 → GeoJSON
    await row.hover();
    await row.locator('.lm-dlb').click();
    const panel = page.locator('.lm-dl');
    await expect(panel).toContainText('기록이 남습니다');
    const cb = panel.locator('input[type=checkbox]');
    if (await cb.count()) { await expect(panel.locator('.lm-tbtn').first()).toBeDisabled(); await cb.check(); }
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), panel.locator('.lm-tbtn', { hasText: 'GeoJSON' }).click()]);
    expect(dl.suggestedFilename()).toMatch(/남원시_.*\.geojson$/);
    const text = await page.locator('.lm-page').innerText();
    for (const bad of ['job_', 'results/lx', 'GPU', 'p95', '의심', '현장 확인']) expect(text.includes(bad), bad).toBe(false);
    expect(errs).toEqual([]);
  });
});
