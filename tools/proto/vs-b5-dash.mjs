/* tools/proto/vs-b5-dash.mjs — 대시보드 B5 12.8 원판 대조 (보고 전 게이트 ①)
 *
 *   PORT=4186 node tools/serve.mjs &
 *   PLAYWRIGHT_BROWSERS_PATH=... PORT=4186 node tools/proto/vs-b5-dash.mjs
 *
 * ① 원판 = design-canvas/v2/renders/B5-Dashboard.png · B5-Dashboard-Data.png (1440×900, 커밋본)
 * ② 구현 = landxi/proto/dashboard.html 을 같은 상태로 찍는다
 *    (AI 분석 결과 / 학습데이터 — 둘 다 남원 셀 호버 상태. 원판이 호버 상태이기 때문이다.)
 * ③ 원판의 dc.html 을 열어 밴드 y · 폰트 크기 · 헤어라인 위치를 실측하고 우리 값과 뺀다.
 * ④ 좌 원판 / 우 구현으로 붙여 shots/proto/dashboard-vs-B5.png · dashboard-vs-B5-data.png.
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const PORT = process.env.PORT || 4186;
const W = 1440;
const H = 900;
const OUT = path.resolve('shots/proto');
const RND = path.resolve('design-canvas/v2/renders');
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome' });

/* ── 실측 프로브 — 원판(dc.html)과 구현에서 같은 것을 잰다 ─────────────── */
const PROBE = () => {
  const px = (v) => Math.round((parseFloat(v) || 0) * 100) / 100;
  const box = document.querySelector('x-dc > div') || document.querySelector('#stage');
  const all = [...box.querySelectorAll('*')];
  const O = box.getBoundingClientRect();
  const at = (e) => {
    const r = e.getBoundingClientRect();
    return { x: Math.round((r.left - O.left) * 100) / 100, y: Math.round((r.top - O.top) * 100) / 100, w: Math.round(r.width * 100) / 100, h: Math.round(r.height * 100) / 100 };
  };
  // 헤어라인 = 높이 1px 짜리 전폭 블록의 y 목록
  const hair = all.filter((e) => {
    const r = e.getBoundingClientRect();
    const cs = getComputedStyle(e);
    return Math.abs(r.height - 1) < 0.6 && r.width > 400 && /rgb\(221, 221, 221\)/.test(cs.backgroundColor);
  }).map((e) => Math.round((e.getBoundingClientRect().top - O.top) * 10) / 10).sort((a, b) => a - b);
  // 텍스트 노드를 가진 요소의 (y, fontSize) — 밴드 확인용
  const txt = (needle) => {
    const e = all.filter((n) => n.children.length === 0 && (n.textContent || '').trim().startsWith(needle))[0]
      || all.filter((n) => (n.textContent || '').trim().startsWith(needle)).pop();
    return e ? { ...at(e), fs: px(getComputedStyle(e).fontSize) } : null;
  };
  const big = all.filter((n) => n.children.length === 0 && px(getComputedStyle(n).fontSize) >= 50)
    .map((n) => ({ t: n.textContent.trim(), ...at(n), fs: px(getComputedStyle(n).fontSize) }));
  // 판 = 572×254 검정 블록
  const plate = all.filter((e) => {
    const r = e.getBoundingClientRect();
    return Math.abs(r.width - 572) < 2 && Math.abs(r.height - 254) < 2;
  })[0];
  return {
    hair: [...new Set(hair)],
    kpi: big.map((b) => ({ t: b.t, x: b.x, y: b.y, fs: b.fs })),
    plate: plate ? at(plate) : null,
    title: txt('LX 관리자 대시보드'),
    notice: txt('고위험 탐지 건'),
    backbone: txt('AI 기반 모델'),
    approve: txt('카드 발행 승인 대기'),
    railway: txt('관리 바로가기'),
    footer: txt('LX 한국국토정보공사'),
  };
};

