// F2-C · GPU 실측(2차) — nvidia-smi -lms 100 × 25표본(2.5 s 창) → util_ma5 · power_w · caution/fault(v1.1-28)
// 1차 판정 불합격: -lms 500 × 5표본은 WDDM 이진 순간값(0/100) 평균이라 2 s 마다 20%p 단위로 뛰었고, e2e 판정식을 '독립 샘플러가 못 본 튐만'으로 좁혀 통과시켰다.
// 2차 판정식(결과 문서 §4): 독립 nvidia-smi -lms 100 같은 창 평균과 — 전 창 ±10%p · 정상 상태 창 ±3%p · W ±2 · 연속 방출 간 폴러 변동 − 독립 변동 ≤ 10%p.
// 부하 창 대조(GPU0 워커 실추론)는 shots/f2/C/tools/ma-load.mjs 가 표로 남긴다(logs/gpu-ma-load.json).
import { test, expect } from '@playwright/test';
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { OPS, gwUp, gwAdmin, ready, redis, opsEvent, kst } from '../../shots/f2/C/tools/e2e-util.mjs';
const PY = process.env.LX_PYTHON || 'python';
const isEnv = (e) => e && typeof e === 'object' && 'value' in e && typeof e.unit === 'string' && typeof e.source === 'string' && typeof e.as_of === 'string';
test.setTimeout(150000);

test('폴러 단독: -lms 100 · 25표본 = 2.5 s 창 · util_ma5 = 창 평균 · power_w 봉투 · caution = VRAM ≥ 76% 또는 이용률 ≥ 80% · 전력 예산', async () => {
  const s = JSON.parse(execFileSync(PY, ['server/ops/gpu_poller.py', '--stdout', '--once', '--redis', ''], { env: { ...process.env, PYTHONIOENCODING: 'utf-8' }, encoding: 'utf8', timeout: 60000 }));
  expect(s.nvsmi.why).toMatch(/LX_NVSMI|DriverStore|--nvsmi|기본|PATH/);
  expect(s.nvsmi.stream).toMatch(/-lms 100/); expect(s.nvsmi.ma_n).toBe(25); expect(s.nvsmi.ma_window_ms).toBe(2500);
  for (const g of s.gpus) {
    expect(isEnv(g.util_ma5)).toBe(true); expect(isEnv(g.power_w)).toBe(true); expect(g.power_w.unit).toBe('W');
    expect(g.util_ma5.source).toMatch(/-lms 100 .*25표본/);
    const smp = g.util_ma5.samples; expect(smp.length).toBeGreaterThanOrEqual(20);
    const mean = smp.reduce((a, x) => a + x.v, 0) / smp.length; expect(Math.abs(mean - g.util_ma5.value)).toBeLessThanOrEqual(0.06);
    const span = smp.at(-1).t - smp[0].t; expect(span).toBeGreaterThan(1800); expect(span).toBeLessThan(3600);   // 창 ≈ 2.5 s
    const vr = g.mem_used_mib.value / g.mem_total_mib.value;
    expect(g.caution || g.fault).toBe(vr >= 0.76 || g.util_ma5.value >= 80 || g.temp_c.value >= 85);
    expect(typeof g.mem_used_mib.value).toBe('number'); expect(g.mem_used_mib.value).toBeLessThanOrEqual(g.mem_total_mib.value);   // 언더플로·두 장 같은 값 → PDH 대체
  }
  expect(s.power_budget.max_hot).toBe(1); expect(isEnv(s.power_budget.hot_now)).toBe(true); expect(Array.isArray(s.power_budget.hot_now.gpus)).toBe(true);
});

test('폴러 job_id = worker:{w}:hb.job_id(판정 2 — 1차는 vram 해시만 읽어 실행 중에도 카드가 비었다)', async () => {
  const fake = 'job_F2CHBTEST' + Date.now().toString(36).toUpperCase();
  await redis([['HSET', 'worker:a6000-1:hb', 'id', 'a6000-1', 'job_id', fake], ['EXPIRE', 'worker:a6000-1:hb', '20']]);   // GPU1 에는 영상 워커가 없다(pool 필드 없음 → 스케줄러 배정 대상 아님)
  try {
    const s = JSON.parse(execFileSync(PY, ['server/ops/gpu_poller.py', '--stdout', '--once', '--lms', '0', '--no-write'], { env: { ...process.env, PYTHONIOENCODING: 'utf-8' }, encoding: 'utf8', timeout: 60000 }).trim().split('\n').pop());
    expect(s.gpus.find((g) => g.index === 1).job_id).toBe(fake);
  } finally { await redis([['DEL', 'worker:a6000-1:hb']]); }
});

