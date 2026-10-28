/* v7.1 공용 — 바깥 주소 로그인 폼(비밀번호 = server/.env 에서 읽음 · 화면 · 기록에 쓰지 않음) → 1920×1080 캡처(그림은 E:\도로공사\deck_part3b · git 에 넣지 않음) */
import { chromium } from 'playwright';
import fs from 'node:fs';
import { frontDoor } from '../../../../../../landxi/v3/kit/lint/forbidden.mjs';
export const APP = 'https://app.land-xi.dev';
export const OUT = 'E:/도로공사/deck_part3b/';
const envPw = (k) => { try { return fs.readFileSync('E:/Land-XI 플랫폼/01. 디자인/server/.env', 'utf8').split('\n').find((l) => l.startsWith(k + '='))?.slice(k.length + 1).trim(); } catch { return null; } };
export async function open(login = 'lx.demo@lx.or.kr', pwKey = 'LXDEMO_PW', o = {}) {
  const browser = await chromium.launch({ channel: 'chrome' });
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: o.dpr || 1, acceptDownloads: true });
  if (o.init) await ctx.addInitScript(o.init);
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
  await frontDoor(page, APP, login, 'app', { password: envPw(pwKey) });
  await page.waitForURL((u) => !/\/login\/?(\?|$)/.test(u.pathname), { timeout: 30000 });
  return { browser, ctx, page, errs };
}
export const shot = async (page, rel) => { const f = OUT + rel; await page.screenshot({ path: f }); return f; };
export const text = (page, sel = 'body') => page.locator(sel).first().innerText().catch(() => '');
