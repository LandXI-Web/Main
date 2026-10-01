// 설계 7차(chatgeo-talk) — XI ChatGEO 대화 실태 조사. 실제 로그인 폼으로 들어가(세션 주입 0) 역할별 흔한 질문을 채팅창에 넣고,
// 답 · 계획 줄 · 블록(차트 · 파일 · 영상) · 지도 동작 기록 · 지도 실제 변화(중심 · 줌 · 시점 · 층) · 캡처를 shots/ 에 남긴다(shots/ 는 gitignore).
// 사용: node docs/superpowers/final/process/design-r7/chatgeo-talk/audit.mjs [--base http://localhost:4173] [--only staff|admin|tenant]
// 시험 표시: 질문에 context.test 를 달아 시험용 답 번호(run_test…)로 돌린다 — 개선 고리(못 한 요청 모으기)가 모으지 않는다(markTest).
// GPU: 질문은 한 번에 하나씩 차례로 보낸다(게이트웨이 대기열 경로). 분석 실행 확인 카드는 '취소'를 누른다(전역 분석을 돌리지 않는다).
import { chromium } from 'playwright';
import { frontDoor } from '../../../../../../landxi/v3/kit/lint/forbidden.mjs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(HERE, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const BASE = opt('--base', process.env.LX_BASE || 'http://localhost:4173');
const ONLY = opt('--only', null);
const SCREENS = (opt('--screen', '') || '').split(',').filter(Boolean);     // --screen xi-clean,ops-core — 그 화면만 다시 돈다
const OUT = opt('--out', 'audit.json');
const VP = { width: 1440, height: 900 };

