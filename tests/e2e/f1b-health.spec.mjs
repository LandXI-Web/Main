// F1-B 게이트웨이 건강 · 계약 §4 라우트 존재 · 봉투 500(개발 모드) — LX_API=on 일 때만(게이트웨이 :8700 · 워커)
import { test, expect } from '@playwright/test';

const API = process.env.LX_API === 'on' ? (process.env.LX_API_BASE || 'http://localhost:8700') : null;
const PW = process.env.DEV_PASSWORD || 'landxi-dev-2026';
test.skip(!API, 'LX_API=on 전용(게이트웨이 :8700)');

async function login(request, role = 'admin') {
  const r = await request.post(API + '/api/v1/auth/login', { data: { realm: 'lx', login: `lx-${role}`, password: PW } });
  expect(r.status()).toBe(200);
  return (await r.json()).token;
}

test('GET /health ok · redis · pg · 워커 하트비트', async ({ request }) => {
  const j = await (await request.get(API + '/api/v1/health')).json();
  expect(j.ok).toBe(true); expect(j.redis).toBe(true); expect(j.pg).toBe(true);
  expect(j.workers.gpu + j.workers.cpu).toBeGreaterThan(0);
});

test('계약 §4 라우트 전부 존재(404/405 없음)', async ({ request }) => {
  const tok = await login(request, 'admin');
  const h = { authorization: 'Bearer ' + tok };
  const routes = ['/api/v1/me', '/api/v1/catalog/layers', '/api/v1/catalog/imagery/ap25-namwon-2023', '/api/v1/jobs?limit=1',
    '/api/v1/registry/models', '/api/v1/registry/cards', '/api/v1/registry/lineage/dp-nw-farm-25', '/api/v1/deploys', '/api/v1/deploys/dp-nw-farm-25',
    '/api/v1/tenants', '/api/v1/t/namwon/usage', '/api/v1/ops/nodes', '/api/v1/ops/gpus', '/api/v1/ops/queues', '/api/v1/ops/storage',
    '/api/v1/ops/alerts', '/api/v1/ops/models', '/api/v1/ops/tenants', '/api/v1/ops/bench', '/api/v1/results/results/lx/namwon-landcover-2023/stats?by=emd',
    '/api/v1/results/results/lx/namwon-landcover-2023/features?limit=1', '/api/v1/parcels?lng=127.39&lat=35.416'];
  const bad = [];
  for (const p of routes) { const r = await request.get(API + p, { headers: h }); if ([404, 405].includes(r.status()) && !(await r.text()).includes('parcels_unavailable')) bad.push(`${p} ${r.status()}`); }
  expect(bad).toEqual([]);
});

test('봉투 없는 숫자 → 500 envelope_missing(개발 모드)', async ({ request }) => {
  const r = await request.get(API + '/api/v1/_dev/envelope-probe');
  expect(r.status()).toBe(500);
  expect((await r.json()).error.code).toBe('envelope_missing');
});

test('/ops/bench — 모델 3종 × batch 2종 · 외부 점유 조건 기록', async ({ request }) => {
  const tok = await login(request, 'admin');
  const j = await (await request.get(API + '/api/v1/ops/bench', { headers: { authorization: 'Bearer ' + tok } })).json();
  const rows = j.items || j.rows || j;
  const key = (r) => `${r.model_id}@${r.batch}`;
  const got = new Set(rows.map(key));
  for (const m of ['car_v2_obb', 'aerial25/best', 'namwon/Vinyl_house/train2']) for (const b of [8, 16]) expect(got.has(`${m}@${b}`)).toBeTruthy();
  for (const r of rows) { expect(r.chips_per_s.basis).toBe('measured'); expect(r.external_used_mib).toBeTruthy(); }
});
