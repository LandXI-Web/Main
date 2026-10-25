/* XI ChatGEO 대화 단추 자리 — 임시 고침(10-22 원칙 309 · FARM-ADMIN IMPL 0-4 · G1 · G1' · G7 · G8). 구조(대화 단추를 레일로 · 창을 오른쪽 기둥 서랍으로)는 now 22 Q4 뒤.
   · 휴대폰(≤ 640) — 떠 있는 단추가 시트 · 카드 · 본문 글을 덮던 것 → 아래 메뉴 줄의 'ChatGEO' 칸(레일이 있는 화면만 · 누르면 같은 대화 창).
     대화 창(아래 시트)이 열리면 다른 아래 시트(필지 카드 칸 · 행정정보 시트 · 서랍)는 잠시 접힌다(한 자리 하나 · 창을 닫으면 그대로).
   · PC — 단추 자리 재기는 cmdk.js 한 곳. 다만
       ① 흐름 안에 선 오른쪽 칸(필지 목록의 지도 + 필지 카드 .gr-side)에 카드가 열려 있으면 단추를 카드 위(칸 안 지도 위)로 올리고,
          대화 창은 그 칸 왼쪽에 세운다(카드 · 창이 겹치지 않게 — G1).
       ② 대화 창을 닫은 뒤에는 자리를 다시 재게 한다(창이 열려 있는 동안 굳어 있던 자리 — 서랍 · 시트 위에 남던 것).
       ③ PC 에서 왼쪽 레일에 빈 자리가 있으면 단추는 늘 그 자리(창은 레일 옆) — 본문이 늦게 그려져도 자리가 바뀌지 않게(10-25 검사 문).
          레일 빈 자리가 없을 때만 cmdk 가 고른 자리(오른쪽 아래).
   지도 화면(아래 채팅 창 · data-dock)은 건드리지 않는다(xi-clean layoutNow). */
const PHONE = () => matchMedia('(max-width: 640px)').matches;
let css = false;
function style() {
  if (css) return; css = true;
  const s = document.createElement('style');
  s.textContent = `
.k-rail .k-rail-chat{display:none!important}
.k-chat-root[data-lift]:not([data-dock]){--k-chat-b:var(--k-lift-b)!important;--k-chat-r:var(--k-lift-r)!important}
.k-chat-root[data-lift]:not([data-dock]) .k-ck.k-chat{right:var(--k-col-r)!important;bottom:24px!important;max-height:calc(100vh - 128px)!important}
.k-chat-root[data-railfab]:not([data-dock]) .k-chat-fab{right:auto!important;left:var(--k-rf-l)!important;bottom:var(--k-rf-b)!important;transition:none!important}
.k-chat-root[data-railfab]:not([data-dock]) .k-chat-tag{display:none!important}
.k-chat-root[data-railfab]:not([data-dock]) .k-ck.k-chat{right:auto!important;left:calc(var(--k-rf-l) + 72px)!important;bottom:16px!important;max-height:calc(100vh - 112px)!important}
@media (max-width:640px){
  body:has(.k-rail-chat) .k-chat-root:not([data-dock]) :is(.k-chat-fab,.k-chat-tag){display:none!important}
  body:not(:has(.k-chat-root[data-dock])) .k-rail .k-rail-chat{display:flex!important}
  body:has(.k-chat-root[data-open]:not([data-dock])) :is(.gr-side,.gf-sheet,.k-drawer.is-open){visibility:hidden}
}`;
  document.head.append(s);
}
/** 흐름 안 오른쪽 칸 + 그 안의 열린 카드(지도 아래) — 단추를 올릴 자리(px · 화면 아래에서) */
function liftOf() {
  const col = document.querySelector('.gr-side');
  if (!col || PHONE()) return null;
  const cs = getComputedStyle(col); if (cs.display === 'none' || cs.visibility === 'hidden' || cs.position === 'fixed') return null;
  const c = col.getBoundingClientRect();
  if (c.right < innerWidth - 96 || c.width < 200) return null;
  const card = [...col.querySelectorAll('.gr-det:not([hidden]), #det-x:not([hidden])')].map((e) => e.getBoundingClientRect()).filter((r) => r.height > 40).sort((a, b) => a.top - b.top)[0];
  if (!card) return null;
  const room = card.top - c.top;                                   // 카드 위 지도 높이
  if (room < 56 + 32) return null;
  return { b: Math.round(innerHeight - card.top + 12), r: Math.round(innerWidth - c.right + 16), colR: Math.round(innerWidth - c.left + 16) };
}
/** 레일의 빈 자리 — 보이는 레일 칸(위 묶음 · 아래 묶음 · 더보기 · 기관 정보 · 계정 무엇이든)들 사이의 가장 큰 빈 틈에만, 단추 56 이 칸과 8 띄워 들어가면 그 자리.
    칸 이름(클래스)에 기대지 않고 실제 자리로 잰다 — 늦게 그려진 칸(더보기 · 기관 정보)도 덮지 않게(10-24 검사 문: 기관 1280 '기관 정보' 덮음) */
