import { test, expect } from '@playwright/test';
import fs from 'node:fs';

// 마스터 design-canvas/v2/B5-Login.dc.html (NOTES §14 · 7차 개정) — 구 랜드XI(login.do) 구도.
// 페이지 중앙의 작은 카드 하나(1200×520, 1440×900 에서 x 120–1320 · y 190–710): 좌 60% 필름 Leg 01(글자 0) · 우 40% 로그인 → 소개 한 문장 → 폼.
// 7차: 라벨·입력·옵션·링크 = 로그인과 같은 Paperlogy 700, 포인트 줄임 — 라벨 20 / 입력 22 / 옵션·링크 18 / 버튼 20·56(Pretendard). 카드 560 → 520.
// 흑+청: 액센트 #006DF7 = 워드마크 Land-XI · 로그인 CTA 채움 · 포커스 밑줄 · 찾기 링크 · 체크.
const ACCENT = 'rgb(0, 109, 247)';
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
  // 카드 위 — 원본 소개 한 줄(원본 카피, 장식이 아니다).
  await expect(page.locator('.lg-intro')).toHaveText('LAND-XI의 직관적인 인터페이스를 사용하여 NO-CODE 기반의 AI 학습모델을 구축하고 활용할 수 있습니다.');
  // 6차 — 우 패널 맨 위의 `Land-XI 플랫폼` 제목·한 줄은 삭제. 제목 로그인이 패널의 첫 글자.
  await expect(page.locator('.lg-tag, .lg-tag__t, .lg-tag__s, .lg-panel strong')).toHaveCount(0);
  await expect(page.locator('.lg-panel h1, .lg-panel h2')).toHaveCount(1);
  // 로그인 바로 아래 — 소개 한 문장이 상시(구 ?logout 배너 자리). 배너 문구는 없다.
  await expect(page.locator('#lgLead')).toHaveText('Land-XI 플랫폼은 고해상도 드론·항공·위성영상과 AI기술을 활용하여 공공서비스 혁신을 지원합니다.');
  await expect(page.locator('#lgBanner, .lg-banner')).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText('안전하게 로그아웃되었습니다.');
  await expect(page.locator('#lgPlate')).toHaveText('');                 // 필름 안 글자 0
  await expect(page.locator('#lgPlate figcaption, #lgPlate .lg-tag')).toHaveCount(0);
  const order = await page.evaluate(() => {
    const q = (s) => document.querySelector(s).getBoundingClientRect();
    const h = q('.lg-h1'), l = q('#lgLead'), f = q('#loginForm'), p = q('.lg-panel');
    const first = document.querySelector('.lg-panel').firstElementChild;
    return { titleFirst: first.classList.contains('lg-h1'), leadUnderTitle: l.top >= h.bottom && l.top - h.bottom <= 12, leadAboveForm: l.bottom <= f.top,
             inPanel: l.left >= p.left && l.right <= p.right, leadLines: Math.round(l.height / 24) };
  });
  expect(order).toEqual({ titleFirst: true, leadUnderTitle: true, leadAboveForm: true, inPanel: true, leadLines: 2 });
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

  // 서체(발주 결정) — 제목 Paperlogy 700 34 · 버튼 Pretendard. 7차: 라벨 20 · 입력/플레이스홀더 22 · 상태 유지 18 · 찾기 18 — 전부 Paperlogy 700(로그인과 같은 서체) · 버튼 20. 폰트는 실제 로드돼야 한다.
  const type = await page.evaluate(async () => {
    await document.fonts.ready;
    const g = (sel) => getComputedStyle(document.querySelector(sel));
    const h = g('.lg-h1'), b = g('.lg-submit'), l = g('.lx-field__label'), i = g('.lg-intro'), s = g('#lgSignup'), ld = g('#lgLead');
    const inp = g('#lgEmail'), ph = getComputedStyle(document.querySelector('#lgEmail'), '::placeholder'), pw = g('#lgPw');
    const chk = g('.lx-check'), find = g('.lg-find__a'), lbl2 = g('label[for=lgPw]');
    return { fam: h.fontFamily, w: h.fontWeight, size: h.fontSize, btn: b.fontFamily, btnSize: b.fontSize, signupSize: s.fontSize, lbl: l.fontFamily, lblW: l.fontWeight, lblSize: l.fontSize, lbl2Size: lbl2.fontSize,
             inputSize: inp.fontSize, phSize: ph.fontSize, pwSize: pw.fontSize, inputFam: inp.fontFamily, inputW: inp.fontWeight, chkSize: chk.fontSize, chkFam: chk.fontFamily, chkW: chk.fontWeight, findSize: find.fontSize, findFam: find.fontFamily, findW: find.fontWeight,
             lead: ld.fontFamily, leadSize: ld.fontSize, leadColor: ld.color, leadBreak: ld.wordBreak,
             intro: i.fontFamily, introSize: i.fontSize, introColor: i.color, signup: s.fontFamily,
             loaded: document.fonts.check('700 34px Paperlogy') };
  });
  expect(type.fam).toMatch(/^"?Paperlogy"?/);
  expect(type.w).toBe('700');
  expect(type.size).toBe('34px');   // 6차: 로그인 Paperlogy 34
  expect(type.btn).toMatch(/^"?Paperlogy"?/);
  expect(type.btnSize).toBe('20px');
  expect(type.signupSize).toBe('20px');
  expect(type.lbl).toMatch(/^"?Paperlogy"?/);      // 7차: 로그인과 같은 서체
  expect(type.lblW).toBe('700');
  expect(type.lblSize).toBe('16px');                // 라벨 26 → 20
  expect(type.lbl2Size).toBe('16px');
  expect(type.inputFam).toMatch(/^"?Pretendard"?/); expect(type.inputW).toBe("400");
  expect(type.inputW).toBe('700');
  expect(type.inputSize).toBe('16px');              // 입력·플레이스홀더 28 → 22
  expect(type.phSize).toBe('16px');
  expect(type.pwSize).toBe('16px');
  expect(type.chkFam).toMatch(/^"?Paperlogy"?/);
  expect(type.chkW).toBe('700');
  expect(type.chkSize).toBe('16px');                // 로그인 상태 유지 26 → 18
  expect(type.findFam).toMatch(/^"?Paperlogy"?/);
  expect(type.findW).toBe('700');
  expect(type.findSize).toBe('16px');               // 아이디 찾기 | 비밀번호 찾기 26 → 18
  expect(type.signup).toMatch(/^"?Paperlogy"?/);
  expect(type.lead).toMatch(/^"?Pretendard"?/);
  expect(parseFloat(type.leadSize)).toBeGreaterThanOrEqual(16);
  expect(type.leadColor).toBe('rgb(104, 104, 104)');
  expect(type.leadBreak).toBe('keep-all');
  expect(type.intro).toMatch(/^"?Pretendard"?/);
  expect(type.introSize).toBe('17px');
  expect(type.introColor).toBe('rgb(104, 104, 104)');
  expect(type.loaded).toBe(true);

  expect(errs).toEqual([]);
  await page.screenshot({ path: `${SHOTS}/b5-login.png` });
});

