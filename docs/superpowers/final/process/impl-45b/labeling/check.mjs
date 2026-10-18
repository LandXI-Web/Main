// 학습데이터 구축 · 수동 라벨링 확인 — 바깥 주소 · 로그인 폼 · LX 직원(프로젝트장) · 실제 프로젝트(비닐하우스 2026).
// 그림 5장 더하기 → 다각형 2 + 사각형 1 → 꼭짓점 끌기 · 가운데 점으로 더하기 · 두 번 눌러 빼기 → 클래스 바꾸기 → 저장 → 새로 고침 뒤 그대로 → 라벨 완료
// → 학습 단계가 라벨 완료 장 수를 본다. 390 보기. GPU 0(학습 요청 없음). 끝나면 cleanup.py 로 시험 라벨을 지운다.
import { pathToFileURL } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
const REPO = 'E:/Land-XI 플랫폼/01. 디자인';
const { chromium } = await import(pathToFileURL(path.join(REPO, 'node_modules/playwright/index.mjs')).href);
const { frontDoor } = await import(pathToFileURL(path.join(REPO, 'landxi/v3/kit/lint/forbidden.mjs')).href);
if (!process.env.DEV_PASSWORD) { const m = fs.readFileSync(path.join(REPO, 'server/.env'), 'utf8').match(/^DEV_PASSWORD=(.*?)\s*$/m); if (m) process.env.DEV_PASSWORD = m[1]; }
process.env.LX_PW ||= process.env.DEV_PASSWORD;
const BASE = 'https://app.land-xi.dev';
const OUT = path.join(REPO, 'docs/superpowers/final/process/impl-45b/labeling');
fs.mkdirSync(OUT, { recursive: true });
const items = []; const errs = []; const times = {};
const ok = (name, pass, note = '') => { items.push({ name, pass: !!pass, note }); console.log(pass ? 'OK  ' : 'FAIL', name, note); };
const shot = async (page, f, title) => { await page.screenshot({ path: path.join(OUT, f) }); items.push({ shot: f, title, at: new Date().toISOString() }); };
const browser = await chromium.launch({ channel: 'chrome', headless: true });

async function open(w, h, stage = 'label') {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, ...(w < 500 ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(`${w}: ${e}`));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(`${w}: ${m.text()}`); });
  await frontDoor(page, BASE, 'test@lx.or.kr', 'app');
  await page.waitForURL((u) => !/\/login\/?$/.test(u.pathname), { timeout: 30000 });
  const p = await page.evaluate(async () => {
    const { api } = await import('/landxi/shared/api-v1.js');
    const it = (await api('/projects?scope=all')).items || [];
    const x = it.find((q) => /비닐하우스 2026/.test(q.name || '')) || it.find((q) => /비닐하우스/.test(q.name || ''));
    return x ? { id: x.id, name: x.name } : null;
  });
  const t0 = Date.now();
  await page.goto(`${BASE}/landxi/v3/lx-train/?project=${encodeURIComponent(p.id)}&stage=${stage}`);
  return { ctx, page, p, t0 };
}
const api = (page, url, opt) => page.evaluate(async ([u, o]) => { const { api } = await import('/landxi/shared/api-v1.js'); return api(u, o); }, [url, opt]);
async function ready(page) {
  await page.waitForFunction(() => document.documentElement.dataset.labelReady === '1', null, { timeout: 60000 });
  if (await page.locator('.lb-row').count()) await page.waitForSelector('.lb-cv[data-ready]', { timeout: 30000 });
  await page.waitForTimeout(500);
}
async function geo(page) {             // 그림이 판 가운데 맞춤(0.96)으로 그려진 자리
  const b = await page.locator('.lb-cv').boundingBox();
  const s = Math.min(b.width, b.height) * 0.96;
  const ox = b.x + (b.width - s) / 2, oy = b.y + (b.height - s) / 2;
  return (u, v) => [ox + u * s, oy + v * s];
}

