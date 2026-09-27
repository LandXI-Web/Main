// F1-A · 필지 — 읍면동 집계 카드(emd-stats 봉투) → 드론 AOI 하강(배경 3단 갈림) → A02 + A04 456 도착 → 필지 카드(P8 PNU·지목·공시지가 2021-12 + A01 4시점 실시간 크롭)
//         AOI 밖 = A03 2시점 · P8 없으면 '필지 · P8 대기' 결손 칩
// 실행: npx playwright test tests/e2e/f1a-parcel --reporter=line
import { test, expect } from '@playwright/test';

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
const CITY = '?cam=127.47,35.425,12.5,35,0&on=namwon-landcover-2023';

test('읍면동 클릭 → 집계 카드(봉투) → AOI 하강 3단 → 도착 → 필지 카드 P8 + 4시점 크롭', async ({ page }) => {
  test.setTimeout(180000);
  const errs = watch(page);
  await bootApi(page, XI + CITY);
  await page.waitForFunction(() => document.documentElement.dataset.restored === '1', null, { timeout: 60000 });
  // 출처 칩 기록(하강 중 갈림)
  await page.evaluate(() => {
    window.__chips = [];
    const el = document.getElementById('hud-chip');
    const rec = () => { const s = el.dataset.src; if (s && window.__chips[window.__chips.length - 1] !== s) window.__chips.push(s); };
    rec(); new MutationObserver(rec).observe(el, { attributes: true, childList: true, subtree: true, characterData: true });
  });
  const pt = await page.evaluate(() => window.__xi.emdPoint('운봉읍', [300, 300, 1000, 760]));
  expect(pt).not.toBeNull();
  await page.mouse.click(pt[0], pt[1]);
  await page.waitForFunction(() => document.getElementById('emd-card').dataset.emd === '운봉읍' && !document.getElementById('emd-card').hidden, null, { timeout: 15000 });
  const emd = await page.evaluate(() => { const c = document.getElementById('emd-card'); return { text: c.innerText, basis: [...c.querySelectorAll('[data-basis]')].map((e) => e.dataset.basis), rows: c.querySelectorAll('tbody tr').length, prov: c.querySelector('.xi-emd-prov').textContent }; });
  console.log('집계', emd.text.replace(/\s+/g, ' ').slice(0, 200));
  expect(emd.rows).toBe(4);
  expect(emd.basis).toContain('inferred');
  expect(emd.prov).toContain('AI 추론 · 검수 전');
  // 드론 AOI 버튼은 목적지를 이름으로 — AOI 를 품은 읍면동(덕과면)만 '하강', 운봉읍 카드는 '덕과면 드론 AOI로 이동'
  const aoiBtn = await page.evaluate(() => ({ emd: window.__xi.aoiEmd, text: document.querySelector('#emd-card .xi-aoi')?.textContent, here: document.querySelector('#emd-card .xi-aoi')?.dataset.here }));
  expect(aoiBtn.emd).toBe('덕과면');
  expect(aoiBtn.here).toBe('0'); expect(aoiBtn.text).toContain('덕과면 드론 AOI로 이동');
  // 드론 AOI 로 하강
  await page.evaluate(() => { window.__mark = performance.now(); });
  await page.click('#emd-card .xi-aoi');
  await page.waitForFunction(() => window.__xi.PHASES.some((x) => x.p === 'arrived' && x.t > window.__mark), null, { timeout: 45000 });
  const aoi = await page.evaluate(() => ({ chips: window.__chips, big: document.getElementById('hud-big').textContent, bigBasis: document.getElementById('hud-big').dataset.basis, title: document.getElementById('hud-title').textContent, prov: document.getElementById('hud-prov').textContent, note: document.getElementById('hud-note').textContent,
    parcels: window.__xi.state.aoiParcels.length, on: [...window.__xi.state.results] }));
  console.log('AOI', JSON.stringify(aoi));
  // 배경 3단: 25cm → 2m(A03) → 1.08cm(A01)
  const i25 = aoi.chips.indexOf('ap25-namwon-2023'), i2 = aoi.chips.indexOf('namwon-city-2504'), i1 = aoi.chips.indexOf('namwon-aoi-2504');
  expect(i25).toBeGreaterThan(-1); expect(i2).toBeGreaterThan(i25); expect(i1).toBeGreaterThan(i2);
  expect(aoi.big).toBe('456');
  expect(aoi.title).toContain('덕과면');
  expect(aoi.bigBasis).toBe('inferred'); expect(aoi.prov).toContain('변화 지수 · 검수 전');   // on/off 같은 배지(비지도 변화 지수)
  expect(aoi.note).toContain('A02 농경지');
  expect(aoi.parcels).toBeGreaterThan(0);
  expect(aoi.on).toEqual(expect.arrayContaining(['namwon-farmland-2025', 'namwon-change']));
  // 필지 클릭(실제 마우스) → 락온 380 뒤 카드
  const pp = await page.evaluate(async () => {
    const X = window.__xi; const fa = await X.loadA02(); const f = fa.features.find((x) => x.properties.id === X.state.aoiParcels[0]);
    const g = f.geometry.type === 'Polygon' ? f.geometry.coordinates[0] : f.geometry.coordinates[0][0]; let x = 0, y = 0; g.forEach((c) => { x += c[0]; y += c[1]; });
    const q = X.A.project([x / g.length, y / g.length]); return [q.x, q.y];
  });
  const t0 = await page.evaluate(() => performance.now());
  await page.mouse.click(pp[0], pp[1]);
  // F2-A: 기관·직원의 필지 카드 = v2(EVIDENCE-PAIR · 연속지적 2026-09-24 × AI) — 판독 모드도 같은 부품
  await page.waitForFunction(() => !document.getElementById('pcard2').hidden, null, { timeout: 20000 });
  const t1 = await page.evaluate(() => performance.now());
  await page.waitForFunction(() => document.getElementById('pcard2').dataset.ready === '1' && document.getElementById('pcard2').dataset.cropsDone === '1', null, { timeout: 30000 });
  const c = await page.evaluate(() => { const el = document.getElementById('pcard2'); return { text: el.innerText, crops: +el.dataset.crops, slots: el.querySelectorAll('.sv-crops > div').length, canv: el.querySelectorAll('.sv-crops canvas').length, pnu: el.dataset.pnu,
    jimok: el.querySelector('.sv-lcol .sv-cell')?.innerText, fig: el.querySelector('.sv-crops').getAttribute('aria-label'), rows: el.querySelector('.sv-pair').dataset.rows }; });
  console.log('필지', JSON.stringify({ ...c, text: c.text.replace(/\s+/g, ' ').slice(0, 220), openMs: Math.round(t1 - t0) }));
  expect(t1 - t0).toBeGreaterThanOrEqual(380 - 40);        // 락온 380 뒤에 연다
  expect(c.pnu).toMatch(/^\d{19}$/);                       // 연속지적 PNU(19자리)
  expect(c.jimok).toContain('지목');
  expect(c.text).toContain('2026-09-24');                  // 연속지적 수집일(대장 기준)
  expect(c.rows).toBe('7/7');
  expect(c.slots).toBe(5); expect(c.canv).toBeGreaterThanOrEqual(4);   // 2023 25cm + 드론 4시점(AOI 안)
  expect(c.fig).toContain('4시점');
  expect(errs).toEqual([]);
});

