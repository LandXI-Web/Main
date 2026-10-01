/* gov-request — 기관 분기 화면 · 우리 영상으로 분석 의뢰(확인 대장 6차 GF-2 · 2차 D1-ⓑ · 5차 역할-4 ⓑ · 1차 FR-1).
   ① 영상: LX 가 이 기관에 공유한 영상 '불러오기' 또는 우리 영상 파일 끌어 놓기(여러 파일 · 진행 막대 · 멈춤 · 이어 올리기 · 취소 · 조각 올리기)
   ② 이렇게 읽었습니다: 해상도 · 촬영일 · 범위 · 좌표계는 파일에서(입력 칸 없음 · 원칙 49) — 관할 밖이면 여기서 멈춘다(원칙 39)
   ③ 어느 서비스로: 그 기관에 켜진 서비스(영상 해상도에 맞는 모델이 없는 서비스는 고를 수 없음)
   ④ 메모 한 줄(선택) → '분석 의뢰' — 무상(비용 · 수수료 표시 없음 · 원칙 60 고침). 곧바로 돌지 않고 LX 관리자가 확인한 뒤 대기열 순서대로.
   [내 의뢰] 확인 대기 → 분석 중 → 결과 도착(서비스의 새 시점) · 반려(사유). 서비스 대시보드는 '?service=' 로 이 화면을 연다.
   지역 고정값 없음 — 관할 · 서비스 · 공유 영상은 모두 로그인 기관에서. */
import { shell, gate, createStage, toast, empty, devDrawer, devlog, FRONT } from '../kit/index.js';
import { api, esc, h, session, LS } from '../kit/util.js';
import { sse } from '../../shared/api-v1.js';
import { uploadQueue } from '../kit/dropzone.js';

const $ = (s, r = document) => r.querySelector(s);
const STATE_LV = { pending: 'wait', approved: 'wait', analyzing: '', done: '', rejected: 'warn', failed: 'warn' };
const RASTER = ['tif', 'tiff', 'jpg', 'jpeg', 'jp2', 'ecw', 'img'];
const SIDECAR = ['tfw', 'tifw', 'jgw', 'jpgw', 'jpw', 'j2w', 'wld', 'prj', 'aux.xml', 'ovr'];
const ymd = (s) => (/^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || '')) || []).slice(1).join('.');
const km2 = (e) => { const v = e?.value; return v == null ? '' : v < 0.01 ? '0.01㎢ 미만' : v < 10 ? `약 ${v.toFixed(2)}㎢` : `약 ${Math.round(v).toLocaleString('ko-KR')}㎢`; };

/* ═════════ 관문 · 셸 ═════════ */
const who = await gate('gov-request');
if (who.me?.realm !== 'tenant') { location.replace(who.landing || FRONT); await new Promise(() => {}); }
const org = (who.org || who.name || '').replace(/\s*담당자$/, '').split(/\s+/).pop() || '기관';
const app = shell({ who: { ...who, org }, home: 'gov-request', title: org });
app.main.append($('#tpl').content.cloneNode(true));
document.body.classList.remove('gq-boot');
document.title = `${org} · 분석 의뢰 · Land-XI`;
devDrawer({ who });

const Q = new URLSearchParams(location.search);
const DKEY = `gq:draft:${who.me.tenant_id}:${who.me.user?.id || ''}`;
const S = { svcs: [], shared: [], mine: [], svc: Q.get('service') || null, pick: null, draft: LS.get(DKEY), area: null, sel: null, fitGsd: null };

