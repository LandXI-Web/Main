import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

// E0-S XI맵 시그니처 스파이크 — landxi/proto/spikes/ximap-signature.{html,js,css}
//   S1 도착(frame 1250 → 스윕 1.0s → 락온 380 → 숫자 40ms) · S3 4시점 크로스페이드 스크럽 · S6 스와이프
//   판정은 스크린샷이 아니라 프레임 스트립 + 영상(shots/w0/E0-S/) · 브리프 docs/superpowers/audit-0923/wave0/E0-S.md
//   세션 없이 연다(스파이크 · 관문 없음).

const PAGE = 'proto/spikes/ximap-signature.html';
const OUT = 'shots/w0/E0-S';
const SRC = 'landxi/proto/spikes/ximap-signature';
const LAW_MS = new Set([180, 380, 500, 750, 1000, 1250, 40, 60, 80, 120]);
const LAW_EASE = ['0.15,1,0.3,1', '.22,1,.36,1'];
// 네트워크 타일 소음만 뺀다(V-World 는 숨긴 뒤 끊기는 요청이 ERR_ABORTED 로 남는다).
const NETWORK = /net::ERR_ABORTED|ERR_ABORTED|Failed to load resource.*(vworld|xdworld)|AbortError/i;

fs.mkdirSync(OUT, { recursive: true });

function watch(page) {
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !NETWORK.test(m.text())) errs.push('console: ' + m.text()); });
  return errs;
}
// 대기는 전부 사건 기반 — 페이지 상태(__spike.state) · MapLibre 'idle' · Web Animations finished. 시간 대기로 판정하지 않는다.
// 병렬 실행에서 CPU 가 밀려도 사건은 반드시 오므로, 상한은 넉넉히(도착 전 과정 ≈ 5.7s 의 3 배 이상).
const st = (page) => page.evaluate(() => window.__spike.state());
const arrived = (page, timeout = 20000) => page.waitForFunction(() => window.__spike?.state().arrived, null, { timeout });
const ready = (page) => page.waitForFunction(() => window.__spike?.state().ready, null, { timeout: 20000 });
const idle = (page) => page.evaluate(() => window.__spike.whenIdle());
/** 제출용 정지 화면 — 지도 idle(타일 적재 + 타일 페이드 + 카메라 정지) + 도는 CSS 애니메이션의 finished */
const settle = async (page) => {
  await idle(page);
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => {}))));
  await idle(page);
};
/** HUD 큰 숫자 · 해설 줄에서 도는 애니메이션 수 */
const hudAnims = (page) => page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running' && a.effect?.target?.closest?.('#hud-big,#hud-note')).length);
/** 연속 두 장이 다른 쌍의 수 */
const diffPairs = (bufs) => bufs.slice(1).filter((b, i) => !b.equals(bufs[i])).length;
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/\s.*$/gm, '');

/**
 * 필름 스트립 — CDP screencast 로 브라우저가 실제로 합성한 프레임을 받는다(테스트 왕복 속도와 무관 · 병렬 부하에서도 프레임이 모자라지 않다).
 * act() 를 시작하고 done() 사건까지 모은 뒤, 시간축에 고르게 n 장을 골라 저장한다.
 */
async function filmstrip(page, { act, done, n = 12, prefix }) {
  const cdp = await page.context().newCDPSession(page);
  const frames = [];
  cdp.on('Page.screencastFrame', (f) => {
    frames.push({ t: f.metadata.timestamp, buf: Buffer.from(f.data, 'base64') });
    cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 72, everyNthFrame: 1 });
  await act();
  await done();
  await cdp.send('Page.stopScreencast');
  await cdp.detach().catch(() => {});
  const t0 = frames[0]?.t ?? 0, t1 = frames[frames.length - 1]?.t ?? 0;
  const pick = [];
  for (let k = 0; k < n; k++) {
    const want = t0 + ((t1 - t0) * k) / (n - 1);
    let best = 0;
    frames.forEach((f, i) => { if (Math.abs(f.t - want) < Math.abs(frames[best].t - want)) best = i; });
    if (!pick.includes(best)) pick.push(best);
  }
  const bufs = pick.map((i) => frames[i].buf);
  bufs.forEach((b, k) => fs.writeFileSync(`${OUT}/${prefix}-${String(k).padStart(2, '0')}.jpg`, b));
  return { total: frames.length, ms: Math.round((t1 - t0) * 1000), bufs };
}

/**
 * 카메라 진행률 — camLog 의 한 구간(시작 표식 'start' 부터 마지막 프레임까지)에서 +ms 시점의 줌 진행(0–1).
 * 법전 이징을 줌에 바로 걸면 +300ms 에 80 % 가 끝나고 뒤가 정지로 읽힌다 — 게이트: +300 ≤ 45 % · +900 ≤ 95 %.
 */
function progressCurve(cam) {
  const i0 = cam.findIndex((c) => c[6] === 'start');
  const leg = cam.slice(Math.max(0, i0));
  const t0 = leg[0][0], z0 = leg[0][1], z1 = leg[leg.length - 1][1];
  const at = (ms) => {
    const t = t0 + ms;
    let k = leg.findIndex((c) => c[0] >= t);
    if (k < 0) return 1;
    if (k === 0) return 0;
    const a = leg[k - 1], b = leg[k], z = a[1] + ((b[1] - a[1]) * (t - a[0])) / Math.max(1, b[0] - a[0]);
    return (z - z0) / (z1 - z0);
  };
  return { at, span: leg[leg.length - 1][0] - t0, z0, z1, curve: [100, 200, 300, 500, 700, 900, 1100].map((ms) => +at(ms).toFixed(3)) };
}
/**
 * 흰 허공 계측기 — 지도 A 가 그린 프레임마다(render 사건 · 같은 프레임의 드로잉 버퍼를 readPixels) 흰 바탕이 드러난 비율.
 * 도시 정사영상 원천이 실제로 덮는 자리(z13 타일 알파)에서만 센다 — 원천 자체가 없는 곳(도시 스케일 커버리지 밖)은 제외.
 * 판(HUD · 띠 · 세그먼트)이 가린 자리도 제외. 스크린샷 왕복 · 시계 맞추기 없이 카메라와 정확히 같은 프레임을 잰다.
 */
