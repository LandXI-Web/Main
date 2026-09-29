/* xi.js — XI맵 운영판 부팅 · URL 상태 · 역할 관문 · 장면 연결(F1-A).
   LX_API on(게이트웨이 :8700) / off(픽스처 · 실데이터 파일 · 리플레이) 두 모드에서 같은 화면 — 폴백은 마스트에 정직하게.
   장면: 글로브(VIIRS 어제) → 한국 2400 → 남원 1600(HLS → V-World → 2023 25cm · pitch 0→35) → 129,420 도착
         → 읍면동 집계 → 드론 AOI 1250(25cm → 2m → 1.08cm) → AOI 안 A02 · A04 456 도착 → 필지 카드 → 프레임 → 견적 → 실행 → 열람. */
import { API, probe, session, catalog as apiCatalog, deploys as apiDeploys, api, fixture, mastLabel as mastLabel0, env, tileUrl, yesterdayUTC, sse, assertEnvelope } from '../shared/api-v1.js';
import { createMap, loaded, idle } from './engine/lx-map.js';
import { mountLadder, watchStage, opacityAt } from './engine/ladder.js';
import { sourceSpec, pickHls, TILE_LOG, chipText, prewarm, PREWARM_LOG, EXT_LOG, hlsCoverage, hlsViewCoverage, skyStats, setExtMode, EXT_MISS } from './engine/sources.js';
import { flyLadder, stopFlight, CAMLOG, jumps, readHandoff, RM, pathCams } from './engine/camera.js';
import { createPerf, judgeTier, gpuInfo } from './engine/tier.js';
import { arrive, addResultLayers, setVis, pickLocks, PHASES, setPhase, clearLocks, bboxOf, cancelArrive, locks } from './fx/arrive.js';
import { timescrub } from './fx/timescrub.js';
import { swipe as swipeFx } from './fx/swipe.js';
import { frameTool, quoteCard } from './fx/frame.js';
import { quoteJob, runJob, theater, synthReplay, gridFor, inFrame } from './fx/job-theater.js';
import { extrude as extrudeFx } from './fx/extrude.js';
import { filament } from './fx/filament.js';
import { toast, D, EASE, placeAt } from './fx/glass.js';
import { install as installBridge, emit as xiEmit, XI } from './bridge.js';
// 실태조사 모듈은 기관·직원 세션에서만 동적으로 읽는다(게스트/공개 = survey 모듈·데이터·API 요청 0)
const SURVEY = () => import('./survey/survey-mode.js');
const SAPI = () => import('./survey/api-survey.js');
import { lineage } from './fx/lineage.js';
import { prov, numHtml } from './fx/provenance.js';
import { createHud } from './ui/hud.js';
import { layersPanel } from './ui/layers-panel.js';
import { parcelCard } from './ui/parcel-card.js';
import { emdCard, drawer, emdStats } from './ui/drawer-stats.js';
import { openReport } from './ui/drawer-report.js';
import { search } from './ui/search.js';
import { IMAGERY } from '../assets/data/imagery.js';
import { CHANGE } from '../assets/data/change.js';
/* 화면 말(용어표) — 공용 mastLabel 의 '시연'을 화면에서만 '예시'로(값·판정은 그대로) */
const mastLabel = (l) => String(mastLabel0(l) || '').replace(/^시연/, '예시');

const $ = (id) => document.getElementById(id);
const Q = new URLSearchParams(location.search);
const T = { t0: performance.now(), marks: {} };
const mark = (k) => { T.marks[k] = Math.round(performance.now() - T.t0); };
const A01 = IMAGERY.find((i) => i.id === 'namwon_2504').bounds;               // 드론 AOI(덕과면 · 0.8×0.8 km) — 실측 bounds
const NAMWON_CAM = { center: [127.47, 35.425], zoom: 12.5, pitch: 35, bearing: 0 };
const KOREA_CAM = { center: [127.7, 36.1], zoom: 5.7, pitch: 0, bearing: 0 };
const AOI_CAM = { center: [(A01[0] + A01[2]) / 2, (A01[1] + A01[3]) / 2 - 0.0004], zoom: 16.6, pitch: 35, bearing: 0 };

/* ═══ 0. 상태 ═══ */
const state = {
  mode: 'off', role: 'guest', build: 'public', public: Q.get('public') === '1', embed: Q.get('embed') === '1', locale: Q.get('locale') || 'ko',
  results: new Set(), emd: true, filament: false, extrude: false, swipe: null, epoch: Number.isFinite(parseFloat(Q.get('epoch'))) ? parseFloat(Q.get('epoch')) : null, frame: null, card: null, model: Q.get('model'),
  pick: Q.get('pick'), svc: Q.get('svc'), result: Q.get('result'), job: Q.get('job'), scene: 'boot', panel: false, drawer: null,
  xmode: 'read', hudCtx: 'boot', deployQ: Q.get('deploy'), finding: Q.get('finding'), pnu: Q.get('pnu'),
};
let svy = null;   // 실태조사 모드(기관·직원 · 게스트는 null — survey 요청 0)
const X = { state, T, PHASES, CAMLOG, TILE_LOG, PREWARM_LOG, EXT_LOG, jumps: () => jumps(), locks };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let AOI_EMD = '덕과면';   // A01 드론 AOI 를 품은 읍면동(부팅 때 읍면동 경계로 다시 판정)
window.__xi = X;

/* ═══ 1. 역할 관문(계약 §3 · 설계서 §3.1) ═══ */
function roleOf(sh) {
  if (sh.realm === 'lx') return sh.role === 'sales' ? 'sales' : 'staff';
  if (sh.realm === 'tenant') return 'agency';
  return 'guest';
}
const GATES = {
  guest: { frame: false, run: false, extrude: false, parcel: true, feedback: false, drawer: false, export: false, ownImagery: false, verbs: ['V1', 'V5', 'V6', 'V8'] },
  staff: { frame: true, run: true, extrude: true, parcel: true, feedback: false, drawer: true, export: true, ownImagery: true, verbs: ['V1', 'V2', 'V3', 'V4', 'V5', 'V6', 'V7', 'V8'] },
  sales: { frame: true, run: true, demo: true, extrude: true, parcel: true, feedback: false, drawer: true, export: false, ownImagery: true, verbs: ['V1', 'V2', 'V3', 'V4', 'V5', 'V6', 'V7', 'V8'] },
  agency: { frame: false, run: false, extrude: true, parcel: true, feedback: true, drawer: true, export: true, ownImagery: true, verbs: ['V1', 'V4', 'V5', 'V6', 'V8'] },
};
const ROLE_KO = { guest: '게스트', staff: 'LX 직원', sales: '영업 · 예시', agency: '남원시 · 기관' };
let G = GATES.guest;

/* ═══ 2. URL 상태(새로고침 복원) ═══ */
let urlT = 0;
function writeUrl() {
  clearTimeout(urlT);
  urlT = setTimeout(() => {
    const q = new URLSearchParams();
    if (state.public) q.set('public', '1');
    if (state.embed) q.set('embed', '1');
    if (state.locale !== 'ko') q.set('locale', state.locale);
    if (M.A && state.scene !== 'boot' && state.scene !== 'intro') { const c = M.A.getCenter(); q.set('cam', [c.lng.toFixed(5), c.lat.toFixed(5), M.A.getZoom().toFixed(2), M.A.getPitch().toFixed(0), M.A.getBearing().toFixed(0)].join(',')); }
    if (state.results.size) q.set('on', [...state.results].join(','));
    if (state.epoch != null && scrub?.S.enabled) q.set('epoch', String(state.epoch));
    if (state.swipe != null) q.set('swipe', String(state.swipe));
    if (state.frame) q.set('frame', btoa(unescape(encodeURIComponent(JSON.stringify(state.frame)))));
    if (state.card) q.set('card', state.card);
    if (state.model) q.set('model', state.model);
    if (state.pick) q.set('pick', state.pick);
    if (state.svc) q.set('svc', state.svc);
    if (state.result) q.set('result', state.result);
    if (state.job) q.set('job', state.job);
    if (panel?.S.open) q.set('panel', panel.S.tab);
    if (state.drawer) q.set('drawer', state.drawer);
    if (state.extrude) q.set('3d', '1');
    // 실태조사(v1.1-29): ?mode=survey&survey=farmland&rule=&priority=&emd=&state=&queue=1&finding=&pnu= · 계보 ?deploy=
    const su = svy?.urlState?.() || {};
    for (const [k, v] of Object.entries(su)) if (v) q.set(k, v);
    if (state.finding && su.mode) q.set('finding', state.finding);
    if (!su.mode && state.pnu) q.set('pnu', state.pnu);
    if (state.deployQ) q.set('deploy', state.deployQ);
    const s = q.toString();
    history.replaceState(null, '', location.pathname + (s ? '?' + s : ''));
  }, D.d120);
}
const parseCam = (s) => { const v = (s || '').split(',').map(Number); return v.length >= 3 && v.every(Number.isFinite) ? { center: [v[0], v[1]], zoom: v[2], pitch: v[3] || 0, bearing: v[4] || 0 } : null; };
const parseFrame = (s) => { try { return s ? JSON.parse(decodeURIComponent(escape(atob(s)))) : null; } catch { return null; } };

/* ═══ 3. 데이터(on = API · off = 픽스처/실파일) ═══ */
async function loadData() {
  const sh = session.shadow();
  state.role = roleOf(sh); state.session = sh;
  G = GATES[state.role];
  state.build = state.public || state.role === 'guest' ? 'public' : state.role === 'agency' ? 'tenant:namwon' : 'lx';
  if (state.public) G = { ...GATES.guest };
  let cat = null, dps = null, models = null;
  if (API.mode === 'on') {
    try { cat = await apiCatalog({ stage: 'domestic', build: state.build.split(':')[0], locale: state.locale }); } catch { cat = null; }
    // 게스트(토큰 없음)는 /deploys 권한이 없다(계약 §3) — 401 콘솔 오류를 내지 않도록 부르지 않고 공개 픽스처를 쓴다
    if (session.get()?.token) try { dps = (await apiDeploys(state.role === 'agency' ? { tenant_id: sh.tenant_id } : {})).items; } catch { dps = null; }
  }
  state.via = { catalog: cat ? 'api' : 'fixture', deploys: dps ? 'api' : 'fixture', models: 'lazy' };
  if (!cat) { const f = await fixture('data/catalog-fixture.json'); cat = f?.[state.build] || { items: [], ladder: { domestic: [] } }; state.parcelsFlag = f?._parcels; }
  if (!dps) {
    const f = await fixture('data/deploys-fixture.json');
    dps = (f?.items || []).filter((d) => d.tenant_id === 'namwon' || d.tenant_id === 'gwangju-jeonnam' || state.build === 'lx');
    if (state.role === 'agency') dps = dps.filter((d) => d.tenant_id === (sh.tenant_id || 'namwon'));
  }
  if (state.build === 'public') { const pub = new Set(cat.items.filter((i) => i.role === 'result').map((i) => i.id)); dps = dps.filter((d) => d.snapshot_current && (pub.has(d.snapshot_current.split('/').pop()) || d.id === 'dp-nw-farm-25')); }
  // P8 필지: 카탈로그에 reference/parcels-namwon 이 있을 때만(없으면 결손 칩 · 404 요청 0)
  const man = state.build === 'public' ? null : await fixture('/landxi/data/manifest.json');
  state.parcels = cat.items.find((i) => i.id === 'parcels-namwon') || (man?.items || []).find((i) => /parcels/.test(i.id)) || null;
  return { cat, dps, models };
}
/** 모델 목록 — 프레임을 처음 씌울 때 한 번(on: GET /registry/models · 실패/off: 02. 데이터/models/index.json 실파일) */
let modelsP = null;
function loadModels() {
  return (modelsP ||= (async () => {
    if (API.mode === 'on') { try { const j = await api('/registry/models'); state.via.models = 'api'; return j.items; } catch { /* 폴백 */ } }
    state.via.models = 'file'; return modelsFromFiles();
  })());
}
async function modelsFromFiles() {
  const idx = await fixture('/landxi/data/models/index.json');
  const rec = (v, src, note) => ({ value: v, unit: 'ratio', basis: 'recorded', as_of: '2026-09-24', source: src, ...(note ? { note } : {}) });
  const out = (idx || []).map((r) => ({
    id: r.id, family: r.train_args?.model || 'yolo-seg', task: 'seg', classes: Object.values(r.names || {}), input: ['ortho'],
    gsd_trained_m: r.id.startsWith('aerial25') ? 0.25 : 0.02, weights_uri: r.weights, perf: null, status: 'registered',
    metrics: r.best_by_mask_mAP50 ? { mask_mAP50: rec(r.best_by_mask_mAP50['metrics/mAP50(M)'], `models/${r.id}/results.csv`, `best epoch ${r.best_by_mask_mAP50.epoch}`) } : r.metrics ? { mask_mAP50: rec(r.metrics['metrics/mAP50(M)'], 'ckpt train_metrics', 'results.csv 없음') } : {},
  }));
  out.push({ id: 'car_v2_obb', family: 'yolo11-obb', task: 'obb', classes: ['vehicle'], input: ['ortho'], gsd_trained_m: 0.0136, perf: null, status: 'registered', metrics: { mAP50: rec(0.992, 'ASSET-LEDGER B05') } });
  return out;
}

/* ═══ 4. 지도 ═══ */
const M = { A: null, B: null, ladder: null, ladderB: null, items: {}, dates: {} };
let hud, panel, pcard, ecard, dr, scrub, sw, ft, ex, fil, perf, tierInfo, emdFeatures = [], a02 = null;
const RESULT_KEYS = { 'namwon-landcover-2023': ['r-lc', 'landcover'], 'namwon-farmland-2025': ['r-fa', 'farmland'], 'namwon-greenhouse-2025': ['r-gh', 'greenhouse'], 'namwon-change': ['r-ch', 'change'] };
const layersOf = (id) => { const k = RESULT_KEYS[id]; if (!k) return []; return [`${k[0]}-fill`, `${k[0]}-halo`, `${k[0]}-line`, `${k[0]}-dash`]; };

async function addResultSource(map, it) {
  const sid = 'src-' + it.id;
  if (!map.getSource(sid)) map.addSource(sid, await sourceSpec(it));
  const [key, kind] = RESULT_KEYS[it.id] || ['r-' + it.id, 'farmland'];
  if (!map.getLayer(`${key}-line`)) addResultLayers(map, key, sid, { kind, sourceLayer: it.layer, visible: false });
  return layersOf(it.id).filter((l) => map.getLayer(l));
}
function setResult(id, on, { map = M.A } = {}) {
  const it = M.items[id]; if (!it) return;
  setVis(map, layersOf(id), on);
  if (map === M.A) { if (on) state.results.add(id); else state.results.delete(id); writeUrl(); }
}

