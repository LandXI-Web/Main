/* 숏츠 2판 녹화(10-21 사용자 "왜 영상이 모바일 버젼이지?" → PC 화면 · "로딩중이 계속 뜨는데 이런게 뜨면 안된다")
   PC 창 1920×1080 · 배율 1.5(그림 2880×1620 — 편집에서 확대해도 글이 또렷) · 커서 없음 · 저장 요청은 가짜 성공(쓰기 0) · GPU 작업 0.
   node shorts-v2-capture.mjs [main|nat|chat] → <OUTS>/raw2/<장면>.mp4 + .marks.json · capture-log.json(장면마다 loading = 로딩 표시가 보인 구간)
   로딩 감시(shorts-lib LOADWATCH): 0.1초마다 '불러오는 중' · '찾는 중' 글 · 도는 표시 · 덜 그린 지도 타일 → 편집(shorts-v2-edit)이 그 구간을 쓰지 않았는지 검사.
   nat 날기: 화면 녹화 대신 한 걸음마다 타일이 다 그려진 뒤 한 장씩 찍는다(덜 그린 그림 0) → 30fps 로 잇는다. */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium, frontDoor, sleep, noLoading } from './lib.mjs';
import { OUTS, newDesk, RecV } from './shorts-lib.mjs';

const RAW = path.join(OUTS, 'raw2'); fs.mkdirSync(RAW, { recursive: true });
const FR = path.join(process.env.TEMP || OUTS, 'lx-shorts2-frames');
const WHO = process.argv[2] || 'main';
const LOGF = path.join(RAW, 'capture-log.json');
const LOG = fs.existsSync(LOGF) ? JSON.parse(fs.readFileSync(LOGF, 'utf8')) : {};
const save = () => fs.writeFileSync(LOGF, JSON.stringify(LOG, null, 1));
const blocked = [];
const APP = 'https://app.land-xi.dev', V = '/landxi/v3/';
const NAT_AT = (process.env.LX_SHORTS_AT || '127.78,35.56').split(',').map(Number), NAT_Z = Number(process.env.LX_SHORTS_Z || 14.6);
const W2 = 2880, H2 = 1620;

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const { p } = await newDesk(browser, blocked);
const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));

