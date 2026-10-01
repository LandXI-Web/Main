/* 구현 3차 · 기관 분기 공간 1단 — 화면 캡처(전 / 후).
   [기관 분기] 우리 공간(결과 설명서 · 내려받기 · 공간 안 알림) · [Land-XI] LX 관리자 대시보드 → 기관 → '기관 공간' 목록.
   로그인 = 로그인 폼 입력(kit/lint/forbidden.mjs frontDoor · 세션 주입 없음 · 비밀번호는 server/.env 에서 읽고 출력하지 않는다).
   바깥 주소 로그인은 10분 20번까지 — 한 사람(기관)마다 브라우저 하나로 PC · 휴대폰을 같이 찍는다.
   사용: node docs/superpowers/final/process/impl-3/space/shoot.mjs --tag before|after [--only nw,gj,admin] [--base https://app.land-xi.dev]
   결과: img/{tag}-{이름}-{1440|390}.png · 콘솔 JSON 줄(화면 상태 — 메뉴 · 제목 · 금지어 · 콘솔 오류) */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

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
const ONLY = new Set(arg('--only', 'nw,gj,admin').split(','));
const IMG = path.join(HERE, 'img'); fs.mkdirSync(IMG, { recursive: true });
const scanSrc = `(() => { const RULES = [${RULES.map(([k, re]) => `[${JSON.stringify(k)}, ${re}]`).join(',')}]; const check = (s) => RULES.filter(([, re]) => re.test(s)).map(([k]) => k); return (${scan.toString()})(document); })()`;
const out = (o) => console.log(JSON.stringify(o));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ channel: 'chromium' }).catch(() => chromium.launch());
/* 전(before) — 바깥 주소는 이미 지금 판을 내주므로, 이번에 고친 화면 파일 셋만 커밋된 판(HEAD)으로 바꿔 끼워 찍는다(브라우저 안에서만 · 서버 · 자료는 같다) */
const { execFileSync } = await import('node:child_process');
const BEFORE = ['landxi/v3/gov-select/menu.js', 'landxi/v3/ops-infra/js/app.js', 'landxi/v3/kit/auth-gate.js'];
async function asBefore(ctx) {
  if (TAG !== 'before') return;
  for (const f of BEFORE) {
    const body = execFileSync('git', ['-C', ROOT, 'show', 'HEAD:' + f]);
    await ctx.route((u) => u.pathname === '/' + f, (route) => route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body }));
  }
}

const state = () => {
  const vis = (el) => { if (!el) return false; const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const t = (el) => (el?.innerText || '').replace(/\s+/g, ' ').trim();
  return {
    menu: [...document.querySelectorAll('.k-rail .k-rail-i')].filter(vis).map((a) => t(a) + (a.getAttribute('aria-current') === 'true' ? ' ●' : '')),
    h: [...document.querySelectorAll('h1,h2,h3')].filter(vis).map(t).slice(0, 12),
  };
};

async function shot(page, name, m, { full = false } = {}) {
  const f = `${TAG}-${name}-${m ? 390 : 1440}.png`;
  await page.screenshot({ path: path.join(IMG, f), fullPage: full });
  const s = await page.evaluate(state).catch(() => null);
  const lint = await page.evaluate(scanSrc).catch(() => null);
  out({ shot: f, url: page.url().replace(/^https?:\/\/[^/]+/, ''), ...s, chars: lint?.chars, forbidden: lint?.hits?.slice(0, 6) });
}

/** 한 사람 로그인 → PC · 휴대폰 두 창(같은 세션 저장소를 넘겨 두 번 로그인하지 않는다) */
async function signed(base, login, opts) {
  const pc = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await asBefore(pc);
  const page = await pc.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
  page.on('console', (c) => { if (c.type() === 'error' && !/favicon|404|Failed to load resource/.test(c.text())) errs.push(c.text().slice(0, 200)); });
  await frontDoor(page, base, login, opts);
  await page.waitForTimeout(3000);
  const st = await pc.storageState();
  const mob = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, storageState: st });
  await asBefore(mob);
  const mpage = await mob.newPage();
  mpage.on('pageerror', (e) => errs.push('[390] ' + String(e).slice(0, 200)));
  return { page, mpage, errs, close: async () => { await pc.close(); await mob.close(); } };
}

