// tools/perf/run.mjs — 2026-08-25-perf-thispc 측정 러너.
// 헤드리스 아님(headless:false) · channel:'chrome' 실제 크롬 · 1440x900.
// PORT=4190 node tools/serve.mjs 가 먼저 떠 있어야 한다.
//
// 사용:
//   node tools/perf/run.mjs            # a..g + h(dpr 1/1.5/2) 전부
//   node tools/perf/run.mjs a c f      # 지정한 시나리오만
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..', '..');
const shotsDir = path.join(root, 'shots', 'perf');
fs.mkdirSync(shotsDir, { recursive: true });

const PORT = process.env.PORT || 4190;
const BASE = `http://localhost:${PORT}/tools/perf/probe.html`;
const DUR = 8000;      // 스펙 §3: 각 시나리오 8초 헤드 실행
const WARMUP = 1500;

const LEVELS = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
const wanted = process.argv.slice(2).filter(a => LEVELS.includes(a));
const runLevels = wanted.length ? wanted : LEVELS;
const runH = wanted.length === 0; // 인자 없이 전체 실행할 때만 h(dpr) 포함

function chromeWorkingSetMB() {
  try {
    const out = execSync(
      'powershell -NoProfile -Command "(Get-Process chrome -ErrorAction SilentlyContinue | Measure-Object WorkingSet64 -Sum).Sum"',
      { encoding: 'utf8' }
    ).trim();
    const bytes = Number(out);
    return bytes ? +(bytes / 1048576).toFixed(1) : null;
  } catch { return null; }
}

async function runOne(browser, { label, level, dpr = 1 }) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: dpr });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('pageerror', e => consoleErrors.push('PAGEERROR: ' + e.message.slice(0, 200)));
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push('console.error: ' + m.text().slice(0, 200)); });

  const url = `${BASE}?level=${level}&dur=${DUR}&warmup=${WARMUP}`;
  console.error(`[${label}] goto ${url} dpr=${dpr}`);
  await page.goto(url, { waitUntil: 'load' });
  let perf = null;
  try {
    await page.waitForFunction(() => window.__perfDone === true, undefined, { timeout: WARMUP + DUR + 30000 });
    perf = await page.evaluate(() => window.__perf);
  } catch (e) {
    consoleErrors.push('TIMEOUT: ' + e.message.slice(0, 200));
  }

  const shotPath = path.join(shotsDir, `scenario-${label}.png`);
  try { await page.screenshot({ path: shotPath }); } catch { /* noop */ }

  let chromeMemMB = null;
  if (label === 'g') chromeMemMB = chromeWorkingSetMB();

  await context.close();
  return { label, level, dpr, perf, consoleErrors: consoleErrors.slice(0, 10), shot: path.relative(root, shotPath), chromeMemMB };
}

const browser = await chromium.launch({ channel: 'chrome', headless: false });
const results = [];
for (const level of runLevels) {
  results.push(await runOne(browser, { label: level, level }));
}
if (runH) {
  for (const dpr of [1, 1.5, 2]) {
    results.push(await runOne(browser, { label: `h-dpr${dpr}`, level: 'g', dpr }));
  }
}
await browser.close();

const outPath = path.join(__dirname, 'results.json');
let merged = results;
if (wanted.length) {
  let prev = [];
  try { prev = JSON.parse(fs.readFileSync(outPath, 'utf8')); } catch { /* no previous file */ }
  const byLabel = new Map(prev.map(r => [r.label, r]));
  for (const r of results) byLabel.set(r.label, r);
  merged = [...byLabel.values()];
}
fs.writeFileSync(outPath, JSON.stringify(merged, null, 2));
console.log(JSON.stringify(merged, null, 2));
console.error('saved', outPath);
