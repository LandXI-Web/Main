// F1-B 관문 — build=public 카탈로그 자체 영상 0 · tenant 세션 raw/cog 403 · 무서명 기관 결과 세트 403 · V-World 프록시 503(키 권한 미반영) · LX_API=on 전용
import { test, expect } from '@playwright/test';

const API = process.env.LX_API === 'on' ? (process.env.LX_API_BASE || 'http://localhost:8700') : null;
const PW = process.env.DEV_PASSWORD || 'landxi-dev-2026';
test.skip(!API, 'LX_API=on 전용(게이트웨이 :8700)');

const LOGIN = { namwon: 'namwon-manager', 'gwangju-jeonnam': 'gj-manager' };
async function tenantTok(request, tenant = 'namwon') {
  const r = await request.post(API + '/api/v1/auth/login', { data: { realm: 'tenant', tenant_id: tenant, login: LOGIN[tenant], password: PW } });
  expect(r.status()).toBe(200);
  return (await r.json()).token;
}

test('게스트 build=public — 자체 영상 0 · 외부 위성만 · lx 로 올려 달라 해도 public', async ({ request }) => {
  const j = await (await request.get(API + '/api/v1/catalog/layers?build=public')).json();
  expect(j.build).toBe('public');
  const own = j.items.filter((i) => i.role === 'imagery' && ['pmtiles', 'xyz', 'cog'].includes(i.source));
  expect(own.map((i) => i.id)).toEqual([]);
  expect(j.items.some((i) => i.id === 'xdworld-satellite')).toBeTruthy();
  const up = await (await request.get(API + '/api/v1/catalog/layers?build=lx')).json();
  expect(up.build).toBe('public');
});

test('tenant 세션 — raw/cog 없음 · 원본 라우트 403', async ({ request }) => {
  const tok = await tenantTok(request);
  const h = { authorization: 'Bearer ' + tok };
  const j = await (await request.get(API + '/api/v1/catalog/layers', { headers: h })).json();
  expect(j.build).toBe('tenant');
  expect(j.items.filter((i) => i.tier === 'raw' || i.source === 'cog')).toEqual([]);
  const r1 = await request.get(API + '/api/v1/catalog/imagery/axis-iksan-hwangdeung', { headers: h });
  expect(r1.status()).toBe(403); expect((await r1.json()).error.code).toBe('imagery_forbidden');
  expect((await request.get(API + '/tiles/cog/axis-iksan-hwangdeung/18/222800/102100.webp', { headers: h })).status()).toBe(403);
  expect((await request.get(API + '/tiles/pmtiles/imagery/axis_iksan_hwangdeung.pmtiles', { headers: { range: 'bytes=0-126' } })).status()).toBe(403);
});

test('무서명 기관 결과 세트 403 · 서명 206 · 다른 기관 서명 403', async ({ request }) => {
  const set = 'results/namwon/dp-nw-farm-25@2.1';
  expect((await request.get(`${API}/tiles/pmtiles/${set}.pmtiles`, { headers: { range: 'bytes=0-126' } })).status()).toBe(403);
  const nw = await tenantTok(request, 'namwon');
  const s = await (await request.get(`${API}/tiles/sign?set=${set}`, { headers: { authorization: 'Bearer ' + nw } })).json();
  const ok = await request.get(s.url, { headers: { range: 'bytes=0-126' } });
  expect(ok.status()).toBe(206); expect(ok.headers()['accept-ranges']).toBe('bytes');
  const gj = await tenantTok(request, 'gwangju-jeonnam');
  expect((await request.get(`${API}/tiles/sign?set=${set}`, { headers: { authorization: 'Bearer ' + gj } })).status()).toBe(403);
});

test('V-World 프록시 — 키 권한 미반영이면 503 vworld_key_pending', async ({ request }) => {
  const r = await request.get(API + '/api/v1/proxy/vworld/data?service=data&request=GetFeature&data=LP_PA_CBND_BUBUN&geomFilter=POINT(127.39%2035.416)');
  if (r.status() === 200) test.info().annotations.push({ type: 'note', description: 'V-World 키 권한 반영됨 — 200' });
  else { expect(r.status()).toBe(503); expect((await r.json()).error.code).toBe('vworld_key_pending'); }
});
