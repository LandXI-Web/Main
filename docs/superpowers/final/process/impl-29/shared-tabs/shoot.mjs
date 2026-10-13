// impl-29 공유 데이터 탭 셋 · 비공개 영상 기관 목록에서 뺌 — 바깥 주소 로그인 폼(세션 주입 0)으로 PC 1440 그림 · 측정.
//   node shoot.mjs --app https://app.land-xi.dev --admin https://admin.land-xi.dev --out <dir>
// 시험 공개/비공개는 끝나면 원래대로 되돌린다. 비밀번호는 server/.env DEV_PASSWORD(출력 0).
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
const { frontDoor, orgLoginUrl } = await import(pathToFileURL(path.join(ROOT, 'landxi/v3/kit/lint/forbidden.mjs')).href);

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const APP = arg('--app'), ADMIN = arg('--admin', APP), OUT = arg('--out');
const IMG = arg('--img', 'ap25-namwon-2023');           // 시험으로 비공개 → 다시 공개할 영상(남원 기관에 공유된 것)
const SMP = arg('--smp', 'smp_5333ad8072');             // 시험으로 공개 → 다시 비공개할 학습 데이터
const PRJ = arg('--prj', '비닐하우스');
const ONLY_TRAIN = process.argv.includes('--only-train');      // 학습 데이터 공개 → 고르기 장면만 다시                  // 그 학습 데이터를 '공유 데이터에서 고르기'로 볼 다른 프로젝트
fs.mkdirSync(OUT, { recursive: true });
const hm = () => { const d = new Date(); return String(d.getHours()).padStart(2, '0') + String(d.getMinutes()).padStart(2, '0'); };
const run = { app: APP, admin: ADMIN, started: new Date().toISOString(), shots: [], frame: {}, notes: {}, errors: [] };
const save = () => fs.writeFileSync(path.join(OUT, ONLY_TRAIN ? 'run-train.json' : 'run.json'), JSON.stringify(run, null, 2));
const shot = async (page, name) => { const f = `${name}-1440-${hm()}.png`; await page.screenshot({ path: path.join(OUT, f) }); run.shots.push(f); console.log('shot', f); };
const watch = (page) => { page.on('pageerror', (e) => run.errors.push(`${page.url()} ${e}`)); page.on('console', (m) => { if (m.type() === 'error') run.errors.push(`${page.url()} ${m.text()}`); }); };
const rect = (p) => p.evaluate(() => { const r = (s) => { const b = document.querySelector(s)?.getBoundingClientRect(); return b ? [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)] : null; };
  return { card: r('.sd-card'), head: r('.sd-h'), tabs: r('.sd-tabs'), body: r('.sd-body'), pager: r('.sd-pg'), q: r('.sd-q') }; });
