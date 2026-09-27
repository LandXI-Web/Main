/* analyze.js — XI맵 분석(직원 · 영업): 프레임 → 견적 카드 → 실행 → 칩 단위로 판독이 지도에 차오름.
   · 프레임 = 지역 전역(시군구 경계 ∩ 영상 범위) 또는 지도 위에 끌어서 그린 사각형
   · 견적  = POST /jobs/quote(서버가 칩 수 · 예상 시간 · 전력 예산을 계산) — 넓은 범위는 해상도를 낮춰 다시 견적(S-8 서버 계획 전 어댑터)
   · 실행  = POST /jobs{kind:infer} → SSE /events/jobs/{id} : shard.done 마다 그 칸이 밝아지고 판독 도형이 도착(1250)
   · 영업  = demo:true(서버 강제) → 꼬리표 '예시' · 결과는 남지 않음
   숫자·문구는 사용자 말만. 칩 수 · 작업 id · 모델 id 는 개발자 서랍(devlog)으로. */
import { api, API } from '../kit/util.js';
import { sse } from '../../shared/api-v1.js';
import { h, esc, sig, devlog, toast, bboxOf } from '../kit/index.js';

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
function pickImagery(items, fb, { tenant }) {
  const c = items.filter((i) => i.role === 'imagery' && i.source === 'pmtiles' && i.bounds && i.gsd_m && i.gsd_m < 1 && !(tenant && i.tier === 'raw'))
    .map((i) => ({ i, ov: boxArea(inter(fb, i.bounds)) }))
    .filter((x) => x.ov > 0)
    .sort((a, b) => b.ov - a.ov || Math.abs(Math.log(a.i.gsd_m / 0.25)) - Math.abs(Math.log(b.i.gsd_m / 0.25)));
  return c[0]?.i || null;
}
function pickModel(models, img) {
  const c = models.filter((m) => (m.input || []).includes('ortho') && m.gsd_trained_m && m.perf?.chips_per_s?.value);
  c.sort((a, b) => Math.abs(Math.log(a.gsd_trained_m / img.gsd_m)) - Math.abs(Math.log(b.gsd_trained_m / img.gsd_m)));
  return c[0] || null;
}

