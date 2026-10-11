/* gov-fusion(서비스 기준) — 기관 '행정정보와 비교'. 확인 대장 10-11 18:52 'gov-비교' 이대로 구현 · 시안 design-r20/gov-report-main ?v=fusion.
   올린 대장 × 고른 서비스 결과를 사실 그대로: '대장과 AI 결과가 다른 필지 n' + 어떻게 다른지 두 줄(서비스마다 맞는 문장 — 서버가 정함)
   · AI 결과가 있는 필지 · 영상 범위 밖 · AI 분석 전 · 표(지번 · 대장 · AI 분석 · 면적) · 내려받기 · 보고서에 넣기 · 다른 파일.
   상태 · 판정 · 확인 필요 칩 · 우선순위 · 규칙 이름 · 머리띠 '할 일' 없음. 이 화면은 /survey/* 를 부르지 않는다
   (대장 올리기 = 기관 대장 반입 /t/{기관}/survey/registry · 맞춤 = GET /spaces/me/ledger/compare — 결과 세트 필지 번호 × 대장 필지 번호).
   흐름: 올리기 → 열 확인 → 맞춤(맞출 서비스 고르기) → 결과. 이미 올린 대장이 있으면 곧바로 결과(서버가 이 사람의 최근 대장을 고른다).
   관할 = 로그인한 기관(세션) · 지역 고정값 0. 옛 화면(실태조사 규칙 대조)은 app.js 에 남겨 두고 쓰지 않는다. */
import * as K from '../kit/index.js';
import { api, h, esc } from '../kit/util.js';
import { ROLES } from './ledger.js';
import { ledgerStore, ledgerKind } from './registry.js';
import { govRail } from '../gov-select/menu.js';

