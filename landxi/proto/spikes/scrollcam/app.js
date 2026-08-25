/* SPIKE 셸 — 하나의 레일이 두 렌더러를 동시에 구동한다.

   스크롤 배선에 대한 결정(중요):
   Lenis 는 **페이지**를 부드럽게 하고, 레일은 **카메라**를 부드럽게 한다. 둘을 직렬로 걸면
   지연이 두 번 쌓여 "무겁다"가 아니라 "느리다"가 된다. 그래서 레일은 Lenis 의 *평활값*이 아니라
   *목표값*(lenis.targetScroll)을 읽는다 — 스무딩은 정확히 한 번만 일어난다.
   ScrollTrigger 는 챕터 리빌과 Lenis 부재 시의 폴백 경로에 쓴다. */

import { createRail, lenisScroller, mapApply } from './scrollcam.js';
import { KEYS, CHAPTERS, MARKS } from './rail-config.js';
import { createMapDemo } from './demo-map.js';
import { createGlobeDemo } from './demo-globe.js';

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

/* ── 데모 ── */
const mapDemo = createMapDemo('map');
const globeDemo = await createGlobeDemo($('#gl'));

/* ── 레일 ── */
let gateOn = true, zoomBias = 0;
const rail = createRail({
  keyframes: KEYS,
  chapters: CHAPTERS,
  scrollTo: lenisScroller(lenis),
  gate: () => (gateOn ? mapDemo.tilesReady() : true),
  onChapter: (i) => {
    document.querySelectorAll('#copy .ch').forEach((el, j) => el.classList.toggle('on', j === i));
  },
});
window.__lenis = lenis;

/* 지도 구독자 — 투영 전환과 지형을 카메라와 같은 프레임에서 처리한다.
   (전환을 별도 콜백/타이머로 미루면 한 프레임 어긋난 화면이 반드시 눈에 띈다.) */
const jump = mapApply(mapDemo.map);
let terrainOn = false;
rail.subscribe((s) => {
  if (document.body.dataset.demo !== 'map') return;
  const globe = mapDemo.projection(s.zoom, s.center[1]);
  const z = globe ? s.zoom : s.zoom + zoomBias;
  jump({ ...s, zoom: z });
  const exag = terrainOn && s.zoom > 6.2 && s.zoom < 12.6 ? 1.4 * (1 - Math.max(0, (s.zoom - 11.4) / 1.2)) : 0;
  mapDemo.setTerrain(terrainOn, exag);
});
rail.subscribe((s) => { if (document.body.dataset.demo === 'globe') globeDemo.apply(s); });

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
  set(hud.proj, document.body.dataset.demo === 'globe' ? 'three · sphere' : (mapDemo.isGlobe ? 'globe' : 'mercator'));
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

/* ── 컨트롤 ── */
const demo = (which) => {
  document.body.dataset.demo = which;
  $('#b-map').classList.toggle('on', which === 'map');
  $('#b-globe').classList.toggle('on', which === 'globe');
  rail.seek(rail.progress);           // 새 렌더러에 즉시 현재 상태를 밀어 넣는다
};
$('#b-map').onclick = () => demo('map');
$('#b-globe').onclick = () => demo('globe');
$('#o-tension').onchange = (e) => rail.setOption('tension', e.target.checked ? 1 : 0);
$('#o-warp').onchange = (e) => rail.setOption('screenSpace', e.target.checked);
$('#o-magnet').onchange = (e) => rail.setOption('magnet', { enabled: e.target.checked });
$('#o-gate').onchange = (e) => { gateOn = e.target.checked; };
$('#o-terrain').onchange = (e) => { terrainOn = e.target.checked; rail.resetMetrics(); };
$('#o-reduced').onchange = (e) => { rail.setOption('lerp', e.target.checked ? 1 : 0.10); rail.setOption('lerpFast', e.target.checked ? 1 : 0.24); };
$('#b-play').onclick = () => rail.play(0, 1, 20000, 'power1.inOut');
$('#b-reset').onclick = () => rail.resetMetrics();

/* ── 부팅 ── */
await mapDemo.ready();
demo('map');
rail.seek(0);
rail.start();

let ticks = 0;
gsap.ticker.add(() => {
  // 레일의 목표값은 Lenis 의 *목표* 스크롤에서 온다(이중 스무딩 방지).
  const y = (lenis.targetScroll != null ? lenis.targetScroll : (window.scrollY || 0));
  rail.setProgress(y / limit());
  if (++ticks === 4) {
    $('#boot').classList.add('gone');
    document.body.dataset.ready = '1';
  }
});

