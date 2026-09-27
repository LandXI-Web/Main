/* gov-fusion — 지자체 담당자 첫 화면. 정문(POST /auth/login) → 관내 지도 → 대장 올리기 → 열 확인 → 결합(PNU 사다리)
   → 대장 × AI 판독 × V-World 융합 → ⌘K(vLLM) 한 문장 → 지도 채색 · 집계 · 목록 → 필지 카드 → 현장 배정(실제 쓰기).
   숫자는 모두 이 브라우저가 올린 대장과 AI 색인(정본 PMTiles)에서 센다. 서버 쓰기는 상태 전이 한 곳뿐. */
import { API, api, probe, session } from '../../shared/api-v1.js';
import { readLedger, guessColumns, ledgerKind, ROLES } from './ledger.js';
import { AiIndex } from './aiindex.js';
import { matchLedger } from './match.js';
import { plan, run, AI_FIELDS, VW_FIELDS } from './ask.js';

const $ = (s) => document.querySelector(s);
const DEV = new URLSearchParams(location.search).has('dev');
const nf = (v, d = 0) => (v === null || v === undefined || Number.isNaN(+v) ? '—' : Number(v).toLocaleString('ko-KR', { maximumFractionDigits: d, minimumFractionDigits: d }));
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ── 관할(지역 = 변수) ── 기관 세션의 tenant_id 로 고른다. AI 색인이 없는 관할은 '판독 전'으로 동작한다. */
const REGIONS = {
  namwon: { name: '남원시', sgg: ['52190'], sggName: '남원시', bbox: [127.18, 35.30, 127.68, 35.56], ai: '/landxi/data/survey/namwon-parcel-survey.pmtiles' },
  'gwangju-jeonnam': { name: '광주·전남', sgg: ['29', '46'], sggName: '', bbox: [125.9, 34.2, 127.9, 35.45], ai: null },
};
const KOREA = [124.6, 33.0, 131.0, 38.7];
const C = { k1: '#0FA9A0', k2: '#FF5A4E', k3: '#FFB633', k4: '#9B7BFF', q: '#2F8BFF' };

const S = {
  me: null, region: null, index: null, emd: new Map(),
  ledger: null, cols: null, kind: 'generic',
  fused: [],          // i → { ...대장 열, ...AI 열, ...V-World 열, _pnu, _bb }
  byPnu: new Map(), matched: null, cats: null, active: null, query: null, sel: null,
  dev: {},
};

/* ═════════════ 지도 ═════════════ */
const proto = new pmtiles.Protocol();
maplibregl.addProtocol('pmtiles', proto.tile);
const map = new maplibregl.Map({
  container: 'map', attributionControl: { compact: true }, bounds: KOREA, fitBoundsOptions: { padding: 40 }, maxPitch: 45, dragRotate: false,
  style: {
    version: 8,
    sources: { vw: { type: 'raster', tiles: ['https://xdworld.vworld.kr/2d/Satellite/service/{z}/{x}/{y}.jpeg'], tileSize: 256, maxzoom: 19, attribution: 'V-World 위성' } },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': '#0B0D10' } },
      { id: 'vw', type: 'raster', source: 'vw', paint: { 'raster-saturation': -0.3, 'raster-brightness-max': 0.86, 'raster-contrast': 0.06, 'raster-fade-duration': 240 } },
    ],
  },
});
const mapReady = new Promise((res) => map.once('load', res));

