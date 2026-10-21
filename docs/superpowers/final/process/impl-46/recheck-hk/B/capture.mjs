/* 재검수 B · 사이클 21 · 지자체/기관 영농관리 (Haiku · 캡처 · 오류 · 시간 수집만 · 판정 없음 · 코드 수정 없음 · 커밋 없음)
   node capture.mjs            → ./findings.json · ./shots/*.png
   로그인은 frontDoor(로그인 폼)로만. 비밀번호는 frontDoor 가 server/.env 에서 읽는다(출력 안 함).
   안 누르는 것: 저장 · 제출 · 약속 · 승인 · 배정 · 엑셀/내려받기(이력에 남아 데이터가 바뀜) · 분석/촬영 요청 보내기. */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';

const ROOT = 'E:/Land-XI 플랫폼/01. 디자인';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SH = path.join(HERE, 'shots'); fs.mkdirSync(SH, { recursive: true });
const FF = path.join(HERE, 'findings.json');
process.env.PLAYWRIGHT_BROWSERS_PATH = 'C:/Users/User/AppData/Local/ms-playwright';
const { chromium } = createRequire(path.join(ROOT, 'package.json'))('playwright');
const { frontDoor } = await import(pathToFileURL(path.join(ROOT, 'landxi/v3/kit/lint/forbidden.mjs')).href);

const ORG = 'https://namwon.land-xi.dev', L = ORG + '/landxi/v3/';
const VPS = { pc: { w: 1440, h: 900 }, mob: { w: 390, h: 844 } };
const SAFE_FORBID = /저장|제출|약속|승인|거절|보내기|발송|삭제|내려받|다운로드|엑셀|xlsx|확정|배정|공개|결재|등록|반려|요청하기$/;
const KEYWORDS = ['현장 확인', '확인 결과', '담당자', '배정', '필지 이력', '공문', '내보내기', '조치', '메모', '이력', '보고서', '엑셀', '내려받기', '분석 요청', '촬영 요청', '이용 약속', '농지 이용', '곤포', '읍면동별', '사료작물', '행정정보', '기한', '알림'];
const EMPTY_RE = /아직|없습니다|없어요|비어 있|불러오지 못했습니다/;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 불러오는 중 구간 수집(페이지마다 새로 설치)
const INIT = `(() => { window.__ld = { runs: [], cur: null };
  setInterval(() => { const on = !!document.body && /불러오는 중/.test(document.body.innerText); const t = performance.now();
    if (on && window.__ld.cur === null) window.__ld.cur = t;
    if (!on && window.__ld.cur !== null) { window.__ld.runs.push([window.__ld.cur, t]); window.__ld.cur = null; } }, 100); })();`;

