import { test, expect } from '@playwright/test';
import fs from 'node:fs';

// 마스터 design-canvas/v2/B5-Login.dc.html (NOTES §14 · 7차 개정) — 구 랜드XI(login.do) 구도.
// 페이지 중앙의 작은 카드 하나(폭 1200): 좌 60% 필름 Leg 01(글자 0) + 계정 캡션 띠 · 우 40% 로그인 → 소개 한 문장 → 계정 종류 세그먼트 → 폼.
// E0-2(2026-09-24): 카드 높이 고정(520)을 풀었다(G-01 — 폼이 카드를 뚫고 1280×720 에서 버튼이 창 밖 730).
//   머리 · 카드 · 발이 한 덩이로 세로 중앙, 카드 높이 = 콘텐츠(바닥 526). 로그인 버튼 = 잉크 채움(O7).
//   정지 상태 액센트 = 워드마크 밑줄 · 찾기 링크 2 — 셋뿐. 세션 계약 = MASTER-PLAN §7.1.
const ACCENT = 'rgb(0, 109, 247)';
const INK = 'rgb(1, 1, 2)';
const CARD_MIN = 526;
// §7.3 역할 픽스처 — Wave 0 동안 자기 spec 안에 복사(_roles.mjs import 금지).
/* F2-R(2026-09-27): 영업 첫 화면 = 새 XI맵 — proto 밖(landxi/xi). 도착 판정은 경로 끝(HOME_PATH)으로 한다. */
const HOME = { admin: 'admin-home.html', staff: 'ai-project.html', sales: '../xi/index.html' };
const HOME_PATH = { admin: '/landxi/proto/admin-home.html', staff: '/landxi/proto/ai-project.html', sales: '/landxi/xi/index.html' };
const SHOTS_W0 = 'shots/w0/E0-2';
fs.mkdirSync(SHOTS_W0, { recursive: true });
const KEYS = () => ({ in: localStorage.getItem('lx_logged_in'), role: localStorage.getItem('lx_role'), tenant: localStorage.getItem('lx_tenant_session') });
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

test('카드 — 폭 1200 · 높이 = 콘텐츠(≥526) · 머리+카드+발 한 덩이가 화면 중앙, 좌 60%(필름 + 캡션 띠) + 우 40% 폼, 헤어라인 1, 브래킷 클래스 0', async ({ page }) => {
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
    const l = document.querySelector('.lg-left').getBoundingClientRect();
    const k = document.querySelector('#lgCap').getBoundingClientRect();
    const m = document.querySelector('.lg-panel').getBoundingClientRect();
    const h = document.querySelector('.lg-head').getBoundingClientRect();
    const t = document.querySelector('.lg-foot').getBoundingClientRect();
    const srcs = [...v.querySelectorAll('source')].map((s) => s.getAttribute('src'));
    const cs = getComputedStyle(document.querySelector('#lgCard'));
    return {
      fit: getComputedStyle(v).objectFit,
      poster: v.poster, srcs, current: window.__login.source(),
      autoplay: v.autoplay, muted: v.muted, loop: v.loop, playsinline: v.hasAttribute('playsinline'),
      card: { x: Math.round(c.x), y: Math.round(c.y), w: Math.round(c.width), h: Math.round(c.height), bottom: Math.round(c.bottom) },
      left: { x: Math.round(l.x), w: Math.round(l.width), h: Math.round(l.height) },
      film: { w: Math.round(f.width), h: Math.round(f.height), bottom: Math.round(f.bottom) },
      cap: { top: Math.round(k.top), bottom: Math.round(k.bottom), w: Math.round(k.width) },
      panel: { x: Math.round(m.x), w: Math.round(m.width), right: Math.round(m.right) },
      topGap: Math.round(h.top), bottomGap: Math.round(innerHeight - t.bottom),
      vw: innerWidth, vh: innerHeight,
      border: cs.borderTopWidth, borderColor: cs.borderTopColor, radius: cs.borderRadius, shadow: cs.boxShadow,
    };
  });
  expect(p.fit).toBe('cover');
  expect(p.poster).toMatch(/\/assets\/proto\/film\/legs\/wfull\.webp$/);
  expect(p.srcs.some((s) => s.endsWith('/wfull.mp4'))).toBe(true);
  expect(p.srcs.some((s) => s.endsWith('/wfull-m.mp4'))).toBe(true);
  expect(p.current === null || /wfull\.mp4$/.test(p.current)).toBeTruthy();   // 1440 폭 = 데스크톱 소스
  expect(p.autoplay && p.muted && p.loop && p.playsinline).toBe(true);
  // 카드 폭 1200 · 가로 중앙(x 120) · 높이 = 콘텐츠(바닥 526). 머리+카드+발 덩이가 세로 중앙(위아래 여백 차 ≤ 1).
  expect(p.card.w).toBe(1200);
  expect(p.card.x).toBe(120);
  expect(p.card.h).toBeGreaterThanOrEqual(CARD_MIN);
  expect(Math.abs(p.topGap - p.bottomGap)).toBeLessThanOrEqual(1);
  expect(p.border).toBe('1px');
  expect(p.borderColor).toBe('rgb(221, 221, 221)');
  expect(p.radius).toBe('0px');
  expect(p.shadow).toBe('none');
  // 좌 60 / 우 40 (내폭 1198). 좌 = 필름(위) + 캡션 띠(아래) — 필름 바로 아래에 캡션, 둘이 좌 칸을 채운다.
  const inner = p.card.w - 2;
  expect(Math.abs(p.left.w - inner * 0.6)).toBeLessThanOrEqual(1);
  expect(Math.abs(p.panel.w - inner * 0.4)).toBeLessThanOrEqual(1);
  expect(p.left.x).toBe(p.card.x + 1);
  expect(p.left.h).toBe(p.card.h - 2);
  expect(p.film.w).toBe(p.left.w);
  expect(p.cap.top).toBe(p.film.bottom);
  expect(p.cap.bottom).toBe(p.card.bottom - 1);
  expect(p.film.h).toBeGreaterThan(400);
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

