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
import { registerResult } from './result-filter.js';

export const TEAL = '#0FA9A0', TEAL_DEEP = '#07706A', INK = '#010102', SLATE = '#8F99A8';
const FS_HOVER = ['boolean', ['feature-state', 'hover'], false];

/* ── 멀리서도 보이게(원칙 267 · 10-17 "줌 아웃 상태에서는 전혀 모른다") — 모든 결과 층의 공용 그리기 규칙 한 곳 ──
   지도 서비스 · XI맵(서비스 결과 · 시군구 결과 · 전국 결과 객체)이 같은 규칙. 면은 면 그대로(점으로 바꾸지 않는다).
   멀리(줌 ≤ 12.5): 테두리 = 화면 기준 최소 굵기(작은 객체 2px · 큰 면 1px) · 작은 객체는 흰 바깥 테두리(바탕 영상 대비 — 작은 면도 몇 px 크기로) · 채움 진하게.
   13 ~ 14.5 에서 원래 가까운 모양으로 서서히 · 가까이(줌 14.5~)는 원래 모양 그대로. 색은 원래 색 · 사람이 고른 색(kit/colors paintLayers)을 그대로 따른다.
   작은 객체 = 넓은 면 분류(LARGE_CLS)가 아닌 것 — 비닐하우스 · 건물 · 주차장 · 곤포 · 차량 … (분류가 없는 결과도 작은 객체로 본다).
   결과 조각(server/pipelines/pmtiles_light.py)은 먼 줌에서도 작은 면을 버리지 않는다 — 줌 8 부터. */
/** 결과 조각의 가장 먼 줌(pmtiles_light FAR_MIN_Z 와 같은 값) */
export const FAR_MIN_Z = 8;
export const LARGE_CLS = ['경작지', '비경작지', '농지', '논', '밭', '과수원', '산림', '초지', '나지', '수역', '토지피복', '식생 늘어남', '식생 줄어듦'];
const SMALL = ['!', ['in', ['to-string', ['coalesce', ['get', 'cls'], '']], ['literal', LARGE_CLS]]];
const bySize = (s, l) => (s === l ? s : ['case', SMALL, s, l]);
const hov = (h, v) => (h == null ? v : ['case', FS_HOVER, h, v]);
/** 멀리 줌의 값(줌 8 · 12.5) — 작은 객체 / 큰 면 */
export const FAR = {
  z: [8, 12.5],
  fill: [[0.8, 0.3], [0.7, 0.26]],          // 채움 진하기
  width: [[2.2, 1.1], [1.9, 1]],            // 테두리 굵기(px)
  lineOp: [[1, 0.9], [1, 0.85]],            // 테두리 진하기
  casing: [[4.6, 0], [4, 0]],               // 흰 바깥 테두리 굵기(px · 테두리 아래 · 큰 면은 없음)
  casingOp: [0.95, 0.85],
  white: 'rgba(255,255,255,1)',
};
/** 줌 식 — 멀리 값(FAR) → 가까운 원래 모양(near = [줌, 값, …] · 줌 ≥ 13.5). fade = [줌0, 줌1]: 줌0 에서 0 으로(XI맵 객체가 칸 지도에서 넘어올 때) */
function farZoom(far, near, { fade, hover } = {}) {
  const pick = (i) => hov(hover, bySize(far[i][0], far[i][1]));
  let stops = [FAR.z[0], pick(0), FAR.z[1], pick(1)];
  if (fade) stops = [fade[0], 0, fade[1], pick(fade[1] < FAR.z[1] ? 0 : 1), ...(fade[1] < FAR.z[1] ? [FAR.z[1], pick(1)] : [])];
  return ['interpolate', ['linear'], ['zoom'], ...stops, ...near];
}
/** 결과 층 셋(fill · halo · line)의 칠 — color 를 주면 한 색(XI맵 서비스 색), 아니면 분류 색(지도 서비스 · 결과 확인).
    o = { color, fade, near: { fill: [줌, 값 …], line, lineOp, halo } } — near 를 주지 않으면 화면 원래 값 */
export function farPaint(kind, o = {}) {
  const c = o.color;
  const lc = kind === 'landcover';
  const deep = kind === 'greenhouse';
  const fillOp = lc ? ['match', ['get', 'cls'], '건물', 0.35, '주차장', 0.3, '비닐하우스', 0.42, 0.18] : deep ? 0.42 : 0.18;
  const nearDef = lc
    ? { fill: [14, hov(0.42, fillOp), 16, hov(0.42, ['*', 0.45, fillOp])], width: [14.5, 1.2, 17, 1.6], lineOp: [14, 1, 16, 0.5],
        haloW: [14, 4], haloOp: [14.5, 1, 15.5, 0] }
    : { fill: [14, hov(0.42, fillOp)], width: [15, 1.2, 18, 1.8], lineOp: [14, 1], haloW: [14, 3, 15, 4], haloOp: [14, 1] };
  const N = { ...nearDef, ...(o.near || {}) };
  const fillColor = c || (lc ? ['match', ['get', 'cls'], '경작지', TEAL, '비닐하우스', TEAL_DEEP, '건물', INK, '주차장', SLATE, TEAL] : deep ? TEAL_DEEP : TEAL);
  const lineColor = c || (lc ? ['match', ['get', 'cls'], '건물', 'rgba(1,1,2,.5)', '주차장', SLATE, '비닐하우스', TEAL, TEAL] : deep ? TEAL_DEEP : TEAL);
  const haloNear = o.haloColor || (lc ? ['match', ['get', 'cls'], '건물', 'rgba(1,1,2,.18)', '주차장', 'rgba(143,153,168,.25)', 'rgba(15,169,160,.25)'] : 'rgba(15,169,160,.25)');
  const F = { fade: o.fade };
  return {
    fill: { 'fill-color': fillColor, 'fill-opacity': farZoom(FAR.fill, N.fill, { ...F, hover: 0.9 }) },
    halo: { 'line-color': ['interpolate', ['linear'], ['zoom'], 12.5, FAR.white, 14, haloNear],
      'line-width': farZoom(FAR.casing, N.haloW),
      'line-opacity': o.fade ? ['interpolate', ['linear'], ['zoom'], o.fade[0], 0, o.fade[1], FAR.casingOp[0], FAR.z[1], FAR.casingOp[1], ...N.haloOp]
        : ['interpolate', ['linear'], ['zoom'], FAR.z[0], FAR.casingOp[0], FAR.z[1], FAR.casingOp[1], ...N.haloOp] },
    line: { 'line-color': lineColor, 'line-width': farZoom(FAR.width, N.width), 'line-opacity': farZoom(FAR.lineOp, N.lineOp, F) },
  };
}
/** 결과 층 스타일(역할색 · 청록 = AI 결과 · 앰버 없음). kind: 'landcover' | 'farmland' | 'greenhouse' | 'change' | 'shard'
    멀리서도 보이게(원칙 267) — farPaint(위) 한 규칙. 가까이(줌 14.5~)는 원래 모양(법전 값 .18 · 1.2px + 4px 헤일로) 그대로. */
export function resultPaint(kind) {
  if (kind === 'change') return { line: { 'line-color': '#FFFFFF', 'line-width': 1.2, 'line-dasharray': [2, 1.5] }, halo: { 'line-color': 'rgba(1,1,2,.28)', 'line-width': 3 } };
  return farPaint(kind);
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
  registerResult(map, ids);          // 말로 거르기(result-filter.js) — 원래 거르기를 기억하고 지금 조건이 있으면 새 층에도 건다
  return ids;
}

export { filterResults, resultFilter, matchCond } from './result-filter.js';
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
