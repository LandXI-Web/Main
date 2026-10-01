// F1-B 관문 — build=public 카탈로그 자체 영상 0 · tenant 세션 raw/cog 403 · 무서명 기관 결과 세트 403 · V-World 프록시(키 활성 200 · ERROR 502 캐시 금지 · v1.1) · LX_API=on 전용
import { test, expect } from '@playwright/test';

const API = process.env.LX_API === 'on' ? (process.env.LX_API_BASE || 'http://localhost:8700') : null;
const PW = process.env.DEV_PASSWORD || 'landxi-dev-2026';
test.skip(!API, 'LX_API=on 전용(게이트웨이 :8700)');

const LOGIN = { namwon: 'lxadmin@lx.or.kr', 'gwangju-jeonnam': 'lxadmin@lx.or.kr' };   // 각 기관 담당자(메일 아이디 — 원칙 77)
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

test('V-World 프록시 — 키 활성(200 · X-LX-Cache) · status ERROR 는 캐시 없이 502 upstream_error(v1.1)', async ({ request }) => {
  const ok = await request.get(API + '/api/v1/proxy/vworld/data?service=data&request=GetFeature&data=LP_PA_CBND_BUBUN&geomFilter=POINT(127.39%2035.416)&size=1');
  if (ok.status() === 503) { expect((await ok.json()).error.code).toBe('vworld_key_pending'); test.info().annotations.push({ type: 'note', description: '키 권한 미반영 — 503' }); return; }
  expect(ok.status()).toBe(200);
  expect(['hit', 'miss']).toContain(ok.headers()['x-lx-cache']);
  expect((await ok.json()).response.status).toBe('OK');
  const again = await request.get(API + '/api/v1/proxy/vworld/data?service=data&request=GetFeature&data=LP_PA_CBND_BUBUN&geomFilter=POINT(127.39%2035.416)&size=1');
  expect(again.headers()['x-lx-cache']).toBe('hit');
  // request 파라미터 빠진 요청 → V-World 는 200 + status ERROR(PARAM_REQUIRED) → 게이트웨이 502 · 캐시 없음(두 번째도 상류)
  for (let i = 0; i < 2; i++) {
    const bad = await request.get(API + '/api/v1/proxy/vworld/data?data=LP_PA_CBND_BUBUN');
    expect(bad.status()).toBe(502);
    const e = (await bad.json()).error;
    expect(e.code).toBe('upstream_error'); expect(e.detail.upstream_code).toBe('PARAM_REQUIRED'); expect(e.detail.cached).toBe(false);
    expect(bad.headers()['x-lx-cache']).toBeUndefined();
  }
  // F2-B 1차 판정 재현: geomFilter 없는 GetFeature → V-World 200 + INVALID_RANGE 본문(text 안 `단일검색="Y"` 로 JSON 이 깨짐)
  // 예전: json.loads 실패 → 7일 캐시 → 200 · hit. 지금: 원문 바이트 판정 → 502 · 캐시 없음(두 번째도 상류)
  for (let i = 0; i < 2; i++) {
    const bad = await request.get(API + '/api/v1/proxy/vworld/data?service=data&request=GetFeature&data=LP_PA_CBND_BUBUN&size=1');
    expect(bad.status()).toBe(502);
    const e = (await bad.json()).error;
    expect(e.code).toBe('upstream_error'); expect(e.detail.upstream_code).toBe('INVALID_RANGE'); expect(e.detail.cached).toBe(false);
    expect(bad.headers()['x-lx-cache']).toBeUndefined();
  }
});