const installWhiteMeter = (page) => page.evaluate(async () => {
  const m = window.__spike.map, Z = 13, TS = 256, cov = new Map();
  const mx = (lng) => (lng + 180) / 360, my = (lat) => { const s = Math.sin((lat * Math.PI) / 180); return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI); };
  const b = m.getBounds(), n = 2 ** Z;
  const x0 = Math.floor(mx(b.getWest()) * n), x1 = Math.floor(mx(b.getEast()) * n), y0 = Math.floor(my(b.getNorth()) * n), y1 = Math.floor(my(b.getSouth()) * n);
  const jobs = [];
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) jobs.push((async () => {
    const r = await fetch(`../../assets/tiles/namwon_city_2510/${Z}/${x}/${y}.webp`);
    if (!r.ok || !/webp/.test(r.headers.get('content-type') || '')) return;
    const bm = await createImageBitmap(await r.blob()), c = new OffscreenCanvas(TS, TS), g = c.getContext('2d');
    g.drawImage(bm, 0, 0);
    cov.set(x + '/' + y, g.getImageData(0, 0, TS, TS).data);
  })());
  await Promise.all(jobs);
  const covered = (lng, lat) => {
    const X = mx(lng) * n * TS, Y = my(lat) * n * TS, d = cov.get(Math.floor(X / TS) + '/' + Math.floor(Y / TS));
    return !!d && d[((Math.floor(Y) % TS) * TS + (Math.floor(X) % TS)) * 4 + 3] >= 200;
  };
  const canvas = m.getCanvas(), cr = canvas.getBoundingClientRect();
  const plates = [...document.querySelectorAll('.spk-plate')].map((e) => { const r = e.getBoundingClientRect(); return [r.left - cr.left - 2, r.top - cr.top - 2, r.right - cr.left + 2, r.bottom - cr.top + 2]; });
  const gl = m.painter.context.gl, W = gl.drawingBufferWidth, H = gl.drawingBufferHeight, k = W / cr.width, buf = new Uint8Array(W * H * 4);
  window.__white = [];
  m.on('render', () => {
    const ph = window.__spike.state().phase;
    if (ph !== 'dive' && ph !== 'lock') return;
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    let c = 0, w = 0;
    for (let y = 4; y < cr.height - 1; y += 10) for (let x = 4; x < cr.width - 1; x += 10) {
      if (plates.some((p) => x >= p[0] && x <= p[2] && y >= p[1] && y <= p[3])) continue;
      const ll = m.unproject([x, y]);
      if (!covered(ll.lng, ll.lat)) continue;
      c++;
      const i = ((H - 1 - Math.floor(y * k)) * W + Math.floor(x * k)) * 4;
      if (buf[i] > 235 && buf[i + 1] > 235 && buf[i + 2] > 235) w++;
    }
    window.__white.push([+m.getZoom().toFixed(2), c, c ? +(w / c).toFixed(3) : 0]);
  });
  return cov.size;
});

