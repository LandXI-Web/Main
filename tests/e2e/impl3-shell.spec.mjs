// 구현 3차 · LX 직원 메뉴 1안 · 대시보드 1안 · 프로젝트 안 6단계(확인 대장 10차 메뉴-1 ⓐ · 홈-1 · 14차 대시보드-1 ⓐ · 구현 확인 2차 J-1 다시 · 원칙 81 · 99).
// 로그인 폼 입력만(세션 주입 0) · 비밀번호는 server/.env DEV_PASSWORD(출력 0) · 게이트웨이 :8700 이 떠 있어야 한다. 쓰기 0(새 프로젝트 창은 열고 닫기만).
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { frontDoor } from '../../landxi/v3/kit/lint/forbidden.mjs';

const ENV = path.resolve('server/.env');
const PW = fs.existsSync(ENV) ? (/DEV_PASSWORD=(.+)/.exec(fs.readFileSync(ENV, 'utf8')) || [])[1]?.trim() : null;
const up = async (request) => { try { return (await request.get('http://127.0.0.1:8700/api/v1/health', { timeout: 3000 })).ok(); } catch { return false; } };
const MENU = ['대시보드', '프로젝트', '분석하기', 'XI맵', '데이터', '요청함'];   // lx-menu.js 기준(서비스 카드 · 지도 서비스 칸 없음)

