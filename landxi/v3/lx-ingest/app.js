/* lx-ingest — ① 반입. "이 지역에 영상과 대장이 갖춰졌는가?"
   명세 LANDXI-FINAL-SPEC §2.4 — 문구·배치·데이터 그대로. 부품은 키트(K1 K2 K3 K4 K5 K6 K8 K9 K11 K12 K14)만 조합한다.
   지역은 변수(URL ?region= · 최근 · 배포 기록이 가장 많은 지역) — 지역 문자열 하드코딩 0. */
import * as K from '../kit/index.js';
import { LS } from '../kit/util.js';
import { env } from '../../shared/api-v1.js';
import * as D from './data.js';
import { imagerySheet, ledgerSheet } from './sheets.js';

const who = await K.gate('lx-ingest');
const qs = new URLSearchParams(location.search);
const V3 = '/landxi/v3/';

/* ── 셸 + 레일(① 현재) ─────────────────────────────────────── */
const RAIL = [
  { id: 'ingest', label: '데이터 올리기' },
  { id: 'train', label: '학습', base: V3 + 'lx-train/' },
  { id: 'assemble', label: '서비스 만들기', base: V3 + 'lx-console/', hash: '#assemble' },
  { id: 'review', label: '결과 확인', base: V3 + 'lx-review/' },
  { id: 'deploy', label: '배포', base: V3 + 'lx-deploy/' },
  { id: 'ops', label: '서비스 관리', base: V3 + 'lx-deploy/', hash: '#ops' },
];
const railHref = (r, sgg) => (r.base ? r.base + (sgg ? '?region=' + encodeURIComponent(sgg) : '') + (r.hash || '') : undefined);
RAIL.forEach((r) => { r.href = railHref(r, qs.get('region')); });
const S = K.shell({ who, home: 'lx-ingest', rail: { kind: 'steps', items: RAIL, current: 0 } });

/* ── 판: 지도 무대 + 지역 카드 + 공정 카드 ─────────────────────── */
const stageEl = K.h('div.lxi-stage');
S.main.append(stageEl);
const st = K.createStage(stageEl);
K.devDrawer({ stage: st, who });

const pickEl = K.h('div.lxi-pick-in');
const pickCard = K.card({ map: true, cls: 'lxi-pick', body: pickEl });
const stepsEl = K.h('div.lxi-steps');
const joinBtn = K.h('button.t-btn.lxi-join', { type: 'button', text: '결합 실행', disabled: true });
const bar = K.h('div.t-progress.lxi-bar', { role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, hidden: true }, K.h('i'));
const flowCard = K.card({ map: true, cls: 'lxi-flow', body: K.h('div.lxi-flow-in', {}, stepsEl, joinBtn) });
flowCard.append(bar);
stageEl.append(pickCard, flowCard);

const STEPS = [{ t: '영상' }, { t: '지적' }, { t: '대장' }, { t: '결합' }];
const setSteps = (done) => {
  const c = [0, 1, 2, 3].find((i) => !done.includes(i));
  K.stepper(stepsEl, STEPS, { current: c === undefined ? 3 : c, done });
};
setSteps([]);

const padFor = () => (matchMedia('(max-width: 640px)').matches ? { top: 92, bottom: Math.round(innerHeight * 0.48) + 76, left: 24, right: 24 } : { top: 120, bottom: 150, left: 96, right: 440 });
st.pad(padFor()); addEventListener('resize', () => st.pad(padFor()));

/* ── 지도 층(무대 위) ─────────────────────────────────────────── */
const EMPTY = { type: 'FeatureCollection', features: [] };
await st.ready;
const map = st.map;
map.addSource('lxi-emd', { type: 'geojson', data: EMPTY });
map.addLayer({ id: 'lxi-emd-f', type: 'fill', source: 'lxi-emd', paint: {
  'fill-color': '#0FA9A0',
  'fill-opacity': ['*', ['coalesce', ['feature-state', 'on'], 0], ['interpolate', ['linear'], ['coalesce', ['get', 'rate'], 0], 0, 0.06, 1, 0.52]] } }, 'slot-overlay');