test('시스템 법 — 헤어라인 · radius 0 · shadow 0 · 14px 바닥 · 정지 액센트 ≤ 3(워드마크 밑줄 · 찾기 링크 2) · 로그인 = 잉크 채움 · 스크롤 0', async ({ page }) => {
  await boot(page);
  const m = await page.evaluate(() => {
    const all = [...document.querySelectorAll('.lg *')];
    const vis = all.filter((n) => n.getClientRects().length && getComputedStyle(n).visibility !== 'hidden');
    const cs = (n) => getComputedStyle(n);
    const small = vis.filter((n) => n.childNodes.length && [...n.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim()))
      .map((n) => parseFloat(cs(n).fontSize)).filter((s) => s < 14);   // 클라이언트 2026-08-27: 글자 +2, 바닥 14
    const radius = vis.filter((n) => cs(n).borderRadius !== '0px').length;
    const shadow = vis.filter((n) => cs(n).boxShadow !== 'none').length;
    // 정지 상태의 액센트 — 요소 + ::before/::after(보이는 것만: content 있음 · 폭 > 0 · scaleX(0) 아님). 밑줄 룰은 포커스 때만.
    const A = 'rgb(0, 109, 247)';
    const hit = (c) => [c.color, c.backgroundColor, c.borderBottomColor, c.borderTopColor].includes(A);
    const accent = [];
    for (const n of vis) {
      const name = typeof n.className === 'string' && n.className ? n.className.split(' ')[0] : n.tagName.toLowerCase();
      const c0 = cs(n);
      const inked = c0.backgroundColor === A || (c0.color === A && n.textContent.trim()) ||
        (parseFloat(c0.borderBottomWidth) > 0 && c0.borderBottomColor === A) || (parseFloat(c0.borderTopWidth) > 0 && c0.borderTopColor === A);
      if (!n.classList.contains('lx-field__rule') && inked) accent.push(name);
      for (const pe of ['::before', '::after']) {
        const c = getComputedStyle(n, pe);
        if (c.content === 'none' || c.content === 'normal' || c.display === 'none') continue;
        if (parseFloat(c.width) === 0 || /^matrix\(0,/.test(c.transform)) continue;
        if (c.backgroundColor === A || (parseFloat(c.borderTopWidth) > 0 && c.borderTopColor === A)) accent.push(name + pe);
      }
    }
    accent.sort();
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
      brandBar: getComputedStyle(document.querySelector('.lg-brand'), '::after').backgroundColor,
      cardH: Math.round(card.height),
    };
  });
  expect(m.small).toEqual([]);
  expect(m.radius).toBe(0);
  expect(m.shadow).toBe(0);
  expect(m.accent.length).toBeLessThanOrEqual(3);
  expect(m.accent).toEqual(['lg-brand::after', 'lg-find__a', 'lg-find__a']);   // E0-2: 워드마크 밑줄 · 찾기 링크 2 — 채운 파랑 버튼 0
  expect(m.brandBar).toBe(ACCENT);
  expect(m.gradient).toBe(0);
  expect(m.cardH).toBeGreaterThanOrEqual(CARD_MIN);
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
  expect(m.contactBottom).toBeLessThanOrEqual(m.cardBottom - 24);
  expect(m.submitBg).toBe(INK);                    // 로그인 = 잉크 채움(O7 — 법전 복귀, 채운 파랑 0)
  expect(m.submitColor).toBe('rgb(255, 255, 255)');
  expect(m.signBorder).toBe('1px');
  expect(m.signBorderColor).toBe(INK);             // 계정 신청하기 = 헤어라인 잉크
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

for (const [role, label] of [['admin', 'LX 관리자'], ['staff', 'LX 직원'], ['sales', '영업용 계정']]) {
  test(`성공 — ${label}: §7.1 signIn(lx_logged_in · lx_role · 기관 세션 제거) → 그 역할의 첫 화면 ${HOME[role]}`, async ({ page }) => {
    await boot(page);
    await page.locator('.lg-seg__c', { hasText: label }).click();
    await expect(page.locator(`input[name=role][value=${role}]`)).toBeChecked();
    await page.locator('#lgEmail').fill('hong@lx.or.kr');
    await page.locator('#lgPw').fill('lx-2026');
    await page.locator('#lgSubmit').click();
    await expect(page.locator('#lgSubmit')).toBeDisabled();
    await page.waitForURL((u) => u.pathname.endsWith(HOME_PATH[role]), { timeout: 15000 });
    expect(await page.evaluate(KEYS)).toEqual({ in: '1', role, tenant: null });
  });
}

/* F2-R — ?next 화이트리스트: 새 XI맵(../xi/…) · Global(../global/…) 만 폴더 밖으로 허용(open redirect 0) */
test('리다이렉트 — ?next=../xi/index.html?mode=survey 는 허용 → 로그인 뒤 새 XI맵 · 세션 인계(data-lx=ready · 직원)', async ({ page }) => {
  await boot(page, '?next=' + encodeURIComponent('../xi/index.html?mode=survey&svc=dp-nw-farm-25'));
  await page.locator('.lg-seg__c', { hasText: 'LX 직원' }).click();
  expect(await page.evaluate(() => window.__login.destination('staff'))).toBe('../xi/index.html?mode=survey&svc=dp-nw-farm-25');
  await page.locator('#lgEmail').fill('hong@lx.or.kr');
  await page.locator('#lgPw').fill('lx-2026');
  await page.locator('#lgSubmit').click();
  await page.waitForURL((u) => u.pathname.endsWith('/landxi/xi/index.html'), { timeout: 15000 });
  await page.waitForFunction(() => document.documentElement.dataset.lx === 'ready', null, { timeout: 30000 });
  expect(await page.evaluate(() => window.__xi.state.session)).toMatchObject({ realm: 'lx', role: 'staff' });
});
test('영업 로그인 → 첫 화면 새 XI맵 · XI맵 관문 = 영업(시연)', async ({ page }) => {
  await boot(page);
  await page.locator('.lg-seg__c', { hasText: '영업용 계정' }).click();
  await page.locator('#lgEmail').fill('hong@lx.or.kr');
  await page.locator('#lgPw').fill('lx-2026');
  await page.locator('#lgSubmit').click();
  await page.waitForURL((u) => u.pathname.endsWith('/landxi/xi/index.html'), { timeout: 15000 });
  await page.waitForFunction(() => document.documentElement.dataset.lx === 'ready', null, { timeout: 30000 });
  expect(await page.evaluate(() => window.__xi.state.role)).toBe('sales');
});
test('문패 landxi/login.html — ?next 를 그대로 넘긴다(meta refresh 가 쿼리를 버리던 것 교정)', async ({ page }) => {
  await clearOnce(page);
  await page.goto('login.html?next=' + encodeURIComponent('../xi/index.html'));
  await page.waitForFunction(() => window.__login && window.__login.ready, null, { timeout: 30000 });
  expect(new globalThis.URL(page.url()).pathname).toBe('/landxi/proto/login.html');
  expect(await page.evaluate(() => window.__login.next())).toBe('../xi/index.html');
});

test('이미 로그인 — 다시 열면 next 로 바로 넘어간다', async ({ page }) => {
  await clearOnce(page, { lx_logged_in: '1' });
  await page.goto(URL + '?next=map.html');
  await page.waitForURL((u) => u.pathname.endsWith('/map.html'), { timeout: 15000 });   // 정규식은 login.html?next=map.html 에도 걸린다
});

test('?logout — 세 키(lx_logged_in · lx_role · lx_tenant_session) 전부 지운다. 배너 문구는 없고(6차) 제목 아래 소개 문장이 그대로', async ({ page }) => {
  await clearOnce(page, { lx_logged_in: '1', lx_role: 'sales', lx_tenant_session: JSON.stringify({ tenant: 'namwon', at: '2026-06-08T09:00:00+09:00' }), lx_saved_email: 'hong@lx.or.kr' });
  await page.goto(URL + '?logout');
  await page.waitForFunction(() => window.__login && window.__login.ready, null, { timeout: 30000 });
  await expect(page.locator('#lgBanner, .lg-banner')).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText('안전하게 로그아웃되었습니다.');
  await expect(page.locator('#lgLead')).toBeVisible();
  await expect(page.locator('#lgLead')).toHaveText('Land-XI 플랫폼은 고해상도 드론·항공·위성영상과 AI기술을 활용하여 공공서비스 혁신을 지원합니다.');
  expect(await page.evaluate(KEYS)).toEqual({ in: null, role: null, tenant: null });
  expect(await page.evaluate(() => localStorage.getItem('lx_saved_email'))).toBe('hong@lx.or.kr');   // 아이디 저장은 세션이 아니다
  await expect(page.locator('#lgRoleNow')).toHaveCount(0);
  expect(page.url()).toContain('login.html');
});

test('1920×1200 — 카드 폭 1200 중앙(x 360) · 높이 526, 폼이 카드 안에서 끝난다, 옵션 한 줄, 스크롤 0', async ({ browser }) => {
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
  expect([g.x, g.w, g.h]).toEqual([360, 1200, CARD_MIN]);
  expect(g.overX).toBe(false); expect(g.overY).toBe(false);
  expect(g.inside).toBe(true);
  expect(g.contactBottom).toBeLessThanOrEqual(g.cardBottom - 24);
  expect(g.findInside).toBe(true);
  expect(g.findSameRow).toBe(true);   // 7차: 18px 옵션 줄은 한 줄 — 상태 유지(좌) · 찾기 링크(우)
  await page.screenshot({ path: `${SHOTS}/b5-login-1920.png` });
  await ctx.close();
});

test('리다이렉트 — 허용 목록 밖 next 는 무시되고 역할의 첫 화면으로 간다', async ({ page }) => {
  await boot(page, '?next=' + encodeURIComponent('https://evil.example/steal'));
  await page.locator('#lgEmail').fill('hong@lx.or.kr');
  await page.locator('#lgPw').fill('lx-2026');
  await page.locator('#lgSubmit').click();
  await page.waitForURL(/admin-home\.html/, { timeout: 15000 });   // 기본 계정 종류 = LX 관리자 → homeOf('admin')
  expect(page.url()).not.toContain('evil');
});

test('리다이렉트 — 허용 목록 안 next 로만 간다', async ({ page }) => {
  await boot(page, '?next=map.html');
  await page.locator('#lgEmail').fill('hong@lx.or.kr');
  await page.locator('#lgPw').fill('lx-2026');
  await page.locator('#lgSubmit').click();
  await page.waitForURL((u) => u.pathname.endsWith('/map.html'), { timeout: 15000 });   // 정규식은 login.html?next=map.html 에도 걸린다
});

test('safeNext — 허용/차단 목록 단위 점검', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    const f = window.__login.safeNext;
    return {
      ok: [f('dashboard.html'), f('map.html?x=1'), f('my-page.html'),
           f('../xi/index.html'), f('../xi/'), f('../xi/index.html?mode=survey&svc=dp-nw-farm-25'), f('../global/index.html?locale=en')],
      no: [f('https://evil.example/a.html'), f('//evil.example/a.html'), f('../secret.html'),
           f('javascript:alert(1)'), f(''), f('dashboard.php'),
           f('../xi/../../evil.html'), f('../xi//evil.example'), f('../ops/index.html'), f('../xi/index.html#x'), f('../xi\\index.html'), f('../xi/other.html')],
    };
  });
  expect(r.ok).toEqual(['dashboard.html', 'map.html?x=1', 'my-page.html',
    '../xi/index.html', '../xi/', '../xi/index.html?mode=survey&svc=dp-nw-farm-25', '../global/index.html?locale=en']);
  expect(new Set(r.no)).toEqual(new Set([null]));   // 거른 것은 null → 목적지는 homeOf(role)
});

