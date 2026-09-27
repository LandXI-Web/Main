/* xi-clean.js — XI맵 정돈판(F3 §7-③). 같은 엔진(landxi/xi/engine · fx)을 import 만 하고, 화면은 다섯 가지만 남긴다:
   지도 · 검색 · 도구 7 · HUD(큰 숫자 = 현장 확인 필요 n필지) · 개발자 서랍(?dev=1).
   숫자 출처 한 곳: GET /api/v1/survey/findings(우선순위 A · 미조치/배정 · 지금 화면). 대조 = 실제 작업(POST /jobs kind:survey + SSE).
   지역은 변수 — 읍면동 목록·경계는 GET /survey/stats?by=emd, 영상·결과 층은 GET /catalog/layers 에서 온다. */
import { API, probe, api, catalog as apiCatalog, yesterdayUTC, sse } from '../../shared/api-v1.js';
import { createMap, loaded, idle } from '../../xi/engine/lx-map.js';
import { mountLadder } from '../../xi/engine/ladder.js';
import { sourceSpec, setExtMode } from '../../xi/engine/sources.js';
import { flyLadder, stopFlight } from '../../xi/engine/camera.js';
import { addResultLayers, setVis } from '../../xi/fx/arrive.js';
import { gate, logout } from './auth-gate.js';
import { createHud } from './hud-lite.js';
import { createAsk } from './ask.js';

const $ = (id) => document.getElementById(id);
const Q = new URLSearchParams(location.search);
const RM = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmt = (n) => Number(n).toLocaleString('ko-KR');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const X = (window.__xc = { boot: {}, t0: performance.now() });
const mark = (k) => { X.boot[k] = Math.round(performance.now() - X.t0); };

/* 시군구 코드 → 실태조사 필지 타일(연속지적 × AI 의심 · pmtiles). 새 지역은 한 줄 추가 — 화면 코드는 그대로 */
const SURVEY_TILES = { 52190: '/landxi/data/survey/namwon-parcel-survey.pmtiles' };
const ALL_RULES = ['R1', 'R2', 'R3', 'R4', 'R5', 'R6'];
const AMBER = '#FFB633', TEAL = '#0FA9A0';
const CLS = { bld: '건물', crop: '경작지', gh: '비닐하우스', park: '주차장', uncrop: '비경작지' };

const S = { rules: new Set(ALL_RULES), done: null, layers: { sus: true, ai: false, parcel: true, emd: true }, tool: null, swipe: false, tilt: false,
  sel: null, emds: [], ruleDefs: {}, region: '', regionBox: null, last: null, busy: false, cat: null, intent: null };
let A = null, B = null, hud = null, sess = null;

/* ═══ 부팅 ═══ */
async function boot() {
  setExtMode('worker');                         // 외부 타일 실패는 Worker 가 받아 콘솔 오류 0(서비스 워커 없는 화면)
  await probe(); mark('probe');
  hud = createHud({ onBar: soloRule });
  if (API.mode !== 'on') { hud.where('서버 연결 없음'); }
  sess = await gate({ inline: Q.get('login') === 'here' }); mark('session');
  X.sess = sess;
  $('me').hidden = false; $('me').textContent = '나가기';
  $('me').title = `${sess.me?.user?.name || ''} · 로그아웃`;
  $('me').addEventListener('click', logout);

  const [cat, emdSt, ruleSt] = await Promise.all([
    apiCatalog({ stage: 'domestic', build: sess.realm === 'lx' ? 'lx' : 'tenant', locale: 'ko' }),
    api('/survey/stats?by=emd'), api('/survey/stats?by=rule'),
  ]);
  mark('data');
  S.cat = cat;
  S.emds = emdSt.items.filter((i) => i.bbox?.length === 4).map((i) => ({ cd: i.cd, nm: i.key, bbox: i.bbox }));
  S.ruleDefs = Object.fromEntries(ruleSt.items.map((i) => [i.key, { name: i.name.replace(/\s*\(.*\)\s*/, ''), full: i.name, cond: i.condition }]));
  const bb = S.emds.reduce((a, e) => [Math.min(a[0], e.bbox[0]), Math.min(a[1], e.bbox[1]), Math.max(a[2], e.bbox[2]), Math.max(a[3], e.bbox[3])], [180, 90, -180, -90]);
  S.regionBox = bb;
  const sgg = S.emds[0]?.cd.slice(0, 5);

  await buildMap(cat, sgg);
  mark('map');
  wire();
  if (Q.get('dev') === '1' && sess.realm === 'lx') import('./dev-drawer.js').then((m) => m.devDrawer({ el: $('dev'), map: A, sess, X }));
  createAsk({ root: $('search'), input: $('q'), list: $('sugg'), emds: S.emds, rules: S.ruleDefs, X,
    onEmd: (e) => flyToEmd(e), onParcel: (f) => openParcel(f.pnu, { fly: f.lnglat || f.geometry?.coordinates }), onIntent });

  // 도착: 넓게 → 관내 전역(2400)
  await idle(A, 3000); $('map').classList.add('on'); document.documentElement.dataset.xc = 'canvas'; mark('canvas');
  await flyLadder([A], fitCam(bb), { duration: RM() ? 0 : 2400 });
  mark('arrived');
  document.documentElement.dataset.xc = 'arrived';
  const first = !sessionStorage.getItem('xc_swept');
  if (first && sess.role !== 'sales') await reconcile();
  else { revealAll(); loadRegionA().catch(() => {}); await refresh({ ms: 750 }); }
  document.documentElement.dataset.xc = 'ready'; mark('ready');
}

