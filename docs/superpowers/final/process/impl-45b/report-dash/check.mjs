// 통계 보고서 보기(대시보드 모양) 확인 — 바깥 주소 · 로그인 폼 · 1440×900 · 390. 비밀번호는 server/.env 에서만.
// 사용: node check.mjs   → items.json + shots/(이 컴퓨터에만 · 저장소에 올리지 않음) + files/(내려받은 한글 문서 · 올리지 않음)
import fs from 'node:fs'; import path from 'node:path'; import zlib from 'node:zlib'; import { createRequire } from 'node:module'; import { pathToFileURL, fileURLToPath } from 'node:url';
const ROOT = 'E:/Land-XI 플랫폼/01. 디자인'; const HW = 'C:/Users/User/AppData/Local/ms-playwright';
if (fs.existsSync(path.join(HW, 'chromium-1234'))) process.env.PLAYWRIGHT_BROWSERS_PATH = HW;
if (!process.env.DEV_PASSWORD) { const m = fs.readFileSync(path.join(ROOT, 'server/.env'), 'utf8').match(/^DEV_PASSWORD=(.*?)\s*$/m); if (m) process.env.DEV_PASSWORD = m[1]; }
process.env.LX_PW ||= process.env.DEV_PASSWORD;
const { chromium } = createRequire(path.join(ROOT, 'package.json'))('playwright');
const { frontDoor } = await import(pathToFileURL(path.join(ROOT, 'landxi/v3/kit/lint/forbidden.mjs')).href);
const HERE = path.dirname(fileURLToPath(import.meta.url)); const SHOTS = path.join(HERE, 'shots'); const FILES = path.join(HERE, 'files');
fs.mkdirSync(SHOTS, { recursive: true }); fs.mkdirSync(FILES, { recursive: true });

