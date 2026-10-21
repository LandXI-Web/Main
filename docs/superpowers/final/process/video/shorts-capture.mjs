/* 숏츠 녹화(세로 · 10-21) — 바깥 주소 · 로그인 폼 · 휴대폰 배치 · 커서 없음 · 저장 요청은 가짜 성공(쓰기 0) · GPU 작업 0.
   node shorts-capture.mjs [main|nat|chat] → <OUTS>/raw/<장면>.mp4 + .marks.json, <OUTS>/raw/capture-log.json
   main = 메인 화면(지구 → 전국 지도 차오름 끝까지)
   nat  = XI맵 전국 분석 결과(농지 전수 · 하천구역 안 건물) → 결과가 또렷한 곳(함양군 강가 들녘)으로 날아가 객체 하나하나
   chat = XI ChatGEO — 물음 → 지도 분석 → 통계 보기 → 색칠 끄기 → "보고서 만들어 줘" → 보고서 파일(한글 문서 초안 · 읽기 전용 · 한 번만) */
import fs from 'node:fs';
import path from 'node:path';
import { chromium, frontDoor, sleep, noLoading } from './lib.mjs';
import { OUTS, newMobile, RecV } from './shorts-lib.mjs';

const RAW = path.join(OUTS, 'raw'); fs.mkdirSync(RAW, { recursive: true });
const FR = path.join(process.env.TEMP || OUTS, 'lx-shorts-frames');
const WHO = process.argv[2] || 'main';
const LOGF = path.join(RAW, 'capture-log.json');
const LOG = fs.existsSync(LOGF) ? JSON.parse(fs.readFileSync(LOGF, 'utf8')) : {};
const save = () => fs.writeFileSync(LOGF, JSON.stringify(LOG, null, 1));
const blocked = [];
const APP = 'https://app.land-xi.dev', V = '/landxi/v3/';
// 2장 — 결과가 또렷한 곳(같은 줌에서 여러 곳을 견줘 고름: 건물 · 경작지 · 비닐하우스가 함께 · 서비스 결과 층이 겹치지 않음)
const NAT_AT = (process.env.LX_SHORTS_AT || '127.78,35.56').split(',').map(Number), NAT_Z = Number(process.env.LX_SHORTS_Z || 14.6);

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const { p } = await newMobile(browser, blocked);
const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));