/* ══ 1. S1 도착 ═════════════════════════════════════════════════════════ */
test.describe('S1 도착', () => {
  test('자동 재생 — 전역 정사영상 → 스윕(폴리곤 도착) → 한 필지로 하강 → 락온 → 숫자 · phase 순서', async ({ page }) => {
    test.setTimeout(60000);
    const errs = watch(page);
    await page.addInitScript(() => {
      window.__phaseLog = [];
      window.__spikeHold = 'sweep';                                        // 스윕 직전에서 한 번 멈춰 바탕을 확인한다
      new MutationObserver((rs) => { for (const r of rs) window.__phaseLog.push(r.target.getAttribute('data-phase')); })
        .observe(document, { attributes: true, subtree: true, attributeFilter: ['data-phase'] });
    });
    await page.goto(PAGE);
    await expect(page).toHaveTitle('XI맵 시그니처 — 스파이크 · 제품 아님');
    await expect(page.locator('#spk-band')).toContainText('스파이크 · 제품 아님 · 실데이터: 남원 농지이용 2025(2,098 필지) · LX 정사영상 4시점');
    await page.waitForFunction(() => window.__spike?.state().hold === 'sweep', null, { timeout: 20000 });
    // 스윕 직전 — 결과 0 · 큰 숫자 자리 '—' · 바탕 = 남원 전역 정사영상(실색 · 타일 적재) · 도시 스케일
    await expect(page.locator('#hud-big')).toHaveText('—');
    await expect(page.locator('#hud-status')).toHaveText('판독 결과 도착 중');
    await idle(page);
    const base = await page.evaluate(() => {
      const m = window.__spike.map;
      const p = (k) => m.getPaintProperty('city', k) ?? 0;
      return { z: m.getZoom(), loaded: m.isSourceLoaded('city'), tone: [p('raster-saturation'), p('raster-contrast'), p('raster-brightness-min')], shown: window.__spike.audit().shown,
        tiles: m.getSource('city').tiles[0], ob: m.getPaintProperty('spk-ob', 'line-opacity') };
    });
    expect(base.z).toBeLessThan(11.5);
    expect(base.loaded).toBe(true);
    expect(base.tone).toEqual([0, 0, 0]);                                   // 원천 실색 그대로 — 채도 · 대비 · 밝기 보정 0
    expect(base.ob).toBe(0);                                                // 범위 틀은 S1 에 없다
    expect(base.tiles).toContain('assets/tiles/namwon_city_2510/');
    expect(base.shown).toBe(0);
    await page.screenshot({ path: `${OUT}/01a-s1-base-1440.png` });
    await page.evaluate(() => { window.__spikeHold = 'dive'; window.__spike.release(); });
    // 스윕 중 — 보이는 필지는 모두 선 뒤쪽(지나간 자리)에만
    await page.waitForFunction(() => window.__spike.state().phase === 'sweep' && window.__spike.audit().shown > 50, null, { timeout: 20000 });
    const mid = await page.evaluate(() => window.__spike.audit());
    expect(mid.ahead).toBe(0);
    expect(mid.hidden).toBeGreaterThan(0);
    // 스윕이 끝나고 하강 직전 — 2,098 필지 폴리곤 전부 도착(현상 끝)
    await page.waitForFunction(() => window.__spike.state().hold === 'dive', null, { timeout: 20000 });
    await page.waitForFunction(() => { const m = window.__spike.map; for (let i = 0; i < 2098; i++) if ((m.getFeatureState({ source: 'r', id: i })?.a ?? 0) !== 1) return false; return true; }, null, { timeout: 20000 });
    await idle(page);
    await page.screenshot({ path: `${OUT}/01b-s1-swept-1440.png` });
    await page.evaluate(() => { window.__spikeHold = ''; window.__spike.release(); });
    // 현상 중인 CSS 애니메이션의 지속·이징이 법전 안
    await page.waitForFunction(() => window.__spike.state().phase === 'count', null, { timeout: 20000 });
    // CSS 애니메이션의 timing-function 은 효과가 아니라 키프레임에 붙는다(effect easing = linear).
    const anims = await page.evaluate(() => document.getAnimations().map((a) => { const t = a.effect.getTiming(); return { d: t.duration, delay: t.delay, e: a.effect.getKeyframes()[0].easing }; }));
    expect(anims.length).toBeGreaterThan(5);
    for (const a of anims) expect(LAW_MS.has(a.d), `duration ${a.d}`).toBe(true);
    for (const a of anims) expect(['cubic-bezier(0.15, 1, 0.3, 1)', 'cubic-bezier(0.22, 1, 0.36, 1)'], `easing ${a.e}`).toContain(a.e);
    await arrived(page);
    await expect(page.locator('#spk-void')).toBeHidden();
    const hud = await page.locator('#spk-hud').innerText();
    expect(hud).toContain('2,098');
    expect(hud).toContain('필지');
    expect(hud).toContain('경작지 1,291');
    expect(hud).toContain('비경작지 807');
    expect(hud).toContain('315.9 ha');
    expect(hud).toContain('신뢰도 중앙값 0.41');
    expect(hud).toContain('기준 2026.06.08');
    expect(await page.evaluate(() => window.__phaseLog)).toEqual(['frame', 'sweep', 'dive', 'lock', 'count', 'arrived']);
    expect(await page.evaluate(() => document.documentElement.dataset.phase)).toBe('arrived');
    // 하강 = 한 필지로 1250ms(법전 사다리 · 브리프 900–1250) — 카메라 기록(프레임마다)으로 잰다
    const dive = await page.evaluate(() => window.__spike.camLog().filter((c) => c[3] === 'dive'));
    const span = dive[dive.length - 1][0] - dive[0][0];
    console.log(`하강 ${dive.length} 프레임 · ${span}ms · z ${dive[0][1]} → ${dive[dive.length - 1][1]}`);
    expect(dive.length).toBeGreaterThanOrEqual(12);
    expect(span).toBeGreaterThanOrEqual(900);
    expect(span).toBeLessThanOrEqual(1250 + 34);                           // rAF 기록 해상도(두 프레임)
    expect(dive[0][1]).toBeLessThan(11.5);
    // 착지 = 드론 정사영상(1–2 cm) 위 · 락온 1 = 정사영상 범위 안에 온전히 든 판독 필지
    const s = await st(page);
    const land = await page.evaluate(() => { const m = window.__spike.map; return { z: m.getZoom(), ep3: m.getPaintProperty('ep3', 'raster-opacity'), city: m.getLayer('city').maxzoom ?? 24, cityOp: m.getPaintProperty('city', 'raster-opacity') ?? 1, vw: !!m.getLayer('vw'), ep: ['ep0', 'ep1', 'ep2'].map((l) => m.getLayoutProperty(l, 'visibility')) }; });
    expect(land.z).toBeGreaterThanOrEqual(17.5);
    expect(land.ep3).toBe(1);                                               // 2025.10 드론 — 도시 바탕(2025.10)과 같은 계절
    expect(land.city).toBeGreaterThan(land.z);                              // 도시 정사영상은 착지 줌에서도 드론 아래 밑깔개로 남는다
    // p0926 map-base — V-World 가 밑깔개로 깔리면 도시 2 m(z15 확대)는 z16 → 17.2 에서 더 선명한 V-World 에 넘긴다. 폐쇄망이면 1 그대로
    if (land.vw) expect(JSON.stringify(land.cityOp)).toBe(JSON.stringify(['interpolate', ['linear'], ['zoom'], 16, 1, 17.2, 0]));
    else expect(land.cityOp).toBe(1);
    expect(land.ep).toEqual(['none', 'none', 'none']);                      // S1 은 보이는 시점 층만 타일을 받는다
    expect(s.locks).toBe(1);
    expect(s.lockIds).toEqual([await page.evaluate(() => window.__spike.focus())]);
    await expect(page.locator('.spk-lock .spk-flag')).toContainText('신뢰도');
    expect((await page.evaluate(() => window.__spike.audit())).hidden).toBe(0);
    await settle(page);
    await page.screenshot({ path: `${OUT}/01-s1-arrived-1440.png` });
    expect(errs).toEqual([]);
  });

  test('모션 스트립 — S1 도착 전 과정 12장 · 연속 상이 쌍 ≥ 8 · 첫 페인트부터 조용한 띠', async ({ page }) => {
    test.setTimeout(60000);
    const errs = watch(page);
    // 스크립트 모듈이 돌기 전(DOMContentLoaded 이전 첫 페인트 자리)의 띠 상태
    await page.addInitScript(() => {
      document.addEventListener('readystatechange', () => {
        if (document.readyState !== 'interactive' || window.__firstPaint) return;
        const p = document.getElementById('spk-play'), sc = document.getElementById('spk-scrub');
        window.__firstPaint = { playShown: getComputedStyle(p).display !== 'none', quiet: sc.dataset.quiet, thumb: getComputedStyle(document.getElementById('spk-range'), '::-webkit-slider-thumb').backgroundColor };
      });
    });
    await page.goto(PAGE);
    expect(await page.evaluate(() => window.__firstPaint)).toEqual({ playShown: false, quiet: '1', thumb: 'rgba(0, 0, 0, 0)' });
    await page.waitForFunction(() => window.__spike?.state().started, null, { timeout: 20000 });
    // S1 에는 결손 안내가 없다(브리프 S3 §5 — S3 · S6 에서 범위를 벗어났을 때만) · 띠는 조용히(눈금만) — 도착 끝까지 매 프레임 확인
    const quiet = page.evaluate(() => new Promise((res) => {
      let bad = 0;
      const f = () => {
        if (!document.getElementById('spk-void').hidden || !document.getElementById('spk-play').hidden || document.getElementById('spk-scrub').dataset.quiet !== '1') bad++;
        if (window.__spike.state().arrived) res(bad); else requestAnimationFrame(f);
      };
      f();
    }));
    const r = await filmstrip(page, { prefix: 's1-frame', act: async () => {}, done: () => arrived(page) });
    const n = diffPairs(r.bufs);
    console.log(`s1 strip: screencast ${r.total} 프레임 · ${r.ms}ms · 고른 ${r.bufs.length} 장 · 연속 상이 쌍 ${n}/${r.bufs.length - 1}`);
    expect(r.bufs.length).toBeGreaterThanOrEqual(10);
    expect(n).toBeGreaterThanOrEqual(8);
    expect(await quiet).toBe(0);
    expect(errs).toEqual([]);
  });

  test('하강 — 흰 허공 0 · 착지 타일은 스윕 동안 미리 받음(낱장 팝인 0) · 진행률 곡선 · 틀은 영상 뒤에', async ({ page }) => {
    test.setTimeout(60000);
    const errs = watch(page);
    await page.addInitScript(() => { window.__spikeHold = 'dive'; });   // 하강 직전에 멈춰 계측기를 건다
    await page.goto(PAGE);
    await page.waitForFunction(() => window.__spike?.state().hold === 'dive', null, { timeout: 20000 });
    const covTiles = await installWhiteMeter(page);
    // 하강 동안 범위 틀(spk-ob)은 한 프레임도 보이지 않는다
    const frameSeen = page.evaluate(() => new Promise((res) => {
      let bad = 0; const f = () => { const m = window.__spike.map; if ((m.getPaintProperty('spk-ob', 'line-opacity') ?? 0) > 0) bad++; if (window.__spike.state().arrived) res(bad); else requestAnimationFrame(f); };
      f();
    }));
    await page.evaluate(() => { window.__spikeHold = ''; window.__spike.release(); });
    await arrived(page);
    const cam = await page.evaluate(() => window.__spike.camLog());
    const dive = cam.filter((c) => c[3] === 'dive');
    // ① 진행률 — 1250ms 전체에 걸쳐 읽힌다
    const pc = progressCurve(dive);
    console.log(`하강 진행률 +100…+1100ms ${pc.curve.join(' · ')} · span ${pc.span}ms`);
    expect(pc.at(300), '+300ms 진행').toBeLessThanOrEqual(0.45);
    expect(pc.at(900), '+900ms 진행').toBeLessThanOrEqual(0.95);
    expect(pc.at(600)).toBeGreaterThan(pc.at(300));
    // ② 흰 허공 — 하강 · 락온 동안 그려진 모든 프레임, 도시 정사영상이 덮는 자리 안에서 흰 비율 < 30 %
    const w = await page.evaluate(() => window.__white);
    const worst = w.reduce((a, b) => (b[2] > a[2] ? b : a), [0, 0, 0]);
    console.log(`하강 프레임 ${w.length} · 커버리지 타일 ${covTiles} · 커버리지 안 흰 비율 최대 ${(worst[2] * 100).toFixed(1)} %(z ${worst[0]}) · 곡선 ${w.filter((_, i) => i % 6 === 0).map((x) => x[0] + ':' + x[2]).join(' ')}`);
    expect(w.length).toBeGreaterThanOrEqual(20);
    expect(worst[2]).toBeLessThan(0.3);
    // ③ 낱장 팝인 0 — 하강 중 드론(2025.10) · 도시 바탕 타일 요청은 모두 스윕 동안 미리 받아 디코드해 둔 것(콜드 0)
    const t = await page.evaluate(() => window.__spike.tiles());
    const dl = t.log.filter((r) => r[1] === 'dive' && /^(namwon_2510|namwon_city_2510)$/.test(r[0]));
    const cold = dl.filter((r) => !r[2]);
    console.log(`미리 받기 ${t.warm.n} 장 · ${t.warm.ms}ms · 하강 요청 ${dl.length} · 콜드 ${cold.length} · 최대 지연 ${Math.max(0, ...dl.map((r) => r[3]))}ms`);
    expect(dl.length).toBeGreaterThan(20);
    expect(cold, JSON.stringify(cold.slice(0, 12))).toEqual([]);
    // 지연 = 프로토콜이 요청을 받아 비트맵을 돌려주기까지(주 스레드 대기 포함 — 이 테스트는 매 프레임 readPixels 계측기가 돈다)
    expect(Math.max(0, ...dl.map((r) => r[3]))).toBeLessThanOrEqual(120);
    expect(await frameSeen).toBe(0);
    expect(errs).toEqual([]);
  });

  test('필지 클릭 락온 — 브래킷 180 → 앰버 80 → 청록 120 = 380±20', async ({ page }) => {
    const errs = watch(page);
    await page.goto(PAGE);
    await arrived(page);
    // 착지(한 필지) 자리에서 남원 전역으로 — 판 밖에 보이는 필지 하나를 고른다
    await page.evaluate(() => window.__spike.jump([127.42, 35.43], 11.2));
    await idle(page);
    const before = await page.locator('.spk-lock').count();
    const pt = await page.evaluate(() => window.__spike.sample());
    expect(pt).not.toBeNull();
    await page.mouse.click(pt.x, pt.y);
    await expect(page.locator('.spk-lock')).toHaveCount(Math.min(4, before + 1));
    const lock = page.locator(`.spk-lock[data-fid="${pt.i}"]`);
    await expect(lock).toHaveCount(1);
    const an = await lock.evaluate((el) => el.getAnimations().map((a) => ({ name: a.animationName, d: a.effect.getTiming().duration })));
    const sum = an.reduce((s, a) => s + a.d, 0);
    console.log('lock animations', JSON.stringify(an), 'sum', sum);
    expect(Math.abs(sum - 380)).toBeLessThanOrEqual(20);
    expect(an.map((a) => a.name)).toEqual(['spk-grow', 'spk-amber', 'spk-settle']);
    expect(an.find((a) => a.name === 'spk-amber').d).toBe(80);
    // 끝은 사건(animationend 'spk-settle')으로 — 정착 뒤 색 = 청록(앰버는 80ms 뿐)
    await expect(lock).toHaveAttribute('data-lock-end', /\d+/);
    const dt = await lock.evaluate((el) => +el.dataset.lockEnd - +el.dataset.lockAt);
    console.log('lock timestamps Δ', dt);
    expect(dt).toBeGreaterThanOrEqual(360);
    expect(await lock.evaluate((el) => getComputedStyle(el).color)).toBe('rgb(15, 169, 160)');
    await expect(lock.locator('.spk-flag')).toContainText('신뢰도');
    expect(errs).toEqual([]);
  });

  test('다시 보기 — 착지 자리에서 전역으로 올라와 결과 0 에서 다시 도착', async ({ page }) => {
    test.setTimeout(60000);
    await page.goto(PAGE);
    await arrived(page);
    await page.evaluate(() => window.__spike.camReset());
    await page.click('#spk-replay');
    await page.waitForFunction(() => !window.__spike.state().arrived);
    await expect(page.locator('#hud-big')).toHaveText('—');
    await arrived(page);
    await expect(page.locator('#hud-big')).toHaveAttribute('aria-label', '2,098');
    const s = await st(page);
    expect(s.jumps).toBe(0);                                                // 착지 → 전역 → 착지, 순간이동 0
    const frame = await page.evaluate(() => window.__spike.camLog().filter((c) => c[3] === 'frame'));
    expect(frame[0][1]).toBeGreaterThan(16);                                // 전역으로 '올라온다'(착지 줌에서 시작)
  });
});

