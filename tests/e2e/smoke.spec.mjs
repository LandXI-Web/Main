import { test, expect } from '@playwright/test';

// 구 진입점 3종(home/login/dashboard.html)은 이제 meta refresh 리다이렉트 스텁이다.
// 스텁이 살아 있고, 각각 현행 proto 페이지로 실제로 넘어가는지만 본다.
// 도착 페이지의 동작은 proto-scrub / proto-login / proto-dashboard 스펙이 맡는다.
// dashboard 는 로그인 게이트가 있어(미로그인 → proto/login.html?next=…) 세션을 심고 들어간다.
const REDIRECTS = [
  ['home.html', /\/landxi\/proto\/scrub\/index\.html$/, false],
  ['login.html', /\/landxi\/proto\/login\.html$/, false],
  ['dashboard.html', /\/landxi\/proto\/dashboard\.html$/, true],
];

for (const [from, to, loggedIn] of REDIRECTS) {
  test(`${from} redirects to its proto page`, async ({ page }) => {
    if (loggedIn) await page.addInitScript(() => localStorage.setItem('lx_logged_in', '1'));
    const res = await page.goto(from);
    expect(res.status()).toBe(200);
    await page.waitForURL(to, { timeout: 15000 });
    expect(page.url()).toMatch(to);
  });
}
