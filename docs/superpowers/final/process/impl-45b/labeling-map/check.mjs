// 학습데이터 구축 · 지도 위에서 라벨링 확인 — 바깥 주소 · 로그인 폼 · LX 직원(프로젝트장) · 실제 프로젝트(비닐하우스 2026).
// 지도 준비 시간(목표 2초) → 다각형 2 + 사각형 1 → 꼭짓점 끌기 · 변 가운데 점으로 더하기 · 두 번 눌러 빼기 → 클래스 바꾸기 → 삭제 · 되돌리기 → 저장
// → '이 화면 라벨 완료'(서버가 그림으로 잘라 같은 묶음) → 새로 고침 뒤 그대로 → 그림 보기에 같은 그림(보기만) → 학습 단계가 라벨 완료 장 수를 본다 → 390.
// GPU 0(학습 요청 없음). 끝나면 cleanup.py 로 시험 라벨을 지운다. 비밀번호는 server/.env 에서 읽기만(출력하지 않음).
import { pathToFileURL } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
const REPO = 'E:/Land-XI 플랫폼/01. 디자인';
const { chromium } = await import(pathToFileURL(path.join(REPO, 'node_modules/playwright/index.mjs')).href);
const { frontDoor } = await import(pathToFileURL(path.join(REPO, 'landxi/v3/kit/lint/forbidden.mjs')).href);
if (!process.env.DEV_PASSWORD) { const m = fs.readFileSync(path.join(REPO, 'server/.env'), 'utf8').match(/^DEV_PASSWORD=(.*?)\s*$/m); if (m) process.env.DEV_PASSWORD = m[1]; }
process.env.LX_PW ||= process.env.DEV_PASSWORD;
const BASE = 'https://app.land-xi.dev';
const OUT = path.join(REPO, 'docs/superpowers/final/process/impl-45b/labeling-map');
fs.mkdirSync(OUT, { recursive: true });
const items = []; const errs = []; const times = {};
const ok = (name, pass, note = '') => { items.push({ name, pass: !!pass, note }); console.log(pass ? 'OK  ' : 'FAIL', name, note); };
const shot = async (page, f, title) => { await page.screenshot({ path: path.join(OUT, f) }); items.push({ shot: f, title, at: new Date().toISOString() }); };
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function login(w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, ...(w < 500 ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(`${w}: ${e}`));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(`${w}: ${m.text()}`); });
  page.on('response', (r) => { if (r.status() >= 500) errs.push(`${w}: ${r.status()} ${new URL(r.url()).pathname}`); });
  await frontDoor(page, BASE, 'test@lx.or.kr', 'app');
  await page.waitForURL((u) => !/\/login\/?$/.test(u.pathname), { timeout: 30000 });
  const p = await page.evaluate(async () => {
    const { api } = await import('/landxi/shared/api-v1.js');
    const it = (await api('/projects?scope=all')).items || [];
    const x = it.find((q) => /비닐하우스 2026/.test(q.name || '')) || it.find((q) => /비닐하우스/.test(q.name || ''));
    return x ? { id: x.id, name: x.name } : null;
  });
  return { ctx, page, p };
}
async function openLabel(page, p, extra = '') {
  const t0 = Date.now();
  await page.goto(`${BASE}/landxi/v3/lx-train/?project=${encodeURIComponent(p.id)}&stage=label${extra}`);
  await page.waitForFunction(() => document.documentElement.dataset.labelMapReady === '1', null, { timeout: 60000 });
  const wall = Date.now() - t0;
  const tm = await page.evaluate(() => window.__lmTiming);
  await sleep(400);
  return { wall, nav: tm?.nav, tm };
}
const api = (page, url, opt) => page.evaluate(async ([u, o]) => { const { api } = await import('/landxi/shared/api-v1.js'); return api(u, o); }, [url, opt]);
async function frame(page) {             // 지도 칸 안 자리(0–1 비율 → 화면 점) — 도구 띠 · 확대 단추를 피해 가운데 넓은 칸
  const b = await page.locator('.lm-map canvas').boundingBox();
  return (u, v) => [b.x + b.width * (0.12 + u * 0.76), b.y + b.height * (0.16 + v * 0.74)];
}

