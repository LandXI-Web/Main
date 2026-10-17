/* 바퀴 17 결정 항목 증거 — 바깥 주소 로그인 폼(역할마다 한 번 · 세션 주입 없음). 비밀번호는 server/.env.
   node shoot.mjs <출력폴더> <ov|staff|admin> <tag(before|after)> [장면,장면]
   ov    = 해외 기관 첫 화면(작황 하락 · 건물 면적 변화 — 기본 화면 · 휠로 가까이)
   staff = 메인 해외 장면(나라 · 군 확대) + XI맵 키르기스스탄(나라 · 군 · 가까이) + 군 추천 질문
   admin = LX 관리자 대시보드 장비 줄(측정 멈춤 흉내 · 정상) */
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
const ROLE = process.argv[3], TAG = process.argv[4] || 'after';
const ONLYS = new Set((process.argv[5] || '').split(',').filter(Boolean));
const APP = 'https://app.land-xi.dev', ADMIN = 'https://admin.land-xi.dev', OVS = 'https://kgz-agri.land-xi.dev';
const V = '/landxi/v3/';
const kst = () => new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' });
const hm = () => kst().slice(11, 16).replace(':', '');
const LF = path.join(OUT, `log-${ROLE}-${TAG}.json`);
const LOG = { _failed: [], errors: [], bad: [] };
const save = () => fs.writeFileSync(LF, JSON.stringify(LOG, null, 1));
setTimeout(() => { LOG.timeout = true; save(); process.exit(2); }, 1500000).unref();

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ko-KR' });
const p = await ctx.newPage();
p.on('console', (m) => { if (m.type() === 'error') LOG.errors.push(`${kst().slice(11)} ${m.text().slice(0, 200)}`); });
p.on('pageerror', (e) => LOG.errors.push(`${kst().slice(11)} pageerror ${String(e).slice(0, 200)}`));
p.on('response', (r) => { if (r.status() >= 400 && !/favicon/.test(r.url())) LOG.bad.push(`${kst().slice(11)} ${r.status()} ${r.url().replace(/[?#].*$/, '').slice(0, 140)}`); });
let CDP = null;
const shot = async (name) => {
  name = `${name}-${TAG}`;
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

/* ───────── 해외 기관 첫 화면 ───────── */
async function ov() {
  await frontDoor(p, OVS, 'lxadmin@lx.or.kr#kgz-agri', 'gov');
  await p.waitForURL((u) => /\/landxi\/v3\/(?!gov-home\/)[a-z-]+\//.test(u.pathname), { timeout: 60000 }).catch(() => {}); LOG.login_at = kst(); save();
  const ST = () => p.evaluate(() => { const big = document.querySelector('.gl-hud .k-big'); return { level: document.querySelector('.gl')?.dataset.level, state: document.body.dataset.state, big: big?.dataset.state || '', v: big?.dataset.v || '' }; });
  const until = async (fn, ms = 40000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const s = await ST(); if (fn(s)) return s; } catch {} await sleep(200); } return ST(); };
  // 휠로 가까이(사용자처럼) — 지도 가운데보다 조금 위 · 경작지가 모인 곳
  const wheelIn = async (x, y, n) => { await p.mouse.move(x, y); for (let i = 0; i < n; i++) { await p.mouse.wheel(0, -300); await sleep(250); } await sleep(4000); };
  await scene('crop', async () => {
    if (!/\/global\//.test(p.url())) await p.goto(`${OVS}${V}global/`, { waitUntil: 'domcontentloaded' });
    await until((s) => s.state === 'ready', 60000); await until((s) => s.big === 'ok' || s.big === 'none', 90000); await sleep(3000);
    LOG.crop = await ST();
    await shot('ov-crop');
    await wheelIn(560, 300, 6);
    await shot('ov-crop-near');
    await wheelIn(560, 300, 4);
    await shot('ov-crop-nearer');
  });
  await scene('sprawl', async () => {
    await p.goto(`${OVS}${V}global/?tab=sprawl`, { waitUntil: 'domcontentloaded' });
    await until((s) => s.state === 'ready', 60000); await sleep(2000);
    if (!(await p.locator('.gl-tab[aria-selected="true"]', { hasText: 'Sprawl' }).count())) await p.locator('.gl-tab', { hasText: 'Sprawl' }).click();
    await sleep(3500);
    LOG.sprawl = await ST();
    await shot('ov-sprawl');
    await wheelIn(470, 260, 6);
    await shot('ov-sprawl-near');
  });
}

/* ───────── 메인 해외 장면 + XI맵 키르기스스탄 ───────── */
async function staff() {
  await frontDoor(p, APP, 'test@lx.or.kr', 'app');
  await p.waitForURL((u) => !/\/login\/?$/.test(u.pathname), { timeout: 30000 }); LOG.login_at = kst(); save();
  await scene('main', async () => {
    await p.goto(`${APP}${V}main/?dev=1`, { waitUntil: 'domcontentloaded' });
    await wf(() => window.__lxm?.ready, null, 90000); await sleep(2500);
    // 아래로 내려 가며 해외 장면(나라 → 군 확대)을 찾는다
    const H = await p.evaluate(() => document.documentElement.scrollHeight);
    let far = false, near = false;
    for (let y = 0; y < H && near !== true; y += 220) {
      await p.evaluate((y) => window.scrollTo(0, y), y); await sleep(160);
      const s = await p.evaluate(() => ({ t6: window.__lxm.t6 || 0, t6d: window.__lxm.t6d || 0, kph: window.__lxm.kph }));
      if (!far && s.t6 >= 0.999 && s.kph === 1) { far = y; LOG.mainFar = s; }
      if (far && !near && s.t6d > 0) { const y2 = y; await p.evaluate((y) => window.scrollTo(0, y), Math.round(far + (y2 - far) * 0.6)); await sleep(4000); await shot('main-kgz-country'); await p.evaluate((y) => window.scrollTo(0, y), y2); near = 'mid'; }
      if (near === 'mid' && s.t6d >= 0.999) { await sleep(4500); await shot('main-kgz-district'); near = true; LOG.mainNear = s; }
    }
  });
  await scene('lxmap', async () => {
    await p.goto(`${APP}${V}lx-map/`, { waitUntil: 'domcontentloaded' });
    await wf(() => document.querySelector('.lm-groups') && window.__lm?.map, null, 90000); await sleep(1500);
    const b = p.locator('.lm-groups button, .lm-groups [role="checkbox"]').first();   // 첫 결과 층 켜기
    if (await b.count()) { await b.click(); await sleep(4000); }
    await p.waitForFunction(() => !window.__lm.map.isMoving() && window.__lm.map.areTilesLoaded(), null, { timeout: 30000 }).catch(() => {}); await sleep(1500);
    LOG.lxmapText = await p.evaluate(() => ({ hint: !!document.querySelector('.lm-hint'), bn: !!document.querySelector('.lm-bn'), has: /도형을 누르면|촬영 시기가 다른/.test(document.body.innerText) }));
    await shot('lxmap');
  });
  const ready = () => wf(() => window.__xc?.map && window.__xc.boot?.shown && document.querySelector('.k-chat-root[data-dock]'), null, 120000);
  const settle = () => p.waitForFunction(() => !window.__xc.map.isMoving() && window.__xc.map.areTilesLoaded(), null, { timeout: 30000 }).catch(() => {});
  const jump = async (c, z) => { await p.evaluate(([c, z]) => window.__xc.map.jumpTo({ center: c, zoom: z }), [c, z]); await sleep(800); await settle(); await sleep(2500); };
  await scene('xi', async () => {
    await p.goto(`${APP}${V}xi-clean/?nation=kg`, { waitUntil: 'domcontentloaded' });
    await ready(); await wf(() => window.__xc.map.getLayer('xn-kg-f'), null, 60000); await settle(); await sleep(3000);
    await shot('xi-kg-country');
    await jump([76.85, 42.55], 9);              // 추이 · 이식쿨 사이 군들(나라 보기보다 가까이)
    await shot('xi-kg-z9');
    await jump([74.85, 42.86], 11.5);           // 이식아타 군 평야
    await shot('xi-kg-z11');
    await jump([74.85, 42.86], 13.5);
    await shot('xi-kg-z13');
    await jump([74.33, 42.83], 13);             // 소쿨룩 군
    await shot('xi-kg-sokuluk-z13');
  });
  await scene('sugg', async () => {
    await p.goto(`${APP}${V}xi-clean/?nation=kg`, { waitUntil: 'domcontentloaded' });
    await ready(); await wf(() => window.__xc.map.getLayer('xn-kg-f'), null, 60000); await settle(); await sleep(2000);
    // 군 하나를 누른다(지도 위 그 군 자리를 화면 좌표로)
    const pt = await p.evaluate(() => { const m = window.__xc.map, f = m.querySourceFeatures('xn-kg').find((x) => x.properties.name === 'Sokuluk'); if (!f) return null; const c = m.project([74.33, 42.75]); const r = m.getCanvas().getBoundingClientRect(); return [c.x + r.left, c.y + r.top]; });
    if (!pt) throw new Error('Sokuluk 군 없음');
    await p.mouse.click(pt[0], pt[1]); await sleep(2500); await settle();
    await p.locator('.k-chat-root[data-dock] .k-ck-i').click(); await sleep(800);
    LOG.sugg = await p.evaluate(() => [...document.querySelectorAll('.k-chat-root[data-dock] .k-chat-sugg .k-chat-chip')].map((b) => b.textContent.trim()));
    LOG.hud = await p.evaluate(() => document.querySelector('.xn-hud')?.innerText.replace(/\s+/g, ' ') || '');
    await shot('xi-kg-sugg');
    const chip = p.locator('.k-chat-root[data-dock] .k-chat-sugg .k-chat-chip').filter({ hasText: '경작지 넓이' }).first();
    await chip.click();
    await wf(() => { const m = [...document.querySelectorAll('.k-chat-root[data-dock] .k-chat-msg:not(.me)')].pop(); return m && !m.closest('[data-busy]') && /㎢|ha|km/.test(m.innerText) && document.querySelector('.k-chat-root[data-dock] .k-chat')?.dataset.state === 'done'; }, null, 120000);
    await sleep(1500);
    LOG.answer = await p.evaluate(() => [...document.querySelectorAll('.k-chat-root[data-dock] .k-chat-msg:not(.me)')].pop()?.innerText.replace(/\s+/g, ' ') || '');
    await shot('xi-kg-sugg-answer');
  });
}

/* ───────── LX 관리자 대시보드 — 장비 줄 '측정 멈춤' ───────── */
async function admin() {
  await frontDoor(p, ADMIN, 'lxadmin@lx.or.kr', 'ops');
  await p.waitForURL((u) => !/\/login\/?$/.test(u.pathname), { timeout: 30000 }); LOG.login_at = kst(); save();
  const rows = () => p.evaluate(() => [...document.querySelectorAll('ul li a span')].map((s) => s.textContent.trim()).filter(Boolean));
  const open = async () => { await p.goto(`${ADMIN}${V}ops-core/`, { waitUntil: 'domcontentloaded' }); await wf(() => /학습 장비/.test(document.body.innerText), null, 90000); await sleep(2000); };
  await scene('stale', async () => {
    // 흉내: 서버 응답 /ops/gpus 에 '오래된 값'(40분 전 측정)을 얹는다 — 화면 판단만 시험(서버 · 장비는 그대로)
    const old = new Date(Date.now() - 40 * 60000).toISOString();
    await p.route('**/ops/gpus*', async (route) => { const r = await route.fetch(); const j = await r.json(); j.measure_stale = { at: old, what: ['gpu', 'storage'] }; await route.fulfill({ response: r, json: j }); });
    await open();
    LOG.staleRows = await rows(); LOG.staleAt = old;
    await shot('admin-measure-stale');
    await p.unroute('**/ops/gpus*');
  });
  await scene('normal', async () => {
    await open();
    LOG.normalRows = await rows();
    LOG.normalApi = await p.evaluate(async () => { const s = JSON.parse(localStorage.getItem('lx.session') || sessionStorage.getItem('lx.session') || 'null'); return s ? null : null; });
    await shot('admin-measure-normal');
  });
}

try {
  if (ROLE === 'ov') await ov(); else if (ROLE === 'staff') await staff(); else if (ROLE === 'admin') await admin();
} catch (e) { LOG.fatal = String(e?.stack || e).slice(0, 600); console.log('치명', LOG.fatal); }
save(); await browser.close();
console.log(JSON.stringify({ role: ROLE, tag: TAG, failed: LOG._failed, errors: LOG.errors.length, bad: LOG.bad.length }));
