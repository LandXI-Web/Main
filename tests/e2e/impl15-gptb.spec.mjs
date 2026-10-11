// 외부 검수 3차 보완 b — 지도 서비스 조건 칩(칩마다 풀기 · GPT3-3) · 목록 보기(도형을 키보드 · 목록으로 고르기 · 도형목록).
// 로그인 폼 입력만(세션 주입 0) · 게이트웨이 :8700 · GPU 0 · 언어 모델 0(거르기는 채팅창이 받는 동작을 그대로 흉내 — 서버 직행 답과 같은 모양).
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { frontDoor } from '../../landxi/v3/kit/lint/forbidden.mjs';

const ENV = path.resolve('server/.env');
const PW = fs.existsSync(ENV) ? (/DEV_PASSWORD=(.+)/.exec(fs.readFileSync(ENV, 'utf8')) || [])[1]?.trim() : null;
const up = async (request) => { try { return (await request.get('http://127.0.0.1:8700/api/v1/health', { timeout: 3000 })).ok(); } catch { return false; } };

test.describe('외부 검수 3차 b · 지도 서비스', () => {
  test.beforeEach(async ({ request }) => {
    test.skip(!PW, 'server/.env DEV_PASSWORD 없음');
    test.skip(!(await up(request)), '게이트웨이 :8700 꺼짐');
  });

  test('조건 칩 둘 → 칩 하나 풀기(남은 조건 · 새 수) · 목록 보기 → 키보드 Enter → 속성 칸 · 목록으로', async ({ page, baseURL }) => {
    test.setTimeout(150000);
    const errs = []; page.on('pageerror', (e) => errs.push(String(e))); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    await page.addInitScript(() => { try { sessionStorage.setItem('lx.chat.test', '1'); localStorage.removeItem('lx-map.ui'); } catch { /* */ } });
    await frontDoor(page, new URL(baseURL).origin, 'test@lx.or.kr', 'app');
    await page.waitForURL((u) => u.pathname.startsWith('/landxi/v3/lx-console/'), { timeout: 20000 });
    await page.goto('v3/lx-map/');
    await expect(page.locator('body[data-ready="1"]')).toHaveCount(1, { timeout: 60000 });
    const card = page.locator('.lm-grp', { hasText: '비닐하우스 분석서비스' });
    if ((await card.locator('.lm-gt').getAttribute('aria-expanded')) !== 'true') await card.locator('.lm-gt').click();
    while (await page.locator('.lm-sw[aria-checked="true"]').count()) await page.locator('.lm-sw[aria-checked="true"]').first().click();
    const row = card.locator('li', { hasText: '남원시' }).first();
    await row.locator('.lm-sw').click();
    await page.waitForTimeout(2500);
    // 서버 직행 답과 같은 모양의 동작(조건 둘 · 칩 둘)
    await page.evaluate(() => document.dispatchEvent(new CustomEvent('kit:agent-action', { cancelable: true, detail: {
      op: 'map_filter', label: '1,000㎡ 넘음 · 운봉읍', n: 60, area_min: 1000, area_op_min: '>', emd: ['운봉읍'],
      chips: [{ k: 'area', label: '1,000㎡ 넘음' }, { k: 'emd', label: '운봉읍' }] } })));
    await expect(page.locator('.lm-flt .lm-chip')).toHaveCount(2);
    await expect(page.locator('.lm-flt .lm-tbtn')).toHaveText('모두 풀기');
    // 면적 칩 풀기 → 운봉읍만 남고 수는 서버가 같은 식으로 다시 셈
    await page.locator('.lm-chip', { hasText: '㎡' }).locator('button').click();
    await expect(page.locator('.lm-flt .lm-chip')).toHaveCount(1);
    await expect(page.locator('.lm-flt')).toContainText('운봉읍');
    const n = await page.locator('.lm-flt em').innerText();
    expect(n).toMatch(/^\d[\d,]*건$/);
    const f = await page.evaluate(() => { const m = window.__lm.map; const id = m.getStyle().layers.map((l) => l.id).find((i) => i.startsWith('lm-r-') && i.endsWith('-fill') && m.getLayoutProperty(i, 'visibility') !== 'none'); return JSON.stringify(m.getFilter(id)); });
    expect(f).toContain('운봉읍'); expect(f).not.toContain('area_m2');
    // 목록 보기 — 지금 조건 그대로 · 넓은 것부터 · 같은 수
    await row.hover();
    await row.locator('.lm-lsb').click();
    await expect(page.locator('.lm-rows .lm-row').first()).toBeVisible({ timeout: 30000 });
    await expect(page.locator('.lm-rsub')).toContainText(n);
    await expect(page.locator('.lm-rsub')).toContainText('운봉읍');
    // 키보드만으로 — 첫 줄에 포커스가 와 있고 Enter → 속성 칸(← 목록으로)
    await expect(page.locator('.lm-rows .lm-row').first()).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('.lm-props[data-view="props"] .lm-back')).toBeVisible({ timeout: 20000 });
    await expect(page.locator('.lm-props .lm-kv').first()).toContainText('운봉읍');
    await page.keyboard.press('Enter');                                      // 포커스 = '← 목록으로'
    await expect(page.locator('.lm-props[data-view="list"] .lm-row').first()).toBeVisible({ timeout: 20000 });
    const text = await page.locator('.lm-page').innerText();
    for (const bad of ['job_', 'results/lx', 'GPU', '의심', '현장 확인']) expect(text.includes(bad), bad).toBe(false);
    expect(errs).toEqual([]);
  });
});
