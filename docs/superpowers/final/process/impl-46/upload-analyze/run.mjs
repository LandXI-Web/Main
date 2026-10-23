// 분석 서비스 '내 영상 올려서 분석' + 올리기 상태 창(원칙 326) — 종단 시험(로그인 폼만 · 비밀번호는 env LX_PW 또는 server/.env)
//   node docs/superpowers/final/process/impl-46/upload-analyze/run.mjs <base> <part> <file...>
//   part a = 작은 영상 한 장 → 내 영상 → 이 카드로 분석 → 지도 서비스
//   part b = 큰 영상(수 GB) — 올리는 중 다른 화면으로 옮김 → ① 손잡이(브라우저 보관함의 파일 손잡이) 저절로 이어 올리기 ② 손잡이 없음 → '파일 다시 고르기'
//   part ov = 여러 화면에서 창 펼침 · 접힘 겹침 재기
import { chromium } from 'playwright';
import { frontDoor } from '../../../../../../landxi/v3/kit/lint/forbidden.mjs';
import { MEASURE } from '../../../../../../landxi/v3/kit/lint/overlap.mjs';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const [BASE = 'https://app.land-xi.dev', PART = 'a', ...FILES] = process.argv.slice(2);
const SHOTS = path.join(HERE, 'shots'); fs.mkdirSync(SHOTS, { recursive: true });
const OUT = path.join(HERE, `run-${PART}.json`);
const out = { base: BASE, part: PART, at: new Date().toISOString(), steps: [], ov: {}, errs: [], dialogs: [] };
const T0 = Date.now();
const save = () => fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
const step = (k, extra = {}) => { out.steps.push({ k, t: Math.round((Date.now() - T0) / 100) / 10, at: new Date().toLocaleTimeString('ko-KR', { hour12: false }), ...extra }); console.log(k, JSON.stringify(extra).slice(0, 300)); save(); };
async function shot(page, n) {
  await page.screenshot({ path: path.join(SHOTS, n) });
  try { const m = await page.evaluate(MEASURE); out.ov[n] = (m.overlaps || []).map((o) => `${o.a} × ${o.b} (${o.kind} ${o.w}x${o.h})`); } catch (e) { out.ov[n] = ['measure ' + e.message]; }
  save();
}
// 큰 파일 시험(b)은 저장 한도가 넉넉한 보통 브라우저 프로필로(새 시크릿 창은 브라우저 보관함 한도가 작다)
const PROFILE = process.env.UP_PROFILE || path.join(process.env.TEMP || '.', 'lx-up-profile');
const ctx = PART === 'b' || PART === 'c' ? await chromium.launchPersistentContext(PROFILE, { viewport: { width: 1920, height: 1080 } }) : await (await chromium.launch()).newContext({ viewport: { width: 1920, height: 1080 } });
const browser = { close: () => ctx.close() };
const page = await ctx.newPage();
page.on('pageerror', (e) => out.errs.push(String(e)));
page.on('dialog', async (d) => { out.dialogs.push({ type: d.type(), at: Math.round((Date.now() - T0) / 1000) }); await d.accept(); });
const LOGIN = PART === 'ov-admin' ? 'lxadmin@lx.or.kr' : 'test@lx.or.kr';
await frontDoor(page, BASE, LOGIN, 'app');
step('login', { url: page.url() });
const chip = () => page.locator('.k-upchip .t').innerText().catch(() => '');
const rows = () => page.evaluate(() => [...document.querySelectorAll('.k-up-r')].map((r) => ({ st: r.dataset.st, name: r.querySelector('.k-up-n')?.textContent, s: r.querySelector('.k-up-s')?.textContent })));
const CARD = BASE + '/landxi/v3/lx-analyze/?card=card-farm';

