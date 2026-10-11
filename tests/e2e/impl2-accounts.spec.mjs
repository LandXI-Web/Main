// 구현 2차 T5 계정 — 로그인 '계정 찾기 · 신청' = 가운데 창(오른쪽 서랍 0) · 세 입구(app · admin · gov) · 탭 셋 · Esc · 바깥 · × 로 닫힘 ·
// 임시 비밀번호로 들어오면 새 비밀번호를 정해야 들어감 · LX 관리자 계정 화면 · 기관 관리자 계정 화면. 로그인은 폼 입력만(세션 주입 0).
// 시험 계정은 시험 안에서 만들고(비밀번호도 시험 안에서) 끝에서 지운다. 옛 계정은 관리자 역할로만 쓰고 바꾸지 않는다. 게이트웨이 :8700 필요.
import { test, expect } from '@playwright/test';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { frontDoor } from '../../landxi/v3/kit/lint/forbidden.mjs';

const BASE = 'http://localhost:4173';
const API = 'http://127.0.0.1:8700/api/v1';
const up = async (request) => { try { return (await request.get(API + '/health', { timeout: 3000 })).ok(); } catch { return false; } };
const ipx = () => `2001:db8::${crypto.randomBytes(2).toString('hex')}:${crypto.randomBytes(2).toString('hex')}`;
const newpw = () => 'Ew' + crypto.randomBytes(6).toString('hex') + '3r';
const MADE = [];
function cleanup(logins) {
  if (!logins.length) return;
  execFileSync('python', ['-c', `
import sys, json, psycopg
sys.path.insert(0, 'server')
from landxi_api import config
L = json.loads(sys.argv[1])
c = psycopg.connect(config.PG_ADMIN_DSN, autocommit=True)
ids = [r[0] for r in c.execute("SELECT id FROM lx_users WHERE login = ANY(%s) UNION ALL SELECT id FROM tenant_users WHERE login = ANY(%s)", (L, L)).fetchall()]
c.execute("DELETE FROM sessions WHERE user_id = ANY(%s)", (ids,))
c.execute("DELETE FROM audit_log WHERE (action='login' AND actor = ANY(%s)) OR (action LIKE 'account.%%' AND subject = ANY(%s))", (ids, L))
for t in ("lx_users", "tenant_users", "signup_requests", "reset_requests", "login_failures"): c.execute(f"DELETE FROM {t} WHERE login = ANY(%s)", (L,))
`, JSON.stringify(logins)], { env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
}

test.describe('구현 2차 T5 — 계정 찾기 · 신청 가운데 창', () => {
  test.beforeEach(async ({ request }) => { test.skip(!(await up(request)), '게이트웨이 :8700 꺼짐'); });
  test.afterAll(() => cleanup(MADE.splice(0)));

  /* 입구 셋 — app · admin = Land-XI 로그인(LX 전용 · 원칙 78) · gov = 기관 메인(남원)의 로그인 카드(같은 창 · 기관은 주소가 정해 기관 고르기 0) */
  for (const site of ['app', 'admin', 'gov']) {
    for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      test(`${site} · ${vp.width} — 가운데 창 · 탭 셋 · Esc · 바깥 · ×`, async ({ page }) => {
        const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
        await page.setViewportSize(vp);
        if (site === 'gov') {
          await page.goto(BASE + '/landxi/v3/gov-home/?org=namwon&site=gov', { waitUntil: 'domcontentloaded' });
          await page.waitForSelector('.gh-login .gh-help', { timeout: 30000 });
        } else {
          await page.goto(BASE + '/landxi/v3/login/?site=' + site, { waitUntil: 'domcontentloaded' });
          await page.waitForFunction(() => window.__login?.ready);
        }
        const open = async () => { await page.click(site === 'gov' ? '.gh-login .gh-help' : '#helpBtn'); await page.waitForSelector('.k-md-bg.is-open .k-md[role=dialog][aria-modal=true]'); };
        await open();
        await expect(page.locator('.k-drawer')).toHaveCount(0);                                   // 오른쪽 서랍 0
        const box = await page.locator('.k-md').boundingBox();
        if (vp.width > 640) expect(Math.abs(box.x + box.width / 2 - vp.width / 2)).toBeLessThan(4);   // 가운데
        else expect(box.width).toBeGreaterThan(vp.width - 24);                                        // 휴대폰 = 거의 전체
        await expect(page.locator('.ac-tab')).toHaveText(['가입 신청', '아이디 찾기', '비밀번호 찾기']);
        for (const k of ['signup', 'find', 'reset']) {
          await page.click(`.ac-tab[data-tab="${k}"]`);
          await expect(page.locator(`.ac-tab[data-tab="${k}"]`)).toHaveAttribute('aria-selected', 'true');
          await expect(page.locator(`.ac-pane[data-tab="${k}"]`)).toBeVisible();
        }
        await page.click('.ac-tab[data-tab="signup"]');
        if (site === 'admin') await expect(page.locator('.ac-pane[data-tab="signup"]')).toContainText('LX 관리자 계정은');
        else await expect(page.locator('.ac-pane[data-tab="signup"] input[name=login]')).toBeVisible();
        if (site === 'gov') await expect(page.locator('.ac-pane[data-tab="signup"] select[name=tenant_id]')).toHaveCount(0);   // 기관은 주소가 정한다
        await page.keyboard.press('Escape');
        await expect(page.locator('.k-md-bg')).toHaveCount(0);
        await open();
        await page.mouse.click(4, vp.height - 4);                                                  // 바깥 누르기
        await expect(page.locator('.k-md-bg')).toHaveCount(0);
        await open();
        await page.click('.k-md-x');
        await expect(page.locator('.k-md-bg')).toHaveCount(0);
        expect(errs).toEqual([]);
      });
    }
  }

  test('가입 신청 — 빈 칸은 서버로 보내지 않고 칸을 짚는다 · 보내면 승인 안내', async ({ page }) => {
    const reqs = []; page.on('request', (r) => { if (/\/accounts\/signup$/.test(r.url())) reqs.push(r.url()); });
    await page.goto(BASE + '/landxi/v3/login/?site=app');
    await page.waitForFunction(() => window.__login?.ready);
    await page.click('#helpBtn');
    const pane = page.locator('.ac-pane[data-tab="signup"]');
    await pane.locator('.ac-go').click();
    await expect(pane.locator('.ac-msg')).toHaveText('이름을 적어 주세요');
    await expect(pane.locator('.ac-f[data-f="name"]')).toHaveClass(/bad/);
    expect(reqs).toEqual([]);
    const login = `e2e-${crypto.randomBytes(4).toString('hex')}@lx.or.kr`; MADE.push(login);   // LX 직원 가입 메일은 @lx.or.kr 만(지금 규칙)
    const pw = newpw();
    await pane.locator('input[name=name]').fill('시험 신청');
    await pane.locator('input[name=dept]').fill('시험부');
    await pane.locator('input[name=login]').fill(login);
    await pane.locator('input[name=password]').fill(pw);
    await pane.locator('input[name=password2]').fill(pw);
    await pane.locator('.ac-go').click();
    await expect(pane.locator('.ac-msg')).toHaveText(/동의해야/);
    await pane.locator('input[name=consent]').check();
    await pane.locator('.ac-go').click();
    await expect(pane.locator('.ac-done')).toContainText('승인되면 로그인할 수 있습니다');
    expect(reqs.length).toBe(1);
  });

  test('임시 비밀번호로 들어오면 새 비밀번호를 정해야 들어간다', async ({ page, request }) => {
    const login = `e2e-${crypto.randomBytes(4).toString('hex')}@lx.or.kr`; MADE.push(login);   // LX 직원 가입 메일은 @lx.or.kr 만(지금 규칙)
    const pw = newpw();
    const H = () => ({ 'x-forwarded-for': ipx() });
    expect((await request.post(API + '/accounts/signup', { headers: H(), data: { site: 'app', name: '시험 재설정', login, password: pw, password2: pw, dept: '시험부', consent: true } })).status()).toBe(201);
    const dev = process.env.DEV_PASSWORD;
    test.skip(!dev, 'server/.env DEV_PASSWORD 없음');
    const admin = (await (await request.post(API + '/auth/login', { data: { realm: 'lx', login: 'lxadmin@lx.or.kr', password: dev } })).json()).token;
    const auth = { authorization: 'Bearer ' + admin };
    const sid = (await (await request.get(API + '/accounts/requests?kind=signup', { headers: auth })).json()).items.find((x) => x.login === login).id;
    expect((await request.post(API + `/accounts/signup/${sid}/decide`, { headers: auth, data: { decision: 'approve' } })).ok()).toBe(true);
    await request.post(API + '/accounts/reset-request', { headers: H(), data: { site: 'app', login } });
    const rid = (await (await request.get(API + '/accounts/requests?kind=reset', { headers: auth })).json()).items.find((x) => x.login === login).id;
    const temp = (await (await request.post(API + `/accounts/reset/${rid}/decide`, { headers: auth, data: { decision: 'issue' } })).json()).temp_password;
    await page.goto(BASE + '/landxi/v3/login/?site=app');
    await page.waitForFunction(() => window.__login?.ready);
    await page.fill('#id', login); await page.fill('#pw', temp); await page.press('#pw', 'Enter');
    await expect(page.locator('.k-md .k-md-t')).toHaveText('새 비밀번호 정하기');
    expect(await page.evaluate(() => localStorage.getItem('lx_api_session'))).toBeNull();          // 세션은 아직 없다
    await page.fill('.k-md input[name=password]', 'short1');
    await page.fill('.k-md input[name=password2]', 'short1');
    await page.click('.k-md .ac-go');
    await expect(page.locator('.k-md .ac-msg')).toHaveText('비밀번호는 10자 이상입니다');
    const np = newpw();
    await page.fill('.k-md input[name=password]', np); await page.fill('.k-md input[name=password2]', np);
    await Promise.all([page.waitForURL((u) => u.pathname.startsWith('/landxi/v3/lx-console/'), { timeout: 20000 }), page.click('.k-md .ac-go')]);
  });

  test('LX 관리자 계정 화면 — 탭이 열리고(로그인 기록 · 운영 정보 포함), 관리자 아닌 계정은 못 들어간다', async ({ page, browser }) => {
    test.skip(!process.env.DEV_PASSWORD, 'server/.env DEV_PASSWORD 없음');
    await frontDoor(page, BASE, 'lxadmin@lx.or.kr');
    await page.goto(BASE + '/landxi/v3/ops-accounts/');
    await expect(page.locator('.acc-tab')).toHaveText([/가입 신청/, /비밀번호 재설정/, /저장 용량/, '계정', '부서', '로그인 기록', '로그인 실패', '처리 기록', '운영 정보', /문의/]);   // 문의 탭(받은 문의 · 개수 붙음)은 맨 끝
    for (const k of ['signup', 'reset', 'users', 'logins', 'fails', 'log']) {
      await page.goto(BASE + '/landxi/v3/ops-accounts/#' + k);
      await page.waitForSelector('.acc-card .acc-tbl, .acc-card .k-empty:not([data-kind="loading"])', { timeout: 15000 });
    }
    await page.goto(BASE + '/landxi/v3/ops-accounts/#users');
    await expect(page.locator('.acc-tbl tbody tr').first()).toBeVisible();
    const ctx = await browser.newContext(); const p2 = await ctx.newPage();
    await frontDoor(p2, BASE, 'test@lx.or.kr');
    await p2.goto(BASE + '/landxi/v3/ops-accounts/');
    await p2.waitForURL((u) => u.pathname.startsWith('/landxi/v3/login/'), { timeout: 15000 });
    await ctx.close();
  });

  test('Land-XI 로그인에 기관 모드 없음 — 기관 입구는 기관 메인으로(원칙 78)', async ({ page }) => {
    await page.goto(BASE + '/landxi/v3/login/?site=gov', { waitUntil: 'domcontentloaded' });
    await page.waitForURL((u) => u.pathname.startsWith('/landxi/v3/gov-home/'), { timeout: 15000 });
    await page.goto(BASE + '/landxi/v3/login/?site=app', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__login?.ready);
    await expect(page.locator('#org, #orgRow, select[name=tenant]')).toHaveCount(0);
  });

  test('기관 관리자 계정 화면 — 자기 기관 계정만', async ({ page }) => {
    test.skip(!process.env.DEV_PASSWORD, 'server/.env DEV_PASSWORD 없음');
    await frontDoor(page, BASE, 'lxadmin@lx.or.kr#namwon');
    await page.goto(BASE + '/landxi/v3/gov-accounts/#users');
    await expect(page.locator('.acc-tbl tbody tr').first()).toBeVisible({ timeout: 15000 });
    const orgs = await page.locator('.acc-tbl tbody td:nth-child(3)').allTextContents();
    expect(orgs.length).toBeGreaterThan(0);
    expect(new Set(orgs.map((o) => o.split(' · ')[0])).size).toBe(1);                              // 한 기관
    await expect(page.locator('.acc-tbl tbody tr', { hasText: 'test@lx.or.kr' })).toHaveCount(0);        // LX 계정 0
  });
});
