/* K9 empty.js — 기다림 · 빈 화면 · 문제 표시. 세 모양뿐이고 그림(드론·위성·항공기 등)은 넣지 않는다(4차 S1 ⓐ · 원칙 42).
   · 기다리는 중  kind 'loading'(제목 · 문장 없이) = 그 칸은 옅은 빈 틀만 · 표시는 화면 가운데 하나(loader.js · 원칙 161 로딩-1).
                  여러 칸이 기다리면 가운데 하나로 합치고, 6초 넘으면 그 아래 '서버 응답이 늦습니다 · 다시 시도'. progress 1 이 오면 도착으로 센다.
                  제목·문장을 따로 준 '~하는 중' 작업 줄은 그 자리 막대 + 한 줄 그대로(오래 걸리는 것이 정상이라 늦음 표시 없음 · slow: true 로 켤 수 있다).
   · 비었을 때    kind 'first' | 'ingest' | 'outside' | '404' = 회백 카드 + 제목 + 문장 1(선택 · ≤ 40자) + 행동 버튼 1(선택).
   · 문제         kind 'error' = 그 자리 한 줄(경고색) + '다시 시도'(기본 = 화면 다시 열기 · onRetry 로 바꾼다).
   empty(el, { kind, title, text, action: { label, href|onClick }, onRetry, progress: 0..1, compact, slow, what })
   → { set({progress, what}), resolve(data), el }   (what = 기다리는 것 한 줄 · 가운데 로딩 글)
   옛 호출의 char 옵션은 받아도 그리지 않는다.
   도착 전과 빈 값 구분(하위 호환 · 선택): empty(el, { kind: 'first', data: undefined }) 처럼 data 를 넘기면
     data === undefined(아직 도착 전) → '불러오는 중' 변형 · 나중에 resolve(data) 가
     빈 값(null · 빈 배열 · 봉투 value null)이면 원래 kind 로, 값이 있으면 빈 상태를 지우고 false 를 돌려준다. */
import { h, isEnvelope } from './util.js';
import { t } from './i18n.js';
import { watch, unwatch } from './loader.js';

export const SLOW_MS = 6000;   // 기다리는 중이 이만큼 길어지면 '서버 응답이 늦습니다' + '다시 시도'
const KIND = {
  first: { title: 'empty.first' },
  ingest: { title: 'empty.ingest' },
  outside: { title: 'empty.outside' },
  loading: { title: 'empty.loading', wait: true },
  error: { title: 'empty.error', err: true },
  404: { title: 'empty.404', home: true },
};
const SLOW = new WeakMap();   // el → 늦음 타이머

/** 빈 값인가 — null · undefined · 빈 배열 · 빈 items · 봉투 value null */
export const isBlank = (d) => d === null || d === undefined || (Array.isArray(d) && !d.length)
  || (isEnvelope(d) && (d.value === null || d.value === undefined)) || (Array.isArray(d?.items) && !d.items.length);

export function empty(el, opts = {}) {
  if ('data' in opts && opts.data === undefined) {
    // 도착 전 — 불러오는 중 변형을 먼저 그리고, resolve 가 오면 원래 kind 로 다시 그린다
    const want = { ...opts }; delete want.data;
    let cur = draw(el, { kind: 'loading', compact: opts.compact, onRetry: opts.onRetry });
    cur.set({ progress: null });
    const resolve = (d) => { if (isBlank(d)) { cur = draw(el, want); return true; } clear(el); return false; };
    return { el, set: (p) => cur.set(p), resolve };
  }
  const r = draw(el, opts);
  return { ...r, resolve: (d) => (isBlank(d) ? true : (clear(el), false)) };
}
function stopSlow(el) { const id = SLOW.get(el); if (id) { clearTimeout(id); SLOW.delete(el); } unwatch(el); }
function clear(el) {
  stopSlow(el);
  el.innerHTML = '';
  el.classList.remove('t-empty', 'k-empty', 'k-empty--sm', 'k-empty--err', 'k-empty--hold');
  el.removeAttribute('role'); el.removeAttribute('aria-busy');
  delete el.dataset.kind; delete el.dataset.slow;
}

