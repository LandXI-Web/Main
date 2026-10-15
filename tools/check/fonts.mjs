/* 글자 크기 검사(원칙 257 · 법전 §2-0 — words.mjs · numbers.mjs 옆) — 배포(커밋 · 게이트웨이 재시작) 때 돌린다.
   바깥 주소(app · admin · {기관}.land-xi.dev)를 로그인 폼으로 열어(세션 주입 없음 · 역할마다 로그인 한 번) 주요 화면의 보이는 글마다 계산된 글자 크기를 잰다.
     실패 ① 14px 미만 글(꼬리표 14 가 바닥) — 아래 '의도된 예외'만 뺀다.
     실패 ② 단계 밖 크기 — 단계 = 토큰 값(tokens-v2.2.css 의 --fs-* 를 그 화면에서 읽음 · 옛 이름 --fs-label · --fs-sub · --fs-h4 는 빼고).
   --widths 를 주면 같은 화면을 여러 폭으로 다시 재고, 칸 문제(가로 넘침 · 화면 밖 칸 · 제목 3줄 이상 · 한 단어만 남은 줄 · 글자 중간 끊김)도 적는다(경고 — 실패 아님).
   사용: node tools/check/fonts.mjs [--widths 1280,1366,1440,1920,2560] [--only gov,app,admin] [--chat] [--shots 폴더] [--json 파일]
         [--app https://app.land-xi.dev] [--admin https://admin.land-xi.dev] [--gov https://namwon.land-xi.dev] [--tenant namwon]
   --chat: XI맵 융합 대시보드를 XI ChatGEO 질문 하나로 열어 함께 잰다(AI 답 한 번 — 게이트웨이 대기열).
   바깥 로그인 한도(10분 20번) — 이 검사는 역할마다 한 번(최대 3번)만 로그인한다.
   비밀번호는 env LX_PW / DEV_PASSWORD 또는 server/.env 의 DEV_PASSWORD(화면 · 출력에 적지 않는다). */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const HW = process.env.LX_HW_BROWSERS || 'C:/Users/User/AppData/Local/ms-playwright';
if (fs.existsSync(path.join(HW, 'chromium-1234'))) process.env.PLAYWRIGHT_BROWSERS_PATH = HW;
if (!process.env.DEV_PASSWORD && !process.env.LX_PW) {
  try { const m = fs.readFileSync(path.join(ROOT, 'server/.env'), 'utf8').match(/^DEV_PASSWORD=(.*?)\s*$/m); if (m) process.env.DEV_PASSWORD = m[1]; } catch { /* 없음 */ }
}
process.env.LX_PW ||= process.env.DEV_PASSWORD || '';
const { chromium } = createRequire(path.join(ROOT, 'package.json'))('playwright');
const { frontDoor } = await import(pathToFileURL(path.join(ROOT, 'landxi/v3/kit/lint/forbidden.mjs')).href);

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const has = (k) => process.argv.includes(k);
const HOST = { app: arg('--app', 'https://app.land-xi.dev'), admin: arg('--admin', 'https://admin.land-xi.dev'), gov: arg('--gov', 'https://namwon.land-xi.dev') };
const TENANT = arg('--tenant', 'namwon');
const PW = process.env.LX_PW;
const WIDTHS = arg('--widths', '1440').split(',').map(Number).filter(Boolean);
const ONLY = new Set(arg('--only', 'gov,app,admin').split(','));
const SHOTS = arg('--shots');
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const HEIGHT = (w) => ({ 1280: 720, 1366: 768, 1440: 900, 1920: 1080, 2560: 1440 })[w] || Math.round(w * 0.5625);

/** 의도된 예외(14px 미만이어도 실패로 세지 않음) — 지도 라이브러리 기본 표시 · 개발자 서랍 · 검사 제외 표시 */
export const EXCEPT = [
  ['지도 라이브러리 출처 · 닫기 표시', '.maplibregl-ctrl-attrib, .maplibregl-popup-close-button, .maplibregl-ctrl'],
  ['개발자 서랍(?dev=1)', '.k-dev'],
  ['검사 제외 표시', '[data-lint-skip]'],
];