if (PART === 'a') {
  await page.goto(CARD, { waitUntil: 'domcontentloaded' });
  await page.locator('.la-own-b').waitFor({ timeout: 30000 });
  await page.waitForTimeout(1500);
  await page.locator('#imagery').scrollIntoViewIfNeeded();
  await shot(page, 'a1-card.png');
  await page.locator('.la-own-b').click();
  await page.locator('.k-upg').waitFor({ timeout: 15000 });
  step('guide', { text: await page.locator('.k-upg').innerText() });
  await shot(page, 'a2-guide.png');
  await page.locator('.k-upp input[type=file]').setInputFiles(FILES[0]);
  step('picked', { file: path.basename(FILES[0]) });
  await page.locator('.k-upq-w .t-btn').waitFor({ timeout: 15000 });
  const [hostA] = await Promise.all([ctx.waitForEvent('page'), page.locator('.k-upq-w .t-btn').click()]);
  step('host', { url: hostA.url() });
  await page.bringToFront();
  await page.locator('.k-up').waitFor({ timeout: 15000 });
  await page.waitForTimeout(800);
  await shot(page, 'a3-uploading.png');
  const t1 = Date.now();
  await page.waitForFunction(() => /이 영상으로 분석하기/.test(document.querySelector('.k-up')?.innerText || ''), null, { timeout: 180000 });
  step('registered', { s: Math.round((Date.now() - t1) / 100) / 10, win: await page.locator('.k-up').innerText() });
  await page.waitForFunction(() => document.querySelector('.la-im-c .la-own'), null, { timeout: 60000 });
  await page.waitForFunction(() => /카드 조건에 맞음/.test(document.querySelector('.la-picks')?.innerText || ''), null, { timeout: 60000 }).catch(() => null);
  await page.waitForTimeout(1500);
  step('picked-own', { side: await page.locator('.la-picks').innerText(), card: await page.locator('.la-im-c[data-on="1"]').innerText().catch(() => '') });
  await page.locator('#imagery').scrollIntoViewIfNeeded();
  await shot(page, 'a4-own-picked.png');
  await page.locator('.k-up-h button', { hasText: '접기' }).click();
  await shot(page, 'a5-folded.png');
  const go = page.locator('.la-go');
  await go.click();
  await page.locator('.la-done').waitFor({ timeout: 60000 });
  step('analyze', { done: await page.locator('.la-done').innerText() });
  await shot(page, 'a6-started.png');
  const href = await page.locator('.la-done a').first().getAttribute('href');
  const job = /job=([^&]+)/.exec(href || '')?.[1];
  step('job', { job, href });
  const t2 = Date.now();
  let st = null;
  while (Date.now() - t2 < 600000) {
    st = await page.evaluate(async (j) => { const s = JSON.parse(localStorage.getItem('lx_api_session') || 'null'); const r = await fetch('/api/v1/jobs/' + j, { headers: { authorization: 'Bearer ' + s.token } }); return r.json(); }, job);
    if (['done', 'failed', 'canceled'].includes(st.state || st.job?.state)) break;
    await page.waitForTimeout(3000);
  }
  step('job-end', { state: st.state || st.job?.state, s: Math.round((Date.now() - t2) / 100) / 10, model: st.model_id, imagery: st.imagery_id, counts: st.counts });
  await page.goto(new URL(href, page.url()).href, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(9000);
  await shot(page, 'a7-map-service.png');
  step('map', { url: page.url() });
}

if (PART === 'b') {
  const BIG = FILES[0];
  const size = fs.statSync(BIG).size;
  // ① 손잡이 있는 길 — 브라우저 보관함(OPFS)의 파일 손잡이로(사람이 고를 때의 Chrome 파일 손잡이와 같은 종류 · 시험은 고르기 창을 자동으로 열 수 없어 보관함 손잡이로)
  await page.goto(CARD, { waitUntil: 'domcontentloaded' });
  await page.locator('.la-own-b').waitFor({ timeout: 30000 });
  await page.evaluate(() => { const i = document.createElement('input'); i.type = 'file'; i.id = 't-src'; document.body.append(i); });
  await page.locator('#t-src').setInputFiles(BIG);
  const t0 = Date.now();
  await page.evaluate(async () => {
    const f = document.getElementById('t-src').files[0];
    const root = await navigator.storage.getDirectory();
    const fh = await root.getFileHandle(f.name, { create: true });
    const w = await fh.createWritable(); await f.stream().pipeTo(w);
    const card = { kind: 'own', card: 'card-farm', cardName: '경작·휴경 분석서비스' };
    const U = await import('/landxi/v3/kit/uploads.js');
    await U.addUploads([{ file: await fh.getFile(), handle: fh }], card);
  });
  step('b1-start', { size, opfs_copy_s: Math.round((Date.now() - t0) / 100) / 10 });
  await page.waitForFunction(() => /올림/.test(document.querySelector('.k-up-s')?.textContent || '') && !/^0(\.0)?MB/.test(document.querySelector('.k-up-s')?.textContent || ''), null, { timeout: 120000 });
  await page.waitForTimeout(15000);
  step('b1-before-leave', { chip: await chip(), rows: await rows() });
  await shot(page, 'b1-uploading.png');
  // 다른 화면으로(메뉴 링크 누름 — 브라우저가 한 번 묻는다)
  await Promise.all([page.waitForURL(/lx-map/, { timeout: 30000 }), page.evaluate(() => { location.href = '/landxi/v3/lx-map/'; })]);
  await page.locator('.k-upchip').waitFor({ timeout: 30000 });
  await page.waitForTimeout(4000);
  step('b1-after-leave', { url: page.url(), chip: await chip(), rows: await rows() });
  const r1 = await rows();
  await page.waitForTimeout(10000);
  const r2 = await rows();
  step('b1-continues', { before: r1[0]?.s, after: r2[0]?.s });
  await shot(page, 'b2-next-screen-resumed.png');
  await page.locator('.k-upchip').click();
  await shot(page, 'b3-next-screen-folded.png');
  await page.locator('.k-upchip').click();
  // 끝까지(등록까지)
  const t3 = Date.now();
  await page.waitForFunction(() => /영상을 올렸습니다|등록하지 못했/.test(document.querySelector('.k-up')?.innerText || ''), null, { timeout: 3600000 });
  step('b1-done', { s: Math.round((Date.now() - t3) / 1000), win: await page.locator('.k-up').innerText() });
  await shot(page, 'b4-done.png');
  await page.evaluate(async () => { const root = await navigator.storage.getDirectory(); for await (const [n] of root.entries()) await root.removeEntry(n); });

  // ② 손잡이 없는 길(파일 칸으로 고름) — 옮기면 '파일 다시 고르기' → 같은 파일 → 받은 자리부터
  await page.goto(CARD, { waitUntil: 'domcontentloaded' });
  await page.locator('.la-own-b').click();
  await page.locator('.k-upp input[type=file]').setInputFiles(FILES[1] || BIG);
  await page.waitForFunction(() => [...document.querySelectorAll('.k-up-r')].some((r) => r.dataset.st === 'up' && /GB \/|MB \//.test(r.textContent)), null, { timeout: 60000 });
  await page.waitForTimeout(12000);
  step('b5-before-leave', { rows: await rows() });
  const link = page.locator('.k-rail a[href]').first();
  await Promise.all([page.waitForNavigation({ timeout: 30000 }).catch(() => null), link.click()]);
  await page.locator('.k-upchip').waitFor({ timeout: 30000 });
  await page.waitForTimeout(3000);
  step('b5-after-leave', { url: page.url(), rows: await rows(), dialogs: out.dialogs });
  await shot(page, 'b5-need-repick.png');
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.locator('.k-up-r button', { hasText: '파일 다시 고르기' }).click()]);
  await fc.setFiles(FILES[1] || BIG);
  await page.waitForTimeout(6000);
  step('b6-repicked', { rows: await rows() });
  await shot(page, 'b6-repicked.png');
  // 정리 — 시험 올리기 취소
  for (const b of await page.locator('.k-up-r button.x').all()) await b.click().catch(() => null);
  await page.waitForTimeout(1500);
  step('b7-canceled', { rows: await rows() });
}

if (PART === 'c') {
  const BIG = FILES[0];
  await page.goto(CARD, { waitUntil: 'domcontentloaded' });
  await page.locator('.la-own-b').click();
  await page.locator('.k-upp input[type=file]').setInputFiles(BIG);
  await page.locator('.k-upq-w .t-btn').waitFor({ timeout: 20000 });
  await shot(page, 'c1-picked.png');
  const [host] = await Promise.all([ctx.waitForEvent('page'), page.locator('.k-upq-w .t-btn').click()]);
  host.on('pageerror', (e) => out.errs.push('host ' + String(e)));
  host.on('dialog', async (d) => { out.dialogs.push({ type: 'host-' + d.type() }); await d.accept(); });
  await host.waitForLoadState('domcontentloaded');
  await host.setViewportSize({ width: 560, height: 720 }).catch(() => null);
  step('c-host-open', { url: host.url() });
  await host.waitForFunction(() => /올림/.test(document.querySelector('.k-up-s')?.textContent || ''), null, { timeout: 60000 });
  await host.screenshot({ path: path.join(SHOTS, 'c2-host-window.png') });
  await page.bringToFront();
  const bytes = async () => page.evaluate(() => document.querySelector('.k-upchip .t')?.textContent || '');
  const hostBytes = async () => host.evaluate(() => document.querySelector('.k-up-s')?.textContent || '').catch(() => 'host?');
  // 다른 화면 여섯 곳에서 3분 넘게 일하기(이동 · 스크롤 · 누름)
  const tour = ['/landxi/v3/lx-console/', '/landxi/v3/lx-map/', '/landxi/v3/lx-project/', '/landxi/v3/xi-clean/?region=52190', '/landxi/v3/lx-analyze/', '/landxi/v3/lx-inbox/', '/landxi/v3/lx-map/?change=job_01M5HAG21ED9RXTEQMNGTGZK74'];
  const trail = [];
  for (const [i, u] of tour.entries()) {
    await page.goto(BASE + u, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);
    await page.mouse.wheel(0, 400).catch(() => null);
    await page.waitForTimeout(22000);
    trail.push({ at: new Date().toLocaleTimeString('ko-KR', { hour12: false }), screen: u, chip: await bytes(), host: await hostBytes() });
    step('c-screen', trail[trail.length - 1]);
    if (i === 1 || i === 3 || i === 6) await shot(page, `c3-screen-${i}.png`);
  }
  out.trail = trail;
  out.dialogs_on_screens = out.dialogs.filter((d) => !String(d.type).startsWith('host-')).length;
  // 올리기 창을 실수로 닫음 → 상태 창 '올리기 창 열기' → 다시 열면 받은 자리부터(파일 칸으로 고른 파일 = 손잡이 없음 → 같은 파일 다시 고르기)
  await host.close();
  await page.waitForTimeout(8000);
  step('c-host-closed', { chip: await bytes() });
  await shot(page, 'c4-host-closed.png');
  const [host2] = await Promise.all([ctx.waitForEvent('page'), page.locator('.k-upchip').click()]);
  await host2.waitForLoadState('domcontentloaded');
  await host2.waitForTimeout(4000);
  step('c-host-reopen', { rows: await host2.evaluate(() => [...document.querySelectorAll('.k-up-r')].map((r) => r.dataset.st + ' ' + r.querySelector('.k-up-s')?.textContent)) });
  await host2.screenshot({ path: path.join(SHOTS, 'c5-host-reopen.png') });
  const btn = host2.locator('.k-up-r button', { hasText: /파일 다시 고르기|이어 올리기/ });
  if (await btn.count()) {
    const [fc] = await Promise.all([host2.waitForEvent('filechooser', { timeout: 10000 }).catch(() => null), btn.first().click()]);
    if (fc) await fc.setFiles(BIG);
  }
  await host2.waitForTimeout(8000);
  step('c-resumed', { host: await host2.evaluate(() => document.querySelector('.k-up-s')?.textContent || ''), chip: await bytes() });
  await host2.screenshot({ path: path.join(SHOTS, 'c6-host-resumed.png') });
  if (process.env.C_FINISH) {
    const t3 = Date.now();
    await page.waitForFunction(() => /올리기 끝|영상을 올렸습니다/.test(document.body.innerText), null, { timeout: 3600000 });
    step('c-done', { s: Math.round((Date.now() - t3) / 1000), chip: await bytes() });
    await shot(page, 'c7-done.png');
  } else {
    await host2.locator('.k-up-r button.x').first().click().catch(() => null);
    await host2.waitForTimeout(2000);
    step('c-canceled', { rows: await host2.evaluate(() => document.querySelectorAll('.k-up-r').length) });
  }
}

if (PART === 'ov' || PART === 'ov-admin') {
  // 올리기 창이 있는 상태로 여러 화면 — 펼침 · 접힘 겹침(작은 시험 올리기를 멈춘 채로 둔다)
  const screens = PART === 'ov-admin' ? ['/landxi/v3/ops-infra/#/shared', '/landxi/v3/ops-infra/#/infra'] : ['/landxi/v3/lx-analyze/?card=card-farm', '/landxi/v3/lx-analyze/', '/landxi/v3/lx-map/', '/landxi/v3/lx-map/?change=job_01M5HAG21ED9RXTEQMNGTGZK74', '/landxi/v3/lx-project/', '/landxi/v3/xi-clean/', '/landxi/v3/xi-clean/?region=52190'];
  await page.goto(BASE + screens[0], { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  if (PART === 'ov-admin') {
    await page.locator('.sd-up-b').click();
    await page.locator('.k-upg').waitFor({ timeout: 15000 });
    step('admin-guide', { text: await page.locator('.k-upg').innerText() });
    await shot(page, 'ov-admin-guide.png');
    await page.locator('.k-upp input[type=file]').setInputFiles(FILES[0]);
  } else {
    await page.locator('.la-own-b').click();
    await page.locator('.k-upp input[type=file]').setInputFiles(FILES[0]);
  }
  await page.locator('.k-upq-w .t-btn').waitFor({ timeout: 15000 });
  const [hostW] = await Promise.all([ctx.waitForEvent('page'), page.locator('.k-upq-w .t-btn').click()]);
  out.host = hostW.url();
  await page.locator('.k-upchip').waitFor({ timeout: 30000 });
  await page.waitForTimeout(2500);
  if (await page.locator('.k-up').isHidden()) await page.locator('.k-upchip').click().catch(() => null);
  await page.locator('.k-up-r button', { hasText: '멈춤' }).first().click().catch(() => null);
  for (const [i, s] of screens.entries()) {
    for (const mob of [false, true]) {
      if (mob) await page.setViewportSize({ width: 390, height: 844 }); else await page.setViewportSize({ width: 1920, height: 1080 });
      await page.goto(BASE + s, { waitUntil: 'domcontentloaded' });
      await page.locator('.k-upchip').waitFor({ timeout: 30000 }).catch(() => null);
      await page.waitForTimeout(3500);
      const tag = `${PART}-${i}${mob ? '-m' : ''}`;
      const blocked = await page.locator('.k-upchip[data-blocked]').count();
      if (!blocked && await page.locator('.k-up').isHidden()) await page.locator('.k-upchip').click().catch(() => null);
      await page.waitForTimeout(2500);                                   // 자리 고르기(2초마다) 뒤
      out.blocked = { ...(out.blocked || {}), [tag]: !!(await page.locator('.k-upchip[data-blocked]').count()) };
      await shot(page, `${tag}-open.png`);
      await page.locator('.k-upchip').click().catch(() => null);
      await page.waitForTimeout(400);
      await shot(page, `${tag}-folded.png`);
      await page.locator('.k-upchip').click().catch(() => null);
      // 대화창을 연 채로도 한 번(PC)
      if (!mob && await page.locator('.k-chat-fab').isVisible().catch(() => false)) {
        await page.locator('.k-chat-fab').click(); await page.waitForTimeout(600);
        await shot(page, `${tag}-chat.png`);
        await page.locator('.k-chat-fab').click().catch(() => null);
      }
    }
  }
  await page.setViewportSize({ width: 1920, height: 1080 });
  if (await page.locator('.k-up').isHidden()) await page.locator('.k-upchip').click().catch(() => null);
  await page.waitForTimeout(400);
  for (const b of await page.locator('.k-up-r button.x').all()) await b.click().catch(() => null);
  await page.waitForTimeout(1500);
  step('ov-cleanup', { rows: await rows() });
}
out.ms = Date.now() - T0;
save();
await browser.close();
