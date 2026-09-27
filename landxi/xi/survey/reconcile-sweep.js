/* reconcile-sweep.js — 실태조사 '대조 스윕'(SURVEY-SPEC §4.1 S-1 · 결정적 장면). arrive(도착) 와 job-theater(칸) 를 조합한 새 재질:
   잉크 헤어라인 1px(#010102 .6) + 격자 점선 꼬리 — AI 스윕(청록)과 다르다. 대조 작업(kind:'survey')의 shard.done(읍면동 1칸)에만 묶인다:
   이벤트가 오면 그 읍면동 위를 잉크 선이 500 으로 지나가고, 지나간 자리에서 대조 전 베일(잉크 .32)이 걷히며(fill 0 · 외곽선 유지)
   불일치(의심) 필지만 액센트 해치로 남는다. 이벤트 없이는 아무 칸도 움직이지 않는다(setInterval 0). 끝나면 대표 의심 3필지 락온 380 + HUD.
   층: src-survey(02. 데이터/survey/namwon-parcel-survey.pmtiles · parcels/suspects · z11–16) · sv-emd(A11 읍면동 GeoJSON · 베일) */
import { D, EASE } from '../fx/glass.js';
import { lock, clearLocks, setPhase, bboxOf } from '../fx/arrive.js';

export const ACCENT = '#006DF7';
const RM = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** 사선 해치(액센트) 패턴 이미지 — 8px 격자 · 1.5px 선 */
function hatchImage(px = 8) {
  const c = document.createElement('canvas'); c.width = c.height = px * 2;
  const g = c.getContext('2d');
  g.strokeStyle = 'rgba(0,109,247,.9)'; g.lineWidth = 1.5;
  for (let k = -1; k <= 2; k++) { g.beginPath(); g.moveTo(k * px, px * 2); g.lineTo(k * px + px * 2, 0); g.stroke(); }
  const d = g.getImageData(0, 0, c.width, c.height);
  return { width: c.width, height: c.height, data: new Uint8Array(d.data.buffer) };
}

/**
 * surveyLayers(A, { url, emd:[{nm, cd, geometry}] }) — 층을 올린다(숨김으로 시작). 반환 제어기.
 * 필터 상태: done(대조가 끝난 읍면동 cd 집합) · rules · priorities · states(상태별 숨김은 목록만 — 지도는 규칙·등급만)
 */
