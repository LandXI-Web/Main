// 구현 2차 T1 '프로젝트 백본' — 로그인 폼 → LX 직원 첫 화면 '내 프로젝트' → 새 프로젝트(이름 · 무엇을 · 어디) → 프로젝트 한 장 →
// 첫 화면 '내 프로젝트' 줄 → 그 단계 화면(레일 = 프로젝트 단계 + 이름). 확인 대장 R-D3 · 갈림길 ⓐ · 흐름-1.
// 로그인 폼 입력만(세션 주입 0) · 비밀번호는 server/.env DEV_PASSWORD(출력 0) · 게이트웨이 :8700 이 떠 있어야 한다.
// 만든 시험 프로젝트는 끝에서 지운다(운영 목록에 남지 않게).
import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { frontDoor } from '../../landxi/v3/kit/lint/forbidden.mjs';

const ENV = path.resolve('server/.env');
const PW = fs.existsSync(ENV) ? (/DEV_PASSWORD=(.+)/.exec(fs.readFileSync(ENV, 'utf8')) || [])[1]?.trim() : null;
const up = async (request) => { try { return (await request.get('http://127.0.0.1:8700/api/v1/health', { timeout: 3000 })).ok(); } catch { return false; } };
const NAME = 'e2e 시험 남원시 비닐하우스';
const drop = () => execFileSync('python', ['-c', [
  'import sys; sys.path.insert(0, "server")',
  'from landxi_api import config',
  'import psycopg',
  `c = psycopg.connect(config.PG_ADMIN_DSN, autocommit=True); c.execute("DELETE FROM projects WHERE name=%s", (${JSON.stringify(NAME)},)); c.close()`,
].join('\n')], { env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });

test.describe('구현 2차 · 프로젝트 백본', () => {
  test.beforeEach(async ({ request }) => {
    test.skip(!PW, 'server/.env DEV_PASSWORD 없음');
    test.skip(!(await up(request)), '게이트웨이 :8700 꺼짐');
    drop();
  });
  test.afterEach(() => drop());

  test('로그인 → 새 프로젝트 → 내 프로젝트 줄 → 그 단계 화면', async ({ page, baseURL }) => {
    const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
    const origin = new URL(baseURL).origin;
    await frontDoor(page, origin, 'test@lx.or.kr', 'app');
    await page.waitForURL((u) => u.pathname.startsWith('/landxi/v3/lx-console/'), { timeout: 20000 });
    /* 첫 화면 — '오늘' 대신 '내 프로젝트' · 돌고 있는 서비스 · 만들 수 있는 것 · 머리 줄 '프로젝트' */
    const mine = page.locator('.lc-mine');
    await expect(mine.locator('h2')).toHaveText('내 프로젝트');
    await expect(page.locator('.lc-run h2')).toHaveText('돌고 있는 서비스');
    await expect(page.locator('.lc-make h2')).toHaveText('만들 수 있는 것');
    await expect(page.locator('.k-mast .lxp-mast')).toHaveAttribute('href', /lx-project\/$/);
    await expect(page.getByText('오늘', { exact: true })).toHaveCount(0);
    /* 새 프로젝트 — 세 칸 */
    await mine.getByRole('button', { name: '새 프로젝트' }).first().click();
    const box = page.locator('.lxp-new');
    await expect(box).toBeVisible();
    await box.locator('.lxp-chip', { hasText: '비닐하우스' }).click();
    await box.locator('.lxp-pick input[placeholder="시군구 이름을 검색"]').waitFor();   // 지역 목록을 받은 뒤(키트 지역 검색 준비)
    await box.locator('.lxp-pick input').fill('남원');
    await box.locator('.lxp-pick [role=option]').first().waitFor();
    await box.locator('.lxp-pick input').press('Enter');
    await expect(box.locator('.lxp-reg')).toHaveText(/남원시/);
    await expect(box.locator('input[name=name]')).toHaveValue(/남원시 비닐하우스 \d{4}/);   // 이름은 저절로(고치면 그대로)
    await box.locator('input[name=name]').fill(NAME);
    await box.getByRole('button', { name: '만들기' }).click();
    /* 바로 만들어진다(관리자 승인 없음) → 프로젝트 한 장 · 레일 맨 위 이름 */
    await page.waitForURL(/\/lx-project\/\?project=prj_/, { timeout: 20000 });
    await expect(page.locator('.lxp-title')).toHaveText(NAME);
    await expect(page.locator('.lxp-rail-name b')).toHaveText(NAME);
    await expect(page.locator('.lxp-now .lxp-next')).not.toBeEmpty();
    await expect(page.locator('.lxp-steps .t-step')).toHaveCount(6);
    /* 첫 화면 '내 프로젝트' 줄 → 그 단계 화면(프로젝트 맥락) */
    await page.goto('v3/lx-console/');
    const row = page.locator('.lc-pr', { hasText: NAME });
    await expect(row).toBeVisible({ timeout: 20000 });
    await expect(row.locator('.lc-pr-s')).toHaveText(/^\d /);
    await row.click();
    await page.waitForURL((u) => /\/landxi\/v3\/lx-(train|ingest|review|deploy)\//.test(u.pathname) && u.searchParams.get('project')?.startsWith('prj_'), { timeout: 20000 });
    await expect(page.locator('.lxp-rail-name b')).toHaveText(NAME, { timeout: 20000 });
    await expect(page.locator('.k-rail .k-rail-i')).toHaveCount(6);
    await expect(page.locator('.k-rail .k-rail-i').nth(1)).toContainText('학습데이터');
    expect(errs).toEqual([]);
  });

  test('프로젝트 목록 · 관리 — 내가 만든 · 참여한 · 보관 · 전체', async ({ page, baseURL }) => {
    await frontDoor(page, new URL(baseURL).origin, 'test@lx.or.kr', 'app');
    await page.goto('v3/lx-project/');
    await expect(page.locator('.lxp-tab')).toHaveText([/내가 만든/, /참여한/, /보관/, /전체/]);
    await expect(page.getByRole('button', { name: '새 프로젝트' }).first()).toBeVisible();
  });
});