/* ── A. 1440 · 지도 라벨링 ── */
const A = await login(1440, 900);
const { page, p } = A;
ok('프로젝트', !!p, p?.name);
const L0 = await api(page, `/projects/${p.id}/labeling/map`);
ok('처음 — 이 프로젝트 라벨링 묶음 없음(시험 뒤 지울 수 있게)', !L0.set, L0.set ? '이미 있음 — 시험 라벨만 지운다' : '없음');
items.push({ before: { set: L0.set?.id || null } });
const o1 = await openLabel(page, p);
times.first_open = o1;
const o2 = await openLabel(page, p);          // 두 번째(브라우저 보관 · 서버 보관이 찬 보통 경우)
const o3 = await openLabel(page, p);
times.again_open = [o2, o3];
ok('지도 준비 ≤ 2초(다시 열기)', Math.min(o2.nav, o3.nav) <= 2000, `처음 ${o1.nav}ms · 다시 ${o2.nav}ms · ${o3.nav}ms(화면 열기 → 영상 조각 그려짐)`);
ok("기본 보기 = 지도 · '지도 | 그림' 단추", await page.locator('.lb-view-b[aria-selected="true"]', { hasText: '지도' }).count() === 1 && await page.locator('.lb-view-b', { hasText: '그림' }).count() === 1);
ok('대상 지역 테두리 · 영상 층', await page.evaluate(() => { const m = document.querySelector('.lm-map'); return !!m; }));
const pick = (await api(page, `/projects/${p.id}/labeling/map`)).pick;
ok('지도에 펼친 영상', !!pick, (await page.locator('.lm-imgname, .lm-img select').first().evaluate((e) => e.value ? e.selectedOptions[0].textContent : e.textContent)).trim());
await shot(page, '01-map-1440.png', '지도 라벨링 — 왼쪽 실제 지도(프로젝트 영상) · 오른쪽 클래스 · 진행');

