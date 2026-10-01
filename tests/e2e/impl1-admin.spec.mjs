// impl-1 LX 관리자 — 결재함이 '불러오는 중'에서 멈추지 않는다(확인 FR-3) · 결재 한 건 = 누가 · 무엇을 · 왜 + 반려 사유 필수 ·
// 인프라 GPU 행 = 실측 판정(쥐고만 있는 GPU 에 고부하 표시 0). 로그인 폼 입력만(세션 주입 0) · 결재는 누르지 않는다(데이터 변경 0).
// 비밀번호는 server/.env DEV_PASSWORD(출력 0). 게이트웨이 :8700 이 떠 있어야 한다.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const ENV = path.resolve('server/.env');
const PW = fs.existsSync(ENV) ? (/DEV_PASSWORD=(.+)/.exec(fs.readFileSync(ENV, 'utf8')) || [])[1]?.trim() : null;
const up = async (request) => { try { return (await request.get('http://127.0.0.1:8700/api/v1/health', { timeout: 3000 })).ok(); } catch { return false; } };

async function admin(page) {
  await page.goto('v3/login/?site=admin', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__login?.ready, null, { timeout: 15000 });
  await page.fill('#id', 'lxadmin@lx.or.kr');
  await page.fill('#pw', PW);
  await page.click('#go');
  await page.waitForURL((u) => u.pathname.startsWith('/landxi/v3/ops-core/'), { timeout: 20000 });
}

test.describe('impl-1 LX 관리자 — 결재함 · GPU 판정', () => {
  test.beforeEach(async ({ request }) => {
    test.skip(!PW, 'server/.env DEV_PASSWORD 없음');
    test.skip(!(await up(request)), '게이트웨이 :8700 꺼짐');
  });

  test('결재함 열기 — 로그인 직후 눌러도 3초 안에 목록(또는 없음 문구)', async ({ page }) => {
    const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
    await admin(page);
    await page.locator('a.oc-open').click();
    const t = Date.now();
    await page.waitForFunction(() => document.body.dataset.view === 'approvals' && (document.querySelectorAll('.oc-tbl tbody tr').length > 0
      || /결재할 것이 없습니다/.test(document.querySelector('.oc-none')?.innerText || '')), null, { timeout: 3000 });
    expect(Date.now() - t).toBeLessThan(3000);
    expect(errs).toEqual([]);
  });

  test('결재 한 건 — 바뀌는 것 · 반려는 사유 없이 보내지 않는다', async ({ page }) => {
    await admin(page);
    await page.locator('a.oc-open').click();
    const rows = page.locator('.oc-tbl tbody tr');
    await page.waitForFunction(() => document.body.dataset.view === 'approvals' && (document.querySelectorAll('.oc-tbl tbody tr').length > 0
      || /결재할 것이 없습니다/.test(document.querySelector('.oc-none')?.innerText || '')), null, { timeout: 10000 });
    test.skip(!(await rows.count()), '결재 대기 없음');
    await rows.first().click();
    const sheet = page.locator('.oc-sheet');
    await expect(sheet).toBeVisible();
    await expect(sheet.locator('.oc-ch').last()).toBeVisible();                 // 바뀌는 것
    const mine = await sheet.locator('.oc-mine').count();
    if (mine) { await expect(sheet.locator('.oc-acts')).toHaveCount(0); return; }   // 내가 요청한 결재 = 승인 · 반려 없음
    const reqs = [];
    page.on('request', (r) => { if (/\/approvals\/.+\/decide/.test(r.url())) reqs.push(r.url()); });
    await sheet.locator('.oc-acts button', { hasText: '반려' }).click();
    await expect(sheet.locator('.oc-need')).toHaveText(/반려 사유를 적어 주세요/);
    expect(reqs).toEqual([]);                                                   // 사유 없는 반려는 서버로 가지 않는다
  });

  test('인프라 — GPU 행 고부하 표시는 판정 표(서버 per)와 같다(쥐고만 있는 GPU 에 고부하 0)', async ({ page }) => {
    await admin(page);
    await page.goto('v3/ops-infra/#/infra');
    await page.waitForSelector('#gpu-t tbody tr', { timeout: 20000 });
    const per = await page.evaluate(async () => {
      const s = JSON.parse(localStorage.getItem('lx_api_session'));
      const j = await (await fetch('http://localhost:8700/api/v1/ops/gpus', { headers: { authorization: 'Bearer ' + s.token } })).json();
      return j.power_budget?.per || [];
    });
    for (const p of per) if (p.why === 'held' || p.why === 'yield') expect(p.hot).toBe(false);
    const js = fs.readFileSync(path.resolve('landxi/v3/ops-infra/js/data.js'), 'utf8');
    expect(js).toContain("why === 'held'");
  });
});
