/* ops-core — 관리자 집: 현황(밝은 배포 지도 + 결재 대기 큰 숫자 + 할 일) + 결재함.
   관문(K2) → 셸(K1 · 메뉴 5) → 무대(K3 ops) · 카드(K5) · 큰 숫자(K6) · 표(K12) · 토스트(K13) · 개발자 서랍(K14).
   '지금 내가 승인·조치할 것이 있는가?' 한 질문에만 답한다. */
import { gate, shell, bignum, table, drawer, closeAll, toast, devDrawer, devlog, empty, t, mountCmdk } from '../../kit/index.js';
import { h, esc, ymd, api } from '../../kit/util.js';
import { sse } from '../../../shared/api-v1.js';
import { D, loadAll, loadFast, pending, pendingEnv, openAlerts, power, decide, hasS9, canon } from './data.js';
import { mountMap } from './map.js';
import { openNoticeWriter, noticeCount } from './notice.js';   // 공지 쓰기(직원-4 ⓐ — LX 직원 대시보드 '공지' 칸에 보인다)

const who = await gate('ops-core');
const INFRA = '/landxi/v3/ops-infra/';
const RAIL = [
  { id: 'overview', label: '현황', icon: 'map' },
  { id: 'infra', label: '인프라', icon: 'gear', href: INFRA },
  { id: 'tenants', label: '기관', icon: 'org', href: INFRA + '?view=tenants' },
  { id: 'deploys', label: '배포', icon: 'deploy', href: INFRA + '?view=deploys' },
  { id: 'approvals', label: '승인 요청', icon: 'inbox' },
  { id: 'reviews', label: '검토 요청', icon: 'list', href: '/landxi/v3/lx-inbox/' },   // 기관에서 온 모든 요청 · 대화(알림-1 — 관리자도 함께 본다)
  { id: 'accounts', label: '계정 관리', icon: 'check', href: '/landxi/v3/ops-accounts/' },   // 가입 신청 · 재설정 · 계정(구현 2차 T5 · 정리 — 메뉴로 잇기)
];
const S = shell({ who, home: 'ops-core', title: 'LX 관리자 대시보드', rail: { kind: 'menu', items: RAIL, current: 0, onPick: (i, it) => { if (!it.href) location.hash = it.id === 'approvals' ? '#/approvals' : '#/'; } } });
// 역할 칩 중복 방지(키트 요청 대기 중 로컬 폴백): 이름이 역할 문구와 같으면 역할 문구 한 번만 → 'LX 관리자'
{ const r = document.querySelector('.k-role'), b = r?.querySelector('b');
  if (b && r.textContent.slice(b.textContent.length).trim() === b.textContent.trim()) b.remove(); }
document.body.classList.remove('oc-boot');
/* Ctrl K — LX 관리자 운영 질문(GPU · 대기열 · 경보 · 기관 사용량 · 언어 모델) · 관리자 계정만(관문이 관리자만 들인다) */
const ck = who.key === 'lx/admin'
  ? mountCmdk({ context: () => ({ screen: 'ops', screen_name: document.body.dataset.view === 'approvals' ? 'LX 관리자 대시보드 · 승인 요청' : 'LX 관리자 대시보드 · 현황' }) }) : null;
if (ck) { const b = ck.button(); b.querySelector('span').textContent = '물어보기'; S.mast(b);
  const i = ck.el.querySelector('.k-ck-i'); if (i) i.placeholder = 'GPU 상태 · 대기열 요약 · 경보 있어?'; }

/* ── 판 두 장: 현황 · 결재 ─────────────────── */
const over = h('section.oc-over', { 'aria-label': '현황' });
const inbox = h('section.oc-inbox', { 'aria-label': '승인 요청' });
S.main.append(over, inbox);

// 현황: 지도 + 토글 + 범례 + 카드
const stageEl = h('div.oc-map');
const seg = h('div.oc-seg', { role: 'tablist', 'aria-label': '지도 범위' },
  h('button', { type: 'button', role: 'tab', 'aria-selected': 'true', dataset: { s: 'kr' }, text: '국내' }),
  h('button', { type: 'button', role: 'tab', 'aria-selected': 'false', dataset: { s: 'abroad' }, text: '해외' }));
