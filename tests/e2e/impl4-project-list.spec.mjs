// 프로젝트 목록 = 프로젝트 진행 현황(구현 4차 S-14 ⓑ → 10-09 직원-6 4차 · 한 번에 정리 — 6칸 막대 · 막힌 곳 표를 네 단계 흐름도 + 표로 바꿈).
// 로그인 폼 입력만(세션 주입 0) · 비밀번호는 server/.env DEV_PASSWORD(출력 0) · 게이트웨이 :8700 이 떠 있어야 한다. 읽기만 한다(프로젝트를 만들지 않는다).
// 확인: ① 열 이름 ② 줄마다 진행 네 칸 = 서버 steps 를 네 단계로 묶은 것 · n/4 · '지금' = 서버 next · 남은 일 = 서버 blocked 첫 줄 ③ 정렬 '남은 일 먼저'(기본)
//       ④ 흐름도 단계를 누르면 그 단계만(?stage=) · 다시 누르면 전체. 휴대폰은 보지 않는다(원칙 139).
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { frontDoor } from '../../landxi/v3/kit/lint/forbidden.mjs';

const ENV = path.resolve('server/.env');
const PW = fs.existsSync(ENV) ? (/DEV_PASSWORD=(.+)/.exec(fs.readFileSync(ENV, 'utf8')) || [])[1]?.trim() : null;
const up = async (request) => { try { return (await request.get('http://127.0.0.1:8700/api/v1/health', { timeout: 3000 })).ok(); } catch { return false; } };
const nb = (t) => String(t ?? '').replace(/ /g, ' ');           // 줄 꺾임 때문에 붙인 줄바꿈 없는 공백은 같은 글자로 본다

/** 프로젝트 목록을 열고 서버 응답(내가 만든)을 함께 받는다 */
async function openList(page, baseURL) {
  await frontDoor(page, new URL(baseURL).origin, 'test@lx.or.kr', 'app');
  await page.waitForURL((u) => u.pathname.startsWith('/landxi/v3/lx-console/'), { timeout: 20000 });
  const got = page.waitForResponse((r) => /\/projects\?scope=mine/.test(r.url()) && r.ok(), { timeout: 30000 });
  await page.goto('v3/lx-project/?scope=mine');
  const j = await (await got).json();
  await page.locator('.lxp-list .sb-tb tbody tr').first().waitFor({ timeout: 30000 }).catch(() => {});
  return j;
}

const KEYS = ['ingest', 'label', 'train', 'infer', 'review', 'publish'];
const GROUPS = [['ingest'], ['label'], ['train'], ['infer'], ['review'], ['publish']];   // 여섯 단계 — 프로젝트 안 단계 막대와 같은 이름(10-10 질문 10 확인 · board.js)
// 칸 = 서버 steps 그대로(GPT2-3 한 출처 — 끝남 · 지금 · 남음 · 건너뜀) · n = 서버 progress.n(끝남 + 건너뜀)
const seg4 = (p) => KEYS.map((k, i) => (['done', 'now', 'wait', 'skip'].includes(p.steps[i]) ? p.steps[i] : 'wait'));

test.describe('프로젝트 목록 — 진행 현황(흐름도 · 여섯 단계 표)', () => {
  test.beforeEach(async ({ request }) => {
    test.skip(!PW, 'server/.env DEV_PASSWORD 없음');
    test.skip(!(await up(request)), '게이트웨이 :8700 꺼짐');
  });

  test('열 · 네 칸 진행 · 지금 · 남은 일이 서버 판정과 같고 남은 일 먼저', async ({ page, baseURL }) => {
    const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
    const j = await openList(page, baseURL);
    test.skip(!j.items.length, '진행 중인 내 프로젝트 없음');
    await expect(page.locator('.lxp-list .sb-tb thead th')).toHaveText(['프로젝트', '지역', '담당', '지금', '진행', '마지막 활동', '남은 일', '']);
    await expect(page.locator('.sb-sort [aria-pressed="true"]')).toHaveText('남은 일 먼저');
    const rows = page.locator('.lxp-list .sb-tb tbody tr');
    await expect(rows).toHaveCount(j.items.length);
    const byId = new Map(j.items.map((p) => [p.id, p]));
    let seenClear = false;
    for (const row of await rows.all()) {
      const p = byId.get(await row.getAttribute('data-id'));
      const want = seg4(p);
      expect(await row.locator('.lxp-seg i').evaluateAll((is) => is.map((x) => x.dataset.st)), p.name).toEqual(want);
      await expect(row.locator('.sb-prog small')).toHaveText(`${p.progress.n}/6`);
      expect(p.progress.n).toBe(want.filter((x) => x === 'done' || x === 'skip').length);
      expect(nb(await row.locator('td').nth(3).innerText())).toBe(nb(p.next?.text || '—'));
      const k = row.locator('.sb-kick');
      if (p.blocked.length) {
        expect(nb(await k.innerText())).toContain(p.blocked[0].text);
        expect(seenClear, '남은 일 있는 줄이 먼저').toBe(false);
      } else { await expect(k).toHaveCount(0); seenClear = true; }
    }
    /* 남은 일의 글은 업무 말만(내부 지표 · 코드 0) */
    expect((await page.locator('.sb-kick').allInnerTexts()).join(' ')).not.toMatch(/[A-Z]\d{1,2}|ms|GPU|§|결재|반려/);
    expect(errs).toEqual([]);
  });

  test('흐름도 단계 고르기 — 그 단계만 · 다시 누르면 전체', async ({ page, baseURL }) => {
    const j = await openList(page, baseURL);
    test.skip(!j.items.length, '진행 중인 내 프로젝트 없음');
    const n = [0, 0, 0, 0, 0, 0];
    for (const p of j.items) n[Math.max(0, GROUPS.findIndex((g) => g.includes(p.stage.key)))] += 1;
    expect((await page.locator('.lxp-flow .sb-st-row > b').allTextContents()).map(Number)).toEqual(n);
    const gi = n.findIndex((x) => x > 0);
    const btn = page.locator('.lxp-flow .sb-st-b').nth(gi);
    await btn.click();
    await expect(page.locator('.lxp-flow .sb-st[data-open]')).toHaveCount(1);
    await expect(page.locator('.lxp-list .sb-tb tbody tr')).toHaveCount(n[gi]);
    expect(new URL(page.url()).searchParams.get('stage')).toBe(['ingest', 'label', 'train', 'infer', 'review', 'deploy'][gi]);
    await page.locator('.lxp-flow .sb-st-b').nth(gi).click();
    await expect(page.locator('.lxp-flow .sb-st[data-open]')).toHaveCount(0);
    await expect(page.locator('.lxp-list .sb-tb tbody tr')).toHaveCount(j.items.length);
  });
});