/* ══ 2. S3 시점 스크럽 ═══════════════════════════════════════════════════ */
test.describe('S3 시점 스크럽', () => {
  test('소수 시점 · 두 층 0.5/0.5 · URL · 키보드 · 재생 · 자동 정지 750 · 범위 밖', async ({ page }) => {
    test.setTimeout(90000);                                                  // 스크린샷 6장 × idle — 병렬 부하에서 30s 를 넘길 수 있다(대기 자체는 사건 기반)
    const errs = watch(page);
    await page.goto(PAGE);
    await arrived(page);
    await page.evaluate(() => window.__spike.play('s3'));
    await ready(page);
    const range = page.locator('#spk-range');
    await expect(range).toBeEnabled();
    await expect(range).toHaveAttribute('min', '0');
    await expect(range).toHaveAttribute('max', '3');
    await expect(page.locator('#spk-ticks li')).toHaveText([/2025\.04\s*1\.08 cm/, /2025\.06\s*1\.69 cm/, /2025\.08\s*1\.54 cm/, /2025\.10\s*1\.68 cm/]);

    await page.evaluate(() => window.__spike.setEpoch(1.5));
    expect(new URL(page.url()).searchParams.get('epoch')).toBe('1.5');
    expect(new URL(page.url()).searchParams.get('scene')).toBe('s3');
    expect((await st(page)).layers).toEqual({ a: 'namwon_2506', b: 'namwon_2508', opA: 0.5, opB: 0.5 });
    const op = await page.evaluate(() => ['ep0', 'ep1', 'ep2', 'ep3'].map((l) => window.__spike.map.getPaintProperty(l, 'raster-opacity')));
    expect(op).toEqual([0, 0.5, 0.5, 0]);
    await expect(range).toHaveAttribute('aria-valuetext', '2025.06 → 2025.08 · 50 %');

    // 키보드 ←/→ ±0.25 · Home/End
    await range.focus();
    await page.keyboard.press('ArrowRight');
    expect((await st(page)).epoch).toBe(1.75);
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    expect((await st(page)).epoch).toBe(1.25);
    await page.keyboard.press('End');
    expect((await st(page)).epoch).toBe(3);
    await page.keyboard.press('Home');
    expect((await st(page)).epoch).toBe(0);

    // 정수 시점 = 변화 pair 경계 → 비지도 표기
    await page.evaluate(() => window.__spike.setEpoch(2));
    await expect(page.locator('#hud-chg')).toBeVisible();
    await expect(page.locator('#hud-chg')).toContainText('변화 지수(비지도)');
    await expect(page.locator('#hud-chg')).toContainText('학습 결과 아님');
    await expect(page.locator('#hud-chg')).toContainText('2025-06 → 2025-08 · 79건');

    // 스크린샷 — 4시점 + 중간 2
    for (const e of [0, 1, 2, 3, 0.5, 2.5]) {
      await page.evaluate((v) => window.__spike.setEpoch(v), e);
      expect(await hudAnims(page), `setEpoch(${e}) 가 HUD 텍스트 인을 다시 틀면 안 된다`).toBe(0);
      await settle(page);
      await page.screenshot({ path: `${OUT}/s3-epoch-${e}.png` });
    }

    // 재생 1개 — 시간표(6s 주기)로 돈다. 정수 시점마다 750ms 정지
    await page.evaluate(() => window.__spike.setEpoch(0));
    await page.click('#spk-play');
    await expect(page.locator('#spk-play')).toHaveAttribute('aria-pressed', 'true');
    expect((await st(page)).cycle).toBe(6000);
    // 재생 중 HUD 큰 숫자 · 해설 줄은 제자리 교체 — 텍스트 인 0(움직이는 것은 크로스페이드 + 정수 정지의 변화 지수 한 줄).
    // 매 프레임 페이지 안에서 센다 — 첫 정지 → 이동 → 다음 정지(시점 1)까지.
    const moving = await page.evaluate(() => new Promise((res) => {
      let n = 0, seen = new Set();
      const f = () => {
        n += document.getAnimations().filter((a) => a.playState === 'running' && a.effect?.target?.closest?.('#hud-big,#hud-note')).length;
        seen.add(window.__spike.state().epoch);
        if (window.__spike.state().stops.length >= 2) res({ n, seen: seen.size }); else requestAnimationFrame(f);
      };
      f();
    }));
    expect(moving.n).toBe(0);
    expect(moving.seen).toBeGreaterThan(3);                                  // 소수 시점을 지나며 크로스페이드
    const s = await st(page);
    console.log('재생 정지', JSON.stringify(s.stops));
    for (const stop of s.stops) expect(stop.ms, `stop ${JSON.stringify(stop)}`).toBe(750);
    expect(s.stops.slice(0, 2).map((x) => x.e)).toEqual([0, 1]);
    const perf = await page.evaluate(() => window.__spike.perf());
    console.log('S3 재생 perf', JSON.stringify(perf));
    expect(perf.p95).toBeLessThanOrEqual(20);
    expect(perf.max, '재생 중 가장 긴 프레임').toBeLessThanOrEqual(250);
    expect(perf.canvases).toBeLessThanOrEqual(2);
    // 사용자가 스크러버를 잡으면 정지
    await range.focus();
    await page.keyboard.press('ArrowRight');
    expect((await st(page)).playing).toBe(false);

    // 범위 밖 — 남원 시내(정사영상 없음) · 그리고 z < 12
    await page.evaluate(() => window.__spike.jump([127.39, 35.41], 15));
    await expect(page.locator('#spk-void')).toBeVisible();
    await expect(page.locator('#spk-void')).toHaveText('이 자리엔 정사영상이 없습니다 — 남원 농경지 0.61 km² 만 4시점');
    await expect(range).toBeDisabled();
    await expect(page.locator('#spk-play')).toBeDisabled();
    await page.evaluate(() => window.__spike.jump([127.352, 35.531], 11.5));
    await expect(range).toBeDisabled();
    await page.evaluate(() => window.__spike.jump([127.352, 35.531], 16));
    await expect(range).toBeEnabled();
    await expect(page.locator('#spk-void')).toBeHidden();
    expect(errs).toEqual([]);
  });

  test('다이브 스트립 — S1 착지 → S3 정사영상 범위 12장 · 결손 안내 0 · 범위 밖은 도시 영상 · 걸친 필지는 잘린 모양', async ({ page }) => {
    test.setTimeout(60000);
    const errs = watch(page);
    await page.goto(PAGE);
    await arrived(page);
    await idle(page);
    await page.evaluate(() => window.__spike.camReset());
    // 결손 안내는 전환 내내 한 프레임도 나오면 안 된다 — 페이지 안에서 매 프레임 확인
    const voidSeen = page.evaluate(() => new Promise((res) => {
      let bad = 0; const f = () => { if (!document.getElementById('spk-void').hidden) bad++; if (window.__spike.state().ready && window.__spike.state().scene === 's3') res(bad); else requestAnimationFrame(f); };
      requestAnimationFrame(f);
    }));
    const r = await filmstrip(page, {
      prefix: 'dive-frame',
      act: () => page.evaluate(() => { window.__spike.play('s3'); }),
      done: async () => { await ready(page); await idle(page); },
    });
    const n = diffPairs(r.bufs);
    console.log(`dive strip: screencast ${r.total} 프레임 · ${r.ms}ms · 고른 ${r.bufs.length} 장 · 연속 상이 쌍 ${n}/${r.bufs.length - 1}`);
    expect(r.bufs.length).toBeGreaterThanOrEqual(8);
    expect(n).toBeGreaterThanOrEqual(Math.min(8, r.bufs.length - 2));
    expect(await voidSeen).toBe(0);
    // 카메라 = 1000ms 한 번 · 순간이동 0(프레임마다 기록)
    const cam = await page.evaluate(() => window.__spike.camLog().filter((c) => c[2] === 's3'));
    const span = cam[cam.length - 1][0] - cam[0][0];
    console.log(`S3 카메라 ${cam.length} 프레임 · ${span}ms · z ${cam[0][1]} → ${cam[cam.length - 1][1]}`);
    expect(cam.length).toBeGreaterThanOrEqual(8);
    expect(span).toBeLessThanOrEqual(1000 + 34);
    expect((await st(page)).jumps).toBe(0);
    const z = await page.evaluate(() => window.__spike.map.getZoom());
    expect(z).toBeGreaterThan(14.5);
    // 정사영상 범위 밖은 도시 정사영상이 채우고(밑깔개 · 모든 줌), 범위 틀은 영상이 깔린 뒤에 들어온다.
    // 범위에 걸치기만 한 필지는 범위로 자른 모양만 남는다(원래 모양 0).
    await expect.poll(() => page.evaluate(() => window.__spike.map.getPaintProperty('spk-ob', 'line-opacity'))).toBeGreaterThan(0);
    const probe = await page.evaluate(() => {
      const m = window.__spike.map;
      // 원래 모양 층의 불투명도 식 — 범위 안에 온전히 들지 않은 필지는 z14.5 이상에서 0(queryRenderedFeatures 는 불투명도를 보지 않아 식으로 확인)
      const op = JSON.stringify(m.getPaintProperty('r-line', 'line-opacity'));
      return { city: m.getLayer('city').maxzoom ?? 24, clipVis: m.getLayoutProperty('rc-line', 'visibility'), clipped: window.__spike.tiles().clipped,
        clipRendered: m.queryRenderedFeatures({ layers: ['rc-line'] }).length, insideOnly: op.includes('"inside"') };
    });
    console.log('S3 범위 밖 처리', JSON.stringify(probe));
    expect(probe.insideOnly).toBe(true);
    expect(probe.city).toBeGreaterThan(z);
    expect(probe.clipVis).toBe('visible');
    expect(probe.clipped).toBe(1);
    expect(probe.clipRendered).toBeGreaterThan(0);
    await expect(page.locator('#spk-void')).toBeHidden();
    await expect(page.locator('#spk-range')).toBeEnabled();
    // 락온 브래킷은 같은 필지에 붙은 채 따라왔다
    expect((await st(page)).lockIds).toContain(await page.evaluate(() => window.__spike.focus()));
    expect(errs).toEqual([]);
  });

  test('새로고침 복원 — ?scene=s3&epoch=1.5', async ({ page }) => {
    const errs = watch(page);
    await page.goto(PAGE + '?scene=s3&epoch=1.5');
    await ready(page);
    const s = await st(page);
    expect(s.scene).toBe('s3');
    expect(s.epoch).toBe(1.5);
    expect(s.layers).toEqual({ a: 'namwon_2506', b: 'namwon_2508', opA: 0.5, opB: 0.5 });
    expect(await page.locator('#spk-range').inputValue()).toBe('1.5');
    expect(errs).toEqual([]);
  });
});

