// 구현 2차 정리 작업(10-01) — 화면 잇기 · LX 관리자는 기관 가입 승인 0 · 기관 한도 표시 0 · 메인 첫 화면. 로그인은 폼 입력만(세션 주입 0).
// 계정: 메일 아이디(원칙 77). 비밀번호는 server/.env DEV_PASSWORD(출력 0). 게이트웨이 :8700 · 개발 서버 :4173.
import { test, expect } from '@playwright/test';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { frontDoor } from '../../landxi/v3/kit/lint/forbidden.mjs';

const BASE = 'http://localhost:4173';
const API = 'http://127.0.0.1:8700/api/v1';
const up = async (request) => { try { return (await request.get(API + '/health', { timeout: 3000 })).ok(); } catch { return false; } };
const MADE = [];
function cleanup(logins) {
  if (!logins.length) return;
  spawnSync('python', ['-c', `
import sys, json
sys.path.insert(0, r"E:/Land-XI 플랫폼/01. 디자인/server")
from landxi_api import config
import psycopg
L = json.loads(sys.argv[1])
with psycopg.connect(config.PG_ADMIN_DSN, autocommit=True) as c:
    c.execute("DELETE FROM signup_requests WHERE login = ANY(%s)", (L,))
    c.execute("DELETE FROM audit_log WHERE action LIKE 'account.%%' AND subject = ANY(%s)", (L,))
`, JSON.stringify(logins)], { env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
}

test.describe('구현 2차 정리 — 화면 잇기 · 계정 · 한도 표시', () => {
  test.beforeEach(async ({ request }) => { test.skip(!process.env.DEV_PASSWORD, 'server/.env DEV_PASSWORD 없음'); test.skip(!(await up(request)), '게이트웨이 :8700 꺼짐'); });
  test.afterAll(() => cleanup(MADE.splice(0)));

  test('LX 관리자 — 메뉴 계정 관리 · 기관 가입 신청은 보기만(승인 · 반려 버튼 0) · 기관 화면에 한도 말 0', async ({ page, request }) => {
    const login = `e2e-cl-${crypto.randomBytes(3).toString('hex')}@namwon.go.kr`; MADE.push(login);
    const pw = 'Cl' + crypto.randomBytes(6).toString('hex') + '7';
    expect((await request.post(API + '/accounts/signup', { headers: { 'x-forwarded-for': `2001:db8::${crypto.randomBytes(2).toString('hex')}` },
      data: { site: 'gov', tenant_id: 'namwon', name: '정리 화면 시험', login, password: pw, password2: pw, dept: '시험과', consent: true } })).status()).toBe(201);
    await frontDoor(page, BASE, 'lxadmin@lx.or.kr', 'admin');
    await page.waitForURL((u) => u.pathname.startsWith('/landxi/v3/ops-core/'), { timeout: 20000 });
    const acc = page.locator('.k-rail a.k-rail-i', { hasText: '계정 관리' });
    await expect(acc).toBeVisible();
    await expect(page.locator('.oc-todo')).not.toContainText('한도');
    await acc.click();
    await page.waitForURL((u) => u.pathname.startsWith('/landxi/v3/ops-accounts/'));
    await page.locator('.acc-tbl tbody tr', { hasText: '정리 화면 시험' }).click();
    await expect(page.locator('.acc-sheet')).toContainText('기관 가입 신청은 그 기관 관리자가 승인합니다');
    await expect(page.locator('.acc-sheet button', { hasText: /^(승인|반려)$/ })).toHaveCount(0);
    await page.goto(BASE + '/landxi/v3/ops-infra/?view=tenants#/tenants');
    await page.waitForSelector('.org .stat', { timeout: 30000 });
    await expect(page.locator('#org')).not.toContainText('한도');
    await expect(page.locator('.llmu')).toContainText('요청 건수');
    await expect(page.locator('.org .adj').first()).toHaveText('공유 영상');
  });

  test('기관 관리자 — 메뉴 분석 의뢰 · 내가 보낸 요청 · 계정 · 서비스 대시보드의 분석 의뢰 · 결과 시점', async ({ page }) => {
    await frontDoor(page, BASE, 'lxadmin@lx.or.kr#namwon');
    await page.waitForURL((u) => u.pathname.startsWith('/landxi/v3/gov-select/'), { timeout: 30000 });
    await page.goto(BASE + '/landxi/v3/gov-select/?list=1');
    for (const t of ['내 서비스', '분석 의뢰', '내가 보낸 요청', '기관 정보', '계정']) await expect(page.locator('.k-rail .k-rail-i', { hasText: t })).toBeVisible();
    const card = (await page.locator('.gs-card .k-sc-go').first().getAttribute('href'));
    await page.goto(BASE + '/landxi/v3/gov-select/' + card);
    const tab = page.locator('.gs-tabs a.gs-tab', { hasText: '분석 의뢰' });
    await expect(tab).toBeVisible({ timeout: 20000 });
    expect(await tab.getAttribute('href')).toMatch(/gov-request\/\?service=/);
    await expect(page.locator('section[aria-label="결과 시점"]')).toBeVisible();
    expect(await page.locator('.k-rail a.k-rail-i', { hasText: '분석 의뢰' }).getAttribute('href')).toMatch(/gov-request\/\?service=/);
    await tab.click();
    await page.waitForURL((u) => u.pathname.startsWith('/landxi/v3/gov-request/'), { timeout: 20000 });
    await expect(page.locator('.k-rail .k-rail-i[aria-current="true"]')).toHaveText(/분석 의뢰/);
    await page.goto(BASE + '/landxi/v3/gov-accounts/');
    await expect(page.locator('.k-rail .k-rail-i[aria-current="true"]')).toHaveText(/계정/);
  });

  test('알림 칸 — 가입 신청이 기관 관리자 알림에 · 누르면 계정 화면', async ({ page, request }) => {
    const login = `e2e-cl-${crypto.randomBytes(3).toString('hex')}@namwon.go.kr`; MADE.push(login);
    const pw = 'Cl' + crypto.randomBytes(6).toString('hex') + '7';
    expect((await request.post(API + '/accounts/signup', { headers: { 'x-forwarded-for': `2001:db8::${crypto.randomBytes(2).toString('hex')}` },
      data: { site: 'gov', tenant_id: 'namwon', name: '정리 알림 시험', login, password: pw, password2: pw, dept: '시험과', consent: true } })).status()).toBe(201);
    await frontDoor(page, BASE, 'lxadmin@lx.or.kr#namwon');
    await page.waitForURL((u) => u.pathname.startsWith('/landxi/v3/gov-select/'), { timeout: 30000 });
    await page.locator('.k-bell').click();
    const row = page.locator('.k-bell-i--x[data-kind="signup"]');
    await expect(row).toContainText('가입 신청');
    await row.click();
    await page.waitForURL((u) => u.pathname.startsWith('/landxi/v3/gov-accounts/'), { timeout: 20000 });
  });

  test('메인 — 로그인한 LX 계정이면 로그인 자리가 내 화면으로(자동 이동 0)', async ({ page }) => {
    await page.goto(BASE + '/landxi/v3/main/');
    await expect(page.locator('.m-word')).toHaveText('LAND-XI PLATFORM');
    await expect(page.locator('a[data-login]').first()).toHaveText('로그인');
    await frontDoor(page, BASE, 'test@lx.or.kr', 'app');
    await page.goto(BASE + '/landxi/v3/main/');
    await expect(page.locator('a[data-login]').first()).toHaveText('내 화면으로', { timeout: 15000 });
    expect(new URL(page.url()).pathname).toBe('/landxi/v3/main/');
    expect(new URL(await page.locator('a[data-login]').first().evaluate((a) => a.href)).pathname).toBe('/landxi/v3/lx-console/');
  });
});