async function buildMaps(data) {
  const handoff = readHandoff();
  const cam0 = parseCam(Q.get('cam')) || (handoff ? { center: handoff.center, zoom: handoff.zoom, pitch: handoff.pitch || 0, bearing: handoff.bearing || 0 } : null);
  state.cam0 = cam0;
  // 글로브 부팅: VIIRS 어제 타일이 받히기 전에는 원반을 그리지 않는다(빈 회색 원반 0 · intro 가 500 페이드로 연다)
  if (!cam0) { $('map').style.opacity = '0'; hud.pending({ scene: '글로브', title: `VIIRS 위성 · 어제(${yesterdayUTC()})`, pending: 'VIIRS 어제 · 수신 중' }); }
  // 카메라 복원(새 탭 · ?cam=)도 같은 규칙: 첫 idle(타일 수신)까지 캔버스를 닫아 두고 500 으로 연다(흰 캔버스 + '부팅' HUD 노출 0 · 2차 판정)
  else {
    $('map').style.opacity = '0';
    const pub = state.public || !G.ownImagery;
    hud.pending(pub ? { scene: '공개 보기', title: 'V-World 위성 + AI 결과', pending: '공개 결과 불러오는 중 · 위성 수신' } : { scene: '복원', title: '같은 카메라 · 영상 수신', pending: '영상 수신 중' });
  }
  M.A = createMap({ container: $('map'), mode: 'globe', center: cam0?.center || [112, 26], zoom: cam0?.zoom ?? 1.7, pitch: cam0?.pitch || 0, bearing: cam0?.bearing || 0, maxPitch: 60 });
  M.B = createMap({ container: $('map-b'), mode: 'globe', center: cam0?.center || [112, 26], zoom: cam0?.zoom ?? 1.7, interactive: false, transparent: true, maxPitch: 60 });
  X.A = M.A; X.B = M.B;
  // MapLibre 는 'error' 청취자가 없으면 console.error 로 쏟는다 — 모아 두고(테스트가 읽는다) 타일 결손이 아닌 오류만 경고로 남긴다
  X.mapErrors = [];
  for (const m of [M.A, M.B]) m.on('error', (e) => { const msg = String(e?.error?.message || e?.error || e); X.mapErrors.push(msg.slice(0, 200)); if (!/AJAXError|Failed to fetch|NetworkError|aborted/i.test(msg)) console.warn('map', msg); });
  await Promise.all([loaded(M.A), loaded(M.B)]);
  for (const it of data.cat.items) M.items[it.id] = it;
  // 날짜: VIIRS 어제 · HLS 는 남원 타일 실측으로 고른 날(sources.pickHls)
  M.dates.viirs = yesterdayUTC();
  const hls = M.items['gibs-hls-s30'] ? await pickHls({ want: 1 }) : null;
  M.dates.hls = hls?.date || null; M.dates.hlsNote = hls?.note;
  // HLS 는 꺼진 채로 올린다 — 하강 경로 화면 커버리지 ≥ 70 % · 중심 유효일 때만 켠다(1차 판정 must_fix 4 · 조각 띠 0)
  M.ladder = await mountLadder(M.A, data.cat.items, { order: data.cat.ladder?.domestic || [], before: 'slot-imagery', dates: M.dates, hidden: ['gibs-hls-s30'] });
  const hlsIt = M.ladder.items.find((i) => i.id === 'gibs-hls-s30');
  if (hlsIt && M.dates.hls) {
    const path = pathCams(KOREA_CAM, introTarget(), { step: 0.25 });
    const at = (z) => path.reduce((a, c) => (Math.abs(c.zoom - z) < Math.abs(a.zoom - z) ? c : a), path[0]);
    const cams = [KOREA_CAM, at(7.6), at(9.2)];
    M.hlsGateP = hlsCoverage(hlsIt, M.dates.hls, cams).then((r) => { if (M.hlsDecided) { X.hlsGateLate = r; return r; } M.hlsGate = r; X.hlsGate = r; if (r.ok) M.ladder.visible('gibs-hls-s30', true); return r; }).catch(() => (M.hlsGate = { ok: false, min: 0, cams: [], error: true }));
  } else M.hlsGate = { ok: false, min: 0, cams: [], reason: M.dates.hls ? '카탈로그 없음' : 'HLS 날짜 없음' };
  const viirsIt = M.items['gibs-viirs-truecolor'];
  if (viirsIt && !cam0) M.skyP = skyStats(viirsIt, M.dates.viirs).then((s) => { M.sky = s; X.sky = s; if (M.A) onCamera(); return s; }).catch(() => null);
  polarPaper(M.A);
  // 글로브 → 한국 → 남원 하강 경로의 영상 타일을 지금부터 받아 둔다(하강 중 먹색 프레임 0 · intro 가 기다린다)
  if (!cam0) X.pwDescent = prewarmPath(KOREA_CAM, introTarget(), { from: 6, skip: ['gibs-hls-s30'] });   // HLS 는 하루치 띠(대부분 빈 칸) — 받치는 층은 VIIRS·V-World
  // 참조: 읍면동(A11)
  const emdIt = M.items['namwon-emd'];
  if (emdIt) {
    M.A.addSource('src-emd', await sourceSpec(emdIt));
    M.A.addLayer({ id: 'ref-emd-fill', type: 'fill', source: 'src-emd', 'source-layer': emdIt.layer, minzoom: 8, paint: { 'fill-color': '#FFFFFF', 'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.08, 0.001] } }, 'slot-reference');
    M.A.addLayer({ id: 'ref-emd-line', type: 'line', source: 'src-emd', 'source-layer': emdIt.layer, minzoom: 8, layout: { 'line-join': 'miter' },
      paint: { 'line-color': '#FFFFFF', 'line-width': ['case', ['boolean', ['feature-state', 'hover'], false], 1.6, 0.8], 'line-opacity': ['interpolate', ['linear'], ['zoom'], 8, 0.25, 11, 0.55, 15, 0.35] } }, 'slot-reference');
  }
  // 참조: P8 필지(C04 2021-12 · z15+ 헤어라인 · 클릭 조회용 투명 면) — 카탈로그에 있을 때만(공개 빌드 없음)
  const pIt = M.items['parcels-namwon'];
  if (pIt) {
    M.A.addSource('src-parcels', await sourceSpec(pIt));
    M.A.addLayer({ id: 'ref-parcel-fill', type: 'fill', source: 'src-parcels', 'source-layer': pIt.layer, minzoom: 14, layout: { visibility: 'none' }, paint: { 'fill-color': '#FFFFFF', 'fill-opacity': 0.001 } }, 'slot-reference');
    M.A.addLayer({ id: 'ref-parcel-line', type: 'line', source: 'src-parcels', 'source-layer': pIt.layer, minzoom: 15, layout: { 'line-join': 'miter', visibility: 'none' },
      paint: { 'line-color': '#FFFFFF', 'line-width': 0.6, 'line-opacity': ['interpolate', ['linear'], ['zoom'], 15, 0, 16, 0.32, 18, 0.45] } }, 'slot-reference');
  }
  // 필지 타일은 도착 영상이 다 받힌 뒤에만 요청(같은 호스트 연결 6개를 영상 타일과 다투지 않게)
  if (pIt) document.addEventListener('xi-phase', (e) => { if (e.detail.phase === 'arrived' && M.A.getZoom() >= 14) setTimeout(() => parcelsOn(), D.d750); });
  // 결과 소스(A: 숨김으로 시작 · 도착이 켠다)
  for (const id of Object.keys(RESULT_KEYS)) if (M.items[id]) await addResultSource(M.A, M.items[id]);
  // 결과 hover(fill-opacity .18 → .42)
  let hov = null;
  const hoverOn = (e) => {
    const f = e.features?.[0]; if (!f || f.id == null) return;
    const key = { source: f.source, sourceLayer: f.sourceLayer, id: f.id };
    if (hov && (hov.id !== key.id || hov.source !== key.source)) M.A.setFeatureState(hov, { hover: false });
    hov = key; M.A.setFeatureState(key, { hover: true }); M.A.getCanvas().style.cursor = 'pointer';
    if (f.source === 'src-namwon-farmland-2025') panel?.markRow(String(f.id));
  };
  const hoverOff = () => { if (hov) M.A.setFeatureState(hov, { hover: false }); hov = null; M.A.getCanvas().style.cursor = ''; panel?.markRow(null); };
  for (const l of ['r-lc-fill', 'r-fa-fill', 'r-gh-fill']) if (M.A.getLayer(l)) { M.A.on('mousemove', l, hoverOn); M.A.on('mouseleave', l, hoverOff); }
}

/* ═══ 5. HUD 출처 칩 · 계기 ═══ */
function onCamera() {
  const z = M.A.getZoom(), c = M.A.getCenter().toArray();
  const ch = currentChip(z, c);
  hud.chip(ch.text, ch.item);
  hud.zoom(z, c);
  const paper = z < 5.5 ? '1' : '0'; if (document.documentElement.dataset.paper !== paper) document.documentElement.dataset.paper = paper;   // 순백 글로브 위 계기는 잉크색
  // 축척 막대(108px 안 · 1-2-5 단위)
  const mpp = (40075016.7 * Math.cos((c[1] * Math.PI) / 180)) / (512 * 2 ** z);
  const raw = mpp * 108, p = 10 ** Math.floor(Math.log10(raw)), n = raw / p >= 5 ? 5 * p : raw / p >= 2 ? 2 * p : p;
  $('scale').querySelector('i').style.width = (n / mpp).toFixed(0) + 'px';
  $('scale').querySelector('b').textContent = n >= 1000 ? `${n / 1000} km` : `${n} m`;
  const att = new Set(); for (const it of M.ladder?.items || []) if (opacityAt(it, z) > 0.05 && (it.id !== 'gibs-hls-s30' || M.hlsGate?.ok)) att.add(it.attribution);
  $('attrib').textContent = [...att].join(' · ');
  // 보조 칩: 글로브 = '어제 · 구름 n%'(VIIRS 한국 상공 실측) · 하강 z5.2–10.2 에서 HLS 를 껐으면 'HLS 30m · 궤도 밖'(결손)
  const miss = $('hud-miss');
  if (miss) {
    const hlsBand = M.hlsGate && !M.hlsGate.ok && z >= 5.2 && z <= 10.2 && M.items['gibs-hls-s30'];
    if (z < 5.5 && M.sky) { miss.hidden = false; miss.dataset.kind = 'sky'; miss.textContent = `어제 · 구름 ${M.sky.cloud}%`; miss.title = `VIIRS ${M.sky.date} · 한국 상공 z4 타일 실측 · 밝기 평균 ${M.sky.mean} · min(RGB) ≥ 180 = 구름`; }
    else if (hlsBand) { miss.hidden = false; miss.dataset.kind = 'hls'; miss.textContent = `HLS 30m · 궤도 밖${M.hlsGate.cams?.length ? ` · 화면 ${Math.round(M.hlsGate.min * 100)}%` : ''}`; miss.title = `하강 경로 화면 커버리지 ${(M.hlsGate.cams || []).map((c) => `z${c.zoom} ${Math.round(c.cov * 100)}%`).join(' · ')} < 70 % → 층 끔`; }
    else miss.hidden = true;
    if (!miss.hidden && miss.textContent !== X.missLog?.at(-1)) (X.missLog ||= []).push(miss.textContent);
  }
  emitView();
}
let viewT = 0;
function emitView() { clearTimeout(viewT); viewT = setTimeout(() => { if (M.A) xiEmit('view', viewOf()); }, D.d180); }
function viewOf() {
  const b = M.A.getBounds(), c = M.A.getCenter();
  return { center: [c.lng, c.lat], zoom: M.A.getZoom(), pitch: M.A.getPitch(), bearing: M.A.getBearing(), bbox: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()],
    on: [...state.results], frame: state.frame, svc: state.svc, mode: state.xmode, epoch: state.epoch, api: API.mode, role: state.role, scene: state.scene, job: state.job };
}

/** 출처 칩 — 사다리 맨 위 층, 단 드론 AOI 시점 스크럽 중이면 지금 보이는 시점 층 */
function currentChip(z = M.A.getZoom(), c = M.A.getCenter().toArray()) {
  if (!M.ladder) return { text: '—' };
  if ($('scrub').dataset.mode === 'parcel' && scrub?.S.enabled && z >= 13) {
    const L = scrub.layersOf(scrub.e), ep = scrub.S.epochs[L.b != null && L.f >= 0.5 ? L.b : L.a], it = ep && M.items[ep.id];
    if (it) return { item: it, text: chipText(it) };
  }
  if ($('scrub').dataset.mode === 'aoi' && scrub?.S.enabled && z >= 15 && c[0] >= A01[0] && c[0] <= A01[2] && c[1] >= A01[1] && c[1] <= A01[3]) {
    const L = scrub.layersOf(scrub.e), ep = scrub.S.epochs[L.b != null && L.f >= 0.5 ? L.b : L.a], it = ep && M.items[ep.id];
    if (it) return { item: it, text: chipText(it) };
  }
  return M.ladder.chipAt(z, c);
}
X.currentChip = () => currentChip();

/* ═══ 6. 장면 ═══ */
const introTarget = () => (state.public || !G.ownImagery ? { ...NAMWON_CAM, zoom: 12 } : NAMWON_CAM);
async function intro(target = introTarget()) {
  state.scene = 'intro';
  setPhase('globe');
  await idle(M.A, 4000);
  // VIIRS 어제 타일이 받힌 뒤에야 지구를 연다(500 · 법전 ui 이징)
  openCanvas();
  const sky = await Promise.race([M.skyP || Promise.resolve(null), sleep(D.d380)]);
  hud.pending({ scene: '글로브', title: `VIIRS 위성 · ${M.dates.viirs} · 어제`, pending: sky ? `어제 찍힌 지구 · 한국 상공 구름 ${sky.cloud}% · 한국으로` : '어제 찍힌 지구 · 한국으로' });
  await sleep(D.d750);   // 어제의 지구를 한 박자 보여 준다
  // HLS 커버리지 판정은 한국으로 날기 전에 끝낸다(비행 중에 층이 켜지며 조각이 뜨는 일 0) — 상한 1250 · 못 끝내면 끈 채로
  const tg = performance.now();
  const gate = await Promise.race([M.hlsGateP || Promise.resolve(M.hlsGate), sleep(D.d1250).then(() => null)]);
  X.hlsGateWait = { ms: Math.round(performance.now() - tg), result: gate ? (gate.ok ? 'on' : 'off') : 'timeout' };
  M.hlsDecided = true;
  if (!gate) M.hlsGate = { ok: false, min: 0, cams: [], reason: '판정 시간 초과 · 끈 채로' };
  await flyLadder([M.A, M.B], KOREA_CAM, { duration: D.d2400 });
  setPhase('korea');
  hud.pending({ scene: '국내 무대', title: '대한민국 · 위성 → 항공 → 드론', pending: '남원으로 하강' });
  // 하강 경로 타일 선적재가 끝나기를 잠깐(상한 1250) 기다린다 — 받힌 것 위로만 내려간다
  const tw = performance.now();
  const pw = await Promise.race([X.pwDescent || Promise.resolve(null), sleep(D.d1250).then(() => 'timeout')]);
  X.prewarmWait = { ms: Math.round(performance.now() - tw), result: pw };
  // 하강 마지막 30 % 에서 도착 층 타일을 미리 받는다(도착 대기 ≈ 0 · 두 번째 캔버스는 숨긴 채)
  await flyLadder([M.A, M.B], target, { duration: D.d1600, onFrame: (c, t) => { if (t > 0.7) prepCity(); } });
}
/** 사다리 층 경로 선적재 — 층마다 경로에서 쓰일 타일 줌(tz = round(z+1))마다 한 번, 그 tz 를 처음 쓰는(화면을 가장 넓게 덮는) 카메라로.
    끝 카메라는 모든 보이는 층을(기울기 포함). finalOnly = 끝 카메라만(드론 AOI: 위쪽 먼 곳까지). skip = 건너뛸 층 id. */
function prewarmPath(a, b, { from = -Infinity, concurrency = 16, finalOnly = false, skip = [] } = {}) {
  const cams = finalOnly ? [] : pathCams(a, b, { step: 0.25 }).filter((c) => c.zoom >= from);
  const jobs = [], seen = new Set();
  const lad = [...(M.ladder?.items || []), ...(M.ladder?.floor ? [M.ladder.floor] : [])];
  const paramsOf = (it) => (it.id === 'gibs-hls-s30' ? { date: M.dates.hls } : it.id === 'gibs-viirs-truecolor' ? { date: M.dates.viirs } : {});
  for (const cam of cams) for (const it of lad) {
    if (skip.includes(it.id) || opacityAt(it, cam.zoom) <= 0.01) continue;
    const k = it.id + '|' + Math.round(cam.zoom + 1); if (seen.has(k)) continue; seen.add(k);
    jobs.push({ item: it, params: paramsOf(it), cam });
  }
  for (const it of lad) if (!skip.includes(it.id) && opacityAt(it, b.zoom) > 0.01) {
    jobs.push({ item: it, params: paramsOf(it), cam: b });
    if (b.pitch > 20) jobs.push({ item: it, params: paramsOf(it), cam: b, tz: Math.round(b.zoom + 1) - 1, far: 2 });   // 기울인 화면 위쪽 먼 곳(한 단계 낮은 타일)
  }
  return prewarm(jobs, { concurrency });
}
/* 극지 종이: VIIRS 어제 영상은 극야·궤도 틈이 검은 픽셀(no data)이라 글로브 북극에 검은 모자가 앉는다 —
   위도 68° 부터 76° 까지 점점, 그 위는 순백 글로브 바탕(#F2F4F6)으로 덮는다(z < 5.5 에서만 · 국내 하강과 무관). */
function polarPaper(map) {
  if (map.getSource('polar-paper')) return;
  const feats = [];
  const band = (a, b, o) => { for (let x = -180; x < 180; x += 90) feats.push({ type: 'Feature', properties: { o }, geometry: { type: 'Polygon', coordinates: [[[x, a], [x + 90, a], [x + 90, b], [x, b], [x, a]]] } }); };
  const steps = [68, 70, 72, 74, 76];
  for (const s of [1, -1]) {
    for (let i = 0; i < steps.length - 1; i++) band(s * steps[i], s * steps[i + 1], +(((i + 1) / steps.length)).toFixed(2));
    band(s * 76, s * 85.06, 1);
  }
  map.addSource('polar-paper', { type: 'geojson', data: { type: 'FeatureCollection', features: feats } });
  map.addLayer({ id: 'polar-paper', type: 'fill', source: 'polar-paper', maxzoom: 5.5, paint: { 'fill-color': '#F2F4F6', 'fill-opacity': ['get', 'o'], 'fill-antialias': false } }, 'slot-imagery');
}
let cityPrep = null;
function prepCity() {
  if (cityPrep) return cityPrep;
  const ch = cityHead(); if (!ch) return (cityPrep = Promise.resolve(null));
  const ids = layersOf(ch.id).filter((l) => M.A.getLayer(l)), saved = {};
  cityPrep = addResultSource(M.B, ch.item).then((l) => { M.bKeys = l; setVis(M.B, l, true); return { ch, ids, saved }; });
  return cityPrep;
}
function cityHead() {
  const it = M.items['namwon-landcover-2023'];
  if (it && G.ownImagery) return { id: it.id, item: it, head: { scene: '남원 전역', title: '남원 토지피복 AI · 2023 25cm 재추론', unit: '폴리곤', provLabel: '결과', pending: '스캔 중 · 22,737칩 추론 결과' } };
  const fa = M.items['namwon-farmland-2025'];
  return fa ? { id: fa.id, item: fa, head: { scene: '공개 결과', title: '남원 농지이용 2025 · V-World 위성 위', unit: '필지', provLabel: '공개 결과', pending: '스캔 중' } } : null;
}
/* 결과 층의 개수 봉투: 폴리곤 수를 센 것은 실측이지만 폴리곤 자체는 AI 추론·검수 전이다(계약 §2 예시 basis:'inferred').
   게이트웨이 카탈로그가 count.basis='measured' + item.basis='inferred' 로 내면 item.basis 를 따른다(결과 문서 계약 변경 요청 1). */
function resEnv(it) {
  const c = it?.count; if (!c) return c;
  if (it.role === 'result' && it.basis === 'inferred' && c.basis !== 'inferred') return { ...c, basis: 'inferred', note: c.note || ('결과 확인 전 · ' + (it.attribution || '').replace(/ · (?:검수|결과 확인) 전$/, '')) };
  return c;
}
async function arriveCity({ animate = true } = {}) {
  const ch = cityHead(); if (!ch) { hud.voidNote('이 계정에 열 수 있는 결과 없음'); return; }
  state.scene = 'city';
  const st = ch.id === 'namwon-landcover-2023' ? await emdStats() : null;
  const note = st ? [...['건물', '경작지', '주차장', '비닐하우스'].map((k) => `${k} ${numHtml(env(st.total[k].n, 'polygons', 'inferred', st.source), { unit: false })}`), '<b class="xi-ai">AI 추론 · 결과 확인 전</b>', '2023 25cm']
    : [`경작지 · 비경작지`, '<b>공개 결과</b>', 'LX 드론 2025'];
  const prep = await prepCity();
  const o = {
    scene: 'city', bbox: (() => { const b = M.A.getBounds(); return [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]; })(),
    head: ch.head, count: resEnv(ch.item), note,
    prepB: () => {},
    preloadA: (A) => { for (const l of prep.ids) { const k = A.getLayer(l).type === 'fill' ? 'fill-opacity' : 'line-opacity'; if (!prep.saved[l]) prep.saved[l] = [k, A.getPaintProperty(l, k)]; A.setPaintProperty(l, k, 0); } setVis(A, prep.ids, true); },
    show: (A) => { for (const l of prep.ids) { const [k, v] = prep.saved[l] || []; if (k) A.setPaintProperty(l, k, v ?? 1); } setResult(ch.id, true); },
    clearB: (B) => setVis(B, M.bKeys || [], false),
    lockPick: (B) => pickLocks(B, M.bKeys || [], { unitSrc: ch.item.path || ch.item.set }),
  };
  state.hudCtx = 'city';
  if (!animate || RM()) { o.show(M.A); o.clearB(M.B); await hud.count(o.count, o.head, o.note); setPhase('arrived', { scene: 'city' }); return; }
  await arrive({ A: M.A, B: M.B, bWrap: $('map-b'), sweepEl: $('sweep'), stageEl: $('locks'), hud }, o);
  mark('arrived');
  writeUrl();
  prewarmAoi();
}
/** 드론 AOI 하강 경로(z14 이상 · 끝 카메라) 타일을 도착 직후 쉬는 동안 받아 둔다 — 하강 중 위쪽 먹색 띠 0 */
function prewarmAoi() {
  if (!G.ownImagery || X.pwAoi) return X.pwAoi;
  const c = M.A.getCenter();
  X.pwAoi = prewarmPath({ center: [c.lng, c.lat], zoom: M.A.getZoom(), pitch: M.A.getPitch() }, AOI_CAM, { from: 15.4, concurrency: 8 });
  return X.pwAoi;
}
const gsdText = (it) => (it?.gsd_m ? (it.gsd_m >= 1 ? `${it.gsd_m}m` : `${+(it.gsd_m * 100).toFixed(2)}cm`) : '—');
async function toAoi() {
  if (!G.ownImagery) { toast('드론 원본 영상은 로그인 후 열람'); return; }
  cancelArrive(); clearLocks(); pcard?.close(); ecard?.close();
  state.scene = 'aoi';
  const aoiIt = M.items['namwon-aoi-2504'];
  hud.pending({ scene: 'cm 하강', title: `${AOI_EMD} 드론 AOI · 25cm → 2m → ${gsdText(aoiIt)}`, pending: '하강 중' });
  setPhase('descend');
  const tw = performance.now();
  await Promise.race([prewarmAoi() || Promise.resolve(), sleep(D.d500)]);   // 보통 이미 끝나 있다(도착 뒤 쉬는 동안)
  X.prewarmAoiWait = Math.round(performance.now() - tw);
  await flyLadder([M.A, M.B], AOI_CAM, { duration: D.d1250 });
  await arriveAoi();
}
async function arriveAoi({ animate = true } = {}) {
  // AOI 안 실제 결과: A02 필지(A01 촬영 범위 안에 온전히 든 것 · 실측) + A04 변화 456
  const fa = await loadA02();
  // AOI 에 걸친 필지(bbox 교차 · 실측) — 온전히 든 것은 따로 센다
  const inAoi = fa.features.filter((f) => { const b = bboxOf(f.geometry); return b[0] <= A01[2] && b[2] >= A01[0] && b[1] <= A01[3] && b[3] >= A01[1]; });
  const whole = inAoi.filter((f) => { const b = bboxOf(f.geometry); return b[0] >= A01[0] && b[2] <= A01[2] && b[1] >= A01[1] && b[3] <= A01[3]; }).length;
  state.aoiParcels = inAoi.map((f) => f.properties.id);
  const nCh = CHANGE.reduce((a, c) => a + c.stats.n, 0);
  // 봉투: 개수는 센 값이지만 대상(변화 윤곽 · 농지 판독)은 AI/비지도 결과 · 검수 전 — on/off 두 모드 같은 배지(결과 문서 계약 변경 요청 1)
  const chEnv = resEnv(M.items['namwon-change']) || env(nCh, 'count', 'inferred', 'landxi/assets/data/change.js', '변화 지수(비지도) · 결과 확인 전');
  const faEnv = env(inAoi.length, '필지', 'inferred', 'namwon-farmland-2025.geojson × A01 bounds', `A01 촬영 범위에 걸친 필지 · 온전히 든 것 ${whole}(프론트 계산) · AI 분석 결과 확인 전`);
  const aoiIt = M.items['namwon-aoi-2504'];
  const note = [`A02 농경지 ${numHtml(faEnv, { unit: true })} <small>AOI 걸침 · 온전히 ${whole}</small>`, '변화 지수(비지도) · 학습 결과 아님', '2025.04 → 10 · 4시점'];
  const keys = [];
  const o = {
    scene: 'aoi', bbox: A01, head: { scene: '드론 AOI', title: `${AOI_EMD} · LX 드론 ${gsdText(aoiIt)} · ${aoiIt?.epoch || '2025'}`, unit: '변화 윤곽', provLabel: '변화', provTag: '변화 지수 · 결과 확인 전', pending: 'AOI 안 결과 스캔' },
    count: chEnv, note,
    prepB: async (B) => {
      for (const id of ['namwon-farmland-2025', 'namwon-change']) if (M.items[id]) { const l = await addResultSource(B, M.items[id]); setVis(B, l, true); keys.push(...l); }
    },
    preloadA: () => {},
    show: (A) => { for (const id of ['namwon-farmland-2025', 'namwon-change']) setResult(id, true); },
    clearB: (B) => setVis(B, keys, false),
    lockPick: (B) => {
      const picks = pickLocks(B, keys.filter((k) => /r-fa-(fill|line)/.test(k)), { unitSrc: 'namwon-farmland-2025', prefer: ['경작지', '비경작지'], zones: [[0.5, 0.5], [0.35, 0.55], [0.62, 0.45]] });
      return picks.length ? picks : pickLocks(B, keys, { unitSrc: 'namwon-change', prefer: ['built_new', 'veg_loss', 'veg_gain'] });
    },
  };
  state.hudCtx = 'aoi'; state.aoiHud = { env: chEnv, head: o.head, note };
  if (!animate || RM()) { o.show(M.A); await hud.count(o.count, o.head, o.note); setPhase('arrived', { scene: 'aoi' }); }
  else { await o.prepB(M.B); await arrive({ A: M.A, B: M.B, bWrap: $('map-b'), sweepEl: $('sweep'), stageEl: $('locks'), hud }, { ...o, prepB: () => {} }); }
  buildScrub('aoi');
  writeUrl();
}
let a02Promise = null;
function loadA02() { return (a02Promise ||= fetch('/landxi/assets/data/geo/results/namwon-farmland-2025.geojson').then((r) => r.json()).then((j) => (a02 = j))); }

/* ═══ 7. 시점 스크러버 ═══ */
const EPL = new Map();
function epochLayer(itId) { if (!EPL.has(itId)) EPL.set(itId, epochLayer0(itId)); return EPL.get(itId); }
async function epochLayer0(itId) {
  const it = M.items[itId]; if (!it) return null;
  const lid = 'img-' + itId;
  if (!M.A.getLayer(lid)) {
    if (!M.A.getSource('src-' + itId)) M.A.addSource('src-' + itId, await sourceSpec(it));
    M.A.addLayer({ id: lid, type: 'raster', source: 'src-' + itId, layout: { visibility: 'none' }, paint: { 'raster-opacity': 0, 'raster-fade-duration': D.d500, 'raster-opacity-transition': { duration: 0, delay: 0 } } }, 'slot-imagery');
  }
  return lid;
}
let scrubBusy = Promise.resolve();
function buildScrub(mode) { scrubBusy = scrubBusy.then(() => buildScrub0(mode)).catch(() => {}); return scrubBusy; }
async function buildScrub0(mode) {
  if (!scrub) return;
  if (mode === 'aoi' && G.ownImagery) {
    const ids = ['namwon-aoi-2504', 'namwon-aoi-2506', 'namwon-aoi-2508', 'namwon-aoi-2510'];
    const eps = [];
    for (const id of ids) { const l = await epochLayer(id); if (l) { const it = M.items[id]; eps.push({ id, layer: l, label: it.epoch.replace('-', '.'), gsd: `${(it.gsd_m * 100).toFixed(2)} cm`, curve: [14.6, 15.4] }); } }
    const hist = CHANGE.filter((c) => ['2504-2506', '2506-2508', '2508-2510'].includes(c.pair)).map((c, i) => ({ at: i + 0.5, n: env(c.stats.n, 'count', 'measured', 'landxi/assets/data/change.js', c.method), label: `${c.label} · ${c.stats.n}건 · 변화 지수(비지도)` }));
    scrub.build(eps, hist, { initial: state.epoch ?? 0 });
    $('scrub').dataset.mode = 'aoi';
  } else if (mode === 'hls' || mode === 'hls-force') {
    const h = await pickHls({ want: 4 });
    const it = M.items['gibs-hls-s30'];
    if (!it || h.dates.length < 2) { scrub.disable('시점 · 공개 위성 날짜 부족'); return; }
    /* 3차 판정: 공개·게스트 도착 뒤 자동 표시도 하강과 같은 규칙 — 지금 뷰포트 중심 유효 + 화면 커버리지 ≥ 70 % 일 때만.
       미달이면 HLS 층 끔(visible 0) + 결손 칩 · 스크러버는 '시점 · 궤도 밖' 결손 상태 · 사용자가 '그래도 보기'를 누를 때만 표시(hls-force) */
    if (mode === 'hls') {
      // 같은 규칙 두 겹: ① 그 날짜의 하강 경로 판정(M.hlsGate · 칩 'HLS 30m · 궤도 밖 · 화면 n%'와 같은 값) ② 지금 뷰포트 실측(궤도 안 · 구름 아님 ≥ 70 % · 중심 유효)
      const day = M.hlsGate || (M.hlsGateP ? await Promise.race([M.hlsGateP.catch(() => null), sleep(D.d1250).then(() => null)]) : null);
      const g = await hlsViewCoverage(it, h.dates[0], M.A).catch(() => null);
      const dayOk = !!(day && day.ok && day.date === h.dates[0]);
      X.hlsScrubGate = g ? { ...g, view_ok: g.ok, day: { ok: dayOk, min: day?.min ?? null, date: day?.date || null }, ok: g.ok && dayOk } : { ok: false, cov: 0, error: true };
      if (!X.hlsScrubGate.ok) { hlsScrubOff(X.hlsScrubGate); return; }
    }
    X.hlsScrubGate = { ...(X.hlsScrubGate || {}), forced: mode === 'hls-force' };
    const eps = [];
    for (const d of [...h.dates].reverse()) {
      const sid = 'src-hls-' + d, lid = 'img-hls-' + d;
      if (!M.A.getSource(sid)) M.A.addSource(sid, await sourceSpec(it, { date: d }));
      if (!M.A.getLayer(lid)) M.A.addLayer({ id: lid, type: 'raster', source: sid, maxzoom: 13, layout: { visibility: 'none' }, paint: { 'raster-opacity': 0, 'raster-fade-duration': D.d500 } }, 'slot-imagery');
      eps.push({ id: d, layer: lid, label: d.slice(5).replace('-', '.'), gsd: 'HLS 30 m' });
    }
    scrub.build(eps, [], { initial: state.epoch ?? eps.length - 1 });
    $('scrub').dataset.mode = 'hls';
  } else scrub.disable(G.ownImagery ? '시점 · 드론 AOI 로 내려가면 4시점' : '시점 원본 · 로그인 후 열람');
}
/** HLS 시점 층을 모두 끄고(A·B) 스크러버를 결손 상태로 — '그래도 보기'는 사용자가 누를 때만 층을 편다 */
function hlsScrubOff(g) {
  for (const m of [M.A, M.B]) for (const l of m?.getStyle?.()?.layers || []) if (/^img-hls-/.test(l.id)) { m.setLayoutProperty(l.id, 'visibility', 'none'); m.setPaintProperty(l.id, 'raster-opacity', 0); }
  const pct = Math.round(((g?.day && !g.day.ok && g.day.min != null ? g.day.min : g?.cov) || 0) * 100);   // 칩과 같은 수(하강 경로 판정이 미달이면 그 값)
  scrub.disable(g?.error ? '시점 · 공개 위성 판정 실패 · 층 끔' : `시점 · 궤도 밖 · 화면 ${pct}%${g?.cloud >= 0.2 ? ` · 구름 ${Math.round(g.cloud * 100)}%` : ''}${g?.center ? '' : ' · 중심 없음'} · 70% 미만이라 끔`);
  $('scrub').dataset.mode = 'hls-off';
  const v = $('scrub').querySelector('.xi-scrub-void');
  if (v && !g?.error) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'xi-btn xi-btn--br xi-scrub-force'; b.textContent = '그래도 보기 ›';
    b.title = `HLS 30m ${g?.date || ''} · 하루치 궤도 띠라 화면 ${pct}% 만 덮는다`;
    b.addEventListener('click', () => buildScrub('hls-force'));
    v.appendChild(b);
  }
  if (M.ladder) { const ch = currentChip(); hud.chip(ch.text, ch.item); }
}
function mirrorEpoch() {
  if (!sw?.S.on || !scrub?.S.enabled) return;
  for (const ep of scrub.S.epochs) if (M.B.getLayer(ep.layer) && M.A.getLayer(ep.layer)) {
    M.B.setPaintProperty(ep.layer, 'raster-opacity', M.A.getPaintProperty(ep.layer, 'raster-opacity'));
    M.B.setLayoutProperty(ep.layer, 'visibility', M.A.getLayoutProperty(ep.layer, 'visibility') || 'visible');
  }
}
function onEpoch(e, L, a, b) {
  state.epoch = e;
  mirrorEpoch();
  if (M.ladder) { const ch = currentChip(); hud.chip(ch.text, ch.item); }   // 출처 칩은 지금 보이는 시점을 따른다
  if ($('scrub').dataset.mode === 'parcel') {
    // 필지 카드 · 이력과 같은 시간축: 커서 동기 + 카드 시점 라디오(0.5 경계)
    svy?.card?.syncTimeline(e);
    const y = e >= 0.5 ? 2025 : 2023;
    if (svy?.card?.isOpen && !state.cardDrives && svy.card.S.ep !== y) svy.card.setEp(y, { bg: false });
    return;
  }
  if ($('scrub').dataset.mode !== 'aoi') return;
  // 정수 시점 = 변화 pair 경계 → 그 pair 의 윤곽만(A04 · 비지도)
  const k = L.b == null ? L.a : null;
  const pair = k ? CHANGE.find((c) => c.pair === ['', '2504-2506', '2506-2508', '2508-2510'][k]) : null;
  if (M.A.getLayer('r-ch-line')) {
    const f = pair ? ['==', ['get', 'pair'], pair.pair] : ['==', ['get', 'pair'], '__none__'];
    for (const l of ['r-ch-line', 'r-ch-halo']) M.A.setFilter(l, k === 0 ? null : f);
  }
  /* HUD 한 패널 한 출처(1차 판정 must_fix 5): 스크럽 문구는 스크러버 라벨·히스토그램에만. HUD 가 AOI 변화 숫자를 보이는 중일 때만
     큰 숫자까지 그 시점 pair 봉투로 통째 교체(hud.set) — 작업 결과(프레임 분석)·실태조사 숫자가 떠 있으면 HUD 는 건드리지 않는다. */
  if (state.scene === 'aoi' && state.hudCtx === 'aoi' && state.aoiHud) {
    const H0 = state.aoiHud;
    if (pair) hud.set(env(pair.stats.n, 'count', 'inferred', 'landxi/assets/data/change.js', `변화 지수(비지도) · ${pair.label} · 결과 확인 전`), { ...H0.head, unit: '변화 윤곽', provTag: '변화 지수 · 결과 확인 전' }, [`${pair.label} 사이 변화`, '변화 지수(비지도) · 학습 결과 아님']);
    else if (L.b == null && k === 0) hud.set(H0.env, H0.head, H0.note);
  }
}

/* ═══ 8. 스와이프 ═══ */
async function openSwipe(v = 50) {
  if (X.swBusy) return; X.swBusy = true;
  try {
  if (!M.ladderB) {
    M.ladderB = await mountLadder(M.B, Object.values(M.items), { order: Object.keys(M.items), before: 'slot-imagery', dates: M.dates, fade: D.d500 });
    for (const id of [...state.results]) { const l = await addResultSource(M.B, M.items[id]); setVis(M.B, l, true); }
    // 시점 층도 B 에 — 시점 스크럽 중이면 같은 시점
    for (const it of Object.values(M.items)) if (/^namwon-aoi-25(06|08|10)$/.test(it.id) && !M.B.getLayer('img-' + it.id)) { if (!M.B.getSource('src-' + it.id)) M.B.addSource('src-' + it.id, await sourceSpec(it)); M.B.addLayer({ id: 'img-' + it.id, type: 'raster', source: 'src-' + it.id, layout: { visibility: 'none' }, paint: { 'raster-opacity': 0 } }, 'slot-imagery'); }
  } else { for (const id of Object.keys(RESULT_KEYS)) setVis(M.B, layersOf(id), state.results.has(id)); }
  for (const id of state.results) setVis(M.A, layersOf(id), false);
  M.B.jumpTo({ center: M.A.getCenter(), zoom: M.A.getZoom(), pitch: M.A.getPitch(), bearing: M.A.getBearing() });
  const ch = currentChip().text;
  const res = [...state.results].map((id) => M.items[id]?.name.ko.split(' · ')[0]).filter(Boolean);
  mirrorEpoch();
  // 가르기 오른쪽 = 지금 작업의 결과(F1-B §13): 프레임 분석이 끝났으면 그 작업 결과를 B 로 옮겨 오른쪽에만 — 칩도 그 작업
  const jobRight = jobToB(true);
  const jn = TH?.S?.done ? (TH.S.final ?? TH.S.ids?.length ?? 0) : 0;
  await sw.open(v, { left: `<b>원본</b>${ch}`, right: jobRight ? `<b>+ AI 결과</b>이 작업 · ${jn.toLocaleString('ko-KR')}건 · ${state.model || 'aerial25/best'}${state.job ? ` · …${String(state.job).slice(-6)}` : ''}` : `<b>+ AI 결과</b>${res.length ? res.join(' · ') : '결과 없음'}` });
  $('sw-r').dataset.src = jobRight ? 'job' : 'layers';
  $('tool-swipe').setAttribute('aria-pressed', 'true');
  state.swipe = v; setPhase('swipe'); writeUrl();
  } finally { X.swBusy = false; }
}
/** 작업 결과 층(th-res GeoJSON · th-snap PMTiles)을 가르기 B 로(on) / 되돌리기(off). 옮긴 것이 있으면 true */
function jobToB(on) {
  const A = M.A, B = M.B;
  const ids = ['th-snap-fill', 'th-snap-line', 'th-res-fill', 'th-res-line'].filter((l) => A.getLayer(l));
  if (!ids.length || !TH?.S?.done) return false;
  if (on) {
    const st = A.getStyle();
    for (const l of ['th-snap-fill', 'th-snap-line', 'th-res-fill', 'th-res-line']) if (B.getLayer(l)) B.removeLayer(l);
    for (const sid of ['th-snap', 'th-res']) if (B.getSource(sid)) B.removeSource(sid);
    for (const sid of ['th-snap', 'th-res']) if (st.sources[sid]) B.addSource(sid, sid === 'th-res' ? { type: 'geojson', data: TH.S.res } : st.sources[sid]);
    const snapOn = !!TH.S.snap;
    for (const l of st.layers.filter((x) => ids.includes(x.id))) {
      // th-res 는 도착 페이드를 feature-state 로 그렸다 — B 에는 상태가 없으니 최종값으로(스냅샷이 섰으면 th-res 는 0)
      const paint = l.id === 'th-res-fill' ? { ...l.paint, 'fill-opacity': snapOn ? 0 : 0.2 } : l.id === 'th-res-line' ? { ...l.paint, 'line-opacity': snapOn ? 0 : 0.95 } : l.paint;
      if (!B.getLayer(l.id)) B.addLayer({ ...l, paint, layout: { ...(l.layout || {}), visibility: 'visible' } }); else B.setLayoutProperty(l.id, 'visibility', 'visible');
    }
    setVis(A, ids, false);
  } else { setVis(A, ids, true); setVis(B, ids, false); }
  return true;
}
function closeSwipe() {
  jobToB(false);
  sw.close(); for (const id of state.results) setVis(M.A, layersOf(id), true);
  $('tool-swipe').setAttribute('aria-pressed', 'false'); state.swipe = null; writeUrl();
}

/* ═══ 9. 프레임 → 견적 → 실행 ═══ */
let TH = null, JOBH = null;
function topImagery() { const c = M.ladder.chipAt(M.A.getZoom(), M.A.getCenter().toArray()); return c.item || M.items['xdworld-satellite']; }
/** 모델의 학습 GSD 에 가장 가까운 자체 영상(프레임을 덮는 것) — aerial25 → 2023 25cm · 드론 모델 → AOI 1cm */
function imageryFor(model, geom) {
  const b = bboxOf(geom), inside = (it) => it.bounds && b[0] >= it.bounds[0] && b[2] <= it.bounds[2] && b[1] >= it.bounds[1] && b[3] <= it.bounds[3];
  const cands = (M.ladder?.items || []).filter((it) => it.source !== 'external' && it.gsd_m && inside(it));
  const g = model?.gsd_trained_m || 0.25;
  cands.sort((x, y) => Math.abs(Math.log(x.gsd_m / g)) - Math.abs(Math.log(y.gsd_m / g)));
  return cands[0] || topImagery();
}
async function onFrame(geom, modelId) {
  state.frame = geom; writeUrl();
  if (state.suppressQuote) return;   // ?job= 복원: 프레임 선만 긋고 견적 카드는 띄우지 않는다
  if (!MODELS.length) MODELS = await loadModels();
  const model = MODELS.find((m) => m.id === (modelId || state.model || 'aerial25/best')) || MODELS[0];
  const imagery = imageryFor(model, geom);
  const body = { kind: 'infer', model_id: model.id, imagery_id: imagery.id, aoi: geom, options: { chip: 1024, overlap: 0.125, conf: 0.25 }, demo: !!G.demo };
  const q = await quoteJob(body, { imagery, model, role: state.role });
  state.quote = q; setPhase('quote');
  xiEmit('frame', { geom, quote: { area_km2: q.area_km2, shards: q.shards, allowed: q.allowed, via: q._via }, model: model.id, imagery: imagery.id });
  const el = $('quote-card');
  // 자리를 먼저(translate 속성) → 그다음 진입 애니메이션(transform) — 첫 프레임부터 제자리 · 마스트/검색/레일/HUD 교차 0(1차 판정 must_fix 1)
  const b = bboxOf(geom), pr = M.A.project([b[2], b[3]]), pl = M.A.project([b[0], b[3]]), W = window.innerWidth;
  let x = pr.x + 16; if (x + 380 > W - 452) x = pl.x - 16 - 380;
  const spot = () => placeAt(el, x, pr.y, { avoid: [$('hud')], bottom: 112 });
  spot();
  quoteCard(el, { q, models: MODELS, selected: model.id, layerKind: imagery.kind, imagery, demoForced: !!G.demo, canRun: G.run,
    onModel: (id) => { state.model = id; onFrame(geom, id); },
    onRun: (m) => { state.model = m.id; writeUrl(); runFrame(geom, m, imagery, q); },
    onClose: (clear) => { if (clear) { ft.clear(); state.frame = null; writeUrl(); } } });
  spot();   // 내용이 들어간 실제 높이로 한 번 더(같은 프레임 · 칠하기 전)
}
async function runFrame(geom, model, imagery, q) {
  $('quote-card').hidden = true;
  TH && TH.close(); JOBH && JOBH.close();
  clearLocks(); cancelArrive();
  const grid = q._grid || gridFor(bboxOf(geom), imagery.gsd_m || 0.25);
  TH = theater({ A: M.A, stageEl: $('locks'), grid, snapshotLayer: (set) => (/landcover/.test(set) ? 'landcover' : /farmland/.test(set) ? 'namwon_farmland_2025' : 'results') }, { frame: geom, hud, onDone: (d) => jobDone(d), clsLabel: (k) => (k !== '_note' && I18N.cls?.[k]) || k });
  // 끝난 작업의 SSE 는 닫는다(EventSource 자동 재접속 방지 · 계약 §5.1 재생은 24h 서버에 남는다)
  const endEv = (e) => { if (['snapshot', 'job.failed', 'job.cancelled'].includes(e.detail.phase)) { JOBH && JOBH.close(); document.removeEventListener('xi-phase', endEv); } };
  document.addEventListener('xi-phase', endEv);
  X.theater = TH;
  const body = { kind: 'infer', model_id: model.id, imagery_id: imagery.id, aoi: geom, options: { chip: 1024, overlap: 0.125, conf: 0.25 }, demo: !!G.demo, priority: 0 };
  // off 합성: 저장 결과 중 모델에 맞는 것(aerial25/best → P4 · 그 밖 → A02 파일)
  const useP4 = model.id === 'aerial25/best' && M.A.getSource('src-namwon-landcover-2023');
  const synth = () => {
    const jobId = 'job_replay_' + Date.now().toString(36);
    let feats = [];
    if (useP4) {
      const seen = new Set();
      for (const f of M.A.querySourceFeatures('src-namwon-landcover-2023', { sourceLayer: 'landcover' })) {
        const id = f.properties.id; if (seen.has(id)) continue; seen.add(id);
        const bb = bboxOf(f.geometry); const c = [(bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2];
        if (inFrame(geom, c)) feats.push({ type: 'Feature', properties: f.properties, geometry: f.geometry, _c: c });
      }
    } else if (a02) feats = a02.features.map((f) => { const bb = bboxOf(f.geometry); return { ...f, _c: [(bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2] }; }).filter((f) => inFrame(geom, f._c));
    const it = useP4 ? M.items['namwon-landcover-2023'] : M.items['namwon-farmland-2025'];
    return synthReplay({ frame: geom, grid, features: feats, jobId, resultSet: it ? it.set : 'results/lx/namwon-farmland-2025', snapshotUrl: it ? `pmtiles:///landxi/data/${it.path}` : null });
  };
  if (!useP4) await loadA02();
  // 운봉 시연 AOI 와 같은 프레임이면 저장 리플레이 파일(data/replay/j1-hwangdeung.ndjson) 을 그대로
  const b = bboxOf(geom), RB = [127.52, 35.425, 127.545, 35.443];
  const replayUrl = !useP4 && Math.abs(b[0] - RB[0]) + Math.abs(b[1] - RB[1]) + Math.abs(b[2] - RB[2]) + Math.abs(b[3] - RB[3]) < 0.004 ? 'data/replay/j1-hwangdeung.ndjson' : null;
  setPhase('job-submit');
  hud.pending({ scene: '프레임 분석', title: `${model.id} × ${chipText(imagery)}`, unit: '건', pending: API.mode === 'on' ? '제출 · SSE 연결' : '예시 · 저장 결과 재생' });
  xiEmit('job', { phase: 'submit', kind: 'infer', model: model.id, imagery: imagery.id });
  JOBH = await runJob(body, { onEvent: (name, d, o) => { if (['job.started', 'job.done', 'job.failed', 'snapshot.ready'].includes(name)) xiEmit('job', { phase: name, job_id: d?.job_id, live: o?.live }); return TH.on(name, d, o); },
    onSubmitted: (j) => { if (!j) return; const opsA = $('mast-ops'); if (opsA && j.id) opsA.href = 'http://localhost:8702/landxi/ops/infra.html?job=' + encodeURIComponent(j.id); hud.jobState(`접수 · ${String(j.id || '').slice(-6)} · ${j.state === 'running' ? '실행 중' : '큐 대기'} · ${j.pool || ''}${j.shards_total ? ' · shard ' + j.shards_total : ''}`, { live: true }); hud.status('접수됨 · 큐 순번·워커 배정 대기', 'pending'); },
    onState: (s) => { if (s === 'worker_unavailable') { $('mast-mode').textContent = mastLabel(state.locale) || '예시 · 저장 결과 재생'; toast('워커 없음 → 저장 결과 재생으로 전환', { basis: 'demo' }); } }, synth, replayUrl });
  if (useP4) setResult('namwon-landcover-2023', false);   // 칸마다 다시 도착하는 것이 보이도록(합성 뒤 · 스냅샷이 같은 층으로 돌아온다)
  state.job = JOBH.job?.id || null;
  $('mast-mode').textContent = mastLabel(state.locale);
  state.hudCtx = 'job';
  writeUrl();
}
/** job.done 뒤 — 게이트웨이 GET /jobs/{id} 로 이 작업의 계량을 다시 읽어 HUD 두 줄을 서버 값으로 맞춘다(결과 문서 표 · SSE 값과 대조) */
async function jobDone(d) {
  mark('job-done');
  X.jobDone = d;
  const id = d?.job_id || state.job;
  if (API.mode !== 'on' || !id || /^job_replay/.test(id)) return;
  try {
    const j = await api('/jobs/' + encodeURIComponent(id));
    X.jobApi = { id: j.id, gpu_s: j.gpu_s, elapsed_s: j.elapsed_s ?? null, chips_per_gpu_s: j.chips_per_gpu_s ?? null, chips_per_wall_s: j.chips_per_wall_s ?? null, shards_total: j.shards_total, created_at: j.created_at, started_at: j.started_at, finished_at: j.finished_at, sse: { gpu_s: d.gpu_s, elapsed_s: d.elapsed_s, chips_per_gpu_s: d.chips_per_gpu_s, chips_per_wall_s: d.chips_per_wall_s } };
    const gs = j.gpu_s?.value != null ? j.gpu_s : d.gpu_s;
    const es = d.elapsed_s ?? (j.elapsed_s?.value ?? j.elapsed_s ?? null);
    if (d.counts_env) hud.jobFinal(d.counts_env, { shardSum: TH?.S?.nSum || 0, shardsDone: j.shards_done, shardsTotal: j.shards_total, live: true, gpuS: gs, elapsedS: es, perGpu: j.chips_per_gpu_s ?? d.chips_per_gpu_s, perWall: j.chips_per_wall_s ?? d.chips_per_wall_s, via: 'GET /jobs/{id}' });
    if (j.recovered?.chip) hud.jobNote(`${j.recovered.chip} · GET /jobs/{id}.recovered`);
    X.jobApi.hud = hud.perf && Object.fromEntries(Object.entries(hud.perf).map(([k, v]) => [k, v && typeof v === 'object' ? { value: v.value, source: v.source, basis: v.basis } : v]));
  } catch (e) { X.jobApiErr = e.code; }
}

/* ═══ 10. 부팅 ═══ */
/** 외부 타일 방패(sw.js) — 제3자 타일 서버의 5xx/CORS 오류를 투명 타일로 받아 콘솔 오류 0 · 결손 수는 계기에 정직하게 */
async function shield() {
  X.tileMiss = 0;
  if (!('serviceWorker' in navigator)) return 'none';
  try {
    navigator.serviceWorker.addEventListener('message', (e) => { if (e.data?.type === 'lx-tile-miss') { X.tileMiss = e.data.failed; const g = $('gauge-miss'); if (g) { g.hidden = false; g.textContent = `외부 타일 누락 ${e.data.failed} · 투명 대체`; } } });
    await navigator.serviceWorker.register('sw.js', { scope: './' });
    if (!navigator.serviceWorker.controller) await Promise.race([new Promise((r) => navigator.serviceWorker.addEventListener('controllerchange', r, { once: true })), new Promise((r) => setTimeout(r, 1500))]);
    return navigator.serviceWorker.controller ? 'on' : 'pending';
  } catch { return 'error'; }
}
let MODELS = [], I18N = {};
async function boot() {
  perf = createPerf(); perf.start(); X.perf = perf;
  hud = createHud();
  const [sh] = await Promise.all([shield(), probe()]);
  X.shield = sh;
  // 서비스 워커가 이 창을 아직(또는 아예) 제어하지 않으면 외부 타일은 Worker fetch 방패로(콘솔 오류 0 · 결손은 계기에 정직하게)
  X.extMode = setExtMode(sh === 'on' ? 'sw' : 'worker'); X.extMiss = EXT_MISS;
  EXT_MISS.onMiss = (m) => { X.tileMiss = m.n; const g = $('gauge-miss'); if (g) { g.hidden = false; g.textContent = `외부 타일 누락 ${m.n} · 투명 대체`; g.title = `${m.last?.host || ''} ${m.last?.status || ''} · Worker 방패(서비스 워커 없음)`; } };
  state.mode = API.mode;
  const data = await loadData();
  X.data = data;
  document.documentElement.dataset.role = state.role;
  document.documentElement.dataset.mode = state.mode;
  document.documentElement.dataset.build = state.build;
  if (state.embed) document.documentElement.dataset.embed = '1';
  // 마스트(문자열 = data/i18n-ko.json)
  I18N = (await fixture('data/i18n-ko.json')) || {};
  $('mast-role').textContent = (I18N.role?.[state.role] || ROLE_KO[state.role]) + (state.public ? I18N.mast?.public_view ?? ' · 공개 보기' : '');
  const ml = mastLabel(state.locale);
  $('mast-mode').textContent = state.public || state.role === 'guest' ? `${I18N.mast?.public || '공개 · 위성 + AI 결과'}${ml ? ' · ' + ml : ''}` : ml;
  $('mast-mode').dataset.on = $('mast-mode').textContent ? '1' : '0';
  // 관문 — 없는 동사는 DOM 에서 숨긴다(비활성 아님)
  document.querySelectorAll('[data-gate]').forEach((b) => { b.hidden = !G[b.dataset.gate]; });
  document.documentElement.dataset.verbs = G.verbs.join(' ');
  await buildMaps(data);
  // 층 · UI
  scrub = timescrub($('scrub'), { map: M.A, onChange: onEpoch, onUrl: () => writeUrl(), onStop: (k) => setPhase('stop', { k }) });
  X.scrub = scrub;
  scrub.disable('시점 · 이동 뒤 열림');
  sw = swipeFx({ A: M.A, B: M.B, wrap: $('map-b'), handle: $('grip'), chipL: $('sw-l'), chipR: $('sw-r'), onUrl: (v) => { state.swipe = v; writeUrl(); } });
  X.swipe = sw;
  const emdGeo = await fixture('/landxi/assets/data/geo/namwon-emd.geojson');
  emdFeatures = (emdGeo?.features || []).map((f) => ({ nm: f.properties.nm, cd: f.properties.cd, geometry: f.geometry, bbox: bboxOf(f.geometry) }));
  const emdAt = (ll) => emdFeatures.find((f) => { const r = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates; return r.some((p) => inFrame({ type: 'Polygon', coordinates: p }, ll)); });
  AOI_EMD = emdAt([(A01[0] + A01[2]) / 2, (A01[1] + A01[3]) / 2])?.nm || AOI_EMD;   // A01 중심이 든 읍면동(실측 경계)
  X.aoiEmd = AOI_EMD;
  ecard = emdCard($('emd-card'), { A: M.A, canFrame: G.frame, toAoi, openDrawer: (k, q) => { if (G.drawer) { dr.open(k, q); state.drawer = k; } },
    frameEmd: (name) => { const f = emdFeatures.find((e) => e.nm === name); if (f) ft.set(f.geometry.type === 'Polygon' ? f.geometry : { type: 'Polygon', coordinates: f.geometry.coordinates[0] }); } });
  dr = drawer($('drawer'), { onUrl: () => { state.drawer = dr.S.kind; writeUrl(); }, onClose: () => { if (ex?.S.pendingFly) ex.fly(); xiEmit('drawer', { kind: 'report', open: false }); },
    // 보고서 '초안 작성' 탭 — F2-E 가 XI.provide('report-draft') 로 맡으면 그쪽 · 아니면 F2-A 규칙 초안(F2-S docx 또는 브라우저 조립 docx)
    onDraft: (slot, q) => { xiEmit('drawer', { kind: 'report', tab: 'draft', open: true, ...q }); const p = XI.provider('report-draft'); if (p) { try { if (p(slot, q) !== false) { slot.dataset.by = 'provider'; return; } } catch (e) { console.warn('[XI] report-draft provider', e); } } slot.dataset.by = 'f2a'; import('./survey/report-draft.js').then((m) => m.renderDraft(slot, q)); } });
  // 3차 판정: 보고서/통계 서랍(#drawer)은 HUD 아래(--dr-top)에서 시작 · 폭 ≤ 600(1280 = 520) — HUD · 필지 카드 교차 0.
  //   열림/닫힘을 'xi:rdrawer' 로 알린다 → 필지 카드 v2 는 요약(머리 + 버튼)으로 서랍 왼쪽에, 의심 큐 서랍/레일은 초안 동안 비킨다(:root[data-rdrawer])
  { const drEl = $('drawer'), root = document.documentElement; let was = false;
    const drTop = () => { const h = $('hud')?.getBoundingClientRect(); root.style.setProperty('--dr-top', Math.round((h && h.height ? h.bottom : 200) + 8) + 'px'); };
    const sync = () => { const on = !drEl.hidden && !!dr?.S.kind; if (on) drTop(); if (on === was) return; was = on; if (on) root.dataset.rdrawer = '1'; else delete root.dataset.rdrawer; dispatchEvent(new CustomEvent('xi:rdrawer', { detail: { open: on, kind: dr?.S.kind || null } })); };
    new MutationObserver(sync).observe(drEl, { attributes: true, attributeFilter: ['hidden', 'data-kind'] });
    if (window.ResizeObserver && $('hud')) new ResizeObserver(() => { if (was) drTop(); }).observe($('hud'));
    addEventListener('resize', () => { if (was) drTop(); });
    // 초안이 열릴 때 락온한 필지가 서랍 밑에 들어가면 카메라를 1000 으로 옮겨 빈 곳(카드 요약 · 서랍 · HUD 밖)에 둔다
    addEventListener('xi:rdrawer', (e) => { if (!e.detail.open || !root.dataset.pcard) return; requestAnimationFrame(() => requestAnimationFrame(() => {
      const lk = document.querySelector('#locks .xi-lock'); if (!lk) return;
      const r = lk.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, cs = getComputedStyle(drEl), dl = innerWidth - (parseFloat(cs.right) || 16) - (parseFloat(cs.width) || 600);
      if (r.right < dl - 8) return;
      const rect = (el) => { const b = el?.getBoundingClientRect(); return b && b.width ? { l: b.left - 16, t: b.top - 16, r: b.right + 16, b: b.bottom + 16 } : null; };
      const avoid = [rect($('pcard2')), rect($('hud')), rect($('mast')), { l: dl - 16, t: 0, r: innerWidth, b: innerHeight }].filter(Boolean);
      const spot = freeSpot(avoid), c = M.A.unproject([innerWidth / 2 + (cx - spot.x), innerHeight / 2 + (cy - spot.y)]);
      flyLadder([M.A, M.B], { center: [c.lng, c.lat], zoom: M.A.getZoom(), pitch: M.A.getPitch(), bearing: M.A.getBearing() }, { duration: D.d1000 });
    })); }); }
  const aoiEpochs = [], cityEpochs = [];
  for (const id of ['namwon-aoi-2504', 'namwon-aoi-2506', 'namwon-aoi-2508', 'namwon-aoi-2510']) { const it = M.items[id]; if (it) aoiEpochs.push({ id, url: (await tileUrl(it)).url?.replace('pmtiles://', ''), label: it.epoch.replace('-', '.'), gsd: `${(it.gsd_m * 100).toFixed(2)} cm`, maxZ: 19 }); }
  for (const id of ['namwon-city-2504', 'namwon-city-2510']) { const it = M.items[id]; if (it) cityEpochs.push({ id, url: (await tileUrl(it)).url?.replace('pmtiles://', ''), label: it.epoch.replace('-', '.'), gsd: '2 m', maxZ: 17 }); }
  pcard = parcelCard($('parcel-card'), { A: M.A, stageEl: $('locks'), aoiBounds: A01, aoiEpochs, cityEpochs, canFeedback: G.feedback, parcelLookup: M.items['parcels-namwon'] ? parcelLookup : null,
    feedback: async (b) => { if (API.mode === 'on') { try { await api('/feedback', { method: 'POST', body: { set: 'results/lx/namwon-farmland-2025', kind: 'fp', note: '', ...b } }); toast('오류 신고 접수'); } catch (e) { toast('신고 실패 · ' + (e.code || '')); } } else toast('오류 신고 · 저장 안 됨(서버 연결 없음)', { basis: 'demo' }); },
    onClose: () => { state.card = null; writeUrl(); } });
  ft = G.frame ? frameTool({ A: M.A, dimEl: $('dim') }, { onFrame, emdGeometry: async (ll) => { const f = emdAt([ll.lng, ll.lat]); return f ? (f.geometry.type === 'Polygon' ? f.geometry : { type: 'Polygon', coordinates: f.geometry.coordinates[0] }) : null; } }) : null;
  X.frame = ft;
  if (M.items['namwon-greenhouse-2025'] && G.extrude) ex = extrudeFx({ A: M.A, onHover: (f, ll) => tip(f, ll) }, { item: M.items['namwon-greenhouse-2025'], terrain: M.items['terrain-namwon'], maxPitch: 60 });
  const st = G.ownImagery ? await emdStats() : null;
  if (st) fil = filament(M.A, $('stage'), { points: emdFeatures.map((f) => ({ lngLat: [(f.bbox[0] + f.bbox[2]) / 2, (f.bbox[1] + f.bbox[3]) / 2], v: st.by?.[f.nm]?.['경작지']?.area_ha || 0 })), valueKey: 'v' }), fil.set(false);
  panel = layersPanel($('panel'), {
    catalog: data.cat, deploys: data.dps, state, get ladder() { return M.ladder; }, dates: M.dates, parcels: !!state.parcels, maxPitch: 60, roleGates: G,
    toggleResult: (id) => { if (state.swipe != null) closeSwipe(); setResult(id, !state.results.has(id)); },
    toggleRef: (k) => { if (k === 'emd') { state.emd = !state.emd; setVis(M.A, ['ref-emd-line', 'ref-emd-fill'], state.emd); } if (k === 'filament' && fil) { state.filament = !state.filament; fil.set(state.filament); } if (k === 'parcels') { state.parcelsOn = !state.parcelsOn; setVis(M.A, ['ref-parcel-fill', 'ref-parcel-line'], state.parcelsOn); } },
    setExtrude: (on) => setExtrude(on),
    emdStats, parcelRows: async () => (await loadA02()).features.map((f) => ({ id: f.properties.id, pnu: f.properties.pnu, cls: f.properties.cls, area: f.properties.area, conf: f.properties.conf, emd: f.properties.emd })),
    parcelGeoJSON: () => loadA02(),
    hoverParcel: (fid, from) => { if (!M.A.getSource('src-namwon-farmland-2025')) return; if (X.hovP) M.A.setFeatureState(X.hovP, { hover: false }); X.hovP = fid ? { source: 'src-namwon-farmland-2025', sourceLayer: 'namwon_farmland_2025', id: fid } : null; if (X.hovP) M.A.setFeatureState(X.hovP, { hover: true }); },
    focusParcel: async (fid) => { const f = (await loadA02()).features.find((x) => x.properties.id === fid); if (!f) return; const b = bboxOf(f.geometry); setResult('namwon-farmland-2025', true); await flyLadder([M.A, M.B], { center: [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2], zoom: 17.2, pitch: M.A.getPitch() }, { duration: D.d1250 }); openParcel(f); },
    exportAllowed: (kind) => {
      if (state.public || !G.export) return { ok: false, why: state.public ? '공개 보기 · 내보내기 비활성' : '이 역할은 내보내기 없음' };
      const it = kind === 'parcel' ? M.items['namwon-farmland-2025'] : M.items['namwon-landcover-2023'];
      if (!it || it.export_policy === 'never') return { ok: false, why: 'export_policy never' };
      if (state.role === 'agency' && it.export_policy !== 'tenant' && it.export_policy !== 'public') return { ok: false, why: 'export_policy 불허' };
      return { ok: true, why: `export_policy ${it.export_policy} · CSV BOM` };
    },
    onUrl: () => writeUrl(),
  });
  X.panel = panel;
  X.search = search($('search'), { emd: emdFeatures, onPick: (f) => flyLadder([M.A, M.B], { ...M.A.cameraForBounds([[f.bbox[0], f.bbox[1]], [f.bbox[2], f.bbox[3]]], { padding: 120, maxZoom: 17 }), pitch: M.A.getPitch() }, { duration: D.d1600 }) });
  // 실태조사 모드(기관·직원·영업) — 게스트/공개 보기는 만들지 않는다(모드·층·API 요청 0)
  const ap25 = M.items['ap25-namwon-2023'];
  const ap25Ep = ap25 ? { id: 'ap25-namwon-2023', url: (await tileUrl(ap25)).url?.replace('pmtiles://', ''), label: '2023', gsd: '25cm', maxZ: ap25.maxzoom ?? 18, year: 2023, date: '2023' } : null;
  PARCEL_EPOCHS.city = [ap25Ep && { ...ap25Ep, name: '2023 25cm 항공(촬영월 미상)' }, ...cityEpochs.map((e) => ({ ...e, year: 2025, date: e.id.endsWith('2504') ? '2025-04' : '2025-10', name: `A03 남원 전역 드론 2m · ${e.label}` }))].filter(Boolean);
  PARCEL_EPOCHS.aoi = [ap25Ep && { ...ap25Ep, name: '2023 25cm 항공(촬영월 미상)' }, ...aoiEpochs.map((e) => ({ ...e, year: 2025, date: '20' + e.id.slice(-4, -2) + '-' + e.id.slice(-2), name: `A01 LX 드론 ${e.gsd} · ${e.label}` }))].filter(Boolean);
  if (G.ownImagery && !state.public) {
    const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'survey/survey.css'; document.head.appendChild(css);
    const { createSurvey } = await SURVEY();
    svy = createSurvey(surveyCtx());
    X.svy = svy;
    await svy.setup();
  }
  wire(emdAt);
  // 계기
  M.A.on('move', onCamera); M.A.on('ladder:gate', onCamera); onCamera();   // 받침 게이트가 다 들어오면 출처 칩도 V-World 로
  M.A.on('moveend', () => { if (!['boot', 'intro'].includes(state.scene)) writeUrl(); });
  watchStage(M.A, (s) => { state.stage = s; document.documentElement.dataset.stage = s.stage; });
  // 티어: 부팅 창(첫 60프레임)은 '부팅 계측'으로 기록만 · 판정은 첫 idle 뒤 60프레임 + 재판정 2회 · 표기는 최근 창 p95(2차 판정)
  hud.tierPending?.();
  $('gpu').textContent = gpuShort(gpuInfo().renderer);
  judgeTier(perf, { idle: idle(M.A, 6000), onUpdate: (t) => { const ch = tierInfo?.tier !== t.tier; tierInfo = t; X.tier = t; (X.tierLog ||= []).push({ why: t.why, tier: t.tier, p95: +(+t.p95).toFixed(1), at: Math.round(performance.now()) }); hud.tier(t); if (ch) M.A.setMaxPitch(t.maxPitch); } });
  // 브리지(window.XI) · 마운트 지점 · ⌘K — 다른 에픽(F2-E 에이전트 · F2-C · F2-D)이 이 문으로만 지도에 닿는다
  installBridge(bridgeImpl());
  X.XI = XI;
  window.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      if (XI.listeners('cmdk')) xiEmit('cmdk', { view: viewOf() });
      else { $('search').querySelector('input')?.focus(); toast('명령 바 · 에이전트 연결 없음 → 장소 검색', { basis: 'demo', ms: D.d2400 }); }
    }
  });
  placeAgentSlot();
  new ResizeObserver(placeAgentSlot).observe($('hud'));
  // 에이전트 패널(F2-E) — 서비스 워커와 분리(2차 판정): 모듈 존재 표(data/modules.json · build-modules.mjs)가 있다고 할 때만 import.
  //   SW 가 제어 중이면 표와 무관하게 import(파일이 없어도 sw.js 가 빈 모듈 · 404 0). 게스트·공개는 부르지 않는다(요청 0).
  X.agentP = mountAgent();
  // 계보 칩 · 기관 스트림(deploy.changed · finding.state)
  if (!state.public && state.role !== 'guest') watchDeploy();
  // 준비 신호: 첫 idle 뒤
  await idle(M.A, 6000);
  if (state.cam0) openCanvas();
  document.documentElement.dataset.lx = 'ready'; mark('ready');
  // 관문(shell-gate)이 막힌 화면에서 돌려보냈다면(?denied=<file>) 안내 한 줄 — F2-R 레일 규약
  if (Q.get('denied')) {
    const f = Q.get('denied').split('?')[0];
    const NAME = { 'dashboard.html': '대시보드', 'admin-home.html': '운영 현황', 'dataset.html': '데이터 관리', 'publish.html': '서비스 공개 관리', 'produce.html': '생산 관리', 'ai-project.html': '프로젝트', 'analysis-ai.html': '분석' };
    const who = { sales: '영업 계정', guest: '게스트', agency: '기관 계정', staff: 'LX 직원 계정', admin: '관리자 계정' }[state.role] || '이 계정';
    const nm = NAME[f] || f, jc = nm.charCodeAt(nm.length - 1), bat = jc >= 0xAC00 && jc <= 0xD7A3 && (jc - 0xAC00) % 28 > 0;
    toast(`${who}은 ${nm}${bat ? '을' : '를'} 볼 수 없어 XI맵으로 왔습니다`, { ms: D.d2400 * 3 });
    X.denied = f;
  }
  await restoreOrIntro();
}

