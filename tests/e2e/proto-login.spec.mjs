import { test, expect } from '@playwright/test';
import fs from 'node:fs';

// 마스터 design-canvas/v2/B5-Login.dc.html (NOTES §14 · 3차 개정) — SPLIT-5050.
// 좌 = 실제 CI 2(좌상 Land-XI 워드마크 · 좌하 LX 락업) + 폼 1:1(우·하, 판과 간격 64) · 우 = 필름 Leg 01 인셋 판(마진 56 · 헤어라인 · 캡션 0).
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
  // 실제 CI 2 — 조판/트레이싱 폴백이 아니라 공식 파일. 로드돼서 자연 크기가 있어야 한다.
  const ci = await page.evaluate(() => {
    const g = (id) => { const i = document.querySelector(id); const r = i.getBoundingClientRect();
      return { src: i.getAttribute('src'), ok: i.complete && i.naturalWidth > 0, x: Math.round(r.x), y: Math.round(r.y), h: Math.round(r.height), w: Math.round(r.width) }; };
    return { lx: g('#lgCiLandxi'), lock: g('#lgCiLx'), old: document.querySelectorAll('.lg-brand__wm, .lg-brand__org, .lg-foot__org').length };
  });
  expect(ci.lx.src).toBe('../assets/brand/landxi-wordmark.png');
  expect(ci.lx.ok).toBe(true);
  expect(ci.lx.x).toBe(72); expect(ci.lx.y).toBe(58); expect(ci.lx.h).toBe(22);
  expect(ci.lock.src).toBe('../assets/brand/vector/lx-lockup.svg');
  expect(ci.lock.ok).toBe(true);
  expect(ci.lock.x).toBe(72); expect(ci.lock.h).toBe(18);
  expect(ci.old).toBe(0);
  await expect(page.locator('#lgCiLx')).toHaveAttribute('alt', 'LX 한국국토정보공사');
  await expect(page.locator('.lg-foot__legal')).toContainText('Copyright© LX. ALL RIGHTS RESERVED.');
  // 플랫폼 소개 카피(§3 B2-Login)는 없다.
  await expect(page.locator('body')).not.toContainText('Geo-AI 전문가');
  await expect(page.locator('body')).not.toContainText('범부처 AI 기반');

  // 서체(발주 결정) — 제목 Paperlogy 700 · 라벨/버튼 Pretendard. 폰트는 실제 로드돼야 한다.
  const type = await page.evaluate(async () => {
    await document.fonts.ready;
    const h = getComputedStyle(document.querySelector('.lg-h1'));
    const b = getComputedStyle(document.querySelector('.lg-submit'));
    const l = getComputedStyle(document.querySelector('.lx-field__label'));
    return { fam: h.fontFamily, w: h.fontWeight, btn: b.fontFamily, lbl: l.fontFamily, loaded: document.fonts.check('700 32px Paperlogy') };
  });
  expect(type.fam).toMatch(/^"?Paperlogy"?/);
  expect(type.w).toBe('700');
  expect(type.btn).toMatch(/^"?Pretendard"?/);
  expect(type.lbl).toMatch(/^"?Pretendard"?/);
  expect(type.loaded).toBe(true);

  expect(errs).toEqual([]);
  await page.screenshot({ path: `${SHOTS}/b5-login.png` });
});

test('우 — 디오라마 오프닝 필름(w01.mp4)이 마진 56 인셋 판(608×788 · 헤어라인)으로, 캡션·브래킷 0', async ({ page }) => {
  await boot(page);

  await expect(page.locator('.lx-bracket')).toHaveCount(0);
  await expect(page.locator('#lgFilmNo, #lgCapMeta, .lg-film__cap, .lg-film__no')).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText('kling');
  await expect(page.locator('body')).not.toContainText('모형 지구본');
  await expect(page.locator('body')).not.toContainText('5.08 s');

  const p = await page.evaluate(() => {
    const v = document.querySelector('#lgVideo');
    const r = document.querySelector('#lgPlate').getBoundingClientRect();
    const srcs = [...v.querySelectorAll('source')].map((s) => s.getAttribute('src'));
    return {
      fit: getComputedStyle(v).objectFit,
      poster: v.poster, srcs, current: window.__login.source(),
      autoplay: v.autoplay, muted: v.muted, loop: v.loop, playsinline: v.hasAttribute('playsinline'),
      x: Math.round(r.x), right: Math.round(r.right), top: Math.round(r.top), h: Math.round(r.height), w: Math.round(r.width),
      vw: innerWidth, vh: innerHeight,
      border: getComputedStyle(document.querySelector('#lgPlate')).borderTopWidth,
      formRight: Math.round(document.querySelector('.lg-form').getBoundingClientRect().right),
    };
  });
  expect(p.fit).toBe('cover');
  expect(p.poster).toMatch(/\/assets\/proto\/film\/legs\/w01\.webp$/);
  expect(p.srcs.some((s) => s.endsWith('/w01.mp4'))).toBe(true);
  expect(p.srcs.some((s) => s.endsWith('/w01-m.mp4'))).toBe(true);
  expect(p.current === null || /w01\.mp4$/.test(p.current)).toBeTruthy();   // 1440 폭 = 데스크톱 소스
  expect(p.autoplay && p.muted && p.loop && p.playsinline).toBe(true);
  // SPLIT-5050 + 인셋 56 — 판이 x 776–1384 · y 56–844 = 608×788, 헤어라인 1.
  expect(p.x).toBe(Math.round(p.vw / 2) + 56);
  expect(p.right).toBe(p.vw - 56);
  expect(p.top).toBe(56);
  expect(p.h).toBe(p.vh - 112);
  expect(p.w).toBe(608);
  expect(p.border).toBe('1px');
  // 폼 오른끝 ↔ 판 왼끝 = 64.
  expect(p.x - p.formRight).toBe(64);
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
      headY: Math.round(document.querySelector('.lg-head__l').getBoundingClientRect().y),
      signupBottom: Math.round(document.querySelector('.lg-signup').getBoundingClientRect().bottom),
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
  expect(m.formX).toBe(220);              // 폼은 우·하 — 오른끝 712, 판(776)과 64
  expect(m.formW).toBe(492);
  expect(m.overX).toBe(false);
  expect(m.overY).toBe(false);
  expect(m.footBottom).toBeLessThanOrEqual(m.vh);
  // 세로 — SIGN IN 238(이전 178 + 60), 폼 블록이 푸터 헤어라인(744) 위에서 끝난다.
  expect(m.headY).toBe(238);
  expect(m.signupBottom).toBeLessThan(744);
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
  await expect(page.locator('#lgCiLandxi')).toBeVisible();
  await expect(page.locator('#lgCiLx')).toBeVisible();
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
  // 1024 — 폼이 줄어도(≈432) 판과의 간격 64 · 판 마진 56 은 유지.
  const g = await page.evaluate(() => {
    const f = document.querySelector('.lg-form').getBoundingClientRect();
    const p = document.querySelector('#lgPlate').getBoundingClientRect();
    return { gap: Math.round(p.x - f.right), fx: Math.round(f.x), fw: Math.round(f.width), px: Math.round(p.x), pr: Math.round(p.right) };
  });
  expect(g.gap).toBe(64);
  expect(g.fx).toBe(72);
  expect(g.fw).toBeGreaterThanOrEqual(400);
  expect(g.px).toBe(512 + 56);
  expect(g.pr).toBe(1024 - 56);
  await page.screenshot({ path: `${SHOTS}/default-1024.png`, fullPage: true });
  await ctx.close();
});
