/* 소개 영상(원칙 297) 공용 — 바깥 주소 · 로그인 폼(frontDoor) · 비밀번호는 server/.env 에서만(출력 안 함).
   녹화는 rec.mjs(CDP 화면 프레임 → 30fps mp4). 저장 데이터를 바꾸지 않게 GET 아닌 API 요청은 가짜 성공으로 돌려준다(로그인 · XI ChatGEO 질문 · 비용 견적(분석 · 촬영 — 읽기 전용)만 통과). */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

export const ROOT = 'E:/Land-XI 플랫폼/01. 디자인';
export const OUT = process.env.LX_VIDEO_OUT || 'E:/Land-XI 플랫폼/02. 데이터/_video/intro-2026-10-18';
const HW = 'C:/Users/User/AppData/Local/ms-playwright';
if (fs.existsSync(HW)) process.env.PLAYWRIGHT_BROWSERS_PATH = HW;
if (!process.env.DEV_PASSWORD) { const m = fs.readFileSync(path.join(ROOT, 'server/.env'), 'utf8').match(/^DEV_PASSWORD=(.*?)\s*$/m); if (m) process.env.DEV_PASSWORD = m[1].replace(/^"|"$/g, ''); }
process.env.LX_PW ||= process.env.DEV_PASSWORD;
export const { chromium } = createRequire(path.join(ROOT, 'package.json'))('playwright');
export const { frontDoor } = await import(pathToFileURL(path.join(ROOT, 'landxi/v3/kit/lint/forbidden.mjs')).href);
export { Rec, CURSOR } from './rec.mjs';
import { CURSOR } from './rec.mjs';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const W = 1920, H = 1080;

/** 새 창 — 1920×1080(opts.vw · vh 로 더 큰 창 — 녹화는 1920×1080 으로 줄여 담김) · 화면 배율 1 · 쓰기 막기. 커서 점은 넣지 않는다(10-18 사용자: "화면에 마우스 포인트가 없었으면") — opts.cursor 로만 켬 */
export async function newCtx(browser, log, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: opts.vw || W, height: opts.vh || H }, deviceScaleFactor: 1, locale: 'ko-KR' });
  if (opts.cursor) await ctx.addInitScript(CURSOR);
  await ctx.addInitScript("try { sessionStorage.setItem('lx.chat.test', '1') } catch (e) {}");   // XI ChatGEO 시험 표시
  await ctx.addInitScript(() => { const s = document.createElement('style'); s.textContent = '::-webkit-scrollbar{width:0;height:0}'; (document.head || document.documentElement).appendChild(s); });
  await ctx.route('**/api/**', (r) => {
    const m = r.request().method(), u = r.request().url();
    if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS' || /\/auth\/login|\/agent\/|\/jobs\/quote$|\/shoots\/quote$/.test(u)) return r.continue();   // 견적 둘 = 읽기 전용(셈만)
    log?.push(`막음 ${m} ${u.replace(/\?.*/, '').replace(/^https?:\/\/[^/]+/, '')}`);
    return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  });
  const p = await ctx.newPage();
  p.setDefaultTimeout(60000);
  return { ctx, p };
}

let cur = { x: 960, y: 540 };
export async function place(p, x, y) { cur = { x, y }; await p.mouse.move(x, y); }
/** 사람 손처럼 커서를 옮긴다(ease-in-out · 약 dur ms) */
export async function glide(p, x, y, dur = 650) {
  const n = Math.max(8, Math.round(dur / 16)), x0 = cur.x, y0 = cur.y;
  for (let i = 1; i <= n; i++) { const t = i / n, e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; await p.mouse.move(x0 + (x - x0) * e, y0 + (y - y0) * e); await sleep(16); }
  cur = { x, y };
}
export async function at(p, loc, dur) { const l = typeof loc === 'string' ? p.locator(loc).first() : loc; await l.scrollIntoViewIfNeeded().catch(() => {}); const b = await l.boundingBox(); if (!b) throw new Error('안 보임 ' + loc); await glide(p, b.x + b.width / 2, b.y + b.height / 2, dur); return l; }
export async function tap(p, loc, dur) { await at(p, loc, dur); await sleep(180); await p.mouse.down(); await sleep(90); await p.mouse.up(); await sleep(200); }
export async function typeIn(p, loc, text, delay = 85) { await tap(p, loc); const l = typeof loc === 'string' ? p.locator(loc).first() : loc; await l.pressSequentially(text, { delay }); }
/** 부드러운 휠(작은 걸음) */
export async function wheel(p, dy, steps = 40, gap = 16) { for (let i = 0; i < steps; i++) { await p.mouse.wheel(0, dy / steps); await sleep(gap); } }
export const noLoading = (p, ms = 90000) => p.waitForFunction(() => !/불러오는 중/.test(document.body?.innerText || ''), null, { timeout: ms, polling: 150 }).catch(() => {});
