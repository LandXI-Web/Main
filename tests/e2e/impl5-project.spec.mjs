// 구현 5차 · 프로젝트 한 장(확인 17차 P-3 ⓐ 재학습 근거 띠 + 사유 창 · P-4 ⓐ 기록 · 메모 · 파일 · P-5 ⓐ 프로젝트장 넘기기 · 내 정보).
// 로그인 폼 입력만(세션 주입 0) · 비밀번호는 server/.env DEV_PASSWORD(출력 0) · 게이트웨이 :8700 이 떠 있어야 한다.
// 재학습은 사유 창까지만 — '재학습 시작'이 보내는 요청은 가로채서 서버에 닿지 않게 한다(회차 · GPU 0).
// 메모 · 파일 · 넘기기는 이 시험이 만든 시험 프로젝트에서만 하고 끝에서 지운다 · 내 정보는 바꾼 부서를 끝에서 원래대로.
import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { frontDoor } from '../../landxi/v3/kit/lint/forbidden.mjs';

const ENV = path.resolve('server/.env');
const PW = fs.existsSync(ENV) ? (/DEV_PASSWORD=(.+)/.exec(fs.readFileSync(ENV, 'utf8')) || [])[1]?.trim() : null;
const up = async (request) => { try { return (await request.get('http://127.0.0.1:8700/api/v1/health', { timeout: 3000 })).ok(); } catch { return false; } };
const NAME = 'e2e 시험 기록 넘기기';            // 이 이름의 프로젝트는 두 번째 시험만 만들고 지운다(다른 시험은 건드리지 않는다)
const py = (code) => execFileSync('python', ['-c', ['import sys; sys.path.insert(0, "server")', 'from landxi_api import config', 'import psycopg, shutil',
  'c = psycopg.connect(config.PG_ADMIN_DSN, autocommit=True)', code, 'c.close()'].join('\n')], { env: { ...process.env, PYTHONIOENCODING: 'utf-8' } }).toString();
const drop = () => py(`for (pid,) in c.execute("SELECT id FROM projects WHERE name=%s", (${JSON.stringify(NAME)},)).fetchall():\n    shutil.rmtree(config.DATA_ROOT / "projects" / pid, ignore_errors=True)\nc.execute("DELETE FROM projects WHERE name=%s", (${JSON.stringify(NAME)},))`);
/* 화면의 세션으로 서버를 부른다(로그인 폼으로 들어온 그 세션) */
const call = (page, p, method = 'GET', body) => page.evaluate(async ([p, method, body]) => {
  const { api } = await import('/landxi/shared/api-v1.js');
  try { return { status: method === 'POST' ? 201 : 200, json: await api(p, { method, body }) }; } catch (e) { return { status: e.status || 0, json: null }; }
}, [p, method, body]);

