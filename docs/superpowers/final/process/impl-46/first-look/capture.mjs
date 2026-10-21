/* 첫인상-1~10 (impl-46 first-look) — 주요 화면을 바깥 주소 로그인 폼으로 열어 그림 · 시간 · 넘침만 모은다.
   node capture.mjs <tag>   → ./shots/<tag>/*.png · ./<tag>.json
   로그인은 로그인 폼(frontDoor)만. 비밀번호는 server/.env 에서 읽고 출력하지 않는다. 주소는 쿼리를 지우고 적는다.
   저장 · 제출 · 승인 단추는 누르지 않는다. */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';

const ROOT = 'E:/Land-XI 플랫폼/01. 디자인';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const TAG = process.argv[2] || 'before';
const ONLY = (process.argv[3] || 'guest,app,admin,gov').split(',');
const SHOTS = path.join(HERE, 'shots', TAG); fs.mkdirSync(SHOTS, { recursive: true });
const HW = 'C:/Users/User/AppData/Local/ms-playwright';
if (fs.existsSync(HW)) process.env.PLAYWRIGHT_BROWSERS_PATH = HW;
if (!process.env.DEV_PASSWORD) { const m = fs.readFileSync(path.join(ROOT, 'server/.env'), 'utf8').match(/^DEV_PASSWORD=(.*?)\s*$/m); if (m) process.env.DEV_PASSWORD = m[1]; }
const { chromium } = createRequire(path.join(ROOT, 'package.json'))('playwright');
const { frontDoor } = await import(pathToFileURL(path.join(ROOT, 'landxi/v3/kit/lint/forbidden.mjs')).href);
const PW = process.env.DEV_PASSWORD;
const APP = 'https://app.land-xi.dev', ADMIN = 'https://admin.land-xi.dev', GOV = 'https://namwon.land-xi.dev', V = '/landxi/v3/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clean = (u) => String(u).replace(/[?#].*$/, '');
const OUT = path.join(HERE, TAG + '.json');
const R = [];
const save = () => fs.writeFileSync(OUT, JSON.stringify(R, null, 1));

/* '불러오는 중' 구간을 잰다 — 사라지고 1초 조용하면 끝 */
async function settle(p, to = 30000) {
  const start = Date.now(); const spans = []; let active = null, calm = null;
  while (Date.now() - start < to) {
    const busy = await p.evaluate(() => /불러오는 중|서버 응답이 늦습니다/.test(document.body?.innerText || '') || !!document.querySelector('.k-loader:not([hidden])')).catch(() => false);
    if (busy) { if (active === null) active = Date.now() - start; calm = null; }
    else { if (active !== null) { spans.push([active, Date.now() - start]); active = null; } calm ??= Date.now(); if (Date.now() - calm > 1000) break; }
    await sleep(100);
  }
  if (active !== null) spans.push([active, Date.now() - start]);
  return { settleMs: Date.now() - start - 1000, loading: spans };
}
/* 눈에 보이는 잘림: 글이 있는 요소의 scrollWidth > clientWidth+3 이고 overflow 가 숨김/말줄임 · 화면 밖으로 나간 글 · 문서 가로 넘침 */
const measure = (p) => p.evaluate(() => {
  const W = innerWidth, clip = [];
  for (const el of document.querySelectorAll('body *')) {
    if (!el.offsetParent || !el.childNodes.length) continue;
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!own) continue;
    const cs = getComputedStyle(el), r = el.getBoundingClientRect();
    if (r.width < 4 || r.bottom < 0 || r.top > innerHeight) continue;
    if (el.scrollWidth > el.clientWidth + 3 && /hidden|clip/.test(cs.overflowX + cs.overflow) && cs.textOverflow !== 'ellipsis') clip.push(el.textContent.trim().slice(0, 30));
    else if (r.right > W + 2 && cs.position !== 'fixed') clip.push('밖:' + el.textContent.trim().slice(0, 30));
  }
  const vis = (document.body.innerText || '').replace(/\s+/g, '');
  return { hScroll: document.documentElement.scrollWidth - W, docH: document.documentElement.scrollHeight, viewH: innerHeight, clip: clip.slice(0, 12), chars: vis.length,
    loadingWords: (document.body.innerText.match(/불러오는 중/g) || []).length };
});