export function surveyLayers(A, { url, emd, before = 'slot-overlay' }) {
  const S = { on: false, done: new Set(), rules: new Set(['R1', 'R2', 'R3', 'R4', 'R5', 'R6']), prio: new Set(['A', 'B', 'C']), hl: null, emdHl: null };
  if (!A.hasImage('sv-hatch')) A.addImage('sv-hatch', hatchImage(), { pixelRatio: 2 });
  if (!A.getSource('src-survey')) A.addSource('src-survey', { type: 'vector', url, attribution: 'V-World 연속지적 2026-09-24 × LX AI(검수 전)' });
  const fc = { type: 'FeatureCollection', features: emd.map((f, i) => ({ type: 'Feature', id: i + 1, properties: { cd: f.cd, nm: f.nm }, geometry: f.geometry })) };
  S.idOf = new Map(emd.map((f, i) => [f.cd, i + 1]));
  if (!A.getSource('sv-emd')) A.addSource('sv-emd', { type: 'geojson', data: fc });
  const veil = ['coalesce', ['feature-state', 'veil'], 0];
  const vis = { visibility: 'none' };
  const L = [
    // 대조 전 베일(잉크 .32 · 걷힘은 4단 양자화 500) — 읍면동 단위(z12 읍면동 집계 격자)
    { id: 'sv-emd-veil', type: 'fill', source: 'sv-emd', layout: vis, paint: { 'fill-color': '#010102', 'fill-opacity': ['*', 0.32, veil], 'fill-antialias': false } },
    // 필지 외곽선(z14+ 흰 .35 · 일치 필지도 선은 남는다)
    { id: 'sv-parcel-line', type: 'line', source: 'src-survey', 'source-layer': 'parcels', minzoom: 13.5, layout: { ...vis, 'line-join': 'miter' },
      paint: { 'line-color': '#FFFFFF', 'line-width': ['interpolate', ['linear'], ['zoom'], 14, 0.5, 17, 1], 'line-opacity': ['interpolate', ['linear'], ['zoom'], 13.5, 0, 14.5, 0.35] } },
    // 의심 면(시 축척은 액센트 면 · 가까이는 사선 해치)
    { id: 'sv-sus-fill', type: 'fill', source: 'src-survey', 'source-layer': 'suspects', layout: vis, filter: ['==', ['get', 'rule'], '__none__'],
      paint: { 'fill-color': ACCENT, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 11, 0.62, 13, 0.4, 14, 0] } },
    { id: 'sv-sus-hatch', type: 'fill', source: 'src-survey', 'source-layer': 'suspects', minzoom: 13, layout: vis, filter: ['==', ['get', 'rule'], '__none__'],
      paint: { 'fill-pattern': 'sv-hatch', 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0, 14, 0.9] } },
    { id: 'sv-sus-line', type: 'line', source: 'src-survey', 'source-layer': 'suspects', minzoom: 12.5, layout: { ...vis, 'line-join': 'miter' }, filter: ['==', ['get', 'rule'], '__none__'],
      paint: { 'line-color': ACCENT, 'line-width': ['interpolate', ['linear'], ['zoom'], 12.5, 0.6, 15, 1.4, 18, 2] } },
    // 강조(행 호버 · 카드) — 2px 액센트 + 흰 헤일로
    { id: 'sv-hl-halo', type: 'line', source: 'src-survey', 'source-layer': 'parcels', layout: { ...vis, 'line-join': 'miter' }, filter: ['==', ['get', 'pnu'], '__none__'], paint: { 'line-color': '#FFFFFF', 'line-width': 5, 'line-opacity': 0.85 } },
    { id: 'sv-hl-line', type: 'line', source: 'src-survey', 'source-layer': 'parcels', layout: { ...vis, 'line-join': 'miter' }, filter: ['==', ['get', 'pnu'], '__none__'], paint: { 'line-color': ACCENT, 'line-width': 2.2 } },
    // 읍면동 외곽선(대조 전 점선 · 뒤 실선) + 막대 호버 강조
    { id: 'sv-emd-line', type: 'line', source: 'sv-emd', layout: { ...vis, 'line-join': 'miter' }, paint: { 'line-color': '#FFFFFF', 'line-width': ['case', ['boolean', ['feature-state', 'hl'], false], 2.4, 0.9], 'line-opacity': ['case', ['boolean', ['feature-state', 'hl'], false], 1, 0.6] } },
    // 클릭 조회용 투명 필지 면(z14+)
    { id: 'sv-parcel-hit', type: 'fill', source: 'src-survey', 'source-layer': 'parcels', minzoom: 13.5, layout: vis, paint: { 'fill-color': '#FFFFFF', 'fill-opacity': 0.001 } },
  ];
  for (const l of L) if (!A.getLayer(l.id)) A.addLayer(l, before);
  const IDS = L.map((l) => l.id);
  const susFilter = () => {
    if (!S.done.size) return ['==', ['get', 'rule'], '__none__'];
    return ['all', ['in', ['slice', ['get', 'pnu'], 0, 8], ['literal', [...S.done]]], ['in', ['get', 'rule'], ['literal', [...S.rules]]], ['in', ['get', 'priority'], ['literal', [...S.prio]]]];
  };
  const apply = () => { const f = susFilter(); for (const id of ['sv-sus-fill', 'sv-sus-hatch', 'sv-sus-line']) A.setFilter(id, f); };
  const C = {
    S, IDS,
    show(on) { S.on = on; for (const id of IDS) A.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none'); },
    /** 모든 읍면동을 '대조 전'(베일 1)으로 */
    veilAll(v = 1) { for (const id of S.idOf.values()) A.setFeatureState({ source: 'sv-emd', id }, { veil: v }); },
    /** 대조가 끝난 읍면동(해치가 보이는 곳) */
    markDone(cd) { S.done.add(cd); apply(); },
    doneAll(cds) { for (const c of cds) S.done.add(c); apply(); for (const id of S.idOf.values()) A.setFeatureState({ source: 'sv-emd', id }, { veil: 0 }); },
    reset() { S.done.clear(); apply(); C.veilAll(1); },
    setRules(r) { S.rules = new Set(r); apply(); },
    setPrio(p) { S.prio = new Set(p); apply(); },
    highlight(pnu) {
      S.hl = pnu || null;
      const f = ['==', ['get', 'pnu'], pnu || '__none__'];
      A.setFilter('sv-hl-line', f); A.setFilter('sv-hl-halo', f);
    },
    hoverEmd(cd) {
      if (S.emdHl) A.setFeatureState({ source: 'sv-emd', id: S.emdHl }, { hl: false });
      S.emdHl = cd ? S.idOf.get(cd) : null;
      if (S.emdHl) A.setFeatureState({ source: 'sv-emd', id: S.emdHl }, { hl: true });
    },
    /** 필지 조각(타일 경계에서 잘린 조각들) → MultiPolygon · bbox — 강조·크롭·락온용 */
    parcelGeom(pnu, layer = 'parcels') {
      const fs = A.querySourceFeatures('src-survey', { sourceLayer: layer, filter: ['==', ['get', 'pnu'], pnu] });
      if (!fs.length) return null;
      const polys = [];
      for (const f of fs) { const g = f.geometry; if (g.type === 'Polygon') polys.push(g.coordinates); else if (g.type === 'MultiPolygon') polys.push(...g.coordinates); }
      const geom = { type: 'MultiPolygon', coordinates: polys };
      return { geom, bbox: bboxOf(geom), props: fs[0].properties };
    },
  };
  return C;
}

