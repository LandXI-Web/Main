// F2-S · 실태조사 API 계약(v1.1-22) — 응답 봉투 규약 · 오류 형식 3종(401 unauthorized · 404 not_found · 409 finding_state_invalid) · LX_API=on 전용
import { test, expect } from '@playwright/test';

const BASE = process.env.LX_SURVEY_API || process.env.LX_API_BASE || (process.env.LX_API === 'on' ? 'http://127.0.0.1:8700' : null);
const API = BASE ? BASE + '/api/v1' : null;
const PW = process.env.DEV_PASSWORD || 'landxi-dev-2026';
test.skip(!API, 'LX_API=on 전용(게이트웨이 :8700 · 또는 LX_SURVEY_API)');
const BASIS = new Set(['measured', 'estimate', 'demo', 'history', 'inferred', 'recorded']);

async function tok(request, body) {
  const r = await request.post(API + '/auth/login', { data: body });
  expect(r.status()).toBe(200);
  return { authorization: 'Bearer ' + (await r.json()).token };
}
function envs(o, out = []) {
  if (Array.isArray(o)) o.forEach((v) => envs(v, out));
  else if (o && typeof o === 'object') {
    if ('value' in o && 'basis' in o && 'unit' in o) out.push(o);
    Object.values(o).forEach((v) => envs(v, out));
  }
  return out;
}

test('읽기 5 — 봉투 규약(value·unit·basis·as_of·source) · 목록 {items,total(봉투),counts,by_rule,as_of}', async ({ request }) => {
  const h = await tok(request, { realm: 'tenant', tenant_id: 'namwon', login: 'namwon-manager', password: PW });
  const list = await (await request.get(API + '/survey/findings?rule=R1&priority=A&limit=5', { headers: h })).json();
  expect(list.items).toHaveLength(5);
  expect(list.total.value).toBe(759);
  expect(list.total.basis).toBe('inferred');
  expect(Object.keys(list.counts).sort()).toEqual(['assigned', 'closed', 'dismissed', 'inspected', 'open']);
  expect(Object.keys(list.by_rule)).toEqual(['R1', 'R2', 'R3', 'R4', 'R5', 'R6']);
  expect(list.as_of).toBe('2026-09-24');
  const f = list.items[0];
  expect(f.id).toBe('f_R1_5219045021110530012');
  expect(f.geometry.type).toBe('Point');
  for (const p of ['/survey/findings/f_R1_5219045021110530012', '/survey/parcels/5219045021110530012?with=facts,findings,history',
    '/survey/stats?by=emd', '/survey/stats?by=rule', '/survey/stats?by=priority', '/survey/stats?by=state', '/survey/rules',
    '/survey/reports/draft?emd_cd=52190450&rule=R1&top=20&format=json']) {
    const r = await request.get(API + p, { headers: h });
    expect(r.status(), p).toBe(200);
    const e = envs(await r.json());
    expect(e.length, p).toBeGreaterThan(0);
    for (const x of e) {
      expect(BASIS.has(x.basis), p + ' basis ' + x.basis).toBeTruthy();
      expect(typeof x.as_of).toBe('string');
      expect(typeof x.source).toBe('string');
    }
  }
  const one = await (await request.get(API + '/survey/findings/f_R1_5219045021110530012', { headers: h })).json();
  expect(one.explain.lines).toHaveLength(6);
  expect(one.explain.thresholds.every((t) => t.value.basis === 'estimate' && t.value.note.includes('[추정 초기값]'))).toBeTruthy();
  expect(one.explain.ledger_gaps.map((g) => g.label)).toContain('건축물대장 미대조');
  const rules = await (await request.get(API + '/survey/rules', { headers: h })).json();
  expect(Object.fromEntries(rules.items.map((i) => [i.id, i.counts.total.value]))).toEqual({ R1: 4140, R2: 15651, R3: 20, R4: 33, R5: 464, R6: 564 });
});

test('오류 형식 3 — {error:{code,message},request_id}', async ({ request }) => {
  const g = await request.get(API + '/survey/findings');
  expect(g.status()).toBe(401);
  const gj = await g.json();
  expect(gj.error.code).toBe('unauthorized');
  expect(gj.request_id).toMatch(/^req_/);
  const h = await tok(request, { realm: 'tenant', tenant_id: 'namwon', login: 'namwon-manager', password: PW });
  const nf = await request.get(API + '/survey/findings/f_R1_0000000000000000000', { headers: h });
  expect(nf.status()).toBe(404);
  expect((await nf.json()).error.code).toBe('not_found');
  // 건너뛰기 전이(open → closed)는 409 — 상태를 바꾸지 않으므로 표본을 더럽히지 않는다
  const x = await request.post(API + '/survey/findings/f_R2_5219033033113950012/state', { headers: h, data: { state: 'closed', client_id: 'e2e-409-' + Date.now() } });
  expect(x.status()).toBe(409);
  const xj = await x.json();
  expect(xj.error.code).toBe('finding_state_invalid');
  expect(xj.error.detail.from).toBeTruthy();
});
