/* 소개 영상 3판(원칙 297 · 10-18 2판 피드백) 실제 화면 녹화 — 바깥 주소 · 로그인 폼 · 화면 배율 1 · 커서 점 없음.
   node capture-v3.mjs [lx|dash|sales|nw|train|map|chat] [장면이름,...]   → <OUT3>/raw/<장면>.mp4 + .marks.json, <OUT3>/raw/capture-log.json
   2판에서 바뀐 장면만 새로 찍는다(프로젝트 목록 · 학습데이터 구축 · 업무별 모델 · 해외는 2판 원본을 그대로 씀 — edit-v3 가 2판 raw 에서 읽음).
   2판 피드백: ① 전국 지도 차오름은 끝까지(반만 X) ② 직원 대시보드 아래 잘림 X(더 큰 창으로 찍어 1920×1080 으로 줄임) ③ 영업 → '활용 사례'(사례 칸 통째로)
   ④ 영농관리 결과를 지도에서 + 드론 촬영 요청(보내지 않음) ⑥ 학습 = 블록 끌어 놓고 잇기 → 학습 시작(제출은 가로채 가짜 성공 · GPU 0)
   ⑦ 지도 서비스 = 남원 비닐하우스 대신 깔끔한 결과 층 ⑧ XI ChatGEO(LLM) 한 흐름: 물음 → 지도 분석 → 통계 → 보고서.
   저장하는 동작은 하지 않는다(쓰기 요청은 lib 이 가짜 성공으로 막음 · 견적은 읽기 전용이라 통과). */
import fs from 'node:fs';
import path from 'node:path';
import { chromium, frontDoor, newCtx, Rec, sleep, place, glide, tap, typeIn, noLoading } from './lib.mjs';

export const OUT3 = process.env.LX_VIDEO_OUT3 || 'E:/Land-XI 플랫폼/02. 데이터/_video/intro-2026-10-18-v3';
const RAW = path.join(OUT3, 'raw'); fs.mkdirSync(RAW, { recursive: true });
const FR = path.join(process.env.TEMP || OUT3, 'lx-video-frames-v3');
const WHO = process.argv[2] || 'lx';
const ONLY = (process.argv[3] || '').split(',').filter(Boolean);
const want = (n) => !ONLY.length || ONLY.includes(n);
const LOGF = path.join(RAW, 'capture-log.json');
const LOG = fs.existsSync(LOGF) ? JSON.parse(fs.readFileSync(LOGF, 'utf8')) : {};
const blocked = [];
const save = () => fs.writeFileSync(LOGF, JSON.stringify(LOG, null, 1));

const APP = 'https://app.land-xi.dev', NW = 'https://namwon.land-xi.dev', V = '/landxi/v3/';
const PRJ_NAME = process.env.LX_VIDEO_PRJ || '비닐하우스 2026';      // 학습 판을 보여 줄 프로젝트(학습 이력 · 그래프가 있는 것)
const MAP_LAYER = process.env.LX_VIDEO_LAYER || '건축물 분석서비스 원주시';   // 지도 서비스에서 켤 결과 층(10-18 사용자: 남원 비닐하우스 말고)
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const big = WHO === 'dash' ? { vw: 2134, vh: 1200 } : {};   // 직원 대시보드는 더 큰 창(아래 '열기'까지 한 화면) → 녹화는 1920×1080 으로 줄여 담김
const { ctx, p } = await newCtx(browser, blocked, big);
const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));

