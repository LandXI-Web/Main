// 바퀴 14 재검수 — 화면마다 '주소 → 다 그려짐' · '불러오는 중' 보인 시간 · 느린 API (PC 1440 · 바깥 주소 · 처음 · 다시)
//   node time.mjs <phase> [staff,admin,gov,main,abroad] [id,id]   →  time-<phase>.json
//   로그인 폼(역할마다 한 번 · 세션 주입 없음). 재는 법은 지난 재검수(impl-34 recheck-admin-gov/time.mjs)와 같다:
//   다 그려짐 = 가운데 '불러오는 중'(.k-ld) · 글 '불러오는 중' 없음 + 진행 중 API 0 이 0.6초 이어진 첫 시각(+ 화면별 조건: XI맵 = 지도 타일 · 결과 층, 해외 = 지역 착지 · 큰 숫자).
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

const APP = 'https://app.land-xi.dev', GOV = 'https://namwon.land-xi.dev', ABR = 'https://kgz-agri.land-xi.dev';
const PHASE = process.argv[2] || 'before';
const GROUPS = (process.argv[3] || 'staff,admin,gov,main,abroad').split(',');
const ONLY = process.argv[4] ? process.argv[4].split(',') : null;
const MF = path.join(HERE, `time-${PHASE}.json`);
const M = fs.existsSync(MF) ? JSON.parse(fs.readFileSync(MF, 'utf8')) : {};
const save = () => fs.writeFileSync(MF, JSON.stringify(M, null, 1));
const CAP = 40000;

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const V = '/landxi/v3/';

async function measure(p, base, url, prep, until) {
  const live = new Map(); const api = [];
  const isApi = (u) => u.includes('/api/v1/') && !/stream|events|sse/.test(u);
  const onReq = (r) => { if (isApi(r.url())) live.set(r, Date.now()); };
  const onEnd = (r) => { if (!live.has(r)) return; const t0 = live.get(r); live.delete(r); api.push({ u: r.url().replace(/^.*\/api\/v1/, '').slice(0, 110), ms: Date.now() - t0, st: r.__st || (r.failure() ? 'fail' : '') }); };
  const onResp = (res) => { const r = res.request(); r.__st = res.status(); };
  p.on('request', onReq); p.on('requestfinished', onEnd); p.on('requestfailed', onEnd); p.on('response', onResp);
  const t0 = Date.now();
  let err = null;
  try { await p.goto(base + url, { waitUntil: 'domcontentloaded', timeout: 45000 }); } catch (e) { err = String(e).slice(0, 160); }
  const tDom = Date.now() - t0;
  if (prep) { try { await prep(p); } catch (e) { err = 'prep ' + String(e).slice(0, 100); } }
  let ldFirst = null, ldLast = null, ldMs = 0, slowSeen = false, stableSince = null, done = null, last = Date.now();
  while (Date.now() - t0 < CAP) {
    const s = await p.evaluate(() => {
      const ld = document.querySelector('.k-ld');
      const ldOn = !!(ld && !ld.hidden && ld.getClientRects().length);
      const slow = !!document.querySelector('.k-ld-slow:not([hidden])') && ldOn;
      const txt = [...document.querySelectorAll('body *')].some((e) => e.childElementCount === 0 && /불러오는 중/.test(e.textContent || '') && e.getClientRects().length && !e.closest('.k-ld'));
      return { ldOn, slow, txt };
    }).catch(() => ({ ldOn: false, slow: false, txt: false, nav: true }));
    s.ok = until ? await p.evaluate(until).catch(() => false) : !s.nav;
    const now = Date.now();
    const busy = s.ldOn || s.txt;
    if (busy) { ldFirst ??= now - t0; ldLast = now - t0; ldMs += now - last; }
    if (s.slow) slowSeen = true;
    last = now;
    if (!busy && live.size === 0 && s.ok) { stableSince ??= now; if (now - stableSince >= 600) { done = stableSince - t0; break; } }
    else stableSince = null;
    await p.waitForTimeout(100);
  }
  const pending = [...live.entries()].map(([r, t]) => ({ u: r.url().replace(/^.*\/api\/v1/, '').slice(0, 110), ms: Date.now() - t }));
  p.off('request', onReq); p.off('requestfinished', onEnd); p.off('requestfailed', onEnd); p.off('response', onResp);
  api.sort((a, b) => b.ms - a.ms);
  const bad = api.filter((a) => a.st && (a.st === 'fail' || a.st >= 400));
  return { tDom, done, ldFirst, ldLast, ldMs: Math.round(ldMs), slowSeen, top: api.slice(0, 5), bad, pending, n: api.length, at: p.url().replace(base, ''), err };
}

async function run(group, base, login, screens) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
  if (login) { await frontDoor(p, APP, login); await p.waitForTimeout(2000); }
  for (const pass of ['first', 'again']) {
    for (const [id, url, prep, until] of screens) {
      if (ONLY && !ONLY.includes(id)) continue;
      errs.length = 0;
      // 같은 문서의 # 만 바뀌면 다시 읽지 않는다 → 빈 쪽을 한 번 거쳐 늘 새로 연다
      await p.goto('about:blank').catch(() => {});
      const r = await measure(p, base, url, prep, until);
      r.pageErr = [...errs];
      (M[id] ||= { url })[pass] = r;
      console.log(pass, id, 'dom', r.tDom, 'done', r.done, 'ld', r.ldMs, r.slowSeen ? 'SLOW' : '', 'top', r.top[0]?.ms, r.top[0]?.u, r.bad.length ? 'BAD ' + r.bad.map((b) => b.st + ' ' + b.u).join(' | ') : '', r.pending.length ? 'PEND ' + r.pending.map((x) => x.u).join(' | ') : '', r.err || '');
      save();
    }
  }
  await ctx.close();
}

