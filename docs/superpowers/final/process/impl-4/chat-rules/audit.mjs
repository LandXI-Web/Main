/* 구현 4차 · XI ChatGEO 대화 규칙 — 실태 31문 다시 재기(설계 7차 chatgeo-talk/audit.mjs 와 같은 질문 · 같은 화면 · 같은 계정).
   달라진 점: ① 판정을 손이 아니라 같은 기준으로 센다(아래 classify) ② 질문마다 언어 모델을 썼는지 run 기록에서 센다 ③ 답 아래 버튼 · '다른 뜻이면'을 남긴다.
   로그인 = 로그인 폼(kit/lint/forbidden.mjs frontDoor · 세션 주입 없음). 질문은 한 번에 하나씩(게이트웨이 대기열 경로).
   실행 확인 카드(분석 실행 · 의뢰 보내기)는 '취소'를 누른다 — 분석 · 의뢰를 만들지 않는다.
   사용: node docs/superpowers/final/process/impl-4/chat-rules/audit.mjs --label before|after [--base http://localhost:4173] [--screen xi-clean,...]
   결과: results-{label}.json(질문마다 답 · 버튼 · 지도 변화 · 판정 · 모델 사용) · shots/{label}/NN-*.png(gitignore) */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../../../..');
const { frontDoor } = await import(pathToFileURL(path.join(ROOT, 'landxi/v3/kit/lint/forbidden.mjs')).href);
const HW = process.env.LX_HW_BROWSERS || 'C:/Users/User/AppData/Local/ms-playwright';
const useHw = fs.existsSync(path.join(HW, 'chromium-1234')) && !process.argv.includes('--soft');
if (useHw) process.env.PLAYWRIGHT_BROWSERS_PATH = HW;
const { chromium } = createRequire(path.join(ROOT, 'package.json'))('playwright');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const LABEL = arg('--label', 'after');
const BASE = arg('--base', process.env.LX_BASE || 'http://localhost:4173');
const SCREENS = (arg('--screen', '') || '').split(',').filter(Boolean);
const SHOTS = path.join(HERE, 'shots', LABEL); fs.mkdirSync(SHOTS, { recursive: true });
const VP = { width: 1440, height: 900 };

