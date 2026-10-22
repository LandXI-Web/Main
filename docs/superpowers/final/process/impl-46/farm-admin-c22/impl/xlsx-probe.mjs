/* 엑셀 한 벌(IMPL 0-6) 확인 — 바깥 기관 주소 · 로그인 폼으로 화면 단추를 눌러 받는다(개인정보 없는 파일만 · 대장이 든 파일은 받지 않음).
   node xlsx-probe.mjs → ./dl/*.xlsx · ./xlsx-probe.json(받은 파일) — 서식 · 필터 · 합계 검사는 xlsx-check.py */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
const ROOT = 'E:/Land-XI 플랫폼/01. 디자인';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const DL = path.join(HERE, 'dl'); fs.mkdirSync(DL, { recursive: true });
const { chromium, frontDoor, PW } = await import(pathToFileURL(path.join(ROOT, 'tools/check/common.mjs')).href);
const ORG = 'https://namwon.land-xi.dev', CARD = 'card-farm', GROUP = 'farm';
const b = await chromium.launch({ channel: 'chromium' }).catch(() => chromium.launch());
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ko-KR', acceptDownloads: true });
const p = await ctx.newPage();
await frontDoor(p, ORG, 'lxadmin@lx.or.kr', { tenant: 'namwon', password: PW });
await p.waitForURL((u) => !/gov-home/.test(u.pathname), { timeout: 60000 }).catch(() => {});
const out = [];
async function grab(label, nav, clickSel) {
  const t0 = Date.now();
  try {
    await nav();
    const btn = p.locator(clickSel).first();
    await btn.waitFor({ timeout: 30000 });
    const [d] = await Promise.all([p.waitForEvent('download', { timeout: 60000 }), btn.click()]);
    const f = path.join(DL, d.suggestedFilename()); await d.saveAs(f);
    out.push({ label, file: d.suggestedFilename(), bytes: fs.statSync(f).size, ms: Date.now() - t0 });
  } catch (e) { out.push({ label, err: String(e.message || e).slice(0, 160) }); }
}
const go = async (u, w = 3000) => { await p.goto(ORG + u, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(w); };
await grab('통계(칸 옆 엑셀)', () => go(`/landxi/v3/gov-group/?group=${GROUP}&tab=stats&service=${CARD}`, 5000), '.gs-pxl');
await grab('이력', () => go(`/landxi/v3/gov-select/?service=${CARD}&tab=history`), '.gy-hist button:has-text("엑셀")');
await grab('필지 엑셀(관할 전체)', () => go(`/landxi/v3/gov-select/?service=${CARD}&tab=stats`, 5000), '.gs-file:has-text("필지 엑셀") button');
await grab('필지 목록 · 고른 필지', async () => {
  await go(`/landxi/v3/gov-report/?service=${CARD}&tab=sus`, 500);
  await p.locator('#sus-table:not(.is-busy) tbody tr').first().waitFor({ timeout: 40000 });
  const cks = p.locator('#sus-table tbody .sp-ck'); const n = Math.min(5, await cks.count()); for (let i = 0; i < n; i++) await cks.nth(i).check();
  await p.locator('.sp-band:not([hidden])').waitFor({ timeout: 5000 });
}, '.sp-band button:has-text("엑셀")');
await grab('다운로드 이력', () => go(`/landxi/v3/gov-group/?group=${GROUP}&tab=downloads`), '.gg-bar button:has-text("엑셀")');
fs.writeFileSync(path.join(HERE, 'xlsx-probe.json'), JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
await b.close();
