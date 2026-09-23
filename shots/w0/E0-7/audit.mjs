// 데이터 관리(dataset) 실측 감사 — 읽기 전용. 산출: 이 폴더의 png + results.json
// E0-7 재촬영 사본(원본 shots/audit-0923/dataset/audit.mjs). 바뀐 것: 파괴 동작이 이제 확인 대화를 띄우므로
// 취소 · 삭제 뒤 `confirmIfAsked` 로 확인을 누른다(원본은 대화가 없다고 가정해 다음 클릭이 막혔다).
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = path.dirname(fileURLToPath(import.meta.url));
const BASE = 'http://localhost:4173/landxi/proto/';
const R = { states: {}, links: {}, roles: {}, notes: [] };
const tiny = fs.existsSync(path.join(OUT, 'fx')) || fs.mkdirSync(path.join(OUT, 'fx'));
fs.writeFileSync(path.join(OUT, 'fx', 'small.tif'), Buffer.alloc(2048, 1));
fs.writeFileSync(path.join(OUT, 'fx', 'bad.exe'), Buffer.alloc(64, 1));

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist'] });

async function ctxFor(role = 'staff', vp = { width: 1440, height: 900 }) {
  const ctx = await browser.newContext({ viewport: vp, acceptDownloads: true });
  await ctx.addInitScript((r) => { try { localStorage.setItem('lx_logged_in', '1'); localStorage.setItem('lx_role', r); } catch {} }, role);
  return ctx;
}
function wire(page, bucket) {
  bucket.console = []; bucket.failed = []; bucket.http404 = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') bucket.console.push(`${m.type()}: ${m.text()}`.slice(0, 300)); });
  page.on('pageerror', (e) => bucket.console.push('pageerror: ' + String(e).slice(0, 300)));
  page.on('requestfailed', (r) => bucket.failed.push(r.url() + ' ' + (r.failure()?.errorText || '')));
  page.on('response', (r) => { if (r.status() >= 400) bucket.http404.push(r.status() + ' ' + r.url()); });
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** 계산 스타일 측정 — 가로 넘침 · 14px 미만 글자 · 그림자/라운드/그라디언트/유리 · #CCC 글자 · 말줄임 */
async function measure(page) {
  return page.evaluate(() => {
    const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0; };
    const all = [...document.querySelectorAll('body *')].filter(vis);
    const small = [], shadow = [], radius = [], grad = [], glass = [], ccc = [], trunc = [];
    const sig = (el) => (el.id ? '#' + el.id : el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''));
    for (const el of all) {
      const cs = getComputedStyle(el);
      const ownText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      if (ownText && parseFloat(cs.fontSize) < 14) small.push(`${sig(el)} ${cs.fontSize} "${el.textContent.trim().slice(0, 24)}"`);
      if (ownText && /rgb\(204, 204, 204\)/.test(cs.color)) ccc.push(`${sig(el)} "${el.textContent.trim().slice(0, 24)}"`);
      if (cs.boxShadow !== 'none') shadow.push(sig(el) + ' ' + cs.boxShadow.slice(0, 40));
      if (el.tagName !== 'INPUT' && ['borderTopLeftRadius', 'borderTopRightRadius'].some((k) => parseFloat(cs[k]) > 0)) radius.push(sig(el) + ' ' + cs.borderTopLeftRadius);
      if (/gradient/.test(cs.backgroundImage)) grad.push(sig(el) + ' ' + cs.backgroundImage.slice(0, 50));
      if (cs.backdropFilter && cs.backdropFilter !== 'none') glass.push(sig(el));
      if (ownText && cs.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1) trunc.push(`${sig(el)} "${el.textContent.trim().slice(0, 30)}"`);
    }
    const de = document.documentElement;
    const overX = de.scrollWidth - de.clientWidth;
    const wideEls = all.filter((el) => el.getBoundingClientRect().right > de.clientWidth + 1 && !el.closest('#plate')).slice(0, 8).map(sig);
    const side = document.querySelector('#side-body');
    const sideOv = side ? { sh: side.scrollHeight, ch: side.clientHeight } : null;
    const uniq = (a) => [...new Set(a)];
    return { overX, wideEls, small: uniq(small).slice(0, 30), smallN: small.length, shadow: uniq(shadow).slice(0, 10), radius: uniq(radius).slice(0, 10), grad: uniq(grad).slice(0, 10), glass: uniq(glass), ccc: uniq(ccc).slice(0, 12), cccN: ccc.length, trunc: uniq(trunc).slice(0, 12), truncN: trunc.length, sideOv, pageH: de.scrollHeight, vh: innerHeight };
  });
}
async function shot(page, name, bucket, full = false) {
  await wait(450);
  await page.screenshot({ path: path.join(OUT, name + '.png'), fullPage: full });
  R.states[name] = { ...(await measure(page)), url: page.url().replace(BASE, '') };
  if (bucket) R.states[name].console = [...bucket.console];
}
const clickOpen = (page, id) => page.evaluate((i) => document.querySelector(`[data-open="${i}"]`)?.click(), id);
const clickAct = (page, act) => page.evaluate((a) => { const b = document.querySelector(`#side-acts .act[data-act="${a}"]`); if (b) { b.click(); return true; } return false; }, act);
const confirmIfAsked = async (page) => { const b = await page.$('.modal[role="alertdialog"] .btn--danger'); if (b) { await b.click(); await wait(300); return true; } return false; };
const txt = (page, sel) => page.evaluate((s) => document.querySelector(s)?.textContent?.trim() || null, sel);

