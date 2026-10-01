/* xi-clean app.js — XI맵(직원 · 영업 · 기관 공용). 명세 LANDXI-FINAL-SPEC §2.8.
   같은 엔진(xi/engine · xi/fx)과 공용 키트(K1 셸 · K2 관문 · K3 무대 · K4 지역 · K5 서랍 · K6 큰 숫자 · K9 빈 상태 · K10 에이전트 · K12 · K13 · K14)를
   조합만 한다. 지역은 변수(URL ?region= · 기관 세션 · 검색 · 전국 지도에서 고르기) — 지역 문자열 하드코딩 0.
   큰 숫자 = 현장 확인 필요 n필지(/survey/findings · 우선순위 A · 판정 전 · 서로 다른 필지) — 영업 성과 띠와 같은 조회.
   기관 계정 = 관할 시군구만(원칙 39): 지역 목록 · 검색 제안 · 경계는 서버가 준 관할 목록(GET /regions?geom=1)에서만 — 전국 시군구 파일을 받지 않는다.
   광역 기관은 관할 전체로 도착하고 시군구는 사용자가 고른다(화면이 대신 고르지 않는다).
   읍면동 경계 = GET /regions/{sgg}/emd(전국 · 그 시군구 것만) · 결과 층 = GET /regions/{sgg}/results(그 시군구에 결과가 있는 모든 세트 + 전역 분석 결과). */
import * as K from '../kit/index.js';
import { api, session } from '../kit/util.js';
import { sse, API } from '../../shared/api-v1.js';
import { sourceSpec } from '../../xi/engine/sources.js';
import { addResultLayers, setVis } from '../../xi/fx/arrive.js';
import { analyzer } from './analyze.js';
import { reviewAction, canRequest } from '../kit/notify.js';   // 필지 카드 '검토 요청'(기관 · 구현 2차)

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
  // 실태조사 적재 중(state 'building')인 집계는 칸이 비어 있다 — 캐시에 두지 않는다(끝난 뒤 새로 열어도 빈 칸을 읽지 않게)
  const fresh = api(path).then((j) => { if (j?.state !== 'building') { try { sessionStorage.setItem(k, JSON.stringify({ t: Date.now(), j })); } catch { /* 저장 불가 */ } } return j; });
  if (c && Date.now() - c.t < SWR_MS && c.j?.state !== 'building') { fresh.catch(() => {}); return Promise.resolve(c.j); }
  return fresh;
}
const PRE = SESS ? {
  cat: swr('/catalog/layers?' + new URLSearchParams({ stage: 'domestic', build: SESS.realm === 'lx' ? 'lx' : 'tenant', locale: 'ko' })).catch(() => ({ items: [], ladder: {} })),
  emd: swr('/survey/stats?by=emd').catch(() => ({ items: [], failed: true })),
  rule: swr('/survey/stats?by=rule').catch(() => ({ items: [], failed: true })),
} : {};
/* 시군구 경계 — LX · 게스트 = 전국 파일, 기관 = 관할 시군구만(서버가 거른 목록 · 경계 포함). 기관 화면은 전국 목록을 부르지 않는다 */
const scopeFC = (j) => ({ features: (j?.items || []).filter((it) => it.geometry).map((it) => ({ type: 'Feature', geometry: it.geometry,
  properties: { code: String(it.sgg_cd), prev: it.prev_cd ? String(it.prev_cd) : null, name: it.name, sido: String(it.full || '').split(/\s+/)[0] || it.sido } })) });
PRE.sgg = SESS?.realm === 'tenant'
  ? api('/regions?geom=1').then(scopeFC).catch(() => ({ features: [] }))
  : fetch('/landxi/assets/data/geo/sigungu.geojson').then((r) => r.json()).catch(() => ({ features: [] }));
const FQ = new Map();
function prefetchFindings(qs) { if (!FQ.has(qs)) { const p = api('/survey/findings?' + qs); p.catch(() => {}); FQ.set(qs, { t: performance.now(), p }); } }
function findings(qs) {
  const c = FQ.get(qs); FQ.delete(qs);
  return c && performance.now() - c.t < 20e3 ? c.p : api('/survey/findings?' + qs);
}

/** 읍면동 · 규칙 집계를 상태에 싣는다. 조회 실패는 '결과 없음'과 다르다(S.statsFailed → HUD 는 실패로).
    어느 시군구든 실태조사를 만드는 중이면(state 'building') 서버는 칸을 비워 준다 — 빈 목록을 '결과 없음'으로 읽지 않는다:
    가진 목록은 그대로 두고(S.statsBuilding), 끝날 때까지 다시 묻는다(watchStats). 지금 시군구 칸은 refresh 가 그 시군구만 따로 받는다 */