map.addLayer({ id: 'lxi-emd-l', type: 'line', source: 'lxi-emd', paint: { 'line-color': '#FFFFFF', 'line-width': 0.8, 'line-opacity': ['*', 0.6, ['coalesce', ['feature-state', 'on'], 0]] } }, 'slot-overlay');
map.addSource('lxi-fp', { type: 'geojson', data: EMPTY });
map.addLayer({ id: 'lxi-fp-l', type: 'line', source: 'lxi-fp', paint: { 'line-color': '#FFFFFF', 'line-width': 1.4, 'line-dasharray': [2, 1.5], 'line-opacity': 0.95 } }, 'slot-overlay');

/* 전국: 자체 영상이 있는 곳(점) — 카탈로그가 정한다 */
const cat = await D.catalog().catch(() => null);
S.fresh(cat?.as_of || null);
if (cat) {
  const pts = (cat.items || []).filter((i) => i.role === 'imagery' && i.source !== 'external' && i.bounds).map((i) => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [(i.bounds[0] + i.bounds[2]) / 2, (i.bounds[1] + i.bounds[3]) / 2] } }));
  st.geo('imgpts', { type: 'FeatureCollection', features: pts }, 'point');
}

/* ── 영상 사다리(그 지역 자체 영상을 실제 타일로) ──────────────── */
const mounted = new Set();
async function mountImagery(items) {
  const add = items.filter((i) => !mounted.has(i.id) && i.ladder);
  if (!add.length) return;
  add.forEach((i) => mounted.add(i.id));
  try { await st.ladder(add, add.map((i) => i.id)); } catch (e) { K.devlog('ladder', e.message); }
}