function railSpot(rail) {
  if (!rail) return null;
  const rr = rail.getBoundingClientRect(); if (rr.width < 60 || rr.height < 300) return null;
  const qs = [];
  for (const it of rail.children) {
    const c = getComputedStyle(it); if (c.display === 'none' || c.visibility === 'hidden') continue;
    const q = it.getBoundingClientRect(); if (q.height && q.width) qs.push(q);
  }
  qs.push({ top: rr.bottom, bottom: rr.bottom });                 // 마지막 칸 아래 ~ 레일 끝도 빈 자리(예전과 같이)
  qs.sort((x, y) => x.top - y.top);
  let best = null;
  for (let i = 0; i + 1 < qs.length; i++) {
    const top = qs[i].bottom + 8, bottom = qs[i + 1].top - 8;
    if (bottom - top >= 56 && (!best || bottom - top > best.bottom - best.top)) best = { top, bottom };
  }
  if (!best) return null;
  return { l: Math.round(rr.left + (rr.width - 56) / 2), b: Math.round(innerHeight - best.bottom) };
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
    /* ③ 꽉 찬 화면 — cmdk 가 자리를 정할 때마다(root 의 style) 덮는지 보고, 덮으면 레일 빈 아래쪽으로 */
    let rq = 0;
    const railFab = () => {
      clearTimeout(rq);
      rq = setTimeout(() => {
        if (PHONE() || root.hasAttribute('data-lift')) { if (root.hasAttribute('data-railfab')) root.removeAttribute('data-railfab'); return; }
        // 자리는 늘 같은 규칙(10-25 검사 문: 1280 프로젝트 목록 — 카드가 늦게 그려지면 '덮는가'를 다시 재지 못해 단추가 카드를 덮음):
        // 레일에 빈 자리가 있으면 늘 레일 빈 자리(덮는지 재지 않음 · 늦게 그려지는 본문과 상관없이) · 레일 빈 자리가 없을 때만 예전처럼 덮는지 보고 그대로
        const spot = railSpot(railEl);
        if (!spot) { if (root.hasAttribute('data-railfab')) root.removeAttribute('data-railfab'); return; }
        for (const [k, v] of [['--k-rf-l', spot.l + 'px'], ['--k-rf-b', spot.b + 'px']]) if (root.style.getPropertyValue(k) !== v) root.style.setProperty(k, v);
        if (!root.hasAttribute('data-railfab')) root.setAttribute('data-railfab', '');   // 자리 값을 먼저 · 옮김은 미끄러짐 없이 바로(레일 위를 지나가며 칸을 덮지 않게)
      }, 120);
    };
    new MutationObserver(railFab).observe(root, { attributes: true, attributeFilter: ['style', 'data-lift'] });
    if (railEl) new MutationObserver(railFab).observe(railEl, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden', 'style'] });   // 레일 칸이 늦게 서도 다시 잰다
    addEventListener('resize', railFab); addEventListener('scroll', railFab, true);
    railFab();
    /* ① 오른쪽 칸 카드 위로(칸은 화면이 나중에 그린다 — 몸 전체 변화를 보되 칸 안 변화일 때만 잰다) */
    let raf = 0;
    const lift = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const l = liftOf();
        if (!l) { root.removeAttribute('data-lift'); return; }
        root.setAttribute('data-lift', '');
        root.style.setProperty('--k-lift-b', l.b + 'px'); root.style.setProperty('--k-lift-r', l.r + 'px'); root.style.setProperty('--k-col-r', l.colR + 'px');
      });
    };
    new MutationObserver((ms) => { if (ms.some((m) => !root.contains(m.target) && (m.target.closest?.('.gr-side') || m.target.querySelector?.('.gr-side') || m.target === document.body))) lift(); })
      .observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'class', 'style', 'data-big', 'data-sheet'] });
    addEventListener('resize', lift);
    lift();
  };
  watch();
}
