/* gov-fusion — 서비스 사용자 집 · 지자체(내 대장 × AI). 명세 LANDXI-FINAL-SPEC §2.9 그대로.
   정문(K2 관문) → 전국 → 관내 카메라(K3) → 시트(K5 카드 · K8 스텝 4) : 올리기(K11 × K9) → 열 확인(K12) → 결합(K9 진행) → 결과(K6 · K12)
   → Ctrl K(K10 · 게이트웨이 /agent/runs) 한 문장 → 채색 · 리별 막대 · 목록 · 카메라 → 필지 카드(K5 서랍 · 상태 · 영상 설명).
   현장 배정은 없다(원칙 40). 광역 기관은 관할 전체로 도착하고 시군구는 사용자가 고른다(화면이 대신 고르지 않음 · 최근 고른 곳은 표시만).
   관할 = 로그인한 기관(세션). 지역 문자열 고정값 0.
   숫자 한 출처 = 서버: 큰 숫자 · 작은 2 · 표 · 채색은 GET /survey/findings?ledger={import_id}(규칙 L-* · 대장 필지의 실태조사 규칙)에서,
   결합률은 서버 반입 기록(+ 서버가 조회 상한으로 못 본 행은 브라우저 V-World 확인으로 합쳐 하나)에서. 새 기기·새로고침도 같은 경로.
   바탕 = 육지 마스크 위성(land.js) · 바다는 단일 바다색 · 타일 없는 육지는 --bg-0. */
import * as K from '../kit/index.js';
import { api, esc, h, bboxOf, hasRoute, RM, E_CAM } from '../kit/util.js';
import { env, sse, API } from '../../shared/api-v1.js';
import { pmtilesOf, tilesFor } from '../../xi/engine/sources.js';
import { ROLES } from './ledger.js';
import { AiIndex } from './aiindex.js';
import { ServerIndex } from './srvindex.js';
import { matchLedger, parseAddr } from './match.js';
import { plan, run, AI_FIELDS, VW_FIELDS, rulePlan, agrees, merge, labelOf, conditionLines, keysOf, routeOf, SUSPECT_COUNT, ledgerSggOf, regionOf } from './ask.js';
const ADDR_ALL = '소재지 전체';                                              // 읍면 · 리 · 지번이 나뉜 대장의 합친 주소(리/읍면 이름 조건)
import { ledgerStore, lastMark, ledgerKind, KIND_LABEL } from './registry.js';
import { vwParcels, bboxOfFeature } from './vworld.js';
import { landSetup, warmTiles, tilesIn } from './land.js';
import { reviewAction } from '../kit/notify.js';   // 필지 카드 '검토 요청'(구현 2차)

const REPORT = '/landxi/v3/gov-report/';
const $ = (s, r = document) => r.querySelector(s);
const nf = K.nf;
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const KOREA = K.KOREA;
const VW_BOUNDS = [124.0, 32.8, 132.0, 38.9];
const SEA = '#D4E3EB';        // 바다 — 단일 색(위성 바다 · V-World 빈 타일을 쓰지 않는다)
const OTHER = '#E8E6E0';      // 이웃 나라 육지(대한민국 밖)
const SGG_URL = API.base + '/tiles/pmtiles/reference/sigungu.pmtiles';
const inVW = (b) => b[0] < VW_BOUNDS[2] && b[2] > VW_BOUNDS[0] && b[1] < VW_BOUNDS[3] && b[3] > VW_BOUNDS[1];
const grow = (a, b) => (b ? [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])] : a);
const NONE = [180, 90, -180, -90];
const P = { base: 1, bld: 2, fal: 3, park: 4, q: 9 };
const STATE_KO = { open: '—', assigned: '—', inspected: '확인됨', closed: '종결', dismissed: '종결' };   // 판정 전 = '—'(배정 없음)
const YD = (s) => String(s || '').replace(/^제(\d)종일반주거지역$/, '$1종주거').replace(/^제(\d)종전용주거지역$/, '$1종전용').replace(/지역$/, '').replace(/미세분류$/, '') || '—';
const SIDO = ['서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종', '경기', '강원', '충북', '충청북', '충남', '충청남', '전북', '전라북', '전남', '전라남', '경북', '경상북', '경남', '경상남', '제주'];
/* 시도 이름 → 법정동 코드 앞자리(전국 공통 기준표 · 관할 경계선 필터용 · 통합 시도 12 는 옛 코드와 함께) */
const SIDO_CD = [['서울', '11'], ['부산', '26'], ['대구', '27'], ['인천', '28'], ['광주', '29'], ['대전', '30'], ['울산', '31'], ['세종', '36'], ['경기', '41'],
  ['강원', '51'], ['충북', '43'], ['충청북', '43'], ['충남', '44'], ['충청남', '44'], ['전북', '52'], ['전라북', '52'], ['전남', '46'], ['전라남', '46'],
  ['경북', '47'], ['경상북', '47'], ['경남', '48'], ['경상남', '48'], ['제주', '50'], ['광주전남', '12'], ['전남광주', '12']];

/* ═════════════ 관문 · 셸 · 무대(바탕부터) ═════════════ */
landSetup(SGG_URL);                                           // 육지 마스크 · 위성 파이프라인 — 관문을 기다리지 않고
const pre = warmTiles(tilesIn(KOREA, 7), { n: 12, budget: 3000 });   // 전국 착지 타일(z7 · 바다 칸은 받지 않음)
const who = await K.gate('gov-fusion');
const MARK = lastMark(who);               // 이 창의 최근 반입 캐시 표시(동기)
const S = {
  who, store: null, region: null, index: null, emd: new Map(), rec: null, cols: null, vw: null, srv: null, F: null,
  fused: [], byPnu: new Map(), cat: 'bld', query: null, states: new Map(), counts: null, kind: '농지대장',
  log: [], tm: {}, regions: null,
};
const tm = (k) => { S.tm[k] = Math.round(performance.now()); };
tm('gate');
const isDevMode = new URLSearchParams(location.search).get('dev') === '1';
const QREG = new URLSearchParams(location.search).get('region');   // ?region=시군구 — 그 시군구 결과로 연다
if (isDevMode) window.__gf = S;   // 개발 모드 점검용

/* 광역 기관(관할 시군구 여럿) — 시군구를 화면이 고르지 않는다. 주소(?region)로 고른 곳 · 질문 속 지역 · 올린 대장의 지역만 쓴다 */
const homeSgg = () => (S.wide ? null : S.region?.sgg?.[0] || null);
const curSgg = () => S.askRegion || QREG || ledgerSgg() || homeSgg();   // 이 화면의 지금 시군구 — XI맵 · 할 일로 이어 준다
/* 최근 고른 시군구(기억만 · 표시로 알림) — 할 일 · 보고서 화면과 같은 저장 칸 */
const RECENT_K = `gr:recent:${who.me.tenant_id}`;
const recentSgg = () => { try { const a = JSON.parse(localStorage.getItem(RECENT_K) || '[]'); return Array.isArray(a) ? a : []; } catch { return []; } };
const rememberSgg = (cd) => { try { localStorage.setItem(RECENT_K, JSON.stringify([cd, ...recentSgg().filter((x) => x !== cd)].slice(0, 3))); } catch { /* 저장 불가 */ } };
const shell = K.shell({ who, home: 'gov-fusion', title: String(who.org || '').trim().split(/\s+/).pop(), xiRegion: curSgg });   // 관할 이름(끝 낱말) — 배포 기록을 읽은 뒤 같은 값으로 확정
const mastEl = shell.app.querySelector('.k-mast');
const stageEl = h('div.gf-stage'); shell.main.append(stageEl);
const stage = K.createStage(stageEl);
const baseReady = stage.ready.then(mountBase);
K.devDrawer({ stage, who });

/* 바탕 층 — 바다색 · 이웃 육지 · 대한민국 육지(--bg-0 · 타일 오기 전) · 육지 마스크 위성(저줌 받침 z6–8 + 본 층 z9–19) */
function mountBase(map) {
  map.setPaintProperty('bg', 'background-color', SEA);
  for (const id of ['k-eox', 'k-vw']) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'none');
  const before = map.getLayer('k-eox') ? 'k-eox' : 'slot-imagery';
  map.addSource('gf-other', { type: 'geojson', data: new URL('./geo/neighbors.geojson', import.meta.url).href });
  map.addLayer({ id: 'gf-other', type: 'fill', source: 'gf-other', paint: { 'fill-color': OTHER, 'fill-antialias': true } }, before);
  map.addSource('gf-sgg', { type: 'vector', url: 'pmtiles://' + SGG_URL });
  // 타일이 오기 전 육지(--bg-0) — 시군구 경계는 해안선이 거칠어 깊은 줌에선 걷는다(정밀 해안선은 위성 마스크가 맡는다)
  map.addLayer({ id: 'gf-land0', type: 'fill', source: 'gf-sgg', 'source-layer': 'sigungu', maxzoom: 11, paint: { 'fill-color': css('--bg-0') || '#F2F4F6', 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 9.5, 1, 10.6, 0] } }, before);
  map.addSource('gf-lo', { type: 'raster', tiles: ['gfland://{z}/{x}/{y}'], tileSize: 256, minzoom: 6, maxzoom: 8, bounds: VW_BOUNDS });
  // 받침은 비행 중(저줌)에만 — 깊은 줌에서는 흐린 해안이 바다에 비치지 않게 걷는다
  map.addLayer({ id: 'gf-lo', type: 'raster', source: 'gf-lo', maxzoom: 11.5, paint: { 'raster-fade-duration': 200, 'raster-opacity': ['interpolate', ['linear'], ['zoom'], 10, 1, 11.2, 0] } }, before);
  map.addSource('gf-hi', { type: 'raster', tiles: ['gfland://{z}/{x}/{y}'], tileSize: 256, minzoom: 9, maxzoom: 19, bounds: VW_BOUNDS });
  map.addLayer({ id: 'gf-hi', type: 'raster', source: 'gf-hi', paint: { 'raster-fade-duration': 300 } }, before);
  return map;
}
/* 저줌 받침(z6–8 · 대한민국 전역 · 바다 타일은 받지 않는다) — 카메라를 움직이기 전에 */
const loReady = Promise.all([pre, baseReady]).then(() => warmTiles([6, 7, 8].flatMap((z) => tilesIn(KOREA, z)), { n: 12, budget: 4000 }));

/* 서비스 상태 · 대표 수치 = GET /summary 한 출처(기관 세션 = 자기 관할만). 못 읽으면 null — 상태를 지어내지 않는다 */
const sumP = api('/summary').then((j) => (j && Array.isArray(j.items) ? j : null)).catch(() => null);
const [dep, fin, emd, regs] = await Promise.all([
  api('/deploys').catch(() => null),
  api('/survey/findings?limit=1').catch(() => null),
  api('/survey/stats?by=emd').catch(() => null),
  api('/regions').catch(() => null),        // 기관 계정 = 관할 시군구만(서버가 거른다)
]);
S.regions = (regs && regs.items) || [];
S.wide = S.regions.length > 1;              // 광역 기관 — 도착 = 관할 전체(시군구는 사용자가 고른다)
S.region = resolveRegion(dep, fin, emd); tm('apis');
if (QREG) {   // ?region=시군구 — 그 시군구 배포본만(대장 이어 열기·정적 필지 층 없이 summary 결과로)
  const ds = ((dep && dep.items) || []).filter((d) => d.tenant_id === who.me.tenant_id && String(d.sgg_cd || '') === QREG);
  if (ds.length) {
    const R = S.region; let bb = null;
    for (const d of ds) { const b = bboxOf(d.aoi); if (b) bb = bb ? grow(bb, b) : [...b]; }
    R.sgg = [QREG]; R.focus = true; R.hasFindings = false; R.bbox = bb || R.bbox;
    R.full = ds.map((d) => d.region_name && d.region_name.ko).find(Boolean) || R.full;
    R.name = String(R.full).trim().split(/\s+/).pop() || R.name;
    rememberSgg(QREG);                      // 사용자가 고른 시군구 — 기억만(다음 도착 때 표시로 알림)
  }
}
S.counts = fin?.counts || null;
const own = ((dep && dep.items) || []).filter((d) => d.tenant_id === who.me.tenant_id);
{ const k = await ledgerKind(own.map((d) => d.card_id), who.me.tenant_id); S.kind = k.label; S.kindFrom = k.from; S.tiles = k.tiles; }   // 대장 종류 = 카드 ledger_schema(S-6) · 반입이 있으면 그 반입의 종류
const orgName = S.region.name || who.org;
document.title = `${orgName} · 내 대장 × AI · Land-XI`;
{ const hm = mastEl.querySelector('.k-word .home'); if (hm) hm.textContent = orgName; }

/* Ctrl K — 마스트 `물어보기 Ctrl K` · 자리표는 명세 예시 */
/* 명령 바 지역 = 질문 속 시군구·읍면동 → 이 창의 ?region → 화면에 올린 대장의 시군구 → 관할 대표 시군구.
   (시군구가 여럿인 기관에서 다른 시군구 대장을 올린 직후에도 답·보고서가 그 대장 지역으로 간다 — 새로 열 필요 없음) */
/* ?region 으로 고른 시군구가 올린 대장의 시군구와 다르면 대장을 문맥에 싣지 않는다(목포·여수를 골랐는데 강진 대장으로 답하지 않게) */
const ledgerCtx = () => { const id = S.srv?.import_id || S.pendingId || null; if (!id || !QREG) return id; const lg = ledgerSgg(); return !lg || String(lg) === String(QREG) ? id : null; };
const cmdk = K.mountCmdk({ stage, context: () => ({ tenant: who.me.tenant_id, region: curSgg(), ledger: ledgerCtx(), pnu: S.selPnu || null }) });
const ckBtn = cmdk.button(); ckBtn.querySelector('span').textContent = '물어보기';
shell.mast(ckBtn);
const ckInput = $('.k-ck-i', cmdk.el);
ckInput.placeholder = '대장상 농지인데 AI가 건물로 본 필지';

/* `할 일 {n}` → gov-report (역할 칩 뒤 · `?` 앞) */
const todo = h('a.k-mast-b.gf-todo', { href: REPORT }, h('span', { text: '할 일' }), h('b.num'));
for (const ev of ['pointerdown', 'focus', 'mouseenter']) todo.addEventListener(ev, () => { const r = curSgg(); todo.href = REPORT + (r ? '?' + new URLSearchParams({ region: String(r) }) : ''); });
mastEl.insertBefore(todo, $('.k-help', mastEl));
function paintTodo() {
  const c = S.counts; const n = c ? (c.assigned || 0) + (c.inspected || 0) : null;
  todo.querySelector('b').textContent = n === null ? '' : nf(n);
}
paintTodo();
shell.fresh(new Date());

