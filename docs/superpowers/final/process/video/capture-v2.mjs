/* 소개 영상 2판(원칙 297 · 10-18 첫 판 피드백) 실제 화면 녹화 — 바깥 주소 · 로그인 폼 · 1920×1080 · 화면 배율 1 · 커서 점 없음.
   node capture-v2.mjs [lx|sales|nw|kg] [장면이름,...]   → <OUT2>/raw/<장면>.mp4 + .marks.json, <OUT2>/raw/capture-log.json
   순서(사용자): 메인 → 직원 · 영업용 · 지자체 → 학습데이터 구축(라벨링) – 모델 개발 → 지도 서비스 → XI맵(XI ChatGEO) → 해외 → 마무리.
   장면마다 미리 한 번 열어(데운 창) '불러오는 중'이 사라진 뒤 녹화. 저장하는 동작은 하지 않는다(쓰기 요청은 lib 이 가짜 성공으로 막음). */
import fs from 'node:fs';
import path from 'node:path';
import { chromium, frontDoor, newCtx, Rec, sleep, place, glide, at, tap, typeIn, wheel, noLoading } from './lib.mjs';

export const OUT2 = process.env.LX_VIDEO_OUT2 || 'E:/Land-XI 플랫폼/02. 데이터/_video/intro-2026-10-18-v2';
const RAW = path.join(OUT2, 'raw'); fs.mkdirSync(RAW, { recursive: true });
const FR = path.join(process.env.TEMP || OUT2, 'lx-video-frames-v2');
const WHO = process.argv[2] || 'lx';
const ONLY = (process.argv[3] || '').split(',').filter(Boolean);
const want = (n) => !ONLY.length || ONLY.includes(n);
const LOGF = path.join(RAW, 'capture-log.json');
const LOG = fs.existsSync(LOGF) ? JSON.parse(fs.readFileSync(LOGF, 'utf8')) : {};
const blocked = [];
const save = () => fs.writeFileSync(LOGF, JSON.stringify(LOG, null, 1));

const APP = 'https://app.land-xi.dev', NW = 'https://namwon.land-xi.dev', KG = 'https://kgz-agri.land-xi.dev', V = '/landxi/v3/';
// 학습 흐름을 보여 줄 프로젝트 — 프로젝트 목록에서 이름으로 찾는다(비닐하우스 2026: 학습 20회 · 라벨 그림 · 추론 결과가 모두 있는 프로젝트)
const PRJ_NAME = process.env.LX_VIDEO_PRJ || '비닐하우스 2026';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const { ctx, p } = await newCtx(browser, blocked);
const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));

