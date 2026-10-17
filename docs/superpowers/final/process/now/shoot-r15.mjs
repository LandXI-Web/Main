/* 바퀴 15 now 그림 — 바깥 주소 로그인 폼(역할마다 한 번: staff · admin · gov(남원) · ov(해외)). PC 1440. 비밀번호는 server/.env.
   node shoot-r15.mjs <출력폴더> <staff|admin|gov|ov> [장면,장면]   → <출력폴더>/*.png(끝 네 자리 = 찍은 시각) · log.json
   장면마다 try/catch — 실패한 장면은 log.json 의 _failed 에 적고 다음으로 간다. */
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

/* ───────── 직원 ───────── */
async function staff() {
  await frontDoor(p, APP, 'test@lx.or.kr', 'app');
  await p.waitForURL((u) => !/\/login\/?$/.test(u.pathname), { timeout: 30000 }); LOG._logins++; LOG.login_at = kst(); save();

  await scene('dash', async () => {
    await p.goto(`${APP}${V}lx-console/`, { waitUntil: 'commit' });
    await p.waitForFunction(() => document.documentElement.dataset.consoleReady === '1', null, { timeout: 90000 });
    await sleep(3000);
    await shot('now-staff-dash');
  });

  await scene('steps', async () => {
    await homeX(APP, '?test=1');
    LOG.home = await p.evaluate(() => ({ bubbles: [...document.querySelectorAll('.xs-c-bub span')].map((s) => s.textContent), hudVariantSwitch: !!document.querySelector('.xv-sw:not([hidden])') }));
    await shot('now-xi-home');
    const big = p.locator('.xb-hud .xb-big');
    if (await big.count()) { await big.hover(); await sleep(600); await shot('now-xi-hover-big'); await p.mouse.move(700, 500); }
    const ok = await ask('남원시 비닐하우스 현황 보여줘'); LOG.q1ok = ok;
    LOG.s1 = await p.evaluate(() => ({ title: window.__xc.dash?.title, main: window.__xc.dash?.main, mini: document.querySelector('.xo-mini')?.innerText.replace(/\s+/g, ' ').trim(), sw: [...document.querySelectorAll('.xo-sw button')].map((b) => [b.textContent, b.getAttribute('aria-pressed')]) }));
    await shot('now-xi-s1');
    await p.locator('.xo-mini-b').click(); await waitStep(2); await sleep(1000);
    await shot('now-xi-s2');
    // 칸 끌기 — 판 왼쪽 가장자리
    const w0 = await p.evaluate(() => Math.round(document.querySelector('.xo')?.getBoundingClientRect().width || 0));
    const hb = await p.locator('.pn-h--left').boundingBox();
    if (hb) { const x = hb.x + hb.width / 2, y = hb.y + hb.height / 2; await p.mouse.move(x, y); await p.mouse.down(); await p.mouse.move(x - 60, y, { steps: 6 }); await p.mouse.move(x - 160, y, { steps: 8 }); await p.mouse.up(); }
    await sleep(700);
    const w1 = await p.evaluate(() => Math.round(document.querySelector('.xo')?.getBoundingClientRect().width || 0));
    LOG.panel = { before: w0, after: w1 };
    await shot('now-xi-pane-after');
    await p.locator('.pn-h--left .pn-fold').hover(); await p.locator('.pn-h--left .pn-fold').click(); await waitStep(1, 8000); await sleep(500);
    await shot('now-xi-pane-folded');
    await p.locator('.pn-h--left .pn-fold').click(); await waitStep(2, 8000); await sleep(500);
    await p.locator('.xo-big2').click(); await waitStep(3); await sleep(1600);
    const m0 = await p.evaluate(() => Math.round(document.querySelector('.xc-stage')?.getBoundingClientRect().width || 0));
    await shot('now-xi-s3');
    const hd = await p.locator('.pn-h--right').boundingBox();
    if (hd) { const x = hd.x + hd.width / 2, y = hd.y + hd.height / 2; await p.mouse.move(x, y); await p.mouse.down(); await p.mouse.move(x + 80, y, { steps: 6 }); await p.mouse.move(x + 220, y, { steps: 8 }); await p.mouse.up(); }
    await sleep(900);
    LOG.dash = { before: m0, after: await p.evaluate(() => Math.round(document.querySelector('.xc-stage')?.getBoundingClientRect().width || 0)) };
    await shot('now-xi-pane-dash-after');
    await p.locator('.xd-back').click(); await waitStep(2); await sleep(700);
    // 통계 단추
    await p.locator('.xo-only').click(); await waitStep(1); await sleep(500);
    LOG.swHidden = await p.evaluate(() => document.querySelector('.xo-sw')?.hidden);
    await p.locator('.xo-mini .xo-x').click().catch(() => {}); await sleep(800);
  });

  await scene('density', async () => {
    await homeX(APP);
    const ok = await ask('남원시 비닐하우스 어디가 많아?'); LOG.densityOk = ok;
    await wf(() => window.__xc.dash?.tour !== undefined, null, 20000); await sleep(3500); await settle();
    await shot('now-xi-density');
    await p.locator('.xo-mini .xo-x, .xo .xo-x').first().click().catch(() => {}); await sleep(600);
  });

  await scene('objects', async () => {
    await homeX(APP, '?test=1');
    await p.evaluate(() => { const c = window.__xc.board?.hot; if (c) window.__xc.map.jumpTo({ center: c, zoom: 14.6 }); });
    await settle(); await sleep(2500);
    const sc = await p.evaluate(() => {
      const cv = window.__xc.map.getCanvas().getBoundingClientRect(); const out = { one: null, many: null };
      for (let y = 120; y < cv.height - 140 && !(out.one && out.many); y += 18) for (let x = 480; x < cv.width - 140; x += 18) { const hs = window.__xc.objectsAt(x, y); if (!hs.length) continue; if (hs.length >= 2 && !out.many) out.many = { x: x + cv.left, y: y + cv.top, hs }; if (hs.length === 1 && !out.one) out.one = { x: x + cv.left, y: y + cv.top, hs }; if (out.one && out.many) break; }
      return out;
    });
    LOG.scan = { one: sc.one?.hs, many: sc.many?.hs };
    await p.mouse.move(60, 460); await sleep(350);
    LOG.cursorEmpty = await p.evaluate(() => getComputedStyle(window.__xc.map.getCanvas()).cursor);
    if (sc.one) { await p.mouse.move(sc.one.x, sc.one.y); await sleep(400); LOG.cursorObject = await p.evaluate(() => window.__xc.map.getCanvas().style.cursor); await shot('now-xi-obj-pointer'); }
    if (sc.many) {
      await p.mouse.move(sc.many.x, sc.many.y); await sleep(400); await shot('now-xi-overlap-hover');
      await p.mouse.click(sc.many.x, sc.many.y); await sleep(500);
      LOG.picker = await p.evaluate(() => [...document.querySelectorAll('.xe-pick-r')].map((b) => b.innerText.replace(/\s+/g, ' ').trim()));
      await shot('now-xi-overlap-pick');
      await p.locator('.xe-pick-r').first().click(); await sleep(1300);
      await shot('now-xi-overlap-picked');
      await p.keyboard.press('Escape'); await sleep(300);
    }
    const at = sc.one || sc.many;
    if (at) {
      await p.mouse.click(at.x, at.y); await sleep(1500);
      const btn = p.locator('.xe-card .xe-act button', { hasText: '클래스 바꾸기' });
      if (await btn.count()) {
        await btn.click(); await sleep(1500);
        const chip = p.locator('.xe-card .xe-chip').first();
        if (await chip.count()) {
          await chip.click();
          await wf(() => (window.__xc.map.getSource('xe-live')?._data?.features || []).some((f) => f.properties.action === 'reclass'), null, 20000);
          await sleep(1300);
          LOG.reclass = await p.evaluate(() => { const f = (window.__xc.map.getSource('xe-live')?._data?.features || []).find((f) => f.properties.action === 'reclass'); return { col: f?.properties.col, cls: document.querySelector('.xe-card:not([hidden]) h3')?.textContent }; });
          await shot('now-xi-reclass-color');
          const undo = p.locator('.xe-card .xe-undo').first();
          if (await undo.count()) { await undo.click(); await sleep(1500); LOG.reclassUndone = await p.evaluate(() => (window.__xc.map.getSource('xe-live')?._data?.features || []).filter((f) => f.properties.action === 'reclass').length); }
        }
      }
      await p.keyboard.press('Escape');
    }
  });

  await scene('classes', async () => {
    await homeX(APP);
    await p.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('lx.colors.v1.')) localStorage.removeItem(k); });
    await homeX(APP);
    await jump([127.3905, 35.4086], 15.2);
    await layersPop(true);
    LOG.classes = await p.evaluate(() => [...document.querySelectorAll('.xc-pop .xc-cdot')].map((b) => b.dataset.cls));
    await shot('now-xi-layers');
    const target = LOG.classes.find((c) => c === '비닐하우스') || LOG.classes[0];
    await p.locator(`.xc-pop .xc-cdot[data-cls="${target}"]`).click(); await sleep(500);
    await shot('now-xi-color-open');
    await p.locator(`.kc-row[data-k="${target}"] .kc-sw[title="#7C5CFA"]`).click(); await sleep(500); await settle(); await sleep(900);
    await shot('now-xi-color-purple');
    await p.keyboard.press('Escape'); await sleep(300);
    // 기본 색으로
    await p.locator(`.xc-pop .xc-cdot[data-cls="${target}"]`).click().catch(() => {}); await sleep(400);
    await p.locator('.kc-reset').click().catch(() => {}); await sleep(700);
    await p.keyboard.press('Escape'); await sleep(300);
    // 클래스 끄기
    await jump([127.3905, 35.4086], 12.4);
    await layersPop(true);
    const first = p.locator('.xc-row--cls').first();
    if (await first.count()) {
      LOG.offCls = await first.getAttribute('data-cls');
      await first.click(); await sleep(1300);
      LOG.hudOff = await p.evaluate(() => document.querySelector('.xb-hud')?.innerText.replace(/\s+/g, ' ').trim());
      await shot('now-xi-cls-off');
      await first.click(); await sleep(700);
    }
    await p.keyboard.press('Escape');
  });

  await scene('parcel', async () => {
    await homeX(APP);
    await jump(PLACES.namwon[0], 15.2);
    await layersPop(true);
    if ((await cadState())?.checked !== 'true') await p.locator('.xc-pop [data-cad]').click();
    await sleep(500); LOG.cadFar = await cadState();
    await shot('now-xi-cad-far');
    await p.locator('.xc-pop [data-cad]').click(); await layersPop(false);
    LOG.namwon = await place('namwon', 'now-staff');
    LOG.hamyang = await place('hamyang', 'now-staff');
    // 변화 탐지 이름
    await jump([127.3486, 35.5279], 15.5);
    await layersPop(true); await sleep(700);
    LOG.classNames = await p.evaluate(() => [...document.querySelectorAll('.xc-pop .xc-row--cls[data-cls]')].map((b) => [b.dataset.cls, b.innerText.trim()]));
    await shot('now-xi-class-names');
    await layersPop(false);
    // 끈 클래스 → 지도 위 통계
    await jump([127.39, 35.41], 11);
    await ask('남원시 현황 보여 줘');
    LOG.statAll = await p.evaluate(() => ({ main: window.__xc.dash?.main, title: window.__xc.dash?.title }));
    await shot('now-xi-stat-all');
    await p.locator('.xo-mini .xo-x, .xo .xo-x').first().click().catch(() => {}); await sleep(500);
    await layersPop(true);
    LOG.offName = await p.evaluate(() => { const r = [...document.querySelectorAll('.xc-pop .xc-row--cls[data-cls]')].find((b) => b.dataset.cls === '건물') || document.querySelector('.xc-pop .xc-row--cls[data-cls]'); r?.click(); return r?.dataset.cls || null; });
    await sleep(600); await layersPop(false);
    await ask('남원시 현황 보여 줘');
    LOG.statOff = await p.evaluate(() => ({ main: window.__xc.dash?.main, vis: document.body.innerText.includes('보이는 것 기준') }));
    await shot('now-xi-stat-off');
  });

  await scene('kg', async () => {
    await p.goto(`${APP}${V}xi-clean/?nation=kg`, { waitUntil: 'commit' });
    await p.waitForFunction(() => window.__xc?.map && window.__xc.boot?.shown, null, { timeout: 90000, polling: 100 });
    await sleep(7000);
    LOG.kgHud = await p.evaluate(() => document.querySelector('.xn-hud')?.innerText.replace(/\s+/g, ' ') || '');
    await shot('now-xi-kg');
    const clickAt = async (lng, lat) => { const pt = await p.evaluate(([x, y]) => { const q = window.__xc.map.project([x, y]); const r = window.__xc.map.getCanvas().getBoundingClientRect(); return [r.left + q.x, r.top + q.y]; }, [lng, lat]); await p.mouse.click(pt[0], pt[1]); };
    await clickAt(76.6, 40.85); await sleep(4000);
    LOG.kgPublic = await p.evaluate(() => document.querySelector('.xn-hud')?.innerText.replace(/\s+/g, ' ') || '');
    await shot('now-xi-kg-public');
    await p.evaluate(() => window.__xc.map.jumpTo({ center: [74.6, 42.0], zoom: 6.6 })); await sleep(2500);
    await clickAt(74.35, 42.95); await sleep(5000);
    LOG.kgModel = await p.evaluate(() => document.querySelector('.xn-hud')?.innerText.replace(/\s+/g, ' ') || '');
    await shot('now-xi-kg-model');
  });

  /* 지도 서비스 */
  async function openMap() {
    await p.goto(`${APP}${V}lx-map/`, { waitUntil: 'commit' });
    await p.waitForSelector('body[data-ready="1"]', { timeout: 90000 });
    await settleM(); await sleep(1200);
  }
  async function expandAll() { for (let i = 0; i < 40; i++) { const g = p.locator('.lm-gt[aria-expanded="false"]').first(); if (!(await g.count())) break; await g.click(); await sleep(120); } }

  await scene('mapcolors', async () => {
    await openMap();
    await p.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('lx.colors.v1.')) localStorage.removeItem(k); });
    await openMap();
    const LS = await p.evaluate(() => window.__lm.layers());
    const usable = LS.filter((l) => !l.empty);
    const byReg = (r) => usable.filter((l) => l.region === r);
    const target = usable.filter((l) => l.cls.length > 1).sort((a, b) => byReg(b.region).length - byReg(a.region).length)[0] || usable[0];
    const job = target.job; LOG.mapTarget = { region: target.region, cls: target.cls };
    await expandAll();
    const rowOf = (j) => p.locator('.lm-ly li').filter({ has: p.locator(`.lm-cd[data-job="${j}"]`) });
    for (const l of LS.filter((l) => l.on && l.job !== job)) { await rowOf(l.job).locator('.lm-sw').click(); await sleep(400); }
    if (!LS.find((l) => l.job === job).on) await rowOf(job).locator('.lm-sw').click();
    await settleM(); await sleep(2000);
    await shot('now-map-default');
    await p.locator(`.lm-cd[data-job="${job}"]`).click(); await sleep(500);
    await wf(() => !/불러오는 중/.test(document.body.innerText), null, 40000); await sleep(1200);
    await shot('now-map-color-open');
    await p.locator('.kc-set[aria-label="색약 구분"]').click(); await sleep(700);
    if ((await p.locator('.kc-set').count()) > 0) { await p.locator('.kc-c').first().click(); await sleep(200); }
    await p.locator('.kc-grid .kc-sw[aria-label="#7C5CFA"]').first().click(); await sleep(700);
    await p.locator('.kc-op').evaluate((el) => { el.value = '40'; el.dispatchEvent(new Event('input', { bubbles: true })); }); await sleep(700);
    await p.locator('.kc-seg button', { hasText: '신뢰도' }).click(); await sleep(300);
    await p.locator('.kc-ramp[aria-label="색약 구분"]').click(); await sleep(300);
    await p.locator('.kc-seg button', { hasText: '단계' }).click(); await sleep(900);
    await shot('now-map-color-ramp');
    await p.locator('.kc-reset').click(); await sleep(800); await p.keyboard.press('Escape');
    // 객체 다루기 — 같은 지역 층 더 켜서 겹침 만들기
    await expandAll();
    for (const l of byReg(target.region).filter((l) => l.job !== job).slice(0, 2)) { const sw = rowOf(l.job).locator('.lm-sw'); if ((await sw.getAttribute('aria-checked')) !== 'true') { await sw.click(); await sleep(1500); } }
    await p.locator(`.lm-cd[data-job="${job}"]`).locator('xpath=..').locator('.lm-li').click();
    await settleM(); await sleep(1500);
    const find = () => p.evaluate(() => {
      const c = window.__lm.map.getCanvas().getBoundingClientRect(); let one = null, two = null;
      for (let y = 80; y < c.height - 80 && !(one && two); y += 9) for (let x = 60; x < c.width - 60; x += 9) { const n = window.__lm.objectsAt(x, y).length; if (n >= 2 && !two) two = { x, y, n }; else if (n === 1 && !one) one = { x, y }; }
      return { one, two, c: { x: c.x, y: c.y } };
    });
    let F = await find();
    for (let z = 0; z < 3 && !F.two; z++) { if (F.one) await p.evaluate((t) => window.__lm.map.easeTo({ center: window.__lm.map.unproject([t.x, t.y]), zoom: window.__lm.map.getZoom() + 1.5, duration: 0 }), F.one); await settleM(); await sleep(1500); F = await find(); }
    if (F.one) { await p.mouse.move(F.c.x + F.one.x, F.c.y + F.one.y); await sleep(400); await shot('now-map-mouse-object'); }
    if (F.two) {
      await p.mouse.move(F.c.x + F.two.x, F.c.y + F.two.y); await sleep(500); await shot('now-map-overlap-hover');
      await p.mouse.click(F.c.x + F.two.x, F.c.y + F.two.y); await sleep(700); await shot('now-map-overlap-pick');
      await p.locator('.lm-pick-r').nth(1).click(); await sleep(1400); await shot('now-map-overlap-picked');
    }
    const cls = (await p.evaluate(() => [...document.querySelectorAll('.lm-cb')].map((b) => ({ c: b.dataset.cls, n: b.querySelector('em')?.textContent })))).sort((a, b) => Number(String(b.n).replace(/,/g, '')) - Number(String(a.n).replace(/,/g, '')));
    if (cls.length) {
      const c = cls[0].c; const before = await p.evaluate(() => document.querySelector('.lm-sum b')?.textContent);
      await p.locator(`.lm-cb[data-cls="${c}"]`).click(); await sleep(1200);
      LOG.mapOff = { cls: c, before, after: await p.evaluate(() => document.querySelector('.lm-sum b')?.textContent), vis: await p.evaluate(() => document.querySelector('.lm-vis')?.textContent || null) };
      await shot('now-map-class-off');
      await p.locator(`.lm-cb[data-cls="${c}"]`).click(); await sleep(700);
    }
  });

  await scene('maplist', async () => {
    await openMap(); await expandAll();
    const LS = await p.evaluate(() => window.__lm.layers());
    const tl = LS.filter((l) => !l.empty && l.cls.length > 1)[0];
    if (!tl) return;
    const row = p.locator('.lm-ly li').filter({ has: p.locator(`.lm-cd[data-job="${tl.job}"]`) });
    if (!tl.on) { await row.locator('.lm-sw').click(); await sleep(1500); }
    await row.locator('.lm-lsb').click();
    await wf(() => /건/.test(document.querySelector('.lm-rsub')?.textContent || ''), null, 30000);
    LOG.listBefore = await p.evaluate(() => document.querySelector('.lm-rsub')?.textContent);
    await shot('now-map-list-all');
    const off = tl.cls[0];
    await p.locator(`.lm-cb[data-cls="${off}"]`).click();
    await wf(() => /보이는 것 기준/.test(document.querySelector('.lm-rsub')?.textContent || ''), null, 30000); await sleep(800);
    LOG.listAfter = await p.evaluate(() => document.querySelector('.lm-rsub')?.textContent);
    await shot('now-map-list-off');
    await p.locator(`.lm-cb[data-cls="${off}"]`).click(); await sleep(800);
  });

  await scene('zoomout', async () => {
    await openMap();
    const D = await p.evaluate(async () => { const { api } = await import('/landxi/v3/kit/util.js'); return api('/me/analyses'); });
    const items = D.groups.flatMap((g) => g.items.map((it) => ({ ...it, group: g.name })));
    const n = (it) => (it.found && typeof it.found === 'object' ? it.found.value : it.found);
    const pick = (f) => items.find((it) => !it.empty && it.bounds && f(it));
    const T = [['namwon-greenhouse', pick((it) => /남원/.test(it.region) && /비닐하우스/.test(it.group) && n(it) === 703) || pick((it) => /남원/.test(it.region) && /비닐하우스/.test(it.group)), [9, 11]],
      ['building', pick((it) => /건축물|건물/.test(it.group) && !/함양/.test(it.region)) || pick((it) => /건축물|건물/.test(it.group)), [11]]].filter(([, it]) => it);
    await expandAll();
    const rowOf = (j) => p.locator('.lm-ly li').filter({ has: p.locator(`.lm-cd[data-job="${j}"]`) });
    const onNow = async () => (await p.evaluate(() => window.__lm.layers())).filter((l) => l.on).map((l) => l.job);
    LOG.zoom = {};
    for (const [k, it, zs] of T) {
      for (const j of await onNow()) if (j !== it.job) { await rowOf(j).locator('.lm-sw').click().catch(() => {}); await sleep(300); }
      if (!(await onNow()).includes(it.job)) { await rowOf(it.job).locator('.lm-sw').click(); await sleep(600); }
      const b = it.bounds, c = [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
      LOG.zoom[k] = { n: n(it), region: it.region, z: {} };
      for (const z of zs) {
        await p.evaluate(([c, z]) => window.__lm.map.jumpTo({ center: c, zoom: z }), [c, z]);
        await sleep(900); await settleM(); await sleep(2000);
        LOG.zoom[k].z[z] = await p.evaluate((job) => { const m = window.__lm.map, ids = [`lm-r-${job}-fill`, `lm-r-${job}-line`].filter((l) => m.getLayer(l)); const fs = m.queryRenderedFeatures({ layers: ids }); return new Set(fs.map((f) => f.properties.id ?? f.id)).size; }, it.job);
        await shot(`now-map-${k}-z${z}`);
      }
    }
    // XI맵 서비스 결과 · 전국 결과
    await homeX(APP);
    const nw = T.find(([k]) => k === 'namwon-greenhouse')?.[1];
    if (nw) {
      await jump([(nw.bounds[0] + nw.bounds[2]) / 2, (nw.bounds[1] + nw.bounds[3]) / 2], 11); await sleep(2000);
      await shot('now-xi-service-z11');
    }
    const nat = await p.evaluate(async () => {
      const m = window.__xc.map; m.jumpTo({ center: [127.8, 36.2], zoom: 6.5 }); await new Promise((r) => setTimeout(r, 4000));
      for (const s of Object.keys(m.getStyle().sources).filter((s) => /^xn-[a-z]+$/.test(s))) {
        const fs = m.querySourceFeatures(s, { sourceLayer: 'cells' }).filter((f) => f.properties.done && (f.properties.n2 || f.properties.n3 || f.properties.n1));
        fs.sort((a, b) => (b.properties.n2 || 0) + (b.properties.n3 || 0) - (a.properties.n2 || 0) - (a.properties.n3 || 0));
        const f = fs[0];
        if (f) { const g = f.geometry.coordinates.flat(3); let x0 = 999, y0 = 999, x1 = -999, y1 = -999; for (let i = 0; i < g.length; i += 2) { x0 = Math.min(x0, g[i]); x1 = Math.max(x1, g[i]); y0 = Math.min(y0, g[i + 1]); y1 = Math.max(y1, g[i + 1]); } return { name: `${f.properties.sgg || ''} ${f.properties.name || ''}`.trim(), c: [(x0 + x1) / 2, (y0 + y1) / 2] }; }
      }
      return null;
    });
    LOG.natPlace = nat?.name;
    if (nat) { await jump(nat.c, 11); await sleep(2500); await shot('now-xi-national-z11'); }
  });

  await scene('panes', async () => {
    await openMap();
    const hs = await p.evaluate(() => [...document.querySelectorAll('.pn-h')].map((e) => [e.className, Math.round(e.getBoundingClientRect().width), Math.round(e.getBoundingClientRect().height)]));
    LOG.paneHandles = hs;
    await shot('now-map-pane-before');
    const hb = await p.locator('.pn-h--right, .pn-h--left').first().boundingBox();
    if (hb) {
      const x = hb.x + hb.width / 2, y = hb.y + hb.height / 2;
      await p.mouse.move(x, y); await p.mouse.down(); await p.mouse.move(x + 60, y, { steps: 6 }); await p.mouse.move(x + 150, y, { steps: 8 }); await p.mouse.up(); await sleep(800);
      await shot('now-map-pane-after');
    }
  });
}

