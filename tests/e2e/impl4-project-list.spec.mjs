// 구현 4차 · 프로젝트 목록 6칸 진행 막대 + 막힌 곳(제안 2 S-14 ⓑ — 걸러 보기는 나중).
// 로그인 폼 입력만(세션 주입 0) · 비밀번호는 server/.env DEV_PASSWORD(출력 0) · 게이트웨이 :8700 이 떠 있어야 한다. 읽기만 한다(프로젝트를 만들지 않는다).
// 확인: ① 열 이름 ② 줄마다 막대 6칸 + 지금 단계 말 + 막힌 곳이 서버 판정(steps · blocked)과 같다 ③ 대시보드 '내 프로젝트' 막대와 같은 값 ④ 걸러 보기 없음
//       ⑤ 휴대폰 390 에서 가로 넘침 0 · 프로젝트마다 한 장으로 접힘 · 막힌 곳이 없으면 한 줄 접힘.
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
  const got = page.waitForResponse((r) => /\/projects\?scope=led/.test(r.url()) && r.ok(), { timeout: 30000 });
  await page.goto('v3/lx-project/?scope=led');
  const j = await (await got).json();
  await page.locator('.lxp-list .k-table tbody tr').first().waitFor({ timeout: 30000 }).catch(() => {});
  return j;
}

test.describe('구현 4차 · 프로젝트 목록 — 진행 막대 · 막힌 곳', () => {
  test.beforeEach(async ({ request }) => {
    test.skip(!PW, 'server/.env DEV_PASSWORD 없음');
    test.skip(!(await up(request)), '게이트웨이 :8700 꺼짐');
  });

  test('열 · 6칸 막대 · 막힌 곳이 서버 판정과 같고 걸러 보기는 없다', async ({ page, baseURL }) => {
    const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
    const j = await openList(page, baseURL);
    test.skip(!j.items.length, '내가 만든 프로젝트 없음');
    await expect(page.locator('.lxp-list .k-table thead th')).toHaveText(['이름', '진행', '다음 할 일', '막힌 곳', '무엇을 · 어디', '마지막 활동']);
    const rows = page.locator('.lxp-list .k-table tbody tr');
    await expect(rows).toHaveCount(Math.min(j.items.length, 20));
    const shown = j.items.slice(0, 20);
    for (let i = 0; i < shown.length; i++) {
      const p = shown[i], row = rows.nth(i);
      /* 진행 — 칸 6 · 칸 상태가 서버 steps 와 같다 · 지금 단계 말 = 번호 + 이름 */
      await expect(row.locator('.lxp-seg i')).toHaveCount(6);
      expect(await row.locator('.lxp-seg i').evaluateAll((is) => is.map((x) => x.dataset.st)), p.name).toEqual(p.steps);
      expect(p.steps.filter((s) => s === 'now').length).toBe(1);
      await expect(row.locator('.lxp-pg-st')).toHaveText(`${p.stage.index + 1}${p.stage.label}`);
      /* 막힌 곳 — 서버 blocked 첫 줄(없으면 —) · 더 있으면 '외 n건' */
      const st = row.locator('.lxp-stuck');
      if (p.blocked.length) {
        expect(nb(await st.innerText())).toContain(p.blocked[0].text);
        expect(await st.getAttribute('data-kind')).toBe(p.blocked[0].kind);
        if (p.blocked.length > 1) await expect(st).toContainText(`외 ${p.blocked.length - 1}건`);
      } else {
        await expect(st).toHaveText('—');
      }
    }
    /* 막힌 곳의 글은 업무 말만(내부 지표 · 코드 0) */
    const stuck = (await page.locator('.lxp-stuck').allInnerTexts()).join(' ');
    expect(stuck).not.toMatch(/\b[A-Z]\d{1,2}\b|ms\b|GPU|§/);
    /* 걸러 보기(무엇을 · 어디 · 상태 칩)는 나중 — 이번에는 없다 */
    await expect(page.locator('.lxp-page select, .lxp-page [role=combobox], .lxp-filter, .lxp-chip')).toHaveCount(0);
    expect(errs).toEqual([]);
  });

  test("대시보드 '내 프로젝트' 막대와 같은 값(같은 이름 숫자는 한 출처)", async ({ page, baseURL }) => {
    const j = await openList(page, baseURL);
    const real = j.items.filter((p) => !/^(e2e|pytest)/i.test(p.name));        // 다른 시험이 잠깐 만들었다 지우는 프로젝트는 뺀다
    test.skip(!real.length, '내가 만든 프로젝트 없음');
    const list = {};
    for (const p of real.slice(0, 3)) list[p.name] = p.steps.map((s) => (s === 'skip' ? 'wait' : s));       // 대시보드는 건너뛴 칸을 따로 칠하지 않는다
    await page.goto('v3/lx-console/');
    const rows = page.locator('.lc-pr');
    await rows.first().waitFor({ timeout: 30000 });
    let compared = 0;
    for (const name of Object.keys(list)) {
      const r = rows.filter({ hasText: name }).first();
      if (!(await r.count())) continue;                                          // 대시보드는 세 줄만 보인다
      await expect.poll(async () => r.locator('.ld-seg i').evaluateAll((is) => is.map((x) => x.dataset.st)), { timeout: 25000 }).toEqual(list[name]);
      compared++;
    }
    expect(compared).toBeGreaterThan(0);
  });

  test('휴대폰 390 — 가로 넘침 0 · 프로젝트마다 한 장으로 접힘', async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const j = await openList(page, baseURL);
    test.skip(!j.items.length, '내가 만든 프로젝트 없음');
    const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, head: getComputedStyle(document.querySelector('.lxp-list thead')).display,
      tr: getComputedStyle(document.querySelector('.lxp-list tbody tr')).display, wrap: (() => { const w = document.querySelector('.lxp-list .k-table-w'); return w.scrollWidth - w.clientWidth; })() }));
    expect(m.sw).toBeLessThanOrEqual(m.cw);
    expect(m.wrap).toBeLessThanOrEqual(0);
    expect(m.head).toBe('none');                          // 열 이름 줄 대신 카드마다 이름표(막힌 곳 · 다음 할 일)
    expect(m.tr).toBe('grid');
    const first = page.locator('.lxp-list tbody tr').first();
    await expect(first.locator('.lxp-seg i')).toHaveCount(6);
    /* 칸 이름표 — 막힌 곳이 있는 줄에는 '막힌 곳' · 모든 줄에 '다음 할 일' */
    const lab = await first.evaluate((tr) => [...tr.children].map((td) => getComputedStyle(td, '::before').content));
    expect(lab).toContain('"다음 할 일"');
    if (j.items[0].blocked.length) expect(lab).toContain('"막힌 곳"');
    /* 외톨이 줄 없음 — 이름 · 막힌 곳은 두 줄 이내 */
    for (const sel of ['td:nth-child(1)', '.lxp-stuck']) {
      const lines = await first.locator(sel).first().evaluate((el) => Math.round(el.getBoundingClientRect().height / (parseFloat(getComputedStyle(el).lineHeight) || 24)));
      expect(lines, sel).toBeLessThanOrEqual(2);
    }
  });
});
