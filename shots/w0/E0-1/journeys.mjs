/* 여정 검증 — 5 주체(게스트 · LX 관리자 · LX 직원 · 영업용 · 기관 포털 사용자)의 첫 화면과 레일,
   화면 안 링크의 응답 코드, 관문(역할이 못 가는 화면)과 누출(기관 → LX 화면) 여부.
   읽기 전용 감사. 산출물: 이 폴더의 PNG + journeys.json
   실행: node shots/audit-0923/strategy/journeys.mjs  (서버 http://localhost:4173 이 이미 떠 있어야 한다)
   ── E0-1 복사본(2026-09-24) — 원본은 그대로 둔다. 바꾼 곳 3줄:
      ① 기관 로그인 뒤 storage 에 lx_tenant_session 을 읽는다(기관 세션은 LX 키와 완전 별도 · Q1)
      ② denied 의 query 는 **요청 기록**에서 읽는다 — R-S5 가 안내 뒤 주소에서 denied 를 걷기 때문
      ③ PNG 는 journeys/ 아래(이 폴더의 E0-1 스크린샷 8장과 섞이지 않게) */
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = 'http://localhost:4173/landxi/proto/';
const OUT = path.dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage(); page.setDefaultTimeout(20000); page.setDefaultNavigationTimeout(25000);
const errors = [];
page.on('pageerror', (e) => errors.push({ url: page.url(), msg: String(e).slice(0, 200) }));
const report = {};
const shot = (n) => page.screenshot({ path: path.join(OUT, 'journeys', n + '.png') });
const navs = []; page.on('request', (r) => { if (r.isNavigationRequest() && r.frame() === page.mainFrame()) navs.push(r.url()); });
const file = (u) => String(u).split('/').pop();

const linkCheck = async (label) => {
  const hrefs = await page.$$eval('a[href]', (as) => [...new Set(as.map((a) => a.href))].filter((h) => h.startsWith('http://localhost')));
  const bad = [];
  for (const h of hrefs) {
    try { const r = await ctx.request.get(h); if (r.status() >= 400) bad.push({ h: file(h), s: r.status() }); }
    catch { bad.push({ h: file(h), s: 'ERR' }); }
  }
  report[label] = { ...(report[label] || {}), links: hrefs.length, bad };
};
const rail = async () => page.$$eval('#rail a.rail-i, #rail button.rail-i', (n) => n.map((x) => x.textContent.trim()));
const setRole = async (role) => {
  await page.goto(BASE + 'login.html?logout', { waitUntil: 'load' });
  await page.evaluate((r) => { localStorage.setItem('lx_logged_in', '1'); localStorage.setItem('lx_role', r); }, role);
};

// 1 게스트 — 메인 필름
await page.goto(BASE + 'scrub/index.html', { waitUntil: 'load' });
report.guest = {
  title: await page.title(),
  mast: await page.$$eval('.lx-masthead__nav a, .lx-masthead__meta a', (a) => a.map((x) => x.textContent.trim() + ' -> ' + x.getAttribute('href'))),
};
await shot('01-guest-main-top');
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await page.waitForTimeout(1500);
await shot('02-guest-main-tail');
report.guest.docHeight = await page.evaluate(() => document.documentElement.scrollHeight);
await linkCheck('guest');

await page.goto(BASE + 'site/platform.html', { waitUntil: 'load' });
await page.waitForTimeout(800);
await shot('03-guest-platform');
await linkCheck('guest-platform');
report['guest-platform'].doors = await page.$$eval('a[href]', (a) => a.map((x) => x.getAttribute('href')).filter((h) => h && h.includes('portal-login')));

// 2 로그인 — 계정 고르개
await page.goto(BASE + 'login.html?logout', { waitUntil: 'load' });
report.login = {
  roles: await page.$$eval('input[name=role]', (i) => i.map((x) => x.value)),
  links: await page.$$eval('a[href]', (a) => a.map((x) => x.getAttribute('href'))),
};
await shot('04-login');

