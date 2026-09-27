// F1-D · 선명한 하강(1차 판정 최우선) — 판정 투어 전체(남원→글로브→으슥아타→소쿨룩→메이크틸라)를 돌리며 100 ms 마다
// tileDeficit(화면 표본점의 맨 위 불투명 래스터 타일 줌이 이상 줌보다 몇 단계 낮은가 · 99 = 흰 화면)을 잰다.
// 기준: deficit ≥ 2 가 500 ms 넘게 이어지는 구간 0 · 콘솔 오류 0 · 빈 캐시(첫 방문)에서.
// F2-D 2차(판정 재현): 투어의 데우기 대기 없이 — 남원 → 준비 즉시 후퇴 → 글로브 착지 직후 으슥아타 클릭(판정 실측 1,596 / 1,701 ms worst 5).
import { test, expect } from '@playwright/test';

const EXT = /CORS policy|net::ERR_FAILED|ERR_CONNECTION_RESET|ERR_HTTP2_SERVER_REFUSED_STREAM|ERR_NO_BUFFER_SPACE/;
function runsOf(td) {
  const runs = []; let cur = null;
  for (const s of td) { if (s.max >= 2) { cur ||= { t0: s.t, t1: s.t, scene: s.scene, worst: 0 }; cur.t1 = s.t; cur.worst = Math.max(cur.worst, s.max); } else if (cur) { runs.push(cur); cur = null; } }
  if (cur) runs.push(cur);
  return runs;
}

test('판정 재현 — 남원 → 후퇴 → 글로브 착지 직후 으슥아타 클릭(투어 대기 0) · 부족 ≥ 2 > 500 ms 구간 0(빈 캐시)', async ({ page }) => {
  test.setTimeout(120000);
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error' && !EXT.test(m.text())) errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push('pageerror ' + e.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => { localStorage.setItem('lx_api_mode', 'off'); localStorage.setItem('lx_logged_in', '1'); localStorage.setItem('lx_role', 'staff'); });
  await page.goto('/landxi/global/index.html?tenant=lx&locale=en&from=namwon');
  await page.waitForFunction(() => document.documentElement.dataset.lx === 'ready', null, { timeout: 60000 });
  await page.evaluate(() => { window.__td = []; setInterval(() => { const R = document.getElementById('root').dataset; const cover = R.bcover === '1'; const a = cover ? window.__f1d.tileDeficitB() : window.__f1d.tileDeficit(); window.__td.push({ t: performance.now(), max: a.max, scene: R.scene }); }, 100); });
  await page.evaluate(() => window.__f1d.go('globe', { force: true }));   // 준비 즉시 후퇴 → 착지까지
  await page.click('.gs-row[data-open="ysykata"]');                       // 착지 직후(대기 0)
  await page.waitForFunction(() => (window.__f2dClicks || []).some((c) => c.scene === 'ysykata' && c.card != null), null, { timeout: 20000 });
  await page.waitForTimeout(2500);
  const td = await page.evaluate(() => window.__td);
  const runs = runsOf(td);
  const long = runs.filter((r) => r.t1 - r.t0 + 100 > 500).map((r) => `${r.scene} ${Math.round(r.t1 - r.t0 + 100)} ms worst ${r.worst}`);
  console.log('judge-path samples', td.length, 'runs', JSON.stringify(runs.map((r) => [r.scene, Math.round(r.t1 - r.t0 + 100), r.worst])));
  expect(td.length).toBeGreaterThan(50);
  expect(long).toEqual([]);
  expect(errs).toEqual([]);
});

