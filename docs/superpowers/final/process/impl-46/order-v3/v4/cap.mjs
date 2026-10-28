/* v4 확인용 공용 부품 — 신규 계정(ROADLAND_PW 는 server/.env 에서 읽음 · 화면 · 기록에 쓰지 않음)으로 로그인 폼 → 3840x2160 캡처 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import { frontDoor } from '../../../../../../../landxi/v3/kit/lint/forbidden.mjs';
export const APP = 'https://app.land-xi.dev';
export const OUT = 'E:/도로공사/deck_capability/';
export const LOGIN = process.env.CAP_LOGIN || 'kec-land@lx.or.kr';
const envPw = (k) => { try { return fs.readFileSync('E:/Land-XI 플랫폼/01. 디자인/server/.env', 'utf8').split('\n').find((l) => l.startsWith(k + '='))?.slice(k.length + 1).trim(); } catch { return null; } };
export const ymd = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }).replaceAll('-', '');
export async function open(login = LOGIN, pwKey = 'ROADLAND_PW') {
  const browser = await chromium.launch({ channel: 'chrome' });
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const net = []; page.on('request', (r) => net.push(r.url()));
  const errs = []; page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
  await frontDoor(page, APP, login, 'app', { password: envPw(pwKey) });
  await page.waitForURL((u) => !/\/login\/?(\?|$)/.test(u.pathname), { timeout: 30000 });
  return { browser, ctx, page, net, errs };
}
export const shot = async (page, name) => { const f = `${OUT}${name}_${ymd()}.png`; await page.screenshot({ path: f }); return f; };
export const text = (page, sel = 'body') => page.locator(sel).first().innerText().catch(() => '');
