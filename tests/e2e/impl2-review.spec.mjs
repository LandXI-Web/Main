// 구현 2차 · 검토 요청 · 메시지 · 알림 — 확인 대장 6차 GF-6('검토 요청' · 메모 한 줄 · LX 관리자도 봄) · 알림-1(담당 + 관리자).
// 기관 lxadmin@namwon(gov 입구) → XI맵 필지 카드 → 검토 요청(메모 한 줄) → LX 직원(담당) · LX 관리자 알림 칸에 숫자 →
// 담당 직원이 알림에서 대화를 열어 한 줄 + 판정으로 답 → 기관 알림 칸 → '내가 보낸 요청'에서 답을 본다.
// 로그인은 폼 입력만(kit/lint/forbidden.mjs frontDoor · 입구 인자 · 세션 주입 0). 끝에서 이 시험이 만든 요청 · 대화 · 표본 행을 지운다.
// 게이트웨이 :8700 이 떠 있어야 한다. 비밀번호는 server/.env DEV_PASSWORD(출력 0).
import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { frontDoor } from '../../landxi/v3/kit/lint/forbidden.mjs';

const BASE = `http://localhost:${Number(process.env.PORT) || 4173}`;
const MEMO = 'e2e 검토 요청 확인용 메모';
const ANSWER = 'e2e 확인했습니다. 다음 학습에 반영합니다';
const up = async (request) => { try { return (await request.get('http://127.0.0.1:8700/api/v1/health', { timeout: 3000 })).ok(); } catch { return false; } };

function cleanup(ids) {
  if (!ids.length) return;
  const py = `
import sys, psycopg
sys.path.insert(0, 'server')
from landxi_api import config
with psycopg.connect(config.PG_ADMIN_DSN, autocommit=True) as c:
    for rid in sys.argv[1:]:
        fp = c.execute("SELECT ctx->>'fp_id' FROM feedback WHERE id=%s", (rid,)).fetchone()
        if fp and fp[0]: c.execute("DELETE FROM feedback WHERE id=%s", (fp[0],))
        c.execute("DELETE FROM review_messages WHERE request_id=%s", (rid,))
        c.execute("DELETE FROM review_reads WHERE request_id=%s", (rid,))
        c.execute("DELETE FROM feedback WHERE id=%s AND kind='review'", (rid,))
`;
  execFileSync('python', ['-c', py, ...ids], { cwd: path.resolve('.'), stdio: 'ignore' });
}