const PID = 'prj_3fdba452d5';
const OI = V + 'ops-infra/', OC = V + 'ops-core/';
const click = (sel) => async (p) => { await p.waitForSelector(sel, { timeout: 15000 }); await p.locator(sel).first().click({ timeout: 8000 }); };
const xiUntil = () => !!(window.__xc?.map && window.__xc.map.areTilesLoaded() && !window.__xc.map.isMoving() && window.__xc.boot?.shown);
const glUntil = () => { if (document.body.dataset.state === 'error') return true; const b = document.querySelector('.gl-hud .k-big'); return document.body.dataset.state === 'ready' && document.querySelector('.gl')?.dataset.level === 'district' && !!b && !b.classList.contains('is-wait') && (b.dataset.state === 'ok' || b.classList.contains('is-none')); };

if (GROUPS.includes('staff')) await run('staff', APP, 'test@lx.or.kr', [
  ['s-dash', V + 'lx-console/'], ['s-projects', V + 'lx-project/'], ['s-project', V + `lx-project/?project=${PID}`],
  ['s-ingest', V + `lx-ingest/?project=${PID}&region=43745`], ['s-label', V + `lx-train/?project=${PID}&stage=label&flow=1`],
  ['s-train', V + `lx-train/?project=${PID}&stage=train&flow=1&sample=smp_94f1ab120e&model=trained%2Fjob_01M3RG60R78XYV0STPWC9B69AB`],
  ['s-infer', V + `lx-release/?project=${PID}&stage=infer`], ['s-review', V + `lx-map/?job=job_01M4FJDMZZAFDWB4HJ00E6X7GJ&project=${PID}`],
  ['s-publish', V + `lx-release/?project=${PID}&stage=publish`], ['s-analyze', V + 'lx-analyze/'], ['s-cards', V + 'lx-cards/'],
  ['s-mapsvc', V + 'lx-map/'], ['s-ximap', V + 'xi-clean/', null, xiUntil], ['s-inbox', V + 'lx-inbox/'], ['s-help', V + 'help-my/'],
]);
if (GROUPS.includes('admin')) await run('admin', APP, 'lxadmin@lx.or.kr', [
  ['a-dash', OC + '#/'],
  ['a-req', OC + '#/approvals'], ['a-req-approve', OC + '#/approvals/approve'], ['a-req-api', OC + '#/approvals/apikeys'],
  ['a-infra', OI + '#/infra'], ['a-tenants', OI + '#/tenants'], ['a-tenant1', OI + '#/tenants/o/namwon'],
  ['a-dep-req', OI + '#/deploys'], ['a-dep-share', OI + '#/deploys/share'], ['a-dep-usage', OI + '#/deploys/usage'], ['a-dep-cat', OI + '#/deploys/categories'],
  ['a-dep-api', OI + '#/deploys/api'], ['a-dep-rt', OI + '#/deploys/retrain'], ['a-dep-tpl', OI + '#/deploys/templates'], ['a-dep-imp', OI + '#/deploys/improve'],
  ['a-shared-img', OI + '#/shared'], ['a-shared-detail', OI + '#/shared', click('.sd-row')],
  ['a-shared-train', OI + '#/shared', click('.sd-tabs [data-tab=train]')], ['a-shared-admin', OI + '#/shared', click('.sd-tabs button:nth-child(3)')],
  ['a-accounts', V + 'ops-accounts/'],
]);
if (GROUPS.includes('gov')) await run('gov', GOV, 'lxadmin@lx.or.kr#namwon', [
  ['g-list', V + 'gov-select/?list=1'],
  ['g-dash', V + 'gov-select/?service=card-farm'], ['g-hist', V + 'gov-select/?service=card-farm&tab=history'], ['g-stats', V + 'gov-select/?service=card-farm&tab=stats'],
  ['g-req', V + 'gov-request/'], ['g-shoot', V + 'gov-request/?tab=shoot'], ['g-sent', V + 'gov-request/?tab=sent'],
  ['g-report', V + 'gov-report/?service=card-farm&tab=report'], ['g-parcels', V + 'gov-report/?service=card-farm'],
  ['g-fusion', V + 'gov-fusion/?service=card-farm'],
  ['g-map', V + 'xi-clean/?service=card-farm', null, xiUntil],
  ['g-org', V + 'gov-select/?view=org'], ['g-accounts', V + 'gov-accounts/'],
]);
if (GROUPS.includes('main')) {
  await run('main', APP, null, [['m-main', V + 'main/'], ['m-login', V + 'login/']]);
  await run('main', GOV, null, [['m-govhome', '/']]);
}
if (GROUPS.includes('abroad')) await run('abroad', ABR, 'lxadmin@lx.or.kr#kgz-agri', [['x-global', V + 'global/', null, glUntil]]);
save();
await browser.close();
