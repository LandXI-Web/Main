/* gov-request — 기관 분기 화면 · 분석 요청(확인 대장 6차 GF-2 · 2차 D1-ⓑ · 5차 역할-4 ⓑ · 1차 FR-1 · 구현 확인 2차 J-9 · 원칙 100 ·
   구현 5차 기관-5 ⓐ — 이름 '분석 요청'(원칙 113) · 시안 design-r8/gov-design/mock/request.html 모양: 왼쪽 세 단계 · 오른쪽 '어디를 분석하나'(작은 지도) · 내가 보낸 요청).
   공무원은 전문가가 아니다 — 세 단계만:
     ① 영상 넣기      LX 가 이 기관에 공유한 영상 '불러오기' 또는 우리 영상 파일 끌어 놓기(여러 장 · 진행 막대 · 멈춤 · 이어 올리기)
     ② 분석 카드 고르기 그 기관에 켜진 서비스를 서비스 카드 한 벌(kit/service-card · 고르는 모양)로 — 이 영상으로 못 하는 카드는 쉬운 말 한 줄
     ③ 요청하기        메모 한 줄(선택) → '분석 요청' — 무상(원칙 60). LX 관리자 · 담당자가 확인한 뒤 대기열 순서대로.
   형식 · 해상도 · 좌표 같은 전문 글은 화면에 없다 — 서버가 파일에서 읽어 처리하고(관할 밖 판정 등 검사는 그대로), 문제일 때만 쉬운 말 한 줄 + 할 일.
   [내가 보낸 요청] 확인 대기 → 분석 중 → 결과 도착(서비스의 새 시점) · 반려(사유). 서비스 대시보드는 '?service=' 로 이 화면을 연다.
   지역 고정값 없음 — 관할 · 서비스 · 공유 영상은 모두 로그인 기관에서. */
import { shell, gate, createStage, toast, empty, devDrawer, devlog, FRONT } from '../kit/index.js';
import { api, esc, h, session, LS } from '../kit/util.js';
import { sse } from '../../shared/api-v1.js';
import { uploadQueue } from '../kit/dropzone.js';
import { loadDeck, svcCard } from '../kit/service-card.js';
import { govRail } from '../gov-select/menu.js';
import { loadBrand } from '../gov-select/brand.js';

const $ = (s, r = document) => r.querySelector(s);
const STATE_LV = { pending: 'wait', approved: 'wait', analyzing: '', done: '', rejected: 'warn', failed: 'warn' };
const RASTER = ['tif', 'tiff', 'jpg', 'jpeg', 'jp2', 'ecw', 'img'];
const SIDECAR = ['tfw', 'tifw', 'jgw', 'jpgw', 'jpw', 'j2w', 'wld', 'prj', 'aux.xml', 'ovr'];
const ymd = (s) => (/^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || '')) || []).slice(1).join('.');
const km2 = (e) => { const v = e?.value; return v == null ? '' : v < 0.01 ? '0.01㎢ 미만' : v < 10 ? `약 ${v.toFixed(2)}㎢` : `약 ${Math.round(v).toLocaleString('ko-KR')}㎢`; };
/** 영상 종류(사용자 말) — 해상도 숫자 대신 '드론영상 · 항공영상 · 위성영상' */
const kindWord = (g) => (g == null ? '영상' : g < 0.1 ? '드론영상' : g < 1 ? '항공영상' : '위성영상');
/** 찍은 날(사용자 말) — 2025-04-15 → 2025년 4월 · 2025 → 2025년 */
const whenWord = (d) => { const m = /^(\d{4})(?:-(\d{2}))?/.exec(String(d || '')); return m ? `${m[1]}년${m[2] ? ' ' + Number(m[2]) + '월' : ''}` : ''; };

