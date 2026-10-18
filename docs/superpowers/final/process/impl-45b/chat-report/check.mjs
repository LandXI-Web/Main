// XI ChatGEO 보고서 대상 · 지도 서비스 '클래스' 칸 — 바깥 주소 · 로그인 폼 · 1440×900 · 390. 비밀번호는 server/.env 에서만.
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

/** hwpx(zip) 안 본문 글 — 만든 시각 줄은 뺀다(두 문서 비교용) */
function hwpxText(buf) {
  const out = []; let i = 0;
  while (i < buf.length - 30) {
    if (buf.readUInt32LE(i) !== 0x04034b50) { i++; continue; }
    const meth = buf.readUInt16LE(i + 8), csz = buf.readUInt32LE(i + 18), nl = buf.readUInt16LE(i + 26), xl = buf.readUInt16LE(i + 28);
    const name = buf.slice(i + 30, i + 30 + nl).toString(); const st = i + 30 + nl + xl; const data = buf.slice(st, st + csz);
    if (/Contents\/section\d+\.xml$/.test(name)) { const x = (meth === 8 ? zlib.inflateRawSync(data) : data).toString('utf8'); out.push(...[...x.matchAll(/<hp:t>([^<]*)<\/hp:t>/g)].map((m) => m[1])); }
    i = st + csz;
  }
  return out.filter((t) => !/\d{4}\. \d{2}\. \d{2}\./.test(t));
}

