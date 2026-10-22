/* 바퀴 22 P3 영농관리 행정서비스 진단 — 바깥 기관 주소(https://namwon.land-xi.dev · app.land-xi.dev 의 기관 입구) · 로그인 폼(frontDoor)으로만.
   node capture.mjs [pc|pc1280|mob|all]  → ./items.json · ./shots/*.png
   화면마다 ① 그림 ② 떠 있는 요소(대화창 · 답 띠 · 서랍 · 카드 · 층 판 · 도구 열)의 상자 좌표 ③ 둘씩 겹친 넓이 ④ 화면 낱말(바꿀 말 후보) 을 적는다.
   쓰기 0(메모 · 요청 · 내려받기 누르지 않음) · 지역은 로그인 기관이 정한다(남원은 예시). */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';

const ROOT = 'E:/Land-XI 플랫폼/01. 디자인';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SH = path.join(HERE, 'shots'); fs.mkdirSync(SH, { recursive: true });
const HW = 'C:/Users/User/AppData/Local/ms-playwright';
if (fs.existsSync(path.join(HW, 'chromium-1234'))) process.env.PLAYWRIGHT_BROWSERS_PATH = HW;
const { chromium } = createRequire(path.join(ROOT, 'package.json'))('playwright');
const { frontDoor } = await import(pathToFileURL(path.join(ROOT, 'landxi/v3/kit/lint/forbidden.mjs')).href);

const ORG = 'https://namwon.land-xi.dev', CARD = 'card-farm', V = ORG + '/landxi/v3/';
const which = process.argv[2] || 'all';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const WORDS = ['가르기', '이용 약속', '오늘 볼 필지', '견주기', '시점 비교', '영상 없이', '내려받기', '거르기', '대조', '층', '규칙', '보고 있는 결과', '결과 설명', '행정정보와 비교', '요청하기', '필지 목록', '통계·보고서', '이력', '현황', '결과 지도', '내 서비스', '대장과 다름', '메모 없음', '큰 숫자', '불러오는 중'];

const OUT = { generatedAt: new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }), site: ORG, login: '로그인 폼(기관 메인 로그인 카드 · lxadmin@lx.or.kr · 기관 namwon)', runs: {} };
const save = () => fs.writeFileSync(path.join(HERE, 'items.json'), JSON.stringify(OUT, null, 1));

/* 떠 있는 요소 상자 — 보이는 것(폭 · 높이 40px 이상)만 · position absolute/fixed 또는 지정 선택자 · 조상-자손 쌍은 겹침으로 세지 않음 */
const MEASURE = `(() => {
  const SEL = ['.k-drawer.is-open', '.k-chat-root[data-dock]', '.xk-ans:not([hidden])', '.xc-pop:not([hidden])', '.xc-tools', '.xo:not([hidden])', '.xo-mini:not([hidden])', '.xa-card:not([hidden])', '.xc-cmp:not([hidden])', '.gx-card', '.gx-cmp', '.xn-hud:not([hidden])', '.xe-card:not([hidden])', '.k-md', '.sp-band:not([hidden])', '#det-x:not([hidden])', '.k-mast', '.k-rail', '.xc-hud', '.k-chat-fab', '.k-notify-pop:not([hidden])'];
  const seen = new Set(), items = [];
  const name = (el) => (el.id ? '#' + el.id : '') + '.' + [...el.classList].slice(0, 3).join('.');
  const add = (el, why) => {
    if (!el || seen.has(el)) return; seen.add(el);
    const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    if (r.width < 40 || r.height < 40 || cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0') return;
    if (r.right <= 0 || r.bottom <= 0 || r.left >= innerWidth || r.top >= innerHeight) return;
    items.push({ el, name: name(el), why, x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), z: cs.zIndex });
  };
  for (const s of SEL) for (const el of document.querySelectorAll(s)) add(el, 'sel');
  const main = document.querySelector('.k-main, main, #main') || document.body;
  for (const el of main.querySelectorAll('*')) { const cs = getComputedStyle(el); if ((cs.position === 'absolute' || cs.position === 'fixed') && !el.closest('.maplibregl-map') && !el.closest('.k-drawer') && !el.closest('.xc-pop') && !el.closest('.k-chat-root') && !el.closest('.xo') && !el.closest('.xa-card')) add(el, 'pos'); }
  const pairs = [];
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    const a = items[i], b = items[j];
    if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
    const ix = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), iy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    if (ix > 4 && iy > 4) pairs.push({ a: a.name, b: b.name, w: ix, h: iy, area: ix * iy, ofSmall: Math.round(100 * ix * iy / Math.min(a.w * a.h, b.w * b.h)) });
  }
  return { vp: [innerWidth, innerHeight], boxes: items.map(({ el, ...r }) => r), overlaps: pairs.sort((p, q) => q.area - p.area) };
})()`;
const TEXTS = `(() => { const t = document.body.innerText || ''; return Object.fromEntries(${JSON.stringify(WORDS)}.map((w) => [w, (t.match(new RegExp(w.replace(/[.*+?^$()|[\\]\\\\]/g, '\\\\$&'), 'g')) || []).length]).filter(([, n]) => n)); })()`;
const HEADS = `(() => [...document.querySelectorAll('h1, h2, .gs-tab, .gr-tabs button, .k-rail-i, .xc-tool, .t-btn, .sp-chip')].map((e) => e.textContent.trim().replace(/\\s+/g, ' ')).filter(Boolean).filter((s, i, a) => a.indexOf(s) === i).slice(0, 60))()`;

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

