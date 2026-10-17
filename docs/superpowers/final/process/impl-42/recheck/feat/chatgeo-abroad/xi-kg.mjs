// 바퀴 16 재검수 — XI맵(LX 직원) 키르기스스탄으로 바꾼 뒤 XI ChatGEO 에 해외 경작지 넓이를 묻는다(바깥 주소 · 로그인 폼). QS="질문|질문" node xi-kg.mjs
import fs from 'node:fs'; import path from 'node:path'; import { createRequire } from 'node:module'; import { pathToFileURL } from 'node:url';
const ROOT = 'E:/Land-XI 플랫폼/01. 디자인';
const HW = 'C:/Users/User/AppData/Local/ms-playwright'; if (fs.existsSync(path.join(HW, 'chromium-1234'))) process.env.PLAYWRIGHT_BROWSERS_PATH = HW;
if (!process.env.DEV_PASSWORD) { const m = fs.readFileSync(path.join(ROOT, 'server/.env'), 'utf8').match(/^DEV_PASSWORD=(.*?)\s*$/m); if (m) process.env.DEV_PASSWORD = m[1]; }
const { chromium } = createRequire(path.join(ROOT, 'package.json'))('playwright');
const { frontDoor } = await import(pathToFileURL(path.join(ROOT, 'landxi/v3/kit/lint/forbidden.mjs')).href);
const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }); const p = await ctx.newPage();
await frontDoor(p, 'https://app.land-xi.dev', 'test@lx.or.kr'); await p.waitForTimeout(1500);
await p.goto('https://app.land-xi.dev/landxi/v3/xi-clean/', { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => window.__xc?.map && window.__xc.boot?.shown, null, { timeout: 40000 }).catch(() => {});
await p.waitForTimeout(2000);
await p.getByRole('button', { name: '키르기스스탄' }).first().click(); await p.waitForTimeout(6000);
const runs = [];
p.on('request', (r) => { if (/\/agent\/runs$/.test(r.url()) && r.method() === 'POST') runs.push({ body: r.postData() }); });
p.on('response', async (r) => { if (/\/agent\/runs$/.test(r.url()) && r.request().method() === 'POST') { try { const j = await r.json(); runs[runs.length - 1].id = j.run?.id; } catch {} } });
const inp = p.locator('.k-chat-root[data-dock] .k-ck-i').first();
for (const q of (process.env.QS || '이식아타 AI 경작지 넓이는 얼마야?').split('|')) {
  await inp.click(); await inp.fill(q); await inp.press('Enter');
  await p.waitForTimeout(2500); await p.waitForFunction(() => document.querySelector('.k-chat')?.dataset.state !== 'busy', null, { timeout: 120000 }).catch(() => {}); await p.waitForTimeout(1500);
}
for (const r of runs) {
  const ev = r.id ? await p.evaluate(async (id) => { const { api } = await import('/landxi/v3/kit/util.js'); const j = await api(`/agent/runs/${id}/events`); const d = (j.items || []).find((x) => x.event === 'agent.done'); const pl = (j.items || []).find((x) => x.event === 'agent.plan'); return { plan: JSON.stringify(pl?.data?.steps || []).slice(0, 300), ans: d?.data?.answer_md, env: Object.fromEntries(Object.entries(d?.data?.envelopes || {}).map(([k, v]) => [k, `${v.value} ${v.unit}`])) }; }, r.id) : null;
  console.log(JSON.stringify({ body: r.body?.slice(0, 300), ev }));
}
const txt = await p.evaluate(() => document.querySelector('.k-chat-root[data-dock] .k-chat-b')?.innerText || '');
console.log('SCREEN:', txt.replace(/\s+/g, ' ').slice(-400));
await p.screenshot({ path: 'E:/Land-XI 플랫폼/01. 디자인/docs/superpowers/final/process/impl-42/recheck/shots/r16/xi-kg-chatgeo.png' });
await b.close();
