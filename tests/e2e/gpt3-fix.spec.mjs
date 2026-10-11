// 바퀴 4-1 외부 검수 보완(GPT 전수 검사 바퀴 3) — 로그인 폼만(세션 주입 0).
// GPT3-1 기관 분석 요청: 파일 올리기 칸 0 · LX 영상 하나 고르기 · 바뀐 이유 한 줄(원칙 179 · 185) — 서버도 막음(pytest test_tenant_upload_closed)
// GPT3-2 서비스 필지 목록: 그 서비스의 AI 분석 결과만(대시보드 큰 숫자와 같은 수) · '의심' · '무허가 건축 의심' 0(원칙 135) · 행 → 상세
//        통계·보고서 읍면별 표도 같은 출처(전체 줄 = 같은 수)
import { test, expect } from '@playwright/test';
import { frontDoor } from '../../landxi/v3/kit/lint/forbidden.mjs';

const BASE = process.env.LX_BASE || 'http://127.0.0.1:4173';
const up = async (request) => { try { return (await request.get('http://127.0.0.1:8700/api/v1/health', { timeout: 3000 })).ok(); } catch { return false; } };

test.describe('GPT3 외부 검수 보완 — 기관 화면', () => {
  test.describe.configure({ mode: 'serial', timeout: 120000 });
  test.beforeAll(async ({ request }) => { test.skip(!(await up(request)), '게이트웨이 :8700 꺼짐'); });

  test('GPT3-1 분석 요청 — 올리기 칸 0 · LX 영상 하나 고르기 · 촬영 요청은 그대로', async ({ page }) => {
    const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
    await frontDoor(page, BASE, 'lxadmin@lx.or.kr#namwon');
    const origin = new URL(page.url()).origin;
    await page.goto(origin + '/landxi/v3/gov-request/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.gq-cards .k-sc', { timeout: 30000 });
    const pane = page.locator('.gq-grid > .gq-col').first();
    await expect(page.locator('#drop, .gq input[type=file]')).toHaveCount(0);
    await expect(pane).not.toContainText(/우리 영상 파일|여러 장|끌어 놓/);
    await expect(pane).toContainText('보안 검토 전이라 지금은 LX가 가진 영상으로 분석합니다');
    const rows = page.locator('#shared .gq-sr[role=radio]');
    expect(await rows.count()).toBeGreaterThan(0);
    await rows.nth(0).click();
    await expect(rows.nth(0)).toHaveAttribute('aria-checked', 'true');
    if (await rows.count() > 1) {                                                        // 하나만 — 다른 영상을 고르면 앞의 것은 풀린다
      await rows.nth(1).click();
      await expect(page.locator('#shared .gq-sr[aria-checked=true]')).toHaveCount(1);
    }
    await expect(page.locator('#ok-1')).toContainText('영상 준비됨');
    await page.locator('.gq-tabs [data-tab=shoot]').click();
    await expect(page.locator('#shoot')).toBeVisible();
    expect(errs).toEqual([]);
  });

  test('GPT3-2 경작·휴경 필지 목록 — 그 서비스 결과만 · 대시보드와 같은 수 · 의심 0 · 행 → 상세', async ({ page }) => {
    const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
    await frontDoor(page, BASE, 'lxadmin@lx.or.kr#namwon');
    const origin = new URL(page.url()).origin;
    await page.goto(origin + '/landxi/v3/gov-select/?service=card-farm', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__govSelect?.ready && window.__govSelect.view === 'svc', null, { timeout: 30000 });
    const v = Number(await page.locator('.gd-scene').getAttribute('data-v'));
    expect(v).toBeGreaterThan(0);
    await page.locator('.gs-tabs a', { hasText: '필지 목록' }).click();
    await page.waitForURL((u) => u.pathname.startsWith('/landxi/v3/gov-report/') && u.searchParams.get('service') === 'card-farm');
    await page.waitForSelector('#sus-table tbody tr', { timeout: 30000 });
    await expect(page.locator('#tab-sus')).toHaveText('필지 목록');
    await expect(page.locator('#tab-todo')).toBeHidden();
    await expect(page.locator('#sus-big')).toHaveAttribute('data-state', 'ok');
    expect(Number(await page.locator('#sus-big').getAttribute('data-v'))).toBe(v);   // 숫자 한 출처(대시보드 큰 숫자)
    const board = page.locator('.gr-board');
    await expect(board).not.toContainText(/의심|무허가|현장\s*확인/);
    const cls = await page.locator('#sus-table tbody tr td:nth-child(4)').allInnerTexts();
    expect(cls.every((t) => /경작지|비경작지/.test(t))).toBe(true);                    // 이 서비스의 AI 분석 결과만
    await page.locator('#sus-table tbody tr').first().click();
    await expect(page.locator('#det')).toBeVisible();
    await expect(page.locator('#verdict')).toBeHidden();                                 // 판정 · 조치 없음(원칙 135)
    await expect(page.locator('#det-m')).toContainText('AI 분석 넓이');
    /* 통계·보고서 읍면별 — 같은 출처 · 전체 줄 = 같은 수 · '의심' 칸 없음 */
    await page.goto(origin + '/landxi/v3/gov-select/?service=card-farm&tab=stats', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.gs-tbl tr.is-total', { timeout: 30000 });
    expect(Number((await page.locator('.gs-tbl tr.is-total td.num').first().innerText()).replace(/\D/g, ''))).toBe(v);
    await expect(page.locator('main')).not.toContainText(/의심|우선순위 A/);
    expect(errs).toEqual([]);
  });
});
