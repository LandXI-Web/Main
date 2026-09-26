/* arrive.js — 7문법 #1 도착(E0-S S1 승격 · ximap-signature.js:285 arrive() · :333 sweepFrame() 를 읽고 옮겨 개작).
   순서: frame 1250(카메라) → 스윕 1000(청록 1px + 24px 꼬리 · 지나간 뒤에만 현상 500) → 락온 380×3(스태거 120) → 숫자 40/글자 → 'arrived'.
   129,420 폴리곤 스윕 방법(결과 문서 §성능): feature-state 를 폴리곤마다 주는 대신, 도착 동안 결과 층만 그리는 두 번째 캔버스(B · 투명)를
   CSS mask(linear-gradient)로 스윕 선 뒤만 드러낸다 — 픽셀 단위로 '지나간 뒤에만', 프레임당 비용 = 합성 1회(p95 영향 0).
   도착이 끝나면 A 의 같은 층을 켜고 B 를 같은 프레임에 숨긴다(이음매 0). 작은 결과(GeoJSON)는 같은 경로. */
import { flyLadder } from '../engine/camera.js';
import { idle } from '../engine/lx-map.js';
import { D, EASE, textIn } from './glass.js';
import { numHtml } from './provenance.js';
import { env } from '../../shared/api-v1.js';

export const TEAL = '#0FA9A0', TEAL_DEEP = '#07706A', INK = '#010102', SLATE = '#8F99A8';
const FS_HOVER = ['boolean', ['feature-state', 'hover'], false];

/** 결과 층 스타일(역할색 · 청록 = AI 결과 · 앰버 없음). kind: 'landcover' | 'farmland' | 'greenhouse' | 'change' | 'shard' */
export function resultPaint(kind) {
  if (kind === 'landcover') {
    const fillColor = ['match', ['get', 'cls'], '경작지', TEAL, '비닐하우스', TEAL_DEEP, '건물', INK, '주차장', SLATE, TEAL];
    const fillOp = ['match', ['get', 'cls'], '건물', 0.35, '주차장', 0.3, '비닐하우스', 0.42, 0.18];
    // 도시 축척(z < 14)에서는 면을 옅게 · 선을 가늘게 — 청록 분량 ≤ 3 %(법전 §2) · 가까이 가면 법전 값(.18 · 1.2px + 4px 헤일로)
    return {
      fill: { 'fill-color': fillColor, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 11, ['case', FS_HOVER, 0.42, ['*', 0.3, fillOp]], 14, ['case', FS_HOVER, 0.42, fillOp], 16, ['case', FS_HOVER, 0.42, ['*', 0.45, fillOp]]] },
      halo: { 'line-color': ['match', ['get', 'cls'], '건물', 'rgba(1,1,2,.18)', '주차장', 'rgba(143,153,168,.25)', 'rgba(15,169,160,.25)'], 'line-width': 4, 'line-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0, 14.5, 1, 15.5, 0] },
      line: { 'line-color': ['match', ['get', 'cls'], '건물', 'rgba(1,1,2,.5)', '주차장', SLATE, '비닐하우스', TEAL, TEAL], 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 0.35, 13, 0.7, 14.5, 1.2, 17, 1.6],
        'line-opacity': ['interpolate', ['linear'], ['zoom'], 11, ['match', ['get', 'cls'], '건물', 0.25, 0.75], 14, 1, 16, 0.5] },
    };
  }
  if (kind === 'change') return { line: { 'line-color': '#FFFFFF', 'line-width': 1.2, 'line-dasharray': [2, 1.5] }, halo: { 'line-color': 'rgba(1,1,2,.28)', 'line-width': 3 } };
  const deep = kind === 'greenhouse';
  return {
    fill: { 'fill-color': deep ? TEAL_DEEP : TEAL, 'fill-opacity': ['case', FS_HOVER, 0.42, deep ? 0.42 : 0.18] },
    halo: { 'line-color': 'rgba(15,169,160,.25)', 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 2, 15, 4] },
    line: { 'line-color': deep ? TEAL_DEEP : TEAL, 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.8, 15, 1.2, 18, 1.8] },
  };
}
/** 결과 층 셋(fill · halo · line)을 한 지도에 올린다. 반환 층 id 목록. */
export function addResultLayers(map, key, source, { kind, sourceLayer, before = 'slot-result', visible = true, filter } = {}) {
  const P = resultPaint(kind), ids = [];
  const base = { source, ...(sourceLayer ? { 'source-layer': sourceLayer } : {}), ...(filter ? { filter } : {}) };
  const vis = { visibility: visible ? 'visible' : 'none' };
  if (P.fill) { map.addLayer({ id: `${key}-fill`, type: 'fill', ...base, layout: vis, paint: P.fill }, before); ids.push(`${key}-fill`); }
  if (P.halo) { map.addLayer({ id: `${key}-halo`, type: 'line', ...base, layout: { ...vis, 'line-join': 'miter' }, paint: P.halo }, before); ids.push(`${key}-halo`); }
  if (P.line && kind === 'farmland') {
    // 비경작지 = 점선(E0-S isDashCls) — line-dasharray 는 데이터 식을 받지 않으므로 층을 나눈다
    const f = (c) => (filter ? ['all', filter, c] : c);
    map.addLayer({ id: `${key}-line`, type: 'line', ...base, filter: f(['!=', ['get', 'cls'], '비경작지']), layout: { ...vis, 'line-join': 'miter' }, paint: P.line }, before);
    map.addLayer({ id: `${key}-dash`, type: 'line', ...base, filter: f(['==', ['get', 'cls'], '비경작지']), layout: { ...vis, 'line-join': 'miter' }, paint: { ...P.line, 'line-dasharray': [3, 2] } }, before);
    ids.push(`${key}-line`, `${key}-dash`);
  } else if (P.line) { map.addLayer({ id: `${key}-line`, type: 'line', ...base, layout: { ...vis, 'line-join': 'miter' }, paint: P.line }, before); ids.push(`${key}-line`); }
  return ids;
}
export const setVis = (map, ids, on) => ids.forEach((l) => map.getLayer(l) && map.setLayoutProperty(l, 'visibility', on ? 'visible' : 'none'));

