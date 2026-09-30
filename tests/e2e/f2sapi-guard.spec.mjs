// F2-S · 실태조사 관문 — 게스트 401 · 타 기관 0 · 성명 열 0 · sales 읽기 OK/쓰기 403 · LX_API=on 전용
import { test, expect } from '@playwright/test';

const BASE = process.env.LX_SURVEY_API || process.env.LX_API_BASE || (process.env.LX_API === 'on' ? 'http://127.0.0.1:8700' : null);
const API = BASE ? BASE + '/api/v1' : null;
const PW = process.env.DEV_PASSWORD || 'landxi-dev-2026';
test.skip(!API, 'LX_API=on 전용');

async function tok(request, body) {
  const r = await request.post(API + '/auth/login', { data: body });
  expect(r.status()).toBe(200);
  return { authorization: 'Bearer ' + (await r.json()).token };
}
const ROUTES = ['/survey/findings', '/survey/findings/f_R1_5219045021110530012', '/survey/parcels/5219045021110530012',
  '/survey/stats?by=emd', '/survey/rules', '/survey/reports/draft?emd_cd=52190450&format=json'];

test('게스트 — 실태조사 라우트 전부 401', async ({ request }) => {
  for (const p of ROUTES) {
    const r = await request.get(API + p);
    expect(r.status(), p).toBe(401);
  }
  const w = await request.post(API + '/survey/findings/f_R1_5219045021110530012/state', { data: { state: 'inspected', client_id: 'g' } });
  expect(w.status()).toBe(401);
});

test('다른 기관(광주·전남) — 남원 실태조사 0건 · 단건 404', async ({ request }) => {
  const h = await tok(request, { realm: 'tenant', tenant_id: 'gwangju-jeonnam', login: 'gj-manager', password: PW });
  // 광주전남은 제 시군구(여수·목포 등) 실태조사를 가진다 — 남원 것은 0건이어야 한다
  const j = await (await request.get(API + '/survey/findings?limit=50&sgg=52190', { headers: h })).json();
  expect(j.total.value).toBe(0);
  expect(j.items).toEqual([]);
  const mine = await (await request.get(API + '/survey/findings?limit=200', { headers: h })).json();
  expect(mine.items.filter((it) => String(it.pnu || '').startsWith('52190'))).toEqual([]);
  expect((await request.get(API + '/survey/findings/f_R1_5219045021110530012', { headers: h })).status()).toBe(404);
  expect((await request.get(API + '/survey/parcels/5219045021110530012', { headers: h })).status()).toBe(404);
  const s = await (await request.get(API + '/survey/stats?by=rule&sgg=52190', { headers: h })).json();
  expect(s.total.value).toBe(0);
  const w = await request.post(API + '/survey/findings/f_R1_5219045021110530012/state', { headers: h, data: { state: 'inspected', client_id: 'gj-' + Date.now() } });
  expect(w.status()).toBe(404);
});

test('성명 열 0 — 응답 키에 소유자 성명 없음(연속지적 미제공 결손으로만 표기)', async ({ request }) => {
  const h = await tok(request, { realm: 'tenant', tenant_id: 'namwon', login: 'namwon-manager', password: PW });
  const keys = new Set();
  const walk = (o) => { if (Array.isArray(o)) o.forEach(walk); else if (o && typeof o === 'object') { Object.keys(o).forEach((k) => keys.add(k)); Object.values(o).forEach(walk); } };
  for (const p of ['/survey/findings?limit=200', '/survey/parcels/5219045021110530012?with=all', '/survey/reports/draft?emd_cd=52190450&rule=R1&top=20']) {
    const j = await (await request.get(API + p, { headers: h })).json();
    walk(j);
    expect(JSON.stringify(j)).not.toContain('OWNER_NM');
  }
  expect([...keys].filter((k) => /owner_?nm|owner_?name|성명/i.test(k))).toEqual([]);
  const p = await (await request.get(API + '/survey/parcels/5219045021110530012?with=facts', { headers: h })).json();
  expect(p.facts.ledger.owner_kind).toBeNull();
  expect(p.facts.gaps.map((g) => g.label)).toContain('소유구분 연속지적 미제공');
});

test('LX 영업 — 읽기 OK · 상태 쓰기 403', async ({ request }) => {
  const h = await tok(request, { realm: 'lx', login: 'lx-sales', password: PW });
  expect((await request.get(API + '/survey/findings?limit=1', { headers: h })).status()).toBe(200);
  const w = await request.post(API + '/survey/findings/f_R1_5219045021110530012/state', { headers: h, data: { state: 'inspected', client_id: 's-' + Date.now() } });
  expect(w.status()).toBe(403);
});