test('대조: 폴러 util_ma5 vs 독립 nvidia-smi -lms 100(같은 2.5 s 창) — 전 창 ±10%p · 정상 상태 ±3%p · W ±2 · 튐 0', async () => {
  const nv = JSON.parse(execFileSync(PY, ['-c', 'import sys,json; sys.path.insert(0,"server/ops"); import gpu_poller as g; print(json.dumps(g.find_nvsmi(None)))'], { encoding: 'utf8' }));
  const ind = []; const t0 = Date.now();
  const smi = spawn(nv, ['--query-gpu=index,utilization.gpu,power.draw', '--format=csv,noheader,nounits', '-lms', '100']);
  let sb = ''; smi.stdout.on('data', (b) => { sb += b; let i; while ((i = sb.indexOf('\n')) >= 0) { const l = sb.slice(0, i); sb = sb.slice(i + 1); const c = l.split(',').map((x) => x.trim()); if (c.length >= 3 && /^\d$/.test(c[0])) ind.push({ t: Date.now(), gpu: +c[0], u: +c[1], w: +c[2] }); } });
  const pol = spawn(PY, ['server/ops/gpu_poller.py', '--stdout', '--redis', '', '--interval', '2'], { env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
  const emits = []; let buf = '';
  pol.stdout.on('data', (b) => { buf += b; let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); try { emits.push({ t: Date.now(), s: JSON.parse(l) }); } catch { /* */ } } });
  while (emits.length < 30 && Date.now() - t0 < 90000) await new Promise((r) => setTimeout(r, 250));
  pol.kill(); smi.kill();
  const rows = [];
  const sd = (xs, m) => Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / xs.length);
  for (const { s } of emits.slice(2)) for (const g of s.gpus) {
    const smp = g.util_ma5.samples || []; if (smp.length < 20) continue;
    const win = ind.filter((x) => x.gpu === g.index && x.t >= smp[0].t - 60 && x.t <= smp.at(-1).t + 60);   // 폴러 표본과 같은 2.5 s 창(독립 프로세스 · 파이프 지연 ±60 ms)
    if (win.length < 18) continue;
    const u = win.reduce((a, x) => a + x.u, 0) / win.length; const w = win.reduce((a, x) => a + x.w, 0) / win.length;
    rows.push({ at: s.at, gpu: g.index, n_poller: smp.length, n_indep: win.length, poller_ma: g.util_ma5.value, indep_ma: +u.toFixed(1), du: +(g.util_ma5.value - u).toFixed(1), poller_w: g.power_w.value, indep_w: +w.toFixed(1), dw: +(g.power_w.value - w).toFixed(1),
      steady: sd(win.map((x) => x.w), w) < 4 && sd(win.map((x) => x.u), u) < 8 });
  }
  fs.mkdirSync('test-results', { recursive: true }); fs.writeFileSync('test-results/f2c-gpu-ma-table.json', JSON.stringify(rows, null, 1));
  expect(rows.length).toBeGreaterThanOrEqual(24);
  for (const r of rows) expect(Math.abs(r.du), JSON.stringify(r)).toBeLessThanOrEqual(10);
  const steady = rows.filter((r) => r.steady); expect(steady.length).toBeGreaterThanOrEqual(12);
  for (const r of steady) { expect(Math.abs(r.du), JSON.stringify(r)).toBeLessThanOrEqual(3); expect(Math.abs(r.dw), JSON.stringify(r)).toBeLessThanOrEqual(2); }
  // 튐 = 연속 2 s 방출 사이 폴러 이동평균 변동이 독립 샘플러의 같은 변동보다 10%p 넘게 큰 것(샘플러 잡음) — 0
  for (const gi of [0, 1]) { const v = rows.filter((r) => r.gpu === gi); for (let i = 1; i < v.length; i++) {
    const dp = Math.abs(v[i].poller_ma - v[i - 1].poller_ma), di = Math.abs(v[i].indep_ma - v[i - 1].indep_ma);
    expect(dp - di, JSON.stringify([v[i - 1], v[i]])).toBeLessThanOrEqual(10); } }
});

