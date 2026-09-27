// F2-∑ 통합 영상(≤ 150 s · 1440×900 · h264 · on 모드 · 게이트웨이 :8700 · 워커 · 관제 :8702 · vLLM GPU1 · 추론 GPU0 한 장)
//   node shots/f2/integrated/tools/record.mjs            → shots/f2/F2-integrated.mp4 · shots/f2/integrated/{raw,stills,logs,marks.json}
// 장면(같은 id 가 관통): 게스트 필름 → 공개 XI맵(짧게) → 로그인(LX 직원) → 레일 '지도 서비스' → XI맵 남원 도착(129,420)
//   → ⌘K 에이전트 "아영면에서 논에 건물 있는 필지 보여줘"(run_E) → [기관 · 남원시] 실태조사 대조 스윕 39칸(job_S) → 의심 큐 R1·A → 필지 카드 v2
//   → 현장조사 배정(f_R1_…) · 반화면 관제 기관 막대 → 보고서 초안 .docx → [직원] 익산 황등 378칸 실추론(job_J · GPU0 ≥ 15 s)
//   → 반화면 관제 infra ?job=job_J(이동평균 이용률 · W · 행 is-focus) → job.done HUD 두 줄 = GET /jobs/job_J → 관제 배포 롤백(dp-nw-farm-25 v2.1→v2.0) → XI맵 계보 칩
//   → Land-XI Global 영문 · 남원 → 글로브 → 으슥아타(NDVI 월별 · job_G) → 마감(모토)
// 전력 규칙: GPU 고부하는 황등 1건(GPU0 워커)뿐 · 에이전트 LLM 은 GPU1(vLLM · 전력 협조 llm_power_request) · 동시 고부하 0 · Global 지수는 CPU 워커.
// 자막·커서는 녹화 전용 오버레이(제품 코드 아님). 편집은 자르기·반화면 합성만(수치 합성 0).
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const OUT = 'shots/f2/integrated';
const FINAL = 'shots/f2/F2-integrated.mp4';
const BASE = 'http://localhost:4173/landxi/';
const XI = BASE + 'xi/index.html';
const OPS = 'http://localhost:8702/landxi/ops/';
const API = 'http://localhost:8700';
const PW = (fs.readFileSync('server/.env', 'utf8').match(/^DEV_PASSWORD=(.*)$/m) || [])[1]?.trim();
if (!PW) { console.error('DEV_PASSWORD 없음(server/.env)'); process.exit(2); }
const HW = [126.9467, 35.9956, 126.9495, 35.9975];   // 익산 황등 1.36cm · 378 shard(F2-B 복구 실증과 같은 프레임)
let TARGET = 'f_R1_5219045021110530012', TARGET_PNU = '5219045021110530012';

