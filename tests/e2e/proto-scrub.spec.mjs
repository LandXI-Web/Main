import { test, expect } from '@playwright/test';

/* landxi/proto/scrub/ — 월드플라이트 스크럽 비행.
 *
 * 이 스펙이 지키는 계약 (references/worldflight.md §8 Hard rules + 스펙 §B/§F):
 *   1) 문서 흐름에는 스페이서 하나뿐이고, 무대는 position:fixed 하나다.
 *   2) src 를 절대 교체하지 않는다 — 13개 레그(01–06, 06b, 07, 08, 08b, 09, 10, 11 · 전부 kling AI)가 전부 동시에 마운트된 채로 남는다.
 *   3) 크로스페이드는 한쪽만. 어느 순간에도 완전 불투명한 레그가 최소 하나 있다
 *      → 씸에서 페이지 바탕(검정)이 드러나지 않는다.
 *   4) 재생헤드는 lerp 0.12 + 데드밴드 8/20ms + 시크 병합으로 움직인다.
 *   5) 비행 페이스는 하나 — 레그별 vh/필름초 편차 ≤ 6%.
 *   6) 지연 로딩은 ±1.6vh. 멀리 있는 레그는 아직 받지 않는다.
 *   7) 인계 판은 manifest 가 적어 둔 카메라 그대로 뜬다.
 *   8) 브랜드 마감 판(2.00vh)은 3단이 **겹치지 않고** 순서대로 선다:
 *      워드마크 → 태그라인 → LX 락업. 워드마크 기하는 홍보영상 실측(폭 31 % ·
 *      베이스라인 56.8 %)이고, 수축은 지도의 줌아웃과 **같은 비율**이다.
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

test('스크럽 비행 — 하나의 카메라, 검은 프레임 없는 13개 레그 이음매', async ({ page }) => {
  const errors = await boot(page);

  const M = await page.evaluate(() => window.__scrub.manifest);
  expect(M.legs.length).toBe(13);

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
  // 0.55 × 14.404vh = 7.922vh → 레그 07(여수, 7.756–8.864vh · 시작 씸 밴드 밖). AI 레그 1–11 이 각 1.108vh.
  // (레그 08·08b 가 들어오며 11.08vh 에서는 레그 06 이었다; 2026-08-27 레그 09·10·11 이 들어오며 14.404vh; kie-legs-final)
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

/* ── 브랜드 마감 판 ─────────────────────────────────────────────────────────
   홍보영상(71.5 s)의 마감 문법을 필름 끝에 이식한 판이다. 이 스펙이 지키는 것:
     · 3단이 **절대 겹치지 않는다** — 홍보영상에서도 제품 워드마크와 LX 코퍼릿
       락업은 같은 화면에 나오지 않는다(promo-video.md §2-2 「주의」).
     · 워드마크 기하는 실측 그대로 — 폭 31 % · 베이스라인 56.8 %.
     · 수축(−35 %)은 **월드에 붙어** 일어난다: 워드마크 스케일 = 지도 줌아웃 비율.
     · 마지막 화면에 CTA 가 남는다. */
