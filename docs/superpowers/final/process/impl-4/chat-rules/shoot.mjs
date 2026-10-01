/* 구현 4차 · XI ChatGEO 대화 규칙 — 화면 증거 · 흐름 시험(로그인 폼 입력 · 세션 주입 없음 · 1440 × 900 · 390 × 844).
   사용: node docs/superpowers/final/process/impl-4/chat-rules/shoot.mjs [--base http://localhost:4173] [--outside] [--only a,b] [--no-shots]
   --outside = 바깥 주소(https://app · admin · namwon.land-xi.dev — 입구가 주소). 결과: shoot-result[-outside].json · img/after-*.png
   분석 실행 · 의뢰 확인 카드는 시험에서 '취소'. 개선 고리 알림의 '본 것으로' 요청은 가로채 서버로 보내지 않는다(다른 작업의 실제 알림을 지우지 않게 —
   보낸 사실만 기록). 언어 모델을 쓰는 질문은 하나(지도를 흑백으로 — 모델이 '없는 기능'을 말하면 서버가 이유 + 버튼을 채우는지). */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../../../..');
const { frontDoor, RULES, scan } = await import(pathToFileURL(path.join(ROOT, 'landxi/v3/kit/lint/forbidden.mjs')).href);
const HW = process.env.LX_HW_BROWSERS || 'C:/Users/User/AppData/Local/ms-playwright';
const useHw = fs.existsSync(path.join(HW, 'chromium-1234')) && !process.argv.includes('--soft');
if (useHw) process.env.PLAYWRIGHT_BROWSERS_PATH = HW;
const { chromium } = createRequire(path.join(ROOT, 'package.json'))('playwright');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const OUTSIDE = process.argv.includes('--outside');
const BASE = arg('--base', 'http://localhost:4173');
const ONLY = (arg('--only', '') || '').split(',').filter(Boolean);
const SHOTS = !process.argv.includes('--no-shots');
const IMG = path.join(HERE, 'img'); fs.mkdirSync(IMG, { recursive: true });
const PFX = OUTSIDE ? 'after-outside-' : 'after-';
const HOST = { app: 'https://app.land-xi.dev', admin: 'https://admin.land-xi.dev', gov: 'https://namwon.land-xi.dev' };
const scanSrc = `(() => { const RULES = [${RULES.map(([k, re]) => `[${JSON.stringify(k)}, ${re}]`).join(',')}]; const check = (s) => RULES.filter(([, re]) => re.test(s)).map(([k]) => k); return (${scan.toString()})(document); })()`;
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
const ok = (name, pass, info = {}) => { results.push({ name, pass: !!pass, ...info }); console.log(JSON.stringify({ name, pass: !!pass, ...info })); };

async function login(page, who) {
  if (OUTSIDE) {
    const host = HOST[who.site];
    if (who.tenant) await frontDoor(page, host, who.login, { tenant: who.tenant });
    else {
      await page.goto(host + '/landxi/v3/login/', { waitUntil: 'domcontentloaded' });
      const pw = await (async () => { const env = fs.readFileSync(path.join(ROOT, 'server/.env'), 'utf8'); return process.env.LX_PW || env.match(/^DEV_PASSWORD=(.*?)\s*$/m)?.[1]; })();
      await page.locator('input[name=login], input[autocomplete=username], input[type=text]').first().fill(who.login);
      await page.locator('input[type=password]').first().fill(pw);
      await Promise.all([page.waitForURL((u) => !/\/login\/?(\?|$)/.test(u.pathname), { timeout: 20000 }).catch(() => null), page.locator('input[type=password]').first().press('Enter')]);
    }
  } else await frontDoor(page, BASE, who.login, who.tenant ? { tenant: who.tenant } : who.site);
}
const base = (who) => (OUTSIDE ? HOST[who.site] : BASE);

