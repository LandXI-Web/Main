// 국토 변화 탐지 §7 6~8단계 — 판정 2건(현장확인) → 휴대폰 현장점검(사진 · 불법) → 보고서(미리보기 · PDF) → 관리자 기관 공유 → 한국도로공사 대시보드
// node docs/superpowers/final/process/impl-46/change-c22/p1.mjs <base> <project> <job> <photo.jpg>
import { chromium, devices } from 'playwright';
import { frontDoor } from '../../../../../../landxi/v3/kit/lint/forbidden.mjs';
import { MEASURE } from '../../../../../../landxi/v3/kit/lint/overlap.mjs';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const [BASE = 'https://app.land-xi.dev', PROJECT, JOB, PHOTO] = process.argv.slice(2);
const out = { steps: [], ov: {}, errs: [] };
const T0 = Date.now();
const step = (k, extra = {}) => { out.steps.push({ k, s: Math.round((Date.now() - T0) / 100) / 10, ...extra }); console.log(k, JSON.stringify(extra).slice(0, 300)); };
async function shot(page, n) { await page.screenshot({ path: path.join(HERE, 'shots', n) }); try { const m = await page.evaluate(MEASURE); out.ov[n] = (m.overlaps || []).map((o) => `${o.a} × ${o.b} (${o.kind} ${o.w}x${o.h})`); } catch (e) { out.ov[n] = ['measure ' + e.message]; } }
const browser = await chromium.launch();