/* ═════════ 지도 ═════════ */
const stage = createStage($('#map'), { padding: { top: 72, bottom: 72, left: 72, right: 520 } });
const FC = (geoms) => ({ type: 'FeatureCollection', features: geoms.filter(Boolean).map((g) => ({ type: 'Feature', properties: {}, geometry: g })) });
const box = (b) => b && ({ type: 'Polygon', coordinates: [[[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]], [b[0], b[1]]]] });
async function overlay(ov) {
  await stage.ready;
  const m = stage.map;
  if (m.getLayer('gq-ov')) m.removeLayer('gq-ov');
  if (m.getSource('gq-ov')) m.removeSource('gq-ov');
  if (!ov?.url || !ov.coordinates) return;
  m.addSource('gq-ov', { type: 'image', url: ov.url, coordinates: ov.coordinates });
  m.addLayer({ id: 'gq-ov', type: 'raster', source: 'gq-ov', paint: { 'raster-fade-duration': 0 } }, m.getLayer('slot-overlay') ? 'slot-overlay' : undefined);
}
let shownImg = null;
async function showImagery(id) {                       // 공유된 LX 영상을 지도에(기관 영상 층 = 공유된 것만 · 서버가 거른다)
  if (shownImg === id) return;
  shownImg = id;
  try {
    const cat = await api('/catalog/layers?build=tenant');
    const it = (cat.items || []).find((x) => x.id === id);
    if (it && shownImg === id) { await stage.ladder([it], [id]); }
  } catch (e) { devlog('imagery', e.code || e.message); }
}
function clearMap() { overlay(null); stage.clear('fp'); stage.clear('res'); }

/* ═════════ 탭 ═════════ */
function setTab(t) {
  for (const b of document.querySelectorAll('.gq-tabs [role=tab]')) b.setAttribute('aria-selected', String(b.dataset.tab === t));
  for (const p of document.querySelectorAll('.gq-pane')) p.hidden = p.dataset.pane !== t;
  document.body.dataset.tab = t;
}
$('.gq-tabs').addEventListener('click', (e) => { const b = e.target.closest('[role=tab]'); if (b) setTab(b.dataset.tab); });

/* ═════════ ① 영상 — 공유 영상 · 우리 파일 ═════════ */
function drawShared() {
  const el = $('#shared');
  const list = S.shared.filter((x) => x.analyzable);
  if (!list.length) { el.innerHTML = `<p class="gq-note">LX가 ${esc(org)}에 공유한 분석용 영상이 아직 없습니다</p>`; return; }
  el.innerHTML = `<p class="t-label">LX가 ${esc(org)}에 공유한 영상</p>` + list.slice(0, 4).map((x) => {
    const on = S.pick?.source === 'shared' && S.pick.imagery.id === x.id;
    const meta = [x.year ? `${x.year}년` : '', x.gsd_word].filter(Boolean).join(' · ');
    return `<div class="gq-sr${on ? ' is-on' : ''}" data-id="${esc(x.id)}"><div class="t"><b>${esc(x.name)}</b><span>${esc(meta)}${x.result_services?.length ? ' · <i>결과 있음</i>' : ''}</span></div>
      <button type="button" class="t-btn t-btn--2" aria-pressed="${on}">${on ? '불러옴' : '불러오기'}</button></div>`;
  }).join('');
}
$('#shared').addEventListener('click', (e) => {
  const r = e.target.closest('.gq-sr'); if (!r || !e.target.closest('button')) return;
  const x = S.shared.find((i) => i.id === r.dataset.id); if (!x) return;
  pickShared(x);
});
async function pickShared(x) {
  S.pick = { source: 'shared', imagery: x };
  clearMap();
  drawShared();
  drawRead();
  await fitServices(x.gsd_m);
  stage.geo('fp', FC([box(x.bbox)]), 'focus');
  if (x.bbox) stage.go(x.bbox, { maxZoom: 15 });
  showImagery(x.id);
  ready();
}