/* ═════════════ 시트(K5 흰 카드) · 큰 숫자 카드 ═════════════ */
const sheet = K.card({ map: true, cls: 'gf-sheet' });
sheet.setAttribute('aria-label', '내 대장 × AI');
const stepEl = h('div.gf-steps');
const panes = { drop: h('div.gf-pane', { hidden: true }), cols: h('div.gf-pane', { hidden: true }), join: h('div.gf-pane', { hidden: true }), result: h('div.gf-pane', { hidden: true }) };
sheet.append(stepEl, ...Object.values(panes));
stageEl.append(sheet);
const steps = K.stepper(stepEl, [{ t: '올리기' }, { t: '열 확인' }, { t: '결합' }, { t: '결과' }], { current: 0 });
const ORDER = ['drop', 'cols', 'join', 'result'];
function pane(k, { step } = {}) {
  for (const [n, el] of Object.entries(panes)) el.hidden = n !== k;
  steps.go(step ?? Math.max(0, ORDER.indexOf(k)));
  document.body.dataset.view = k;
  if (k === 'result') steps.go(4);   // 4 결과까지 모두 완료
  requestAnimationFrame(padStage);
}
let prog = null;
function joinPane({ resume = false } = {}) {
  panes.join.innerHTML = '';
  const pe = h('div'); panes.join.append(pe);
  prog = K.empty(pe, { kind: 'loading', title: '필지에 이어 붙이는 중', char: 'drone', progress: resume ? null : 0, compact: true });
  eager(pe);
  pane('join', { step: resume ? 3 : 2 });
}
const eager = (el) => el.querySelectorAll('img').forEach((i) => { i.loading = 'eager'; i.fetchPriority = 'high'; });

const bigCard = K.card({ map: true, cls: 'gf-big' }); bigCard.hidden = true;
const bigEl = h('div');
const smallEl = h('div.gf-small');
bigCard.append(bigEl, smallEl);
stageEl.append(bigCard);
const BIG0 = '대장은 농지 · AI는 건물';
const big = K.bignum(bigEl, null, { label: BIG0, unit: '필지', animate: false });   // 숫자 한 출처 — 이전 대장 값에서 굴러가는 중간 숫자(177→73→67)를 보이지 않는다

/* 관할 서비스 줄 — summary 한 출처 · 시군구마다 한 줄(누르면 ?region=시군구) */
const svcBar = h('nav.gf-svcbar', { 'aria-label': '내 서비스' }); svcBar.hidden = true;
stageEl.append(svcBar);
const ingestCard = K.card({ map: true, cls: 'gf-ingest' }); ingestCard.hidden = true;
stageEl.append(ingestCard);
const sweep = h('div.gf-sweep', { hidden: true, 'aria-hidden': 'true' }); stageEl.append(sweep);

/* 이어 열기(이미 결합한 반입)는 결합 진행을 다시 틀지 않는다 — '불러오는 중' 뒤 곧바로 결과. 진행 표시는 새 대장을 올릴 때만 */
function loadingPane() {
  panes.result.innerHTML = '';
  const e = h('div'); panes.result.append(e);
  K.empty(e, { kind: 'loading', compact: true });
  eager(e);
  pane('result');
}
if (MARK) loadingPane(); else pane('none', { step: 0 });   // 캐시 없는 창 — 서버 기록을 확인할 때까지 빈 상태도 그리지 않는다

const small = () => matchMedia('(max-width: 640px)').matches;
function padStage() {
  if (small()) {
    stage.pad({ top: 16 + (svcBar.hidden ? 0 : svcBar.offsetHeight + 8) + (bigCard.hidden ? 0 : bigCard.offsetHeight + 12) + (ingestCard.hidden ? 0 : ingestCard.offsetHeight + 12), bottom: (document.body.classList.contains('gf-dr') ? 0 : sheet.offsetHeight) + 20, left: 20, right: 20 });
  } else {
    const w = sheet.offsetWidth || 392;
    const lb = Math.max(bigCard.hidden ? 0 : bigCard.offsetHeight, ingestCard.hidden ? 0 : ingestCard.offsetHeight);
    stage.pad({ top: 48, left: 48, right: w + 48, bottom: lb ? Math.min(lb + 48, 260) : 48 });
  }
  document.body.style.setProperty('--gf-sheet-h', (small() && !document.body.classList.contains('gf-dr') ? sheet.offsetHeight : 0) + 'px');
}
addEventListener('resize', () => requestAnimationFrame(padStage));
new ResizeObserver(() => padStage()).observe(sheet);
document.addEventListener('kit:drawer', (e) => { document.body.classList.toggle('gf-dr', (e.detail?.open || 0) > 0); requestAnimationFrame(padStage); });

/* ═════════════ 카메라 — 저줌 받침 + 목표 줌 타일을 먼저 받고 움직인다(도착 뒤 흐린 타일 0 · 바다색 위 육지 0) ═════════════ */
async function warm(b, maxZoom, budget) {
  await baseReady;
  const map = stage.map;
  const cam = map.cameraForBounds(b, { padding: stage.padding, maxZoom });
  if (!cam) return;
  const z = Math.min(cam.zoom, maxZoom);
  const c = map.getContainer();
  const ctr = cam.center.lng !== undefined ? [cam.center.lng, cam.center.lat] : cam.center;
  const tz = Math.min(19, Math.round(z + 1));
  const list = tz >= 9 ? tilesFor({ center: ctr, zoom: z, pitch: 0 }, tz, { W: c.clientWidth, H: c.clientHeight, bounds: VW_BOUNDS }) : [];
  await Promise.race([Promise.all([loReady, warmTiles(list, { n: 12, budget })]), wait(budget + 400)]);
}
async function goReady(b, { ms = 1600, maxZoom = 15, budget = 2200 } = {}) {
  if (!b) return false;
  await warm(b, maxZoom, budget);
  return stage.go(b, { ms, maxZoom });
}
/* 결과 필지로 — AI 분석 필지 층(sv · 타일 z11 부터)이 그려지는 배율 아래로는 내려가지 않는다.
   결과가 관할 전역에 퍼져 좁은 화면(390)에서 전체 범위가 z11 밑이면 결과가 몰린 가운데(사분위 범위)로, 그래도 멀면 그 가운데를 SV_MINZ 로. */
const SV_MINZ = 11.5;
function camZoom(b, maxZoom) { const c = stage.map.cameraForBounds(b, { padding: stage.padding, maxZoom }); return c ? Math.min(c.zoom, maxZoom) : 0; }
async function goResult(bbs, { ms = 1600, maxZoom = 15, budget = 1600 } = {}) {
  bbs = bbs.filter(Boolean);
  if (!bbs.length) return false;
  await baseReady;
  const all = bbs.reduce((a, b) => grow(a, b), NONE);
  if (!S.index || S.index.server || camZoom(all, maxZoom) >= SV_MINZ) return goReady(all, { ms, maxZoom, budget });
  const xs = bbs.map((b) => (b[0] + b[2]) / 2).sort((a, b) => a - b), ys = bbs.map((b) => (b[1] + b[3]) / 2).sort((a, b) => a - b);
  const q = (v, p) => v[Math.round(p * (v.length - 1))];
  for (const p of [0.1, 0.25]) {
    const core = [q(xs, p), q(ys, p), q(xs, 1 - p), q(ys, 1 - p)];
    if (camZoom(core, maxZoom) >= SV_MINZ) return goReady(core, { ms, maxZoom, budget });
  }
  const cx = q(xs, 0.5), cy = q(ys, 0.5);
  return goReady([cx - 1e-4, cy - 1e-4, cx + 1e-4, cy + 1e-4], { ms, maxZoom: SV_MINZ, budget });
}

/* ═════════════ 1 · 올리기 ═════════════ */
S.store = await ledgerStore(who); tm('store');
const dzEl = h('div.gf-drop');
panes.drop.append(dzEl);
const dz = K.dropzone(dzEl, {
  onFile: (f, p) => S.store.importFile(f, S.kind, p),
  onDone: (out) => toCols(out),
  onError: (e) => { if (!e || !['bad_ext', 'too_large'].includes(e.code)) K.toast('파일을 읽지 못했습니다'); },
});
const emptyEl = h('div');
dzEl.prepend(emptyEl);
function paintDrop() {
  K.empty(emptyEl, { kind: 'first', title: '내 대장 × AI', char: 'satellite', text: `${S.kind}${/[가-힣]$/.test(S.kind) && (S.kind.charCodeAt(S.kind.length - 1) - 0xac00) % 28 ? '을' : '를'} 올리면 AI와 어긋난 필지가 지도에 표시됩니다.`, action: { label: '대장 올리기', onClick: () => {} } });
  eager(emptyEl);
}
paintDrop();

