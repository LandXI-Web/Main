// F2-C · 재부팅 복구 칩(v1.1-15) — 게이트웨이 복구 결과(Job.recovered · /health.recovered_at_boot)와 ops 스트림 job.state{reason:'recovered'} → 큐 행 '복구 · 재개 a/b' + 경보 한 줄 + 마스트 칩
import { test, expect } from '@playwright/test';
import { OPS, gwUp, gwAdmin, gwGet, ready, opsEvent, kst, health } from '../../shots/f2/C/tools/e2e-util.mjs';
test.setTimeout(60000);

test('F2-B 실증 작업(Job.recovered) → 큐 행 칩 · 마스트 재부팅 복구 칩', async ({ page }) => {
  test.skip(!(await gwUp()), '게이트웨이 없음');
  const s = await gwAdmin(page);
  const j = ((await gwGet(s, '/jobs?limit=50')).items || []).find((x) => x.recovered);
  test.skip(!j, '복구된 작업 없음(F2-B 실증 전)');
  await page.goto(`${OPS}/landxi/ops/infra.html?job=${j.id}`); await ready(page);
  // 3차: 핀 행(단건 GET)은 ready 전에 선다(html[data-pin=row]) — 일시 실패는 화면이 0.7 s × 3 재시도 · spec 은 행 도착을 기다린 뒤 단언
  await expect(page.locator('html')).toHaveAttribute('data-pin', 'row', { timeout: 10000 });
  const row = page.locator(`.q-row[data-job="${j.id}"]`); await expect(row).toBeVisible({ timeout: 10000 });
  const chip = row.locator('[data-k="recovered"]');
  await expect(chip).toHaveText(/복구 · 재개 \d+\/\d+|복구 실패/, { timeout: 10000 });
  expect(await chip.getAttribute('title')).not.toContain('\uFFFD');   // 원문 인코딩 손상 조각은 걷어 낸다
  const h = await health();
  const rb = h?.gateway?.recovered_at_boot; const nb = rb ? (rb.resumed || 0) + (rb.requeued || 0) + (rb.failed || 0) : 0;
  if (!nb) await expect(page.locator('.og-mast [data-k="recovered"]')).toBeHidden();   // 이번 기동에서 복구 0 → 칩 숨김(정직)
  else { await expect(page.locator('.og-mast [data-k="recovered"]')).toBeVisible(); await expect(page.locator('[data-k="rec-line"]')).toContainText('재부팅 복구'); }
});

test('ops 스트림 job.state{reason:recovered} 도착 → 1s 안에 칩 · 경보 한 줄', async ({ page }) => {
  test.skip(!(await gwUp()), '게이트웨이 없음');
  const s = await gwAdmin(page);
  const j = ((await gwGet(s, '/jobs?limit=50')).items || []).find((x) => x.state === 'done' && !x.recovered && x.shards_total > 8);
  test.skip(!j, '대상 작업 없음');
  await page.goto(`${OPS}/landxi/ops/infra.html?job=${j.id}`); await ready(page);
  await page.waitForTimeout(1500);   // SSE 연결
  const t0 = Date.now();
  // 형식 = F2-B recovery.sweep 이 ops 스트림에 내는 것(v1.1-15) — 이 작업은 이미 끝났으므로 상태는 그대로 두고 칩만 확인한다
  await opsEvent('job.state', { job_id: j.id, tenant_id: j.tenant_id, state: j.state, pool: j.pool, reason: 'recovered', mode: 'resumed', shards_done: Math.floor(j.shards_total * 0.4), shards_total: j.shards_total, detail: 'e2e f2c-recovered-chip', at: kst() });
  const chip = page.locator(`.q-row[data-job="${j.id}"] [data-k="recovered"]`);
  await expect(chip).toHaveText(`복구 · 재개 ${Math.floor(j.shards_total * 0.4).toLocaleString('ko-KR')}/${j.shards_total.toLocaleString('ko-KR')}`, { timeout: 4000 });
  expect(Date.now() - t0).toBeLessThan(4000);
  await expect(page.locator('[data-k="rec-line"]')).toContainText(j.id.slice(-8));
});
