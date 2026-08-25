import { SERVICES } from '../../assets/data/services.js';

export const HQ = [127.1480, 35.8242]; // LX 한국국토정보공사 본사 · 전주 만성동
export const TIMELINE = { from: Date.UTC(2025, 3, 1), to: Date.UTC(2026, 7, 31) };
// 남원 정사영상 4시점 — 타임라인 앞구간의 실제 촬영일
export const EPOCHS = [
  { id: 'namwon_2504', label: '2025.04', gsd: 1.08, date: Date.UTC(2025, 3, 11) },
  { id: 'namwon_2506', label: '2025.06', gsd: 1.69, date: Date.UTC(2025, 5, 18) },
  { id: 'namwon_2508', label: '2025.08', gsd: 1.54, date: Date.UTC(2025, 7, 22) },
  { id: 'namwon_2510', label: '2025.10', gsd: 1.68, date: Date.UTC(2025, 9, 14) },
];

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const resolve = (v) => (/^var\(/.test(v) ? css(v.slice(4, -1)) : v);

export const SVC = SERVICES.map((s, i) => ({
  ...s, idx: i, hex: '#006DF7',
  t: (Date.parse(s.lastRun) - TIMELINE.from) / (TIMELINE.to - TIMELINE.from),
}));

// 타임라인 시간 압축 — 실제 날짜축은 그대로 두고, 재생 헤드만 구간별 속도를 달리한다.
// 앞 12% 로 2025-04→2026-05(정사영상 4시점 구간)을, 뒤 88% 로 2026-05→08(서비스 점등)을 훑는다.
const PIVOT = Date.UTC(2026, 4, 1);
export function headDate(q) {
  q = Math.max(0, Math.min(1, q));
  return q < 0.12
    ? TIMELINE.from + (PIVOT - TIMELINE.from) * (q / 0.12)
    : PIVOT + (TIMELINE.to - PIVOT) * ((q - 0.12) / 0.88);
}
export const dateToQ = (d) => (d < PIVOT
  ? ((d - TIMELINE.from) / (PIVOT - TIMELINE.from)) * 0.12
  : 0.12 + ((d - PIVOT) / (TIMELINE.to - PIVOT)) * 0.88);

export function initServices(map) {
  SVC.forEach(s => { s.hex = resolve(s.color) || '#006DF7'; s.q = dateToQ(Date.parse(s.lastRun)); });
  map.getSource('svc').setData({
    type: 'FeatureCollection',
    features: SVC.map(s => ({
      type: 'Feature', id: s.idx,
      properties: { id: s.id, name: s.name, color: s.hex, real: s.real, labeled: s.real },
      geometry: { type: 'Point', coordinates: s.lnglat },
    })),
  });
  SVC.forEach(s => map.setFeatureState({ source: 'svc', id: s.idx }, { lit: 0, ring: 0, dim: 1, hot: 0 }));
}

export function svcState(map, idx, st) {
  map.setFeatureState({ source: 'svc', id: idx }, st);
}

// 폴리곤을 라인으로 — MapLibre 가 geojson 을 내부 타일링할 때 폴리곤은 타일 경계에서
// 잘리고, 그 절단면이 line 레이어에 그대로 그려진다. 링을 미리 LineString 으로 바꾸면 없다.
export function ringsToLines(fc) {
  const feats = [];
  const push = (coords, props) => feats.push({ type: 'Feature', properties: props, geometry: { type: 'MultiLineString', coordinates: coords } });
  for (const f of fc.features || []) {
    const g = f.geometry; if (!g) continue;
    if (g.type === 'Polygon') push(g.coordinates, f.properties || {});
    else if (g.type === 'MultiPolygon') push(g.coordinates.flat(), f.properties || {});
  }
  return { type: 'FeatureCollection', features: feats };
}

export async function loadJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(url + ' ' + r.status);
  return r.json();
}
