// F1-B J1 견적 → 제출 → 완료 → PMTiles 스냅샷(206 Range) — 실추론(A6000 · car_v2_obb × 익산 황등 1.36cm) · LX_API=on 전용
import { test, expect } from '@playwright/test';

const API = process.env.LX_API === 'on' ? (process.env.LX_API_BASE || 'http://localhost:8700') : null;
const PW = process.env.DEV_PASSWORD || 'landxi-dev-2026';
test.skip(!API, 'LX_API=on 전용(게이트웨이 :8700 · 워커)');

// 영상용 AOI(완료 ≤ 25s 역산 · 2026-09-26 실측 378 shard · 20.0s)
const AOI = { type: 'Polygon', coordinates: [[[126.9467, 35.9956], [126.9495, 35.9956], [126.9495, 35.9975], [126.9467, 35.9975], [126.9467, 35.9956]]] };
const BODY = { kind: 'infer', model_id: 'car_v2_obb', imagery_id: 'axis-iksan-hwangdeung', aoi: AOI, options: { chip: 1024, overlap: 0.125, conf: 0.25 }, demo: false, priority: 0 };
const isEnv = (e) => e && typeof e === 'object' && 'value' in e && 'basis' in e && 'source' in e;

test('견적(면적 · shard · GPU·s 추정=bench) → 제출 → done → 스냅샷 206', async ({ request }) => {
  test.setTimeout(240000);
  const tok = (await (await request.post(API + '/api/v1/auth/login', { data: { realm: 'lx', login: 'test@lx.or.kr', password: PW } })).json()).token;
  const h = { authorization: 'Bearer ' + tok };
  const q = await (await request.post(API + '/api/v1/jobs/quote', { headers: h, data: BODY })).json();
  expect(isEnv(q.area_km2)).toBeTruthy(); expect(q.area_km2.basis).toBe('measured');
  expect(q.shards).toBeGreaterThan(100);
  expect(isEnv(q.gpu_s)).toBeTruthy(); expect(q.gpu_s.basis).toBe('estimate'); expect(q.gpu_s.source).toContain('models.perf');
  expect(q.allowed).toBe(true);
  const sub = await request.post(API + '/api/v1/jobs', { headers: h, data: BODY });
  expect(sub.status()).toBe(202);
  const id = (await sub.json()).job.id;
  let j;
  for (let i = 0; i < 200; i++) { j = await (await request.get(API + '/api/v1/jobs/' + id, { headers: h })).json(); if (j.state === 'failed' || (j.state === 'done' && j.snapshot_ready)) break; await new Promise((r) => setTimeout(r, 1000)); }
  console.log(JSON.stringify({ id, state: j.state, shards: j.shards_total, done: j.shards_done, counts: j.counts, result_set: j.result_set }));
  expect(j.state).toBe('done'); expect(j.shards_done).toBe(j.shards_total);
  expect(isEnv(j.counts_env)).toBeTruthy();
  const s = await (await request.get(API + '/tiles/sign?set=' + encodeURIComponent(j.result_set), { headers: h })).json();
  const pm = await request.get(s.url, { headers: { range: 'bytes=0-126' } });
  expect(pm.status()).toBe(206);
  expect((await pm.body()).subarray(0, 7).toString()).toBe('PMTiles');
});

// v1.1-17 · F1-B must_fix 5 — 같은 기관 P0 작업 3건 동시: 새 작업의 첫 묶음 선점 → 각 첫 shard.done ≤ 8 s [실측] (단독 ≤ 5 s 는 f1b-sse · pytest)
const SMALL = [
  { type: 'Polygon', coordinates: [[[126.9467, 35.9956], [126.9475, 35.9956], [126.9475, 35.9962], [126.9467, 35.9962], [126.9467, 35.9956]]] },
  { type: 'Polygon', coordinates: [[[126.9477, 35.9956], [126.9485, 35.9956], [126.9485, 35.9962], [126.9477, 35.9962], [126.9477, 35.9956]]] },
  { type: 'Polygon', coordinates: [[[126.9487, 35.9956], [126.9495, 35.9956], [126.9495, 35.9962], [126.9487, 35.9962], [126.9487, 35.9956]]] },
];
async function firstShardMs(url, t0) {
  const res = await fetch(url, { headers: { accept: 'text/event-stream' } });
  const rd = res.body.getReader(); const dec = new TextDecoder(); let buf = '';
  for (;;) {
    const { value, done } = await rd.read(); if (done) return null;
    buf += dec.decode(value, { stream: true });
    if (/event: shard\.done/.test(buf)) { rd.cancel().catch(() => {}); return Date.now() - t0; }
  }
}
test('동시 3건(같은 기관 P0) — 각 첫 shard.done ≤ 8 s · 첫 묶음 선점', async ({ request }) => {
  test.setTimeout(240000);
  const tok = (await (await request.post(API + '/api/v1/auth/login', { data: { realm: 'lx', login: 'test@lx.or.kr', password: PW } })).json()).token;
  const h = { authorization: 'Bearer ' + tok };
  const t0 = Date.now();
  const ids = await Promise.all(SMALL.map(async (aoi) => (await (await request.post(API + '/api/v1/jobs', { headers: h, data: { ...BODY, aoi, label: 'e2e 동시 3건' } })).json()).job.id));
  const ms = await Promise.all(ids.map((id) => firstShardMs(`${API}/api/v1/events/jobs/${id}?access_token=${tok}`, t0)));
  console.log(JSON.stringify({ concurrent: 3, ids, first_shard_done_ms: ms, basis: 'measured' }));
  for (const m of ms) { expect(m).not.toBeNull(); expect(m).toBeLessThanOrEqual(8000); }
  for (const id of ids) {
    let j; for (let i = 0; i < 120; i++) { j = await (await request.get(API + '/api/v1/jobs/' + id, { headers: h })).json(); if (['done', 'failed'].includes(j.state)) break; await new Promise((r) => setTimeout(r, 1000)); }
    expect(j.state).toBe('done');
  }
});
