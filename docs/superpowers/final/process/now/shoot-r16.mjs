/* 바퀴 16 now 그림 — 바깥 주소 로그인 폼(역할마다 한 번: staff · admin · gov(남원) · ov(해외)). 비밀번호는 server/.env(출력·기록 안 함).
   node shoot-r16.mjs <출력폴더> <staff|admin|gov|ov> [장면,장면]   → <출력폴더>/*.png(끝 네 자리 = 찍은 시각) · log-<역할>.json
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


/* ───────── 직원(XI맵 · 지도 서비스) ───────── */
async function staff() {
  await frontDoor(p, APP, 'test@lx.or.kr', 'app');
  await p.waitForURL((u) => !/\/login\/?$/.test(u.pathname), { timeout: 30000 }); LOG._logins++; LOG.login_at = kst(); save();

  await scene('hud', async () => {
    await homeX(APP);
    LOG.hud = await p.evaluate(() => document.querySelector('.xb-hud')?.innerText.replace(/\s+/g, ' ').trim());
    await shot('now-xi-hud-national');
    await p.locator('.xb-hud').click();
    await wf(() => document.querySelectorAll('.xc-board-svc').length > 0, null, 30000); await sleep(900);
    LOG.list = await p.evaluate(() => ({ title: document.querySelector('.k-dr-h')?.innerText.replace(/\s+/g, ' ').trim(), sido: document.querySelectorAll('.xc-board-sido').length, rows: document.querySelectorAll('.xc-board-svc').length, open: [...document.querySelectorAll('.xc-board-sido')].map((b) => b.getAttribute('aria-expanded')) }));
    await shot('now-xi-list');
    const first = p.locator('.xc-board-svc').first();
    LOG.svcName = (await first.innerText()).replace(/\s+/g, ' ');
    await first.click(); await sleep(2500); await settle(); await sleep(2500);
    LOG.afterService = await p.evaluate(() => document.querySelector('.xb-hud')?.innerText.replace(/\s+/g, ' ').trim());
    await shot('now-xi-service-on');
    await p.locator('.xc-board-svc[aria-current="true"]').first().click().catch(() => {}); await sleep(1500);
  });

  await scene('input', async () => {
    await homeX(APP);
    LOG.inputs = await p.evaluate(() => ({ topSearch: !!document.querySelector('.xc-q') && !!document.querySelector('.xc-q').offsetParent, ph: document.querySelector('.k-chat-root[data-dock] .k-ck-i')?.placeholder }));
    await shot('now-xi-input');
    const t = Date.now(); await say('남원시');
    await wf(() => /남원/.test(document.querySelector('.xb-hud')?.innerText || ''), null, 20000); LOG.sggMs = Date.now() - t;
    await settle(); await sleep(1500);
    LOG.hudRegion = await p.evaluate(() => document.querySelector('.xb-hud')?.innerText.replace(/\s+/g, ' ').trim());
    await shot('now-xi-hud-region');
  });

  await scene('stats', async () => {
    await homeX(APP, '?test=1');
    const ok = await ask('남원시 비닐하우스 어디가 많아?'); LOG.askOk = ok;
    await shot('now-xi-stats-step1');
    await p.locator('.xo-mini-b').click(); await waitStep(2); await sleep(1500);
    await shot('now-xi-stats-dots');
    const hb = p.locator('.pn-h--left');
    if (await hb.count()) { await hb.hover(); await sleep(500); await shot('now-xi-handle-hover'); await p.locator('.pn-h--left .pn-fold').click().catch(() => {}); await waitStep(1, 8000); await sleep(700); await shot('now-xi-folded'); }
  });

  await scene('narrow', async () => {
    await p.setViewportSize({ width: 1366, height: 768 });
    await homeX(APP, '?test=1');
    await ask('남원시 비닐하우스 어디가 많아?');
    LOG.narrowStep = await p.evaluate(() => window.__xc.statStep);
    await shot('now-xi-narrow-step1');
    await p.locator('.xo-mini-b').click(); await waitStep(2); await sleep(1500);
    LOG.narrowW = await p.evaluate(() => Math.round(document.querySelector('.xo')?.getBoundingClientRect().width || 0));
    await shot('now-xi-narrow-step2');
    await say('고성'); await sleep(2500);
    LOG.chips = await p.evaluate(() => [...document.querySelectorAll('.k-chat-pick')].map((b) => b.innerText.trim()));
    await shot('now-xi-choices');
    await p.setViewportSize({ width: 1920, height: 1080 });
  });

  await scene('cad', async () => {
    await homeX(APP);
    await jump(PLACES.namwon[0], 15.2);
    await layersPop(true);
    LOG.layerRows = await p.evaluate(() => [...document.querySelectorAll('.xc-pop .xc-row')].map((b) => b.innerText.trim()).filter(Boolean));
    await shot('now-xi-layers');
    LOG.namwon = await place('namwon', 'now-staff');
  });
  await scene('newbld', async () => {
    await homeX(APP);
    await jump([127.3486, 35.5279], 15.5);
    await layersPop(true); await sleep(700);
    LOG.classNames = await p.evaluate(() => [...document.querySelectorAll('.xc-pop .xc-row--cls[data-cls]')].map((b) => [b.dataset.cls, b.innerText.trim()]));
    await shot('now-xi-class-names');
    await layersPop(false);
  });
  await scene('kg', async () => {
    await p.goto(`${APP}${V}xi-clean/?nation=kg`, { waitUntil: 'commit' });
    await p.waitForFunction(() => window.__xc?.map && window.__xc.boot?.shown, null, { timeout: 90000, polling: 100 });
    await sleep(7000);
    const clickAt = async (lng, lat) => { const pt = await p.evaluate(([x, y]) => { const q = window.__xc.map.project([x, y]); const r = window.__xc.map.getCanvas().getBoundingClientRect(); return [r.left + q.x, r.top + q.y]; }, [lng, lat]); await p.mouse.click(pt[0], pt[1]); };
    await p.evaluate(() => window.__xc.map.jumpTo({ center: [74.6, 42.0], zoom: 6.6 })); await sleep(2500);
    await clickAt(74.35, 42.95); await sleep(5000);
    LOG.kgHud = await p.evaluate(() => document.querySelector('.xn-hud')?.innerText.replace(/\s+/g, ' ') || '');
    LOG.kgChips = await p.evaluate(() => [...document.querySelectorAll('.k-chat-sug button, .k-chat-chip, .k-chip, [class*="sug"] button')].map((b) => b.innerText.trim()).filter(Boolean).slice(0, 8));
    await shot('now-xi-kg-gun');
  });
  await scene('lxmap', async () => {
    await p.setViewportSize({ width: 1440, height: 900 });
    await p.goto(`${APP}${V}lx-map/`, { waitUntil: 'domcontentloaded' });
    await wf(() => window.__lm?.map, null, 90000); await settleM(); await sleep(3000);
    LOG.lmText = await p.evaluate(() => ({ hint: document.querySelector('.lm-hint')?.innerText || null, bn: document.querySelector('.lm-bn')?.innerText || null }));
    await shot('now-map-hints');
  });
}

