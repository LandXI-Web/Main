import { test, expect } from '@playwright/test';

/* landxi/proto/scrub/ — 월드플라이트 스크럽 비행.
 *
 * 이 스펙이 지키는 계약 (references/worldflight.md §8 Hard rules + 스펙 §B/§F):
 *   1) 문서 흐름에는 스페이서 하나뿐이고, 무대는 position:fixed 하나다.
 *   2) src 를 절대 교체하지 않는다 — 14개 레그(01–06, 06b, 07, 08, 08b, 09, 10, 11, 12 · 전부 kling AI)가 전부 동시에 마운트된 채로 남는다.
 *   3) 크로스페이드는 한쪽만. 어느 순간에도 완전 불투명한 레그가 최소 하나 있다
 *      → 씸에서 페이지 바탕(검정)이 드러나지 않는다.
 *   4) 재생헤드는 lerp 0.12 + 데드밴드 8/20ms + 시크 병합으로 움직인다.
 *   5) 비행 페이스는 하나 — 레그별 vh/필름초 편차 ≤ 6%.
 *   6) 지연 로딩은 ±1.6vh. 멀리 있는 레그는 아직 받지 않는다.
 *   7) 인계 판은 manifest 가 적어 둔 카메라 그대로 뜬다.
 *   8) 브랜드 마감(2.00vh, v2 — 2026-09-01)은 두 박자다: 필름 마지막 프레임(A01 · 모형 지구본)이
 *      어둠 속으로 물러나고(무대 스케일·밝기·불투명 감쇠 + 바닥 닫힘), 그 위에 **실제 브랜드 벡터**
 *      3종이 워드마크 → 태그라인 → LX 락업 순으로 뜬다. 마지막 화면에는 셋이 **함께** 남는다.
 *      (이전 v1 은 국토 V-World 판 위에서 3단이 겹치지 않고 교대하는 판이었다 — ending.js
 *       FINALE_MODE='plate' 로 남아 있고, 이 스펙의 기대값은 v2 사실에 맞춰 갱신했다.)
 *   · reduced-motion 이면 클립을 아예 받지 않는다. 포스터와 글이 필름을 대신한다.
 *   · 콘솔 오류 0.
 */

const URL = '/landxi/proto/scrub/';
const VH = 900;

test.describe.configure({ timeout: 600000 });

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

