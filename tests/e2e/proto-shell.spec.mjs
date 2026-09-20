import { test, expect } from '@playwright/test';

// 공용 셸 + 부품 — landxi/proto/shell.{js,css} · parts.css · shell-gate.js · shell-demo.html (전수 검토 A4 선택 1)
//  문서   docs/superpowers/proto/2026-09-20-shell-parts-api.md
//  법전   design/system.md — 레일 72 · 마스트헤드 64 · 마진 56 · 라운드 0 · 그림자 0 · 그라디언트 0 · 유리 0 · 바닥 14px
const URL = 'proto/shell-demo.html';
const ACCENT = 'rgb(0, 109, 247)', INK = 'rgb(1, 1, 2)', TINT = 'rgb(232, 241, 255)';
const NETWORK = /Failed to load resource|net::ERR|ERR_|status of 40|status of 50/i;

function watch(page) {
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !NETWORK.test(m.text())) errs.push('console: ' + m.text()); });
  return errs;
}
async function boot(page, url = URL) {
  await page.addInitScript(() => localStorage.setItem('lx_logged_in', '1'));
  await page.goto(url);
  await page.waitForFunction(() => document.documentElement.dataset.shell === 'ready');
}

test.describe('관문', () => {
  test('로그인 전이면 그리기 전에 login.html?next=<파일+쿼리> 로 보낸다', async ({ page }) => {
    await page.goto(URL + '?tab=faq');
    await page.waitForURL(/login\.html/);
    expect(new globalThis.URL(page.url()).searchParams.get('next')).toBe('shell-demo.html?tab=faq');
  });
  test('자리 화면도 같은 관문 · 가입/찾기 화면은 관문도 레일도 없다', async ({ page }) => {
    await page.goto('proto/ximap.html');
    await page.waitForURL(/login\.html\?next=ximap\.html/);
    await page.goto('proto/signup.html');
    await page.waitForFunction(() => document.documentElement.dataset.shell === 'ready');
    expect(page.url()).toContain('signup.html');
    await expect(page.locator('#rail')).toHaveCount(0);
    await expect(page.locator('#page-title')).toBeVisible();
  });
  test('로그아웃 = 세션을 지우고 메인으로', async ({ page }) => {
    await page.addInitScript(() => { if (!sessionStorage.getItem('lx_e2e')) { localStorage.setItem('lx_logged_in', '1'); sessionStorage.setItem('lx_e2e', '1'); } });
    await page.goto(URL);
    await page.waitForFunction(() => document.documentElement.dataset.shell === 'ready');
    await page.locator('#rail > nav .rail-i[data-action="logout"]').click();
    await page.waitForURL(/scrub\/index\.html/);
    expect(await page.evaluate(() => localStorage.getItem('lx_logged_in'))).toBeNull();
  });
});

test.describe('레일', () => {
  test('원본 10메뉴 · 원본 순서 · 전부 진짜 링크 + 로그아웃', async ({ page }) => {
    const errs = watch(page);
    await boot(page);
    const items = await page.locator('#rail a.rail-i').evaluateAll((a) => a.map((e) => [e.innerText.replace(/\s+/g, ' ').trim(), e.getAttribute('href')]));
    expect(items).toEqual([
      ['대시보드', 'dashboard.html'], ['데이터 관리', 'dataset.html'], ['프로젝트', 'ai-project.html'], ['분석 서비스', 'analysis-ai.html'], ['지도 서비스', 'ximap.html'],
      ['서비스 지원', 'notice.html'], ['카드 발행 관리', 'admin-publish.html'], ['생산 관리', 'produce.html'], ['서비스 관리', 'admin-notice.html'], ['MY', 'mypage.html'],
    ]);
    await expect(page.locator('#rail button.rail-i')).toHaveText('로그아웃');
    expect(errs).toEqual([]);
  });
  test('활성 항목은 하나 — aria-current + 잉크 표식', async ({ page }) => {
    await boot(page);
    const cur = page.locator('#rail .rail-i[aria-current="page"]');
    await expect(cur).toHaveCount(1);
    await expect(cur).toHaveAttribute('data-menu', 'support');
    await expect(cur).toHaveCSS('color', INK);
    expect(await page.locator('#rail').evaluate((e) => e.getBoundingClientRect().width)).toBe(72);
    expect(await page.locator('#mast').evaluate((e) => e.getBoundingClientRect().height)).toBe(64);
  });
  test('레일 링크는 실제로 이동한다 — 자리 화면도 같은 레일', async ({ page }) => {
    await boot(page);
    await page.locator('#rail a[data-menu="map"]').click();                // 아직 자리 화면인 메뉴(2026-09-20: 서비스 관리는 구현됨)
    await page.waitForURL(/ximap\.html/);
    await page.waitForFunction(() => document.documentElement.dataset.shell === 'ready');
    await expect(page.locator('#rail a.rail-i')).toHaveCount(10);
    await expect(page.locator('#rail .rail-i[aria-current="page"]')).toHaveAttribute('data-menu', 'map');
    await expect(page.locator('#im')).toBeVisible();                     // 원판 뷰어는 그대로
    await expect(page.locator('.wm')).toHaveText('원판 · 구현 전');
  });
  test('자리 화면 — 썸네일 · 좌우 화살표 키가 산다', async ({ page }) => {
    await boot(page, 'proto/ximap.html');   // 아직 자리 화면인 메뉴
    const first = await page.locator('#ix').innerText();
    await page.keyboard.press('ArrowRight');
    expect(await page.locator('#ix').innerText()).not.toBe(first);
    await page.locator('#th button').first().click();
    await expect(page.locator('#ix')).toHaveText('1');
  });
});

