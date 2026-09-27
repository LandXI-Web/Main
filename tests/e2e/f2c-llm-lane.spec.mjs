// F2-C · LLM 띠(v1.1-28) — llm_poller: vLLM /metrics 차분 tps · 요청 · GPU 배치(docker inspect 읽기만) → GpuSample.external[].llm → 인프라 LLM 띠(외부 점유와 분리 · VRAM 결손 정직) · 모델 매트릭스 gemma 행 tps 스파크
import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { OPS, GW, gwUp, gwAdmin, gwGet, ready } from '../../shots/f2/C/tools/e2e-util.mjs';
const PY = process.env.LX_PYTHON || 'python';
test.setTimeout(90000);

test('llm_poller 단독: gemma-4-12b-it · tps = generation_tokens_total 차분 봉투 · GPU 배치 · 추론 요청 0(읽기만)', async () => {
  const before = await fetch('http://127.0.0.1:8000/metrics').then((r) => r.text()).catch(() => null);
  test.skip(!before, 'vLLM :8000 없음');
  const s = JSON.parse(execFileSync(PY, ['server/ops/llm_poller.py', '--stdout', '--once', '--redis', '', '--interval', '3'], { env: { ...process.env, PYTHONIOENCODING: 'utf-8' }, encoding: 'utf8', timeout: 60000 }));
  const g = s.backends.find((b) => b.port === 8000);
  expect(g.up).toBe(true); expect(g.model).toBe('gemma-4-12b-it');
  expect(g.tps.unit).toBe('tokens'); expect(g.tps.basis).toBe('measured'); expect(g.tps.source).toContain('generation_tokens_total 10 s 창 차분');
  expect(g.tps.note).toMatch(/처리량/); expect(g.tps_window_s.unit).toBe('s');
  // 3차: 생성 속도 = time_per_output_token(inter_token_latency) 히스토그램 Δcount ÷ Δsum — 폴러 기동 뒤 요청이 없으면 vLLM 기동 뒤 누적 평균(정직 표기)
  expect(g.gen_tps.unit).toBe('tokens'); expect(g.gen_tps.source).toMatch(/(time_per_output_token|inter_token_latency)_seconds 히스토그램 Δcount ÷ Δsum/);
  if (g.gen_basis === 'cum') {
    const m = (n) => before.split('\n').filter((l) => l.startsWith(n + '{')).reduce((a, l) => a + Number(l.trim().split(/\s+/).pop()), 0);
    const n = m('vllm:time_per_output_token_seconds_count') || m('vllm:inter_token_latency_seconds_count'); const sm = m('vllm:time_per_output_token_seconds_sum') || m('vllm:inter_token_latency_seconds_sum');
    expect(Math.abs(g.gen_tps.value - n / sm)).toBeLessThanOrEqual(2);   // 폴러 실행 사이 요청 몇 개 차이 허용
    expect(g.gen_tps.note).toMatch(/누적 평균/);
  }
  expect(typeof g.tps.value).toBe('number'); expect(g.tps.value).toBeGreaterThanOrEqual(0);
  expect(g.note).toBe('WSL 프로세스 VRAM 미노출');
  expect([0, 1, null]).toContain(g.gpu);
  expect(Number.isInteger(g.reqs_active)).toBe(true);
  expect(s.ollama.up).toBe(true);
});

test('게이트웨이 /ops/gpus 가 external[].llm 을 통과(봉투 검사 500 0) · 인프라 LLM 띠 · 매트릭스 gemma 행', async ({ page }) => {
  test.skip(!(await gwUp()), '게이트웨이 없음');
  const errs = []; page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  const s = await gwAdmin(page);
  let llm = null;
  for (let i = 0; i < 20 && !llm; i++) { const g = await gwGet(s, '/ops/gpus'); llm = (g.gpus || []).flatMap((x) => (x.external || []).map((e) => ({ gpu: x.index, e }))).find((x) => x.e.llm); if (!llm) await new Promise((r) => setTimeout(r, 1500)); }
  expect(llm, 'ops:gpu 에 LLM 띠 없음(llm_poller 미기동?)').toBeTruthy();
  expect(llm.e.mem_mib).toBeNull(); expect(llm.e.llm.note).toBe('WSL 프로세스 VRAM 미노출');
  await page.goto(OPS + '/landxi/ops/infra.html'); await ready(page);
  const lane = page.locator(`.gpu-row[data-gpu="${llm.gpu}"] [data-k="llm"]`);
  await expect(lane).toBeVisible({ timeout: 8000 });
  await expect(lane).toContainText('gemma-4-12b-it'); await expect(lane).toContainText(/처리량 [\d.—]+ tok\/s\(\d+ s 평균\)/); await expect(lane).toContainText('VRAM 미노출');
  await expect(lane).toContainText(/생성 속도 [\d.]+ tok\/s/);
  // 외부 점유 띠와 분리(한 줄에 합치지 않는다)
  await expect(page.locator(`.gpu-row[data-gpu="${llm.gpu}"] [data-k="ext"]`)).not.toContainText('gemma');
  const row = page.locator('.mdl-mx tr[data-model="gemma-4-12b-it"]');
  await expect(row).toContainText('vllm'); await expect(row.locator('[data-k="tps"] b')).toHaveText(/tok\/s/);
  await expect(row.locator('svg.og-spark')).toHaveAttribute('height', '24');
  await expect(page.locator('.mdl-mx tr[data-model="ollama"]')).toContainText('MiB');
  expect(errs).toEqual([]);
});