function fitCam(b, pad = { top: 88, bottom: 48, left: 104, right: 400 }) {
  const c = A.cameraForBounds([[b[0], b[1]], [b[2], b[3]]], { padding: pad });
  return { center: c.center, zoom: Math.min(c.zoom, 17.2), pitch: S.tilt ? 50 : 0, bearing: S.tilt ? -12 : 0 };
}

/* ═══ 지도 ═══ */
async function buildMap(cat, sgg) {
  const b = S.regionBox, c = [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
  A = createMap({ container: $('map'), mode: 'flat', center: c, zoom: 7.4, maxPitch: 60 });
  X.A = A;
  A.on('error', (e) => { const m = String(e?.error?.message || e?.error || e); (X.mapErrors ||= []).push(m.slice(0, 160)); });
  await loaded(A);
  S.ladder = await mountLadder(A, cat.items, { order: cat.ladder?.domestic || [], before: 'slot-imagery', dates: { viirs: yesterdayUTC() } });
  // 읍면동 경계(참조)
  const emdIt = cat.items.find((i) => i.role === 'reference' && /-emd$/.test(i.id));
  if (emdIt) {
    A.addSource('src-emd', await sourceSpec(emdIt));
    A.addLayer({ id: 'emd-line', type: 'line', source: 'src-emd', 'source-layer': emdIt.layer, minzoom: 8, layout: { 'line-join': 'miter' },
      paint: { 'line-color': '#FFFFFF', 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 0.6, 14, 1.2], 'line-opacity': ['interpolate', ['linear'], ['zoom'], 8, 0.2, 11, 0.5, 15, 0.3] } }, 'slot-reference');
    // 읍면동 판정용 투명 면(층 스위치와 무관 · 화면 중심의 실제 폴리곤을 고른다)
    A.addLayer({ id: 'emd-hit', type: 'fill', source: 'src-emd', 'source-layer': emdIt.layer, minzoom: 8, paint: { 'fill-color': '#fff', 'fill-opacity': 0.001 } }, 'slot-reference');
  }
  // AI 판독(토지피복 · 청록) — 꺼진 채
  const aiIt = cat.items.find((i) => i.role === 'result' && /landcover/.test(i.id) && i.kind === 'vector');
  if (aiIt) { A.addSource('src-ai', await sourceSpec(aiIt)); S.aiIds = addResultLayers(A, 'ai', 'src-ai', { kind: 'landcover', sourceLayer: aiIt.layer, visible: false }); }
  // 실태조사 필지(연속지적 × AI 의심)
  const url = SURVEY_TILES[sgg];
  if (url) {
    A.addSource('src-sv', { type: 'vector', url: 'pmtiles://' + location.origin + url });
    const isA = ['==', ['get', 'priority'], 'A'];
    A.addLayer({ id: 'sv-parcel-line', type: 'line', source: 'src-sv', 'source-layer': 'parcels', minzoom: 14, layout: { 'line-join': 'miter' },
      paint: { 'line-color': '#FFFFFF', 'line-width': ['interpolate', ['linear'], ['zoom'], 14, 0.4, 18, 1], 'line-opacity': ['interpolate', ['linear'], ['zoom'], 14, 0, 15, 0.38] } }, 'slot-overlay');
    A.addLayer({ id: 'sv-parcel-hit', type: 'fill', source: 'src-sv', 'source-layer': 'parcels', minzoom: 14, paint: { 'fill-color': '#fff', 'fill-opacity': 0.001 } }, 'slot-overlay');
    A.addLayer({ id: 'sv-sus-fill', type: 'fill', source: 'src-sv', 'source-layer': 'suspects', filter: susFilter(),
      paint: { 'fill-color': ['case', isA, AMBER, TEAL], 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 10, ['case', isA, 0.9, 0.34], 13, ['case', isA, 0.62, 0.24], 16, ['case', isA, 0.26, 0.1]] } }, 'slot-overlay');
    A.addLayer({ id: 'sv-sus-line', type: 'line', source: 'src-sv', 'source-layer': 'suspects', minzoom: 12, filter: susFilter(), layout: { 'line-join': 'miter' },
      paint: { 'line-color': ['case', isA, AMBER, TEAL], 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 0.6, 15, 1.6, 18, 2.4], 'line-opacity': ['case', isA, 1, 0.7] } }, 'slot-overlay');
    A.addLayer({ id: 'sv-sel-halo', type: 'line', source: 'src-sv', 'source-layer': 'parcels', filter: ['==', ['get', 'pnu'], ''], layout: { 'line-join': 'miter' }, paint: { 'line-color': '#010102', 'line-width': 6, 'line-opacity': 0.35 } }, 'slot-overlay');
    A.addLayer({ id: 'sv-sel-line', type: 'line', source: 'src-sv', 'source-layer': 'parcels', filter: ['==', ['get', 'pnu'], ''], layout: { 'line-join': 'miter' }, paint: { 'line-color': '#FFFFFF', 'line-width': 2.4 } }, 'slot-overlay');
  }
  S.hasSurvey = !!url;
  // 먼 축척(필지 타일 z11 아래) — 현장 확인 필요 필지를 점으로(서버 조회 결과 · 필지 면이 차오르면 물러난다)
  A.addSource('sv-pts', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  A.addLayer({ id: 'sv-pts-glow', type: 'circle', source: 'sv-pts', filter: ptsFilter(), paint: { 'circle-color': AMBER, 'circle-blur': 1, 'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 5, 11, 10, 13, 14],
    'circle-opacity': ['interpolate', ['linear'], ['zoom'], 8, 0.35, 12, 0.3, 13.5, 0] } }, 'slot-overlay');
  A.addLayer({ id: 'sv-pts', type: 'circle', source: 'sv-pts', filter: ptsFilter(), paint: { 'circle-color': AMBER, 'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 1.6, 11, 2.8, 13, 4],
    'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 8, 0.4, 12, 1],
    'circle-opacity': ['interpolate', ['linear'], ['zoom'], 12, 1, 13.5, 0], 'circle-stroke-opacity': ['interpolate', ['linear'], ['zoom'], 12, 0.9, 13.5, 0] } }, 'slot-overlay');
}
/** 지역 전체 현장 확인 필요(A · 미조치/배정) — 점 층과 대조 합산이 같은 조회를 쓴다 */
async function loadRegionA() {
  const j = await api('/survey/findings?' + new URLSearchParams({ priority: 'A', state: 'open,assigned', bbox: S.regionBox.join(','), limit: '2000', sort: 'score' }));
  const seen = new Set(), feats = [];
  for (const f of j.items) {
    const ll = f.lnglat || f.geometry?.coordinates; if (!ll) continue;
    feats.push({ type: 'Feature', properties: { pnu: f.pnu, rule: f.rule, emd: f.emd_cd, first: seen.has(f.pnu) ? 0 : 1 }, geometry: { type: 'Point', coordinates: ll } });
    seen.add(f.pnu);
  }
  A.getSource('sv-pts')?.setData({ type: 'FeatureCollection', features: feats });
  return j;
}
function ptsFilter() {
  const f = ['all', ['in', ['get', 'rule'], ['literal', [...S.rules]]]];
  if (S.done) f.push(['in', ['get', 'emd'], ['literal', [...S.done]]]);
  return f;
}
function susFilter() {
  const f = ['all', ['in', ['get', 'rule'], ['literal', [...S.rules]]]];
  if (S.done) f.push(['in', ['slice', ['get', 'pnu'], 0, 8], ['literal', [...S.done]]]);
  return f;
}
const applyFilter = () => { for (const id of ['sv-sus-fill', 'sv-sus-line']) if (A.getLayer(id)) A.setFilter(id, susFilter()); for (const id of ['sv-pts', 'sv-pts-glow']) if (A.getLayer(id)) A.setFilter(id, ptsFilter()); };
function revealAll() { S.done = null; applyFilter(); }

