// F1-D · 판정 2차 불합격 6건 회귀 — 무표시 흰 화면 0 · 연도 표기 · HUD 숫자 트윈 · 카드 한 번에 · 관제 딥링크 결손 칩 · 극 캡
import { test, expect } from '@playwright/test';

async function boot(page, url) {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('lx_e2e_boot')) return; sessionStorage.setItem('lx_e2e_boot', '1');
    localStorage.setItem('lx_api_mode', 'off'); localStorage.setItem('lx_logged_in', '1'); localStorage.setItem('lx_role', 'staff');
  });
  const t0 = Date.now();
  await page.goto(url);
  await page.waitForFunction(() => document.documentElement.dataset.lx === 'ready', null, { timeout: 30000 });
  return Date.now() - t0;
}
function watch(page) {
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/CORS policy|net::ERR_FAILED|ERR_CONNECTION_RESET|ERR_HTTP2_SERVER_REFUSED_STREAM|ERR_NO_BUFFER_SPACE/.test(m.text())) errs.push(m.text()); });   // F2-D: 외부 타일 원천(EOX · PC · GIBS) CORS 간헐 거절은 별도 분류(F1-D 요청 4)
  page.on('pageerror', (e) => errs.push('pageerror ' + e.message));
  return errs;
}

test.describe('F1-D verdict 2', () => {
  test('from=namwon — 가림막 0 · ready ≤ 5 s · 남원 대역 지도 보임 · 데우기는 칩 n/m 로 보이고 끝나면 본 지도로', async ({ page }) => {
    const errs = watch(page);
    const ms = await boot(page, '/landxi/global/index.html?tenant=lx&locale=en&from=namwon');
    expect(ms).toBeLessThan(5000);
    const s = await page.evaluate(() => ({ warm: document.getElementById('root').dataset.warm, opA: getComputedStyle(document.getElementById('map')).opacity,
      cover: document.getElementById('root').dataset.bcover, pf: document.getElementById('pf').hidden ? '' : document.getElementById('pf').textContent }));
    expect(s.warm).toBeUndefined();
    expect(s.opA).toBe('1');
    if (s.cover === '1') expect(s.pf).toMatch(/Pre-fetching imagery\s*\d+\/\d+/);   // 대역이 덮는 동안에는 반드시 진행 표시
    await page.waitForFunction(() => window.__f1dWarm, null, { timeout: 40000 });
    await page.waitForFunction(() => document.getElementById('root').dataset.bcover === undefined, null, { timeout: 3000 });   // F2-D: 대역이 걷히는 500 동안 출발 가능
    const after = await page.evaluate(() => ({ cover: document.getElementById('root').dataset.bcover, pf: document.getElementById('pf').hidden, z: window.__f1d.stage.map.getZoom() }));
    expect(after.cover).toBeUndefined();
    expect(after.pf).toBe(true);
    expect(after.z).toBeGreaterThan(12);   // 본 지도는 남원 카메라로 돌아와 있다
    expect(errs).toEqual([]);
  });

  test('사업국 목록 연도 — 같은 해 한 번 · 다른 해 YYYY–YY · 미정 YYYY–', async ({ page }) => {
    await boot(page, '/landxi/global/index.html?tenant=lx&locale=en');
    const yrs = await page.$$eval('.gs-row em', (els) => els.map((e) => e.textContent.trim()));
    expect(yrs.length).toBeGreaterThan(30);
    for (const y of yrs) {
      expect(y).toMatch(/^\d{4}(–(\d{2})?)?$/);
      const m = y.match(/^(\d{2})(\d{2})–(\d{2})$/); if (m) expect(m[3]).not.toBe(m[2]);
    }
    const r = await page.evaluate(async () => { const { yearSpan } = await import('/landxi/global/js/globe-stage.js'); return [yearSpan('2025-01', '2025-12'), yearSpan('2024-03', '2026-02'), yearSpan('2026-01', null)]; });
    expect(r).toEqual(['2025', '2024–26', '2026–']);
  });

  test('G-J1 — 큰 숫자는 트윈(자리별 0 재조립 0) · 관제 딥링크는 결손 칩 · 카드는 내용과 함께 한 번에', async ({ page }) => {
    const errs = watch(page);
    await boot(page, '/landxi/global/index.html?tenant=lx&locale=en');
    await page.evaluate(() => window.__f1d.go('ysykata'));
    await page.waitForSelector('#card:not([hidden])');
    // F2-D: 카드 한 번에 = F1-A fx/glass.textIn(카드 자신 · 500 · 자식 스태거 0)
    const card = await page.evaluate(() => { const c = document.getElementById('card'); return { self: c.getAnimations().some((a) => a.effect.getTiming().duration === 500) || c.classList.contains('g-in'), kids: c.querySelectorAll('.g-in-2, .g-in-3, .g-in-4').length }; });
    expect(card).toEqual({ self: true, kids: 0 });
    await page.evaluate(() => { const S = window.__f1d.scenes.ys; S.frame(); return S.quote(); });
    await page.evaluate(() => { window.__big = []; const f = () => { const el = document.querySelector('#hud-big'); if (el) window.__big.push(el.textContent); if (!window.__stopBig) requestAnimationFrame(f); }; requestAnimationFrame(f); window.__f1d.scenes.ys.run(); });
    await page.waitForFunction(() => window.__f1d.scenes.ys.S.job === 'done', null, { timeout: 60000 });
    const big = await page.evaluate(() => { window.__stopBig = true; return window.__big.filter((x) => x && x !== '—'); });
    expect(big.length).toBeGreaterThan(10);
    expect(big.every((x) => /^\d\.\d{2}NDVI$/.test(x))).toBe(true);   // '0' · '0.4' 같은 반쪽 숫자 프레임 0
    expect(big.filter((x) => x.startsWith('0.00')).length).toBe(0);
    await expect(page.locator('#hud-big .cw-digit')).toHaveCount(0);
    await expect(page.locator('#ys-next .g-lineage a')).toHaveCount(0);
    await expect(page.locator('#ys-next .g-lineage__wait')).toContainText('live runs only');   // F2-D: 라이브 작업은 관제 실링크(f2d-lineage-link)
    expect(errs).toEqual([]);
  });

  test('글로브 극 캡 — Blue Marble 은 z3+ · ±79°(짙은 남색 북극해 캡 0)', async ({ page }) => {
    await boot(page, '/landxi/global/index.html?tenant=lx&locale=en');
    const src = await page.evaluate(() => { const s = window.__f1d.stage.map.getStyle().sources['gibs-bm']; return { minzoom: s.minzoom, bounds: s.bounds }; });
    expect(src.minzoom).toBe(3);
    expect(src.bounds[3]).toBeLessThanOrEqual(79);
  });
});
