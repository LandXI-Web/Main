/* XI맵 '영상 비교' 눌러 타일 요청 세기(지시서 v3 §4 영향 범위) */
import { chromium } from 'playwright';
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { frontDoor } from '../../../../../../landxi/v3/kit/lint/forbidden.mjs';
const DIR = path.dirname(fileURLToPath(import.meta.url)); const APP = 'https://app.land-xi.dev';
const b = await chromium.launch({ channel: 'chrome' }); const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
let cog = 0; p.on('request', (r) => { if (/\/tiles\/cog\//.test(r.url())) cog++; });
await frontDoor(p, APP, 'test@lx.or.kr', 'app'); await p.waitForURL((u) => !/\/login\/?(\?|$)/.test(u.pathname), { timeout: 30000 });
await p.goto(APP + '/landxi/v3/xi-clean/', { waitUntil: 'commit' });
await p.waitForFunction(() => window.__xc?.map && window.__xc.boot?.shown, null, { timeout: 60000 }).catch(() => {});
await p.waitForTimeout(5000); const base = cog;
const btn = p.getByRole('button', { name: '영상 비교' }).first();
const has = await btn.count(); if (has) { await btn.click(); await p.waitForTimeout(9000); }
await p.screenshot({ path: path.join(DIR, 'ximap-cmp-on.png') });
const out = { button: has, before: base, after: cog, swipeOn: await p.evaluate(() => !!document.querySelector('[class*=swipe],[class*=grip],.xc-grip')) };
fs.writeFileSync(path.join(DIR, 'ximap-run.json'), JSON.stringify(out)); console.log(out); await b.close();
