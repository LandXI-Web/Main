// F1-A 판정 영상(≈45s · 1440×900 · Playwright recordVideo) — landxi/xi/index.html 한 번에 찍고 ffmpeg 로 편집한다.
//   LX_API=on DEV_PASSWORD=… node shots/f1/A/tools/record.mjs   (게이트웨이 :8700 · 실측 · 기본)
//   node shots/f1/A/tools/record.mjs                             (off = 픽스처·실파일 · 저장 결과 재생 — 판정용 아님)
// on 모드는 off 로 조용히 내려가지 않는다: 게이트웨이가 없거나 job.done 이 150 s 안에 안 오면 실패로 끝낸다(다시 찍는다).
// 편집(선적재 대신 잘라내기 · 내용은 손대지 않음): ① 부팅(about:blank → data-lx=ready) 앞부분 ② 공개 탭 새로 읽기(goto → ready)를 잘라
//   [ready-0.2 → public.goto] + [public.ready → end] 두 토막을 잇는다. 잘라낸 구간과 편집 뒤 시각은 marks.json 에 그대로 적는다.
// 산출: shots/f1/A/f1a.webm(편집본) · f1a.mp4(H.264) · raw/f1a-raw.webm(원본) · marks.json · strips/strip-*-100ms.png(12장 × 3) · logs/record.log
// 커서는 녹화 전용 오버레이(제품 코드 아님) — headless 영상에 마우스가 안 보여서 넣는다.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const OUT = 'shots/f1/A';
const BASE = 'http://localhost:4173';
const XI = BASE + '/landxi/xi/index.html';
const API = process.env.LX_API === 'on' ? 'http://localhost:8700' : null;
let session = null, queue = [];
if (API) {
  session = await (await fetch(API + '/api/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ realm: 'lx', login: 'lx-staff', password: process.env.DEV_PASSWORD }) })).json();
  if (!session.token) { console.error('[fail] 로그인 실패'); process.exit(2); }
  const jobs = await (await fetch(API + '/api/v1/jobs?limit=30', { headers: { authorization: 'Bearer ' + session.token } })).json();
  queue = (jobs.items || []).filter((j) => ['queued', 'running'].includes(j.state)).map((j) => `${j.id} ${j.tenant_id} ${j.kind} ${j.pool} p${j.priority} ${j.shards_done}/${j.shards_total}`);
  console.log(`[queue] 녹화 시작 때 게이트웨이에 진행 중 작업 ${queue.length}건`, queue);
}
const MODE = API ? 'on' : 'off';
console.log('[mode]', MODE);

fs.mkdirSync(path.join(OUT, 'raw'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'logs'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'strips'), { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-gpu', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, recordVideo: { dir: path.join(OUT, 'raw'), size: { width: 1440, height: 900 } } });
await ctx.addInitScript(([api, s]) => {
  if (!sessionStorage.getItem('rec_boot')) {
    sessionStorage.setItem('rec_boot', '1');
    if (api) { localStorage.setItem('lx_api_base', api); localStorage.removeItem('lx_api_mode'); } else localStorage.setItem('lx_api_mode', 'off');
    if (s) localStorage.setItem('lx_api_session', JSON.stringify(s)); else localStorage.removeItem('lx_api_session');
    localStorage.setItem('lx_logged_in', '1'); localStorage.setItem('lx_role', 'staff'); localStorage.removeItem('lx_tenant_session');
  }
  const mk = () => { if (document.getElementById('__cur')) return; const c = document.createElement('div'); c.id = '__cur'; c.style.cssText = 'position:fixed;left:-40px;top:-40px;width:18px;height:18px;margin:-9px 0 0 -9px;border:2px solid #fff;border-radius:50%;box-shadow:0 0 0 1px rgba(0,0,0,.6);z-index:2147483647;pointer-events:none'; document.documentElement.append(c); };
  addEventListener('mousemove', (e) => { mk(); const c = document.getElementById('__cur'); c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px'; }, true);
  addEventListener('mousedown', () => { const c = document.getElementById('__cur'); if (c) { c.style.transform = 'scale(.6)'; setTimeout(() => (c.style.transform = ''), 180); } }, true);
}, [API, session]);

const logs = [];
const page = await ctx.newPage();
const T0 = Date.now();
page.on('console', (m) => { if (m.type() === 'error') logs.push('console.error: ' + m.text().slice(0, 300)); });
page.on('pageerror', (e) => logs.push('pageerror: ' + e.message));
const marks = []; const mark = (k, extra) => { const t = (Date.now() - T0) / 1000; marks.push({ k, t, ...extra }); console.log(`[${t.toFixed(1)}s] ${k}${extra ? ' ' + JSON.stringify(extra) : ''}`); return t; };
const wait = (ms) => page.waitForTimeout(ms);
let TR = 0;   // data-lx=ready 시각(편집본 0 s 기준)
const until = async (sec) => { const w = T0 + (TR + sec) * 1000 - Date.now(); if (w > 0) await wait(w); };
const phase = (ph, ms = 40000) => page.waitForFunction((ph) => window.__xi?.PHASES?.some((x) => x.p === ph && x.t > (window.__mark || 0)), ph, { timeout: ms });
const markNow = () => page.evaluate(() => { window.__mark = performance.now(); });
const chip = () => page.evaluate(() => document.getElementById('hud-chip')?.textContent || '');
const moveTo = async (x, y, steps = 16) => page.mouse.move(x, y, { steps });
const clickAt = async (x, y, steps = 16) => { await moveTo(x, y, steps); await page.mouse.down(); await page.mouse.up(); };
const clickSel = async (sel, steps = 16) => { const b = await page.locator(sel).first().boundingBox(); await clickAt(b.x + b.width / 2, b.y + b.height / 2, steps); };
const fail = async (why) => { console.error('[fail]', why); fs.writeFileSync(path.join(OUT, 'logs', 'record-fail.json'), JSON.stringify({ why, marks, logs, queue }, null, 1)); await ctx.close(); await browser.close(); process.exit(3); };

// 0–4s 글로브(VIIRS 어제) → 한국 2400 · 4–10s 남원 하강 1600 · 10–15s 스윕 → 129,420 도착(페이지가 스스로 한다 · 칩 전환을 기록)
await page.goto(XI);
mark('goto');
const chipLog = [];
const chipTimer = setInterval(async () => { try { const c = await chip(); if (c && c !== chipLog.at(-1)?.c) chipLog.push({ t: (Date.now() - T0) / 1000, c }); } catch { /* */ } }, 100);
await page.waitForFunction(() => document.documentElement.dataset.lx === 'ready', null, { timeout: 45000 }); TR = mark('ready');
if (MODE === 'on' && (await page.evaluate(() => document.documentElement.dataset.mode)) !== 'on') await fail('게이트웨이 probe 실패 — 화면이 off 로 떴다');
await page.mouse.move(900, 500);
await page.waitForFunction(() => window.__xi?.PHASES?.some((x) => x.p === 'sweep'), null, { timeout: 45000 }); mark('sweep');
await phase('arrived', 45000); mark('city.arrived', { big: await page.evaluate(() => document.getElementById('hud-big').textContent), basis: await page.evaluate(() => document.getElementById('hud-big').dataset.basis) });
clearInterval(chipTimer);
await until(11.0);

// 15–19s 운봉읍 클릭 → 집계 카드(목적지를 이름으로 단 버튼 '덕과면 드론 AOI로 이동 ›') → 드론 AOI 1250 하강 25cm → 2m → 1cm
const pt = await page.evaluate(() => window.__xi.emdPoint('운봉읍', [640, 450, 1140, 770]));
await markNow(); await clickAt(pt[0], pt[1], 20); mark('emd.click', { emd: '운봉읍' });
await page.waitForFunction(() => !document.getElementById('emd-card').hidden, null, { timeout: 8000 }).catch(() => {});
await wait(1300);
const btnText = await page.evaluate(() => document.querySelector('#emd-card .xi-aoi')?.textContent);
await markNow(); await clickSel('#emd-card .xi-aoi', 14); mark('aoi.descend', { button: btnText });
await phase('arrived', 30000); mark('aoi.arrived', { big: await page.evaluate(() => document.getElementById('hud-big').textContent), title: await page.evaluate(() => document.getElementById('hud-title').textContent), chip: await chip() });

// 19–24s 필지 클릭 → 락온 380 → 유리 카드(PNU · 지목 · 공시지가 · 4시점 크롭)
const pp = await page.evaluate(async () => { const X = window.__xi; const fa = await X.loadA02(); const id = X.state.aoiParcels[0]; const f = fa.features.find((x) => x.properties.id === id); const g = f.geometry.type === 'Polygon' ? f.geometry.coordinates[0] : f.geometry.coordinates[0][0]; let x = 0, y = 0; g.forEach((c) => { x += c[0]; y += c[1]; }); const q = X.A.project([x / g.length, y / g.length]); return [q.x, q.y]; });
await clickAt(pp[0], pp[1], 18); mark('parcel.click');
await page.waitForFunction(() => document.getElementById('parcel-card').dataset.ready === '1', null, { timeout: 15000 }).catch(() => {});
mark('parcel.card', { crops: await page.evaluate(() => document.getElementById('parcel-card').dataset.crops) });
await wait(1800);
await clickSel('#parcel-card .xi-close', 10);

// 24–32s 사각 프레임 → 견적 → 실행 → shard 격자 점등 · 칸마다 도착 · HUD(job.progress) → job.done → snapshot.ready 교체
await clickSel('#tool-rect', 14);
const fr = await page.evaluate(() => { const X = window.__xi, A = X.CAMS.A01; const a = X.A.project([A[0] + 0.0012, A[3] - 0.0012]), b = X.A.project([A[2] - 0.0012, A[1] + 0.0016]); return [a.x, a.y, b.x, b.y]; });
await moveTo(fr[0], fr[1], 12); await page.mouse.down(); await page.mouse.move((fr[0] + fr[2]) / 2, (fr[1] + fr[3]) / 2, { steps: 10 }); await page.mouse.move(fr[2], fr[3], { steps: 10 }); await page.mouse.up(); mark('frame.drawn');
await page.waitForSelector('#quote-card .xi-run', { timeout: 15000 }); mark('quote', { q: await page.evaluate(() => document.getElementById('quote-card').textContent.replace(/\s+/g, ' ').slice(0, 240)) });
await wait(1200);
await markNow(); await clickSel('#quote-card .xi-run', 12); const tRun = mark('run');
await phase('job-started', 60000).catch(() => {}); mark('job.started');
const jobLine = () => page.evaluate(() => document.getElementById('hud-job').textContent);
const progress = [];
const progTimer = setInterval(async () => { try { const j = await jobLine(); if (j && j !== progress.at(-1)?.j) progress.push({ t: +((Date.now() - T0) / 1000).toFixed(2), j }); } catch { /* */ } }, 150);
const okDone = await phase('job-done', 150000).then(() => true).catch(() => false);
if (!okDone) { clearInterval(progTimer); await fail('job.done 이 150 s 안에 오지 않음(게이트웨이 큐)'); }
mark('job.done', { shown: await page.evaluate(() => window.__xi.theater.S.shown), job: await jobLine(), big: await page.evaluate(() => document.getElementById('hud-big').textContent), live: await page.evaluate(() => document.getElementById('hud-job').dataset.live), id: await page.evaluate(() => window.__xi.state.job) });
await phase('snapshot', 60000).catch(() => {}); mark('snapshot', { set: await page.evaluate(() => document.documentElement.dataset.snapshot) });
clearInterval(progTimer);
await wait(800);

// 32–38s 스크러버 재생 6s(정수 시점 정지 750 · 변화 히스토그램)
await clickSel('#scrub .xi-play', 14); mark('scrub.play');
await page.waitForFunction(() => document.getElementById('scrub').dataset.playing !== '1', null, { timeout: 12000 }).catch(() => {});
mark('scrub.end', { stops: await page.evaluate(() => window.__xi.scrub?.S?.stops) });

// 38–42s 스와이프 20 → 80 %
await clickSel('#tool-swipe', 12); await wait(600); mark('swipe.open');
const g = await page.locator('#grip').boundingBox();
await moveTo(g.x + 20, g.y + 20, 10); await page.mouse.down();
await page.mouse.move(1440 * 0.2, g.y + 20, { steps: 36 }); await wait(250); await page.mouse.move(1440 * 0.8, g.y + 20, { steps: 100 }); await page.mouse.up(); mark('swipe.20to80');
await wait(700);

// 42–45s ?public=1 — 같은 카메라 · 공개 빌드(영상 = V-World 위성만) · 결과 벡터 도착 · 마스트 '공개 · 위성 + AI 결과'
const cam = new URL(page.url()).searchParams.get('cam');
const own = [];
page.on('request', (r) => { if (/\/landxi\/data\/tiles|namwon_ap25|namwon_25\d\d|namwon_city|:8700\/tiles\/pmtiles\/imagery/.test(r.url())) own.push(r.url()); });
const tPub = mark('public.goto', { cam });
await page.goto(XI + '?public=1' + (cam ? '&cam=' + cam : ''));
await page.waitForFunction(() => document.documentElement.dataset.lx === 'ready', null, { timeout: 45000 }); mark('public.ready');
// 편집 종점 = 캔버스가 열린 시각(첫 idle · 타일 수신 뒤 500 페이드 시작) + 0.2 s — 흰 캔버스 · '부팅' HUD 프레임 0(2차 판정)
await page.waitForFunction(() => document.documentElement.dataset.canvas === 'open', null, { timeout: 45000 }); const tPubReady = mark('public.canvas') + 0.2;
await page.waitForFunction(() => window.__xi?.PHASES?.some((x) => x.p === 'arrived'), null, { timeout: 45000 }).catch(() => {});
mark('public.arrived', { mast: await page.evaluate(() => document.getElementById('mast-mode').textContent), big: await page.evaluate(() => document.getElementById('hud-big').textContent), basis: await page.evaluate(() => document.getElementById('hud-big').dataset.basis), ownImageryRequests: own.length, exportDisabled: await page.evaluate(() => document.documentElement.dataset.build === 'public') });
await wait(1800);
const tEnd = mark('end');

await page.close();
const vid = await page.video().path();
await ctx.close(); await browser.close();
const RAW = path.join(OUT, 'raw', 'f1a-raw.webm');
fs.copyFileSync(vid, RAW);

// ── 편집: [ready-0.2 → public.goto] + [public.ready → end] ──
// 공개 탭 이음매: 녹화 시계와 Date.now 는 0.3–0.4 s 어긋난다 — 원본 영상에서 새 탭의 흰 구간(캔버스 닫힘)을 밝기로 찾아
// 그 직전에서 끊고, 캔버스가 열려(500 페이드) 밝기가 영상 수준으로 내려온 첫 프레임에서 잇는다(흰 캔버스 · '부팅' HUD 프레임 0).
function whiteSpan(from, to) {
  const out = execFileSync('ffmpeg', ['-loglevel', 'error', '-ss', from.toFixed(2), '-t', (to - from).toFixed(2), '-i', RAW, '-vf', 'fps=20,crop=600:400:300:300,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-', '-f', 'null', '-']).toString();
  const ys = [...out.matchAll(/pts_time:([\d.]+)[\s\S]*?YAVG=([\d.]+)/g)].map((m) => [from + +m[1], +m[2]]);
  const w0 = ys.findIndex(([, y]) => y > 225); if (w0 < 0) return null;
  let w1 = w0; while (w1 < ys.length && ys[w1][1] > 160) w1++;
  return w1 < ys.length ? { white: ys[w0][0], open: ys[w1][0] } : null;
}
const ws = whiteSpan(tPub - 1.0, tPubReady + 1.5);
const s1 = Math.max(0, TR - 0.2), e1 = ws ? ws.white - 0.05 : tPub, s2 = ws ? ws.open : tPubReady, e2 = tEnd;
console.log('[seam]', JSON.stringify(ws));
const edit = (t) => (t <= e1 ? t - s1 : t >= s2 ? e1 - s1 + (t - s2) : null);
const fc = `[0:v]trim=${s1.toFixed(3)}:${e1.toFixed(3)},setpts=PTS-STARTPTS[a];[0:v]trim=${s2.toFixed(3)}:${e2.toFixed(3)},setpts=PTS-STARTPTS[b];[a][b]concat=n=2:v=1[v]`;
execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', RAW, '-filter_complex', fc, '-map', '[v]', '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '30', '-deadline', 'good', '-cpu-used', '4', '-row-mt', '1', path.join(OUT, 'f1a.webm')]);
execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', path.join(OUT, 'f1a.webm'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'medium', '-movflags', '+faststart', path.join(OUT, 'f1a.mp4')]);
const dur = parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path.join(OUT, 'f1a.mp4')]).toString());
const em = marks.map((m) => ({ ...m, te: edit(m.t) == null ? null : +edit(m.t).toFixed(2) }));
// 100 ms 스트립 12장 × 3(스윕 · 드론 AOI 하강 · 작업 극장)
const at = (k) => em.find((m) => m.k === k)?.te;
// descent = 글로브→남원 하강의 HLS → V-World 구간(첫 HLS 칩 −0.2 s부터 1.2 s) · aoi = 드론 AOI 하강 · theater = 워커 배정부터
const chipAt = (re) => chipLog.find((c) => re.test(c.c));
const hlsT = chipAt(/HLS/) ? edit(chipAt(/HLS/).t) : null;
const strips = { arrive: at('sweep') - 0.1, descent: hlsT != null ? Math.max(0, hlsT - 0.2) : null, 'descent-vworld': chipAt(/V-World/) ? edit(chipAt(/V-World/).t) - 0.6 : null, aoi: at('aoi.descend') + 0.1, theater: (() => { const m = em.find((x) => x.k === 'job.done'); const sh = m?.shown || []; return sh.length ? m.te - (sh.at(-1)[2] - sh[0][2]) / 1000 - 0.1 : at('job.started') - 0.1; })() };   // 첫 칸 켜짐 −0.1 s
for (const [n, t] of Object.entries(strips)) if (t != null) execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-ss', t.toFixed(2), '-i', path.join(OUT, 'f1a.mp4'), '-vf', 'fps=10,scale=480:-1,tile=6x2', '-frames:v', '1', path.join(OUT, 'strips', `strip-${n}-100ms.png`)]);
const chipsE = chipLog.map((c) => ({ ...c, te: edit(c.t) == null ? null : +edit(c.t).toFixed(2) }));
fs.writeFileSync(path.join(OUT, 'marks.json'), JSON.stringify({ mode: MODE, queueAtStart: queue, duration_s: +dur.toFixed(2), edit: { cut: [[0, +s1.toFixed(2), '부팅(about:blank → ready-0.2)'], [+e1.toFixed(2), +s2.toFixed(2), '공개 탭 새로 읽기(원본 밝기로 판정: 흰 캔버스 시작 −0.05 s → 캔버스 열림 · 녹화 시계는 mark 시계보다 0.3–0.4 s 이르다)']], raw: 'raw/f1a-raw.webm' }, marks: em, chips: chipsE, progress: progress.map((p) => ({ ...p, te: edit(p.t) == null ? null : +edit(p.t).toFixed(2) })), strips, errors: logs }, null, 1));
fs.writeFileSync(path.join(OUT, 'logs', 'record.log'), [`mode ${MODE} · duration ${dur.toFixed(1)}s`, ...queue.map((q) => 'queue ' + q), ...em.map((m) => `${m.te ?? '—'}\t${m.t.toFixed(2)}\t${m.k}\t${JSON.stringify(Object.fromEntries(Object.entries(m).filter(([k]) => !['k', 't', 'te'].includes(k))))}`), ...progress.map((p) => `job\t${p.t}\t${p.j}`), ...logs].join('\n'));
console.log('[chips]', chipsE.map((c) => `${c.te} ${c.c}`).join(' | '));
console.log('[duration]', dur.toFixed(1), 's · errors', logs.length);
// 제출 영상 자체의 먹색 프레임 측정(20 fps · max(RGB) < 24 픽셀 비율) — diag-descent.mjs 가 이 파일을 입력으로 받는다
execFileSync('node', ['shots/f1/A/tools/diag-descent.mjs', path.join(OUT, 'f1a.webm'), path.join(OUT, 'marks.json')], { stdio: 'inherit' });
