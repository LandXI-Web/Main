// v3 통합(F3 최종 명세 §0) — 로그인 폼 입력만으로(세션 주입 0) 역할별 첫 화면 · 화면 사이 이동 · 게스트 메인 → 로그인 · 관문.
// 입구 셋(확인 대장 6·7): 역할 탭 없음 — 이 PC 에서는 ?site=app|admin|gov 로 입구를 연다(바깥 주소는 주소가 입구).
// 비밀번호는 server/.env DEV_PASSWORD(출력 0). 게이트웨이 :8700 이 떠 있어야 한다(server/start-landxi.ps1).
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const ENV = path.resolve('server/.env');
const PW = fs.existsSync(ENV) ? (/DEV_PASSWORD=(.+)/.exec(fs.readFileSync(ENV, 'utf8')) || [])[1]?.trim() : null;
const up = async (request) => { try { return (await request.get('http://127.0.0.1:8700/api/v1/health', { timeout: 3000 })).ok(); } catch { return false; } };

async function signIn(page, { site = 'app', id, pw = PW, org = null }) {
  await page.goto(`v3/login/?site=${site}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__login?.ready, null, { timeout: 15000 });
  if (org) await page.selectOption('#org', org);
  await page.fill('#id', id);
  await page.fill('#pw', pw);
  await page.click('#go');
}

test.describe('v3 통합 — 로그인 · 첫 화면 · 이동', () => {
  test.beforeEach(async ({ request }) => {
    test.skip(!PW, 'server/.env DEV_PASSWORD 없음');
    test.skip(!(await up(request)), '게이트웨이 :8700 꺼짐');
  });

  test('landxi 첫 주소 → 게스트 메인 → 로그인', async ({ page }) => {
    await page.goto('index.html');
    await page.waitForURL(/\/landxi\/v3\/main\/$/);
    const login = page.locator('a[data-login]').first();
    // 상대경로(GitHub Pages /Main/ 아래에서도 동작) — 해석된 주소로 확인한다
    const href = await login.evaluate((a) => a.href);
    expect(new URL(href).pathname).toMatch(/\/landxi\/v3\/login\/$/);
    await page.goto(href);
    await expect(page.locator('#form')).toBeVisible();
  });

  const LAND = [
    ['LX 직원', { id: 'lx-staff' }, '/landxi/v3/lx-console/'],
    ['LX 관리자', { site: 'admin', id: 'lx-admin' }, '/landxi/v3/ops-core/'],
    ['LX 영업', { id: 'lx-sales' }, '/landxi/v3/sales/'],
    ['지자체 공무원', { site: 'gov', id: 'namwon-manager', org: 'namwon' }, '/landxi/v3/gov-select/'],   // 기관 첫 화면 = 서비스 선택(구현 2차 T3)
    ['해외 기관', { site: 'gov', id: 'kgz-agri-manager', org: 'kgz-agri' }, '/landxi/v3/global/'],
    // lxadmin 한 계정으로 세 입구(확인 대장 7) — app → LX 직원 · admin → LX 관리자 · gov → 고른 기관
    ['lxadmin · 메인 입구', { site: 'app', id: 'lxadmin' }, '/landxi/v3/lx-console/'],
    ['lxadmin · 관리자 입구', { site: 'admin', id: 'lxadmin' }, '/landxi/v3/ops-core/'],
    ['lxadmin · 기관 입구(남원)', { site: 'gov', id: 'lxadmin', org: 'namwon' }, '/landxi/v3/gov-select/'],
  ];
  for (const [name, who, dest] of LAND) {
    test(`로그인 폼 → ${name} 첫 화면`, async ({ page }) => {
      const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
      await signIn(page, who);
      await page.waitForURL((u) => u.pathname.startsWith(dest), { timeout: 20000 });
      const sess = await page.evaluate(() => JSON.parse(localStorage.getItem('lx_api_session') || 'null'));
      expect(sess?.token).toBeTruthy();
      await page.waitForTimeout(1500);
      expect(new URL(page.url()).pathname.startsWith(dest)).toBe(true);   // 관문이 되돌리지 않았다
      expect(errs).toEqual([]);
    });
  }

  test('역할 탭 없음 — 입구가 모습을 정한다(app·admin = 아이디·비밀번호 · gov = 기관 + 아이디·비밀번호)', async ({ page }) => {
    for (const [site, org, label] of [['app', false, ''], ['admin', false, 'LX 관리자'], ['gov', true, '기관']]) {
      await page.goto(`v3/login/?site=${site}`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.__login?.ready, null, { timeout: 15000 });
      expect(await page.evaluate(() => window.__login.site())).toBe(site);
      await expect(page.locator('input[type=radio], [role=tab], .seg__c')).toHaveCount(0);
      await expect(page.locator('#orgRow')).toBeVisible({ visible: org });
      await expect(page.locator('#id')).toBeVisible();
      await expect(page.locator('#pw')).toBeVisible();
      if (label) await expect(page.locator('#site')).toHaveText(label); else await expect(page.locator('#site')).toBeHidden();
      await expect(page.locator('.door__h')).toHaveText('AI 기반 국토정보통합조사');   // 확정 문구 그대로(원칙 29·31)
    }
  });

  test('관리자 입구에 관리자 아닌 계정 — 서버가 거절 · 세션 0', async ({ page }) => {
    await signIn(page, { site: 'admin', id: 'lx-staff' });
    await expect(page.locator('#msg')).toHaveText('관리자 계정이 아닙니다');
    expect(await page.evaluate(() => localStorage.getItem('lx_api_session'))).toBeNull();
    expect(new URL(page.url()).pathname).toBe('/landxi/v3/login/');
  });

  test('서버가 정본 — 입구별 문(realm) · 관리자 입구 확인', async ({ request }) => {
    const post = (data) => request.post('http://127.0.0.1:8700/api/v1/auth/login', { data: { ...data, password: PW } });
    const bye = async (r) => { const j = await r.json(); if (j.token) await request.post('http://127.0.0.1:8700/api/v1/auth/logout', { headers: { authorization: 'Bearer ' + j.token } }); return j; };
    let r = await post({ site: 'admin', realm: 'lx', login: 'lx-staff' });
    expect(r.status()).toBe(403); expect((await bye(r)).token).toBeUndefined();
    r = await post({ site: 'app', realm: 'tenant', tenant_id: 'namwon', login: 'lxadmin' });
    expect(r.status()).toBe(400);
    r = await post({ site: 'gov', realm: 'lx', login: 'lxadmin' });
    expect(r.status()).toBe(400);
    r = await post({ site: 'gov', realm: 'tenant', tenant_id: 'namwon', login: 'lxadmin' });
    expect(r.status()).toBe(200); expect((await bye(r)).realm).toBe('tenant');
    r = await post({ site: 'admin', realm: 'lx', login: 'lxadmin' });
    expect(r.status()).toBe(200); expect((await bye(r)).role).toBe('admin');
    r = await post({ realm: 'lx', login: 'lx-staff' });                          // 입구 없는 옛 도구 — realm 그대로
    expect(r.status()).toBe(200); await bye(r);
  });

  test('화면 코드가 늦게 올라와도 먼저 누른 로그인이 오류 화면(405)으로 가지 않는다', async ({ page }) => {
    await page.route('**/v3/login/auth.js', async (route) => { await new Promise((r) => setTimeout(r, 3000)); await route.continue(); });
    await page.goto('v3/login/?site=app', { waitUntil: 'commit' });              // 모듈은 DOMContentLoaded 를 붙잡으므로 그 전에 누른다
    await page.waitForSelector('#pw', { state: 'attached' });
    await page.fill('#id', 'lx-staff'); await page.fill('#pw', PW);
    await page.press('#pw', 'Enter');
    expect(await page.evaluate(() => [window.__lxSubmit, !!window.__login])).toEqual([1, false]);   // 화면 코드 전 — 막아 두었다
    await page.waitForURL((u) => u.pathname.startsWith('/landxi/v3/lx-console/'), { timeout: 30000 });
  });

  test('틀린 비밀번호 — 거절 · 세션 0', async ({ page }) => {
    await signIn(page, { id: 'lx-staff', pw: 'wrong-pass-1' });
    await expect(page.locator('#msg')).toHaveText('아이디 또는 비밀번호가 맞지 않습니다');
    expect(await page.evaluate(() => localStorage.getItem('lx_api_session'))).toBeNull();
  });

  test('세션 없이 화면 주소 → 로그인 ?next=', async ({ page }) => {
    await page.goto('v3/lx-console/');
    await page.waitForURL(/\/landxi\/v3\/login\/\?next=/);
  });

  test('오픈 리다이렉트 0 — 바깥 next 는 버리고 제 집으로', async ({ page }) => {
    await page.goto('v3/login/?next=' + encodeURIComponent('//example.com/x'));
    await page.waitForFunction(() => window.__login?.ready);
    await page.fill('#id', 'lx-staff'); await page.fill('#pw', PW); await page.click('#go');
    await page.waitForURL((u) => u.pathname.startsWith('/landxi/v3/lx-console/'), { timeout: 20000 });
  });

  test('기관 세션은 LX 화면에 못 들어간다', async ({ page }) => {
    await signIn(page, { site: 'gov', id: 'namwon-manager', org: 'namwon' });
    await page.waitForURL((u) => u.pathname.startsWith('/landxi/v3/gov-select/'), { timeout: 20000 });
    await page.goto('v3/lx-console/');
    await page.waitForURL(/\/landxi\/v3\/login\//, { timeout: 15000 });
  });

  test('LX 직원 — 화면 사이 이동(대시보드 → 데이터 올리기 → XI맵)', async ({ page }) => {
    await signIn(page, { id: 'lx-staff' });
    await page.waitForURL((u) => u.pathname.startsWith('/landxi/v3/lx-console/'), { timeout: 20000 });
    for (const house of ['lx-ingest', 'lx-train', 'lx-review', 'lx-deploy', 'xi-clean']) {
      await page.goto(`v3/${house}/`);
      await page.waitForTimeout(800);
      expect(new URL(page.url()).pathname.startsWith(`/landxi/v3/${house}/`)).toBe(true);
    }
  });

  test('관리자 — LX 관리자 대시보드 → 인프라 이동', async ({ page }) => {
    await signIn(page, { site: 'admin', id: 'lx-admin' });
    await page.waitForURL((u) => u.pathname.startsWith('/landxi/v3/ops-core/'), { timeout: 20000 });
    await page.goto('v3/ops-infra/');
    await page.waitForTimeout(800);
    expect(new URL(page.url()).pathname.startsWith('/landxi/v3/ops-infra/')).toBe(true);
  });

  test('구 레일은 v3 집으로만 간다(구 proto 파일은 남김)', async () => {
    const src = fs.readFileSync(path.resolve('landxi/proto/shell.js'), 'utf8');
    const nav = /export const NAV = \[([\s\S]*?)\n\];/.exec(src)[1];
    const hrefs = [...nav.matchAll(/href: ([^,]+),/g)].map((m) => m[1].trim());
    expect(hrefs.length).toBeGreaterThan(10);
    for (const h of hrefs) expect(h).toMatch(/^V3 \+ '/);
    expect(fs.existsSync(path.resolve('landxi/proto/dashboard.html'))).toBe(true);
  });
});
