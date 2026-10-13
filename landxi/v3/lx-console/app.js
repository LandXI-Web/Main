/* app.js — LX 직원 대시보드(구현 26차 · 설계 26차 8차 시안 배치 · 원칙 214 위아래 · 216 컴팩트 · 226 위 = 진행 현황 · 정량 숫자, 아래 = 최근 진행한 프로젝트 그림).
   위에서 아래로 네 줄(1440×900 에서 약 1.1화면):
     ① 프로젝트 진행 현황 — 가로 흐름(서버 단계 그대로 · lx-project/board.js GROUPS · 숫자 = 프로젝트 카드의 단계와 같은 값) · 단계를 누르면 메뉴 '프로젝트' 목록(?stage=)
     ② 내가 돌린 작업 · 요청함 · 저장 용량 — 숫자 칸 한 줄
     ③ 최근 진행한 프로젝트 — 프로젝트 목록과 같은 카드 부품(lx-project/card.js · compact: '무엇을' 줄 없이 찾는 것 · 구성원 줄 없음) 최근 활동 순 4장
     ④ 공지 · 메모(나만) · 전국 AI 현황 — 한 줄
   숫자는 모두 서버(GET /projects?scope=mine · /me/storage · /me/jobs · 요청함 숫자 · /announcements · /me/memos · /ximap/board) — 지어낸 값 0 · 내부 지표 0.
   움직임(원칙 201): 처음 한 번 떠오름 · 숫자 차오름(0.6초) · 빛 점은 일이 있는 단계만 · 맥박은 내 작업이 실제로 돌 때만 · prefers-reduced-motion 이면 끔. */
import * as K from '../kit/index.js';
import { h, api } from '../kit/util.js';
import { staffMenu, requestCounts, STAFF_HREF } from '../kit/lx-menu.js';
import { loadDeck } from '../kit/service-card.js';
import { projectNotices } from '../lx-project/context.js';
import { GROUPS, groupOf, stageListHref, kick } from '../lx-project/board.js';
import { projCard } from '../lx-project/card.js';
import { openMe, quotaTag, pctWord, size, gb } from '../kit/me.js';
import { modal } from '../kit/modal.js';

const who = await K.gate('lx-console');
const S = K.shell({ who, home: 'lx-console', rail: staffMenu('home') });
K.devDrawer({ who });
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;

const head = (title, more, sub) => h('div.ld-hd', {}, h('div.ld-h', {}, h('h2', {}, title), more || null), sub || null);
const moreLink = (text, href) => h('a.ld-more', { href, text });

/* ① 프로젝트 진행 현황 */
const boardSub = h('small.ld-sub');
const board = h('section.t-card.ld-card.ld-board', { 'aria-label': '프로젝트 진행 현황' },
  head('프로젝트 진행 현황', moreLink('프로젝트 목록', stageListHref(null)), boardSub), h('div.ld-flow'));
/* ② 숫자 칸 한 줄 */
const jobsSub = h('small.ld-sub');
const live = h('span.ld-live', { hidden: true }, h('i'), h('span', { text: '지금 도는 중' }));
const jobs = h('section.t-card.ld-card.ld-jobs', { 'aria-label': '내가 돌린 작업' }, head(h('span', {}, '내가 돌린 작업'), live, jobsSub), h('div.ld-jobs-b'));
const inbox = h('section.t-card.ld-card.ld-inbox', { 'aria-label': '요청함' },
  head('요청함', moreLink('전체', STAFF_HREF.inbox), h('small.ld-sub', { text: '기관의 요청과 내가 보낸 요청' })), h('div.ld-inbox-b'));
const storeSub = h('small.ld-sub');
const store = h('section.t-card.ld-card.ld-store', { 'aria-label': '저장 용량' },
  head('저장 용량', h('button.ld-more', { type: 'button', text: '내 정보', onclick: () => openMe({ onSaved: () => drawStore(), onStorage: () => drawStore() }) }), storeSub), h('div.ld-store-b'));
/* ③ 최근 진행한 프로젝트 */
const recentMore = moreLink('프로젝트 목록', STAFF_HREF.projects + '?scope=mine');
const recent = h('section.t-card.ld-card.ld-recent', { 'aria-label': '최근 진행한 프로젝트' },
  head('최근 진행한 프로젝트', recentMore, h('small.ld-sub', { text: '마지막 활동 순 · 누르면 그 프로젝트의 지금 단계 화면' })), h('div.la-acg.lxp-grid-c.ld-rgrid'));
