/* 구현 38 · 작은 다섯 — 바깥 주소 · 로그인 폼(역할마다 한 번 · 세션 주입 0) 증거.
   node shoot.mjs [staff,admin,gov,global] [--noq]   →  shots/*.png · run.json
   staff  : 메뉴 칸(첫 화면 1280 · 1440 · 1920) + XI맵 질문 일곱의 지도 색(밀도 색 기준)
   admin  : 메뉴 칸
   gov    : 메뉴 칸 + 기관 XI맵(가벼운 조각으로 그려진 모습)
   global : 해외 첫 화면 — 처음(저장 비움 · 비행) → 다시(바로 지역) · 대장 칠(Season 숨김 · Register 보임) · 저장이 막힌 창 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';

const ROOT = 'E:/Land-XI 플랫폼/01. 디자인';
const HW = 'C:/Users/User/AppData/Local/ms-playwright';
if (fs.existsSync(HW)) process.env.PLAYWRIGHT_BROWSERS_PATH = HW;
if (!process.env.DEV_PASSWORD) { const m = fs.readFileSync(path.join(ROOT, 'server/.env'), 'utf8').match(/^DEV_PASSWORD=(.*?)\s*$/m); if (m) process.env.DEV_PASSWORD = m[1]; }
process.env.LX_PW ||= process.env.DEV_PASSWORD;
const { chromium } = createRequire(path.join(ROOT, 'package.json'))('playwright');
const { frontDoor } = await import(pathToFileURL(path.join(ROOT, 'landxi/v3/kit/lint/forbidden.mjs')).href);
const DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(DIR, 'shots'); fs.mkdirSync(OUT, { recursive: true });
const APP = 'https://app.land-xi.dev', GOV = 'https://namwon.land-xi.dev';
const GROUPS = (process.argv[2] || 'staff,admin,gov,global').split(',');
const NOQ = process.argv.includes('--noq');
const kst = () => new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' });
const hm = () => kst().slice(11, 16).replace(':', '');
const RF = path.join(DIR, 'run.json');
const run = fs.existsSync(RF) ? JSON.parse(fs.readFileSync(RF, 'utf8')) : {};
const save = () => fs.writeFileSync(RF, JSON.stringify(run, null, 1));

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
async function ctxFor(name, w = 1440) {
  const ctx = await browser.newContext({ viewport: { width: w, height: w >= 1920 ? 1080 : w >= 1440 ? 900 : 720 } });
  const p = await ctx.newPage();
  const R = (run[name] = { at: kst(), errors: [], bad: [] });
  p.on('console', (m) => { if (m.type() === 'error') R.errors.push(m.text().slice(0, 240)); });
  p.on('pageerror', (e) => R.errors.push('pageerror ' + String(e).slice(0, 240)));
  p.on('response', (r) => { if (r.status() >= 400 && !/favicon/.test(r.url())) R.bad.push(`${r.status()} ${r.url().replace(/[?#].*$/, '').slice(0, 140)}`); });
  const shot = async (n) => { const f = `${name}-${n}-${p.viewportSize().width}-${hm()}.png`; await p.screenshot({ path: path.join(OUT, f) }); (R.shots ||= []).push(f); return f; };
  return { ctx, p, R, shot };
}
/** 메뉴 칸 — 칸 폭 · 메뉴 글이 몇 줄인지 · 가로 넘침 */
const railInfo = (p) => p.evaluate(() => {
  const rail = document.querySelector('.k-rail');
  if (!rail || !rail.getClientRects().length) return null;
  const items = [...rail.querySelectorAll('.k-rail-i')].map((it) => {
    const s = it.querySelector(':scope > span:last-child'); if (!s) return null;
    const cs = getComputedStyle(s), lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2;
    return { t: s.textContent.trim(), lines: Math.round(s.getBoundingClientRect().height / lh), fs: parseFloat(cs.fontSize), w: Math.round(it.getBoundingClientRect().width) };
  }).filter(Boolean);
  const main = document.querySelector('.k-app > main, .k-main, main');
  return { railW: Math.round(rail.getBoundingClientRect().width), items, twoLine: items.filter((x) => x.lines > 1).map((x) => x.t),
    overflowX: document.documentElement.scrollWidth > innerWidth + 1, mainL: main ? Math.round(main.getBoundingClientRect().left) : null };
});
async function railAt(p, R, shot, label) {
  for (const w of [1280, 1440, 1920]) {
    await p.setViewportSize({ width: w, height: w >= 1920 ? 1080 : w >= 1440 ? 900 : 720 });
    await p.waitForTimeout(900);
    const info = await railInfo(p);
    (R.rail ||= []).push({ page: label, w, ...info });
    await shot(`${label}-rail`);
  }
  await p.setViewportSize({ width: 1440, height: 900 });
}

