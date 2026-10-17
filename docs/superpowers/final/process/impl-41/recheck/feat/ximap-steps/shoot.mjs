/* 구현 39 · XI맵 단계 나누기 · 지금+C · '통계' 단추 · 칸 조절 · 마우스 · 겹침 · 클래스 색 · 클래스 켜끄기 — 증거(바깥 주소 · 로그인 폼 LX 직원 한 번 · 세션 주입 0).
   node docs/superpowers/final/process/impl-39/ximap-steps/shoot.mjs   (01. 디자인 에서)   ONLY=steps,panes,now,objects,classes,video(쉼표)
   → shots/*.png(파일 끝 네 자리 = 찍은 시각) · run.json · ximap-steps-20s.mp4 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';

const ROOT = 'E:/Land-XI 플랫폼/01. 디자인';
const HW = 'C:/Users/User/AppData/Local/ms-playwright';
if (fs.existsSync(HW)) process.env.PLAYWRIGHT_BROWSERS_PATH = HW;
if (!process.env.DEV_PASSWORD) { const m = fs.readFileSync(path.join(ROOT, 'server/.env'), 'utf8').match(/^DEV_PASSWORD=(.*?)\s*$/m); if (m) process.env.DEV_PASSWORD = m[1]; }
process.env.LX_PW ||= process.env.DEV_PASSWORD;
const { chromium } = createRequire(path.join(ROOT, 'package.json'))('playwright');
const { frontDoor } = await import(pathToFileURL(path.join(ROOT, 'landxi/v3/kit/lint/forbidden.mjs')).href);
const DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(DIR, 'shots'), VID = path.join(DIR, 'video-raw');
fs.mkdirSync(OUT, { recursive: true });
const APP = process.env.APP || 'https://app.land-xi.dev';
const ONLY = new Set((process.env.ONLY || 'steps,panes,now,objects,classes,video').split(','));
const QS = [['q1', '남원시 비닐하우스 현황 보여줘'], ['q2', '남원시 현황 보여 줘'], ['q3', '전국 분석 얼마나 진행됐어?']];
const kst = () => new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' });
const hm = () => kst().slice(11, 16).replace(':', '');
const RF = path.join(DIR, 'run.json');
const prev = fs.existsSync(RF) ? JSON.parse(fs.readFileSync(RF, 'utf8')) : {};
const run = { ...prev, at: kst(), app: APP, shots: prev.shots || {}, errors: [], local: [], bad: [], steps: prev.steps || {}, panes: prev.panes || {}, now: prev.now || {}, objects: {}, classes: {}, fps: prev.fps || {}, runs: [...(prev.runs || []), { at: kst(), only: [...ONLY] }] };
const save = () => fs.writeFileSync(RF, JSON.stringify(run, null, 1));
const guard = setTimeout(() => { run.timeout = true; save(); process.exit(2); }, 1500000);

const browser = await chromium.launch({ channel: 'chrome', headless: true, ...(process.env.SOFT ? { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } : {}) });   // 기본 = 하드웨어 GL(fps 재기) · SOFT=1 이면 소프트웨어
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...(ONLY.has('video') ? { recordVideo: { dir: VID, size: { width: 1440, height: 900 } } } : {}) });
const T0 = Date.now();
const p = await ctx.newPage();
p.on('console', (m) => { if (m.type() === 'error') run.errors.push(`${kst().slice(11)} ${m.text().slice(0, 300)}`); });
p.on('pageerror', (e) => run.errors.push(`${kst().slice(11)} pageerror ${String(e).slice(0, 300)}`));
p.on('request', (r) => { if (/\/\/(127\.0\.0\.1|localhost|\[::1\])|:8700|:4173/.test(r.url())) run.local.push(r.url()); });
p.on('response', (r) => { if (r.status() >= 400 && !/favicon/.test(r.url())) run.bad.push(`${kst().slice(11)} ${r.status()} ${r.url().replace(/[?#].*$/, '').slice(0, 160)}`); });
const W = () => p.viewportSize().width;
const shot = async (name) => { const f = `${name}-${W()}-${hm()}.png`; await p.screenshot({ path: path.join(OUT, f) }); run.shots[f] = kst(); return f; };
const settle = () => p.waitForFunction(() => !window.__xc.map.isMoving() && window.__xc.map.areTilesLoaded(), null, { timeout: 25000 }).catch(() => {});
const ready = () => window.__xc?.board?.nat?.layers?.length > 0 && window.__xc.boot?.shown && document.querySelector('.k-chat-root[data-dock]');
const fps = (ms) => p.evaluate((ms) => new Promise((res) => { let n = 0; const t0 = performance.now(); (function f() { n++; if (performance.now() - t0 < ms) requestAnimationFrame(f); else res(Math.round((n * 1000) / (performance.now() - t0))); })(); }), ms);
const say = async (q) => { const inp = p.locator('.k-chat-root[data-dock] .k-ck-i'); await inp.click(); await inp.fill(''); await inp.pressSequentially(q, { delay: 15 }); await inp.press('Enter'); };
const state = () => p.evaluate(() => ({ dash: window.__xc.dash, statStep: window.__xc.statStep, sw: [...document.querySelectorAll('.xo-sw button')].map((b) => [b.textContent, b.getAttribute('aria-pressed')]),
  swHidden: document.querySelector('.xo-sw')?.hidden ?? null, mini: !document.querySelector('.xo-mini')?.hidden, miniText: document.querySelector('.xo-mini')?.innerText.replace(/\s+/g, ' ').trim() || '',
  panelW: Math.round(document.querySelector('.xo')?.getBoundingClientRect().width || 0), panelCollapsed: !!document.querySelector('.xo.pn-collapsed'), xoVar: getComputedStyle(document.querySelector('.k-main')).getPropertyValue('--xo-w').trim(),
  dashOn: !(document.querySelector('.xd')?.hidden ?? true), mapW: Math.round(document.querySelector('.xc-stage')?.getBoundingClientRect().width || 0), xdVar: getComputedStyle(document.querySelector('.k-main')).getPropertyValue('--xd-map').trim(),
  tags: document.querySelectorAll('.xo-tag').length, handles: [...document.querySelectorAll('.pn-h')].map((e) => [e.className, e.hidden]),
  next: [...document.querySelectorAll('.k-chat-btn[data-q]')].map((b) => b.dataset.q).slice(-4), zoom: +window.__xc.map.getZoom().toFixed(2)}));
const waitStep = (n, ms = 30000) => p.waitForFunction((n) => window.__xc.statStep === n && (n === 3 ? !document.querySelector('.xd').hidden : window.__xc.dash?.step === n), n, { timeout: ms }).then(() => true, () => false);
const smallFonts = () => p.evaluate(() => { const out = []; for (const el of document.querySelectorAll('.xo *, .xo-mini *, .xo-sw *, .xe-pick *, .xc-ovl, .xc-pop *')) { if (!el.textContent.trim() || el.children.length) continue; const r = el.getBoundingClientRect(); if (!r.width) continue; const fs = parseFloat(getComputedStyle(el).fontSize); if (fs < 14) out.push([el.className, fs, el.textContent.trim().slice(0, 20)]); } return out; });

async function home(q = '') {
  await p.goto(APP + '/landxi/v3/xi-clean/' + q, { waitUntil: 'commit' });
  await p.waitForFunction(ready, null, { timeout: 90000, polling: 100 });
  await settle(); await p.waitForTimeout(1500);
}
/** 질문 → 1단계(지도에만) 기록 · fps */
async function ask(id, q) {
  await p.evaluate(() => { window.__xc.dash = null; });
  const t = Date.now();
  await say(q);
  const ok = await p.waitForFunction(() => window.__xc.dash?.mode === 'map' && window.__xc.dash.fill === 'running', null, { timeout: 90000 }).then(() => true, () => false);
  if (!ok) { run.steps[id] = { q, fail: true, ...(await state().catch(() => ({}))) }; await shot(id + '-fail'); return false; }
  const f = fps(1400);
  await p.waitForFunction(() => window.__xc.dash?.fill === 'done', null, { timeout: 30000 }).catch(() => {});
  run.fps[`${id}-fill-${W()}`] = await f;
  await settle(); await p.waitForTimeout(1000);
  run.steps[id] = { q, at: kst(), t_ms: Date.now() - t, step1: await state() };
  return true;
}

