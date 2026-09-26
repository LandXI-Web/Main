/* ladder.js — 줌 사다리. 카탈로그 LayerItem.ladder(order · from · to)로 영상 층을 쌓고, 줌 보간 raster-opacity 로
   층이 들어오고 나간다(E0-S ③: 위 층이 다 들어온 뒤 아래 층은 z+1.5 에서 0 — 타일 적재도 멈춘다).
   출처 칩: 카메라 중심을 덮고 불투명도 ≥ .5 인 가장 위 층. 무대: Natural Earth 국가 hit-test → 'stagechange'. */
import { sourceSpec, chipText } from './sources.js';

/* 국내 사다리 곡선 — [들어오기 시작, 다 들어옴, 나가기 시작, 다 나감](줌). 계약 from/to 안에서 화면 서사에 맞춘 값.
   HLS 는 하루치 궤도 띠라 남원 밖은 비어 있다(no-data 검은 픽셀은 sources.js lxext 가 투명으로) — 그 빈 칸 밑에는 VIIRS 가 받친다.
   VIIRS 는 z12.6→13.2 에 나가되, 그 전에 V-World 가 지금 화면 타일을 다 그렸는지(isSourceLoaded · z ≥ 11)를 본 뒤에야 나간다(holdUnder).
   V-World 는 z7.4 부터 들어와 z8.4 에 다 들어온다(한국 비행 중 경로 타일 선적재 · xi.js prewarmDescent). */
const CURVE = {
  'gibs-viirs-truecolor': [null, null, 12.6, 13.2],   // 2차 판정: 10.6 에서 빠지면 V-World z11 이 아직 안 그려진 프레임에 바탕이 드러났다 — 25cm(11.9)까지 밑을 받친다
  'gibs-hls-s30': [5.2, 6.2, 9.4, 10.2],
  'xdworld-satellite': [7.4, 8.4, null, null],
  'xdworld-floor': [7.4, 8.4, 12.6, 13.2],   // 받침: 같은 V-World 를 z9 타일로만(윗줌은 확대) — 새 줌 타일이 받히기 전 밑이 구름(VIIRS)이 아니라 흐린 V-World
  'ap25-namwon-2023': [11.2, 11.9, null, null],
  'namwon-city-2504': [13.2, 13.8, 15.6, 16.2],
  'namwon-aoi-2504': [14.6, 15.4, null, null],
};
const DEFAULT_CURVE = (it) => [it.ladder.from, it.ladder.from + 0.8, null, null];
export function curveOf(it) { return CURVE[it.id] || DEFAULT_CURVE(it); }
/** 줌 z 에서의 불투명도(스타일 식과 같은 값을 JS 로). */
export function opacityAt(it, z) {
  const [a, b, c, d] = curveOf(it);
  let o = 1;
  if (a !== null) o = z <= a ? 0 : z >= b ? 1 : (z - a) / (b - a);
  if (c !== null) o *= z <= c ? 1 : z >= d ? 0 : 1 - (z - c) / (d - c);
  return o;
}
function opacityExpr(it) {
  const [a, b, c, d] = curveOf(it);
  const stops = [];
  if (a !== null) stops.push(a, 0, b, 1); else stops.push(0, 1);
  if (c !== null) stops.push(c, 1, d, 0); else stops.push(24, 1);
  return ['interpolate', ['linear'], ['zoom'], ...stops];
}
const inB = (b, [x, y]) => !b || (x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3]);

/**
 * 사다리를 지도에 올린다. items = 카탈로그 전체, order = ladder.domestic.
 * 반환 { items(쌓인 순서), chipAt(z, center), setEpochLayer(id,on), dates }
 */