/* 영상 있음/없음 — summary imagery.has 로만(관할 코드가 겹치는 항목 · 없으면 기관 전체). 'none' 일 때만 '영상 등록 필요' */
function sumItems() {
  const items = S.sum?.items || []; if (!items.length) return [];
  const sgg = (S.region.sgg || []).map(String);
  const mine = items.filter((it) => { const c = String(it.sgg_cd || ''); return c && sgg.some((x) => c.startsWith(x) || x.startsWith(c)); });
  return mine.length ? mine : items;
}
function paintSvcBar() {
  const items = (S.sum?.items || []).filter((it) => it.sgg_cd);
  svcBar.innerHTML = '';
  if (!items.length) { svcBar.hidden = true; document.body.classList.remove('gf-has-svc'); return; }
  const key = (it) => +(it.metrics?.detected?.value || 0);
  const rec = new Set(recentSgg().slice(0, 1));
  if (S.wide) {       // 관할 전체 — 의심 필지 합계(숫자 한 출처 GET /survey/stats · 시군구 없이 = 관할 전체)
    const t = S.allSus;
    const v = t && t.value !== null && t.value !== undefined ? t.value : null;
    svcBar.append(h('a.gf-svcbar-i.gf-svcbar-all', { href: location.pathname, 'aria-current': QREG ? null : 'true' },
      h('b', { text: '전체' }), h('span', { text: S.region.full || '' }),
      v !== null ? h('span.num', { text: `의심 필지 ${nf(v)}건`, dataset: { metric: '의심 필지', v: String(v) } }) : null));
  }
  for (const it of [...items].sort((x, y) => String(x.sgg_cd).localeCompare(String(y.sgg_cd)) || key(y) - key(x)).slice(0, 6)) {
    const cd = String(it.sgg_cd);
    const nm = String(it.region_name || '').trim().split(/\s+/).pop();
    const det = it.metrics?.detected;
    const a = h('a.gf-svcbar-i', { href: `?region=${encodeURIComponent(cd)}`, 'aria-current': QREG === cd ? 'true' : null, dataset: S.wide && !QREG && rec.has(cd) ? { recent: '1' } : {}, title: S.wide && !QREG && rec.has(cd) ? '최근 고른 곳' : null },
      h('b', { text: nm }), h('span', { text: it.card_name || '' }),
      det && det.value !== null && det.value !== undefined ? h('span.num', { text: `${det.label} ${nf(det.value)}${det.unit || ''}`, dataset: { metric: det.label, v: String(det.value) } }) : null);
    svcBar.append(a);
    if (QREG === cd) requestAnimationFrame(() => { svcBar.scrollLeft = Math.max(0, a.offsetLeft - 12); });
  }
  svcBar.hidden = false; document.body.classList.add('gf-has-svc');
}
function imageryOf() {
  const it = sumItems(); if (!it.length) return null;
  // AI 결과가 이미 있는 서비스(단계가 '첫 결과 전'이 아니거나 탐지 수가 있음)는 영상이 있었던 것 — '영상 등록 필요'를 띄우지 않는다
  const ran = (x) => (x.stage && x.stage !== '첫 결과 전') || +(x.metrics?.detected?.value || 0) > 0;
  if (it.some((x) => x.imagery?.has === true || ran(x))) return 'has';
  return it.every((x) => x.imagery && x.imagery.has === false) ? 'none' : null;
}
const noImagery = () => imageryOf() === 'none';
/* AI 결과 색인이 없는 관할의 좌하단 카드 — 영상이 정말 없으면 '영상 등록 필요', 영상이 있으면 summary 의 서비스 상태 · 수 */
function showStatus() {
  if (noImagery()) return showIngest();
  const items = sumItems();
  ingestCard.innerHTML = '';
  if (!items.length) { ingestCard.hidden = true; requestAnimationFrame(padStage); return; }
  const KEYS = ['detected', 'field_check', 'review_pending', 'reports'];
  for (const it of items.slice(0, 4)) {
    const m = KEYS.map((k) => it.metrics?.[k]).find((x) => x && x.value !== null && x.value !== undefined);
    const row = h('div.gf-svc');
    row.append(h('p.gf-svc-t', { text: it.card_name || '' }), h('p.gf-svc-s', { text: [it.stage, it.region_name].filter(Boolean).join(' · ') }));
    if (m) row.append(h('p.gf-svc-m', {}, h('span', { text: m.label }), h('b.num', { text: nf(m.value), dataset: { metric: m.label, v: String(m.value) } }), h('small', { text: m.unit || '' }), K.sigEl(m)));
    /* 의심 필지 — 숫자 한 출처(GET /summary metrics.suspect = survey_sgg · XI맵 · 보고서 · 에이전트와 같은 값). 적재 중이면 '집계 중' */
    const sv = it.metrics?.suspect;
    if (it.survey_state === 'building') row.append(h('p.gf-svc-m', { dataset: { metric: '의심 필지' } }, h('span', { text: '의심 필지' }), h('small', { text: '집계 중' })));
    else if (sv && sv.value !== null && sv.value !== undefined) row.append(h('p.gf-svc-m', {}, h('span', { text: sv.label || '의심 필지' }), h('b.num', { text: nf(sv.value), dataset: { metric: sv.label || '의심 필지', v: String(sv.value) } }), h('small', { text: sv.unit === 'count' ? '건' : sv.unit || '' }), K.sigEl(sv)));
    ingestCard.append(row);
  }
  ingestCard.classList.add('gf-status');
  ingestCard.hidden = false;
  requestAnimationFrame(padStage);
}
function showIngest() {
  ingestCard.classList.remove('gf-status');
  ingestCard.hidden = false;
  const e = h('div');
  K.empty(e, { kind: 'ingest', char: 'drone', title: '영상 등록 필요', text: '이 지역 영상이 등록되면 AI 분석이 시작됩니다', compact: true, action: { label: '영상 등록 요청', onClick: requestImagery } });
  eager(e);
  ingestCard.innerHTML = ''; ingestCard.append(e);
  requestAnimationFrame(padStage);
}
async function requestImagery(ev) {
  const b = ev?.currentTarget; if (b) b.disabled = true;
  const bb = S.region.bbox;
  try {
    // 계약 kind 'imagery_request' — 서버 feedback 이 아직 fp|fn|other 만 받아서 other + 메모 머리말로 보낸다(보고서 '서버 요청')
    await api('/feedback', { method: 'POST', body: { kind: 'other', lnglat: [(bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2], note: `영상 등록 요청 · ${S.region.full}${S.rec ? ` · ${S.rec.name}` : ''}` } });
    K.toast('영상 등록을 요청했습니다');
  } catch { K.toast('요청하지 못했습니다'); if (b) b.disabled = false; }
}

/* ═════════════ 2 · 열 확인 ═════════════ */
const VW_TWIN = /용도\s*지역|농업\s*진흥|진흥\s*구역|면적/;
function toCols(out) {
  S.rec = { import_id: out.import_id, columns_guess: out.columns_guess };
  S.cols = out.columns_guess.map((c) => ({ ...c }));
  panes.cols.innerHTML = '';
  const tbl = h('div.gf-cols');
  const ok = h('button.t-btn.gf-join', { type: 'button', text: '결합' });
  panes.cols.append(h('h3.gf-h', { text: '열 확인' }), tbl, h('p.gf-note', { text: '성명·연락처 열은 읽지 않습니다' }), h('div.gf-acts', {}, ok));
  const opt = (v) => ROLES.map(([k, l]) => `<option value="${k}"${k === v ? ' selected' : ''}>${esc(l)}</option>`).join('');
  const sub = (r) => (r.role === 'skip' && VW_TWIN.test(r.col) ? '공간정보 공개 자료와 대조' : r.sample);
  K.table(tbl, {
    cols: [
      { key: 'col', label: '파일의 열', fmt: (v, r) => `<b>${esc(v)}</b><small data-i="${r.i}">${esc(sub(S.cols[r.i]))}</small>` },
      { key: 'role', label: '뜻', width: '46%', fmt: (v, r) => `<select class="t-input gf-sel" data-i="${r.i}" aria-label="${esc(r.col)} 뜻">${opt(v)}</select>` },
    ],
    rows: S.cols.map((c, i) => ({ ...c, i })), limit: 40,
  });
  const check = () => { ok.disabled = !S.cols.some((c) => c.role === 'pnu' || c.role === 'jibun'); };
  tbl.addEventListener('change', (e) => {
    const s = e.target.closest('select'); if (!s) return;
    const c = S.cols[+s.dataset.i]; c.role = s.value;
    const sm = tbl.querySelector(`small[data-i="${s.dataset.i}"]`); if (sm) sm.textContent = sub(c);
    check();
  });
  check();
  ok.addEventListener('click', () => join());
  pane('cols');
}

/* ═════════════ 3 · 결합 ═════════════
   브라우저가 필지를 잇고(PNU → 지번 → V-World) 곧바로 서버 반입(import → confirm)을 건다.
   지도가 서→동으로 차오르는 동안 서버가 결합 · 규칙 L-* 평가를 마치면, 결과는 서버 기록으로 그린다(새 기기와 같은 경로). */
const mapping = () => Object.fromEntries(S.cols.map((c) => [c.col, c.role]));
const colOf = (role) => (S.cols || []).find((c) => c.role === role)?.col;
async function join({ resume = null } = {}) {
  if (resume) return reopen(resume);
  S.srv = null; S.F = null; S.pendingId = null; S.srvWait = false; S.srvRows = null; S.fullRows = false; S.uploader = null;   // 새 대장 — 이전 반입 기록(다른 시군구일 수 있음)을 명령 바 문맥에 남기지 않는다
  big.loading();                                   // 이전 대장의 큰 숫자를 남기지 않는다(서버 값이 올 때까지 '—')
  joinPane();
  const t0 = performance.now();
  let rec;
  const matcher = (r) => matchLedger({
    rows: r.rows, cols: S.cols, index: S.index,
    region: { name: S.region.name, sgg: S.region.sgg, emdBBox: (cd) => (S.emd.get(cd) || {}).bbox },
    onStep: (s) => prog.set({ progress: s.phase === 'keys' ? 0.2 * (s.resolved || 0) / (s.keys || 1) : s.phase === 'tiles' ? 0.2 + 0.3 * (s.tiles || 0) / (s.tilesN || 1) : 0.5 }),
  });
  try {
    if (resume) {
      rec = resume;
      if (S.index) {
        if (rec.aiCache?.length) S.index.seed(rec.aiCache);
        else {
          const emds = [...new Set(rec.match.filter(Boolean).map((p) => p.slice(0, 8)))];
          const bbs = emds.map((cd) => (S.emd.get(cd) || {}).bbox).filter(Boolean);
          await S.index.load(bbs.length ? bbs : [S.region.bbox], (d, n) => prog.set({ progress: 0.1 + 0.5 * d / (n || 1) }));
          rec.aiCache = S.index.dump(rec.match.filter(Boolean)); S.store.save(rec);
        }
      }
    } else {
      rec = await S.store.confirm(S.rec.import_id, mapping(), matcher);
      if (S.index) rec.aiCache = S.index.dump(rec.match.filter(Boolean));
      S.kind = rec.kind || S.kind;
    }
    if (!S.index) {
      if (!rec.vwCache) rec.vwCache = await vwParcels(rec.match.filter(Boolean), (p) => prog.set({ progress: 0.5 + 0.1 * p }));
      mountVw(rec.vwCache);
    }
    if (!resume) await S.store.save(rec);
  } catch { K.toast('파일을 읽지 못했습니다'); pane('drop'); dz.reset(); return; }
  K.devlog('match', `${Math.round(performance.now() - t0)} ms · ${S.store.mode}`);
  S.rec = rec;
  tm('matched'); fuse(rec); tm('fused');
  // 서버 반입(새 결합) 또는 서버 기록(이어 열기) — 결과의 정본
  const srvP = resume ? serverDone(S.srv?.import_id) : S.store.serverSave(rec, S.cols).then((id) => { K.devlog('registry', `서버 반입 ${id}`); if (S.rec === rec || !S.rec?.rows) S.pendingId = id || null; return serverDone(id); }).catch((e) => { K.devlog('registry', `서버 반입 실패 · ${e.message}`); return null; });
  let pr = 0.6; const tick = setInterval(() => { pr = Math.min(0.95, pr + 0.02); prog?.set({ progress: pr }); }, 250);
  await sweepIn(!!resume);
  // 영상 있는 관할은 서버 규칙 결과(큰 숫자 · 표)를 기다린다. 영상 없는 관할은 결합률만 서버와 합치므로 기다리지 않는다(끝나면 그 자리에서 갱신)
  const d = await Promise.race([srvP, wait(!S.index ? (noImagery() ? 600 : 25000) : resume ? 8000 : 25000).then(() => null)]);
  clearInterval(tick);
  if (d) await takeServer(d);
  prog?.set({ progress: 1 });
  result(); tm('result');
  // 스윕이 필지를 못 잡았으면(브라우저 결합에 경계가 없고 서버 필지로 결과가 선 경우) 서버 필지로 카메라를 옮기고 바탕을 칠한다 — 다시 연 창과 같은 화면
  if (!S.ledgerBB && !S.query) {
    const it = S.fused.filter((o) => o && o._bb);
    if (it.length) {
      for (const o of it) if (!painted.get(o._pnu)) setK(o._pnu, P.base);
      S.ledgerBB = it.reduce((a, o) => grow(a, o._bb), NONE);
      goResult(it.map((o) => o._bb), { ms: 1400, maxZoom: S.index ? 15.5 : 15, budget: 1200 });
    }
  }
  if (!resume) K.toast('결합을 마쳤습니다');
  if (!d) { S.srvWait = true; paintWait(); srvP.then((dd) => { S.srvWait = false; if (!dd || S.rec !== rec) { paintWait(); return; } return takeServer(dd).then(() => lateResult(rec)); }); }   // 서버가 늦으면 끝나는 대로 그 자리에서 바꾼다
}
/* 결합 뒤 서버 대조가 늦게 끝났을 때 — 결과 패널(큰 숫자 · 목록 · 막대)과 지도를 그 자리에서 다시 그린다(새로 열기와 같은 화면) */
function lateResult(rec) {
  if (S.rec !== rec) return;
  if (!S.index) { paintRate(); paintWait(); return; }
  const hadQuery = !!S.query, on = S.pendingOn; S.pendingOn = null;
  S.query = null; result();
  if (on && paintLedgerOn(on)) { K.toast('AI 결과와 대조를 마쳤습니다'); return; }
  if (!hadQuery) {
    const it = S.fused.filter((o) => o && o._bb);
    if (it.length) { S.ledgerBB = it.reduce((a, o) => grow(a, o._bb), NONE); goResult(it.map((o) => o._bb), { ms: 1400, maxZoom: 15.5, budget: 1200 }); }
  }
  K.toast('AI 결과와 대조를 마쳤습니다');
}
/* 서버 대조를 기다리는 동안 한 줄(0 필지로 읽히지 않게) */
function paintWait() {
  const el = panes.result.querySelector('.gf-wait');
  if (!S.srvWait || S.index) { el?.remove(); return; }
  if (!el && ansEl) ansEl.after(h('p.gf-note.gf-wait', { text: 'AI 결과와 대조하는 중입니다' }));
}

/* 서버 반입 한 건이 결합을 마칠 때까지 */
async function serverDone(id) {
  if (!id) return null;
  const t0 = performance.now();
  for (let i = 0; performance.now() - t0 < 20 * 60 * 1000; i++) {   // 새 시군구는 필지 적재 · AI 결합을 기다린다(서버 대기열)
    const d = await S.store.detail(id).catch(() => null);
    if (d && d.state === 'matched') return d;
    if (d && d.state === 'failed') return null;
    await wait(i < 20 ? 700 : 2000);
  }
  return null;
}
/* 서버 기록 → 결과 정본(규칙 결과 · 결합률 · 미결합) */
async function takeServer(d) {
  S.srv = d;
  if (KIND_LABEL[d.kind]) S.kind = KIND_LABEL[d.kind];
  if ((!S.index || S.index.server) && d.ai && d.ai.has) await useServerIndex(d).catch((e) => K.devlog('srv-index', String(e && e.message || e)));
  if (S.index) { S.F = await loadFindings(d.import_id).catch(() => null); await fillFromServer(d).catch(() => false); addServerRows(); applySets(); }
  S.capP = verifyCapped().catch(() => null).then(() => { if (S.srv === d) paintRate(); });   // V-World 확인은 결과를 막지 않는다
}
/* 대장 필지의 실태조사 결과 — 규칙별 집계(by_rule)와 필지 목록 */
async function loadFindings(id) {
  const q = `ledger=${encodeURIComponent(id)}&rule=L1,L2,R1,R2,R4&limit=2000&sort=evid_m2`;
  const items = []; let by = null;
  for (let off = 0; off < 8000; off += 2000) {
    const j = await api(`/survey/findings?${q}&offset=${off}`);
    by ||= j.by_rule; items.push(...(j.items || []));
    if ((j.items || []).length < 2000) break;
  }
  const set = (rules) => { const m = new Map(); for (const f of items) if (rules.includes(f.rule)) { const v = +f.evid_m2?.value || 0; if (!m.has(f.pnu) || v > m.get(f.pnu).v) m.set(f.pnu, { v, f }); } return m; };
  const bldRule = by && by.L1 && +by.L1.value > 0 ? ['L1'] : ['R1'];
  const F = { by, items, bld: set(bldRule), park: set(['R4']), fal: set(['L2', 'R2']), bldRule, as_of: items[0]?.evid_m2?.as_of };
  for (const f of items) if (!S.states.has(f.pnu) || f.state !== 'open') S.states.set(f.pnu, f.state);
  return F;
}
/* 서버가 V-World 조회 상한으로 못 본 행(브라우저가 PNU 를 잡아 보낸 행)은 브라우저가 V-World 로 확인해 합친다 — 결합률 하나 */
async function verifyCapped() {
  const d = S.srv; if (!d) return;
  const capped = (d.unmatched || []).filter((u) => /상한/.test(String(u.reason || '')) && /^\d{19}$/.test(String(u.pnu || '')));
  S.capOk = new Set();
  if (!capped.length) return;
  const feats = await vwParcels(capped.map((u) => u.pnu)).catch(() => []);
  const got = new Set(feats.map((f) => f.properties.pnu));
  for (const u of capped) if (got.has(u.pnu)) S.capOk.add(u.seq);
  S.capFeats = feats;
}

/* 대장 × AI 판독 × V-World 한 줄씩(이 창에 행이 있을 때) */
function fuse(rec) {
  const st = colOf('state'), dt = colOf('date');
  const jc = (S.cols || []).filter((c) => c.role === 'jibun').map((c) => c.col);
  const seen = new Set();                                                    // 같은 필지가 대장에 두 번 있어도 필지는 하나(서버 결합 필지와 같은 셈)
  S.fused = rec.rows.map((r, i) => {
    const pnu = rec.match[i]; if (!pnu || seen.has(pnu)) return null;
    seen.add(pnu);
    const ix = S.index && S.index.get(pnu);
    const txt = jc.map((c) => String(r[c] ?? '').trim()).filter(Boolean).join(' ');
    const a = parseAddr(txt, '');
    const o = { _pnu: pnu, _bb: ix ? ix.bb : (S.vw && S.vw.get(pnu)) || null, _ri: a.ri || a.emd || '', _jb: [a.ri || a.emd, a.jb].filter(Boolean).join(' ') || txt, _state: st ? String(r[st] ?? '').trim() : '' };
    for (const c of S.cols) if (c.role !== 'skip') o[c.col] = r[c.col];
    if (jc.length > 1) o[ADDR_ALL] = txt;                                     // 읍면 · 리 · 지번이 나뉜 대장 — 리/읍면 이름 조건은 합친 주소에서
    if (dt) o._date = r[dt];
    if (ix) { for (const [k, f] of Object.entries(AI_FIELDS)) o[k] = f(ix.p); for (const [k, f] of Object.entries(VW_FIELDS)) o[k] = f(ix.p); }
    return o;
  });
  S.byPnu.clear(); S.fused.forEach((o, i) => { if (o) S.byPnu.set(o._pnu, i); });
  applySets();
}
/* 서버 결과 필지 한 줄(행이 없는 새 기기 · 브라우저가 못 이은 필지) — AI 판독 색인 · V-World 속성은 같은 파일에서 */
function rowFromFinding(f, stCol, adCol) {
  const ix = S.index && S.index.get(f.pnu);
  let ev = null; try { ev = typeof f.evidence === 'string' ? JSON.parse(f.evidence) : f.evidence; } catch { /* */ }
  const a = parseAddr(f.addr || '', '');
  const lg = ev?.ledger?.value || (VW_FIELDS['V-World 지목'](ix ? ix.p : { jimok: f.jimok }) || f.jimok || '');
  const ll = f.lnglat || [];
  const o = { _pnu: f.pnu, _bb: ix ? ix.bb : (Number.isFinite(ll[0]) ? [ll[0] - 0.0004, ll[1] - 0.0003, ll[0] + 0.0004, ll[1] + 0.0003] : null), _ri: a.ri || a.emd || '', _jb: [a.ri || a.emd, a.jb].filter(Boolean).join(' ') || f.addr || f.pnu, _state: lg, _srv: 1 };
  if (stCol) o[stCol] = lg;
  if (adCol) o[adCol] = f.addr || '';
  o[ADDR_ALL] = f.addr || '';
  if (ix) { for (const [k, fn] of Object.entries(AI_FIELDS)) o[k] = fn(ix.p); for (const [k, fn] of Object.entries(VW_FIELDS)) o[k] = fn(ix.p); }
  else { o['V-World 지목'] = f.jimok || ''; o['V-World 용도지역'] = f.yongdo || ''; o['V-World 농업진흥'] = f.nongup || ''; o['V-World 면적(㎡)'] = +f.parcel_m2?.value || 0; }
  return o;
}
/* 서버가 대장에 이은 필지 한 줄(필지마다 대장 값 · 연속지적 · AI 값) — 이어 연 창도 대장 행 전체로 결합표를 만든다(이름표 = 값 · M7) */
function rowFromParcel(p, stCol, adCol) {
  const ix = S.index && S.index.get(p.pnu);
  const lg = p.ledger || {};
  const addr = String(p.addr || lg.jibun || '');
  const a = parseAddr(addr, '');
  const st = String(lg.status ?? '').trim() || VW_FIELDS['V-World 지목'](p) || '';
  const o = { _pnu: p.pnu, _bb: ix ? ix.bb : p.bbox || null, _ri: a.ri || a.emd || '', _jb: [a.ri || a.emd, a.jb].filter(Boolean).join(' ') || addr || p.pnu, _state: st, _srv: 1 };
  if (lg.date) o._date = lg.date;
  if (stCol) o[stCol] = st;
  if (adCol) o[adCol] = addr;
  o[ADDR_ALL] = addr;
  const src = ix ? ix.p : p;
  if (ix || p.ai) for (const [k, fn] of Object.entries(AI_FIELDS)) o[k] = fn(src);
  for (const [k, fn] of Object.entries(VW_FIELDS)) o[k] = fn(src);
  return o;
}
/* 서버 결합 필지 목록(한 번 받아 둔다 · 서버 필지 색인이 이미 받았으면 그것) */
async function serverParcels(d) {
  if (!d?.import_id || d.state !== 'matched') return null;
  if (S.srvRows?.id === d.import_id) return S.srvRows.items;
  let items = null;
  if (S.index?.server && S.index.id === d.import_id && S.index.size && [...S.index.map.values()][0]?.p?.ledger) items = [...S.index.map.values()].map((x) => x.p);
  else { const j = await S.store.parcels(d.import_id).catch(() => null); items = j ? (j.features || []).map((f) => f.properties || {}).filter((x) => x.pnu) : null; }
  if (items) S.srvRows = { id: d.import_id, items };
  return items;
}
/* 결합표 = 서버가 대장에 이은 필지 집합(올린 창 · 이어 연 창 · 새 기기 모두 같은 필지를 센다).
   이 창에 행이 있으면 서버가 더 이은 필지를 덧붙이고 서버가 잇지 못한 필지는 세지 않는다. 행이 없으면 서버 목록으로 만든다. */
function applyServerRows(items) {
  if (!items || !items.length) return false;
  const set = new Set(items.map((x) => x.pnu));
  if (S.rec?.rows) {
    const st = colOf('state'), ad = (S.cols || []).find((c) => c.role === 'jibun')?.col;
    S.fused = S.fused.map((o) => (o && set.has(o._pnu) ? o : null));
    S.byPnu.clear(); S.fused.forEach((o, i) => { if (o) S.byPnu.set(o._pnu, i); });
    for (const x of items) if (!S.byPnu.has(x.pnu)) { S.fused.push(rowFromParcel(x, st, ad)); S.byPnu.set(x.pnu, S.fused.length - 1); }
  } else {
    S.cols = [{ col: '상태', role: 'state' }, { col: '소재지', role: 'jibun' }];
    S.fused = items.map((x) => rowFromParcel(x, '상태', '소재지'));
    S.byPnu.clear(); S.fused.forEach((o, i) => S.byPnu.set(o._pnu, i));
    S.fullRows = S.srv?.import_id || true;
    if (S.F) for (const f of S.F.items) if (!S.byPnu.has(f.pnu)) { S.fused.push(rowFromFinding(f, '상태', '소재지')); S.byPnu.set(f.pnu, S.fused.length - 1); }
  }
  S.places = null;
  applySets();
  return true;
}
async function fillFromServer(d) { return applyServerRows(await serverParcels(d)); }
/* 새 기기 — 서버 필지 목록을 못 받으면 서버 결과의 필지로 결합표를 만든다(대체) */
function fuseFromFindings() {
  const F = S.F; if (!F) return;
  S.cols = [{ col: '상태', role: 'state' }, { col: '소재지', role: 'jibun' }];
  const seen = new Map();
  for (const f of F.items) if (!seen.has(f.pnu)) seen.set(f.pnu, rowFromFinding(f, '상태', '소재지'));
  S.fused = [...seen.values()];
  S.byPnu.clear(); S.fused.forEach((o, i) => S.byPnu.set(o._pnu, i));
  applySets();
}
/* 이 창의 결합표에 없는 서버 결과 필지(서버가 V-World 로 더 이은 행)를 덧붙인다 — 큰 숫자 = 지도 = 표 = Ctrl K */
function addServerRows() {
  const F = S.F; if (!F || !S.rec?.rows) return;
  const st = colOf('state'), ad = (S.cols || []).find((c) => c.role === 'jibun')?.col;
  for (const f of F.items) if (!S.byPnu.has(f.pnu)) { S.fused.push(rowFromFinding(f, st, ad)); S.byPnu.set(f.pnu, S.fused.length - 1); }
}
/* 서버 규칙 결과를 결합표에 — 큰 숫자 · 작은 2 · Ctrl K 답이 같은 필지 집합에서 나온다 */
function applySets() {
  const F = S.F; if (!F || !S.fused.length) return;
  for (const o of S.fused) {
    if (!o) continue;
    o['AI 건물(㎡)'] = F.bld.get(o._pnu)?.v || 0;
    o['AI 주차장(㎡)'] = F.park.get(o._pnu)?.v || 0;
    o['AI 경작 흔적 없음'] = F.fal.has(o._pnu) ? 1 : 0;
  }
}

/* 결합된 필지가 서쪽에서 동쪽으로 차오른다(실제 필지 순서) · 이어 열기는 한 번에 */
async function sweepIn(resume) {
  const items = S.fused.filter((o) => o && o._bb).sort((a, b) => a._bb[0] - b._bb[0]);
  if (!items.length || !srcId()) return;
  const bb = items.reduce((a, o) => grow(a, o._bb), NONE);
  S.ledgerBB = bb;
  const mz = S.index ? 15.5 : 15;
  if (resume || RM()) { for (const o of items) setK(o._pnu, P.base); await goResult(items.map((o) => o._bb), { ms: 1600, maxZoom: mz, budget: 1600 }); return; }
  await goResult(items.map((o) => o._bb), { ms: 1600, maxZoom: mz, budget: 2200 });
  sweep.hidden = false;
  const T = 1400, t0 = performance.now(); let k = 0; const map = stage.map;
  await new Promise((done) => {
    const tick = () => {
      const t = Math.min(1, (performance.now() - t0) / T);
      const lon = bb[0] + (bb[2] - bb[0]) * E_CAM(t);
      while (k < items.length && items[k]._bb[0] <= lon) setK(items[k++]._pnu, P.base);
      sweep.style.transform = `translateX(${map.project([lon, (bb[1] + bb[3]) / 2]).x}px)`;
      if (t < 1) requestAnimationFrame(tick); else { for (; k < items.length; k++) setK(items[k]._pnu, P.base); sweep.hidden = true; done(); }
    };
    requestAnimationFrame(tick);
  });
}
const srcId = () => (S.index && !S.index.server ? (stage.map.getSource('sv') ? 'sv' : null) : (stage.map.getSource('gf-vw') ? 'gf-vw' : null));
let painted = new Map();
function setK(pnu, k) {
  const src = srcId(); if (!src) return;
  stage.map.setFeatureState(src === 'sv' ? { source: 'sv', sourceLayer: 'parcels', id: pnu } : { source: 'gf-vw', id: pnu }, { k });
  painted.set(pnu, k);
}
/* 채색 — 이 창에 행이 있으면 대장 필지 전체를 옅게(바탕), 아니면 결과 필지만 */
function paint(fn) {
  if (!srcId()) return;
  const base = S.rec?.rows || S.fullRows ? P.base : 0;
  S.fused.forEach((o, i) => { if (!o) return; const k = fn(i) || base; if ((painted.get(o._pnu) || 0) !== k) setK(o._pnu, k); });
}

/* ═════════════ 4 · 결과 ═════════════ */
const SMALL = [['park', '주차장'], ['fal', '경작 흔적 없음(확인 필요)']];
let resTable = null, ansEl = null, rateEl = null;
const aiYear = () => (S.srv?.ai?.sgg || []).map((x) => x.year).find(Boolean) || '';
const est = (n) => { const e = env(n, '필지', 'estimate', `대장 × 영상 AI 분석${aiYear() ? ' ' + aiYear() : ''}`, '확인 전'); e.as_of = S.srv?.confirmed_at || S.F?.as_of || e.as_of; return e; };
function setBig(label, e) { big.set(e); big.label(label); }
function catIdx(id) { const m = S.F?.[id]; if (!m) return []; const out = []; for (const pn of m.keys()) { const i = S.byPnu.get(pn); if (i !== undefined) out.push(i); } return out; }
const catN = (id) => (S.F?.[id] ? S.F[id].size : null);
/* 필지의 실태조사 결과 한 건 — 지금 보는 분류의 규칙 결과를 먼저(표의 '상태' = 필지 카드의 상태) */
function findingOf(pnu) {
  const F = S.F; if (!F) return null;
  for (const id of [S.cat, 'bld', 'park', 'fal']) { const e = F[id]?.get(pnu); if (e) return e.f; }
  return null;
}
const stateOf = (pnu) => findingOf(pnu)?.state || S.states.get(pnu);
function bigDefault() { const n = catN('bld'); setBig(BIG0, n === null ? (S.fLoading ? undefined : null) : est(n)); }   // 받는 중 = '불러오는 중'

/* 결합률 — 한 숫자. 이 창에 행이 있으면 브라우저 ∪ 서버, 새 기기면 서버 + 상한으로 못 본 행의 브라우저 V-World 확인 */
function rateNow() {
  const R = S.rec?.rows ? S.rec : null, d = S.srv;
  if (R) {
    const N = R.rows.length;
    const all = R.match.every(Boolean);
    const miss = d && d.state === 'matched' ? new Set((d.unmatched || []).map((u) => +u.seq)) : null;
    if (!all && !miss) return { final: false, N };
    let n = 0; const why = {};
    R.match.forEach((p, i) => {
      if (p || (miss && !miss.has(i + 1)) || S.capOk?.has(i + 1)) { n++; return; }
      const u = (R.unmatched || []).find((x) => x.row === i) || {}; const k = String(u.reason || '기타').split(' · ')[0]; why[k] = (why[k] || 0) + 1;
    });
    return { final: true, n, N, why, as_of: d?.confirmed_at || R.as_of };
  }
  if (!d) return { final: false, N: 0 };
  const N = +d.rows?.value || 0, Ms = +d.matched?.value || 0, add = S.capOk ? S.capOk.size : 0;
  const why = {}; for (const u of d.unmatched || []) { if (S.capOk?.has(+u.seq)) continue; const k = String(u.reason || '기타').split(' · ')[0]; why[k] = (why[k] || 0) + 1; }
  return { final: true, n: Math.min(N, Ms + add), N, why, as_of: d.confirmed_at };
}
function paintRate() {
  if (!rateEl) return;
  rateEl.innerHTML = '';
  const r = rateNow();
  if (!r.final) { rateEl.append(h('span.t-label', { text: '대장 필지 결합 확인 중' })); return; }
  const pct = r.N ? Math.floor((1000 * r.n) / r.N) / 10 : 0;
  const e = env(pct, '%', 'measured', '대장 × 연속지적 매칭', `대장 ${r.N}행`); e.as_of = r.as_of || e.as_of;
  rateEl.append(h('span.t-label', { text: '대장 필지 결합' }), h('b.num', { text: `${nf(pct, 1)}%`, dataset: { metric: '대장 필지 결합', v: String(pct) } }), K.sigEl(e));
  const miss = r.N - r.n;
  if (miss > 0) {
    const b = h('button.t-btn.t-btn--text.gf-miss', { type: 'button', text: `미결합 ${nf(miss)} · 사유 보기` });
    b.addEventListener('click', () => {
      const t = h('div');
      K.table(t, { cols: [{ key: 'why', label: '사유' }, { key: 'n', label: '행', num: true }], rows: Object.entries(r.why).sort((a, b) => b[1] - a[1]).map(([why, n]) => ({ why, n })), limit: 10 });
      K.drawer({ title: '미결합', body: t, host: stageEl, slot: 'parcel' });
    });
    rateEl.append(h('span.gf-dot', { text: '·' }), b);
  }
}
const mdOf = (d) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d || '')); return m ? `${+m[2]}월 ${+m[3]}일` : ''; };
const fileName = () => S.rec?.name || String(S.srv?.filename || '').replace(/(\.(?:xlsx|xls|shp|zip|gpkg|geojson|json))\.csv$/i, '$1');

