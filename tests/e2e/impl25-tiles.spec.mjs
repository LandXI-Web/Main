// impl-25 결정 3 ⓐ 고치면 저절로(10-12 16:18 확인) — XI 재학습 줄은 '학습 데이터 n장 / 기준'으로 센다 · 로그인 폼 입력만 · GPU 0.
import { test, expect } from '@playwright/test';
import { frontDoor } from '../../landxi/v3/kit/lint/forbidden.mjs';

const watch = (page) => { const errs = []; page.on('pageerror', (e) => errs.push(String(e))); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); }); return errs; };

test('LX 관리자 — 배포 → XI 재학습: 고친 자리 한 칸 = 학습 데이터 1장', async ({ page, baseURL }) => {
  const errs = watch(page);
  await frontDoor(page, new URL(baseURL).origin, 'lxadmin@lx.or.kr', 'admin');
  await page.waitForURL((u) => !/\/login\/?$/.test(u.pathname), { timeout: 20000 });
  await page.goto('v3/ops-infra/#/deploys/retrain');
  await expect(page.locator('.rt-tbl tbody tr').first()).toBeVisible({ timeout: 30000 });
  await expect(page.locator('.rt-tbl tbody tr').first().locator('small.num')).toHaveText(/^\d[\d,]* \/ \d[\d,]*장$/);
  await expect(page.locator('.rv-note', { hasText: 'XI맵에서 고친 곳은 학습 데이터로 모입니다' })).toHaveCount(1);   // 10-13 쉬운 말(원칙 230)
  await expect(page.locator('.rt-col')).not.toContainText('조용하면');
  await expect(page.locator('.rt-tbl')).not.toContainText('GPU');
  expect(errs).toEqual([]);
});