/* 역할 × 화면 × 질문. 지도 이동 · 층 · 분석 · 숫자 · 비교 · 보고서 · 법령 · 못하는 것을 섞는다. 지역은 예시(남원 · 구례 · 무주 · 강남). */
const PLAN = [
  { role: 'staff', login: 'test@lx.or.kr', site: 'app', screen: 'lx-console', url: '/landxi/v3/lx-console/', qs: [
    '남원시로 이동해 줘',
    '구례군 확대해 줘',
    '영상 층 켜 줘',
    '현장 확인 필요 필지만 보여 줘',
    '지적선 켜 줘',
    '3D로 보여 줘',
    '이 지역 결과 요약해 줘',
    '남원시 의심 필지 읍면동별 차트로 보여 줘',
    '2024년과 2025년 영상을 나란히 비교해 줘',
    '지도에 범위를 그려서 그 안만 분석해 줘',
    '구례군과 남원시 의심 필지 수 비교해 줘',
    '남원시 보고서 초안 만들어 줘',
    '농지 전용 허가 근거 조문 알려 줘',
    '허가 없이 지은 건물에 물리는 이행강제금은 얼마야?',
    '지도 화면을 이미지로 저장해 줘',
    '서울 강남구 보여 줘',
  ] },
  { role: 'staff', login: 'test@lx.or.kr', site: 'app', screen: 'xi-clean', url: '/landxi/v3/xi-clean/?region=52190', qs: [
    '의심 필지 읍면동별 차트로 보여 줘',
    'AI 분석 결과 층 꺼 줘',
    '남원시 운봉읍으로 이동해서 비닐하우스 결과만 보여 줘',
    '남원시 전역 분석 실행해 줘',
  ] },
  { role: 'admin', login: 'lxadmin@lx.or.kr', site: 'admin', screen: 'ops-core', url: '/landxi/v3/ops-core/', qs: [
    '지금 GPU 상태 어때?',
    '기관별 사용량 차트로 보여 줘',
    '남원시로 이동해 줘',
    '분석 대기열 요약해 줘',
  ] },
  { role: 'tenant', login: 'lxadmin@lx.or.kr', tenant: 'namwon', screen: 'gov-report', url: '/landxi/v3/gov-report/', qs: [
    '우리 시 현장 확인 필요 필지 몇 건이야?',
    '구례군 결과 보여 줘',
    '운봉읍으로 이동해 줘',
    '대장에서 논인데 AI가 비닐하우스로 본 필지 보여 줘',
    '전역 분석 실행해 줘',
    '이 필지 영상 보고 설명해 줘',
    '보고서 초안 만들어 줘',
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

const snap = (page) => page.evaluate(() => (window.__maps || []).filter((m) => { try { return m.getContainer().isConnected; } catch { return false; } }).map((m) => {
  const c = m.getCenter(); const st = m.getStyle();
  const layers = (st?.layers || []).map((l) => ({ id: l.id, vis: m.getLayoutProperty(l.id, 'visibility') || 'visible' }));
  let agent = null; try { const s = m.getSource('agent'); agent = s ? (s._data?.features?.length ?? 'src') : null; } catch { /* */ }
  return { center: [+c.lng.toFixed(4), +c.lat.toFixed(4)], zoom: +m.getZoom().toFixed(2), pitch: +m.getPitch().toFixed(0), bearing: +m.getBearing().toFixed(0), layers, agent };
})).catch(() => []);

function diff(a, b) {
  const out = [];
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a[i], y = b[i];
    if (!x || !y) { out.push(y ? '지도 새로 생김' : '지도 사라짐'); continue; }
    if (Math.abs(x.center[0] - y.center[0]) > 0.0015 || Math.abs(x.center[1] - y.center[1]) > 0.0015) out.push(`중심 이동 ${x.center} → ${y.center}`);
    if (Math.abs(x.zoom - y.zoom) > 0.05) out.push(`줌 ${x.zoom} → ${y.zoom}`);
    if (x.pitch !== y.pitch || x.bearing !== y.bearing) out.push(`시점 ${x.pitch}/${x.bearing} → ${y.pitch}/${y.bearing}`);
    const xv = new Map(x.layers.map((l) => [l.id, l.vis]));
    for (const l of y.layers) { if (!xv.has(l.id)) out.push(`층 추가 ${l.id}`); else if (xv.get(l.id) !== l.vis) out.push(`층 ${l.id} ${xv.get(l.id)} → ${l.vis}`); }
    for (const l of x.layers) if (!y.layers.find((m) => m.id === l.id)) out.push(`층 제거 ${l.id}`);
    if (x.agent !== y.agent) out.push(`결과 도형 ${x.agent} → ${y.agent}`);
  }
  return out;
}

async function ask(page, q, tag) {
  const box = page.locator('#k-chat');
  if (await box.isHidden().catch(() => true)) { await page.locator('.k-chat-fab').click(); await page.waitForTimeout(300); }
  const input = page.locator('.k-ck-i');
  await input.fill(q);
  const before = await snap(page);
  const t0 = Date.now();
  await input.press('Enter');
  let confirm = null, state = 'busy';
  const deadline = Date.now() + 150000;
  while (Date.now() < deadline) {
    state = (await box.getAttribute('data-state')) || 'busy';
    const conf = page.locator('.k-ck-c:not([hidden])');
    if (!confirm && await conf.count() && await conf.locator('button').count()) {
      confirm = (await conf.locator('.k-ck-cq').innerText().catch(() => '')).trim();
      await page.screenshot({ path: path.join(SHOTS, `${tag}-confirm.png`) });
      await conf.locator('button.t-btn--2').click().catch(() => null);        // 취소 — 분석을 돌리지 않는다
    }
    if (state !== 'busy') break;
    await page.waitForTimeout(400);
  }
  await page.waitForTimeout(3600);                                              // 지도 동작 끝 신호(3초) · 애니메이션
  const ms = Date.now() - t0;
  const live = page.locator('.k-chat-msg.ai.is-live');
  const answer = (await live.locator('.k-ck-a').innerText().catch(() => '')).replace(/\s+\n/g, '\n').trim();
  const plan = await live.locator('.k-ck-plan li').evaluateAll((els) => els.map((e) => `${e.textContent.trim()}${/is-done/.test(e.className) ? ' ✓' : /is-fail/.test(e.className) ? ' ✗' : /is-wait/.test(e.className) ? ' …' : ''}`)).catch(() => []);
  const blocks = await live.locator('.k-ck-blocks').evaluate((el) => ({ hidden: el.hidden, kinds: [...el.children].map((c) => c.dataset.kind), h: Math.round(el.getBoundingClientRect().height), visible: !el.hidden && el.getClientRects().length > 0 && el.getBoundingClientRect().height > 8 })).catch(() => null);
  const ds = await box.evaluate((el) => ({ ...el.dataset })).catch(() => ({}));
  const after = await snap(page);
  await page.screenshot({ path: path.join(SHOTS, `${tag}.png`) });
  return { q, ms, state, confirm, answer, plan, blocks, acts: { sent: ds.acts, done: ds.actsDone, ok: ds.actsOk, verdict: ds.actsVerdict || null }, map: diff(before, after), mapBefore: before, mapAfter: after };
}

/* 시험 표시(개선 고리와의 약속 · impl-4/chat-rules 와 같은 방식) — 이 스크립트가 보내는 질문은 context.test 를 달아 시험용 답 번호(run_test…)로 돌게 하고,
   화면이 보내는 개선 신호(도움 안 됐어요 · 확인 카드 취소 · 지도 못 그림)와 '이제 됩니다' 본 것 처리는 서버로 보내지 않고 보낸 사실만 센다(실제 사용자의 막힘 · 알림만 남게). */
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
const browser = await chromium.launch();
let n = 0;
for (const step of PLAN) {
  if (ONLY && step.role !== ONLY) continue;
  if (SCREENS.length && !SCREENS.includes(step.screen)) continue;
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
    await page.locator('.k-chat-fab').waitFor({ timeout: 20000 });
    for (const q of step.qs) {
      n += 1;
      const tag = `${String(n).padStart(2, '0')}-${step.role}-${step.screen}`;
      const r = await ask(page, q, tag);
      results.push({ n, role: step.role, screen: step.screen, tag, ...r });
      console.log(`[${tag}] ${q}\n  → (${r.state} · ${Math.round(r.ms / 1000)}s${r.confirm ? ' · 확인 카드: ' + r.confirm : ''}) ${r.answer.replace(/\n+/g, ' / ').slice(0, 220)}\n  계획: ${r.plan.join(' · ') || '—'} | 블록: ${r.blocks?.kinds?.join(',') || '—'}${r.blocks && !r.blocks.visible && r.blocks.kinds?.length ? '(안 보임)' : ''} | 동작: ${r.acts.sent || 0}/${r.acts.ok || 0} ${r.acts.verdict || ''} | 지도: ${r.map.join(' · ') || '변화 없음'}`);
      await page.waitForTimeout(1500);
    }
  } catch (e) {
    console.log(`[${step.role}/${step.screen}] 실패: ${e.message}`);
    results.push({ role: step.role, screen: step.screen, error: String(e.message).slice(0, 300) });
  }
  if (errors.length) console.log(`  페이지 오류 ${errors.length}: ${errors.slice(0, 3).join(' | ')}`);
  await ctx.close();
}
await browser.close();
fs.writeFileSync(path.join(SHOTS, OUT), JSON.stringify(results, null, 2));
console.log(`끝 — ${results.length}건 · shots/${OUT} · 시험 표시(답 번호 run_test…) · 화면 신호 ${SENT.feedback.length} · 본 것 ${SENT.seen.length} 서버로 보내지 않음`);
