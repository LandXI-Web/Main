/* 소개 영상(원칙 297) 실제 화면 녹화 — 바깥 주소 · 로그인 폼 · 1920×1080 · 화면 배율 1 · 데스크톱 GPU(헤드리스 크롬 기본).
   node capture.mjs [lx|nw|kg] [장면이름,...]   → <OUT>/raw/<장면>.mp4 + .marks.json, <OUT>/raw/capture-log.json
   장면마다 한 번 미리 열어(데운 창) '불러오는 중'이 사라진 뒤 녹화를 시작한다. 저장하는 동작은 하지 않는다(쓰기 요청은 lib 이 가짜 성공으로 막음). */
import fs from 'node:fs';
import path from 'node:path';
import { chromium, frontDoor, newCtx, Rec, OUT, sleep, place, glide, at, tap, typeIn, wheel, noLoading } from './lib.mjs';

const RAW = path.join(OUT, 'raw'); fs.mkdirSync(RAW, { recursive: true });
const FR = path.join(process.env.TEMP || OUT, 'lx-video-frames');
const WHO = process.argv[2] || 'lx';
const ONLY = (process.argv[3] || '').split(',').filter(Boolean);
const want = (n) => !ONLY.length || ONLY.includes(n);
const LOGF = path.join(RAW, 'capture-log.json');
const LOG = fs.existsSync(LOGF) ? JSON.parse(fs.readFileSync(LOGF, 'utf8')) : {};
const blocked = [];
const save = () => fs.writeFileSync(LOGF, JSON.stringify(LOG, null, 1));

const APP = 'https://app.land-xi.dev', NW = 'https://namwon.land-xi.dev', KG = 'https://kgz-agri.land-xi.dev', V = '/landxi/v3/';
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

