// 타일 그림 — 비이미지 자산도 타일이다(마스터 B5 장치 9·10).
//   · SHP  = 실좌표 GeoJSON 실루엣(캔버스). 마스터 유보 3: 판이 아니라 실좌표 렌더.
//   · XLSX = 첫 행 미리보기(results.js 필드).
//   · ZIP  = 파일 트리.
//   · 그림도 좌표도 없으면 점선 무채 액자 + 이유 한 줄 — 그럴듯한 그림으로 채우지 않는다.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const cache = new Map();
/** GeoJSON 한 번만 받는다 — 같은 파일을 타일 여럿이 쓴다. */
export function loadGeo(file) {
  if (!cache.has(file)) cache.set(file, fetch(file).then((r) => (r.ok ? r.json() : null)).catch(() => null));
  return cache.get(file);
}

const walk = (c, f) => (typeof c[0] === 'number' ? f(c) : c.forEach((x) => walk(x, f)));
export function bboxOf(features) {
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  for (const ft of features) walk(ft.geometry.coordinates, (p) => {
    b[0] = Math.min(b[0], p[0]); b[1] = Math.min(b[1], p[1]); b[2] = Math.max(b[2], p[0]); b[3] = Math.max(b[3], p[1]);
  });
  return b;
}
const inBox = (ft, bb) => {
  if (!bb) return true;
  const b = bboxOf([ft]);
  return b[2] >= bb[0] && b[0] <= bb[2] && b[3] >= bb[1] && b[1] <= bb[3];
};
/** 폴리곤 링을 캔버스에 헤어라인으로 긋는다 — 실좌표를 bbox 에 등축 투영. */
export async function silhouette(canvas, spec, opts = {}) {
  const g = await loadGeo(spec.file);
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  if (!g) return 0;
  const fts = g.features.filter((f) => inBox(f, spec.bbox));
  if (!fts.length) return 0;
  const bb = spec.bbox || bboxOf(fts);
  const pad = opts.pad ?? 10, pt = opts.padTop ?? pad, pb = opts.padBottom ?? pad;
  const kx = (W - pad * 2) / (bb[2] - bb[0]);
  const ky = (H - pt - pb) / (bb[3] - bb[1]);
  // 위도 보정 — 화면 위에서도 실제 비율을 지킨다.
  const kLat = ky, kLon = kx / Math.cos(((bb[1] + bb[3]) / 2) * Math.PI / 180) * Math.cos(((bb[1] + bb[3]) / 2) * Math.PI / 180);
  const k = Math.min(kLon, kLat);
  const ox = (W - (bb[2] - bb[0]) * k) / 2, oy = pb + (H - pt - pb - (bb[3] - bb[1]) * k) / 2;
  const px = (p) => [ox + (p[0] - bb[0]) * k, H - (oy + (p[1] - bb[1]) * k)];
  ctx.strokeStyle = opts.stroke || '#010102';
  ctx.lineWidth = opts.width || 0.7;
  ctx.lineJoin = 'miter';
  if (opts.fill) ctx.fillStyle = opts.fill;
  const ring = (r) => {
    ctx.beginPath();
    r.forEach((p, i) => { const [x, y] = px(p); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.closePath();
    if (opts.fill) ctx.fill();
    ctx.stroke();
  };
  for (const f of fts) {
    const gm = f.geometry;
    if (gm.type === 'Polygon') gm.coordinates.forEach(ring);
    else if (gm.type === 'MultiPolygon') gm.coordinates.forEach((pg) => pg.forEach(ring));
  }
  return fts.length;
}

export const xlsxTable = (x) => `<table class="xt n"><tr>${x.head.map((h) => `<td>${esc(h)}</td>`).join('')}</tr>${
  x.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}<tr><td colspan="4">${esc(x.tail)}</td></tr></table>`;
export const zipTree = (t, dim) => `<pre class="tree n${dim ? ' tree--dim' : ''}">${esc(t)}</pre>`;
export const noneBox = (t1, t2) => `<span class="t1">${esc(t1)}</span><span class="t2 n">${esc(t2)}</span>`;
/** 코너 브래킷 SVG — 이미지 안 헤어라인 벡터. */
export const bracket = (w, h, color, k = 14) => {
  // 1px 선은 반 픽셀 안쪽에 세워야 overflow:hidden 액자 안에서 온전히 보인다.
  const o = 0.5, W = w - o, H = h - o;
  return `<svg class="br-svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><path d="M${o} ${k}V${o}h${k}M${W - k} ${o}h${k}v${k}M${W} ${H - k}v${k}h-${k}M${k} ${H}H${o}v-${k}" fill="none" stroke="${color}" stroke-width="1"/></svg>`;
};
export { esc };