/* ══ 2½. 한 장면 — S1 → S3 → S6 → S3 → S1 이 한 카메라로 이어진다 ═════════════ */
test.describe('한 장면', () => {
  test('S1 착지 → S3 → S6 → S3 → S1 — 순간이동 0 · 매 전환이 이전 카메라에서 출발 · 진행률 곡선 · S6 착지 → 선 진입 ≤ 120ms', async ({ page }) => {
    test.setTimeout(90000);
    const errs = watch(page);
    await page.goto(PAGE);
    await arrived(page);
    await page.evaluate(() => window.__spike.camReset());
    const rest = () => page.evaluate(() => window.__spike.map.getZoom());
    const legs = [];
    for (const scene of ['s3', 's6', 's3', 's1']) {
      const z0 = await rest();
      await page.evaluate(() => window.__spike.camReset());
      // S6 가르는 선 — 진입 동안 --swipe 를 매 프레임 기록
      const swipeLog = scene === 's6' ? page.evaluate(() => new Promise((res) => {
        const v = []; const f = () => { const s = document.getElementById('spk-stage').style.getPropertyValue('--swipe'); if (!document.getElementById('spk-swipe').hidden) v.push(parseFloat(s)); if (window.__spike.state().ready && window.__spike.state().scene === 's6') res(v); else requestAnimationFrame(f); };
        requestAnimationFrame(f);
      })) : null;
      // S6 — 착지(카메라 moveend) → 가르는 선의 첫 변화(--swipe) 간격. 죽은 박자 ≤ 120ms
      const landGap = scene === 's6' ? page.evaluate(() => new Promise((res) => {
        const st = document.getElementById('spk-stage'); let tl = 0, prev = st.style.getPropertyValue('--swipe');
        window.__spike.map.once('moveend', () => { tl = performance.now(); prev = st.style.getPropertyValue('--swipe'); });
        const mo = new MutationObserver(() => { const v = st.style.getPropertyValue('--swipe'); if (tl && v !== prev) { mo.disconnect(); res(+(performance.now() - tl).toFixed(1)); } prev = v; });
        mo.observe(st, { attributes: true, attributeFilter: ['style'] });
      })) : null;
      await page.evaluate((sc) => { window.__spike.play(sc); }, scene);
      if (scene === 's1') await arrived(page); else await ready(page);
      const cam = await page.evaluate(() => window.__spike.camLog());
      const s = await st(page);
      legs.push({ scene, z0: +z0.toFixed(2), first: cam[0]?.[1], frames: cam.length, jumps: s.jumps });
      expect(s.jumps, `${scene} 순간이동`).toBe(0);
      expect(cam.length, `${scene} 카메라 프레임`).toBeGreaterThanOrEqual(6);
      // 첫 기록 프레임은 출발 카메라 근처(전환 한 프레임 안 — 줌 1.5 이내)
      expect(Math.abs(cam[0][1] - z0), `${scene} 출발`).toBeLessThanOrEqual(1.5);
      // 진행률 — S3 · S6(1000) · 다시 보기 상승(frame 1000): +300ms ≤ 45 % · +900ms ≤ 95 %
      const pc = progressCurve(scene === 's1' ? cam.filter((c) => c[3] === 'frame') : cam);
      legs[legs.length - 1].progress = pc.curve;
      expect(pc.at(300), `${scene} +300ms 진행`).toBeLessThanOrEqual(0.45);
      expect(pc.at(900), `${scene} +900ms 진행`).toBeLessThanOrEqual(0.95);
      if (landGap) {
        const gap = await landGap;
        legs[legs.length - 1].landToPeel = gap;
        expect(gap, 'S6 착지 → 가르는 선 첫 변화').toBeLessThanOrEqual(120);
      }
      if (swipeLog) {
        const v = await swipeLog;
        console.log('S6 가르는 선', v.length, '프레임', v.slice(0, 3).join(','), '…', v.slice(-2).join(','));
        expect(v[0]).toBeLessThan(25);
        expect(v[v.length - 1]).toBe(50);
        for (let i = 1; i < v.length; i++) expect(v[i]).toBeGreaterThanOrEqual(v[i - 1]);
      }
    }
    console.log('한 장면', JSON.stringify(legs));
    expect(errs).toEqual([]);
  });

  test('S6 진입 스트립 — 필지로 하강 · 선이 결과를 벗긴다 12장', async ({ page }) => {
    test.setTimeout(60000);
    const errs = watch(page);
    await page.goto(PAGE + '?scene=s3&epoch=3');
    await ready(page);
    await idle(page);
    const r = await filmstrip(page, {
      prefix: 's6-frame',
      act: () => page.evaluate(() => { window.__spike.play('s6'); }),
      done: async () => { await ready(page); await idle(page); },
    });
    const n = diffPairs(r.bufs);
    console.log(`s6 strip: screencast ${r.total} 프레임 · ${r.ms}ms · 고른 ${r.bufs.length} 장 · 연속 상이 쌍 ${n}/${r.bufs.length - 1}`);
    expect(r.bufs.length).toBeGreaterThanOrEqual(8);
    expect(n).toBeGreaterThanOrEqual(Math.min(8, r.bufs.length - 2));
    expect(errs).toEqual([]);
  });
});

