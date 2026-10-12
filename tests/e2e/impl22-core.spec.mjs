// impl-22 핵심 코어 고리(10-12 12:45 확인 · 원칙 205 · 213 · 217) — GPU 0(학습을 시작하지 않음) · 로그인 폼 입력만.
// 데이터하우스(메뉴 이름 · 학습 데이터 탭 · 영상 · 행정 자료 탭) · 학습 화면 기본 흐름 · 되돌리기 · 'XI맵에서 고친 것 n건' · 'GPU' 글자 0 ·
// LX 관리자 배포 → XI 재학습 · 학습 서식.
import { test, expect } from '@playwright/test';
import { frontDoor } from '../../landxi/v3/kit/lint/forbidden.mjs';

const watch = (page) => { const errs = []; page.on('pageerror', (e) => errs.push(String(e))); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); }); return errs; };

test.describe('impl-22 · 핵심 코어 고리', () => {
  test('LX 직원 — 데이터하우스 · 학습 서식 흐름 · 고친 것 선택지', async ({ page, baseURL }) => {
    const errs = watch(page);
    await frontDoor(page, new URL(baseURL).origin, 'test@lx.or.kr', 'app');
    await page.waitForURL((u) => !/\/login\/?$/.test(u.pathname), { timeout: 20000 });
    await page.goto('v3/lx-ingest/');
    await expect(page.locator('.k-rail .k-rail-i[aria-current="true"] > span:last-child')).toHaveText('데이터하우스', { timeout: 20000 });
    await expect(page.locator('.dh-tabs button')).toHaveText(['학습 데이터', '영상 · 행정 자료']);
    await expect(page.locator('.dh-tbl tbody tr').first()).toBeVisible({ timeout: 20000 });
    await expect(page.locator('.dh-seg button')).toHaveText([/클래스별/, /고친 것/, /승인 대기/]);
    await expect(page.locator('.dh-act button', { hasText: '승인' })).toHaveCount(0);           // 관리 단추는 관리자만
    await page.locator('.dh-tabs button', { hasText: '영상 · 행정 자료' }).click();
    await expect(page.locator('.lxi-pick')).toBeVisible({ timeout: 20000 });

    const url = await page.evaluate(async () => {
      const { api } = await import('/landxi/shared/api-v1.js');
      const j = await api('/projects?scope=all');
      const p = (j.items || []).find((x) => /비닐하우스/.test(x.name)) || (j.items || [])[0];
      return p ? `v3/lx-train/?project=${encodeURIComponent(p.id)}&stage=train` : null;
    });
    test.skip(!url, '프로젝트 없음');
    await page.goto(url);
    await expect(page.locator('.tb-board h1')).toBeVisible({ timeout: 30000 });
    const kinds = () => page.locator('.tb-node').evaluateAll((ns) => ns.map((n) => n.dataset.kind));
    const first = await kinds();
    expect(first.slice(0, 4)).toEqual(['data', 'base', 'cfg', 'train']);
    await expect(page.locator('.tb-lock')).toContainText('바꿀 수 없는 것');
    await expect(page.locator('.tb-pane')).not.toContainText('GPU');
    await page.locator('.tb-node[data-kind="data"]').first().click();
    await expect(page.locator('.tb-side .tb-opt', { hasText: 'XI맵에서 고친 것' })).toContainText(/\d+건/);
    await page.keyboard.press('Escape');
    await page.locator('.tb-add .tb-chip', { hasText: '추론 시험' }).click();
    await page.keyboard.press('Escape');
    expect((await kinds()).length).toBe(first.length + 1);
    await page.locator('.tb-reset').click();
    expect(await kinds()).toEqual(first);
    expect(errs).toEqual([]);
  });

  test('LX 관리자 — 배포 → XI 재학습 · 학습 서식', async ({ page, baseURL }) => {
    const errs = watch(page);
    await frontDoor(page, new URL(baseURL).origin, 'lxadmin@lx.or.kr', 'admin');
    await page.waitForURL((u) => !/\/login\/?$/.test(u.pathname), { timeout: 20000 });
    await page.goto('v3/ops-infra/#/deploys/retrain');
    await expect(page.locator('.rt-seg button')).toHaveText(['쉬는 시간에 자동', '사람이 누를 때만'], { timeout: 30000 });
    await expect(page.locator('.rt-tbl tbody tr').first()).toBeVisible();
    await expect(page.locator('.rt-tbl')).toContainText('비닐하우스');
    await expect(page.locator('.rt-col')).not.toContainText('GPU');
    await page.locator('.im-tabs button', { hasText: '학습 서식' }).click();
    await expect(page.locator('.rt-blk')).toHaveCount(7);
    await expect(page.locator('.rt-blk input:disabled')).toHaveCount(4);                     // 빠질 수 없는 블록
    expect(errs).toEqual([]);
  });
});
