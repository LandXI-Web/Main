/* 해외 경작지 중심(10-18 원칙 289) 증거 — 바깥 주소 해외 기관 로그인 폼 한 번(세션 주입 없음). 비밀번호는 server/.env.
   node shoot.mjs <출력폴더> [tag]
   장면: 첫 화면(Season · 큰 숫자 · 범례) → 휠 가까이 두 번 → 나라 보기(경작지 면) → 좁은 화면(390) 첫 화면 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const ROOT = 'E:/Land-XI 플랫폼/01. 디자인';
const HW = 'C:/Users/User/AppData/Local/ms-playwright';
if (fs.existsSync(HW)) process.env.PLAYWRIGHT_BROWSERS_PATH = HW;
if (!process.env.DEV_PASSWORD) { const m = fs.readFileSync(path.join(ROOT, 'server/.env'), 'utf8').match(/^DEV_PASSWORD=(.*?)\s*$/m); if (m) process.env.DEV_PASSWORD = m[1].replace(/^"|"$/g, ''); }
process.env.LX_PW ||= process.env.DEV_PASSWORD;
const { chromium } = createRequire(path.join(ROOT, 'package.json'))('playwright');
const { frontDoor } = await import(pathToFileURL(path.join(ROOT, 'landxi/v3/kit/lint/forbidden.mjs')).href);
const OUT = process.argv[2]; fs.mkdirSync(OUT, { recursive: true });
const TAG = process.argv[3] || 'after';
const OVS = 'https://kgz-agri.land-xi.dev', V = '/landxi/v3/';
const kst = () => new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' });
const hm = () => kst().slice(11, 16).replace(':', '');
const LOG = { _failed: [], errors: [], bad: [] };
const LF = path.join(OUT, `log-ov-${TAG}.json`);
const save = () => fs.writeFileSync(LF, JSON.stringify(LOG, null, 1));
setTimeout(() => { LOG.timeout = true; save(); process.exit(2); }, 900000).unref();

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ko-KR' });
const p = await ctx.newPage();
p.on('console', (m) => { if (m.type() === 'error') LOG.errors.push(`${kst().slice(11)} ${m.text().slice(0, 200)}`); });
p.on('pageerror', (e) => LOG.errors.push(`${kst().slice(11)} pageerror ${String(e).slice(0, 200)}`));
p.on('response', (r) => { if (r.status() >= 400 && !/favicon/.test(r.url())) LOG.bad.push(`${kst().slice(11)} ${r.status()} ${r.url().replace(/[?#].*$/, '').slice(0, 140)}`); });
const sleep = (ms) => p.waitForTimeout(ms);
const shot = async (name) => { const f = `${name}-${TAG}-${hm()}.png`; await p.screenshot({ path: path.join(OUT, f), timeout: 20000 }); LOG[f] = kst(); save(); console.log('찍음', f); return f; };
async function scene(n, fn) { try { await fn(); } catch (e) { LOG._failed.push(n); console.log('실패', n, String(e).slice(0, 300)); } save(); }
const ST = () => p.evaluate(() => { const big = document.querySelector('.gl-hud .k-big'); const key = document.querySelector('.gl-key'); return { level: document.querySelector('.gl')?.dataset.level, state: document.body.dataset.state, big: big?.dataset.state || '', v: big?.dataset.v || '', text: big?.innerText?.replace(/\s+/g, ' ') || '', key: key && !key.hidden ? key.innerText : null }; });
const until = async (fn, ms = 40000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const s = await ST(); if (fn(s)) return s; } catch {} await sleep(250); } return ST(); };
const wheelIn = async (x, y, n) => { await p.mouse.move(x, y); for (let i = 0; i < n; i++) { await p.mouse.wheel(0, -300); await sleep(250); } await sleep(4500); };

try {
  await frontDoor(p, OVS, 'lxadmin@lx.or.kr#kgz-agri', 'gov');
  await p.waitForURL((u) => /\/landxi\/v3\/(?!gov-home\/)[a-z-]+\//.test(u.pathname), { timeout: 60000 }).catch(() => {}); LOG.login_at = kst(); save();
  await scene('first', async () => {
    if (!/\/global\//.test(p.url())) await p.goto(`${OVS}${V}global/`, { waitUntil: 'domcontentloaded' });
    const t0 = Date.now();
    await until((s) => s.state === 'ready', 60000); await until((s) => s.big === 'ok' || s.big === 'none', 120000);
    LOG.first_ms = Date.now() - t0; await sleep(3000);
    LOG.first = await ST();
    await shot('ov-first');
    await wheelIn(560, 300, 6); await shot('ov-near');
    await wheelIn(560, 300, 4); await shot('ov-nearer');
  });
  await scene('chat', async () => {
    await p.mouse.move(700, 450);
    const inp = p.locator('.k-ck-i:visible').first();
    if (!(await inp.count())) await p.locator('.gl-ask:visible, button:has-text("XI ChatGEO"):visible, [aria-label*="ChatGEO"]:visible').first().click({ timeout: 8000 });
    await inp.waitFor({ timeout: 8000 });
    await inp.fill('Ysyk-Ata cropland area'); await inp.press('Enter');
    await p.waitForFunction(() => { const box = [...document.querySelectorAll('.k-ck')].find((x) => x.getClientRects().length); const a = box?.querySelector('.k-ck-a'); return box && !box.dataset.busy && a && a.textContent.trim().length > 3 && !a.querySelector('.k-ck-dots'); }, null, { timeout: 120000 }).catch(() => {});
    await sleep(1500);
    LOG.chat = await p.evaluate(() => { const box = [...document.querySelectorAll('.k-ck')].find((x) => x.getClientRects().length); return (box?.querySelector('.k-ck-a')?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 400); });
    await shot('ov-chat'); await p.keyboard.press('Escape'); await sleep(800);
  });
  await scene('country', async () => {
    await p.locator('.gl-crumb', { hasText: 'Kyrgyzstan' }).first().click();
    await until((s) => s.level === 'country', 20000); await sleep(7000);
    await shot('ov-country');
  });
  await scene('mobile', async () => {
    await p.setViewportSize({ width: 390, height: 844 });
    await p.goto(`${OVS}${V}global/`, { waitUntil: 'domcontentloaded' });
    await until((s) => s.state === 'ready', 60000); await until((s) => s.big === 'ok' || s.big === 'none', 120000); await sleep(3000);
    LOG.mobile = await ST();
    await shot('ov-mobile');
  });
} catch (e) { LOG.fatal = String(e?.stack || e).slice(0, 600); console.log('치명', LOG.fatal); }
save(); await browser.close();
console.log(JSON.stringify({ failed: LOG._failed, errors: LOG.errors.length, bad: LOG.bad.length, first: LOG.first, mobile: LOG.mobile }));