/* ── 원판 dc.html 실측 ────────────────────────────────────────────────── */
async function measureMaster(file) {
  const c = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const p = await c.newPage();
  await p.route('**/design-canvas/v2/support.js', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  await p.route('**/design-canvas/v2/*.jpg', (r) => r.continue({ url: r.request().url().replace('/v2/', '/v2/img/') }));
  await p.goto(`http://localhost:${PORT}/design-canvas/v2/${file}`, { waitUntil: 'networkidle' });
  await p.addStyleTag({ content: 'x-dc,helmet{display:block}helmet{display:none}body{margin:0}' });
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(800);
  const m = await p.evaluate(PROBE);
  await c.close();
  return m;
}

/* ── 구현 촬영 ────────────────────────────────────────────────────────── */
async function shoot(mode, out) {
  const c = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const p = await c.newPage();
  await p.addInitScript(() => localStorage.setItem('lx_logged_in', '1'));
  await p.goto(`http://localhost:${PORT}/landxi/proto/dashboard.html`, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => document.documentElement.dataset.plate === 'ready', null, { timeout: 60000 });
  await p.evaluate(() => document.fonts.ready);
  await p.waitForFunction(() => window.__dash.map && window.__dash.map.areTilesLoaded(), null, { timeout: 40000 }).catch(() => {});
  await p.waitForTimeout(1600);
  // 원판은 남원 셀 호버 상태다. 같은 셀을 세운다.
  await p.evaluate((m) => {
    window.__dash.setMode(m);
    window.__dash.showCell(window.__dash.indexOf(127.25, 35.5));
  }, mode);
  await p.waitForTimeout(500);
  await p.screenshot({ path: path.join(OUT, out) });
  const m = await p.evaluate(PROBE);
  await c.close();
  return m;
}

/* ── 나란히 붙이기 (좌 원판 / 우 구현) ────────────────────────────────── */
const dataURI = (f) => `data:image/png;base64,${fs.readFileSync(f).toString('base64')}`;
async function pair(masterPng, oursPng, out, label) {
  const c = await browser.newContext({ viewport: { width: W * 2, height: H + 34 }, deviceScaleFactor: 1 });
  const p = await c.newPage();
  await p.setContent(`<style>
      *{margin:0;box-sizing:border-box}
      body{background:#fff;font:13px/1 ui-sans-serif,system-ui,sans-serif;color:#111}
      .r{display:flex}
      .h{height:34px;display:flex;align-items:center;padding:0 12px;border-bottom:1px solid #ddd;letter-spacing:.02em}
      .c{width:${W}px}
      .c + .c{border-left:1px solid #ddd}
      img{display:block;width:${W}px;height:${H}px}
    </style>
    <div class="r">
      <div class="c"><div class="h">MASTER — ${label}</div><img src="${dataURI(masterPng)}"></div>
      <div class="c"><div class="h">OURS — ${label}</div><img src="${dataURI(oursPng)}"></div>
    </div>`);
  await p.waitForTimeout(300);
  await p.screenshot({ path: path.join(OUT, out) });
  await c.close();
  console.log('side-by-side', path.join(OUT, out));
}

const mAI = await measureMaster('B5-Dashboard.dc.html');
const mData = await measureMaster('B5-Dashboard-Data.dc.html');
const oAI = await shoot('ai', 'dashboard-B5-ours.png');
const oData = await shoot('data', 'dashboard-B5-ours-data.png');

await pair(path.join(RND, 'B5-Dashboard.png'), path.join(OUT, 'dashboard-B5-ours.png'), 'dashboard-vs-B5.png', 'B5 12.8 · AI 분석 결과');
await pair(path.join(RND, 'B5-Dashboard-Data.png'), path.join(OUT, 'dashboard-B5-ours-data.png'), 'dashboard-vs-B5-data.png', 'B5 12.8 · AI 학습데이터 구축 현황');

/* ── 편차 표 ──────────────────────────────────────────────────────────── */
const diff = (a, b, key) => {
  const A = a[key];
  const B = b[key];
  if (!A || !B) return `${key}: (없음 ${!A ? 'master' : ''}${!B ? 'ours' : ''})`;
  const d = ['x', 'y', 'w', 'h', 'fs'].filter((k) => A[k] != null && B[k] != null)
    .map((k) => `${k} ${A[k]}→${B[k]} Δ${Math.round((B[k] - A[k]) * 100) / 100}`);
  return `${key}: ${d.join(' · ')}`;
};
console.log('\n── 밴드/폰트 편차 (master → ours) ──');
for (const k of ['title', 'notice', 'backbone', 'approve', 'railway', 'footer', 'plate']) console.log(' ', diff(mAI, oAI, k));
console.log('  헤어라인 master:', mAI.hair.join(' '));
console.log('  헤어라인 ours  :', oAI.hair.join(' '));
console.log('  KPI master:', mAI.kpi.map((k) => `${k.t}@${k.x},${k.y}/${k.fs}`).join(' '));
console.log('  KPI ours  :', oAI.kpi.map((k) => `${k.t}@${k.x},${k.y}/${k.fs}`).join(' '));
console.log('\n  (data) 헤어라인 master:', mData.hair.join(' '));
console.log('  (data) 헤어라인 ours  :', oData.hair.join(' '));

await browser.close();