function draw(el, { kind = 'first', title, text, action, progress, compact = false, onRetry, slow, what } = {}) {
  stopSlow(el);
  const k = KIND[kind] || KIND.first;
  const wait = !!k.wait, err = !!k.err;
  const slowable = wait && (slow ?? (!title && !text));   // 기본 '불러오는 중' 줄만 늦음 표시
  el.classList.remove('k-empty--hold');
  if (wait && !title && !text) {
    /* 기본 기다림 — 칸에는 옅은 빈 틀만, 표시는 화면 가운데 하나(늦음 · 다시 시도도 가운데) */
    el.classList.add('k-empty', 't-empty', 'k-empty--hold'); el.classList.remove('k-empty--err'); el.classList.toggle('k-empty--sm', compact);
    el.innerHTML = ''; el.dataset.kind = kind; delete el.dataset.slow;
    el.setAttribute('aria-busy', 'true'); el.removeAttribute('role');
    watch(el, { onRetry, what });
    const set = ({ progress: p, what: w } = {}) => { if (typeof p === 'number' && p >= 1) unwatch(el); else if (w !== undefined && el.dataset.kWait === '1') watch(el, { onRetry, what: w }); };
    set({ progress });
    return { el, set };
  }
  el.classList.add('k-empty'); el.classList.toggle('t-empty', !err); el.classList.toggle('k-empty--err', err); el.classList.toggle('k-empty--sm', compact);
  el.innerHTML = '';
  el.dataset.kind = kind; delete el.dataset.slow;
  el.removeAttribute('role'); el.removeAttribute('aria-busy');
  if (wait) { el.setAttribute('role', 'status'); el.setAttribute('aria-busy', 'true'); } else if (err) el.setAttribute('role', 'alert');

  const body = h('div.k-empty-b');
  /* 기다리는 중 = 막대 1 + 한 줄(제목이 없으면 문장이 그 줄이 된다) · 문제 = 한 줄 · 비었을 때 = 제목 + 문장 */
  const line = wait || err ? (title || text || t(k.title)) : (title || t(k.title));
  let bar = null;
  if (wait || progress !== undefined) bar = h('div.t-progress.k-empty-p', { role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100 }, h('i'));
  if (wait) body.append(bar);
  const head = h('h6', { text: line });
  body.append(head);
  if (text && !err && !(wait && !title)) {
    if (!wait && String(text).length > 40) console.warn('[kit/empty] 문장 40자 초과');
    body.append(h('p', { text }));
  }
  if (bar && !wait) body.append(bar);

  const retry = () => (onRetry ? onRetry() : location.reload());
  const act = action || (k.home ? { label: t('empty.home'), href: '/landxi/v3/main/' } : err ? { label: t('empty.retry'), onClick: retry } : null);
  /* 문제 · 늦음 = 글자 링크(다시 시도) · 그 밖 = 버튼 */
  const mkAct = (a, plain) => {
    const cls = plain ? 'k-empty-a.k-empty-retry' : 't-btn.k-empty-a';
    return a.href ? h(`a.${cls}`, { href: a.href, text: a.label }) : h(`button.${cls}`, { type: 'button', text: a.label, onclick: a.onClick });
  };
  if (act) body.append(mkAct(act, err));
  el.append(body);

  const setBar = (p) => {
    if (!bar) return;
    const i = bar.firstChild;
    if (p === undefined || p === null) { bar.classList.add('is-indet'); i.style.width = ''; bar.removeAttribute('aria-valuenow'); }
    else { bar.classList.remove('is-indet'); i.style.width = Math.round(Math.max(0, Math.min(1, p)) * 100) + '%'; bar.setAttribute('aria-valuenow', Math.round(p * 100)); }
  };
  /* 늦음 — 막대가 값 없이 6초 넘게 돌면 문장을 바꾸고(행동이 따로 없으면) 다시 시도를 붙인다. 진행 값이 오면 되돌린다 */
  let slowBtn = null;
  const unslow = () => { if (el.dataset.slow !== '1') return; head.textContent = line; slowBtn?.remove(); slowBtn = null; delete el.dataset.slow; };
  const arm = () => {
    stopSlow(el);
    SLOW.set(el, setTimeout(() => {
      SLOW.delete(el);
      if (el.dataset.kind !== 'loading' || !el.contains(body)) return;   // 그 사이 다른 내용으로 바뀌었다
      head.textContent = t('empty.slow'); el.dataset.slow = '1';
      if (!act) { slowBtn = mkAct({ label: t('empty.retry'), onClick: retry }, true); body.append(slowBtn); }
    }, SLOW_MS));
  };
  const set = ({ progress: p } = {}) => {
    setBar(p);
    if (!slowable) return;
    if (typeof p === 'number') { stopSlow(el); unslow(); }   // 진행 값이 오고 있다 = 멈춘 것이 아니다
    else if (!SLOW.has(el) && el.dataset.slow !== '1') arm();
  };
  set({ progress });
  return { el, set };
}
