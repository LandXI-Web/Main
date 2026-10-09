// 구현 7차 · '현장 확인 필요(필지)' 개념 빼기(원칙 135 · 10-09 · 확인 대장 맨 아래 절) — 로그인은 폼 입력만(세션 주입 0).
// LX 직원 화면(분석하기 · 카드 상세 · 대시보드 · XI맵)에 '현장 확인'이 없고, 큰 숫자 자리는 AI 분석 결과(요약 한 출처 · 업무 결과로 센 것만)인가.
// 기관 화면(gov-*)과 기관 계정 XI맵은 사용자 답 전까지 그대로라 여기서 보지 않는다. SHOT=1 이면 증거 폴더에 1440 · 390 캡처를 남긴다.
import { test, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import { frontDoor } from '../../landxi/v3/kit/lint/forbidden.mjs';

const BASE = 'http://localhost:4173';
const API = 'http://127.0.0.1:8700/api/v1';
const OUT = path.resolve('docs/superpowers/final/process/impl-7/no-fieldcheck/shots');
const SHOT = !!process.env.SHOT;
const up = async (request) => { try { return (await request.get(API + '/health', { timeout: 3000 })).ok(); } catch { return false; } };
const call = (page, p) => page.evaluate(async (q) => {
  const s = JSON.parse(localStorage.getItem('lx_api_session'));
  const r = await fetch('http://localhost:8700/api/v1' + q, { headers: { authorization: 'Bearer ' + s.token } });
  return r.json();
}, p);
const NO = /현장\s*확인/;
const shot = async (page, name) => { if (!SHOT) return; fs.mkdirSync(OUT, { recursive: true }); await page.screenshot({ path: path.join(OUT, name + '.png') }); };

/** 화면 숫자와 같은 식 — 요약 항목 중 detected_counted 만 · 셈 단위가 다르면 운영 먼저 → 큰 수 쪽 한 묶음(lx-console/summary.js aiResult) */
function aiOf(sum) {
  const its = (sum.items || []).filter((i) => i.detected_counted && +i.metrics?.detected?.value > 0);
  if (!its.length) return null;
  const R = ['운영', '시범', '첫 결과 전'], by = new Map();
  for (const i of its) { const u = i.metrics.detected.unit || '건'; by.set(u, [...(by.get(u) || []), i]); }
  const rank = (g) => Math.min(...g.map((i) => (R.indexOf(i.stage) + 9) % 9)), tot = (g) => g.reduce((a, i) => a + +i.metrics.detected.value, 0);
  const g = [...by.values()].sort((a, b) => rank(a) - rank(b) || tot(b) - tot(a))[0];
  return tot(g);
}

for (const vp of [{ w: 1440, h: 900, k: '1440' }, { w: 390, h: 844, k: '390' }]) {
  test.describe(`현장 확인 빼기 · ${vp.k}`, () => {
    test.use({ viewport: { width: vp.w, height: vp.h } });
    test.beforeEach(async ({ request }) => { test.skip(!process.env.DEV_PASSWORD, 'server/.env DEV_PASSWORD 없음'); test.skip(!(await up(request)), '게이트웨이 :8700 꺼짐'); });

    test('분석하기 · 카드 상세 · 대시보드 · XI맵 — 현장 확인 0 · 큰 숫자 = AI 분석 결과', async ({ page }) => {
      test.setTimeout(180000);
      const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
      await frontDoor(page, BASE, 'test@lx.or.kr');

      /* 분석하기(카드 한 벌) — 카드 결과 예시 = AI 분석 결과(요약 한 출처) */
      await page.goto(BASE + '/landxi/v3/lx-analyze/', { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.k-sc[data-kind="analyze"]', { timeout: 30000 });
      await page.waitForTimeout(1500);
      expect(await page.locator('body').innerText()).not.toMatch(NO);
      const farm = page.locator('.k-sc[data-card="card-farm"] .k-sc-res');
      await expect(farm).toContainText('AI 분석 결과');
      const sumFarm = await call(page, '/summary?card=card-farm');
      expect(sumFarm.items.filter((i) => i.detected_counted).map((i) => i.metrics.detected.value)).toContain(Number(await farm.getAttribute('data-v')));
      await shot(page, `analyze-${vp.k}`);

      /* 카드 상세 — 결과 예시 큰 숫자 */
      await page.goto(BASE + '/landxi/v3/lx-analyze/?card=card-farm', { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.la-big', { timeout: 30000 });
      await page.waitForTimeout(1200);
      expect(await page.locator('body').innerText()).not.toMatch(NO);
      await expect(page.locator('.la-ex-l')).toContainText('AI 분석 결과');
      await page.locator('.la-big').scrollIntoViewIfNeeded();
      await shot(page, `card-${vp.k}`);

      /* LX 직원 대시보드 */
      await page.goto(BASE + '/landxi/v3/lx-console/', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(5000);
      expect(await page.locator('body').innerText()).not.toMatch(NO);
      await shot(page, `dash-${vp.k}`);

      /* XI맵 — 큰 숫자 = AI 분석 결과 · 지역 요약과 같은 값 · 실태조사 도구(규칙 · 목록 · 대조) 없음 */
      const sum = await call(page, '/summary?region=52190');
      await page.goto(BASE + '/landxi/v3/xi-clean/?region=52190', { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.querySelector('.xc-big')?.dataset.st === 'ok' || document.querySelector('.xc-big')?.dataset.st === 'empty', null, { timeout: 60000 });
      await page.waitForTimeout(2500);
      expect(await page.locator('body').innerText()).not.toMatch(NO);
      await expect(page.locator('.xc-big .k-big-l')).toContainText('AI 분석 결과');
      const want = aiOf(sum);
      const got = await page.evaluate(() => window.__xc.hud?.n);
      expect(got).toBe(want ?? 0);
      for (const t of ['rules', 'list', 'sweep']) await expect(page.locator(`[data-tool="${t}"]`)).toHaveCount(0);
      await shot(page, `xi-${vp.k}`);
      expect(errs).toEqual([]);
    });
  });
}
