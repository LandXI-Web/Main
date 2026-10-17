/* app.js — LX 직원 대시보드 = 개인별 맞춤 대시보드(10-17 원칙 283 · 280 · 263 — "달력 기능까지 만들고 단위 기능들을 배치를 서로 바꾸고 사이즈를 늘렸다 줄였다 커스텀").
   칸(위젯) 격자 = 공용 kit/dashgrid.js: 끌어서 자리 바꾸기 · 모서리로 크기(격자 단위) · 칸 빼기 · '칸 더하기' · '처음 모양으로' · 칸마다 보기 방식.
   배치는 사람마다 서버 사용자 설정(PUT /me/prefs/dash.lx-console)에 — 다시 로그인해도 · 다른 PC 에서도 같은 모양.
   처음 모양(원칙 214 · 216 · 226 · 234 · 236 그대로): 맨 위 공지사항(가로 8 · 3줄) · 메모(4) → 진행 현황(5 · 4줄) · 요청함(3) · 저장 용량(4) → 달력(4 · 7줄) · 최근 진행한 프로젝트(8).
   더할 수 있는 칸('칸 더하기'): 전국 분석 · 지도 서비스(내 분석 결과) — 실제 기록이 있는 것만.
   숫자는 모두 서버(GET /projects?scope=mine · /me/storage · 요청함 숫자 · /announcements · /me/memos · /me/events · /me/agenda · /national/recent · /me/analyses) — 지어낸 값 0 · 내부 지표 0.
   한 자료는 한 번만 받아 여러 칸이 같이 쓴다(진행 현황 = 최근 프로젝트 = 같은 GET /projects — 숫자 한 출처). */
import * as K from '../kit/index.js';
import { h, api, hasRoute } from '../kit/util.js';
import { staffMenu, requestCounts, STAFF_HREF } from '../kit/lx-menu.js';
import { loadDeck } from '../kit/service-card.js';
import { projectNotices, projectHref } from '../lx-project/context.js';
import { GROUPS, groupOf, stageListHref, kick, ago } from '../lx-project/board.js';
import { projCard } from '../lx-project/card.js';
import { openMe, quotaTag, pctWord, size, gb } from '../kit/me.js';
import { modal } from '../kit/modal.js';
import { dashgrid } from '../kit/dashgrid.js';

