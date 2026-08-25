// 남원 금지면 건물 발자국(OSM Overpass) + 우리 비닐하우스 검출 → 스파이크용 경량 JSON.
// Overpass 가 막히면 비닐하우스 GeoJSON 만으로도 화면이 성립한다.
import fs from 'node:fs'; import path from 'node:path';
const ROOT = process.cwd();
const OUT = path.join(ROOT, 'landxi/proto/spikes/three-globe/data');
fs.mkdirSync(OUT, { recursive: true });
const [W, S, E, N] = [127.320, 35.350, 127.460, 35.470];   // 금지면 일대

const q = `[out:json][timeout:90];(way["building"](${S},${W},${N},${E});relation["building"](${S},${W},${N},${E}););out geom;`;
let feats = [];
for (const host of ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']) {
  try {
    const r = await fetch(host, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'content-type': 'application/x-www-form-urlencoded' } });
    if (!r.ok) { console.log(host, r.status); continue; }
    const j = await r.json();
    for (const el of j.elements || []) {
      const ring = el.type === 'way' ? el.geometry : (el.members || []).find(m => m.role === 'outer')?.geometry;
      if (!ring || ring.length < 4) continue;
      const lv = +(el.tags?.['building:levels'] || 0);
      feats.push({ h: lv ? lv * 3.2 : 0, r: ring.map(g => [+g.lon.toFixed(6), +g.lat.toFixed(6)]) });
    }
    console.log(host, '→', feats.length, 'buildings'); break;
  } catch (e) { console.log(host, 'fail', e.message); }
}
fs.writeFileSync(path.join(OUT, 'buildings.json'), JSON.stringify({ bbox: [W, S, E, N], feats }));

// 비닐하우스/농지 검출 — 폴리곤 링만 뽑아 가볍게
for (const [src, name, cap] of [
  ['landxi/assets/data/geo/results/namwon-greenhouse-2025.geojson', 'greenhouse.json', 1200],
  ['landxi/assets/data/geo/results/namwon-farmland-2025.geojson', 'farmland.json', 900]]) {
  const j = JSON.parse(fs.readFileSync(path.join(ROOT, src), 'utf8'));
  const out = [];
  for (const f of j.features) {
    const c = f.geometry.coordinates;
    const rings = f.geometry.type === 'MultiPolygon' ? c.map(p => p[0]) : [c[0]];
    for (const r of rings) {
      const lo = r.map(v => v[0]), la = r.map(v => v[1]);
      const cx = (Math.min(...lo) + Math.max(...lo)) / 2, cy = (Math.min(...la) + Math.max(...la)) / 2;
      if (cx < W || cx > E || cy < S || cy > N) continue;
      out.push({ c: [+cx.toFixed(6), +cy.toFixed(6)], a: f.properties.area || 0, k: f.properties.conf || 0,
                 r: r.filter((_, i) => i % 2 === 0).map(v => [+v[0].toFixed(6), +v[1].toFixed(6)]) });
      break;
    }
    if (out.length >= cap) break;
  }
  fs.writeFileSync(path.join(OUT, name), JSON.stringify(out));
  console.log(name, out.length);
}
