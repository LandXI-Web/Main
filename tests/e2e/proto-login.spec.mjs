import { test, expect } from '@playwright/test';
import fs from 'node:fs';

// 마스터 design-canvas/v2/B5-Login.dc.html (NOTES §14 · 2차 개정) — SPLIT-5050.
// 좌 = 원본 login.html 폼 1:1 · 우 = 디오라마 오프닝 필름 Leg 01(w01.mp4) 풀블리드.
const URL = 'proto/login.html';
const SHOTS = 'shots/proto-login';
fs.mkdirSync(SHOTS, { recursive: true });

// 필름 파일이 없을 수 있다(레그를 굽는 중). 그때는 포스터가 남는 게 정상이다.
const NETWORK = /Failed to load resource|net::ERR|ERR_|status of 40|status of 50|AbortError/i;

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

// 첫 문서에서만 저장소를 비운다 — 이후 이동(next 페이지)에서 lx_logged_in 을 지우면 안 된다.
const clearOnce = (page, seed) => page.addInitScript((seed) => {
  try {
    if (sessionStorage.getItem('__lx_cleared')) return;
    localStorage.clear();
    if (seed) for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, v);
    sessionStorage.setItem('__lx_cleared', '1');
  } catch {}
}, seed || null);

async function boot(page, q = '') {
  await clearOnce(page);
  await page.goto(URL + q);
  await page.waitForFunction(() => window.__login && window.__login.ready, null, { timeout: 30000 });
  await page.waitForTimeout(300);
}

// 원본 login.html 의 에러 문구 2종 — 더하지도 빼지도 않는다.
const EMAIL_MSG = '아이디를 입력해 주세요.';
const PW_MSG = '비밀번호를 입력해 주세요.';

test('좌 — 원본 로그인 폼의 컨트롤·문구가 1:1 로 있다', async ({ page }) => {
  const errs = watch(page);
  await boot(page);

  await expect(page.locator('.lg-h1')).toHaveText('로그인');
  await expect(page.locator('.lg-sub')).toHaveText('계정 정보를 입력해 주세요.');
  await expect(page.locator('label[for=lgEmail]')).toHaveText('아이디 (이메일)');
  await expect(page.locator('label[for=lgPw]')).toHaveText('비밀번호');
  await expect(page.locator('#lgEmail')).toHaveAttribute('placeholder', 'example@lx.or.kr');
  await expect(page.locator('#lgPw')).toHaveAttribute('placeholder', '비밀번호');
  await expect(page.locator('.lx-check')).toContainText('로그인 상태 유지');
  await expect(page.locator('.lg-find__a')).toHaveText(['아이디 찾기', '비밀번호 찾기']);
  await expect(page.locator('.lg-submit__t')).toHaveText('로그인');
  await expect(page.locator('.lg-signup')).toContainText('처음 이용하시나요?');
  await expect(page.locator('.lg-signup__a')).toHaveText('계정 신청하기');
  await expect(page.locator('.lg-foot')).toContainText('063-713-1218');
  await expect(page.locator('.lg-foot')).toContainText('평일 09:00~18:00');
  await expect(page.locator('[data-policy]')).toHaveText(['개인정보처리방침', '이용약관', '이메일무단수집거부']);
  await expect(page.locator('.lg-foot__org')).toHaveText('LX 한국국토정보공사');
  await expect(page.locator('.lg-foot__legal')).toContainText('Copyright© LX. ALL RIGHTS RESERVED.');
  // 플랫폼 소개 카피(§3 B2-Login)는 없다.
  await expect(page.locator('body')).not.toContainText('Geo-AI 전문가');
  await expect(page.locator('body')).not.toContainText('범부처 AI 기반');

  // 서체 — SUIT 500 단일 굵기.
  const type = await page.evaluate(() => {
    const cs = getComputedStyle(document.querySelector('.lg-h1'));
    return { fam: cs.fontFamily, w: cs.fontWeight };
  });
  expect(type.fam).toMatch(/SUIT/);
  expect(type.w).toBe('500');

  expect(errs).toEqual([]);
  await page.screenshot({ path: `${SHOTS}/b5-login.png` });
});

