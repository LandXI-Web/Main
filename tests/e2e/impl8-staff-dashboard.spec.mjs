// 구현 8차 · LX 직원 대시보드 한 번에 정리(직원-6 4차 · 직원-7 · 10-09 13:14) — 로그인 폼 입력만(세션 주입 0) · 읽기만(신청을 보내지 않는다) · GPU 0.
// 확인: ① 대시보드 칸 = 프로젝트 진행 현황 · 저장 용량 · 내가 돌린 작업 · 요청함 · 공지 — 옛 칸(내 프로젝트 · 우리 서비스 · 바로 분석하기 · 최근 활동) 0
//       ② 흐름도 네 단계 숫자 = 서버 목록(GET /projects?scope=mine)을 네 단계로 묶은 수 · 칩 둘 + 외 n개
//       ③ 단계를 누르면 메뉴 '프로젝트' 목록(?stage=)이 그 단계만 · 남은 일 먼저 · 진행 n/4 · '지금' = 서버 next
//       ④ 증량 신청은 내 정보 창 한 길(폼이 같은 자리에서 펼쳐짐) ⑤ 가로 넘침 0 · 콘솔 오류 0 · '결재' · '반려' 0
// LX_SHOTS=1 이면 증거 캡처(docs/superpowers/final/process/impl-8/staff-dashboard/shots).
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { frontDoor } from '../../landxi/v3/kit/lint/forbidden.mjs';

const ENV = path.resolve('server/.env');
const PW = fs.existsSync(ENV) ? (/DEV_PASSWORD=(.+)/.exec(fs.readFileSync(ENV, 'utf8')) || [])[1]?.trim() : null;
const up = async (request) => { try { return (await request.get('http://127.0.0.1:8700/api/v1/health', { timeout: 3000 })).ok(); } catch { return false; } };
const SHOTS = process.env.LX_SHOTS ? path.resolve('docs/superpowers/final/process/impl-8/staff-dashboard/shots') : null;
const shot = async (page, name) => { if (!SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name) }); };
const G = { ingest: 0, label: 1, train: 2, infer: 3, review: 4, publish: 5 };   // 여섯 단계(10-10 질문 10 확인)

/** 넘침 · 한 단어 줄(두 줄 이상인 글 상자의 마지막 줄이 한 어절) · 금지어 */
const measure = (page) => page.evaluate(() => {
  const out = { overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth, clipped: [], lonely: [], banned: [] };
  for (const el of document.querySelectorAll('.k-main *')) {
    if (!el.childNodes.length || [...el.childNodes].some((n) => n.nodeType === 1 && getComputedStyle(n).display !== 'inline')) continue;
    const t = el.textContent.trim(); if (!t) continue;
    const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    if (el.scrollWidth - el.clientWidth > 1 && cs.textOverflow !== 'ellipsis' && cs.overflow !== 'visible') out.clipped.push(t.slice(0, 30));
    const r = document.createRange(); r.selectNodeContents(el);
    const lines = [...r.getClientRects()].reduce((a, x) => { if (!a.some((y) => Math.abs(y - x.top) < 3)) a.push(x.top); return a; }, []);
    if (lines.length >= 2) {
      const words = t.split(/\s+/);
      const last = words[words.length - 1];
      const r2 = document.createRange(); const tn = [...el.childNodes].reverse().find((n) => n.nodeType === 3 && n.textContent.trim());
      if (tn) { const i = tn.textContent.lastIndexOf(last); if (i >= 0) { r2.setStart(tn, i); r2.setEnd(tn, i + last.length); const lr = r2.getClientRects()[0]; const prev = i > 0 ? (() => { const r3 = document.createRange(); r3.setStart(tn, 0); r3.setEnd(tn, i); const rs = [...r3.getClientRects()]; return rs[rs.length - 1]; })() : null; if (lr && prev && lr.top - prev.top > 3 && words.length > 1) out.lonely.push(t.slice(0, 40)); } }
    }
  }
  const txt = document.querySelector('.k-main')?.innerText || '';
  for (const w of ['결재', '반려', '우리 서비스', '바로 분석하기', '최근 활동', '내 프로젝트 6', '서비스 관리 6']) if (txt.includes(w)) out.banned.push(w);
  return out;
});

