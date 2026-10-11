/* app.js — LX 직원 대시보드(직원-6 4차 · 직원-7 · 10-09 13:14 "한 번에 정리" · 원칙 176 '대시보드는 요약' 10-11).
   한 줄 다섯 칸, 모두 같은 크기 = 프로젝트 진행 현황 · 저장 용량 · 내가 돌린 작업 · 요청함 · 공지.
     프로젝트 진행 현황 = 여섯 단계(서버 단계 그대로 · lx-project/board.js GROUPS)마다 한 줄(숫자 + 단계 이름 + 남은 일 있는 수).
     칩 · 진행 그래프 없음. 줄을 누르면 메뉴 '프로젝트' 목록(그 단계 거르기 · ?stage= · 원칙 99) · 맨 아래 '프로젝트 목록'.
   저장 용량(도넛 · 증량 신청은 내 정보 창 한 길) · 내가 돌린 작업 · 요청함(보낸 요청) · 공지.
   숫자는 모두 서버(GET /projects?scope=mine · /me/storage · /me/jobs · 요청함 숫자 · /announcements) — 지어낸 값 0 · 내부 지표 0. */
import * as K from '../kit/index.js';
import { h, api } from '../kit/util.js';
import { staffMenu, requestCounts, STAFF_HREF } from '../kit/lx-menu.js';
import { projectNotices, stageHref } from '../lx-project/context.js';
import { GROUPS, groupOf, stageListHref, kick } from '../lx-project/board.js';
import { openMe, storageDonut, quotaGauge, quotaTag, gb } from '../kit/me.js';
import { modal } from '../kit/modal.js';

const who = await K.gate('lx-console');
const S = K.shell({ who, home: 'lx-console', rail: staffMenu('home') });
K.devDrawer({ who });

const head = (title, more, sub) => h('div.ld-hd', {}, h('div.ld-h', {}, h('h2', {}, title), more || null), sub || null);
const moreLink = (text, href) => h('a.ld-more', { href, text });
const boardSub = h('small.ld-sub');
const board = h('section.t-card.ld-card.ld-board', { 'aria-label': '프로젝트 진행 현황' },
  head('프로젝트 진행 현황', null, boardSub), h('div.ld-flow'),
  h('p.ld-foot-s', {}, h('a.ld-more', { href: stageListHref(null), text: '프로젝트 목록' })));
const notes = h('div.lxp-ntcs');
const storeSub = h('small.ld-sub');
const store = h('section.t-card.ld-card.ld-store', { 'aria-label': '저장 용량' },
  head('저장 용량', h('button.ld-more', { type: 'button', text: '내 정보', onclick: () => openMe({ onSaved: () => drawStore(), onStorage: () => drawStore() }) }), storeSub), h('div.ld-store-b'));
const jobsSub = h('small.ld-sub');
const jobs = h('section.t-card.ld-card.ld-jobs', { 'aria-label': '내가 돌린 작업' }, head('내가 돌린 작업', null, jobsSub), h('div.ld-jobs-b'));
const inbox = h('section.t-card.ld-card.ld-inbox', { 'aria-label': '요청함' }, head('요청함', moreLink('전체', STAFF_HREF.inbox)), h('div.ld-cells'),
  h('p.ld-foot-s', {}, h('span', { text: '기관의 요청과 내가 보낸 요청 ·' }), ' ', h('span', { text: '왼쪽 메뉴 숫자와 같습니다' })));
const noticeSub = h('small.ld-sub');
const notice = h('section.t-card.ld-card.ld-notice', { 'aria-label': '공지' }, head('공지', null, noticeSub), h('ul.ld-ntc'),
  h('p.ld-foot-s', {}, h('span', { text: 'LX 관리자가 올린 공지가' }), ' ', h('span', { text: '최근 순으로 보입니다' })));
const page = h('div.ld', {}, h('div.ld-in', {}, notes, h('div.ld-row', {}, board, store, jobs, inbox, notice)));
S.main.append(page);
const wait = (el) => { const w = h('div'); el.replaceChildren(w); K.empty(w, { kind: 'loading', compact: true }).set({ progress: null }); };
const fail = (el, retry) => { const w = h('div'); el.replaceChildren(w); K.empty(w, { kind: 'error', compact: true, onRetry: retry }); };
for (const el of [board.querySelector('.ld-flow'), inbox.querySelector('.ld-cells'), store.querySelector('.ld-store-b'), jobs.querySelector('.ld-jobs-b'),
  notice.querySelector('.ld-ntc')]) wait(el);

const two = (n) => String(n).padStart(2, '0');
function when(s) {
  const d = new Date(s || ''); if (Number.isNaN(+d)) return '';
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return `${two(d.getHours())}:${two(d.getMinutes())}`;
  return `${two(d.getMonth() + 1)}.${two(d.getDate())}`;
}

