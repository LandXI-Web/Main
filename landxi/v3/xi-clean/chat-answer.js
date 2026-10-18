/* XI ChatGEO 자리 — 입력 한 줄 + 답 띠(두 줄) · 대화 전체는 오른쪽 서랍 '대화 n' (10-18 원칙 290 "깔끔한건 일단 1안이다" → 기본)
   공용 kit 는 그대로 — XI맵 화면이 밖에서 덧붙인다. 지도 위에는 입력 한 줄과 답 띠 한 장만, 긴 대화 칸은 두지 않는다(chat-answer.css).
   답의 숫자 · 자리는 지도 위 꼬리표 · 한 줄 통계가 맡고, 답 띠는 그것을 한 문장으로 받쳐 주는 자막이다.
   같은 답 안에서 지도 동작 줄(✓ 통계 보기)과 단추(통계 보기)가 같은 말이면 줄은 숨긴다(서랍 안 대화에서). */
import * as K from '../kit/index.js';

const { h } = K;
const nf = (n) => Number(n).toLocaleString('ko-KR');

export function mountChatAnswer({ host, cmdk, hl = null }) {
  const box = cmdk?.el; if (!host || !box) return null;
  const root = host.querySelector('.k-chat-root[data-dock]'); if (!root) return null;
  const log = root.querySelector('.k-chat-b'), sugg = box.querySelector('.k-chat-sugg'); if (!log) return null;
  const txt = h('p.xk-ans-t'), acts = h('div.xk-ans-a'), more = h('button.xk-more', { type: 'button', text: '대화', onclick: () => openDrawer() });
  const card = h('div.xk-ans', { hidden: true }, h('span.xk-ans-i', { 'aria-hidden': 'true', text: 'XI' }), h('div.xk-ans-m', {}, txt, acts), h('button.xk-ans-x', { type: 'button', 'aria-label': '답 띠 닫기', text: '×', onclick: () => { card.hidden = true; hl?.clear(); } }));   // 답 띠를 닫으면 지도 강조도 걷는다(원칙 292)
  (sugg || box.querySelector('.k-chat-in')).before(card);
  let drawer = null, home = null;   // 서랍이 열려 있는 동안 답 띠는 숨긴다(10-18 제안-서랍열면답띠숨김 '넣음' — 같은 답이 두 곳에 보이지 않게)
  const turns = () => log.querySelectorAll('.k-chat-msg.me').length;
  function dedupe() {
    for (const bub of log.querySelectorAll('.k-chat-msg.ai .k-chat-bub')) {
      const btns = new Set([...bub.querySelectorAll('.k-chat-btn[data-q], .k-chat-chip[data-q]')].map((b) => b.textContent.trim()));
      for (const ul of bub.querySelectorAll('.k-chat-plan, .k-ck-plan')) {
        let left = 0;
        for (const li of ul.querySelectorAll('li')) { const dup = btns.has(li.textContent.trim()); if (li.classList.contains('xc-dup') !== dup) li.classList.toggle('xc-dup', dup); if (!dup) left++; }
        if (ul.classList.contains('xc-empty') !== (left === 0)) ul.classList.toggle('xc-empty', left === 0);
      }
    }
  }
  function paint() {
    const st = box.dataset.state;
    const last = [...log.querySelectorAll('.k-chat-msg.ai')].pop();
    if (drawer) { card.hidden = true; linkDrawer(); return; }
    if (st === 'busy') { card.hidden = false; card.classList.add('is-busy'); txt.textContent = '답을 찾는 중'; acts.replaceChildren(h('span.xk-ans-bar')); return; }
    dedupe();
    if (!last || last.classList.contains('k-chat-intro')) { card.hidden = true; return; }
    card.classList.remove('is-busy');
    const a = last.querySelector('.k-chat-a, .k-ck-a') || last.querySelector('.k-chat-bub p') || last.querySelector('.k-chat-bub');
    txt.innerHTML = a ? a.innerHTML : '';
    for (const el of txt.querySelectorAll('br')) el.replaceWith(' ');
    const btns = [...last.querySelectorAll('.k-chat-btn[data-q], .k-chat-chip[data-q]')].slice(0, 2).map((b, i) => h(`button.k-chat-btn${i === 0 ? '.is-1' : ''}`, { type: 'button', 'data-q': b.dataset.q, text: b.textContent.trim() }));   // 같은 data-q → 공용 kit 가 처리
    more.textContent = `대화 ${nf(turns())}`;
    acts.replaceChildren(...btns, more);
    card.hidden = false;
    if (hl && hl.cur?.run && hl.cur.run === box.dataset.run) { hl.link(txt); if (a) hl.link(a); }   // 답의 이름 · 숫자 ↔ 지도(원칙 292) — 이 답이 보낸 곳만
  }
  /** 서랍 안 대화 — 지금 강조를 보낸 답의 글도 지도와 잇는다 */
  function linkDrawer() {
    if (!hl?.cur?.run) return;
    const last = [...log.querySelectorAll('.k-chat-msg.ai')].pop();
    if (last && hl.cur.run === box.dataset.run) hl.link(last.querySelector('.k-chat-a, .k-ck-a') || last.querySelector('.k-chat-bub'));
  }
  function openDrawer() {
    if (drawer) { drawer.close(); return; }
    home = log.parentElement;
    drawer = K.drawer({ title: 'XI ChatGEO · 대화', host, slot: 'right', onClose: () => { drawer = null; if (home) home.append(log); log.querySelectorAll('.k-chat-msg').forEach((m) => { m.style.display = ''; }); paint(); setTimeout(() => window.__xc?.relayout?.(), 60); } });
    drawer.body.classList.add('xk-dlog'); drawer.body.append(log);
    card.hidden = true; linkDrawer();                                                   // 서랍이 열리면 답 띠는 숨김 · 닫으면 paint 가 되돌린다
    requestAnimationFrame(() => { log.scrollTop = log.scrollHeight; });
    setTimeout(() => window.__xc?.relayout?.(), 420);   // 서랍이 선 자리를 피해 입력 줄 · 답 띠가 비켜 선다
  }
  let q = 0;
  new MutationObserver((ms) => { if (ms.every((m) => card.contains(m.target))) return; cancelAnimationFrame(q); q = requestAnimationFrame(paint); }).observe(box, { attributes: true, attributeFilter: ['data-state'], childList: true, subtree: true });
  new ResizeObserver(() => host.style.setProperty('--xk-ah', (card.hidden ? 0 : card.offsetHeight + 8) + 'px')).observe(card);   // 좁은 화면 — 통계 판이 답 띠 위로 올라서는 높이
  paint();
  return { card, openDrawer };
}