export async function mountLadder(map, items, { order, before, dates = {}, fade = 500, only = null } = {}) {
  // 같은 자리의 다른 시점(AOI 2506·2508·2510 · 시가지 2510)은 사다리에 올리지 않는다 — 시점 스크럽(timescrub)이 맡는다
  const SIBLING = /^(namwon-aoi-25(06|08|10)|namwon-city-2510)$/;
  // 변화 지수 래스터는 게이트웨이가 role:'imagery'로 내도(F1-B 카탈로그) 배경이 아니라 결과 — 사다리에서 뺀다
  const NOT_BG = /change/;
  const imagery = items.filter((i) => i.role === 'imagery' && i.ladder && !SIBLING.test(i.id) && !NOT_BG.test(i.id) && (!only || only.includes(i.id)) && order.includes(i.id))
    .sort((a, b) => a.ladder.order - b.ladder.order || a.id.localeCompare(b.id));
  const mounted = [];
  for (const it of imagery) {
    if (it.id === 'gibs-hls-s30' && !dates.hls) continue;              // 날짜를 못 고르면 층 자체를 올리지 않는다(404 0)
    const params = it.id === 'gibs-hls-s30' ? { date: dates.hls } : it.id === 'gibs-viirs-truecolor' ? { date: dates.viirs } : {};
    const src = await sourceSpec(it, params);
    const sid = 'src-' + it.id;
    if (!map.getSource(sid)) map.addSource(sid, src);
    const [, , c, d] = curveOf(it);
    map.addLayer({ id: 'img-' + it.id, type: 'raster', source: sid, ...(d !== null ? { maxzoom: d + 0.01 } : {}), minzoom: Math.max(0, (curveOf(it)[0] ?? 0) - 0.01),
      paint: { 'raster-opacity': opacityExpr(it), 'raster-fade-duration': fade, 'raster-opacity-transition': { duration: 0, delay: 0 },
        // VIIRS·HLS 트루컬러의 밤바다·깊은 바다는 거의 검정(RGB < 24) — 흰 바탕 법전에 맞춰 검정점만 0.1 올린다(색상·중간톤 유지 · 결과 문서 §2에 표기)
        ...(it.id === 'gibs-viirs-truecolor' || it.id === 'gibs-hls-s30' ? { 'raster-brightness-min': 0.1 } : {}) } }, before);
    mounted.push(it);
  }
  /* V-World 받침(floor): 하강 중 새 줌 타일은 fetch·디코드·페이드 500 동안 비어 있다 — 그 밑이 VIIRS(어제 구름)면 흰 구름이 0.5 s 번쩍였다.
     같은 V-World 를 maxzoom 9 소스로 한 장 더 깔면 z9 타일 몇 장이 확대되어 계속 받친다(구름 없음 · 같은 색 · 새 타일은 그 위로 선명해진다).
     HLS 바로 밑(HLS no-data 투명 칸에도 V-World) · 칩·표기 대상 아님(같은 출처). */
  let floor = null;
  const xw = mounted.find((i) => i.id === 'xdworld-satellite');
  if (xw) {
    floor = { ...xw, id: 'xdworld-floor', maxzoom: 9, ladder: { ...xw.ladder } };
    const spec = { ...(await sourceSpec(xw)), maxzoom: 9 };
    if (!map.getSource('src-xdworld-floor')) map.addSource('src-xdworld-floor', spec);
    const above = map.getLayer('img-gibs-hls-s30') ? 'img-gibs-hls-s30' : 'img-xdworld-satellite';
    map.addLayer({ id: 'img-xdworld-floor', type: 'raster', source: 'src-xdworld-floor', minzoom: 7.39, paint: { 'raster-opacity': opacityExpr(floor), 'raster-fade-duration': fade, 'raster-opacity-transition': { duration: 0, delay: 0 } } }, above);
    holdUnder(map, [floor, xw], 'xdworld-floor', 'xdworld-satellite');
  }
  holdUnder(map, mounted, 'gibs-viirs-truecolor', 'xdworld-satellite');
  const L = {
    items: mounted, floor,
    chipAt(z, center) {
      for (let i = mounted.length - 1; i >= 0; i--) {
        const it = mounted[i];
        if (map.getLayoutProperty('img-' + it.id, 'visibility') === 'none') continue;
        if (opacityAt(it, z) >= 0.5 && inB(it.bounds, center)) return { item: it, text: chipText(it, it.id === 'gibs-hls-s30' ? dates.hls : dates.viirs) };
      }
      return { item: null, text: '배경 없음' };
    },
    visible(id, on) { const l = 'img-' + id; if (map.getLayer(l)) map.setLayoutProperty(l, 'visibility', on ? 'visible' : 'none'); },
  };
  return L;
}

