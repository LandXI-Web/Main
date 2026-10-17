/* 구현 40 · XI맵 지적 층 · 필지 카드 · 객체 소속 필지 · 끈 클래스 통계 · 변화 이름 한글 — 증거(바깥 주소 · 로그인 폼 · 세션 주입 0).
   node docs/superpowers/final/process/impl-40/ximap-parcel/shoot.mjs   (01. 디자인 에서)   ONLY=staff,gov(쉼표)
   → shots/*.png(파일 끝 네 자리 = 찍은 시각 · 저장소 밖 스테이징 금지) · run.json */
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
const OUT = path.join(DIR, 'shots');
fs.mkdirSync(OUT, { recursive: true });
const APP = process.env.APP || 'https://app.land-xi.dev';
const ONLY = new Set((process.env.ONLY || 'staff,gov').split(','));
const kst = () => new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' });
const hm = () => kst().slice(11, 16).replace(':', '');
const RF = path.join(DIR, 'run.json');
const prev = fs.existsSync(RF) ? JSON.parse(fs.readFileSync(RF, 'utf8')) : {};
const run = { ...prev, at: kst(), app: APP, shots: prev.shots || {}, staff: ONLY.has('staff') ? {} : (prev.staff || {}), gov: ONLY.has('gov') ? {} : prev.gov, errors: [], bad: [], local: [], fatal: null };
const save = () => fs.writeFileSync(RF, JSON.stringify(run, null, 1));
setTimeout(() => { run.timeout = true; save(); process.exit(2); }, 2400000).unref();

/* 장소(지역 고정값은 증거 스크립트의 시험 장소일 뿐 — 화면 코드에는 없음) */
const PLACES = {
  namwon: { name: '남원', centers: [[127.3786, 35.4153], [127.3905, 35.4086], [127.4180, 35.3990], [127.3480, 35.5277]] },
  hamyang: { name: '함양', centers: [[127.7253, 35.5205], [127.7180, 35.5150], [127.7400, 35.5300]] },
  jeju: { name: '제주', centers: [[126.5312, 33.4996], [126.5250, 33.4990]] },
};

const browser = await chromium.launch({ channel: 'chrome', headless: true });
async function session(login, label) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  p.on('console', (m) => { if (m.type() === 'error') run.errors.push(`${label} ${kst().slice(11)} ${m.text().slice(0, 300)}`); });
  p.on('pageerror', (e) => run.errors.push(`${label} ${kst().slice(11)} pageerror ${String(e).slice(0, 300)}`));
  p.on('request', (r) => { if (/\/\/(127\.0\.0\.1|localhost|\[::1\])|:8700|:4173/.test(r.url())) run.local.push(r.url()); });
  p.on('response', (r) => { if (r.status() >= 400 && !/favicon/.test(r.url())) run.bad.push(`${label} ${kst().slice(11)} ${r.status()} ${r.url().replace(/[?#].*$/, '').slice(0, 160)}`); });
  run._parcelCalls ||= 0;
  p.on('request', (r) => { if (/\/parcels\?/.test(r.url())) run._parcelCalls++; });
  await frontDoor(p, APP, login, 'app');
  await p.waitForURL((u) => !/\/login\/?$/.test(u.pathname), { timeout: 30000 }).catch(() => {});
  return { ctx, p };
}
const shot = async (p, name) => { const f = `${name}-1440-${hm()}.png`; await p.screenshot({ path: path.join(OUT, f) }); run.shots[f] = kst(); return f; };
const settle = (p) => p.waitForFunction(() => !window.__xc.map.isMoving() && window.__xc.map.areTilesLoaded(), null, { timeout: 30000 }).catch(() => {});
async function home(p, lx) {
  const base = /\/landxi\//.test(p.url()) ? new URL(p.url()).origin : APP;     // 기관 = 기관 주소(로그인 뒤 그 주소 그대로)
  await p.goto(base + '/landxi/v3/xi-clean/', { waitUntil: 'commit' });
  await p.waitForFunction((lx) => window.__xc?.map && window.__xc.boot?.shown && (!lx || window.__xc?.board?.nat?.layers?.length > 0), lx, { timeout: 90000, polling: 200 });
  await settle(p); await p.waitForTimeout(1200);
}
async function jump(p, c, z) {
  await p.evaluate(([c, z]) => { window.__xc.map.jumpTo({ center: c, zoom: z }); }, [c, z]);
  await p.waitForTimeout(600); await settle(p); await p.waitForTimeout(900);
}
/** 화면을 격자로 훑어 객체 있는 점 · 없는 점(가운데에 가까운 것부터) */
async function scan(p, want = null, max = 3) {
  return p.evaluate(([want, max]) => {
    const m = window.__xc.map, W = m.getCanvas().clientWidth, H = m.getCanvas().clientHeight, objs = [], empty = [];
    const pts = [];
    for (let y = 180; y < H - 200; y += 24) for (let x = 340; x < W - 420; x += 24) pts.push([x, y]);
    pts.sort((a, b) => Math.hypot(a[0] - W / 2, a[1] - H / 2) - Math.hypot(b[0] - W / 2, b[1] - H / 2));
    for (const [x, y] of pts) {
      const o = window.__xc.objectsAt ? window.__xc.objectsAt(x, y) : [];
      const r = m.getCanvas().getBoundingClientRect();
      if (o.length === 1 && objs.length < max && (!want || o[0].cls === want) && !objs.some((q) => Math.hypot(q[0] - x - r.left, q[1] - y - r.top) < 60)) objs.push([x + r.left, y + r.top, o[0].cls]);
      else if (!o.length && empty.length < 3) {
        const near = window.__xc.objectsAt ? [[-30, 0], [30, 0], [0, -30], [0, 30]].some(([dx, dy]) => window.__xc.objectsAt(x + dx, y + dy).length) : false;
        if (!near) empty.push([x + r.left, y + r.top]);
      }
      if (objs.length >= max && empty.length >= 3) break;
    }
    return { objs, empty };
  }, [want, max]);
}
async function layersPop(p, open = true) {
  const isOpen = await p.evaluate(() => !document.querySelector('.xc-pop')?.hidden && !!document.querySelector('.xc-pop [data-cad]'));
  if (isOpen !== open) await p.locator('.xc-tool[data-tool="layers"]').click();
  await p.waitForTimeout(400);
}
const cadState = (p) => p.evaluate(() => { const r = document.querySelector('.xc-pop [data-cad]'); const cb = r?.querySelector('.xc-cb');
  return r ? { checked: r.getAttribute('aria-checked'), far: r.classList.contains('is-far'), cbOpacity: cb ? getComputedStyle(cb).opacity : null, text: r.innerText.trim(),
    zoom: +window.__xc.map.getZoom().toFixed(2), lxmapVis: window.__xc.map.getLayoutProperty('xc-lxmap', 'visibility'), font: parseFloat(getComputedStyle(r.querySelector('span')).fontSize) } : null; });
