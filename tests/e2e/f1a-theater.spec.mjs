// F1-A 실행 spec — 프레임 → 견적(봉투 · null = 'bench 전') → 실행 → shard 격자가 SSE/리플레이 이벤트로만 걷힌다 · HUD 는 job.progress 로만 · job.done · snapshot.ready 소스 교체
import { test, expect } from '@playwright/test';

/* ── F1-CONTRACT §12 픽스처(각 spec 안에 복사 · _roles.mjs import 금지) ── */
const API = process.env.LX_API === 'on' ? 'http://localhost:8700' : null;
async function bootApi(page, url, { realm = 'lx', role = 'staff', tenant = null } = {}) {
  let session = null;
  if (API && realm) {
    const r = await fetch(API + '/api/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(realm === 'lx' ? { realm, login: ({ staff: 'test@lx.or.kr', admin: 'lxadmin@lx.or.kr', sales: 'sales@lx.or.kr' })[role], password: process.env.DEV_PASSWORD } : { realm, tenant_id: tenant, login: 'lxadmin@lx.or.kr', site: 'gov', password: process.env.DEV_PASSWORD }) });
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

test('프레임 → 견적 → 실행 → 칸 도착 → job.done → 스냅샷 교체', async ({ page }) => {
  test.setTimeout(180000);
  const errs = watch(page);
  // 이벤트 기록: api-v1 이 내는 이벤트를 theater.on 앞에서 센다(화면 코드를 바꾸지 않고 · EventSource/리플레이 공통)
  await bootApi(page, XI + '?cam=127.3524,35.5308,16.2,35,0&on=namwon-landcover-2023');
  await page.waitForFunction(() => document.documentElement.dataset.restored === '1', null, { timeout: 60000 });
  // HUD 작업 줄 변경 기록
  await page.evaluate(() => { window.__jobMut = []; new MutationObserver(() => window.__jobMut.push([Math.round(performance.now()), document.getElementById('hud-job').textContent])).observe(document.getElementById('hud-job'), { childList: true, subtree: true, characterData: true }); });
  await page.click('#tool-rect');
  const fr = await page.evaluate(() => { const X = window.__xi, A = X.CAMS.A01; const a = X.A.project([A[0] + 0.001, A[3] - 0.001]), b = X.A.project([A[2] - 0.001, A[1] + 0.0015]); return [a.x, a.y, b.x, b.y]; });
  await page.mouse.move(fr[0], fr[1]); await page.mouse.down(); await page.mouse.move(fr[2], fr[3], { steps: 12 }); await page.mouse.up();
  await page.waitForSelector('#quote-card .xi-run', { timeout: 15000 });
  const q = await page.evaluate(() => ({ text: document.getElementById('quote-card').innerText, dim: !document.getElementById('dim').hidden, gpu: document.querySelector('#quote-card .xi-q div:nth-child(3) dd').textContent, basis: [...document.querySelectorAll('#quote-card [data-basis]')].map((e) => e.dataset.basis) }));
  console.log('견적', q.text.replace(/\s+/g, ' ').slice(0, 260));
  expect(q.dim).toBeTruthy();
  expect(q.text).toContain('면적'); expect(q.text).toContain('shard');
  expect(q.basis.length).toBeGreaterThan(1);
  if (!API) expect(q.gpu).toContain('bench 전');
  await page.click('#quote-card .xi-run');
  await page.waitForFunction(() => window.__xi.PHASES.some((x) => x.p === 'snapshot'), null, { timeout: API ? 150000 : 60000 });
  const r = await page.evaluate(() => {
    const T = window.__xi.theater, log = T.S.log, cells = [...T.S.cells.values()];
    const states = cells.map((c) => window.__xi.A.getFeatureState({ source: 'th-cells', id: c.i }).st);
    const prog = log.filter((l) => l[0] === 'job.progress').map((l) => l[1]);
    const onT = T.S.shown.filter((x) => x[0] === 'on').map((x) => x[2]);
    const gaps = onT.slice(1).map((t, i) => t - onT[i]);
    const beam = T.S.shown.filter((x) => x[0] === 'done').map((x) => x[2] - (T.S.shown.find((y) => y[0] === 'on' && y[1] === x[1])?.[2] ?? x[2]));
    return { gaps, beam, names: [...new Set(log.map((l) => l[0]))], done: log.filter((l) => l[0] === 'shard.done').length, cells: cells.length, states, prog, mut: window.__jobMut, live: T.S.live,
      snap: !!window.__xi.A.getLayer('th-snap-fill'), snapOp: window.__xi.A.getPaintProperty('th-snap-fill', 'fill-opacity'), resOp: window.__xi.A.getPaintProperty('th-res-fill', 'fill-opacity'),
      big: document.getElementById('hud-big').textContent, job: document.getElementById('hud-job').textContent, mast: document.getElementById('mast-mode').textContent };
  });
  console.log(JSON.stringify({ ...r, mut: r.mut.length, prog: r.prog.length, states: r.states.join('') }));
  expect(r.names).toEqual(expect.arrayContaining(['job.queued', 'job.started', 'shard.started', 'shard.done', 'job.progress', 'job.done', 'snapshot.ready']));
  // 칸은 shard.done 이벤트 수만큼만 걷혔다(= 전부 st 2)
  expect(r.states.filter((s) => s === 2).length).toBe(r.done);
  expect(r.done).toBe(r.cells);
  // 2차 판정: 칸이 한꺼번에 켜지지 않는다 — 칸 켜짐 시각 간격 ≥ 100 ms · 걷힘은 그 칸 빔이 보인 뒤(≥ 400 ms)
  console.log('칸 켜짐 간격', JSON.stringify(r.gaps), '빔 노출', JSON.stringify(r.beam));
  for (const g of r.gaps) expect(g).toBeGreaterThanOrEqual(100);
  for (const b of r.beam) expect(b).toBeGreaterThanOrEqual(400);
  // HUD 작업 줄은 job.progress 가 올 때만 바뀐다(대기·시작 두 줄 + progress 수 이하)
  expect(r.mut.length).toBeLessThanOrEqual(r.prog.length * 3 + 6);
  expect(r.job).toMatch(/shard/);
  if (API && r.live) expect(r.job).toContain('실측 · 지금'); else expect(r.job).toContain('예시');
  expect(r.snap).toBeTruthy();
  expect(r.snapOp).toBeGreaterThan(0); expect(r.resOp).toBe(0);
  expect(Number(r.big.replace(/,/g, ''))).toBeGreaterThan(0);
  if (!API) expect(r.mast).toContain('저장 결과 재생');
  expect(errs).toEqual([]);
});

test('저장 리플레이 파일(j1-hwangdeung.ndjson) — 계약 형식 그대로 재생', async ({ page }) => {
  test.setTimeout(120000);
  const errs = watch(page);
  await bootApi(page, XI + '?cam=127.5325,35.434,14.2,35,0&job=j1-hwangdeung&model=namwon/cultivate_uncultivate/train');
  await page.waitForFunction(() => document.documentElement.dataset.restored === '1', null, { timeout: 60000 });
  await page.waitForSelector('#quote-card .xi-run', { timeout: 15000 });
  if (API) test.skip(true, 'on 모드는 실제 워커가 돈다 — 저장 리플레이는 off 전용');
  await page.click('#quote-card .xi-run');
  await page.waitForFunction(() => window.__xi.PHASES.some((x) => x.p === 'job-done'), null, { timeout: 60000 });
  const r = await page.evaluate(() => ({ cells: window.__xi.theater.S.cells.size, done: window.__xi.theater.S.done, big: document.getElementById('hud-big').textContent }));
  console.log(JSON.stringify(r));
  expect(r.cells).toBe(48);
  expect(r.done).toBe(48);
  expect(r.big).toBe('41');
  expect(errs).toEqual([]);
});
