/* filament.js — 7문법 #6 필라멘트: 격자·구역 집계를 1px 수직선으로(높이 = 값 · 알파 .35–.9 · 하단 흰 → 상단 청록).
   XI맵에서는 남원 읍면동 39 의 P4 집계(emd-stats · AI 추론)를 z < 11.8 에서 세운다 — 도시 전체를 한눈에(kepler 3D 틸트 장치의 2D 판).
   SVG 한 장 · 카메라가 움직일 때만 다시 그린다(유휴 모션 0). */
export function filament(map, host, { points, valueKey, maxZ = 11.8, maxH = 140 }) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'xi-filament'); svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = '<defs><linearGradient id="xi-fil-g" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#0FA9A0"/></linearGradient></defs><g></g>';
  host.appendChild(svg);
  const g = svg.querySelector('g');
  const max = Math.max(1, ...points.map((p) => p[valueKey] || 0));
  let on = true;
  const draw = () => {
    const z = map.getZoom();
    svg.style.display = on && z < maxZ ? '' : 'none';
    if (svg.style.display) return;
    const k = Math.max(0, Math.min(1, (maxZ - z) / 1.2));
    g.innerHTML = points.map((p) => {
      const v = p[valueKey] || 0, h = (v / max) * maxH * k, c = map.project(p.lngLat), a = 0.35 + 0.55 * (v / max);
      return `<line x1="${c.x.toFixed(1)}" x2="${c.x.toFixed(1)}" y1="${c.y.toFixed(1)}" y2="${(c.y - h).toFixed(1)}" stroke="url(#xi-fil-g)" stroke-opacity="${a.toFixed(2)}" stroke-width="1"/><circle cx="${c.x.toFixed(1)}" cy="${(c.y - h).toFixed(1)}" r="1.5" fill="#0FA9A0" fill-opacity="${a.toFixed(2)}"/>`;
    }).join('');
  };
  map.on('move', draw); draw();
  return { set(v) { on = v; draw(); }, el: svg };
}
