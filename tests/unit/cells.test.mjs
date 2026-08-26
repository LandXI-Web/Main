// 판 12.8 셀 집계 단위 테스트 — design-canvas/v2/NOTES.md §12.8
// 판의 등급·범례 셀 수·콜아웃 문구가 **계산값**임을 여기서 못박는다. 손 값이 하나라도 있으면 깨진다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const M = await import(pathToFileURL('landxi/proto/db-data.js').href);
const JEJU = JSON.parse(fs.readFileSync('landxi/assets/data/geo/jeju-illegal.geojson', 'utf8'));

const FPS = (() => {
  const out = M.baseFootprints();
  const j = M.jejuFootprint(JEJU);
  if (j) out.push(j);
  return out;
})();
const CELLS = M.cellsFor(FPS);
const cell = (lon, lat) => CELLS.find((c) => Math.abs(c.lon - lon) < 1e-9 && Math.abs(c.lat - lat) < 1e-9);

/* ── bbox ∩ 셀 ────────────────────────────────────────────────────────── */
test('cellsOfBBox — 한 셀 안에 완전히 들어가는 bbox 는 1셀', () => {
  assert.deepEqual(M.cellsOfBBox([127.30, 35.52, 127.35, 35.55]), [[127.25, 35.5]]);
});

test('cellsOfBBox — 여러 셀에 걸치면 곱집합만큼 나온다', () => {
  const got = M.cellsOfBBox([127.185031, 35.307309, 127.657689, 35.556752]);
  assert.equal(got.length, 6);                       // 경도 3 × 위도 2
  assert.ok(got.some(([x, y]) => x === 127 && y === 35.25));
  assert.ok(got.some(([x, y]) => x === 127.5 && y === 35.5));
  assert.ok(!got.some(([x, y]) => x === 127.75));    // 127.657689 는 127.75 셀에 닿지 않는다
});

test('cellsOfBBox 경계값 — 상한이 셀 경계에 정확히 닿으면 그 셀은 세지 않는다(겹침 0)', () => {
  assert.deepEqual(M.cellsOfBBox([127.5, 34.5, 127.75, 34.75]), [[127.5, 34.5]]);
  // 아주 조금이라도 넘어가면 다음 셀이 선다 — 여수 항공 결과가 그 경우다.
  const over = M.cellsOfBBox([127.509333, 34.554701, 127.749547, 34.750267]);
  assert.deepEqual(over.sort(), [[127.5, 34.5], [127.5, 34.75]].sort());
});

test('cellsOfBBox 경계값 — 하한이 셀 경계에 정확히 닿으면 그 셀부터 센다', () => {
  assert.deepEqual(M.cellsOfBBox([127.25, 35.5, 127.3, 35.55]), [[127.25, 35.5]]);
});

test('cellsOfBBox — 폭이 0 인 bbox 도 자기 셀 하나는 돌려준다', () => {
  assert.deepEqual(M.cellsOfBBox([126.9, 33.51, 126.9, 33.51]), [[126.75, 33.5]]);
});

test('cellOf — 남서 모서리로 내림한다', () => {
  assert.equal(M.cellOf(127.657689), 127.5);
  assert.equal(M.cellOf(35.0), 35);
  assert.equal(M.cellOf(129.05), 129);
});

/* ── footprint = 데이터에서만 온다 ────────────────────────────────────── */
test('footprint 는 결과 대장 4건 + 변화 지수 1건 + 제주 1건', () => {
  const ids = FPS.map((f) => f.id).sort();
    assert.deepEqual(ids, [
      'jeju-illegal', 'namwon-change', 'namwon-farmland-2025', 'namwon-greenhouse-2025',
      'yeosu-marine-2025-aerial', 'yeosu-marine-2026-drone',
    ]);
});

test('비닐하우스 값은 서비스 대장의 집계(9,664동), 라벨 연결은 결과 대장의 원값(1,674필지)', () => {
  const g = FPS.find((f) => f.id === 'namwon-greenhouse-2025');
  assert.equal(g.value, 9664);
  assert.equal(g.unit, '동');
  assert.equal(g.count, 1674);
  assert.equal(g.countUnit, '필지');
});

test('변화 지수는 비지도이므로 라벨셋이 아니다 · 폴리곤 수는 change.js 합계', () => {
  const c = FPS.find((f) => f.id === 'namwon-change');
  assert.equal(c.ledger, false);
  assert.equal(c.value, 456);
  assert.equal(c.note, '비지도');
});

test('제주 불법건축물은 GeoJSON 에서 bbox·건수를 세고 `추정` 태그를 단다', () => {
  const j = M.jejuFootprint(JEJU);
  assert.equal(j.value, JEJU.features.length);
  assert.equal(j.tag, '추정');
  assert.equal(M.cellOf(j.bbox[0]), 126.75);
  assert.equal(M.cellOf(j.bbox[1]), 33.5);
});

/* ── 셀 등급 ──────────────────────────────────────────────────────────── */
test('셀은 11개 — 남원 6 · 여수 2 · 제주 1 · 국산리 1 · 예정 1', () => {
  assert.equal(CELLS.length, 11);
});

test('남원 127.25–127.50 / 35.50–35.75 = 결과 3건 · 영상 4시점', () => {
  const c = cell(127.25, 35.5);
  assert.equal(c.ai, 3);
  assert.equal(c.data, 4);
  assert.equal(M.gradeOf(c, 'ai'), 'a3');
  assert.equal(M.gradeOf(c, 'data'), 'd3');
});