/* ═══ HUD 숫자: 지금 화면 · 우선순위 A · 미조치/배정 ═══ */
let refT = 0, refSeq = 0;
function schedule() { clearTimeout(refT); refT = setTimeout(() => refresh(), 220); }
async function refresh({ ms } = {}) {
  if (!S.hasSurvey || S.busy) return;
  const my = ++refSeq, b = A.getBounds();
  const bbox = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()].map((v) => v.toFixed(5)).join(',');
  const p = new URLSearchParams({ priority: 'A', state: 'open,assigned', limit: '2000', sort: 'score' });
  if (S.emdFocus) p.set('emd_cd', S.emdFocus.cd); else p.set('bbox', bbox);   // 한 문장에 읍면동이 있으면 그 읍면동 전체(화면과 무관)
  if (S.rules.size < ALL_RULES.length) p.set('rule', [...S.rules].join(','));
  const t0 = performance.now();
  let j;
  try { j = await api('/survey/findings?' + p); } catch (e) { if (my === refSeq) hud.where('조회 실패'); return; }
  if (my !== refSeq) return;
  X.lastQuery = { path: '/survey/findings?' + p, ms: Math.round(performance.now() - t0), db_ms: j.db_ms?.value, total: j.total?.value, items: j.items.length };
  const pnus = new Set(j.items.map((f) => f.pnu)), total = j.total?.value ?? j.items.length, exact = j.items.length >= total;
  const n = exact ? pnus.size : Math.round(pnus.size * (total / Math.max(1, j.items.length)));
  if (!S.region && j.items[0]?.addr) { S.region = j.items[0].addr.split(' ')[1] || ''; $('region').textContent = S.region; }
  hud.set(n, { exact, ms, tip: `AI 판독 × 연속지적 대조 · 기준 ${j.as_of || ''} · 현장 확인 전` });
  hud.where(whereLabel());
  // 규칙별 필지(같은 조회 · 필지 중복 제거)
  const by = {};
  for (const f of j.items) (by[f.rule] ||= new Set()).add(f.pnu);
  hud.bars(Object.keys(by).map((k) => ({ key: k, label: S.ruleDefs[k]?.name || k, n: by[k].size })));
  S.last = j;
  if (S.tool === 'list' && !S.sel) renderList();
  if (S.tool === 'rules') renderRules();
}
function whereLabel() {
  const e = emdHere();
  if (e) return e.nm;
  const b = S.regionBox, vb = A.getBounds();
  if (vb.getWest() <= b[0] && vb.getEast() >= b[2] && vb.getSouth() <= b[1] && vb.getNorth() >= b[3]) return '전역';
  return '화면 안';
}
/* 지금 가리키는 읍면동: ① 한 문장의 읍면동 → ② 열린 필지 카드의 읍면동(PNU 앞 8자리) → ③ 화면 중심의 실제 경계 폴리곤.
   경계 상자(bbox)로는 고르지 않는다 — 이웃 읍면동 상자가 겹치면 엉뚱한 곳이 잡힌다. */