test('아이디 저장 — 체크하면 다음 방문에 이메일이 채워져 있다', async ({ page }) => {
  await boot(page);
  await page.locator('#lgEmail').fill('hong@lx.or.kr');
  await page.locator('#lgPw').fill('lx-2026');
  await page.locator('.lx-check').click();            // 실제 입력은 시각적으로 숨겨져 있다
  await expect(page.locator('.lx-check input')).toBeChecked();
  expect(await page.evaluate(() => getComputedStyle(document.querySelector('.lx-check__box')).backgroundColor)).toBe(INK);   // E0-2: 체크 = 잉크(정지 액센트 셋을 지킨다)
  await page.locator('#lgSubmit').click();
  // 제출 핸들러는 240ms 뒤에 localStorage 기록과 화면 이동을 잇달아 한다.
  // 떠나는 중인 페이지에서 localStorage 를 폴링하면 부하가 걸렸을 때 실행 컨텍스트가
  // 먼저 날아가 간헐적으로 깨진다 — 이동이 끝난 뒤 같은 출처에서 확인한다.
  await page.waitForURL((u) => !u.pathname.endsWith('login.html'), { timeout: 20000 });
  expect(await page.evaluate(() => localStorage.getItem('lx_saved_email'))).toBe('hong@lx.or.kr');

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
  expect(await page.evaluate(() => document.querySelector('#lgVideo').poster)).toMatch(/wfull\.webp$/);
  await expect(page.locator('.lg-h1')).toBeVisible();
  await expect(page.locator('#lgSubmit')).toBeVisible();
  await expect(page.locator('#lgCiLandxi')).toBeVisible();
  await expect(page.locator('#lgCiLx')).toBeVisible();
  expect(errs).toEqual([]);
  await ctx.close();
});