const drop = uploadQueue($('#drop'), {
  base: '/requests/uploads',
  fields: () => ({ draft_id: S.draft || undefined }),
  allow: [...RASTER, ...SIDECAR],
  max: 20e9,
  title: '영상 파일을 끌어 놓거나 눌러 고르세요',
  kinds: ['TIF · JP2 · ECW · JPG(좌표 파일과 함께)', '여러 파일 · 한 파일 20GB까지'],
  onStart: (st) => { if (st.draft_id && st.draft_id !== S.draft) { S.draft = st.draft_id; LS.set(DKEY, S.draft); } },
  onChange: (items) => {
    if (items.length && S.pick?.source !== 'upload') { S.pick = { source: 'upload', draft: S.draft, read: null }; drawShared(); drawRead(); ready(); }
    if (!items.length && S.pick?.source === 'upload') { S.pick = null; drawRead(); ready(); }
    const done = items.filter((i) => i.state === 'done');
    if (!drop?.busy() && done.length && done.length === items.filter((i) => i.state !== 'bad').length) readDraft();
  },
});
let readKey = '';
async function readDraft() {
  const key = S.draft + ':' + drop.items().filter((i) => i.state === 'done').map((i) => i.id).join(',');
  if (!S.draft || key === readKey) return;
  readKey = key;
  S.pick = { source: 'upload', draft: S.draft, read: 'loading' };
  drawRead();
  try {
    const rd = await api(`/requests/drafts/${encodeURIComponent(S.draft)}/read`, { method: 'POST', body: {} });
    if (readKey !== key) return;
    S.pick = { source: 'upload', draft: S.draft, read: rd };
    overlay(rd.overlay);
    stage.geo('fp', FC([rd.footprint]), 'focus');
    if (rd.bbox) stage.go(rd.bbox, { maxZoom: 17 });
    if (rd.ok) await fitServices(rd.gsd_m);
  } catch (e) {
    readKey = '';
    S.pick = { source: 'upload', draft: S.draft, read: { ok: false, why: e.code === 'not_ready' ? '아직 올리는 중인 파일이 있습니다' : (e.message || '파일을 읽지 못했습니다') } };
  }
  drawRead();
  ready();
}

