import { test, expect } from '@playwright/test';

// 세션 계약 · 관문 판정표 — MASTER-PLAN §7.1 · §7.2 (E0-1)
//   화면 4종 × 세션 5종 = 20칸 + 손상 상태 + 계정 전환 + signOut.
//   각 칸은 ① 착지 파일명 ② 튕김(?denied=) 유무 ③ 한 줄 안내(S8) 유무 ④ 안내 뒤 주소에서 denied 제거 를 단언한다.
//   기관(지자체) 계정은 roles.js 와 무관한 **완전 별도** 계정이다(Q1) — lx_tenant_session.

/* ── 역할 픽스처 — 00-COMMON / §7.3 그대로 복사(Wave 0 동안 _roles.mjs import 금지) ── */
const HOME = { admin: 'admin-home.html', staff: 'ai-project.html', sales: 'ximap.html' };
const TENANT_HOME = { namwon: 'portal.html', 'gwangju-jeonnam': 'portal-dp-gj-marine-25.html' };
const TENANT_DOOR = { namwon: 'portal-login-namwon.html', 'gwangju-jeonnam': 'portal-login-gwangju-jeonnam.html' };
/** LX 세션으로 화면을 연다. 세션은 첫 로드에서만 심는다(sessionStorage 가드). */
async function bootAs(page, url, role = 'staff', extra = {}) {
  await page.addInitScript(([r, ex]) => {
    if (sessionStorage.getItem('lx_e2e_boot')) return;
    sessionStorage.setItem('lx_e2e_boot', '1');
    localStorage.setItem('lx_logged_in', '1');
    localStorage.setItem('lx_role', r);
    localStorage.removeItem('lx_tenant_session');
    for (const [k, v] of Object.entries(ex)) (v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v));
  }, [role, extra]);
  await page.goto(url);
  await page.waitForFunction(() => document.documentElement.dataset.shell === 'ready');
}
/** 기관 세션으로 화면을 연다. */
async function bootTenant(page, url, tenant = 'namwon') {
  await page.addInitScript((t) => {
    if (sessionStorage.getItem('lx_e2e_boot')) return;
    sessionStorage.setItem('lx_e2e_boot', '1');
    localStorage.removeItem('lx_logged_in'); localStorage.removeItem('lx_role');
    localStorage.setItem('lx_tenant_session', JSON.stringify({ tenant: t, at: '2026-06-08T09:00:00+09:00' }));
  }, tenant);
  await page.goto(url);
  await page.waitForFunction(() => document.documentElement.dataset.shell === 'ready');
}
/** 같은 탭에서 LX 계정을 바꾼다(역할 전환 e2e). 다음 goto 부터 적용. */
const switchTo = (page, role) => page.evaluate((r) => {
  localStorage.setItem('lx_logged_in', '1'); localStorage.setItem('lx_role', r); localStorage.removeItem('lx_tenant_session');
}, role);

/* ── 이 스펙의 도구 ─────────────────────────────────────────────────────── */
const SESSION_KEYS = ['lx_logged_in', 'lx_role', 'lx_tenant_session'];
const keys = (page) => page.evaluate((ks) => ks.filter((k) => localStorage.getItem(k) !== null), SESSION_KEYS);
const fileOf = (u) => new URL(u).pathname.split('/').pop();

/** 세션을 심는다(판정표 칸 — 착지가 셸 화면이 아닐 수도 있어 bootAs 의 ready 대기를 쓰지 않는다). */
async function seed(page, s) {
  await page.addInitScript((x) => {
    if (sessionStorage.getItem('lx_e2e_boot')) return;
    sessionStorage.setItem('lx_e2e_boot', '1');
    for (const k of ['lx_logged_in', 'lx_role', 'lx_tenant_session']) localStorage.removeItem(k);
    if (x.lx) { localStorage.setItem('lx_logged_in', '1'); localStorage.setItem('lx_role', x.lx); }
    if (x.tenant) localStorage.setItem('lx_tenant_session', JSON.stringify({ tenant: x.tenant, at: '2026-06-08T09:00:00+09:00' }));
  }, s);
}
/** 문서 요청 주소를 전부 적는다 — ?denied= 는 안내 뒤 주소에서 걷히므로 요청 기록으로 확인한다. */
function navLog(page) {
  const urls = [];
  page.on('request', (r) => { if (r.isNavigationRequest() && r.frame() === page.mainFrame()) urls.push(r.url()); });
  return urls;
}

