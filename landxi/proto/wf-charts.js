/* wf-charts.js — 축·격자 최소, 데이터 잉크만.
   ECharts 도 막대차트도 쓰지 않는다. 여기 있는 것은 네 가지뿐이다:
     1) 가산 혼합 발광 오버레이 — 9,664동을 "빛의 밀도"로 먼저 보여준다(kepler additive)
     2) 상주 타임라인 — 화면 폭 전체, 4시점 + 실제 변화 건수 스파크(어두운 유리 하나)
     3) 신뢰도 범례 — 실제 히스토그램 위에 끌 수 있는 임계 마커, 숫자는 항상 보인다
     4) 미니맵 = 영토 — 남원시 실루엣 위에 처리된 셀
*/

import { C, EPOCHS, SPANS, imagery } from './wf-data.js';

const fmt = (v) => Math.round(v).toLocaleString('ko-KR');

/* ── 1. 가산 혼합 발광 (kepler Layer Blending: additive) ──────────────────
   어두운 무대 위에서만 성립한다. 겹칠수록 흰색으로 수렴한다. 다색 금지. */
export function createGlow({ canvas, map, data, getState }) {
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  let W = 0, H = 0, dirty = true;

  // 스프라이트 한 장을 만들어 1,674회 drawImage — 매 프레임 그라디언트를 새로 만들지 않는다.
  const S = 48;
  const sprite = document.createElement('canvas');
  sprite.width = sprite.height = S;
  {
    const g = sprite.getContext('2d');
    const rg = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    rg.addColorStop(0, 'rgba(15,169,160,.95)');
    rg.addColorStop(0.35, 'rgba(15,169,160,.32)');
    rg.addColorStop(1, 'rgba(15,169,160,0)');
    g.fillStyle = rg; g.fillRect(0, 0, S, S);
  }

  function resize() {
    const r = canvas.parentElement.getBoundingClientRect();
    W = r.width; H = r.height;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    dirty = true;
  }

  function draw() {
    if (!dirty) return;
    dirty = false;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const z = map.getZoom();
    // 밀도 → 개체. z16 부터 발광을 내리고 실제 폴리곤(MapLibre 레이어)에 자리를 넘긴다.
    const vis = z >= 16.4 ? 0 : z <= 15.2 ? 1 : (16.4 - z) / 1.2;
    if (vis <= 0.01) return;
    const st = getState();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.78 * vis;
    const rMin = z < 13 ? 8 : 11, rMax = 44;
    for (const f of data.feats) {
      const p = f.properties;
      if (p.conf < st.thr || !st.classes.has(p.cls) || p.r > st.cascade) continue;
      const q = map.project(p.c);
      if (q.x < -40 || q.y < -40 || q.x > W + 40 || q.y > H + 40) continue;
      const r = Math.max(rMin, Math.min(rMax, rMin + Math.sqrt(p.nobj) * (z < 13 ? 1.4 : 3.2)));
      ctx.drawImage(sprite, q.x - r, q.y - r, r * 2, r * 2);
    }
    ctx.restore();
  }

  const mark = () => { dirty = true; };
  map.on('move', mark); map.on('zoom', mark); map.on('render', mark);
  window.addEventListener('resize', () => { resize(); });
  resize();
  (function loop() { draw(); requestAnimationFrame(loop); })();
  return { mark, resize };
}

/* ── 2. 상주 타임라인 — 화면 폭 전체 (D9) ────────────────────────────────
   축 위의 스파크는 장식이 아니라 change.js 의 실제 변화 건수다. */
