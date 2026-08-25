import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SURVEYS, SURVEY_COUNTERS } from '../../landxi/assets/data/surveys.js';
import { DASH } from '../../landxi/assets/data/dashboard.js';
import { IMAGERY } from '../../landxi/assets/data/imagery.js';
import { MODELS } from '../../landxi/assets/data/models.js';

test('7 surveys with required fields', () => {
  assert.equal(SURVEYS.length, 7);
  for (const s of SURVEYS) for (const k of ['id', 'ministry', 'name', 'method', 'cycle', 'service', 'color', 'layerId']) assert.ok(s[k], k);
});

test('survey ids match the fixed controller list', () => {
  const ids = SURVEYS.map(s => s.id).sort();
  assert.deepEqual(ids, ['farmland', 'greenbelt', 'greenhouse', 'incinerator', 'marine', 'pothole', 'trash'].sort());
  for (const s of SURVEYS) {
    assert.equal(s.method, '현장 인력');
    assert.equal(s.layerId, 'survey-' + s.id);
  }
});

test('SURVEY_COUNTERS has field and ai groups', () => {
  for (const g of ['field', 'ai']) for (const k of ['teams', 'months', 'coverage', 'formats']) assert.ok(SURVEY_COUNTERS[g][k]);
});

test('geojson files parse and reference known surveys', () => {
  const det = JSON.parse(fs.readFileSync('landxi/assets/data/geo/detections-sample.geojson', 'utf8'));
  const ids = new Set(SURVEYS.map(s => s.id));
  const seen = new Set();
  for (const f of det.features) {
    assert.ok(ids.has(f.properties.surveyId));
    assert.ok(f.properties.id);
    seen.add(f.properties.surveyId);
  }
  assert.ok(seen.size >= 4);
  for (const n of ['korea-outline', 'sigungu-sample', 'orgs', 'projects-extent']) {
    assert.equal(JSON.parse(fs.readFileSync(`landxi/assets/data/geo/${n}.geojson`, 'utf8')).type, 'FeatureCollection');
  }
});

test('sigungu-sample has 14 Jeonbuk 시군 with known survey ids in done[]', () => {
  const sg = JSON.parse(fs.readFileSync('landxi/assets/data/geo/sigungu-sample.geojson', 'utf8'));
  assert.equal(sg.note, 'simplified placeholder');
  assert.equal(sg.features.length, 14);
  const ids = new Set(SURVEYS.map(s => s.id));
  for (const f of sg.features) {
    assert.match(f.properties.code, /^45\d{3}$/);
    assert.ok(f.properties.name);
    assert.ok(f.properties.coverage >= 0 && f.properties.coverage <= 1);
    for (const d of f.properties.done) assert.ok(ids.has(d));
  }
});

test('projects-extent has 8 rectangles with pid P-001..P-008', () => {
  const pe = JSON.parse(fs.readFileSync('landxi/assets/data/geo/projects-extent.geojson', 'utf8'));
  assert.equal(pe.features.length, 8);
  const pids = pe.features.map(f => f.properties.pid).sort();
  assert.deepEqual(pids, Array.from({ length: 8 }, (_, i) => `P-${String(i + 1).padStart(3, '0')}`));
});

test('orgs.geojson has 5 named points', () => {
  const orgs = JSON.parse(fs.readFileSync('landxi/assets/data/geo/orgs.geojson', 'utf8'));
  assert.equal(orgs.features.length, 5);
  for (const f of orgs.features) assert.equal(f.geometry.type, 'Point');
});

test('dashboard queue items have pins', () => {
  assert.ok(DASH.queue.length >= 5);
  for (const q of DASH.queue) assert.equal(q.pin.lnglat.length, 2);
});

test('dashboard has kpis, backbone, storage, projects, visits, notice, coverage', () => {
  assert.ok(DASH.kpis.length >= 5);
  assert.equal(DASH.backbone.name, 'XI-VFM');
  assert.ok(DASH.storage.total > 0 && DASH.storage.used > 0 && DASH.storage.parts.length > 0);
  assert.ok(DASH.projects.length > 0);
  assert.equal(DASH.visits.length, 7);
  assert.ok(DASH.notice.title);
  assert.equal(DASH.coverage.length, 14);
});