/** 로딩 표시 기록 → 녹화 시각(초) 구간으로 */
const loadSpans = async (t0) => {
  const L = await p.evaluate(() => (window.__ld || []).splice(0)).catch(() => []);
  const out = [];
  for (const [ts, why, te] of L) { const t = ts / 1000 - t0, e = te ? te / 1000 - t0 : t; const last = out.at(-1); if (last && t - last[1] < 0.25 && last[2] === why) last[1] = +e.toFixed(2); else out.push([+t.toFixed(2), +e.toFixed(2), why]); }
  return out;
};
async function scene(name, fn) {
  const r = new RecV(p, path.join(FR, name), W2, H2); const t = Date.now();
  try {
    await fn(r);
    const loading = await loadSpans(r.t0 ?? Date.now() / 1000);
    const s = await r.stop(path.join(RAW, name + '.mp4'));
    LOG[name] = { at: new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }), url: p.url().replace(/[?#].*$/, ''), ...s, marks: r.marks, loading, extra: r.extra, wallS: Math.round((Date.now() - t) / 1000) };
    console.log('녹화', name, JSON.stringify(LOG[name]).slice(0, 900));
  } catch (e) { try { await r.stop(path.join(RAW, name + '-fail.mp4')); } catch {} LOG['FAILED:' + name] = String(e).slice(0, 300); console.log('실패', name, String(e).slice(0, 300)); }
  save();
}
const clearLd = () => p.evaluate(() => { if (window.__ld) window.__ld.length = 0; }).catch(() => {});
const scrollTo = (y, ms) => p.evaluate(([y, ms]) => new Promise((done) => {
  document.documentElement.style.scrollBehavior = 'auto';
  const y0 = scrollY, t0 = performance.now();
  const f = (now) => { const t = Math.min(1, (now - t0) / ms), e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; window.scrollTo(0, y0 + (y - y0) * e); if (t < 1) requestAnimationFrame(f); else done(); };
  requestAnimationFrame(f);
}), [y, ms]);
/** 지도 다 그려짐 — 불러온 타일 다 · 움직임 없음 · 로딩 글 없음이 0.6초 이어질 때 */
const settled = async (ms = 60000) => { await p.evaluate(() => { window.__stq = 0; }).catch(() => {}); return p.waitForFunction(() => {
  const m = window.__xc?.map; if (!m) return false;
  const ok = m.loaded() && m.areTilesLoaded() && !m.isMoving() && !/불러오는 중|찾는 중/.test(document.body.innerText);
  const now = performance.now(); if (!ok) { window.__stq = 0; return false; } window.__stq ||= now; return now - window.__stq > 600;
}, null, { timeout: ms, polling: 100 }).catch(() => {}); };
const xiOpen = async () => {
  await p.goto(APP + V + 'xi-clean/', { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => !!window.__xc?.map && !!document.querySelector('.k-ck-i'), null, { timeout: 90000 }).catch(() => {});
  await noLoading(p); await settled(); await sleep(2500); await settled();
};

/* ── 1 메인(PC) — 지구 → 전국 지도 · 끝까지 차오름 ── */
if (WHO === 'main') {
  const H = 1080;
  await p.goto(APP + V + 'main/', { waitUntil: 'domcontentloaded' }); await sleep(5000);
  await scrollTo(H * 7, 5000); await sleep(4000);   // 데우기(타일 · 그림)
  await scene('d1-main', async (r) => {
    await p.goto(APP + V + 'main/', { waitUntil: 'domcontentloaded' }); await noLoading(p); await sleep(6000);
    const top = await p.evaluate(() => document.querySelector('#trackA').getBoundingClientRect().top + scrollY);
    await r.start(); await clearLd(); r.mark('start'); await sleep(2600);
    r.mark('scroll'); await scrollTo(top + H * 2.55, 1800);
    r.mark('map'); await sleep(300);
    await scrollTo(top + H * 5.7, 4200);
    r.mark('filled'); await sleep(3200);
    r.mark('end');
  });
}

/* ── 2 XI맵 전국 분석 결과(PC) — 전국 → 함양군 강가 들녘(색칠 끔) ── */
if (WHO === 'nat') {
  await frontDoor(p, APP, 'test@lx.or.kr'); await sleep(2000);
  await xiOpen();
  // 분석 결과 색칠 끄기(원칙 298 층 판의 실제 단추 · 저장 요청은 막혀 서버 기억은 그대로)
  const tintOff = async () => { if ((await p.evaluate(() => window.__xc.tint?.on)) !== false) { await p.locator('.xc-tool', { hasText: '층' }).click(); await sleep(900); await p.evaluate(() => document.querySelector('[data-tint-row]')?.click()); await sleep(600); await p.locator('.xc-tool', { hasText: '층' }).click(); await sleep(800); } };
  await tintOff();
  const home = await p.evaluate(() => { const m = window.__xc.map; return { center: m.getCenter().toArray(), zoom: m.getZoom() }; });
  const path_ = (N) => p.evaluate(([c0, z0, c1, z1, N]) => { const out = []; for (let i = 1; i <= N; i++) { const u = i / N, e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2, z = z0 + (z1 - z0) * e, k = (1 - e) * Math.pow(2, z0 - z); out.push({ center: [c1[0] + (c0[0] - c1[0]) * k, c1[1] + (c0[1] - c1[1]) * k], zoom: z }); } return out; }, [home.center, home.zoom, NAT_AT, NAT_Z, N]);
  const N = Number(process.env.LX_SHORTS_STEPS || 135);
  const steps = await path_(N);
  const stepReady = () => p.waitForFunction(() => { const m = window.__xc.map; return m.loaded() && m.areTilesLoaded(); }, null, { timeout: 8000, polling: 40 }).catch(() => {});
  // 데우기 — 같은 길을 한 번 걸어 타일 · 객체 조각을 다 받아 둔다(시간 기록)
  let tw = Date.now();
  for (const s of steps) { await p.evaluate((s) => { window.__xc.map.jumpTo(s); }, s); await stepReady(); }
  await settled(90000); await sleep(4000); await settled();
  console.log('데우기 날기', (Date.now() - tw) / 1000, 's');
  await p.evaluate((h) => { window.__xc.map.jumpTo(h); }, home); await settled(); await sleep(2500); await settled();
  // 2-a 전국(머묾)
  await scene('d2-nat-a', async (r) => { await r.start(); await clearLd(); r.mark('start'); await sleep(3600); r.mark('end'); });
  // 2-b 날기 — 걸음마다 다 그린 뒤 한 장(덜 그린 그림 0)
  const FD = path.join(FR, 'd2-fly'); fs.rmSync(FD, { recursive: true, force: true }); fs.mkdirSync(FD, { recursive: true });
  const bad = []; tw = Date.now();
  for (const [i, s] of steps.entries()) {
    await p.evaluate((s) => { window.__xc.map.jumpTo(s); }, s); await stepReady();
    await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const ok = await p.evaluate(() => { const m = window.__xc.map; return m.loaded() && m.areTilesLoaded() && !/불러오는 중|찾는 중/.test(document.body.innerText); });
    if (!ok) { await stepReady(); bad.push(i); }
    await p.screenshot({ path: path.join(FD, `f${String(i).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 93 });
  }
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-framerate', '30', '-i', 'f%05d.jpg', '-vf', `scale=${W2}:${H2}:flags=lanczos,format=yuv420p`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-r', '30', path.join(RAW, 'd2-fly.mp4')], { cwd: FD });
  LOG['d2-fly'] = { steps: N, notReadyAtShot: bad, wallS: (Date.now() - tw) / 1000, home, to: { center: NAT_AT, zoom: NAT_Z } }; save();
  console.log('날기', JSON.stringify(LOG['d2-fly']));
  await settled(60000); await sleep(1500); await settled();
  // 2-c 도착(머묾)
  await scene('d2-nat-b', async (r) => { await r.start(); await clearLd(); r.mark('start'); await sleep(5000); r.extra = { tint: await p.evaluate(() => window.__xc.tint) }; r.mark('end'); });
}

/* ── 3 XI ChatGEO(PC) — 물음 → 지도 강조 → 통계 보기 → 색칠 끄기 → 보고서 → 대화 서랍(파일) ── */
if (WHO === 'chat') {
  await frontDoor(p, APP, 'test@lx.or.kr'); await sleep(2000);
  await xiOpen();
  if (await p.locator('.xc-board').count()) { await p.keyboard.press('Escape'); await sleep(600); }
  const QS = ['남원시 경작지 현황 보여 줘', '남원시 경작지 통계 보고서 만들어 줘'];
  const ask = async (r, q, i) => {
    const prev = await p.evaluate(() => document.querySelector('.xk-ans .xk-ans-t')?.textContent || '');
    await p.locator('.k-ck-i').first().click(); r.mark('type' + i);
    await p.locator('.k-ck-i').first().pressSequentially(q, { delay: 60 }); await sleep(350); r.mark('ask' + i); await p.keyboard.press('Enter');
    await p.evaluate(() => { window.__sawBusy = false; });
    // 답이 바뀌었거나(앞 답과 다름) '찾는 중'을 한 번 거친 뒤 끝났을 때 — 같은 물음을 다시 해도 기다리지 않게
    await p.waitForFunction((pv) => { if (document.querySelector('.xk-ans.is-busy') || /답을 찾는 중/.test(document.querySelector('.xk-ans')?.textContent || '')) window.__sawBusy = true; const a = document.querySelector('.xk-ans:not([hidden]):not(.is-busy)'); return a && a.querySelector('.xk-ans-t') && (window.__sawBusy || a.querySelector('.xk-ans-t').textContent !== pv) && !/답을 찾는 중/.test(a.textContent); }, prev, { timeout: 90000, polling: 30 }).catch(() => {});
    r.mark('ans' + i);
    LOG['chat2-answer-' + i] = await p.evaluate(() => document.querySelector('.xk-ans .xk-ans-t')?.innerText || '');
  };
  // 데우기 — 대화는 쓰지 않고(녹화 대화가 첫 대화이게) 지도만 남원 둘레를 답 · 순위 돌아보기가 가는 줌으로 미리 돌아 타일 · 결과 조각을 받아 둔다
  { const C = (process.env.LX_SHORTS_CHAT_AT || '127.45,35.42').split(',').map(Number), home = await p.evaluate(() => { const m = window.__xc.map; return { center: m.getCenter().toArray(), zoom: m.getZoom() }; });
    const ready = () => p.waitForFunction(() => { const m = window.__xc.map; return m.loaded() && m.areTilesLoaded(); }, null, { timeout: 15000, polling: 60 }).catch(() => {});
    for (const [z, n, d] of [[8, 0, 0], [9.5, 0, 0], [10.6, 1, 0.12], [11.6, 2, 0.07], [12.4, 2, 0.05]]) for (let a = -n; a <= n; a++) for (let b = -n; b <= n; b++) { await p.evaluate(([c, z]) => { window.__xc.map.jumpTo({ center: c, zoom: z }); }, [[C[0] + a * d, C[1] + b * d], z]); await ready(); }
    await p.evaluate((h) => { window.__xc.map.jumpTo(h); }, home); await settled(); await sleep(1500); }
  await settled();
  await scene('d3-chat', async (r) => {
    await r.start(); await clearLd(); r.mark('start'); await sleep(1500);
    await ask(r, QS[0], 1); await settled(30000); r.mark('mapped'); await sleep(3000);
    await p.locator('.xk-ans button', { hasText: '통계 보기' }).first().click(); r.mark('stats'); await sleep(1200); await settled(20000); r.mark('statsReady'); await sleep(2500);
    await p.locator('.xo:not([hidden]) .xo-tint').first().click(); r.mark('tintoff'); await sleep(1000); await settled(20000); r.mark('tintReady'); await sleep(2500);
    await ask(r, QS[1], 2); await sleep(1800);
    await p.locator('.xk-ans a, .xk-ans button', { hasText: '대화' }).first().click(); r.mark('drawer'); await sleep(1500); await settled(20000); r.mark('drawerReady'); await sleep(3500);
    r.extra = { file: await p.evaluate(() => document.querySelector('.k-ck-file-l')?.textContent || null),
      boxes: await p.evaluate(() => Object.fromEntries([['ans', '.xk-ans'], ['input', '.k-ck-i'], ['panel', '.xo:not([hidden])'], ['mini', '.xo-mini'], ['file', '.k-ck-file-l'], ['drawer', '.k-ck-file-l']].map(([k, q]) => { const e = document.querySelector(q); const b = e?.getBoundingClientRect(); return [k, b ? [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)] : null]; }))) };
    r.mark('end');
  });
}

LOG['blocked-' + WHO] = blocked; LOG['errors-' + WHO] = errs; save();
console.log(JSON.stringify({ blocked, errs }));
await browser.close();
