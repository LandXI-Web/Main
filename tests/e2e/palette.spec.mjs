import { test, expect } from '@playwright/test';
test.beforeEach(async ({ page }) => { await page.addInitScript(() => localStorage.setItem('lx_logged_in', '1')); });
test('slash opens palette, filters, enter navigates', async ({ page }) => {
  await page.goto('dev/shell.html');
  await page.keyboard.press('/');
  await expect(page.locator('.palette[open]')).toBeVisible();
  await page.keyboard.type('도로안전');
  await expect(page.locator('.palette__item').first()).toContainText('도로안전');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/ai-project-view\.html\?pid=/);
});
test('place result calls onPlace', async ({ page }) => {
  await page.goto('dev/shell.html');
  await page.keyboard.press('/'); await page.keyboard.type('남원');
  await page.locator('.palette__item[data-type=place]').first().click();
  await expect(page.locator('[data-test=place]')).toHaveText(/127\./);
});
test('label/sub are HTML-escaped, not injected', async ({ page }) => {
  await page.goto('dev/shell.html');
  await page.keyboard.press('/'); await page.keyboard.type('XSS');
  await expect(page.locator('.palette__item b').first()).toHaveText('<b>x</b>');
  await expect(page.locator('.palette__item b b')).toHaveCount(0);
});
test('map.flyTo and LX.onPlace are mutually exclusive', async ({ page }) => {
  await page.goto('dev/shell.html');
  await page.evaluate(() => {
    window.LX.map = { flyTo: () => { window.__flew = true; } };
    window.LX.onPlace = () => { window.__placed = true; };
  });
  await page.keyboard.press('/'); await page.keyboard.type('남원');
  await page.locator('.palette__item[data-type=place]').first().click();
  await expect.poll(() => page.evaluate(() => window.__flew)).toBe(true);
  expect(await page.evaluate(() => window.__placed)).toBeUndefined();
});
