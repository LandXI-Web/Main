import { test, expect } from '@playwright/test';

test('orbit scene shows wordmark, globe map and 3 orbit rings, then auto-advances', async ({ page }) => {
  await page.goto('home.html'); await page.waitForFunction(() => window.LX?.map?.ready && window.LX?.home);
  await expect(page.locator('#scene-orbit .wordmark')).toBeVisible();
  await expect(page.locator('#scene-orbit .orbit__ring')).toHaveCount(3);
  await expect(page.locator('#scene-orbit .orbit__craft')).toHaveCount(3);
  await page.waitForTimeout(4600); expect(await page.evaluate(() => window.LX.home.scene)).toBe(2);
});

test('descent shows 13 service points with HUD labels; chip hover highlights; click opens story', async ({ page }) => {
  await page.goto('home.html'); await page.waitForFunction(() => window.LX?.home); await page.evaluate(() => window.LX.home.go(2)); await page.waitForTimeout(1500);
  await expect(page.locator('.hud__point')).toHaveCount(13); await expect(page.locator('.hud__label')).toHaveCount(13);
  await page.locator('.lineup .chip[data-service=marine]').hover(); await expect(page.locator('.hud__point[data-service=marine]')).toHaveClass(/is-hot/);
  await page.locator('.hud__point[data-service=marine]').click(); await page.waitForTimeout(800);
  expect(await page.evaluate(() => window.LX.home.scene)).toBe(3); await expect(page.locator('#scene-story')).toHaveAttribute('data-service', 'marine');
});

test('scene nav dots and keyboard move between scenes; stats count up', async ({ page }) => {
  await page.goto('home.html'); await page.waitForFunction(() => window.LX?.home);
  await page.locator('.scene-nav button').nth(3).click(); expect(await page.evaluate(() => window.LX.home.scene)).toBe(4);
  await page.keyboard.press('PageUp'); await page.waitForTimeout(800); expect(await page.evaluate(() => window.LX.home.scene)).toBe(3);
  await page.evaluate(() => window.LX.home.go(2)); await page.waitForTimeout(1600); await expect(page.locator('.hud__stats [data-n="13"] .kpi__num')).toHaveText('13');
});

test('sunrise: descent scene is light, orbit is dark', async ({ page }) => {
  await page.goto('home.html'); await page.waitForFunction(() => window.LX?.home);
  const dark = await page.evaluate(() => getComputedStyle(document.body).getPropertyValue('--scene-bg').trim());
  await page.evaluate(() => window.LX.home.go(2)); await page.waitForTimeout(1200);
  const light = await page.evaluate(() => getComputedStyle(document.body).getPropertyValue('--scene-bg').trim()); expect(dark).not.toBe(light);
});

// 타일 서버를 끊어 폴백 캔버스 엔진을 강제한다. 두 엔진에서 같은 장면·HUD 가 동작해야 한다.
test('works on the fallback engine when tiles are unreachable', async ({ page }) => {
  await page.route('**tiles.openfreemap.org/**', r => r.abort());
  await page.goto('home.html'); await page.waitForFunction(() => window.LX?.map?.ready && window.LX?.home, null, { timeout: 20000 });
  expect(await page.evaluate(() => window.LX.map.engine)).toBe('fallback');
  await expect(page.locator('#scene-orbit .orbit__ring')).toHaveCount(3);
  const dark = await page.evaluate(() => getComputedStyle(document.body).getPropertyValue('--scene-bg').trim());
  await page.evaluate(() => window.LX.home.go(2)); await page.waitForTimeout(1500);
  expect(await page.evaluate(() => getComputedStyle(document.body).getPropertyValue('--scene-bg').trim())).not.toBe(dark);
  await expect(page.locator('.hud__point')).toHaveCount(13);
  await page.locator('.lineup .chip[data-service=pothole]').hover();
  await expect(page.locator('.hud__point[data-service=pothole]')).toHaveClass(/is-hot/);
  await page.locator('.hud__point[data-service=pothole]').click(); await page.waitForTimeout(800);
  expect(await page.evaluate(() => window.LX.home.scene)).toBe(3);
  await expect(page.locator('#scene-story')).toHaveAttribute('data-service', 'pothole');
});

// 감소 모션: 자동 진행·자전 정지, 크로스페이드 즉시.
test('prefers-reduced-motion: no auto-advance from the orbit scene', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('home.html'); await page.waitForFunction(() => window.LX?.home);
  await page.waitForTimeout(4600);
  expect(await page.evaluate(() => window.LX.home.scene)).toBe(1);
});
