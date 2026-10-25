/* XI ChatGEO 대화 단추 자리 — 임시 고침(10-22 원칙 309 · FARM-ADMIN IMPL 0-4 · G1 · G1' · G7 · G8). 구조(대화 단추를 레일로 · 창을 오른쪽 기둥 서랍으로)는 now 22 Q4 뒤.
   · 휴대폰(≤ 640) — 떠 있는 단추가 시트 · 카드 · 본문 글을 덮던 것 → 아래 메뉴 줄의 'ChatGEO' 칸(레일이 있는 화면만 · 누르면 같은 대화 창).
     대화 창(아래 시트)이 열리면 다른 아래 시트(필지 카드 칸 · 행정정보 시트 · 서랍)는 잠시 접힌다(한 자리 하나 · 창을 닫으면 그대로).
   · PC — 단추 자리는 cmdk.js 한 곳 · 늘 오른쪽 아래 같은 자리(10-25 사용자 "ChatGEO 마크가 왜 갑자기 왼쪽에 있지?" · 원칙 338).
       레일 빈 자리로 옮기기 · 오른쪽 칸 카드 위로 올리기는 뺐다 — 겹침은 단추를 옮기지 않고 자리를 비워 두어 푼다:
       ① 단추 길(k-chat-lane) — PC 셸 화면은 본문 오른쪽에 단추 폭만큼 빈 길을 두고 단추는 그 길 아래에 선다(본문이 스크롤해도 단추 밑에 오지 않는다).
          지도가 본문 대부분을 채우는 화면(지도 위 단추 — 지도는 덮어도 된다)은 길을 두지 않는다.
       ② 오른쪽 칸(필지 목록의 지도 + 필지 카드 .gr-side)에 카드가 열려 있으면 대화 '창'만 그 칸 왼쪽에 세운다(단추는 그대로 · 창과 카드가 겹치지 않게 — G1).
       대화 창을 닫은 뒤에는 자리를 다시 재게 한다(창이 열려 있는 동안 굳어 있던 자리 — 서랍 · 시트 위에 남던 것).
   지도 화면(아래 채팅 창 · data-dock)은 건드리지 않는다(xi-clean layoutNow). */
const PHONE = () => matchMedia('(max-width: 640px)').matches;
let css = false;
function style() {
  if (css) return; css = true;
  const s = document.createElement('style');
  s.textContent = `
.k-rail .k-rail-chat{display:none!important}
@media (min-width:641px){body.k-chat-lane .k-app .k-main{margin-right:var(--k-chat-lane,64px)}}
.k-chat-root[data-win]:not([data-dock]) .k-ck.k-chat{right:var(--k-col-r)!important;bottom:24px!important;max-height:calc(100vh - 128px)!important}
@media (max-width:640px){
  body:has(.k-rail-chat) .k-chat-root:not([data-dock]) :is(.k-chat-fab,.k-chat-tag){display:none!important}
  body:not(:has(.k-chat-root[data-dock])) .k-rail .k-rail-chat{display:flex!important}
  body:has(.k-chat-root[data-open]:not([data-dock])) :is(.gr-side,.gf-sheet,.k-drawer.is-open){visibility:hidden}
}`;
  document.head.append(s);
}
/** 오른쪽 칸 + 그 안의 열린 카드 — 대화 창을 세울 자리(칸 왼쪽 · px 화면 오른쪽에서) */
function colOf() {
  const col = document.querySelector('.gr-side');
  if (!col || PHONE()) return null;
  const cs = getComputedStyle(col); if (cs.display === 'none' || cs.visibility === 'hidden' || cs.position === 'fixed') return null;
  const c = col.getBoundingClientRect();
  if (c.right < innerWidth - 160 || c.width < 200) return null;
  const card = [...col.querySelectorAll('.gr-det:not([hidden]), #det-x:not([hidden])')].some((e) => e.getBoundingClientRect().height > 40);
  return card ? Math.round(innerWidth - c.left + 16) : null;
}
/** 단추 길이 필요한 화면인가 — 셸 본문이 있고, 지도가 본문 대부분(60% 넘게)을 채우지 않는 화면 */
function wantLane(root) {
  if (PHONE() || !root || root.hidden || root.dataset.dock) return false;
  const main = document.querySelector('.k-app .k-main'); if (!main) return false;
  const m = main.getBoundingClientRect(); if (!m.width || !m.height) return false;
  for (const el of main.querySelectorAll('.maplibregl-map, .k-stage')) {
    const r = el.getBoundingClientRect();
    if (r.width * r.height > 0.6 * m.width * m.height) return false;
  }
  return true;
}
/** railEl = 셸 레일(아래 메뉴 줄 · 없으면 null) — 셸이 다시 그려도(drawRail) 칸을 다시 붙인다 */
export function mountChatDock(railEl) {
  style();
  if (railEl) {
    const item = () => {
      if (railEl.querySelector('.k-rail-chat')) return;
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'k-rail-i k-rail-chat'; b.setAttribute('aria-label', 'XI ChatGEO');
      b.innerHTML = '<i class="k-rail-g" aria-hidden="true">XI</i><span>ChatGEO</span>';
      b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); document.querySelector('.k-chat-root:not([data-dock]) .k-chat-fab')?.click(); });
      const more = railEl.querySelector('.k-rail-more');
      if (more) railEl.insertBefore(b, more); else railEl.append(b);
    };
    item();
    new MutationObserver(() => item()).observe(railEl, { childList: true });
  }
  const watch = () => {
    const root = document.querySelector('.k-chat-root');
    if (!root) { setTimeout(watch, 500); return; }
    if (root.dataset.dock) return;
    /* ② 창을 닫으면(cmdk 가 data-open 을 뗀다) 자리를 다시 잰다 — cmdk 는 창 크기 변화에 자리를 다시 잰다 */
    let was = root.hasAttribute('data-open');
    new MutationObserver(() => {
      const now = root.hasAttribute('data-open');
      if (was && !now && !root.dataset.dock) setTimeout(() => dispatchEvent(new Event('resize')), 60);
      was = now;
    }).observe(root, { attributes: true, attributeFilter: ['data-open'] });
    /* ① 단추 길 · ② 창 자리 — 화면이 늦게 서므로 몸 변화 · 창 크기마다 다시 잰다(값이 바뀔 때만 고친다 — 되풀이 없음) */
    let t = 0;
    const lay = () => {
      clearTimeout(t);
      t = setTimeout(() => {
        const lane = wantLane(root);
        if (document.body.classList.contains('k-chat-lane') !== lane) { document.body.classList.toggle('k-chat-lane', lane); dispatchEvent(new Event('resize')); }
        const r = colOf();
        if (r === null) { if (root.hasAttribute('data-win')) root.removeAttribute('data-win'); }
        else { if (root.style.getPropertyValue('--k-col-r') !== r + 'px') root.style.setProperty('--k-col-r', r + 'px'); if (!root.hasAttribute('data-win')) root.setAttribute('data-win', ''); }
      }, 80);
    };
    new MutationObserver((ms) => { if (ms.some((m) => !root.contains(m.target))) lay(); })
      .observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'class', 'data-big', 'data-sheet'] });
    new MutationObserver(lay).observe(root, { attributes: true, attributeFilter: ['hidden', 'data-dock'] });
    addEventListener('resize', lay);
    lay();
  };
  watch();
}
