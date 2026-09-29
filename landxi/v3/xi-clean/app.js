/* xi-clean app.js — XI맵(직원 · 영업 · 기관 공용). 명세 LANDXI-FINAL-SPEC §2.8.
   같은 엔진(xi/engine · xi/fx)과 공용 키트(K1 셸 · K2 관문 · K3 무대 · K4 지역 · K5 서랍 · K6 큰 숫자 · K9 빈 상태 · K10 에이전트 · K12 · K13 · K14)를
   조합만 한다. 지역은 변수(URL ?region= · 기관 세션 · 검색 · 전국 지도에서 고르기) — 지역 문자열 하드코딩 0.
   큰 숫자 = 현장 확인 필요 n필지(/survey/findings · 우선순위 A · 미조치/배정 · 서로 다른 필지) — 영업 성과 띠와 같은 조회.
   읍면동 경계 = GET /regions/{sgg}/emd(전국 · 그 시군구 것만) · 결과 층 = GET /regions/{sgg}/results(그 시군구에 결과가 있는 모든 세트 + 전역 분석 결과). */
import * as K from '../kit/index.js';
import { api, session } from '../kit/util.js';
import { sse } from '../../shared/api-v1.js';
import { sourceSpec } from '../../xi/engine/sources.js';
import { addResultLayers, setVis } from '../../xi/fx/arrive.js';
import { analyzer } from './analyze.js';

const { h, esc } = K;
const Q = new URLSearchParams(location.search);
const nf = (n) => Number(n).toLocaleString('ko-KR');
const RM = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const MOBILE = () => matchMedia('(max-width: 640px)').matches;
const AMBER = '#FFB633';
const ALL_RULES = ['R1', 'R2', 'R3', 'R4', 'R5', 'R6'];
const STALE_DAYS = 30;
const X = (window.__xc = { t0: performance.now(), boot: {} });
const mark = (k) => { X.boot[k] = Math.round(performance.now() - X.t0); document.documentElement.dataset.xc = k; };

/* ═══ 첫 도착 — 관문(/me)을 기다리지 않고 모듈이 뜨자마자 데이터를 함께 부른다 ═══
   카탈로그 · 읍면동/규칙 집계는 탭 저장소에 10분 캐시(다시 오면 캐시로 바로 그리고 뒤에서 새로 받는다).
   현장 확인 필요 조회(findings)는 첫 지역이 정해지면 바로 미리 부르고, refresh 가 그 응답을 한 번 이어받는다(20초 안 · 한 번만). */
const SESS = session.get();
const SWR_MS = 10 * 60e3;
function swr(path) {
  const k = 'xc:' + (SESS?.realm || '') + ':' + (SESS?.tenant_id || SESS?.role || '') + ':' + path;
  let c = null; try { c = JSON.parse(sessionStorage.getItem(k) || 'null'); } catch { /* */ }
  const fresh = api(path).then((j) => { try { sessionStorage.setItem(k, JSON.stringify({ t: Date.now(), j })); } catch { /* 저장 불가 */ } return j; });
  if (c && Date.now() - c.t < SWR_MS) { fresh.catch(() => {}); return Promise.resolve(c.j); }
  return fresh;
}
const PRE = SESS ? {
  cat: swr('/catalog/layers?' + new URLSearchParams({ stage: 'domestic', build: SESS.realm === 'lx' ? 'lx' : 'tenant', locale: 'ko' })).catch(() => ({ items: [], ladder: {} })),
  emd: swr('/survey/stats?by=emd').catch(() => ({ items: [], failed: true })),
  rule: swr('/survey/stats?by=rule').catch(() => ({ items: [], failed: true })),
} : {};
PRE.sgg = fetch('/landxi/assets/data/geo/sigungu.geojson').then((r) => r.json()).catch(() => ({ features: [] }));
const FQ = new Map();
function prefetchFindings(qs) { if (!FQ.has(qs)) { const p = api('/survey/findings?' + qs); p.catch(() => {}); FQ.set(qs, { t: performance.now(), p }); } }
function findings(qs) {
  const c = FQ.get(qs); FQ.delete(qs);
  return c && performance.now() - c.t < 20e3 ? c.p : api('/survey/findings?' + qs);
}

/** 읍면동 · 규칙 집계를 상태에 싣는다. 조회 실패는 '결과 없음'과 다르다(S.statsFailed → HUD 는 실패로) */
function useStats(emdSt, ruleSt) {
  if (emdSt) {
    S.statsFailed = !!emdSt.failed;
    if (!emdSt.failed) {
      S.asOf = emdSt.as_of || null;
      S.emds = (emdSt.items || []).filter((i) => i.cd && i.bbox?.length === 4).map((i) => ({ cd: String(i.cd), nm: i.key, bbox: i.bbox }));
    }
  }
  if (ruleSt && !ruleSt.failed) S.ruleDefs = Object.fromEntries((ruleSt.items || []).map((i) => [i.key, { name: i.name }]));
  if (ruleSt) S.rulesFailed = !!ruleSt.failed;
}

/* 도구 아이콘(헤어라인 20) */
const ICO = {
  layers: '<path d="M10 3 2.5 7 10 11l7.5-4z"/><path d="M2.5 11 10 15l7.5-4"/>',
  rules: '<path d="M3 5h14M5.5 10h9M8 15h4"/>',
  list: '<path d="M7 5h10M7 10h10M7 15h10M3 5h.01M3 10h.01M3 15h.01"/>',
  swipe: '<rect x="3" y="4" width="14" height="12" rx="1.5"/><path d="M10 2v16"/>',
  tilt: '<path d="M2.5 15.5 7.5 8l3.5 4.5 2.5-3 4.5 6z"/>',
  sweep: '<path d="M3.5 10a6.5 6.5 0 0 1 11.3-4.4M16.5 10a6.5 6.5 0 0 1-11.3 4.4"/><path d="M15 2.5V6h-3.5M5 17.5V14h3.5"/>',
  report: '<path d="M5 2.5h7l3 3v12H5z M8 9h5 M8 12h5 M8 15h3"/>',
  analyze: '<path d="M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4"/><path d="M10 6.5l1 2.5 2.5 1-2.5 1-1 2.5-1-2.5L6.5 10 9 9z"/>',
};

const S = {
  who: null, key: '', lx: false, sales: false, tenant: false, canAnalyze: false,
  region: null, home: null, outside: false, regions: [], emds: [], ruleDefs: {}, asOf: null,
  cond: { emd: null, rule: null }, last: null, need: null, layers: { sus: true, ai: false, parcel: true, emd: true },
  remd: [], remdMeta: null, res: [], resOn: {},
  tool: null, swipe: false, tilt: false, sel: null, busy: false, list: null, cat: null,
};
let SH, stage, map, hudBig, bars, chips, pop, cmdk, AN, loadK, mainEl;