/* 설계 7차와 같은 31문. expect = '물은 것과 다른 일'을 가리는 기준(그 질문에서 사용자가 원한 것) — 지도 화면은 지도 결과로, 지도 없는 화면은 답 · 버튼으로 */
const inBox = (c, b) => c && b && c[0] >= b[0] && c[0] <= b[2] && c[1] >= b[1] && c[1] <= b[3];
const PLAN = [
  { role: 'staff', login: 'test@lx.or.kr', site: 'app', screen: 'lx-console', url: '/landxi/v3/lx-console/', qs: [
    { q: '남원시로 이동해 줘' },
    { q: '구례군 확대해 줘', expect: (r) => (r.hasMap ? inBox(r.mapAfter[0]?.center, r.box('구례군')) : /구례군/.test(r.answer + r.buttons.join(' '))) },
    { q: '영상 층 켜 줘' },
    { q: '현장 확인 필요 필지만 보여 줘' },
    { q: '지적선 켜 줘' },
    { q: '3D로 보여 줘' },
    { q: '이 지역 결과 요약해 줘' },
    { q: '남원시 의심 필지 읍면동별 차트로 보여 줘' },
    { q: '2024년과 2025년 영상을 나란히 비교해 줘' },
    { q: '지도에 범위를 그려서 그 안만 분석해 줘' },
    { q: '구례군과 남원시 의심 필지 수 비교해 줘', expect: (r) => !/대장/.test(r.answer.split(/(?<=[.다])\s/)[0] || '') },
    { q: '남원시 보고서 초안 만들어 줘' },
    { q: '농지 전용 허가 근거 조문 알려 줘' },
    { q: '허가 없이 지은 건물에 물리는 이행강제금은 얼마야?' },
    { q: '지도 화면을 이미지로 저장해 줘' },
    { q: '서울 강남구 보여 줘' },
  ] },
  { role: 'staff', login: 'test@lx.or.kr', site: 'app', screen: 'xi-clean', url: '/landxi/v3/xi-clean/?region=52190', qs: [
    { q: '의심 필지 읍면동별 차트로 보여 줘' },
    { q: 'AI 분석 결과 층 꺼 줘' },
    { q: '남원시 운봉읍으로 이동해서 비닐하우스 결과만 보여 줘', expect: (r) => /운봉읍/.test(r.answer) },
    { q: '남원시 전역 분석 실행해 줘' },
  ] },
  { role: 'admin', login: 'lxadmin@lx.or.kr', site: 'admin', screen: 'ops-core', url: '/landxi/v3/ops-core/', qs: [
    { q: '지금 GPU 상태 어때?' },
    { q: '기관별 사용량 차트로 보여 줘', expect: (r) => !/AI 도우미|토큰/.test(r.answer) },
    { q: '남원시로 이동해 줘' },
    { q: '분석 대기열 요약해 줘' },
  ] },
  { role: 'tenant', login: 'lxadmin@lx.or.kr', tenant: 'namwon', screen: 'gov-report', url: '/landxi/v3/gov-report/', qs: [
    { q: '우리 시 현장 확인 필요 필지 몇 건이야?', expect: (r) => /현장 확인 필요/.test(r.answer) && r.chips > 0 },
    { q: '구례군 결과 보여 줘' },
    { q: '운봉읍으로 이동해 줘' },
    { q: '대장에서 논인데 AI가 비닐하우스로 본 필지 보여 줘', expect: (r) => /비닐하우스/.test(r.answer) && !/건물로|AI\s*건물|건물\s*근거/.test(r.answer) },   // 물은 조건(비닐하우스)을 다른 조건(건물)으로 바꿔 세지 않는다
    { q: '전역 분석 실행해 줘', expect: (r) => /의뢰|분석 요청/.test((r.confirm || '') + r.answer + r.buttons.join(' ')) },   // 기관의 분석 실행 = 분석 요청(원칙 113 · 10-01 전 말 '의뢰')
    { q: '이 필지 영상 보고 설명해 줘' },
    { q: '보고서 초안 만들어 줘' },
  ] },
];

/* 지도 인스턴스를 잡아 두는 초기 스크립트(화면 코드 수정 0) — maplibregl.Map 을 감싸 window.__maps 에 모은다 */
const INIT = `(() => {
  const iv = setInterval(() => {
    const g = window.maplibregl; if (!g || !g.Map || g.Map.__aud) return;
    const O = g.Map;
    function W(...a) { const m = new O(...a); (window.__maps = window.__maps || []).push(m); return m; }
    W.prototype = O.prototype; Object.setPrototypeOf(W, O); W.__aud = true;
    g.Map = W; clearInterval(iv);
  }, 2);
})();`;
const snap = (page) => page.evaluate(() => (window.__maps || []).filter((m) => { try { return m.getContainer().isConnected && m.getContainer().offsetParent !== null; } catch { return false; } }).map((m) => {
  const c = m.getCenter(); const st = m.getStyle();
  const layers = (st?.layers || []).map((l) => ({ id: l.id, vis: m.getLayoutProperty(l.id, 'visibility') || 'visible' }));
  const filt = {}; for (const l of st?.layers || []) { try { const f = m.getFilter(l.id); if (f) filt[l.id] = JSON.stringify(f).length; } catch { /* */ } }
  return { center: [+c.lng.toFixed(4), +c.lat.toFixed(4)], zoom: +m.getZoom().toFixed(2), pitch: +m.getPitch().toFixed(0), bearing: +m.getBearing().toFixed(0), layers, filt };
})).catch(() => []);
function diff(a, b) {
  const out = [];
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a[i], y = b[i];
    if (!x || !y) { out.push(y ? '지도 새로 생김' : '지도 사라짐'); continue; }
    if (Math.abs(x.center[0] - y.center[0]) > 0.0015 || Math.abs(x.center[1] - y.center[1]) > 0.0015) out.push(`중심 이동`);
    if (Math.abs(x.zoom - y.zoom) > 0.05) out.push(`줌 ${x.zoom} → ${y.zoom}`);
    if (x.pitch !== y.pitch || x.bearing !== y.bearing) out.push(`시점 ${x.pitch} → ${y.pitch}`);
    const xv = new Map(x.layers.map((l) => [l.id, l.vis]));
    for (const l of y.layers) { if (!xv.has(l.id)) out.push(`층 추가 ${l.id}`); else if (xv.get(l.id) !== l.vis) out.push(`층 ${l.id} ${xv.get(l.id)} → ${l.vis}`); }
    for (const l of x.layers) if (!y.layers.find((m) => m.id === l.id)) out.push(`층 제거 ${l.id}`);
    for (const k of Object.keys({ ...x.filt, ...y.filt })) if (x.filt[k] !== y.filt[k]) out.push(`거름 ${k}`);
  }
  return out;
}