test('1024 — 카드가 100%−64(폭 960) 로 줄고 60/40 · 가로 중앙 · 스크롤 0', async ({ browser }) => {
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
    return { x: Math.round(c.x), w: Math.round(c.width), h: Math.round(c.height), fw: Math.round(f.width), mw: Math.round(m.width),
             overY: document.documentElement.scrollHeight > innerHeight + 1, sub: Math.round(document.querySelector('#lgSubmit').getBoundingClientRect().bottom) };
  });
  expect(g.x).toBe(32);
  expect(g.w).toBe(1024 - 64);
  expect(g.h).toBeGreaterThanOrEqual(CARD_MIN);
  expect(g.overY).toBe(false);
  expect(g.sub).toBeLessThan(900);
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
  expect(g.src === null || /wfull-m\.mp4$/.test(g.src)).toBeTruthy();   // 좁은 폭 = 모바일 소스
  await expect(page.locator('#lgSubmit')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/default-800.png`, fullPage: true });
  await ctx.close();
});

// ══ E0-2 (2026-09-24) — G-01 카드 붕괴 · 세그먼트 · 캡션 · 워드마크 · 세션 계약 ══════════════════════

const VIEWPORTS = [['01', 1280, 720], ['02', 1366, 768], ['03', 1440, 900], ['04', 1920, 1080]];
for (const [no, w, h] of VIEWPORTS) {
  test(`G-01 ${w}×${h} — 로그인 버튼이 창 안 · 카드와 발 겹침 0 · 스크롤 0`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    const errs = watch(page);
    await boot(page);
    const sub = await page.locator('#lgSubmit').boundingBox();
    const card = await page.locator('.lg-card').boundingBox();
    const foot = await page.locator('.lg-foot').boundingBox();
    const contact = await page.locator('.lg-contact').boundingBox();
    expect(sub.y + sub.height).toBeLessThan(h);                    // 버튼 하단 < 뷰포트
    const ix = Math.max(0, Math.min(card.x + card.width, foot.x + foot.width) - Math.max(card.x, foot.x));
    const iy = Math.max(0, Math.min(card.y + card.height, foot.y + foot.height) - Math.max(card.y, foot.y));
    expect(ix * iy).toBe(0);                                        // .lg-card ∩ .lg-foot = 0
    expect(foot.y).toBeGreaterThanOrEqual(card.y + card.height);
    expect(foot.y + foot.height).toBeLessThanOrEqual(h);            // 발까지 창 안
    expect(contact.y + contact.height).toBeLessThanOrEqual(card.y + card.height);   // 폼이 카드 안에서 끝난다
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1 && document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errs).toEqual([]);
    await page.screenshot({ path: `${SHOTS_W0}/${no}-login-${w}x${h}.png` });
    await ctx.close();
  });
}

test('G-01 1280×720 — 빈 제출로 오류 2줄이 들어와도 버튼 · 발이 창 안', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  await boot(page);
  await page.locator('#lgSubmit').click();
  await expect(page.locator('#lgPwMsg')).toBeVisible();
  const sub = await page.locator('#lgSubmit').boundingBox();
  const foot = await page.locator('.lg-foot').boundingBox();
  expect(sub.y + sub.height).toBeLessThan(720);
  expect(foot.y + foot.height).toBeLessThanOrEqual(720);
  await ctx.close();
});

test('계정 종류 — 3칸 한 줄 세그먼트 · 선택 = 코너 브래킷 12px(잉크) · 라운드 0 · 채움 없음', async ({ page }) => {
  await boot(page);
  await expect(page.locator('.lg-seg__c')).toHaveText(['LX 관리자', 'LX 직원', '영업용 계정']);   // Q7 답 전 — 관리자 칸 유지
  const g = await page.evaluate(() => {
    const cells = [...document.querySelectorAll('.lg-seg__c')];
    const r = cells.map((c) => c.getBoundingClientRect());
    const on = document.querySelector('.lg-seg__c:has(input:checked)');
    const off = cells.find((c) => c !== on);
    const pe = (el, p) => { const s = getComputedStyle(el, p); return { w: s.width, h: s.height, o: s.opacity }; };
    return {
      oneRow: r.every((b) => Math.abs(b.top - r[0].top) < 1), heights: r.map((b) => Math.round(b.height)),
      leftToRight: r[0].right <= r[1].left + 1 && r[1].right <= r[2].left + 1,
      bg: cells.map((c) => getComputedStyle(c).backgroundColor), radius: cells.map((c) => getComputedStyle(c).borderRadius),
      onBefore: pe(on, '::before'), onAfter: pe(on, '::after'), offBefore: pe(off, '::before'),
      onText: getComputedStyle(on.querySelector('span')).color, offText: getComputedStyle(off.querySelector('span')).color,
      segInPanel: (() => { const s = document.querySelector('.lg-seg').getBoundingClientRect(), p = document.querySelector('.lg-panel').getBoundingClientRect(); return s.right <= p.right - 39; })(),
    };
  });
  expect(g.oneRow).toBe(true);
  expect(g.heights).toEqual([40, 40, 40]);
  expect(g.leftToRight).toBe(true);
  expect(new Set(g.bg)).toEqual(new Set(['rgba(0, 0, 0, 0)']));   // 채움 없음
  expect(new Set(g.radius)).toEqual(new Set(['0px']));
  await page.waitForTimeout(250);
  const on = await page.evaluate(() => { const s = getComputedStyle(document.querySelector('.lg-seg__c:has(input:checked)'), '::before'); return [s.width, s.height, s.borderTopColor, s.borderTopWidth, s.opacity]; });
  expect(on).toEqual(['12px', '12px', INK, '2px', '1']);
  expect(g.offBefore.o).toBe('0');                                   // 고르지 않은 칸 = 브래킷 안 보임(호버면 6px 로 자란다)
  expect(g.onText).toBe(INK);
  expect(g.offText).toBe('rgb(104, 104, 104)');
  expect(g.segInPanel).toBe(true);
  // 호버 = 브래킷 성장(물리 반응) — 색만 바꾸지 않는다.
  await page.locator('.lg-seg__c', { hasText: 'LX 직원' }).hover();
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => { const s = getComputedStyle(document.querySelectorAll('.lg-seg__c')[1], '::before'); return [s.width, s.opacity]; })).toEqual(['6px', '1']);
  // 키보드 — 방향키로 고른다(라디오 그룹).
  await page.locator('input[name=role][value=admin]').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('input[name=role][value=staff]')).toBeChecked();
});

test('계정 캡션 — 라디오가 바뀌면 좌측 캡션이 ROLES[].what · CAPS 로 바뀌고 600ms · 60ms 스태거로 들어온다', async ({ page }) => {
  await boot(page);
  const WHAT = {
    admin: '플랫폼을 운영한다 — 발행 승인 · 사용자 · 공지 · 생산 공정',
    staff: 'AI 를 만든다 — 자료 · 프로젝트 · 학습 · 분석. 발행은 요청까지',
    sales: '보여 준다 — 할 수 있는 것 · 해낸 것 · 지금 보는 것',
  };
  const c0 = await page.evaluate(() => window.__login.caption());
  expect(c0).toEqual({ role: 'admin', name: 'LX 관리자', what: WHAT.admin, caps: ['카드 발행 승인 · 반려', '사용자 권한 · 가입 승인', '공지 · FAQ · 문의 답변'] });
  await expect(page.locator('#lgCapWhat')).toHaveText(WHAT.admin);
  // 필름 안 글자 0 — 캡션은 필름 판 바깥(아래 띠)에 선다.
  await expect(page.locator('#lgPlate')).toHaveText('');

  await page.locator('.lg-seg__c', { hasText: 'LX 직원' }).click();
  const anim = await page.evaluate(() => [document.querySelector('.lg-cap__who'), ...document.querySelectorAll('#lgCapCaps li')]
    .map((el) => el.getAnimations().map((a) => [a.effect.getTiming().duration, a.effect.getTiming().delay, a.effect.getTiming().easing])[0] || null));
  expect(anim).toEqual([0, 60, 120, 180].map((d) => [600, d, 'cubic-bezier(0.15, 1, 0.3, 1)']));
  await expect(page.locator('#lgCapWhat')).toHaveText(WHAT.staff);
  expect((await page.evaluate(() => window.__login.caption())).caps).toEqual(['자료 올리기', 'AI 프로젝트 · 라벨링 · 학습', '분석 실행']);

  await page.locator('.lg-seg__c', { hasText: '영업용 계정' }).click();
  await expect(page.locator('#lgCapWhat')).toHaveText(WHAT.sales);
  await expect(page.locator('#lgCapName')).toHaveText('영업용 계정');
  expect((await page.evaluate(() => window.__login.caption())).caps).toEqual(['결과 내려받기 · 보고서']);
  /* F2-R — 지도 서비스 = XI맵 실시간 분석 한 줄(roles.js ROLES[].mapLine) */
  await expect(page.locator('#lgCapMap')).toHaveText('지도 서비스 = XI맵 실시간 분석 — 시연 작업(demo)으로 판독을 보여 준다');
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${SHOTS_W0}/06-role-caption-sales.png` });
});