/* ───────── 관리자 ───────── */
async function admin() {
  await frontDoor(p, ADMIN, 'lxadmin@lx.or.kr', 'admin');
  await p.waitForURL((u) => !/\/login\/?$/.test(u.pathname), { timeout: 30000 }); LOG._logins++; save();
  const calm = async () => { await wf(() => !/서버 응답이 늦습니다|불러오는 중/.test(document.body.innerText), null, 100000); };
  await scene('dash', async () => { await p.goto(`${ADMIN}${V}ops-core/`, { waitUntil: 'domcontentloaded' }); await sleep(1500); await calm(); await sleep(3000); await shot('now-admin-dash'); });
  await scene('tenants', async () => {
    const t = Date.now();
    await p.goto(`${ADMIN}${V}ops-infra/#/tenants`, { waitUntil: 'domcontentloaded' }); await sleep(1500); await calm(); await sleep(2500);
    LOG.tenantsMs = Date.now() - t;
    LOG.tenantsText = await p.evaluate(() => ({ jg: /전남광주특별시/.test(document.body.innerText), bad: /광주전남특별시/.test(document.body.innerText) }));
    await shot('now-admin-tenants');
  });
  await scene('deploys', async () => {
    const t = Date.now();
    await p.goto(`${ADMIN}${V}ops-infra/#/deploys`, { waitUntil: 'domcontentloaded' }); await sleep(1500); await calm(); await sleep(2500);
    LOG.deploysMs = Date.now() - t; await shot('now-admin-deploys');
  });
  await scene('shared', async () => {
    await p.goto(`${ADMIN}${V}ops-infra/#/shared`, { waitUntil: 'domcontentloaded' }); await sleep(1500); await calm();
    await wf(() => document.querySelector('.sd-det .sd-d'), null, 60000); await sleep(3500); await shot('now-admin-shared');
  });
}

