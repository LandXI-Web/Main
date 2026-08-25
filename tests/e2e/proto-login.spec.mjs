import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const URL = 'proto/login.html';
const SHOTS = 'shots/proto-login';
fs.mkdirSync(SHOTS, { recursive: true });

// 필름 파일이 아직 없을 수 있다(레그를 굽는 중). 그건 정상 동작이다 — 포스터가 남는다.
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

async function boot(page, q = '') {
  await page.addInitScript(() => { try { localStorage.clear(); } catch {} });
  await page.goto(URL + q);
  await page.waitForFunction(() => window.__login && window.__login.ready, null, { timeout: 30000 });
  await page.waitForTimeout(1400);            // 등장 스태거(600ms + 6×60ms) 정착
}

const EMAIL_MSG = '업무 이메일 형식으로 입력해 주세요 (예: hong@lx.or.kr)';
const PW_MSG = '비밀번호가 비어 있습니다. 계정은 소속 기관 담당자가 발급합니다.';

test('카피 — 분위기 문장이 아니라 Land-XI 플랫폼 소개다', async ({ page }) => {
  const errs = watch(page);
  await boot(page);

  // 모토(스펙 §1 고정 문안)가 H1 이고, SUIT 500 단일 굵기다.
  const h1 = page.locator('.lg-h1');
  await expect(h1).toContainText('LX 전 직원이');
  await expect(h1).toContainText('Geo-AI 전문가입니다');
  await expect(h1).not.toContainText('국토는 매일');           // 반려된 카피는 없다
  const type = await page.evaluate(() => {
    const cs = getComputedStyle(document.querySelector('.lg-h1'));
    return { fam: cs.fontFamily, w: cs.fontWeight };
  });
  expect(type.fam).toMatch(/SUIT/);
  expect(type.w).toBe('500');

  // 비전(스펙 §1 고정 문안)
  await expect(page.locator('.lg-vis')).toContainText('범부처 AI 기반 국토정보 통합조사');
  await expect(page.locator('.lg-mast__vis')).toHaveText('범부처 AI 기반 국토정보 통합조사');

  // 3축 원장 — 실수치가 mono 로 붙어 있다.
  const rows = page.locator('.lg-ledger .lg-row');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText('노코드 · 워크플로우 기반 AI 모델 개발');
  await expect(rows.nth(0)).toContainText('10');
  await expect(rows.nth(1)).toContainText('전국단위 AI 실태조사');
  await expect(rows.nth(1)).toContainText('13개 조사');
  await expect(rows.nth(1)).toContainText('51,569');
  await expect(rows.nth(2)).toContainText('범부처 통합');
  await expect(rows.nth(2)).toContainText('부처 5');

  await expect(page.locator('.lg-cta__t')).toHaveText('로그인하고 시작하기');
  expect(errs).toEqual([]);
  await page.screenshot({ path: `${SHOTS}/default.png` });
});

test('판 — 디오라마 필름이 FIG. 01 캡션·브래킷·● LIVE 와 함께 선다', async ({ page }) => {
  await boot(page);

  await expect(page.locator('.lg-cap__no')).toHaveText('FIG. 01');
  await expect(page.locator('#lgCapMeta')).toContainText('남원 금지면');
  await expect(page.locator('#lgCapMeta')).toContainText('9,664동');
  await expect(page.locator('#lgClock')).toHaveText(/^\d{2}:\d{2}$/);   // KST
  await expect(page.locator('.lg-live')).toContainText('LIVE');
  await expect(page.locator('.lx-bracket')).toHaveCount(4);

  const p = await page.evaluate(() => {
    const v = document.querySelector('#lgVideo');
    const r = document.querySelector('#lgPlate').getBoundingClientRect();
    return {
      fit: getComputedStyle(v).objectFit,
      poster: v.poster,
      src: window.__login.source(),
      right: Math.round(r.right), top: Math.round(r.top), left: Math.round(r.left),
      vw: innerWidth,
    };
  });
  expect(p.fit).toBe('cover');
  expect(p.poster).toMatch(/namwon-greenhouse-test\.png$/);
  // 판은 남원 디오라마 레그를 먼저 쓴다. 없으면 히어로 필름 0.5×.
  expect(p.src === null || /namwon-greenhouse-test\.mp4|hero\.mp4/.test(p.src)).toBeTruthy();
  // 이탈 하나 — 판이 오른쪽 위 여백을 넘어 화면 밖으로 흘러나간다.
  expect(p.right).toBe(p.vw);
  expect(p.top).toBe(0);
  expect(p.left).toBeGreaterThan(400);
});

test('앰비언트 — 5초 아무것도 안 해도 판이 돌고 있다(움직이는 요소 1개)', async ({ page }) => {
  await boot(page);
  const src = await page.evaluate(() => window.__login.source());
  test.skip(src === null, '필름 미존재 — 포스터 정지 화면 폴백');
  expect(await page.evaluate(() => window.__login.drifting())).toBe(true);
  const t0 = await page.evaluate(() => document.querySelector('#lgVideo').currentTime);
  await page.waitForTimeout(900);
  const t1 = await page.evaluate(() => document.querySelector('#lgVideo').currentTime);
  expect(t1).toBeGreaterThan(t0);
});

