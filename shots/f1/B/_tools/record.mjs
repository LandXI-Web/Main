// F1-B 판정 영상 녹화 — F1-A 화면(1440×900 · 실서버 on 모드) + 터미널 반화면(480×900 · termfeed.py :8799 실명령/실로그)
// 두 컨텍스트를 동시에 recordVideo → marks.json(벽시계) 으로 ffmpeg 정렬·합성(compose.ps1).
import { chromium } from 'playwright';
import fs from 'node:fs';

const API = 'http://localhost:8700', PW = 'landxi-dev-2026';
const OUT = 'E:/Land-XI 플랫폼/01. 디자인/shots/f1/B/';
const RAW = OUT + '_raw/';
fs.mkdirSync(RAW, { recursive: true });
for (const f of fs.readdirSync(RAW)) if (f.endsWith('.webm')) fs.unlinkSync(RAW + f);
const marks = { t: {} };
const mark = (k) => { marks.t[k] = Date.now(); console.log(k, new Date().toISOString().slice(11, 23)); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cmd = (name) => fetch('http://127.0.0.1:8799/cmd?name=' + encodeURIComponent(name), { method: 'POST' });
const login = async (role) => (await (await fetch(API + '/api/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ realm: 'lx', login: 'lx-' + role, password: PW }) })).json());

// 영상용 J1 프레임(완료 ≤ 25s 역산 · 378 shard) · 영업 시연 프레임(작게 · ~6s)
const J1 = [126.9467, 35.9956, 126.9495, 35.9975];
const DEMO = [126.9480, 35.9960, 126.9492, 35.9969];
const CAM = { center: [126.9478, 35.99655], zoom: 17.0, pitch: 0, bearing: 0 };

const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
// 터미널
const ctxT = await b.newContext({ viewport: { width: 480, height: 900 }, recordVideo: { dir: RAW + 'term', size: { width: 480, height: 900 } } });
mark('ctxT');
const pT = await ctxT.newPage();
await pT.goto('http://127.0.0.1:8799/');
// F1-A (직원 세션)
const staff = await login('staff');
const ctxA = await b.newContext({ viewport: { width: 1440, height: 900 }, recordVideo: { dir: RAW + 'screen', size: { width: 1440, height: 900 } } });
mark('ctxA');
await ctxA.addInitScript(([s]) => {
  const want = sessionStorage.getItem('lx_rec_role');
  if (want === 'sales' && window.__salesSession) return;
  if (sessionStorage.getItem('lx_rec_boot')) return; sessionStorage.setItem('lx_rec_boot', '1');
  localStorage.setItem('lx_api_base', 'http://localhost:8700'); localStorage.removeItem('lx_api_mode');
  localStorage.setItem('lx_api_session', JSON.stringify(s)); localStorage.setItem('lx_logged_in', '1'); localStorage.setItem('lx_role', 'staff'); localStorage.removeItem('lx_tenant_session');
}, [staff]);
const pA = await ctxA.newPage();
const errs = [];
pA.on('pageerror', (e) => errs.push(e.message));
await pA.goto('http://localhost:4173/landxi/xi/index.html?cam=126.9530,35.9990,13.2,0,0&model=car_v2_obb');
await pA.waitForFunction(() => document.documentElement.dataset.restored === '1', null, { timeout: 90000 });
await sleep(2500);

// ── 0–5s 터미널: compose ps · 워커 VRAM 예산 로그 · Ollama 생존 ──
mark('T0');
await cmd('ps'); await sleep(1300);
await cmd('vramlog'); await sleep(1500);
await cmd('tasklist'); await sleep(1400);
// ── 5–12s F1-A: 익산 황등 1.36cm 로 하강 → 사각 프레임 → 견적 ──
mark('fly');
await pA.evaluate((cam) => window.__xi.flyTo(cam, 4200), CAM);
await sleep(4700);
await pA.screenshot({ path: OUT + 'f1b-01-hwangdeung-1.36cm.png' });
mark('frame');
await pA.click('#tool-rect');
const fr = await pA.evaluate((J) => { const A = window.__xi.M.A; const a = A.project([J[0], J[3]]), c = A.project([J[2], J[1]]); return [a.x, a.y, c.x, c.y]; }, J1);
await pA.mouse.move(fr[0], fr[1]); await pA.mouse.down(); await pA.mouse.move(fr[2], fr[3], { steps: 18 }); await pA.mouse.up();
await pA.waitForSelector('#quote-card .xi-run', { timeout: 20000 });
mark('quote');
await sleep(1600);
await pA.screenshot({ path: OUT + 'f1b-02-quote.png' });
marks.quote = (await pA.evaluate(() => document.getElementById('quote-card').innerText)).replace(/\s+/g, ' ').slice(0, 200);
// ── 12–30s 실행 → shard 격자 · 워커 로그 동기 · HUD ──
await cmd('tail:job');
await sleep(300);
mark('run');
await pA.click('#quote-card .xi-run');
await pA.waitForFunction(() => !!window.__xi.state.job, null, { timeout: 20000 });
const job = await pA.evaluate(() => window.__xi.state.job);
marks.job = job; console.log('job', job);
await sleep(7000);
await pA.screenshot({ path: OUT + 'f1b-03-theater-mid.png' });
mark('mid');
await pA.waitForFunction(() => window.__xi.PHASES.some((x) => x.p === 'snapshot'), null, { timeout: 150000 });
mark('snapshot');
await sleep(600);
await cmd('untail');
await pA.screenshot({ path: OUT + 'f1b-04-job-done-snapshot.png' });
marks.hud = await pA.evaluate(() => ({ big: document.getElementById('hud-big')?.textContent, job: document.getElementById('hud-job')?.textContent, mast: document.getElementById('mast-mode')?.textContent, live: window.__xi.theater?.S?.live }));
// ── 30–35s 스와이프(원본 ↔ AI 결과) · 정답 대비 P/R 봉투(터미널 qa.json) ──
await cmd('qa:' + job);
await pA.click('#tool-swipe').catch(() => {});
await sleep(900);
const sw = await pA.evaluate(() => { const h = document.getElementById('grip'); if (!h) return null; const r = h.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
if (sw) { await pA.mouse.move(sw[0], sw[1]); await pA.mouse.down(); await pA.mouse.move(sw[0] - 260, sw[1], { steps: 25 }); await pA.mouse.move(sw[0] + 180, sw[1], { steps: 25 }); await pA.mouse.up(); }
await sleep(1800);
await pA.screenshot({ path: OUT + 'f1b-05-swipe-qa.png' });
mark('swipe');
await pA.click('#tool-swipe').catch(() => {});
// ── 35–40s 영업 세션: demo:true → 마스트 '시연' · detections 0 · usage_events lx-demo ──
const sales = await login('sales');
await pA.evaluate((s) => { localStorage.setItem('lx_api_session', JSON.stringify(s)); localStorage.setItem('lx_role', 'sales'); sessionStorage.setItem('lx_rec_role', 'sales'); window.__salesSession = 1; }, sales);
mark('sales');
await pA.goto('http://localhost:4173/landxi/xi/index.html?cam=126.9486,35.99645,17.6,0,0&model=car_v2_obb');
await pA.waitForFunction(() => document.documentElement.dataset.restored === '1', null, { timeout: 90000 });
await sleep(1200);
marks.salesMast = await pA.evaluate(() => document.getElementById('mast-mode')?.textContent);
await pA.click('#tool-rect');
const fd = await pA.evaluate((J) => { const A = window.__xi.M.A; const a = A.project([J[0], J[3]]), c = A.project([J[2], J[1]]); return [a.x, a.y, c.x, c.y]; }, DEMO);
await pA.mouse.move(fd[0], fd[1]); await pA.mouse.down(); await pA.mouse.move(fd[2], fd[3], { steps: 12 }); await pA.mouse.up();
await pA.waitForSelector('#quote-card .xi-run', { timeout: 20000 });
await sleep(900);
await pA.screenshot({ path: OUT + 'f1b-06-sales-quote-demo.png' });
await pA.click('#quote-card .xi-run');
await pA.waitForFunction(() => !!window.__xi.state.job, null, { timeout: 20000 });
const djob = await pA.evaluate(() => window.__xi.state.job);
marks.demoJob = djob; console.log('demo job', djob);
await pA.waitForFunction(() => window.__xi.PHASES.some((x) => x.p === 'snapshot'), null, { timeout: 90000 });
await sleep(500);
await cmd('psql:' + djob);
await sleep(2600);
await pA.screenshot({ path: OUT + 'f1b-07-sales-demo-done.png' });
await pT.screenshot({ path: OUT + 'f1b-07-terminal-psql.png' });
marks.salesHud = await pA.evaluate(() => ({ mast: document.getElementById('mast-mode')?.textContent, job: document.getElementById('hud-job')?.textContent }));
mark('end');
await sleep(800);
marks.errs = errs;
const vA = pA.video(), vT = pT.video();
await ctxA.close(); await ctxT.close();
marks.videoA = await vA.path(); marks.videoT = await vT.path();
fs.writeFileSync(OUT + '_raw/marks.json', JSON.stringify(marks, null, 1));
console.log(JSON.stringify(marks, null, 1));
await b.close();
