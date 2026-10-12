/* impl-22 핵심 코어 고리 증거 — 바깥 주소에서 지금 새로 찍는다(원칙 162). 로그인 폼 두 번(LX 직원 · LX 관리자 · 세션 주입 0). GPU 0(학습을 돌리지 않음).
   node docs/superpowers/final/process/impl-22/core-loop/shoot.mjs   (01. 디자인 에서) → shots/*.png · run.json
   ① XI맵 그 자리 고치기 → 분류 바꾸기 = 클래스 목록 · 새 클래스 더하기(이름 · 세부/새 물체 · 위 클래스) · 비슷한 클래스 먼저(409 — 아무것도 만들지 않음)
   ② 데이터하우스(직원 메뉴) — 학습 데이터 탭 클래스별
   ③ 학습 화면 — 기본 흐름(학습 서식) · 바꿀 수 없는 것 줄 · '기본 흐름으로 되돌리기' · 학습 데이터 서랍 'XI맵에서 고친 것 n건'
   ④ LX 관리자 — 데이터하우스 승인 대기(시험 클래스 하나를 잠깐 만들고 찍은 뒤 지움) · 배포 → XI 재학습 · 학습 서식 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { frontDoor } from '../../../../../../landxi/v3/kit/lint/forbidden.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(DIR, 'shots');
fs.mkdirSync(OUT, { recursive: true });
const APP = process.env.APP || 'https://app.land-xi.dev';
const ADMIN = process.env.ADMIN || 'https://admin.land-xi.dev';
const kst = () => new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' });
const hm = () => kst().slice(11, 16).replace(':', '');
const run = { at: kst(), app: APP, shots: {}, errors: [], local: [], notes: {} };
const only = (process.env.ONLY || '').split(',').filter(Boolean);
if (only.length) {   // 일부만 다시 찍으면 지난 기록(다른 장면)은 그대로 두고 그 장면만 바꾼다
  try { const old = JSON.parse(fs.readFileSync(path.join(DIR, 'run.json'), 'utf8')); run.shots = old.shots || {}; run.notes = old.notes || {}; run.first_at = old.at; } catch { /* 처음 */ }
}
const want = (k) => !only.length || only.includes(k);
const shot = async (page, name, opts = {}) => { const f = `${name}-${hm()}.png`; for (const k of Object.keys(run.shots)) if (k.startsWith(name + '-') && k !== f) { delete run.shots[k]; fs.rmSync(path.join(OUT, k), { force: true }); } await page.screenshot({ path: path.join(OUT, f), ...opts }); run.shots[f] = kst(); return f; };
const save = () => fs.writeFileSync(path.join(DIR, 'run.json'), JSON.stringify(run, null, 2));
setTimeout(() => { save(); process.exit(2); }, 300000);

const browser = await chromium.launch({ channel: 'chrome' });
const watch = (p) => {
  p.on('console', (m) => { if (m.type() === 'error') run.errors.push(`${p.url().replace(/[?#].*$/, '').slice(-40)} · ${m.text().slice(0, 300)}`); });
  p.on('pageerror', (e) => run.errors.push(String(e).slice(0, 300)));
  p.on('request', (r) => { if (/\/\/(127\.0\.0\.1|localhost|\[::1\])|:8700|:4173/.test(r.url())) run.local.push(r.url()); });
};
const token = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('lx_api_session') || 'null')?.token);
const apiIn = (p, url, init = {}) => p.evaluate(async ([u, i]) => {
  const s = JSON.parse(localStorage.getItem('lx_api_session') || 'null');
  const r = await fetch('/api/v1' + u, { ...i, headers: { 'content-type': 'application/json', ...(s ? { authorization: 'Bearer ' + s.token } : {}) } });
  return { status: r.status, body: await r.json().catch(() => null) };
}, [url, init]);

/* ── LX 직원 ── */
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ko-KR' });
const p = await ctx.newPage();
watch(p);
await frontDoor(p, APP, 'test@lx.or.kr', 'app');
await p.waitForURL((u) => !/\/login\/?$/.test(u.pathname), { timeout: 30000 });
await token(p);

