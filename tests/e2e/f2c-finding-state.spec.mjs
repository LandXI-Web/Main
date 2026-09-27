// F2-C · 실태조사 상태 실시간(v1.1-22 · F2-S) — ops 스트림 finding.state{from,to} → 운영 현황 기관 카드 미니 막대가 1s 안에 40ms 현상(값이 바뀔 때만)
import { test, expect } from '@playwright/test';
import { OPS, gwUp, gwAdmin, ready, opsEvent, kst, health } from '../../shots/f2/C/tools/e2e-util.mjs';
test.setTimeout(60000);

test('운영 현황: 실태조사 미니 막대(5상태) · finding.state 도착 → 미조치 −1 · 배정 +1 · 40ms 현상 · 락온', async ({ page }) => {
  test.skip(!(await gwUp()), '게이트웨이 없음');
  const errs = []; page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  await gwAdmin(page); await page.goto(OPS + '/landxi/ops/index.html'); await ready(page);
  const sv = page.locator('[data-k="survey"]');
  await expect(sv).toBeVisible({ timeout: 10000 });
  await expect(sv.locator('.sv-bar i')).toHaveCount(5);
  const n = async (k) => Number((await sv.locator(`[data-k="sv-${k}"]`).textContent()).replace(/,/g, ''));
  const open0 = await n('open'), as0 = await n('assigned');
  expect(open0 + as0).toBeGreaterThan(0);
  if (!(await health())?.gateway?.opt?.survey || (await health()).gateway.opt.survey !== 200) await expect(sv.locator('.og-tag')).toHaveText('파일 합계');   // F2-S API 전: 파일 합계(전부 미조치) 정직 표기
  await page.waitForTimeout(1200);
  const t0 = Date.now();
  // 형식 = F2-S survey.py 가 ops 스트림에 내는 것 — {id, pnu, rule, from, to, by, at}
  await opsEvent('finding.state', { id: 'f2c-e2e-finding', pnu: '5219025021100010000', rule: 'R1', from: 'open', to: 'assigned', by: 'e2e', tenant_id: 'namwon', at: kst() });
  await expect(sv.locator('[data-k="sv-assigned"]')).toHaveText((as0 + 1).toLocaleString('ko-KR'), { timeout: 3000 });
  expect(Date.now() - t0).toBeLessThan(3000);
  expect(await n('open')).toBe(open0 - 1);
  expect(await sv.locator('.cw-digit').first().evaluate((d) => getComputedStyle(d).animationDuration)).toBe('0.04s');
  await expect(sv).toHaveClass(/is-lock/);
  // 되돌림(같은 형식) — 공용 스트림에 남긴 시험 흔적을 상쇄
  await opsEvent('finding.state', { id: 'f2c-e2e-finding', pnu: '5219025021100010000', rule: 'R1', from: 'assigned', to: 'open', by: 'e2e', tenant_id: 'namwon', at: kst() });
  await expect(sv.locator('[data-k="sv-assigned"]')).toHaveText(as0.toLocaleString('ko-KR'), { timeout: 3000 });
  expect(errs).toEqual([]);
});
