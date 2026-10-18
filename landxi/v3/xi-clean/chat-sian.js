/* XI ChatGEO 자리 — 시안 둘(10-18 원칙 290 · 주소 ?chat=d1 | ?chat=d2 에서만 · 기본 화면 · 공용 kit 는 그대로 · 이 모듈이 밖에서 덧붙인다)
   d1 '지도가 답한다' — 지도 위에는 입력 한 줄 + 답 띠(두 줄) 만. 답의 숫자 · 자리는 지도 위 꼬리표 · 한 줄 통계가 맡고, 지난 대화는 오른쪽 서랍('대화 n').
   d2 '아래 시트 · 세 높이' — 지도 아래 전체 폭 시트. 접기(입력 한 줄) · 답 · 전체 자석 · 손잡이를 끌어 높이 · 지도 · 떠 있는 칸이 시트 위로 올라선다 · 높이는 사람마다 기억(브라우저 · 실구현은 /me/prefs/xi-clean.chat). */
import * as K from '../kit/index.js';

const { h } = K;
const nf = (n) => Number(n).toLocaleString('ko-KR');

export function mountChatSian({ mode, host, cmdk, stage, map, who }) {
  if (!host || !cmdk?.el) return null;
  const root = host.querySelector('.k-chat-root[data-dock]'); if (!root) return null;
  if (!document.querySelector('link[data-xs]')) document.head.append(h('link', { rel: 'stylesheet', href: new URL('./chat-sian.css', import.meta.url).href, 'data-xs': '1' }));
  host.dataset.chat = mode;
  host.append(h('div.xs-badge', {}, h('b', { text: '시안' }), h('span', { text: mode === 'd1' ? '지도가 답한다 — 입력 한 줄 · 답은 지도 위' : '아래 시트 — 접기 · 답 · 전체' })));
  return mode === 'd1' ? d1({ host, root, box: cmdk.el, cmdk }) : d2({ host, root, box: cmdk.el, cmdk, stage, map, who });
}

/* ═══ d1 ═══ */
function d1({ host, root, box, cmdk }) {
  const dlog = root.querySelector('.k-chat-dlog'), log = root.querySelector('.k-chat-b'), sugg = box.querySelector('.k-chat-sugg'); if (!dlog || !log) return null;
  const txt = h('p.xs-ans-t'), acts = h('div.xs-ans-a'), more = h('button.xs-more', { type: 'button', text: '대화', onclick: () => openDrawer() });
  const card = h('div.xs-ans', { hidden: true }, h('span.xs-ans-i', { 'aria-hidden': 'true', text: 'XI' }), h('div.xs-ans-m', {}, txt, acts), h('button.xs-ans-x', { type: 'button', 'aria-label': '답 띠 닫기', text: '×', onclick: () => { card.hidden = true; } }));
  (sugg || box.querySelector('.k-chat-in')).before(card);
  let drawer = null, home = null;
  const turns = () => log.querySelectorAll('.k-chat-msg.me').length;
  function paint() {
    const st = box.dataset.state;
    const last = [...log.querySelectorAll('.k-chat-msg.ai')].pop();
    if (st === 'busy') { card.hidden = false; card.classList.add('is-busy'); txt.textContent = '답을 찾는 중'; acts.replaceChildren(h('span.xs-ans-bar')); return; }
    if (!last || last.classList.contains('k-chat-intro')) { card.hidden = true; return; }
    card.classList.remove('is-busy');
    const a = last.querySelector('.k-chat-a, .k-ck-a') || last.querySelector('.k-chat-bub p') || last.querySelector('.k-chat-bub');
    txt.innerHTML = a ? a.innerHTML : '';
    for (const el of txt.querySelectorAll('br')) el.replaceWith(' ');
    const btns = [...last.querySelectorAll('.k-chat-btn[data-q], .k-chat-chip[data-q]')].slice(0, 2).map((b, i) => h(`button.k-chat-btn${i === 0 ? '.is-1' : ''}`, { type: 'button', 'data-q': b.dataset.q, text: b.textContent.trim() }));   // 같은 data-q → 공용 kit 가 처리
    more.textContent = `대화 ${nf(turns())}`;
    acts.replaceChildren(...btns, more);
    card.hidden = false;
  }
  function openDrawer() {
    if (drawer) { drawer.close(); return; }
    home = log.parentElement;
    drawer = K.drawer({ title: 'XI ChatGEO · 대화', host, slot: 'right', onClose: () => { drawer = null; if (home) home.append(log); log.querySelectorAll('.k-chat-msg').forEach((m) => { m.style.display = ''; }); } });
    drawer.body.classList.add('xs-dlog'); drawer.body.append(log);
    requestAnimationFrame(() => { log.scrollTop = log.scrollHeight; });
    setTimeout(() => window.__xc?.relayout?.(), 420);   // 서랍이 선 자리를 피해 입력 줄 · 답 띠가 비켜 선다(지도 위 배치 하나)
  }
  new MutationObserver((ms) => { if (ms.every((m) => card.contains(m.target))) return; paint(); }).observe(box, { attributes: true, attributeFilter: ['data-state'], childList: true, subtree: true });
  new ResizeObserver(() => host.style.setProperty('--xs-ah', (card.hidden ? 0 : card.offsetHeight + 8) + 'px')).observe(card);   // 좁은 화면 — 통계 판이 답 띠 위로 올라서는 높이
  paint();
  window.__xc && (window.__xc.chatSian = { mode: 'd1' });
  return { mode: 'd1', card };
}

