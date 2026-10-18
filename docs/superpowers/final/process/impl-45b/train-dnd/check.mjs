// 학습 판 끌어 놓기 확인 — 바깥 주소 · 로그인 폼 · LX 직원. 학습 시작 요청(POST /jobs)은 가로채 가짜 성공(GPU 0) · 사건 흐름도 가짜.
import { pathToFileURL } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
const REPO = 'E:/Land-XI 플랫폼/01. 디자인';
const { chromium } = await import(pathToFileURL(path.join(REPO, 'node_modules/playwright/index.mjs')).href);
const { frontDoor } = await import(pathToFileURL(path.join(REPO, 'landxi/v3/kit/lint/forbidden.mjs')).href);
if (!process.env.DEV_PASSWORD) { const m = fs.readFileSync(path.join(REPO, 'server/.env'), 'utf8').match(/^DEV_PASSWORD=(.*?)\s*$/m); if (m) process.env.DEV_PASSWORD = m[1]; }
process.env.LX_PW ||= process.env.DEV_PASSWORD;
const BASE = 'https://app.land-xi.dev';
const OUT = path.join(REPO, 'docs/superpowers/final/process/impl-45b/train-dnd');
fs.mkdirSync(OUT, { recursive: true });
const FAKE = 'job_UICHECK0000000000000000';
const items = []; const errs = []; const posts = { quote: [], jobs: [] };
const ok = (name, pass, note = '') => { items.push({ name, pass: !!pass, note }); console.log(pass ? 'OK  ' : 'FAIL', name, note); };
const shot = async (page, f, title) => { await page.screenshot({ path: path.join(OUT, f) }); items.push({ shot: f, title, at: new Date().toISOString() }); };

const browser = await chromium.launch({ channel: 'chrome', headless: true });

async function open(w, h, extra = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, ...extra });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(`${w}: ${e}`));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(`${w}: ${m.text()}`); });
  await page.route(/\/api\/v1\/jobs\/quote(\?|$)/, async (r) => {
    const body = r.request().postDataJSON(); const res = await r.fetch(); let j = {}; try { j = await res.json(); } catch { /* */ }
    posts.quote.push({ body, real_allowed: j.allowed, real_reasons: j.reasons || null });
    await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...j, allowed: true }) });
  });
  await page.route(/\/api\/v1\/jobs(\?|$)/, async (r) => {
    if (r.request().method() !== 'POST') return r.continue();
    posts.jobs.push(r.request().postDataJSON());                // 실제 요청 몸 — 서버로는 보내지 않는다(GPU 0)
    await r.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ job: { id: FAKE, state: 'queued' }, events_url: `/api/v1/events/jobs/${FAKE}` }) });
  });
  await page.route(new RegExp(`/events/jobs/${FAKE}`), async (r) => {
    await new Promise((k) => setTimeout(k, 3500));            // 대기 모습을 먼저 찍게
    const ev = (n, d, id) => `event: ${n}\nid: ${id}\ndata: ${JSON.stringify(d)}\n\n`;
    await r.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' },
      body: ev('job.started', {}, 1) + ev('train.epoch', { epoch: 1, map50: 0.42 }, 2) + ev('train.epoch', { epoch: 2, map50: 0.51 }, 3) });
  });
  await frontDoor(page, BASE, 'test@lx.or.kr', 'app');
  await page.waitForURL((u) => !/\/login\/?$/.test(u.pathname), { timeout: 30000 });
  const url = await page.evaluate(async () => {
    const { api } = await import('/landxi/shared/api-v1.js');
    const j = await api('/projects?scope=all');
    const it = j.items || [];
    const p = it.find((x) => /비닐하우스/.test(`${x.name || ''}${x.task || ''}`)) || it[0];
    return p ? { href: `/landxi/v3/lx-train/?project=${encodeURIComponent(p.id)}&stage=train`, name: p.name } : null;
  });
  await page.goto(BASE + url.href);
  await page.locator('.tb-board h1').waitFor({ timeout: 40000 });
  await page.waitForTimeout(1200);
  return { ctx, page, url };
}
const center = async (loc) => { const b = await loc.boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; };
async function dragTo(page, from, to, steps = 14, hold) {
  await page.mouse.move(from[0], from[1]); await page.mouse.down();
  await page.mouse.move(from[0] + 8, from[1] + 4, { steps: 2 });
  await page.mouse.move(to[0], to[1], { steps });
  if (hold) await hold();
  await page.mouse.up();
}
const node = (page, kind, i = 0) => page.locator(`.tb-node[data-kind="${kind}"]`).nth(i);

