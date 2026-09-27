// F2-B v1.1-16 기관 스트림 GET /api/v1/events/tenant — 관리자 배포 쓰기 → 남원 스트림 deploy.changed ≤ 1 s · 광주전남 0건 ·
// 24h 재생 · 게스트 401 · 교차 기관 403. LX_API=on 전용. finding.state 는 공유 데이터(F2-S 필지 상태)를 바꾸지 않도록 pytest(bus.tenant_event 헬퍼)와
// F2-S 자기 e2e(f2sapi-*)가 맡는다.
import { test, expect } from '@playwright/test';

const API = process.env.LX_API === 'on' ? (process.env.LX_API_BASE || 'http://127.0.0.1:8700') : null;
const PW = process.env.DEV_PASSWORD || 'landxi-dev-2026';
test.skip(!API, 'LX_API=on 전용');

const login = async (request, body) => (await (await request.post(API + '/api/v1/auth/login', { data: { password: PW, ...body } })).json()).token;

function listen(url, ms) {
  const out = []; const ctl = new AbortController();
  const p = (async () => {
    try {
      const res = await fetch(url, { headers: { accept: 'text/event-stream' }, signal: ctl.signal });
      out.status = res.status; if (res.status !== 200) return;
      const rd = res.body.getReader(); const dec = new TextDecoder(); let buf = '';
      for (;;) {
        const { value, done } = await rd.read(); if (done) break;
        buf += dec.decode(value, { stream: true }); let k;
        while ((k = buf.indexOf('\n\n')) >= 0 || (k = buf.indexOf('\r\n\r\n')) >= 0) {
          const block = buf.slice(0, k); buf = buf.slice(k + (buf[k] === '\r' ? 4 : 2));
          const ev = {}; for (const ln of block.split(/\r?\n/)) { const m = ln.match(/^(event|id|data):\s?(.*)$/); if (m) ev[m[1]] = m[2]; }
          if (ev.event) out.push({ ...ev, data: JSON.parse(ev.data || '{}'), at: Date.now() });
        }
      }
    } catch (e) { /* abort */ }
  })();
  setTimeout(() => ctl.abort(), ms);
  return { out, done: p };
}

test('관문 — 게스트 401 · 다른 기관 tenant= 403', async ({ request }) => {
  expect((await request.get(API + '/api/v1/events/tenant')).status()).toBe(401);
  const gj = await login(request, { realm: 'tenant', tenant_id: 'gwangju-jeonnam', login: 'gj-manager' });
  expect((await request.get(`${API}/api/v1/events/tenant?access_token=${gj}&tenant=namwon`)).status()).toBe(403);
});

test('배포 쓰기 → deploy.changed ≤ 1 s(남원) · 광주전남 0건 · 24h 재생', async ({ request }) => {
  test.setTimeout(60000);
  const nw = await login(request, { realm: 'tenant', tenant_id: 'namwon', login: 'namwon-manager' });
  const gj = await login(request, { realm: 'tenant', tenant_id: 'gwangju-jeonnam', login: 'gj-manager' });
  const ad = await login(request, { realm: 'lx', login: 'lx-admin' });
  const A = listen(`${API}/api/v1/events/tenant?access_token=${nw}`, 9000);
  const G = listen(`${API}/api/v1/events/tenant?access_token=${gj}`, 9000);
  await new Promise((r) => setTimeout(r, 1500));
  const cur = await (await request.get(API + '/api/v1/deploys/dp-nw-farm-25', { headers: { authorization: 'Bearer ' + ad } })).json();
  const t0 = Date.now();
  const r = await request.post(API + '/api/v1/deploys/dp-nw-farm-25/pin', { headers: { authorization: 'Bearer ' + ad }, data: { card_version_id: cur.card_version_id } });
  expect(r.status()).toBe(200);
  if (!cur.pinned) await request.post(API + '/api/v1/deploys/dp-nw-farm-25/pin', { headers: { authorization: 'Bearer ' + ad }, data: { card_version_id: null } });
  await Promise.all([A.done, G.done]);
  const got = A.out.find((e) => e.event === 'deploy.changed' && e.data.deploy_id === 'dp-nw-farm-25');
  expect(got).toBeTruthy();
  console.log(JSON.stringify({ deploy_changed_ms: got.at - t0, tenant: got.data.tenant_id, action: got.data.action, basis: 'measured' }));
  expect(got.at - t0).toBeLessThanOrEqual(1000);
  expect(G.out.filter((e) => e.event === 'deploy.changed' && e.data.deploy_id === 'dp-nw-farm-25').length).toBe(0);
  const R = listen(`${API}/api/v1/events/tenant?access_token=${nw}&replay=24h`, 3000);
  await R.done;
  expect(R.out.some((e) => e.id === got.id)).toBeTruthy();
});
