// 국토 변화 = 분석 서비스 카드 안에서(10-23 원칙 329) — 바깥 주소 · 로그인 폼 · LX 직원(test@lx.or.kr) · 새 범위(미리 계산 없음)
// 분석 서비스 → 국토 변화 카드 → 대상지 올리기(구역선 + 버퍼) → 앞 시점(국토지리정보원 해) · 뒤 시점(내 영상 올리기) → 분석 →
// 지도 서비스 결과 → 판정 → 보고서(미리보기 · PDF) → XI ChatGEO 같은 길(같은 작업 장부)
// node docs/superpowers/final/process/impl-46/change-svc/e2e.mjs <base> <구역선.geojson> <내영상.tif>
// 비밀번호는 server/.env(DEV_PASSWORD)에서 읽는다(코드 · 기록에 적지 않음).
import { chromium } from 'playwright';
import { frontDoor, scan, RULES } from '../../../../../../landxi/v3/kit/lint/forbidden.mjs';
import { MEASURE } from '../../../../../../landxi/v3/kit/lint/overlap.mjs';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../../../..');
const [BASE = 'https://app.land-xi.dev', LINE, TIF] = process.argv.slice(2);
const PW = process.env.LX_PW || (fs.readFileSync(path.join(ROOT, 'server/.env'), 'utf8').match(/^DEV_PASSWORD=(.*?)\s*$/m) || [])[1];
const OUT = process.env.OUT || 'e2e.json';
fs.mkdirSync(path.join(HERE, 'shots'), { recursive: true });
const out = { at: new Date().toISOString(), base: BASE, login: 'test@lx.or.kr', steps: [], ov: {}, words: {}, errs: [] };
const T0 = Date.now();
const save = () => fs.writeFileSync(path.join(HERE, OUT), JSON.stringify(out, null, 1));
const step = (k, extra = {}) => { out.steps.push({ k, t: Math.round((Date.now() - T0) / 100) / 10, ...extra }); console.log(k, JSON.stringify(extra).slice(0, 300)); save(); };
async function shot(page, n) {
  await page.screenshot({ path: path.join(HERE, 'shots', n) });
  try { const m = await page.evaluate(MEASURE); out.ov[n] = (m.overlaps || []).map((o) => `${o.a} × ${o.b} (${o.kind} ${o.w}x${o.h})`); } catch (e) { out.ov[n] = ['measure ' + e.message]; }
  try {
    out.words[n] = (await page.evaluate(([rules, src]) => {
      const R = rules.map(([k, so, f]) => [k, new RegExp(so, f)]);
      const check = (t) => R.filter(([, re]) => re.test(t)).map(([k]) => k);   // eslint-disable-line no-unused-vars
      return eval('(' + src + ')')(document);                                   // eslint-disable-line no-eval
    }, [RULES.map(([k, re]) => [k, re.source, re.flags]), scan.toString()])).hits.map((x) => `${x.rule}: ${x.text}`);
  } catch (e) { out.words[n] = ['scan ' + e.message]; }
}
const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => out.errs.push(String(e)));
await frontDoor(page, BASE, 'test@lx.or.kr', 'app', { password: PW });
step('0 로그인', { url: page.url().replace(BASE, '') });
const api = (p, o = {}) => page.evaluate(async ([p, o]) => {
  const s = JSON.parse(localStorage.getItem('lx_api_session') || 'null');
  const r = await fetch('/api/v1' + p, { method: o.method || 'GET', headers: { 'content-type': 'application/json', ...(s?.token ? { authorization: 'Bearer ' + s.token } : {}) }, body: o.body ? JSON.stringify(o.body) : undefined });
  const t = await r.text(); try { return { status: r.status, ...JSON.parse(t) }; } catch { return { status: r.status, text: t.slice(0, 200) }; }
}, [p, o]);

// 1 · 분석 서비스 → 국토 변화 카드
await page.goto(BASE + '/landxi/v3/lx-analyze/', { waitUntil: 'domcontentloaded' });
await page.locator('.la-ac[data-card="card-change"]').waitFor({ timeout: 30000 });
await page.locator('.la-ac[data-card="card-change"] .k-sc-go').click();
await page.locator('.la-chg .la-side-h').waitFor({ timeout: 30000 });
await page.waitForTimeout(1500);
await shot(page, '01-card.png');
step('1 분석 서비스 › 국토 변화 카드', { url: page.url().replace(BASE, '') });

