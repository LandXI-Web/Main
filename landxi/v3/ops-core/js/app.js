/* ops-core — 관리자 집: 현황(밝은 배포 지도 + 결재 대기 큰 숫자 + 할 일) + 결재함.
   관문(K2) → 셸(K1 · 메뉴 5) → 무대(K3 ops) · 카드(K5) · 큰 숫자(K6) · 표(K12) · 토스트(K13) · 개발자 서랍(K14).
   '지금 내가 승인·조치할 것이 있는가?' 한 질문에만 답한다. */
import { gate, shell, bignum, table, drawer, closeAll, toast, devDrawer, devlog, empty } from '../../kit/index.js';
import { h, esc, ymd } from '../../kit/util.js';
import { sse } from '../../../shared/api-v1.js';
import { D, loadAll, loadFast, pending, pendingEnv, openAlerts, power, nearLimits, decide, hasS9 } from './data.js';
import { mountMap } from './map.js';

const who = await gate('ops-core');
const INFRA = '/landxi/v3/ops-infra/';
const RAIL = [
  { id: 'overview', label: '현황', icon: 'map' },
  { id: 'infra', label: '인프라', icon: 'gear', href: INFRA },
  { id: 'tenants', label: '기관', icon: 'org', href: INFRA + '?view=tenants' },
  { id: 'deploys', label: '배포', icon: 'deploy', href: INFRA + '?view=deploys' },
  { id: 'approvals', label: '결재', icon: 'inbox' },
];
const S = shell({ who, home: 'ops-core', rail: { kind: 'menu', items: RAIL, current: 0, onPick: (i, it) => { if (!it.href) location.hash = it.id === 'approvals' ? '#/approvals' : '#/'; } } });
// 역할 칩 중복 방지(키트 요청 대기 중 로컬 폴백): 이름이 역할 문구와 같으면 역할 문구 한 번만 → 'LX 관리자'
{ const r = document.querySelector('.k-role'), b = r?.querySelector('b');
  if (b && r.textContent.slice(b.textContent.length).trim() === b.textContent.trim()) b.remove(); }
document.body.classList.remove('oc-boot');

/* ── 판 두 장: 현황 · 결재 ─────────────────── */
const over = h('section.oc-over', { 'aria-label': '현황' });
const inbox = h('section.oc-inbox', { 'aria-label': '결재' });
S.main.append(over, inbox);

// 현황: 지도 + 토글 + 범례 + 카드
const stageEl = h('div.oc-map');
const seg = h('div.oc-seg', { role: 'tablist', 'aria-label': '지도 범위' },
  h('button', { type: 'button', role: 'tab', 'aria-selected': 'true', dataset: { s: 'kr' }, text: '국내' }),
  h('button', { type: 'button', role: 'tab', 'aria-selected': 'false', dataset: { s: 'abroad' }, text: '해외' }));
const legend = h('div.oc-legend', { 'aria-hidden': 'true', html: '<span data-stage="ga"><i></i>운영</span><span data-stage="pilot"><i></i>시범</span><span data-stage="verify"><i></i>검증</span><span data-stage="port"><i></i>적용 요청</span>' });
const big = h('div.oc-big');
const openBtn = h('a.t-btn.oc-open', { href: '#/approvals', text: '결재함 열기' });
const todoEl = h('ul.oc-todo');
const card = h('section.t-card.t-card--map.oc-card', { 'aria-label': '결재 대기' }, big, openBtn, todoEl);
over.append(stageEl, seg, legend, card);

const M = mountMap(stageEl);
const B = bignum(big, null, { label: '결재 대기', unit: '건' });
seg.addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  seg.querySelectorAll('button').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
  over.dataset.scope = b.dataset.s;
  M.setScope(b.dataset.s);
});

function drawOverview() {
  const list = pending();
  B.set(pendingEnv(list));
  card.dataset.zero = list.length ? '' : '1';
  const rows = [];
  const al = openAlerts();
  rows.push({ t: al.length ? `경보 ${al.length}` : '경보 없음', lv: al.length ? 'warn' : '', href: INFRA });
  const p = power();
  rows.push({ t: `전력 예산 ${p.hot}/${p.max} GPU 고부하`, lv: p.ok ? '' : 'warn', dot: p.hot ? 'lock' : '', href: INFRA });
  for (const q of nearLimits().slice(0, 3)) rows.push({ t: `한도 임박 ${q.name} ${q.dim}`, lv: q.over ? 'warn' : '', dot: 'lock', href: INFRA + '?view=tenants' });
  todoEl.innerHTML = rows.map((r) => `<li><a href="${esc(r.href)}" data-lv="${r.lv}"><i data-dot="${r.dot || ''}"></i><span>${esc(r.t)}</span><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3.5l4.5 4.5L6 12.5"/></svg></a></li>`).join('');
  M.sync();
}

