/* 검사기 셋(words · numbers · fonts)이 함께 쓰는 것 — 바깥 주소 · 로그인 폼(세션 주입 없음) · 역할 넷.
   역할: gov(국내 기관 · 기본 namwon) · app(LX 직원) · admin(LX 관리자) · abroad(해외 기관 · 기본 kgz-agri — 첫 화면 /landxi/v3/global/).
   바깥 로그인 한도(10분 20번) — 역할마다 로그인 한 번. all.mjs 는 세 검사기를 같은 로그인으로 돌린다.
   비밀번호는 env LX_PW / DEV_PASSWORD 또는 server/.env 의 DEV_PASSWORD(화면 · 출력에 적지 않는다). */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '../..');
const HW = process.env.LX_HW_BROWSERS || 'C:/Users/User/AppData/Local/ms-playwright';
if (fs.existsSync(path.join(HW, 'chromium-1234'))) process.env.PLAYWRIGHT_BROWSERS_PATH = HW;
if (!process.env.DEV_PASSWORD && !process.env.LX_PW) {
  try { const m = fs.readFileSync(path.join(ROOT, 'server/.env'), 'utf8').match(/^DEV_PASSWORD=(.*?)\s*$/m); if (m) process.env.DEV_PASSWORD = m[1]; } catch { /* 없음 */ }
}
process.env.LX_PW ||= process.env.DEV_PASSWORD || '';
export const { chromium } = createRequire(path.join(ROOT, 'package.json'))('playwright');
export const { frontDoor } = await import(pathToFileURL(path.join(ROOT, 'landxi/v3/kit/lint/forbidden.mjs')).href);

export const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
export const has = (k) => process.argv.includes(k);
export const HOST = { app: arg('--app', 'https://app.land-xi.dev'), admin: arg('--admin', 'https://admin.land-xi.dev'), gov: arg('--gov', 'https://namwon.land-xi.dev') };
export const TENANT = arg('--tenant', 'namwon');
export const ABROAD = arg('--abroad', 'kgz-agri');
export const PW = process.env.LX_PW;
/** 역할 → [바깥 주소, 아이디, 기관] */
export const LOGIN = {
  gov: () => [HOST.gov, 'lxadmin@lx.or.kr', TENANT],
  app: () => [HOST.app, 'test@lx.or.kr'],
  admin: () => [HOST.admin, 'lxadmin@lx.or.kr'],
  abroad: () => [HOST.app, 'lxadmin@lx.or.kr', ABROAD],
};
/** --only gov,app,admin,abroad(기본 넷 모두) */
export const roles = (def = 'gov,abroad,app,admin') => arg('--only', def).split(',').filter((r) => LOGIN[r]);

export const launch = () => chromium.launch({ channel: 'chromium' }).catch(() => chromium.launch());

/** 로그인 폼으로 한 번(다시 시도하지 않는다 — 바깥 로그인 한도) → { ctx, page, role, home } */
export async function login(browser, role, { width = 1440, height = 900 } = {}) {
  const [base, id, tenant] = LOGIN[role]();
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, acceptDownloads: true });
  const page = await ctx.newPage();
  await frontDoor(page, base, id, tenant ? { tenant, password: PW } : { password: PW });
  await page.waitForURL((u) => !/\/login\/?$/.test(u.pathname) && !/gov-home/.test(u.pathname), { timeout: 30000 }).catch(() => {});
  const u = new URL(page.url());
  if (/\/login\/?$/.test(u.pathname) || (tenant && /gov-home|^\/$/.test(u.pathname))) {
    const why = /시도가 너무 많습니다|too many/i.test(await page.innerText('body').catch(() => '')) ? ' — 로그인 시도가 너무 많습니다(10분 뒤 다시)' : '';
    await ctx.close();
    throw new Error(`로그인하지 못했습니다(${u.hostname})${why}`);
  }
  page._who = { base, login: id, tenant };
  return { ctx, page, role, home: u.origin, abroad: /\/landxi\/v3\/global\//.test(u.pathname) };
}

/** 이벤트를 붙이고 떼는 함수를 돌려준다(같은 페이지를 검사기 셋이 차례로 쓸 때) */
export function listen(page, map) {
  for (const [ev, fn] of Object.entries(map)) page.on(ev, fn);
  return () => { for (const [ev, fn] of Object.entries(map)) page.off(ev, fn); };
}

/* 해외 첫 화면(landxi/v3/global) — 지역에 닿고 큰 숫자(작황 하락)가 서거나 '값 없음'이 될 때까지 */
export async function abroadReady(page, ms = 60000) {
  await page.waitForFunction(() => {
    if (document.body.dataset.state === 'error') return true;
    const big = document.querySelector('.gl-hud .k-big');
    return document.body.dataset.state === 'ready' && document.querySelector('.gl')?.dataset.level === 'district'
      && big && !big.classList.contains('is-wait') && (big.dataset.state === 'ok' || big.classList.contains('is-none'));
  }, null, { timeout: ms, polling: 250 }).catch(() => {});
}
/** 해외 첫 화면 탭(Season · NDVI · Sprawl · Register) */
export async function abroadTab(page, name) {
  await page.locator('.gl-tab', { hasText: name }).click();
  await page.waitForTimeout(900);
}
export const ABROAD_TABS = ['Season', 'NDVI', 'Sprawl', 'Register'];

/** 단독 실행 — 역할마다 로그인 한 번 · run(role, s) */
export async function standalone(run, def) {
  const browser = await launch();
  try {
    for (const r of roles(def)) {
      const s = await login(browser, r);
      try { await run(r, s); } finally { await s.ctx.close(); }
    }
  } finally { await browser.close(); }
}
export const isMain = (url) => { try { return path.resolve(fileURLToPath(url)) === path.resolve(process.argv[1] || ''); } catch { return false; } };
