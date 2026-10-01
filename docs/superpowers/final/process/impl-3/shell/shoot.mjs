/* 구현 3차 · LX 직원 메뉴 1안 · 대시보드 1안 · 프로젝트 안 6단계 — 화면 캡처(전 / 후).
   로그인 = 로그인 폼 입력(kit/lint/forbidden.mjs frontDoor · 세션 주입 없음 · 비밀번호는 server/.env 에서 읽고 출력하지 않는다).
   사용: node docs/superpowers/final/process/impl-3/shell/shoot.mjs --tag before|after [--base https://app.land-xi.dev] [--only dash,projects,…]
   결과: img/{tag}-{이름}-{1440|390}.png · 콘솔 JSON 줄(화면 상태 — 메뉴 · 머리 · 금지어 · 콘솔 오류) */
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
const ADMIN_BASE = arg('--admin', BASE.includes('land-xi.dev') ? 'https://admin.land-xi.dev' : BASE);
const ONLY = new Set(arg('--only', 'login,dash,projects,project,step,train,review,ops,data,inbox,menu,admin').split(','));
const IMG = path.join(HERE, 'img'); fs.mkdirSync(IMG, { recursive: true });
const scanSrc = `(() => { const RULES = [${RULES.map(([k, re]) => `[${JSON.stringify(k)}, ${re}]`).join(',')}]; const check = (s) => RULES.filter(([, re]) => re.test(s)).map(([k]) => k); return (${scan.toString()})(document); })()`;
const out = (o) => console.log(JSON.stringify(o));

const browser = await chromium.launch({ channel: 'chromium', args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] }).catch(() => chromium.launch());
const view = (m) => (m ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 } });