export function createTimeline({ canvas, host, data, onScrub, onEpochJump }) {
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  let W = 0, H = 0, t = 3, hover = -1, playing = false, sel = null, over = false;
  const PAD = 148, PADR = 168;

  function resize() {
    const r = canvas.getBoundingClientRect();
    W = r.width; H = r.height;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    draw();
  }
  const xOf = (i) => PAD + ((W - PAD - PADR) * i) / 3;
  const iOf = (x) => Math.max(0, Math.min(3, ((x - PAD) / (W - PAD - PADR)) * 3));

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const base = H - 42;

    ctx.font = '400 10px Inter, system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,255,255,.42)';
    ctx.fillText('ORTHO EPOCH · 남원 정사영상 4시점', 20, 22);
    ctx.fillStyle = 'rgba(255,255,255,.28)';
    ctx.fillText('SPARK = 변화 지수(비지도) 탐지 건수', 20, 38);
    if (!data.preset.epochs) {
      // 이 과업에는 시간축이 없다. 축을 지우는 대신 무채로 죽이고 이유를 쓴다.
      ctx.globalAlpha = 0.26;
    }

    // 축
    ctx.strokeStyle = 'rgba(255,255,255,.20)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(PAD, base + .5); ctx.lineTo(W - PADR, base + .5); ctx.stroke();

    // 구간 스파크 — 실제 건수(112 / 79 / 109)를 계급별로 쌓는다.
    const maxN = Math.max(...SPANS.map((s) => s.n), 1);
    for (let i = 0; i < SPANS.length; i++) {
      const s = SPANS[i];
      const x0 = xOf(i), x1 = xOf(i + 1);
      const bw = Math.min(60, (x1 - x0) * 0.5);
      const cx = (x0 + x1) / 2;
      const cols = [['veg_gain', C.teal2], ['veg_loss', C.teal3], ['built_new', C.teal]];
      let y = base;
      for (const [k, col] of cols) {
        const v = s.by[k] || 0;
        const h = (v / maxN) * (H - 74);
        if (h <= 0) continue;
        ctx.fillStyle = col; ctx.globalAlpha = 0.78;
        ctx.fillRect(cx - bw / 2, y - h, bw, h);
        y -= h;
      }
      ctx.globalAlpha = 1;
      ctx.font = '400 10px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255,255,255,.55)';
      ctx.fillText(fmt(s.n), cx, y - 6);
    }

    // 시점 눈금 — 전역 정사영상이 없는 시점은 무채 점선(결손은 무채).
    for (let i = 0; i < 4; i++) {
      const x = xOf(i), e = EPOCHS[i];
      const hasCity = !!e.city;
      ctx.strokeStyle = hasCity ? 'rgba(255,255,255,.7)' : 'rgba(255,255,255,.28)';
      ctx.setLineDash(hasCity ? [] : [2, 3]);
      ctx.beginPath(); ctx.moveTo(x + .5, base - 8); ctx.lineTo(x + .5, base + 8); ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = '400 11px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      const on = Math.abs(t - i) < 0.4;
      ctx.fillStyle = on ? '#FFFFFF' : (hover === i ? 'rgba(255,255,255,.8)' : 'rgba(255,255,255,.45)');
      ctx.fillText(e.label, x, base + 22);
      if (!hasCity) {
        ctx.font = '400 9px Inter, system-ui, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,.3)';
        ctx.fillText('AOI 전용', x, base + 34);
      }
      // 선택 구간 커버리지 — 선택이 있으면 그 범위에 이 시점 영상이 있는지 표시한다.
      if (sel) {
        const im = imagery(e.city || e.aoi);
        const cov = im && !(im.bounds[2] < sel[0] || im.bounds[0] > sel[2] || im.bounds[3] < sel[1] || im.bounds[1] > sel[3]);
        ctx.fillStyle = cov ? C.teal : 'rgba(255,255,255,.16)';
        ctx.fillRect(x - 4, base - 20, 8, 3);
      }
    }

    ctx.globalAlpha = 1;
    if (!data.preset.epochs) {
      ctx.font = '400 11px Inter, system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(255,255,255,.5)';
      ctx.fillText(`이 과업은 단일 시점(${data.analyzedAt}) — 4시점 축은 남원 정사영상에만 있다`, PAD, H / 2);
      return;
    }
    // 재생 헤드
    const px = xOf(t);
    ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(px + .5, 14); ctx.lineTo(px + .5, base + 10); ctx.stroke();
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(px - 3, 14, 6, 6);
  }

  canvas.addEventListener('pointermove', (e) => {
    if (!data.preset.epochs) return;
    const r = canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    hover = [0, 1, 2, 3].find((i) => Math.abs(xOf(i) - x) < 24) ?? -1;
    canvas.style.cursor = hover >= 0 ? 'pointer' : 'ew-resize';
    if (dragging) { t = iOf(x); onScrub?.(t); }
    draw();
  });
  canvas.addEventListener('pointerleave', () => { hover = -1; over = false; draw(); });
  canvas.addEventListener('pointerenter', () => { over = true; });
  let dragging = false;
  canvas.addEventListener('pointerdown', (e) => {
    if (!data.preset.epochs) return;
    const r = canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const i = [0, 1, 2, 3].find((k) => Math.abs(xOf(k) - x) < 24);
    if (i != null && !EPOCHS[i].city) { onEpochJump?.(i); }
    dragging = true; canvas.setPointerCapture(e.pointerId);
    t = iOf(x); onScrub?.(t); draw();
  });
  canvas.addEventListener('pointerup', (e) => { dragging = false; try { canvas.releasePointerCapture(e.pointerId); } catch {} });

  // ▶ 자동재생 — 호버하면 멈춘다(사용자가 읽는 동안 축이 도망가지 않게).
  let raf = 0, last = 0;
  function tick(now) {
    if (playing) {
      const dt = (now - last) / 1000; last = now;
      if (!over) {
        t += dt * 0.42;
        if (t > 3) t = 0;
        onScrub?.(t);
        draw();
      }
      raf = requestAnimationFrame(tick);
    }
  }
  resize();
  window.addEventListener('resize', resize);

  return {
    draw, resize,
    get t() { return t; },
    set t(v) { t = Math.max(0, Math.min(3, v)); draw(); },
    get playing() { return playing; },
    play(on) {
      playing = on;
      if (on) { last = performance.now(); raf = requestAnimationFrame(tick); }
      else cancelAnimationFrame(raf);
      host?.classList.toggle('is-playing', on);
    },
    setSelection(bbox) { sel = bbox; draw(); },
  };
}

