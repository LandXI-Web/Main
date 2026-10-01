// F1-B demo:true(영업 세션) — 실제로 추론하되 detections 0행 · usage_events tenant_id='lx-demo' n행 · LX_API=on 전용(psql 은 docker exec)
import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';

const API = process.env.LX_API === 'on' ? (process.env.LX_API_BASE || 'http://localhost:8700') : null;
const PW = process.env.DEV_PASSWORD || 'landxi-dev-2026';
test.skip(!API, 'LX_API=on 전용(게이트웨이 :8700 · 워커 · docker landxi-postgis)');

const psql = (sql) => execFileSync('docker', ['exec', 'landxi-postgis', 'psql', '-U', 'postgres', '-d', 'landxi', '-tAc', sql], { encoding: 'utf8' }).trim();
const AOI = { type: 'Polygon', coordinates: [[[126.9480, 35.9960], [126.9492, 35.9960], [126.9492, 35.9969], [126.9480, 35.9969], [126.9480, 35.9960]]] };

test('영업 세션 demo:true → detections 0 · usage_events lx-demo n행 · 결과는 demo 영역에만', async ({ request }) => {
  test.setTimeout(180000);
  const tok = (await (await request.post(API + '/api/v1/auth/login', { data: { realm: 'lx', login: 'sales@lx.or.kr', password: PW } })).json()).token;
  const h = { authorization: 'Bearer ' + tok };
  // 영업은 demo:false 를 보내도 demo 로 강제된다(계약 §3)
  const sub = await request.post(API + '/api/v1/jobs', { headers: h, data: { kind: 'infer', model_id: 'car_v2_obb', imagery_id: 'axis-iksan-hwangdeung', aoi: AOI, options: { chip: 1024, overlap: 0.125, conf: 0.25 }, demo: true, priority: 0 } });
  expect(sub.status()).toBe(202);
  const job = (await sub.json()).job;
  expect(job.demo).toBe(true);
  let j;
  for (let i = 0; i < 150; i++) { j = await (await request.get(API + '/api/v1/jobs/' + job.id, { headers: h })).json(); if (['done', 'failed'].includes(j.state) && (j.snapshot_ready || j.state === 'failed')) break; await new Promise((r) => setTimeout(r, 1000)); }
  expect(j.state).toBe('done');
  const det = Number(psql(`select count(*) from detections where job_id='${job.id}'`));
  const ue = Number(psql(`select count(*) from usage_events where job_id='${job.id}' and tenant_id='lx-demo'`));
  const ueOther = Number(psql(`select count(*) from usage_events where job_id='${job.id}' and tenant_id<>'lx-demo'`));
  console.log(JSON.stringify({ job: job.id, detections: det, usage_lx_demo: ue, usage_other: ueOther, counts: j.counts }));
  expect(det).toBe(0);
  expect(ue).toBeGreaterThan(0);
  expect(ueOther).toBe(0);
  expect(Object.values(j.counts || {}).reduce((a, b) => a + b, 0)).toBeGreaterThan(0);   // 추론은 실제로 했다
});
