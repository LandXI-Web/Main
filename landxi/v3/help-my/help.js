/* help-my · 지원 · MY 서랍 — 공지 · 자주 묻는 질문 · 문의 · 내 계정. 서버 변경 0.
   명세 LANDXI-FINAL-SPEC §2.16. 부품 K1 K5 K12 · GET /me · POST /auth/logout.

   쓰는 법
   · 모든 집의 `?`(K1 기본) → K5 서랍 안에 /landxi/v3/help-my/?embed=1 (iframe) — 아무것도 안 해도 된다.
   · iframe 없이 서랍을 직접 열고 싶은 화면:
       import { openHelp } from './help.js';
       shell({ who, onHelp: () => openHelp({ who }) });
   · 판에 붙이기: mountHelp(el, { who, tab: 'faq' })

   글자는 명세 '문구 전부' 칸 + LX 가 편집하는 data/{notices,faq}.json 만. */
import { h, esc, api, session } from '../kit/util.js';
import { drawer } from '../kit/panel.js';
import { table } from '../kit/table.js';
import { whoami, FRONT } from '../kit/auth-gate.js';

const BASE = new URL('./', import.meta.url);
export const TABS = [
  { id: 'notice', label: '공지' },
  { id: 'faq', label: '자주 묻는 질문' },
  { id: 'contact', label: '문의' },
  { id: 'me', label: '내 계정' },
];
export const CONTACT = { tel: '063-713-1218', mail: 'landxi@lx.or.kr' };   // ※ 사용자 확인 전 자리표(명세 §4-12)
const MAX = 10;

const ICON = {
  tel: '<path d="M6.5 3.5l2 3.5-1.6 1.4a9 9 0 004.7 4.7L13 11.5l3.5 2-.8 2.6c-.2.6-.8 1-1.4.9C8.5 16.2 3.8 11.5 3 5.7c-.1-.6.3-1.2.9-1.4z"/>',
  mail: '<path d="M3 5h14v10H3z M3 5.5l7 5.5 7-5.5"/>',
  go: '<path d="M8 5l5 5-5 5"/>',
};
const svg = (k) => `<svg viewBox="0 0 20 20" aria-hidden="true">${ICON[k]}</svg>`;

/* ── 데이터(정적 JSON · LX 편집 · 각 ≤ 10) ── */
const cache = {};
async function load(name) {
  if (!cache[name]) cache[name] = fetch(new URL(`data/${name}.json`, BASE), { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : { items: [] })).then((j) => (j.items || []).slice(0, MAX)).catch(() => []);
  return cache[name];
}
const dot = (s) => String(s || '').slice(0, 10).replace(/-/g, '.');
const stamp = (d) => { const x = new Date(d); if (isNaN(x)) return '—'; const p = (n) => String(n).padStart(2, '0'); return `${x.getFullYear()}.${p(x.getMonth() + 1)}.${p(x.getDate())} ${p(x.getHours())}:${p(x.getMinutes())}`; };

/* ── 탭 1 · 공지 (K12 표 · 행을 누르면 본문 한 줄) ── */
async function notice(el) {
  const rows = (await load('notices')).sort((a, b) => (b.pin ? 1 : 0) - (a.pin ? 1 : 0) || String(b.date).localeCompare(String(a.date)));
  if (!rows.length) { el.append(h('p.hm-none', { text: '공지가 없습니다' })); return; }
  const w = h('div.hm-tbl');
  el.append(w);
  let open = null;
  const T = table(w, {
    cols: [
      { key: 'title', label: '제목', fmt: (v, r) => `<span class="hm-tt">${esc(v)}</span>` },
      { key: 'date', label: '날짜', width: '92px', num: true, fmt: (v) => `<span class="hm-d">${esc(dot(v))}</span>` },
    ],
    rows, limit: MAX,
    onRow(r) {
      const tr = [...w.querySelectorAll('tbody tr[data-i]')].find((x) => w._vis[+x.dataset.i] === r);
      w.querySelector('.hm-open')?.remove();
      w.querySelectorAll('tr[aria-expanded]').forEach((x) => x.removeAttribute('aria-expanded'));
      if (open === r) { open = null; return; }
      open = r;
      tr.setAttribute('aria-expanded', 'true');
      tr.insertAdjacentHTML('afterend', `<tr class="hm-open"><td colspan="2"><p>${esc(r.body)}</p></td></tr>`);
    },
  });
  // K12 는 제목 머리를 그린다 — 서랍 안에서는 숨긴다(CSS) · 첫 공지는 열어 둔다
  requestAnimationFrame(() => { const first = w.querySelector('tbody tr[data-i="0"]'); if (first) first.click(); });
  return T;
}

