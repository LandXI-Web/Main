/* impl-16 외부 연동 API 3차(바퀴 4) 증거 — 바깥 주소에서 지금 새로 찍는다(원칙 162). 로그인은 로그인 폼으로만(세션 주입 0 · 한 번).
   node docs/superpowers/final/process/impl-16/api/shoot.mjs   (01. 디자인 에서) — 결과 shots/*.png + run.json(시각 · 측정 · 콘솔 오류 · 이 PC 주소 호출)
   흐름: API 안내(로그인 없이) → 키 신청 두 건(LX 내부 · 외부 기관) → LX 관리자 요청 관리 'API 키 신청'(둘 다 시험 표시) → 외부 기관 승인 막힘 →
   LX 내부 승인(범위 남원시 · LX 보유 영상) → 키 한 번 보임(값은 가린 뒤 찍음 · 어디에도 적지 않음) → api.land-xi.dev/v1 로 결과 조회 → 배포 → API 탭 → 키 폐기. */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { frontDoor } from '../../../../../../landxi/v3/kit/lint/forbidden.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(DIR, 'shots');
const APP = 'https://app.land-xi.dev', ADMIN = 'https://admin.land-xi.dev', APIH = 'https://api.land-xi.dev';
const run = { at: new Date().toISOString(), shots: {}, measure: {}, api: {}, errors: [], local: [] };
const stamp = () => new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }).slice(0, 16);
const browser = await chromium.launch({ channel: 'chrome' });
const watch = (page, tag) => {
  page.on('console', (m) => { if (m.type() === 'error') run.errors.push(`${tag}: ${m.text()}`); });
  page.on('pageerror', (e) => run.errors.push(`${tag}: ${e}`));
  page.on('request', (r) => { if (/\/\/(127\.0\.0\.1|localhost|\[::1\])|:8700|:4173/.test(r.url())) run.local.push(r.url()); });
};
const shot = async (page, name, opts = {}) => { await page.screenshot({ path: path.join(OUT, name), ...opts }); run.shots[name] = stamp(); };
const V = { width: 1440, height: 900 };
const TAG = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }).slice(5, 16).replace(' ', ' ');

/* 1) API 안내 — 로그인 없이 · PC 1440 · 휴대폰 390 가로 넘침 측정 */
const g = await browser.newPage({ viewport: V }); watch(g, 'guide');
await g.goto(APP + '/landxi/v3/api-guide/', { waitUntil: 'networkidle' });
await g.locator('#svc .ag-card').first().waitFor({ timeout: 20000 });
await g.waitForTimeout(600);
await shot(g, 'API3-guide-1440.png');
await shot(g, 'API3-guide-full-1440.png', { fullPage: true });
run.measure.guide = await g.evaluate(() => ({ services: [...document.querySelectorAll('#svc b')].map((b) => b.textContent), over: document.documentElement.scrollWidth - innerWidth,
  notOpen: [...document.querySelectorAll('.ag-tag')].map((x) => x.closest('h3,tr')?.textContent.trim().slice(0, 40)) }));
const m = await browser.newPage({ viewport: { width: 390, height: 844 } }); watch(m, 'guide390');
await m.goto(APP + '/landxi/v3/api-guide/', { waitUntil: 'networkidle' });
await m.locator('#svc .ag-card').first().waitFor({ timeout: 20000 });
run.measure.guide390_over = await m.evaluate(() => document.documentElement.scrollWidth - innerWidth);
await m.close();
/* 메인 · 로그인 바닥 'API 안내' 링크 */
const lk = await browser.newPage({ viewport: V }); watch(lk, 'links');
await lk.goto(APP + '/landxi/v3/login/', { waitUntil: 'domcontentloaded' });
run.measure.login_link = await lk.locator('.door__api').getAttribute('href');
await lk.goto(APP + '/landxi/v3/main/', { waitUntil: 'domcontentloaded' });
run.measure.main_link = await lk.locator('.m-api').getAttribute('href');
await lk.close();

/* 2) 키 신청 두 건 — 창으로 */
async function apply(kind, system, shotName) {
  await g.locator('[data-apply]').first().click();
  const md = g.locator('.k-md');
  await md.locator('.ag-form').waitFor();
  await md.locator('.ag-opt', { hasText: kind }).click();
  await md.locator('.ag-f[data-f=org] input').fill('LX 시험(바퀴 4 확인)');
  await md.locator('.ag-f[data-f=system] input').fill(system);
  await md.locator('.ag-f[data-f=person] input').fill('시험 담당');
  await md.locator('.ag-f[data-f=email] input').fill('test@lx.or.kr');
  await md.locator('.ag-opt', { hasText: '경작' }).click();
  await md.locator('.ag-f[data-f=area] input').fill('전북특별자치도 남원시');
  await md.locator('.ag-f[data-f=purpose] textarea').fill('API 안내 페이지 신청 시험입니다. 승인 뒤 결과를 한 번 조회하고 키를 폐기합니다.');
  await md.locator('.ag-agree input').check();
  await g.waitForTimeout(400);
  if (shotName) await shot(g, shotName);
  await md.locator('.ag-go').click();
  await md.locator('.ag-done').waitFor({ timeout: 15000 });
  const t = await md.locator('.ag-done').innerText();
  await g.keyboard.press('Escape');
  await g.waitForTimeout(400);
  return t;
}
const SYS_IN = `시험 연동 ${TAG}`, SYS_EX = `시험 외부 기관 ${TAG}`;
run.measure.apply_in = await apply('LX 내부 시스템', SYS_IN, 'API3-apply-form-1440.png');
run.measure.apply_ex = await apply('외부 기관 시스템', SYS_EX, null);
await g.close();

