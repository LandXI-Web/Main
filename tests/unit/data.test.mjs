import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SURVEYS, SURVEY_COUNTERS } from '../../landxi/assets/data/surveys.js';
import { DASH } from '../../landxi/assets/data/dashboard.js';
import { SERVICES, serviceById } from '../../landxi/assets/data/services.js';

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
    assert.match(f.properties.code, /^52\d{3}$/);
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

test('13 home services: unique ids, 4 real assets, sane coordinates', () => {
  assert.equal(SERVICES.length, 13);
  assert.equal(new Set(SERVICES.map(s => s.id)).size, 13);
  for (const s of SERVICES) {
    for (const k of ['id', 'name', 'ministry', 'unit', 'lastRun', 'story', 'color']) assert.ok(s[k], `${s.id}.${k}`);
    assert.equal(typeof s.real, 'boolean');
    assert.ok(Number.isFinite(s.count) && s.count > 0, s.id);
    const [lng, lat] = s.lnglat;
    assert.ok(lng > 124 && lng < 132, s.id);   // 대한민국 경도 범위
    assert.ok(lat > 33 && lat < 39, s.id);     // 대한민국 위도 범위
    assert.match(s.lastRun, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(s.color, /^var\(--[a-z-]+\)$/);
  }
  const real = SERVICES.filter(s => s.real);
  assert.deepEqual(real.map(s => s.id).sort(), ['change', 'farmland', 'marine', 'pothole']);
  assert.deepEqual(real.map(s => s.story).sort(), ['jeju', 'kuksan', 'marine', 'namwon']);
  assert.equal(SERVICES.find(s => s.id === 'marine').count, 38057);
  assert.equal(serviceById('marine').id, 'marine');
  assert.equal(serviceById('nope'), null);
});

test('every survey id from the 7-survey lineup also exists as a home service', () => {
  const ids = new Set(SERVICES.map(s => s.id));
  for (const s of SURVEYS) assert.ok(ids.has(s.id), s.id);
});
