// 국토 변화 탐지 §7 1~8단계 한 번에(녹화 대본 그대로 · 로그인 폼 · 끊김 없이) — 단계마다 시각 · 걸린 시간 · 그림 · 겹침
// node docs/superpowers/final/process/impl-46/change-c22/full.mjs <base> <photo.jpg>
import { chromium, devices } from 'playwright';
import { frontDoor } from '../../../../../../landxi/v3/kit/lint/forbidden.mjs';
import { MEASURE } from '../../../../../../landxi/v3/kit/lint/overlap.mjs';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const [BASE = 'https://app.land-xi.dev', PHOTO] = process.argv.slice(2);
const LINE = 'E:/Land-XI 플랫폼/02. 데이터/change/inputs/담양IC_구역선.geojson';
const NAME = '고속국도 담양IC 변화 모니터링';
const out = { steps: [], ov: {}, errs: [] };
const T0 = Date.now();
let tS = Date.now();
const done = (k, extra = {}) => { const now = Date.now(); out.steps.push({ k, step_s: Math.round((now - tS) / 100) / 10, at_s: Math.round((now - T0) / 100) / 10, ...extra }); tS = now; console.log(k, Math.round((now - T0) / 1000) + 's', JSON.stringify(extra).slice(0, 240)); };
const shot = async (page, n) => { await page.screenshot({ path: path.join(HERE, 'shots', 'full-' + n) }); try { const m = await page.evaluate(MEASURE); out.ov[n] = (m.overlaps || []).map((o) => `${o.a} × ${o.b}`); } catch (e) { out.ov[n] = ['measure ' + e.message]; } };
async function ask(page, q) {
  if (await page.locator('#k-chat').isHidden()) { await page.locator('.k-chat-fab').click(); await page.waitForTimeout(300); }
  await page.locator('.k-ck-i').fill(q);
  const t0 = Date.now();
  await page.locator('.k-ck-i').press('Enter');
  await page.waitForFunction(() => document.querySelector('#k-chat')?.dataset.state === 'busy', null, { timeout: 10000 }).catch(() => null);
  await page.waitForFunction(() => document.querySelector('#k-chat')?.dataset.state !== 'busy', null, { timeout: 600000 });
  const ms = Date.now() - t0;
  const ans = await page.evaluate(() => [...document.querySelectorAll('#k-chat .k-ck-a')].map((x) => x.innerText).filter(Boolean).pop() || '');
  const failed = await page.evaluate(() => document.querySelector('#k-chat')?.dataset.state === 'error');
  return { ms, ans: ans.replace(/\s+/g, ' ').slice(0, 260), failed };
}
const browser = await chromium.launch();
const pc = await browser.newContext({ viewport: { width: 1920, height: 1080 }, acceptDownloads: true });
const page = await pc.newPage();
page.on('pageerror', (e) => out.errs.push(String(e)));
await frontDoor(page, BASE, 'test@lx.or.kr', 'app');
tS = Date.now();

// 1 새 프로젝트
await page.goto(BASE + '/landxi/v3/lx-project/?new=1', { waitUntil: 'domcontentloaded' });
await page.locator('.lxp-new input[name=name]').waitFor({ timeout: 30000 });
await page.locator('.lxp-new input[name=name]').fill(NAME);
await page.locator('.lxp-reg-tg').click();
await page.locator('.lxp-rm .lxp-vt[data-k=line]').click();
await page.locator('.lxp-buf').fill('50');
await page.locator('.lxp-rng input[type=file]').first().setInputFiles(LINE);
await page.locator('.lxp-yrs .lxp-chip').first().waitFor({ timeout: 60000 });
for (const b of await page.locator('.lxp-yrs .lxp-chip').all()) { const y = parseInt(await b.textContent(), 10); if (((await b.getAttribute('aria-pressed')) === 'true') !== [2019, 2024].includes(y)) await b.click(); }
await page.locator('.lxp-new .lxp-act .t-btn').first().click();
await page.waitForURL(/lx-map\/\?project=/, { timeout: 60000 });
await page.locator('.chg-card').waitFor({ timeout: 60000 });
await page.locator('.k-sw-grip').waitFor({ timeout: 60000 });
const project = new URL(page.url()).searchParams.get('project');
done('1 프로젝트 생성 → 두 해 영상', { labels: await page.locator('.k-sw-lab').allTextContents() });
await shot(page, '1.png');

// 2 비교
let r = await ask(page, '2019년과 2024년 항공영상 비교해서 구역선 안에 새로 생긴 것 찾아줘');
await page.waitForFunction(() => (window.__lxChange?.fc?.features || []).length > 0, null, { timeout: 60000 });
const job = await page.evaluate(() => window.__lxChange.job);
done('2 비교 · 폴리곤 · 요약', r);
await shot(page, '2.png');

// 3 폴리곤 → 이거 뭐야
const pick = await page.evaluate(() => { const f = window.__lxChange.fc.features.find((x) => x.properties.inside_row === '내' && x.properties.type === '신축') || window.__lxChange.fc.features[0]; return f.id; });
await page.evaluate((id) => document.dispatchEvent(new CustomEvent('kit:change-pick', { detail: { id } })), pick);
await page.locator('.chg-panel .chg-ab img').first().waitFor({ timeout: 30000 });
await page.waitForTimeout(1200);
r = await ask(page, '이거 뭐야?');
done('3 폴리곤 A/B · 이거 뭐야', { pick, ...r });
await shot(page, '3.png');