const emdItems = (st) => (st.items || []).filter((i) => i.cd && i.bbox?.length === 4).map((i) => ({ cd: String(i.cd), nm: i.key, bbox: i.bbox }));
function useStats(emdSt, ruleSt) {
  if (emdSt) {
    S.statsFailed = !!emdSt.failed;
    S.statsBuilding = !emdSt.failed && emdSt.state === 'building';
    if (!emdSt.failed && !S.statsBuilding) {
      S.asOf = emdSt.as_of || null;
      S.emds = emdItems(emdSt);
      S.emdsBySgg = {};
    }
    if (S.statsBuilding) watchStats();
  }
  if (ruleSt && !ruleSt.failed && ruleSt.state !== 'building') S.ruleDefs = Object.fromEntries((ruleSt.items || []).map((i) => [i.key, { name: i.name || S.ruleNames?.[i.key] || null }]));
  if (ruleSt) S.rulesFailed = !!ruleSt.failed;
}
/** 적재가 끝날 때까지 15초마다 집계를 다시 받는다(최대 40분) — 끝나면 캐시를 비우고 숫자 · 막대를 새로 그린다 */
let statsT = 0, statsT0 = 0;
function watchStats() {
  if (statsT) return;
  statsT0 ||= Date.now();
  X.statsWatch = { state: 'building', since: new Date(statsT0).toISOString() };
  statsT = setTimeout(async () => {
    statsT = 0;
    if (Date.now() - statsT0 > 40 * 60e3) { statsT0 = 0; return; }
    const e = await api('/survey/stats?by=emd').catch(() => null);
    if (!e || e.state === 'building') { watchStats(); return; }
    statsT0 = 0;
    try { for (const k of Object.keys(sessionStorage)) if (k.startsWith('xc:')) sessionStorage.removeItem(k); } catch { /* */ }
    useStats(e, await api('/survey/stats?by=rule').catch(() => null));
    X.statsWatch = { state: 'done', at: new Date().toISOString() };
    if (typeof refresh === 'function') { patchRail(); refresh(); }
  }, 15000);
}
/** 적재 중 — 지금 시군구의 읍면동 칸만 따로 받는다(그 시군구가 적재 중이 아니면 칸이 온다). → 'ok' · 'building' · 'none' */
async function regionStats(r) {
  S.emdsBySgg ||= {};
  const k = r.code;
  if (S.emdsBySgg[k]) return S.emdsBySgg[k].st;
  const j = await api('/survey/stats?' + new URLSearchParams({ by: 'emd', sgg: r.code }));
  if (j?.state === 'building') return 'building';                  // 이 시군구가 지금 만드는 중 — 캐시하지 않고 다음에 다시
  const items = emdItems(j || {});
  const have = new Set(S.emds.map((e) => e.cd));
  S.emds = [...S.emds, ...items.filter((e) => !have.has(e.cd))];
  const st = items.length ? 'ok' : 'none';
  S.emdsBySgg[k] = { st };
  return st;
}
/** 규칙 이름(사용자 말) — 집계의 이름 → 규칙 목록(GET /survey/rules)의 이름. 없으면 null(규칙 코드를 화면에 내지 않는다 · M13) */
const ruleName = (k) => (k && (S.ruleDefs[k]?.name || S.ruleNames?.[k])) || null;
/** 규칙 이름표 — 첫 화면(전국)에서 집계에 이름이 비어 있어도 코드가 보이지 않게 먼저 받는다 */
const RULE_NAMES = SESS ? api('/survey/rules').then((j) => Object.fromEntries((j.items || []).filter((i) => i.id && i.name).map((i) => [i.id, i.name])), () => ({})) : Promise.resolve({});

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
  cond: { emd: null, rule: null }, last: null, need: null, layers: { img: true, sus: true, ai: false, parcel: true, emd: true },
  remd: [], remdMeta: null, res: [], resOn: {},
  tool: null, swipe: false, tilt: false, sel: null, busy: false, list: null, cat: null,
};
let SH, stage, map, hudBig, hudSus, bars, chips, pop, cmdk, AN, loadK, mainEl;

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
  hudSus = h('p.xc-sus', { hidden: true });   // 의심 필지(숫자 한 출처 · GET /summary metrics.suspect) — 큰 숫자 아래 한 줄
  const hud = h('section.xc-hud', { 'aria-live': 'polite' }, hudBig, hudSus, bars);
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
  const aliasP = api('/regions?limit=400').then((j) => j.items || [], () => []);
  const [emdSt, ruleSt, sgg, names] = await Promise.all([
    PRE.emd || api('/survey/stats?by=emd').catch(() => ({ items: [], failed: true })),
    PRE.rule || api('/survey/stats?by=rule').catch(() => ({ items: [], failed: true })),
    PRE.sgg,
    RULE_NAMES,
  ]);
  S.ruleNames = names || {};
  useStats(emdSt, ruleSt);
  const sggFC = S.tenant && SESS?.realm !== 'tenant' ? await api('/regions?geom=1').then(scopeFC).catch(() => ({ features: [] })) : sgg;   // 관문 세션이 기관인데 미리 받은 것이 전국이면 관할로 다시
  S.regions = (sggFC.features || []).map((f) => ({ code: String(f.properties.code), name: f.properties.name, sido: f.properties.sido, full: `${f.properties.sido} ${f.properties.name}`, bbox: K.bboxOf(f), geometry: f.geometry }));
  X.regions = S.regions.length;
  loadAlias(await aliasP);
  if (S.tenant) S.scopeBox = S.regions.reduce((a, r) => (r.bbox ? (a ? [Math.min(a[0], r.bbox[0]), Math.min(a[1], r.bbox[1]), Math.max(a[2], r.bbox[2]), Math.max(a[3], r.bbox[3])] : [...r.bbox]) : a), null);

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
    onDone: (r) => { if (r) { refresh(); if (!r.replay) { K.toast('분석했습니다'); if (S.region) regionData(S.region); if (r.job?.options?.scope === 'sgg') followSurvey(S.region); } } else if (S.tool === 'analyze') { S.tool = null; patchRail(); } },
    pick: pickEmd, regionInfo: () => ({ emds: S.remd, meta: S.remdMeta }) }) : null;

  cmdk = K.mountCmdk({ stage, guest: false, context: () => ({ region: S.region?.code || null, region_name: S.region?.full || null, emd_cd: S.cond.emd?.cd || null, rule: S.cond.rule || null }) });
  // 이 화면이 직접 처리하는 동작은 명령 바 기본 처리를 막는다(preventDefault · 끝나면 이 화면이 done 을 낸다 · plan 3.2)
  const OWN = new Set(['map_region', 'map_zoom', 'map_view', 'map_layer', 'analysis_watch', 'screen_open']);
  document.addEventListener('kit:agent-action', (e) => { if (OWN.has(e.detail?.op)) e.preventDefault(); onAgent(e.detail); });

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
  // 원본 등록 영상(tier raw)은 PMTiles 가 있어도 동적 타일 층(cogLayers)으로 — 사다리(z15↑)가 아니라 지역 축척부터 보이게
  const own = items.filter((i) => i.role === 'imagery' && i.source === 'pmtiles' && i.tier !== 'raw').map((i) => i.id);
  const order = (cat.ladder?.domestic || []).filter((id) => own.includes(id));
  const ladderP = stage.ladder(items, order).then((L) => { S.ladder = L; }, (e) => K.devlog('ladder', String(e?.message || e)));
  await Promise.all([specsP, ladderP]);
  const spec = async (it) => specs.get(it.id) || sourceSpec(it);
  await cogLayers(items, own);

  // 시군구 경계(전국 · 지역 고르기)
  const sggIt = S.tenant ? null : items.find((i) => i.role === 'reference' && i.id === 'sigungu');   // 기관 = 전국 경계 층 없음(관할만)
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

/* 등록 영상 중 PMTiles 가 없는 것(원본 · 전국 시군구) — 동적 래스터 타일(/tiles/cog · 서버가 CPU 로 그리고 디스크에 캐시)을 영상 층으로 쌓는다.
   주소는 카탈로그가 준 것(LX = 서명 · 기관 = 관할 영상만 서명). 범위(bounds) 밖은 타일을 부르지 않는다. 영상은 지역 축척(z9.4↑)에서 들어온다 */
const COG_MIN_Z = 8;
/* 서명 타일 주소의 호스트 = 이 화면의 API 기준 주소(서버도 요청 호스트로 서명하지만, 옛 게이트웨이·고정 주소가 오면 여기서 맞춘다).
   고정 localhost:8700 으로 두면 그 이름의 브라우저 연결 6칸이 막혔을 때 API 는 살아 있어도 영상만 멈춘다(실증 2차). 루프백 주소끼리만 바꾼다. */
