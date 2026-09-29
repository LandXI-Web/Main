/* K9 empty.js — 빈 상태 캐릭터(스펙시먼 G · D20②). 캐릭터 = 국토위성 · LX 드론 · 항공기(필름 스틸).
   `.t-empty` --bg-0 카드 16 · 스틸 우상단 60% · 제목 20/500 · 문장 1(≤ 40자) · 행동 1 · 진행 변형 = 액센트 막대 1개.
   empty(el, { kind: 'first'|'ingest'|'outside'|'loading'|'404', text, action: { label, href|onClick }, progress: 0..1 })
   → { set({progress}), resolve(data), el }
   도착 전과 빈 값 구분(하위 호환 · 선택): empty(el, { kind: 'first', data: undefined }) 처럼 data 를 넘기면
     data === undefined(아직 도착 전) → '불러오는 중' 변형 · 나중에 resolve(data) 가
     빈 값(null · 빈 배열 · 봉투 value null)이면 원래 kind 로, 값이 있으면 빈 상태를 지우고 false 를 돌려준다. */
import { h, isEnvelope } from './util.js';
import { t } from './i18n.js';

const IMG = (n) => new URL(`./img/${n}.webp`, import.meta.url).href;
export const CHARS = { satellite: IMG('satellite'), drone: IMG('drone'), aircraft: IMG('aircraft') };
const KIND = {
  first: { title: 'empty.first', char: 'satellite' },
  ingest: { title: 'empty.ingest', char: 'aircraft' },
  outside: { title: 'empty.outside', char: 'satellite' },
  loading: { title: 'empty.loading', char: 'drone', progress: true },
  404: { title: 'empty.404', char: 'aircraft', home: true },
};

/** 빈 값인가 — null · undefined · 빈 배열 · 빈 items · 봉투 value null */
export const isBlank = (d) => d === null || d === undefined || (Array.isArray(d) && !d.length)
  || (isEnvelope(d) && (d.value === null || d.value === undefined)) || (Array.isArray(d?.items) && !d.items.length);

export function empty(el, opts = {}) {
  if ('data' in opts && opts.data === undefined) {
    // 도착 전 — 불러오는 중 변형을 먼저 그리고, resolve 가 오면 원래 kind 로 다시 그린다
    const want = { ...opts }; delete want.data;
    let cur = draw(el, { kind: 'loading', compact: opts.compact });
    cur.set({ progress: null });
    const resolve = (d) => { if (isBlank(d)) { cur = draw(el, want); return true; } clear(el); return false; };
    return { el, set: (p) => cur.set(p), resolve };
  }
  const r = draw(el, opts);
  return { ...r, resolve: (d) => (isBlank(d) ? true : (clear(el), false)) };
}
function clear(el) { el.innerHTML = ''; el.classList.remove('t-empty', 'k-empty', 'k-empty--sm'); delete el.dataset.kind; }

function draw(el, { kind = 'first', title, text, action, progress, char, compact = false } = {}) {
  const k = KIND[kind] || KIND.first;
  el.classList.add('t-empty', 'k-empty'); el.classList.toggle('k-empty--sm', compact);
  el.innerHTML = '';
  el.dataset.kind = kind;
  const img = h('img', { src: CHARS[char || k.char], alt: '', loading: 'lazy', decoding: 'async' });
  const body = h('div.k-empty-b');
  body.append(h('h6', { text: title || t(k.title) }));
  if (text) { if (String(text).length > 40) console.warn('[kit/empty] 문장 40자 초과'); body.append(h('p', { text })); }
  let bar = null;
  if (k.progress || progress !== undefined) { bar = h('div.t-progress.k-empty-p', { role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100 }, h('i')); body.append(bar); }
  const act = action || (k.home ? { label: t('empty.home'), href: '/landxi/v3/main/' } : null);
  if (act) body.append(act.href ? h('a.t-btn--text.t-btn.k-empty-a', { href: act.href, text: act.label }) : h('button.t-btn--text.t-btn.k-empty-a', { type: 'button', text: act.label, onclick: act.onClick }));
  el.append(img, body);
  const set = ({ progress: p } = {}) => {
    if (!bar) return;
    const i = bar.firstChild;
    if (p === undefined || p === null) { bar.classList.add('is-indet'); i.style.width = ''; bar.removeAttribute('aria-valuenow'); }
    else { bar.classList.remove('is-indet'); i.style.width = Math.round(Math.max(0, Math.min(1, p)) * 100) + '%'; bar.setAttribute('aria-valuenow', Math.round(p * 100)); }
  };
  set({ progress });
  return { el, set };
}
