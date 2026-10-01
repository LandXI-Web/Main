import { test, expect } from '@playwright/test';
import fs from 'node:fs';

// F2-R 기관 포털 → 새 XI맵 — 영농관리(dp-nw-farm-25) 지도 탭 = XI맵 실태조사 모드 임베드 · 결과 탭 `의심 큐 ↗`
//   세션 인계: 같은 origin — iframe 안 XI맵이 lx_tenant_session 을 session.shadow() 로 읽어 기관(agency) 관문.
//   기존 결과 지도는 '결과 지도' 단추로 남는다(삭제 0) · 해외 기관(scope global)은 기관 레일 `Global ↗`.
const SHOTS = 'shots/f2/R';
fs.mkdirSync(SHOTS, { recursive: true });
const XI_SURVEY = '../xi/index.html?mode=survey&svc=dp-nw-farm-25&survey=farmland';
const NETWORK = /Failed to load resource|net::ERR|ERR_|status of 40|status of 50|AbortError/i;
function watch(page) {
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !NETWORK.test(m.text())) errs.push('console: ' + m.text()); });
  return errs;
}
async function asTenant(page, t = 'namwon') {
  await page.addInitScript((x) => { if (sessionStorage.getItem('b')) return; sessionStorage.setItem('b', '1'); localStorage.removeItem('lx_logged_in'); localStorage.removeItem('lx_role'); localStorage.setItem('lx_tenant_session', JSON.stringify({ tenant: x, at: '2026-06-08T09:00:00+09:00' })); }, t);
}
const boot = async (page, url) => { await page.goto(url); await page.waitForFunction(() => document.documentElement.dataset.shell === 'ready'); };