async function scene(name, fn) {
  if (!want(name)) return;
  const r = new Rec(p, path.join(FR, name));
  const t = Date.now();
  try {
    await fn(r);
    const out = path.join(RAW, name + '.mp4');
    const s = await r.stop(out);
    LOG[name] = { at: new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }), url: p.url().replace(/[?#].*$/, ''), ...s, marks: r.marks || {}, wallS: Math.round((Date.now() - t) / 1000) };
    console.log('녹화', name, JSON.stringify(LOG[name]));
  } catch (e) { try { await r.stop(path.join(RAW, name + '-fail.mp4')); } catch {} LOG['FAILED:' + name] = String(e).slice(0, 300); console.log('실패', name, String(e).slice(0, 300)); }
  save();
}
const xiReady = async () => { await p.waitForFunction(() => !!window.__xc?.map && !!document.querySelector('.k-ck-i'), null, { timeout: 90000 }).catch(() => {}); await noLoading(p); await sleep(2500); };
const thumbs = () => p.waitForFunction(() => { const i = [...document.querySelectorAll('.tf-t img')]; return i.length >= 9 && i.slice(0, 9).every((x) => x.complete && x.naturalWidth > 0); }, null, { timeout: 90000, polling: 200 }).catch(() => {});

if (WHO === 'lx') {
  // ── 데우기: 메인 · 로그인 ──
  await p.goto(APP + V + 'main/', { waitUntil: 'domcontentloaded' }); await sleep(5000); await wheel(p, 5000, 60, 20); await sleep(3000);
  await p.goto(APP + V + 'login/', { waitUntil: 'domcontentloaded' }); await sleep(3000);

  // 1 메인 — 지구(모토) → 전국 지도
  await scene('m1-main', async (r) => {
    await p.goto(APP + V + 'main/', { waitUntil: 'domcontentloaded' }); await sleep(5500);
    await place(p, 1500, 900);
    await r.start(); r.mark('start');
    await sleep(4200);
    r.mark('scroll');
    await wheel(p, 1800, 90, 22);
    r.mark('map'); await sleep(1500);
    await wheel(p, 1500, 70, 22);
    r.mark('map2'); await sleep(7000);
    r.mark('end');
  });

  // 2 로그인 → LX 직원 대시보드
  await scene('m2-dash', async (r) => {
    await p.goto(APP + V + 'login/', { waitUntil: 'domcontentloaded' }); await sleep(3500);
    await place(p, 1300, 700);
    await r.start(); r.mark('start'); await sleep(700);
    const idIn = p.locator('input[name=login], input[autocomplete=username], input[type=text]').first();
    await typeIn(p, idIn, 'test@lx.or.kr', 55);
    const pw = p.locator('input[type=password]').first();
    await tap(p, pw, 300); await pw.fill(process.env.LX_PW);
    r.mark('go');
    await tap(p, p.locator('button', { hasText: /^로그인$/ }).first(), 300);
    await p.waitForURL(/lx-console/, { timeout: 60000 });
    await p.waitForFunction(() => document.documentElement.dataset.consoleReady === '1', null, { timeout: 60000 }).catch(() => {});
    await noLoading(p, 20000); r.mark('dash');
    await place(p, 1900, 600); await sleep(7000); r.mark('end');
  });

  // 프로젝트 찾기 · 데우기
  await p.goto(APP + V + 'lx-project/?scope=all', { waitUntil: 'domcontentloaded' }); await noLoading(p); await sleep(2500);
  let prj = null;
  for (let k = 0; k < 4 && !prj; k++) {
    prj = await p.evaluate((nm) => { for (const a of document.querySelectorAll('a[href*="lx-project/?project="]')) { const c = a.closest('article, li, .lxp-card') || a.parentElement?.parentElement; if (c && c.innerText.includes(nm)) return new URL(a.href).searchParams.get('project'); } return null; }, PRJ_NAME);
    if (!prj) { const nx = p.locator('button[aria-label="다음 페이지"]:not([disabled])').first(); if (await nx.count()) { await nx.click(); await sleep(2000); } else break; }
  }
  if (!prj) throw new Error('프로젝트 못 찾음 ' + PRJ_NAME);
  LOG.project = { name: PRJ_NAME };
  const goStage = async (label) => {   // 프로젝트 위 단계 줄에서 고른다(주소는 화면이 정함)
    await p.goto(APP + V + 'lx-release/?project=' + prj + '&stage=publish', { waitUntil: 'domcontentloaded' }); await noLoading(p); await sleep(1500);
    await p.locator('a, button', { hasText: new RegExp('^' + label + '$') }).first().click(); await sleep(1200); await noLoading(p, 60000);
    return p.url();
  };
  const U = {};
  U.label = await goStage('학습데이터 구축'); await thumbs(); await sleep(1500);
  U.train = await goStage('학습'); await sleep(4000);
  U.result = await goStage('결과 확인'); await noLoading(p, 90000); await sleep(4000);
  await p.goto(APP + V + 'lx-train/', { waitUntil: 'domcontentloaded' }); await noLoading(p); await sleep(3000);
  LOG.urls = Object.fromEntries(Object.entries(U).map(([k, v]) => [k, v.replace(/^https?:\/\/[^/]+/, '')]));

  // 3 학습데이터 구축 – 모델 개발
  await scene('p1-list', async (r) => {
    await p.goto(APP + V + 'lx-project/?scope=all', { waitUntil: 'domcontentloaded' }); await noLoading(p); await sleep(2500);
    await place(p, 1900, 700);
    await r.start(); r.mark('start'); await sleep(6500); r.mark('end');
  });
  await scene('p2-label', async (r) => {
    await p.goto(U.label, { waitUntil: 'domcontentloaded' }); await noLoading(p); await thumbs(); await sleep(1500);
    await place(p, 1700, 700);
    await r.start(); r.mark('start'); await sleep(2200);
    await wheel(p, 700, 50, 22); r.mark('grid');
    await sleep(6500); r.mark('end');
  });
  await scene('p3-train', async (r) => {
    await p.goto(U.train, { waitUntil: 'domcontentloaded' }); await noLoading(p); await sleep(4000);
    await place(p, 1900, 640);
    await r.start(); r.mark('start'); await sleep(8500); r.mark('end');
  });
  await scene('p4-models', async (r) => {
    await p.goto(APP + V + 'lx-train/', { waitUntil: 'domcontentloaded' }); await noLoading(p); await sleep(3000);
    await place(p, 1900, 900);
    await r.start(); r.mark('start'); await sleep(6000); r.mark('end');
  });

  // 4 지도 서비스 — 프로젝트 결과 → 연속지적 겹치기 → 결과 하나 누르기 → 분석서비스 묶음 켜기
  await scene('q1-map', async (r) => {
    await p.goto(U.result, { waitUntil: 'domcontentloaded' }); await sleep(1500); await noLoading(p, 90000); await sleep(4000);
    await place(p, 1900, 640);
    await r.start(); r.mark('start'); await sleep(2500);
    await tap(p, p.locator('button, label', { hasText: /^연속지적$/ }).first(), 200); r.mark('cad');
    await sleep(1200); await noLoading(p, 20000); await sleep(1800);
    await glide(p, 880, 600, 200); await wheel(p, -500, 30, 25); await sleep(1800); await noLoading(p, 20000); r.mark('zoom');
    await p.mouse.click(880, 600); r.mark('pick'); await sleep(3500);
    await p.keyboard.press('Escape').catch(() => {}); await place(p, 1900, 640);
    await tap(p, p.locator('text=비닐하우스 분석서비스').first(), 200); r.mark('grp'); await sleep(1500);
    const sw = p.locator('button.lm-sw[aria-label^="비닐하우스 분석서비스 남원"]').first();
    if (await sw.count()) { await sw.click(); r.mark('svc'); }
    await sleep(1500); await noLoading(p, 60000); await place(p, 1900, 640); await sleep(5000); r.mark('end');
  });

  // 5 XI맵 — 전국 결과 → XI ChatGEO 두 질문
  await p.goto(APP + V + 'xi-clean/', { waitUntil: 'domcontentloaded' }); await xiReady(); await sleep(3000);
  await scene('x1-chat', async (r) => {
    await p.goto(APP + V + 'xi-clean/', { waitUntil: 'domcontentloaded' }); await xiReady();
    if (await p.locator('.xc-board').count()) { await p.keyboard.press('Escape'); await sleep(600); }
    await place(p, 1900, 640);
    await r.start(); r.mark('start'); await sleep(5000);
    const qs = ['남원시 경작지 현황 보여 줘', '그중 가장 큰 곳은?'];
    for (const [i, q] of qs.entries()) {
      const prev = await p.evaluate(() => document.querySelector('.xk-ans .xk-ans-t')?.textContent || '');
      await typeIn(p, '.k-ck-i', q, 95); await sleep(350); r.mark('ask' + (i + 1)); await p.keyboard.press('Enter');
      await place(p, 1900, 640);
      await p.waitForFunction((pv) => { const a = document.querySelector('.xk-ans:not([hidden]):not(.is-busy)'); return a && a.querySelector('.xk-ans-t') && a.querySelector('.xk-ans-t').textContent !== pv && !/답을 찾는 중/.test(a.textContent); }, prev, { timeout: 90000, polling: 50 }).catch(() => {});
      r.mark('ans' + (i + 1));
      await sleep(i === 0 ? 6500 : 6000);
      LOG['chat-answer-' + (i + 1)] = await p.evaluate(() => document.querySelector('.xk-ans .xk-ans-t')?.innerText || '');
    }
    r.mark('end');
  });
}

if (WHO === 'sales') {
  await frontDoor(p, APP, 'sales@lx.or.kr'); await sleep(2500);
  if (!/\/sales\//.test(p.url())) await p.goto(APP + V + 'sales/', { waitUntil: 'domcontentloaded' });
  await noLoading(p); await sleep(4000); await place(p, 300, 900); await wheel(p, 3000, 40, 16); await sleep(3000);
  await scene('s1-sales', async (r) => {
    await p.goto(APP + V + 'sales/', { waitUntil: 'domcontentloaded' });
    await p.waitForFunction(() => document.body.dataset.state === 'ready', null, { timeout: 60000 }).catch(() => {}); await noLoading(p); await sleep(4000);
    await place(p, 300, 900);
    await r.start(); r.mark('start'); await sleep(3200);
    await wheel(p, 960, 60, 20); r.mark('svc'); await sleep(3600);
    await wheel(p, 900, 60, 20); r.mark('cases'); await sleep(4000); r.mark('end');
  });
}

if (WHO === 'nw') {
  await frontDoor(p, NW, 'lxadmin@lx.or.kr#namwon'); await sleep(3000);
  for (const u of ['gov-select/?service=card-farm', 'gov-select/?service=card-farm&tab=stats', 'gov-select/']) { await p.goto(NW + V + u, { waitUntil: 'domcontentloaded' }); await noLoading(p); await sleep(3500); }
  await scene('n1-nw', async (r) => {
    await p.goto(NW + V + 'gov-select/', { waitUntil: 'domcontentloaded' }); await noLoading(p); await sleep(2500);
    await place(p, 1900, 300);
    await r.start(); r.mark('start'); await sleep(4500);
    await tap(p, p.locator('a', { hasText: '이 서비스 열기' }).nth(1), 300); r.mark('svc');
    await noLoading(p); await place(p, 1900, 300); await sleep(5000);
    await tap(p, p.locator('a', { hasText: '통계·보고서' }).first(), 300); r.mark('stats');
    await noLoading(p); await sleep(1200); await place(p, 900, 700); await wheel(p, 420, 40, 20); await place(p, 1900, 300); await sleep(4500); r.mark('end');
  });
}

if (WHO === 'kg') {
  await frontDoor(p, KG, 'lxadmin@lx.or.kr#kgz-agri'); await sleep(2000);
  const ready = async () => { await p.waitForFunction(() => document.body.dataset.state === 'ready', null, { timeout: 90000 }).catch(() => {}); await p.waitForFunction(() => { const b = document.querySelector('.gl-hud .k-big'); return !b || b.dataset.state === 'ok' || b.dataset.state === 'none'; }, null, { timeout: 120000 }).catch(() => {}); await sleep(4000); };
  if (!/global/.test(p.url())) await p.goto(KG + V + 'global/', { waitUntil: 'domcontentloaded' });
  await ready(); const url = p.url();
  await scene('k1-kg', async (r) => {
    await p.goto(url, { waitUntil: 'domcontentloaded' }); await ready();
    await place(p, 820, 380);
    await r.start(); r.mark('start'); await sleep(3000);
    for (let i = 0; i < 2; i++) { await wheel(p, -700, 45, 28); await sleep(700); } await sleep(3500); r.mark('zoomed');
    await tap(p, p.locator('[role=tab]', { hasText: 'Register' }).first(), 200); r.mark('register'); await place(p, 1000, 1000); await sleep(6500); r.mark('end');
  });
}

LOG['blocked-' + WHO] = blocked; LOG['errors-' + WHO] = errs; save();
console.log(JSON.stringify({ blocked, errs: errs.length }));
await browser.close();