async function scene(name, fn) {
  const r = new RecV(p, path.join(FR, name)); const t = Date.now();
  try {
    await fn(r);
    const s = await r.stop(path.join(RAW, name + '.mp4'));
    LOG[name] = { at: new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }), url: p.url().replace(/[?#].*$/, ''), ...s, marks: r.marks, extra: r.extra, wallS: Math.round((Date.now() - t) / 1000) };
    console.log('녹화', name, JSON.stringify(LOG[name]));
  } catch (e) { try { await r.stop(path.join(RAW, name + '-fail.mp4')); } catch {} LOG['FAILED:' + name] = String(e).slice(0, 300); console.log('실패', name, String(e).slice(0, 300)); }
  save();
}
/** 창 부드럽게 옮기기(rAF · ease-in-out) */
const scrollTo = (y, ms) => p.evaluate(([y, ms]) => new Promise((done) => {
  document.documentElement.style.scrollBehavior = 'auto';
  const y0 = scrollY, t0 = performance.now();
  const f = (now) => { const t = Math.min(1, (now - t0) / ms), e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; window.scrollTo(0, y0 + (y - y0) * e); if (t < 1) requestAnimationFrame(f); else done(); };
  requestAnimationFrame(f);
}), [y, ms]);
const mapIdle = (ms = 60000) => p.waitForFunction(() => { const m = window.__xc?.map; return !!m && m.loaded() && m.areTilesLoaded(); }, null, { timeout: ms, polling: 250 }).catch(() => {});
const xiOpen = async () => {
  await p.goto(APP + V + 'xi-clean/', { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => !!window.__xc?.map && !!document.querySelector('.k-ck-i'), null, { timeout: 90000 }).catch(() => {});
  await noLoading(p); await mapIdle(); await sleep(3000);
};

/* ── 1 메인 — 지구(첫 화면) → 전국 지도 · 남에서 북으로 끝까지 차오른 뒤 머문다(로그인 전 공개 화면) ── */
if (WHO === 'main') {
  const H = 648;
  await p.goto(APP + V + 'main/', { waitUntil: 'domcontentloaded' }); await sleep(5000);
  await scrollTo(H * 6, 4000); await sleep(3000);   // 데우기(타일)
  await scene('s1-main', async (r) => {
    await p.goto(APP + V + 'main/', { waitUntil: 'domcontentloaded' }); await sleep(5500);
    const top = await p.evaluate(() => document.querySelector('#trackA').getBoundingClientRect().top + scrollY);
    await r.start(); r.mark('start'); await sleep(2200);
    r.mark('scroll'); await scrollTo(top + H * 2.55, 1800);
    r.mark('map'); await sleep(300);
    await scrollTo(top + H * 5.7, 4200);
    r.mark('filled'); await sleep(3000);
    r.mark('end');
  });
}

/* ── 2 XI맵 전국 분석 결과 — 전국(농지 전수 · 하천구역 안 건물) → 한 곳으로 날아가 객체 하나하나 ── */
if (WHO === 'nat') {
  await frontDoor(p, APP, 'test@lx.or.kr'); await sleep(2000);
  await xiOpen();
  // 지도 위 통계 색칠은 끈다(원칙 298 '분석 결과 색칠' — 층 판의 실제 단추 · 저장 요청은 막혀 서버 기억은 그대로)
  const tintOff = async () => { if ((await p.evaluate(() => window.__xc.tint?.on)) !== false) { await p.locator('.xc-tool', { hasText: '층' }).click(); await sleep(900); await p.evaluate(() => document.querySelector('[data-tint-row]')?.click()); await sleep(600); await p.locator('.xc-tool', { hasText: '층' }).click(); await sleep(800); } };
  await tintOff();
  const home = await p.evaluate(() => { const m = window.__xc.map; return { center: m.getCenter().toArray(), zoom: m.getZoom() }; });
  // 데우기 — 같은 길로 한 번 날아가 타일 · 객체 조각을 다 받아 둔다
  await p.evaluate(([c, z]) => window.__xc.map.flyTo({ center: c, zoom: z, duration: 5000, curve: 1.5 }), [NAT_AT, NAT_Z]); await sleep(6000); await mapIdle(90000); await sleep(5000);
  await scene('s2-nat', async (r) => {
    await xiOpen(); await tintOff(); await mapIdle(); await sleep(1500);
    await r.start(); r.mark('start'); await sleep(3200);
    r.mark('fly');
    // 한 걸음씩 날기 — 걸음마다 그 자리 타일이 다 그려질 때까지(최대 1.2초) 기다린다. 기다린 동안 같은 그림은 편집에서 덜어 낸다(shorts-edit 'steady')
    //  → 무거운 전국 조각을 읽느라 화면이 멈췄다 건너뛰는 일 없이 고르게 내려앉는다. 화면 위 대상점이 화면 가운데로 고르게 옮겨 오게(줌 · 위치 함께 ease-in-out)
    await p.evaluate(async ([c1, z1, N]) => {
      const m = window.__xc.map, c0 = m.getCenter().toArray(), z0 = m.getZoom();
      const raf = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const ready = async (ms) => { const t = performance.now(); while (performance.now() - t < ms) { if (m.loaded() && m.areTilesLoaded()) return; await new Promise((r) => setTimeout(r, 40)); } };
      for (let i = 1; i <= N; i++) {
        const u = i / N, e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2, z = z0 + (z1 - z0) * e, k = (1 - e) * Math.pow(2, z0 - z);
        m.jumpTo({ center: [c1[0] + (c0[0] - c1[0]) * k, c1[1] + (c0[1] - c1[1]) * k], zoom: z });
        await raf(); await ready(1200);
      }
    }, [NAT_AT, NAT_Z, 150]);
    r.mark('arrived'); await mapIdle(30000); r.mark('idle'); await sleep(4000);
    r.extra = { home, tint: await p.evaluate(() => window.__xc.tint), hud: await p.evaluate(() => [...document.querySelectorAll('body *')].find((e) => e.children.length === 0 && /서비스 제공중/.test(e.textContent))?.textContent || '') };
    r.mark('end');
  });
}

/* ── 3 XI ChatGEO — 물음 → 지도 분석 → 통계 보기 → 색칠 끄기 → 보고서 ── */
if (WHO === 'chat') {
  await frontDoor(p, APP, 'test@lx.or.kr'); await sleep(2000);
  await xiOpen();
  const QS = ['남원시 경작지 현황 보여 줘', '남원시 경작지 통계 보고서 만들어 줘'];
  const ask = async (r, q, i) => {
    const prev = await p.evaluate(() => document.querySelector('.xk-ans .xk-ans-t')?.textContent || '');
    await p.locator('.k-ck-i').first().click(); r.mark('type' + i);
    await p.locator('.k-ck-i').first().pressSequentially(q, { delay: 55 }); await sleep(300); r.mark('ask' + i); await p.keyboard.press('Enter');
    await p.waitForFunction((pv) => { const a = document.querySelector('.xk-ans:not([hidden]):not(.is-busy)'); return a && a.querySelector('.xk-ans-t') && a.querySelector('.xk-ans-t').textContent !== pv && !/답을 찾는 중/.test(a.textContent); }, prev, { timeout: 90000, polling: 50 }).catch(() => {});
    r.mark('ans' + i);
    LOG['chat-answer-' + i] = await p.evaluate(() => document.querySelector('.xk-ans .xk-ans-t')?.innerText || '');
  };
  await scene('s3-chat', async (r) => {
    if (await p.locator('.xc-board').count()) { await p.keyboard.press('Escape'); await sleep(600); }
    await r.start(); r.mark('start'); await sleep(1500);
    await ask(r, QS[0], 1); await sleep(1500); await mapIdle(15000); r.mark('mapped'); await sleep(2500);
    await p.locator('.xk-ans button', { hasText: '통계 보기' }).first().click(); r.mark('stats'); await sleep(3500);
    await p.locator('.xo:not([hidden]) .xo-tint').first().click(); r.mark('tintoff'); await sleep(3000);
    await ask(r, QS[1], 2); await sleep(2000);
    await p.locator('.xk-ans a, .xk-ans button', { hasText: '대화' }).first().click(); r.mark('drawer'); await sleep(4500);
    r.extra = { file: await p.evaluate(() => document.querySelector('.k-ck-file-l')?.textContent || null) };
    r.mark('end');
  });
}

LOG['blocked-' + WHO] = blocked; LOG['errors-' + WHO] = errs; save();
console.log(JSON.stringify({ blocked, errs }));
await browser.close();