/** 채팅창에 묻고 답이 끝날 때까지(확인 카드는 cancel 이면 취소 · 아니면 그대로 두고 돌아온다) */
async function ask(page, q, { cancel = true, wait = 4200, keepCard = false } = {}) {
  const box = page.locator('#k-chat');
  if (await box.isHidden().catch(() => true)) { await page.locator('.k-chat-fab').click(); await page.waitForTimeout(400); }
  await page.locator('.k-ck-i').fill(q);
  await page.locator('.k-ck-i').press('Enter');
  const t0 = Date.now();
  let card = null;
  while (Date.now() - t0 < 120000) {
    const st = await box.getAttribute('data-state').catch(() => null);
    const conf = page.locator('.k-ck-c:not([hidden])');
    if (!card && await conf.count().catch(() => 0) && await conf.locator('button').count().catch(() => 0)) {
      card = (await conf.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
      if (keepCard) return { card };
      if (cancel) await conf.locator('button.t-btn--2').click().catch(() => null);
    }
    if (st && st !== 'busy') break;
    await page.waitForTimeout(300);
  }
  await page.waitForTimeout(wait);
  return page.evaluate(() => {
    const m = [...document.querySelectorAll('.k-chat-msg.ai')].pop();
    const t = (sel) => [...(m?.querySelectorAll(sel) || [])].map((x) => x.textContent.trim());
    return { answer: (m?.querySelector('.k-ck-a, .k-chat-a')?.innerText || '').trim(), next: t('.k-chat-tail .k-chat-acts > *'), alt: t('.k-chat-alt .k-chat-btn'),
      hint: t('.k-chat-hint'), fb: !!m?.querySelector('.k-chat-fb'), plan: t('.k-ck-plan li, .k-chat-plan li'), kinds: [...(m?.querySelectorAll('[data-kind]') || [])].map((x) => x.dataset.kind),
      bars: m?.querySelectorAll('.k-ck-chart .k-bar').length || 0, barsShown: [...(m?.querySelectorAll('.k-ck-chart .k-bar') || [])].filter((b) => b.getClientRects().length).length,
      more: t('.k-ck-more'), state: document.querySelector('#k-chat')?.dataset.state, verdict: document.querySelector('#k-chat')?.dataset.actsVerdict || null,
      img: !!m?.querySelector('img.k-ck-img[src^="blob:"]'), file: t('a.k-ck-file, button.k-ck-file') };
  });
}
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(IMG, `${PFX}${name}.png`) }); };
/** 줄바꿈 검사(법전 §2-1) — 머리 부제 덩이가 글자 중간에서 끊기지 않았나 · 입력 칸 안내가 칸 안에 다 들어갔나 */
const headCheck = (page) => page.evaluate(async () => {
  await document.fonts.ready;                                       // 글꼴이 다 온 뒤에 잰다(바깥 주소는 글꼴이 늦게 와 대체 글꼴 폭으로 재던 일)
  const sm = document.querySelector('.k-chat-tt small'); const spans = [...(sm?.querySelectorAll('span') || [])];
  const lines = spans.map((s) => s.getClientRects().length);
  const inp = document.querySelector('.k-ck-i'); const cs = getComputedStyle(inp, '::placeholder');
  const c = document.createElement('canvas').getContext('2d'); c.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  const w = c.measureText(inp.placeholder).width, room = inp.clientWidth - parseFloat(getComputedStyle(inp).paddingLeft) - parseFloat(getComputedStyle(inp).paddingRight);
  return { sub: sm?.textContent, spanLines: lines, ph: inp.placeholder, phFits: w <= room + 0.5, phW: Math.round(w), room: Math.round(room) };
});