/* ── A. 1440 · 라벨링 ── */
const A = await open(1440, 900);
const { page, p } = A;
ok('프로젝트', !!p, p?.name);
await ready(page);
times.open_ms = Date.now() - A.t0;
ok('라벨링 칸 열림', await page.locator('.lb').isVisible(), `${times.open_ms}ms`);
ok("AXIS 라벨 도구 자리 없음", !(await page.locator('text=라벨 도구').count()) && !(await page.locator('text=AXIS').count()));
let L = await api(page, `/projects/${p.id}/labeling`);
if (!L.images.length) {
  await shot(page, '01-first-1440.png', '처음 — 그림 더하기');
  const sel = page.locator('.lb-first select').first();
  const opts = await sel.locator('option').allTextContents();
  const want = opts.find((o) => /남원시 2023 항공/.test(o)) || opts[0];
  await sel.selectOption({ label: want });
  await page.locator('.lb-first .lb-n').selectOption('5');
  const t1 = Date.now();
  await page.locator('.lb-first button.t-btn').click();
  await page.waitForSelector('.lb-row', { timeout: 120000 });
  times.add5_ms = Date.now() - t1;
  ok('그림 5장 더하기', true, `${want} · ${times.add5_ms}ms`);
  await page.waitForTimeout(1500);
  L = await api(page, `/projects/${p.id}/labeling`);
}
ok('그림 목록', L.images.length >= 1, `${L.images.length}장`);
ok("진행 'n / N장 라벨 완료'", /\/ \d+장 라벨 완료/.test(await page.locator('.lb-prog-t').textContent()), (await page.locator('.lb-prog-t').textContent()).trim());
await shot(page, '02-list-1440.png', '그림 목록 · 진행 · 판 · 클래스');

const first = L.images.find((x) => x.state === 'todo') || L.images[0];
await page.locator('.lb-row', { hasText: `${first.seq}번` }).click();
await page.waitForSelector('.lb-cv[data-ready]', { timeout: 30000 });
await page.waitForTimeout(300);
const at = await geo(page);
await page.locator('.lb-cv').focus();
// 다각형 1 — 네 점 + Enter
await page.keyboard.press('p');
for (const [u, v] of [[0.10, 0.10], [0.35, 0.12], [0.33, 0.35], [0.12, 0.32]]) { await page.mouse.click(...at(u, v)); await page.waitForTimeout(80); }
await page.keyboard.press('Enter');
// 다각형 2 — 다섯 점 + 두 번 누르기
for (const [u, v] of [[0.55, 0.10], [0.85, 0.12], [0.90, 0.30], [0.70, 0.40]]) { await page.mouse.click(...at(u, v)); await page.waitForTimeout(80); }
await page.mouse.dblclick(...at(0.52, 0.30));
await page.waitForTimeout(200);
// 사각형 — 끌기
await page.keyboard.press('r');
await page.mouse.move(...at(0.20, 0.60)); await page.mouse.down(); await page.mouse.move(...at(0.30, 0.70), { steps: 4 }); await page.mouse.move(...at(0.45, 0.82), { steps: 6 }); await page.mouse.up();
await page.waitForTimeout(200);
await shot(page, '03-drawn-1440.png', '다각형 2 · 사각형 1 그림');
// 꼭짓점 고치기 — 다각형 1 고르기 → 첫 꼭짓점 끌기 → 변 가운데 점 끌기(꼭짓점 더하기) → 두 번 눌러 빼기
await page.keyboard.press('v');
await page.mouse.click(...at(0.22, 0.22));
await page.waitForTimeout(150);
await page.mouse.move(...at(0.10, 0.10)); await page.mouse.down(); await page.mouse.move(...at(0.06, 0.05), { steps: 6 }); await page.mouse.up();
await page.waitForTimeout(150);
const mid = [(0.06 + 0.35) / 2, (0.05 + 0.12) / 2];
await page.mouse.move(...at(...mid)); await page.mouse.down(); await page.mouse.move(...at(mid[0], 0.01), { steps: 6 }); await page.mouse.up();
await page.waitForTimeout(150);
await shot(page, '04-vertex-1440.png', '꼭짓점 끌기 · 변 가운데 점으로 꼭짓점 더하기');
await page.mouse.dblclick(...at(0.33, 0.35));
await page.waitForTimeout(150);
// 클래스 바꾸기 — 다각형 2 고르고 '2'
await page.mouse.click(...at(0.72, 0.25));
await page.waitForTimeout(150);
const clsName = (await page.locator('.lb-cls-r').nth(1).locator('span').textContent()).trim();
await page.keyboard.press('2');
await page.waitForTimeout(200);
await shot(page, '05-class-1440.png', `클래스 바꾸기 → ${clsName}`);
await page.keyboard.press('Control+s');
await page.waitForTimeout(2500);
let S = (await api(page, `/projects/${p.id}/labeling`)).images.find((x) => x.id === first.id);
const sh = S.shapes || [];
ok('저장 — 모양 3개', sh.length === 3, `${sh.length}개`);
ok('다각형 1 꼭짓점 4개(더하고 뺌)', sh[0]?.p?.length === 4 && Math.abs(sh[0].p[0][0] - 0.06) < 0.02, JSON.stringify(sh[0]?.p?.slice(0, 2)));
ok('다각형 2 클래스 바뀜', sh[1]?.c === 1, `${clsName}`);
ok('사각형 = 네 점', sh[2]?.k === 'box' && sh[2].p.length === 4);
ok('누가 · 언제 기록', !!S.by && !!S.at, `${S.by} · ${S.at}`);
// 새로 고침 뒤 그대로
await page.reload();
await ready(page);
S = (await api(page, `/projects/${p.id}/labeling`)).images.find((x) => x.id === first.id);
ok('새로 고침 뒤 그대로', (S.shapes || []).length === 3 && JSON.stringify(S.shapes) === JSON.stringify(sh));
await page.locator('.lb-row', { hasText: `${first.seq}번` }).click();
await page.waitForTimeout(1200);
await shot(page, '06-reload-1440.png', '새로 고침 뒤 — 저장한 모양 그대로');
// 라벨 완료 · 다음
const before = (await api(page, `/training/samples?project=${p.id}`)).items.filter((x) => x.source === 'manual');
await page.locator('.lb-foot .t-btn:not(.t-btn--2)').click();
await page.waitForTimeout(2500);
const L2 = await api(page, `/projects/${p.id}/labeling`);
S = L2.images.find((x) => x.id === first.id);
ok('라벨 완료', S.state === 'done' && !!S.done_by, `${S.done_by} · ${S.done_at}`);
ok('다음 그림으로', (await page.locator('.lb-row[aria-current="true"] b').textContent()).trim() !== `${first.seq}번`);
ok("진행 '1 / N장'", (await page.locator('.lb-prog-t').textContent()).includes(`${L2.set.done.value} / ${L2.images.length}장 라벨 완료`), (await page.locator('.lb-prog-t').textContent()).trim());
await shot(page, '07-done-1440.png', '라벨 완료 · 다음 그림');
const after = (await api(page, `/training/samples?project=${p.id}`)).items.filter((x) => x.source === 'manual');
ok('학습데이터 묶음(라벨 완료만)', before.length === 0 && after.length === 1 && after[0].images.value === L2.set.done.value, `${after[0]?.images?.value}장 · 클래스 ${(after[0]?.classes || []).map((c) => `${c.name} ${c.objects.value}`).join(' · ')}`);
items.push({ api_sample: after[0] ? { images: after[0].images.value, train: after[0].train.value, val: after[0].val.value, classes: after[0].classes.map((c) => [c.name, c.objects.value]) } : null });
await A.ctx.close();

