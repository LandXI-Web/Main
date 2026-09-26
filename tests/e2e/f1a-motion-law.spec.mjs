// F1-A · motion-law + 성능·법전 — 소스 스캔(ms · duration ⊆ 사다리) · 실행 중 getAnimations 지속 ⊆ 사다리 · 지연 = 스태거×단 · 이징 ⊆ 3 곡선
//   · 스타일 전이 0 · raster-fade 500 · 카메라 1000/1250/1600/2400 · 락온 380(180/80/120) · 스윕 1000 · 정지 750 · 앰버(자체 CSS 0 · 락온 1회)
//   · p95 ≤ 20ms · 캔버스 ≥ 90 % · WebGL 캔버스 ≤ 2 · 14px 미만 0 · Chrome GPU 기록(shots/f1/A/gpu.json)
// 실행: npx playwright test tests/e2e/f1a-motion-law --reporter=line
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

/* ── F1-CONTRACT §12 픽스처(각 spec 안에 복사 · _roles.mjs import 금지) ── */
const API = process.env.LX_API === 'on' ? 'http://localhost:8700' : null;
async function bootApi(page, url, { realm = 'lx', role = 'staff', tenant = null } = {}) {
  let session = null;
  if (API && realm) {
    const r = await fetch(API + '/api/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(realm === 'lx' ? { realm, login: `lx-${role}`, password: process.env.DEV_PASSWORD } : { realm, tenant_id: tenant, login: `${tenant}-manager`, password: process.env.DEV_PASSWORD }) });
    session = await r.json();
  }
  await page.addInitScript(([s, api, realm, role, tenant]) => {
    if (sessionStorage.getItem('lx_e2e_boot')) return; sessionStorage.setItem('lx_e2e_boot', '1');
    if (api) { localStorage.setItem('lx_api_base', api); localStorage.removeItem('lx_api_mode'); } else localStorage.setItem('lx_api_mode', 'off');
    if (s) localStorage.setItem('lx_api_session', JSON.stringify(s)); else localStorage.removeItem('lx_api_session');
    if (realm === 'lx') { localStorage.setItem('lx_logged_in', '1'); localStorage.setItem('lx_role', role); localStorage.removeItem('lx_tenant_session'); }
    else if (realm === 'tenant') { localStorage.removeItem('lx_logged_in'); localStorage.removeItem('lx_role'); localStorage.setItem('lx_tenant_session', JSON.stringify({ tenant, at: '2026-09-24T09:00:00+09:00' })); }
    else { localStorage.removeItem('lx_logged_in'); localStorage.removeItem('lx_role'); localStorage.removeItem('lx_tenant_session'); }
  }, [session, API, realm, role, tenant]);
  await page.goto(url);
  await page.waitForFunction(() => document.documentElement.dataset.lx === 'ready', null, { timeout: 45000 });
}
function watch(page) {
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  return errs;
}
const XI = '/landxi/xi/index.html';

const LADDER = [40, 60, 80, 120, 180, 380, 500, 750, 1000, 1250, 1600, 2400];
const OK = new Set([0, 1, ...LADDER]);
/** 지연 = 스태거(40·60·120) × n + 락온 위상(0 · 180 · 260) — 사다리 단위로만 만들어진 값 */
const delayOk = (d) => { d = Math.round(d); if (OK.has(d)) return true; for (const s of [40, 60, 120]) for (const c of [0, 180, 260]) if (d - c >= 0 && (d - c) % s === 0) return true; return false; };
const EASES = new Set(['linear', 'cubic-bezier(0.22, 1, 0.36, 1)', 'cubic-bezier(0.15, 1, 0.3, 1)', 'cubic-bezier(0.16, 1, 0.3, 1)']);

test('소스 스캔 — landxi/xi 의 CSS·JS ms 리터럴 · duration 숫자 ⊆ 사다리 · 앰버 직접 사용 0', () => {
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (['vendor', 'data'].includes(e.name) ? [] : walk(path.join(d, e.name))) : [path.join(d, e.name)]));
  const files = walk('landxi/xi').filter((f) => /\.(js|css|html)$/.test(f));
  const bad = [], amber = [];
  for (const f of files) {
    const s = fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1').replace(/<!--[\s\S]*?-->/g, '');
    for (const m of s.matchAll(/(?<![\w.-])(\d{2,5})ms\b/g)) if (!OK.has(+m[1])) bad.push(f + ' ' + m[0]);
    for (const m of s.matchAll(/duration:\s*(\d+)/g)) if (!OK.has(+m[1])) bad.push(f + ' ' + m[0]);
    for (const m of s.matchAll(/#FFB633|--cw-lock\b(?!-)|cw-lock-amber/gi)) amber.push(f + ' ' + m[0]);
  }
  console.log('files', files.length, 'bad', bad, 'amber', amber);
  expect(bad).toEqual([]);
  expect(amber).toEqual([]);                           // 앰버는 tokens-v2.css 락온 한 곳에서만(자체 CSS 사용 0)
  const tokens = fs.readFileSync('landxi/assets/css/v2/tokens-v2.css', 'utf8');
  expect((tokens.match(/cw-lock-amber\s+var/g) || []).length).toBe(1);   // 락온 애니메이션 안 1회
});

test('실행 중 — 전 장면 getAnimations ⊆ 사다리 · 이징 3 · 카메라 · 락온 · 스윕 · 전이 0 · 페이드 500 · perf · 14px · 캔버스', async ({ page }) => {
  test.setTimeout(240000);
  const errs = watch(page);
  await page.addInitScript(() => {
    window.__anims = new Map(); window.__sweeps = [];
    const norm = (e) => String(e || '').replace(/\s+/g, ' ').replace(/\(\s*/g, '(').replace(/,(?=\S)/g, ', ');
    const tick = () => {
      for (const a of document.getAnimations()) {
        const t = a.effect?.getTiming?.(); if (!t) continue;
        const kf = a.effect.getKeyframes?.() || [];
        const eases = [t.easing, ...kf.map((k) => k.easing)].filter(Boolean).map(norm);
        let dur = t.duration, delay = t.delay;
        if (a.transitionProperty && a.effect.target) {
          // 되돌림 전이는 브라우저가 지속을 줄인다(reversing shortening) — 선언된 transition-duration 으로 판정
          const cs = getComputedStyle(a.effect.target), props = cs.transitionProperty.split(',').map((x) => x.trim()), durs = cs.transitionDuration.split(',').map((x) => parseFloat(x) * 1000), dels = cs.transitionDelay.split(',').map((x) => parseFloat(x) * 1000);
          const i = Math.max(0, props.indexOf(a.transitionProperty) >= 0 ? props.indexOf(a.transitionProperty) : props.indexOf('all'));
          dur = durs[i % durs.length]; delay = dels[i % dels.length];
        }
        const name = a.animationName || (a.transitionProperty ? 'tr:' + a.transitionProperty + '@' + (a.effect.target?.id || String(a.effect.target?.className || '').split(' ')[0]) : 'waapi@' + (a.effect.target?.id || String(a.effect.target?.className?.baseVal ?? a.effect.target?.className ?? '').split(' ')[0]));
        const k = [name, Math.round(dur), Math.round(delay), [...new Set(eases)].join('/')].join('|');
        window.__anims.set(k, (window.__anims.get(k) || 0) + 1);
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    document.addEventListener('DOMContentLoaded', () => {
      const sw = document.getElementById('sweep'); if (!sw) return; let on = 0;
      new MutationObserver(() => { if (!sw.hidden && !on) on = performance.now(); else if (sw.hidden && on) { window.__sweeps.push(Math.round(performance.now() - on)); on = 0; } }).observe(sw, { attributes: true, attributeFilter: ['hidden'] });
    });
  });
  await bootApi(page, XI);
  // ① 글로브 → 남원 → 도착
  await page.waitForFunction(() => window.__xi.PHASES.some((x) => x.p === 'arrived'), null, { timeout: 60000 });
  await page.waitForTimeout(1200);
  // 도착 뒤 정지 화면에서 perf(유휴)·법전 측정
  const law = await page.evaluate(() => {
    const X = window.__xi, A = X.A, st = A.getStyle();
    const small = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const n = walker.currentNode; if (!n.textContent.trim()) continue;
      const el = n.parentElement; if (!el || el.closest('[hidden]') || el.closest('noscript')) continue;
      const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) continue;
      const r = el.getBoundingClientRect(); if (!r.width || !r.height || r.bottom < 0 || r.top > innerHeight) continue;
      if (parseFloat(cs.fontSize) < 14) small.push(el.tagName + '.' + el.className + ' ' + cs.fontSize + ' "' + n.textContent.trim().slice(0, 20) + '"');
    }
    const amberNow = [...document.querySelectorAll('body *')].filter((e) => { const cs = getComputedStyle(e); return [cs.color, cs.backgroundColor, cs.borderTopColor].includes('rgb(255, 182, 51)'); }).map((e) => e.id || e.className);
    return { tr: st.transition, fades: st.layers.filter((l) => l.type === 'raster').map((l) => l.id + ':' + (l.paint?.['raster-fade-duration'] ?? 'default')),
      small, amberNow, canvases: document.querySelectorAll('canvas.maplibregl-canvas').length, share: X.canvasShare(), tier: X.tier, perf: X.perfStats() };
  });
  // ② 운봉읍 집계 → AOI → 필지 카드 → 프레임 → 실행 → 스크럽 재생 → 스와이프
  const pt = await page.evaluate(() => window.__xi.emdPoint('운봉읍', [300, 300, 1000, 760]));
  await page.mouse.click(pt[0], pt[1]);
  await page.waitForSelector('#emd-card .xi-aoi', { timeout: 15000 });
  await page.evaluate(() => { window.__mark = performance.now(); window.__xi.perf.reset(); });
  await page.click('#emd-card .xi-aoi');
  await page.waitForFunction(() => window.__xi.PHASES.some((x) => x.p === 'arrived' && x.t > window.__mark), null, { timeout: 45000 });
  const perfAoi = await page.evaluate(() => window.__xi.perfStats());
  await page.evaluate(async () => { const X = window.__xi; const fa = await X.loadA02(); X.openParcel(fa.features.find((x) => x.properties.id === X.state.aoiParcels[0])); });
  await page.waitForFunction(() => document.getElementById('parcel-card').dataset.ready === '1', null, { timeout: 30000 });
  await page.waitForTimeout(1100);
  await page.click('#parcel-card .xi-close');
  await page.click('#tool-rect');
  await page.mouse.move(520, 320); await page.mouse.down(); await page.mouse.move(880, 620, { steps: 10 }); await page.mouse.up();
  await page.waitForSelector('#quote-card .xi-run', { timeout: 15000 });
  await page.evaluate(() => { window.__mark = performance.now(); window.__xi.perf.reset(); });
  await page.click('#quote-card .xi-run');
  await page.waitForFunction(() => window.__xi.PHASES.some((x) => x.p === 'snapshot' && x.t > window.__mark), null, { timeout: 90000 });
  const perfJob = await page.evaluate(() => window.__xi.perfStats());
  await page.click('#scrub .xi-play');
  await page.waitForFunction(() => document.getElementById('scrub').dataset.playing === '1', null, { timeout: 5000 });
  await page.waitForFunction(() => !document.getElementById('scrub').dataset.playing, null, { timeout: 15000 });
  await page.click('#tool-swipe'); await page.waitForTimeout(800);
  const r = await page.evaluate(() => ({ anims: [...window.__anims.keys()], flights: window.__xi.CAMLOG.flights.map((f) => f.duration), jumps: window.__xi.jumps(), sweeps: window.__sweeps,
    stops: window.__xi.scrub.S.stops, locks: [...document.querySelectorAll('#locks .cw-lock')].length, perfAll: window.__xi.perf.stats(window.__xi.perf.all) }));

  const badDur = r.anims.filter((k) => !OK.has(+k.split('|')[1]));
  const badDelay = r.anims.filter((k) => !delayOk(+k.split('|')[2]));
  const badEase = r.anims.filter((k) => k.split('|')[3].split('/').some((e) => e && !EASES.has(e)));
  console.log('anims', r.anims.length, JSON.stringify(r.anims.slice(0, 40)));
  console.log('flights', JSON.stringify(r.flights), 'jumps', r.jumps, 'sweeps', JSON.stringify(r.sweeps), 'stops', JSON.stringify(r.stops));
  console.log('law', JSON.stringify({ ...law, fades: law.fades.length, tier: law.tier && { tier: law.tier.tier, p95: law.tier.p95, gpu: law.tier.gpu } }));
  console.log('perf', JSON.stringify({ idle: law.perf, aoi: perfAoi, job: perfJob, all: r.perfAll }));
  fs.mkdirSync('shots/f1/A', { recursive: true });
  fs.writeFileSync('shots/f1/A/gpu.json', JSON.stringify({ at: new Date().toISOString(), mode: API ? 'on' : 'off', gpu: law.tier?.gpu, tier: law.tier?.tier, first60_p95_ms: law.tier?.p95,
    perf: { idle: law.perf, aoi_descent_arrive: perfAoi, job_theater: perfJob, whole_run: r.perfAll }, canvas_share: law.share, canvases: law.canvases, basis: 'measured · Playwright headless chrome · rAF 간격' }, null, 1));
  expect(badDur).toEqual([]);
  expect(badDelay).toEqual([]);
  expect(badEase).toEqual([]);
  expect(r.anims.some((k) => k.startsWith('cw-lock-grow|180|'))).toBe(true);
  expect(r.anims.some((k) => k.startsWith('cw-lock-amber|80|180'))).toBe(true);
  expect(r.anims.some((k) => k.startsWith('cw-lock-settle|120|260'))).toBe(true);
  expect(r.anims.some((k) => k.startsWith('cw-digit|40|') || k.includes('|40|'))).toBe(true);
  for (const d of r.flights) expect([1000, 1250, 1600, 2400]).toContain(d);
  expect(r.flights).toEqual(expect.arrayContaining([2400, 1600, 1250]));
  expect(r.jumps).toBe(0);
  expect(r.sweeps.length).toBeGreaterThan(0);
  // 스윕은 rAF 1000 — 병렬 워커 부하에서 한두 프레임(≤ 120) 늦게 걷힐 수 있다 · 하나는 ±60 안
  expect(r.sweeps.some((s) => Math.abs(s - 1000) <= 60)).toBe(true);
  for (const s of r.sweeps) expect(Math.abs(s - 1000)).toBeLessThanOrEqual(120);
  for (const s of r.stops) expect(Math.abs(s.ms - 750)).toBeLessThanOrEqual(40);
  expect(law.tr).toEqual({ duration: 0, delay: 0 });
  for (const f of law.fades) expect(f, f).toMatch(/:500$/);
  expect(law.small).toEqual([]);
  expect(law.amberNow).toEqual([]);                    // 정착 뒤 앰버 0(락온 80ms 동안만)
  expect(law.canvases).toBeLessThanOrEqual(2);
  expect(law.share).toBeGreaterThanOrEqual(0.9);
  expect(law.perf.p95).toBeLessThanOrEqual(20);
  expect(perfAoi.p95).toBeLessThanOrEqual(20);
  expect(errs).toEqual([]);
});

test('prefers-reduced-motion — 카메라 jumpTo · 도착 즉시 · 애니메이션 1ms', async ({ browser }) => {
  test.setTimeout(120000);
  const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errs = watch(page);
  await bootApi(page, XI);
  await page.waitForFunction(() => window.__xi.PHASES.some((x) => x.p === 'arrived'), null, { timeout: 60000 });
  const r = await page.evaluate(() => ({ frames: window.__xi.CAMLOG.frames.length, big: document.getElementById('hud-big').textContent,
    long: document.getAnimations().filter((a) => (a.effect?.getTiming?.().duration || 0) > 1).map((a) => (a.animationName || a.transitionProperty || 'waapi') + '@' + (a.effect.target?.id || String(a.effect.target?.className || '')) + ':' + a.effect.getTiming().duration) }));
  console.log(JSON.stringify(r));
  expect(r.frames).toBe(0);
  expect(r.big).toBe('129,420');
  expect(r.long).toEqual([]);
  expect(errs).toEqual([]);
  await ctx.close();
});
