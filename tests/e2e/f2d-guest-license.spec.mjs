// F2-D · 1차 판정 must_fix 6② — 게스트(public)·export 에서 Maxar 대신 S2 전후면 라이선스 칩도 'Copernicus Sentinel-2 · EMS'.
// 대조: LX(build=lx)는 Maxar CC BY-NC 시연 칩.
import { test, expect } from '@playwright/test';

async function boot(page, url, who) {
  await page.addInitScript((who) => {
    if (sessionStorage.getItem('lx_e2e_boot')) return; sessionStorage.setItem('lx_e2e_boot', '1');
    localStorage.setItem('lx_api_mode', 'off'); localStorage.removeItem('lx_tenant_session');
    if (who === 'lx') { localStorage.setItem('lx_logged_in', '1'); localStorage.setItem('lx_role', 'staff'); } else { localStorage.removeItem('lx_logged_in'); localStorage.removeItem('lx_role'); }
  }, who);
  await page.goto(url);
  await page.waitForFunction(() => document.documentElement.dataset.lx === 'ready', null, { timeout: 30000 });
}
function watch(page) {
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/CORS policy|net::ERR_FAILED|ERR_CONNECTION_RESET|ERR_HTTP2_SERVER_REFUSED_STREAM|ERR_NO_BUFFER_SPACE/.test(m.text())) errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push('pageerror ' + e.message));
  return errs;
}
const lic = (page) => page.evaluate(() => ({ kind: document.getElementById('mk-lic')?.dataset.lic, text: document.getElementById('mk-lic')?.innerText || '', maxar: window.__f1d.scenes.mk.S.maxar, build: window.__f1d.build, tenant: window.__f1d.tenant, ladder: document.querySelector('.g-ladder__now')?.innerText || '', chips: [...document.querySelectorAll('.gs-swipe__side')].map((e) => e.innerText).join(' | ') }));