// 4 표
r = await ask(page, '지목이 도로인데 건물 생긴 필지만 소유구분이랑 같이 표로');
const rows = await page.evaluate(() => [...document.querySelectorAll('#k-chat .k-ck-rows')].pop()?.innerText || '');
done('4 필지 표 · 강조 · CSV', { ...r, rows: rows.replace(/\s+/g, ' ').slice(0, 200) });
await shot(page, '4.png');

// 5 철도
r = await ask(page, '철도용지도 같은 방식으로');
await page.waitForURL((u) => { const q = new URL(u).searchParams.get('project'); return !!q && q !== project; }, { timeout: 30000 });
await page.waitForLoadState('domcontentloaded');
await page.waitForFunction(() => (window.__lxChange?.fc?.features || []).length > 0, null, { timeout: 60000 });
done('5 철도 같은 방식', { url_project: new URL(page.url()).searchParams.get('project'), card: (await page.locator('.chg-card .chg-big').innerText().catch(() => '')).replace(/\s+/g, ' ') });
await shot(page, '5.png');

// (5 뒤) 담양 대상지 지도로 돌아와 6 · 7
await page.goto(`${BASE}/landxi/v3/lx-map/?project=${project}&change=${job}`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => (window.__lxChange?.fc?.features || []).length > 0, null, { timeout: 60000 });
await page.waitForTimeout(1000);
// 6-1 판정 2건
const ids = await page.evaluate(() => { const fs = window.__lxChange.fc.features.filter((f) => f.properties.inside_row === '내'); return [fs.find((f) => f.properties.type === '신축'), fs.find((f) => f.properties.type === '포장 확대')].filter(Boolean).map((f) => f.id); });
for (const id of ids) {
  await page.evaluate((i) => document.dispatchEvent(new CustomEvent('kit:change-pick', { detail: { id: i } })), id);
  await page.locator('.chg-panel .chg-stb[data-st="현장확인"]').waitFor({ timeout: 20000 });
  await page.locator('.chg-panel .chg-stb[data-st="현장확인"]').click();
  await page.locator('.chg-panel .chg-save').click();
  await page.waitForTimeout(1200);
}
done('6 판정 2건 현장확인', { ids });

// 6-2 휴대폰
const mob = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 844 } });
const mp = await mob.newPage();
mp.on('pageerror', (e) => out.errs.push('mobile ' + e));
await frontDoor(mp, BASE, 'test@lx.or.kr', 'app');
await mp.goto(`${BASE}/landxi/v3/change-field/?job=${job}`, { waitUntil: 'domcontentloaded' });
await mp.locator('.cf-item').first().waitFor({ timeout: 60000 });
const n = await mp.locator('.cf-item').count();
await mp.locator('.cf-item').first().click();
await mp.locator('.cf-ab img').first().waitFor({ timeout: 30000 });
if (PHOTO) { await mp.locator('.cf-detail input[type=file]').setInputFiles(PHOTO); await mp.locator('.cf-photos img').first().waitFor({ timeout: 30000 }); }
await mp.locator('.cf-stb', { hasText: '불법' }).click();
await mp.locator('.cf-save').click();
await mp.waitForTimeout(1500);
done('6 휴대폰 목록 · 사진 · 불법', { n, last: (await mp.locator('.cf-hist li').first().innerText().catch(() => '')).replace(/\s+/g, ' ') });
await shot(mp, '6m.png');
await mob.close();

// 7 보고서(이 대상지)
r = await ask(page, '도로공사 보고용 보고서 만들어줘');
done('7 보고서 답', r);
await shot(page, '7.png');
const rp = await pc.newPage();
await rp.goto(`${BASE}/landxi/v3/change-report/?job=${job}`, { waitUntil: 'domcontentloaded' });
await rp.locator('.cr-paper h1').waitFor({ timeout: 60000 });
const [dl] = await Promise.all([rp.waitForEvent('download', { timeout: 120000 }), rp.locator('.cr-bar .t-btn', { hasText: 'PDF' }).click()]);
const pdfPath = path.join(HERE, 'shots', 'full-report.pdf'); await dl.saveAs(pdfPath);
done('7 미리보기 · PDF', { bytes: fs.statSync(pdfPath).size });
await shot(rp, '7b.png');
await rp.close();

// 8 기관 공유 → 도로공사 대시보드
const adm = await browser.newPage();
await frontDoor(adm, BASE.replace('://app.', '://admin.'), 'lxadmin@lx.or.kr', 'admin');
await adm.goto(`${BASE.replace('://app.', '://admin.')}/landxi/v3/ops-infra/#/deploys/share`, { waitUntil: 'domcontentloaded' });
const box = adm.locator('input[type=checkbox][aria-label="국토 변화 분석서비스 · 도로공사 공유"]');
await box.waitFor({ timeout: 60000 });
if (!(await box.isChecked())) { await box.check(); await adm.waitForTimeout(1500); }
await adm.close();
const kec = await browser.newPage();
await frontDoor(kec, BASE, 'lxadmin@lx.or.kr', { tenant: 'kec' });
await kec.locator('.cd-card').first().waitFor({ timeout: 60000 });
done('8 기관 공유 · 도로공사 대시보드', { cards: (await kec.locator('.cd-card').allInnerTexts()).map((x) => x.replace(/\s+/g, ' ').slice(0, 120)) });
await shot(kec, '8.png');
out.total_s = Math.round((Date.now() - T0) / 1000);
out.project = project; out.job = job;
fs.writeFileSync(path.join(HERE, 'full.json'), JSON.stringify(out, null, 1));
console.log(JSON.stringify({ total_s: out.total_s, errs: out.errs, ov: Object.fromEntries(Object.entries(out.ov).filter(([, v]) => v.length)) }));
await browser.close();