/* ── B. 학습 단계가 라벨 완료 장 수를 본다 ── */
const B = await open(1440, 900, 'train');
await B.page.locator('.tb-board h1').waitFor({ timeout: 60000 });
await B.page.waitForTimeout(1500);
await B.page.locator('.tb-node[data-kind="data"]').first().click();
await B.page.waitForTimeout(800);
const side = await B.page.locator('.tb-side').textContent().catch(() => '');
ok('학습 단계 학습 데이터 블록에 라벨링 묶음', /라벨링/.test(side) && side.includes(`${after[0]?.images?.value}장`), side.replace(/\s+/g, ' ').slice(0, 160));
await shot(B.page, '08-train-1440.png', "학습 단계 — 학습 데이터 블록에 '비닐하우스 라벨링 · 라벨 완료한 그림'");
await B.ctx.close();

/* ── D. 1440 · 삭제 · 되돌리기 · 확인 필요 · 클래스 더하기 · 색 · 빼기 ── */
{
  const D = await open(1440, 900);
  await ready(D.page);
  const pg = D.page;
  const at2 = await geo(pg);
  await pg.locator('.lb-cv').focus();
  await pg.keyboard.press('r');
  await pg.mouse.move(...at2(0.3, 0.3)); await pg.mouse.down(); await pg.mouse.move(...at2(0.6, 0.6), { steps: 6 }); await pg.mouse.up();
  await pg.keyboard.press('Delete');
  const n0 = await pg.locator('.lb-tools .lb-tool', { hasText: '되돌리기' }).isEnabled();
  await pg.keyboard.press('Control+z');
  await pg.waitForTimeout(300);
  const back = await pg.evaluate(() => document.querySelector('.lb-tools .lb-tool[title^="다시 하기"]')?.disabled === false);
  ok('삭제 → 되돌리기 → 다시 하기 켜짐', n0 && back);
  await pg.locator('.lb-foot .t-btn--2').click();
  await pg.waitForTimeout(2000);
  const LD = await api(pg, `/projects/${D.p.id}/labeling`);
  const cur = LD.images.find((x) => x.state === 'check');
  ok('확인 필요 표시', !!cur && cur.shapes.length === 1, cur ? `${cur.seq}번 · ${cur.shapes.length}개` : '');
  // 클래스 더하기 · 색
  await pg.locator('.lb-cls-h .lb-link').click();
  await pg.locator('.lb-cls-add input').fill('시험 클래스');
  await pg.locator('.lb-cls-e input[type=color]').first().evaluate((el) => { el.value = '#1A9850'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await shot(pg, '11-class-edit-1440.png', '클래스 고치기 — 이름 · 색 · 새 클래스');
  await pg.locator('.lb-cls > .t-btn').click();
  await pg.waitForTimeout(1500);
  let C2 = (await api(pg, `/projects/${D.p.id}/labeling`)).set.classes;
  ok('클래스 더하기 · 색', C2.length === 5 && C2[4].name === '시험 클래스' && C2[0].color.toUpperCase() === '#1A9850', C2.map((c) => `${c.name} ${c.color}`).join(' · '));
  // 쓴 클래스는 빼기 거절 · 안 쓴 클래스는 빼기
  await pg.locator('.lb-cls-h .lb-link').click();
  await pg.locator('.lb-cls-e').nth(4).locator('.lb-drop').click();
  await pg.waitForTimeout(1500);
  C2 = (await api(pg, `/projects/${D.p.id}/labeling`)).set.classes;
  ok('안 쓴 클래스 빼기', C2.length === 4);
  const e0 = errs.length;
  const refuse = await pg.evaluate(async (pid) => { const { api } = await import('/landxi/shared/api-v1.js'); try { await api(`/projects/${pid}/labeling/classes`, { method: 'PATCH', body: { drop: 0 } }); return 'ok'; } catch (e) { return `${e.status} ${e.message}`; } }, D.p.id);
  ok('쓴 클래스 빼기 거절', /^409/.test(refuse), refuse);
  await pg.waitForTimeout(300);
  errs.splice(e0).forEach((x) => { if (!/409/.test(x)) errs.push(x); });   // 일부러 거절받은 요청(409)은 빼고 센다
  // 색 되돌리기(처음 색)
  await pg.evaluate(async (pid) => { const { api } = await import('/landxi/shared/api-v1.js'); const j = await api(`/projects/${pid}/labeling`); await api(`/projects/${pid}/labeling/classes`, { method: 'PATCH', body: { names: j.set.classes.map((c) => c.name), colors: ['#0FA9A0', '#FF7A45', '#3182F6', '#F04452'] } }); }, D.p.id);
  await D.ctx.close();
}

/* ── C. 390 보기 ── */
const C = await open(390, 844);
await ready(C.page);
await C.page.locator('.lb-cv').scrollIntoViewIfNeeded();
await C.page.waitForTimeout(2000);
await shot(C.page, '09-view-390.png', '390 — 판 · 진행');
await C.page.evaluate(() => document.querySelector('.lb-list')?.scrollIntoView({ block: 'center' }));
await C.page.waitForTimeout(400);
await shot(C.page, '10-list-390.png', '390 — 그림 목록 · 클래스');
const wide = await C.page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
ok('390 가로 넘침 없음', !wide);
await C.ctx.close();

ok('콘솔 오류 0', errs.length === 0, errs.slice(0, 5).join(' | '));
fs.writeFileSync(path.join(OUT, 'items.json'), JSON.stringify({ when: new Date().toISOString(), where: BASE, who: 'LX 직원(로그인 폼) · 비닐하우스 2026 프로젝트장', times, checks: items, errors: errs }, null, 1));
await browser.close();
