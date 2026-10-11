/* impl-13 메인 지시 1–5 증거 — 바깥 주소(app · admin.land-xi.dev)에서 지금 새로 찍는다(원칙 162). 로그인은 로그인 폼으로만(세션 주입 0).
   node docs/superpowers/final/process/impl-13/main/shoot.mjs   (01. 디자인 에서) — 결과 shots/*.png + run.json(시각 · 측정 · 콘솔 오류 · 이 PC 주소 호출) */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { frontDoor } from '../../../../../../landxi/v3/kit/lint/forbidden.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(DIR, 'shots');
const APP = 'https://app.land-xi.dev', ADMIN = 'https://admin.land-xi.dev';
const run = { at: new Date().toISOString(), shots: {}, measure: {}, errors: [], local: [] };
const stamp = () => new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }).slice(0, 16);
const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const watch = (page, tag) => {
  page.on('console', (m) => { if (m.type() === 'error') run.errors.push(`${tag}: ${m.text()}`); });
  page.on('pageerror', (e) => run.errors.push(`${tag}: ${e}`));
  page.on('request', (r) => { if (/\/\/(127\.0\.0\.1|localhost|\[::1\])|:8700|:4173/.test(r.url())) run.local.push(r.url()); });
};
const shot = async (page, name) => { await page.screenshot({ path: path.join(OUT, name) }); run.shots[name] = stamp(); };

/* 메인-2 측정 — 서비스 장면이 한 화면에(1366 · 1920 은 측정만) */
for (const [w, hh] of [[1440, 900], [1920, 1080], [1366, 768]]) {
  const page = await browser.newPage({ viewport: { width: w, height: hh } }); watch(page, `main-${w}`);
  await page.goto(APP + '/landxi/v3/main/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
  if (w === 1440) await shot(page, 'main1-hero-1440.png');
  await page.click('.m-nav a[href="#ch4"]');
  await page.waitForTimeout(2200);
  run.measure[`${w}x${hh}`] = await page.evaluate(() => {
    const q = (s) => document.querySelector(s).getBoundingClientRect();
    const cards = [...document.querySelectorAll('#cards .k-svc')].map((c) => c.getBoundingClientRect());
    const bottom = Math.max(...cards.map((c) => c.bottom)), top = q('#ch4 .m-bridge').top;
    return { cards: cards.length, mast_bottom: Math.round(q('.m-mast').bottom), title_top: Math.round(top), cards_bottom: Math.round(bottom), view_h: innerHeight,
      fits: top >= q('.m-mast').bottom && bottom <= innerHeight, names: [...document.querySelectorAll('#cards .k-svc-t')].map((e) => e.textContent),
      nums: [...document.querySelectorAll('#cards .k-svc-n')].map((e) => e.textContent), lead: document.querySelector('#ch4 .m-p').textContent };
  });
  if (w === 1440) {
    await shot(page, 'main2-services-1440.png');
    /* 메인-5 — 마지막 해외 장면(키르기스스탄 분석 결과) */
    const info = await page.evaluate(() => { const t = document.getElementById('trackB'); const r = t.getBoundingClientRect(); return { top: r.top + scrollY, h: t.offsetHeight }; });
    const y = info.top + (info.h - 900) * 0.62;
    await page.evaluate((yy) => scrollTo({ top: yy - 600, behavior: 'instant' }), y);
    await page.waitForTimeout(400);
    for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, 100); await page.waitForTimeout(120); }
    await page.waitForTimeout(4000);
    await shot(page, 'main5-kyrgyz-1440.png');
    run.measure.kyrgyz = await page.evaluate(() => ({ p: document.getElementById('ch6-p').textContent, big: document.querySelector('#ch6-big .k-big-row')?.textContent, tag: document.getElementById('ch6-tag').textContent }));
    /* 메인-3 — 마감의 '문의하기' → 창 → 한 건 보내기 */
    await page.evaluate(() => scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
    await page.waitForTimeout(3500);
    await page.locator('#fin [data-inquiry]').click();
    const md = page.locator('.k-md');
    await page.locator('.k-md-bg.is-open .iq-form').waitFor();
    await page.waitForTimeout(1200);
    await shot(page, 'main3-form-1440.png');
    await md.locator('input[name=name]').fill('시험 담당');
    await md.locator('input[name=org]').fill('Land-XI 시험');
    await md.locator('input[name=contact]').fill('test@example.com');
    await md.locator('.iq-k', { hasText: '사용 방법' }).click();
    await md.locator('textarea[name=body]').fill('문의하기 창 시험입니다. 관리자 목록에서 확인한 뒤 시험으로 표시합니다.');
    await md.locator('.iq-ck').check();
    await md.locator('.iq-go').click();
    await md.locator('.iq-done').waitFor({ timeout: 15000 });
    await page.waitForTimeout(500);
    await shot(page, 'main3-sent-1440.png');
  }
  await page.close();
}

/* 메인-4 — 로그인 화면의 Land-XI 를 누르면 메인으로 */
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }); watch(page, 'login');
  await page.goto(APP + '/landxi/v3/login/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await shot(page, 'main4-login-1440.png');
  await Promise.all([page.waitForURL(/\/landxi\/v3\/main\//, { timeout: 15000 }), page.locator('.door__home').click()]);
  await page.waitForTimeout(2500);
  run.measure.login_logo_to = new URL(page.url()).pathname;
  await shot(page, 'main4-after-click-1440.png');
  await page.close();
}

/* 메인-3 — LX 관리자: 계정 → 문의 탭 → 방금 보낸 문의 → '시험으로 표시' */
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }); watch(page, 'admin');
  await frontDoor(page, ADMIN, 'lxadmin@lx.or.kr', 'admin');
  await page.waitForURL((u) => !/\/login\/?$/.test(u.pathname), { timeout: 20000 });
  await page.goto(ADMIN + '/landxi/v3/ops-accounts/#inquiries', { waitUntil: 'domcontentloaded' });
  const row = page.locator('.acc-card[data-tab="inquiries"] tbody tr', { hasText: 'Land-XI 시험' }).first();
  await row.waitFor({ timeout: 20000 });
  await page.waitForTimeout(800);
  await shot(page, 'main3-admin-list-1440.png');
  await row.click();
  await page.locator('.k-drawer .acc-iq-body').waitFor();
  await page.waitForTimeout(700);
  await shot(page, 'main3-admin-open-1440.png');
  await page.locator('.k-drawer button', { hasText: '시험으로 표시' }).click();
  await page.waitForTimeout(1500);
  await shot(page, 'main3-admin-test-1440.png');
  run.measure.admin_row = await page.locator('.acc-card[data-tab="inquiries"] tbody tr', { hasText: 'Land-XI 시험' }).first().innerText();
  await page.close();
}
await browser.close();
fs.writeFileSync(path.join(DIR, 'run.json'), JSON.stringify(run, null, 1));
console.log(JSON.stringify({ errors: run.errors.length, local: run.local.length, measure: run.measure }, null, 1));