const LOOP = /^https?:\/\/(?:localhost\.?|127\.0\.0\.1|\[::1\])(?::\d+)?(?=\/)/i;
const onApiHost = (u) => { try { const b = new URL(API.base); return LOOP.test(u) && LOOP.test(b.origin + '/') ? u.replace(LOOP, b.origin) : u; } catch { return u; } };
async function cogLayers(items, own) {
  S.imgLayers = (S.ladder?.items || []).filter((it) => own.includes(it.id)).map((it) => 'img-' + it.id);
  const cog = items.filter((i) => i.role === 'imagery' && i.tier === 'raw' && ['cog', 'pmtiles'].includes(i.source) && i.bounds && !own.includes(i.id) && i.tile_ready !== false);
  // 서명 주소(GET /tiles/sign?set=cog/{id} · LX = 전부 · 기관 = 관할 영상만) — 원본 경로는 화면에 오지 않는다
  const specs = await Promise.all(cog.map((it) => api('/tiles/sign?' + new URLSearchParams({ set: 'cog/' + it.id }))
    .then((j) => [it, { tiles: [onApiHost(j.url)], attribution: it.attribution || '' }], (e) => { K.devlog('cog sign', `${it.id} ${e?.code || e?.message || e}`); return null; })));
  for (const x of specs) {
    if (!x) continue;
    const [it, src] = x, sid = 'xc-cog-' + it.id, lid = sid + '-r';
    if (map.getSource(sid)) continue;
    map.addSource(sid, { ...src, type: 'raster', tileSize: 256, bounds: it.bounds, minzoom: COG_MIN_Z, maxzoom: 19 });
    map.addLayer({ id: lid, type: 'raster', source: sid, minzoom: COG_MIN_Z,
      paint: { 'raster-opacity': ['interpolate', ['linear'], ['zoom'], COG_MIN_Z, 0, COG_MIN_Z + 0.6, 1], 'raster-fade-duration': 300 } }, 'slot-imagery');
    S.imgLayers.push(lid);
  }
  X.cog = S.imgLayers.length;
}

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
  if (S.regions.length > 1 || scoped.length > 1) return null;   // 광역 기관 = 관할 전체로 도착(시군구는 사용자가 고른다 · 화면이 고르지 않는다)
  if (S.regions.length === 1) return S.regions[0];
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
/* 시군구 코드 별칭 — 지도 경계(시군구 geojson)는 옛 코드(예: 46xxx), 실태조사·결과는 새 코드(12xxx)일 수 있다.
   GET /regions(sgg_cd · prev_cd)로 서로를 잇는다 · 지역 문자열 0 */
const ALIAS = new Map();
function loadAlias(items) {
  for (const x of items || []) {
    const cs = new Set([x.sgg_cd, x.prev_cd].filter(Boolean).map(String));
    // 목록에 옛 코드가 없으면 이름 + 위치로 지도 경계의 시군구를 잇는다
    const r = S.regions.find((y) => y.code === String(x.sgg_cd)) || S.regions.find((y) => lastName(y.name) === lastName(x.name) && near(y.bbox, x.bbox));
    if (r) cs.add(r.code);
    const arr = [...cs]; for (const c of arr) ALIAS.set(c, arr);
  }
}
const codesOf = (r) => (r ? ALIAS.get(String(r.code)) || [String(r.code)] : []);
const inRegion = (cd, r) => codesOf(r).some((c) => String(cd).startsWith(c));
const byCode = (cd) => findRegion(String(cd).slice(0, 5)) || S.regions.find((r) => codesOf(r).includes(String(cd).slice(0, 5))) || null;
const regionEmds = () => (S.region ? S.emds.filter((e) => inRegion(e.cd, S.region)) : S.emds);

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

async function setRegion(r, { first = false, to = null } = {}) {
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
  const all = !r && S.tenant && S.regions.length ? { type: 'MultiPolygon', coordinates: S.regions.flatMap((x) => (!x.geometry ? [] : x.geometry.type === 'Polygon' ? [x.geometry.coordinates] : x.geometry.coordinates)) } : null;
  const g = r?.geometry || all;                      // 기관 '전체' = 관할 시군구 전부의 경계
  const polys = g ? (g.type === 'Polygon' ? [g.coordinates] : g.coordinates) : [];
  const cw = (ring) => { let a = 0; for (let i = 0; i < ring.length - 1; i++) a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]; return a < 0 ? ring : [...ring].reverse(); };
  map.getSource('xc-rmask')?.setData(g ? { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [W, ...polys.map((p) => cw(p[0]))] } } : { type: 'FeatureCollection', features: [] });
  map.getSource('xc-rline')?.setData(g ? { type: 'Feature', properties: {}, geometry: g } : { type: 'FeatureCollection', features: [] });
  S.els.hud.hidden = S.outside;
  patchRail();
  searchInput.value = r ? r.name : '';
  // to = 말로 한 읍면동 이동 — 시군구를 거치지 않고 한 번에 그 읍면동으로(동작 끝 신호가 늦지 않게)
  const fly = r ? goKeep(to?.bbox || r.bbox, { ms: RM() ? 0 : (to?.ms ?? 2400), maxZoom: to?.maxZoom ?? 12.5 })
    : S.tenant && S.scopeBox ? goKeep(S.scopeBox, { ms: RM() ? 0 : 2400, maxZoom: 11 })      // 기관 '전체' = 관할 전체 범위
    : stage.home({ ms: first ? 0 : 1600 });
  if (S.outside) {
    setPoints([]); regionData(null);
    const d = K.drawer({ title: r.name, host: mainEl, slot: 'right', onClose: () => { S.list = null; patchRail(); } });
    const box = h('div'); K.empty(box, { kind: 'outside', text: '이 기관의 관할 밖입니다', ...(S.home ? { action: { label: S.home.name, onClick: () => setRegion(S.home) } } : S.tenant ? { action: { label: '관할 전체', onClick: () => setRegion(null) } } : {}) });
    d.set(box); S.drawer = d;
    if (!first) await fly;
    return;
  }
  const rd = S.outside ? Promise.resolve() : regionData(r);
  S.rdP = rd;                                           // 읍면동 경계가 도착하는 때(말로 한 읍면동 이동이 기다린다)
  const resumeAfter = () => rd.then(() => (S.region === r && AN && !AN.running ? AN.resume(r) : false)).then((ok) => { if (ok) { S.tool = 'analyze'; patchRail(); } });
  if (first) { X.fly = fly; await refresh(); resumeAfter(); return; }   // 첫 도착: 비행은 뒤에서 계속
  await Promise.all([fly, refresh()]);
  resumeAfter();
}

/** 전역 분석이 끝나면 서버가 실태조사를 이어 만든다 — 끝날 때까지(최대 30분) 상태를 보고, 끝나면 숫자·목록을 새로 그린다 */
let followT = 0;
function followSurvey(r) {
  if (!r || S.tenant) return;
  clearTimeout(followT);
  const code = S.remdMeta?.sgg_cd || r.code, t0 = Date.now();
  let told = false;
  const tick = async () => {
    if (S.region?.code !== r.code || Date.now() - t0 > 30 * 60e3) return;
    let st = null;
    try { st = await api('/survey/build/' + encodeURIComponent(code)); } catch { /* 아직 없음 */ }
    if (st?.state === 'done' && st.finished_at && Date.parse(st.finished_at) >= t0 - 5000) {
      K.toast('실태조사 결과를 만들었습니다');
      try { for (const k of Object.keys(sessionStorage)) if (k.startsWith('xc:')) sessionStorage.removeItem(k); } catch { /* */ }
      useStats(await api('/survey/stats?by=emd').catch(() => null), await api('/survey/stats?by=rule').catch(() => null));
      patchRail(); refresh(); X.followSurvey = { code, state: 'done', at: new Date().toISOString() };
      return;
    }
    if (!told) { told = true; K.toast('실태조사 결과를 이어서 만듭니다'); }
    X.followSurvey = { code, state: st?.state || 'waiting' };
    followT = setTimeout(tick, 10000);
  };
  followT = setTimeout(tick, 4000);
}

