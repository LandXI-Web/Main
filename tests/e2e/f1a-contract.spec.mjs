// F1-A 계약 spec — 픽스처 키 집합 = server/fixtures/contract(F1-B) · 두 모드 부팅(data-lx=ready · 콘솔 오류 0 · 마스트 정직 표기)
// 실행: npx playwright test tests/e2e/f1a- --reporter=line   ·   LX_API=on DEV_PASSWORD=… npx playwright test tests/e2e/f1a-
import { test, expect } from '@playwright/test';
import fs from 'node:fs';

/* ── F1-CONTRACT §12 픽스처(각 spec 안에 복사 · _roles.mjs import 금지) ── */
const API = process.env.LX_API === 'on' ? 'http://localhost:8700' : null;
async function bootApi(page, url, { realm = 'lx', role = 'staff', tenant = null } = {}) {
  let session = null;
  if (API && realm) {
    const r = await fetch(API + '/api/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(realm === 'lx' ? { realm, login: `lx-${role}`, password: process.env.DEV_PASSWORD } : { realm, tenant_id: tenant, login: `${tenant}-manager`, password: process.env.DEV_PASSWORD }) });
    session = await r.json();
  }
  await page.addInitScript(([s, api, realm, role, tenant]) => {
    if (sessionStorage.getItem('lx_e2e_boot')) return; sessionStorage.setItem('lx_e2e_boot', '1');
    if (api) { localStorage.setItem('lx_api_base', api); localStorage.removeItem('lx_api_mode'); } else localStorage.setItem('lx_api_mode', 'off');
    if (s) localStorage.setItem('lx_api_session', JSON.stringify(s)); else localStorage.removeItem('lx_api_session');
    if (realm === 'lx') { localStorage.setItem('lx_logged_in', '1'); localStorage.setItem('lx_role', role); localStorage.removeItem('lx_tenant_session'); }
    else if (realm === 'tenant') { localStorage.removeItem('lx_logged_in'); localStorage.removeItem('lx_role'); localStorage.setItem('lx_tenant_session', JSON.stringify({ tenant, at: '2026-09-24T09:00:00+09:00' })); }
    else { localStorage.removeItem('lx_logged_in'); localStorage.removeItem('lx_role'); localStorage.removeItem('lx_tenant_session'); }
  }, [session, API, realm, role, tenant]);
  await page.goto(url);
  await page.waitForFunction(() => document.documentElement.dataset.lx === 'ready', null, { timeout: 45000 });
}
function watch(page) {
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  return errs;
}
const XI = '/landxi/xi/index.html';

const keys = (o) => Object.keys(o || {}).filter((k) => !k.startsWith('_')).sort();
const contract = (name) => JSON.parse(fs.readFileSync(`server/fixtures/contract/${name}.json`, 'utf8'));

test.describe('F1-A 계약', () => {
  test('카탈로그 픽스처 키 집합 = 계약 §4.1 LayerItem(선택 키 허용)', () => {
    const c = contract('catalog_layers');
    const want = new Set(keys(c.body.items[0]));
    const opt = new Set([...(c.optional_nested?.['items[]'] || [])]);
    const fx = JSON.parse(fs.readFileSync('landxi/xi/data/catalog-fixture.json', 'utf8'));
    for (const build of ['lx', 'tenant:namwon', 'public']) {
      expect(keys(fx[build]).filter((k) => !['as_of', 'items', 'ladder'].includes(k))).toEqual([]);
      for (const it of fx[build].items) {
        const got = new Set(keys(it));
        for (const k of want) expect(got.has(k), `${build}/${it.id} 에 ${k} 없음`).toBeTruthy();
        for (const k of got) expect(want.has(k) || opt.has(k), `${build}/${it.id} 의 ${k} 는 계약 밖`).toBeTruthy();
      }
    }
    // 공개 빌드 = 외부 위성 + export public 결과만(자체 영상 0)
    const pub = fx.public.items;
    expect(pub.filter((i) => i.role === 'imagery' && i.source !== 'external')).toEqual([]);
    expect(pub.filter((i) => i.role === 'result').every((i) => i.export_policy === 'public')).toBeTruthy();
  });
  test('배포본 픽스처 키 집합 = 계약 §4.7 Deploy', () => {
    const c = contract('deploys_list');
    const want = keys(c.body.items[0]);
    const fx = JSON.parse(fs.readFileSync('landxi/xi/data/deploys-fixture.json', 'utf8'));
    for (const d of fx.items) expect(keys(d), d.id).toEqual(want);
    expect(fx.items.map((d) => d.id)).toEqual(expect.arrayContaining(['dp-nw-farm-25', 'dp-nw-change', 'dp-kgz-agri-farm-26', 'dp-mm-meiktila-25', 'dp-kgz-land-change-26']));
  });
  test('리플레이 이벤트 이름 ⊆ 계약 §5.1 · 숫자는 봉투', () => {
    const names = new Set(JSON.parse(fs.readFileSync('server/fixtures/contract/_sse_and_errors.json', 'utf8')).jobs);
    const lines = fs.readFileSync('landxi/xi/data/replay/j1-hwangdeung.ndjson', 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    for (const l of lines) expect(names.has(l.event), l.event).toBeTruthy();
    const done = lines.find((l) => l.event === 'job.done');
    for (const k of ['value', 'unit', 'basis', 'as_of', 'source']) expect(done.data.counts_env).toHaveProperty(k);
  });
  test(`부팅 · ${API ? 'on' : 'off'} · data-lx=ready · 콘솔 오류 0 · 마스트`, async ({ page }) => {
    test.setTimeout(90000);
    const errs = watch(page);
    await bootApi(page, XI + '?cam=127.47,35.425,12.5,35,0');
    await page.waitForFunction(() => document.documentElement.dataset.restored === '1', null, { timeout: 45000 });
    const s = await page.evaluate(() => ({ mode: document.documentElement.dataset.mode, mast: document.getElementById('mast-mode').textContent, via: window.__xi.state.via, big: document.getElementById('hud-big').textContent }));
    console.log('boot', JSON.stringify(s));
    if (API) { expect(s.mode).toBe('on'); expect(s.via.catalog).toBe('api'); expect(s.mast).toBe(''); }
    else { expect(s.mode).toBe('off'); expect(s.mast).toContain('시연'); }
    expect(s.big).toBe('129,420');
    expect(errs).toEqual([]);
  });
});
