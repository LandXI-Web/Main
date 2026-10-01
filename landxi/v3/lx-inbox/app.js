/* lx-inbox — 기관에서 온 요청(구현 2차 · 확인 대장 6차 GF-6 '검토 요청' · 알림-1 · 원칙 63 · 72 · 73).
   LX 직원 = 내가 담당하는 서비스로 온 요청 · LX 관리자 = 모든 요청(담당 직원이 없는 요청은 관리자가 답한다).
   왼쪽: 답할 것 / 답한 것 목록 · 오른쪽: 대화 한 건 — 저절로 붙은 필지 정보(영상 조각 · 대장 값 · AI 결과) + 주고받은 말 + 답(한 줄 + 판정 선택).
   판정: 맞음 · AI 오류 · 모름(선택). 'AI 오류'는 서버가 재학습 표본으로 이어 쓴다. 주소 ?id= 로 그 대화를 바로 연다(알림 칸에서 온 길). */
import { gate, shell, createStage, empty, toast, devDrawer, devlog, numHtml } from '../kit/index.js';
import { h, api, bboxOf } from '../kit/util.js';
import { msg, when } from '../kit/notify.js';

const $ = (s, r = document) => r.querySelector(s);
const VERDICTS = [['ok', '맞음'], ['ai_error', 'AI 오류'], ['unknown', '모름']];
const MOBILE = () => matchMedia('(max-width: 960px)').matches;

const who = await gate('lx-console');                 // LX 직원 · LX 관리자만(영업 · 기관은 로그인으로 돌려보낸다)
const admin = who.key === 'lx/admin';
const RAIL = admin
  ? [{ id: 'overview', label: '현황', icon: 'map', href: '/landxi/v3/ops-core/' },          // LX 관리자 대시보드와 같은 메뉴(원칙 43) + 검토 요청
    { id: 'infra', label: '인프라', icon: 'gear', href: '/landxi/v3/ops-infra/' },
    { id: 'tenants', label: '기관', icon: 'org', href: '/landxi/v3/ops-infra/?view=tenants' },
    { id: 'deploys', label: '배포', icon: 'deploy', href: '/landxi/v3/ops-infra/?view=deploys' },
    { id: 'approvals', label: '결재', icon: 'inbox', href: '/landxi/v3/ops-core/#/approvals' },
    { id: 'reviews', label: '검토 요청', icon: 'list' },
    { id: 'accounts', label: '계정 관리', icon: 'check', href: '/landxi/v3/ops-accounts/' }]   // 가입 신청 · 재설정 · 계정(구현 2차 T5 · 정리 — 메뉴로 잇기)
  : [{ id: 'home', label: '대시보드', icon: 'home', href: '/landxi/v3/lx-console/' },
    { id: 'reviews', label: '검토 요청', icon: 'list' }];
const S = shell({ who, home: 'lx-inbox', title: admin ? 'LX 관리자 대시보드' : 'LX 직원 대시보드', rail: { kind: 'menu', items: RAIL, current: RAIL.findIndex((r) => r.id === 'reviews') } });
devDrawer({ who });

const st = { box: 'todo', items: [], counts: null, sel: new URLSearchParams(location.search).get('id'), cur: null, stage: null, verdict: null };

/* ── 판 ───────────────────────── */
const tabs = h('div.ib-tabs', { role: 'tablist', 'aria-label': '요청 목록' },
  h('button', { type: 'button', role: 'tab', 'aria-selected': 'true', dataset: { box: 'todo' } }, h('span', { text: '답할 것' }), h('b.num', { dataset: { n: 'todo' } })),
  h('button', { type: 'button', role: 'tab', 'aria-selected': 'false', dataset: { box: 'done' } }, h('span', { text: '답한 것' }), h('b.num', { dataset: { n: 'done' } })));
const listEl = h('div.ib-list');
const convEl = h('section.ib-conv.t-card', { 'aria-label': '대화' });
const page = h('div.ib',
  {},
  h('header.ib-head', {},
    h('h1.ib-t', { text: '기관에서 온 요청' }),
    h('p.ib-s', { text: admin ? '모든 기관의 검토 요청과 답을 봅니다. 담당 직원이 없는 요청은 LX 관리자가 답합니다.' : '내가 담당하는 서비스로 온 검토 요청입니다.' })),
  h('div.ib-grid', {}, h('section.ib-side.t-card', { 'aria-label': '요청 목록' }, tabs, listEl), convEl));
S.main.append(page);
document.title = '기관에서 온 요청 · Land-XI';

tabs.addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  st.box = b.dataset.box;
  tabs.querySelectorAll('button').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
  loadList();
});