test('인프라 화면: GPU 행 = 이용률(10 s 추세) n% · 반응 2.5 s · W · 25표본 · 주의(caution 링 앰버 · 중앙 % 앰버 · 칩)', async ({ page }) => {
  test.skip(!(await gwUp()), '게이트웨이 없음');
  const errs = []; page.on('console', (m) => m.type() === 'error' && errs.push(`${m.location().url} ${m.text()}`));
  await gwAdmin(page); await page.goto(OPS + '/landxi/ops/infra.html'); await ready(page);
  // 3차(계약 v1.1-28 결정 (a)): 큰 숫자 = 10 s 추세(util_ma10) · 2.5 s 는 '반응' 보조 숫자 + 25표본 막대 + 순간값
  await expect(page.locator('.gpu-row').first()).toContainText('이용률 · 10 s 추세');
  await expect(page.locator('.gpu-row [data-k="util"]').first()).toHaveAttribute('data-field', 'util_ma10', { timeout: 12000 });
  await expect(page.locator('.gpu-row [data-k="ma5"]').first()).toHaveText(/^\d+%$/);
  await expect(page.locator('.gpu-row').first()).toContainText('반응 2.5 s');
  await expect(page.locator('.gpu-row [data-k="pw"]').first()).toHaveText(/\d+(\.\d)? W/);
  await expect.poll(() => page.locator('.gpu-row').first().locator('[data-k="samples"] i').count(), { timeout: 8000 }).toBeGreaterThanOrEqual(20);
  await expect(page.locator('[data-k="sampler"]')).toContainText('-lms 100');
  await page.waitForTimeout(1500);   // 링 색 전이(120 ms)·첫 표본이 가라앉은 뒤에 읽는다
  const st = await page.evaluate(() => [...document.querySelectorAll('.gpu-row')].map((r) => { const rg = r.querySelector('.og-ring'); const b = rg.querySelector('[data-k="vpct"]');
    const seg = rg.querySelector('.rg-seg[data-kind="ai"]');
    return { caution: rg.dataset.caution, fault: rg.dataset.fault, pct: parseFloat(b.textContent), color: getComputedStyle(b).color, seg: seg ? getComputedStyle(seg).stroke : null, chip: !r.querySelector('[data-k="caution"]').hidden }; }));
  for (const x of st) {
    if (x.pct >= 76 && x.fault !== '1') { expect(x.caution).toBe('1'); expect(x.chip).toBe(true);
      await expect.poll(() => page.evaluate((i) => { const rg = document.querySelectorAll('.gpu-row')[i].querySelector('.og-ring'); return [getComputedStyle(rg.querySelector('[data-k="vpct"]')).color, getComputedStyle(rg.querySelector('.rg-seg[data-kind="ai"]')).stroke].join('|'); }, st.indexOf(x)), { timeout: 4000 }).toBe('rgb(255, 182, 51)|rgb(255, 182, 51)'); }
    if (x.caution === '0' && x.fault === '0') expect(x.color).not.toBe('rgb(255, 182, 51)');
  }
  await expect(page.locator('[data-k="power-budget"]')).toHaveText(/고부하 GPU \d\/1 · 임대 \d\/1/);
  expect(errs).toEqual([]);
});

test('GPU 카드 현재 job: ops:events job.state running 주입 + hb HSET → ≤ 2 s 안에 "현재 job {id}" · done 뒤 비움', async ({ page }) => {
  test.skip(!(await gwUp()), '게이트웨이 없음');
  const hb = await redis([['HGET', 'worker:a6000-0:hb', 'job_id']]);
  test.skip(/job_/.test(hb), 'GPU0 워커가 실제 작업 중 — 카드가 그 작업을 보여야 하므로 주입 생략');
  await gwAdmin(page); await page.goto(OPS + '/landxi/ops/infra.html'); await ready(page);
  const card = page.locator('.gpu-row[data-gpu="0"] [data-k="job"]');
  await expect(card).toHaveText('현재 job 없음');
  const fake = 'job_F2CCARD' + Date.now().toString(36).toUpperCase();
  const t0 = Date.now();
  await redis([['HSET', 'worker:a6000-0:hb', 'job_id', fake]]);   // 실제 워커는 10 s 마다 자기 hb 를 다시 쓴다(빈 값) — 이벤트 경로가 그 사이를 잇는다
  await opsEvent('job.state', { job_id: fake, tenant_id: 'lx', state: 'running', pool: 'a6000', at: kst() });
  await expect(card).toHaveText(new RegExp(`현재 job ${fake}`), { timeout: 2000 });
  const dt = Date.now() - t0; expect(dt).toBeLessThanOrEqual(2000);
  await expect(card).toHaveAttribute('data-on', '1');
  await expect(page.locator(`.q-row[data-job="${fake}"]`)).toHaveCount(1);   // 큐 행 같은 id
  await opsEvent('job.state', { job_id: fake, tenant_id: 'lx', state: 'done', pool: 'a6000', at: kst() });
  await redis([['HSET', 'worker:a6000-0:hb', 'job_id', '']]);
  await expect(card).toHaveText('현재 job 없음', { timeout: 3000 });
});