async function scene(name, fn) {
  if (!want(name)) return;
  const r = new Rec(p, path.join(FR, name));
  const t = Date.now();
  try {
    await fn(r);
    const out = path.join(RAW, name + '.mp4');
    const s = await r.stop(out);
    LOG[name] = { at: new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }), url: p.url().replace(/[?#].*$/, ''), ...s, marks: r.marks || {}, extra: r.extra, wallS: Math.round((Date.now() - t) / 1000) };
    console.log('녹화', name, JSON.stringify(LOG[name]));
  } catch (e) { try { await r.stop(path.join(RAW, name + '-fail.mp4')); } catch {} LOG['FAILED:' + name] = String(e).slice(0, 300); console.log('실패', name, String(e).slice(0, 300)); }
  save();
}
/** 창(또는 안쪽 칸) 부드럽게 옮기기 — rAF · ease-in-out · ms 동안. sel 없으면 창 */
const scrollTo = (y, ms, sel = null) => p.evaluate(([y, ms, sel]) => new Promise((done) => {
  const el = sel ? document.querySelector(sel) : null;
  const get = () => (el ? el.scrollTop : scrollY), set = (v) => (el ? (el.scrollTop = v) : scrollTo(0, v));
  if (el) el.style.scrollBehavior = 'auto'; document.documentElement.style.scrollBehavior = 'auto';
  const y0 = get(), t0 = performance.now();
  const f = (now) => { const t = Math.min(1, (now - t0) / ms), e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; set(y0 + (y - y0) * e); if (t < 1) requestAnimationFrame(f); else done(); };
  requestAnimationFrame(f);
}), [y, ms, sel]);
const xiReady = async () => { await p.waitForFunction(() => !!window.__xc?.map && !!document.querySelector('.k-ck-i'), null, { timeout: 90000 }).catch(() => {}); await noLoading(p); await sleep(2500); };

/* ── 1 메인 — 지구(모토) → 전국 지도 · 남에서 북으로 끝까지 차오른 뒤 머문다 ── */
if (WHO === 'lx') {
  await p.goto(APP + V + 'main/', { waitUntil: 'domcontentloaded' }); await sleep(5000);
  const top0 = await p.evaluate(() => document.querySelector('#trackA').getBoundingClientRect().top + scrollY);
  await scrollTo(top0 + innerH() * 6, 4000).catch(() => {}); await sleep(3000);   // 데우기(타일)
  await scene('m1-main', async (r) => {
    await p.goto(APP + V + 'main/', { waitUntil: 'domcontentloaded' }); await sleep(5500);
    await place(p, 1900, 900);
    const H = await p.evaluate(() => innerHeight);
    const top = await p.evaluate(() => document.querySelector('#trackA').getBoundingClientRect().top + scrollY);
    // 트랙 A 단위(화면 높이) — a1 = 2.5(전국 지도 시작) · 차오름 s1 0.72 = 5.38 에서 다 참 · 선은 0.74 에서 사라짐 · a2 = 6.5(필지로 파고듦) 전에 멈춘다
    await r.start(); r.mark('start'); await sleep(4200);
    r.mark('scroll'); await scrollTo(top + H * 2.55, 2600);
    r.mark('full'); await sleep(400);
    await scrollTo(top + H * 5.7, 5200);
    r.mark('filled'); await sleep(3500);
    r.extra = await p.evaluate(() => ({ sweepLine: !!window.__main?.S?.sweepAt }));
    r.mark('end');
  });
}
function innerH() { return 1080; }

/* ── 2 로그인 → LX 직원 대시보드(2134×1200 창 — 아래 '열기' 단추까지 잘림 없이) ── */
if (WHO === 'dash') {
  await p.goto(APP + V + 'login/', { waitUntil: 'domcontentloaded' }); await sleep(3000);   // 데우기(로그인 화면)
  await scene('m2-dash', async (r) => {
    await p.goto(APP + V + 'login/', { waitUntil: 'domcontentloaded' }); await sleep(3500);
    await place(p, 1400, 800);
    await r.start(); r.mark('start'); await sleep(700);
    const idIn = p.locator('input[name=login], input[autocomplete=username], input[type=text]').first();
    await typeIn(p, idIn, 'test@lx.or.kr', 55);
    const pw = p.locator('input[type=password]').first();
    await tap(p, pw, 300); await pw.fill(process.env.LX_PW);
    const vw = await p.evaluate(() => innerWidth), k = 1920 / vw;
    const b = await pw.boundingBox();
    r.extra = { pwBox1920: [Math.floor(b.x * k) - 4, Math.floor(b.y * k) - 4, Math.ceil(b.width * k) + 8, Math.ceil(b.height * k) + 8], vw };
    r.mark('go');
    await tap(p, p.locator('button', { hasText: /^로그인$/ }).first(), 300);
    await p.waitForURL(/lx-console/, { timeout: 60000 });
    await p.waitForFunction(() => document.documentElement.dataset.consoleReady === '1', null, { timeout: 60000 }).catch(() => {});
    await noLoading(p, 20000); r.mark('dash');
    await place(p, vw - 10, 700); await sleep(7500);
    r.extra.fits = await p.evaluate(() => { const e = document.querySelector('.ld'); return e ? e.scrollHeight <= e.clientHeight + 2 : null; });
    r.mark('end');
  });
}

/* ── 영업 — 활용 사례(목록 + 결과 지도 · 사례 칸 통째로 한 화면) ── */
if (WHO === 'sales') {
  await frontDoor(p, APP, 'sales@lx.or.kr'); await sleep(2500);
  const open = async () => { await p.goto(APP + V + 'sales/', { waitUntil: 'domcontentloaded' }); await p.waitForFunction(() => document.body.dataset.state === 'ready', null, { timeout: 60000 }).catch(() => {}); await noLoading(p); };
  const casesY = () => p.evaluate(() => { const sc = document.querySelector('.sl-scroll'), h = document.querySelector('#cases .sl-head'); return h.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop - 110; });
  const settle = () => p.waitForFunction(() => document.querySelectorAll('#grid > *').length > 0 && document.querySelectorAll('#caseList .sl-item').length > 0, null, { timeout: 30000 }).catch(() => {});
  await open(); await settle(); await sleep(3000); await scrollTo(await casesY(), 800, '.sl-scroll'); await sleep(2000); await scrollTo(await casesY(), 300, '.sl-scroll'); await sleep(9000);   // 데우기(사례 지도 타일)
  // 사례 목록 · 첫 사례 지도는 늦게 찬다 — 미리 다 받아 두고(첫 사례에 머물게 눌러 둠) 맨 위로 올린 뒤 녹화
  await open(); await settle(); await sleep(2000);
  await scrollTo(await casesY(), 600, '.sl-scroll'); await sleep(1500); await scrollTo(await casesY(), 300, '.sl-scroll');
  await p.waitForFunction(() => window.__sales?.caseArrived && document.querySelectorAll('#caseList .sl-item').length > 1, null, { timeout: 120000 }).catch(() => {});
  await p.locator('#caseList .sl-item-h').nth(0).click(); await sleep(6000);
  await scrollTo(0, 10, '.sl-scroll'); await sleep(2500);
  await scene('s1-sales', async (r) => {
    await place(p, 1900, 900);
    await r.start(); r.mark('start'); await sleep(2200);
    r.mark('scroll'); await scrollTo(await casesY(), 1800, '.sl-scroll');
    for (let k = 0; k < 3; k++) { await sleep(300); const y = await casesY(), now = await p.evaluate(() => document.querySelector('.sl-scroll').scrollTop); if (Math.abs(y - now) > 4) await scrollTo(y, 500, '.sl-scroll'); }
    r.mark('cases'); await sleep(5000);
    await p.locator('#caseList .sl-item-h').nth(1).click(); r.mark('pick2');
    await p.waitForFunction(() => window.__sales?.caseArrived === window.__sales?.caseNow, null, { timeout: 30000 }).catch(() => {});
    await sleep(600); r.mark('arrived2'); await sleep(4500);
    r.extra = await p.evaluate(() => { const c = document.querySelector('#cases').getBoundingClientRect(); const m = document.querySelector('#caseMap').getBoundingClientRect(); return { cases: [Math.round(c.top), Math.round(c.bottom)], map: [Math.round(m.top), Math.round(m.bottom)], h: innerHeight, items: document.querySelectorAll('#caseList .sl-item').length }; });
    r.mark('end');
  });
}

/* ── 지자체(남원시 · 기관 주소) — 내 서비스 → 영농관리(경작·휴경) 현황 → 결과 지도(지도 위 결과) · 드론 촬영 요청(보내지 않음) ── */
if (WHO === 'nw') {
  await frontDoor(p, NW, 'lxadmin@lx.or.kr#namwon'); await sleep(3000);
  for (const u of ['gov-select/', 'gov-select/?service=card-farm', 'xi-clean/?region=52190&service=card-farm', 'gov-request/?tab=shoot']) {
    await p.goto(NW + V + u, { waitUntil: 'domcontentloaded' }); await noLoading(p); await sleep(u.startsWith('xi') ? 12000 : 4000);
  }
  await scene('n1-nw', async (r) => {
    await p.goto(NW + V + 'gov-select/', { waitUntil: 'domcontentloaded' }); await noLoading(p); await sleep(2500);
    await place(p, 1900, 300);
    await r.start(); r.mark('start'); await sleep(4500);
    await tap(p, p.locator('a', { hasText: '이 서비스 열기' }).nth(1), 300); r.mark('svc');
    await noLoading(p); await place(p, 1900, 300); await sleep(4500);
    r.mark('tomap');
    await tap(p, p.locator('a.gs-tab', { hasText: '결과 지도' }).first(), 300);
    await p.waitForFunction(() => !!window.__xc?.map, null, { timeout: 90000 }).catch(() => {});
    await noLoading(p); r.mark('map');
    await sleep(5000); r.mark('mapfull');
    // 결과가 가장 모인 곳으로 가까이(휠 — 지도 엔진이 그대로 받는 사람 동작)
    const pt = await p.evaluate(() => {
      const m = window.__xc.map, fs = m.queryRenderedFeatures().filter((f) => f.geometry && /Polygon/.test(f.geometry.type) && !/sgg|emd|bound|admin|region|world|base/i.test(f.source + f.layer.id));
      const g = new Map(); for (const f of fs) { let c = f.geometry.coordinates; while (Array.isArray(c[0])) c = c[0]; const q = m.project(c); if (q.x < 520 || q.x > 1600 || q.y < 200 || q.y > 820) continue; const k = Math.round(q.x / 90) + ',' + Math.round(q.y / 90); g.set(k, (g.get(k) || 0) + 1); }
      const best = [...g.entries()].sort((a, b) => b[1] - a[1])[0]; if (!best) return [1000, 560]; const [x, y] = best[0].split(',').map(Number); return [x * 90, y * 90];
    });
    await place(p, pt[0], pt[1]);
    for (let i = 0; i < 3; i++) { for (let s = 0; s < 30; s++) { await p.mouse.wheel(0, -14); await sleep(16); } await sleep(500); }
    await noLoading(p, 20000); r.mark('zoomed'); await place(p, 1900, 640); await sleep(5000);
    r.extra = { zoom: await p.evaluate(() => window.__xc.map.getZoom()), at: pt };
    r.mark('end');
  });
  await scene('n2-req', async (r) => {
    await p.goto(NW + V + 'gov-request/?tab=shoot', { waitUntil: 'domcontentloaded' }); await noLoading(p); await sleep(4500);
    await place(p, 1900, 400);
    await r.start(); r.mark('start'); await sleep(2500);
    await tap(p, p.locator('.sq-draw').first(), 250); r.mark('draw');
    const mb = await p.locator('#shoot .gq-map').first().boundingBox();
    const a = [mb.x + mb.width * 0.5, mb.y + mb.height * 0.42], b = [mb.x + mb.width * 0.58, mb.y + mb.height * 0.54];
    await place(p, a[0], a[1]); await p.mouse.down();
    await glide(p, b[0], b[1], 1400); await p.mouse.up(); r.mark('drawn');
    await p.waitForFunction(() => /원/.test(document.querySelector('.sq-fee')?.textContent || '') && !/셈하는 중/.test(document.querySelector('.sq-fee').textContent), null, { timeout: 30000 }).catch(() => {});
    await place(p, 1900, 400); await sleep(2500);
    await p.locator('select[aria-label="찍은 뒤 바로 분석"]').selectOption({ label: '경작·휴경 분석서비스' }).catch(() => {}); r.mark('svc');
    await sleep(600);
    const y = await p.evaluate(() => { const sc = document.querySelector('.gq-scroll'), s3 = [...document.querySelectorAll('#shoot .gq-stp[data-s="3"]')].pop(); return s3.getBoundingClientRect().bottom - sc.getBoundingClientRect().bottom + sc.scrollTop + 28; });
    await scrollTo(y, 2200, '.gq-scroll'); r.mark('scrolled'); await sleep(5000);
    r.extra = await p.evaluate(() => ({ fee: document.querySelector('.sq-fee')?.innerText?.slice(0, 120), go: (() => { const b = document.querySelector('#shoot .gq-go'); const r = b?.getBoundingClientRect(); return r ? [Math.round(r.top), Math.round(r.bottom), b.disabled] : null; })() }));
    r.mark('end');
  });
}

/* ── 학습 — 블록 끌어 놓기 → 끌어 잇기 → 학습 시작(제출은 가로채 가짜 성공 · 실제 학습 · GPU 0) → 대기열 → 학습 중 ── */
if (WHO === 'train') {
  const FAKE = 'job_VIDEO000000000000000000';
  // 견적 — 실제 값을 받되 '지금 넣을 수 있음'으로(전력 규칙 등으로 막혀도 화면 흐름만 보이게 · 제출은 어차피 가로챔)
  await p.route(/\/api\/v1\/jobs\/quote(\?|$)/, async (rt) => { const res = await rt.fetch(); let j = {}; try { j = await res.json(); } catch {} LOG.trainQuote = { allowed: j.allowed, reasons: j.reasons || null }; await rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...j, allowed: true }) }); });
  await p.route(/\/api\/v1\/jobs(\?|$)/, async (rt) => {
    if (rt.request().method() !== 'POST') return rt.continue();
    blocked.push('가로챔 POST /jobs(학습 시작 — 서버로 보내지 않음)');
    await rt.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ job: { id: FAKE, state: 'queued' }, events_url: `/api/v1/events/jobs/${FAKE}` }) });
  });
  // 사건 흐름 — 대기 모습을 먼저 보이고 '시작됨' 하나만(지어낸 정확도 값 없음)
  await p.route(new RegExp(`/events/jobs/${FAKE}`), async (rt) => { await new Promise((k) => setTimeout(k, 4200)); await rt.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' }, body: 'event: job.started\nid: 1\ndata: {}\n\n' }); });
  await p.route(new RegExp(`/jobs/${FAKE}`), (rt) => rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: FAKE, state: 'running' }) }));
  await frontDoor(p, APP, 'test@lx.or.kr'); await sleep(2500);
  const href = await p.evaluate(async (nm) => { const { api } = await import('/landxi/shared/api-v1.js'); const it = (await api('/projects?scope=all')).items || []; const x = it.find((q) => (q.name || '') === nm) || it.find((q) => /비닐하우스/.test(q.name || '')); return x ? `/landxi/v3/lx-train/?project=${encodeURIComponent(x.id)}&stage=train` : null; }, PRJ_NAME);
  if (!href) throw new Error('프로젝트 못 찾음');
  const open = async () => { await p.goto(APP + href, { waitUntil: 'domcontentloaded' }); await p.locator('.tb-board h1').waitFor({ timeout: 60000 }); await noLoading(p); await sleep(2500); };
  await open();
  const reset = p.locator('button', { hasText: '기본 흐름으로 되돌리기' }); if (await reset.count()) { await reset.first().click().catch(() => {}); await sleep(800); }
  const center = async (loc) => { const b = await loc.boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; };
  const node = (kind, i = 0) => p.locator(`.tb-node[data-kind="${kind}"]`).nth(i);
  const drag = async (from, to, dur = 1100) => { await place(p, from[0], from[1]); await p.mouse.down(); await glide(p, from[0] + 8, from[1] + 4, 80); await glide(p, to[0], to[1], dur); await sleep(160); await p.mouse.up(); await sleep(350); };
  await scene('p3-train', async (r) => {
    await open();
    await p.evaluate(() => document.querySelector('.tb-board')?.scrollIntoView({ block: 'start' }));
    await place(p, 1900, 640);
    await r.start(); r.mark('start'); await sleep(2200);
    // 빈 자리 — 판 오른쪽 아래(기존 블록과 겹치지 않는 곳)
    const spot = await p.evaluate(() => {
      const cv = document.querySelector('.tb-cv').getBoundingClientRect(), nodes = [...document.querySelectorAll('.tb-node')].map((n) => n.getBoundingClientRect());
      for (const fy of [0.7, 0.55, 0.85]) for (const fx of [0.62, 0.72, 0.52, 0.82]) { const x = cv.left + cv.width * fx, y = cv.top + cv.height * fy; if (!nodes.some((b) => x > b.left - 120 && x < b.right + 120 && y > b.top - 60 && y < b.bottom + 60)) return [x, y]; }
      return [cv.left + cv.width * 0.7, cv.top + cv.height * 0.75];
    });
    r.mark('chip'); await drag(await center(p.locator('.tb-chip[data-k="train"]')), spot, 1500);
    await p.keyboard.press('Escape'); await sleep(500);
    const t2 = node('train', 1);
    r.mark('wire');
    for (const k of ['data', 'base', 'cfg']) { await drag(await center(node(k).locator('.tb-port:not(.in)')), await center(t2), 1000); await sleep(250); }
    r.mark('ready'); await place(p, 1900, 640); await sleep(1800);
    await tap(p, t2.locator('.tb-run'), 300); r.mark('confirm');
    await p.locator('.tb-md').waitFor({ timeout: 15000 }); await sleep(1800);
    await tap(p, p.locator('.tb-md-act .t-btn:not(.t-btn--text)'), 300); r.mark('queued');
    await place(p, 1900, 640); await sleep(4000);
    await p.waitForFunction(() => /학습 중/.test(document.querySelectorAll('.tb-node[data-kind="train"]')[1]?.textContent || ''), null, { timeout: 15000 }).catch(() => {});
    r.mark('running'); await sleep(3500);
    r.extra = { block: (await t2.textContent()).replace(/\s+/g, ' ').trim().slice(0, 80), wires: await p.locator('.tb-wires:not(.tb-drag) g').count() };
    r.mark('end');
  });
}