projectNotices(notes);                               // 나에게 온 알림(프로젝트장 넘겨받음 · 증량 신청 승인 · 거절) — 없으면 아무것도 그리지 않는다
drawBoard();
drawStore();
drawJobs();
drawInbox();
drawNotice();
window.__lxConsole = { ready: true };                 // e2e 관측(읽기 전용)
document.documentElement.dataset.consoleReady = '1';

/* ── ① 프로젝트 진행 현황 — 요약 칸(원칙 176): 여섯 단계 한 줄씩 · 숫자 + 단계 이름 + 남은 일 있는 수 · 줄 = 그 단계 목록 ── */
async function drawBoard() {
  const box = board.querySelector('.ld-flow');
  let j;
  try { j = await api('/projects?scope=mine'); } catch { fail(box, () => { wait(box); drawBoard(); }); return; }
  S.fresh(j.as_of);
  const items = j.items || [];
  const left = items.filter((p) => kick(p)?.kind === 'warn').length;
  boardSub.replaceChildren(...(items.length ? [h('span', { text: `진행 중 ${items.length} ·` }), ' ', h('span', { text: `남은 일 있는 ${left}` })] : []));
  if (!items.length) {
    const x = h('div'); box.replaceChildren(x);
    K.empty(x, { kind: 'first', title: '진행 중인 프로젝트가 없습니다', compact: true,
      action: { label: '새 프로젝트', onClick: () => { location.href = STAFF_HREF.projects + '?new=1'; } } });
    return;
  }
  const by = GROUPS.map(() => []);
  for (const p of items) by[groupOf(p)].push(p);
  box.replaceChildren(h('ol.ld-pf', { 'aria-label': '프로젝트 단계' }, ...GROUPS.map((g, i) => {
    const n = by[i].length;
    const warn = by[i].filter((p) => kick(p)?.kind === 'warn').length;
    return h('li', { dataset: { n: String(n), key: g.key } },
      h('a', { href: stageListHref(g.key), 'aria-label': `${g.label} ${n}개${warn ? ` · 남은 일 있는 ${warn}` : ''}` },
        h('b.num', { text: String(n) }), h('span', { text: g.label }), warn ? h('em', { text: `남은 일 ${warn}` }) : null));
  })));
  /* 공개 뒤 건너뛴 결과 확인 — 남은 일 작은 줄 하나(10-11 QA-Q11 ⓐ · 서버 blocked 'after' 한 출처) · 누르면 그 프로젝트 결과 확인 */
  const after = items.filter((p) => (p.blocked || []).some((b) => b.kind === 'after'));
  if (after.length) {
    const p0 = after[0];
    box.append(h('p.ld-after', {}, h('span.ld-after-k', { text: '공개 뒤 결과 확인 남음' }),
      h('a', { href: stageHref(p0, 'review', (p0.stages || []).find((x) => x.key === 'review')?.target), text: p0.name }), after.length > 1 ? h('span', { text: `외 ${after.length - 1}곳` }) : null));
  }
}

/* ── ③ 요청함 — 검토 요청 · 분석 요청 · 보낸 요청(왼쪽 메뉴 '요청함' 숫자와 같은 한 곳) ── */
async function drawInbox() {
  const box = inbox.querySelector('.ld-cells');
  const c = await requestCounts().catch(() => null);
  if (!c || c.total === null) { fail(box, () => { wait(box); requestCounts({ force: true }); drawInbox(); }); return; }
  const cell = (v, label, hash) => h('a.ld-cell', { href: STAFF_HREF.inbox + hash, class: v ? '' : 'is-zero', 'aria-label': `${label} ${v ?? '—'}건` },
    h('b.num', { text: v === null ? '—' : String(v) }), h('span', { text: label }));
  box.replaceChildren(cell(c.review, '검토 요청', ''), cell(c.request, '분석 요청', '#requests'), cell(c.approval, '보낸 요청', '#approvals'));
}

