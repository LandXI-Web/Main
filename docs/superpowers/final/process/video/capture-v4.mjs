/* 소개 영상 4판(원칙 297 · 10-18 3판 피드백) — 3판에서 바뀐 장면만 새로 찍는다(나머지는 3판 raw 그대로 — edit-v4 가 v4 raw 에서 읽으니 3판 raw 를 복사해 둔다).
   node capture-v4.mjs [adm|nw|map|chat|label] [장면이름,...]   → <OUT4>/raw/<장면>.mp4 + .marks.json, <OUT4>/raw/capture-log.json
   3판 피드백: ① 지자체 다음에 LX 관리자 — 기관 공간 · 기관에 공유(보기만 · 저장 0) ② 영농관리 = 서비스 카드 먼저 → 결과 지도(다 그려진 뒤 · 결과 범위에 맞춰)
   ⑤ 지도 서비스 = 결과가 또렷한 층(강진군 경작·휴경 — 후보 비교는 보고에) ⑧ XI ChatGEO 보고서 범위 고침(635e9d05) 뒤 다시.
   저장하는 동작은 하지 않는다(쓰기 요청은 lib 이 가짜 성공으로 막음). */
import fs from 'node:fs';
import path from 'node:path';
import { chromium, frontDoor, newCtx, Rec, sleep, place, tap, typeIn, noLoading } from './lib.mjs';

export const OUT4 = process.env.LX_VIDEO_OUT4 || 'E:/Land-XI 플랫폼/02. 데이터/_video/intro-2026-10-18-v4';
const RAW = path.join(OUT4, 'raw'); fs.mkdirSync(RAW, { recursive: true });
const FR = path.join(process.env.TEMP || OUT4, 'lx-video-frames-v4');
const WHO = process.argv[2] || 'adm';
const ONLY = (process.argv[3] || '').split(',').filter(Boolean);
const want = (n) => !ONLY.length || ONLY.includes(n);
const LOGF = path.join(RAW, 'capture-log.json');
const LOG = fs.existsSync(LOGF) ? JSON.parse(fs.readFileSync(LOGF, 'utf8')) : {};
const blocked = [];
const save = () => fs.writeFileSync(LOGF, JSON.stringify(LOG, null, 1));

const APP = 'https://app.land-xi.dev', ADM = 'https://admin.land-xi.dev', NW = 'https://namwon.land-xi.dev', V = '/landxi/v3/';
// 지도 서비스에서 켤 결과 층 — 후보(남원 · 함양 · 증평 비닐하우스 · 원주 · 천안 건축물 · 여주 · 천안 주차장 · 여수 · 구례 · 강진 · 목포 경작·휴경)를 같은 줌에서 찍어 견준 뒤 고름
const MAP_LAYER = process.env.LX_VIDEO_LAYER || '경작·휴경 분석서비스 강진군';
const MAP_AT = (process.env.LX_VIDEO_AT || '126.7775,34.6325').split(',').map(Number);   // 결과가 가장 촘촘한 곳(같은 층을 줌 13.5 에서 격자로 센 값 · 강진읍 들녘)
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const { ctx, p } = await newCtx(browser, blocked);
const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));

