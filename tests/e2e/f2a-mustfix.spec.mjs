// F2-A · 1차 판정 must_fix 6 재발 방지 — ① 카드 진입 첫 프레임 제자리(마스트·검색·레일 교차 0 · 100ms 표본) ② 가르기 칩 HUD 밖(1280/1440/1920)
//   ③ HUD '칩/s — · 창 짧음' → job.done 두 줄 ④ HLS 커버리지 판정 · '어제 · 구름 n%' ⑤ HUD 한 패널 한 출처 ⑥ 락온 꼬리표 '칸 a/b · 도착 n건 · 클래스'(id 는 title)
// 실행: npx playwright test tests/e2e/f2a-mustfix --reporter=line
import { test, expect } from '@playwright/test';

const API = process.env.LX_API === 'on' ? 'http://localhost:8700' : null;
async function bootApi(page, url, { realm = 'lx', role = 'staff', tenant = null } = {}) {
  let session = null;
  if (API && realm) {
    const r = await fetch(API + '/api/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(realm === 'lx' ? { realm, login: ({ staff: 'test@lx.or.kr', admin: 'lxadmin@lx.or.kr', sales: 'sales@lx.or.kr' })[role], password: process.env.DEV_PASSWORD || 'landxi-dev-2026' } : { realm, tenant_id: tenant, login: 'lxadmin@lx.or.kr', site: 'gov', password: process.env.DEV_PASSWORD || 'landxi-dev-2026' }) });
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
const AOI = '?cam=127.3524,35.5308,16.6,35,0&on=namwon-farmland-2025,namwon-change';
/** 카드가 보이는 동안 매 프레임 자리(getBoundingClientRect)와 크롬 교차를 기록 */
const probeCard = (page, id) => page.evaluate((id) => new Promise((res) => {
  const el = document.getElementById(id), out = []; let t0 = null;
  const chrome = ['mast', 'search', 'mode-sw', 'panel'].map((k) => document.getElementById(k)).filter((e) => e && !e.hidden && e.offsetParent !== null);
  const f = (now) => {
    if (!el.hidden && getComputedStyle(el).display !== 'none') {
      t0 ??= now;
      const r = el.getBoundingClientRect(), op = +getComputedStyle(el).opacity;
      const hit = chrome.filter((c) => { const b = c.getBoundingClientRect(); return op > 0.02 && r.left < b.right && r.right > b.left && r.top < b.bottom && r.bottom > b.top; }).map((c) => c.id);
      out.push({ t: Math.round(now - t0), x: Math.round(r.left), y: Math.round(r.top), op: +op.toFixed(2), hit });
      if (now - t0 > 700) return res(out);
    }
    requestAnimationFrame(f);
  };
  requestAnimationFrame(f);
}), id);

test('① 견적 카드 · 필지 카드 v2 · 읍면동 카드 — 첫 프레임부터 제자리(4px 아래 → 제자리) · 크롬 교차 0', async ({ page }) => {
  test.setTimeout(150000);
  const errs = watch(page);
  await bootApi(page, XI + AOI);
  await page.waitForFunction(() => document.documentElement.dataset.restored === '1', null, { timeout: 90000 });
  // 견적 카드: 화면 왼쪽 위 가까이 프레임(마스트 · 검색 · 레일과 부딪힐 자리)
  await page.click('#tool-rect');
  const probe = probeCard(page, 'quote-card');
  await page.mouse.move(400, 140); await page.mouse.down(); await page.mouse.move(600, 330, { steps: 8 }); await page.mouse.up();   // 왼쪽 위(마스트·검색 바로 옆)
  const q = await probe;
  console.log('quote', JSON.stringify(q.filter((_, i) => i % 3 === 0)));
  const x0 = q[0].x, yEnd = q[q.length - 1].y;
  expect(q.every((s) => s.x === x0)).toBe(true);                      // 가로 순간이동 0
  expect(q.every((s) => s.y >= yEnd && s.y <= yEnd + 4)).toBe(true);   // 4px 아래 → 제자리(그 밖 0)
  expect(q.flatMap((s) => s.hit)).toEqual([]);                        // 마스트·검색·레일 교차 0
  await page.click('#quote-card .xi-cancel');
  // 필지 카드 v2
  const probe2 = probeCard(page, 'pcard2');
  await page.evaluate(async () => { const X = window.__xi; const fa = await X.loadA02(); X.openParcel(fa.features.find((x) => x.properties.id === X.state.aoiParcels[0])); });
  const c = await probe2;
  expect(c.every((s) => s.x === c[0].x)).toBe(true);
  expect(c.every((s) => s.y >= c[c.length - 1].y && s.y <= c[c.length - 1].y + 4)).toBe(true);
  expect(c.flatMap((s) => s.hit)).toEqual([]);
  await page.click('#pcard2 .xi-x');
  expect(errs).toEqual([]);
});

/** 필지 카드 v2 가 보이는 동안 매 프레임 — 카드 bbox ∩ HUD 큰 숫자(#hud-big · #hud-unit) 교차(2차 판정 ①) */
const probeBig = (page, ms = 900) => page.evaluate((ms) => new Promise((res) => {
  const el = document.getElementById('pcard2'), out = []; let t0 = null;
  const hit = (a, b) => a && b && b.width && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  const f = (now) => {
    if (!el.hidden && getComputedStyle(el).display !== 'none' && +getComputedStyle(el).opacity > 0.02) {
      t0 ??= now;
      const r = el.getBoundingClientRect(), big = document.getElementById('hud-big').getBoundingClientRect(), unit = document.getElementById('hud-unit').getBoundingClientRect();
      out.push({ t: Math.round(now - t0), card: [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)], big: [Math.round(big.left), Math.round(big.top), Math.round(big.right), Math.round(big.bottom)], hit: hit(r, big) || hit(r, unit) });
      if (now - t0 > ms) return res(out);
    }
    requestAnimationFrame(f);
  };
  requestAnimationFrame(f);
}), ms);
const PNU1 = '5219045021110530012';   // README 사례 1 · 아영면 아곡리 1053-12 · R1 A
for (const [W, H] of [[1280, 800], [1440, 900], [1920, 1080]]) {
  test(`①-2 필지 카드 v2 ∩ HUD 124px 숫자 = 0 — ${W}×${H} · 판독 모드 · 실태조사 모드 · 서랍+카드(레일)`, async ({ browser }) => {
    test.setTimeout(200000);
    const ctx = await browser.newContext({ viewport: { width: W, height: H } });
    const page = await ctx.newPage();
    const errs = watch(page);
    await bootApi(page, XI + '?cam=127.47,35.425,12.5,35,0&on=namwon-landcover-2023');
    await page.waitForFunction(() => document.documentElement.dataset.restored === '1', null, { timeout: 90000 });
    const res = {};
    // 판독 모드(129,420 폴리곤 · 7자리 숫자)
    let pr = probeBig(page);
    await page.evaluate((pnu) => window.XI.parcelCard(pnu), PNU1);
    res.read = await pr;
    await page.evaluate(() => window.__xi.svy.card.close()); await page.waitForTimeout(450);
    // 실태조사 모드(의심 필지 20,852)
    await page.evaluate(() => window.XI.setMode('survey'));
    await page.waitForFunction(() => window.__xi.PHASES.some((x) => x.p === 'survey-result'), null, { timeout: 60000 });
    await page.waitForTimeout(600);
    pr = probeBig(page);
    await page.evaluate((pnu) => window.XI.parcelCard(pnu), PNU1);
    res.survey = await pr;
    await page.evaluate(() => window.__xi.svy.card.close()); await page.waitForTimeout(450);
    // 서랍(큐) + 카드 — 서랍이 레일로 접히고 카드는 숫자·레일과 교차 0
    await page.evaluate(() => window.XI.openDrawer('findings', { rule: 'R1', priority: 'A' }));
    await page.waitForFunction(() => document.getElementById('fdrawer').dataset.total != null, null, { timeout: 30000 });
    await page.waitForTimeout(500);
    pr = probeBig(page);
    await page.click('#fdrawer .sv-item >> nth=0');
    res.queue = await pr;
    const rail = await page.evaluate(() => { const d = document.getElementById('fdrawer'), c = document.getElementById('pcard2'); const a = d.getBoundingClientRect(), b = c.getBoundingClientRect(); return { rail: d.dataset.rail, w: Math.round(a.width), cross: a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top }; });
    for (const k of ['read', 'survey', 'queue']) console.log(W, k, JSON.stringify({ n: res[k].length, first: res[k][0], last: res[k].at(-1), hits: res[k].filter((x) => x.hit).length }));
    console.log(W, 'rail', JSON.stringify(rail));
    for (const k of ['read', 'survey', 'queue']) { expect(res[k].length, k).toBeGreaterThan(10); expect(res[k].filter((x) => x.hit), k).toEqual([]); }
    expect(rail.rail).toBe('1'); expect(rail.cross).toBe(false);
    await page.screenshot({ path: `shots/f2/F2-A/stills/swipe80-${W}.png` }).catch(() => {});
    expect(errs).toEqual([]);
    await ctx.close();
  });
}

for (const [W, H] of [[1280, 800], [1440, 900], [1920, 1080]]) {
  test(`② 가르기 칩 — ${W}×${H} · 20/50/80 % 에서 HUD · 카드 · 계기와 교차 0 · 두 칩 한 줄`, async ({ browser }) => {
    test.setTimeout(150000);
    const ctx = await browser.newContext({ viewport: { width: W, height: H } });
    const page = await ctx.newPage();
    const errs = watch(page);
    await bootApi(page, XI + AOI);
    await page.waitForFunction(() => document.documentElement.dataset.restored === '1', null, { timeout: 90000 });
    // F2 통합(F2-A must_fix ①): 여는 순간 B(오른쪽 판)는 opacity 0 — 타일이 선 뒤(areTilesLoaded · idle)에만 페이드. 매 프레임 표본.
    const gate = page.evaluate(() => new Promise((res) => { const w = document.getElementById('map-b'), out = []; const t0 = performance.now();
      const f = () => { const op = +getComputedStyle(w).opacity; const vis = w.classList.contains('is-swipe'); let tl = null; try { tl = window.__xi.B.areTilesLoaded(); } catch { /* */ } if (vis) out.push({ t: Math.round(performance.now() - t0), op, tl });
        if (performance.now() - t0 < 2500) requestAnimationFrame(f); else res(out); }; requestAnimationFrame(f); }));
    await page.click('#tool-swipe');
    await page.waitForFunction(() => window.__xi.swipe.S.on, null, { timeout: 10000 });
    const g = await gate;
    const firstVisible = g.find((x) => x.op > 0.01);
    console.log(W, 'gate', JSON.stringify({ n: g.length, first: g[0], firstVisible, why: await page.evaluate(() => window.__xi.swipe.S.gate) }));
    expect(g.length).toBeGreaterThan(0);
    expect(g[0].op).toBeLessThan(0.01);                                           // 켠 첫 프레임은 투명(백지 번쩍임 0)
    if (firstVisible && (await page.evaluate(() => window.__xi.swipe.S.gate?.why)) !== 'timeout') expect(firstVisible.tl).toBe(true);   // 보이기 시작한 프레임에 B 타일 적재 완료
    for (const v of [20, 50, 80]) {
      await page.evaluate((v) => window.__xi.swipe.set(v), v);
      await page.waitForTimeout(120);
      const r = await page.evaluate(() => {
        const R = (id) => document.getElementById(id)?.getBoundingClientRect();
        const hit = (a, b) => a && b && b.width && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
        const l = R('sw-l'), r = R('sw-r');
        const others = ['hud', 'gauge', 'scrub', 'quote-card', 'pcard2', 'emd-card'].filter((id) => { const e = document.getElementById(id); return e && !e.hidden && e.offsetParent !== null; });
        const g = R('grip'); const hudHit = [...document.querySelectorAll('.xi-hud > *')].filter((e) => !e.hidden && e.offsetParent !== null).map((e) => e.getBoundingClientRect()).filter((b) => hit(g, b)).length;
        return { l: l.toJSON(), r: r.toJSON(), hits: others.filter((id) => hit(l, R(id)) || hit(r, R(id))), sameRow: Math.abs(l.top - r.top) < 1, grip: g.toJSON(), gripHud: hudHit, inView: l.left >= 0 && r.right <= innerWidth };
      });
      expect(r.gripHud, `#grip ∩ (.xi-hud > *) @ ${W} ${v}%`).toBe(0);            // F2 통합(F2-A must_fix ②): 그립이 HUD 글자를 가리지 않는다
      console.log(W, v, JSON.stringify({ hits: r.hits, sameRow: r.sameRow, l: [r.l.left, r.l.right, r.l.top], r: [r.r.left, r.r.right, r.r.top] }));
      expect(r.hits).toEqual([]);
      expect(r.sameRow).toBe(true);
      expect(r.l.right).toBeLessThanOrEqual(r.grip.left + 1); expect(r.r.left).toBeGreaterThanOrEqual(r.grip.right - 1);
      expect(r.inView).toBe(true);
    }
    expect(errs).toEqual([]);
    await ctx.close();
  });
}

test('③⑥ 프레임 실행 — 진행 중 칩/s 결손 표기 · 락온 꼬리표 칸 a/b · 도착 n건 · 클래스(shard id 는 title) · job.done 두 줄', async ({ page }) => {
  test.setTimeout(200000);
  const errs = watch(page);
  await bootApi(page, XI + AOI + ',namwon-landcover-2023');
  await page.waitForFunction(() => document.documentElement.dataset.restored === '1', null, { timeout: 90000 });
  await page.evaluate(() => { window.__jobLines = []; const el = document.getElementById('hud-job'); new MutationObserver(() => window.__jobLines.push(el.textContent)).observe(el, { childList: true, subtree: true }); });
  await page.click('#tool-rect');
  await page.mouse.move(520, 320); await page.mouse.down(); await page.mouse.move(880, 620, { steps: 10 }); await page.mouse.up();
  await page.waitForSelector('#quote-card .xi-run', { timeout: 15000 });
  await page.click('#quote-card .xi-run');
  await page.waitForFunction(() => document.querySelectorAll('#locks .xi-lock-flag').length > 0, null, { timeout: 90000 });
  const flags = await page.evaluate(() => [...document.querySelectorAll('#locks .xi-lock-flag')].map((f) => ({ t: f.textContent, title: f.title })));
  await page.waitForFunction(() => window.__xi.PHASES.some((x) => x.p === 'job-done'), null, { timeout: 150000 });
  await page.waitForTimeout(1500);
  const r = await page.evaluate(() => ({ lines: window.__jobLines, own1: document.querySelector('#hud-job .xi-own1')?.textContent, own2: document.querySelector('#hud-job .xi-own2')?.textContent, gpu: document.querySelector('#hud-job .xi-gpuu')?.textContent || '', api: window.__xi.jobApi || null, perf: window.__xi.hud.perf && Object.fromEntries(Object.entries(window.__xi.hud.perf).map(([k, v]) => [k, v?.value ?? v])) }));
  console.log('flags', JSON.stringify(flags.slice(0, 3)));
  console.log('job', JSON.stringify({ own1: r.own1, own2: r.own2, api: r.api, perf: r.perf, gpu: r.gpu, mid: r.lines.filter((l) => /칩\/s/.test(l)).slice(0, 2) }));
  for (const f of flags) { expect(f.t).toMatch(/^칸 \d+\/\d+탐지 \d+건/); expect(f.t).not.toMatch(/r\d{3}c\d{3}/); expect(f.title).toMatch(/^shard r\d{3}c\d{3}$/); }
  expect(r.lines.some((l) => l.includes('칩/s — · 창 짧음') || /\d칩\/s/.test(l))).toBe(true);
  expect(r.lines.some((l) => /0\.5\s*칩|12\.0칩\/s/.test(l))).toBe(false);   // 창 하한 인공값(n/0.5) 표기 0
  expect(r.own1).toMatch(/^GPU 초당 .*칩 · 벽시계 .*칩\/s$/);
  expect(r.own2).toMatch(/^이 작업 .* GPU·s · .* s$/);
  if (API) { expect(r.api?.gpu_s?.value).toBeGreaterThan(0); expect(r.perf.gpu_s).toBeCloseTo(r.api.gpu_s.value, 2); expect(r.gpu).toMatch(/GPU\d 이용률\(공유\) [\d.]+% · \d+ W|GPU\d 이용률\(공유\) [\d.]+%/); }
  expect(errs).toEqual([]);
});

test('④ HLS 판정 · 글로브 구름 칩 — 커버리지 < 70 % 면 층 끔 + 결손 칩 · 하강 경로 3 카메라 실측', async ({ page }) => {
  test.setTimeout(150000);
  const errs = watch(page);
  await bootApi(page, XI);
  await page.waitForFunction(() => window.__xi.PHASES.some((x) => x.p === 'sweep'), null, { timeout: 90000 });
  const r = await page.evaluate(() => ({ gate: window.__xi.hlsGate, wait: window.__xi.hlsGateWait, sky: window.__xi.sky, miss: window.__xi.missLog || [], vis: window.__xi.A.getLayer('img-gibs-hls-s30') ? window.__xi.A.getLayoutProperty('img-gibs-hls-s30', 'visibility') : 'absent', floor: window.__xi.A.getLayer('img-xdworld-floor')?.minzoom }));
  console.log(JSON.stringify(r));
  expect(r.gate.cams.length).toBe(3);
  for (const c of r.gate.cams) { expect(c.cov).toBeGreaterThanOrEqual(0); expect(c.cov).toBeLessThanOrEqual(1); }
  if (!r.gate.ok) { expect(r.vis).toBe('none'); expect(r.miss.some((m) => m.startsWith('HLS 30m · 궤도 밖'))).toBe(true); }
  else expect(r.gate.min).toBeGreaterThanOrEqual(0.7);
  expect(r.floor).toBeLessThanOrEqual(6.5);                       // V-World 받침 z6.5 부터
  if (r.sky) expect(r.miss).toContain(`어제 · 구름 ${r.sky.cloud}%`);
  expect(errs).toEqual([]);
});

test('④-2 V-World 받침 게이트 — 뷰포트를 다 덮은 뒤 500 ms 페이드 · 열리기 전 이득 0 · 단독 타일 프레임 0', async ({ page }) => {
  test.setTimeout(150000);
  const errs = watch(page);
  await bootApi(page, XI);
  await page.waitForFunction(() => window.__xi?.A?.getLayer?.('img-xdworld-floor'), null, { timeout: 60000 });
  await page.evaluate(async () => {
    const { sourceCover } = await import('/landxi/xi/engine/ladder.js');
    const A = window.__xi.A; const F = (window.__gateFrames = []);
    const tick = () => { const z = A.getZoom(), g = A.__gain?.['img-xdworld-floor'] ?? 0, gs = A.__gain?.['img-xdworld-satellite'] ?? 0;
      if (z >= 6.4 && z <= 10.5) F.push({ z: +z.toFixed(2), g: +g.toFixed(3), gs: +gs.toFixed(3), cov: g > 0 || gs > 0 ? +sourceCover(A, 'src-xdworld-floor').toFixed(3) : null });
      if (F.length < 3000) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
  await page.waitForFunction(() => window.__xi.PHASES.some((x) => x.p === 'sweep'), null, { timeout: 90000 });
  const r = await page.evaluate(() => ({ log: (window.__xi.A.__gateLog || []).filter((e) => e.ev !== 'check'), checks: (window.__xi.A.__gateLog || []).filter((e) => e.ev === 'check').length, F: window.__gateFrames }));
  const open = r.log.find((e) => e.ev === 'open'), lit = r.F.filter((f) => f.g > 0 || f.gs > 0), holes = lit.filter((f) => f.cov < 0.98);
  console.log(JSON.stringify({ open, inEv: r.log.find((e) => e.ev === 'in'), checks: r.checks, frames: r.F.length, lit: lit.length, minCov: Math.min(...lit.map((f) => f.cov)), holes: holes.slice(0, 5) }));
  expect(open).toBeTruthy();
  expect(open.cov).toBeGreaterThanOrEqual(0.999);                  // 열리는 순간 받침 타일이 화면 100 %
  const inE = r.log.find((e) => e.ev === 'in'); expect(inE.t - open.t).toBeGreaterThanOrEqual(450);   // 500 ms 페이드
  expect(holes).toEqual([]);                                       // 켜진 뒤 받침이 화면을 못 덮은 프레임 0 (단독 타일 · 조각 0)
  expect(r.F.filter((f) => f.z < 6.45 && (f.g > 0 || f.gs > 0))).toEqual([]);
  expect(errs).toEqual([]);
});

test('⑤ HUD 한 패널 한 출처 — 작업 결과가 떠 있으면 스크럽이 HUD 숫자·상태를 바꾸지 않는다 · AOI 변화 숫자일 때는 봉투째 교체', async ({ page }) => {
  test.setTimeout(150000);
  const errs = watch(page);
  await bootApi(page, XI + AOI);
  await page.waitForFunction(() => document.documentElement.dataset.restored === '1', null, { timeout: 90000 });
  // AOI 변화 숫자(456)가 HUD 에 있을 때: 정수 시점 1 → pair 봉투로 숫자·상태가 함께 바뀐다
  await page.evaluate(() => window.__xi.scrub.set(1));
  const a = await page.evaluate(() => ({ big: document.getElementById('hud-big').textContent, note: document.getElementById('hud-note').textContent, prov: document.getElementById('hud-prov').textContent }));
  expect(a.big).not.toBe('456'); expect(a.note).toContain('변화'); expect(a.prov).toContain('변화 지수');
  await page.evaluate(() => window.__xi.scrub.set(0));
  expect(await page.evaluate(() => document.getElementById('hud-big').textContent)).toBe('456');
  // HUD 를 다른 출처(브리지 hud.set)로 바꾼 뒤 스크럽 → HUD 불변
  await page.evaluate(() => window.XI.hud.set({ value: 71, unit: 'count', basis: 'demo', as_of: '2026-09-27', source: 'e2e 작업 결과' }, { title: '작업 결과', unit: '건' }));
  const before = await page.evaluate(() => [document.getElementById('hud-big').textContent, document.getElementById('hud-status').textContent, document.getElementById('hud-prov').textContent]);
  await page.evaluate(() => { window.__xi.scrub.set(2); window.__xi.scrub.set(2.5); });
  const after = await page.evaluate(() => [document.getElementById('hud-big').textContent, document.getElementById('hud-status').textContent, document.getElementById('hud-prov').textContent]);
  expect(after).toEqual(before);
  expect(await page.evaluate(() => document.querySelector('#scrub .xi-scrub-label').textContent)).toMatch(/2025/);   // 스크럽 문맥은 스크러버 라벨에
  expect(errs).toEqual([]);
});