test.describe('F2-D guest license chip', () => {
  test.setTimeout(90000);
  for (const [name, url, who] of [['guest · public', '/landxi/global/index.html?locale=en', 'guest'], ['LX · build=export', '/landxi/global/index.html?tenant=lx&locale=en&build=export', 'lx']]) {
    test(`${name} — S.maxar false → 'Copernicus Sentinel-2 · EMS' · Maxar 글자 0`, async ({ page }) => {
      const errs = watch(page);
      await boot(page, url, who);
      await page.evaluate(() => window.__f1d.go('meiktila'));
      // 판정 3차: export 에서 swipeOn 직후 0.5–1.5 s deficitB 99 → 하강 동안 사후 그래뉼(착지 · 세부 화면)을 캐시에 받아 두고 켠다 — 0.5 s 표본 부족 ≤ 1
      const warm = await page.evaluate(async () => { await window.__f1d.stage.warmPost; return window.__f1dPf.slice(-1)[0]?.post || null; });
      await page.evaluate(() => { window.__f1d.scenes.mk.swipeOn(50); });
      const early = [];
      for (const at of [250, 500]) { await page.waitForTimeout(250); early.push(await page.evaluate(() => window.__f1d.tileDeficitB().max)); }
      console.log('post warm', JSON.stringify(warm), 'deficitB at 250/500 ms', JSON.stringify(early));
      expect(early[1], 'deficitB 0.5 s after swipeOn').toBeLessThanOrEqual(1);
      await page.waitForTimeout(100);
      const r = await lic(page);
      expect(r.maxar).toBe(false);
      expect(r.kind).toBe('s2');
      expect(r.text).toContain('Copernicus Sentinel-2 · EMS');
      expect(r.text).not.toMatch(/Maxar Open Data|CC BY-NC/);
      expect(r.ladder).not.toContain('Maxar');
      expect(r.chips).not.toContain('Maxar 2025');
      // 판정 2차: 스와이프가 켜진 뒤 대역 마무리(비행 대역 · arriveCross)가 post 층을 끄면 오른쪽이 배경색만(tileDeficitB 99).
      // 0.5 · 2 · 4 · 8 s 에 사후 층이 보이고, 8 s 까지 두 번째 지도 부족 ≤ 1 · post 쪽 캔버스가 배경색 단색이 아니다.
      const vis = [];
      for (const at of [500, 2000, 4000, 8000]) {
        await page.waitForTimeout(at - (vis.length ? [500, 2000, 4000, 8000][vis.length - 1] : 600 - 100));
        vis.push(await page.evaluate(() => { const B = window.__f1d.stage.mapB; const v = (id) => (B.getLayer(id) ? B.getLayoutProperty(id, 'visibility') || 'visible' : 'absent'); return { base: v('b-base'), post: v('b-maxar'), deficitB: window.__f1d.tileDeficitB().max, swipe: document.getElementById('root').dataset.swipe }; }));
      }
      console.log('post', JSON.stringify(vis));
      for (const x of vis) { expect(x.post, JSON.stringify(vis)).toBe('visible'); expect(x.base).toBe(r.build === 'export' ? 'absent' : 'visible'); expect(x.swipe).toBe('1'); }
      expect(vis[vis.length - 1].deficitB, JSON.stringify(vis)).toBeLessThanOrEqual(1);
      // export 는 EOX(비상업) 없음 → 사후 S2 그래뉼(T46QGJ · 화면 전체를 덮는 것)만 · 오른쪽 절반 픽셀 — 배경색(#6F6A5E) 단색이면 영상이 없는 것
      const shot = await page.screenshot({ clip: { x: 1000, y: 300, width: 300, height: 300 } });
      const uniq = await page.evaluate(async (b64) => { const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode(); const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0); const d = g.getImageData(0, 0, c.width, c.height).data; const s = new Set(); for (let i = 0; i < d.length; i += 4 * 97) s.add(((d[i] >> 3) << 10) | ((d[i + 1] >> 3) << 5) | (d[i + 2] >> 3)); return s.size; }, shot.toString('base64'));
      expect(uniq, 'post side has imagery (colour variety)').toBeGreaterThan(40);
      expect(errs).toEqual([]);
    });
  }
  // 판정 3차: public 빌드(세션 없음 · lx_api_base 설정 = on 모드)에서 GET /deploys → 401 → 콘솔 'Failed to load resource: 401'.
  // 게스트는 인증 라우트(배포본 · 견적 · 제출 · 변화탐지 사전 점검)를 부르지 않는다 — 콘솔 오류 0 · :8700 응답 ≥ 400 0(리소스 오류를 필터가 놓치지 않게 응답으로도 센다).
  test('게스트 on 모드(세션 없음) — 401 리소스 오류 0 · 배포본은 픽스처', async ({ page }) => {
    const gw = await fetch('http://localhost:8700/api/v1/health', { signal: AbortSignal.timeout(1500) }).then((r) => r.ok).catch(() => false);
    test.skip(!gw, '게이트웨이 :8700 필요');
    const errs = watch(page), bad = [];
    page.on('response', (r) => { if (r.status() >= 400 && /:8700\//.test(r.url())) bad.push(`${r.status()} ${r.url().slice(0, 120)}`); });
    await page.addInitScript(() => { if (sessionStorage.getItem('g')) return; sessionStorage.setItem('g', 1); localStorage.setItem('lx_api_base', 'http://localhost:8700'); ['lx_api_mode', 'lx_api_session', 'lx_logged_in', 'lx_role', 'lx_tenant_session'].forEach((k) => localStorage.removeItem(k)); });
    await page.goto('/landxi/global/index.html?locale=en');
    await page.waitForFunction(() => document.documentElement.dataset.lx === 'ready', null, { timeout: 30000 });
    const st = await page.evaluate(() => ({ mode: window.__f1d.state().mode, tenant: window.__f1d.tenant, build: window.__f1d.build, via: window.__f1d.ctx.deploys.via }));
    expect(st).toMatchObject({ mode: 'on', tenant: 'guest', build: 'public' });
    expect(st.via).toMatch(/fixture/);
    await page.evaluate(() => window.__f1d.go('ysykata'));
    await page.evaluate(async () => { const y = window.__f1d.scenes.ys; y.frame(); await y.quote(); });
    await page.evaluate(() => window.__f1d.go('sokuluk'));
    await page.click('#sk-run');
    await page.waitForTimeout(800);
    const pre = await page.evaluate(() => window.__f1d.scenes.sk.S?.change || null);
    await page.evaluate(() => window.__f1d.go('meiktila'));
    await page.evaluate(() => window.__f1d.scenes.mk.swipeOn(50));
    await page.waitForTimeout(1000);
    console.log('guest-on', JSON.stringify({ st, pre, bad }));
    expect(bad).toEqual([]);
    expect(errs).toEqual([]);
  });
  test('대조 — LX(build=lx) · Maxar 가능 → CC BY-NC 시연 칩', async ({ page }) => {
    const errs = watch(page);
    await boot(page, '/landxi/global/index.html?tenant=lx&locale=en', 'lx');
    await page.evaluate(() => window.__f1d.go('meiktila'));
    const r = await lic(page);
    expect(r.maxar).toBe(true);
    expect(r.kind).toBe('maxar');
    expect(r.text).toContain('Maxar Open Data CC BY-NC 4.0 · demo only');
    expect(errs).toEqual([]);
  });
});
