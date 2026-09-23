// 지도 서비스(XI맵)·통계·보고서·표류 예측 — 읽기 전용 실측 감사 (2026-09-23)
// node shots/w0/E0-5/audit.mjs
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = path.dirname(fileURLToPath(import.meta.url));
const BASE = 'http://localhost:4173/landxi/proto/';
const R = { pages: {}, steps: [], roles: {}, downloads: [], links: {} };
const log = (k, v) => { R.steps.push({ k, v }); console.log('·', k, typeof v === 'string' ? v : JSON.stringify(v).slice(0, 300)); };

const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

async function ctx(role = 'staff', vp = { width: 1440, height: 900 }) {
  const c = await browser.newContext({ viewport: vp, acceptDownloads: true });
  await c.addInitScript((r) => { try { localStorage.setItem('lx_logged_in', '1'); if (r) localStorage.setItem('lx_role', r); else localStorage.removeItem('lx_role'); } catch {} }, role);
  return c;
}
function watch(page, key) {
  const w = { console: [], pageerror: [], failed: [], http4xx: [] };
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') w.console.push(`${m.type()}: ${m.text().slice(0, 240)}`); });
  page.on('pageerror', (e) => w.pageerror.push(e.message.slice(0, 240)));
  page.on('requestfailed', (r) => w.failed.push(`${r.failure()?.errorText} ${r.url().slice(0, 160)}`));
  page.on('response', (r) => { if (r.status() >= 400) w.http4xx.push(`${r.status()} ${r.url().slice(0, 160)}`); });
  R.pages[key] = w; return w;
}
const shot = async (page, name, full = false) => { await page.screenshot({ path: path.join(OUT, name + '.png'), fullPage: full }); log('shot', name); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// 계산 스타일 측정 — 작은 글자, 법전 위반, 가로 넘침
async function measure(page, key) {
  const m = await page.evaluate(() => {
    const out = { overflowX: document.documentElement.scrollWidth - innerWidth, small: [], shadow: [], radius: [], gradient: [], blur: [], filledBlue: [] };
    const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && r.bottom > 0 && r.top < innerHeight * 3; };
    const sel = (el) => (el.id ? '#' + el.id : el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''));
    const inGL = (el) => el.closest('.maplibregl-canvas-container,.maplibregl-ctrl-attrib');
    for (const el of document.querySelectorAll('body *')) {
      if (!vis(el) || inGL(el)) continue;
      const s = getComputedStyle(el);
      const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      if (own && parseFloat(s.fontSize) < 14) out.small.push(`${sel(el)} ${s.fontSize} "${el.textContent.trim().slice(0, 30)}"`);
      if (s.boxShadow && s.boxShadow !== 'none') out.shadow.push(`${sel(el)} ${s.boxShadow.slice(0, 60)}`);
      const rad = ['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomLeftRadius', 'borderBottomRightRadius'].map((k) => parseFloat(s[k]) || 0);
      if (Math.max(...rad) > 0) out.radius.push(`${sel(el)} ${s.borderRadius}`);
      if (/gradient/.test(s.backgroundImage)) out.gradient.push(`${sel(el)} ${s.backgroundImage.slice(0, 70)}`);
      if (s.backdropFilter && s.backdropFilter !== 'none') out.blur.push(`${sel(el)} ${s.backdropFilter}`);
      if ((el.tagName === 'BUTTON' || el.tagName === 'A') && /rgb\(0, 109, 247\)/.test(s.backgroundColor)) out.filledBlue.push(sel(el));
    }
    for (const k of ['small', 'shadow', 'radius', 'gradient', 'blur', 'filledBlue']) { out[k + 'N'] = out[k].length; out[k] = [...new Set(out[k])].slice(0, 25); }
    return out;
  });
  (R.pages[key] ||= {}).measure = m;
  log('measure ' + key, { ox: m.overflowX, small: m.smallN, shadow: m.shadowN, radius: m.radiusN, grad: m.gradientN, blur: m.blurN, blue: m.filledBlueN });
  return m;
}
async function mapReady(page, t = 25000) {
  try { await page.waitForFunction(() => document.querySelector('#map-a')?.dataset.map === 'ready' || window.__lxMap?.A?.loaded?.(), null, { timeout: t }); return true; }
  catch { log('mapReady timeout', page.url()); return false; }
}
async function tryClick(page, selector, label, after = 500) {
  const el = page.locator(selector).first();
  if (!(await el.count())) { log('MISSING ' + label, selector); return false; }
  try { await el.click({ timeout: 4000 }); await wait(after); log('click ' + label, 'ok'); return true; }
  catch (e) { log('CLICK-FAIL ' + label, e.message.split('\n')[0]); return false; }
}

