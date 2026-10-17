/* 바퀴 16 결정 항목 증거(지적 합침 · 새 건물 · 한 번만 셈 · 해외 큰 숫자) — 바깥 주소 로그인 폼(역할마다 한 번). 비밀번호는 server/.env.
   node shoot.mjs <출력폴더> <staff|gov|ov> [장면,장면] — 바퀴 15 now 촬영기(now/shoot-r15.mjs)의 도우미를 그대로 쓴다. */
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
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ko-KR' });
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


/* ───────── 직원(XI맵) ───────── */
async function staff() {
  await frontDoor(p, APP, 'test@lx.or.kr', 'app');
  await p.waitForURL((u) => !/\/login\/?$/.test(u.pathname), { timeout: 30000 }); LOG._logins++; LOG.login_at = kst(); save();
  await scene('cad', async () => {
    await homeX(APP);
    await jump(PLACES.namwon[0], 15.2);
    await layersPop(true);
    LOG.layerRows = await p.evaluate(() => [...document.querySelectorAll('.xc-pop .xc-row')].map((b) => b.innerText.trim()).filter(Boolean));
    await shot('r16-xi-layers');
    LOG.namwon = await place('namwon', 'r16-staff');
  });
  await scene('newbld', async () => {
    await homeX(APP);
    await jump([127.3486, 35.5279], 15.5);
    await layersPop(true); await sleep(700);
    LOG.classNames = await p.evaluate(() => [...document.querySelectorAll('.xc-pop .xc-row--cls[data-cls]')].map((b) => [b.dataset.cls, b.innerText.trim()]));
    await shot('r16-xi-class-names');
    await layersPop(false);
  });
}

/* ───────── 남원 기관(통계 · 보고서 숫자) ───────── */
async function gov() {
  await frontDoor(p, ORG, 'lxadmin@lx.or.kr#namwon', 'gov');
  await p.waitForURL((u) => /\/landxi\/v3\/(?!gov-home\/|login\/)[a-z-]+\//.test(u.pathname), { timeout: 60000 }).catch(() => {}); LOG._logins++; LOG.login_at = kst(); save();
  await sleep(2500);
  await scene('report', async () => {
    await p.goto(`${ORG}${V}gov-report/?tab=report`, { waitUntil: 'domcontentloaded' }); await sleep(2000);
    await wf(() => !/서버 응답이 늦습니다|불러오는 중/.test(document.body.innerText), null, 60000); await sleep(3000);
    LOG.reportText = await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 1500));
    await shot('r16-gov-report');
  });
  await scene('findings', async () => {
    await p.goto(`${ORG}${V}gov-report/`, { waitUntil: 'domcontentloaded' }); await sleep(2000);
    await wf(() => !/서버 응답이 늦습니다|불러오는 중/.test(document.body.innerText), null, 60000); await sleep(3000);
    LOG.findingsText = await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 2500));
    await shot('r16-gov-findings');
  });
}

/* ───────── 해외 기관 첫 화면 ───────── */
async function ov() {
  await frontDoor(p, OVS, 'lxadmin@lx.or.kr#kgz-agri', 'gov');
  await p.waitForURL((u) => /\/landxi\/v3\/(?!gov-home\/)[a-z-]+\//.test(u.pathname), { timeout: 60000 }).catch(() => {}); LOG._logins++; save();
  const ST = () => p.evaluate(() => { const big = document.querySelector('.gl-hud .k-big'); return { level: document.querySelector('.gl')?.dataset.level, state: document.body.dataset.state, big: big?.dataset.state || '', v: big?.dataset.v || '', label: big?.querySelector('.k-big-l')?.textContent || '', why: big?.querySelector('.k-sig')?.dataset.why || '' }; });
  const until = async (fn, ms = 40000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const s = await ST(); if (fn(s)) return s; } catch {} await sleep(200); } return ST(); };
  await scene('landing', async () => {
    if (!/\/global\//.test(p.url())) await p.goto(`${OVS}${V}global/`, { waitUntil: 'domcontentloaded' });
    await until((s) => s.state === 'ready', 60000); await until((s) => s.big === 'ok' || s.big === 'none', 90000); await sleep(1500);
    LOG.crop = await ST();
    await shot('r16-ov-crop-drop');
    await p.locator('.gl-tab', { hasText: 'Sprawl' }).click(); await sleep(2500);
    LOG.sprawl = await ST();
    await shot('r16-ov-sprawl');
  });
}

try {
  if (ROLE === 'staff') await staff(); else if (ROLE === 'gov') await gov(); else if (ROLE === 'ov') await ov();
} catch (e) { LOG.fatal = String(e?.stack || e).slice(0, 600); console.log('치명', LOG.fatal); }
save(); await browser.close();
console.log(JSON.stringify({ role: ROLE, failed: LOG._failed, errors: LOG.errors.length, bad: LOG.bad.length, logins: LOG._logins }));
