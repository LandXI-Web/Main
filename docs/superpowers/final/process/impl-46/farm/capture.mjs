/* impl-46 영농-1~5 증거 — 바깥 기관 주소(https://namwon.land-xi.dev) · 로그인 폼(frontDoor)으로만 · PC 1440 · 390.
   node capture.mjs [pc|mob|all]   → ./items.json · ./shots/*.png
   화면마다 시간을 잰다(도착 → 표 · 블록이 보일 때까지) · '불러오는 중' 구간을 모두 적는다(1.5초 넘는 것 표시).
   메모 일괄 확인은 시험 메모 한 줄('기능 확인용 메모')을 20필지에 적고, 필지 이력에 줄이 생긴 것을 본 뒤 그 시험 줄만 지운다(cleanup.py · 감사 기록은 그대로). */
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

const ORG = 'https://namwon.land-xi.dev', CARD = 'card-farm';
const LIST = `/landxi/v3/gov-report/?service=${CARD}&tab=sus`;
const MEMO = '기능 확인용 메모';
const which = process.argv[2] || 'all';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const INIT = `(() => { window.__ld = { runs: [], cur: null };
  setInterval(() => { const on = !!document.body && /불러오는 중/.test(document.body.innerText); const t = performance.now();
    if (on && window.__ld.cur === null) window.__ld.cur = t;
    if (!on && window.__ld.cur !== null) { window.__ld.runs.push([Math.round(window.__ld.cur), Math.round(t)]); window.__ld.cur = null; } }, 100); })();`;

const OUT = fs.existsSync(path.join(HERE, 'items.json')) ? JSON.parse(fs.readFileSync(path.join(HERE, 'items.json'), 'utf8')) : {};
OUT.generatedAt = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' });
OUT.site = ORG; OUT.login = '로그인 폼(기관 메인 로그인 카드)';
OUT.runs = OUT.runs || {};
const save = () => fs.writeFileSync(path.join(HERE, 'items.json'), JSON.stringify(OUT, null, 1));

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

