import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCells, gradeResult, gradeTrain, fitProjector, gridLines, cellRect, cellOf, cellKey, PLATE_BOUNDS, STEP } from '../../landxi/proto/db-cells.js';
import { RESULTS } from '../../landxi/assets/data/results.js';
import { CHANGE } from '../../landxi/assets/data/change.js';
import { IMAGERY } from '../../landxi/assets/data/imagery.js';
import { SERVICES } from '../../landxi/assets/data/services.js';

// 대시보드 판의 0.25° 셀 = 실자산 위치. 지어내지 않는다.
const cells = buildCells({ RESULTS, CHANGE, IMAGERY, SERVICES });

test('cellOf floors to the 0.25° grid', () => {
  assert.deepEqual(cellOf(127.42, 35.43), [127.25, 35.25]);
  assert.deepEqual(cellOf(126.983, 35.832), [126.75, 35.75]);
  assert.equal(cellKey(127.25, 35.25), '127.25,35.25');
});

test('namwon results land in 127.25–127.50 E · 35.25–35.50 N; yeosu pair shares one cell', () => {
  const nw = cells.get('127.25,35.25');
  assert.ok(nw, 'namwon cell');
  assert.deepEqual(nw.results.map((r) => r.id).sort(), ['namwon-farmland-2025', 'namwon-greenhouse-2025']);
  assert.equal(nw.name, '남원');
  const ys = [...cells.values()].find((c) => c.results.some((r) => r.id === 'yeosu-marine-2025-aerial'));
  assert.equal(ys.results.length, 2);
  assert.equal(gradeResult(ys), 2);
});

test('change index (unsupervised) is its own entry with the summed polygon count', () => {
  const c = [...cells.values()].find((x) => x.change.length);
  assert.equal(c.change[0].count, CHANGE.reduce((a, x) => a + x.stats.n, 0));
  assert.equal(c.change[0].method, '비지도');
});

test('imagery footprints mark every intersecting cell; training grade counts epochs', () => {
  const withImg = [...cells.values()].filter((c) => c.imagery.length);
  assert.ok(withImg.length >= 6);
  const jeju = withImg.find((c) => c.name === '제주');
  assert.ok(jeju && gradeResult(jeju) === 'train');
  const nwAoi = cells.get('127.25,35.50');
  assert.ok(nwAoi.imagery.some((i) => i.id === 'namwon_2506'));
  assert.equal(gradeTrain(nwAoi), 4);
});

test('planned cells only where no real asset exists', () => {
  for (const c of cells.values()) if (c.planned.length) assert.equal(c.results.length + c.change.length + c.imagery.length, 0);
});

test('fitProjector fits the plate bounds into w×h and yields a maplibre camera', () => {
  const p = fitProjector(PLATE_BOUNDS, 572, 254, 6);
  const [x0, y0] = p([PLATE_BOUNDS[0], PLATE_BOUNDS[3]]), [x1, y1] = p([PLATE_BOUNDS[2], PLATE_BOUNDS[1]]);
  assert.ok(x0 >= -0.01 && x1 <= 572.01 && y0 >= 5.99 && y1 <= 248.01);
  assert.ok(Math.abs(y1 - y0 - 242) < 0.01, 'fits by height');
  assert.ok(p.zoom > 4 && p.zoom < 7, String(p.zoom));
  const back = p.inv(p([127.4, 35.4]));
  assert.ok(Math.abs(back[0] - 127.4) < 1e-6 && Math.abs(back[1] - 35.4) < 1e-6);
  const r = cellRect(cells.get('127.25,35.25'), p);
  assert.ok(r.w > 5 && r.w < 12 && r.h > 5 && r.h < 12);
  const lines = gridLines(p, 572, 254);
  assert.ok(lines.filter((l) => l.d === 'v').length > 20 && lines.some((l) => l.major));
  assert.equal(STEP, 0.25);
});