if (WHO === 'lx') {
  // ── 데우기: 메인 · 로그인 ──
  await p.goto(APP + V + 'main/', { waitUntil: 'domcontentloaded' }); await sleep(5000); await wheel(p, 5000, 60, 20); await sleep(3000);
  await p.goto(APP + V + 'login/', { waitUntil: 'domcontentloaded' }); await sleep(3000);

  await scene('s1-main', async (r) => {
    await p.goto(APP + V + 'main/', { waitUntil: 'domcontentloaded' }); await sleep(5500);
    await place(p, 1500, 900);
    await r.start(); r.mark('start');
    await sleep(800); await glide(p, 1180, 760, 900); await sleep(1600);
    r.mark('scroll');
    await wheel(p, 1800, 90, 22);                      // 지구 → 전국 지도
    r.mark('map'); await sleep(1500);
    await wheel(p, 1500, 70, 22);
    r.mark('map2'); await sleep(6500);
    r.mark('end');
  });

  await scene('s2-login', async (r) => {
    await p.goto(APP + V + 'login/', { waitUntil: 'domcontentloaded' }); await sleep(3500);
    await place(p, 1300, 700);
    await r.start(); r.mark('start'); await sleep(900);
    const idIn = p.locator('input[name=login], input[autocomplete=username], input[type=text]').first();
    await typeIn(p, idIn, 'test@lx.or.kr', 55);
    const pw = p.locator('input[type=password]').first();
    await tap(p, pw, 400); await pw.fill(process.env.LX_PW);
    r.mark('go');
    await tap(p, p.locator('button', { hasText: /^로그인$/ }).first(), 450);
    await p.waitForURL(/lx-console/, { timeout: 60000 });
    await p.waitForFunction(() => document.documentElement.dataset.consoleReady === '1', null, { timeout: 60000 }).catch(() => {});
    await noLoading(p, 20000); r.mark('dash'); await sleep(2200);
    // 대시보드 수정하기 → 공지 칸 오른쪽 끝을 왼쪽으로 줄임(다른 칸은 그대로 · 빈 자리 안내) → 옆 칸 늘리기 → 테마 미리 보기
    await tap(p, '.dg-b--edit', 700); r.mark('edit'); await sleep(1100);
    const hb = await p.evaluate(() => { const n = document.querySelector('.dg-item[data-id="notice"] .dg-rs[data-dir="e"]'); const b = n?.getBoundingClientRect(); return b ? { x: b.x + b.width / 2, y: b.y + b.height / 2 } : null; });
    if (hb) {
      await glide(p, hb.x, hb.y, 700); await sleep(250); await p.mouse.down(); r.mark('drag');
      await glide(p, hb.x - 420, hb.y, 1100); await sleep(200); await p.mouse.up(); await sleep(1300);
      const grow = p.locator('.dg-gap-b', { hasText: '옆 칸 늘리기' }).first();
      if (await grow.count()) { await at(p, grow, 700); await sleep(500); await tap(p, grow, 200); r.mark('grow'); await sleep(1400); }
    }
    await tap(p, '.dg-b--theme', 700); await sleep(600); r.mark('theme');
    for (const i of [1, 2, 3]) { await at(p, p.locator('.dg-mi--theme').nth(i), 420); await sleep(1100); }
    await glide(p, 1200, 640, 500); await sleep(500); r.mark('end');
  });

  // ── XI맵 데우기(같은 길을 한 번) ──
  if (want('s3-xi') || want('s4-chat')) {
    await p.goto(APP + V + 'xi-clean/', { waitUntil: 'domcontentloaded' }); await xiReady();
    await p.locator('.xb-k--line').first().click(); await sleep(1500);
    await p.locator('.xc-sdc', { hasText: '전북' }).click(); await sleep(1500);
    if (!(await p.locator('.xc-board-svc').count())) { await p.locator('.xc-sgc', { hasText: '남원시' }).click(); await sleep(1500); }
    await p.locator('.xc-board-svc', { hasText: '경작' }).first().click(); await sleep(2000); await noLoading(p); await sleep(3000);
  }

  await scene('s3-xi', async (r) => {
    await p.goto(APP + V + 'xi-clean/', { waitUntil: 'domcontentloaded' }); await xiReady();
    await place(p, 700, 520);
    await r.start(); r.mark('start'); await sleep(1800);
    await tap(p, '.xb-k--line', 800); r.mark('list'); await sleep(1700);
    await tap(p, p.locator('.xc-sdc', { hasText: '전북' }), 700); await sleep(1300);
    if (!(await p.locator('.xc-board-svc').count())) { await tap(p, p.locator('.xc-sgc', { hasText: '남원시' }), 600); await sleep(1300); }
    r.mark('sgg'); await at(p, p.locator('.xc-board-svc', { hasText: '경작' }).first(), 600); await sleep(500);
    await tap(p, p.locator('.xc-board-svc', { hasText: '경작' }).first(), 200); r.mark('svc');
    await sleep(1500); await noLoading(p, 30000); r.mark('loaded'); await glide(p, 900, 600, 900); await sleep(2800); r.mark('end');
  });

  await scene('s4-chat', async (r) => {
    await p.goto(APP + V + 'xi-clean/', { waitUntil: 'domcontentloaded' }); await xiReady();
    if (await p.locator('.xc-board').count()) { await p.keyboard.press('Escape'); await sleep(600); }
    await place(p, 1300, 760);
    await r.start(); r.mark('start'); await sleep(1000);
    const qs = ['남원시 경작지 현황 보여 줘', '그중 가장 큰 곳은?'];
    for (const [i, q] of qs.entries()) {
      const prev = await p.evaluate(() => document.querySelector('.xk-ans .xk-ans-t')?.textContent || '');
      await typeIn(p, '.k-ck-i', q, 95); await sleep(350); r.mark('ask' + (i + 1)); await p.keyboard.press('Enter');
      await p.waitForFunction((pv) => { const a = document.querySelector('.xk-ans:not([hidden]):not(.is-busy)'); return a && a.querySelector('.xk-ans-t') && a.querySelector('.xk-ans-t').textContent !== pv && !/답을 찾는 중/.test(a.textContent); }, prev, { timeout: 90000, polling: 50 }).catch(() => {});
      r.mark('ans' + (i + 1));
      await glide(p, 980, 640, 1200);
      await sleep(i === 0 ? 5200 : 4200);
      LOG['chat-answer-' + (i + 1)] = await p.evaluate(() => document.querySelector('.xk-ans .xk-ans-t')?.innerText || '');
    }
    r.mark('end');
  });

  if (want('s5-project')) { await p.goto(APP + V + 'lx-project/', { waitUntil: 'domcontentloaded' }); await sleep(4000); await p.goto(APP + V + 'lx-analyze/', { waitUntil: 'domcontentloaded' }); await sleep(3000); }
  await scene('s5-project', async (r) => {
    await p.goto(APP + V + 'lx-project/', { waitUntil: 'domcontentloaded' }); await noLoading(p); await sleep(2500);
    await place(p, 1500, 400);
    await r.start(); r.mark('start'); await sleep(900);
    await tap(p, p.locator('button, a', { hasText: '새 프로젝트' }).first(), 700); r.mark('new'); await sleep(1300);
    await tap(p, p.locator('.lxp-vt', { hasText: '공유 데이터에서 고르기' }), 700); await sleep(600);
    await p.waitForFunction(() => document.querySelectorAll('.lxp-pk-big').length > 2, null, { timeout: 30000 }).catch(() => {}); await sleep(1600);
    r.mark('pick');
    const big = p.locator('.lxp-pk-cw', { hasText: '드론 1cm' }).locator('.lxp-pk-big').first();
    const tgt = (await big.count()) ? big : p.locator('.lxp-pk-big').nth(1);
    await at(p, tgt, 700); await sleep(400); await tap(p, tgt, 150); r.mark('big');
    await sleep(1500); await noLoading(p, 30000); await sleep(2500);
    await glide(p, 1100, 560, 700); await wheel(p, -700, 30, 30); await sleep(2600); r.mark('zoomed');
    const close = p.locator('button', { hasText: /^닫기$/ }).last();
    if (await close.count()) await tap(p, close, 700); else await p.keyboard.press('Escape');
    await sleep(900);
    const cancel = p.locator('button', { hasText: /^취소$/ }).first();
    if (await cancel.count()) await tap(p, cancel, 700);
    await sleep(500); r.mark('analyze');
    await tap(p, p.locator('nav a, nav button', { hasText: '분석하기' }).first(), 700);
    await p.waitForURL(/lx-analyze/, { timeout: 30000 }).catch(() => {}); await noLoading(p, 20000); await sleep(1200);
    await glide(p, 900, 700, 900); await sleep(1800); r.mark('end');
  });
}

