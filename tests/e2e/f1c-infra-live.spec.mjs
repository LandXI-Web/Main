// F1-C · A-1 인프라 관제 — GPU 링·스파크라인·온도·전력(값 변화 시만) · 외부 점유 띠 · A100 점선 · join-token · 큐 행 → 리더선 380 · 취소/재큐/우선순위
import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';

const OPS = 'http://localhost:8702';
const B = OPS + '/landxi/ops/bridge';
const PW = process.env.DEV_PASSWORD || 'landxi-dev-2026';
let child = null;
async function up() { try { return (await fetch(B + '/health')).ok; } catch { return false; } }
test.beforeAll(async () => { if (!(await up())) { child = spawn(process.execPath, ['landxi/ops/serve-ops.mjs'], { stdio: 'ignore' }); for (let i = 0; i < 40 && !(await up()); i++) await new Promise((r) => setTimeout(r, 250)); } await fetch(B + '/worker/reset', { method: 'POST' }); });
test.beforeEach(async () => { await fetch(B + '/worker/reset', { method: 'POST' }); });
test.afterAll(() => { child?.kill(); });
const login = async () => (await fetch(B + '/api/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ realm: 'lx', login: 'lxadmin@lx.or.kr', password: PW }) })).json();
async function admin(page) {
  const s = await login();
  await page.addInitScript(([s, base]) => { if (sessionStorage.getItem('f1c')) return; sessionStorage.setItem('f1c', '1'); localStorage.setItem('lx_api_session', JSON.stringify(s)); localStorage.setItem('lx_ops_base', base); localStorage.setItem('lx_api_base', base); localStorage.removeItem('lx_api_mode'); localStorage.setItem('lx_ops_src', 'bridge'); }, [s, B]);
  return s;
}
const apiP = (s, p, body) => fetch(B + '/api/v1' + p, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + s.token }, body: JSON.stringify(body || {}) }).then((r) => r.json());
const wk = (event, data) => fetch(B + '/worker/event', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ event, data }) });
const AOI = { type: 'Polygon', coordinates: [[[126.944, 35.995], [126.949, 35.995], [126.949, 35.999], [126.944, 35.999], [126.944, 35.995]]] };