const SCEN = {
  /* X-1 머리 · 입력 칸 + 알림 한 줄(LX 직원 첫 화면) */
  async head(browser) {
    for (const [vp, tag] of [[{ width: 1440, height: 900 }, '1440'], [{ width: 390, height: 844 }, '390']]) {
      const ctx = await browser.newContext({ viewport: vp, isMobile: vp.width < 500, hasTouch: vp.width < 500 });
      await markTest(ctx); const page = await ctx.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(String(e.message)));
      // 알림 한 줄 화면 시험 — 개선 고리가 보낸 실제 알림('지도 화면을 이미지로 저장' · 18:00 전 이 계정)은 앞선 재측정이 열면서 '본 것'이 되어 서버에 남은 것이 없다.
      // 같은 모양의 응답을 이 시험 안에서만 돌려준다(서버 · 표는 건드리지 않음 · 문구는 서버가 보냈던 그대로)
      await ctx.route(/\/api\/v1\/assist\/notices$/, (route) => route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ items: [{ id: 'in_screen_test', text: "지난번에 물으신 '지도 화면을 이미지로 저장'이 이제 됩니다 — XI맵에서 해 보세요.", try: '지금 보이는 지도를 그림 파일로 저장해 줘' }] }) }));
      await login(page, { login: 'test@lx.or.kr', site: 'app' });
      await page.goto(base({ site: 'app' }) + '/landxi/v3/lx-console/', { waitUntil: 'domcontentloaded' });
      await page.locator('.k-chat-fab').waitFor({ timeout: 30000 }); await page.waitForTimeout(2500);
      await page.locator('.k-chat-fab').click(); await page.waitForTimeout(1800);
      const hc = await headCheck(page);
      const note = await page.locator('.k-chat-note:not([hidden])').innerText().catch(() => '');
      ok(`X-1 머리 · 입력 칸 ${tag}`, hc.sub?.includes('공간지식 추론 서비스') && hc.sub?.includes('(지도 제어 · 분석 · 보고서)') && hc.ph === '더 똑똑한 공간지식 추론 서비스를 체험해 보세요' && hc.spanLines.every((n) => n === 1) && hc.phFits, hc);
      ok(`알림 한 줄 ${tag}(화면 시험 응답)`, /이제 됩니다/.test(note) && /해 보기/.test(note), { note: note.replace(/\s+/g, ' '), seen_held: SENT.seen.length });
      await shot(page, `head-${tag}`);
      ok(`화면 오류 0 · 머리 ${tag}`, errs.length === 0, { errs });
      await ctx.close();
    }
  },
  /* 지도 없는 화면(LX 직원 첫 화면) — XI맵을 ○○에서 열기 · 대표 숫자 · 표 · 차트 · 법령 · 못 하는 동작 */
  async nomap(browser) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await markTest(ctx); const page = await ctx.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(String(e.message)));
    await login(page, { login: 'test@lx.or.kr', site: 'app' });
    await page.goto(base({ site: 'app' }) + '/landxi/v3/lx-console/', { waitUntil: 'domcontentloaded' });
    await page.locator('.k-chat-fab').waitFor({ timeout: 30000 }); await page.waitForTimeout(2000);
    let r = await ask(page, '구례군 확대해 줘');
    ok('지도 없는 화면 · 지명 + 확대 → XI맵을 구례군에서 열기', /지도가 없어/.test(r.answer) && r.next.some((x) => /XI맵을 구례군에서 열기/.test(x)), r); await shot(page, 'nomap-zoom-1440');
    const runNo = await page.locator('#k-chat').getAttribute('data-run').catch(() => '');
    ok('시험 표시 — 시험용 답 번호(개선 고리가 모으지 않음)', /^run_test/.test(runNo || ''), { prefix: String(runNo || '').slice(0, 8) });
    r = await ask(page, '남원시 의심 필지 읍면동별 차트로 보여 줘');
    ok('차트 다섯 줄 + 더 보기 · 크게 보기', r.barsShown === 5 && r.more.length === 1 && r.next.some((x) => /크게 보기/.test(x)), r); await shot(page, 'chart-1440');
    r = await ask(page, '2024년과 2025년 영상을 나란히 비교해 줘');
    ok('직전 지역(남원시)으로 두 시점 · 지도 없음 → XI맵 열기', /남원시/.test(r.answer + r.next.join(' ')) && r.next.some((x) => /XI맵/.test(x)), r); await shot(page, 'nomap-compare-1440');
    const href = await page.locator('.k-chat-msg.ai').last().locator('.k-chat-tail a.k-chat-btn').first().getAttribute('href').catch(() => null);
    ok('XI맵 버튼이 두 시점을 이어 간다', /compare=/.test(href || '') && /region=52190/.test(href || ''), { href });
    r = await ask(page, '이 지역 결과 요약해 줘');
    ok('지역 없는 요약 → 직전 지역 요약 또는 전국 요약 두 문장', r.answer.split(/(?<=다\.)\s/).length <= 3, r);
    r = await ask(page, '허가 없이 지은 건물에 물리는 이행강제금은 얼마야?');
    ok('풀어 쓴 법령 → 가장 가까운 조문 원문', /건축법/.test(r.answer) && /이행강제금/.test(r.answer), { answer: r.answer.slice(0, 160), next: r.next }); await shot(page, 'law-1440');
    r = await ask(page, '구례군과 남원시 의심 필지 수 비교해 줘');
    ok('두 지역 비교 = 같은 이름 숫자 + 막대 둘', /의심 필지는 구례군/.test(r.answer) && !/대장/.test(r.answer) && r.bars === 2, r); await shot(page, 'compare-num-1440');
    if (!process.argv.includes('--no-llm')) {                    // 언어 모델을 쓰는 유일한 질문 — 바깥 주소 재확인 때는 건너뛴다(GPU 최소)
      r = await ask(page, '지도를 흑백으로 바꿔 줘', { wait: 4500 });
      ok('없는 지도 동작 → 이유 한 줄 + 버튼(막다른 답 0)', /아직 없는 기능/.test(r.answer) && !/할 수 없습니다/.test(r.answer) && r.next.length >= 1, r); await shot(page, 'cannot-1440');
    }
    ok('답 아래 도움 안 됐어요', r.fb, {});
    const scanR = await page.evaluate(scanSrc); ok('금지어 0 · 지도 없는 화면', scanR.hits.length === 0, { hits: scanR.hits.slice(0, 5) });
    ok('화면 오류 0 · 지도 없는 화면', errs.length === 0, { errs });
    await ctx.close();
  },
  /* XI맵 — 지명 + 확대 · 이미 꺼짐 · 두 시점 나란히 · 범위 그리기 · 그림 저장 · 같은 이름 · 실행 카드 */
  async xi(browser) {
    for (const [vp, tag] of [[{ width: 1440, height: 900 }, '1440'], [{ width: 390, height: 844 }, '390']]) {
      const ctx = await browser.newContext({ viewport: vp, isMobile: vp.width < 500, hasTouch: vp.width < 500 });
      await markTest(ctx); const page = await ctx.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(String(e.message)));
        await login(page, { login: 'test@lx.or.kr', site: 'app' });
      await page.goto(base({ site: 'app' }) + '/landxi/v3/xi-clean/?region=52190', { waitUntil: 'domcontentloaded' });
      await page.locator('.k-chat-fab').waitFor({ timeout: 40000 }); await page.waitForTimeout(6000);
      const reopen = async () => { if (await page.locator('#k-chat').isHidden().catch(() => true)) { await page.locator('.k-chat-fab').click(); await page.waitForTimeout(400); } };
      if (tag === '1440') {
        let r = await ask(page, '구례군 확대해 줘');
        const c = await page.evaluate(() => { const m = window.__xc?.map; const ce = m?.getCenter(); return ce ? [ce.lng, ce.lat] : null; });
        ok('지명 + 확대 = 구례군으로 옮기고 확대(그린 뒤에만 확정)', /구례군으로 옮기고 한 단계 확대했습니다/.test(r.answer) && c && c[0] > 127.36 && c[0] < 127.63 && c[1] > 35.12 && c[1] < 35.37, { ...r, center: c }); await shot(page, `xi-chain-${tag}`);
        r = await ask(page, '남원시로 이동해 줘');
        r = await ask(page, 'AI 분석 결과 층 꺼 줘');
        ok('이미 꺼져 있으면 "이미" + 다음 할 일', /이미 꺼져 있습니다/.test(r.answer) && !/껐습니다/.test(r.answer), r); await shot(page, `xi-same-${tag}`);
        r = await ask(page, '고성군으로 이동해 줘', { wait: 7000 });
        ok('같은 이름 → 하나로 가고 다른 뜻이면 버튼', r.alt.length === 1 && /고성군/.test(r.answer), r); await shot(page, `xi-alt-${tag}`);
        r = await ask(page, '남원시로 이동해 줘');
        r = await ask(page, '남원시 전역 분석 실행해 줘', { keepCard: true });
        await page.waitForTimeout(500); await shot(page, `xi-confirm-${tag}`);
        ok('실행 카드 = 사용자 말 제목 + 범위 문장 둘째 줄', /실행할까요/.test(r.card || '') && /영상이 있는 곳|읍면동|분석합니다/.test(r.card || ''), r);
        await page.locator('.k-ck-c:not([hidden]) button.t-btn--2').click();
        await page.waitForFunction(() => document.querySelector('#k-chat')?.dataset.state !== 'busy', null, { timeout: 30000 }).catch(() => null);
        await page.waitForTimeout(1500);
        const after = await page.evaluate(() => ({ a: [...document.querySelectorAll('.k-chat-msg.ai')].pop()?.innerText || '' }));
        ok('취소 → 한 줄 + 대신 볼 것', /취소해서 실행하지 않았습니다/.test(after.a) && /결과 요약|차트/.test(after.a), after); await shot(page, `xi-cancel-${tag}`);
      }
      await reopen();
      let r = await ask(page, '2024년과 2025년 영상을 나란히 비교해 줘', { wait: 6000 });
      const sw = await page.evaluate(() => { const m = window.__xc?.map; return { swipe: !document.querySelector('.xc-b')?.hidden, right: !!m?.getLayer('xc-cmp-r-r'), bar: !document.querySelector('.xc-cmp')?.hidden, sel: [...document.querySelectorAll('.xc-cmp-s')].map((s) => s.selectedOptions[0]?.textContent) }; });
      ok(`두 시점 나란히 = 가르기 + 시점 둘 ${tag}`, /좌우로 나눠 놓았습니다/.test(r.answer) && sw.swipe && sw.right && sw.bar, { ...r, sw });
      if (tag === '390') await page.locator('#k-chat').isVisible().then((v) => v && page.locator('.k-chat-x').click()).catch(() => null);
      await page.waitForTimeout(1200); await shot(page, `xi-compare-${tag}`);
      if (tag === '1440') {
        await page.evaluate(() => { const g = document.querySelector('.xc-grip'); return g; });
        await reopen();
        r = await ask(page, '지도 화면을 이미지로 저장해 줘', { wait: 5000 });
        ok('지금 지도 한 장 → 그림 파일(그린 뒤에만)', /그림 파일로 만들었습니다/.test(r.answer) && r.img && r.file.length >= 1, r); await shot(page, `xi-snapshot-${tag}`);
        r = await ask(page, '지도에 범위를 그려서 그 안만 분석해 줘', { wait: 4000 });
        const an = await page.evaluate(() => !!document.querySelector('.xa-card, [class*="xa-"]'));
        ok('범위 그리기 켜짐(분석 도구 그리기)', /범위 그리기를 켰습니다/.test(r.answer) && an, r); await shot(page, `xi-draw-${tag}`);
      }
      ok(`화면 오류 0 · XI맵 ${tag}`, errs.length === 0, { errs });
      await ctx.close();
    }
  },
  /* 기관(남원시) — 우리 시 · 관할 밖 · 분석 요청 카드(원칙 113 — 화면 말 '분석 요청') */
  async gov(browser) {
    for (const [vp, tag] of [[{ width: 1440, height: 900 }, '1440'], [{ width: 390, height: 844 }, '390']]) {
      const ctx = await browser.newContext({ viewport: vp, isMobile: vp.width < 500, hasTouch: vp.width < 500 });
      await markTest(ctx); const page = await ctx.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(String(e.message)));
        await login(page, { login: 'lxadmin@lx.or.kr', tenant: 'namwon', site: 'gov' });
      await page.goto(base({ site: 'gov' }) + '/landxi/v3/gov-report/', { waitUntil: 'domcontentloaded' });
      await page.locator('.k-chat-fab').waitFor({ timeout: 40000 }); await page.waitForTimeout(4000);
      let r = await ask(page, '우리 시 현장 확인 필요 필지 몇 건이야?');
      ok(`기관 '우리 시' = 관할 · 물은 이름 숫자 ${tag}`, /남원시 현장 확인 필요 필지는/.test(r.answer) && /의심 필지/.test(r.answer), r);
      if (tag === '390') await page.waitForTimeout(500);
      await shot(page, `gov-count-${tag}`);
      if (tag === '1440') {
        r = await ask(page, '구례군 결과 보여 줘');
        ok('관할 밖 = 이유 한 줄(지역 이름) + 우리 시 버튼', /구례군은 이 기관 계정에서 볼 수 없습니다/.test(r.answer) && r.next.length >= 1, r); await shot(page, `gov-outside-${tag}`);
        r = await ask(page, '전역 분석 실행해 줘');
        ok('기관 분석 실행 → 분석 요청(서비스 고르기 버튼)', /분석 요청/.test(r.answer + r.next.join(' ')) && r.next.length >= 1, r); await shot(page, `gov-request-choose-${tag}`);
        const b = page.locator('.k-chat-msg.ai').last().locator('.k-chat-tail .k-chat-btn').first();
        await b.click();
        const t0 = Date.now(); let card = '';
        while (Date.now() - t0 < 30000) { card = await page.locator('.k-ck-c:not([hidden])').innerText().catch(() => ''); if (card) break; await page.waitForTimeout(300); }
        await page.waitForTimeout(400); await shot(page, `gov-request-card-${tag}`);
        ok('분석 요청 카드 = 분석 요청 보내기 · 취소 · LX 관리자 확인 문장', /분석 요청 보내기/.test(card) && /LX\s관리자가 확인/.test(card), { card: card.replace(/\s+/g, ' ') });
        if (card) await page.locator('.k-ck-c:not([hidden]) button.t-btn--2').click();      // 분석 요청을 만들지 않는다
        await page.waitForFunction(() => document.querySelector('#k-chat')?.dataset.state !== 'busy', null, { timeout: 30000 }).catch(() => null);
        await page.waitForTimeout(1200);
        const a = await page.evaluate(() => [...document.querySelectorAll('.k-chat-msg.ai')].pop()?.innerText || '');
        ok('분석 요청 취소 → 보내지 않았다', /분석 요청을 보내지 않았습니다/.test(a), { a });
      }
      ok(`화면 오류 0 · 기관 ${tag}`, errs.length === 0, { errs });
      await ctx.close();
    }
  },
};