async function mountAgent() {
  if (state.public || state.role === 'guest') { X.agent = 'skipped'; return X.agent; }
  const man = await fixture('data/modules.json');
  const it = (man?.items || []).find((i) => i.id === 'agent');
  X.modules = man ? { built_at: man.built_at, agent: it || null } : null;
  const sw = !!navigator.serviceWorker?.controller;
  if (!sw && !it?.present) { X.agent = 'absent'; return X.agent; }   // 표에 없음 · SW 없음 → 요청하지 않는다
  try { const m = await import('../agent/panel.js'); X.agent = m.missing ? 'missing' : 'mounted'; await m.mount?.(XI); }
  catch (e) { X.agent = 'error'; console.warn('[XI] agent mount', e?.message || e); }
  return X.agent;
}

/* ═══ 10b. 실태조사 · 브리지 · 계보 ═══ */
const PARCEL_EPOCHS = { city: [], aoi: [] };
const inAoiBox = (b) => !!b && b[0] >= A01[0] - 0.0005 && b[2] <= A01[2] + 0.0005 && b[1] >= A01[1] - 0.0005 && b[3] <= A01[3] + 0.0005;
function placeAgentSlot() { const r = $('hud').getBoundingClientRect(); document.documentElement.style.setProperty('--agent-top', Math.round(r.bottom + 8) + 'px'); svy?.placeDrawer?.(); }
function surveyCtx() {
  return {
    A: M.A, hud, $, role: state.role, emdFeatures, isPublic: state.public, canExport: !!G.export, showSwitch: true,
    flyTo: (cam, ms = D.d1600) => flyLadder([M.A, M.B], cam, { duration: ms }),
    flyToParcel: (ll, o) => flyToParcel(ll, o),
    flyToPnu: async (pnu) => { /* 좌표 없는 필지(의심 아님) — 현재 화면 유지 */ },
    cancelArrive: () => cancelArrive(),
    waitTiles: () => idle(M.A, D.d1600),
    inAoi: inAoiBox,
    cropEpochs: (b) => (inAoiBox(b) ? PARCEL_EPOCHS.aoi : PARCEL_EPOCHS.city),
    parcelEpochs: (b) => (inAoiBox(b) ? PARCEL_EPOCHS.aoi : PARCEL_EPOCHS.city).map((e, i) => ({ i, id: e.id, date: e.date, label: e.label, gsd: e.gsd, name: e.name })),
    parcelEpoch: (y) => parcelEpoch(y), scrubTo: (i) => tweenScrub(i), scrubE: () => scrub?.S.e ?? 0,
    parcelTimeline: async (on, eps) => { if (on && eps?.length) await buildParcelScrub(eps); },
    onCard: (d) => { state.pnu = d.facts.pnu; state.card = null; state.cardBox = d.bbox; writeUrl(); },
    onCardClose: () => { state.pnu = null; state.finding = null; restoreScrub(); writeUrl(); },
    panelSurvey: (render) => panel.showSurvey(render),
    onMode: (m) => { state.xmode = m; if (m === 'read') { panel.hideSurvey(); restoreCityHud(); } writeUrl(); },
    onSurveyJob: (j) => { state.surveyJob = j.id; const a = $('mast-ops'); if (a) a.href = 'http://localhost:8702/landxi/ops/infra.html?job=' + encodeURIComponent(j.id); },
    onSurveyResult: () => { state.hudCtx = 'survey'; placeAgentSlot(); },
    masthead: (t) => { const el = $('mast-mode'); el.textContent = t == null ? mastLabel(state.locale) : t; el.dataset.on = el.textContent ? '1' : '0'; },
    deploy: () => LIN.cur ? { id: LIN.cur.deploy_id, version: LIN.cur.version } : { id: 'dp-nw-farm-25', version: '' },
    openReport: (q) => { if (!G.drawer) { toast('보고서 서랍 · 이 역할 없음'); return; } dr.open('report', { tab: 'draft', ...q }); state.drawer = 'report'; },
    toast: (m, b) => toast(m, b ? { basis: b } : {}),
    emit: (e, d) => xiEmit(e, d),
    writeUrl: (x) => { if (x?.finding) state.finding = x.finding; writeUrl(); },
    get panel() { return panel; },
  };
}
/** 필지로 카메라 1600 z17 — 카드(계획 자리)·서랍/레일·HUD·크롬이 가리지 않는 가장 넓은 빈 곳(24px 격자 · 장애물까지 최소 거리 최대)에 필지를 둔다 */
function freeSpot(avoid = []) {
  const W = innerWidth, H = innerHeight;
  let best = { x: W * 0.3, y: H * 0.5, d: -1 };
  for (let y = 40; y <= H - 40; y += 24) for (let x = 100; x <= W - 40; x += 24) {
    let d = Math.min(x - 88, W - 16 - x, y - 16, H - 16 - y);
    for (const o of avoid) { const dx = Math.max(o.l - x, 0, x - o.r), dy = Math.max(o.t - y, 0, y - o.b); d = Math.min(d, dx === 0 && dy === 0 ? -1 : Math.hypot(dx, dy)); if (d < best.d) break; }
    if (d > best.d) best = { x, y, d };
  }
  return best;
}
function flyToParcel([lng, lat], { avoid, zoom = 17.2 } = {}) {
  const W = innerWidth, H = innerHeight;
  const spot = freeSpot(avoid || svy?.avoidFor?.() || []);
  X.parcelSpot = spot;
  const mpp = (40075016.7 * Math.cos((lat * Math.PI) / 180)) / (512 * 2 ** zoom), pitch = Math.min(35, M.A.getMaxPitch());
  // 기울기 35 에서 화면 y 차이는 지면 거리로 1/cos(pitch) 만큼 길다 — 근사
  const dLng = ((W / 2 - spot.x) * mpp) / (111320 * Math.cos((lat * Math.PI) / 180));
  const dLat = -((H / 2 - spot.y) * mpp / Math.cos((pitch * Math.PI) / 180)) / 110540;
  return flyLadder([M.A, M.B], { center: [lng + dLng, lat + dLat], zoom, pitch, bearing: 0 }, { duration: D.d1600 });
}
/* 필지 시점 스크러버(카드 · 이력과 같은 축) — 전용 층 sv-ep-* 를 사다리 위에 두고 timescrub 이 섞는다(사다리는 건드리지 않음) */
let prevScrubMode = null;
async function buildParcelScrub(eps) {
  if (!eps?.length || !scrub) return;
  if ($('scrub').dataset.mode !== 'parcel') prevScrubMode = $('scrub').dataset.mode || 'none';
  const out = [];
  for (const e of eps) {
    const it = M.items[e.id]; if (!it) continue;
    const lid = 'sv-ep-' + e.id, sid = 'src-sv-ep-' + e.id;
    if (!M.A.getSource(sid)) M.A.addSource(sid, await sourceSpec(it));
    if (!M.A.getLayer(lid)) M.A.addLayer({ id: lid, type: 'raster', source: sid, layout: { visibility: 'none' }, paint: { 'raster-opacity': 0, 'raster-fade-duration': D.d500, 'raster-opacity-transition': { duration: 0, delay: 0 } } }, 'slot-imagery');
    out.push({ id: e.id, layer: lid, label: e.label, gsd: e.gsd, date: e.date });
  }
  scrub.build(out, [], { initial: 0 });
  $('scrub').dataset.mode = 'parcel';
  X.parcelScrub = out.map((e) => e.id);
}
function restoreScrub() {
  if ($('scrub').dataset.mode !== 'parcel') return;
  for (const ep of scrub.S.epochs) if (M.A.getLayer(ep.layer)) M.A.setLayoutProperty(ep.layer, 'visibility', 'none');
  const m = prevScrubMode || 'none'; prevScrubMode = null;
  buildScrub(m === 'aoi' ? 'aoi' : m === 'hls' ? 'hls' : 'none');
}
/** 스크러버 값을 500 으로 옮긴다(카드 시점 라디오 · 이력 영상 마커) */
function tweenScrub(to) {
  if (!scrub?.S.enabled) return Promise.resolve();
  const from = scrub.S.e, t0 = performance.now();
  if (RM()) { scrub.set(to); return Promise.resolve(); }
  return new Promise((res) => { const f = (now) => { const x = Math.min(1, (now - t0) / D.d500), k = 1 - Math.pow(1 - x, 3); scrub.set(from + (to - from) * k, { url: false }); if (x < 1) requestAnimationFrame(f); else { scrub.set(to); res(); } }; requestAnimationFrame(f); });
}
/** 카드 시점 라디오 → 배경 시점(필지 스크러버가 아직 없으면 그 필지 시점으로 짓고) 500 으로 옮긴다 */
async function parcelEpoch(y) {
  state.cardDrives = true;   // 카드가 스크러버를 움직이는 동안은 스크러버 → 카드 라디오 동기를 멈춘다(깜빡임 0)
  if ($('scrub').dataset.mode !== 'parcel') await buildParcelScrub((inAoiBox(state.cardBox) ? PARCEL_EPOCHS.aoi : PARCEL_EPOCHS.city).map((e, i) => ({ i, ...e })));
  if (!scrub.S.epochs.length) { state.cardDrives = false; return; }
  await tweenScrub(y === 2023 ? 0 : scrub.S.epochs.length - 1);
  state.cardDrives = false;
}
function restoreCityHud() {
  const ch = cityHead(); if (!ch) return;
  hud.count(resEnv(ch.item), ch.head, [], { waitNote: false }).catch(() => {});
  hud.jobClear(); state.hudCtx = 'city';
}
/* 계보 칩: GET /deploys/{id} + /registry/lineage/{id}(모델) · tenant 스트림 deploy.changed(실시간 · v1.1-16) · 없으면 10s 폴링(표기) · off = 픽스처 */
const LIN = { cur: null, via: null, t: 0, log: [] };
async function lineageOf(id) {
  const [d, l] = await Promise.all([api('/deploys/' + encodeURIComponent(id)), api('/registry/lineage/' + encodeURIComponent(id)).catch(() => null)]);
  const model = d.model_override || (l?.chain || []).find((n) => n.kind === 'model')?.id || null;
  return { deploy_id: d.id, version: d.version, model, stage: d.stage, card_id: d.card_id || null, updated_at: d.updated_at, source: `GET /deploys/${id} · /registry/lineage`, basis: 'measured' };
}
async function watchDeploy() {
  const id = state.deployQ || state.svc || 'dp-nw-farm-25';
  const show = (o, flash = false) => { LIN.cur = o; hud.lineage({ ...o, via: LIN.via, flash }); X.lineage = { ...o, via: LIN.via }; };
  if (API.mode !== 'on' || !session.get()?.token) {
    const d = X.data?.dps?.find((x) => x.id === id);
    LIN.via = '픽스처 · 서버 없음';
    if (d) show({ deploy_id: d.id, version: d.version, model: d.model_override || null, source: 'data/deploys-fixture.json', basis: 'demo' });
    return;
  }
  try { LIN.via = '연결 중'; show(await lineageOf(id)); } catch { LIN.via = '불러오지 못함'; hud.lineage({ deploy_id: id, version: '—', model: '', via: LIN.via }); }
  const refresh = async (why, at = null) => {
    try {
      const o = await lineageOf(id); const changed = o.version !== LIN.cur?.version;
      if (changed) { const lag = at ? Date.now() - Date.parse(at) : null; LIN.log.push({ from: LIN.cur?.version, to: o.version, why, lag_ms: lag, at: new Date().toISOString() }); show({ ...o, changed_at: new Date().toISOString() }, true); toast(`${o.deploy_id} ${LIN.log.at(-1).from} → ${o.version}${lag != null ? ` · ${lag} ms 반영` : ''} · ${why}`); xiEmit('deploy', { deploy_id: o.deploy_id, version: o.version, model: o.model, via: why, lag_ms: lag }); }
    } catch { /* 다음 번에 */ }
  };
  const { tenantStream, ingestFindingState, SV } = await SAPI();
  const es = await tenantStream((name, d) => {
    if (name === 'deploy.changed' && (!d?.deploy_id || d.deploy_id === id || d.id === id)) refresh('실시간 · deploy.changed', d?.at);
    if (name === 'finding.state') ingestFindingState(d, 'stream');
    if (name === 'job.state') xiEmit('job', { phase: 'state', ...d });
  });
  if (es) { LIN.via = '실시간'; X.tenantStream = 'on'; }
  // LX 세션(직원·영업)의 tenant 스트림은 자기(lx) 기관 것 — 기관 배포본(dp-nw-farm-25 = namwon)의 deploy.changed 는 오지 않는다 → 10 s 폴링을 함께
  if (es && session.get()?.realm !== 'tenant') { clearInterval(LIN.t); LIN.t = setInterval(() => refresh('폴링 10s · LX 세션은 기관 스트림 밖'), 10000); }
  else { LIN.via = '폴링 10s'; X.tenantStream = SV.stream; clearInterval(LIN.t); LIN.t = setInterval(() => refresh('폴링 10s'), 10000); }
  if (LIN.cur) show(LIN.cur);
}
/* 브리지 구현(window.XI · bridge.js 표) */
let tempN = 0;
function bridgeImpl() {
  const ms = (x) => ([D.d1000, D.d1250, D.d1600, D.d2400].includes(x) ? x : D.d1600);
  const camOf = (o) => (o.bbox ? { ...M.A.cameraForBounds([[o.bbox[0], o.bbox[1]], [o.bbox[2], o.bbox[3]]], { padding: 120, maxZoom: o.zoom ?? 17.5 }), pitch: o.pitch ?? M.A.getPitch(), bearing: o.bearing ?? 0 } : { center: o.center, zoom: o.zoom ?? M.A.getZoom(), pitch: o.pitch ?? M.A.getPitch(), bearing: o.bearing ?? 0 });
  const temp = new Map();
  return {
    session: () => ({ realm: state.session?.realm || null, role: state.role, tenant_id: state.session?.tenant_id || null, api: API.mode, build: state.build, public: state.public, gates: { ...G } }),
    view: () => viewOf(),
    async layerOn(setId, o = {}) {
      if (setId === 'survey:findings') { if (!svy) throw new Error('XI.layerOn: 이 세션은 실태조사 없음'); await svy.enter({ animate: false }); if (o.filter?.rule) svy.layers.setRules(o.filter.rule); if (o.filter?.priority) svy.layers.setPrio(o.filter.priority); return { id: setId, layers: svy.layers.IDS }; }
      if (o.features) {
        const id = 'ag-' + ++tempN, sid = 'src-' + id;
        M.A.addSource(sid, { type: 'geojson', data: o.features });
        const layers = addResultLayers(M.A, id, sid, { kind: o.kind || 'farmland', visible: true });
        temp.set(id, layers);
        panel.addTemp({ id, label: o.label || '에이전트 질의', note: '에이전트 질의 · 저장 안 됨', count: o.count && typeof o.count === 'object' ? o.count : null });
        return { id, layers };
      }
      if (!M.items[setId]) throw new Error(`XI.layerOn: 카탈로그에 없는 층 ${setId}`);
      if (!M.A.getLayer(layersOf(setId)[0] || '')) await addResultSource(M.A, M.items[setId]);
      if (o.filter) for (const l of layersOf(setId)) if (M.A.getLayer(l)) M.A.setFilter(l, o.filter);
      setResult(setId, true);
      return { id: setId, layers: layersOf(setId) };
    },
    async layerOff(setId) {
      if (setId === 'survey:findings') { await svy?.exit(); return; }
      if (temp.has(setId)) { for (const l of temp.get(setId)) if (M.A.getLayer(l)) M.A.removeLayer(l); if (M.A.getSource('src-' + setId)) M.A.removeSource('src-' + setId); temp.delete(setId); panel.removeTemp(setId); return; }
      setResult(setId, false);
    },
    async arrive(o) {
      assertEnvelope(o.count, 'XI.arrive count');
      const head = { scene: o.head?.scene || '질의', title: o.head?.title || o.label || '', unit: o.head?.unit || o.count.unit, pending: '스캔 중' };
      let bbox = o.bbox;
      const keysA = [], keysB = [];
      if (o.features) {
        bbox ||= bboxOf({ type: 'GeometryCollection', coordinates: o.features.features.map((f) => f.geometry.coordinates) });
        const id = 'ag-' + ++tempN;
        for (const [map, keys] of [[M.A, keysA], [M.B, keysB]]) { map.addSource('src-' + id, { type: 'geojson', data: o.features }); keys.push(...addResultLayers(map, id, 'src-' + id, { kind: o.kind || 'farmland', visible: map === M.B })); }
        temp.set(id, keysA);
        panel.addTemp({ id, label: o.label || head.title || '에이전트 질의', note: '에이전트 질의 · 저장 안 됨', count: o.count });
      } else if (o.setId && M.items[o.setId]) { keysB.push(...(await addResultSource(M.B, M.items[o.setId]))); keysA.push(...layersOf(o.setId)); }
      if (!bbox) { const b = M.A.getBounds(); bbox = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]; }
      state.hudCtx = 'bridge';
      const cam = o.camera || (o.bbox || o.features ? camOf({ bbox }) : null);
      await arrive({ A: M.A, B: M.B, bWrap: $('map-b'), sweepEl: $('sweep'), stageEl: $('locks'), hud }, {
        scene: 'bridge', bbox, head, count: o.count, note: o.note || [], camera: cam,
        prepB: (B) => setVis(B, keysB, true), preloadA: () => {}, show: (A) => { setVis(A, keysA, true); if (o.setId) setResult(o.setId, true); },
        clearB: (B) => setVis(B, keysB, false), lockPick: (B) => pickLocks(B, keysB, { unitSrc: o.count.source }),
      });
      return { ok: true };
    },
    flyTo: (o, t) => flyLadder([M.A, M.B], camOf(o), { duration: ms(t) }),
    /* opts.card=false: 선만 긋는다(견적 카드 없음) — 에이전트 확인 카드가 같은 견적을 이미 보일 때(F2-E 이관 · 같은 견적 두 번 금지) */
    frame: (geom, o = {}) => { if (!ft) throw new Error('XI.frame: 이 역할은 프레임 없음'); if (o.card === false) { const was = state.suppressQuote; state.suppressQuote = true; try { ft.set(geom); } finally { state.suppressQuote = was; } xiEmit('frame', { geom, quote: null, card: false }); } else ft.set(geom); return true; },
    /** 열린 카드(필지 v2 · 필지 · 견적 · 읍면동)를 닫는다 — 에이전트가 새 질문 전에 */
    closeCard: () => { let n = 0; for (const sel of ['#pcard2 .xi-x', '#parcel-card .xi-close', '#parcel-card .xi-x', '#emd-card .xi-close', '#emd-card .xi-x']) { const b = document.querySelector(sel); if (b && b.offsetParent !== null) { b.click(); n++; } } if (!$('quote-card').hidden) { $('quote-card').hidden = true; n++; } return n; },
    async parcelCard(x) {
      if (!svy) throw new Error('XI.parcelCard: 이 세션은 필지 카드 v2 없음');
      if (typeof x === 'string') { const L = await (await SAPI()).loadLite(); const f = L?.byPnu.get(x)?.[0]; if (f) { await svy.openFinding(f); return true; } return !!(await svy.openCard({ pnu: x })); }
      await flyToParcel([x.lng, x.lat]); return svy.parcelAt({ lng: x.lng, lat: x.lat }, '브리지');
    },
    async openDrawer(k, o = {}) {
      if (k === 'findings') { if (!svy) throw new Error('XI.openDrawer: 실태조사 없음'); return svy.openQueue({ rule: o.rule ? [].concat(o.rule) : [], priority: o.priority ? [].concat(o.priority) : [], emd_cd: o.emd_cd || '', state: o.state ? [].concat(o.state) : [] }); }
      if (!G.drawer) throw new Error('XI.openDrawer: 이 역할은 서랍 없음');
      dr.open(k === 'report' ? 'report' : 'stats', o); state.drawer = k; return true;
    },
    closeDrawer: () => { dr.close(); svy?.drawer?.close(); },
    setMode: (m, o) => (m === 'survey' ? svy?.enter(o) : svy?.exit()),
    hudSet: (e, head = {}) => { hud.set(e, { scene: head.scene, title: head.title, unit: head.unit, provLabel: head.provLabel }, head.sub ? [head.sub] : null); state.hudCtx = 'bridge'; },
    hudStatus: (t) => hud.status(t, 'live'),
    toast: (m, b) => toast(m, b ? { basis: b } : {}),
    slot: (n) => ({ agent: $('agent-slot'), cmdk: $('cmdk-slot'), 'report-draft': $('report-draft-slot') })[n] || null,
  };
}

