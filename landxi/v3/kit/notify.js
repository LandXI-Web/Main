/* notify.js — 검토 요청 · 메시지 · 알림(구현 2차 · 확인 대장 6차 GF-6 · 알림-1 · 원칙 50 · 63 · 72 · 73).
   세 가지를 한 곳에서 — 모든 화면이 같은 모양 · 같은 말(원칙 43):
   · 알림 칸  mountBell(el, who)       마스트 한 칸(셸이 붙인다). 새 요청 · 새 답 수 + 목록 · 누르면 그 대화.
                                       LX 직원 = 내가 담당하는 요청 · LX 관리자 = 모든 요청 · 기관 = 내가 보낸 요청의 답.
   · 검토 요청 reviewAction(row, opts) 기관 필지 카드의 버튼 한 개 → 메모 한 줄(선택) → 보내기. 이유 고르기 · 사진 없음(원칙 50).
                                       opts = { who, pnu, lnglat, rule, set, fid, card, deploy, from, before }
   · 내가 보낸 요청 openSent({ id })     기관 서랍 — 목록(보냄 → 확인 중 → 답변) · 대화 · 한 줄 덧붙이기.
   주소 ?review=<id> 로 열면 그 대화가, ?review=all 이면 '내가 보낸 요청' 목록이 바로 열린다(기관 메뉴 · 다른 화면에서 이어 오기).
   LX 쪽 대화는 /landxi/v3/lx-inbox/ 화면(?id=<id>).
   새 요청 · 새 답은 30초마다 · 창에 돌아올 때 · 이 창에서 보내고 답할 때(이벤트 'lx:reviews') 다시 센다. 메일 알림 없음.
   다른 할 일(구현 2차 정리 · 서버 /reviews/notify extra) — 처리를 기다리는 것만 숫자에 더하고 맨 위에 한 줄씩:
     분석 의뢰(LX 관리자 = 결재함 · 담당 LX 직원 = 관리자 승인 대기 알림) · 가입 신청 · 비밀번호 재설정 요청(LX 관리자 · 기관 관리자 = 계정 화면). */
import { h, api } from './util.js';
import { drawer } from './panel.js';
import { toast } from './toast.js';
import { locale } from './i18n.js';
import { empty } from './empty.js';

const INBOX = '/landxi/v3/lx-inbox/';
const POLL_MS = 30000;
const EN = () => { try { return locale() === 'en'; } catch { return false; } };
const W = {
  ko: { bell: '알림', none: '새 알림이 없습니다', all_lx: '기관에서 온 요청 전체', all_t: '내가 보낸 요청 전체', sent: '내가 보낸 요청',
    ask: '검토 요청', memo: '메모 한 줄', memo_opt: '안 써도 됩니다', ph: '예: 지난달 창고를 철거했습니다', send: 'LX 담당자에게 보내기', cancel: '취소',
    to: '받는 사람', to_staff: (n) => `이 서비스 담당 LX 직원 ${n}`, to_lead: (n) => `이 서비스 담당 프로젝트장 ${n}`, to_admin: 'LX 관리자', later: "답은 '내가 보낸 요청'에서 봅니다",
    done: '보냈습니다. 답이 오면 알림으로 알려 드립니다', open_sent: '내가 보낸 요청', toast_ok: '검토 요청을 보냈습니다', toast_no: '보내지 못했습니다',
    no_memo: '메모 없음', lx_ans: 'LX 답', empty_sent: '아직 보낸 요청이 없습니다', empty_sent_t: '필지 카드의 검토 요청으로 보냅니다',
    back: '목록', more: '한 줄 덧붙이기', add: '보내기', verdict: '판정', me: '나', load_fail: '불러오지 못했습니다',
    x_request: '분석 의뢰 확인 대기', x_request_staff: '담당 서비스 분석 의뢰', x_request_wait: '관리자 승인 대기', x_signup: '가입 신청', x_reset: '비밀번호 재설정 요청' },
  en: { bell: 'Notices', none: 'No new notices', all_lx: 'All requests from agencies', all_t: 'All my requests', sent: 'My review requests',
    ask: 'Request review', memo: 'One-line note', memo_opt: 'optional', ph: 'e.g. The shed was removed last month', send: 'Send to LX', cancel: 'Cancel',
    to: 'To', to_staff: (n) => `LX staff in charge ${n}`, to_lead: (n) => `LX project lead ${n}`, to_admin: 'LX administrator', later: "Replies appear in 'My review requests'",
    done: 'Sent. You will be notified when LX replies', open_sent: 'My review requests', toast_ok: 'Review request sent', toast_no: 'Could not send',
    no_memo: 'No note', lx_ans: 'LX reply', empty_sent: 'No requests yet', empty_sent_t: 'Send one from a parcel card',
    back: 'List', more: 'Add a line', add: 'Send', verdict: 'Result', me: 'Me', load_fail: 'Could not load',
    x_request: 'Analysis requests to review', x_request_staff: 'Analysis requests for my service', x_request_wait: 'Waiting for approval',
    x_signup: 'Sign-up requests', x_reset: 'Password reset requests' },
};
const w = (k, ...a) => { const v = (EN() ? W.en : W.ko)[k]; return typeof v === 'function' ? v(...a) : v; };
const ST_EN = { sent: 'Sent', seen: 'Checking', answered: 'Replied' };
const V_EN = { ok: 'Correct', ai_error: 'AI error', unknown: 'Unsure' };
const stKo = (it) => (EN() ? ST_EN[it.status] : it.status_ko) || '';
const vKo = (v, ko) => (EN() ? V_EN[v] : ko) || '';