// ── 6-1 LX 직원 PC — 지도 서비스에서 두 건 '현장확인' ──
{
  const page = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
  page.on('pageerror', (e) => out.errs.push('staff ' + e));
  await frontDoor(page, BASE, 'test@lx.or.kr', 'app');
  await page.goto(`${BASE}/landxi/v3/lx-map/?project=${PROJECT}&change=${JOB}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => (window.__lxChange?.fc?.features || []).length > 0, null, { timeout: 60000 });
  await page.waitForTimeout(2500);
  const ids = await page.evaluate(() => {
    const fs = window.__lxChange.fc.features.filter((f) => f.properties.inside_row === '내');
    const pick = [fs.find((f) => f.properties.type === '신축'), fs.find((f) => f.properties.type === '포장 확대')].filter(Boolean);
    return pick.map((f) => f.id);
  });
  for (const id of ids) {
    await page.evaluate((i) => document.dispatchEvent(new CustomEvent('kit:change-pick', { detail: { id: i } })), id);
    await page.waitForTimeout(1500);
    await page.locator('.chg-panel .chg-stb[data-st="현장확인"]').click();
    await page.locator('.chg-panel .chg-save').click();
    await page.waitForTimeout(1500);
  }
  await page.locator('.chg-panel .chg-x').click().catch(() => null);
  await page.waitForTimeout(1500);
  out.marked = ids;
  out.card = await page.locator('.chg-card').innerText().catch(() => '');
  step('6-1 현장확인 2건', { ids });
  await shot(page, '20-marked-map.png');
  await page.close();
}
// ── 6-2 휴대폰 — 현장점검 목록 → 상세 → 사진 → '불법' ──
{
  const ctx = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => out.errs.push('mobile ' + e));
  await frontDoor(page, BASE, 'test@lx.or.kr', 'app');
  await page.goto(`${BASE}/landxi/v3/change-field/?job=${JOB}`, { waitUntil: 'domcontentloaded' });
  await page.locator('.cf-item').first().waitFor({ timeout: 60000 });
  await page.waitForTimeout(1200);
  out.field_n = await page.locator('.cf-item').count();
  await shot(page, '21-m-field-list.png');
  await page.locator('.cf-item').first().click();
  await page.locator('.cf-ab img').first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(2500);
  await shot(page, '22-m-field-detail.png');
  if (PHOTO) {
    await page.locator('.cf-detail input[type=file]').setInputFiles(PHOTO);
    await page.locator('.cf-photos img').first().waitFor({ timeout: 30000 });
  }
  await page.locator('.cf-stb', { hasText: '불법' }).click();
  await page.locator('.cf-memo').fill('현장 확인 — 가설 구조물');
  await page.locator('.cf-save').click();
  await page.waitForTimeout(2500);
  out.field_status = await page.locator('.cf-hist li').first().innerText().catch(() => '');
  step('6-2 휴대폰 사진 · 불법', { n: out.field_n, last: out.field_status });
  await page.locator('.cf-save').scrollIntoViewIfNeeded();
  await shot(page, '23-m-field-saved.png');
  await ctx.close();
}
// ── 7 ChatGEO 보고서 → 미리보기 → PDF ──
{
  const page = await (await browser.newContext({ viewport: { width: 1920, height: 1080 }, acceptDownloads: true })).newPage();
  page.on('pageerror', (e) => out.errs.push('report ' + e));
  await frontDoor(page, BASE, 'test@lx.or.kr', 'app');
  await page.goto(`${BASE}/landxi/v3/lx-map/?project=${PROJECT}&change=${JOB}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => (window.__lxChange?.fc?.features || []).length > 0, null, { timeout: 60000 });
  if (await page.locator('#k-chat').isHidden()) await page.locator('.k-chat-fab').click();
  await page.locator('.k-ck-i').fill('도로공사 보고용 보고서 만들어줘');
  const t0 = Date.now();
  await page.locator('.k-ck-i').press('Enter');
  await page.waitForFunction(() => document.querySelector('#k-chat')?.dataset.state === 'busy', null, { timeout: 10000 }).catch(() => null);
  await page.waitForFunction(() => document.querySelector('#k-chat')?.dataset.state !== 'busy', null, { timeout: 120000 });
  await page.waitForTimeout(2000);
  const ans = await page.evaluate(() => [...document.querySelectorAll('#k-chat .k-ck-a')].map((x) => x.innerText).filter(Boolean).pop() || '');
  step('7 보고서 답', { ms: Date.now() - t0, ans: ans.slice(0, 300) });
  await shot(page, '24-chat-report.png');
  const link = page.locator('#k-chat a', { hasText: '보고서 미리보기' }).last();
  const href = await link.getAttribute('href').catch(() => null);
  await page.goto(href ? new URL(href, BASE).href : `${BASE}/landxi/v3/change-report/?job=${JOB}`, { waitUntil: 'domcontentloaded' });
  await page.locator('.cr-paper h1').waitFor({ timeout: 60000 });
  await page.waitForTimeout(2500);
  await shot(page, '25-report-preview.png');
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 120000 }), page.locator('.cr-bar .t-btn', { hasText: 'PDF' }).click()]);
  const pdfPath = path.join(HERE, 'shots', '26-report.pdf');
  await dl.saveAs(pdfPath);
  out.pdf_bytes = fs.statSync(pdfPath).size;
  step('7 PDF', { bytes: out.pdf_bytes });
  await page.close();
}
// ── 8-1 LX 관리자 — 배포 → 기관 공유에서 국토 변화 분석서비스 × 도로공사 ──
{
  const page = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
  page.on('pageerror', (e) => out.errs.push('admin ' + e));
  await frontDoor(page, BASE.replace('://app.', '://admin.'), 'lxadmin@lx.or.kr', 'admin');
  await page.goto(`${BASE.replace('://app.', '://admin.')}/landxi/v3/ops-infra/#/deploys/share`, { waitUntil: 'domcontentloaded' });
  const box = page.locator('input[type=checkbox][aria-label="국토 변화 분석서비스 · 도로공사 공유"]');
  await box.waitFor({ timeout: 60000 });
  if (!(await box.isChecked())) { await box.check(); await page.waitForTimeout(2000); }
  out.shared = await box.isChecked();
  step('8-1 기관 공유', { shared: out.shared });
  await box.scrollIntoViewIfNeeded();
  await shot(page, '27-admin-share.png');
  await page.close();
}
// ── 8-2 한국도로공사 — 기관 주소 로그인 → 대시보드 ──
{
  const page = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
  page.on('pageerror', (e) => out.errs.push('kec ' + e));
  await frontDoor(page, BASE, 'lxadmin@lx.or.kr', { tenant: 'kec' });
  await page.locator('.cd-card').first().waitFor({ timeout: 60000 });
  await page.waitForTimeout(2000);
  out.kec_url = page.url();
  out.kec_cards = await page.locator('.cd-card').allInnerTexts();
  step('8-2 도로공사 대시보드', { url: out.kec_url, n: out.kec_cards.length });
  await shot(page, '28-kec-dashboard.png');
  await page.close();
}
out.total_s = Math.round((Date.now() - T0) / 1000);
fs.writeFileSync(path.join(HERE, 'p1.json'), JSON.stringify(out, null, 1));
console.log(JSON.stringify({ total_s: out.total_s, errs: out.errs, ov: Object.fromEntries(Object.entries(out.ov).filter(([, v]) => v.length)) }));
await browser.close();