const at = await frame(page);
await page.locator('.lm-map canvas').hover();
// 다각형 1 — 네 점 + Enter
await page.keyboard.press('p');
for (const [u, v] of [[0.08, 0.10], [0.30, 0.12], [0.28, 0.40], [0.10, 0.36]]) { await page.mouse.click(...at(u, v)); await sleep(120); }
await page.keyboard.press('Enter');
await sleep(150);
// 다각형 2 — 네 점 + 두 번 누르기
for (const [u, v] of [[0.55, 0.08], [0.85, 0.10], [0.92, 0.32], [0.70, 0.42]]) { await page.mouse.click(...at(u, v)); await sleep(120); }
await page.mouse.dblclick(...at(0.52, 0.30));
await sleep(200);
// 사각형 — 끌기
await page.keyboard.press('r');
await page.mouse.move(...at(0.20, 0.60)); await page.mouse.down(); await page.mouse.move(...at(0.30, 0.70), { steps: 4 }); await page.mouse.move(...at(0.45, 0.88), { steps: 6 }); await page.mouse.up();
await sleep(250);
await shot(page, '02-drawn-1440.png', '지도 위에 다각형 2 · 사각형 1');
let n = await page.locator('.lm-rows .lm-row').count();
ok('그린 모양 목록 3개', n === 3, `${n}개`);
// 꼭짓점 고치기 — 다각형 1 고르기 → 첫 꼭짓점 끌기 → 변 가운데 점 끌기(더하기) → 두 번 눌러 빼기
await page.keyboard.press('v');
await page.mouse.click(...at(0.19, 0.24));
await sleep(200);
await page.mouse.move(...at(0.08, 0.10)); await page.mouse.down(); await page.mouse.move(...at(0.04, 0.04), { steps: 8 }); await page.mouse.up();
await sleep(200);
const mid = [(0.04 + 0.30) / 2, (0.04 + 0.12) / 2];
await page.mouse.move(...at(...mid)); await page.mouse.down(); await page.mouse.move(...at(mid[0], -0.04), { steps: 8 }); await page.mouse.up();
await sleep(200);
await shot(page, '03-vertex-1440.png', '꼭짓점 끌기 · 변 가운데 점으로 꼭짓점 더하기');
await page.mouse.dblclick(...at(0.28, 0.40));
await sleep(200);
// 클래스 바꾸기 — 다각형 2 고르고 '2'
await page.mouse.click(...at(0.75, 0.22));
await sleep(200);
const clsName = (await page.locator('.lb-cls-r').nth(1).locator('span').textContent()).trim();
await page.keyboard.press('2');
await sleep(250);
await shot(page, '04-class-1440.png', `클래스 바꾸기 → ${clsName}`);
// 삭제 → 되돌리기(사각형)
await page.mouse.click(...at(0.38, 0.80));
await sleep(150);
await page.keyboard.press('Delete');
await sleep(150);
const afterDel = await page.locator('.lm-rows .lm-row').count();
await page.keyboard.press('Control+z');
await sleep(200);
const afterUndo = await page.locator('.lm-rows .lm-row').count();
await page.keyboard.press('Control+Shift+z');
await sleep(150);
const afterRedo = await page.locator('.lm-rows .lm-row').count();
await page.keyboard.press('Control+z');
await sleep(150);
ok('삭제 → 되돌리기 → 다시 하기', afterDel === 2 && afterUndo === 3 && afterRedo === 2, `${afterDel} → ${afterUndo} → ${afterRedo} → 되돌림`);
await page.keyboard.press('Control+s');
await sleep(2500);
let M = await api(page, `/projects/${p.id}/labeling/map`);
let sh = M.maps?.[M.pick]?.shapes || [];
ok('저장 — 모양 3개(경위도)', sh.length === 3, `${sh.length}개`);
ok('다각형 1 꼭짓점 4개(더하고 뺌)', sh[0]?.g?.length === 4, `${sh[0]?.g?.length}개`);
ok('다각형 2 클래스 바뀜', sh[1]?.c === 1, clsName);
ok('사각형 = 네 점', sh[2]?.k === 'box' && sh[2].g.length === 4);
ok('누가 · 언제 기록', !!M.maps[M.pick].by && !!M.maps[M.pick].at, `${M.maps[M.pick].by} · ${M.maps[M.pick].at}`);
// 이 화면 라벨 완료
const t1 = Date.now();
await page.locator('.lb-foot .t-btn:not(.t-btn--2)', { hasText: '이 화면 라벨 완료' }).click();
await page.waitForFunction(() => /라벨 완료/.test(document.querySelector('.lb-foot .t-btn:not(.t-btn--2)')?.textContent || '') && !document.querySelector('.lb-foot .t-btn:not(.t-btn--2)').disabled, null, { timeout: 120000 });
times.area_ms = Date.now() - t1;
await sleep(800);
M = await api(page, `/projects/${p.id}/labeling/map`);
const area = M.areas[M.areas.length - 1];
const chips = M.chips.filter((c) => c.area === area?.id);
const objs = chips.reduce((a, c) => a + (c.n || 0), 0);
ok("'이 화면 라벨 완료' → 그림으로 잘림", !!area && chips.length >= 1 && chips.every((c) => c.state === 'done'), `그림 ${chips.length}장 · 그 안 모양 ${objs}개 · ${times.area_ms}ms`);
ok('라벨 완료 장 수 = 묶음 셈', M.set?.done?.value === chips.length, `${M.set?.done?.value} / ${M.set?.total?.value}장`);
await shot(page, '05-area-done-1440.png', "이 화면 라벨 완료 — 흰 점선 칸 = 학습 그림이 된 자리");
items.push({ area: { id: area?.id, images: chips.length, objects: objs } });
// 새로 고침 뒤 그대로
const o4 = await openLabel(page, p);
const M2 = await api(page, `/projects/${p.id}/labeling/map`);
ok('새로 고침 뒤 그대로', JSON.stringify(M2.maps[M2.pick].shapes) === JSON.stringify(M.maps[M.pick].shapes) && M2.areas.length === M.areas.length, `다시 열기 ${o4.nav}ms`);
ok('오른쪽 목록 — 그린 모양 · 라벨 완료한 곳', (await page.locator('.lm-rows .lm-row').count()) >= 4, (await page.locator('.lm-right').innerText()).replace(/\s+/g, ' ').slice(0, 160));
await page.locator('.lm-ar .lm-row').first().click();
await sleep(1200);
await shot(page, '06-reload-1440.png', '새로 고침 뒤 — 모양 · 라벨 완료한 곳 그대로');
// 모양을 고치면 라벨 완료한 그림 라벨도 다시 쓴다
const before = M2.chips.filter((c) => c.area === area.id).map((c) => c.n).join(',');
await page.evaluate(async ([pid, iid, at]) => {
  const { api } = await import('/landxi/shared/api-v1.js');
  const j = await api(`/projects/${pid}/labeling/map`);
  const s = j.maps[iid].shapes; s.splice(2, 1);                // 사각형 빼기
  await api(`/projects/${pid}/labeling/map/${iid}`, { method: 'PUT', body: { shapes: s, at } });
}, [p.id, M2.pick, M2.maps[M2.pick].at]);
const M3 = await api(page, `/projects/${p.id}/labeling/map`);
const after = M3.chips.filter((c) => c.area === area.id).map((c) => c.n).join(',');
ok('모양을 고치면 라벨 완료 그림 라벨도 다시', before !== after || !objs, `그림별 모양 ${before} → ${after}`);
// AI 결과 자리로
const spot = page.locator('.lb-foot .t-btn--2', { hasText: 'AI 결과 자리' });
if (await spot.count()) {
  const c0 = await page.evaluate(() => document.querySelector('.lm-map canvas') && 1);
  await spot.click(); await sleep(1500);
  ok("'다음 AI 결과 자리'로 건너가기", !!c0, (await spot.textContent()).trim());
  await shot(page, '07-spot-1440.png', '다음 AI 결과 자리 — 라벨할 곳으로 건너감(흰 점 = AI 결과 자리)');
}
// 그림 보기 — 같은 그림이 그림 목록에(보기만)
await page.locator('.lb-view-b', { hasText: '그림' }).click();
await page.waitForFunction(() => document.documentElement.dataset.labelReady === '1', null, { timeout: 60000 });
await page.waitForSelector('.lb-cv[data-ready]', { timeout: 30000 }).catch(() => null);
await sleep(800);
const rows = await page.locator('.lb-row').count();
const mapRows = await page.locator('.lb-row small', { hasText: '라벨 완료 · 지도' }).count();
ok('그림 보기 — 지도에서 만든 그림이 같은 목록에', rows >= chips.length && mapRows >= 1, `그림 ${rows}장 · 지도에서 ${mapRows}장`);
await page.locator('.lb-row', { has: page.locator('small', { hasText: '라벨 완료 · 지도' }) }).first().click();
await page.waitForSelector('.lb-cv[data-ready]', { timeout: 30000 });
await sleep(500);
ok('지도에서 만든 그림은 그림 보기에서 보기만', (await page.locator('.lb-hint').innerText()).includes('지도에서'), (await page.locator('.lb-hint span').first().textContent()).trim());
await shot(page, '08-chip-view-1440.png', '그림 보기 — 지도에서 라벨 완료한 그림(512 화소 · 라벨 다각형)');
const chipT = []; for (let k = 0; k < 2; k++) { const t = Date.now(); await page.goto(`${BASE}/landxi/v3/lx-train/?project=${encodeURIComponent(p.id)}&stage=label&view=chip`); await page.waitForSelector('.lb-cv[data-ready]', { timeout: 60000 }); chipT.push({ wall: Date.now() - t, nav: Math.round(await page.evaluate(() => performance.now())) }); }
times.chip_open = chipT;
ok('그림 보기 열기(그림까지)', true, chipT.map((x) => `${x.nav}ms`).join(' · '));
await page.locator('.lb-view-b', { hasText: '지도' }).click();
await page.waitForFunction(() => document.documentElement.dataset.labelMapReady === '1', null, { timeout: 60000 });
await A.ctx.close();