async function mountRegionLayers() {
  await mapReady;
  const R = S.region;
  if (!map.getSource('sgg')) {
    map.addSource('sgg', { type: 'vector', url: 'pmtiles://' + API.base + '/tiles/pmtiles/reference/sigungu.pmtiles' });
    const mine = R.sgg ? ['any', ...R.sgg.map((c) => ['==', ['slice', ['get', 'code'], 0, c.length], c])] : ['==', 1, 0];
    map.addLayer({ id: 'sgg-dim', type: 'fill', source: 'sgg', 'source-layer': 'sigungu', filter: ['!', mine], paint: { 'fill-color': '#010102', 'fill-opacity': R.sgg ? ['interpolate', ['linear'], ['zoom'], 10.5, 0.42, 12, 0] : 0 } });
    map.addLayer({ id: 'sgg-glow', type: 'line', source: 'sgg', 'source-layer': 'sigungu', filter: mine, paint: { 'line-color': '#FFFFFF', 'line-width': 7, 'line-opacity': ['interpolate', ['linear'], ['zoom'], 10.5, 0.12, 12, 0], 'line-blur': 4 } });
    map.addLayer({ id: 'sgg-line', type: 'line', source: 'sgg', 'source-layer': 'sigungu', filter: mine, paint: { 'line-color': '#FFFFFF', 'line-width': 1.6, 'line-opacity': ['interpolate', ['linear'], ['zoom'], 10.5, 0.9, 12, 0] } });
  }
  if (R.ai && !map.getSource('sv')) {
    const url = location.origin + R.ai;
    S.index = new AiIndex(url);
    proto.add(S.index.pm);
    map.addSource('sv', { type: 'vector', url: 'pmtiles://' + url, promoteId: { parcels: 'pnu' } });
    const k = ['coalesce', ['feature-state', 'k'], 0];
    map.addLayer({ id: 'lg-fill', type: 'fill', source: 'sv', 'source-layer': 'parcels',
      paint: { 'fill-color': ['match', k, 1, C.k1, 2, C.k2, 3, C.k3, 4, C.k4, 9, C.q, '#000000'],
        'fill-opacity': ['interpolate', ['linear'], ['zoom'], 11, ['match', k, 0, 0, 1, 0.26, 0.95], 15, ['match', k, 0, 0, 1, 0.1, 0.62]] } }, 'sgg-glow');
    map.addLayer({ id: 'lg-glow', type: 'line', source: 'sv', 'source-layer': 'parcels',
      paint: { 'line-color': ['match', k, 2, C.k2, 3, C.k3, 4, C.k4, 9, C.q, '#000000'], 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 3, 16, 8], 'line-blur': ['interpolate', ['linear'], ['zoom'], 11, 2, 16, 6],
        'line-opacity': ['match', k, 0, 0, 1, 0, 0.55] } }, 'sgg-glow');
    map.addLayer({ id: 'lg-line', type: 'line', source: 'sv', 'source-layer': 'parcels', minzoom: 12.5,
      paint: { 'line-color': ['match', k, 2, C.k2, 3, C.k3, 4, C.k4, 9, '#FFFFFF', '#FFFFFF'], 'line-width': ['interpolate', ['linear'], ['zoom'], 12.5, 0.3, 16, 1.2],
        'line-opacity': ['match', k, 0, 0, 1, 0.22, 0.95] } }, 'sgg-glow');
    map.addLayer({ id: 'lg-hl', type: 'line', source: 'sv', 'source-layer': 'parcels', filter: ['==', ['get', 'pnu'], '__'], paint: { 'line-color': '#FFFFFF', 'line-width': 3 } });
    map.on('click', 'lg-fill', (e) => { const f = e.features && e.features[0]; if (f && S.byPnu.has(f.properties.pnu)) openCard(f.properties.pnu); });
    map.on('mousemove', 'lg-fill', (e) => { const f = e.features && e.features[0]; map.getCanvas().style.cursor = f && S.byPnu.has(f.properties.pnu) ? 'pointer' : ''; });
    map.on('mouseleave', 'lg-fill', () => { map.getCanvas().style.cursor = ''; });
  }
}
const cam = (bb, pad = {}, duration = 2400) => map.fitBounds(bb, { padding: { left: 440, right: 60, top: 80, bottom: 120, ...pad }, duration, easing: (t) => 1 - Math.pow(1 - t, 4), maxZoom: 16.5 });

/* ═════════════ 정문 ═════════════ */
function showGate(msg = '') {
  document.body.dataset.state = 'gate';
  $('#gate').hidden = false; $('#sheet').hidden = true; $('#ask').hidden = true; $('#btn-out').hidden = true;
  $('#mast-region').textContent = '';
  $('#g-err').textContent = msg;
  const sel = $('#g-tenant');
  if (!sel.options.length) for (const [id, r] of Object.entries(REGIONS)) sel.add(new Option(r.name, id));
  setTimeout(() => $('#g-login').focus(), 50);
}
$('#gate-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#g-err').textContent = '';
  const btn = e.submitter || $('#gate-form button'); btn.disabled = true;
  try {
    const r = await fetch(API.prefix + '/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ realm: 'tenant', tenant_id: $('#g-tenant').value, login: $('#g-login').value.trim(), password: $('#g-pw').value }) });
    const j = await r.json().catch(() => null);
    if (!r.ok) { $('#g-err').textContent = (j && j.error && j.error.message) || '로그인하지 못했습니다'; $('#g-pw').select(); return; }
    session.set(j);
    $('#g-pw').value = '';
    await enter();
  } catch { $('#g-err').textContent = '서버에 연결하지 못했습니다'; }
  finally { btn.disabled = false; }
});
$('#btn-out').addEventListener('click', async () => {
  try { await api('/auth/logout', { method: 'POST' }); } catch { /* */ }
  session.clear(); location.reload();
});