// F2-D 3차(판정 불합격 · 사용자 페이스 하강 뭉개짐): 투어가 아닌 실사용 — 첫 방문 · 빈 캐시 · 장면에 머문 시간만큼만 다음 하강 다리를 배경(prio 2)으로 받는다.
// 판정 재현 ① off 으슥아타 8 s 체류 → 메이크틸라에 300 ms 손 올림 → 클릭(판정 601 ms worst 5 + 902 ms worst 4)
//          ② 으슥아타 → 소쿨룩 5 s → 메이크틸라(판정 on 1,390 ms worst 4) — 각 하강·착지 뒤 2.5 s 에서 부족 ≥ 2 > 500 ms 구간 0.
for (const [name, path] of [['Ysyk-Ata 8 s → hover 300 ms → Meiktila', [['ysykata', 8000, true], ['meiktila', 0]]], ['Ysyk-Ata 4 s → Sokuluk 5 s → Meiktila', [['ysykata', 4000], ['sokuluk', 5000], ['meiktila', 0]]]]) {
  test(`사용자 페이스(비투어 · 빈 캐시) — ${name} · 부족 ≥ 2 > 500 ms 구간 0`, async ({ page }) => {
    test.setTimeout(150000);
    const errs = [];
    page.on('console', (m) => { if (m.type() === 'error' && !EXT.test(m.text())) errs.push(m.text()); });
    page.on('pageerror', (e) => errs.push('pageerror ' + e.message));
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript(() => { if (sessionStorage.getItem('b')) return; sessionStorage.setItem('b', 1); localStorage.setItem('lx_api_mode', 'off'); localStorage.setItem('lx_logged_in', '1'); localStorage.setItem('lx_role', 'staff'); localStorage.removeItem('lx_f2d_pf'); });
    await page.goto('/landxi/global/index.html?tenant=lx&locale=en');
    await page.waitForFunction(() => document.documentElement.dataset.lx === 'ready', null, { timeout: 60000 });
    await page.evaluate(() => { window.__td = []; setInterval(() => { const a = window.__f1d.tileDeficit(); window.__td.push({ t: performance.now(), max: a.max, scene: document.getElementById('root').dataset.scene }); }, 100); });
    await page.waitForTimeout(2000);
    const done = (s) => page.waitForFunction((s) => { const c = window.__f2dClicks || []; const l = c[c.length - 1]; return l && l.scene === s && l.card != null; }, s, { timeout: 40000 });
    await page.click('.gs-row[data-open="ysykata"]'); await done('ysykata');
    for (const [s, stay, hover] of path) {
      if (s !== 'ysykata') { await page.click(`#scenes button[data-scene="${s}"]`); await done(s); }
      if (stay) await page.waitForTimeout(stay - (hover ? 300 : 0));
      if (hover) { await page.hover('#scenes button[data-scene="meiktila"]'); await page.waitForTimeout(300); }
    }
    await page.waitForTimeout(2500);
    const r = await page.evaluate(() => ({ td: window.__td, next: window.__f2dNext }));
    const runs = runsOf(r.td);
    const long = runs.filter((x) => x.t1 - x.t0 + 100 > 500).map((x) => `${x.scene} ${Math.round(x.t1 - x.t0 + 100)} ms worst ${x.worst}`);
    console.log('user-pace', name, 'runs', JSON.stringify(runs.map((x) => [x.scene, Math.round(x.t1 - x.t0 + 100), x.worst])), 'next', JSON.stringify((r.next || []).map((x) => [x.leg, x.after, x.land + x.path, x.ok, x.ms])));
    expect(r.td.length).toBeGreaterThan(100);
    expect(long).toEqual([]);
    expect(errs).toEqual([]);
  });
}

test('판정 투어 전체 — 하강·전환 중 2단계 이상 낮은 타일이 500 ms 넘게 보이는 구간 0(빈 캐시)', async ({ page }) => {
  test.setTimeout(240000);
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error' && !EXT.test(m.text())) errs.push(m.text()); });   // F2-D: 외부 타일 원천(EOX · PC · GIBS) CORS 간헐 거절은 별도 분류(F1-D 요청 4)
  page.on('pageerror', (e) => errs.push('pageerror ' + e.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => { localStorage.setItem('lx_api_mode', 'off'); localStorage.setItem('lx_logged_in', '1'); localStorage.setItem('lx_role', 'staff'); });
  await page.goto('/landxi/global/index.html?tenant=lx&locale=en&from=namwon&tour=1');
  await page.waitForFunction(() => window.__f1d && window.__f1dTour, null, { timeout: 90000 });
  await page.evaluate(() => { window.__td = []; setInterval(() => { const R = document.getElementById('root').dataset; const cover = R.bcover === '1'; const a = cover ? window.__f1d.tileDeficitB() : window.__f1d.tileDeficit(); const b = R.swipe && !cover ? window.__f1d.tileDeficitB() : null; window.__td.push({ t: performance.now(), max: Math.max(a.max, b ? b.max : 0), scene: document.getElementById('root').dataset.scene }); }, 100); });
  await page.waitForFunction(() => window.__f1dTour === 'done', null, { timeout: 200000, polling: 500 });
  const td = await page.evaluate(() => window.__td);
  const runs = runsOf(td);
  const long = runs.filter((r) => r.t1 - r.t0 + 100 > 500).map((r) => `${r.scene} ${Math.round(r.t1 - r.t0 + 100)} ms worst ${r.worst}`);
  console.log('samples', td.length, 'runs', runs.length, 'long', JSON.stringify(long));
  expect(td.length).toBeGreaterThan(300);
  expect(long).toEqual([]);
  expect(errs).toEqual([]);
});
