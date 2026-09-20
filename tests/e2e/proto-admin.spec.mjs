import { test, expect } from '@playwright/test';

// 서비스 관리(admin) 5페이지 — landxi/proto/admin-{users,notice,inquiry,faq,map}.html
//  원판  design-canvas/v2/B6-Admin-*.dc.html(20) · 기록 design-canvas/v2/notes/B6-admin.md · 채택 = 선택 2(SPLIT)
//  원본  landxi7/admin-*.html 1:1 · 시드 마스킹 · 기준일 2026-04-23
//  실행  PORT=4194 PLAYWRIGHT_BROWSERS_PATH="E:/Land-XI 플랫폼/_env/ms-playwright" npx playwright test tests/e2e/proto-admin.spec.mjs --workers=1
const P = (f) => `proto/admin-${f}.html`;
const PAGES = ['users', 'notice', 'inquiry', 'faq', 'map'];
const INK = 'rgb(1, 1, 2)', WARN = 'rgb(209, 53, 43)', ACCENT = 'rgb(0, 109, 247)';
const NETWORK = /Failed to load resource|net::ERR|ERR_|status of 40|status of 50|tile|AJAXError|could not be decoded/i;

function watch(page) {
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !NETWORK.test(m.text())) errs.push('console: ' + m.text()); });
  return errs;
}
async function boot(page, url) {
  await page.addInitScript(() => localStorage.setItem('lx_logged_in', '1'));
  await page.goto(url);
  await page.waitForFunction(() => document.documentElement.dataset.shell === 'ready');
}
const facet = (page, id) => page.locator(`[data-facet="${id}"]`);
const rows = (page) => page.locator('#tbl tbody tr[data-row]');
const say = (page) => page.locator('#say');
const systemCheck = () => {
  const out = [];
  const name = (e) => `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}${typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\s+/).join('.') : ''}`;
  for (const e of document.body.querySelectorAll('*')) {
    if (e.closest('svg') && e.tagName.toLowerCase() !== 'svg') continue;
    for (const pseudo of [null, '::before', '::after']) {
      const s = getComputedStyle(e, pseudo);
      if (pseudo && (s.content === 'none' || s.content === 'normal')) continue;
      const who = name(e) + (pseudo || '');
      if (['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomLeftRadius', 'borderBottomRightRadius'].some((k) => parseFloat(s[k]) > 0)) out.push(`radius ${who}`);
      if (s.boxShadow !== 'none') out.push(`shadow ${who}`);
      if (/gradient/.test(s.backgroundImage)) out.push(`gradient ${who}`);
      if (s.backdropFilter && s.backdropFilter !== 'none') out.push(`backdrop ${who}`);
      if (s.textShadow !== 'none') out.push(`text-shadow ${who}`);
    }
    const s = getComputedStyle(e);
    const hasText = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    const field = /^(input|select|textarea)$/i.test(e.tagName) && !['checkbox', 'radio', 'color', 'file'].includes(e.type);
    if ((hasText || field) && parseFloat(s.fontSize) < 14) out.push(`font<14 ${name(e)} ${s.fontSize}`);
    if (/^(button|a)$/i.test(e.tagName) && s.backgroundColor === 'rgb(0, 109, 247)') out.push(`blue-fill ${name(e)}`);
    if (s.backgroundColor === 'rgb(209, 53, 43)' || (parseFloat(s.borderTopWidth) > 0 && s.borderTopColor === 'rgb(209, 53, 43)' && !/^(input|select)$/i.test(e.tagName) && !e.matches('.rte,.err'))) out.push(`warn-fill/border ${name(e)}`);
  }
  return out;
};

test.describe('관문 · 셸', () => {
  test('로그인 전이면 다섯 페이지 모두 login.html?next= 로 · 한 단계 위 리다이렉트 파일도 살아 있다', async ({ page }) => {
    for (const f of PAGES) {
      await page.goto(P(f) + (f === 'users' ? '?id=4' : ''));
      await page.waitForURL(/login\.html/);
      expect(new URL(page.url()).searchParams.get('next')).toBe(`admin-${f}.html` + (f === 'users' ? '?id=4' : ''));
    }
    await page.addInitScript(() => localStorage.setItem('lx_logged_in', '1'));
    for (const f of PAGES) {
      await page.goto(`admin-${f}.html?x=1`);
      await page.waitForURL(new RegExp(`proto/admin-${f}\\.html`));
      await page.waitForFunction(() => document.documentElement.dataset.shell === 'ready');
      await expect(page.locator('html')).not.toHaveAttribute('data-stub', /.*/);
    }
  });

  test('레일 활성 = 서비스 관리 · 탭 5개가 다섯 페이지를 잇고 빨간 숫자 = 문의 6 · 사용자 1 · 콘솔 오류 0', async ({ page }) => {
    const errs = watch(page);
    for (const f of PAGES) {
      await boot(page, P(f));
      await expect(page.locator('#rail .rail-i[aria-current="page"]')).toHaveText('서비스 관리');
      await expect(page.locator('#page-title')).toHaveText('서비스 관리');
      const tabs = await page.locator('.ptabs a').evaluateAll((a) => a.map((e) => [e.getAttribute('href'), e.textContent.trim(), e.getAttribute('aria-current')]));
      expect(tabs.map((t) => t[0])).toEqual(['admin-notice.html', 'admin-inquiry.html', 'admin-faq.html', 'admin-users.html', 'admin-map.html']);
      expect(tabs.map((t) => t[1])).toEqual(['공지사항 관리', '문의 관리6', '자주 묻는 질문 관리', '사용자 관리1', '지도 속성 관리']);
      expect(tabs.filter((t) => t[2] === 'page').map((t) => t[0])).toEqual([`admin-${f}.html`]);
      await expect(page.locator('.ptabs a b').first()).toHaveCSS('color', WARN);
      await expect(page.locator('#mast-asof')).toHaveText('2026.04.23');
      await expect(page.locator('#mast .tag')).toHaveText('시연');
    }
    await page.locator('.ptabs a', { hasText: '문의 관리' }).click();
    await page.waitForURL(/admin-inquiry\.html/);
    expect(errs).toEqual([]);
  });
});