const cardState = (p) => p.evaluate(() => { const c = document.querySelector('.xp-card'); if (!c || c.hidden) return null;
  const small = []; for (const el of c.querySelectorAll('*')) { if (!el.textContent.trim() || el.children.length) continue; const fs = parseFloat(getComputedStyle(el).fontSize); if (fs < 14) small.push([el.className, fs]); }
  return { text: c.innerText.replace(/\s+/g, ' ').trim(), parcel: window.__xc.parcel, small }; });

/** 한 장소: 지적 켜기 → 필지 카드 · (객체 있으면) 소속 필지 */
async function place(p, key, who, { obj = true } = {}) {
  const P = PLACES[key], out = { place: P.name };
  let sc = null, c0 = null;
  for (const c of P.centers) { await jump(p, c, 17.6); sc = await scan(p); c0 = c; if (!obj || sc.objs.length) break; }
  out.center = c0; out.scan = { objs: sc.objs.length, empty: sc.empty.length };
  out.cursorEmptyBefore = await p.evaluate(() => window.__xc.map.getCanvas().style.cursor || '(지도 기본)');
  await layersPop(p, true);
  if ((await cadState(p))?.checked !== 'true') await p.locator('.xc-pop [data-cad]').click();
  await p.waitForTimeout(500); await settle(p); await p.waitForTimeout(1500);
  out.cadOn = await cadState(p);
  out.lxmapTiles = await p.evaluate(() => { const s = window.__xc.map.style.sourceCaches?.['xc-lxmap'] || window.__xc.map.style.tileManagers?.['xc-lxmap']; try { return Object.keys(s._tiles || {}).length; } catch { return null; } });
  await shot(p, `${who}-${key}-cad-on`);
  await layersPop(p, false);
  if (sc.empty[0]) {
    const [x, y] = sc.empty[0];
    await p.mouse.move(x, y); await p.waitForTimeout(250);
    out.cursorEmptyCadOn = await p.evaluate(() => window.__xc.map.getCanvas().style.cursor || '(지도 기본)');
    await p.mouse.click(x, y);
    await p.waitForFunction(() => window.__xc.parcel || document.querySelector('.xp-card .xe-wait')?.textContent.includes('못'), null, { timeout: 30000 }).catch(() => {});
    await p.waitForTimeout(900);
    out.card = await cardState(p);
    await shot(p, `${who}-${key}-parcel-card`);
    // 같은 필지 다시 누르기 → 서버 호출 0
    const n0 = run._parcelCalls;
    await p.mouse.click(x + 4, y + 3); await p.waitForTimeout(900);
    out.sameParcelRecallCalls = run._parcelCalls - n0;
  }
  if (obj && sc.objs[0]) {
    await p.evaluate(() => { window.__xc.parcel = null; document.querySelector('.xp-card:not([hidden]) .xa-x')?.click(); });
    await p.waitForTimeout(300);
    const [x, y, cls] = sc.objs[0];
    await p.mouse.move(x, y); await p.waitForTimeout(250);
    out.cursorObject = await p.evaluate(() => window.__xc.map.getCanvas().style.cursor);
    await p.mouse.click(x, y);
    await p.waitForFunction(() => document.querySelector('.xe-card:not(.xp-card):not([hidden]) .xe-pcl:not([hidden])'), null, { timeout: 30000 }).catch(() => {});
    await p.waitForTimeout(700);
    out.object = await p.evaluate(() => { const c = document.querySelector('.xe-card:not(.xp-card):not([hidden])'); return c ? { line: c.querySelector('.xe-pcl')?.innerText || null, first: c.firstElementChild?.className, head: c.querySelector('h3')?.innerText,
      lineFont: c.querySelector('.xe-pcl') ? parseFloat(getComputedStyle(c.querySelector('.xe-pcl')).fontSize) : null } : null; });
    out.object && (out.object.cls = cls);
    await shot(p, `${who}-${key}-object-parcel`);
    await p.keyboard.press('Escape');
    await p.evaluate(() => document.querySelector('.xe-card:not(.xp-card) .xa-x')?.click());
  }
  return out;
}

