import { test, expect } from '@playwright/test';
import fs from 'node:fs';

// 마스터 design-canvas/v2/B5-Login.dc.html (NOTES §14 · 4차 개정) — 구 랜드XI(login.do) 구도.
// 페이지 중앙의 작은 카드 하나(1200×440, 1440×900 에서 x 120–1320 · y 230–670): 좌 60% 필름 Leg 01 + 태그라인 · 우 40% 압축 폼.
// 카드 위 = 실제 Land-XI CI + 원본 소개 한 줄 · 카드 아래 = LX 락업 + 정책 링크 + Copyright.
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
  // 불필요한 글자 0 — 눈썹 SIGN IN · 부제 없음(발주 지시).
  await expect(page.locator('.lg-head__l, .lg-sub')).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText('SIGN IN');
  await expect(page.locator('body')).not.toContainText('계정 정보를 입력해 주세요.');
  await expect(page.locator('label[for=lgEmail]')).toHaveText('아이디 (이메일)');
  await expect(page.locator('label[for=lgPw]')).toHaveText('비밀번호');
  await expect(page.locator('#lgEmail')).toHaveAttribute('placeholder', 'example@lx.or.kr');
  await expect(page.locator('#lgPw')).toHaveAttribute('placeholder', '비밀번호');
  await expect(page.locator('.lx-check')).toContainText('로그인 상태 유지');
  await expect(page.locator('.lg-find__a')).toHaveText(['아이디 찾기', '비밀번호 찾기']);
  await expect(page.locator('.lg-submit__t')).toHaveText('로그인');
  // 버튼 2 나란히 — 로그인(잉크) · 계정 신청하기(헤어라인). '처음 이용하시나요?' 문구는 없다.
  await expect(page.locator('#lgSignup')).toHaveText('계정 신청하기');
  await expect(page.locator('body')).not.toContainText('처음 이용하시나요?');
  await expect(page.locator('.lg-contact')).toContainText('063-713-1218');
  await expect(page.locator('.lg-contact')).toContainText('평일 09:00~18:00');
  await expect(page.locator('[data-policy]')).toHaveText(['개인정보처리방침', '이용약관', '이메일무단수집거부']);
  // 카드 위 — 원본 소개 한 줄(원본 카피, 장식이 아니다) · 판 위 태그라인(원본 카피).
  await expect(page.locator('.lg-intro')).toHaveText('LAND-XI의 직관적인 인터페이스를 사용하여 NO-CODE 기반의 AI 학습모델을 구축하고 활용할 수 있습니다.');
  await expect(page.locator('.lg-tag__t')).toHaveText('Land-XI 플랫폼');
  await expect(page.locator('.lg-tag__s')).toHaveText('고해상도 드론·항공·위성영상과 AI기술을 활용하여 공공서비스 혁신을 지원합니다.');
  // 실제 CI 2 — 조판/트레이싱 폴백이 아니라 공식 파일. 로드돼서 자연 크기가 있어야 한다. CI 는 카드 위 좌, 락업은 카드 아래 좌(x = 카드 x 120).
  const ci = await page.evaluate(() => {
    const g = (id) => { const i = document.querySelector(id); const r = i.getBoundingClientRect();
      return { src: i.getAttribute('src'), ok: i.complete && i.naturalWidth > 0, x: Math.round(r.x), y: Math.round(r.y), h: Math.round(r.height), w: Math.round(r.width), bottom: Math.round(r.bottom) }; };
    const c = document.querySelector('#lgCard').getBoundingClientRect();
    return { lx: g('#lgCiLandxi'), lock: g('#lgCiLx'), cardTop: Math.round(c.top), cardBottom: Math.round(c.bottom), old: document.querySelectorAll('.lg-brand__wm, .lg-brand__org, .lg-foot__org').length };
  });
  expect(ci.lx.src).toBe('../assets/brand/landxi-wordmark.png');
  expect(ci.lx.ok).toBe(true);
  expect(ci.lx.x).toBe(120); expect(ci.lx.h).toBe(22);
  expect(ci.lx.bottom).toBeLessThan(ci.cardTop);
  expect(ci.lock.src).toBe('../assets/brand/vector/lx-lockup.svg');
  expect(ci.lock.ok).toBe(true);
  expect(ci.lock.x).toBe(120); expect(ci.lock.h).toBe(18);
  expect(ci.lock.y).toBeGreaterThan(ci.cardBottom);
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
    const t = getComputedStyle(document.querySelector('.lg-tag__t'));
    const i = getComputedStyle(document.querySelector('.lg-intro'));
    const s = getComputedStyle(document.querySelector('#lgSignup'));
    return { fam: h.fontFamily, w: h.fontWeight, size: h.fontSize, btn: b.fontFamily, lbl: l.fontFamily,
             tag: t.fontFamily, tagColor: t.color, intro: i.fontFamily, introSize: i.fontSize, introColor: i.color, signup: s.fontFamily,
             loaded: document.fonts.check('700 28px Paperlogy') };
  });
  expect(type.fam).toMatch(/^"?Paperlogy"?/);
  expect(type.w).toBe('700');
  expect(type.size).toBe('28px');
  expect(type.btn).toMatch(/^"?Pretendard"?/);
  expect(type.lbl).toMatch(/^"?Pretendard"?/);
  expect(type.signup).toMatch(/^"?Pretendard"?/);
  expect(type.tag).toMatch(/^"?Paperlogy"?/);
  expect(type.tagColor).toBe('rgb(255, 255, 255)');
  expect(type.intro).toMatch(/^"?Pretendard"?/);
  expect(type.introSize).toBe('15px');
  expect(type.introColor).toBe('rgb(104, 104, 104)');
  expect(type.loaded).toBe(true);

  expect(errs).toEqual([]);
  await page.screenshot({ path: `${SHOTS}/b5-login.png` });
});

