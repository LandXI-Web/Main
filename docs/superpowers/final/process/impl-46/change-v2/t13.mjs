// 시나리오 13 — 분석 중 워커 강제 중단(장애 모사) → 60초 안 '실패/시간초과' + 다시 시도 → 워커가 돌아오면 다시 시도로 끝까지
// 워커를 멈추고 다시 켜는 일은 오케스트레이터가 한다. 이 스크립트는 <dir>/killed.txt(멈춘 시각 epoch ms) · <dir>/restarted.txt 를 기다린다.
// LX_PW=… node docs/superpowers/final/process/impl-46/change-v2/t13.mjs <base> <login> <project> <signal-dir>
import { chromium } from 'playwright';
import { frontDoor } from '../../../../../../landxi/v3/kit/lint/forbidden.mjs';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const [BASE, LOGIN, PROJECT, SIG] = process.argv.slice(2);
const out = { at: new Date().toISOString(), steps: [], errs: [] };
const save = () => fs.writeFileSync(path.join(HERE, process.env.T13_OUT || 't13.json'), JSON.stringify(out, null, 1));
const step = (k, x = {}) => { out.steps.push({ k, at: new Date().toISOString(), ...x }); console.log(k, JSON.stringify(x).slice(0, 400)); save(); };
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
page.on('pageerror', (e) => out.errs.push(String(e)));
await frontDoor(page, BASE, LOGIN, 'app', { password: process.env.LX_PW });
const api = (p, o = {}) => page.evaluate(async ([p, o]) => {
  const s = JSON.parse(localStorage.getItem('lx_api_session') || 'null');
  const r = await fetch('/api/v1' + p, { method: o.method || 'GET', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + s.token }, body: o.body ? JSON.stringify(o.body) : undefined });
  return r.json();
}, [p, o]);
await page.goto(`${BASE}/landxi/v3/lx-map/?project=${PROJECT}`, { waitUntil: 'domcontentloaded' });
await page.locator('.chg-card').waitFor({ timeout: 60000 });
await page.waitForTimeout(2500);
await page.locator('.k-chat-fab').click();
await page.locator('.k-ck-i').fill(process.env.T13_Q || '2021년과 2024년 비교해서 변화 찾아줘');
await page.locator('.k-ck-i').press('Enter');
await page.locator('#k-chat .k-ck-blk--job[data-job]').last().waitFor({ timeout: 60000 });
const job = await page.evaluate(() => [...document.querySelectorAll('#k-chat .k-ck-blk--job')].pop().dataset.job);
let s;
for (;;) { s = await api(`/change/runs/${job}/status`); if (s.state === 'running' && (s.progress?.value ?? 0) >= 5) break; if (!['queued', 'running'].includes(s.state)) break; await page.waitForTimeout(1000); }
step('13-1 분석 중 — 지금 워커를 멈춰 주세요', { job, state: s.state, progress: s.progress?.value });
const kf = path.join(SIG, 'killed.txt');
while (!fs.existsSync(kf)) await page.waitForTimeout(500);
const killed = +fs.readFileSync(kf, 'utf8').trim();
let tEnd = null;
for (;;) { s = await api(`/change/runs/${job}/status`); if (['failed', 'timeout'].includes(s.state)) { tEnd = Date.now(); break; } if (Date.now() - killed > 300000) break; await page.waitForTimeout(1000); }
await page.waitForTimeout(2500);
await page.screenshot({ path: path.join(HERE, 'shots', (process.env.T13_TAG || '') + '13-1-worker-down-timeout.png') });
const card = (await page.locator(`#k-chat .k-ck-blk--job[data-job="${job}"]`).innerText().catch(() => '')).replace(/\s+/g, ' ');
step('13-2 멈춤 표시', { state: s.state, word: s.word, reason: s.reason, s_after_kill: tEnd ? Math.round((tEnd - killed) / 100) / 10 : null, ok_60s: !!tEnd && tEnd - killed <= 60000, can_retry: s.can_retry, card });
const rf = path.join(SIG, 'restarted.txt');
while (!fs.existsSync(rf)) await page.waitForTimeout(500);
const rb = page.locator(`#k-chat .k-ck-blk--job[data-job="${job}"] .k-job-b`, { hasText: '다시 시도' });
step('13-3a 다시 시도 단추', { n: await rb.count() });
await rb.last().click();
await page.waitForTimeout(2500);
step('13-3b 누른 뒤 카드', { card: (await page.locator('#k-chat .k-ck-blk--job').last().innerText()).replace(/\s+/g, ' ') });
const nj = await page.evaluate(() => [...document.querySelectorAll('#k-chat .k-ck-blk--job')].pop().dataset.job);
const t0 = Date.now();
for (;;) { s = await api(`/change/runs/${nj}/status`); if (!['queued', 'running'].includes(s.state)) break; if (Date.now() - t0 > 600000) break; await page.waitForTimeout(2000); }
await page.waitForTimeout(3000);
await page.screenshot({ path: path.join(HERE, 'shots', (process.env.T13_TAG || '') + '13-2-retry-done.png') });
step('13-3 다시 시도 → 끝', { new_job: nj, state: s.state, s: Math.round((Date.now() - t0) / 1000), features: await page.evaluate(() => (window.__lxChange?.fc?.features || []).length) });
await browser.close();