/* ═══ d2 ═══ */
const KEY = 'xc.chat.sheet';
function d2({ host, root, box, cmdk, stage, map, who }) {
  const dlog = root.querySelector('.k-chat-dlog'), log = root.querySelector('.k-chat-b'); if (!dlog || !log) return null;
  const mobile = () => matchMedia('(max-width: 640px)').matches;
  const H = () => host.getBoundingClientRect().height;
  const FOLD = () => (mobile() ? 84 : 88);   // 손잡이 24 + 입력 56 + 아래 8 — 접혀도 입력 줄이 온전히 보인다
  const snaps = () => ({ fold: FOLD(), half: mobile() ? Math.round(H() * 0.36) : Math.max(220, Math.min(320, Math.round(H() * 0.32))), full: mobile() ? Math.round(H() * 0.82) : Math.min(600, Math.round(H() * 0.6)) });
  const key = () => `${KEY}.${who || 'me'}`;
  let cur = 'fold'; try { const s = localStorage.getItem(key()); if (s === 'half' || s === 'full' || s === 'fold') cur = s; } catch { /* 저장 불가 */ }
  const btnOf = {}; const names = { fold: '접기', half: '답', full: '전체' };
  const snapBar = h('div.xs-snap', {}, ...['fold', 'half', 'full'].map((k) => (btnOf[k] = h('button', { type: 'button', text: names[k], 'aria-pressed': 'false', onclick: () => go(k) }))));
  const grip = h('div.xs-grip', { role: 'separator', 'aria-orientation': 'horizontal', 'aria-label': '채팅 높이 조절' }, snapBar);
  box.prepend(grip);
  let lastPad = {};
  const pad0 = stage.pad.bind(stage);
  stage.pad = (p = {}) => { lastPad = p; pad0({ ...p, bottom: Math.max(p.bottom || 0, px(cur) - FOLD() + 16) }); };   // 지도 카메라 — 시트 위 영역에 맞춘다
  function px(k) { return snaps()[k]; }
  function setH(v, live) { host.style.setProperty('--xs-sh', Math.round(v) + 'px'); if (!live) for (const [k, b] of Object.entries(btnOf)) b.setAttribute('aria-pressed', String(k === cur)); }
  function go(k, { save = true, pan = true } = {}) {
    const was = px(cur); cur = k; root.dataset.h = k; setH(px(k));
    if (k !== 'fold') { delete root.dataset.fold; requestAnimationFrame(() => { log.scrollTop = log.scrollHeight; }); }
    stage.pad(lastPad);
    const d = px(k) - was; if (pan && d && map) try { map.panBy([0, Math.round(d / 2)], { duration: 380 }); } catch { /* */ }   // 지도가 따라 올라간다(가리던 만큼 반)
    if (save) try { localStorage.setItem(key(), k); } catch { /* */ }
    window.__xc && (window.__xc.chatSian = { mode: 'd2', h: k, px: px(k) });
  }
  // 끌기 — 놓으면 가장 가까운 자석으로
  let pd = null;
  grip.addEventListener('pointerdown', (e) => { if (e.target.closest('button')) return; pd = { y: e.clientY, h: px(cur), id: e.pointerId }; root.classList.add('is-drag'); try { grip.setPointerCapture(e.pointerId); } catch { /* */ } });
  grip.addEventListener('pointermove', (e) => { if (!pd || e.pointerId !== pd.id) return; const v = Math.max(FOLD(), Math.min(px('full') + 40, pd.h + (pd.y - e.clientY))); setH(v, true); });
  const up = (e) => { if (!pd || (e && e.pointerId !== pd.id)) return; const v = parseFloat(host.style.getPropertyValue('--xs-sh')) || px(cur); pd = null; root.classList.remove('is-drag');
    const s = snaps(); const k = Object.keys(s).sort((a, b) => Math.abs(s[a] - v) - Math.abs(s[b] - v))[0]; const was = cur; cur = was; go(k, { pan: false }); };
  grip.addEventListener('pointerup', up); grip.addEventListener('pointercancel', up);
  // 질문을 보내면 접힌 시트는 '답' 높이로 · 입력에 초점이 와도 접힌 채면 '답'으로
  let was = box.dataset.state;
  new MutationObserver(() => { const st = box.dataset.state; if (st !== was) { was = st; if (st === 'busy' && cur === 'fold') go('half'); } }).observe(box, { attributes: true, attributeFilter: ['data-state'] });
  box.querySelector('.k-ck-i')?.addEventListener('focus', () => { if (cur === 'fold') go('half'); });
  addEventListener('resize', () => { setH(px(cur)); stage.pad(lastPad); });
  go(cur, { save: false, pan: false });
  return { mode: 'd2', go, grip };
}