/* 화면 안에서 — 보이는 글의 글자 크기 · (폭마다) 칸 문제 */
function measure(except) {
  const W = innerWidth, H = innerHeight;
  const root = getComputedStyle(document.documentElement);
  const OLD = new Set(['--fs-label', '--fs-sub', '--fs-h4']);
  const steps = new Set();
  const walk = (sh) => {
    let rules; try { rules = sh.cssRules; } catch { return; }
    for (const r of rules) {
      if (r.styleSheet) walk(r.styleSheet);                    // @import(kit.css → tokens-v2.2.css)
      else if (r.selectorText === ':root' && r.style) for (const p of r.style) if (p.startsWith('--fs-') && !OLD.has(p)) { const v = parseFloat(root.getPropertyValue(p)); if (v) steps.add(v); }
    }
  };
  for (const sh of document.styleSheets) walk(sh);
  const skip = except.map(([, s]) => s).join(',');
  const vis = (el) => { const s = getComputedStyle(el); if (s.visibility === 'hidden' || s.display === 'none' || +s.opacity === 0) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const name = (el) => el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '');
  const sizes = {}, small = [], off = [], exempt = [];
  const seen = new Set();
  const look = (el, txt) => {
    if (seen.has(el)) return; seen.add(el);
    if (!vis(el)) return;
    const fs = Math.round(parseFloat(getComputedStyle(el).fontSize) * 10) / 10;
    const t = (txt || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    if (el.closest(skip)) { if (fs < 14) exempt.push({ fs, el: name(el), t }); return; }
    sizes[fs] = (sizes[fs] || 0) + 1;
    if (fs < 14) small.push({ fs, el: name(el), t });
    else if (!steps.has(fs)) off.push({ fs, el: name(el), t });
  };
  const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = tw.nextNode())) {
    const el = n.parentElement; if (!el || /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|OPTION)$/.test(el.tagName)) continue;
    if (!n.nodeValue.trim()) continue;
    look(el, el.textContent);
  }
  for (const el of document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=range]):not([type=file]), textarea, select')) look(el, el.value || el.placeholder || el.getAttribute('aria-label'));
  /* 칸 문제(경고) */
  const lay = { overX: document.documentElement.scrollWidth - document.documentElement.clientWidth, outside: [], heads: [], orphans: [], split: [] };
  const clipped = (el) => { for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const s = getComputedStyle(p); if (s.overflowX !== 'visible' || s.overflowY !== 'visible') return p; } return null; };
  for (const el of document.querySelectorAll('body *')) {
    if (el.closest('.maplibregl-map canvas, svg, .k-dev, [hidden], .k-toast') || !vis(el)) continue;
    const r = el.getBoundingClientRect(), s = getComputedStyle(el);
    if (r.right > W + 1 && r.left < W) { const c = clipped(el); if (!c || c.getBoundingClientRect().right > W + 1) lay.outside.push(name(el) + ' +' + Math.round(r.right - W)); }
    if (/^H[1-4]$/.test(el.tagName) && el.textContent.trim().length > 3 && el.children.length <= 2) {
      const lh = parseFloat(s.lineHeight) || parseFloat(s.fontSize) * 1.3; const lines = Math.round(r.height / lh);
      if (lines > 2) lay.heads.push(`${name(el)} ${lines}줄 «${el.textContent.trim().slice(0, 24)}»`);
    }
    if (r.height > parseFloat(s.fontSize) * 1.9) {
      const tn = [...el.childNodes].find((x) => x.nodeType === 3 && x.nodeValue.trim()); if (!tn) continue;
      const re = /\S+/g; let m; const tops = [];
      while ((m = re.exec(tn.textContent))) {
        const rg = document.createRange(); rg.setStart(tn, m.index); rg.setEnd(tn, m.index + m[0].length);
        const rs = [...rg.getClientRects()].filter((q) => q.width > 0);
        if (new Set(rs.map((q) => Math.round(q.top))).size > 1) lay.split.push(`${name(el)} «${m[0]}»`);     // 글자 중간 끊김(§2-1)
        if (rs[0]) tops.push([Math.round(rs[0].top), m[0]]);
      }
      if (el.childElementCount || tops.length < 3) continue;
      const lines = []; for (const [t, w] of tops) { const L = lines.find((l) => Math.abs(l.t - t) < 4); if (L) L.w.push(w); else lines.push({ t, w: [w] }); }
      if (lines.length >= 2 && lines[lines.length - 1].w.length === 1 && lines[lines.length - 1].w[0].length <= 4) lay.orphans.push(`${name(el)} «…${lines[lines.length - 1].w[0]}»`);
    }
  }
  for (const k of ['outside', 'heads', 'orphans', 'split']) lay[k] = [...new Set(lay[k])].slice(0, 10);
  return { vw: W, vh: H, steps: [...steps].sort((a, b) => a - b), sizes, small: small.slice(0, 30), nSmall: small.length, off: off.slice(0, 30), nOff: off.length, exempt: exempt.slice(0, 10), nExempt: exempt.length, lay };
}

