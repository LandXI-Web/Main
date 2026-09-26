/* swipe.js — 7문법 #5 가르기(E0-S S6 승격). 지도 2(A 원본 · B 원본+결과 또는 다른 시점) 동기 · clip-path inset(0 0 0 var(--swipe))
   손잡이 끌기 · ←/→ ±4 % · 6–94 % · 양쪽 상단 출처 칩 · ?swipe= . 캔버스 2 상한. */
export function swipe({ A, B, wrap, handle, chipL, chipR, onChange, onUrl }) {
  const S = { v: 50, on: false, drag: false };
  const sync = () => { if (S.on) B.jumpTo({ center: A.getCenter(), zoom: A.getZoom(), pitch: A.getPitch(), bearing: A.getBearing() }); };
  const apply = (v, url = true) => {
    S.v = Math.max(6, Math.min(94, Math.round(v * 10) / 10));
    wrap.style.setProperty('--swipe', S.v + '%');
    document.documentElement.style.setProperty('--swipe', S.v + '%');
    handle.style.left = S.v + '%';
    handle.setAttribute('aria-valuenow', String(Math.round(S.v)));
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
  return {
    S,
    open(v = S.v, { left, right } = {}) {
      S.on = true; sync();
      wrap.hidden = false; wrap.classList.add('is-swipe');
      handle.hidden = false; chipL.hidden = false; chipR.hidden = false;
      if (left) chipL.innerHTML = left; if (right) chipR.innerHTML = right;
      B.resize(); apply(v, false);
    },
    close() { S.on = false; wrap.classList.remove('is-swipe'); wrap.hidden = true; handle.hidden = true; chipL.hidden = true; chipR.hidden = true; },
    set: apply,
    chips(left, right) { chipL.innerHTML = left; chipR.innerHTML = right; },
  };
}