test('스크럽 비행 — 하나의 카메라, 검은 프레임 없는 14개 레그 이음매', async ({ page }) => {
  const errors = await boot(page);

  const M = await page.evaluate(() => window.__scrub.manifest);
  expect(M.legs.length).toBe(14);

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
      endVh: window.__scrub.endVh(),
      padBottom: parseFloat(getComputedStyle(document.querySelector('[data-sc-mode]')).paddingBottom),
    };
  });
  expect(flow.stagePos).toBe('fixed');
  expect(flow.copyPos).toBe('fixed');
  expect(flow.instPos).toBe('fixed');
  // 흐름에 남는 것은 스페이서 하나 — 나머지 자식은 전부 fixed 다.
  expect(flow.flowKids.length).toBe(1);
  expect(flow.flowKids[0]).toMatch(/spacer|DIV/);
  // 스페이서 높이 = (Σw + 1) × innerHeight, 그 뒤에 브랜드 마감 2.00vh 가 **패딩으로** 붙는다.
  // 형제 요소가 아니라 패딩이어야 "흐름에는 스페이서 하나"가 유지된다(위 flowKids 검사).
  expect(flow.endVh).toBeCloseTo(2.0, 5);
  expect(flow.padBottom).toBeCloseTo(flow.endVh * VH, 0);
  expect(Math.abs(flow.scrollHeight - (flow.spacerVh + flow.endVh) * VH)).toBeLessThan(VH * 0.06);

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
  await seek(page, 0.55);
  const mid = await page.evaluate(() => ({
    id: window.__scrub.legs[window.__scrub.leg()].id,
    label: window.__scrub.legLabel(),
    t: window.__scrub.trackVh(),
  }));
  // 0.55 × 15.512vh = 8.532vh → 레그 07(여수, 7.756–8.864vh · 씸 밴드 밖). AI 레그 1–12 가 각 1.108vh.
  // (2026-09-01 레그 12 가 붙어 트랙이 14.404 → 15.512vh 가 됐지만 0.55 지점은 여전히 레그 07 안이다 — 기대값 불변.)
  expect(mid.id).toBe('07');
  expect(mid.label).toBe('여수');

  /* ── 5. 이음매에 검은 프레임이 없다 ──────────────────────────────────────
     구조적 보증: 한쪽만 페이드하므로 나가는 레그가 밑에서 풀 강도로 남는다.
     씸 밴드를 촘촘히 훑으며 "완전 불투명한 레그가 항상 하나 이상"인지 본다. */
  let run = 0;
  const c0 = M.legs.map((l) => { const a = run; run += l.weightVh; return a; });
  const total = run;
  const opaqueMin = [];
  for (let i = 1; i < M.legs.length; i++) {
    for (let k = -4; k <= 4; k += 2) {
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

  /* ── 7. 인계 판 — manifest 카메라 그대로 뜬다 ───────────────────────────── */
  // 판은 자기 구간 1.2vh 앞에서 만들어지고 MapLibre load(타일 + 검출 GeoJSON, 여수는 38k
  // 피처)가 끝나야 켜진다. AI 레그 1–3(각 1.108vh)로 트랙이 6.99vh 가 되면서 판 생성
  // 시점이 씸 순회의 끝으로 밀려, 고정 1.4초 대기로는 load 가 끝나기 전에 검사한다.
  // 판이 켜지는 것 자체를 기다린다(카메라 검사는 그 뒤에 그대로).
  const plateOn = (i) => page.waitForFunction((k) => { const r = window.__scrub.plate(k); return !!(r && r.on); }, i, { timeout: 20000 }).catch(() => {});
  const bands = await page.evaluate(() => window.__scrub.bands());
  const pN = ((bands.namwon[0] + bands.namwon[1]) / 2) / bands.total;
  await seek(page, pN, 600);
  await plateOn(0);
  const plateN = await page.evaluate(() => window.__scrub.plate(0));
  expect(plateN).not.toBeNull();
  expect(plateN.on).toBe(true);
  expect(plateN.center[0]).toBeCloseTo(M.handoff.center[0], 3);
  expect(plateN.center[1]).toBeCloseTo(M.handoff.center[1], 3);
  expect(plateN.zoom).toBeCloseTo(M.handoff.zoom, 2);
  expect(plateN.bearing).toBeCloseTo(M.handoff.bearing, 1);

  // 여수 판은 레그 07 끝에 선다(2026-08-27 레그 8·8b 뒤로 필름은 판 뒤로 이어진다) — 밴드 한가운데서 본다.
  const pY = ((bands.yeosu[0] + bands.yeosu[1]) / 2) / bands.total;
  await seek(page, pY, 600);
  await plateOn(1);
  const plateY = await page.evaluate(() => window.__scrub.plate(1));
  expect(plateY).not.toBeNull();
  expect(plateY.on).toBe(true);
  expect(plateY.center[0]).toBeCloseTo(M.handoffFinal.center[0], 3);
  expect(plateY.center[1]).toBeCloseTo(M.handoffFinal.center[1], 3);
  expect(plateY.zoom).toBeCloseTo(M.handoffFinal.zoom, 2);

  /* ── 8. 계기판 — 고도는 단조 하강, 좌표·방위는 늘 읽힌다 ────────────────── */
  const dial = [];
  for (let i = 0; i <= 16; i++) {
    await seek(page, i / 16, 90);
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
  // 궤도(15,000km) → 울주 공터(0.5km) → 귀환(A12, 1,400km): 최저점이 시작보다 네 자릿수 아래이고, 끝은 다시 수백 km 위다(2026-08-27 레그 11).
  const minAlt = Math.min(...dial.map((d) => d.alt));
  expect(dial[0].alt / minAlt).toBeGreaterThan(500);
  expect(dial[dial.length - 1].alt).toBeGreaterThan(100000);

  /* ── 9. 키보드 ←/→ 로 레그를 건너뛴다 ───────────────────────────────────── */
  await seek(page, 0);
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(900);
  const afterRight = await page.evaluate(() => window.__scrub.leg());
  expect(afterRight).toBe(1);
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(900);
  expect(await page.evaluate(() => window.__scrub.leg())).toBe(0);

  /* ── 10. 항로 — 이름 붙은 7개 지점 ──────────────────────────────────────── */
  const rail = await page.$$eval('#sb-route-list .sb-route__t', (n) => n.map((e) => e.textContent));
  expect(rail).toEqual(['궤도', '성층운', '한반도', '남원', '여수', '울주', '국토']);

  expect(errors, '콘솔 오류').toEqual([]);
});

/* ── 브랜드 마감 v2 (2026-09-01) ────────────────────────────────────────────
   클라이언트: "한반도가 사라지면서 Land-XI 플랫폼 CI 가 떠야 될 것 같다."
   레그 12(귀환)가 필름을 A01(작업대 위 모형 지구본)로 닫고, 그 프레임 위에서:
     ① 지구본이 어둠 속으로 물러난다 — 무대 스케일·밝기·불투명이 감쇠하고 바닥이 닫힌다.
     ② 그 위에 **실제 브랜드 벡터** 3종이 워드마크 → 태그라인 → LX 락업 순으로 뜬다.
   v1 의 "3단은 절대 겹치지 않는다" 계약은 v2 에서 뒤집혔다 — v2 의 마지막 화면은
   셋이 **함께 남는 한 장의 엔드카드**다. 그래서 겹침 0 검사를 순서 + 동시 잔존 검사로 갈았다. */
test('브랜드 마감 v2 — 지구본이 물러나고 CI 3종이 순서대로 뜬다', async ({ page }) => {
  const errors = await boot(page);

  // 마감 앞까지 한 번 훑어 마지막 레그를 실제로 올려 둔다.
  for (const q of [0.5, 0.8, 0.95, 1]) await seek(page, q, 500);
  await page.waitForTimeout(1200);

  const at = async (e, wait = 1500) => {
    await page.evaluate((x) => window.__scrub.seekEnd(x), e);
    await page.waitForTimeout(wait);   // CSS 전이 사다리의 최장값(1250ms)보다 길게 기다린다
    return page.evaluate(() => window.__scrub.end());
  };

  /* 1. 마감은 v2(globe) 다. 필름이 끝나는 자리에서는 아직 아무것도 뜨지 않았고 무대도 그대로다. */
  await page.evaluate(() => window.__scrub.seek(1));
  await page.waitForTimeout(400);
  const lead = await page.evaluate(() => window.__scrub.end());
  expect(lead.mode).toBe('globe');
  expect(lead.e).toBe(0);
  expect(lead.wordmark.opacity).toBe(0);
  expect(lead.tagline).toBe(0);
  expect(lead.lockup).toBe(0);
  expect(lead.globe.scale).toBe(1);

  /* 2. ① 물러남 — 스케일·밝기·불투명은 단조 감소하고 바닥은 단조 상승한다(하나의 카메라). */
  const g0 = (await at(0.02, 400)).globe;
  const g1 = (await at(0.16, 400)).globe;
  const g2 = (await at(0.40, 400)).globe;
  expect(g0.scale).toBeGreaterThan(g1.scale);
  expect(g1.scale).toBeGreaterThan(g2.scale);
  expect(g0.opacity).toBeGreaterThan(g2.opacity);
  expect(g0.brightness).toBeGreaterThan(g2.brightness);
  expect(g0.floor).toBeLessThan(g2.floor);
  expect(g2.scale).toBeCloseTo(0.78, 2);      // 무대가 실제로 22 % 물러났다
  expect(g2.opacity).toBeCloseTo(0.22, 2);
  expect(g2.floor).toBeCloseTo(1, 2);

  /* 3. ② 스태거 — 워드마크가 먼저, 태그라인이 다음, 락업이 그다음, CTA 가 마지막. */
  const marks = [];
  for (let i = 0; i <= 12; i++) {
    const st = await at(i / 12, 1500);
    marks.push([+(i / 12).toFixed(3), +st.wordmark.opacity.toFixed(3), +st.tagline.toFixed(3),
      +st.lockup.toFixed(3), +st.cta.toFixed(3)]);
  }
  const firstOf = (k) => marks.findIndex((m) => m[k] > 0.5);
  expect(firstOf(1)).toBeGreaterThanOrEqual(0);
  expect(firstOf(2)).toBeGreaterThan(firstOf(1));
  expect(firstOf(3)).toBeGreaterThan(firstOf(2));
  expect(firstOf(4)).toBeGreaterThan(firstOf(3));
  // 한 번 뜬 것은 다시 사라지지 않는다 — 마지막 화면은 한 장의 엔드카드다.
  for (let k = 1; k <= 4; k++) {
    const f = firstOf(k);
    for (let i = f; i < marks.length; i++) expect(marks[i][k]).toBeGreaterThan(0.5);
  }

  /* 4. 마지막 화면 = 실제 브랜드 벡터 3종 + CTA. AI 로 그린 글자는 없다. */
  const end = await at(1);
  expect(end.wordmark.opacity).toBeGreaterThan(0.95);
  expect(end.tagline).toBeGreaterThan(0.95);
  expect(end.lockup).toBeGreaterThan(0.95);
  expect(end.cta).toBeGreaterThan(0.95);
  const srcs = await page.$$eval('#sb-end-ci img', (n) => n.map((e) => ({
    src: e.getAttribute('src'), loaded: e.naturalWidth > 0 })));
  expect(srcs.map((x) => x.src)).toEqual([
    '../../assets/brand/vector/landxi-wordmark.svg',
    '../../assets/brand/vector/tagline.svg',
    '../../assets/brand/vector/lx-lockup-reverse.svg',
  ]);
  for (const x of srcs) expect(x.loaded, x.src).toBe(true);
  await expect(page.locator('#sb-end-wm')).toHaveAttribute('alt', 'LAND-XI PLATFORM');
  await expect(page.locator('#sb-end-lx img')).toHaveAttribute('alt', 'LX 한국국토정보공사');
  const cta = page.locator('#sb-end-cta a');
  await expect(cta).toHaveText('로그인하고 시작하기');
  expect(await cta.getAttribute('href')).toBe('../login.html');

  /* 5. 이징은 하나, 지속은 500/750/1000/1250 ms 사다리 — 규격이 CSS 에 박혀 있다. */
  const tr = await page.$$eval('.sb-ci__wm,.sb-ci__tag,.sb-ci__lock,.sb-ci__cta', (n) => n.map((e) => {
    const c = getComputedStyle(e);
    return { d: c.transitionDuration.split(',')[0].trim(), f: c.transitionTimingFunction };
  }));
  expect(tr.map((x) => x.d)).toEqual(['0.5s', '0.75s', '1s', '1.25s']);
  // 이징은 하나다 — 네 요소 모두 같은 곡선만 쓴다(다른 곡선이 섞여 있으면 여기서 걸린다).
  for (const x of tr) {
    expect(x.f).toContain('cubic-bezier(0.15, 1, 0.3, 1)');
    expect(x.f.replace(/cubic-bezier\(0\.15, 1, 0\.3, 1\)/g, '').replace(/[\s,]/g, '')).toBe('');
  }

  /* 6. 마감 동안 크롬(마스트헤드·카피·계기판·항로)은 물러나 있다. */
  const chrome = await page.evaluate(() => ['.lx-masthead', '.sb-copy-layer', '.sb-inst', '.sb-route']
    .map((s) => +getComputedStyle(document.querySelector(s)).opacity));
  for (const o of chrome) expect(o).toBeLessThan(0.02);

  /* 7. 국토 V-World 판은 더 이상 뜨지 않는다(manifest.finale.plate=false). */
  expect(await page.evaluate(() => window.__scrub.manifest.finale.plate)).toBe(false);
  expect(await page.evaluate(() => window.__scrub.plate(2))).toBeNull();

  /* 8. End 키 — 마감의 시작으로 건너뛴다. */
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForTimeout(400);
  expect((await page.evaluate(() => window.__scrub.end())).on).toBe(false);
  await page.keyboard.press('End');
  await page.waitForTimeout(600);
  const jumped = await page.evaluate(() => window.__scrub.end());
  expect(jumped.on).toBe(true);
  expect(jumped.e).toBeLessThan(0.02);

  expect(errors, '콘솔 오류').toEqual([]);
});

/* 마감 박자 — 문서 맨 끝(실제 스크롤)에서 CI 3종이 겹침·잘림 없이 읽히고 콘솔 오류가 0 이다.
   seekEnd 가 아니라 진짜 스크롤 끝으로 간다 — 독자가 실제로 도달하는 자리다. */
test('마감 박자 — 스크롤 끝에서 Land-XI CI 3종이 보인다', async ({ page }) => {
  const errors = await boot(page);
  for (const q of [0.6, 0.9, 1]) await seek(page, q, 400);

  await page.evaluate(() => scrollTo({ top: document.documentElement.scrollHeight, behavior: 'auto' }));
  await page.waitForTimeout(2200);   // 전이 사다리(최장 1250ms) + 여유

  const ci = await page.evaluate(() => {
    const pick = (sel) => {
      const e = document.querySelector(sel);
      const r = e.getBoundingClientRect();
      const img = e.tagName === 'IMG' ? e : e.querySelector('img');
      return { sel, op: +getComputedStyle(e).opacity, loaded: img.naturalWidth > 0,
        x: r.left, y: r.top, w: r.width, h: r.height, r: r.right, b: r.bottom };
    };
    return { items: ['.sb-ci__wm', '.sb-ci__tag', '.sb-ci__lock'].map(pick),
      vw: innerWidth, vh: innerHeight,
      progress: window.__scrub.progress(), end: window.__scrub.end() };
  });

  // 셋 다 켜져 있고, 실제 SVG 가 그려졌다.
  for (const it of ci.items) {
    expect(it.op, it.sel).toBeGreaterThan(0.95);
    expect(it.loaded, it.sel).toBe(true);
    expect(it.w, it.sel).toBeGreaterThan(80);
    expect(it.h, it.sel).toBeGreaterThan(8);
    // 잘림 0 — 뷰포트 안에 완전히 들어온다.
    expect(it.x, it.sel).toBeGreaterThanOrEqual(0);
    expect(it.y, it.sel).toBeGreaterThanOrEqual(0);
    expect(it.r, it.sel).toBeLessThanOrEqual(ci.vw);
    expect(it.b, it.sel).toBeLessThanOrEqual(ci.vh);
  }
  // 겹침 0 — 세로로 쌓인 세 덩어리가 서로 침범하지 않는다.
  for (let i = 1; i < ci.items.length; i++) {
    expect(ci.items[i].y, ci.items[i].sel + ' 이 위 요소와 겹친다').toBeGreaterThan(ci.items[i - 1].b);
  }
  // 지구본은 물러나 있다.
  expect(ci.end.globe.scale).toBeLessThan(0.85);
  expect(ci.end.globe.opacity).toBeLessThan(0.35);
  expect(ci.end.globe.floor).toBeGreaterThan(0.95);

  expect(errors, '콘솔 오류').toEqual([]);
});

/* 지연 로딩은 "아직 한 번도 안 간 곳"에서만 관찰된다. 트랙을 훑고 난 페이지에서는
   모든 레그가 이미 반경 안에 들어왔던 적이 있으므로, 새 페이지에서 따로 본다. */
test('지연 로딩 ±1.6vh — 멀리 있는 레그는 아직 받지 않는다', async ({ page }) => {
  const errors = await boot(page);
  const reqs = [];
  page.on('request', (r) => { const m = /\/legs\/(w\d\d[a-z]?)(-m)?\.mp4$/.exec(r.url()); if (m) reqs.push(m[1]); });

  await seek(page, 0);
  const early = await stageState(page);
  expect(early[0].srcSet, '레그 01 은 받았다').toBe(true);
  // 15.512vh 트랙에서 마지막 레그 12(14.40vh~, index 13)은 1.6vh 반경 밖 — 아직 받지 않았다.
  // (2026-09-01: 레그 12 마운트로 마지막 인덱스가 12 → 13, 감시 대상이 w11 → w12 로 바뀌었다.)
  expect(early[13].srcSet, '레그 12 는 아직이다').toBe(false);
  expect(reqs).not.toContain('w12');

  await seek(page, 0.985, 1200);
  const late = await stageState(page);
  expect(late[13].srcSet, '도착하면 받는다').toBe(true);
  expect(late.every((s) => s.op <= 1)).toBe(true);
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
  // 포스터 14장이 그대로 서 있고, 카피는 읽힌다(2026-09-01 레그 12 마운트로 13 → 14).
  const posters = await page.$$eval('.sc-world__poster', (n) => n.map((e) => e.naturalWidth > 0));
  expect(posters.length).toBeGreaterThanOrEqual(14);
  expect(posters.filter(Boolean).length).toBeGreaterThanOrEqual(14);
  expect(await page.textContent('.sb-h1')).toContain('국토는 매일');
  // 인계 판은 만들지 않는다(엔진 계약: reduced 에서는 지도도 띄우지 않는다).
  expect(await page.evaluate(() => window.__scrub.handoffActive())).toBe(false);

  // 브랜드 마감은 전이 없이 **정지 상태**로 선다 — 워드마크 · 태그라인 · 락업 · CTA 가 한 번에.
  // (2026-09-01 v2: 선택자가 .sb-end__lx img → #sb-end-lx img 로, 검사 항목이 blur 대신 transition 으로 바뀌었다.
  //  v2 마감에는 블러 인이 없다 — 저감 모드가 꺼야 하는 것은 전이 자체다.)
  await page.evaluate(() => window.__scrub.seekEnd(0.6));
  await page.waitForTimeout(500);
  const st = await page.evaluate(() => {
    const s = window.__scrub.end();
    const h = document.getElementById('sb-end');
    return { on: s.on, wm: s.wordmark.opacity, tag: s.tagline, lx: s.lockup, cta: s.cta,
      static: h.classList.contains('is-static'),
      trans: getComputedStyle(h.querySelector('#sb-end-lx img')).transitionDuration,
      lockTrans: getComputedStyle(document.querySelector('.sb-ci__lock')).transitionDuration };
  });
  expect(st.static).toBe(true);
  expect(st.on).toBe(true);
  expect(st.wm).toBe(1);
  expect(st.tag).toBe(1);
  expect(st.lx).toBe(1);
  expect(st.cta).toBe(1);
  expect(st.lockTrans).toMatch(/^0s/);
  expect(await page.textContent('#sb-end-tag')).toContain('공간을 읽고 미래를 설계합니다.');
  expect(errors, '콘솔 오류').toEqual([]);
  await ctx.close();
});

test.skip('소품 — 드론 오버레이 (D16 ① 폐기 — props 비움)는 레그 04 창 안에서만 서고, 스크롤을 따라 움직인다 (2026-08-27 스파이크)', async ({ page }) => {
  const errors = await boot(page);
  const M = await page.evaluate(() => window.__scrub.manifest);
  let run = 0;
  const cum = M.legs.map((l) => { const a = run; run += l.weightVh; return [a, run]; });
  const total = run;
  const P = (v) => v / total;
  const i4 = M.legs.findIndex((l) => l.id === '04');
  expect(i4).toBeGreaterThan(0);

  expect(await page.evaluate(() => window.__scrub.props())).toContain('drone-04');
  const state = () => page.evaluate(() => {
    const h = document.querySelector('.sb-prop[data-prop="drone-04"]');
    const r = h.getBoundingClientRect();
    return { ...window.__scrub.prop('drone-04'), vis: getComputedStyle(h).visibility, op: +getComputedStyle(h).opacity,
      z: +getComputedStyle(h.parentElement).zIndex, imgLoaded: h.querySelector('img').naturalWidth > 0 };
  });

  // 레그 03 한가운데 — 드론 없음(레그 03 필름 자체의 드론과 겹치지 않는다).
  await seek(page, P(cum[i4 - 1][0] + 0.55));
  const before = await state();
  expect(before.on).toBe(false);
  expect(before.vis).toBe('hidden');

  // 레그 04 앞쪽·뒤쪽 — 켜져 있고, 오른쪽·위로 이동하며 작아진다(원근). 층은 레그(≤120) 위·인계 판(130) 아래.
  await seek(page, P(cum[i4][0] + 0.30));
  const a = await state();
  await seek(page, P(cum[i4][0] + 0.85));
  const b = await state();
  for (const s of [a, b]) {
    expect(s.on).toBe(true);
    expect(s.vis).toBe('visible');
    expect(s.op).toBeGreaterThan(0.9);
    expect(s.imgLoaded).toBe(true);
    expect(s.z).toBe(125);
  }
  expect(b.px).toBeGreaterThan(a.px + 100);
  expect(b.py).toBeLessThan(a.py - 40);
  expect(b.w).toBeLessThan(a.w);
  // 창의 첫·끝 0.4 필름초는 페이드 — 레그 시작 직후 opacity 가 1 미만.
  await seek(page, P(cum[i4][0] + 0.02));
  const edge = await state();
  expect(edge.on).toBe(true);
  expect(edge.opacity).toBeLessThan(0.6);

  // 레그 05 — 꺼진다.
  await seek(page, P(cum[i4 + 1][0] + 0.55));
  const after = await state();
  expect(after.on).toBe(false);
  expect(after.vis).toBe('hidden');
  expect(errors, '콘솔 오류').toEqual([]);
});
