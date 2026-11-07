/* app.js — LX 직원 대시보드 = 개인별 맞춤 대시보드(10-17 원칙 283 · 280 · 263 — "달력 기능까지 만들고 단위 기능들을 배치를 서로 바꾸고 사이즈를 늘렸다 줄였다 커스텀").
   칸(위젯) 격자 = 공용 kit/dashgrid.js: 끌어서 자리 바꾸기 · 모서리로 크기(격자 단위) · 칸 빼기 · '기능 추가하기' · '처음 모양으로' · 칸마다 보기 방식.
   배치는 사람마다 서버 사용자 설정(PUT /me/prefs/dash.lx-console)에 — 다시 로그인해도 · 다른 PC 에서도 같은 모양.
   처음 모양(원칙 214 · 216 · 226 · 234 · 236 그대로): 맨 위 공지사항(가로 8 · 3줄) · 메모(4) → 진행 현황(5 · 4줄) · 요청함(3) · 저장 용량(4) → 달력(4 · 7줄) · 최근 진행한 프로젝트(8).
   더할 수 있는 칸('기능 추가하기'): 전국 분석 · 지도 서비스(내 분석 결과) — 실제 기록이 있는 것만.
   숫자는 모두 서버(GET /projects?scope=mine · /me/storage · 요청함 숫자 · /announcements · /me/memos · /me/events · /me/agenda · /national/recent · /me/analyses) — 지어낸 값 0 · 내부 지표 0.
   한 자료는 한 번만 받아 여러 칸이 같이 쓴다(진행 현황 = 최근 프로젝트 = 같은 GET /projects — 숫자 한 출처). */