/* ④ 공지 · 메모 · 전국 AI 현황 */
const footC = (title, more, body) => h('div.ld-foot-c', {}, h('h2', {}, title, more || null), body);
const noticeB = h('div.ld-ntc-b'), memoB = h('div.ld-memo-b'), natB = h('div.ld-nat-b');
const foot = h('section.t-card.ld-card.ld-foot', { 'aria-label': '공지 · 메모 · 전국 AI 현황' },
  footC('공지', null, noticeB), footC('메모', h('small.ld-foot-k', { text: '나만 보입니다' }), memoB), footC('전국 AI 현황', moreLink('XI맵에서 전국 결과', STAFF_HREF.ximap), natB));

const notes = h('div.lxp-ntcs');
const page = h('div.ld', {}, h('div.ld-in', {}, notes, board, h('div.ld-nums', {}, jobs, inbox, store), recent, foot));
S.main.append(page);

/* 불러오는 중(원칙 212) · 못 불러옴(다시 시도) */
const wait = (el) => { const w = h('div'); el.replaceChildren(w); K.empty(w, { kind: 'loading', compact: true }).set({ progress: null }); };
const fail = (el, retry) => { const w = h('div'); el.replaceChildren(w); K.empty(w, { kind: 'error', compact: true, onRetry: retry }); };
for (const el of [board.querySelector('.ld-flow'), inbox.querySelector('.ld-inbox-b'), store.querySelector('.ld-store-b'), jobs.querySelector('.ld-jobs-b'),
  recent.querySelector('.ld-rgrid'), noticeB, memoB, natB]) wait(el);

