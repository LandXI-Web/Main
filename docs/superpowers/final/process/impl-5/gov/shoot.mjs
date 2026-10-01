/* 구현 5차 · 기관 화면 완성 디자인(기관-1 공통 틀 · 기관-2 메인 · 기관-3 내 서비스 · 기관-4 서비스 대시보드 · 기관-5 분석 요청 · 기관-8 요청함) — 화면 캡처(전 / 후).
   로그인 = 로그인 폼 입력(kit/lint/forbidden.mjs frontDoor · 세션 주입 없음 · 비밀번호는 server/.env 에서 읽고 출력하지 않는다).
   바깥 주소 로그인은 10분 20번까지 — 한 사람마다 브라우저 하나로 PC · 휴대폰을 같이 찍는다.
   '전'(before): 바깥 주소는 이미 이번 판을 내주므로, 이번에 고친 화면 파일만 커밋된 판(HEAD)으로 바꿔 끼워 찍는다(브라우저 안에서만 · 서버 · 자료는 같다).
     메인(로그인 전)도 같은 방법(기관 메인 화면 파일을 지난 판으로).
   사용: node docs/superpowers/final/process/impl-5/gov/shoot.mjs --tag before|after [--only main,nw,gj,staff,admin,dept] [--dept 'login|tenant'] [--base https://app.land-xi.dev] [--ref <커밋>]
   결과: img/{tag}-{이름}-{1440|390}[-full].png · 콘솔 JSON 줄(메뉴 · 제목 · 첫 화면 글자 수 · 금지어 · 가로 넘침 · 콘솔 오류) */
import path from 'node:path';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
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
const ONLY = new Set(arg('--only', 'main,nw,gj,staff,admin').split(','));
const REF = arg('--ref', 'HEAD');              // '전' = 이 판의 화면 파일(고친 것이 이미 커밋됐으면 그 앞 커밋을 준다)
const DEPT = arg('--dept', '');                 // 부서 사용자 캡처(after) — 'login|tenant' (시험 계정은 부르는 쪽이 만들고 지운다)
const IMG = path.join(HERE, 'img'); fs.mkdirSync(IMG, { recursive: true });
const scanSrc = `(() => { const RULES = [${RULES.map(([k, re]) => `[${JSON.stringify(k)}, ${re}]`).join(',')}]; const check = (s) => RULES.filter(([, re]) => re.test(s)).map(([k]) => k); return (${scan.toString()})(document); })()`;
const out = (o) => console.log(JSON.stringify(o));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const orgOrigin = (t) => (PUBLIC ? `https://${t}.land-xi.dev` : BASE);
const go = (p, url) => p.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 }).catch(() => {});

/* 이번에 고친 화면 파일(전 = HEAD 판으로 바꿔 끼움) */
const CHANGED = ['gov-select/app.js', 'gov-select/menu.js', 'gov-select/gov-select.css', 'gov-request/app.js', 'gov-request/index.html', 'gov-request/gov-request.css',
  'gov-space/app.js', 'gov-fusion/app.js', 'gov-report/app.js', 'kit/shell.js', 'kit/shell.css', 'kit/service-card.js', 'kit/service-card.css', 'kit/notify.js',
  'lx-inbox/app.js', 'lx-inbox/inbox.css', 'lx-console/app.js', 'ops-core/js/data.js', 'ops-infra/js/tenants.js', 'login/account.js',
  'gov-home/app.js', 'gov-home/gov-home.css', 'gov-select/brand.css'].map((f) => 'landxi/v3/' + f);