import * as K from '../kit/index.js';
import { h, api, hasRoute } from '../kit/util.js';
import { staffMenu, requestCounts, STAFF_HREF } from '../kit/lx-menu.js';
import { loadDeck } from '../kit/service-card.js';
import { projectNotices, projectHref } from '../lx-project/context.js';
import { GROUPS, groupOf, stageListHref, kick, ago, seg4El } from '../lx-project/board.js';
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
/* 빈 상태 한 줄 — 칸 가운데에 */
const none = (body, text) => { body.classList.add('is-empty'); body.replaceChildren(h('p.ld-foot-none', { text })); };
/* 여러 조각을 넣되 없는 것(null)은 빼고 — replaceChildren(null) 은 'null' 글자를 넣는다 */
const put = (el, ...kids) => el.replaceChildren(...kids.filter((k) => k !== null && k !== undefined && k !== false));
/* 칸 몸통 높이(머리 · 부제 · 안쪽 여백 뺀 값) — 내용이 적으면 숫자를 키운다. 촘촘한 테마는 여백이 적어 더 많이 들어간다 */
/* 11-07: 몸통 크기 = 칸 크기(격자 값 · 움직이는 중에도 정확) − 칸 안 여백 − 머리 실제 높이(수정 중 칩 줄 · 테마까지) − 아직 없는 부제 자리 */
const subGap = (ctx) => { const s = ctx.el?.parentElement?.querySelector('.dg-sub'); return s && s.hidden ? 20 : 0; };
const boxOf = (ctx) => { const n = ctx.el?.parentElement; if (!n) return null; const cs = getComputedStyle(n), hd = n.querySelector('.dg-hd'); return { pt: parseFloat(cs.paddingTop) || 0, pb: parseFloat(cs.paddingBottom) || 0, pl: parseFloat(cs.paddingLeft) || 0, pr: parseFloat(cs.paddingRight) || 0, gap: parseFloat(cs.rowGap) || 0, hd: hd ? hd.offsetHeight : 28 }; };
const bodyH = (ctx) => { const b = boxOf(ctx); return b ? ctx.px.h - b.pt - b.pb - b.hd - b.gap - subGap(ctx) : ctx.px.h - (ctx.theme === 'dense' ? 68 : ctx.theme === 'sharp' ? 96 : 88); };
/* 줄 목록 한 줄 높이(px) — 촘촘한 테마는 21 · 그 밖 23(console.css 와 같은 값) */
const rowPx = (ctx) => (ctx.theme === 'dense' ? 21 : 23);
/* 숫자 칸 표시 방식(10-18 원칙 287) — 숫자만 · 숫자 + 막대(가장 큰 값을 100 으로 한 비율 · 실제 수에서만) */
/* 11-07 A′: 처음 표시는 '숫자 + 막대'(도표) — 예전 저장값(plain · bars)은 모두 새 처음 표시로(이름을 새로 지어 한 번 넘김) · '숫자만'은 그대로 고를 수 있다 */
const NUM_STYLES = [{ id: 'chart', label: '숫자 + 막대' }, { id: 'num', label: '숫자만' }];
const cellBar = (ctx, v, max) => (ctx.style !== 'num' ? h('i.ld-cell-bar', { 'aria-hidden': 'true' }, h('b', { style: `width:${Math.max(v > 0 ? 2 : 0, Math.round((Number(v) || 0) / Math.max(1, max) * 100))}%` })) : null);
/** 숫자 칸 묶음 높이 — 낮은 칸(xs)은 숫자 · 이름 한 줄 */
const cellsMode = (ctx) => { const H = bodyH(ctx), bars = ctx.style !== 'num'; const base = 60 + (bars ? 14 : 0); return H < base ? { cls: 'is-xs', hgt: 28, bars: false } : H >= base + 20 + 40 && ctx.px.w >= 300 ? { cls: 'is-big', hgt: base + 20, bars } : { cls: '', hgt: base, bars }; };
const nf = (n, d = 0) => Number(n).toLocaleString('ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d });
const isoDay = (d) => `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
const dayOf = (s) => { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const DOW = ['일', '월', '화', '수', '목', '금', '토'];
/* 주말(토 · 일)은 달력 어디서나 빨간 글자(10-18 사용자 "주말은 빨간색 표시" · 색은 console.css --cal-off = --warn 을 차분하게). 공휴일은 믿을 수 있는 출처가 저장소 · 서버에 없어 넣지 않았다(지어내지 않음) */
/* 공휴일(GET /holidays?year= — 키가 있으면 공공데이터포털 특일 정보 · 없으면 내장 표) — 주말처럼 빨갛게 + 이름은 마우스를 올리면 · 하루 창에 */
const HOL = new Map(), HOLY = new Map();
const holLoad = (years) => Promise.all([...new Set(years)].map((y) => HOLY.get(y) || (HOLY.set(y, api('/holidays?year=' + y).then((j) => { for (const it of j?.items || []) HOL.set(it.day, it.name); }, () => { HOLY.delete(y); })), HOLY.get(y))));
const holName = (d) => HOL.get(isoDay(d)) || '';
const dowCls = (d) => (HOL.has(isoDay(d)) ? 'is-sun is-hol' : d.getDay() === 0 ? 'is-sun' : d.getDay() === 6 ? 'is-sat' : '');

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

/* ── 도표 부품(11-07 A′ — 칸 자리 그대로 · 안의 숫자를 도표로) ─────────────────────
   색 = 잉크 농도 3단(값 있음 잉크 · 0 은 흐림) · 파랑은 진행 막대(프로젝트 다섯 칸의 지금 단계)만. 글자 14px 이상.
   칸 크기(실제 px)에 맞춰: 낮은 칸은 핵심 숫자 · 한 줄 · 큰 칸은 줄 · 목록을 더 — 넘침 · 잘림 0. */
const bodyW = (ctx) => { const b = boxOf(ctx); return b ? ctx.px.w - b.pl - b.pr : ctx.px.w - (ctx.theme === 'dense' ? 28 : 40); };
const pctW = (v, max) => `${Math.max(v > 0 ? 2 : 0, Math.round((Number(v) || 0) / Math.max(1, max) * 100))}%`;
/** 가로 막대 한 줄 — 이름 | 막대 | 값 */
const hbar = ({ label, v, max, text, href, title, extra = null }) => {
  const kids = [h('span.ld-hb-n', { text: label, title: title || label }), h('i.ld-hb-t', { 'aria-hidden': 'true' }, h('b', { style: `width:${pctW(v, max)}` })), extra, h('em.ld-hb-v.num', { text: text ?? nf(v) })];
  return h('li.ld-hb', { class: v ? '' : 'is-zero' }, href ? h('a', { href, 'aria-label': `${label} ${text ?? nf(v)}` }, ...kids) : h('span.ld-hb-r', {}, ...kids));
};
/** 둥근 고리 — 할당 대비 쓴 비율 */
function ring(pct, size, warn) {
  const NS = 'http://www.w3.org/2000/svg', r = 40, c = 2 * Math.PI * r, p = Math.max(0, Math.min(100, Number(pct) || 0));
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 96 96'); svg.setAttribute('width', size); svg.setAttribute('height', size); svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('ld-ring'); if (warn) svg.classList.add('is-warn');
  const mk = (cls, dash) => { const e = document.createElementNS(NS, 'circle'); e.setAttribute('cx', 48); e.setAttribute('cy', 48); e.setAttribute('r', r); e.setAttribute('class', cls); if (dash) { e.setAttribute('stroke-dasharray', dash); e.setAttribute('transform', 'rotate(-90 48 48)'); } return e; };
  svg.append(mk('ld-ring-bg'), mk('ld-ring-fg', `${Math.max(p > 0 ? 1.5 : 0.01, p / 100 * c)} ${c}`));
  return svg;
}
/** 날짜별 막대(세로) — counts: [{ day: Date, n }] 오래된 → 오늘 */
const dayBars = (counts, { axis = true, label = '' } = {}) => {
  const max = Math.max(1, ...counts.map((x) => x.n));
  const f = counts[0]?.day, l = counts[counts.length - 1]?.day;
  return h('div.ld-db', { role: 'img', 'aria-label': label },
    h('div.ld-db-c', {}, ...counts.map((x) => h('i', { class: x.n ? '' : 'is-zero', title: `${x.day.getMonth() + 1}.${x.day.getDate()} · ${x.n}건`, style: `height:${x.n ? Math.max(8, Math.round(x.n / max * 100)) : 0}%` }))),
    axis && f ? h('div.ld-db-a', {}, h('small.num', { text: `${f.getMonth() + 1}.${f.getDate()}` }), h('small', { text: '오늘' })) : null);
};

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
/* 11-07 A′(PM '합친다') — 맨 위 알림 띠와 '대시보드 수정하기'를 한 줄로(알림이 없으면 단추만 오른쪽) */
const page = h('div.ld', {}, h('div.ld-in', {}, h('div.ld-top', {}, notes, bar), gridHost));
S.main.append(page);
projectNotices(notes);
requestAnimationFrame(() => page.classList.add('is-in'));

/* ═══════════════ 칸 정의 ═══════════════ */
const WIDGETS = {
  /* 공지사항 — LX 관리자가 쓴 실제 글(GET /announcements) · 누르면 본문 창.
     11-07 PM: 제목만 여러 줄(본문은 칸에 보이지 않음 · 날짜는 작게 오른쪽) · 머리 오른쪽 '공지사항 →' = 게시판 공지사항 탭.
     칸 높이에 들어가는 줄만 그리고, 칸 크기 · 글꼴이 바뀌면 실제 높이로 다시 맞춘다(잘림 · 칸 안 스크롤 0) */
  notice: {
    title: '공지사항', min: [3, 2], def: [8, 3], more: { text: '공지사항', href: '/landxi/v3/lx-board/?tab=notice' },
    async render(body, ctx) {
      wait(body);
      const my = (body._n = (body._n || 0) + 1);                      // 늦게 끝난 지난 그리기가 새 크기를 덮지 않게
      let j;
      try { j = await once('notice', () => api('/announcements?limit=12')); } catch { fail(body, () => { drop('notice'); ctx.refresh(); }); return; }
      if (body._n !== my) return;
      const items = j.items || [];
      ctx.sub(j.total ? `${j.total}건` : null);
      if (!items.length) { none(body, '새 공지가 없습니다'); return; }
      const open = (a) => modal({ title: a.title, body: h('div.ld-ntc-md', {}, h('p.ld-ntc-by', { text: `${a.by_name} · ${ymdDot(a.at)}` }), a.body ? h('p.ld-ntc-tx', { text: a.body }) : null) });
      const wide = ctx.px.w >= 420;
      const list = h('ul.ld-ntc.is-titles', {}, ...items.map((a) => h('li', {}, h('button', { type: 'button', title: a.title, onclick: () => open(a) },
        h('b', { text: a.title }), h('small.num', { text: wide ? ymdDot(a.at) : when(a.at) })))));
      put(body, list);
      /* 들어가는 줄만 — 칸 몸통 아래를 넘는 줄은 숨긴다(첫 줄은 늘 보인다) */
      const fit = () => {
        if (body._n !== my || !list.isConnected) return;
        const lis = [...list.children];
        lis.forEach((li) => { li.hidden = false; });
        const bottom = body.getBoundingClientRect().bottom;
        lis.forEach((li, i) => { if (i > 0 && li.getBoundingClientRect().bottom > bottom + 0.5) li.hidden = true; });
      };
      requestAnimationFrame(fit);
      document.fonts?.ready.then(fit);
      body._ntcFit = fit;
      if (!body._ntcRO) { body._ntcRO = new ResizeObserver(() => body._ntcFit?.()); body._ntcRO.observe(body); }
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
          act('삭제', '메모 삭제', () => run(() => api(`/me/memos/${encodeURIComponent(m.id)}/remove`, { method: 'POST', body: {} }), '메모를 삭제했습니다')))))) : h('p.ld-foot-none.ld-ml-none', { text: '적은 메모가 없습니다' });
      const inp = h('input.t-input.ld-ml-in', { type: 'text', maxlength: '200', placeholder: '메모 적기 — Enter 로 저장', 'aria-label': '메모 적기' });
      inp.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' || e.isComposing) return;
        const text = inp.value.trim(); if (!text) return;
        inp.disabled = true;
        run(() => api('/me/memos', { method: 'POST', body: { body: text } }));
      });
      if (bodyH(ctx) < 64) { ctx.sub(items.length ? `나만 보입니다 · ${items.length}개` : '나만 보입니다'); body.replaceChildren(h('div.ld-memo-b.is-xs', {}, inp)); return; }   // 낮은 칸 — 적기 한 줄만(개수는 머리에)
      body.replaceChildren(h('div.ld-memo-b', {}, h('div.ld-ml-w', {}, list), inp));
    },
  },
  /* 프로젝트 진행 현황 — 여섯 단계(서버 단계 그대로 · lx-project/board.js GROUPS) · 숫자 = 프로젝트 카드의 단계와 같은 값 */
  board: {
    title: '프로젝트 진행 현황', min: [3, 2], def: [5, 4], more: { text: '프로젝트 목록', href: stageListHref(null) },
    /* 11-07 A′: 처음 보기 = 단계별 막대(예전 저장값 numbers · bars 모두 막대로) · 예전 큰 숫자 모양은 '숫자'(cells) */
    views: [{ id: 'chart', label: '막대' }, { id: 'cells', label: '숫자' }],
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
      if (ctx.view !== 'cells') {
        /* 단계별 가로 막대 — 다섯 줄이 들어가면 모두 · 낮은 칸은 값 있는 단계부터 들어가는 만큼 + '그 밖' 한 줄 */
        const H = bodyH(ctx), W = bodyW(ctx), max = Math.max(1, ...by.map((l) => l.length));
        const rowsAll = GROUPS.map((g, i) => ({ g, i, n: by[i].length, warn: by[i].filter((p) => kick(p)?.kind === 'warn').length }));
        const big = H >= 200, fit = Math.max(1, Math.floor(H / 22));
        if (fit < rowsAll.length && W >= 600 && H >= 40) {
          /* 넓고 낮은 칸 — 다섯 단계를 옆으로(이름 · 값 한 줄 + 막대) */
          body.replaceChildren(h('ol.ld-hcol', { 'aria-label': '프로젝트 단계' }, ...rowsAll.map((r) => h('li', { class: r.n ? '' : 'is-zero' },
            h('a', { href: stageListHref(r.g.key), 'aria-label': `${r.g.label} ${r.n}개` }, h('span.ld-hc-l', {}, h('span', { text: r.g.label, title: r.g.label }), h('em.num', { text: nf(r.n) })),
              h('i.ld-hb-t', { 'aria-hidden': 'true' }, h('b', { style: `width:${pctW(r.n, max)}` })))))));
          return;
        }
        let show = rowsAll, rest = null;
        if (fit < rowsAll.length) {
          const pri = rowsAll.filter((r) => r.n).concat(rowsAll.filter((r) => !r.n));
          const keep = new Set(pri.slice(0, Math.max(1, fit - 1)).map((r) => r.i));
          show = rowsAll.filter((r) => keep.has(r.i));
          const hid = rowsAll.filter((r) => !keep.has(r.i)), hn = hid.reduce((s, r) => s + r.n, 0);
          rest = `그 밖 ${hid.length}단계${hn ? ` · ${hn}개` : ''}`;
        }
        body.replaceChildren(h('ol.ld-hbs', { 'aria-label': '프로젝트 단계', class: [big ? 'is-big' : '', W < 300 ? 'is-narrow' : W >= 520 ? 'is-wide' : ''].filter(Boolean).join(' ') },
          ...show.map((r) => hbar({ label: r.g.label, v: r.n, max, href: stageListHref(r.g.key),
            extra: r.warn && W >= 420 ? h('span.ld-hb-w', { text: `남은 일 ${r.warn}` }) : null })),
          rest ? h('li.ld-hb-rest', { text: rest }) : null));
        return;
      }
      /* 크기별 — 작으면 3×2 작은 숫자 · 보통은 3×2 큰 숫자 · 넓으면(620px 이상) 여섯 단계 한 줄 */
      const row = ctx.px.w >= 620, big = ctx.size !== 's' && (row ? 1 : 2) * 84 <= bodyH(ctx);
      const ol = h('ol.ld-pf', { 'aria-label': '프로젝트 단계', class: [row ? 'is-row' : '', big ? 'is-big' : '', ctx.size === 's' ? 'is-s' : ''].filter(Boolean).join(' ') }, ...GROUPS.map((g, i) => {
        const n = by[i].length, warn = by[i].filter((p) => kick(p)?.kind === 'warn').length;
        return h('li', { dataset: { n: String(n), key: g.key } },
          h('a', { href: stageListHref(g.key), 'aria-label': `${g.label} ${n}개${warn ? ` · 남은 일 있는 ${warn}` : ''}` },
            num('b.num', n), h('span', { text: g.label }), warn && ctx.size !== 's' ? h('em', { text: `남은 일 ${warn}` }) : null));
      }));
      body.replaceChildren(ol);
      countUp(ol, 'board');
    },
  },
  /* 요청함 — 검토 요청 · 분석 요청 · 보낸 요청(왼쪽 메뉴 '요청함' 숫자와 같은 한 곳) */
  inbox: {
    title: '요청함', min: [3, 2], def: [3, 4], more: { text: '전체', href: STAFF_HREF.inbox },
    views: [{ id: 'numbers', label: '숫자' }, { id: 'list', label: '목록' }], styles: NUM_STYLES,
    async render(body, ctx) {
      ctx.sub('기관의 요청과 내가 보낸 요청');
      wait(body);
      const c = await requestCounts().catch(() => null);
      if (!c || c.total === null) { fail(body, () => { wait(body); requestCounts({ force: true }); ctx.refresh(); }); return; }
      const isNone = !c.review && !c.request && !c.approval;
      const rows = [
        ...(c.requests || []).map((r) => ({ t: r.title || '분석 요청', k: '분석 요청', at: r.at, href: STAFF_HREF.inbox + '#requests' })),
        ...(c.approvals || []).map((a) => ({ t: a.title || a.kind_label || '승인 요청', k: '보낸 요청', at: a.at, href: STAFF_HREF.inbox + '#approvals' })),
      ].sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
      const list = (n) => h('ul.ld-rows', {}, ...rows.slice(0, n).map((r) => h('li', {}, h('a', { href: r.href },
        h('b', { text: r.t }), h('span.ld-k', { text: r.k }), h('small.num', { text: when(r.at) })))));
      if (ctx.view === 'list') {
        if (!rows.length) { none(body, isNone ? '지금은 기다리는 요청이 없습니다' : `검토 요청 ${c.review || 0}건은 요청함에서 봅니다`); return; }
        body.replaceChildren(list(rows.length));
        return;
      }
      /* 크기별(11-07 A′) — 낮은 칸은 숫자 · 이름 한 줄 · 보통은 숫자 + 막대 · 남는 높이에 한 줄 · 더 남으면 최근 요청 목록(들어가는 만큼) */
      const cmax = Math.max(c.review || 0, c.request || 0, c.approval || 0);
      const md = cellsMode(ctx), H = bodyH(ctx);
      const short = md.cls === 'is-xs' && bodyW(ctx) / 3 < 120;          // 좁고 낮은 칸 — '요청'을 빼고 짧게(마우스를 올리면 전체)
      const cell = (v, label, hash) => h('a.ld-cell', { href: STAFF_HREF.inbox + hash, class: v ? '' : 'is-zero', 'aria-label': `${label} ${v ?? '—'}건` },
        v === null ? h('b.num', { text: '—' }) : num('b.num', v), h('span', { text: short ? label.replace(' 요청', '') : label, title: label }), v === null || !md.bars ? null : cellBar(ctx, v, cmax));
      const cells = h('div.ld-cells', { class: [md.cls, md.bars ? 'has-bars' : ''].filter(Boolean).join(' ') }, cell(c.review, '검토 요청', ''), cell(c.request, '분석 요청', '#requests'), cell(c.approval, '보낸 요청', '#approvals'));
      const sumOn = H >= md.hgt + 46, fit = Math.floor((H - md.hgt - 46 - 22) / 29);
      body.replaceChildren(h('div.ld-inbox-b', { class: md.cls }, cells,
        sumOn ? h('p.ld-inbox-s', { text: isNone ? '지금은 기다리는 요청이 없습니다' : '왼쪽 메뉴 요청함 숫자와 같습니다' }) : null,
        sumOn && rows.length && fit >= 2 ? list(fit) : null));
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
        if (!ps.length) { none(body, '내가 프로젝트장인 프로젝트가 없습니다'); return; }
        body.replaceChildren(h('ol.ld-pb.ld-pb--store', {}, ...ps.map((p) => h('li', {}, h('span', { text: p.name, title: p.name }),
          h('i', {}, h('b', { style: `width:${Math.max(1, Math.round((p.bytes || 0) / max * 100))}%` })), h('em.num', { text: size(p.bytes) })))));
        return;
      }
      /* 11-07 A′ — 고리(할당 대비) | 프로젝트별 막대(들어가는 만큼) · 요약 한 줄 · 증량 신청 · 크면 + 할당 변경 기록. 낮은 칸은 % · 한 줄 · 막대(모두 GET /me/storage 한 출처 · 지어낸 수 0) */
      const pw = pctWord(used, q);
      const H = bodyH(ctx), Wd = bodyW(ctx);
      const pend = (j.requests || []).find((r) => r.state === 'pending');
      const act = h('p.ld-store-a');
      if (st.warn) act.append(h('span.ld-warn', { text: `할당의 ${ev(st.pct)}%를 썼습니다` }));
      if (pend) act.append(h('span.ld-store-p', { text: `증량 신청 중 ${gb(ev(pend.want_gb))} · LX 관리자 확인 전` }));
      else if (has) act.append(h('button.k-me-ask', { type: 'button', text: '용량 증량 신청', onclick: () => openMe({ ask: true, onStorage: again, onSaved: again }) }));
      const sumTxt = has ? `${size(used)} 사용 · 할당 ${gb(q)}` : `${size(used)} 사용 · 할당 없음`;
      const col = Wd < 380 && H >= 230;                                  // 좁고 높은 칸 — 고리 위 · 막대 아래(옆에 두면 이름이 잘린다)
      const R = Math.round(col ? Math.min(120, Wd * 0.5, H * 0.42) : Math.min(132, H - 4, Wd * 0.34));
      const pctEl = pw !== null ? h('b.ld-st-pct.num', {}, num('span', Number(pw)), h('small', { text: '%' })) : h('b.ld-st-pct.num', { text: size(used) });
      if (R < 72) {
        /* 낮은 칸 — 큰 % · 쓴 양 한 줄 · 막대 */
        const bar = pw !== null ? h('div.k-me-bar.ld-bar-q', { class: st.warn ? 'is-warn' : '', role: 'img', 'aria-label': `할당의 ${pw}% 사용` }, h('i', { style: `width:${Math.min(100, Math.max(used > 0 ? 1 : 0, Number(pw)))}%` })) : null;
        put(body, h('div.ld-st-xs', {}, h('div.ld-st-xs-r', {}, pctEl, h('span', { text: sumTxt, title: sumTxt })), H >= 52 ? bar : null));
        countUp(body, 'store'); return;
      }
      const rg = h('div.ld-st-ring', { class: R >= 108 ? 'is-l' : '', style: `width:${R}px;height:${R}px`, role: 'img', 'aria-label': pw !== null ? `할당의 ${pw}% 사용` : sumTxt }, ring(pw ?? 0, R, st.warn), pctEl);
      if (pw === null) rg.classList.add('is-none');
      const right = h('div.ld-st-r');
      const rw = col ? Wd : Wd - R - 20;
      const histOn = ctx.size === 'l' && (j.requests || []).length;
      const actH = act.childNodes.length ? 30 : 0;
      let rightH = 0;
      if (rw >= 150) {
        const max = Math.max(1, ...ps.map((p) => p.bytes || 0));
        const room = (col ? H - R - 16 : Math.min(R + 40, H)) - 22 - actH - 6;
        const nb = Math.max(0, Math.min(ps.length, Math.floor(room / 26)));
        if (nb) right.append(h('ol.ld-hbs.ld-hbs--store', { class: rw < 260 ? 'is-narrow' : '' }, ...ps.slice(0, nb).map((p) => hbar({ label: p.name, v: p.bytes || 0, max, text: size(p.bytes) }))));
        right.append(h('p.ld-st-sum', { text: `${sumTxt}${ps.length > nb && nb ? ` · 외 ${ps.length - nb}개` : ''}`, title: sumTxt }));
        if (actH) right.append(act);
        rightH = nb * 26 + 22 + actH;
      } else {
        right.append(h('p.ld-st-sum.is-col', { text: sumTxt }));
        if (actH && H >= 96) right.append(act);
        rightH = 66 + actH;
      }
      const wrap = h('div.ld-st', { class: col ? 'is-col' : rw < 150 ? 'is-thin' : '' }, rg, right);
      if (!histOn) { put(body, wrap); countUp(body, 'store'); return; }
      /* 크게 — 아래에 할당 변경 기록(승인 · 거절 · 대기 · 들어가는 만큼) */
      const STATE_KO = { pending: '확인 전', approved: '승인', rejected: '거절' };
      const hn = Math.max(0, Math.min(3, Math.floor((H - (col ? R + 16 + rightH : Math.max(R, rightH)) - 16 - 30) / 29)));
      put(body, h('div.ld-store-l', {}, wrap, hn ? h('div.ld-store-sec', {}, h('p.ld-store-h', { text: '할당 변경 기록' }), h('ul.ld-rows', {}, ...(j.requests || []).slice(0, hn).map((r) => h('li', {}, h('span.ld-store-hr', {},
        h('b', { text: `${gb(ev(r.from_gb))} → ${gb(ev(r.want_gb))}` }), h('span.ld-k', { text: STATE_KO[r.state] || r.state }), h('small.num', { text: ymdDot(r.decided_at || r.at) })))))) : null));
      countUp(body, 'store'); return;
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
      if (!items.length) { none(body, '진행 중인 프로젝트가 없습니다'); return; }
      const t = (p) => +new Date(p.last_at || p.updated_at || 0) || 0;
      const sorted = items.slice().sort((a, b) => t(b) - t(a));
      /* 크기별(11-07 A′) — 낮은 칸(카드가 안 들어감)은 목록(+ 넓으면 다섯 칸 막대) · 보통 높이는 작은 카드(그림 · 이름 · 한 줄 · 다섯 칸 막대) · 아주 높으면 프로젝트 목록과 같은 카드 */
      const H = bodyH(ctx), Wd = bodyW(ctx);
      const cols = Math.max(1, Math.min(6, Math.floor((Wd + 16) / (236 + 16))));
      if (ctx.view === 'list' || H < 170) {
        const segOn = Wd >= 520;
        body.replaceChildren(h('ul.ld-rows.ld-rows--proj', { class: segOn ? 'has-seg' : '' }, ...sorted.map((p) => h('li', {}, h('a', { href: projectHref(p.id) },
          h('b', { text: p.name, title: p.name }), h('span.ld-k', { text: GROUPS[groupOf(p)].label }), segOn ? (p.state === 'archived' ? h('span') : seg4El(p)) : null,
          kick(p)?.kind === 'warn' && Wd >= 420 ? h('em', { text: kick(p).text }) : h('span'), h('small', { text: ago(p.last_at || p.updated_at) }))))));
        return;
      }
      const full = H >= 410;
      const rows = full ? (H >= 2 * 410 + 16 ? 2 : 1) : Math.max(1, Math.floor((H + 16) / (220 + 16)));
      const top = sorted.slice(0, cols * rows);
      ctx.sub(`마지막 활동 순 · 전체 ${items.length} · 막대 = 다섯 단계 중 지금`);
      const my = (body._n = (body._n || 0) + 1);
      const d = await dk;
      if (body._n !== my) return;
      const deckBy = new Map((d?.items || []).map((c) => [c.id, c]));
      const picH = full ? null : Math.max(56, Math.min(180, Math.floor((H - (rows - 1) * 16) / rows) - 114));
      const grid = h('div.la-acg.lxp-grid-c.ld-rgrid', { class: full ? '' : 'is-mini', style: `grid-template-columns:repeat(${cols},minmax(0,1fr));grid-template-rows:repeat(${rows},minmax(0,1fr))${picH ? `;--ih:${picH}px` : ''}`, dataset: { n: String(top.length) } },
        ...top.map((p) => projCard(p, deckBy, full ? { compact: true } : { mini: true })));
      body.replaceChildren(grid);
    },
  },
  /* 전국 분석 — 전국 작업기가 끝낸 읍면동(GET /national/recent · 진행 장부 한 출처) · 오늘 끝난 수 · 방금 끝난 목록 */
  national: {
    title: '전국 분석', min: [3, 2], def: [4, 3], more: { text: 'XI맵', href: STAFF_HREF.ximap }, views: [{ id: 'numbers', label: '숫자' }, { id: 'list', label: '목록' }], styles: NUM_STYLES,
    async render(body, ctx) {
      wait(body);
      let j;
      try { j = await once('national', async () => ((await hasRoute('/national/recent')) ? api('/national/recent?n=12') : null)); } catch { fail(body, () => { drop('national'); ctx.refresh(); }); return; }
      if (!j) { none(body, '전국 분석 기록이 없습니다'); return; }
      ctx.sub(j.year ? `${j.year}년 영상 · 오늘` : '오늘');
      const items = j.items || [];
      const list = (n) => h('ul.ld-rows', {}, ...items.slice(0, n).map((x) => h('li', {}, h('a', { href: STAFF_HREF.ximap },
        h('b', { text: [x.sgg, x.name].filter(Boolean).join(' ') }), h('span.ld-k', { text: x.asset_name }), h('small.num', { text: when(x.at) })))));
      if (ctx.view === 'list') {
        if (!items.length) { none(body, '끝난 읍면동이 없습니다'); return; }
        body.replaceChildren(list(items.length));
        return;
      }
      /* 크기별(11-07 A′) — 낮은 칸은 숫자 · 이름 한 줄 · 보통은 숫자 + 막대 · 남는 높이에 방금 끝난 곳 · 더 남으면 목록 */
      const n1 = Number(ev(j.today?.cells)) || 0, n2 = Number(ev(j.today?.n)) || 0, md = cellsMode(ctx), H = bodyH(ctx);
      const cells = h('div.ld-cells.ld-cells--2', { class: [md.cls, md.bars ? 'has-bars' : ''].filter(Boolean).join(' ') },
        h('div.ld-cell.ld-cell--ro', { class: n1 ? '' : 'is-zero' }, num('b.num', n1), h('span', { text: md.cls === 'is-xs' && bodyW(ctx) / 2 < 170 ? '읍면동' : '오늘 끝난 읍면동', title: '오늘 끝난 읍면동' }), md.bars ? cellBar(ctx, n1, Math.max(n1, n2)) : null),
        h('div.ld-cell.ld-cell--ro', { class: n2 ? '' : 'is-zero' }, num('b.num', n2), h('span', { text: md.cls === 'is-xs' && bodyW(ctx) / 2 < 170 ? 'AI 결과' : '오늘 AI 분석 결과', title: '오늘 AI 분석 결과' }), md.bars ? cellBar(ctx, n2, Math.max(n1, n2)) : null));
      const last = items[0], sumOn = H >= md.hgt + 46, fit = Math.floor((H - md.hgt - 46 - 22) / 29);
      body.replaceChildren(h('div.ld-inbox-b', { class: md.cls }, cells,
        sumOn ? h('p.ld-inbox-s', { text: last ? `방금 끝난 곳 · ${[last.sgg, last.name].filter(Boolean).join(' ')} · ${when(last.at)}` : '오늘 끝난 읍면동이 없습니다' }) : null,
        sumOn && items.length && fit >= 2 ? list(fit) : null));
      countUp(cells, 'national');
    },
  },
  /* 지도 서비스 — 내 분석 결과 묶음(GET /me/analyses · 지도 서비스 화면과 같은 출처) */
  mapsvc: {
    title: '지도 서비스', min: [3, 2], def: [4, 3], more: { text: '지도 서비스', href: STAFF_HREF.mapsvc }, views: [{ id: 'numbers', label: '숫자' }, { id: 'list', label: '목록' }], styles: NUM_STYLES,
    async render(body, ctx) {
      wait(body);
      let j;
      try { j = await once('analyses', () => api('/me/analyses')); } catch { fail(body, () => { drop('analyses'); ctx.refresh(); }); return; }
      const groups = j.groups || [], running = j.running || [];
      ctx.sub(groups.length ? `서비스 · 프로젝트 ${groups.length}개` : null);
      const rows = groups.flatMap((g) => g.items.slice(0, 3).map((x) => ({ g, x }))).sort((a, b) => String(b.x.finished_at || '').localeCompare(String(a.x.finished_at || ''))).slice(0, 30);
      const list = (n) => h('ul.ld-rows', {}, ...rows.slice(0, n).map(({ g, x }) => h('li', {}, h('a', { href: STAFF_HREF.mapsvc + '?job=' + encodeURIComponent(x.job) },
        h('b', { text: g.name }), h('span.ld-k', { text: [x.region, x.imagery?.word].filter((s) => s && s !== '—').join(' · ') }), h('small.num', { text: when(x.finished_at) })))));
      if (ctx.view === 'list') {
        if (!rows.length) { none(body, '분석 결과가 없습니다'); return; }
        body.replaceChildren(list(rows.length));
        return;
      }
      const t1 = Number(j.total) || 0, t2 = running.length, H = bodyH(ctx), Wd = bodyW(ctx);
      const last = groups.map((g) => ({ g, x: g.items[0] })).filter((r) => r.x).sort((a, b) => String(b.x.finished_at || '').localeCompare(String(a.x.finished_at || '')))[0];
      const lastTxt = last ? `마지막 분석 · ${last.g.name} · ${when(last.x.finished_at)}` : '아직 분석 결과가 없습니다';
      if (ctx.style === 'num') {
        /* 숫자만 — 분석 결과 · 분석 중 두 칸(예전 모양) */
        const md = cellsMode(ctx);
        const cells = h('div.ld-cells.ld-cells--2', { class: md.cls },
          h('a.ld-cell', { href: STAFF_HREF.mapsvc, class: t1 ? '' : 'is-zero' }, num('b.num', t1), h('span', { text: '분석 결과' })),
          h('div.ld-cell.ld-cell--ro', { class: t2 ? 'is-run' : 'is-zero' }, num('b.num', t2), h('span', { text: '분석 중' })));
        const sumOn = H >= md.hgt + 46, fit = Math.floor((H - md.hgt - 46 - 22) / 29);
        body.replaceChildren(h('div.ld-inbox-b', { class: md.cls }, cells, sumOn ? h('p.ld-inbox-s', { text: lastTxt }) : null, sumOn && rows.length && fit >= 2 ? list(fit) : null));
        countUp(cells, 'mapsvc');
        return;
      }
      /* 11-07 A′ — 분석 결과 수 + 날짜별 막대(끝난 날 · 칸 폭만큼 지난 날들 · 모두 GET /me/analyses 한 출처).
         낮은 칸 = 숫자 | 막대 한 줄 · 보통 = 숫자 위 · 막대 · 날짜 · 높으면 + 마지막 분석 한 줄 + 목록 */
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const xs = H < 96;
      const thin = xs && Wd < 320;                                       // 좁고 낮은 칸 — 숫자 | 막대(이름은 숨김 · 읽기 프로그램엔 그대로)
      const chartW = xs ? Wd - (thin ? 64 : 132) : Wd;
      const D = Math.max(7, Math.min(31, Math.floor((chartW + 4) / 14)));
      const byDay = new Map();
      for (const g of groups) for (const x of g.items) { const d = new Date(x.finished_at || ''); if (Number.isNaN(+d)) continue; const k = isoDay(d); byDay.set(k, (byDay.get(k) || 0) + 1); }
      const counts = Array.from({ length: D }, (_, i) => { const d = addDays(today, i - D + 1); return { day: d, n: byDay.get(isoDay(d)) || 0 }; });
      const inD = counts.reduce((s, x) => s + x.n, 0);
      const head = h('a.ld-ms-h', { href: STAFF_HREF.mapsvc, 'aria-label': `분석 결과 ${t1}개` }, num('b.num', t1), h('span', {}, '분석 결과', t2 ? h('em', { text: ` · 분석 중 ${t2}` }) : null));
      const chart = dayBars(counts, { axis: !xs, label: `지난 ${D}일 끝난 분석 ${inD}건` });
      if (xs) { body.replaceChildren(h('div.ld-ms.is-xs', { class: thin ? 'is-thin' : '' }, head, chart)); countUp(head, 'mapsvc'); return; }
      const sumOn = H >= 96 + 100 + 30, fit = Math.floor((H - 96 - 100 - 30 - 10) / 29);
      const chartH = sumOn ? 100 : H - 44 - 8;
      chart.style.setProperty('--dbh', `${Math.max(28, Math.min(160, chartH - 22))}px`);
      body.replaceChildren(h('div.ld-ms', {}, h('div.ld-ms-top', {}, head, h('small.ld-ms-d', { text: `지난 ${D}일 · ${inD}건` })), chart,
        sumOn ? h('p.ld-inbox-s', { text: lastTxt }) : null, sumOn && rows.length && fit >= 2 ? list(fit) : null));
      countUp(head, 'mapsvc');
    },
  },
};

/* 수정 중 아주 낮은 칸(머리 칩 줄로 몸통이 22px 아래) — 내용을 그리지 않는다(잘린 글자 0 · 11-07) */
for (const d of Object.values(WIDGETS)) { const r = d.render; d.render = (body, ctx) => { if (ctx.editing && bodyH(ctx) < 22) { body.replaceChildren(); return null; } return r.call(d, body, ctx); }; }

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
  const hol = holName(d);
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
    { const w = h('div.ld-wait'); box.replaceChildren(w); K.empty(w, { kind: 'loading', compact: true }); }   // 첫인상-3: 칸마다 '불러오는 중' 0 — 가운데 하나
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
    box.replaceChildren(...(hol ? [h('p.ld-cal-hol', { text: hol })] : []), list, form());
    box.querySelector('input')?.focus();
  }
  draw();
  return m;
}

async function calendar(body, ctx) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  await holLoad([today, CAL.anchor, addDays(today, 40), addDays(CAL.anchor, 45), addDays(CAL.anchor, -10)].map((d) => d.getFullYear()));
  /* 크기별(실제 px) — 작으면 오늘 + 다음 일 셋 · 보통은 주 · 크면 월. 직접 고른 보기 방식도 들어가지 않으면 한 단계 작게(월→주→다음 일) */
  const bh = bodyH(ctx) - 34;                                           // 머리줄(‹ 달 › · 오늘 · 일정 적기)을 뺀 높이
  const fitsMonth = bh >= 5 * 40 + 20, fitsWeek = ctx.px.w / 7 >= 96 ? bh >= 96 : bh >= 200;   // 주 = 일곱 열(넓을 때) · 일곱 줄(좁을 때 — 줄마다 28px)
  /* 11-07 A′: 자동은 달이 들어가면 달(시안 그대로 — 좁은 칸은 점) · 아니면 주 · 다음 일 */
  let mode = ctx.view === 'auto' || !ctx.view ? (fitsMonth && ctx.px.w >= 250 ? 'month' : ctx.size === 's' ? 'list' : 'week') : ctx.view;
  if (mode === 'month' && !fitsMonth) mode = 'week';
  if (mode === 'week' && !fitsWeek) mode = 'list';
  const small = ctx.size === 's';
  const redraw = () => ctx.refresh();
  /* 머리 — ‹ 2026.10 › · 오늘 · 일정 적기 */
  const label = h('b.ld-cal-l.num');
  const nav = (n) => { const a = CAL.anchor; CAL.anchor = mode === 'month' ? new Date(a.getFullYear(), a.getMonth() + n, 1) : addDays(a, 7 * n); redraw(); };
  /* 좁은 칸 — 오늘이 이미 보이면 '오늘' 단추를 빼서 머리줄이 넘치지 않게(11-07) */
  const inView = () => { const A = CAL.anchor; if (mode === 'month') return A.getFullYear() === today.getFullYear() && A.getMonth() === today.getMonth(); const f = addDays(A, -A.getDay()); f.setHours(0, 0, 0, 0); return today >= f && today <= addDays(f, 6); };
  const head = h('div.ld-cal-h', {},
    mode === 'list' ? null : h('button.ld-cal-n', { type: 'button', 'aria-label': mode === 'month' ? '지난달' : '지난주', html: '&lsaquo;', onclick: () => nav(-1) }),
    label,
    mode === 'list' ? null : h('button.ld-cal-n', { type: 'button', 'aria-label': mode === 'month' ? '다음달' : '다음주', html: '&rsaquo;', onclick: () => nav(1) }),
    h('span.sp'),
    mode === 'list' || (ctx.px.w < 330 && inView()) ? null : h('button.ld-cal-t', { type: 'button', text: '오늘', onclick: () => { CAL.anchor = new Date(); redraw(); } }),
    h('button.ld-cal-t', { type: 'button', text: '일정 적기', onclick: () => dayModal(today, redraw) }));
  const grid = h('div.ld-cal-g');
  body.replaceChildren(h('div.ld-cal', { dataset: { mode } }, head, grid));
  const dot = (it) => h('i.ld-cal-dot', { class: it.kind === 'mine' ? 'is-mine' : '', title: it.title });
  const chip = (it) => h('button.ld-cal-c', { type: 'button', class: it.kind === 'mine' ? 'is-mine' : '', title: `${it.time ? it.time + ' ' : ''}${it.title}`,
    onclick: (e) => { e.stopPropagation(); dayModal(dayOf(it.day), redraw); } }, it.time ? h('span.num', { text: it.time }) : null, it.title);

  if (mode === 'list') {
    label.textContent = `${today.getMonth() + 1}월 ${today.getDate()}일 (${DOW[today.getDay()]})`;
    const to = addDays(today, 30);
    { const w = h('div.ld-wait'); grid.replaceChildren(w); K.empty(w, { kind: 'loading', compact: true }); }
    let a;
    try { a = await agenda(today, to); } catch { fail(grid, redraw); return; }
    const days = [...a.by.keys()].filter((k) => k >= isoDay(today)).sort();
    if (!days.length) { if (bh < 24) { label.textContent += ' · 앞으로 30일 일 없음'; label.classList.add('is-one'); grid.replaceChildren(); return; } grid.replaceChildren(h('p.ld-foot-none', { text: '앞으로 30일 안에 일이 없습니다' })); return; }
    if (bh < 24) {                                                      // 아주 낮은 칸 — 머리줄에 다음 일 하나만
      const k0 = days[0], it0 = (a.by.get(k0) || [])[0], d0 = dayOf(k0), nAll = days.reduce((s, k) => s + (a.by.get(k) || []).length, 0);
      label.textContent = `${sameDay(d0, today) ? '오늘' : `${d0.getMonth() + 1}.${d0.getDate()}`} ${it0.time ? it0.time + ' ' : ''}${it0.title}`;
      label.title = label.textContent; label.classList.add('is-one');
      grid.replaceChildren();
      if (nAll > 1) label.after(h('small.ld-cal-more', { text: `외 ${nAll - 1}` }));
      return;
    }
    if (small) {                                                        // 작은 칸 — 오늘 + 다음 일 셋(한 줄씩 · 날짜 · 제목)
      const flat = days.flatMap((k) => (a.by.get(k) || []).map((it) => ({ k, it })));
      const n = Math.max(1, Math.min(3, Math.floor((bh - 4) / 28)));
      const show = flat.slice(0, n);
      put(grid, h('ul.ld-cal-next', {}, ...show.map(({ k, it }) => { const d = dayOf(k); return h('li', { class: [it.kind === 'mine' ? 'is-mine' : '', sameDay(d, today) ? 'is-today' : '', dowCls(d)].filter(Boolean).join(' ') },
        h('button.ld-cal-ld', { type: 'button', onclick: () => dayModal(d, redraw) }, h('b.num', { text: sameDay(d, today) ? '오늘' : `${d.getMonth() + 1}.${d.getDate()}` })),
        h('span.ld-cal-nt', { title: it.title }, it.time ? h('span.num', { text: it.time + ' ' }) : null, it.title)); })),
      flat.length > show.length ? h('p.ld-cal-more.ld-cal-rest', { text: `그 밖 ${flat.length - show.length}건` }) : null);
      return;
    }
    grid.replaceChildren(h('ul.ld-cal-list', {}, ...days.map((k) => { const d = dayOf(k); return h('li', { class: [sameDay(d, today) ? 'is-today' : '', dowCls(d)].filter(Boolean).join(' ') },
      h('button.ld-cal-ld', { type: 'button', onclick: () => dayModal(d, redraw) }, h('b.num', { text: `${d.getMonth() + 1}.${d.getDate()}` }), h('span', { text: sameDay(d, today) ? '오늘' : DOW[d.getDay()] })),
      h('div.ld-cal-li', {}, ...(a.by.get(k) || []).map(chip))); })));
    return;
  }
  /* 주 — 좁은 칸은 일곱 날을 세로 줄로(칸 폭이 좁아 글 칩이 못 들어갈 때) */
  if (mode === 'week' && ctx.px.w / 7 < 96) {
    const first = addDays(CAL.anchor, -CAL.anchor.getDay()); first.setHours(0, 0, 0, 0);
    const l = addDays(first, 6); label.textContent = `${first.getMonth() + 1}.${first.getDate()} – ${l.getMonth() + 1}.${l.getDate()}`;
    grid.className = 'ld-cal-g is-weekrows';
    { const w = h('div.ld-wait'); grid.replaceChildren(w); K.empty(w, { kind: 'loading', compact: true }); }
    let a;
    try { a = await agenda(first, l); } catch { fail(grid, redraw); return; }
    grid.replaceChildren(h('ul.ld-cal-list', {}, ...Array.from({ length: 7 }, (_, i) => { const d = addDays(first, i), items = a.by.get(isoDay(d)) || [];
      return h('li', { class: [sameDay(d, today) ? 'is-today' : '', dowCls(d)].filter(Boolean).join(' ') },
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
    const c = h('div.ld-cal-d', { class: [out ? 'is-out' : '', sameDay(d, today) ? 'is-today' : '', dowCls(d)].filter(Boolean).join(' '), dataset: { day: k }, role: 'button', tabindex: '0', title: holName(d) || undefined, 'aria-label': `${d.getMonth() + 1}월 ${d.getDate()}일 (${DOW[d.getDay()]})${holName(d) ? ' ' + holName(d) : ''}`,
      onclick: () => dayModal(d, redraw), onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); dayModal(d, redraw); } } },
      h('span.ld-cal-dn.num', { text: mode === 'week' ? `${d.getDate()}` : (d.getDate() === 1 && i > 0 ? `${d.getMonth() + 1}.1` : `${d.getDate()}`) }), h('div.ld-cal-ev'));
    cells.push(c);
  }
  grid.append(h('div.ld-cal-cells', {}, ...cells));
  /* 오늘 한눈에(11-07 A′) — 달 보기에서 이 달이 오늘을 품고 · 칸 아래에 남는 높이가 있으면 오늘 일 몇 줄 */
  const extra = bh - 20 - weeks * 42 - 6;
  const todayLines = mode === 'month' && first <= today && today <= last && extra >= 76 ? Math.min(4, Math.floor((extra - 34) / 24)) : 0;
  const tbox = todayLines ? h('div.ld-cal-today') : null;
  if (tbox) body.querySelector('.ld-cal').append(tbox);
  let a;
  try { a = await agenda(first, last); } catch { grid.append(h('p.ld-foot-none.ld-cal-err', { text: '일정을 불러오지 못했습니다' })); return; }
  if (a.failed === 'plat') ctx.sub('플랫폼 일은 불러오지 못했습니다'); else ctx.sub(null);
  if (tbox) {
    const ti = a.by.get(isoDay(today)) || [];
    const show = ti.slice(0, ti.length > todayLines ? todayLines - 1 : todayLines);
    tbox.replaceChildren(h('button.ld-cal-tt', { type: 'button', onclick: () => dayModal(today, redraw) }, `오늘 ${today.getMonth() + 1}.${today.getDate()} (${DOW[today.getDay()]})`),
      ti.length ? h('ul', {}, ...show.map((it) => h('li', { class: it.kind === 'mine' ? 'is-mine' : '', title: it.title }, h('span.num', { text: it.time || '' }), h('span.ld-cal-tx', { text: it.title }))),
        ti.length > show.length ? h('li.is-rest', {}, h('span', { text: `외 ${ti.length - show.length}` })) : null) : h('p.ld-foot-none', { text: '오늘 일이 없습니다' }));
  }
  requestAnimationFrame(() => {
    const wrap = grid.querySelector('.ld-cal-cells'), tc = cells.find((c) => c.classList.contains('is-today'));
    if (wrap && tc && wrap.scrollHeight > wrap.clientHeight + 2) wrap.scrollTop = Math.max(0, tc.offsetTop - (wrap.clientHeight - tc.offsetHeight) / 2);
    const cellH = cells[0]?.clientHeight || 0;
    const fit = narrow ? 0 : Math.max(1, Math.floor((cellH - 26) / 22));
    for (const c of cells) {
      const items = a.by.get(c.dataset.day) || [];
      const evb = c.querySelector('.ld-cal-ev');
      if (!items.length) continue;
      if (narrow) { const cw = c.clientWidth || 60, nd = cw < 44 ? 1 : cw < 58 ? 2 : 3; evb.append(...items.slice(0, nd).map(dot)); if (items.length > nd && cw >= 34) evb.append(h('small.ld-cal-more.num', { text: `+${items.length - nd}` })); continue; }
      const show = items.slice(0, Math.max(1, items.length > fit ? fit - 1 : fit));
      evb.append(...show.map(chip)); if (items.length > show.length) evb.append(h('small.ld-cal-more', { text: `외 ${items.length - show.length}` }));
    }
  });
}

/* ═══════════════ 격자 ═══════════════ */
/* 처음 모양 — 1440×900 첫 뷰 한 화면 안(스크롤 0 · 첫인상-5 · 원칙 194 · 216). 열 줄(60 × 10 + 사이 12 × 9 = 708) */
/* 11-07 A′(PM "배치한다") — '지도 서비스'(분석 결과 수 · 날짜별 막대)를 처음 모양에. 달력 7줄 → 5줄(달 보기는 그대로 들어감) · 그 아래 지도 서비스 2줄.
   이미 저장한 직원의 배치는 그대로(처음 모양 · '처음 모양으로'에만) */
const DEFAULTS = [
  { id: 'notice', x: 0, y: 0, w: 5, h: 3, view: 'list' }, { id: 'memo', x: 5, y: 0, w: 3, h: 3 }, { id: 'store', x: 8, y: 0, w: 4, h: 3, view: 'numbers' },
  { id: 'board', x: 0, y: 3, w: 5, h: 3, view: 'chart' }, { id: 'inbox', x: 5, y: 3, w: 3, h: 3, view: 'numbers' }, { id: 'calendar', x: 8, y: 3, w: 4, h: 5, view: 'auto' },
  { id: 'recent', x: 0, y: 6, w: 8, h: 4, view: 'cards' }, { id: 'mapsvc', x: 8, y: 8, w: 4, h: 2, view: 'numbers' },
];
/* 고를 수 있는 모양(10-18 원칙 285 "공지사항 · 달력 · 저장 용량을 한 줄에") — '모양 고르기'에서 */
const PRESETS = [
  { id: 'default', label: '처음 모양', items: DEFAULTS },
  { id: 'row3', label: '공지 · 달력 · 저장 용량 한 줄', items: [
    { id: 'notice', x: 0, y: 0, w: 4, h: 4, view: 'list' }, { id: 'calendar', x: 4, y: 0, w: 4, h: 4, view: 'auto' }, { id: 'store', x: 8, y: 0, w: 4, h: 4, view: 'numbers' },
    { id: 'board', x: 0, y: 4, w: 5, h: 4, view: 'chart' }, { id: 'inbox', x: 5, y: 4, w: 3, h: 4, view: 'numbers' }, { id: 'memo', x: 8, y: 4, w: 4, h: 4 },
    { id: 'recent', x: 0, y: 8, w: 12, h: 7, view: 'cards' },
  ] },
  { id: 'wide', label: '달력 크게', items: [
    { id: 'notice', x: 0, y: 0, w: 4, h: 3, view: 'list' }, { id: 'store', x: 4, y: 0, w: 4, h: 3, view: 'numbers' }, { id: 'inbox', x: 8, y: 0, w: 4, h: 3, view: 'numbers' },
    { id: 'calendar', x: 0, y: 3, w: 8, h: 8, view: 'auto' }, { id: 'board', x: 8, y: 3, w: 4, h: 4, view: 'chart' }, { id: 'memo', x: 8, y: 7, w: 4, h: 4 },
    { id: 'recent', x: 0, y: 11, w: 12, h: 7, view: 'cards' },
  ] },
];
/* 테마(10-18 원칙 287 "똑같은 기능이여도 테마나 디자인을 조금 여러개 해서 선택") — 넷 · 모두 밝은 톤(규칙 3-4) · 수정 중 '테마'에서 손을 올리면 미리 보기 · 사람마다 저장(같은 /me/prefs/dash.lx-console) */
const THEMES = [
  { id: 'basic', label: '기본', desc: '흰 카드 · 선 없음' },
  { id: 'soft', label: '부드러운', desc: '둥근 카드 · 옅게 물든 면' },
  { id: 'sharp', label: '또렷한', desc: '가는 선 · 진한 제목' },
  { id: 'dense', label: '촘촘한', desc: '여백 적게 · 한 칸에 더 많이' },
];
const G = dashgrid(gridHost, { screen: 'lx-console', widgets: WIDGETS, defaults: DEFAULTS, themes: THEMES, cols: 12, rowH: 60, gap: 12 });
bar.append(G.toolbar);

/* e2e 관측(읽기 전용) — 처음 칸들이 그려지면 */
Promise.allSettled([projects(), once('storage', () => api('/me/storage')), requestCounts(), once('notice', () => api('/announcements?limit=12')), once('memos', () => api('/me/memos?limit=50'))])
  .then(() => { window.__lxConsole = { ready: true, grid: G }; document.documentElement.dataset.consoleReady = '1'; });
