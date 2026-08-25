import { test, expect } from '@playwright/test';
test('tokens resolve and fonts load', async ({ page }) => {
  await page.goto('home.html');
  const v = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--lx').trim());
  // Land-XI 워드마크에서 뽑은 CI 블루(tools/prepare-assets.py 의 sample_ci_blue).
  expect(v).toBe('#006DF7');
  expect(await page.evaluate(() => getComputedStyle(document.body).getPropertyValue('--scene-bg').trim())).toBe('#0E1726'); // 홈은 body.is-dark 로 시작한다(궤도 장면)
  await page.evaluate(() => document.fonts.load('700 16px "Gothic A1"', '국토'));
  expect(await page.evaluate(() => document.fonts.check('700 16px "Gothic A1"', '국토'))).toBe(true);
  expect(await page.evaluate(() => getComputedStyle(document.body).fontFamily)).toContain('IBM Plex Sans KR');
});

test('정보 상태색은 주색을 따라간다(--s-info: var(--lx))', async ({ page }) => {
  await page.goto('home.html');
  const [info, lx] = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    return [cs.getPropertyValue('--s-info').trim(), cs.getPropertyValue('--lx').trim()];
  });
  expect(info).toBe(lx);
  expect(info).toBe('#006DF7');   // var() 참조가 계산값 시점에 치환되는지까지 확인
});

test('틴트 배경 위 텍스트는 --lx-deep 이라 AA 를 넘는다', async ({ page }) => {
  // 셸 크롬(.ctx__tag / .secondary__item)은 로그인 상태에서만 그려진다.
  await page.addInitScript(() => localStorage.setItem('lx_logged_in', '1'));
  await page.goto('dev/shell.html');
  // #006DF7 on #EBF3FE = 4.15:1(AA 미달) → #0052B9 on #EBF3FE = 6.46:1
  const deep = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--lx-deep').trim());
  expect(deep).toBe('#0052B9');
  await expect(page.locator('.ctx__tag')).toHaveCount(1);   // 셀렉터가 죽으면 아래가 무의미해진다
  let checked = 0;
  for (const sel of ['.ctx__tag', '.secondary__item[aria-current=page]']) {
    const el = page.locator(sel).first();
    if (!(await el.count())) continue;
    const { color, bg } = await el.evaluate(e => {
      const cs = getComputedStyle(e);
      return { color: cs.color, bg: cs.backgroundColor };
    });
    expect(color, sel).toBe('rgb(0, 82, 185)');        // --lx-deep
    expect(bg, sel).toBe('rgb(235, 243, 254)');        // --lx-tint
    checked++;
  }
  expect(checked).toBeGreaterThan(0);
});