test('support-data.js and ai-project-data.js were copied from the prototype', () => {
  for (const f of ['support-data.js', 'ai-project-data.js']) {
    const p = `landxi/assets/data/${f}`;
    assert.ok(fs.existsSync(p), p);
    assert.ok(fs.readFileSync(p, 'utf8').length > 100, p);
  }
});

/* ── Task 8b: 실자산(정사영상 타일·실탐지 벡터·모델 메타) ───────────────── */

test('imagery entries point at existing tile dirs with bounds', () => {
  assert.ok(IMAGERY.length >= 6);
  for (const i of IMAGERY) {
    assert.equal(i.bounds.length, 4);
    assert.ok(i.bounds[0] < i.bounds[2] && i.bounds[1] < i.bounds[3]);
    assert.ok(fs.existsSync(`landxi/assets/tiles/${i.id}/${i.minzoom}`), i.id);
    assert.match(i.tiles, /^assets\/tiles\/[a-z0-9_]+\/\{z\}\/\{x\}\/\{y\}\.webp$/);
    assert.ok(['ortho', 'landcover'].includes(i.kind), i.id);
    assert.ok(i.gsd > 0 && i.maxzoom > i.minzoom);
  }
});

test('namwon has 4 epochs sharing one AOI', () => {
  const nw = IMAGERY.filter(i => i.id.startsWith('namwon_'));
  assert.equal(nw.length, 4);
  for (const i of nw) assert.deepEqual(i.bounds, nw[0].bounds);
});

test('marine debris geojson is simplified and sized', () => {
  const g = JSON.parse(fs.readFileSync('landxi/assets/data/geo/marine-debris.geojson', 'utf8'));
  assert.ok(g.features.length >= 3000 && g.features.length <= 6000);
  assert.ok(fs.statSync('landxi/assets/data/geo/marine-debris.geojson').size < 6e6);
});

test('marine debris grid aggregates every detection with giin counts', () => {
  const g = JSON.parse(fs.readFileSync('landxi/assets/data/geo/marine-debris-grid.geojson', 'utf8'));
  assert.ok(g.features.length > 0);
  let total = 0, withConf = 0;
  for (const f of g.features) {
    const p = f.properties;
    assert.ok(p.count > 0);
    // 원본 13건은 confidence 가 비어 있다 — 0 으로 눌러 담지 말고 결측으로 남긴다.
    assert.ok(p.conf_n >= 0 && p.conf_n <= p.count);
    if (p.conf_n === 0) assert.equal(p.mean_conf, null);
    else assert.ok(p.mean_conf > 0 && p.mean_conf <= 1, JSON.stringify(p));
    total += p.count;
    withConf += p.conf_n;
  }
  assert.equal(total, 38057);          // 원본 38,057건이 한 건도 빠지지 않는다
  assert.equal(withConf, 38044);       // 그중 confidence 를 가진 건수
  assert.ok(g.features.some(f => f.properties.giin && Object.keys(f.properties.giin).length));
});

test('jeju illegal detections are WGS84 polygons', () => {
  const g = JSON.parse(fs.readFileSync('landxi/assets/data/geo/jeju-illegal.geojson', 'utf8'));
  assert.ok(g.features.length >= 1);
  for (const f of g.features) {
    assert.ok(/Polygon/.test(f.geometry.type));
    const [x, y] = f.geometry.coordinates[0][0];
    assert.ok(x > 126 && x < 127 && y > 33 && y < 34);
  }
});

test('models list has real files metadata', () => {
  assert.ok(MODELS.length >= 6);
  for (const m of MODELS) assert.ok(m.sizeMB > 0 && m.classes.length);
});

test('models carry task, trainedAt and inferred flag', () => {
  for (const m of MODELS) {
    assert.ok(['detect', 'segment', 'obb'].includes(m.task), m.id);
    assert.match(m.trainedAt, /^\d{4}-\d{2}$/);
    assert.ok(m.file.endsWith('.pt'), m.id);
    assert.equal(typeof m.inferred, 'boolean');
  }
  assert.ok(MODELS.some(m => m.inferred === false));
});