/* ── ① 저장 용량 — 도넛(가운데 사용량 · 프로젝트별 비중) · 할당 대비 막대 · 증량 신청(직원-7 · 내 정보 창과 같은 부품 · GET /me/storage 한 출처) ── */
const ev = (e) => (e && typeof e === 'object' && 'value' in e ? e.value : e);
async function drawStore() {
  const box = store.querySelector('.ld-store-b');
  let j;
  try { j = await api('/me/storage'); } catch { fail(box, () => { wait(box); drawStore(); }); return; }
  const st = j.storage || {};
  const used = Number(ev(st.used)) || 0, q = ev(st.quota_gb);
  const has = q !== null && q !== undefined;
  storeSub.textContent = has ? `할당 ${gb(q)}` : '할당 없음';
  const ps = j.projects || [];
  const pend = (j.requests || []).find((r) => r.state === 'pending');
  const kids = [storageDonut({ projects: ps, used, quota: q, dia: 132 })];
  const g = quotaGauge(used, q, st.warn);
  if (g) kids.push(g);
  kids.push(h('p.ld-store-s', {}, h('span', { text: ps.length ? `프로젝트 ${ps.length}개의 학습데이터 · 올린 파일.` : '내가 프로젝트장인 프로젝트가 없습니다.' }), ' ',
    h('span', { text: has ? `${quotaTag(st)} — LX 관리자가 정함` : '할당은 LX 관리자가 정합니다' })));
  if (st.warn) kids.push(h('p.ld-warn', { text: `할당의 ${ev(st.pct)}%를 썼습니다` }));
  const foot = h('div.ld-store-a');
  if (pend) foot.append(h('p.ld-store-p', {}, h('span', { text: `증량 신청 중 ${gb(ev(pend.want_gb))} ·` }), ' ', h('span', { text: 'LX 관리자 확인 전' })));
  else if (has) foot.append(h('button.k-me-ask', { type: 'button', text: '용량 증량 신청', onclick: () => openMe({ ask: true, onStorage: () => drawStore(), onSaved: () => drawStore() }) }));
  if (foot.childNodes.length) kids.push(foot);
  box.replaceChildren(...kids);
}

/* ── ② 내가 돌린 작업 — 완료 · 실패 · 취소 · 진행 중(큰 숫자) · 종류별 한 줄 ── */
const md = (s) => { const d = new Date(s || ''); return Number.isNaN(+d) ? '' : `${d.getMonth() + 1}.${d.getDate()}`; };
async function drawJobs() {
  const box = jobs.querySelector('.ld-jobs-b');
  let j;
  try { j = await api('/me/jobs'); } catch { fail(box, () => { wait(box); drawJobs(); }); return; }
  const c = j.counts || {}, n = (k) => Number(ev(c[k])) || 0;
  const total = n('done') + n('failed') + n('cancelled') + n('running');
  jobsSub.textContent = total && j.first ? `${md(j.first)} – ${md(j.last)}` : '';
  if (!total) { const x = h('div'); box.replaceChildren(x); K.empty(x, { kind: 'first', title: '돌린 작업이 없습니다', compact: true }); return; }
  const cell = (v, label, cls) => h('div.ld-cell.ld-cell--ro', { class: cls }, h('b.num', { text: v.toLocaleString('ko-KR') }), h('span', { text: label }));
  const cells = h('div.ld-cells.ld-cells--2', {},
    cell(n('done'), '완료', n('done') ? '' : 'is-zero'), cell(n('failed'), '실패', n('failed') ? 'is-warn' : 'is-zero'),
    cell(n('cancelled'), '취소', n('cancelled') ? '' : 'is-zero'), cell(n('running'), '진행 중', n('running') ? '' : 'is-zero'));
  /* 종류별 — 한 줄(AI 분석 276 · 결과 갱신 108 …) */
  const kinds = (j.kinds || []).slice(0, 5).map((k) => h('span', {}, k.label + ' ', h('b.num', { text: k.n.toLocaleString('ko-KR') })));
  box.replaceChildren(cells, ...(kinds.length ? [h('p.ld-kinds', {}, h('span.ld-k', { text: '종류별' }), ...kinds)] : []));
}

/* ── ④ 공지 — LX 관리자가 쓴 실제 글(GET /announcements) · 누르면 본문 창. 비면 '새 공지가 없습니다'(지어내지 않는다) ── */
async function drawNotice() {
  const box = notice.querySelector('.ld-ntc');
  let j;
  try { j = await api('/announcements?limit=4'); } catch { fail(box, () => { wait(box); drawNotice(); }); return; }
  const items = j.items || [];
  noticeSub.textContent = j.total > items.length ? `${j.total}건 중 최근 ${items.length}` : '';
  if (!items.length) { box.replaceChildren(h('li.ld-ntc-none', { text: '새 공지가 없습니다' })); return; }
  const day = (s) => { const d = new Date(s || ''); return Number.isNaN(+d) ? '' : `${d.getFullYear()}.${two(d.getMonth() + 1)}.${two(d.getDate())}`; };
  box.replaceChildren(...items.map((a) => h('li', {}, h('button', { type: 'button', onclick: () => {
    const b = h('div.ld-ntc-md', {}, h('p.ld-ntc-by', { text: `${a.by_name} · ${day(a.at)}` }), a.body ? h('p.ld-ntc-tx', { text: a.body }) : null);
    modal({ title: a.title, body: b });
  } }, h('span.ld-when.num', { text: when(a.at) }), h('b', { text: a.title })))));
}
