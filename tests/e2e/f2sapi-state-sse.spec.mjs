// F2-S · POST /survey/findings/{id}/state → 기관 스트림(/events/tenant) finding.state 도착 ≤ 1s · 멱등 · 409 · LX_API=on 전용
// 표본: R2 C등급 점수 최하위권 1건 — 끝나면 afterAll 이 open 으로 되돌린다(server/survey 헬퍼).
import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const BASE = process.env.LX_SURVEY_API || process.env.LX_API_BASE || (process.env.LX_API === 'on' ? 'http://127.0.0.1:8700' : null);
const API = BASE ? BASE + '/api/v1' : null;
const PW = process.env.DEV_PASSWORD || 'landxi-dev-2026';
test.skip(!API, 'LX_API=on 전용');
const SERVER = path.resolve('server');
const helper = (...args) => execFileSync('python', ['-m', 'survey.pipelines.dev_state', ...args], { cwd: SERVER, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } }).toString().trim();
let FID = null;

test.beforeAll(() => { FID = helper('pick', '5'); });
test.afterAll(() => { if (FID) helper('reset', FID); });

test('상태 쓰기 → tenant 스트림 finding.state ≤ 1s · 같은 client_id 재전송 = 멱등 · 역방향 409', async ({ request }) => {
  const lr = await request.post(API + '/auth/login', { data: { realm: 'tenant', tenant_id: 'namwon', login: 'lxadmin@lx.or.kr', site: 'gov', password: PW } });
  const token = (await lr.json()).token;
  const h = { authorization: 'Bearer ' + token };
  const ctl = new AbortController();
  const res = await fetch(`${API}/events/tenant?access_token=${token}`, { signal: ctl.signal });
  expect(res.status).toBe(200);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  const got = new Promise((resolve) => {
    (async () => {
      for (;;) {
        let r;
        try { r = await reader.read(); } catch { return; }
        if (r.done) return;
        buf += dec.decode(r.value, { stream: true }).split('\r\n').join('\n');   // sse-starlette 는 CRLF
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, i).replace(/\r/g, ''); buf = buf.slice(i + 2);
          const ev = /^event: (.*)$/m.exec(block)?.[1];
          const data = /^data: (.*)$/m.exec(block)?.[1];
          if (ev === 'finding.state' && data) {
            const d = JSON.parse(data);
            if (d.id === FID) return resolve({ d, t: Date.now() });
          }
        }
      }
    })();
  });
  await new Promise((r) => setTimeout(r, 400));   // 스트림 커서가 잡힐 때까지
  const cid = 'e2e-sse-' + Date.now();
  const t0 = Date.now();
  const w = await request.post(`${API}/survey/findings/${FID}/state`, { headers: h, data: { state: 'inspected', client_id: cid } });   // 배정 없음(원칙 40) — 판정 전 → 확인
  expect(w.status()).toBe(200);
  const wj = await w.json();
  expect(wj.state).toBe('inspected');
  expect(wj.event.from).toBe('open');
  const arr = await Promise.race([got, new Promise((r) => setTimeout(() => r(null), 3000))]);
  ctl.abort();
  expect(arr, 'finding.state 가 기관 스트림에 도착').not.toBeNull();
  const lag = arr.t - t0;
  test.info().annotations.push({ type: 'sse_lag_ms', description: String(lag) });
  console.log(`finding.state 도착 ${lag} ms (POST 시작 → SSE 수신)`);
  expect(lag).toBeLessThanOrEqual(1000);
  expect(arr.d.from).toBe('open');
  expect(arr.d.to).toBe('inspected');
  expect(arr.d.pnu).toBe(FID.split('_')[2]);
  const w2 = await request.post(`${API}/survey/findings/${FID}/state`, { headers: h, data: { state: 'inspected', client_id: cid } });
  expect(w2.status()).toBe(200);
  expect((await w2.json()).idempotent).toBe(true);
  const w3 = await request.post(`${API}/survey/findings/${FID}/state`, { headers: h, data: { state: 'inspected', client_id: cid + '-b' } });
  expect(w3.status()).toBe(409);
  expect((await w3.json()).error.code).toBe('finding_state_invalid');
});
