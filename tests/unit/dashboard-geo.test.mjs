import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { merc, unmerc, projector, resAt, bboxOfGeom, featuresIn, toPath, drapeSvg, anchorFeature, windowM, WINDOW_RULE, CROP_W, CROP_H } from '../../landxi/proto/db-geo.js';
import { CROPS } from '../../landxi/assets/data/crops.js';

// 대시보드 판 위 청록 지오메트리 = GeoJSON 을 크롭의 창(make_crops.py 규칙)으로 투영한 것.
test('merc/unmerc round-trip', () => {
  const ll = [127.384737, 35.476528];
  const back = unmerc(merc(ll));
  assert.ok(Math.abs(back[0] - ll[0]) < 1e-9 && Math.abs(back[1] - ll[1]) < 1e-9);
});

test('projector — crop center lands at the plate center, window width = winM metres', () => {
  const crop = CROPS['namwon-farmland-2025'][1];
  const proj = projector(crop, 110);
  const [x, y] = proj(crop.lnglat);
  assert.ok(Math.abs(x - CROP_W / 2) < 1e-6 && Math.abs(y - CROP_H / 2) < 1e-6);
  // 창 가로 = 110 m → 경도 폭 ≈ 110 / (111320·cos lat)
  const wDeg = proj.bounds[2] - proj.bounds[0];
  const expect = 110 / (111320 * Math.cos((crop.lnglat[1] * Math.PI) / 180));
  assert.ok(Math.abs(wDeg / expect - 1) < 0.01, `${wDeg} vs ${expect}`);
  // 세로 = 가로 × 420/640
  const hDeg = proj.bounds[3] - proj.bounds[1];
  assert.ok(Math.abs((hDeg * 111320) / (110 * CROP_H / CROP_W) - 1) < 0.01);
});

test('default window (no rule) is the z19 tile resolution the crops.js gsd records', () => {
  const crop = CROPS['namwon-epoch'][0];
  const proj = projector(crop);
  assert.ok(Math.abs(proj.k - crop.gsd / resAt(crop.lnglat[1])) < 0.01);
});

test('windowM follows make_crops.py clamp rule; anchorFeature finds the crop feature', () => {
  const fc = JSON.parse(fs.readFileSync('landxi/assets/data/geo/results/namwon-farmland-2025.geojson', 'utf8'));
  const crop = CROPS['namwon-farmland-2025'][1];
  const a = anchorFeature(fc, crop.lnglat);
  assert.ok(a, 'anchor feature');
  const w = windowM(WINDOW_RULE['namwon-farmland-2025'], a);
  assert.ok(w >= 70 && w <= 120, String(w));
  assert.equal(windowM(WINDOW_RULE['namwon-epoch'], null), 90);
});

test('drapeSvg — real farmland features land on the plate as teal paths, emd tallied', () => {
  const fc = JSON.parse(fs.readFileSync('landxi/assets/data/geo/results/namwon-farmland-2025.geojson', 'utf8'));
  const crop = CROPS['namwon-farmland-2025'][1];
  const d = drapeSvg(fc, crop, { rule: WINDOW_RULE['namwon-farmland-2025'] });
  assert.ok(d.n >= 1 && d.n <= 400);
  assert.match(d.svg, /<path d="M[\d.]+ [\d.]+L/);
  assert.ok(d.emd, 'emd of the crop');
  assert.ok(d.winM >= 70 && d.winM <= 120);
  // 판 안 피처는 전부 크롭 bbox 와 겹친다
  for (const f of featuresIn(fc, d.bounds)) {
    const b = bboxOfGeom(f.geometry);
    assert.ok(b[2] >= d.bounds[0] && b[0] <= d.bounds[2]);
  }
});

test('drapeSvg — yeosu detections: 20–70 m window keeps them as real polygons; tiny ones become 5×5 squares', () => {
  const fc = JSON.parse(fs.readFileSync('landxi/assets/data/geo/results/yeosu-marine-2026-drone.geojson', 'utf8'));
  const crop = CROPS['yeosu-marine-2026-drone'][0];
  const d = drapeSvg(fc, crop, { rule: WINDOW_RULE['yeosu-marine-2026-drone'] });
  assert.ok(d.n >= 1);
  assert.ok(d.winM >= 20 && d.winM <= 70);
  assert.match(d.svg, /<path d="M/);
  // 창을 z19 1:1(155 m)로 넓히면 같은 객체가 점 표식이 된다
  const wide = drapeSvg(fc, crop, { rule: null, minPx: 400 });
  assert.match(wide.svg, /<rect x="[\d.-]+" y="[\d.-]+" width="5" height="5"\/>/);
  assert.equal(toPath({ type: 'Point', coordinates: crop.lnglat }, projector(crop)), '');
});
