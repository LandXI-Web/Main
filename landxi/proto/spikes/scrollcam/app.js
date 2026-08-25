/* SPIKE 셸 — MapLibre 한 대의 카메라를 레일이 구동한다.

   스크롤 배선에 대한 결정(중요):
   Lenis 는 **페이지**를 부드럽게 하고, 레일은 **카메라**를 부드럽게 한다. 둘을 직렬로 걸면
   지연이 두 번 쌓여 "무겁다"가 아니라 "느리다"가 된다. 그래서 레일은 Lenis 의 *평활값*이 아니라
   *목표값*(lenis.targetScroll)을 읽는다 — 스무딩은 정확히 한 번만 일어난다.
   ScrollTrigger 는 폴백 진행값과 챕터 트리거에 쓴다. */

import { createRail, lenisScroller, mapApply } from './scrollcam.js';
import { KEYS, CHAPTERS, MARKS } from './rail-config.js';
import { createMapDemo } from './demo-map.js';

const $ = (s) => document.querySelector(s);
const reducedOS = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ── Lenis + ScrollTrigger ── */
gsap.registerPlugin(ScrollTrigger);
const lenis = new Lenis({ lerp: reducedOS ? 1 : 0.1, duration: 1.2, smoothWheel: !reducedOS });
lenis.on('scroll', ScrollTrigger.update);
gsap.ticker.add((t) => lenis.raf(t * 1000));
gsap.ticker.lagSmoothing(0);

const limit = () => Math.max(1, document.documentElement.scrollHeight - innerHeight);
let stProgress = 0;
ScrollTrigger.create({
  trigger: '#scroller', start: 'top top', end: 'bottom bottom',
  onUpdate: (self) => { stProgress = self.progress; },
});

/* ── 지도 ── */
const mapDemo = createMapDemo('map');
const PLATES = mapDemo.PLATES;

/* ── 레일 ── */
let gateOn = true, terrainOn = false;
const rail = createRail({
  keyframes: KEYS,
  chapters: CHAPTERS,
  scrollTo: lenisScroller(lenis),
  gate: () => (gateOn ? mapDemo.tilesReady() : true),
  onChapter: (i) => {
    document.querySelectorAll('#copy .ch').forEach((el, j) => el.classList.toggle('on', j === i));
  },
});

/* 카메라 구독자 — 투영 전환과 지형을 카메라와 같은 프레임에서 처리한다.
   (전환을 별도 콜백/타이머로 미루면 한 프레임 어긋난 화면이 반드시 눈에 띈다.) */
const jump = mapApply(mapDemo.map);
rail.subscribe((s) => {
  mapDemo.projection(s.zoom, s.center[1]);
  jump(s);
  const exag = terrainOn && s.zoom > 6.2 && s.zoom < 12.6 ? 1.4 * (1 - Math.max(0, (s.zoom - 11.4) / 1.2)) : 0;
  mapDemo.setTerrain(terrainOn, exag);
});

/* ── HUD ── */
const hud = {
  fps: $('#m-fps'), lat: $('#m-lat'), jit: $('#m-jit'), gate: $('#m-gate'),
  worst: $('#m-worst'), app: $('#m-app'),
  p: $('#c-p'), c: $('#c-c'), z: $('#c-z'), tb: $('#c-tb'), proj: $('#c-proj'),
  bar: $('#rail i'), rp: $('#rail-p'),
};
const set = (el, v, bad) => { if (el.textContent !== v) el.textContent = v; el.className = bad === undefined ? '' : (bad ? 'bad' : 'ok'); };

rail.subscribe((s) => {
  hud.bar.style.width = (s.p * 100).toFixed(2) + '%';
  hud.rp.textContent = s.p.toFixed(3);
  set(hud.p, s.p.toFixed(4));
  set(hud.c, `${s.center[0].toFixed(4)}, ${s.center[1].toFixed(4)}`);
  set(hud.z, s.zoom.toFixed(3));
  set(hud.tb, `${s.pitch.toFixed(1)}° / ${((s.bearing % 360 + 540) % 360 - 180).toFixed(1)}°`);
  set(hud.proj, `${mapDemo.isGlobe ? 'globe' : 'mercator'} · ${s.focus ? '판' : '레일'}`);
});