function emdHere() {
  if (S.emdFocus) return S.emdFocus;
  const byCd = (cd) => (cd ? S.emds.find((e) => e.cd === String(cd).slice(0, 8)) || null : null);
  if (S.sel) { const e = byCd(S.sel); if (e) return e; }
  if (A.getZoom() < 11.5 || !A.getLayer('emd-hit')) return null;
  const b = S.regionBox, vb = A.getBounds();
  if (vb.getWest() <= b[0] && vb.getEast() >= b[2] && vb.getSouth() <= b[1] && vb.getNorth() >= b[3]) return null;
  const pt = A.project(A.getCenter());
  for (const f of A.queryRenderedFeatures(pt, { layers: ['emd-hit'] })) {
    const q = f.properties || {}, e = byCd(q.cd ?? q.code ?? f.id);
    if (e) return e;
  }
  return null;
}

/* ═══ 대조(실제 작업 · 읍면동 칸마다 탐지 순간) ═══ */
async function reconcile() {
  if (S.busy || !S.hasSurvey) return;
  S.busy = true; closeTool(); closeCard(); clearLocks();
  const btn = document.querySelector('[data-tool="sweep"]'); btn.dataset.busy = '1';
  // 지역 전체 A 필지(읍면동별) — 칸이 끝날 때마다 그 읍면동의 실제 수를 더한다
  let perEmd = {};
  try {
    const j = await loadRegionA();
    const sets = {}; for (const f of j.items) (sets[f.emd_cd] ||= new Set()).add(f.pnu);
    perEmd = Object.fromEntries(Object.entries(sets).map(([k, v]) => [k, v.size]));
    S.last = j;
  } catch { /* 합산 없이 칸만 */ }
  S.done = new Set(); applyFilter();
  hud.set(0, { ms: 1 }); hud.bars([]); hud.where('대조 중');
  let job;
  try {
    const r = await api('/jobs', { method: 'POST', body: { kind: 'survey', survey_id: 'farmland', rules: ALL_RULES, options: {}, priority: 0 } });
    job = r.job; X.job = { id: job.id, done: 0, total: job.shards_total, state: 'queued', t0: performance.now() };
    hud.progress(0, job.shards_total || S.emds.length);
    await new Promise((resolve) => {
      let next = 0, done = 0, total = job.shards_total || S.emds.length;
      const queue = [];
      const pump = async () => {
        while (queue.length) {
          const [name, d] = queue.shift();
          if (name === 'shard.done') {
            const now = performance.now(); if (now < next) await sleep(next - now); next = performance.now() + 70;
            const cd = String(d.shard_id || '').replace(/^emd-/, '');
            S.done.add(cd); applyFilter(); done++;
            X.job.done = done; X.job.state = 'running';
            hud.progress(done, total);
            if (perEmd[cd]) hud.add(perEmd[cd]);
            bracket(d.bbox, S.emds.find((e) => e.cd === cd)?.nm);
          } else if (name === 'job.done' || name === 'job.failed' || name === 'job.cancelled') {
            X.job.state = name; X.job.ms = Math.round(performance.now() - X.job.t0);
            h.close(); resolve(); return;
          }
        }
        pumping = false;
      };
      let pumping = false;
      const h = sse(`/events/jobs/${job.id}`, { events: ['job.started', 'shard.done', 'job.done', 'job.failed', 'job.cancelled'], on: (name, d) => { queue.push([name, d]); if (!pumping) { pumping = true; pump(); } } });
      setTimeout(() => { h.close(); resolve(); }, 30000);
    });
  } catch (e) { X.job = { id: '—', state: 'submit failed ' + (e.code || e.message) }; }
  sessionStorage.setItem('xc_swept', '1');
  revealAll();
  hud.progress(null);
  S.busy = false; delete btn.dataset.busy;
  await refresh({ ms: 380 });
  lockTop(3);
}
function bracket(bb, name) {
  if (!bb || RM()) return;
  const a = A.project([bb[0], bb[3]]), b = A.project([bb[2], bb[1]]);
  const el = document.createElement('div'); el.className = 'xc-bk';
  const w = Math.max(14, b.x - a.x), h = Math.max(14, b.y - a.y);
  el.style.cssText = `transform:translate(${a.x.toFixed(1)}px,${a.y.toFixed(1)}px);width:${w.toFixed(1)}px;height:${h.toFixed(1)}px`;
  if (name && w > 70) el.innerHTML = `<b>${esc(name)}</b>`;
  $('fx').appendChild(el);
  el.animate([{ opacity: 0 }, { opacity: 1, offset: 0.15 }, { opacity: 1, offset: 0.6 }, { opacity: 0 }], { duration: 900, easing: 'linear' }).finished.then(() => el.remove(), () => el.remove());
}
/* 락온: 지금 화면 점수 상위 n 필지(서로 다른 필지) */
let locks = [];
function clearLocks() { for (const L of locks) { A.off('move', L.place); L.el.remove(); } locks = []; }
function lockTop(n) {
  clearLocks();
  if (!S.last?.items?.length || RM()) return;
  const seen = new Set(), picks = [];
  for (const f of S.last.items) { if (seen.has(f.pnu)) continue; seen.add(f.pnu); picks.push(f); if (picks.length >= n) break; }
  picks.forEach((f, i) => setTimeout(() => {
    const ll = f.lnglat || f.geometry?.coordinates; if (!ll) return;
    const el = document.createElement('div'); el.className = 'xc-lock';
    const a = String(f.addr || '').split(' ');
    el.innerHTML = `<i></i><span>${esc(S.ruleDefs[f.rule]?.name || f.rule_nm || '')} · ${esc(a.slice(-2).join(' '))}</span>`;
    $('fx').appendChild(el);
    const place = () => { const p = A.project(ll); el.style.transform = `translate(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px)`; };
    place(); A.on('move', place);
    locks.push({ el, place });
  }, i * 120));
}