const two = (n) => String(n).padStart(2, '0');
const md = (s) => { const d = new Date(s || ''); return Number.isNaN(+d) ? '' : `${d.getMonth() + 1}.${d.getDate()}`; };
const mmdd = (s) => { const d = new Date(s || ''); return Number.isNaN(+d) ? '' : `${two(d.getMonth() + 1)}.${two(d.getDate())}`; };
function when(s) {
  const d = new Date(s || ''); if (Number.isNaN(+d)) return '';
  if (d.toDateString() === new Date().toDateString()) return `${two(d.getHours())}:${two(d.getMinutes())}`;
  return mmdd(s);
}
const ev = (e) => (e && typeof e === 'object' && 'value' in e ? e.value : e);   // 서버 봉투 → 값
const MEMO_SHOW = 3;                                  // 메모 칸에 보이는 줄(고정 위 · 최근 순)
const nf = (n, d = 0) => Number(n).toLocaleString('ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d });

/* 숫자 차오름 — 그 칸이 그려질 때 한 번(0.6초) · 줄임 설정이면 바로 */
function countUp(root) {
  const els = [...root.querySelectorAll('[data-cu]')];
  if (!els.length) return;
  const put = (x, v) => { x.firstChild.nodeValue = nf(v, +x.dataset.d || 0); };
  for (const x of els) { if (!x.firstChild || x.firstChild.nodeType !== 3) x.prepend(document.createTextNode('')); put(x, RM ? +x.dataset.cu : 0); }
  if (RM) return;
  const t0 = performance.now();
  const tick = (t) => { const k = Math.min(1, (t - t0) / 600), e = 1 - Math.pow(1 - k, 3); for (const x of els) put(x, k < 1 ? +x.dataset.cu * e : +x.dataset.cu); if (k < 1) requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
}
/** 숫자 요소 — 글은 바로 최종 값(차오름은 그 위에서만) */
const num = (tag, v, d = 0, kids = []) => { const el = h(tag, { dataset: { cu: String(v), d: String(d) } }, nf(v, d), ...kids); return el; };

projectNotices(notes);                               // 나에게 온 알림(프로젝트장 넘겨받음 · 증량 신청 승인 · 거절) — 없으면 아무것도 그리지 않는다
requestAnimationFrame(() => page.classList.add('is-in'));
Promise.allSettled([drawProjects(), drawStore(), drawJobs(), drawInbox(), drawNotice(), drawMemos(), drawNational()]).then(() => {
  window.__lxConsole = { ready: true };              // e2e 관측(읽기 전용)
  document.documentElement.dataset.consoleReady = '1';
});

/* ── ① 진행 현황 · ③ 최근 진행한 프로젝트 — 같은 한 번의 GET /projects?scope=mine(숫자 한 출처 — 진행 현황 = 프로젝트 카드 단계) ── */
async function drawProjects() {
  const box = board.querySelector('.ld-flow'), grid = recent.querySelector('.ld-rgrid');
  let j;
  try { j = await api('/projects?scope=mine'); } catch {
    const retry = () => { wait(box); wait(grid); drawProjects(); };
    fail(box, retry); fail(grid, retry); return;
  }
  S.fresh(j.as_of);
  const items = j.items || [];
  const left = items.filter((p) => kick(p)?.kind === 'warn').length;
  boardSub.replaceChildren(...(items.length ? [h('span', { text: `진행 중 ${items.length} ·` }), ' ', h('span', { text: `남은 일 있는 ${left}` })] : []));
  if (!items.length) {
    const x = h('div'); box.replaceChildren(x);
    K.empty(x, { kind: 'first', title: '진행 중인 프로젝트가 없습니다', compact: true,
      action: { label: '새 프로젝트', onClick: () => { location.href = STAFF_HREF.projects + '?new=1'; } } });
    grid.replaceChildren(); recent.hidden = true;
    return;
  }
  const by = GROUPS.map(() => []);
  for (const p of items) by[groupOf(p)].push(p);
  const ol = h('ol.ld-pf', { 'aria-label': '프로젝트 단계' }, ...GROUPS.map((g, i) => {
    const n = by[i].length;
    const warn = by[i].filter((p) => kick(p)?.kind === 'warn').length;
    return h('li', { dataset: { n: String(n), key: g.key }, class: n ? 'has-work' : '' },
      n && i ? h('i.ld-pf-flow', { 'aria-hidden': 'true' }) : null,
      h('a', { href: stageListHref(g.key), 'aria-label': `${g.label} ${n}개${warn ? ` · 남은 일 있는 ${warn}` : ''}` },
        num('b.num', n), h('span', { text: g.label }), warn ? h('em', { text: `남은 일 ${warn}` }) : null));
  }));
  box.replaceChildren(ol);
  countUp(ol);
  /* '공개 뒤 결과 확인 남음' 줄은 원칙 203(10-12)으로 뺐다 — 결과 확인은 남은 일이 아니다 */

  /* ③ 마지막 활동 순 4장 — 카드 = 프로젝트 목록 카드 그대로(compact) */
  const t = (p) => +new Date(p.last_at || p.updated_at || 0) || 0;
  const top = items.slice().sort((a, b) => t(b) - t(a)).slice(0, 4);
  recentMore.textContent = `프로젝트 목록 · 전체 ${items.length}`;
  const deck = await loadDeck().catch(() => null);
  const deckBy = new Map((deck?.items || []).map((c) => [c.id, c]));
  grid.replaceChildren(...top.map((p) => projCard(p, deckBy, { compact: true })));
  grid.dataset.n = String(top.length);
}

/* ── ② 내가 돌린 작업 — 완료 · 실패 · 취소 · 진행 중 한 줄 · 종류별 한 줄 ── */
async function drawJobs() {
  const box = jobs.querySelector('.ld-jobs-b');
  let j;
  try { j = await api('/me/jobs'); } catch { fail(box, () => { wait(box); drawJobs(); }); return; }
  const c = j.counts || {}, n = (k) => Number(ev(c[k])) || 0;
  const total = n('done') + n('failed') + n('cancelled') + n('running');
  jobsSub.textContent = total && j.first ? `${md(j.first)} – ${md(j.last)}` : '';
  live.hidden = !n('running');                                      // 맥박 = 내 작업이 실제로 돌 때만
  page.classList.toggle('is-live', n('running') > 0);
  if (!total) { const x = h('div'); box.replaceChildren(x); K.empty(x, { kind: 'first', title: '돌린 작업이 없습니다', compact: true }); return; }
  const cell = (v, label, cls) => h('div.ld-cell.ld-cell--ro', { class: cls }, num('b.num', v), h('span', { text: label }));
  const cells = h('div.ld-cells.ld-cells--4', {},
    cell(n('done'), '완료', n('done') ? '' : 'is-zero'), cell(n('failed'), '실패', n('failed') ? 'is-warn' : 'is-zero'),
    cell(n('cancelled'), '취소', n('cancelled') ? '' : 'is-zero'), cell(n('running'), '진행 중', n('running') ? 'is-run' : 'is-zero'));
  /* 종류별 — 한 줄 · 다섯 갈래가 넘으면 넷 + '기타 n' — 종류별 합 = 위 네 칸의 합(GPT4-3) */
  const ks = j.kinds || [];
  const show = ks.length > 5 ? [...ks.slice(0, 4), { label: '기타', n: ks.slice(4).reduce((a, k) => a + (Number(k.n) || 0), 0) }] : ks;
  const kinds = show.map((k) => h('span', {}, k.label + ' ', h('b.num', { text: k.n.toLocaleString('ko-KR') })));
  box.replaceChildren(cells, ...(kinds.length ? [h('p.ld-kinds', {}, h('span.ld-k', { text: '종류별' }), ...kinds)] : []));
  countUp(cells);
}

/* ── ② 요청함 — 검토 요청 · 분석 요청 · 보낸 요청(왼쪽 메뉴 '요청함' 숫자와 같은 한 곳) ── */
async function drawInbox() {
  const box = inbox.querySelector('.ld-inbox-b');
  const c = await requestCounts().catch(() => null);
  if (!c || c.total === null) { fail(box, () => { wait(box); requestCounts({ force: true }); drawInbox(); }); return; }
  const cell = (v, label, hash) => h('a.ld-cell', { href: STAFF_HREF.inbox + hash, class: v ? '' : 'is-zero', 'aria-label': `${label} ${v ?? '—'}건` },
    v === null ? h('b.num', { text: '—' }) : num('b.num', v), h('span', { text: label }));
  const cells = h('div.ld-cells', {}, cell(c.review, '검토 요청', ''), cell(c.request, '분석 요청', '#requests'), cell(c.approval, '보낸 요청', '#approvals'));
  const none = !c.review && !c.request && !c.approval;
  box.replaceChildren(cells, h('p.ld-inbox-s', { text: none ? '지금은 기다리는 요청이 없습니다' : '왼쪽 메뉴 요청함 숫자와 같습니다' }));
  countUp(cells);
}

/* ── ② 저장 용량 — 쓴 양(큰 숫자) · 할당 대비 막대 · 프로젝트별 · 증량 신청(내 정보 창 한 길 · GET /me/storage 한 출처) ── */
async function drawStore() {
  const box = store.querySelector('.ld-store-b');
  let j;
  try { j = await api('/me/storage'); } catch { fail(box, () => { wait(box); drawStore(); }); return; }
  const st = j.storage || {};
  const used = Number(ev(st.used)) || 0, q = ev(st.quota_gb);
  const has = q !== null && q !== undefined;
  const ps = j.projects || [];
  storeSub.replaceChildren(h('span', { text: has ? `${quotaTag(st)} ·` : '할당 없음 ·' }), ' ', h('span', { text: ps.length ? `프로젝트 ${ps.length}개` : '내가 프로젝트장인 프로젝트 없음' }));
  const pw = pctWord(used, q);
  const [sv, su] = size(used).split(' ');
  const big = h('div.ld-cell.ld-cell--ro', {}, h('b.num', {}, num('span', Number(sv), sv.includes('.') ? 1 : 0), ' ', h('small', { text: su })),
    h('span', { text: pw !== null ? `사용 중 · 할당의 ${pw}%` : '사용 중' }));
  const right = h('div.ld-store-r');
  if (pw !== null) {
    const w = Math.min(100, Math.max(used > 0 ? 1 : 0, Number(pw)));
    right.append(h('div.k-me-bar.ld-bar', { class: st.warn ? 'is-warn' : '', role: 'img', 'aria-label': `할당의 ${pw}% 사용` }, h('i', { style: `width:${w}%` })));
  }
  const pend = (j.requests || []).find((r) => r.state === 'pending');
  const line = h('p.ld-store-s', {}, ps.length ? h('span.ld-k', { text: '프로젝트별' }) : null,
    ...ps.slice(0, 4).map((p) => h('span', { title: p.name }, h('span.ld-pn', { text: p.name }), ' ', h('b.num', { text: size(p.bytes) }))),
    ps.length > 4 ? h('span', { text: `외 ${ps.length - 4}개` }) : null);
  right.append(line);
  const act = h('p.ld-store-a');
  if (st.warn) act.append(h('span.ld-warn', { text: `할당의 ${ev(st.pct)}%를 썼습니다` }));
  if (pend) act.append(h('span.ld-store-p', { text: `증량 신청 중 ${gb(ev(pend.want_gb))} · LX 관리자 확인 전` }));
  else if (has) act.append(h('button.k-me-ask', { type: 'button', text: '용량 증량 신청', onclick: () => openMe({ ask: true, onStorage: () => drawStore(), onSaved: () => drawStore() }) }));
  if (act.childNodes.length) right.append(act);
  box.replaceChildren(big, right);
  countUp(big);
}

/* ── ④ 공지 — LX 관리자가 쓴 실제 글(GET /announcements) · 누르면 본문 창. 비면 '새 공지가 없습니다'(지어내지 않는다) ── */
async function drawNotice() {
  let j;
  try { j = await api('/announcements?limit=2'); } catch { fail(noticeB, () => { wait(noticeB); drawNotice(); }); return; }
  const items = j.items || [];
  if (!items.length) { noticeB.replaceChildren(h('p.ld-foot-none', { text: '새 공지가 없습니다' })); return; }
  const day = (s) => { const d = new Date(s || ''); return Number.isNaN(+d) ? '' : `${d.getFullYear()}.${two(d.getMonth() + 1)}.${two(d.getDate())}`; };
  noticeB.replaceChildren(h('ul.ld-ntc', {}, ...items.map((a) => h('li', {}, h('button', { type: 'button', title: a.title, onclick: () => {
    const b = h('div.ld-ntc-md', {}, h('p.ld-ntc-by', { text: `${a.by_name} · ${day(a.at)}` }), a.body ? h('p.ld-ntc-tx', { text: a.body }) : null);
    modal({ title: a.title, body: b });
  } }, h('b', { text: a.title }), h('small.num', { text: when(a.at) }))))),
  ...(j.total > items.length ? [h('p.ld-foot-s', { text: `공지 ${j.total}건 중 최근 ${items.length}` })] : []));
}

/* ── ④ 메모 — 나만 보는 짧은 글(GET · POST /me/memos) · 고정은 위 · 적기 한 줄(Enter) · 줄마다 고정 · 지우기 ── */
async function drawMemos() {
  let j;
  try { j = await api('/me/memos?limit=' + MEMO_SHOW); } catch { fail(memoB, () => { wait(memoB); drawMemos(); }); return; }
  const items = j.items || [];
  const act = (text, label, fn) => h('button.ld-ml-b', { type: 'button', text, 'aria-label': label, onclick: fn });
  const run = async (fn, okMsg) => { try { await fn(); if (okMsg) K.toast(okMsg); } catch (e) { K.toast(e?.message || '저장하지 못했습니다'); } drawMemos(); };
  const list = items.length ? h('ul.ld-ml', {}, ...items.map((m) => h('li', { class: m.pinned ? 'is-pin' : '' },
    h('span.ld-ml-t', { title: m.body }, m.pinned ? h('em', { text: '고정' }) : null, m.body),
    h('small.num', { text: mmdd(m.at) }),
    h('span.ld-ml-a', {},
      act(m.pinned ? '고정 풀기' : '고정', `메모 ${m.pinned ? '고정 풀기' : '고정'}`, () => run(() => api(`/me/memos/${encodeURIComponent(m.id)}/pin`, { method: 'POST', body: { pinned: !m.pinned } }))),
      act('지우기', '메모 지우기', () => run(() => api(`/me/memos/${encodeURIComponent(m.id)}/remove`, { method: 'POST', body: {} }), '메모를 지웠습니다')))))) : null;
  const inp = h('input.t-input.ld-ml-in', { type: 'text', maxlength: '200', placeholder: '메모 적기 — Enter 로 저장', 'aria-label': '메모 적기' });
  inp.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.isComposing) return;
    const body = inp.value.trim(); if (!body) return;
    inp.disabled = true;
    run(() => api('/me/memos', { method: 'POST', body: { body } }));
  });
  memoB.replaceChildren(...[list, inp, j.total > items.length ? h('p.ld-foot-s', { text: `메모 ${j.total}개 중 고정 · 최근 ${items.length}` }) : null].filter(Boolean));
}

/* ── ④ 전국 AI 현황 — XI맵 전국 결과와 같은 한 출처(GET /ximap/board · 결과가 있는 시군구 · 서비스 가지 · 마지막 분석) ── */
async function drawNational() {
  let j;
  try { j = await api('/ximap/board'); } catch { fail(natB, () => { wait(natB); drawNational(); }); return; }
  const nr = ev(j?.n_regions), ns = ev(j?.n_services);
  if (!nr) { natB.replaceChildren(h('p.ld-foot-none', { text: '아직 전국 결과가 없습니다' })); return; }
  natB.replaceChildren(h('p.ld-nat-l', {},
    h('span', { text: `결과가 있는 시군구 ${nr}곳` }), ns ? h('span', { text: `서비스 ${ns}가지` }) : null,
    j.last_at ? h('span', { text: `마지막 분석 ${mmdd(j.last_at)}` }) : null));
}
