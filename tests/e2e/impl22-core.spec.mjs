// impl-22 핵심 코어 고리(10-12 12:45 확인 · 원칙 205 · 213 · 217) — GPU 0(학습을 시작하지 않음) · 로그인 폼 입력만.
// 데이터하우스 없앰(10-13 — 옛 주소 → 프로젝트 목록) · 학습 화면 기본 흐름 · 되돌리기 · '수정된 부분 n장'(10-13 사용자 말 그대로) · 'GPU' 글자 0 ·
// LX 관리자 배포 → XI 재학습 · 학습 서식.
import { test, expect } from '@playwright/test';
import { frontDoor } from '../../landxi/v3/kit/lint/forbidden.mjs';

const watch = (page) => { const errs = []; page.on('pageerror', (e) => errs.push(String(e))); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); }); return errs; };

test.describe('impl-22 · 핵심 코어 고리', () => {
  test('LX 직원 — 데이터하우스 없음(옛 주소 → 프로젝트 목록) · 학습 서식 기본 흐름 · 수정된 부분 선택지 · 평가 → 추론', async ({ page, baseURL }) => {
    const errs = watch(page);
    await frontDoor(page, new URL(baseURL).origin, 'test@lx.or.kr', 'app');
    await page.waitForURL((u) => !/\/login\/?$/.test(u.pathname), { timeout: 20000 });
    await page.goto('v3/lx-ingest/?tab=train');                                              // 옛 데이터하우스 주소
    await page.waitForURL((u) => u.pathname.startsWith('/landxi/v3/lx-project/'), { timeout: 20000 });
    await expect(page.locator('.k-rail .k-rail-i[aria-current="true"] > span:last-child')).toHaveText('프로젝트', { timeout: 20000 });
    await expect(page.locator('.k-rail')).not.toContainText('데이터하우스');
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
    await expect(page.locator('.tb-pane')).not.toContainText(/평가|검증 묶음|추론 시험/);                 // 10-13 용어 되돌림(원칙 235)
    await expect(page.locator('.tb-add .tb-chip')).toHaveText(['학습 데이터', '기반 모델', '학습 설정', '학습', '추론', '배포 신청']);
    await expect(page.locator('.tb-pane')).not.toContainText('GPU');
    await page.locator('.tb-node[data-kind="data"]').first().click();
    const xi = page.locator('.tb-side .tb-opt', { hasText: '수정된 부분' });                // 그 프로젝트가 만든 분석서비스가 있을 때만(1장이 된 칸 n장)
    if (await xi.count()) await expect(xi).toContainText(/\d[\d,]*장/);
    await expect(page.locator('.tb-side')).not.toContainText('승인 대기');
    await page.keyboard.press('Escape');
    await page.locator('.tb-add .tb-chip', { hasText: '추론' }).click();
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
    await expect(page.locator('.rt-col')).not.toContainText('조용하면');
    await page.locator('.im-tabs button', { hasText: '학습 서식' }).click();
    await expect(page.locator('.rt-blk')).toHaveCount(6);                                    // '추론 시험'은 '추론'과 하나로(10-13)
    for (const c of await page.locator('.rt-col').allInnerTexts()) expect(c).not.toMatch(/평가|검증 묶음/);
    await expect(page.locator('.rt-kv select[aria-label="업무"]')).toHaveCount(0);           // 학습 서식은 '기본' 하나(10-13)
    await expect(page.locator('.rt-blk input:disabled')).toHaveCount(4);                     // 빠질 수 없는 블록
    /* 공유 데이터(10-13 관리자-공유데이터 · 원칙 238) — 메뉴 하나 · 직원 '공유 데이터에서 고르기'와 같은 목록 */
    await page.locator('.k-rail a', { hasText: '공유 데이터' }).click();
    await expect(page.locator('.sd-tbl tbody tr').first()).toBeVisible({ timeout: 30000 });
    const n = await page.evaluate(async () => { const { api } = await import('/landxi/shared/api-v1.js'); const j = await api('/projects/imagery?all=1'); return j.items.length; });
    await expect(page.locator('.sd-n')).toHaveText(`영상 ${n.toLocaleString('ko-KR')}장`);
    await expect(page.locator('.sd-tbl thead')).toContainText('공개');                        // 비공개 = 직원 · 기관 모두에서 빠짐(10-14)
    /* 탭 셋(10-14 공유데이터-탭) — 영상 · 학습 데이터 · 행정 자료 · 탭을 바꿔도 틀 크기 같음(원칙 231) */
    await expect(page.locator('.sd-tabs button')).toHaveText(['영상', '학습 데이터', '행정 자료']);
    const box = () => page.evaluate(() => ['.sd-card', '.sd-body', '.sd-pg'].map((s) => { const r = document.querySelector(s).getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map(Math.round).join(','); }).join('|'));
    const b0 = await box();
    await page.locator('.sd-tabs button', { hasText: '학습 데이터' }).click();
    await expect(page.locator('.sd-tbl thead')).toContainText('출처', { timeout: 30000 });
    const tr = await page.evaluate(async () => { const { api } = await import('/landxi/shared/api-v1.js'); return (await api('/shared/train-data')).items.length; });
    await expect(page.locator('.sd-tbl tbody tr')).toHaveCount(Math.min(tr, 12));
    expect(await box()).toBe(b0);
    /* 탭마다 그 탭의 올리기 — 같은 자리 · 같은 크기(10-14 공유데이터-탭 다시 · 원칙 231 · 246) */
    const upBox = () => page.evaluate(() => { const r = document.querySelector('.sd-up-b').getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map(Math.round).join(','); });
    await expect(page.locator('.sd-up-b')).toHaveText('학습 데이터 올리기');
    const u0 = await upBox();
    await page.locator('.sd-tabs button', { hasText: '행정 자료' }).click();
    await expect(page.locator('.sd-sub')).toHaveText(['LX', '기관 대장', '브이월드'], { timeout: 30000 });
    await expect(page.locator('.sd-up-b')).toHaveText('행정 자료 올리기');
    expect(await upBox()).toBe(u0);
    expect(await box()).toBe(b0);
    expect(errs).toEqual([]);
  });
});
