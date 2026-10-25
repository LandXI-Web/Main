// 10-25 확인 — 바깥 주소 · 로그인 폼(LX 직원) · 비밀번호는 env LX_PW 또는 server/.env
//   node verify.mjs <base> <part>
//   part ui  = 관광지 카드 두 숫자 · 국토 변화(행정구역 · 구간 업로드) · 산사태(지구 업로드) 오른쪽 칸 — 분석은 시작하지 않음
//   part run-change    = 국토 변화 · 행정구역(남원시 동충동) · 2020 ↔ 2025 분석 시작 → 지도 서비스
//   part run-landslide = 산사태 · 예시 지구 업로드(버퍼 50 m) · 2020 ↔ 2025 분석 시작 → 지도 서비스
import { chromium } from 'playwright';
import { frontDoor } from '../../../../../../landxi/v3/kit/lint/forbidden.mjs';
import { MEASURE } from '../../../../../../landxi/v3/kit/lint/overlap.mjs';
import { CLIP } from '../../../../../../landxi/v3/kit/lint/clip.mjs';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const [BASE = 'https://app.land-xi.dev', PART = 'ui'] = process.argv.slice(2);
const SHOTS = path.join(HERE, 'shots'); fs.mkdirSync(SHOTS, { recursive: true });
const OUT = path.join(HERE, `verify-${PART}.json`);
const out = { base: BASE, part: PART, at: new Date().toISOString(), steps: [], ov: {}, clip: {}, errs: [] };
const T0 = Date.now();
const save = () => fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
const step = (k, extra = {}) => { out.steps.push({ k, t: Math.round((Date.now() - T0) / 100) / 10, ...extra }); console.log(k, JSON.stringify(extra).slice(0, 400)); save(); };
async function shot(page, n, full = false) {
  await page.screenshot({ path: path.join(SHOTS, n), fullPage: full });
  try { const m = await page.evaluate(MEASURE); out.ov[n] = (m.overlaps || []).map((o) => `${o.a} × ${o.b} (${o.kind} ${o.w}x${o.h})`); } catch (e) { out.ov[n] = ['measure ' + e.message]; }
  try { const c = await page.evaluate(CLIP); out.clip[n] = { hard: (c.hard || []).map((x) => `${x.kind} ${x.sel} ${String(x.text).slice(0, 40)}`), warn: (c.warn || []).length }; } catch (e) { out.clip[n] = 'clip ' + e.message; }
  save();
}
const ZONES = path.join(HERE, '남원_산림_예시지구.geojson');
const ctx = await (await chromium.launch()).newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => out.errs.push(String(e)));
await frontDoor(page, BASE, 'test@lx.or.kr', 'app');
step('login', { url: page.url() });
const card = (id) => page.goto(`${BASE}/landxi/v3/lx-analyze/?card=${id}`, { waitUntil: 'domcontentloaded' });
const side = () => page.locator('aside.la-side');
async function region(name, emd) {
  await side().locator('.rg-seg button[data-k="region"]').click();
  const inp = side().locator('.k-region-i');
  await inp.fill(name);
  await page.waitForTimeout(600);
  await side().locator('.k-region-l li[role="option"]').first().click();
  if (emd) {
    await page.waitForFunction(() => !document.querySelector('aside.la-side .rg-pane select')?.disabled, null, { timeout: 30000 });
    const sel = side().locator('.rg-pane select');
    const v = await sel.locator('option', { hasText: emd }).first().getAttribute('value');
    await sel.selectOption(v);
  }
}
async function upload(file, buf) {
  await side().locator('.rg-file-in').setInputFiles(file);
  if (buf !== undefined) {
    const box = side().locator('.rg-check input').first();
    if (!(await box.isChecked())) await box.check();
    await side().locator('.rg-num').fill(String(buf));
  }
}
async function readyPickers() {
  await page.waitForFunction(() => { const s = document.querySelectorAll('aside.la-side .la-chg-slot select:not(.la-chg-yr)'); return s.length === 2 && [...s].every((x) => !x.disabled && x.options.length > 1); }, null, { timeout: 60000 });
}
async function pickYears(a, b) {
  const s = side().locator('.la-chg-slot select:not(.la-chg-yr)');
  await s.nth(0).selectOption(String(a)); await s.nth(1).selectOption(String(b));
}
const sideText = () => side().innerText();

