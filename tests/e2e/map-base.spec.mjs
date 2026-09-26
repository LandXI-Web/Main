import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { installFullMeter, summarize } from './_white-meter.mjs';

/* p0926 map-base — XI맵 시그니처(스파이크) 바탕 사다리 · 흰 바탕 제거 증명.
 *   · 바탕 = V-World 위성(키 WMTS · 없으면 키 없는 xdworld) → LX 남원 2 m → 드론 1–2 cm
 *   · 하강(S1 sweep · dive · lock) 동안 그려진 **모든 프레임**, **화면 전체**(판 제외)에서 흰(>235) + 빈(배경색) 비율 ≤ 5 %
 *     (이전 계측기는 '원천이 덮는 자리 안'만 셌다 — 이 계측기는 원천 밖도 센다. 작업 전 z12–14 에서 50–75 %)
 *   · LX 영상 가장자리 페더링(원천 경계에서 알파 0 → 안쪽 FEATHER px 에서 1)
 *   · 폐쇄망(V-World 차단) = 예전 로컬 폴백으로 서고 띠에 그렇게 적는다
 *   · 게스트 메인(필름 인계 판)은 자체 고해상 원본 없이 V-World + 결과 벡터만
 * 계측 결과는 shots/p0926/map-base/white-*.json 에 남는다.
 */
const PAGE = 'proto/spikes/ximap-signature.html';
const OUT = 'shots/p0926/map-base';
const NETWORK = /net::ERR_ABORTED|ERR_ABORTED|ERR_FAILED|Failed to load resource.*(vworld|xdworld)|Failed to load resource: net::ERR|AbortError/i;
fs.mkdirSync(OUT, { recursive: true });

function watch(page) {
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !NETWORK.test(m.text())) errs.push('console: ' + m.text()); });
  return errs;
}

async function descend(page) {
  await page.addInitScript(() => { window.__spikeHold = 'sweep'; });
  await page.goto(PAGE);
  await page.waitForFunction(() => window.__spike?.state().hold === 'sweep', null, { timeout: 30000 });
  await installFullMeter(page, ['sweep', 'dive', 'lock']);
  await page.evaluate(() => { window.__spikeHold = ''; window.__spike.release(); });
  await page.waitForFunction(() => window.__spike?.state().arrived, null, { timeout: 30000 });
  return summarize(await page.evaluate(() => window.__whiteAll));
}

for (const [w, h] of [[1440, 900], [390, 844]]) {
  test(`하강 흰 비율 ≤ 5 % — 전 화면 · 모든 프레임 · ${w}×${h}`, async ({ page }) => {
    test.setTimeout(90000);
    const errs = watch(page);
    await page.setViewportSize({ width: w, height: h });
    const s = await descend(page);
    const base = await page.evaluate(() => window.__spike.base());
    const warm = await page.evaluate(() => window.__spike.tiles().warm);
    fs.writeFileSync(`${OUT}/white-after-${w}.json`, JSON.stringify({ viewport: `${w}x${h}`, base, warm, ...s }, null, 1));
    console.log(`${w}×${h} 바탕 ${base.via} · 프레임 ${s.frames} · 최대 흰+빈 ${(s.gapMaxAll * 100).toFixed(2)} % · ` + s.bands.map((b) => `${b.band} ${b.n ? (b.gapMax * 100).toFixed(2) + '%' : '-'}`).join(' · '));
    expect(['keyed', 'free']).toContain(base.via);
    expect(s.frames).toBeGreaterThanOrEqual(20);
    for (const b of s.bands.filter((x) => /z1[234]–/.test(x.band))) expect(b.n, `${b.band} 프레임`).toBeGreaterThan(0);
    expect(s.gapMaxAll, '흰 + 빈 최대').toBeLessThanOrEqual(0.05);
    expect(errs).toEqual([]);
  });
}

