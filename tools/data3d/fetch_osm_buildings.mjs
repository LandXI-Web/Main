#!/usr/bin/env node
// OSM Overpass -> building footprints GeoJSON (height/levels 보존)
// usage: node tools/data3d/fetch_osm_buildings.mjs <name> <s,w,n,e> <out.geojson>
import fs from 'node:fs';
import path from 'node:path';

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

const [, , name = 'namwon', bboxArg = '35.374,127.346,35.446,127.434', outArg] = process.argv;
const out = outArg || `landxi/assets/data/3d/${name}-buildings-osm.geojson`;

const q = `[out:json][timeout:180];
(
  way["building"](${bboxArg});
  relation["building"](${bboxArg});
);
out body geom;`;

async function run() {
  let json = null, used = null;
  for (const ep of ENDPOINTS) {
    try {
      process.stderr.write(`try ${ep}\n`);
      const r = await fetch(ep, { method: 'POST', body: 'data=' + encodeURIComponent(q),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
      if (!r.ok) { process.stderr.write(`  HTTP ${r.status}\n`); continue; }
      json = await r.json(); used = ep; break;
    } catch (e) { process.stderr.write(`  ${e.message}\n`); }
  }
  if (!json) { console.error('all endpoints failed'); process.exit(1); }

  const feats = [];
  for (const el of json.elements) {
    const t = el.tags || {};
    let coords = null;
    if (el.type === 'way' && el.geometry) {
      const ring = el.geometry.map(p => [+p.lon.toFixed(6), +p.lat.toFixed(6)]);
      if (ring.length < 4) continue;
      if (ring[0][0] !== ring.at(-1)[0] || ring[0][1] !== ring.at(-1)[1]) ring.push(ring[0]);
      coords = [ring];
    } else if (el.type === 'relation' && el.members) {
      const outers = el.members.filter(m => m.role === 'outer' && m.geometry);
      if (!outers.length) continue;
      coords = outers.map(m => {
        const r = m.geometry.map(p => [+p.lon.toFixed(6), +p.lat.toFixed(6)]);
        if (r[0][0] !== r.at(-1)[0] || r[0][1] !== r.at(-1)[1]) r.push(r[0]);
        return r;
      });
    }
    if (!coords) continue;
    const levels = t['building:levels'] ? parseFloat(t['building:levels']) : null;
    const hRaw = t.height ? parseFloat(String(t.height).replace(/[^\d.]/g, '')) : null;
    feats.push({
      type: 'Feature',
      properties: {
        id: `${el.type}/${el.id}`, building: t.building || 'yes',
        name: t.name || null, levels, height_tag: Number.isFinite(hRaw) ? hRaw : null,
        src: 'osm',
      },
      geometry: { type: 'Polygon', coordinates: coords },
    });
  }
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ type: 'FeatureCollection',
    metadata: { source: 'OpenStreetMap via Overpass', endpoint: used, bbox_snwe: bboxArg,
      fetched: new Date().toISOString(), licence: 'ODbL 1.0 — © OpenStreetMap contributors' },
    features: feats }));
  const wH = feats.filter(f => f.properties.height_tag != null).length;
  const wL = feats.filter(f => f.properties.levels != null).length;
  console.log(JSON.stringify({ out, total: feats.length, with_height_tag: wH, with_levels: wL,
    pct_any_height: feats.length ? +((100 * feats.filter(f => f.properties.height_tag != null || f.properties.levels != null).length) / feats.length).toFixed(1) : 0,
    bytes: fs.statSync(out).size }, null, 2));
}
run();
