/* 구현 3차 · 영상 표준 하나로(확인 대장 15차 영상-1~3 + 확인 없이 고칠 고장) — 증거 캡처(PC 1440×900 · 휴대폰 390×844).
   로그인 = 로그인 폼 입력(kit/lint/forbidden.mjs frontDoor · 세션 주입 없음). 비밀번호는 server/.env 에서 읽고 출력하지 않는다.
   사용: node docs/superpowers/final/process/impl-3/imagery/shoot.mjs --phase before|after [--base http://localhost:4173]
         [--ecw <ECW 경로>] [--bad <깨진 파일>] [--tenant namwon] [--only request,admin,bad,approval] [--send --memo …] [--keep]
   before = 고치기 전(ECW 를 다 올린 뒤에야 '읽을 수 없음' · 관리자 공유 영상 칸)
   after  = 고친 뒤(ECW 를 정상으로 받아 읽음 · 못 읽는 파일은 고르는 순간 알림 · 관리자 '원본 지울 날짜')
   시험 영상은 사본(스크래치)만 쓴다 · 끝에서 이 캡처가 만든 올리기 묶음을 '지우고 다시 고르기'로 지운다(--keep 이면 남김). */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../../../..');
const { frontDoor } = await import(pathToFileURL(path.join(ROOT, 'landxi/v3/kit/lint/forbidden.mjs')).href);
const { chromium } = createRequire(path.join(ROOT, 'package.json'))('playwright');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const PHASE = arg('--phase', 'after');
const BASE = arg('--base', 'http://localhost:4173');
const ECW = arg('--ecw', '');
const BAD = arg('--bad', '');
const TENANT = arg('--tenant', 'namwon');
const ONLY = new Set(arg('--only', 'request,admin,bad').split(','));
const KEEP = process.argv.includes('--keep');
const SEND = process.argv.includes('--send');
const MEMO = arg('--memo', '영상 표준 확인 — ECW 의뢰');
const INGEST = arg('--ingest', '');
const REGION = arg('--region', '41117');
const IMG = path.join(HERE, 'img'); fs.mkdirSync(IMG, { recursive: true });
const log = (o) => console.log(JSON.stringify(o));

const browser = await chromium.launch();
const shot = async (page, name) => { await page.screenshot({ path: path.join(IMG, name) }); log({ shot: name }); };

/** 기관 화면 — 분석 의뢰에 파일 하나 고르기 → '이렇게 읽었습니다' 까지 */
async function request(file, prefix, wait = 900000) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await frontDoor(page, BASE, `lxadmin@lx.or.kr#${TENANT}`, 'gov');
  await page.goto(BASE + '/landxi/v3/gov-request/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.gq-sheet #drop', { timeout: 30000 });
  await page.waitForTimeout(1500);
  await page.locator('#drop input[type=file]').setInputFiles([file]);
  const t0 = Date.now();
  const state = () => page.evaluate(() => ({ ok: document.querySelector('#picked')?.innerText || document.querySelector('#read-ok')?.textContent || '',
    kv: document.querySelector('#read-kv')?.innerText || '', row: [...document.querySelectorAll('.k-uq-r .k-uq-s')].map((x) => x.textContent) }));
  try {
    await page.waitForFunction(() => {
      const ok = (document.querySelector('#picked:not([hidden])')?.innerText || '') + (document.querySelector('#read-ok')?.textContent || '');
      const row = document.querySelector('.k-uq-r[data-st="bad"] .k-uq-s')?.textContent || '';
      return /분석할 수 있습니다|분석할 수 없습니다|분석할 수 있는 영상|관할 밖|✕/.test(ok) || !!row;
    }, null, { timeout: wait });
  } catch (e) {
    log({ phase: PHASE, timeout: path.basename(file), ...(await state()) });
    await page.screenshot({ path: path.join(IMG, `_debug-${prefix}.png`) });
    throw e;
  }
  const st = await state();
  log({ phase: PHASE, file: path.basename(file), seconds: Math.round((Date.now() - t0) / 1000), ...st });
  await page.waitForTimeout(2500);                       // 미리 보기 그림 · 지도 이동
  await shot(page, `${prefix}-1440.png`);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(1500);
  await shot(page, `${prefix}-390.png`);
  if (SEND && /분석할 수 있습니다|분석할 수 있는 영상/.test(st.ok)) {        // 분석 카드 하나 골라 의뢰(결재 대기 — 승인은 하지 않는다 · GPU 0)
    await page.setViewportSize({ width: 1440, height: 900 });
    const chip = page.locator('#svcs .k-sc[role=radio]:not([aria-disabled=true]), #svcs .gq-chip:not([disabled])').first();
    await chip.waitFor({ timeout: 20000 });
    if ((await chip.getAttribute('aria-checked')) !== 'true') await chip.click();
    await page.fill('#memo', MEMO);
    await page.locator('#go').click();
    await page.waitForSelector('.gq-pane[data-pane=mine]:not([hidden])', { timeout: 30000 }).catch(() => null);
    await page.waitForTimeout(2000);
    log({ sent: MEMO, svc: await chip.textContent().catch(() => '') });
  } else if (!KEEP) {
    await page.setViewportSize({ width: 1440, height: 900 });
    const del = page.locator('#picked .gq-other, #read-drop').first();
    if (await del.isVisible().catch(() => false)) { await del.click(); await page.waitForTimeout(1500); log({ cleaned: 'draft' }); }
    else {                                                                          // 고르는 순간 막힌 줄 — 취소(x)
      const x = page.locator('.k-uq-r .x').first();
      if (await x.isVisible().catch(() => false)) { await x.click(); log({ cleaned: 'row' }); }
    }
  }
  await ctx.close();
  return st;
}