const $ = (s, r = document) => r.querySelector(s);
const nf = (v, d = 0) => (v === null || v === undefined ? '—' : Number(v).toLocaleString('ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d }));
const val = (e) => (e && typeof e === 'object' ? e.value : e);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const css = (v, d) => getComputedStyle(document.documentElement).getPropertyValue(v).trim() || d;
const QS = new URLSearchParams(location.search);
const WARN = '#E5484D', AI = '#0FA9A0';

/* ═════════ 관문 · 셸 · 지도 ═════════ */
const who = await K.gate('gov-fusion');
const org = String(who.org || '').trim().split(/\s+/).pop();
const shell = K.shell({ who, home: 'gov-fusion', title: org, rail: who.key === 'tenant/local' ? govRail({ who, current: 'list' }) : null });
document.title = `${org} · 행정정보와 비교 · Land-XI`;
const stageEl = h('div.gf-stage'); shell.main.append(stageEl);
const stage = K.createStage(stageEl);
K.devDrawer({ stage, who });

const S = { card: QS.get('service') || null, cmp: null, store: null, rec: null, cols: null, kind: '농지대장', services: [], importId: null, pop: null };

/* 서비스 줄(지도 왼쪽 위) — 요약 한 출처(GET /summary · 기관 세션 = 자기 관할만). 누르면 그 서비스와 맞춤 */
const svcBar = h('nav.gf-svcbar', { 'aria-label': '내 서비스' }); svcBar.hidden = true;
stageEl.append(svcBar);
/* 오른쪽 판(K5) · 단계 넷 */
const sheet = K.card({ map: true, cls: 'gf-sheet gf-sheet--svc' });
sheet.setAttribute('aria-label', '행정정보와 비교');
const stepEl = h('div.gf-steps');
const panes = { drop: h('div.gf-pane', { hidden: true }), cols: h('div.gf-pane', { hidden: true }), pick: h('div.gf-pane', { hidden: true }), result: h('div.gf-pane', { hidden: true }) };
sheet.append(stepEl, ...Object.values(panes));
stageEl.append(sheet);
const steps = K.stepper(stepEl, [{ t: '올리기' }, { t: '열 확인' }, { t: '맞춤' }, { t: '결과' }], { current: 0 });
const ORDER = ['drop', 'cols', 'pick', 'result'];
function pane(k) {
  for (const [n, el] of Object.entries(panes)) el.hidden = n !== k;
  steps.go(Math.max(0, ORDER.indexOf(k)));
  document.body.dataset.view = k;
  requestAnimationFrame(padStage);
}
/* 왼쪽 아래 큰 숫자 */
const bigCard = K.card({ map: true, cls: 'gf-big gf-big--svc' }); bigCard.hidden = true;
stageEl.append(bigCard);

const small = () => matchMedia('(max-width: 640px)').matches;
function padStage() {
  if (small()) stage.pad({ top: 16 + (svcBar.hidden ? 0 : svcBar.offsetHeight + 8), bottom: sheet.offsetHeight + 20, left: 20, right: 20 });
  else stage.pad({ top: 48, left: (svcBar.hidden ? 0 : svcBar.offsetWidth) + 64, right: (sheet.offsetWidth || 400) + 48, bottom: bigCard.hidden ? 48 : Math.min(bigCard.offsetHeight + 48, 260) });
}
addEventListener('resize', () => requestAnimationFrame(padStage));
new ResizeObserver(() => padStage()).observe(sheet);

/* ═════════ 서비스 줄 ═════════ */
api('/summary').then((j) => {
  const items = ((j && j.items) || []).filter((it) => it.card_name);
  svcBar.replaceChildren();
  for (const it of items.slice(0, 6)) {
    const nm = String(it.region_name || '').trim().split(/\s+/).pop();
    const det = it.metrics?.detected;
    const a = h('a.gf-svcbar-i', { href: '?' + new URLSearchParams({ service: it.card }), 'aria-current': it.card === S.card ? 'true' : null },
      h('b', { text: nm }), h('span', { text: it.card_name || '' }),
      det && det.value !== null && det.value !== undefined ? h('span.num', { text: `${det.label} ${nf(det.value)}${det.unit || ''}`, dataset: { metric: det.label, v: String(det.value) } }) : null);
    svcBar.append(a);
  }
  svcBar.hidden = !items.length;
  requestAnimationFrame(padStage);
}).catch(() => {});

/* ═════════ 1 · 올리기 ═════════ */
S.store = await ledgerStore(who);
{ const own = await api('/deploys').then((j) => (j.items || []).filter((d) => d.tenant_id === who.me.tenant_id)).catch(() => []);
  const k = await ledgerKind(own.map((d) => d.card_id), who.me.tenant_id).catch(() => null); if (k) S.kind = k.label; }
const dzEl = h('div.gf-drop');
panes.drop.append(dzEl);
const dz = K.dropzone(dzEl, {
  onFile: (f, p) => S.store.importFile(f, S.kind, p),
  onDone: (out) => toCols(out),
  onError: (e) => { if (!e || !['bad_ext', 'too_large'].includes(e.code)) K.toast('파일을 읽지 못했습니다'); },
});
const emptyEl = h('div'); dzEl.prepend(emptyEl);
const jo = (w, a, b) => { const c = String(w || '').charCodeAt(String(w || '').length - 1) - 0xac00; return c >= 0 && c < 11172 && c % 28 ? a : b; };
K.empty(emptyEl, { kind: 'first', title: '행정정보와 비교', char: 'satellite', text: `${S.kind}${jo(S.kind, '을', '를')} 올리면 서비스 결과와 필지 번호로 맞춰 대장과 AI 결과가 다른 필지를 보여 줍니다.`, action: { label: '대장 올리기', onClick: () => {} } });

/* ═════════ 2 · 열 확인 ═════════ */
function toCols(out) {
  S.rec = { import_id: out.import_id };
  S.cols = out.columns_guess.map((c) => ({ ...c }));
  panes.cols.replaceChildren();
  const tbl = h('div.gf-cols');
  const ok = h('button.t-btn.gf-join', { type: 'button', text: '다음' });
  panes.cols.append(h('h3.gf-h', { text: '열 확인' }), tbl, h('p.gf-note', { text: '성명 · 연락처 열은 읽지 않습니다' }), h('div.gf-acts', {}, ok));
  const opt = (v) => ROLES.map(([k, l]) => `<option value="${k}"${k === v ? ' selected' : ''}>${esc(l)}</option>`).join('');
  K.table(tbl, {
    cols: [
      { key: 'col', label: '파일의 열', fmt: (v, r) => `<b>${esc(v)}</b><small>${esc(r.sample || '')}</small>` },
      { key: 'role', label: '뜻', width: '46%', fmt: (v, r) => `<select class="t-input gf-sel" data-i="${r.i}" aria-label="${esc(r.col)} 뜻">${opt(v)}</select>` },
    ],
    rows: S.cols.map((c, i) => ({ ...c, i })), limit: 40,
  });
  const check = () => { ok.disabled = !S.cols.some((c) => c.role === 'pnu' || c.role === 'jibun'); };
  tbl.addEventListener('change', (e) => { const s = e.target.closest('select'); if (!s) return; S.cols[+s.dataset.i].role = s.value; check(); });
  check();
  ok.addEventListener('click', () => pickPane());
  pane('cols');
}

/* ═════════ 3 · 맞춤 — 맞출 서비스 고르기 → 서버에 대장 반입(필지 잇기) ═════════ */
function svcSelect() {
  const sel = h('select.t-input.gf-sel', { 'aria-label': '맞출 서비스' });
  sel.replaceChildren(...S.services.map((s) => h('option', { value: s.card, text: [s.name, s.shot].filter(Boolean).join(' · ') })));
  if (S.card) sel.value = S.card;
  return sel;
}
async function pickPane() {
  if (!S.services.length) await loadServices();
  panes.pick.replaceChildren();
  if (!S.services.length) {
    panes.pick.append(h('h3.gf-h', { text: '맞춤' }), h('p.gf-note', { text: '필지와 잇는 서비스 결과가 아직 없습니다' }));
    pane('pick'); return;
  }
  const sel = svcSelect();
  const go = h('button.t-btn', { type: 'button', text: '맞추기' });
  panes.pick.append(h('h3.gf-h', { text: '맞춤' }), h('label.gf-fld', {}, h('span.t-label', { text: '맞출 서비스' }), sel),
    h('p.gf-note', { text: '대장 필지와 서비스 결과를 필지 번호로 맞춥니다' }), h('div.gf-acts', {}, go));
  go.addEventListener('click', async () => { S.card = sel.value; go.disabled = true; await upload(); go.disabled = false; });
  pane('pick');
}
async function upload() {
  const prog = h('div'); panes.pick.append(prog);
  K.empty(prog, { kind: 'loading', title: '필지에 이어 붙이는 중', char: 'drone', compact: true });
  try {
    // 대장 행을 이 창에서 읽었으니(올리기) 서버 반입 — 필지 번호 열이 있으면 그 값, 없으면 지번으로 서버가 잇는다
    const L = await S.store.confirm(S.rec.import_id, Object.fromEntries(S.cols.map((c) => [c.col, c.role])), async (row) => {
      const pc = S.cols.find((c) => c.role === 'pnu')?.col;
      return { rows: row.rows.map((x, i) => ({ i, pnu: pc && /^\d{19}$/.test(String(x[pc] || '').trim()) ? String(x[pc]).trim() : null })), counts: { miss: 0 }, pts: [] };
    });
    const id = await S.store.serverSave(L, S.cols);
    if (!id) throw new Error('반입 실패');
    for (let i = 0; i < 400; i++) {
      const d = await S.store.detail(id).catch(() => null);
      if (d && d.state === 'matched') break;
      if (d && d.state === 'failed') throw new Error('결합 실패');
      await wait(i < 20 ? 700 : 2000);
    }
    S.importId = id;
    await show();
    K.toast('맞춤을 마쳤습니다');
  } catch (e) { K.devlog('upload', String(e?.message || e)); K.toast('맞추지 못했습니다'); prog.remove(); }
}

/* ═════════ 4 · 결과 ═════════ */
async function loadServices() {
  try { const j = await api('/spaces/me/report/services'); S.services = (j.items || []).filter((s) => s.parcel); } catch { S.services = []; }
  if (!S.card || !S.services.some((s) => s.card === S.card)) S.card = S.services[0]?.card || S.card;
}
async function show() {
  if (!S.card) { await loadServices(); if (!S.card) { pane('drop'); return; } }
  let c;
  try { c = await api('/spaces/me/ledger/compare?' + new URLSearchParams({ card: S.card, geom: '1', ...(S.importId ? { import_id: S.importId } : {}) })); }
  catch (e) {
    K.devlog('compare', e.message);
    if (e.status === 404 && S.services.length && S.services[0].card !== S.card) { S.card = S.services[0].card; return show(); }
    panes.result.replaceChildren(h('p.gf-note', { role: 'status', text: e.status === 404 ? '이 서비스는 대장과 맞출 결과가 없습니다' : '불러오지 못했습니다' })); pane('result'); return;
  }
  S.cmp = c; S.services = c.services || S.services; S.importId = c.ledger?.import_id || null;
  if (!c.ledger) { bigCard.hidden = true; paintMap(null); pane('drop'); return; }
  paintResult(c); paintBig(c); paintMap(c);
  for (const a of svcBar.querySelectorAll('a')) a.setAttribute('aria-current', new URLSearchParams(a.search).get('service') === S.card ? 'true' : 'false');
}
function paintResult(c) {
  const L = c.ledger;
  const sel = svcSelect();
  sel.addEventListener('change', () => { S.card = sel.value; history.replaceState(null, '', '?' + new URLSearchParams({ service: S.card })); show(); });
  const up = L.uploader ? `${L.uploader.role}` : '내가 올림';
  const lines = h('ul.gf-rows');
  for (const x of c.lines || []) lines.append(h('li', {}, h('span', { text: x.label.replace('인데 ', ' · ').replace('아닌데 ', '아님 · ') }), h('b.num', { text: nf(val(x.n)) })));
  lines.append(h('li.dim', {}, h('span', { text: 'AI 결과가 있는 필지' }), h('b.num', { text: nf(val(c.with_ai)), dataset: { metric: 'AI 결과가 있는 필지', v: String(val(c.with_ai)) } })));
  lines.append(h('li.dim', {}, h('span', { text: c.no_ai_label }), h('b.num', { text: nf(val(c.no_ai)) })));
  if (L.loose && val(L.loose)) lines.append(h('li.dim', {}, h('span', { text: '필지와 잇지 못한 대장 행' }), h('b.num', { text: nf(val(L.loose)) })));
  const top = (c.items || []).slice(0, 3);
  const tb = h('table.gf-tb', {}, h('thead', {}, h('tr', {}, h('th', { text: '지번' }), h('th', { text: '대장' }), h('th', { text: 'AI 분석' }), h('th.n', { text: '면적' }))),
    h('tbody', {}, ...top.map((x) => h('tr', { tabindex: '0', onclick: () => fly(x.pnu), onkeydown: (e) => { if (e.key === 'Enter') fly(x.pnu); } },
      h('td', { text: x.where }), h('td', { text: x.ledger }), h('td', { text: x.ai || '—' }), h('td.n', { text: val(x.area?.parcel) ? `${nf(val(x.area.parcel))}㎡` : '—' })))));
  const dn = val(c.diff);
  const more = dn ? `면적이 큰 순 ${top.length}필지 · ${nf(dn)}필지 모두 지도에 · 목록은 내려받기` : (dn === 0 ? '대장과 AI 결과가 다른 필지가 없습니다' : (c.diff?.note || ''));
  const bDl = h('button.t-btn.t-btn--2', { type: 'button', text: '내려받기' });
  const bRp = h('button.t-btn.t-btn--2', { type: 'button', text: '보고서에 넣기' });
  const bNew = h('button.t-btn.t-btn--2', { type: 'button', text: '다른 파일' });
  bDl.addEventListener('click', () => download(bDl));
  bRp.addEventListener('click', () => toReport(bRp));
  bNew.addEventListener('click', () => { S.importId = null; S.rec = null; bigCard.hidden = true; paintMap(null); dz.reset?.(); pane('drop'); });
  panes.result.replaceChildren(
    h('p.gf-file', {}, L.name, ' ', h('small', { text: `${nf(val(L.parcels))}필지 · ${up} · ${L.date ? L.date.slice(5).replace('.', '월 ').replace(/^0/, '') + '일' : ''}` })),
    h('label.gf-fld', {}, h('span.t-label', { text: '맞춘 서비스' }), sel),
    h('p.gf-big1', { dataset: { metric: '대장과 AI 결과가 다른 필지', v: String(dn ?? '') } }, h('span', { text: '대장과 AI 결과가 다른 필지' }), h('b', { text: nf(dn) }), h('i', { text: '필지' })),
    lines, top.length ? tb : null, more ? h('p.gf-note', { text: more }) : null,
    h('div.gf-acts.gf-acts--3', {}, bDl, bRp, bNew));
  pane('result');
}
function paintBig(c) {
  const dn = val(c.diff);
  bigCard.replaceChildren(h('small', { text: '대장과 AI 결과가 다른 필지' }), h('p.gf-bign', {}, h('b', { text: nf(dn) }), h('i', { text: '필지' })),
    h('div.gf-chips', {}, ...(c.lines || []).map((x) => h('span', {}, x.short + ' ', h('b', { text: nf(val(x.n)) })))));
  bigCard.hidden = false;
  requestAnimationFrame(padStage);
}

/* 지도 — 대장 필지: 다른 필지(붉은 칠) · AI 결과 있음(청록 선) · AI 분석 전(옅은 흰 선) */
const EMPTY = { type: 'FeatureCollection', features: [] };
async function paintMap(c) {
  const map = await stage.ready;
  const fc = c?.geojson || EMPTY;
  if (!map.getSource('gf-led')) {
    map.addSource('gf-led', { type: 'geojson', data: fc, promoteId: 'pnu' });
    map.addLayer({ id: 'gf-led-none', type: 'line', source: 'gf-led', filter: ['==', ['get', 'k'], 'none'], paint: { 'line-color': '#FFFFFF', 'line-opacity': 0.55, 'line-width': 0.8 } });
    map.addLayer({ id: 'gf-led-ai', type: 'fill', source: 'gf-led', filter: ['==', ['get', 'k'], 'ai'], paint: { 'fill-color': AI, 'fill-opacity': 0.18 } });
    map.addLayer({ id: 'gf-led-ail', type: 'line', source: 'gf-led', filter: ['==', ['get', 'k'], 'ai'], paint: { 'line-color': AI, 'line-width': 1.4 } });
    map.addLayer({ id: 'gf-led-diff', type: 'fill', source: 'gf-led', filter: ['==', ['get', 'k'], 'diff'], paint: { 'fill-color': css('--warn', WARN), 'fill-opacity': 0.72 } });
    map.addLayer({ id: 'gf-led-diffl', type: 'line', source: 'gf-led', filter: ['==', ['get', 'k'], 'diff'], paint: { 'line-color': '#FFFFFF', 'line-width': 1.2 } });
    for (const id of ['gf-led-diff', 'gf-led-ai']) {
      map.on('click', id, (e) => { const f = e.features?.[0]; if (f) popup(f.properties, e.lngLat); });
      map.on('mouseenter', id, () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', id, () => { map.getCanvas().style.cursor = ''; });
    }
  } else map.getSource('gf-led').setData(fc);
  const focus = fc.features.filter((f) => f.properties.k !== 'none');
  const b = bbox(focus.length ? focus : fc.features);
  if (b) stage.go(b, { ms: 1600, maxZoom: 16 });
}
function bbox(feats) {
  let a = null;
  const walk = (x) => { if (typeof x[0] === 'number') { a = a ? [Math.min(a[0], x[0]), Math.min(a[1], x[1]), Math.max(a[2], x[0]), Math.max(a[3], x[1])] : [x[0], x[1], x[0], x[1]]; } else x.forEach(walk); };
  for (const f of feats) if (f.geometry) walk(f.geometry.coordinates);
  return a;
}
function popup(p, at) {
  S.pop?.remove();
  const el = h('div.gf-pop', {}, h('b', { text: p.where }), h('span', { text: `대장 ${p.ledger}` }), h('span', { text: `AI 분석 ${p.ai || '—'}` }),
    p.parcel_m2 ? h('span', { text: `필지 면적 ${nf(+p.parcel_m2)}㎡` }) : null);
  S.pop = new window.maplibregl.Popup({ closeButton: true, offset: 8, maxWidth: '260px' }).setLngLat(at).setDOMContent(el).addTo(stage.map);
}
function fly(pnu) {
  const f = (S.cmp?.geojson?.features || []).find((x) => x.properties.pnu === pnu);
  if (!f) return;
  const b = bbox([f]);
  stage.go(b, { ms: 1200, maxZoom: 18 }).then(() => { const c = [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]; popup(f.properties, c); });
}

async function download(b) {
  b.disabled = true;
  try {
    const r = await api('/spaces/me/ledger/compare.xlsx?' + new URLSearchParams({ card: S.card, ...(S.importId ? { import_id: S.importId } : {}) }), { raw: true });
    if (!r.ok) throw new Error('http ' + r.status);
    const m = /filename\*=UTF-8''([^;]+)/.exec(r.headers.get('content-disposition') || '');
    const u = URL.createObjectURL(await r.blob());
    const a = document.createElement('a'); a.href = u; a.download = m ? decodeURIComponent(m[1]) : '대장과_AI결과.xlsx'; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 4000);
    K.toast('내려받았습니다');
  } catch (e) { K.devlog('xlsx', e.message); K.toast('내려받지 못했습니다'); }
  finally { b.disabled = false; }
}
async function toReport(b) {
  b.disabled = true;
  try {
    await api('/spaces/me/ledger/compare/report', { method: 'POST', body: { card: S.card, import_id: S.importId } });
    location.href = '../gov-report/?' + new URLSearchParams({ service: S.card, tab: 'report' });
  } catch (e) { K.devlog('to report', e.message); K.toast('보고서에 넣지 못했습니다'); b.disabled = false; }
}

/* ═════════ 시작 — 올린 대장이 있으면 곧바로 결과 ═════════ */
pane('result');
panes.result.replaceChildren(h('p.gf-note', { role: 'status', text: '불러오는 중' }));
await loadServices();
if (S.card) await show(); else pane('drop');
