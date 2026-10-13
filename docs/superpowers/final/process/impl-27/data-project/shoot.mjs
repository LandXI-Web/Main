// impl-27 데이터 · 프로젝트 — 전/후 그림(로그인 폼 · 세션 주입 0). 사용:
//   node shoot.mjs --tag before --app http://localhost:4174 --admin http://localhost:4174 --out <dir>
//   node shoot.mjs --tag after  --app https://app.land-xi.dev --admin https://admin.land-xi.dev --out <dir> [--video]
// 비밀번호는 server/.env DEV_PASSWORD(출력 0).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const ROOT = 'E:/Land-XI 플랫폼/01. 디자인';
const HW = 'C:/Users/User/AppData/Local/ms-playwright';
if (fs.existsSync(path.join(HW, 'chromium-1234'))) process.env.PLAYWRIGHT_BROWSERS_PATH = HW;
if (!process.env.DEV_PASSWORD) { const m = fs.readFileSync(path.join(ROOT, 'server/.env'), 'utf8').match(/^DEV_PASSWORD=(.*?)\s*$/m); if (m) process.env.DEV_PASSWORD = m[1]; }
process.env.LX_PW ||= process.env.DEV_PASSWORD;
const { chromium } = createRequire(path.join(ROOT, 'package.json'))('playwright');
const { frontDoor } = await import(pathToFileURL(path.join(ROOT, 'landxi/v3/kit/lint/forbidden.mjs')).href);

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const TAG = arg('--tag', 'after'), APP = arg('--app'), ADMIN = arg('--admin', APP), OUT = arg('--out');
const VIDEO = process.argv.includes('--video');
const ONLY = arg('--only', '');
const GATE = process.argv.includes('--gate');   // 이 PC 관문 — 화면의 API 기준 주소를 관문으로(lx_api_base)
const gateInit = async (c, base) => { if (GATE) await c.addInitScript((b) => { try { localStorage.setItem('lx_api_base', b); } catch {} }, base); };
fs.mkdirSync(OUT, { recursive: true });
const hm = () => { const d = new Date(); return String(d.getHours()).padStart(2, '0') + String(d.getMinutes()).padStart(2, '0'); };
const run = { tag: TAG, app: APP, admin: ADMIN, started: new Date().toISOString(), shots: [], measure: {}, errors: [], notes: [] };
const shot = async (page, name) => { const f = `${TAG}-${name}-1440-${hm()}.png`; await page.screenshot({ path: path.join(OUT, f) }); run.shots.push(f); console.log('shot', f); };
const watch = (page) => { page.on('pageerror', (e) => run.errors.push(`${page.url()} ${e}`)); page.on('console', (m) => { if (m.type() === 'error') run.errors.push(`${page.url()} ${m.text()}`); }); };
const settle = (page, ms = 1500) => page.waitForTimeout(ms);

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  /* ── LX 직원 ── */
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...(VIDEO ? { recordVideo: { dir: path.join(OUT, '_video'), size: { width: 1440, height: 900 } } } : {}) });
  await gateInit(ctx, APP);
  const page = await ctx.newPage(); watch(page);
  await frontDoor(page, APP, 'test@lx.or.kr', 'app');
  await page.waitForURL((u) => !/\/login\/?(\?|$)/.test(u.pathname), { timeout: 30000 });
  await settle(page, 2500);

  if (!ONLY || ONLY.includes('menu')) {
    /* 1 · 데이터하우스(전) / 옛 주소 → 프로젝트 목록(후) */
    await page.goto(APP + '/landxi/v3/lx-ingest/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.documentElement.dataset.ready === '1' || /lx-project/.test(location.pathname), null, { timeout: 40000 }).catch(() => null);
    await settle(page, 3000);
    run.measure.ingest_old_url = { landed: new URL(page.url()).pathname, menu: await page.locator('.k-rail a.k-rail-i > span:last-child').allTextContents() };
    await shot(page, 'datahouse-url');
  }

  if (!ONLY || ONLY.includes('new')) {
    /* 2 · 새 프로젝트 한 창 — 1440×900 · 1280×800 에서 열기 전/후 창 크기 */
    for (const [w, h] of [[1440, 900], [1280, 800]]) {
      await page.setViewportSize({ width: w, height: h });
      await page.goto(APP + '/landxi/v3/lx-project/?new=1', { waitUntil: 'domcontentloaded' });
      const box = page.locator('.lxp-new.lxp-new--one');
      await box.waitFor({ timeout: 40000 });
      await settle(page, 1200);
      const rect = () => box.evaluate((el) => { const r = el.getBoundingClientRect(); const f = [...el.querySelectorAll('.lxp-l')].map((x) => { const q = x.getBoundingClientRect(); return [x.textContent.trim(), Math.round(q.x), Math.round(q.y)]; }); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), labels: f, scroll: el.scrollHeight > el.clientHeight + 1 }; });
      const m = { open: await rect() };
      if (w === 1440) await shot(page, 'new-open');
      const tab = box.locator('.lxp-vt').nth(1);
      m.tab = (await tab.textContent()).trim();
      await tab.click();
      await box.locator('.lxp-pk-c').first().waitFor({ timeout: 40000 }).catch(() => null);
      await settle(page, 1500);
      m.pick = await rect();
      if (w === 1440) await shot(page, 'new-pick');
      /* 구성원 찾기 — 목록이 펼쳐져도 */
      const mi = box.locator('.lxp-mem input');
      await mi.click(); await settle(page, 1200);
      m.mem_all = (await box.locator('.lxp-mem-l li').allTextContents()).map((s) => s.trim());
      m.mem_open = await rect();
      if (w === 1440) await shot(page, 'new-member-list');
      for (const q of ['관리자', 'lxadmin', 'test@lx', 'LX 직원', '없는사람xyz']) {
        await mi.fill(q); await settle(page, 900);
        m['mem_q_' + q] = (await box.locator('.lxp-mem-l li').allTextContents()).map((s) => s.trim());
      }
      if (w === 1440) await shot(page, 'new-member-none');
      await mi.fill(''); await page.keyboard.press('Escape').catch(() => null);
      run.measure['new_' + w + 'x' + h] = m;
      console.log(w, h, JSON.stringify({ open: [m.open.w, m.open.h], pick: [m.pick.w, m.pick.h], mem: [m.mem_open.w, m.mem_open.h] }));
      await page.keyboard.press('Escape').catch(() => null);
    }
    await page.setViewportSize({ width: 1440, height: 900 });
  }

  if (!ONLY || ONLY.includes('train')) {
    /* 3 · 학습 화면 — 학습 데이터 블록 선택지(XI맵에서 고친 것) */
    const url = await page.evaluate(async () => {
      const { api } = await import('/landxi/shared/api-v1.js');
      const j = await api('/projects?scope=all');
      const p = (j.items || []).find((x) => /비닐하우스/.test(x.name)) || (j.items || [])[0];
      return p ? `/landxi/v3/lx-train/?project=${encodeURIComponent(p.id)}&stage=train` : null;
    });
    if (url) {
      await page.goto(APP + url, { waitUntil: 'domcontentloaded' });
      const node = page.locator('.tb-node[data-kind="data"]').first();
      await node.waitFor({ timeout: 40000 }).catch(() => null);
      await settle(page, 1500);
      await node.click().catch(() => null);
      await settle(page, 1000);
      run.measure.train_data = (await page.locator('.tb-side').innerText().catch(() => '')).split('\n').filter(Boolean);
      await shot(page, 'train-data');
    }
  }
  await ctx.close();
  if (VIDEO) { const v = fs.readdirSync(path.join(OUT, '_video')); run.notes.push('video ' + v.join(',')); }

  /* ── LX 관리자 ── */
  if (!ONLY || ONLY.includes('admin')) {
    const actx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await gateInit(actx, ADMIN);
    const ap = await actx.newPage(); watch(ap);
    await frontDoor(ap, ADMIN, 'lxadmin@lx.or.kr', 'admin');
    await ap.waitForURL((u) => !/\/login\/?(\?|$)/.test(u.pathname), { timeout: 30000 });
    await settle(ap, 2500);
    for (const [hash, name, sel] of [['#/deploys/templates', 'admin-template', '.rt-blks'], ['#/deploys/retrain', 'admin-retrain', '.rt-when']]) {
      await ap.goto(ADMIN + '/landxi/v3/ops-infra/' + hash, { waitUntil: 'domcontentloaded' });
      await ap.locator(sel).first().waitFor({ timeout: 40000 }).catch(() => null);
      await settle(ap, 1500);
      run.measure[name] = (await ap.locator('.rt-col').first().innerText().catch(() => '')).split('\n').filter(Boolean).slice(0, 40);
      await shot(ap, name);
    }
    await actx.close();
  }
} finally {
  await browser.close();
  run.finished = new Date().toISOString();
  fs.writeFileSync(path.join(OUT, `run-${TAG}.json`), JSON.stringify(run, null, 2));
  console.log('errors', run.errors.length);
}