async function enter() {
  let me;
  try { me = await api('/me'); } catch (e) { session.clear(); return showGate(e.status === 401 ? '' : '서버에 연결하지 못했습니다'); }
  if (me.realm !== 'tenant') { return showGate('기관 계정으로 들어오세요'); }
  S.me = me;
  S.region = REGIONS[me.tenant_id] || { name: me.tenant_id, sgg: null, bbox: KOREA, ai: null };
  $('#gate').hidden = true; $('#btn-out').hidden = false;
  $('#mast-region').textContent = S.region.name;
  document.body.dataset.state = 'drop';
  await mountRegionLayers();
  cam(S.region.bbox, { left: 420 }, 2400);
  setTimeout(() => { $('#sheet').hidden = false; }, 500);
  $('#ask').hidden = false;
  loadTodo(); loadEmd(); health();
}

async function health() {
  const f = $('#fresh');
  let llm = false;
  try { const r = await fetch('http://127.0.0.1:8000/v1/models', { cache: 'no-store' }); llm = r.ok; } catch { /* */ }
  f.dataset.ok = llm ? '1' : '0';
  f.title = llm ? '연결됨' : 'AI 비서 연결 없음';
}

/* 오늘 할 일 — 기관의 현장 확인 흐름(실태조사 상태 기록) */
async function loadTodo() {
  const ul = $('#todo'); ul.innerHTML = '';
  try {
    const j = await api('/survey/findings?limit=1');
    const c = j.counts || {};
    ul.innerHTML = `<li>현장 확인 배정<b>${nf(c.assigned)}</b></li><li>판정 대기<b>${nf(c.inspected)}</b></li>`;
  } catch { /* 이 기관은 실태조사 기록이 없다 — 줄을 두지 않는다 */ }
}
async function loadEmd() {
  try {
    const j = await api('/survey/stats?by=emd');
    for (const it of j.items || []) if (it.bbox && it.bbox.length === 4) S.emd.set(it.cd, { name: it.key, bbox: it.bbox });
  } catch { /* 색인 없는 관할 */ }
}

/* ═════════════ 올리기 → 열 확인 ═════════════ */
const pane = (name) => { for (const p of document.querySelectorAll('.gf-pane')) p.hidden = p.dataset.pane !== name; document.body.dataset.state = name; };
const drop = $('#drop');
$('#file').addEventListener('change', (e) => { const f = e.target.files && e.target.files[0]; if (f) take(f); e.target.value = ''; });
addEventListener('dragover', (e) => { e.preventDefault(); if (document.body.dataset.state === 'drop') drop.dataset.over = '1'; });
addEventListener('dragleave', (e) => { if (e.target === document.documentElement || !e.relatedTarget) drop.dataset.over = '0'; });
addEventListener('drop', (e) => { e.preventDefault(); drop.dataset.over = '0'; const f = e.dataTransfer.files && e.dataTransfer.files[0]; if (f && S.me) take(f); });

async function take(file) {
  drop.dataset.busy = '1';
  const t0 = performance.now();
  try {
    S.ledger = await readLedger(file);
  } catch (e) { toast(e.message || '파일을 읽지 못했습니다'); drop.dataset.busy = '0'; return; }
  drop.dataset.busy = '0';
  S.dev.read_ms = Math.round(performance.now() - t0);
  S.cols = guessColumns(S.ledger.headers, S.ledger.rows);
  S.kind = ledgerKind(S.cols, S.ledger.rows);
  renderCols();
  pane('cols');
  devOut();
}
function renderCols() {
  $('#file-name').innerHTML = `<span>${esc(S.ledger.name)}</span><span class="gf-rate">${nf(S.ledger.rows.length)}행</span>`;
  const tb = $('#cols'); tb.innerHTML = '';
  for (const c of S.cols) {
    const tr = document.createElement('tr'); tr.dataset.role = c.role; tr.dataset.key = ['pnu', 'addr', 'jibun'].includes(c.role) ? '1' : '0';
    tr.innerHTML = `<td><b>${esc(c.col)}</b><span>${esc(c.sample)}</span></td><td><select aria-label="${esc(c.col)}의 뜻">${ROLES.map(([k, l]) => `<option value="${k}"${k === c.role ? ' selected' : ''}>${l}</option>`).join('')}</select></td>`;
    tr.querySelector('select').addEventListener('change', (e) => { c.role = e.target.value; tr.dataset.role = c.role; tr.dataset.key = ['pnu', 'addr', 'jibun'].includes(c.role) ? '1' : '0'; hint(); });
    tb.appendChild(tr);
  }
  hint();
}
function hint() {
  const has = (r) => S.cols.some((c) => c.role === r);
  const ok = has('pnu') || has('addr');
  $('#btn-join').disabled = !ok;
  $('#cols-hint').textContent = !ok ? '필지번호 또는 소재지 열을 골라 주세요' : S.kind === 'farm_ledger' ? '농지 대장으로 읽었습니다' : '';
}
$('#btn-reset1').addEventListener('click', reset);
$('#btn-reset2').addEventListener('click', reset);
function reset() {
  clearStates(); S.ledger = null; S.fused = []; S.byPnu.clear(); S.cats = null; S.active = null; S.query = null;
  $('#plan').hidden = true; $('#ask-in').disabled = true; $('#ask-in').value = ''; closeCard();
  pane('drop'); cam(S.region.bbox, { left: 420 }, 1600);
}