/* ═══ HUD · 점 · 필지 면 — 한 조회(현장 확인 필요) ═══ */
/** HUD 한 조회의 질의 — 지역 · 조건에서(프리페치와 refresh 가 같은 문자열을 쓴다) */
function hudQuery(region, cond) {
  const p = new URLSearchParams({ priority: 'A', state: 'open,assigned', limit: '2000', sort: 'score' });
  const emds = cond.emd ? [cond.emd] : region ? S.emds.filter((e) => inRegion(e.cd, region)) : null;
  if (emds && !emds.length) return { p: null, emds };
  if (emds) p.set('emd_cd', emds.map((e) => e.cd).join(','));
  p.set('rule', cond.rule || 'R1,R2,R3,R4,R5,R6');   // 현장 확인 필요 = 실태조사 규칙 R1–R6(서버 field_check 와 같은 범위 · 대장 규칙은 첫 화면 대장 대조에서)
  return { p, emds };
}
let seq = 0;
const RETRY = 2, RETRY_MS = 1500;
/** 잠깐 끊긴 것(네트워크 · status 0 · 5xx)만 다시 부른다. 4xx 는 다시 불러도 같다 */
const transient = (e) => !e?.status || e.status >= 500;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
/** HUD 큰 숫자 상태: wait(조회 중 · 빈 자리) · fail(— · 문장 없음) · empty(서버가 0/결과 없음) · counting(실태조사를 만드는 중 · '집계 중') · ok */
function hudState(big, st, env, unit) {
  hudBig.dataset.st = st;
  if (st === 'ok') { big.set(env, unit ? { unit } : {}); return; }
  big.set(null);
  const none = hudBig.querySelector('.k-big-none'), num = hudBig.querySelector('.k-big-row > span');
  if (none && st === 'counting') none.textContent = '집계 중';
  if (none) none.hidden = st !== 'empty' && st !== 'counting';
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
  const where = S.cond.emd ? S.cond.emd.nm : S.region ? S.region.name : S.tenant ? String(S.who.tenant?.name?.ko || S.who.org || '').trim().split(/\s+/).pop() || '관할 전체' : '전국';
  const label = `현장 확인 필요 · ${where}`;
  const scope = (S.cond.emd?.cd || S.region?.code || 'KR') + (S.cond.rule ? ':' + S.cond.rule : '');
  S.els.hud.dataset.scope = scope;
  const big = hudBig.__big || (hudBig.__big = K.bignum(hudBig, null, { label: '현장 확인 필요', unit: '필지', hud: true }));
  const setLab = (t) => { const lab = hudBig.querySelector('.k-big-l'); if (lab) { lab.textContent = t; lab.append(h('span.xc-where', { text: ` · ${where}` })); } };
  // 지역 대표 수치(조건 없음)는 요약 한 곳(GET /summary)에서만 — 읍면동 · 규칙 조건일 때만 현장 확인 목록에서 센다
  S.suspectOnly = null;
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
      // 어느 시군구가 실태조사를 만드는 중이면 전국 집계 칸이 비어 온다 — 지금 시군구 칸만 따로 받는다(그 시군구가 만드는 중이면 '집계 중')
      S.regionBuilding = false;
      if (S.statsBuilding && S.region && !regionEmds().length) {
        S.regionBuilding = (await regionStats(S.region)) === 'building';
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
  const susSrc = sb || (S.suspectOnly && !S.cond.emd && !S.cond.rule ? S.suspectOnly : null);
  paintSus(susSrc && !S.cond.emd && !S.cond.rule ? susSrc : null);
  // 요약에 없는 지역(배포 전 · 말로 낸 전역 분석 뒤 실태조사만 있는 곳)은 현장 확인 목록에서 센 값으로 — 결과가 있는데 '결과 없음'으로 보이지 않게
  const pickBig = sb ? sb : (has ? { env: S.need, label: '현장 확인 필요', unit: '필지' } : null);
  if (sb) { if (sb.label === '현장 확인 필요') S.need = sb.env; K.devlog('summary', `${S.region?.code || 'KR'} → ${sb.label} ${sb.env.value}`); }
  if (pickBig) {
    setLab(pickBig.label);
    hudState(big, 'ok', pickBig.env, pickBig.unit);
    X.hud = { label: `${pickBig.label} · ${where}`, n: pickBig.env.value, total: j?.total?.value ?? 0, query: q?.p?.toString() || null, from: sb ? 'summary' : 'findings' };
  } else if (S.regionBuilding || (S.statsBuilding && !S.region)) {   // 실태조사를 만드는 중 — '결과 없음'이 아니라 '집계 중'(끝나면 watchStats 가 다시 그린다)
    setLab('현장 확인 필요');
    hudState(big, 'counting');
    X.hud = { label, n: null, total: 0, state: 'counting', query: q?.p?.toString() || null, from: 'stats' };
    watchStats();
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
  if (!ms.length) {
    // 요약에 없는 지역 — 의심 필지는 같은 출처(시군구 실태조사 표 survey_sgg.findings · GET /survey/build/{sgg})에서만
    if (!r) return null;
    try {
      const b = await api('/survey/build/' + encodeURIComponent(S.remdMeta?.sgg_cd || r.code));
      if (b?.state === 'done' && b.findings != null) {
        const e = typeof b.findings === 'object' ? b.findings : { value: b.findings, unit: 'count', basis: 'inferred', as_of: b.finished_at || '', source: 'AI 실태조사 결과' };
        if (e.value != null) S.suspectOnly = { suspect: { env: e, label: '의심 필지' } };
      } else if (b?.state === 'building') S.suspectOnly = { suspect: { building: true } };
    } catch { /* 실태조사 없음 */ }
    return null;
  }
  const m0 = ms[0];
  const value = ms.reduce((a, m) => a + Number(m.value), 0);
  // 의심 필지(숫자 한 출처 = survey_sgg) — 시군구 항목들의 합. 적재 중(survey_state 'building')이 섞이면 '집계 중'
  const sv = of('suspect'), building = items.some((it) => it.survey_state === 'building');
  const suspect = building ? { building: true } : sv.length ? { env: { ...sv[0], value: sv.reduce((a, m) => a + Number(m.value), 0) }, label: sv[0].label || '의심 필지' } : null;
  // 값이 있으면 '첫 결과 전' 같은 단계 문구는 붙이지 않는다(결과가 있는데 첫 결과 전이라고 보이지 않게 · plan 3.5)
  const note = /첫\s*결과/.test(String(m0.note || '')) ? undefined : m0.note;
  return { env: { value, unit: m0.unit, basis: m0.basis, as_of: m0.as_of || j.as_of || '', source: m0.source || '', note }, label: m0.label, unit: m0.unit, suspect };
}
/** 큰 숫자 아래 한 줄 '의심 필지 n건' — 지역 전체일 때만(읍면동 · 규칙 조건이면 숨김). 오른쪽 판 머리에도 같은 값 */
function paintSus(sb) {
  const sp = sb && sb.suspect;
  S.suspect = sp || null;
  hudSus.hidden = !sp;
  hudSus.replaceChildren();
  if (!sp) { delete hudSus.dataset.v; return; }
  if (sp.building) { hudSus.append(h('span', { text: '의심 필지' }), h('b', { text: '집계 중' })); hudSus.dataset.metric = '의심 필지'; delete hudSus.dataset.v; return; }
  hudSus.append(h('span', { text: sp.label }), h('b.num', { text: nf(sp.env.value) }), h('small', { text: '건' }));
  hudSus.dataset.metric = sp.label; hudSus.dataset.v = String(sp.env.value);
}
function drawBars(rows) {
  const top = rows.filter((r) => r.n > 0 && ruleName(r.k)).sort((a, b) => b.n - a.n).slice(0, 3), max = Math.max(1, ...top.map((r) => r.n));
  bars.innerHTML = '';
  for (const r of top) {
    // 막대는 읽기 전용(버튼 예산 ≤ 10 · 도구 포함) — 규칙으로 거르기는 '규칙' 도구에서
    const b = h('div.xc-bar', { dataset: { rule: r.k }, 'data-on': S.cond.rule === r.k ? '1' : undefined },
      h('span.xc-bar-l', { text: ruleName(r.k) }), h('span.xc-bar-t', {}, h('i', { style: { width: (r.n / max) * 100 + '%' } })), h('span.xc-bar-v.num', { text: nf(r.n) }));
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
  if (rule && ruleName(rule)) chips.append(h('span.t-chip.xc-chip', { text: ruleName(rule) }));
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
  searchInput = h('input.xc-q-i', { type: 'search', placeholder: '시군구 · 지번 · 또는 XI ChatGEO 에 질문', 'aria-label': '시군구 · 지번 · 또는 XI ChatGEO 에 질문', autocomplete: 'off', spellcheck: 'false', role: 'combobox', 'aria-expanded': 'false', 'aria-autocomplete': 'list' });
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
      const r = inHere ? S.region : byCode(e.cd);
      opts.push({ t: e.nm, s: r?.name || '', go: () => { done(); goEmd(e, inHere ? S.region : null); } });
    }
  }
  if (/\d/.test(q)) {
    try {
      const j = await api('/survey/findings?' + new URLSearchParams({ q, limit: '5', sort: 'score' }));
      if (my !== qSeq) return;
      const seen = new Set();
      for (const f of j.items || []) { if (seen.has(f.pnu)) continue; seen.add(f.pnu); opts.push({ t: jibun(f.addr), s: ruleName(f.rule) || '', go: () => { done(); openParcel(f.pnu, { fly: true }); } }); }
    } catch { /* */ }
  }
  if (q.length >= 4 && /\s/.test(q)) opts.push({ t: q, s: 'XI ChatGEO', ask: true, go: () => { done(); ask(q); } });
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
  const r = here || byCode(e.cd);
  const go = () => {
    setCond({ emd: e }); searchInput.value = e.nm;
    if (AN?.active && !AN.running) emdFrame(e).then((f) => AN.active && !AN.running && AN.start(S.region, f));   // 분석 중 검색 = 그 읍면동으로 프레임
    else return goKeep(e.bbox, { ms: 1600, maxZoom: 14 });
  };
  if (r && S.region?.code !== r.code) return setRegion(r).then(go); return go();
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
  await goKeep(e.bbox, { ms: RM() ? 0 : 1250, maxZoom: 14 });
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

/* ═══ 에이전트 → 지도(카메라 · 채색 · 집계 · 지역 · 줌 · 시점 · 층 · 분석 보기) ═══
   동작을 끝내면 kit:agent-action-done {op, ok} (plan 3.2). 지도 상태 변화는 window.__xc.agent 에 남는다(실증 기록 · 화면엔 없음). */
let closeT = 0;
const camNow = () => ({ center: [+map.getCenter().lng.toFixed(5), +map.getCenter().lat.toFixed(5)], zoom: +map.getZoom().toFixed(2), pitch: Math.round(map.getPitch()), bearing: Math.round(map.getBearing()),
  region: S.region?.code || null, img: !!S.layers.img, ai: !!S.layers.ai, sus: !!S.layers.sus, parcel: !!S.layers.parcel });
/** 카메라 이동(지역 · 읍면동) — 입체(S.tilt)면 지금 기울기를 유지한다(전역 분석을 시작해도 평면으로 풀리지 않게 · r3-xi) */
/* 비행은 화면 프레임(requestAnimationFrame)으로 돈다 — 탭이 뒤로 가면 프레임이 멈춰 끝나지 않는다. 동작 끝 신호가 영영 안 나가지 않게
   비행 시간 + 1.5초에서 기다림을 끊는다(카메라는 탭이 다시 보이면 이어서 도착한다). */
const goKeep = (b, o = {}) => Promise.race([stage.go(b, { ...o, pitch: S.tilt ? (Math.round(map.getPitch()) || 55) : 0 }),
  new Promise((res) => setTimeout(() => res(true), (o.ms ?? 2400) + 1500))]);
const settled = () => new Promise((res) => { if (!map.isMoving()) return setTimeout(res, 60); map.once('moveend', () => setTimeout(res, 60)); setTimeout(res, 4000); });
let agentQ = Promise.resolve();
/** 한 답의 동작들(이동 → 확대 → 시점 …)은 차례로 — 앞 동작의 카메라 이동이 끝난 뒤 다음 */
function onAgent(a) { if (a?.op) agentQ = agentQ.then(() => runAgent(a), () => runAgent(a)); return agentQ; }
async function runAgent(a) {
  const before = camNow();
  let ok = true, reason = null;
  try {
    const res = await agentOp(a);
    if (res && typeof res === 'object') { ok = res.ok !== false; reason = res.reason || null; } else ok = res !== false;
  } catch (e) { ok = false; reason = '지도 동작을 하지 못했습니다'; K.devlog('agent op', `${a.op} ${e?.message || e}`); }
  if (['map_region', 'map_zoom', 'map_view'].includes(a.op)) await settled();
  const after = camNow();
  if (ok && a.op === 'map_zoom' && Math.abs(after.zoom - before.zoom) < 0.05) { ok = false; reason ||= (after.zoom >= before.zoom ? '더 확대할 수 없습니다' : '더 축소할 수 없습니다'); }
  if (!ok && !reason) reason = '지도 동작을 하지 못했습니다';
  (X.agent ||= []).push({ op: a.op, ok, reason, before, after, at: new Date().toISOString() });
  document.dispatchEvent(new CustomEvent('kit:agent-action-done', { detail: { op: a.op, ok, ...(reason ? { reason } : {}) } }));
  // 지도 동작 뒤 바를 접되, 답(한 줄 · 숫자)이 있으면 읽을 수 있게 그대로 둔다(닫기는 사용자가 Esc · 바깥 누르기)
  if (['map_on', 'map_arrive', 'map_flyto', 'parcel_card', 'map_region', 'map_zoom', 'map_view', 'map_layer', 'analysis_watch'].includes(a.op)) { clearTimeout(closeT); closeT = setTimeout(() => { if (!hasAnswer()) cmdk.close(); }, 1600); }
}
/** 에이전트가 준 시군구(새 12xxx · 옛 46xxx 코드 · 이름 · 범위) → 지도 경계의 시군구 */
async function regionFromAgent(a) {
  const c = (b) => [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2], d2 = (p, q) => (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2;
  const byBox = a.bbox ? S.regions.filter((x) => near(x.bbox, a.bbox) && (!a.name || lastName(x.name) === lastName(a.name) || norm(x.name) === norm(a.name)))
    .sort((x, y) => d2(c(x.bbox), c(a.bbox)) - d2(c(y.bbox), c(a.bbox)))[0] : null;
  return findRegion(String(a.sgg_cd || a.region || '')) || (a.prev_cd && findRegion(String(a.prev_cd))) || byBox
    || (a.sgg_cd && await regionByCode(String(a.sgg_cd))) || (a.name && findRegion(a.name)) || null;
}
async function agentOp(a) {
  if (a.op === 'map_on' && a.filter) {
    const f = a.filter, e = f.emd_cd ? S.emds.find((x) => x.cd === String(f.emd_cd)) : null;
    const r = e ? byCode(e.cd) : null;
    const apply = () => { setCond({ emd: e || null, rule: f.rule && ALL_RULES.includes(f.rule) ? f.rule : null }); S.list = true; patchRail(); };
    if (r && S.region?.code !== r.code) await setRegion(r).then(apply); else apply();
    return true;
  }
  // 보유 결과 답의 이동(시군구 코드 동봉) → 지역을 그곳으로 바꿔 머리글 · 점이 답과 같은 곳을 가리키게
  if (a.op === 'map_flyto' && a.region) {
    const r = await regionFromAgent({ region: a.region, bbox: a.bbox });
    if (r && S.region?.code !== r.code) setRegion(r);
    return true;
  }
  if (a.op === 'map_region') {                         // 결과가 없어도 그 시군구 경계로 간다 · 읍면동(emd_cd)이면 그 읍면동 경계로
    const r = await regionFromAgent({ ...a, bbox: a.sgg_bbox || a.bbox });
    if (!r) {
      const b = a.emd_bbox || a.bbox;
      if (b) { await goKeep(b, { ms: RM() ? 0 : 1600, maxZoom: a.emd_cd ? 14 : 12.5 }); return true; }
      return { ok: false, reason: '그 지역을 지도에서 찾지 못했습니다' };
    }
    const eb = a.emd_cd ? (a.emd_bbox || a.bbox) : null;              // 읍면동 범위(없으면 시군구 범위로만)
    const moved = S.region?.code !== r.code;
    if (moved) await setRegion(r, eb ? { to: { bbox: eb, ms: 1600, maxZoom: 14 } } : {});
    else await goKeep(eb || r.bbox, { ms: RM() ? 0 : 1600, maxZoom: eb ? 14 : 12.5 });
    if (!a.emd_cd) return true;
    await S.rdP?.catch?.(() => {});
    const nm = a.emd_name || a.emd || '';
    const e = S.remd.find((x) => x.cd === String(a.emd_cd) || String(a.emd_cd).startsWith(x.cd) || x.cd.startsWith(String(a.emd_cd)))
      || (nm && S.remd.find((x) => norm(x.nm) === norm(nm)));
    if (e) { setCond({ emd: e }); searchInput.value = e.nm; if (!eb) await goKeep(e.bbox, { ms: RM() ? 0 : 1600, maxZoom: 14 }); return true; }
    return eb ? true : { ok: false, reason: '그 읍면동 경계를 불러오지 못했습니다' };
  }
  if (a.op === 'map_zoom') {
    const z0 = map.getZoom(), z = a.zoom != null ? +a.zoom : z0 + (+a.delta || 1), to = Math.max(5, Math.min(19, z));
    if (Math.abs(to - z0) < 0.05) return { ok: false, reason: z >= z0 ? '더 확대할 수 없습니다' : '더 축소할 수 없습니다' };
    map.easeTo({ zoom: to, duration: RM() ? 0 : 900 });
    return true;
  }
  if (a.op === 'map_view') {
    const p0 = map.getPitch(), p = Math.max(0, Math.min(70, +a.pitch || 0));
    if (Math.abs(p - p0) < 0.5 && Math.abs((+a.bearing || 0) - map.getBearing()) < 0.5) return { ok: false, reason: p > 0 ? '이미 입체로 보고 있습니다' : '이미 위에서 보고 있습니다' };
    await setView(p, +a.bearing || 0); return true;
  }
  if (a.op === 'map_layer') {
    const k = { imagery: 'img', results: 'ai', findings: 'sus', parcels: 'parcel' }[a.layer];
    if (!k) return { ok: false, reason: '그 층은 이 지도에 없습니다' };
    const have = { img: (S.imgLayers || []).length, ai: (S.res || []).length, sus: (S.susLayers || []).length, parcel: (S.parcelLayers || []).length }[k];
    if (!have) return { ok: false, reason: k === 'img' ? '이 지도에는 영상 층이 없습니다' : k === 'ai' ? '이 지역에는 AI 분석 결과 층이 없습니다' : '이 지역에는 그 층이 없습니다' };
    S.layers[k] = a.on !== false;
    if (k === 'ai') { S.aiByRegion = false; if (S.layers.ai) for (const it of S.res || []) S.resOn[it.id] = true; }
    applyLayers();
    if (S.tool === 'layers') renderLayers();
    return true;
  }
  if (a.op === 'analysis_watch') {                     // 말로 실행한 분석 — 진행 보기에 붙는다(결과가 읍면동 순으로 차오름 · 범위 문장은 작업 값 그대로)
    if (!AN || !a.job_id) return { ok: false, reason: '진행 화면을 열 수 없습니다' };
    const r = await regionFromAgent(a);
    if (r && S.region?.code !== r.code) await setRegion(r);
    closePop(); closeDrawer();
    S.tool = 'analyze'; patchRail();
    const ok = await AN.watch(a.job_id, S.region || r, { cls: a.cls || null, scope: a.scope_text || null, rest: a.scope_rest || null });
    return ok ? true : { ok: false, reason: '진행 화면을 열 수 없습니다' };
  }
  if (a.op === 'screen_open') {                         // 이미 XI맵 — 지역을 넘겼으면 그곳으로
    const rc = new URLSearchParams(String(a.href || '').split('?')[1] || '').get('region');
    const r = rc ? await regionFromAgent({ sgg_cd: rc }) : null;
    if (r && S.region?.code !== r.code) await setRegion(r);
    return true;
  }
  if (a.op === 'parcel_card' && a.pnu) { openParcel(String(a.pnu)); return true; }
  if (a.op === 'drawer_open' && a.kind === 'report') { tool('report'); return true; }
  return true;
}
/* 명령 바 막대 차트(읍면동별) — 막대를 누르면 그 읍면동으로(kit:chart-pick {label, key}).
   명령 바가 이벤트를 내지 않아도 막대(.k-bar) 누르기를 여기서 받아 같은 이벤트로 바꾼다 */
document.addEventListener('click', (e) => {
  const b = e.target.closest?.('.k-ck .k-bar'); if (!b) return;
  const label = b.querySelector('.k-bar-l')?.textContent?.trim(); if (!label) return;
  // 어느 시군구의 막대인지 — 차트 제목 · 답 글 · 물은 말(막대에 코드가 없을 때 경계 조회에 쓴다)
  const ck = b.closest('.k-ck') || document;
  const hint = [b.closest('.k-ck-blk')?.querySelector('.k-ck-bt')?.textContent, ck.querySelector('.k-ck-a')?.textContent, ck.querySelector('.k-ck-i')?.value].filter(Boolean).join(' ');
  document.dispatchEvent(new CustomEvent('kit:chart-pick', { detail: { label, key: b.dataset.key || null, hint } }));
});
/** 읍면동 이름 · 코드로 목록에서 찾기(같은 이름 → 끝말 같은 이름) */
const emdMatch = (pool, key, nm) => (key && pool.find((x) => x.cd === key)) || pool.find((x) => norm(x.nm) === norm(nm))
  || pool.find((x) => nm && norm(x.nm).endsWith(norm(nm.split(/\s+/).pop())));
/** 시군구 읍면동 경계(GET /regions/{sgg}/emd) — 막대 누르기 보조 조회(탭 안 기억) */
const EMD_OF = new Map();
function emdOf(r) {
  if (r.code === S.region?.code && S.remd.length) return Promise.resolve(S.remd);
  if (!EMD_OF.has(r.code)) EMD_OF.set(r.code, api('/regions/' + encodeURIComponent(r.code) + '/emd')
    .then((j) => (j.features || []).map((f) => ({ cd: String(f.properties.emd_cd), nm: f.properties.name, bbox: f.properties.bbox, geometry: f.geometry })))
    .catch((err) => { EMD_OF.delete(r.code); throw err; }));
  return EMD_OF.get(r.code);
}
/** 막대가 가리키는 읍면동 — 집계 목록(S.emds)이 비어 있어도(실태조사 적재 중) 찾는다:
    ① 지금 시군구 경계 · 집계 목록 ② 차트 제목 · 답에 이름이 나온 시군구의 경계 ③ 지금 시군구 경계(서버). → { e, r } · null */
async function chartEmd(key, nm, hint) {
  const pool = [...S.remd, ...regionEmds(), ...S.emds];
  const hit = emdMatch(pool, key, nm);
  if (hit) return { e: hit, r: S.remd.some((x) => x.cd === hit.cd) ? S.region : byCode(hit.cd) };
  const regs = [];
  if (key.length >= 5) { const r = byCode(key); if (r) regs.push(r); }
  const named = S.regions.filter((r) => hint && hint.includes(r.name) && r.name.length >= 2)
    .sort((x, y) => (y.sido === S.region?.sido) - (x.sido === S.region?.sido) || y.name.length - x.name.length);
  regs.push(...named.slice(0, 3));
  if (S.region) regs.push(S.region);
  const seen = new Set();
  for (const r of regs) {
    if (seen.has(r.code)) continue; seen.add(r.code);
    let list = [];
    try { list = await emdOf(r); } catch (err) { K.devlog('chart pick emd', `${r.code} ${err?.status ?? 0}`); continue; }
    const e = emdMatch(list, key, nm);
    if (e) return { e, r };
  }
  return null;
}
document.addEventListener('kit:chart-pick', async (e) => {
  const d = e.detail || {}, key = String(d.key || d.emd_cd || ''), nm = String(d.label || '').trim();
  const at = new Date().toISOString();
  const got = await chartEmd(key, nm, String(d.hint || ''));
  if (!got) {
    K.devlog('chart pick', `${key} ${nm} 없음`);
    const w = nm || '그 읍면동', c = w.charCodeAt(w.length - 1), jong = c >= 0xAC00 && c <= 0xD7A3 && (c - 0xAC00) % 28 > 0;
    K.toast(`${w}${jong ? '을' : '를'} 지도에서 찾지 못했습니다`);
    (X.agent ||= []).push({ op: 'chart_pick', ok: false, emd: nm, at });
    return;
  }
  const { e: hit, r } = got;
  const here = r && S.region?.code === r.code ? S.region : r;
  await goEmd(hit, here);
  (X.agent ||= []).push({ op: 'chart_pick', ok: true, emd: hit.nm, region: r?.name || null, at });
});
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
  const sp = S.suspect;
  if (sp) box.append(h('p.xc-list-sus', { dataset: sp.building ? { metric: '의심 필지' } : { metric: sp.label, v: String(sp.env.value) } },
    h('span', { text: sp.building ? '의심 필지' : sp.label }), h('b.num', { text: sp.building ? '집계 중' : nf(sp.env.value) }), sp.building ? null : h('small', { text: '건 · 아래는 현장 확인 필요' })));
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
      h('b', { text: jibun(f.addr) }), ruleName(f.rule) ? h('span', { text: '· ' + ruleName(f.rule) }) : null)));
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
  const seen = f ? (cls[f.rule] || ruleName(f.rule) || f.rule_nm || '—') : '—';
  const m2 = (e) => (e && e.value != null ? `${nf(Math.round(e.value))}㎡${K.sig(e)}` : '—');
  const pct = f?.evid_pct?.value;
  const body = h('div.xc-parcel', {},
    h('p.xc-tags', {}, h('span.t-chip', { text: reviewed ? '✓ 확인됨' : 'AI 분석 · 확인 전', 'data-lv': reviewed ? undefined : 'wait' }), f && (ruleName(f.rule) || f.rule_nm) ? h('span.t-chip', { text: ruleName(f.rule) || f.rule_nm }) : null),
    h('dl.xc-pair', {},
      h('div', {}, h('dt', { text: '대장' }), h('dd', { html: `<b>${esc(L.jimok_nm || L.jimok || '—')}</b> ${m2(L.area_m2)}` })),
      h('div.ai', {}, h('dt', { text: 'AI 분석' }), h('dd', { html: f ? `<b>${esc(seen)}</b> ${m2(f.evid_m2)}${pct != null ? ` · ${Math.round(pct)}%` : ''}` : '—' }))),
  );
  const act = h('div.xc-act');
  if (f && S.lx && S.key !== 'lx/sales' && ['open', 'assigned'].includes(f.state)) act.append(h('button.t-btn.t-btn--2', { type: 'button', text: '오탐', onclick: (e) => setState(f, 'dismissed', e.currentTarget) }));
  // 영상 설명(AI 의견) — 명령 바에 '{읍면동 리 지번} 영상 설명해 줘'를 보낸다(설명 도구는 에이전트 · 근거 아님 꼬리표)
  const where = String(d.addr || '').trim().split(/\s+/).slice(-3).join(' ');
  if (where) act.append(h('button.t-btn.t-btn--2', { type: 'button', text: '영상 설명', onclick: () => ask(`${where} 영상 설명해 줘`) }));
  const rv = canRequest(S.who);   // 기관 계정: 이 필지를 LX 담당자에게 검토 요청(메모 한 줄 · 선택)
  if (act.childElementCount || rv) body.append(act);
  if (rv) reviewAction(act, { who: S.who, pnu, rule: f?.rule, fid: f?.id, lnglat: f?.lnglat, from: 'xi-clean' });
  dr.set(body);
}
async function setState(f, to, btn) {
  btn.disabled = true;
  try {
    const id = (crypto.randomUUID?.() || String(Date.now()) + Math.random()).slice(0, 60);
    await api(`/survey/findings/${encodeURIComponent(f.id)}/state`, { method: 'POST', body: { state: to, client_id: 'xc-' + id, ...(to === 'dismissed' ? { reason: '오탐' } : {}) } });
    K.toast('오탐으로 표시했습니다');
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
    // 이 지역에 진행 중인 전역 분석이 있으면 새 분석 카드 대신 그 진행 보기(취소 포함)에 붙는다
    AN.resume(S.region).then((ok) => {
      if (ok || S.tool !== 'analyze' || AN.running) { patchRail(); return; }
      if (e) emdFrame(e).then((f) => { if (S.tool === 'analyze' && !AN.running) AN.start(S.region, f); }); else AN.start(S.region);
    });
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
  const L = [['img', '영상'], ['sus', '현장 확인 필요'], ['ai', 'AI 분석'], ['parcel', '지적선'], ['emd', '읍면동 경계']];
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
  setVis(map, (S.imgLayers || []).filter((l) => map.getLayer(l)), S.layers.img);
  setVis(map, susSet(), S.layers.sus);
  for (const it of S.res || []) setVis(map, it.ids, !!(S.layers.ai && S.resOn[it.id]));
  setVis(map, S.parcelLayers, S.layers.parcel);
  setVis(map, S.emdLayers, S.layers.emd);
}
function renderRules() {
  const by = S.last?.by_rule || {};
  const rows = ALL_RULES.filter((k) => S.ruleDefs[k] && ruleName(k)).map((k) => h('button.xc-row', { type: 'button', 'aria-pressed': String(S.cond.rule === k), onclick: () => setCond({ rule: S.cond.rule === k ? null : k }) },
    h('i.xc-rd'), h('span', { text: ruleName(k) }), h('em.num', { text: by[k]?.value != null ? nf(by[k].value) : '' })));
  showPop('규칙', h('div.xc-rows-p', {}, ...rows));
}
function renderSweep() {
  const run = h('button.t-btn', { type: 'button', text: '대조 실행', onclick: () => { closePop(); reconcile(); } });
  showPop('대조', h('p.t-label.xc-pop-l', { text: S.asOf ? `${K.df ? K.df(S.asOf) : S.asOf} 기준` : '' }), h('div.xc-act', {}, run));
}
function renderReport() {
  if (!S.region) { showPop('보고서', h('p.t-label.xc-pop-l', { text: '지역을 고르세요' })); return; }
  // 대상 = 지금 지역의 읍면동(기본 = 조건 · 열린 필지 · 이 지역에서 현장 확인이 가장 많은 곳) — 다른 지역 읍면동은 고를 수 없다
  const list = regionEmds();
  if (!list.length) { showPop('보고서', h('p.t-label.xc-pop-l', { text: `${S.region.name} · 실태조사 결과가 없습니다` })); return; }
  let e = reportEmd() || list[0];
  const sel = h('select.xc-sel', { 'aria-label': '보고서 대상 읍면동', onchange: () => { e = list.find((x) => x.cd === sel.value) || e; } },
    ...list.slice().sort((a, b) => a.nm.localeCompare(b.nm, 'ko')).map((x) => h('option', { value: x.cd, text: x.nm, selected: x.cd === e.cd || undefined })));
  const btn = h('button.t-btn', { type: 'button', text: '보고서 초안(.docx)', onclick: () => report(e, btn) });
  showPop('보고서', h('p.t-label.xc-pop-l', { text: S.region.name }), sel, h('div.xc-act', {}, btn));
  X.reportDefault = { region: S.region.name, emd: e.nm };
}
/** 보고서 대상 읍면동(지금 지역 안에서만): 조건 → 열린 필지 → 이 지역 현장 확인 목록에서 가장 많은 곳. 지역이 없으면 null(지역 고정값 0) */
function reportEmd() {
  if (!S.region) return null;
  const mine = (e) => e && inRegion(e.cd, S.region) ? e : null;
  const inR = regionEmds();
  if (mine(S.cond.emd)) return S.cond.emd;
  if (S.sel) { const e = inR.find((x) => x.cd === String(S.sel).slice(0, 8)); if (e) return e; }
  const c = {}; for (const f of S.last?.items || []) if (inR.some((x) => x.cd === String(f.emd_cd))) c[f.emd_cd] = (c[f.emd_cd] || 0) + 1;
  const top = Object.entries(c).sort((a, b) => b[1] - a[1])[0];
  return top ? inR.find((x) => x.cd === top[0]) || null : null;
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
const TILT = { pitch: 55, bearing: -14 };
async function toggleTilt() { await setView(S.tilt ? 0 : TILT.pitch, S.tilt ? 0 : TILT.bearing); }
/** 시점 — '입체' 버튼과 말로 하는 시점(map_view)이 같은 코드: 기울기 > 0 이면 입체(지형 포함) */
async function setView(pitch, bearing) {
  S.tilt = pitch > 0; patchRail();
  await terrainFor(map.getZoom());
  map.easeTo({ pitch, bearing, duration: RM() ? 0 : 1250, easing: (t) => 1 - Math.pow(1 - t, 3) });
}

addEventListener('keydown', (e) => { if (e.key === 'Escape' && !pop.hidden) closePop(); });
/* 늦음 안내 — 12초 안에 도착하지 못하면 말없이 '불러오는 중'에 머물지 않는다(탭이 많아 연결이 막힌 때 등 · c2-numbers) */
{ // 숨은 탭은 지도가 그려지지 않아 늦는 것이 정상 — 보이는 동안 12초를 넘길 때만 알린다
  let tm = 0;
  const slow = () => { if (X.boot.ready || document.documentElement.dataset.xc === 'error') return; if (document.hidden) return; X.slow = true; try { K.toast('서버 응답이 늦습니다 · 열린 Land-XI 창을 몇 개 닫고 다시 시도하세요', { ms: 30000, action: { label: '다시 시도', onClick: () => location.reload() } }); } catch { /* */ } };
  const arm = () => { clearTimeout(tm); if (!document.hidden && !X.boot.ready) tm = setTimeout(slow, 12000); };
  document.addEventListener('visibilitychange', arm); arm(); }
boot().catch((e) => { console.warn('[xi-clean]', e); document.documentElement.dataset.xc = 'error'; X.err = String(e?.message || e); try { K.toast('XI맵을 열지 못했습니다'); } catch { /* */ } });
