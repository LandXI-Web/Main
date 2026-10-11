/* lx-inbox — 기관에서 온 요청(구현 2차 · 확인 대장 6차 GF-6 '검토 요청' · 알림-1 · 원칙 63 · 72 · 73).
   LX 직원 = 내가 담당하는 서비스로 온 요청 · LX 관리자 = 모든 요청(담당 직원이 없는 요청은 관리자가 답한다).
   왼쪽: 답할 것 / 답한 것 목록 · 오른쪽: 대화 한 건 — 저절로 붙은 필지 정보(영상 조각 · 대장 값 · AI 결과) + 주고받은 말 + 답(한 줄 + 판정 선택).
   판정: 맞음 · AI 오류 · 모름(선택). 'AI 오류'는 서버가 재학습 표본으로 이어 쓴다. 주소 ?id= 로 그 대화를 바로 연다(알림 칸에서 온 길).
   LX 직원 = 왼쪽 메뉴 '요청함'(10차 메뉴-1 ⓐ — 기관에서 온 검토 요청 · 분석 의뢰 · 내가 올린 결재 · 알림). 머리 아래 숫자 셋은 대시보드 '요청함' 칸 · 메뉴 숫자와
   같은 한 곳(kit/lx-menu.js requestCounts) — 분석 의뢰 · 내 결재는 눌러 목록(#requests · #approvals 로 바로 연다). */
import { gate, shell, createStage, empty, toast, devDrawer, devlog, numHtml, drawer } from '../kit/index.js';
import { h, api, bboxOf } from '../kit/util.js';
import { msg, when } from '../kit/notify.js';
import { staffMenu, requestCounts } from '../kit/lx-menu.js';

/* 보낸 사람(구현 5차 · 확인 대장 '기관 화면 확인' 기관-8 ⓐ · 원칙 102) — 기관 요청(검토 요청 · 분석 요청)의 이름 · 부서 · 기관 + 연락처(선택).
   연락처는 그 사람이 스스로 적은 경우만 있고, 그 요청을 받은 LX 담당 직원과 LX 관리자에게만 온다(서버 GET /accounts/senders 가 자른다). */
const SENDERS = { reviews: {}, requests: {} };
async function loadSenders(kind, ids) {
  const want = [...new Set(ids)].filter((id) => id && !(id in SENDERS[kind]));
  if (!want.length) return;
  try {
    const j = await api(`/accounts/senders?${kind === 'reviews' ? 'review' : 'request'}=${encodeURIComponent(want.join(','))}`);
    Object.assign(SENDERS[kind], j[kind] || {});
  } catch (e) { devlog('senders', e.message); }
}
/** '남원시 농정과 박서연'(목록 한 줄) — 모르면 서버가 준 기관 · 이름 그대로 */
const fromLine = (kind, id, org, name) => { const s = SENDERS[kind][id]; return s ? [s.org || org, s.dept, s.name || name].filter(Boolean).join(' ') : [org, name].filter(Boolean).join(' · '); };
/** 요청 상세의 '보낸 사람' 칸 — 이름 · 기관 부서 / 역할 · 연락처(있을 때만) */
function senderBox(kind, id, org) {
  const box = h('section.ib-who', { 'aria-label': '보낸 사람', hidden: true });
  loadSenders(kind, [id]).then(() => {
    const s = SENDERS[kind][id];
    if (!s || !s.name) return;
    box.hidden = false;
    box.append(h('p.ib-who-l', { text: '보낸 사람' }), h('div.ib-who-r', {}, h('span.ib-av', { text: String(s.dept || s.org || org || '기관').slice(0, 1) }),
      h('span.ib-who-t', {}, h('b', { text: `${s.name} · ${[s.org || org, s.dept].filter(Boolean).join(' ')}` }),
        h('small', { text: [s.role_ko, s.contact ? `연락처 ${s.contact}` : ''].filter(Boolean).join(' · ') }))));
  });
  return box;
}
import { improveCount, openImproveDrawer } from '../ops-infra/js/improve.js';   // 개선 후보 — 내 서비스 · 기관에서 XI ChatGEO 가 못 한 요청(16차 개선-1)
import { shootStrip } from './shoots.js';   // 기관에서 온 촬영 요청(LX 관리자)

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
    { id: 'approvals', label: '요청 관리', icon: 'inbox', href: '/landxi/v3/ops-core/#/approvals' },
    { id: 'reviews', label: '검토 요청', icon: 'list' },
    { id: 'accounts', label: '계정 관리', icon: 'check', href: '/landxi/v3/ops-accounts/' }]   // 가입 신청 · 재설정 · 계정(구현 2차 T5 · 정리 — 메뉴로 잇기)
  : null;
