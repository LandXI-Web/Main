/* 바퀴 17 now 그림 — 바깥 주소 로그인 폼(역할마다 한 번: staff · admin · gov(남원) · ov(해외)). 비밀번호는 server/.env(출력·기록 안 함).
   node shoot-r17.mjs <출력폴더> <staff|admin|gov|ov> [장면,장면]   → <출력폴더>/*.png(끝 네 자리 = 찍은 시각) · log-<역할>.json
   XI맵(staff)은 1920 · 좁은 화면 장면은 1366 · 나머지 1440. */
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
const ROLE = process.argv[3];
const ONLYS = new Set((process.argv[4] || '').split(',').filter(Boolean));
const APP = 'https://app.land-xi.dev', ADMIN = 'https://admin.land-xi.dev', ORG = 'https://namwon.land-xi.dev', OVS = 'https://kgz-agri.land-xi.dev';
const V = '/landxi/v3/';
const kst = () => new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' });
const hm = () => kst().slice(11, 16).replace(':', '');
const LF = path.join(OUT, `log-${ROLE}.json`);
const LOG = fs.existsSync(LF) ? JSON.parse(fs.readFileSync(LF, 'utf8')) : {};
LOG._logins = (LOG._logins || 0); LOG._failed = []; LOG.errors = []; LOG.bad = [];
const save = () => fs.writeFileSync(LF, JSON.stringify(LOG, null, 1));
setTimeout(() => { LOG.timeout = true; save(); process.exit(2); }, 2400000).unref();

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: ROLE === 'staff' ? { width: 1920, height: 1080 } : { width: 1440, height: 900 }, locale: 'ko-KR' });
const p = await ctx.newPage();
p.on('console', (m) => { if (m.type() === 'error') LOG.errors.push(`${kst().slice(11)} ${m.text().slice(0, 200)}`); });
p.on('pageerror', (e) => LOG.errors.push(`${kst().slice(11)} pageerror ${String(e).slice(0, 200)}`));
p.on('response', (r) => { if (r.status() >= 400 && !/favicon/.test(r.url())) LOG.bad.push(`${kst().slice(11)} ${r.status()} ${r.url().replace(/[?#].*$/, '').slice(0, 140)}`); });
let CDP = null;
const shot = async (name) => {
  const f = `${name}-${hm()}.png`;
  for (const old of fs.readdirSync(OUT).filter((x) => new RegExp('^' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '-\\d{4}\\.png$').test(x))) fs.unlinkSync(path.join(OUT, old));
  try { await p.screenshot({ path: path.join(OUT, f), timeout: 15000 }); }
  catch { CDP ||= await ctx.newCDPSession(p); const r = await CDP.send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(OUT, f), Buffer.from(r.data, 'base64')); }
  LOG[f] = kst(); save(); console.log('찍음', f); return f;
};
async function scene(n, fn) {
  if (ONLYS.size && !ONLYS.has(n)) return;
  try { await fn(); } catch (e) { LOG._failed.push(n); console.log('실패', n, String(e).slice(0, 300).replace(/\n/g, ' ')); }
  save();
}
const sleep = (ms) => p.waitForTimeout(ms);
const wf = (fn, arg, to = 30000) => p.waitForFunction(fn, arg, { timeout: to, polling: 100 }).then(() => true, () => false);
const settle = () => p.waitForFunction(() => !window.__xc.map.isMoving() && window.__xc.map.areTilesLoaded(), null, { timeout: 30000 }).catch(() => {});
const settleM = () => p.waitForFunction(() => !window.__lm.map.isMoving() && window.__lm.map.areTilesLoaded(), null, { timeout: 30000 }).catch(() => {});
const readyX = (lx = true) => (lx) => window.__xc?.map && window.__xc.boot?.shown && (!lx || window.__xc?.board?.nat?.layers?.length > 0) && document.querySelector('.k-chat-root[data-dock]');
async function homeX(base, qs = '', lx = true) {
  await p.goto(`${base}${V}xi-clean/${qs}`, { waitUntil: 'commit' });
  await p.waitForFunction(readyX(), lx, { timeout: 120000, polling: 150 });
  await settle(); await sleep(1500);
}
async function jump(c, z) { await p.evaluate(([c, z]) => window.__xc.map.jumpTo({ center: c, zoom: z }), [c, z]); await sleep(700); await settle(); await sleep(1200); }
async function say(q) { const inp = p.locator('.k-chat-root[data-dock] .k-ck-i'); await inp.click(); await inp.fill(''); await inp.pressSequentially(q, { delay: 15 }); await inp.press('Enter'); }
const waitStep = (n, ms = 30000) => wf((n) => window.__xc.statStep === n && (n === 3 ? !document.querySelector('.xd').hidden : window.__xc.dash?.step === n), n, ms);
async function ask(q) {
  await p.evaluate(() => { window.__xc.dash = null; });
  await say(q);
  const ok = await wf(() => window.__xc.dash?.mode === 'map' && window.__xc.dash.fill === 'running', null, 90000);
  await wf(() => window.__xc.dash?.fill === 'done', null, 30000);
  await settle(); await sleep(1200);
  return ok;
}
async function layersPop(open = true, sel = '.xc-pop .xc-row--cls, .xc-pop [data-cad]') {
  const isOpen = await p.evaluate((sel) => !document.querySelector('.xc-pop')?.hidden && !!document.querySelector(sel), sel);
  if (isOpen !== open) await p.locator('.xc-tool[data-tool="layers"]').click();
  await sleep(500);
}
const cadState = () => p.evaluate(() => { const r = document.querySelector('.xc-pop [data-cad]'); return r ? { checked: r.getAttribute('aria-checked'), far: r.classList.contains('is-far'), zoom: +window.__xc.map.getZoom().toFixed(2) } : null; });
const cardState = () => p.evaluate(() => { const c = document.querySelector('.xp-card'); if (!c || c.hidden) return null; return { text: c.innerText.replace(/\s+/g, ' ').trim(), parcel: window.__xc.parcel }; });
async function scan(want = null, max = 3) {
  return p.evaluate(([want, max]) => {
    const m = window.__xc.map, W = m.getCanvas().clientWidth, H = m.getCanvas().clientHeight, objs = [], empty = [], pts = [];
    for (let y = 180; y < H - 200; y += 24) for (let x = 340; x < W - 420; x += 24) pts.push([x, y]);
    pts.sort((a, b) => Math.hypot(a[0] - W / 2, a[1] - H / 2) - Math.hypot(b[0] - W / 2, b[1] - H / 2));
    const r = m.getCanvas().getBoundingClientRect();
    for (const [x, y] of pts) {
      const o = window.__xc.objectsAt ? window.__xc.objectsAt(x, y) : [];
      if (o.length === 1 && objs.length < max && (!want || o[0].cls === want) && !objs.some((q) => Math.hypot(q[0] - x - r.left, q[1] - y - r.top) < 60)) objs.push([x + r.left, y + r.top, o[0].cls]);
      else if (!o.length && empty.length < 3) { const near = window.__xc.objectsAt ? [[-30, 0], [30, 0], [0, -30], [0, 30]].some(([dx, dy]) => window.__xc.objectsAt(x + dx, y + dy).length) : false; if (!near) empty.push([x + r.left, y + r.top]); }
      if (objs.length >= max && empty.length >= 3) break;
    }
    return { objs, empty };
  }, [want, max]);
}
const PLACES = { namwon: [[127.3786, 35.4153], [127.3905, 35.4086], [127.4180, 35.3990], [127.3480, 35.5277]], hamyang: [[127.7253, 35.5205], [127.7180, 35.5150], [127.7400, 35.5300]] };
async function place(key, who, { obj = true } = {}) {
  const out = {}; let sc = null;
  for (const c of PLACES[key]) { await jump(c, 17.6); sc = await scan(); if (!obj || sc.objs.length) break; }
  await layersPop(true);
  if ((await cadState())?.checked !== 'true') await p.locator('.xc-pop [data-cad]').click();
  await sleep(500); await settle(); await sleep(1500);
  out.cad = await cadState();
  await shot(`${who}-${key}-cad-on`);
  await layersPop(false);
  if (sc.empty[0]) {
    const [x, y] = sc.empty[0];
    await p.mouse.move(x, y); await sleep(250); await p.mouse.click(x, y);
    await wf(() => window.__xc.parcel || document.querySelector('.xp-card .xe-wait')?.textContent.includes('못'), null, 30000);
    await sleep(900);
    out.card = await cardState();
    await shot(`${who}-${key}-parcel-card`);
  }
  if (obj && sc.objs[0]) {
    await p.evaluate(() => { window.__xc.parcel = null; document.querySelector('.xp-card:not([hidden]) .xa-x')?.click(); });
    await sleep(300);
    const [x, y] = sc.objs[0];
    await p.mouse.move(x, y); await sleep(250); await p.mouse.click(x, y);
    await wf(() => document.querySelector('.xe-card:not(.xp-card):not([hidden]) .xe-pcl:not([hidden])'), null, 30000);
    await sleep(700);
    out.object = await p.evaluate(() => document.querySelector('.xe-card:not(.xp-card):not([hidden]) .xe-pcl')?.innerText || null);
    await shot(`${who}-${key}-object-parcel`);
    await p.keyboard.press('Escape');
    await p.evaluate(() => document.querySelector('.xe-card:not(.xp-card) .xa-x')?.click());
  }
  return out;
}


