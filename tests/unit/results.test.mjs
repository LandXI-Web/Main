// 실제 AI 분석 결과(02. 데이터 GPKG 4종) 변환 산출물 검증.
// 통계(stats.count 등)는 단순화 이전 원본 기준이고, 파일에 실제로 쓰인 건수는 stats.countWeb 다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { RESULTS, resultById, resultsByService } from '../../landxi/assets/data/results.js';
import { SERVICES } from '../../landxi/assets/data/services.js';

const IDS = ['namwon-farmland-2025', 'namwon-greenhouse-2025', 'yeosu-marine-2025-aerial', 'yeosu-marine-2026-drone'];
const BUDGET = 2.5 * 1024 * 1024;
const load = rel => JSON.parse(fs.readFileSync('landxi/' + rel, 'utf8'));
const rels = r => [r.geojson, r.grid, r.lite].filter(Boolean);

test('RESULTS 4종이 고정 id 로 존재한다', () => {
  assert.deepEqual(RESULTS.map(r => r.id).sort(), [...IDS].sort());
  assert.equal(resultById('namwon-farmland-2025').service, 'farmland');
  assert.equal(resultById('nope'), null);
  assert.equal(resultsByService('marine').length, 2);
});

test('필수 필드와 값 도메인', () => {
  for (const r of RESULTS) {
    for (const k of ['id', 'title', 'year', 'sensor', 'region', 'service', 'src', 'geojson', 'stats', 'fields', 'camera'])
      assert.ok(r[k], `${r.id}.${k}`);
    assert.ok(['drone', 'aerial'].includes(r.sensor), r.id);
    assert.ok(['farmland', 'greenhouse', 'marine'].includes(r.service), r.id);
    assert.ok(r.year >= 2024 && r.year <= 2027, r.id);
    assert.match(r.src, /\.gpkg$/);
    assert.match(r.stats.analyzedAt, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(r.stats.crsSrc, 'EPSG:5186');
    // fields 는 짧은 ASCII 속성명 → 한글 라벨 매핑이다
    assert.ok(Object.keys(r.fields).length >= 4, r.id);
    for (const k of Object.keys(r.fields)) assert.match(k, /^[a-z][a-z0-9]{0,7}$/);
  }
});

test('GeoJSON 파일이 존재하고 예산(2.5MB) 안에 든다', () => {
  for (const r of RESULTS) {
    for (const rel of rels(r)) {
      const p = 'landxi/' + rel;
      assert.ok(fs.existsSync(p), p);
      const size = fs.statSync(p).size;
      assert.ok(size > 1000 && size <= BUDGET, `${p} = ${size}`);
    }
    assert.equal(r.stats.fileBytes, fs.statSync('landxi/' + r.geojson).size, r.id);
    assert.ok(r.stats.countWeb > 0 && r.stats.countWeb <= r.stats.count, r.id);
  }
});

test('피처 수가 stats.count 와 정확히 일치한다', () => {
  for (const r of RESULTS) {
    const g = load(r.geojson);
    assert.equal(g.type, 'FeatureCollection');
    // 좌표 6자리로 반올림하면 사라지는 초미세 잔여 폴리곤(면적 ~0)은 파일에서 제외된다.
    assert.equal(g.features.length, r.stats.countWeb, r.id);
    assert.equal(r.stats.countWeb + r.stats.dropped, r.stats.count, r.id);
    assert.ok(r.stats.dropped <= 5, r.id);
    // 클래스별 건수 합계 = 전체(원본 기준)
    assert.equal(Object.values(r.stats.classes).reduce((a, b) => a + b, 0), r.stats.count, r.id);
    // 신뢰도 히스토그램은 10구간, 결측 제외 합계
    assert.equal(r.stats.confHist.length, 10, r.id);
    assert.equal(r.stats.confBins.length, 11, r.id);
    assert.equal(r.stats.confHist.reduce((a, b) => a + b, 0), r.stats.confN, r.id);
    assert.equal(r.stats.confN + r.stats.confNull, r.stats.count, r.id);
  }
});

test('격자 동반본은 원본 전량을 담는다', () => {
  const withGrid = RESULTS.filter(r => r.grid);
  assert.ok(withGrid.length >= 2);
  for (const r of withGrid) {
    const g = load(r.grid);
    let total = 0;
    for (const f of g.features) {
      const p = f.properties;
      assert.ok(p.count > 0);
      assert.ok(p.conf_n >= 0 && p.conf_n <= p.count);
      if (p.conf_n === 0) assert.ok(p.mean_conf === undefined || p.mean_conf === null);
      else assert.ok(p.mean_conf > 0 && p.mean_conf <= 1, JSON.stringify(p));
      assert.ok(p.top && p.top_share > 0 && p.top_share <= 1);
      total += p.count;
    }
    assert.equal(total, r.stats.count, r.id);
  }
});

test('좌표는 EPSG:4326 이고 대한민국 범위 안이며 소수점 6자리 이하다', () => {
  for (const r of RESULTS) {
    const g = load(r.geojson);
    const [x0, y0, x1, y1] = r.stats.bbox;
    assert.ok(x0 > 124 && x1 < 132 && y0 > 33 && y1 < 39, r.id);
    let checked = 0;
    for (const f of g.features) {
      assert.ok(/Polygon$/.test(f.geometry.type), r.id);
      const rings = f.geometry.type === 'MultiPolygon'
        ? f.geometry.coordinates.flat() : f.geometry.coordinates;
      assert.ok(rings.length && rings[0].length >= 4, r.id);   // 빈 지오메트리는 남아 있으면 안 된다
      for (const [lng, lat] of rings[0]) {
        assert.ok(lng > 124 && lng < 132 && lat > 33 && lat < 39, `${r.id} ${lng},${lat}`);
        assert.ok(lng >= x0 - 1e-5 && lng <= x1 + 1e-5, r.id);
        assert.ok(lat >= y0 - 1e-5 && lat <= y1 + 1e-5, r.id);
        const dec = String(lng).split('.')[1] || '';
        assert.ok(dec.length <= 6, `${r.id} ${lng}`);
        checked++;
      }
    }
    assert.ok(checked > 100, r.id);
  }
});

test('속성이 fields 매핑을 벗어나지 않고 conf/area 가 온전하다', () => {
  for (const r of RESULTS) {
    const keys = new Set(Object.keys(r.fields));
    const g = load(r.geojson);
    let conf = 0, area = 0;
    for (const f of g.features) {
      for (const k of Object.keys(f.properties)) assert.ok(keys.has(k), `${r.id}.${k}`);
      const p = f.properties;
      assert.ok(typeof p.cls === 'string' && p.cls.length, r.id);
      assert.ok(r.stats.classes[p.cls] > 0, `${r.id} unknown class ${p.cls}`);
      if (p.conf != null) { assert.ok(p.conf >= 0 && p.conf <= 1, `${r.id} ${p.conf}`); conf++; }
      if (p.area != null) { assert.ok(p.area >= 0); area += p.area; }
    }
    assert.ok(conf >= r.stats.confN - r.stats.dropped && conf <= r.stats.confN, r.id);
    // 단순화 후에도 면적 속성 합계는 원본 통계와 0.5% 이내
    assert.ok(Math.abs(area - r.stats.areaM2) / r.stats.areaM2 < 0.005, `${r.id} ${area} vs ${r.stats.areaM2}`);
  }
});

test('카메라 제안이 bbox 중심과 맞는다', () => {
  for (const r of RESULTS) {
    const c = r.camera;
    const [x0, y0, x1, y1] = r.stats.bbox;
    assert.ok(Math.abs(c.center[0] - (x0 + x1) / 2) < 1e-4, r.id);
    assert.ok(Math.abs(c.center[1] - (y0 + y1) / 2) < 1e-4, r.id);
    assert.ok(c.zoom >= 8 && c.zoom <= 16.5, r.id);
    assert.ok(c.pitch >= 0 && c.pitch <= 60, r.id);
    assert.equal(c.bearing, 0);
  }
});

test('SERVICES.results 가 실제 RESULTS id 를 가리키고 서비스가 일치한다', () => {
  const byId = new Map(RESULTS.map(r => [r.id, r]));
  const seen = new Set();
  for (const s of SERVICES) {
    if (!s.results) continue;
    assert.ok(s.real, `${s.id} 는 results 를 갖는데 real:false 다`);
    for (const rid of s.results) {
      const r = byId.get(rid);
      assert.ok(r, `${s.id} -> ${rid}`);
      assert.equal(r.service, s.id);
      seen.add(rid);
    }
  }
  assert.deepEqual([...seen].sort(), [...IDS].sort());
});

test('남원 결과는 정사영상 AOI 보다 훨씬 넓다(중첩 사실 고정)', () => {
  const AOI = [127.3481, 35.5276, 127.3567, 35.5347];
  for (const id of ['namwon-farmland-2025', 'namwon-greenhouse-2025']) {
    const b = resultById(id).stats.bbox;
    assert.ok(b[0] < AOI[0] && b[1] < AOI[1] && b[2] > AOI[2] && b[3] > AOI[3], id);
  }
});

test('여수 결과는 기존 marine-debris.geojson(신안·완도) 과 bbox 가 겹치지 않는다', () => {
  const md = JSON.parse(fs.readFileSync('landxi/assets/data/geo/marine-debris.geojson', 'utf8'));
  let x0 = 180, y0 = 90, x1 = -180, y1 = -90;
  for (const f of md.features) {
    const rings = f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates.flat() : f.geometry.coordinates;
    if (!rings.length) continue;   // 기존 자산에는 빈 지오메트리 117건이 섞여 있다
    for (const [lng, lat] of rings[0]) {
      if (lng < x0) x0 = lng; if (lng > x1) x1 = lng;
      if (lat < y0) y0 = lat; if (lat > y1) y1 = lat;
    }
  }
  for (const id of ['yeosu-marine-2025-aerial', 'yeosu-marine-2026-drone']) {
    const b = resultById(id).stats.bbox;
    assert.ok(b[0] > x1, `${id} 가 기존 해양쓰레기 자산과 겹친다`);
  }
});

// shots/ 는 .gitignore 대상이라 새 클론에는 없다 — 있을 때만 검사한다.
test('퀵룩 PNG 4장이 있다(로컬 산출물)', { skip: !fs.existsSync('shots/results') && 'shots/ 미생성' }, () => {
  for (const r of RESULTS) {
    const p = `shots/results/${r.id}.png`;
    assert.ok(fs.existsSync(p), p);
    assert.ok(fs.statSync(p).size > 5000, p);
  }
});
