// 구현 5차 · 계정 · 프로젝트 셋 — 부서를 LX 조직도에서 고르기(S-21) · 메모 지우기(S-20) · 저장 용량 늘리기 요청 → 관리자 승인(S-19) · 가입 신청 부서 칸.
// 로그인 폼 입력만(세션 주입 0) · 비밀번호는 server/.env DEV_PASSWORD(출력 0) · 게이트웨이 :8700 이 떠 있어야 한다.
// 시험 프로젝트 · 메모 · 할당 · 요청 · 알림 · 부서는 이 시험이 만들고 끝에서 원래대로 돌린다(가입 신청은 보내지 않는다).
import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { frontDoor } from '../../landxi/v3/kit/lint/forbidden.mjs';

const ENV = path.resolve('server/.env');
const PW = fs.existsSync(ENV) ? (/DEV_PASSWORD=(.+)/.exec(fs.readFileSync(ENV, 'utf8')) || [])[1]?.trim() : null;
const up = async (request) => { try { return (await request.get('http://127.0.0.1:8700/api/v1/health', { timeout: 3000 })).ok(); } catch { return false; } };
const NAME = 'e2e 시험 메모 지우기';
const py = (code) => execFileSync('python', ['-c', ['import sys; sys.path.insert(0, "server")', 'from landxi_api import config', 'import psycopg, shutil',
  'c = psycopg.connect(config.PG_ADMIN_DSN, autocommit=True)', code, 'c.close()'].join('\n')], { env: { ...process.env, PYTHONIOENCODING: 'utf-8' } }).toString();
const call = (page, p, method = 'GET', body) => page.evaluate(async ([p, method, body]) => {
  const { api } = await import('/landxi/shared/api-v1.js');
  try { return { status: 200, json: await api(p, { method, body }) }; } catch (e) { return { status: e.status || 0, json: null, code: e.code }; }
}, [p, method, body]);
const login = async (page, baseURL, who, site) => {
  await frontDoor(page, new URL(baseURL).origin, who, site);
  await page.waitForURL((u) => !/\/login\/?$/.test(u.pathname), { timeout: 20000 });
};