await frontDoor(p, APP, 'test@lx.or.kr', 'app');
await p.waitForURL((u) => !/\/login\/?$/.test(u.pathname), { timeout: 30000 });
run.login_at = kst();
await home();
run.home = await p.evaluate(() => ({ showcase: window.__xc.showcase, bubbles: document.querySelectorAll('.xs-c-bub').length, hudVariantSwitch: !!document.querySelector('.xv-sw:not([hidden])'), statSwitchHidden: document.querySelector('.xo-sw')?.hidden }));
await shot('home-nowC');

/* ── 단계 1 → 2 → 3 → 2 → 1 (질문 셋) ── */
if (ONLY.has('steps')) {
  for (const [id, q] of QS) {
    run.video_q1_at ??= (Date.now() - T0) / 1000;
    if (!(await ask(id, q))) continue;
    await shot(id + '-s1-maponly');
    // 2단계 — 한 줄 '통계 보기'
    await p.locator('.xo-mini-b').click();
    await waitStep(2); await p.waitForTimeout(900);
    run.steps[id].step2 = await state(); run.steps[id].small2 = await smallFonts();
    await shot(id + '-s2-panel');
    // 3단계 — 판 '크게 보기'
    await p.locator('.xo-big2').click();
    await waitStep(3); await p.waitForTimeout(1400);
    run.steps[id].step3 = await state();
    await shot(id + '-s3-dash');
    // 되돌아가기 3 → 2('지도로 돌아가기') → 1('지도만')
    await p.locator('.xd-back').click();
    await waitStep(2); await p.waitForTimeout(900);
    run.steps[id].back2 = await state();
    if (id === 'q1') await shot(id + '-s2-back');
    await p.locator('.xo-only').click();
    await waitStep(1); await p.waitForTimeout(600);
    run.steps[id].back1 = await state();
    if (id === 'q1') await shot(id + '-s1-back');
    // '통계' 단추로 바로 3단계 → 단추 상태 · 그리고 2단계로
    await p.locator('.xo-sw button[data-v="dash"]').click();
    await waitStep(3); await p.waitForTimeout(800);
    run.steps[id].sw3 = (await state()).sw;
    await p.locator('.xo-sw button[data-v="map"]').click();
    await waitStep(2); await p.waitForTimeout(600);
    run.steps[id].sw2 = (await state()).sw;
    if (id === 'q1') {
      // 답 끝 '통계 보기' · '크게 보기' 단추(서버 next) — 눌러 2 · 3단계로(새 질문 아님)
      await p.locator('.xo-only').click(); await waitStep(1);
      const fold = p.locator('.k-chat-root[data-dock]'); await fold.locator('.k-ck-i').click().catch(() => {});
      const nb = p.locator('.k-chat-btn[data-q="통계 보기"]').last();
      run.steps[id].nextBtns = await p.evaluate(() => [...document.querySelectorAll('.k-chat-btn[data-q]')].map((b) => b.dataset.q));
      if (await nb.count()) { const turns = await p.evaluate(() => document.querySelectorAll('.k-chat-msg.me').length); await nb.click(); run.steps[id].nextClick = { ok: await waitStep(2), newTurn: (await p.evaluate(() => document.querySelectorAll('.k-chat-msg.me').length)) - turns }; await shot(id + '-s2-from-answer'); }
    }
    if (id === 'q3') { run.video_q3_end = (Date.now() - T0) / 1000; }
    // 닫기(한 줄 ×) → 0단계 · 단추 숨음
    await p.locator('.xo-only').click().catch(() => {}); await waitStep(1, 8000);
    await p.locator('.xo-mini .xo-x').click();
    await p.waitForFunction(() => window.__xc.statStep === 0, null, { timeout: 10000 }).catch(() => {});
    run.steps[id].closed = await state();
    await settle();
    save();
  }
}