async function staff() {
  const { ctx, p } = await session('test@lx.or.kr', 'staff');
  await home(p, true);
  const S = run.staff;
  const ALL = ONLY.has('staff');
  if (ALL) {
  // 지적 줄 — 먼 축척(흐림) · 가까이(또렷)
  await jump(p, PLACES.namwon.centers[0], 15.2);
  await layersPop(p, true);
  if ((await cadState(p))?.checked !== 'true') await p.locator('.xc-pop [data-cad]').click();
  await p.waitForTimeout(500);
  S.far = await cadState(p);
  await shot(p, 'staff-cad-far');
  await p.locator('.xc-pop [data-cad]').click();          // 다시 끔(장소마다 켬)
  await layersPop(p, false);
  S.namwon = await place(p, 'namwon', 'staff');
  S.hamyang = await place(p, 'hamyang', 'staff');
  S.jeju = await place(p, 'jeju', 'staff', { obj: false });
  }
  if (ALL || ONLY.has('miss')) {
  if (!ALL) { await layersPop(p, true); if ((await cadState(p))?.checked !== 'true') await p.locator('.xc-pop [data-cad]').click(); await layersPop(p, false); }
  // 지목과 어긋남 — 남원 시가지 · 논밭 사이 건물 객체를 차례로 눌러(고치기 칸 → 소속 필지 줄 → 필지 카드) 지목이 농지인 필지에서 '농지 위 건물'
  S.miss = { tried: [] };
  for (const c of [[127.3786, 35.4153], [127.4180, 35.3990], [127.3905, 35.4086]]) {
    await jump(p, c, 17.8);
    const sc = await scan(p, '건물', 12);
    for (const [x, y] of sc.objs) {
      await p.evaluate(() => { window.__xc.parcel = null; document.querySelector('.xp-card:not([hidden]) .xa-x')?.click(); });
      await p.mouse.click(x, y);
      const ok = await p.waitForFunction(() => document.querySelector('.xe-card:not(.xp-card):not([hidden]) .xe-pcl:not([hidden])'), null, { timeout: 20000 }).then(() => true, () => false);
      if (!ok) continue;
      const line = await p.evaluate(() => document.querySelector('.xe-card:not(.xp-card):not([hidden]) .xe-pcl').innerText);
      if (!/ · (답|전|과수원|하천|구거|도로|제방|유지|임야) · /.test(line)) { await p.evaluate(() => document.querySelector('.xe-card:not(.xp-card) .xa-x')?.click()); S.miss.tried.push(line); continue; }
      await shot(p, 'staff-miss-object');
      await p.locator('.xe-card:not(.xp-card):not([hidden]) .xe-pcl').click();
      await p.waitForFunction(() => window.__xc.parcel, null, { timeout: 20000 }).catch(() => {});
      await p.waitForTimeout(700);
      const got = await p.evaluate(() => window.__xc.parcel);
      S.miss.tried.push(line + ' → ' + JSON.stringify(got?.miss || null));
      if (got?.miss?.length) { S.miss.card = await cardState(p); await shot(p, 'staff-miss-card'); break; }
    }
    if (S.miss.card) break;
  }
  await p.evaluate(() => document.querySelector('.xp-card:not([hidden]) .xa-x')?.click());
  }
  if (!ALL) { await ctx.close(); return; }
  // 변화 탐지 이름 — 남원 변화 결과 자리의 클래스 목록
  await jump(p, [127.3486, 35.5279], 15.5);
  await layersPop(p, true);
  await p.waitForTimeout(800);
  S.classes = await p.evaluate(() => [...document.querySelectorAll('.xc-pop .xc-row--cls[data-cls]')].map((b) => [b.dataset.cls, b.innerText.trim()]));
  await shot(p, 'staff-class-names');
  await layersPop(p, false);
  // 끈 클래스 → XI ChatGEO 지도 위 통계
  const say = async (q) => { const inp = p.locator('.k-chat-root[data-dock] .k-ck-i'); await inp.click(); await inp.fill(''); await inp.pressSequentially(q, { delay: 15 }); await inp.press('Enter'); };
  const ask = async (q) => { await p.evaluate(() => { window.__xc.dash = null; }); await say(q);
    await p.waitForFunction(() => window.__xc.dash?.mode, null, { timeout: 90000 }).catch(() => {}); await p.waitForTimeout(2500);
    return p.evaluate(() => { const d = window.__xc.dash || {}; return { mode: d.mode, title: d.title, main: d.main, off: d.off || null,
      kpis: d.kpis || null }; }); };
  await jump(p, [127.39, 35.41], 11);
  S.statAll = await ask('남원시 현황 보여 줘');
  await shot(p, 'staff-stat-all');
  await p.evaluate(() => document.querySelector('.xo-mini .xa-x, .xo-mini button[aria-label="닫기"]')?.click());
  await layersPop(p, true);
  const off = await p.evaluate(() => { const r = [...document.querySelectorAll('.xc-pop .xc-row--cls[data-cls]')].find((b) => b.dataset.cls === '건물') || document.querySelector('.xc-pop .xc-row--cls[data-cls]'); r?.click(); return r?.dataset.cls || null; });
  await p.waitForTimeout(600);
  await layersPop(p, false);
  S.offClass = off;
  S.statOff = await ask('남원시 현황 보여 줘');
  S.visLabel = await p.evaluate(() => document.body.innerText.includes('보이는 것 기준'));
  await shot(p, 'staff-stat-off');
  await ctx.close();
}