/**
 * reconcileSweep(ctx) — 작업 이벤트(on = SSE · off = 리플레이) → 스윕 · 걷힘 · 해치 · 락온 · HUD
 * ctx = { A, layers, host(스윕 DOM), stageEl(락온), hud, rows(findings-emd 39행), picks(대표 3 · [{lng,lat,pnu,html}]), total: Envelope(정본 합), onDone }
 */
export function reconcileSweep(ctx) {
  const { A, layers, host, hud } = ctx;
  const S = { done: 0, total: 39, parcels: 0, findings: 0, byRule: {}, log: [], shown: [], nextAt: 0, closed: false, fades: [], raf: 0, live: false };
  const rowBy = new Map(ctx.rows.map((r) => [r.emd_cd, r]));
  const gate = async () => {   // 표시 간격 ≥ 120(이벤트 묶음이어도 순서·개수 그대로)
    const now = performance.now(), t = Math.max(now, S.nextAt);
    if (t > now + 1) await new Promise((r) => setTimeout(r, t - now));
    S.nextAt = performance.now() + D.d120;
  };
  // 베일 걷힘 4단 양자화(500) — rAF 는 걷히는 칸이 있을 때만
  const tick = (now) => {
    for (let i = S.fades.length - 1; i >= 0; i--) {
      const [id, t0] = S.fades[i], x = Math.min(1, (now - t0) / D.d500), q = x >= 1 ? 0 : 1 - Math.ceil(x * 4) / 4;
      A.setFeatureState({ source: 'sv-emd', id }, { veil: q });
      if (x >= 1) S.fades.splice(i, 1);
    }
    S.raf = S.fades.length ? requestAnimationFrame(tick) : 0;
  };
  const fadeVeil = (cd) => { const id = layers.S.idOf.get(cd); if (!id) return; if (RM()) { A.setFeatureState({ source: 'sv-emd', id }, { veil: 0 }); return; } S.fades.push([id, performance.now()]); if (!S.raf) S.raf = requestAnimationFrame(tick); };
  /** 잉크 선이 읍면동 화면 bbox 를 500 으로 가로지른다 → 지나간 뒤 걷힘 + 해치 */
  const sweepEmd = (cd, bb, label) => new Promise((res) => {
    const a = A.project([bb[0], bb[3]]), b = A.project([bb[2], bb[1]]);
    const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
    if (RM()) { res(); return; }
    const el = document.createElement('i'); el.className = 'sv-sweep'; el.style.height = Math.max(24, y1 - y0).toFixed(1) + 'px';
    el.innerHTML = `<b>${esc(label)}</b>`; host.appendChild(el);
    el.style.transform = `translate(${x0.toFixed(1)}px, ${y0.toFixed(1)}px)`;
    const anim = el.animate([{ transform: `translate(${x0.toFixed(1)}px, ${y0.toFixed(1)}px)` }, { transform: `translate(${x1.toFixed(1)}px, ${y0.toFixed(1)}px)` }], { duration: D.d500, easing: EASE.arrive });
    anim.finished.catch(() => {}).then(() => { el.remove(); res(); });
  });
  const on = async (name, d, { live = false, recorded = false } = {}) => {
    if (S.closed) return;
    if (name === 'shard.done') await gate();
    if (S.closed) return;
    S.live = live; S.log.push([name, Math.round(performance.now())]);
    document.documentElement.dataset.svjob = name;
    const basis = live ? 'measured' : recorded ? 'recorded' : 'demo';
    if (name === 'job.queued') hud.jobState(`대조 작업 접수 · 큐 ${d.position ?? '—'} · ${d.pool || 'cpu'}`, { live });
    else if (name === 'job.started') { S.total = d.shards_total || 39; hud.jobState(`대조 시작 · 읍면동 ${S.total}칸 · ${(d.workers || []).join(' · ') || 'cpu'}`, { live }); setPhase('survey-started'); }
    else if (name === 'shard.done') {
      const cd = d.emd_cd || String(d.shard_id || '').replace(/^emd-/, '');
      const r = rowBy.get(cd);
      const bb = d.bbox || r?.bbox; if (!bb) return;
      S.done++; S.findings += d.n || 0; S.parcels += d.parcels ?? r?.suspect_parcels ?? 0;
      for (const [k, v] of Object.entries(d.classes || {})) S.byRule[k] = (S.byRule[k] || 0) + v;
      S.shown.push([cd, Math.round(performance.now())]);
      const label = `${d.name || r?.emd || cd} · 의심 ${(d.parcels ?? r?.suspect_parcels ?? d.n ?? 0).toLocaleString('ko-KR')}`;
      hud.surveyJob({ done: S.done, total: S.total, parcels: S.parcels, findings: S.findings, basis, name: d.name || r?.emd, ms: d.ms });
      await sweepEmd(cd, bb, label);
      if (S.closed) return;
      fadeVeil(cd); layers.markDone(cd);
      setPhase('survey-shard', { cd, i: S.done });
    } else if (name === 'job.progress') { /* HUD 는 shard.done 합으로 — progress 는 서버 순서 확인용(로그) */ }
    else if (name === 'job.done') {
      if (S.closed) return;   // 마지막 칸 걷힘(500)은 다음 카메라 이동과 겹쳐 진행
      S.finished = true;
      setPhase('survey-done', { done: S.done, parcels: S.parcels });
      await ctx.onDone?.({ ...S, jobDone: d, basis });
    } else if (name === 'job.failed') { hud.jobState(`대조 실패 · ${d.error || ''}`, { live }); setPhase('survey-failed'); }
  };
  return {
    S, on,
    close() { S.closed = true; cancelAnimationFrame(S.raf); host.innerHTML = ''; },
  };
}

/** 대표 의심 3필지 락온(380 · 스태거 120) — picks = [{lng, lat, bbox?, html}] */
export async function lockPicks(stageEl, A, picks) {
  clearLocks();
  const Ls = [];
  for (let i = 0; i < picks.length; i++) {
    if (i) await new Promise((r) => setTimeout(r, RM() ? 0 : D.d120));
    const p = picks[i];
    const L = lock(stageEl, A, { lngLat: [p.lng, p.lat], bbox: p.bbox || null, html: p.html });
    L.box.querySelector('.xi-lock-flag')?.classList.add('sv-flag');
    if (p.title) L.box.title = p.title;
    Ls.push(L);
  }
  await Promise.race([Promise.all(Ls.map((L) => L.done)), new Promise((r) => setTimeout(r, D.d1000))]);
  return Ls;
}
