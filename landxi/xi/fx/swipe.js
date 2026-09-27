/* swipe.js — 7문법 #5 가르기(E0-S S6 승격). 지도 2(A 원본 · B 원본+결과 또는 다른 시점) 동기 · clip-path inset(0 0 0 var(--swipe))
   손잡이 끌기 · ←/→ ±4 % · 6–94 % · 양쪽 상단 출처 칩 · ?swipe= . 캔버스 2 상한.
   F2 통합(F2-A must_fix):
   ① 여는 순간 B 타일이 아직 없으면 오른쪽 판이 백지로 번쩍인다 → B 를 opacity 0 으로 켜고 B 'idle'(areTilesLoaded) 뒤 380 ms 페이드(gateIn 과 같은 재질).
   ② 그립(40×40)이 HUD·에이전트·카드 유리 위에 앉아 글자를 가리지 않게 — 그립 세로 위치를 유리 실측으로 계획(planCard 방식).
      그립은 z 5(HUD·카드·패널 유리 아래)이므로 세로선도 유리 밑을 지난다. */
const OBST = '.xi-hud > :not([hidden]), #agent-slot > *, .xi-panel, .xi-card:not([hidden]), .sv-card:not([hidden]), .sv-drawer:not([hidden]), .xi-drawer:not([hidden]), .xi-scrub, .xi-mast, .xi-search, .xi-modesw:not([hidden]), .xi-gauge';
const GAP = 28, R = 20;
export function swipe({ A, B, wrap, handle, chipL, chipR, onChange, onUrl }) {
  const S = { v: 50, on: false, drag: false, tok: 0, top: null };
  const sync = () => { if (S.on) B.jumpTo({ center: A.getCenter(), zoom: A.getZoom(), pitch: A.getPitch(), bearing: A.getBearing() }); };
  /** 그립 중심 y — 화면 가운데에서 시작해 유리(HUD·카드·패널)와 겹치면 그 아래(+28)로, 바닥에 닿으면 위로 */
  const plan = () => {
    if (handle.hidden) return;
    const wr = wrap.getBoundingClientRect();
    const x = wr.left + wr.width * S.v / 100;
    const rects = [...document.querySelectorAll(OBST)].map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0 && r.left < x + R + 8 && r.right > x - R - 8);
    const H = innerHeight, lo = R + 16, hi = H - R - 16;
    const hit = (y) => rects.find((r) => r.top < y + R + 8 && r.bottom > y - R - 8);
    let y = H / 2, b;
    for (let i = 0; i < 8 && (b = hit(y)); i++) y = b.bottom + GAP + R;          // 아래로
    if (y > hi || hit(y)) {                                                       // 바닥 → 가운데에서 위로
      y = H / 2;
      for (let i = 0; i < 8 && (b = hit(y)); i++) y = b.top - GAP - R;
    }
    y = Math.max(lo, Math.min(hi, y));
    S.top = Math.round(y);
    handle.style.top = S.top + 'px';
    handle.dataset.planned = hit(y) ? 'overlap' : 'clear';
  };
  const apply = (v, url = true) => {
    S.v = Math.max(6, Math.min(94, Math.round(v * 10) / 10));
    wrap.style.setProperty('--swipe', S.v + '%');
    document.documentElement.style.setProperty('--swipe', S.v + '%');
    handle.style.left = S.v + '%';
    handle.setAttribute('aria-valuenow', String(Math.round(S.v)));
    plan();
    onChange && onChange(S.v);
    if (url) onUrl && onUrl(Math.round(S.v));
  };
  const onMove = (ev) => { if (!S.drag) return; const r = wrap.getBoundingClientRect(); apply(((ev.clientX - r.left) / r.width) * 100); };
  handle.addEventListener('pointerdown', (ev) => { S.drag = true; handle.setPointerCapture(ev.pointerId); handle.dataset.drag = '1'; });
  handle.addEventListener('pointermove', onMove);
  handle.addEventListener('pointerup', () => { S.drag = false; delete handle.dataset.drag; });
  handle.addEventListener('keydown', (ev) => {
    if (ev.key === 'ArrowRight') { ev.preventDefault(); apply(S.v + 4); }
    if (ev.key === 'ArrowLeft') { ev.preventDefault(); apply(S.v - 4); }
  });
  A.on('move', sync);
  // 유리 크기가 바뀌면(HUD 작업 줄 · 에이전트 패널 · 카드) 그립 위치를 다시 계획
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { if (S.on && !S.drag) plan(); }) : null;
  for (const id of ['hud', 'agent-slot', 'hud-bot']) { const e = document.getElementById(id); if (e && ro) ro.observe(e); }
  addEventListener('resize', () => { if (S.on) plan(); });
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  /** B 가 그릴 준비(타일 적재 · idle)가 될 때까지 — 상한 1500 ms(그 뒤엔 있는 것으로) */
  const bReady = () => new Promise((res) => {
    let done = false; const fin = (why) => { if (done) return; done = true; clearTimeout(t); res(why); };
    const t = setTimeout(() => fin('timeout'), 1500);
    const check = () => { try { if (B.loaded() && B.areTilesLoaded()) return fin('tiles'); } catch { /* */ } B.once('idle', () => fin('idle')); };
    requestAnimationFrame(() => requestAnimationFrame(check));                       // resize·jumpTo 가 타일 요청을 낸 다음 프레임에 판정
  });
  return {
    S,
    open(v = S.v, { left, right } = {}) {
      const tok = ++S.tok;
      S.on = true; sync();
      wrap.style.transition = 'none'; wrap.style.opacity = '0'; wrap.dataset.gate = 'wait';
      wrap.hidden = false; wrap.classList.add('is-swipe');
      handle.hidden = false; chipL.hidden = false; chipR.hidden = false;
      if (left) chipL.innerHTML = left; if (right) chipR.innerHTML = right;
      B.resize(); apply(v, false);
      const t0 = performance.now();
      return bReady().then((why) => {
        if (tok !== S.tok || !S.on) return;
        S.gate = { why, ms: Math.round(performance.now() - t0) };
        wrap.dataset.gate = why;
        wrap.style.transition = reduced() ? 'none' : 'opacity 380ms var(--e-ui, cubic-bezier(.22,1,.36,1))';
        wrap.style.opacity = '1';
      });
    },
    close() { S.tok++; S.on = false; wrap.classList.remove('is-swipe'); wrap.hidden = true; wrap.style.opacity = ''; wrap.style.transition = ''; delete wrap.dataset.gate; handle.hidden = true; chipL.hidden = true; chipR.hidden = true; },
    set: apply,
    plan,
    chips(left, right) { chipL.innerHTML = left; chipR.innerHTML = right; },
  };
}