// ═════ 1. 주 흐름 — LX 직원(staff) 1440×900 ═════
{
  const ctx = await ctxFor('staff');
  const page = await ctx.newPage();
  const B = {}; wire(page, B);
  await page.goto(BASE + 'dataset.html', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.documentElement.dataset.ds === 'ready');
  await shot(page, '01-overview-1440', B);
  R.overview = await page.evaluate(() => ({ cards: [...document.querySelectorAll('#ov .ovc')].map((a) => a.innerText.replace(/\s+/g, ' ').slice(0, 160)), rail: [...document.querySelectorAll('#rail .rail-i')].map((a) => a.textContent.trim() + ' → ' + (a.getAttribute('href') || a.dataset.action)) }));

  // 개요 → 업로드
  await page.click('#ov .ovc[data-go="upload"]');
  await shot(page, '02-upload-board', B);
  const pct0 = await txt(page, '.tile[data-id="u1"] .pv');
  await wait(3500);
  const pct1 = await txt(page, '.tile[data-id="u1"] .pv');
  R.notes.push(`idle tick u1 ${pct0} → ${pct1}`);
  // 타일 키보드 접근
  R.tileFocusable = await page.evaluate(() => [...document.querySelectorAll('.tile .th[data-open]')].map((t) => t.tabIndex >= 0 || t.tagName === 'BUTTON').filter(Boolean).length + ' / ' + document.querySelectorAll('.tile .th[data-open]').length);
  await clickOpen(page, 'u1'); await shot(page, '03-upload-sel-run', B);
  await clickAct(page, 'pause'); R.notes.push('pause → ' + await txt(page, '#say'));
  await clickAct(page, 'resume'); await clickAct(page, 'detail'); await shot(page, '04-upload-detail', B);
  await clickOpen(page, 'u3'); await clickAct(page, 'retry'); R.notes.push('retry → ' + await txt(page, '#say'));
  await clickOpen(page, 'u6'); await shot(page, '05-upload-sel-xlsx-wait', B);
  const before = await page.$$eval('#up-tiles .tile', (x) => x.length);
  await clickAct(page, 'cancel'); R.upCancelConfirm = await page.evaluate(() => !!document.querySelector('.modal[role="alertdialog"]')); await confirmIfAsked(page); R.notes.push(`cancel(confirm=${R.upCancelConfirm}) tiles ${before} → ${await page.$$eval('#up-tiles .tile', (x) => x.length)} say=${await txt(page, '#say')}`);
  // 형식 검증 · 실제 파일 업로드
  await page.setInputFiles('#file', path.join(OUT, 'fx', 'bad.exe'));
  await page.click('#up-go'); await shot(page, '06-upload-bad-exe', B);
  await page.setInputFiles('#file', path.join(OUT, 'fx', 'small.tif'));
  await shot(page, '07-upload-picked', B);
  await page.click('#up-go');
  const nUps = await page.evaluate(() => document.querySelector('#kpi-upload .big')?.textContent);
  R.notes.push('after upload KPI upload count=' + nUps + ' say=' + await txt(page, '#say'));
  await shot(page, '08-upload-after-submit', B);
  await wait(4000);
  R.newUpload = await page.evaluate(() => { const t = [...document.querySelectorAll('.tile')].find((x) => x.textContent.includes('small.tif')); return t ? t.innerText.replace(/\s+/g, ' ') : 'not on this page'; });
  // 필터 · 검색 0 · 쪽당
  await page.selectOption('#ds-filters', 'ECW'); await shot(page, '09-upload-filter-ecw', B);
  await page.selectOption('#ds-filters', '전체');
  await page.fill('#q', 'zzzz'); await wait(200);
  R.searchZero = await page.evaluate(() => ({ tiles: document.querySelectorAll('#up-tiles .tile').length, empty: !!document.querySelector('#up-empty'), toolCount: document.querySelector('#tool-c').textContent, boardRows: document.querySelectorAll('#side .pb').length }));
  await shot(page, '10-upload-search-zero', B);
  await page.fill('#q', '');
  for (const pp of [4, 6, 16]) { await page.click(`#pp button[data-pp="${pp}"]`); await shot(page, `11-upload-pp${pp}`, B); }
  await page.click('#pp button[data-pp="4"]'); await page.click('#pg-next'); R.notes.push('pager pp4 → ' + await txt(page, '#pg-n'));
  await page.click('#pp button[data-pp="8"]');

  // 디스크 증량 모달
  await page.click('#quota-open'); await shot(page, '12-quota-modal', B);
  await page.click('#m-quota button[type=submit]'); R.notes.push('quota empty submit → ' + await txt(page, '#mq-err'));
  // 포커스 트랩
  const trap = [];
  for (let i = 0; i < 14; i++) { await page.keyboard.press('Tab'); trap.push(await page.evaluate(() => !!document.activeElement.closest('#m-quota'))); }
  R.modalTrap = trap.every(Boolean) ? 'trapped' : `escapes at Tab #${trap.indexOf(false) + 1}`;
  await page.click('#mq-presets [data-gb="custom"]'); await page.fill('#mq-gb', '300'); await page.fill('#mq-why', '감사 테스트');
  await page.click('#m-quota button[type=submit]'); R.notes.push('quota save → ' + await txt(page, '#say'));

  // ── 업로드 완료
  await page.click('#to-ov'); await page.click('#ov .ovc[data-go="manage"]');
  await shot(page, '13-manage-board', B);
  await clickOpen(page, 'd4'); await page.waitForFunction(() => ['idle', 'ready'].includes(document.documentElement.dataset.plate), null, { timeout: 15000 }).catch(() => {});
  await wait(2500); await shot(page, '14-manage-d4-map', B);
  R.manageActs = {};
  for (const id of ['d1', 'd3', 'd4', 'd6', 'd7', 'd8']) {
    await clickOpen(page, id); await wait(300);
    R.manageActs[id] = await page.$$eval('#side-acts .act', (b) => b.map((x) => x.textContent.trim()));
  }
  await clickOpen(page, 'd3'); await wait(600); await shot(page, '15-manage-d3-xlsx', B);
  await clickOpen(page, 'd7'); await wait(600); await shot(page, '16-manage-d7-shp', B);
  await clickOpen(page, 'd8'); await wait(600); await shot(page, '17-manage-d8-zip', B);
  // 내려받기 — 실제 파일이 떨어지는가
  await clickOpen(page, 'd4'); await wait(300);
  const dlP = page.waitForEvent('download', { timeout: 3000 }).then((d) => d.suggestedFilename()).catch(() => null);
  const hasDl = await clickAct(page, 'download');
  R.download = { button: hasDl, file: await dlP, say: await txt(page, '#say') };
  // 발행 폼
  await clickAct(page, 'pub'); await shot(page, '18-manage-pubform', B);
  await page.fill('#pf-name', ''); await page.click('#pubform button[type=submit]'); R.notes.push('pubform empty → ' + await txt(page, '#pf-err'));
  await page.evaluate(() => document.querySelector('#pubform [data-perm="편집"][data-pf="1"]')?.click());
  await page.fill('#pf-name', '감사 발행 테스트'); await page.click('#pubform button[type=submit]');
  await wait(500);
  R.notes.push('after publish url=' + page.url().replace(BASE, '') + ' say=' + await txt(page, '#say'));
  await shot(page, '19-publishing-after-submit', B);
  await wait(5000);
  R.pubProgress = await page.evaluate(() => [...document.querySelectorAll('#pb-list .tile')].slice(0, 2).map((t) => t.innerText.replace(/\s+/g, ' ')));

  // ── 레이어 발행중
  await clickOpen(page, 'p2'); await wait(500); await shot(page, '20-publishing-p2-fail', B);
  await clickAct(page, 'crs'); await shot(page, '21-crs-modal', B);
  await page.selectOption('#mc-epsg', 'EPSG:5186'); await page.click('#m-crs button[type=submit]');
  R.notes.push('crs republish → ' + await txt(page, '#say'));
  await clickOpen(page, 'p5'); await clickAct(page, 'join'); await wait(300); R.notes.push('p5 join → modal=' + await txt(page, '.modal .modal-h h2')); await page.keyboard.press('Escape');
  await clickOpen(page, 'p6'); await clickAct(page, 'unpack'); await wait(300); R.notes.push('p6 unpack → ' + page.url().replace(BASE, '') + ' · ' + await txt(page, '#say'));
  await page.click('#kpi-publishing'); await wait(300);
  await clickOpen(page, 'p3'); await wait(300); await shot(page, '22-publishing-p3-run', B);
  await wait(4000); R.notes.push('p3 progress after 4s: ' + await txt(page, '.tile[data-id="p3"] .st'));

  // ── 아카이브
  await page.click('#to-ov'); await page.click('#ov .ovc[data-go="archive"]');
  await shot(page, '23-archive-board', B);
  await clickOpen(page, 'a1'); await wait(3500); await shot(page, '24-archive-a1-map', B);
  await clickAct(page, 'detail'); await wait(300); await shot(page, '25-archive-a1-detail', B);
  R.archiveSideOverflow = await page.evaluate(() => { const s = document.querySelector('#side-body'); return { sh: s.scrollHeight, ch: s.clientHeight }; });
  await page.fill('#memo', '감사 메모 ' + Date.now()); await wait(600); R.notes.push('memo → ' + await txt(page, '#side [data-memo-at]'));
  await clickAct(page, 'share'); await shot(page, '26-share-modal', B);
  await page.keyboard.press('Escape');
  R.notes.push('geo(공간 편집) disabled=' + await page.evaluate(() => document.querySelector('#side-acts .act[data-act="geo"]')?.disabled) + ' · ' + await txt(page, '#acts-why'));
  await wait(1500); await shot(page, '27-archive-geo', B);
  await clickOpen(page, 'a5'); await wait(3000); await shot(page, '28-archive-a5-vector', B);
  await clickOpen(page, 'a4'); await wait(600); await shot(page, '29-archive-a4-nogeo', B);
  await clickOpen(page, 'a2'); await wait(300); await clickAct(page, 'vis'); await wait(2500); R.notes.push('a2 vis → ' + await txt(page, '#say'));
  await shot(page, '30-archive-a2-show', B);
  let dialog = null; page.once('dialog', (d) => { dialog = d.message(); d.dismiss(); });
  const nA = await page.$$eval('#ar-list .tile', (x) => x.length);
  await clickOpen(page, 'a3'); await clickAct(page, 'del'); await wait(300);
  const modalVisible = await page.evaluate(() => !!document.querySelector('.modal:not([hidden])'));
  const tilesBefore = await page.$$eval('#ar-list .tile', (x) => x.length);
  await confirmIfAsked(page);
  R.deleteConfirm = { dialog, modalVisible, tilesWhileAsking: `${nA} → ${tilesBefore}`, tiles: `${nA} → ${await page.$$eval('#ar-list .tile', (x) => x.length)}`, say: await txt(page, '#say'), undo: await page.evaluate(() => !document.querySelector('#ds-undo')?.hidden) };
  await shot(page, '31-archive-after-delete', B);
  await page.selectOption('#ds-filters', '공간정보'); await page.fill('#q', 'zzz'); await wait(200);
  R.archSearchZero = await page.evaluate(() => ({ empty: !document.querySelector('#ar-empty').hidden, toolCount: document.querySelector('#tool-c').textContent, boardRows: document.querySelectorAll('#side .pb').length }));
  await shot(page, '32-archive-search-zero', B);

  // 새로고침 — 상태가 살아남는가
  await page.goto(BASE + 'dataset.html?tab=archive', { waitUntil: 'networkidle' });
  R.persist = await page.evaluate(() => ({ archive: document.querySelector('#kpi-archive .big')?.textContent, upload: document.querySelector('#kpi-upload .big')?.textContent, publishing: document.querySelector('#kpi-publishing .big')?.textContent }));

  // 링크 전수 — 레일 · 공지 · 분석/라벨 이동
  const hrefs = await page.evaluate(() => [...document.querySelectorAll('a[href]')].map((a) => a.href));
  for (const h of [...new Set(hrefs), BASE + 'analysis-ai.html', BASE + 'ai-project-label.html']) {
    try { const r = await page.request.get(h); R.links[h.replace('http://localhost:4173/', '')] = r.status(); } catch (e) { R.links[h] = 'ERR'; }
  }
  R.consoleMain = B.console; R.failedMain = B.failed; R.http4xx = [...new Set(B.http404)];
  await ctx.close();
}