/* 스타일 — 키트 CSS 한 벌(kit.css)을 고치지 않고 이 모듈이 자기 CSS 를 한 번 붙인다(상대 경로 · Pages /Main/ 아래에서도) */
let cssOn = false;
function css() {
  if (cssOn || typeof document === 'undefined') return; cssOn = true;
  if (document.querySelector('link[data-k-notify]')) return;
  document.head.append(h('link', { rel: 'stylesheet', href: new URL('./notify.css', import.meta.url).href, 'data-k-notify': '' }));
}

/** 이 사람이 알림 칸을 갖는가 — LX 직원 · LX 관리자 · 기관(국내 · 해외). 영업 · 영업 계량 기관은 없음 */
export const hasBell = (who) => ['lx/staff', 'lx/admin', 'tenant/local', 'tenant/global'].includes(who?.key);
/** 필지 카드에 '검토 요청'을 두는가 — 기관 계정만(LX 는 받는 쪽) */
export const canRequest = (who) => ['tenant/local', 'tenant/global'].includes(who?.key);

/* 시각 — 오늘이면 HH:MM, 아니면 MM.DD */
export function when(iso) {
  if (!iso) return '';
  const d = new Date(iso), n = new Date(), p = (x) => String(x).padStart(2, '0');
  return d.toDateString() === n.toDateString() ? `${p(d.getHours())}:${p(d.getMinutes())}` : `${p(d.getMonth() + 1)}.${p(d.getDate())}`;
}
const ping = () => document.dispatchEvent(new CustomEvent('lx:reviews'));
/** 받는 사람 한 줄 — 프로젝트에서 낸 서비스면 그 프로젝트장, 아니면 담당 LX 직원, 없으면 LX 관리자 */
const toWho = (rc) => (rc?.kind === 'staff' && rc.name ? w(rc.via === 'project' ? 'to_lead' : 'to_staff', rc.name) : w('to_admin'));

