/* 구현 5차 2묶음 · 기관 화면(확인 대장 18차 촬영-1 ⓑ · N-1 ⓐ · 기관-9 ⓑ · 기관-7 ⓑ · 기관-6 ⓐ 마무리) — 화면 캡처(전 / 후).
   로그인 = 로그인 폼 입력(kit/lint/forbidden.mjs frontDoor · 세션 주입 없음 · 비밀번호는 server/.env 에서 읽고 출력하지 않는다).
   '전'(before): 이번에 고친 화면 파일만 커밋된 판(--ref · 기본 HEAD)으로 바꿔 끼워 찍는다(브라우저 안에서만 · 서버 · 자료는 같다).
   사용: node docs/superpowers/final/process/impl-5/gov/shoot2.mjs --tag before|after [--only nw2,admin2] [--pnu <필지>] [--viewer <부서 사용자 이름>] [--ref <커밋>]
   결과: img/{tag}-2-{이름}-{1440|390}[-full].png · 콘솔 JSON 줄(메뉴 · 제목 · 첫 화면 글자 수 · 금지어 · 가로 넘침 · 콘솔 오류) */
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
const ONLY = new Set(arg('--only', 'nw2,admin2').split(','));
const REF = arg('--ref', 'HEAD');              // '전' = 이 판의 화면 파일(고친 것이 이미 커밋됐으면 그 앞 커밋을 준다)
const DEPT = arg('--dept', '');                 // 부서 사용자 캡처(after) — 'login|tenant' (시험 계정은 부르는 쪽이 만들고 지운다)
const IMG = path.join(HERE, 'img'); fs.mkdirSync(IMG, { recursive: true });
const scanSrc = `(() => { const RULES = [${RULES.map(([k, re]) => `[${JSON.stringify(k)}, ${re}]`).join(',')}]; const check = (s) => RULES.filter(([, re]) => re.test(s)).map(([k]) => k); return (${scan.toString()})(document); })()`;
const out = (o) => console.log(JSON.stringify(o));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const orgOrigin = (t) => (PUBLIC ? `https://${t}.land-xi.dev` : BASE);
const go = (p, url) => p.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 }).catch(() => {});

/* 이번에 고친 화면 파일(전 = HEAD 판으로 바꿔 끼움) */
const CHANGED = ['gov-select/app.js', 'gov-select/menu.js', 'gov-select/dash.js', 'gov-select/gov-select.css', 'gov-request/app.js', 'gov-request/index.html',
  'gov-request/gov-request.css', 'gov-space/app.js', 'gov-fusion/app.js', 'kit/notify.js', 'kit/notify.css', 'lx-inbox/app.js', 'lx-inbox/inbox.css',
  'xi-clean/app.js', 'ops-accounts/view.js', 'ops-accounts/accounts.css'].map((f) => 'landxi/v3/' + f);
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
  const f = `${TAG}-2-${name}-${m ? 390 : 1440}${full ? '-full' : ''}.png`;
  try { await page.screenshot({ path: path.join(IMG, f), fullPage, timeout: 60000 }); }
  catch (e) {   // 글꼴 기다림 등으로 멈추면 한 번 더 · 그래도 안 되면 그 장만 건너뛴다(나머지 흐름은 그대로)
    await page.waitForTimeout(3000);
    try { await page.screenshot({ path: path.join(IMG, f), fullPage, timeout: 60000, animations: 'disabled' }); }
    catch (e2) { out({ shot: f, skipped: String(e2.message || e2).split(String.fromCharCode(10))[0].slice(0, 120) }); return; }
  }
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