async function scene(name, fn) {
  if (!want(name)) return;
  const r = new Rec(p, path.join(FR, name));
  const t = Date.now();
  try {
    await fn(r);
    const s = await r.stop(path.join(RAW, name + '.mp4'));
    LOG[name] = { at: new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }), url: p.url().replace(/[?#].*$/, ''), ...s, marks: r.marks || {}, extra: r.extra, wallS: Math.round((Date.now() - t) / 1000) };
    console.log('녹화', name, JSON.stringify(LOG[name]));
  } catch (e) { try { await r.stop(path.join(RAW, name + '-fail.mp4')); } catch {} LOG['FAILED:' + name] = String(e).slice(0, 300); console.log('실패', name, String(e).slice(0, 300)); }
  save();
}
/** 지도 타일 · 결과가 다 그려질 때까지(최대 ms) */
const mapIdle = (expr, ms = 60000) => p.waitForFunction((ex) => { const m = eval(ex); return !!m && m.loaded() && m.areTilesLoaded(); }, expr, { timeout: ms, polling: 250 }).catch(() => {});

/* ── LX 관리자 — 기관(남원시) 공간 → 받는 서비스와 담당 → 배포 › 기관 공유 표(체크 · 저장은 하지 않음) ── */
if (WHO === 'adm') {
  await frontDoor(p, ADM, 'lxadmin@lx.or.kr'); await sleep(2500);
  for (const u of ['ops-infra/?view=tenants', 'ops-infra/?view=deploys#/deploys/share']) { await p.goto(ADM + V + u, { waitUntil: 'domcontentloaded' }); await noLoading(p); await sleep(3500); }
  await scene('a1-admin', async (r) => {
    await p.goto(ADM + V + 'ops-infra/?view=tenants', { waitUntil: 'domcontentloaded' }); await noLoading(p); await sleep(2500);
    await place(p, 1900, 640);
    await r.start(); r.mark('start'); await sleep(2200);
    await tap(p, p.locator('a.org-link', { hasText: '남원시' }).first(), 300); r.mark('org');
    await noLoading(p); await place(p, 1900, 640); await sleep(3200);
    await tap(p, p.locator('button, a, [role=tab]', { hasText: /^서비스와 담당/ }).first(), 300); r.mark('svc');
    await noLoading(p); await place(p, 1900, 640); await sleep(3500);
    await tap(p, p.locator('a, button', { hasText: /^배포$/ }).first(), 300); await sleep(1200);
    await tap(p, p.locator('a, button, [role=tab]', { hasText: /^기관 공유$/ }).first(), 300); r.mark('share');
    await noLoading(p); await place(p, 1900, 640); await sleep(5000);
    r.extra = { text: (await p.evaluate(() => document.querySelector('main, .k-main')?.innerText || '')).slice(0, 120) };
    r.mark('end');
  });
}

/* ── 지자체(남원시 · 기관 주소) — 내 서비스(영농관리 = 경작·휴경 카드) → 이 서비스 열기(현황) → 결과 지도(다 그려진 뒤 · 결과 범위) ── */
if (WHO === 'nw') {
  await frontDoor(p, NW, 'lxadmin@lx.or.kr#namwon'); await sleep(3000);
  for (const u of ['gov-select/', 'gov-select/?service=card-farm', 'xi-clean/?region=52190&service=card-farm']) {
    await p.goto(NW + V + u, { waitUntil: 'domcontentloaded' }); await noLoading(p);
    if (u.startsWith('xi')) { await p.waitForFunction(() => !!window.__xc?.map, null, { timeout: 90000 }).catch(() => {}); await mapIdle('window.__xc.map', 90000); await sleep(4000); } else await sleep(4000);
  }
  await scene('n1-nw', async (r) => {
    await p.goto(NW + V + 'gov-select/', { waitUntil: 'domcontentloaded' }); await noLoading(p); await sleep(2500);
    await place(p, 1900, 300);
    await r.start(); r.mark('start'); await sleep(4500);
    r.mark('card');   // 경작·휴경(영농관리) 카드에 머묾 — 다음 컷의 첫 장면
    await sleep(2500);
    await tap(p, p.locator('a', { hasText: '이 서비스 열기' }).nth(1), 300); r.mark('svc');
    await noLoading(p); await place(p, 1900, 300); await sleep(4000);
    r.mark('tomap');
    await tap(p, p.locator('a.gs-tab', { hasText: '결과 지도' }).first(), 300);
    await p.waitForFunction(() => !!window.__xc?.map, null, { timeout: 90000 }).catch(() => {});
    await noLoading(p); r.mark('map');
    await mapIdle('window.__xc.map', 90000); await sleep(1500);
    r.mark('loaded'); await sleep(4500);
    // 결과가 가장 모인 곳으로 한 걸음 가까이(휠) — 다 그려질 때까지 기다림
    const pt = await p.evaluate(() => {
      const m = window.__xc.map, fs = m.queryRenderedFeatures().filter((f) => f.geometry && /Polygon/.test(f.geometry.type) && !/sgg|emd|bound|admin|region|world|base/i.test(f.source + f.layer.id));
      const g = new Map(); for (const f of fs) { let c = f.geometry.coordinates; while (Array.isArray(c[0])) c = c[0]; const q = m.project(c); if (q.x < 560 || q.x > 1500 || q.y < 220 || q.y > 800) continue; const k = Math.round(q.x / 90) + ',' + Math.round(q.y / 90); g.set(k, (g.get(k) || 0) + 1); }
      const best = [...g.entries()].sort((a, b) => b[1] - a[1])[0]; if (!best) return [1000, 560]; const [x, y] = best[0].split(',').map(Number); return [x * 90, y * 90];
    });
    await place(p, pt[0], pt[1]);
    for (let s = 0; s < 46; s++) { await p.mouse.wheel(0, -14); await sleep(16); }
    await place(p, 1900, 640); r.mark('zoom');
    await mapIdle('window.__xc.map', 30000); await sleep(800); r.mark('zoomed'); await sleep(4500);
    r.extra = { zoom: await p.evaluate(() => window.__xc.map.getZoom()), at: pt };
    r.mark('end');
  });
}

/* ── 지도 서비스 — 결과 층 하나 켜기(결과 범위로 감) → 한 걸음 가까이 → 도형 누르기(분류 · 면적 · 필지 정보) ──
   이 층은 LX 관리자 계정의 지도 서비스에만 보여(직원 test 는 자기 분석만) 관리자 주소에서 찍는다 — 화면은 같은 '지도 서비스'. */
if (WHO === 'map') {
  await frontDoor(p, ADM, 'lxadmin@lx.or.kr'); await sleep(2000);
  const open = async () => { await p.goto(ADM + V + 'lx-map/', { waitUntil: 'domcontentloaded' }); await noLoading(p); await p.waitForFunction(() => !!window.__lm?.map, null, { timeout: 60000 }).catch(() => {}); await sleep(4500); };
  const offAll = async () => { for (const s of await p.locator('button.lm-sw[aria-checked="true"]').all()) { await s.click().catch(() => {}); await sleep(300); } };
  const grp = MAP_LAYER.replace(/ \S+$/, '');
  const sw = () => p.locator(`button.lm-sw[aria-label^="${MAP_LAYER}"]`).first();
  const openGrp = async () => { if (!(await sw().isVisible().catch(() => false))) { await p.locator('text=' + grp).first().click(); await sleep(900); } };
  const settled = async (min, ms = 60000) => { const t0 = Date.now(); let last = -1; while (Date.now() - t0 < ms) { const n = await p.evaluate(() => window.__lm.map.queryRenderedFeatures().filter((f) => /^lm-r-.*-fill$/.test(f.layer.id)).length); if (n >= min && n === last && await p.evaluate(() => window.__lm.map.areTilesLoaded())) return n; last = n; await sleep(1200); } return last; };
  // 데우기 — 켜서 결과 범위 · 가까운 곳 타일을 다 받아 둔다
  await open(); await offAll(); await openGrp(); await sw().click(); await sleep(4000); await settled(50);
  await p.evaluate((c) => window.__lm.map.jumpTo({ center: c, zoom: 14.2 }), MAP_AT); await settled(150, 90000);
  await p.evaluate((c) => window.__lm.map.jumpTo({ center: c, zoom: 13.2 }), MAP_AT); await settled(150, 60000);
  await offAll(); await sleep(1500);
  await scene('q1-map', async (r) => {
    await open(); await offAll(); await openGrp(); await sleep(1200);
    await place(p, 1900, 640);
    await r.start(); r.mark('start'); await sleep(1800);
    await tap(p, sw(), 250); r.mark('on');
    await place(p, 1900, 640); await sleep(2500); await settled(50, 30000); r.mark('fit'); await sleep(2500);
    const pt = await p.evaluate((c) => { const m = window.__lm.map, r = m.getCanvas().getBoundingClientRect(), q = m.project(c); return [r.left + q.x, r.top + q.y]; }, MAP_AT);
    if (pt) { await place(p, pt[0], pt[1]); for (let s = 0; s < 400 && (await p.evaluate(() => window.__lm.map.getZoom())) < 14.2; s++) { await p.mouse.wheel(0, -14); await sleep(16); } }   // 줌 14.2 까지(도형이 또렷한 거리)
    await place(p, 1900, 640); r.mark('zoom'); await sleep(800); r.n = await settled(150, 45000); r.mark('zoomed'); await sleep(2500);
    // 화면 가운데 가까운 경작지 도형(속성 칸이 열릴 때까지 가까운 차례로)
    const cands = await p.evaluate(() => {
      const m = window.__lm.map, c = m.getCanvas().getBoundingClientRect(), fs = m.queryRenderedFeatures().filter((f) => /^lm-r-.*-fill$/.test(f.layer.id));
      const cx = c.left + c.width / 2, cy = c.top + c.height / 2, out = [];
      for (const f of fs) { let q = f.geometry.coordinates; while (Array.isArray(q[0][0])) q = q[0]; const xs = q.map((v) => m.project(v)); const x = c.left + xs.reduce((a, v) => a + v.x, 0) / xs.length, y = c.top + xs.reduce((a, v) => a + v.y, 0) / xs.length; out.push({ x, y, d: Math.hypot(x - cx, y - cy) }); }
      return out.sort((a, b) => a.d - b.d).slice(0, 14);
    });
    const good = () => p.evaluate(() => { const t = document.body.innerText.replace(/\s+/g, ' '); return /AI가 그린 면적/.test(t) && /\d[\d,]*\s*㎡ AI가 그린 면적/.test(t) && /\d+\s*% 신뢰도/.test(t); });
    for (const h of cands) { await p.mouse.click(h.x, h.y); await sleep(1100); if (await good()) { r.mark('pick'); r.hit = h; break; } }
    r.panel = await p.evaluate(() => { const t = document.body.innerText.replace(/\s+/g, ' '); const k = t.indexOf('AI가 그린 면적'); return k < 0 ? '' : t.slice(Math.max(0, k - 20), k + 40); });
    await place(p, 1900, 640); await sleep(5500);
    r.extra = { hit: r.hit, panel: r.panel, n: r.n, zoom: await p.evaluate(() => window.__lm.map.getZoom()) };
    r.mark('end');
  });
}

/* ── XI맵 · XI ChatGEO(LLM) — 물음 → 지도 분석(하이라이트) → 통계 보기 → 보고서(한글 문서 초안 · 대화 서랍) ── */
if (WHO === 'chat') {
  const xiReady = async () => { await p.waitForFunction(() => !!window.__xc?.map && !!document.querySelector('.k-ck-i'), null, { timeout: 90000 }).catch(() => {}); await noLoading(p); await sleep(2500); };
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
