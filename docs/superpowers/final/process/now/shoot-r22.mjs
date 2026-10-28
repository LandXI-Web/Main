/* 바퀴 22 재검수 + now 그림 — 바깥 주소 로그인 폼. 비밀번호는 server/.env(기록 안 함).
   node shoot-r22.mjs <출력폴더> <staff|gov|admin> [장면,장면]  → *.png(끝 네 자리 = 찍은 시각) · log-<역할>.json(장면별 '불러오는 중' 남은 시간)
   저장된 것을 바꾸지 않는다: 누르기는 열기 · 질문 한 번뿐. */
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
const ONLY = new Set((process.argv[4] || '').split(',').filter(Boolean));
const APP = 'https://app.land-xi.dev', ADMIN = 'https://admin.land-xi.dev', ORG = 'https://namwon.land-xi.dev';
const V = '/landxi/v3/';
const kst = () => new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' });
const hm = () => kst().slice(11, 16).replace(':', '');
const LF = path.join(OUT, `log-${ROLE}.json`);
const LOG = fs.existsSync(LF) ? JSON.parse(fs.readFileSync(LF, 'utf8')) : {};
LOG.errors = []; LOG.bad = []; LOG._failed = [];
const save = () => fs.writeFileSync(LF, JSON.stringify(LOG, null, 1));
setTimeout(() => { LOG.timeout = true; save(); process.exit(2); }, 1500000).unref();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ko-KR', acceptDownloads: false });
const p = await ctx.newPage();
p.on('console', (m) => { if (m.type() === 'error') LOG.errors.push(`${kst().slice(11)} ${p.url().slice(-40)} ${m.text().slice(0, 160)}`); });
p.on('pageerror', (e) => LOG.errors.push(`${kst().slice(11)} pageerror ${String(e).slice(0, 160)}`));
p.on('response', (r) => { if (r.status() >= 400 && !/favicon/.test(r.url())) LOG.bad.push(`${kst().slice(11)} ${r.status()} ${r.url().replace(/[?#].*$/, '').slice(0, 120)}`); });
const sleep = (ms) => p.waitForTimeout(ms);
const shot = async (name) => {
  const f = `${name}-${hm()}.png`;
  for (const old of fs.readdirSync(OUT).filter((x) => /-\d{4}\.png$/.test(x) && x.slice(0, -9) === name)) fs.unlinkSync(path.join(OUT, old));
  await p.screenshot({ path: path.join(OUT, f), timeout: 20000 }); LOG[f] = kst(); save(); console.log('찍음', f);
};
const wide = () => p.setViewportSize({ width: 1440, height: 900 });
const phone = () => p.setViewportSize({ width: 390, height: 844 });
/* 화면 열기 → '불러오는 중' 이 보인 총 시간(첫 보임~마지막 보임) · 조용해지기까지 시간 */
async function open(name, url, ready) {
  const t0 = Date.now();
  await p.goto(url, { waitUntil: 'commit', timeout: 60000 });
  let first = 0, last = 0, quiet = 0, readyAt = 0;
  while (Date.now() - t0 < 45000) {
    const st = await p.evaluate((rs) => ({ busy: /불러오는 중|서버 응답이 늦습니다|불러오고 있습니다/.test(document.body?.innerText || ''), ready: rs ? !!document.querySelector(rs) : true, len: (document.body?.innerText || '').length }), ready).catch(() => ({ busy: true, ready: false, len: 0 }));
    const t = Date.now() - t0;
    if (st.ready && !readyAt && st.len > 50) readyAt = t;
    if (st.busy) { if (!first) first = t; last = t; quiet = 0; } else if (st.ready && st.len > 50) { if (++quiet >= 20) break; }
    await sleep(100);
  }
  const r = { 보임_ms: readyAt, 불러오는중_첫: first, 불러오는중_끝: last, 불러오는중_남은_ms: first ? last - first + 100 : 0, 조용_ms: Date.now() - t0 };
  LOG['t:' + name] = r; save(); console.log(name, JSON.stringify(r)); await sleep(700); return r;
}
async function scene(n, fn) {
  if (ONLY.size && !ONLY.has(n)) return;
  try { await fn(); } catch (e) { LOG._failed.push(n); console.log('실패', n, String(e).slice(0, 300).replace(/\n/g, ' ')); }
  save();
}
const overlap = () => p.evaluate(() => {
  const sel = '.k-chat-root, .xk-ans, .k-drawer, [class*="card"], .k-ck-i';
  const els = [...document.querySelectorAll(sel)].filter((e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 30 && r.height > 20 && cs.visibility !== 'hidden' && cs.display !== 'none' && (cs.position === 'fixed' || e.matches('.k-chat-root,.xk-ans,.k-drawer')); });
  const out = [];
  for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
    if (els[i].contains(els[j]) || els[j].contains(els[i])) continue;
    const a = els[i].getBoundingClientRect(), b = els[j].getBoundingClientRect();
    const w = Math.min(a.right, b.right) - Math.max(a.left, b.left), h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    if (w > 4 && h > 4) out.push(`${els[i].className.toString().slice(0, 30)} x ${els[j].className.toString().slice(0, 30)} ${Math.round(w)}x${Math.round(h)}`);
  }
  return out;
});
async function say(q) {
  const inp = p.locator('.k-ck-i').first(); await inp.click({ timeout: 10000 }); await inp.fill(q);
  const t0 = Date.now(); await inp.press('Enter');
  await p.waitForFunction(() => { const a = document.querySelector('.xk-ans:not([hidden]):not(.is-busy)'); return a && a.querySelector('.xk-ans-t')?.textContent; }, null, { timeout: 90000 }).catch(() => {});
  return Date.now() - t0;
}
const readyX = () => window.__xc?.map && window.__xc.boot?.shown && document.querySelector('.k-chat-root[data-dock]');