/* ═════════ 알림 칸 ═════════ */
export function mountBell(slot, who) {
  if (!slot || !hasBell(who)) return null;
  css();
  const lx = who.key.startsWith('lx/');
  const n = h('b.k-bell-n', { hidden: true });
  const btn = h('button.k-mast-b.k-bell', { type: 'button', 'aria-label': w('bell'), 'aria-haspopup': 'true', 'aria-expanded': 'false',
    html: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3.2a4.6 4.6 0 0 0-4.6 4.6v3.1L4 13.6h12l-1.4-2.7V7.8A4.6 4.6 0 0 0 10 3.2z M8.1 15.6a2 2 0 0 0 3.8 0"/></svg>' }, n);
  slot.append(btn);
  let pop = null, data = null, busy = false, failed = false;

  async function load() {
    if (busy) return data; busy = true;
    try { data = await api('/reviews/notify'); failed = false; } catch { failed = !data; } finally { busy = false; }
    const c = data?.n || 0;
    n.hidden = !c; n.textContent = c > 99 ? '99+' : String(c);
    btn.setAttribute('aria-label', c ? `${w('bell')} ${c}` : w('bell'));
    btn.dataset.n = String(c);
    if (pop) draw();
    return data;
  }
  function row(it) {
    const title = lx ? [it.org, it.where].filter(Boolean).join(' · ') : it.where;
    let line;
    if (lx) line = it.last && it.last.side === 'tenant' ? (it.last.body || w('no_memo')) : (it.last?.verdict_ko ? `${w('lx_ans')} · ${it.last.verdict_ko}` : it.status_ko);
    else line = it.status === 'answered' ? `${w('lx_ans')}${it.verdict ? ' · ' + vKo(it.verdict, it.verdict_ko) : ''}${it.last?.body ? ' — ' + it.last.body : ''}` : stKo(it);
    const b = h('button.k-bell-i', { type: 'button', dataset: { unread: it.unread ? '1' : '0' } },
      h('span.k-bell-t', {}, h('b', { text: title || '' }), h('time', { text: when(it.updated_at) })),
      h('span.k-bell-l', { text: line || '' }));
    b.addEventListener('click', () => { close(); if (lx) location.href = INBOX + '?id=' + encodeURIComponent(it.id); else openSent({ id: it.id }); });
    return b;
  }
  /* 다른 할 일 한 줄 — 처리할 화면이 있으면 그리로(관리자 결재함 · 계정 화면), 없으면 알림만(담당 직원의 의뢰 — 관리자 승인 대기) */
  function xrow(x) {
    const label = x.kind === 'request' ? (x.href ? w('x_request') : w('x_request_staff')) : w(x.kind === 'signup' ? 'x_signup' : 'x_reset');
    const sub = x.kind === 'request' ? (x.items || []).map((i) => i.title).filter(Boolean).slice(0, 2).join(' · ') + (x.href ? '' : ` — ${w('x_request_wait')}`) : '';
    const inner = [h('span.k-bell-t', {}, h('b', { text: label }), h('b.k-bell-x', { text: String(x.n) })), sub ? h('span.k-bell-l', { text: sub }) : null];
    if (!x.href) return h('div.k-bell-i.k-bell-i--x', { dataset: { kind: x.kind, unread: '1' } }, ...inner);
    const a = h('a.k-bell-i.k-bell-i--x', { href: x.href, dataset: { kind: x.kind, unread: '1' } }, ...inner);
    a.addEventListener('click', () => close());
    return a;
  }
  function draw() {
    const items = data?.items || [];
    const extra = (data?.extra || []).filter((x) => x.n > 0);
    pop.replaceChildren(...[
      h('p.k-bell-h', {}, h('span', { text: w('bell') }), data?.n ? h('small', { text: EN() ? `${data.n} new` : `새로 온 것 ${data.n}` }) : null),
      extra.length ? h('div.k-bell-list.k-bell-list--x', {}, ...extra.map(xrow)) : null,
      items.length ? h('div.k-bell-list', {}, ...items.map(row)) : extra.length ? null : blank(data),
      lx ? h('a.t-btn.t-btn--text.k-bell-all', { href: INBOX, text: w('all_lx') })
        : h('button.t-btn.t-btn--text.k-bell-all', { type: 'button', text: w('all_t'), onclick: () => { close(); openSent(); } })].filter(Boolean));   // 빈 칸(null)은 넣지 않는다
  }
  function blank(d) {
    const el = h('div.k-bell-none');
    if (!d && failed) empty(el, { kind: 'error', compact: true, onRetry: () => load() });
    else if (!d) empty(el, { kind: 'loading', compact: true }).set({ progress: null });
    else empty(el, { kind: 'first', title: w('none'), compact: true });
    return el;
  }
  function open() {
    if (pop) return close();
    pop = h('div.k-bell-pop', { role: 'dialog', 'aria-label': w('bell') });
    document.body.append(pop);
    const r = btn.getBoundingClientRect();
    pop.style.top = Math.round(r.bottom + 8) + 'px';
    pop.style.right = Math.max(8, Math.round(innerWidth - r.right - 8)) + 'px';
    btn.setAttribute('aria-expanded', 'true');
    draw(); load();
    setTimeout(() => document.addEventListener('pointerdown', outside, true), 0);
  }
  function close() {
    if (!pop) return;
    pop.remove(); pop = null; btn.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', outside, true);
  }
  const outside = (e) => { if (pop && !pop.contains(e.target) && !btn.contains(e.target)) close(); };
  btn.addEventListener('click', open);
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && pop) close(); });
  addEventListener('focus', () => load());
  document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
  document.addEventListener('lx:reviews', () => setTimeout(load, 300));
  setInterval(() => { if (!document.hidden) load(); }, POLL_MS);
  load();
  /* 주소로 온 대화(?review=) — 기관은 이 화면 위 서랍으로, LX 는 받은 곳 화면으로 */
  const q = new URLSearchParams(location.search).get('review');
  if (q && !lx) setTimeout(() => openSent(q === 'all' ? {} : { id: q }), 600);
  return { el: btn, refresh: load, open, close };
}

