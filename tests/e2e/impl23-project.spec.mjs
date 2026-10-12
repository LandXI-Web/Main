// 구현 23차 — 새 프로젝트 = 한 창(원칙 220 · 10-12). 로그인 폼 → 프로젝트 → 새 프로젝트 → 이름 · 설명 · 무엇을 · 데이터하우스 영상 고르기 · 구성원 →
// 만들기 한 번 → 바로 그 프로젝트 '학습데이터 구축'. 대상지는 고른 영상 자리에서(화면이 고르지 않음). 옛 주소(?new=1)도 같은 창.
// 로그인 폼 입력만(세션 주입 0) · 비밀번호는 server/.env DEV_PASSWORD(출력 0) · 게이트웨이 :8700. 영상은 올리지 않는다(고르기만) · 학습 · 분석 0.
// 만든 시험 프로젝트는 끝에서 지운다. (파일 올리기 → 창을 닫고 넘어가도 이어 올리기는 docs/superpowers/final/process/impl-23/project/shoot.mjs 가 바깥 주소에서 확인)
import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { frontDoor } from '../../landxi/v3/kit/lint/forbidden.mjs';

const ENV = path.resolve('server/.env');
const PW = fs.existsSync(ENV) ? (/DEV_PASSWORD=(.+)/.exec(fs.readFileSync(ENV, 'utf8')) || [])[1]?.trim() : null;
const up = async (request) => { try { return (await request.get('http://127.0.0.1:8700/api/v1/health', { timeout: 3000 })).ok(); } catch { return false; } };
const NAME = 'e2e 시험 한 창 프로젝트';
const drop = () => execFileSync('python', ['-c', [
  'import sys; sys.path.insert(0, "server")', 'from landxi_api import config', 'import psycopg',
  `c = psycopg.connect(config.PG_ADMIN_DSN, autocommit=True); c.execute("DELETE FROM projects WHERE name=%s", (${JSON.stringify(NAME)},)); c.close()`,
].join('\n')], { env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });

test.describe('구현 23차 · 새 프로젝트 한 창', () => {
  test.beforeEach(async ({ request }) => {
    test.skip(!PW, 'server/.env DEV_PASSWORD 없음');
    test.skip(!(await up(request)), '게이트웨이 :8700 꺼짐');
    drop();
  });
  test.afterEach(() => drop());

  test('한 창에서 채우고 만들기 한 번 → 학습데이터 구축 · 대상지는 고른 영상 자리 · 구성원 · 설명 저장', async ({ page, baseURL, request }) => {
    const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
    await frontDoor(page, new URL(baseURL).origin, 'test@lx.or.kr', 'app');
    await page.waitForURL((u) => u.pathname.startsWith('/landxi/v3/lx-console/'), { timeout: 20000 });
    await page.goto('v3/lx-project/?new=1');                                   // 옛 주소 → 새 창
    const box = page.locator('.lxp-new.lxp-new--one');
    await expect(box).toBeVisible({ timeout: 30000 });
    await expect(box.locator('.lxp-l')).toHaveText([/^이름/, /^설명선택/, /^무엇을/, /^구성원/, /^영상/]);
    await expect(box.getByRole('button', { name: '만들기' })).toBeDisabled();
    await box.locator('input[name=name]').fill(NAME);
    await box.locator('textarea[name=description]').fill('한 창 시험');
    await box.locator('.lxp-chip', { hasText: '비닐하우스' }).click();
    await expect(box.getByRole('button', { name: '만들기' })).toBeDisabled();  // 영상 · 대상지가 아직 없음
    /* 데이터하우스 영상에서 고르기 — 고르면 대상지 = 그 영상 자리(고르기 칸은 숨음) */
    await box.locator('.lxp-vt', { hasText: '데이터하우스' }).click();
    const first = box.locator('.lxp-pk-c').first();
    await first.waitFor({ timeout: 30000 });
    const region = (await first.locator('small').textContent()).split(' · ')[0];
    await first.click();
    await expect(first).toHaveAttribute('aria-pressed', 'true');
    await expect(box.locator('.lxp-where')).toContainText(`대상지 ${region}`);
    await expect(box.locator('.lxp-regbox')).toBeHidden();
    /* 구성원 — 찾기 · 고르기(여러 명) */
    await box.locator('.lxp-mem input').click();
    await box.locator('.lxp-mem-l button').first().waitFor();
    const who = (await box.locator('.lxp-mem-l button b').first().textContent()).trim();
    await box.locator('.lxp-mem-l button').first().click();
    await expect(box.locator('.lxp-reg', { hasText: who })).toBeVisible();
    await box.getByRole('button', { name: '만들기' }).click();
    await page.waitForURL((u) => u.pathname.startsWith('/landxi/v3/lx-train/') && u.searchParams.get('stage') === 'label' && u.searchParams.get('project')?.startsWith('prj_'), { timeout: 20000 });
    const tok = await page.evaluate(() => JSON.parse(localStorage.getItem('lx_api_session') || 'null')?.token);
    const pr = await (await request.get('http://127.0.0.1:8700/api/v1/projects/' + new URL(page.url()).searchParams.get('project'), { headers: { authorization: 'Bearer ' + tok } })).json();
    await expect(page.locator('.k-sub .lxp-bar-name b')).toHaveText(NAME, { timeout: 20000 });
    expect(pr.description).toBe('한 창 시험');
    expect(pr.regions.map((g) => g.name)).toContain(region);
    expect(pr.members.map((m) => m.name)).toContain(who);
    expect(pr.pic).toMatch(/^\/catalog\/imagery\/.+\/thumb$/);
    expect(errs).toEqual([]);
  });
});