/* ══ 0. 역할 관문 — 세 계정으로 ximap 진입 ═══════════════════════════ */
for (const role of ['admin', 'staff', 'sales', null]) {
  const c = await ctx(role); const p = await c.newPage();
  for (const f of ['ximap.html', 'stats-standard.html', 'report-standard.html', 'report-standard-issue.html', 'map-drift.html']) {
    await p.goto(BASE + f); await wait(1200);
    (R.roles[role || 'none(default)'] ||= {})[f] = p.url().replace(BASE, '');
  }
  await c.close();
}
log('roles', R.roles);

/* ══ 1. ximap — staff 1440 ══════════════════════════════════════════ */
{
  const c = await ctx('staff'); const p = await c.newPage(); watch(p, 'ximap');
  await p.goto(BASE + 'ximap.html'); await mapReady(p); await wait(2500);
  await shot(p, 'x01-ximap-initial-1440');
  await measure(p, 'ximap');
  // 레이어 탭 / 목록 / 준비중
  await tryClick(p, '#t-layer', '레이어 탭'); await shot(p, 'x02-layer-tab');
  await tryClick(p, '#l-all', '모두 접기/열기'); await tryClick(p, '#t-result', '결과 탭');
  await tryClick(p, '#l-list', '목록 보기'); await shot(p, 'x03-list-modal');
  await p.keyboard.press('Escape'); await wait(300);
  await tryClick(p, '#soon-t', '준비중 보기'); await shot(p, 'x04-soon-modal');
  await p.keyboard.press('Escape'); await wait(300);
  await tryClick(p, '[data-own="shared"]', '공유받은것'); await tryClick(p, '[data-own="mine"]', '내것');
  // 첫 결과 레이어 켜기
  const n = await p.locator('#l-b input[data-layer]').count(); log('result layer checkboxes', n);
  await p.locator('#l-b input[data-layer]').first().check().catch((e) => log('check fail', e.message));
  await wait(3500); await shot(p, 'x05-layer-on');
  await measure(p, 'ximap-layer-on');
  // 투명도
  const rng = p.locator('input[data-op]').first();
  if (await rng.count()) { await rng.fill('30'); await wait(400); log('opacity', await p.locator('.mc-op .v').first().innerText()); }
  await tryClick(p, '#l-b .mc-x[data-menu]', '레이어 더보기'); await shot(p, 'x06-layer-menu'); await p.keyboard.press('Escape'); await wait(300);
  await tryClick(p, '#t-view', '보기 설정'); await shot(p, 'x07-view-settings'); await p.keyboard.press('Escape'); await wait(300);
  // 도구
  for (const t of ['basemap', 'measure', 'draw', 'lx']) {
    await tryClick(p, `.mw-tools [data-tool="${t}"]`, 'tool ' + t, 700); await shot(p, `x08-tool-${t}`);
  }
  // 배경지도 → 일반
  await tryClick(p, '.mw-tools [data-tool="basemap"]', 'basemap reopen');
  await tryClick(p, '[data-base="base"]', '배경 일반', 2000); await shot(p, 'x09-base-general');
  await tryClick(p, '.mw-tools [data-tool="basemap"]', 'basemap reopen2'); await tryClick(p, '[data-base="satellite"]', '배경 위성', 1500);
  // 측정 거리 실제 동작
  await tryClick(p, '.mw-tools [data-tool="measure"]', 'measure open');
  await tryClick(p, '[data-msr="distance"]', '거리 측정');
  const box = await p.locator('#map-a').boundingBox({ timeout: 5000 }).catch(() => null);
  if (box) {
    await p.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.4); await wait(200);
    await p.mouse.click(box.x + box.width * 0.55, box.y + box.height * 0.5); await wait(200);
    await p.mouse.dblclick(box.x + box.width * 0.6, box.y + box.height * 0.6); await wait(600);
  }
  await shot(p, 'x10-measure-distance');
  log('measure tips', await p.locator('.mw-tip').allInnerTexts());
  await p.keyboard.press('Escape'); await wait(300); await p.keyboard.press('Escape'); await wait(300);
  // AOI
  await tryClick(p, '.mw-tools [data-tool="aoi"]', 'aoi'); await shot(p, 'x11-aoi');
  if (box) { for (const [fx, fy] of [[0.4, 0.4], [0.5, 0.4], [0.5, 0.5]]) { await p.mouse.click(box.x + box.width * fx, box.y + box.height * fy); await wait(150); } await p.mouse.dblclick(box.x + box.width * 0.42, box.y + box.height * 0.52); await wait(400); }
  await tryClick(p, '#g-save', 'aoi 저장'); await shot(p, 'x12-aoi-saved');
  log('toast after aoi', await p.locator('.toast, [role="status"]').allInnerTexts().catch(() => []));
  // 검색
  await tryClick(p, '.mw-tools [data-tool="search"]', '검색 도구', 800); await shot(p, 'x13-search');
  await tryClick(p, '[data-srt="road"]', '검색 도로명탭');
  await tryClick(p, '[data-go]', '검색결과 클릭', 1500); await shot(p, 'x14-search-go');
  // 임의 검색어
  const fi = p.locator('#find'); if (await fi.count()) { await fi.fill('운봉읍 123'); await fi.press('Enter'); await wait(800); await shot(p, 'x15-search-other'); log('search other', (await p.locator('.srp').innerText().catch(() => '')).slice(0, 200)); }
  await tryClick(p, '#sr-close', '검색 닫기', 800);
  // 시점 스트립
  await tryClick(p, '[data-epoch]', '시점 1', 2500); await shot(p, 'x16-epoch');
  await tryClick(p, '[data-epoch]', '시점 해제', 800);
  // 범례 숨김
  await tryClick(p, '[data-cls]', '범례 클래스 숨김', 800); await shot(p, 'x17-legend-hidden');
  await tryClick(p, '[data-cls]', '범례 되돌림', 500);
  // 하단 표
  await tryClick(p, '#mb-open', '표 펼치기', 1500); await shot(p, 'x18-table-open');
  await measure(p, 'ximap-table');
  await tryClick(p, '[data-itab="base"]', '기본정보', 500);
  await tryClick(p, '#pager button:has-text("2")', '페이지 2', 1200);
  await tryClick(p, '[data-ttab="space"]', '공간정보탭', 800); await shot(p, 'x19-tab-space');
  await tryClick(p, '[data-ttab="region"]', '지역구분탭', 2500); await shot(p, 'x20-tab-region');
  await tryClick(p, '#tbody tr', '지역 행', 1500); await shot(p, 'x21-region-row');
  await tryClick(p, '[data-ttab="result"]', '분석결과탭', 1500);
  await tryClick(p, '#tbody tr', '결과 행 → info', 2000); await shot(p, 'x22-info-side');
  await measure(p, 'ximap-info');
  await tryClick(p, '[data-act="doing"]', '조치중', 500);
  await p.locator('#memo').fill('현장 확인 예정').catch(() => {});
  await tryClick(p, '#act-save', '조치 저장', 600); await shot(p, 'x23-act-saved');
  // 지도 클릭으로 피처 선택
  if (box) { await p.mouse.click(box.x + box.width / 2, box.y + box.height / 2); await wait(800); }
  // 내보내기 → 서약 → 실제 다운로드?
  await tryClick(p, '#export', '내보내기', 700); await shot(p, 'x24-pledge');
  await tryClick(p, '.modal-f .btn', '서약 빈 제출', 500); await shot(p, 'x25-pledge-errors');
  await p.locator('#pl-ok').check().catch(() => {}); await p.locator('#pl-name').fill('감사 테스트').catch(() => {}); await p.locator('#pl-purpose').fill('점검').catch(() => {});
  const dlP = p.waitForEvent('download', { timeout: 4000 }).then((d) => d.suggestedFilename()).catch(() => null);
  await tryClick(p, '.modal-f .btn', '서약 제출', 1200);
  const dl = await dlP; R.downloads.push({ where: 'ximap 내보내기', file: dl }); log('download ximap export', dl);
  await shot(p, 'x26-after-export');
  // 통계 이동 버튼
  await p.goto(BASE + 'ximap.html?on=namwon-farmland-2025&fold=0'); await mapReady(p); await wait(2500);
  await tryClick(p, '#open-side', '분석 결과/성과 버튼', 800); await shot(p, 'x27-open-side-empty');
  // 보기 방식 겹쳐/나란히
  await tryClick(p, '#page-head .ptabs a[data-mode="overlay"]', '겹쳐보기', 4000); await shot(p, 'x28-overlay');
  await measure(p, 'ximap-overlay');
  const sw = p.locator('#swipe-h');
  if (await sw.count()) { const b = await sw.boundingBox(); if (b) { await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await p.mouse.down(); await p.mouse.move(b.x - 250, b.y + 5, { steps: 8 }); await p.mouse.up(); await wait(500); await shot(p, 'x29-overlay-swiped'); } }
  await tryClick(p, '.mv[data-ep]:not([aria-selected="true"])', '시점 교체', 2500); await shot(p, 'x30-overlay-epoch');
  await tryClick(p, '#ch-base', '기준 변경 링크', 600);
  await tryClick(p, '#page-head .ptabs a[data-mode="parallel"]', '나란히보기', 4000); await shot(p, 'x31-parallel');
  // 나란히 = 동기화 여부
  const zA = await p.evaluate(() => window.__lxMap?.A?.getZoom()); await tryClick(p, '[data-z="in"][data-side="좌"]', '좌 확대', 1200);
  const zA2 = await p.evaluate(() => [window.__lxMap?.A?.getZoom(), window.__lxMap?.B?.getZoom()]); log('parallel zoom', { before: zA, after: zA2 });
  // 비교 모드의 도구 버튼(8개) — 핸들러 없음 여부
  const cmpTools = await p.locator('#ov-a .mw-tools button').count(); log('compare tool buttons', cmpTools);
  const before = await p.content(); await p.locator('#ov-a .mw-tools button').nth(1).click().catch(() => {}); await wait(500); const after = await p.content();
  log('compare tool click changes DOM', before !== after);
  await shot(p, 'x32-parallel-toolclick');
  // 레일 링크 · 모든 a[href] 확인
  await p.goto(BASE + 'ximap.html'); await wait(2000);
  const hrefs = await p.$$eval('a[href]', (as) => [...new Set(as.map((a) => a.getAttribute('href')))]);
  R.links.ximap = hrefs;
  await c.close();
}