/* 화면 상태 — 왼쪽 메뉴 · 머리 칸 · 단계 막대 · 금지어 */
const state = () => {
  const vis = (el) => { if (!el) return false; const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const t = (el) => (el?.innerText || '').replace(/\s+/g, ' ').trim();
  return {
    menu: [...document.querySelectorAll('.k-rail .k-rail-i')].filter(vis).map((a) => t(a) + (a.getAttribute('aria-current') === 'true' ? ' ●' : '')),
    mast: [...document.querySelectorAll('.k-mast > *')].filter(vis).map(t).filter(Boolean),
    bar: t(document.querySelector('.k-sub')) || null,
    h: [...document.querySelectorAll('h1,h2')].filter(vis).map(t).slice(0, 8),
  };
};

async function shot(page, name, m) {
  const f = `${TAG}-${name}-${m ? 390 : 1440}.png`;
  await page.screenshot({ path: path.join(IMG, f) });
  const s = await page.evaluate(state).catch(() => null);
  const lint = await page.evaluate(scanSrc).catch(() => null);
  out({ shot: f, url: page.url().replace(/^https?:\/\/[^/]+/, ''), ...s, chars: lint?.chars, forbidden: lint?.hits?.slice(0, 6) });
}

async function staff(m) {
  const ctx = await browser.newContext(view(m));
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
  page.on('console', (c) => { if (c.type() === 'error' && !/favicon|404|Failed to load resource/.test(c.text())) errs.push(c.text().slice(0, 200)); });
  await frontDoor(page, BASE, 'test@lx.or.kr', 'app');
  await page.waitForURL((u) => u.pathname.startsWith('/landxi/v3/lx-console/'), { timeout: 30000 });
  await page.waitForTimeout(5000);
  if (ONLY.has('dash')) {
    await page.waitForFunction(() => { const im = [...document.querySelectorAll('.ld-th img')]; return im.length && im.every((i) => i.complete && i.naturalWidth); }, null, { timeout: 20000 }).catch(() => {});
    await shot(page, 'dash', m);
  }
  if (ONLY.has('menu') && m) {
    const more = page.locator('.k-rail-more');
    if (await more.count()) { await more.click(); await page.waitForTimeout(800); await shot(page, 'menu', m); await page.keyboard.press('Escape'); await page.waitForTimeout(400); }
  }
  const prHref = await page.locator('a.lc-pr').first().getAttribute('href').catch(() => null);
  if (ONLY.has('projects')) { await page.goto(BASE + '/landxi/v3/lx-project/'); await page.locator('.lxp-list .k-table, .lxp-list .k-empty:not(.is-wait)').first().waitFor({ timeout: 30000 }).catch(() => {}); await page.waitForTimeout(1500); await shot(page, 'projects', m); }
  if (ONLY.has('project') && prHref) {
    const id = new URL(prHref, BASE).searchParams.get('project');
    if (id) { await page.goto(BASE + '/landxi/v3/lx-project/?project=' + encodeURIComponent(id)); await page.waitForTimeout(4000); await shot(page, 'project', m); }
  }
  if (ONLY.has('step') && prHref) { await page.goto(new URL(prHref, BASE).href); await page.locator('.dp-ops .k-table, .dp-ops .k-empty').first().waitFor({ timeout: 30000 }).catch(() => {}); await page.waitForTimeout(2500); await shot(page, 'step', m); }
  /* 프로젝트 안 학습(③) · 결과 확인(④) — 단계 막대의 주소 그대로 */
  if ((ONLY.has('train') || ONLY.has('review')) && prHref) {
    const id = new URL(prHref, BASE).searchParams.get('project');
    await page.goto(BASE + '/landxi/v3/lx-project/?project=' + encodeURIComponent(id));
    await page.locator('.k-sub .lxp-st').first().waitFor({ timeout: 20000 });
    const st = await page.locator('.k-sub .lxp-st').evaluateAll((as) => as.map((a) => a.href));
    if (ONLY.has('train')) { await page.goto(st[2]); await page.waitForTimeout(6000); await shot(page, 'train', m); }
    if (ONLY.has('review')) { await page.goto(st[3]); await page.waitForTimeout(7000); await shot(page, 'review', m); }
  }
  /* 프로젝트 밖 서비스 관리(메뉴 '서비스 카드' 자리) — 전체 배포본 · 지도 이름표 */
  if (ONLY.has('ops')) { await page.goto(BASE + '/landxi/v3/lx-deploy/?tab=ops'); await page.locator('.dp-ops .k-table').first().waitFor({ timeout: 40000 }).catch(() => {}); await page.waitForTimeout(3000); await shot(page, 'ops', m); }
  if (ONLY.has('data')) { await page.goto(BASE + '/landxi/v3/lx-ingest/'); await page.waitForTimeout(9000); await shot(page, 'data', m); }
  if (ONLY.has('inbox')) { await page.goto(BASE + '/landxi/v3/lx-inbox/'); await page.waitForTimeout(3500); await shot(page, 'inbox', m); }
  out({ who: 'staff', mobile: m, errors: errs });
  await ctx.close();
}

async function login(m) {
  const ctx = await browser.newContext(view(m));
  const page = await ctx.newPage();
  await page.goto(BASE + '/landxi/v3/login/', { waitUntil: 'domcontentloaded' });
  const ok = await page.waitForSelector('#ask.on', { timeout: 70000 }).then(() => true).catch(() => false);
  await page.waitForTimeout(ok ? 1400 : 0);
  await shot(page, 'login-ask', m);
  out({ login: 'ask', visible: ok, kbd: await page.locator('#ask kbd').count() });
  await ctx.close();
}

/* LX 관리자 — XI ChatGEO 에 '기관별 사용량 보여 줘'(직행 도구 · 한 번) → 답 · 차트 제목 */
async function admin(m) {
  const ctx = await browser.newContext(view(m));
  const page = await ctx.newPage();
  await frontDoor(page, ADMIN_BASE, 'lxadmin@lx.or.kr', 'admin');
  await page.waitForTimeout(4000);
  await page.locator('.k-chat-fab').click();
  await page.waitForTimeout(600);
  await page.locator('.k-chat-sugg button', { hasText: '기관별 사용량' }).first().click();
  await page.waitForFunction(() => /done|failed|rejected/.test(document.querySelector('.k-chat')?.dataset.state || ''), null, { timeout: 90000 }).catch(() => null);
  await page.waitForTimeout(1500);
  const ans = await page.evaluate(() => [...document.querySelectorAll('.k-chat .k-chat-a, .k-chat .k-ck-a')].map((e) => e.innerText).filter(Boolean).pop() || '');
  const charts = await page.evaluate(() => [...document.querySelectorAll('.k-chat [class*="chart"] , .k-chat .k-bars')].map((e) => (e.innerText || '').split('\n')[0]).slice(0, 3));
  await shot(page, 'admin-usage', m);
  out({ admin: 'usage', answer: ans.slice(0, 160), charts });
  await ctx.close();
}

if (ONLY.has('login')) await login(false);
const VIEWS = arg('--views', 'both');   // pc | mobile | both — 바깥 주소 로그인은 10분 20번까지라 나눠 찍을 수 있게
for (const m of [false, true]) if (VIEWS === 'both' || (VIEWS === 'mobile') === m) await staff(m);
if (ONLY.has('admin')) await admin(false);
await browser.close();