/* ── 결재함 ────────────────────────────── */
const inboxWrap = h('div.oc-inbox-w');
const tbl = h('div.oc-tbl');
const none = h('div.oc-none');
inboxWrap.append(tbl, none);
inbox.append(inboxWrap);
let T = null, openKey = null, sheet = null;

function drawInbox() {
  const list = pending();
  const rows = list.map((x) => ({ ...x, kindKo: x.kindKo, target: x.target, requester: x.requester, day: ymd(x.at) || '—' }));
  none.hidden = !!rows.length; tbl.hidden = !rows.length;
  if (!rows.length) { if (!none.firstChild) empty(none, { kind: 'first', title: '결재할 것이 없습니다', char: 'satellite' }); }
  const cols = [
    { key: 'kindKo', label: '종류', fmt: (v) => `<span class="t-chip">${esc(v)}</span>` },
    { key: 'target', label: '대상', fmt: (v) => `<b class="oc-target">${esc(v)}</b>` },
    { key: 'requester', label: '요청자' },
    { key: 'day', label: '요청일', fmt: (v) => `<span class="num">${esc(v)}</span>` },
  ];
  if (!T) T = table(tbl, { cols, rows, sort: 'day', dir: 'desc', onRow: openSheet });
  else T.set(rows);
  tbl.querySelectorAll('tbody tr').forEach((tr, i) => tr.classList.toggle('is-on', tbl._vis?.[i]?.key === openKey));
  if (openKey && !list.find((x) => x.key === openKey)) sheet?.close(true);
}

function openSheet(item) {
  openKey = item.key;
  drawInbox();
  const body = h('div.oc-sheet');
  const ch = h('dl.oc-ch');
  for (const [k, a, b] of item.changes || []) {
    ch.append(h('dt', { text: k }), h('dd', { html: a ? `<s>${esc(a)}</s><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h10M9.5 4.5 13 8l-3.5 3.5"/></svg><b>${esc(b)}</b>` : `<b>${esc(b)}</b>` }));
  }
  const reason = h('input.t-input.oc-reason', { type: 'text', placeholder: '사유', 'aria-label': '사유', maxlength: '120' });
  const ok = h('button.t-btn', { type: 'button', text: '승인' });
  const no = h('button.t-btn.t-btn--2', { type: 'button', text: '반려' });
  body.append(h('p.t-label', { text: '바뀌는 것' }), ch, reason, h('div.oc-acts', {}, no, ok));
  sheet = drawer({ title: `${item.kindKo} · ${item.target}`, body, host: S.main, slot: 'approval', onClose: () => { openKey = null; drawInbox(); } });
  const run = async (dec) => {
    if (dec === 'reject' && !reason.value.trim()) { reason.focus(); reason.classList.remove('is-need'); void reason.offsetWidth; reason.classList.add('is-need'); return; }
    ok.disabled = no.disabled = true;
    try {
      await decide(item, dec, reason.value.trim());
      toast(dec === 'approve' ? '승인했습니다' : '반려했습니다');
      sheet.close(true); openKey = null;
      await refresh();
    } catch (e) {
      devlog('decide', `${item.key} · ${e.code || e.message}`);
      toast('지금은 처리할 수 없습니다');
      ok.disabled = no.disabled = false;
    }
  };
  ok.addEventListener('click', () => run('approve'));
  no.addEventListener('click', () => run('reject'));
}

/* ── 라우터(해시 2개) ─────────────────────── */
function route() {
  const v = /^#\/approvals/.test(location.hash) ? 'approvals' : 'overview';
  document.body.dataset.view = v;
  document.title = v === 'approvals' ? 'Land-XI 관제 · 결재' : 'Land-XI 관제';
  S.go(v === 'approvals' ? 4 : 0); badge();
  if (v === 'approvals') drawInbox();
  else { closeAll(); openKey = null; drawOverview(); M.map.resize(); }
}
addEventListener('hashchange', route);

function badge() {
  const n = pending().length, b = S.rail.querySelector('[data-i="4"]');
  if (b) b.dataset.n = n ? String(n) : '';
}

/* ── 데이터 · 실시간 ───────────────────────── */
async function refresh(fast = false) {
  if (fast) await loadFast(); else await loadAll();
  S.fresh(D.at);
  badge();
  if (document.body.dataset.view === 'approvals') drawInbox(); else drawOverview();
}
await refresh();
route();
devDrawer({ stage: M.st, who });

if (await hasS9()) {
  // S-9: 한 로그인이 관제 스트림까지(Origin 4173 허용) — deploy.changed 가 오면 점과 결재 수를 다시 읽는다
  sse('/events/ops', { events: ['deploy.changed', 'approval.requested', 'approval.decided', 'alert', 'usage.delta'], on: (name) => { if (name !== 'usage.delta') refresh(name !== 'approval.requested'); } });
  setInterval(() => refresh(), 30000);
} else {
  // S-9 전: 같은 모양으로 폴링(배포 · 전력 6s · 나머지 30s)
  setInterval(() => refresh(true), 6000);
  setInterval(() => refresh(), 30000);
}