/* ───────── 관리자 ───────── */
async function admin() {
  await frontDoor(p, ADMIN, 'lxadmin@lx.or.kr', 'admin');
  await p.waitForURL((u) => !/\/login\/?$/.test(u.pathname), { timeout: 30000 }); LOG._logins++; save();
  const calm = async () => { await wf(() => !/서버 응답이 늦습니다|불러오는 중/.test(document.body.innerText), null, 100000); };
  await scene('dash', async () => { await p.goto(`${ADMIN}${V}ops-core/`, { waitUntil: 'domcontentloaded' }); await sleep(1500); await calm(); await sleep(3500); LOG.legend = await p.evaluate(() => /적용 요청/.test(document.body.innerText)); await shot('now-admin-dash'); });
  await scene('infra', async () => {
    const t = Date.now();
    await p.goto(`${ADMIN}${V}ops-infra/`, { waitUntil: 'domcontentloaded' }); await sleep(1500); await calm(); LOG.infraSec = +((Date.now() - t) / 1000).toFixed(1); await sleep(2500);
    LOG.infraText = await p.evaluate(() => /측정 멈춤/.test(document.body.innerText));
    await shot('now-admin-infra');
  });
  await scene('tenants', async () => {
    await p.goto(`${ADMIN}${V}ops-infra/#/tenants`, { waitUntil: 'domcontentloaded' }); await sleep(1500); await calm(); await sleep(2500);
    LOG.tenantsText = await p.evaluate(() => ({ jg: /전남광주특별시/.test(document.body.innerText), bad: /통합/.test(document.body.innerText) }));
    await shot('now-admin-tenants');
  });
  await scene('deploys', async () => {
    const t = Date.now();
    await p.goto(`${ADMIN}${V}ops-infra/#/deploys`, { waitUntil: 'domcontentloaded' }); await sleep(1500); await calm(); await sleep(2500);
    LOG.deploysSec = +((Date.now() - t) / 1000).toFixed(1);
    LOG.deployNames = await p.evaluate(() => [...document.querySelectorAll('tr, li')].map((e) => e.innerText.replace(/\s+/g, ' ').trim()).filter((x) => /· (적용|기관에 공유)/.test(x)).slice(0, 6));
    await shot('now-admin-deploys');
  });
  await scene('shares', async () => {
    await p.goto(`${ADMIN}${V}ops-infra/#/deploys`, { waitUntil: 'domcontentloaded' }); await sleep(1500); await calm();
    await p.locator('a, button, [role=tab]', { hasText: /^\s*기관 공유/ }).first().click(); await sleep(3000); await calm(); await sleep(1500);
    LOG.sharesText = await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 900));
    await shot('now-admin-shares');
  });
}