/* ═════════════ 결합 ═════════════ */
$('#btn-join').addEventListener('click', join);
async function join() {
  pane('fused');
  $('#fused-name').textContent = S.ledger.name;
  $('#rate').innerHTML = '';
  $('#cats').innerHTML = ''; $('#list').innerHTML = ''; $('.gf-acts--end').hidden = true;
  setHero('결합 중', 0, { dot: C.k1 });
  const lad = $('#ladder'); lad.innerHTML = '<i data-k="direct"></i><i data-k="jibun"></i><i data-k="vworld"></i><i data-k="miss"></i>';
  const N = S.ledger.rows.length;
  const t0 = performance.now();
  const upd = (c) => { for (const k of ['direct', 'jibun', 'vworld', 'miss']) lad.querySelector(`[data-k="${k}"]`).style.width = (100 * (c[k] || 0) / N) + '%'; };
  const res = await matchLedger({
    rows: S.ledger.rows, cols: S.cols, index: S.index,
    region: { name: S.region.sggName || '', sgg: S.region.sgg, emdBBox: (cd) => (S.emd.get(cd) || {}).bbox },
    onStep: (s) => {
      if (s.phase === 'keys') setHeroLabel(`소재지 해석 ${nf(s.resolved || 0)}/${nf(s.keys)}`);
      else if (s.phase === 'tiles') setHeroLabel(`AI 판독 불러오기 ${nf(s.tiles || 0)}/${nf(s.tilesN || 0)}`);
      else if (s.phase === 'verify' || s.phase === 'vworld') { setHeroLabel('필지 확인'); upd(s.counts); }
    },
  });
  S.dev.match_ms = Math.round(performance.now() - t0);
  S.matched = res;
  upd(res.counts);
  // 결합표(대장 열 × AI 열 × V-World 열)
  const areaCol = (S.cols.find((c) => c.role === 'area') || {}).col;
  S.fused = S.ledger.rows.map((r, i) => {
    const m = res.rows[i]; if (!m.pnu) return null;
    const ix = S.index && S.index.get(m.pnu);
    const o = {};
    for (const c of S.cols) if (c.role !== 'skip') o[c.col] = c.col === areaCol ? +String(r[c.col]).replace(/,/g, '') : r[c.col];
    if (ix) { for (const [k, f] of Object.entries(AI_FIELDS)) o[k] = f(ix.p); for (const [k, f] of Object.entries(VW_FIELDS)) o[k] = f(ix.p); }
    o._pnu = m.pnu; o._bb = ix && ix.bb; o._area = areaCol ? o[areaCol] : (ix ? ix.p.area_m2 : null);
    return o;
  });
  S.byPnu.clear(); S.fused.forEach((o, i) => { if (o) S.byPnu.set(o._pnu, i); });
  const matchedN = N - res.counts.miss;
  const rate = N ? Math.floor((1000 * matchedN) / N) / 10 : 0;
  $('#rate').innerHTML = rate >= 50 ? `결합 ${nf(rate, 1)}%<b title="확인됨">✓</b>` : `결합 ${nf(rate, 1)}%`;
  setHero('대장과 이어진 필지', matchedN, { dot: C.k1 });
  $('#rate').title = res.counts.miss ? Object.entries(res.reasons).map(([k, v]) => `${k} ${nf(v)}`).join(' · ') : '모든 행이 필지와 이어졌습니다';
  await sweepIn();
  S.dev.fused = matchedN;
  $('.gf-acts--end').hidden = false;
  if (!matchedN) {
    const top = Object.entries(res.reasons).sort((x, y) => y[1] - x[1])[0];
    setHero(top ? `이어진 필지 없음 · ${top[0]}` : '이어진 필지 없음', 0, { dot: '#D1352B' });
    $('#cats').innerHTML = `<li class="gf-note">${S.region.name} 관내 대장인지 확인해 주세요</li>`; devOut(); return;
  }
  if (!S.index) { setHero('AI 판독 전 관할', matchedN, { dot: '#CCCCCC' }); $('#cats').innerHTML = '<li class="gf-note">영상 반입 뒤 대조합니다</li>'; devOut(); return; }
  categorize();
  $('#ask-in').disabled = false;
  devOut();
}