test('남원 영농관리 — 지도 탭 = XI맵 실태조사 임베드(iframe) · 안쪽 XI맵 = 기관 관문 · 결과 지도 단추로 기존 지도', async ({ page }) => {
  test.setTimeout(90000);
  const errs = watch(page);
  await asTenant(page);
  await boot(page, 'proto/portal-dp-nw-farm-25.html');
  await page.locator('.pt-tabs button[data-tab="map"]').click();
  const f = page.locator('#pt-xi');
  await expect(f).toHaveAttribute('src', XI_SURVEY + '&embed=1');
  await expect(page.locator('#pt-xi-open')).toHaveAttribute('href', XI_SURVEY);
  await expect(page.locator('[data-xi-view="xi"]')).toHaveAttribute('aria-pressed', 'true');
  // iframe 안 — 같은 origin 세션 인계
  const xi = page.frames().find((fr) => /\/landxi\/xi\/index\.html/.test(fr.url()));
  expect(xi, 'XI맵 iframe').toBeTruthy();
  await xi.waitForFunction(() => document.documentElement.dataset.lx === 'ready', null, { timeout: 45000 });
  const st = await xi.evaluate(() => ({ role: window.__xi.state.role, sh: window.__xi.state.session, embed: window.__xi.state.embed }));
  expect(st.role).toBe('agency');
  expect(st.sh).toMatchObject({ realm: 'tenant', tenant_id: 'namwon' });
  expect(st.embed).toBe(true);
  // 판정 1차: 720×560 칸에서 HUD 가 서로 덮었다 → 본문 전폭 · 높이 ≥ 720 · 필지 표는 지도 아래로
  const box = await f.boundingBox();
  const tabs = await page.locator('.pt-tabs').boundingBox();             // 본문 폭 = 탭 줄 폭
  expect(box.width).toBeGreaterThanOrEqual(tabs.width - 8); expect(box.height).toBeGreaterThanOrEqual(718);
  const parcel = await page.locator('[data-block="parcel"]').boundingBox();
  expect(parcel.y).toBeGreaterThanOrEqual(box.y + box.height);                   // 겹침 0 — 표는 지도 아래
  // XI맵 HUD 겹침 0 — 큰 숫자 · 판독/실태조사 토글 · 출처 카드 · 정보 카드가 서로 덮지 않는다(iframe 안 실측)
  await xi.waitForFunction(() => document.documentElement.dataset.restored === '1', null, { timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(2500);
  const hits = await xi.evaluate(() => {
    const vis = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 4 && r.height > 4 && cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0.05; };
    const hud = [...document.querySelectorAll('body *')].filter((e) => {
      const cs = getComputedStyle(e); if (!(cs.position === 'absolute' || cs.position === 'fixed')) return false;
      if (e.closest('.maplibregl-map canvas, .maplibregl-marker, .maplibregl-popup') || e.tagName === 'CANVAS') return false;
      const r = e.getBoundingClientRect(); return vis(e) && r.width < innerWidth * 0.9 && r.height < innerHeight * 0.9 && e.innerText?.trim();
    });
    const top = hud.filter((e) => !hud.some((o) => o !== e && o.contains(e)));
    const out = [];
    for (let i = 0; i < top.length; i++) for (let j = i + 1; j < top.length; j++) {
      const a = top[i].getBoundingClientRect(), b = top[j].getBoundingClientRect();
      const w = Math.min(a.right, b.right) - Math.max(a.left, b.left), h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (w > 6 && h > 6) out.push([top[i].id || top[i].className, top[j].id || top[j].className, Math.round(w), Math.round(h)].join(' × '));
    }
    return { n: top.length, out };
  });
  test.info().annotations.push({ type: 'hud', description: `XI HUD 최상위 ${hits.n}개 · 겹침 ${hits.out.length}` });
  expect(hits.out, 'XI맵 HUD 겹침(임베드 1254×718)').toEqual([]);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}/portal-map-xi-survey.png` });
  // 기존 결과 지도 — 삭제 0
  await page.locator('[data-xi-view="native"]').click();
  await expect(page.locator('#pt-xi-host')).toBeHidden();
  await expect(page.locator('.pt-native .pt-map')).toBeVisible();
  await page.locator('[data-xi-view="xi"]').click();
  await expect(page.locator('#pt-xi-host')).toBeVisible();
  expect(errs).toEqual([]);
});

test('결과 탭 — `의심 큐 ↗` = XI맵 실태조사 큐 딥링크(queue=1) · 누르면 XI맵 기관 관문 + 의심 큐 서랍이 열려 있다', async ({ page }) => {
  test.setTimeout(90000);
  await asTenant(page);
  await boot(page, 'proto/portal-dp-nw-farm-25.html');
  await page.locator('.pt-tabs button[data-tab="result"]').click();
  const q = page.locator('#pt-queue');
  await expect(q).toHaveText('의심 큐 ↗');
  await expect(q).toHaveAttribute('href', XI_SURVEY + '&queue=1');
  expect(await q.evaluate((e) => parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(14);
  await page.screenshot({ path: `${SHOTS}/portal-result-queue.png` });
  await q.click();
  await page.waitForURL(/\/landxi\/xi\/index\.html\?mode=survey/);
  await page.waitForFunction(() => document.documentElement.dataset.lx === 'ready', null, { timeout: 45000 });
  expect(await page.evaluate(() => window.__xi.state.role)).toBe('agency');
  // 도착 = 실태조사 모드 + 의심 큐 서랍(#fdrawer) 열림 · 건수(판정 1차: drawer=findings 는 판독 모드로 서고 큐 0이었다)
  await page.waitForFunction(() => document.documentElement.dataset.xmode === 'survey', null, { timeout: 30000 });
  const dr = page.locator('#fdrawer');
  await expect(dr).toBeVisible({ timeout: 30000 });
  await expect(dr).toContainText('의심 큐');
  await expect(dr.locator('.sv-tot')).toHaveText(/\d{1,3}(,\d{3})+/, { timeout: 30000 });
  await expect(dr.locator('.sv-item').first()).toBeVisible({ timeout: 30000 });
  await page.screenshot({ path: `${SHOTS}/portal-queue-arrive.png` });
});

test('실태조사가 서지 않는 카드(도로 안전)는 예전 결과 지도 그대로 · 큐 링크 0', async ({ page }) => {
  await asTenant(page);
  await boot(page, 'proto/portal-dp-nw-road-26.html');
  await page.locator('.pt-tabs button[data-tab="map"]').click();
  await expect(page.locator('#pt-xi')).toHaveCount(0);
  await page.locator('.pt-tabs button[data-tab="result"]').click();
  await expect(page.locator('#pt-queue')).toHaveCount(0);
});

test('기관 문 ?next=../xi/…(실태조사) — 기관 로그인 뒤 그리로 간다 · 바깥 주소는 거른다', async ({ page }) => {
  test.setTimeout(60000);
  await page.goto('proto/portal-login-namwon.html?next=' + encodeURIComponent(XI_SURVEY));
  await page.locator('#pl-id').fill('lxadmin@lx.or.kr');
  await page.locator('#pl-pw').fill('x');
  await page.locator('.pl-b').click();
  await page.waitForURL(/\/landxi\/xi\/index\.html\?mode=survey/);
  await page.waitForFunction(() => document.documentElement.dataset.lx === 'ready', null, { timeout: 45000 });
  expect(await page.evaluate(() => window.__xi.state.role)).toBe('agency');
  await page.evaluate(() => localStorage.clear());
  await page.goto('proto/portal-login-namwon.html?next=' + encodeURIComponent('https://evil.example/x.html'));
  await page.locator('#pl-id').fill('a'); await page.locator('#pl-pw').fill('b'); await page.locator('.pl-b').click();
  await page.waitForURL(/\/landxi\/proto\/portal\.html$/);
});

test('기관 레일 Global ↗ — 해외 기관(scope global · kgz-*)만 · 남원 레일에는 없다', async ({ page }) => {
  test.skip(true, 'F3 통합(2026-09-29) — 구 proto 레일은 v3 집으로 옮겼다 · 대체: v3-integration.spec');
  await asTenant(page);
  await boot(page, 'proto/portal.html');
  await expect(page.locator('#rail a[data-menu="global"]')).toHaveCount(0);
  // 정직: 제품에서 지금 Global ↗ 이 보이는 곳 = 0(portal.js TENANTS 에 kgz 기관 줄이 없다 · F2-D 에 한 줄 추가 요청).
  // 이 단언은 **테스트 주입**으로 셸의 분기만 검증한다 — 기관 한 줄이 들어오면 제품에서 그대로 선다.
  await page.evaluate(async () => { const m = await import('./shell.js'); m.mountShell({ tenant: { id: 'kgz-agri', scope: 'global', name: 'Kyrgyz Ministry of Agriculture', home: 'portal.html' }, gate: false, title: 'kgz' }); });
  const g = page.locator('#rail a[data-menu="global"]');
  await expect(g).toHaveText('Global ↗');
  await expect(g).toHaveAttribute('href', '../global/index.html?locale=en');
  const r = await page.request.get(new URL('../global/index.html', page.url()).href);
  expect(r.status()).toBe(200);
});

test('기관 레일 Global ↗ — 제품 경로(주입 0): portal.js scope global 기관 문으로 로그인 → 레일에 Global ↗', async ({ page }) => {
  await page.goto('proto/portal-login-namwon.html');
  const kgz = await page.evaluate(async () => { const m = await import('../assets/data/portal.js'); const t = m.TENANTS.find((x) => x.scope === 'global' || /^kgz-/.test(x.id)); return t ? { id: t.id, login: t.login || null, home: t.home } : null; });
  // 정직: 기관 한 줄(portal.js · F2-D/통합자 소유)이 들어오기 전에는 건너뛴다 — 들어오면 이 테스트가 주입 없이 분기를 재확인한다.
  test.skip(!kgz || !kgz.login, 'portal.js TENANTS 에 scope global 기관 줄(+ login 문) 없음 — F2-D/통합자 대기');
  await page.evaluate(() => localStorage.clear());
  await page.goto('proto/' + kgz.login);
  await page.locator('#pl-id').fill('kgz'); await page.locator('#pl-pw').fill('kgz-2026'); await page.locator('.pl-b').click();
  await page.waitForURL((u) => !/portal-login/.test(u.href));
  await page.waitForFunction(() => document.documentElement.dataset.shell === 'ready');
  const g = page.locator('#rail a[data-menu="global"]');
  await expect(g).toHaveText('Global ↗');
  await expect(g).toHaveAttribute('href', '../global/index.html?locale=en');
  await page.screenshot({ path: `${SHOTS}/portal-kgz-global-real.png` });
});
