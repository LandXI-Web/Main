/* 구현 3차 · AI 도우미 채팅창 — 화면 흐름 시험(세 입구 · PC 1440×900 · 휴대폰 390×844 · 게스트).
   로그인 = 로그인 폼 입력(kit/lint/forbidden.mjs frontDoor · 세션 주입 없음). 답 시험은 게이트웨이 경로(/agent/runs)로만, 몇 번만.
   사용: node docs/superpowers/final/process/impl-3/chat/e2e.mjs [--base http://localhost:4173] [--only app,admin,gov,guest] [--pc|--mobile] [--outside]
   --outside = 바깥 주소(https://app · admin · namwon.land-xi.dev) — 입구가 주소다.
   결과: 콘솔 JSON 줄 + e2e-result.json · 캡처 img/after-*.png */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../../../..');
const { frontDoor, RULES, scan } = await import(pathToFileURL(path.join(ROOT, 'landxi/v3/kit/lint/forbidden.mjs')).href);
/* 하드웨어 GPU 로 그리는 브라우저가 있으면 그것(소프트웨어 GL 머리 없는 셸은 지도 위 떠 있는 창 둘레에서 지도 조각을 비우는 합성 오류가 있다) — playwright 를 싣기 전에 고른다 */
const HW = process.env.LX_HW_BROWSERS || 'C:/Users/User/AppData/Local/ms-playwright';
const useHw = fs.existsSync(path.join(HW, 'chromium-1234')) && !process.argv.includes('--soft');
if (useHw) process.env.PLAYWRIGHT_BROWSERS_PATH = HW;
const { chromium } = createRequire(path.join(ROOT, 'package.json'))('playwright');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const OUTSIDE = process.argv.includes('--outside');
const BASE = arg('--base', 'http://localhost:4173');
const ONLY = new Set(arg('--only', 'app,admin,gov,guest').split(','));
const VIEWS = process.argv.includes('--pc') ? [false] : process.argv.includes('--mobile') ? [true] : [false, true];
const IMG = path.join(HERE, 'img'); fs.mkdirSync(IMG, { recursive: true });
const SHOT = !OUTSIDE || process.argv.includes('--shots');
const launch = async () => {
  if (useHw) { try { return await chromium.launch({ channel: 'chromium', args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] }); } catch (e) { console.log('하드웨어 브라우저 실패 — 기본으로', String(e).slice(0, 120)); } }
  return chromium.launch();
};
const scanSrc = `(() => { const RULES = [${RULES.map(([k, re]) => `[${JSON.stringify(k)}, ${re}]`).join(',')}]; const check = (s) => RULES.filter(([, re]) => re.test(s)).map(([k]) => k); return (${scan.toString()})(document); })()`;

const ENTRY = {
  app: { login: 'test@lx.or.kr', site: 'app', host: 'https://app.land-xi.dev', home: 'lx-console', other: 'lx-project',
    pcQs: ['남원시로 이동해 줘', { chip: '어느 지역에 어떤 결과가 있어?' }], mQs: [{ chip: '어느 지역에 어떤 결과가 있어?' }] },
  admin: { login: 'lxadmin', site: 'admin', host: 'https://admin.land-xi.dev', home: 'ops-core', other: 'ops-accounts',
    pcQs: [{ chip: '분석 대기열 요약해 줘' }], mQs: [{ chip: '기관별 사용량 보여 줘' }] },
  gov: { login: 'lxadmin@lx.or.kr#namwon', site: 'gov', host: 'https://namwon.land-xi.dev', home: 'gov-fusion', other: 'gov-select',
    pcQs: [{ chip: '농지 전용 근거 조문 알려 줘' }, { chip: '보고서 초안 만들어 줘' }], mQs: [{ chip: '농지 전용 근거 조문 알려 줘' }] },
};