/* ── 칸 끌기 · 접기(공용 부품 panes) ── */
if (ONLY.has('panes')) {
  if (await ask('p1', QS[0][1])) {
    await p.locator('.xo-mini-b').click(); await waitStep(2); await p.waitForTimeout(700);
    const before = await state(); await shot('pane-panel-before');
    const hb = await p.locator('.pn-h--left').boundingBox();
    if (hb) { const x = hb.x + hb.width / 2, y = hb.y + hb.height / 2; await p.mouse.move(x, y); await p.mouse.down(); await p.mouse.move(x - 60, y, { steps: 6 }); await p.mouse.move(x - 160, y, { steps: 8 }); await p.mouse.up(); }
    await p.waitForTimeout(600);
    const after = await state(); await shot('pane-panel-after');
    run.panes.panel = { before: before.panelW, after: after.panelW, varBefore: before.xoVar, varAfter: after.xoVar, handle: !!hb };
    // 접기(손잡이 단추) → 1단계 한 줄 · 펼치기 → 2단계
    await p.locator('.pn-h--left .pn-fold').hover(); await p.locator('.pn-h--left .pn-fold').click();
    await waitStep(1, 8000); await p.waitForTimeout(500);
    run.panes.foldToStep1 = (await state()).statStep; await shot('pane-panel-folded');
    await p.locator('.pn-h--left .pn-fold').click();
    await waitStep(2, 8000); await p.waitForTimeout(500);
    run.panes.unfoldToStep2 = (await state()).statStep;
    // 대시보드 지도 칸
    await p.locator('.xo-big2').click(); await waitStep(3); await p.waitForTimeout(1500);
    const b3 = await state(); await shot('pane-dash-before');
    const hd = await p.locator('.pn-h--right').boundingBox();
    if (hd) { const x = hd.x + hd.width / 2, y = hd.y + hd.height / 2; await p.mouse.move(x, y); await p.mouse.down(); await p.mouse.move(x + 80, y, { steps: 6 }); await p.mouse.move(x + 220, y, { steps: 8 }); await p.mouse.up(); }
    await p.waitForTimeout(900);
    const a3 = await state(); await shot('pane-dash-after');
    run.panes.dash = { before: b3.mapW, after: a3.mapW, varBefore: b3.xdVar, varAfter: a3.xdVar, handle: !!hd };
    await p.locator('.pn-h--right .pn-fold').hover(); await p.locator('.pn-h--right .pn-fold').click(); await p.waitForTimeout(900);
    run.panes.dashFolded = (await state()).mapW; await shot('pane-dash-folded');
    await p.locator('.pn-h--right .pn-fold').click(); await p.waitForTimeout(700);
    // 다시 열어도 기억(2단계 판 폭)
    await p.locator('.xd-back').click(); await waitStep(2); await p.waitForTimeout(700);
    run.panes.remembered = (await state()).panelW;
    // 1920
    await p.setViewportSize({ width: 1920, height: 1080 }); await p.waitForTimeout(1200); await settle();
    run.steps.q1_1920 = { step2: await state() }; await shot('q1-s2-panel');
    await p.locator('.xo-only').click(); await waitStep(1); await p.waitForTimeout(600); await shot('q1-s1-maponly');
    await p.locator('.xo-sw button[data-v="dash"]').click(); await waitStep(3); await p.waitForTimeout(1400); run.steps.q1_1920.step3 = await state(); await shot('q1-s3-dash');
    await p.locator('.xd-back').click(); await waitStep(2); await p.locator('.xo .xo-x').click();
    await p.waitForFunction(() => window.__xc.statStep === 0, null, { timeout: 10000 }).catch(() => {});
    await p.setViewportSize({ width: 1440, height: 900 }); await p.waitForTimeout(800); await settle();
    save();
  }
}