if (GROUPS.includes('staff')) {
  const { ctx, p, R, shot } = await ctxFor('staff');
  await frontDoor(p, APP, 'test@lx.or.kr', 'app');
  await p.waitForURL((u) => !/\/login\/?$/.test(u.pathname), { timeout: 30000 }); await p.waitForTimeout(3000);
  R.landing = new URL(p.url()).pathname;
  await railAt(p, R, shot, 'home');
  if (!NOQ) {
    const QS = [['d1', '남원시 현황 보여 줘'], ['d2', '남원시 비닐하우스 어디가 많아?'], ['d3', '남원시 농지 이용 실태 어때?'], ['d4', '전국 분석 얼마나 진행됐어?'],
      ['d5', '남원시 함양군 비교해 줘'], ['d6', '남원시 지목별 공시지가 통계'], ['d7', '함양군 현황 보여 줘']];
    await p.goto(APP + '/landxi/v3/xi-clean/', { waitUntil: 'commit' });
    await p.waitForFunction(() => window.__xc?.board?.nat?.layers?.length > 0 && window.__xc.boot?.shown && document.querySelector('.k-chat-root[data-dock]'), null, { timeout: 60000, polling: 100 });
    const settle = () => p.waitForFunction(() => !window.__xc.map.isMoving() && window.__xc.map.areTilesLoaded(), null, { timeout: 25000 }).catch(() => {});
    await settle(); await p.waitForTimeout(1200);
    await p.locator('.xo-sw button[data-v="map"]').click().catch(() => {});
    R.q = {};
    for (const [id, q] of QS) {
      await p.evaluate(() => { window.__xc.dash = null; });
      const inp = p.locator('.k-chat-root[data-dock] .k-ck-i');
      await inp.click(); await inp.fill(''); await inp.pressSequentially(q, { delay: 20 }); await inp.press('Enter');
      const ok = await p.waitForFunction(() => window.__xc.dash?.mode === 'map' && window.__xc.dash.fill === 'running', null, { timeout: 60000 }).then(() => true, () => false);
      if (!ok) { R.q[id] = { q, fail: true }; await shot(id + '-fail'); continue; }
      await p.waitForFunction(() => window.__xc.dash?.fill === 'done', null, { timeout: 20000 }).catch(() => {});
      await settle(); await p.waitForTimeout(900);
      R.q[id] = { q, ...(await p.evaluate(() => {
        const vals = Object.values(window.__xc.map.getSource('xo-f')?._data?.features || []).map((f) => f.properties.col).filter(Boolean);
        const cnt = {}; for (const c of vals) cnt[c] = (cnt[c] || 0) + 1;
        return { map: window.__xc.dash?.map, colors: cnt, legend: document.querySelector('.xo-mp')?.innerText.replace(/\s+/g, ' ').trim(), tags: [...document.querySelectorAll('.xo-tag')].map((t) => t.innerText.replace(/\s+/g, ' ')) };
      })) };
      await shot(id + '-fill');
      await p.waitForFunction(() => window.__xc.dash?.tour && window.__xc.dash.tour !== null, null, { timeout: 30000 }).catch(() => {});
      await p.locator('.xo-x').click().catch(() => {}); await p.waitForTimeout(1500); await settle();
      save();
    }
  }
  save(); await ctx.close();
}

if (GROUPS.includes('admin')) {
  const { ctx, p, R, shot } = await ctxFor('admin');
  await frontDoor(p, APP, 'lxadmin@lx.or.kr', 'app');
  await p.waitForURL((u) => !/\/login\/?$/.test(u.pathname), { timeout: 30000 }); await p.waitForTimeout(3500);
  R.landing = new URL(p.url()).pathname;
  await railAt(p, R, shot, 'home');
  save(); await ctx.close();
}

