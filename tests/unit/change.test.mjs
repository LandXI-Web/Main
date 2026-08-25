import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { CHANGE, changeByPair } from '../../landxi/assets/data/change.js';

/* 남원 4시점 변화 지수(비지도) — tools/change/namwon_change.py 산출물.
   학습 모델 탐지가 아니라 비지도 변화 지수다(tools/change/README.md 참고). */

const GEO = 'landxi/assets/data/geo';
const AOI = { w: 127.3481, s: 35.5276, e: 127.3567, n: 35.5347 };
const CLASSES = new Set(['veg_gain', 'veg_loss', 'built_new', 'other']);
const PAIRS = ['2504-2506', '2506-2508', '2508-2510', '2504-2510'];

const read = (n) => JSON.parse(fs.readFileSync(`${GEO}/${n}.geojson`, 'utf8'));
const rings = (f) => f.geometry.coordinates.flat(f.geometry.type === 'MultiPolygon' ? 1 : 0);

function dirSize(dir) {
  let n = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    n += e.isDirectory() ? dirSize(p) : fs.statSync(p).size;
  }
  return n;
}

test('namwon-change.geojson exists with more than 20 real polygons', () => {
  const p = `${GEO}/namwon-change.geojson`;
  assert.ok(fs.existsSync(p), p);
  const g = read('namwon-change');
  assert.equal(g.type, 'FeatureCollection');
  assert.ok(g.features.length > 20, `features=${g.features.length}`);
  assert.match(g.note, /비지도/);                       // 방법을 파일 안에 남긴다
  assert.match(g.note, /simplify=0\.\d+m/);             // 실제 적용된 허용오차를 밝힌다
});

test('every change polygon has pair / cls / area_m2 / score', () => {
  for (const f of read('namwon-change').features) {
    const p = f.properties;
    assert.ok(PAIRS.includes(p.pair), p.pair);
    assert.ok(CLASSES.has(p.cls), p.cls);
    assert.ok(p.area_m2 >= 25, `area_m2=${p.area_m2}`);  // 최소 면적 25m²
    assert.ok(p.score >= 0 && p.score <= 1, `score=${p.score}`);
    assert.match(f.geometry.type, /Polygon/);
  }
});

test('all four pairs are present with more than 20 polygons each', () => {
  const byPair = {};
  for (const f of read('namwon-change').features) {
    byPair[f.properties.pair] = (byPair[f.properties.pair] || 0) + 1;
  }
  for (const p of PAIRS) assert.ok(byPair[p] > 20, `${p}=${byPair[p]}`);
});

test('every coordinate falls inside the Namwon AOI', () => {
  for (const n of ['namwon-change', 'namwon-change-grid']) {
    for (const f of read(n).features) {
      for (const ring of rings(f)) {
        for (const [lng, lat] of ring) {
          assert.ok(lng >= AOI.w && lng <= AOI.e, `${n} lng=${lng}`);
          assert.ok(lat >= AOI.s && lat <= AOI.n, `${n} lat=${lat}`);
        }
      }
    }
  }
});

test('20m grid summarises the polygons with count / area_m2 / dominant', () => {
  const g = read('namwon-change-grid');
  assert.ok(g.features.length > 20);
  const total = {};
  for (const f of g.features) {
    const p = f.properties;
    assert.ok(PAIRS.includes(p.pair), p.pair);
    assert.ok(p.count > 0);
    assert.ok(p.area_m2 > 0);
    assert.ok(CLASSES.has(p.dominant), p.dominant);
    total[p.pair] = (total[p.pair] || 0) + p.count;
  }
  // 격자는 폴리곤을 한 건도 빠뜨리거나 중복해서 세지 않는다.
  for (const c of CHANGE) assert.equal(total[c.pair], c.stats.n, c.pair);
});

test('CHANGE catalogue covers the four pairs and matches the geojson', () => {
  assert.equal(CHANGE.length, 4);
  assert.deepEqual(CHANGE.map(c => c.pair), PAIRS);
  const byPair = {};
  for (const f of read('namwon-change').features) {
    byPair[f.properties.pair] = (byPair[f.properties.pair] || 0) + 1;
  }
  for (const c of CHANGE) {
    assert.match(c.from, /^25\d\d$/);
    assert.match(c.to, /^25\d\d$/);
    assert.equal(c.pair, `${c.from}-${c.to}`);
    assert.equal(c.method, '변화 지수(비지도)');       // UI 표기를 데이터가 강제한다
    assert.deepEqual(c.bounds, [AOI.w, AOI.s, AOI.e, AOI.n]);
    assert.equal(c.polygons, 'assets/data/geo/namwon-change.geojson');
    assert.ok(fs.existsSync(`landxi/${c.polygons}`), c.polygons);
    assert.equal(c.stats.n, byPair[c.pair], c.pair);
    assert.ok(c.stats.area_m2 > 0);
    const sum = Object.values(c.stats.byClass).reduce((a, b) => a + b, 0);
    assert.equal(sum, c.stats.n, c.pair);
    for (const k of Object.keys(c.stats.byClass)) assert.ok(CLASSES.has(k), k);
  }
  assert.equal(changeByPair('2504-2510').to, '2510');
  assert.equal(changeByPair('nope'), null);
});

test('only the dominant pair carries heat tiles, and they exist for z14-19', () => {
  const withTiles = CHANGE.filter(c => c.tiles);
  assert.equal(withTiles.length, 1);
  const c = withTiles[0];
  assert.equal(c.pair, '2504-2510');
  assert.equal(c.tiles, 'assets/tiles/namwon_change_2504_2510/{z}/{x}/{y}.webp');
  const dir = 'landxi/assets/tiles/namwon_change_2504_2510';
  assert.ok(fs.existsSync(dir), dir);
  for (let z = c.minzoom; z <= c.maxzoom; z++) {
    assert.ok(fs.existsSync(`${dir}/${z}`), `z${z}`);
  }
  for (const other of CHANGE.filter(x => !x.tiles)) assert.equal(other.tiles, null, other.pair);
});

test('outputs stay inside their size budgets', () => {
  assert.ok(fs.statSync(`${GEO}/namwon-change.geojson`).size <= 800_000);
  assert.ok(fs.statSync(`${GEO}/namwon-change-grid.geojson`).size <= 800_000);
  assert.ok(dirSize('landxi/assets/tiles/namwon_change_2504_2510') <= 8_000_000);
});