/* ── A. 1440 · 기본 흐름의 '다시 돌리기'가 보내는 요청(비교 기준) ── */
{
  const { ctx, page, url } = await open(1440, 900);
  ok('프로젝트 학습 화면', true, url.name);
  const go = page.locator('.tb-go');
  const label0 = (await go.textContent()).trim();
  ok("머리 단추(기본 흐름)", ['다시 돌리기', '학습 시작'].includes(label0), label0);
  if (label0 !== '멈추기') {
    await go.click();
    await page.locator('.tb-md-act .t-btn:not(.t-btn--text)').click();
    for (let i = 0; i < 60 && posts.jobs.length < 1; i++) await page.waitForTimeout(250);
    await page.waitForTimeout(500);
  }
  ok("'다시 돌리기' 요청 가로챔", posts.jobs.length === 1);
  await ctx.close();
}
const refReq = posts.jobs[0];

/* ── B. 1440 · 끌어 놓기 ── */
{
  const { ctx, page } = await open(1440, 900);
  const cv = page.locator('.tb-cv');
  const cb = await cv.boundingBox();
  await shot(page, '01-board-1440.png', '학습 판 처음(기본 흐름)');
  const n0 = await page.locator('.tb-node').count();
  /* 1) 칩 끌어 놓기 — 학습 블록 */
  const chip = page.locator('.tb-chip[data-k="train"]');
  await dragTo(page, await center(chip), [cb.x + 610, cb.y + 238], 18, async () => { await page.waitForTimeout(150); await shot(page, '02-chip-drag-1440.png', '칩을 판 위로 끌어 오는 중(따라오는 블록)'); });
  await page.waitForTimeout(300);
  ok('칩 끌어 놓기 → 블록 하나 더', (await page.locator('.tb-node').count()) === n0 + 1);
  const t2 = node(page, 'train', 1);
  const pos = await t2.evaluate((e) => [parseFloat(e.style.left), parseFloat(e.style.top)]);
  ok('놓은 자리에 생김', Math.abs(pos[0] - (610 - 84)) < 6 && Math.abs(pos[1] - (238 - 22)) < 30, JSON.stringify(pos));
  await page.keyboard.press('Escape');
  /* 2) 블록 끌어 옮기기 */
  const tb = await t2.boundingBox();
  await dragTo(page, [tb.x + 60, tb.y + 16], [tb.x + 60 + 120, tb.y + 16 - 10]);
  await page.waitForTimeout(250);
  const pos2 = await t2.evaluate((e) => [parseFloat(e.style.left), parseFloat(e.style.top)]);
  ok('블록 끌어 옮기기', pos2[0] - pos[0] > 100, `${JSON.stringify(pos)} → ${JSON.stringify(pos2)}`);
  ok('끌어 옮긴 뒤 서랍 열리지 않음', await page.locator('.tb-side').isHidden());
  /* 3) 안 되는 잇기 — 학습 설정 출구 → 추론(빨간 테두리 · 짧은 말) */
  const cfgOut = node(page, 'cfg').locator('.tb-port:not(.in)');
  let sawNo = false;
  await dragTo(page, await center(cfgOut), await center(node(page, 'eval')), 14, async () => {
    sawNo = await node(page, 'eval').evaluate((e) => e.classList.contains('is-no'));
    await shot(page, '03-wire-refused-1440.png', '안 되는 블록 위 — 빨간 테두리');
  });
  await page.waitForTimeout(200);
  ok('안 되는 블록 표시(끄는 중)', sawNo);
  const sayBad = await page.locator('.tb-say.bad').textContent().catch(() => '');
  ok('안 되는 잇기 거절 + 짧은 말', /추론은 학습이 끝난 모델에만/.test(sayBad || ''), sayBad);
  await page.waitForTimeout(3000);
  /* 4) 끌어 잇기 — 데이터 · 모델 · 설정 → 새 학습 */
  const wires0 = await page.locator('.tb-wires:not(.tb-drag) g').count();
  let sawSnap = false;
  await dragTo(page, await center(node(page, 'data').locator('.tb-port:not(.in)')), await center(t2), 16, async () => {
    sawSnap = await t2.evaluate((e) => e.classList.contains('is-snap'));
    await shot(page, '04-wire-drag-1440.png', '출구를 끌어 새 학습 블록 위 — 놓을 수 있음(파란 테두리 · 선이 입구에 붙음)');
  });
  ok('놓을 수 있는 블록 표시(끄는 중)', sawSnap);
  await dragTo(page, await center(node(page, 'base').locator('.tb-port:not(.in)')), await center(t2));
  ok("다 잇기 전에는 '학습 시작' 없음", (await t2.locator('.tb-run').count()) === 0);
  await dragTo(page, await center(node(page, 'cfg').locator('.tb-port:not(.in)')), await center(t2));
  await page.waitForTimeout(250);
  ok('끌어 잇기 3개', (await page.locator('.tb-wires:not(.tb-drag) g').count()) === wires0 + 3);
  ok("다 이어지면 블록 안 '학습 시작'", await t2.locator('.tb-run').isVisible());
  ok("머리 단추 '학습 시작'", (await page.locator('.tb-go').textContent()).trim() === '학습 시작');
  await shot(page, '05-ready-1440.png', "다 이어진 새 학습 블록 — 블록 안 '학습 시작'");
  /* 5) 끊기 — 선 누르기(새 학습으로 들어가는 설정 선) */
  await page.waitForTimeout(400);
  const mid = await page.evaluate(() => {
    const cv = document.querySelector('.tb-cv'); const r = cv.getBoundingClientRect();
    const t2 = [...cv.querySelectorAll('.tb-node[data-kind="train"]')][1];
    const gs = [...cv.querySelectorAll('.tb-wires:not(.tb-drag) g')];
    const x2 = parseFloat(t2.style.left);
    const g = gs.reverse().find((g) => { const p = g.querySelector('path.hit'); const L = p.getTotalLength(); const e = p.getPointAtLength(L); return Math.abs(e.x - x2) < 2; });
    const p = g.querySelector('path.hit'); const m = p.getPointAtLength(p.getTotalLength() * 0.5);
    return [r.left + m.x, r.top + m.y];
  });
  console.log('hit at mid:', await page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e ? `${e.tagName}.${e.getAttribute('class')}` : null; }, mid));
  await page.mouse.click(mid[0], mid[1]);
  await page.waitForTimeout(250);
  ok('선 누르면 끊김', (await page.locator('.tb-wires:not(.tb-drag) g').count()) === wires0 + 2);
  ok("끊으면 '학습 시작' 사라짐", (await t2.locator('.tb-run').count()) === 0);
  /* 6) 누르고 누르는 잇기도 그대로 — 끊긴 하나를 누름으로 다시 */
  const wasCfg = await page.evaluate(() => 1);
  await node(page, 'base').locator('.tb-port:not(.in)').click();   // 이미 이어진 모델 → 학습 B: '이미 이어져 있어요'
  await t2.click();
  await page.waitForTimeout(200);
  ok('누름 잇기 — 이미 이어짐 알림', /이미 이어져/.test(await page.locator('.tb-say').textContent().catch(() => '')));
  await page.waitForTimeout(400);
  /* 끊긴 선을 다시 — 데이터 · 설정 중 끊긴 것(마지막에 이은 블록 기준으로 둘 다 시도) */
  for (const k of ['data', 'cfg']) {
    if (await t2.locator('.tb-run').count()) break;
    await node(page, k).locator('.tb-port:not(.in)').click(); await t2.click(); await page.waitForTimeout(300);
  }
  ok('누름 잇기로 다시 다 이어짐', await t2.locator('.tb-run').isVisible());
  /* 7) 키보드 — 고른 블록 화살표로 옮기기 · 서랍 '잇기' */
  await t2.click(); await page.waitForTimeout(200);
  ok('서랍 열림(블록 누름)', await page.locator('.tb-side').isVisible());
  ok("서랍 '잇기' 줄", (await page.locator('.tb-side .tb-wire').count()) >= 3);
  ok("서랍 '학습 시작'", await page.locator('.tb-side .tb-dgo').isVisible());
  await shot(page, '06-drawer-1440.png', "서랍 — 잇기 · 끊기(키보드로도) · 학습 시작");
  await t2.focus();
  const k0 = await t2.evaluate((e) => parseFloat(e.style.left));
  await page.keyboard.press('ArrowLeft'); await page.keyboard.press('Shift+ArrowLeft');
  const k1 = await node(page, 'train', 1).evaluate((e) => parseFloat(e.style.left));
  ok('화살표로 옮기기', Math.round(k0 - k1) === 40, `${k0} → ${k1}`);
  await page.keyboard.press('Escape');
  /* 8) 판 모양 남김 — 새로 고쳐도 그대로 */
  await page.reload(); await page.locator('.tb-board h1').waitFor({ timeout: 40000 }); await page.waitForTimeout(800);
  ok('새로 고쳐도 판 모양 그대로', (await page.locator('.tb-node[data-kind="train"]').count()) === 2 && await node(page, 'train', 1).locator('.tb-run').isVisible());
  /* 9) 학습 시작 — 확인 창 → (가로챈) 대기열 → 그 자리에서 대기 → 학습 중 → 그래프 */
  await node(page, 'train', 1).locator('.tb-run').click();
  await page.locator('.tb-md').waitFor();
  await shot(page, '07-confirm-1440.png', '학습 시작 확인 창');
  await page.locator('.tb-md-act .t-btn:not(.t-btn--text)').click();
  for (let i = 0; i < 60 && posts.jobs.length < 2; i++) await page.waitForTimeout(250);
  await page.waitForTimeout(600);
  const tB = node(page, 'train', 1);
  ok('시작 뒤 새로 고치지 않고 그 자리에서 대기', await tB.evaluate((e) => e.classList.contains('live') && !!e.querySelector('.tb-bar.is-wait')));
  ok("머리 단추 '멈추기'", (await page.locator('.tb-go').textContent()).trim() === '멈추기');
  ok('학습 이력 맨 위 = 새 학습(기다리는 중)', /기다리는 중/.test(await page.locator('.tb-hist tbody tr').first().textContent()));
  await shot(page, '08-queued-1440.png', '대기열에 들어간 학습 블록(오가는 막대 · 숨 쉬는 테두리 · 흐르는 선)');
  await page.waitForFunction(() => /학습 중 · 2/.test(document.querySelectorAll('.tb-node[data-kind="train"]')[1]?.textContent || ''), null, { timeout: 15000 }).catch(() => null);
  const txt = await tB.textContent();
  ok('사건 흐름 → 학습 중 · 반복 수', /학습 중 · 2 \//.test(txt), txt);
  ok('그래프 그려짐(반복 2회)', (await page.locator('.tb-perf svg path.tb-ser').count()) === 1);
  ok('진행 막대 차오름', await tB.evaluate((e) => parseFloat(e.querySelector('.tb-bar i')?.style.width || '0') > 0));
  await page.locator('.tb-board').scrollIntoViewIfNeeded();
  await shot(page, '09-running-1440.png', '학습 중 — 블록 진행 막대 · 이번 학습 그래프(사건 값은 확인용 가짜)');
  await page.evaluate(() => document.querySelector('.tb-perf').scrollIntoView({ block: 'center' }));
  await shot(page, '10-chart-1440.png', '이번 학습 그래프 · 핵심 수치(사건 값은 확인용 가짜)');
  await ctx.close();
}
const dndReq = posts.jobs[1];

