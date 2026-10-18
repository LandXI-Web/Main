/* 바퀴 19 now 그림 — 바깥 주소 로그인 폼(역할마다 한 번: staff · admin · gov(남원) · ov(해외)). 비밀번호는 server/.env(출력·기록 안 함).
   node shoot-r19.mjs <출력폴더> <staff|admin|gov|ov> [장면,장면]   → <출력폴더>/*.png(끝 네 자리 = 찍은 시각) · log-<역할>.json
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


const ST_ = async (fn, ms = 30000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch {} await sleep(250); } return false; };
const clickT = async (label, ms = 20000) => { const ok = await ST_(() => p.evaluate((l) => [...document.querySelectorAll('button,a,[role=button],[role=tab]')].some((e) => e.getClientRects().length && (e.textContent || '').replace(/\s+/g, ' ').includes(l)), label), ms); if (!ok) return null; return p.evaluate((l) => { const c = [...document.querySelectorAll('button,a,[role=button],[role=tab]')].filter((e) => e.getClientRects().length && (e.textContent || '').replace(/\s+/g, ' ').includes(l)); c.sort((a, b) => a.textContent.length - b.textContent.length); c[0].click(); return c[0].textContent.replace(/\s+/g, ' ').trim().slice(0, 50); }, label); };
const wide = () => p.setViewportSize({ width: 1440, height: 900 });
const phone = () => p.setViewportSize({ width: 390, height: 844 });
const pct = () => p.evaluate(() => { const mr = document.querySelector('.k-main').getBoundingClientRect(); const rs = [document.querySelector('.xk-ans:not([hidden])'), document.querySelector('.k-chat-in')].filter(Boolean).map((e) => e.getBoundingClientRect()); const l = Math.min(...rs.map((r) => r.left)), tt = Math.min(...rs.map((r) => r.top)), r = Math.max(...rs.map((r) => r.right)), b = Math.max(...rs.map((r) => r.bottom)); return +(((r - l) * (b - tt)) / (mr.width * mr.height) * 100).toFixed(1); });
async function askBand() {
  await say('남원시 경작지 현황 보여 줘');
  await wf(() => document.querySelector('.xk-ans:not([hidden])'), null, 60000);
  await wf(() => !document.querySelector('.xk-ans.is-busy') && document.querySelector('.xk-ans:not([hidden]) .xk-ans-a button'), null, 90000);
  await settle(); await sleep(2500);
}

/* ───────── 직원 ───────── */
async function staff() {
  await frontDoor(p, APP, 'test@lx.or.kr', 'app');
  await p.waitForURL((u) => !/\/login\/?$/.test(u.pathname), { timeout: 30000 }); LOG._logins++; LOG.login_at = kst(); save();
  const calm = async () => { await wf(() => !/서버 응답이 늦습니다|불러오는 중/.test(document.body.innerText), null, 60000); };
  await scene('map', async () => {
    await wide(); await homeX(APP);
    LOG.credit = await p.evaluate(() => [...document.querySelectorAll('.k-credit')].filter((e) => !e.hidden && e.getClientRects().length).map((e) => e.textContent.trim()));
    await shot('now-xi-map');
  });
  await scene('list', async () => {
    await wide(); await homeX(APP);
    await p.locator('.xb-hud').click(); await sleep(1800);
    const sido = p.locator('.xc-sdc').first(); if (await sido.count()) { await sido.click(); await sleep(1500); }
    const sgg = p.locator('.xc-sgc').first(); if (await sgg.count()) { await sgg.click(); await sleep(2000); }
    LOG.chips = await p.evaluate(() => [...document.querySelectorAll('.xc-sgc')].slice(0, 6).map((e) => e.innerText.replace(/\n/g, ' | ')));
    await shot('now-xi-list-region');
    await p.reload({ waitUntil: 'commit' });
    await p.waitForFunction(readyX(), true, { timeout: 120000, polling: 150 }); await settle(); await sleep(1500);
    await p.locator('.xb-hud').click(); await sleep(2000);
    await p.locator('.xc-board-flip').click(); await sleep(1200);
    await p.locator('.xc-svr').first().click(); await sleep(1500);
    await shot('now-xi-list-svc');
    await p.reload({ waitUntil: 'commit' });
    await p.waitForFunction(readyX(), true, { timeout: 120000, polling: 150 }); await settle(); await sleep(1500);
    await p.locator('.xb-hud').click(); await sleep(2200);
    LOG.persist = await p.evaluate(() => ({ svcMode: !!document.querySelector('.xc-svrs'), flip: document.querySelector('.xc-board-flip')?.getAttribute('aria-pressed') }));
    await shot('now-xi-list-svc-kept');
    const fl = p.locator('.xc-board-flip'); if ((await fl.getAttribute('aria-pressed')) === 'true') await fl.click();
    await sleep(800);
  });
  await scene('chat', async () => {
    await wide(); await homeX(APP);
    const t = Date.now(); await askBand(); LOG.chatMs = Date.now() - t; LOG.chatPct = await pct();
    await shot('now-chat-answer-pc');
    const more = p.locator('.xk-more'); if (await more.count()) { await more.click(); await sleep(1200); await shot('now-chat-drawer-pc'); await p.keyboard.press('Escape'); await sleep(500); }
  });
  await scene('chatm', async () => {
    await phone(); await homeX(APP);
    await askBand(); LOG.chatPctM = await pct();
    await shot('now-chat-answer-m');
  });
  await scene('listm', async () => {
    await phone(); await homeX(APP);
    await p.locator('.xb-hud').click(); await sleep(2000);
    const inp = p.locator('.k-chat-root[data-dock] .k-ck-i');
    await inp.click({ timeout: 8000 }); await inp.fill('남원시 경작지 현황 보여 줘'); await sleep(500);
    LOG.listmTyped = await inp.inputValue();
    await shot('now-m-list-input');
  });
  await scene('cal', async () => {
    await wide();
    await p.goto(`${APP}${V}lx-console/`, { waitUntil: 'domcontentloaded' }); await sleep(2000); await calm(); await sleep(3500);
    LOG.cal = await p.evaluate(() => ({ label: document.querySelector('.ld-cal-l')?.textContent, hols: [...document.querySelectorAll('.is-hol')].map((e) => (e.getAttribute('title') || '') + '|' + e.innerText.split('\n').join(' ').trim().slice(0, 30)) }));
    const setView = async (label) => { await p.getByText('대시보드 수정하기').first().click(); await sleep(1000); await p.locator('button.dg-v').filter({ hasText: new RegExp('^\s*' + label + '\s*$') }).first().click({ force: true, timeout: 10000 }); await sleep(1200); await p.getByText('완료', { exact: true }).first().click().catch(() => {}); await sleep(1500); };
    await setView('월'); await calm(); await sleep(2500);
    LOG.cal = await p.evaluate(() => ({ label: document.querySelector('.ld-cal-l')?.textContent, hols: [...document.querySelectorAll('.is-hol')].map((e) => (e.getAttribute('title') || '') + '|' + e.innerText.split('|').join(' ').trim().slice(0, 30)) }));
    const h = p.locator('.ld-cal-d.is-hol[title]').first();
    if (await h.count()) { await h.scrollIntoViewIfNeeded().catch(() => {}); await h.hover().catch(() => {}); await sleep(900); }
    await p.setViewportSize({ width: 1440, height: 1250 }); await sleep(1200);
    const hh = p.locator('.ld-cal-d.is-hol[title]').first(); if (await hh.count()) { await hh.hover().catch(() => {}); await sleep(600); }
    await shot('now-cal');
    await wide();
    await setView('자동');
  });
}

