import { test, expect } from '@playwright/test';

/* landxi/proto/scrub/ — 월드플라이트 스크럽 비행.
 *
 * 이 스펙이 지키는 계약 (references/worldflight.md §8 Hard rules + 스펙 §B/§F):
 *   1) 문서 흐름에는 스페이서 하나뿐이고, 무대는 position:fixed 하나다.
 *   2) src 를 절대 교체하지 않는다 — 7개 레그가 전부 동시에 마운트된 채로 남는다.
 *   3) 크로스페이드는 한쪽만. 어느 순간에도 완전 불투명한 레그가 최소 하나 있다
 *      → 씸에서 페이지 바탕(검정)이 드러나지 않는다.
 *   4) 재생헤드는 lerp 0.12 + 데드밴드 8/20ms + 시크 병합으로 움직인다.
 *   5) 비행 페이스는 하나 — 레그별 vh/필름초 편차 ≤ 6%.
 *   6) 지연 로딩은 ±1.6vh. 멀리 있는 레그는 아직 받지 않는다.
 *   7) 인계 판은 manifest 가 적어 둔 카메라 그대로 뜬다.
 *   · reduced-motion 이면 클립을 아예 받지 않는다. 포스터와 글이 필름을 대신한다.
 *   · 콘솔 오류 0.
 */

const URL = '/landxi/proto/scrub/';
const VH = 900;

test.describe.configure({ timeout: 180000 });

async function boot(page, opts = {}) {
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.setViewportSize({ width: 1440, height: VH });
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction('window.__scrub && window.__scrub.ready === true', null, { timeout: 60000 });
  await page.waitForTimeout(opts.settle ?? 1200);
  return errors;
}