test.describe('구현 8차 · LX 직원 대시보드 — 한 번에 정리', () => {
  test.beforeEach(async ({ request }) => {
    test.skip(!PW, 'server/.env DEV_PASSWORD 없음');
    test.skip(!(await up(request)), '게이트웨이 :8700 꺼짐');
  });

  test('대시보드 · 단계 → 프로젝트 목록 · 증량 신청은 내 정보 창 한 길', async ({ page, baseURL }) => {
    test.setTimeout(90000);
    const errs = [];
    page.on('pageerror', (e) => errs.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error' && !/favicon|net::ERR_ABORTED/.test(m.text())) errs.push(m.text()); });
    await frontDoor(page, new URL(baseURL).origin, 'test@lx.or.kr', 'app');
    await page.waitForURL((u) => u.pathname.startsWith('/landxi/v3/lx-console/'), { timeout: 20000 });
    const got = page.waitForResponse((r) => /\/projects\?scope=mine/.test(r.url()) && r.ok(), { timeout: 30000 });
    await page.reload();
    const j = await (await got).json();

    /* ① 칸 — 시안 4차 그대로 · 옛 칸 0 */
    await expect(page.locator('.ld-card h2')).toHaveText([/^프로젝트 진행 현황/, /^저장 용량/, /^내가 돌린 작업/, /^요청함/, /^공지/], { timeout: 20000 });
    for (const old of ['.lc-mine', '.lc-pr', '.ld-svc', '.ld-quick', '.ld-act', '.ld-th', '.ld-go', '.ld-recent']) await expect(page.locator(old)).toHaveCount(0);

    /* ② 흐름도 숫자 = 서버 목록을 네 단계로 묶은 수 */
    const want = [0, 0, 0, 0, 0, 0];
    for (const p of j.items) want[G[p.stage.key] ?? 0] += 1;
    if (j.items.length) {
      await expect(page.locator('.ld-board .sb-st')).toHaveCount(6);
      await expect(page.locator('.ld-board .sb-st-l')).toHaveText(['데이터 올리기', '학습데이터 구축', '학습', '추론', '결과 확인', '배포 신청']);
      expect((await page.locator('.ld-board .sb-st-row > b').allTextContents()).map(Number)).toEqual(want);
      for (let i = 0; i < 6; i++) {
        const st = page.locator('.ld-board .sb-st').nth(i);
        await expect(st.locator('.sb-chip:not(.sb-chip--more)')).toHaveCount(Math.min(2, want[i]));
        if (want[i] > 2) await expect(st.locator('.sb-chip--more')).toHaveText(`외 ${want[i] - 2}개`);
      }
    }
    await page.waitForTimeout(600);
    const m1 = await measure(page);
    await shot(page, 'dash-1440.png');
    console.log('M1', JSON.stringify(m1));
    expect(m1.overflowX).toBeLessThanOrEqual(0);
    expect(m1.banned).toEqual([]);

    /* ③ 단계 누름 → 메뉴 '프로젝트' 목록(그 단계 · 남은 일 먼저) */
    const gi = want.findIndex((n) => n > 0);
    if (gi >= 0) {
      await Promise.all([page.waitForURL((u) => u.pathname.startsWith('/landxi/v3/lx-project/') && /stage=/.test(u.search), { timeout: 15000 }),
        page.locator('.ld-board .sb-st-b').nth(gi).click()]);
      await page.locator('.lxp-list .sb-tb tbody tr').first().waitFor({ timeout: 20000 });
      await expect(page.locator('.lxp-flow .sb-st[data-open]')).toHaveCount(1);
      await expect(page.locator('.lxp-list .sb-tb tbody tr')).toHaveCount(want[gi]);
      await expect(page.locator('.lxp-list .sb-tb thead th')).toHaveText(['프로젝트', '지역', '담당', '지금', '진행', '마지막 활동', '남은 일', '']);
      await expect(page.locator('.sb-sort [aria-pressed="true"]')).toHaveText('남은 일 먼저');
      await expect(page.locator('.lxp-back')).toHaveText('대시보드');
      const byId = new Map(j.items.map((p) => [p.id, p]));
      for (const tr of await page.locator('.lxp-list .sb-tb tbody tr').all()) {
        const p = byId.get(await tr.getAttribute('data-id'));
        expect(p, '목록 줄 = 서버 프로젝트').toBeTruthy();
        await expect(tr.locator('td').nth(3)).toHaveText((p.next?.text || '—').replace(/ · /g, ' · '));
        await expect(tr.locator('.sb-prog small')).toHaveText(/^[0-6]\/6$/);
      }
      await page.waitForTimeout(400);
      const m2 = await measure(page);
      await shot(page, 'list-stage-1440.png');
      console.log('M2', JSON.stringify(m2));
      expect(m2.overflowX).toBeLessThanOrEqual(0);
      expect(m2.banned).toEqual([]);
      await page.goBack();
      await page.locator('.ld-store .k-me-dn').waitFor({ timeout: 20000 });
    }

    /* ④ 증량 신청 — 대시보드 칸 → 내 정보 창(폼이 같은 자리에서 펼쳐짐 · 보내지 않는다) */
    const ask = page.locator('.ld-store .k-me-ask');
    if (await ask.count()) {
      await ask.click();
      await expect(page.locator('.k-me-md')).toBeVisible();
      await expect(page.locator('.k-me-md .k-me-askf')).toBeVisible({ timeout: 15000 });
      await expect(page.locator('.k-me-md .k-me-askf input[name=want_gb]')).toBeVisible();
      await expect(page.locator('.k-md, .k-me-md').filter({ hasText: '증량 신청' })).toHaveCount(1);   // 창 하나
      await page.waitForTimeout(400);
      await shot(page, 'me-ask-1440.png');
    }
    expect(errs, errs.join('\n')).toEqual([]);
    test.info().annotations.push({ type: 'measure', description: JSON.stringify({ m1 }) });
  });
});