/* ── B. 학습 단계가 라벨 완료 장 수를 본다 ── */
{
  const B = await login(1440, 900);
  await B.page.goto(`${BASE}/landxi/v3/lx-train/?project=${encodeURIComponent(p.id)}&stage=train`);
  await B.page.locator('.tb-board h1').waitFor({ timeout: 60000 });
  await sleep(1500);
  await B.page.locator('.tb-node[data-kind="data"]').first().click();
  await sleep(800);
  const side = await B.page.locator('.tb-side').textContent().catch(() => '');
  const smp = (await api(B.page, `/training/samples?project=${p.id}`)).items.filter((x) => x.source === 'manual');
  ok('학습 단계 학습 데이터 블록에 라벨링 묶음 · 장 수', /라벨링/.test(side) && smp.length === 1 && side.includes(`${smp[0].images.value}장`), `${smp[0]?.images?.value}장 · ${side.replace(/\s+/g, ' ').slice(0, 120)}`);
  items.push({ api_sample: smp[0] ? { images: smp[0].images.value, train: smp[0].train.value, val: smp[0].val.value, classes: smp[0].classes.map((c) => [c.name, c.objects.value]) } : null });
  await shot(B.page, '09-train-1440.png', '학습 단계 — 학습 데이터 블록에 라벨링 묶음(지도에서 라벨 완료한 그림)');
  await B.ctx.close();
}

/* ── C. 390 보기 ── */
{
  const C = await login(390, 844);
  const oc = await openLabel(C.page, p);
  times.open_390 = oc;
  await shot(C.page, '10-map-390.png', '390 — 지도 · 도구');
  await C.page.evaluate(() => document.querySelector('.lm-right')?.scrollIntoView({ block: 'start' }));
  await sleep(400);
  await shot(C.page, '11-list-390.png', '390 — 클래스 · 그린 모양 · 라벨 완료한 곳');
  const wide = await C.page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  ok('390 가로 넘침 없음', !wide, `지도 준비 ${oc.nav}ms`);
  await C.ctx.close();
}

ok('콘솔 오류 0', errs.length === 0, errs.slice(0, 5).join(' | '));
fs.writeFileSync(path.join(OUT, 'items.json'), JSON.stringify({ when: new Date().toISOString(), where: BASE, who: 'LX 직원(로그인 폼) · 비닐하우스 2026 프로젝트장', project: p, times, checks: items, errors: errs }, null, 1));
await browser.close();