// ═════ 2. 계정 3종 — 관문 · 레일 정합 ═════
for (const role of ['admin', 'staff', 'sales']) {
  const ctx = await ctxFor(role);
  const page = await ctx.newPage();
  await page.goto(BASE + 'dataset.html?tab=manage', { waitUntil: 'networkidle' }).catch(() => {});
  await wait(800);
  const landed = page.url().replace(BASE, '');
  const rail = await page.evaluate(() => [...document.querySelectorAll('#rail .rail-i[href]')].map((a) => a.getAttribute('href'))).catch(() => []);
  const denied = [];
  for (const h of rail) {
    const p2 = await ctx.newPage();
    await p2.goto(BASE + h, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await wait(500);
    if (/denied=/.test(p2.url())) denied.push(`${h} → ${p2.url().replace(BASE, '')}`);
    await p2.close();
  }
  R.roles[role] = { landed, railN: rail.length, rail, deniedFromRail: denied };
  await page.screenshot({ path: path.join(OUT, `40-role-${role}.png`) });
  await ctx.close();
}

// ═════ 3. 업로드 왕복 — 분석 서비스 → 데이터 관리 → 돌아오기 ═════
for (const role of ['staff', 'sales']) {
  const ctx = await ctxFor(role);
  const page = await ctx.newPage();
  await page.goto(BASE + 'analysis-ai.html?tab=run', { waitUntil: 'networkidle' }).catch(() => {});
  await wait(1200);
  const has = await page.$('#from-up');
  const rt = { start: page.url().replace(BASE, ''), fromUp: !!has };
  if (has) {
    await has.click(); await page.waitForLoadState('networkidle'); await wait(800);
    rt.landed = page.url().replace(BASE, '');
    rt.backBtn = await txt(page, '#to-back');
    if (rt.backBtn) {
      await page.setInputFiles('#file', path.join(OUT, 'fx', 'small.tif')).catch(() => {});
      await page.click('#up-go').catch(() => {});
      await page.screenshot({ path: path.join(OUT, `41-roundtrip-${role}-dataset.png`) });
      await page.click('#to-back'); await page.waitForLoadState('networkidle'); await wait(1200);
      rt.back = page.url().replace(BASE, '');
      rt.fileSeenBack = await page.evaluate(() => document.body.innerText.includes('small.tif'));
      await page.screenshot({ path: path.join(OUT, `42-roundtrip-${role}-back.png`) });
    } else await page.screenshot({ path: path.join(OUT, `41-roundtrip-${role}-denied.png`) });
  }
  R.roundtrip = R.roundtrip || {}; R.roundtrip[role] = rt;
  await ctx.close();
}

// ═════ 4. 뷰포트 ═════
for (const [w, h] of [[1280, 800], [1920, 1080], [390, 844]]) {
  const ctx = await ctxFor('staff', { width: w, height: h });
  const page = await ctx.newPage();
  const B = {}; wire(page, B);
  await page.goto(BASE + 'dataset.html', { waitUntil: 'networkidle' });
  await shot(page, `50-overview-${w}x${h}`, B, w === 390);
  await page.goto(BASE + 'dataset.html?tab=archive', { waitUntil: 'networkidle' });
  await clickOpen(page, 'a1'); await wait(3000);
  await shot(page, `51-archive-a1-${w}x${h}`, B, w === 390);
  await page.goto(BASE + 'dataset.html?tab=manage', { waitUntil: 'networkidle' });
  await clickOpen(page, 'd4'); await clickAct(page, 'pub'); await wait(800);
  await shot(page, `52-manage-pubform-${w}x${h}`, B, w === 390);
  await ctx.close();
}

await browser.close();
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(R, null, 1));
console.log('done');