test.describe('사용자 관리', () => {
  test('숫자 = 대시보드 타일(사용자 21 · 가입 대기 1) · 가입일 내림차순 · 대기 행이 맨 위 + 기본 선택 · 마스킹', async ({ page }) => {
    await boot(page, P('users'));
    for (const [id, n] of [['action:pending', '1'], ['all', '21'], ['status:active', '19'], ['status:withdrawn', '2'], ['action:approved', '19'], ['action:rejected', '1']]) await expect(facet(page, id).locator('b')).toHaveText(n);
    await expect(facet(page, 'action:pending').locator('b')).toHaveCSS('color', WARN);
    await expect(facet(page, 'all')).toHaveAttribute('aria-pressed', 'true');
    await expect(rows(page)).toHaveCount(10);
    const first = rows(page).first();
    await expect(first).toHaveAttribute('aria-selected', 'true');
    await expect(first).toContainText('신○○'); await expect(first).toContainText('대기');
    await expect(page.locator('#panel .panel-t')).toHaveText('신○○');
    await expect(page.locator('#panel .u-head .st')).toHaveText('승인 대기');
    await expect(page.locator('#panel [data-act="approve"]')).toBeVisible();
    await expect(page).toHaveURL(/id=18/);
    const joined = await rows(page).evaluateAll((r) => r.map((e) => e.children[4].textContent.trim()));
    expect([...joined].sort().reverse()).toEqual(joined);
    const mails = await rows(page).evaluateAll((r) => r.map((e) => e.children[1].textContent.trim()));
    for (const m of mails) expect(m).toMatch(/^.{2}\*\*\*@/);
    const names = await rows(page).evaluateAll((r) => r.map((e) => e.children[0].textContent.trim()));
    for (const n of names) expect(n).toMatch(/^.○○$/);
    await expect(page.locator('#panel .fld-v .n').first()).toHaveText(/-\*\*\*\*$/);
    await expect(page.locator('#pager .pager-sum')).toHaveText('총 21건 중 1~10행');
  });

  test('승인 — 확인 대화상자 원본 문구 → 처리 상태 · 밴드 · 탭 숫자가 실제로 바뀐다 · 취소는 그대로', async ({ page }) => {
    await boot(page, P('users'));
    await page.locator('[data-act="approve"]').click();
    const dlg = page.locator('.modal[role="alertdialog"]');
    await expect(dlg.locator('.modal-msg')).toHaveText('이 사용자의 가입을 승인하시겠습니까?');
    await dlg.getByRole('button', { name: '취소' }).click();
    await expect(facet(page, 'action:pending').locator('b')).toHaveText('1');
    await expect(page.locator('[data-act="approve"]')).toBeFocused();
    await page.locator('[data-act="approve"]').click();
    await page.locator('.modal').getByRole('button', { name: '확인' }).click();
    await expect(page.locator('#panel .u-head .st')).toHaveText('정상 · 승인');
    await expect(facet(page, 'action:pending').locator('b')).toHaveText('0');
    await expect(facet(page, 'action:approved').locator('b')).toHaveText('20');
    await expect(rows(page).first().locator('td').last()).toHaveText('승인');
    await expect(page.locator('.ptabs a[href="admin-users.html"] b')).toHaveCount(0);
    await expect(page.locator('#panel .fld-v').nth(7)).toHaveText('관리자');
    await expect(page.locator('[data-act="approve"]')).toHaveCount(0);
    await page.goto(P('notice'));                                            // 탭을 옮겨도 남는다(sessionStorage)
    await page.waitForFunction(() => document.documentElement.dataset.shell === 'ready');
    await expect(page.locator('.ptabs a[href="admin-users.html"] b')).toHaveCount(0);
  });

  test('거부 · 탈퇴 · 비밀번호 초기화 · 권한 1인 1개 저장 · 삭제', async ({ page }) => {
    await boot(page, P('users') + '?id=19');
    await expect(page.locator('#panel .panel-t')).toHaveText('박○○');
    await expect(page).toHaveURL(/id=19/);
    await expect(page.locator('#u-fails')).toHaveText('5');
    await page.locator('[data-act="reset"]').click();
    await expect(page.locator('.modal-msg')).toHaveText('비밀번호 실패 횟수를 초기화 하시겠습니까?');
    await page.locator('.modal').getByRole('button', { name: '확인' }).click();
    await expect(page.locator('#u-fails')).toHaveText('0');
    const roles = page.locator('#u-roles input');
    await expect(roles.nth(4)).toBeChecked();
    await roles.nth(1).check();
    await expect(roles.nth(4)).not.toBeChecked();
    expect(await roles.evaluateAll((a) => a.filter((c) => c.checked).length)).toBe(1);
    await page.locator('[data-act="save"]').click();
    await expect(say(page)).toHaveText('권한이 저장되었습니다');
    await page.locator('[data-act="withdraw"]').click();
    await expect(page.locator('.modal-msg')).toHaveText('사용자를 탈퇴 처리하시겠습니까?');
    await expect(page.locator('.modal').getByRole('button', { name: '취소' })).toBeFocused();      // 파괴적 확인 = 기본 포커스가 취소
    await page.locator('.modal').getByRole('button', { name: '확인' }).click();
    await expect(facet(page, 'status:withdrawn').locator('b')).toHaveText('3');
    await expect(page.locator('[data-act="withdraw"]')).toHaveCount(0);
    await page.locator('[data-act="delete"]').click();
    await expect(page.locator('.modal-msg')).toHaveText('사용자를 완전히 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.');
    await page.locator('.modal').getByRole('button', { name: '삭제' }).click();
    await expect(facet(page, 'all').locator('b')).toHaveText('20');
    await page.goto(P('users') + '?id=18');
    await page.locator('[data-act="reject"]').click();
    await expect(page.locator('.modal-msg')).toHaveText('이 사용자의 가입을 거부하시겠습니까?');
    await page.locator('.modal').getByRole('button', { name: '확인' }).click();
    await expect(facet(page, 'action:rejected').locator('b')).toHaveText('2');
  });

  test('건수 타일 = 필터 · 7항목 검색 + 기간 칩 · 초기화 · 빈 상태 · 페이저 · 뒤로 가기', async ({ page }) => {
    await boot(page, P('users'));
    await facet(page, 'status:withdrawn').click();
    await expect(rows(page)).toHaveCount(2);
    await expect(page).toHaveURL(/status=withdrawn/);
    await expect(facet(page, 'status:withdrawn')).toHaveAttribute('aria-pressed', 'true');
    await facet(page, 'action:rejected').click();
    await expect(rows(page)).toHaveCount(1);
    await page.goBack(); await expect(rows(page)).toHaveCount(2);
    await page.goBack(); await expect(rows(page)).toHaveCount(10);
    await facet(page, 'action:pending').click();
    await expect(rows(page)).toHaveCount(1);
    await facet(page, 'all').click();

    await page.locator('#search [name="dept"]').fill('산림과');
    await page.locator('#search [name="dept"]').press('Enter');
    await expect(page.locator('#list-empty .empty-t')).toHaveText('검색 조건에 맞는 사용자가 없습니다.');
    await expect(page.locator('#pager .pager-sum')).toHaveText('총 0건 중 0~0행');
    await expect(page.locator('#panel .empty-t')).toHaveText('선택된 사용자가 없습니다');
    await expect(page).toHaveURL(/dept=/);
    await page.locator('#search button[type="reset"]').click();
    await expect(rows(page)).toHaveCount(10);
    await expect(page.locator('#search [name="dept"]')).toHaveValue('');

    for (const [k, v, n] of [['email', 'kakao', 1], ['name', '이', 3], ['phone', '010-', 6], ['dept', '환경', 3]]) {
      await page.locator(`#search [name="${k}"]`).fill(v);
      await page.locator('#search button[type="submit"]').click();
      await expect(rows(page)).toHaveCount(n);
      await page.locator('#search button[type="reset"]').click();
    }
    await page.locator('#search [data-months="1"]').click();
    await expect(page.locator('#search [name="from"]')).toHaveValue('2026-03-23');
    await expect(page.locator('#search [name="to"]')).toHaveValue('2026-04-23');
    await page.locator('#search button[type="submit"]').click();
    await expect(rows(page)).toHaveCount(2);
    await expect(page).toHaveURL(/q=1/);
    await page.locator('#search [data-months="0"]').click();
    await page.locator('#search button[type="submit"]').click();

    await page.locator('#pager button.n[data-p="3"]').click();
    await expect(rows(page)).toHaveCount(1);
    await expect(page.locator('#pager .pager-sum')).toHaveText('총 21건 중 21~21행');
    await expect(page).toHaveURL(/page=3/);
    await page.locator('#pager select').selectOption('50');
    await expect(rows(page)).toHaveCount(21);
  });

  test('로그인 이력 / 비밀번호 변경 이력 모달 — 2탭 · 페이저 · 빈 상태 문구 · 포커스 가둠 · Esc · 딥링크', async ({ page }) => {
    await boot(page, P('users') + '?id=4&hist=login');
    const m = page.locator('.modal');
    await expect(m.locator('h2')).toHaveText('접속 · 비밀번호 이력');
    await expect(m.locator('.adm-hist-sub')).toHaveText('정○○ · jy***@korea.kr');
    await expect(m.locator('#ht-login')).toHaveAttribute('aria-selected', 'true');
    await expect(m.locator('#hp-login tbody tr')).toHaveCount(5);
    await expect(m.locator('#hp-login thead th')).toHaveText(['로그인 ID', '접속 IP', '성공 여부', '실패 사유', '접속 일시', '로그아웃 일시']);
    await expect(m.locator('#hp-login .pager-sum')).toHaveText('총 5건 중 1~5행');
    await m.locator('#ht-login').press('ArrowRight');
    await expect(m.locator('#ht-pwd')).toBeFocused();
    await expect(m.locator('#hp-pwd tbody tr')).toHaveCount(2);
    await expect(m.locator('#hp-pwd thead th')).toHaveText(['로그인 ID', '변경 일시', '변경자', '변경 사유']);
    await expect(page).toHaveURL(/hist=pwd/);
    for (let i = 0; i < 14; i++) { await page.keyboard.press('Tab'); expect(await page.evaluate(() => !!document.activeElement.closest('.modal'))).toBe(true); }
    await page.keyboard.press('Escape');
    await expect(m).toHaveCount(0);
    await expect(page).not.toHaveURL(/hist=/);

    await rows(page).first().click();                                          // id 18 — 승인 전 계정
    await page.locator('[data-hist="login"]').click();
    await expect(m.locator('#hp-login .empty-t')).toHaveText('로그인 이력이 없습니다.');
    await expect(m.locator('#hp-login .pager-sum')).toHaveText('총 0건 중 0~0행');
    await m.locator('#ht-pwd').click();
    await expect(m.locator('#hp-pwd .empty-t')).toHaveText('비밀번호 변경 이력이 없습니다.');
    await m.getByRole('button', { name: '닫기' }).last().click();
    await expect(page.locator('[data-hist="login"]')).toBeFocused();
  });

  test('키보드만으로 가입 승인을 끝낸다 · 포커스 링 = 파랑 2px', async ({ page }) => {
    await boot(page, P('users'));
    await rows(page).nth(1).focus();
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Enter');
    await expect(rows(page).first()).toHaveAttribute('aria-selected', 'true');
    const ring = await page.evaluate(() => { const s = getComputedStyle(document.activeElement); return [s.outlineStyle, s.outlineWidth, s.outlineColor]; });
    expect(ring).toEqual(['solid', '2px', ACCENT]);
    for (let i = 0; i < 40; i++) { await page.keyboard.press('Tab'); if (await page.evaluate(() => document.activeElement.dataset.act === 'approve')) break; }
    await expect(page.locator('[data-act="approve"]')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('.modal').getByRole('button', { name: '확인' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#panel .u-head .st')).toHaveText('정상 · 승인');
    await expect(say(page)).toContainText('승인');
  });
});

test.describe('공지사항 관리', () => {
  test('숫자 = 대시보드 타일(공지 12 · 긴급 2) · 목록 + 열람 판 · 구분 패싯 · 기간 필터 · 페이저 · 딥링크', async ({ page }) => {
    await boot(page, P('notice'));
    for (const [id, n] of [['all', '12'], ['urgent', '2'], ['general', '6'], ['work', '4']]) await expect(facet(page, id).locator('b')).toHaveText(n);
    await expect(facet(page, 'urgent').locator('b')).toHaveCSS('color', WARN);
    await expect(rows(page)).toHaveCount(10);
    await expect(page.locator('#panel .n-title')).toHaveText('[긴급] 정기 서버 점검 안내 (4/25 01:00~04:00)');
    await expect(page.locator('#panel .vrow').first()).toContainText('2026.04.23 09:00 ~ 2026.04.25 04:00');
    await expect(page.locator('#panel .vrow').nth(1)).toContainText('메인화면 팝업 표시');
    await expect(page.locator('#panel .tl .tl-bar')).toHaveCount(2);
    await expect(page.locator('#panel .meta-foot')).toContainText('등록자 이○○');
    await facet(page, 'urgent').click();
    await expect(rows(page)).toHaveCount(2);
    await expect(page).toHaveURL(/cat=urgent/);
    await facet(page, 'all').click();
    for (const [m, n] of [[1, 5], [3, 10], [6, 12], [12, 12]]) {
      await page.locator(`#search [data-months="${m}"]`).click();
      await page.locator('#search button[type="submit"]').click();
      await expect(page.locator('#pager .pager-sum')).toContainText(`총 ${n}건`);
    }
    await page.locator('#search button[type="reset"]').click();
    await page.locator('#search [name="field"]').selectOption('title');
    await page.locator('#search [name="kw"]').fill('지도 서비스');
    await page.locator('#search [name="kw"]').press('Enter');
    await expect(rows(page)).toHaveCount(2);
    await page.locator('#search button[type="reset"]').click();
    await page.locator('#pager button.n[data-p="2"]').click();
    await expect(rows(page)).toHaveCount(2);
    await page.goto(P('notice') + '?id=2');
    await page.waitForFunction(() => document.documentElement.dataset.shell === 'ready');
    await expect(page.locator('#panel .n-title')).toContainText('서비스 정식 오픈');
    await expect(page.locator('#pager button[aria-current]')).toHaveText('2');
    await page.locator('[data-act="list"]').click();
    await expect(page.locator('#panel .empty-t')).toHaveText('선택된 공지사항이 없습니다');
  });

  test('등록 — 검증 문구 4(원본) · n/200 · 무한 게시 · 팝업 설정 + 1~4주일 · 저장하면 13건 · 키보드로 완주', async ({ page }) => {
    await boot(page, P('notice'));
    await page.locator('#new').click();
    await expect(page).toHaveURL(/mode=new/);
    await expect(page.locator('#band')).toBeHidden();
    await expect(page.locator('#panel h2')).toHaveText('공지사항 등록');
    await expect(page.locator('#f-cat')).toBeFocused();
    await page.locator('[data-act="save"]').click();
    await expect(page.locator('#fm .err:visible')).toHaveText(['구분을 선택해 주세요.', '제목을 입력해 주세요.', '게시 기간을 입력해 주세요.', '내용을 입력해 주세요.']);
    await expect(page.locator('#f-cat')).toBeFocused();
    await expect(page.locator('#f-title')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#fm .err:visible').first()).toHaveCSS('color', WARN);

    await page.keyboard.press('ArrowDown');                                   // 구분 = 긴급
    await expect(page.locator('#e-cat')).toBeHidden();
    await page.keyboard.press('Tab');
    await page.keyboard.type('e2e 시연 공지');
    await expect(page.locator('.cnt[data-for="f-title"]')).toHaveText('9자/200자');
    await expect(page.locator('#e-title')).toBeHidden();
    await page.locator('#f-from-date').fill('2026-04-24');
    await page.locator('[data-act="save"]').click();
    await expect(page.locator('#e-period')).toHaveText('게시 종료 날짜를 입력하거나 "무한 게시"를 선택해 주세요.');
    await page.locator('#f-unlimited').focus(); await page.keyboard.press('Space');
    await expect(page.locator('#f-to-date')).toBeDisabled();
    await expect(page.locator('#e-period')).toBeHidden();
    await expect(page.locator('#f-pf-date')).toBeDisabled();
    await expect(page.locator('[data-weeks="2"]')).toBeDisabled();
    await page.locator('#f-popup').focus(); await page.keyboard.press('Space');
    await page.locator('[data-act="save"]').click();
    await expect(page.locator('#e-popup')).toHaveText('팝업 기간을 입력해 주세요.');
    await page.locator('[data-weeks="2"]').focus(); await page.keyboard.press('Enter');
    await expect(page.locator('#f-pf-date')).toHaveValue('2026-04-23');
    await expect(page.locator('#f-pt-date')).toHaveValue('2026-05-07');
    await expect(page.locator('#f-pt-time')).toHaveValue('23:59');
    await expect(page.locator('#f-tl .tl-bar')).toHaveCount(2);
    await page.locator('#f-content').focus();
    await page.keyboard.type('본문입니다.');
    await page.locator('#fm input[type=file]').setInputFiles({ name: '안내.pdf', mimeType: 'application/pdf', buffer: Buffer.from('x'.repeat(2048)) });
    await expect(page.locator('#f-att .att')).toContainText('안내.pdf');
    await page.locator('[data-act="save"]').focus(); await page.keyboard.press('Enter');
    await expect(say(page)).toContainText('등록했습니다');
    await expect(page).not.toHaveURL(/mode=/);
    await expect(facet(page, 'all').locator('b')).toHaveText('13');
    await expect(facet(page, 'urgent').locator('b')).toHaveText('3');
    await expect(rows(page).first()).toContainText('e2e 시연 공지');
    await expect(rows(page).first()).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#panel .vrow').first()).toContainText('무한 게시');
    await expect(page.locator('#panel .n-att')).toContainText('안내.pdf');
    await page.goBack();                                                       // 뒤로 = 폼
    await expect(page.locator('#panel h2')).toHaveText('공지사항 등록');
  });

  test('수정(집중 모드 · 축약 목록) · 취소 · 삭제 확인 문구 · 선택 삭제', async ({ page }) => {
    await boot(page, P('notice') + '?id=12&mode=edit');
    await expect(page.locator('#panel h2')).toHaveText('공지사항 수정');
    await expect(page.locator('#f-title')).toHaveValue('[긴급] 정기 서버 점검 안내 (4/25 01:00~04:00)');
    await expect(page.locator('#f-popup')).toBeChecked();
    await expect(page.locator('#tbl.tbl--c')).toBeVisible();
    await page.locator('#f-title').fill('점검 안내(수정)');
    await page.locator('[data-act="save"]').click();
    await expect(page.locator('#panel .n-title')).toHaveText('점검 안내(수정)');
    await expect(page.locator('#panel .meta-foot')).toContainText('수정자 관리자');
    await page.locator('[data-act="edit"]').click();
    await page.locator('[data-act="cancel"]').click();
    await expect(page.locator('#panel h2')).toHaveText('공지사항 열람');

    await page.locator('[data-act="delete"]').click();
    await expect(page.locator('.modal-msg')).toHaveText('이 공지사항을 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.');
    await page.keyboard.press('Escape');
    await expect(facet(page, 'all').locator('b')).toHaveText('12');
    await page.locator('[data-act="delete"]').click();
    await page.locator('.modal').getByRole('button', { name: '삭제' }).click();
    await expect(facet(page, 'all').locator('b')).toHaveText('11');

    await page.locator('#del-sel').click();
    await expect(say(page)).toHaveText('삭제할 항목을 선택해 주세요.');
    await page.locator('#ck-all').check();
    await page.locator('#del-sel').click();
    await expect(page.locator('.modal-msg')).toHaveText('10개 항목을 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.');
    await page.locator('.modal').getByRole('button', { name: '삭제' }).click();
    await expect(facet(page, 'all').locator('b')).toHaveText('1');
  });
});

test.describe('문의 관리', () => {
  test('숫자 = 대시보드 타일(미답변 6 · 전체 12) · 질문/답변 판 · 상태 패싯 · 기간', async ({ page }) => {
    await boot(page, P('inquiry') + '?id=113');
    for (const [id, n] of [['pending', '6'], ['all', '12'], ['replied', '6']]) await expect(facet(page, id).locator('b')).toHaveText(n);
    await expect(page.locator('#panel h2')).toHaveText('문의 열람 · 답변 수정');
    await expect(page.locator('#panel .q-title')).toHaveText('지도 서비스에서 확대하면 일부 영역이 회색으로 표시됩니다');
    await expect(page.locator('#panel .q-by')).toContainText('등록자 박○○ · 도로관리과');
    await expect(page.locator('#panel .q-text')).toContainText('pa***@namwon.go.kr');
    await expect(page.locator('#panel .q-att')).toContainText('회색표시_캡처.png');
    await expect(page.locator('#v-answer')).toContainText('2026-05 재촬영 일정');
    await expect(page.locator('.rte-bar .rte-b')).toHaveCount(7);
    await facet(page, 'pending').click();
    await expect(rows(page)).toHaveCount(6);
    await expect(page).toHaveURL(/status=pending/);
    await facet(page, 'all').click();
    await page.locator('#search [data-months="1"]').click();
    await expect(page.locator('#search [data-months="1"]')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#search [name="from"]').fill('2026-04-10');             // 날짜를 직접 고치면 빠른 선택이 풀린다
    await expect(page.locator('#search [data-months="1"]')).toHaveAttribute('aria-pressed', 'false');
    await page.locator('#search button[type="submit"]').click();
    await expect(page.locator('#pager .pager-sum')).toContainText('총 7건');
  });

  test('답변 작성 — 답변 대기 행 → 집중 모드 · 빈 답변 경고(원본 문구) · 저장하면 답변 완료 + 탭 숫자 5', async ({ page }) => {
    await boot(page, P('inquiry'));
    await rows(page).first().click();
    await expect(page).toHaveURL(/mode=reply/);
    await expect(page.locator('#band')).toBeHidden();
    await expect(page.locator('#panel h2')).toHaveText('문의 열람 · 답변 작성');
    await expect(page.locator('#v-answer')).toBeFocused();
    await expect(page.locator('#v-answer')).toHaveAttribute('data-placeholder', "답변을 입력하세요. 저장 시 문의 상태가 '답변 완료'로 변경됩니다.");
    await page.locator('[data-act="save"]').click();
    await expect(say(page)).toHaveText('답변 내용을 입력해 주세요.');
    await page.locator('#v-answer').focus();
    await page.keyboard.type('서비스 지원 › 매뉴얼에서 받을 수 있습니다.');
    await page.locator('[data-act="save"]').click();
    await expect(say(page)).toHaveText('답변이 저장되었습니다');
    await expect(page.locator('#band')).toBeVisible();
    await expect(facet(page, 'pending').locator('b')).toHaveText('5');
    await expect(page.locator('.ptabs a[href="admin-inquiry.html"] b')).toHaveText('5');
    await expect(rows(page).first().locator('.st')).toHaveText('답변 완료');
    await expect(page.locator('#panel h2')).toHaveText('문의 열람 · 답변 수정');
    await expect(page.locator('#panel .q-ans-h .by')).toContainText('답변자 관리자');
    await page.locator('#v-answer').focus(); await page.keyboard.press('End'); await page.keyboard.type(' (수정)');
    await page.locator('[data-act="save"]').click();
    await expect(page.locator('#v-answer')).toContainText('(수정)');
    await page.locator('[data-act="list"]').click();
    await expect(page.locator('#panel .empty-t')).toHaveText('선택된 문의가 없습니다');
  });
});

test.describe('자주 묻는 질문 관리', () => {
  test('숫자 = 대시보드 타일(FAQ 15) · 구분 6 패싯 · 열람 · 검색', async ({ page }) => {
    await boot(page, P('faq') + '?id=14');
    const want = [['all', '15'], ['01', '4'], ['02', '2'], ['03', '3'], ['04', '2'], ['05', '2'], ['06', '2']];
    for (const [id, n] of want) await expect(facet(page, id).locator('b')).toHaveText(n);
    await expect(page.locator('#panel .f-q h3')).toHaveText('갑자기 분석 작업이 "실패" 로 표시돼요.');
    await expect(page.locator('#panel .f-a')).toContainText('원인은 크게 두 가지입니다.');
    await expect(page.locator('#panel .f-att')).toContainText('지원포맷_상세표.pdf');
    await facet(page, '03').click();
    await expect(rows(page)).toHaveCount(3);
    await facet(page, 'all').click();
    await page.locator('#search [name="field"]').selectOption('question');
    await page.locator('#search [name="kw"]').fill('계정');
    await page.locator('#search button[type="submit"]').click();
    await expect(page.locator('#pager .pager-sum')).toContainText('총 2건');
    await page.locator('#search [name="kw"]').fill('없는말없는말');
    await page.locator('#search button[type="submit"]').click();
    await expect(page.locator('#list-empty .empty-t')).toHaveText('검색 조건에 맞는 질문이 없습니다.');
  });

  test('등록(검증 3) · 수정 · 삭제 확인 문구', async ({ page }) => {
    await boot(page, P('faq'));
    await page.locator('#new').click();
    await page.locator('[data-act="save"]').click();
    await expect(page.locator('#fm .err:visible')).toHaveText(['구분을 선택해 주세요.', '제목을 입력해 주세요.', '내용을 입력해 주세요.']);
    await page.locator('#f-cat').selectOption('06');
    await page.locator('#f-question').fill('e2e 질문?');
    await page.locator('#f-answer').click(); await page.keyboard.type('e2e 답변');
    await page.locator('[data-act="save"]').click();
    await expect(facet(page, 'all').locator('b')).toHaveText('16');
    await expect(page.locator('#panel .f-q h3')).toHaveText('e2e 질문?');
    await page.locator('[data-act="edit"]').click();
    await expect(page.locator('#panel h2')).toHaveText('질문 수정');
    await page.locator('#f-question').fill('e2e 질문(수정)?');
    await page.locator('[data-act="save"]').click();
    await expect(page.locator('#panel .f-q h3')).toHaveText('e2e 질문(수정)?');
    await page.locator('[data-act="delete"]').click();
    await expect(page.locator('.modal-msg')).toHaveText('이 질문/답변을 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.');
    await page.locator('.modal').getByRole('button', { name: '삭제' }).click();
    await expect(facet(page, 'all').locator('b')).toHaveText('15');
  });
});

test.describe('지도 속성 관리', () => {
  test('조회 8속성 → 편집: 값 변경이 실지도를 다시 칠한다 · 기본값 복원 · 취소 · 저장 = localStorage lx-map-props', async ({ page }) => {
    test.setTimeout(90000);
    const errs = watch(page);
    await boot(page, P('map'));
    await expect(page.locator('#mp-title')).toHaveText('속성 조회');
    await expect(page.locator('[data-v]')).toHaveCount(8);
    await expect(page.locator('[data-v="lxColor"]')).toContainText('#FFF59D');
    await expect(page.locator('[data-v="baseMap"]')).toHaveText('위성');
    await expect(page.locator('#v-updated')).toContainText('저장 이력 없음');
    await page.waitForFunction(() => window.__lxMapPreview?.ready === true, null, { timeout: 60000 });
    const paint = (layer, prop) => page.evaluate(([l, p]) => window.__lxMap.getPaintProperty(l, p), [layer, prop]);
    const vis = (layer) => page.evaluate((l) => window.__lxMap.getLayoutProperty(l, 'visibility') || 'visible', layer);
    expect(await page.evaluate(() => ['lx', 'sr', 'det'].map((s) => window.__lxMap.getSource(s).serialize().data.features.length > 0))).toEqual([true, true, true]);
    expect(await paint('lx-line', 'line-width')).toBe(1);

    await page.locator('#a-edit').click();
    await expect(page).toHaveURL(/mode=edit/);
    await expect(page.locator('#mp-title')).toHaveText('속성 변경');
    await expect(page.locator('#mp-cap')).toHaveText('미리보기 — 저장 전 값으로 다시 그림');
    await page.locator('#f-lxWidth').fill('4');
    expect(await paint('lx-line', 'line-width')).toBe(4);
    await expect(page.locator('[data-chg="lxWidth"]')).toHaveText('변경됨 · 저장값 1 px');
    await page.locator('#f-lxColor-hex').fill('#FF0000');
    expect(await paint('lx-line', 'line-color')).toBe('#FF0000');
    await expect(page.locator('#f-lxColor')).toHaveValue('#ff0000');
    await page.locator('#f-searchStrokeColor-hex').fill('#00FF00');
    await page.locator('#f-searchWidth').fill('5');
    await page.locator('#f-searchFillColor-hex').fill('#0000FF');
    await page.locator('#f-searchFillOpacity').fill('40');
    await page.locator('#f-polyWidth').fill('99');                           // 1~10 으로 묶인다
    expect([await paint('sr-line', 'line-color'), await paint('sr-line', 'line-width'), await paint('sr-fill', 'fill-color'), await paint('sr-fill', 'fill-opacity'), await paint('det-line', 'line-width')]).toEqual(['#00FF00', 5, '#0000FF', 0.4, 10]);
    expect(await paint('det-line', 'line-color')).toBe('#0FA9A0');
    for (const [k, layer, sat] of [['base', 'b-base', 0], ['gray', 'b-base', -1], ['night', 'b-night', null], ['none', null, null], ['satellite', 'b-sat', null]]) {
      await page.locator(`input[name="f-baseMap"][value="${k}"]`).check();
      expect([await vis('b-sat'), await vis('b-base'), await vis('b-night')].filter((v) => v === 'visible').length).toBe(layer ? 1 : 0);
      if (layer) expect(await vis(layer)).toBe('visible');
      if (sat !== null) expect(await paint('b-base', 'raster-saturation')).toBe(sat);
    }
    await expect(page.locator('#lab-base')).toHaveText('기본 배경 지도 · 위성');

    await page.locator('#a-default').click();
    await expect(page.locator('#f-lxWidth')).toHaveValue('1');
    expect(await paint('lx-line', 'line-color')).toBe('#FFF59D');
    await page.locator('#f-lxWidth').fill('3');
    await page.locator('#a-cancel').click();
    await expect(page.locator('#mp-title')).toHaveText('속성 조회');
    expect(await paint('lx-line', 'line-width')).toBe(1);
    expect(await page.evaluate(() => localStorage.getItem('lx-map-props'))).toBeNull();

    await page.locator('#a-edit').click();
    await page.locator('#f-lxWidth').fill('2');
    await page.locator('input[name="f-baseMap"][value="night"]').check();
    await page.locator('#a-save').click();
    await expect(say(page)).toHaveText('지도 속성 기본값을 저장했습니다.');
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('lx-map-props')));
    expect(stored).toMatchObject({ lxColor: '#FFF59D', lxWidth: 2, baseMap: 'night', searchStrokeColor: '#FFFFFF', searchWidth: 2, searchFillColor: '#FFFFFF', searchFillOpacity: 12, polyWidth: 2, updater: '관리자' });
    await expect(page.locator('[data-v="lxWidth"]')).toContainText('2 px');
    await expect(page.locator('#v-updater')).toHaveText('관리자');
    await page.reload();
    await page.waitForFunction(() => document.documentElement.dataset.shell === 'ready');
    await expect(page.locator('[data-v="baseMap"]')).toHaveText('야간');
    expect(errs).toEqual([]);
  });
});

test.describe('법전 · 접근성', () => {
  test('라운드 0 · 그림자 0 · 그라디언트 0 · 유리 0 · 글자 바닥 14px · 파란 채움 버튼 0 · 빨강 채움/테두리 0 — 모든 상태', async ({ page }) => {
    test.setTimeout(90000);
    const errs = watch(page);
    const states = [
      [P('users'), async () => { await page.locator('[data-act="approve"]').click(); }],
      [P('users') + '?id=4&hist=login', null],
      [P('users') + '?dept=%EC%82%B0%EB%A6%BC%EA%B3%BC', null],
      [P('notice'), null], [P('notice') + '?id=12&mode=edit', null],
      [P('notice') + '?mode=new', async () => { await page.locator('[data-act="save"]').click(); }],
      [P('inquiry') + '?id=113', null], [P('inquiry') + '?id=115&mode=reply', null],
      [P('faq') + '?id=14', null], [P('faq') + '?id=14&mode=edit', null],
      [P('map'), null], [P('map') + '?mode=edit', null],
    ];
    for (const [u, act] of states) {
      await boot(page, u);
      if (act) await act();
      await page.waitForTimeout(700);
      expect(await page.evaluate(systemCheck), u).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), u + ' 가로 넘침').toBe(true);
    }
    expect(errs).toEqual([]);
  });

  test('1280 · 1920 에서 깨지지 않는다 — 가로 넘침 0 · 작업공간이 화면 안', async ({ page }) => {
    for (const w of [1280, 1920]) {
      await page.setViewportSize({ width: w, height: w === 1280 ? 800 : 1080 });
      for (const f of PAGES) {
        await boot(page, P(f));
        const r = await page.evaluate(() => { const w = document.querySelector('.work').getBoundingClientRect(), f = document.querySelector('#foot').getBoundingClientRect(); return { over: document.documentElement.scrollWidth > innerWidth, bottom: w.bottom <= f.top + 1, right: w.right <= innerWidth }; });
        expect(r, `${f}@${w}`).toEqual({ over: false, bottom: true, right: true });
      }
    }
  });

  test('행 = tabindex 0 + aria-selected · 패싯 = aria-pressed · 토스트 = aria-live · reduced-motion 이면 운동 0', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await boot(page, P('users'));
    expect(await rows(page).evaluateAll((r) => r.every((e) => e.tabIndex === 0 && e.hasAttribute('aria-selected')))).toBe(true);
    expect(await page.locator('[data-facet]').evaluateAll((b) => b.every((e) => e.hasAttribute('aria-pressed')))).toBe(true);
    await expect(page.locator('#say')).toHaveAttribute('aria-live', 'polite');
    expect(await page.evaluate(() => [...document.querySelectorAll('.fband,.filters,.work,#panel-b')].map((e) => getComputedStyle(e).animationName))).toEqual(['none', 'none', 'none', 'none']);
  });
});