test('노드 카드: GPU 2행 링 · 외부 점유 띠(WDDM) · 온도·전력 봉투 · A100 점선 2 · join-token 실동작', async ({ page }) => {
  const errs = []; page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  await admin(page); await page.goto(OPS + '/landxi/ops/infra.html');
  await page.waitForFunction(() => document.documentElement.dataset.lx === 'ready');
  await expect(page.locator('.gpu-row')).toHaveCount(2);
  await expect(page.locator('.gpu-row .og-ring')).toHaveCount(2);
  await expect(page.locator('.gpu-row [data-k="ext"]').first()).toContainText(/외부 점유 [\d,]+ MiB/);
  await expect(page.locator('.gpu-row [data-k="ext"]').first()).toContainText('WDDM');
  // WDDM: nvidia-smi 는 프로세스별 VRAM N/A — 폴러가 Windows 커널 집계(PDH)를 읽으면 그 출처를, 못 읽으면 N/A 를 적는다
  expect(await page.locator('.gpu-row [data-k="ext"]').first().getAttribute('title')).toMatch(/프로세스별 VRAM (N\/A\(WDDM\)|= Windows 커널 집계\(PDH)/);
  await expect(page.locator('.gpu-row [data-k="temp"]').first()).toContainText('°C');
  await expect(page.locator('.gpu-row .cw-prov').first()).toContainText('nvidia-smi');
  await expect(page.locator('.a100')).toHaveCount(2);
  await expect(page.locator('.og-alerts').first()).toContainText(/경보 없음|GPU|VRAM|E:/);
  await expect(page.locator('.og-alerts [data-k="last-check"]')).toHaveText(/\d\d:\d\d:\d\d/);
  await page.locator('.a100 .og-btn').first().click();
  await expect(page.locator('.a100 [data-k="token"]').first()).toHaveText(/^nj_[\w-]{20,}$/);
  expect(errs).toEqual([]);
});

test('값이 바뀔 때만 현상 — 숫자 DOM 갱신은 모두 실제 값 변화(무변화 재그리기 0)', async ({ page }) => {
  await admin(page); await page.goto(OPS + '/landxi/ops/infra.html');
  await page.waitForFunction(() => document.documentElement.dataset.lx === 'ready');
  await page.evaluate(() => {
    window.__muts = [];
    for (const el of document.querySelectorAll('.gpu-row [data-k="util"], .gpu-row [data-k="temp"], .gpu-row [data-k="pw"], .gpu-row [data-k="vpct"]'))
      new MutationObserver(() => window.__muts.push([el.dataset.k + el.closest('.gpu-row').dataset.gpu, el.textContent])).observe(el, { childList: true, characterData: true, subtree: true });
  });
  await page.waitForTimeout(7000);   // 샘플 3~4개(2s)
  const muts = await page.evaluate(() => window.__muts);
  const last = {}; let noop = 0; for (const [k, v] of muts) { if (last[k] === v) noop++; last[k] = v; }
  expect(noop).toBe(0);
  const digits = await page.evaluate(() => [...document.querySelectorAll('.gpu-row .cw-digit')].map((d) => getComputedStyle(d).animationDuration));
  for (const d of digits) expect(d).toBe('0.04s');
});

test('큐 행 → 취소(사유) · 재큐 · 우선순위 실동작 · 배정 순간 리더선 380 · 스윔레인 블록', async ({ page }) => {
  const s = await admin(page); await page.goto(OPS + '/landxi/ops/infra.html');
  await page.waitForFunction(() => document.documentElement.dataset.lx === 'ready');
  const { job } = await apiP(s, '/jobs', { kind: 'infer', model_id: 'car_v2_obb', imagery_id: 'axis-iksan-hwangdeung', aoi: AOI, label: 'e2e', priority: 1 });
  const row = page.locator(`.q-row[data-job="${job.id}"]`);
  await expect(row).toBeVisible(); await expect(row.locator('.q-st')).toHaveText('대기');
  await row.locator('select').selectOption('2');
  await expect.poll(async () => (await (await fetch(`${B}/api/v1/jobs/${job.id}`, { headers: { authorization: 'Bearer ' + s.token } })).json()).priority).toBe(2);
  await row.getByRole('button', { name: '취소' }).click();
  await page.locator('.og-modal input').fill('e2e 취소 확인'); await page.locator('.og-modal .og-btn.is-caution').click();
  await expect(row.locator('.q-st')).toHaveText('취소');
  await row.getByRole('button', { name: '재큐' }).click();
  await expect(row.locator('.q-st')).toHaveText('대기');
  // 워커가 집어 가는 순간(로컬 워커 프로토콜) → 리더선
  await fetch(B + '/worker/claim', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"pool":"a6000","ignore_external":true}' });
  // 전력 규칙: 워커가 두 장을 보고해도 브리지가 동시 고부하 ≤ 1 로 자른다
  await wk('job.started', { job_id: job.id, workers: ['a6000-0', 'a6000-1'], shards_total: 12 });
  const path = page.locator('svg.leader path').first(); await expect(path).toBeAttached({ timeout: 5000 });
  const dur = await path.evaluate((p) => p.getAnimations().map((a) => a.effect.getTiming().duration));
  expect(dur).toContain(380);
  await expect(row.locator('.q-st')).toHaveText('실행');
  await wk('shard.done', { job_id: job.id, worker: 'a6000-0', ms: 900, n: 3 });
  await expect(page.locator(`.ln .ln-blk[data-state="running"][data-job="${job.id}"]`)).toHaveCount(1, { timeout: 5000 });
  await wk('job.done', { job_id: job.id });
  await expect(row.locator('.q-st')).toHaveText('완료', { timeout: 5000 });
});

test('전력 규칙 — 동시 고부하 GPU ≤ 1: 실행 중이면 두 번째 claim 은 보류(power_budget) · 끝나면 풀린다 · 칩 표시', async ({ page }) => {
  const s = await admin(page); await page.goto(OPS + '/landxi/ops/infra.html');
  await page.waitForFunction(() => document.documentElement.dataset.lx === 'ready');
  const a = (await apiP(s, '/jobs', { kind: 'infer', model_id: 'car_v2_obb', imagery_id: 'axis-iksan-hwangdeung', aoi: AOI, label: 'pw-a', priority: 1 })).job;
  const b = (await apiP(s, '/jobs', { kind: 'infer', model_id: 'car_v2_obb', imagery_id: 'axis-iksan-hwangdeung', aoi: AOI, label: 'pw-b', priority: 1 })).job;
  // ignore_external: 이 검사는 브리지 예약만 본다(다른 에픽이 같은 시각 GPU 를 쓰고 있어도 결정적)
  const claim = () => fetch(B + '/worker/claim', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"pool":"a6000","ignore_external":true}' }).then((r) => r.json());
  const c1 = await claim(); expect(c1.job.id).toBe(a.id); expect(c1.max_gpus).toBe(1);
  const c2 = await claim(); expect(c2.job).toBeNull(); expect(c2.hold).toBe('power_budget');
  await wk('job.started', { job_id: a.id, workers: ['a6000-0'], shards_total: 4 });
  await expect(page.locator('[data-k="power"]')).toContainText(/배정 1\/1/, { timeout: 6000 });
  expect((await claim()).hold).toBe('power_budget');
  await wk('job.done', { job_id: a.id });
  const c3 = await claim(); expect(c3.job.id).toBe(b.id);
  await wk('job.cancelled', { job_id: b.id });
});

// F2-C 3차 판정: 고부하 = 이용률(2.5 s) ≥ 50% 만이라 GPU0 151.5 W(순간 145.7 W)에도 '고부하 GPU 0/1' 이었다 → 이용률 OR 전력 ≥ power.limit × 0.5.
test('전력 규칙 W 케이스 — 이용률 21% · 151.5 W(한도 200 W) = 고부하 · 45% · 80 W = 아님 · caution_why 에 전력 사유 · 칩 title 에 GPU 별 W', async ({ page }) => {
  const { execFileSync } = await import('node:child_process');
  const PY = process.env.LX_PYTHON || 'python';
  const code = [
    'import sys, json; sys.path.insert(0, "server/ops"); import gpu_poller as g',
    'E = lambda v, u="W": g.env(v, u, "e2e", "x")',
    'gs = [{"index": 0, "util_ma5": E(21.0, "%"), "power_w": E(151.5), "power_limit_w": E(200)}, {"index": 1, "util_ma5": E(45.0, "%"), "power_w": E(80.2), "power_limit_w": E(200)}, {"index": 2, "util_ma5": E(62.0, "%"), "power_w": E(60.0), "power_limit_w": E(None)}]',
    'pb = g.power_budget(g.Store(None), gs, "x")',
    'print(json.dumps({"pb": pb, "c0": g.caution_reasons(0.3, 21.0, 151.5, 200, 60), "c1": g.caution_reasons(0.3, 45.0, 80.2, 200, 60)}, ensure_ascii=False))'].join('\n');
  const out = JSON.parse(execFileSync(PY, ['-c', code], { env: { ...process.env, PYTHONIOENCODING: 'utf-8' }, encoding: 'utf8' }));
  const hn = out.pb.hot_now;
  expect(hn.gpus).toEqual([0, 2]);                                   // W 로 0 · 이용률로 2
  expect(hn.value).toBe(2);
  expect(hn.per[0].why.join(' ')).toMatch(/전력 151\.5 W ≥ 100 W\(한도 200 W × 0\.5\)/);
  expect(hn.per[1].hot).toBe(false);
  expect(hn.per[2].thr_w).toBe(100);                                 // 한도를 못 읽으면 100 W
  expect(out.c0[0].join(' ')).toMatch(/전력 151\.5 W ≥ 100 W/);       // caution_why 에 'W' 사유
  expect(out.c1[0]).toEqual([]);
  // 화면(게이트웨이 직결): 칩 title 에 GPU 별 W / 한도 / 임계
  const gw = await fetch(B + '/health').then((r) => r.json()).catch(() => null);
  test.skip(!gw?.gateway?.full, '게이트웨이 없음(화면 단언 생략)');
  const s = await (await fetch('http://localhost:8700/api/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ realm: 'lx', login: 'lxadmin@lx.or.kr', password: PW }) })).json();
  await page.addInitScript(([s]) => { localStorage.removeItem('lx_ops_src'); localStorage.removeItem('lx_api_mode'); localStorage.setItem('lx_ops_base', 'http://localhost:8700'); localStorage.setItem('lx_api_base', 'http://localhost:8700'); localStorage.setItem('lx_api_session', JSON.stringify(s)); }, [s]);
  await page.goto(OPS + '/landxi/ops/infra.html'); await page.waitForFunction(() => document.documentElement.dataset.lx === 'ready');
  const chip = page.locator('[data-k="power-budget"]');
  await expect.poll(() => chip.getAttribute('title'), { timeout: 8000 }).toMatch(/GPU0 [\d.—]+ W \/ 한도 \d+ W\(임계 \d+ W\)[\s\S]*GPU1 [\d.—]+ W \/ 한도 \d+ W/);
  expect(['ok', 'hot', 'caution']).toContain(await chip.getAttribute('data-level'));
});