// 2 · 대상지 올리기(구역선 파일 + 버퍼 30m)
const NAME = `안성 시험 구간 ${new Date().toTimeString().slice(0, 5)}`;
if (await page.locator('.la-chg-form').isHidden()) await page.locator('.la-chg-new').click();
await page.locator('.la-chg-form input[type=text]').fill(NAME);
await page.locator('.la-chg-form .la-chg-fl input[type=file]').first().setInputFiles(LINE);
await page.locator('.la-chg-buf').fill('30');
await shot(page, '02-range-form.png');
const t2 = Date.now();
await page.locator('.la-chg-form .t-btn--2').click();
await page.waitForFunction((n) => [...document.querySelectorAll('.la-chg select[aria-label="대상지"] option')].some((o) => o.selected && o.textContent.startsWith(n)), NAME, { timeout: 180000 });
await page.waitForFunction(() => /㎢/.test(document.querySelector('.la-chg .la-chg-s')?.textContent || ''), null, { timeout: 120000 });
const rid = await page.locator('.la-chg select[aria-label="대상지"]').inputValue();
step('2 대상지 만들기', { ms: Date.now() - t2, range: await page.locator('.la-chg .la-chg-s').first().innerText() });

// 3 · 앞 시점 = 국토지리정보원 2020 · 뒤 시점 = 내 영상 올리기
const slotA = page.locator('.la-chg-slot').nth(0), slotB = page.locator('.la-chg-slot').nth(1);
await slotA.locator('select').first().selectOption('2020');
await slotB.locator('.la-chip[data-k="own"]').click();
await slotB.locator('.t-btn--text').click();
await page.locator('.k-upp input[type=file]').waitFor({ state: 'attached', timeout: 20000 });
await shot(page, '03-own-upload.png');
const t3 = Date.now();
await page.evaluate(() => { window.__upDone = null; addEventListener('lx:upload-done', (e) => { window.__upDone = e.detail?.result?.id || 'x'; }); });
await page.locator('.k-upp input[type=file]').setInputFiles(TIF);
await page.locator('.k-md-bg.is-open').waitFor({ state: 'detached', timeout: 30000 }).catch(() => null);
await page.waitForFunction(() => window.__upDone, null, { timeout: 600000 });
await page.waitForFunction(() => { const s = document.querySelectorAll('.la-chg-slot')[1]?.querySelector('select'); return s && !s.disabled && s.value === window.__upDone; }, null, { timeout: 60000 });
step('3 내 영상 올림 · 뒤 시점에 고른 채로', { ms: Date.now() - t3, b: await slotB.locator('select').first().locator('option:checked').innerText() });
await page.waitForTimeout(1200);
await shot(page, '04-two-times.png');

// 4 · 분석 시작 → 지도 서비스
const t4 = Date.now();
await page.locator('.la-chg .la-go').click();
await page.waitForURL(/lx-map\/\?change=/, { timeout: 60000 });
const job = new URL(page.url()).searchParams.get('change');
step('4 분석 시작 → 지도 서비스', { ms: Date.now() - t4, job_tail: job.slice(-6) });
await page.locator('.chg-card').waitFor({ timeout: 60000 });
await page.waitForTimeout(2500);
await shot(page, '05-map-running.png');
let st = null;
for (let i = 0; i < 240; i++) { st = await api(`/change/runs/${job}/status`); if (['done', 'failed', 'timeout', 'cancelled'].includes(st.state)) break; if (i % 6 === 0) console.log('…', st.state, st.stage, st.progress?.value); await page.waitForTimeout(5000); }
const ledger = await api('/me/analyses');
step('5 분석 끝', { state: st.state, reason: st.reason, ms: Date.now() - t4,
  ledger: (ledger.groups || []).filter((g) => (g.items || []).some((x) => x.job === job)).map((g) => `${g.kind}:${g.name}`) });
if (st.state !== 'done') { save(); await browser.close(); process.exit(1); }
await page.goto(`${BASE}/landxi/v3/lx-map/?change=${job}`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => (window.__lxChange?.fc?.features || []).length > 0, null, { timeout: 90000 }).catch(() => null);
await page.waitForTimeout(3000);
const run = await api(`/change/runs/${job}`);
step('6 지도 서비스 결과', { n: run.stats?.n?.value, n_in: run.stats?.n_in?.value, a: run.period?.a?.word, b: run.period?.b?.word, card: await page.locator('.chg-card').innerText().catch(() => '') });
await shot(page, '06-map-result.png');

// 7 · 판정(현장확인) — 폴리곤 칸에서
const fid = await page.evaluate(() => { const f = (window.__lxChange?.fc?.features || []).find((x) => x.properties.inside_row === '내') || window.__lxChange?.fc?.features?.[0]; return f?.id || null; });
if (fid) {
  await page.evaluate((i) => document.dispatchEvent(new CustomEvent('kit:change-pick', { detail: { id: i } })), fid);
  await page.locator('.chg-panel .chg-stb[data-st="현장확인"]').waitFor({ timeout: 20000 });
  await page.waitForTimeout(1500);
  await page.locator('.chg-panel .chg-stb[data-st="현장확인"]').click();
  await page.locator('.chg-panel .chg-save').click();
  await page.waitForTimeout(2000);
  await shot(page, '07-judgment.png');
  const m = await api(`/change/runs/${job}/marks/${fid}`);
  step('7 판정 저장', { status: m.status, history: (m.history || []).length });
}