/* 결합된 필지가 서쪽에서 동쪽으로 차오른다(적재된 실제 필지 순서 · 1.4초) */
async function sweepIn() {
  const items = S.fused.filter((o) => o && o._bb).sort((a, b) => a._bb[0] - b._bb[0]);
  if (!items.length) return;
  const bb = items.reduce((a, o) => [Math.min(a[0], o._bb[0]), Math.min(a[1], o._bb[1]), Math.max(a[2], o._bb[2]), Math.max(a[3], o._bb[3])], [180, 90, -180, -90]);
  S.ledgerBB = bb;
  cam(bb, {}, 1600);
  await new Promise((r) => setTimeout(r, 1650));
  const sw = $('#sweep'); sw.hidden = false;
  const T = 1400; const t0 = performance.now(); let k = 0;
  await new Promise((done) => {
    const tick = () => {
      const t = Math.min(1, (performance.now() - t0) / T);
      const lon = bb[0] + (bb[2] - bb[0]) * t;
      while (k < items.length && items[k]._bb[0] <= lon) { map.setFeatureState({ source: 'sv', sourceLayer: 'parcels', id: items[k]._pnu }, { k: 1 }); k++; }
      sw.style.transform = `translateX(${map.project([lon, (bb[1] + bb[3]) / 2]).x}px)`;
      if (t < 1) requestAnimationFrame(tick); else { for (; k < items.length; k++) map.setFeatureState({ source: 'sv', sourceLayer: 'parcels', id: items[k]._pnu }, { k: 1 }); sw.hidden = true; done(); }
    };
    requestAnimationFrame(tick);
  });
}
function clearStates() { painted = new Map(); if (map.getSource('sv')) map.removeFeatureState({ source: 'sv', sourceLayer: 'parcels' }); map.getLayer('lg-hl') && map.setFilter('lg-hl', ['==', ['get', 'pnu'], '__']); }

/* ═════════════ 3분류(대장 지목 × AI) ═════════════ */
function categorize() {
  const jc = (S.cols.find((c) => c.role === 'jimok') || {}).col;
  const farm = (o) => !jc || ['전', '답', '과수원', '과'].includes(String(o[jc]).trim());
  const defs = [
    { id: 2, dot: C.k2, label: '대장은 농지 · AI는 건물', short: '농지 위 건물', test: (o) => farm(o) && o['AI 건물(㎡)'] >= 33, ev: (o) => ['건물', o['AI 건물(㎡)']] },
    { id: 4, dot: C.k4, label: '대장은 농지 · AI는 주차장', short: '주차장', test: (o) => farm(o) && o['AI 주차장(㎡)'] >= 100, ev: (o) => ['주차장', o['AI 주차장(㎡)']] },
    { id: 3, dot: C.k3, label: '경작 흔적 없음', short: '경작 흔적 없음', test: (o) => farm(o) && o._area >= 1000 && o['AI 농경 비율'] < 0.15 && o['AI 건물(㎡)'] / o._area < 0.3, ev: (o) => ['농경', `${Math.round(o['AI 농경 비율'] * 100)}% · ${nf(o._area)}㎡`] },
  ];
  for (const d of defs) d.hits = [];
  S.catOf = new Map();
  S.fused.forEach((o, i) => { if (!o || o['AI 건물(㎡)'] === undefined) return; for (const d of defs) if (d.test(o)) { d.hits.push(i); S.catOf.set(i, d.id); break; } });
  S.cats = defs;
  showCat(2);
}
function showCat(id) {
  S.query = null; S.active = id;
  const d = S.cats.find((x) => x.id === id);
  paintStates((i) => (S.catOf.get(i) === id ? id : 1));
  setHero(d.label, d.hits.length, { dot: d.dot, est: true });
  const ul = $('#cats'); ul.innerHTML = '';
  for (const c of S.cats) if (c.id !== id) {
    const li = document.createElement('li');
    li.innerHTML = `<button type="button" aria-pressed="false" style="--dot:${c.dot}"><i></i><span>${c.short}</span><b>${nf(c.hits.length)}</b></button>`;
    li.firstChild.addEventListener('click', () => showCat(c.id));
    ul.appendChild(li);
  }
  list(d.hits, (o) => { const [k, v] = d.ev(o); return typeof v === 'number' ? `${k} ${nf(v)}㎡` : `${k} ${v}`; }, (o) => d.id === 3 ? -o._area : -(d.ev(o)[1]));
}

