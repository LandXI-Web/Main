import test from 'node:test'; import assert from 'node:assert/strict';
import { buildStyle } from '../../landxi/assets/js/map/style.js';
const s = buildStyle({ mist: '#E9EEF1', ink: '#111C2D', water: '#CFE0EF' });
test('style has openfreemap source and required layers', () => {
  assert.equal(s.version, 8); assert.ok(s.sources.openfreemap.url.includes('openfreemap'));
  for (const id of ['background', 'water', 'road', 'building-3d', 'boundary', 'label-place']) assert.ok(s.layers.some(l => l.id === id), id);
});
test('labels prefer korean names', () => { const l = s.layers.find(l => l.id === 'label-place'); assert.deepEqual(l.layout['text-field'], ['coalesce', ['get', 'name:ko'], ['get', 'name']]); });
test('buildStyle() works with no arguments and uses token defaults', () => {
  const d = buildStyle();
  assert.equal(d.layers.find(l => l.id === 'background').paint['background-color'], '#E9EEF1');
  assert.ok(d.glyphs.includes('{fontstack}'));
});
test('layers use OpenMapTiles source-layer names', () => {
  const by = id => s.layers.find(l => l.id === id);
  assert.equal(by('water')['source-layer'], 'water');
  assert.equal(by('road')['source-layer'], 'transportation');
  assert.equal(by('building-3d')['source-layer'], 'building');
  assert.equal(by('boundary')['source-layer'], 'boundary');
  assert.equal(by('label-place')['source-layer'], 'place');
  assert.equal(by('landuse')['source-layer'], 'landuse');
});
test('building-3d is fill-extrusion above zoom 14, boundary is dashed', () => {
  const b = s.layers.find(l => l.id === 'building-3d');
  assert.equal(b.type, 'fill-extrusion'); assert.equal(b.minzoom, 14);
  assert.equal(b.paint['fill-extrusion-color'], '#DDE3E8');
  const bd = s.layers.find(l => l.id === 'boundary');
  assert.ok(Array.isArray(bd.paint['line-dasharray']));
});