/* ═══ 필지 카드 ═══ */
async function openParcel(pnu, { fly = null } = {}) {
  if (!pnu) return;
  clearLocks();
  S.sel = pnu;
  for (const id of ['sv-sel-line', 'sv-sel-halo']) A.getLayer(id) && A.setFilter(id, ['==', ['get', 'pnu'], pnu]);
  if (fly) { await terrainFor(17); flyLadder([A], parcelCam(fly), { duration: 1250 }).then(schedule); }
  let d;
  try { d = await api(`/survey/parcels/${pnu}?with=facts,findings`); } catch { toast('필지를 불러오지 못했습니다'); return; }
  if (S.sel !== pnu) return;
  const f = d.findings?.[0], L = d.facts?.ledger || {}, cur = d.facts?.current || {};
  const yr = f && /2025/.test(f.img_date || '') ? '2025' : '2023';
  const C = cur[yr]?.classes || cur['2023']?.classes || {};
  // AI 쪽: 규칙 근거 면적이 있으면 그 값, 없으면 필지 안 가장 큰 클래스
  const main = Object.entries(C).map(([k, v]) => [k, v?.m2?.value || 0]).sort((a, b) => b[1] - a[1])[0];
  const ev = f?.evid_m2?.value, pct = f?.evid_pct?.value;
  const aiLabel = f ? evidenceClass(f.rule) : main ? CLS[main[0]] || main[0] : '—';
  const aiM2 = ev ?? main?.[1];
  const parts = String(d.addr || '').split(' ');
  const el = $('card');
  el.innerHTML = `<header><div><h3>${esc(parts.slice(-2).join(' '))}</h3>
      ${f ? `<p class="rule" style="--c:${f.priority === 'A' ? AMBER : TEAL}">${esc(S.ruleDefs[f.rule]?.name || f.rule_nm)}</p>` : '<p class="rule" style="--c:#fff">의심 없음</p>'}</div>
      <button type="button" class="x" aria-label="닫기">×</button></header>
    <dl class="xc-pair">
      <div><dt>대장</dt><dd><b>${esc(L.jimok_nm || L.jimok || '—')}</b>${L.area_m2?.value != null ? fmt(Math.round(L.area_m2.value)) + '㎡' : ''}</dd></div>
      <div class="ai"><dt>AI 판독</dt><dd><b>${esc(aiLabel)}</b>${aiM2 != null ? fmt(Math.round(aiM2)) + '㎡' : ''}${pct != null ? ` · ${Math.round(pct)}%` : ''}</dd></div>
    </dl>`;
  el.title = f ? (f.explain?.evidence || '') : '';
  el.querySelector('.x').addEventListener('click', closeCard);
  const hr = $('hud').getBoundingClientRect();
  el.style.top = Math.round(hr.bottom + 16) + 'px';
  el.hidden = false;
  if (S.tool === 'list') renderList(false);
}
function evidenceClass(rule) { return { R1: '건물', R2: '비경작', R3: '비닐하우스', R4: '주차장', R5: '경작지', R6: '건물' }[rule] || '—'; }
function parcelCam(ll) {
  // 필지를 왼쪽 크롬(레일 · 열린 팝오버)과 오른쪽 HUD·카드 사이 빈 곳 가운데에 둔다
  const z = 17.4, W = innerWidth;
  const pop = $('pop'), L = (!pop.hidden ? pop : $('rail')).getBoundingClientRect().right, R = W > 900 ? $('hud').getBoundingClientRect().left : W;
  const tx = (L + R) / 2, off = W / 2 - tx;
  const mpp = (40075016.7 * Math.cos((ll[1] * Math.PI) / 180)) / (512 * 2 ** z);
  const dLng = (off * mpp) / (111320 * Math.cos((ll[1] * Math.PI) / 180));
  return { center: [ll[0] + dLng, ll[1] - (S.tilt ? 0.00018 : 0)], zoom: z, pitch: S.tilt ? 50 : 0, bearing: S.tilt ? -12 : 0 };
}
function closeCard() {
  $('card').hidden = true; S.sel = null;
  for (const id of ['sv-sel-line', 'sv-sel-halo']) A?.getLayer(id) && A.setFilter(id, ['==', ['get', 'pnu'], '']);
  if (S.tool === 'list') renderList(false);
}

