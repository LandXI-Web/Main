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
const st = (page) => page.evaluate(() => window.__spike.state());
const arrived = (page, timeout = 8000) => page.waitForFunction(() => window.__spike?.state().arrived, null, { timeout });
const ready = (page) => page.waitForFunction(() => window.__spike?.state().ready, null, { timeout: 10000 });
const idle = (page) => page.waitForFunction(() => window.__spike?.state().idle, null, { timeout: 10000 });
/** 제출용 정지 화면 — 타일 적재 + CSS 애니메이션 종료 + 타일 페이드(raster-fade-duration 500) 한 번 더 */
const settle = async (page) => {
  await idle(page);
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'), null, { timeout: 5000 });
  await page.waitForTimeout(550);
  await idle(page);
};
/** HUD 큰 숫자 · 해설 줄에서 도는 애니메이션 수 */
const hudAnims = (page) => page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running' && a.effect?.target?.closest?.('#hud-big,#hud-note')).length);
/** 연속 두 장이 다른 쌍의 수 */
const diffPairs = (bufs) => bufs.slice(1).filter((b, i) => !b.equals(bufs[i])).length;
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/\s.*$/gm, '');

/* ══ 1. S1 도착 ═════════════════════════════════════════════════════════ */
test.describe('S1 도착', () => {
  test('자동 재생 — frame → 스윕 → 락온 → 숫자, 8s 안 arrived · phase 순서', async ({ page }) => {
    const errs = watch(page);
    await page.addInitScript(() => {
      window.__phaseLog = [];
      new MutationObserver((rs) => { for (const r of rs) window.__phaseLog.push(r.target.getAttribute('data-phase')); })
        .observe(document, { attributes: true, subtree: true, attributeFilter: ['data-phase'] });
    });
    await page.goto(PAGE);
    await expect(page).toHaveTitle('XI맵 시그니처 — 스파이크 · 제품 아님');
    await expect(page.locator('#spk-band')).toContainText('스파이크 · 제품 아님 · 실데이터: 남원 농지이용 2025(2,098 필지) · LX 정사영상 4시점');
    await page.waitForFunction(() => window.__spike?.state().started);
    // t=0 결과 0 · 큰 숫자 자리 '—'
    await expect(page.locator('#hud-big')).toHaveText('—');
    await expect(page.locator('#hud-status')).toHaveText('판독 결과 도착 중');
    // 스윕 중 — 보이는 필지는 모두 선 뒤쪽(지나간 자리)에만
    await page.waitForFunction(() => window.__spike.state().phase === 'sweep' && window.__spike.audit().shown > 50, null, { timeout: 8000 });
    const mid = await page.evaluate(() => window.__spike.audit());
    expect(mid.ahead).toBe(0);
    expect(mid.hidden).toBeGreaterThan(0);
    // 현상 중인 CSS 애니메이션의 지속·이징이 법전 안
    await page.waitForFunction(() => window.__spike.state().phase === 'count', null, { timeout: 8000 });
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
    expect(await page.evaluate(() => window.__phaseLog)).toEqual(['sweep', 'lock', 'count', 'arrived']);
    expect(await page.evaluate(() => document.documentElement.dataset.phase)).toBe('arrived');
    const s = await st(page);
    expect(s.locks).toBe(3);                                             // 자동 락온 3곳
    expect((await page.evaluate(() => window.__spike.audit())).hidden).toBe(0);
    await page.screenshot({ path: `${OUT}/01-s1-arrived-1440.png` });
    expect(errs).toEqual([]);
  });

  test('모션 프레임 12장(100ms) — 연속 상이 쌍 ≥ 8', async ({ page }) => {
    const errs = watch(page);
    await page.goto(PAGE);
    await page.waitForFunction(() => window.__spike?.state().started);
    const bufs = [];
    for (let i = 0; i < 12; i++) {
      const b = await page.screenshot({ path: `${OUT}/s1-frame-${String(i).padStart(2, '0')}.png` });
      bufs.push(b);
      // S1 에는 결손 안내가 없다(브리프 S3 §5 — S3 · S6 에서 범위를 벗어났을 때만) · 띠는 조용히(눈금만)
      await expect(page.locator('#spk-void')).toBeHidden();
      await expect(page.locator('#spk-play')).toBeHidden();
      expect(await page.locator('#spk-scrub').getAttribute('data-quiet')).toBe('1');
      await page.waitForTimeout(100);
    }
    const n = diffPairs(bufs);
    console.log(`s1 frames: 연속 상이 쌍 ${n}/11`);
    expect(n).toBeGreaterThanOrEqual(8);
    expect(errs).toEqual([]);
  });

  test('필지 클릭 락온 — 브래킷 180 → 앰버 80 → 청록 120 = 380±20', async ({ page }) => {
    const errs = watch(page);
    await page.goto(PAGE);
    await arrived(page);
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
    // 타임스탬프로도 — 시작 → 청록 정착 끝
    await expect(lock).toHaveAttribute('data-lock-end', /\d+/);
    const dt = await lock.evaluate((el) => +el.dataset.lockEnd - +el.dataset.lockAt);
    console.log('lock timestamps Δ', dt);
    expect(dt).toBeGreaterThanOrEqual(360);
    expect(dt).toBeLessThanOrEqual(440);
    // 정착 뒤 색 = 청록(앰버는 80ms 뿐)
    expect(await lock.evaluate((el) => getComputedStyle(el).color)).toBe('rgb(15, 169, 160)');
    await expect(lock.locator('.spk-flag')).toContainText('신뢰도');
    expect(errs).toEqual([]);
  });

  test('다시 보기 — 결과 0 에서 다시 도착', async ({ page }) => {
    await page.goto(PAGE);
    await arrived(page);
    await page.click('#spk-replay');
    await page.waitForFunction(() => !window.__spike.state().arrived);
    await expect(page.locator('#hud-big')).toHaveText('—');
    await arrived(page);
    await expect(page.locator('#hud-big')).toHaveAttribute('aria-label', '2,098');
  });
});

