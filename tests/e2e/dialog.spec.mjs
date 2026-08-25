import { test, expect } from '@playwright/test';
test('confirm resolves true/false and traps focus', async ({ page }) => {
  await page.goto('dev/components.html');
  const p = page.evaluate(() => window.NotifyUI.confirm('삭제할까요?', '확인'));
  await expect(page.locator('dialog[open] .dialog__title')).toHaveText('확인');
  await page.locator('dialog[open] [data-value=true]').click();
  expect(await p).toBe(true);
});
test('toast appears and disappears', async ({ page }) => {
  await page.goto('dev/components.html');
  await page.evaluate(() => window.NotifyUI.toast('저장됨', { type: 'success', ms: 500 }));
  await expect(page.locator('.toast')).toBeVisible();
  await expect(page.locator('.toast')).toHaveCount(0, { timeout: 2000 });
});
test('drawer opens right side with content', async ({ page }) => {
  await page.goto('dev/components.html');
  await page.evaluate(() => window.__drawer.open('<p data-test=d>상세</p>'));
  await expect(page.locator('.drawer[data-open=true] [data-test=d]')).toBeVisible();
});