/* ── 단계 기록(테스트·HUD) ── */
export const PHASES = [];
export function setPhase(p, extra = {}) {
  PHASES.push({ p, t: Math.round(performance.now()), ...extra });
  document.documentElement.dataset.phase = p;
  document.dispatchEvent(new CustomEvent('xi-phase', { detail: { phase: p, ...extra } }));
}

/* ── 락온 380 = 성장 180 → 앰버 80 → 청록 120(tokens-v2 .cw-lock · 앰버는 CSS 한 규칙) ── */
const LOCKS = [];
export function lock(stageEl, map, { lngLat, bbox, html }) {
  const box = document.createElement('div');
  box.className = 'cw-lock xi-lock';
  box.innerHTML = `<i class="c tl"></i><i class="c tr"></i><i class="c bl"></i><i class="c br"></i>${html ? `<span class="xi-lock-flag">${html}</span>` : ''}`;
  box.dataset.lockAt = String(Math.round(performance.now()));
  const L = { box, lngLat, bbox, map };
  const place = () => {
    const c = map.project(lngLat);
    let w = 44, h = 44;
    if (bbox) { const a = map.project([bbox[0], bbox[3]]), b = map.project([bbox[2], bbox[1]]); w = Math.max(40, Math.min(360, Math.abs(b.x - a.x) + 20)); h = Math.max(40, Math.min(360, Math.abs(b.y - a.y) + 20)); }
    box.style.width = w + 'px'; box.style.height = h + 'px';
    box.style.translate = `${(c.x - w / 2).toFixed(1)}px ${(c.y - h / 2).toFixed(1)}px`;
    box.classList.toggle('flip', c.x + w / 2 + 300 > window.innerWidth - 440);
  };
  L.place = place;
  place();
  map.on('move', place);
  stageEl.appendChild(box);
  LOCKS.push(L);
  /* 계측: 시작 = 성장 애니메이션의 실제 startTime(문서 타임라인 = performance.now 기준 · DOM 삽입과 첫 스타일 계산 사이 한 프레임을 빼고),
     끝 = 청록 정착 애니메이션의 finished(animationend 이벤트는 다음 프레임 태스크로 와 +16 ms 가 붙는다). 정의 380 = 180 + 80 + 120. */
  let anims = [];
  try { anims = box.getAnimations(); } catch { /* */ }
  const grow = anims.find((a) => a.animationName === 'cw-lock-grow'), settle = anims.find((a) => a.animationName === 'cw-lock-settle');
  grow?.ready.then(() => { if (grow.startTime != null) box.dataset.lockAt = String(Math.round(grow.startTime)); }).catch(() => {});
  const end = () => { if (!box.dataset.lockEnd) box.dataset.lockEnd = String(Math.round(performance.now())); return box; };
  const done = new Promise((res) => {
    settle?.finished.then(() => res(end())).catch(() => {});
    box.addEventListener('animationend', (ev) => { if (ev.animationName === 'cw-lock-settle') res(end()); });
  });
  L.done = done;
  return L;
}
export function clearLocks(keep = 0) { while (LOCKS.length > keep) { const L = LOCKS.shift(); L.map.off('move', L.place); L.box.remove(); } }
export const locks = () => LOCKS;

