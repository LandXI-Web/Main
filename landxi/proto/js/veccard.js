import { OFM, GLYPHS } from './sources.js';

// 벡터 추출 카드 — 정사영상 위에 작은 유리 카드를 띄우고 그 안에 **같은 범위의 벡터만** 그린다.
// "이 영상에서 뽑아낸 것이 이겁니다"를 한 화면에서 증명하는 장치(all4land 2-4).
// 메인 지도는 절대 건드리지 않는다. 카드는 자기 소유의 작은 MapLibre 인스턴스를 한 번만 만들고
// 이후 파괴하지 않는다.

const STYLE = {
  version: 8,
  glyphs: GLYPHS,
  sources: {
    ofm: { type: 'vector', url: OFM },
    vec: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
  },
  layers: [
    { id: 'bg', type: 'background', paint: { 'background-color': '#0E1726' } },
    { id: 'water', type: 'fill', source: 'ofm', 'source-layer': 'water',
      paint: { 'fill-color': '#111E31' } },
    { id: 'road', type: 'line', source: 'ofm', 'source-layer': 'transportation',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#9FB4CC',
               'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 11, 0.4, 17, 2.2] } },
    { id: 'bldg', type: 'line', source: 'ofm', 'source-layer': 'building', minzoom: 14,
      paint: { 'line-color': '#6E8199', 'line-width': 0.5 } },
    { id: 'vec-fill', type: 'fill', source: 'vec',
      paint: { 'fill-color': ['coalesce', ['get', '_color'], '#0FA9A0'], 'fill-opacity': 0.14 } },
    { id: 'vec-line', type: 'line', source: 'vec',
      paint: { 'line-color': ['coalesce', ['get', '_color'], '#0FA9A0'], 'line-width': 0.9 } },
    { id: 'vec-dot', type: 'circle', source: 'vec',
      filter: ['==', ['geometry-type'], 'Point'],
      paint: { 'circle-radius': 1.6, 'circle-color': ['coalesce', ['get', '_color'], '#0FA9A0'] } },
  ],
};

export function makeVecCard(main, root) {
  let sub = null, synced = false;

  function ensure() {
    if (sub) return sub;
    sub = new maplibregl.Map({
      container: root.querySelector('#vec-map'),
      style: STYLE, center: main.getCenter(), zoom: main.getZoom(),
      pitch: 0, bearing: main.getBearing(),
      interactive: false, attributionControl: false, fadeDuration: 0, antialias: false,
    });
    for (const h of ['scrollZoom', 'dragPan', 'dragRotate', 'doubleClickZoom', 'touchZoomRotate', 'keyboard', 'boxZoom'])
      sub[h] && sub[h].disable();
    main.on('move', sync);
    return sub;
  }

  // 메인 카메라를 그대로 따라간다. pitch 는 0 으로 눕혀 "도면"으로 읽히게 한다.
  function sync() {
    if (!sub || root.hidden) return;
    sub.jumpTo({ center: main.getCenter(), zoom: main.getZoom(), bearing: main.getBearing(), pitch: 0 });
  }

  return {
    show(fc, caption) {
      ensure();
      root.hidden = false;
      root.querySelector('#vec-cap').textContent = caption || '이 영상에서 추출한 것';
      const set = () => { try { sub.getSource('vec').setData(fc || { type: 'FeatureCollection', features: [] }); } catch (e) { /* noop */ } };
      if (sub.isStyleLoaded()) set(); else sub.once('load', set);
      synced = true;
      requestAnimationFrame(() => { sub.resize(); sync(); });
    },
    hide() { root.hidden = true; },
    get on() { return synced && !root.hidden; },
  };
}