/* ═══ 도구 ═══ */
function wire() {
  document.querySelectorAll('[data-tool]').forEach((b) => b.addEventListener('click', () => tool(b.dataset.tool)));
  A.on('moveend', schedule);
  A.on('zoomend', () => terrainFor(A.getZoom()));
  A.on('move', scale); scale();
  A.on('dragstart', clearLocks); A.on('wheel', clearLocks);
  A.on('click', (e) => {
    if (S.swipe) return;
    const box = [[e.point.x - 6, e.point.y - 6], [e.point.x + 6, e.point.y + 6]];
    const fs = A.queryRenderedFeatures(box, { layers: ['sv-pts', 'sv-sus-fill', 'sv-parcel-hit'].filter((l) => A.getLayer(l)) });
    const hit = fs.find((f) => f.layer.id === 'sv-sus-fill') || fs.find((f) => f.layer.id === 'sv-pts') || fs[0];
    if (hit?.layer.id === 'sv-pts') { openParcel(hit.properties.pnu, { fly: hit.geometry.coordinates }); return; }
    if (hit?.properties?.pnu) openParcel(hit.properties.pnu); else closeCard();
  });
  for (const l of ['sv-sus-fill', 'sv-pts']) { A.on('mousemove', l, () => { A.getCanvas().style.cursor = 'pointer'; }); A.on('mouseleave', l, () => { A.getCanvas().style.cursor = ''; }); }
  $('chip-x').addEventListener('click', clearIntent);
  addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeTool(); closeCard(); } });
}
function press(name, on) { const b = document.querySelector(`[data-tool="${name}"]`); if (b && b.hasAttribute('aria-pressed')) b.setAttribute('aria-pressed', on ? 'true' : 'false'); }
function tool(name) {
  if (name === 'sweep') return reconcile();
  if (name === 'report') return report();
  if (name === 'swipe') return toggleSwipe();
  if (name === 'tilt') return toggleTilt();
  if (S.tool === name) return closeTool();
  closeTool(); S.tool = name; press(name, true);
  if (name === 'layers') renderLayers();
  if (name === 'rules') renderRules();
  if (name === 'list') renderList();
}
function closeTool() { if (S.tool) press(S.tool, false); S.tool = null; $('pop').hidden = true; $('pop').className = 'xc-pop g'; }
function pop(html, cls = '') { const p = $('pop'); p.className = 'xc-pop g ' + cls; p.innerHTML = html; p.hidden = false; return p; }