/* ── 3. 신뢰도 범례 — 실제 히스토그램 + 끌 수 있는 임계 (장치 9) ─────────── */
export function createConfLegend({ canvas, valueEl, data, onChange }) {
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  let W = 0, H = 0, thr = data.preset.conf0, live = null;

  function resize() {
    const r = canvas.getBoundingClientRect();
    W = r.width; H = r.height;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    draw();
  }
  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const hist = live || data.confHist || [];
    const max = Math.max(...hist, 1);
    const base = H - 14;
    const bw = W / hist.length;
    for (let i = 0; i < hist.length; i++) {
      const lo = i / hist.length;
      const h = (hist[i] / max) * (base - 6);
      const on = lo + 1 / hist.length > thr;
      ctx.fillStyle = on ? C.teal : 'rgba(255,255,255,.16)';
      ctx.fillRect(i * bw, base - h, bw - 1, h);
    }
    // 축 — 눈금 3개면 충분하다
    ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, base + .5); ctx.lineTo(W, base + .5); ctx.stroke();
    ctx.font = '400 9px Inter, system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,.4)';
    ctx.textAlign = 'left'; ctx.fillText('0.0', 0, H - 3);
    ctx.textAlign = 'center'; ctx.fillText('0.5', W / 2, H - 3);
    ctx.textAlign = 'right'; ctx.fillText('1.0', W, H - 3);
    // 임계 마커 — 헤어라인 + 사각 썸(채운 버튼 금지)
    const x = thr * W;
    ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x + .5, 0); ctx.lineTo(x + .5, base); ctx.stroke();
    ctx.fillStyle = C.bg; ctx.fillRect(x - 4, -1, 8, 8);
    ctx.strokeRect(x - 4.5, -0.5, 9, 8);
  }
  function set(x) {
    thr = Math.max(0.01, Math.min(1, x / W));
    if (valueEl) valueEl.textContent = thr.toFixed(2);
    onChange?.(thr);
    draw();
  }
  let drag = false;
  canvas.addEventListener('pointerdown', (e) => {
    drag = true; canvas.setPointerCapture(e.pointerId);
    set(e.clientX - canvas.getBoundingClientRect().left);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    set(e.clientX - canvas.getBoundingClientRect().left);
  });
  canvas.addEventListener('pointerup', (e) => { drag = false; try { canvas.releasePointerCapture(e.pointerId); } catch {} });
  canvas.addEventListener('keydown', (e) => {
    const d = e.key === 'ArrowLeft' ? -0.01 : e.key === 'ArrowRight' ? 0.01 : 0;
    if (!d) return;
    e.preventDefault();
    set((thr + d) * W);
  });
  resize();
  window.addEventListener('resize', resize);
  if (valueEl) valueEl.textContent = thr.toFixed(2);
  return { draw, resize, get value() { return thr; },
           set(v) { thr = v; if (valueEl) valueEl.textContent = v.toFixed(2); draw(); },
           setLive(h) { live = h; draw(); } };
}

