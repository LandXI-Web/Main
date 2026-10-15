// 글자 크기 진단 — 바깥 주소 로그인 폼(LX 직원 · LX 관리자 · 남원 기관 각 한 번) → 화면 × 해상도: 글자 크기 수집 + 측정 + 캡처
//   node diag.mjs <phase> [staff,admin,gov,main] [screen,...]   env RES=1440x900,...
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';

const ROOT = 'E:/Land-XI 플랫폼/01. 디자인';
const HW = 'C:/Users/User/AppData/Local/ms-playwright';
if (fs.existsSync(path.join(HW, 'chromium-1234'))) process.env.PLAYWRIGHT_BROWSERS_PATH = HW;
if (!process.env.DEV_PASSWORD) { const m = fs.readFileSync(path.join(ROOT, 'server/.env'), 'utf8').match(/^DEV_PASSWORD=(.*?)\s*$/m); if (m) process.env.DEV_PASSWORD = m[1]; }
process.env.LX_PW ||= process.env.DEV_PASSWORD;
const { chromium } = createRequire(path.join(ROOT, 'package.json'))('playwright');
const { frontDoor } = await import(pathToFileURL(path.join(ROOT, 'landxi/v3/kit/lint/forbidden.mjs')).href);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const MEASURE = fs.readFileSync(path.join(HERE, 'measure.part'), 'utf8');

const APP = 'https://app.land-xi.dev', GOV = 'https://namwon.land-xi.dev';
const PHASE = process.argv[2] || 'before';
const GROUPS = (process.argv[3] || 'staff,admin,gov,main').split(',');
const ONLY = process.argv[4] ? process.argv[4].split(',') : null;
const RES = (process.env.RES || '1280x720,1366x768,1440x900,1920x1080,2560x1440').split(',').map((s) => s.split('x').map(Number));
const OUT = path.join(HERE, 'shots', PHASE);
fs.mkdirSync(OUT, { recursive: true });
const MF = path.join(OUT, 'metrics-' + GROUPS.join('-') + (ONLY ? '-' + ONLY.join('-').slice(0, 40) : '') + '.json');
const M = fs.existsSync(MF) ? JSON.parse(fs.readFileSync(MF, 'utf8')) : {};
const save = () => fs.writeFileSync(MF, JSON.stringify(M, null, 1));
const errors = [];

/* 보이는 글자 크기 모으기 — 직접 글(텍스트 노드)이 있는 요소 · 입력 칸 */
function fonts() {
  const out = {};
  const vis = (el) => { const s = getComputedStyle(el); if (s.visibility === 'hidden' || s.display === 'none' || +s.opacity === 0) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.left < innerWidth; };
  for (const el of document.querySelectorAll('body *')) {
    if (el.closest('svg, .k-dev, [hidden], script, style, .maplibregl-ctrl-attrib')) continue;
    const txt = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim();
    const isIn = /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) && el.type !== 'hidden' && el.type !== 'checkbox' && el.type !== 'radio' && el.type !== 'file';
    if (!txt && !isIn) continue;
    if (!vis(el)) continue;
    const s = getComputedStyle(el);
    const fs = Math.round(parseFloat(s.fontSize) * 2) / 2;
    const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).filter(Boolean).slice(0, 2).join('.') : '';
    const name = el.tagName.toLowerCase() + (cls ? '.' + cls : '');
    const o = out[fs] ||= { n: 0, ex: {} };
    o.n++;
    const k = name;
    if (!o.ex[k]) o.ex[k] = (txt || el.placeholder || el.value || '').slice(0, 18);
  }
  for (const v of Object.values(out)) { const ks = Object.keys(v.ex); v.sel = ks.length; if (ks.length > 12) v.ex = Object.fromEntries(Object.entries(v.ex).slice(0, 12)); }
  return out;
}

