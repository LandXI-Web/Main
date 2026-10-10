/* impl-11 LX 관리자 관리 기능 — 바깥 주소 · 로그인 폼(kit/lint/forbidden.mjs frontDoor · 세션 주입 0)으로 실제 흐름 한 번씩 · PC 1440 캡처(원칙 139 · 162).
   시험 자료(시험 분석 요청 한 건 · 광역 시험 부서 사용자 · 새 판 시험 알림)는 스크래치 fixture.py 가 만들고 끝에 지운다. 비밀번호 출력 0.
   사용: node docs/superpowers/final/process/impl-11/admin/shoot.mjs [--part all|q16|q17|n13|n16|n19|staff] */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../../../..');
const { frontDoor } = await import(pathToFileURL(path.join(ROOT, 'landxi/v3/kit/lint/forbidden.mjs')).href);
const { chromium } = createRequire(path.join(ROOT, 'package.json'))('playwright');
const PART = (() => { const i = process.argv.indexOf('--part'); return i > 0 ? process.argv[i + 1] : 'all'; })();
const SHOTS = path.join(HERE, 'shots'); fs.mkdirSync(SHOTS, { recursive: true });
const LOG = path.join(SHOTS, 'log.json');
const log = fs.existsSync(LOG) ? JSON.parse(fs.readFileSync(LOG, 'utf8')) : {};
const browser = await chromium.launch();
const stamp = () => { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; };
async function shot(page, name, note) {
  await page.screenshot({ path: path.join(SHOTS, name) });
  log[name] = { at: stamp(), url: page.url().replace(/[?#].*$/, '') + (new URL(page.url()).hash || ''), note };
  fs.writeFileSync(LOG, JSON.stringify(log, null, 1));
  console.log(JSON.stringify({ shot: name, at: log[name].at }));
}
async function open(login, base, site) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(90000); page.setDefaultNavigationTimeout(120000);
  const errs = []; page.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));
  await frontDoor(page, base, login, site);
  await page.waitForTimeout(1500);
  return { ctx, page, errs };
}
const ADMIN = 'https://admin.land-xi.dev';
const APP = 'https://app.land-xi.dev';