/** 아래 층(under)은 위 층(over)의 소스가 z ≥ 11 에서 지금 화면 타일을 다 그린 뒤에야 나가기 곡선을 탄다.
    그 전에는 불투명도 1 · 줌 상한 없음(겹쳐 받침) — 캔버스에 바탕이 드러나는 프레임 0. 풀리는 순간은 map.__holdLog 에. */
function holdUnder(map, mounted, under, over) {
  const u = mounted.find((i) => i.id === under), o = mounted.find((i) => i.id === over);
  if (!u || !o) return;
  const lid = 'img-' + under, sid = 'src-' + over, [, , c, d] = curveOf(u);
  const [a0] = curveOf(u);
  map.setLayerZoomRange(lid, a0 == null ? 0 : Math.max(0, a0 - 0.01), 24);
  // 들어오는 곡선은 그대로 · 나가는 곡선만 보류
  const held = { ...u, id: u.id + ':held' }; CURVE[held.id] = [curveOf(u)[0], curveOf(u)[1], null, null];
  map.setPaintProperty(lid, 'raster-opacity', opacityExpr(held));
  (map.__holdLog ||= []).push({ id: under, t: Math.round(performance.now()), held: true });
  const check = () => {
    if (map.getZoom() < 11 || !map.getSource(sid) || !map.isSourceLoaded(sid)) return;
    map.off('sourcedata', check); map.off('idle', check);
    map.setPaintProperty(lid, 'raster-opacity', opacityExpr(u));
    if (d !== null) map.setLayerZoomRange(lid, a0 == null ? 0 : Math.max(0, a0 - 0.01), d + 0.01);
    map.__holdLog.push({ id: under, t: Math.round(performance.now()), held: false, z: +map.getZoom().toFixed(2), c });
  };
  map.on('sourcedata', check); map.on('idle', check);
}

/* ── 무대 판정: Natural Earth(world-atlas@2 countries-50m · TopoJSON) 국가 hit-test ── */
let WORLD = null;
async function loadWorld() {
  if (WORLD) return WORLD;
  WORLD = (async () => {
    try {
      const r = await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json');
      const topo = await r.json();
      const { scale: [sx, sy], translate: [tx, ty] } = topo.transform;
      const arcs = topo.arcs.map((a) => { let x = 0, y = 0; return a.map(([dx, dy]) => [(x += dx) * sx + tx, (y += dy) * sy + ty]); });
      const ring = (ids) => ids.flatMap((i, k) => { const a = i < 0 ? [...arcs[~i]].reverse() : arcs[i]; return k ? a.slice(1) : a; });
      return topo.objects.countries.geometries.map((g) => {
        const polys = g.type === 'Polygon' ? [g.arcs] : g.type === 'MultiPolygon' ? g.arcs : [];
        const rings = polys.map((p) => p.map(ring));
        let b = [180, 90, -180, -90];
        for (const p of rings) for (const pt of p[0]) { b = [Math.min(b[0], pt[0]), Math.min(b[1], pt[1]), Math.max(b[2], pt[0]), Math.max(b[3], pt[1])]; }
        return { id: g.id, name: g.properties?.name, rings, b };
      });
    } catch { return []; }
  })();
  return WORLD;
}
const pip = (pt, ring) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c; } return c; };
export async function countryAt(lnglat) {
  const w = await loadWorld();
  for (const c of w) {
    if (!inB(c.b, lnglat)) continue;
    for (const p of c.rings) if (pip(lnglat, p[0]) && !p.slice(1).some((h) => pip(lnglat, h))) return { iso_n3: c.id, name: c.name };
  }
  return null;
}
/** 카메라가 멈출 때마다 국가를 본다. 한국(410)이면 domestic, 그 밖은 global. 바뀌면 map.fire('stagechange'). */
export function watchStage(map, onChange) {
  let cur = null, busy = false;
  const check = async () => {
    if (busy) return; busy = true;
    const c = map.getCenter().toArray();
    const k = await countryAt(c);
    busy = false;
    const stage = k && k.iso_n3 === '410' ? 'domestic' : k ? 'global' : cur?.stage || 'domestic';
    if (!cur || cur.stage !== stage || cur.iso !== k?.iso_n3) {
      cur = { stage, iso: k?.iso_n3 || null, name: k?.name || null };
      map.fire('stagechange', cur); onChange && onChange(cur);
    }
  };
  map.on('moveend', check);
  return { check, get current() { return cur; } };
}
