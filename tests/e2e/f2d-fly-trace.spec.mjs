// F2-D · 1차 판정 must_fix 1 — 하강 스냅 → 비행. 장거리(≥ 6 줌) = --e-fly cubic-bezier(.45,0,.25,1) 2400 ·
// 100 ms 재표본 z 트레이스 프레임당 Δz ≤ 1.5 · 곡률 가시(z < 5) ≥ 1 s(글로브↔으슥아타 · 글로브→메이크틸라) · 단거리 = --e-cam.
// 판정 3차: 경유(z 2.4)→메이크틸라 z<5 0.67 s < 1 s · 'Δz ≥ 10 예외'는 법전에 없다 → 같은 --e-fly 곡선 · Δz ≥ 10 = 3200(판정 제시 값) ·
// 출발 줌 정점(minZoom = z0) · 경유점 = 글로브 카메라. 하한 1000 복원.
import { test, expect } from '@playwright/test';

async function boot(page, url) {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('lx_e2e_boot')) { sessionStorage.setItem('lx_e2e_boot', '1'); localStorage.setItem('lx_api_mode', 'off'); localStorage.setItem('lx_logged_in', '1'); localStorage.setItem('lx_role', 'staff'); }
    window.__zt = []; const f = () => { try { const m = window.__f1d?.stage?.map; if (m) window.__zt.push([performance.now(), m.getZoom()]); } catch { /* */ } requestAnimationFrame(f); }; requestAnimationFrame(f);
  });
  await page.goto(url);
  await page.waitForFunction(() => document.documentElement.dataset.lx === 'ready', null, { timeout: 30000 });
}
function watch(page) {
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/CORS policy|net::ERR_FAILED|ERR_CONNECTION_RESET|ERR_HTTP2_SERVER_REFUSED_STREAM|ERR_NO_BUFFER_SPACE/.test(m.text())) errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push('pageerror ' + e.message));
  return errs;
}
/** 비행 기록마다 100 ms 재표본 */
async function traces(page) {
  return page.evaluate(() => (window.__f2dFlights || []).map((fl) => {
    const zt = window.__zt.filter((x) => x[0] >= fl.t - 50 && x[0] <= (fl.end || fl.t + fl.ms) + 50);
    const at = (t) => { let b = zt[0]; for (const x of zt) { if (x[0] <= t) b = x; else break; } return b ? b[1] : fl.z0; };
    const fr = []; for (let t = fl.t; t <= fl.t + fl.ms; t += 100) fr.push(at(t)); fr.push(fl.z1);
    const dz = fr.slice(1).map((z, i) => Math.abs(z - fr[i]));
    const lo = zt.filter((x) => x[1] < 5);
    return { ...fl, frames: fr.map((z) => +z.toFixed(3)), max_dz: +Math.max(...dz).toFixed(3), lt5_ms: lo.length ? Math.round(lo[lo.length - 1][0] - lo[0][0]) : 0, took: (fl.end || 0) - fl.t };
  }));
}

test.describe('F2-D fly trace (--e-fly)', () => {
  test.setTimeout(120000);

  test('글로브 → 으슥아타 · 후퇴 · 경유 → 메이크틸라: --e-fly 2400 · 100 ms 당 Δz ≤ 1.5 · 으슥아타·후퇴 곡률 ≥ 1 s', async ({ page }) => {
    const errs = watch(page);
    await boot(page, '/landxi/global/index.html?tenant=lx&locale=en');
    await page.waitForTimeout(500);
    for (const s of ['ysykata', 'globe', 'sokuluk', 'meiktila']) await page.evaluate((s) => window.__f1d.go(s, { force: true }), s);
    await page.waitForTimeout(600);
    const T = await traces(page);
    const long = T.filter((f) => Math.abs(f.z1 - f.z0) >= 6);
    expect(long.length).toBeGreaterThanOrEqual(4);   // 글로브→으슥아타 · 으슥아타→글로브 · 소쿨룩→경유 · 경유→메이크틸라(+ 글로브→소쿨룩)
    for (const f of long) {
      expect(f.ease, `${f.z0}→${f.z1}`).toBe('e-fly');
      const want = Math.abs(f.z1 - f.z0) >= 10 ? 3200 : 2400;   // --e-fly 2400 · 초장거리(Δz ≥ 10) 3200
      expect(f.ms, `${f.z0}→${f.z1}`).toBe(want);
      expect(f.took).toBeGreaterThan(want - 100);
      expect(f.max_dz, `${f.z0}→${f.z1} frames ${f.frames.join(' ')}`).toBeLessThanOrEqual(1.5);
      // ease-in-out: 앞 300 ms 와 뒤 300 ms 는 느리다(스냅 0) — 첫 100 ms Δz < 0.2
      expect(Math.abs(f.frames[1] - f.frames[0])).toBeLessThan(0.2);
    }
    const ys = long.find((f) => f.z0 < 2 && f.z1 > 9 && f.z1 < 10);
    const up = long.find((f) => f.z0 > 9 && f.z1 < 2);
    expect(ys.lt5_ms, 'globe → Ysyk-Ata curvature').toBeGreaterThanOrEqual(1000);
    expect(up.lt5_ms, 'retreat curvature').toBeGreaterThanOrEqual(1000);
    const mk = long.find((f) => f.z1 > 13);
    test.info().annotations.push({ type: 'meiktila z<5 ms', description: String(mk.lt5_ms) });
    expect(mk.z0, 'transit = globe camera').toBeLessThan(2);
    expect(mk.lt5_ms, `Meiktila curvature frames ${mk.frames.join(' ')}`).toBeGreaterThanOrEqual(1000);   // 판정 3차 — 하한 1000 복원(예외 없음)
    // 단거리(으슥아타 → 소쿨룩 Δ0.8)는 --e-cam
    const short = T.filter((f) => Math.abs(f.z1 - f.z0) < 6 && f.ease);
    for (const f of short.filter((f) => f.z0 > 9 && f.z1 > 9)) expect(f.ease).toBe('e-cam');
    expect(errs).toEqual([]);
  });

  test('대륙 간(메이크틸라 → 소쿨룩)은 글로브 경유 두 비행 — 각 Δz ≤ 1.5', async ({ page }) => {
    const errs = watch(page);
    await boot(page, '/landxi/global/index.html?tenant=lx&locale=en');
    await page.evaluate(() => window.__f1d.go('meiktila'));
    await page.evaluate(() => { window.__f2dFlights = []; });
    await page.evaluate(() => window.__f1d.go('sokuluk'));
    await page.waitForTimeout(300);
    const T = await traces(page);
    expect(T.length).toBe(2);
    expect(T[0].z1).toBeLessThan(3);   // 경유점(글로브)
    for (const f of T) { expect(f.ease).toBe('e-fly'); expect(f.max_dz).toBeLessThanOrEqual(1.5); }
    expect(errs).toEqual([]);
  });
});