/* ───────── 직원 ───────── */
async function staff() {
  await frontDoor(p, APP, 'test@lx.or.kr', 'app');
  await p.waitForURL((u) => !/\/login\/?$/.test(u.pathname), { timeout: 30000 }); LOG._logins++; LOG.login_at = kst(); save();
  const calm = async () => { await wf(() => !/서버 응답이 늦습니다|불러오는 중/.test(document.body.innerText), null, 60000); };
  await scene('dash', async () => {
    await p.setViewportSize({ width: 1440, height: 900 });
    await p.goto(`${APP}${V}lx-console/`, { waitUntil: 'domcontentloaded' }); await sleep(1500); await calm(); await sleep(3500);
    await shot('now-dash-staff');
  });
  await scene('dashnew', async () => {
    for (const [w, h] of [[1920, 1080], [1366, 768], [1440, 900]]) {
      await p.setViewportSize({ width: w, height: h });
      await p.goto(`${APP}${V}lx-console/`, { waitUntil: 'domcontentloaded' }); await sleep(1500); await calm(); await sleep(3000);
      await shot(`now-dash-staff-${w}`);
    }
    await p.getByText('대시보드 수정하기').first().click(); await sleep(1500);
    await shot('now-dash-edit-1440');
    const pick = p.getByText('모양 고르기').first();
    if (await pick.count()) { await pick.click(); await sleep(1000); await shot('now-dash-shapes-1440'); const row = p.getByText(/한 줄/).first(); if (await row.count()) { await row.click(); await sleep(1500); await shot('now-dash-row3-1440'); } }
    await p.getByText('완료', { exact: true }).first().click().catch(() => {}); await sleep(800);
  });
  await scene('dashreset', async () => {
    await p.setViewportSize({ width: 1440, height: 900 });
    await p.goto(`${APP}${V}lx-console/`, { waitUntil: 'domcontentloaded' }); await sleep(1500); await calm(); await sleep(2500);
    await p.getByText('대시보드 수정하기').first().click(); await sleep(1000);
    await p.getByText('모양 고르기').first().click(); await sleep(800);
    await p.getByText('처음 모양', { exact: false }).first().click(); await sleep(1500);
    await p.getByText('완료', { exact: true }).first().click().catch(() => {}); await sleep(1000);
  });
  await scene('list', async () => {
    await p.setViewportSize({ width: 1440, height: 900 });
    await homeX(APP);
    await p.locator('.xb-hud').click(); await wf(() => document.querySelectorAll('.xc-bl').length > 0, null, 20000); await sleep(1200);
    await shot('now-xi-list-lvl1');
    LOG.lvl1 = await p.evaluate(() => document.querySelectorAll('.xc-bl').length);
    await p.locator('.xc-bl').first().click(); await sleep(1800);
    LOG.lvl2 = await p.evaluate(() => ({ crumb: !!document.querySelector('.xc-bc'), rows: document.querySelectorAll('.xc-bl').length, title: document.querySelector('.k-dr-t')?.innerText }));
    await shot('now-xi-list-lvl2');
    await p.locator('.xc-bl').first().click(); await wf(() => document.querySelectorAll('.xc-board-svc').length > 0, null, 30000); await sleep(1500);
    LOG.lvl3 = await p.evaluate(() => ({ svc: document.querySelectorAll('.xc-board-svc').length, title: document.querySelector('.k-dr-t')?.innerText }));
    await shot('now-xi-list-lvl3');
  });
  await scene('chat', async () => {
    await homeX(APP);
    const inp = p.locator('.k-chat-root[data-dock] .k-ck-i'); await inp.click(); await inp.fill(''); await inp.pressSequentially('남원시 ', { delay: 30 }); await sleep(1500);
    await shot('now-xi-chat-typing');
    await inp.fill(''); await inp.pressSequentially('남원시 죽항동 1', { delay: 30 }); await sleep(1500);
    await shot('now-xi-parcel-typing');
  });
  await scene('kg', async () => {
    await p.goto(`${APP}${V}xi-clean/?nation=kg`, { waitUntil: 'commit' });
    await p.waitForFunction(() => window.__xc?.map && window.__xc.boot?.shown, null, { timeout: 90000, polling: 100 });
    await sleep(7000);
    await p.evaluate(() => window.__xc.map.jumpTo({ center: [74.6, 42.0], zoom: 6.6 })); await sleep(3000);
    await shot('now-xi-kg-country');
  });
}

