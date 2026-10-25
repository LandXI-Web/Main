/* 영상 비교 켜기 점검(지시서 v3 §4) — 로그인 폼 → 프로젝트 지도 · 지도 서비스 · XI맵에서 '영상 비교' 켜고 /tiles/cog 요청 수 센다
   node docs/superpowers/final/process/impl-46/order-v3/regress-check.mjs [로그인] */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { frontDoor } from '../../../../../../landxi/v3/kit/lint/forbidden.mjs';
const DIR = path.dirname(fileURLToPath(import.meta.url));
const APP = process.env.APP || 'https://app.land-xi.dev';
const LOGIN = process.argv[2] || 'test@lx.or.kr';
const PID = process.env.PID || 'prj_6facf40ea8';
const run = { at: new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }), login: LOGIN, cases: {} };
const b = await chromium.launch({ channel: 'chrome' });
const c = await b.newContext({ viewport: { width: 1440, height: 900 } });
const p = await c.newPage();
let cog = []; const errs = [];
p.on('request', (r) => { if (/\/tiles\/cog\//.test(r.url())) cog.push(r.url().replace(/\?.*/, '').slice(-60)); });
p.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));
await frontDoor(p, APP, LOGIN, 'app');
await p.waitForURL((u) => !/\/login\/?(\?|$)/.test(u.pathname), { timeout: 30000 });
for (const [name, url] of [['project', `/landxi/v3/lx-map/?project=${PID}`], ['mapservice', '/landxi/v3/lx-map/']]) {
  cog = []; errs.length = 0;
  await p.goto(APP + url, { waitUntil: 'commit' });
  const btn = p.locator('.lm-cmp-b');
  const found = await btn.waitFor({ timeout: 40000 }).then(() => true, () => false);
  let before = null, after = null;
  if (found) { before = await btn.textContent(); await btn.click(); await p.waitForTimeout(9000); after = await p.locator('.lm-cmp-b').textContent(); }
  await p.screenshot({ path: path.join(DIR, `${name}-cmp-on.png`) });
  run.cases[name] = { found, before, after, cogRequests: cog.length, sample: cog.slice(0, 2), errs: [...errs] };
}
cog = []; errs.length = 0;
await p.goto(APP + '/landxi/v3/xi-clean/', { waitUntil: 'commit' });
await p.waitForFunction(() => window.__xc?.map && window.__xc.boot?.shown, null, { timeout: 60000 }).catch(() => {});
const r = await p.evaluate(async () => { try { const x = await window.__xc.compareYears?.(2019, 2025); return { ok: !!x?.ok }; } catch (e) { return { err: String(e).slice(0, 120) }; } });
await p.waitForTimeout(8000);
await p.screenshot({ path: path.join(DIR, 'ximap-cmp-on.png') });
run.cases.ximap = { ...r, cogRequests: cog.length, errs: [...errs] };
fs.writeFileSync(path.join(DIR, 'regress-run.json'), JSON.stringify(run, null, 2));
console.log(JSON.stringify(run, null, 1));
await b.close();