/* ══ 2. stats-standard ═══════════════════════════════════════════════ */
{
  const c = await ctx('staff'); const p = await c.newPage(); watch(p, 'stats');
  await p.goto(BASE + 'stats-standard.html'); await mapReady(p); await wait(3000);
  await shot(p, 's01-stats-1440'); await measure(p, 'stats');
  await tryClick(p, '.dw-bars [data-bar]', '막대 클릭', 1500); await shot(p, 's02-bar');
  await tryClick(p, '#st-tb tr', '표 행', 1500);
  await tryClick(p, '[data-tab="class"]', '클래스별', 800); await shot(p, 's03-class');
  await tryClick(p, '#st-tb tr[data-cls]', '클래스 행', 800);
  await tryClick(p, '[data-tab="region"]', '지역별', 800);
  const radios = p.locator('.dw-basis input'); log('basis radios', await radios.count());
  await radios.nth(1).check().catch(() => {}); await wait(300);
  await tryClick(p, '#st-run', '통계 보기', 800); await shot(p, 's04-basis-seed');
  log('stats after seed basis — big numbers', (await p.locator('.dw-big').innerText().catch(() => '')).slice(0, 120));
  await tryClick(p, '#st-more', '더 보기', 800); await shot(p, 's05-find-modal');
  await tryClick(p, '.modal [data-q="3"]', '3개월칩', 300);
  await tryClick(p, '.modal #fd-go', '찾기 검색', 500);
  await p.keyboard.press('Escape'); await wait(300);
  await p.locator('#st-f select[name="emd"]').selectOption({ index: 2 }).catch(() => {});
  await tryClick(p, '#st-f .btn-br', '조회', 1500); await shot(p, 's06-filter-emd');
  await tryClick(p, '#st-dl', '엑셀 다운로드', 600);
  await p.locator('#pl-ok').check().catch(() => {}); await p.locator('#pl-name').fill('x').catch(() => {}); await p.locator('#pl-purpose').fill('y').catch(() => {});
  const dlP = p.waitForEvent('download', { timeout: 4000 }).then((d) => d.suggestedFilename()).catch(() => null);
  await tryClick(p, '.modal-f .btn', '엑셀 서약 제출', 1200);
  R.downloads.push({ where: 'stats 엑셀', file: await dlP });
  await tryClick(p, '#st-x', '서랍 닫기', 1500); await shot(p, 's07-closed');
  log('stats url after close', p.url());
  // 빈 상태
  await p.goto(BASE + 'stats-standard.html?on=none'); await wait(3000); await shot(p, 's08-stats-empty');
  await c.close();
}