/* ── 탭 2 · 자주 묻는 질문 (접기 목록 · 한 번에 하나) ── */
async function faq(el) {
  const rows = await load('faq');
  if (!rows.length) { el.append(h('p.hm-none', { text: '공지가 없습니다' })); return; }
  const list = h('div.hm-faq');
  for (const r of rows) {
    const d = h('details.hm-q', {}, h('summary', {}, h('span', { text: r.q }), h('i', { 'aria-hidden': 'true', html: svg('go') })), h('p', { text: r.a }));
    d.addEventListener('toggle', () => { if (d.open) list.querySelectorAll('details[open]').forEach((x) => x !== d && (x.open = false)); });
    list.append(d);
  }
  el.append(list);
}

/* ── 탭 3 · 문의 (전화 · 메일 두 줄) ── */
function contact(el) {
  el.append(h('div.hm-contact', {},
    h('a.hm-ct', { href: 'tel:' + CONTACT.tel.replace(/-/g, ''), html: `${svg('tel')}<span class="hm-v">${esc(CONTACT.tel)}</span>` }),
    h('a.hm-ct', { href: 'mailto:' + CONTACT.mail, html: `${svg('mail')}<span class="hm-v">${esc(CONTACT.mail)}</span>` })));
}

/* ── 탭 4 · 내 계정 (이름 · 역할 · 기관 · 세션 만료 + 로그아웃) ── */
function roleOf(who) {
  const k = who?.key || '';
  if (k === 'lx/staff') return 'LX 직원';
  if (k === 'lx/admin') return 'LX 관리자';
  if (k === 'lx/sales') return 'LX 영업';
  return who?.me?.role === 'viewer' ? '기관 · 열람' : '기관 · 담당';
}
async function me(el, whoIn) {
  const who = whoIn || (await whoami());
  const s = session.get();
  const rows = [
    ['이름', who?.name || '—'],
    ['역할', who ? roleOf(who) : '—'],
    ['기관', who ? (who.me?.realm === 'lx' ? '한국국토정보공사' : who.org || '—') : '—'],
    ['세션 만료', s?.expires_at ? stamp(s.expires_at) : '—'],
  ];
  const dl = h('dl.hm-me');
  for (const [k, v] of rows) dl.append(h('div', {}, h('dt', { text: k }), h('dd', { text: v })));
  /* LX 계정 — 부서 · 연락처 · 저장 용량(서버 GET /me/profile 한 출처) + '내 정보 고치기'(머리의 내 이름과 같은 창 · 확인 17차 P-5 ⓐ) */
  let edit = null;
  if (who?.me?.realm === 'lx') {
    const fill = async (p) => {
      const { size } = await import('../kit/me.js');
      const val = (e) => (e && typeof e === 'object' && 'value' in e ? e.value : e);
      const q = val(p.storage?.quota_gb);
      dl.querySelector('dd').textContent = p.name || '—';
      dl.querySelectorAll('.hm-me-row').forEach((x) => x.remove());
      for (const [k, v] of [['부서', p.dept || '—'], ['연락처', p.contact || '—'],
        ['저장 용량', q !== null && q !== undefined ? `${size(val(p.storage?.used))} / ${q} GB 할당` : `할당 없음 · 지금 쓴 양 ${size(val(p.storage?.used))}`]]) {
        dl.append(h('div.hm-me-row', {}, h('dt', { text: k }), h('dd', { text: v })));
      }
    };
    api('/me/profile').then(fill).catch(() => {});
    edit = h('button.t-btn.t-btn--2.hm-edit', { type: 'button', text: '내 정보 고치기' });
    edit.addEventListener('click', () => import('../kit/me.js').then((m) => m.openMe({ onSaved: fill })));
    if (!document.querySelector('link[data-k-me]')) document.head.append(h('link', { rel: 'stylesheet', href: new URL('../kit/me.css', import.meta.url).href, 'data-k-me': '' }));
  }
  const out = h('button.t-btn.t-btn--2.hm-out', { type: 'button', text: '로그아웃' });
  out.addEventListener('click', async () => {
    out.disabled = true;
    try { await api('/auth/logout', { method: 'POST' }); } catch { /* 만료여도 지운다 */ }
    session.clear();
    (window.top || window).location.replace(FRONT);   // 서랍(iframe) 안에서도 창 전체가 정문으로
  });
  el.append(dl, ...(edit ? [h('div.hm-me-acts', {}, edit, out)] : [out]));
}