/* ── 목록 ───────────────────────── */
function chipOf(it) {
  if (it.status === 'answered') return h('span.t-chip', { text: it.verdict_ko || '답변' });
  return h('span.t-chip', { 'data-lv': 'wait', text: it.status === 'seen' ? '확인 중' : '새 요청' });
}
function rowOf(it) {
  const b = h('button.ib-row', { type: 'button', 'aria-current': it.id === st.sel ? 'true' : undefined, dataset: { unread: it.unread ? '1' : '0', id: it.id } },
    h('span.ib-row-top', {}, h('span.ib-from', { text: [it.org, it.sender].filter(Boolean).join(' · ') }), chipOf(it)),
    h('b.ib-where', { text: it.where }),
    h('span.ib-memo', { text: it.note ? `"${it.note}"` : '메모 없음' }),
    h('span.ib-meta', { text: [it.service, admin ? `받는 사람 ${it.recipient}` : null, when(it.at)].filter(Boolean).join(' · ') }));
  b.addEventListener('click', () => open(it.id));
  return b;
}
let listSeq = 0;
async function loadList({ quiet = false } = {}) {
  const seq = ++listSeq;
  if (!quiet || !st.items.length) { const w = h('div'); listEl.replaceChildren(w); empty(w, { kind: 'loading' }).set({ progress: null }); }
  let j;
  try { j = await api(`/reviews?box=${st.box}&limit=200`); }
  catch (e) {
    devlog('reviews', e.message);
    if (seq !== listSeq) return;
    if (!quiet) { const w = h('div'); listEl.replaceChildren(w); empty(w, { kind: 'error', onRetry: () => loadList() }); }
    return;
  }
  if (seq !== listSeq) return;
  st.items = j.items || []; st.counts = j.counts || null;
  for (const b of tabs.querySelectorAll('[data-n]')) { const n = st.counts?.[b.dataset.n]; b.textContent = n ? String(n) : ''; }
  if (!st.items.length) {
    const w = h('div'); listEl.replaceChildren(w);
    empty(w, { kind: 'first', title: st.box === 'todo' ? '답할 요청이 없습니다' : '아직 답한 요청이 없습니다', text: '기관이 필지 카드에서 검토 요청을 보내면 여기에 옵니다' });
  } else listEl.replaceChildren(...st.items.map(rowOf));
  if (!st.sel && st.items[0] && !MOBILE()) open(st.items[0].id, { push: false });
  else if (!st.sel) blankConv();
}
/* 대화 칸의 기다림 · 빈 화면 · 문제 — 공통 모양(K9)을 카드 안쪽 여백에 */
function convState() { const w = h('div'); convEl.replaceChildren(h('div.ib-pad', {}, w)); return w; }
function blankConv() { empty(convState(), { kind: 'first', title: '요청을 고르면 대화가 열립니다' }); }

