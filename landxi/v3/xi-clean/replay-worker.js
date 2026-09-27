/* replay-worker.js — 끝난 분석 다시 보기용: 칸별 판독 도형을 뒤에서 받아(동시 4) 읽고, 지도 축척에 맞게 줄여(더글러스-포이커 · 약 1.5m) 돌려준다.
   화면 스레드는 JSON 파싱을 하지 않는다 → 70,000개 도형이 12초 안에 차올라도 끊기지 않는다. */
const TOL = 1.5e-5;
const Q6 = (v) => Math.round(v * 1e6) / 1e6;
function dp(pts, tol) {
  if (pts.length <= 4) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const st = [[0, pts.length - 1]], t2 = tol * tol;
  while (st.length) {
    const [a, b] = st.pop(); const [ax, ay] = pts[a], [bx, by] = pts[b];
    const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
    let md = -1, mi = -1;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = pts[i];
      let d;
      if (L === 0) d = (px - ax) ** 2 + (py - ay) ** 2;
      else { const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)); d = (px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2; }
      if (d > md) { md = d; mi = i; }
    }
    if (md > t2) { keep[mi] = 1; st.push([a, mi], [mi, b]); }
  }
  const out = []; for (let i = 0; i < pts.length; i++) if (keep[i]) out.push([Q6(pts[i][0]), Q6(pts[i][1])]);
  return out;
}
function slim(g) {
  if (!g) return null;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : null;
  if (!polys) return null;
  const out = [];
  for (const p of polys) { const r = dp(p[0], TOL); if (r.length >= 4) out.push([r]); }   // 바깥 고리만(이 축척에서 구멍은 안 보인다)
  if (!out.length) return null;
  return out.length === 1 ? { type: 'Polygon', coordinates: out[0] } : { type: 'MultiPolygon', coordinates: out };
}
const queue = []; let active = 0;
function pump() {
  while (queue.length && active < 4) {
    const { key, url } = queue.shift(); active++;
    fetch(url, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null).then((j) => {
      const fs = [];
      for (const f of j?.features || []) { const g = slim(f.geometry); if (g) fs.push({ type: 'Feature', properties: {}, geometry: g }); }
      postMessage({ key, features: fs });
      active--; pump();
    });
  }
}
onmessage = (e) => { for (const x of e.data.items || []) queue.push(x); pump(); };