/* ── 분석 도구 ── */
export function analyzer({ stage, host, catalog, who, demo, onBusy, onDone }) {
  const map = stage.map;
  let models = null, S = null, draw = null;
  const tenant = who?.me?.realm === 'tenant';

  /* 층: 마스크(프레임 밖 디밍) · 프레임 선 · 끝난 칸 · 도착 중 도형 · 판독 도형 */
  const src = (id) => map.getSource(id);
  const set = (id, fc) => src(id)?.setData(fc || EMPTY);
  function layers() {
    if (map.getSource('xa-mask')) return;
    for (const id of ['xa-mask', 'xa-frame', 'xa-cells', 'xa-new']) map.addSource(id, { type: 'geojson', data: EMPTY });
    map.addLayer({ id: 'xa-mask', type: 'fill', source: 'xa-mask', paint: { 'fill-color': '#F2F4F6', 'fill-opacity': 0.24, 'fill-opacity-transition': { duration: 750 } } }, 'slot-overlay');
    map.addLayer({ id: 'xa-cells', type: 'fill', source: 'xa-cells', paint: { 'fill-color': TEAL, 'fill-opacity': 0.1 } }, 'slot-overlay');
    map.addLayer({ id: 'xa-cells-l', type: 'line', source: 'xa-cells', paint: { 'line-color': TEAL, 'line-width': 0.5, 'line-opacity': 0.45 } }, 'slot-overlay');
    map.addLayer({ id: 'xa-new-f', type: 'fill', source: 'xa-new', paint: { 'fill-color': '#FFFFFF', 'fill-opacity': 0.5 } }, 'slot-overlay');
    map.addLayer({ id: 'xa-new-l', type: 'line', source: 'xa-new', paint: { 'line-color': '#FFFFFF', 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1, 15, 2] } }, 'slot-overlay');
    map.addLayer({ id: 'xa-frame-h', type: 'line', source: 'xa-frame', paint: { 'line-color': 'rgba(242,244,246,.55)', 'line-width': 5, 'line-blur': 2 } }, 'slot-overlay');
    map.addLayer({ id: 'xa-frame', type: 'line', source: 'xa-frame', paint: { 'line-color': '#FFFFFF', 'line-width': 1.6 } }, 'slot-overlay');
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
  function clearMap() { for (const id of ['xa-mask', 'xa-frame']) set(id, EMPTY); clearResults(); host.querySelectorAll('.xa-bk').forEach((e) => e.remove()); }

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
      if (Math.abs(a.x - z.x) < 14 || Math.abs(a.y - z.y) < 14) { if (S?.geom) showFrame(S.geom); return; }
      frame(rectPoly(b), { label: null });
    };
    map.on('mousedown', md); map.on('mousemove', mm); map.on('mouseup', mu);
    canvas.style.cursor = 'crosshair';
    draw = () => { map.off('mousedown', md); map.off('mousemove', mm); map.off('mouseup', mu); map.dragPan.enable(); canvas.style.cursor = ''; draw = null; };
  }

  /** 프레임 확정 → 견적 카드 */
  async function frame(geom, { label }) {
    if (S?.running) return;
    const fb = bboxOf(geom);
    const img = pickImagery(catalog.items || [], fb, { tenant });
    S = { geom, label, img, q: null, running: false };
    showFrame(geom);
    if (!img) { cardMsg('이 범위에는 분석할 영상이 없습니다'); return; }
    // 영상 범위 밖은 자른다(서버도 자르지만 면적 · 화면 프레임을 맞춘다)
    const g = clipToBox(geom, img.bounds) || geom;
    S.geom = g; showFrame(g);
    models ||= (await api('/registry/models').catch(() => ({ items: [] }))).items || [];
    const model = pickModel(models, img);
    if (!model) { cardMsg('이 영상에 맞는 모델이 아직 없습니다'); return; }
    S.model = model;
    cardBusy();
    const area = areaKm2(g);
    // 영상 해상도를 모델이 배운 해상도에 맞춘다(드론 1.4cm → 차량 모델 2cm 등) · 넓은 범위는 한 단계씩 더 낮춰 칩 수를 누른다
    const fit = img.gsd_m / (model.gsd_trained_m || img.gsd_m);
    const up0 = fit < 0.9 ? Math.max(0.25, Math.round(fit * 100) / 100) : 1;
    // 칩 수를 먼저 가늠해(격자 1024 · 겹침 128) 견적 한 번으로 — 넓으면 한 단계씩 낮춘 해상도에서 시작
    const est = (u) => (area * 1e6) / ((896 * img.gsd_m / u) ** 2);
    const up1 = [up0, 0.5, 0.25].filter((u) => u <= up0).find((u) => est(u) <= 1600) ?? 0.25;
    const opts = { chip: 1024, overlap: 0.125, conf: 0.25, max_km2: Math.ceil(area * 1.05 + 1), ...(up1 < 1 ? { upsample: up1 } : {}) };
    const body = { kind: 'infer', model_id: model.id, imagery_id: img.id, aoi: g, options: opts, demo };
    let q;
    try {
      q = await api('/jobs/quote', { method: 'POST', body });
      // 넓은 범위: 칩이 많으면 해상도를 한 단계씩 낮춰 다시 견적 — S-8 서버 계획(shard 상한 · too_large)이 오면 서버가 정한다
      for (const up of [0.5, 0.25]) {
        if (q.shards <= 1600) break;
        if (up >= (body.options.upsample || 1)) continue;
        body.options = { ...opts, upsample: up };
        q = await api('/jobs/quote', { method: 'POST', body });
      }
    } catch (e) { devlog('quote', `${e.code || ''} ${e.message || ''}`); cardMsg('지금은 견적을 낼 수 없습니다'); return; }
    S.body = body; S.q = q;
    S.eta = await measuredEta(img.id, body.options.upsample || 1, q);
    devlog('quote', { model: model.id, imagery: img.id, shards: q.shards, upsample: body.options.upsample || 1, eta: q.eta_s?.value, reasons: q.reasons, power: q.power_budget?.note });
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
  function cardMsg(text) {
    card.innerHTML = '';
    card.append(h('header.xa-h', {}, h('h3', { text: '이 범위 분석' }), xBtn()), h('p.xa-msg', { text }));
    card.hidden = false;
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
    const scope = label ? `${label} 전역` : `그린 범위 · ${km2 < 1 ? `${nf(Math.round(km2 * 1000) / 10)}ha` : `${nf(Math.round(km2 * 10) / 10)}㎢`}`;
    const why = !q.allowed ? reasonText(q.reasons) : '';
    card.append(...[
      h('header.xa-h', {}, h('h3', { text: '이 범위 분석' }), demo ? h('span.t-sig.xa-ex', { 'data-sig': 'ex', 'aria-label': '예시' }) : null, xBtn()),
      h('dl.xa-dl', {}, h('div', {}, h('dt', { text: '범위' }), h('dd', { text: scope })), h('div', {}, h('dt', { text: '영상' }), h('dd', { text: imageryLabel(img) }))),
      h('p.xa-eta', { html: `결과까지 약 ${etaHtml(eta)}${sig(S.eta)}` }),
      why ? h('p.xa-msg', { text: why }) : null,
      h('div.xa-act', {},
        h('button.t-btn', { type: 'button', text: '실행', disabled: !q.allowed || undefined, onclick: run }),
        h('button.t-btn.t-btn--2', { type: 'button', text: '취소', onclick: cancel }))].filter(Boolean));
    card.hidden = false;
  }
  const reasonText = (rs = []) => rs.includes('aoi_too_large') || rs.includes('too_large') ? '범위가 너무 넓습니다. 조금 좁혀 그려 주세요'
    : rs.includes('power_budget') ? '다른 분석이 끝나면 바로 시작할 수 있습니다'
    : rs.includes('aoi_outside_footprint') ? '이 범위에는 분석할 영상이 없습니다'
    : rs.includes('demo_required') || rs.includes('imagery_forbidden') ? '이 계정으로는 이 영상을 분석할 수 없습니다'
    : rs.includes('quota_exceeded') ? '이번 달 분석 한도를 넘었습니다'
    : rs.includes('model_input_mismatch') ? '이 영상에 맞는 모델이 아직 없습니다' : '지금은 실행할 수 없습니다';

  /** 진행 카드 — 첫 칸이 끝나기 전(워커가 영상을 여는 동안)은 '영상 준비 중' + 움직이는 막대, 첫 칸부터 '분석 중 {p}%'.
      replay = 끝난 작업 다시 보기: 범위 · 영상 두 줄과 압축 한 줄('실제 18분 · 12초로 압축'), 취소 없음 */
  function cardRun({ replay = null } = {}) {
    card.innerHTML = '';
    const pct = h('b.num', { text: '0' }), bar = h('i', { style: { width: '0%' } });
    const line = h('p.xa-run', { text: replay ? '분석 중 ' : '영상 준비 중' });
    if (replay) line.append(pct, '%');
    const prog = h('div.t-progress.xa-bar', { role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, class: replay ? '' : 'is-prep' }, bar);
    card.append(...[
      h('header.xa-h', {}, h('h3', { text: '이 범위 분석' }), demo ? h('span.t-sig.xa-ex', { 'data-sig': 'ex', 'aria-label': '예시' }) : null, xBtn()),
      replay?.scope ? h('dl.xa-dl', {}, h('div', {}, h('dt', { text: '범위' }), h('dd', { text: replay.scope })), replay.img ? h('div', {}, h('dt', { text: '영상' }), h('dd', { text: replay.img })) : null) : null,
      line, prog,
      h('p.xa-got', { hidden: true }),
      replay?.pace ? h('p.xa-pace', { text: replay.pace }) : null,
      replay ? null : h('div.xa-act', {}, h('button.t-btn.t-btn--2', { type: 'button', text: '취소', onclick: cancel }))].filter(Boolean));
    card.hidden = false;
    let prep = !replay;
    return { pct, bar, got: card.querySelector('.xa-got'),
      live() { if (!prep) return; prep = false; prog.classList.remove('is-prep'); line.textContent = '분석 중 '; line.append(pct, '%'); } };
  }
  function cardDone(n, envN) {
    card.innerHTML = '';
    card.append(...[
      h('header.xa-h', {}, h('h3', { text: '이 범위 분석' }), demo ? h('span.t-sig.xa-ex', { 'data-sig': 'ex', 'aria-label': '예시' }) : null, xBtn()),
      S?.scopeText ? h('dl.xa-dl', {}, h('div', {}, h('dt', { text: '범위' }), h('dd', { text: S.scopeText }))) : null,
      h('p.xa-done', { html: `탐지 <b class="num">${nf(n)}</b>건${envN ? sig(envN) : ''}` }),
      S?.paceText ? h('p.xa-pace', { text: S.paceText }) : null].filter(Boolean));
    card.hidden = false;
  }

  /* 실행 → SSE → 차오름 */
  async function run() {
    if (!S?.q?.allowed || S.running) return;
    draw?.();
    S.running = true; onBusy?.(true);
    const ui = cardRun();
    clearResults();
    // 전역 프레임이 화면에 다 들어오게(차오름이 한눈에)
    stage.go(bboxOf(S.geom), { ms: 1250, maxZoom: 16 });
    let r;
    const me = S;
    try { r = await api('/jobs', { method: 'POST', body: { ...S.body, priority: 0 } }); }
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
  function consume(eventsUrl, job, ui, { replay = false, pace = null } = {}) {
    const total = () => S.total || job.shards_total || S.q?.shards || 1;
    const cells = [], newF = [];
    let done = 0, n = 0, dirty = false, errs = 0, finished = false;
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
      if (n > 0) { ui.got.hidden = false; ui.got.innerHTML = `탐지 <b class="num">${nf(Math.round(n * (pace?.ratio || 1)))}</b>건`; }
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
        const envN = d?.counts_env && typeof d.counts_env === 'object' && 'value' in d.counts_env ? d.counts_env : null;
        const tot = envN?.value ?? n;
        cardDone(tot, envN);
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
            for (const f of j?.features || []) { f.__t = replay ? t - 1000 : t; newF.push(f); }
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
    const onShard = (d) => {
      done++;
      const b = d?.bbox;
      if (b) { cells.push({ type: 'Feature', properties: {}, geometry: rectPoly(b) }); if (!replay || pace) bracket(b); dirty = true; }
      if (d?.n > 0 && d.polys_url) {
        n += d.n;
        if (d.__polys) d.__polys.then((fs) => { const t = performance.now(); for (const f of fs) { f.__t = t; newF.push(f); } dirty = true; inflight--; });
        else { pend.push(d); pump(); }
      }
      show();
    };
    const onEvent = (name, d) => {
      if (finished) return;
      if (name === 'job.started') { S.total = d?.shards_total || S.total; errs = 0; }
      else if (name === 'shard.done') onShard(d);
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
  /** 분석 도구 켜기 — 지역이 있으면 그 전역을 프레임으로, 없으면 그리기만 */
  function start(region) {
    drawOn();
    if (region?.geometry) frame(region.geometry, { label: region.name });
    else if (region?.bbox) frame(rectPoly(region.bbox), { label: region.name });
    else { card.innerHTML = ''; card.append(h('header.xa-h', {}, h('h3', { text: '이 범위 분석' }), xBtn()), h('p.xa-msg', { text: '지도 위에 분석할 범위를 끌어서 그리세요' })); card.hidden = false; }
  }
  /** ?job= 딥링크 — 끝난 작업의 기록된 이벤트를 다시 받아 같은 결과를 지도에(칸 · 도형 · 탐지 수) */
  /** 끝난 작업이 오래 걸렸으면(목표의 1.5배 초과) 실제 기록 시각을 목표 초로 압축해 다시 흘린다. 카드에 한 줄: '실제 18분 · 12초로 압축' */
  const PACE_S = 12;
  const humanDur = (s) => (s >= 90 ? `${nf(Math.round(s / 60))}분` : `${nf(Math.round(s))}초`);
  async function replayJob(id, { label = null, bbox = null } = {}) {
    try {
      const j = await api('/jobs/' + encodeURIComponent(id));
      if (!j?.aoi) return false;
      // 지역 이름은 작업 범위의 가운데가 그 지역 상자 안일 때만 쓴다
      const ab = bboxOf(j.aoi), cx = (ab[0] + ab[2]) / 2, cy = (ab[1] + ab[3]) / 2;
      if (!(bbox && cx >= bbox[0] && cx <= bbox[2] && cy >= bbox[1] && cy <= bbox[3])) label = null;
      layers();
      const real = (Date.parse(j.finished_at) - Date.parse(j.started_at)) / 1000;
      const it = (catalog.items || []).find((x) => x.id === j.imagery_id);
      const scope = label ? `${label} 전역` : null;
      const fly = stage.go(bboxOf(j.aoi), { ms: 1250, maxZoom: 16 });
      const pace = j.state === 'done' && real > PACE_S * 1.5
        ? { t0: Date.parse(j.started_at), k: PACE_S / real, start: Promise.resolve(fly).then(() => new Promise((r) => setTimeout(r, 250))) }
        : null;
      S = { geom: j.aoi, label, img: it || null, q: { allowed: false, shards: j.shards_total }, body: null, running: true, job: j, total: j.shards_total,
        scopeText: scope, paceText: pace ? `실제 ${humanDur(real)} · ${PACE_S}초로 압축` : null };
      showFrame(j.aoi);
      if (pace) {
        onBusy?.(true);
        const ui = cardRun({ replay: { scope, img: it ? imageryLabel(it) : null, pace: S.paceText } });
        consume(`/events/jobs/${encodeURIComponent(id)}`, j, ui, { replay: true, pace });
      } else {
        cardBusy();
        consume(`/events/jobs/${encodeURIComponent(id)}`, j, null, { replay: true });
      }
      return true;
    } catch (e) { devlog('replay', String(e?.message || e)); return false; }
  }
  return { start, stop, get running() { return !!S?.running; }, get active() { return !!(draw || S); }, replayJob };
}
