// F2-D · 1차 판정 must_fix 3 · 4 · 6① — 남원 진입 ready → 후퇴 ≤ 5 s(빈 캐시 · 후퇴 경로만) · 칩은 그동안만 ·
// 히어로·목록은 z ≤ 3 뒤 · 착지 → 카드 ≤ 500 ms · 첫 방문 클릭 → 카드(으슥아타 ≤ 3 s · 메이크틸라 ≤ 3.5 s) · 경유점 정지 ≤ 500 ·
// 재방문(새 문서 · 같은 HTTP 캐시) PF 칩 0 · EOX 네트워크 재요청 0(CDP fromDiskCache 단언).
import { test, expect } from '@playwright/test';
import fs from 'node:fs';

async function boot(page, url) {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('lx_e2e_boot')) { sessionStorage.setItem('lx_e2e_boot', '1'); localStorage.setItem('lx_api_mode', 'off'); localStorage.setItem('lx_logged_in', '1'); localStorage.setItem('lx_role', 'staff'); }
    window.__pfv = []; window.__zt = [];
    const f = () => { try { const pf = document.getElementById('pf'); const m = window.__f1d?.stage?.map; window.__pfv.push([performance.now(), !!pf && !pf.hidden]); if (m) window.__zt.push([performance.now(), m.getZoom(), document.getElementById('root').dataset.scene, getComputedStyle(document.getElementById('hero')).opacity]); } catch { /* */ } requestAnimationFrame(f); };
    requestAnimationFrame(f);
  });
  await page.goto(url);
  await page.waitForFunction(() => document.documentElement.dataset.lx === 'ready', null, { timeout: 30000 });
}
function watch(page) {
  const errs = [], ext = [];
  page.on('console', (m) => { if (m.type() !== 'error') return; (/CORS policy|net::ERR_FAILED|ERR_CONNECTION_RESET|ERR_HTTP2_SERVER_REFUSED_STREAM|ERR_NO_BUFFER_SPACE/.test(m.text()) ? ext : errs).push(m.text()); });
  page.on('pageerror', (e) => errs.push('pageerror ' + e.message));
  return { errs, ext };
}
const LOG = 'shots/f2/D/logs/e2e-boot-timing.json';
const put = (k, v) => { let d = {}; try { d = JSON.parse(fs.readFileSync(LOG, 'utf8')); } catch { /* */ } d[k] = v; fs.mkdirSync('shots/f2/D/logs', { recursive: true }); fs.writeFileSync(LOG, JSON.stringify(d, null, 1)); };

