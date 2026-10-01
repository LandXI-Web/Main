/* 구현 4차 · 개선 고리 — 화면 캡처(전 / 후).
   [Land-XI] LX 관리자 대시보드 → 배포 → '개선 후보' 탭 · LX 직원 요청함 → '개선 후보' 칸(담당 서비스 · 기관 것만).
   로그인 = 로그인 폼 입력(kit/lint/forbidden.mjs frontDoor · 세션 주입 없음 · 비밀번호는 server/.env 에서 읽고 출력하지 않는다).
   바깥 주소 로그인은 10분 20번까지 — 한 사람마다 브라우저 하나로 PC · 휴대폰을 같이 찍는다.
   사용: node docs/superpowers/final/process/impl-4/improve/shoot.mjs --tag before|after [--only admin,staff] [--base https://app.land-xi.dev]
   결과: img/{tag}-{이름}-{1440|390}.png · 콘솔 JSON 줄(제목 · 금지어 · 콘솔 오류) */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../../../..');
const { frontDoor, RULES, scan } = await import(pathToFileURL(path.join(ROOT, 'landxi/v3/kit/lint/forbidden.mjs')).href);
const HW = 'C:/Users/User/AppData/Local/ms-playwright';
if (fs.existsSync(path.join(HW, 'chromium-1234'))) process.env.PLAYWRIGHT_BROWSERS_PATH = HW;
const { chromium } = createRequire(path.join(ROOT, 'package.json'))('playwright');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const TAG = arg('--tag', 'after');
const BASE = arg('--base', 'https://app.land-xi.dev');
const PUBLIC = BASE.includes('land-xi.dev');
const ADMIN_BASE = PUBLIC ? 'https://admin.land-xi.dev' : BASE;
const ONLY = new Set(arg('--only', 'admin,staff').split(','));
const IMG = path.join(HERE, 'img'); fs.mkdirSync(IMG, { recursive: true });
const scanSrc = `(() => { const RULES = [${RULES.map(([k, re]) => `[${JSON.stringify(k)}, ${re}]`).join(',')}]; const check = (s) => RULES.filter(([, re]) => re.test(s)).map(([k]) => k); return (${scan.toString()})(document); })()`;
const out = (o) => console.log(JSON.stringify(o));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* 전(before) — 이번에 고친 화면 파일 둘을 커밋된 판(HEAD)으로 바꿔 끼워 찍는다(브라우저 안에서만 · 서버 · 자료는 같다) */
const BEFORE = ['landxi/v3/ops-infra/js/app.js', 'landxi/v3/lx-inbox/app.js'];
async function asBefore(ctx) {
  if (TAG !== 'before') return;
  for (const f of BEFORE) {
    const body = execFileSync('git', ['-C', ROOT, 'show', 'HEAD:' + f]);
    await ctx.route((u) => u.pathname === '/' + f, (route) => route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body }));
  }
}

const browser = await chromium.launch({ channel: 'chromium' }).catch(() => chromium.launch());
async function shot(page, name, m, { full = false } = {}) {
  const f = `${TAG}-${name}-${m ? 390 : 1440}.png`;
  await page.screenshot({ path: path.join(IMG, f), fullPage: full });
  const lint = await page.evaluate(scanSrc).catch(() => null);
  const h = await page.evaluate(() => [...document.querySelectorAll('h1,h2,.im-tabs button,.ib-cell')].map((x) => x.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 14)).catch(() => null);
  out({ shot: f, url: page.url().replace(/^https?:\/\/[^/]+/, ''), h, chars: lint?.chars, forbidden: lint?.hits?.slice(0, 6) });
}
async function signed(base, login) {
  const pc = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await asBefore(pc);
  const page = await pc.newPage();
  page.setDefaultNavigationTimeout(150000); page.setDefaultTimeout(120000);   // 바깥 주소가 느릴 때(파일마다 수 초)
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
  page.on('console', (c) => { if (c.type() === 'error' && !/favicon|404|Failed to load resource/.test(c.text())) errs.push(c.text().slice(0, 200)); });
  await frontDoor(page, base, login);
  await page.waitForURL((u) => !/\/login\/?$/.test(u.pathname), { timeout: 120000 }).catch(() => null);   // 바깥 주소가 느릴 때 로그인 끝까지
  await page.waitForTimeout(2500);
  const st = await pc.storageState();
  const mob = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, storageState: st });
  await asBefore(mob);
  const mpage = await mob.newPage();
  mpage.setDefaultNavigationTimeout(150000); mpage.setDefaultTimeout(120000);
  mpage.on('pageerror', (e) => errs.push('[390] ' + String(e).slice(0, 200)));
  return { page, mpage, errs, close: async () => { await pc.close(); await mob.close(); } };
}

/* LX 관리자 — 배포 화면(전: 배포 표만 / 후: 배포 · 개선 후보 탭) */
if (ONLY.has('admin')) {
  const S = await signed(ADMIN_BASE, 'lxadmin@lx.or.kr');
  for (const [p, m] of [[S.page, false], [S.mpage, true]]) {
    await p.goto(ADMIN_BASE + '/landxi/v3/ops-infra/#/deploys', { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#pane-deploys:not([hidden])', { timeout: 180000 }).catch(() => null);
    await sleep(2500);
    await shot(p, 'admin-deploys', m);
    if (TAG === 'before') continue;
    await p.goto(ADMIN_BASE + '/landxi/v3/ops-infra/#/deploys/improve', { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('.im-t, .im-box .t-empty', { timeout: 180000 }).catch(() => null);
    await sleep(1500);
    await shot(p, 'admin-candidates', m);
    if (m) { await shot(p, 'admin-candidates-full', m, { full: true }); continue; }
    await shot(p, 'admin-candidates-full', m, { full: true });
    // 보류 · 이미 됨 창(열어 보기만 — 저장하지 않고 닫는다)
    const row = p.locator('.im-t tbody tr[data-state="new"]').first();
    if (await row.count()) {
      await row.locator('button[data-a="hold"]').click();
      await p.waitForSelector('.k-md .im-form', { timeout: 8000 }).catch(() => null); await sleep(500);
      await shot(p, 'admin-hold', m);
      await p.keyboard.press('Escape'); await sleep(500);
      await row.locator('button[data-a="already"]').click();
      await p.waitForSelector('.k-md .im-form', { timeout: 8000 }).catch(() => null); await sleep(500);
      await shot(p, 'admin-already', m);
      await p.keyboard.press('Escape'); await sleep(500);
    }
  }
  out({ who: 'admin', errors: S.errs });
  await S.close();
}

/* LX 직원 — 요청함(전: 숫자 셋 / 후: '개선 후보' 칸 → 서랍) */
if (ONLY.has('staff')) {
  const S = await signed(BASE, 'test@lx.or.kr');
  for (const [p, m] of [[S.page, false], [S.mpage, true]]) {
    await p.goto(BASE + '/landxi/v3/lx-inbox/', { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('.ib-cells .ib-cell', { timeout: 180000 }).catch(() => null);
    await sleep(2500);
    await shot(p, 'staff-inbox', m);
    if (TAG === 'before') continue;
    const c = p.locator('.ib-cell[data-k="improve"]');
    if (await c.count()) {
      await c.click();
      await p.waitForSelector('.k-drawer .im-t, .k-drawer .t-empty', { timeout: 180000 }).catch(() => null);
      await sleep(1500);
      await shot(p, 'staff-candidates', m);
    }
  }
  out({ who: 'staff', errors: S.errs });
  await S.close();
}
await browser.close();