test('카드 — 1200×520 이 화면 중앙, 좌 60% 필름(w01.mp4) + 우 40% 폼, 헤어라인 1, 캡션·브래킷 0', async ({ page }) => {
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
  // 카드 1200×520, 화면 정중앙(x 120–1320 · y 190–710).
  expect(p.card.w).toBe(1200);
  expect(p.card.h).toBe(520);
  expect(p.card.x).toBe(120);
  expect(p.card.y).toBe(190);
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

test('시스템 법 — 헤어라인 · radius 0 · shadow 0 · 14px 바닥 · 액센트 = 워드마크·CTA·찾기 링크만 · 스크롤 0', async ({ page }) => {
  await boot(page);
  const m = await page.evaluate(() => {
    const all = [...document.querySelectorAll('.lg *')];
    const vis = all.filter((n) => n.getClientRects().length && getComputedStyle(n).visibility !== 'hidden');
    const cs = (n) => getComputedStyle(n);
    const small = vis.filter((n) => n.childNodes.length && [...n.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim()))
      .map((n) => parseFloat(cs(n).fontSize)).filter((s) => s < 14);   // 클라이언트 2026-08-27: 글자 +2, 바닥 14
    const radius = vis.filter((n) => cs(n).borderRadius !== '0px').length;
    const shadow = vis.filter((n) => cs(n).boxShadow !== 'none').length;
    // 정지 상태의 액센트 = 로그인 CTA(1) · 찾기 링크(2) — 그 밖에는 없다(밑줄 룰은 포커스 때만).
    const accent = vis.filter((n) => {
      const c = cs(n);
      return [c.color, c.backgroundColor, c.borderBottomColor].includes('rgb(0, 109, 247)') && !n.classList.contains('lx-field__rule');
    }).map((n) => n.className.split(' ')[0]).sort();
    const gradient = vis.filter((n) => cs(n).backgroundImage !== 'none' && n.tagName !== 'IMG' && n.tagName !== 'VIDEO').length;
    const q = (s) => document.querySelector(s).getBoundingClientRect();
    const card = q('#lgCard'), head = q('.lg-head'), foot = q('.lg-foot'), sub = q('#lgSubmit'), sign = q('#lgSignup'), contact = q('.lg-contact');
    return {
      small, radius, shadow, accent, gradient,
      overX: document.documentElement.scrollWidth > innerWidth + 1,
      overY: document.documentElement.scrollHeight > innerHeight + 1,
      headGap: Math.round(card.top - head.bottom), footGap: Math.round(foot.top - card.bottom),
      headX: Math.round(head.x), footRight: Math.round(foot.right), cardRight: Math.round(card.right),
      // 버튼 2 나란히, 같은 높이 56, 폼 내용이 카드 안에서 끝난다.
      btnRow: Math.round(sub.top) === Math.round(sign.top), btnH: [Math.round(sub.height), Math.round(sign.height)],
      btnW: Math.abs(sub.width - sign.width) <= 1, btnGap: Math.round(sign.x - sub.right),
      contactBottom: Math.round(contact.bottom), cardBottom: Math.round(card.bottom),
      submitBg: getComputedStyle(document.querySelector('#lgSubmit')).backgroundColor,
      signBorder: getComputedStyle(document.querySelector('#lgSignup')).borderTopWidth,
      signBg: getComputedStyle(document.querySelector('#lgSignup')).backgroundColor,
      signBorderColor: getComputedStyle(document.querySelector('#lgSignup')).borderTopColor,
      findColor: getComputedStyle(document.querySelector('.lg-find__a')).color,
      submitColor: getComputedStyle(document.querySelector('#lgSubmit')).color,
      cardH: Math.round(card.height),
    };
  });
  expect(m.small).toEqual([]);
  expect(m.radius).toBe(0);
  expect(m.shadow).toBe(0);
  expect(m.accent).toEqual(['lg-find__a', 'lg-find__a', 'lg-submit']);   // 6차: 워드마크 Land-XI 삭제 → 정지 액센트 3 곳
  expect(m.gradient).toBe(0);
  expect(m.cardH).toBe(520);
  expect(m.overX).toBe(false);
  expect(m.overY).toBe(false);
  expect(m.headGap).toBe(24);
  expect(m.footGap).toBe(24);
  expect(m.headX).toBe(120);
  expect(m.footRight).toBe(m.cardRight);
  expect(m.btnRow).toBe(true);
  expect(m.btnH).toEqual([56, 56]);   // 6차: 버튼 56
  expect(m.btnW).toBe(true);
  expect(m.btnGap).toBe(10);
  expect(m.contactBottom).toBeLessThan(m.cardBottom - 24);
  expect(m.submitBg).toBe(ACCENT);                 // 로그인 CTA = 액센트 채움(로그인 예외)
  expect(m.submitColor).toBe('rgb(255, 255, 255)');
  expect(m.signBorder).toBe('1px');
  expect(m.signBorderColor).toBe('rgb(1, 1, 2)');  // 계정 신청하기 = 헤어라인 잉크
  expect(m.signBg).toBe('rgba(0, 0, 0, 0)');
  expect(m.findColor).toBe(ACCENT);
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
  // 에러 2줄이 들어와도 문의 줄이 카드 안에서 끝난다.
  const fit = await page.evaluate(() => {
    const c = document.querySelector('#lgCard').getBoundingClientRect(), k = document.querySelector('.lg-contact').getBoundingClientRect();
    return Math.round(c.bottom - k.bottom);
  });
  expect(fit).toBeGreaterThanOrEqual(16);
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

test('?logout — 세션을 지운다. 배너 문구는 없고(6차) 제목 아래 소개 문장이 그대로', async ({ page }) => {
  await clearOnce(page, { lx_logged_in: '1' });
  await page.goto(URL + '?logout');
  await page.waitForFunction(() => window.__login && window.__login.ready, null, { timeout: 30000 });
  await expect(page.locator('#lgBanner, .lg-banner')).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText('안전하게 로그아웃되었습니다.');
  await expect(page.locator('#lgLead')).toBeVisible();
  await expect(page.locator('#lgLead')).toHaveText('Land-XI 플랫폼은 고해상도 드론·항공·위성영상과 AI기술을 활용하여 공공서비스 혁신을 지원합니다.');
  expect(await page.evaluate(() => localStorage.getItem('lx_logged_in'))).toBeNull();
  expect(page.url()).toContain('login.html');
});

test('1920×1200 — 카드 1200×520 중앙(x 360 · y 340), 폼이 카드 안에서 끝난다, 옵션 한 줄, 스크롤 0', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1200 } });
  const page = await ctx.newPage();
  await boot(page);
  const g = await page.evaluate(() => {
    const q = (s) => document.querySelector(s).getBoundingClientRect();
    const c = q('#lgCard'), p = q('.lg-panel'), contact = q('.lg-contact'), find = q('.lg-find'), chk = q('.lx-check');
    const inner = [...document.querySelectorAll('.lg-panel *')].map((n) => n.getBoundingClientRect()).filter((r) => r.width);
    return {
      x: Math.round(c.x), y: Math.round(c.y), w: Math.round(c.width), h: Math.round(c.height),
      overX: document.documentElement.scrollWidth > innerWidth + 1, overY: document.documentElement.scrollHeight > innerHeight + 1,
      inside: inner.every((r) => r.left >= p.left - 1 && r.right <= p.right + 1 && r.bottom <= c.bottom + 1),
      contactBottom: Math.round(contact.bottom), cardBottom: Math.round(c.bottom),
      findInside: find.right <= p.right - 39 && find.left >= chk.right, findSameRow: Math.abs(find.top - chk.top) <= 2,
    };
  });
  expect([g.x, g.y, g.w, g.h]).toEqual([360, 340, 1200, 520]);
  expect(g.overX).toBe(false); expect(g.overY).toBe(false);
  expect(g.inside).toBe(true);
  expect(g.contactBottom).toBeLessThan(g.cardBottom - 24);
  expect(g.findInside).toBe(true);
  expect(g.findSameRow).toBe(true);   // 7차: 18px 옵션 줄은 한 줄 — 상태 유지(좌) · 찾기 링크(우)
  await page.screenshot({ path: `${SHOTS}/b5-login-1920.png` });
  await ctx.close();
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
  expect(await page.evaluate(() => getComputedStyle(document.querySelector('.lx-check__box')).backgroundColor)).toBe(ACCENT);   // 체크 = 액센트
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

test('1024 — 카드가 100%−64(960×520) 로 줄고 60/40 · 중앙 유지', async ({ browser }) => {
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
  expect(g.h).toBe(520);
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