// 8 · 보고서(미리보기 · PDF)
await page.goto(`${BASE}/landxi/v3/change-report/?job=${job}`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(5000);
await shot(page, '08-report.png');
const pdf = await page.evaluate(async (j) => { const s = JSON.parse(localStorage.getItem('lx_api_session') || 'null'); const r = await fetch(`/api/v1/change/runs/${j}/report.pdf`, { headers: { authorization: 'Bearer ' + s.token } }); const b = await r.arrayBuffer(); return { status: r.status, size: b.byteLength, head: String.fromCharCode(...new Uint8Array(b.slice(0, 4))) }; }, job);
const rj = await api(`/change/runs/${job}/report.json`);
step('8 보고서', { pdf, overview: (rj.overview || []).slice(0, 2) });

// 9 · XI ChatGEO — 같은 대상지 · 같은 길(분석 서비스 작업)
await page.goto(`${BASE}/landxi/v3/lx-map/?change=${job}`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => (window.__lxChange?.fc?.features || []).length > 0, null, { timeout: 90000 }).catch(() => null);
await page.waitForTimeout(2000);
if (await page.locator('#k-chat').isHidden()) { await page.locator('.k-chat-fab').click(); await page.waitForTimeout(400); }
await page.locator('.k-ck-i').fill('2021년과 2024년 항공영상 비교해서 구역선 안에 새로 생긴 것 찾아줘');
const t9 = Date.now();
await page.locator('.k-ck-i').press('Enter');
await page.waitForFunction(() => document.querySelector('#k-chat')?.dataset.state === 'busy', null, { timeout: 10000 }).catch(() => null);
await page.waitForFunction(() => document.querySelector('#k-chat')?.dataset.state !== 'busy', null, { timeout: 120000 });
const ms9 = Date.now() - t9;
await page.waitForTimeout(1500);
const ans = await page.evaluate(() => [...document.querySelectorAll('#k-chat .k-ck-a, #k-chat .k-chat-a')].map((x) => x.innerText).filter(Boolean).pop() || '');
const cj = await page.evaluate(() => [...document.querySelectorAll('#k-chat .k-ck-blk--job')].map((x) => x.dataset.job).pop() || null);
await shot(page, '09-chatgeo.png');
let jrow = null;
if (cj) {
  const me = await api('/me/analyses');
  jrow = (me.running || []).find((x) => x.job === cj) || null;
  for (let i = 0; i < 120; i++) { const s = await api(`/change/runs/${cj}/status`); if (['done', 'failed', 'timeout', 'cancelled'].includes(s.state)) { jrow = { ...(jrow || {}), end: s.state }; break; } await page.waitForTimeout(5000); }
  const me2 = await api('/me/analyses');
  jrow.group = (me2.groups || []).filter((g) => (g.items || []).some((x) => x.job === cj)).map((g) => `${g.kind}:${g.name}`);
}
step('9 XI ChatGEO 변화 탐지', { ms: ms9, ans: ans.slice(0, 220), job_tail: cj?.slice(-6), ledger: jrow });
// 10 · 지도 서비스 '내 분석' 목록 — 국토 변화 묶음 · 이 결과 줄 · 끄고 켜기(변화 층)
await page.goto(`${BASE}/landxi/v3/lx-map/`, { waitUntil: 'domcontentloaded' });
await page.locator('.lm-grp[data-g="card:card-change"]').waitFor({ timeout: 60000 });
const grp = page.locator('.lm-grp[data-g="card:card-change"]');
if ((await grp.locator('.lm-gt').getAttribute('aria-expanded')) !== 'true') await grp.locator('.lm-gt').click();
const rows = await grp.locator('li .lm-li b').allInnerTexts();
const row = grp.locator('li').filter({ hasText: NAME }).first();
await row.locator('.lm-sw').click();
await page.locator('.chg-card:not([hidden])').waitFor({ timeout: 60000 });
await page.waitForTimeout(2500);
const cardTxt = await page.locator('.chg-card').innerText();
await shot(page, '10-list-change.png');
await row.locator('.lm-sw').click();
await page.waitForTimeout(1200);
const hidden = await page.locator('.chg-card').isHidden();
step('10 지도 서비스 목록 · 국토 변화', { group: await grp.locator('.lm-gn').innerText(), n: rows.length, row: await row.innerText(), card: cardTxt.split(/\n/).slice(0, 3).join(' / '), off_hides: hidden });
out.range_id_tail = rid.slice(-6);
save();
await browser.close();
