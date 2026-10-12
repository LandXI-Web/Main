// 프로젝트 목록 = 프로젝트 진행 현황 — 분석 서비스 카드와 같은 틀(원칙 219 · 10-12 · 구현 23차). 예전 흐름도 + 표(직원-6 4차)를 카드로 바꿈.
// 로그인 폼 입력만(세션 주입 0) · 비밀번호는 server/.env DEV_PASSWORD(출력 0) · 게이트웨이 :8700 이 떠 있어야 한다. 읽기만 한다(프로젝트를 만들지 않는다).
// 확인: ① 카드 틀 = 분석하기 카드(.k-sc.la-ac) · 카드마다 여섯 칸 막대 = 서버 steps · '지금 n 단계' · n/6 = 서버 progress · 학습 데이터 n장 · 대상지 = 서버 값
//       ② 남은 일 먼저(서버 blocked 있는 카드가 앞) ③ 단계 칩을 누르면 그 단계만(?stage=) · 다시 누르면 전체 ④ 한 페이지 2 · 4 · 6 · 8장 ⑤ 카드 누르면 지금 단계 화면.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { frontDoor } from '../../landxi/v3/kit/lint/forbidden.mjs';

const ENV = path.resolve('server/.env');
const PW = fs.existsSync(ENV) ? (/DEV_PASSWORD=(.+)/.exec(fs.readFileSync(ENV, 'utf8')) || [])[1]?.trim() : null;
const up = async (request) => { try { return (await request.get('http://127.0.0.1:8700/api/v1/health', { timeout: 3000 })).ok(); } catch { return false; } };

/** 프로젝트 목록을 열고 서버 응답(내 프로젝트)을 함께 받는다 · 한 페이지 8장으로 */
async function openList(page, baseURL) {
  await frontDoor(page, new URL(baseURL).origin, 'test@lx.or.kr', 'app');
  await page.waitForURL((u) => u.pathname.startsWith('/landxi/v3/lx-console/'), { timeout: 20000 });
  const got = page.waitForResponse((r) => /\/projects\?scope=mine/.test(r.url()) && r.ok(), { timeout: 30000 });
  await page.goto('v3/lx-project/?scope=mine');
  const j = await (await got).json();
  await page.waitForFunction(() => document.documentElement.dataset.projects === '1', null, { timeout: 30000 });
  if (j.items.length) await page.locator('.la-view-b', { hasText: '8' }).click();
  return j;
}

const KEYS = ['ingest', 'label', 'train', 'infer', 'review', 'publish'];
const seg = (p) => KEYS.map((k, i) => (['done', 'now', 'wait', 'skip'].includes(p.steps[i]) ? p.steps[i] : 'wait'));

test.describe('프로젝트 목록 — 진행 현황(분석 서비스 카드와 같은 틀)', () => {
  test.beforeEach(async ({ request }) => {
    test.skip(!PW, 'server/.env DEV_PASSWORD 없음');
    test.skip(!(await up(request)), '게이트웨이 :8700 꺼짐');
  });

  test('카드마다 여섯 칸 · 지금 단계 · n/6 · 학습 데이터 · 대상지가 서버 값과 같고 남은 일 먼저', async ({ page, baseURL }) => {
    const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
    const j = await openList(page, baseURL);
    test.skip(!j.items.length, '진행 중인 내 프로젝트 없음');
    const cards = page.locator('.lxp-pc');
    await expect(cards).toHaveCount(Math.min(8, j.items.length));
    await expect(cards.first()).toHaveClass(/k-sc/);
    await expect(cards.first()).toHaveClass(/la-ac/);                                // 분석하기 카드와 같은 틀
    const byId = new Map(j.items.map((p) => [p.id, p]));
    let seenClear = false;
    for (const c of await cards.all()) {
      const p = byId.get(await c.getAttribute('data-id'));
      expect(p, '카드 = 서버 프로젝트').toBeTruthy();
      await expect(c.locator('.k-sc-t')).toHaveText(p.name);
      expect(await c.locator('.lxp-seg i').evaluateAll((is) => is.map((x) => x.dataset.st)), p.name).toEqual(seg(p));
      await expect(c.locator('.la-ac-cat')).toHaveText(`${p.stage.index + 1} ${p.stage.label}`);
      await expect(c.locator('.lxp-pc-w small.num')).toHaveText(` · ${p.progress.n}/6`);
      await expect(c.locator('.la-ac-hero > div').first()).toHaveText(p.train_n ? `${p.train_n.value.toLocaleString('ko-KR')}장학습 데이터` : '—학습 데이터');
      if (p.regions.length) await expect(c.locator('.la-ac-where .k')).toHaveText(`대상지 ${p.regions.length}곳`);
      await expect(c.locator('.lxp-pc-meta')).toContainText('구성원');
      if (p.blocked.length) expect(seenClear, '남은 일 있는 카드가 먼저').toBe(false); else seenClear = true;
    }
    expect((await page.locator('.lxp-cards').innerText())).not.toMatch(/GPU|ms\b|§|prj_|결재|반려/);
    expect(errs).toEqual([]);
  });

  test('단계 칩 — 그 단계만 · 다시 누르면 전체 · 카드를 누르면 지금 단계 화면', async ({ page, baseURL }) => {
    const j = await openList(page, baseURL);
    test.skip(!j.items.length, '진행 중인 내 프로젝트 없음');
    const n = [0, 0, 0, 0, 0, 0];
    for (const p of j.items) n[Math.max(0, KEYS.indexOf(p.stage.key))] += 1;
    const chips = page.locator('.lxp-tools .la-chips .la-chip');
    await expect(chips).toHaveCount(7);
    expect((await chips.locator('small').allTextContents()).map(Number)).toEqual([j.items.length, ...n]);
    const gi = n.findIndex((x) => x > 0);
    await chips.nth(gi + 1).click();
    await expect(chips.nth(gi + 1)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.lxp-pc')).toHaveCount(Math.min(8, n[gi]));
    expect(new URL(page.url()).searchParams.get('stage')).toBe(['ingest', 'label', 'train', 'infer', 'review', 'deploy'][gi]);
    await chips.nth(gi + 1).click();
    await expect(page.locator('.lxp-pc')).toHaveCount(Math.min(8, j.items.length));
    /* 한 페이지 2장 → 페이지 넘김 */
    await page.locator('.la-view-b', { hasText: '2' }).click();
    await expect(page.locator('.lxp-pc')).toHaveCount(Math.min(2, j.items.length));
    if (j.items.length > 2) await expect(page.locator('.la-pager .la-pg[aria-current="page"]')).toHaveText('1');
    /* 카드 누르면 지금 단계 화면(프로젝트 맥락) */
    const first = page.locator('.lxp-pc').first();
    const href = await first.locator('.k-sc-go').getAttribute('href');
    await Promise.all([page.waitForURL((u) => u.searchParams.get('project')?.startsWith('prj_'), { timeout: 20000 }), first.locator('.k-sc-t').click()]);
    expect(page.url()).toContain(href.replace(/^.*\/landxi\//, ''));
  });
});