/** 닫아 둔 캔버스를 연다(500 · 법전 ui 이징) — 글로브 부팅(intro)과 카메라 복원이 같은 규칙. 연 시각은 data-canvas=open. */
function openCanvas() {
  const el = $('map');
  if (el.style.opacity === '0') { el.style.opacity = '1'; if (!RM()) el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: D.d500, easing: EASE.ui }); }
  document.documentElement.dataset.canvas = 'open'; mark('canvas');
}
async function restoreOrIntro() {
  const cam = state.cam0;
  const on = (Q.get('on') || '').split(',').filter((id) => M.items[id]);
  if (state.svc) { const d = X.data.dps.find((x) => x.id === state.svc); const id = d?.snapshot_current && ({ 'results/namwon/dp-nw-farm-25@2.1': 'namwon-farmland-2025' }[d.snapshot_current] || d.snapshot_current.split('/').pop()); if (id && M.items[id]) on.push(id); }
  if (state.result && M.items[state.result]) on.push(state.result);
  if (cam && !G.ownImagery) {
    // 공개·게스트: 같은 카메라에서 공개 결과 벡터가 도착한다(드론 AOI 장면·원본 시점 없음 — 영상은 V-World 위성만)
    state.scene = 'city';
    for (const id of on) setResult(id, true);
    const ch = cityHead(); if (ch) hud.pending({ ...ch.head, pending: '공개 결과 불러오는 중' });
    await arriveCity();
    buildScrub('hls');
  } else if (cam) {
    state.scene = inAoiCam(cam) ? 'aoi' : 'city';
    const lst = on.length ? on : [cityHead()?.id].filter(Boolean);
    for (const id of lst) setResult(id, true);
    const ch = cityHead();
    if (state.scene === 'aoi') await arriveAoi({ animate: false });
    else if (ch) { await hud.count(resEnv(ch.item), ch.head, []); setPhase('arrived', { scene: 'restore' }); }
    buildScrub(state.scene === 'aoi' ? 'aoi' : state.public || !G.ownImagery ? 'hls' : 'none');
  } else {
    await intro(introTarget());
    await arriveCity();
    for (const id of on) setResult(id, true);
    buildScrub(state.public || !G.ownImagery ? 'hls' : 'none');
  }
  // 나머지 URL 상태(시점 스크러버가 다 지어진 뒤)
  await scrubBusy;
  const ep = parseFloat(Q.get('epoch')); if (Number.isFinite(ep) && scrub.S.enabled) scrub.set(ep);
  const fr = parseFrame(Q.get('frame')); if (fr && ft) ft.set(fr);
  if (Q.get('swipe')) await openSwipe(+Q.get('swipe'));
  if (Q.get('3d') === '1' && ex) await setExtrude(true);
  if (Q.get('panel')) { panel.S.tab = Q.get('panel') === 'table' ? 'table' : 'layers'; panel.setOpen(true); }
  if (Q.get('drawer') && G.drawer) { dr.open(Q.get('drawer')); state.drawer = Q.get('drawer'); }
  if (Q.get('card')) { const f = (await loadA02()).features.find((x) => x.properties.pnu === Q.get('card')); if (f) openParcel(f); }
  if (state.pick && ft) ft.start(state.pick === 'point' ? 'poly' : 'rect');
  if (state.job === 'j1-hwangdeung' && ft) { const RB = [127.52, 35.425, 127.545, 35.443]; ft.set({ type: 'Polygon', coordinates: [[[RB[0], RB[1]], [RB[2], RB[1]], [RB[2], RB[3]], [RB[0], RB[3]], [RB[0], RB[1]]]] }); }
  else if (state.job && /^job_/.test(state.job)) await restoreJob(state.job);
  // 실태조사(v1.1-29) — ?mode=survey… 복원 · 기관 세션 기본 = 실태조사(명시 ?mode=read 면 판독)
  if (svy) {
    if (Q.get('mode') === 'survey') await svy.restore(Q);
    else if (state.role === 'agency' && Q.get('mode') !== 'read' && !state.job) await svy.enter({ animate: !RM() });
    else if (Q.get('pnu') && !Q.get('card')) { const L = await (await SAPI()).loadLite(); const f = L?.byPnu.get(Q.get('pnu'))?.[0]; if (f && !cam) { await flyToParcel([f.lng, f.lat]); } await svy.openCard({ pnu: Q.get('pnu'), source: '복원' }); }
  }
  document.documentElement.dataset.restored = '1';
  writeUrl();
}
/** ?job= 복원 — GET /jobs/{id} 로 HUD·관제 링크를 즉시, 이어 SSE 를 처음부터 재생해 같은 장면(칸 · 락온 · 스냅샷)을 다시 선다(계약 §5.1 24h 보관) */
async function restoreJob(id) {
  if (API.mode !== 'on' || !session.get()?.token) { hud.jobState(`작업 ${id.slice(-6)} · 서버 연결 없음 · 복원 불가`, { live: false }); return; }
  let j = null;
  try { j = await api('/jobs/' + encodeURIComponent(id)); } catch (e) { hud.jobState(`작업 ${id.slice(-6)} · ${e.code || '조회 실패'}`, { live: false }); return; }
  X.jobApi = { id: j.id, gpu_s: j.gpu_s, elapsed_s: j.elapsed_s ?? null, shards_total: j.shards_total, state: j.state, recovered: j.recovered || null };
  const a = $('mast-ops'); if (a) a.href = 'http://localhost:8702/landxi/ops/infra.html?job=' + encodeURIComponent(j.id);
  if (!j.aoi) return;
  const b = bboxOf(j.aoi);
  await flyLadder([M.A, M.B], { ...M.A.cameraForBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 200, maxZoom: 17.5 }), pitch: M.A.getPitch() }, { duration: D.d1250 });
  ft?.clear?.(false); if (ft) { const was = state.suppressQuote; state.suppressQuote = true; ft.set(j.aoi); state.suppressQuote = was; }
  const imagery = M.items[j.imagery_id] || topImagery();
  const grid = gridFor(b, imagery.gsd_m || 0.25);
  TH && TH.close(); JOBH && JOBH.close();
  TH = theater({ A: M.A, stageEl: $('locks'), grid, snapshotLayer: (set) => (/landcover/.test(set) ? 'landcover' : /farmland/.test(set) ? 'namwon_farmland_2025' : 'results') }, { frame: j.aoi, hud, onDone: (d) => jobDone(d), clsLabel: (k) => (k !== '_note' && I18N.cls?.[k]) || k });
  X.theater = TH; state.model = j.model_id; state.hudCtx = 'job';
  hud.pending({ scene: '작업 복원', title: `${j.model_id} × ${chipText(imagery)}`, unit: '건', pending: `복원 · ${j.state} · SSE 재생` });
  const h = sse('/events/jobs/' + encodeURIComponent(id), { on: (name, d) => TH.on(name, d, { live: true, backlog: 30 }) });
  JOBH = { live: true, job: j, close: () => h.close() };
  const endEv = (e) => { if (['snapshot', 'job.failed', 'job.cancelled'].includes(e.detail.phase)) { JOBH && JOBH.close(); document.removeEventListener('xi-phase', endEv); } };
  document.addEventListener('xi-phase', endEv);
  xiEmit('job', { phase: 'restore', job_id: id });
}
const gpuShort = (r) => { if (!r) return ''; const a = /ANGLE \([^,]+,\s*([^,(]+)/.exec(r), b = /,\s*([^,)]+)\)\s*$/.exec(r); return a ? `${a[1].trim()}${b ? ' · ' + b[1].trim() : ''}` : r.slice(0, 48); };
const inAoiCam = (c) => c.zoom >= 14.5 && c.center[0] >= A01[0] - 0.01 && c.center[0] <= A01[2] + 0.01 && c.center[1] >= A01[1] - 0.01 && c.center[1] <= A01[3] + 0.01;