/* 잘린 글(넘쳐서 숨겨짐 — 말줄임 표시 없이) · 두 줄로 꺾인 단추 */
function clips() {
  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    if (el.closest('svg, .k-dev, [hidden], .maplibregl-map canvas')) continue;
    const s = getComputedStyle(el); if (s.display === 'none' || s.visibility === 'hidden') continue;
    const r = el.getBoundingClientRect(); if (!r.width || r.right < 0 || r.left > innerWidth || r.bottom < 0 || r.top > innerHeight) continue;
    const txt = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim();
    const name = el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '');
    if (txt && s.overflowX === 'hidden' && s.textOverflow !== 'ellipsis' && el.scrollWidth > el.clientWidth + 2 && !/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) out.push('잘림 ' + name + ' «' + txt.slice(0, 16) + '»');
    if (txt && s.position !== 'fixed') { for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) { const as = getComputedStyle(a); if (as.overflowX !== 'visible') { const ar = a.getBoundingClientRect(); if (r.right > ar.right + 2 && r.left < ar.right && as.overflowX === 'hidden') out.push('칸 밖 ' + name + ' «' + txt.slice(0, 16) + '»'); break; } } }
    if (/^(BUTTON|A)$/.test(el.tagName) && txt && txt.length <= 8 && (s.display.includes('flex') || s.display.includes('inline'))) {
      const lh = parseFloat(s.lineHeight) || parseFloat(s.fontSize) * 1.25; const rg = document.createRange(); rg.selectNodeContents(el); const lines = new Set([...rg.getClientRects()].map((q) => Math.round(q.top))).size;
      if (lines > 1 && !txt.includes(' ')) out.push('꺾인 단추 ' + name + ' «' + txt + '»');
    }
  }
  return [...new Set(out)].slice(0, 12);
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const settle = async (p) => { await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {}); await p.waitForTimeout(2200); };
const V = '/landxi/v3/';