/* ── §7.2 판정표 ─────────────────────────────────────────────────────────
   land   착지 파일 · denied 튕김 여부 · next 로 문에 선 것인지 · 안내 종류('say' = 셸 토스트, 'door' = 문 위 한 줄) */
const SCREENS = ['ximap.html', 'mypage.html', 'portal-dp-nw-farm-25.html', 'portal-dp-gj-marine-25.html'];
const SESSIONS = {
  none: {},
  admin: { lx: 'admin' },
  staff: { lx: 'staff' },
  sales: { lx: 'sales' },
  'tenant:namwon': { tenant: 'namwon' },
};
const pass = (f) => ({ land: f, denied: false, next: false, notice: null });
const TABLE = {
  none: {
    'ximap.html': { land: 'login.html', denied: false, next: 'ximap.html', notice: null },
    'mypage.html': { land: 'login.html', denied: false, next: 'mypage.html', notice: null },
    'portal-dp-nw-farm-25.html': { land: TENANT_DOOR.namwon, denied: false, next: 'portal-dp-nw-farm-25.html', notice: null },
    'portal-dp-gj-marine-25.html': { land: TENANT_DOOR['gwangju-jeonnam'], denied: false, next: 'portal-dp-gj-marine-25.html', notice: null },
  },
  admin: {
    'ximap.html': { land: HOME.admin, denied: true, next: false, notice: 'say' },
    'mypage.html': pass('mypage.html'),
    'portal-dp-nw-farm-25.html': { land: TENANT_DOOR.namwon, denied: true, next: false, notice: 'door' },
    'portal-dp-gj-marine-25.html': { land: TENANT_DOOR['gwangju-jeonnam'], denied: true, next: false, notice: 'door' },
  },
  staff: {
    'ximap.html': pass('ximap.html'),
    'mypage.html': pass('mypage.html'),
    'portal-dp-nw-farm-25.html': { land: TENANT_DOOR.namwon, denied: true, next: false, notice: 'door' },
    'portal-dp-gj-marine-25.html': { land: TENANT_DOOR['gwangju-jeonnam'], denied: true, next: false, notice: 'door' },
  },
  sales: {
    'ximap.html': pass('ximap.html'),
    'mypage.html': pass('mypage.html'),
    'portal-dp-nw-farm-25.html': { land: TENANT_DOOR.namwon, denied: true, next: false, notice: 'door' },
    'portal-dp-gj-marine-25.html': { land: TENANT_DOOR['gwangju-jeonnam'], denied: true, next: false, notice: 'door' },
  },
  'tenant:namwon': {
    'ximap.html': { land: TENANT_HOME.namwon, denied: true, next: false, notice: 'say' },
    'mypage.html': { land: TENANT_HOME.namwon, denied: true, next: false, notice: 'say' },
    'portal-dp-nw-farm-25.html': pass('portal-dp-nw-farm-25.html'),
    'portal-dp-gj-marine-25.html': { land: TENANT_HOME.namwon, denied: true, next: false, notice: 'say' },
  },
};