/* 판정(같은 기준 · 전/후 같게)
   막다른 답 = 거절 · 못 함 말로 끝났는데 누를 것(다음 버튼 · XI맵 열기 · 파일 · 확인 카드)이 하나도 없다
   말과 화면 다름 = "바꿨다"고 했는데 지도 변화 0 · "못 그렸다"고 했는데 지도에 새 층 · 동작을 보냈는데 끝 신호가 오지 않았는데 말이 없다 */
const REFUSE = /할\s*수\s*없|없습니다|못했습니다|못\s*했습니다|찾지\s*못|아닙니다|아직/;
const CLAIM = /(옮겼|이동했|확대했|축소했|기울였|바꿨|켰습니다|껐습니다|표시했|칠했|그렸|나눠\s*놓았|나란히\s*놓았|켜\s*두었)/;
const NOCHANGE_OK = /이미|못|없어|없습니다|않/;
function classify(r) {
  const clickable = r.chips + r.links + r.files + (r.confirm ? 1 : 0) + (r.alt ? 1 : 0);
  const sentences = r.answer.split(/\n+|(?<=[.다])\s+/).map((s) => s.trim()).filter(Boolean);
  const refusing = REFUSE.test(r.answer);
  const deadend = refusing && clickable === 0 && !r.map.length;
  const claimNoChange = sentences.some((s) => CLAIM.test(s) && !NOCHANGE_OK.test(s)) && r.hasMap !== undefined && !r.map.length && !r.navigated;
  const saidFailButDrawn = /그리지\s*못|켜지\s*못|이동하지\s*못|못\s*그렸/.test(r.answer) && r.map.some((m) => /^층 추가/.test(m));
  const silentPending = +r.acts.sent > 0 && +r.acts.done < +r.acts.sent && !/못|않|확인되지/.test(r.answer);
  const mismatch = claimNoChange || saidFailButDrawn || silentPending;
  const wrong = r.expectFail;
  return { deadend, mismatch, wrong, why: [deadend && '막다른 답', claimNoChange && '말했는데 지도 변화 0', saidFailButDrawn && '못 그렸다는데 그려짐', silentPending && '동작 끝 신호 없음 · 말 없음', wrong && '물은 것과 다른 일'].filter(Boolean) };
}