/* ── 지금 + C — 왼쪽 위 숫자 · 업무 줄에 올리면 빛 줄기 ── */
if (ONLY.has('now')) {
  await home();
  run.now.home = await p.evaluate(() => ({ showcase: window.__xc.showcase, bubbles: [...document.querySelectorAll('.xs-c-bub span')].map((s) => s.textContent) }));
  const big = p.locator('.xb-hud .xb-big');
  if (await big.count()) { await big.hover(); await p.waitForTimeout(500); run.now.hoverBig = await p.evaluate(() => ({ ...window.__xc.showcase, streakEls: document.querySelectorAll('.xs-n-svg .xs-a-st').length })); run.fps['now-hover-big'] = await fps(1500); await shot('now-hover-big'); }
  // 지역으로 내려가 업무 줄에 올림(그 업무만 지도에 · 줄기 그 줄로)
  await p.evaluate(() => { const c = window.__xc.board?.hot; if (c) window.__xc.map.jumpTo({ center: c, zoom: 9.6 }); });
  await p.waitForFunction(() => document.querySelectorAll('.xb-hud .xb-rows li[data-k]').length > 0, null, { timeout: 20000 }).catch(() => {});
  await settle(); await p.waitForTimeout(800);
  const row = p.locator('.xb-hud .xb-rows li[data-k]').first();
  if (await row.count()) {
    const k = await row.getAttribute('data-k');
    await row.hover(); await p.waitForTimeout(600);
    run.now.hoverRow = { k, ...(await p.evaluate(() => ({ ...window.__xc.showcase, task: window.__xc.task, streakEls: document.querySelectorAll('.xs-n-svg .xs-a-st').length }))) };
    run.fps['now-hover-row'] = await fps(1500);
    await shot('now-hover-row');
    await p.mouse.move(700, 450); await p.waitForTimeout(400);
    run.now.afterLeave = await p.evaluate(() => ({ hot: window.__xc.showcase?.hot, task: window.__xc.task, streakEls: document.querySelectorAll('.xs-n-svg .xs-a-st').length }));
  }
  save();
}