setInterval(() => {
  const m = rail.metrics();
  set(hud.fps, m.fps.toFixed(0), m.fps < 55);
  set(hud.lat, `${m.latency.p50} / ${m.latency.p95} ms`, m.latency.p95 > 32);
  const j = Math.max(m.jitter.zoom, m.jitter.bearing, m.jitter.center);
  set(hud.jit, j === 0 ? '0 (없음)' : j.toExponential(1), j > 1e-6);
  set(hud.gate, `${m.gate.ms} ms · ${m.gate.frames}f`);
  set(hud.worst, m.worstFrameMs + ' ms', m.worstFrameMs > 32);
  set(hud.app, `${m.applies} / ${m.skipped}`);
}, 400);

/* ── 결과 판 — 클릭하면 카메라가 실제 지점으로 난다 ────────────────
   dive.js 의 flyTo + camHold 조합을 레일 안으로 들여온 것이다. 타일 게이트가
   비행 속도에도 걸리므로 "도착했는데 흐림" 대신 "조금 늦게, 선명하게" 가 된다. */
$('#plates').innerHTML = PLATES.map((p) =>
  `<button data-id="${p.id}">${p.ko}<em>z${p.zoom} · ${p.pitch}°</em></button>`).join('');
let activePlate = null;
document.querySelectorAll('#plates button').forEach((b) => {
  b.onclick = () => {
    const p = PLATES.find((x) => x.id === b.dataset.id);
    activePlate = p.id;
    document.querySelectorAll('#plates button').forEach((x) => x.classList.toggle('on', x === b));
    mapDemo.showPlate(p.id);
    rail.focus(p, 1900);
  };
});
rail.subscribe((s) => {
  if (activePlate && !s.focus) {          // 스크롤이 판을 놓아줬다
    activePlate = null;
    document.querySelectorAll('#plates button').forEach((x) => x.classList.remove('on'));
    mapDemo.showPlate(null);
  }
});

/* ── 컨트롤 ── */
$('#o-tension').onchange = (e) => rail.setOption('tension', e.target.checked ? 1 : 0);
$('#o-warp').onchange = (e) => rail.setOption('screenSpace', e.target.checked);
$('#o-join').onchange = (e) => rail.setOption('join', e.target.checked ? 0.006 : 0);
$('#o-magnet').onchange = (e) => rail.setOption('magnet', { enabled: e.target.checked });
$('#o-gate').onchange = (e) => { gateOn = e.target.checked; };
$('#o-terrain').onchange = (e) => { terrainOn = e.target.checked; rail.resetMetrics(); };
$('#o-reduced').onchange = (e) => { rail.setOption('lerp', e.target.checked ? 1 : 0.10); rail.setOption('lerpFast', e.target.checked ? 1 : 0.24); };
$('#b-play').onclick = () => rail.play(0, 1, 20000, 'power1.inOut');
$('#b-reset').onclick = () => rail.resetMetrics();

/* ── 부팅 ── */
await mapDemo.ready();
rail.seek(0);
rail.start();

let ticks = 0;
gsap.ticker.add(() => {
  // 레일의 목표값은 Lenis 의 *목표* 스크롤에서 온다(이중 스무딩 방지).
  const y = (lenis.targetScroll != null ? lenis.targetScroll : (window.scrollY || 0));
  rail.setProgress(y / limit());
  if (++ticks === 4) { $('#boot').classList.add('gone'); document.body.dataset.ready = '1'; }
});

/* ── 계측 도구 (Playwright 에서 호출한다) ── */
const settle = (ms = 900) => new Promise((r) => setTimeout(r, ms));