/* ───────── 남원 기관 ───────── */
async function gov() {
  await frontDoor(p, ORG, 'lxadmin@lx.or.kr#namwon', 'gov');
  await p.waitForURL((u) => /\/landxi\/v3\/(?!gov-home\/|login\/)[a-z-]+\//.test(u.pathname), { timeout: 60000 }).catch(() => {}); LOG._logins++; LOG.login_at = kst(); save();
  await sleep(2500);
  await scene('ximap', async () => {
    await p.goto(`${ORG}${V}xi-clean/?service=card-farm`, { waitUntil: 'commit' });
    await p.waitForFunction(() => window.__xc?.boot?.shown && document.querySelector('.xb-hud') && !document.querySelector('.xb-hud').hidden, null, { timeout: 120000, polling: 150 });
    await settle(); await sleep(2500);
    LOG.hud = await p.evaluate(() => document.querySelector('.xb-hud')?.innerText.replace(/\s+/g, ' ').trim());
    await shot('now-gov-hud-line');
    await p.locator('.xb-hud').click();
    await wf(() => document.querySelectorAll('.xc-board-svc').length > 0, null, 30000); await sleep(900);
    LOG.list = await p.evaluate(() => ({ sido: document.querySelectorAll('.xc-board-sido').length, rows: document.querySelectorAll('.xc-board-svc').length }));
    await shot('now-gov-list');
    await p.locator('.xc-board-svc').first().click(); await sleep(2500); await settle(); await sleep(2000);
    await shot('now-gov-service-on');
  });
  await scene('report', async () => {
    await p.goto(`${ORG}${V}gov-report/?tab=report`, { waitUntil: 'domcontentloaded' }); await sleep(2000);
    await wf(() => !/서버 응답이 늦습니다|불러오는 중/.test(document.body.innerText), null, 60000); await sleep(3000);
    await shot('now-gov-report');
  });
}

/* ───────── 해외 기관 ───────── */
async function ov() {
  await frontDoor(p, OVS, 'lxadmin@lx.or.kr#kgz-agri', 'gov');
  await p.waitForURL((u) => /\/landxi\/v3\/(?!gov-home\/)[a-z-]+\//.test(u.pathname), { timeout: 60000 }).catch(() => {}); LOG._logins++; save();
  const ST = () => p.evaluate(() => { const big = document.querySelector('.gl-hud .k-big'); return { level: document.querySelector('.gl')?.dataset.level, state: document.body.dataset.state, big: big?.dataset.state || '', v: big?.dataset.v || '', label: big?.querySelector('.k-big-l')?.textContent || '' }; });
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
  await scene('register', async () => {
    if (!/\/global\//.test(p.url())) await p.goto(`${OVS}${V}global/`, { waitUntil: 'domcontentloaded' });
    await until((s) => s.state === 'ready', 60000); await sleep(1500);
    await p.locator('.gl-tab', { hasText: 'Register' }).click(); await sleep(1500);
    if (!(await p.locator('.gl-reg table, .gl-reg [data-row], .gl-reg li').count())) {
      await p.locator('.gl-reg input[type=file]').setInputFiles(path.join(ROOT, 'shots/r3/r3-global/kgz-agri-sample-register.csv'));
      await wf(() => !/Comparing/.test(document.querySelector('.gl-reg-up')?.textContent || ''), null, 30000);
    }
    await sleep(2200);
    LOG.register = await p.evaluate(() => document.querySelector('.gl-reg')?.innerText.replace(/\s+/g, ' ').slice(0, 1200));
    await shot('now-ov-register');
  });
  await scene('english', async () => {
    await p.goto(`${OVS}${V}global/`, { waitUntil: 'domcontentloaded' });
    await until((s) => s.state === 'ready', 60000); await sleep(1500);
    const askBtn = p.locator('.gl-ask:visible, button:has-text("XI ChatGEO"):visible, a:has-text("XI ChatGEO"):visible, [aria-label*="ChatGEO"]:visible').first();
    if (!(await p.locator('.k-ck-i:visible').count()) && (await askBtn.count())) await askBtn.click();
    const inp = p.locator('.k-ck-i:visible').first();
    await inp.fill('이식아타 경작지 넓이는?'); await inp.press('Enter'); await sleep(2000);
    LOG.english = await p.evaluate(() => /Please ask in English/.test(document.body.innerText));
    await shot('now-ov-english');
    await inp.fill('What is the AI cropland area of Ysyk-Ata?'); await inp.press('Enter'); await sleep(2000);
    await p.waitForFunction(() => document.querySelector('.k-chat')?.dataset.state !== 'busy', null, { timeout: 120000 }).catch(() => {}); await sleep(1500);
    LOG.englishAnswer = await p.evaluate(() => (document.body.innerText.match(/.*647\.6.*/) || [''])[0]);
    await shot('now-ov-english-answer');
  });
}

try {
  if (ROLE === 'staff') await staff(); else if (ROLE === 'admin') await admin(); else if (ROLE === 'gov') await gov(); else if (ROLE === 'ov') await ov();
} catch (e) { LOG.fatal = String(e?.stack || e).slice(0, 600); console.log('치명', LOG.fatal); }
save(); await browser.close();
console.log(JSON.stringify({ role: ROLE, failed: LOG._failed, errors: LOG.errors.length, bad: LOG.bad.length, logins: LOG._logins }));