async function staff() {
  await frontDoor(p, APP, 'test@lx.or.kr', 'app');
  await p.waitForURL((u) => !/\/login\/?$/.test(u.pathname), { timeout: 30000 }); LOG.login_at = kst(); save();
  await scene('dash', async () => { await wide(); await open('직원-첫화면', APP + V + 'lx-console/'); await shot('staff-dash'); LOG.dashOverlap = await overlap(); await phone(); await open('직원-첫화면-휴대폰', APP + V + 'lx-console/'); await shot('staff-dash-m'); await wide(); });
  await scene('analyze', async () => {
    await wide(); await open('분석서비스-목록', APP + V + 'lx-analyze/', 'a.k-sc-go'); await shot('staff-analyze'); LOG.analyzeOverlap = await overlap();
    const links = await p.locator('a.k-sc-go').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
    LOG.analyzeLinks = links.slice(0, 20);
    let n = 0;
    for (const h of links.slice(0, 3)) {
      n++; await open('분석카드-' + n, new URL(h, APP + V + 'lx-analyze/').href); await shot('staff-card' + n); LOG['cardOverlap' + n] = await overlap();
    }
  });
  await scene('mapsvc', async () => { await wide(); await open('지도서비스', APP + V + 'lx-map/'); await shot('staff-mapsvc'); LOG.mapOverlap = await overlap(); });
  await scene('project', async () => { await wide(); await open('프로젝트', APP + V + 'lx-project/'); await shot('staff-project'); LOG.projOverlap = await overlap(); });
  await scene('ximap', async () => {
    await wide(); const t0 = Date.now();
    await p.goto(APP + V + 'xi-clean/?region=52190', { waitUntil: 'commit' });
    await p.waitForFunction(readyX, null, { timeout: 120000, polling: 150 }); LOG['t:XI맵_보임_ms'] = Date.now() - t0;
    await p.waitForFunction(() => !window.__xc.map.isMoving() && window.__xc.map.areTilesLoaded(), null, { timeout: 30000 }).catch(() => {}); await sleep(2000);
    LOG['t:XI맵_지도다그림_ms'] = Date.now() - t0; await shot('staff-ximap'); LOG.ximapOverlap = await overlap();
    const ms = await say('남원시 경작지 현황 보여 줘'); LOG['t:ChatGEO_답_ms'] = ms; await sleep(2500); await shot('staff-chat'); LOG.chatOverlap = await overlap();
    LOG.chatBand = await p.evaluate(() => document.querySelector('.xk-ans:not([hidden]) .xk-ans-t')?.innerText?.slice(0, 200) || null);
    await phone(); await p.goto(APP + V + 'xi-clean/?region=52190', { waitUntil: 'commit' });
    await p.waitForFunction(readyX, null, { timeout: 120000, polling: 150 }); await sleep(3000); await shot('staff-ximap-m'); LOG.ximapOverlapM = await overlap(); await wide();
  });
}
async function admin() {
  await frontDoor(p, ADMIN, 'lxadmin@lx.or.kr', 'admin');
  await p.waitForURL((u) => !/\/login\/?$/.test(u.pathname), { timeout: 30000 }); LOG.login_at = kst(); save();
  await scene('home', async () => { await wide(); await open('관리자-첫화면', ADMIN + V + 'ops-core/'); await shot('admin-home'); LOG.homeOverlap = await overlap(); });
  await scene('deploys', async () => {
    await wide(); await open('관리자-배포', ADMIN + V + 'ops-infra/?view=deploys'); await sleep(1500); await shot('admin-deploys');
    LOG.deployTabs = await p.evaluate(() => ({ selected: [...document.querySelectorAll('[role=tab][aria-selected=true]')].map((e) => e.innerText.trim()), visiblePanels: [...document.querySelectorAll('[role=tabpanel]')].filter((e) => e.offsetParent !== null).length, head: document.body.innerText.replace(/\s+/g, ' ').slice(0, 300) }));
    LOG.deployOverlap = await overlap(); await phone(); await open('관리자-배포-휴대폰', ADMIN + V + 'ops-infra/?view=deploys'); await shot('admin-deploys-m'); await wide();
  });
  await scene('cards', async () => {
    await wide(); await open('카드관리', ADMIN + V + 'ops-infra/#/deploys'); await shot('admin-cards');
    LOG.cardsHead = await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 400)); LOG.cardsOverlap = await overlap();
  });
  await scene('cardmgr', async () => {
    await wide(); await open('카드관리-경작휴경', ADMIN + V + 'lx-cards/?card=card-farm', '.lc-cv-c'); await sleep(1500);
    LOG.cands = await p.evaluate(() => [...document.querySelectorAll('.lc-cv-c')].map((e) => e.innerText.replace(/\s+/g, ' ').trim()));
    await (await p.$('.lc-cv-cands'))?.scrollIntoViewIfNeeded().catch(() => {}); await sleep(800);
    await shot('admin-farm-cands'); LOG.candsOverlap = await overlap();
  });
}
async function gov() {
  await frontDoor(p, ORG, 'lxadmin@lx.or.kr#namwon', 'gov');
  await p.waitForURL((u) => /\/landxi\/v3\/(?!gov-home\/|login\/)[a-z-]+\//.test(u.pathname), { timeout: 60000 }).catch(() => {}); LOG.login_at = kst(); save(); await sleep(2000);
  await scene('list', async () => { await wide(); await open('기관-내서비스', ORG + V + 'gov-select/'); await shot('gov-select'); LOG.govOverlap = await overlap(); });
  await scene('map', async () => {
    await wide(); const t0 = Date.now(); await p.goto(ORG + V + 'xi-clean/', { waitUntil: 'commit' });
    await p.waitForFunction(readyX, null, { timeout: 120000, polling: 150 }); LOG['t:기관지도_보임_ms'] = Date.now() - t0; await sleep(2500); await shot('gov-map'); LOG.govMapOverlap = await overlap();
  });
}
try { await ({ staff, gov, admin })[ROLE](); } catch (e) { LOG.fatal = String(e?.stack || e).slice(0, 600); console.log('치명', LOG.fatal); }
save(); await browser.close();
console.log(JSON.stringify({ role: ROLE, failed: LOG._failed, errors: LOG.errors.length, bad: LOG.bad.length }));