test.describe('구현 5차 · 프로젝트 한 장 — 재학습 근거 · 기록 · 넘기기 · 내 정보', () => {
  test.beforeEach(async ({ request }) => {
    test.skip(!PW, 'server/.env DEV_PASSWORD 없음');
    test.skip(!(await up(request)), '게이트웨이 :8700 꺼짐');
  });

  test('공개된 프로젝트 — 재학습 띠 · 칩 · 사유를 골라야 시작 · 보내는 값에 사유', async ({ page, baseURL }) => {
    const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
    await frontDoor(page, new URL(baseURL).origin, 'test@lx.or.kr', 'app');
    await page.waitForURL((u) => u.pathname.startsWith('/landxi/v3/lx-console/'), { timeout: 20000 });
    const led = (await call(page, '/projects?scope=led')).json.items || [];
    let pid = null;
    for (const p of led) { const one = (await call(page, `/projects/${p.id}`)).json; if (one?.published && one.can?.retrain) { pid = p.id; break; } }
    test.skip(!pid, '재학습할 수 있는 공개된 프로젝트 없음');
    const one = (await call(page, `/projects/${pid}`)).json;
    await page.goto('v3/lx-project/?project=' + pid);
    const rt = page.locator('.lxp-retrain');
    await expect(rt.locator('.lxp-pt')).toHaveCount(one.basis.points.length + 1, { timeout: 20000 });
    await expect(rt.locator('.lxp-pt').last()).toContainText('지금');
    await expect(rt.locator('.lxp-sig span').first()).toContainText(`기관 검토 요청 ${one.basis.reviews.value}건`);
    if (one.basis.before) await expect(rt.locator('.lxp-sig .is-warn')).toContainText(one.basis.before);
    await expect(rt.locator('.lxp-rt-f p')).toHaveText(one.basis.thin ? '지금은 다시 학습할 근거가 적습니다' : '배포는 LX 관리자 승인 뒤 바뀝니다');
    /* 사유 창 — 고르기 전에는 시작 못 함 · 직접 입력은 글이 있어야 · 보내는 값 = 고른 사유(가로채서 서버에 닿지 않게) */
    let sent = null;
    await page.route('**/api/v1/projects/*/rounds', (route) => { sent = route.request().postDataJSON(); route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: { code: 'conflict', message: '시험 — 보내지 않음' } }) }); });
    await rt.locator('.lxp-rt').click();
    const md = page.locator('.k-md');
    await expect(md.locator('.k-md-t')).toHaveText(`${one.round.value + 1}차 재학습 — 왜 다시 학습하나`);
    await expect(md.locator('.lxp-chip')).toHaveText([/검토 요청 반영/, /새 영상 시점/, /성능 보완/, /직접 입력/]);
    const go = md.getByRole('button', { name: `${one.round.value + 1}차 재학습 시작` });
    await expect(go).toBeDisabled();
    await md.locator('.lxp-chip', { hasText: '직접 입력' }).click();
    await expect(go).toBeDisabled();
    await md.locator('.lxp-own').fill('시험 사유');
    await expect(go).toBeEnabled();
    await md.locator('.lxp-chip', { hasText: '성능 보완' }).click();
    await go.click();
    await expect.poll(() => sent).toEqual({ reason: '성능 보완' });
    await expect(page.locator('.k-md-bg:not(.is-closing) .k-md-t')).toHaveText('재학습을 시작하지 못했습니다');   // 문제는 창으로(원칙 109)
    expect((await call(page, `/projects/${pid}`)).json.round.value).toBe(one.round.value);   // 회차 그대로
    expect(errs).toEqual([]);
  });

  test('기록 · 메모 · 파일 — 최근 3줄 · 모두 보기 서랍(거르기) · 메모 · 파일 올리기 · 프로젝트장 넘기기', async ({ page, baseURL }) => {
    const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
    await frontDoor(page, new URL(baseURL).origin, 'test@lx.or.kr', 'app');
    await page.waitForURL((u) => u.pathname.startsWith('/landxi/v3/lx-console/'), { timeout: 20000 });
    drop();
    try { await logAndHandover(page, errs); } finally { drop(); }
  });

  async function logAndHandover(page, errs) {
    const made = await call(page, '/projects', 'POST', { name: NAME, task: '비닐하우스', task_id: 'greenhouse', regions: ['52190'] });
    expect(made.status).toBe(201);
    const pid = made.json.id;
    await page.goto('v3/lx-project/?project=' + pid);
    const card = page.locator('.lxp-log');
    await expect(card.locator('.lxp-lg li').first()).toContainText('프로젝트 만듦', { timeout: 20000 });
    /* 메모 한 줄 */
    await card.locator('.lxp-lg-m').fill('e2e 시험 메모 한 줄');
    await card.getByRole('button', { name: '남기기' }).click();
    await expect(card.locator('.lxp-lg li').first()).toContainText('e2e 시험 메모 한 줄');
    /* 파일 — 형식이 안 맞으면 창 · 그림은 올라가 맨 위 */
    await card.locator('input[type=file]').setInputFiles({ name: 'run.exe', mimeType: 'application/octet-stream', buffer: Buffer.from('MZ') });
    await expect(page.locator('.k-md-bg:not(.is-closing) .k-md-t')).toHaveText('이 파일은 올릴 수 없습니다');
    await page.locator('.k-md').getByRole('button', { name: '확인' }).click();
    const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex');
    await card.locator('input[type=file]').setInputFiles({ name: '표본 위치.png', mimeType: 'image/png', buffer: png });
    await expect(card.locator('.lxp-lg-pk')).toContainText('표본 위치.png');
    await card.getByRole('button', { name: '남기기' }).click();
    await expect(card.locator('.lxp-lg li').first().locator('.lxp-file')).toHaveText('표본 위치.png');
    await expect(card.locator('.lxp-lg li')).toHaveCount(3);
    /* 모두 보기 — 거르기 칩 넷 · 메모만 */
    await card.locator('.lxp-more').click();
    const dr = page.locator('.k-drawer');
    await expect(dr.locator('.lxp-chip')).toHaveText([/전체/, /자동/, /메모/, /파일/]);
    await dr.locator('.lxp-chip', { hasText: '메모' }).click();
    await expect(dr.locator('.lxp-lg li')).toHaveCount(1);
    await expect(dr.locator('.lxp-lg li')).toContainText('e2e 시험 메모 한 줄');
    await dr.locator('.k-dr-x').click();
    /* 프로젝트장 넘기기 — 받을 사람 · 메모 → 나는 구성원 · 넘기기 링크 없음 · 기록 한 줄 */
    await page.locator('.lxp-people .lxp-link', { hasText: '넘기기' }).click();
    const md = page.locator('.k-md');
    await expect(md.locator('.k-md-t')).toHaveText('프로젝트장 넘기기');
    await page.waitForFunction(() => document.querySelector('.k-md select')?.options.length > 1);
    await md.locator('select').selectOption({ label: 'LX 관리자' });
    await md.locator('input').fill('e2e 시험 넘기기');
    await md.getByRole('button', { name: '넘기기' }).click();
    await expect(page.locator('.lxp-people .lxp-who').first()).toHaveText('LX 관리자');
    await expect(page.locator('.lxp-people .lxp-link')).toHaveCount(0);
    await expect(page.locator('.lxp-people .lxp-mem')).toContainText('LX 직원');
    await expect(page.locator('.lxp-log .lxp-lg li').first()).toContainText('프로젝트장 넘김');
    expect(errs).toEqual([]);
  }

  test("내 정보 — 머리의 내 이름 → 창 · 아이디 고정 · 부서를 고치면 바로 · 저장 용량(할당 · 쓴 양 = 서버 값)", async ({ page, baseURL }) => {
    await frontDoor(page, new URL(baseURL).origin, 'test@lx.or.kr', 'app');
    await page.waitForURL((u) => u.pathname.startsWith('/landxi/v3/lx-console/'), { timeout: 20000 });
    const me = (await call(page, '/me/profile')).json;
    try {
      await page.locator('.k-mast .k-me-b').click();
      const md = page.locator('.k-md');
      await expect(md.locator('.k-md-t')).toHaveText('내 정보');
      await expect(md.locator('.k-me-ro')).toHaveText('test@lx.or.kr');
      await expect(md.locator('input[name=login]')).toHaveCount(0);
      const q = me.storage.quota_gb.value;
      await expect(md.locator('.k-me-sv')).toContainText(q == null ? '할당 없음' : `할당 ${q} GB 중`);   // S-19 — '할당 n GB 중 m 사용'
      await expect(md.locator('.k-me-sub')).toContainText(`${me.storage.projects.value}개`);
      await md.locator('input[name=dept]').fill('e2e 공간정보처');
      await md.getByRole('button', { name: '저장' }).click();
      await expect(page.locator('.k-toast')).toContainText('내 정보를 바꿨습니다');
      expect((await call(page, '/me/profile')).json.dept).toBe('e2e 공간정보처');
    } finally {
      await call(page, '/me/profile', 'PATCH', { name: me.name, dept: me.dept, contact: me.contact });
      py(`c.execute("DELETE FROM audit_log WHERE action='account.profile' AND (after->>'dept' LIKE 'e2e%%' OR before->>'dept' LIKE 'e2e%%')")`);
    }
  });
});
