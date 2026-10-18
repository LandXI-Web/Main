/* 바퀴 20 now 그림 — 바깥 주소 로그인 폼(역할마다 한 번). 비밀번호는 server/.env(출력·기록 안 함).
   node shoot-r20.mjs <출력폴더> <staff|gov|admin|ov|lxov|pub> [장면,장면]  → <출력폴더>/*.png(끝 네 자리 = 찍은 시각) · log-<역할>.json
   저장된 것을 바꾸지 않는다: 내려받기 · 고르기 · 저장 · 제출은 누르지 않고, 대시보드 칸 크기는 끌었다가 되돌린다. */
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
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ko-KR', acceptDownloads: false });
const p = await ctx.newPage();
p.on('console', (m) => { if (m.type() === 'error') LOG.errors.push(`${kst().slice(11)} ${m.text().slice(0, 200)}`); });
p.on('pageerror', (e) => LOG.errors.push(`${kst().slice(11)} pageerror ${String(e).slice(0, 200)}`));
p.on('response', (r) => { if (r.status() >= 400 && !/favicon/.test(r.url())) LOG.bad.push(`${kst().slice(11)} ${r.status()} ${r.url().replace(/[?#].*$/, '').slice(0, 140)}`); });
let CDP = null;
const shot = async (name, pg = p) => {
  const f = `${name}-${hm()}.png`;
  for (const old of fs.readdirSync(OUT).filter((x) => new RegExp('^' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '-\\d{4}\\.png$').test(x))) fs.unlinkSync(path.join(OUT, old));
  try { await pg.screenshot({ path: path.join(OUT, f), timeout: 15000 }); }
  catch { CDP ||= await ctx.newCDPSession(pg); const r = await CDP.send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(OUT, f), Buffer.from(r.data, 'base64')); }
  LOG[f] = kst(); save(); console.log('찍음', f); return f;
};
async function scene(n, fn) {
  if (ONLYS.size && !ONLYS.has(n)) return;
  try { await fn(); } catch (e) { LOG._failed.push(n); console.log('실패', n, String(e).slice(0, 300).replace(/\n/g, ' ')); }
  save();
}
const sleep = (ms) => p.waitForTimeout(ms);
const wf = (fn, arg, to = 30000) => p.waitForFunction(fn, arg, { timeout: to, polling: 100 }).then(() => true, () => false);
const wide = () => p.setViewportSize({ width: 1440, height: 900 });
const phone = () => p.setViewportSize({ width: 390, height: 844 });
async function calm(to = 60000) {
  const start = Date.now(); let ok = 0;
  while (Date.now() - start < to) {
    const busy = await p.evaluate(() => /불러오는 중|서버 응답이 늦습니다/.test(document.body?.innerText || '')).catch(() => false);
    if (busy) ok = 0; else if (++ok >= 8) break;
    await sleep(120);
  }
  await sleep(600);
}
const go = async (base, u) => { await p.goto(`${base}${V}${u}`, { waitUntil: 'domcontentloaded' }); await calm(); };
const readyX = () => window.__xc?.map && window.__xc.boot?.shown && document.querySelector('.k-chat-root[data-dock]');
const settle = () => p.waitForFunction(() => !window.__xc.map.isMoving() && window.__xc.map.areTilesLoaded(), null, { timeout: 30000 }).catch(() => {});
async function say(q) {
  const prev = await p.evaluate(() => document.querySelector('.xk-ans .xk-ans-t')?.textContent || '');
  const inp = p.locator('.k-ck-i').first(); await inp.click({ timeout: 10000 }); await inp.fill(q); await inp.press('Enter');
  await wf((pv) => { const a = document.querySelector('.xk-ans:not([hidden]):not(.is-busy)'); return a && a.querySelector('.xk-more') && a.querySelector('.xk-ans-t').textContent !== pv; }, prev, 90000);
  await settle();
}