/* ═══ 부팅 ═══ */
async function boot() {
  const who = await K.gate('xi-clean');
  mark('gate');
  S.who = who; S.key = who.key; S.lx = who.me.realm === 'lx'; S.tenant = who.me.realm === 'tenant';
  S.sales = S.key === 'lx/sales' || S.key === 'tenant/demo';
  S.canAnalyze = S.lx || S.key === 'tenant/demo';
  document.documentElement.dataset.role = S.key.replace('/', '-');

  const tools = [['layers', '층'], ['rules', '규칙'], ['list', '목록'], ['swipe', '가르기'], ['tilt', '입체'], ['sweep', '대조'], ['report', '보고서']];
  if (S.canAnalyze) tools.push(['analyze', '분석']);
  S.tools = tools;
  SH = K.shell({ who, home: 'xi-clean', rail: { kind: 'menu', items: tools.map(([id, label]) => ({ id, label, icon: 'grid' })), current: -1, onPick: (i, it) => { tool(it.id); patchRail(); } } });
  SH.rail.setAttribute('aria-label', '도구');
  dedupeRole();
  patchRail();
  mainEl = SH.main;

  // 마스트: 검색 하나(시군구 · 지번 · 문장) + 조건 칩
  SH.mast(buildSearch());
  chips = h('div.xc-chips', { hidden: true });
  placeChips(); matchMedia(NARROW).addEventListener('change', placeChips);

  // 판: 무대 · HUD · 칩 · 팝오버 · 로딩
  const stageEl = h('div.xc-stage');
  const bEl = h('div.xc-b', { hidden: true, 'aria-hidden': 'true' });
  const fx = h('div.xc-fx', { 'aria-hidden': 'true' });
  hudBig = h('div.xc-big');
  bars = h('ol.xc-bars');
  const hud = h('section.xc-hud', { 'aria-live': 'polite' }, hudBig, bars);
  pop = h('section.xc-pop.t-card.t-card--map', { hidden: true });
  const grip = h('div.xc-grip', { hidden: true, role: 'slider', tabindex: '0', 'aria-label': '가르기', 'aria-valuemin': '5', 'aria-valuemax': '95', 'aria-valuenow': '50' }, h('i'));
  const loadEl = h('div.xc-load');
  mainEl.append(stageEl, bEl, fx, hud, pop, grip, loadEl);
  loadK = K.empty(h('div.xc-load-c'), { kind: 'loading', progress: 0.08 });
  loadEl.append(loadK.el);
  S.els = { stageEl, bEl, fx, hud, grip, loadEl };

  stage = K.createStage(stageEl);
  map = stage.map; X.map = map; X.stage = stage;
  K.devDrawer({ stage, who });
  hudBig.hidden = true;   // 첫 refresh 가 '조회 중' 자리를 깔 때까지(빈 봉투 문장이 먼저 보이지 않게)

  // 데이터(모듈 시작 때 이미 출발 · 관문 세션과 다르면 다시) — 카탈로그 · 읍면동/규칙 집계 · 전국 시군구 경계
  const build = S.lx ? 'lx' : 'tenant';
  const same = SESS && (SESS.realm === 'lx') === S.lx;
  const catP = same ? PRE.cat : api('/catalog/layers?' + new URLSearchParams({ stage: 'domestic', build, locale: 'ko' })).catch(() => ({ items: [], ladder: {} }));
  const [emdSt, ruleSt, sgg] = await Promise.all([
    PRE.emd || api('/survey/stats?by=emd').catch(() => ({ items: [], failed: true })),
    PRE.rule || api('/survey/stats?by=rule').catch(() => ({ items: [], failed: true })),
    PRE.sgg,
  ]);
  useStats(emdSt, ruleSt);
  S.regions = (sgg.features || []).map((f) => ({ code: String(f.properties.code), name: f.properties.name, sido: f.properties.sido, full: `${f.properties.sido} ${f.properties.name}`, bbox: K.bboxOf(f), geometry: f.geometry }));
  X.regions = S.regions.length;

  // 지역: URL → 기관 관할 → 없으면 전국 — 정해지는 즉시 HUD 조회를 미리 부른다(층 쌓기와 동시에)
  if (S.tenant) S.home = await homeRegion();
  const want = Q.get('region');
  const r0 = (want && (findRegion(want) || await regionByCode(want))) || S.home || null;
  if (Q.get('rule') && (ALL_RULES.includes(Q.get('rule')) || S.ruleDefs[Q.get('rule')])) S.cond.rule = Q.get('rule');
  { const q = hudQuery(r0, { emd: null, rule: S.cond.rule }); if (q.p && !(S.tenant && r0 && !inScope(r0))) prefetchFindings(q.p.toString()); }

  const [cat] = await Promise.all([catP, stage.ready]);
  S.cat = cat;
  mark('data'); loadK.set({ progress: 0.45 });

  await buildLayers(cat);
  mark('layers'); loadK.set({ progress: 0.7 });
  wireMap();

  AN = S.canAnalyze ? analyzer({ stage, host: mainEl, catalog: cat, who, demo: S.sales,
    // 분석이 도는 동안은 이미 있는 결과 층을 잠시 내린다(새로 차오르는 결과와 섞이지 않게) — 끝나면 층 설정 그대로
    onBusy: (b) => { S.busy = b; mainEl.dataset.busy = b ? '1' : ''; if (b) for (const it of S.res || []) setVis(map, it.ids, false); else applyLayers(); },
    onDone: (r) => { if (r) { refresh(); if (!r.replay) { K.toast('분석했습니다'); if (S.region) regionData(S.region); } } else if (S.tool === 'analyze') { S.tool = null; patchRail(); } },
    pick: pickEmd, regionInfo: () => ({ emds: S.remd, meta: S.remdMeta }) }) : null;

  cmdk = K.mountCmdk({ stage, guest: false, context: () => ({ region: S.region?.code || null, region_name: S.region?.full || null, emd_cd: S.cond.emd?.cd || null, rule: S.cond.rule || null }) });
  document.addEventListener('kit:agent-action', (e) => onAgent(e.detail));

  loadK.set({ progress: 0.85 });
  mark('canvas');
  // 도착 = HUD 숫자 + 지도(지역 베일 · 점)가 그려진 순간. 관할로 날아가는 카메라(2.4초)는 기다리지 않는다
  // 로딩 판은 도착 순간에 걷는다(덜 그려진 지도를 먼저 보이지 않게)
  await setRegion(r0, { first: true });
  hudBig.hidden = false;
  loadK.set({ progress: 1 });
  mark('ready');
  // 판을 걷는 순간: 보이는 타일이 다 왔거나 0.9초(덜 찬 타일 · 흰 사각형을 먼저 보이지 않게)
  { const t0 = performance.now();
    const out = () => { S.els.loadEl.classList.add('is-out'); setTimeout(() => S.els.loadEl.remove(), 600); X.boot.shown = Math.round(performance.now() - X.t0); };
    const poll = () => (map.areTilesLoaded() || performance.now() - t0 > 900 ? out() : setTimeout(poll, 60)); poll(); }

  if (Q.get('pnu')) openParcel(Q.get('pnu'), { fly: true });
  if (Q.get('job') && AN) { S.tool = 'analyze'; patchRail(); AN.replayJob(Q.get('job'), { label: S.region?.name, bbox: S.region?.bbox }); }
  // 기준일이 30일을 넘으면 도착 때 한 번 대조(세션당 1회)
  const stale = S.asOf && (Date.now() - Date.parse(S.asOf)) / 864e5 > STALE_DAYS;
  if (stale && regionEmds().length && !sessionStorage.getItem('xc_swept')) reconcile();
}

/* ═══ 레일(도구) — 셸 메뉴 레일에 헤어라인 아이콘 · 눌림 상태 ═══ */
function patchRail() {
  if (!SH) return;
  SH.rail.querySelectorAll('.k-rail-i').forEach((b) => {
    const id = S.tools[+b.dataset.i]?.[0]; if (!id) return;
    b.dataset.tool = id;
    const svg = b.querySelector('svg'); if (svg) svg.innerHTML = ICO[id] || '';
    const on = S.tool === id || (id === 'swipe' && S.swipe) || (id === 'tilt' && S.tilt) || (id === 'list' && S.list) || (id === 'analyze' && AN?.active);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    if (on) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
    const off = S.outside && ['rules', 'list', 'sweep', 'report'].includes(id) || (id === 'sweep' && !regionEmds().length) || (id === 'report' && !regionEmds().length);
    if (off) b.setAttribute('aria-disabled', 'true'); else b.removeAttribute('aria-disabled');
  });
}

