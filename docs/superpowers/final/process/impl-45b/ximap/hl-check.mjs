// XI ChatGEO 답 ↔ 지도 강조(원칙 292) · 서랍 열면 답 띠 숨김 — 바깥 주소 · 로그인 폼 · 1440×900 · 390. 비밀번호는 server/.env 에서만.
// 사용: node hl-check.mjs staff|inst   → hl-<who>.json + shots/(이 컴퓨터에만 · 저장소에 올리지 않음)
import fs from 'node:fs'; import path from 'node:path'; import { createRequire } from 'node:module'; import { pathToFileURL, fileURLToPath } from 'node:url';
const ROOT = 'E:/Land-XI 플랫폼/01. 디자인'; const HW = 'C:/Users/User/AppData/Local/ms-playwright';
if (fs.existsSync(path.join(HW, 'chromium-1234'))) process.env.PLAYWRIGHT_BROWSERS_PATH = HW;
if (!process.env.DEV_PASSWORD) { const m = fs.readFileSync(path.join(ROOT, 'server/.env'), 'utf8').match(/^DEV_PASSWORD=(.*?)\s*$/m); if (m) process.env.DEV_PASSWORD = m[1]; }
process.env.LX_PW ||= process.env.DEV_PASSWORD;
const { chromium } = createRequire(path.join(ROOT, 'package.json'))('playwright');
const { frontDoor } = await import(pathToFileURL(path.join(ROOT, 'landxi/v3/kit/lint/forbidden.mjs')).href);
const HERE = path.dirname(fileURLToPath(import.meta.url)); const SHOTS = path.join(HERE, 'shots'); fs.mkdirSync(SHOTS, { recursive: true });
const WHO = process.argv[2] || 'staff';
const base = WHO === 'inst' ? 'https://namwon.land-xi.dev' : 'https://app.land-xi.dev';
const who = WHO === 'inst' ? 'lxadmin@lx.or.kr#namwon' : 'test@lx.or.kr';
const QS = WHO === 'inst' ? ['읍면동별 현장 확인 필요 필지 순위', '그중 가장 많은 곳은?', '산내면만', '임실군 경작지 현황 보여 줘']
  : ['남원시 경작지 현황 보여 줘', '그중 가장 큰 곳은?', '송동면만'];
const SIZES = [[1440, 900, 'w1440'], [390, 844, 'm390']].filter((s) => !process.argv[3] || s[2] === process.argv[3]);
const OUT = [];
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
for (const [w, hh, tag] of SIZES) {
  const ctx = await browser.newContext({ viewport: { width: w, height: hh }, deviceScaleFactor: 1, ...(w < 500 ? { isMobile: true, hasTouch: true } : {}) });
  const p = await ctx.newPage(); const errs = [];
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); }); p.on('pageerror', (e) => errs.push('PAGE ' + String(e).slice(0, 200)));
  await frontDoor(p, base, who); await p.waitForTimeout(800);
  const t0 = Date.now(); await p.goto(base + '/landxi/v3/xi-clean/?region=52190', { waitUntil: 'domcontentloaded', timeout: 60000 });
  // '불러오는 중'이 떠 있는 시간
  await p.waitForFunction(() => document.querySelector('.k-ck-i') && !document.querySelector('.xc-load:not(.is-out)'), null, { timeout: 90000, polling: 100 });
  const loadMs = Date.now() - t0; await p.waitForTimeout(2500);
  const row = { who: WHO, size: tag, loadMs, steps: [] }; OUT.push(row);
  for (const [i, q] of QS.entries()) {
    const prev = await p.evaluate(() => document.querySelector('.xk-ans .xk-ans-t')?.textContent || '');
    const inp = p.locator('.k-ck-i').first(); await inp.click({ timeout: 10000 }); await inp.fill(q); const ts = Date.now(); await inp.press('Enter');
    await p.waitForFunction((pv) => { const a = document.querySelector('.xk-ans:not([hidden]):not(.is-busy)'); return a && a.querySelector('.xk-more') && a.querySelector('.xk-ans-t').textContent !== pv; }, prev, { timeout: 90000, polling: 50 }).catch(() => {});
    const ansMs = Date.now() - ts;
    await p.waitForTimeout(i === 0 ? 5200 : 2600);                                      // 통계 차오름 · 날아가기 · 강조 반짝
    const st = await p.evaluate(() => ({ hl: window.__xc?.hl || null, band: document.querySelector('.xk-ans:not([hidden]) .xk-ans-t')?.innerText || null,
      refs: [...document.querySelectorAll('.xk-ans .xk-ref')].map((x) => x.textContent), chips: document.querySelectorAll('.xk-ans .xk-ref-n').length,
      layer: !!window.__xc && !!document.querySelector('canvas') }));
    await p.screenshot({ path: path.join(SHOTS, `hl-${WHO}-${tag}-q${i + 1}.png`) });
    const s = { q, ansMs, ...st };
    // 첫 답: 이름에 올림(지도 반짝) → 누름(그 곳으로 + 조건)
    if (i === 0 && st.refs.length) {
      const ref = p.locator('.xk-ans .xk-ref').first();
      if (w > 500) { await ref.hover(); await p.waitForTimeout(500); await p.screenshot({ path: path.join(SHOTS, `hl-${WHO}-${tag}-hover.png`) }); }
      await ref.click(); await p.waitForTimeout(2200);
      s.click = await p.evaluate(() => ({ focus: window.__xc?.hl?.focus || null, chip: [...document.querySelectorAll('.xc-chip')].map((x) => x.textContent), zoom: null }));
      await p.screenshot({ path: path.join(SHOTS, `hl-${WHO}-${tag}-click.png`) });
    }
    row.steps.push(s); console.log(JSON.stringify(s));
  }
  // 서랍 열면 답 띠 숨김 · 닫으면 다시
  const more = p.locator('.xk-ans .xk-more');
  if (await more.count()) {
    await more.click(); await p.waitForTimeout(900);
    const open = await p.evaluate(() => ({ drawer: !!document.querySelector('.k-drawer.is-open .xk-dlog, .k-drawer .xk-dlog'), bandHidden: document.querySelector('.xk-ans')?.hidden ?? null, refsInDrawer: document.querySelectorAll('.k-drawer .xk-ref').length }));
    await p.screenshot({ path: path.join(SHOTS, `hl-${WHO}-${tag}-drawer.png`) });
    await p.keyboard.press('Escape'); await p.waitForTimeout(900);
    const closed = await p.evaluate(() => ({ bandHidden: document.querySelector('.xk-ans')?.hidden ?? null }));
    if (closed.bandHidden) { await p.locator('.k-drawer .k-dr-x, .k-drawer [aria-label*="닫기"]').first().click().catch(() => {}); await p.waitForTimeout(800); closed.after = await p.evaluate(() => document.querySelector('.xk-ans')?.hidden ?? null); }
    row.drawer = { open, closed }; console.log(JSON.stringify(row.drawer));
  }
  row.errs = errs.slice(); await ctx.close();
}
fs.writeFileSync(path.join(HERE, `hl-${WHO}${process.argv[3] ? "-" + process.argv[3] : ""}.json`), JSON.stringify(OUT, null, 1)); await browser.close();