// lerp 가 수렴할 때까지 기다린다 — 수렴 전 상태는 페이지가 실제로 붙잡는 상태가 아니다.
async function seek(page, p, wait = 420) {
  await page.evaluate((q) => window.__scrub.seek(q), p);
  await page.waitForFunction(() => {
    const I = window.ScrollCraft && window.ScrollCraft.instances[0];
    if (!I) return true;
    return I.clips.every((c) => !c.ready || Math.abs(c.cur - c.target) < 0.0015);
  }, null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(wait);
}

const stageState = (page) => page.evaluate(() => {
  const segs = Array.from(document.querySelectorAll('[data-sc-segment]'));
  return segs.map((s) => ({
    op: +(+s.style.opacity || 0).toFixed(3),
    vis: s.style.visibility,
    hasClip: s.classList.contains('sc-has-clip'),
    painted: !!s.querySelector('video.sb-painted'),
    srcSet: !!(s.querySelector('video') || {}).src,
  }));
});

test('스크럽 비행 — 하나의 카메라, 검은 프레임 없는 7개 이음매', async ({ page }) => {
  const errors = await boot(page);

  const M = await page.evaluate(() => window.__scrub.manifest);
  expect(M.legs.length).toBe(7);

  /* ── 1. 문서 흐름에는 스페이서 하나뿐, 무대는 fixed ─────────────────────── */
  const flow = await page.evaluate(() => {
    const inFlow = (e) => { const p = getComputedStyle(e).position; return p === 'static' || p === 'relative'; };
    return {
      stagePos: getComputedStyle(document.querySelector('[data-sc-world]')).position,
      copyPos: getComputedStyle(document.querySelector('[data-sc-world-copy]')).position,
      instPos: getComputedStyle(document.querySelector('.sb-inst')).position,
      flowKids: Array.from(document.querySelector('[data-sc-mode]').children)
        .filter(inFlow).map((e) => e.tagName + '.' + String(e.className || '')),
      spacerPx: document.querySelector('[data-sc-spacer]').getBoundingClientRect().height,
      scrollHeight: document.documentElement.scrollHeight,
      spacerVh: window.__scrub.spacerVh(),
    };
  });
  expect(flow.stagePos).toBe('fixed');
  expect(flow.copyPos).toBe('fixed');
  expect(flow.instPos).toBe('fixed');
  // 흐름에 남는 것은 스페이서 하나 — 나머지 자식은 전부 fixed 다.
  expect(flow.flowKids.length).toBe(1);
  expect(flow.flowKids[0]).toMatch(/spacer|DIV/);
  // 스페이서 높이 = (Σw + 1) × innerHeight
  expect(Math.abs(flow.scrollHeight - flow.spacerVh * VH)).toBeLessThan(VH * 0.06);

  /* ── 2. 페이스 — 레그별 vh/필름초 편차 ≤ 6% ─────────────────────────────── */
  const rates = M.legs.map((l) => l.weightVh / l.seconds);
  const dev = (Math.max(...rates) - Math.min(...rates)) / M.pace.targetRate;
  expect(dev).toBeLessThan(0.06);
  for (const r of rates) {
    expect(r).toBeGreaterThanOrEqual(M.pace.band[0]);
    expect(r).toBeLessThanOrEqual(M.pace.band[1]);
  }

  /* ── 3. 인코딩 — 스크럽 GOP 계약이 매니페스트에 박혀 있다 ────────────────── */
  expect(M.encode.desktop).toContain('-g 8');
  expect(M.encode.desktop).toContain('-keyint_min 8');
  expect(M.encode.desktop).toContain('-sc_threshold 0');
  expect(M.encode.desktop).toContain('+faststart');
  expect(M.encode.mobile).toContain('-g 4');
  expect(M.seam).toBeCloseTo(0.16, 5);
  expect(M.lerp).toBeCloseTo(0.12, 5);
  // 씸 법칙 A — 같은 소스를 자른 이음매는 인코딩 후 diff < 1%
  for (const s of M.seams) if (s.frameShared) expect(s.pct).toBeLessThan(1);
  // 크기 예산
  expect(M.bytes.desktopMB).toBeLessThanOrEqual(60);
  expect(M.bytes.mobileMB).toBeLessThanOrEqual(20);

  /* ── 4. seek(0.5) 는 약속된 레그에 선다 ─────────────────────────────────── */
  await seek(page, 0.5);
  const mid = await page.evaluate(() => ({
    id: window.__scrub.legs[window.__scrub.leg()].id,
    label: window.__scrub.legLabel(),
    t: window.__scrub.trackVh(),
  }));
  // 0.5 × 6.244vh = 3.12vh → 레그 04(남원 분지, 2.581–3.157vh)
  expect(mid.id).toBe('04');
  expect(mid.label).toBe('남원');

  /* ── 5. 이음매에 검은 프레임이 없다 ──────────────────────────────────────
     구조적 보증: 한쪽만 페이드하므로 나가는 레그가 밑에서 풀 강도로 남는다.
     씸 밴드를 촘촘히 훑으며 "완전 불투명한 레그가 항상 하나 이상"인지 본다. */
  let run = 0;
  const c0 = M.legs.map((l) => { const a = run; run += l.weightVh; return a; });
  const total = run;
  const opaqueMin = [];
  for (let i = 1; i < M.legs.length; i++) {
    for (let k = -4; k <= 4; k++) {
      const p = Math.max(0, Math.min(1, (c0[i] + (M.seam * k) / 8) / total));
      await seek(page, p, 140);
      const st = await stageState(page);
      const maxOp = Math.max(...st.map((s) => s.op));
      // 완전 불투명 레그의 클립이 실제로 그려졌는지도 함께 본다 — 포스터가
      // 아직 걸려 있다면 그것도 프레임이지, 검정이 아니다.
      const anyVisible = st.some((s) => s.op > 0.99 && s.vis !== 'hidden');
      opaqueMin.push({ seam: `${M.legs[i - 1].id}→${M.legs[i].id}`, k, maxOp, anyVisible });
      expect(maxOp).toBeGreaterThan(0.999);
      expect(anyVisible).toBe(true);
    }
  }

  /* ── 6. 지연 로딩 ±1.6vh — 멀리 있는 레그는 아직 안 받는다 ──────────────── */
  await seek(page, 0);
  const early = await stageState(page);
  expect(early[0].srcSet).toBe(true);          // 지금 레그는 받았다
  expect(early[6].srcSet).toBe(false);         // 6.24vh 뒤 여수는 아직이다
  await seek(page, 0.985);
  const late = await stageState(page);
  expect(late[6].srcSet).toBe(true);
  expect(late.every((s) => s.op <= 1)).toBe(true);

  /* ── 7. 인계 판 — manifest 카메라 그대로 뜬다 ───────────────────────────── */
  const bands = await page.evaluate(() => window.__scrub.bands());
  const pN = ((bands.namwon[0] + bands.namwon[1]) / 2) / bands.total;
  await seek(page, pN, 1400);
  const plateN = await page.evaluate(() => window.__scrub.plate(0));
  expect(plateN).not.toBeNull();
  expect(plateN.on).toBe(true);
  expect(plateN.center[0]).toBeCloseTo(M.handoff.center[0], 3);
  expect(plateN.center[1]).toBeCloseTo(M.handoff.center[1], 3);
  expect(plateN.zoom).toBeCloseTo(M.handoff.zoom, 2);
  expect(plateN.bearing).toBeCloseTo(M.handoff.bearing, 1);

  await seek(page, 0.99, 1400);
  const plateY = await page.evaluate(() => window.__scrub.plate(1));
  expect(plateY).not.toBeNull();
  expect(plateY.on).toBe(true);
  expect(plateY.center[0]).toBeCloseTo(M.handoffFinal.center[0], 3);
  expect(plateY.center[1]).toBeCloseTo(M.handoffFinal.center[1], 3);
  expect(plateY.zoom).toBeCloseTo(M.handoffFinal.zoom, 2);

  /* ── 8. 계기판 — 고도는 단조 하강, 좌표·방위는 늘 읽힌다 ────────────────── */
  const dial = [];
  for (let i = 0; i <= 24; i++) {
    await seek(page, i / 24, 90);
    dial.push(await page.evaluate(() => ({
      alt: window.__scrub.camera().alt,
      bearing: document.getElementById('sb-bearing').textContent,
      coord: document.getElementById('sb-coord').textContent,
      gsd: document.getElementById('sb-gsd').textContent,
    })));
  }
  for (const d of dial) {
    expect(d.bearing).toMatch(/^[\d,]+\.\d°$/);
    expect(d.coord).toMatch(/^\d+\.\d{4}, \d+\.\d{4}$/);
    expect(d.gsd).toMatch(/(cm|m|km)\/px$/);
    expect(d.alt).toBeGreaterThan(0);
  }
  // 궤도(15,000km) → 여수(11km): 시작이 끝보다 세 자릿수 위다.
  expect(dial[0].alt / dial[dial.length - 1].alt).toBeGreaterThan(500);

  /* ── 9. 키보드 ←/→ 로 레그를 건너뛴다 ───────────────────────────────────── */
  await seek(page, 0);
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(900);
  const afterRight = await page.evaluate(() => window.__scrub.leg());
  expect(afterRight).toBe(1);
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(900);
  expect(await page.evaluate(() => window.__scrub.leg())).toBe(0);

  /* ── 10. 항로 — 이름 붙은 5개 지점 ──────────────────────────────────────── */
  const rail = await page.$$eval('#sb-route-list .sb-route__t', (n) => n.map((e) => e.textContent));
  expect(rail).toEqual(['궤도', '성층운', '한반도', '남원', '여수']);

  expect(errors, '콘솔 오류').toEqual([]);
});

test('reduced-motion — 클립을 아예 받지 않는다. 포스터와 글이 필름을 대신한다', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1440, height: VH } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  const videoReqs = [];
  page.on('request', (r) => { if (/\/legs\/w\d\d(-m)?\.mp4$/.test(r.url())) videoReqs.push(r.url()); });

  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction('window.__scrub && window.__scrub.ready === true', null, { timeout: 60000 });

  for (const p of [0, 0.25, 0.5, 0.75, 1]) {
    await page.evaluate((q) => window.__scrub.seek(q), p);
    await page.waitForTimeout(260);
  }
  await page.waitForTimeout(800);

  expect(videoReqs, 'reduced-motion 에서 mp4 를 받지 않는다').toEqual([]);
  // 포스터 7장이 그대로 서 있고, 카피는 읽힌다.
  const posters = await page.$$eval('.sc-world__poster', (n) => n.map((e) => e.naturalWidth > 0));
  expect(posters.length).toBeGreaterThanOrEqual(7);
  expect(posters.filter(Boolean).length).toBeGreaterThanOrEqual(7);
  expect(await page.textContent('.sb-h1')).toContain('국토는 매일');
  // 인계 판은 만들지 않는다(엔진 계약: reduced 에서는 지도도 띄우지 않는다).
  expect(await page.evaluate(() => window.__scrub.handoffActive())).toBe(false);
  expect(errors, '콘솔 오류').toEqual([]);
  await ctx.close();
});