/* ═════════ 관문 · 셸 ═════════ */
const who = await gate('gov-request');
if (who.me?.realm !== 'tenant') { location.replace(who.landing || FRONT); await new Promise(() => {}); }
const org = (who.org || who.name || '').replace(/\s*담당자$/, '').split(/\s+/).pop() || '기관';
/* 기관 메뉴(내 서비스 · 분석 요청 · 보낸 요청 · 우리 공간 · 기관 관리자는 기관 정보 · 계정) — 국내 기관 화면과 같은 메뉴(gov-select/menu.js) */
const rail = who.key === 'tenant/local' ? govRail({ who, current: 'request', service: new URLSearchParams(location.search).get('service') }) : null;
const app = shell({ who: { ...who, org }, home: 'gov-request', title: org, rail });
app.main.append($('#tpl').content.cloneNode(true));
document.body.classList.remove('gq-boot');
document.title = `분석 요청 · ${org}`;
/* 바닥 — 기관 이름 · 대표전화(기관 화면 한 벌 · gov-select 와 같은 바닥) */
loadBrand(who.me.tenant_id).then((b) => {
  const nm = b.name?.ko || b.name?.en || b.platform;
  $('.gq').append(h('footer.gs-foot', {}, h('b', { text: nm }), b.contact ? h('span', { text: `대표전화 ${b.contact}` }) : null, h('span.sp'),
    h('span', { text: 'AI 분석 · 모델 개발과 갱신 — LX 한국국토정보공사' })));
}).catch(() => {});
devDrawer({ who });

const Q = new URLSearchParams(location.search);
const DKEY = `gq:draft:${who.me.tenant_id}:${who.me.user?.id || ''}`;
/* svcs = 배포본(서비스) 목록(GET /requests/services) · cards = 카드 덱(GET /cards/deck — 그 기관 것만) · card = 고른 카드 · svc = 고른 배포본 */
const S = { svcs: [], cards: new Map(), shared: [], mine: [], card: null, svc: Q.get('service') || null, pick: null, draft: LS.get(DKEY), area: null, sel: null, fitGsd: null };

/* ═════════ 지도 — 넣은 영상이 어디인지 ═════════ */
const stage = createStage($('#map'), { padding: { top: 28, bottom: 28, left: 28, right: 28 } });   // 오른쪽 '어디를 분석하나' 작은 지도(시안)
/** 미리 보기 한 줄 — 어디를 찍은 영상인지(사용자 말) · 없으면 안내 한 줄 */
function whereCap(text) {
  const cap = $('#map-cap'), note = $('#map-note');
  cap.hidden = !text; cap.textContent = text || '';
  note.textContent = text ? `${org} 밖은 분석하지 않습니다.` : '영상을 넣으면 어디를 찍은 것인지 여기에 보입니다';
}
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
function clearMap() { overlay(null); stage.clear('fp'); stage.clear('res'); whereCap(null); }

/* ═════════ 탭 ═════════ */
/* 탭 없음(시안) — '내가 보낸 요청'은 늘 오른쪽에 있다. 'mine' = 그 칸으로 눈을 옮긴다(보낸 직후 · ?tab=mine) */
function setTab(t) {
  document.body.dataset.tab = t;
  if (t === 'mine') requestAnimationFrame(() => $('#mine')?.scrollIntoView({ block: 'nearest', behavior: 'auto' }));
}