const PANES = { notice, faq, contact, me };

/** 판에 지원 서랍 내용을 붙인다 → { go(tabId) } */
export function mountHelp(el, { who = null, tab } = {}) {
  el.classList.add('hm');
  const start = TABS.some((t) => t.id === tab) ? tab : 'notice';
  const bar = h('div.hm-tabs', { role: 'tablist', 'aria-label': '지원' });
  const body = h('div.hm-body');
  const done = {};
  const btns = TABS.map((t, i) => {
    const b = h('button.hm-tab', { type: 'button', role: 'tab', id: 'hm-t-' + t.id, 'aria-controls': 'hm-p-' + t.id, 'aria-selected': 'false', tabindex: '-1', text: t.label });
    b.addEventListener('click', () => go(t.id));
    b.addEventListener('keydown', (e) => {
      const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0; if (!d) return;
      e.preventDefault(); const n = TABS[(i + d + TABS.length) % TABS.length]; go(n.id); document.getElementById('hm-t-' + n.id)?.focus();
    });
    bar.append(b); return b;
  });
  const panes = TABS.map((t) => { const p = h('section.hm-pane', { role: 'tabpanel', id: 'hm-p-' + t.id, 'aria-labelledby': 'hm-t-' + t.id, hidden: true }); body.append(p); return p; });
  const ink = h('i.hm-ink', { 'aria-hidden': 'true' });
  bar.append(ink);
  el.append(bar, body);

  function place(b) { ink.style.width = b.offsetWidth + 'px'; ink.style.transform = `translateX(${b.offsetLeft}px)`; }
  function go(id) {
    TABS.forEach((t, i) => {
      const on = t.id === id;
      btns[i].setAttribute('aria-selected', on); btns[i].tabIndex = on ? 0 : -1; panes[i].hidden = !on;
      if (on) {
        if (!done[id]) { done[id] = true; PANES[id](panes[i], who); }
        panes[i].classList.remove('is-in'); requestAnimationFrame(() => panes[i].classList.add('is-in'));
        place(btns[i]);
      }
    });
    el.dataset.tab = id;
    try { const u = new URL(location.href); if (u.pathname.includes('/help-my/')) { u.searchParams.set('tab', id); history.replaceState(null, '', u); } } catch { /* */ }
  }
  addEventListener('resize', () => { const b = bar.querySelector('[aria-selected="true"]'); if (b) place(b); });
  document.fonts?.ready.then(() => { const b = bar.querySelector('[aria-selected="true"]'); if (b) place(b); });
  go(start);
  return { go, el };
}

/** iframe 없이 K5 서랍으로 연다(화면이 shell onHelp 로 넘길 때) */
export function openHelp({ who = null, tab, host } = {}) {
  if (!document.querySelector('link[data-hm]')) document.head.append(h('link', { rel: 'stylesheet', href: new URL('help-my.css', BASE).href, 'data-hm': '1' }));
  const box = h('div');
  const d = drawer({ title: '지원', label: '지원', body: box, host, slot: 'right' });
  mountHelp(box, { who, tab });
  return d;
}