const S = shell({ who, home: 'lx-inbox', title: admin ? 'LX 관리자 대시보드' : 'LX 직원 대시보드',
  rail: admin ? { kind: 'menu', items: RAIL, current: RAIL.findIndex((r) => r.id === 'reviews') } : staffMenu('inbox') });
devDrawer({ who });

const st = { box: 'todo', items: [], counts: null, sel: new URLSearchParams(location.search).get('id'), cur: null, stage: null, verdict: null };

/* ── 판 ───────────────────────── */
const tabs = h('div.ib-tabs', { role: 'tablist', 'aria-label': '요청 목록' },
  h('button', { type: 'button', role: 'tab', 'aria-selected': 'true', dataset: { box: 'todo' } }, h('span', { text: '답할 것' }), h('b.num', { dataset: { n: 'todo' } })),
  h('button', { type: 'button', role: 'tab', 'aria-selected': 'false', dataset: { box: 'done' } }, h('span', { text: '답한 것' }), h('b.num', { dataset: { n: 'done' } })));
const listEl = h('div.ib-list');
const convEl = h('section.ib-conv.t-card', { 'aria-label': '대화' });
/* LX 직원 — 요청함 숫자 셋(검토 요청 = 아래 목록 · 분석 의뢰 · 내 결재 = 눌러 목록) */
const cells = admin ? null : h('div.ib-cells', { role: 'group', 'aria-label': '요청함 숫자' });
const page = h('div.ib',
  {},
  h('header.ib-head', {},
    h('h1.ib-t', { text: admin ? '기관에서 온 요청' : '요청함' }),
    h('p.ib-s', { text: admin ? '모든 기관의 검토 요청과 답을 봅니다. 담당 직원이 없는 요청은 LX 관리자가 답합니다.' : '내가 담당하는 서비스로 온 요청과 내가 올린 승인 요청입니다.' }),
    cells, cells ? h('p.ib-s.ib-s-note', { text: '요청은 기관 · 직원이 맡긴 일이고, 개선 후보는 XI ChatGEO 가 답하지 못한 질문입니다. 개선 후보를 채택하면 만들 기능으로 올라갑니다.' }) : null,   // 둘이 다른 것(GPT2-8)
    admin ? shootStrip() : null),   // 촬영 요청(18차 촬영-1 ⓑ — 받는 쪽 = LX 관리자 · lx-inbox/shoots.js)
  h('div.ib-grid', {}, h('section.ib-side.t-card', { 'aria-label': '검토 요청 목록' }, tabs, listEl), convEl));
S.main.append(page);
document.title = (admin ? '기관에서 온 요청' : '요청함') + ' · Land-XI';