/* ═════════ ① 영상 넣기 — 공유 영상 · 우리 파일 ═════════ */
const sharedName = (x) => `${org} ${x.year ? x.year + '년 ' : ''}${kindWord(x.gsd_m)}`;
function drawShared() {
  const el = $('#shared');
  const list = S.shared.filter((x) => x.analyzable);
  $('#shared-tile').hidden = !list.length;
  $('.gq-src').dataset.n = list.length ? '2' : '1';
  if (!list.length) { el.innerHTML = ''; return; }
  el.innerHTML = `<p class="t-label">LX가 ${esc(org)}에 공유한 영상</p>` + list.slice(0, 4).map((x) => {
    const on = S.pick?.source === 'shared' && S.pick.imagery.id === x.id;
    return `<div class="gq-sr${on ? ' is-on' : ''}" data-id="${esc(x.id)}"><div class="t"><b>${esc(sharedName(x))}</b><span>${x.result_services?.length ? '이미 분석한 영상' : '아직 분석하지 않은 영상'}</span></div>
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
  drawPicked();
  await fitServices(x.gsd_m);
  stage.geo('fp', FC([box(x.bbox)]), 'focus');
  if (x.bbox) stage.go(x.bbox, { maxZoom: 15 });
  whereCap(sharedName(x));
  showImagery(x.id);
  ready();
}

const drop = uploadQueue($('#drop'), {
  base: '/requests/uploads',
  fields: () => ({ draft_id: S.draft || undefined }),
  allow: [...RASTER, ...SIDECAR],
  max: 20e9,
  title: matchMedia('(max-width: 640px)').matches ? '눌러서 영상 파일을 고르세요' : '파일을 끌어 놓거나 눌러 고르세요',   // 휴대폰엔 끌어 놓기가 없다
  kinds: '여러 장도 한 번에 넣을 수 있습니다',
  onStart: (st) => { if (st.draft_id && st.draft_id !== S.draft) { S.draft = st.draft_id; LS.set(DKEY, S.draft); } },
  onChange: (items) => {
    if (items.length && S.pick?.source !== 'upload') { S.pick = { source: 'upload', draft: S.draft, read: null }; shownImg = null; clearMap(); drawShared(); drawPicked(); ready(); }
    if (!items.length && S.pick?.source === 'upload') { S.pick = null; drawPicked(); fitServices(null); ready(); }
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
  drawPicked();
  try {
    const rd = await api(`/requests/drafts/${encodeURIComponent(S.draft)}/read`, { method: 'POST', body: {} });
    if (readKey !== key) return;
    S.pick = { source: 'upload', draft: S.draft, read: rd };
    overlay(rd.overlay);
    stage.geo('fp', FC([rd.footprint]), 'focus');
    if (rd.bbox) stage.go(rd.bbox, { maxZoom: 17 });
    if (rd.ok) { whereCap(rd.place ? `${rd.place} 일대` : '넣은 영상'); await fitServices(rd.gsd_m); }
  } catch (e) {
    readKey = '';
    S.pick = { source: 'upload', draft: S.draft, read: { ok: false, code: e.code } };
  }
  drawPicked();
  ready();
}

/* 서버가 파일에서 읽은 결과 → 쉬운 말 한 줄(서버 검사 그대로 · 전문 용어 없이) */
const PLAIN = {
  no_raster: '영상 파일이 아닙니다 — 촬영한 영상 파일을 넣어 주세요',
  no_georef: '어디를 찍은 영상인지 알 수 없습니다 — 영상과 함께 받은 파일을 모두 넣어 주세요',
  no_crs: '어디를 찍은 영상인지 알 수 없습니다 — 영상과 함께 받은 파일을 모두 넣어 주세요',
  mixed_crs: '한 번에 읽을 수 없는 파일이 섞여 있습니다 — 영상을 하나씩 넣어 주세요',
  rotated: '한 번에 읽을 수 없는 파일이 섞여 있습니다 — 영상을 하나씩 넣어 주세요',
  not_ready: '아직 넣는 중인 파일이 있습니다',
};
const plainWhy = (r) => (r.code === 'out_of_scope' ? `${org} 밖을 찍은 영상입니다 — ${org} 안을 찍은 영상만 분석합니다` : PLAIN[r.code] || '이 파일은 영상으로 읽지 못했습니다 — 다른 영상을 넣어 주세요');

/* 넣은 영상 한 줄 — 어디를 · 언제 찍었나(사용자 말) / 문제면 쉬운 말 한 줄 + 다른 영상으로 */
function drawPicked() {
  const el = $('#picked'), ok1 = $('#ok-1');
  const p = S.pick;
  const up = p?.source === 'upload';
  el.hidden = !p || (up && !p.read);
  ok1.textContent = '';
  $('#drop').hidden = p?.source === 'upload' && p.read && p.read !== 'loading' && !drop.busy() ? true : false;
  if (el.hidden) return;
  const other = h('button.t-btn.t-btn--text.gq-other', { type: 'button', text: '다른 영상으로', onclick: () => resetPick() });
  if (p.source === 'shared') {
    el.replaceChildren(h('div.t', {}, h('b', { text: sharedName(p.imagery) }), h('span.ok', { text: 'LX가 공유한 영상 · 분석할 수 있습니다 ✓' })), other);
    ok1.textContent = '영상 준비됨 ✓';
    return;
  }
  if (p.read === 'loading') { el.replaceChildren(h('div.t', {}, h('b', { text: '넣은 영상을 살펴보는 중' }), h('span', { text: '잠시만 기다려 주세요' }))); return; }
  const r = p.read;
  const n = drop.items().filter((i) => i.state === 'done').length;
  if (!r.ok) {
    el.replaceChildren(h('div.t', {}, h('b.warn', { text: '이 영상으로는 분석할 수 없습니다' }), ...plainWhy(r).split(' — ').map((t) => h('span', { text: t }))), other);
    el.dataset.lv = 'warn';
    return;
  }
  delete el.dataset.lv;
  const where = r.place ? `${r.place} 일대` : '넣은 영상';
  el.replaceChildren(h('div.t', {},
    h('b', { text: `${where} ${kindWord(r.gsd_m)} · ${n || r.n || 1}장` }),
    h('span.ok', { text: `${r.date ? whenWord(r.date) + '에 찍은 영상입니다 — ' : ''}분석할 수 있습니다 ✓` }),
    r.scope === 'partial' ? h('span', { text: `${org} 밖 부분은 빼고 분석합니다` }) : null), other);
  ok1.textContent = '영상 준비됨 ✓';
}
async function resetPick() {
  if (S.pick?.source === 'upload') await newDraft();
  S.pick = null; shownImg = null;
  clearMap(); drawShared(); drawPicked(); await fitServices(null); ready();
}
async function newDraft(keepPick = false) {
  if (S.draft) { try { await api(`/requests/drafts/${encodeURIComponent(S.draft)}`, { method: 'DELETE' }); } catch { /* 이미 없음 */ } }
  drop.clear(); S.draft = null; LS.set(DKEY, null); readKey = '';
  if (!keepPick && S.pick?.source === 'upload') S.pick = null;
  $('#drop').hidden = false;
}

/* ═════════ ② 분석 카드 고르기 ═════════ */
async function fitServices(gsd) {
  if (gsd && gsd === S.fitGsd) return drawCards();
  try {
    const j = await api('/requests/services' + (gsd ? `?gsd=${encodeURIComponent(gsd)}` : ''));
    S.svcs = j.items || []; S.fitGsd = gsd || null; S.area = j.area?.bbox || S.area;
  } catch (e) { devlog('services', e.code || e.message); }
  drawCards();
}
/** 카드별 배포본 — 같은 카드가 시군구마다 있으면(광역) 넣은 영상이 있는 시군구의 것 */
function deployOf(card) {
  const ds = S.svcs.filter((s) => s.card === card);
  if (!ds.length) return null;
  const sgg = S.pick?.read?.sgg_cd;
  const ib = S.pick?.imagery?.bbox;
  const hit = (sgg && ds.find((d) => d.sgg_cd === sgg))
    || (ib && ds.find((d) => d.bbox && !(d.bbox[2] < ib[0] || d.bbox[0] > ib[2] || d.bbox[3] < ib[1] || d.bbox[1] > ib[3])));
  return hit || ds[0];
}
function cardIds() { const out = []; for (const s of S.svcs) if (s.card && !out.includes(s.card)) out.push(s.card); return out; }
function drawCards() {
  const el = $('#svcs');
  const ids = cardIds();
  if (!ids.length) { el.replaceChildren(h('p.gq-note', { text: '열린 분석 카드가 없습니다' })); return; }
  if (S.svc && !S.card) S.card = S.svcs.find((s) => s.id === S.svc)?.card || null;
  if (!S.card && ids.length === 1) S.card = ids[0];
  el.replaceChildren(...ids.map((id) => {
    const ds = S.svcs.filter((s) => s.card === id);
    const c = S.cards.get(id) || { id, name: ds[0]?.name || '', state: 'none', status_label: '' };
    const no = ds.length && ds.every((d) => d.fits === false);
    const dupe = S.pick?.source === 'shared' && ds.some((d) => S.pick.imagery.result_services?.includes(d.id));
    const why = no ? '이 영상으로는 어렵습니다 — 다른 영상이 필요합니다' : dupe ? '이 영상은 이 카드로 이미 분석했습니다' : '';
    return svcCard({ ...c, scene: c.scene || null }, { kind: 'gov', pick: { selected: S.card === id && !no && !dupe, disabled: no || dupe, why, onPick: (x) => { S.card = x.id; S.svc = deployOf(x.id)?.id || null; const u = new URL(location.href); if (S.svc) u.searchParams.set('service', S.svc); history.replaceState(null, '', u); drawCards(); ready(); } } });
  }));
  const on = el.querySelector('.k-sc.is-on');
  $('#ok-2').textContent = on ? `${(on.querySelector('.k-sc-t')?.textContent || '').replace(/\s*(행정서비스|서비스)$/, '')} 선택 ✓` : '';
}

/* ═════════ ③ 요청하기 ═════════ */
function ready() {
  const p = S.pick;
  const img = p && (p.source === 'shared' || (p.read && p.read !== 'loading' && p.read.ok)) && !drop.busy();
  const ds = S.card ? S.svcs.filter((s) => s.card === S.card) : [];
  const ok = ds.length && !ds.every((d) => d.fits === false);
  const dupe = p?.source === 'shared' && ds.some((d) => p.imagery.result_services?.includes(d.id));
  S.svc = S.card ? deployOf(S.card)?.id || null : null;
  $('#go').disabled = !(img && ok && !dupe && S.svc);
  drawCards();
}
$('#go').addEventListener('click', async () => {
  const p = S.pick, go = $('#go');
  go.disabled = true;
  const body = p.source === 'shared' ? { service_id: S.svc, source: 'shared', imagery_id: p.imagery.id } : { service_id: S.svc, source: 'upload', draft_id: p.draft };
  body.memo = $('#memo').value.trim() || undefined;
  try {
    const rq = await api('/requests', { method: 'POST', body });
    toast('분석 요청을 보냈습니다 · 확인되면 알려 드립니다');
    $('#memo').value = '';
    if (p.source === 'upload') { drop.clear(); S.draft = null; LS.set(DKEY, null); readKey = ''; $('#drop').hidden = false; }
    S.pick = null; shownImg = null;
    clearMap(); drawShared(); drawPicked();
    await loadMine();
    setTab('mine');
    openReq(rq.id);
  } catch (e) {
    devlog('request', `${e.code} ${e.message}`);
    $('#go-note').textContent = e.message || '지금은 요청할 수 없습니다';
    $('#go-note').dataset.lv = 'warn';
    setTimeout(() => { $('#go-note').innerHTML = 'LX 담당자가 확인한 뒤 분석합니다.<br>끝나면 알림으로 알려 드리고, 결과는 그 서비스에 새 시점으로 쌓입니다.'; delete $('#go-note').dataset.lv; }, 6000);
  }
  ready();
});

/* ═════════ 내가 보낸 요청 ═════════ */
async function loadMine() {
  try {
    const j = await api('/requests');
    S.mine = j.items || [];
  } catch (e) { devlog('mine', e.code || e.message); return; }
  const n = S.mine.filter((x) => ['pending', 'approved', 'analyzing'].includes(x.state)).length;
  $('#mine-n').textContent = S.mine.length ? `${S.mine.length}건` : '';
  $('#mine-n').dataset.live = n ? '1' : '';
  drawMine();
  if (S.sel) openReq(S.sel, { keepMap: true });
  plan();
}
function title(x) { return `${x.label || '영상'} → ${String(x.service?.name || '').replace(/\s*(행정서비스|서비스)$/, '')}`; }
const whenTxt = (x) => (x.state === 'done' ? `${ymd(x.decided_at || x.created_at)} 결과 도착` : `${ymd(x.created_at)} 보냄`);
const row = (k, v) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`;
function drawMine() {
  const ul = $('#rows'), none = $('#rows-empty');
  none.hidden = !!S.mine.length;
  if (!S.mine.length && !none.firstChild) empty(none, { kind: 'first', title: '아직 보낸 요청이 없습니다', compact: true });
  ul.innerHTML = S.mine.map((x) => `<li class="gq-row${x.id === S.sel ? ' is-on' : ''}" data-id="${esc(x.id)}" tabindex="0" role="button">
    <span class="l1">${esc(title(x))}</span><span class="t-chip" data-lv="${STATE_LV[x.state] ?? ''}">${esc(x.state_word)}</span>
    <span class="l2">${esc([whenTxt(x), x.place].filter(Boolean).join(' · '))}</span></li>`).join('');
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
  if (x.state === 'pending') lines.push(['', 'LX 담당자가 확인하고 있습니다. 확인하면 순서대로 분석합니다.']);
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
  if (x.place || x.label) whereCap([x.place ? `${x.place} 일대` : x.label, x.area_km2 ? km2(x.area_km2) : ''].filter(Boolean).join(' · '));
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

/* ═════════ 실시간 · 다시 읽기 ═════════ */
let timer = 0;
function plan() {
  clearTimeout(timer);
  if (S.mine.some((x) => ['pending', 'approved', 'analyzing'].includes(x.state))) timer = setTimeout(loadMine, 15000);
}
try { sse('/events/tenant', { events: ['request.changed', 'imagery.shared'], on: (name) => { if (name === 'imagery.shared') loadShared(); else loadMine(); } }); }
catch (e) { devlog('sse', e.message); }

async function loadShared() {
  try { S.shared = (await api('/requests/shared-imagery')).items || []; } catch (e) { devlog('shared', e.code || e.message); }
  drawShared();
}
async function loadCards() {
  const d = await loadDeck();
  for (const c of d?.items || []) S.cards.set(c.id, c);
}

/* ═════════ 시작 ═════════ */
setTab(Q.get('tab') === 'mine' ? 'mine' : 'new');
await Promise.all([loadCards(), loadShared(), loadMine()]);
await fitServices(null);
if (S.svc && !S.svcs.some((s) => s.id === S.svc)) S.svc = null;              // 이 기관 서비스가 아니면 고르지 않는다
drawPicked(); ready();
await stage.ready;
if (S.area) stage.go(S.area, { maxZoom: 11 });
/* 새로 고침 · 다시 들어와도 올리던 묶음 이어 쓰기(멈춘 파일은 다시 고르면 받은 자리부터) */
if (S.draft) {
  try {
    const rd = await api(`/requests/drafts/${encodeURIComponent(S.draft)}/read`, { method: 'POST', body: {} });
    S.pick = { source: 'upload', draft: S.draft, read: rd };
    overlay(rd.overlay); stage.geo('fp', FC([rd.footprint]), 'focus'); if (rd.bbox) stage.go(rd.bbox, { maxZoom: 17 });
    if (rd.ok) await fitServices(rd.gsd_m);
    drawPicked(); ready();
  } catch (e) { if (e.code !== 'not_ready') { S.draft = null; LS.set(DKEY, null); } }
}
devlog('gov-request', `카드 ${cardIds().length} · 공유 영상 ${S.shared.length} · 보낸 요청 ${S.mine.length}`);
document.body.dataset.ready = '1';
void session;
