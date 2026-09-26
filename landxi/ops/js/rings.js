/* 데이터 링(법전 §4 Ops --ring) — 스트로크 6 · 트랙 슬레이트 · 값 액센트 · 주의 앰버 · 장애 경고. 파이/도넛 아님(비율 한 개 + 띠).
 * ring(host, {size}) → { set({total, segs, ticks, ghost}), state({caution, fault, stale, void}), center } — 호는 500 --e-arrive 로만 움직인다(값이 바뀔 때). */
const NS = 'http://www.w3.org/2000/svg';
const el = (t, a = {}) => { const e = document.createElementNS(NS, t); for (const [k, v] of Object.entries(a)) e.setAttribute(k, v); return e; };

export function ring(host, { size = 120, stroke = 6, label = '' } = {}) {
  const r = (size - stroke) / 2 - 2; const C = 2 * Math.PI * r; const cx = size / 2;
  const wrap = document.createElement('div'); wrap.className = 'og-ring'; wrap.style.width = size + 'px'; wrap.style.height = size + 'px';
  if (label) wrap.setAttribute('aria-label', label);
  wrap.setAttribute('role', 'img');
  const svg = el('svg', { width: size, height: size, viewBox: `0 0 ${size} ${size}` });
  const g = el('g', { transform: `rotate(-90 ${cx} ${cx})` });
  g.append(el('circle', { class: 'rg-track', cx, cy: cx, r, 'stroke-width': stroke }));
  const segLayer = el('g'); const tickLayer = el('g'); const ghost = el('path', { class: 'rg-seg', 'data-kind': 'ghost', 'stroke-width': stroke, fill: 'none', opacity: 0 });
  g.append(segLayer, ghost, tickLayer); svg.append(g);
  const center = document.createElement('div'); center.className = 'rg-center';
  wrap.append(svg, center); host.append(wrap);
  const segs = new Map();
  const arc = (a, b) => {  // 분수 a→b 호 path
    const A = a * 2 * Math.PI, B = Math.max(a + 0.0001, b) * 2 * Math.PI;
    const p = (t) => [cx + r * Math.cos(t), cx + r * Math.sin(t)];
    const [x0, y0] = p(A), [x1, y1] = p(B);
    return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${B - A > Math.PI ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
  };
  const api = {
    el: wrap, center, C,
    /** segs: [{id, kind:'value'|'ext'|'ai'|'caution', from, to}] 분수(0..1) · ticks: [{kind:'soft'|'hard'|'caution', at}] · ghost:{from,to}|null */
    set({ segs: list = [], ticks = [], ghost: gh = null } = {}) {
      const seen = new Set();
      for (const s of list) {
        seen.add(s.id);
        let c = segs.get(s.id);
        if (!c) { c = el('circle', { class: 'rg-seg', cx, cy: cx, r, 'stroke-width': stroke, 'data-kind': s.kind, 'stroke-dasharray': `0 ${C}`, 'stroke-dashoffset': 0 }); segLayer.append(c); segs.set(s.id, c); c.getBoundingClientRect(); }
        c.setAttribute('data-kind', s.kind);
        const a = Math.max(0, Math.min(1, s.from || 0)); const b = Math.max(a, Math.min(1, s.to || 0));
        const da = `${((b - a) * C).toFixed(2)} ${C.toFixed(2)}`; const off = (-a * C).toFixed(2);
        if (c.getAttribute('stroke-dasharray') !== da) c.setAttribute('stroke-dasharray', da);
        if (c.getAttribute('stroke-dashoffset') !== off) c.setAttribute('stroke-dashoffset', off);
        if (s.title) c.innerHTML = `<title>${s.title}</title>`;
      }
      for (const [id, c] of segs) if (!seen.has(id)) { c.remove(); segs.delete(id); }
      tickLayer.replaceChildren(...ticks.filter((k) => k.at != null && k.at >= 0 && k.at <= 1).map((k) => {
        const t = k.at * 2 * Math.PI; const r0 = r - stroke, r1 = r + stroke;
        return el('line', { class: 'rg-tick', 'data-kind': k.kind || 'hard', x1: cx + r0 * Math.cos(t), y1: cx + r0 * Math.sin(t), x2: cx + r1 * Math.cos(t), y2: cx + r1 * Math.sin(t) });
      }));
      if (gh && gh.to > gh.from) { ghost.setAttribute('d', arc(Math.max(0, gh.from), Math.min(1, gh.to))); ghost.setAttribute('opacity', 1); ghost.setAttribute('data-kind', 'ghost'); if (gh.caution) ghost.style.stroke = 'var(--cw-caution)'; else ghost.style.stroke = ''; }
      else ghost.setAttribute('opacity', 0);
      return api;
    },
    state({ caution = false, fault = false, stale = false, void: v = false } = {}) {
      wrap.dataset.caution = caution ? '1' : '0'; wrap.dataset.fault = fault ? '1' : '0'; wrap.dataset.stale = stale ? '1' : '0'; wrap.dataset.void = v ? '1' : '0';
      return api;
    },
  };
  return api;
}
