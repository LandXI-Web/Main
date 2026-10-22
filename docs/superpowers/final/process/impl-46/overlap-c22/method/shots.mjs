/* 겹침 정리 전후 — 바깥 주소 · 로그인 폼(frontDoor)으로 같은 자리를 찍는다. 그림은 이 폴더(로컬)에만.
   node shots.mjs before|after */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { frontDoor } from '../../../../../../../landxi/v3/kit/lint/forbidden.mjs';
import { MEASURE } from '../../../../../../../landxi/v3/kit/lint/overlap.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, '..');
const BASE = process.env.LX_BASE || 'https://app.land-xi.dev';
const tag = process.argv[2] || 'before';
const SPOTS = [
  // 남원 이웃 읍면동 분석이 같은 경작지를 두 번 잡은 곳이 가장 많은 자리(2025 전국 분석 · 반 넘게 겹친 쌍 150)
  { name: 'namwon-dup', center: [127.362, 35.398], zoom: 16.6 },
  // 같은 자리 필지 카드(경작지 n곳 · 면적 · 필지 대비)
  { name: 'namwon-card', pnu: '5219010700103480001', center: [127.36161, 35.39885], zoom: 17.4 },
];
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ko-KR' });
const page = await ctx.newPage();
const errs = [];
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
await frontDoor(page, BASE, 'test@lx.or.kr', 'app');
const log = [];
for (const s of SPOTS) {
  const t0 = Date.now();
  await page.goto(`${BASE}/landxi/v3/xi-clean/${s.pnu ? '?pnu=' + s.pnu : ''}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__xc?.map?.loaded?.(), null, { timeout: 60000 }).catch(() => null);
  await page.waitForTimeout(4000);
  await page.evaluate((s) => { const m = window.__xc.map; m.jumpTo(s.center ? { center: s.center, zoom: s.zoom } : { zoom: s.zoom }); }, s);
  await page.waitForFunction(() => window.__xc.map.areTilesLoaded(), null, { timeout: 30000 }).catch(() => null);
  await page.waitForTimeout(3500);
  const at = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
  // 화면 안 전국 결과 객체(같은 분류 · 거의 같은 모양이 두 번 보이는지 세기)
  const ov = await page.evaluate(MEASURE).catch((e) => ({ err: String(e) }));
  const parts = await page.$eval('.xc-parts', (e) => (e.hidden ? null : e.textContent)).catch(() => null);
  const file = path.join(OUT, `${tag}-${s.name}.png`);
  await page.screenshot({ path: file });
  log.push({ tag, spot: s.name, at, ms: Date.now() - t0, parcel_line: parts, overlaps: ov.overlaps ? ov.overlaps.length : ov, file: path.basename(file) });
}
const out = { log, console_errors: errs.slice(0, 10) };
fs.writeFileSync(path.join(OUT, `shots-${tag}.json`), JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
await b.close();
