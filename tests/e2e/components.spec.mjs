import { test, expect } from '@playwright/test';
test('tabs switch panels and are keyboard navigable', async ({ page }) => {
  await page.goto('dev/components.html');
  const t2 = page.locator('[role=tab]').nth(1); await t2.click();
  await expect(t2).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#' + await t2.getAttribute('aria-controls'))).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('[role=tab]').nth(2)).toHaveAttribute('aria-selected', 'true');
});
test('kpi counts up to data-n', async ({ page }) => {
  await page.goto('dev/components.html');
  await page.waitForTimeout(1500);
  await expect(page.locator('.kpi').first().locator('.kpi__num')).toHaveText('21');
});
test('pill colors follow status tokens', async ({ page }) => {
  await page.goto('dev/components.html');
  // Note: modern Chrome resolves nested var() chains at computed-value read time
  // (getComputedStyle never returns the literal 'var(--s-done)' text — verified
  // against the real `channel: chrome` build this suite runs on), so we compare
  // the pill's resolved --c against the resolved --s-done token instead of an
  // unresolved string. This still fails if the status-to-token wiring breaks.
  const c = await page.locator('.pill[data-status=done]').evaluate(e => getComputedStyle(e).getPropertyValue('--c').trim());
  const expected = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--s-done').trim());
  expect(c).toBe(expected);
});
test('icon sprite renders', async ({ page }) => {
  await page.goto('dev/components.html');
  const box = await page.locator('svg.ic').first().boundingBox(); expect(box.width).toBeGreaterThan(10);
});