/* 상태 칠하기: 바뀐 필지만 */
let painted = new Map();
function paintStates(fn) {
  const next = new Map();
  S.fused.forEach((o, i) => { if (o) next.set(o._pnu, fn(i)); });
  for (const [pnu, k] of next) if (painted.get(pnu) !== k) map.setFeatureState({ source: 'sv', sourceLayer: 'parcels', id: pnu }, { k });
  painted = next;
}

function setHero(label, n, { dot, est } = {}) {
  $('#hero-l').innerHTML = `<i style="--dot:${dot || C.k1}"></i>${esc(label)}`;
  countTo($('#hero-n'), n, est);
}
function setHeroLabel(t) { const l = $('#hero-l'); l.lastChild && l.lastChild.nodeType === 3 ? (l.lastChild.textContent = t) : (l.textContent = t); }
function countTo(el, n, est) {
  cancelAnimationFrame(el._raf);
  if (n === null || n === undefined) { el.innerHTML = ''; el.dataset.v = 0; return; }
  const from = +(el.dataset.v || 0); const t0 = performance.now(); const T = 750;
  const tail = `${est ? '<sup title="AI 판독 기준 추정치 · 검수 전">~</sup>' : ''}<small>필지</small>`;
  const step = () => { const t = Math.min(1, (performance.now() - t0) / T); const e = 1 - Math.pow(1 - t, 4); el.innerHTML = nf(Math.round(from + (n - from) * e)) + tail; if (t < 1) el._raf = requestAnimationFrame(step); };
  el.dataset.v = n; el.style.fontSize = nf(n).length >= 6 ? '80px' : ''; step();
}
function list(idx, evFmt, sortKey) {
  const ol = $('#list'); ol.innerHTML = '';
  const ac = (S.cols.find((c) => c.role === 'addr') || {}).col, jb = (S.cols.find((c) => c.role === 'jibun') || {}).col;
  const top = idx.map((i) => S.fused[i]).sort((a, b) => sortKey(a) - sortKey(b)).slice(0, 3);
  for (const o of top) {
    const li = document.createElement('li');
    const addr = [ac ? String(o[ac]).split(/\s+/).pop() : '', jb ? o[jb] : ''].join(' ').trim() || o._pnu;
    li.innerHTML = `<button type="button"><span>${esc(addr)}</span><b>${esc(evFmt(o))}</b></button>`;
    li.firstChild.addEventListener('click', () => openCard(o._pnu, true));
    ol.appendChild(li);
  }
}

/* ═════════════ 내려받기 ═════════════ */
$('#btn-csv').addEventListener('click', () => {
  const idx = S.query ? S.query.hits : (S.cats || []).find((c) => c.id === S.active)?.hits || [];
  const heads = [...S.cols.filter((c) => c.role !== 'skip').map((c) => c.col), ...Object.keys(AI_FIELDS), ...Object.keys(VW_FIELDS), 'PNU'];
  const q = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const lines = [heads.join(',')];
  for (const i of idx) { const o = S.fused[i]; lines.push(heads.map((h) => q(h === 'PNU' ? o._pnu : typeof o[h] === 'number' ? Math.round(o[h] * 1000) / 1000 : o[h])).join(',')); }
  const label = S.query ? S.query.label : S.cats.find((c) => c.id === S.active).short;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  a.download = `${S.ledger.name.replace(/\.[^.]+$/, '')}_${label.replace(/[\\/:*?"<>|\s·]+/g, '_')}.csv`;
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
});