window.__rail = {
  rail, lenis, map: mapDemo.map, MARKS, CHAPTERS, PLATES,
  seek(p) { lenisScroller(lenis)(p, 0); rail.seek(p); },
  play: (a, b, ms) => rail.play(a, b, ms, 'power1.inOut'),
  plate: (id) => document.querySelector(`#plates button[data-id="${id}"]`).click(),
  metrics: () => rail.metrics(),
  reset: () => rail.resetMetrics(),
  errors: () => mapDemo.errors,
  setOption: (k, v) => rail.setOption(k, v),
  at: (p) => rail.at(p),
  applyAt: (p) => rail.applyAt(p),

  /* 글로브 ↔ 메르카토르 축척 불연속을 실제로 잰다.
     같은 center/zoom 에서 화면 가로 절반이 덮는 지상 거리(도 단위)를 두 투영에서 비교한다. */
  async measureProjectionPop(zoom = 5.6, center = [127.7, 36.1]) {
    const map = mapDemo.map;
    const span = () => {
      const w = map.getContainer().clientWidth, h = map.getContainer().clientHeight;
      const a = map.unproject([w * 0.25, h / 2]), b = map.unproject([w * 0.75, h / 2]);
      return Math.abs(b.lng - a.lng);
    };
    const out = { zoom, lat: center[1] };
    map.setProjection({ type: 'globe' }); map.jumpTo({ center, zoom, pitch: 0, bearing: 0 });
    await settle(700); out.globeSpanDeg = +span().toFixed(5);
    map.setProjection({ type: 'mercator' }); map.jumpTo({ center, zoom, pitch: 0, bearing: 0 });
    await settle(700); out.mercatorSpanDeg = +span().toFixed(5);
    out.ratio = +(out.globeSpanDeg / out.mercatorSpanDeg).toFixed(4);
    out.zoomLevels = +Math.log2(out.ratio).toFixed(4);
    out.predicted_1overCosLat = +(1 / Math.cos(center[1] * Math.PI / 180)).toFixed(4);
    return out;
  },

  /* jumpTo 비용 — 호출 자체와 프레임 전체를 나눠 잰다. */
  async measureJumpCost(n = 240) {
    const map = mapDemo.map;
    let t0 = performance.now();
    for (let i = 0; i < n; i++) {
      const s = rail.at(0.62 + (i / n) * 0.0004);
      map.jumpTo({ center: s.center, zoom: s.zoom, pitch: s.pitch, bearing: s.bearing });
    }
    const callMs = (performance.now() - t0) / n;
    t0 = performance.now(); let frames = 0;
    await new Promise((res) => {
      const step = () => {
        const s = rail.at(0.62 + (frames / 120) * 0.0006);
        map.jumpTo({ center: s.center, zoom: s.zoom, pitch: s.pitch, bearing: s.bearing });
        if (++frames >= 120) return res();
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
    const frameMs = (performance.now() - t0) / frames;
    return { callMs: +callMs.toFixed(3), frameMs: +frameMs.toFixed(2), fps: +(1000 / frameMs).toFixed(1) };
  },

  /* 레일 수학 감사 — 브라우저 없이도 같은 답이 나와야 한다. */
  auditRail(steps = 4000) {
    let jc = 0, jz = 0, jb = 0, kerr = 0, back = 0, prev = null, prev2 = null, pz = -1;
    for (let i = 0; i <= steps; i++) {
      const s = rail.at(i / steps);
      if (s.zoom < pz) back = Math.max(back, pz - s.zoom);
      pz = s.zoom;
      if (prev && prev2) {
        const a1 = [s.center[0] - prev.center[0], s.center[1] - prev.center[1]];
        const a0 = [prev.center[0] - prev2.center[0], prev.center[1] - prev2.center[1]];
        jc = Math.max(jc, Math.hypot(a1[0] - a0[0], a1[1] - a0[1]));
        jz = Math.max(jz, Math.abs((s.zoom - prev.zoom) - (prev.zoom - prev2.zoom)));
        jb = Math.max(jb, Math.abs((s.bearing - prev.bearing) - (prev.bearing - prev2.bearing)));
      }
      prev2 = prev; prev = s;
    }
    for (const k of KEYS) { const s = rail.at(k.p); kerr = Math.max(kerr, Math.hypot(s.center[0] - k.c[0], s.center[1] - k.c[1])); }
    return { steps, maxKeyframeErrorDeg: kerr, d2center: jc, d2zoom: jz, d2bearing: jb, maxZoomReversal: back };
  },
};