async function run(vp) {
  const mob = vp === 'mob';
  const size = mob ? { width: 390, height: 844 } : vp === 'pc1280' ? { width: 1280, height: 720 } : { width: 1440, height: 900 };
  const ctx = await browser.newContext({ viewport: size, locale: 'ko-KR', deviceScaleFactor: 1, ...(mob ? { isMobile: true, hasTouch: true } : {}) });
  const p = await ctx.newPage();
  const R = { vp, size, steps: [], errors: [], failed: [] };
  OUT.runs[vp] = R;
  p.on('console', (m) => { if (m.type() === 'error') R.errors.push(m.text().slice(0, 200)); });
  p.on('pageerror', (e) => R.errors.push('pageerror ' + String(e).slice(0, 200)));
  p.on('response', (r) => { if (r.status() >= 400 && !/favicon/.test(r.url())) R.failed.push(`${r.status()} ${r.url().replace(/[?#].*$/, '').slice(0, 140)}`); });
  const shot = async (name) => { const f = `${vp}-${name}.png`; await p.screenshot({ path: path.join(SH, f) }); return f; };
  const step = async (id, name, fn, { measure = true } = {}) => {
    const t0 = Date.now(); let ok = true, note = '';
    try { note = (await fn()) || ''; } catch (e) { ok = false; note = String(e.message || e).slice(0, 240); }
    const s = { id, name, ok, ms: Date.now() - t0, note, url: p.url().replace(ORG, '') };
    try { s.words = await p.evaluate(TEXTS); s.heads = await p.evaluate(HEADS); } catch { /* */ }
    if (measure) { try { const m = await p.evaluate(MEASURE); s.boxes = m.boxes; s.overlaps = m.overlaps; } catch (e) { s.measureErr = String(e).slice(0, 120); } }
    try { s.hscroll = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); } catch { /* */ }
    try { s.shot = await shot(id); } catch { /* */ }
    R.steps.push(s); save();
    console.log(vp, id, ok ? 'ok' : 'FAIL', s.ms + 'ms', note, s.overlaps?.length ? `겹침 ${s.overlaps.length}: ` + s.overlaps.slice(0, 4).map((o) => `${o.a}×${o.b} ${o.w}×${o.h}`).join(' | ') : '겹침 0');
    return s;
  };
  const go = async (u, waitSel, t = 20000) => { await p.goto(u, { waitUntil: 'domcontentloaded' }); if (waitSel) await p.locator(waitSel).first().waitFor({ timeout: t }).catch(() => {}); await sleep(1500); };

  await frontDoor(p, ORG, 'lxadmin@lx.or.kr#namwon', 'gov');
  await p.waitForURL((u) => !/gov-home/.test(u.pathname), { timeout: 60000 }).catch(() => {});
  await sleep(1200);
  await step('00-landing', '로그인 뒤 첫 화면(어디로 가는가)', async () => p.url().replace(ORG, ''));
  await step('01-list', '내 서비스', async () => { await go(V + 'gov-select/?list=1', '.gs-grid, .t-empty'); return `카드 ${await p.locator('.gs-grid > *').count()} · ${(await p.locator('.gs-grid .k-sc-t, .gs-grid h3, .gs-grid h4').allTextContents()).join(' / ')}`; });
  await step('02-dash', '서비스 대시보드(현황)', async () => { await go(V + `gov-select/?service=${CARD}`, '.gs-tabs'); return `탭 ${(await p.locator('.gs-tabs a').allTextContents()).join(' · ')}`; });
  await step('03-stats', '통계·보고서 탭', async () => { await go(V + `gov-select/?service=${CARD}&tab=stats`, '.gs-emd, .gs-none'); await sleep(2500); return (await p.locator('.gd-box-h h2').allTextContents()).join(' · '); });
  await step('04-history', '이력 탭', async () => { await go(V + `gov-select/?service=${CARD}&tab=history`, '.gy-hist'); return (await p.locator('.gy-chip').allTextContents()).join(' · '); });
  await step('05-parcels', "필지 목록('오늘 볼 필지')", async () => {
    await go(V + `gov-report/?service=${CARD}&tab=sus`, '#sus-table:not(.is-busy) tbody tr', 30000);
    const big = await p.locator('#sus-big').innerText().catch(() => '');
    const bar = await p.locator('.sp-bar > *:not([hidden])').evaluateAll((a) => a.map((e) => e.getAttribute('aria-label') || e.textContent.trim()));
    const ths = await p.locator('#sus-table thead th').allTextContents();
    return `큰 숫자 '${big.replace(/\s+/g, ' ')}' · 거르기 [${bar.join(' · ')}] · 표 머리 [${ths.map((t) => t.trim()).filter(Boolean).join(' · ')}] · 안내 '${await p.locator('#sus-note').textContent().catch(() => '')}'`;
  });
  await step('06-card', '필지 카드(표 → 카드) · 이력 펼침', async () => {
    await p.locator('#sus-table tbody tr').nth(0).locator('td').nth(1).click();
    await p.locator('#det-x .sp-hist li').first().waitFor({ state: 'attached', timeout: 15000 });
    await p.locator('#det-x details.sp-hd summary').click().catch(() => {});
    await sleep(1000);
    const btns = await p.locator('#det-x .t-btn, #det-x button').allTextContents();
    return `카드 단추 [${btns.map((t) => t.trim()).filter(Boolean).join(' · ')}] · 이력 ${await p.locator('#det-x .sp-hist li').count()}줄`;
  });
  await step('07-compare', "'시점 비교' → XI맵 가르기", async () => {
    await p.locator('#det-x .sp-cmp').click();
    await p.locator('.gx-cmp-t').waitFor({ timeout: 25000 });
    await sleep(mob ? 4500 : 3000);
    return `위 띠 '${await p.locator('.gx-cmp-t').textContent()}' · 고르기 ${(await p.locator('.xc-cmp select').evaluateAll((a) => a.map((s) => s.selectedOptions[0]?.textContent))).join(' / ')} · 도구 [${(await p.locator('.xc-tool').allTextContents()).join(' · ')}]`;
  });
  await step('07b-compare-layers', '시점 비교 화면에서 층 판 열기', async () => { await p.locator('.xc-tool[data-tool="layers"]').click(); await sleep(900); return `층 판 ${await p.locator('.xc-pop:not([hidden])').count()}`; });
  await step('08-ximap', '결과 지도(XI맵 · 기관) 처음', async () => {
    await go(V + `gov-select/?service=${CARD}`, '.gs-tabs');
    const href = await p.locator('.gs-tab', { hasText: '결과 지도' }).getAttribute('href');
    await p.goto(new URL(href, p.url()).href, { waitUntil: 'domcontentloaded' });
    await p.locator('.xc-tools').waitFor({ timeout: 30000 });
    await sleep(mob ? 6000 : 4500);
    return `도구 [${(await p.locator('.xc-tool').allTextContents()).join(' · ')}] · 결과 카드 ${await p.locator('.gx-card').count()}`;
  });
  await step('08b-ximap-layers', '층 판 + 결과 카드 + 대화창', async () => { await p.locator('.xc-tool[data-tool="layers"]').click(); await sleep(900); return `층 판 ${await p.locator('.xc-pop:not([hidden])').count()}`; });
  await step('08c-ximap-ask', 'XI ChatGEO 질문 → 답 띠(층 판 · 결과 카드와 함께)', async () => {
    const inp = p.locator('.k-chat-root[data-dock] .k-chat-in input, .k-chat-root[data-dock] .k-chat-in textarea').first();
    if (!await inp.count()) { const fab = p.locator('.k-chat-fab, [aria-label*="ChatGEO"]').first(); if (await fab.count()) await fab.click(); await sleep(600); }
    await inp.fill('우리 시 경작지는 몇 필지인가요');
    await inp.press('Enter');
    await p.locator('.xk-ans:not([hidden]):not(.is-busy)').waitFor({ timeout: 60000 });
    await sleep(1200);
    return `답 '${(await p.locator('.xk-ans-t').textContent()).slice(0, 80)}' · 단추 [${(await p.locator('.xk-ans-a button, .xk-ans-a a').allTextContents()).join(' · ')}]`;
  });
  await step('08d-ximap-list', "'목록' 서랍 + 답 띠 + 층 판", async () => {
    const t = p.locator('.xc-tool[data-tool="list"]'); if (!await t.count()) return '목록 도구 없음';
    await t.click(); await p.locator('.k-drawer.is-open').waitFor({ timeout: 15000 }); await sleep(1500);
    return `서랍 '${await p.locator('.k-drawer.is-open h2, .k-drawer.is-open .k-drawer-t').first().textContent().catch(() => '')}'`;
  });
  await step('08e-ximap-parcel', '지도 가운데 눌러 필지 카드 서랍', async () => {
    const m = await p.locator('.maplibregl-canvas').first().boundingBox();
    await p.mouse.click(m.x + m.width * 0.5, m.y + m.height * 0.5); await sleep(2500);
    return `서랍 ${await p.locator('.k-drawer.is-open').count()} · 제목 '${await p.locator('.k-drawer.is-open h2').first().textContent().catch(() => '')}'`;
  });
  await step('08f-ximap-chat-drawer', "'대화 n' 서랍(답 띠 → 서랍)", async () => {
    const more = p.locator('.xk-more'); if (!await more.count() || !await more.isVisible()) return '답 띠 없음(서랍이 덮었나)';
    await more.click(); await sleep(1200);
    return `서랍 '${await p.locator('.k-drawer.is-open h2').first().textContent().catch(() => '')}' · 답 띠 보임 ${await p.locator('.xk-ans:not([hidden])').count()}`;
  });
  await step('09-fusion', '행정정보와 비교', async () => { await go(V + `gov-fusion/?service=${CARD}`, '.gf-steps, .t-empty', 30000); return (await p.locator('h1, h2').allTextContents()).slice(0, 6).join(' · '); });
  await step('10-request', '요청하기', async () => { await go(V + 'gov-request/', 'h1'); return (await p.locator('h1, .gr-tabs button, [role=tab]').allTextContents()).slice(0, 8).join(' · '); });
  await step('11-report', '보고서 탭(gov-report)', async () => { await go(V + `gov-report/?service=${CARD}&tab=report`, '.rp-doc, .gr-rdoc', 30000); await sleep(1000); return (await p.locator('.rp-doc h2, .rp-doc h3, .rp-doc .t-btn').allTextContents()).slice(0, 10).join(' · '); });
  await step('12-lxproject-newsite', 'LX 직원 새 프로젝트 대상지 칸(낱말 — 영상 없이 지역만 정하기) · 기관 세션은 못 들어가면 그대로 적음', async () => {
    await go(V + 'lx-project/?new=1', 'h1', 15000); return p.url().replace(ORG, '') + ' · ' + (await p.locator('h1').first().textContent().catch(() => ''));
  }, { measure: false });
  await ctx.close();
}
for (const v of which === 'all' ? ['pc', 'pc1280', 'mob'] : [which]) { try { await run(v); } catch (e) { OUT.runs[v] = { ...(OUT.runs[v] || {}), fatal: String(e).slice(0, 300) }; console.error(v, 'fatal', e); } }
await browser.close();
save();
console.log('done', path.join(HERE, 'items.json'));