test('카드 — 1200×440 이 화면 중앙, 좌 60% 필름(w01.mp4) + 우 40% 폼, 헤어라인 1, 캡션·브래킷 0', async ({ page }) => {
  await boot(page);

  await expect(page.locator('.lx-bracket')).toHaveCount(0);
  await expect(page.locator('#lgFilmNo, #lgCapMeta, .lg-film__cap, .lg-film__no')).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText('kling');
  await expect(page.locator('body')).not.toContainText('모형 지구본');
  await expect(page.locator('body')).not.toContainText('5.08 s');
  await expect(page.locator('#lgVideo track')).toHaveCount(0);

  const p = await page.evaluate(() => {
    const v = document.querySelector('#lgVideo');
    const c = document.querySelector('#lgCard').getBoundingClientRect();
    const f = document.querySelector('#lgPlate').getBoundingClientRect();
    const m = document.querySelector('.lg-panel').getBoundingClientRect();
    const srcs = [...v.querySelectorAll('source')].map((s) => s.getAttribute('src'));
    const cs = getComputedStyle(document.querySelector('#lgCard'));
    return {
      fit: getComputedStyle(v).objectFit,
      poster: v.poster, srcs, current: window.__login.source(),
      autoplay: v.autoplay, muted: v.muted, loop: v.loop, playsinline: v.hasAttribute('playsinline'),
      card: { x: Math.round(c.x), y: Math.round(c.y), w: Math.round(c.width), h: Math.round(c.height), cx: Math.round(c.x + c.width / 2), cy: Math.round(c.y + c.height / 2) },
      film: { x: Math.round(f.x), w: Math.round(f.width), h: Math.round(f.height) },
      panel: { x: Math.round(m.x), w: Math.round(m.width), right: Math.round(m.right) },
      vw: innerWidth, vh: innerHeight,
      border: cs.borderTopWidth, borderColor: cs.borderTopColor, radius: cs.borderRadius, shadow: cs.boxShadow,
    };
  });
  expect(p.fit).toBe('cover');
  expect(p.poster).toMatch(/\/assets\/proto\/film\/legs\/w01\.webp$/);
  expect(p.srcs.some((s) => s.endsWith('/w01.mp4'))).toBe(true);
  expect(p.srcs.some((s) => s.endsWith('/w01-m.mp4'))).toBe(true);
  expect(p.current === null || /w01\.mp4$/.test(p.current)).toBeTruthy();   // 1440 폭 = 데스크톱 소스
  expect(p.autoplay && p.muted && p.loop && p.playsinline).toBe(true);
  // 카드 1200×440, 화면 정중앙(x 120–1320 · y 230–670).
  expect(p.card.w).toBe(1200);
  expect(p.card.h).toBe(440);
  expect(p.card.x).toBe(120);
  expect(p.card.y).toBe(230);
  expect(p.card.cx).toBe(p.vw / 2);
  expect(p.card.cy).toBe(p.vh / 2);
  expect(p.border).toBe('1px');
  expect(p.borderColor).toBe('rgb(221, 221, 221)');
  expect(p.radius).toBe('0px');
  expect(p.shadow).toBe('none');
  // 좌 60 / 우 40 (내폭 1198).
  const inner = p.card.w - 2;
  expect(Math.abs(p.film.w - inner * 0.6)).toBeLessThanOrEqual(1);
  expect(Math.abs(p.panel.w - inner * 0.4)).toBeLessThanOrEqual(1);
  expect(p.film.x).toBe(p.card.x + 1);
  expect(p.film.h).toBe(p.card.h - 2);
  expect(p.panel.right).toBe(p.card.x + p.card.w - 1);
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

test('시스템 법 — 헤어라인 · radius 0 · shadow 0 · 12px 바닥 · 액센트는 포커스 밑줄 한 곳 · 스크롤 0', async ({ page }) => {
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
    const q = (s) => document.querySelector(s).getBoundingClientRect();
    const card = q('#lgCard'), head = q('.lg-head'), foot = q('.lg-foot'), sub = q('#lgSubmit'), sign = q('#lgSignup'), contact = q('.lg-contact');
    return {
      small, radius, shadow, accent,
      overX: document.documentElement.scrollWidth > innerWidth + 1,
      overY: document.documentElement.scrollHeight > innerHeight + 1,
      headGap: Math.round(card.top - head.bottom), footGap: Math.round(foot.top - card.bottom),
      headX: Math.round(head.x), footRight: Math.round(foot.right), cardRight: Math.round(card.right),
      // 버튼 2 나란히, 같은 높이 44, 폼 내용이 카드 안에서 끝난다.
      btnRow: Math.round(sub.top) === Math.round(sign.top), btnH: [Math.round(sub.height), Math.round(sign.height)],
      btnW: Math.abs(sub.width - sign.width) <= 1, btnGap: Math.round(sign.x - sub.right),
      contactBottom: Math.round(contact.bottom), cardBottom: Math.round(card.bottom),
      submitBg: getComputedStyle(document.querySelector('#lgSubmit')).backgroundColor,
      signBorder: getComputedStyle(document.querySelector('#lgSignup')).borderTopWidth,
      signBg: getComputedStyle(document.querySelector('#lgSignup')).backgroundColor,
    };
  });
  expect(m.small).toEqual([]);
  expect(m.radius).toBe(0);
  expect(m.shadow).toBe(0);
  expect(m.accent).toBe(0);              // 정지 상태에서 액센트 0 — 포커스 때 밑줄 1
  expect(m.overX).toBe(false);
  expect(m.overY).toBe(false);
  expect(m.headGap).toBe(24);
  expect(m.footGap).toBe(24);
  expect(m.headX).toBe(120);
  expect(m.footRight).toBe(m.cardRight);
  expect(m.btnRow).toBe(true);
  expect(m.btnH).toEqual([44, 44]);
  expect(m.btnW).toBe(true);
  expect(m.btnGap).toBe(10);
  expect(m.contactBottom).toBeLessThan(m.cardBottom - 24);
  expect(m.submitBg).toBe('rgb(1, 1, 2)');
  expect(m.signBorder).toBe('1px');
  expect(m.signBg).toBe('rgba(0, 0, 0, 0)');
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

test('1024 — 카드가 100%−64(960) 로 줄고 60/40 · 중앙 유지', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 900 } });
  const page = await ctx.newPage();
  await boot(page);
  const over = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  expect(over).toBe(false);
  await expect(page.locator('.lg-h1')).toBeVisible();
  await expect(page.locator('#lgPlate')).toBeVisible();
  await expect(page.locator('.lg-foot')).toBeVisible();
  const g = await page.evaluate(() => {
    const c = document.querySelector('#lgCard').getBoundingClientRect();
    const f = document.querySelector('#lgPlate').getBoundingClientRect();
    const m = document.querySelector('.lg-panel').getBoundingClientRect();
    return { x: Math.round(c.x), w: Math.round(c.width), h: Math.round(c.height), cy: Math.round(c.y + c.height / 2), fw: Math.round(f.width), mw: Math.round(m.width) };
  });
  expect(g.x).toBe(32);
  expect(g.w).toBe(1024 - 64);
  expect(g.h).toBe(440);
  expect(g.cy).toBe(450);
  expect(Math.abs(g.fw - (g.w - 2) * 0.6)).toBeLessThanOrEqual(1);
  expect(Math.abs(g.mw - (g.w - 2) * 0.4)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: `${SHOTS}/default-1024.png`, fullPage: true });
  await ctx.close();
});

test('800 — 세로 스택: 소개 → 필름 → 폼 → 푸터, 가로 스크롤 0', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 800, height: 900 } });
  const page = await ctx.newPage();
  await boot(page);
  const g = await page.evaluate(() => {
    const q = (s) => document.querySelector(s).getBoundingClientRect();
    const head = q('.lg-head'), film = q('#lgPlate'), panel = q('.lg-panel'), foot = q('.lg-foot'), card = q('#lgCard');
    return {
      overX: document.documentElement.scrollWidth > innerWidth + 1,
      order: head.bottom <= film.top && film.bottom <= panel.top && panel.bottom <= foot.top,
      filmFull: Math.round(film.width) === Math.round(card.width) - 2,
      cardW: Math.round(card.width), src: window.__login.source(),
    };
  });
  expect(g.overX).toBe(false);
  expect(g.order).toBe(true);
  expect(g.filmFull).toBe(true);
  expect(g.cardW).toBe(800 - 48);
  expect(g.src === null || /w01-m\.mp4$/.test(g.src)).toBeTruthy();   // 좁은 폭 = 모바일 소스
  await expect(page.locator('#lgSubmit')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/default-800.png`, fullPage: true });
  await ctx.close();
});
