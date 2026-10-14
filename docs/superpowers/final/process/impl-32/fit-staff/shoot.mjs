// 직원 화면 해상도 진단 — 바깥 주소 로그인 폼(LX 직원) 한 번 → 화면 × 5 해상도 캡처 + 측정
//   node diag.mjs <phase> [screen,screen,...]
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const ROOT = 'E:/Land-XI 플랫폼/01. 디자인';
const HW = 'C:/Users/User/AppData/Local/ms-playwright';
if (fs.existsSync(path.join(HW, 'chromium-1234'))) process.env.PLAYWRIGHT_BROWSERS_PATH = HW;
if (!process.env.DEV_PASSWORD) { const m = fs.readFileSync(path.join(ROOT, 'server/.env'), 'utf8').match(/^DEV_PASSWORD=(.*?)\s*$/m); if (m) process.env.DEV_PASSWORD = m[1]; }
process.env.LX_PW ||= process.env.DEV_PASSWORD;
const { chromium } = createRequire(path.join(ROOT, 'package.json'))('playwright');
const { frontDoor } = await import(pathToFileURL(path.join(ROOT, 'landxi/v3/kit/lint/forbidden.mjs')).href);

const APP = 'https://app.land-xi.dev';
const PHASE = process.argv[2] || 'before';
const ONLY = process.argv[3] ? process.argv[3].split(',') : null;
const RES = (process.env.RES || '1280x720,1366x768,1440x900,1920x1080,2560x1440').split(',').map((s) => s.split('x').map(Number));
const OUT = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), 'shots', PHASE);
fs.mkdirSync(OUT, { recursive: true });
const MF = path.join(OUT, 'metrics.json');
const M = fs.existsSync(MF) ? JSON.parse(fs.readFileSync(MF, 'utf8')) : {};
const save = () => fs.writeFileSync(MF, JSON.stringify(M, null, 1));
const errors = [];