const launch = async () => {
  if (useHw) { try { return await chromium.launch({ channel: 'chromium', args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] }); } catch (e) { console.log('하드웨어 브라우저 실패 — 기본으로', String(e).slice(0, 120)); } }
  return chromium.launch();
};
const browser = await launch();
for (const [k, fn] of Object.entries(SCEN)) {
  if (ONLY.length && !ONLY.includes(k)) continue;
  try { await fn(browser); } catch (e) { ok(`${k} 실행`, false, { error: String(e?.message || e).slice(0, 300) }); }
}
await browser.close();
const FILE = path.join(HERE, OUTSIDE ? 'shoot-result-outside.json' : 'shoot-result.json');
let all = results;
if (ONLY.length && fs.existsSync(FILE)) {                          // 일부 장면만 다시 돈 경우 — 같은 이름 줄만 바꾸고 나머지는 둔다(실행 실패 줄은 지운다)
  const old = JSON.parse(fs.readFileSync(FILE, 'utf8')).results || [];
  const names = new Set(results.map((r) => r.name));
  all = [...old.filter((r) => !names.has(r.name) && !ONLY.some((k) => r.name === `${k} 실행`)), ...results];
}
const pass = all.filter((r) => r.pass).length;
fs.writeFileSync(FILE, JSON.stringify({ at: new Date().toISOString(), base: OUTSIDE ? 'outside' : BASE, pass, total: all.length, test_marked: true, signals_held: { feedback: SENT.feedback, seen: SENT.seen.length }, results: all }, null, 1));
console.log(`끝 — ${pass} / ${all.length}`);