/** 관리자 결재함 — 그 의뢰(메모)의 서랍: 판단 근거(표준본 · 원본 지울 날짜) */
async function approval(prefix) {
  for (const [w, h, tail] of [[1440, 900, '1440'], [390, 844, '390']]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    await frontDoor(page, BASE, 'lxadmin@lx.or.kr', 'admin');
    await page.goto(BASE + '/landxi/v3/ops-core/#/approvals', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.oc-tbl tbody tr', { timeout: 60000 });
    const rows = page.locator('.oc-tbl tbody tr', { hasText: '분석 의뢰' });
    let found = false;
    for (let i = 0; i < await rows.count(); i++) {
      await rows.nth(i).click();
      await page.waitForSelector('.oc-sheet', { timeout: 10000 }).catch(() => null);
      if ((await page.locator('.oc-sheet').innerText().catch(() => '')).includes(MEMO)) { found = true; break; }
    }
    if (!found) { log({ approval: 'not found' }); await ctx.close(); return; }
    await page.waitForSelector('.oc-rq dl', { timeout: 30000 }).catch(() => null);
    await page.waitForTimeout(1500);
    const basis = await page.evaluate(() => [...document.querySelectorAll('.oc-rq dl dt')].map((dt) => dt.textContent + ': ' + dt.nextElementSibling?.textContent));
    log({ phase: PHASE, approval: tail, basis });
    await page.evaluate(() => { const r = document.querySelector('.oc-rq'); r?.scrollIntoView({ block: 'start' }); });
    await page.waitForTimeout(600);
    await shot(page, `${prefix}-${tail}.png`);
    await ctx.close();
  }
}

/** 관리자 화면 — 기관 서랍 '공유 영상'(영상 관리 칸) */
async function admin(prefix) {
  for (const [w, h, tail] of [[1440, 900, '1440'], [390, 844, '390']]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    await frontDoor(page, BASE, 'lxadmin@lx.or.kr', 'admin');
    await page.goto(BASE + '/landxi/v3/ops-infra/?view=tenants#/tenants', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector(`.org[data-id="${TENANT}"] .adj`, { timeout: 30000 });
    await page.locator(`.org[data-id="${TENANT}"] .adj`).click();
    await page.waitForSelector('.sh-l li, .sh-e .t-empty', { timeout: 30000 });
    await page.waitForTimeout(1500);
    const rows = await page.evaluate(() => [...document.querySelectorAll('.sh-l li .t span')].map((x) => x.textContent).slice(0, 8));
    const dated = await page.evaluate(() => [...document.querySelectorAll('.sh-l .sh-o')].map((x) => x.closest('li').innerText.replace(/\s+/g, ' ')));
    log({ phase: PHASE, admin: tail, rows, dated });
    await page.evaluate(() => { const o = document.querySelector('.sh-l .sh-o'); o?.closest('li')?.scrollIntoView({ block: 'center' }); });
    await page.waitForTimeout(500);
    await shot(page, `${prefix}-${tail}.png`);
    await ctx.close();
  }
}

/** LX 직원 데이터 올리기 — 영상 등록(서버 경로)으로 ECW 를 올리면 표준본(COG · JPEG 90)이 지도에 */
async function ingest(prefix) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await frontDoor(page, BASE, 'test@lx.or.kr', 'app');
  await page.goto(BASE + `/landxi/v3/lx-ingest/?region=${REGION}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('button:has-text("영상 등록")', { timeout: 60000 });
  await page.waitForTimeout(2500);
  if (INGEST) {
    await page.locator('button:has-text("영상 등록")').first().click();
    await page.waitForSelector('.lxi-form input[name=path]', { timeout: 20000 });
    await page.fill('.lxi-form input[name=path]', INGEST);
    await page.fill('.lxi-form input[name=year]', arg('--year', String(new Date().getFullYear())));
    await page.waitForTimeout(400);
    await shot(page, `${prefix}-sheet-1440.png`);
    await page.locator('.lxi-form button[type=submit]').click();
    await page.waitForTimeout(2500);
    log({ ingest: INGEST, toast: await page.locator('.k-toast, [role=status]').allInnerTexts().catch(() => []) });
    await page.waitForTimeout(Number(arg('--settle', '60000')));          // 영상 등록 작업(메타 · 표준으로 바꾸기 — CPU)
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('button:has-text("영상 등록")', { timeout: 60000 });
    await page.waitForTimeout(4000);
  }
  await shot(page, `${prefix}-1440.png`);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(2000);
  await shot(page, `${prefix}-390.png`);
  await ctx.close();
}

try {
  if (ONLY.has('ingest')) await ingest(`${PHASE}-ingest`);
  if (ONLY.has('request') && ECW) await request(ECW, `${PHASE}-request-ecw`);
  if (ONLY.has('bad') && BAD && PHASE === 'after') await request(BAD, 'after-request-bad', 60000);
  if (ONLY.has('admin')) await admin(`${PHASE}-admin-imagery`);
  if (ONLY.has('approval')) await approval(`${PHASE}-admin-request`);
} finally {
  await browser.close();
}