test.describe('MY 플라이아웃', () => {
  test('포커스로 열리고 ↓ 로 들어가 ↑↓ 로 옮기고 Esc 로 MY 에 돌아온다', async ({ page }) => {
    await boot(page);
    const my = page.locator('#rail-my-btn'), fly = page.locator('#rail-my');
    await expect(fly).toBeHidden();
    await my.focus();
    await expect(fly).toBeVisible();
    await expect(my).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('ArrowDown');
    await expect(fly.locator('a')).toBeFocused();
    await expect(fly.locator('a')).toHaveText('마이 페이지');
    await expect(fly.locator('a')).toHaveAttribute('href', 'mypage.html');
    await page.keyboard.press('ArrowDown');
    await expect(fly.locator('button')).toBeFocused();
    await expect(fly.locator('button')).toHaveText('로그아웃');
    await page.keyboard.press('ArrowUp');
    await expect(fly.locator('a')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(fly).toBeHidden();
    await expect(my).toBeFocused();
    await expect(my).toHaveAttribute('aria-expanded', 'false');
  });
  test('Tab 순서 = MY → 마이 페이지 → 로그아웃(플라이아웃) → 로그아웃(레일), 떠나면 닫힌다', async ({ page }) => {
    await boot(page);
    await page.locator('#rail-my-btn').focus();
    await page.keyboard.press('Tab'); await expect(page.locator('#rail-my a')).toBeFocused();
    await page.keyboard.press('Tab'); await expect(page.locator('#rail-my button')).toBeFocused();
    await page.keyboard.press('Tab'); await expect(page.locator('#rail > nav > button.rail-i')).toBeFocused();
    await expect(page.locator('#rail-my')).toBeHidden({ timeout: 2000 });
  });
});

test.describe('마스트헤드 · 제목 행 · 푸터', () => {
  test('경로 · 기준일 · 시연 꼬리표 · H1 파랑 4px 룰 · 탭 활성', async ({ page }) => {
    await boot(page);
    await expect(page.locator('#mast .crumbs li')).toHaveText(['서비스 지원', '부품 견본']);
    await expect(page.locator('#mast-asof')).toHaveText('2026.04.23');
    await expect(page.locator('#mast .tag')).toHaveText('시연');
    const h1 = page.locator('#page-title');
    await expect(h1).toHaveText('서비스 지원');
    await expect(h1).toHaveCSS('font-size', '34px');
    expect(await h1.evaluate((e) => getComputedStyle(e).fontFamily)).toContain('Paperlogy');
    await expect(h1.locator('.rule')).toHaveCSS('border-bottom-width', '4px');
    await expect(h1.locator('.rule')).toHaveCSS('border-bottom-color', ACCENT);
    await expect(page.locator('#page-head .ptabs a')).toHaveText(['공지사항', '자주 묻는 질문', '문의하기', '활용사례', '매뉴얼']);
    await expect(page.locator('#page-head .ptabs a[aria-current="page"]')).toHaveText('공지사항');
    expect(await page.locator('#main').evaluate((e) => parseFloat(getComputedStyle(e).paddingLeft))).toBe(56);
  });
  test('공지 띠(경로를 주지 않은 화면) · 푸터 정본 번호', async ({ page }) => {
    await boot(page);
    await page.evaluate(async () => { const m = await import('./shell.js'); m.mountShell({ active: 'admin', title: '서비스 관리', tabs: m.TABS.admin, tab: 'users', tabStyle: 'line' }); });
    await expect(page.locator('#mast-notice .nt')).toHaveText('고위험 탐지 건 긴급 처리 안내');
    await expect(page.locator('#mast-notice')).toHaveAttribute('href', 'notice.html?notice=8');
    await expect(page.locator('#rail')).toHaveCount(1);                  // 다시 불러도 한 벌
    await expect(page.locator('#foot')).toHaveCount(1);
    await expect(page.locator('#foot-addr')).toContainText('고객센터 063-713-1213, 1216');
    await expect(page.locator('#page-head .ptabs[data-style="line"] a[aria-current="page"]')).toHaveText('사용자 관리');
  });
  test('건너뛰기 링크가 첫 Tab 이고 본문으로 간다', async ({ page }) => {
    await boot(page);
    await page.keyboard.press('Tab');
    await expect(page.locator('.skip')).toBeFocused();
    await expect(page.locator('.skip')).toHaveAttribute('href', '#main');
  });
});

test.describe('토스트 · 모달', () => {
  test('say() — aria-live polite 영역에 말하고 스스로 지운다', async ({ page }) => {
    await boot(page);
    const say = page.locator('#say');
    await expect(say).toHaveAttribute('aria-live', 'polite');
    await expect(say).toHaveAttribute('role', 'status');
    await expect(say).toBeHidden();
    await page.locator('#d-toast').click();
    await expect(say).toContainText('저장했습니다');
    await page.evaluate(async () => { (await import('./shell.js')).say('짧게', 300); });
    await expect(say).toHaveText('짧게');
    await expect(say).toBeHidden({ timeout: 2000 });
  });
  test('openModal — 포커스 가둠 · Esc · 부른 자리로 포커스 · 1px 잉크 테두리 · 블러 0', async ({ page }) => {
    await boot(page);
    const opener = page.locator('#d-modal');
    await opener.click();
    const modal = page.locator('.modal');
    await expect(modal).toBeVisible();
    await expect(modal).toHaveAttribute('role', 'dialog');
    await expect(modal).toHaveAttribute('aria-modal', 'true');
    const labelled = await modal.getAttribute('aria-labelledby');
    await expect(page.locator(`#${labelled}`)).toHaveText('내 디스크 증량 신청');
    await expect(modal).toHaveCSS('border-top-width', '1px');
    await expect(modal).toHaveCSS('border-top-color', INK);
    await expect(modal).toHaveCSS('box-shadow', 'none');
    expect(await page.locator('.scrim').evaluate((e) => getComputedStyle(e).backdropFilter)).toBe('none');
    expect(await page.evaluate(() => document.querySelector('.modal').contains(document.activeElement))).toBe(true);
    for (let i = 0; i < 24; i++) {                                       // 앞으로 한 바퀴 넘게 — 밖으로 새지 않는다
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => document.querySelector('.modal').contains(document.activeElement))).toBe(true);
    }
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Shift+Tab');
      expect(await page.evaluate(() => document.querySelector('.modal').contains(document.activeElement))).toBe(true);
    }
    expect(await page.locator('#rail').evaluate((e) => e.inert)).toBe(true);
    await page.keyboard.press('Escape');
    await expect(modal).toHaveCount(0);
    await expect(page.locator('.scrim')).toHaveCount(0);
    await expect(opener).toBeFocused();
    expect(await page.locator('#rail').evaluate((e) => e.inert)).toBe(false);
  });
  test('confirmDialog — 확인 true · 취소/Esc false, 파괴적 확인은 취소에 포커스', async ({ page }) => {
    await boot(page);
    const ask = (o) => page.evaluate((opt) => { window.__r = 'pending'; import('./shell.js').then((m) => m.confirmDialog(opt)).then((v) => { window.__r = v; }); }, o);
    await ask({ title: '삭제', body: '삭제합니다. 계속하시겠습니까?', okLabel: '삭제', danger: true });
    const dlg = page.locator('.modal[role="alertdialog"]');
    await expect(dlg).toBeVisible();
    await expect(dlg.locator('.modal-f button')).toHaveText(['취소', '삭제']);
    await expect(dlg.locator('.modal-f .btn-br')).toBeFocused();
    await dlg.locator('.modal-f .btn').click();
    await expect.poll(() => page.evaluate(() => window.__r)).toBe(true);
    await ask({ body: '저장할까요?' });
    await expect(dlg.locator('.modal-f .btn')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect.poll(() => page.evaluate(() => window.__r)).toBe(false);
    await ask({ body: '저장할까요?' });
    await page.locator('.scrim').click({ position: { x: 5, y: 5 } });
    await expect.poll(() => page.evaluate(() => window.__r)).toBe(false);
  });
  test('esc() — HTML 을 글자로', async ({ page }) => {
    await boot(page);
    expect(await page.evaluate(async () => (await import('./shell.js')).esc(`<img src=x onerror="a('b')">&`))).toBe('&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;&amp;');
  });
});