test('계정 캡션 — 축소 모션이면 애니메이션 없이 즉시 바뀐다', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await boot(page);
  await page.locator('.lg-seg__c', { hasText: 'LX 직원' }).click();
  expect(await page.evaluate(() => document.querySelector('.lg-cap__who').getAnimations().length)).toBe(0);
  await expect(page.locator('#lgCapName')).toHaveText('LX 직원');
  await ctx.close();
});

test('워드마크 — 구 스파이크 dive.html 이 아니라 메인(scrub/index.html)으로 간다', async ({ page }) => {
  await boot(page);
  await expect(page.locator('.lg-brand')).toHaveAttribute('href', 'scrub/index.html');
  expect((await page.request.get('proto/scrub/index.html')).status()).toBe(200);
  await expect(page.locator('a[href*="dive.html"]')).toHaveCount(0);
});

test('기관 세션에서 LX 로그인 — 지금 기관 계정 안내 · 로그인하면 lx_tenant_session 이 지워진다(§7.1)', async ({ page }) => {
  const errs = watch(page);
  await clearOnce(page, { lx_tenant_session: JSON.stringify({ tenant: 'namwon', at: '2026-06-08T09:00:00+09:00' }) });
  await page.goto(URL);
  await page.waitForFunction(() => window.__login && window.__login.ready, null, { timeout: 30000 });
  await expect(page.locator('#lgRoleNow')).toHaveText('지금 전북특별자치도 남원시 계정으로 들어와 있습니다 — LX 계정으로 로그인하면 기관 세션은 끝납니다.');
  await page.locator('.lg-seg__c', { hasText: 'LX 직원' }).click();
  await page.locator('#lgEmail').fill('hong@lx.or.kr');
  await page.locator('#lgPw').fill('lx-2026');
  await page.locator('#lgSubmit').click();
  await page.waitForURL((u) => u.pathname.endsWith('/ai-project.html'), { timeout: 15000 });
  expect(await page.evaluate(KEYS)).toEqual({ in: '1', role: 'staff', tenant: null });
  expect(errs).toEqual([]);
});