/* ═════════ ② 이렇게 읽었습니다 ═════════ */
function drawRead() {
  const sec = $('#read'), kv = $('#read-kv'), ok = $('#read-ok'), del = $('#read-drop');
  const p = S.pick;
  sec.hidden = !p || (p.source === 'upload' && !p.read);
  $('#n-svc').textContent = sec.hidden ? '2' : '3';
  $('#n-memo').textContent = sec.hidden ? '3' : '4';
  if (sec.hidden) return;
  del.hidden = true;
  if (p.source === 'shared') {
    const x = p.imagery;
    kv.innerHTML = row('영상', 'LX 공유 영상') + row('촬영', x.year ? `${x.year}년` : '기록 없음') + row('해상도', x.gsd_word || '—');
    ok.dataset.lv = ''; ok.textContent = '✓ 분석할 수 있는 영상';
    return;
  }
  if (p.read === 'loading') { kv.innerHTML = ''; ok.dataset.lv = 'wait'; ok.textContent = '파일에서 읽는 중'; return; }
  const r = p.read;
  kv.innerHTML = (r.gsd_word ? row('촬영', r.date_word || '파일에 기록이 없습니다') + row('해상도', r.gsd_word) : '')
    + (r.place ? row('범위', `${r.place} · ${km2(r.area_km2)}`) : '')
    + (r.crs_word ? row('좌표계', r.crs_word + (r.crs_guessed ? ' · 위치로 확인' : '')) : '');
  if (!r.ok) { ok.dataset.lv = 'warn'; ok.textContent = '✕ ' + (r.why || '분석할 수 없는 영상입니다'); del.hidden = false; return; }
  ok.dataset.lv = r.scope === 'partial' ? 'lock' : '';
  ok.textContent = r.scope === 'partial' ? `관할 밖 약 ${r.out_pct?.value ?? ''}%는 분석하지 않습니다 · 나머지는 분석할 수 있습니다` : '✓ 분석할 수 있는 영상';
}
const row = (k, v) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`;
$('#read-drop').addEventListener('click', async () => {
  if (S.draft) { try { await api(`/requests/drafts/${encodeURIComponent(S.draft)}`, { method: 'DELETE' }); } catch { /* 이미 없음 */ } }
  newDraft();
});
function newDraft() {
  drop.clear(); S.draft = null; LS.set(DKEY, null); readKey = '';
  if (S.pick?.source === 'upload') S.pick = null;
  clearMap(); drawRead(); ready();
}

/* ═════════ ③ 어느 서비스로 ═════════ */
async function fitServices(gsd) {
  if (gsd && gsd === S.fitGsd) return;
  try {
    const j = await api('/requests/services' + (gsd ? `?gsd=${encodeURIComponent(gsd)}` : ''));
    S.svcs = j.items || []; S.fitGsd = gsd || null; S.area = j.area?.bbox || S.area;
  } catch (e) { devlog('services', e.code || e.message); }
  drawSvcs();
}
function drawSvcs() {
  const el = $('#svcs');
  if (!S.svcs.length) { el.innerHTML = '<p class="gq-note">켜진 서비스가 없습니다</p>'; return; }
  el.innerHTML = S.svcs.map((s) => {
    const no = s.fits === false;
    const on = S.svc === s.id && !no;
    return `<button type="button" class="gq-chip" role="radio" aria-checked="${on}" data-id="${esc(s.id)}"${no ? ' disabled title="영상 해상도에 맞는 분석 모델이 없습니다"' : ''}>${esc(s.name)}</button>`;
  }).join('');
  const sel = S.svcs.find((s) => s.id === S.svc);
  const shared = S.pick?.source === 'shared' && S.pick.imagery.result_services?.includes(S.svc);
  $('#svc-note').textContent = sel?.fits === false ? '이 영상 해상도로는 이 서비스를 분석할 수 없습니다'
    : shared ? '이 영상은 이 서비스로 이미 분석했습니다 — 결과는 서비스 대시보드에 있습니다'
      : S.svcs.some((s) => s.fits === false) ? '영상 해상도에 맞는 서비스만 고를 수 있습니다' : '';
}
$('#svcs').addEventListener('click', (e) => {
  const b = e.target.closest('.gq-chip'); if (!b || b.disabled) return;
  S.svc = b.dataset.id;
  const u = new URL(location.href); u.searchParams.set('service', S.svc); history.replaceState(null, '', u);
  drawSvcs(); ready(); loadTimepoints();
});

/* ═════════ ④ 의뢰 ═════════ */
function ready() {
  const p = S.pick, sel = S.svcs.find((s) => s.id === S.svc);
  const img = p && (p.source === 'shared' || (p.read && p.read !== 'loading' && p.read.ok)) && !drop.busy();
  const dupe = p?.source === 'shared' && p.imagery.result_services?.includes(S.svc);
  $('#go').disabled = !(img && sel && sel.fits !== false && !dupe);
  drawSvcs();
}
$('#go').addEventListener('click', async () => {
  const p = S.pick, go = $('#go');
  go.disabled = true;
  const body = p.source === 'shared' ? { service_id: S.svc, source: 'shared', imagery_id: p.imagery.id } : { service_id: S.svc, source: 'upload', draft_id: p.draft };
  body.memo = $('#memo').value.trim() || undefined;
  try {
    const rq = await api('/requests', { method: 'POST', body });
    toast('의뢰를 보냈습니다 · LX 관리자가 확인하면 내 의뢰에서 알려 드립니다');
    $('#memo').value = '';
    if (p.source === 'upload') { drop.clear(); S.draft = null; LS.set(DKEY, null); readKey = ''; }
    S.pick = null; shownImg = null;
    clearMap(); drawShared(); drawRead();
    await loadMine();
    setTab('mine');
    openReq(rq.id);
  } catch (e) {
    devlog('request', `${e.code} ${e.message}`);
    $('#go-note').textContent = e.message || '지금은 의뢰할 수 없습니다';
    $('#go-note').dataset.lv = 'warn';
    setTimeout(() => { $('#go-note').textContent = 'LX 관리자가 확인한 뒤 분석합니다. 결과는 이 서비스의 새 시점으로 쌓입니다.'; delete $('#go-note').dataset.lv; }, 6000);
  }
  ready();
});

/* ═════════ 내 의뢰 ═════════ */
async function loadMine() {
  try {
    const j = await api('/requests');
    S.mine = j.items || [];
  } catch (e) { devlog('mine', e.code || e.message); return; }
  const n = S.mine.filter((x) => ['pending', 'approved', 'analyzing'].includes(x.state)).length;
  $('#mine-n').textContent = S.mine.length ? String(S.mine.length) : '';
  $('#mine-n').dataset.live = n ? '1' : '';
  drawMine();
  if (S.sel) openReq(S.sel, { keepMap: true });
  plan();
}
function title(x) { return `${x.label || '영상'} → ${String(x.service?.name || '').replace(/\s*(행정서비스|서비스)$/, '')}`; }
function drawMine() {
  const ul = $('#rows'), none = $('#rows-empty');
  none.hidden = !!S.mine.length;
  if (!S.mine.length && !none.firstChild) empty(none, { kind: 'first', title: '보낸 의뢰가 없습니다', compact: true });
  ul.innerHTML = S.mine.map((x) => `<li class="gq-row${x.id === S.sel ? ' is-on' : ''}" data-id="${esc(x.id)}" tabindex="0" role="button">
    <span class="l1">${esc(title(x))}</span><span class="t-chip" data-lv="${STATE_LV[x.state] ?? ''}">${esc(x.state_word)}</span>
    <span class="l2">${esc([ymd(x.created_at), x.place].filter(Boolean).join(' · '))}</span></li>`).join('');
}
$('#rows').addEventListener('click', (e) => { const r = e.target.closest('.gq-row'); if (r) openReq(r.dataset.id); });
$('#rows').addEventListener('keydown', (e) => { const r = e.target.closest('.gq-row'); if (r && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openReq(r.dataset.id); } });

async function openReq(id, { keepMap = false } = {}) {
  S.sel = id;
  drawMine();
  const det = $('#det');
  let x;
  try { x = await api(`/requests/${encodeURIComponent(id)}`); } catch (e) { devlog('req', e.code || e.message); return; }
  if (S.sel !== id) return;
  det.hidden = false;
  const lines = [];
  if (x.state === 'pending') lines.push(['', 'LX 관리자가 확인하고 있습니다. 확인하면 대기열 순서대로 분석합니다.']);
  if (x.state === 'approved' || x.state === 'analyzing') lines.push(['', '분석 중입니다. 끝나면 이 서비스의 새 시점으로 쌓입니다.']);
  if (x.state === 'rejected') lines.push(['warn', `반려 · 사유: ${x.reason || ''}`]);
  if (x.state === 'failed') lines.push(['warn', x.reason || '분석하지 못했습니다']);
  if (x.state === 'done') {
    const by = Object.entries(x.result?.counts || {}).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} ${Number(v).toLocaleString('ko-KR')}`).join(' · ');
    lines.push(['', `AI 탐지 ${Number(x.result?.total?.value || 0).toLocaleString('ko-KR')}건${by ? ` · ${by}` : ''}`]);
    lines.push(['', `새 시점: ${x.result?.timepoint || ''}`]);
  }
  det.innerHTML = `<div class="gq-det-h"><b>${esc(title(x))}</b><span class="t-chip" data-lv="${STATE_LV[x.state] ?? ''}">${esc(x.state_word)}</span></div>
    <dl class="gq-kv">${row('보낸 날', ymd(x.created_at))}${x.place ? row('범위', `${x.place}${x.area_km2 ? ' · ' + km2(x.area_km2) : ''}`) : ''}${x.memo ? row('메모', x.memo) : ''}</dl>
    ${lines.map(([lv, t]) => `<p class="gq-line"${lv ? ` data-lv="${lv}"` : ''}>${esc(t)}</p>`).join('')}
    ${x.state === 'done' ? '<button type="button" class="t-btn t-btn--2 gq-small" id="det-map">지도에서 보기</button>' : ''}`;
  $('#det-map')?.addEventListener('click', () => showResult(x));
  if (keepMap) return;
  clearMap();
  if (x.state === 'done') showResult(x);
  else {
    if (x.overlay) overlay(x.overlay);
    if (x.aoi) { stage.geo('fp', FC([x.aoi]), 'focus'); fitGeom(x.aoi); }
  }
}
function fitGeom(g) {
  const pts = []; const walk = (c) => (typeof c[0] === 'number' ? pts.push(c) : c.forEach(walk)); walk(g.coordinates || []);
  if (!pts.length) return;
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  stage.go([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], { maxZoom: 17 });
}
async function showResult(x) {
  if (!x.result?.result_set) return;
  try {
    const fc = await api(`/results/${x.result.result_set}/features?limit=5000`);
    stage.geo('res', fc, 'ai');
    if (x.aoi) { stage.geo('fp', FC([x.aoi]), 'focus'); fitGeom(x.aoi); }
  } catch (e) { devlog('result', e.code || e.message); toast('결과를 불러오지 못했습니다'); }
}