const OUT = { generatedAt: new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }), cycle: 21, zone: 'B', screens: [], chat: [], notFound: [], skipped: [], notes: [] };
const save = () => fs.writeFileSync(FF, JSON.stringify(OUT, null, 1));
const tagOf = (s) => s.replace(/[^a-zA-Z0-9가-힣]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

let ctx, rec, pageRef, browser;
const HOOKED = new WeakSet();
function resetRec() { rec = { consoleErrors: [], failed: [], loadingRuns: [] }; }
function attach(p) {
  resetRec();
  if (HOOKED.has(p)) return; HOOKED.add(p);
  p.on('console', (m) => { if (m.type() === 'error') rec.consoleErrors.push(m.text().slice(0, 200)); });
  p.on('pageerror', (e) => rec.consoleErrors.push('pageerror ' + String(e).slice(0, 200)));
  p.on('response', (r) => { if (r.status() >= 400 && !/favicon/.test(r.url())) rec.failed.push({ status: r.status(), url: r.url().replace(/[?#].*$/, '').slice(0, 160) }); });
}

async function collectLoading(p) {
  const r = await p.evaluate(() => { const Lq = window.__ld; if (!Lq) return null; return { runs: Lq.runs.slice(), cur: Lq.cur, now: performance.now() }; }).catch(() => null);
  if (!r) return;
  rec.loadingRuns = r.runs.map(([a, b]) => Math.round(b - a));
  if (r.cur !== null) rec.loadingRuns.push({ stillOnMs: Math.round(r.now - r.cur) });
}

// 화면 점검: 글 넘침 · 가로 스크롤 · 빈 상태 · 찾는 일 · 보이는 버튼 이름
async function inspect(p) {
  return p.evaluate((kw) => {
    const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
    const txt = document.body?.innerText || '';
    const clipped = [];
    for (const el of document.querySelectorAll('body *')) {
      if (!vis(el)) continue;
      const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      if (!own) continue;
      if (el.scrollWidth > el.clientWidth + 2) {
        const cs = getComputedStyle(el);
        clipped.push({ t: el.textContent.replace(/\s+/g, ' ').trim().slice(0, 60), ellipsis: cs.textOverflow === 'ellipsis', overflow: cs.overflowX });
        if (clipped.length >= 25) break;
      }
    }
    const empties = [...new Set(txt.split('\n').map((s) => s.trim()).filter((s) => s && s.length < 60 && /아직|없습니다|없어요|비어 있|불러오지 못했습니다/.test(s)))].slice(0, 12);
    const buttons = [...new Set([...document.querySelectorAll('button,a,[role=tab]')].filter(vis).map((e) => e.textContent.replace(/\s+/g, ' ').trim()).filter((t) => t && t.length < 30))].slice(0, 90);
    const found = {}; for (const k of kw) found[k] = txt.includes(k);
    return {
      docOverflowX: document.documentElement.scrollWidth - window.innerWidth,
      clipped, clippedCount: clipped.length, empties, buttons, found,
      inputs: [...document.querySelectorAll('input[type=file]')].length,
      loadingNow: /불러오는 중/.test(txt),
    };
  }, KEYWORDS);
}

async function waitReady(p, timeout = 90000) {
  const t0 = Date.now();
  await p.waitForFunction(() => document.readyState === 'complete', null, { timeout, polling: 100 }).catch(() => {});
  await p.waitForFunction(() => !/불러오는 중/.test(document.body?.innerText || ''), null, { timeout, polling: 150 }).catch(() => {});
  return Date.now() - t0;
}

// 이 화면을 연다(goto) → 준비 시간 · 점검 · 찍기
async function screen(vp, name, url, opts = {}) {
  const p = pageRef;
  const rec0 = { name, vp, url, status: 'ok' };
  try {
    attach(p);
    const t0 = Date.now();
    await p.goto(url, { waitUntil: 'commit', timeout: 90000 });
    await p.waitForFunction(() => document.body && document.body.innerText.length > 20, null, { timeout: 90000, polling: 150 }).catch(() => {});
    rec0.readyMs = Date.now() - t0;
    rec0.loadingGoneMs = await waitReady(p);
    await sleep(opts.settle ?? 1500);
    await collectLoading(p);
    rec0.finalUrl = p.url();
    rec0.loadingRuns = rec.loadingRuns;
    rec0.longLoading = rec.loadingRuns.filter((x) => typeof x === 'number' ? x > 2000 : x.stillOnMs > 2000);
    rec0.consoleErrors = rec.consoleErrors.slice();
    rec0.failed = rec.failed.slice();
    rec0.inspect = await inspect(p);
    const file = `${vp}-${tagOf(name)}.png`;
    await p.screenshot({ path: path.join(SH, file), timeout: 30000 }).catch((e) => rec0.notes = ['shot fail ' + String(e).slice(0, 80)]);
    rec0.shot = 'shots/' + file;
  } catch (e) { rec0.status = 'error'; rec0.error = String(e).slice(0, 220); }
  OUT.screens.push(rec0); save();
  return rec0;
}

// 화면 안에서 탭 누르기(금지 단어가 든 버튼은 건너뛴다)
async function tab(vp, label, opts = {}) {
  const p = pageRef;
  const name = `${opts.prefix || ''}${label}`;
  const res = { name, vp, click: label, status: 'ok' };
  if (SAFE_FORBID.test(label)) { res.status = 'skipped-forbidden'; OUT.skipped.push({ vp, label }); OUT.screens.push(res); save(); return res; }
  try {
    attach(p);
    if (opts.base) { await p.goto(opts.base, { waitUntil: 'commit', timeout: 90000 }); await waitReady(p); await sleep(1200); attach(p); }
    const el = p.locator('[role=tab], a, button').filter({ hasText: new RegExp('^\\s*' + label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$') }).first();
    if (!(await el.count())) { res.status = 'not-found'; OUT.notFound.push({ vp, screen: opts.screen || '', label }); OUT.screens.push(res); save(); return res; }
    const t0 = Date.now();
    try { await el.click({ timeout: 8000 }); }
    catch (e) { res.clickDiag = await el.evaluate((n) => { const r = n.getBoundingClientRect(); const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return { box: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)], coveredBy: top ? (top.textContent || '').replace(/s+/g, ' ').trim().slice(0, 60) : null, coveredByTag: top?.tagName }; }).catch(() => null); throw e; }
    await sleep(600);
    res.readyMs = Date.now() - t0;
    res.loadingGoneMs = await waitReady(p, 60000);
    await sleep(opts.settle ?? 1200);
    await collectLoading(p);
    res.loadingRuns = rec.loadingRuns; res.consoleErrors = rec.consoleErrors.slice(); res.failed = rec.failed.slice();
    res.inspect = await inspect(p);
    const file = `${vp}-${tagOf(name)}.png`;
    await p.screenshot({ path: path.join(SH, file), timeout: 30000 }).catch(() => {});
    res.shot = 'shots/' + file;
  } catch (e) { res.status = 'error'; res.error = String(e).slice(0, 220); }
  OUT.screens.push(res); save();
  return res;
}

async function openCtx(vpKey) {
  const { w, h } = VPS[vpKey];
  const mobile = w < 500;
  if (!browser) browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  ctx = await browser.newContext({ viewport: { width: w, height: h }, locale: 'ko-KR', deviceScaleFactor: 1, ...(mobile ? { isMobile: true, hasTouch: true } : {}) });
  await ctx.addInitScript(INIT);
  const p = await ctx.newPage();
  return p;
}

// ── 기관 채팅(XI ChatGEO) · 지도 위 색칠 · 진하기 · 보고서 보기 ──
async function chatFlow(vpKey) {
  const p = pageRef;
  const mobile = vpKey === 'mob';
  const out = { vp: vpKey, q: '남원시 경작지 통계 보고서 만들어 줘', ansMs: null, answer: '', reportBtn: null, reportScreen: null, tint: null, slider: null, notes: [] };
  await screen(vpKey, 'xi-map-home', L + 'xi-clean/', { settle: 2000 });
  try {
    attach(p);
    const inp = p.locator('.k-ck-i').first();
    const before = (await p.evaluate(() => (document.querySelector('.xk-ans-t')?.textContent || '').replace(/\s+/g, ' ').trim()));
    await inp.click({ timeout: 10000 }); await inp.fill(out.q);
    const t = Date.now(); await inp.press('Enter');
    const ok = await p.waitForFunction((pv) => {
      const tx = (document.querySelector('.xk-ans-t')?.textContent || '').replace(/\s+/g, ' ').trim();
      const st = document.querySelector('.k-chat-root[data-dock]')?.dataset.state;
      return tx && tx !== pv && !tx.includes('답을 찾는 중') && st !== 'busy';
    }, before, { timeout: 150000, polling: 200 }).then(() => true, () => false);
    out.ansMs = Date.now() - t; out.answered = ok;
    await sleep(5000);
    out.answer = (await p.evaluate(() => (document.querySelector('.xk-ans-t')?.textContent || '').replace(/\s+/g, ' ').trim())).slice(0, 240);
    await collectLoading(p);
    out.loadingRuns = rec.loadingRuns; out.consoleErrors = rec.consoleErrors.slice(); out.failed = rec.failed.slice();
    await p.screenshot({ path: path.join(SH, `${vpKey}-chat-answer.png`), timeout: 30000 }).catch(() => {});
    out.answerShot = `shots/${vpKey}-chat-answer.png`;
  } catch (e) { out.notes.push('질문 오류: ' + String(e).slice(0, 180)); }

  // 보고서 보기
  try {
    const btn = p.getByText('보고서 보기', { exact: false }).first();
    if (await btn.count()) {
      out.reportBtn = 'found';
      let clicked = true;
      const [pop] = await Promise.all([
        ctx.waitForEvent('page', { timeout: 6000 }).catch(() => null),
        btn.click({ timeout: 8000 }).catch(async (e) => { clicked = false; out.clickDiag = await btn.evaluate((n) => { const r = n.getBoundingClientRect(); const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return { box: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)], coveredBy: top ? (top.textContent || '').replace(/s+/g, ' ').trim().slice(0, 60) : null }; }).catch(() => null); out.notes.push('보고서 보기 클릭 실패 ' + String(e).slice(0, 100)); }),
      ]);
      if (!clicked) { out.reportBtn = 'click-failed'; throw new Error('skip report screen'); }
      const tgt = pop || p;
      const t0 = Date.now();
      if (pop) { await pop.waitForLoadState('domcontentloaded').catch(() => {}); attach(pop); }
      await sleep(3000);
      await tgt.waitForFunction(() => !/불러오는 중/.test(document.body?.innerText || ''), null, { timeout: 90000, polling: 150 }).catch(() => {});
      const rs = { url: tgt.url(), popup: !!pop, readyMs: Date.now() - t0, shot: `shots/${vpKey}-chat-report.png` };
      await sleep(1200);
      rs.inspect = await inspect(tgt);
      await tgt.screenshot({ path: path.join(SH, `${vpKey}-chat-report.png`), timeout: 30000 }).catch(() => {});
      out.reportScreen = rs;
      if (pop) await pop.close().catch(() => {});
      else { await p.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {}); }
    } else { out.reportBtn = 'not-found'; OUT.notFound.push({ vp: vpKey, screen: 'XI ChatGEO 답', label: '보고서 보기' }); }
  } catch (e) { if (!String(e).includes('skip report screen')) out.notes.push('보고서 보기 오류: ' + String(e).slice(0, 180)); }

  // 색칠 토글 · 진하기 슬라이더 (처음 상태로 되돌린다)
  try {
    await screen(vpKey, 'xi-map-after-chat', L + 'xi-clean/', { settle: 1500 });
    const row = p.locator('[data-tint-row]').first();
    if (await row.count()) {
      const a0 = await row.getAttribute('aria-pressed');
      await row.click({ timeout: 8000 }); await sleep(1500);
      const a1 = await row.getAttribute('aria-pressed');
      await p.screenshot({ path: path.join(SH, `${vpKey}-tint-on.png`), timeout: 30000 }).catch(() => {});
      const sl = p.locator('input[type=range]').first();
      const sliderInfo = await p.evaluate(() => [...document.querySelectorAll('input[type=range]')].map((e) => ({ min: e.min, max: e.max, value: e.value, visible: e.getBoundingClientRect().width > 0, label: (e.closest('label,div')?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40) })));
      let moved = null;
      if (await sl.count()) {
        const v0 = await sl.inputValue();
        await sl.focus(); await p.keyboard.press('ArrowRight'); await p.keyboard.press('ArrowRight'); await sleep(800);
        const v1 = await sl.inputValue();
        moved = { v0, v1 };
        await p.screenshot({ path: path.join(SH, `${vpKey}-tint-slider.png`), timeout: 30000 }).catch(() => {});
        await p.keyboard.press('ArrowLeft'); await p.keyboard.press('ArrowLeft'); await sleep(600);
      }
      await row.click({ timeout: 8000 }).catch(() => {}); await sleep(1000);
      const a2 = await row.getAttribute('aria-pressed');
      out.tint = { before: a0, afterToggle: a1, restored: a2, sliders: sliderInfo, moved };
    } else out.tint = 'no [data-tint-row] (색칠 줄 없음 · 지도 위 통계 색이 없을 때 보이지 않을 수 있음)';
  } catch (e) { out.notes.push('색칠 오류: ' + String(e).slice(0, 180)); }
  OUT.chat.push(out); save();
  return out;
}

const MAIN_SCREENS = [
  ['gov-home-first', L + 'gov-select/'],
  ['farm-service-status', L + 'gov-select/?service=card-farm'],
  ['farm-fusion-admin-compare', L + 'gov-fusion/?service=card-farm'],
  ['farm-report-A', L + 'gov-report/?service=card-farm&tab=report'],
  ['farm-stats-report', L + 'gov-select/?service=card-farm&tab=stats'],
  ['gov-accounts-pledges', L + 'gov-accounts/'],
  ['gov-request-forms', L + 'gov-request/'],
];
const TABS = ['결과 지도', '필지 목록', '이력', '통계·보고서'];

async function runVp(vpKey) {
  pageRef = await openCtx(vpKey);
  const p = pageRef;
  attach(p);
  await frontDoor(p, ORG, 'lxadmin@lx.or.kr#namwon', 'gov');
  await p.waitForURL((u) => !/\/login\/?(\?|$)/.test(u.pathname), { timeout: 60000 }).catch(() => {});
  OUT.notes.push(`${vpKey}: 로그인 후 주소 ${p.url().replace(/\?.*$/, '')}`);
  for (const [name, url] of MAIN_SCREENS) {
    await screen(vpKey, name, url);
  }
  // 경작·휴경 서비스 탭들
  await screen(vpKey, 'farm-service-status-again', L + 'gov-select/?service=card-farm', { settle: 800 });
  for (const t of TABS) await tab(vpKey, t, { screen: 'card-farm', base: L + 'gov-select/?service=card-farm' });
  // 행정정보 목록 (보기만)
  await screen(vpKey, 'farm-fusion-again', L + 'gov-fusion/?service=card-farm', { settle: 800 });
  await tab(vpKey, '행정정보 목록', { screen: 'gov-fusion', base: L + 'gov-fusion/?service=card-farm' });
  // 보고서 A 안 탭 (보기만)
  await screen(vpKey, 'farm-report-again', L + 'gov-report/?service=card-farm&tab=report', { settle: 800 });
  await tab(vpKey, '개요', { screen: 'gov-report', base: L + 'gov-report/?service=card-farm&tab=report' });
  await tab(vpKey, '지도', { screen: 'gov-report', base: L + 'gov-report/?service=card-farm&tab=report' });
  await chatFlow(vpKey);
  await ctx.close();
}

try {
  for (const vp of ['pc', 'mob']) {
    await runVp(vp).catch((e) => { OUT.notes.push(`${vp} 실행 오류: ` + String(e).slice(0, 200)); save(); });
    save();
  }
} finally {
  save();
  if (browser) await browser.close().catch(() => {});
}
const summary = {
  screens: OUT.screens.length,
  chat: OUT.chat.length,
  consoleErrors: OUT.screens.reduce((a, s) => a + (s.consoleErrors?.length || 0), 0),
  failed4xx5xx: OUT.screens.reduce((a, s) => a + (s.failed?.length || 0), 0),
  longLoading: OUT.screens.reduce((a, s) => a + (s.longLoading?.length || 0), 0),
  notFound: OUT.notFound.length,
  skipped: OUT.skipped.length,
};
console.log(JSON.stringify(summary));