/* ═════════════ ⌘K ═════════════ */
addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); if (!$('#ask-in').disabled) $('#ask-in').focus(); }
  if (e.key === 'Escape') { if (!$('#card').hidden) closeCard(); else if (S.query) { $('#plan').hidden = true; showCat(S.active || 2); } }
});
let asking = null;
$('#ask-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const qtext = $('#ask-in').value.trim(); if (!qtext || !S.fused.length) return;
  asking && asking.abort(); asking = new AbortController();
  const pl = $('#plan'); pl.hidden = false; pl.innerHTML = ''; pl.dataset.min = '0';
  const lis = [0, 1, 2].map(() => { const li = document.createElement('li'); li.dataset.s = 'wait'; li.innerHTML = '<i></i><span>&nbsp;</span><span></span>'; pl.appendChild(li); return li; });
  lis[0].dataset.s = 'run';
  $('#ask').dataset.busy = '1';
  const ledgerCols = S.cols.filter((c) => c.role !== 'skip').map((c) => c.col);
  const samples = {};
  for (const c of S.cols) if (c.role !== 'skip' && c.role !== 'area') {
    const seen = new Map(); for (const r of S.ledger.rows.slice(0, 3000)) { const v = String(r[c.col] ?? '').trim(); if (v) seen.set(v, (seen.get(v) || 0) + 1); }
    if (seen.size <= 40) samples[c.col] = [...seen.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map((x) => x[0]).join(', ');
    else if (c.role === 'addr') samples[c.col] = [...seen.keys()].slice(0, 3).join(', ');
  }
  try {
    const p = await plan(qtext, { ledgerCols, samples, region: S.region.name }, (i, s) => {
      if (lis[i]) { lis[i].children[1].textContent = String(s).replace(/[.。]\s*$/, ''); lis[i].dataset.s = 'ok'; }
      if (lis[i + 1]) lis[i + 1].dataset.s = 'run';
    }, asking.signal);
    for (const li of lis) li.dataset.s = 'ok';
    const hits = run(p.where, S.fused);
    S.query = { ...p, hits, text: qtext };
    S.dev.llm_ms = Math.round(p.ms); S.dev.llm_first_ms = Math.round(p.first_ms); S.dev.where = p.where;
    showQuery();
    const res = document.createElement('li'); res.className = 'res';
    res.innerHTML = `<span>${esc(p.label)}</span><b>${nf(hits.length)}필지</b>`;
    pl.appendChild(res);
  } catch (err) {
    if (err.name === 'AbortError') return;
    S.dev.err = String(err && err.message || err);
    pl.innerHTML = '<li class="err">AI 비서가 응답하지 않습니다. 잠시 뒤 다시 물어봐 주세요.</li>';
  } finally { $('#ask').dataset.busy = '0'; devOut(); }
});

function showQuery() {
  const Q = S.query; const hit = new Set(Q.hits);
  paintStates((i) => (hit.has(i) ? 9 : 1));
  setHero(Q.label, Q.hits.length, { dot: C.q, est: Q.where.some((w) => w.field.startsWith('AI')) });
  // 리별 집계(대장 소재지 기준)
  const ac = (S.cols.find((c) => c.role === 'addr') || {}).col;
  const g = new Map();
  for (const i of Q.hits) { const k = ac ? String(S.fused[i][ac]).split(/\s+/).pop() : '—'; g.set(k, (g.get(k) || 0) + 1); }
  const top = [...g.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4); const mx = top.length ? top[0][1] : 1;
  const ul = $('#cats'); ul.innerHTML = top.map(([k, v]) => `<li class="bar"><span>${esc(k)}</span><em style="--w:0%"></em><b>${nf(v)}</b></li>`).join('');
  requestAnimationFrame(() => ul.querySelectorAll('li.bar em').forEach((em, j) => em.style.setProperty('--w', (100 * top[j][1] / mx) + '%')));
  const aiF = Q.where.find((w) => w.field.startsWith('AI'));
  const f = aiF ? aiF.field : 'AI 건물(㎡)';
  list(Q.hits, (o) => (f === 'AI 농경 비율' ? `농경 ${Math.round(o[f] * 100)}% · ${nf(o._area)}㎡` : `${f.replace(/^AI |\(㎡\)$/g, '')} ${nf(o[f])}㎡`), (o) => (f === 'AI 농경 비율' ? o[f] * 1e7 - (o._area || 0) : -o[f]));
  // 카메라: 말한 지역 → 그 결과, 아니면 결과 전체
  let pool = Q.hits.map((i) => S.fused[i]).filter((o) => o._bb);
  if (Q.focus && ac) { const fp = pool.filter((o) => String(o[ac]).includes(Q.focus)); if (fp.length) pool = fp; }
  if (pool.length) cam(pool.reduce((a, o) => [Math.min(a[0], o._bb[0]), Math.min(a[1], o._bb[1]), Math.max(a[2], o._bb[2]), Math.max(a[3], o._bb[3])], [180, 90, -180, -90]), {}, 1600);
}