/* ══ 3. report-standard-issue / report-standard ══════════════════════ */
{
  const c = await ctx('staff'); const p = await c.newPage(); watch(p, 'report-issue');
  await p.goto(BASE + 'report-standard-issue.html'); await mapReady(p); await wait(3000);
  await shot(p, 'r01-issue-1440'); await measure(p, 'report-issue');
  await p.locator('#rp-title').fill('').catch(() => {});
  await p.locator('#rp-cls-all').uncheck().catch(() => {});
  await p.locator('#rp-emd-all').check().catch(() => {}); await p.locator('#rp-emd-all').uncheck().catch(() => {});
  await tryClick(p, '#rp-go', '빈 발급 요청', 800); await shot(p, 'r02-issue-errors');
  await p.locator('#rp-title').fill('감사용 보고서').catch(() => {});
  await p.locator('#rp-cls-all').check().catch(() => {});
  await p.locator('.rp-emds input[data-emd]:not([disabled])').nth(0).check().catch(() => {});
  await p.locator('.rp-emds input[data-emd]:not([disabled])').nth(1).check().catch(() => {});
  await wait(1200); await shot(p, 'r03-issue-filled');
  await tryClick(p, '#rp-go', '발급 요청', 1500); await shot(p, 'r04-after-submit');
  log('report list first', (await p.locator('.rp-list li').first().innerText().catch(() => '')).slice(0, 160));
  await wait(6000); log('report status after 6s', (await p.locator('.rp-list li').first().innerText().catch(() => '')).slice(0, 60));
  watch(p, 'report-list');
  await p.goto(BASE + 'report-standard.html'); await mapReady(p); await wait(2500);
  await shot(p, 'r05-list-1440'); await measure(p, 'report-list');
  await tryClick(p, '.rp-list .rp', '내역 행', 1200); await shot(p, 'r06-list-row');
  await p.locator('#rp-q select[name="state"]').selectOption('fail').catch(() => {});
  await tryClick(p, '#rp-q .btn-br', '상태 검색', 800); await shot(p, 'r07-list-fail');
  await p.locator('#rp-q input[name="q"]').fill('없는제목zzz').catch(() => {});
  await tryClick(p, '#rp-q .btn-br', '빈 결과 검색', 800); await shot(p, 'r08-list-empty');
  await tryClick(p, '#rp-q button[type="reset"]', '초기화', 800);
  await tryClick(p, '[data-q="1"]', '1개월칩', 500);
  log('list rows after 1개월 chip (필터 동작?)', await p.locator('.rp-list li').count());
  const dlP = p.waitForEvent('download', { timeout: 4000 }).then((d) => d.suggestedFilename()).catch(() => null);
  await tryClick(p, '.rp .dl', '엑셀 다운로드(행)', 800); await shot(p, 'r09-list-dl-pledge');
  await p.locator('#pl-ok').check().catch(() => {}); await p.locator('#pl-name').fill('x').catch(() => {}); await p.locator('#pl-purpose').fill('y').catch(() => {});
  await tryClick(p, '.modal-f .btn', '보고서 엑셀 서약 제출', 1200);
  R.downloads.push({ where: 'report 엑셀', file: await dlP });
  await c.close();
}