if (WHO === 'nw') {
  await frontDoor(p, NW, 'lxadmin@lx.or.kr#namwon'); await sleep(3000);
  for (const u of ['gov-select/?service=card-farm', 'gov-select/?service=card-farm&tab=stats', 'gov-fusion/?service=card-farm', 'gov-report/?service=card-farm&tab=report', 'gov-select/']) { await p.goto(NW + V + u, { waitUntil: 'domcontentloaded' }); await noLoading(p); await sleep(3500); }

  await scene('s6a-nw', async (r) => {
    await p.goto(NW + V + 'gov-select/', { waitUntil: 'domcontentloaded' }); await noLoading(p); await sleep(2500);
    await place(p, 1400, 300);
    await r.start(); r.mark('start'); await sleep(1500);
    await tap(p, p.locator('a', { hasText: '이 서비스 열기' }).nth(1), 900); r.mark('svc');
    await noLoading(p); await sleep(2600);
    await tap(p, p.locator('a', { hasText: '통계·보고서' }).first(), 800); r.mark('stats');
    await noLoading(p); await sleep(1500); await glide(p, 900, 700, 700); await wheel(p, 420, 40, 20); await sleep(2200); r.mark('end');
  });

  await scene('s6b-feed', async (r) => {
    await p.goto(NW + V + 'gov-fusion/?service=card-farm', { waitUntil: 'domcontentloaded' }); await noLoading(p); await sleep(3500);
    // 사료작물 재배 신청 대장이 이미 열려 있지 않으면 목록에서 고른다(녹화 전)
    if (!(await p.locator('.gf-emd').count())) {
      await p.evaluate(() => [...document.querySelectorAll('.gf-list-b')].find((b) => /행정정보 목록/.test(b.textContent))?.click()); await sleep(2500);
      LOG.ledgers = await p.evaluate(() => [...document.querySelectorAll('.gf-li li')].map((li) => li.innerText.replace(/\s+/g, ' ')));
      await p.evaluate(() => [...document.querySelectorAll('.gf-li li')].find((li) => /사료/.test(li.textContent))?.click()); await noLoading(p); await sleep(4500);
    }
    await place(p, 1000, 500);
    await r.start(); r.mark('start'); await sleep(2200);
    const row = p.locator('.gf-emd tbody tr').first();
    await at(p, row, 900); await sleep(400); await tap(p, row, 150); r.mark('emd'); await sleep(3200);
    await glide(p, 900, 560, 800); await sleep(1200); r.mark('end');
  });

  await scene('s6c-report', async (r) => {
    await p.goto(NW + V + 'gov-report/?service=card-farm&tab=report', { waitUntil: 'domcontentloaded' }); await noLoading(p); await sleep(3000);
    await place(p, 1100, 300);
    await r.start(); r.mark('start'); await sleep(1500);
    const sels = p.locator('select');
    const scope = sels.nth(1);
    await at(p, scope, 900); await sleep(400);
    const opt = await scope.evaluate((s) => [...s.options].find((o) => /운봉/.test(o.textContent))?.value || s.options[1]?.value);
    await scope.selectOption(opt); r.mark('scope'); await sleep(1000); await noLoading(p, 20000); await sleep(1600);
    await glide(p, 1150, 700, 800); await wheel(p, 650, 60, 22); await sleep(2600); r.mark('end');
  });
}

