import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const URL = 'proto/login.html';
const SHOTS = 'shots/proto-login';
fs.mkdirSync(SHOTS, { recursive: true });

// 오프라인/키 없음에서 V-World 타일이 404 나는 것은 정상 동작이다(판은 어두운 바닥으로 남는다).
// 네트워크 실패는 무시하고, 우리 코드가 던진 것만 실패로 본다.
const NETWORK = /Failed to load resource|net::ERR|ERR_|status of 40|status of 50|AbortError|could not be decoded/i;

function watch(page) {
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (!NETWORK.test(t)) errs.push('console: ' + t);
  });
  return errs;
}

async function boot(page, q = '') {
  await page.addInitScript(() => { try { localStorage.clear(); } catch {} });
  await page.goto(URL + q);
  await page.waitForFunction(() => window.__login && window.__login.ready, null, { timeout: 30000 });
  await page.waitForTimeout(1400);            // 등장 스태거(600ms + 6×60ms) 정착
}

const EMAIL_MSG = '업무 이메일 형식으로 입력해 주세요 (예: hong@lx.or.kr)';
const PW_MSG = '비밀번호가 비어 있습니다. 계정은 소속 기관 담당자가 발급합니다.';

test('로드 — 콘솔 오류 0, 구도와 카피가 그대로 있다', async ({ page }) => {
  const errs = watch(page);
  await boot(page);

  await expect(page.locator('.lg-h1')).toContainText('국토는 매일');
  await expect(page.locator('.lg-h1')).toContainText('조금씩 달라진다');
  await expect(page.locator('.lg-cta__t')).toHaveText('로그인하고 시작하기');
  await expect(page.locator('.lx-plate__cap')).toContainText('FIG. 01');
  await expect(page.locator('.lx-plate__cap')).toContainText('전주 · LX 본사 · V-World 정사영상');
  await expect(page.locator('#lgClock')).toHaveText(/^\d{2}:\d{2}$/);
  await expect(page.locator('.lg-live')).toContainText('LIVE');

  // 좌 5/12 · 우 7/12, 거터 64px (Vantor 실측 그리드)
  const box = await page.evaluate(() => {
    const l = document.querySelector('.lg-left').getBoundingClientRect();
    const r = document.querySelector('.lg-right').getBoundingClientRect();
    const h1 = getComputedStyle(document.querySelector('.lg-h1'));
    return { lx: l.x, lw: l.width, rw: r.width, fs: h1.fontSize, lh: h1.lineHeight, fam: h1.fontFamily };
  });
  expect(box.lx).toBe(64);
  expect(box.fs).toBe('64px');
  expect(box.lh).toBe('80px');
  expect(box.fam).toMatch(/SUIT/);
  expect(box.rw / box.lw).toBeGreaterThan(1.25);      // 7/12 ÷ 5/12 ≈ 1.4

  expect(errs).toEqual([]);
  await page.screenshot({ path: `${SHOTS}/default.png` });
});

test('앰비언트 — 5초 아무것도 안 해도 카메라가 표류한다(주기 12s)', async ({ page }) => {
  await boot(page);
  const a = await page.evaluate(() => window.__login.center());
  test.skip(a === null, '지도 미생성(WebGL 없음) — 정지 화면 폴백');
  expect(await page.evaluate(() => window.__login.drifting())).toBe(true);
  // 12초 주기이므로 어느 위상에서 시작하든 몇 초 안에 눈에 띄게 움직인다.
  await page.waitForFunction((a0) => {
    const b = window.__login.center();
    return Math.abs(a0[0] - b[0]) + Math.abs(a0[1] - b[1]) > 0.0004;
  }, a, { timeout: 15000 });
});

test('포커스 — 액센트 헤어라인이 좌→우로 그어진다', async ({ page }) => {
  await boot(page);
  await page.locator('#lgEmail').click();
  await page.locator('#lgEmail').fill('hong@lx.or.kr');
  await expect(page.locator('[data-field=email]')).toHaveClass(/is-focus/);
  await page.waitForTimeout(320);                    // 180ms 헤어라인이 다 그어질 때까지
  const rule = await page.evaluate(() => {
    const el = document.querySelector('[data-field=email] .lx-field__rule');
    const cs = getComputedStyle(el);
    return { w: el.getBoundingClientRect().width, c: cs.backgroundColor, d: cs.transitionDuration };
  });
  expect(rule.w).toBeGreaterThan(300);
  expect(rule.c).toBe('rgb(0, 109, 247)');           // LX 블루 — 액센트 1
  expect(rule.d).toContain('0.18s');                 // 호버/포커스 180ms
  await page.screenshot({ path: `${SHOTS}/focus.png` });
});