const legend = h('div.oc-legend', { 'aria-hidden': 'true', html: '<span data-stage="ga"><i></i>운영</span><span data-stage="pilot"><i></i>시범</span><span data-stage="verify"><i></i>검증</span><span data-stage="port"><i></i>적용 요청</span>' });
const big = h('div.oc-big');
const openBtn = h('a.t-btn.oc-open', { href: '#/approvals', text: '승인 요청함 열기' });
const todoEl = h('ul.oc-todo');
const card = h('section.t-card.t-card--map.oc-card', { 'aria-label': '승인 대기' }, big, openBtn, todoEl);
over.append(stageEl, seg, legend, card);

const M = mountMap(stageEl);
const B = bignum(big, null, { label: '승인 대기', unit: '건' });
/* 로딩 중에는 '불러오는 중'(K9 기본 문구) — 응답이 오기 전 빈 상태('아직 결과가 없습니다')가 비치지 않게.
   결재 대기는 응답이 실제로 오면 0 이어도 숫자로 보인다(빈 상태 문구는 결재함 표 쪽 '결재할 것이 없습니다'). */
/* 도착 전 = 값 자리 옅은 — · 표시는 화면 가운데 하나(kit loader · 원칙 161) */
card.dataset.loading = '1';
seg.addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  seg.querySelectorAll('button').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
  over.dataset.scope = b.dataset.s;
  M.setScope(b.dataset.s);
});

function drawOverview() {
  const list = pending();
  if (!D.ok) { B.set(null); return; }            // 아직 응답 없음(또는 실패 뒤 재시도 대기) = 불러오는 중 그대로
  delete card.dataset.loading;
  B.set(pendingEnv(list));
  card.dataset.zero = list.length ? '' : '1';
  const rows = [];
  if (D.restAt) {                                  // 경보 · GPU 는 뒤에서 오는 값 — 오기 전에는 줄을 만들지 않는다(값을 지어내지 않게)
    const al = openAlerts();
    rows.push({ t: al.length ? `경보 ${al.length}` : '경보 없음', lv: al.length ? 'warn' : '', href: INFRA });
    const p = power();
    rows.push({ t: `전력 예산 ${p.hot}/${p.max} GPU 고부하`, lv: p.ok ? '' : 'warn', dot: p.hot ? 'lock' : '', href: INFRA });
  }
  /* 한 흐름: 결재 뒤 이어지는 AI 분석·실태조사(같은 작업의 GPU·사용량·배포 단계는 배포 화면 시트) */
  const flowing = canon().filter((d) => ['starting', 'analyzing', 'surveying'].includes(d.flow?.state));
  if (flowing.length) rows.push({ t: `AI 분석 진행 ${flowing.length}`, lv: '', href: INFRA + '?view=deploys' + (flowing.length === 1 ? '&deploy=' + encodeURIComponent(flowing[0].id) : '') });
  /* 기관 '한도 임박' 줄은 없앴다 — 기관에는 막는 한도가 없다(원칙 83 · 11차 "GPU 는 무상 정책"). 사용량은 '기관' 화면에서 */
  rows.push({ t: annN === null ? '공지 쓰기' : `공지 ${annN}건 · 쓰기`, lv: '', href: '#/notice' });   // 공지(직원-4 ⓐ) — 누르면 쓰기 창
  todoEl.innerHTML = rows.map((r) => `<li><a href="${esc(r.href)}" data-lv="${r.lv}"><i data-dot="${r.dot || ''}"></i><span>${esc(r.t)}</span><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3.5l4.5 4.5L6 12.5"/></svg></a></li>`).join('');
  M.sync();
}

/* 공지 — 할 일 목록의 '공지 · 쓰기' 줄(주소는 바꾸지 않고 창만) · 올린 수는 서버 GET /announcements 한 출처 */
let annN = null;
const annLoad = () => noticeCount().then((n) => { annN = n; drawOverview(); });
annLoad();
todoEl.addEventListener('click', (e) => {
  const a = e.target.closest('a[href="#/notice"]'); if (!a) return;
  e.preventDefault();
  openNoticeWriter({ onChange: annLoad });
});