/* ── 4. 미니맵 = 영토가 아니라 그래프의 축소판이면 실패다 (D12) ───────────── */
export function createMinimap({ canvas, data, getState }) {
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  let poly = null, W = 0, H = 0, box = null;

  function resize() {
    const r = canvas.getBoundingClientRect();
    W = r.width; H = r.height;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    draw();
  }
  function setBoundary(feature) {
    poly = feature;
    if (feature) {
      let w = 180, s = 90, e = -180, n = -90;
      const walk = (a) => {
        if (!Array.isArray(a)) return;
        if (typeof a[0] === 'number') { w = Math.min(w, a[0]); e = Math.max(e, a[0]); s = Math.min(s, a[1]); n = Math.max(n, a[1]); return; }
        for (const b of a) walk(b);
      };
      walk(feature.geometry.coordinates);
      box = [w, s, e, n];
    }
    draw();
  }
  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const bb = box || data.bbox;
    const sx = W / (bb[2] - bb[0]), sy = H / (bb[3] - bb[1]);
    const s = Math.min(sx, sy) * 0.92;
    const ox = (W - (bb[2] - bb[0]) * s) / 2, oy = (H - (bb[3] - bb[1]) * s) / 2;
    const px = (l) => ox + (l - bb[0]) * s;
    const py = (l) => H - oy - (l - bb[1]) * s;

    if (poly) {
      ctx.beginPath();
      const rings = poly.geometry.type === 'Polygon' ? poly.geometry.coordinates : poly.geometry.coordinates.flat();
      for (const ring of rings) {
        ring.forEach((c, i) => (i ? ctx.lineTo(px(c[0]), py(c[1])) : ctx.moveTo(px(c[0]), py(c[1]))));
        ctx.closePath();
      }
      ctx.fillStyle = 'rgba(255,255,255,.04)'; ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.32)'; ctx.lineWidth = 1; ctx.stroke();
    }
    const st = getState();
    let live = 0;
    for (const c of data.cellsAll) {
      if (c.conf < st.thr) continue;
      live += c.obj;
      const t = Math.min(1, Math.log(1 + c.obj) / Math.log(1 + data.maxObj));
      ctx.globalAlpha = 0.3 + t * 0.7;
      ctx.fillStyle = C.teal;
      ctx.fillRect(px(c.c[0]) - 1.5, py(c.c[1]) - 1.5, 3, 3);
    }
    ctx.globalAlpha = 1;
    // 현재 뷰포트
    if (st.view) {
      const v = st.view;
      ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 1;
      ctx.strokeRect(px(v[0]), py(v[3]), px(v[2]) - px(v[0]), py(v[1]) - py(v[3]));
    }
    ctx.font = '400 9px Inter, system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,.5)';
    ctx.textAlign = 'left';
    ctx.fillText(`${fmt(live)}동 · ${data.cellsAll.length}셀`, 2, H - 3);
  }
  resize();
  window.addEventListener('resize', resize);
  return { draw, resize, setBoundary };
}

/* ── 숫자는 글자별로 "현상"된다 (Vantor 4.4) ──────────────────────────────── */
export function developNumber(el, value, unit) {
  const text = fmt(value);
  const prev = el.dataset.v;
  if (prev === text) return;
  el.dataset.v = text;
  el.innerHTML = '';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  [...text].forEach((ch, i) => {
    const s = document.createElement('span');
    s.className = 'ch';
    s.textContent = ch;
    if (!reduce) {
      s.style.color = 'rgba(255,255,255,.06)';
      setTimeout(() => { s.style.color = ''; }, 40 * i);
    }
    el.appendChild(s);
  });
  if (unit) {
    const u = document.createElement('i');
    u.className = 'u';
    u.textContent = unit;
    el.appendChild(u);
  }
}