const TYPE = { js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8', html: 'text/html; charset=utf-8' };
async function asBefore(ctx) {
  if (TAG !== 'before') return;
  for (const f of CHANGED) {
    const body = execFileSync('git', ['-C', ROOT, 'show', REF + ':' + f]);
    const ct = TYPE[f.split('.').pop()];
    await ctx.route((u) => u.pathname === '/' + f || (f.endsWith('/index.html') && u.pathname === '/' + f.replace(/index\.html$/, '')),
      (route) => route.fulfill({ status: 200, contentType: ct, body }));
  }
}

const browser0 = await chromium.launch({ channel: 'chromium' }).catch(() => chromium.launch());
/* 바깥 주소는 새 연결의 첫 응답이 20초쯤 걸린다(10-01 실측) — 이동 · 기다림 한도를 넉넉히 */
const browser = { newContext: async (o) => { const c = await browser0.newContext(o); c.setDefaultNavigationTimeout(120000); c.setDefaultTimeout(90000); await asBefore(c); return c; }, close: () => browser0.close() };

const state = () => {
  const vis = (el) => { if (!el) return false; const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const t = (el) => (el?.innerText || '').replace(/\s+/g, ' ').trim();
  return {
    menu: [...document.querySelectorAll('.k-rail .k-rail-i')].filter(vis).map((a) => t(a) + (a.getAttribute('aria-current') === 'true' ? ' ●' : '')),
    h: [...document.querySelectorAll('h1,h2,h3')].filter(vis).map(t).slice(0, 14),
    overflowX: document.documentElement.scrollWidth - innerWidth,
  };
};

async function shot(page, name, m, { full = false, fullPage = full } = {}) {
  await page.evaluate(() => document.querySelectorAll('.t-enter').forEach((e) => e.classList.add('is-in'))).catch(() => {});   // 내려가야 보이는 글(등장)을 미리
  const f = `${TAG}-${name}-${m ? 390 : 1440}${full ? '-full' : ''}.png`;
  await page.screenshot({ path: path.join(IMG, f), fullPage });
  const s = await page.evaluate(state).catch(() => null);
  const lint = await page.evaluate(scanSrc).catch(() => null);
  out({ shot: f, url: page.url().replace(/^https?:\/\/[^/]+/, ''), ...s, chars: lint?.chars, forbidden: lint?.hits?.slice(0, 6) });
}
/** 스크롤 칸이 따로 있는 화면(.gs-scroll 등)도 끝까지 — 창 높이를 내용만큼 늘려 한 장에(셸 배치는 그대로) → 원래 높이로 */
async function shotLong(page, name, m) {
  const vp = page.viewportSize();
  const hgt = await page.evaluate(() => {
    const sc = document.querySelector('.gs-scroll, .sp-scroll'); const mast = document.querySelector('.k-mast')?.offsetHeight || 0;
    const tabs = innerWidth <= 960 ? (document.querySelector('.k-rail')?.offsetHeight || 0) : 0;
    return sc ? sc.scrollHeight + mast + tabs : document.documentElement.scrollHeight;
  }).catch(() => vp.height);
  if (hgt > vp.height) { await page.setViewportSize({ width: vp.width, height: Math.min(9000, hgt) }); await page.waitForTimeout(1500); }
  await shot(page, name, m, { full: true, fullPage: !(await page.$('.gs-scroll, .sp-scroll')) });
  await page.setViewportSize(vp); await page.waitForTimeout(400);
}

async function errs(page, list, tag) {
  page.on('pageerror', (e) => list.push(`${tag}${String(e).slice(0, 200)}`));
  page.on('console', (c) => { if (c.type() === 'error' && !/favicon|404|Failed to load resource/.test(c.text())) list.push(tag + c.text().slice(0, 200)); });
}

/** 한 사람 로그인 → PC · 휴대폰 두 창(같은 세션 저장소를 넘겨 두 번 로그인하지 않는다) */
async function signed(base, login, opts) {
  const pc = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await pc.newPage();
  const E = [];
  await errs(page, E, '');
  if (opts?.tenant) { await go(page, orgOrigin(opts.tenant) + '/'); await page.locator('.gh-login input[name=login]').waitFor({ timeout: 90000 }).catch(() => {}); }   // 바깥 주소 첫 연결 데우기
  await frontDoor(page, base, login, opts);
  await page.waitForTimeout(2500);
  const st = await pc.storageState();
  const mob = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, storageState: st });
  const mpage = await mob.newPage();
  await errs(mpage, E, '[390] ');
  return { page, mpage, errs: E, close: async () => { await pc.close(); await mob.close(); } };
}
const settle = async (p, sel, ms = 2500) => { if (sel) await p.locator(sel).first().waitFor({ timeout: 60000 }).catch(() => {}); await p.waitForTimeout(ms); };

/* ── 기관 메인(로그인 전) ── */
async function mainPage(tenant, key) {
  const pc = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const mob = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const E = [];
  for (const [ctx, m] of [[pc, false], [mob, true]]) {
    const p = await ctx.newPage(); await errs(p, E, m ? '[390] ' : '');
    await go(p, orgOrigin(tenant) + (PUBLIC ? '/' : `/landxi/v3/gov-home/?org=${tenant}`)); await settle(p, 'body[data-state=ready]', 4000);
    await shot(p, `${key}-main`, m);
    await shot(p, `${key}-main`, m, { full: true });
  }
  out({ who: `${tenant} 메인`, errors: E });
  await pc.close(); await mob.close();
}