/* ═════════════ 필지 카드 — 대장 · AI · V-World ═════════════ */
async function openCard(pnu, fly) {
  const i = S.byPnu.get(pnu); if (i === undefined) return;
  const o = S.fused[i]; S.sel = pnu; $('#plan').dataset.min = '1';
  map.setFilter('lg-hl', ['==', ['get', 'pnu'], pnu]);
  if (fly && o._bb) map.fitBounds(o._bb, { padding: { left: 460, right: 380, top: 120, bottom: 160 }, maxZoom: 18, duration: 1600, easing: (t) => 1 - Math.pow(1 - t, 4) });
  const ac = (S.cols.find((c) => c.role === 'addr') || {}).col, jb = (S.cols.find((c) => c.role === 'jibun') || {}).col;
  const jc = (S.cols.find((c) => c.role === 'jimok') || {}).col;
  $('#card-t').textContent = [ac && o[ac], jb && o[jb]].filter(Boolean).join(' ') || pnu;
  const ai = [['건물', 'AI 건물(㎡)'], ['경작', 'AI 경작(㎡)'], ['주차장', 'AI 주차장(㎡)'], ['비닐하우스', 'AI 비닐하우스(㎡)']]
    .filter(([, k]) => o[k] >= 1).map(([l, k]) => `<span class="${l === '건물' && o[k] >= 33 ? 'hot' : 'ai'}">${l} ${nf(o[k])}㎡</span>`).join(' · ') || '<span style="color:rgba(1,1,2,.45)">탐지 없음</span>';
  const area = o._area ? ` · ${nf(o._area)}㎡` : '';
  const vw = [o['V-World 용도지역'], o['V-World 농업진흥']].filter(Boolean).join(' · ') || '—';
  $('#card-tri').innerHTML = `<dt>대장</dt><dd>${esc(jc ? o[jc] : '')}${area}</dd><dt>AI</dt><dd>${ai}</dd><dt>V-World</dt><dd>${esc(vw)}</dd>`;
  const act = $('#card-act'); act.innerHTML = '';
  $('#card').hidden = false;
  try {
    const j = await api('/survey/findings?pnu=' + pnu + '&limit=5');
    if (S.sel !== pnu) return;
    const f = (j.items || [])[0];
    if (!f) { act.innerHTML = '<span>현장 확인 대상 아님</span>'; return; }
    renderAct(f);
  } catch { /* 실태조사 기록 없는 관할 */ }
}
const STATE_KO = { open: '확인 전', assigned: '현장 배정됨', inspected: '판정 대기', closed: '종결', dismissed: '오탐 처리' };
function renderAct(f) {
  const act = $('#card-act');
  act.innerHTML = `<span>${STATE_KO[f.state] || f.state}</span>`;
  if (f.state === 'open') {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'gf-btn gf-btn--ink gf-btn--sm'; b.textContent = '현장 배정';
    b.addEventListener('click', async () => {
      b.disabled = true;
      try {
        const r = await api(`/survey/findings/${encodeURIComponent(f.id)}/state`, { method: 'POST', body: { state: 'assigned', client_id: 'gf-' + crypto.randomUUID(), assignee: S.me.user && S.me.user.name } });
        renderAct(r); toast('현장 확인에 배정했습니다'); loadTodo();
      } catch (e) { b.disabled = false; toast(e.message || '배정하지 못했습니다'); }
    });
    act.appendChild(b);
  }
}
function closeCard() { $('#card').hidden = true; S.sel = null; map.getLayer('lg-hl') && map.setFilter('lg-hl', ['==', ['get', 'pnu'], '__']); }
$('#card-x').addEventListener('click', closeCard);

/* ═════════════ 기타 ═════════════ */
let tt = 0;
function toast(t) { const el = $('#toast'); el.textContent = t; el.hidden = false; clearTimeout(tt); tt = setTimeout(() => { el.hidden = true; }, 2600); }
function devOut() {
  if (!DEV) return;
  const d = { ...S.dev, rows: S.ledger && S.ledger.rows.length, index: S.index && S.index.size, tile_ms: S.index && Math.round(S.index.ms), tile_kb: S.index && Math.round(S.index.bytes / 1024), counts: S.matched && S.matched.counts, reasons: S.matched && S.matched.reasons };
  const el = $('#dev'); el.hidden = false; el.textContent = JSON.stringify(d, null, 1);
}

/* ═════════════ 시작 ═════════════ */
(async () => {
  await probe();
  if (API.mode !== 'on') { showGate('서버에 연결하지 못했습니다'); return; }
  if (session.get()) await enter(); else showGate();
})();