test.describe('관문 판정표 §7.2 — 세션 5 × 화면 4 = 20칸', () => {
  for (const [sname, s] of Object.entries(SESSIONS)) {
    for (const screen of SCREENS) {
      const want = TABLE[sname][screen];
      test(`${sname} × ${screen} → ${want.land}${want.denied ? ' ?denied' : ''}${want.next ? ' ?next' : ''}`, async ({ page }) => {
        const urls = navLog(page);
        await seed(page, s);
        await page.goto(`proto/${screen}`);
        await page.waitForURL((u) => fileOf(u.href) === want.land, { timeout: 15000 });
        await page.waitForLoadState('domcontentloaded');

        // 요청 기록 — 착지 문서의 쿼리
        const landed = urls.filter((u) => fileOf(u) === want.land).pop();
        expect(landed, `착지 요청 기록 ${urls.join(' → ')}`).toBeTruthy();
        const lq = new URL(landed).searchParams;
        if (want.denied) expect(lq.get('denied')).toBe(screen); else expect(lq.get('denied')).toBeNull();
        if (want.next) expect(lq.get('next')).toBe(want.next); else if (want.land !== screen) expect(lq.get('next')).toBeNull();

        // 안내 한 줄(S8)
        if (want.notice === 'say') {
          await page.waitForFunction(() => document.documentElement.dataset.shell === 'ready');
          await expect(page.locator('#say')).not.toBeEmpty({ timeout: 3000 });
        } else if (want.notice === 'door') {
          await expect(page.locator('#pl-deny')).toHaveText('기관 작업공간은 기관 계정으로만 들어갑니다 — LX 계정은 로그아웃 뒤 기관 아이디로 로그인하세요');
        } else if (want.land === screen) {
          await page.waitForFunction(() => document.documentElement.dataset.shell === 'ready');
          await page.waitForTimeout(250);
          await expect(page.locator('#say')).toBeEmpty();
        }
        // 안내 뒤 주소에서 denied 가 걷힌다(R-S5)
        if (want.denied) await expect.poll(() => new URL(page.url()).searchParams.get('denied')).toBeNull();

        // 판정은 세션을 바꾸지 않는다(손상 상태만 지운다)
        const expectKeys = s.lx ? ['lx_logged_in', 'lx_role'] : s.tenant ? ['lx_tenant_session'] : [];
        expect(await keys(page)).toEqual(expectKeys);
      });
    }
  }
});

test.describe('안내 문구(S8)', () => {
  test('LX 셸 — 화면명 · 허용 역할 · 지금 역할이 한 줄에 선다', async ({ page }) => {
    await bootAs(page, 'proto/ximap.html', 'admin');           // admin → admin-home?denied=ximap.html
    await expect(page).toHaveURL(/admin-home\.html$/);
    await expect(page.locator('#say')).toHaveText('지도 서비스 화면은 LX 직원 · 영업용 계정 전용입니다 — 지금은 LX 관리자로 들어와 있습니다');
  });
  test('기관 포털 — LX 화면이면 "LX 플랫폼 화면", 다른 기관이면 "다른 기관의 작업공간"', async ({ page }) => {
    await bootTenant(page, 'proto/ximap.html', 'namwon');
    await expect(page).toHaveURL(/portal\.html$/);
    await expect(page.locator('#say')).toHaveText('ximap.html은 LX 플랫폼 화면입니다 — 기관 계정은 내 서비스 작업공간에서 씁니다');
    await page.goto('proto/portal-dp-gj-marine-25.html');
    await page.waitForURL(/portal\.html/);
    await page.waitForFunction(() => document.documentElement.dataset.shell === 'ready');
    await expect(page.locator('#say')).toContainText('portal-dp-gj-marine-25.html은 다른 기관의 작업공간입니다');
    await expect(page).toHaveURL(/portal\.html$/);
  });
  test('광주전남 세션이 남원 홈을 두드리면 광주전남 홈으로(타 기관 누출 0 — 반대 방향)', async ({ page }) => {
    const urls = navLog(page);
    await bootTenant(page, 'proto/portal.html', 'gwangju-jeonnam');
    expect(fileOf(page.url())).toBe(TENANT_HOME['gwangju-jeonnam']);
    expect(urls.some((u) => /portal-dp-gj-marine-25\.html\?denied=portal\.html$/.test(u))).toBe(true);
    await expect(page.locator('#say')).toContainText('다른 기관의 작업공간');
  });
});