const results = [];
const thinkShot = new Set();
const ok = (name, pass, info = {}) => { results.push({ name, pass: !!pass, ...info }); console.log(JSON.stringify({ name, pass: !!pass, ...info })); };

/* 화면 상태 — 머리 '물어보기' · 'Ctrl K' 글자 · 도우미 버튼 자리 · 겹침 */
const state = () => {
  const vis = (el) => { const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const mastAsk = [...document.querySelectorAll('.k-mast *')].filter((e) => vis(e) && e.children.length === 0 && /물어보기|Ctrl\s?K/.test(e.textContent)).length;
  const ctrlK = /Ctrl\s?K/.test(document.body.innerText);
  const fab = document.querySelector('.k-chat-fab');
  const fr = fab && vis(fab) ? fab.getBoundingClientRect() : null;
  const root = document.querySelector('.k-chat-root');
  const hitRect = (r) => fr && r.left < fr.right && r.right > fr.left && r.top < fr.bottom && r.bottom > fr.top;
  const overlaps = [...document.querySelectorAll('a[href],button,input,select,textarea,[role=button],.maplibregl-ctrl-scale,[class*="legend"]')]
    .filter((e) => !root?.contains(e) && vis(e) && hitRect(e.getBoundingClientRect()))
    .filter((e) => { const r = e.getBoundingClientRect(); const x = (Math.max(r.left, fr.left) + Math.min(r.right, fr.right)) / 2, y = (Math.max(r.top, fr.top) + Math.min(r.bottom, fr.bottom)) / 2; root.style.pointerEvents = 'none'; const top = document.elementFromPoint(x, y); root.style.pointerEvents = ''; return top && (top === e || e.contains(top)); })
    .map((e) => e.tagName.toLowerCase() + '.' + String(e.className).split(' ')[0]);
  const box = document.querySelector('.k-chat');
  const br = box && !box.hidden ? box.getBoundingClientRect() : null;
  return { mastAsk, ctrlK, fab: fr && [fr.left, fr.top, fr.width, fr.height].map(Math.round), inView: !!fr && fr.right <= innerWidth && fr.bottom <= innerHeight && fr.left >= 0 && fr.top >= 0, overlaps,
    open: !!br, box: br && [br.left, br.top, br.width, br.height].map(Math.round), me: document.querySelectorAll('.k-chat-msg.me').length, url: location.pathname };
};
const lastAnswer = () => {
  const b = document.querySelector('.k-chat');
  const msgs = [...b.querySelectorAll('.k-chat-msg.ai:not(.k-chat-intro)')];
  const m = msgs[msgs.length - 1]; if (!m) return null;
  const a = m.querySelector('.k-ck-a, .k-chat-a');
  return { state: b.dataset.state, text: (a?.innerText || '').trim().slice(0, 160), plan: [...m.querySelectorAll('li')].map((li) => li.className + ':' + li.textContent).slice(0, 3),
    blocks: [...m.querySelectorAll('[data-kind]')].map((x) => x.dataset.kind), law: m.querySelectorAll('.k-ck-law').length, think: !!m.querySelector('.k-chat-think') };
};

async function ask(page, q, shotName) {
  const before = await page.evaluate(() => document.querySelectorAll('.k-chat-msg.me').length);
  if (typeof q === 'string') { await page.fill('.k-chat .k-ck-i', q); await page.press('.k-chat .k-ck-i', 'Enter'); }
  else await page.click(`.k-chat .k-chat-chip[data-q="${q.chip}"]`);
  await page.waitForTimeout(500);
  const busy = await page.evaluate(() => { const b = document.querySelector('.k-chat'); const th = b.querySelector('.k-chat-msg.is-live .k-chat-think'); return { state: b.dataset.state, line: th && getComputedStyle(th).display !== 'none' ? th.innerText.trim() : '' }; });
  if (shotName?.think && SHOT && busy.state === 'busy' && !thinkShot.has(shotName.think)) { thinkShot.add(shotName.think); await page.screenshot({ path: path.join(IMG, shotName.think) }); }
  await page.waitForFunction(() => ['done', 'failed', 'rejected'].includes(document.querySelector('.k-chat').dataset.state), null, { timeout: 120000 }).catch(() => null);
  await page.waitForTimeout(3500);   // 지도 동작 끝 신호 · 블록 그리기
  const a = await page.evaluate(lastAnswer);
  const after = await page.evaluate(() => document.querySelectorAll('.k-chat-msg.me').length);
  if (shotName?.answer && SHOT) await page.screenshot({ path: path.join(IMG, shotName.answer) });
  return { q: typeof q === 'string' ? q : q.chip, busy, a, turns: [before, after] };
}

async function entry(key, mobile) {
  const E = ENTRY[key];
  const base = OUTSIDE ? E.host : BASE;
  const vw = mobile ? '390' : '1440';
  const browser = await launch();
  const ctx = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_|net::/.test(m.text())) errors.push(m.text()); });
  await frontDoor(page, base, E.login, OUTSIDE ? undefined : E.site);
  for (let i = 0; i < 2 && /\/login\/|gov-home/.test(page.url()); i++) { await page.waitForTimeout(1500); await frontDoor(page, base, E.login, OUTSIDE ? undefined : E.site); }
  const tag = `${OUTSIDE ? 'outside-' : ''}${key}`;
  await page.goto(`${base}/landxi/v3/${E.home}/`, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => null);
  await page.waitForTimeout(4000);
  let s = await page.evaluate(state);
  ok(`${tag}-${vw} 첫 화면: 위쪽 물어보기 0 · Ctrl K 표기 0 · 도우미 버튼 보임 · 겹침 0`, s.mastAsk === 0 && !s.ctrlK && s.inView && !s.overlaps.length, s);
  if (SHOT) await page.screenshot({ path: path.join(IMG, `after-${tag}-closed-${vw}.png`) });

  await page.click('.k-chat-fab');
  await page.waitForTimeout(700);
  s = await page.evaluate(state);
  const sizeOk = mobile ? s.box && s.box[2] === 390 && Math.abs(s.box[3] - 844 * 0.72) < 12 && s.box[1] + s.box[3] === 844
    : s.box && s.box[2] === 380 && s.box[3] <= 560 && s.box[3] >= 400;
  ok(`${tag}-${vw} 버튼 → 채팅창 열림(${mobile ? '아래 시트 72%' : '380×560'})`, s.open && sizeOk, { box: s.box });
  const chips = await page.$$eval('.k-chat .k-chat-chip', (b) => b.map((x) => x.textContent));
  ok(`${tag}-${vw} 추천 질문 셋`, chips.length === 3, { chips });
  if (SHOT) await page.screenshot({ path: path.join(IMG, `after-${tag}-open-${vw}.png`) });

  const qs = mobile || OUTSIDE ? E.mQs : E.pcQs;            // 바깥 주소 시험은 GPU 를 쓰지 않는 질문만(같은 질문 길)
  for (let i = 0; i < qs.length; i++) {
    const shot = { answer: `after-${tag}-answer${i ? i + 1 : ''}-${vw}.png`, think: `after-${tag}-think-${vw}.png` };
    const r = await ask(page, qs[i], shot);
    ok(`${tag}-${vw} 질문 → 답 블록: ${r.q}`, r.a && r.a.state === 'done' && (r.a.text || r.a.blocks.length) && r.turns[1] === r.turns[0] + 1, r);
  }
  // 열린 채로 금지어 검사(창 안 글 포함)
  const lint = await page.evaluate(scanSrc);
  ok(`${tag}-${vw} 금지어 0(채팅창 열린 채)`, lint.hits.length === 0, { hits: lint.hits.slice(0, 5) });

  await page.click('.k-chat .k-chat-x');
  await page.waitForTimeout(300);
  s = await page.evaluate(state);
  ok(`${tag}-${vw} 닫기`, !s.open, {});

  if (!mobile) {
    await page.keyboard.press('Control+k'); await page.waitForTimeout(400);
    const k1 = await page.evaluate(state);
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    const k2 = await page.evaluate(state);
    ok(`${tag}-${vw} 단축키(Ctrl K)로 열림 · Esc 로 닫힘 · 화면 표기 0`, k1.open && !k2.open && !k1.ctrlK, {});
  }
  // 다른 화면(지도 없는 화면 포함)으로 옮겨도 같은 자리 · 대화 이어짐
  const turns = s.me;
  await page.goto(`${base}/landxi/v3/${E.other}/`, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => null);
  await page.waitForTimeout(3500);
  const o1 = await page.evaluate(state);
  await page.click('.k-chat-fab'); await page.waitForTimeout(700);
  const o2 = await page.evaluate(state);
  ok(`${tag}-${vw} 다른 화면(${E.other}): 버튼 같은 자리 · 대화 이어짐`, o1.inView && o1.mastAsk === 0 && o2.open && o2.me === turns && turns > 0, { fab: o1.fab, me: o2.me, overlaps: o1.overlaps });
  if (SHOT) await page.screenshot({ path: path.join(IMG, `after-${tag}-other-${vw}.png`) });
  ok(`${tag}-${vw} 화면 오류 0`, errors.length === 0, { errors: errors.slice(0, 3) });
  await browser.close();
}