/* ══ 2. S3 시점 스크럽 ═══════════════════════════════════════════════════ */
test.describe('S3 시점 스크럽', () => {
  test('소수 시점 · 두 층 0.5/0.5 · URL · 키보드 · 재생 · 자동 정지 750 · 범위 밖', async ({ page }) => {
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

    // 재생 1개 — 2s 뒤 시점이 나아가고, 정수 시점마다 750ms 멈춘다
    await page.evaluate(() => window.__spike.setEpoch(0));
    await page.click('#spk-play');
    await expect(page.locator('#spk-play')).toHaveAttribute('aria-pressed', 'true');
    expect((await st(page)).cycle).toBe(6000);
    // 재생 중 HUD 큰 숫자 · 해설 줄은 제자리 교체 — 2s 동안 텍스트 인 0(움직이는 것은 크로스페이드 + 정수 정지의 변화 지수 한 줄)
    let hudMoving = 0;
    for (let i = 0; i < 20; i++) { hudMoving += await hudAnims(page); await page.waitForTimeout(100); }
    expect(hudMoving).toBe(0);
    expect((await st(page)).epoch).toBeGreaterThan(0);
    await page.waitForFunction(() => window.__spike.state().stops.length >= 2, null, { timeout: 6000 });
    const s = await st(page);
    for (const stop of s.stops) expect(Math.abs(stop.ms - 750), `stop ${JSON.stringify(stop)}`).toBeLessThanOrEqual(40);
    const perf = await page.evaluate(() => window.__spike.perf());
    console.log('S3 재생 perf', JSON.stringify(perf));
    expect(perf.p95).toBeLessThanOrEqual(20);
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

  test('다이브 스트립 — S1 → S3 하강 12장(100ms) · 결손 안내 0 · 틀 밖 결과 걷힘', async ({ page }) => {
    const errs = watch(page);
    await page.goto(PAGE);
    await arrived(page);
    await idle(page);
    await page.evaluate(() => { window.__spike.play('s3'); });
    // 하강 1000ms + 타일 페이드 500 — 캡처 자체가 느리므로(PNG ≈ 150ms) JPEG 으로 간격을 100ms 에 가깝게 둔다
    const bufs = [], ts = [];
    const t0 = Date.now();
    for (let i = 0; i < 12; i++) {
      bufs.push(await page.screenshot({ path: `${OUT}/dive-frame-${String(i).padStart(2, '0')}.jpg`, type: 'jpeg', quality: 80 }));
      ts.push(Date.now() - t0);
      expect(await page.locator('#spk-void').isHidden()).toBe(true);
      await page.waitForTimeout(40);
    }
    console.log('dive frame t(ms)', ts.join(' '));
    const n = diffPairs(bufs);
    console.log(`dive frames: 연속 상이 쌍 ${n}/11`);
    expect(n).toBeGreaterThanOrEqual(8);
    await ready(page);
    const z = await page.evaluate(() => window.__spike.map.getZoom());
    expect(z).toBeGreaterThan(14.5);
    // 도시 바탕은 이 줌에서 걷혀 있고(layer maxzoom), 정사영상 범위 틀이 있다
    const probe = await page.evaluate(() => {
      const m = window.__spike.map;
      return { city: m.getLayer('city').maxzoom, ob: !!m.getLayer('spk-ob') };
    });
    expect(probe.city).toBeLessThanOrEqual(z);
    expect(probe.ob).toBe(true);
    await expect(page.locator('#spk-void')).toBeHidden();
    await expect(page.locator('#spk-range')).toBeEnabled();
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
    await page.waitForTimeout(400);
    expect(await seg.evaluate((el) => getComputedStyle(el).transform)).toBe('matrix(1, 0, 0, 1, 0, -4)');
  });

  test('제품 화면에서 스파이크로 오는 링크 0', () => {
    const hits = [];
    const walk = (d) => {
      for (const f of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, f.name);
        if (f.isDirectory()) { if (!/spikes|vendor|assets|node_modules/.test(f.name)) walk(p); continue; }
        if (/\.(html|js|mjs)$/.test(f.name) && fs.readFileSync(p, 'utf8').includes('ximap-signature')) hits.push(p);
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
      if (w !== 1920) {
        await idle(page);
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
    await page.click('#spk-seg button[data-scene="s3"]');
    await ready(page);
    await page.evaluate(() => window.__spike.setEpoch(0));
    await page.click('#spk-play');
    await page.waitForTimeout(2600);
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
    await v.saveAs(`${OUT}/signature.webm`);
    await ctx.close();
    expect(fs.statSync(`${OUT}/signature.webm`).size).toBeGreaterThan(50000);
    expect(errs).toEqual([]);
  });
});
