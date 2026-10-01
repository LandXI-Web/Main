// 구현 3차 · 기관 분기 공간 1단(확인 대장 13차 분기-2 · 분기-3 ⓒ 1단 · 8차 API-형식 ⓐ) — 로그인은 폼 입력만(세션 주입 0).
// [기관 분기] 우리 공간: 왼쪽 메뉴 한 칸 · 받은 서비스 탭 · 결과 설명서 여섯 칸 · 내려받기 세 가지(처음 한 번 동의) · 공간 안 알림 · 다른 기관 서비스 0.
// [Land-XI] LX 관리자 대시보드 → 기관 → '기관 공간' 탭: 기관마다 한 줄(받은 1차 서비스 · 최신 판 · 저장 · 방식 · 마지막 갱신) · 서랍(보기만).
// 지역 고정값 대신 두 기관(남원시 · 광주전남)을 같이 본다. 계정 = 메일 아이디 · 비밀번호는 server/.env(출력 0).
import { test, expect } from '@playwright/test';
import { frontDoor, check } from '../../landxi/v3/kit/lint/forbidden.mjs';

const BASE = 'http://localhost:4173';
const API = 'http://127.0.0.1:8700/api/v1';
const up = async (request) => { try { return (await request.get(API + '/health', { timeout: 3000 })).ok(); } catch { return false; } };
const call = (page, path, init = {}) => page.evaluate(async ([p, i]) => {
  const s = JSON.parse(localStorage.getItem('lx_api_session'));
  const r = await fetch('http://localhost:8700/api/v1' + p, { ...i, headers: { 'content-type': 'application/json', authorization: 'Bearer ' + s.token } });
  return { status: r.status, body: await r.json().catch(() => null) };
}, [path, init]);
const words = async (page, sel) => (await page.locator(sel).innerText()).split('\n').flatMap((l) => check(l).map((k) => `${k}: ${l}`));
const SIX = ['무엇이', '어디', '언제', '어떤 형식', '믿을 만한 정도', '버전'];

test.describe('구현 3차 · 기관 분기 공간 1단', () => {
  test.beforeEach(async ({ request }) => { test.skip(!process.env.DEV_PASSWORD, 'server/.env DEV_PASSWORD 없음'); test.skip(!(await up(request)), '게이트웨이 :8700 꺼짐'); });

  for (const [org, card, other] of [['namwon', 'card-farm', 'card-marine'], ['gwangju-jeonnam', 'card-marine', 'card-farm']]) {
    test(`우리 공간 — ${org} · 결과 설명서 여섯 칸 · 내려받기 · 다른 기관 0`, async ({ page }) => {
      test.setTimeout(150000);
      const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
      await frontDoor(page, BASE, 'lxadmin@lx.or.kr', { tenant: org });
      /* 기관 메뉴에 '우리 공간' 한 칸 — 서비스 선택 화면에서 눌러 간다(메뉴와 화면이 한 줄기) */
      await page.goto(BASE + '/landxi/v3/gov-select/?list=1', { waitUntil: 'domcontentloaded' });
      await page.locator('.k-rail-i', { hasText: '우리 공간' }).first().click();
      await page.waitForURL(/\/gov-space\//, { timeout: 30000 });
      await page.waitForSelector('.sp-cell', { timeout: 60000 });
      /* 받은 서비스 탭 = 기관 서비스 선택의 켜진 서비스 */
      const brand = (await call(page, `/brand/${org}`)).body;
      const open = brand.services.filter((s) => s.open).map((s) => s.name);
      expect(await page.locator('.sp-tab').allInnerTexts()).toEqual(open);
      await page.goto(BASE + `/landxi/v3/gov-space/?card=${card}`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.sp-cell', { timeout: 60000 });
      expect(await page.locator('.sp-cell h3').allInnerTexts()).toEqual(SIX);
      await expect(page.locator('.sp-gh h2')).toContainText(/결과 설명서\s*\d+판/);
      await expect(page.locator('.sp-change')).toContainText('바뀐 점');
      /* 숫자 한 출처 — 설명서 결과 수 = 대표 수치 요약 AI 탐지 */
      const sum = (await call(page, `/summary?card=${card}`)).body;
      const det = sum.items.reduce((a, i) => a + (i.metrics.detected.value || 0), 0);
      expect(Number((await page.locator('.sp-big .num').innerText()).replace(/,/g, ''))).toBe(det);
      /* 내려받기 세 가지 — 처음 한 번 동의 창 */
      await expect(page.locator('.sp-file')).toHaveCount(3);
      expect(await words(page, '.sp-page')).toEqual([]);
      const consentBefore = (await call(page, '/spaces/me')).body.consent.done;
      await page.locator('.sp-down button[data-fmt="summary"]').click();
      if (!consentBefore) {
        await expect(page.locator('.k-md')).toContainText('참고자료');
        await page.locator('.k-md button', { hasText: '동의하고 내려받기' }).click();
      }
      const dl = await page.waitForEvent('download', { timeout: 30000 });
      expect(dl.suggestedFilename()).toMatch(/결과설명서\d+판\.json$/);
      /* 다른 기관 서비스 = 없는 서비스(서버가 내주지 않는다) */
      expect((await call(page, `/spaces/me/guides/${other}`)).status).toBe(404);
      await page.goto(BASE + `/landxi/v3/gov-space/?card=${other}`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.sp-cell', { timeout: 60000 });
      expect(new URL(page.url()).searchParams.get('card')).not.toBe(other);   // 받은 서비스로 연다
      expect(errs).toEqual([]);
    });
  }

  test('LX 관리자 — 기관 → 기관 공간 탭 · 기관마다 한 줄 · 서랍(보기만)', async ({ page }) => {
    test.setTimeout(150000);
    const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
    await frontDoor(page, BASE, 'lxadmin@lx.or.kr', 'admin');
    await page.goto(BASE + '/landxi/v3/ops-infra/#/tenants', { waitUntil: 'domcontentloaded' });
    await page.locator('.sp-adm-tabs [data-tab=space]').click();
    await page.waitForSelector('.sp-adm-t tbody tr', { timeout: 60000 });
    expect(page.url()).toContain('#/tenants/space');
    expect(await page.locator('.sp-adm-t thead th').allInnerTexts()).toEqual(['기관', '받은 1차 서비스', '결과 설명서 최신 판', '저장', '방식', '마지막 갱신']);
    const rows = await page.locator('.sp-adm-t tbody tr').evaluateAll((trs) => trs.map((t) => t.dataset.id));
    expect(rows).toEqual(expect.arrayContaining(['namwon', 'gwangju-jeonnam']));
    await expect(page.locator('.sp-adm-t tbody tr[data-id="namwon"]')).toContainText('가벼운 칸');
    /* 저장 = 사용 현황 탭 기관 카드의 '저장'과 같은 값 */
    const v = await page.locator('.sp-adm-t [data-metric="저장"][data-tenant="namwon"]').getAttribute('data-v');
    await page.locator('.sp-adm-tabs [data-tab=use]').click();
    const u = await page.locator('.org[data-id="namwon"] [data-metric="저장"]').getAttribute('data-v');
    expect(Number(v)).toBeCloseTo(Number(u), 2);
    await page.locator('.sp-adm-tabs [data-tab=space]').click();
    await page.locator('.sp-adm-t tbody tr[data-id="namwon"]').click();
    await expect(page.locator('.k-drawer')).toContainText('받은 1차 서비스');
    await expect(page.locator('.k-drawer')).toContainText('판');
    expect(await words(page, '.sp-adm')).toEqual([]);
    expect(errs).toEqual([]);
  });
});
