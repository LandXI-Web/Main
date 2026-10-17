// 바퀴 16 재검수 — 해외 기관 첫 화면 XI ChatGEO 질문 · 서버 사건(답 봉투) 기록. QS="q1|q2" node global-ask.mjs
import fs from 'node:fs'; import path from 'node:path'; import { createRequire } from 'node:module'; import { pathToFileURL } from 'node:url';
const ROOT = 'E:/Land-XI 플랫폼/01. 디자인';
const HW = 'C:/Users/User/AppData/Local/ms-playwright'; if (fs.existsSync(path.join(HW, 'chromium-1234'))) process.env.PLAYWRIGHT_BROWSERS_PATH = HW;
if (!process.env.DEV_PASSWORD) { const m = fs.readFileSync(path.join(ROOT, 'server/.env'), 'utf8').match(/^DEV_PASSWORD=(.*?)\s*$/m); if (m) process.env.DEV_PASSWORD = m[1]; }
const { chromium } = createRequire(path.join(ROOT, 'package.json'))('playwright');
const { frontDoor } = await import(pathToFileURL(path.join(ROOT, 'landxi/v3/kit/lint/forbidden.mjs')).href);
const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, locale: process.env.LOC || 'en-US' }); const p = await ctx.newPage();
await frontDoor(p, 'https://app.land-xi.dev', 'lxadmin@lx.or.kr#kgz-agri'); await p.waitForTimeout(1500);
await p.goto('https://kgz-agri.land-xi.dev/landxi/v3/global/', { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => document.body.dataset.state === 'ready' && document.querySelector('.gl')?.dataset.level === 'district', null, { timeout: 60000 }).catch(() => {});
const runs = [];
p.on('request', (r) => { if (/\/agent\/runs$/.test(r.url()) && r.method() === 'POST') runs.push({ body: r.postData() }); });
p.on('response', async (r) => { if (/\/agent\/runs$/.test(r.url()) && r.request().method() === 'POST') { try { const j = await r.json(); runs[runs.length - 1].id = j.run?.id; runs[runs.length - 1].st = r.status(); } catch {} } });
const askBtn = p.locator('.gl-ask:visible, button:has-text("XI ChatGEO"):visible, a:has-text("XI ChatGEO"):visible, [aria-label*="ChatGEO"]:visible').first();
if (!(await p.locator('.k-ck-i:visible').count()) && (await askBtn.count())) await askBtn.click();
for (const q of (process.env.QS || '이식아타 AI 경작지 넓이는 얼마야?').split('|')) {
  await p.locator('.k-ck-i:visible').first().fill(q); await p.locator('.k-ck-i:visible').first().press('Enter');
  await p.waitForTimeout(2000);
  await p.waitForFunction(() => document.querySelector('.k-chat')?.dataset.state !== 'busy', null, { timeout: 120000 }).catch(() => {});
  await p.waitForTimeout(1000);
}
for (const r of runs) {
  const ev = r.id ? await p.evaluate(async (id) => { const { api } = await import('/landxi/v3/kit/util.js'); const j = await api(`/agent/runs/${id}/events`); return (j.items || []).map((x) => [x.event, JSON.stringify(x.data).slice(0, 400)]); }, r.id) : null;
  console.log(JSON.stringify({ body: r.body?.slice(0, 500), st: r.st, ev }, null, 1));
}
await p.screenshot({ path: 'E:/Land-XI 플랫폼/01. 디자인/docs/superpowers/final/process/impl-42/recheck/shots/r16/global-chatgeo.png' });
await b.close();