/* ───────── 남원 기관 ───────── */
async function gov() {
  await frontDoor(p, ORG, 'lxadmin@lx.or.kr#namwon', 'gov');
  await p.waitForURL((u) => /\/landxi\/v3\/(?!gov-home\/|login\/)[a-z-]+\//.test(u.pathname), { timeout: 60000 }).catch(() => {}); LOG._logins++; LOG.login_at = kst(); save();
  await sleep(2500);
  await scene('dash', async () => {
    await p.goto(`${ORG}${V}gov-select/?service=card-farm`, { waitUntil: 'domcontentloaded' }); await sleep(2000);
    await wf(() => !/서버 응답이 늦습니다|불러오는 중/.test(document.body.innerText), null, 60000); await sleep(3000);
    await shot('now-gov-dash');
  });
  await scene('ximap', async () => {
    const res = [];
    for (let k = 0; k < 2; k++) {
      const t = Date.now();
      await p.goto(`${ORG}${V}xi-clean/?service=card-farm`, { waitUntil: 'commit' });
      await p.waitForFunction(() => window.__xc?.boot?.shown && !document.querySelector('.k-ld:not([hidden])'), null, { timeout: 120000, polling: 100 });
      await wf(() => window.__xc.map.areTilesLoaded() && !window.__xc.map.isMoving(), null, 30000);
      res.push(+((Date.now() - t) / 1000).toFixed(1));
    }
    LOG.govXiSec = res; await sleep(1500);
    await shot('now-gov-ximap');
  });
  await scene('parcel', async () => {
    await homeX(ORG, '', false);
    LOG.namwon = await place('namwon', 'now-gov', { obj: false });
    if (LOG.namwon.card) {
      const b = p.locator('.xp-card .xe-act .t-btn');
      if (await b.count()) { await b.click(); await wf(() => document.querySelector('.xc-pi-l'), null, 30000); await sleep(900); await shot('now-gov-drawer'); }
    }
  });
}

/* ───────── 해외 기관 ───────── */
async function ov() {
  const t0 = Date.now();
  await frontDoor(p, OVS, 'lxadmin@lx.or.kr#kgz-agri', 'gov');
  await p.waitForURL((u) => /\/landxi\/v3\/(?!gov-home\/)[a-z-]+\//.test(u.pathname), { timeout: 60000 }).catch(() => {}); LOG._logins++; save();
  const ST = () => p.evaluate(() => { const why = document.querySelector('.gl-why'); const big = document.querySelector('.gl-hud .k-big'); const ld = document.querySelector('.k-ld');
    return { level: document.querySelector('.gl')?.dataset.level, state: document.body.dataset.state, run: document.querySelector('.gl-run')?.disabled, big: big?.dataset.state || '', v: big?.dataset.v || '', loading: !!ld && !ld.hidden, label: big?.querySelector('.k-big-l')?.textContent || '' }; });
  const until = async (fn, ms = 40000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const s = await ST(); if (fn(s)) return [s, Date.now() - t]; } catch {} await sleep(100); } return [await ST(), null]; };
  await scene('landing', async () => {
    if (!/\/global\//.test(p.url())) await p.goto(`${OVS}${V}global/`, { waitUntil: 'domcontentloaded' });
    const [, g] = await until((s) => s.level || s.loading);
    await until((s) => s.state === 'ready'); await until((s) => s.big === 'ok', 40000); await sleep(1500);
    const s = await ST(); LOG.first = { v: s.v, label: s.label, sinceLoginMs: Date.now() - t0 };
    await shot('now-ov-landing');
    const t = Date.now(); await p.goto(`${OVS}${V}global/`, { waitUntil: 'domcontentloaded' });
    const [s2] = await until((s) => s.big === 'ok', 40000); LOG.revisit = { v: s2.v, bigMs: Date.now() - t };
    await sleep(1200);
  });
  await scene('tabs', async () => {
    if (!/\/global\//.test(p.url())) await p.goto(`${OVS}${V}global/`, { waitUntil: 'domcontentloaded' });
    await until((s) => s.big === 'ok', 60000);
    const tab = (n) => p.locator('.gl-tab', { hasText: n }).click();
    await tab('Register'); await sleep(800);
    await p.locator('.gl-reg input[type=file]').setInputFiles(path.join(ROOT, 'shots/r3/r3-global/kgz-agri-sample-register.csv'));
    await wf(() => !/Comparing/.test(document.querySelector('.gl-reg-up')?.textContent || ''), null, 30000);
    await sleep(2200); await shot('now-ov-register');
    await tab('Season'); await sleep(2500); await shot('now-ov-season');
  });
}

try {
  if (ROLE === 'staff') await staff(); else if (ROLE === 'admin') await admin(); else if (ROLE === 'gov') await gov(); else if (ROLE === 'ov') await ov();
} catch (e) { LOG.fatal = String(e?.stack || e).slice(0, 600); console.log('치명', LOG.fatal); }
save(); await browser.close();
console.log(JSON.stringify({ role: ROLE, failed: LOG._failed, errors: LOG.errors.length, bad: LOG.bad.length, logins: LOG._logins }));
