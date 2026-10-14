// 관리자 · 기관 · 메인 화면 해상도 진단 — 바깥 주소 로그인 폼(LX 관리자 · 남원 기관 각 한 번) → 화면 × 5 해상도 캡처 + 측정
//   node shoot.mjs <phase> [admin|gov|main] [screen,screen,...]
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
const GROUPS = (process.argv[3] || 'admin,gov,main').split(',');
const ONLY = process.argv[4] ? process.argv[4].split(',') : null;
const RES = (process.env.RES || '1280x720,1366x768,1440x900,1920x1080,2560x1440').split(',').map((s) => s.split('x').map(Number));
const OUT = path.join(HERE, 'shots', PHASE);
fs.mkdirSync(OUT, { recursive: true });
const MF = path.join(OUT, 'metrics-' + GROUPS.join('-') + '.json');
const M = fs.existsSync(MF) ? JSON.parse(fs.readFileSync(MF, 'utf8')) : {};
const save = () => fs.writeFileSync(MF, JSON.stringify(M, null, 1));
const errors = [];

/* XI ChatGEO 둥근 단추가 누르는 것(단추 · 링크 · 입력)을 덮는가 */
function fabHit() {
  const f = document.querySelector('.k-chat-fab'); if (!f) return null;
  const s = getComputedStyle(f); if (s.display === 'none' || s.visibility === 'hidden') return null;
  const r = f.getBoundingClientRect(); if (!r.width) return null;
  const root = f.closest('.k-chat-root');
  const hits = [];
  for (const el of document.querySelectorAll('a[href],button,input,select,textarea,[role=tab],[role=button]')) {   // 단추 · 링크 · 입력(카드 전체는 빼고)
    if (root?.contains(el)) continue;
    const e = el.getBoundingClientRect(); if (!e.width || !e.height || (e.width > 400 && e.height > 300)) continue;
    const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || +cs.opacity === 0) continue;
    if (e.left < r.right - 4 && e.right > r.left + 4 && e.top < r.bottom - 4 && e.bottom > r.top + 4) {
      // 실제로 보이는 것만(다른 판 밑이 아니게)
      const x = (Math.max(e.left, r.left) + Math.min(e.right, r.right)) / 2, y = (Math.max(e.top, r.top) + Math.min(e.bottom, r.bottom)) / 2;   // 겹친 자리 한가운데
      root && (root.style.pointerEvents = 'none'); f.style.pointerEvents = 'none';
      const top = document.elementFromPoint(x, y); f.style.pointerEvents = ''; root && (root.style.pointerEvents = '');
      if (top && (top === el || el.contains(top))) hits.push((el.textContent || el.getAttribute('aria-label') || el.tagName).trim().slice(0, 20));
    }
  }
  return hits;
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const V = '/landxi/v3/';
const settle = async (p) => { await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {}); await p.waitForTimeout(2200); };