/* ── 계측 도구 (Playwright 에서 호출한다) ── */
async function settle(ms = 900) { await new Promise((r) => setTimeout(r, ms)); }

window.__rail = {
  rail, lenis, map: mapDemo.map, MARKS, CHAPTERS,
  demo,
  seek(p) {
    const s = lenisScroller(lenis);
    s(p, 0); rail.seek(p);
  },
  play: (a, b, ms) => rail.play(a, b, ms, 'power1.inOut'),
  metrics: () => rail.metrics(),
  reset: () => rail.resetMetrics(),
  errors: () => mapDemo.errors,
  setOption: (k, v) => rail.setOption(k, v),
  at: (p) => rail.at(p),

  /* 글로브 ↔ 메르카토르 축척 불연속을 실제로 잰다.
     같은 center/zoom 에서 화면 가로 절반이 덮는 지상 거리(도 단위)를 두 투영에서 비교한다. */
  async measureProjectionPop(zoom = 5.6, center = [127.7, 36.1]) {
    const map = mapDemo.map;
    const span = () => {
      const w = map.getContainer().clientWidth, h = map.getContainer().clientHeight;
      const a = map.unproject([w * 0.25, h / 2]), b = map.unproject([w * 0.75, h / 2]);
      return Math.abs(b.lng - a.lng);
    };
    const out = {};
    map.setProjection({ type: 'globe' }); map.jumpTo({ center, zoom, pitch: 0, bearing: 0 });
    await settle(600); out.globeSpanDeg = span();
    map.setProjection({ type: 'mercator' }); map.jumpTo({ center, zoom, pitch: 0, bearing: 0 });
    await settle(600); out.mercatorSpanDeg = span();
    out.ratio = out.globeSpanDeg / out.mercatorSpanDeg;
    out.zoomLevels = Math.log2(out.ratio);
    out.predicted1overCosLat = 1 / Math.cos(center[1] * Math.PI / 180);
    out.lat = center[1]; out.zoom = zoom;
    return out;
  },

  /* jumpTo 한 번의 비용. 렌더는 다음 rAF 에서 일어나므로 호출 비용과 프레임 비용을 나눠 잰다. */
  async measureJumpCost(n = 240) {
    const map = mapDemo.map;
    const base = rail.at(0.62);
    let t0 = performance.now();
    for (let i = 0; i < n; i++) {
      const q = 0.62 + (i / n) * 0.0004;
      const s = rail.at(q);
      map.jumpTo({ center: s.center, zoom: s.zoom, pitch: s.pitch, bearing: s.bearing });
    }
    const callMs = (performance.now() - t0) / n;
    // 프레임 포함 비용
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
    return { callMs: +callMs.toFixed(3), frameMs: +frameMs.toFixed(2), fps: +(1000 / frameMs).toFixed(1), base: base.zoom };
  },

  /* 레일 자체의 수학 검증 — 브라우저 없이도 같은 답이 나와야 한다. */
  auditRail(steps = 2000) {
    let maxJerkC = 0, maxJerkZ = 0, prev = null, prev2 = null, offKey = 0;
    for (let i = 0; i <= steps; i++) {
      const s = rail.at(i / steps);
      if (prev && prev2) {
        const a1 = [s.center[0] - prev.center[0], s.center[1] - prev.center[1]];
        const a0 = [prev.center[0] - prev2.center[0], prev.center[1] - prev2.center[1]];
        maxJerkC = Math.max(maxJerkC, Math.hypot(a1[0] - a0[0], a1[1] - a0[1]));
        maxJerkZ = Math.max(maxJerkZ, Math.abs((s.zoom - prev.zoom) - (prev.zoom - prev2.zoom)));
      }
      prev2 = prev; prev = s;
    }
    for (const k of KEYS) {
      const s = rail.at(k.p + (k.hold || 0) + (k.p >= 1 ? 0 : 1e-9));
      const at = rail.at(Math.min(1, k.p));
      const d = Math.hypot(at.center[0] - k.c[0], at.center[1] - k.c[1]);
      if (d > 1e-6) offKey = Math.max(offKey, d);
    }
    return { maxJerkCenterDeg: maxJerkC, maxJerkZoom: maxJerkZ, maxKeyframeErrorDeg: offKey, steps };
  },
};
