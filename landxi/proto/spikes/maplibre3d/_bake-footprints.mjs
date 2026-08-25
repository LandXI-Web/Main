// SPIKE 전용 — Overpass 원본(JSON) → fill-extrusion 용 GeoJSON.
import fs from 'node:fs'; import path from 'node:path';
const DIR = path.resolve('landxi/proto/spikes/maplibre3d/data');
const RAW = path.join(DIR, '_raw');

// 높이 결정: height 태그 → building:levels×3.3 → 용도별 기본값.
// 한국 층고 3.3m(주택 기준), 최소 3m.
const DEFAULT_H = { house:6.0, detached:6.0, residential:7.5, apartments:24, dormitory:18,
  farm:5.0, farm_auxiliary:4.2, barn:5.5, shed:3.2, garage:3.0, garages:3.4, greenhouse:4.0,
  hut:3.0, roof:3.0, carport:3.0, church:12, chapel:9, school:12, kindergarten:7, university:16,
  hospital:16, retail:8, commercial:12, supermarket:7, industrial:9, warehouse:9, service:3.5,
  public:12, civic:12, government:14, hotel:24, office:24, temple:9, train_station:12,
  construction:9, ruins:4, toilets:2.8, yes:6.5 };
function heightOf(t) {
  const h = parseFloat(String(t.height || t['building:height'] || '').replace(/[^\d.]/g, ''));
  if (h > 0 && h < 400) return { h, src: 'height' };
  const lv = parseFloat(t['building:levels'] || t.levels || '');
  if (lv > 0 && lv < 120) return { h: Math.max(3, lv * 3.3), src: 'levels' };
  return { h: DEFAULT_H[(t.building || 'yes').toLowerCase()] ?? 6.5, src: 'default' };
}
// 링 면적(m²) — 기본 높이를 면적으로 보정할 때만 쓴다(경위도 근사).
function ringArea(r) {
  const lat = r[0][1] * Math.PI / 180;
  const mx = 111320 * Math.cos(lat), my = 110540;
  let a = 0;
  for (let i = 0; i < r.length - 1; i++)
    a += (r[i][0] * mx) * (r[i + 1][1] * my) - (r[i + 1][0] * mx) * (r[i][1] * my);
  return Math.abs(a / 2);
}
const summary = [];
for (const f of fs.readdirSync(RAW).filter(f => f.endsWith('.json'))) {
  const id = f.replace('.json', '');
  let d; try { d = JSON.parse(fs.readFileSync(path.join(RAW, f), 'utf8')); } catch { console.log(id, '파싱 실패'); continue; }
  const feats = []; const stat = { height: 0, levels: 0, default: 0 };
  for (const el of d.elements || []) {
    let rings = [];
    if (el.type === 'way' && el.geometry) rings = [el.geometry];
    else if (el.type === 'relation' && el.members) rings = el.members.filter(m => m.role === 'outer' && m.geometry).map(m => m.geometry);
    rings = rings.map(g => g.map(p => [+p.lon.toFixed(6), +p.lat.toFixed(6)])).filter(r => r.length >= 4);
    if (!rings.length) continue;
    for (const r of rings) { const a = r[0], z = r[r.length - 1]; if (a[0] !== z[0] || a[1] !== z[1]) r.push([a[0], a[1]]); }
    const t = el.tags || {}; let { h, src } = heightOf(t); stat[src]++;
    const area = ringArea(rings[0]);
    // 태그가 없을 때만: 바닥면적으로 높이를 흔든다. 전부 같은 높이면 판지 모형처럼 보인다.
    // 40m² 창고 ×0.72 ~ 2,000m² 상가/아파트 ×1.9 범위.
    if (src === 'default') h *= Math.min(1.9, Math.max(0.72, 0.62 + 0.28 * Math.log10(Math.max(20, area))));
    const p = { h: +h.toFixed(1), src, b: t.building || 'yes', a: Math.round(area) };
    if (t['name:ko'] || t.name) p.name = t['name:ko'] || t.name;
    feats.push({ type: 'Feature', properties: p, geometry: rings.length === 1
      ? { type: 'Polygon', coordinates: rings } : { type: 'MultiPolygon', coordinates: rings.map(r => [r]) } });
  }
  const file = path.join(DIR, `buildings-${id}.geojson`);
  fs.writeFileSync(file, JSON.stringify({ type: 'FeatureCollection', features: feats }));
  const kb = +(fs.statSync(file).size / 1024).toFixed(0);
  const pct = (n) => feats.length ? Math.round(n / feats.length * 100) : 0;
  summary.push({ id, n: feats.length, ...stat, kb });
  console.log(`${id.padEnd(8)} ${String(feats.length).padStart(6)}동 · height ${stat.height}(${pct(stat.height)}%) levels ${stat.levels}(${pct(stat.levels)}%) 기본값 ${stat.default}(${pct(stat.default)}%) · ${kb}KB`);
}
fs.writeFileSync(path.join(DIR, 'footprint-stats.json'), JSON.stringify(summary, null, 2));