async function setExtrude(on) {
  if (!ex) return;
  state.extrude = on; $('tool-3d').setAttribute('aria-pressed', String(on));
  await ex.set(on, { fly: !dr?.S.kind }); writeUrl();   // 서랍이 열려 있으면 기울기 비행은 서랍을 닫을 때
}
/** off 모드 필지 조회 — P8 PMTiles(reference/parcels-namwon) 에서 점이 든 필지. 계약 §GET /parcels 와 같은 모양(봉투 · as_of 2021-12). */
function parcelsOn() { if (M.A.getLayer('ref-parcel-fill') && M.A.getLayoutProperty('ref-parcel-fill', 'visibility') !== 'visible') { setVis(M.A, ['ref-parcel-fill', 'ref-parcel-line'], true); state.parcelsOn = true; } }
async function parcelLookup(ll) {
  const A = M.A, it = M.items['parcels-namwon']; if (!it) return null;
  if (A.getLayoutProperty('ref-parcel-fill', 'visibility') !== 'visible') { parcelsOn(); await idle(A, 2500); }
  const pt = [ll.lng, ll.lat];
  const pick = () => {
    const q = A.project(pt);
    const hit = A.getLayer('ref-parcel-fill') && A.getZoom() >= 14 ? A.queryRenderedFeatures(q, { layers: ['ref-parcel-fill'] }) : [];
    if (hit.length) return hit[0];
    for (const f of A.querySourceFeatures('src-parcels', { sourceLayer: it.layer })) {
      const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [];
      if (polys.some((p) => inFrame({ type: 'Polygon', coordinates: p }, pt))) return f;
    }
    return null;
  };
  let f = pick();
  if (!f) { await idle(A, 1500); f = pick(); }
  if (!f) return null;
  const p = f.properties, src = 'reference/parcels-namwon · C04 국토정보기본도 2.0';
  const e = (v, unit, note) => ({ value: v, unit, basis: 'recorded', as_of: '2021-12', source: src, ...(note ? { note } : {}) });
  return { pnu: p.pnu, jibun: [p.emd, p.ri, p.jibun].filter(Boolean).join(' '), jimok: p.jimok, area_m2: p.area_m2 != null ? e(+p.area_m2, 'm2', '공부 면적') : null,
    price_krw_m2: p.price_krw_m2 ? e(+p.price_krw_m2, 'KRW/m2', `공시지가 ${p.price_year || '2021'} · 2021-12 기준`) : null, owner_kind: p.owner_kind || null, source: 'reference/parcels-namwon', as_of: '2021-12' };
}
function openParcel(f) {
  const b = bboxOf(f.geometry), ll = { lng: (b[0] + b[2]) / 2, lat: (b[1] + b[3]) / 2 };
  // 기관·직원: 필지 카드 v2(PNU → 대장 vs 현황) · 게스트: 기존 카드(공개 결과만)
  if (svy) { svy.openCard({ pnu: f.properties.pnu, lngLat: ll, feature: f, source: 'A02 농지이용 2025' }).then((d) => { if (!d) svy.parcelAt(ll, 'A02 농지이용 2025'); }); return; }
  state.card = f.properties.pnu; writeUrl();
  pcard.open({ feature: f, lngLat: ll, source: 'A02' });
}
function tip(f, ll) {
  const el = $('tip');
  if (!f) { el.hidden = true; return; }
  const p = f.properties;
  el.innerHTML = `<b>${p.cls}</b> 신뢰도 ${numHtml(env(+(+p.conf).toFixed(2), 'ratio', 'inferred', 'namwon-greenhouse-2025'), { digits: 2, unit: false })} · 높이 ${numHtml(env(+(p.conf * 12).toFixed(1), 'm', 'estimate', '신뢰도 × 12 m 표현 상수'), { digits: 1 })}`;
  const q = M.A.project(ll); el.style.transform = `translate(${q.x + 14}px, ${q.y - 40}px)`; el.hidden = false;
}