/* ───────── 지도 + XI ChatGEO 강조(직원 · 기관 같은 장면) ───────── */
async function hlScenes(base, tag, qs) {
  await wide();
  await p.goto(`${base}${V}xi-clean/?region=52190`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForFunction(readyX, null, { timeout: 120000, polling: 150 }); await settle(); await sleep(2500);
  await say(qs[0]); await sleep(5200);
  LOG[`${tag}-q1`] = await p.evaluate(() => ({ hl: window.__xc?.hl || null, band: document.querySelector('.xk-ans:not([hidden]) .xk-ans-t')?.innerText || null }));
  await shot(`${tag}-hl-q1`);
  const ref = p.locator('.xk-ans .xk-ref').first();
  if (await ref.count()) { await ref.hover(); await sleep(700); await shot(`${tag}-hl-hover`); await p.mouse.move(5, 5); await sleep(300); }
  await say(qs[1]); await sleep(2800);
  LOG[`${tag}-q2`] = await p.evaluate(() => ({ band: document.querySelector('.xk-ans:not([hidden]) .xk-ans-t')?.innerText || null }));
  await shot(`${tag}-hl-q2`);
  const more = p.locator('.xk-ans .xk-more');
  if (await more.count()) {
    await more.click(); await sleep(1000);
    LOG[`${tag}-drawer`] = await p.evaluate(() => ({ bandHidden: document.querySelector('.xk-ans')?.hidden ?? null }));
    await shot(`${tag}-drawer-open`);
    await p.keyboard.press('Escape'); await sleep(900);
    let dc = await p.evaluate(() => ({ bandHidden: document.querySelector('.xk-ans')?.hidden ?? null }));
    if (dc.bandHidden) { await p.locator('.k-drawer .k-dr-x, .k-drawer [aria-label*="닫기"]').first().click().catch(() => {}); await sleep(900); dc = { ...(await p.evaluate(() => ({ bandHidden: document.querySelector('.xk-ans')?.hidden ?? null }))), viaButton: true }; }
    LOG[`${tag}-drawer-closed`] = dc; await shot(`${tag}-drawer-closed`);
  }
  if (qs[2]) { await say(qs[2]).catch(() => {}); await sleep(3000); await shot(`${tag}-hl-out`); LOG[`${tag}-out`] = await p.evaluate(() => ({ band: document.querySelector('.xk-ans:not([hidden]) .xk-ans-t')?.innerText || null, hl: window.__xc?.hl || null })); }
}

/* ───────── 직원 ───────── */
async function staff() {
  await frontDoor(p, APP, 'test@lx.or.kr', 'app');
  await p.waitForURL((u) => !/\/login\/?$/.test(u.pathname), { timeout: 30000 }); LOG._logins++; LOG.login_at = kst(); save();
  await scene('hl', async () => { await hlScenes(APP, 'staff', ['남원시 경작지 현황 보여 줘', '그중 가장 큰 곳은?']); });
  await scene('list', async () => {
    await wide();
    await p.goto(`${APP}${V}xi-clean/`, { waitUntil: 'commit' });
    await p.waitForFunction(readyX, null, { timeout: 120000, polling: 150 }); await settle(); await sleep(2000);
    await p.locator('.xk-ans:not([hidden]) button[aria-label*="닫기"]').first().click({ timeout: 3000 }).catch(() => {}); await sleep(500);
    await p.locator('.xb-hud').click(); await sleep(1800);
    const sido = p.locator('.xc-sdc').first(); if (await sido.count()) { await sido.click(); await sleep(1500); }
    const sgg = p.locator('.xc-sgc').first(); if (await sgg.count()) { await sgg.click(); await sleep(2000); }
    await shot('now-xi-list-region');
    await p.locator('.xc-board-flip').click(); await sleep(1200);
    const sv = p.locator('.xc-svr'); LOG.svcRows = await sv.evaluateAll((es) => es.slice(0, 12).map((e) => e.innerText.replace(/\s+/g, ' ').slice(0, 60))).catch(() => []);
    await sv.first().click(); await sleep(1500);
    await shot('now-xi-list-svc');
    const fl = p.locator('.xc-board-flip'); if ((await fl.getAttribute('aria-pressed')) === 'true') await fl.click();
  });
  await scene('dash', async () => {
    await wide(); await go(APP, 'lx-console/'); await sleep(1500);
    await shot('staff-dash');
    await p.locator('.dg-b--edit').first().click(); await sleep(1300); await calm(20000);
    LOG.dashBtns = await p.evaluate(() => [...document.querySelectorAll('.dg-bar button')].filter((b) => b.offsetParent !== null).map((b) => b.innerText.trim()));
    LOG.dashPre = await p.locator('.dg-b--pre').first().isVisible().catch(() => false);
    LOG.dashAdd = await p.locator('.dg-b--add').first().innerText().catch(() => null);
    const H = (d) => p.locator(`.dg-rs[data-dir="${d}"]`).first();
    const node = H('se').locator('xpath=..');
    await node.scrollIntoViewIfNeeded().catch(() => {}); await sleep(300);
    const box0 = await node.boundingBox(); LOG.dashBox0 = box0;
    await shot('staff-dash-edit');
    const drag = async (d, dx, dy) => { const hb = await H(d).boundingBox(); const sx = hb.x + hb.width / 2, sy = hb.y + hb.height / 2; await p.mouse.move(sx, sy); await p.mouse.down(); await p.mouse.move(sx + dx, sy + dy, { steps: 15 }); await p.mouse.up(); await sleep(800); };
    await drag('w', 180, 0); LOG.dashW = await node.boundingBox(); await shot('staff-dash-w');
    await drag('w', -180, 0);
    await drag('se', -90, -76); LOG.dashSe = await node.boundingBox(); await shot('staff-dash-se');
    await drag('se', 90, 76);
    LOG.dashBoxBack = await node.boundingBox();
    await p.locator('.dg-b--done').first().click().catch(() => {}); await sleep(1000); await calm(20000);
  });
  await scene('newproj', async () => {
    await wide(); await go(APP, 'lx-project/?new=1'); await sleep(1000);
    await shot('staff-newproj-top');
    const tab = p.getByRole('tab', { name: '공유 데이터에서 고르기' }).first();
    await tab.click(); await p.locator('.lxp-pk-cw').first().waitFor({ timeout: 30000 }); await calm(); await sleep(800);
    LOG.pickCards = await p.locator('.lxp-pk-cw').evaluateAll((els) => els.slice(0, 20).map((e) => e.querySelector('button.lxp-pk-c')?.innerText.replace(/\s+/g, ' ').trim().slice(0, 80)));
    await shot('staff-pick-pc');
    for (const [word, tag] of [['위성', 'sat'], ['드론', 'drone']]) {
      const card = p.locator('.lxp-pk-cw').filter({ hasText: word }).first();
      if (!(await card.count())) continue;
      await card.locator('.lxp-pk-big').first().click(); await p.locator('.k-iv-p').first().waitFor({ timeout: 30000 }); await sleep(4500);
      LOG[`zoom-${tag}`] = await p.evaluate(() => ({ title: document.querySelector('.k-iv-t')?.innerText, btns: [...document.querySelectorAll('.k-iv-fb .k-iv-b, .k-iv-fb .k-iv-go')].map((b) => b.innerText) }));
      await shot(`staff-zoom-${tag}`);
      if (tag === 'sat') {
        const w = p.locator('.k-iv-fb a.k-iv-b').first();
        const [pop] = await Promise.all([ctx.waitForEvent('page', { timeout: 15000 }).catch(() => null), w.click()]);
        if (pop) { await pop.waitForLoadState('domcontentloaded').catch(() => {}); await pop.setViewportSize({ width: 1200, height: 800 }).catch(() => {}); await sleep(4500); await shot('staff-zoom-newwindow', pop); await pop.close(); }
      }
      await p.keyboard.press('Escape'); await sleep(600);
    }
  });
  await scene('analyze', async () => {
    await wide(); await go(APP, 'lx-analyze/?region=52190'); await sleep(1200);
    await p.locator('a.k-sc-go').first().click(); await sleep(2500); await calm(); await p.locator('#imagery .la-im-big').first().waitFor({ timeout: 30000 }).catch(() => {});
    const b = p.locator('#imagery .la-im-big').first();
    if (await b.count()) { await b.click(); await p.locator('.k-iv-p').first().waitFor({ timeout: 30000 }); await sleep(4500); await shot('staff-analyze-zoom'); await p.keyboard.press('Escape'); }
    else { LOG.analyzeNoBtn = true; LOG.analyzeUrl = p.url(); await shot('dbg-analyze'); }
  });
}

/* ───────── 남원 기관 ───────── */
async function gov() {
  await frontDoor(p, ORG, 'lxadmin@lx.or.kr#namwon', 'gov');
  await p.waitForURL((u) => /\/landxi\/v3\/(?!gov-home\/|login\/)[a-z-]+\//.test(u.pathname), { timeout: 60000 }).catch(() => {}); LOG._logins++; LOG.login_at = kst(); save();
  await sleep(2000);
  await scene('report', async () => {
    await wide(); await p.goto(`${ORG}${V}gov-report/?service=card-farm&tab=report`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('.rp-doc .gr-rdoc-t', { timeout: 40000 });
    await p.waitForSelector('.rp-doc .gr-map-img[data-state="on"], .rp-doc .gr-map-img[data-state="none"]', { timeout: 20000 }).catch(() => {});
    await calm(); await shot('gov-report-top');
    LOG.reportChecks = await p.evaluate(() => [...document.querySelectorAll('.rp-ck')].map((e) => e.innerText.replace(/\s+/g, ' ').trim().slice(0, 60)));
    const opt = await p.$eval('.rp-pick select.rp-sel', (s) => [...s.options].find((o) => o.value)?.value);
    const t0 = Date.now(); await p.selectOption('.rp-pick select.rp-sel >> nth=0', opt); await p.waitForSelector('.rp-doc .gr-cmp', { timeout: 20000 }); LOG.ledgerFillMs = Date.now() - t0;
    await p.$eval('.rp-doc .gr-cmp', (e) => e.scrollIntoView({ block: 'center' })); await sleep(500);
    await shot('gov-report-ledger');
    await p.selectOption('.rp-pick select.rp-sel >> nth=0', '').catch(() => {}); await calm(); await sleep(1500);
    await p.$eval('.rp-list', (e) => e.scrollIntoView({ block: 'end' })); await sleep(500);
    LOG.issues = await p.locator('.rp-iss tbody tr').evaluateAll((rs) => rs.slice(0, 5).map((r) => r.innerText.replace(/\s+/g, ' ').slice(0, 80))).catch(() => []);
    await shot('gov-report-issues');
    await phone(); await p.goto(`${ORG}${V}gov-report/?service=card-farm&tab=report`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('.rp-doc .gr-rdoc-t', { timeout: 40000 }); await calm(); await sleep(1200);
    await shot('gov-report-top-m');
    await wide();
  });
  await scene('stats', async () => {
    await wide(); await p.goto(`${ORG}${V}gov-select/?service=card-farm&tab=stats`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('.gs-cls-csv', { timeout: 40000 }); await calm();
    await p.$eval('.gs-cls-csv', (e) => e.scrollIntoView({ block: 'center' })); await sleep(600);
    LOG.statsBtn = await p.$eval('.gs-cls-csv', (e) => e.innerText);
    await shot('gov-stats-xlsx');
    await p.goto(`${ORG}${V}gov-select/?service=card-farm&tab=history`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('.gy-hist .gd-more', { timeout: 40000 }); await calm(); await sleep(500);
    LOG.histBtn = await p.$eval('.gy-hist > .gd-more', (e) => e.innerText);
    await shot('gov-history-xlsx');
  });
  await scene('feed', async () => {
    await wide(); await p.goto(`${ORG}${V}gov-fusion/?service=card-farm`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('.gf-list-b:visible', { timeout: 40000 }); await p.click('.gf-list-b:visible');
    await p.waitForSelector('.gf-lst', { timeout: 20000 });
    await p.locator('.gf-lst', { hasText: '사료작물' }).locator('li').first().click();
    await p.waitForSelector('.gf-emd', { timeout: 40000 }); await sleep(2500);
    await p.$eval('.gf-emd', (e) => e.scrollIntoView({ block: 'center' })); await sleep(500);
    await shot('gov-feed-emd');
    await p.click('.gf-tb--emd tbody tr:first-child'); await sleep(2500);
    LOG.emdOn = await p.$eval('.gf-tb--emd tr.is-on', (e) => e.innerText.replace(/\s+/g, ' ')).catch(() => null);
    await shot('gov-feed-emd-on');
  });
  await scene('pledges', async () => {
    await wide(); await p.goto(`${ORG}${V}gov-accounts/#pledges`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('.acc-pl-bar', { timeout: 40000 }); await calm(); await sleep(600);
    LOG.pledgeSum = await p.$eval('.acc-pl-sum', (e) => e.textContent).catch(() => null);
    await shot('gov-pledges');
    await phone(); await p.goto(`${ORG}${V}gov-accounts/#pledges`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('.acc-pl-bar', { timeout: 40000 }); await calm(); await sleep(600);
    await shot('gov-pledges-m'); await wide();
  });
  await scene('hl', async () => { await hlScenes(ORG, 'inst', ['읍면동별 현장 확인 필요 필지 순위', '그중 가장 많은 곳은?', '임실군 경작지 현황 보여 줘']); });
}

/* ───────── LX 관리자 ───────── */
async function admin() {
  await frontDoor(p, ADMIN, 'lxadmin@lx.or.kr', 'admin');
  await p.waitForURL((u) => !/\/login\/?$/.test(u.pathname), { timeout: 30000 }); LOG._logins++; save();
  await scene('pledges', async () => {
    await wide(); await p.goto(`${ADMIN}${V}ops-accounts/#pledges`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('.acc-pl-bar', { timeout: 40000 }); await calm(); await sleep(600);
    LOG.pledgeSum = await p.$eval('.acc-pl-sum', (e) => e.textContent).catch(() => null);
    await shot('admin-pledges');
  });
}

/* ───────── 해외 ───────── */
const ST = () => p.evaluate(() => { const big = document.querySelector('.gl-hud .k-big'); return { level: document.querySelector('.gl')?.dataset.level, state: document.body.dataset.state, big: big?.dataset.state || '', text: big?.innerText?.replace(/\s+/g, ' ') || '' }; });
const until = async (fn, ms = 40000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const s = await ST(); if (fn(s)) return s; } catch {} await sleep(250); } return ST(); };
const tabTxt = () => p.evaluate(() => { const r = document.querySelector('.gl-off'); const l = document.querySelector('.gl-off-line'); return { off: r ? r.innerText.replace(/\s+/g, ' ') : null, rows: r ? r.querySelectorAll('tbody tr').length : 0, line: l ? l.innerText : null, scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth }; });
async function ovRun(tag, base) {
  await scene('ov-' + tag, async () => {
    if (tag === 'm') await phone(); else await wide();
    await p.goto(`${base}${V}global/${base === APP ? '?country=KGZ' : ''}`, { waitUntil: 'domcontentloaded' });
    await until((s) => s.state === 'ready', 90000); await until((s) => s.big === 'ok' || s.big === 'none', 120000); await sleep(2500);
    LOG['season-' + tag] = await tabTxt(); await shot('ov-season-' + tag);
    await p.locator('[role=tab]', { hasText: 'Register' }).first().click(); await sleep(1800);
    LOG['register-' + tag] = await tabTxt();
    await p.locator('.gl-off').first().scrollIntoViewIfNeeded().catch(() => {}); await sleep(700); await shot('ov-register-' + tag);
  });
}
async function ov() {
  await frontDoor(p, OVS, 'lxadmin@lx.or.kr#kgz-agri', 'gov');
  await p.waitForURL((u) => /\/landxi\/v3\/(?!gov-home\/)[a-z-]+\//.test(u.pathname), { timeout: 60000 }).catch(() => {}); LOG._logins++; LOG.login_at = kst(); save();
  await ovRun('pc', OVS); await ovRun('m', OVS);
}
async function lxov() {
  await frontDoor(p, APP, 'lxadmin@lx.or.kr', 'lx');
  await p.waitForURL((u) => /\/landxi\/v3\/(?!gov-home\/)[a-z-]+\//.test(u.pathname), { timeout: 60000 }).catch(() => {}); LOG._logins++; LOG.login_at = kst(); save();
  await ovRun('lx', APP);
}

/* ───────── 공개(로그인 없음) 패밀리 사이트 ───────── */
async function pub() {
  const fam = async (name, url) => {
    await p.goto(url, { waitUntil: 'load', timeout: 60000 }); await calm(); await sleep(1200);
    const det = p.locator('details.fam').first();
    if (!(await det.count())) { LOG[name] = 'none'; return; }
    await det.locator('summary').scrollIntoViewIfNeeded().catch(() => {}); await det.locator('summary').click(); await sleep(800);
    await det.scrollIntoViewIfNeeded().catch(() => {}); await sleep(400);
    LOG[name] = await det.locator('a').evaluateAll((as) => as.map((a) => ({ text: a.textContent.trim(), href: a.href, target: a.target })));
    await shot(name);
  };
  await scene('pub', async () => {
    await wide(); await fam('pub-main-fam', `${APP}${V}main/`); await fam('pub-login-fam', `${APP}${V}login/`);
    await phone(); await fam('pub-login-fam-m', `${APP}${V}login/`);
  });
}

try {
  await ({ staff, gov, admin, ov, lxov, pub })[ROLE]();
} catch (e) { LOG.fatal = String(e?.stack || e).slice(0, 600); console.log('치명', LOG.fatal); }
save(); await browser.close();
console.log(JSON.stringify({ role: ROLE, failed: LOG._failed, errors: LOG.errors.length, bad: LOG.bad.length, logins: LOG._logins }));
