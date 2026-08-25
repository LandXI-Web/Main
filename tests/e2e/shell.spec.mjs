import { test, expect } from '@playwright/test';
test.beforeEach(async ({ page }) => { await page.addInitScript(() => localStorage.setItem('lx_logged_in', '1')); });
test('rail has 9 items grouped BUILD/USE and marks active', async ({ page }) => {
  await page.goto('dev/shell.html');
  await expect(page.locator('.rail__item')).toHaveCount(9);
  await expect(page.locator('.rail__group')).toHaveText(['BUILD', 'USE']);
  await expect(page.locator('.rail__item[aria-current=page]')).toHaveAttribute('data-menu', 'dashboard');
});
test('ctx bar shows org, crumb, search, bell, user', async ({ page }) => {
  await page.goto('dev/shell.html');
  await expect(page.locator('.ctx__org')).toContainText('한국국토정보공사');
  await expect(page.locator('.ctx__crumb')).toContainText('관리자');
  await expect(page.locator('.ctx__search')).toBeVisible();
  await expect(page.locator('.ctx__bell .badge')).toHaveText('3');
});
test('embed=1 hides shell chrome', async ({ page }) => {
  await page.goto('dev/shell.html?embed=1');
  await expect(page.locator('.rail')).toHaveCount(0);
  await expect(page.locator('body')).toHaveClass(/is-embed/);
});
test('redirects to login when logged out', async ({ page }) => {
  await page.addInitScript(() => localStorage.removeItem('lx_logged_in'));
  await page.goto('dev/shell.html');
  await expect(page).toHaveURL(/login\.html\?next=/);
});