test.describe('손상 상태 — 두 세션 동시(R-S1 위반)', () => {
  test('LX 화면이든 포털 화면이든 세 키를 전부 지우고 login.html', async ({ page }) => {
    for (const screen of ['ximap.html', 'portal-dp-nw-farm-25.html']) {
      await page.goto('proto/login.html');                       // 같은 출처에서 저장소를 연다
      await page.evaluate(() => {
        localStorage.setItem('lx_logged_in', '1'); localStorage.setItem('lx_role', 'admin');
        localStorage.setItem('lx_tenant_session', JSON.stringify({ tenant: 'namwon', at: '2026-06-08T09:00:00+09:00' }));
      });
      await page.goto(`proto/${screen}`);
      await page.waitForURL((u) => fileOf(u.href) === 'login.html');
      expect(new URL(page.url()).searchParams.get('next'), screen).toBeNull();
      expect(await keys(page), screen).toEqual([]);
    }
  });
});

test.describe('계정 전환 — signIn 규칙(R-S1)', () => {
  test('기관 세션 → LX 직원으로 바꾸면 ximap 이 열리고 lx_tenant_session 은 없다', async ({ page }) => {
    await bootTenant(page, 'proto/portal.html', 'namwon');
    await switchTo(page, 'staff');
    await page.goto('proto/ximap.html');
    await page.waitForFunction(() => document.documentElement.dataset.shell === 'ready');
    expect(fileOf(page.url())).toBe('ximap.html');
    expect(await keys(page)).toEqual(['lx_logged_in', 'lx_role']);
    const rail = await page.$$eval('#rail .rail-i[data-menu]', (a) => a.map((e) => e.dataset.menu));
    expect(rail).toEqual(['dashboard', 'media', 'project', 'analysis', 'map', 'support', 'my']);   // LX 직원 레일(기관 레일 아님)
    await expect(page.locator('#rail[data-tenant]')).toHaveCount(0);
  });
  test('LX 관리자 → 기관 문(?denied) → 기관 아이디로 로그인 → LX 키가 지워지고 두드리던 작업공간으로', async ({ page }) => {
    await seed(page, { lx: 'admin' });
    await page.goto('proto/portal-dp-nw-farm-25.html');
    await page.waitForURL(/portal-login-namwon\.html/);
    await expect(page.locator('#pl-deny')).toBeVisible();
    await expect.poll(() => new URL(page.url()).searchParams.get('denied')).toBeNull();
    await page.locator('#pl-id').fill('namwon-ops');
    await page.locator('#pl-pw').fill('demo');
    await page.locator('#pl-f button[type="submit"]').click();
    await page.waitForURL(/portal-dp-nw-farm-25\.html/);
    await page.waitForFunction(() => document.documentElement.dataset.shell === 'ready');
    expect(await keys(page)).toEqual(['lx_tenant_session']);
    expect(JSON.parse(await page.evaluate(() => localStorage.getItem('lx_tenant_session'))).tenant).toBe('namwon');
    await expect(page.locator('#rail .rail-i')).toHaveText(['내 서비스', '로그아웃']);
  });
  test('기관(남원) → 문에서 로그인 → 홈 → 주소창 ximap → portal.html?denied + 토스트 (여정 ③ 앞부분)', async ({ page }) => {
    const urls = navLog(page);
    await page.goto('proto/portal-login-namwon.html');
    await page.locator('#pl-id').fill('namwon-ops');
    await page.locator('#pl-pw').fill('demo');
    await page.locator('#pl-f button[type="submit"]').click();
    await page.waitForURL(/portal\.html/);
    expect(await keys(page)).toEqual(['lx_tenant_session']);
    await page.goto('proto/ximap.html');
    await page.waitForURL(/portal\.html/);
    await page.waitForFunction(() => document.documentElement.dataset.shell === 'ready');
    expect(urls.some((u) => /portal\.html\?denied=ximap\.html$/.test(u))).toBe(true);
    await expect(page.locator('#say')).toContainText('LX 플랫폼 화면');
    await expect(page).toHaveURL(/portal\.html$/);
  });
});