/* ══ 3. S6 스와이프 ════════════════════════════════════════════════════ */
test.describe('S6 스와이프', () => {
  test('좌 원본 · 우 원본+결과 · 핸들 드래그 · ←/→ ±4 · 지도 2개 동기 · URL', async ({ page }) => {
    const errs = watch(page);
    await page.goto(PAGE);
    await arrived(page);
    await page.evaluate(() => window.__spike.play('s6'));
    await ready(page);
    expect(await page.evaluate(() => document.querySelectorAll('canvas').length)).toBe(2);
    // 좌(A) = 결과 없음 · 우(B) = 결과 청록
    const vis = await page.evaluate(() => {
      const A = window.__spike.map; const B = [...document.querySelectorAll('.spk-map')][1];
      return { a: A.getLayoutProperty('r-fill', 'visibility'), bShown: !B.hidden, clip: getComputedStyle(B).clipPath };
    });
    expect(vis.a).toBe('none');
    expect(vis.bShown).toBe(true);
    expect(vis.clip).toContain('inset');
    await expect(page.locator('#spk-swipe-l')).toContainText('원본');
    await expect(page.locator('#spk-swipe-l')).toContainText('cm');
    await expect(page.locator('#spk-swipe-r')).toContainText('AI 판독');
    await expect(page.locator('#spk-swipe-r')).toContainText('경작지 · 비경작지');
    await expect(page.locator('#spk-play')).toBeHidden();                  // 재생(유휴)은 S3 에만

    // 핸들 끌기
    const grip = page.locator('#spk-grip');
    const box = await grip.boundingBox();
    const stage = await page.locator('#spk-stage').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(box.x + box.width / 2 - (i * (box.x + box.width / 2 - (stage.x + stage.width * 0.3))) / 8, box.y + box.height / 2);
    await page.mouse.up();
    const sw = (await st(page)).swipe;
    expect(Math.abs(sw - 30)).toBeLessThanOrEqual(1.5);
    expect(await page.evaluate(() => document.getElementById('spk-stage').style.getPropertyValue('--swipe'))).toBe(`${sw}%`);
    expect(new URL(page.url()).searchParams.get('swipe')).toBe(String(Math.round(sw)));
    // 키보드 ±4
    await grip.focus();
    await page.keyboard.press('ArrowRight');
    expect((await st(page)).swipe).toBeCloseTo(sw + 4, 5);
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    expect((await st(page)).swipe).toBeCloseTo(sw - 4, 5);
    expect(new URL(page.url()).searchParams.get('scene')).toBe('s6');
    // 클램프 6–94
    await page.evaluate(() => window.__spike.setSwipe(2));
    expect((await st(page)).swipe).toBe(6);
    // 동기 — A 를 움직이면 B 가 따라온다
    await page.evaluate(() => window.__spike.map.panBy([120, -60], { duration: 0 }));
    const c = (await st(page)).centers;
    expect(c[1][0]).toBeCloseTo(c[0][0], 7);
    expect(c[1][1]).toBeCloseTo(c[0][1], 7);
    await page.evaluate(() => window.__spike.map.panBy([-120, 60], { duration: 0 }));

    for (const p of [20, 50, 80]) {
      await page.evaluate((v) => window.__spike.setSwipe(v), p);
      await settle(page);
      await page.screenshot({ path: `${OUT}/s6-swipe-${p}.png` });
    }
    expect(errs).toEqual([]);
  });

  test('새로고침 복원 — ?scene=s6&swipe=42', async ({ page }) => {
    await page.goto(PAGE + '?scene=s6&swipe=42&epoch=1');
    await ready(page);
    const s = await st(page);
    expect(s.scene).toBe('s6');
    expect(s.swipe).toBe(42);
    await expect(page.locator('#spk-grip')).toHaveAttribute('aria-valuenow', '42');
  });
});