function result() {
  pane('result');
  panes.result.innerHTML = '';
  panes.result.append(h('p.gf-file', { text: fileName() }));
  if (S.uploader) panes.result.append(h('p.gf-note.gf-owner', { text: `기관 최근 대장 · ${S.uploader.role || '기관 담당자'}${S.uploader.date ? ' · ' + mdOf(S.uploader.date) : ''}` }));
  ansEl = h('div.gf-ans'); panes.result.append(ansEl);
  const tblEl = h('div.gf-table'); panes.result.append(tblEl);
  rateEl = h('div.gf-rh'); panes.result.append(rateEl); paintRate();
  // 영상 범위 밖 대장 필지 — 대조하지 않았다는 사실을 한 줄로(0 필지로 읽히지 않게)
  const outN = (S.srv?.ai?.sgg || []).reduce((a, x) => a + (+x.outside?.value || 0), 0);
  if (S.index && outN > 0) panes.result.append(h('p.gf-note', { text: `영상 범위 밖 ${nf(outN)}필지는 AI 분석 전` }));
  const dl = h('button.t-btn.t-btn--2', { type: 'button', text: '내려받기' });
  const again = h('button.t-btn.t-btn--2', { type: 'button', text: '다른 파일' });
  panes.result.append(h('div.gf-acts.gf-foot', {}, dl, again));
  dl.addEventListener('click', download);
  again.addEventListener('click', reset);
  resTable = null;

  if (!S.index) {
    requestAnimationFrame(paintWait);
    // 영상 없는 관할: 결합된 필지를 V-World 경계로 칠하고 대장 필지 수 · 리별 막대 — 대조 숫자는 영상이 들어온 뒤(지어내지 않는다)
    tblEl.hidden = true; bigCard.hidden = true; showStatus();
    const r = rateNow();
    const known = S.fused.filter(Boolean);
    const n = r.final ? r.n : known.length;
    if (!r.final && !n && S.srvWait) ansEl.append(h('p.gf-ans-h', {}, h('span', { text: '대장 필지' }), h('span.gf-ans-n', { html: '<b class="num">—</b>' })));   // 서버가 잇는 중 — 0 으로 보이지 않게
    else ansEl.append(h('p.gf-ans-h', {}, h('span', { text: '대장 필지' }), h('span.gf-ans-n', { html: `<b class="num" data-metric="대장 필지" data-v="${n}">${nf(n)}<small>필지</small></b>` }, K.sigEl(env(n, '필지', 'measured', '대장 × 연속지적', '')))));
    if (S.rec?.rows) {
      const g = new Map(); for (const o of known) g.set(o._ri || '—', (g.get(o._ri || '—') || 0) + 1);
      const items = [...g.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([label, value]) => ({ label, value }));
      if (items.length > 1) { const be = h('div'); ansEl.append(be); K.bars(be, { items, ai: true, unit: '필지' }); }
    }
    if (!S.ledgerBB) {
      const p = known.map((o) => o._bb).filter(Boolean);
      const b = p.length ? p.reduce((a, q) => grow(a, q), NONE) : null;
      requestAnimationFrame(() => { padStage(); goReady(b || S.region.bbox, { ms: 2000, maxZoom: 14 }); });
    }
    requestAnimationFrame(padStage);
    return;
  }
  resTable = K.table(tblEl, {
    cols: [
      { key: 'jb', label: '지번' }, { key: 'lg', label: '대장' }, { key: 'ai', label: 'AI 분석' }, { key: 'yd', label: '용도지역' },
      { key: 'st', label: '상태', fmt: (v, r) => esc(STATE_KO[stateOf(r.pnu)] || '—') },
    ],
    rows: [], limit: TOP(), onRow: (r) => openParcel(r.pnu, true),
  });
  bigCard.hidden = false;
  bigDefault();
  smallEl.innerHTML = '';
  for (const [id, label] of SMALL) {
    const n = catN(id);
    const b = h('button.gf-chip', { type: 'button', 'aria-pressed': 'false', dataset: { cat: id } }, h('span', { text: label }), h('b.num', { text: n === null ? '—' : nf(n), dataset: { metric: label, v: n === null ? '' : String(n) } }));
    b.addEventListener('click', () => showCat(S.cat === id && !S.query ? 'bld' : id));
    smallEl.append(b);
  }
  showCat('bld');
  requestAnimationFrame(padStage);
}

