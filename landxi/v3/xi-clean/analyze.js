/* analyze.js — XI맵 분석(직원 · 영업): 읍면동(또는 그린 범위) → 견적 카드 → 실행 → 칩 단위로 AI 분석 결과가 지도에 차오름.
   · 프레임 = 지도에서 누른 읍면동(경계 ∩ 영상 범위) 또는 지도 위에 끌어서 그린 사각형 — 시군 전역은 실시간으로 받지 않는다(서버 범위 천장)
   · 견적  = POST /jobs/quote{options.live} — 서버가 범위 상한 · 해상도(칩 수 상한) · 전력 예산을 정하고 GPU 워커에 모델을 미리 올린다
   · 실행  = POST /jobs{kind:infer} → 게이트웨이 작업 대기열 → SSE /events/jobs/{id} : shard.done 마다 그 칸이 밝아지고 결과 도형이 들어온다(1250)
   · 전체 범위 기록 보기 = 이미 끝난 시군 전역 작업의 기록을 다시 흘려 보는 보조 동작(실시간 아님 · 속도 문구 없음)
   · 전역 분석(core-xi) = 고른 시군구 전체 — POST /jobs/quote{options.scope:'sgg', sgg_cd, center}. 영상 · 모델은 서버가 고르고, 칸은 화면 중심에서
     가까운 읍면동부터 차오른다. 다른 지역으로 가도 작업은 계속되고(화면만 떼어 낸다), 돌아오면 이어서 보인다. 영상이 없으면 '영상 등록 필요'.
     영상이 시군구 일부만 덮으면 서버가 만든 범위 문장('영상이 있는 곳만 분석합니다 — 읍면동 n곳, 시군구 면적의 약 p%')을 그대로 보인다(r3-xi).
   · 읍면동 · 그린 범위도 영상 · 모델을 서버가 고른다(등록 영상 COG 포함 · r3-xi M11) — 화면은 범위만 보낸다.
   · 영업  = demo:true(서버 강제) → 꼬리표 '예시' · 결과는 남지 않음
   숫자·문구는 사용자 말만. 칩 수 · 작업 id · 모델 id · 걸린 시간은 개발자 서랍(devlog)으로. */
import { api, API } from '../kit/util.js';
import { sse, JOB_EVENTS } from '../../shared/api-v1.js';
import { h, esc, sig, devlog, toast, bboxOf, empty } from '../kit/index.js';

const EMPTY = { type: 'FeatureCollection', features: [] };
const TEAL = '#0FA9A0';
const RM = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const nf = (n) => Number(n).toLocaleString('ko-KR');

/* ── 기하 ── */
const R = 6371008.8;
export function areaKm2(g) {
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  let tot = 0;
  for (const p of polys) {
    const ring = p[0], lat0 = ring.reduce((s, q) => s + q[1], 0) / ring.length, k = Math.cos((lat0 * Math.PI) / 180);
    let a = 0; for (let i = 0; i < ring.length - 1; i++) a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
    tot += (Math.abs(a) / 2) * (Math.PI / 180) ** 2 * R * R * k / 1e6;
  }
  return tot;
}
const boxArea = (b) => Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);
const inter = (a, b) => [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])];
const rectPoly = (b) => ({ type: 'Polygon', coordinates: [[[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]], [b[0], b[1]]]] });
/** Sutherland–Hodgman: 고리를 사각형으로 자른다 */
function clipRing(ring, b) {
  const edges = [[(p) => p[0] >= b[0], (p, q) => [b[0], p[1] + ((q[1] - p[1]) * (b[0] - p[0])) / (q[0] - p[0])]],
    [(p) => p[0] <= b[2], (p, q) => [b[2], p[1] + ((q[1] - p[1]) * (b[2] - p[0])) / (q[0] - p[0])]],
    [(p) => p[1] >= b[1], (p, q) => [p[0] + ((q[0] - p[0]) * (b[1] - p[1])) / (q[1] - p[1]), b[1]]],
    [(p) => p[1] <= b[3], (p, q) => [p[0] + ((q[0] - p[0]) * (b[3] - p[1])) / (q[1] - p[1]), b[3]]]];
  let out = ring.slice(0, -1);
  for (const [inside, cut] of edges) {
    const inp = out; out = [];
    for (let i = 0; i < inp.length; i++) {
      const p = inp[i], q = inp[(i + 1) % inp.length];
      if (inside(q)) { if (!inside(p)) out.push(cut(p, q)); out.push(q); } else if (inside(p)) out.push(cut(p, q));
    }
    if (!out.length) return null;
  }
  return out.length >= 3 ? [...out, out[0]] : null;
}
/** 지역 경계(Polygon|MultiPolygon)를 영상 범위 사각형으로 자른 Polygon|MultiPolygon */
export function clipToBox(geom, b) {
  const polys = (geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates).map((p) => clipRing(p[0], b)).filter(Boolean).map((r) => [r]);
  if (!polys.length) return null;
  return polys.length === 1 ? { type: 'Polygon', coordinates: polys[0] } : { type: 'MultiPolygon', coordinates: polys };
}

/* ── 영상 · 모델 고르기(카탈로그 · 레지스트리에서 · 지역 하드코딩 0) ── */
export function imageryLabel(it) {
  if (!it) return '—';
  const g = it.gsd_m, cm = g < 1 ? `${Math.round(g * 1000) / 10}cm` : `${g}m`;
  const drone = /드론|drone/i.test(`${it.name?.ko || ''} ${it.name?.en || ''}`);
  const yr = /^\d{4}$/.test(String(it.epoch || '')) ? `${it.epoch}년 ` : '';
  return `${yr}${cm} ${drone ? '드론영상' : '항공영상'}`;
}
/* 영상 · 모델 고르기는 서버가 한다(POST /jobs/quote — 읍면동 · 그린 범위 · 전역 분석 모두 · 등록 영상 COG 포함 · r3-xi M11) */

