/* 한 페이지 방식 — 큰 영상 업로드가 메뉴를 옮기는 동안 계속 올라가는가(바깥 주소 · 로그인 폼 test@).
   ① 분석 서비스 카드 '내 영상 올려서 분석' → 파일 고름 → 업로드 시작(따로 열리는 창이 열리지 않아야 한다)
   ② 네 화면(대시보드 · 프로젝트 · 분석 서비스 · 지도 서비스)을 메뉴로 돌며 3분 넘게 — 같은 페이지(새로 열림 0) · 진행이 계속 오르는가 · 나가시겠습니까 0
   ③ 한 페이지로 아직 안 바꾼 화면(요청함)으로 — 업로드 창이 열려 파일을 넘겨받고, 받은 자리부터 이어 가는가
   ④ 정리 — 시험 업로드 취소(받다 만 조각은 서버가 7일 뒤 정리)
   node upload.mjs <큰 파일> */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../../../..');
const { chromium, frontDoor, PW } = await import(pathToFileURL(path.join(ROOT, 'tools/check/common.mjs')).href);
const BIG = process.argv[2];
const BASE = 'https://app.land-xi.dev';
const SH = path.join(HERE, 'shots'); fs.mkdirSync(SH, { recursive: true });
const out = { at: new Date().toISOString(), file: { name: path.basename(BIG), bytes: fs.statSync(BIG).size }, steps: [], dialogs: [], popups: [], errors: [] };
const T0 = Date.now();
const save = () => fs.writeFileSync(path.join(HERE, 'upload.json'), JSON.stringify(out, null, 1));
const step = (k, x = {}) => { const r = { k, t: Math.round((Date.now() - T0) / 1000), at: new Date().toLocaleTimeString('ko-KR', { hour12: false }), ...x }; out.steps.push(r); console.log(JSON.stringify(r).slice(0, 400)); save(); };
const PROFILE = path.join(process.env.TEMP || '.', 'lx-spa-profile');
const ctx = await chromium.launchPersistentContext(PROFILE, { viewport: { width: 1440, height: 900 } });
const page = ctx.pages()[0] || await ctx.newPage();
page.on('dialog', async (d) => { out.dialogs.push({ type: d.type(), t: Math.round((Date.now() - T0) / 1000), url: page.url() }); await d.accept(); });
page.on('pageerror', (e) => out.errors.push('page ' + e.message));
ctx.on('page', (p) => { out.popups.push({ t: Math.round((Date.now() - T0) / 1000), url: p.url() }); p.on('pageerror', (e) => out.errors.push('popup ' + e.message)); });
await frontDoor(page, BASE, 'test@lx.or.kr', { password: PW });
await page.waitForFunction(() => window.__spa?.cur, null, { timeout: 30000 });
step('login', { url: page.url() });
const doc0 = await page.evaluate(() => performance.timeOrigin);
const chip = () => page.evaluate(() => document.querySelector('.k-upchip .t')?.textContent || '');
const row = () => page.evaluate(() => { const r = document.querySelector('.k-up-r'); return r ? { st: r.dataset.st, s: r.querySelector('.k-up-s')?.textContent } : null; });

/* ① */
await page.evaluate(() => window.__spa.go('/landxi/v3/lx-analyze/?card=card-farm'));
await page.locator('.la-own-b').waitFor({ timeout: 30000 });
await page.locator('.la-own-b').click();
await page.locator('.k-upg').waitFor({ timeout: 15000 });
step('guide', { text: (await page.locator('.k-upg').innerText()).replace(/\s+/g, ' ').slice(0, 400) });
await page.locator('.k-upp input[type=file]').setInputFiles(BIG);
await page.locator('.k-upq-w .t-btn').waitFor({ timeout: 20000 });
step('picked', { line: await page.locator('.k-upq-n').innerText() });
await page.screenshot({ path: path.join(SH, 'u1-picked.png') });
await page.locator('.k-upq-w .t-btn').click();
await page.waitForFunction(() => [...document.querySelectorAll('.k-up-r')].some((r) => r.dataset.st === 'up' && /GB \/|MB \//.test(r.textContent)), null, { timeout: 90000 });
step('started', { popups: out.popups.length, chip: await chip(), row: await row() });
await page.waitForTimeout(3000);
await page.screenshot({ path: path.join(SH, 'u2-uploading.png') });

/* ② 네 화면을 메뉴로 — 3분 넘게 */
const tour = [];
const tEnd = Date.now() + 200 * 1000;
const ids = ['home', 'projects', 'analyze', 'mapsvc'];
let i = 0;
while (Date.now() < tEnd) {
  const id = ids[i++ % ids.length];
  await page.locator(`.k-rail [data-id="${id}"]`).first().click();
  await page.waitForFunction((x) => window.__spa?.cur === x, id, { timeout: 30000 });
  await page.mouse.wheel(0, 300);
  await page.waitForTimeout(12000);
  const r = await row();
  tour.push({ at: new Date().toLocaleTimeString('ko-KR', { hour12: false }), screen: id, chip: await chip(), row: r?.s, st: r?.st });
  console.log(JSON.stringify(tour.at(-1)));
  if (i === 3) await page.screenshot({ path: path.join(SH, 'u3-other-screen.png') });
}
const sameDoc = (await page.evaluate(() => performance.timeOrigin)) === doc0;
step('tour', { switches: i, sameDoc, dialogs: out.dialogs.length, popups: out.popups.length, tour });
await page.screenshot({ path: path.join(SH, 'u4-after-tour.png') });

/* ③ 아직 안 바꾼 화면(요청함)으로 — 업로드 창이 넘겨받는다 */
const before = await row();
const popP = ctx.waitForEvent('page', { timeout: 20000 }).catch(() => null);
await page.locator('.k-rail [data-id="inbox"]').first().click();
const host = await popP;
await page.waitForURL(/lx-inbox/, { timeout: 30000 }).catch(() => null);
step('to-inbox', { url: page.url(), host: host?.url() || null, before: before?.s });
if (host) {
  await host.waitForLoadState('domcontentloaded');
  await host.waitForTimeout(20000);
  const hs = await host.evaluate(() => document.querySelector('.k-up-s')?.textContent || '').catch(() => null);
  await page.waitForTimeout(3000);
  step('handed', { host: hs, inboxChip: await chip(), inboxRow: (await row())?.s });
  await host.screenshot({ path: path.join(SH, 'u5-upload-window.png') });
  await page.screenshot({ path: path.join(SH, 'u6-inbox.png') });
  await host.waitForTimeout(15000);
  step('handed+15s', { host: await host.evaluate(() => document.querySelector('.k-up-s')?.textContent || '').catch(() => null) });
  /* ④ 정리 — 업로드 창에서 취소 */
  for (const b of await host.locator('.k-up-r button.x').all()) await b.click().catch(() => null);
  await host.waitForTimeout(2500);
  step('canceled', { host: await host.evaluate(() => document.querySelector('.k-up')?.innerText || '').catch(() => null) });
} else {
  for (const b of await page.locator('.k-up-r button.x').all()) await b.click().catch(() => null);
  step('no-host-canceled');
}
save();
console.log('dialogs', out.dialogs, 'errors', out.errors.slice(0, 5));
await ctx.close();