test.describe('구현 3차 · LX 직원 메뉴 · 대시보드 · 프로젝트 안 단계', () => {
  test.beforeEach(async ({ request }) => {
    test.skip(!PW, 'server/.env DEV_PASSWORD 없음');
    test.skip(!(await up(request)), '게이트웨이 :8700 꺼짐');
  });

  test('어느 LX 직원 화면이든 같은 왼쪽 메뉴 · 같은 주소 · 그 화면 칸에 불 · 생산 6단계는 메뉴에 없다', async ({ page, baseURL }) => {
    const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
    await frontDoor(page, new URL(baseURL).origin, 'test@lx.or.kr', 'app');
    await page.waitForURL((u) => u.pathname.startsWith('/landxi/v3/lx-console/'), { timeout: 20000 });
    const hrefs = async () => page.locator('.k-rail a.k-rail-i').evaluateAll((as) => as.map((a) => new URL(a.href).pathname));
    await page.locator('.k-rail a.k-rail-i').first().waitFor({ timeout: 20000 });
    const base = await hrefs();
    expect(base).toEqual(['/landxi/v3/lx-console/', '/landxi/v3/lx-project/', '/landxi/v3/lx-analyze/', '/landxi/v3/xi-clean/', '/landxi/v3/lx-ingest/', '/landxi/v3/lx-inbox/']);
    for (const [url, on] of [['v3/lx-console/', '대시보드'], ['v3/lx-project/', '프로젝트'], ['v3/lx-ingest/', '데이터'], ['v3/lx-train/', '프로젝트'],
      ['v3/lx-review/', '프로젝트'], ['v3/lx-deploy/', '프로젝트'], ['v3/lx-inbox/', '요청함']]) {
      await page.goto(url);
      await expect(page.locator('.k-rail a.k-rail-i > span:last-child')).toHaveText(MENU, { timeout: 20000 });   // 이름(요청함 숫자 배지 제외)
      expect(await hrefs(), url).toEqual(base);
      await expect(page.locator('.k-rail .k-rail-i[aria-current="true"] > span:last-child'), url).toHaveText(on);
      for (const old of ['서비스 만들기', '배포', '결과 확인']) await expect(page.locator('.k-rail .k-rail-i', { hasText: old }), url).toHaveCount(0);
      await expect(page.locator('.k-mast .k-bell'), url).toHaveCount(0);           // 알림은 '요청함'(위 머리는 역할 · XI맵 · ? · 나가기)
      await expect(page.locator('.k-mast .k-xi'), url).toHaveCount(0);             // XI맵은 왼쪽 메뉴 칸 — 머리 단추는 뺐다
    }
    expect(errs).toEqual([]);
  });

  test('대시보드 — 지도 없음 · 진행 현황 + 아래 칸 넷 · 요청함 숫자 = 메뉴 숫자(직원-6 4차 · 10-09 한 번에 정리)', async ({ page, baseURL }) => {
    await frontDoor(page, new URL(baseURL).origin, 'test@lx.or.kr', 'app');
    await page.waitForURL((u) => u.pathname.startsWith('/landxi/v3/lx-console/'), { timeout: 20000 });
    await expect(page.locator('.maplibregl-canvas')).toHaveCount(0);
    await expect(page.locator('.ld-card h2')).toHaveText([/^프로젝트 진행 현황/, /^저장 용량/, /^내가 돌린 작업/, /^요청함/, /^공지/]);
    await expect(page.locator('.k-mast')).not.toContainText('AI 기반 국토정보');   // 머리에서 잘려 보이던 부제는 없앴다
    /* 요청함 숫자 셋 — 왼쪽 메뉴 숫자(있으면)는 그 합 */
    const cells = page.locator('.ld-inbox .ld-cell b');
    await expect(cells).toHaveCount(3, { timeout: 20000 });
    const sum = (await cells.allTextContents()).reduce((s, x) => s + (Number(x) || 0), 0);
    const badge = page.locator('.k-rail-i[data-id="inbox"] .k-rail-b');
    if (sum) await expect(badge).toHaveText(String(sum)); else await expect(badge).toHaveCount(0);
  });

  test("'새 프로젝트'는 대시보드(빈 화면)와 메뉴 '프로젝트'에서 같은 창 · 같은 이름(원칙 99)", async ({ page, baseURL }) => {
    await frontDoor(page, new URL(baseURL).origin, 'test@lx.or.kr', 'app');
    await page.waitForURL((u) => u.pathname.startsWith('/landxi/v3/lx-console/'), { timeout: 20000 });
    const fields = async () => page.locator('.lxp-new').evaluate((b) => [b.querySelector('h2').textContent, ...[...b.querySelectorAll('input, button')].map((x) => x.getAttribute('aria-label') || x.textContent.trim())].filter(Boolean));
    await page.goto('v3/lx-project/?new=1');                                  // 대시보드 빈 화면의 '새 프로젝트'가 여는 주소
    await expect(page.locator('.lxp-new h2')).toHaveText('새 프로젝트');
    const a = await fields();
    await page.locator('.lxp-new .lxp-cancel').click();
    await page.goto('v3/lx-console/');
    await page.locator('.k-rail a.k-rail-i[data-id="projects"]').click();
    await page.waitForURL(/\/lx-project\//);
    await page.getByRole('button', { name: '새 프로젝트' }).first().click();
    await expect(page.locator('.lxp-new h2')).toHaveText('새 프로젝트');
    expect(await fields()).toEqual(a);
  });

  test('프로젝트 안 — 마스트 아래 이름 · 단계 6 · 다음 할 일, 단계를 누르면 그 단계 화면이 그 프로젝트 맥락으로', async ({ page, baseURL }) => {
    await frontDoor(page, new URL(baseURL).origin, 'test@lx.or.kr', 'app');
    await page.waitForURL((u) => u.pathname.startsWith('/landxi/v3/lx-console/'), { timeout: 20000 });
    await page.goto('v3/lx-project/?scope=mine');
    const row = page.locator('.lxp-list .sb-tb tbody tr').first();
    const has = await row.waitFor({ timeout: 20000 }).then(() => true).catch(() => false);
    test.skip(!has, '진행 중인 프로젝트 없음');
    const pid = await row.getAttribute('data-id');
    await page.goto('v3/lx-project/?project=' + pid);
    const bar = page.locator('.k-sub .lxp-bar');
    await expect(bar.locator('.lxp-st')).toHaveText([/데이터 올리기/, /학습데이터 구축/, /^\d?학습$/, /결과 확인/, /배포 신청/, /서비스 관리/], { timeout: 20000 });
    await expect(bar.locator('.lxp-st[data-st="now"]')).toHaveCount(1);
    await Promise.all([page.waitForURL((u) => u.pathname.startsWith('/landxi/v3/lx-ingest/'), { timeout: 20000 }), bar.locator('.lxp-st').first().click()]);
    expect(new URL(page.url()).searchParams.get('project')).toBe(pid);
    await expect(page.locator('.k-sub .lxp-bar-name b')).not.toBeEmpty();
    await expect(page.locator('.k-sub .lxp-st').first()).toHaveAttribute('aria-current', 'step');
    await expect(page.locator('.k-rail .k-rail-i[aria-current="true"] > span:last-child')).toHaveText('프로젝트');
    /* 지도 판이 막대 아래 남은 높이를 다 채운다(막대가 늦게 서도 지도가 줄어든 채 남지 않게) */
    await page.waitForTimeout(1500);
    const [mainH, mapH] = await page.evaluate(() => [document.querySelector('.k-main').getBoundingClientRect().height, document.querySelector('.maplibregl-canvas')?.getBoundingClientRect().height || 0]);
    expect(Math.abs(mainH - mapH)).toBeLessThan(4);
  });

  test('프로젝트 안 단계 화면은 그 프로젝트의 것만 — 서비스 관리 표 · 큰 숫자 · 학습 판 · 결과 확인 규칙(프로젝트 밖은 전체)', async ({ page, baseURL }) => {
    await frontDoor(page, new URL(baseURL).origin, 'test@lx.or.kr', 'app');
    await page.waitForURL((u) => u.pathname.startsWith('/landxi/v3/lx-console/'), { timeout: 20000 });
    /* 프로젝트 밖(메뉴 '서비스 카드' 자리) — 전체 배포본 */
    await page.goto('v3/lx-deploy/?tab=ops');
    await page.locator('.dp-ops .k-table tbody tr').first().waitFor({ timeout: 30000 });
    const all = await page.locator('.dp-ops .k-table tbody tr').count();
    /* 공개된 프로젝트 하나 — 서비스 관리 단계 */
    /* 공개된 프로젝트 = 프로젝트 목록(배포 신청 단계) 가운데 지금 단계가 서비스 관리인 것 — 서버 판정 */
    const got = page.waitForResponse((r) => /\/projects\?scope=mine/.test(r.url()) && r.ok(), { timeout: 30000 });
    await page.goto('v3/lx-project/?scope=mine&stage=deploy');
    const pid = ((await (await got).json()).items || []).find((p) => p.stage?.key === 'ops')?.id;
    test.skip(!pid, '공개된 프로젝트 없음');
    await page.goto('v3/lx-project/?project=' + pid);
    await page.locator('.k-sub .lxp-st[data-st="now"]').waitFor({ timeout: 20000 });   // 프로젝트를 읽은 뒤(단계마다 그 대상이 붙은 주소)
    await page.locator('.k-sub .lxp-st').nth(5).click();
    await page.waitForURL((u) => u.pathname.startsWith('/landxi/v3/lx-deploy/'), { timeout: 20000 });
    const card = new URL(page.url()).searchParams.get('card');
    await page.locator('.dp-ops .k-table tbody tr').first().waitFor({ timeout: 30000 });
    const names = await page.locator('.dp-ops .dp-wk').evaluateAll((els) => els.map((e) => e.firstChild.textContent.trim()));
    expect(new Set(names).size, names.join(',')).toBe(1);                    // 그 프로젝트 서비스 하나의 배포본만
    expect(names.length).toBeLessThan(all);
    for (const k of await page.locator('.dp-pin').evaluateAll((els) => els.map((e) => e.dataset.key))) expect(k).toBeTruthy();
    expect(card).toBeTruthy();
    /* 학습 판 — 업무 10 이 아니라 그 프로젝트 한 장 */
    await page.goto('v3/lx-project/?project=' + pid);
    await page.locator('.k-sub .lxp-st[data-st="now"]').waitFor({ timeout: 20000 });
    await page.locator('.k-sub .lxp-st').nth(2).click();
    await page.waitForURL((u) => u.pathname.startsWith('/landxi/v3/lx-train/'), { timeout: 20000 });
    await expect(page.locator('.tr-card')).toHaveCount(1, { timeout: 20000 });
    await expect(page.locator('.tr-title')).toHaveText('학습 · 이 프로젝트 모델');
  });

  test('서비스 관리 지도 — 이름표가 서로 겹치지 않는다(겹치면 하나만 · 점은 그대로)', async ({ page, baseURL }) => {
    await frontDoor(page, new URL(baseURL).origin, 'test@lx.or.kr', 'app');
    await page.waitForURL((u) => u.pathname.startsWith('/landxi/v3/lx-console/'), { timeout: 20000 });
    await page.goto('v3/lx-deploy/?tab=ops');
    await page.locator('.dp-pin').first().waitFor({ timeout: 30000 });
    await page.waitForTimeout(3500);                                     // 카메라가 멈춘 뒤(겹침 정리는 지도가 멈출 때마다)
    const r = await page.evaluate(() => {
      const labs = [...document.querySelectorAll('.dp-pin:not(.no-lab) span')].map((e) => e.getBoundingClientRect()).filter((b) => b.width && b.right > 0 && b.left < innerWidth);
      let n = 0;
      for (let i = 0; i < labs.length; i++) for (let j = i + 1; j < labs.length; j++) { const a = labs[i], b = labs[j]; if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) n++; }
      return { shown: labs.length, pins: document.querySelectorAll('.dp-pin').length, overlaps: n };
    });
    expect(r.overlaps, JSON.stringify(r)).toBe(0);
    expect(r.shown).toBeGreaterThan(0);
  });

  // 원칙 139: 모바일은 지금 고려하지 않는다 — 휴대폰 시험은 건너뛴다(메뉴 이름은 위 데스크톱 시험이 지킨다).
  test.skip('휴대폰(390) — 아래 탭 다섯(대시보드 · 프로젝트 · 분석하기 · 요청함 · 메뉴) · 메뉴에 나머지', async ({ browser, baseURL }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await frontDoor(page, new URL(baseURL).origin, 'test@lx.or.kr', 'app');
    await page.waitForURL((u) => u.pathname.startsWith('/landxi/v3/lx-console/'), { timeout: 20000 });
    const tabs = await page.locator('.k-rail .k-rail-i').evaluateAll((els) => els.filter((e) => getComputedStyle(e).display !== 'none').map((e) => e.querySelector('span:last-child').textContent.trim()));
    expect(tabs).toEqual(['대시보드', '프로젝트', '분석하기', '요청함', '메뉴']);
    await page.locator('.k-rail-more').click();
    await expect(page.locator('.k-more .k-more-i')).toHaveText(['XI맵', '데이터', '도움말', '나가기']);
    await ctx.close();
  });

  test("로그인 소개 그림 — 'Ctrl K' 글자 없음", async ({ page }) => {
    await page.goto('v3/login/');
    await expect(page.locator('#ask')).toHaveCount(1);
    await expect(page.locator('#ask kbd')).toHaveCount(0);
    expect(await page.content()).not.toMatch(/Ctrl\s?K/);
  });
});