/* ── 숫자 현상: 124px · 글자별 40ms(.cw-digit) ── */
export function digits(el, text) {
  el.innerHTML = [...text].map((c, i) => `<span class="cw-digit" style="animation-delay:${i * D.d40}ms">${c}</span>`).join('');
  el.setAttribute('aria-label', text);
  return Promise.all([...el.querySelectorAll('.cw-digit')].map((s) => new Promise((r) => s.addEventListener('animationend', r, { once: true })))).then(() => {});
}

/**
 * 도착. ctx = { A, B, bWrap, sweepEl, stageEl, hud }. o = {
 *   camera?: {center, zoom, pitch}, frameMs = 1250, bbox:[W,S,E,N],
 *   show(A) → A 결과 층 켜기, prepB(B) → B 에 같은 결과 층(보이게) 올리기, clearB(B),
 *   count: Envelope, head: {scene, title, unit}, note: [html…], lockPick(B) → [{lngLat,bbox,html}] }
 */
let RUN = 0;
export async function arrive(ctx, o) {
  const id = ++RUN, alive = () => id === RUN;
  const { A, B, bWrap, sweepEl, stageEl, hud } = ctx;
  const rm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  clearLocks();
  hud.pending(o.head);
  setPhase('frame', { scene: o.scene });
  if (o.camera) await flyLadder([A, B], o.camera, { duration: rm ? 0 : o.frameMs ?? D.d1250 });
  if (!alive()) return false;
  // B(투명 · 결과 전용)에 결과를 올리고, A 의 같은 층은 숨긴 채 타일만 받게 한다
  B.jumpTo({ center: A.getCenter(), zoom: A.getZoom(), pitch: A.getPitch(), bearing: A.getBearing() });
  o.prepB(B);
  bWrap.hidden = false;
  bWrap.style.setProperty('--sx', '-9999px'); bWrap.style.setProperty('--sf', '1px');
  bWrap.classList.add('is-masked');
  // 결과 캔버스(B)가 다 서면 시작 — 영상(A)은 하강 중 이미 받는 중이라 상한 1250 만 기다린다. A 의 결과 층은 그 뒤에 받는다(워커 경합 0).
  const ti = performance.now(), tw = {};
  await idle(B, 5000); tw.b = Math.round(performance.now() - ti);
  await Promise.race([idle(A, D.d1250), new Promise((r) => setTimeout(r, 0))]).then(() => A.areTilesLoaded() ? null : idle(A, D.d1250)); tw.a = Math.round(performance.now() - ti);
  o.preloadA && o.preloadA(A);
  setPhase('tiles', { scene: o.scene, ...tw });
  if (!alive()) return false;
  // ② 스윕 — 선 위치 x(t) = x0 + (x1 − x0)·t/1000 · 마스크 뒤 현상 폭 = 500ms 거리
  setPhase('sweep', { scene: o.scene });
  const W = A.getContainer().clientWidth;
  let x0 = A.project([o.bbox[0], (o.bbox[1] + o.bbox[3]) / 2]).x, x1 = A.project([o.bbox[2], (o.bbox[1] + o.bbox[3]) / 2]).x;
  x0 = Math.max(0, Math.min(W, x0)); x1 = Math.max(x0 + 1, Math.min(W, x1));
  const fadeW = ((x1 - x0) * D.d500) / D.d1000;
  bWrap.style.setProperty('--sf', fadeW.toFixed(1) + 'px');
  const lockPromise = o.lockPick ? Promise.resolve().then(() => o.lockPick(B)) : Promise.resolve([]);
  if (!rm) {
    sweepEl.hidden = false;
    await new Promise((res) => {
      let t0 = performance.now(), held = 0;
      const f = (now) => {
        if (!alive()) return res();
        // 테스트 정지점(E0-S gate 와 같은 뜻): window.__xiSweepHold = 0..1 이면 그 진행에서 선을 세워 둔다 — 제품 동작에는 없음
        const hold = window.__xiSweepHold;
        if (hold != null && now - t0 >= hold * D.d1000) { if (!held) { held = now; document.documentElement.dataset.sweepHeld = '1'; } requestAnimationFrame(f); return; }
        if (held) { t0 += now - held; held = 0; delete document.documentElement.dataset.sweepHeld; }
        const el = now - t0, x = x0 + ((x1 - x0) * el) / D.d1000;
        bWrap.style.setProperty('--sx', x.toFixed(1) + 'px');
        if (el <= D.d1000) sweepEl.style.transform = `translateX(${x.toFixed(1)}px)`; else sweepEl.hidden = true;
        if (el < D.d1000 + D.d500) requestAnimationFrame(f); else res();
      };
      requestAnimationFrame(f);
    });
  }
  sweepEl.hidden = true;
  if (!alive()) return false;
  // B 를 다 드러낸 채 두고, A 의 같은 층이 서면(또는 카메라가 움직이기 시작하면) 같은 프레임에 A 로 넘긴다 — 이음매 0 · 도착은 기다리지 않는다
  bWrap.style.setProperty('--sx', '100000px');
  const picks = (await lockPromise) || [];
  let swapped = false;
  const swap = () => {
    if (swapped) return; swapped = true; A.off('movestart', swap);
    o.show(A); A.triggerRepaint();
    bWrap.classList.remove('is-masked'); bWrap.hidden = true; o.clearB && o.clearB(B);
    setPhase('swap', { scene: o.scene });
  };
  A.once('movestart', swap);
  idle(A, 8000).then(swap);
  if (!alive()) { swap(); return false; }
  // ③ 락온 3곳 · 스태거 120
  setPhase('lock', { scene: o.scene, n: picks.length });
  const Ls = [];
  for (let i = 0; i < Math.min(3, picks.length); i++) {
    if (i) await new Promise((r) => setTimeout(r, rm ? 0 : D.d120));
    Ls.push(lock(stageEl, A, picks[i]));
  }
  if (Ls.length) await Promise.race([Promise.all(Ls.map((L) => L.done)), new Promise((r) => setTimeout(r, D.d1000))]);
  if (!alive()) return false;
  // ④ 숫자 — 124px 글자별 40 · 해설 줄 텍스트 인
  setPhase('count', { scene: o.scene });
  await hud.count(o.count, o.head, o.note, { waitNote: false });
  if (!alive()) return false;
  setPhase('arrived', { scene: o.scene });
  document.dispatchEvent(new CustomEvent('arrived', { detail: { scene: o.scene } }));
  return true;
}
export const cancelArrive = () => { RUN++; };

