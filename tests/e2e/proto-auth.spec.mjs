import { test, expect } from '@playwright/test';

// 인증 가족 — landxi/proto/{signup,find-id,find-id-result,find-password,find-password-result}.html · auth.{js,css} · auth-terms.js
//  마스터  design-canvas/v2/B6-Auth-*.dc.html (승인된 로그인 카드 가족) · 원본 landxi7/ 같은 이름 5쪽(문구 · 검증 1:1)
//  로그인 전 화면 — 관문 · 레일 없음. login.css 를 그대로 쓰고 auth.css 는 모자란 것만.
const INK = 'rgb(1, 1, 2)', ACCENT = 'rgb(0, 109, 247)', WARN = 'rgb(209, 53, 43)';
const NETWORK = /Failed to load resource|net::ERR|ERR_|status of 40|status of 50/i;
const PAGES = ['signup', 'find-id', 'find-id-result', 'find-password', 'find-password-result'];

function watch(page) {
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !NETWORK.test(m.text())) errs.push('console: ' + m.text()); });
  return errs;
}
async function boot(page, url) {
  await page.goto('proto/' + url);
  await page.waitForFunction(() => window.__auth?.ready && document.documentElement.dataset.shell === 'ready');
}
const tick = (page, id) => page.locator(`label:has(#${id})`).click();