async function ask(page, item, tag) {
  const q = item.q;
  const box = page.locator('#k-chat');
  if (await box.isHidden().catch(() => true)) { await page.locator('.k-chat-fab').click(); await page.waitForTimeout(300); }
  const input = page.locator('.k-ck-i');
  await input.fill(q);
  const before = await snap(page);
  const url0 = page.url();
  const t0 = Date.now();
  await input.press('Enter');
  let confirm = null, state = 'busy';
  const deadline = Date.now() + 150000;
  while (Date.now() < deadline) {
    state = (await box.getAttribute('data-state').catch(() => null)) || 'busy';
    const conf = page.locator('.k-ck-c:not([hidden])');
    if (!confirm && await conf.count().catch(() => 0) && await conf.locator('button').count().catch(() => 0)) {
      confirm = (await conf.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
      await page.screenshot({ path: path.join(SHOTS, `${tag}-confirm.png`) });
      await conf.locator('button.t-btn--2').click().catch(() => null);        // 취소 — 분석 · 의뢰를 만들지 않는다
    }
    if (state !== 'busy') break;
    await page.waitForTimeout(400);
  }
  await page.waitForTimeout(3800);                                              // 지도 동작 끝 신호(3초) · 애니메이션
  const ms = Date.now() - t0;
  const navigated = page.url() !== url0;
  const live = page.locator('.k-chat-msg.ai').last();
  const answer = (await live.locator('.k-ck-a, .k-chat-a').first().innerText().catch(() => '')).replace(/\s+\n/g, '\n').trim();
  const plan = await live.locator('.k-ck-plan li, .k-chat-plan li').evaluateAll((els) => els.map((e) => `${e.textContent.trim()}${/is-done/.test(e.className) ? ' ✓' : /is-fail/.test(e.className) ? ' ✗' : /is-wait/.test(e.className) ? ' …' : ''}`)).catch(() => []);
  const ui = await live.evaluate((el) => {
    const vis = (x) => x && x.getClientRects().length > 0 && !x.closest('[hidden]');
    const btns = [...el.querySelectorAll('.k-chat-chip, .k-chat-next a, .k-chat-next button, .k-chat-acts a, .k-chat-acts button, .k-chat-alt button, .k-chat-alt a')].filter(vis);
    return {
      buttons: [...new Set(btns.map((b) => b.textContent.trim()))],
      chips: el.querySelectorAll('.k-chat-chip, .k-chat-acts button, .k-chat-next button').length,
      links: el.querySelectorAll('.k-chat-acts a, .k-chat-next a, a.k-chat-xi').length,
      files: el.querySelectorAll('.k-ck-file').length,
      alt: !!el.querySelector('.k-chat-alt'),
      kinds: [...el.querySelectorAll('[data-kind]')].map((x) => x.dataset.kind),
      chart: (() => { const c = el.querySelector('.k-ck-chart'); if (!c) return null; const r = c.getBoundingClientRect(); return { rows: c.querySelectorAll('.k-bar').length, h: Math.round(r.height) }; })(),
      numChips: el.querySelectorAll('.k-ck-n').length,
      helpful: !!el.querySelector('.k-chat-fb'),
    };
  }).catch(() => ({ buttons: [], chips: 0, links: 0, files: 0, alt: false, kinds: [], chart: null, numChips: 0 }));
  const ds = await box.evaluate((el) => ({ ...el.dataset })).catch(() => ({}));
  // 언어 모델을 썼나 — run 기록(model.backend · 토큰)
  const run = ds.run || null;
  let model = null;
  if (run) model = await page.evaluate(async (id) => { try { const { api } = await import('/landxi/v3/kit/util.js'); const r = await api('/agent/runs/' + id); return { id: r.model?.id || null, backend: r.model?.backend || null, tokens: r.tokens?.value ?? 0 }; } catch (e) { return { err: String(e?.message || e) }; } }, run).catch(() => null);
  const after = navigated ? [] : await snap(page);
  await page.screenshot({ path: path.join(SHOTS, `${tag}.png`) });
  const hasMap = before.length > 0;
  return { q, ms, state, confirm, answer, plan, ...ui, acts: { sent: ds.acts || '0', done: ds.actsDone || '0', ok: ds.actsOk || '0', verdict: ds.actsVerdict || null },
    map: navigated ? [] : diff(before, after), mapBefore: before, mapAfter: after, hasMap, navigated, run, llm: !!(model && model.backend && model.backend !== 'runtime' && (model.tokens || 0) > 0), model };
}

/* 시군구 범위(경계 비교용) — 서버 지역 표에서(지역 고정값 0) */
async function regionBox(page, name) {
  return page.evaluate(async (nm) => { try { const { api } = await import('/landxi/v3/kit/util.js'); const j = await api('/regions?limit=400'); const x = (j.items || []).find((it) => it.name === nm || String(it.full || '').endsWith(nm)); return x?.bbox || null; } catch { return null; } }, name).catch(() => null);
}

/* 시험 표시(개선 고리와의 약속) — 이 스크립트가 보내는 질문은 context.test 를 달아 시험용 답 번호(run_test…)로 돌게 하고,
   화면이 보내는 개선 신호(도움 안 됐어요 · 확인 카드 취소 · 지도 못 그림)는 서버로 보내지 않고 보낸 사실만 센다(실제 사용자의 막힘만 모이게). */
const SENT = { feedback: [], seen: [] };
async function markTest(context) {
  await context.route(/\/api\/v1\/agent\/runs$/, async (route) => {
    const req = route.request();
    if (req.method() !== 'POST') return route.continue();
    try { const b = JSON.parse(req.postData() || '{}'); b.context = { ...(b.context || {}), test: true }; return route.continue({ postData: JSON.stringify(b) }); } catch { return route.continue(); }
  });
  await context.route(/\/api\/v1\/assist\/feedback$/, (route) => { try { SENT.feedback.push(JSON.parse(route.request().postData() || '{}').kind); } catch { /* */ } return route.fulfill({ status: 204, body: '' }); });
  await context.route(/\/api\/v1\/assist\/notices\/[^/]+\/seen$/, (route) => { SENT.seen.push(route.request().url().split('/').slice(-2)[0]); return route.fulfill({ status: 204, body: '' }); });
}
const results = [];
const launch = async () => {
  if (useHw) { try { return await chromium.launch({ channel: 'chromium', args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] }); } catch (e) { console.log('하드웨어 브라우저 실패 — 기본으로', String(e).slice(0, 120)); } }
  return chromium.launch();
};
const browser = await launch();
let n = 0;
for (const step of PLAN) {
  if (SCREENS.length && !SCREENS.includes(step.screen)) { n += step.qs.length; continue; }
  const ctx = await browser.newContext({ viewport: VP });
  await markTest(ctx);
  await ctx.addInitScript(INIT);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 200)));
  try {
    await frontDoor(page, BASE, step.login, step.tenant ? { tenant: step.tenant } : step.site);
    await page.goto(BASE + step.url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);
    await page.locator('.k-chat-fab').waitFor({ timeout: 30000 });
    const boxes = {};
    for (const it of step.qs) {
      n += 1;
      const tag = `${String(n).padStart(2, '0')}-${step.role}-${step.screen}`;
      if (!page.url().includes(step.url.split('?')[0])) { await page.goto(BASE + step.url, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(4000); }
      const r = await ask(page, it, tag);
      r.box = (nm) => boxes[nm];
      if (it.expect && /구례군/.test(it.q)) boxes['구례군'] = await regionBox(page, '구례군');
      r.expectFail = it.expect ? !it.expect(r) : false;
      delete r.box;
      const c = classify(r);
      results.push({ n, role: step.role, screen: step.screen, tag, ...r, verdict: c });
      console.log(`[${tag}] ${it.q}\n  → (${r.state} · ${Math.round(r.ms / 1000)}s${r.llm ? ' · 모델' : ''}${r.confirm ? ' · 카드: ' + r.confirm.slice(0, 60) : ''}) ${r.answer.replace(/\n+/g, ' / ').slice(0, 200)}\n  버튼: ${r.buttons.join(' | ') || '—'} | 동작: ${r.acts.sent}/${r.acts.ok} ${r.acts.verdict || ''} | 지도: ${r.map.slice(0, 4).join(' · ') || (r.hasMap ? '변화 없음' : '지도 없음')}${r.navigated ? ' · 화면 옮김' : ''}\n  판정: ${c.why.join(' · ') || '좋음'}`);
      await page.waitForTimeout(1200);
    }
  } catch (e) {
    console.log(`[${step.role}/${step.screen}] 실패: ${e.message}`);
    results.push({ role: step.role, screen: step.screen, error: String(e.message).slice(0, 300) });
  }
  if (errors.length) console.log(`  페이지 오류 ${errors.length}: ${errors.slice(0, 3).join(' | ')}`);
  results.push({ screen: step.screen, page_errors: errors });
  await ctx.close();
}
await browser.close();
const qs = results.filter((r) => r.q);
const sum = { label: LABEL, at: new Date().toISOString(), base: BASE, questions: qs.length,
  deadend: qs.filter((r) => r.verdict.deadend).length, mismatch: qs.filter((r) => r.verdict.mismatch).length, wrong: qs.filter((r) => r.verdict.wrong).length,
  llm: qs.filter((r) => r.llm).length, page_errors: results.filter((r) => r.page_errors).reduce((s, r) => s + r.page_errors.length, 0),
  test_marked: true, signals_held: { feedback: SENT.feedback.length, seen: SENT.seen.length } };
fs.writeFileSync(path.join(HERE, `results-${LABEL}.json`), JSON.stringify({ summary: sum, results }, null, 1));
console.log(JSON.stringify(sum));