/* ══ 4. map-drift ════════════════════════════════════════════════════ */
{
  const c = await ctx('staff'); const p = await c.newPage(); watch(p, 'drift');
  await p.goto(BASE + 'map-drift.html'); await wait(6000);
  await shot(p, 'd01-drift-1440'); await measure(p, 'drift');
  await tryClick(p, '#df-play', '재생', 4000); await shot(p, 'd02-drift-playing');
  await tryClick(p, '[data-sp="8"]', '8x', 3000); await shot(p, 'd03-drift-8x');
  await tryClick(p, '#df-play', '정지', 300);
  for (const k of ['track', 'prob']) { await tryClick(p, `[data-lay="${k}"]`, 'lay ' + k, 800); }
  await shot(p, 'd04-drift-track-prob');
  for (const t of ['patch', 'role', 'need', 'verify']) { await tryClick(p, `.df-tabs [data-p="${t}"]`, 'tab ' + t, 400); await shot(p, `d05-drift-tab-${t}`); }
  await tryClick(p, '.df-tabs [data-p="eta"]', 'tab eta', 300);
  await tryClick(p, '.df-eta-r', '상륙 구간', 1500); await shot(p, 'd06-drift-eta-click');
  await p.locator('#df-range').fill('40').catch(() => {}); await wait(600); await shot(p, 'd07-drift-scrub');
  const hrefs = await p.$$eval('a[href]', (as) => [...new Set(as.map((a) => a.getAttribute('href')))]);
  R.links.drift = hrefs;
  await c.close();
}

