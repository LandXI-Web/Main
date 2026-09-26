/* timescrub.js — 7문법 #4 시계열(E0-S S3 승격 · ximap-signature.js setEpoch/epochLayers 를 옮겨 개작).
   0–(n−1) 소수 시점 · 아래 층 1 + 위 층 frac(E0-S '남은 것' 권고 — 0.5 에서 옅어지지 않는다) · 재생 6s = 정지 750×4 + 이동 1000×3
   정수 시점 750 자동 정지 · 변화 히스토그램(A04 pair 실측 · 스크러버 위 24px 데이터 잉크) · ←/→ ±0.25 · Home/End · ?epoch= */
import { D } from './glass.js';
import { numHtml, void_ } from './provenance.js';

/**
 * timescrub(root, { map, epochs:[{id, layer, label, gsd, curve:[a,b]}], hist:[{at, n:Envelope, label, parts}], onChange(e, L), onStop(k) })
 * epochs[i].layer = A 의 raster 층 id(이미 있음 · visibility none 로 시작 가능)
 */
export function timescrub(root, opt) {
  const S = { e: 0, playing: false, raf: 0, t0: 0, stops: [], epochs: [], hist: [], map: opt.map, enabled: false };
  const el = {
    root, play: root.querySelector('.xi-play'), range: root.querySelector('input[type=range]'), ticks: root.querySelector('.xi-ticks'),
    hist: root.querySelector('.xi-hist'), label: root.querySelector('.xi-scrub-label'), voidEl: root.querySelector('.xi-scrub-void'),
  };
  const n = () => S.epochs.length;
  const layersOf = (e) => {
    const k = Math.min(n() - 1, Math.floor(e + 1e-6)), f = +(e - k).toFixed(4);
    if (f < 0.005 || k >= n() - 1) return { k, f: 0, a: k, b: null };
    return { k, f, a: k, b: k + 1 };
  };
  const zop = (ep, w) => (ep.curve ? ['interpolate', ['linear'], ['zoom'], ep.curve[0], 0, ep.curve[1], w] : w);
  function paint(e) {
    const m = S.map; if (!m) return;
    const L = layersOf(e);
    S.epochs.forEach((ep, i) => {
      if (!m.getLayer(ep.layer)) return;
      const w = i === L.a ? 1 : i === L.b ? L.f : 0;
      const vis = w > 0 || S.warm ? 'visible' : 'none';
      m.setPaintProperty(ep.layer, 'raster-opacity', zop(ep, w));
      if (m.getLayoutProperty(ep.layer, 'visibility') !== vis) m.setLayoutProperty(ep.layer, 'visibility', vis);
    });
  }
  const valueText = (e) => { const L = layersOf(e); return L.b != null ? `${S.epochs[L.a].label} → ${S.epochs[L.b].label} · ${Math.round(L.f * 100)} %` : S.epochs[L.a].label; };
  let urlT = 0;
  function set(e, { from = 'api', url = true } = {}) {
    if (!n()) return;
    e = Math.max(0, Math.min(n() - 1, Math.round(e * 100) / 100));
    S.e = e;
    paint(e);
    if (from !== 'range') el.range.value = String(e);
    el.range.setAttribute('aria-valuetext', valueText(e));
    el.label.textContent = valueText(e);
    el.ticks.querySelectorAll('li').forEach((li, i) => { li.dataset.on = Math.round(e) === i ? '1' : '0'; });
    const L = layersOf(e);
    opt.onChange && opt.onChange(e, L, S.epochs[L.a], L.b != null ? S.epochs[L.b] : null);
    if (url) { clearTimeout(urlT); urlT = setTimeout(() => opt.onUrl && opt.onUrl(S.e), D.d120); }
  }
  function build(epochs, hist = [], { warm = false, initial = 0 } = {}) {
    stop();
    S.epochs = epochs; S.hist = hist; S.warm = warm;
    S.enabled = epochs.length >= 2;
    root.dataset.mode = opt.mode || '';
    el.voidEl.hidden = S.enabled; el.play.disabled = !S.enabled; el.range.disabled = !S.enabled;
    el.range.max = String(Math.max(1, epochs.length - 1));
    el.range.step = '0.01';
    el.ticks.innerHTML = epochs.map((ep, i) => `<li data-on="0" style="left:${(i / Math.max(1, epochs.length - 1)) * 100}%"><b>${ep.label}</b><span>${ep.gsd || ''}</span></li>`).join('');
    // 히스토그램: 쌍(pair) 막대 — 높이 ∝ 건수(봉투) · 스크러버 위 24px
    const max = Math.max(1, ...hist.map((h) => h.n.value || 0));
    el.hist.innerHTML = hist.map((h) => `<span class="xi-bar" style="left:${(h.at / Math.max(1, epochs.length - 1)) * 100}%;height:${Math.max(2, Math.round((h.n.value / max) * 24))}px" title="${h.label}">${numHtml(h.n, { unit: false })}</span>`).join('');
    el.hist.hidden = !hist.length;
    set(initial, { url: false });
  }
  function disable(why) { stop(); S.enabled = false; el.play.disabled = true; el.range.disabled = true; el.voidEl.hidden = false; el.voidEl.innerHTML = ''; void_(el.voidEl.appendChild(document.createElement('span')), why); el.hist.hidden = true; el.ticks.innerHTML = ''; el.label.textContent = ''; }
  /* 재생 6s: 정수 시점마다 750 정지 → 1000 이동(e-arrive) · 끝에서 처음으로 돌아가지 않고 멈춘다(유휴 모션 0) */
  function play() {
    if (!S.enabled || S.playing) return;
    if (S.e >= n() - 1 - 1e-6) set(0);
    S.playing = true; el.play.setAttribute('aria-pressed', 'true'); root.dataset.playing = '1';
    const start = Math.floor(S.e + 1e-6);
    const seq = [];                                    // [종류, 시작 e, 끝 e, ms]
    for (let k = start; k < n(); k++) { seq.push(['stop', k, k, D.d750]); if (k < n() - 1) seq.push(['hop', k, k + 1, D.d1000]); }
    let i = 0, t0 = performance.now();
    const ease = (x) => 1 - Math.pow(1 - x, 3);        // hop 곡선은 CSS 가 아니라 값 보간(e-arrive 근사 — 문서 §모션)
    const tick = (now) => {
      if (!S.playing) return;
      const [kind, a, b, ms] = seq[i];
      const x = Math.min(1, (now - t0) / ms);
      if (kind === 'hop') set(a + (b - a) * ease(x), { url: false });
      if (x >= 1) {
        if (kind === 'stop') { S.stops.push({ k: a, ms: Math.round(now - t0) }); opt.onStop && opt.onStop(a); }
        i++; t0 = now;
        if (i >= seq.length) { stop(); set(S.e); return; }
        if (seq[i][0] === 'stop') set(seq[i][1], { url: false });
      }
      S.raf = requestAnimationFrame(tick);
    };
    set(S.e, { url: false });
    S.raf = requestAnimationFrame(tick);
  }
  function stop() { S.playing = false; cancelAnimationFrame(S.raf); el.play?.setAttribute('aria-pressed', 'false'); delete root.dataset.playing; }
  el.play.addEventListener('click', () => (S.playing ? stop() : play()));
  el.range.addEventListener('input', () => { stop(); set(+el.range.value, { from: 'range' }); });
  el.range.addEventListener('keydown', (ev) => {
    const m = { ArrowRight: 0.25, ArrowUp: 0.25, ArrowLeft: -0.25, ArrowDown: -0.25 };
    if (ev.key in m) { ev.preventDefault(); stop(); set(S.e + m[ev.key]); }
    else if (ev.key === 'Home') { ev.preventDefault(); stop(); set(0); }
    else if (ev.key === 'End') { ev.preventDefault(); stop(); set(n() - 1); }
  });
  return { S, set, build, disable, play, stop, get e() { return S.e; }, layersOf };
}