test('B안 대조 — 마스트헤드 64 · 여백 56 · 색인행 24 · 헤어라인 리듬', async ({ page }) => {
  await boot(page);
  const m = await page.evaluate(() => {
    const r = (s) => { const b = document.querySelector(s).getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; };
    const cs = (s, p) => getComputedStyle(document.querySelector(s))[p];
    return {
      mast: r('.lg-mast'), row: r('.lg-row'), ledger: r('.lg-ledger'), cap: r('.lg-cap'),
      rule: r('.lg-rule'), chapLs: cs('.lg-chap__l', 'letterSpacing'),
      rowBorder: cs('.lg-row', 'borderBottomWidth'),
      capBg: cs('.lg-cap', 'backgroundColor'),
      figColor: cs('.lg-cap__no', 'color'),
      overX: document.documentElement.scrollWidth > innerWidth + 1,
      overY: document.documentElement.scrollHeight > innerHeight + 1,
    };
  });
  expect(m.mast.h).toBe(64);              // B안 마스트헤드
  expect(m.row.x).toBe(56);               // B안 좌 여백
  expect(m.row.h).toBe(24);               // B안 색인행
  expect(m.ledger.w).toBe(400);           // B안 색인 폭
  expect(m.rule.w).toBe(210);             // B안 눈금자
  expect(m.rowBorder).toBe('1px');        // 헤어라인
  expect(m.chapLs).toBe('1.89px');        // .18em @ 10.5px
  expect(m.capBg).toBe('rgba(255, 255, 255, 0.9)');   // B안 캡션 흰 띠
  expect(m.figColor).toBe('rgb(0, 109, 247)');        // FIG 넘버 = LX 블루
  expect(m.overX).toBe(false);
  expect(m.overY).toBe(false);
});

test('등장 — 스크롤이 없는 한 판이므로 모든 블록이 켜진다', async ({ page }) => {
  await boot(page);
  const off = await page.evaluate(() => [...document.querySelectorAll('[data-reveal]')]
    .filter((n) => getComputedStyle(n).opacity !== '1')
    .map((n) => n.className));
  expect(off).toEqual([]);                    // 하단 10% 잘림으로 꺼진 블록이 없다
  await expect(page.locator('.lg-foot')).toBeVisible();
  await expect(page.locator('.lg-note')).toContainText('plat@lx.or.kr');
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

test('성공 — 동사가 바뀌고 판이 뷰포트를 먹으며 남원으로 밀고 들어간다', async ({ page }) => {
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
  await expect(page.locator('#lgPlate')).toHaveClass(/is-full/);

  await page.waitForFunction(() => window.__login.landed, null, { timeout: 15000 });
  await page.screenshot({ path: `${SHOTS}/success.png` });

  // 판이 액자를 벗고 뷰포트 전체가 됐다 — 마지막 프레임이 흰 여백이면 안 된다.
  const box = await page.evaluate(() => {
    const r = document.querySelector('#lgPlate').getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), vw: innerWidth, vh: innerHeight };
  });
  expect(box.x).toBe(0); expect(box.y).toBe(0);
  expect(box.w).toBe(box.vw); expect(box.h).toBe(box.vh);

  // 카메라는 남원 금지면에 있다(디오라마가 재현한 실좌표).
  const c = await page.evaluate(() => window.__login.center());
  expect(Math.abs(c[1] - 35.5311)).toBeLessThan(0.02);
  expect(Math.abs(c[0] - 127.3524)).toBeLessThan(0.02);
  await expect(page.locator('#lgReadStat')).toContainText('남원 금지면');
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
});

test('축소 모션 — 필름 대신 포스터, 같은 내용이 전부 보인다', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errs = watch(page);
  await page.addInitScript(() => { try { localStorage.clear(); } catch {} });
  await page.goto(URL);
  await page.waitForFunction(() => window.__login && window.__login.ready, null, { timeout: 30000 });
  expect(await page.evaluate(() => window.__login.drifting())).toBe(false);
  expect(await page.evaluate(() => document.querySelector('#lgVideo').getAttribute('src'))).toBeNull();
  expect(await page.evaluate(() => document.querySelector('#lgVideo').poster)).toMatch(/\.png$/);
  const clip = await page.evaluate(() => getComputedStyle(document.querySelector('#lgPlate')).clipPath);
  expect(clip === 'none' || /inset\(0/.test(clip)).toBeTruthy();
  await expect(page.locator('.lg-h1')).toBeVisible();
  await expect(page.locator('.lg-ledger .lg-row')).toHaveCount(3);
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
  await page.screenshot({ path: `${SHOTS}/default-1024.png`, fullPage: true });
  await ctx.close();
});