test.describe('가족 — 로그인과 같은 카드', () => {
  test('로그인의 링크 3개가 이 화면들로 온다', async ({ page }) => {
    await page.goto('proto/login.html');
    const hrefs = await page.locator('.lg-find__a, #lgSignup').evaluateAll((a) => a.map((e) => e.getAttribute('href')));
    expect(hrefs).toEqual(['find-id.html', 'find-password.html', 'signup.html']);
    for (const h of hrefs) expect((await page.request.get('proto/' + h)).status()).toBe(200);
  });
  for (const name of PAGES) test(`${name} — 관문 · 레일 없음 · 카드 · CI · 필름 · 푸터 · 콘솔 오류 0`, async ({ page }) => {
    const errs = watch(page);
    await boot(page, name + '.html');
    expect(page.url()).toContain(name + '.html');                           // 로그인하지 않아도 그대로 선다
    await expect(page.locator('#rail')).toHaveCount(0);
    await expect(page.locator('#page-title')).toBeVisible();
    const box = await page.locator('#lgCard').boundingBox();
    const tall = name === 'signup' ? 600 : 520;
    expect([Math.round(box.x), Math.round(box.width), Math.round(box.height)]).toEqual([120, 1200, tall]);
    expect(Math.abs(box.y - (900 - tall) / 2)).toBeLessThanOrEqual(1);
    const film = await page.locator('#lgPlate').boundingBox();
    expect(Math.round(film.width / box.width * 100)).toBe(name === 'signup' ? 40 : 60);
    expect(await page.locator('#lgVideo').getAttribute('poster')).toBe('../assets/proto/film/legs/wfull.webp');
    await expect(page.locator('.lg-brand__ci')).toBeVisible();
    await expect(page.locator('.lg-foot__ci')).toBeVisible();
    await expect(page.locator('.lg-foot__legal')).toHaveText('Copyright© LX. ALL RIGHTS RESERVED.');
    expect(await page.locator('.lg-foot__policy a').allTextContents()).toEqual(['개인정보처리방침', '이용약관', '이메일무단수집거부']);
    expect(await page.locator('#page-title').evaluate((e) => { const s = getComputedStyle(e); return [s.fontFamily.split(',')[0].replace(/"/g, ''), s.fontSize, s.fontWeight]; })).toEqual(['Paperlogy', '34px', '700']);
    expect(errs).toEqual([]);
  });
  test('제목 · 필드 · 푸터가 로그인과 같은 자리 · 같은 글자', async ({ page }) => {
    const probe = () => page.evaluate(() => {
      const r = (s) => { const b = document.querySelector(s).getBoundingClientRect(); return [Math.round(b.x), Math.round(b.y)]; };
      const f = (s) => { const c = getComputedStyle(document.querySelector(s)); return [c.fontFamily, c.fontSize, c.fontWeight, c.color]; };
      return { h1: r('.lg-h1'), lead: r('.lg-lead'), fieldX: r('.lx-field')[0], foot: r('.lg-foot'), head: r('.lg-head'), label: f('.lx-field__label'), input: f('.lx-field__input'), lead2: f('.lg-lead') };
    });
    await page.goto('proto/login.html?logout');
    await page.waitForFunction(() => window.__login?.ready);
    const login = await probe();
    await boot(page, 'find-id.html');
    expect(await probe()).toEqual(login);
  });
  test('축소 모션 — 필름은 포스터만', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await boot(page, 'find-id.html');
    await expect(page.locator('#lgVideo source')).toHaveCount(0);
  });
});

test.describe('계정 신청 3단계', () => {
  test('1단계 — 필수 2 체크 전에는 `다음` 비활성 · 전체 동의 ↔ 개별', async ({ page }) => {
    await boot(page, 'signup.html');
    const next = page.locator('#btn-next-1');
    await expect(page.locator('#auSteps li[aria-current="step"]')).toContainText('약관 동의');
    await expect(next).toBeDisabled();
    expect(await next.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgb(204, 204, 204)');
    await tick(page, 'agree-terms');
    await expect(next).toBeDisabled();
    await tick(page, 'agree-privacy');
    await expect(next).toBeEnabled();
    expect(await next.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe(INK);
    await tick(page, 'agree-all');
    for (const k of ['terms', 'privacy', 'marketing', 'sms', 'email']) await expect(page.locator(`#agree-${k}`)).toBeChecked();
    await tick(page, 'agree-sms');
    await expect(page.locator('#agree-all')).not.toBeChecked();
    await tick(page, 'agree-all'); await tick(page, 'agree-all');
    await expect(page.locator('#agree-terms')).not.toBeChecked();
    await expect(next).toBeDisabled();
    await expect(page.locator('#btn-prev-1')).toHaveAttribute('href', 'login.html');
  });
  test('약관 전문 뷰어 — 원본 제1조–제20조 · 고른 약관 = 틴트', async ({ page }) => {
    await boot(page, 'signup.html');
    await expect(page.locator('#auDocH')).toContainText('이용약관');
    await expect(page.locator('#auDocB h3')).toHaveCount(20);
    await expect(page.locator('#auDocB')).toContainText('(시행일) 본 약관은 2026년 4월 1일부터 시행됩니다.');
    await expect(page.locator('.au-row[data-doc="terms"]')).toHaveAttribute('data-sel', '');
    await page.locator('.au-view[data-view="privacy"]').click();
    await expect(page.locator('#auDocH')).toContainText('개인정보 처리방침');
    await expect(page.locator('#auDocB')).toContainText('회원정보 보유·이용 기간: 회원탈퇴 시까지');
    await expect(page.locator('.au-row[data-sel]')).toHaveCount(1);
    await expect(page.locator('.au-view[data-view="privacy"]')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('.au-view[data-view="marketing"]').click();
    await expect(page.locator('#auDocB')).toContainText('광고 홍보 활동 등을 위한 목적으로만 수집됩니다.');
  });
  test('2단계 — 검증 문구 전부(원본) · 입력하면 즉시 풀린다', async ({ page }) => {
    await boot(page, 'signup.html?step=2');
    await expect(page.locator('#auSteps li[aria-current="step"]')).toContainText('정보 입력');
    await expect(page.locator('#auSteps li.is-done')).toHaveCount(1);
    expect(await page.locator('#step-view-2 .lx-field__label').allTextContents()).toEqual(['아이디 (이메일)*', '비밀번호*', '비밀번호 확인*', '이름*', '연락처*', '소속 부서*', '직위*']);
    expect(await page.locator('#f-dept option').allTextContents()).toEqual(['선택하세요', '도로관리과', '교통행정과', '도시계획과', '정보통신팀', '안전총괄과', '재난관리과', '홍보전산과']);
    await page.locator('#btn-next-2').click();
    await expect(page.locator('#f-emailMsg')).toHaveText('이메일을 입력해 주세요.');
    await expect(page.locator('#f-passwordMsg')).toHaveText('영문·숫자·특수문자를 조합해 8자 이상');
    await expect(page.locator('#f-password2Msg')).toHaveText('비밀번호를 한 번 더 입력하세요.');
    await expect(page.locator('#f-nameMsg')).toHaveText('이름을 입력해 주세요.');
    await expect(page.locator('#f-phoneMsg')).toHaveText('연락처를 입력해 주세요.');
    for (const id of ['f-email', 'f-password', 'f-password2', 'f-name', 'f-phone', 'f-dept', 'f-rank']) await expect(page.locator('#' + id)).toHaveAttribute('aria-invalid', 'true');
    expect(await page.locator('#f-emailMsg').evaluate((e) => getComputedStyle(e).color)).toBe(WARN);
    expect(await page.locator('#f-email').evaluate((e) => [getComputedStyle(e).borderBottomWidth, getComputedStyle(e).borderBottomColor])).toEqual(['2px', INK]);   // 빨강은 글자에만
    await expect(page.locator('#f-email')).toBeFocused();
    await expect(page.locator('#step-view-2')).toBeVisible();

    await page.locator('#f-email').fill('hong@lx');
    await expect(page.locator('#f-emailMsg')).toHaveText('업무용 이메일을 입력하세요. 로그인 아이디로 사용됩니다.');
    await page.locator('#f-password').fill('abcdef'); await page.locator('#f-password2').fill('abcdefgh');
    await page.locator('#btn-next-2').click();
    await expect(page.locator('#f-emailMsg')).toHaveText('올바른 이메일 형식을 입력해 주세요.');
    await expect(page.locator('#f-password2Msg')).toHaveText('비밀번호가 일치하지 않습니다.');
    const overlap = await page.evaluate(() => { const a = document.querySelector('#step-view-2 .au-grid').getBoundingClientRect(), b = document.querySelector('#step-view-2 .au-actions').getBoundingClientRect(); return a.bottom <= b.top; });
    expect(overlap).toBe(true);
  });
  test('키보드만으로 완주 — 약관 → 정보 입력 → 완료 → 로그인 페이지로 · 뒤로 가기', async ({ page }) => {
    const errs = watch(page);
    await boot(page, 'signup.html');
    await page.locator('#agree-terms').focus(); await page.keyboard.press('Space');
    await page.locator('#agree-privacy').focus(); await page.keyboard.press('Space');
    await page.locator('#btn-next-1').focus(); await page.keyboard.press('Enter');
    await expect(page.locator('#step-view-2')).toBeVisible();
    expect(page.url()).toContain('step=2');
    await expect(page.locator('#f-email')).toBeFocused();
    await page.keyboard.type('hong@lx.or.kr'); await page.keyboard.press('Tab');
    await page.keyboard.type('abcd1234!@'); await page.keyboard.press('Tab');
    await page.keyboard.type('abcd1234!@'); await page.keyboard.press('Tab');
    await page.keyboard.type('홍길동'); await page.keyboard.press('Tab');
    await page.keyboard.type('010-1234-5678'); await page.keyboard.press('Tab');
    await page.locator('#f-dept').selectOption('도로관리과'); await page.keyboard.press('Tab');
    await page.keyboard.type('주무관');
    await page.keyboard.press('Enter');
    await expect(page.locator('#step-view-3')).toBeVisible();
    expect(page.url()).toContain('step=3');
    await expect(page.locator('#step-view-3 h2')).toHaveText('계정 신청이 접수되었습니다');
    await expect(page.locator('#done-name')).toHaveText('홍길동');
    await expect(page.locator('#done-email')).toHaveText('hong@lx.or.kr');
    await expect(page.locator('#done-dept')).toHaveText('도로관리과 · 주무관');
    await expect(page.locator('#step-view-3')).toContainText('도로관리과 063-713-1218 (평일 09:00~18:00)');
    await expect(page.locator('#auSteps li.is-done')).toHaveCount(2);
    await page.goBack();
    await expect(page.locator('#step-view-2')).toBeVisible();
    await expect(page.locator('#f-name')).toHaveValue('홍길동');
    await page.goForward();
    await page.locator('#btn-to-login').click();
    await page.waitForURL(/login\.html/);
    expect(errs).toEqual([]);
  });
  test('?step=3 딥링크 — 원본처럼 빈 값 자리표시', async ({ page }) => {
    await boot(page, 'signup.html?step=3');
    await expect(page.locator('#done-name')).toHaveText('신청자');
    await expect(page.locator('#done-email')).toHaveText('-');
    await expect(page.locator('#step-view-3 .au-tag')).toHaveText('시연');
  });
});

test.describe('아이디 찾기', () => {
  test('오류 2종 · 전화번호는 숫자만 · 결과로 이름 전달', async ({ page }) => {
    await boot(page, 'find-id.html');
    await expect(page.locator('.lg-lead')).toHaveText('회원가입 시 입력한 이름과 전화번호를 입력해 주세요.');
    await page.locator('#btnFind').click();
    await expect(page.locator('#findNameMsg')).toHaveText('이름을 입력해 주세요.');
    await expect(page.locator('#findPhoneMsg')).toHaveText('전화번호를 입력해 주세요.');
    await expect(page.locator('#findName')).toBeFocused();
    expect(await page.evaluate(() => document.querySelector('.lg-contact').getBoundingClientRect().bottom <= document.querySelector('#lgCard').getBoundingClientRect().bottom)).toBe(true);
    await page.locator('#findName').fill('홍길동');
    await expect(page.locator('#findNameMsg')).toBeHidden();
    await page.locator('#findPhone').fill('010-6300 12ab');
    await expect(page.locator('#findPhone')).toHaveValue('010630012');
    await page.keyboard.press('Enter');
    await page.waitForURL(/find-id-result\.html\?name=/);
    expect(new globalThis.URL(page.url()).searchParams.get('name')).toBe('홍길동');
  });
  test('결과 성공 — 마스킹된 아이디 + `시연` · CTA = login.html', async ({ page }) => {
    await boot(page, 'find-id-result.html?name=x');
    await expect(page.locator('#frLead')).toHaveText('mini****@n****.com');
    await expect(page.locator('.au-msg')).toHaveText('위의 아이디(이메일)로 로그인해 주세요.');
    await expect(page.locator('#page-title .au-tag')).toHaveText('시연');
    await expect(page.locator('#ctaLogin')).toHaveText('로그인 하러 가기');
    await expect(page.locator('#ctaLogin')).toHaveAttribute('href', 'login.html');
    expect(await page.locator('[data-when="ok"] a, a[data-when="ok"]').evaluateAll((a) => a.map((e) => [e.textContent.trim(), e.getAttribute('href')]))).toEqual([['로그인 하러 가기', 'login.html'], ['회원가입', 'signup.html'], ['비밀번호 찾기', 'find-password.html']]);
    await expect(page.locator('[data-when="fail"]').first()).toBeHidden();
  });
  test('결과 실패(?result=fail) — 다시 시도 / 회원가입 · 로그인 | 비밀번호 찾기', async ({ page }) => {
    await boot(page, 'find-id-result.html?result=fail');
    await expect(page.locator('.au-result-b[data-when="fail"] .au-lead')).toHaveText('입력하신 정보로회원 정보를 찾을 수 없습니다.');
    await expect(page.locator('.au-result-b[data-when="ok"]')).toBeHidden();
    expect(await page.locator('[data-when="fail"] a').evaluateAll((a) => a.map((e) => [e.textContent.trim(), e.getAttribute('href')]))).toEqual([['다시 시도', 'find-id.html'], ['회원가입', 'signup.html'], ['로그인', 'login.html'], ['비밀번호 찾기', 'find-password.html']]);
    await expect(page.locator('#ctaRetry')).toBeFocused();
  });
});

test.describe('비밀번호 찾기', () => {
  test('오류 2종 → 결과(재설정 메일 발송) → 로그인', async ({ page }) => {
    await boot(page, 'find-password.html');
    await expect(page.locator('.lg-lead')).toHaveText('회원가입 시 입력한 이메일 주소로 임시비밀번호가 발급됩니다.');
    await page.locator('#findName').fill('홍길동');
    await page.locator('#btnFind').click();
    await expect(page.locator('#findNameMsg')).toBeHidden();
    await expect(page.locator('#findEmailMsg')).toHaveText('아이디(이메일)를 입력해 주세요.');
    await expect(page.locator('#findEmail')).toBeFocused();
    await expect(page.locator('#linkOther')).toHaveAttribute('href', 'find-id.html');
    await page.locator('#findEmail').fill('hong@lx.or.kr');
    await page.locator('#btnFind').click();
    await page.waitForURL(/find-password-result\.html/);
    await page.waitForFunction(() => window.__auth?.ready);
    await expect(page.locator('.au-result-b[data-when="ok"] .au-lead')).toHaveText('비밀번호 재설정 메일이발송되었습니다.');
    await expect(page.locator('.au-msg')).toHaveText('이메일을 통해 비밀번호를 재설정 한 후 이용해 주세요.');
    await page.locator('#ctaLogin').click();
    await page.waitForURL(/login\.html/);
  });
  test('결과 실패(?result=fail)', async ({ page }) => {
    await boot(page, 'find-password-result.html?result=fail');
    expect(await page.locator('[data-when="fail"] a').evaluateAll((a) => a.map((e) => [e.textContent.trim(), e.getAttribute('href')]))).toEqual([['다시 시도', 'find-password.html'], ['회원가입', 'signup.html'], ['로그인', 'login.html']]);
  });
});

test.describe('법전', () => {
  for (const [name, url, prep] of [
    ['signup 1단계', 'signup.html', null],
    ['signup 2단계 오류', 'signup.html?step=2', async (page) => { await page.locator('#btn-next-2').click(); }],
    ['signup 3단계', 'signup.html?step=3', null],
    ['find-id 오류', 'find-id.html', async (page) => { await page.locator('#btnFind').click(); }],
    ['find-id-result', 'find-id-result.html', null],
    ['find-password-result 실패', 'find-password-result.html?result=fail', null],
  ]) test(`라운드 0 · 그림자 0 · 그라디언트 0 · 바닥 14px · 파란 채움 버튼 0 · 빨강은 글자만 — ${name}`, async ({ page }) => {
    await boot(page, url);
    if (prep) await prep(page);
    const bad = await page.evaluate(({ ACCENT, WARN }) => {
      const out = [];
      const name = (e) => `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}${typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\s+/).join('.') : ''}`;
      for (const e of document.body.querySelectorAll('*')) {
        if (e.closest('svg') && e.tagName.toLowerCase() !== 'svg') continue;
        if (e.closest('[hidden]')) continue;
        for (const pseudo of [null, '::before', '::after']) {
          const s = getComputedStyle(e, pseudo);
          if (pseudo && (s.content === 'none' || s.content === 'normal')) continue;
          const who = name(e) + (pseudo || '');
          if (['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomLeftRadius', 'borderBottomRightRadius'].some((k) => parseFloat(s[k]) > 0)) out.push(`radius ${who}`);
          if (s.boxShadow && s.boxShadow !== 'none') out.push(`shadow ${who}`);
          if (/gradient/.test(s.backgroundImage)) out.push(`gradient ${who}`);
          if (s.backdropFilter && s.backdropFilter !== 'none') out.push(`backdrop ${who}`);
          if (s.backgroundColor === WARN) out.push(`warn-fill ${who}`);
        }
        const s = getComputedStyle(e);
        if (/^(button|a)$/i.test(e.tagName) && s.backgroundColor === ACCENT) out.push(`blue-button ${name(e)}`);
        const hasText = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
        const field = /^(input|select|textarea)$/i.test(e.tagName) && !['checkbox', 'radio'].includes(e.type);
        if ((hasText || field) && parseFloat(s.fontSize) < 14) out.push(`font<14 ${name(e)} ${s.fontSize}`);
      }
      return out;
    }, { ACCENT, WARN });
    expect(bad).toEqual([]);
  });
  test('1280×720 에서도 계정 신청 카드가 잘리지 않고 스크롤된다', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await boot(page, 'signup.html');
    expect(await page.evaluate(() => getComputedStyle(document.body).overflowY)).not.toBe('hidden');
    await page.locator('.lg-foot__legal').scrollIntoViewIfNeeded();
    await expect(page.locator('.lg-foot__legal')).toBeInViewport();
  });
});