/* ══ 5. 뷰포트 ══════════════════════════════════════════════════════ */
for (const vp of [{ width: 1280, height: 800 }, { width: 1920, height: 1080 }, { width: 390, height: 844 }]) {
  const c = await ctx('staff', vp); const p = await c.newPage();
  for (const [f, k] of [['ximap.html?on=namwon-farmland-2025&fold=0', 'ximap'], ['stats-standard.html', 'stats'], ['report-standard-issue.html', 'rissue'], ['map-drift.html', 'drift']]) {
    watch(p, `${k}-${vp.width}`);
    await p.goto(BASE + f); await wait(5000);
    await shot(p, `v-${k}-${vp.width}x${vp.height}`);
    await measure(p, `${k}-${vp.width}`);
  }
  await c.close();
}

/* ══ 6. sales 계정 = ximap 이 홈 ═════════════════════════════════════ */
{
  const c = await ctx('sales'); const p = await c.newPage(); watch(p, 'ximap-sales');
  await p.goto(BASE + 'ximap.html'); await mapReady(p); await wait(2500);
  await shot(p, 'x40-sales-ximap');
  log('sales rail', await p.$$eval('#rail a', (as) => as.map((a) => a.textContent.trim()).filter(Boolean)));
  await c.close();
}

/* ══ 7. 링크 확인 ═══════════════════════════════════════════════════ */
const all = [...new Set(Object.values(R.links).flat())].filter((h) => h && !h.startsWith('#') && !h.startsWith('javascript') && !h.startsWith('mailto') && !h.startsWith('tel'));
R.linkStatus = {};
for (const h of all) {
  const u = new URL(h, BASE).href;
  try { const r = await fetch(u); R.linkStatus[h] = r.status; } catch (e) { R.linkStatus[h] = 'ERR'; }
}
log('links', R.linkStatus);

await browser.close();
fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify(R, null, 2));
console.log('done');