const login = async (body) => (await fetch(API + '/api/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: PW, ...body }) })).json();
const health0 = await (await fetch(API + '/api/v1/health')).json();
const S_STAFF = await login({ realm: 'lx', login: 'lx-staff' });
const S_AGENCY = await login({ realm: 'tenant', tenant_id: 'namwon', login: 'namwon-manager' });
const S_ADMIN = await login({ realm: 'lx', login: 'lx-admin' });
if (!S_STAFF.token || !S_AGENCY.token || !S_ADMIN.token) { console.error('[fail] 로그인'); process.exit(2); }
const H = (s) => ({ authorization: 'Bearer ' + s.token, 'content-type': 'application/json' });
const dp0 = await (await fetch(API + '/api/v1/deploys/dp-nw-farm-25', { headers: H(S_ADMIN) })).json();
console.log('[deploy]', dp0.version, dp0.stage);
if (dp0.version !== 'v2.1' || dp0.stage !== 'ga') { console.error('[fail] dp-nw-farm-25 가 v2.1 ga 가 아니다 — 먼저 복구'); process.exit(2); }
{ const j = await (await fetch(API + '/api/v1/survey/findings?rule=R1&priority=A&sort=score&limit=12', { headers: H(S_AGENCY) })).json();
  const c = (j.items || []).slice(3).find((x) => x.state === 'open'); if (c) { TARGET = c.id; TARGET_PNU = c.pnu; } console.log('[target]', TARGET, c?.addr); }
const devReset = (id) => { try { execFileSync('python', ['-m', 'survey.pipelines.dev_state', 'reset', id], { cwd: 'server', stdio: 'pipe', env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONPATH: path.resolve('server') } }); } catch (e) { console.warn('[warn] reset', String(e.stderr || e).slice(0, 200)); } };
devReset(TARGET);
const jobs0 = await (await fetch(API + '/api/v1/jobs?limit=30', { headers: H(S_STAFF) })).json();
const queue = (jobs0.items || []).filter((j) => ['queued', 'running'].includes(j.state)).map((j) => `${j.id} ${j.tenant_id} ${j.kind} ${j.pool} ${j.shards_done}/${j.shards_total}`);
console.log('[queue]', queue.length, queue);

fs.rmSync(path.join(OUT, 'raw'), { recursive: true, force: true });
for (const d of ['raw/A', 'raw/B', 'logs', 'stills']) fs.mkdirSync(path.join(OUT, d), { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const OVERLAY = () => {
  const mk = () => { if (document.getElementById('__cur')) return; const c = document.createElement('div'); c.id = '__cur'; c.style.cssText = 'position:fixed;left:-40px;top:-40px;width:18px;height:18px;margin:-9px 0 0 -9px;border:2px solid #fff;border-radius:50%;box-shadow:0 0 0 1px rgba(0,0,0,.6);z-index:2147483647;pointer-events:none'; document.documentElement.append(c); };
  addEventListener('mousemove', (e) => { mk(); const c = document.getElementById('__cur'); c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px'; }, true);
  addEventListener('mousedown', () => { const c = document.getElementById('__cur'); if (c) { c.style.transform = 'scale(.6)'; setTimeout(() => (c.style.transform = ''), 180); } }, true);
  window.__cap = (txt, ms = 4000) => {
    let c = document.getElementById('__cap');
    if (!c) { c = document.createElement('div'); c.id = '__cap'; c.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:2147483646;pointer-events:none;background:rgba(1,1,2,.84);color:#fff;font:500 16px/22px Pretendard,"Pretendard Variable",Inter,system-ui,sans-serif;letter-spacing:.01em;padding:9px 18px;white-space:nowrap;transition:opacity 380ms cubic-bezier(.22,1,.36,1);opacity:0'; document.documentElement.append(c); }
    c.textContent = txt; c.style.opacity = '1'; clearTimeout(window.__capT); window.__capT = setTimeout(() => { c.style.opacity = '0'; }, ms);
  };
};
const ctxA = await browser.newContext({ viewport: { width: 1440, height: 900 }, recordVideo: { dir: path.join(OUT, 'raw/A'), size: { width: 1440, height: 900 } }, acceptDownloads: true });
const ctxB = await browser.newContext({ viewport: { width: 720, height: 900 }, recordVideo: { dir: path.join(OUT, 'raw/B'), size: { width: 720, height: 900 } } });
// A: 처음엔 게스트(세션 키 없음) — 로그인 뒤 evaluate 로 게이트웨이 세션을 얹는다
await ctxA.addInitScript(([api]) => { if (location.port !== '4173' || sessionStorage.getItem('rec_boot')) return; sessionStorage.setItem('rec_boot', '1');
  for (const k of ['lx_api_session', 'lx_logged_in', 'lx_role', 'lx_tenant_session', 'lx_api_mode']) localStorage.removeItem(k); localStorage.setItem('lx_api_base', api); }, [API]);
await ctxA.addInitScript(OVERLAY);
await ctxB.addInitScript((s) => { if (location.port !== '8702' || sessionStorage.getItem('ob')) return; sessionStorage.setItem('ob', '1');
  localStorage.setItem('lx_ops_base', 'http://localhost:8700'); localStorage.setItem('lx_api_base', 'http://localhost:8700'); localStorage.setItem('lx_api_session', JSON.stringify(s)); localStorage.setItem('lx_logged_in', '1'); localStorage.setItem('lx_role', 'admin'); localStorage.removeItem('lx_api_mode'); localStorage.removeItem('lx_ops_src'); }, S_ADMIN);
await ctxB.addInitScript(OVERLAY);

const logs = [], marks = [], T = {}, ids = {};
const page = await ctxA.newPage(); T.A0 = Date.now();
const ops = await ctxB.newPage(); T.B0 = Date.now();
const T0 = T.A0;
page.on('console', (m) => { if (m.type() === 'error') logs.push(((Date.now() - T0) / 1000).toFixed(1) + 's A console.error: ' + m.text().slice(0, 300)); });
page.on('response', (r) => { if (r.status() >= 400) logs.push(((Date.now() - T0) / 1000).toFixed(1) + 's A http ' + r.status() + ' ' + r.url().slice(0, 200)); });
page.on('pageerror', (e) => logs.push(((Date.now() - T0) / 1000).toFixed(1) + 's A pageerror: ' + e.message));
ops.on('console', (m) => { if (m.type() === 'error') logs.push(((Date.now() - T0) / 1000).toFixed(1) + 's B console.error: ' + m.text().slice(0, 300)); });
ops.on('pageerror', (e) => logs.push(((Date.now() - T0) / 1000).toFixed(1) + 's B pageerror: ' + e.message));
const mark = (k, extra) => { const t = (Date.now() - T0) / 1000; marks.push({ k, t, ...extra }); console.log(`[${t.toFixed(1)}s] ${k}${extra ? ' ' + JSON.stringify(extra).slice(0, 260) : ''}`); return t; };
const wait = (ms) => page.waitForTimeout(ms);
const ev = (f, a) => page.evaluate(f, a);
const cap = (txt, ms = 4000, p = page) => p.evaluate(([t, m]) => window.__cap && window.__cap(t, m), [txt, ms]).catch(() => {});
const phase = (ph, ms = 40000) => page.waitForFunction((ph) => window.__xi?.PHASES?.some((x) => x.p === ph && x.t > (window.__mark || 0)), ph, { timeout: ms });
const markNow = () => page.evaluate(() => { window.__mark = performance.now(); });
const moveTo = (x, y, steps = 16, p = page) => p.mouse.move(x, y, { steps });
const clickAt = async (x, y, steps = 16, p = page) => { await moveTo(x, y, steps, p); await p.mouse.down(); await p.mouse.up(); };
const clickSel = async (sel, steps = 16, p = page) => { const l = p.locator(sel).first(); await l.scrollIntoViewIfNeeded().catch(() => {}); const b = await l.boundingBox(); await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps }); await p.mouse.down(); await p.mouse.up(); };
const ds = () => ev(() => ({ ...document.documentElement.dataset }));
const waitDs = (k, v, ms = 120000) => page.waitForFunction(([k, v]) => (v === '*' ? !!document.documentElement.dataset[k] : document.documentElement.dataset[k] === v), [k, v], { timeout: ms });
const fail = async (why) => { console.error('[fail]', why); await page.screenshot({ path: path.join(OUT, 'logs', 'fail.png') }).catch(() => {}); fs.writeFileSync(path.join(OUT, 'logs', 'record-fail.json'), JSON.stringify({ why, marks, logs }, null, 1)); await ctxA.close(); await ctxB.close(); await browser.close(); await restoreServer(); process.exit(3); };
const setSession = (kind) => ev(([kind, st, ag]) => {
  if (kind === 'staff') { localStorage.setItem('lx_api_session', JSON.stringify(st)); localStorage.setItem('lx_logged_in', '1'); localStorage.setItem('lx_role', 'staff'); localStorage.removeItem('lx_tenant_session'); }
  else { localStorage.setItem('lx_api_session', JSON.stringify(ag)); localStorage.removeItem('lx_logged_in'); localStorage.removeItem('lx_role'); localStorage.setItem('lx_tenant_session', JSON.stringify({ tenant: 'namwon', at: new Date().toISOString() })); }
}, [kind, S_STAFF, S_AGENCY]);
const tilesReady = () => page.waitForFunction(() => window.__xi?.A?.loaded?.() && window.__xi.A.areTilesLoaded(), null, { timeout: 20000 }).catch(() => {});

ops.goto(OPS + 'index.html').catch(() => {});

// ══ 1. 게스트 필름(마감까지 스크롤) ══
await page.goto(BASE + 'proto/scrub/index.html');
await page.waitForLoadState('load').catch(() => {});
await wait(1500); T.film0 = mark('film.goto');
await page.mouse.move(720, 450);
await cap('게스트 · Land-XI 필름 — 국토는 매일 조금씩 달라진다', 5000);
for (let i = 0; i < 70; i++) { await page.mouse.wheel(0, 260); await wait(90); }
await wait(1200); T.film1 = mark('film.end');

// ══ 2. 공개 XI맵(시민 · 실태조사 스위치 없음) ══
const svReq = [];
const onReq = (r) => { if (/\/xi\/survey\/|\/survey\/|\/events\/tenant|\/agent\//.test(r.url())) svReq.push(r.url()); };
page.on('request', onReq);
T.pubGo = mark('public.goto');
await page.goto(XI + '?public=1&cam=127.47,35.425,12,0,0');
await page.waitForFunction(() => document.documentElement.dataset.lx === 'ready', null, { timeout: 60000 });
await page.waitForFunction(() => document.documentElement.dataset.canvas === 'open', null, { timeout: 45000 }).catch(() => {});
await tilesReady(); T.pub0 = mark('public.canvas') + 0.2;
await cap('공개 XI맵 · 로그인 없이 시민도 — 실태조사·에이전트 요청 0(정직한 공개판)', 4500);
await page.waitForFunction(() => window.__xi?.PHASES?.some((x) => x.p === 'arrived'), null, { timeout: 45000 }).catch(() => {});
await wait(2200);
page.off('request', onReq);
T.pub1 = mark('public.end', { mast: await ev(() => document.getElementById('mast-mode')?.textContent), surveyRequests: svReq.length, switchHidden: await ev(() => !document.getElementById('mode-sw') || document.getElementById('mode-sw').hidden) });

// ══ 3. 로그인(LX 직원) → 대시보드 → 레일 '지도 서비스' ══
await page.goto(BASE + 'proto/login.html');
await page.waitForFunction(() => window.__login && window.__login.ready, null, { timeout: 30000 }).catch(() => {});
await wait(600); T.login0 = mark('login.ready');
await cap('로그인 — Hyper Performance · Hyper Solution · Hyper GeoAI 통합 플랫폼 서비스', 5000);
await clickSel('.lg-seg__c:has-text("LX 직원")', 18);
await clickSel('#lgEmail', 10); await page.keyboard.type('hong@lx.or.kr', { delay: 45 });
await clickSel('#lgPw', 8); await page.keyboard.type('lx-2026', { delay: 45 });
await wait(300);
await clickSel('#lgSubmit', 10); mark('login.submit');
await page.waitForURL((u) => !/login\.html/.test(String(u)), { timeout: 20000 }).catch(() => {});
await setSession('staff');   // 시연 로그인 폼 → 게이트웨이 세션(개발 SSO 대역)
await page.waitForSelector('#rail [data-menu="map"]', { timeout: 20000 }).catch(() => {});
await wait(1200); mark('dash');
if (await page.locator('#rail [data-menu="map"]').count()) await clickSel('#rail [data-menu="map"]', 16); else await page.goto(XI);
T.login1 = mark('rail.map');

// ══ 4. XI맵 글로브 → 남원 하강 → 129,420 도착 ══
await page.waitForURL(/xi\/index\.html/, { timeout: 20000 }).catch(() => {});
await page.waitForFunction(() => document.documentElement.dataset.lx === 'ready', null, { timeout: 60000 });
T.xi0 = mark('xi.ready', { mode: await ev(() => document.documentElement.dataset.mode) });
if ((await ev(() => document.documentElement.dataset.mode)) !== 'on') await fail('XI맵이 on 모드가 아님');
await page.mouse.move(900, 520);
await cap('XI맵 · 글로브 → 남원 25cm 항공 위 AI 판독 도착(실측 봉투)', 6000);
await page.waitForFunction(() => window.__xi?.PHASES?.some((x) => x.p === 'arrived'), null, { timeout: 60000 }).catch(() => {});
T.xiArr = mark('xi.arrived', { big: await ev(() => document.getElementById('hud-big').textContent) });
await wait(1400);

// ══ 5. ⌘K 에이전트 ══
await page.waitForFunction(() => document.documentElement.dataset.agent === 'ready', null, { timeout: 30000 }).catch(() => {});
T.ag0 = mark('agent.start');
await page.keyboard.press('Control+k'); await wait(800);
await page.keyboard.type('아영면에서 논에 건물 있는 필지 보여줘', { delay: 40 });
await wait(250);
let prevRun = (await ds()).agentRun || '';
await page.keyboard.press('Enter'); mark('agent.submit');
await cap('⌘K 에이전트(Gemma 4 · vLLM GPU1) — 실태조사 API 를 불러 필지로 답한다', 6000);
await waitDs('agentPlan', '*', 60000).catch(() => {}); mark('agent.plan');
await page.waitForFunction(() => +document.documentElement.dataset.agentArrived > 0, null, { timeout: 90000 }).catch(() => {}); mark('agent.arrived', { ms: (await ds()).agentArrived });
await page.waitForFunction((p) => document.documentElement.dataset.agentRun !== p, prevRun, { timeout: 30000 }).catch(() => {});
await page.waitForFunction(() => ['done', 'failed', 'rejected'].includes(document.documentElement.dataset.agentState), null, { timeout: 120000 }).catch(() => {});
ids.run_E = (await ds()).agentRun; T.ag1 = mark('agent.done', { run: ids.run_E, state: (await ds()).agentState });
await wait(2600);
T.ag2 = mark('agent.end');

// ══ 6. [기관 · 남원시 농정과] 실태조사 모드 → 대조 스윕 39칸 → 의심 큐 → 필지 카드 v2 → 배정 → 보고서 초안 ══
await setSession('agency');
T.svGo = mark('agency.goto');
await page.goto(XI + '?cam=127.47,35.425,12.5,35,0&on=namwon-landcover-2023');
await page.waitForFunction(() => document.documentElement.dataset.lx === 'ready', null, { timeout: 60000 });
await page.waitForFunction(() => document.documentElement.dataset.canvas === 'open', null, { timeout: 45000 }).catch(() => {});
await tilesReady(); T.sv0 = mark('agency.ready') + 0.25;
await markNow();
await cap('남원시 농정과(기관) · 실태조사 — 연속지적 332,084필지 × AI 판독 대장 대조', 5500);
await page.waitForFunction(() => window.__xi.PHASES.some((x) => x.p === 'survey-enter'), null, { timeout: 30000 }).catch(() => {}); mark('survey.enter');
await wait(500);
await ev(() => window.__xi.panel?.setOpen?.(true));
await phase('survey-started', 30000).catch(() => {}); ids.job_S = await ev(() => window.__xi.state.surveyJob || null); mark('survey.started', { job: ids.job_S });
await phase('survey-result', 90000).catch(() => {});
T.svDone = mark('survey.result', { big: await ev(() => document.getElementById('hud-big').textContent), job: await ev(() => document.getElementById('hud-job').textContent) });
await cap(`대조 스윕 39칸(CPU 워커 · ${ids.job_S ? '…' + String(ids.job_S).slice(-8) : 'job_S'}) → 의심 필지 · 규칙 R1–R6`, 4500);
await wait(1400);
await clickSel('#panel .sv-q', 12); await page.waitForFunction(() => document.getElementById('fdrawer').dataset.total != null, null, { timeout: 20000 }).catch(() => {}); mark('queue.open', { n: await ev(() => document.getElementById('fdrawer').dataset.total) });
await wait(400);
await clickSel('#fdrawer [data-rule=R1]', 10); await wait(300); await clickSel('#fdrawer [data-prio=A]', 8);
await wait(900); mark('queue.R1A', { n: await ev(() => document.getElementById('fdrawer').dataset.total) });
const rowSel = `#fdrawer .sv-item[data-pnu="${TARGET_PNU}"]`;
if (!(await page.locator(rowSel).count())) { await fail('대상 행 없음 ' + TARGET_PNU); }
await page.locator(rowSel).scrollIntoViewIfNeeded();
const row = await page.locator(rowSel).boundingBox();
await moveTo(row.x + 200, row.y + 28, 14); await wait(700);
await markNow(); await page.mouse.down(); await page.mouse.up(); T.card = mark('card.click');
await page.waitForFunction(() => document.getElementById('pcard2').dataset.ready === '1', null, { timeout: 30000 }).catch(() => {});
mark('card.ready', { pnu: await ev(() => document.getElementById('pcard2').dataset.pnu) });
await cap('필지 카드 v2 — 대장(지목 답) vs 현황(AI 건물) · 2023 ↔ 2025', 5000);
await wait(1200);
await clickSel('#pcard2 .sv-ep input[value="2025"]', 12).catch(() => {}); await wait(1200);
await clickSel('#pcard2 .sv-ep input[value="2023"]', 8).catch(() => {}); await wait(700);
// 배정(반화면 관제 · 기관 실태조사 막대)
await ops.evaluate(() => { const h = [...document.querySelectorAll('h2,h3')].find((x) => /실태조사/.test(x.textContent)); (h?.closest('section,div') || h)?.scrollIntoView({ block: 'start' }); }).catch(() => {});
const opsN0 = await ops.evaluate(() => +((/배정\s*(\d+)/.exec(document.body.innerText) || [])[1] || 0)).catch(() => 0);
T.split1a = mark('split1.start', { opsN0 });
await clickSel('#pcard2 .sv-as', 12); await wait(600);
const tGo = Date.now();
await clickSel('#pcard2 .sv-card-sheet .sv-go', 10); mark('assign.click', { finding: TARGET });
await page.waitForFunction(() => document.getElementById('pcard2').dataset.state === 'assigned', null, { timeout: 10000 }).catch(() => {});
mark('assign.chip', { ms: Date.now() - tGo }); ids.finding = TARGET;
await cap(`현장조사 배정 · ${TARGET} → 관제(:8702) 기관 막대 실시간`, 4000);
await cap(`기관 막대 · ${TARGET}`, 3500, ops);
const opsSeen = await ops.waitForFunction((n0) => { const m = /배정\s*(\d+)/.exec(document.body.innerText); return m && +m[1] > n0; }, opsN0, { timeout: 5000 }).then(() => Date.now()).catch(() => null);
mark('assign.ops', { ms_from_click: opsSeen ? opsSeen - tGo : null });
await wait(1800);
T.split1b = mark('split1.end');
await clickSel('#pcard2 .sv-rp', 12);
await page.waitForFunction(() => document.getElementById('drawer').dataset.kind === 'report', null, { timeout: 10000 }).catch(() => {});
T.draftA = mark('draft.open', { by: await ev(() => document.getElementById('report-draft-slot').dataset.by) });
await cap('보고서 초안 — 인용 [n] = 필지 · 숫자는 봉투 칩만 · .docx', 5000);
const docxSel = '#report-draft-slot .ag-docx:not([disabled]), #report-draft-slot button:has-text("docx"):not([disabled])';
const docxOn = await page.waitForSelector(docxSel, { timeout: 90000 }).then(() => true).catch(() => false);
let docx = null;
if (docxOn) {
  await wait(500); T.docxA = mark('draft.ready', { run: (await ds()).agentDraftRun });
  const dlp = page.waitForEvent('download', { timeout: 20000 }).catch(() => null);
  await clickSel(docxSel, 8);
  const dl = await dlp; if (dl) { docx = path.join(OUT, 'logs', dl.suggestedFilename()); await dl.saveAs(docx); }
}
T.draftEnd = mark('draft.docx', { docx, bytes: docx ? fs.statSync(docx).size : 0 });
await wait(1400);

// ══ 7. [직원] 익산 황등 378칸 실추론(GPU0) · 반화면 관제 같은 job ══
await setSession('staff');
T.jGo = mark('staff.goto');
await page.goto(XI + `?cam=126.9481,35.99655,16.6,0,0&model=car_v2_obb`);
await page.waitForFunction(() => document.documentElement.dataset.lx === 'ready', null, { timeout: 60000 });
await page.waitForFunction(() => document.documentElement.dataset.restored === '1', null, { timeout: 60000 }).catch(() => {});
await tilesReady(); T.j0 = mark('hw.ready') + 0.25;
await cap('익산 황등 · 1.36cm 드론 — 프레임 → 견적 → 실행(A6000 GPU0 실추론)', 5000);
await wait(600);
// 프레임을 사람 손처럼 그린다(사각 도구) — 화면 좌표는 지도 투영
await clickSel('#tool-rect', 12);
const fr = await ev((b) => { const A = window.__xi.A; const p = A.project([b[0], b[3]]), q = A.project([b[2], b[1]]); return [p.x, p.y, q.x, q.y]; }, HW);
await moveTo(fr[0], fr[1], 12); await page.mouse.down(); await page.mouse.move((fr[0] + fr[2]) / 2, (fr[1] + fr[3]) / 2, { steps: 10 }); await page.mouse.move(fr[2], fr[3], { steps: 10 }); await page.mouse.up();
let qok = await page.waitForSelector('#quote-card .xi-run', { timeout: 10000 }).then(() => true).catch(() => false);
if (!qok) { await ev((b) => window.__xi.frameRect(b), HW); qok = await page.waitForSelector('#quote-card .xi-run', { timeout: 20000 }).then(() => true).catch(() => false); }
if (!qok) await fail('견적 카드 없음');
mark('quote', { text: (await ev(() => document.getElementById('quote-card').innerText)).replace(/\s+/g, ' ').slice(0, 240) });
await wait(1300);
await markNow(); await clickSel('#quote-card .xi-run', 10); mark('run');
for (let i = 0; i < 100 && !ids.job_J; i++) { ids.job_J = await ev(() => window.__xi.state.job || null); if (!ids.job_J) await wait(100); }
mark('job.id', { job: ids.job_J });
if (!ids.job_J) await fail('job id 없음');
await ops.goto(OPS + 'infra.html?job=' + encodeURIComponent(ids.job_J)).catch(() => {});
T.split2a = mark('split2.start');
await cap(`실추론 job …${ids.job_J.slice(-8)} · 칸마다 도착 · HUD = SSE 봉투`, 6000);
await ops.waitForFunction(() => document.documentElement.dataset.lx === 'ready', null, { timeout: 20000 }).catch(() => {});
await cap(`관제 · 같은 job …${ids.job_J.slice(-8)} · GPU0 이동평균 · W`, 12000, ops);
const gpuLog = []; const gpuT = setInterval(async () => { try { const g = await ev(() => document.querySelector('.xi-gpul')?.innerText || ''); if (g && g !== gpuLog.at(-1)?.g) gpuLog.push({ t: +((Date.now() - T0) / 1000).toFixed(2), g }); } catch { /* */ } }, 500);
const okDone = await phase('job-done', 180000).then(() => true).catch(() => false);
if (!okDone) { clearInterval(gpuT); await fail('job.done 이 180 s 안에 오지 않음'); }
await wait(1200);
clearInterval(gpuT);
T.jDone = mark('job.done', { job: await ev(() => document.getElementById('hud-job').innerText), api: await ev(() => window.__xi.jobApi), gpuLog });
await cap('job.done — GPU 초당 · 벽시계 = GET /jobs/{id} = 관제 행', 5000);
await wait(2600);
mark('ops.row', { focus: await ops.evaluate(() => !!document.querySelector('.q-row.is-focus')).catch(() => null), gpu: await ops.evaluate(() => [...document.querySelectorAll('.gpu-row')].map((r) => r.innerText.replace(/\s+/g, ' ').slice(0, 140))).catch(() => null) });
T.split2b = mark('split2.end');
await page.screenshot({ path: path.join(OUT, 'stills', '_xi-job-done.png') });
await ops.screenshot({ path: path.join(OUT, 'stills', '_ops-job.png') });
// GET /jobs/{id} 4곳 일치 표(편집 자막·결과 문서용)
ids.jobApi = await (await fetch(API + '/api/v1/jobs/' + ids.job_J, { headers: H(S_STAFF) })).json().catch(() => null);

// ══ 8. 관제 배포 롤백(반화면) → XI맵 계보 칩 ══
await ops.goto(OPS + 'deploys.html?deploy=dp-nw-farm-25');
await ops.waitForFunction(() => document.documentElement.dataset.lx === 'ready', null, { timeout: 30000 }).catch(() => {});
await ops.waitForSelector('button:has-text("롤백 →"):not([disabled])', { timeout: 30000 }).catch(() => {});
// XI맵은 남원시 기관 세션으로(dp-nw-farm-25 = 남원 배포본 · 기관 스트림 deploy.changed 실시간)
await setSession('agency');
await page.goto(XI + '?cam=127.47,35.425,12.5,0,0&svc=dp-nw-farm-25');
await page.waitForFunction(() => document.documentElement.dataset.lx === 'ready', null, { timeout: 60000 });
await page.waitForFunction(() => document.documentElement.dataset.canvas === 'open', null, { timeout: 45000 }).catch(() => {});
await tilesReady();
await page.waitForFunction(() => !!document.getElementById('hud-lin')?.dataset.version, null, { timeout: 20000 }).catch(() => {});
await page.waitForFunction(() => window.__xi?.tenantStream === 'on', null, { timeout: 20000 }).catch(() => {});   // 기관 스트림 연결 뒤에 롤백(연결 전 이벤트 유실 방지)
await wait(800);
await wait(600);
T.split3a = mark('split3.start', { lin: await ev(() => document.getElementById('hud-lin')?.dataset.version) });
await cap('관제 배포 제어 · dp-nw-farm-25 v2.1 → v2.0 롤백 → XI맵 계보 칩 실시간', 6000);
await clickSel('button:has-text("롤백 →")', 14, ops);
await ops.waitForSelector('.og-modal input', { timeout: 8000 }).catch(() => {});
await ops.fill('.og-modal input', '통합 영상 · 2025 드론 결과 재검수(곧 되돌림)').catch(() => {});
await ops.waitForTimeout(400);
const tRb = Date.now();
await clickSel('.og-modal .is-caution', 10, ops); mark('rollback.click');
const linSeen = await page.waitForFunction(() => document.getElementById('hud-lin')?.dataset.version === 'v2.0', null, { timeout: 15000 }).then(() => Date.now()).catch(() => null);
mark('rollback.lineage', { ms: linSeen ? linSeen - tRb : null, toast: await ev(() => document.getElementById('xi-toasts')?.textContent || '') });
await wait(2400);
T.split3b = mark('split3.end');

// ══ 9. Land-XI Global 영문 · 남원 → 글로브 → 으슥아타 · NDVI 월별(큐 · CPU 워커) ══
await setSession('staff');   // Global 은 LX 직원 세션(기관 세션이면 투어가 서지 않는다)
T.gGo = mark('global.goto');
await page.goto(BASE + 'global/index.html?tenant=lx&locale=en&from=namwon&tour=1');
await page.waitForFunction(() => document.documentElement.dataset.lx === 'ready', null, { timeout: 60000, polling: 50 }).catch(() => {});
T.g0 = mark('global.ready');
await cap('Land-XI Global · same map, same queue — Namwon → globe → Ysyk-Ata, Kyrgyzstan', 7000);
await page.waitForFunction(() => window.__f1dTour === 'rolling' || window.__f1dTour === 'done' || (window.__f1dMarks || []).some((m) => /ys|arriv/.test(m.k)), null, { timeout: 90000, polling: 100 }).catch(() => {});
T.gRoll = mark('global.rolling', { marks: await ev(() => (window.__f1dMarks || []).map((m) => m.k)) });
// NDVI 월 칸이 하나 이상 차오를 때까지(최대 60 s) — 편집은 앞 18 s + 첫 칸 도착만
const t0g = Date.now();
await page.waitForFunction(() => [...document.querySelectorAll('.g-slot')].some((s) => s.dataset.dist && s.dataset.dist !== '-'), null, { timeout: 60000, polling: 250 }).catch(() => {});
T.gCell = mark('global.cell', { waited_s: (Date.now() - t0g) / 1000, job: await ev(() => window.__f1d?.scenes?.ys?.S?.result?.job_id || window.__f1d?.scenes?.ys?.S?.jobId || null) });
ids.job_G = marks.at(-1).job;
await cap('Monthly NDVI through the same job queue (CPU worker · shard = month) — measured, not model inference', 5000);
await wait(4500);
T.gEnd = mark('global.end');
await page.screenshot({ path: path.join(OUT, 'stills', '_global.png') });

T.end = mark('end');
await page.close(); await ops.close();
const vidA = await page.video().path(), vidB = await ops.video().path();
await ctxA.close(); await ctxB.close(); await browser.close();
const RAWA = path.join(OUT, 'raw', 'A.webm'), RAWB = path.join(OUT, 'raw', 'B.webm');
fs.copyFileSync(vidA, RAWA); fs.copyFileSync(vidB, RAWB);
await restoreServer();
const health1 = await (await fetch(API + '/api/v1/health')).json().catch(() => ({}));
fs.writeFileSync(path.join(OUT, 'logs', 'record-raw.json'), JSON.stringify({ T, marks, ids, logs, queue, boot: [health0.boot_at, health1.boot_at] }, null, 1));
console.log('[raw] ok', { ids: { ...ids, jobApi: undefined }, errs: logs.length, reboot: health0.boot_at !== health1.boot_at });

/** 서버 원복: 배정한 finding → open · dp-nw-farm-25 → v2.1 ga */
async function restoreServer() {
  devReset(TARGET); console.log('[restore] finding open', TARGET);
  const post = (p, body = {}) => fetch(API + '/api/v1' + p, { method: 'POST', headers: H(S_ADMIN), body: JSON.stringify(body) }).then((r) => r.json()).catch(() => null);
  let d = await (await fetch(API + '/api/v1/deploys/dp-nw-farm-25', { headers: H(S_ADMIN) })).json();
  if (d.version === 'v2.1' && d.stage === 'ga') { console.log('[restore] deploy 이미 v2.1 ga'); return; }
  if (d.stage === 'rolled_back') {
    await post('/deploys/dp-nw-farm-25/rollout', { stage: 'canary' });
    await post('/deploys/dp-nw-farm-25/approve', { decision: 'approve', reason: 'F2 통합 영상 뒤 복구' });
    await post('/deploys/dp-nw-farm-25/rollout', { stage: 'ga' });
    d = await (await fetch(API + '/api/v1/deploys/dp-nw-farm-25', { headers: H(S_ADMIN) })).json();
  }
  if (d.version !== 'v2.1') {
    await post('/deploys/dp-nw-farm-25/rollback', {});
    await post('/deploys/dp-nw-farm-25/rollout', { stage: 'canary' });
    await post('/deploys/dp-nw-farm-25/approve', { decision: 'approve', reason: 'F2 통합 영상 뒤 복구 2' });
    await post('/deploys/dp-nw-farm-25/rollout', { stage: 'ga' });
  }
  d = await (await fetch(API + '/api/v1/deploys/dp-nw-farm-25', { headers: H(S_ADMIN) })).json();
  console.log('[restore] deploy', d.version, d.stage);
}
