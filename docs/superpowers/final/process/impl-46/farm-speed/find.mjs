/* impl-46 지번 찾기(영농-1 · REMAINING 5-2) 증거 — 바깥 기관 주소 · 로그인 폼으로만 · PC 1440 · 390.
   node find.mjs → ./find.json · ./shots/*.png
   첫 줄 지번을 읽어 ① 전체 지번('리 123-4') Enter → 한 필지면 그 필지 카드 ② 번호만('123-4') ③ 없는 지번 → '없습니다' ④ 지우기 → 전체로. */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';

const ROOT = 'E:/Land-XI 플랫폼/01. 디자인';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SH = path.join(HERE, 'shots'); fs.mkdirSync(SH, { recursive: true });
const HW = 'C:/Users/User/AppData/Local/ms-playwright';
if (fs.existsSync(path.join(HW, 'chromium-1234'))) process.env.PLAYWRIGHT_BROWSERS_PATH = HW;
const { chromium } = createRequire(path.join(ROOT, 'package.json'))('playwright');
const { frontDoor } = await import(pathToFileURL(path.join(ROOT, 'landxi/v3/kit/lint/forbidden.mjs')).href);
const ORG = 'https://namwon.land-xi.dev';
const LIST = '/landxi/v3/gov-report/?service=card-farm&tab=sus';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const OUT = { at: new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }), site: ORG, runs: {} };
for (const vp of ['pc', 'mob']) {
  const mob = vp === 'mob';
  const ctx = await browser.newContext({ viewport: mob ? { width: 390, height: 844 } : { width: 1440, height: 900 }, locale: 'ko-KR', ...(mob ? { isMobile: true, hasTouch: true } : {}) });
  const p = await ctx.newPage();
  const R = OUT.runs[vp] = { steps: [], errors: [] };
  p.on('pageerror', (e) => R.errors.push(String(e).slice(0, 160)));
  p.on('response', (r) => { if (r.status() >= 400 && !/favicon/.test(r.url())) R.errors.push(`${r.status()} ${r.url().replace(/[?#].*$/, '').slice(0, 120)}`); });
  await frontDoor(p, ORG, 'lxadmin@lx.or.kr#namwon', 'gov');
  await p.waitForURL((u) => !/\/login\/?(\?|$)/.test(u.pathname), { timeout: 60000 }).catch(() => {});
  await p.goto(ORG + LIST, { waitUntil: 'domcontentloaded' });
  const rows = p.locator('#sus-table tbody tr');
  await p.locator('#sus-table:not(.is-busy) tbody tr').first().waitFor({ timeout: 20000 });
  const first = (await rows.nth(0).locator('td').nth(1).locator('.gr-j').evaluate((e) => e.firstChild?.textContent || e.textContent)).trim();
  const words = first.split(/\s+/);
  const full = words.slice(-2).join(' ');            // '리 123-4'
  const num = words[words.length - 1];
  const find = p.locator('.sp-find');
  const type = async (v, enter) => { const w = p.waitForResponse((r) => /\/guides\/[^/]+\/parcels\?/.test(r.url()), { timeout: 15000 }); await find.fill(v); if (enter) await find.press('Enter'); await w; await sleep(600); };
  const step = async (id, name, fn) => { const t0 = Date.now(); let note = '', ok = true; try { note = await fn(); } catch (e) { ok = false; note = String(e.message || e).slice(0, 160); }
    const s = { id, name, ok, ms: Date.now() - t0, note, hscroll: await p.evaluate(() => document.documentElement.scrollWidth - innerWidth) };
    await p.screenshot({ path: path.join(SH, `${vp}-${id}.png`) }); s.shot = `${vp}-${id}.png`; R.steps.push(s); console.log(vp, id, ok ? 'ok' : 'FAIL', s.ms + 'ms', note); };
  await step('f0-box', '지번 찾기 칸', async () => `칸 '${await find.getAttribute('placeholder')}' · 폭 ${Math.round((await find.boundingBox()).width)}px · 첫 줄 '${first}'`);
  await step('f1-full', `전체 지번 Enter`, async () => {
    await type(full, true);
    const n = await rows.count();
    await sleep(800);
    const card = await p.locator('#det-t').isVisible().catch(() => false) ? await p.locator('#det-t').textContent() : '';
    return `'${full}' → 줄 ${n} · 큰 숫자 ${await p.locator('#sus-big .t-big').textContent()} · 필지 카드 '${card}' · 시점 비교 단추 ${await p.locator('#det-x .sp-cmp').count()}`;
  });
  if (mob) { await p.evaluate(() => { document.body.dataset.sheet = '0'; }); await sleep(400); }
  await step('f2-num', '번호만', async () => { await type(num, false); return `'${num}' → 줄 ${await rows.count()} · 안내 '${await p.locator('#sus-note').textContent().catch(() => '')}'`; });
  await step('f3-none', '없는 지번', async () => { await type('99999-9', false); return `'99999-9' → 줄 ${await rows.count()} · '${(await p.locator('#sus-empty').textContent().catch(() => '')).trim()}'`; });
  await step('f4-clear', '지우기 → 전체', async () => { await type('', false); return `줄 ${await rows.count()} · 큰 숫자 ${await p.locator('#sus-big .t-big').textContent()}`; });
  await ctx.close();
}
await browser.close();
fs.writeFileSync(path.join(HERE, 'find.json'), JSON.stringify(OUT, null, 1));
