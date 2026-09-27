// F2-C · 계보 딥링크(v1.1-29) — ?job= 행 펼침(shard · GPU·s · 워커 · 기관 · 배포본 · done 두 줄) + 강조 + XI맵/Global 왕복 · ?deploy= · ?tenant= · 배포 '카드 ↗'(F2-R URL)
import { test, expect } from '@playwright/test';
import { OPS, gwUp, gwAdmin, gwGet, ready } from '../../shots/f2/C/tools/e2e-util.mjs';
test.setTimeout(60000);

test('?job= → 큐 행 is-focus · is-open · 두 줄 · XI맵/기관 링크 · 누른 행이 URL 이 된다', async ({ page }) => {
  test.skip(!(await gwUp()), '게이트웨이 없음');
  const errs = []; page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  const s = await gwAdmin(page);
  const jobs = (await gwGet(s, '/jobs?limit=50')).items || [];
  const j = jobs.find((x) => x.state === 'done' && x.pool === 'a6000' && x.gpu_s?.value) || jobs[0];
  test.skip(!j, '작업 없음');
  await page.goto(`${OPS}/landxi/ops/infra.html?job=${j.id}`); await ready(page);
  const row = page.locator(`.q-row[data-job="${j.id}"]`);
  await expect(row).toHaveClass(/is-focus/); await expect(row).toHaveClass(/is-open/);
  await expect(row.locator('.q-more')).toBeVisible();
  await expect(row.locator('.qd-prog')).toContainText(`${j.shards_done.toLocaleString('ko-KR')}/${j.shards_total.toLocaleString('ko-KR')} shard`);
  await expect(row.locator('.qd-grid')).toContainText(j.tenant_id);
  await expect(row.locator('.qd-grid')).toContainText((j.workers || [])[0] || '—');
  await expect(row.locator('[data-k="done-two"]')).toContainText(/GPU 초당 [\d.]+칩 · 벽시계 [\d.]+칩\/s/);
  await expect(row.locator('[data-k="done-two"]')).toContainText(/이 작업 [\d.]+ GPU·s · [\d.]+ s/);
  expect(await row.locator('[data-k="to-xi"]').getAttribute('href')).toBe(`http://localhost:4173/landxi/xi/?job=${j.id}`);
  expect(await row.locator('[data-k="to-tenant"]').getAttribute('href')).toBe(`/landxi/ops/tenants.html?tenant=${j.tenant_id}`);
  expect(await page.locator('.og-nav a[data-page="xi"]').getAttribute('href')).toBe(`http://localhost:4173/landxi/xi/?job=${j.id}`);
  expect(await page.locator('.og-nav a[data-page="global"]').getAttribute('href')).toBe(`http://localhost:4173/landxi/global/?job=${j.id}`);
  const inView = await row.evaluate((el) => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.top < innerHeight; }); expect(inView).toBe(true);   // 스크롤
  // 다른 행을 누르면 그 행이 초점 · URL ?job= 도 따라간다(공유 가능한 링크)
  const other = page.locator('.q-row').filter({ hasNot: page.locator('.is-focus') }).nth(1);
  const oid = await other.getAttribute('data-job');
  if (oid && oid !== j.id) { await other.locator('.q-id').click(); await expect(page).toHaveURL(new RegExp(`job=${oid}`)); await expect(page.locator(`.q-row[data-job="${oid}"]`)).toHaveClass(/is-focus/); }
  expect(errs).toEqual([]);
});

test('kgz(Global) 작업은 행 안에 Global ↗ 왕복 링크', async ({ page }) => {
  test.skip(!(await gwUp()), '게이트웨이 없음');
  const s = await gwAdmin(page);
  const j = ((await gwGet(s, '/jobs?limit=50')).items || []).find((x) => /^kgz/.test(x.tenant_id) || x.kind === 'index');
  test.skip(!j, 'kgz/index 작업 없음');
  await page.goto(`${OPS}/landxi/ops/infra.html?job=${j.id}`); await ready(page);
  expect(await page.locator(`.q-row[data-job="${j.id}"] [data-k="to-global"]`).getAttribute('href')).toBe(`http://localhost:4173/landxi/global/?job=${j.id}`);
});

test('?deploy= → 배포본 열림 · 카드 ↗(ai-card.html?card=&version=) · XI맵 ↗ · ?tenant= → 기관 선택', async ({ page }) => {
  test.skip(!(await gwUp()), '게이트웨이 없음');
  const errs = []; page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  const s = await gwAdmin(page);
  const d = await gwGet(s, '/deploys/dp-nw-farm-25');
  await page.goto(`${OPS}/landxi/ops/deploys.html?deploy=dp-nw-farm-25`); await ready(page);
  await expect(page.locator('.pn-head')).toContainText('dp-nw-farm-25');
  expect(await page.locator('[data-k="to-card"]').getAttribute('href')).toBe(`http://localhost:4173/landxi/proto/ai-card.html?card=card-farm&version=${d.version}`);
  expect(await page.locator('.pn-head [data-k="to-xi"]').getAttribute('href')).toBe('http://localhost:4173/landxi/xi/?deploy=dp-nw-farm-25');
  await expect(page.locator('.aud')).not.toContainText('경로 없음');   // 게이트웨이 직결에서도 정본 audit_log(읽기만)
  await page.goto(`${OPS}/landxi/ops/tenants.html?tenant=namwon`); await ready(page);
  await expect(page.locator('.tn-item[data-t="namwon"]')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.tn-ring')).toHaveCount(8);
  expect(errs).toEqual([]);
});
