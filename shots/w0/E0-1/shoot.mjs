/* E0-1 스크린샷 — 4주체 레일 · denied 안내 3장 · 기관 문 안내 1장 · 문 안내 텍스트 인 프레임 스트립.
   실행: node shots/w0/E0-1/shoot.mjs  (서버 http://localhost:4173 이 떠 있어야 한다) */
import { chromium } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = 'http://localhost:4173/landxi/proto/';
const OUT = path.dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch({ channel: 'chrome' });
const SIZES = [[1440, 900], [1280, 720]];
const out = [];

async function open(size, session, url, { ready = true } = {}) {
  const ctx = await browser.newContext({ viewport: { width: size[0], height: size[1] } });
  await ctx.addInitScript((s) => {
    if (sessionStorage.getItem('lx_shot')) return;
    sessionStorage.setItem('lx_shot', '1');
    for (const k of ['lx_logged_in', 'lx_role', 'lx_tenant_session']) localStorage.removeItem(k);
    if (s.lx) { localStorage.setItem('lx_logged_in', '1'); localStorage.setItem('lx_role', s.lx); }
    if (s.tenant) localStorage.setItem('lx_tenant_session', JSON.stringify({ tenant: s.tenant, at: '2026-06-08T09:00:00+09:00' }));
  }, session);
  const page = await ctx.newPage();
  await page.goto(BASE + url, { waitUntil: 'load' });
  if (ready) await page.waitForFunction(() => document.documentElement.dataset.shell === 'ready');
  return { ctx, page };
}
const snap = async (page, name, size) => {
  const f = path.join(OUT, `${name}-${size[0]}.png`);
  await page.screenshot({ path: f, fullPage: false });
  out.push(path.basename(f));
};

for (const size of SIZES) {
  const shots = [
    ['01-rail-admin', { lx: 'admin' }, 'admin-home.html', 1500],
    ['02-rail-staff', { lx: 'staff' }, 'ai-project.html', 1500],
    ['03-rail-sales', { lx: 'sales' }, 'ximap.html', 1800],
    ['04-rail-tenant-namwon', { tenant: 'namwon' }, 'portal.html', 1500],
    ['05-denied-toast-staff', { lx: 'staff' }, 'admin-publish.html', 900],      // → ai-project.html + 안내
    ['06-denied-toast-sales', { lx: 'sales' }, 'notice.html', 900],             // → ximap.html + 안내
    ['07-denied-toast-tenant', { tenant: 'namwon' }, 'ximap.html', 900],        // → portal.html + 안내
  ];
  for (const [name, s, url, wait] of shots) {
    const { ctx, page } = await open(size, s, url);
    await page.waitForTimeout(wait);
    await snap(page, name, size);
    await ctx.close();
  }
  // 08 — LX 관리자가 기관 작업공간을 두드린다 → 그 기관의 문 + 문 위 안내(텍스트 인 500ms)
  const { ctx, page } = await open(size, { lx: 'admin' }, 'portal-dp-nw-farm-25.html', { ready: false });
  await page.waitForSelector('#pl-deny');
  if (size[0] === 1440) {
    // 텍스트 인(500ms) 중간 프레임 — 실시간 캡처는 스크린샷 지연 때문에 전부 최종 프레임이 찍혔다(E0-1 재판정).
    // 애니메이션을 멈추고 currentTime 을 0/100/250/400/500ms 로 옮겨 찍는다.
    for (const t of [0, 100, 250, 400, 500]) {
      await page.evaluate((ms) => document.querySelectorAll('#pl-deny').forEach((el) =>
        el.getAnimations().forEach((a) => { a.pause(); a.currentTime = ms; })), t);
      const probe = await page.$eval('#pl-deny', (el) => { const c = getComputedStyle(el); return `${c.opacity} ${c.transform}`; });
      const n = `08-portal-door-notice-t${String(t).padStart(3, '0')}.png`;
      await page.screenshot({ path: path.join(OUT, n), clip: { x: 0, y: 0, width: size[0], height: size[1] } });
      out.push(`${n}  (opacity transform = ${probe})`);
    }
    await page.evaluate(() => document.getAnimations().forEach((a) => a.finish()));
  }
  await page.waitForTimeout(900);
  await snap(page, '08-portal-door-notice', size);
  await ctx.close();
}
await browser.close();
console.log(out.join('\n'));
