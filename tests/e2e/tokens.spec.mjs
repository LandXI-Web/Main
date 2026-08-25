import { test, expect } from '@playwright/test';
test('tokens resolve and fonts load', async ({ page }) => {
  await page.goto('home.html');
  const v = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--lx').trim());
  expect(v).toBe('#2457D6');
  await page.evaluate(() => document.fonts.load('700 16px "Gothic A1"', '국토'));
  expect(await page.evaluate(() => document.fonts.check('700 16px "Gothic A1"', '국토'))).toBe(true);
  expect(await page.evaluate(() => getComputedStyle(document.body).fontFamily)).toContain('IBM Plex Sans KR');
});