async function run(group, base, login, screens) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(`${group} ${p.url()} ${e}`));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(`${group} ${p.url().replace(base, '')} ${m.text().slice(0, 200)}`); });
  const relog = async () => { if (!login) return; await frontDoor(p, APP, login); await p.waitForTimeout(2000); };
  await relog();
  for (const [id, url, prep] of screens(p)) {
    if (ONLY && !ONLY.includes(id)) continue;
    M[id] = { url };
    for (const [w, hgt] of RES) {
      await p.setViewportSize({ width: w, height: hgt });
      try {
        await p.goto(base + url, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await settle(p);
        for (let k = 0; login && k < 3 && /\/login\/|gov-home/.test(p.url()) && !/gov-home|\/login\//.test(url); k++) { console.log('relogin', id, w); await p.waitForTimeout(3000); await relog(); await p.goto(base + url, { waitUntil: 'domcontentloaded', timeout: 45000 }); await settle(p); }
        if (prep) { await prep(); await p.waitForTimeout(1500); }
        const m = await p.evaluate('(' + MEASURE + ')()');
        m.fab = await p.evaluate(fabHit);
        m.at = p.url().replace(base, '');
        M[id][w] = m;
        await p.screenshot({ path: path.join(OUT, `${id}-${w}.png`) });
        console.log(id, w, 'over', m.docOverX, 'off', m.off.length, 'w%', m.wPct, 'fab', (m.fab || []).join('|'));
      } catch (e) { M[id][w] = { err: String(e).slice(0, 200) }; console.log(id, w, 'ERR', String(e).slice(0, 120)); }
      save();
    }
  }
  await ctx.close();
}

const OI = V + 'ops-infra/', OC = V + 'ops-core/';
const click = (p, sel) => async () => { await p.locator(sel).first().click({ timeout: 8000 }).catch((e) => console.log('click fail', sel, String(e).slice(0, 80))); };
if (GROUPS.includes('admin')) await run('admin', APP, 'lxadmin@lx.or.kr', (p) => [
  ['a-dash', OC + '#/'],
  ['a-req', OC + '#/approvals'], ['a-req-approve', OC + '#/approvals/approve'], ['a-req-api', OC + '#/approvals/apikeys'],
  ['a-infra', OI + '#/infra'], ['a-tenants', OI + '#/tenants'], ['a-tenant1', OI + '#/tenants/o/namwon'],
  ['a-dep-req', OI + '#/deploys'], ['a-dep-share', OI + '#/deploys/share'], ['a-dep-usage', OI + '#/deploys/usage', async () => { await p.waitForTimeout(6000); }], ['a-dep-cat', OI + '#/deploys/categories'],
  ['a-dep-api', OI + '#/deploys/api'], ['a-dep-rt', OI + '#/deploys/retrain'], ['a-dep-tpl', OI + '#/deploys/templates'], ['a-dep-imp', OI + '#/deploys/improve'],
  ['a-shared-img', OI + '#/shared'], ['a-shared-train', OI + '#/shared', click(p, '.sd-tabs [data-tab=train]')], ['a-shared-admin', OI + '#/shared', click(p, '.sd-tabs button:nth-child(3)')],
  ['a-accounts', V + 'ops-accounts/'], ['a-reviews', V + 'lx-inbox/'],
]);
if (GROUPS.includes('gov')) await run('gov', GOV, 'lxadmin@lx.or.kr#namwon', (p) => [
  ['g-list', V + 'gov-select/?list=1'],
  ['g-dash', V + 'gov-select/?service=card-farm'], ['g-hist', V + 'gov-select/?service=card-farm&tab=history'], ['g-stats', V + 'gov-select/?service=card-farm&tab=stats'],
  ['g-req', V + 'gov-request/'], ['g-shoot', V + 'gov-request/?tab=shoot'], ['g-sent', V + 'gov-request/?tab=sent'],
  ['g-report', V + 'gov-report/?service=card-farm&tab=report'], ['g-parcels', V + 'gov-report/?service=card-farm'],
  ['g-fusion', V + 'gov-fusion/?service=card-farm'], ['g-parcel', V + 'gov-fusion/?service=card-farm', async () => { await p.waitForTimeout(4000); await click(p, '.k-main table tbody tr')(); }],
  ['g-map', V + 'xi-clean/?service=card-farm'],
  ['g-org', V + 'gov-select/?view=org'], ['g-accounts', V + 'gov-accounts/'],
]);
if (GROUPS.includes('staff')) await run('staff', APP, 'test@lx.or.kr', () => [['s-dash', V + 'lx-console/'], ['s-projects', V + 'lx-project/'], ['s-analyze', V + 'lx-analyze/'], ['s-cards', V + 'lx-cards/']]);
if (GROUPS.includes('main')) {
  await run('main', APP, null, () => [['m-main', V + 'main/'], ['m-login', V + 'login/']]);
  await run('main', GOV, null, () => [['m-govhome', '/']]);
}
M._errors = errors;
save();
console.log('errors', errors.length); errors.slice(0, 30).forEach((e) => console.log(' ', e));
await browser.close();