async function q16() {
  const { ctx, page, errs } = await open('lxadmin@lx.or.kr', ADMIN, 'admin');
  const org = new URL(page.url()).origin;
  await page.goto(org + '/landxi/v3/ops-core/#/approvals', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.rq-row[data-id="rq_shot11a"]');
  await page.waitForTimeout(1200);
  // 급함 — 사유 창 → 맨 앞으로
  await page.locator('.rq-row[data-id="rq_shot11a"] .rq-ur').click();
  await page.locator('.k-drawer .oc-reason').fill('기관 장마 전 확인 요청');
  await page.locator('.k-drawer .oc-acts .t-btn:not(.t-btn--2)').click();
  await page.waitForFunction(() => document.querySelector('.rq-row[data-id="rq_shot11a"] .rq-ur')?.getAttribute('aria-pressed') === 'true');
  await page.waitForTimeout(800);
  const first = await page.evaluate(() => document.querySelector('.rq-row[data-id]')?.dataset.id);
  // 한 건 서랍 — 담당 고르기
  await page.locator('.rq-row[data-id="rq_shot11a"]').click();
  await page.waitForSelector('.k-drawer .rq-sel');
  await page.locator('.k-drawer .rq-sel').selectOption('u_mail_test');
  await page.waitForFunction(() => /LX 직원/.test(document.querySelector('.rq-row[data-id="rq_shot11a"] .rq-as')?.textContent || ''));
  await page.waitForTimeout(1500);
  await shot(page, 'q16-requests-1440.png', '요청 관리 · 분석 요청 — 급함 켠 시험 요청이 1번 · 서랍(순번 · 급함 · 담당 · 예상 시작 · 보류 · 거절 · 승인)');
  const tabs = await page.evaluate(() => [...document.querySelectorAll('.oc-tabs button')].map((b) => b.textContent));
  console.log(JSON.stringify({ part: 'q16', first, tabs, rail: await page.evaluate(() => [...document.querySelectorAll('.k-rail-i, .t-rail button')].map((b) => b.textContent.trim()).filter(Boolean)), errs }));
  // 보류 → 다시 풀기(사유 칸)
  await page.locator('.k-drawer .oc-reason').fill('영상 범위 확인 중');
  await page.locator('.k-drawer .rq-acts .t-btn--2').first().click();
  await page.waitForFunction(() => document.querySelector('.rq-row[data-id="rq_shot11a"]')?.dataset.st === 'held');
  await page.waitForTimeout(800);
  console.log(JSON.stringify({ part: 'q16-hold', state: await page.evaluate(() => document.querySelector('.rq-row[data-id="rq_shot11a"] .t-chip')?.textContent), log: await page.evaluate(() => document.querySelector('.rq-log li')?.textContent) }));
  await page.locator('.k-drawer .rq-acts .t-btn--2').first().click();          // 보류 풀기
  await page.waitForFunction(() => document.querySelector('.rq-row[data-id="rq_shot11a"]')?.dataset.st === 'pending');
  await ctx.close();
}

async function q17() {
  const { ctx, page, errs } = await open('lxadmin@lx.or.kr', ADMIN, 'admin');
  const org = new URL(page.url()).origin;
  await page.goto(org + '/landxi/v3/ops-infra/#/tenants', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.org[data-id="namwon"]');
  await page.waitForTimeout(800);
  await page.locator('.org[data-id="namwon"]').click();
  await page.waitForSelector('.tp-h h1');
  await page.waitForTimeout(1500);
  await shot(page, 'q17-tenant-overview-1440.png', "기관 → 남원시 카드 → '기관 한 곳' 새 화면 · 개요 탭");
  await page.locator('.tp-tabs button[data-k="svc"]').click();
  await page.waitForSelector('.tp-svc');
  await page.waitForTimeout(800);
  await shot(page, 'q17-tenant-services-1440.png', '서비스와 담당 탭 — 서비스마다 LX 헬프데스크 담당 · 촬영 요청 담당');
  await page.locator('.tp-tabs button[data-k="use"]').click();
  await page.waitForSelector('.tp-use .tp-t');
  await page.waitForTimeout(1200);
  await shot(page, 'q17-tenant-use-1440.png', '사용과 계정 탭 — 이번 달 사용 · 계정(볼 수 있는 서비스 · 마지막 로그인)');
  await page.locator('.tp-tabs button[data-k="img"]').click();
  await page.waitForSelector('.tp-img .sh-l li');
  console.log(JSON.stringify({ part: 'q17', tabs: await page.evaluate(() => [...document.querySelectorAll('.tp-tabs button')].map((b) => b.textContent)), shares: await page.locator('.tp-img .sh-l li').count(), errs }));
  await ctx.close();
}

async function n13() {
  const { ctx, page, errs } = await open('lxadmin@lx.or.kr', ADMIN, 'admin');
  const org = new URL(page.url()).origin;
  await page.goto(org + '/landxi/v3/ops-infra/#/deploys/share', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.rv-sgg');
  await page.waitForTimeout(800);
  await page.locator('.rv-sgg').first().click();
  await page.waitForSelector('.rv-sg-g label');
  await page.waitForTimeout(800);
  await shot(page, 'n13-share-sgg-1440.png', "배포 → 기관 공유 — 광주전남(광역) 칸 '시군구 27 / 27' → 소속 시군구 고르기 · 공유 거두기");
  console.log(JSON.stringify({ part: 'n13', boxes: await page.locator('.rv-sg-g input').count(), errs }));
  await ctx.close();
}

async function n16() {
  const { ctx, page, errs } = await open('lxadmin@lx.or.kr#gwangju-jeonnam', ADMIN, 'gov');
  const org = new URL(page.url()).origin;
  await page.goto(org + '/landxi/v3/gov-accounts/#accounts', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.ds-sel');
  await page.waitForTimeout(800);
  await page.locator('.ds-t tr', { hasText: '순천시 농정과' }).locator('select').selectOption({ label: '순천시' });
  await page.waitForFunction(() => [...document.querySelectorAll('.ds-t select')].some((s) => s.value && s.options[s.selectedIndex].text === '순천시'));
  await page.waitForTimeout(1500);
  await page.locator('.ds').scrollIntoViewIfNeeded();
  await shot(page, 'n16-dept-scope-1440.png', '광주전남 기관 관리자 → 계정 — 부서별 관할(순천시 농정과 → 순천시만)');
  await ctx.close();
  // 그 부서 사용자 — 지역이 순천시 하나만
  const u = await open('shot11@gj.go.kr#gwangju-jeonnam', ADMIN, 'gov');
  const n = await u.page.evaluate(async () => {
    const raw = Object.keys(localStorage).map((k) => localStorage.getItem(k)).find((v) => /"token"/.test(v || ''));
    const tok = raw ? JSON.parse(raw).token : null;
    const r = await fetch('/api/v1/regions', { headers: tok ? { authorization: 'Bearer ' + tok } : {} });
    const j = await r.json(); return { status: r.status, n: (j.items || []).length, names: (j.items || []).map((x) => x.name?.ko || x.name).slice(0, 3) };
  });
  console.log(JSON.stringify({ part: 'n16-user', regions: n, errs: u.errs }));
  await u.ctx.close();
}

async function n19() {
  const { ctx, page, errs } = await open('lxadmin@lx.or.kr#namwon', ADMIN, 'gov');
  await page.waitForSelector('.k-bell');
  await page.waitForTimeout(2500);
  await page.locator('.k-bell').click();
  await page.waitForTimeout(1200);
  await shot(page, 'n19-version-bell-1440.png', "남원시 기관 — 종 알림 '새 결과' 칸에 '서비스 새 판 n — 달라진 점 한 줄'");
  console.log(JSON.stringify({ part: 'n19', bell: await page.evaluate(() => document.querySelector('.k-bell-p, .k-bell-pop, [class*=k-bell-]')?.innerText?.slice(0, 300)), errs }));
  await ctx.close();
}

async function staff() {
  const { ctx, page, errs } = await open('test@lx.or.kr', APP, 'app');
  await page.waitForSelector('.k-bell');
  await page.waitForTimeout(2500);
  await page.locator('.k-bell').click();
  await page.waitForTimeout(1200);
  await shot(page, 'q16-staff-bell-1440.png', "LX 직원 — 담당으로 지정된 분석 요청이 종 알림 '담당 서비스 분석 요청'에");
  console.log(JSON.stringify({ part: 'staff', bell: await page.evaluate(() => document.body.innerText.match(/담당 서비스 분석 요청[^\n]*\n?[^\n]*/)?.[0]), errs }));
  await ctx.close();
}

const ALL = { q16, q17, n13, n16, n19, staff };
for (const [k, f] of Object.entries(ALL)) if (PART === 'all' || PART === k) { try { await f(); } catch (e) { console.log(JSON.stringify({ part: k, error: String(e).slice(0, 300) })); } }
await browser.close();