if (want('ximap')) {
  /* ① XI맵 — 결과가 많은 곳으로 가서 객체 하나를 누른다 */
  await p.goto(`${APP}/landxi/v3/xi-clean/`, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.__xc?.boot?.shown && window.__xc.board?.hot, null, { timeout: 60000 });
  const hot = await p.evaluate(() => window.__xc.board.hot);
  await p.evaluate((c) => window.__xc.map.jumpTo({ center: c, zoom: 14.6 }), hot);
  const fill = () => p.evaluate(() => { const m = window.__xc.map; const ls = m.getStyle().layers.filter((l) => /^xb-r-.*-fill$/.test(l.id) && m.getLayoutProperty(l.id, 'visibility') !== 'none').map((l) => l.id);
    if (m.isMoving() || !ls.length) return null;
    const r = m.getCanvas().getBoundingClientRect();
    const fs2 = m.queryRenderedFeatures({ layers: ls }).filter((f) => f.geometry.type.endsWith('Polygon'));
    for (const f of fs2) {   // 화면 가운데쯤 · 칸 안쪽 점
      const ring = f.geometry.type === 'Polygon' ? f.geometry.coordinates[0] : f.geometry.coordinates[0][0];
      const c = ring.reduce((a, q) => [a[0] + q[0] / ring.length, a[1] + q[1] / ring.length], [0, 0]);
      const q = m.project(c);
      if (q.x > 420 && q.x < r.width - 520 && q.y > 200 && q.y < r.height - 160) {
        const hit = m.queryRenderedFeatures([q.x, q.y], { layers: ls });
        if (hit.length) return [q.x + r.x, q.y + r.y];
      }
    }
    return null; });
  let pt = null;
  for (let i = 0; i < 80 && !pt; i++) { await p.waitForTimeout(500); pt = await fill(); }
  run.notes.ximap_point = !!pt;
  if (!pt) run.notes.ximap_dbg = await p.evaluate(() => { const m = window.__xc.map; return { z: m.getZoom(), layers: m.getStyle().layers.filter((l) => /^xb-r-/.test(l.id)).map((l) => `${l.id}:${m.getLayoutProperty(l.id, 'visibility')}`).slice(0, 12) }; });
  if (pt) {
    await p.mouse.click(pt[0], pt[1]);
    await p.waitForSelector('.xe-card:not([hidden]) .xe-act', { timeout: 20000 });
    await p.waitForTimeout(500);
    await p.locator('.xe-card .xe-act button', { hasText: '분류 바꾸기' }).click();
    await p.waitForSelector('.xe-card .xe-pk', { timeout: 15000 });
    await p.waitForTimeout(400);
    run.notes.picker = await p.evaluate(() => [...document.querySelectorAll('.xe-card .xe-pk-t')].map((x) => `${x.textContent}: ${[...x.nextElementSibling.querySelectorAll('.xe-chip')].map((c) => c.textContent).join(' · ')}`));
    await shot(p, 'ximap-class-pick-1440');
    await p.locator('.xe-card button', { hasText: '새 클래스 더하기' }).click();
    await p.locator('.xe-card input[aria-label="새 클래스 이름"]').fill('연동 비닐하우스');
    await p.waitForTimeout(300);
    await shot(p, 'ximap-class-add-1440');
    await p.locator('.xe-card .xe-act button', { hasText: '더하기' }).click();     // 비슷한 클래스(단동 · 다동 비닐하우스)를 먼저 보여 줌 — 409 · 만들지 않음
    await p.waitForSelector('.xe-card .xe-pk-say p', { timeout: 15000 });   // GET 으로 먼저 물음(오류 응답 없음)
    await p.waitForTimeout(300);
    run.notes.similar = await p.evaluate(() => document.querySelector('.xe-card .xe-pk-say')?.innerText.replace(/\s+/g, ' '));
    await shot(p, 'ximap-class-similar-1440');
  }
  save();
}

if (want('dh')) {
  /* ② 데이터하우스 — 메뉴 이름 · 학습 데이터 탭 */
  await p.goto(`${APP}/landxi/v3/lx-console/`, { waitUntil: 'domcontentloaded' });
  await p.locator('.k-rail a.k-rail-i', { hasText: '데이터하우스' }).click();
  await p.waitForSelector('.dh-tbl tbody tr', { timeout: 30000 });
  await p.waitForTimeout(500);
  run.notes.menu = await p.evaluate(() => [...document.querySelectorAll('.k-rail a.k-rail-i > span:last-child')].map((x) => x.textContent));
  run.notes.dh_head = await p.evaluate(() => document.querySelector('.dh-h p')?.textContent);
  run.notes.dh_rows = await p.evaluate(() => [...document.querySelectorAll('.dh-tbl tbody tr')].slice(0, 6).map((r) => r.innerText.replace(/\s+/g, ' ')));
  await shot(p, 'datahouse-classes-1440');
  await p.locator('.dh-tabs button', { hasText: '영상 · 행정 자료' }).click();
  await p.waitForSelector('.lxi-pick', { timeout: 30000 });
  await p.waitForTimeout(2500);
  await shot(p, 'datahouse-imagery-1440');
  save();
}