const CASES = [
  { who: 'staff', base: 'https://app.land-xi.dev', id: 'test@lx.or.kr', qs: ['남원시 경작지 현황 보여 줘', '남원시 경작지 통계 보고서 만들어 줘', '그중 가장 큰 곳은?', '보고서 만들어 줘'], panelRep: true },
  { who: 'inst', base: 'https://namwon.land-xi.dev', id: 'lxadmin@lx.or.kr#namwon', qs: ['읍면동별 비닐하우스 통계 보여 줘', '읍면동별 비닐하우스 통계 보고서 만들어 줘', '임실군 비닐하우스 통계 보고서 만들어 줘'] },
];
const SIZES = [[1440, 900, 'w1440'], [390, 844, 'm390']];
const OUT = { at: new Date().toISOString(), chat: [], lxmap: [] };
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const newPage = async (w, hh) => {
  const ctx = await browser.newContext({ viewport: { width: w, height: hh }, deviceScaleFactor: 1, acceptDownloads: true, ...(w < 500 ? { isMobile: true, hasTouch: true } : {}) });
  const p = await ctx.newPage(); const errs = [];
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); }); p.on('pageerror', (e) => errs.push('PAGE ' + String(e).slice(0, 200)));
  return { ctx, p, errs };
};
for (const C of CASES) for (const [w, hh, tag] of SIZES) {
  const { ctx, p, errs } = await newPage(w, hh);
  await frontDoor(p, C.base, C.id); await p.waitForTimeout(800);
  await p.goto(C.base + '/landxi/v3/xi-clean/?region=52190', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForFunction(() => document.querySelector('.k-ck-i') && !document.querySelector('.xc-load:not(.is-out)'), null, { timeout: 90000, polling: 100 });
  await p.waitForTimeout(2500);
  const row = { who: C.who, size: tag, steps: [] }; OUT.chat.push(row);
  for (const [i, q] of C.qs.entries()) {
    const prev = await p.evaluate(() => document.querySelector('.xk-ans .xk-ans-t')?.textContent || '');
    const nf0 = await p.evaluate(() => document.querySelectorAll('button.k-ck-file').length);
    const inp = p.locator('.k-ck-i').first(); await inp.click({ timeout: 10000 }); await inp.fill(q); const ts = Date.now(); await inp.press('Enter');
    await p.waitForFunction((pv) => { const a = document.querySelector('.xk-ans:not([hidden]):not(.is-busy)'); return a && a.querySelector('.xk-more') && a.querySelector('.xk-ans-t').textContent !== pv; }, prev, { timeout: 90000, polling: 50 }).catch(() => {});
    const ansMs = Date.now() - ts;
    await p.waitForTimeout(i === 0 ? 5200 : 2600);
    const st = await p.evaluate(() => ({ band: document.querySelector('.xk-ans:not([hidden]) .xk-ans-t')?.innerText || null, hl: window.__xc?.hl ? { mode: window.__xc.hl.mode, names: window.__xc.hl.names } : null }));
    await p.screenshot({ path: path.join(SHOTS, `${C.who}-${tag}-q${i + 1}.png`) });
    const s = { q, ansMs, ...st };
    // 첫 답 뒤 '통계 보기' 판의 '보고서로'(PC만) — 채팅 보고서와 같은 문서인지 비교할 기준
    if (C.panelRep && i === 0 && w > 500) {
      await p.locator('.xo-mini button', { hasText: '통계 보기' }).first().click({ timeout: 8000 }).catch(() => {});
      await p.waitForTimeout(1800);
      const dl = p.waitForEvent('download', { timeout: 30000 }).catch(() => null);
      await p.locator('.xo-rep').first().click({ timeout: 8000 }).catch(() => {});
      const d = await dl;
      if (d) { const f = path.join(FILES, `${C.who}-${tag}-panel.hwpx`); await d.saveAs(f); s.panelFile = path.basename(f); row.panel = hwpxText(fs.readFileSync(f)); }
      await p.screenshot({ path: path.join(SHOTS, `${C.who}-${tag}-q1-panel.png`) });
      await p.locator('.xo-only').first().click().catch(() => {}); await p.waitForTimeout(800);
    }
    // 이 답에 새 파일 블록이 생겼으면 내려받아 글을 본다(대화 서랍 안)
    const nf1 = await p.evaluate(() => document.querySelectorAll('button.k-ck-file').length);
    if (nf1 > nf0) {
      const dl = p.waitForEvent('download', { timeout: 30000 }).catch(() => null);
      await p.evaluate(() => { const b = [...document.querySelectorAll('button.k-ck-file')].pop(); b.click(); });
      const d = await dl;
      if (d) {
        const f = path.join(FILES, `${C.who}-${tag}-q${i + 1}.hwpx`); await d.saveAs(f); const tx = hwpxText(fs.readFileSync(f));
        s.file = { name: d.suggestedFilename(), head: tx.slice(0, 14).join(' | '), hasGreenhouse: tx.some((t) => t.includes('비닐하우스')), hasFarm: tx.some((t) => t.includes('경작지')) };
        if (C.panelRep && i === 1 && row.panel) s.sameAsPanel = JSON.stringify(tx) === JSON.stringify(row.panel);
      }
    }
    row.steps.push(s); console.log(JSON.stringify(s));
  }
  delete row.panel;
  // 대화 서랍(파일 블록이 보이는 곳) 한 장
  const more = p.locator('.xk-ans .xk-more');
  if (await more.count()) { await more.click().catch(() => {}); await p.waitForTimeout(900); await p.screenshot({ path: path.join(SHOTS, `${C.who}-${tag}-drawer.png`) }); }
  row.errs = errs.slice(); await ctx.close();
}
// 지도 서비스 — 결과 층을 모두 끄면 '클래스' 칸이 없다('null' 글자 0)
for (const [w, hh, tag] of SIZES) {
  const { ctx, p, errs } = await newPage(w, hh);
  await frontDoor(p, 'https://app.land-xi.dev', 'test@lx.or.kr'); await p.waitForTimeout(800);
  await p.goto('https://app.land-xi.dev/landxi/v3/lx-map/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForSelector('.lm-groups', { timeout: 60000 }); await p.waitForTimeout(3000);
  const before = await p.evaluate(() => ({ on: document.querySelectorAll('.lm-sw[aria-checked="true"]').length, cls: !!document.querySelector('.lm-cls') }));
  for (let k = 0; k < 30; k++) {
    const n = await p.evaluate(() => { const b = document.querySelector('.lm-sw[aria-checked="true"]'); if (b) b.click(); return document.querySelectorAll('.lm-sw[aria-checked="true"]').length; });
    await p.waitForTimeout(600); if (!n) break;
  }
  await p.waitForTimeout(1200);
  const after = await p.evaluate(() => { const L = document.querySelector('.lm-groups')?.parentElement; const txt = [...(L?.childNodes || [])].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).filter(Boolean);
    return { on: document.querySelectorAll('.lm-sw[aria-checked="true"]').length, cls: !!document.querySelector('.lm-cls'), strayText: txt, nullText: /(^|\s)null(\s|$)/.test(L?.innerText || '') }; });
  await p.screenshot({ path: path.join(SHOTS, `lxmap-${tag}-all-off.png`) });
  const r = { size: tag, before, after, errs: errs.slice() }; OUT.lxmap.push(r); console.log(JSON.stringify(r)); await ctx.close();
}
fs.writeFileSync(path.join(HERE, 'items.json'), JSON.stringify(OUT, null, 1)); await browser.close();
