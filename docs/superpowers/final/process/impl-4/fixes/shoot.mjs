/* 구현 4차 · 바로 고침(구현 확인 3차 Q-4 · M-2 · FR-1 미이행분 · 기관-6 ⓐ) — 증거 캡처(PC 1440×900 · 휴대폰 390×844).
   로그인 = 로그인 폼 입력(kit/lint/forbidden.mjs frontDoor · 세션 주입 없음). 비밀번호는 server/.env 에서 읽고 출력하지 않는다.
   사용: node docs/superpowers/final/process/impl-4/fixes/shoot.mjs --part gov|ingest|inbox|ingest390 [--base http://localhost:4173] [--pre ext-]
         [--sheet <도엽 사본 .tif>] [--region 46710] [--bad <못 읽는 파일> ...] [--send] [--service dp-…]
   gov       기관 분석 요청 — 못 읽는 파일 두 개를 한 번에 고르기 → 창 하나(M-2) → 'LX 담당자에게 보내 확인받기'(--send 이면 보냄 · 기관-6 ⓐ)
   ingest    LX 직원 데이터 올리기 → 영상 등록 — 도엽 사본 + 위치 파일 끌어 놓기 → 멈춤 · 이어 올리기 → 저절로 등록 → 지역 '영상 있음' → 새로 고침 뒤에도
   ingest390 같은 화면 휴대폰 — 영상 있음 · 시트 · 못 읽는 파일 창
   inbox     LX 요청함 — 기관이 보낸 '못 읽는 파일' 한 건
   시험 파일은 사본(시험 칸 · 스크래치)만 쓴다. 이 캡처가 만든 영상 · 요청은 끝에 따로 지운다(공유 영상 목록에 남기지 않는다). */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../../../..');
const { frontDoor } = await import(pathToFileURL(path.join(ROOT, 'landxi/v3/kit/lint/forbidden.mjs')).href);
const { chromium } = createRequire(path.join(ROOT, 'package.json'))('playwright');
const argv = process.argv;
const arg = (k, d) => { const i = argv.indexOf(k); return i > 0 ? argv[i + 1] : d; };
const args = (k) => argv.flatMap((v, i) => (v === k ? [argv[i + 1]] : []));
const PART = arg('--part', 'gov');
const BASE = arg('--base', 'http://localhost:4173');
const PRE = arg('--pre', '');
const SHEET = arg('--sheet', '');
const REGION = arg('--region', '46710');
const BAD = args('--bad');
const SEND = argv.includes('--send');
const SERVICE = arg('--service', '');
const IMG = path.join(HERE, 'img'); fs.mkdirSync(IMG, { recursive: true });
const log = (o) => console.log(JSON.stringify(o));
const browser = await chromium.launch();
const SLOW = !/localhost|127\.0\.0\.1/.test(BASE);                 // 바깥 주소(터널)는 느릴 때가 있다 — 기다림을 넉넉히
const newPage = async (ctx) => { const p = await ctx.newPage(); if (SLOW) { p.setDefaultTimeout(90000); p.setDefaultNavigationTimeout(120000); } return p; };
const shot = async (page, name) => { await page.screenshot({ path: path.join(IMG, PRE + name) }); log({ shot: PRE + name }); };
const modalText = (page) => page.evaluate(() => document.querySelector('.k-md.k-fp-md')?.innerText || '');

async function lxPage(w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await newPage(ctx);
  await frontDoor(page, BASE, 'test@lx.or.kr', 'app');
  return { ctx, page };
}