/* ── 대화 한 건 ───────────────────────── */
let convSeq = 0;
async function open(id, { push = true } = {}) {
  st.sel = id; st.verdict = null;
  for (const b of listEl.querySelectorAll('.ib-row')) { if (b.dataset.id === id) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current'); }
  if (push) history.replaceState(null, '', '?id=' + encodeURIComponent(id));
  document.body.dataset.conv = '1';
  const seq = ++convSeq;
  const w = convState(); empty(w, { kind: 'loading' }).set({ progress: null });
  let r;
  try { r = await api('/reviews/' + encodeURIComponent(id)); }
  catch (e) {
    if (seq !== convSeq) return;
    if (e.status === 404) empty(w, { kind: 'first', title: '볼 수 없는 요청입니다', text: '다른 담당자의 요청이거나 지워진 요청입니다' });
    else empty(w, { kind: 'error', onRetry: () => open(id, { push: false }) });
    return;
  }
  if (seq !== convSeq) return;
  st.cur = r;
  draw(r);
  api('/reviews/' + encodeURIComponent(id) + '/read', { method: 'POST' })
    .then(() => { document.dispatchEvent(new CustomEvent('lx:reviews')); const b = listEl.querySelector(`.ib-row[data-id="${CSS.escape(id)}"]`); if (b) b.dataset.unread = '0'; })
    .catch((e) => devlog('read', e.message));
}

function fact(label, value) { return h('div', {}, h('dt', { text: label }), h('dd', { html: value })); }

function draw(r) {
  const back = h('button.ib-back', { type: 'button', 'aria-label': '목록', html: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M12 4l-6 6 6 6"/></svg>',
    onclick: () => { document.body.dataset.conv = '0'; } });
  const head = h('header.ib-ch', {},
    back,
    h('div.ib-ch-t', {},
      h('h2', { text: r.where }),
      h('p', { text: [r.service, `${r.org} ${r.sender}`.trim(), when(r.at), admin ? `받는 사람 ${r.recipient}` : null].filter(Boolean).join(' · ') })),
    h('span.t-chip', { 'data-lv': r.status === 'answered' ? undefined : 'wait', text: r.status === 'answered' ? (r.verdict_ko || '답변') : r.status === 'seen' ? '확인 중' : '새 요청' }));

  /* 저절로 붙은 것 — 영상 조각(지도) · 대장 값 · AI 결과. 기관이 따로 적지 않아도 된다 */
  const mapEl = h('div.ib-map', { 'aria-label': '영상 조각' });
  const p = r.parcel || {}, ai = r.ai;
  const facts = h('dl.ib-facts', {},
    fact('필지', esc2(p.addr || r.where)),
    fact('대장', `<b>${esc2(p.jimok || '—')}</b>${p.area_m2 ? ' · ' + numHtml(p.area_m2, { digits: 0 }) : ''}`),
    fact('AI 분석', ai ? `<b>${esc2(ai.rule_nm || '—')}</b>${ai.evid_m2 ? ' · ' + numHtml(ai.evid_m2, { digits: 0 }) : ''}` : '—'),
    ai?.img_date ? fact('영상', esc2(ai.img_date)) : null);
  const att = h('div.ib-att', {}, mapEl, facts);

  const thread = h('ol.k-rv-msgs.ib-thread', {}, ...r.messages.map(msg));

  let form = null;
  if (r.can_answer) {
    const seg = h('div.ib-seg', { role: 'radiogroup', 'aria-label': '판정(선택)' },
      ...VERDICTS.map(([k, t]) => h('button', { type: 'button', role: 'radio', 'aria-checked': 'false', dataset: { v: k }, text: t })));
    seg.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      st.verdict = st.verdict === b.dataset.v ? null : b.dataset.v;
      seg.querySelectorAll('button').forEach((x) => x.setAttribute('aria-checked', String(x.dataset.v === st.verdict)));
    });
    const inp = h('input.t-input', { type: 'text', maxlength: '500', placeholder: '한 줄로 답합니다', 'aria-label': '답' });
    const send = h('button.t-btn', { type: 'submit', text: '답 보내기' });
    form = h('form.ib-reply', { autocomplete: 'off' },
      h('p.ib-reply-l', {}, h('span', { text: '판정' }), h('small', { text: '고르지 않아도 됩니다' })), seg,
      h('div.ib-reply-row', {}, inp, send));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = inp.value.trim();
      if (!body && !st.verdict) { inp.focus(); toast('한 줄 답이나 판정을 남겨 주세요'); return; }
      send.disabled = true;
      try {
        await api('/reviews/' + encodeURIComponent(r.id) + '/messages', { method: 'POST', body: { body, verdict: st.verdict || undefined } });
        toast(st.verdict === 'ai_error' ? '답을 보냈습니다. 다음 학습 표본에 더했습니다' : '답을 보냈습니다');
        document.dispatchEvent(new CustomEvent('lx:reviews'));
        await open(r.id, { push: false });
        loadList({ quiet: true });
      } catch (err) { devlog('answer', err.message); send.disabled = false; toast('보내지 못했습니다'); }
    });
  }
  const scroll = h('div.ib-scroll', {}, head, att, h('h3.ib-sub', { text: '주고받은 말' }), thread);
  convEl.replaceChildren(scroll, form);
  if (r.messages.length > 3) requestAnimationFrame(() => thread.lastElementChild?.scrollIntoView({ block: 'nearest' }));   // 말이 길게 쌓였으면 마지막 말이 보이게(머리는 그대로)
  mini(mapEl, r);
}
const esc2 = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* 영상 조각 — 그 필지 둘레의 영상 위에 필지 경계(흰 선). 필지 도형은 LX 계정으로 서버에서 받는다 */
async function mini(el, r) {
  if (!r.pnu) { empty(el, { kind: 'first', title: '필지 도형이 없습니다', compact: true }); return; }
  try {
    const stage = createStage(el, { interactive: true, scale: true, padding: { top: 24, bottom: 24, left: 24, right: 24 } });
    const g = await api(`/survey/parcels/${encodeURIComponent(r.pnu)}?with=geom`);
    if (st.cur !== r || !g.geometry) return;
    await stage.ready;
    await stage.geo('sel', { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: g.geometry }] }, 'focus');
    const b = bboxOf(g.geometry);
    const pad = Math.max(b[2] - b[0], b[3] - b[1]) * 0.7 + 0.0002;
    stage.go([b[0] - pad, b[1] - pad, b[2] + pad, b[3] + pad], { ms: 0, maxZoom: 18.5 });
  } catch (e) { devlog('mini', e.message); empty(el, { kind: 'first', title: '영상 조각을 불러오지 못했습니다', compact: true }); }
}

await loadList();
if (st.sel) open(st.sel, { push: false });
setInterval(() => { if (!document.hidden) loadList({ quiet: true }); }, 30000);
addEventListener('focus', () => loadList({ quiet: true }));