/* ═══ 11. 상호작용 배선 ═══ */
function wire(emdAt) {
  const A = M.A;
  // 사용자가 지도를 잡으면 비행을 멈춘다(점프 없이 그 자리)
  A.getCanvas().addEventListener('pointerdown', () => stopFlight());
  A.getCanvas().addEventListener('wheel', () => stopFlight(), { passive: true });
  // 클릭: 결과(필지) > 읍면동
  A.on('click', async (e) => {
    if (ft?.active) return;
    // 실태조사 모드: z14+ = 필지 카드 v2(PNU) · 시 축척 = 그 읍면동의 의심 큐
    if (svy && state.xmode === 'survey') {
      if (A.getZoom() >= 13.5) { if (await svy.parcelAt(e.lngLat, '실태조사')) return; }
      else { const f = emdAt([e.lngLat.lng, e.lngLat.lat]); if (f) { setPhase('emd', { name: f.nm }); await svy.openQueue({ emd_cd: f.cd }); return; } }
      return;
    }
    const lays = ['r-fa-fill', 'r-gh-fill', 'r-lc-fill'].filter((l) => A.getLayer(l) && A.getLayoutProperty(l, 'visibility') === 'visible');
    const hits = lays.length ? A.queryRenderedFeatures(e.point, { layers: lays }) : [];
    const hit = lays.map((l) => hits.find((h) => h.layer.id === l)).find(Boolean) || null;   // A02 필지 > 비닐하우스 > 토지피복
    // 판독 모드도 기관·직원의 필지 카드는 v2(대장 vs 현황 · 같은 부품)
    if (hit && svy && A.getZoom() >= 13.5) {
      const src = hit.layer.id === 'r-fa-fill' ? 'A02 농지이용 2025' : hit.layer.id === 'r-lc-fill' ? 'P4 토지피복 2023' : 'A02 비닐하우스';
      if (await svy.parcelAt(e.lngLat, src)) return;
    }
    if (hit && G.parcel) {
      if (hit.layer.id === 'r-fa-fill') { const f = (await loadA02()).features.find((x) => x.properties.id === hit.properties.id) || hit; openParcel(f); return; }
      if (A.getZoom() >= 13.5) { pcard.open({ feature: { properties: hit.properties, geometry: hit.geometry }, lngLat: e.lngLat, source: hit.layer.id === 'r-lc-fill' ? 'P4 토지피복 2023' : 'A02 비닐하우스' }); return; }
    }
    if (state.emd && A.getZoom() >= 9 && A.getZoom() < 15.5) {
      const f = emdAt([e.lngLat.lng, e.lngLat.lat]);
      if (f) {
        if (!G.ownImagery && state.build === 'public') { toast(`${f.nm} · 읍면동 집계는 로그인 후`); return; }
        // 드론 AOI 버튼: AOI 를 품은 읍면동은 '하강', 다른 읍면동은 목적지를 이름으로(‘덕과면 드론 AOI로 이동’) — 운봉읍 카드가 덕과면으로 말없이 날아가지 않게
        setPhase('emd', { name: f.nm });
        ecard.open({ name: f.nm, cd: f.cd, lngLat: [e.lngLat.lng, e.lngLat.lat], aoi: G.ownImagery ? { here: f.nm === AOI_EMD, name: AOI_EMD } : null });
        prewarmAoi();
      }
    }
  });
  // 읍면동 hover
  let hovE = null;
  A.on('mousemove', 'ref-emd-fill', (e) => { const f = e.features[0]; if (!f) return; if (hovE !== null && hovE !== f.id) A.setFeatureState({ source: 'src-emd', sourceLayer: M.items['namwon-emd'].layer, id: hovE }, { hover: false }); hovE = f.id; A.setFeatureState({ source: 'src-emd', sourceLayer: M.items['namwon-emd'].layer, id: f.id }, { hover: true }); });
  A.on('mouseleave', 'ref-emd-fill', () => { if (hovE !== null) A.setFeatureState({ source: 'src-emd', sourceLayer: M.items['namwon-emd'].layer, id: hovE }, { hover: false }); hovE = null; });
  // 도구
  const tool = (id, mode) => $(id)?.addEventListener('click', () => { if (!ft) return; const on = $(id).getAttribute('aria-pressed') !== 'true'; document.querySelectorAll('[id^=tool-]').forEach((b) => b.id !== 'tool-swipe' && b.id !== 'tool-3d' && b.setAttribute('aria-pressed', 'false')); if (on) { ft.start(mode); $(id).setAttribute('aria-pressed', 'true'); state.pick = 'frame'; } else { ft.stop(); state.pick = null; } writeUrl(); });
  tool('tool-rect', 'rect'); tool('tool-poly', 'poly'); tool('tool-emd', 'emd');
  $('tool-swipe').addEventListener('click', () => (state.swipe != null ? closeSwipe() : openSwipe(50)));
  $('tool-3d')?.addEventListener('click', () => setExtrude(!state.extrude));
  $('tool-stats')?.addEventListener('click', () => { dr.open('stats'); state.drawer = 'stats'; });
  $('tool-report')?.addEventListener('click', () => { openReport(dr, state.session); state.drawer = 'report'; });
  document.addEventListener('xi-phase', (e) => { if (e.detail.phase === 'job-submit') document.querySelectorAll('#tool-rect,#tool-poly,#tool-emd').forEach((b) => b.setAttribute('aria-pressed', 'false')); });
}