async function gov() {
  const { ctx, p } = await session('lxadmin@lx.or.kr#namwon', 'gov');
  await p.waitForURL((u) => /\/landxi\/v3\/(?!gov-home\/|login\/)[a-z-]+\//.test(u.pathname), { timeout: 60000 }).catch(() => {});
  await home(p, false);
  const G = run.gov;
  G.url = p.url().replace(/[?#].*$/, '');
  G.namwon = await place(p, 'namwon', 'gov', { obj: false });
  // 같은 필지 — 기관 필지 카드(자세히 → 서랍) 숫자와 비교
  if (G.namwon.card) {
    await p.locator('.xp-card .xe-act .t-btn').click();
    await p.waitForFunction(() => document.querySelector('.xc-pi-l'), null, { timeout: 30000 }).catch(() => {});
    await p.waitForTimeout(800);
    G.drawer = await p.evaluate(() => Object.fromEntries([...document.querySelectorAll('.xc-pi-l > div')].map((d) => [d.querySelector('dt')?.innerText.trim(), d.querySelector('dd')?.innerText.replace(/\s+/g, ' ').trim()])));
    await shot(p, 'gov-namwon-drawer');
  }
  await ctx.close();
}

try {
  if (ONLY.has('staff') || ONLY.has('miss')) await staff();
  if (ONLY.has('gov')) await gov();
} catch (e) { run.fatal = String(e?.stack || e).slice(0, 800); }
delete run._parcelCalls; // 시험 계수만
save();
await browser.close();
console.log(JSON.stringify({ errors: run.errors.length, bad: run.bad.length, local: run.local.length, fatal: run.fatal || null }));
