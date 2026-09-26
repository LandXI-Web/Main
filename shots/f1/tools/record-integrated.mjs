// F1-∑ 통합 동작 영상(≈120 s · 1440×900 · h264) — 실제 서버(게이트웨이 :8700 · 워커 · 관제 :8702)로 한 번에 찍는다.
//   DEV_PASSWORD=… node shots/f1/tools/record-integrated.mjs
// 두 브라우저 컨텍스트를 **같은 벽시계**로 동시에 녹화한다:
//   A = 4173(XI맵 → Global 영문판)  ·  B = 8702(LX/OPS 관제 · 별도 origin)
// 편집은 잘라 잇기만 한다(내용 손대지 않음 · 합성 수치 0). 관제 토막은 XI맵 작업과 **같은 시각**의 녹화이며 자막에 시각과 job id 를 적는다.
// 자막 · 커서는 녹화 전용 오버레이(제품 코드 아님).
// 전력 규칙: GPU 작업은 XI 프레임 1건(워커 a6000-0 한 장)뿐 · Global G-J1 은 CPU 워커. Ollama 는 건드리지 않는다.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const OUT = 'shots/f1';
const RAW = path.join(OUT, 'integrated-raw');
const BASE = 'http://localhost:4173';
const OPS = 'http://localhost:8702';
const API = 'http://localhost:8700';
const PW = process.env.DEV_PASSWORD;
if (!PW) { console.error('DEV_PASSWORD 필요'); process.exit(2); }
fs.mkdirSync(RAW, { recursive: true });