/* ── 기관(남원시 · 광주전남) — 내 서비스 · 서비스 대시보드 · 분석 요청 · 행정정보와 비교 · 필지 목록 화면의 메뉴 ── */
async function gov(tenant, key, svc) {
  const origin = orgOrigin(tenant);
  const S = await signed(BASE, 'lxadmin@lx.or.kr', { tenant });
  for (const [p, m] of [[S.page, false], [S.mpage, true]]) {
    await go(p, origin + '/landxi/v3/gov-select/?list=1'); await settle(p, 'body[data-ready="1"]', 4000);
    await shot(p, `${key}-select`, m);
    if (m) await shotLong(p, `${key}-select`, m);
    await go(p, origin + '/landxi/v3/gov-select/?service=' + svc); await settle(p, 'body[data-ready="1"]', 5000);
    await shot(p, `${key}-dash`, m);
    await shotLong(p, `${key}-dash`, m);
    if (TAG === 'after') {
      const more = p.locator('.gd-about .gd-more').first();
      if (await more.count()) { await more.click(); await p.waitForTimeout(2500); await shot(p, `${key}-dash-about`, m); await p.keyboard.press('Escape'); await p.waitForTimeout(400); }
    }
    await go(p, origin + '/landxi/v3/gov-request/'); await settle(p, 'body[data-ready="1"]', 6000);
    await shot(p, `${key}-request`, m);
    if (m) await shotLong(p, `${key}-request`, m);
    if (!m && TAG === 'after') {
      const sr = p.locator('.gq-sr button').last();
      if (await sr.count()) { await sr.click(); await p.waitForTimeout(6000); await shot(p, `${key}-request-shared`, m); }
    }
    if (!m) {
      await go(p, origin + '/landxi/v3/gov-fusion/?service=' + svc); await settle(p, '.k-mast', 9000);
      await shot(p, `${key}-fusion`, m);
      await go(p, origin + '/landxi/v3/gov-report/?service=' + svc + '&tab=sus'); await settle(p, '.k-mast', 6000);
      await shot(p, `${key}-report`, m);
    }
  }
  out({ who: tenant, errors: S.errs });
  await S.close();
}

/* ── 부서 사용자(after) — 내 서비스에 자기 서비스만 ── */
async function dept() {
  const [login, tenant] = DEPT.split('|');
  const S = await signed(BASE, login, { tenant });
  for (const [p, m] of [[S.page, false], [S.mpage, true]]) {
    await go(p, orgOrigin(tenant) + '/landxi/v3/gov-select/?list=1'); await settle(p, 'body[data-ready="1"]', 4000);
    await shot(p, 'dept-select', m);
  }
  out({ who: 'dept', errors: S.errs });
  await S.close();
}

/* ── LX 직원 요청함 · 홈 — '분석 요청' 이름 ── */
async function staff() {
  const S = await signed(BASE, 'test@lx.or.kr', 'app');
  for (const [p, m] of [[S.page, false], [S.mpage, true]]) {
    await go(p, BASE + '/landxi/v3/lx-inbox/'); await settle(p, '.ib-cells .ib-cell', 5000);
    await shot(p, 'staff-inbox', m);
    if (!m) {
      const cell = p.locator('.ib-cell[data-k="request"]');
      if (await cell.count()) { await cell.click(); await p.waitForTimeout(2000); await shot(p, 'staff-inbox-requests', m); await p.keyboard.press('Escape'); }
      await go(p, BASE + '/landxi/v3/lx-console/'); await settle(p, '.k-rail', 6000); await shot(p, 'staff-home', m);
    }
  }
  out({ who: 'staff', errors: S.errs });
  await S.close();
}

/* ── LX 관리자 — 결재함(종류 이름 '분석 요청') · 기관에서 온 요청(보낸 사람 이름 · 부서 · 연락처) ── */
async function admin() {
  const S = await signed(ADMIN_BASE, 'lxadmin@lx.or.kr', 'admin');
  for (const [p, m] of [[S.page, false], [S.mpage, true]]) {
    await go(p, ADMIN_BASE + '/landxi/v3/ops-core/#/approvals'); await settle(p, '.oc-tbl tbody tr, .k-rail', 7000);
    await shot(p, 'admin-approvals', m);
    await go(p, ADMIN_BASE + '/landxi/v3/lx-inbox/'); await settle(p, '.ib-row, .ib-list .t-empty', 6000);
    if (!m) { const row = p.locator('.ib-row').first(); if (await row.count()) { await row.click(); await p.waitForTimeout(4000); } }
    await shot(p, 'admin-inbox', m);
  }
  out({ who: 'admin', errors: S.errs });
  await S.close();
}

if (ONLY.has('main')) { await mainPage('namwon', 'nw'); await mainPage('gwangju-jeonnam', 'gj'); }
if (ONLY.has('nw')) await gov('namwon', 'nw', 'card-farm');
if (ONLY.has('gj')) { await sleep(500); await gov('gwangju-jeonnam', 'gj', 'card-marine'); }
if (ONLY.has('dept') && DEPT) await dept();
if (ONLY.has('staff')) await staff();
if (ONLY.has('admin')) await admin();
await browser.close();