/* ── 읍면동 결합률 채색 · 서→동 차오름 ─────────────────────────── */
let emdFc = null;
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
function setOn(id, v) { try { map.setFeatureState({ source: 'lxi-emd', id }, { on: v }); } catch { /* 소스 교체 중 */ } }
let gen = 0;
function arrive(id, ms = 500) {
  if (RM) return setOn(id, 1);
  const t0 = performance.now(), g = gen;
  const step = (t) => { if (g !== gen) return; const p = Math.min(1, (t - t0) / ms); setOn(id, 1 - Math.pow(1 - p, 3)); if (p < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
const west = (f) => K.bboxOf(f)?.[0] ?? 0;
let queue = [], qTimer = 0;
function enqueue(cds) {
  if (!emdFc) return;
  for (const cd of cds) { const f = emdFc.features.find((x) => x.properties.cd === cd); if (f && !queue.includes(f)) queue.push(f); }
  queue.sort((a, b) => west(a) - west(b));
  if (!qTimer) qTimer = setInterval(() => { const f = queue.shift(); if (f) arrive(f.id); if (!queue.length) { clearInterval(qTimer); qTimer = 0; } }, RM ? 0 : 70);
}
function paintEmd(per, { reveal = true } = {}) {
  if (!emdFc) return;
  for (const f of emdFc.features) f.properties.rate = per?.get(f.properties.cd) ?? 0;
  map.getSource('lxi-emd').setData(emdFc);
  if (reveal) { emdFc.features.forEach((f) => setOn(f.id, 0)); enqueue(emdFc.features.map((f) => f.properties.cd)); }
}
function clearEmd() { gen++; emdFc?.features.forEach((f) => setOn(f.id, 0)); queue = []; }

/* 좁은 화면(≤ 640): 공정 카드는 시트 맨 위로(지도 자리를 비운다) */
const narrow = matchMedia('(max-width: 640px)');
function homeFlow() {
  const into = narrow.matches && dr?.el.isConnected ? dr.body : stageEl;
  if (flowCard.parentElement !== into) { if (into === stageEl) stageEl.append(flowCard); else into.prepend(flowCard); }
  flowCard.classList.toggle('lxi-flow--in', into !== stageEl);
}
narrow.addEventListener('change', homeFlow);

/* 같은 자리 여러 시점(거의 같은 범위)은 테두리 하나 */
const uniqBounds = (items) => { const out = []; for (const i of items) { if (!i.bounds) continue; const b = i.bounds; if (!out.some((o) => o.bounds.every((v, k) => Math.abs(v - b[k]) < 0.02))) out.push(i); } return out; };

/* ── 서랍 ──────────────────────────────────────────────────── */
let dr = null, cur = null, token = 0, basis = null, rate = null, running = null, UI = null, held = null;
const skel = (n) => K.h('div.lxi-skel', {}, ...Array.from({ length: n }, () => K.h('i')));

function openDrawer(region) {
  const body = K.h('div.lxi-dr', { dataset: { scope: region.sgg_cd } });
  const big = K.h('div.lxi-big.is-loading');
  const img = K.h('section.lxi-sec', {}, K.h('h3.t-label', { text: '영상' }), K.h('div.lxi-img', {}, skel(2)));
  const led = K.h('section.lxi-sec', {}, K.h('h3.t-label', { text: '대장' }), K.h('div.lxi-led', {}, skel(5)));
  const bImg = K.h('button.t-btn.t-btn--2', { type: 'button', text: '영상 등록', onclick: () => imagerySheet({ host: stageEl, region: cur, under: dr, onDone: refresh }) });
  const bLed = K.h('button.t-btn.t-btn--2', { type: 'button', text: '대장 형식 등록', onclick: () => ledgerSheet({ host: stageEl, under: dr, onDone: () => {} }) });
  body.append(big, img, led);
  if (dr && dr.el.isConnected) { dr.title(region.name); dr.set(body); }
  else dr = K.drawer({ title: region.name, body, host: stageEl, slot: 'right', label: region.full || region.name, onClose: () => { dr = null; homeFlow(); } });
  // 행동 줄은 서랍 바닥에 고정(스크롤 밖 · 첫 뷰에 늘 보임)
  dr.el.querySelector(':scope > .lxi-acts')?.remove();
  dr.el.append(K.h('div.lxi-acts', {}, bImg, bLed));
  const bn = K.bignum(K.h('div'), null, { label: '필지 결합률', unit: '%', digits: 1 });
  big.append(bn.el);
  UI = { big, bn, img: img.querySelector('.lxi-img'), led: led.querySelector('.lxi-led') };
  /* 결합률은 서버가 지역 필지 전체를 AI 결과와 겹쳐 세는 무거운 계산(수십 초)이다 — 스켈레톤을 CALC_MS 넘게 두지 않는다:
     그때까지 값이 없으면 '—' + 계산 중 한 줄 + 진행 막대(값이 오면 그 자리에서 숫자로 · 실패면 사유 한 줄) */
  const ui = UI;
  clearTimeout(calcTimer);
  calcTimer = setTimeout(() => { if (UI === ui && ui.big.classList.contains('is-loading')) bigNote(ui, '계산 중', { busy: true }); }, CALC_MS);
  homeFlow();
  return UI;
}

/* 큰 숫자 자리 — 값 대신 한 줄(계산 중 · 사유). bignum 의 '불러오는 중' 타이머는 empty() 로 끈다 */
const CALC_MS = 1500;
let calcTimer = 0;
function bigNote(ui, text, { busy = false } = {}) {
  ui.big.classList.remove('is-loading');
  ui.big.classList.toggle('is-calc', busy);
  ui.big.classList.toggle('lxi-big--none', !busy);
  ui.bn.empty();
  const n = ui.bn.el.querySelector('.k-big-none'); if (n) n.textContent = text;
  ui.bn.el.setAttribute('aria-busy', busy ? 'true' : 'false');
  const bar = ui.big.querySelector('.lxi-calc');
  if (busy && !bar) ui.big.append(K.h('div.t-progress.k-empty-p.is-indet.lxi-calc', { role: 'progressbar', 'aria-label': text }, K.h('i')));
  if (!busy) bar?.remove();
}

const done = { img: false, cad: false, led: false, join: false };
const syncSteps = () => setSteps([done.img && 0, done.cad && 1, done.led && 2, done.join && 3].filter((x) => x !== false));

function renderImagery(el, im) {
  el.replaceChildren();
  if (!im.labels.length) {
    const e = K.h('div'); el.append(e);
    K.empty(e, { kind: 'ingest', char: 'drone', text: '이 지역 영상을 등록하면 AI 분석을 시작할 수 있습니다', compact: true });
    return;
  }
  const ul = K.h('ul.lxi-list');
  for (const r of im.labels.slice(0, 5)) ul.append(K.h('li', { html: `<span>${K.esc(r.label)}</span>${K.sig(r.env)}` }));
  el.append(ul);
}
const STATE = { yes: '있음', no: '없음', agency: '기관 제공 대기', unknown: '—' };
function renderLedger(el, rows) {
  el.replaceChildren();
  const box = K.h('div'); el.append(box);
  K.table(box, {
    cols: [{ key: 'label', label: '대장' }, { key: 'state', label: '상태', fmt: (v, r) => `<span class="lxi-st" data-st="${K.esc(v)}">${K.esc(STATE[v] || '—')}</span>${r.env ? K.sig(r.env) : ''}` }],
    rows, limit: 10,
  });
}

/* 결합률 캐시(같은 출처 봉투 · 1시간) — 서버 결합 계산이 무거워 두 번째 방문부터 바로 보인다 */
const RKEY = 'lx_ingest_rate';
const rateCache = (b) => { const c = LS.get(RKEY, {})[b.set + '|' + b.emds.length]; return c && Date.now() - c.t < 3600e3 ? c : null; };
const rateSave = (b, r) => LS.set(RKEY, { ...LS.get(RKEY, {}), [b.set + '|' + b.emds.length]: { t: Date.now(), env: r.env, per: [...r.per] } });

async function pick(region, { fly = true } = {}) {
  if (!region) return;
  const my = ++token;
  cur = region; basis = null; rate = null; held = null;
  if (running) { running.watch?.close(); running = null; bar.hidden = true; }
  Object.assign(done, { img: false, cad: false, led: false, join: false }); syncSteps();
  joinBtn.disabled = true;
  history.replaceState(null, '', location.pathname + '?region=' + encodeURIComponent(region.sgg_cd) + (qs.get('dev') ? '&dev=' + qs.get('dev') : ''));
  RAIL.forEach((r) => { r.href = railHref(r, region.sgg_cd); }); S.go(0);
  const ui = openDrawer(region);
  map.getSource('lxi-fp').setData(EMPTY); clearEmd(); st.clear('parcels');

  const geo = await D.regionGeom(region);
  if (my !== token) return;
  if (!geo.bbox) { noResult(ui); ui.img.replaceChildren(); K.empty(ui.img.appendChild(K.h('div')), { kind: 'outside', compact: true }); return; }
  st.geo('region', geo.fc, 'focus');
  if (fly) st.go(geo.bbox, { maxZoom: 12.5 });

  // 영상
  D.imageryIn(region, geo).then((im) => {
    if (my !== token) return;
    renderImagery(ui.img, im);
    done.img = im.labels.length > 0; syncSteps();
    map.getSource('lxi-fp').setData({ type: 'FeatureCollection', features: uniqBounds(im.items).map((i) => ({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[i.bounds[0], i.bounds[1]], [i.bounds[2], i.bounds[1]], [i.bounds[2], i.bounds[3]], [i.bounds[0], i.bounds[3]], [i.bounds[0], i.bounds[1]]]] } })) });
    mountImagery(im.items);
  }).catch((e) => { K.devlog('imagery', e.message); ui.img.replaceChildren(K.h('p.t-label', { text: '—' })); });

  // 대장(V-World 갖춤)
  D.ledgerIn(region, geo).then((rows) => {
    if (my !== token) return;
    renderLedger(ui.led, rows);
    done.cad = rows.find((r) => r.k === 'cadastral')?.state === 'yes';
    done.led = rows.some((r) => r.k !== 'cadastral' && r.state === 'yes'); syncSteps();
  });

  // 결합률
  const [b, emd] = await Promise.all([D.joinBasis(region, geo), D.emdGeom(region.sgg_cd).catch(() => null)]);
  if (my !== token) return;
  basis = b;
  emdFc = emd; map.getSource('lxi-emd').setData(emdFc || EMPTY);
  if (!b) { noResult(ui); return; }
  joinBtn.disabled = !!running;
  resume(b, region, my);
  const cached = rateCache(b);
  if (cached) { showRate(ui, { env: cached.env, per: new Map(cached.per) }); }
  D.joinRate(b).then((r) => {
    if (my !== token) return;
    rateSave(b, r);
    if (running) { held = { r, my }; clearTimeout(calcTimer); ui.big.classList.remove('is-loading', 'is-calc'); ui.big.querySelector('.lxi-calc')?.remove(); if (!cached) ui.bn.set(r.env); return; }   // 결합 중 — 필지·채색은 end() 에서 한 번에
    showRate(ui, r, { reveal: !cached }); st.geo('parcels', r.fc, 'ai');
  })
    .catch((e) => { K.devlog('join rate', e.code || e.message); if (my === token && !cached) { clearTimeout(calcTimer); bigNote(ui, '결합률을 불러오지 못했습니다'); } });
}
/* 결과 없는 지역 — 큰 숫자 자리를 한 줄로 접는다(좁은 화면에서 영상 카드가 행동 줄 위로 올라오게) */
function noResult(ui) { clearTimeout(calcTimer); ui.big.classList.remove('is-loading', 'is-calc'); ui.big.querySelector('.lxi-calc')?.remove(); ui.big.classList.add('lxi-big--none'); ui.bn.set(null); }
function showRate(ui, r, { reveal = true } = {}) {
  rate = r;
  if (ui === UI) clearTimeout(calcTimer);
  ui.big.classList.remove('is-loading', 'lxi-big--none', 'is-calc');
  ui.big.querySelector('.lxi-calc')?.remove();
  ui.bn.set(r.env);
  done.join = !running && (r.env?.value || 0) > 0; syncSteps();
  paintEmd(r.per, { reveal: reveal && !running });
}
async function refresh() { await D.catalog(true).catch(() => null); if (cur) pick(cur, { fly: false }); }

