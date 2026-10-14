// impl-31 공유 데이터 — 학습 데이터 · 행정 자료 올리기 · 관리. 바깥 주소 로그인 폼(세션 주입 0)으로 PC 1440 그림 · 측정.
//   node shoot.mjs --app https://app.land-xi.dev --admin https://admin.land-xi.dev --out <dir> --zip <학습 묶음.zip> --geo <행정 자료.geojson>
// 흐름: 관리자 올리기 → 공개 → 직원 화면에 보임 → 비공개 → 안 보임 → 지우기. 시험 자료는 끝에 모두 지운다. 비밀번호는 server/.env DEV_PASSWORD(출력 0).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const ROOT = 'E:/Land-XI 플랫폼/01. 디자인';
const HW = 'C:/Users/User/AppData/Local/ms-playwright';
if (fs.existsSync(path.join(HW, 'chromium-1234'))) process.env.PLAYWRIGHT_BROWSERS_PATH = HW;
if (!process.env.DEV_PASSWORD) { const m = fs.readFileSync(path.join(ROOT, 'server/.env'), 'utf8').match(/^DEV_PASSWORD=(.*?)\s*$/m); if (m) process.env.DEV_PASSWORD = m[1]; }
process.env.LX_PW ||= process.env.DEV_PASSWORD;
const { chromium } = createRequire(path.join(ROOT, 'package.json'))('playwright');
const { frontDoor } = await import(pathToFileURL(path.join(ROOT, 'landxi/v3/kit/lint/forbidden.mjs')).href);

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const APP = arg('--app'), ADMIN = arg('--admin', APP), OUT = arg('--out'), ZIP = arg('--zip'), GEO = arg('--geo');
const PRJ = arg('--prj', '비닐하우스');
const TN = '시험 학습 데이터 31', AN = '시험 행정 자료 31';
fs.mkdirSync(OUT, { recursive: true });
const hm = () => { const d = new Date(); return String(d.getHours()).padStart(2, '0') + String(d.getMinutes()).padStart(2, '0'); };
const run = { app: APP, admin: ADMIN, started: new Date().toISOString(), shots: [], frame: {}, notes: {}, errors: [] };
const save = () => fs.writeFileSync(path.join(OUT, 'run.json'), JSON.stringify(run, null, 2));
const shot = async (page, name) => { const f = `${name}-1440-${hm()}.png`; await page.screenshot({ path: path.join(OUT, f) }); run.shots.push(f); console.log('shot', f); };
const watch = (page) => { page.on('pageerror', (e) => run.errors.push(`${page.url()} ${e}`)); page.on('console', (m) => { if (m.type() === 'error') run.errors.push(`${page.url()} ${m.text()}`); }); };
const rect = (p) => p.evaluate(() => { const r = (s) => { const b = document.querySelector(s)?.getBoundingClientRect(); return b ? [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)] : null; };
  return { card: r('.sd-card'), head: r('.sd-h'), tabs: r('.sd-tabs'), body: r('.sd-body'), pager: r('.sd-pg'), q: r('.sd-q'), up: r('.sd-up-b') }; });