/* ═════════ 결과 시점(고른 서비스) ═════════ */
async function loadTimepoints() {
  const card = $('#tp');
  if (!S.svc) { card.hidden = true; return; }
  try {
    const j = await api(`/requests/timepoints?service=${encodeURIComponent(S.svc)}`);
    $('#tp-svc').textContent = `${j.service?.name || ''} · 결과 시점`;
    $('#tp-list').innerHTML = (j.items || []).map((t, i) => `<li${t.kind === 'request' ? ` data-req="${esc(t.request_id)}" tabindex="0" role="button"` : ''}>
      <span>${esc(t.label)}</span>${t.kind === 'request' ? '<i>의뢰</i>' : ''}</li>`).join('') || '<li><span>아직 결과가 없습니다</span></li>';
    card.hidden = false;
  } catch { card.hidden = true; }
}
$('#tp-list').addEventListener('click', (e) => { const li = e.target.closest('[data-req]'); if (li) { setTab('mine'); openReq(li.dataset.req); } });

/* ═════════ 실시간 · 다시 읽기 ═════════ */
let timer = 0;
function plan() {
  clearTimeout(timer);
  if (S.mine.some((x) => ['pending', 'approved', 'analyzing'].includes(x.state))) timer = setTimeout(() => loadMine().then(loadTimepoints), 15000);
}
try { sse('/events/tenant', { events: ['request.changed', 'imagery.shared'], on: (name) => { if (name === 'imagery.shared') loadShared(); else loadMine().then(loadTimepoints); } }); }
catch (e) { devlog('sse', e.message); }