async function run(group, base, login, site, screensFn) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(`${group} ${p.url()} ${e}`));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(`${group} ${p.url().replace(base, '')} ${m.text().slice(0, 200)}`); });
  const relog = async () => { if (!login) return; await frontDoor(p, APP, login, site); await p.waitForTimeout(2000); };
  await relog();
  const screens = await screensFn(p);
  for (const [id, url, prep] of screens) {
    if (ONLY && !ONLY.includes(id)) continue;
    if (!url) { M[id] = { skip: 'no url' }; continue; }
    M[id] = { url: url.replace(/project=[^&]+/, 'project=…'), group };
    for (const [w, hgt] of RES) {
      await p.setViewportSize({ width: w, height: hgt });
      try {
        await p.goto(base + url, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await settle(p);
        for (let k = 0; login && k < 1 && /\/login\/|gov-home/.test(p.url()) && !/gov-home|\/login\//.test(url); k++) { console.log("relogin", id, w); await p.waitForTimeout(30000); await relog(); await p.goto(base + url, { waitUntil: 'domcontentloaded', timeout: 45000 }); await settle(p); }
        if (prep) { await prep(); await p.waitForTimeout(1500); }
        if (/xi-clean/.test(url)) await p.waitForTimeout(4000);
        const m = await p.evaluate('(' + MEASURE + ')()');
        m.fonts = await p.evaluate(fonts);
        m.clips = await p.evaluate(clips).catch(() => []);
        m.at = p.url().replace(base, '');
        M[id][w] = m;
        await p.screenshot({ path: path.join(OUT, `${id}-${w}.png`) });
        const small = Object.entries(m.fonts).filter(([k]) => +k < 13).reduce((a, [, v]) => a + v.n, 0);
        console.log(id, w, 'over', m.docOverX, 'off', m.off.length, 'sizes', Object.keys(m.fonts).length, 'small', small, 'heads', m.heads.length, 'orph', m.orphans.length, 'clip', (m.clips || []).join(' ; '));
      } catch (e) { M[id][w] = { err: String(e).slice(0, 200) }; console.log(id, w, 'ERR', String(e).slice(0, 120)); }
      save();
    }
  }
  await ctx.close();
}

const OI = V + 'ops-infra/', OC = V + 'ops-core/';
const click = (p, sel) => async () => { await p.locator(sel).first().click({ timeout: 8000 }).catch((e) => console.log('click fail', sel, String(e).slice(0, 80))); };

if (GROUPS.includes('staff')) await run('staff', APP, 'test@lx.or.kr', 'app', async (p) => {
  await p.waitForTimeout(1500);
  const pj = await p.evaluate(async () => { const { api } = await import('/landxi/v3/kit/util.js'); return api('/projects?scope=all'); }).catch(() => ({}));
  const items = pj.items || [];
  const proj = items.find((x) => /비닐하우스/.test(x.name)) || items[0];
  const PID = proj?.id;
  const st = PID ? await p.evaluate(async (id) => { const c = await import('/landxi/v3/lx-project/context.js'); const pr = await c.loadProject(id); const o = {}; for (const s of c.STAGES) o[s.key] = c.stageHref(pr, s.key, (pr?.stages || []).find?.((x) => x.key === s.key)?.target || {}); return o; }, PID).catch(() => ({})) : {};
  return [
    ['s-dash', V + 'lx-console/'], ['s-projects', V + 'lx-project/'], ['s-newproj', V + 'lx-project/', async () => { await p.locator('.lxp-newb').first().click().catch(() => {}); await p.waitForTimeout(1500); }],
    ['s-project', PID && V + 'lx-project/?project=' + PID], ['s-ingest', st.ingest], ['s-label', st.label], ['s-train', st.train], ['s-infer', st.infer], ['s-review', st.review], ['s-publish', st.publish],
    ['s-analyze', V + 'lx-analyze/'], ['s-cards', V + 'lx-cards/'], ['s-mapsvc', V + 'lx-map/'], ['s-ximap', V + 'xi-clean/'], ['s-inbox', V + 'lx-inbox/'], ['s-help', V + 'help-my/'],
  ];
});
if (GROUPS.includes('admin')) await run('admin', APP, 'lxadmin@lx.or.kr', 'app', async (p) => [
  ['a-dash', OC + '#/'],
  ['a-req', OC + '#/approvals'], ['a-req-approve', OC + '#/approvals/approve'], ['a-req-api', OC + '#/approvals/apikeys'],
  ['a-infra', OI + '#/infra'], ['a-tenants', OI + '#/tenants'], ['a-tenant1', OI + '#/tenants/o/namwon'],
  ['a-dep-req', OI + '#/deploys'], ['a-dep-share', OI + '#/deploys/share'], ['a-dep-usage', OI + '#/deploys/usage', async () => { await p.waitForTimeout(5000); }], ['a-dep-cat', OI + '#/deploys/categories'],
  ['a-dep-api', OI + '#/deploys/api'], ['a-dep-rt', OI + '#/deploys/retrain'], ['a-dep-tpl', OI + '#/deploys/templates'], ['a-dep-imp', OI + '#/deploys/improve'],
  ['a-shared-img', OI + '#/shared'], ['a-shared-train', OI + '#/shared', click(p, '.sd-tabs [data-tab=train]')], ['a-shared-admin', OI + '#/shared', click(p, '.sd-tabs button:nth-child(3)')],
  ['a-accounts', V + 'ops-accounts/'], ['a-reviews', V + 'lx-inbox/'],
]);
if (GROUPS.includes('gov')) await run('gov', GOV, 'lxadmin@lx.or.kr#namwon', null, async (p) => [
  ['g-list', V + 'gov-select/?list=1'],
  ['g-dash', V + 'gov-select/?service=card-farm'], ['g-hist', V + 'gov-select/?service=card-farm&tab=history'], ['g-stats', V + 'gov-select/?service=card-farm&tab=stats'],
  ['g-req', V + 'gov-request/'], ['g-shoot', V + 'gov-request/?tab=shoot'], ['g-sent', V + 'gov-request/?tab=sent'],
  ['g-report', V + 'gov-report/?service=card-farm&tab=report'], ['g-parcels', V + 'gov-report/?service=card-farm'],
  ['g-fusion', V + 'gov-fusion/?service=card-farm'], ['g-parcel', V + 'gov-fusion/?service=card-farm', async () => { await p.waitForTimeout(4000); await click(p, '.k-main table tbody tr')(); }],
  ['g-map', V + 'xi-clean/?service=card-farm'],
  ['g-org', V + 'gov-select/?view=org'], ['g-accounts', V + 'gov-accounts/'],
]);
if (GROUPS.includes('main')) {
  await run('main', APP, null, null, async () => [['m-main', V + 'main/'], ['m-login', V + 'login/']]);
  await run('main', GOV, null, null, async () => [['m-govhome', '/']]);
}
M._errors = errors;
save();
console.log('errors', errors.length); errors.slice(0, 30).forEach((e) => console.log(' ', e));
await browser.close();
