// 국토 변화 탐지 수정 지시서 v2 — F6 검증(사전 계산 없는 새 범위 · 새 LX 직원 계정 · 로그인 폼만)
// 시나리오 9 · 10 · 11 · 12 · 14 (13 워커 강제 중단은 따로 — 오케스트레이터가 워커를 멈춘다)
// LX_PW=<새 계정 비밀번호> node docs/superpowers/final/process/impl-46/change-v2/f6.mjs <base> <login> <pnu.txt>
import { chromium } from 'playwright';
import { frontDoor } from '../../../../../../landxi/v3/kit/lint/forbidden.mjs';
import { MEASURE } from '../../../../../../landxi/v3/kit/lint/overlap.mjs';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const [BASE = 'https://app.land-xi.dev', LOGIN, PNU] = process.argv.slice(2);
const PW = process.env.LX_PW;
fs.mkdirSync(path.join(HERE, 'shots'), { recursive: true });
const out = { at: new Date().toISOString(), login: LOGIN, steps: [], ov: {}, errs: [] };
const T0 = Date.now();
const save = () => fs.writeFileSync(path.join(HERE, 'f6.json'), JSON.stringify(out, null, 1));
const step = (k, extra = {}) => { out.steps.push({ k, t: Math.round((Date.now() - T0) / 100) / 10, ...extra }); console.log(k, JSON.stringify(extra).slice(0, 400)); save(); };
async function shot(page, n) {
  await page.screenshot({ path: path.join(HERE, 'shots', n) });
  try { const m = await page.evaluate(MEASURE); out.ov[n] = (m.overlaps || []).map((o) => `${o.a} × ${o.b} (${o.kind} ${o.w}x${o.h})`); } catch (e) { out.ov[n] = ['measure ' + e.message]; }
}
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => out.errs.push(String(e)));
await frontDoor(page, BASE, LOGIN, 'app', { password: PW });
const api = (p, o = {}) => page.evaluate(async ([p, o]) => {
  const s = JSON.parse(localStorage.getItem('lx_api_session') || 'null');
  const r = await fetch('/api/v1' + p, { method: o.method || 'GET', headers: { 'content-type': 'application/json', ...(s?.token ? { authorization: 'Bearer ' + s.token } : {}) }, body: o.body ? JSON.stringify(o.body) : undefined });
  return r.json();
}, [p, o]);

async function ask(q) {
  if (await page.locator('#k-chat').isHidden()) { await page.locator('.k-chat-fab').click(); await page.waitForTimeout(300); }
  const nJob = await page.locator('#k-chat .k-ck-blk--job').count();
  await page.locator('.k-ck-i').fill(q);
  const t0 = Date.now();
  await page.locator('.k-ck-i').press('Enter');
  await page.waitForFunction(() => document.querySelector('#k-chat')?.dataset.state === 'busy', null, { timeout: 10000 }).catch(() => null);
  await page.waitForFunction(() => document.querySelector('#k-chat')?.dataset.state !== 'busy', null, { timeout: 120000 });
  const ms = Date.now() - t0;
  await page.waitForTimeout(1200);
  const ans = await page.evaluate(() => [...document.querySelectorAll('#k-chat .k-ck-a, #k-chat .k-chat-a')].map((x) => x.innerText).filter(Boolean).pop() || '');
  const plan = await page.evaluate(() => [...document.querySelectorAll('#k-chat .k-ck-plan li, #k-chat .k-chat-plan li')].map((x) => x.innerText.replace(/\s+/g, ' ')).slice(-3));
  const jobs = await page.evaluate(() => [...document.querySelectorAll('#k-chat .k-ck-blk--job')].map((x) => x.dataset.job));
  return { q, ms, ans, plan, job: jobs.length > nJob ? jobs[jobs.length - 1] : jobs[jobs.length - 1] || null };
}
const status = (job) => api(`/change/runs/${job}/status`);