const session = await (await fetch(API + '/api/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ realm: 'lx', login: 'lx-staff', password: PW }) })).json();
if (!session.token) { console.error('[fail] 게이트웨이 로그인 실패'); process.exit(2); }
await fetch(OPS + '/landxi/ops/bridge/worker/reset', { method: 'POST' }).catch(() => {});   // 배포 상태 = 픽스처 시드(롤백 장면 재현)

const OVERLAY = () => {
  const mk = () => { if (document.getElementById('__cur')) return; const c = document.createElement('div'); c.id = '__cur'; c.style.cssText = 'position:fixed;left:-40px;top:-40px;width:18px;height:18px;margin:-9px 0 0 -9px;border:2px solid #fff;border-radius:50%;box-shadow:0 0 0 1px rgba(0,0,0,.6);z-index:2147483647;pointer-events:none'; document.documentElement.append(c); };
  addEventListener('mousemove', (e) => { mk(); const c = document.getElementById('__cur'); c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px'; }, true);
  addEventListener('mousedown', () => { const c = document.getElementById('__cur'); if (c) { c.style.transform = 'scale(.6)'; setTimeout(() => (c.style.transform = ''), 180); } }, true);
  window.__cap = (txt, ms = 4000) => {
    let c = document.getElementById('__cap');
    if (!c) { c = document.createElement('div'); c.id = '__cap'; c.style.cssText = 'position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:2147483646;pointer-events:none;background:rgba(1,1,2,.82);color:#fff;font:500 15px/20px Pretendard,"Pretendard Variable",Inter,system-ui,sans-serif;letter-spacing:.01em;padding:9px 16px;white-space:nowrap;transition:opacity 380ms cubic-bezier(.22,1,.36,1);opacity:0'; document.documentElement.append(c); }
    c.textContent = txt; c.style.opacity = '1'; clearTimeout(window.__capT); window.__capT = setTimeout(() => { c.style.opacity = '0'; }, ms);
  };
};

const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const mkCtx = () => browser.newContext({ viewport: { width: 1440, height: 900 }, recordVideo: { dir: RAW, size: { width: 1440, height: 900 } } });
const ctxA = await mkCtx(), ctxB = await mkCtx();
await ctxA.addInitScript(([api, s]) => {
  if (!sessionStorage.getItem('rec_boot')) {
    sessionStorage.setItem('rec_boot', '1');
    localStorage.setItem('lx_api_base', api); localStorage.removeItem('lx_api_mode');
    localStorage.setItem('lx_api_session', JSON.stringify(s));
    localStorage.setItem('lx_logged_in', '1'); localStorage.setItem('lx_role', 'staff'); localStorage.removeItem('lx_tenant_session');
  }
}, [API, session]);
await ctxB.addInitScript(() => { if (!sessionStorage.getItem('rec_boot')) { sessionStorage.setItem('rec_boot', '1'); localStorage.removeItem('lx_api_mode'); localStorage.removeItem('lx_ops_src'); } });
await ctxA.addInitScript(OVERLAY); await ctxB.addInitScript(OVERLAY);

const T0 = Date.now();
const pa = await ctxA.newPage(); const tA0 = (Date.now() - T0) / 1000;
const pb = await ctxB.newPage(); const tB0 = (Date.now() - T0) / 1000;
const errs = [];
for (const [n, p] of [['A', pa], ['B', pb]]) { p.on('console', (m) => { if (m.type() === 'error') errs.push(`${n} console.error: ${m.text().slice(0, 240)}`); }); p.on('pageerror', (e) => errs.push(`${n} pageerror: ${e.message}`)); }
const marks = []; const mark = (k, extra) => { const t = (Date.now() - T0) / 1000; marks.push({ k, t, ...extra }); console.log(`[${t.toFixed(1)}s] ${k}${extra ? ' ' + JSON.stringify(extra).slice(0, 240) : ''}`); return t; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const io = (p) => ({
  move: (x, y, steps = 16) => p.mouse.move(x, y, { steps }),
  clickAt: async (x, y, steps = 16) => { await p.mouse.move(x, y, { steps }); await p.mouse.down(); await p.mouse.up(); },
  clickSel: async (sel, steps = 16) => { const b = await p.locator(sel).first().boundingBox(); await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps }); await p.mouse.down(); await p.mouse.up(); },
  cap: (t, ms) => p.evaluate(([t, ms]) => window.__cap && window.__cap(t, ms), [t, ms]).catch(() => {}),
});
const A = io(pa), B = io(pb);
const phase = (ph, ms = 40000) => pa.waitForFunction((ph) => window.__xi?.PHASES?.some((x) => x.p === ph && x.t > (window.__mark || 0)), ph, { timeout: ms });
const markNow = () => pa.evaluate(() => { window.__mark = performance.now(); });
const hhmmss = () => new Date().toLocaleTimeString('ko-KR', { hour12: false, timeZone: 'Asia/Seoul' });

// ── A: XI맵 부팅(글로브) · B: 관제 종이 무대 로그인 — 동시에 ──
const xiReady = (async () => {
  await pa.goto(BASE + '/landxi/xi/index.html'); mark('A.goto');
  await pa.waitForFunction(() => document.documentElement.dataset.lx === 'ready', null, { timeout: 60000 }); const t = mark('A.ready', { mode: await pa.evaluate(() => document.documentElement.dataset.mode) });
  await pa.mouse.move(900, 500);
  return t;
})();
await pb.goto(OPS + '/landxi/ops/login.html');
await pb.waitForFunction(() => document.documentElement.dataset.lx === 'ready', null, { timeout: 20000 }); mark('B.login.ready');
await pb.mouse.move(900, 450); await sleep(1500);
await B.clickSel('#id', 22); await pb.keyboard.type('lx-admin', { delay: 70 });
await pb.locator('#pw').click(); await pb.keyboard.type(PW, { delay: 40 });
await sleep(500);
await B.clickSel('#go'); mark('B.flip.start');
await pb.waitForFunction(() => document.documentElement.dataset.flip === 'grown', null, { timeout: 15000 }).catch(() => {}); mark('B.overview.grown');
await sleep(1500);
await B.clickSel('.og-nav a[data-page="infra"]'); await pb.waitForFunction(() => document.documentElement.dataset.lx === 'ready', null, { timeout: 20000 }); mark('B.infra.ready', { src: await pb.evaluate(() => document.documentElement.dataset.src) });
await pb.mouse.move(640, 330, { steps: 20 });

// ── A: 글로브 → 남원 25cm → P4 129,420 도착 ──
const tReady = await xiReady;
if ((await pa.evaluate(() => document.documentElement.dataset.mode)) !== 'on') throw new Error('XI맵이 on 모드로 뜨지 않음(게이트웨이 probe 실패)');
await A.cap('XI맵 · 글로브(VIIRS 어제) → 남원 · 2023 25cm 항공 위 AI 판독 도착', 6000);
await pa.waitForFunction(() => window.__xi?.PHASES?.some((x) => x.p === 'sweep'), null, { timeout: 45000 }); mark('A.sweep');
await phase('arrived', 45000); mark('A.city.arrived', { big: await pa.evaluate(() => document.getElementById('hud-big').textContent) });
await sleep(1800);

// 운봉읍 → 집계 카드 → 드론 AOI 하강 → 필지 카드
const pt = await pa.evaluate(() => window.__xi.emdPoint('운봉읍', [640, 450, 1140, 770]));
await markNow(); await A.clickAt(pt[0], pt[1], 20); mark('A.emd.click');
await pa.waitForFunction(() => !document.getElementById('emd-card').hidden, null, { timeout: 8000 }).catch(() => {});
await sleep(1500);
await markNow(); await A.clickSel('#emd-card .xi-aoi', 14); mark('A.aoi.descend');
await phase('arrived', 30000); mark('A.aoi.arrived', { big: await pa.evaluate(() => document.getElementById('hud-big').textContent) });
await A.cap('드론 AOI 1cm급 · 운봉 · 실제 결과(농경지 필지 · 변화 탐지) 도착', 3500);
const pp = await pa.evaluate(async () => { const X = window.__xi; const fa = await X.loadA02(); const id = X.state.aoiParcels[0]; const f = fa.features.find((x) => x.properties.id === id); const g = f.geometry.type === 'Polygon' ? f.geometry.coordinates[0] : f.geometry.coordinates[0][0]; let x = 0, y = 0; g.forEach((c) => { x += c[0]; y += c[1]; }); const q = X.A.project([x / g.length, y / g.length]); return [q.x, q.y]; });
await A.clickAt(pp[0], pp[1], 18); mark('A.parcel.click');
await pa.waitForFunction(() => document.getElementById('parcel-card').dataset.ready === '1', null, { timeout: 15000 }).catch(() => {});
mark('A.parcel.card'); await sleep(2200);
await A.clickSel('#parcel-card .xi-close', 10);

// 프레임 → 견적 → 실행(실제 GPU 워커 · a6000-0 한 장) → shard 도착 → job.done → snapshot
await A.clickSel('#tool-rect', 14); mark('A.frame.start');
const fr = await pa.evaluate(() => { const X = window.__xi, C = X.CAMS.A01; const a = X.A.project([C[0] + 0.0012, C[3] - 0.0012]), b = X.A.project([C[2] - 0.0012, C[1] + 0.0016]); return [a.x, a.y, b.x, b.y]; });
await A.move(fr[0], fr[1], 12); await pa.mouse.down(); await pa.mouse.move((fr[0] + fr[2]) / 2, (fr[1] + fr[3]) / 2, { steps: 10 }); await pa.mouse.move(fr[2], fr[3], { steps: 10 }); await pa.mouse.up(); mark('A.frame.drawn');
await pa.waitForSelector('#quote-card .xi-run', { timeout: 15000 }); await sleep(1300);
await markNow(); await A.clickSel('#quote-card .xi-run', 12); const tRun = mark('A.run', { at: hhmmss() });
// 같은 작업 id → 관제 딥링크(replaceState · 큐 행 강조)
let jobId = null;
for (let i = 0; i < 80 && !jobId; i++) { jobId = await pa.evaluate(() => { const h = document.getElementById('mast-ops')?.href || ''; const m = h.match(/job=([^&]+)/); return m ? decodeURIComponent(m[1]) : null; }); if (!jobId) await sleep(100); }
mark('A.job.id', { jobId });
if (jobId) await pb.evaluate((id) => { history.replaceState(null, '', location.pathname + '?job=' + encodeURIComponent(id)); }, jobId);
await B.cap(`관제 :8702 · 같은 시각 ${hhmmss()} · XI맵 작업 ${jobId ? jobId.slice(-8) : ''} · GPU0 실측`, 9000);
await pb.mouse.move(420, 360, { steps: 30 });
await phase('job-started', 60000).catch(() => {}); mark('A.job.started');
await A.cap('실행 · A6000 GPU0 이 Ollama 옆 남는 VRAM 에서 실제 추론 · 칸마다 도착', 6000);
const okDone = await phase('job-done', 150000).then(() => true).catch(() => false);
if (!okDone) throw new Error('job.done 이 150 s 안에 오지 않음');
mark('A.job.done', { job: await pa.evaluate(() => document.getElementById('hud-job').textContent), big: await pa.evaluate(() => document.getElementById('hud-big').textContent), live: await pa.evaluate(() => document.getElementById('hud-job').dataset.live) });
await phase('snapshot', 60000).catch(() => {}); mark('A.snapshot');
await sleep(2500);
mark('B.after.job', { focusRow: await pb.evaluate(() => !!document.querySelector('.q-row.is-focus')) });
await sleep(3000);

// ── B: 배포 제어 · R-1 롤백(dp-nw-farm-25 v2.1 → v2.0) ──
await B.clickSel('.og-nav a[data-page="deploys"]'); await pb.waitForFunction(() => document.documentElement.dataset.lx === 'ready', null, { timeout: 20000 }); const tDep = mark('B.deploys.ready');
await B.cap('배포 제어 · 남원 농경지 배포본 v2.1 → v2.0 롤백 · 지도 스냅샷 교체', 7000);
await sleep(1400);
await B.clickSel('.pn-sec .og-btn.is-caution'); await sleep(500);
await pb.locator('.og-modal input').click(); await pb.keyboard.type('2025 드론 결과 재검수 — 2023 항공으로 되돌림', { delay: 18 });
await B.clickSel('.og-modal .og-btn.is-caution'); mark('B.rollback');
await pb.waitForFunction(() => document.querySelector('[data-k="snapN"]')?.dataset.v === '76,215', null, { timeout: 10000 }).catch(() => {}); mark('B.snapshot', { snap: await pb.evaluate(() => document.querySelector('[data-k="snapN"]')?.dataset.v) });
await sleep(2600); mark('B.end');

// ── A: Global 영문판 · 남원 → 글로브 후퇴 → 으슥아타 · 큐를 거친 NDVI 월별 지수(G-J1 · CPU 워커) → 메이크틸라 ──
await pa.goto(BASE + '/landxi/global/index.html?tenant=lx&locale=en&from=namwon&tour=1'); mark('A.global.goto');
await pa.waitForFunction(() => document.documentElement.dataset.lx === 'ready', null, { timeout: 60000, polling: 50 }); mark('A.global.ready', { mode: await pa.evaluate(() => window.__f1d?.state?.().mode) });
await pa.waitForFunction(() => window.__f1dTour === 'rolling' || window.__f1dTour === 'done', null, { timeout: 120000 }); const tRoll = mark('A.global.rolling');
await A.cap('Land-XI Global · same map, same queue — Namwon → globe → Ysyk-Ata, Kyrgyzstan', 5000);
const gj1 = pa.waitForFunction(() => (window.__f1dMarks || []).some((m) => m.k === 'gj1-done'), null, { timeout: 900000, polling: 100 }).then(() => mark('A.global.gj1-done'));
await pa.waitForFunction(() => (window.__f1dMarks || []).some((m) => m.k === 'play-done'), null, { timeout: 120000, polling: 100 }).then(() => mark('A.global.play-done'));
await A.cap('Monthly NDVI via the job queue (CPU worker · shard = month) — index, not model inference', 7000);
// G-J1 은 CPU 워커가 Planetary Computer 월별 장면을 실제로 계산한다(한 달 19–55 s [실측 F1-D]) — 기다리는 동안 HUD 를 0.5 s 마다 기록(편집 근거)
const hudLog = []; const hudT = setInterval(async () => { try { const x = await pa.evaluate(() => (document.getElementById('hud')?.hidden ? '' : document.getElementById('hud')?.innerText || '').replace(/\s+/g, ' ').slice(0, 200)); if (x && x !== hudLog.at(-1)?.x) hudLog.push({ t: +((Date.now() - T0) / 1000).toFixed(2), x }); } catch { /* */ } }, 500);
await gj1; clearInterval(hudT); marks.push({ k: 'A.global.hudLog', t: (Date.now() - T0) / 1000, hudLog });
await pa.waitForFunction(() => (window.__f1dMarks || []).some((m) => m.k === 'sokuluk'), null, { timeout: 300000, polling: 100 }).then(() => mark('A.global.sokuluk'));
await pa.waitForFunction(() => (window.__f1dMarks || []).some((m) => m.k === 'meiktila'), null, { timeout: 300000, polling: 100 }).then(() => mark('A.global.meiktila'));
await A.cap('Meiktila, Myanmar · EMSR798 before / after · one swipe', 5000);
await pa.waitForFunction(() => window.__f1dTour === 'done', null, { timeout: 300000, polling: 250 }); mark('A.global.end', { f1dMarks: await pa.evaluate(() => window.__f1dMarks) });
await sleep(800); const tEndA = mark('A.end');

const va = pa.video(), vb = pb.video();
await pa.close(); await pb.close();
const rawA = await va.path(), rawB = await vb.path();
await ctxA.close(); await ctxB.close(); await browser.close();
fs.copyFileSync(rawA, path.join(RAW, 'A-4173.webm')); fs.copyFileSync(rawB, path.join(RAW, 'B-8702.webm'));
fs.writeFileSync(path.join(RAW, 'marks-raw.json'), JSON.stringify({ at: new Date().toISOString(), tA0, tB0, jobId, marks, errs }, null, 1));
console.log('[raw] 저장', { jobId, errs: errs.length });