// 통계 보고서 보기(대시보드 모양 · 10-21 원칙 299) — 바깥 주소 · 로그인 폼 · 1440 · 390. 비밀번호는 server/.env 에서만. 그림은 이 컴퓨터에만(저장소 공개 · 올리지 않음).
const CASES = [
  { who: 'staff', base: 'https://app.land-xi.dev', id: 'test@lx.or.kr', qs: ['남원시 경작지 현황 보여 줘', '남원시 경작지 통계 보고서 만들어 줘', '그중 가장 큰 곳은?', '보고서 만들어 줘'], panel: true },
  { who: 'inst', base: 'https://namwon.land-xi.dev', id: 'lxadmin@lx.or.kr#namwon', qs: ['읍면동별 비닐하우스 통계 보여 줘', '읍면동별 비닐하우스 통계 보고서 만들어 줘'] },
];
const SIZES = (process.env.SIZES || 'w1440,m390').split(',').map((t) => (t === 'w1440' ? [1440, 900, t] : [390, 844, t]));
const OUT = { at: new Date().toISOString(), what: '통계 보고서 보기(대시보드 모양) — 채팅 답 · 통계 판에서 열기 · 숫자 한 출처 · 여는 시간 · 콘솔 오류', runs: [] };
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const rvState = (p) => p.evaluate(() => !document.querySelector('.rv') ? { missing: true, rv: window.__rv || null } : ({ ...(window.__rv || {}), kpiText: [...document.querySelectorAll('.rv .xd-kpi')].map((k) => k.innerText.replace(/\s+/g, ' ').trim()), title: document.querySelector('.rv h1')?.innerText, meta: document.querySelector('.rv .rv-meta')?.innerText.replace(/\s+/g, ' '), bars: document.querySelectorAll('.rv .rv-bar .xd-hr').length, rank: document.querySelectorAll('.rv .rv-tb tbody tr').length, say: [...document.querySelectorAll('.rv .xd-say-l p')].map((x) => x.innerText), map: !!document.querySelector('.rv .rv-map'), hscroll: document.querySelector('.rv').scrollWidth > document.querySelector('.rv').clientWidth }));
async function openAndShoot(p, w, click, name, s) {
  await p.waitForTimeout(600);                                     // 단추가 생긴 뒤 잠깐(미리 받기)
  await click();
  s.openMs = await p.waitForFunction(() => (window.__rv?.open && document.querySelector('.rv.in .xd-kpi') ? Math.round(performance.now() - window.__t0) : 0), null, { timeout: 15000, polling: 'raf' }).then((h) => h.jsonValue()).catch(() => null);
  const t0 = Date.now();
  await p.waitForFunction(() => document.querySelector('.rv .rv-map') || !document.querySelector('.rv [data-map]'), null, { timeout: 8000, polling: 50 }).catch(() => {});
  s.mapMsAfterOpen = Date.now() - t0;
  await p.waitForTimeout(400);
  s.view = await rvState(p);
  await p.screenshot({ path: path.join(SHOTS, `${name}.png`) });
  if (w > 500) await p.screenshot({ path: path.join(SHOTS, `${name}-full.png`), fullPage: false, clip: undefined });
  // 더 보기 → 모든 읍면동
  const more = p.locator('.rv .rv-more[data-more="rank"]');
  if (await more.count()) { await more.click(); await p.waitForTimeout(250); s.rankAll = await p.evaluate(() => document.querySelectorAll('.rv .rv-tb tbody tr').length);
    await p.evaluate(() => { const r = document.querySelector('.rv'); r.scrollTop = r.scrollHeight; }); await p.waitForTimeout(250); await p.screenshot({ path: path.join(SHOTS, `${name}-more.png`) }); }
  // 내려받기 두 개
  s.dl = {};
  for (const f of ['hwpx', 'xlsx']) {
    const dl = p.waitForEvent('download', { timeout: 30000 }).catch(() => null);
    await p.locator(`.rv .rv-dl[data-f="${f}"]`).click().catch(() => {});
    const d = await dl; if (d) { const fp = path.join(FILES, `${name}.${f}`); await d.saveAs(fp); s.dl[f] = { name: d.suggestedFilename(), bytes: fs.statSync(fp).size }; }
  }
  await p.keyboard.press('Escape'); await p.waitForTimeout(400);
  s.closed = await p.evaluate(() => !document.querySelector('.rv'));
}
for (const C of CASES) for (const [w, hh, tag] of SIZES) {
  const ctx = await browser.newContext({ viewport: { width: w, height: hh }, deviceScaleFactor: 1, acceptDownloads: true, ...(w < 500 ? { isMobile: true, hasTouch: true } : {}) });
  const p = await ctx.newPage(); const errs = [];
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); }); p.on('pageerror', (e) => errs.push('PAGE ' + String(e).slice(0, 200)));
  await frontDoor(p, C.base, C.id); await p.waitForTimeout(800);
  await p.goto(C.base + '/landxi/v3/xi-clean/?region=52190', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForFunction(() => document.querySelector('.k-ck-i') && !document.querySelector('.xc-load:not(.is-out)'), null, { timeout: 90000, polling: 100 });
  await p.waitForTimeout(2500);
  const row = { who: C.who, size: tag, steps: [] }; OUT.runs.push(row);
  for (const [i, q] of C.qs.entries()) {
    const prev = await p.evaluate(() => document.querySelector('.xk-ans .xk-ans-t')?.textContent || '');
    const n0 = await p.evaluate(() => document.querySelectorAll('button.k-ck-rep').length);
    const inp = p.locator('.k-ck-i').first(); await inp.click({ timeout: 10000 }); await inp.fill(q); const ts = Date.now(); await inp.press('Enter');
    await p.waitForFunction((pv) => { const a = document.querySelector('.xk-ans:not([hidden]):not(.is-busy)'); return a && a.querySelector('.xk-more') && a.querySelector('.xk-ans-t').textContent !== pv; }, prev, { timeout: 90000, polling: 50 }).catch(() => {});
    const s = { q, ansMs: Date.now() - ts };
    await p.waitForTimeout(i === 0 ? 4000 : 1800);
    s.band = await p.evaluate(() => document.querySelector('.xk-ans:not([hidden]) .xk-ans-t')?.innerText || null);
    // 통계 판 '보고서 보기'(PC · 첫 답 뒤) — 판의 큰 숫자와 보고서 큰 숫자
    if (C.panel && i === 0 && w > 500) {
      await p.locator('.xo-mini button', { hasText: '통계 보기' }).first().click({ timeout: 8000 }).catch(() => {});
      await p.waitForTimeout(1800);
      s.panelBig = await p.evaluate(() => ({ label: document.querySelector('.xo-head .xo-l')?.innerText, big: document.querySelector('.xo-head .xo-big')?.innerText.replace(/\s+/g, ' '), kp: [...document.querySelectorAll('.xo-head .xo-kp > div')].map((d) => d.innerText.replace(/\s+/g, ' ')) }));
      await p.screenshot({ path: path.join(SHOTS, `${C.who}-${tag}-panel.png`) });
      s.panelReport = {};
      await openAndShoot(p, w, () => p.evaluate(() => { window.__t0 = performance.now(); document.querySelector('.xo-rep').click(); }), `${C.who}-${tag}-panel-report`, s.panelReport);
      await p.locator('.xo-only').first().click().catch(() => {}); await p.waitForTimeout(800);
    }
    const n1 = await p.evaluate(() => document.querySelectorAll('button.k-ck-rep').length);
    if (n1 > n0) {
      const more = p.locator('.xk-ans .xk-more'); if (await more.count()) { await more.click().catch(() => {}); await p.waitForTimeout(900); }
      await p.screenshot({ path: path.join(SHOTS, `${C.who}-${tag}-q${i + 1}-drawer.png`) });
      s.chatReport = {};
      await openAndShoot(p, w, () => p.evaluate(() => { window.__t0 = performance.now(); [...document.querySelectorAll('button.k-ck-rep')].pop().click(); }), `${C.who}-${tag}-q${i + 1}-report`, s.chatReport);
      s.drawerAfterClose = await p.evaluate(() => !!document.querySelector('.k-chat-root') && !document.querySelector('.rv'));
      await p.keyboard.press('Escape').catch(() => {}); await p.waitForTimeout(500);
    }
    row.steps.push(s); console.log(JSON.stringify(s).slice(0, 900));
  }
  row.errs = errs.slice(); await ctx.close();
}
fs.writeFileSync(path.join(HERE, 'items.json'), JSON.stringify(OUT, null, 1)); await browser.close();