/* ── 기관 분석 요청 — 못 읽는 파일 창 ─────────────────────────────── */
async function gov() {
  for (const [w, h] of [[1440, 900], [390, 844]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await newPage(ctx);
    await frontDoor(page, BASE, 'lxadmin@lx.or.kr#namwon', 'gov');
    const org = SLOW ? new URL(page.url()).origin : BASE;                 // 바깥 주소 = 기관 주소({기관}.land-xi.dev)에 세션이 있다
    await page.goto(org + '/landxi/v3/gov-request/' + (SERVICE ? '?service=' + SERVICE : ''), { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#drop input[type=file]', { state: 'attached', timeout: SLOW ? 240000 : 30000 });
    await page.waitForTimeout(2500);
    const rows0 = await page.locator('.k-uq-r').count();
    await page.locator('#drop input[type=file]').setInputFiles(BAD);
    await page.waitForSelector('.k-md.k-fp-md', { timeout: SLOW ? 240000 : 20000 });
    await page.waitForTimeout(700);
    const rows = await page.locator('.k-uq-r').count();
    log({ part: 'gov', w, modal: await modalText(page), rows_before: rows0, rows_after: rows });
    await shot(page, `after-gov-bad-${w}.png`);
    await page.locator('.k-fp-x').click();                                   // LX 담당자에게 보내 확인받기
    await page.waitForFunction(() => /받는 사람\s*\S/.test(document.querySelector('.k-fp-md')?.innerText || '') && !/…/.test(document.querySelector('.k-fp-to b')?.textContent || '…'), null, { timeout: SLOW ? 240000 : 15000 }).catch(() => null);
    await page.locator('.k-fp-md input.t-input').fill('드론 업체에서 받은 파일입니다');
    log({ part: 'gov-send', w, modal: await modalText(page) });
    await shot(page, `after-gov-send-${w}.png`);
    if (SEND && w === 1440) {
      await page.locator('.k-fp-md button[type=submit]').click();
      await page.waitForFunction(() => /보냈습니다/.test(document.querySelector('.k-fp-md')?.innerText || ''), null, { timeout: SLOW ? 240000 : 20000 });
      await page.waitForTimeout(500);
      log({ part: 'gov-sent', modal: await modalText(page) });
      await shot(page, `after-gov-sent-${w}.png`);
      await page.locator('.k-fp-md .k-fp-a .t-btn:not(.t-btn--2)').click();   // 내가 보낸 요청 보기
      await page.waitForSelector('.k-rv-conv, .k-rv-list', { timeout: SLOW ? 240000 : 20000 });
      await page.waitForTimeout(1500);
      log({ part: 'gov-sentbox', text: (await page.locator('.k-rv-dr').innerText().catch(() => '')).slice(0, 300) });
      await shot(page, `after-gov-sentbox-${w}.png`);
    }
    await ctx.close();
  }
}

/* ── LX 요청함 ─────────────────────────────────────────────── */
async function inbox() {
  for (const [w, h] of [[1440, 900], [390, 844]]) {
    const { ctx, page } = await lxPage(w, h);
    await page.goto(BASE + '/landxi/v3/lx-inbox/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.ib-row, .ib-where', { timeout: SLOW ? 240000 : 30000 }).catch(() => null);
    await page.waitForTimeout(2000);
    const row = page.locator('.ib-where', { hasText: '못 읽는 파일' }).first();
    log({ part: 'inbox', w, found: await row.count(), first: (await page.locator('.ib-row').first().innerText().catch(() => '')).slice(0, 200) });
    if (w === 1440 && await row.count()) { await row.click(); await page.waitForTimeout(2500); }
    await shot(page, `after-inbox-${w}.png`);
    await ctx.close();
  }
}

/* ── LX 데이터 올리기 → 영상 등록 ─────────────────────────────── */
async function openRegion(page) {
  await page.goto(BASE + `/landxi/v3/lx-ingest/?region=${REGION}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.lxi-dr .lxi-img', { timeout: SLOW ? 240000 : 40000 });
  await page.waitForFunction(() => !document.querySelector('.lxi-img .lxi-skel'), null, { timeout: SLOW ? 240000 : 40000 });
  await page.waitForTimeout(2500);
  return page.locator('.lxi-img').innerText();
}
async function ingest() {
  const { page } = await lxPage(1440, 900);
  const before = await openRegion(page);
  log({ part: 'ingest', region: REGION, imagery_before: before });
  await shot(page, 'after-ingest-region-before-1440.png');
  await page.locator('.lxi-acts button', { hasText: '영상 등록' }).click();
  await page.waitForSelector('.lxi-sheet .lxi-up .k-drop', { timeout: SLOW ? 240000 : 20000 });
  await page.waitForTimeout(800);
  await shot(page, 'after-ingest-sheet-1440.png');
  const t0 = Date.now();
  await page.locator('.lxi-up input[type=file]').setInputFiles([SHEET, ...['.tfw', '.prj'].map((e) => SHEET.replace(/\.tif$/i, e)).filter((f) => fs.existsSync(f))]);
  // 멈춤 → 이어 올리기(--pause · 큰 파일일 때)
  if (argv.includes('--pause')) {
  await page.waitForFunction(() => /올리는 중 \d/.test(document.querySelector('.lxi-up')?.innerText || ''), null, { timeout: SLOW ? 240000 : 30000 });
  await page.waitForTimeout(400);
  const pause = page.locator('.k-uq-r', { hasText: '.tif' }).locator('.k-uq-a button:not(.x)');
  await pause.click();
  await page.waitForFunction(() => /멈춤 —/.test(document.querySelector('.lxi-up')?.innerText || ''), null, { timeout: SLOW ? 240000 : 15000 });
  await page.waitForTimeout(400);
  log({ part: 'ingest-paused', rows: await page.locator('.lxi-up .k-uq-l').innerText() });
  await shot(page, 'after-ingest-paused-1440.png');
  await page.waitForTimeout(1500);
  await pause.click();                                                      // 이어 올리기
  await page.waitForFunction(() => /올리는 중|다 올렸습니다|살펴보고/.test(document.querySelector('.lxi-up')?.innerText || ''), null, { timeout: SLOW ? 240000 : 15000 });
  await page.waitForTimeout(1200);
  await shot(page, 'after-ingest-resumed-1440.png');
  }
  await page.waitForFunction(() => !document.querySelector('.lxi-sheet') || !document.querySelector('.lxi-sheet')?.isConnected
    || /살펴보고 등록하는 중/.test(document.querySelector('.lxi-up')?.innerText || ''), null, { timeout: 900000 });
  await page.waitForFunction(() => /촬영 연도 모름|\d{4} /.test(document.querySelector('.lxi-img')?.innerText || '') && !document.querySelector('.lxi-img .lxi-skel'), null, { timeout: SLOW ? 720000 : 120000 });
  await page.waitForTimeout(1500);
  log({ part: 'ingest-done', seconds: Math.round((Date.now() - t0) / 1000), imagery_after: await page.locator('.lxi-img').innerText(),
    toast: await page.locator('.k-toast').allInnerTexts().catch(() => []) });
  await shot(page, 'after-ingest-registered-1440.png');
  // 영상 등록 작업(표준본)이 끝나면 지도에 — 새로 고침 뒤에도 그대로
  await page.waitForTimeout(25000);
  const again = await openRegion(page);
  await page.waitForTimeout(4000);
  log({ part: 'ingest-reload', imagery: again });
  await shot(page, 'after-ingest-reload-1440.png');
}
async function ingest390() {
  const { page } = await lxPage(390, 844);
  const im = await openRegion(page);
  log({ part: 'ingest390', imagery: im });
  await shot(page, 'after-ingest-region-390.png');
  await page.locator('.lxi-acts button', { hasText: '영상 등록' }).click();
  await page.waitForSelector('.lxi-sheet .lxi-up .k-drop', { timeout: SLOW ? 240000 : 20000 });
  await page.waitForTimeout(900);
  await shot(page, 'after-ingest-sheet-390.png');
  if (BAD.length) {
    await page.locator('.lxi-up input[type=file]').setInputFiles(BAD);
    await page.waitForSelector('.k-md.k-fp-md', { timeout: SLOW ? 240000 : 20000 });
    await page.waitForTimeout(700);
    log({ part: 'ingest390-bad', modal: await modalText(page) });
    await shot(page, 'after-ingest-bad-390.png');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(900);
    await shot(page, 'after-ingest-bad-1440.png');
  }
}

if (PART === 'gov') await gov();
else if (PART === 'inbox') await inbox();
else if (PART === 'ingest') await ingest();
else if (PART === 'ingest390') await ingest390();
await browser.close();