function renderLayers() {
  const L = [['sus', '의심 필지', `linear-gradient(90deg,${AMBER} 50%,${TEAL} 50%)`], ['ai', 'AI 판독', TEAL], ['parcel', '지적선', '#fff'], ['emd', '읍면동', 'rgba(255,255,255,.6)']];
  const p = pop(`<h2>층</h2>${L.map(([k, t, c]) => `<button type="button" class="row" data-k="${k}" aria-pressed="${S.layers[k]}"><i class="sw"></i>${t}<i class="key" style="margin-left:auto;background:${c};box-shadow:inset 0 0 0 1px rgba(1,1,2,.12)"></i></button>`).join('')}`);
  p.querySelectorAll('.row').forEach((r) => r.addEventListener('click', () => { const k = r.dataset.k; S.layers[k] = !S.layers[k]; r.setAttribute('aria-pressed', S.layers[k]); applyLayers(); }));
}
function applyLayers() {
  setVis(A, ['sv-sus-fill', 'sv-sus-line', 'sv-pts', 'sv-pts-glow'], S.layers.sus);
  setVis(A, S.aiIds || [], S.layers.ai);
  setVis(A, ['sv-parcel-line'], S.layers.parcel);
  setVis(A, ['emd-line'], S.layers.emd);
}
function renderRules() {
  const by = S.last?.by_rule || {};
  const p = pop(`<h2>규칙 · 현장 확인 필요</h2>${ALL_RULES.map((k) => `<button type="button" class="row" data-k="${k}" aria-pressed="${S.rules.has(k)}"><i class="sw"></i>${esc(S.ruleDefs[k]?.name || k)}<em>${by[k]?.value != null ? fmt(by[k].value) : ''}</em></button>`).join('')}`);
  p.querySelectorAll('.row').forEach((r) => r.addEventListener('click', () => {
    const k = r.dataset.k; if (S.rules.has(k)) { if (S.rules.size > 1) S.rules.delete(k); } else S.rules.add(k);
    r.setAttribute('aria-pressed', S.rules.has(k)); setRules(S.rules, S.rules.size < ALL_RULES.length ? `${S.rules.size}개 규칙` : null);
  }));
}
function setRules(set, label) {
  S.rules = new Set(set); applyFilter(); refresh();
  if (label) showChip(label); else if (!S.intent) $('chip').hidden = true;
}
function soloRule(k) { if (S.rules.size === 1 && S.rules.has(k)) return clearIntent(); setRules([k], S.ruleDefs[k]?.name + '만'); }
function renderList(fresh = true) {
  if (fresh || !S.listSnap) S.listSnap = S.last?.items || [];
  const items = S.listSnap, seen = new Set(), rows = [];
  for (const f of items) { if (seen.has(f.pnu)) continue; seen.add(f.pnu); rows.push(f); if (rows.length >= 30) break; }
  const p = pop(`<h2>현장 확인 목록<em>${fmt(new Set(items.map((f) => f.pnu)).size)}</em></h2>
    <ol>${rows.map((f) => { const a = String(f.addr || '').split(' '); return `<li><button type="button" data-pnu="${f.pnu}" ${S.sel === f.pnu ? 'aria-current="true"' : ''}><b>${esc(a.slice(-2).join(' '))}</b><em>${f.evid_m2?.value != null ? fmt(Math.round(f.evid_m2.value)) + '㎡' : ''}</em><span>${esc(S.ruleDefs[f.rule]?.name || f.rule_nm)}</span></button></li>`; }).join('')}</ol>`, 'list');
  p.querySelectorAll('[data-pnu]').forEach((b) => b.addEventListener('click', () => { const f = items.find((x) => x.pnu === b.dataset.pnu); openParcel(f.pnu, { fly: f.lnglat || f.geometry?.coordinates }); }));
}

/* 가르기: B = 원본 영상만(왼쪽) · A = 영상 + AI(오른쪽) */
async function toggleSwipe() {
  S.swipe = !S.swipe; press('swipe', S.swipe);
  const wrap = $('map-b'), grip = $('grip'), root = $('stage');
  if (!S.swipe) { wrap.hidden = true; grip.hidden = true; if (S.aiAuto) { S.layers.ai = false; applyLayers(); S.aiAuto = false; } return; }
  if (!S.layers.ai) { S.layers.ai = true; S.aiAuto = true; applyLayers(); }
  root.style.setProperty('--sw', '50%');
  if (!B) {
    B = createMap({ container: wrap, mode: 'flat', center: A.getCenter(), zoom: A.getZoom(), pitch: A.getPitch(), bearing: A.getBearing(), interactive: false, maxPitch: 60 });
    wrap.hidden = false; B.resize();
    await loaded(B);
    await mountLadder(B, S.cat.items, { order: S.cat.ladder?.domestic || [], before: 'slot-imagery', dates: { viirs: yesterdayUTC() } });
    if (S.tilt && A.getTerrain()) { B.addSource('dem', A.getStyle().sources.dem); B.setTerrain({ source: 'dem', exaggeration: 1.4 }); }
    A.on('move', () => { if (S.swipe) B.jumpTo({ center: A.getCenter(), zoom: A.getZoom(), pitch: A.getPitch(), bearing: A.getBearing() }); });
    let drag = false;
    const set = (x) => { const v = Math.max(6, Math.min(94, (x / innerWidth) * 100)); root.style.setProperty('--sw', v + '%'); grip.setAttribute('aria-valuenow', Math.round(v)); };
    grip.addEventListener('pointerdown', (e) => { drag = true; grip.setPointerCapture(e.pointerId); });
    grip.addEventListener('pointermove', (e) => { if (drag) set(e.clientX); });
    grip.addEventListener('pointerup', () => { drag = false; });
    grip.addEventListener('keydown', (e) => { const v = parseFloat(root.style.getPropertyValue('--sw')) || 50; if (e.key === 'ArrowLeft') set(((v - 4) / 100) * innerWidth); if (e.key === 'ArrowRight') set(((v + 4) / 100) * innerWidth); });
  }
  B.jumpTo({ center: A.getCenter(), zoom: A.getZoom(), pitch: A.getPitch(), bearing: A.getBearing() });
  wrap.hidden = false; B.resize(); grip.hidden = false;
  wrap.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 380, easing: 'cubic-bezier(.22,1,.36,1)' });
}