/* 기관(남원시 · 광주전남) — 전: 내 서비스(왼쪽 메뉴에 '우리 공간' 없음) / 후: 우리 공간 */
async function gov(tenant, key) {
  const origin = PUBLIC ? `https://${tenant}.land-xi.dev` : BASE;
  const S = await signed(BASE, 'lxadmin@lx.or.kr', { tenant });
  for (const [p, m] of [[S.page, false], [S.mpage, true]]) {
    if (TAG === 'before') {
      await p.goto(origin + '/landxi/v3/gov-select/?list=1'); await p.waitForTimeout(5000);
      await shot(p, `${key}-select`, m);
      continue;
    }
    await p.goto(origin + '/landxi/v3/gov-space/'); await p.locator('.sp-guide, .sp-empty').first().waitFor({ timeout: 40000 }).catch(() => {});
    await p.waitForTimeout(2500);
    await shot(p, `${key}-space`, m);
    if (!m) {
      await p.evaluate(() => document.querySelector('.sp-scroll')?.scrollTo(0, 700)); await p.waitForTimeout(600);
      await shot(p, `${key}-space-low`, m);
      await p.evaluate(() => document.querySelector('.sp-scroll')?.scrollTo(0, 0)); await p.waitForTimeout(300);
      /* 다른 서비스 고르기(두 번째 서비스가 있으면) */
      const tabs = p.locator('.sp-svc [role=tab]');
      if (await tabs.count() > 1) {
        const sel = await tabs.evaluateAll((ts) => ts.findIndex((t) => t.getAttribute('aria-selected') === 'true'));
        const other = sel === 0 ? 1 : 0;
        await tabs.nth(other).click(); await p.waitForTimeout(2500); await shot(p, `${key}-space-2`, m); await tabs.nth(sel).click(); await p.waitForTimeout(2000);
      }
      /* 내려받기 — 동의 창(처음 한 번) */
      const dl = p.locator('.sp-down button[data-fmt]:not([disabled])').first();
      if (await dl.count()) { await dl.click(); await p.waitForTimeout(1200); if (await p.locator('.k-md').count()) await shot(p, `${key}-consent`, m); await p.keyboard.press('Escape'); }
      /* 부서 배정(기관 관리자) — 이 서비스를 볼 부서 사용자 고르기 */
      const asg = p.locator('.sp-gh button', { hasText: '부서 배정' });
      if (await asg.count()) { await p.waitForTimeout(600); await asg.click(); await p.waitForTimeout(1500); await shot(p, `${key}-assign`, m); await p.keyboard.press('Escape'); }
    } else {
      await p.evaluate(() => document.querySelector('.sp-scroll')?.scrollTo(0, 99999)); await p.waitForTimeout(800);
      await shot(p, `${key}-space-end`, m);
    }
  }
  out({ who: tenant, errors: S.errs });
  await S.close();
}

/* LX 관리자 — 기관 → (후) 기관 공간 탭 */
async function admin() {
  const S = await signed(ADMIN_BASE, 'lxadmin@lx.or.kr', 'admin');
  for (const [p, m] of [[S.page, false], [S.mpage, true]]) {
    await p.goto(ADMIN_BASE + '/landxi/v3/ops-infra/#/tenants'); await p.waitForTimeout(6000);
    if (TAG === 'before') { await shot(p, 'admin-tenants', m); continue; }
    await shot(p, 'admin-use', m);
    const tab = p.locator('.sp-adm-tabs [data-tab=space]');
    if (await tab.count()) { await tab.click(); await p.locator('.sp-adm-t tbody tr').first().waitFor({ timeout: 30000 }).catch(() => {}); await p.waitForTimeout(1500); }
    await shot(p, 'admin-spaces', m);
    if (!m) {
      const row = p.locator('.sp-adm-t tbody tr').first();
      if (await row.count()) { await row.click(); await p.waitForTimeout(2000); await shot(p, 'admin-space-drawer', m); }
    }
  }
  out({ who: 'admin', errors: S.errs });
  await S.close();
}

if (ONLY.has('nw')) await gov('namwon', 'nw');
if (ONLY.has('gj')) { await sleep(500); await gov('gwangju-jeonnam', 'gj'); }
if (ONLY.has('admin')) await admin();
await browser.close();
