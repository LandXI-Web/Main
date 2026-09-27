// v3 통합(F3 최종 명세 §0) — 정문 로그인 폼 입력만으로(세션 주입 0) 역할별 집 착지 · 집 사이 이동 · 게스트 메인 → 정문 · 관문.
// 비밀번호는 server/.env DEV_PASSWORD(출력 0). 게이트웨이 :8700 이 떠 있어야 한다(server/start-landxi.ps1).
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const ENV = path.resolve('server/.env');
const PW = fs.existsSync(ENV) ? (/DEV_PASSWORD=(.+)/.exec(fs.readFileSync(ENV, 'utf8')) || [])[1]?.trim() : null;
const up = async (request) => { try { return (await request.get('http://127.0.0.1:8700/api/v1/health', { timeout: 3000 })).ok(); } catch { return false; } };

async function signIn(page, { tab = 'staff', id, pw = PW, org = null }) {
  await page.goto('v3/login/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__login?.ready, null, { timeout: 15000 });
  await page.locator(`.seg__c:has(input[value="${tab}"])`).click();
  if (org) await page.selectOption('#org', org);
  await page.fill('#id', id);
  await page.fill('#pw', pw);
  await page.click('#go');
}

test.describe('v3 통합 — 정문 · 착지 · 이동', () => {
  test.beforeEach(async ({ request }) => {
    test.skip(!PW, 'server/.env DEV_PASSWORD 없음');
    test.skip(!(await up(request)), '게이트웨이 :8700 꺼짐');
  });

  test('landxi 첫 주소 → 게스트 메인 → 정문', async ({ page }) => {
    await page.goto('index.html');
    await page.waitForURL(/\/landxi\/v3\/main\/$/);
    const login = page.locator('a[data-login]').first();
    await expect(login).toHaveAttribute('href', '/landxi/v3/login/');
    await page.goto(await login.getAttribute('href'));
    await expect(page.locator('#form')).toBeVisible();
  });

  const LAND = [
    ['LX 직원', { id: 'lx-staff' }, '/landxi/v3/lx-console/'],
    ['LX 관리자', { tab: 'admin', id: 'lx-admin' }, '/landxi/v3/ops-core/'],
    ['LX 영업', { id: 'lx-sales' }, '/landxi/v3/sales/'],
    ['지자체 공무원', { tab: 'tenant', id: 'namwon-manager', org: 'namwon' }, '/landxi/v3/gov-fusion/'],
    ['해외 기관', { tab: 'tenant', id: 'kgz-agri-manager', org: 'kgz-agri' }, '/landxi/v3/global/'],
  ];
  for (const [name, who, dest] of LAND) {
    test(`정문 폼 → ${name} 집`, async ({ page }) => {
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

  test('틀린 비밀번호 — 거절 · 세션 0', async ({ page }) => {
    await signIn(page, { id: 'lx-staff', pw: 'wrong-pass-1' });
    await expect(page.locator('#msg')).toHaveText('아이디 또는 비밀번호가 맞지 않습니다');
    expect(await page.evaluate(() => localStorage.getItem('lx_api_session'))).toBeNull();
  });

  test('세션 없이 집 주소 → 정문 ?next=', async ({ page }) => {
    await page.goto('v3/lx-console/');
    await page.waitForURL(/\/landxi\/v3\/login\/\?next=/);
  });

  test('오픈 리다이렉트 0 — 바깥 next 는 버리고 제 집으로', async ({ page }) => {
    await page.goto('v3/login/?next=' + encodeURIComponent('//example.com/x'));
    await page.waitForFunction(() => window.__login?.ready);
    await page.fill('#id', 'lx-staff'); await page.fill('#pw', PW); await page.click('#go');
    await page.waitForURL((u) => u.pathname.startsWith('/landxi/v3/lx-console/'), { timeout: 20000 });
  });

  test('기관 세션은 LX 집에 못 들어간다', async ({ page }) => {
    await signIn(page, { tab: 'tenant', id: 'namwon-manager', org: 'namwon' });
    await page.waitForURL((u) => u.pathname.startsWith('/landxi/v3/gov-fusion/'), { timeout: 20000 });
    await page.goto('v3/lx-console/');
    await page.waitForURL(/\/landxi\/v3\/login\//, { timeout: 15000 });
  });

  test('LX 직원 — 집 사이 이동(콘솔 → 반입 → XI맵)', async ({ page }) => {
    await signIn(page, { id: 'lx-staff' });
    await page.waitForURL((u) => u.pathname.startsWith('/landxi/v3/lx-console/'), { timeout: 20000 });
    for (const house of ['lx-ingest', 'lx-train', 'lx-review', 'lx-deploy', 'xi-clean']) {
      await page.goto(`v3/${house}/`);
      await page.waitForTimeout(800);
      expect(new URL(page.url()).pathname.startsWith(`/landxi/v3/${house}/`)).toBe(true);
    }
  });

  test('관리자 — 관제 → 인프라 이동', async ({ page }) => {
    await signIn(page, { tab: 'admin', id: 'lx-admin' });
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