/* ═════════ 기관: 필지 카드의 '검토 요청' ═════════ */
export function reviewAction(row, opts = {}) {
  if (!row || !canRequest(opts.who)) return null;
  css();
  const btn = h('button.t-btn.t-btn--2.k-rv-b', { type: 'button', text: w('ask'), 'aria-expanded': 'false' });
  const panel = h('div.k-rv', { hidden: true });
  if (opts.before && opts.before.parentNode === row) row.insertBefore(btn, opts.before); else row.append(btn);
  row.after(panel);
  let sent = false;
  const q = {};
  for (const k of ['pnu', 'rule', 'set', 'fid', 'card', 'deploy']) if (opts[k]) q[k] = String(opts[k]);

  function form() {
    const inp = h('input.t-input.k-rv-in', { type: 'text', maxlength: '300', placeholder: w('ph'), 'aria-label': w('memo') });
    const go = h('button.t-btn.k-rv-go', { type: 'submit', text: w('send') });
    const no = h('button.k-rv-x', { type: 'button', text: w('cancel') });
    const to = h('p.k-rv-to', {}, h('span', { text: w('to') }), h('b', { text: '…' }));
    const f = h('form.k-rv-f', { autocomplete: 'off' },
      h('label.k-rv-l', {}, h('span', { text: w('memo') }), h('small', { text: w('memo_opt') })), inp,
      h('div.k-rv-btns', {}, go, no), to, h('p.k-rv-note', { text: w('later') }));
    no.addEventListener('click', () => toggle(false));
    f.addEventListener('submit', async (e) => {
      e.preventDefault(); if (go.disabled) return;
      go.disabled = true;
      try {
        const body = { ...q, note: inp.value.trim(), from: opts.from || undefined };
        if (opts.lnglat && Array.isArray(opts.lnglat)) body.lnglat = opts.lnglat;
        const r = await api('/reviews', { method: 'POST', body });
        sent = true; done(r); toast(w('toast_ok')); ping();
      } catch { go.disabled = false; toast(w('toast_no')); }
    });
    /* 받는 사람 한 줄 — 누구에게 가는지 몰라도 되지만 카드 아래에 저절로 적힌다 */
    api('/reviews/recipient?' + new URLSearchParams(q)).then((r) => {
      to.querySelector('b').textContent = toWho(r?.recipient);
    }).catch(() => { to.hidden = true; });
    requestAnimationFrame(() => inp.focus());
    return f;
  }
  function done(r) {
    const who = toWho(r?.recipient);
    panel.replaceChildren(h('div.k-rv-done', { role: 'status' },
      h('p', {}, h('b', { text: w('done') })), h('p.k-rv-to', {}, h('span', { text: w('to') }), h('b', { text: who })),
      h('button.t-btn.t-btn--text', { type: 'button', text: w('open_sent'), onclick: () => openSent({ id: r?.id }) })));
    btn.hidden = true;
  }
  function toggle(on) {
    if (sent) return;
    panel.hidden = !on; btn.setAttribute('aria-expanded', String(on));
    if (on) panel.replaceChildren(form()); else panel.replaceChildren();
  }
  btn.addEventListener('click', () => toggle(panel.hidden));
  return { button: btn, panel };
}