if (WHO === 'kg') {
  await frontDoor(p, KG, 'lxadmin@lx.or.kr#kgz-agri'); await sleep(2000);
  const ready = async () => { await p.waitForFunction(() => document.body.dataset.state === 'ready', null, { timeout: 90000 }).catch(() => {}); await p.waitForFunction(() => { const b = document.querySelector('.gl-hud .k-big'); return !b || b.dataset.state === 'ok' || b.dataset.state === 'none'; }, null, { timeout: 120000 }).catch(() => {}); await sleep(4000); };
  if (!/global/.test(p.url())) await p.goto(KG + V + 'global/', { waitUntil: 'domcontentloaded' });
  await ready(); const url = p.url();
  await scene('s7-kg', async (r) => {
    await p.goto(url, { waitUntil: 'domcontentloaded' }); await ready();
    await place(p, 1000, 560);
    await r.start(); r.mark('start'); await sleep(2500);
    await glide(p, 820, 380, 900); for (let i = 0; i < 2; i++) { await wheel(p, -700, 45, 28); await sleep(700); } await sleep(2500); r.mark('zoomed');
    await tap(p, p.locator('[role=tab]', { hasText: 'Register' }).first(), 900); r.mark('register'); await sleep(1500);
    await glide(p, 1700, 660, 900); await sleep(3000); r.mark('end');
  });
}

LOG['blocked-' + WHO] = blocked; LOG['errors-' + WHO] = errs; save();
console.log(JSON.stringify({ blocked, errs: errs.length }));
await browser.close();