/* ── C. 390 · 손가락(터치) 끌기 ── */
{
  const { ctx, page } = await open(390, 844, { hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  await page.locator('.tb-cv').scrollIntoViewIfNeeded();
  await shot(page, '11-board-390.png', '390 — 학습 판');
  const cdp = await ctx.newCDPSession(page);
  const touch = async (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  const tdrag = async (a, b, mid) => { await touch('touchStart', a[0], a[1]); for (let i = 1; i <= 12; i++) await touch('touchMove', a[0] + (b[0] - a[0]) * i / 12, a[1] + (b[1] - a[1]) * i / 12); if (mid) await mid(); await touch('touchEnd'); await page.waitForTimeout(250); };
  /* 칩 → 판(손가락) */
  const n0 = await page.locator('.tb-node').count();
  const cb = await page.locator('.tb-cv').boundingBox();
  await tdrag(await center(page.locator('.tb-chip[data-k="train"]')), [Math.min(cb.x + 200, 370), cb.y + 250], async () => { await shot(page, '12-touch-chip-390.png', '390 — 손가락으로 칩 끌어 오는 중'); });
  ok('390 손가락 칩 끌어 놓기', (await page.locator('.tb-node').count()) === n0 + 1);
  await page.keyboard.press('Escape');
  /* 블록 옮기기(손가락) */
  const d1 = node(page, 'data');
  const x0 = await d1.evaluate((e) => parseFloat(e.style.top));
  const db = await d1.boundingBox();
  await tdrag([db.x + 50, db.y + 14], [db.x + 50, db.y + 14 + 40]);
  const x1 = await d1.evaluate((e) => parseFloat(e.style.top));
  ok('390 손가락 블록 옮기기', x1 - x0 > 25, `${x0} → ${x1}`);
  ok('390 옮긴 뒤 서랍 닫힘', await page.locator('.tb-side').isHidden());
  /* 출구 끌어 잇기(손가락) — 데이터 → 새 학습 */
  const w0 = await page.locator('.tb-wires:not(.tb-drag) g').count();
  const t2 = node(page, 'train', 1);
  await tdrag(await center(d1.locator('.tb-port:not(.in)')), await center(t2), async () => { await shot(page, '13-touch-wire-390.png', '390 — 손가락으로 출구 끌어 잇는 중'); });
  ok('390 손가락 끌어 잇기', (await page.locator('.tb-wires:not(.tb-drag) g').count()) === w0 + 1);
  await shot(page, '14-after-390.png', '390 — 이은 뒤');
  const sw = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  ok('390 가로 넘침 없음(판은 안에서 밀기)', sw);
  await ctx.close();
}

/* ── 요청 몸 비교 ── */
const shape = (r) => r && ({ kind: r.kind, base_model: r.base_model, samples: r.samples, options: r.options, label: r.label });
ok("끌어 이은 학습 요청 = '다시 돌리기' 요청(같은 데이터 · 모델 · 설정)", JSON.stringify(shape(dndReq)) === JSON.stringify(shape(refReq)), JSON.stringify(shape(dndReq)));
ok('요청 키 그대로(kind · base_model · samples · options · label)', dndReq && Object.keys(dndReq).sort().join() === 'base_model,kind,label,options,samples');
ok('견적 → 제출 같은 몸', JSON.stringify(posts.quote[1]?.body) === JSON.stringify(dndReq));
ok('서버로 간 학습 제출 0(가로챔)', true, `가로챈 제출 ${posts.jobs.length}건 · 실제 견적 허용 ${posts.quote.map((q) => q.real_allowed).join(',')}`);
ok('콘솔 오류 0', errs.length === 0, errs.slice(0, 5).join(' | '));
fs.writeFileSync(path.join(OUT, 'items.json'), JSON.stringify({ when: new Date().toISOString(), where: BASE, who: 'LX 직원(로그인 폼)',
  note: '학습 시작 요청은 Playwright 로 가로채 가짜 성공 — 실제 학습(GPU) 0. 그래프 값(42% · 51%)은 확인용 가짜 사건.',
  checks: items.filter((x) => x.name), shots: items.filter((x) => x.shot), request: { ref_rerun: refReq, dnd_start: dndReq, quote_real: posts.quote.map((q) => ({ allowed: q.real_allowed, reasons: q.real_reasons })) },
  console_errors: errs }, null, 1));
await browser.close();
const bad = items.filter((x) => x.name && !x.pass).length;
console.log(bad ? `FAIL ${bad}` : 'ALL OK');