/* ── 락온 후보 고르기: 화면 세 구역의 작은 상자만 질의(전체 질의 0 · 비용 ms 단위) ── */
export function pickLocks(map, layerIds, { unitSrc, prefer = ['비닐하우스', '경작지', '건물'], zones } = {}) {
  const W = map.getContainer().clientWidth, H = map.getContainer().clientHeight;
  const Z = zones || [[0.3, 0.62], [0.48, 0.44], [0.62, 0.7]];
  const out = [], seen = new Set();
  for (const [fx, fy] of Z) {
    const x = W * fx, y = H * fy, r = 90;
    const fs = map.queryRenderedFeatures([[x - r, y - r], [x + r, y + r]], { layers: layerIds.filter((l) => map.getLayer(l)) });
    let best = null, bs = -1;
    for (const f of fs) {
      const p = f.properties, key = p.id ?? f.id;
      if (seen.has(key) || (p.conf != null && +p.conf < 0.6)) continue;
      const rank = prefer.indexOf(p.cls); const s = (rank < 0 ? 0 : (prefer.length - rank) * 1e6) + (p.area_m2 ?? p.area ?? 0);
      if (s > bs) { bs = s; best = f; }
    }
    if (!best) continue;
    seen.add(best.properties.id ?? best.id);
    const bb = bboxOf(best.geometry), p = best.properties;
    const area = p.area_m2 ?? p.area, conf = p.conf;
    const where = p.emd ? `${p.emd} · ` : '';
    const html = `<b>${p.cls ?? '결과'}</b>${where}${area != null ? numHtml(env(Math.round(area), 'm2', 'inferred', unitSrc || 'result')) : ''}${conf != null ? ` · 신뢰도 ${numHtml(env(+(+conf).toFixed(2), 'ratio', 'inferred', unitSrc || 'result'), { digits: 2, unit: false })}` : ''}`;
    out.push({ lngLat: [(bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2], bbox: bb, html, props: p });
  }
  return out;
}
export function bboxOf(g) {
  let b = [180, 90, -180, -90];
  const walk = (c) => { if (typeof c[0] === 'number') { b = [Math.min(b[0], c[0]), Math.min(b[1], c[1]), Math.max(b[2], c[0]), Math.max(b[3], c[1])]; } else c.forEach(walk); };
  walk(g.coordinates);
  return b;
}
export { textIn, EASE };