/* ── 지도 서비스 — 결과 층 하나 켜기 → 가까이 → 도형 누르기(분류 · 면적 · 필지 정보) ── */
if (WHO === 'map') {
  await frontDoor(p, APP, 'test@lx.or.kr'); await sleep(2000);
  const open = async () => { await p.goto(APP + V + 'lx-map/', { waitUntil: 'domcontentloaded' }); await noLoading(p); await p.waitForFunction(() => !!window.__lm?.map, null, { timeout: 60000 }).catch(() => {}); await sleep(4500); };
  const offAll = async () => { for (const s of await p.locator('button.lm-sw[aria-checked="true"]').all()) { await s.click().catch(() => {}); await sleep(300); } };
  const grp = MAP_LAYER.split(' ')[0] + ' 분석서비스';
  // 데우기 — 켜서 범위 타일 받아 두고 끈다
  await open(); await offAll(); await p.locator('text=' + grp).first().click(); await sleep(600); await p.locator(`button.lm-sw[aria-label^="${MAP_LAYER}"]`).first().click(); await sleep(9000); await offAll(); await sleep(1500);
  await scene('q1-map', async (r) => {
    await open(); await offAll(); await sleep(1500);
    await p.locator('text=' + grp).first().click(); await sleep(1200);
    await place(p, 1900, 640);
    await r.start(); r.mark('start'); await sleep(1800); r.mark('grp');
    await tap(p, p.locator(`button.lm-sw[aria-label^="${MAP_LAYER}"]`).first(), 250); r.mark('on');
    await place(p, 1900, 640); await sleep(3500); await noLoading(p, 30000); await sleep(1500); r.mark('fit');
    const pt = await p.evaluate(() => {
      const m = window.__lm.map, fs = m.queryRenderedFeatures().filter((f) => /^lm-r-.*-fill$/.test(f.layer.id));
      const g = new Map(); for (const f of fs) { let c = f.geometry.coordinates; while (Array.isArray(c[0])) c = c[0]; const q = m.project(c); if (q.x < 560 || q.x > 1450 || q.y < 180 || q.y > 900) continue; const k = Math.round(q.x / 70) + ',' + Math.round(q.y / 70); g.set(k, (g.get(k) || 0) + 1); }
      const best = [...g.entries()].sort((a, b) => b[1] - a[1])[0]; if (!best) return null; const [x, y] = best[0].split(',').map(Number); return [x * 70, y * 70];
    });
    if (pt) { await place(p, pt[0], pt[1]); for (let i = 0; i < 1; i++) { for (let s = 0; s < 44; s++) { await p.mouse.wheel(0, -12); await sleep(16); } await sleep(450); } }
    await sleep(2500); await noLoading(p, 20000); r.mark('zoomed');
    // 화면 가운데 가까운 결과 도형 누르기 — 속성 칸이 열릴 때까지 가까운 차례로(최대 8)
    const cands = await p.evaluate(() => {
      const m = window.__lm.map, c = m.getCanvas().getBoundingClientRect(), fs = m.queryRenderedFeatures().filter((f) => /^lm-r-.*-fill$/.test(f.layer.id));
      const cx = c.left + c.width / 2, cy = c.top + c.height / 2, out = [];
      for (const f of fs) { let q = f.geometry.coordinates; while (Array.isArray(q[0][0])) q = q[0]; const xs = q.map((v) => m.project(v)); const x = c.left + xs.reduce((a, v) => a + v.x, 0) / xs.length, y = c.top + xs.reduce((a, v) => a + v.y, 0) / xs.length; out.push({ x, y, d: Math.hypot(x - cx, y - cy) }); }
      return out.sort((a, b) => a.d - b.d).slice(0, 8);
    });
    const panelOpen = () => p.evaluate(() => /AI가 그린 면적/.test(document.body.innerText));
    for (const h of cands) { await p.mouse.click(h.x, h.y); await sleep(900); if (await panelOpen()) { r.mark('pick'); r.hit = h; break; } }
    await place(p, 1900, 640); await sleep(5500);
    r.extra = { hit: r.hit, zoom: await p.evaluate(() => window.__lm.map.getZoom()), panel: await p.evaluate(() => (document.querySelector('.lm-attr, .lm-side-r, aside[aria-label*="속성"]')?.innerText || '').slice(0, 80)) };
    r.mark('end');
  });
}

