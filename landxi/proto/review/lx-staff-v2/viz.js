/* 도넛 — <div class="dn" data-parts="220,104,18,6,2" data-colors="p1,p2,p3,p5,p4" data-center="350" data-label="끝난 작업"> 의 .dn-svg 자리에 그린다.
   값은 HTML 에 적힌 서버 값 그대로(숫자 한 출처) — 여기서는 비율만 계산한다. */
(function () {
  const COL = { p1: '#0B7F78', p2: '#2F6FE4', p3: '#E0A526', p4: '#8A8F98', p5: '#7B61FF', p6: '#C7CBD1' };
  document.querySelectorAll('[data-parts]').forEach((el) => {
    const parts = el.dataset.parts.split(',').map(Number);
    const cols = el.dataset.colors.split(',');
    const total = parts.reduce((a, b) => a + b, 0) || 1;
    const R = 44, C = 2 * Math.PI * R, SW = 16;
    let off = 0;
    let arcs = '';
    parts.forEach((v, i) => {
      const len = (v / total) * C;
      if (len > 0) arcs += `<circle r="${R}" cx="60" cy="60" fill="none" stroke="${COL[cols[i]] || cols[i]}" stroke-width="${SW}" stroke-dasharray="${Math.max(len - 1.5, 0.5)} ${C}" stroke-dashoffset="${-off}" transform="rotate(-90 60 60)"/>`;
      off += len;
    });
    const lab = el.dataset.label || '';
    const svg = `<svg viewBox="0 0 120 120" role="img" aria-label="${lab} ${el.dataset.center || ''}"><circle r="${R}" cx="60" cy="60" fill="none" stroke="#EEF1F4" stroke-width="${SW}"/>${arcs}<text class="c" x="60" y="${lab ? 60 : 69}" text-anchor="middle">${el.dataset.center || ''}</text>${lab ? `<text class="cl" x="60" y="78" text-anchor="middle">${lab}</text>` : ''}</svg>`;
    const slot = el.querySelector('.dn-svg') || el;
    slot.insertAdjacentHTML('afterbegin', svg);
  });
})();