const results = [];      // {screen, url, widths:[measure + errors]}
const browser = await chromium.launch({ channel: 'chromium' }).catch(() => chromium.launch());

async function session(base, login, tenant) {
  const ctx = await browser.newContext({ viewport: { width: WIDTHS[0], height: HEIGHT(WIDTHS[0]) }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const st = { errors: [] };
  page.on('console', (m) => { if (m.type() === 'error') st.errors.push(m.text().slice(0, 160)); });
  page.on('pageerror', (e) => st.errors.push(String(e).slice(0, 160)));
  await frontDoor(page, base, login, tenant ? { tenant, password: PW } : { password: PW });     // 로그인 한 번(다시 시도하지 않는다 — 바깥 로그인 한도)
  await page.waitForURL((u) => !/\/login\/?$/.test(u.pathname), { timeout: 30000 }).catch(() => {});
  if (/\/login\/?$/.test(new URL(page.url()).pathname)) {
    const why = /시도가 너무 많습니다/.test(await page.innerText('body').catch(() => '')) ? ' — 로그인 시도가 너무 많습니다(10분 뒤 다시)' : '';
    throw new Error(`로그인하지 못했습니다(${new URL(base).hostname})${why}`);
  }
  return { ctx, page, st };
}
const slug = (s) => s.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 60);
/** 화면 하나 — 열고(필요하면 누르기) 폭마다 재기. url 이 없으면 지금 화면 그대로(앞 화면에서 이어 누르기) */
async function screen(s, name, url, { wait, act, ms = 2500 } = {}) {
  s.st.errors = [];
  if (url) {
    await s.page.setViewportSize({ width: WIDTHS[0], height: HEIGHT(WIDTHS[0]) });
    await s.page.goto(url, { waitUntil: 'domcontentloaded' });
    if (wait) await s.page.waitForSelector(wait, { timeout: 30000 }).catch(() => s.st.errors.push(`기다린 칸이 안 보임: ${wait}`));
    await s.page.waitForTimeout(ms);
  }
  if (act) { try { await act(s.page); await s.page.waitForTimeout(1500); } catch (e) { s.st.errors.push(`누르기 실패: ${String(e.message || e).slice(0, 120)}`); } }
  const widths = [];
  for (const w of WIDTHS) {
    await s.page.setViewportSize({ width: w, height: HEIGHT(w) });
    await s.page.waitForTimeout(900);
    const m = await s.page.evaluate(measure, EXCEPT);
    if (SHOTS) await s.page.screenshot({ path: path.join(SHOTS, `${String(results.length + 1).padStart(2, "0")}-${slug(name)}-${w}.png`) }).catch(() => {});
    widths.push({ w, ...m });
  }
  const u = new URL(s.page.url());
  results.push({ screen: name, url: u.pathname + u.search + u.hash, widths, errors: [...s.st.errors] });
}

/* XI맵 — 지도 · 결과 층이 다 그려질 때까지 */
const xiReady = (p) => p.waitForFunction(() => window.__xc?.board?.nat?.layers?.length > 0 && window.__xc.boot?.shown, null, { timeout: 60000, polling: 200 }).catch(() => {});
const settle = (p) => p.waitForFunction(() => !window.__xc.map.isMoving() && window.__xc.map.areTilesLoaded(), null, { timeout: 25000 }).catch(() => {});
const jump = (x, y, z) => async (p) => { await p.evaluate(([a, b, c]) => window.__xc.map.jumpTo({ center: [a, b], zoom: c }), [x, y, z]); await settle(p); await p.waitForTimeout(2500); };
/** 지도 가운데에 가까운 결과 객체 하나를 눌러 그 자리 고치기 칸을 연다(삭제 · 고치기는 누르지 않음) */
const openEdit = (center, re) => async (p) => {
  await p.evaluate((c) => window.__xc.map.jumpTo({ center: c, zoom: 16.2 }), center);
  await settle(p);
  await p.waitForFunction((src) => window.__xc.map.getStyle().layers.some((l) => new RegExp(src).test(l.id) && l.type === 'fill'), re, { timeout: 30000 }).catch(() => {});
  await settle(p); await p.waitForTimeout(2000);
  const pt = await p.evaluate((src) => {
    const m = window.__xc.map, ls = m.getStyle().layers.filter((l) => new RegExp(src).test(l.id) && l.type === 'fill').map((l) => l.id);
    const c = m.getCanvas(), r = c.getBoundingClientRect(); let best = null;
    for (const f of m.queryRenderedFeatures({ layers: ls })) {
      if (!/Polygon/.test(f.geometry.type)) continue;
      const g = f.geometry.type === 'Polygon' ? f.geometry.coordinates[0] : f.geometry.coordinates[0][0];
      const s = m.project([g.reduce((a, q) => a + q[0], 0) / g.length, g.reduce((a, q) => a + q[1], 0) / g.length]);
      if (!m.queryRenderedFeatures(s, { layers: ls }).length) continue;
      const d = Math.hypot(s.x - c.clientWidth / 2, s.y - c.clientHeight / 2);
      if (!best || d < best.d) best = { d, x: s.x + r.x, y: s.y + r.y };
    }
    return best;
  }, re);
  if (!pt) throw new Error('결과 객체를 찾지 못함');
  await p.mouse.click(pt.x, pt.y);
  await p.waitForFunction(() => { const c = document.querySelector('.xe-card:not([hidden])'); return c && !/불러오는 중/.test(c.innerText); }, null, { timeout: 30000 });
};

try {
  /* ── 기관(남원 등) ── */
  if (ONLY.has('gov')) {
    const s = await session(HOST.gov, 'lxadmin@lx.or.kr', TENANT);
    const G = HOST.gov + '/landxi/v3/';
    await screen(s, '기관 · 내 서비스', G + 'gov-select/?list=1', { wait: '.gs-page' });
    const c = await s.page.evaluate(() => [...document.querySelectorAll('a[href*="service="]')].map((a) => new URL(a.href).searchParams.get('service')).find(Boolean));
    if (c) {
      await screen(s, '기관 · 서비스 대시보드', G + `gov-select/?service=${encodeURIComponent(c)}`, { wait: '.gs-page' });
      await screen(s, '기관 · 보고서', G + `gov-report/?service=${encodeURIComponent(c)}&tab=report`, { wait: '#rp-form', ms: 3500 });
      await screen(s, '기관 · 필지 목록 + 상세', G + `gov-report/?service=${encodeURIComponent(c)}&tab=sus`, { wait: '.gr-board', ms: 3500,
        act: async (p) => { const r = p.locator('#sus-table tbody tr').first(); if (await r.count()) await r.click(); } });
    }
    await screen(s, '기관 · 요청하기(분석 요청)', G + 'gov-request/', { wait: '.gq-grid' });
    await screen(s, '기관 · 요청하기(촬영 요청)', G + 'gov-request/?tab=shoot', { wait: '.gq-grid' });
    await s.ctx.close();
  }
  /* ── LX 직원(app) ── */
  if (ONLY.has('app')) {
    const s = await session(HOST.app, 'test@lx.or.kr');
    const A = HOST.app + '/landxi/v3/';
    await screen(s, 'LX 직원 · 대시보드', A + 'lx-console/', { wait: 'main' });
    await screen(s, 'LX 직원 · 분석하기', A + 'lx-analyze/', { wait: '.la-ac' });
    await screen(s, 'LX 직원 · 지도 서비스', A + 'lx-map/', { wait: '.lm-groups', ms: 4000 });
    await screen(s, 'LX 직원 · 요청함', A + 'lx-inbox/', { wait: 'main' });
    await screen(s, 'LX 직원 · 프로젝트', A + 'lx-project/', { wait: 'main' });
    const pid = await s.page.evaluate(async () => {
      const t = JSON.parse(localStorage.getItem('lx_api_session') || 'null')?.token;
      const j = await fetch('/api/v1/projects?scope=all', { headers: t ? { authorization: 'Bearer ' + t } : {} }).then((r) => r.json()).catch(() => null);
      return (j?.items || [])[0]?.id || null;
    });
    if (pid) {
      await screen(s, 'LX 직원 · 프로젝트 학습', A + `lx-train/?project=${encodeURIComponent(pid)}&stage=train`, { wait: '.tb-hist' });
      await screen(s, 'LX 직원 · 배포 신청서', A + `lx-release/?project=${encodeURIComponent(pid)}&stage=publish`, { wait: 'main', ms: 3500 });
    }
    const X = A + 'xi-clean/';
    const xi = { wait: '.xc-stage', ms: 1000, act: async (p) => { await xiReady(p); await settle(p); await p.waitForTimeout(1500); } };
    await screen(s, 'LX 직원 · XI맵(전국)', X, xi);
    await screen(s, 'LX 직원 · XI맵(시군구 · 남원)', null, { act: jump(127.45, 35.42, 10) });
    for (const v of ['a', 'b']) {
      await screen(s, `LX 직원 · XI맵 결과 표시 시안 ${v === 'a' ? 'ⓐ' : 'ⓑ'}`, X, { ...xi, act: async (p) => { await xi.act(p); await p.locator(`.xv-sw button[data-v="${v}"]`).click(); await p.waitForTimeout(900); } });
    }
    await s.page.locator('.xv-sw button[data-v="now"]').click().catch(() => {});      // 시안 고른 것을 '지금'으로 되돌려 둔다
    await screen(s, 'LX 직원 · XI맵 고치기 칸', X, { ...xi, act: async (p) => { await xi.act(p); await openEdit([127.5345, 35.4335], '^xb-r-')(p); } });
    if (has('--chat')) {
      await screen(s, 'LX 직원 · XI맵 융합 대시보드', X, { ...xi, act: async (p) => {
        await xi.act(p);
        const inp = p.locator('.k-chat-root[data-dock] .k-ck-i');
        await inp.click(); await inp.pressSequentially('남원시 현황 보여 줘', { delay: 25 }); await inp.press('Enter');
        await p.waitForFunction(() => window.__xc.dash?.title && !document.querySelector('.xd').hidden, null, { timeout: 90000 });
        await settle(p); await p.waitForTimeout(1800);
      } });
    }
    await s.ctx.close();
  }
  /* ── LX 관리자(admin) ── */
  if (ONLY.has('admin')) {
    const s = await session(HOST.admin, 'lxadmin@lx.or.kr');
    const O = HOST.admin + '/landxi/v3/';
    await screen(s, 'LX 관리자 · 대시보드', O + 'ops-core/', { wait: 'main' });
    await screen(s, 'LX 관리자 · 요청 관리', O + 'ops-core/#/approvals', { wait: 'main' });
    await screen(s, 'LX 관리자 · 인프라', O + 'ops-infra/', { wait: 'main' });
    await screen(s, 'LX 관리자 · 배포 신청', O + 'ops-infra/#/deploys', { wait: 'main', ms: 3000,
      act: async (p) => { const r = p.locator('.rv-grid tbody tr').first(); if (await r.count()) await r.click(); } });
    await screen(s, 'LX 관리자 · 배포 → XI 재학습', O + 'ops-infra/#/deploys/retrain', { wait: '.rt-when', ms: 2000 });
    await screen(s, 'LX 관리자 · 공유 데이터(영상 + 상세)', O + 'ops-infra/#/shared', { wait: '.sd-tbl', ms: 2000,
      act: async (p) => { await p.locator('.sd-row').first().click(); await p.waitForTimeout(2500); } });
    await screen(s, 'LX 관리자 · 공유 데이터 → 학습 데이터', null, {
      act: async (p) => { await p.locator('.sd-tabs button', { hasText: '학습 데이터' }).click(); await p.waitForSelector('.sd-body table, .sd-none', { timeout: 30000 }); } });
    await screen(s, 'LX 관리자 · 공유 데이터 → 행정 자료', null, {
      act: async (p) => { await p.locator('.sd-tabs button', { hasText: '행정 자료' }).click(); await p.waitForSelector('.sd-sub', { timeout: 30000 }); } });
    await s.ctx.close();
  }
} finally {
  await browser.close();
}

/* ── 표 ── */
let bad = 0;
const line = (s) => process.stdout.write(s + '\n');
line(`글자 크기 검사 ${new Date().toISOString().slice(0, 16).replace('T', ' ')} · 화면 ${results.length}개 · 폭 ${WIDTHS.join(' · ')} · 바닥 14px · 단계 = 토큰 값(옛 이름 빼고)`);
const all = {};
for (const r of results) {
  const nS = Math.max(0, ...r.widths.map((x) => x.nSmall)), nO = Math.max(0, ...r.widths.map((x) => x.nOff)), e = r.errors.length;
  const warn = r.widths.filter((x) => x.lay.overX > 0 || x.lay.outside.length || x.lay.heads.length || x.lay.orphans.length || x.lay.split.length);
  for (const x of r.widths) for (const [k, v] of Object.entries(x.sizes)) all[k] = (all[k] || 0) + v;
  if (nS || nO || e) bad++;
  line(`${nS || nO || e ? '✗' : '✓'} ${r.screen} — 14px 미만 ${nS} · 단계 밖 ${nO} · 화면 오류 ${e}${warn.length ? ` · 칸 경고(${warn.map((x) => x.w).join(',')})` : ''}`);
  const w0 = r.widths.find((x) => x.nSmall || x.nOff) || r.widths[0];
  for (const x of w0.small.slice(0, 6)) line(`    작음 ${x.fs}px ${x.el} «${x.t}»`);
  for (const x of w0.off.slice(0, 6)) line(`    단계 밖 ${x.fs}px ${x.el} «${x.t}»`);
  for (const x of r.errors.slice(0, 3)) line(`    오류 ${x}`);
  for (const x of warn) line(`    칸(${x.w}) 넘침 ${x.lay.overX} · 화면 밖 ${x.lay.outside.join(' / ') || 0} · 제목 3줄 ${x.lay.heads.join(' / ') || 0} · 한 단어 줄 ${x.lay.orphans.join(' / ') || 0} · 글자 중간 끊김 ${x.lay.split.join(' / ') || 0}`);
}
line(`쓰인 크기(px · 글 수): ${Object.entries(all).sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}×${v}`).join(' · ')}`);
line(`의도된 예외: ${EXCEPT.map(([k]) => k).join(' · ')}`);
line(bad ? `실패 — 14px 미만 · 단계 밖 크기 · 화면 오류가 있는 화면 ${bad}개` : '통과 — 14px 미만 0 · 단계 밖 크기 0 · 화면 오류 0');
const out = arg('--json');
if (out) fs.writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), widths: WIDTHS, except: EXCEPT, results }, null, 1));
process.exit(bad ? 1 : 0);