const ready = (p) => p.waitForFunction(() => { const b = document.querySelector('.sd-body'); return b && !b.querySelector('.sd-wait') && (b.querySelector('table, .sd-none') || b.querySelector('[data-kind=error]')); }, null, { timeout: 40000 });
const tab = async (p, label) => { await p.locator('.sd-tabs button', { hasText: label }).click(); await ready(p); await p.waitForTimeout(600); };
const rowOf = (p, name) => p.locator('.sd-tbl tr', { has: p.locator('b', { hasText: name }) }).first();
const apiA = (p, path, opt) => p.evaluate(async ([u, o]) => { const { api } = await import('/landxi/shared/api-v1.js'); return api(u, o); }, [path, opt]);

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = (o = {}) => browser.newContext({ viewport: { width: 1440, height: 900 }, ...o });
let a, s, sid = null, iid = null;
try {
  a = await (await ctx()).newPage(); watch(a);
  await frontDoor(a, ADMIN, 'lxadmin@lx.or.kr', 'admin');
  await a.waitForURL((u) => !/\/login\/?(\?|$)/.test(u.pathname), { timeout: 30000 });
  await a.goto(`${ADMIN}/landxi/v3/ops-infra/#/shared`, { waitUntil: 'domcontentloaded' });
  await ready(a); await a.waitForTimeout(1200);
  run.frame.img = await rect(a);
  for (const [k, label] of [['train', '학습 데이터'], ['admin', '행정 자료']]) { await tab(a, label); run.frame[k] = await rect(a); }
  const keys = Object.keys(run.frame);
  const same = (k) => JSON.stringify(['card', 'head', 'tabs', 'body', 'pager', 'up'].map((x) => run.frame[k][x]));
  run.frame_same = keys.every((k) => same(k) === same(keys[0]));
  run.notes.up_text = {};

  /* ── 학습 데이터 올리기 ── */
  await tab(a, '학습 데이터');
  run.notes.up_text.train = await a.locator('.sd-up-b').textContent();
  await a.locator('.sd-up-b').click();
  await a.locator('.k-md .sd-file').setInputFiles(ZIP);
  await a.locator('.k-md input[aria-label="이름"]').fill(TN);
  await a.waitForFunction(() => !document.querySelector('.k-md .t-btn:not(.t-btn--2)')?.disabled, null, { timeout: 15000 });
  await a.waitForTimeout(300);
  await shot(a, 'train-upload');
  await a.locator('.k-md .t-btn:not(.t-btn--2)').click();
  await rowOf(a, TN).waitFor({ timeout: 90000 }); await a.waitForTimeout(600);
  sid = await rowOf(a, TN).getAttribute('data-id');
  run.notes.train_row = (await rowOf(a, TN).innerText()).replace(/\s+/g, ' ');
  await rowOf(a, TN).locator('.sd-vis').click();
  await a.waitForFunction((id) => document.querySelector(`.sd-tbl tr[data-id="${id}"] .sd-vis`)?.textContent === '공개', sid, { timeout: 20000 });
  await shot(a, 'train-public');

  /* 직원 학습 화면 — 공유 데이터에서 고르기 */
  s = await (await ctx()).newPage(); watch(s);
  await frontDoor(s, APP, 'test@lx.or.kr', 'app');
  await s.waitForURL((u) => !/\/login\/?(\?|$)/.test(u.pathname), { timeout: 30000 });
  const pj = await s.evaluate(async () => { const { api } = await import('/landxi/v3/kit/util.js'); return api('/projects?scope=all'); });
  const pid = (pj.items || []).find((x) => x.name.includes(PRJ))?.id;
  const board = async () => {
    await s.goto(`${APP}/landxi/v3/lx-train/?project=${pid}&stage=train`, { waitUntil: 'domcontentloaded' });
    await s.waitForFunction(() => document.documentElement.dataset.trainBoard === '1', null, { timeout: 40000 });
    await s.waitForTimeout(1000);
    await s.locator('.tb-node[data-kind="data"]').first().click(); await s.waitForTimeout(600);
    return s.evaluate(() => document.querySelector('.tb-side')?.innerText.replace(/\s+/g, ' ') || '');
  };
  let t = await board();
  run.notes.staff_train_public = t.includes(TN);
  await shot(s, 'staff-train-public');

  /* 정보 고치기(이름 · 클래스) */
  await rowOf(a, TN).getByRole('button', { name: '정보 고치기' }).click();
  await a.locator('.k-md .sd-cls-f select').first().waitFor({ timeout: 30000 }); await a.waitForTimeout(500);
  run.notes.train_edit_fields = await a.evaluate(() => [...document.querySelectorAll('.k-md label > span, .k-md .sd-cls-f > span')].map((x) => x.textContent));
  run.notes.train_edit_options = await a.locator('.k-md .sd-cls-f select option').count();
  await shot(a, 'train-edit');
  await a.locator('.k-md .sd-cls-f select').first().selectOption('비닐하우스');
  await a.locator('.k-md .t-btn', { hasText: '저장' }).click();
  await a.waitForFunction((id) => document.querySelector(`.sd-tbl tr[data-id="${id}"]`)?.innerText.includes('비닐하우스'), sid, { timeout: 30000 });
  run.notes.train_row_edited = (await a.locator(`.sd-tbl tr[data-id="${sid}"]`).innerText()).replace(/\s+/g, ' ');

  /* 비공개 → 직원 화면에서 사라짐 */
  await a.locator(`.sd-tbl tr[data-id="${sid}"] .sd-vis`).click();
  await a.waitForFunction((id) => document.querySelector(`.sd-tbl tr[data-id="${id}"] .sd-vis`)?.textContent === '비공개', sid, { timeout: 20000 });
  t = await board();
  run.notes.staff_train_private = t.includes(TN);
  run.notes.staff_list_private = await s.evaluate(async (id) => { const { api } = await import('/landxi/v3/kit/util.js'); return (await api('/training/samples')).items.some((x) => x.id === id); }, sid);

  /* 지우기(확인 한 번) */
  await a.locator(`.sd-tbl tr[data-id="${sid}"]`).getByRole('button', { name: '지우기' }).click();
  await a.waitForTimeout(400);
  await shot(a, 'train-delete');
  await a.locator('.k-md .t-btn', { hasText: '지우기' }).click();
  await a.waitForFunction((id) => !document.querySelector(`.sd-tbl tr[data-id="${id}"]`), sid, { timeout: 30000 });
  run.notes.train_deleted = true; sid = null;
  save();

  /* ── 행정 자료 올리기 ── */
  await tab(a, '행정 자료');
  run.notes.up_text.admin = await a.locator('.sd-up-b').textContent();
  await a.locator('.sd-up-b').click();
  await a.locator('.k-md .sd-file').setInputFiles(GEO);
  await a.locator('.k-md input[aria-label="이름"]').fill(AN);
  await a.locator('.k-md select[aria-label="종류"]').selectOption('public_asset');
  await a.waitForTimeout(300);
  await shot(a, 'admin-upload');
  await a.locator('.k-md .t-btn', { hasText: '올리기' }).click();
  await rowOf(a, AN).waitFor({ timeout: 60000 }); await a.waitForTimeout(600);
  iid = await rowOf(a, AN).getAttribute('data-id');
  run.notes.admin_row = (await rowOf(a, AN).innerText()).replace(/\s+/g, ' ');
  await rowOf(a, AN).locator('.sd-vis').click();
  await a.waitForFunction((id) => document.querySelector(`.sd-tbl tr[data-id="${id}"] .sd-vis`)?.textContent === '공개', iid, { timeout: 20000 });
  await shot(a, 'admin-public');

  /* 직원 지도 서비스 — 행정 자료 층 */
  const mapsvc = async () => {
    await s.goto(`${APP}/landxi/v3/lx-map/`, { waitUntil: 'domcontentloaded' });
    await s.waitForFunction(() => document.querySelector('.lm-bot'), null, { timeout: 40000 });
    await s.waitForTimeout(1500);
    return s.evaluate(() => [...document.querySelectorAll('.lm-shl button')].map((b) => b.textContent));
  };
  let names = await mapsvc();
  run.notes.staff_map_public = names;
  if (names.includes(AN)) {
    await s.locator('.lm-shl button', { hasText: AN }).click();
    await s.waitForTimeout(3500);
    run.notes.staff_map_drawn = await s.evaluate((id) => { const m = window.__lm.map; return m.getLayer('lm-sh-' + id + '-f') ? m.queryRenderedFeatures({ layers: ['lm-sh-' + id + '-f'] }).length : -1; }, iid);
  }
  await shot(s, 'staff-map-public');

  await rowOf(a, AN).locator('.sd-vis').click();
  await a.waitForFunction((id) => document.querySelector(`.sd-tbl tr[data-id="${id}"] .sd-vis`)?.textContent === '비공개', iid, { timeout: 20000 });
  names = await mapsvc();
  run.notes.staff_map_private = names;
  await shot(s, 'staff-map-private');

  await rowOf(a, AN).getByRole('button', { name: '정보 고치기' }).click(); await a.waitForTimeout(400);
  await shot(a, 'admin-edit');
  await a.locator('.k-md .t-btn', { hasText: '취소' }).click(); await a.waitForTimeout(300);
  await rowOf(a, AN).getByRole('button', { name: '지우기' }).click(); await a.waitForTimeout(300);
  await a.locator('.k-md .t-btn', { hasText: '지우기' }).click();
  await a.waitForFunction((id) => !document.querySelector(`.sd-tbl tr[data-id="${id}"]`), iid, { timeout: 30000 });
  run.notes.admin_deleted = true; iid = null;
  await a.waitForTimeout(500);
  await shot(a, 'admin-after');
} finally {
  if (a) {                                                    // 시험 자료 정리(중간에 멈췄어도)
    if (sid) await apiA(a, `/training/samples/${sid}`, { method: 'DELETE' }).catch(() => {});
    if (iid) await apiA(a, `/shared/ledgers/${iid}`, { method: 'DELETE' }).catch(() => {});
  }
  run.finished = new Date().toISOString();
  save();
  await browser.close();
}
