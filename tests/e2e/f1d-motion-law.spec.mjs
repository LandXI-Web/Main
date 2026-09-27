// F1-D · motion-law(F1-A spec 방식) — getAnimations 지속·지연 ⊆ 사다리 · 소스 스캔 · 스타일 전이 0 · 타일 페이드 500 · 카메라 1600/2400 · 락온 380 · 스윕 1000
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const API = process.env.LX_API === 'on' ? (process.env.LX_API_BASE || 'http://localhost:8700') : null;
async function bootApi(page, url, { realm = 'lx', role = 'staff', tenant = null } = {}) {   // F1-CONTRACT §12 복사(_roles.mjs import 금지)
  let session = null;
  if (API) {
    const r = await fetch(API + '/api/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(realm === 'lx' ? { realm, login: `lx-${role}`, password: process.env.DEV_PASSWORD } : { realm, tenant_id: tenant, login: `${tenant}-manager`, password: process.env.DEV_PASSWORD }) });
    session = await r.json();
  }
  await page.addInitScript(([s, api, realm, role, tenant]) => {
    if (sessionStorage.getItem('lx_e2e_boot')) return; sessionStorage.setItem('lx_e2e_boot', '1');
    if (api) localStorage.setItem('lx_api_base', api); else localStorage.setItem('lx_api_mode', 'off');
    if (s) localStorage.setItem('lx_api_session', JSON.stringify(s));
    if (realm === 'lx') { localStorage.setItem('lx_logged_in', '1'); localStorage.setItem('lx_role', role); localStorage.removeItem('lx_tenant_session'); }
    else { localStorage.removeItem('lx_logged_in'); localStorage.removeItem('lx_role'); localStorage.setItem('lx_tenant_session', JSON.stringify({ tenant, at: '2026-09-24T09:00:00+09:00' })); }
  }, [session, API, realm, role, tenant]);
  await page.goto(url);
  await page.waitForFunction(() => document.documentElement.dataset.lx === 'ready', null, { timeout: 30000 });
}
function watch(page) {
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/CORS policy|net::ERR_FAILED|ERR_CONNECTION_RESET|ERR_HTTP2_SERVER_REFUSED_STREAM|ERR_NO_BUFFER_SPACE/.test(m.text())) errs.push(m.text()); });   // F2-D: 외부 타일 원천(EOX · PC · GIBS) CORS 간헐 거절은 별도 분류(F1-D 요청 4)
  page.on('pageerror', (e) => errs.push('pageerror ' + e.message));
  return errs;
}

const LADDER = [40, 60, 80, 120, 180, 380, 500, 750, 1000, 1250, 1600, 2400];
const OK = new Set([0, 1, ...LADDER]);

test.describe('F1-D motion law', () => {
  test.setTimeout(150000);

  test('소스 스캔 — CSS·JS 의 ms 리터럴 · duration 숫자 ⊆ 사다리', () => {
    const files = ['landxi/global/global.css', 'landxi/assets/css/v2/globe-stage.css', 'landxi/global/css/fonts-v2.css', ...fs.readdirSync('landxi/global/js').map((f) => 'landxi/global/js/' + f)];
    const bad = [];
    for (const f of files) {
      const s = fs.readFileSync(f, 'utf8');
      for (const m of s.matchAll(/(?<![\w.-])(\d{2,5})ms\b/g)) if (!OK.has(+m[1])) bad.push(f + ' ' + m[0]);
      for (const m of s.matchAll(/duration:\s*(\d+)/g)) if (!OK.has(+m[1])) bad.push(f + ' ' + m[0]);
      for (const m of s.matchAll(/wait\((\d+)\)/g)) if (!OK.has(+m[1])) bad.push(f + ' ' + m[0]);
    }
    expect(bad).toEqual([]);
  });

  test('실행 중 getAnimations ⊆ 사다리 · 락온 380 · 스윕 1000 · 스타일 전이 0 · raster-fade 500 · 카메라 1600/2400', async ({ page }) => {
    const errs = watch(page);
    await bootApi(page, '/landxi/global/index.html?tenant=lx&locale=en');
    await page.evaluate(() => {
      window.__anims = new Map(); window.__cams = [];
      const m = window.__f1d.stage.map; const fl = m.flyTo.bind(m), ez = m.easeTo.bind(m);
      m.flyTo = (o, e) => { window.__cams.push(o.duration); return fl(o, e); };
      m.easeTo = (o, e) => { window.__cams.push(o.duration); return ez(o, e); };
      const tick = () => { for (const a of document.getAnimations()) { const t = a.effect?.getTiming?.(); if (t) window.__anims.set((a.animationName || a.transitionProperty || 'x') + '|' + t.duration + '|' + t.delay, 1); } requestAnimationFrame(tick); };
      tick();
    });
    await page.evaluate(async () => {
      const f = window.__f1d;
      await f.scrubber.set(f.scrubber.days[28]);
      await f.go('ysykata'); const y = f.scenes.ys; y.play(); await new Promise((r) => setTimeout(r, 3000)); y.frame(); await y.quote();   // F2-D: fx timescrub 재생(13 s) 앞 3 s 만
      const done = new Promise((r) => f.stage.root.addEventListener('f1d:gj1-done', r, { once: true }));
      await y.run({ speed: 300 }); await done;
      await f.go('sokuluk'); await f.scenes.sk.filament(true); await f.go('meiktila');
    });
    const r = await page.evaluate(() => {
      const m = window.__f1d.stage.map, st = m.getStyle();
      return { anims: [...window.__anims.keys()], cams: window.__cams, tr: st.transition,
               fades: st.layers.filter((l) => l.type === 'raster').map((l) => l.id + ':' + l.paint['raster-fade-duration']) };
    });
    const bad = r.anims.filter((k) => { const [n, d, dl] = k.split('|'); const lockSum = n === 'cw-lock-settle' && Math.round(+dl) === 260;   // 락온 380 = 성장 180 + 앰버 80 뒤 정착 120(system-v2 §3 · 합성 지연)
      return !OK.has(Math.round(+d)) || !(OK.has(Math.round(+dl)) || lockSum); });
    console.log('anims', r.anims.length, 'cams', JSON.stringify(r.cams));
    expect(bad).toEqual([]);
    expect(r.anims.some((k) => k.startsWith('cw-lock-grow|180'))).toBe(true);
    expect(r.anims.some((k) => k.startsWith('cw-lock-settle|120|260'))).toBe(true);        // 180 + 80 → 정착 120 = 380
    expect(r.anims.some((k) => k.startsWith('gs-sweep|1000'))).toBe(true);
    expect(r.tr).toEqual({ duration: 0, delay: 0 });
    for (const f of r.fades) expect(f, f).toMatch(/:500$/);
    for (const c of r.cams) expect([1600, 2400, 3200]).toContain(c);   // 3200 = 카메라 --e-fly 초장거리(Δz ≥ 10)만 · 판정 3차 제시 값 · 법전 §3 기입 요청(결과 문서) — CSS 사다리는 그대로
    expect(errs).toEqual([]);
  });

  test('prefers-reduced-motion — 카메라 jumpTo · 애니메이션 1ms', async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const errs = watch(page);
    await bootApi(page, '/landxi/global/index.html?tenant=lx&locale=en');
    const t = await page.evaluate(async () => { const t0 = performance.now(); await window.__f1d.go('ysykata'); return performance.now() - t0; });
    expect(t).toBeLessThan(1500);
    expect(errs).toEqual([]);
    await ctx.close();
  });
});
