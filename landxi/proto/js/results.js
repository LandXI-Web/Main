import { CLS } from './style.js';

// 실제 AI 분석 산출물(landxi/assets/data/results.js · GPKG 4종 변환본)을 지도에 얹는다.
// 스키마를 못 박지 않고 피처를 보고 결정한다 — 새 결과가 추가돼도 코드를 고치지 않는다.
//   · 클래스 키 : class | cls | label | code | category  → 색 고정 매핑
//   · 신뢰도 키 : confidence | conf | score | prob       → 슬라이더 필터 + 압출 높이
//   · 지오메트리: Polygon → 압출 + 외곽선, Point → 서클

const PALETTE = ['#F2622A', '#40DE8A', '#863AFF', '#FFB633', '#0FA9A0', '#00C4FF', '#FF97CA', '#94CF1A', '#CD3AFF', '#6675FF'];
const CLS_KEYS = ['class', 'cls', 'label', 'code', 'category', 'kind', 'type'];
const CONF_KEYS = ['confidence', 'conf', 'score', 'prob'];

// 도메인 고정색 — 화면이 바뀌어도 같은 클래스는 같은 색(Roboflow 체크리스트 #14).
const FIXED = {
  '경작지': '#40DE8A', '비경작지': '#B9822E',
  '비닐하우스_단동': '#F2622A', '비닐하우스_다동': '#FFB633',
  styrofoam: '#F2622A', buoy_blue: '#00C4FF', buoy_red: '#DC3B22', buoy_bottle: '#FFB633',
  plastic_box: '#863AFF', rope: '#94CF1A', net: '#0FA9A0', other_debris: '#6675FF',
};
const KO = {
  styrofoam: '스티로폼', buoy_blue: '청색 부표', buoy_red: '적색 부표', buoy_bottle: '병 부표',
  plastic_box: '플라스틱 상자', rope: '로프', net: '그물', other_debris: '기타 폐기물',
};

const pick = (props, keys) => keys.find((k) => props[k] !== undefined && props[k] !== null);
export const norm = (v) => String(v).trim().toLowerCase();
export const label = (v) => KO[norm(v)] || String(v);
export const colorOf = (v, i) => FIXED[norm(v)] || FIXED[String(v).trim()] || CLS[String(v)] || PALETTE[i % PALETTE.length];

