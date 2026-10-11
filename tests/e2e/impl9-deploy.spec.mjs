// 구현 9차 · 분석 서비스 배포(10-09 배포-1 · 2 · 3 ⓐ · 5) — 로그인 폼 입력만(세션 주입 0) · 읽기만(분석 · 신청 · 공유를 보내지 않는다) · GPU 0.
// 확인: ① 프로젝트 단계 6 = … 학습 → 추론 → 결과 확인 → 배포 신청(서비스 관리 없음) ② 추론 탭 = 모델 · 영상(프로젝트 · 공유 데이터셋) · 범위 · 결과 목록
//       ③ 배포 신청 = 서버 값 칸 + 메모 한 칸 · 상태 줄 ④ 관리자 '배포' = 배포 신청 · 기관 공유 · 사용 현황(+ 개선 후보) · 공유는 체크 표 하나
//       ⑤ 대시보드 '서비스 사용 현황' 요약 ⑥ 가로 넘침 0 · 콘솔 오류 0 · '결재' · '반려' · '서비스 관리' 0
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { frontDoor } from '../../landxi/v3/kit/lint/forbidden.mjs';

const ENV = path.resolve('server/.env');
const PW = fs.existsSync(ENV) ? (/DEV_PASSWORD=(.+)/.exec(fs.readFileSync(ENV, 'utf8')) || [])[1]?.trim() : null;
const up = async (request) => { try { return (await request.get('http://127.0.0.1:8700/api/v1/health', { timeout: 3000 })).ok(); } catch { return false; } };
const BANNED = ['결재', '반려', '서비스 관리', '발행 요청', '다른 지역에 적용'];
const check = async (page) => {
  const r = await page.evaluate((ban) => ({ ox: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    hits: ban.filter((w) => (document.querySelector('.k-main')?.innerText || '').includes(w)) }), BANNED);
  expect(r.ox).toBeLessThanOrEqual(0);
  expect(r.hits).toEqual([]);
};

test.describe('구현 9차 · 분석 서비스 배포', () => {
  test.beforeEach(async ({ request }) => {
    test.skip(!PW, 'server/.env DEV_PASSWORD 없음');
    test.skip(!(await up(request)), '게이트웨이 :8700 꺼짐');
  });

  test('직원 — 프로젝트 안 추론 · 배포 신청', async ({ page, baseURL }) => {
    test.setTimeout(90000);
    const errs = [];
    page.on('pageerror', (e) => errs.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error' && !/favicon|net::ERR_ABORTED/.test(m.text())) errs.push(m.text()); });
    await frontDoor(page, new URL(baseURL).origin, 'test@lx.or.kr', 'app');
    await page.waitForURL((u) => u.pathname.startsWith('/landxi/v3/lx-console/'), { timeout: 20000 });
    const got = page.waitForResponse((r) => /\/projects\?scope=mine/.test(r.url()) && r.ok(), { timeout: 30000 });
    await page.goto('v3/lx-project/?scope=mine');
    const pr = ((await (await got).json()).items || []).find((p) => p.lead_is_me);
    test.skip(!pr, '내가 프로젝트장인 프로젝트 없음');
    await page.goto(`v3/lx-release/?project=${pr.id}&stage=infer`);
    const bar = page.locator('.k-sub .lxp-bar');
    await expect(bar.locator('.lxp-st')).toHaveText([/데이터 올리기/, /학습데이터 구축/, /^\d?학습$/, /추론/, /결과 확인/, /배포 신청/], { timeout: 20000 });
    await expect(page.locator('.rl-card h2')).toHaveText(['추론', '추론 결과'], { timeout: 20000 });
    await expect(page.locator('.rl-step h3')).toHaveText(['모델', '영상', '범위']);
    await expect(page.locator('.rl-grp')).toHaveText(['프로젝트 영상', '공유 데이터셋']);
    await check(page);
    await page.goto(`v3/lx-release/?project=${pr.id}&stage=publish`);
    await expect(page.locator('.rl-card h2')).toHaveText(['배포 신청', '신청 상태', '지난 판', '공유된 기관'], { timeout: 20000 });
    await expect(page.locator('.rl-dl dt')).toContainText(['서비스', '모델', '정확도', '학습 데이터', '결과 확인', '결과 장면']);
    await expect(page.locator('textarea[aria-label="메모"]')).toHaveCount(1);       // 직원이 적는 것은 메모 한 칸
    await expect(page.locator('.rl-flow li b')).toHaveText(['신청 전', '검토 중', '승인', '거절']);
    await check(page);
    expect(errs).toEqual([]);
  });

  test('관리자 — 배포 세 탭 · 공유 체크 표 · 사용 현황 · 대시보드 요약', async ({ page, baseURL }) => {
    test.setTimeout(90000);
    const errs = [];
    page.on('pageerror', (e) => errs.push(String(e)));
    await frontDoor(page, new URL(baseURL).origin, 'lxadmin@lx.or.kr', 'admin');
    await page.goto('v3/ops-infra/#/deploys');
    await expect(page.locator('#pane-deploys .im-tabs button[data-tab="cat"]')).toBeVisible({ timeout: 20000 });
    const want = ['배포 신청', '기관 공유', '사용 현황', '분야', '개선 후보'];                    // 분야 탭(질문 5 · 원칙 165) — 다른 탭이 더 붙어도 이 순서는 그대로
    expect((await page.locator('#pane-deploys .im-tabs button > span').allTextContents()).filter((t) => want.includes(t))).toEqual(want);
    await expect(page.locator('.rv-pane[data-tab="req"] .rv-card h2').first()).toHaveText('배포 신청', { timeout: 20000 });
    await check(page);
    await page.locator('#pane-deploys .im-tabs button[data-tab="share"]').click();
    await expect(page.locator('.rv-tbl--matrix')).toHaveCount(1, { timeout: 20000 });
    await expect(page.locator('.rv-tbl--matrix tbody input[type=checkbox]').first()).toBeVisible();
    expect(await page.locator('.rv-pane[data-tab="share"] table').count()).toBe(1);           // 공유 상태 표 없음 — 체크 표 하나
    await expect(page.locator('.rv-tbl--matrix tr.rv-gh').first()).toBeVisible();          // 분야 묶음 머리줄(분야 목록 순서)
    await page.locator('#pane-deploys .im-tabs button[data-tab="cat"]').click();
    await expect(page.locator('.rv-tbl--cat tbody tr').first()).toBeVisible({ timeout: 20000 });
    const cats = await page.locator('.rv-tbl--cat .rv-cat-nm b').allTextContents();
    expect(cats.length).toBeGreaterThanOrEqual(5);
    expect(cats).toEqual(expect.arrayContaining(['농지·시설', '환경', '건축·변화', '안전', '해외']));
    await check(page);
    await page.locator('#pane-deploys .im-tabs button[data-tab="usage"]').click();
    await expect(page.locator('.rv-tbl--usage th')).toHaveText(['기관', '서비스', 'LX가 돌린 분석', '기관이 요청한 분석', 'API 호출', '마지막 사용'], { timeout: 20000 });
    await check(page);
    await page.goto('v3/ops-core/');
    await expect(page.locator('.oc-use b')).toHaveText('서비스 사용 현황', { timeout: 30000 });
    expect(errs).toEqual([]);
  });
});