// 3~5 LX 세 계정
const ROLES = [['admin', 'admin-home.html', 'ai-project.html'], ['staff', 'ai-project.html', 'admin-home.html'], ['sales', 'ximap.html', 'admin-publish.html']];
for (const [role, home, probe] of ROLES) {
  await setRole(role);
  await page.goto(BASE + home, { waitUntil: 'load' });
  await page.waitForTimeout(1800);
  report[role] = { title: await page.title(), rail: await rail(), site: await page.evaluate(() => document.body.dataset.site || '') };
  await shot(`05-${role}-home`);
  await linkCheck(role);
  await page.goto(BASE + probe, { waitUntil: 'load' });
  await page.waitForTimeout(600);
  report[role].denied = { tried: probe, landed: file(page.url().split('?')[0]), query: (navs.filter((u) => file(u.split('?')[0]) === file(page.url().split('?')[0])).pop() || '').split('?')[1] || '' };

  if (role === 'sales') {
    await page.goto(BASE + 'usecase.html', { waitUntil: 'load' });
    await page.waitForTimeout(800);
    report.sales.usecaseTabs = await page.$$eval('.ptabs a', (a) => a.map((x) => x.textContent.trim() + ' -> ' + x.getAttribute('href')));
    report.sales.usecaseRail = await rail();
    await shot('06-sales-usecase');
    await page.goto(BASE + 'notice.html', { waitUntil: 'load' });
    await page.waitForTimeout(500);
    report.sales.noticeReach = file(page.url().split('?')[0]);
    await page.goto(BASE + 'analysis-ai.html', { waitUntil: 'load' });
    await page.waitForTimeout(1500);
    report.sales.analysisButtons = await page.$$eval('main button', (b) => b.map((x) => x.textContent.trim()).filter(Boolean).slice(0, 30));
    await shot('07-sales-analysis');
  }
  if (role === 'staff') {
    for (const s of ['dashboard.html', 'analysis-ai.html', 'ximap.html', 'dataset.html']) {
      await page.goto(BASE + s, { waitUntil: 'load' });
      await page.waitForTimeout(1800);
      await shot(`05-staff-${s.replace('.html', '')}`);
    }
  }
  if (role === 'admin') {
    for (const s of ['produce.html', 'admin-publish.html', 'dataset.html']) {
      await page.goto(BASE + s, { waitUntil: 'load' });
      await page.waitForTimeout(1800);
      await shot(`05-admin-${s.replace('.html', '')}`);
    }
  }
}

// 6 기관 포털 사용자(남원)
await page.goto(BASE + 'login.html?logout', { waitUntil: 'load' });
await page.evaluate(() => localStorage.clear());
await page.goto(BASE + 'portal.html', { waitUntil: 'load' });
await page.waitForTimeout(800);
report.portal = { unauthLanded: file(page.url().split('?')[0]) };
await shot('08-portal-login-namwon');
const inputs = await page.$$('input');
report.portal.loginInputs = await Promise.all(inputs.map((i) => i.getAttribute('type')));
for (const i of inputs) { const t = await i.getAttribute('type'); if (t === 'password') await i.fill('x'); else if (t !== 'checkbox') await i.fill('demo@namwon.go.kr'); }
await page.click('button[type=submit]').catch(() => {});
await page.waitForTimeout(1800);
report.portal.afterLogin = file(page.url().split('?')[0]);
report.portal.storage = await page.evaluate(() => ({ role: localStorage.getItem('lx_role'), logged: localStorage.getItem('lx_logged_in'), tenant: localStorage.getItem('lx_tenant_session') }));
report.portal.rail = await rail();
report.portal.title = await page.title();
await shot('09-portal-home');
await linkCheck('portal');
const cardLinks = await page.$$eval('a[href*="portal-dp-"]', (a) => a.map((x) => x.getAttribute('href')));
report.portal.cardLinks = cardLinks;
if (cardLinks.length) {
  await page.goto(BASE + cardLinks[0], { waitUntil: 'load' });
  await page.waitForTimeout(1800);
}
report.portal.workspace = {
  url: file(page.url()), title: await page.title(), rail: await rail(),
  lxLinks: await page.$$eval('a[href]', (a) => a.map((x) => x.getAttribute('href')).filter((h) => h && /(analysis-ai|ximap|stats-standard|report-standard|dashboard|ai-project)\.html/.test(h))),
  tabs: await page.$$eval('[role=tab], .pt-tabs a, .ptabs a', (a) => a.map((x) => x.textContent.trim()).filter(Boolean).slice(0, 12)),
};
await shot('10-portal-workspace');
await linkCheck('portal-workspace');
// 기관 사용자가 LX 화면 주소를 직접 치면 어디로 가나 (누출 검사)
for (const s of ['ximap.html', 'analysis-ai.html', 'dashboard.html']) {
  await page.goto(BASE + s, { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  report.portal['leak_' + s] = { landed: file(page.url().split('?')[0]), rail: await rail(), title: await page.title() };
}
await shot('11-portal-user-on-ximap');

report.pageErrors = errors;
fs.writeFileSync(path.join(OUT, 'journeys.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 1));
await browser.close();