if (want('train')) {
  /* ③ 학습 화면 — 비닐하우스 2026(목록에서 찾음) */
  const pj = await apiIn(p, '/projects?scope=all');
  const pid = (pj.body?.items || pj.body?.projects || []).find((x) => /비닐하우스/.test(x.name))?.id;
  run.notes.pid = pid ? 'found' : `none(${pj.status})`;
  await p.goto(`${APP}/landxi/v3/lx-train/?project=${pid}&stage=train`, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => document.documentElement.dataset.trainBoard === '1', null, { timeout: 30000 });
  await p.waitForTimeout(800);
  run.notes.board = await p.evaluate(() => ({ nodes: [...document.querySelectorAll('.tb-node')].map((n) => n.innerText.replace(/\s+/g, ' ').trim()), lock: document.querySelector('.tb-lock')?.innerText.replace(/\s+/g, ' ') }));
  await shot(p, 'train-default-flow-1440');
  await p.locator('.tb-node[data-kind="data"]').first().click();
  await p.waitForTimeout(400);
  run.notes.data_opts = await p.evaluate(() => [...document.querySelectorAll('.tb-side .tb-opt')].map((x) => x.innerText.replace(/\s+/g, ' ')));
  await shot(p, 'train-data-drawer-1440');
  /* 블록을 바꾼 뒤 '기본 흐름으로 되돌리기' */
  await p.keyboard.press('Escape');
  await p.locator('.tb-node[data-kind="eval"]').first().click();
  await p.keyboard.press('Delete');
  await p.locator('.tb-add .tb-chip', { hasText: '추론 시험' }).click();
  await p.keyboard.press('Escape');
  await p.waitForTimeout(300);
  run.notes.changed = await p.evaluate(() => [...document.querySelectorAll('.tb-node')].map((n) => n.dataset.kind));
  await shot(p, 'train-changed-1440');
  await p.locator('.tb-reset').click();
  await p.waitForTimeout(300);
  run.notes.reset = await p.evaluate(() => [...document.querySelectorAll('.tb-node')].map((n) => n.dataset.kind));
  save();
}

/* ── LX 관리자 ── */
const ctxA = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ko-KR' });
const a = await ctxA.newPage();
watch(a);
if (want('admin')) {
  await frontDoor(a, ADMIN, 'lxadmin@lx.or.kr', 'admin');
  await a.waitForURL((u) => !/\/login\/?$/.test(u.pathname), { timeout: 30000 });
  /* 승인 대기 — 시험 클래스 하나(직원이 더한 것처럼 · 시험 표시)를 만들고 찍은 뒤 지운다 */
  const mk = await apiIn(p, '/classes', { method: 'POST', body: JSON.stringify({ name: '시험 연동 비닐하우스', kind: 'detail', parent_id: 'cl_greenhouse', card_id: 'card-5e85a9', test: true, force: true }) });
  run.notes.test_class = mk.status;
  try {
    await a.goto(`${ADMIN}/landxi/v3/lx-ingest/?tab=train`, { waitUntil: 'domcontentloaded' });
    await a.waitForSelector('.dh-seg', { timeout: 30000 });
    await a.locator('.dh-seg button', { hasText: '승인 대기' }).click();
    await a.waitForSelector('.dh-wl li', { timeout: 15000 });
    await a.waitForTimeout(400);
    run.notes.wait_row = await a.evaluate(() => document.querySelector('.dh-wl li')?.innerText.replace(/\s+/g, ' '));
    await shot(a, 'admin-datahouse-wait-1440');
  } finally {
    if (mk.body?.class?.id) run.notes.test_class_drop = (await apiIn(a, `/classes/${mk.body.class.id}`, { method: 'DELETE' })).status;
  }
  await a.goto(`${ADMIN}/landxi/v3/ops-infra/#/deploys/retrain`, { waitUntil: 'domcontentloaded' });
  await a.waitForSelector('.rt-col .rt-tbl tbody tr', { timeout: 30000 });
  await a.waitForTimeout(600);
  run.notes.retrain_rows = await a.evaluate(() => [...document.querySelectorAll('.rt-tbl tbody tr')].map((r) => r.innerText.replace(/\s+/g, ' ')));
  const full = await a.evaluate(() => document.querySelector('.rt-col').scrollHeight + 200);
  await a.setViewportSize({ width: 1440, height: Math.max(900, full) });
  await a.waitForTimeout(400);
  await shot(a, 'admin-retrain-1440');
  await a.setViewportSize({ width: 1440, height: 900 });
  await a.goto(`${ADMIN}/landxi/v3/ops-infra/#/deploys/templates`, { waitUntil: 'domcontentloaded' });
  await a.waitForSelector('.rt-blks', { timeout: 30000 });
  await a.waitForTimeout(400);
  await shot(a, 'admin-train-template-1440');
  save();
}
await browser.close();
run.done = kst();
save();
console.log(JSON.stringify({ shots: Object.keys(run.shots).length, errors: run.errors, local: run.local.length, notes: run.notes }, null, 1));