/* ── 객체 — 마우스 모양 · 겹침 고르기 · 클래스 바꾸기 색(시험 고치기 · 되돌림) ── */
if (ONLY.has('objects')) try {
  await home('?test=1');
  await p.evaluate(() => { const c = window.__xc.board?.hot; if (c) window.__xc.map.jumpTo({ center: c, zoom: 14.6 }); });
  await p.waitForFunction(() => window.__xc.map.areTilesLoaded() && !window.__xc.map.isMoving(), null, { timeout: 30000 }).catch(() => {});
  await p.waitForTimeout(2500);
  // 화면을 훑어 객체가 있는 점 · 겹친 점을 찾는다(화면 좌표 → 지도 캔버스 기준)
  const scan = await p.evaluate(() => {
    const cv = window.__xc.map.getCanvas().getBoundingClientRect(); const out = { one: null, many: null, n: 0 };
    for (let y = 120; y < cv.height - 140 && !(out.one && out.many); y += 18) for (let x = 480; x < cv.width - 140; x += 18) { const hs = window.__xc.objectsAt(x, y); if (!hs.length) continue; out.n++; if (hs.length >= 2 && !out.many) out.many = { x: x + cv.left, y: y + cv.top, hs }; if (hs.length === 1 && !out.one) out.one = { x: x + cv.left, y: y + cv.top, hs }; if (out.one && out.many) break; }
    return out;
  });
  run.objects.scan = { found: scan.n, one: scan.one?.hs, many: scan.many?.hs };
  // 빈 지도 위 마우스 = 기본 · 객체 위 = 손가락
  await p.mouse.move(60, 460); await p.waitForTimeout(350);
  run.objects.cursorEmpty = await p.evaluate(() => ({ canvas: window.__xc.map.getCanvas().style.cursor, computed: getComputedStyle(window.__xc.map.getCanvas()).cursor, hover: window.__xc.objHover }));
  if (scan.one) {
    await p.mouse.move(scan.one.x, scan.one.y); await p.waitForTimeout(400);
    run.objects.cursorObject = await p.evaluate(() => ({ canvas: window.__xc.map.getCanvas().style.cursor, hover: window.__xc.objHover, badge: !document.querySelector('.xc-ovl').hidden }));
    await shot('obj-hover-pointer');
  }
  if (scan.many) {
    await p.mouse.move(scan.many.x, scan.many.y); await p.waitForTimeout(400);
    run.objects.overlapHover = await p.evaluate(() => ({ hover: window.__xc.objHover, badge: document.querySelector('.xc-ovl').textContent, badgeShown: !document.querySelector('.xc-ovl').hidden }));
    await shot('obj-overlap-hover');
    await p.mouse.click(scan.many.x, scan.many.y); await p.waitForTimeout(500);
    run.objects.picker = await p.evaluate(() => [...document.querySelectorAll('.xe-pick-r')].map((b) => b.innerText.replace(/\s+/g, ' ').trim()));
    await shot('obj-overlap-pick');
    await p.locator('.xe-pick-r').first().click(); await p.waitForTimeout(1200);
    run.objects.pickedCard = await p.evaluate(() => document.querySelector('.xe-card:not([hidden]) h3')?.textContent || null);
    await shot('obj-overlap-picked');
    await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  }
  // 클래스 바꾸기(시험) → 즉시 새 클래스 색 · 원래 객체 숨김 → 되돌리기
  const at = scan.one || scan.many;
  if (at) {
    await p.mouse.click(at.x, at.y); await p.waitForTimeout(1500);
    const before = await p.evaluate(() => ({ cls: document.querySelector('.xe-card:not([hidden]) h3')?.textContent, hist: document.querySelectorAll('.xe-hist li').length }));
    const btn = p.locator('.xe-card .xe-act button', { hasText: '클래스 바꾸기' });
    if (await btn.count() && before.cls) {
      await btn.click(); await p.waitForTimeout(1500);
      const chip = p.locator('.xe-card .xe-chip').first();
      run.objects.reclass = { before: before.cls, options: await p.evaluate(() => [...document.querySelectorAll('.xe-card .xe-chip')].map((c) => c.textContent)) };
      if (await chip.count()) {
        const to = await chip.textContent();
        await chip.click();
        await p.waitForFunction(() => (window.__xc.map.getSource('xe-live')?._data?.features || []).some((f) => f.properties.action === 'reclass'), null, { timeout: 20000 }).catch(() => {});
        await p.waitForTimeout(1200);
        run.objects.reclass.after = await p.evaluate(() => {
          const m = window.__xc.map, fs = (m.getSource('xe-live')?._data?.features || []).filter((f) => f.properties.action === 'reclass');
          const f = fs[0]; const rendered = m.queryRenderedFeatures({ layers: ['xe-live-fill'] }).length;
          // 원래 객체가 결과 층에서 숨었나 — 그 묶음 층에서 같은 id 가 그려지는지
          let origShown = null;
          if (f) { const ids = [...m.getStyle().layers.map((l) => l.id)].filter((l) => /^(xb-r-|xn-o-).*-(fill|f)$/.test(l) && m.getLayer(l)); const hit = m.queryRenderedFeatures({ layers: ids }).filter((x) => String(x.properties?.id ?? x.id) === String(f.properties.fid)); origShown = hit.length; }
          return { cls: document.querySelector('.xe-card:not([hidden]) h3')?.textContent, liveN: fs.length, col: f?.properties.col, set: f?.properties.set, renderedFill: rendered, origShown, hidden: !!(f && f.properties.col) };
        });
        run.objects.reclass.to = to;
        await shot('obj-reclass-color');
        // 되돌리기 — 카드 이력 줄
        const undo = p.locator('.xe-card .xe-undo').first();
        if (await undo.count()) { await undo.click(); await p.waitForTimeout(1500); run.objects.reclass.undone = await p.evaluate(() => ({ cls: document.querySelector('.xe-card:not([hidden]) h3')?.textContent, liveN: (window.__xc.map.getSource('xe-live')?._data?.features || []).filter((f) => f.properties.action === 'reclass').length })); await shot('obj-reclass-undone'); }
      }
    }
    await p.keyboard.press('Escape');
  }
  save();
} catch (e) { run.objects.error = String(e).slice(0, 300); save(); }