/* 측정 — 화면 안(.k-main 우선) */
function measure() {
  const W = innerWidth, H = innerHeight;
  const vis = (el) => { const s = getComputedStyle(el); if (s.visibility === 'hidden' || s.display === 'none' || +s.opacity === 0) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const clippedBy = (el) => { for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const s = getComputedStyle(p); if (s.overflowX !== 'visible' || s.overflowY !== 'visible') return p; } return null; };
  const main = document.querySelector('.k-main') || document.body;
  const mr = main.getBoundingClientRect();
  const out = { vw: W, vh: H, docOverX: document.documentElement.scrollWidth - document.documentElement.clientWidth, bodyOverX: document.body.scrollWidth - document.body.clientWidth, main: [mr.x, mr.y, mr.width, mr.height].map(Math.round) };
  // 화면 밖으로 나간 요소(잘림 포함)
  const off = [], innerScroll = [], ellipsis = [], heads = [], orphans = [], grids = [];
  const all = [...document.querySelectorAll('body *')].filter((e) => !e.closest('.maplibregl-canvas-container, .maplibregl-map canvas, svg *, .k-dev, [hidden]'));
  let minX = 1e9, maxX = -1e9, maxY = -1e9, minY = 1e9;
  for (const el of all) {
    if (!vis(el)) continue;
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    if (s.position === 'fixed' && el.closest('.k-toast')) continue;
    const name = el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '');
    if (r.right > W + 1 && r.left < W) { const c = clippedBy(el); const cr = c?.getBoundingClientRect(); if (!c || cr.right > W + 1) off.push(name + ' ' + Math.round(r.right - W)); }
    if ((s.overflowX === 'auto' || s.overflowX === 'scroll') && el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0) innerScroll.push(name + ' ' + (el.scrollWidth - el.clientWidth));
    if (s.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1) ellipsis.push(name + ' «' + el.textContent.trim().slice(0, 24) + '»');
    // 내용 경계(main 안 잎 요소)
    if (main.contains(el) && el !== main && (el.children.length === 0 || /^(IMG|CANVAS|INPUT|BUTTON|TABLE|SELECT|TEXTAREA|svg)$/i.test(el.tagName))) {
      if (r.right <= mr.right + 1 && r.left >= mr.left - 1 && r.bottom > mr.top && r.top < mr.bottom && r.width < mr.width * 0.98) { minX = Math.min(minX, r.left); maxX = Math.max(maxX, r.right); maxY = Math.max(maxY, r.bottom); minY = Math.min(minY, r.top); }
    }
    // 제목 줄 수
    if (/^H[1-4]$/.test(el.tagName) || /(^|[-_])(title|tit|h|head|name)($|[-_\s])/.test(typeof el.className === 'string' ? el.className : '')) {
      const lh = parseFloat(s.lineHeight) || parseFloat(s.fontSize) * 1.3;
      if (el.children.length <= 2 && el.textContent.trim().length > 3) { const lines = Math.round(r.height / lh); if (lines > 2 && parseFloat(s.fontSize) >= 18) heads.push(name + ' ' + lines + '줄 «' + el.textContent.trim().slice(0, 20) + '»'); }
    }
    // 한 단어 줄(잎 글자)
    if (el.childElementCount === 0 && el.textContent.trim().split(/\s+/).length >= 3 && r.height > parseFloat(s.fontSize) * 1.9 && main.contains(el)) {
      const tn = [...el.childNodes].find((n) => n.nodeType === 3); if (tn) {
        const txt = tn.textContent; const re = /\S+/g; let m; const tops = [];
        while ((m = re.exec(txt))) { const rg = document.createRange(); rg.setStart(tn, m.index); rg.setEnd(tn, m.index + m[0].length); const rr = rg.getClientRects()[0]; if (rr) tops.push([Math.round(rr.top), m[0]]); }
        const lines = []; for (const [t, w] of tops) { const L = lines.find((l) => Math.abs(l.t - t) < 4); if (L) L.w.push(w); else lines.push({ t, w: [w] }); }
        if (lines.length >= 2 && lines[lines.length - 1].w.length === 1 && lines[lines.length - 1].w[0].length <= 4) orphans.push(name + ' «…' + lines[lines.length - 1].w[0] + '»');
      }
    }
    // 격자 열 수
    if ((s.display === 'grid' || s.display === 'flex' && s.flexWrap === 'wrap') && el.children.length >= 3 && main.contains(el)) {
      const kids = [...el.children].filter(vis); if (kids.length >= 3) {
        const tops = new Map(); for (const k of kids) { const t = Math.round(k.getBoundingClientRect().top); tops.set(t, (tops.get(t) || 0) + 1); }
        const cols = Math.max(...tops.values()); const ws = kids.map((k) => Math.round(k.getBoundingClientRect().width));
        const hs = kids.slice(0, cols).map((k) => Math.round(k.getBoundingClientRect().height));
        if (cols >= 2 && r.width > 300) grids.push({ el: name, cols, n: kids.length, w: Math.round(r.width), kidW: Math.min(...ws), h: [Math.min(...hs), Math.max(...hs)] });
      }
    }
  }
  out.off = [...new Set(off)].slice(0, 12); out.innerScroll = [...new Set(innerScroll)].slice(0, 8); out.ellipsis = [...new Set(ellipsis)].slice(0, 10);
  out.heads = [...new Set(heads)].slice(0, 8); out.orphans = [...new Set(orphans)].slice(0, 10); out.grids = grids.slice(0, 10);
  if (maxX > minX) { out.content = [minX, minY, maxX - minX, maxY - minY].map(Math.round); out.wPct = Math.round((maxX - minX) / mr.width * 100); out.bottomGapPct = Math.round((mr.bottom - maxY) / mr.height * 100); out.leftGap = Math.round(minX - mr.left); out.rightGap = Math.round(mr.right - maxX); }
  return out;
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
p.on('pageerror', (e) => errors.push(`${p.url()} ${e}`));
p.on('console', (m) => { if (m.type() === 'error') errors.push(`${p.url().replace(APP, '')} ${m.text().slice(0, 200)}`); });
await frontDoor(p, APP, 'test@lx.or.kr', 'app');
await p.waitForURL((u) => !/\/login\/?(\?|$)/.test(u.pathname), { timeout: 30000 });
await p.waitForTimeout(1500);
const pj = await p.evaluate(async () => { const { api } = await import('/landxi/v3/kit/util.js'); return api('/projects?scope=all'); });
const items = pj.items || [];
const proj = items.find((x) => /비닐하우스/.test(x.name)) || items[0];
const PID = proj.id;
const st = await p.evaluate(async (id) => { const c = await import('/landxi/v3/lx-project/context.js'); const pr = await c.loadProject(id); const o = {}; for (const s of c.STAGES) o[s.key] = c.stageHref(pr, s.key, (pr?.stages || []).find?.((x) => x.key === s.key)?.target || {}); return o; }, PID).catch(() => ({}));
const V = '/landxi/v3/';
const SCREENS = [
  ['dash', V + 'lx-console/'], ['projects', V + 'lx-project/'], ['newproj', V + 'lx-project/', async () => { await p.locator('.lxp-newb').first().click(); await p.waitForTimeout(1500); }],
  ['project', V + 'lx-project/?project=' + PID], ['ingest', st.ingest], ['label', st.label], ['train', st.train], ['infer', st.infer], ['review', st.review], ['publish', st.publish],
  ['analyze', V + 'lx-analyze/'], ['cards', V + 'lx-cards/'], ['mapsvc', V + 'lx-map/'], ['ximap', V + 'xi-clean/'], ['inbox', V + 'lx-inbox/'], ['help', V + 'help-my/'],
];
M._project = { PID, name: proj.name, st };
const settle = async () => { await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {}); await p.waitForTimeout(2200); };
for (const [id, url, prep] of SCREENS) {
  if (ONLY && !ONLY.includes(id)) continue;
  if (!url) { M[id] = { skip: 'no url' }; continue; }
  M[id] = { url: url.replace(/project=[^&]+/, 'project=…') };
  for (const [w, hgt] of RES) {
    await p.setViewportSize({ width: w, height: hgt });
    try {
      await p.goto(APP + url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await settle();
      for (let k = 0; k < 3 && /\/login\//.test(p.url()); k++) { console.log('relogin', id, w); await p.waitForTimeout(3000); await frontDoor(p, APP, 'test@lx.or.kr', 'app'); await p.waitForTimeout(2000); await p.goto(APP + url, { waitUntil: 'domcontentloaded', timeout: 45000 }); await settle(); }
      if (prep) await prep();
      if (id === 'ximap') await p.waitForTimeout(4000);
      const m = await p.evaluate(measure);
      M[id][w] = m;
      await p.screenshot({ path: path.join(OUT, `${id}-${w}.png`) });
      console.log(id, w, 'over', m.docOverX, 'off', m.off.length, 'w%', m.wPct, 'bot%', m.bottomGapPct);
    } catch (e) { M[id][w] = { err: String(e).slice(0, 200) }; console.log(id, w, 'ERR', String(e).slice(0, 120)); }
    save();
  }
}
// XI맵 채팅 · 대시보드 — 한 번 묻고 해상도만 바꾼다
if (!ONLY || ONLY.includes('xichat') || ONLY.includes('xidash')) {
  await p.setViewportSize({ width: 1440, height: 900 });
  await p.goto(APP + V + 'xi-clean/', { waitUntil: 'commit' });
  const ready = () => window.__xc?.board?.nat?.layers?.length > 0 && window.__xc.boot?.shown && document.querySelector('.k-chat-root[data-dock]');
  await p.waitForFunction(ready, null, { timeout: 60000, polling: 200 }).catch(() => {});
  await p.waitForTimeout(2500);
  const say = async (q) => { const inp = p.locator('.k-chat-root[data-dock] .k-ck-i'); await inp.click(); await inp.fill(q); await inp.press('Enter');
    await p.waitForFunction(() => document.querySelector('.k-chat')?.dataset.state && document.querySelector('.k-chat').dataset.state !== 'busy', null, { timeout: 90000 }).catch(() => {}); };
  const shootAll = async (id) => { M[id] = M[id] || {}; for (const [w, hgt] of RES) { await p.setViewportSize({ width: w, height: hgt }); await p.waitForTimeout(1800); const m = await p.evaluate(measure); M[id][w] = m; await p.screenshot({ path: path.join(OUT, `${id}-${w}.png`) }); console.log(id, w, 'over', m.docOverX, 'off', m.off.length); save(); } };
  if (!ONLY || ONLY.includes('xichat')) { await say('비닐하우스만 보여 줘'); await p.waitForTimeout(2500); await shootAll('xichat'); await p.setViewportSize({ width: 1440, height: 900 }); }
  if (!ONLY || ONLY.includes('xidash')) {
    await p.evaluate(() => { window.__xc.dash = null; });
    await say('남원시 비닐하우스 현황 보여 줘');
    const ok = await p.waitForFunction(() => window.__xc.dash?.title && !document.querySelector('.xd').hidden, null, { timeout: 90000 }).then(() => true, () => false);
    if (ok) { await p.waitForTimeout(3500); await shootAll('xidash'); } else M.xidash = { fail: true };
  }
}
M._errors = errors;
save();
console.log('errors', errors.length); errors.slice(0, 20).forEach((e) => console.log(' ', e));
await browser.close();
