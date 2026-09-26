/* xi.js — XI맵 운영판 부팅 · URL 상태 · 역할 관문 · 장면 연결(F1-A).
   LX_API on(게이트웨이 :8700) / off(픽스처 · 실데이터 파일 · 리플레이) 두 모드에서 같은 화면 — 폴백은 마스트에 정직하게.
   장면: 글로브(VIIRS 어제) → 한국 2400 → 남원 1600(HLS → V-World → 2023 25cm · pitch 0→35) → 129,420 도착
         → 읍면동 집계 → 드론 AOI 1250(25cm → 2m → 1.08cm) → AOI 안 A02 · A04 456 도착 → 필지 카드 → 프레임 → 견적 → 실행 → 열람. */
import { API, probe, session, catalog as apiCatalog, deploys as apiDeploys, api, fixture, mastLabel, env, tileUrl, yesterdayUTC } from '../shared/api-v1.js';
import { createMap, loaded, idle } from './engine/lx-map.js';
import { mountLadder, watchStage, opacityAt } from './engine/ladder.js';
import { sourceSpec, pickHls, TILE_LOG, chipText, prewarm, PREWARM_LOG, EXT_LOG } from './engine/sources.js';
import { flyLadder, stopFlight, CAMLOG, jumps, readHandoff, RM, pathCams } from './engine/camera.js';
import { createPerf, judgeTier } from './engine/tier.js';
import { arrive, addResultLayers, setVis, pickLocks, PHASES, setPhase, clearLocks, bboxOf, cancelArrive, locks } from './fx/arrive.js';
import { timescrub } from './fx/timescrub.js';
import { swipe as swipeFx } from './fx/swipe.js';
import { frameTool, quoteCard } from './fx/frame.js';
import { quoteJob, runJob, theater, synthReplay, gridFor, inFrame } from './fx/job-theater.js';
import { extrude as extrudeFx } from './fx/extrude.js';
import { filament } from './fx/filament.js';
import { toast, D, EASE } from './fx/glass.js';
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
};
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
const ROLE_KO = { guest: '게스트', staff: 'LX 직원', sales: '영업 · 시연', agency: '남원시 · 기관' };
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
    hud.pending(pub ? { scene: '공개 보기', title: 'V-World 위성 + AI 결과', pending: '공개 결과 도착 중 · 위성 수신' } : { scene: '복원', title: '같은 카메라 · 영상 수신', pending: '영상 수신 중' });
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
  M.ladder = await mountLadder(M.A, data.cat.items, { order: data.cat.ladder?.domestic || [], before: 'slot-imagery', dates: M.dates });
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
  const att = new Set(); for (const it of M.ladder?.items || []) if (opacityAt(it, z) > 0.05) att.add(it.attribution);
  $('attrib').textContent = [...att].join(' · ');
}

/** 출처 칩 — 사다리 맨 위 층, 단 드론 AOI 시점 스크럽 중이면 지금 보이는 시점 층 */
function currentChip(z = M.A.getZoom(), c = M.A.getCenter().toArray()) {
  if (!M.ladder) return { text: '—' };
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
  hud.pending({ scene: '글로브', title: `VIIRS 위성 · ${M.dates.viirs} · 어제`, pending: '어제 찍힌 지구 · 한국으로' });
  await sleep(D.d750);   // 어제의 지구를 한 박자 보여 준다
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
  if (it && G.ownImagery) return { id: it.id, item: it, head: { scene: '도착 · 남원 전역', title: '남원 토지피복 AI · 2023 25cm 재추론', unit: '폴리곤', provLabel: '결과', pending: '스캔 중 · 22,737칩 추론 결과' } };
  const fa = M.items['namwon-farmland-2025'];
  return fa ? { id: fa.id, item: fa, head: { scene: '도착 · 공개 결과', title: '남원 농지이용 2025 · V-World 위성 위', unit: '필지', provLabel: '공개 결과', pending: '스캔 중' } } : null;
}
/* 결과 층의 개수 봉투: 폴리곤 수를 센 것은 실측이지만 폴리곤 자체는 AI 추론·검수 전이다(계약 §2 예시 basis:'inferred').
   게이트웨이 카탈로그가 count.basis='measured' + item.basis='inferred' 로 내면 item.basis 를 따른다(결과 문서 계약 변경 요청 1). */