/* ── 2묶음(18차) — 남원시 기관 관리자: 내 서비스 · 종 · 대시보드 탭 다섯 · 결과 지도 카드 · 필지 메모 · 요청하기 탭 셋 · 기관 정보 · 계정(볼 수 있는 서비스) ── */
const PNU = arg('--pnu', '');              // 필지 카드를 열 필지(현장 확인 필요 한 필지 — 부르는 쪽이 서버에서 고른다)
const VIEWER = arg('--viewer', '');        // 계정 서랍을 열 부서 사용자 이름(시험 계정 — 부르는 쪽이 만들고 지운다)
async function nw2() {
  const origin = orgOrigin('namwon');
  const S = await signed(BASE, 'lxadmin@lx.or.kr', { tenant: 'namwon' });
  for (const [p, m] of [[S.page, false], [S.mpage, true]]) {
    await go(p, origin + '/landxi/v3/gov-select/?list=1'); await settle(p, 'body[data-ready="1"]', 5000);
    await shot(p, 'list', m);
    if (!m) { const b = p.locator('.k-bell').first(); if (await b.count()) { await b.click(); await p.waitForTimeout(2500); await shot(p, 'list-bell', m); await p.keyboard.press('Escape'); await b.click().catch(() => {}); await p.waitForTimeout(400); } }
    await go(p, origin + '/landxi/v3/gov-select/?service=card-farm'); await settle(p, 'body[data-ready="1"]', 6000);
    await shot(p, 'dash', m);
    if (TAG === 'after') {
      await go(p, origin + '/landxi/v3/gov-select/?service=card-farm&tab=history'); await settle(p, '.gy-row, .gs-none', 5000);
      await shotLong(p, 'dash-history', m);
      await go(p, origin + '/landxi/v3/gov-select/?service=card-farm&tab=stats'); await settle(p, '.gs-num, .gs-none', 5000);
      await shotLong(p, 'dash-stats', m);
    }
    await go(p, origin + '/landxi/v3/xi-clean/?region=52190&service=card-farm'); await settle(p, '.gx-card, .xc-hud, .k-mast', 14000);
    await shot(p, 'map', m);
    if (PNU && !m) {
      await go(p, origin + `/landxi/v3/xi-clean/?region=52190&service=card-farm&pnu=${PNU}`); await settle(p, '.k-drawer', 14000);
      await shot(p, 'map-parcel', m);
    }
    await go(p, origin + '/landxi/v3/gov-request/'); await settle(p, 'body[data-ready="1"]', 6000);
    await shot(p, 'request', m);
    if (TAG === 'after') {
      await go(p, origin + '/landxi/v3/gov-request/?tab=shoot'); await settle(p, 'body[data-ready="1"]', 6000);
      const chip = p.locator('.sq-emd .gy-chip', { hasText: '덕과' }).first();
      const any = (await chip.count()) ? chip : p.locator('.sq-emd .gy-chip').first();
      if (await any.count()) { await any.click(); await p.waitForTimeout(6000); }
      await shotLong(p, 'request-shoot', m);
      await go(p, origin + '/landxi/v3/gov-request/?tab=sent'); await settle(p, '#sent-all .sq-sent-r, #sent-all .gs-none', 5000);
      await shot(p, 'request-sent', m);
      if (!m) {
        const r = p.locator('#sent-all .sq-sent-r[data-k="shoot"]').first();
        if (await r.count()) { await r.click(); await p.waitForTimeout(2500); await shot(p, 'request-sent-shoot', m); await p.keyboard.press('Escape'); }
        await go(p, origin + '/landxi/v3/gov-request/?service=dp-nw-farm-25&imagery=ap25-namwon-2023'); await settle(p, 'body[data-ready="1"]', 8000);
        await shot(p, 'request-from-map', m);
        await go(p, origin + '/landxi/v3/gov-space/?card=card-farm'); await p.waitForTimeout(6000);
        out({ redirect: 'gov-space', to: p.url().replace(/^https?:\/\/[^/]+/, '') });
      }
    }
    await go(p, origin + '/landxi/v3/gov-select/?view=org'); await settle(p, 'body[data-ready="1"]', 4000);
    if (m) await shotLong(p, 'org', m); else await shot(p, 'org', m);
    if (!m && VIEWER) {
      await go(p, origin + '/landxi/v3/gov-accounts/#users'); await settle(p, 'tbody tr', 5000);
      const row = p.locator('tbody tr', { hasText: VIEWER }).first();
      if (await row.count()) { await row.click(); await p.waitForTimeout(3000); await shot(p, 'accounts-viewer', m); }
    }
  }
  out({ who: 'namwon 2묶음', errors: S.errs });
  await S.close();
}

/* ── LX 관리자 — 기관에서 온 요청: 못 읽는 파일 확인 요청(파일 모양) · 촬영 요청(받기 · 답하기) ── */
async function admin2() {
  const S = await signed(ADMIN_BASE, 'lxadmin@lx.or.kr', 'admin');
  for (const [p, m] of [[S.page, false], [S.mpage, true]]) {
    await go(p, ADMIN_BASE + '/landxi/v3/lx-inbox/'); await settle(p, '.ib-row, .ib-list .t-empty', 6000);
    const row = p.locator('.ib-row', { hasText: '못 읽는 파일' }).first();
    if (await row.count()) { await row.click(); await p.waitForTimeout(4000); }
    await shot(p, 'admin-inbox-file', m);
    if (TAG === 'after') {
      await go(p, ADMIN_BASE + '/landxi/v3/lx-inbox/#shoots'); await settle(p, '.ib-sh-r, .ib-sh .t-empty', 6000);
      await shot(p, 'admin-shoots', m);
      const r = p.locator('.ib-sh-r').first();
      if (await r.count()) { await r.click(); await p.waitForTimeout(5000); await shot(p, 'admin-shoot-one', m); }
    }
  }
  out({ who: 'admin 2묶음', errors: S.errs });
  await S.close();
}

if (ONLY.has('nw2')) await nw2();
if (ONLY.has('admin2')) await admin2();
await browser.close();