if (PART === 'ui') {
  // ① 관광지 안전관리 — 두 숫자(카드 상세 · 갤러리)
  await card('card-crowd');
  await page.locator('.la-big').first().waitFor({ timeout: 30000 });
  step('crowd-detail', { big: await page.locator('.la-big').first().innerText() });
  await page.locator('.la-big').first().scrollIntoViewIfNeeded();
  await shot(page, '01-crowd-detail.png');
  await page.goto(`${BASE}/landxi/v3/lx-analyze/`, { waitUntil: 'domcontentloaded' });
  await page.locator('.k-sc').first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(1500);
  const crowd = page.locator('.k-sc', { hasText: '관광지 안전관리' }).first();
  step('crowd-gallery', { res: await crowd.locator('.k-sc-res').innerText().catch(() => '') , landslide: await page.locator('.k-sc', { hasText: '산사태 취약지구' }).count() });
  await shot(page, '02-gallery.png');
  // ② 국토 변화 — 처음(목록 없음) · 행정구역 · 구간 업로드
  await card('card-change');
  await side().locator('.rg-seg').waitFor({ timeout: 30000 });
  await page.waitForTimeout(1500);
  step('change-first', { side: await sideText() });
  await shot(page, '03-change-first.png');
  let t = Date.now();
  await region('남원', '동충동');
  await readyPickers();
  step('change-region', { ms: Date.now() - t, side: await sideText() });
  await shot(page, '04-change-region.png');
  await card('card-change');
  await side().locator('.rg-seg').waitFor({ timeout: 30000 });
  t = Date.now();
  await upload(ZONES, 30);
  await readyPickers();
  step('change-upload', { ms: Date.now() - t, side: await sideText() });
  await shot(page, '05-change-upload-30m.png');
  // ③ 산사태 — 지구 업로드(버퍼 처음 50 m 켬)
  await card('card-landslide');
  await side().locator('.rg-seg').waitFor({ timeout: 30000 });
  await page.waitForTimeout(1200);
  step('landslide-first', { side: await sideText(), buf: await side().locator('.rg-num').inputValue(), bufOn: await side().locator('.rg-check input').first().isChecked() });
  await shot(page, '06-landslide-first.png', true);
  t = Date.now();
  await upload(ZONES);
  await readyPickers();
  step('landslide-upload', { ms: Date.now() - t, side: await sideText() });
  await shot(page, '07-landslide-upload.png');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(800);
  await side().scrollIntoViewIfNeeded();
  await shot(page, '08-landslide-mobile.png');
}

if (PART === 'run-change' || PART === 'run-landslide') {
  const ls = PART === 'run-landslide';
  await card(ls ? 'card-landslide' : 'card-change');
  await side().locator('.rg-seg').waitFor({ timeout: 30000 });
  if (ls) await upload(ZONES); else await region('남원', '동충동');
  await readyPickers();
  await pickYears(2020, 2025);
  await page.waitForTimeout(500);
  step('ready', { side: await sideText() });
  const t = Date.now();
  await Promise.all([page.waitForURL(/lx-map/, { timeout: 60000 }), side().locator('.la-go').click()]);
  const job = new URL(page.url()).searchParams.get('change');
  step('started', { job, ms: Date.now() - t });
  out.job = job; save();
  // 끝날 때까지(최대 20분) — 지도 서비스 카드에 결과 숫자
  await page.waitForFunction(() => /변화 \d|변화 [0-9,]+건/.test(document.querySelector('.chg-card')?.innerText || ''), null, { timeout: 1200000, polling: 3000 });
  await page.waitForTimeout(3000);
  step('done', { s: Math.round((Date.now() - t) / 1000), card: await page.locator('.chg-card').innerText() });
  await shot(page, ls ? '10-landslide-map.png' : '09-change-map.png');
}
if (PART === 'after') {
  // ① 산사태 결과 — 지도 서비스(지구별 · 구간 줄)
  await page.goto(`${BASE}/landxi/v3/lx-map/?change=job_01M5R4NDS3537AB5QHQHHZ4YJM`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => /지구별/.test(document.querySelector('.chg-card')?.innerText || ''), null, { timeout: 90000 });
  await page.waitForTimeout(2500);
  step('landslide-map', { card: await page.locator('.chg-card').innerText(), list: await page.locator('.lm-grp', { hasText: '산사태' }).first().innerText().catch(() => '') });
  await shot(page, '10-landslide-map.png');
  // ② 사료작물 비교 — 카드에서 견주기 → 지도 서비스에서 보기
  await card('card-ba9d6d');
  await side().locator('select').first().waitFor({ timeout: 30000 });
  const sels = side().locator('select');
  await sels.nth(0).selectOption('job_01M5Q21ZHFPT6F3TC22KKTWRBM');
  await sels.nth(1).selectOption('job_01M5Q2202Q8D5CCKZVYZ7GE1AH');
  let t = Date.now();
  await side().locator('.la-go').click();
  await side().locator('.la-cmp-st a').waitFor({ timeout: 120000 });
  step('compare-done', { ms: Date.now() - t, side: await side().locator('.la-cmp-st').innerText(), body_has_result: await page.locator('.la-cmp-r').count() });
  await shot(page, '11-compare-card.png');
  t = Date.now();
  await side().locator('.la-cmp-st a').click();
  await page.waitForURL(/lx-map/, { timeout: 30000 });
  await page.waitForFunction(() => [...document.querySelectorAll('.lm-ly li.is-on')].some((li) => /필지/.test(li.innerText)), null, { timeout: 60000 });
  await page.waitForTimeout(3000);
  step('compare-map', { ms: Date.now() - t, url: page.url(), row: await page.locator('.lm-ly li.is-on').first().innerText(), legend: await page.locator('.lm-lgd').innerText().catch(() => '') });
  await shot(page, '12-compare-map.png');
  // ③ XI맵 — 관광지 안전관리 사람 · 차량 따로 · 합계 없음
  await page.goto(`${BASE}/landxi/v3/xi-clean/`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__xc?.boardSpec && window.__xc.boardSpec(), null, { timeout: 90000 });
  const spec = await page.evaluate(() => { const s = window.__xc.boardSpec(); return { kpis: s.kpis, main: s.main, say: s.say, crowd: s.panels.flatMap((p) => p.rows || []).filter((r) => JSON.stringify(r).includes('관광지')) }; });
  step('ximap-spec', spec);
  await page.locator('.xb-k--line').first().click().catch(() => {});
  await page.waitForTimeout(2500);
  await shot(page, '13-ximap-board.png');
}
save();
await ctx.close();
process.exit(0);