test('우 — 디오라마 오프닝 필름(w01.mp4)이 풀블리드로, 브래킷 4 · 캡션 2 와 함께 선다', async ({ page }) => {
  await boot(page);

  await expect(page.locator('.lx-bracket')).toHaveCount(4);
  await expect(page.locator('#lgFilmNo')).toContainText('01');
  await expect(page.locator('#lgFilmNo')).toContainText('/ 12');
  await expect(page.locator('#lgFilmNo')).toContainText('5.08 s');
  await expect(page.locator('#lgCapMeta')).toContainText('모형 지구본 · 위성 · AI 생성 필름');

  const p = await page.evaluate(() => {
    const v = document.querySelector('#lgVideo');
    const r = document.querySelector('#lgPlate').getBoundingClientRect();
    const srcs = [...v.querySelectorAll('source')].map((s) => s.getAttribute('src'));
    return {
      fit: getComputedStyle(v).objectFit,
      poster: v.poster, srcs, current: window.__login.source(),
      autoplay: v.autoplay, muted: v.muted, loop: v.loop, playsinline: v.hasAttribute('playsinline'),
      x: Math.round(r.x), right: Math.round(r.right), top: Math.round(r.top), h: Math.round(r.height),
      vw: innerWidth, vh: innerHeight,
    };
  });
  expect(p.fit).toBe('cover');
  expect(p.poster).toMatch(/\/assets\/proto\/film\/legs\/w01\.webp$/);
  expect(p.srcs.some((s) => s.endsWith('/w01.mp4'))).toBe(true);
  expect(p.srcs.some((s) => s.endsWith('/w01-m.mp4'))).toBe(true);
  expect(p.current === null || /w01\.mp4$/.test(p.current)).toBeTruthy();   // 1440 폭 = 데스크톱 소스
  expect(p.autoplay && p.muted && p.loop && p.playsinline).toBe(true);
  // SPLIT-5050 — 판이 x 720 에서 1440 까지, y 0–900, 마진 없이.
  expect(p.x).toBe(Math.round(p.vw / 2));
  expect(p.right).toBe(p.vw);
  expect(p.top).toBe(0);
  expect(p.h).toBe(p.vh);
});

test('앰비언트 — 유휴 움직임은 필름 루프 하나, 5초 아무것도 안 해도 돈다', async ({ page }) => {
  await boot(page);
  const src = await page.evaluate(() => window.__login.source());
  test.skip(src === null, '필름 미존재 — 포스터 정지 화면 폴백');
  await page.waitForFunction(() => window.__login.drifting(), null, { timeout: 10000 });
  const t0 = await page.evaluate(() => document.querySelector('#lgVideo').currentTime);
  await page.waitForTimeout(900);
  const t1 = await page.evaluate(() => document.querySelector('#lgVideo').currentTime);
  expect(t1).not.toBe(t0);
});

test('시스템 법 — 헤어라인 · radius 0 · shadow 0 · 12px 바닥 · 액센트는 포커스 밑줄 한 곳', async ({ page }) => {
  await boot(page);
  const m = await page.evaluate(() => {
    const all = [...document.querySelectorAll('.lg *')];
    const vis = all.filter((n) => n.getClientRects().length && getComputedStyle(n).visibility !== 'hidden');
    const cs = (n) => getComputedStyle(n);
    const small = vis.filter((n) => n.childNodes.length && [...n.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim()))
      .map((n) => parseFloat(cs(n).fontSize)).filter((s) => s < 12);
    const radius = vis.filter((n) => cs(n).borderRadius !== '0px').length;
    const shadow = vis.filter((n) => cs(n).boxShadow !== 'none').length;
    const accent = vis.filter((n) => {
      const c = cs(n);
      return [c.color, c.backgroundColor, c.borderBottomColor].includes('rgb(0, 109, 247)') && !n.classList.contains('lx-field__rule');
    }).length;
    const r = document.querySelector('.lg-foot').getBoundingClientRect();
    return {
      small, radius, shadow, accent,
      footBorder: cs(document.querySelector('.lg-foot')).borderTopWidth,
      formX: Math.round(document.querySelector('.lg-form').getBoundingClientRect().x),
      formW: Math.round(document.querySelector('.lg-form').getBoundingClientRect().width),
      overX: document.documentElement.scrollWidth > innerWidth + 1,
      overY: document.documentElement.scrollHeight > innerHeight + 1,
      footBottom: Math.round(r.bottom), vh: innerHeight,
    };
  });
  expect(m.small).toEqual([]);
  expect(m.radius).toBe(0);
  expect(m.shadow).toBe(0);
  expect(m.accent).toBe(0);              // 정지 상태에서 액센트 0 — 포커스 때 밑줄 1
  expect(m.footBorder).toBe('1px');
  expect(m.formX).toBe(72);
  expect(m.formW).toBe(492);
  expect(m.overX).toBe(false);
  expect(m.overY).toBe(false);
  expect(m.footBottom).toBeLessThanOrEqual(m.vh);
});

test('포커스 — 액센트 헤어라인이 좌→우로 그어진다', async ({ page }) => {
  await boot(page);
  await page.locator('#lgEmail').click();
  await page.locator('#lgEmail').fill('hong@lx.or.kr');
  await expect(page.locator('[data-field=email]')).toHaveClass(/is-focus/);
  await page.waitForTimeout(320);
  const rule = await page.evaluate(() => {
    const el = document.querySelector('[data-field=email] .lx-field__rule');
    const cs = getComputedStyle(el);
    return { w: el.getBoundingClientRect().width, c: cs.backgroundColor, d: cs.transitionDuration };
  });
  expect(rule.w).toBeGreaterThan(300);
  expect(rule.c).toBe('rgb(0, 109, 247)');
  expect(rule.d).toContain('0.18s');
  await page.screenshot({ path: `${SHOTS}/focus.png` });
});