test.describe('구현 5차 · 계정 · 프로젝트 셋 — 부서 고르기 · 메모 지우기 · 저장 용량 요청', () => {
  test.beforeEach(async ({ request }) => {
    test.skip(!PW, 'server/.env DEV_PASSWORD 없음');
    test.skip(!(await up(request)), '게이트웨이 :8700 꺼짐');
  });

  test('내 정보 — 부서를 목록에서 고르면 목록 이름(상위 › 부서)으로 저장 · 목록에 없으면 적은 그대로', async ({ page, baseURL }) => {
    await login(page, baseURL, 'test@lx.or.kr', 'app');
    const me = (await call(page, '/me/profile')).json;
    try {
      await page.locator('.k-mast .k-me-b').click();
      const dept = page.locator('.k-me input[name=dept]');
      await dept.click();
      await dept.fill('플랫폼');
      const opt = page.locator('.k-dp li', { hasText: '플랫폼사업처' }).first();
      await expect(opt).toBeVisible();
      await opt.click();
      await expect(dept).toHaveValue('공간정보본부 › 플랫폼사업처');
      await expect(page.locator('.k-dp-h')).toHaveText('목록에 있는 부서입니다');
      await page.getByRole('button', { name: '저장' }).click();
      await expect(page.locator('.k-toast')).toContainText('내 정보를 바꿨습니다');
      const after = (await call(page, '/me/profile')).json;
      expect(after.dept).toBe('공간정보본부 › 플랫폼사업처');
      expect(after.dept_listed).toBe(true);
      // 목록에 없는 부서(지사) — '그대로 쓰기'
      await page.locator('.k-mast .k-me-b').click();
      await dept.fill('전남광주지역본부 e2e지사');
      await expect(page.locator('.k-dp li.is-own')).toContainText('그대로 쓰기');
      await page.getByRole('button', { name: '저장' }).click();
      await expect(page.locator('.k-toast')).toContainText('내 정보를 바꿨습니다');
      expect((await call(page, '/me/profile')).json.dept_listed).toBe(false);
    } finally {
      await call(page, '/me/profile', 'PATCH', { name: me.name, dept: me.dept, contact: me.contact });
      py(`c.execute("DELETE FROM audit_log WHERE action='account.profile' AND (after->>'dept' LIKE '%%플랫폼사업처%%' OR after->>'dept' LIKE '%%e2e%%' OR before->>'dept' LIKE '%%e2e%%' OR before->>'dept' LIKE '%%플랫폼사업처%%')")`);
    }
  });

  test('기록 — 메모 지우기: 확인 창 → 줄이 빠지고 \'메모를 지움\' 한 줄(내용 없음)', async ({ page, baseURL }) => {
    await login(page, baseURL, 'test@lx.or.kr', 'app');
    const p = (await call(page, '/projects', 'POST', { name: NAME, task: '비닐하우스', task_id: 'greenhouse', regions: ['52190'] })).json;
    try {
      await call(page, `/projects/${p.id}/notes`, 'POST', { text: 'e2e 잘못 올린 메모' });
      await page.goto('v3/lx-project/?project=' + p.id);
      const card = page.locator('.lxp-log');
      await expect(card.locator('li[data-kind=memo]')).toContainText('e2e 잘못 올린 메모');
      await card.locator('li[data-kind=memo] .lxp-lg-rm').click();
      const md = page.locator('.k-md');
      await expect(md.locator('.k-md-t')).toHaveText('메모 지우기');
      await expect(md).toContainText('내용은 남지 않습니다');
      await md.getByRole('button', { name: '지우기' }).click();
      await expect(card.locator('li', { hasText: '메모를 지움' })).toBeVisible();
      await expect(card).not.toContainText('e2e 잘못 올린 메모');
    } finally {
      py(`for (pid,) in c.execute("SELECT id FROM projects WHERE name=%s", (${JSON.stringify(NAME)},)).fetchall():\n    shutil.rmtree(config.DATA_ROOT / "projects" / pid, ignore_errors=True)\n    c.execute("DELETE FROM audit_log WHERE subject=%s", (pid,))\nc.execute("DELETE FROM projects WHERE name=%s", (${JSON.stringify(NAME)},))`);
    }
  });

  test('저장 용량 — 직원 늘리기 요청(내 정보) → 관리자 계정 관리 \'저장 용량 요청\'에서 승인 → 할당 늘어남', async ({ browser, baseURL }) => {
    const sc = await browser.newContext(); const s = await sc.newPage();
    const ac = await browser.newContext(); const a = await ac.newPage();
    const keep = py('print(c.execute("SELECT coalesce(storage_quota_gb::text, \'\') FROM lx_users WHERE id=\'u_mail_test\'").fetchone()[0])').trim();
    try {
      await login(a, baseURL, 'lxadmin@lx.or.kr', 'admin');
      expect((await call(a, '/accounts/users/lx/u_mail_test/quota', 'POST', { quota_gb: 0.03 })).status).toBe(200);
      await login(s, baseURL, 'test@lx.or.kr', 'app');
      await s.locator('.k-mast .k-me-b').click();
      await expect(s.locator('.k-me-sv')).toContainText('할당 0.03 GB 중');
      await expect(s.locator('.k-me-warn')).toContainText('%를 썼습니다');                          // 90% 넘음 — 막지 않고 한 줄
      await s.locator('.k-me-ask').click();
      await s.locator('.k-md input[name=want_gb]').fill('0.05');
      await s.locator('.k-md input[name=why]').fill('e2e 2차 학습데이터');
      await s.getByRole('button', { name: '요청 보내기' }).click();
      await expect(s.locator('.k-me-req')).toContainText('늘리기 요청 중 0.05 GB');
      await a.goto('v3/ops-accounts/#storage');
      const row = a.locator('.acc-card[data-tab=storage] tbody tr', { hasText: 'test@lx.or.kr' });
      await expect(row).toContainText('0.03 GB → 0.05 GB');
      await row.click();
      await expect(a.locator('.k-drawer')).toContainText('e2e 2차 학습데이터');
      await a.locator('.k-drawer .acc-acts .t-btn', { hasText: '승인' }).click();
      await expect(a.locator('.k-toast')).toContainText('할당을 늘렸습니다');
      const me = (await call(s, '/me/profile')).json;
      expect(me.storage.quota_gb.value).toBe(0.05);
      expect(me.storage.last.state).toBe('approved');
      const n = (await call(s, '/projects/notices')).json.items.filter((x) => x.kind === 'account.storage');
      expect(n[0].text).toContain('0.05 GB로 늘었습니다');
    } finally {
      py(`c.execute("UPDATE lx_users SET storage_quota_gb=%s WHERE id='u_mail_test'", (${JSON.stringify(keep)} or None,))\nc.execute("DELETE FROM storage_requests WHERE user_id='u_mail_test'")\nc.execute("DELETE FROM lx_notices WHERE user_id='u_mail_test' AND kind='account.storage'")\nc.execute("DELETE FROM audit_log WHERE action IN ('account.quota','account.storage.request','account.storage.approve') AND subject='test@lx.or.kr' AND at > now() - interval '10 minutes'")`);
      await sc.close(); await ac.close();
    }
  });

  test('가입 신청(LX 직원) — 부서 칸에 적으면 목록에서 찾아 보여 준다(보내지 않음)', async ({ page, baseURL }) => {
    await page.goto(new URL(baseURL).origin + '/landxi/v3/login/?site=app');
    await page.locator('#helpBtn').click();
    const dept = page.locator('.ac input[name=dept]');
    await dept.click();
    await dept.fill('전남광주');
    await expect(page.locator('.k-dp li', { hasText: '전남광주지역본부' })).toBeVisible();
    await page.locator('.k-dp li', { hasText: '전남광주지역본부' }).click();
    await expect(dept).toHaveValue('전남광주지역본부');
  });
});