const ready = (p) => p.waitForFunction(() => { const b = document.querySelector('.sd-body'); return b && !b.querySelector('.sd-wait') && (b.querySelector('table, .sd-none') || b.querySelector('[data-kind=error]')); }, null, { timeout: 40000 });

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = (o = {}) => browser.newContext({ viewport: { width: 1440, height: 900 }, ...o });
let a, o, s;
try {
  /* ── LX 관리자 · 공유 데이터 탭 셋 ── */
  a = await (await ctx()).newPage(); watch(a);
  await frontDoor(a, ADMIN, 'lxadmin@lx.or.kr', 'admin');
  await a.waitForURL((u) => !/\/login\/?(\?|$)/.test(u.pathname), { timeout: 30000 });
  await a.goto(`${ADMIN}/landxi/v3/ops-infra/#/shared`, { waitUntil: 'domcontentloaded' });
  await ready(a); await a.waitForTimeout(1500);
  if (!ONLY_TRAIN) {
  run.frame.img = await rect(a);
  run.notes.img_head = await a.evaluate(() => document.querySelector('.sd-h')?.innerText.replace(/\s+/g, ' '));
  await shot(a, 'tab-img');
  for (const [k, label] of [['train', '학습 데이터'], ['admin', '행정 자료']]) {
    await a.locator('.sd-tabs button', { hasText: label }).click();
    await ready(a); await a.waitForTimeout(900);
    run.frame[k] = await rect(a);
    run.notes[k + '_rows'] = await a.evaluate(() => [...document.querySelectorAll('.sd-body tbody tr')].map((r) => r.innerText.replace(/\s+/g, ' ').trim()));
    await shot(a, 'tab-' + k);
  }
  /* 행정 자료 다음 쪽 · 다시 영상 탭 — 틀 같은가 */
  const nx = a.locator('.sd-pg button', { hasText: '다음' });
  if (await nx.count()) { await nx.click(); await a.waitForTimeout(400); run.frame.admin_p2 = await rect(a); }
  await a.locator('.sd-tabs button', { hasText: '영상' }).click(); await ready(a); await a.waitForTimeout(500);
  run.frame.img_again = await rect(a);
  const keys = Object.keys(run.frame);
  const same = (k) => JSON.stringify([run.frame[k].card, run.frame[k].head, run.frame[k].tabs, run.frame[k].body, run.frame[k].pager]);
  run.frame_same = keys.every((k) => same(k) === same(keys[0]));
  save();

  /* ── 남원 기관 · 비공개 전 ── */
  o = await (await ctx()).newPage(); watch(o);
  await frontDoor(o, APP, 'lxadmin@lx.or.kr', { tenant: 'namwon' });
  const ORG = new URL(orgLoginUrl(APP, 'namwon')).origin;
  const orgList = async (tag) => {
    await o.goto(`${ORG}/landxi/v3/gov-request/`, { waitUntil: 'domcontentloaded' });
    await o.waitForTimeout(4000);
    const ids = await o.evaluate(async () => { const { api } = await import('/landxi/shared/api-v1.js'); return (await api('/requests/shared-imagery')).items.map((x) => x.id); });
    const lay = await o.evaluate(async () => { const { api } = await import('/landxi/shared/api-v1.js'); try { const j = await api('/catalog/layers'); return (j.items || j.layers || []).map((x) => x.id); } catch { return null; } });
    run.notes['org_' + tag] = { shared: ids.length, has: ids.includes(IMG), layer_has: lay ? lay.includes(IMG) : null };
    const sr = o.locator('.gq-sr').first();
    if (await sr.count()) await sr.scrollIntoViewIfNeeded().catch(() => {});
    run.notes['org_' + tag + '_rows'] = await o.evaluate(() => [...document.querySelectorAll('.gq-sr b')].map((b) => b.textContent));
    await shot(o, 'org-' + tag);
  };
  await orgList('before');
  const tenantShares = async () => a.evaluate(async (id) => { const { api } = await import('/landxi/shared/api-v1.js'); const j = await api('/tenants/namwon/imagery-shares'); return { n: j.items.length, has: j.items.some((x) => x.id === id) }; }, IMG);
  run.notes.admin_tenant_shares_before = await tenantShares();

  /* ── 관리자: 그 영상 비공개 ── */
  const imgName = await a.evaluate(async (id) => { const { api } = await import('/landxi/shared/api-v1.js'); return (await api('/projects/imagery?all=1')).items.find((x) => x.id === id)?.name; }, IMG);
  run.notes.img_name = imgName;
  await a.locator('.sd-q').fill(imgName.split(' · ')[0]);
  await a.waitForTimeout(400);
  const vis = a.locator(`.sd-tbl tr[data-id="${IMG}"] .sd-vis`);
  await vis.click(); await a.waitForTimeout(1200);
  run.notes.vis_after_click = await vis.textContent();
  await shot(a, 'img-private');
  await a.waitForTimeout(10500);                                      // 기관 목록 10초 캐시는 바꾸는 순간 비움 — 그래도 넉넉히
  await orgList('after');
  run.notes.admin_tenant_shares_after = await tenantShares();

  /* ── 되돌리기 ── */
  await vis.click(); await a.waitForTimeout(1200);
  run.notes.vis_restored = await vis.textContent();
  await orgList('restored');
  save();
  }

  /* ── 학습 데이터: 공개 → 직원 학습 화면 '공유 데이터에서 고르기' ── */
  await a.locator('.sd-q').fill('');
  await a.locator('.sd-tabs button', { hasText: '학습 데이터' }).click(); await ready(a); await a.waitForTimeout(500);
  const tb = a.locator(`.sd-tbl tr[data-id="${SMP}"] .sd-vis`);
  run.notes.smp_row = await a.locator(`.sd-tbl tr[data-id="${SMP}"]`).innerText().then((t) => t.replace(/\s+/g, ' '));
  await tb.click();
  await a.waitForFunction((id) => document.querySelector(`.sd-tbl tr[data-id="${id}"] .sd-vis`)?.textContent === '공개', SMP, { timeout: 20000 });
  run.notes.smp_vis = await tb.textContent();
  await shot(a, 'train-shared');

  s = await (await ctx()).newPage(); watch(s);
  await frontDoor(s, APP, 'test@lx.or.kr', 'app');
  await s.waitForURL((u) => !/\/login\/?(\?|$)/.test(u.pathname), { timeout: 30000 });
  const pj = await s.evaluate(async () => { const { api } = await import('/landxi/v3/kit/util.js'); return api('/projects?scope=all'); });
  const pid = (pj.items || []).find((x) => x.name.includes(PRJ))?.id;
  await s.goto(`${APP}/landxi/v3/lx-train/?project=${pid}&stage=train`, { waitUntil: 'domcontentloaded' });
  await s.waitForFunction(() => document.documentElement.dataset.trainBoard === '1', null, { timeout: 40000 });
  await s.waitForTimeout(1200);
  await s.locator('.tb-node[data-kind="data"]').first().click(); await s.waitForTimeout(500);
  run.notes.drawer = await s.evaluate(() => document.querySelector('.tb-side')?.innerText.replace(/\s+/g, ' '));
  await shot(s, 'train-drawer-shared');

  await tb.click();
  await a.waitForFunction((id) => document.querySelector(`.sd-tbl tr[data-id="${id}"] .sd-vis`)?.textContent === '비공개', SMP, { timeout: 20000 });
  run.notes.smp_restored = await tb.textContent();
  await s.reload({ waitUntil: 'domcontentloaded' });
  await s.waitForFunction(() => document.documentElement.dataset.trainBoard === '1', null, { timeout: 40000 });
  await s.locator('.tb-node[data-kind="data"]').first().click(); await s.waitForTimeout(500);
  run.notes.drawer_restored = await s.evaluate(() => document.querySelector('.tb-side')?.innerText.replace(/\s+/g, ' '));
} finally {
  run.finished = new Date().toISOString();
  save();
  await browser.close();
}