test.describe('부품', () => {
  test('표 — 행 고르기(클릭 · ↑↓ · Enter) → 선택 틴트 + 파랑 3px 표식 + 열람 판 갱신', async ({ page }) => {
    await boot(page);
    const rows = page.locator('#d-tbl tbody tr');
    await expect(rows.first()).toHaveAttribute('aria-selected', 'true');
    await expect(rows.first()).toHaveCSS('background-color', TINT);
    expect(await rows.first().locator('td').first().evaluate((e) => { const s = getComputedStyle(e, '::before'); return [s.width, s.backgroundColor]; })).toEqual(['3px', ACCENT]);
    await rows.nth(2).click();
    await expect(rows.nth(2)).toHaveAttribute('aria-selected', 'true');
    await expect(rows.first()).toHaveAttribute('aria-selected', 'false');
    await expect(page.locator('#d-read .panel-t')).toHaveText('이○○');
    await rows.nth(2).focus();
    await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
    await expect(page.locator('#d-read .panel-t')).toHaveText('정○○');
    await expect(page.locator('#d-tbl thead th').first()).toHaveCSS('background-color', TINT);
  });
  test('페이저 — 처음/이전/1/2/다음/마지막 · 페이지 크기 · 총 n건 중 a~b행', async ({ page }) => {
    await boot(page);
    const pg = page.locator('#d-pager');
    await expect(pg.locator('button')).toHaveText(['처음', '이전', '1', '2', '다음', '마지막']);
    await expect(pg.locator('.pager-sum')).toHaveText('총 12건 중 1~8행');
    await expect(pg.getByRole('button', { name: '이전' })).toBeDisabled();
    await pg.getByRole('button', { name: '다음' }).click();
    await expect(pg.locator('.pager-sum')).toHaveText('총 12건 중 9~12행');
    await expect(page.locator('#d-tbl tbody tr')).toHaveCount(4);
    await expect(pg.locator('button[aria-current="page"]')).toHaveText('2');
    await pg.locator('select').selectOption('20');
    await expect(pg.locator('.pager-sum')).toHaveText('총 12건 중 1~12행');
    await expect(page.locator('#d-tbl tbody tr')).toHaveCount(12);
  });
  test('타일 — 하나만 눌림 · 선택 = 틴트 · 큰 숫자 Paperlogy · 조치 = warn', async ({ page }) => {
    await boot(page);
    const tiles = page.locator('#d-band button.tile');
    await tiles.nth(1).click();
    await expect(tiles.nth(1)).toHaveAttribute('aria-pressed', 'true');
    await expect(tiles.nth(0)).toHaveAttribute('aria-pressed', 'false');
    await expect(tiles.nth(1)).toHaveCSS('background-color', TINT);
    await expect(tiles.nth(1).locator('b')).toHaveCSS('color', 'rgb(209, 53, 43)');
    await expect(tiles.nth(0).locator('b')).toHaveCSS('color', ACCENT);
    expect(await tiles.nth(0).locator('b').evaluate((e) => getComputedStyle(e).fontFamily)).toContain('Paperlogy');
  });
  test('버튼 — 1차 = 잉크 채움(파랑 채움 없음) · 2차 = 코너 브래킷 · 글자 수 세기', async ({ page }) => {
    await boot(page);
    await expect(page.locator('#d-save')).toHaveCSS('background-color', INK);
    await expect(page.locator('#d-del')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    expect(await page.locator('#d-del').evaluate((e) => getComputedStyle(e, '::before').clipPath)).toContain('polygon');
    const filledBlue = await page.evaluate((acc) => [...document.querySelectorAll('button, a.btn, [role="button"]')].filter((e) => getComputedStyle(e).backgroundColor === acc).length, ACCENT);
    expect(filledBlue).toBe(0);
    await page.locator('#f-title').fill('공지');
    await expect(page.locator('.cnt[data-for="f-title"]')).toHaveText('2자/200자');
    await page.locator('#f-title').focus();
    await expect(page.locator('#f-title')).toHaveCSS('border-top-color', INK);
  });
});

test.describe('법전 · 접근성', () => {
  test('라운드 0 · 그림자 0 · 그라디언트 0 · 유리 0 · 글자 바닥 14px — 모달을 연 채로 전 요소', async ({ page }) => {
    await boot(page);
    await page.locator('#rail-my-btn').focus();
    await page.locator('#d-toast').click();
    await page.locator('#d-modal').click();
    await expect(page.locator('.modal')).toBeVisible();
    const bad = await page.evaluate(() => {
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
        const hasText = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
        const field = /^(input|select|textarea)$/i.test(e.tagName) && e.type !== 'checkbox' && e.type !== 'radio';
        if ((hasText || field) && parseFloat(getComputedStyle(e).fontSize) < 14) out.push(`font<14 ${name(e)} ${getComputedStyle(e).fontSize}`);
      }
      return out;
    });
    expect(bad).toEqual([]);
  });
  test('포커스 링 = 파랑 2px · 상호작용 요소는 전부 Tab 으로 닿는다', async ({ page }) => {
    await boot(page);
    await page.keyboard.press('Tab'); await page.keyboard.press('Tab');     // skip → 레일 마크
    const ring = await page.evaluate(() => { const s = getComputedStyle(document.activeElement); return [s.outlineStyle, s.outlineWidth, s.outlineColor]; });
    expect(ring).toEqual(['solid', '2px', ACCENT]);

    const expected = await page.evaluate(() => {
      const q = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
      let n = 0; const radios = new Set();
      for (const e of document.querySelectorAll(q)) {
        if (e.closest('[hidden]') || e.offsetParent === null && getComputedStyle(e).position !== 'fixed') continue;
        if (e.tabIndex < 0) continue;
        if (e.type === 'radio') { if (radios.has(e.name)) continue; radios.add(e.name); }
        e.dataset.tabWant = String(++n);
      }
      // 플라이아웃 항목은 MY 에 포커스가 가면 열린다 — 닿아야 하는 목록에 넣는다
      for (const e of document.querySelectorAll('#rail-my a, #rail-my button')) if (!e.dataset.tabWant) e.dataset.tabWant = String(++n);
      return n;
    });
    await page.evaluate(() => { document.activeElement.blur(); window.scrollTo(0, 0); });
    const seen = new Set();
    for (let i = 0; i < expected + 80 && seen.size < expected; i++) {      // 날짜 · 시각 입력은 칸마다 Tab 을 먹는다
      await page.keyboard.press('Tab');
      const k = await page.evaluate(() => document.activeElement?.dataset?.tabWant || '');
      if (k) seen.add(k);
    }
    const missed = await page.evaluate((got) => [...document.querySelectorAll('[data-tab-want]')].filter((e) => !got.includes(e.dataset.tabWant)).map((e) => e.outerHTML.slice(0, 90)), [...seen]);
    expect(missed).toEqual([]);
  });
  test('이름 없는 상호작용 요소 0 · 랜드마크 · 축소 모션이면 전환 0', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await boot(page);
    const nameless = await page.evaluate(() => [...document.querySelectorAll('a[href],button,input,select,textarea')].filter((e) => {
      if (e.closest('[hidden]')) return false;
      const lab = e.getAttribute('aria-label') || e.getAttribute('aria-labelledby') || e.getAttribute('title') || (e.labels && e.labels.length ? 'l' : '') || e.textContent.trim();
      return !lab;
    }).map((e) => e.outerHTML.slice(0, 90)));
    expect(nameless).toEqual([]);
    await expect(page.locator('aside#rail[aria-label="주 메뉴"]')).toHaveCount(1);
    await expect(page.locator('header#mast')).toHaveCount(1);
    await expect(page.locator('main#main')).toHaveCount(1);
    await expect(page.locator('footer#foot')).toHaveCount(1);
    await expect(page.locator('h1')).toHaveCount(1);
    const moving = await page.evaluate(() => [...document.querySelectorAll('.rail-i, .btn, .btn-br, .tile, #d-tbl tbody tr, .ptabs a')].filter((e) => { const s = getComputedStyle(e); return parseFloat(s.transitionDuration) > 0 || s.animationName !== 'none'; }).length);
    expect(moving).toBe(0);
  });
  test('좁은 화면(1024) — 가로 스크롤 없음', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await boot(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
});