export function describe(fc) {
  const f = (fc.features || []).find((x) => x && x.properties) || { properties: {} };
  const classKey = pick(f.properties, CLS_KEYS);
  const confKey = pick(f.properties, CONF_KEYS);
  const classes = new Map();
  let lo = Infinity, hi = -Infinity, n = 0, pts = 0;
  for (const x of fc.features || []) {
    if (!x || !x.geometry) continue;
    n++;
    if (/Point/.test(x.geometry.type)) pts++;
    if (classKey) {
      const v = norm(x.properties[classKey]);
      classes.set(v, (classes.get(v) || 0) + 1);
    }
    if (confKey) {
      const c = Number(x.properties[confKey]);
      if (Number.isFinite(c)) { lo = Math.min(lo, c); hi = Math.max(hi, c); }
    }
  }
  // 큰 클래스부터 — 범례가 의미 순으로 읽힌다.
  const keys = [...classes.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  const color = new Map();
  keys.forEach((k, i) => color.set(k, colorOf(k, i)));
  return {
    n, pts, classKey, confKey, classes, color, keys,
    conf: Number.isFinite(lo) && hi > lo ? { lo, hi } : null,
  };
}

// 색·높이·신뢰도를 피처에 구워 넣는다 — 스키마별로 스타일 표현식을 다시 쓰지 않기 위해.
// 추가로 **신뢰도 내림차순 순위를 feature.id 로** 박는다. 탐지 리빌이 이 id 로 feature-state 를
// 켜기 때문이다(setFilter 처럼 재타일링하지 않아 1,800건도 매 프레임 부담이 없다).
export function bake(fc, d) {
  const lo = d.conf ? d.conf.lo : 0, span = d.conf ? (d.conf.hi - d.conf.lo) || 1 : 1;
  for (const f of fc.features || []) {
    if (!f || !f.properties) continue;
    const p = f.properties;
    p._color = d.classKey ? (d.color.get(norm(p[d.classKey])) || PALETTE[0]) : PALETTE[0];
    const c = d.confKey ? Number(p[d.confKey]) : NaN;
    // 신뢰도가 없는 피처를 1 로 두면 정렬에서 맨 위로 올라와 'DETECTED 1.00' 같은 거짓말이 된다.
    p._conf = Number.isFinite(c) ? c : (d.confKey ? lo : 1);
    p._h = Number.isFinite(c) ? 3 + ((c - lo) / span) * 40 : 8;
  }
  const list = (fc.features || []).filter((f) => f && f.geometry);
  list.sort((a, b) => (b.properties._conf || 0) - (a.properties._conf || 0));
  list.forEach((f, i) => { f.id = i; f.properties._rank = i; });
  fc.features = list;
  return fc;
}

// 데이터 레인 — 객체마다 지면에서 솟는 얇은 필라멘트.
// 밀도 자체가 코로플레스가 된다(all4land 2-7). 폭 1.2 m 사각형이면 z12 에서도 실 한 올로 보인다.
export function filaments(fc, countKey = 'nobj', minH = 70, maxH = 700, widthM = 22) {
  const out = [];
  let hi = 1;
  for (const f of fc.features || []) {
    const n = Number(f.properties && f.properties[countKey]);
    if (Number.isFinite(n) && n > hi) hi = n;
  }
  const centre = (g) => {
    let ring = g.coordinates;
    while (Array.isArray(ring) && Array.isArray(ring[0]) && Array.isArray(ring[0][0])) ring = ring[0];
    if (!Array.isArray(ring)) return null;
    if (typeof ring[0] === 'number') return ring;
    let x = 0, y = 0, k = 0;
    for (const c of ring) if (Array.isArray(c) && c.length >= 2) { x += c[0]; y += c[1]; k++; }
    return k ? [x / k, y / k] : null;
  };
  for (const f of fc.features || []) {
    if (!f.geometry) continue;
    const c = centre(f.geometry);
    if (!c) continue;
    const n = Number(f.properties[countKey]);
    const k = Number.isFinite(n) ? Math.sqrt(n) / Math.sqrt(hi) : 0.35;
    const h = minH + k * (maxH - minH);
    // 위도에 따른 경도 폭 보정. 폭은 시 전역(z12) 에서 실 한 올로 보이는 최소치로 잡는다 —
    // 1 m 로 두면 서브픽셀이라 아무것도 안 보인다(실측).
    const dLat = widthM / 111320, dLng = dLat / Math.cos(c[1] * Math.PI / 180);
    out.push({
      type: 'Feature',
      properties: { _h: h, n: Number.isFinite(n) ? n : null, cls: f.properties.cls },
      geometry: { type: 'Polygon', coordinates: [[
        [c[0] - dLng, c[1] - dLat], [c[0] + dLng, c[1] - dLat],
        [c[0] + dLng, c[1] + dLat], [c[0] - dLng, c[1] + dLat], [c[0] - dLng, c[1] - dLat]]] },
    });
  }
  return { type: 'FeatureCollection', features: out };
}

// 가장 조밀한 구역 — "정밀·입체" 보기의 착지점.
export function densest(fc, cell = 0.006) {
  const m = new Map();
  const first = (g) => {
    let c = g.coordinates;
    while (Array.isArray(c) && Array.isArray(c[0])) c = c[0];
    return Array.isArray(c) ? c : null;
  };
  for (const f of fc.features || []) {
    if (!f.geometry) continue;
    const p = first(f.geometry);
    if (!p) continue;
    const k = Math.round(p[0] / cell) + '|' + Math.round(p[1] / cell);
    const e = m.get(k) || { n: 0, x: 0, y: 0 };
    e.n++; e.x += p[0]; e.y += p[1];
    m.set(k, e);
  }
  let best = null;
  for (const e of m.values()) if (!best || e.n > best.n) best = e;
  return best ? { center: [best.x / best.n, best.y / best.n], n: best.n } : null;
}

// 저줌에서는 필지/객체 폴리곤이 픽셀 이하로 사라진다 — 중심점 레이어를 함께 만든다.
export function centroids(fc) {
  const out = [];
  for (const f of fc.features || []) {
    const g = f.geometry;
    if (!g) continue;
    let ring = g.coordinates;
    while (Array.isArray(ring) && Array.isArray(ring[0]) && Array.isArray(ring[0][0])) ring = ring[0];
    if (!Array.isArray(ring)) continue;
    if (typeof ring[0] === 'number') { out.push({ type: 'Feature', properties: f.properties, geometry: { type: 'Point', coordinates: ring } }); continue; }
    let x = 0, y = 0, n = 0;
    for (const c of ring) { if (Array.isArray(c) && c.length >= 2) { x += c[0]; y += c[1]; n++; } }
    if (!n) continue;
    out.push({ type: 'Feature', id: f.id, properties: f.properties, geometry: { type: 'Point', coordinates: [x / n, y / n] } });
  }
  return { type: 'FeatureCollection', features: out };
}