test('국산리 셀은 학습데이터만 있고 결과가 없다', () => {
  const c = cell(126.75, 35.75);
  assert.equal(c.ai, 0);
  assert.equal(c.data, 1);
  assert.equal(M.gradeOf(c, 'ai'), 'a0');
});

test('여수 셀은 결과만 있고 커밋된 정사영상이 없다', () => {
  const c = cell(127.5, 34.5);
  assert.equal(c.ai, 2);
  assert.equal(c.data, 0);
  assert.equal(M.gradeOf(c, 'data'), 'd0');
});

test('조사 예정 셀은 서비스 대장의 count 0 항목에서 나온다(울주 산림·탄소)', () => {
  const c = cell(129, 35.5);
  assert.equal(c.planned.length, 2);
  assert.equal(M.gradeOf(c, 'ai'), 'plan');
  assert.equal(M.gradeOf(c, 'data'), 'plan');
  assert.ok(M.PLANNED_SERVICES.every((s) => s.count === 0));
});

test('영상 시점 수는 취득 월(captured)의 **중복 없는** 개수다', () => {
  const c = cell(127.25, 35.5);
  assert.ok(c.imagery.length > c.data);                 // 남원 AOI 4 + 전역 2 = 6 세트, 시점은 4
  assert.equal(new Set(c.imagery.map((i) => i.captured)).size, 4);
});

/* ── 범례 = 집계값 ────────────────────────────────────────────────────── */
test('범례 셀 수의 합은 셀 총수와 같다(빠지는 셀 없음)', () => {
  for (const mode of ['ai', 'data']) {
    const lg = M.legendFor(CELLS, mode);
    assert.equal(lg.rows.reduce((a, r) => a + r.n, 0), CELLS.length, mode);
  }
});

test('AI 범례 = 1 · 6 · 2 · 1 · 1 (계산값)', () => {
  const lg = M.legendFor(CELLS, 'ai');
  assert.deepEqual(lg.rows.map((r) => r.n), [1, 6, 2, 1, 1]);
  assert.equal(lg.head, '그리드 0.25° · 청록 진하기 = 결과 건수');
});

test('데이터 범례 = 1 · 6 · 1 · 2 · 1 (계산값)', () => {
  const lg = M.legendFor(CELLS, 'data');
  assert.deepEqual(lg.rows.map((r) => r.n), [1, 6, 1, 2, 1]);
  assert.equal(lg.head, '그리드 0.25° · 흰 진하기 = 영상 시점 수');
});

/* ── 콜아웃 = 원판 문구 ───────────────────────────────────────────────── */
test('남원 셀 AI 콜아웃이 원판(§12.8) 문구와 같다', () => {
  const c = M.calloutFor(cell(127.25, 35.5), 'ai');
  assert.equal(c.place, '남원');
  assert.equal(c.coords, '127.25–127.50 E · 35.50–35.75 N');
  assert.equal(c.head, 'AI 분석 결과 <b>3건</b>');
  assert.equal(c.lines[0].t, '농지이용 2,098필지 · 비닐하우스 9,664동');
  assert.equal(c.lines[1].t, '변화지수 456폴리곤 <i>· 비지도</i>');
});

test('남원 셀 데이터 콜아웃이 원판(§12.8) 문구와 같다', () => {
  const c = M.calloutFor(cell(127.25, 35.5), 'data');
  assert.equal(c.head, '학습데이터 <b>4시점</b> · 드론');
  assert.equal(c.lines[0].t, '2025-04 · 06 · 08 · 10 · GSD 1.08–1.69 cm');
  assert.equal(c.lines[1].t, '라벨 연결 2,098 + 1,674필지');
});

test('결과가 없는 셀에는 `라벨 연결` 줄을 쓰지 않는다 — 0 을 지어내지 않는다', () => {
  const c = M.calloutFor(cell(126.75, 35.75), 'data');
  assert.ok(!c.lines.some((l) => /라벨 연결/.test(l.t)));
});

test('제주 셀 콜아웃에는 `추정` 태그가 붙는다(발행 카드와 매핑되지 않음)', () => {
  const c = M.calloutFor(cell(126.75, 33.5), 'ai');
  assert.ok(c.lines.some((l) => l.tag === '추정'));
});

test('예정 셀 콜아웃은 `조사 예정 · 시연` 이고 결과 0 을 숫자로 꾸미지 않는다', () => {
  const c = M.calloutFor(cell(129, 35.5), 'plan');
  assert.equal(c.head, '조사 예정 · 시연');
  assert.ok(/산림 훼손 탐지/.test(c.lines[0].t));
});

test('셀 bbox 는 XI맵 링크에 쓰는 값이다 — 0.25° 정사각', () => {
  const b = M.cellBBox(cell(127.25, 35.5));
  assert.deepEqual(b, [127.25, 35.5, 127.5, 35.75]);
});

/* ── 판 카메라 ────────────────────────────────────────────────────────── */
test('판 카메라 bounds 는 원판 캡처값이고 그리드는 124–131 / 33–39 다', () => {
  assert.deepEqual(M.PLATE_BOUNDS, [119.536, 33.0, 135.964, 38.9]);
  assert.deepEqual(M.GRID, { w: 124, s: 33, e: 131, n: 39 });
  assert.equal(M.CELL, 0.25);
});