/* ───────── 관리자 ───────── */
async function admin() {
  await frontDoor(p, ADMIN, 'lxadmin@lx.or.kr', 'admin');
  await p.waitForURL((u) => !/\/login\/?$/.test(u.pathname), { timeout: 30000 }); LOG._logins++; save();
  const calm = async () => { await wf(() => !/서버 응답이 늦습니다|불러오는 중/.test(document.body.innerText), null, 100000); };
  await scene('infra', async () => {
    await p.goto(`${ADMIN}${V}ops-infra/`, { waitUntil: 'domcontentloaded' }); await sleep(2000); await calm(); await sleep(2500);
    await shot('now-admin-infra');
  });
}

/* ───────── 남원 기관 ───────── */
async function gov() {
  await frontDoor(p, ORG, 'lxadmin@lx.or.kr#namwon', 'gov');
  await p.waitForURL((u) => /\/landxi\/v3\/(?!gov-home\/|login\/)[a-z-]+\//.test(u.pathname), { timeout: 60000 }).catch(() => {}); LOG._logins++; LOG.login_at = kst(); save();
  await sleep(2500);
  const calm = async () => { await sleep(2000); await wf(() => !/서버 응답이 늦습니다|불러오는 중/.test(document.body.innerText), null, 60000); await sleep(2500); };
  const go = async (u) => { await p.goto(`${ORG}${V}${u}`, { waitUntil: 'domcontentloaded' }); await calm(); };
  const dl = []; p.on('download', (d) => { dl.push(d.suggestedFilename()); d.cancel().catch(() => {}); });
  const openFeed = async () => {
    await go('gov-fusion/?service=card-farm');
    await clickT('행정정보 목록');
    await ST_(() => p.evaluate(() => document.body.innerText.includes('사료작물 재배 신청')), 30000); await sleep(1000);
  };
  const openSample = async () => {
    await openFeed();
    LOG.feedClick = await clickT('사료작물_재배신청_예시');
    await ST_(() => p.evaluate(() => /맞음|다름/.test(document.body.innerText)), 40000); await sleep(2000);
  };
  await scene('ledgers', async () => { await wide(); await openFeed(); await shot('now-gov-ledger-list'); });
  await scene('feed', async () => {
    await wide(); await openSample();
    await shot('now-gov-feed-top');
    LOG.feedMarks = await p.evaluate(() => { const t = document.body.innerText; return { match: (t.match(/맞음/g) || []).length, diff: (t.match(/다름/g) || []).length }; });
    const hit = p.getByText(/1개당 무게/).first();
    if (await hit.count()) { await hit.scrollIntoViewIfNeeded().catch(() => {}); await sleep(900); }
    LOG.bale = await p.evaluate(() => { const h = [...document.querySelectorAll('label,p,span,div,dt,th')].find((e) => e.childElementCount === 0 && /1개당/.test(e.textContent || '')); const i = h && (h.closest('label,div,section,form,li,tr') || document).querySelector('input'); return h ? { label: h.textContent.trim().slice(0, 60), value: i ? i.value : null } : null; });
    await shot('now-gov-bale');
  });
  await scene('pledge', async () => {
    await wide(); await openSample();
    LOG.pledgeClick = await clickT('엑셀로 내려받기'); await sleep(1800);
    const dlg = p.locator('[role=dialog]:visible, dialog[open]').first();
    LOG.pledgeDialog = (await dlg.count()) ? (await dlg.innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 300) : null;
    await shot('now-gov-pledge');
    if (await dlg.count()) { const cb = dlg.locator('button').filter({ hasText: /^\s*(취소|닫기)\s*$/ }).first(); if (await cb.count()) await cb.click(); else await p.keyboard.press('Escape'); await sleep(600); }
    LOG.pledgeDownloads = dl.slice();
  });
  await scene('accounts', async () => {
    await wide(); await go('gov-accounts/');
    await p.getByRole('tab', { name: '계정', exact: true }).click({ timeout: 10000 }); await sleep(1800);
    LOG.pos = await p.evaluate(() => [...document.querySelectorAll('th')].filter((e) => e.getClientRects().length).map((e) => e.innerText.trim()));
    await shot('now-gov-accounts');
  });
  await scene('stats', async () => {
    await wide(); await go('gov-select/?service=card-farm&tab=stats');
    await p.setViewportSize({ width: 1440, height: 1300 }); await sleep(800);
    await clickT('종류별', 4000); await sleep(1200);
    LOG.statsBtn = await p.evaluate(() => [...document.querySelectorAll('button,a')].filter((e) => e.getClientRects().length && /내려받기/.test(e.textContent)).map((e) => e.textContent.replace(/\s+/g, ' ').trim() + '|' + (e.title || '')));
    const cb = p.getByText(/CSV 파일로 내려받기/).first(); if (await cb.count()) { await cb.scrollIntoViewIfNeeded().catch(() => {}); await cb.hover().catch(() => {}); await sleep(800); }
    await shot('now-gov-stats');
    await wide();
  });
}

/* ───────── 해외 기관 ───────── */
async function ov() {
  await frontDoor(p, OVS, 'lxadmin@lx.or.kr#kgz-agri', 'gov');
  await p.waitForURL((u) => /\/landxi\/v3\/(?!gov-home\/)[a-z-]+\//.test(u.pathname), { timeout: 60000 }).catch(() => {}); LOG._logins++; save();
  const ST = () => p.evaluate(() => { const big = document.querySelector('.gl-hud .k-big'); return { level: document.querySelector('.gl')?.dataset.level, state: document.body.dataset.state, big: big?.dataset.state || '', v: big?.dataset.v || '', text: big?.innerText?.replace(/\s+/g, ' ') || '', key: document.querySelector('.gl-key')?.innerText?.replace(/\s+/g, ' ') || '' }; });
  const until = async (fn, ms = 40000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const s = await ST(); if (fn(s)) return s; } catch {} await sleep(250); } return ST(); };
  await scene('gun', async () => {
    await wide();
    if (!/\/global\//.test(p.url())) await p.goto(`${OVS}${V}global/`, { waitUntil: 'domcontentloaded' });
    await until((s) => s.state === 'ready', 90000); await until((s) => s.big === 'ok' || s.big === 'none', 120000); await sleep(3500);
    LOG.gun = await ST(); await shot('now-ov-gun');
    const bb = await p.locator('canvas').first().boundingBox();
    if (bb) { await p.mouse.move(bb.x + bb.width * 0.4, bb.y + bb.height * 0.45); for (let i = 0; i < 10; i++) { await p.mouse.wheel(0, -300); await sleep(300); } await sleep(5000); }
    LOG.close = await ST(); await shot('now-ov-close');
  });
  await scene('country', async () => {
    await wide();
    await p.goto(`${OVS}${V}global/`, { waitUntil: 'domcontentloaded' });
    await until((s) => s.big === 'ok' || s.big === 'none', 120000);
    await p.locator('.gl-crumb', { hasText: 'Kyrgyzstan' }).first().click();
    await until((s) => s.level === 'country', 30000); await sleep(8000);
    LOG.country = await ST(); await shot('now-ov-country');
  });
}

/* ───────── 시안(손으로 만든 모양 · 파일에서 바로) ───────── */
async function sian() {
  const D = path.join(ROOT, 'docs/superpowers/final/process/impl-45/farm/sian');
  for (const [k, f] of [['a', 'sian-q4-a.html'], ['b', 'sian-q4-b.html']]) {
    await p.setViewportSize({ width: 1440, height: 900 });
    await p.goto(pathToFileURL(path.join(D, f)).href, { waitUntil: 'load' }); await sleep(1200);
    await shot(`sian-report-${k}-pc`);
    await p.setViewportSize({ width: 390, height: 844 }); await sleep(600);
    await shot(`sian-report-${k}-m`);
  }
}

try {
  if (ROLE === 'staff') await staff(); else if (ROLE === 'admin') await admin(); else if (ROLE === 'gov') await gov(); else if (ROLE === 'ov') await ov(); else if (ROLE === 'sian') await sian();
} catch (e) { LOG.fatal = String(e?.stack || e).slice(0, 600); console.log('치명', LOG.fatal); }
save(); await browser.close();
console.log(JSON.stringify({ role: ROLE, failed: LOG._failed, errors: LOG.errors.length, bad: LOG.bad.length, logins: LOG._logins }));