/* 3) LX 관리자 — 로그인 폼 · 요청 관리 → API 키 신청 */
const ctx = await browser.newContext({ viewport: V });
const a = await ctx.newPage(); watch(a, 'admin');
await frontDoor(a, ADMIN, 'lxadmin@lx.or.kr', 'admin');
await a.waitForURL((u) => !/\/login\/?$/.test(u.pathname), { timeout: 20000 });
await a.goto(ADMIN + '/landxi/v3/ops-core/#/approvals/apikeys', { waitUntil: 'domcontentloaded' });
await a.locator('.aa-row', { hasText: SYS_IN }).waitFor({ timeout: 30000 });
const markTest = async () => { const c = a.locator('.k-drawer .aa-old input'); if (!(await c.isChecked())) { await c.check(); await a.waitForTimeout(800); } };
/* 외부 기관 — 승인 막힘 */
await a.locator('.aa-row', { hasText: SYS_EX }).click();
await a.locator('.k-drawer .aa-hold').waitFor();
await markTest();
await a.waitForTimeout(500);
await shot(a, 'API3-external-blocked-1440.png');
run.measure.external = await a.evaluate(() => ({ hold: document.querySelector('.k-drawer .aa-hold')?.textContent, approveDisabled: [...document.querySelectorAll('.k-drawer .oc-acts button')].map((b) => [b.textContent, b.disabled]) }));
await a.locator('.k-drawer .oc-reason').fill('시험 끝 — 외부 기관은 보안성 검토 뒤 승인');
await a.locator('.k-drawer .oc-acts button', { hasText: '거절' }).click();
await a.waitForTimeout(1500);
await shot(a, 'API3-apply-list-1440.png');
/* LX 내부 — 범위 남원시 · 승인 */
await a.locator('.aa-row', { hasText: SYS_IN }).click();
await a.locator('.k-drawer .ak-kf').waitFor();
await markTest();
const dr = a.locator('.k-drawer');
await dr.locator('select[aria-label=시도]').selectOption('52');
await dr.locator('select[aria-label=시군구]').selectOption('52190');
await dr.locator('.ak-reg button', { hasText: '더하기' }).click();
await a.waitForTimeout(400);
await shot(a, 'API3-approve-form-1440.png');
await dr.locator('.oc-acts button', { hasText: '승인' }).click();
await a.locator('.k-drawer .ak-val').waitFor({ timeout: 20000 });
const KEY = await a.locator('.k-drawer .ak-val').first().innerText();      // 값은 변수에만 — 출력 · 기록 0
await a.evaluate(() => document.querySelectorAll('.ak-val').forEach((x) => { x.textContent = 'lxk_' + '•'.repeat(28) + ' (찍기 전에 가림)'; }));
await shot(a, 'API3-key-once-1440.png');

/* 4) 바깥 API 주소로 결과 조회 한 번 */
const call = async (p) => { const r = await fetch(APIH + p, { headers: { authorization: 'Bearer ' + KEY } }); let j = null; try { j = await r.json(); } catch { /* 파일 */ } return { status: r.status, j }; };
const me = await call('/v1/me');
run.api.me = { status: me.status, system: me.j?.system, service: me.j?.service, scope: me.j?.scope?.words, sources: me.j?.sources, rights: me.j?.rights_label, analyses: me.j?.analyses };
const rs = await call('/v1/services/farm/results?region=52190&limit=5');
run.api.results = { status: rs.status, total: rs.j?.lx?.total, count: rs.j?.lx?.count, imagery: rs.j?.lx?.imagery, first: rs.j?.features?.[0]?.properties };
const cv = await call('/v1/services/farm/coverage');
run.api.coverage = { status: cv.status, items: cv.j?.items };
run.api.out_of_scope = (await call('/v1/services/farm/results?region=12110')).status;
run.api.analyses = (await fetch(APIH + '/v1/services/farm/analyses', { method: 'POST', headers: { authorization: 'Bearer ' + KEY, 'content-type': 'application/json' }, body: '{}' })).status;
run.api.old_path = (await call('/v1/results')).status;
await a.keyboard.press('Escape');

/* 5) 배포 → API 탭(신청 시스템 × 서비스) → 시험 키 폐기 */
await a.goto(ADMIN + '/landxi/v3/ops-infra/?view=deploys#/deploys/api', { waitUntil: 'domcontentloaded' });
await a.locator('.ak-tbl tr.ak-pair', { hasText: SYS_IN }).waitFor({ timeout: 30000 });
await a.waitForTimeout(800);
await shot(a, 'API3-keys-tab-1440.png');
const row = a.locator('.ak-tbl tr.ak-pair', { hasText: SYS_IN }).locator('xpath=following-sibling::tr[contains(@class,"ak-row")][1]');
await row.click();
await a.locator('.k-drawer .ak-rv').waitFor();
await a.locator('.k-drawer input[aria-label="폐기 사유"]').fill('시험 끝');
await a.locator('.k-drawer .ak-rv').click();
await a.locator('.k-drawer .ak-rv').click();
await a.waitForTimeout(2000);
await shot(a, 'API3-key-revoked-1440.png');
run.api.after_revoke = (await call('/v1/me')).status;
run.measure.revoked = await a.evaluate(() => document.querySelector('.k-drawer .ak-st')?.textContent);
await ctx.close();
await browser.close();
fs.writeFileSync(path.join(DIR, 'run.json'), JSON.stringify(run, null, 1));
console.log(JSON.stringify({ shots: Object.keys(run.shots), errors: run.errors.length, local: run.local.length, api: { me: run.api.me.status, results: run.api.results.status, total: run.api.results.total, oos: run.api.out_of_scope, analyses: run.api.analyses, old: run.api.old_path, after: run.api.after_revoke } }));