/* 시트 표 = 근거가 큰 순 상위 몇 필지(전체는 지도 · 내려받기) — 카드 합 ≤ 20% */
const TOP = () => (S.query ? 2 : 3);   // 질문 답(조건 이름 · 리별 막대)이 붙으면 표는 2행
function rowsOf(idx, evKey, all = false) {
  const rows = idx.map((i) => S.fused[i]).filter(Boolean).map((o) => ({
    pnu: o._pnu, jb: o._jb, lg: o._state || '—', ai: aiText(o, evKey), yd: YD(o['V-World 용도지역']), _ev: evKey ? +o[evKey] || 0 : 0,
  })).sort((a, b) => b._ev - a._ev);
  return all ? rows : rows.slice(0, TOP());
}
function aiText(o, key) {
  if (key === 'AI 경작 흔적 없음' || key === 'V-World 면적(㎡)') return o['AI 농경 비율'] !== undefined ? `농경 ${Math.round((o['AI 농경 비율'] || 0) * 100)}%` : '경작 흔적 없음';
  if (key) return `${key.replace(/^AI |\(㎡\)$/g, '')} ${nf(Math.round(o[key] || 0))}㎡`;
  const list = [['건물', 'AI 건물(㎡)', 33], ['주차장', 'AI 주차장(㎡)', 100], ['비닐하우스', 'AI 비닐하우스(㎡)', 100]].filter(([, k, t]) => o[k] >= t);
  return list.length ? list.map(([l, k]) => `${l} ${nf(Math.round(o[k]))}㎡`).join(' · ') : `농경 ${Math.round((o['AI 농경 비율'] || 0) * 100)}%`;
}
const EVKEY = { bld: 'AI 건물(㎡)', park: 'AI 주차장(㎡)', fal: 'V-World 면적(㎡)' };
const CAT_LABEL = { bld: BIG0, park: '대장은 농지 · AI는 주차장', fal: '경작 흔적 없음(확인 필요)' };
function ansHead(label, n, e) {
  ansEl.innerHTML = ''; ansEl.hidden = false;
  if (n === null) { ansEl.append(h('p.gf-ans-h', {}, h('span', { text: label }), h('span.gf-ans-n', { html: '<b class="num">—</b>' }))); return; }
  const nb = h('span.gf-ans-n', { html: `<b class="num" data-metric="${esc(label)}" data-v="${n}">${nf(n)}<small>필지</small></b>` }, K.sigEl(e || est(n)));
  ansEl.append(h('p.gf-ans-h', {}, h('span', { text: label }), nb));
}
function showCat(id) {
  S.cat = id; S.query = null;
  bigDefault();
  for (const b of smallEl.querySelectorAll('.gf-chip')) b.setAttribute('aria-pressed', String(b.dataset.cat === id && id !== 'bld'));
  const idx = catIdx(id); const hit = new Set(idx);
  const kk = { bld: P.bld, park: P.park, fal: P.fal }[id];
  paint((i) => (hit.has(i) ? kk : 0));
  ansHead(CAT_LABEL[id], catN(id));
  const rows = rowsOf(idx, EVKEY[id]);
  resTable?.set(rows);
  loadLedgerCells(rows);
}
/* 새 기기에서 표의 '대장' 칸 — 보이는 몇 행만 필지 조회(대장 값) */
async function loadLedgerCells(rows) {
  if (S.rec?.rows) return;
  const need = rows.filter((r) => !S.ledgerCell?.has(r.pnu)).slice(0, 6);
  S.ledgerCell ||= new Map();
  await Promise.all(need.map(async (r) => {
    try { const j = await api(`/survey/parcels/${r.pnu}?with=ledger`); const v = (j.ledger || []).find((x) => x.import_id === S.srv?.import_id) || (j.ledger || [])[0]; S.ledgerCell.set(r.pnu, v?.values?.status || null); }
    catch { S.ledgerCell.set(r.pnu, null); }
  }));
  let ch = false;
  for (const o of S.fused) if (o && S.ledgerCell.get(o._pnu) && o._state !== S.ledgerCell.get(o._pnu)) { o._state = S.ledgerCell.get(o._pnu); ch = true; }
  if (ch) resTable?.set(currentRows());
}
function currentRows() {
  if (S.query) return rowsOf(S.query.hits, S.query.evKey);
  return rowsOf(catIdx(S.cat), EVKEY[S.cat]);
}

/* ═════════════ 필지 카드(K5 서랍) — 대장 · AI 판독 · V-World ═════════════ */
async function openParcel(pnu, fly) {
  const i = S.byPnu.get(pnu); if (i === undefined) return;
  const o = S.fused[i];
  const hl = srcId() === 'sv' ? 'lg-hl' : 'gv-hl';
  stage.map.getLayer(hl) && stage.map.setFilter(hl, ['==', ['get', 'pnu'], pnu]);
  if (fly && o._bb) goReady(o._bb, { ms: 1400, maxZoom: 17, budget: 1500 });
  const body = h('div.gf-parcel');
  const vw = S.index ? [o['V-World 지목'], o['V-World 용도지역'], o['V-World 농업진흥']].filter(Boolean).join(' · ') || '—' : ((S.vwProps && S.vwProps.get(pnu)) || '—');
  const ai = S.index ? aiText(o) : noImagery() ? '영상 등록 필요' : 'AI 분석 전';
  body.append(h('dl.gf-tri', { html: `<dt>대장</dt><dd>${esc(o._state || '—')}${o._date ? ` · ${esc(o._date)}` : ''}</dd><dt>AI 분석</dt><dd>${esc(ai)}</dd><dt>공개 자료</dt><dd>${esc(vw)}${o['V-World 면적(㎡)'] ? ` · ${nf(Math.round(o['V-World 면적(㎡)']))}㎡` : ''}</dd>` }));
  const act = h('div.gf-act'); body.append(act);
  S.selPnu = pnu;
  const d = K.drawer({ title: o._jb, body, host: stageEl, slot: 'parcel', onClose: () => { if (S.selPnu === pnu) S.selPnu = null; stage.map.getLayer(hl) && stage.map.setFilter(hl, ['==', ['get', 'pnu'], '__']); } });
  if (!noImagery()) {   // 영상 설명(AI 의견) — 명령 바로 보낸다(서버 영상 도구 · 관할 가드)
    const emdNm = (S.emd.get(String(pnu).slice(0, 8)) || {}).name || '';
    const jb = [emdNm && !String(o._jb).startsWith(emdNm) ? emdNm : '', o._jb].filter(Boolean).join(' ');
    const vb = h('button.t-btn.t-btn--2.gf-vlm', { type: 'button', text: '영상 설명' });
    vb.addEventListener('click', () => askBar(`${jb} 영상 설명해 줘`));
    act.append(vb);
  }
  reviewAction(act, { who, pnu, from: 'gov-fusion' });   // 이 필지를 LX 담당자에게 검토 요청(메모 한 줄 · 선택)
  if (!S.index) return;
  try {
    let f = findingOf(pnu);
    if (!f) { const j = await api(`/survey/findings?pnu=${pnu}&limit=5`); f = (j.items || []).find((x) => x.state === 'open') || (j.items || [])[0]; }
    if (!f) return;
    S.states.set(pnu, f.state);
    act.append(h('p.gf-st', {}, h('span.t-label', { text: '상태' }), h('b', { text: STATE_KO[f.state] === '—' ? '판정 전' : STATE_KO[f.state] })));
  } catch { /* 실태조사 기록이 없는 필지 */ }
}

/* ═════════════ Ctrl K — 한 문장 → 필터 · 채색 · 리별 막대 · 목록 · 카메라 ═════════════
   ⓪ 관할 가드: 질문 속 시도 · 시군구 · 읍면동이 관할 밖이면 규칙도 모델도 걸지 않고 서버 범위 가드로 넘긴다(명세 거절 문구 · 지도 무반응)
      대장과 무관한 질문(다른 서비스 · 보유 결과)도 서버(/agent/runs)로 — 대장 질의가 가로채지 않는다
   ① 규칙 매핑(명세 어휘)을 모델 호출 전에 건다 → 지도가 바로 바뀐다
   ② 모델(vLLM · 게이트웨이)은 규칙이 없거나 조건을 더할 때만
   ③ 영상 없는 관할은 대장 × V-World 조건만으로(리별 n필지) — AI 조건이면 '영상 반입 필요 · 판독 전' 한 줄 */
cmdk.el.addEventListener('submit', (e) => {
  const q = ckInput.value.trim();
  S.askRegion = regionOfText(q);
  if (S.pass) { S.pass = false; watchServer(q); return; }   // 대장 경로가 서버로 넘긴 질문(where 빈 배열 등) — 키트 기본 그대로
  // 관할 밖(로컬 판정)이면 키트 기본으로 넘긴다 — 서버 범위 가드(S-10)의 거절 문구가 그대로 한 줄로 남는다(자동 닫힘 없음)
  const out = outsideOf(q);
  if (out) { ++askSeq; asking?.abort(); S.log.push({ q, guard: out, to: 'server' }); watchServer(q); return; }
  if (!S.fused.filter(Boolean).length) { S.log.push({ q, to: 'server', why: 'no-ledger' }); watchServer(q); return; }   // 대장 결합 전 → 키트 기본(일반 질문)
  const r = routeOf(q, askCtx());
  if (r.to === 'server') { ++askSeq; asking?.abort(); S.log.push({ q, to: 'server', why: r.why }); watchServer(q); return; }   // 대장 열 조건이 없는 질문 → 키트 기본(/agent/runs)
  if (!S.index && S.srvWait) { ++askSeq; asking?.abort(); S.log.push({ q, to: 'server', why: 'server-matching' }); watchServer(q); return; }   // 대조 중 — 서버 대장 도구가 답한다
  e.preventDefault(); e.stopPropagation();
  S.log.push({ q, to: 'ledger', why: r.why });
  if (!S.index) askNoImagery(q); else ask(q);
}, true);
/* 서버 에이전트로 넘기기(대장 경로가 답을 못 만든 질문) — 실패 문구 대신 키트 기본 경로 */
function toServer(q) {
  ++askSeq; asking?.abort();
  S.pass = true; ckInput.value = q;
  delete cmdk.el.dataset.busy;
  const f = cmdk.el.querySelector('form');
  requestAnimationFrame(() => (f.requestSubmit ? f.requestSubmit() : f.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))));
}
/* 명령 바에 질문을 보낸다(필지 카드 '영상 설명' 등) */
function askBar(q) {
  cmdk.open(q);
  requestAnimationFrame(() => { const f = cmdk.el.querySelector('form'); f.requestSubmit ? f.requestSubmit() : f.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true })); });
}
/* 서버 답을 지켜본다 — '의심 필지 몇 건?' 은 서버 답(실태조사 한 출처) 뒤에 '대장과 AI가 어긋난 필지' 한 줄 + 지도 채색 */
let watching = null;
function watchServer(q) {
  S.lastServer = { q, at: Date.now() };
  watching = SUSPECT_COUNT.test(q) ? { q, seq: ++srvSeq, region: S.askRegion || null } : null;
}
let srvSeq = 0;
new MutationObserver(() => {
  const st = cmdk.el.dataset.state;
  if (!watching || st === 'busy') return;
  const w = watching; watching = null;
  if (st !== 'done') return;
  suspectFollow(w).catch((err) => K.devlog('suspect', String(err && err.message || err)));
}).observe(cmdk.el, { attributes: true, attributeFilter: ['data-state'] });
/* ═════════════ 에이전트 지도 동작(plan 3.2) — 첫 화면 지도가 처리하고 kit:agent-action-done 을 낸다 ═════════════ */
const LAYERS = { imagery: ['gf-hi', 'gf-lo'], parcels: ['lg-fill', 'lg-line', 'gv-fill', 'gv-line'], results: ['lg-fill', 'lg-line', 'gv-fill', 'gv-line'], findings: ['lg-fill', 'lg-line', 'gv-fill', 'gv-line', 'k-agent-f', 'k-agent-h', 'k-agent-l', 'k-agent-p'] };
/* 동작 끝 신호(plan 3.1) — 동작마다 한 번. 실패면 ok:false + 사용자 말 한 줄(reason) */
const done = (op, ok, reason) => { document.dispatchEvent(new CustomEvent('kit:agent-action-done', { detail: { op, ok: !!ok, by: 'gov-fusion', ...(!ok && reason ? { reason } : {}) } })); return !!ok; };
async function onAgentAction(a, once) {
  const done = (op, ok, reason) => { once(ok, reason); return !!ok; };     // 이 동작의 끝 신호(한 번)
  await baseReady;
  const map = stage.map;
  switch (a.op) {
    case 'map_region': {
      const r = a.bbox ? null : (S.regions || []).find((x) => String(x.sgg_cd) === String(a.sgg_cd || '') || x.name === a.name);
      const b = a.bbox || r?.bbox || null;
      if (b) goReady(b, { ms: 1800, maxZoom: a.emd ? 15 : 13 });                     // 읍면동 이동(fusion_goto)은 한 단계 더 가까이
      return done(a.op, b, '그 지역을 지도에서 찾지 못했습니다');
    }
    case 'map_zoom': {
      const z0 = map.getZoom();
      const z = Number.isFinite(+a.zoom) && a.zoom !== null && a.zoom !== undefined ? +a.zoom : z0 + (Number.isFinite(+a.delta) ? +a.delta : 1);
      const zz = Math.max(5, Math.min(19, z));
      if (Math.abs(zz - z0) < 0.05) return done(a.op, false, zz >= z0 && z > z0 ? '더 확대할 수 없습니다' : z < z0 ? '더 축소할 수 없습니다' : '지도가 이미 그 배율입니다');
      map.easeTo({ zoom: zz, duration: RM() ? 0 : 800 });
      return done(a.op, true);
    }
    case 'map_layer': {
      const ids = (LAYERS[a.layer] || []).filter((id) => map.getLayer(id));
      for (const id of ids) map.setLayoutProperty(id, 'visibility', a.on === false ? 'none' : 'visible');
      return done(a.op, ids.length, '이 화면에는 그 층이 없습니다');
    }
    case 'map_on': {
      const f = a.filter || {};
      if (a.set && a.set !== 'survey/findings') return done(a.op, false, '이 화면에서는 그 결과를 칠할 수 없습니다');
      if (f.ledger && !S.F && S.srvWait) { S.pendingOn = a; return done(a.op, true); }   // 서버 대조가 끝나는 대로 같은 필지를 칠한다(lateResult)
      if (f.ledger && paintLedgerOn(a)) return done(a.op, true);
      return done(a.op, await paintTopSuspects(f.sgg_cd || S.askRegion || ledgerSgg()), '칠할 필지가 없습니다');   // 대장 대조가 없으면 그 지역 의심 필지(근거 면적순 상위)
    }
    case 'map_arrive': {
      const fs = a.features || [];
      const idx = []; for (const ft of fs) { const i = S.byPnu.get(ft?.properties?.pnu); if (i !== undefined) idx.push(i); }
      if (idx.length) { const hit = new Set(idx); paint((i) => (hit.has(i) ? P.q : 0)); }
      if (fs.length) {   // 대장 밖 필지도 결과 도형으로(키트 기본과 같은 층)
        const fc = { type: 'FeatureCollection', features: fs };
        if (idx.length < fs.length) await stage.geo('agent', fc, 'ai');
        goReady(a.bbox || bboxOf(fc), { ms: 1600, maxZoom: 16, budget: 1200 });
      }
      return done(a.op, fs.length, '표시할 필지가 없습니다');
    }
    case 'map_flyto': {
      const pn = a.pnu ? String(a.pnu) : null;
      if (pn && S.byPnu.has(pn)) openParcel(pn, true);
      else if (a.bbox || a.center) goReady(a.bbox || [a.center[0] - 0.003, a.center[1] - 0.003, a.center[0] + 0.003, a.center[1] + 0.003], { ms: 1400, maxZoom: 17, budget: 1200 });
      return done(a.op, a.bbox || a.center || (pn && S.byPnu.has(pn)), '그 필지를 지도에서 찾지 못했습니다');
    }
    case 'parcel_card': {
      const pn = a.pnu ? String(a.pnu) : null;
      if (pn && S.byPnu.has(pn)) openParcel(pn, false);
      return done(a.op, pn && S.byPnu.has(pn), '그 필지는 올린 대장에 없습니다');
    }
    case 'drawer_open': return done(a.op, await openDrawer(a), '열 내용이 없습니다');
    default: return null;
  }
}
const HANDLED = new Set(['map_region', 'map_zoom', 'map_layer', 'map_on', 'map_arrive', 'map_flyto', 'parcel_card', 'drawer_open']);
document.addEventListener('kit:agent-action', (e) => {
  const a = e.detail; if (!a || !a.op || !HANDLED.has(a.op)) return;
  e.preventDefault();                               // 첫 화면이 직접 처리하고 done 을 낸다(키트 기본과 두 번 움직이지 않게)
  let sent = false;                                   // 동작마다 끝 신호 한 번(예외가 나도 두 번 내지 않는다)
  const once = (ok, reason) => { if (!sent) { sent = true; done(a.op, ok, reason); } };
  onAgentAction(a, once).catch(() => once(false, '지도 동작을 마치지 못했습니다'));
});
/* 에이전트가 연 서랍 — 통계·의심 목록 = 읍면동별 의심 필지 막대(실태조사 집계 한 출처) · 보고서 = 보고서 화면으로 · 대장 = 올리기 */
async function openDrawer(a) {
  if (a.kind === 'ledger') {
    if (S.fused.filter(Boolean).length) return false;                 // 이미 올린 대장이 있으면 결과를 지우지 않는다
    pane('drop'); return true;
  }
  if (a.kind === 'report') {
    const body = h('div.gf-dr-report', {}, h('p.gf-note', { text: '보고서 초안은 보고서 화면에서 내려받습니다' }), h('a.t-btn', { href: REPORT, text: '보고서 화면 열기' }));
    K.drawer({ title: '보고서', body, host: stageEl, slot: 'agent' });
    return true;
  }
  const sgg = curSgg();
  const j = await api(`/survey/stats?by=emd${sgg ? `&sgg=${encodeURIComponent(sgg)}` : ''}`).catch(() => null);
  let items = (j?.items || []).map((x) => ({ label: x.key, value: +(x.n?.value ?? x.n ?? 0) || 0, cd: String(x.cd || '') }));
  if (a.emd_cd) items = items.filter((x) => x.cd.startsWith(String(a.emd_cd)) || String(a.emd_cd).startsWith(x.cd));
  items = items.filter((x) => x.value > 0).sort((x, y) => y.value - x.value);
  if (!items.length) return false;
  const name = (S.regions || []).find((r) => String(r.sgg_cd) === String(sgg) || String(r.prev_cd || '') === String(sgg))?.name || S.region.name || '';
  const body = h('div.gf-dr-stats');
  const be = h('div'); body.append(h('p.gf-ans-h', { text: '읍면동별 의심 필지' }), be);
  K.bars(be, { items: items.slice(0, 12), ai: true, unit: '건' });
  K.drawer({ title: `${name} 의심 필지`.trim(), body, host: stageEl, slot: 'agent' });
  return true;
}