/* ── 결재함 ────────────────────────────── */
const inboxWrap = h('div.oc-inbox-w');
const tbl = h('div.oc-tbl');
const none = h('div.oc-none');
inboxWrap.append(tbl, none);
inbox.append(inboxWrap);
let T = null, openKey = null, sheet = null;

function drawInbox() {
  const list = pending();
  if (!D.ok) { none.hidden = false; tbl.hidden = true; if (none.dataset.kind !== 'loading') empty(none, { kind: 'loading' }); return; }
  if (none.dataset.kind === 'loading') none.innerHTML = '';
  const rows = list.map((x) => ({ ...x, kindKo: x.kindKo, target: x.target, requester: x.requester, day: ymd(x.at) || '—' }));
  none.hidden = !!rows.length; tbl.hidden = !rows.length;
  if (!rows.length) { if (!none.firstChild) empty(none, { kind: 'first', title: '승인할 것이 없습니다', char: 'satellite' }); }
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

async function openSheet(item) {
  openKey = item.key;
  drawInbox();
  /* 지난 사용량 설정 변경 결재(옛 기록) — 지금 값(바뀌기 전)은 기관 사용량에서. 뒤에서 오는 전체 집계를 기다리지 않고 그 기관 한 곳만 읽는다 */
  const sid = item.raw?.subject?.id;
  if (item.kind === 'quota' && sid && !D.usage.some((u) => u.tenant_id === sid)) {
    const u = await api(`/t/${encodeURIComponent(sid)}/usage`).catch(() => null);
    if (u) D.usage = [...D.usage.filter((x) => x.tenant_id !== sid), u];
    item = pending().find((x) => x.key === item.key) || item;
    if (openKey !== item.key) return;
  }
  const body = h('div.oc-sheet');
  const arrow = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h10M9.5 4.5 13 8l-3.5 3.5"/></svg>';
  // 누가 · 왜(요청) — 서버 결재 행에 있는 값만(요청 사유가 없으면 줄을 만들지 않는다)
  const req = h('dl.oc-ch.oc-req');
  const put = (dl, k, html) => dl.append(h('dt', { text: k }), h('dd', { html }));
  if (item.requester && item.requester !== '—') put(req, '요청한 사람', esc(item.requester));
  if (item.why) put(req, '요청 사유', esc(item.why));
  if (item.retrain) {                                 // 재학습 사유 — 프로젝트장이 '재학습 시작' 창에서 고른 한 줄(같은 말 · 확인 17차 P-3 ⓐ)
    const n = item.retrain.round?.value ?? item.retrain.round;
    put(req, '재학습 사유', esc(`${n}차 · ${item.retrain.reason || '적지 않음'}`));
  }
  const when = item.at ? new Date(item.at) : null;
  if (when && !Number.isNaN(when.getTime())) put(req, '요청일', `<span class="num">${esc(ymd(item.at))} ${String(when.getHours()).padStart(2, '0')}:${String(when.getMinutes()).padStart(2, '0')}</span>`);
  // 무엇을 — 바뀌는 것
  const ch = h('dl.oc-ch');
  for (const [k, a, b] of item.changes || []) put(ch, k, a ? `<s>${esc(a)}</s>${arrow}<b>${esc(b)}</b>` : `<b>${esc(b)}</b>`);
  if (req.childElementCount) body.append(req);
  if (ch.childElementCount) body.append(h('p.t-label', { text: '바뀌는 것' }), ch);
  if (item.kind === 'request' && sid) {               // 기관 영상 분석 의뢰 — 판단 근거(범위 · 면적 · 예상 시간 · 대기열 · 이 기관 사용)와 올린 영상 미리 보기
    const why = h('div.oc-rq', { 'aria-busy': 'true' });
    body.append(why);
    api(`/requests/${encodeURIComponent(sid)}`).then((x) => {
      why.removeAttribute('aria-busy');
      if (x.overlay?.url) why.append(h('img.oc-rq-img', { src: x.overlay.url, alt: '올린 영상 미리 보기' }));
      const dl = h('dl.oc-ch');
      for (const [k, v] of x.basis || []) put(dl, k, esc(v));
      why.append(h('p.t-label', { text: '판단 근거' }), dl);
      if (x.state === 'pending') why.append(h('p.oc-rq-n', { text: '승인하면 대기열 순서대로 분석하고, 결과는 그 서비스의 새 시점으로 기관에 갑니다.' }));
    }).catch((e) => { why.removeAttribute('aria-busy'); devlog('request', e.code || e.message); });
  }
  sheet = drawer({ title: `${item.kindKo} · ${item.target}`, body, host: S.main, slot: 'approval', onClose: () => { openKey = null; drawInbox(); } });
  if (item.mine && !item.canDecide) {                // 요청한 사람은 스스로 결재하지 않는다(서버도 막는다) — 다른 관리자가 결재
    body.append(h('p.oc-mine', { text: '내가 올린 승인 요청입니다. 다른 관리자가 승인합니다.' }));
    return;
  }
  /* 관리자 계정이 하나뿐이면(10-01 사용자 결정 — 관리자 계정 하나를 함께 씀) 내가 올린 요청도 내가 결재하고 처리 기록에 남긴다 */
  if (item.mine) body.append(h('p.oc-mine', { text: '관리자 계정이 하나라 이 계정이 승인합니다. 처리 기록에 ‘관리자 계정 승인(단일 계정)’으로 남습니다.' }));
  const reason = h('input.t-input.oc-reason', { type: 'text', placeholder: '사유(거절할 때는 꼭 적습니다)', 'aria-label': '사유', maxlength: '120' });
  const ok = h('button.t-btn', { type: 'button', text: '승인' });
  const no = h('button.t-btn.t-btn--2', { type: 'button', text: '거절' });
  const note = h('p.oc-need', { role: 'status' });
  body.append(reason, note, h('div.oc-acts', {}, no, ok));
  const need = (text) => { note.textContent = text; reason.focus(); reason.classList.remove('is-need'); void reason.offsetWidth; reason.classList.add('is-need'); };
  reason.addEventListener('input', () => { if (reason.value.trim()) { note.textContent = ''; reason.classList.remove('is-need'); } });
  const run = async (dec) => {
    if (dec === 'reject' && !reason.value.trim()) { need('거절 사유를 적어 주세요. 요청한 사람에게 이 사유가 보입니다.'); return; }
    note.textContent = '';
    ok.disabled = no.disabled = true;
    try {
      await decide(item, dec, reason.value.trim());
      toast(dec === 'approve' ? '승인했습니다' : '거절했습니다');
      sheet.close(true); openKey = null;
      await refresh();
    } catch (e) {
      devlog('decide', `${item.key} · ${e.code || e.message}`);
      if (e.code === 'reason_required') need('거절 사유를 적어 주세요. 요청한 사람에게 이 사유가 보입니다.');
      else toast(e.code === 'self_approval' || e.code === 'conflict' ? e.message : '지금은 처리할 수 없습니다');
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
  document.title = v === 'approvals' ? 'Land-XI · LX 관리자 대시보드 · 승인 요청' : 'Land-XI · LX 관리자 대시보드';
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
  // 결재 대기(큰 숫자 · 결재함)는 결재 표가 오자마자 — 기관 사용량 · GPU · 경보는 뒤에 와서 할 일 칸만 다시 그린다(impl-1 · FR-3)
  if (fast) await loadFast(); else await loadAll(() => { if (document.body.dataset.view !== 'approvals') drawOverview(); });
  S.fresh(D.at);
  badge();
  if (document.body.dataset.view === 'approvals') drawInbox(); else drawOverview();
}
await refresh();
route();
devDrawer({ stage: M.st, who });

if (await hasS9()) {
  // S-9: 한 로그인이 관제 스트림까지(Origin 4173 허용) — deploy.changed 가 오면 점과 결재 수를 다시 읽는다
  sse('/events/ops', { events: ['deploy.changed', 'approval.requested', 'approval.decided', 'alert', 'usage.delta'], on: (name) => { if (name !== 'usage.delta') refresh(!/^approval\./.test(name)); } });
  setInterval(() => refresh(), 30000);
} else {
  // S-9 전: 같은 모양으로 폴링(배포 · 전력 6s · 나머지 30s)
  setInterval(() => refresh(true), 6000);
  setInterval(() => refresh(), 30000);
}