test('브랜드 마감 — 워드마크 → 태그라인 → LX 락업, 겹침 0, 월드에 붙은 수축', async ({ page }) => {
  const errors = await boot(page);

  // 마감 앞까지 한 번 훑어 마지막 레그와 인계 판을 실제로 올려 둔다(여수 판은 0.60 대, 국토 마감 판은 0.90 대에서 만들어진다; 2026-08-27 레그 9–11).
  for (const q of [0.5, 0.6, 0.78, 0.9, 1]) await seek(page, q, 500);
  await page.waitForFunction(() => { const r = window.__scrub.plate(2); return !!(r && r.ready); }, null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2500);

  const at = async (e) => {
    await page.evaluate((x) => window.__scrub.seekEnd(x), e);
    await page.waitForTimeout(340);
    return page.evaluate(() => window.__scrub.end());
  };

  /* 1. 필름이 끝나는 자리에서는 아직 아무것도 그려지지 않는다(리드 구간). */
  await page.evaluate(() => window.__scrub.seek(1));
  await page.waitForTimeout(300);
  const lead = await page.evaluate(() => window.__scrub.end());
  expect(lead.e).toBe(0);
  expect(lead.wordmark.opacity).toBe(0);
  expect(lead.tagline).toBe(0);
  expect(lead.lockup).toBe(0);

  /* 2. 워드마크 기하 — 홍보영상 실측 그대로(수축이 끝난 스케일 1.000 기준). */
  const geo = (await at(0.22)).wordmark;
  expect(geo.widthPct).toBeCloseTo(0.31, 2);        // §2-1 폭 31.1 % 화면폭
  expect(geo.baselinePct).toBeCloseTo(0.568, 3);    // §2-1 베이스라인 56.8 % 화면높이

  /* 3. 인 방식은 **알파만** — 0.20 s 안에 0 → 1. 스케일 인·슬라이드 금지. */
  expect((await at(0.0)).wordmark.opacity).toBeLessThan(0.15);
  expect((await at(0.030)).wordmark.opacity).toBeGreaterThan(0.95);

  /* 4. 월드 부착 수축 — 워드마크가 화면에서 줄어드는 비율 = 지도가 줌아웃한 비율.
        두 값이 어긋나면 "로고가 붙었다"로 읽힌다. 같아야 "이 세계가 이 이름을 갖는다"다. */
  // 수축은 필름이 실제로 멈춘 자리(레그 11 끝 = A12 홀드)의 국토 판(plate 2, manifest.finale)에서 잰다 — 2026-08-27 레그 9–11 전에는 여수 판이었다.
  const zSpec = await page.evaluate(() => window.__scrub.manifest.finale.zoom);
  // 시작 표본은 수축(비트 C, e ≥ 0.0286)이 시작되기 **전**에 잰다 — 0.030 은 이미 C 안이라 지도가 0.005 만큼 물러나 있다
  // (트랙 11.08vh 의 px 반올림으로 e 가 0.0004 흔들리면 precision 2 를 넘긴다; 2026-08-27 kie-legs-8-8b).
  const a = await at(0.020);
  const zA = await page.evaluate(() => window.__scrub.plate(2).zoom);
  const b = await at(0.226);
  const zB = await page.evaluate(() => window.__scrub.plate(2).zoom);
  expect(zA).toBeCloseTo(zSpec, 2);                                  // 시작 = 인계 카메라
  expect(zB).toBeLessThan(zA - 0.3);                                 // 실제로 물러났다
  const wordShrink = b.wordmark.liveWidthPct / a.wordmark.liveWidthPct;
  const groundShrink = Math.pow(2, zB - zA);
  expect(wordShrink).toBeCloseTo(groundShrink, 2);                   // ← 같은 카메라
  expect(wordShrink).toBeLessThan(0.72);                             // −28 % 이상 물러난다
  expect(Math.floor(zB)).toBe(Math.floor(zSpec));                    // 타일 레벨은 넘지 않는다

  /* 5. 3단이 겹치지 않는다 — 어느 순간에도 켜져 있는 판은 최대 하나. */
  const marks = [];
  for (let i = 0; i <= 24; i++) {
    const st = await at(i / 24);
    marks.push([+(i / 24).toFixed(3), st.stage, +st.wordmark.opacity.toFixed(3), +st.tagline.toFixed(3), +st.lockup.toFixed(3)]);
    const lit = [st.wordmark.opacity, st.tagline, st.lockup].filter((v) => v > 0.02);
    expect(lit.length, `e=${(i / 24).toFixed(3)} 에서 겹침`).toBeLessThanOrEqual(1);
  }
  // 순서 — 워드마크가 먼저, 태그라인이 다음, 락업이 마지막.
  const firstOf = (k) => marks.findIndex((m) => m[k] > 0.5);
  expect(firstOf(2)).toBeGreaterThanOrEqual(0);
  expect(firstOf(3)).toBeGreaterThan(firstOf(2));
  expect(firstOf(4)).toBeGreaterThan(firstOf(3));

  /* 6. 마지막 화면 = LX 락업 + CTA(로그인). 워드마크·태그라인은 이미 없다. */
  const end = await at(1);
  expect(end.stage).toBe('lockup');
  expect(end.lockup).toBeGreaterThan(0.95);
  expect(end.wordmark.opacity).toBe(0);
  expect(end.tagline).toBe(0);
  expect(end.cta).toBeGreaterThan(0.95);
  const cta = page.locator('#sb-end-cta a');
  await expect(cta).toHaveText('로그인하고 시작하기');
  expect(await cta.getAttribute('href')).toBe('../login.html');
  await expect(page.locator('#sb-end-lx img')).toHaveAttribute('alt', 'LX 한국국토정보공사');

  /* 7. 마감 동안 크롬(마스트헤드·카피·계기판·항로)은 물러나 있다. */
  const chrome = await page.evaluate(() => ['.lx-masthead', '.sb-copy-layer', '.sb-inst', '.sb-route']
    .map((s) => +getComputedStyle(document.querySelector(s)).opacity));
  for (const o of chrome) expect(o).toBeLessThan(0.02);

  /* 8. End 키 — 마감의 시작으로 건너뛴다. */
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForTimeout(300);
  expect((await page.evaluate(() => window.__scrub.end())).on).toBe(false);
  await page.keyboard.press('End');
  await page.waitForTimeout(500);
  const jumped = await page.evaluate(() => window.__scrub.end());
  expect(jumped.on).toBe(true);
  expect(jumped.e).toBeLessThan(0.02);              // 마감의 **시작**이지 끝이 아니다

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
  // 14.404vh 트랙에서 마지막 레그 11(13.30vh~, index 12)은 1.6vh 반경 밖 — 아직 받지 않았다.
  expect(early[12].srcSet, '레그 11 은 아직이다').toBe(false);
  expect(reqs).not.toContain('w11');

  await seek(page, 0.985, 1200);
  const late = await stageState(page);
  expect(late[12].srcSet, '도착하면 받는다').toBe(true);
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
  // 포스터 13장이 그대로 서 있고, 카피는 읽힌다.
  const posters = await page.$$eval('.sc-world__poster', (n) => n.map((e) => e.naturalWidth > 0));
  expect(posters.length).toBeGreaterThanOrEqual(13);
  expect(posters.filter(Boolean).length).toBeGreaterThanOrEqual(13);
  expect(await page.textContent('.sb-h1')).toContain('국토는 매일');
  // 인계 판은 만들지 않는다(엔진 계약: reduced 에서는 지도도 띄우지 않는다).
  expect(await page.evaluate(() => window.__scrub.handoffActive())).toBe(false);

  // 브랜드 마감은 스크럽 없이 **정지 3줄**로 선다 — 워드마크 · 태그라인 · 락업이 한 번에.
  await page.evaluate(() => window.__scrub.seekEnd(0.6));
  await page.waitForTimeout(500);
  const st = await page.evaluate(() => {
    const s = window.__scrub.end();
    const h = document.getElementById('sb-end');
    return { on: s.on, tag: s.tagline, lx: s.lockup, cta: s.cta,
      static: h.classList.contains('is-static'),
      blur: getComputedStyle(h.querySelector('.sb-end__lx img')).filter };
  });
  expect(st.static).toBe(true);
  expect(st.on).toBe(true);
  expect(st.tag).toBe(1);
  expect(st.lx).toBe(1);
  expect(st.cta).toBe(1);
  expect(st.blur).toBe('none');
  expect(await page.textContent('#sb-end-tag')).toContain('공간을 읽고 미래를 설계합니다.');
  expect(errors, '콘솔 오류').toEqual([]);
  await ctx.close();
});

test('소품 — 드론 오버레이는 레그 04 창 안에서만 서고, 스크롤을 따라 움직인다 (2026-08-27 스파이크)', async ({ page }) => {
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