test('빈 제출 — 카피 덱 문안이 인라인으로, 사과 없이 나온다', async ({ page }) => {
  const errs = watch(page);
  await boot(page);

  await page.locator('#lgSubmit').click();
  await expect(page.locator('#lgEmailMsg')).toBeVisible();
  await expect(page.locator('#lgEmailMsg')).toHaveText(EMAIL_MSG);
  await expect(page.locator('#lgPwMsg')).toHaveText(PW_MSG);
  await expect(page.locator('[data-field=email]')).toHaveClass(/is-error/);
  for (const t of [EMAIL_MSG, PW_MSG]) expect(t).not.toMatch(/죄송|불편|잠시 후/);

  expect(page.url()).toContain('login.html');
  expect(await page.evaluate(() => localStorage.getItem('lx_logged_in'))).toBeNull();
  expect(errs).toEqual([]);
  await page.waitForTimeout(320);
  await page.screenshot({ path: `${SHOTS}/error.png` });
});

test('형식 오류 — 이메일만 어긋나면 그 필드만 표시된다', async ({ page }) => {
  await boot(page);
  await page.locator('#lgEmail').fill('hong');
  await page.locator('#lgPw').fill('lx-2026');
  await page.locator('#lgSubmit').click();
  await expect(page.locator('#lgEmailMsg')).toHaveText(EMAIL_MSG);
  await expect(page.locator('#lgPwMsg')).toBeHidden();
});

test('성공 — 동사가 바뀌고 카메라가 남원으로 이동한다', async ({ page }) => {
  // 204 로 응답하면 브라우저가 이동하지 않는다 — 문서를 살려 둔 채 카메라를 확인한다.
  await page.route('**/dashboard.html', (r) => r.fulfill({ status: 204, body: '' }));
  await boot(page);

  await page.locator('#lgEmail').fill('hong@lx.or.kr');
  await page.locator('#lgPw').fill('lx-2026');
  await page.locator('#lgSubmit').click();

  await expect(page.locator('.lg-cta__t')).toHaveText('로그인 중…');
  await page.waitForFunction(() => document.querySelector('.lg-cta__t').textContent === '시작됨', null, { timeout: 5000 });
  expect(await page.evaluate(() => localStorage.getItem('lx_logged_in'))).toBe('1');
  await expect(page.locator('#lg')).toHaveClass(/is-leaving/);

  // 착지(타일이 그려진 뒤)까지 기다린다 — 마지막 프레임이 검은 판이면 안 된다.
  await page.waitForFunction(() => window.__login.landed, null, { timeout: 15000 });
  await page.screenshot({ path: `${SHOTS}/success.png` });

  const c = await page.evaluate(() => window.__login.center());
  expect(await page.evaluate(() => window.__login.drifting())).toBe(false);  // 표류 정지
  expect(Math.abs(c[1] - 35.5311)).toBeLessThan(0.02);                       // 남원 착지
  expect(Math.abs(c[0] - 127.3524)).toBeLessThan(0.02);
});

test('리다이렉트 — 허용 목록 밖 next 는 무시된다', async ({ page }) => {
  await boot(page, '?next=' + encodeURIComponent('https://evil.example/steal'));
  await page.locator('#lgEmail').fill('hong@lx.or.kr');
  await page.locator('#lgPw').fill('lx-2026');
  await page.locator('#lgSubmit').click();
  await page.waitForURL(/dashboard\.html/, { timeout: 15000 });
  expect(page.url()).not.toContain('evil');
});

test('리다이렉트 — 허용 목록 안 next 로만 간다', async ({ page }) => {
  await boot(page, '?next=map.html');
  await page.locator('#lgEmail').fill('hong@lx.or.kr');
  await page.locator('#lgPw').fill('lx-2026');
  await page.locator('#lgSubmit').click();
  await page.waitForURL(/map\.html/, { timeout: 15000 });
});

test('safeNext — 허용/차단 목록 단위 점검', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    const f = window.__login.safeNext;
    return {
      ok: [f('dashboard.html'), f('map.html?x=1'), f('my-page.html')],
      no: [f('https://evil.example/a.html'), f('//evil.example/a.html'), f('../secret.html'),
           f('javascript:alert(1)'), f(''), f('dashboard.php')],
    };
  });
  expect(r.ok).toEqual(['dashboard.html', 'map.html?x=1', 'my-page.html']);
  expect(new Set(r.no)).toEqual(new Set(['dashboard.html']));
});

test('축소 모션 — 표류·리빌 없이 같은 내용이 전부 보인다', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errs = watch(page);
  await boot(page);
  expect(await page.evaluate(() => window.__login.drifting())).toBe(false);
  const clip = await page.evaluate(() => getComputedStyle(document.querySelector('.lx-plate')).clipPath);
  expect(clip === 'none' || /inset\(0/.test(clip)).toBeTruthy();
  await expect(page.locator('.lg-h1')).toBeVisible();
  expect(errs).toEqual([]);
  await ctx.close();
});

test('1024 — 구도가 무너지지 않는다', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 900 } });
  const page = await ctx.newPage();
  await boot(page);
  const over = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  expect(over).toBe(false);
  await ctx.close();
});