/* ── 분석 도구 ── */
export function analyzer({ stage, host, catalog, who, demo, onBusy, onDone, pick, regionInfo }) {
  const map = stage.map;
  let S = null, draw = null;
  const tenant = who?.me?.realm === 'tenant';
  const staff = who?.me?.realm === 'lx' && ['staff', 'admin'].includes(who?.me?.role);     // '영상 등록'은 LX 직원 · 관리자만

  /* 층: 마스크(프레임 밖 디밍) · 프레임 선 · 끝난 칸 · 도착 중 도형 · 판독 도형 */
  const src = (id) => map.getSource(id);
  const set = (id, fc) => src(id)?.setData(fc || EMPTY);
  function layers() {
    if (map.getSource('xa-mask')) return;
    for (const id of ['xa-mask', 'xa-frame', 'xa-cells', 'xa-new', 'xa-emd']) map.addSource(id, { type: 'geojson', data: EMPTY });
    map.addLayer({ id: 'xa-mask', type: 'fill', source: 'xa-mask', paint: { 'fill-color': '#F2F4F6', 'fill-opacity': 0.24, 'fill-opacity-transition': { duration: 750 } } }, 'slot-overlay');
    map.addLayer({ id: 'xa-cells', type: 'fill', source: 'xa-cells', paint: { 'fill-color': TEAL, 'fill-opacity': 0.1 } }, 'slot-overlay');
    map.addLayer({ id: 'xa-cells-l', type: 'line', source: 'xa-cells', paint: { 'line-color': TEAL, 'line-width': 0.5, 'line-opacity': 0.45 } }, 'slot-overlay');
    map.addLayer({ id: 'xa-new-f', type: 'fill', source: 'xa-new', paint: { 'fill-color': '#FFFFFF', 'fill-opacity': 0.5 } }, 'slot-overlay');
    map.addLayer({ id: 'xa-new-l', type: 'line', source: 'xa-new', paint: { 'line-color': '#FFFFFF', 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1, 15, 2] } }, 'slot-overlay');
    map.addLayer({ id: 'xa-frame-h', type: 'line', source: 'xa-frame', paint: { 'line-color': 'rgba(242,244,246,.55)', 'line-width': 5, 'line-blur': 2 } }, 'slot-overlay');
    map.addLayer({ id: 'xa-frame', type: 'line', source: 'xa-frame', paint: { 'line-color': '#FFFFFF', 'line-width': 1.6 } }, 'slot-overlay');
    // 전역 분석: 지금 차오르는 읍면동(흰 선 · 칸이 다음 읍면동으로 넘어가면 따라간다)
    map.addLayer({ id: 'xa-emd', type: 'line', source: 'xa-emd', layout: { 'line-join': 'round' }, paint: { 'line-color': '#FFFFFF', 'line-width': 2.4, 'line-opacity': 0.95 } }, 'slot-overlay');
  }
  const WORLD = [[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]];
  function showFrame(g) {
    layers();
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    set('xa-frame', { type: 'Feature', properties: {}, geometry: g });
    // 구멍 고리는 바깥 고리(WORLD · 반시계)와 반대 방향(시계)으로 맞춘다
    const cw = (r) => { let a = 0; for (let i = 0; i < r.length - 1; i++) a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; return a < 0 ? r : [...r].reverse(); };
    set('xa-mask', { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [WORLD, ...polys.map((p) => cw(p[0]))] } });
  }
  function clearMap() { for (const id of ['xa-mask', 'xa-frame', 'xa-emd']) set(id, EMPTY); clearResults(); host.querySelectorAll('.xa-bk').forEach((e) => e.remove()); }

  /* 카드 */
  const card = h('section.xa-card.t-card.t-card--map', { hidden: true, 'aria-live': 'polite' });
  host.append(card);
  const close = () => { card.hidden = true; };

  /* 그리기: 분석 켜진 동안 지도 위 끌기 = 사각형 */
  function drawOn() {
    if (draw) return;
    let start = null;
    const canvas = map.getCanvasContainer();
    const md = (e) => { if (S?.running || e.originalEvent.button !== 0) return; e.preventDefault(); start = e.lngLat; map.dragPan.disable(); };
    const mm = (e) => { if (!start) return; const b = [Math.min(start.lng, e.lngLat.lng), Math.min(start.lat, e.lngLat.lat), Math.max(start.lng, e.lngLat.lng), Math.max(start.lat, e.lngLat.lat)]; layers(); set('xa-frame', { type: 'Feature', properties: {}, geometry: rectPoly(b) }); };
    const mu = (e) => {
      if (!start) return; map.dragPan.enable();
      const a = map.project(start), z = map.project(e.lngLat);
      const b = [Math.min(start.lng, e.lngLat.lng), Math.min(start.lat, e.lngLat.lat), Math.max(start.lng, e.lngLat.lng), Math.max(start.lat, e.lngLat.lat)];
      start = null;
      if (Math.abs(a.x - z.x) < 14 || Math.abs(a.y - z.y) < 14) {
        // 누르기 = 그 자리의 읍면동을 고른다(경계 층이 있는 지역) — 없으면 이전 프레임 그대로
        const p = pick ? pick(e.lngLat, e.point) : null;
        if (p && typeof p.then === 'function') p.then((r) => { if (r?.geometry && !S?.running) frame(r.geometry, { label: r.label }); else if (S?.geom) showFrame(S.geom); });
        else if (S?.geom) showFrame(S.geom);
        return;
      }
      frame(rectPoly(b), { label: null });
    };
    map.on('mousedown', md); map.on('mousemove', mm); map.on('mouseup', mu);
    canvas.style.cursor = 'crosshair';
    draw = () => { map.off('mousedown', md); map.off('mousemove', mm); map.off('mouseup', mu); map.dragPan.enable(); canvas.style.cursor = ''; draw = null; };
  }

  /** 프레임 확정 → 견적 카드 */
  async function frame(geom, { label }) {
    if (S?.running) return;
    S = { geom, label, img: null, q: null, running: false };
    const me = S;
    showFrame(geom);
    cardBusy();
    const area = areaKm2(geom);
    // 실시간 분석(live): 영상 · 모델 · 범위 천장 · 해상도(칩 수 상한)는 서버가 정한다 — 화면은 범위만 보낸다(등록 영상 COG 포함 · r3-xi M11)
    const opts = { chip: 1024, overlap: 0.125, conf: 0.25, live: true, max_km2: Math.ceil(area * 1.05 + 1) };
    let q;
    try { q = await api('/jobs/quote', { method: 'POST', body: { kind: 'infer', aoi: geom, options: opts, demo } }); }
    catch (e) { devlog('quote', `${e.code || ''} ${e.message || ''}`); if (S === me) cardMsg('지금은 견적을 낼 수 없습니다'); return; }
    if (S !== me) return;                             // 그 사이 다른 읍면동을 골랐다
    // 영상이 이 범위와 겹치지 않을 때만 '영상 등록 필요'
    if (!q.imagery || (q.reasons || []).some((r) => r === 'no_imagery' || r === 'aoi_outside_footprint')) { cardNoImagery(); return; }
    const g = q.aoi || geom;                          // 서버가 영상 범위로 자르고 녹여 합친 한 면
    S.geom = g; showFrame(g);
    S.img = { id: q.imagery.id, gsd_m: q.imagery.gsd_m, epoch: q.imagery.year, name: {} };
    S.model = { id: q.model_id };
    // 실행은 견적과 같은 영상 · 모델 · 범위로(서버가 다시 고르지 않게)
    S.body = { kind: 'infer', model_id: q.model_id, imagery_id: q.imagery.id, aoi: g, options: opts, demo }; S.q = q;
    if (!q.model_id && q.allowed === false) { cardMsg('이 영상에 맞는 모델이 아직 없습니다'); return; }
    S.eta = await measuredEta(q.imagery.id, q.upsample || 1, q);
    if (S !== me) return;
    devlog('quote', { model: q.model_id, imagery: q.imagery.id, shards: q.shards, upsample: q.upsample || 1, eta: q.eta_s?.value, reasons: q.reasons, power: q.power_budget?.note });
    cardQuote();
  }

  /** 결과까지 걸릴 시간 — 같은 영상 · 같은 해상도로 끝난 최근 분석의 실제 속도(칩/벽시계 초)가 있으면 그것, 없으면 서버 견적 */
  async function measuredEta(imgId, up, q) {
    try {
      const j = await api('/jobs?state=done&limit=100');
      const done = (j.items || []).filter((x) => x.kind === 'infer' && x.chips_per_wall_s?.value > 0);
      // 가까운 기록부터: 같은 영상 · 같은 해상도 → 같은 영상 → 최근 분석 전체
      const tiers = [done.filter((x) => x.imagery_id === imgId && (x.options?.upsample || 1) === up), done.filter((x) => x.imagery_id === imgId), done];
      const rates = (tiers.find((t) => t.length) || []).map((x) => x.chips_per_wall_s.value).sort((a, b) => a - b);
      if (rates.length) {
        const med = rates[Math.floor(rates.length / 2)];
        return { value: Math.round(q.shards / med + 5), unit: 's', basis: 'estimate', as_of: new Date().toISOString(), source: '분석 작업 기록', note: `최근 같은 영상 분석 ${rates.length}건의 실제 속도` };
      }
    } catch { /* 기록 없음 */ }
    return q.eta_s;
  }
  function cardMsg(text, { record = true, sgg = false } = {}) {
    card.innerHTML = '';
    card.append(h('header.xa-h', {}, h('h3', { text: '이 범위 분석' }), xBtn()), h('p.xa-msg', { text }));
    if (sgg && region && !demo) card.append(h('div.xa-act', {}, h('button.t-btn.xa-sgg', { type: 'button', text: '전역 분석', onclick: () => { if (!S?.running) frameSgg(); } })));
    if (record) recordBtn();
    card.hidden = false;
  }
  /** 영상이 없는 범위 — 실행 없이 K9 '영상 등록 필요'(재생으로 대신하지 않는다) */
  function cardNoImagery() {
    card.innerHTML = '';
    const box = h('div.xa-empty');
    card.append(h('header.xa-h', {}, h('h3', { text: '이 범위 분석' }), xBtn()), box);
    // 다음 행동 = 영상 등록(LX 직원 화면) — 그 지역을 들고 간다
    const code = regionInfo?.()?.meta?.sgg_cd || region?.code || '';
    const act = !tenant && !demo ? { label: '영상 등록', href: '../lx-ingest/' + (code ? '?' + new URLSearchParams({ region: code }) : '') } : null;
    empty(box, { kind: 'ingest', compact: true, ...(act ? { action: act } : {}) });
    card.hidden = false;
  }
  /* 전체 범위 기록 보기 — 이 지역 시군 전역을 이미 끝낸 분석 기록이 있으면 보조 동작 하나(없으면 버튼 없음) */
  let region = null, record = null;
  async function findRecord(r) {
    if (!r?.bbox) return null;
    try {
      const j = await api('/jobs?' + new URLSearchParams({ state: 'done', kind: 'infer', limit: '200' }));
      const rb = r.bbox, rA = boxArea(rb) || 1;
      const hit = (j.items || []).filter((x) => x.aoi && !x.demo).find((x) => {
        const b = bboxOf(x.aoi), cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
        return cx >= rb[0] && cx <= rb[2] && cy >= rb[1] && cy <= rb[3] && boxArea(inter(b, rb)) / rA >= 0.5;
      });
      return hit ? hit.id : null;
    } catch { return null; }
  }
  function recordBtn() {
    if (!record || demo) return;
    const id = record;
    card.append(h('button.t-btn.t-btn--text.xa-rec', { type: 'button', text: '전체 범위 기록 보기', onclick: () => { if (!S?.running) replayJob(id, { label: region?.name, bbox: region?.bbox }); } }));
  }
  function cardBusy() {
    card.innerHTML = '';
    card.append(h('header.xa-h', {}, h('h3', { text: '이 범위 분석' }), xBtn()), h('div.t-progress.xa-indet', {}, h('i')));
    card.hidden = false;
  }
  const xBtn = () => h('button.xa-x', { type: 'button', 'aria-label': '닫기', html: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15"/></svg>', onclick: () => { if (S?.running) { card.hidden = true; return; } cancel(); } });
  // 120초 이상은 사람 말(분)로 — '약 1,069초' 대신 '약 18분'
  function etaHtml(v) {
    if (v == null) return '<b class="num">—</b>초';
    const n = Math.max(1, Math.round(v));
    return n < 120 ? `<b class="num">${nf(n)}</b>초` : `<b class="num">${nf(Math.round(n / 60))}</b>분`;
  }
  function cardQuote() {
    const { q, img, label } = S;
    card.innerHTML = '';
    const eta = S.eta?.value;
    const km2 = q.area_km2?.value ?? areaKm2(S.geom);
    const scope = label || `그린 범위 · ${km2 < 1 ? `${nf(Math.round(km2 * 1000) / 10)}ha` : `${nf(Math.round(km2 * 10) / 10)}㎢`}`;
    const sc = S.sgg ? q.scope || null : null;          // 시군구 분석 — 서버가 만든 범위 문장(답 · 확인 카드와 같은 글자)
    const why = !q.allowed ? reasonText(q.reasons) : '';
    card.append(...[
      h('header.xa-h', {}, h('h3', { text: '이 범위 분석' }), demo ? h('span.t-sig.xa-ex', { 'data-sig': 'ex', 'aria-label': '예시' }) : null, xBtn()),
      h('dl.xa-dl', {}, h('div', {}, h('dt', { text: '범위' }), h('dd', { text: scope })), h('div', {}, h('dt', { text: '영상' }), h('dd', { text: imageryLabel(img) }))),
      sc?.text ? h('p.xa-scope', { text: sc.text }) : null,
      h('p.xa-eta', { html: `결과까지 약 ${etaHtml(eta)}${sig(S.eta)}` }),
      why ? h('p.xa-msg', { text: why }) : null,
      h('div.xa-act', {},
        h('button.t-btn', { type: 'button', text: '실행', disabled: !q.allowed || undefined, onclick: run }),
        h('button.t-btn.t-btn--2', { type: 'button', text: '취소', onclick: cancel }))].filter(Boolean));
    if (!q.allowed) recordBtn();
    card.hidden = false;
  }
  const reasonText = (rs = []) => rs.includes('aoi_too_large') || rs.includes('too_large') ? (S?.sgg ? '범위가 너무 넓습니다' : '범위가 너무 넓습니다. 읍면동 하나를 골라 주세요')
    : rs.includes('power_budget') ? '잠시 뒤 시작합니다'
    : rs.includes('aoi_outside_footprint') ? '이 범위에는 분석할 영상이 없습니다'
    : rs.includes('demo_required') || rs.includes('imagery_forbidden') ? '이 계정으로는 이 영상을 분석할 수 없습니다'
    : rs.includes('quota_exceeded') ? '이번 달 분석 한도를 넘었습니다'
    : rs.includes('model_input_mismatch') ? '이 영상에 맞는 모델이 아직 없습니다' : '지금은 실행할 수 없습니다';

  /** 진행 카드 — 첫 칸이 끝나기 전(대기열 · 워커가 영상을 여는 동안)은 '잠시 뒤 시작합니다' + 움직이는 막대, 첫 칸부터 '분석 중 {p}%'.
      replay = 전체 범위 기록 보기: 범위 · 영상 두 줄 + 진행 {p}%, 취소 없음(속도·배속 문구 없음) */
  function cardRun({ replay = null, scope = null, rest = null } = {}) {
    card.innerHTML = '';
    const pct = h('b.num', { text: '0' }), bar = h('i', { style: { width: '0%' } });
    const line = h('p.xa-run', { text: replay ? '' : '잠시 뒤 시작합니다' });
    if (replay) line.append(pct, '%');
    const prog = h('div.t-progress.xa-bar', { role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, class: replay ? '' : 'is-prep' }, bar);
    card.append(...[
      h('header.xa-h', {}, h('h3', { text: replay ? '전체 범위 기록 보기' : '이 범위 분석' }), demo ? h('span.t-sig.xa-ex', { 'data-sig': 'ex', 'aria-label': '예시' }) : null, xBtn()),
      replay?.scope ? h('dl.xa-dl', {}, h('div', {}, h('dt', { text: '범위' }), h('dd', { text: replay.scope })), replay.img ? h('div', {}, h('dt', { text: '영상' }), h('dd', { text: replay.img })) : null) : null,
      !replay && scope ? h('p.xa-scope', { text: scope }) : null,
      line, prog,
      h('p.xa-got', { hidden: true }),
      !replay && rest ? restLine(rest) : null,
      replay ? null : h('div.xa-act', {}, h('button.t-btn.t-btn--2', { type: 'button', text: '취소', onclick: cancel }))].filter(Boolean));
    card.hidden = false;
    let prep = !replay;
    const where = h('span.xa-where');
    return { pct, bar, got: card.querySelector('.xa-got'),
      live() { if (!prep) return; prep = false; prog.classList.remove('is-prep'); line.textContent = '분석 중 '; line.append(pct, '%', where); },
      emd(nm) { where.textContent = nm ? ` · ${nm}` : ''; } };
  }
  /** 영상이 없는 나머지 — 한 줄 + '영상 등록'(LX 직원 · 관리자만 · 그 지역을 들고 간다) */
  function restLine(rest) {
    const code = regionInfo?.()?.meta?.sgg_cd || region?.code || '';
    const p = h('p.xa-rest', { text: rest });
    if (staff && !demo) p.append(' ', h('a.t-btn.t-btn--text.xa-reg', { href: '../lx-ingest/' + (code ? '?' + new URLSearchParams({ region: code }) : ''), text: '영상 등록' }));
    return p;
  }
  function cardDone(n, envN, { replay = false } = {}) {
    card.innerHTML = '';
    const scope = S?.scopeText || S?.label || null;
    card.append(...[
      h('header.xa-h', {}, h('h3', { text: replay && S?.record ? '전체 범위 기록 보기' : '이 범위 분석' }), demo ? h('span.t-sig.xa-ex', { 'data-sig': 'ex', 'aria-label': '예시' }) : null, xBtn()),
      scope ? h('dl.xa-dl', {}, h('div', {}, h('dt', { text: '범위' }), h('dd', { text: scope }))) : null,
      S?.scopeLine ? h('p.xa-scope', { text: S.scopeLine }) : null,
      h('p.xa-done', { html: `탐지 <b class="num">${nf(n)}</b>건${envN ? sig(envN) : ''}` }),
      S?.scopeRest && !replay ? restLine(S.scopeRest) : null].filter(Boolean));
    card.hidden = false;
  }

  /* 실행 → SSE → 차오름 */
  async function run() {
    if (!S?.q?.allowed || S.running) return;
    draw?.();
    S.running = true; onBusy?.(true);
    S.t0 = performance.now(); S.tFirst = 0; S.scopeText = S.label || null;
    if (S.sgg && S.q?.scope?.text) { S.scopeLine = S.q.scope.text; S.scopeRest = S.q.scope.rest || null; }
    const ui = cardRun({ scope: S.scopeLine || null, rest: S.scopeRest || null });
    clearResults();
    // 전역 프레임이 화면에 다 들어오게(차오름이 한눈에) — 시군구 전역은 지금 보는 곳(화면 중심)부터 차오르므로 카메라를 옮기지 않는다
    if (!S.sgg) stage.go(bboxOf(S.geom), { ms: 1250, maxZoom: 16 });
    let r;
    const me = S;
    try { r = await api('/jobs', { method: 'POST', body: { ...S.body, priority: S.sgg ? 1 : 0 } }); }   // 전역(긴 작업)은 한 단계 뒤 — 읍면동 실시간 분석이 먼저
    catch (e) { devlog('submit', `${e.code || ''} ${e.message || ''}`); if (me.stopped) return; S.running = false; onBusy?.(false); cardMsg(e.code === 'worker_unavailable' ? '분석 장비가 잠시 쉬고 있습니다' : '분석을 시작하지 못했습니다'); return; }
    // 제출 응답 전에 취소를 눌렀으면 — 화면은 이미 멈췄다. 서버 작업만 거둔다
    if (me.stopped) { api(`/jobs/${r.job.id}/cancel`, { method: 'POST' }).catch(() => {}); devlog('job', `${r.job.id} · 제출 직후 취소`); return; }
    S.job = r.job;
    devlog('job', `${r.job.id} · ${r.job.state} · shards ${r.job.shards_total ?? S.q.shards}`);
    consume(r.events_url, r.job, ui);
  }

  /* 판독 도형 — 6,000개씩 묶음 소스(한 번에 전부 다시 보내지 않는다 · 전역 결과 10만 개도 끊김 없이) */
  const CH = 6000;
  let buckets = [];
  function bucket(i) {
    const id = 'xa-all-' + i;
    if (!map.getSource(id)) {
      map.addSource(id, { type: 'geojson', data: EMPTY });
      map.addLayer({ id: id + '-f', type: 'fill', source: id, paint: { 'fill-color': TEAL, 'fill-opacity': 0.3 } }, 'xa-new-f');
      map.addLayer({ id: id + '-l', type: 'line', source: id, paint: { 'line-color': TEAL, 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.6, 15, 1.4] } }, 'xa-new-f');
    }
    return (buckets[i] ||= { id, f: [], dirty: false });
  }
  function pushAll(fs) {
    for (const f of fs) { let k = buckets.length - 1; if (k < 0 || buckets[k].f.length >= CH) k = buckets.length; const b = bucket(k); b.f.push(f); b.dirty = true; }
  }
  function flushAll() { for (const b of buckets) if (b.dirty) { set(b.id, { type: 'FeatureCollection', features: b.f }); b.dirty = false; } }
  function clearResults() {
    set('xa-cells', EMPTY); set('xa-new', EMPTY); for (const b of buckets) set(b.id, EMPTY); buckets = [];
    if (map.getLayer('xa-cells-l')) { map.setPaintProperty('xa-cells-l', 'line-opacity', 0.45); map.setPaintProperty('xa-cells', 'fill-opacity', 0.1); }
    if (map.getLayer('xa-mask')) map.setPaintProperty('xa-mask', 'fill-opacity', 0.24);
  }

  /** SSE 한 줄기를 지도에 — 실행(live)과 딥링크 다시 보기(replay)가 같은 길 */
  function consume(eventsUrl, job, ui, { replay = false, pace = null, since = 0, base = null } = {}) {
    const total = () => S.total || job.shards_total || S.q?.shards || 1;
    const cells = [], newF = [];
    // 이어 보기(base = 이미 그린 결과 수): 첫 화면부터 지금까지의 탐지 수 · 진행률 — 기록을 다시 받는 동안 적게 보였다가 따라잡지 않게
    const preDone = since && base != null ? (job.shards_done || 0) : 0;
    let done = preDone, n = base != null ? base : 0, dirty = false, errs = 0, finished = false, old = 0;
    // 진행 중 탐지 수 = 칸 겹침을 걸러 낸 수(스케줄러 counts.clean · 마감과 같은 규칙) — 칸별 합(n)은 끝에서 줄어든다(r3-xi 2차 must_fix 3).
    // 걸러 낸 수가 한 번도 안 오면(옛 기록 · 정리기 멈춤) 첫 칸 30초 뒤부터 칸별 합으로(다시 보기는 pace.ratio 로 최종에 맞춘다)
    let clean = null, t1 = 0;
    const me = S;
    const tick = setInterval(() => {
      const now = performance.now(), old = [];
      while (newF.length && now - newF[0].__t > 1250) { const f = newF.shift(); delete f.__t; old.push(f); }
      if (old.length) pushAll(old);
      if (dirty || old.length) { set('xa-cells', { type: 'FeatureCollection', features: cells }); set('xa-new', { type: 'FeatureCollection', features: newF }); flushAll(); dirty = false; }
    }, 240);
    const show = () => {
      if (!ui) return;
      if (done > 0) ui.live?.();
      const p = Math.min(100, Math.floor((done / total()) * 100));
      ui.pct.textContent = String(p); ui.bar.style.width = p + '%';
      ui.bar.parentElement.setAttribute('aria-valuenow', p);
      const shown = clean != null ? clean : (pace || (t1 && performance.now() - t1 > 30000)) ? Math.round(n * (pace?.ratio || 1)) : null;
      if (shown > 0) { ui.got.hidden = false; ui.got.innerHTML = `탐지 <b class="num">${nf(shown)}</b>건`; }
    };
    let stream = null, clock = 0;
    const end = (state, d) => {
      if (finished) return; finished = true;
      clearInterval(tick); clearInterval(clock); if (worker) { worker.terminate(); worker = null; }
      for (const f of newF) delete f.__t;
      pushAll(newF.splice(0)); flushAll();
      set('xa-new', EMPTY); set('xa-cells', { type: 'FeatureCollection', features: cells });
      stream?.close();
      S.running = false; onBusy?.(false);
      devlog('job end', `${job.id} · ${state}`);
      if (state === 'done') {
        const envN = !me.cls && d?.counts_env && typeof d.counts_env === 'object' && 'value' in d.counts_env ? d.counts_env : null;   // 대상(cls)을 고른 분석은 칸별 대상 수 합
        const tot = envN?.value ?? clean ?? n;
        cardDone(tot, envN, { replay });
        if (!replay && me.t0) {
          const m = { first_s: me.tFirst ? +((me.tFirst - me.t0) / 1000).toFixed(1) : null, total_s: +((performance.now() - me.t0) / 1000).toFixed(1), shards: done, n: tot };
          devlog('live', m); if (window.__xc) window.__xc.live = m;       // 실측(보고서 · e2e 용 · 화면엔 없음)
        }
        if (map.getLayer('xa-mask')) map.setPaintProperty('xa-mask', 'fill-opacity', 0.12);
        if (map.getLayer('xa-cells-l')) { map.setPaintProperty('xa-cells-l', 'line-opacity', 0.12); map.setPaintProperty('xa-cells', 'fill-opacity', 0.04); }
        onDone?.({ n: tot, job, replay });
      } else cardMsg(state === 'cancelled' ? '분석을 멈췄습니다' : '분석을 마치지 못했습니다');
    };
    const pend = [];
    let pumping = false;
    const pump = async () => {   // 도형은 도착 순서대로(동시 6개까지)
      if (pumping) return; pumping = true;
      while (pend.length) {
        const batch = pend.splice(0, 6);
        await Promise.all(batch.map(async (d) => {
          try {
            const j = await fetch(API.base + d.polys_url, { cache: 'no-store' }).then((x) => (x.ok ? x.json() : null));
            const t = performance.now();
            for (const f of keep(j?.features || [])) { f.__t = replay ? t - 1000 : t; newF.push(f); }
            dirty = true;
          } catch { /* 도형 없이 수만 */ }
        }));
      }
      pumping = false;
    };
    /* 압축 재생(pace) — 도형은 기록이 도착하는 대로 미리 받아 두고(동시 8), 칸은 실제 시각 × 압축률에 맞춰 내보낸다 */
    let inflight = 0, worker = null;
    const waiting = new Map();
    const prefetch = (d) => {
      inflight++;
      if (!worker) {
        worker = new Worker(new URL('./replay-worker.js', import.meta.url));
        worker.onmessage = (e) => { const r = waiting.get(e.data.key); waiting.delete(e.data.key); r?.(e.data.features || []); if (!waiting.size) { worker.terminate(); worker = null; } };
      }
      const key = d.shard_id || d.polys_url;
      d.__polys = new Promise((res) => waiting.set(key, res));
      worker.postMessage({ items: [{ key, url: API.base + d.polys_url }] });
    };
    let curEmd = null;
    const emdGeo = (cd) => (regionInfo?.()?.emds || []).find((e) => e.cd === cd);
    const onShard = (d) => {
      done++;
      if (d?.emd_cd && d.emd_cd !== curEmd && me.sgg) {          // 시군구 전역 — 지금 차오르는 읍면동
        curEmd = d.emd_cd; const e = emdGeo(curEmd);
        set('xa-emd', e?.geometry ? { type: 'Feature', properties: {}, geometry: e.geometry } : EMPTY);
        ui?.emd?.(e?.nm || ''); me.curEmd = e?.nm || null;
      }
      // 이어 보기(since): 떼어 낸 동안 끝난 칸의 도형은 이미 받은 결과(detections)로 그렸다 — 칸만
      if (since && Date.parse(d?.at || '') < since) {
        if (d?.bbox) { cells.push({ type: 'Feature', properties: {}, geometry: rectPoly(d.bbox) }); dirty = true; }
        if (base == null) n += me.cls ? clsN(d) : (d?.n || 0);
        else if (++old <= preDone) done--;              // 미리 센 칸(preDone)은 다시 세지 않는다
        show(); return;
      }
      if (!t1) t1 = performance.now();
      if (!replay && !me.tFirst) { me.tFirst = performance.now(); if (window.__xc) window.__xc.liveFirst = +((me.tFirst - me.t0) / 1000).toFixed(1); }
      const b = d?.bbox;
      if (b) { cells.push({ type: 'Feature', properties: {}, geometry: rectPoly(b) }); if (!replay || pace) bracket(b); dirty = true; }
      if (d?.n > 0 && d.polys_url) {
        n += me.cls ? clsN(d) : d.n;
        if (d.__polys) d.__polys.then((fs) => { const t = performance.now(); for (const f of keep(fs)) { f.__t = t; newF.push(f); } dirty = true; inflight--; });
        else { pend.push(d); pump(); }
      }
      show();
    };
    const onEvent = (name, d) => {
      if (finished) return;
      if (name === 'job.done' && me.sgg) set('xa-emd', EMPTY);
      if (name === 'job.started') { S.total = d?.shards_total || S.total; errs = 0; }
      else if (name === 'shard.done') onShard(d);
      else if (name === 'counts.clean') { clean = me.cls ? Object.entries(d?.cls || {}).filter(([k]) => k.startsWith(me.cls)).reduce((a, [, v]) => a + (+v || 0), 0) : (d?.n ?? clean); show(); }
      else if (name === 'job.done') { done = total(); show(); const wait = async () => { while (pend.length || pumping || inflight > 0) await new Promise((r) => setTimeout(r, 120)); setTimeout(() => end('done', d), 300); }; wait(); }
      else if (name === 'job.failed') end('failed', d);
      else if (name === 'job.cancelled') end('cancelled', d);
    };
    // 기록 시각: 이벤트 id(스트림 ms) → 없으면 d.at
    const tsOf = (d, id) => { const m = /^(\d{12,})-/.exec(String(id || '')); return m ? +m[1] : Date.parse(d?.at || '') || null; };
    const q = [];
    if (pace) {
      let w0 = null;
      pace.start.then(() => { w0 = performance.now(); });
      clock = setInterval(() => {
        if (w0 == null || finished) return;
        const el = performance.now() - w0;
        while (q.length && (q[0].t == null || (q[0].t - pace.t0) * pace.k <= el)) { const e = q.shift(); onEvent(e.name, e.d); if (finished) break; }
      }, 40);
    }
    stream = sse(eventsUrl.replace(/^.*\/api\/v1/, ''), {
      events: [...JOB_EVENTS, 'counts.clean'],
      on: (name, d, id) => {
        if (finished) return;
        if (!pace) return onEvent(name, d);
        if (name === 'shard.done' && d?.n > 0 && d.polys_url) { prefetch(d); pace.sum = (pace.sum || 0) + d.n; }
        // 칸 경계 겹침으로 칸별 합이 최종 수보다 크다 — 기록을 다 받으면 최종 수(counts_env)에 맞춰 진행 중 수를 줄인다
        if (name === 'job.done' && pace.sum) { const fin = d?.counts_env?.value ?? job.counts_env?.value; if (fin > 0) pace.ratio = fin / pace.sum; }
        q.push({ name, d, t: tsOf(d, id) });
        if (name === 'job.done' || name === 'job.failed' || name === 'job.cancelled') stream?.close();   // 기록은 다 받았다
      },
      onState: (s) => { if (s === 'error' && ++errs >= 3 && !finished) end('timeout'); if (s === 'open') errs = 0; },
    });
    me.stream = stream;
    me.endLocal = end;
    if (base != null && (preDone > 0 || base > 0)) show();
    // 떼어 내기(다른 지역으로 이동) — 서버 작업은 그대로, 화면 구독만 멈춘다
    me.detach = () => { if (finished) return; finished = true; clearInterval(tick); clearInterval(clock); if (worker) { worker.terminate(); worker = null; } stream?.close(); };
  }

  /* 칸 도착 브래킷(사진 위 흰 모서리 · 1250) — 화면에서 너무 작은 칸은 건너뛴다 */
  let live = 0;
  function bracket(b) {
    if (RM() || live > 28) return;
    const a = map.project([b[0], b[3]]), z = map.project([b[2], b[1]]);
    const w = z.x - a.x, hh = z.y - a.y;
    if (w < 10 || hh < 10) return;
    const el = document.createElement('i'); el.className = 'xa-bk';
    el.style.cssText = `transform:translate(${a.x.toFixed(1)}px,${a.y.toFixed(1)}px);width:${w.toFixed(1)}px;height:${hh.toFixed(1)}px`;
    host.append(el); live++;
    el.animate([{ opacity: 0 }, { opacity: 1, offset: 0.12 }, { opacity: 1, offset: 0.5 }, { opacity: 0 }], { duration: 1250, easing: 'linear' }).finished.then(() => { el.remove(); live--; }, () => { el.remove(); live--; });
  }

  /* ═══ 전역 분석(scope sgg) ═══ */
  const regionGeom = () => {
    const polys = [];
    for (const e of regionInfo?.()?.emds || []) { const g = e.geometry; if (g?.type === 'Polygon') polys.push(g.coordinates); else if (g?.type === 'MultiPolygon') polys.push(...g.coordinates); }
    return polys.length ? { type: 'MultiPolygon', coordinates: polys } : (region?.geometry || null);
  };
  async function frameSgg() {
    if (S?.running || !region) return;
    const geom = regionGeom();
    const label = region.name;
    S = { geom, label, img: null, q: null, running: false, sgg: true };
    const me = S;
    if (geom) showFrame(geom);
    cardBusy();
    const c = map.getCenter();
    const body = { kind: 'infer', options: { scope: 'sgg', sgg_cd: regionInfo?.()?.meta?.sgg_cd || region.code, center: [+c.lng.toFixed(6), +c.lat.toFixed(6)], chip: 1024, overlap: 0.125, conf: 0.25 }, demo };
    let q;
    try { q = await api('/jobs/quote', { method: 'POST', body }); }
    catch (e) { devlog('quote sgg', `${e.code || ''} ${e.message || ''}`); if (S === me) cardMsg('지금은 견적을 낼 수 없습니다', { sgg: true }); return; }
    if (S !== me) return;
    devlog('quote sgg', { imagery: q.imagery?.id, model: q.model_id, shards: q.shards, upsample: q.upsample, coverage: q.coverage?.value, reasons: q.reasons });
    if (!q.imagery || (q.reasons || []).includes('no_imagery')) { cardNoImagery(); return; }
    S.body = body; S.q = q;
    S.img = { id: q.imagery.id, gsd_m: q.imagery.gsd_m, epoch: q.imagery.year, name: {} };
    S.eta = await measuredEta(q.imagery.id, q.upsample || 1, q);
    if (S !== me) return;
    cardQuote();
  }
  /** 떼어 낸 전역 분석(지역 코드 → 작업 id) — 돌아오면 목록을 뒤지지 않고 그 작업에 바로 붙는다 */
  const parked = new Map();
  /** 다른 지역으로 이동 — 진행 중 작업은 서버에서 계속, 화면만 떼어 낸다(돌아오면 resume) */
  function detach() {
    if (!S?.running) return false;
    const me = S;
    if (me.sgg && me.job?.id) { const m = regionInfo?.()?.meta || {}; for (const c of [region?.code, m.sgg_cd, m.prev_cd, me.job.options?.sgg_cd]) if (c) parked.set(String(c), me.job.id); }
    me.detach?.();
    draw?.(); card.hidden = true; clearMap(); S = null; onBusy?.(false);
    devlog('detach', me.job?.id || '');
    return true;
  }
  /** 이어 보기 — 결과를 불러오는 동안에도 '분석 중 n%'(작업의 끝난 칸 수)를 바로 보인다('잠시 뒤 시작합니다'로 되돌아 보이지 않게) */
  function progressNow(ui, job) {
    const d = job?.shards_done || 0, t = job?.shards_total || 0;
    if (!ui || !d || !t) return;
    ui.live(); const p = Math.min(100, Math.floor((d / t) * 100));
    ui.pct.textContent = String(p); ui.bar.style.width = p + '%'; ui.bar.parentElement.setAttribute('aria-valuenow', p);
    ui.got.hidden = false; ui.got.textContent = '탐지 불러오는 중';
  }
  /** 이 지역에 진행 중인 전역 분석이 있으면 이어 보기 — 지금까지 결과(detections) + 남은 칸(SSE) */
  async function resume(r) {
    if (demo || tenant || !r || S?.running) return false;
    const meta = regionInfo?.()?.meta || {};
    const codes = [meta.sgg_cd, meta.prev_cd, r.code].filter(Boolean).map(String);
    let job = null;
    const pid = codes.map((c) => parked.get(c)).find(Boolean);
    if (pid) {
      try { const j = await api('/jobs/' + encodeURIComponent(pid)); if (['queued', 'running'].includes(j?.state)) job = j; } catch { /* 목록으로 */ }
      if (!job) for (const c of codes) parked.delete(c);
    }
    for (let t = 0; !job && t < 2; t++) {                // 목록 조회가 잠깐 실패하면 한 번 더
      try {
        for (const st of ['running', 'queued']) {
          const j = await api('/jobs?' + new URLSearchParams({ state: st, kind: 'infer', limit: '100' }));
          job = (j.items || []).find((x) => x.options?.scope === 'sgg' && codes.includes(String(x.options?.sgg_cd || '')));
          if (job) break;
        }
        break;
      } catch (e) { devlog('resume list', `${e.code || ''} ${e.status ?? 0}`); await new Promise((res) => setTimeout(res, 1200)); }
    }
    if (!job || S?.running) return false;
    if (job.shards_done == null || !job.result_set) { try { job = { ...job, ...(await api('/jobs/' + encodeURIComponent(job.id))) }; } catch { /* 목록 값으로 */ } }
    region = r;
    let since = Date.now();
    layers(); clearResults();
    const geom = regionGeom();
    const o = job.options || {};
    S = { geom, label: r.name, img: (catalog.items || []).find((x) => x.id === job.imagery_id) || null, q: { allowed: true, shards: job.shards_total },
      running: true, sgg: true, job, total: job.shards_total, scopeText: r.name, t0: 0, scopeLine: o.scope_text || null, scopeRest: o.scope_rest || null };
    const me = S;
    if (geom) showFrame(geom);
    onBusy?.(true);
    const ui = cardRun({ scope: S.scopeLine, rest: S.scopeRest });
    progressNow(ui, job);
    // 지금까지 결과 — 칸마다 기록된 도형(10,000개씩)
    let base = 0;
    try {
      for (let off = 0; off < 300000; off += 10000) {
        const fc = await api(`/results/${job.result_set}/features?` + new URLSearchParams({ limit: '10000', offset: String(off) }));
        if (S !== me) return true;
        pushAll(fc.features || []); flushAll(); base += (fc.features || []).length;
        if ((fc.features || []).length < 10000) break;
      }
    } catch (e) { devlog('resume features', String(e?.message || e)); base = null; }
    if (base != null) since = Date.now();              // 불러오는 동안 끝난 칸은 이미 받은 결과에 들어 있다 — 그 뒤 칸만 더한다
    if (S !== me) return true;
    devlog('resume', { job: job.id, base, done: job.shards_done });
    consume(`/events/jobs/${encodeURIComponent(job.id)}`, job, ui, { since, base });
    return true;
  }

  /** 말로 분석(에이전트 analysis_run → analysis_watch{job_id, sgg_cd}) — 제출된 그 작업에 붙어 결과가 읍면동 순으로 차오른다.
      이미 끝난 칸이 있으면(같은 지역 진행 중 작업에 연결) 지금까지 결과를 먼저 그리고 남은 칸을 잇는다. cls = 볼 대상(비닐하우스 등 · 없으면 전체) */
  async function watch(jobId, r, { cls = null, scope = null, rest = null } = {}) {
    if (!jobId || !r) return false;
    let job;
    try { job = await api('/jobs/' + encodeURIComponent(jobId)); } catch (e) { devlog('watch', `${e.code || ''} ${e.status ?? 0}`); return false; }
    if (S?.running) { if (S.job?.id === jobId) return true; detach(); }
    draw?.();
    region = r;
    layers(); clearResults();
    const geom = regionGeom();
    const label = r.name;
    const o = job.options || {};
    S = { geom, label, img: (catalog.items || []).find((x) => x.id === job.imagery_id) || null, q: { allowed: true, shards: job.shards_total },
      running: true, sgg: true, job, total: job.shards_total, scopeText: cls ? `${label} · ${cls}` : label, t0: performance.now(), cls,
      scopeLine: scope || o.scope_text || null, scopeRest: rest || o.scope_rest || null };
    const me = S;
    if (geom) showFrame(geom);
    onBusy?.(true);
    const ui = cardRun({ scope: S.scopeLine, rest: S.scopeRest });
    let since = 0, base = null;
    if (!['done', 'failed', 'cancelled'].includes(job.state)) progressNow(ui, job);
    const ended = ['done', 'failed', 'cancelled'].includes(job.state);
    if (!ended && (job.shards_done || 0) > 0 && job.result_set) {
      since = Date.now(); base = 0;
      try {
        for (let off = 0; off < 300000; off += 10000) {
          const fc = await api(`/results/${job.result_set}/features?` + new URLSearchParams({ limit: '10000', offset: String(off) }));
          if (S !== me) return true;
          const fs = keep(fc.features || []);
          pushAll(fs); flushAll(); base += fs.length;
          if ((fc.features || []).length < 10000) break;
        }
      } catch (e) { devlog('watch features', String(e?.message || e)); base = null; }
      if (base != null) since = Date.now();
    }
    if (S !== me) return true;
    devlog('watch', { job: job.id, state: job.state, done: job.shards_done, total: job.shards_total, cls, base });
    consume(`/events/jobs/${encodeURIComponent(job.id)}`, job, ui, { since, base });   // 끝난 작업은 기록을 처음부터 다시 받는다(같은 결과)
    return true;
  }
  /** 칸의 대상 수(classes{'비닐하우스_단동': n …} 중 cls 로 시작하는 것) — 없으면 칸 전체 */
  const clsN = (d) => { const c = d?.classes; if (!c || typeof c !== 'object') return d?.n || 0; return Object.entries(c).filter(([k]) => k.startsWith(S?.cls || '')).reduce((a, [, v]) => a + (+v || 0), 0); };
  const keep = (fs) => (S?.cls ? fs.filter((f) => String(f.properties?.cls || '').startsWith(S.cls)) : fs);

  /** 취소 — 누르는 즉시 카드가 '분석을 멈췄습니다'(낙관적). 서버 취소는 뒤에서 보내고, 결과가 오면 개발자 서랍에만 남긴다 */
  function cancel() {
    if (S?.running) {
      const me = S; me.stopped = true;
      if (me.endLocal) me.endLocal('cancelled');
      else { me.running = false; onBusy?.(false); cardMsg('분석을 멈췄습니다'); }     // 제출 응답 전 — run()이 서버 작업을 거둔다
      if (me.job) api(`/jobs/${me.job.id}/cancel`, { method: 'POST' }).then((r) => devlog('cancel', `${me.job.id} · ${r?.state || 'ok'}`), (e) => devlog('cancel', `${me.job.id} · ${e.code || e.message}`));
      return;
    }
    stop();
  }
  /** 분석 도구 끄기(카드 · 프레임 · 그리기) — 결과 도형은 지운다 */
  function stop() { if (S?.running) return false; draw?.(); close(); clearMap(); S = null; onDone?.(null); return true; }
  /** 분석 도구 켜기 — 고른 읍면동(frameGeo)이 있으면 그 경계를 프레임으로, 없으면 '읍면동을 누르거나 범위를 그리세요'.
      시군 전역은 실시간으로 받지 않는다 — 그 지역 전역 기록이 있으면 '전체 범위 기록 보기' 보조 동작 */
  function start(r, frameGeo = null) {
    drawOn();
    region = r || null; record = null;
    const my = region;
    findRecord(region).then((id) => {
      if (region !== my) return;
      record = id;
      // 이미 떠 있는 안내 카드(누르기 · 그리기)에 늦게 붙인다
      if (id && !S?.running && !card.hidden && !card.querySelector('.xa-rec') && card.querySelector('.xa-msg')) recordBtn();
    });
    if (frameGeo?.geometry) frame(frameGeo.geometry, { label: frameGeo.label });
    else { S = null; cardMsg(region ? '분석할 읍면동을 지도에서 누르거나 범위를 그리세요' : '지도 위에 분석할 범위를 끌어서 그리세요', { sgg: !!region }); }
  }
  /** 전체 범위 기록 보기(?job= 딥링크 포함) — 끝난 작업의 기록된 이벤트를 다시 받아 같은 결과를 지도에(칸 · 도형 · 탐지 수).
      오래 걸린 작업은 기록 시각을 짧게 줄여 흘린다(화면엔 속도·배속 문구를 쓰지 않는다 · 실제 걸린 시간은 개발자 서랍) */
  const PACE_S = 12;
  async function replayJob(id, { label = null, bbox = null } = {}) {
    try {
      const j = await api('/jobs/' + encodeURIComponent(id));
      if (!j?.aoi) return false;
      // 지역 이름은 작업 범위의 가운데가 그 지역 상자 안일 때만 쓴다
      const ab = bboxOf(j.aoi), cx = (ab[0] + ab[2]) / 2, cy = (ab[1] + ab[3]) / 2;
      if (!(bbox && cx >= bbox[0] && cx <= bbox[2] && cy >= bbox[1] && cy <= bbox[3])) label = null;
      layers();
      clearResults();
      const real = (Date.parse(j.finished_at) - Date.parse(j.started_at)) / 1000;
      const it = (catalog.items || []).find((x) => x.id === j.imagery_id);
      const o = j.options || {};
      const scope = label ? (o.scope_full === true || (o.scope === 'sgg' && o.coverage != null && o.coverage >= 0.95) ? `${label} 전역` : label) : null;   // 영상이 다 덮은 작업만 '전역'
      const fly = stage.go(bboxOf(j.aoi), { ms: 1250, maxZoom: 16 });
      const pace = j.state === 'done' && real > PACE_S * 1.5
        ? { t0: Date.parse(j.started_at), k: PACE_S / real, start: Promise.resolve(fly).then(() => new Promise((r) => setTimeout(r, 250))) }
        : null;
      devlog('record', { job: j.id, real_s: Math.round(real), shown_s: pace ? PACE_S : Math.round(real) });
      S = { geom: j.aoi, label, img: it || null, q: { allowed: false, shards: j.shards_total }, body: null, running: true, job: j, total: j.shards_total,
        scopeText: scope, record: true };
      showFrame(j.aoi);
      if (pace) {
        onBusy?.(true);
        const ui = cardRun({ replay: { scope, img: it ? imageryLabel(it) : null } });
        consume(`/events/jobs/${encodeURIComponent(id)}`, j, ui, { replay: true, pace });
      } else {
        cardBusy();
        consume(`/events/jobs/${encodeURIComponent(id)}`, j, null, { replay: true });
      }
      return true;
    } catch (e) { devlog('replay', String(e?.message || e)); return false; }
  }
  return { start, stop, detach, resume, frameSgg, watch, get running() { return !!S?.running; }, get active() { return !!(draw || S); }, get jobId() { return S?.job?.id || null; }, replayJob };
}