/* 올린 대장과 AI가 어긋난 필지(규칙 L1 · L2, 없으면 R1 = 대장 × AI 대조 · 서버 fusion_suspects 와 같은 출처 · 같은 규칙) — 의심 필지(실태조사 전체)와 다른 이름 */
const MIS = '올린 대장과 AI가 어긋난 필지';
function mismatchIdx() {
  const F = S.F; if (!F) return null;
  const v = (r) => +(F.by?.[r]?.value ?? F.by?.[r] ?? 0) || 0;
  const rules = v('L1') + v('L2') > 0 ? ['L1', 'L2'] : ['R1'];   // 대장 규칙 결과가 없으면 큰 숫자와 같은 R1(서버 대조 도구와 같은 규칙)
  const pn = new Set(F.items.filter((f) => rules.includes(f.rule)).map((f) => f.pnu));
  const out = []; for (const p of pn) { const i = S.byPnu.get(p); if (i !== undefined) out.push(i); }
  return { n: pn.size, idx: out };
}
/* 대장 대조 채색(map_on {rule, ledger}) — 이 화면 결합표의 같은 규칙 필지 */
function paintLedgerOn(a) {
  const rules = String(a.filter?.rule || '').split(',').map((x) => x.trim()).filter(Boolean);
  const place = String(a.filter?.place || '');                                  // 서버가 센 리/읍면동(fusion_mismatch) — 같은 필지만 칠한다
  const inPlace = (x) => !place || String(x.addr || '').split(/\s+/).includes(place);
  const pn = new Set((S.F?.items || []).filter((x) => (!rules.length || rules.includes(x.rule)) && inPlace(x)).map((x) => x.pnu));
  const idx = []; for (const p of pn) { const i = S.byPnu.get(p); if (i !== undefined) idx.push(i); }
  if (!idx.length) return false;
  S.query = { where: [], hits: idx, label: String(a.label || MIS).replace(/\s*·\s*저장 안 됨$/, ''), big: false, focus: place, evKey: 'AI 건물(㎡)', lines: [] };
  applyQuery();
  return true;
}
/* 대장 대조 결과가 없는 관할 — 실태조사 의심 필지 상위(점수순 200)를 지도에 점으로 칠한다 */
async function paintTopSuspects(sgg) {
  const j = await api(`/survey/findings?sort=score&limit=200${sgg ? `&sgg=${encodeURIComponent(sgg)}` : ''}`).catch(() => null);
  const feats = (j?.items || []).filter((f) => Array.isArray(f.lnglat) && Number.isFinite(f.lnglat[0]))
    .map((f) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: f.lnglat }, properties: { pnu: f.pnu } }));
  if (!feats.length) return false;
  const fc = { type: 'FeatureCollection', features: feats };
  await stage.geo('agent', fc, 'ai'); goReady(bboxOf(fc), { ms: 1600, maxZoom: 14 });
  return true;
}
async function suspectFollow(w) {
  const ans = $('.k-ck-a', cmdk.el);
  if (ans && /어긋난/.test(ans.textContent)) return;   // 서버가 이미 대장 대조까지 답했다(지도 채색은 map_on 으로)
  if (w.region && w.region !== ledgerSgg()) return;    // 다른 지역 질문 — 대장 대조 숫자를 섞지 않는다
  const m = mismatchIdx();
  if (m && ans) {
    const p = h('p.gf-ck-more', { html: `${esc(MIS)} <span class="k-num" data-metric="${esc(MIS)}" data-v="${m.n}">${nf(m.n)}<small>필지</small></span>${m.n ? ' · 지도에 표시했습니다' : ''}` });
    p.append(K.sigEl(est(m.n)));
    ans.append(p);
  }
  if (m && m.idx.length) {
    S.query = { where: [], hits: m.idx, label: MIS, big: false, focus: '', evKey: 'AI 건물(㎡)', lines: [] };
    applyQuery();
  } else await paintTopSuspects();
  S.log.push({ q: w.q, used: 'server+mismatch', n: m?.n ?? null });
}
function sayOnly(text, ms = 1800) {
  const planEl = $('.k-ck-plan', cmdk.el), ans = $('.k-ck-a', cmdk.el);
  cmdk.el.dataset.state = 'done';
  planEl.hidden = true; planEl.innerHTML = '';
  ans.hidden = false; ans.innerHTML = `<b>${esc(text)}</b>`;
  delete cmdk.el.dataset.busy;
  const seq = ++askSeq; setTimeout(() => { if (askSeq === seq) cmdk.close(); }, ms);
}
/* 관할 가드 — 관할 안 이름을 지운 뒤 남는 시도 · 시군구(전국 목록) · 읍면동(관할 목록이 온전할 때) */
function outsideOf(q) {
  if (!q) return null;
  const R = S.region;
  const inside = new Set([R.name, ...String(R.full || '').split(/\s+/), ...(S.places || placesOf())].filter((x) => x && x.length >= 2));
  for (const r of S.regions || []) if (r.in_scope) { inside.add(r.name); inside.add(r.full); }
  let s = q; for (const n of [...inside].sort((a, b) => b.length - a.length)) s = s.split(n).join(' ');
  const full = String(R.full || '') + ' ' + [...inside].join(' ');
  for (const sd of SIDO) if (s.includes(sd) && !full.includes(sd)) return sd;
  for (const r of S.regions || []) {
    if (r.in_scope) continue;
    const rn = String(r.name || '');
    for (const nm of new Set([rn, rn.split(/\s+/)[0]])) {        // '○○시 ○○구' 는 시 이름으로도 부른다
      const short = nm.replace(/(시|군|구)$/, '');
      if (nm.length >= 2 && s.includes(nm)) return nm;
      if (short.length >= 2 && new RegExp(short + '(?:시|군|구|에서|의|\\s|$)').test(s)) return nm;
    }
  }
  /* 서버는 기관 계정에 관할 밖 시군구 목록을 주지 않는다(원칙 39) — 관할 안 이름을 지우고도 남는 '○○시 · ○○군 · ○○구'는 관할 밖으로 보고 서버 범위 가드에 맡긴다 */
  for (const m of s.matchAll(/(?:^|\s)([가-힣]{2,5}(?:시|군|구))(?=$|[\s,?·]|에서|에|의|은|는|이|가)/g)) {
    if (!inside.has(m[1])) return m[1];
  }
  if (S.emd.size) {   // 읍면동 목록이 온전한 관할만 — 낱말 앞이 띄어 쓴 이름이고, '…하면 · 없으면 · 이동' 같은 말은 빼고
    const m = [...s.matchAll(/(?:^|\s)([가-힣]{1,5}(?:읍|면|동))(?=$|[\s,?·]|에서|에|의|은|는|이|가)/g)].map((x) => x[1]);
    for (const t of m) {
      if (/동$/.test(t) && t.length < 3) continue;
      if (/(으|하|이|라|다|려|나|되|지|없|있|않|보|오|가|해|했|된|는)면$/.test(t)) continue;
      if (!inside.has(t)) return t;
    }
  }
  return null;
}
function placesOf() {
  const pl = new Set(); for (const o of S.fused) if (o && o._ri) pl.add(o._ri); for (const [, e] of S.emd) if (e.name) pl.add(e.name);
  return [...pl];
}
function ledgerSgg() {                                                           // 화면에 올린 대장의 시군구 — 서버 기록 → 이은 필지 → 대장 주소 열의 지명
  const s = ledgerSggOf(S.srv, S.rec?.match); if (s || S.srv?.sgg?.length) return s;
  const rows = S.rec?.rows; const cols = (S.cols || []).filter((c) => c.role === 'jibun').map((c) => c.col);
  if (!rows?.length || !cols.length) return null;
  const c = new Map();
  for (const r of rows.slice(0, 300)) { const k = regionOf(cols.map((x) => String(r[x] ?? '')).join(' '), S.regions, S.emd); if (k) c.set(k, (c.get(k) || 0) + 1); }
  return c.size ? [...c.entries()].sort((a, b) => b[1] - a[1])[0][0] : null;
}
function regionOfText(q) { return regionOf(q, S.regions, S.emd); }          // 질문 속 관할 시군구 · 읍면동
let asking = null;
/* 대장 필터가 세는 대상의 이름 — 이 창에 대장 행이 있으면 올린 대장 필지, 새 기기(서버 결과로 만든 결합표)면 AI 결과가 있는 대장 필지 */
function baseLabel() { return S.rec?.rows || S.fullRows ? '올린 대장 필지' : 'AI 결과가 있는 대장 필지'; }   // 결합표가 대장 필지 전체일 때만 '올린 대장 필지'
function askCtx() {
  const jibs = (S.cols || []).filter((c) => c.role === 'jibun');
  const stCol = colOf('state'), adCol = jibs.length > 1 ? ADDR_ALL : jibs[0]?.col;
  const ledgerCols = (S.cols || []).filter((c) => c.role !== 'skip').map((c) => c.col);
  if (adCol === ADDR_ALL) ledgerCols.unshift(ADDR_ALL);
  const samples = {};
  const rows = S.rec?.rows || null;
  for (const c of S.cols || []) if (c.role === 'state' || c.role === 'jibun') {
    const seen = new Map(); for (const r of (rows || S.fused).slice(0, 3000)) { const v = String((r && r[c.col]) ?? '').trim(); if (v) seen.set(v, (seen.get(v) || 0) + 1); }
    samples[c.col] = seen.size <= 40 ? [...seen.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map((x) => x[0]).join(', ') : [...seen.keys()][0];
  }
  for (const k of ['V-World 지목', 'V-World 용도지역', 'V-World 농업진흥']) {
    const seen = new Map(); for (const o of S.fused.slice(0, 4000)) { const v = o && String(o[k] ?? '').trim(); if (v) seen.set(v, (seen.get(v) || 0) + 1); }
    if (seen.size) samples[k] = [...seen.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map((x) => x[0]).join(', ');
  }
  if (!S.places) S.places = placesOf();
  const ledgerPlaces = [...new Set(S.fused.map((o) => o && o._ri).filter(Boolean))];
  return { ledgerCols, samples, region: S.region.name, stateCol: stCol, addrCol: adCol, places: S.places, ledgerPlaces, baseLabel: baseLabel() };
}
let askSeq = 0;
/* 영상 없는 관할 — 모델을 부르지 않는다(판독 전 · 지어내지 않는다) */
function askNoImagery(q) {
  const ctx = askCtx(); const k = keysOf(q);
  if (k.bld || k.park || k.gh || k.fal) { sayOnly(noImagery() ? '영상 등록 필요 · AI 분석 전' : 'AI 분석 전', 2200); S.log.push({ q, used: 'no-imagery' }); return; }
  const R = rulePlan(q, ctx);
  const where = R.where.filter((w) => !/^AI |^V-World /.test(w.field));
  const hits = run(where, S.fused);
  const planEl = $('.k-ck-plan', cmdk.el), ans = $('.k-ck-a', cmdk.el);
  cmdk.el.dataset.state = 'done';
  const lines = conditionLines(where, ctx);
  planEl.hidden = !lines.length; planEl.innerHTML = lines.map((l) => `<li class="is-done">${esc(l)}</li>`).join('');
  const label = [R.focus, baseLabel()].filter(Boolean).join(' · ');
  ans.hidden = false; delete cmdk.el.dataset.busy;
  ans.innerHTML = hits.length ? `<b>${esc(label)}</b> <span class="k-num" data-metric="${esc(label)}" data-v="${hits.length}">${nf(hits.length)}<small>필지</small></span>` : '<b>조건에 맞는 필지가 없습니다</b>';
  S.query = { where, hits, label, focus: R.focus, lines };
  const hit = new Set(hits);
  paint((i) => (hit.has(i) ? P.q : P.base));
  ansHead(label, hits.length, env(hits.length, '필지', 'measured', '대장 × 연속지적', ''));
  const g = new Map(); for (const i of hits) { const kk = S.fused[i]._ri || '—'; g.set(kk, (g.get(kk) || 0) + 1); }
  const items = [...g.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([l, value]) => ({ label: l, value }));
  if (items.length > 1) { const be = h('div'); ansEl.append(be); K.bars(be, { items, ai: true, unit: '필지' }); }
  const pool = hits.map((i) => S.fused[i]).filter((o) => o._bb);
  if (pool.length) goReady(pool.reduce((a, o) => grow(a, o._bb), NONE), { ms: 1600, maxZoom: 15, budget: 1200 });
  const seq = ++askSeq; setTimeout(() => { if (askSeq === seq) cmdk.close(); }, 1600);
  S.log.push({ q, used: 'ledger-only', n: hits.length });
}
async function ask(q) {
  if (!q) return;
  asking?.abort(); asking = new AbortController(); const sig = asking.signal; const seq = ++askSeq;
  const planEl = $('.k-ck-plan', cmdk.el), ans = $('.k-ck-a', cmdk.el);
  planEl.hidden = false; planEl.innerHTML = '<li>&nbsp;</li><li>&nbsp;</li><li>&nbsp;</li>';
  ans.hidden = false; ans.innerHTML = '<span class="k-ck-dots" aria-hidden="true"><i></i><i></i><i></i></span>';
  cmdk.el.dataset.busy = '1'; cmdk.el.dataset.state = 'busy';
  const t0 = performance.now();
  const ctx = askCtx();
  const R = rulePlan(q, ctx);
  const rec = { q, rule: R.where.length };
  S.log.push(rec);
  const closeLater = (ms) => setTimeout(() => { if (askSeq === seq) cmdk.close(); }, ms);
  const show = (where, focus, runId) => {
    delete cmdk.el.dataset.busy; cmdk.el.dataset.state = 'done';
    const hits = run(where, S.fused);
    const lb = labelOf(where, ctx, focus);
    const aiW = where.find((w) => /^AI (건물|주차장|비닐하우스)\(/.test(w.field));
    const evKey = aiW ? aiW.field : where.some((w) => w.field === 'AI 경작 흔적 없음') ? 'V-World 면적(㎡)' : 'AI 건물(㎡)';
    S.query = { where, hits, label: lb.label, big: lb.big, focus, evKey, lines: conditionLines(where, ctx), run_id: runId };
    planEl.innerHTML = S.query.lines.map((l) => `<li class="is-done">${esc(l)}</li>`).join('');
    ans.innerHTML = hits.length
      ? `<b>${esc(lb.label)}</b> <span class="k-num" data-metric="${esc(lb.label)}" data-v="${hits.length}">${nf(hits.length)}<small>필지</small></span>`
      : '<b>조건에 맞는 필지가 없습니다</b>';
    if (R.unmet) ans.insertAdjacentHTML('beforeend', `<p class="gf-ck-more">대장에 지목 열이 없어 '${esc(R.unmet)}' 조건은 빼고 셌습니다</p>`);   // 물어본 조건을 뺐으면 밝힌다
    applyQuery();
    return hits.length;
  };
  if (R.where.length) { show(R.where, R.focus, null); rec.answer_ms = Math.round(performance.now() - t0); rec.used = 'rule'; closeLater(1400); }
  const onStep = R.where.length ? null : (i, s) => { const li = planEl.children[i]; if (li) { li.textContent = String(s).replace(/V-World\s*|브이월드\s*/gi, '').replace(/[.。]\s*$/, ''); li.classList.add('is-done'); } };
  let final = null, p = null, tries = 0;
  for (; tries < (R.where.length ? 1 : 2) && !final; tries++) {
    try { p = await plan(tries ? `${q} (질문에 있는 조건만)` : q, ctx, onStep, sig); }
    catch (err) { if (err.name === 'AbortError') return; K.devlog('ask error', String(err && err.message || err)); rec.err = String(err && err.message || err); p = null; break; }
    const ok = agrees(p.where, q, ctx);
    (rec.model ||= []).push({ ms: Math.round(p.ms), first_ms: Math.round(p.first_ms || 0), n: p.where.length, ok });
    if (ok) final = R.where.length ? merge(R.where, p.where, q, ctx) : p.where;
    else K.devlog('ask', `어긋남 ${tries + 1} · ${JSON.stringify(p.where)}`);
  }
  if (sig.aborted || askSeq !== seq) return;
  rec.model_ms = Math.round(performance.now() - t0);
  if (R.where.length) {
    if (final && final.length > R.where.length) { show(final, R.focus || p?.focus || '', p?.run_id); rec.used = 'rule+model'; }
    else if (S.query) S.query.run_id = p?.run_id;
  } else {
    if (!final) { rec.used = 'server'; planEl.hidden = true; planEl.innerHTML = ''; toServer(q); return; }   // where 빈 배열 · 어긋남 = 실패가 아니라 서버 에이전트 몫
    show(final, p?.focus || '', p?.run_id); rec.used = 'model'; rec.answer_ms = rec.model_ms;
  }
  K.devlog('ask', `답 ${rec.answer_ms} ms · 모델 ${rec.model_ms} ms · ${rec.used} · ${JSON.stringify(S.query?.where)}`);
  if (!R.where.length) closeLater(S.query?.hits.length ? 1400 : 2600);
}
function applyQuery() {
  const Q = S.query; const hit = new Set(Q.hits);
  paint((i) => (hit.has(i) ? P.q : 0));
  for (const b of smallEl.querySelectorAll('.gf-chip')) b.setAttribute('aria-pressed', 'false');
  if (Q.big) setBig(Q.label, est(Q.hits.length)); else bigDefault();
  if (!Q.hits.length) {
    ansEl.innerHTML = ''; ansEl.hidden = false;
    ansEl.append(h('p.gf-ans-h', { text: '조건에 맞는 필지가 없습니다' }), h('ul.gf-cond', { html: Q.lines.map((l) => `<li>${esc(l)}</li>`).join('') }));
  } else {
    ansHead(Q.label, Q.hits.length);
    const g = new Map(); for (const i of Q.hits) { const k = S.fused[i]._ri || '—'; g.set(k, (g.get(k) || 0) + 1); }
    const items = [...g.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([label, value]) => ({ label, value }));
    Q.bars = items.length > 1;
    if (Q.bars) { const be = h('div'); ansEl.append(be); K.bars(be, { items, ai: true, unit: '필지' }); }
  }
  const rows = rowsOf(Q.hits, Q.evKey); resTable?.set(rows); loadLedgerCells(rows);
  let pool = Q.hits.map((i) => S.fused[i]).filter((o) => o._bb);
  if (Q.focus) { const fp = pool.filter((o) => o._jb.includes(Q.focus) || o._ri === Q.focus); if (fp.length) pool = fp; }
  if (pool.length) goReady(pool.reduce((a, o) => grow(a, o._bb), NONE), { ms: 1600, maxZoom: 16, budget: 1400 });
  requestAnimationFrame(padStage);
}

/* ═════════════ 내려받기 · 다른 파일 ═════════════ */
function download() {
  const idx = S.query ? S.query.hits : S.index ? catIdx(S.cat) : S.fused.map((o, i) => (o ? i : -1)).filter((i) => i >= 0);
  const ledgerCols = S.rec?.rows ? (S.cols || []).filter((c) => c.role !== 'skip').map((c) => c.col) : [];
  const q = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const heads = ['지번', ...ledgerCols, '대장', 'AI 분석', '용도지역', '상태', 'PNU'];
  const lines = [heads.join(',')];
  const evKey = S.query ? S.query.evKey : EVKEY[S.cat];
  for (const i of idx) {
    const o = S.fused[i]; if (!o) continue;
    lines.push([o._jb, ...ledgerCols.map((c) => o[c]), o._state, S.index ? aiText(o, evKey) : '', YD(o['V-World 용도지역']), STATE_KO[stateOf(o._pnu)] || '—', o._pnu].map(q).join(','));
  }
  const label = S.query ? S.query.label : S.index ? { bld: '농지_건물', park: '농지_주차장', fal: '경작_흔적_없음' }[S.cat] : '결합';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  a.download = `${String(fileName() || '대장').replace(/\.[^.]+$/, '')}_${String(label).replace(/[\\/:*?"<>|\s·()]+/g, '_')}.csv`;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  K.toast('내려받았습니다');
}
function reset() {
  const src = srcId();
  if (src === 'sv') stage.map.removeFeatureState({ source: 'sv', sourceLayer: 'parcels' });
  else if (src === 'gf-vw') stage.map.getSource('gf-vw').setData({ type: 'FeatureCollection', features: [] });
  if (S.index?.server) { S.index = null; vwPaint(false); }
  painted = new Map(); S.fused = []; S.byPnu.clear(); S.query = null; S.rec = null; S.places = null; S.ledgerBB = null; S.srv = null; S.F = null; S.capOk = null; S.pendingId = null; S.srvWait = false;
  S.srvRows = null; S.fullRows = false; S.uploader = null;
  bigCard.hidden = true; if (S.index) ingestCard.hidden = true;
  K.closeAll(); dz.reset(); paintDrop(); pane('drop');
  goReady(S.region.bbox, { ms: 1600, maxZoom: S.index ? 12 : 11 });
}

/* ═════════════ 관할 · 지도 층 ═════════════ */
function resolveRegion(dep, fin, emd) {
  const R = { id: who.me.tenant_id, full: '', name: '', sgg: null, bbox: null, ai: null };
  const mine = ((dep && dep.items) || []).filter((d) => d.tenant_id === who.me.tenant_id);
  const orgFull = who.tenant?.name?.ko || who.org || '';
  R.full = S.wide ? orgFull : mine.map((d) => d.region_name && d.region_name.ko).find(Boolean) || orgFull;
  let bb = null;
  const g = (b) => { if (!b) return; bb = bb ? grow(bb, b) : [...b]; };
  for (const d of mine) g(bboxOf(d.aoi));
  for (const it of (emd && emd.items) || []) if (it.bbox && it.bbox.length === 4) { S.emd.set(it.cd, { name: it.key, bbox: it.bbox }); g(it.bbox); }
  const f = fin && fin.items && fin.items[0];
  if (f && !S.wide) R.sgg = [String(f.pnu).slice(0, 5)];   // 광역은 첫 필지의 시군구로 좁히지 않는다(관할 전체 · 시군구는 사용자가 고름)
  if (!R.full && f) R.full = String(f.addr || '').split(/\s+/).slice(0, 2).join(' ');
  R.name = String(R.full).trim().split(/\s+/).pop() || '';
  R.bbox = bb || KOREA;
  R.hasFindings = !!f;
  return R;
}
/* 관할 코드 — 배포 기록 · 실태조사 기록이 없으면 전국 지역 목록(in_scope)에서 */
function scopeCodes() {
  if (S.region.sgg) return S.region.sgg;
  const c = new Set((S.regions || []).filter((r) => r.in_scope).map((r) => String(r.sgg_cd)));
  const full = String(S.region.full || '');
  for (const [k, cd] of SIDO_CD) if (full.includes(k)) c.add(cd);        // 경계 타일은 옛 시도 코드일 수 있다
  return c.size ? [...c] : null;
}
async function mountLayers() {
  await baseReady;
  const map = stage.map; const R = S.region;
  R.sgg = scopeCodes();
  if (!R.hasFindings) { const bbs = (S.regions || []).filter((r) => r.in_scope && r.bbox).map((r) => r.bbox); if (bbs.length && R.bbox === KOREA) R.bbox = bbs.reduce((a, b) => grow(a, b), NONE); }
  const mine = R.sgg ? ['any', ...R.sgg.map((c) => ['==', ['slice', ['to-string', ['get', 'code']], 0, c.length], c])] : ['==', ['get', 'code'], '__'];
  // 관할 밖 딤 없음 · 관할 경계선만(사진 위 흰 선 + 옅은 그림자)
  // 시군구 경계는 z11 해상도(해안에서 1–2km 마디) — 필지 줌에서는 바다 위로 선이 지나가지 않게 걷는다
  const fade = ['interpolate', ['linear'], ['zoom'], 10.5, 1, 11.5, 0];
  map.addLayer({ id: 'gf-sgg-shadow', type: 'line', source: 'gf-sgg', 'source-layer': 'sigungu', filter: mine, maxzoom: 11.5, paint: { 'line-color': 'rgba(28,31,37,.35)', 'line-width': 4, 'line-blur': 3, 'line-opacity': fade } }, 'slot-overlay');
  map.addLayer({ id: 'gf-sgg-line', type: 'line', source: 'gf-sgg', 'source-layer': 'sigungu', filter: mine, maxzoom: 11.5, paint: { 'line-color': '#FFFFFF', 'line-width': ['interpolate', ['linear'], ['zoom'], 7, 1, 11, 1.6], 'line-opacity': fade } }, 'slot-overlay');
  if (!R.ai) return;
  const url = location.origin + R.ai;
  S.index = new AiIndex(url, pmtilesOf('pmtiles://' + url));
  map.addSource('sv', { type: 'vector', url: 'pmtiles://' + url, promoteId: { parcels: 'pnu' } });
  const k = ['coalesce', ['feature-state', 'k'], 0];
  const ai = css('--ai'), warn = css('--warn'), lock = css('--lock');
  map.addLayer({ id: 'lg-fill', type: 'fill', source: 'sv', 'source-layer': 'parcels',
    paint: { 'fill-color': ['match', k, P.base, ai, P.fal, lock, warn],
      'fill-opacity': ['interpolate', ['linear'], ['zoom'], 11, ['match', k, 0, 0, P.base, 0.28, 0.9], 14, ['match', k, 0, 0, P.base, 0.16, 0.55], 16, ['match', k, 0, 0, P.base, 0.06, 0.2], 17, ['match', k, 0, 0, P.base, 0.03, 0.12]] } }, 'gf-sgg-shadow');
  map.addLayer({ id: 'lg-line', type: 'line', source: 'sv', 'source-layer': 'parcels', minzoom: 12.5,
    paint: { 'line-color': ['match', k, P.base, '#FFFFFF', P.fal, lock, warn], 'line-width': ['interpolate', ['linear'], ['zoom'], 12.5, ['match', k, P.base, 0.3, 0.8], 16, ['match', k, P.base, 1, 2.2]], 'line-opacity': ['match', k, 0, 0, P.base, 0.35, 0.95] } }, 'gf-sgg-shadow');
  map.addLayer({ id: 'lg-hl', type: 'line', source: 'sv', 'source-layer': 'parcels', filter: ['==', ['get', 'pnu'], '__'], paint: { 'line-color': '#FFFFFF', 'line-width': 3 } }, 'slot-overlay');
  map.on('click', 'lg-fill', (e) => { const f = e.features && e.features[0]; if (f && S.byPnu.has(f.properties.pnu)) openParcel(f.properties.pnu, false); });
  map.on('mousemove', 'lg-fill', (e) => { const f = e.features && e.features[0]; map.getCanvas().style.cursor = f && S.byPnu.has(f.properties.pnu) ? 'pointer' : ''; });
  map.on('mouseleave', 'lg-fill', () => { map.getCanvas().style.cursor = ''; });
}
/* 새 시군구(정적 필지 층 없음) — 서버가 대장 필지에 AI 결과를 이어 붙였으면 서버 필지 색인으로 바꾼다(AI 분석 전 → 숫자).
   지도 = 같은 서버 필지(GeoJSON)를 결과 색(건물 · 주차장 · 경작 흔적 없음)으로 칠한다. 필지 · AI 값 · 규칙 결과가 한 출처. */
async function useServerIndex(d) {
  const ix = new ServerIndex(who.me.tenant_id, d.import_id);
  await ix.fetch();
  if (!ix.size) return;
  S.index = ix;
  await baseReady;
  painted = new Map();
  mountVw(ix.features);
  vwPaint(true);
  ingestCard.hidden = true;
  if (S.rec?.rows) fuse(S.rec);
  K.devlog('srv-index', `서버 필지 ${ix.size} · AI ${ix.ai?.parcels ?? 0}`);
}
/* gf-vw 칠 — 결과 색(서버 색인) ↔ 영상 없는 관할의 옅은 청록 */
function vwPaint(on) {
  const map = stage.map; if (!map.getLayer('gv-fill')) return;
  const k = ['coalesce', ['feature-state', 'k'], 0];
  const ai = css('--ai'), warn = css('--warn'), lock = css('--lock');
  if (on) {
    map.setPaintProperty('gv-fill', 'fill-color', ['match', k, P.base, ai, P.fal, lock, warn]);
    map.setPaintProperty('gv-fill', 'fill-opacity', ['interpolate', ['linear'], ['zoom'], 11, ['match', k, 0, 0, P.base, 0.28, 0.9], 14, ['match', k, 0, 0, P.base, 0.16, 0.55], 16, ['match', k, 0, 0, P.base, 0.06, 0.2], 17, ['match', k, 0, 0, P.base, 0.03, 0.12]]);
    map.setPaintProperty('gv-line', 'line-color', ['match', k, P.base, '#FFFFFF', P.fal, lock, warn]);
    map.setPaintProperty('gv-line', 'line-opacity', ['match', k, 0, 0, P.base, 0.35, 0.95]);
  } else {
    map.setPaintProperty('gv-fill', 'fill-color', ['match', k, -1, ai, ai]);         // 끈 때도 feature-state 식(상수 ↔ 식 전환 = maplibre 타일 칠 오류)
    map.setPaintProperty('gv-fill', 'fill-opacity', ['interpolate', ['linear'], ['zoom'], 11, ['match', k, 0, 0, P.q, 0.7, 0.4], 14, ['match', k, 0, 0, P.q, 0.45, 0.22], 16, ['match', k, 0, 0, P.q, 0.25, 0.1]]);
    map.setPaintProperty('gv-line', 'line-color', ['match', k, -1, '#FFFFFF', '#FFFFFF']);
    map.setPaintProperty('gv-line', 'line-opacity', ['match', k, 0, 0, 0.9]);
  }
}
/* 영상 없는 관할 — V-World 경계(흰 윤곽 · 옅은 청록 채움) · 결합 스윕도 같은 feature-state */
function mountVw(features) {
  const map = stage.map;
  S.vw = new Map(); S.vwProps = new Map();
  for (const f of features) { S.vw.set(f.properties.pnu, bboxOfFeature(f)); S.vwProps.set(f.properties.pnu, String(f.properties.addr || '').split(/\s+/).slice(-2).join(' ')); }
  const fc = { type: 'FeatureCollection', features };
  if (map.getSource('gf-vw')) { map.getSource('gf-vw').setData(fc); return; }
  map.addSource('gf-vw', { type: 'geojson', data: fc, promoteId: 'pnu' });
  const k = ['coalesce', ['feature-state', 'k'], 0];
  const ai = css('--ai');
  // 칠 속성은 처음부터 feature-state 식 — vwPaint 가 켜고 끌 때 상수 ↔ 식으로 바뀌면 불러오는 타일에서 'expression.evaluate' 오류가 나고 지도 이동이 멈춘다
  map.addLayer({ id: 'gv-fill', type: 'fill', source: 'gf-vw', paint: { 'fill-color': ['match', k, -1, ai, ai], 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 11, ['match', k, 0, 0, P.q, 0.7, 0.4], 14, ['match', k, 0, 0, P.q, 0.45, 0.22], 16, ['match', k, 0, 0, P.q, 0.25, 0.1]] } }, 'gf-sgg-shadow');
  map.addLayer({ id: 'gv-line', type: 'line', source: 'gf-vw', paint: { 'line-color': ['match', k, -1, '#FFFFFF', '#FFFFFF'], 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 0.4, 15, 1.4], 'line-opacity': ['match', k, 0, 0, 0.9] } }, 'gf-sgg-shadow');
  map.addLayer({ id: 'gv-hl', type: 'line', source: 'gf-vw', filter: ['==', ['get', 'pnu'], '__'], paint: { 'line-color': '#FFFFFF', 'line-width': 3 } }, 'slot-overlay');
  map.on('click', 'gv-fill', (e) => { const f = e.features && e.features[0]; if (f && S.byPnu.has(f.properties.pnu)) openParcel(f.properties.pnu, false); });
  map.on('mousemove', 'gv-fill', (e) => { const f = e.features && e.features[0]; map.getCanvas().style.cursor = f && S.byPnu.has(f.properties.pnu) ? 'pointer' : ''; });
  map.on('mouseleave', 'gv-fill', () => { map.getCanvas().style.cursor = ''; });
}

/* ═════════════ 새 기기 · 새 프로필 — 서버 기록으로 결과를 다시 그린다 ═════════════ */
async function serverOpen(d) {
  loadingPane();
  S.rec = null; S.fLoading = true;
  await takeServer(d).catch(() => null); S.fLoading = false; tm('open-server');
  if (S.index && S.F) {
    // 결합표 = 서버가 대장에 이은 필지 전체(대장 값 · 규칙 결과 · 용도지역) — AI 분석 색인(Ctrl K · 필지 카드)은 뒤에서 채운다
    if (!S.fullRows) fuseFromFindings();
    result(); tm('result');
    const pts = S.fused.map((o) => o._bb).filter(Boolean);
    if (pts.length) goResult(pts, { ms: 900, maxZoom: 15, budget: 500 }).then(() => tm('open-cam'));
    const emds = [...new Set(S.fused.map((o) => String(o._pnu).slice(0, 8)))];
    const bbs = emds.map((cd) => (S.emd.get(cd) || {}).bbox).filter(Boolean);
    if (bbs.length) S.index.load(bbs).then(() => { tm('open-index'); if (S.rec || S.srv !== d) return; if (!(S.srvRows?.id === d.import_id && applyServerRows(S.srvRows.items))) fuseFromFindings(); if (!S.query) showCat(S.cat); }).catch(() => null);
    return;
  }
  if (!S.index) {
    await S.capP;
    const feats = S.capFeats || [];
    if (feats.length) mountVw(feats);
    S.fused = feats.map((f) => { const a = parseAddr(String(f.properties.addr || ''), ''); return { _pnu: f.properties.pnu, _bb: bboxOfFeature(f), _ri: a.ri || a.emd || '', _jb: String(f.properties.addr || '').split(/\s+/).slice(-2).join(' '), _state: '' }; });
    S.byPnu.clear(); S.fused.forEach((o, i) => S.byPnu.set(o._pnu, i));
    for (const o of S.fused) setK(o._pnu, P.base);
  }
  result(); tm('result');
}

/* 이어 열기 — 이 창에 행 캐시가 있는 반입(같은 대장 · 같은 결과로 이미 결합됨). 결합 진행 · 서→동 스윕을 다시 틀지 않고 곧바로 결과.
   서버 기록(registry?latest=1 → 결합 결과)이 이미 있으면 그대로 쓰고, 결합 중이면 끝나는 대로 그 자리에서 바꾼다. */
async function reopen(rec) {
  if (panes.result.hidden) loadingPane();
  S.rec = rec;
  const d = S.srv && S.srv.state === 'matched' && (!rec.server_id || S.srv.import_id === rec.server_id) ? S.srv : null;
  if (S.index && rec.aiCache?.length) S.index.seed(rec.aiCache);
  if (!S.index && rec.vwCache) mountVw(rec.vwCache);
  fuse(rec); tm('matched');
  S.fLoading = !!d;
  if (d) await takeServer(d).catch(() => null);
  S.fLoading = false;
  result(); tm('result');
  const cam = () => { const it = S.fused.filter((o) => o && o._bb); if (!it.length) return; S.ledgerBB = it.reduce((a, o) => grow(a, o._bb), NONE); goResult(it.map((o) => o._bb), { ms: 1000, maxZoom: S.index ? 15.5 : 15, budget: 1000 }); };
  cam();
  // 뒤에서 채우기 — AI 분석 색인 · V-World 경계 · 아직 결합 중인 서버 기록
  if (S.index && !rec.aiCache?.length) {
    const emds = [...new Set(rec.match.filter(Boolean).map((p) => p.slice(0, 8)))];
    const bbs = emds.map((cd) => (S.emd.get(cd) || {}).bbox).filter(Boolean);
    S.index.load(bbs.length ? bbs : [S.region.bbox]).then(() => {
      if (S.rec !== rec) return;
      rec.aiCache = S.index.dump(rec.match.filter(Boolean)); S.store.save(rec);
      fuse(rec); if (S.srvRows && S.srvRows.id === S.srv?.import_id) applyServerRows(S.srvRows.items); addServerRows(); applySets(); if (!S.query) showCat(S.cat); if (!S.ledgerBB) cam();
    }).catch(() => null);
  }
  if (!S.index && !rec.vwCache) {
    vwParcels(rec.match.filter(Boolean)).then((f) => { if (S.rec !== rec) return; rec.vwCache = f; mountVw(f); S.store.save(rec); fuse(rec); for (const o of S.fused) if (o) setK(o._pnu, P.base); result(); cam(); }).catch(() => null);
  }
  if (!d && rec.server_id) serverDone(rec.server_id).then((dd) => dd && S.rec === rec && takeServer(dd).then(() => { if (S.rec !== rec) return; if (S.index && !S.query) result(); else paintRate(); }));
}

/* ═════════════ 할 일 수 · 기관 스트림 ═════════════ */
async function refreshTodo() {
  try { const j = await api('/survey/findings?limit=1'); S.counts = j.counts; paintTodo(); shell.fresh(new Date()); } catch { /* */ }
}
if (await hasRoute('/events/tenant')) {
  sse('/events/tenant', { events: ['finding.state'], on: (_, d) => { if (d && d.pnu && d.state) { S.states.set(d.pnu, d.state); const f = findingOf(d.pnu); if (f && (!d.id || d.id === f.id)) f.state = d.state; resTable && S.fused.length && resTable.set(currentRows()); } refreshTodo(); } });
}

/* ═════════════ 시작 — 전국 → 관내 (최근 반입이 있으면 곧바로 이어 연다) ═════════════ */
async function resumeSafe() { try { return { ok: true, v: await S.store.resume() }; } catch (e) { K.devlog('resume', String(e && e.message || e)); return { ok: false }; } }
/* 이어 열기 조회가 실패했을 때 — 빈 '대장 올리기' 대신 '다시 여는 중' + 다시 시도 한 번 */
function reopenFail() {
  panes.result.innerHTML = '';
  const e = h('div'); panes.result.append(e);
  K.empty(e, { kind: 'loading', title: '대장을 다시 여는 중', compact: true, action: { label: '다시 시도', onClick: (ev) => { if (ev?.currentTarget) ev.currentTarget.disabled = true; loadingPane(); openLast(resumeSafe()); } } });
  eager(e);
  pane('result');
}
/* 이 사람의 최근 대장(서버 기억)을 연다 — 캐시가 같은 반입이면 빨리, 아니면 서버 결합 필지로. 결합 중이면 끝나는 대로 */
async function openLast(p) {
  const R = S.region;
  let got = await p;
  if (!got.ok) { await wait(1500); got = await resumeSafe(); }          // 한 번은 조용히 다시
  if (!got.ok) { reopenFail(); return; }
  const g = got.v; tm('resume');
  S.srv = g?.server || null; S.resumeFrom = g?.from || null; S.whose = g?.whose || null; S.uploader = g?.uploader || null;
  if (S.srv && KIND_LABEL[S.srv.kind]) { S.kind = KIND_LABEL[S.srv.kind]; paintDrop(); }
  const last = g?.rec;
  if (last && last.match && last.rows?.length) {
    S.rec = last; S.cols = (last.columns_guess || []).map((c) => ({ ...c, role: (last.mapping || {})[c.col] || c.role }));
    join({ resume: last });
    return;
  }
  if (S.srv && S.srv.state === 'matching') {                            // 올린 직후 새로 고친 창 — 결합이 끝나는 대로 연다
    joinPane({ resume: true });
    const d = await serverDone(S.srv.import_id);
    if (d) { S.srv = d; serverOpen(d); return; }
    S.srv = null;
  }
  if (S.srv) { serverOpen(S.srv); return; }
  if (MARK) S.store.forget();
  pane('drop');
  requestAnimationFrame(padStage);
  await goReady(R.bbox, { ms: 2400, maxZoom: R.ai ? 12 : 11, budget: 1800 });
}
(async () => {
  const R = S.region;
  const lastP = resumeSafe();
  if (R.hasFindings && inVW(R.bbox) && S.tiles !== null) {   // 서버가 '정적 필지 층 없음'(null)이라 하면 두드리지 않는다 — 새 시군구는 서버 필지 색인
    const u = S.tiles || `/landxi/data/survey/${encodeURIComponent(who.me.tenant_id)}-parcel-survey.pmtiles`;
    try { const r = await fetch(u, { method: 'HEAD', cache: 'no-store' }); if (r.ok) R.ai = u; } catch { /* AI 분석 전 관할 */ }
  }
  tm('head'); await mountLayers(); tm('layers');
  S.sum = await sumP; tm('summary');
  if (S.wide) S.allSus = (await api('/survey/stats?by=rule').catch(() => null))?.total || null;   // 관할 전체 의심 필지(한 출처)
  paintSvcBar();
  if (!R.ai) showStatus();
  if (R.focus) { pane('drop'); requestAnimationFrame(padStage); await goReady(R.bbox, { ms: 2400, maxZoom: 11, budget: 1800 }); return; }
  await openLast(lastP);
})();
