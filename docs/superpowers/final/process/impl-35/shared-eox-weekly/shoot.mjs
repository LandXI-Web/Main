// impl-35 — 공유 데이터 상세 판 · 남은 비상업 영상(EOX) 교체 전/후. 바깥 주소 로그인 폼(세션 주입 0) · PC 1440.
//   node shoot.mjs --app https://app.land-xi.dev --admin https://admin.land-xi.dev --out <dir> [--only shared|eox]
// 전(before) = 이번에 고친 화면 파일을 지난 커밋(HEAD) 내용으로 바꿔 끼운 같은 화면(브라우저 요청 가로채기 · 서버 · 파일 그대로).
// 후(after)  = 지금 화면. 두 경우 모두 EOX 타일 주소(tiles.maps.eox.at) 요청 수를 센다. 비밀번호는 server/.env DEV_PASSWORD(출력 0).
// 공유 데이터: LX 행정 자료 시험 한 건('시험 행정 자료 35')을 올려 LX 줄 상세를 찍고 끝에 지운다.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const ROOT = 'E:/Land-XI 플랫폼/01. 디자인';
const HW = 'C:/Users/User/AppData/Local/ms-playwright';
if (fs.existsSync(path.join(HW, 'chromium-1234'))) process.env.PLAYWRIGHT_BROWSERS_PATH = HW;
if (!process.env.DEV_PASSWORD) { const m = fs.readFileSync(path.join(ROOT, 'server/.env'), 'utf8').match(/^DEV_PASSWORD=(.*?)\s*$/m); if (m) process.env.DEV_PASSWORD = m[1]; }
process.env.LX_PW ||= process.env.DEV_PASSWORD;
const { chromium } = createRequire(path.join(ROOT, 'package.json'))('playwright');
const { frontDoor } = await import(pathToFileURL(path.join(ROOT, 'landxi/v3/kit/lint/forbidden.mjs')).href);

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const APP = arg('--app'), ADMIN = arg('--admin', APP), OUT = arg('--out'), ONLY = arg('--only', '');
fs.mkdirSync(OUT, { recursive: true });
const hm = () => { const d = new Date(); return String(d.getHours()).padStart(2, '0') + String(d.getMinutes()).padStart(2, '0'); };
const RUNF = path.join(OUT, 'run.json');
const run = fs.existsSync(RUNF) ? JSON.parse(fs.readFileSync(RUNF, 'utf8')) : {};
Object.assign(run, { app: APP, admin: ADMIN, at: new Date().toISOString() });
run.shots ||= []; run.errors ||= {}; run.eox ||= {}; run.frame ||= {};
const save = () => fs.writeFileSync(RUNF, JSON.stringify(run, null, 2));
const shot = async (page, name) => { const f = `${name}-1440-${hm()}.png`; await page.screenshot({ path: path.join(OUT, f) }); if (!run.shots.includes(f)) run.shots.push(f); console.log('shot', f); return f; };
const watch = (page, key) => {
  run.errors[key] = [];
  page.on('pageerror', (e) => run.errors[key].push(`pageerror ${String(e).slice(0, 200)}`));
  page.on('console', (m) => { if (m.type() === 'error') run.errors[key].push(`console ${m.text().slice(0, 200)}`); });
  const n = { eox: 0, world: 0, s2: 0 };
  page.on('request', (r) => { const u = r.url(); if (/tiles\.maps\.eox\.at/.test(u)) n.eox++; if (/\/world-bm\//.test(u)) n.world++; if (/\/overseas-s2\//.test(u)) n.s2++; });
  return n;
};
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = (o = {}) => browser.newContext({ viewport: { width: 1440, height: 900 }, ...o });
const settle = (p, ms = 2500) => p.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => null).then(() => p.waitForTimeout(ms));

/* 전(before) — 이번에 고친 화면 파일을 HEAD 내용으로 */
const CHANGED = ['landxi/v3/kit/stage.js', 'landxi/v3/login/plate.js', 'landxi/v3/login/scenes.json', 'landxi/v3/main/main.js', 'landxi/v3/global/app.js',
  'landxi/global/js/ladder-global.js', 'landxi/global/js/sprawl.js', 'landxi/global/js/disaster-swipe.js', 'landxi/global/js/globe-stage.js', 'landxi/global/js/boot.js',
  'landxi/global/data/catalog-fixture-global.json', 'landxi/global/data/i18n-en.json', 'landxi/global/data/i18n-ko.json', 'landxi/xi/engine/sources.js'];
const HEAD = Object.fromEntries(CHANGED.map((f) => [f, execFileSync('git', ['-C', ROOT, 'show', `HEAD:${f}`], { maxBuffer: 64 << 20 })]));
async function asBefore(context) {
  await context.route((u) => CHANGED.some((f) => new URL(u).pathname === '/' + f), async (route) => {
    const f = CHANGED.find((x) => new URL(route.request().url()).pathname === '/' + x);
    const type = f.endsWith('.json') ? 'application/json' : 'text/javascript; charset=utf-8';
    await route.fulfill({ status: 200, body: HEAD[f], headers: { 'content-type': type, 'cache-control': 'no-store' } });
  });
}

async function shared() {
  const c = await ctx();
  const a = await c.newPage();
  watch(a, 'shared');
  await frontDoor(a, ADMIN, 'lxadmin@lx.or.kr', 'admin');
  await a.waitForURL((u) => !/\/login\/?(\?|$)/.test(u.pathname), { timeout: 30000 });
  await a.goto(`${ADMIN}/landxi/v3/ops-infra/#/shared`, { waitUntil: 'domcontentloaded' });
  const ready = () => a.waitForFunction(() => { const b = document.querySelector('.sd-body'); return b && !b.querySelector('.sd-wait') && b.querySelector('table, .sd-none'); }, null, { timeout: 40000 });
  const det = async (needMap) => {
    await a.waitForFunction(() => { const d = document.querySelector('.sd-det'); return d && d.querySelector('.sd-d') && !d.querySelector('.sd-wait'); }, null, { timeout: 40000 });
    if (needMap) await a.waitForFunction(() => document.querySelector('.sd-det .k-stage.is-ready'), null, { timeout: 40000 }).catch(() => null);
    await settle(a, 2500);
  };
  const rect = () => a.evaluate(() => { const r = (s) => { const b = document.querySelector(s)?.getBoundingClientRect(); return b ? [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)] : null; };
    return { card: r('.sd-card'), det: r('.sd-det'), list: r('.sd-list'), map: r('.sd-d-map') || r('.sd-d-pics') }; });
  const fonts = () => a.evaluate(() => { const m = {}; for (const el of document.querySelectorAll('.sd-det *')) { if (!el.childNodes.length || ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue; const fs = parseFloat(getComputedStyle(el).fontSize); m[fs] = (m[fs] || 0) + 1; } return m; });
  await ready();
  /* 시험 행정 자료 한 건(LX 줄 상세용) — 도형은 첫 기관 대장 범위 안 작은 칸 셋(지역 고정값 0) */
  const made = await a.evaluate(async () => {
    const { api, session } = await import('/landxi/shared/api-v1.js');
    const L = (await api('/shared/ledgers')).items || [];
    const org = L.find((x) => x.owner !== 'lx');
    const d = org ? await api('/shared/ledgers/' + org.id) : null;
    const b = d?.bbox; if (!b) return null;
    const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2, s = Math.min(b[2] - b[0], b[3] - b[1]) / 8;
    const sq = (x, y, n) => ({ type: 'Feature', properties: { 관리번호: `T-${n}`, 구분: n % 2 ? '공유지' : '도로', 면적_m2: String(1200 + n * 315), 비고: '시험' },
      geometry: { type: 'Polygon', coordinates: [[[x, y], [x + s, y], [x + s, y + s], [x, y + s], [x, y]]] } });
    const fc = { type: 'FeatureCollection', features: [sq(cx - 2 * s, cy, 1), sq(cx - 0.5 * s, cy - s, 2), sq(cx + s, cy + 0.5 * s, 3)] };
    const fd = new FormData();
    fd.append('file', new Blob([JSON.stringify(fc)], { type: 'application/geo+json' }), 'test35.geojson'); fd.append('kind', 'public_asset'); fd.append('name', '시험 행정 자료 35');
    const r = await fetch('/api/v1/shared/ledgers', { method: 'POST', body: fd, headers: { authorization: 'Bearer ' + session.get().token } });
    return (await r.json()).id || null;
  });
  run.test_ledger = made;
  try {
    await a.reload({ waitUntil: 'domcontentloaded' }); await ready();
    await det(true); run.frame.img = await rect(); await shot(a, 'shared-img');
    await a.locator('.sd-tbl tr.sd-row').nth(1).click(); await det(true); await shot(a, 'shared-img-row2');
    await a.locator('.sd-tabs button', { hasText: '학습 데이터' }).click(); await ready();
    await det(false); await a.waitForFunction(() => [...document.querySelectorAll('.sd-d-pic')].filter((x) => x.querySelector('img')?.complete).length >= 2, null, { timeout: 30000 }).catch(() => null);
    await a.waitForTimeout(800); run.frame.train = await rect(); await shot(a, 'shared-train');
    await a.locator('.sd-tabs button', { hasText: '행정 자료' }).click(); await ready();
    if (made) { await a.locator(`tr.sd-row[data-key="admin:${made}"]`).click(); }
    await det(true); run.frame.admin = await rect(); run.fonts = await fonts(); await shot(a, 'shared-admin-lx');
    await a.locator('tr.sd-row[data-key^="admin:imp_"]').filter({ hasNot: a.locator('.sd-vis') }).first().click(); await det(true); await shot(a, 'shared-admin-org');
    await a.locator('tr.sd-row[data-key^="admin:vw-"]').nth(1).click(); await det(true); await a.waitForTimeout(2500); await shot(a, 'shared-admin-vw');
    const ks = Object.keys(run.frame);
    run.frame_same = ks.every((k) => JSON.stringify([run.frame[k].card, run.frame[k].det, run.frame[k].list]) === JSON.stringify([run.frame[ks[0]].card, run.frame[ks[0]].det, run.frame[ks[0]].list]));
  } finally {
    if (made) run.test_ledger_deleted = await a.evaluate(async (id) => { const { api } = await import('/landxi/shared/api-v1.js'); try { await api('/shared/ledgers/' + id, { method: 'DELETE' }); return true; } catch { return false; } }, made);
    save();
    await c.close();
  }
}

async function eox(mode) {
  const tag = mode;
  /* 로그인(로그인 전 화면 — 장면 1 전국 · 장면 4 비슈케크) */
  {
    const c = await ctx(); if (mode === 'before') await asBefore(c);
    const p = await c.newPage(); const n = watch(p, `login-${tag}`);
    await p.goto(`${APP}/landxi/v3/login/`, { waitUntil: 'domcontentloaded' });
    await settle(p, 4000); await shot(p, `login-${tag}`);
    run.eox[`login-${tag}`] = { ...n };
    await c.close();
  }
  /* LX 직원 — 메인 · 세계 지도(v3/global) · XI맵 전국 축척 */
  {
    const c = await ctx(); if (mode === 'before') await asBefore(c);
    const p = await c.newPage(); const n = watch(p, `staff-${tag}`);
    await frontDoor(p, APP, 'test@lx.or.kr', 'app');
    await p.waitForURL((u) => !/\/login\/?(\?|$)/.test(u.pathname), { timeout: 30000 });
    await p.goto(`${APP}/landxi/v3/main/`, { waitUntil: 'domcontentloaded' }); await settle(p, 4000); await shot(p, `main-${tag}`);
    run.eox[`main-${tag}`] = { ...n };
    await p.goto(`${APP}/landxi/v3/global/`, { waitUntil: 'domcontentloaded' }); await settle(p, 5000); await shot(p, `world-${tag}`);
    run.eox[`world-${tag}`] = { ...n };
    await c.close();
  }
  /* 해외 기관 — 해외 첫 화면(landxi/global) */
  {
    const c = await ctx(); if (mode === 'before') await asBefore(c);
    const p = await c.newPage(); const n = watch(p, `overseas-${tag}`);
    await frontDoor(p, APP, 'lxadmin@lx.or.kr#kgz-agri');
    await p.waitForTimeout(3000);
    run.overseas_landing = new URL(p.url()).pathname;
    await settle(p, 6000); await shot(p, `overseas-${tag}`);
    run.eox[`overseas-${tag}`] = { ...n };
    await c.close();
  }
  save();
}

try {
  if (!ONLY || ONLY === 'shared') await shared();
  if (!ONLY || ONLY === 'eox') { await eox('before'); await eox('after'); }
  if (ONLY === 'after') await eox('after');
} catch (e) { run.fatal = String(e?.stack || e).slice(0, 800); console.error(e); }
finally { save(); await browser.close(); }
console.log(JSON.stringify({ frame_same: run.frame_same, eox: run.eox, errors: Object.fromEntries(Object.entries(run.errors).map(([k, v]) => [k, v.length])) }));