/* ── XI맵 · XI ChatGEO(LLM) — 물음 → 지도 분석(하이라이트) → 통계(읍면동별) → 보고서(한글 문서 초안) ── */
if (WHO === 'chat') {
  await frontDoor(p, APP, 'test@lx.or.kr'); await sleep(2000);
  await p.goto(APP + V + 'xi-clean/', { waitUntil: 'domcontentloaded' }); await xiReady(); await sleep(3000);
  const QS = ['남원시 경작지 현황 보여 줘', '남원시 경작지 통계 보고서 만들어 줘'];
  const ask = async (r, q, i) => {
    const prev = await p.evaluate(() => document.querySelector('.xk-ans .xk-ans-t')?.textContent || '');
    await typeIn(p, '.k-ck-i', q, 90); await sleep(350); r.mark('ask' + i); await p.keyboard.press('Enter');
    await place(p, 1900, 640);
    await p.waitForFunction((pv) => { const a = document.querySelector('.xk-ans:not([hidden]):not(.is-busy)'); return a && a.querySelector('.xk-ans-t') && a.querySelector('.xk-ans-t').textContent !== pv && !/답을 찾는 중/.test(a.textContent); }, prev, { timeout: 90000, polling: 50 }).catch(() => {});
    r.mark('ans' + i);
    LOG['chat-answer-' + i] = await p.evaluate(() => document.querySelector('.xk-ans .xk-ans-t')?.innerText || '');
  };
  await scene('x1-chat', async (r) => {
    await p.goto(APP + V + 'xi-clean/', { waitUntil: 'domcontentloaded' }); await xiReady();
    if (await p.locator('.xc-board').count()) { await p.keyboard.press('Escape'); await sleep(600); }
    await place(p, 1900, 640);
    await r.start(); r.mark('start'); await sleep(3000);
    await ask(r, QS[0], 1); await sleep(6000);
    await tap(p, p.locator('.xk-ans button', { hasText: '통계 보기' }).first(), 300); r.mark('stats');
    await place(p, 1900, 640); await sleep(8000);
    await ask(r, QS[1], 2); await sleep(2500);
    await tap(p, p.locator('.xk-ans a, .xk-ans button', { hasText: '대화' }).first(), 300); r.mark('drawer');
    await place(p, 1900, 640); await sleep(6000);
    r.extra = { file: await p.evaluate(() => document.querySelector('.k-ck-file-l')?.textContent || null) };
    r.mark('end');
  });
}

LOG['blocked-' + WHO] = blocked; LOG['errors-' + WHO] = errs; save();
console.log(JSON.stringify({ blocked, errs: errs.length }));
await browser.close();