async function run(vp) {
  const mob = vp === 'mob';
  const ctx = await browser.newContext({ viewport: mob ? { width: 390, height: 844 } : { width: 1440, height: 900 }, locale: 'ko-KR', deviceScaleFactor: 1,
    ...(mob ? { isMobile: true, hasTouch: true } : {}), acceptDownloads: true });
  await ctx.addInitScript(INIT);
  const p = await ctx.newPage();
  const R = { vp, steps: [], errors: [], failed: [], loading: [] };
  OUT.runs[vp] = R;
  p.on('console', (m) => { if (m.type() === 'error') R.errors.push(m.text().slice(0, 200)); });
  p.on('pageerror', (e) => R.errors.push('pageerror ' + String(e).slice(0, 200)));
  p.on('response', (r) => { if (r.status() >= 400 && !/favicon/.test(r.url())) R.failed.push(`${r.status()} ${r.url().replace(/[?#].*$/, '').slice(0, 140)}`); });
  const flush = async (phase) => {
    const L = await p.evaluate(() => { const x = window.__ld; const o = x ? { runs: x.runs.splice(0), cur: x.cur, now: Math.round(performance.now()) } : null; return o; }).catch(() => null);
    if (!L) return;
    for (const [a, b] of L.runs) R.loading.push({ phase, ms: b - a, over: b - a > 1500 });
    if (L.cur !== null) R.loading.push({ phase, ms: L.now - L.cur, still: true, over: L.now - L.cur > 1500 });
  };
  const shot = async (name) => { const f = `${vp}-${name}.png`; await p.screenshot({ path: path.join(SH, f) }); return f; };
  const hscroll = () => p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  const step = async (id, name, fn) => {
    const t0 = Date.now(); let ok = true, note = '';
    try { note = (await fn()) || ''; } catch (e) { ok = false; note = String(e.message || e).slice(0, 200); }
    const ms = Date.now() - t0;
    await flush(id);
    const s = { id, name, ok, ms, note, hscroll: await hscroll().catch(() => null) };
    try { s.shot = await shot(id); } catch { /* */ }
    R.steps.push(s); save();
    console.log(vp, id, ok ? 'ok' : 'FAIL', ms + 'ms', note);
    return s;
  };

  await frontDoor(p, ORG, 'lxadmin@lx.or.kr#namwon', 'gov');
  await p.waitForURL((u) => !/\/login\/?(\?|$)/.test(u.pathname), { timeout: 60000 }).catch(() => {});
  await flush('login');
  const rows = () => p.locator('#sus-table tbody tr');
  const big = () => p.evaluate(() => document.querySelector('#sus-big')?.dataset.v || document.querySelector('#sus-big .t-big')?.textContent || '');
  const waitTable = async () => { await p.locator('#sus-table:not(.is-busy) tbody tr').first().waitFor({ timeout: 15000 }); await sleep(150); };
  /* 거르기 한 번 = 서버 한 번 — 응답이 오고 표가 다시 그려질 때까지 */
  const reload = async (act) => { const w = p.waitForResponse((r) => /\/guides\/[^/]+\/parcels\?/.test(r.url()), { timeout: 15000 }); await act(); await w; await sleep(250); };

  await step('01-list', '필지 목록(영농-1) 처음', async () => {
    await p.goto(ORG + LIST, { waitUntil: 'domcontentloaded' });
    await waitTable();
    return `줄 ${await rows().count()} · 큰 숫자 ${await big()}`;
  });
  if (!mob) {
    await step('02-filter', '읍면동 · 종류 · 메모 없음 거르기', async () => {
      const emd = p.locator('.sp-bar select[aria-label="읍면동"]');
      const v = await emd.locator('option').nth(1).getAttribute('value');
      const opts = await emd.locator('option').allTextContents();
      const pickI = Math.max(1, opts.findIndex((t) => /면 /.test(t)));
      const v2 = await emd.locator('option').nth(pickI).getAttribute('value');
      await reload(() => emd.selectOption(v2));
      const cls = p.locator('.sp-bar select[aria-label="종류"]');
      await reload(() => cls.selectOption({ index: 2 }));
      await reload(() => p.locator('.sp-chip', { hasText: '메모 없음만' }).click());
      const n = await p.evaluate(() => document.querySelector('#sus-big .t-big')?.textContent || '');
      const lab = await p.locator('#sus-big .k-big-l').textContent();
      return `${v2} · ${await cls.inputValue()} · 메모 없음 → 큰 숫자 '${lab} ${n}' · 줄 ${await rows().count()} · 안내 '${await p.locator('#sus-note').textContent()}'`;
    });
    await step('03-diff', '대장과 다름만', async () => {
      await reload(() => p.locator('.sp-bar select[aria-label="종류"]').selectOption(''));
      await reload(() => p.locator('.sp-chip', { hasText: '메모 없음만' }).click());
      await reload(() => p.locator('.sp-bar select[aria-label="읍면동"]').selectOption(''));
      await reload(() => p.locator('.sp-chip', { hasText: '대장과 다름만' }).click());
      return `큰 숫자 ${await p.locator('#sus-big .t-big').textContent()} · 줄 ${await rows().count()} · '${await p.locator('#sus-note').textContent()}'`;
    });
    await step('03b-sort', '지번 순 · 리 거르기', async () => {
      await reload(() => p.locator('.sp-chip', { hasText: '대장과 다름만' }).click());
      const emd = p.locator('.sp-bar select[aria-label="읍면동"]');
      const opts = await emd.locator('option').allTextContents();
      await reload(() => emd.selectOption({ index: Math.max(1, opts.findIndex((t) => /면 /.test(t))) }));
      const ri = p.locator('.sp-bar select.sp-ri');
      await reload(() => ri.selectOption({ index: 1 }));
      await reload(() => p.locator('.sp-bar select[aria-label="정렬"]').selectOption('jibun'));
      const first = await rows().nth(0).locator('td').nth(1).textContent();
      return `리 ${await ri.inputValue()} · 지번 순 첫 줄 ${first} · 줄 ${await rows().count()}`;
    });
  }
  /* 고르기 20(없으면 있는 만큼) → 띠 */
  await step('04-band', '여러 필지 고르기 → 띠', async () => {
    if (!mob) { await reload(() => p.locator('.sp-bar select.sp-ri').selectOption('')); await reload(() => p.locator('.sp-bar select[aria-label="읍면동"]').selectOption('')); }
    const cks = p.locator('#sus-table tbody .sp-ck');
    const n = Math.min(20, await cks.count());
    for (let i = 0; i < n; i++) await cks.nth(i).check();
    await p.locator('.sp-band:not([hidden])').waitFor({ timeout: 5000 });
    return `${await p.locator('.sp-n').textContent()} · 띠 높이 ${await p.locator('.sp-band').evaluate((e) => Math.round(e.getBoundingClientRect().height))}px`;
  });
  if (!mob) {
    await step('04b-xlsx', '고른 필지 엑셀', async () => {
      const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 20000 }), p.locator('.sp-band button', { hasText: '엑셀로 내려받기' }).click()]);
      const f = path.join(HERE, 'shots', 'pick.xlsx'); await dl.saveAs(f);
      const sz = fs.statSync(f).size; fs.unlinkSync(f);
      return `${dl.suggestedFilename()} · ${sz} bytes`;
    });
    await step('05-memo', '메모 쓰기 창(고른 필지 전부)', async () => {
      await p.locator('.sp-band button', { hasText: '메모 쓰기' }).click();
      await p.locator('.k-md .sp-memo').fill(MEMO);
      return await p.locator('.k-md .sp-who').textContent();
    });
    await step('05b-saved', '메모 저장 → 목록 갱신', async () => {
      await reload(() => p.locator('.k-md .sp-save').click());
      const marks = await p.locator('#sus-table tbody .gr-j small', { hasText: '메모 있음' }).count();
      return `메모 있음 표시 ${marks}줄 · 띠 ${await p.locator('.sp-band').isHidden() ? '닫힘' : '열림'}`;
    });
  }
  /* 필지 카드 — 시점 비교 · 메모 · 이력 */
  await step('06-card', '필지 카드 · 이력(영농-3)', async () => {
    if (mob) { await p.locator('.sp-band button', { hasText: '고르기 풀기' }).click().catch(() => {}); }
    await rows().nth(0).locator('td').nth(1).click();
    await p.locator('#det-x .sp-hist li').first().waitFor({ state: 'attached', timeout: 10000 });
    await p.locator('#det-x details.sp-hd summary').click();
    await sleep(900);   // XI ChatGEO 단추가 새로 생긴 칸을 비키는 시간(0.3초 뒤 자리 다시 잼)
    const chg = await p.locator('#det-x .sp-chg').isVisible() ? await p.locator('#det-x .sp-chg').textContent() : '(바뀜 줄 없음)';
    const lines = await p.locator('#det-x .sp-hist li').allTextContents();
    return `바뀜 '${chg}' · 이력 ${lines.length}줄: ${lines.slice(0, 4).join(' | ')}`;
  });
  if (mob) {
    await step('06b-filter-sheet', '거르기 단추 → 창(390)', async () => {
      await p.evaluate(() => { document.body.dataset.sheet = '0'; });
      await sleep(400);
      await p.locator('.sp-fbtn').click();
      await p.locator('.k-md .sp-bar').waitFor({ timeout: 5000 });
      await sleep(700);
      return `창 안 칸 ${await p.locator('.k-md .sp-bar > *:not([hidden])').count()}`;
    });
    await p.locator('.k-md .sp-done').click().catch(() => {});
  }
  /* 시점 비교 → XI맵 */
  await step('07-compare', '시점 비교(영농-2) — 가르기 · 두 시점 · 바뀜 한 줄', async () => {
    if (mob) { await rows().nth(0).locator('td').nth(1).click(); await sleep(500); }
    const t0 = Date.now();
    await p.locator('#det-x .sp-cmp').click();
    await p.locator('.gx-cmp-t').waitFor({ timeout: 20000 });
    const tBand = Date.now() - t0;
    await sleep(mob ? 4000 : 2500);
    const line = await p.locator('.gx-cmp-t').textContent();
    const len = await p.locator('.gx-cmp-t b').evaluate((e) => e.textContent.length);
    const sel = await p.locator('.xc-cmp select').evaluateAll((a) => a.map((s) => s.selectedOptions[0]?.textContent));
    const shapes = await p.evaluate(() => { const m = window.__xc?.map; try { return m ? (m.getSource('k-pcmp')?._data?.features?.length ?? 'no-src') : 'no-map'; } catch { return 'err'; } });
    return `위 띠 ${tBand}ms '${line}' (바뀜 ${len}자) · 왼쪽/오른쪽 ${sel.join(' / ')} · 오른쪽 결과 면 ${shapes}`;
  });
  if (!mob) {
    await step('07b-grip', '가르기 손잡이 끌기', async () => {
      const g = p.locator('.xc-grip, [class*="grip"][role="slider"]').first();
      const b = await g.boundingBox();
      if (!b) return '손잡이 없음';
      await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await p.mouse.down(); await p.mouse.move(b.x - 200, b.y + b.height / 2, { steps: 8 }); await p.mouse.up();
      return `--sw ${await p.evaluate(() => document.querySelector('.k-main, main')?.style.getPropertyValue('--sw'))}`;
    });
  }
  /* 보고서 탭 — 결과 하나 = 필지 전이 블록 없음(영농-5) */
  await step('08-report', '보고서 탭 — 결과 하나면 필지 전이 블록 없음', async () => {
    await p.goto(ORG + `/landxi/v3/gov-report/?service=${CARD}&tab=report`, { waitUntil: 'domcontentloaded' });
    await p.locator('.rp-doc .gr-rdoc').waitFor({ timeout: 15000 });
    await sleep(800);
    const picks = await p.locator('.rp-picks input:checked').count();
    const avail = await p.locator('.rp-picks input').count();
    return `고를 수 있는 결과 ${avail} · 고름 ${picks} · 필지 전이 블록 ${await p.locator('.sp-tr').count()}개`;
  });
  await ctx.close();
}
for (const v of which === 'all' ? ['pc', 'mob'] : [which]) await run(v);
await browser.close();
save();
