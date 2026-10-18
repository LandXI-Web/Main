// 같은 분류 × 같은 곳 숫자 한 출처 — 직원 · 기관 XI맵: 업무 합계 · 말풍선 줄 · 채팅 통계 · 보고서 · 통계 판 · 서비스 카드 숫자가 같은지. 바깥 주소 · 로그인 폼 · 1440. 비밀번호는 server/.env 에서만.
import fs from 'node:fs'; import path from 'node:path'; import { createRequire } from 'node:module'; import { pathToFileURL, fileURLToPath } from 'node:url';
const ROOT = 'E:/Land-XI 플랫폼/01. 디자인'; const HW = 'C:/Users/User/AppData/Local/ms-playwright';
if (fs.existsSync(path.join(HW, 'chromium-1234'))) process.env.PLAYWRIGHT_BROWSERS_PATH = HW;
if (!process.env.DEV_PASSWORD) { const m = fs.readFileSync(path.join(ROOT, 'server/.env'), 'utf8').match(/^DEV_PASSWORD=(.*?)\s*$/m); if (m) process.env.DEV_PASSWORD = m[1]; }
process.env.LX_PW ||= process.env.DEV_PASSWORD;
const { chromium } = createRequire(path.join(ROOT, 'package.json'))('playwright');
const { frontDoor } = await import(pathToFileURL(path.join(ROOT, 'landxi/v3/kit/lint/forbidden.mjs')).href);
const HERE = path.dirname(fileURLToPath(import.meta.url)); const SHOTS = path.join(HERE, 'shots');
const CASES = [{ who: 'inst', base: 'https://namwon.land-xi.dev', id: 'lxadmin@lx.or.kr#namwon' }, { who: 'staff', base: 'https://app.land-xi.dev', id: 'test@lx.or.kr' }];
const OUT = { at: new Date().toISOString(), cases: [] };
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
for (const C of CASES) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true }); const p = await ctx.newPage(); const errs = [];
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); }); p.on('pageerror', (e) => errs.push('PAGE ' + String(e).slice(0, 200)));
  p.on('response', (r) => { if (r.status() >= 400) errs.push(`HTTP ${r.status()} ` + r.url().replace(/\?.*/, '').slice(-90)); });
  await frontDoor(p, C.base, C.id); await p.waitForTimeout(800);
  await p.goto(C.base + '/landxi/v3/xi-clean/?region=52190', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForFunction(() => document.querySelector('.k-ck-i') && !document.querySelector('.xc-load:not(.is-out)'), null, { timeout: 90000, polling: 100 });
  await p.waitForTimeout(3000);
  const row = { who: C.who, steps: [] }; OUT.cases.push(row);
  row.layers = await p.evaluate(async () => { const j = await (await import('/landxi/v3/kit/util.js')).api('/regions/52190/results').catch(() => null); return (j?.items || []).map((x) => ({ name: x.name?.ko, count: x.count?.value, full: x.full, card: x.card_id, at: x.finished_at })); });
  row.board = await p.evaluate(async () => { const j = await (await import('/landxi/v3/kit/util.js')).api('/ximap/board').catch(() => null); return ((j?.regions || []).find((r) => String(r.sgg_cd) === '52190')?.items || []).map((x) => ({ svc: x.svc, name: x.name, n: x.n?.value, at: x.finished_at })); });
  if (C.who === 'inst') row.card = await p.evaluate(async () => { const a = (await import('/landxi/v3/kit/util.js')).api; const me = await a('/spaces/me').catch((e) => null);
    const out = [{ raw: (me?.services || []).map((x) => ({ card: x.card || x.id, name: x.name, n: x.n ?? x.total ?? null })) }]; for (const sv of me?.services || me?.items || []) { const g = await a('/spaces/me/guides/' + encodeURIComponent(sv.card)).catch(() => null); const b = g?.body || g; out.push({ name: sv.name, card: sv.card, total: b?.what?.total?.value ?? null, sets: b?.sets || null }); }
    return { keys: Object.keys(me || {}), out }; });
  row.layersOn = await p.evaluate(() => (window.__xc?.results || null));
  if (C.who === 'staff') row.nat = await p.evaluate(async () => { const a = (await import('/landxi/v3/kit/util.js')).api; const ev = (e) => (e && typeof e === 'object' ? e.value : e) ?? 0;
    const r = await a('/national/region?codes=52190').catch(() => null); const g = await a('/national/progress').catch(() => null); const t = await a('/ximap/agg?by=task&sgg=52190').catch(() => null);
    const c = r?.assets?.farm?.counts?.['비닐하우스']; const cg = g?.assets?.farm?.counts?.['비닐하우스'];
    return { region_found: ev(c?.n), region_net: c?.net ? ev(c.net) : null, nation_found: ev(cg?.n), nation_net: cg?.net ? ev(cg.net) : null,
      agg_rows: (t?.rows || []).filter((x) => x.k === '비닐하우스').map((x) => ({ name: x.name, n: x.n, src: x.src })), agg_dup: (t?.dup || []).filter((x) => x.k === '비닐하우스') }; });
  row.hud = await p.evaluate(() => window.__xc?.hud || null);
  for (const [i, q] of ['남원시 비닐하우스 현황 보여 줘', '읍면동별 비닐하우스 통계 보여 줘', '읍면동별 비닐하우스 통계 보고서 만들어 줘'].entries()) {
    const prev = await p.evaluate(() => document.querySelector('.xk-ans .xk-ans-t')?.textContent || '');
    const inp = p.locator('.k-ck-i').first(); await inp.click(); await inp.fill(q); const ts = Date.now(); await inp.press('Enter');
    await p.waitForFunction(() => document.querySelector('.xk-ans.is-busy'), null, { timeout: 8000, polling: 50 }).catch(() => {});
    await p.waitForFunction(() => { const a = document.querySelector('.xk-ans:not([hidden]):not(.is-busy)'); return a && a.querySelector('.xk-more'); }, null, { timeout: 90000, polling: 200 }).catch(() => {});
    const ansMs = Date.now() - ts;
    await p.waitForTimeout(3000);
    const band = await p.evaluate(() => document.querySelector('.xk-ans:not([hidden]) .xk-ans-t')?.innerText || null);
    await p.screenshot({ path: path.join(SHOTS, `${C.who}-q${i + 1}.png`) });
    row.steps.push({ q, ansMs, band });
  }
  await p.waitForTimeout(1500);
  await p.locator('.xo-mini button', { hasText: '통계 보기' }).first().click({ timeout: 8000 }).catch(() => {}); await p.waitForTimeout(2000);
  row.panel = await p.evaluate(() => (document.querySelector('.xo')?.innerText || '').slice(0, 2400));
  await p.screenshot({ path: path.join(SHOTS, `${C.who}-panel.png`) });
  row.errs = errs; console.log(JSON.stringify(row)); await ctx.close();
}
fs.writeFileSync(path.join(HERE, 'raw.json'), JSON.stringify(OUT, null, 1)); await browser.close();