/* ── 결합 실행 → 진행 막대 1 + 읍면동이 서→동으로 차오름 ───────── */
function progress(p) {
  bar.hidden = false;
  if (p === null) { bar.classList.add('is-indet'); bar.firstChild.style.width = ''; bar.removeAttribute('aria-valuenow'); return; }
  bar.classList.remove('is-indet'); bar.firstChild.style.width = Math.round(p * 100) + '%'; bar.setAttribute('aria-valuenow', Math.round(p * 100));
}
/* 결합 완료 응답에 결합 수가 오면(서버 요청 · `counts.joined_parcels` + `counts.parcels`) 그 값을 큰 숫자로 쓴다 — 없으면 필지 결합 봉투 */
function jobRate(j, b) {
  const c = j?.counts || {};
  const joined = +c.joined_parcels, all = +(c.parcels || b.parcels);
  if (!(joined >= 0) || !all) return null;
  return { ...env(Math.round((joined / all) * 1000) / 10, '%', 'inferred', j.id, '확인 전 · 결합 작업 결과'), as_of: j.finished_at || new Date().toISOString() };
}
function joinHandlers(b, region, my) {
  const rp = D.joinRate(b);   // 결합률은 같은 결과·필지에서 나온다(작업이 끝나면 같은 봉투로 다시 칠한다)
  const mine = () => my === token && cur === region && UI;
  const end = () => {
    running = null; bar.hidden = true; joinBtn.disabled = !basis;
    if (held && held.my === token && UI) { const r = held.r; held = null; showRate(UI, r, { reveal: false }); st.geo('parcels', r.fc, 'ai'); }
    st.show('parcels', true); done.join = (rate?.env?.value || 0) > 0; syncSteps();
  };
  return {
    onShard: (cd) => { if (my === token) enqueue([cd]); },
    onProgress: (p) => { if (my === token) progress(p); },
    onDone: async (j) => {
      held = null;
      try {
        const r = await rp;
        const je = jobRate(j, b);
        if (mine()) { const rr = je ? { ...r, env: je } : r; rateSave(b, rr); showRate(UI, rr, { reveal: false }); enqueue(emdFc?.features.map((f) => f.properties.cd) || []); st.geo('parcels', r.fc, 'ai'); }
      } catch { /* 결합률은 다음 방문 때 */ }
      end();
    },
    onFail: () => { end(); failToast(); },
  };
}
function beginRun() { done.join = false; syncSteps(); joinBtn.disabled = true; progress(null); clearEmd(); st.show('parcels', false); }
joinBtn.addEventListener('click', async () => {
  if (!basis || running) return;
  const b = basis, region = cur, my = token;
  beginRun();
  try {
    running = await D.runJoin(b, joinHandlers(b, region, my));
    K.toast('결합을 시작했습니다');
  } catch (e) {
    K.devlog('join', e.code || e.message);
    running = null; bar.hidden = true; joinBtn.disabled = false; st.show('parcels', true);
    failToast();
  }
});
/** 돌고 있는 결합이 있으면 이어 본다(다시 들어와도 진행 막대 · 차오름 그대로) */
async function resume(b, region, my) {
  const job = await D.runningJoin(b);
  if (!job || my !== token || running) return;
  beginRun();
  progress(job.shards_total ? job.shards_done / job.shards_total : null);
  running = { job, watch: D.watchJoin(job, job.shards_total, joinHandlers(b, region, my)) };
}
const failToast = () => K.toast('등록하지 못했습니다', { action: { label: '다시 시도', onClick: () => joinBtn.click() } });