test('기관 세션 + ?next — LX 화면으로 넘기지 않는다(Q1 완전 별도)', async ({ page }) => {
  await clearOnce(page, { lx_tenant_session: JSON.stringify({ tenant: 'namwon', at: '2026-06-08T09:00:00+09:00' }) });
  await page.goto(URL + '?next=ximap.html');
  await page.waitForFunction(() => window.__login && window.__login.ready, null, { timeout: 30000 });
  await page.waitForTimeout(400);
  expect(page.url()).toContain('login.html');
});

test('손상 — LX 세션과 기관 세션이 동시에 있으면 셋 다 지우고 로그인 화면에 선다', async ({ page }) => {
  await clearOnce(page, { lx_logged_in: '1', lx_role: 'staff', lx_tenant_session: JSON.stringify({ tenant: 'namwon', at: '2026-06-08T09:00:00+09:00' }) });
  await page.goto(URL + '?next=ximap.html');
  await page.waitForFunction(() => window.__login && window.__login.ready, null, { timeout: 30000 });
  await page.waitForTimeout(400);
  expect(page.url()).toContain('login.html');
  expect(await page.evaluate(KEYS)).toEqual({ in: null, role: null, tenant: null });
});

test('LX 세션으로 다시 열면 — 지금 계정 안내 + 고르개가 그 계정 · 캡션도 그 계정', async ({ page }) => {
  await clearOnce(page, { lx_logged_in: '1', lx_role: 'sales' });
  await page.goto(URL);
  await page.waitForFunction(() => window.__login && window.__login.ready, null, { timeout: 30000 });
  await expect(page.locator('input[name=role][value=sales]')).toBeChecked();
  await expect(page.locator('#lgRoleNow')).toHaveText('지금 영업용 계정으로 들어와 있습니다 — 다시 로그인하면 고른 계정으로 바뀝니다.');
  expect((await page.evaluate(() => window.__login.caption())).role).toBe('sales');
});