test('빈 제출 — 원본 에러 문구 2종이 인라인으로 나온다', async ({ page }) => {
  const errs = watch(page);
  await boot(page);

  await page.locator('#lgSubmit').click();
  await expect(page.locator('#lgEmailMsg')).toBeVisible();
  await expect(page.locator('#lgEmailMsg')).toHaveText(EMAIL_MSG);
  await expect(page.locator('#lgPwMsg')).toHaveText(PW_MSG);
  await expect(page.locator('[data-field=email]')).toHaveClass(/is-error/);
  await expect(page.locator('#lgEmail')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#lgEmail')).toBeFocused();

  expect(page.url()).toContain('login.html');
  expect(await page.evaluate(() => localStorage.getItem('lx_logged_in'))).toBeNull();
  expect(errs).toEqual([]);
  await page.screenshot({ path: `${SHOTS}/error.png` });
});

test('부분 오류 — 비밀번호만 비면 그 필드만 표시되고, 입력하면 지워진다', async ({ page }) => {
  await boot(page);
  await page.locator('#lgEmail').fill('hong@lx.or.kr');
  await page.locator('#lgSubmit').click();
  await expect(page.locator('#lgEmailMsg')).toBeHidden();
  await expect(page.locator('#lgPwMsg')).toHaveText(PW_MSG);
  await page.locator('#lgPw').fill('x');
  await expect(page.locator('#lgPwMsg')).toBeHidden();
});

test('성공 — lx_logged_in 을 세우고 next 로 간다', async ({ page }) => {
  await boot(page);
  await page.locator('#lgEmail').fill('hong@lx.or.kr');
  await page.locator('#lgPw').fill('lx-2026');
  await page.locator('#lgSubmit').click();
  await expect(page.locator('#lgSubmit')).toBeDisabled();
  await page.waitForURL(/dashboard\.html/, { timeout: 15000 });
  expect(await page.evaluate(() => localStorage.getItem('lx_logged_in'))).toBe('1');
});

test('이미 로그인 — 다시 열면 next 로 바로 넘어간다', async ({ page }) => {
  await clearOnce(page, { lx_logged_in: '1' });
  await page.goto(URL + '?next=map.html');
  await page.waitForURL(/map\.html/, { timeout: 15000 });
});

test('?logout — 세션을 지우고 원본 배너 문구가 켜진다', async ({ page }) => {
  await clearOnce(page, { lx_logged_in: '1' });
  await page.goto(URL + '?logout');
  await page.waitForFunction(() => window.__login && window.__login.ready, null, { timeout: 30000 });
  await expect(page.locator('#lgBanner')).toBeVisible();
  await expect(page.locator('#lgBanner')).toHaveText('안전하게 로그아웃되었습니다.');
  expect(await page.evaluate(() => localStorage.getItem('lx_logged_in'))).toBeNull();
  expect(page.url()).toContain('login.html');
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

test('아이디 저장 — 체크하면 다음 방문에 이메일이 채워져 있다', async ({ page }) => {
  await boot(page);
  await page.locator('#lgEmail').fill('hong@lx.or.kr');
  await page.locator('#lgPw').fill('lx-2026');
  await page.locator('.lx-check').click();            // 실제 입력은 시각적으로 숨겨져 있다
  await expect(page.locator('.lx-check input')).toBeChecked();
  await page.locator('#lgSubmit').click();
  await page.waitForFunction(() => localStorage.getItem('lx_saved_email') === 'hong@lx.or.kr', null, { timeout: 10000 });

  await page.goto(URL + '?logout');
  await page.waitForFunction(() => window.__login && window.__login.ready, null, { timeout: 30000 });
  await expect(page.locator('#lgEmail')).toHaveValue('hong@lx.or.kr');
  await expect(page.locator('.lx-check input')).toBeChecked();
});

test('축소 모션 — 필름 대신 포스터, 같은 내용이 전부 보인다', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errs = watch(page);
  await clearOnce(page);
  await page.goto(URL);
  await page.waitForFunction(() => window.__login && window.__login.ready, null, { timeout: 30000 });
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.__login.drifting())).toBe(false);
  expect(await page.evaluate(() => document.querySelectorAll('#lgVideo source').length)).toBe(0);
  expect(await page.evaluate(() => document.querySelector('#lgVideo').poster)).toMatch(/w01\.webp$/);
  await expect(page.locator('.lg-h1')).toBeVisible();
  await expect(page.locator('#lgSubmit')).toBeVisible();
  await expect(page.locator('.lx-bracket')).toHaveCount(4);
  expect(errs).toEqual([]);
  await ctx.close();
});

test('1024 — 구도가 무너지지 않는다', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 900 } });
  const page = await ctx.newPage();
  await boot(page);
  const over = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  expect(over).toBe(false);
  await expect(page.locator('.lg-h1')).toBeVisible();
  await expect(page.locator('#lgPlate')).toBeVisible();
  await expect(page.locator('.lg-foot')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/default-1024.png`, fullPage: true });
  await ctx.close();
});