test('바탕 사다리 — V-World(아래) → 도시 2 m → 드론 · 띠에 출처 표기', async ({ page }) => {
  const errs = watch(page);
  await page.goto(PAGE);
  await page.waitForFunction(() => window.__spike?.state().arrived, null, { timeout: 30000 });
  const r = await page.evaluate(() => {
    const m = window.__spike.map, ids = m.getStyle().layers.map((l) => l.id);
    return { ids, vw: ids.indexOf('vw'), city: ids.indexOf('city'), ep0: ids.indexOf('ep0'), bSat: m.getLayoutProperty('b-sat', 'visibility'),
      cityOp: JSON.stringify(m.getPaintProperty('city', 'raster-opacity')), tiles: m.getSource('vw')?.tiles?.[0] || '', bg: m.getPaintProperty('bg', 'background-color') };
  });
  expect(r.vw).toBeGreaterThan(-1);
  expect(r.vw).toBeLessThan(r.city);
  expect(r.city).toBeLessThan(r.ep0);
  expect(r.bSat).toBe('none');                                   // createMap 의 바탕은 끄고 spkv:// 층 하나만
  expect(r.tiles).toMatch(/^spkv:\/\/https:\/\/(api|xdworld)\.vworld\.kr\//);
  expect(r.cityOp).toContain('interpolate');                     // 도시 2 m 는 z16 → 17.2 에서 V-World 에 넘긴다
  await expect(page.locator('#spk-band-base')).toHaveText(/V-World 위성/);
  expect(await page.evaluate(() => document.documentElement.dataset.base)).toMatch(/^(keyed|free)$/);
  expect(errs).toEqual([]);
});

test('가장자리 페더링 — 원천 경계에서 알파가 계단이 아니라 경사로 풀린다', async ({ page }) => {
  await page.goto(PAGE);
  await page.waitForFunction(() => window.__spike?.map, null, { timeout: 30000 });
  // 도시 2 m 원천이 타일 안에서 끝나는 자리(수평 경계) — 열 77 을 위 → 아래로
  const r = await page.evaluate(() => window.__spike.featherProbe('assets/tiles/namwon_city_2510/15/27976/12920.webp', 77));
  const mid = (a) => a.filter((v) => v > 12 && v < 240).length;
  console.log(`페더 전 중간값 ${mid(r.raw)} px · 후 ${mid(r.out)} px`);
  expect(mid(r.raw)).toBeLessThanOrEqual(2);                     // 원천은 칼 경계
  expect(mid(r.out)).toBeGreaterThanOrEqual(14);                 // 페더 후 경사(≥ 14 px)
  // 안쪽 깊은 곳은 그대로(원천 불투명 유지)
  expect(r.out.slice(0, 120).every((v) => v >= 248)).toBe(true);
});

test('폐쇄망 — V-World 가 막히면 로컬 폴백으로 서고 띠에 정직하게 적는다', async ({ page }) => {
  test.setTimeout(60000);
  const errs = watch(page);
  await page.route(/vworld\.kr/, (route) => route.abort('internetdisconnected'));
  await page.goto(PAGE);
  await page.waitForFunction(() => window.__spike?.state().arrived, null, { timeout: 40000 });
  await expect(page.locator('#spk-band-base')).toHaveText(/외부 위성 연결 없음 · 로컬 폴백/);
  expect(await page.evaluate(() => document.documentElement.dataset.base)).toBe('offline');
  expect(await page.evaluate(() => !!window.__spike.map.getLayer('vw'))).toBe(false);
  await page.screenshot({ path: `${OUT}/offline-fallback-1440.png` });
  expect(errs).toEqual([]);
});

test('게스트 메인 필름 인계 판 — 자체 고해상 원본 0 · V-World + 결과 벡터만(소스 확인)', () => {
  const src = fs.readFileSync('landxi/proto/scrub/scrub.js', 'utf8');
  const sat = /function satStyle[\s\S]*?\n}\n/.exec(src)[0];
  expect(sat).toMatch(/xdworld\.vworld\.kr\/2d\/Satellite/);
  expect(sat).not.toMatch(/assets\/tiles|namwon_|kuksan_|jeju_/);
  const plates = /function makePlate[\s\S]*?\n}\n/.exec(src)[0];
  expect(plates).not.toMatch(/assets\/tiles/);
});