test.describe('구현 2차 — 검토 요청 · 주고받기 · 알림', () => {
  const made = [];
  test.beforeEach(async ({ request }) => { test.skip(!(await up(request)), '게이트웨이 :8700 꺼짐'); });
  test.afterAll(() => cleanup(made));

  test('기관 → 검토 요청 → LX 직원 · 관리자 알림 → 답 → 기관이 답을 본다', async ({ browser }) => {
    test.setTimeout(180000);
    const errs = [];
    const ctx = () => browser.newContext({ viewport: { width: 1440, height: 900 } });

    // 1) 기관 — XI맵 필지 카드에서 검토 요청(메모 한 줄)
    const tc = await ctx(); const tp = await tc.newPage();
    await frontDoor(tp, BASE, 'lxadmin@namwon', 'gov');
    /* 기관 XI맵도 AI 분석 결과 흐름(원칙 135 기관까지 · 10-10 확인 8 ⓐ) — 규칙 · 목록 도구 없음. 필지 카드는 지도에서 필지를 누르거나 주소(?pnu=)로 연다 */
    const pnu = await tp.evaluate(async () => { const s = JSON.parse(localStorage.getItem('lx_api_session')); const r = await fetch('http://localhost:8700/api/v1/survey/findings?state=open&rule=R2&limit=1', { headers: { authorization: 'Bearer ' + s.token } }); return (await r.json()).items[0].pnu; });
    await tp.goto(BASE + '/landxi/v3/xi-clean/?pnu=' + encodeURIComponent(pnu), { waitUntil: 'domcontentloaded' });
    tp.on('pageerror', (e) => errs.push('tenant ' + e));             // 기관 첫 화면(다른 갈래가 만드는 중)이 아니라 이 흐름의 화면만 본다
    await expect(tp.locator('[data-tool="list"]')).toHaveCount(0);
    const ask = tp.locator('.k-rv-b');
    await expect(ask).toHaveText('검토 요청', { timeout: 20000 });
    await expect(tp.locator('body')).not.toContainText(/오탐 신고|AI가 잘못 봤어요/);
    await ask.click();
    await expect(tp.locator('.k-rv-to b')).toHaveText(/이 서비스 담당 LX 직원 .+|LX 관리자/, { timeout: 10000 });
    await tp.locator('.k-rv-in').fill(MEMO);
    const [resp] = await Promise.all([tp.waitForResponse((r) => /\/api\/v1\/reviews$/.test(r.url()) && r.request().method() === 'POST'),
      tp.locator('.k-rv-go').click()]);
    expect(resp.status()).toBe(201);
    const sent = await resp.json(); made.push(sent.id);
    await expect(tp.locator('.k-rv-done')).toBeVisible();
    expect(sent.recipient.kind).toBe('staff');                       // 영농(휴경·전용 의심) → 이 서비스 담당 직원

    // 2) LX 관리자(admin 입구) — 알림 칸에 새 요청 · '검토 요청'에서 모든 요청을 본다
    const ac = await ctx(); const ap = await ac.newPage();
    ap.on('pageerror', (e) => errs.push('admin ' + e));
    await frontDoor(ap, BASE, 'lxadmin@lx.or.kr', 'admin');
    await expect(ap.locator('.k-bell-n')).toBeVisible({ timeout: 20000 });
    await ap.locator('.k-rail-i', { hasText: '검토 요청' }).click();
    await expect(ap).toHaveURL(/\/lx-inbox\//);
    await expect(ap.locator(`.ib-row[data-id="${sent.id}"]`)).toBeVisible({ timeout: 20000 });
    await expect(ap.locator(`.ib-row[data-id="${sent.id}"] .ib-meta`)).toContainText('받는 사람 LX 담당');

    // 3) LX 직원(app 입구) — 왼쪽 메뉴 '요청함' 숫자(10차 메뉴-1 ⓐ — 알림 칸 대신) → 요청함 목록 → 그 대화 → 한 줄 + 판정 'AI 오류'
    const sc = await ctx(); const sp = await sc.newPage();
    sp.on('pageerror', (e) => errs.push('staff ' + e));
    await frontDoor(sp, BASE, 'test@lx.or.kr', 'app');
    await expect(sp.locator('.k-rail-i[data-id="inbox"] .k-rail-b')).toBeVisible({ timeout: 20000 });
    await expect(sp.locator('.k-bell')).toHaveCount(0);
    await sp.locator('.k-rail a.k-rail-i[data-id="inbox"]').click();
    await expect(sp).toHaveURL(/\/lx-inbox\//);
    await sp.locator(`.ib-row[data-id="${sent.id}"]`).click();
    await expect(sp).toHaveURL(new RegExp('/lx-inbox/\\?id=' + sent.id));
    await expect(sp.locator('.ib-thread')).toContainText(MEMO, { timeout: 20000 });
    await expect(sp.locator('.ib-facts')).toContainText('대장');     // 저절로 붙은 대장 값 · AI 결과
    await expect(sp.locator('.ib-facts')).toContainText('AI 분석');
    await sp.locator('.ib-seg button', { hasText: 'AI 오류' }).click();
    await sp.locator('.ib-reply input').fill(ANSWER);
    await sp.locator('.ib-reply button[type=submit]').click();
    await expect(sp.locator('.ib-thread')).toContainText(ANSWER, { timeout: 20000 });
    await expect(sp.locator('.ib-ch .t-chip')).toHaveText('AI 오류');

    // 4) 기관 — 알림 칸 → 그 대화(내가 보낸 요청) 에 LX 답 · 판정
    await tp.reload({ waitUntil: 'domcontentloaded' });
    await expect(tp.locator('.k-bell-n')).toBeVisible({ timeout: 30000 });
    await tp.locator('.k-bell').click();
    const item = tp.locator('.k-bell-i', { hasText: sent.where }).first();
    await expect(item).toContainText('AI 오류');
    await item.click();
    const dr = tp.locator('.k-rv-dr');
    await expect(dr.locator('.k-rv-m[data-side="lx"]')).toContainText(ANSWER, { timeout: 20000 });
    await expect(dr.locator('.k-rv-m[data-side="lx"]')).toContainText('AI 오류');
    await expect(dr.locator('.k-rv-head .t-chip')).toHaveText('답변');

    expect(errs).toEqual([]);
    await Promise.all([tc.close(), ac.close(), sc.close()]);
  });
});