if (GROUPS.includes('gov')) {
  const { ctx, p, R, shot } = await ctxFor('gov');
  await frontDoor(p, GOV, 'lxadmin@lx.or.kr#namwon');
  await p.waitForTimeout(3500);
  R.landing = new URL(p.url()).pathname;
  await railAt(p, R, shot, 'home');
  // 기관 XI맵(서비스로 열기) — 가벼운 조각으로 그려진 시군구 전체
  const t0 = Date.now();
  await p.goto(GOV + '/landxi/v3/xi-clean/?service=card-farm', { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => { const m = window.__xc?.map; const ld = document.querySelector('.k-ld.is-on'); return m && window.__xc.boot?.shown && !ld && !m.isMoving() && m.areTilesLoaded(); }, null, { timeout: 40000, polling: 150 }).catch(() => {});
  await p.waitForTimeout(800);
  R.ximap = { ms: Date.now() - t0, zoom: await p.evaluate(() => +window.__xc.map.getZoom().toFixed(2)) };
  await shot('ximap');
  await railAt(p, R, shot, 'ximap');
  save(); await ctx.close();
}

if (GROUPS.includes('global')) {
  const { ctx, p, R, shot } = await ctxFor('global');
  await p.addInitScript(() => {
    window.__lv = []; const t0 = performance.now();
    const go = () => new MutationObserver((ms) => { for (const m of ms) { const v = m.target.getAttribute(m.attributeName); window.__lv.push([Math.round(performance.now() - t0), m.attributeName, v]); } })
      .observe(document.documentElement, { attributes: true, subtree: true, attributeFilter: ['data-level', 'data-state'] });
    if (document.documentElement) go(); else document.addEventListener('readystatechange', go, { once: true });
  });
  await frontDoor(p, APP, 'lxadmin@lx.or.kr#kgz-agri');
  await p.waitForTimeout(1500);
  const base = new URL(p.url()).origin;
  const open = async (label) => {
    const t0 = Date.now();
    await p.goto(base + '/landxi/v3/global/', { waitUntil: 'domcontentloaded' });
    await p.waitForFunction(() => document.body.dataset.state === 'ready', null, { timeout: 60000, polling: 100 }).catch(() => {});
    const ms = Date.now() - t0;
    await p.waitForTimeout(1200);
    const s = await p.evaluate(() => ({ lv: window.__lv, level: document.querySelector('[data-level]')?.dataset.level, district: document.querySelector('.gl-crumb.is-now')?.textContent || '',
      store: (() => { try { return Object.keys(localStorage).filter((k) => k.startsWith('lx.global.last')).map((k) => [k.replace(/\.[^.]+$/, '.…'), localStorage.getItem(k)]); } catch { return 'blocked'; } })() }));
    const flew = s.lv.some((x) => x[1] === 'data-level' && x[2] === 'country');      // 나라 단계를 거쳤나(= 글로브 → 나라 → 지역 비행)
    (R.visits ||= []).push({ label, readyMs: ms, flew, level: s.level, district: s.district, store: s.store, seq: s.lv.map((x) => `${x[0]} ${x[2]}`).join(' · ') });
    await shot(label);
    save();
  };
  const regVis = () => p.evaluate(() => { const el = [...document.querySelectorAll('*')].find((n) => n.__stage?.map); const m = el?.__stage.map; return m && m.getLayer('gl-reg-f') ? m.getLayoutProperty('gl-reg-f', 'visibility') : 'no-layer'; });
  // 처음 방문 — 이 사람의 '마지막 지역' 기억을 지운 뒤
  await p.evaluate(() => { try { Object.keys(localStorage).filter((k) => k.startsWith('lx.global.last')).forEach((k) => localStorage.removeItem(k)); } catch { /* */ } });
  await open('first');
  // 대장 칠 — Season(기본) · Register · 다시 Season
  await p.waitForTimeout(1500);
  R.reg = { season: await regVis() };
  await p.locator('.gl-tab', { hasText: 'Register' }).click(); await p.waitForTimeout(1800);
  R.reg.register = await regVis(); await shot('tab-register');
  await p.locator('.gl-tab', { hasText: 'Season' }).click(); await p.waitForTimeout(1500);
  R.reg.seasonAgain = await regVis(); await shot('tab-season');
  // 두 번째 방문 — 주소에 지역 없이 다시 열기
  await open('second');
  await open('third');
  save(); await ctx.close();
  // 저장이 막힌 창 — 저장을 쓰지 못해도 처음처럼 비행해 지역에 닿는다
  const c2 = await ctxFor('global-nostore');
  await c2.p.addInitScript(() => { const g = Storage.prototype.getItem, s = Storage.prototype.setItem;   // '마지막 지역' 저장만 막는다(로그인 저장은 그대로)
    Storage.prototype.getItem = function (k) { if (String(k).startsWith('lx.global.last')) throw new Error('blocked'); return g.call(this, k); };
    Storage.prototype.setItem = function (k, v) { if (String(k).startsWith('lx.global.last')) throw new Error('blocked'); return s.call(this, k, v); }; });
  await frontDoor(c2.p, APP, 'lxadmin@lx.or.kr#kgz-agri');
  const t0 = Date.now();
  await c2.p.waitForFunction(() => document.body.dataset.state === 'ready', null, { timeout: 60000, polling: 100 }).catch(() => {});
  c2.R.readyMs = Date.now() - t0; c2.R.district = await c2.p.evaluate(() => document.querySelector('.gl-crumb.is-now')?.textContent || '');
  await c2.shot('nostore');
  save(); await c2.ctx.close();
}
await browser.close();
console.log(JSON.stringify(Object.fromEntries(Object.entries(run).map(([k, v]) => [k, { errors: v.errors?.length, bad: v.bad?.length, rail: (v.rail || []).map((r) => `${r.page}@${r.w} w${r.railW} two:${r.twoLine?.join('/') || 0} ox:${r.overflowX}`), visits: v.visits, reg: v.reg, ximap: v.ximap }])), null, 1));