test.describe('F2-D boot timing · click path', () => {
  test.setTimeout(180000);

  test('남원 진입(빈 캐시) — ready → 후퇴 ≤ 5 s · 칩은 후퇴 전까지만 · 히어로·목록은 z ≤ 3 뒤 · 후퇴 첫 1 s 흰 화면 0', async ({ page }) => {
    const { errs, ext } = watch(page);
    await boot(page, '/landxi/global/index.html?tenant=lx&locale=en&from=namwon');
    const ready = await page.evaluate(() => window.__f2dReady);
    await page.evaluate(() => window.__f1d.go('globe', { force: true }));   // 사용자가 준비 즉시 누른 것과 같다(go 는 후퇴 경로 받기를 기다린다)
    await page.waitForTimeout(400);
    const r = await page.evaluate(() => ({ fl: window.__f2dFlights[0], warm: window.__f1dWarm, hero: window.__f2dHero, pfv: window.__pfv, zt: window.__zt }));
    const toRetreat = r.fl.t - ready;
    expect(toRetreat, 'ready → retreat').toBeLessThanOrEqual(5000);
    const pfOn = r.pfv.filter((x) => x[1]);
    expect(pfOn.length).toBeGreaterThan(0);   // 대기가 있으면 칩으로 보인다
    expect(pfOn[pfOn.length - 1][0]).toBeLessThanOrEqual(r.fl.t + 50);   // 칩은 후퇴 시작 전까지만
    expect(r.pfv.filter((x) => x[0] > r.fl.t + 100 && x[1]).length).toBe(0);
    // 히어로는 z ≤ 3 에서만 보이기 시작(그 전 'retreat' 장면 · opacity 0)
    expect(r.hero[0].z).toBeLessThanOrEqual(3.05);
    // 판정 2차: z 3 에서도 원판(≈ 2,000 px)이 H1·목록 뒤로 비쳤다 → 원판 bbox 가 히어로 열(x ≤ 440)·목록 열(x ≥ 1068)과 겹치지 않을 때만
    expect(r.hero[0].disc[0], 'globe disc clear of hero column').toBeGreaterThanOrEqual(440);
    expect(r.hero[0].disc[1], 'globe disc clear of list column').toBeLessThanOrEqual(1068);
    const early = r.zt.filter((x) => x[0] > r.fl.t && x[1] > 3.2);
    expect(early.every((x) => x[2] !== 'globe')).toBe(true);
    expect(early.every((x) => +x[3] < 0.05)).toBe(true);
    put('namwon', { ready_ms: ready, ready_to_retreat_ms: toRetreat, warm: r.warm, pf_chip_ms: Math.round(pfOn[pfOn.length - 1][0] - pfOn[0][0]), hero: r.hero[0], external_cors: ext.length });
    expect(errs).toEqual([]);
  });

  test('클릭 경로(첫 방문 · 빈 캐시) — 착지 → 카드 ≤ 500 · 으슥아타 ≤ 3 s · 메이크틸라 ≤ 3.5 s · 경유점 정지 ≤ 500', async ({ page }) => {
    const { errs } = watch(page);
    await boot(page, '/landxi/global/index.html?tenant=lx&locale=en');
    await page.click('.gs-row[data-open="ysykata"]');
    await page.waitForFunction(() => (window.__f2dClicks || []).some((c) => c.scene === 'ysykata' && c.card != null), null, { timeout: 15000 });
    await page.waitForTimeout(600);
    await page.click('#scenes button[data-scene="globe"]');
    await page.waitForFunction(() => window.__f1d.state().scene === 'globe' && (window.__f2dClicks || []).filter((c) => c.scene === 'globe' && c.card != null).length === 1, null, { timeout: 15000 });
    await page.click('#scenes button[data-scene="meiktila"]');
    await page.waitForFunction(() => (window.__f2dClicks || []).some((c) => c.scene === 'meiktila' && c.card != null), null, { timeout: 15000 });
    await page.waitForTimeout(600);
    await page.click('#scenes button[data-scene="sokuluk"]');
    await page.waitForFunction(() => (window.__f2dClicks || []).some((c) => c.scene === 'sokuluk' && c.card != null), null, { timeout: 20000 });
    await page.waitForTimeout(600);
    await page.click('#scenes button[data-scene="meiktila"]');
    await page.waitForFunction(() => (window.__f2dClicks || []).filter((c) => c.scene === 'meiktila' && c.card != null).length === 2, null, { timeout: 20000 });
    const c = await page.evaluate(() => ({ clicks: window.__f2dClicks, transit: window.__f1dTransit, cardVisible: !document.getElementById('card').hidden }));
    const ys = c.clicks.find((x) => x.scene === 'ysykata'), mk = c.clicks.find((x) => x.scene === 'meiktila' && x.from === 'globe'), mk2 = c.clicks.find((x) => x.scene === 'meiktila' && x.from === 'sokuluk');
    for (const x of c.clicks.filter((x) => x.scene !== 'globe')) expect(x.land_to_card, x.scene).toBeLessThanOrEqual(500);
    expect(ys.card).toBeLessThanOrEqual(3000);
    expect(mk.card).toBeLessThanOrEqual(3500);
    expect(c.transit.find((x) => x.via === 'transit').hold_ms).toBeLessThanOrEqual(500);
    expect(c.cardVisible).toBe(true);
    put('first_visit', c.clicks.map(({ scene, from, card, land, land_to_card, hold }) => ({ scene, from, click_to_card_ms: card, land_ms: land, land_to_card_ms: land_to_card, hold_ms: hold ?? null })));
    put('transit', c.transit);
    expect(errs).toEqual([]);
  });

  test('재방문(같은 HTTP 캐시 · 새 문서 · 사용자 페이스) — 착지 화면만 보고 1.5 s 뒤 떠나도 revisit · hold 0 · PF 칩 0 · EOX 네트워크 0(CDP · 착지+경로+배경) · 클릭 → 카드 = 비행 + ≤ 200', async ({ page, context }) => {
    const { errs } = watch(page);
    await boot(page, '/landxi/global/index.html?tenant=lx&locale=en');
    // 첫 방문 — 판정 2차 재현: 메이크틸라를 1.5 s 보고 떠난다(경로 전체를 다 받기 전) · 으슥아타도 같게
    for (const s of ['meiktila', 'globe', 'ysykata', 'globe']) { await page.evaluate((s) => window.__f1d.go(s, { force: true }), s); if (s !== 'globe') await page.waitForTimeout(1500); }
    // 글로브에 머무는 동안 배경 다리(prio 2)가 두 하강 경로를 마저 받는다 — 그 끝을 기다린다(실측 시간은 로그)
    const bg = await page.waitForFunction(() => { const n = window.__f2dNext || []; return ['ys', 'mk'].every((k) => n.some((x) => x.leg === k)) && n; }, null, { timeout: 90000, polling: 250 }).then((h) => h.jsonValue()).catch(() => null);
    put('revisit_first_visit_bg', bg && bg.map(({ leg, after, land, path, ok, ms }) => ({ leg, after, tiles: land + path, ok, ms })));
    await page.waitForTimeout(500);
    const marks = await page.evaluate(() => JSON.parse(localStorage.getItem('lx_f2d_pf') || '{}'));
    expect(Object.keys(marks).sort(), 'revisit marks = landing screen received').toEqual(['meiktila', 'ysykata']);
    // 재방문 — 같은 컨텍스트(HTTP 캐시 유지) · 새 문서
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    const eox = { net: [], cache: 0 };
    cdp.on('Network.responseReceived', (e) => { if (/tiles\.maps\.eox\.at/.test(e.response.url)) { if (e.response.fromDiskCache || e.response.fromMemoryCache || e.response.fromPrefetchCache) eox.cache++; else eox.net.push(e.response.url); } });
    await page.reload();
    await page.waitForFunction(() => document.documentElement.dataset.lx === 'ready', null, { timeout: 30000 });
    await page.waitForTimeout(800);
    for (const s of ['meiktila', 'globe', 'ysykata']) await page.evaluate((s) => window.__f1d.go(s, { force: true }), s);
    await page.waitForTimeout(3000);
    const r = await page.evaluate(() => {
      const F = window.__f1d, m = F.stage.map, T = F.tools, R = F.cams.region;
      const land = (c) => T.tilesFor(m, T.flySamples(m, { ...c, padding: R }, { n: 1, from: { ...c, padding: R } }).slice(-1), ['eox-s2cloudless-2025']);
      return { clicks: window.__f2dClicks, transit: window.__f1dTransit, pfv: window.__pfv.filter((x) => x[1]).length, dc: window.__dcStat,
        landTiles: [...land({ center: [95.884, 20.892], zoom: 13.9, pitch: 0, bearing: 0 }), ...land(F.scenes.ys.cam || { center: [74.93, 42.86], zoom: 9.55, pitch: 0, bearing: 0 })] };
    });
    const onScreen = eox.net.filter((u) => r.landTiles.includes(u));
    // 판정 3차: 결과 문서가 '화면 밖 경로 71건'이라 적었는데 CDP 실측 342건 — 정의를 '착지 화면 + 하강 경로 전체'로 넓혀 총 건수도 기록·단언.
    // 모든 하강이 같은 출발 카메라(글로브 = 경유점)이고 착지 뒤 다음 다리 배경 받기가 경로를 마저 받으므로 재방문 총 EOX 네트워크 = 0.
    put('revisit', { clicks: r.clicks.map(({ scene, from, card, revisit, land_to_card, hold }) => ({ scene, from, click_to_card_ms: card, revisit, land_to_card_ms: land_to_card, hold_ms: hold ?? null })), pf_chip_frames: r.pfv, dc: r.dc, eox_network: eox.net.length, eox_network_landing_screen: onScreen.length, eox_from_cache: eox.cache, eox_net_sample: eox.net.slice(0, 5) });
    expect(r.pfv, 'PF chip on revisit').toBe(0);
    expect(onScreen, 'EOX re-request of landing-screen tiles').toEqual([]);
    // 지도 fetch 시도(dc.map_net)는 줌이 지나가며 거둔(abort) 요청까지 센다 — 판정 기준은 CDP 가 본 실제 네트워크 응답(아래 · 0)
    expect(eox.net.length, `EOX network requests on revisit (landing + path + background legs) · sample ${eox.net.slice(0, 3).join(' ')}`).toBe(0);
    // 재방문 = 비행 + 첫 프레임(hold 0): 으슥아타 2400 + 200 · 메이크틸라 3200(--e-fly Δz ≥ 10 · 판정 3차 곡률 ≥ 1 s) + 200
    for (const x of r.clicks.filter((x) => x.scene !== 'globe')) { expect(x.revisit).toBe(true); expect(x.card, x.scene).toBeLessThanOrEqual((x.scene === 'meiktila' ? 3200 : 2400) + 200); }
    const mk = r.clicks.find((x) => x.scene === 'meiktila');
    expect(mk.hold, 'revisit hold').toBeLessThanOrEqual(20);
    expect(errs).toEqual([]);
  });
});