/* 입체: 지형(카탈로그 terrain) + 기울기 */
/* 지형은 지역 축척(z < 13.5)에서만 — 필지 축척은 기울기만(지형 타일 z13 위로는 이득 없음 · 검은 프레임 방지) */
const TERRAIN_MAX_Z = 13.5;
async function terrainFor(z) {
  const dem = S.cat.items.find((i) => i.kind === 'terrain');
  const want = !!(S.tilt && dem && z < TERRAIN_MAX_Z);
  for (const m of [A, B]) {
    if (!m) continue;
    const has = !!m.getTerrain();
    if (want && !has) { if (!m.getSource('dem')) m.addSource('dem', await sourceSpec(dem)); m.setTerrain({ source: 'dem', exaggeration: 1.4 }); }
    else if (!want && has) m.setTerrain(null);
  }
}
async function toggleTilt() {
  S.tilt = !S.tilt; press('tilt', S.tilt);
  await terrainFor(A.getZoom());
  stopFlight();
  A.easeTo({ pitch: S.tilt ? 55 : 0, bearing: S.tilt ? -14 : 0, duration: RM() ? 0 : 1250, easing: (t) => 1 - Math.pow(1 - t, 3) });
}

/* 보고서: 지금 가리키는 읍면동(한 문장 → 열린 필지 → 화면 중심 경계 · 없으면 전역) 실태조사 초안 docx */
async function report() {
  const b = document.querySelector('[data-tool="report"]'); if (b.dataset.busy) return;
  b.dataset.busy = '1';
  const e = emdHere();
  const p = new URLSearchParams({ format: 'docx', top: '20' }); if (e) p.set('emd_cd', e.cd);
  if (S.rules.size === 1) p.set('rule', [...S.rules][0]);
  try {
    const r = await api('/survey/reports/draft?' + p, { raw: true });
    if (!r.ok) throw new Error(r.status);
    const blob = await r.blob(), name = `실태조사_초안_${e?.nm || S.region || '전역'}.docx`;
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast(`보고서 초안 · ${e?.nm || S.region || '전역'}`);
  } catch { toast('보고서를 만들지 못했습니다'); }
  finally { delete b.dataset.busy; }
}

/* ═══ 검색 · 한 문장 ═══ */
function flyToEmd(e) { closeCard(); clearLocks(); flyLadder([A], fitCam(e.bbox, { top: 120, bottom: 80, left: 140, right: 420 }), { duration: 1600 }).then(schedule); }
function onIntent(o, err) {
  if (!o) { toast(err); return; }
  S.intent = o; S.emdFocus = o.emd || null; clearLocks();
  S.rules = new Set(o.rules.length ? o.rules : ALL_RULES); applyFilter();
  showChip(o.label);
  closeCard();
  const go = o.emd ? flyLadder([A], fitCam(o.emd.bbox, { top: 120, bottom: 80, left: 140, right: 420 }), { duration: 1600 }) : Promise.resolve();
  go.then(async () => { await refresh(); if (o.list) { closeTool(); S.tool = 'list'; press('list', true); renderList(); } else lockTop(3); });
}
function showChip(t) { $('chip-t').textContent = t; $('chip').hidden = false; }
function clearIntent() { S.intent = null; S.emdFocus = null; $('chip').hidden = true; S.rules = new Set(ALL_RULES); applyFilter(); refresh(); if (S.tool === 'rules') renderRules(); }

/* ═══ 계기 ═══ */
function scale() {
  const z = A.getZoom(), c = A.getCenter();
  const mpp = (40075016.7 * Math.cos((c.lat * Math.PI) / 180)) / (512 * 2 ** z);
  const raw = mpp * 96, p = 10 ** Math.floor(Math.log10(raw)), n = raw / p >= 5 ? 5 * p : raw / p >= 2 ? 2 * p : p;
  $('scale').querySelector('i').style.width = (n / mpp).toFixed(0) + 'px';
  $('scale').querySelector('b').textContent = n >= 1000 ? `${n / 1000} km` : `${n} m`;
}
let toastT = 0;
function toast(m) { const t = $('toast'); t.textContent = m; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 3200); }

boot().catch((e) => { console.warn('[xi-clean]', e); document.documentElement.dataset.xc = 'error'; toast('XI맵을 열지 못했습니다'); X.bootError = String(e?.message || e); });