// F2 통합(F2-C must_fix ①): cpu 풀 작업(워커 cpu-0/cpu-1)의 접미 숫자를 GPU 0/1 로 읽지 않는다 — 두 카드 모두 '현재 job 없음'
test('GPU 카드: cpu 풀 job.state running 주입 → GPU 0 · 1 카드 모두 "현재 job 없음"', async ({ page }) => {
  test.skip(!(await gwUp()), '게이트웨이 없음');
  const hb = await redis([['HGET', 'worker:a6000-0:hb', 'job_id']]);
  test.skip(/job_/.test(hb), 'GPU0 워커가 실제 작업 중');
  await gwAdmin(page); await page.goto(OPS + '/landxi/ops/infra.html'); await ready(page);
  const fake = 'job_F2CCPU' + Date.now().toString(36).toUpperCase();
  await page.waitForTimeout(2000);   // /events/ops 가 붙기 전(커서 '$')에 넣은 이벤트는 받지 못한다 — 스트림 연결을 기다린 뒤 주입
  await opsEvent('job.state', { job_id: fake, tenant_id: 'lx', state: 'running', pool: 'cpu', at: kst() });
  await expect(page.locator(`.q-row[data-job="${fake}"]`)).toHaveCount(1, { timeout: 3000 });
  await page.waitForTimeout(1500);
  for (const g of ['0', '1']) await expect(page.locator(`.gpu-row[data-gpu="${g}"] [data-k="job"]`)).toHaveText('현재 job 없음');
  await opsEvent('job.state', { job_id: fake, tenant_id: 'lx', state: 'done', pool: 'cpu', at: kst() });
});

// 3차 판정: 반화면 720(≤ 900)에서 25표본 막대가 '전력(이동평균)'·'순간 n%' 글자 위에 겹쳤다 → 표본 줄을 이용률 아래 한 줄로(겹침 0)
for (const W of [720, 900, 1280, 1440]) {
  test(`GPU 행 겹침 0 — ${W}px: 반응 줄(표본 막대 · 순간)이 전력 · 온도 · 링 열과 겹치지 않는다`, async ({ page }) => {
    test.skip(!(await gwUp()), '게이트웨이 없음');
    await page.setViewportSize({ width: W, height: 900 });
    await gwAdmin(page); await page.goto(OPS + '/landxi/ops/infra.html'); await ready(page);
    await expect.poll(() => page.locator('.gpu-row').first().locator('[data-k="samples"] i').count(), { timeout: 8000 }).toBeGreaterThanOrEqual(20);
    const bad = await page.evaluate(() => {
      const hit = (a, b) => a.width && b.width && a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
      const out = [];
      for (const row of document.querySelectorAll('.gpu-row')) {
        const mine = [...row.querySelectorAll('.g-util-top, .g-util-top > *, .g-react, .g-react > *')].map((e) => [e.className || e.dataset.k, e.getBoundingClientRect()]);
        const other = [...row.querySelectorAll('.g-stat, .g-stat *, .g-ringc')].filter((e) => getComputedStyle(e).display !== 'none' && !e.closest('[hidden]')).map((e) => [e.className || e.dataset.k || e.tagName, e.getBoundingClientRect()]);
        for (const [a, ra] of mine) for (const [b, rb] of other) if (hit(ra, rb)) out.push(`${row.dataset.gpu}: ${a} × ${b}`);
        const re = row.querySelector('.g-react').getBoundingClientRect(); const ut = row.querySelector('.g-util').getBoundingClientRect();
        if (re.right > ut.right + 0.5) out.push(`${row.dataset.gpu}: 반응 줄이 이용률 열 밖 ${re.right} > ${ut.right}`);
      }
      return out;
    });
    expect(bad).toEqual([]);
  });
}