/* 로그인 전 화면(메인 소개 · 로그인 · 기관 메인)에는 도우미 버튼 · 창이 없다(사용자 10-01) · 단축키도 열지 않는다 */
async function guest(mobile) {
  const vw = mobile ? '390' : '1440';
  const browser = await launch();
  const page = await (await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 } })).newPage();
  const where = OUTSIDE ? [[ENTRY.app.host, '/landxi/v3/main/'], [ENTRY.app.host, '/landxi/v3/login/'], [ENTRY.gov.host, '/']]
    : [[BASE, '/landxi/v3/main/'], [BASE, '/landxi/v3/login/'], [BASE, '/landxi/v3/gov-home/?org=namwon']];
  for (const [host, p] of where) {
    await page.goto(host + p, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => null);
    await page.waitForTimeout(2500);
    await page.keyboard.press('Control+k'); await page.waitForTimeout(400);
    const g = await page.evaluate(() => { const f = document.querySelector('.k-chat-fab'); const b = document.querySelector('.k-chat'); const vis = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden'; return { fab: vis(f), open: vis(b) && !b.hidden, url: location.pathname }; });
    ok(`guest-${vw} 로그인 전 화면에 도우미 없음(${p}) · 단축키로도 열리지 않음`, !g.fab && !g.open, g);
    if (SHOT && p.includes('main')) await page.screenshot({ path: path.join(IMG, `after-${OUTSIDE ? 'outside-' : ''}guest-main-${vw}.png`) });
  }
  await browser.close();
}

for (const mobile of VIEWS) {
  for (const k of ['app', 'admin', 'gov']) if (ONLY.has(k)) await entry(k, mobile).catch((e) => ok(`${k}-${mobile ? 390 : 1440} 실행`, false, { err: String(e).slice(0, 300) }));
  if (ONLY.has('guest')) await guest(mobile).catch((e) => ok(`guest 실행`, false, { err: String(e).slice(0, 300) }));
}
const pass = results.filter((r) => r.pass).length;
console.log(`\n통과 ${pass} / ${results.length}`);
fs.writeFileSync(path.join(HERE, OUTSIDE ? 'e2e-result-outside.json' : 'e2e-result.json'), JSON.stringify({ at: new Date().toISOString(), base: OUTSIDE ? 'outside' : BASE, pass, total: results.length, results }, null, 1));
process.exit(pass === results.length ? 0 : 1);