/* ═══ 12. 테스트 · 녹화용 손잡이(제품 동작 아님 · 읽기/호출만) ═══ */
Object.assign(X, {
  M, toAoi, openSwipe, closeSwipe, setExtrude, openParcel, loadA02, arriveCity, buildScrub, writeUrl,
  frameRect: (b) => ft && ft.set({ type: 'Polygon', coordinates: [[[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]], [b[0], b[1]]]] }),
  run: () => $('quote-card').querySelector('.xi-run')?.click(),
  emdAt: (lng, lat) => emdFeatures.find((f) => lng >= f.bbox[0] && lng <= f.bbox[2] && lat >= f.bbox[1] && lat <= f.bbox[3]),
  /** 읍면동 name 안의 점 중 화면 사각 [x0,y0,x1,y1] 에 드는 첫 점(녹화·테스트용) */
  emdPoint: (name, r) => { const f = emdFeatures.find((e) => e.nm === name); if (!f) return null; const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (let i = 1; i < 24; i++) for (let j = 1; j < 24; j++) { const ll = [f.bbox[0] + ((f.bbox[2] - f.bbox[0]) * i) / 24, f.bbox[1] + ((f.bbox[3] - f.bbox[1]) * j) / 24]; if (!polys.some((p) => inFrame({ type: 'Polygon', coordinates: p }, ll))) continue; const q = M.A.project(ll); if (q.x >= r[0] && q.x <= r[2] && q.y >= r[1] && q.y <= r[3]) return [q.x, q.y]; } return null; },
  perfStats: () => perf.stats(), canvasShare: () => { const c = M.A.getCanvas().getBoundingClientRect(); return (Math.min(c.width, innerWidth) * Math.min(c.height, innerHeight)) / (innerWidth * innerHeight); },
  flyTo: (cam, ms) => flyLadder([M.A, M.B], cam, { duration: ms }), CAMS: { NAMWON_CAM, KOREA_CAM, AOI_CAM, A01 },
});
Object.defineProperty(X, 'hud', { get: () => hud });
boot().catch((e) => { document.documentElement.dataset.lx = 'error'; document.documentElement.dataset.err = String(e && e.message); console.warn('xi boot', e); });
