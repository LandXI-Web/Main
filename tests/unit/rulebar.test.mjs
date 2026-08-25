import test from 'node:test'; import assert from 'node:assert/strict';
import { scaleOf, metersPerPixel, tickUnit, unitLabel, UNITS, UNIT_FALLBACK } from '../../landxi/assets/js/map/rulebar-math.js';

test('scaleOf rounds the denominator to thousands', () => {
  const s = scaleOf(14, 35.41);
  assert.equal(s % 1000, 0);
  assert.equal(s, 28000);                                  // 559082264 / 2^14 * cos(35.41°) ≈ 27,817
  for (const [z, lat] of [[6, 36.2], [10, 35.0], [18, 37.5]]) assert.equal(scaleOf(z, lat) % 1000, 0, `z${z}`);
});

test('scaleOf halves per zoom level and shrinks with latitude', () => {
  assert.ok(Math.abs(scaleOf(11, 35.41) / scaleOf(12, 35.41) - 2) < 0.01);
  assert.ok(scaleOf(12, 60) < scaleOf(12, 0));
});

test('metersPerPixel matches the web-mercator resolution', () => {
  assert.ok(Math.abs(metersPerPixel(0, 0) - 156543.03) < 0.01);
  assert.ok(Math.abs(metersPerPixel(14, 35.41) - 7.7873) < 0.001);
});

test('tickUnit picks the first candidate that is at least 60px wide', () => {
  const t = tickUnit(14, 35.41);
  assert.equal(t.unit, 500);                                // 100m → 12.8px (미달), 500m → 64.2px
  assert.ok(t.px >= 60);
  assert.ok(tickUnit(17, 35.41).unit < 500);                // 더 확대하면 더 작은 단위로 내려간다
  for (const z of [8, 10, 12, 14, 16, 18]) {
    const u = tickUnit(z, 35.41);
    assert.ok(UNITS.includes(u.unit), `z${z} unit ${u.unit}`);
    assert.ok(u.px >= 60, `z${z} px ${u.px}`);
  }
});

test('tickUnit falls back to 100km when every candidate is under 60px', () => {
  const t = tickUnit(6, 36.2);
  assert.equal(t.unit, UNIT_FALLBACK);
  assert.equal(t.unit, 100000);
  assert.ok(t.px < 60);                                     // 탈출값일 때만 60px 미만이 허용된다
  assert.ok(Math.max(...UNITS) / t.mPerPx < 60);            // 50km 조차 60px 에 못 미쳐서 떨어진 것
});

test('unitLabel switches to km at 1000m', () => {
  assert.equal(unitLabel(100), '100 m');
  assert.equal(unitLabel(500), '500 m');
  assert.equal(unitLabel(1000), '1 km');
  assert.equal(unitLabel(100000), '100 km');
});
