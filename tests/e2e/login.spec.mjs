import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.removeItem('lx_logged_in'));
});

test('login validates and redirects to next', async ({ page }) => {
  await page.goto('login.html?next=dashboard.html');
  await page.click('#loginForm button[type=submit]');
  await expect(page.locator('#loginForm .has-error')).toHaveCount(2);
  await expect(page.locator('.login-error')).toHaveText('아이디(이메일)와 비밀번호를 입력해 주세요.');
  await page.fill('[name=email]', 'admin@lx.or.kr');
  await page.fill('[name=pw]', 'x');
  await page.check('[name=remember]');
  await page.click('#loginForm button[type=submit]');
  await expect(page).toHaveURL(/dashboard\.html/);
  expect(await page.evaluate(() => localStorage.getItem('lx_logged_in'))).toBe('1');
});

test('remembers email in localStorage and prefills on reload', async ({ page }) => {
  await page.goto('login.html');
  await page.fill('[name=email]', 'saved@lx.or.kr');
  await page.fill('[name=pw]', 'x');
  await page.check('[name=remember]');
  await page.click('#loginForm button[type=submit]');
  await page.waitForURL(/dashboard\.html/);
  expect(await page.evaluate(() => localStorage.getItem('lx_saved_email'))).toBe('saved@lx.or.kr');
  await page.addInitScript(() => localStorage.removeItem('lx_logged_in'));
  await page.goto('login.html');
  await expect(page.locator('[name=email]')).toHaveValue('saved@lx.or.kr');
});

test('links open expected targets', async ({ page }) => {
  await page.goto('login.html');
  await page.click('text=비밀번호 찾기');
  await expect(page.locator('dialog[open]')).toBeVisible();
  await page.locator('dialog[open] .dialog__close').click();
  await page.click('text=계정 신청하기');
  await expect(page).toHaveURL(/signup\.html/);
});