const who = await K.gate('lx-console');
const S = K.shell({ who, home: 'lx-console', rail: staffMenu('home') });
K.devDrawer({ who });
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ── 공통 — 기다림 · 문제 · 숫자 · 날짜 ─────────────────────────────── */
const wait = (el) => { const w = h('div'); el.replaceChildren(w); K.empty(w, { kind: 'loading', compact: true }).set({ progress: null }); };
const fail = (el, retry) => { const w = h('div'); el.replaceChildren(w); K.empty(w, { kind: 'error', compact: true, onRetry: retry }); };
const two = (n) => String(n).padStart(2, '0');
const mmdd = (s) => { const d = new Date(s || ''); return Number.isNaN(+d) ? '' : `${two(d.getMonth() + 1)}.${two(d.getDate())}`; };
const ymdDot = (s) => { const d = new Date(s || ''); return Number.isNaN(+d) ? '' : `${d.getFullYear()}.${two(d.getMonth() + 1)}.${two(d.getDate())}`; };
const hm = (s) => { const d = new Date(s || ''); return Number.isNaN(+d) ? '' : `${two(d.getHours())}:${two(d.getMinutes())}`; };
const when = (s) => { const d = new Date(s || ''); if (Number.isNaN(+d)) return ''; return d.toDateString() === new Date().toDateString() ? hm(s) : mmdd(s); };
const ev = (e) => (e && typeof e === 'object' && 'value' in e ? e.value : e);
const nf = (n, d = 0) => Number(n).toLocaleString('ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d });
const isoDay = (d) => `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
const dayOf = (s) => { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const DOW = ['일', '월', '화', '수', '목', '금', '토'];

/* 숫자 차오름 — 그 칸이 처음 그려질 때 한 번(0.6초) */
const counted = new Set();
function countUp(root, key) {
  const els = [...root.querySelectorAll('[data-cu]')];
  if (!els.length) return;
  const put = (x, v) => { x.firstChild.nodeValue = nf(v, +x.dataset.d || 0); };
  const skip = RM || (key && counted.has(key));
  if (key) counted.add(key);
  for (const x of els) { if (!x.firstChild || x.firstChild.nodeType !== 3) x.prepend(document.createTextNode('')); put(x, skip ? +x.dataset.cu : 0); }
  if (skip) return;
  const t0 = performance.now();
  const tick = (t) => { const k = Math.min(1, (t - t0) / 600), e = 1 - Math.pow(1 - k, 3); for (const x of els) put(x, k < 1 ? +x.dataset.cu * e : +x.dataset.cu); if (k < 1) requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
}
const num = (tag, v, d = 0, kids = []) => h(tag, { dataset: { cu: String(v), d: String(d) } }, nf(v, d), ...kids);

/* 한 자료는 한 번 — 여러 칸이 같은 약속을 나눠 쓴다(숫자 한 출처). 실패하면 지워 다음에 다시 */
const C = new Map();
const once = (k, fn) => { if (!C.has(k)) C.set(k, Promise.resolve().then(fn).catch((e) => { C.delete(k); throw e; })); return C.get(k); };
const drop = (...ks) => ks.forEach((k) => C.delete(k));
const projects = () => once('projects', () => api('/projects?scope=mine').then((j) => { S.fresh(j.as_of); return j; }));
const deck = () => once('deck', () => loadDeck().catch(() => null));

/* ── 화면 뼈대 — 알림 · 도구 줄(대시보드 수정하기) · 칸 격자 ─────────────── */
const notes = h('div.lxp-ntcs');
const bar = h('div.ld-bar');
const gridHost = h('div.ld-grid');
const page = h('div.ld', {}, h('div.ld-in', {}, notes, bar, gridHost));
S.main.append(page);
projectNotices(notes);
requestAnimationFrame(() => page.classList.add('is-in'));

/* ═══════════════ 칸 정의 ═══════════════ */
const WIDGETS = {
  /* 공지사항 — LX 관리자가 쓴 실제 글(GET /announcements) · 누르면 본문 창 */
  notice: {
    title: '공지사항', min: [3, 2], def: [8, 3], views: [{ id: 'list', label: '목록' }, { id: 'one', label: '최근 하나' }],
    async render(body, ctx) {
      wait(body);
      let j;
      try { j = await once('notice', () => api('/announcements?limit=12')); } catch { fail(body, () => { drop('notice'); ctx.refresh(); }); return; }
      const items = j.items || [];
      ctx.sub(j.total ? `${j.total}건` : null);
      if (!items.length) { body.replaceChildren(h('p.ld-foot-none', { text: '새 공지가 없습니다' })); return; }
      const open = (a) => modal({ title: a.title, body: h('div.ld-ntc-md', {}, h('p.ld-ntc-by', { text: `${a.by_name} · ${ymdDot(a.at)}` }), a.body ? h('p.ld-ntc-tx', { text: a.body }) : null) });
      if (ctx.view === 'one') {
        const a = items[0];
        body.replaceChildren(h('button.ld-ntc-one', { type: 'button', onclick: () => open(a) },
          h('b', { text: a.title }), h('small', { text: `${a.by_name} · ${ymdDot(a.at)}` }), a.body ? h('p', { text: a.body }) : null));
        return;
      }
      body.replaceChildren(h('ul.ld-ntc', {}, ...items.map((a) => h('li', {}, h('button', { type: 'button', title: a.title, onclick: () => open(a) },
        h('b', { text: a.title }), h('small.num', { text: when(a.at) }))))));
    },
  },
  /* 메모 — 나만 보는 짧은 글(GET · POST /me/memos) · 고정은 위 · 적기 한 줄(Enter) */
  memo: {
    title: '메모', min: [3, 2], def: [4, 3],
    async render(body, ctx) {
      ctx.sub('나만 보입니다');
      wait(body);
      let j;
      try { j = await once('memos', () => api('/me/memos?limit=50')); } catch { fail(body, () => { drop('memos'); ctx.refresh(); }); return; }
      const items = j.items || [];
      const act = (text, label, fn) => h('button.ld-ml-b', { type: 'button', text, 'aria-label': label, onclick: fn });
      const run = async (fn, okMsg) => { try { await fn(); if (okMsg) K.toast(okMsg); } catch (e) { K.toast(e?.message || '저장하지 못했습니다'); } drop('memos'); ctx.refresh(); };
      const list = items.length ? h('ul.ld-ml', {}, ...items.map((m) => h('li', { class: m.pinned ? 'is-pin' : '' },
        h('span.ld-ml-t', { title: m.body }, m.pinned ? h('em', { text: '고정' }) : null, m.body),
        h('small.num', { text: mmdd(m.at) }),
        h('span.ld-ml-a', {},
          act(m.pinned ? '고정 풀기' : '고정', `메모 ${m.pinned ? '고정 풀기' : '고정'}`, () => run(() => api(`/me/memos/${encodeURIComponent(m.id)}/pin`, { method: 'POST', body: { pinned: !m.pinned } }))),
          act('삭제', '메모 삭제', () => run(() => api(`/me/memos/${encodeURIComponent(m.id)}/remove`, { method: 'POST', body: {} }), '메모를 삭제했습니다')))))) : h('p.ld-foot-none', { text: '적은 메모가 없습니다' });
      const inp = h('input.t-input.ld-ml-in', { type: 'text', maxlength: '200', placeholder: '메모 적기 — Enter 로 저장', 'aria-label': '메모 적기' });
      inp.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' || e.isComposing) return;
        const text = inp.value.trim(); if (!text) return;
        inp.disabled = true;
        run(() => api('/me/memos', { method: 'POST', body: { body: text } }));
      });
      body.replaceChildren(h('div.ld-memo-b', {}, h('div.ld-ml-w', {}, list), inp));
    },
  },
  /* 프로젝트 진행 현황 — 여섯 단계(서버 단계 그대로 · lx-project/board.js GROUPS) · 숫자 = 프로젝트 카드의 단계와 같은 값 */
  board: {
    title: '프로젝트 진행 현황', min: [3, 2], def: [5, 4], more: { text: '프로젝트 목록', href: stageListHref(null) },
    views: [{ id: 'numbers', label: '숫자' }, { id: 'bars', label: '막대' }],
    async render(body, ctx) {
      wait(body);
      let j;
      try { j = await projects(); } catch { fail(body, () => { drop('projects'); ctx.refresh(); }); return; }
      const items = j.items || [];
      const left = items.filter((p) => kick(p)?.kind === 'warn').length;
      ctx.sub(items.length ? `진행 중 ${items.length} · 남은 일 있는 ${left}` : null);
      if (!items.length) {
        const x = h('div'); body.replaceChildren(x);
        K.empty(x, { kind: 'first', title: '진행 중인 프로젝트가 없습니다', compact: true, action: { label: '새 프로젝트', onClick: () => { location.href = STAFF_HREF.projects + '?new=1'; } } });
        return;
      }
      const by = GROUPS.map(() => []);
      for (const p of items) by[groupOf(p)].push(p);
      if (ctx.view === 'bars') {
        const max = Math.max(1, ...by.map((l) => l.length));
        body.replaceChildren(h('ol.ld-pb', { 'aria-label': '프로젝트 단계' }, ...GROUPS.map((g, i) => {
          const n = by[i].length;
          return h('li', { dataset: { n: String(n) } }, h('a', { href: stageListHref(g.key), 'aria-label': `${g.label} ${n}개` },
            h('span', { text: g.label }), h('i', {}, h('b', { style: `width:${Math.round(n / max * 100)}%` })), num('em.num', n)));
        })));
        return;
      }
      const ol = h('ol.ld-pf', { 'aria-label': '프로젝트 단계', class: ctx.w >= 8 ? 'is-row' : '' }, ...GROUPS.map((g, i) => {
        const n = by[i].length, warn = by[i].filter((p) => kick(p)?.kind === 'warn').length;
        return h('li', { dataset: { n: String(n), key: g.key } },
          h('a', { href: stageListHref(g.key), 'aria-label': `${g.label} ${n}개${warn ? ` · 남은 일 있는 ${warn}` : ''}` },
            num('b.num', n), h('span', { text: g.label }), warn ? h('em', { text: `남은 일 ${warn}` }) : null));
      }));
      body.replaceChildren(ol);
      countUp(ol, 'board');
    },
  },
  /* 요청함 — 검토 요청 · 분석 요청 · 보낸 요청(왼쪽 메뉴 '요청함' 숫자와 같은 한 곳) */
  inbox: {
    title: '요청함', min: [3, 2], def: [3, 4], more: { text: '전체', href: STAFF_HREF.inbox },
    views: [{ id: 'numbers', label: '숫자' }, { id: 'list', label: '목록' }],
    async render(body, ctx) {
      ctx.sub('기관의 요청과 내가 보낸 요청');
      wait(body);
      const c = await requestCounts().catch(() => null);
      if (!c || c.total === null) { fail(body, () => { wait(body); requestCounts({ force: true }); ctx.refresh(); }); return; }
      const none = !c.review && !c.request && !c.approval;
      if (ctx.view === 'list') {
        const rows = [
          ...(c.requests || []).map((r) => ({ t: r.title || '분석 요청', k: '분석 요청', at: r.at, href: STAFF_HREF.inbox + '#requests' })),
          ...(c.approvals || []).map((a) => ({ t: a.title || a.kind_label || '승인 요청', k: '보낸 요청', at: a.at, href: STAFF_HREF.inbox + '#approvals' })),
        ].sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
        body.replaceChildren(rows.length ? h('ul.ld-rows', {}, ...rows.map((r) => h('li', {}, h('a', { href: r.href },
          h('b', { text: r.t }), h('span.ld-k', { text: r.k }), h('small.num', { text: when(r.at) })))))
          : h('p.ld-foot-none', { text: none ? '지금은 기다리는 요청이 없습니다' : `검토 요청 ${c.review || 0}건은 요청함에서 봅니다` }));
        return;
      }
      const cell = (v, label, hash) => h('a.ld-cell', { href: STAFF_HREF.inbox + hash, class: v ? '' : 'is-zero', 'aria-label': `${label} ${v ?? '—'}건` },
        v === null ? h('b.num', { text: '—' }) : num('b.num', v), h('span', { text: label }));
      const cells = h('div.ld-cells', {}, cell(c.review, '검토 요청', ''), cell(c.request, '분석 요청', '#requests'), cell(c.approval, '보낸 요청', '#approvals'));
      body.replaceChildren(h('div.ld-inbox-b', {}, cells, h('p.ld-inbox-s', { text: none ? '지금은 기다리는 요청이 없습니다' : '왼쪽 메뉴 요청함 숫자와 같습니다' })));
      countUp(cells, 'inbox');
    },
  },
  /* 저장 용량 — 쓴 양(큰 숫자) · 할당 대비 막대 · 프로젝트별 · 증량 신청(GET /me/storage 한 출처) */
  store: {
    title: '저장 용량', min: [3, 2], def: [4, 4], views: [{ id: 'numbers', label: '숫자' }, { id: 'projects', label: '프로젝트별' }],
    more: { text: '내 정보', onClick: () => openMe({ onSaved: () => { drop('storage'); G.refresh('store'); }, onStorage: () => { drop('storage'); G.refresh('store'); } }) },
    async render(body, ctx) {
      wait(body);
      let j;
      try { j = await once('storage', () => api('/me/storage')); } catch { fail(body, () => { drop('storage'); ctx.refresh(); }); return; }
      const st = j.storage || {}, used = Number(ev(st.used)) || 0, q = ev(st.quota_gb), has = q !== null && q !== undefined, ps = j.projects || [];
      ctx.sub(`${has ? quotaTag(st) : '할당 없음'} · ${ps.length ? `프로젝트 ${ps.length}개` : '내가 프로젝트장인 프로젝트 없음'}`);
      const again = () => { drop('storage'); ctx.refresh(); };
      if (ctx.view === 'projects') {
        const max = Math.max(1, ...ps.map((p) => p.bytes || 0));
        body.replaceChildren(ps.length ? h('ol.ld-pb.ld-pb--store', {}, ...ps.map((p) => h('li', {}, h('span', { text: p.name, title: p.name }),
          h('i', {}, h('b', { style: `width:${Math.max(1, Math.round((p.bytes || 0) / max * 100))}%` })), h('em.num', { text: size(p.bytes) }))))
          : h('p.ld-foot-none', { text: '내가 프로젝트장인 프로젝트가 없습니다' }));
        return;
      }
      const pw = pctWord(used, q);
      const [sv, su] = size(used).split(' ');
      const big = h('div.ld-cell.ld-cell--ro', {}, h('b.num', {}, num('span', Number(sv), sv.includes('.') ? 1 : 0), ' ', h('small', { text: su })),
        h('span', { text: pw !== null ? `사용 중 · 할당의 ${pw}%` : '사용 중' }));
      const right = h('div.ld-store-r');
      if (pw !== null) {
        const w = Math.min(100, Math.max(used > 0 ? 1 : 0, Number(pw)));
        right.append(h('div.k-me-bar.ld-bar-q', { class: st.warn ? 'is-warn' : '', role: 'img', 'aria-label': `할당의 ${pw}% 사용` }, h('i', { style: `width:${w}%` })));
      }
      const pend = (j.requests || []).find((r) => r.state === 'pending');
      right.append(h('p.ld-store-s', {}, ps.length ? h('span.ld-k', { text: '프로젝트별' }) : null,
        ...ps.slice(0, ctx.w >= 6 ? 4 : 2).map((p) => h('span', { title: p.name }, h('span.ld-pn', { text: p.name }), ' ', h('b.num', { text: size(p.bytes) }))),
        ps.length > (ctx.w >= 6 ? 4 : 2) ? h('span', { text: `외 ${ps.length - (ctx.w >= 6 ? 4 : 2)}개` }) : null));
      const act = h('p.ld-store-a');
      if (st.warn) act.append(h('span.ld-warn', { text: `할당의 ${ev(st.pct)}%를 썼습니다` }));
      if (pend) act.append(h('span.ld-store-p', { text: `증량 신청 중 ${gb(ev(pend.want_gb))} · LX 관리자 확인 전` }));
      else if (has) act.append(h('button.k-me-ask', { type: 'button', text: '용량 증량 신청', onclick: () => openMe({ ask: true, onStorage: again, onSaved: again }) }));
      if (act.childNodes.length) right.append(act);
      body.replaceChildren(h('div.ld-store-b', { class: ctx.w <= 3 ? 'is-col' : '' }, big, right));
      countUp(big, 'store');
    },
  },
  /* 달력 — 내 일정(직접 적기 · 서버 · 계정별) + 플랫폼 날짜 일(GET /me/agenda — 기록에 있는 것만) · 월 · 주 · 다음 일 · 칸 크기에 따라 모양이 바뀜 */
  calendar: {
    title: '달력', min: [3, 2], def: [4, 7], views: [{ id: 'auto', label: '자동' }, { id: 'month', label: '월' }, { id: 'week', label: '주' }, { id: 'list', label: '다음 일' }],
    render(body, ctx) { return calendar(body, ctx); },
  },
  /* 최근 진행한 프로젝트 — 프로젝트 목록과 같은 카드 부품(lx-project/card.js compact) · 마지막 활동 순 · 장 수 = 칸 폭에 맞게 */
  recent: {
    title: '최근 진행한 프로젝트', min: [3, 4], def: [8, 7], more: { text: '프로젝트 목록', href: STAFF_HREF.projects + '?scope=mine' },
    views: [{ id: 'cards', label: '카드' }, { id: 'list', label: '목록' }],
    async render(body, ctx) {
      ctx.sub('마지막 활동 순 · 누르면 그 프로젝트의 지금 단계 화면');
      wait(body);
      const dk = deck();
      let j;
      try { j = await projects(); } catch { fail(body, () => { drop('projects'); ctx.refresh(); }); return; }
      const items = j.items || [];
      if (!items.length) { body.replaceChildren(h('p.ld-foot-none', { text: '진행 중인 프로젝트가 없습니다' })); return; }
      const t = (p) => +new Date(p.last_at || p.updated_at || 0) || 0;
      const sorted = items.slice().sort((a, b) => t(b) - t(a));
      if (ctx.view === 'list') {
        body.replaceChildren(h('ul.ld-rows.ld-rows--proj', {}, ...sorted.map((p) => h('li', {}, h('a', { href: projectHref(p.id) },
          h('b', { text: p.name }), h('span.ld-k', { text: GROUPS[groupOf(p)].label }), kick(p)?.kind === 'warn' ? h('em', { text: kick(p).text }) : null, h('small', { text: ago(p.last_at || p.updated_at) }))))));
        return;
      }
      const cols = Math.max(1, Math.min(6, Math.floor((ctx.px.w + 16) / (236 + 16))));
      const rows = ctx.h >= 13 ? 2 : 1;
      const top = sorted.slice(0, cols * rows);
      ctx.sub(`마지막 활동 순 · 전체 ${items.length}`);
      const d = await dk;
      const deckBy = new Map((d?.items || []).map((c) => [c.id, c]));
      const grid = h('div.la-acg.lxp-grid-c.ld-rgrid', { style: `grid-template-columns:repeat(${cols},minmax(0,1fr))`, dataset: { n: String(top.length) } }, ...top.map((p) => projCard(p, deckBy, { compact: true })));
      body.replaceChildren(grid);
    },
  },
  /* 전국 분석 — 전국 작업기가 끝낸 읍면동(GET /national/recent · 진행 장부 한 출처) · 오늘 끝난 수 · 방금 끝난 목록 */
  national: {
    title: '전국 분석', min: [3, 2], def: [4, 3], more: { text: 'XI맵', href: STAFF_HREF.ximap }, views: [{ id: 'numbers', label: '숫자' }, { id: 'list', label: '목록' }],
    async render(body, ctx) {
      wait(body);
      let j;
      try { j = await once('national', async () => ((await hasRoute('/national/recent')) ? api('/national/recent?n=12') : null)); } catch { fail(body, () => { drop('national'); ctx.refresh(); }); return; }
      if (!j) { body.replaceChildren(h('p.ld-foot-none', { text: '전국 분석 기록이 없습니다' })); return; }
      ctx.sub(j.year ? `${j.year}년 영상` : null);
      const items = j.items || [];
      if (ctx.view === 'list') {
        body.replaceChildren(items.length ? h('ul.ld-rows', {}, ...items.map((x) => h('li', {}, h('a', { href: STAFF_HREF.ximap },
          h('b', { text: [x.sgg, x.name].filter(Boolean).join(' ') }), h('span.ld-k', { text: x.asset_name }), h('small.num', { text: when(x.at) })))))
          : h('p.ld-foot-none', { text: '끝난 읍면동이 없습니다' }));
        return;
      }
      const cells = h('div.ld-cells.ld-cells--2', {},
        h('div.ld-cell.ld-cell--ro', {}, num('b.num', Number(ev(j.today?.cells)) || 0), h('span', { text: '오늘 끝난 읍면동' })),
        h('div.ld-cell.ld-cell--ro', {}, num('b.num', Number(ev(j.today?.n)) || 0), h('span', { text: '오늘 AI 분석 결과' })));
      const last = items[0];
      body.replaceChildren(h('div.ld-inbox-b', {}, cells, h('p.ld-inbox-s', { text: last ? `방금 끝난 곳 · ${[last.sgg, last.name].filter(Boolean).join(' ')} · ${when(last.at)}` : '오늘 끝난 읍면동이 없습니다' })));
      countUp(cells, 'national');
    },
  },
  /* 지도 서비스 — 내 분석 결과 묶음(GET /me/analyses · 지도 서비스 화면과 같은 출처) */
  mapsvc: {
    title: '지도 서비스', min: [3, 2], def: [4, 3], more: { text: '지도 서비스', href: STAFF_HREF.mapsvc }, views: [{ id: 'numbers', label: '숫자' }, { id: 'list', label: '목록' }],
    async render(body, ctx) {
      wait(body);
      let j;
      try { j = await once('analyses', () => api('/me/analyses')); } catch { fail(body, () => { drop('analyses'); ctx.refresh(); }); return; }
      const groups = j.groups || [], running = j.running || [];
      ctx.sub(groups.length ? `서비스 · 프로젝트 ${groups.length}개` : null);
      if (ctx.view === 'list') {
        const rows = groups.flatMap((g) => g.items.slice(0, 3).map((x) => ({ g, x }))).sort((a, b) => String(b.x.finished_at || '').localeCompare(String(a.x.finished_at || ''))).slice(0, 30);
        body.replaceChildren(rows.length ? h('ul.ld-rows', {}, ...rows.map(({ g, x }) => h('li', {}, h('a', { href: STAFF_HREF.mapsvc + '?job=' + encodeURIComponent(x.job) },
          h('b', { text: g.name }), h('span.ld-k', { text: [x.region, x.imagery?.word].filter((s) => s && s !== '—').join(' · ') }), h('small.num', { text: when(x.finished_at) })))))
          : h('p.ld-foot-none', { text: '분석 결과가 없습니다' }));
        return;
      }
      const cells = h('div.ld-cells.ld-cells--2', {},
        h('a.ld-cell', { href: STAFF_HREF.mapsvc, class: j.total ? '' : 'is-zero' }, num('b.num', Number(j.total) || 0), h('span', { text: '분석 결과' })),
        h('div.ld-cell.ld-cell--ro', { class: running.length ? 'is-run' : 'is-zero' }, num('b.num', running.length), h('span', { text: '분석 중' })));
      const last = groups.map((g) => ({ g, x: g.items[0] })).filter((r) => r.x).sort((a, b) => String(b.x.finished_at || '').localeCompare(String(a.x.finished_at || '')))[0];
      body.replaceChildren(h('div.ld-inbox-b', {}, cells, h('p.ld-inbox-s', { text: last ? `마지막 분석 · ${last.g.name} · ${when(last.x.finished_at)}` : '아직 분석 결과가 없습니다' })));
      countUp(cells, 'mapsvc');
    },
  },
};

/* ═══════════════ 달력 ═══════════════ */
const CAL = { anchor: new Date(), cache: new Map() };     // 칸이 다시 그려져도 보고 있던 달 · 주는 그대로
const KIND_KO = { mine: '내 일정', notice: '공지', approval: '승인', request: '분석 요청', project: '프로젝트', train: '학습', national: '전국 분석' };
/** 기간의 일 — 내 일정 + 플랫폼 날짜 일(두 요청 · 같은 기간은 60초 안에 다시 받지 않는다) */
function agenda(from, to) {
  const k = `${isoDay(from)}~${isoDay(to)}`;
  const hit = CAL.cache.get(k);
  if (hit && Date.now() - hit.t < 60000) return hit.p;
  const q = `?from=${isoDay(from)}&to=${isoDay(to)}`;
  const p = Promise.allSettled([api('/me/events' + q), api('/me/agenda' + q)]).then(([a, b]) => {
    if (a.status === 'rejected' && b.status === 'rejected') throw a.reason;
    const mine = a.status === 'fulfilled' ? a.value.items || [] : [];
    const plat = b.status === 'fulfilled' ? b.value.items || [] : [];
    const by = new Map();
    for (const it of [...mine, ...plat]) { const d = it.day; if (!by.has(d)) by.set(d, []); by.get(d).push(it); }
    for (const l of by.values()) l.sort((x, y) => (x.kind === 'mine' ? 0 : 1) - (y.kind === 'mine' ? 0 : 1) || String(x.time || '99').localeCompare(String(y.time || '99')));
    return { by, failed: a.status === 'rejected' ? 'mine' : b.status === 'rejected' ? 'plat' : null };
  });
  CAL.cache.set(k, { t: Date.now(), p });
  p.catch(() => CAL.cache.delete(k));
  return p;
}
const calDrop = () => CAL.cache.clear();

/** 하루 창 — 그 날의 일 · 내 일정 적기 · 고치기 · 지우기 */
function dayModal(d, redraw) {
  const title = `${d.getMonth() + 1}월 ${d.getDate()}일 (${DOW[d.getDay()]})`;
  const box = h('div.ld-cal-md');
  const m = modal({ title, body: box, size: 'md' });
  const form = (it = null) => {
    const ti = h('input.t-input', { type: 'text', maxlength: '80', placeholder: '일정 이름', 'aria-label': '일정 이름', value: it?.title || '' });
    const tm = h('input.t-input.ld-cal-time', { type: 'time', 'aria-label': '시각(선택)', value: it?.time || '' });
    const note = h('input.t-input', { type: 'text', maxlength: '300', placeholder: '메모(선택)', 'aria-label': '메모', value: it?.note || '' });
    const ok = h('button.t-btn', { type: 'submit', text: it ? '고치기' : '일정 적기' });
    const f = h('form.ld-cal-form', { onsubmit: async (e) => {
      e.preventDefault();
      const t = ti.value.trim(); if (!t) { ti.focus(); return; }
      ok.disabled = true;
      try {
        const bodyJ = { title: t, day: isoDay(d), time: tm.value || '', note: note.value.trim() };
        if (it) await api(`/me/events/${encodeURIComponent(it.id)}`, { method: 'PUT', body: bodyJ });
        else await api('/me/events', { method: 'POST', body: bodyJ });
        calDrop(); await draw(); redraw();
      } catch (err) { K.toast(err?.message || '저장하지 못했습니다'); ok.disabled = false; }
    } }, h('div.ld-cal-fr', {}, ti, tm), note, h('div.ld-cal-fa', {}, ok, it ? h('button.t-btn.t-btn--2', { type: 'button', text: '취소', onclick: () => draw() }) : null));
    return f;
  };
  async function draw() {
    box.replaceChildren(h('p.ld-foot-none', { text: '불러오는 중' }));
    let a;
    try { a = await agenda(d, d); } catch { box.replaceChildren(h('p.ld-foot-none', { text: '불러오지 못했습니다' })); return; }
    const items = a.by.get(isoDay(d)) || [];
    const list = items.length ? h('ul.ld-cal-dl', {}, ...items.map((it) => h('li', { class: it.kind === 'mine' ? 'is-mine' : '' },
      h('span.ld-cal-dt.num', { text: it.time || '' }),
      it.href ? h('a', { href: it.href, text: it.title }) : h('b', { text: it.title }),
      it.kind !== 'mine' ? h('small', { text: KIND_KO[it.kind] || '' }) : null,
      it.note ? h('small', { text: it.note }) : null,
      it.kind === 'mine' ? h('span.ld-cal-da', {},
        h('button.ld-ml-b', { type: 'button', text: '고치기', onclick: () => { box.replaceChildren(list, form(it)); } }),
        h('button.ld-ml-b', { type: 'button', text: '지우기', onclick: async () => { try { await api(`/me/events/${encodeURIComponent(it.id)}`, { method: 'DELETE' }); calDrop(); await draw(); redraw(); K.toast('일정을 지웠습니다'); } catch (e) { K.toast(e?.message || '지우지 못했습니다'); } } })) : null)))
      : h('p.ld-foot-none', { text: '이 날의 일이 없습니다' });
    box.replaceChildren(list, form());
    box.querySelector('input')?.focus();
  }
  draw();
  return m;
}

async function calendar(body, ctx) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const mode = ctx.view === 'auto' || !ctx.view ? (ctx.h >= 4 ? 'month' : ctx.w >= 6 && ctx.h >= 3 ? 'week' : 'list') : ctx.view;
  const redraw = () => ctx.refresh();
  /* 머리 — ‹ 2026.10 › · 오늘 · 일정 적기 */
  const label = h('b.ld-cal-l.num');
  const nav = (n) => { const a = CAL.anchor; CAL.anchor = mode === 'month' ? new Date(a.getFullYear(), a.getMonth() + n, 1) : addDays(a, 7 * n); redraw(); };
  const head = h('div.ld-cal-h', {},
    mode === 'list' ? null : h('button.ld-cal-n', { type: 'button', 'aria-label': mode === 'month' ? '지난달' : '지난주', html: '&lsaquo;', onclick: () => nav(-1) }),
    label,
    mode === 'list' ? null : h('button.ld-cal-n', { type: 'button', 'aria-label': mode === 'month' ? '다음달' : '다음주', html: '&rsaquo;', onclick: () => nav(1) }),
    h('span.sp'),
    mode === 'list' ? null : h('button.ld-cal-t', { type: 'button', text: '오늘', onclick: () => { CAL.anchor = new Date(); redraw(); } }),
    h('button.ld-cal-t', { type: 'button', text: '일정 적기', onclick: () => dayModal(today, redraw) }));
  const grid = h('div.ld-cal-g');
  body.replaceChildren(h('div.ld-cal', { dataset: { mode } }, head, grid));
  const dot = (it) => h('i.ld-cal-dot', { class: it.kind === 'mine' ? 'is-mine' : '', title: it.title });
  const chip = (it) => h('button.ld-cal-c', { type: 'button', class: it.kind === 'mine' ? 'is-mine' : '', title: `${it.time ? it.time + ' ' : ''}${it.title}`,
    onclick: (e) => { e.stopPropagation(); dayModal(dayOf(it.day), redraw); } }, it.time ? h('span.num', { text: it.time }) : null, it.title);

  if (mode === 'list') {
    label.textContent = `${today.getMonth() + 1}월 ${today.getDate()}일 (${DOW[today.getDay()]})`;
    const to = addDays(today, 30);
    grid.replaceChildren(h('p.ld-foot-none', { text: '불러오는 중' }));
    let a;
    try { a = await agenda(today, to); } catch { fail(grid, redraw); return; }
    const days = [...a.by.keys()].filter((k) => k >= isoDay(today)).sort();
    if (!days.length) { grid.replaceChildren(h('p.ld-foot-none', { text: '앞으로 30일 안에 일이 없습니다' })); return; }
    grid.replaceChildren(h('ul.ld-cal-list', {}, ...days.map((k) => { const d = dayOf(k); return h('li', { class: sameDay(d, today) ? 'is-today' : '' },
      h('button.ld-cal-ld', { type: 'button', onclick: () => dayModal(d, redraw) }, h('b.num', { text: `${d.getMonth() + 1}.${d.getDate()}` }), h('span', { text: sameDay(d, today) ? '오늘' : DOW[d.getDay()] })),
      h('div.ld-cal-li', {}, ...(a.by.get(k) || []).map(chip))); })));
    return;
  }
  /* 주 — 좁은 칸은 일곱 날을 세로 줄로(칸 폭이 좁아 글 칩이 못 들어갈 때) */
  if (mode === 'week' && ctx.px.w / 7 < 96) {
    const first = addDays(CAL.anchor, -CAL.anchor.getDay()); first.setHours(0, 0, 0, 0);
    const l = addDays(first, 6); label.textContent = `${first.getMonth() + 1}.${first.getDate()} – ${l.getMonth() + 1}.${l.getDate()}`;
    grid.className = 'ld-cal-g is-weekrows';
    grid.replaceChildren(h('p.ld-foot-none', { text: '불러오는 중' }));
    let a;
    try { a = await agenda(first, l); } catch { fail(grid, redraw); return; }
    grid.replaceChildren(h('ul.ld-cal-list', {}, ...Array.from({ length: 7 }, (_, i) => { const d = addDays(first, i), items = a.by.get(isoDay(d)) || [];
      return h('li', { class: sameDay(d, today) ? 'is-today' : '' },
        h('button.ld-cal-ld', { type: 'button', onclick: () => dayModal(d, redraw) }, h('b.num', { text: `${d.getMonth() + 1}.${d.getDate()}` }), h('span', { text: sameDay(d, today) ? '오늘' : DOW[d.getDay()] })),
        h('div.ld-cal-li', {}, ...(items.length ? items.slice(0, 4).map(chip) : [h('small.ld-cal-more', { text: '—' })]), items.length > 4 ? h('small.ld-cal-more', { text: `외 ${items.length - 4}` }) : null)); })));
    return;
  }
  /* 월 · 주 — 격자 */
  const a0 = CAL.anchor;
  let first, weeks;
  if (mode === 'month') { const m0 = new Date(a0.getFullYear(), a0.getMonth(), 1); first = addDays(m0, -m0.getDay()); weeks = Math.ceil((m0.getDay() + new Date(a0.getFullYear(), a0.getMonth() + 1, 0).getDate()) / 7); label.textContent = `${a0.getFullYear()}.${two(a0.getMonth() + 1)}`; }
  else { first = addDays(a0, -a0.getDay()); first.setHours(0, 0, 0, 0); weeks = 1; const l = addDays(first, 6); label.textContent = `${first.getMonth() + 1}.${first.getDate()} – ${l.getMonth() + 1}.${l.getDate()}`; }
  const last = addDays(first, weeks * 7 - 1);
  const narrow = mode === 'month' && ctx.px.w / 7 < 96;               // 좁은 달 칸 = 점으로 · 넓은 칸 · 주 보기 = 글 칩
  grid.className = `ld-cal-g is-${mode}${narrow ? ' is-narrow' : ''}`;
  grid.style.setProperty('--weeks', weeks);
  grid.replaceChildren(h('div.ld-cal-dow', {}, ...DOW.map((d, i) => h('span', { class: i === 0 ? 'is-sun' : i === 6 ? 'is-sat' : '', text: d }))));
  const cells = [];
  for (let i = 0; i < weeks * 7; i++) {
    const d = addDays(first, i), k = isoDay(d);
    const out = mode === 'month' && d.getMonth() !== a0.getMonth();
    const c = h('div.ld-cal-d', { class: [out ? 'is-out' : '', sameDay(d, today) ? 'is-today' : '', d.getDay() === 0 ? 'is-sun' : d.getDay() === 6 ? 'is-sat' : ''].filter(Boolean).join(' '), dataset: { day: k }, role: 'button', tabindex: '0', 'aria-label': `${d.getMonth() + 1}월 ${d.getDate()}일`,
      onclick: () => dayModal(d, redraw), onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); dayModal(d, redraw); } } },
      h('span.ld-cal-dn.num', { text: mode === 'week' ? `${d.getDate()}` : (d.getDate() === 1 && i > 0 ? `${d.getMonth() + 1}.1` : `${d.getDate()}`) }), h('div.ld-cal-ev'));
    cells.push(c);
  }
  grid.append(h('div.ld-cal-cells', {}, ...cells));
  let a;
  try { a = await agenda(first, last); } catch { grid.append(h('p.ld-foot-none.ld-cal-err', { text: '일정을 불러오지 못했습니다' })); return; }
  if (a.failed === 'plat') ctx.sub('플랫폼 일은 불러오지 못했습니다'); else ctx.sub(null);
  requestAnimationFrame(() => {
    const cellH = cells[0]?.clientHeight || 0;
    const fit = narrow ? 0 : Math.max(1, Math.floor((cellH - 26) / 22));
    for (const c of cells) {
      const items = a.by.get(c.dataset.day) || [];
      const evb = c.querySelector('.ld-cal-ev');
      if (!items.length) continue;
      if (narrow) { evb.append(...items.slice(0, 3).map(dot)); if (items.length > 3) evb.append(h('small.ld-cal-more.num', { text: `+${items.length - 3}` })); continue; }
      const show = items.slice(0, Math.max(1, items.length > fit ? fit - 1 : fit));
      evb.append(...show.map(chip)); if (items.length > show.length) evb.append(h('small.ld-cal-more', { text: `외 ${items.length - show.length}` }));
    }
  });
}

/* ═══════════════ 격자 ═══════════════ */
const DEFAULTS = [
  { id: 'notice', x: 0, y: 0, w: 8, h: 3, view: 'list' }, { id: 'memo', x: 8, y: 0, w: 4, h: 3 },
  { id: 'board', x: 0, y: 3, w: 5, h: 4, view: 'numbers' }, { id: 'inbox', x: 5, y: 3, w: 3, h: 4, view: 'numbers' }, { id: 'store', x: 8, y: 3, w: 4, h: 4, view: 'numbers' },
  { id: 'calendar', x: 0, y: 7, w: 4, h: 7, view: 'auto' }, { id: 'recent', x: 4, y: 7, w: 8, h: 7, view: 'cards' },
];
const G = dashgrid(gridHost, { screen: 'lx-console', widgets: WIDGETS, defaults: DEFAULTS, cols: 12, rowH: 60, gap: 12 });
bar.append(G.toolbar);

/* e2e 관측(읽기 전용) — 처음 칸들이 그려지면 */
Promise.allSettled([projects(), once('storage', () => api('/me/storage')), requestCounts(), once('notice', () => api('/announcements?limit=12')), once('memos', () => api('/me/memos?limit=50'))])
  .then(() => { window.__lxConsole = { ready: true, grid: G }; document.documentElement.dataset.consoleReady = '1'; });