/* ══ 4. 법전 ══════════════════════════════════════════════════════════ */
test.describe('법전', () => {
  test('지속값 · 이징 · 앰버 한 곳 — 소스 스캔', () => {
    const css = fs.readFileSync(`${SRC}.css`, 'utf8');
    const js = fs.readFileSync(`${SRC}.js`, 'utf8');
    const cssCode = strip(css), jsCode = strip(js);
    const ms = new Set();
    for (const m of cssCode.matchAll(/(\d+(?:\.\d+)?)(ms|s)\b/g)) ms.add(m[2] === 's' ? Math.round(+m[1] * 1000) : +m[1]);
    for (const m of jsCode.matchAll(/(\d+(?:\.\d+)?)ms\b/g)) ms.add(+m[1]);
    const D = /const D = \{([\s\S]*?)\};/.exec(js)[1];
    for (const m of strip(D).matchAll(/:\s*(\d+)/g)) ms.add(+m[1]);
    for (const m of jsCode.matchAll(/duration:\s*(\d+)/g)) ms.add(+m[1]);
    for (const m of jsCode.matchAll(/setTimeout\([^;]*?,\s*(\d+)\s*\)/g)) ms.add(+m[1]);
    ms.delete(0);                                                            // 0 = 움직임 없음(즉시)
    console.log('지속값 집합', [...ms].sort((a, b) => a - b).join(' · '));
    for (const v of ms) expect(LAW_MS.has(v), `지속값 ${v}`).toBe(true);
    // 이징 — 리터럴은 둘뿐, CSS 키워드 이징 0
    for (const m of (cssCode + jsCode).matchAll(/(?:cubic-bezier|bezier)\(\s*([\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+)\s*\)/g)) {
      expect(LAW_EASE, `이징 ${m[1]}`).toContain(m[1].replace(/\s/g, ''));
    }
    expect(cssCode).not.toMatch(/\b(ease-in|ease-out|ease-in-out|linear|steps)\b/);
    // 앰버는 락온 규칙 한 곳
    expect((css.match(/#FFB633/gi) || []).length).toBe(1);
    expect((js.match(/#FFB633/gi) || []).length).toBe(0);
    const amberRule = /([^{}]+)\{[^}]*#FFB633/i.exec(css)[1].trim();
    expect(amberRule).toBe('.spk-lock');
    expect(/spk-amber var\(--lk2\)/.test(css)).toBe(true);
    expect(css).toContain('--lk2:80ms');
    // 3D 0 · 외부 CDN 0
    expect(js).not.toMatch(/setTerrain|fill-extrusion|pitch:\s*[1-9]/);
    const html = fs.readFileSync(`${SRC}.html`, 'utf8');
    expect(html).not.toMatch(/https?:\/\//);
    // 첫 페인트부터 조용한 띠 — 재생 버튼 hidden · 띠 data-quiet="1"(스크립트가 숨기기 전에 한 번 보였다 사라지는 플래시 0)
    expect(html).toMatch(/<button[^>]*id="spk-play"[^>]*\shidden[\s>]/);
    expect(html).toMatch(/<section[^>]*id="spk-scrub"[^>]*data-quiet="1"/);
  });

  test('라운드 · 그림자 · 그라디언트 · 유리 0 · 14px 바닥 · 3D 0 (세 장면)', async ({ page }) => {
    const errs = watch(page);
    await page.goto(PAGE);
    await arrived(page);
    const audit = () => page.evaluate(() => {
      const bad = [];
      for (const el of document.querySelectorAll('body *')) {
        if (el.closest('.maplibregl-map') && !el.closest('.spk-plate,.spk-swipe,.spk-locks')) continue;   // 지도 라이브러리 내부 제외
        if (el.closest('[hidden]') || el.tagName === 'svg' || el.closest('svg')) continue;
        const cs = getComputedStyle(el);
        if (cs.display === 'none') continue;
        for (const pe of [null, '::before', '::after']) {
          const c = pe ? getComputedStyle(el, pe) : cs;
          if (pe && (c.content === 'none' || c.content === 'normal')) continue;
          const id = (el.id || el.className || el.tagName) + (pe || '');
          if (c.borderRadius !== '0px' && c.borderRadius !== '') bad.push(`${id} radius ${c.borderRadius}`);
          if (c.boxShadow !== 'none') bad.push(`${id} shadow`);
          if (/gradient/.test(c.backgroundImage)) bad.push(`${id} gradient`);
          if (c.backdropFilter && c.backdropFilter !== 'none') bad.push(`${id} backdrop`);
        }
        const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
        if (own && el.getClientRects().length && parseFloat(cs.fontSize) < 14) bad.push(`${el.id || el.className} font ${cs.fontSize}`);
      }
      const m = window.__spike.map;
      if (m.getPitch() !== 0) bad.push('pitch');
      if (m.getTerrain?.()) bad.push('terrain');
      if (m.getStyle().layers.some((l) => l.type === 'fill-extrusion')) bad.push('extrusion');
      return bad;
    });
    expect(await audit()).toEqual([]);
    await page.evaluate(() => window.__spike.play('s3'));
    await ready(page);
    await page.evaluate(() => window.__spike.setEpoch(1));
    expect(await audit()).toEqual([]);
    await page.evaluate(() => window.__spike.play('s6'));
    await ready(page);
    expect(await audit()).toEqual([]);
    expect(errs).toEqual([]);
  });

  test('호버 = 180ms 물리 반응(4px 이동)', async ({ page }) => {
    await page.goto(PAGE);
    await arrived(page);
    const seg = page.locator('#spk-seg button[data-scene="s3"]');
    const tr = await seg.evaluate((el) => { const c = getComputedStyle(el); return { p: c.transitionProperty, d: c.transitionDuration, e: c.transitionTimingFunction }; });
    expect(tr.p).toContain('transform');
    expect(tr.d).toBe('0.18s');
    expect(tr.e).toBe('cubic-bezier(0.22, 1, 0.36, 1)');
    await seg.hover();
    await expect.poll(() => seg.evaluate((el) => getComputedStyle(el).transform)).toBe('matrix(1, 0, 0, 1, 0, -4)');
  });

  test('제품 화면에서 스파이크로 오는 링크 0', () => {
    const hits = [];
    const walk = (d) => {
      for (const f of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, f.name);
        if (f.isDirectory()) { if (!/spikes|vendor|assets|node_modules/.test(f.name)) walk(p); continue; }
        if (/\.(html|js|mjs)$/.test(f.name) && strip(fs.readFileSync(p, 'utf8')).replace(/<!--[\s\S]*?-->/g, '').includes('ximap-signature')) hits.push(p);   // 주석 속 출처 표기(승격 기록)는 링크가 아니다
      }
    };
    walk('landxi');
    expect(hits).toEqual([]);
  });
});

/* ══ 5. 성능 · 폭 · reduced-motion ════════════════════════════════════ */
test.describe('성능 · 폭 · reduced-motion', () => {
  test('S1 도착 동안 rAF p95 ≤ 20ms · canvas ≤ 2', async ({ page }) => {
    const errs = watch(page);
    await page.goto(PAGE);
    await arrived(page);
    const p = await page.evaluate(() => window.__spike.perf());
    console.log('S1 perf', JSON.stringify(p));
    expect(p.n).toBeGreaterThan(60);
    expect(p.p95).toBeLessThanOrEqual(20);
    expect(p.canvases).toBeLessThanOrEqual(2);
    expect(errs).toEqual([]);
  });

  for (const [w, h] of [[1280, 720], [1440, 900], [1920, 1080]]) {
    test(`폭 ${w} — 캔버스 ≥ 90 %`, async ({ page }) => {
      const errs = watch(page);
      await page.setViewportSize({ width: w, height: h });
      await page.goto(PAGE);
      await arrived(page);
      const r = await page.evaluate(() => { const c = document.querySelector('#spk-map-a canvas').getBoundingClientRect(); return (c.width * c.height) / (innerWidth * innerHeight); });
      console.log(`캔버스 비율 ${w}: ${(r * 100).toFixed(1)} %`);
      expect(r).toBeGreaterThanOrEqual(0.9);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      // 하단 띠 — 시점 라벨 두 줄(2025.04 / 1.08 cm)이 띠 안에, 띠는 창 안에(잘림 0)
      const lay = await page.evaluate(() => {
        const r = (e) => e.getBoundingClientRect();
        const scrub = r(document.getElementById('spk-scrub')), seg = r(document.getElementById('spk-seg'));
        const lis = [...document.querySelectorAll('#spk-ticks li')].map((li) => { const b = r(li); return { top: b.top, bottom: b.bottom, left: b.left, right: b.right }; });
        return { vh: innerHeight, scrub: { top: scrub.top, bottom: scrub.bottom, left: scrub.left, right: scrub.right }, seg: { bottom: seg.bottom }, lis };
      });
      expect(lay.scrub.bottom).toBeLessThanOrEqual(lay.vh - 8);
      expect(lay.seg.bottom).toBeLessThanOrEqual(lay.vh - 8);
      for (const li of lay.lis) {
        expect(li.bottom, `${w} 라벨 바닥`).toBeLessThanOrEqual(lay.scrub.bottom - 6);
        expect(li.left).toBeGreaterThanOrEqual(lay.scrub.left);
        expect(li.right).toBeLessThanOrEqual(lay.scrub.right);
      }
      // 락온 속성 한 줄도 창 안(오른쪽 끝 필지면 왼쪽으로 뒤집힌다)
      const flag = await page.locator('.spk-lock .spk-flag').first().boundingBox();
      expect(flag.x).toBeGreaterThanOrEqual(0);
      expect(flag.x + flag.width, `${w} 속성 줄 오른쪽`).toBeLessThanOrEqual(w);
      if (w !== 1920) {
        await settle(page);
        await page.screenshot({ path: `${OUT}/02-s1-${w}.png` });
        await page.evaluate(() => window.__spike.play('s3'));
        await ready(page);
        await page.evaluate(() => window.__spike.setEpoch(1));
        await settle(page);
        await page.screenshot({ path: `${OUT}/03-s3-${w}.png` });
        await page.evaluate(() => window.__spike.play('s6'));
        await ready(page);
        await settle(page);
        await page.screenshot({ path: `${OUT}/04-s6-${w}.png` });
      }
      expect(errs).toEqual([]);
    });
  }

  test('reduced-motion — 1s 안 arrived · 프레임 12장 중 동일 쌍 ≥ 10', async ({ page }) => {
    const errs = watch(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(PAGE);
    // 도착까지 1s — 부팅(지도 · GeoJSON 적재)이 끝난 시점부터 잰다
    await page.waitForFunction(() => window.__spike?.map, null, { timeout: 20000 });
    await arrived(page, 1000);
    await expect(page.locator('#hud-big')).toHaveAttribute('aria-label', '2,098');
    await idle(page);
    const bufs = [];
    for (let i = 0; i < 12; i++) { bufs.push(await page.screenshot()); await page.waitForTimeout(100); }
    const same = 11 - diffPairs(bufs);
    console.log(`reduced-motion 동일 쌍 ${same}/11`);
    expect(same).toBeGreaterThanOrEqual(10);
    expect(await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length)).toBe(0);
    expect(errs).toEqual([]);
  });
});

/* ══ 6. 영상 — S1 → S3 재생 → S6 조작 ════════════════════════════════ */
test.describe('영상', () => {
  // test.use({ video }) 는 describe 안에서 새 워커를 강요해 막혀 있다 → recordVideo 컨텍스트를 직접 연다.
  test('signature.webm — S1 도착 · S3 재생 · S6 스와이프', async ({ browser }, testInfo) => {
    test.setTimeout(60000);
    const dir = testInfo.outputPath('video');
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, baseURL: testInfo.project.use.baseURL, recordVideo: { dir, size: { width: 1440, height: 900 } } });
    const page = await ctx.newPage();
    const errs = watch(page);
    const t0 = Date.now();
    await page.goto(PAGE);
    await arrived(page);
    await page.waitForTimeout(1000);                                          // 영상 연출 — 착지 화면에 1s 머문다(판정 아님)
    await page.click('#spk-seg button[data-scene="s3"]');
    await ready(page);
    await page.evaluate(() => window.__spike.setEpoch(0));
    await page.click('#spk-play');
    await page.waitForFunction(() => window.__spike.state().stops.length >= 3, null, { timeout: 20000 });
    await page.click('#spk-seg button[data-scene="s6"]');
    await ready(page);
    const box = await page.locator('#spk-grip').boundingBox();
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    for (let i = 1; i <= 20; i++) { await page.mouse.move(cx - i * 16, cy); await page.waitForTimeout(16); }
    for (let i = 1; i <= 36; i++) { await page.mouse.move(cx - 320 + i * 18, cy); await page.waitForTimeout(16); }
    await page.mouse.up();
    await page.waitForTimeout(300);
    const v = page.video();
    console.log('영상 길이 ≈', ((Date.now() - t0) / 1000).toFixed(1), 's');
    await page.close();
    // --repeat-each 로 같은 테스트가 겹쳐 돌면 같은 파일을 두고 다툰다(EBUSY) — 반복분은 접미사를 붙인다
    const file = `${OUT}/signature${testInfo.repeatEachIndex ? '-' + testInfo.repeatEachIndex : ''}.webm`;
    await v.saveAs(file);
    await ctx.close();
    expect(fs.statSync(file).size).toBeGreaterThan(50000);
    expect(errs).toEqual([]);
  });
});