function resEnv(it) {
  const c = it?.count; if (!c) return c;
  if (it.role === 'result' && it.basis === 'inferred' && c.basis !== 'inferred') return { ...c, basis: 'inferred', note: c.note || ('검수 전 · ' + (it.attribution || '').replace(/ · 검수 전$/, '')) };
  return c;
}
async function arriveCity({ animate = true } = {}) {
  const ch = cityHead(); if (!ch) { hud.voidNote('이 계정에 열 수 있는 결과 없음'); return; }
  state.scene = 'city';
  const st = ch.id === 'namwon-landcover-2023' ? await emdStats() : null;
  const note = st ? [...['건물', '경작지', '주차장', '비닐하우스'].map((k) => `${k} ${numHtml(env(st.total[k].n, 'polygons', 'inferred', st.source), { unit: false })}`), '<b class="xi-ai">AI 추론 · 검수 전</b>', '2023 25cm']
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
  const chEnv = resEnv(M.items['namwon-change']) || env(nCh, 'count', 'inferred', 'landxi/assets/data/change.js', '변화 지수(비지도) · 검수 전');
  const faEnv = env(inAoi.length, '필지', 'inferred', 'namwon-farmland-2025.geojson × A01 bounds', `A01 촬영 범위에 걸친 필지 · 온전히 든 것 ${whole}(프론트 계산) · AI 판독 검수 전`);
  const aoiIt = M.items['namwon-aoi-2504'];
  const note = [`A02 농경지 ${numHtml(faEnv, { unit: true })} <small>AOI 걸침 · 온전히 ${whole}</small>`, '변화 지수(비지도) · 학습 결과 아님', '2025.04 → 10 · 4시점'];
  const keys = [];
  const o = {
    scene: 'aoi', bbox: A01, head: { scene: '도착 · 드론 AOI', title: `${AOI_EMD} · LX 드론 ${gsdText(aoiIt)} · ${aoiIt?.epoch || '2025'}`, unit: '변화 윤곽', provLabel: '변화', provTag: '변화 지수 · 검수 전', pending: 'AOI 안 결과 스캔' },
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
  } else if (mode === 'hls') {
    const h = await pickHls({ want: 4 });
    const it = M.items['gibs-hls-s30'];
    if (!it || h.dates.length < 2) { scrub.disable('시점 · 공개 위성 날짜 부족'); return; }
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
  if ($('scrub').dataset.mode !== 'aoi') return;
  // 정수 시점 = 변화 pair 경계 → 그 pair 의 윤곽만(A04 · 비지도)
  const k = L.b == null ? L.a : null;
  const pair = k ? CHANGE.find((c) => c.pair === ['', '2504-2506', '2506-2508', '2508-2510'][k]) : null;
  if (M.A.getLayer('r-ch-line')) {
    const f = pair ? ['==', ['get', 'pair'], pair.pair] : ['==', ['get', 'pair'], '__none__'];
    for (const l of ['r-ch-line', 'r-ch-halo']) M.A.setFilter(l, k === 0 ? null : f);
  }
  if (state.scene === 'aoi') hud.status(pair ? `변화 지수(비지도) · ${pair.label} · ${pair.stats.n}건` : L.b != null ? `${a.label} → ${b.label}` : `${a.label} · ${a.gsd}`, 'live');
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
  sw.open(v, { left: `<b>원본</b>${ch}`, right: `<b>+ AI 결과</b>${res.length ? res.join(' · ') : '결과 없음'}` });
  $('tool-swipe').setAttribute('aria-pressed', 'true');
  state.swipe = v; setPhase('swipe'); writeUrl();
  } finally { X.swBusy = false; }
}
function closeSwipe() {
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
  if (!MODELS.length) MODELS = await loadModels();
  const model = MODELS.find((m) => m.id === (modelId || state.model || 'aerial25/best')) || MODELS[0];
  const imagery = imageryFor(model, geom);
  const body = { kind: 'infer', model_id: model.id, imagery_id: imagery.id, aoi: geom, options: { chip: 1024, overlap: 0.125, conf: 0.25 }, demo: !!G.demo };
  const q = await quoteJob(body, { imagery, model, role: state.role });
  state.quote = q; setPhase('quote');
  const el = $('quote-card');
  quoteCard(el, { q, models: MODELS, selected: model.id, layerKind: imagery.kind, imagery, demoForced: !!G.demo, canRun: G.run,
    onModel: (id) => { state.model = id; onFrame(geom, id); },
    onRun: (m) => { state.model = m.id; writeUrl(); runFrame(geom, m, imagery, q); },
    onClose: (clear) => { if (clear) { ft.clear(); state.frame = null; writeUrl(); } } });
  const b = bboxOf(geom), pr = M.A.project([b[2], b[3]]), pl = M.A.project([b[0], b[3]]), W = window.innerWidth, H = window.innerHeight;
  let x = pr.x + 16; if (x + 380 > W - 452) x = pl.x - 16 - 380; if (x < 88) x = 88;
  el.style.transform = `translate(${Math.round(x)}px, ${Math.round(Math.max(132, Math.min(H - 600, pr.y)))}px)`;
}
async function runFrame(geom, model, imagery, q) {
  $('quote-card').hidden = true;
  TH && TH.close(); JOBH && JOBH.close();
  clearLocks(); cancelArrive();
  const grid = q._grid || gridFor(bboxOf(geom), imagery.gsd_m || 0.25);
  TH = theater({ A: M.A, stageEl: $('locks'), grid, snapshotLayer: (set) => (/landcover/.test(set) ? 'landcover' : /farmland/.test(set) ? 'namwon_farmland_2025' : 'results') }, { frame: geom, hud, onDone: () => mark('job-done'), clsLabel: (k) => (k !== '_note' && I18N.cls?.[k]) || k });
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
  hud.pending({ scene: '프레임 분석', title: `${model.id} × ${chipText(imagery)}`, unit: '건', pending: API.mode === 'on' ? '제출 · SSE 연결' : '시연 · 저장 결과 재생' });
  JOBH = await runJob(body, { onEvent: TH.on,
    onSubmitted: (j) => { if (!j) return; const opsA = $('mast-ops'); if (opsA && j.id) opsA.href = 'http://localhost:8702/landxi/ops/infra.html?job=' + encodeURIComponent(j.id); hud.jobState(`접수 · ${String(j.id || '').slice(-6)} · ${j.state === 'running' ? '실행 중' : '큐 대기'} · ${j.pool || ''}${j.shards_total ? ' · shard ' + j.shards_total : ''}`, { live: true }); hud.status('접수됨 · 큐 순번·워커 배정 대기', 'pending'); },
    onState: (s) => { if (s === 'worker_unavailable') { $('mast-mode').textContent = mastLabel(state.locale) || '시연 · 저장 결과 재생'; toast('워커 없음 → 저장 결과 재생으로 전환', { basis: 'demo' }); } }, synth, replayUrl });
  if (useP4) setResult('namwon-landcover-2023', false);   // 칸마다 다시 도착하는 것이 보이도록(합성 뒤 · 스냅샷이 같은 층으로 돌아온다)
  state.job = JOBH.job?.id || null;
  $('mast-mode').textContent = mastLabel(state.locale);
  writeUrl();
}