/* ── 지역 선택(K4) · 지도 누르기 ───────────────────────────────── */
const list = await D.regions();
const picker = await K.regionPicker(pickEl, { onPick: (r) => pick(r) });
map.on('click', async (e) => {
  try {
    const cd = await D.regionAt(e.lngLat.lng, e.lngLat.lat);
    const r = cd && list.find((x) => x.sgg_cd === cd);
    if (r && r !== cur) { picker.input.value = r.name; pick(r); }
  } catch (err) { K.devlog('region at', err.message); }
});

/* 첫 지역: URL → 최근 → 데이터가 정한다 — 결과가 있는 지역 우선, 그다음 배포 수 → 영상 → 의심 필지 수(동률 깨기) */
function firstRegion(rs) {
  const nf = (r) => +(r.n_findings?.value ?? r.n_findings ?? 0) || 0;
  const key = (r) => [nf(r) > 0 ? 1 : 0, r.deploys?.length || 0, r.has_imagery ? 1 : 0, nf(r)];
  return [...rs].sort((a, b) => { const x = key(a), y = key(b); for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return y[i] - x[i]; return 0; })[0];
}
const want = qs.get('region');
const first = (want && list.find((r) => r.sgg_cd === want || r.profile === want))
  || K.recent().map((k) => list.find((r) => r.sgg_cd === k)).find(Boolean)
  || firstRegion(list);
if (first) { picker.input.value = first.name; setTimeout(() => pick(first), 700); }
/* ?dev=1 — 검증용 상태 조회(개발자 서랍과 같은 조건 · 화면 문구 0) */
if (qs.get('dev') === '1') window.__lxi = { map, state: () => ({ cur: cur?.sgg_cd || null, running: !!running, held: !!held, emdOn: emdFc ? emdFc.features.filter((f) => (map.getFeatureState({ source: 'lxi-emd', id: f.id })?.on || 0) > 0.5).length : 0, emdAll: emdFc?.features.length || 0, parcelsShown: (() => { try { return map.getStyle().layers.filter((l) => /parcels/.test(l.id)).map((l) => map.getLayoutProperty(l.id, 'visibility') || 'visible'); } catch { return []; } })() }) };
document.documentElement.dataset.ready = '1';