/* ── 클래스 켜기/끄기(층 판 체크박스) ── */
if (ONLY.has('classes')) try {
  if (!ONLY.has('objects')) { await home(); await p.evaluate(() => { const c = window.__xc.board?.hot; if (c) window.__xc.map.jumpTo({ center: c, zoom: 12.4 }); }); }
  else await p.evaluate(() => { window.__xc.map.jumpTo({ center: window.__xc.map.getCenter(), zoom: 12.4 }); });
  await p.waitForFunction(() => window.__xc.map.areTilesLoaded() && !window.__xc.map.isMoving(), null, { timeout: 30000 }).catch(() => {});
  await p.waitForTimeout(1500);
  const hudBefore = await p.evaluate(() => document.querySelector('.xb-hud')?.innerText.replace(/\s+/g, ' ').trim());
  await p.locator('.xc-tool[data-tool="layers"]').click(); await p.waitForTimeout(600);
  run.classes.rows = await p.evaluate(() => [...document.querySelectorAll('.xc-row--cls')].map((b) => [b.dataset.cls, b.getAttribute('aria-checked')]));
  run.classes.small = await smallFonts();
  await shot('cls-panel');
  const first = p.locator('.xc-row--cls').first();
  if (await first.count()) {
    const c = await first.getAttribute('data-cls');
    await first.click(); await p.waitForTimeout(1200);
    run.classes.off = { cls: c, clsOff: await p.evaluate(() => window.__xc.clsOff), hudBefore, hudAfter: await p.evaluate(() => document.querySelector('.xb-hud')?.innerText.replace(/\s+/g, ' ').trim()),
      rendered: await p.evaluate((c) => { const m = window.__xc.map; const ids = m.getStyle().layers.map((l) => l.id).filter((l) => /^(xb-r-|xn-o-|xn-).*-(fill|f|face)$/.test(l) && m.getLayer(l) && m.getLayoutProperty(l, 'visibility') !== 'none'); const fs = m.queryRenderedFeatures({ layers: ids }); return { total: fs.length, ofCls: fs.filter((f) => f.properties?.cls === c).length }; }, c) };
    await shot('cls-off-map');
    await first.click(); await p.waitForTimeout(800);
    run.classes.on = { clsOff: await p.evaluate(() => window.__xc.clsOff), hud: await p.evaluate(() => document.querySelector('.xb-hud')?.innerText.replace(/\s+/g, ' ').trim()) };
  }
  await p.keyboard.press('Escape');
  save();
} catch (e) { run.classes.error = String(e).slice(0, 300); save(); }

run.end = kst();
await ctx.close();
await browser.close();
/* 녹화 → 20초(첫 질문 → 1 · 2 · 3단계) */
if (ONLY.has('video') && fs.existsSync(VID)) {
  const src = fs.readdirSync(VID).filter((f) => f.endsWith('.webm')).map((f) => path.join(VID, f)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
  if (src) {
    const ss = Math.max(0, (run.video_q1_at || 0) - 0.5), out = path.join(DIR, 'ximap-steps-20s.mp4');
    try { execFileSync('ffmpeg', ['-y', '-ss', ss.toFixed(1), '-i', src, '-t', '20', '-vf', 'scale=1280:-2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '28', '-an', out], { stdio: 'ignore' }); run.video = { out: path.basename(out), from_s: ss, len_s: 20 }; } catch (e) { run.video = { error: String(e).slice(0, 200) }; }
  }
}
save();
clearTimeout(guard);
console.log(JSON.stringify({ errors: run.errors.length, bad: run.bad.length, local: run.local.length, shots: Object.keys(run.shots).length, fps: run.fps }, null, 1));