/* ═══ 지도 층 ═══ */
async function buildLayers(cat) {
  const items = cat.items || [];
  // 원천 주소(서명 등)는 한꺼번에 받아 둔다 — 층은 아래에서 순서대로 쌓는다
  const specs = new Map();
  const want = items.filter((i) => i.role === 'reference' && (i.id === 'sigungu' || /^parcels-/.test(i.id)));
  const specsP = Promise.all(want.map((it) => sourceSpec(it).then((s) => specs.set(it.id, s), () => {})));
  // 영상 사다리(자체 영상만 · 외부 위성은 무대 바탕이 맡는다)
  const own = items.filter((i) => i.role === 'imagery' && i.source === 'pmtiles').map((i) => i.id);
  const order = (cat.ladder?.domestic || []).filter((id) => own.includes(id));
  const ladderP = stage.ladder(items, order).then((L) => { S.ladder = L; }, (e) => K.devlog('ladder', String(e?.message || e)));
  await Promise.all([specsP, ladderP]);
  const spec = async (it) => specs.get(it.id) || sourceSpec(it);

  // 시군구 경계(전국 · 지역 고르기)
  const sggIt = items.find((i) => i.role === 'reference' && i.id === 'sigungu');
  if (sggIt) {
    map.addSource('xc-sgg', await spec(sggIt));
    const L = sggIt.layer;
    map.addLayer({ id: 'sgg-hit', type: 'fill', source: 'xc-sgg', 'source-layer': L, maxzoom: 10, paint: { 'fill-color': '#FFFFFF', 'fill-opacity': 0.001 } }, 'slot-reference');
    map.addLayer({ id: 'sgg-hover', type: 'fill', source: 'xc-sgg', 'source-layer': L, maxzoom: 10, filter: ['==', ['to-string', ['get', 'code']], ''], paint: { 'fill-color': '#FFFFFF', 'fill-opacity': 0.16 } }, 'slot-reference');
    map.addLayer({ id: 'sgg-line', type: 'line', source: 'xc-sgg', 'source-layer': L, maxzoom: 11, layout: { 'line-join': 'round' }, paint: { 'line-color': '#FFFFFF', 'line-width': 0.7, 'line-opacity': ['interpolate', ['linear'], ['zoom'], 6, 0.35, 9, 0.5, 11, 0] } }, 'slot-reference');
  }
  // 지역 초점(지역 밖 회백 베일 · 딤 없음 + 경계선) — 전국 시군구 경계(geojson)에서 · 지역은 변수
  map.addSource('xc-rmask', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({ id: 'xc-rmask', type: 'fill', source: 'xc-rmask', paint: { 'fill-color': '#F2F4F6', 'fill-opacity': 0.4 } }, 'slot-reference');
  map.addSource('xc-rline', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({ id: 'xc-rline', type: 'line', source: 'xc-rline', layout: { 'line-join': 'round' }, paint: { 'line-color': '#FFFFFF', 'line-width': ['interpolate', ['linear'], ['zoom'], 7, 1.2, 12, 2.4], 'line-opacity': 0.9 } }, 'slot-reference');
  // 읍면동 경계 — 지금 지역의 것만(GET /regions/{sgg}/emd · 전국 · setRegion 이 채운다)
  map.addSource('xc-emd', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({ id: 'xc-emd', type: 'line', source: 'xc-emd', minzoom: 9, layout: { 'line-join': 'round' },
    paint: { 'line-color': '#FFFFFF', 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 0.5, 14, 1.2], 'line-opacity': ['interpolate', ['linear'], ['zoom'], 9, 0.25, 12, 0.5, 15, 0.3] } }, 'slot-reference');
  S.emdLayers = ['xc-emd'];
  // AI 분석 결과 층 — 지금 지역에 결과가 있는 세트(GET /regions/{sgg}/results · setRegion 이 채운다)
  S.aiIds = [];
  // 필지(카탈로그 'parcels-*' 참조 층) — 지적선 · 현장 확인 필요 필지 면
  S.parcelLayers = []; S.susLayers = [];
  for (const it of items.filter((i) => i.role === 'reference' && /^parcels-/.test(i.id))) {
    const sid = 'xc-pc-' + it.id;
    map.addSource(sid, await spec(it));
    map.addLayer({ id: sid + '-l', type: 'line', source: sid, 'source-layer': it.layer, minzoom: 14, layout: { 'line-join': 'round' },
      paint: { 'line-color': '#FFFFFF', 'line-width': ['interpolate', ['linear'], ['zoom'], 14, 0.4, 18, 1], 'line-opacity': ['interpolate', ['linear'], ['zoom'], 14, 0, 15, 0.4] } }, 'slot-overlay');
    map.addLayer({ id: sid + '-s', type: 'fill', source: sid, 'source-layer': it.layer, minzoom: 12.5, filter: ['in', ['to-string', ['get', 'pnu']], ['literal', []]],
      paint: { 'fill-color': AMBER, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 12.5, 0, 13.5, 0.5, 17, 0.28] } }, 'slot-overlay');
    map.addLayer({ id: sid + '-sl', type: 'line', source: sid, 'source-layer': it.layer, minzoom: 12.5, filter: ['in', ['to-string', ['get', 'pnu']], ['literal', []]],
      paint: { 'line-color': AMBER, 'line-width': ['interpolate', ['linear'], ['zoom'], 13, 0.8, 17, 2.2], 'line-opacity': ['interpolate', ['linear'], ['zoom'], 12.5, 0, 13.5, 1] } }, 'slot-overlay');
    S.parcelLayers.push(sid + '-l'); S.susLayers.push(sid + '-s', sid + '-sl');
  }
  // 현장 확인 필요 필지 점(먼 축척 · 필지 면이 차오르면 물러난다)
  map.addSource('xc-pts', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({ id: 'xc-pts-glow', type: 'circle', source: 'xc-pts', paint: { 'circle-color': AMBER, 'circle-blur': 1, 'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 3, 9, 6, 12, 12, 14, 14], 'circle-opacity': ['interpolate', ['linear'], ['zoom'], 6, 0.3, 12, 0.3, 14, 0] } }, 'slot-overlay');
  map.addLayer({ id: 'xc-pts', type: 'circle', source: 'xc-pts', paint: { 'circle-color': AMBER, 'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 1.4, 9, 2, 12, 3.2, 14, 4.5],
    'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 8, 0.4, 12, 1], 'circle-opacity': ['interpolate', ['linear'], ['zoom'], 13.5, 1, 14.5, 0], 'circle-stroke-opacity': ['interpolate', ['linear'], ['zoom'], 13.5, 0.9, 14.5, 0] } }, 'slot-overlay');
}
const susSet = () => [...S.susLayers, 'xc-pts', 'xc-pts-glow'];

function wireMap() {
  map.on('click', (e) => {
    if (AN?.active || S.swipe) return;
    const pad = [[e.point.x - 6, e.point.y - 6], [e.point.x + 6, e.point.y + 6]];
    const lyr = ['xc-pts', ...S.susLayers.filter((l) => l.endsWith('-s'))].filter((l) => map.getLayer(l));
    const hit = map.queryRenderedFeatures(pad, { layers: lyr })[0];
    if (hit?.properties?.pnu) { const t = String(hit.properties.pnu).slice(2); const f = (S.last?.items || []).find((x) => String(x.pnu).slice(2) === t); openParcel(f?.pnu || String(hit.properties.pnu), { fly: hit.layer.id === 'xc-pts' }); return; }
    // 먼 축척: 시군구를 누르면 그 지역으로
    if (map.getZoom() < 9.5 && map.getLayer('sgg-hit')) {
      const f = map.queryRenderedFeatures(e.point, { layers: ['sgg-hit'] })[0];
      const r = f && findRegion(String(f.properties?.code ?? ''));
      if (r) setRegion(r);
    }
  });
  for (const l of ['xc-pts', ...S.susLayers.filter((x) => x.endsWith('-s'))]) {
    map.on('mouseenter', l, () => { if (!AN?.active) map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', l, () => { if (!AN?.active) map.getCanvas().style.cursor = ''; });
  }
  if (map.getLayer('sgg-hit')) {
    map.on('mousemove', 'sgg-hit', (e) => { if (AN?.active || map.getZoom() >= 9.5) return; map.getCanvas().style.cursor = 'pointer'; map.setFilter('sgg-hover', ['==', ['to-string', ['get', 'code']], String(e.features?.[0]?.properties?.code ?? '')]); });
    map.on('mouseleave', 'sgg-hit', () => { if (AN?.active) return; map.getCanvas().style.cursor = ''; map.setFilter('sgg-hover', ['==', ['to-string', ['get', 'code']], '']); });
  }
  map.on('zoomend', () => terrainFor(map.getZoom()));
}

/* ═══ 지역 = 변수 ═══ */
const norm = (s) => String(s || '').replace(/\s+/g, '');
function findRegion(q) {
  const n = norm(q);
  return S.regions.find((r) => r.code === n) || S.regions.find((r) => norm(r.full) === n) || S.regions.find((r) => norm(r.name) === n) || null;
}
/** 다른 화면이 넘긴 시군구 코드(새 12xxx · 옛 46xxx 어느 쪽이든) → 지도 경계의 시군구. 코드 체계가 달라도 이름 + 위치로 맞춘다(지역 고정 0) */
async function regionByCode(code) {
  if (!/^\d{5}$/.test(String(code || ''))) return null;
  try {
    const j = await api('/regions?limit=400');
    const x = (j.items || []).find((it) => it.sgg_cd === code || it.prev_cd === code);
    if (!x) return null;
    return S.regions.find((r) => lastName(r.name) === lastName(x.name) && near(r.bbox, x.bbox)) || null;
  } catch { return null; }
}
/** 기관 세션의 관할 — ① 기관 이름이 시군구 하나면 그곳 ② 아니면(광역 기관) 요약(GET /summary · 기관 범위)에 결과가 있는 시군구
    ③ 그다음 관할(/regions in_scope) 첫 곳. 관할 목록(S.scope)은 '관할 밖' 판정에 쓴다 — 시군구 코드 체계가 달라도(옛 46xxx · 새 12xxx)
    이름 + 위치로 맞춘다. 지역 문자열 하드코딩 0 */
const near = (a, b) => a && b && Math.abs((a[0] + a[2]) / 2 - (b[0] + b[2]) / 2) < 0.25 && Math.abs((a[1] + a[3]) / 2 - (b[1] + b[3]) / 2) < 0.25;
const lastName = (s) => String(s || '').trim().split(/\s+/).pop();
function toRegion(x) {
  if (!x) return null;
  const code = String(x.sgg_cd || x.code || '');
  const nm = lastName(x.name || x.region_name);
  return findRegion(code) || S.regions.find((r) => norm(r.name) === norm(nm) && (!x.bbox || near(r.bbox, x.bbox))) || S.regions.find((r) => norm(r.name) === norm(nm)) || null;
}
async function homeRegion() {
  const t = S.who.tenant, nm = t?.name?.ko || S.who.org || '';
  let rs = [];
  try { rs = await K.loadRegions(); } catch { /* */ }
  const scoped = rs.filter((x) => x.in_scope);
  S.scope = scoped.length ? scoped : null;
  const r = findRegion(nm) || S.regions.find((x) => nm && norm(nm).endsWith(norm(x.name)) && norm(nm).includes(norm(x.sido).slice(0, 2)));
  if (r) return r;
  try {
    const sm = await api('/summary');
    const it = (sm.items || []).find((x) => Object.values(x.metrics || {}).some((m) => m && m.value !== null && m.value !== undefined));
    const hr = toRegion(it && { sgg_cd: it.sgg_cd, region_name: it.region_name, bbox: (rs.find((y) => String(y.sgg_cd) === String(it.sgg_cd)) || {}).bbox });
    if (hr) return hr;
  } catch (e) { K.devlog('home', `${e.code || ''} ${e.status ?? 0}`); }
  const d = scoped.find((x) => x.deploys?.length) || scoped[0] || null;
  return toRegion(d) || (d?.bbox ? { code: d.sgg_cd, name: d.name, sido: d.sido, full: d.full, bbox: d.bbox, geometry: null } : null);
}
/** 기관 관할 안인가 — 관할 목록이 있으면 그 안(이름 + 위치), 없으면 첫 화면 지역과 같은 곳만 */
function inScope(r) {
  if (!r) return true;
  if (S.scope) return S.scope.some((x) => String(x.sgg_cd) === r.code || (norm(lastName(x.name)) === norm(r.name) && near(x.bbox, r.bbox)));
  return !S.home || r.code === S.home.code;
}
const regionEmds = () => (S.region ? S.emds.filter((e) => e.cd.startsWith(S.region.code)) : S.emds);

/* ═══ 지역 자료: 읍면동 경계 · 결과 층(전국 · 지역 문자열 0) ═══ */
let rdSeq = 0;
async function regionData(r) {
  const my = ++rdSeq;
  S.remd = []; S.remdMeta = null;
  if (S.aiByRegion) { S.layers.ai = false; S.aiByRegion = false; }   // 앞 지역에서 자동으로 켠 AI 분석 층은 지역을 옮기면 되돌린다
  map.getSource('xc-emd')?.setData({ type: 'FeatureCollection', features: [] });
  clearResultLayers();
  if (!r) return;
  const [emd, res] = await Promise.all([
    api('/regions/' + encodeURIComponent(r.code) + '/emd').catch((e) => { K.devlog('emd', `${e.code || ''} ${e.status ?? 0}`); return null; }),
    api('/regions/' + encodeURIComponent(r.code) + '/results').catch((e) => { K.devlog('results', `${e.code || ''} ${e.status ?? 0}`); return null; }),
  ]);
  if (my !== rdSeq) return;
  if (emd) {
    S.remdMeta = { sgg_cd: emd.sgg_cd, prev_cd: emd.prev_cd };
    S.remd = (emd.features || []).map((f) => ({ cd: String(f.properties.emd_cd), nm: f.properties.name, bbox: f.properties.bbox, geometry: f.geometry }));
    map.getSource('xc-emd')?.setData(emd);
    X.emd = S.remd.length;
  }
  if (res) await addResultList(res.items || [], my);
}
function clearResultLayers() {
  for (const it of S.res || []) {
    for (const l of it.ids || []) if (map.getLayer(l)) map.removeLayer(l);
    if (map.getSource(it.sid)) map.removeSource(it.sid);
  }
  S.res = []; S.aiIds = [];
}
async function addResultList(items, my) {
  const out = [];
  for (const it of items) {
    const sid = 'xc-ai-' + String(it.id).replace(/[^\w-]/g, '_');
    if (map.getSource(sid)) continue;
    let spec;
    try { spec = await sourceSpec(it); } catch (e) { K.devlog('result src', String(e?.message || e)); continue; }
    if (my !== rdSeq) return;
    map.addSource(sid, spec);
    const ids = addResultLayers(map, sid, sid, { kind: it.style === 'landcover' ? 'landcover' : 'result', sourceLayer: it.layer, visible: false });
    // 점 결과(해양쓰레기 등 · 면 층에 그려지지 않는 것)
    map.addLayer({ id: sid + '-pt', type: 'circle', source: sid, 'source-layer': it.layer, filter: ['==', ['geometry-type'], 'Point'], layout: { visibility: 'none' },
      paint: { 'circle-color': '#0FA9A0', 'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 2, 14, 4.5], 'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': 1 } }, 'slot-result');
    ids.push(sid + '-pt');
    out.push({ ...it, sid, ids });
    if (!(it.id in S.resOn)) S.resOn[it.id] = true;
  }
  S.res = out;
  // 현장 확인 필요(실태조사)가 없는 지역은 AI 분석 결과를 기본으로 켠다 — 지도 위가 비지 않게
  if (out.length && !regionEmds().length && !S.layers.ai) { S.layers.ai = true; S.aiByRegion = true; }
  X.results = out.map((x) => x.name?.ko || x.id);
  applyLayers();
  if (S.tool === 'layers') renderLayers();
}

async function setRegion(r, { first = false } = {}) {
  S.region = r; S.cond.emd = null; S.sel = null; closeDrawer(); closePop();
  renderChips();                        // 이전 지역의 읍면동 칩을 바로 지운다(관할 밖 포함)
  if (AN?.running) { AN.detach(); S.tool = null; }      // 진행 중 전역 분석 — 서버 작업은 계속, 화면만 떼어 낸다(돌아오면 이어 보기)
  else if (AN?.active) AN.stop();
  S.outside = !!(S.tenant && r && !inScope(r));
  const u = new URL(location.href);
  if (r) u.searchParams.set('region', r.code); else u.searchParams.delete('region');
  history.replaceState(null, '', u);
  // 초점 층
  const W = [[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]];
  const g = r?.geometry;
  const polys = g ? (g.type === 'Polygon' ? [g.coordinates] : g.coordinates) : [];
  const cw = (ring) => { let a = 0; for (let i = 0; i < ring.length - 1; i++) a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]; return a < 0 ? ring : [...ring].reverse(); };
  map.getSource('xc-rmask')?.setData(g ? { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [W, ...polys.map((p) => cw(p[0]))] } } : { type: 'FeatureCollection', features: [] });
  map.getSource('xc-rline')?.setData(g ? { type: 'Feature', properties: {}, geometry: g } : { type: 'FeatureCollection', features: [] });
  S.els.hud.hidden = S.outside;
  patchRail();
  searchInput.value = r ? r.name : '';
  const fly = r ? stage.go(r.bbox, { ms: RM() ? 0 : 2400, maxZoom: 12.5 }) : stage.home({ ms: first ? 0 : 1600 });
  if (S.outside) {
    setPoints([]); regionData(null);
    const d = K.drawer({ title: r.name, host: mainEl, slot: 'right', onClose: () => { S.list = null; patchRail(); } });
    const box = h('div'); K.empty(box, { kind: 'outside', text: '이 기관의 관할 밖입니다', ...(S.home ? { action: { label: S.home.name, onClick: () => setRegion(S.home) } } : {}) });
    d.set(box); S.drawer = d;
    if (!first) await fly;
    return;
  }
  const rd = S.outside ? Promise.resolve() : regionData(r);
  const resumeAfter = () => rd.then(() => (S.region === r && AN && !AN.running ? AN.resume(r) : false)).then((ok) => { if (ok) { S.tool = 'analyze'; patchRail(); } });
  if (first) { X.fly = fly; await refresh(); resumeAfter(); return; }   // 첫 도착: 비행은 뒤에서 계속
  await Promise.all([fly, refresh()]);
  resumeAfter();
}

/* ═══ HUD · 점 · 필지 면 — 한 조회(현장 확인 필요) ═══ */
/** HUD 한 조회의 질의 — 지역 · 조건에서(프리페치와 refresh 가 같은 문자열을 쓴다) */
function hudQuery(region, cond) {
  const p = new URLSearchParams({ priority: 'A', state: 'open,assigned', limit: '2000', sort: 'score' });
  const emds = cond.emd ? [cond.emd] : region ? S.emds.filter((e) => e.cd.startsWith(region.code)) : null;
  if (emds && !emds.length) return { p: null, emds };
  if (emds) p.set('emd_cd', emds.map((e) => e.cd).join(','));
  if (cond.rule) p.set('rule', cond.rule);
  return { p, emds };
}
let seq = 0;
const RETRY = 2, RETRY_MS = 1500;
/** 잠깐 끊긴 것(네트워크 · status 0 · 5xx)만 다시 부른다. 4xx 는 다시 불러도 같다 */
const transient = (e) => !e?.status || e.status >= 500;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
/** HUD 큰 숫자 상태: wait(조회 중 · 빈 자리) · fail(— · 문장 없음) · empty(서버가 0/결과 없음) · ok */
function hudState(big, st, env, unit) {
  hudBig.dataset.st = st;
  if (st === 'ok') { big.set(env, unit ? { unit } : {}); return; }
  big.set(null);
  const none = hudBig.querySelector('.k-big-none'), num = hudBig.querySelector('.k-big-row > span');
  if (none) none.hidden = st !== 'empty';
  if (num && st === 'wait') num.textContent = '';
}
let failToast = null;
function hudFailed(my) {
  if (my !== seq) return;
  const big = hudBig.__big;
  hudState(big, 'fail'); drawBars([]); setPoints([]); S.last = null; S.need = null; S.hudFail = true;
  SH.fresh(null); renderChips();
  if (S.list) openList();
  failToast = K.toast('현황을 불러오지 못했습니다', { ms: 12000, action: { label: '다시 시도', onClick: () => refresh() } });
}
async function refresh() {
  if (S.outside) return;
  const my = ++seq;
  failToast?.close(); failToast = null;
  const where = S.cond.emd ? S.cond.emd.nm : S.region ? S.region.name : '전국';
  const label = `현장 확인 필요 · ${where}`;
  const scope = (S.cond.emd?.cd || S.region?.code || 'KR') + (S.cond.rule ? ':' + S.cond.rule : '');
  S.els.hud.dataset.scope = scope;
  const big = hudBig.__big || (hudBig.__big = K.bignum(hudBig, null, { label: '현장 확인 필요', unit: '필지', hud: true }));
  const setLab = (t) => { const lab = hudBig.querySelector('.k-big-l'); if (lab) { lab.textContent = t; lab.append(h('span.xc-where', { text: ` · ${where}` })); } };
  // 지역 대표 수치(조건 없음)는 요약 한 곳(GET /summary)에서만 — 읍면동 · 규칙 조건일 때만 현장 확인 목록에서 센다
  const sumP = !S.cond.emd && !S.cond.rule ? summaryBig(S.region) : Promise.resolve(undefined);
  if (hudBig.dataset.shown !== scope) setLab('현장 확인 필요');
  // 범위가 바뀌었거나 아직 숫자가 없으면 조회 중엔 빈 자리(얇은 자리표) — '결과 없음'을 먼저 보이지 않는다
  if (hudBig.dataset.shown !== scope || hudBig.dataset.st !== 'ok') { hudState(big, 'wait'); drawBars([]); }
  hudBig.hidden = false;
  S.hudFail = false;
  let j = null, q = null;
  for (let t = 0; ; t++) {
    try {
      if (S.statsFailed || S.rulesFailed) {           // 집계 조회가 실패했으면 먼저 다시 받는다
        const [e, r] = await Promise.all([
          S.statsFailed ? api('/survey/stats?by=emd') : null,
          S.rulesFailed ? api('/survey/stats?by=rule').catch(() => ({ items: [], failed: true })) : null,
        ]);
        useStats(e, r);
        if (my !== seq) return;
      }
      q = hudQuery(S.region, S.cond);
      if (!q.p) break;                                  // 서버가 이 지역 읍면동을 돌려주지 않음 = 결과 없음
      j = await findings(q.p.toString());
      break;
    } catch (e) {
      K.devlog('findings', `${e.code || e.name || ''} ${e.status ?? 0} (시도 ${t + 1})`);
      if (my !== seq) return;
      if (t >= RETRY || !transient(e)) { hudFailed(my); return; }
      await pause(RETRY_MS);
      if (my !== seq) return;
    }
  }
  if (my !== seq) return;
  const sb = await sumP;                               // undefined = 요약 조회 불가(목록에서 센 값으로) · null = 요약에 결과 없음
  if (my !== seq) return;
  const has = !!(j && (j.items?.length || j.total?.value > 0));
  if (has) {
    const pnus = new Set(j.items.map((f) => f.pnu));
    const total = j.total?.value ?? j.items.length, exact = j.items.length >= total;
    const need = exact ? pnus.size : Math.round(pnus.size * (total / Math.max(1, j.items.length)));
    S.need = { value: need, unit: '필지', basis: exact ? (j.total?.basis || 'inferred') : 'estimate', as_of: j.as_of || S.asOf || '', source: 'AI 실태조사 결과', note: '현장 확인 전' };
    S.last = j;
    K.devlog('hud', `${q.p} → ${need}필지 (findings ${total})`);
    const by = {}; for (const f of j.items) (by[f.rule] ||= new Set()).add(f.pnu);
    drawBars(Object.entries(by).map(([k, v]) => ({ k, n: v.size })));
    setPoints(j.items);
  } else { S.last = null; S.need = null; drawBars([]); setPoints([]); }
  const pickBig = sb !== undefined ? sb : (has ? { env: S.need, label: '현장 확인 필요', unit: '필지' } : null);
  if (sb) { if (sb.label === '현장 확인 필요') S.need = sb.env; K.devlog('summary', `${S.region?.code || 'KR'} → ${sb.label} ${sb.env.value}`); }
  if (pickBig) {
    setLab(pickBig.label);
    hudState(big, 'ok', pickBig.env, pickBig.unit);
    X.hud = { label: `${pickBig.label} · ${where}`, n: pickBig.env.value, total: j?.total?.value ?? 0, query: q?.p?.toString() || null, from: sb ? 'summary' : 'findings' };
  } else {                                            // 서버가 0/결과 없음을 돌려줌 → 이때만 '아직 결과가 없습니다'
    setLab('현장 확인 필요');
    hudState(big, 'empty');
    X.hud = { label, n: 0, total: 0, query: q?.p?.toString() || null, from: sb === null ? 'summary' : 'findings' };
  }
  hudBig.dataset.shown = scope;
  SH.fresh(j || sb ? new Date() : null);
  renderChips();
  if (S.list) openList();
}
/** 지역 대표 수치 — GET /summary?region= (fix-server-summary 계약). 현장 확인 필요(field_check)가 있으면 그것, 없으면 AI 탐지(detected).
    → { env, label, unit } · null(요약에 결과 없음) · undefined(요약을 못 읽음 — 호출한 쪽이 목록 값으로) */
async function summaryBig(r) {
  let j;
  try { j = await api('/summary' + (r ? '?' + new URLSearchParams({ region: r.code }) : '')); }
  catch (e) { K.devlog('summary', `${e.code || e.name || ''} ${e.status ?? 0}`); return undefined; }
  const items = j?.items || [];
  const of = (k) => items.map((it) => it.metrics?.[k]).filter((m) => m && m.value !== null && m.value !== undefined);
  const ms = of('field_check').length ? of('field_check') : of('detected');
  if (!ms.length) return null;
  const m0 = ms[0];
  const value = ms.reduce((a, m) => a + Number(m.value), 0);
  return { env: { value, unit: m0.unit, basis: m0.basis, as_of: m0.as_of || j.as_of || '', source: m0.source || '', note: m0.note }, label: m0.label, unit: m0.unit };
}
function drawBars(rows) {
  const top = rows.filter((r) => r.n > 0).sort((a, b) => b.n - a.n).slice(0, 3), max = Math.max(1, ...top.map((r) => r.n));
  bars.innerHTML = '';
  for (const r of top) {
    // 막대는 읽기 전용(버튼 예산 ≤ 10 · 도구 포함) — 규칙으로 거르기는 '규칙' 도구에서
    const b = h('div.xc-bar', { dataset: { rule: r.k }, 'data-on': S.cond.rule === r.k ? '1' : undefined },
      h('span.xc-bar-l', { text: S.ruleDefs[r.k]?.name || r.k }), h('span.xc-bar-t', {}, h('i', { style: { width: (r.n / max) * 100 + '%' } })), h('span.xc-bar-v.num', { text: nf(r.n) }));
    bars.append(h('li', {}, b));
  }
}
function setPoints(items) {
  const seen = new Set(), feats = [];
  for (const f of items) { const ll = f.lnglat || f.geometry?.coordinates; if (!ll || seen.has(f.pnu)) continue; seen.add(f.pnu); feats.push({ type: 'Feature', properties: { pnu: f.pnu, rule: f.rule }, geometry: { type: 'Point', coordinates: ll } }); }
  map.getSource('xc-pts')?.setData({ type: 'FeatureCollection', features: feats });
  // 필지 타일의 PNU 는 옛 시도 코드일 수 있다(예: 전북 45→52) — 시도 두 자리를 뺀 17자리로 맞춘다
  const lit = ['literal', [...seen].map((p) => String(p).slice(2))];
  for (const l of S.susLayers) map.setFilter(l, ['in', ['slice', ['to-string', ['get', 'pnu']], 2], lit]);
}

/* ═══ 조건(읍면동 · 규칙) ═══ */
function setCond({ emd, rule } = {}) {
  if (emd !== undefined) S.cond.emd = emd;
  if (rule !== undefined) S.cond.rule = rule;
  renderChips();
  if (S.tool === 'rules') renderRules();
  refresh();
}
function renderChips() {
  chips.innerHTML = '';
  const { emd, rule } = S.cond;
  if (!emd && !rule) { chips.hidden = true; return; }
  if (emd) chips.append(h('span.t-chip.xc-chip', { text: emd.nm }));
  if (rule) chips.append(h('span.t-chip.xc-chip', { text: S.ruleDefs[rule]?.name || rule }));
  chips.append(h('button.xc-clear', { type: 'button', text: '조건 지우기', onclick: () => { const e = S.cond.emd; setCond({ emd: null, rule: null }); if (e && S.region) stage.go(S.region.bbox, { ms: 1600, maxZoom: 12.5 }); } }));
  chips.hidden = false;
  alignChips();
}
/** 역할 칩 — 이름이 역할과 같으면(예: 'LX 직원 · LX 직원') 역할 하나만 */
function dedupeRole() {
  const r = document.querySelector('.k-mast .k-role'); if (!r) return;
  const b = r.querySelector('b'), rk = (b?.textContent || '').trim();
  const rn = (r.textContent || '').trim().slice(rk.length).trim();
  if (b && (!rn || norm(rn) === norm(rk))) r.textContent = rk;
}
/** 조건 칩 — 1220 이상은 마스트(검색 옆), 그 미만은 검색창 바로 아래 줄(마스트에 매달려 서랍 · HUD 위에 뜬다) */
const NARROW = '(max-width: 1219px)';
function placeChips() {
  const narrow = matchMedia(NARROW).matches;
  const mast = document.querySelector('.k-mast');
  (narrow ? mast : SH.mast.__slot || document.querySelector('.k-mast-slot'))?.append(chips);
  chips.classList.toggle('xc-chips--row', narrow);
  alignChips();
}
function alignChips() {
  if (!chips.classList.contains('xc-chips--row')) { chips.style.left = ''; return; }
  const mast = document.querySelector('.k-mast'), q = document.querySelector('.xc-q');
  if (!mast || !q || innerWidth <= 640) { chips.style.left = ''; return; }
  chips.style.left = Math.max(16, Math.round(q.getBoundingClientRect().left - mast.getBoundingClientRect().left)) + 'px';
}
addEventListener('resize', () => alignChips());

/* ═══ 검색 하나: 시군구 · 읍면동 · 지번 · 문장 ═══ */
let searchInput, sugg, sel = -1, opts = [];
function buildSearch() {
  searchInput = h('input.xc-q-i', { type: 'search', placeholder: '시군구 · 지번 · 또는 문장으로 물어보기', 'aria-label': '시군구 · 지번 · 또는 문장으로 물어보기', autocomplete: 'off', spellcheck: 'false', role: 'combobox', 'aria-expanded': 'false', 'aria-autocomplete': 'list' });
  sugg = h('ul.xc-sugg', { role: 'listbox', hidden: true });
  const box = h('div.xc-q', { role: 'search' }, h('span.xc-q-ico', { 'aria-hidden': 'true', html: '<svg viewBox="0 0 20 20"><circle cx="9" cy="9" r="5.5"/><path d="M13 13l4 4"/></svg>' }), searchInput, h('kbd.xc-q-k', { text: 'Ctrl K', 'aria-hidden': 'true' }), sugg);
  let t = 0;
  searchInput.addEventListener('focus', () => { searchInput.select(); drawSugg(); });
  searchInput.addEventListener('input', () => { clearTimeout(t); t = setTimeout(drawSugg, 120); });
  searchInput.addEventListener('blur', () => setTimeout(() => { sugg.hidden = true; searchInput.setAttribute('aria-expanded', 'false'); }, 150));
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!opts.length) return; sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + opts.length) % opts.length; markSugg(); }
    else if (e.key === 'Enter') { e.preventDefault(); const o = opts[sel] || opts[0]; if (o) o.go(); }
    else if (e.key === 'Escape') { sugg.hidden = true; searchInput.blur(); }
  });
  sugg.addEventListener('mousedown', (e) => { const li = e.target.closest('[data-i]'); if (li) { e.preventDefault(); opts[+li.dataset.i]?.go(); } });
  return box;
}
let qSeq = 0;
async function drawSugg() {
  const q = searchInput.value.trim(), n = norm(q), my = ++qSeq;
  opts = [];
  if (q && S.region && q === S.region.name) { sugg.hidden = true; return; }
  if (n) {
    for (const r of S.regions.filter((r) => norm(r.full).includes(n) || norm(r.name).includes(n)).slice(0, 5))
      opts.push({ t: r.name, s: r.sido, go: () => { done(); setRegion(r); } });
    const seenE = new Set();
    for (const e of [...S.remd, ...S.emds].filter((e) => norm(e.nm).includes(n))) {
      if (seenE.has(e.cd) || seenE.size >= 4) continue; seenE.add(e.cd);
      const inHere = S.remd.some((x) => x.cd === e.cd);
      const r = inHere ? S.region : findRegion(e.cd.slice(0, 5));
      opts.push({ t: e.nm, s: r?.name || '', go: () => { done(); goEmd(e, inHere ? S.region : null); } });
    }
  }
  if (/\d/.test(q)) {
    try {
      const j = await api('/survey/findings?' + new URLSearchParams({ q, limit: '5', sort: 'score' }));
      if (my !== qSeq) return;
      const seen = new Set();
      for (const f of j.items || []) { if (seen.has(f.pnu)) continue; seen.add(f.pnu); opts.push({ t: jibun(f.addr), s: S.ruleDefs[f.rule]?.name || '', go: () => { done(); openParcel(f.pnu, { fly: true }); } }); }
    } catch { /* */ }
  }
  if (q.length >= 4 && /\s/.test(q)) opts.push({ t: q, s: '물어보기', ask: true, go: () => { done(); ask(q); } });
  if (my !== qSeq) return;
  sel = -1;
  sugg.innerHTML = opts.map((o, i) => `<li role="option" id="xc-o-${i}" data-i="${i}"${o.ask ? ' class="is-ask"' : ''}><b>${esc(o.t)}</b><small>${esc(o.s)}</small></li>`).join('');
  sugg.hidden = !opts.length; searchInput.setAttribute('aria-expanded', String(!!opts.length));
  if (opts.length && n) { sel = 0; markSugg(); }
  function done() { sugg.hidden = true; searchInput.blur(); }
}
function markSugg() { [...sugg.children].forEach((li) => li.setAttribute('aria-selected', String(+li.dataset.i === sel))); searchInput.setAttribute('aria-activedescendant', sel >= 0 ? 'xc-o-' + sel : ''); }
const jibun = (addr) => String(addr || '').split(' ').slice(-2).join(' ');
function goEmd(e, here = null) {
  const r = here || findRegion(e.cd.slice(0, 5));
  const go = () => {
    setCond({ emd: e }); searchInput.value = e.nm;
    if (AN?.active && !AN.running) emdFrame(e).then((f) => AN.active && !AN.running && AN.start(S.region, f));   // 분석 중 검색 = 그 읍면동으로 프레임
    else stage.go(e.bbox, { ms: 1600, maxZoom: 14 });
  };
  if (r && S.region?.code !== r.code) setRegion(r).then(go); else go();
}
/* ═══ 분석 프레임 = 읍면동 경계(GET /regions/{sgg}/emd · 한 면 그대로) ═══ */
function emdParts(cd) {
  const out = [];
  const g = S.remd.find((x) => x.cd === cd)?.geometry;
  if (g?.type === 'Polygon') out.push(g.coordinates); else if (g?.type === 'MultiPolygon') out.push(...g.coordinates);
  return out;
}
/** 읍면동 → 분석 프레임 {geometry, label}. 카메라를 그 읍면동으로 옮긴다. 경계가 없으면 상자 */
async function emdFrame(e) {
  await stage.go(e.bbox, { ms: RM() ? 0 : 1250, maxZoom: 14 });
  const parts = emdParts(e.cd);
  const b = e.bbox;
  const geometry = parts.length ? { type: 'MultiPolygon', coordinates: parts }
    : { type: 'Polygon', coordinates: [[[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]], [b[0], b[1]]]] };
  K.devlog('emd frame', `${e.cd} · 조각 ${parts.length}`);
  return { geometry, label: e.nm };
}
/** 분석 중 지도 누르기 → 그 자리의 읍면동(경계 층의 면 안 · 없으면 null) */
function inRing(pt, ring) { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c; } return c; }
async function pickEmd(ll) {
  if (!S.remd.length) return null;                                     // 지금 지역 안의 읍면동만(지역 바꾸기는 검색 · 전국 지도에서)
  const pt = [ll.lng, ll.lat];
  const cands = S.remd.filter((e) => pt[0] >= e.bbox[0] && pt[0] <= e.bbox[2] && pt[1] >= e.bbox[1] && pt[1] <= e.bbox[3]);
  const e = cands.find((c) => emdParts(c.cd).some((poly) => inRing(pt, poly[0]) && !poly.slice(1).some((h) => inRing(pt, h))));
  if (!e) return null;
  S.cond.emd = e; renderChips(); searchInput.value = e.nm; refresh();
  return emdFrame(e);
}
function ask(q) {
  cmdk.open(q);
  requestAnimationFrame(() => cmdk.el.querySelector('form')?.requestSubmit());
}

/* ═══ 에이전트 → 지도(카메라 · 채색 · 집계) ═══ */
let closeT = 0;
function onAgent(a) {
  if (!a?.op) return;
  if (a.op === 'map_on' && a.filter) {
    const f = a.filter, e = f.emd_cd ? S.emds.find((x) => x.cd === String(f.emd_cd)) : null;
    const r = e ? findRegion(e.cd.slice(0, 5)) : null;
    const apply = () => { setCond({ emd: e || null, rule: f.rule && ALL_RULES.includes(f.rule) ? f.rule : null }); S.list = true; patchRail(); };
    if (r && S.region?.code !== r.code) setRegion(r).then(apply); else apply();
  }
  // 보유 결과 답의 이동(시군구 코드 동봉) → 지역을 그곳으로 바꿔 머리글 · 점이 답과 같은 곳을 가리키게
  if (a.op === 'map_flyto' && a.region) {
    // 코드 체계가 달라도(옛 46xxx · 새 12xxx) 범위가 가장 가까운 시군구로 맞춘다
    const c = (b) => [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2], d2 = (p, q) => (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2;
    const byBox = a.bbox ? S.regions.filter((x) => near(x.bbox, a.bbox)).sort((x, y) => d2(c(x.bbox), c(a.bbox)) - d2(c(y.bbox), c(a.bbox)))[0] : null;
    const r = findRegion(String(a.region)) || byBox || null;
    if (r && S.region?.code !== r.code) setRegion(r);
  }
  if (a.op === 'parcel_card' && a.pnu) openParcel(String(a.pnu));
  if (a.op === 'drawer_open' && a.kind === 'report') { tool('report'); }
  // 지도 동작 뒤 바를 접되, 답(한 줄 · 숫자)이 있으면 읽을 수 있게 그대로 둔다(닫기는 사용자가 Esc · 바깥 누르기)
  if (['map_on', 'map_arrive', 'map_flyto', 'parcel_card'].includes(a.op)) { clearTimeout(closeT); closeT = setTimeout(() => { if (!hasAnswer()) cmdk.close(); }, 1600); }
}
function hasAnswer() {
  const el = cmdk?.el; if (!el) return false;
  if (el.dataset.state === 'busy') return true;            // 답이 오는 중 — 접지 않는다
  const a = el.querySelector('.k-ck-a');
  return !!(a && !a.hidden && a.textContent.trim());
}

/* ═══ 서랍: 목록 · 필지 ═══ */
function closeDrawer() { if (S.drawer) { const d = S.drawer; S.drawer = null; d.close(true); } stage.geo('sel', null, 'focus'); stage.pad({}); }
function drawerOpen(title, onClose) {
  const d = K.drawer({ title, host: mainEl, slot: 'right', onClose: () => { if (S.drawer === d) S.drawer = null; stage.geo('sel', null, 'focus'); stage.pad({}); onClose?.(); patchRail(); } });
  S.drawer = d; stage.pad(MOBILE() ? { bottom: Math.round(innerHeight * 0.5) } : { right: 416 });
  return d;
}
function openList() {
  const n = S.need?.value;
  const title = n != null ? `현장 확인 필요 ${nf(n)}` : '현장 확인 필요';
  const d = S.drawer && S.drawer.__kind === 'list' ? S.drawer.title(title) : drawerOpen(title, () => { S.list = null; });
  d.__kind = 'list'; S.list = true; patchRail();
  const box = h('div.xc-list');
  if (!S.last && S.hudFail) { K.empty(box, { kind: 'first', title: '현황을 불러오지 못했습니다', action: { label: '다시 시도', onClick: () => refresh() } }); d.set(box); return; }
  if (!S.last && hudBig.dataset.st === 'wait') { K.empty(box, { kind: 'loading' }).set({ progress: null }); d.set(box); return; }
  if (!S.last) { K.empty(box, { kind: 'first', text: '이 지역의 첫 분석이 끝나면 여기에 모입니다' }); d.set(box); return; }
  const seen = new Set(), rows = [];
  for (const f of S.last.items) { if (seen.has(f.pnu)) continue; seen.add(f.pnu); rows.push(f); }
  let shown = 40;
  const ul = h('ol.xc-rows');
  const draw = () => {
    ul.innerHTML = '';
    for (const f of rows.slice(0, shown)) ul.append(h('li', {}, h('button', { type: 'button', 'aria-current': S.sel === f.pnu ? 'true' : undefined, onclick: () => openParcel(f.pnu, { fly: true, back: true }) },
      h('b', { text: jibun(f.addr) }), h('span', { text: '· ' + (S.ruleDefs[f.rule]?.name || f.rule) }))));
    more.hidden = rows.length <= shown;
  };
  const more = h('button.t-btn.t-btn--text.xc-more', { type: 'button', text: '더 보기', onclick: () => { shown += 40; draw(); } });
  box.append(ul, more); draw();
  d.set(box);
}
async function openParcel(pnu, { fly = false } = {}) {
  if (!pnu) return;
  S.sel = pnu;
  let d;
  try { d = await api(`/survey/parcels/${encodeURIComponent(pnu)}?with=facts,findings,geom`); } catch { K.toast('필지를 불러오지 못했습니다'); return; }
  if (S.sel !== pnu) return;
  const f = (d.findings || []).find((x) => ['open', 'assigned'].includes(x.state)) || d.findings?.[0] || null;
  const L = d.facts?.ledger || {};
  const reviewed = f && ['inspected', 'closed'].includes(f.state);
  const dr = drawerOpen(jibun(d.addr), () => { S.sel = null; S.list = null; });
  dr.__kind = 'parcel'; S.list = null; patchRail();
  if (d.geometry) { stage.geo('sel', { type: 'Feature', properties: {}, geometry: d.geometry }, 'focus'); if (fly) stage.go(K.bboxOf(d.geometry), { ms: 1250, maxZoom: 17.5 }); }
  // 규칙 → AI 가 본 것(/survey/stats?by=rule 의 모든 키). 모르는 키는 규칙 이름을 그대로
  const cls = { R1: '건물', R2: '경작 흔적 없음', R3: '비닐하우스', R4: '주차장', R5: '개간지', R6: '건물', L1: '건물', L2: '경작 흔적 없음', L3: '건물 없음' };
  const seen = f ? (cls[f.rule] || S.ruleDefs[f.rule]?.name || f.rule_nm || f.rule || '—') : '—';
  const m2 = (e) => (e && e.value != null ? `${nf(Math.round(e.value))}㎡${K.sig(e)}` : '—');
  const pct = f?.evid_pct?.value;
  const body = h('div.xc-parcel', {},
    h('p.xc-tags', {}, h('span.t-chip', { text: reviewed ? '✓ 확인됨' : 'AI 분석 · 확인 전', 'data-lv': reviewed ? undefined : 'wait' }), f ? h('span.t-chip', { text: S.ruleDefs[f.rule]?.name || f.rule_nm || '' }) : null),
    h('dl.xc-pair', {},
      h('div', {}, h('dt', { text: '대장' }), h('dd', { html: `<b>${esc(L.jimok_nm || L.jimok || '—')}</b> ${m2(L.area_m2)}` })),
      h('div.ai', {}, h('dt', { text: 'AI 분석' }), h('dd', { html: f ? `<b>${esc(seen)}</b> ${m2(f.evid_m2)}${pct != null ? ` · ${Math.round(pct)}%` : ''}` : '—' }))),
  );
  const act = h('div.xc-act');
  if (f && S.tenant && S.who.me.role === 'manager' && f.state === 'open') act.append(h('button.t-btn', { type: 'button', text: '현장 배정', onclick: (e) => setState(f, 'assigned', e.currentTarget) }));
  if (f && S.lx && S.key !== 'lx/sales' && ['open', 'assigned'].includes(f.state)) act.append(h('button.t-btn.t-btn--2', { type: 'button', text: '오탐', onclick: (e) => setState(f, 'dismissed', e.currentTarget) }));
  if (act.childElementCount) body.append(act);
  dr.set(body);
}
async function setState(f, to, btn) {
  btn.disabled = true;
  try {
    const id = (crypto.randomUUID?.() || String(Date.now()) + Math.random()).slice(0, 60);
    await api(`/survey/findings/${encodeURIComponent(f.id)}/state`, { method: 'POST', body: { state: to, client_id: 'xc-' + id, ...(to === 'dismissed' ? { reason: '오탐' } : {}) } });
    K.toast(to === 'assigned' ? '배정했습니다' : '오탐으로 표시했습니다');
    closeDrawer(); refresh();
  } catch (e) { btn.disabled = false; K.devlog('state', `${e.code} ${e.message}`); K.toast('지금은 바꿀 수 없습니다'); }
}

/* ═══ 도구 ═══ */
function tool(id) {
  const b = SH.rail.querySelector(`[data-tool="${id}"]`);
  if (b?.getAttribute('aria-disabled') === 'true') { SH.go(-1); return; }
  SH.go(-1);
  if (id === 'list') { if (S.list) { closeDrawer(); S.list = null; } else { closePop(); openList(); } return; }
  if (id === 'swipe') return toggleSwipe();
  if (id === 'tilt') return toggleTilt();
  if (id === 'analyze') {
    if (AN.active) { if (!AN.running) AN.stop(); S.tool = null; patchRail(); return; }
    closePop(); closeDrawer(); S.tool = 'analyze'; patchRail();
    const e = S.cond.emd;
    if (e) emdFrame(e).then((f) => { if (S.tool === 'analyze' && !AN.running) AN.start(S.region, f); }); else AN.start(S.region);
    return;
  }
  if (S.tool === id) return closePop();
  if (S.tool === 'analyze' && AN?.active && !AN.running) AN.stop();
  S.tool = id; patchRail();
  ({ layers: renderLayers, rules: renderRules, sweep: renderSweep, report: renderReport })[id]?.();
}
function closePop() { if (S.tool && S.tool !== 'analyze') S.tool = null; pop.hidden = true; patchRail(); }
function showPop(title, ...kids) {
  pop.innerHTML = '';
  pop.append(h('header.xc-pop-h', {}, h('h2', { text: title }), h('button.xa-x', { type: 'button', 'aria-label': '닫기', html: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15"/></svg>', onclick: closePop })), ...kids);
  pop.hidden = false;
  // 누른 도구 높이에 맞추되 HUD 아래로
  const b = SH.rail.querySelector(`[data-tool="${S.tool}"]`), m = mainEl.getBoundingClientRect(), hb = S.els.hud.getBoundingClientRect();
  if (!MOBILE() && b) { const y = b.getBoundingClientRect().top - m.top; pop.style.top = Math.max(y, hb.bottom - m.top + 12) + 'px'; }
  else pop.style.top = '';
}
function renderLayers() {
  const L = [['sus', '현장 확인 필요'], ['ai', 'AI 분석'], ['parcel', '지적선'], ['emd', '읍면동 경계']];
  const rows = L.map(([k, t]) => h('button.xc-row', { type: 'button', 'aria-pressed': String(S.layers[k]), onclick: (e) => { S.layers[k] = !S.layers[k]; if (k === 'ai') S.aiByRegion = false; e.currentTarget.setAttribute('aria-pressed', String(S.layers[k])); applyLayers(); if (k === 'ai') renderLayers(); } }, h('i.xc-sw'), h('span', { text: t }), h('i.xc-key', { dataset: { k } })));
  // AI 분석 아래: 이 지역에 결과가 있는 세트(이름 = 카탈로그 · 전역 분석 결과)
  const sub = (S.res || []).map((it) => h('button.xc-row.xc-row--sub', { type: 'button', 'aria-pressed': String(!!(S.layers.ai && S.resOn[it.id])), 'data-res': it.id,
    onclick: (e) => { if (!S.layers.ai) { S.layers.ai = true; S.resOn[it.id] = true; } else S.resOn[it.id] = !S.resOn[it.id]; applyLayers(); renderLayers(); } },
  h('i.xc-sw'), h('span', { text: it.name?.ko || it.id })));
  const ai = rows.findIndex((b) => b.querySelector('[data-k="ai"]'));
  rows.splice(ai + 1, 0, ...sub);
  showPop('층', h('div.xc-rows-p', {}, ...rows));
}
function applyLayers() {
  setVis(map, susSet(), S.layers.sus);
  for (const it of S.res || []) setVis(map, it.ids, !!(S.layers.ai && S.resOn[it.id]));
  setVis(map, S.parcelLayers, S.layers.parcel);
  setVis(map, S.emdLayers, S.layers.emd);
}
function renderRules() {
  const by = S.last?.by_rule || {};
  const rows = ALL_RULES.filter((k) => S.ruleDefs[k]).map((k) => h('button.xc-row', { type: 'button', 'aria-pressed': String(S.cond.rule === k), onclick: () => setCond({ rule: S.cond.rule === k ? null : k }) },
    h('i.xc-rd'), h('span', { text: S.ruleDefs[k].name }), h('em.num', { text: by[k]?.value != null ? nf(by[k].value) : '' })));
  showPop('규칙', h('div.xc-rows-p', {}, ...rows));
}
function renderSweep() {
  const run = h('button.t-btn', { type: 'button', text: '대조 실행', onclick: () => { closePop(); reconcile(); } });
  showPop('대조', h('p.t-label.xc-pop-l', { text: S.asOf ? `${K.df ? K.df(S.asOf) : S.asOf} 기준` : '' }), h('div.xc-act', {}, run));
}
function renderReport() {
  const e = reportEmd();
  const btn = h('button.t-btn', { type: 'button', text: '보고서 초안(.docx)', onclick: () => report(e, btn) });
  showPop('보고서', h('p.t-label.xc-pop-l', { text: e ? e.nm : '' }), h('div.xc-act', {}, btn));
}
/** 보고서 대상 읍면동: 조건 → 열린 필지 → 지금 목록에서 가장 많은 곳 */
function reportEmd() {
  if (S.cond.emd) return S.cond.emd;
  if (S.sel) { const e = S.emds.find((x) => x.cd === String(S.sel).slice(0, 8)); if (e) return e; }
  const c = {}; for (const f of S.last?.items || []) c[f.emd_cd] = (c[f.emd_cd] || 0) + 1;
  const top = Object.entries(c).sort((a, b) => b[1] - a[1])[0];
  return top ? S.emds.find((x) => x.cd === top[0]) || null : null;
}

/* 보고서 초안 — 에이전트(POST /agent/report/draft · SSE) → .docx. 분석이 GPU 를 쓰는 동안은 LLM 없는 초안으로(전력 규칙) */
async function report(e, btn) {
  if (!e || btn.disabled) return;
  btn.disabled = true; btn.textContent = '초안 작성 중';
  const name = `실태조사_초안_${e.nm}.docx`;
  const save = (blob) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); K.toast('보고서 초안을 만들었습니다'); };
  const plain = async () => { const r = await api('/survey/reports/draft?' + new URLSearchParams({ emd_cd: e.cd, format: 'docx', top: '20', ...(S.cond.rule ? { rule: S.cond.rule } : {}) }), { raw: true }); if (!r.ok) throw new Error(r.status); save(await r.blob()); };
  try {
    if (S.busy) await plain();
    else {
      const r = await api('/agent/report/draft', { method: 'POST', body: { template: 'survey-emd', emd_cd: e.cd, ...(S.cond.rule ? { rule: S.cond.rule } : {}) } });
      const url = await new Promise((res, rej) => {
        let errs = 0;
        const s = sse(r.events_url.replace(/^\/api\/v1/, ''), { events: ['agent.done', 'agent.failed', 'agent.rejected'],
          on: (n, d) => { s.close(); if (n === 'agent.done') res(d?.artifact?.docx_url || `/agent/runs/${r.run.id}/draft.docx`); else rej(new Error(n)); },
          onState: (st) => { if (st === 'error' && ++errs >= 3) { s.close(); rej(new Error('timeout')); } } });
        setTimeout(() => { s.close(); rej(new Error('timeout')); }, 120000);
      });
      K.devlog('report', url);
      const f = await api(url.replace(/^.*\/api\/v1/, ''), { raw: true });
      if (!f.ok) throw new Error(f.status);
      save(await f.blob());
    }
  } catch (err) {
    K.devlog('report', String(err?.message || err));
    try { await plain(); } catch { K.toast('보고서를 만들지 못했습니다'); }
  } finally { btn.disabled = false; btn.textContent = '보고서 초안(.docx)'; }
}

/* 대조 — 실제 작업(POST /jobs kind:survey + SSE) · 읍면동 칸마다 탐지 순간 · 끊기면 3번 다시 → 실패 확정 */
async function reconcile() {
  if (S.busy || S.outside) return;
  const emds = regionEmds(); if (!emds.length) return;
  S.busy = true; mainEl.dataset.busy = '1';
  sessionStorage.setItem('xc_swept', '1');
  const btn = SH.rail.querySelector('[data-tool="sweep"]'); btn?.setAttribute('data-busy', '1');
  if (S.region) await stage.go(S.region.bbox, { ms: 1250, maxZoom: 12.5 });
  const per = {}; for (const f of S.last?.items || []) (per[f.emd_cd] ||= new Set()).add(f.pnu);
  const big = hudBig.__big;
  const keep = S.need;
  big?.set({ ...(keep || { unit: '필지', basis: 'inferred', as_of: S.asOf || '', source: 'AI 실태조사 결과' }), value: 0 });
  let acc = 0, ok = false;
  try {
    const r = await api('/jobs', { method: 'POST', body: { kind: 'survey', survey_id: 'farmland', rules: ALL_RULES, options: {}, priority: 0, ...(S.sales ? { demo: true } : {}) } });
    K.devlog('sweep job', r.job?.id);
    ok = await new Promise((res) => {
      let errs = 0, fin = false;
      const end = (v) => { if (fin) return; fin = true; s.close(); res(v); };
      const s = sse(r.events_url.replace(/^\/api\/v1/, ''), { events: ['job.started', 'shard.done', 'job.done', 'job.failed', 'job.cancelled'],
        on: (n, d) => {
          if (n === 'shard.done') {
            const cd = String(d?.shard_id || '').replace(/^emd-/, '');
            if (per[cd]) { acc += per[cd].size; big?.set({ ...(keep || {}), value: acc }, { animate: false }); }
            bracket(d?.bbox);
          } else if (n === 'job.done') end(true);
          else if (n === 'job.failed' || n === 'job.cancelled') end(false);
        },
        onState: (st) => { if (st === 'error' && ++errs >= 3) end(false); if (st === 'open') errs = 0; } });
      setTimeout(() => end(false), 60000);
    });
  } catch (e) { K.devlog('sweep', `${e.code || ''} ${e.message || ''}`); ok = false; }
  S.busy = false; mainEl.dataset.busy = ''; btn?.removeAttribute('data-busy');
  K.toast(ok ? '대조했습니다' : '대조를 마치지 못했습니다');
  refresh();
}
function bracket(b) {
  if (!b || RM()) return;
  const a = map.project([b[0], b[3]]), z = map.project([b[2], b[1]]);
  const w = z.x - a.x, hh = z.y - a.y; if (w < 10 || hh < 10) return;
  const el = h('i.xa-bk', { style: { transform: `translate(${a.x.toFixed(1)}px,${a.y.toFixed(1)}px)`, width: w.toFixed(1) + 'px', height: hh.toFixed(1) + 'px' } });
  S.els.fx.append(el);
  el.animate([{ opacity: 0 }, { opacity: 1, offset: 0.15 }, { opacity: 1, offset: 0.6 }, { opacity: 0 }], { duration: 1250, easing: 'linear' }).finished.then(() => el.remove(), () => el.remove());
}

/* 가르기 — 왼쪽 = 원본 영상 · 오른쪽 = 영상 + AI 판독(같은 카메라) */
let B = null;
async function toggleSwipe() {
  S.swipe = !S.swipe; patchRail();
  const { bEl, grip } = S.els;
  if (!S.swipe) { bEl.hidden = true; grip.hidden = true; if (S.aiAuto) { S.layers.ai = false; S.aiAuto = false; applyLayers(); } return; }
  if (!S.layers.ai) { S.layers.ai = true; S.aiAuto = true; applyLayers(); }
  mainEl.style.setProperty('--sw', '50%');
  bEl.hidden = false; grip.hidden = false;
  if (!B) {
    B = K.createStage(bEl, { interactive: false, scale: false });
    await B.ready;
    const items = S.cat.items || [], own = items.filter((i) => i.role === 'imagery' && i.source === 'pmtiles').map((i) => i.id);
    try { await B.ladder(items, (S.cat.ladder?.domestic || []).filter((id) => own.includes(id))); } catch { /* */ }
    const sync = () => { if (S.swipe) B.map.jumpTo({ center: map.getCenter(), zoom: map.getZoom(), pitch: map.getPitch(), bearing: map.getBearing() }); };
    map.on('move', sync);
    let drag = false;
    const setX = (x) => { const r = mainEl.getBoundingClientRect(); const v = Math.max(5, Math.min(95, ((x - r.left) / r.width) * 100)); mainEl.style.setProperty('--sw', v + '%'); grip.setAttribute('aria-valuenow', String(Math.round(v))); };
    grip.addEventListener('pointerdown', (e) => { drag = true; grip.setPointerCapture(e.pointerId); });
    grip.addEventListener('pointermove', (e) => { if (drag) setX(e.clientX); });
    grip.addEventListener('pointerup', () => { drag = false; });
    grip.addEventListener('keydown', (e) => { const r = mainEl.getBoundingClientRect(), v = parseFloat(mainEl.style.getPropertyValue('--sw')) || 50; if (e.key === 'ArrowLeft') setX(r.left + ((v - 4) / 100) * r.width); if (e.key === 'ArrowRight') setX(r.left + ((v + 4) / 100) * r.width); });
  }
  B.map.resize();
  B.map.jumpTo({ center: map.getCenter(), zoom: map.getZoom(), pitch: map.getPitch(), bearing: map.getBearing() });
}

/* 입체 — 지형(카탈로그 terrain) + 기울기 · 지형은 지역 축척에서만 */
async function terrainFor(z) {
  const dem = (S.cat?.items || []).find((i) => i.kind === 'terrain');
  const want = !!(S.tilt && dem && z < 13.5);
  const has = !!map.getTerrain();
  if (want && !has) { if (!map.getSource('xc-dem')) map.addSource('xc-dem', await sourceSpec(dem)); map.setTerrain({ source: 'xc-dem', exaggeration: 1.4 }); }
  else if (!want && has) map.setTerrain(null);
}
async function toggleTilt() {
  S.tilt = !S.tilt; patchRail();
  await terrainFor(map.getZoom());
  map.easeTo({ pitch: S.tilt ? 55 : 0, bearing: S.tilt ? -14 : 0, duration: RM() ? 0 : 1250, easing: (t) => 1 - Math.pow(1 - t, 3) });
}

addEventListener('keydown', (e) => { if (e.key === 'Escape' && !pop.hidden) closePop(); });
boot().catch((e) => { console.warn('[xi-clean]', e); document.documentElement.dataset.xc = 'error'; X.err = String(e?.message || e); try { K.toast('XI맵을 열지 못했습니다'); } catch { /* */ } });