/* ═════════ 기관: 내가 보낸 요청(서랍) ═════════ */
export function openSent({ id } = {}) {
  css();
  const d = drawer({ title: w('sent'), slot: 'reviews', label: w('sent') });
  d.el.classList.add('k-rv-dr');
  if (id) conv(d, id); else list(d);
  return d;
}

async function list(d) {
  d.title(w('sent'));
  const box = h('div.k-rv-list');
  const wait = h('div'); box.append(wait);
  empty(wait, { kind: 'loading' }).set({ progress: null });
  d.set(box);
  let j;
  try { j = await api('/reviews?box=all&limit=100'); } catch { empty(wait, { kind: 'error', onRetry: () => list(d) }); return; }
  const items = j.items || [];
  if (!items.length) { empty(wait, { kind: 'first', title: w('empty_sent'), text: w('empty_sent_t') }); return; }
  box.replaceChildren(...items.map((it) => {
    const b = h('button.k-rv-row', { type: 'button', dataset: { unread: it.unread ? '1' : '0' } },
      h('span.k-rv-top', {}, h('b', { text: it.where }), h('span.t-chip', { text: stKo(it), 'data-lv': it.status === 'answered' ? undefined : 'wait' })),
      h('span.k-rv-meta', { text: [it.service, when(it.at)].filter(Boolean).join(' · ') }),
      h('span.k-rv-memo', { text: it.note || w('no_memo') }),
      it.status === 'answered' && it.last ? h('span.k-rv-ans', {}, it.verdict ? h('b', { text: vKo(it.verdict, it.verdict_ko) }) : null, h('span', { text: it.last.body || '' })) : null);
    b.addEventListener('click', () => conv(d, it.id));
    return b;
  }));
}

async function conv(d, id) {
  const box = h('div.k-rv-conv');
  const wait = h('div'); box.append(wait);
  empty(wait, { kind: 'loading' }).set({ progress: null });
  d.set(box);
  let r;
  try { r = await api('/reviews/' + encodeURIComponent(id)); }
  catch (e) { if (e?.status === 404) empty(wait, { kind: 'first', title: w('load_fail'), action: { label: w('back'), onClick: () => list(d) } }); else empty(wait, { kind: 'error', onRetry: () => conv(d, id) }); return; }
  d.title(r.where || w('sent'));
  api('/reviews/' + encodeURIComponent(id) + '/read', { method: 'POST' }).then(ping).catch(() => {});
  const head = h('div.k-rv-head', {},
    h('button.k-rv-back', { type: 'button', html: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M12 4l-6 6 6 6"/></svg>', 'aria-label': w('back'), onclick: () => list(d) }),
    h('span.k-rv-meta', { text: [r.service, r.recipient].filter(Boolean).join(' · ') }),
    h('span.t-chip', { text: stKo(r), 'data-lv': r.status === 'answered' ? undefined : 'wait' }));
  const msgs = h('ol.k-rv-msgs', {}, ...r.messages.map(msg));
  const inp = h('input.t-input', { type: 'text', maxlength: '500', placeholder: w('more'), 'aria-label': w('more') });
  const add = h('button.t-btn.t-btn--2', { type: 'submit', text: w('add') });
  const f = h('form.k-rv-add', { autocomplete: 'off' }, inp, add);
  f.addEventListener('submit', async (e) => {
    e.preventDefault(); const t = inp.value.trim(); if (!t || add.disabled) return;
    add.disabled = true;
    try { await api('/reviews/' + encodeURIComponent(id) + '/messages', { method: 'POST', body: { body: t } }); ping(); conv(d, id); }
    catch { add.disabled = false; toast(w('toast_no')); }
  });
  box.replaceChildren(head, msgs, f);
}

/** 대화 한 줄 — 나(기관) / LX. 판정이 있으면 머리에 한 칩 */
export function msg(m) {
  return h('li.k-rv-m', { dataset: { side: m.side, mine: m.mine ? '1' : '0', new: m.new ? '1' : '0' } },
    h('p.k-rv-mw', {}, h('b', { text: m.mine ? w('me') : m.who }), h('time', { text: when(m.at) })),
    m.verdict ? h('p.k-rv-mv', {}, h('span', { text: w('verdict') }), h('b', { text: vKo(m.verdict, m.verdict_ko) })) : null,
    h('p.k-rv-mb', { text: m.body || (m.side === 'tenant' ? w('no_memo') : '') }));
}

