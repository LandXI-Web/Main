import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const GEO = 'landxi/assets/data/geo';

function load(name) {
  return JSON.parse(fs.readFileSync(`${GEO}/${name}`, 'utf8'));
}

function walkCoords(geometry, fn) {
  const walk = (c) => (typeof c[0] === 'number' ? fn(c) : c.forEach(walk));
  walk(geometry.coordinates);
}

function assertKoreaBounds(fc, label) {
  for (const f of fc.features) {
    walkCoords(f.geometry, ([x, y]) => {
      assert.ok(x >= 124 && x <= 132, `${label}: lng ${x} out of range`);
      assert.ok(y >= 33 && y <= 39, `${label}: lat ${y} out of range`);
    });
  }
}

test('sido.geojson: 17 시도, code+name only, real geometry', () => {
  const sido = load('sido.geojson');
  assert.equal(sido.type, 'FeatureCollection');
  assert.equal(sido.features.length, 17);
  const codes = new Set();
  for (const f of sido.features) {
    assert.match(f.properties.code, /^\d{2}$/);
    assert.ok(f.properties.name, JSON.stringify(f.properties));
    assert.ok(['Polygon', 'MultiPolygon'].includes(f.geometry.type));
    codes.add(f.properties.code);
  }
  assert.equal(codes.size, 17, '시도 코드 중복 없음');
  // 특별자치도 개편 반영 확인
  const byCode = Object.fromEntries(sido.features.map((f) => [f.properties.code, f.properties.name]));
  assert.equal(byCode['51'], '강원특별자치도');
  assert.equal(byCode['52'], '전북특별자치도');
  assertKoreaBounds(sido, 'sido');
});

test('sido.geojson file size under 300KB budget', () => {
  assert.ok(fs.statSync(`${GEO}/sido.geojson`).size <= 300 * 1024);
});

test('sigungu.geojson: 249 시군구 (전주시 완산구+덕진구 병합), code/name/sido/code2018', () => {
  const sg = load('sigungu.geojson');
  assert.equal(sg.type, 'FeatureCollection');
  assert.equal(sg.features.length, 249, '전국 250개 시군구 - 전주시 병합 1건');
  const codes = new Set();
  for (const f of sg.features) {
    assert.match(f.properties.code, /^\d{5}$/, JSON.stringify(f.properties));
    assert.ok(f.properties.name, JSON.stringify(f.properties));
    assert.ok(f.properties.sido, JSON.stringify(f.properties));
    assert.ok(f.properties.code2018 === null || /^\d{5}$/.test(f.properties.code2018), JSON.stringify(f.properties));
    assert.ok(['Polygon', 'MultiPolygon'].includes(f.geometry.type));
    codes.add(f.properties.code);
  }
  assert.equal(codes.size, 249, '시군구 코드 중복 없음');
});

test('sigungu.geojson file size under 900KB budget', () => {
  assert.ok(fs.statSync(`${GEO}/sigungu.geojson`).size <= 900 * 1024);
});

test('sigungu.geojson has all 14 코드 from sigungu-sample.geojson (전북)', () => {
  const sg = load('sigungu.geojson');
  const sample = load('sigungu-sample.geojson');
  const codesInFull = new Set(sg.features.map((f) => f.properties.code));
  assert.equal(sample.features.length, 14);
  for (const f of sample.features) {
    assert.ok(codesInFull.has(f.properties.code), `${f.properties.code} (${f.properties.name}) missing`);
    const match = sg.features.find((g) => g.properties.code === f.properties.code);
    assert.equal(match.properties.name, f.properties.name);
    assert.equal(match.properties.sido, '전북특별자치도');
  }
});

test('sigungu.geojson coordinates within Korea bounds', () => {
  assertKoreaBounds(load('sigungu.geojson'), 'sigungu');
});

test('korea-outline.geojson keeps the placeholder top-level shape (type/features) and is real geometry', () => {
  const ko = load('korea-outline.geojson');
  assert.equal(ko.type, 'FeatureCollection');
  assert.ok('note' in ko, '기존 placeholder 파일의 note 키를 유지');
  assert.equal(ko.features.length, 1);
  assert.equal(ko.features[0].properties.name, '대한민국');
  assert.ok(['Polygon', 'MultiPolygon'].includes(ko.features[0].geometry.type));
  // placeholder 는 단순 사각파형 Polygon 1개 링이었다 — 실경계는 섬을 포함한 MultiPolygon 이어야 한다.
  assert.equal(ko.features[0].geometry.type, 'MultiPolygon');
  assert.ok(ko.features[0].geometry.coordinates.length > 1, '본토 외 섬(제주 등)도 포함');
  assertKoreaBounds(ko, 'korea-outline');
});

test('korea-outline.geojson file size under 200KB budget', () => {
  assert.ok(fs.statSync(`${GEO}/korea-outline.geojson`).size <= 200 * 1024);
});

test('geometry sanity: no unclosed rings (mapshaper -check-geometry command does not exist in the pinned mapshaper 0.7.55 CLI — verified via `npx mapshaper -h`; geometry validity is instead ensured at build time in tools/fetch-boundaries.mjs by chaining `-simplify ... -clean`, whose [clean]/[simplify] log lines report 0 features dropped and repaired ring self-intersections)', () => {
  for (const name of ['sido.geojson', 'sigungu.geojson', 'korea-outline.geojson']) {
    const fc = load(name);
    for (const f of fc.features) {
      const rings = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
      for (const poly of rings) {
        for (const ring of poly) {
          assert.ok(ring.length >= 4, `${name}: ring too short`);
          const first = ring[0];
          const last = ring[ring.length - 1];
          assert.deepEqual(first, last, `${name}: ring not closed`);
        }
      }
    }
  }
});