test.describe('signOut — 세 키 전부 0(R-S2 · C-09)', () => {
  test('기관 레일 로그아웃 → 그 기관의 문 · 세 키 0', async ({ page }) => {
    await bootTenant(page, 'proto/portal.html', 'namwon');
    await page.evaluate(() => { localStorage.setItem('lx_role', 'admin'); });   // 잔존 키가 있어도 지운다
    await page.locator('#rail button[data-action="logout"]').click();
    await page.waitForURL(/portal-login-namwon\.html/);
    expect(await keys(page)).toEqual([]);
  });
  for (const role of ['admin', 'staff', 'sales']) {
    test(`${role} 레일 로그아웃 → login.html · 세 키 0`, async ({ page }) => {
      await bootAs(page, `proto/${HOME[role]}`, role);
      await page.locator('#rail > nav > button.rail-i[data-action="logout"]').click();
      await page.waitForURL((u) => fileOf(u.href) === 'login.html');
      expect(await keys(page)).toEqual([]);
    });
  }
});

/* ── 문 위 안내가 서도 카드가 문을 감싼다(E0-1 재판정 차단 1) · 로그인 단추 테두리가 실제로 그려진다(차단 2) ── */
test.describe('기관 문 — 안내가 서도 카드 안에 들어온다', () => {
  for (const [w, h] of [[1366, 768], [1440, 900], [1920, 1080]]) {
    for (const deny of [true, false]) {
      test(`${w}×${h} · ${deny ? '안내 있음(LX admin → farm-25)' : '안내 없음'} — .pl-form 이 .pl-card 를 넘지 않는다`, async ({ page }) => {
        await page.setViewportSize({ width: w, height: h });
        await seed(page, deny ? { lx: 'admin' } : {});
        await page.goto(deny ? 'proto/portal-dp-nw-farm-25.html' : 'proto/portal-login-namwon.html');
        await page.waitForURL(/portal-login-namwon\.html/);
        await expect(page.locator('#pl-deny')).toHaveCount(deny ? 1 : 0);
        await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => {}))));
        const m = await page.evaluate(() => {
          const card = document.querySelector('.pl-card').getBoundingClientRect();
          const f = document.querySelector('.pl-form');
          const note = document.querySelector('.pl-note').getBoundingClientRect();
          const cap = document.querySelector('.pl-face-c').getBoundingClientRect();
          return { cardH: card.height, cardB: card.bottom, scroll: f.scrollHeight, client: f.clientHeight,
            noteB: note.bottom, capB: cap.bottom, over: document.documentElement.scrollHeight - innerHeight };
        });
        expect(m.scroll).toBeLessThanOrEqual(m.cardH);          // 폼 내용이 카드 높이 안
        expect(m.scroll).toBeLessThanOrEqual(m.client + 1);     // 폼 안에서 숨어 흘러넘치지 않음
        expect(m.noteB).toBeLessThanOrEqual(m.cardB);           // 아래 주석이 카드 바닥 헤어라인 위에 얹히지 않음
        expect(m.capB).toBeLessThanOrEqual(m.cardB + 0.5);      // 얼굴 캡션이 카드 밖으로 나가지 않음
        expect(m.over).toBeLessThanOrEqual(0);                  // 입구는 한 화면(휠 없음)
      });
    }
  }
  test('로그인 단추 — 상징색 테두리 2px + 상징색 글자(shell.css .lx button{border:0} 에 밀리지 않음)', async ({ browser }) => {
    const ctx = await browser.newContext({ baseURL: test.info().project.use.baseURL });
    const page = await ctx.newPage();
    await page.goto('proto/portal-login-namwon.html');
    const s = await page.locator('.pl-b').evaluate((b) => {
      const c = getComputedStyle(b);
      const probe = document.createElement('i'); probe.style.color = 'var(--accent)'; b.after(probe);
      const accent = getComputedStyle(probe).color; probe.remove();
      return { w: c.borderTopWidth, style: c.borderTopStyle, bc: c.borderTopColor, color: c.color, accent };
    });
    await ctx.close();
    expect(s.w).toBe('2px');
    expect(s.style).toBe('solid');
    expect(s.bc).toBe(s.accent);
    expect(s.color).toBe(s.accent);
  });
});