test('AOI 밖 필지 = A03 2시점 크롭 + "4시점은 드론 AOI 안만"', async ({ page }) => {
  test.setTimeout(120000);
  const errs = watch(page);
  await bootApi(page, XI + '?cam=127.535,35.435,15.2,0,0&on=namwon-farmland-2025');
  await page.waitForFunction(() => document.documentElement.dataset.restored === '1', null, { timeout: 60000 });
  await page.evaluate(async () => {
    const X = window.__xi; const fa = await X.loadA02(); const A = X.CAMS.A01;
    const f = fa.features.find((x) => { const g = x.geometry.type === 'Polygon' ? x.geometry.coordinates[0] : x.geometry.coordinates[0][0]; return g[0][0] > A[2] + 0.1; }) || fa.features[100];
    X.openParcel(f);
  });
  await page.waitForFunction(() => document.getElementById('pcard2').dataset.ready === '1', null, { timeout: 30000 });
  const c = await page.evaluate(() => { const el = document.getElementById('pcard2'); return { n: el.querySelectorAll('.sv-crops > div').length, note: el.querySelector('.sv-crops').getAttribute('aria-label'), eps: [...el.querySelectorAll('.sv-crops > div')].map((d) => d.dataset.ep) }; });
  console.log(JSON.stringify(c));
  expect(c.n).toBe(3);                                       // 2023 25cm + A03 2시점(2m)
  expect(c.eps).toEqual(['ap25-namwon-2023', 'namwon-city-2504', 'namwon-city-2510']);
  expect(c.note).toContain('A03 2시점');
  expect(errs).toEqual([]);
});

test('게스트(공개) · P8 없음 → 지목·공시지가 = "필지 · P8 대기" 결손 칩 · 필지·실태조사 타일 요청 0', async ({ page }) => {
  test.setTimeout(120000);
  if (API) test.skip(true, 'on 모드는 서버 GET /parcels 가 정본');
  const errs = watch(page);
  const reqs = [];
  page.on('request', (r) => { if (/parcels.*\.pmtiles|parcel-survey|\/survey/.test(r.url())) reqs.push(r.url()); });
  await page.route('**/landxi/xi/data/catalog-fixture.json', async (route) => {
    const r = await route.fetch(); const j = await r.json();
    for (const k of ['lx', 'tenant:namwon', 'public']) j[k].items = j[k].items.filter((i) => i.id !== 'parcels-namwon');
    j._parcels = 'absent — P8 대기'; await route.fulfill({ response: r, json: j });
  });
  await page.route('**/landxi/data/manifest.json', async (route) => { const r = await route.fetch(); const j = await r.json(); j.items = j.items.filter((i) => !/parcels/.test(i.id)); await route.fulfill({ response: r, json: j }); });
  await bootApi(page, XI + '?cam=127.3524,35.5308,16.6,35,0&on=namwon-farmland-2025', { realm: null });
  await page.waitForFunction(() => document.documentElement.dataset.restored === '1', null, { timeout: 60000 });
  await page.evaluate(async () => { const X = window.__xi; const fa = await X.loadA02(); const A = X.CAMS.A01; X.openParcel(fa.features.find((x) => { const g = x.geometry.type === 'Polygon' ? x.geometry.coordinates[0] : x.geometry.coordinates[0][0]; return g[0][0] >= A[0] && g[0][0] <= A[2] && g[0][1] >= A[1] && g[0][1] <= A[3]; }) || fa.features[0]); });
  await page.waitForFunction(() => document.getElementById('parcel-card').dataset.ready === '1', null, { timeout: 30000 });
  const c = await page.evaluate(() => ({ jimok: document.querySelector('#parcel-card .xi-jimok').innerText, price: document.querySelector('#parcel-card .xi-price').innerText }));
  console.log(JSON.stringify(c), 'parcel pmtiles reqs', reqs.length);
  expect(c.jimok).toContain('필지 · P8 대기');
  expect(c.price).toContain('필지 · P8 대기');
  expect(reqs).toEqual([]);
  expect(errs).toEqual([]);
});