/* ═══ 10. 부팅 ═══ */
/** 외부 타일 방패(sw.js) — 제3자 타일 서버의 5xx/CORS 오류를 투명 타일로 받아 콘솔 오류 0 · 결손 수는 계기에 정직하게 */
async function shield() {
  X.tileMiss = 0;
  if (!('serviceWorker' in navigator)) return 'none';
  try {
    navigator.serviceWorker.addEventListener('message', (e) => { if (e.data?.type === 'lx-tile-miss') { X.tileMiss = e.data.failed; const g = $('gauge-miss'); if (g) { g.hidden = false; g.textContent = `외부 타일 결손 ${e.data.failed} · 투명 대체`; } } });
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
  scrub.disable('시점 · 도착 뒤 열림');
  sw = swipeFx({ A: M.A, B: M.B, wrap: $('map-b'), handle: $('grip'), chipL: $('sw-l'), chipR: $('sw-r'), onUrl: (v) => { state.swipe = v; writeUrl(); } });
  X.swipe = sw;
  const emdGeo = await fixture('/landxi/assets/data/geo/namwon-emd.geojson');
  emdFeatures = (emdGeo?.features || []).map((f) => ({ nm: f.properties.nm, cd: f.properties.cd, geometry: f.geometry, bbox: bboxOf(f.geometry) }));
  const emdAt = (ll) => emdFeatures.find((f) => { const r = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates; return r.some((p) => inFrame({ type: 'Polygon', coordinates: p }, ll)); });
  AOI_EMD = emdAt([(A01[0] + A01[2]) / 2, (A01[1] + A01[3]) / 2])?.nm || AOI_EMD;   // A01 중심이 든 읍면동(실측 경계)
  X.aoiEmd = AOI_EMD;
  ecard = emdCard($('emd-card'), { A: M.A, canFrame: G.frame, toAoi, openDrawer: (k, q) => { if (G.drawer) { dr.open(k, q); state.drawer = k; } },
    frameEmd: (name) => { const f = emdFeatures.find((e) => e.nm === name); if (f) ft.set(f.geometry.type === 'Polygon' ? f.geometry : { type: 'Polygon', coordinates: f.geometry.coordinates[0] }); } });
  dr = drawer($('drawer'), { onUrl: () => { state.drawer = dr.S.kind; writeUrl(); }, onClose: () => { if (ex?.S.pendingFly) ex.fly(); } });
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
  search($('search'), { emd: emdFeatures, onPick: (f) => flyLadder([M.A, M.B], { ...M.A.cameraForBounds([[f.bbox[0], f.bbox[1]], [f.bbox[2], f.bbox[3]]], { padding: 120 }), pitch: M.A.getPitch() }, { duration: D.d1600 }) });
  wire(emdAt);
  // 계기
  M.A.on('move', onCamera); onCamera();
  M.A.on('moveend', () => { if (!['boot', 'intro'].includes(state.scene)) writeUrl(); });
  watchStage(M.A, (s) => { state.stage = s; document.documentElement.dataset.stage = s.stage; });
  judgeTier(perf).then((t) => { tierInfo = t; X.tier = t; hud.tier(t); M.A.setMaxPitch(t.maxPitch); $('gpu').textContent = gpuShort(t.gpu.renderer); });
  // 준비 신호: 첫 idle 뒤
  await idle(M.A, 6000);
  if (state.cam0) openCanvas();
  document.documentElement.dataset.lx = 'ready'; mark('ready');
  await restoreOrIntro();
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
    const ch = cityHead(); if (ch) hud.pending({ ...ch.head, pending: '공개 결과 도착 중' });
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
  document.documentElement.dataset.restored = '1';
  writeUrl();
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
  state.card = f.properties.pnu; writeUrl();
  const b = bboxOf(f.geometry);
  pcard.open({ feature: f, lngLat: { lng: (b[0] + b[2]) / 2, lat: (b[1] + b[3]) / 2 }, source: 'A02' });
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
    const lays = ['r-fa-fill', 'r-gh-fill', 'r-lc-fill'].filter((l) => A.getLayer(l) && A.getLayoutProperty(l, 'visibility') === 'visible');
    const hits = lays.length ? A.queryRenderedFeatures(e.point, { layers: lays }) : [];
    const hit = lays.map((l) => hits.find((h) => h.layer.id === l)).find(Boolean) || null;   // A02 필지 > 비닐하우스 > 토지피복
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
