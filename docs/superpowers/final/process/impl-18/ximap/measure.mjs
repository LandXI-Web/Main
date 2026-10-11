/* impl-18 XI맵 첫 화면 시간 — 바깥 주소 · LX 직원 로그인 폼 한 번 → XI맵을 세 번 연다(처음 · 다시 · 다시).
   잰다: 주소를 연 순간(commit)부터 시군구 칠이 지도에 그려지고 로딩 판이 걷힐 때까지. node docs/superpowers/final/process/impl-18/ximap/measure.mjs */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { frontDoor } from '../../../../../../landxi/v3/kit/lint/forbidden.mjs';
const DIR = path.dirname(fileURLToPath(import.meta.url));
const APP = process.env.APP || 'https://app.land-xi.dev';
const b = await chromium.launch({ channel: 'chrome' });
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await frontDoor(p, APP, 'test@lx.or.kr', 'app');
await p.waitForURL((u) => !/\/login\/?$/.test(u.pathname), { timeout: 30000 });
const out = { at: new Date().toISOString(), runs: [] };
for (let i = 0; i < 3; i++) {
  const t0 = Date.now();
  await p.goto(APP + '/landxi/v3/xi-clean/', { waitUntil: 'commit' });
  await p.waitForFunction(() => { const x = window.__xc; return x?.boot?.shown && x.map?.getLayer('xb-sgg-f') && x.map.queryRenderedFeatures({ layers: ['xb-sgg-f'] }).length > 0; }, null, { timeout: 30000, polling: 50 });
  out.runs.push({ wall_ms: Date.now() - t0, ...(await p.evaluate(() => ({ module_to_shown_ms: window.__xc.boot.shown, board_ms: window.__xc.board.at, nav_to_module_ms: Math.round(window.__xc.t0) }))) });
  await p.waitForTimeout(1500);
}
fs.writeFileSync(path.join(DIR, 'measure.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out));
await b.close(); process.exit(0);
