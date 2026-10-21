/* 영농-6·7·8 확인 — 바깥 주소 · 로그인 폼 · 1440/390 · 내려받은 파일을 열어 본다. node capture.mjs */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
const ROOT = 'E:/Land-XI 플랫폼/01. 디자인';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SH = path.join(HERE, 'shots'), DL = path.join(HERE, 'dl'); fs.mkdirSync(SH, { recursive: true }); fs.mkdirSync(DL, { recursive: true });
const { chromium } = createRequire(path.join(ROOT, 'package.json'))('playwright');
const { frontDoor } = await import(pathToFileURL(path.join(ROOT, 'landxi/v3/kit/lint/forbidden.mjs')).href);
const ORG = 'https://namwon.land-xi.dev', V = ORG + '/landxi/v3/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = { at: new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }), runs: [] };
const b = await chromium.launch({ channel: 'chrome', headless: true });
for (const [vk, w, h] of [['pc', 1440, 900], ['mob', 390, 844]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, locale: 'ko-KR', acceptDownloads: true, ...(w < 500 ? { isMobile: true, hasTouch: true } : {}) });
  const p = await ctx.newPage();
  const rec = { vp: vk, errors: [], bad: [], steps: {} };
  p.on('console', (m) => { if (m.type() === 'error') rec.errors.push(m.text().slice(0, 160)); });
  p.on('pageerror', (e) => rec.errors.push('pageerror ' + String(e).slice(0, 160)));
  p.on('response', (r) => { if (r.status() >= 400 && !/favicon/.test(r.url())) rec.bad.push(r.status() + ' ' + r.url().replace(/[?#].*$/, '').slice(0, 120)); });
  await frontDoor(p, ORG, 'lxadmin@lx.or.kr#namwon', 'gov');
  // 영농-6 통계 탭
  let t0 = Date.now();
  await p.goto(V + 'gov-select/?service=card-farm&tab=stats', { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('.gs-dash .fd .xd-card', { timeout: 30000 }).catch(() => {});
  rec.steps.statsMs = Date.now() - t0;
  await sleep(600);
  rec.steps.stats = await p.evaluate(() => ({ cards: document.querySelectorAll('.gs-dash .xd-card').length, donut: !!document.querySelector('.gs-dash .xd-donut'), bars: document.querySelectorAll('.gs-dash .xd-hr').length,
    kpi: [...document.querySelectorAll('.gs-dash .xd-kpi')].map((k) => k.textContent.replace(/\s+/g, ' ').trim()), hscroll: document.documentElement.scrollWidth > innerWidth + 1, loadingText: /불러오는 중/.test(document.body.innerText) }));
  await p.screenshot({ path: path.join(SH, `stats-${vk}.png`), fullPage: true });
  if (vk === 'pc') {
    for (const [lab, nm] of [['엑셀', 'stats.xlsx'], ['한글 문서', 'stats.hwpx']]) {
      const [d] = await Promise.all([p.waitForEvent('download', { timeout: 30000 }).catch(() => null), p.locator('.gs-dash-act button', { hasText: lab }).click()]);
      if (d) { await d.saveAs(path.join(DL, nm)); rec.steps['dl_' + nm] = d.suggestedFilename(); } else rec.steps['dl_' + nm] = 'none';
    }
  }
  // 영농-6/7 보고서 탭
  t0 = Date.now();
  await p.goto(V + 'gov-report/?service=card-farm&tab=report', { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('.rp-dash .fd .xd-card', { timeout: 30000 }).catch(() => {});
  rec.steps.reportMs = Date.now() - t0;
  await sleep(1500);
  rec.steps.report = await p.evaluate(() => ({ cards: document.querySelectorAll('.rp-dash .xd-card').length, bars: document.querySelectorAll('.rp-dash .xd-hr').length, hscroll: document.documentElement.scrollWidth > innerWidth + 1,
    zip: !!document.querySelector('.rp-zip'), picks: document.querySelectorAll('.rp-ck').length }));
  await p.screenshot({ path: path.join(SH, `report-${vk}.png`), fullPage: true });
  if (vk === 'pc') {
    const [d] = await Promise.all([p.waitForEvent('download', { timeout: 60000 }).catch(() => null), p.locator('.rp-zip').click()]);
    if (d) { await d.saveAs(path.join(DL, 'bundle.zip')); rec.steps.zip = d.suggestedFilename(); } else rec.steps.zip = 'none';
    await sleep(1200);
    rec.steps.issueRows = await p.evaluate(() => document.querySelectorAll('.rp-iss tbody tr').length);
    rec.steps.issueTop = await p.evaluate(() => document.querySelector('.rp-iss tbody tr')?.textContent.replace(/\s+/g, ' ').slice(0, 120));
  }
  // 영농-7 보낸 요청
  await p.goto(V + 'gov-request/?service=card-farm', { waitUntil: 'domcontentloaded' });
  await sleep(2500);
  rec.steps.sent = await p.evaluate(() => ({ rows: document.querySelectorAll('.sq-sent-r').length, prog: [...document.querySelectorAll('.sq-prog')].map((e) => e.textContent.trim()) }));
  await p.screenshot({ path: path.join(SH, `request-${vk}.png`), fullPage: false });
  // 영농-8 양식
  await p.goto(V + 'gov-fusion/?service=card-farm', { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('.gf-steps', { timeout: 30000 }).catch(() => {});
  await sleep(1500);
  const other = p.locator('button, a', { hasText: '다른 파일' }).first();
  if (await other.count() && await other.isVisible()) { await other.click(); await sleep(800); }
  rec.steps.tpl = await p.locator('.gf-tpl').isVisible().catch(() => false);
  await p.screenshot({ path: path.join(SH, `fusion-${vk}.png`) });
  if (vk === 'pc' && rec.steps.tpl) {
    const [d] = await Promise.all([p.waitForEvent('download', { timeout: 30000 }).catch(() => null), p.locator('.gf-tpl').click()]);
    if (d) { await d.saveAs(path.join(DL, 'template.xlsx')); rec.steps.template = d.suggestedFilename(); }
    // 채운 양식(검사용 · 브라우저 안에서만 읽음 · 서버에 올리지 않음)
    const fx = path.join(DL, 'filled.xlsx');
    if (fs.existsSync(fx)) {
      await p.locator('input[type=file]').first().setInputFiles(fx);
      await p.waitForSelector('.gf-fit', { timeout: 15000 }).catch(() => {});
      rec.steps.fit = await p.locator('.gf-fit').textContent().catch(() => null);
      rec.steps.fitRoles = await p.evaluate(() => [...document.querySelectorAll('.gf-cols select')].map((s) => s.value));
      await p.screenshot({ path: path.join(SH, 'fusion-cols-pc.png') });
    }
  }
  OUT.runs.push(rec);
  await ctx.close();
}
fs.writeFileSync(path.join(HERE, 'items.json'), JSON.stringify(OUT, null, 1));
await b.close();
console.log(JSON.stringify(OUT.runs.map((r) => ({ vp: r.vp, errors: r.errors.slice(0, 4), bad: r.bad.slice(0, 6), steps: r.steps })), null, 1));