async function shot(p, role, name, url, { mobile = true, before } = {}) {
  const rec = { role, name, url: clean(url) };
  try {
    await p.setViewportSize({ width: 1440, height: 900 });
    const t0 = Date.now();
    if (url) await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    if (before) await before(p);
    rec.domMs = Date.now() - t0;
    Object.assign(rec, await settle(p));
    rec.firstPaintMs = Date.now() - t0 - 1000;
    await sleep(800);
    rec.pc = await measure(p);
    await p.screenshot({ path: path.join(SHOTS, `${role}-${name}-1440.png`) });
    if (mobile) {
      await p.setViewportSize({ width: 390, height: 844 }); await sleep(1500);
      rec.mo = await measure(p);
      await p.screenshot({ path: path.join(SHOTS, `${role}-${name}-390.png`) });
    }
  } catch (e) { rec.error = String(e).slice(0, 200); }
  R.push(rec); save();
  console.log(`${role}/${name} settle ${rec.settleMs}ms load ${JSON.stringify(rec.loading)} h ${rec.pc?.hScroll}/${rec.mo?.hScroll} clip ${rec.pc?.clip?.length}/${rec.mo?.clip?.length}${rec.error ? ' ERR ' + rec.error : ''}`);
}

const browser = await chromium.launch({ channel: 'chrome', headless: true }).catch(() => chromium.launch());
async function ctxFor() { const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ko-KR' }); return [ctx, await ctx.newPage()]; }
async function doLogin(p, base, id, opts) {
  const t0 = Date.now(); let frames = 0, mapFlash = false;
  const watch = setInterval(async () => { frames++; const m = await p.evaluate(() => !!document.querySelector('.maplibregl-canvas') && !/lx-console|ops-core|gov-select|login|gov-home/.test(location.pathname) ? location.pathname : '').catch(() => ''); if (m) mapFlash = m; }, 150);
  await frontDoor(p, base, id, opts);
  await p.waitForURL((u) => !/\/login\/?$|gov-home/.test(u.pathname) && u.pathname !== '/', { timeout: 30000 }).catch(() => {});
  clearInterval(watch);
  const r = { role: 'login', name: id.split('@')[0] + (opts?.tenant ? '#' + opts.tenant : ''), loginMs: Date.now() - t0, landed: clean(p.url()), mapFlash };
  R.push(r); save(); console.log('login', r.name, r.loginMs, r.landed);
}

if (ONLY.includes('guest')) {
  const [ctx, p] = await ctxFor();
  await shot(p, 'guest', 'main', APP + '/');
  await shot(p, 'guest', 'login', APP + V + 'login/');
  await shot(p, 'guest', 'gov-home', GOV + '/');
  await ctx.close();
}
if (ONLY.includes('app')) {
  const [ctx, p] = await ctxFor();
  await doLogin(p, APP, 'test@lx.or.kr', { password: PW });
  await shot(p, 'app', 'console', null);
  await shot(p, 'app', 'cards', APP + V + 'lx-cards/');
  await shot(p, 'app', 'map', APP + V + 'lx-map/');
  await shot(p, 'app', 'ximap', APP + V + 'xi-clean/');
  await ctx.close();
}
if (ONLY.includes('admin')) {
  const [ctx, p] = await ctxFor();
  await doLogin(p, ADMIN, 'lxadmin@lx.or.kr', { password: PW });
  await shot(p, 'admin', 'overview', null);
  await shot(p, 'admin', 'deploys', ADMIN + V + 'ops-infra/?view=deploys');
  await shot(p, 'admin', 'tenants', ADMIN + V + 'ops-infra/?view=tenants');
  await shot(p, 'admin', 'approvals', ADMIN + V + 'ops-core/#/approvals');
  await ctx.close();
}
if (ONLY.includes('gov')) {
  const [ctx, p] = await ctxFor();
  await doLogin(p, GOV, 'lxadmin@lx.or.kr', { tenant: 'namwon', password: PW });
  await shot(p, 'gov', 'list', GOV + V + 'gov-select/?list=1');
  const svc = await p.evaluate(() => { const a = [...document.querySelectorAll('a[href*="service="]')].map((x) => x.getAttribute('href')); return a[0] || null; }).catch(() => null);
  if (svc) await shot(p, 'gov', 'service', new URL(svc, GOV + V + 'gov-select/').href);
  await shot(p, 'gov', 'request', GOV + V + 'gov-request/');
  await shot(p, 'gov', 'ximap', GOV + V + 'xi-clean/');
  await ctx.close();
}
await browser.close();
