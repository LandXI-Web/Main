// 사전 크롭 "Acquired" 증거 이미지 카탈로그 검증 — tools/crops/make_crops.py 산출물.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { CROPS, cropsFor } from '../../landxi/assets/data/crops.js';

const LANDXI = 'landxi';
const CAP_1X = 90 * 1024;
const CAP_2X = 250 * 1024;
const TOTAL_BUDGET = 12 * 1024 * 1024;

// 대한민국 대략 범위(제주 포함)
const KR = { minLng: 124, maxLng: 132, minLat: 33, maxLat: 39 };

const DATASETS = [
  'yeosu-marine-2025-aerial',
  'yeosu-marine-2026-drone',
  'namwon-farmland-2025',
  'namwon-greenhouse-2025',
  'jeju-illegal',
  'kuksan-change',
  'namwon-epoch',
];

test('CROPS 는 지정된 데이터셋 키를 모두 갖고, 각 4건 이상이다', () => {
  for (const id of DATASETS) {
    assert.ok(Array.isArray(CROPS[id]), `CROPS.${id} 존재`);
    assert.ok(CROPS[id].length >= 4, `CROPS.${id}.length >= 4 (실제 ${CROPS[id]?.length})`);
  }
});

test('cropsFor 헬퍼', () => {
  assert.equal(cropsFor('namwon-farmland-2025').length, CROPS['namwon-farmland-2025'].length);
  assert.deepEqual(cropsFor('__nope__'), []);
});

test('여수 항공/드론 top-8 은 conf 내림차순이다', () => {
  for (const id of ['yeosu-marine-2025-aerial', 'yeosu-marine-2026-drone']) {
    const confs = CROPS[id].map((c) => c.conf);
    for (let i = 1; i < confs.length; i++) assert.ok(confs[i - 1] >= confs[i], `${id} 정렬`);
  }
});

let totalBytes = 0;

test('모든 크롭 항목: 좌표가 한국 범위 내, 필수 필드 존재, 파일 실존·용량 예산 내', () => {
  for (const id of DATASETS) {
    for (const [i, c] of CROPS[id].entries()) {
      const label = `${id}#${i + 1}`;
      assert.ok(Array.isArray(c.lnglat) && c.lnglat.length === 2, `${label}.lnglat`);
      const [lng, lat] = c.lnglat;
      assert.ok(lng >= KR.minLng && lng <= KR.maxLng, `${label}.lnglat[0] ${lng} 범위`);
      assert.ok(lat >= KR.minLat && lat <= KR.maxLat, `${label}.lnglat[1] ${lat} 범위`);
      assert.ok(['ortho', 'vworld'].includes(c.source), `${label}.source`);
      assert.ok(typeof c.gsd === 'number' && c.gsd > 0, `${label}.gsd`);
      assert.ok('conf' in c && 'cls' in c && 'area_m2' in c && 'epoch' in c, `${label} 필드 존재(null 허용)`);

      for (const [key, cap] of [['file', CAP_1X], ['file2x', CAP_2X]]) {
        const rel = c[key];
        assert.ok(rel && rel.startsWith('assets/proto/crops/'), `${label}.${key} 경로`);
        const abs = path.join(LANDXI, rel);
        assert.ok(fs.existsSync(abs), `${label}.${key} 파일 실존: ${abs}`);
        const size = fs.statSync(abs).size;
        assert.ok(size <= cap, `${label}.${key} 용량 ${size} <= ${cap}`);
        totalBytes += size;
      }
      if (c.clean) {
        const abs = path.join(LANDXI, c.clean);
        assert.ok(fs.existsSync(abs), `${label}.clean 파일 실존: ${abs}`);
        const size = fs.statSync(abs).size;
        assert.ok(size <= CAP_1X, `${label}.clean 용량 ${size} <= ${CAP_1X}`);
        totalBytes += size;
      }
    }
  }
});

test('전체 crops 디렉터리 용량이 12MB 예산 이내다', () => {
  assert.ok(totalBytes > 0, '앞 테스트가 먼저 실행되어 totalBytes 를 채워야 함');
  assert.ok(totalBytes <= TOTAL_BUDGET, `총 ${(totalBytes / 1024 / 1024).toFixed(2)}MB <= 12MB`);
});

test('overlay 없는 시계열 데이터셋(kuksan-change/namwon-epoch)은 clean=null, conf/cls/area_m2=null', () => {
  for (const id of ['kuksan-change', 'namwon-epoch']) {
    for (const c of CROPS[id]) {
      assert.equal(c.clean, null, `${id} clean`);
      assert.equal(c.conf, null, `${id} conf`);
      assert.equal(c.cls, null, `${id} cls`);
      assert.equal(c.area_m2, null, `${id} area_m2`);
      assert.ok(c.epoch, `${id} epoch 라벨 존재`);
    }
  }
});

test('overlay 있는 데이터셋은 clean 파일을 갖는다', () => {
  for (const id of ['yeosu-marine-2025-aerial', 'yeosu-marine-2026-drone', 'namwon-farmland-2025',
    'namwon-greenhouse-2025', 'jeju-illegal']) {
    for (const c of CROPS[id]) assert.ok(c.clean, `${id} clean 파일 경로 존재`);
  }
});

test('namwon-epoch 는 4시점(2504/2506/2508/2510)을 모두 갖고, 같은 창(같은 lnglat)이다', () => {
  const rows = CROPS['namwon-epoch'];
  assert.equal(rows.length, 4);
  const epochs = rows.map((r) => r.epoch).sort();
  assert.deepEqual(epochs, ['2025-04', '2025-06', '2025-08', '2025-10']);
  const [lng0, lat0] = rows[0].lnglat;
  for (const r of rows) {
    assert.ok(Math.abs(r.lnglat[0] - lng0) < 1e-6 && Math.abs(r.lnglat[1] - lat0) < 1e-6, '동일 좌표(동일 창)');
  }
});

test('kuksan-change 는 a68/a71 두 시점을 모두 포함한다', () => {
  const rows = CROPS['kuksan-change'];
  assert.ok(rows.some((r) => r.epoch.startsWith('a68')));
  assert.ok(rows.some((r) => r.epoch.startsWith('a71')));
});