/* ───────── 관리자 ───────── */
async function admin() {
  await frontDoor(p, ADMIN, 'lxadmin@lx.or.kr', 'admin');
  await p.waitForURL((u) => !/\/login\/?$/.test(u.pathname), { timeout: 30000 }); LOG._logins++; save();
  const calm = async () => { await wf(() => !/서버 응답이 늦습니다|불러오는 중/.test(document.body.innerText), null, 100000); };
  await scene('dash', async () => { await p.goto(`${ADMIN}${V}ops-core/`, { waitUntil: 'domcontentloaded' }); await sleep(1500); await calm(); await sleep(3500); await shot('now-dash-admin'); });
  await scene('shares', async () => {
    await p.goto(`${ADMIN}${V}ops-infra/#/deploys`, { waitUntil: 'domcontentloaded' }); await sleep(1500); await calm();
    await p.locator('a, button, [role=tab]', { hasText: /^\s*기관 공유/ }).first().click(); await sleep(3000); await calm(); await sleep(1500);
    await shot('now-admin-shares');
  });
}

/* ───────── 남원 기관 ───────── */
async function gov() {
  await frontDoor(p, ORG, 'lxadmin@lx.or.kr#namwon', 'gov');
  await p.waitForURL((u) => /\/landxi\/v3\/(?!gov-home\/|login\/)[a-z-]+\//.test(u.pathname), { timeout: 60000 }).catch(() => {}); LOG._logins++; LOG.login_at = kst(); save();
  await sleep(2500);
  await scene('home', async () => { await sleep(1500); await wf(() => !/서버 응답이 늦습니다|불러오는 중/.test(document.body.innerText), null, 60000); await sleep(2500); await shot('now-dash-gov'); });
  await scene('request', async () => {
    await p.goto(`${ORG}${V}gov-request/`, { waitUntil: 'domcontentloaded' }); await sleep(2000);
    await wf(() => !/서버 응답이 늦습니다|불러오는 중/.test(document.body.innerText), null, 60000); await sleep(2500);
    await shot('now-gov-request');
  });
}

/* ───────── 해외 기관 ───────── */
async function ov() {
  await frontDoor(p, OVS, 'lxadmin@lx.or.kr#kgz-agri', 'gov');
  await p.waitForURL((u) => /\/landxi\/v3\/(?!gov-home\/)[a-z-]+\//.test(u.pathname), { timeout: 60000 }).catch(() => {}); LOG._logins++; save();
  const ST = () => p.evaluate(() => { const big = document.querySelector('.gl-hud .k-big'); return { state: document.body.dataset.state, big: big?.dataset.state || '', v: big?.dataset.v || '' }; });
  const until = async (fn, ms = 40000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const s = await ST(); if (fn(s)) return s; } catch {} await sleep(200); } return ST(); };
  await scene('landing', async () => {
    if (!/\/global\//.test(p.url())) await p.goto(`${OVS}${V}global/`, { waitUntil: 'domcontentloaded' });
    await until((s) => s.state === 'ready', 60000); await until((s) => s.big === 'ok' || s.big === 'none', 90000); await sleep(1500);
    LOG.crop = await ST();
    await shot('now-ov-crop-drop');
    await p.locator('.gl-tab', { hasText: 'Sprawl' }).click(); await sleep(2500);
    LOG.sprawl = await ST();
    await shot('now-ov-sprawl');
  });
  await scene('chips', async () => {
    const t = Date.now();
    await p.goto(`${OVS}${V}global/`, { waitUntil: 'domcontentloaded' });
    await until((s) => s.big === 'ok' || s.big === 'none', 90000); LOG.coldSec = +((Date.now() - t) / 1000).toFixed(1); await sleep(1200);
    await shot('now-ov-cold-first');
    const askBtn = p.locator('.gl-ask:visible, button:has-text("XI ChatGEO"):visible, a:has-text("XI ChatGEO"):visible, [aria-label*="ChatGEO"]:visible').first();
    if (!(await p.locator('.k-ck-i:visible').count()) && (await askBtn.count())) await askBtn.click();
    await p.waitForSelector('.k-chat-chip', { state: 'visible', timeout: 15000 }).catch(() => null); await sleep(800);
    LOG.chips = await p.locator('.k-chat-chip:visible').allInnerTexts().catch(() => []);
    await shot('now-ov-chips');
    await p.locator('.k-chat-chip:visible').first().click(); await sleep(2500);
    await p.waitForFunction(() => document.querySelector('.k-chat')?.dataset.state !== 'busy', null, { timeout: 120000 }).catch(() => {}); await sleep(1500);
    await shot('now-ov-chip-answer');
  });
}

try {
  if (ROLE === 'staff') await staff(); else if (ROLE === 'admin') await admin(); else if (ROLE === 'gov') await gov(); else if (ROLE === 'ov') await ov();
} catch (e) { LOG.fatal = String(e?.stack || e).slice(0, 600); console.log('치명', LOG.fatal); }
save(); await browser.close();
console.log(JSON.stringify({ role: ROLE, failed: LOG._failed, errors: LOG.errors.length, bad: LOG.bad.length, logins: LOG._logins }));