async function drawCells(force = false) {
  if (!cells) return;
  const [c, imp] = await Promise.all([requestCounts({ force }).catch(() => null), improveCount().catch(() => null)]);
  const cell = (k, v, label, on) => {
    const b = h(on ? 'button.ib-cell' : 'span.ib-cell', { ...(on ? { type: 'button', onclick: on } : {}), class: v ? '' : 'is-zero', dataset: { k } },
      h('b.num', { text: v === null || v === undefined ? '—' : String(v) }), h('span', { text: label }));
    return b;
  };
  cells.replaceChildren(
    cell('review', c?.review, '검토 요청'),
    cell('request', c?.request, '분석 요청', () => openList('requests', c)),
    cell('approval', c?.approval, '내 승인 요청', () => openList('approvals', c)),
    cell('improve', imp, '개선 후보', () => openImproveDrawer({ onCount: (n) => { const x = cells.querySelector('[data-k="improve"]'); if (x) { x.querySelector('b').textContent = String(n); x.classList.toggle('is-zero', !n); } } })));
  const want = location.hash.replace('#', '');
  if (!force && (want === 'requests' || want === 'approvals')) openList(want, c);
  if (!force && want === 'improve') openImproveDrawer();
}
/** 분석 의뢰(확인 대기 · 내 담당 서비스 — 관리자 승인) · 내 결재(내가 올린 결재 중 대기) 목록 서랍 */
function openList(kind, c) {
  const items = kind === 'requests' ? (c?.requests || []) : (c?.approvals || []);
  const title = kind === 'requests' ? '분석 요청' : '내 승인 요청';
  const body = h('div.ib-xl');
  if (!items.length) {
    const x = h('div'); body.append(x);
    empty(x, { kind: 'first', compact: true, title: kind === 'requests' ? '확인을 기다리는 분석 요청이 없습니다' : '승인을 기다리는 요청이 없습니다' });
  } else {
    body.append(h('p.ib-xl-s', { text: kind === 'requests' ? '내가 담당하는 서비스로 온 분석 요청입니다. 승인은 LX 관리자가 합니다.' : '내가 올린 승인 요청 가운데 LX 관리자 결정을 기다리는 것입니다.' }),
      h('ul.ib-xl-l', {}, ...items.map((it) => h('li', {},
        h('b', { text: it.title || it.kind_label || title }),
        h('span', { text: [kind === 'approvals' ? it.kind_label : null, when(it.at)].filter(Boolean).join(' · ') }),
        kind === 'requests' ? h('span.ib-xl-who', { dataset: { rid: it.id } }) : null))));
    if (kind === 'requests') loadSenders('requests', items.map((it) => it.id)).then(() => {   // 보낸 사람 — 이름 · 기관 부서(· 연락처)
      for (const el of body.querySelectorAll('.ib-xl-who')) { const s = SENDERS.requests[el.dataset.rid]; if (s?.name) el.textContent = `보낸 사람 ${[s.org, s.dept, s.name].filter(Boolean).join(' ')}${s.contact ? ` · 연락처 ${s.contact}` : ''}`; }
    });
  }
  history.replaceState(null, '', location.pathname + location.search + '#' + kind);
  drawer({ title, body, label: title, onClose: () => history.replaceState(null, '', location.pathname + location.search) });
}
drawCells();
document.addEventListener('lx:reviews', () => drawCells(true));

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
    h('span.ib-row-top', {}, h('span.ib-from', { text: fromLine('reviews', it.id, it.org, it.sender) }), chipOf(it)),
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
  await loadSenders('reviews', st.items.map((i) => i.id));
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

  /* 저절로 붙은 것 — 영상 조각(지도) · 대장 값 · AI 결과. 기관이 따로 적지 않아도 된다.
     못 읽는 파일 확인 요청(기관-6 ⓐ · topic 'file')은 필지가 아니다 — 파일 이름 · 분석 요청하려던 서비스 · 메모만(필지 지도 · 판정 칸 없음) */
  const isFile = r.topic === 'file';
  const mapEl = h('div.ib-map', { 'aria-label': '영상 조각' });
  const p = r.parcel || {}, ai = r.ai;
  const facts = h('dl.ib-facts', {},
    fact('필지', esc2(p.addr || r.where)),
    fact('대장', `<b>${esc2(p.jimok || '—')}</b>${p.area_m2 ? ' · ' + numHtml(p.area_m2, { digits: 0 }) : ''}`),
    fact('AI 분석', ai ? `<b>${esc2(ai.rule_nm || '—')}</b>${ai.evid_m2 ? ' · ' + numHtml(ai.evid_m2, { digits: 0 }) : ''}` : '—'),
    ai?.img_date ? fact('영상', esc2(ai.img_date)) : null);
  const att = isFile ? h('dl.ib-facts.ib-file', {},
    fact('파일', (r.files || []).map(esc2).join('<br>') || esc2(r.where)),
    fact('분석 요청하려던 서비스', esc2(r.service || '아직 고르지 않음')),
    fact('메모', esc2(r.messages?.find((m) => m.side === 'tenant')?.body || '없음')))
    : h('div.ib-att', {}, mapEl, facts);

  const thread = h('ol.k-rv-msgs.ib-thread', {}, ...r.messages.map(msg));

  let form = null;
  if (r.can_answer) {
    const seg = isFile ? null : h('div.ib-seg', { role: 'radiogroup', 'aria-label': '판정(선택)' },
      ...VERDICTS.map(([k, t]) => h('button', { type: 'button', role: 'radio', 'aria-checked': 'false', dataset: { v: k }, text: t })));
    seg?.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      st.verdict = st.verdict === b.dataset.v ? null : b.dataset.v;
      seg.querySelectorAll('button').forEach((x) => x.setAttribute('aria-checked', String(x.dataset.v === st.verdict)));
    });
    const inp = h('input.t-input', { type: 'text', maxlength: '500', placeholder: '한 줄로 답합니다', 'aria-label': '답' });
    const send = h('button.t-btn', { type: 'submit', text: '답 보내기' });
    form = h('form.ib-reply', { autocomplete: 'off' },
      isFile ? null : h('p.ib-reply-l', {}, h('span', { text: '판정' }), h('small', { text: '고르지 않아도 됩니다' })), seg,
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
  const scroll = h('div.ib-scroll', {}, head, senderBox('reviews', r.id, r.org), att, h('h3.ib-sub', { text: '주고받은 말' }), thread);
  convEl.replaceChildren(scroll, form);
  if (r.messages.length > 3) requestAnimationFrame(() => thread.lastElementChild?.scrollIntoView({ block: 'nearest' }));   // 말이 길게 쌓였으면 마지막 말이 보이게(머리는 그대로)
  if (!isFile) mini(mapEl, r);
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