test('?next 우선 — 허용된 next 가 있으면 역할의 첫 화면보다 앞선다', async ({ page }) => {
  await boot(page, '?next=analysis-ai.html');
  await page.locator('.lg-seg__c', { hasText: 'LX 직원' }).click();
  expect(await page.evaluate(() => window.__login.destination('staff'))).toBe('analysis-ai.html');
  await page.locator('#lgEmail').fill('hong@lx.or.kr');
  await page.locator('#lgPw').fill('lx-2026');
  await page.locator('#lgSubmit').click();
  await page.waitForURL((u) => u.pathname.endsWith('/analysis-ai.html'), { timeout: 15000 });   // 정규식은 login.html?next= 에도 걸린다
  expect(await page.evaluate(KEYS)).toEqual({ in: '1', role: 'staff', tenant: null });
});

test('390 — 1열 스택 · 필름 판 위 · 가로 넘침 0(scrollWidth === clientWidth)', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errs = watch(page);
  await boot(page);
  const g = await page.evaluate(() => {
    const q = (s) => document.querySelector(s).getBoundingClientRect();
    const film = q('#lgPlate'), cap = q('#lgCap'), panel = q('.lg-panel'), seg = q('.lg-seg');
    const wide = [...document.querySelectorAll('.lg *')].filter((n) => { const r = n.getBoundingClientRect(); return r.width && r.right > innerWidth + 0.5; }).map((n) => n.className || n.tagName);
    return { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, stack: film.bottom <= cap.top + 1 && cap.bottom <= panel.top + 1,
             filmW: Math.round(film.width), panelW: Math.round(panel.width), segRight: seg.right <= panel.right, wide };
  });
  expect(g.sw).toBe(g.cw);
  expect(g.wide).toEqual([]);
  expect(g.stack).toBe(true);
  expect(g.filmW).toBe(g.panelW);
  expect(g.segRight).toBe(true);
  expect(errs).toEqual([]);
  await page.screenshot({ path: `${SHOTS_W0}/05-login-390.png` });
  await ctx.close();
});