const RESUME = process.env.F6_PROJECT || '';
let project = RESUME, job = process.env.F6_JOB || '';
let pg2a = null, r = null;
if (!RESUME) {
// ── 9 · 새 프로젝트(필지 목록 · 경로 고르기) ──
const NAME = `F6 담양 필지 335 ${new Date().toTimeString().slice(0, 5)}`;
await page.goto(BASE + '/landxi/v3/lx-project/?new=1', { waitUntil: 'domcontentloaded' });
await page.locator('.lxp-new input[name=name]').waitFor({ timeout: 30000 });
await page.locator('.lxp-new input[name=name]').fill(NAME);
await page.locator('.lxp-reg-tg').click();
await page.locator('.lxp-rm .lxp-vt[data-k=pnu]').click();
await page.locator('.lxp-pnu').fill(fs.readFileSync(PNU, 'utf8'));
await page.locator('.lxp-pnu-go').click();
await page.locator('.lxp-yrs .lxp-chip').first().waitFor({ timeout: 120000 });
for (const b of await page.locator('.lxp-yrs .lxp-chip').all()) { const y = parseInt(await b.textContent(), 10); if (((await b.getAttribute('aria-pressed')) === 'true') !== [2019, 2024].includes(y)) await b.click(); }
await page.locator('.lxp-path').waitFor({ timeout: 10000 });
const pathPick = await page.locator('.lxp-path input:checked').getAttribute('value');
await shot(page, '9-1-new-project-path.png');
step('9-1 새 프로젝트 · 필지 목록 · 경로 기본값', { range: await page.locator('.lxp-rng-s').innerText(), path: pathPick });
await page.locator('.lxp-new .lxp-act .t-btn').first().click();
await page.waitForURL(/lx-map\/\?project=/, { timeout: 60000 });
project = new URL(page.url()).searchParams.get('project');
await page.locator('.chg-card').waitFor({ timeout: 60000 });
await page.waitForTimeout(3000);
step('9-2 지도 서비스 · 대상지', { project });

// 9 · 대화로 변화 탐지(5초 안 답 · 작업 카드 · 프로젝트 영상 사용)
r = await ask('2019년과 2024년 항공영상 비교해서 새로 생긴 것 찾아줘');
job = r.job;
const submitted = Date.now();
step('9-3 대화 답(작업 만들기)', { ...r, ok_5s: r.ms <= 5000 });
await shot(page, '9-3-chat-job-card.png');

// 10 · 같은 요청을 다시 — 새 작업 없이 같은 작업
r = await ask('2019년과 2024년 항공영상 비교해서 새로 생긴 것 찾아줘');
step('10 같은 요청 다시', { ...r, same_job: r.job === job });

// 진행 — 대기열(전국 분석 중) · 시작까지 · 진행률 · 남은 시간
let started = null, last = null, seenRun = null;
pg2a = await ctx.newPage();
const pg2 = pg2a;
while (Date.now() - submitted < 20 * 60 * 1000) {
  const s = await status(job);
  last = s;
  if (s.state === 'running' && !started) {
    started = Date.now();
    step('9-4 분석 시작(대기열 → 실행)', { wait_s: Math.round((started - submitted) / 100) / 10, stage: s.stage });
  }
  if (s.state === 'running' && !seenRun && s.tiles?.total && (s.progress?.value ?? 0) >= 20) {
    seenRun = s;
    await shot(page, '9-5-chat-progress.png');
    await pg2.goto(`${BASE}/landxi/v3/lx-release/?project=${project}&stage=infer`, { waitUntil: 'domcontentloaded' });
    await pg2.locator('.rl-jobs li').first().waitFor({ timeout: 30000 });
    await pg2.waitForTimeout(1500);
    await shot(pg2, '9-6-project-step4-running.png');
    step('9-5 진행 표시', { progress: s.progress?.value, tiles: s.tiles, remaining: s.remaining?.value, stage: s.stage, step4: (await pg2.locator('.rl-jobs li').first().innerText()).replace(/\s+/g, ' ') });
  }
  if (['done', 'failed', 'timeout', 'cancelled'].includes(s.state)) break;
  await page.waitForTimeout(2000);
}
const doneMs = Date.now() - submitted;
step('9-7 끝', { state: last?.state, total_s: Math.round(doneMs / 1000), run_s: started ? Math.round((Date.now() - started) / 1000) : null, ok_5min: doneMs <= 300000, reason: last?.reason });
await page.waitForFunction(() => (window.__lxChange?.fc?.features || []).length > 0, null, { timeout: 60000 }).catch(() => null);
await page.waitForTimeout(2500);
out.features = await page.evaluate(() => (window.__lxChange?.fc?.features || []).length);
await shot(page, '9-8-map-result.png');
// 5단계 결과 확인 · 4단계 목록(끝)
await pg2.goto(`${BASE}/landxi/v3/lx-release/?project=${project}&stage=infer`, { waitUntil: 'domcontentloaded' });
await pg2.locator('.rl-jobs li').first().waitFor({ timeout: 30000 });
await pg2.waitForTimeout(1500);
await shot(pg2, '9-9-project-step4-done.png');
const pr = await api(`/projects/${project}`);
step('9-9 프로젝트 단계', { stages: (pr.stages || []).map((s) => `${s.label}:${s.word}`), path: pr.path, review: (pr.stages || []).find((s) => s.key === 'review')?.target });
// 데이터 올리기 — 프로젝트 영상
await pg2.goto(`${BASE}/landxi/v3/lx-ingest/?project=${project}&region=46710`, { waitUntil: 'domcontentloaded' });
await pg2.locator('.lxi-list li').first().waitFor({ timeout: 60000 }).catch(() => null);
await pg2.waitForTimeout(2000);
await shot(pg2, '9-10-ingest-project-imagery.png');
step('9-10 데이터 올리기 영상 목록', { rows: (await pg2.locator('.lxi-list li').allInnerTexts()).slice(0, 5) });

} else {
  await page.goto(`${BASE}/landxi/v3/lx-map/?project=${project}`, { waitUntil: 'domcontentloaded' });
  await page.locator('.chg-card').waitFor({ timeout: 60000 });
  await page.waitForTimeout(3000);
}
const pg2 = RESUME ? await ctx.newPage() : pg2a;
let job12 = null;
if (!process.env.F6_ONLY14) {
// ── 12 · 프로젝트에 없는 해 → 선택지 → 승인하면 받고 실행 ──
r = await ask('2019년과 2021년 비교해서 변화 찾아줘');
await shot(page, '12-1-missing-year-choice.png');
const btns = await page.evaluate(() => [...document.querySelectorAll('#k-chat .k-chat-tail .k-chat-btn')].map((b) => b.innerText));
step('12-1 없는 해 선택지', { ...r, btns });
await page.locator('#k-chat .k-chat-tail button.k-chat-btn', { hasText: '받고 비교' }).last().click();
await page.waitForFunction(() => document.querySelector('#k-chat')?.dataset.state === 'busy', null, { timeout: 10000 }).catch(() => null);
await page.waitForFunction(() => document.querySelector('#k-chat')?.dataset.state !== 'busy', null, { timeout: 120000 });
await page.waitForTimeout(1200);
job12 = await page.evaluate(() => [...document.querySelectorAll('#k-chat .k-ck-blk--job')].pop()?.dataset.job);
const rg = await api(`/change/ranges?project_id=${project}`);
step('12-2 승인 → 받고 실행', { job: job12, years: (rg.items?.[0]?.years || []).map((y) => y.year) });

// ── 11 · 실행 중 취소 → 취소됨 · GPU 놓음 ──
const t11 = Date.now();
while (Date.now() - t11 < 10 * 60 * 1000) { const s = await status(job12); if (s.state === 'running' && (s.progress?.value ?? 0) >= 5) break; if (!['queued', 'running'].includes(s.state)) break; await page.waitForTimeout(1500); }
await shot(page, '11-1-running-before-cancel.png');
const tc = Date.now();
await page.locator(`#k-chat .k-ck-blk--job[data-job="${job12}"] .k-job-b`, { hasText: '취소' }).last().click();
let sc = null;
while (Date.now() - tc < 60000) { sc = await status(job12); if (sc.state === 'cancelled') break; await page.waitForTimeout(500); }
const cardTxt = await page.locator(`#k-chat .k-ck-blk--job[data-job="${job12}"]`).innerText();
await shot(page, '11-2-cancelled.png');
step('11 취소', { state: sc?.state, word: sc?.word, ms: Date.now() - tc, card: cardTxt.replace(/\s+/g, ' '), can_retry: sc?.can_retry });

}
// ── 14 · 분석하기 화면에서 직접 실행 → 같은 목록 · 같은 결과 층 모양 ──
await pg2.goto(`${BASE}/landxi/v3/lx-analyze/?card=card-change`, { waitUntil: 'domcontentloaded' });
await pg2.locator('.la-go').waitFor({ timeout: 60000 });
await pg2.waitForFunction(() => document.querySelectorAll('select[aria-label="대상지"] option').length > 0);
const opt = await pg2.evaluate((n) => [...document.querySelectorAll('select[aria-label="대상지"] option')].find((o) => o.textContent.includes(n))?.value, 'F6 담양 필지');
await pg2.locator('select[aria-label="대상지"]').selectOption(opt);
await pg2.waitForTimeout(2500);
await pg2.locator('select[aria-label="앞 해"]').selectOption('2020');
await pg2.locator('select[aria-label="뒤 해"]').selectOption('2024');
await pg2.locator('.la-go').click();
await pg2.waitForURL(/lx-map\/\?.*change=/, { timeout: 60000 });
const job14 = new URL(pg2.url()).searchParams.get('change');
await pg2.locator('.chg-card .k-ck-blk--job').waitFor({ timeout: 60000 }).catch(() => null);
await pg2.waitForTimeout(3000);
await shot(pg2, '14-1-analyze-run-map-card.png');
const inf = await api(`/release/projects/${project}/infer`);
const keys = (j) => Object.keys(j).sort().join(',');
const rows = (inf.jobs || []).filter((j) => [job, job14].includes(j.job));
const a14 = rows.find((j) => j.job === job14), c14 = rows.find((j) => j.job === job);
step('14 분석하기 · 대화 같은 목록', { job14, both: rows.length === 2, same_keys: !!(a14 && c14 && keys(a14) === keys(c14)), via: rows.map((j) => j.change?.via), labels: rows.map((j) => j.state_label) });
await api(`/change/runs/${job14}/cancel`, { method: 'POST', body: {} });
await pg2.goto(`${BASE}/landxi/v3/lx-release/?project=${project}&stage=infer`, { waitUntil: 'domcontentloaded' });
await pg2.locator('.rl-jobs li').first().waitFor({ timeout: 30000 });
await pg2.waitForTimeout(1500);
await shot(pg2, '14-2-project-step4-list.png');
out.project = project; out.job = job; out.job12 = job12; out.job14 = job14;
save();
await browser.close();
