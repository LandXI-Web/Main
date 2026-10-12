// impl-21 학습-작업흐름-v3(10-12 '이대로 구현') · 불러오는 중(원칙 212) — GPU 0(학습을 시작하지 않음 · 확인 창은 취소).
// 흐름 판 · 이번 학습 · 학습 이력 · 블록 더하기 · 잇는 규칙 · 서랍 · GPU 고르는 자리 없음 · 늦은 응답에만 가운데 '불러오는 중'.
import { test, expect } from '@playwright/test';
import { frontDoor } from '../../landxi/v3/kit/lint/forbidden.mjs';

async function trainUrl(page) {
  return page.evaluate(async () => {
    const { api } = await import('/landxi/shared/api-v1.js');   // 화면과 같은 API 주소(로컬 :8700 · 바깥 주소 같은 출처)
    const j = await api('/projects?scope=all');
    const p = (j.items || [])[0];
    return p ? `v3/lx-train/?project=${encodeURIComponent(p.id)}&stage=train` : null;
  });
}

test.describe('impl-21 · 프로젝트 학습 = AI 모델 작업 흐름', () => {
  test('세로 한 줄기 · 블록 더하기 · 잇는 규칙 · 서랍 · GPU 고르는 자리 없음', async ({ page, baseURL }) => {
    const errs = [];
    page.on('pageerror', (e) => errs.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    await frontDoor(page, new URL(baseURL).origin, 'test@lx.or.kr', 'app');
    await page.waitForURL((u) => !/\/login\/?$/.test(u.pathname), { timeout: 20000 });
    const url = await trainUrl(page);
    test.skip(!url, '프로젝트 없음');
    await page.goto(url);
    await expect(page.locator('.tb-board h1')).toHaveText('학습 · AI 모델 작업 흐름', { timeout: 30000 });
    await expect(page.locator('.tb-perf h2')).toHaveText('이번 학습 · 반복마다 정확도');
    await expect(page.locator('.tb-hist h2')).toContainText('학습 이력');
    await expect(page.locator('body')).not.toContainText('표본');
    /* GPU — 한 줄 안내만, 고르는 칸 없음 */
    await expect(page.locator('.tb-keys .tb-gpu')).toContainText('LX 관리자가 배정');
    expect(await page.locator('select, input[type=radio]').count()).toBe(0);
    /* 블록 더하기(칩 누름) → 블록 하나 더 · 서랍 열림 */
    const n0 = await page.locator('.tb-node').count();
    await page.locator('.tb-chip[data-k="cfg"]').click();
    await expect(page.locator('.tb-node')).toHaveCount(n0 + 1);
    await expect(page.locator('.tb-side')).toBeVisible();
    await expect(page.locator('.tb-side h2')).toContainText('학습 설정');
    /* 잇는 규칙 — 학습 설정 → 학습 설정은 안 됨(그 자리 문장) */
    const cfgs = page.locator('.tb-node[data-kind="cfg"]');
    await cfgs.first().locator('.tb-port:not(.in)').click();
    await cfgs.last().click();
    await expect(page.locator('.tb-say')).toBeVisible();
    /* Delete 로 지우기(고른 블록) */
    await page.keyboard.press('Escape');
    await cfgs.last().click();
    await expect(page.locator('.tb-side')).toBeVisible();
    await page.keyboard.press('Delete');
    await expect(page.locator('.tb-node')).toHaveCount(n0);
    await expect(page.locator('.tb-side')).toBeHidden();
    expect(errs).toEqual([]);
  });

  test("늦은 응답에만 가운데 '불러오는 중' 한 마디", async ({ page, baseURL }) => {
    await frontDoor(page, new URL(baseURL).origin, 'test@lx.or.kr', 'app');
    await page.waitForURL((u) => !/\/login\/?$/.test(u.pathname), { timeout: 20000 });
    const url = await trainUrl(page);
    test.skip(!url, '프로젝트 없음');
    await page.route(/\/api\/v1\/projects\/[^/]+\/train(\?|$)/, async (r) => { await new Promise((ok) => setTimeout(ok, 1500)); await r.continue(); });
    await page.goto(url);
    await expect(page.locator('.k-ld.is-on')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.k-ld-t')).toHaveText('불러오는 중');
    await expect(page.locator('.tb-board')).toBeVisible({ timeout: 30000 });
    await expect(page.locator('.k-ld.is-on')).toHaveCount(0, { timeout: 5000 });
  });
});