async function loadShared() {
  try { S.shared = (await api('/requests/shared-imagery')).items || []; } catch (e) { devlog('shared', e.code || e.message); }
  drawShared();
}

/* ═════════ 시작 ═════════ */
setTab(Q.get('tab') === 'mine' ? 'mine' : 'new');
await Promise.all([fitServices(null), loadShared(), loadMine()]);
if (S.svc && !S.svcs.some((s) => s.id === S.svc)) S.svc = null;              // 이 기관 서비스가 아니면 고르지 않는다
if (!S.svc && S.svcs.length === 1) S.svc = S.svcs[0].id;
drawSvcs(); ready(); loadTimepoints();
await stage.ready;
if (S.area) stage.go(S.area, { maxZoom: 11 });
/* 새로 고침 · 다시 들어와도 올리던 묶음 이어 쓰기(멈춘 파일은 다시 고르면 받은 자리부터) */
if (S.draft) {
  try {
    const rd = await api(`/requests/drafts/${encodeURIComponent(S.draft)}/read`, { method: 'POST', body: {} });
    S.pick = { source: 'upload', draft: S.draft, read: rd };
    overlay(rd.overlay); stage.geo('fp', FC([rd.footprint]), 'focus'); if (rd.bbox) stage.go(rd.bbox, { maxZoom: 17 });
    if (rd.ok) await fitServices(rd.gsd_m);
    drawRead(); ready();
  } catch (e) { if (e.code !== 'not_ready') { S.draft = null; LS.set(DKEY, null); } }
}
devlog('gov-request', `서비스 ${S.svcs.length} · 공유 영상 ${S.shared.length} · 내 의뢰 ${S.mine.length}`);
void session;
