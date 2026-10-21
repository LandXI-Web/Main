/* 재검수 21차 · 구역 C (LX 직원 생산 + XI맵) — 그림 · 오류 · 400 이상 응답 · 실패 요청 · 시간만 모은다. 판정 없음.
   node capture-C-zone.mjs → ./findings.json · ./shots/*.png
   로그인은 frontDoor(로그인 폼)로만 · 계정 test@lx.or.kr · 사이트 app · 비밀번호는 server/.env 에서 읽고 출력하지 않는다.
   저장 · 제출 · 학습 시작은 누르지 않는다. 라벨은 그리지 않는다. 끌기는 Esc 로 취소한다. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';

const ROOT = 'E:/Land-XI 플랫폼/01. 디자인';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(HERE, 'shots'); fs.mkdirSync(SHOTS, { recursive: true });
const OUT = path.join(HERE, 'findings.json');
const HW = 'C:/Users/User/AppData/Local/ms-playwright';
if (fs.existsSync(HW)) process.env.PLAYWRIGHT_BROWSERS_PATH = HW;
if (!process.env.DEV_PASSWORD) { const m = fs.readFileSync(path.join(ROOT, 'server/.env'), 'utf8').match(/^DEV_PASSWORD=(.*?)\s*$/m); if (m) process.env.DEV_PASSWORD = m[1].replace(/^"|"$/g, ''); }
process.env.LX_PW ||= process.env.DEV_PASSWORD;
const { chromium } = createRequire(path.join(ROOT, 'package.json'))('playwright');
const { frontDoor } = await import(pathToFileURL(path.join(ROOT, 'landxi/v3/kit/lint/forbidden.mjs')).href);

const APP = 'https://app.land-xi.dev', V = '/landxi/v3/';
const VP = { pc: { width: 1440, height: 900 }, mo: { width: 390, height: 844 } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const kst = () => new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' });
const short = (u) => String(u).replace(/[?#].*$/, '').slice(0, 220); // 쿼리(access_token 등) 제거
const F = { run_at: kst(), script: 'capture-C-zone.mjs', logins: [], steps: [], notes: [] };
const save = () => fs.writeFileSync(OUT, JSON.stringify(F, null, 1));
setTimeout(() => { F.timeout = true; save(); process.exit(2); }, 40 * 60 * 1000).unref();

// 불러오는 중 · 답을 찾는 중 · 서버 응답이 늦습니다 — 보이는 글자 구간을 시각과 함께 적는다
const LOADING_INIT = `(() => {
  window.__lw = []; let on = false;
  const RE = /불러오는 중|답을 찾는 중|서버 응답이 늦습니다/;
  const loadingNow = () => { if (!document.body) return false; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n;
    while ((n = w.nextNode())) { if (RE.test(n.nodeValue) && n.parentElement && n.parentElement.getClientRects().length) return true; } return false; };
  window.__loadingNow = loadingNow;
  setInterval(() => { const v = loadingNow(); if (v !== on) { on = v; window.__lw.push({ t: Date.now(), on: v }); } }, 200);
})();`;

const browser = await chromium.launch({ channel: 'chrome', headless: true });
let cur = null;

function attach(p) {
  p.on('console', (m) => { if (cur && m.type() === 'error') cur.errors.push(m.text().slice(0, 200)); });
  p.on('pageerror', (e) => { if (cur) cur.errors.push('pageerror ' + String(e).slice(0, 200)); });
  p.on('response', (r) => { if (cur && r.status() >= 400 && !/favicon/.test(r.url())) cur.bad.push(`${r.status()} ${r.request().method()} ${short(r.url())}`); });
  p.on('requestfailed', (r) => { if (cur) cur.failed.push(`${r.failure()?.errorText || '?'} ${short(r.url())}`); });
}
async function session(vp) {
  const ctx = await browser.newContext({ viewport: VP[vp], locale: 'ko-KR' });
  await ctx.addInitScript(LOADING_INIT);
  const p = await ctx.newPage(); attach(p);
  return { ctx, p, vp };
}
async function login(s) {
  const t = Date.now(); let err = null;
  for (let k = 0; k < 2; k++) {
    err = null;
    try { await frontDoor(s.p, APP, 'test@lx.or.kr', 'app'); await s.p.waitForURL((u) => !/\/login\/?$/.test(u.pathname), { timeout: 60000 }); break; } catch (e) { err = String(e).split('\n')[0].slice(0, 200); await sleep(8000); }
  }
  F.logins.push({ vp: s.vp, login_ms: Date.now() - t, err, landed: short(s.p.url()) }); save();
}
async function waitFor(fn, ms, every = 250) {
  const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch {} await sleep(every); }
  return false;
}
async function go(p, url) {
  const t = Date.now();
  await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch((e) => F.notes.push('goto ' + String(e).slice(0, 120)));
  const ready = await waitFor(() => p.evaluate(() => !window.__loadingNow() && document.body.innerText.trim().length > 200), 60000, 200);
  return { ready, ms_ready: Date.now() - t };
}
async function spansSince(p, t0) {
  const ev = await p.evaluate(() => window.__lw || []).catch(() => []);
  const spans = []; let open = null;
  for (const e of ev) { if (e.t < t0) continue; if (e.on) open = e.t; else if (open !== null) { spans.push({ from_ms: open - t0, dur_ms: e.t - open }); open = null; } }
  if (open !== null) spans.push({ from_ms: open - t0, dur_ms: Date.now() - open, still_loading: true });
  return spans;
}
// 가로 넘침 · 잘린 글자 — 칸 밖으로 나간 글자만 적는다
const layout = (p) => p.evaluate(() => {
  const W = innerWidth, over = [], clipped = [];
  for (const e of document.querySelectorAll('body *')) {
    if (!e.getClientRects().length) continue;
    const txt = (e.textContent || '').trim(); if (!txt || e.childElementCount) continue;
    const r = e.getBoundingClientRect();
    if (r.right > W + 1 && over.length < 8) over.push(txt.slice(0, 60));
    if (e.scrollWidth > e.clientWidth + 2 && getComputedStyle(e).overflow !== 'visible' && clipped.length < 8) clipped.push(txt.slice(0, 60));
  }
  return { docScrollW: document.documentElement.scrollWidth, innerW: W, overflowRight: over, clipped };
}).catch((e) => ({ err: String(e).slice(0, 100) }));
const controls = (p) => p.evaluate(() => [...document.querySelectorAll('button,[role=tab],[role=button],a')].filter((e) => e.getClientRects().length).map((e) => e.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 40)).catch(() => []);
const head = (p) => p.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').trim().slice(0, 300)).catch(() => '');
async function shot(p, name) { await p.screenshot({ path: path.join(SHOTS, name), timeout: 25000 }).catch((e) => F.notes.push('shot ' + name + ' ' + String(e).slice(0, 80))); return 'shots/' + name; }

async function step(id, vp, p, fn) {
  cur = { errors: [], bad: [], failed: [] }; const t0 = Date.now(); let data = {};
  try { data = (await fn(t0)) || {}; } catch (e) { data.error = String(e).split('\n')[0].slice(0, 200); }
  const spans = await spansSince(p, t0).catch(() => []);
  const lay = await layout(p);
  F.steps.push({ id, vp, url: short(p.url()), total_ms: Date.now() - t0, ...data, loading_spans: spans, layout: lay,
    console_error_count: cur.errors.length, console_errors: [...new Set(cur.errors)].slice(0, 12),
    bad_count: cur.bad.length, bad_responses: [...new Set(cur.bad)].slice(0, 20),
    failed_requests: [...new Set(cur.failed)].slice(0, 20) });
  cur = null; save();
}

// ───────── PC 1440×900 ─────────
const pc = await session('pc');
await login(pc);
const p = pc.p;
let projectId = null;

await step('c1-train-list', 'pc', p, async () => {
  const g = await go(p, `${APP}${V}lx-train/`);
  const found = await p.evaluate(async () => {
    const { api } = await import('/landxi/shared/api-v1.js');
    const it = (await api('/projects?scope=all')).items || [];
    const x = it.find((q) => /비닐하우스 2026/.test(q.name || '')) || it.find((q) => /비닐하우스/.test(q.name || ''));
    return x ? x.id : null;
  }).catch(() => null);
  const href = found;
  if (found) projectId = found;
  await sleep(800);
  return { go: g, project_found: !!href, controls: await controls(p), text_head: await head(p), shot: await shot(p, 'c1-train-list-pc.png') };
});

if (!projectId) F.notes.push('학습 프로젝트 링크(project=)를 찾지 못해 라벨링 · 학습 보드 단계를 건너뜀');

if (projectId) {
  await step('c2-label-entry', 'pc', p, async () => {
    const g = await go(p, `${APP}${V}lx-train/?project=${projectId}&stage=label`);
    await p.waitForSelector('.lb-cv[data-ready], .lm-map canvas', { timeout: 60000 }).catch(() => {});
    await sleep(1000);
    return { go: g, map_canvas: await p.locator('.lm-map canvas').count(), image_canvas: await p.locator('.lb-cv').count(),
      view_tabs: await p.locator('.lb-view-b').allTextContents().catch(() => []), controls: await controls(p), text_head: await head(p), shot: await shot(p, 'c2-label-entry-pc.png') };
  });

  await step('c2-label-image-view', 'pc', p, async (t0) => {
    const clicked = await p.locator('.lb-view-b', { hasText: '그림' }).first().click({ timeout: 10000 }).then(() => true).catch(() => false);
    const ok = await waitFor(() => p.locator('.lb-cv[data-ready]').count().then((n) => n > 0), 15000, 300);
    const ms = Date.now() - t0;
    await sleep(1200);
    return { clicked, ready: ok, ms_to_image: ms, progress: await p.locator('.lb-prog-t').innerText().catch(() => null), rows: await p.locator('.lb-row').count(), shot: await shot(p, 'c2-label-image-pc.png') };
  });

  await step('c2-label-map-view', 'pc', p, async (t0) => {
    const clicked = await p.locator('.lb-view-b', { hasText: '지도' }).first().click({ timeout: 10000 }).then(() => true).catch(() => false);
    const ok = await waitFor(() => p.locator('.lm-map canvas').count().then((n) => n > 0), 60000, 300);
    const ms = Date.now() - t0;
    await sleep(2000);
    return { clicked, ready: ok, ms_to_map: ms, map_rows: await p.locator('.lm-rows .lm-row').count(), shot: await shot(p, 'c2-label-map-pc.png') };
  });

  await step('c3-train-board', 'pc', p, async () => {
    const g = await go(p, `${APP}${V}lx-train/?project=${projectId}&stage=train`);
    await p.locator('.tb-board h1').waitFor({ timeout: 60000 }).catch(() => {});
    await sleep(1000);
    return { go: g, nodes: await p.locator('.tb-node').count(), node_kinds: await p.locator('.tb-node').evaluateAll((es) => es.map((e) => e.dataset.kind || '')), controls: await controls(p), shot: await shot(p, 'c3-train-board-pc.png') };
  });

  await step('c3-train-drag-cancel', 'pc', p, async () => {
    const n = p.locator('.tb-node[data-kind="data"]').first();
    const b0 = await n.boundingBox().catch(() => null);
    if (!b0) return { note: '데이터 블록 없음 — 끌기 생략' };
    const sx = b0.x + b0.width / 2, sy = b0.y + b0.height / 2;
    await p.mouse.move(sx, sy); await p.mouse.down();
    for (let i = 1; i <= 10; i++) await p.mouse.move(sx + i * 25, sy + i * 12);
    await sleep(400);
    const mid = await shot(p, 'c3-train-drag-mid-pc.png');
    await p.keyboard.press('Escape');
    await p.mouse.move(sx, sy, { steps: 5 }); await p.mouse.up();
    await sleep(900);
    const b1 = await n.boundingBox().catch(() => null);
    return { start: [Math.round(sx), Math.round(sy)], moved_px_after_cancel: b1 ? Math.round(Math.abs(b1.x - b0.x) + Math.abs(b1.y - b0.y)) : null,
      start_training_buttons_present: await p.locator('button', { hasText: '학습 시작' }).count(), shot_mid: mid, shot_after: await shot(p, 'c3-train-drag-after-pc.png') };
  });
}

await step('c4-lx-map', 'pc', p, async () => {
  const g = await go(p, `${APP}${V}lx-map/`);
  await sleep(1000);
  return { go: g, controls: await controls(p), text_head: await head(p), shot: await shot(p, 'c4-lx-map-pc.png') };
});

await step('c5-ximap-open', 'pc', p, async () => {
  const g = await go(p, `${APP}${V}xi-clean/`);
  await sleep(1500);
  const dates = await p.evaluate(() => [...document.querySelectorAll('body *')].filter((e) => e.childElementCount === 0 && e.getClientRects().length && /\d{4}[.\-년]\s?\d{1,2}/.test(e.textContent || '') && /분석|기준|최근/.test(e.textContent || '')).map((e) => e.textContent.trim().slice(0, 80)).slice(0, 6)).catch(() => []);
  return { go: g, date_like_texts: dates, controls: await controls(p), text_head: await head(p), shot: await shot(p, 'c5-ximap-pc.png') };
});

await step('c5-ximap-tint-toggle', 'pc', p, async () => {
  // 기존 검수(ximap-tint)와 같이: 지역 말풍선을 눌러 통계 판을 연 뒤 색칠 단추를 찾는다
  const bub = await p.evaluate((t) => { const b = [...document.querySelectorAll('.xs-c-bub')].find((e) => e.innerText.includes(t)) || document.querySelector('.xs-c-bub'); if (b) b.click(); return b ? b.innerText.trim().slice(0, 40) : null; }, '남원시 현황').catch(() => null);
  const panelOk = await waitFor(() => p.evaluate(() => !!document.querySelector('.xo:not([hidden]) .xo-mp') && window.__xc?.dash?.fill === 'done'), 120000, 500);
  await sleep(2500);
  if (!(await p.locator('.xo-mini .xo-tint').count())) { const sb = p.locator('.xo-mini button, button').filter({ hasText: '통계 보기' }).first(); if (await sb.count()) { await sb.click({ timeout: 8000 }).catch(() => {}); await sleep(2000); } }
  const bubble = bub; const panel = panelOk;
  let sel = '.xo-mini .xo-tint';
  if (!(await p.locator(sel).count())) sel = '.xo:not([hidden]) .xo-tint';
  if (!(await p.locator(sel).count())) return { note: '색칠 단추 없음' };
  await p.locator(sel).first().click({ timeout: 8000 }).catch((e) => F.notes.push('tint click ' + String(e).slice(0, 80)));
  await sleep(1300); const off = await shot(p, 'c5-ximap-tint-off-pc.png');
  await p.locator(sel).first().click({ timeout: 8000 }).catch(() => {});
  await sleep(1300);
  return { bubble_clicked: bubble, stats_panel_ready: panel, selector: sel, off_shot: off, on_shot: await shot(p, 'c5-ximap-tint-on-pc.png') };
});

await step('c5-ximap-tint-slider', 'pc', p, async () => {
  const inp = p.locator('.xo-dn input').first();
  if (!(await inp.count())) return { note: '진하기 슬라이더 없음' };
  const out = {};
  for (const v of ['40', '100']) {
    await inp.evaluate((e, val) => { e.value = val; e.dispatchEvent(new Event('input', { bubbles: true })); }, v);
    await sleep(1300); out['shot_' + v] = await shot(p, `c5-ximap-tint-${v}-pc.png`);
  }
  return out;
});

await step('c5-ximap-layers', 'pc', p, async () => {
  const t = p.locator('.xc-tool', { hasText: '층' }).first();
  if (!(await t.count())) return { note: '층 단추 없음' };
  await t.click({ timeout: 8000 }).catch(() => {}); await sleep(900);
  return { rows: await p.locator('[data-tint-row]').count(), shot: await shot(p, 'c5-ximap-layers-pc.png') };
});

// ChatGEO — 같은 화면(남원 지역 파라미터는 기존 검수 스크립트와 같게)
async function ask(q) {
  const inp = p.locator('.k-ck-i').first();
  await inp.click({ timeout: 10000 }); await inp.fill(q);
  const t = Date.now(); await inp.press('Enter');
  const thinkingSeen = await waitFor(() => p.evaluate(() => /답을 찾는 중/.test(document.body.innerText)), 12000, 200);
  const answered = await waitFor(() => p.evaluate(() => {
    const a = document.querySelector('.xk-ans'); return !!a && a.getClientRects().length > 0 && !/답을 찾는 중/.test(document.body.innerText);
  }), 150000, 300);
  const ms_answer = Date.now() - t;
  const answer = await p.evaluate(() => { const a = document.querySelector('.xk-ans'); return a ? a.innerText.replace(/\s+/g, ' ').trim().slice(0, 300) : null; }).catch(() => null);
  return { thinkingSeen, answered, ms_answer, answer };
}
const sourceLines = () => p.evaluate(() => (document.body.innerText.match(/[^\n]{0,60}(출처|자료|기준)[^\n]{0,80}/g) || []).slice(0, 6)).catch(() => []);

await step('c6-chatgeo-q1-report', 'pc', p, async () => {
  await go(p, `${APP}${V}xi-clean/?region=52190`);
  await sleep(1000);
  const a = await ask('남원시 경작지 통계 보고서 만들어 줘');
  const out = { ask: a, source_lines_answer: await sourceLines(), shot_answer: await shot(p, 'c6-chat-q1-answer-pc.png') };
  if (!(await p.locator('button,a,[role=button]').filter({ hasText: '보고서 보기' }).first().isVisible().catch(() => false))) { await p.locator('button,a,[role=button]').filter({ hasText: '대화 1' }).first().click({ timeout: 8000 }).catch(() => {}); await sleep(1500); out.shot_drawer = await shot(p, 'c6-chat-q1-drawer-pc.png'); }
  const btn = p.locator('button,a,[role=button]').filter({ hasText: '보고서 보기' }).first();
  if (!(await btn.count())) { out.report_button = '보고서 보기 없음'; return out; }
  const t = Date.now(); await btn.click({ timeout: 10000 }).catch((e) => out.click_err = String(e).slice(0, 100));
  out.report_opened = await waitFor(() => p.locator('.rv').first().isVisible().catch(() => false), 90000, 300);
  out.ms_to_dashboard = Date.now() - t;
  await sleep(1500);
  out.dashboard_source_lines = await p.evaluate(() => { const r = document.querySelector('.rv'); return r ? (r.innerText.match(/[^\n]{0,60}(출처|자료|기준)[^\n]{0,80}/g) || []).slice(0, 6) : null; }).catch(() => null);
  out.shot_dashboard = await shot(p, 'c6-report-dash-pc.png');
  await p.keyboard.press('Escape'); await sleep(800);
  return out;
});

await step('c7-chatgeo-q2-highlight', 'pc', p, async () => {
  await go(p, `${APP}${V}xi-clean/?region=52190`);
  await sleep(1000);
  const mapHash = async () => {
    const c = p.locator('.maplibregl-canvas').first();
    if (!(await c.count())) return null;
    const buf = await c.screenshot({ timeout: 20000 }).catch(() => null);
    return buf ? crypto.createHash('md5').update(buf).digest('hex').slice(0, 12) : null;
  };
  const before = await mapHash();
  const a = await ask('남원시 하천구역 안 의심 시설 몇 곳이야');
  await sleep(2500);
  const after = await mapHash();
  return { ask: a, map_hash_before: before, map_hash_after: after, map_changed: before && after ? before !== after : null,
    source_lines_answer: await sourceLines(), shot_answer: await shot(p, 'c7-chat-q2-answer-pc.png'), shot_map: await shot(p, 'c7-chat-q2-map-pc.png') };
});

await pc.ctx.close();

// ───────── 모바일 390×844 — XI맵 층 줄 · 채팅 입력 겹침 ─────────
const mo = await session('mo');
await login(mo);
const mp = mo.p;
await step('c8-ximap-mo-open', 'mo', mp, async () => {
  const g = await go(mp, `${APP}${V}xi-clean/`);
  await sleep(1500);
  const box = async (sel, hasText) => {
    const l = hasText ? mp.locator(sel, { hasText }).first() : mp.locator(sel).first();
    return (await l.count()) ? await l.boundingBox().catch(() => null) : null;
  };
  const inputBox = await box('.k-ck-i');
  const layerBox = await box('.xc-tool', '층');
  const ov = (a, b) => !!a && !!b && a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  return { go: g, chat_input_box: inputBox && inputBox.map ? null : inputBox, layer_tool_box: layerBox,
    layer_tool_overlaps_chat_input: ov(layerBox, inputBox), controls: await controls(mp), shot: await shot(mp, 'c8-ximap-mo-pc-open.png') };
});
await step('c8-ximap-mo-layers', 'mo', mp, async () => {
  const t = mp.locator('.xc-tool', { hasText: '층' }).first();
  if (!(await t.count())) return { note: '층 단추 없음' };
  await t.click({ timeout: 8000 }).catch(() => {}); await sleep(1000);
  const rows = await mp.locator('[data-tint-row]').evaluateAll((es) => es.filter((e) => e.getClientRects().length).map((e) => { const r = e.getBoundingClientRect(); return { y: Math.round(r.y), bottom: Math.round(r.bottom), x: Math.round(r.x) }; })).catch(() => []);
  const inp = await mp.locator('.k-ck-i').first().boundingBox().catch(() => null);
  const overl = inp ? rows.filter((r) => r.bottom > inp.y && r.y < inp.y + inp.height) : [];
  return { layer_rows_visible: rows.length, layer_rows_overlapping_chat_input: overl.length, chat_input_y: inp ? Math.round(inp.y) : null, rows: rows.slice(0, 6), shot: await shot(mp, 'c8-ximap-mo-layers-open.png') };
});
await mo.ctx.close();

F.finished_at = kst();
save();
await browser.close();
console.log(JSON.stringify({ steps: F.steps.length, logins: F.logins.map((l) => [l.vp, l.login_ms, !!l.err]), notes: F.notes }));
