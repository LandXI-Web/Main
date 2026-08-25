import { test, expect } from '@playwright/test';
test('home loads with no console errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('home.html');
  await expect(page.locator('[data-test="title"]')).toBeVisible();
  expect(errors).toEqual([]);
});
