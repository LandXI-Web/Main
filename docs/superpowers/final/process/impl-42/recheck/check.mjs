// 바퀴 16 재검수(impl-41 recheck/check.mjs 그대로) — 기능마다 '됨 / 안 됨 / 이상함' + 걸린 시간 + 그림 · 바깥 주소 로그인 폼(역할마다 한 번 · 세션 주입 없음) · PC 1440
//   node check.mjs [staff,admin,gov,main] [id,id]  →  check.json · shots/check/*.png
//   지난 점검표(impl-34 recheck-staff · recheck-admin-gov)의 기능을 그대로 다시 누른다. XI맵(고치기 칸 · 채팅 창 · 결과 표시 시안 · 융합 대시보드)은 ximap.mjs, 해외는 impl-36/overseas-fix/check.mjs --out.
//   누르지 않는 것: 학습 시작 · 분석 시작 · 배포 신청 보내기 · 용량 신청 보내기 · 요청 보내기 · 문의 보내기 · 개선 후보 승인/거절 · 기관 공유 체크.
//   시험으로 만든 것(메모 · 행정 자료)은 바로 삭제한다.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';

const ROOT = 'E:/Land-XI 플랫폼/01. 디자인';
const HW = 'C:/Users/User/AppData/Local/ms-playwright';
if (fs.existsSync(path.join(HW, 'chromium-1234'))) process.env.PLAYWRIGHT_BROWSERS_PATH = HW;
if (!process.env.DEV_PASSWORD) { const m = fs.readFileSync(path.join(ROOT, 'server/.env'), 'utf8').match(/^DEV_PASSWORD=(.*?)\s*$/m); if (m) process.env.DEV_PASSWORD = m[1]; }
process.env.LX_PW ||= process.env.DEV_PASSWORD;
const { chromium } = createRequire(path.join(ROOT, 'package.json'))('playwright');
const { frontDoor } = await import(pathToFileURL(path.join(ROOT, 'landxi/v3/kit/lint/forbidden.mjs')).href);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = 'https://app.land-xi.dev', GOV = 'https://namwon.land-xi.dev', GJ = 'https://gwangju-jeonnam.land-xi.dev', V = '/landxi/v3/';
const GROUPS = (process.argv[2] || 'staff,admin,gov,gj,main').split(',');
const ONLY = process.argv[3] ? process.argv[3].split(',') : null;
const OUT = path.join(HERE, 'shots', 'check');
fs.mkdirSync(OUT, { recursive: true });
const RF = path.join(HERE, 'check.json');
const R = fs.existsSync(RF) ? JSON.parse(fs.readFileSync(RF, 'utf8')) : {};
const save = () => fs.writeFileSync(RF, JSON.stringify(R, null, 1));
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

const BAD_TEXT = /불러오지 못했습니다|못했습니다|오류가|문제가 생겼|서버 응답이 늦습니다|undefined|NaN|\[object Object\]|지움|광주전남특별시|통합특별시/;
const idle = async (p, ms = 1200) => { await p.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {}); await p.waitForTimeout(ms); };
const noLoader = (p, t = 20000) => p.waitForFunction(() => { const l = document.querySelector('.k-ld'); return !(l && !l.hidden && l.getClientRects().length); }, null, { timeout: t }).catch(() => {});

async function group(name, base, login, cases) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const p = await ctx.newPage();
  const errs = [], apiBad = [];
  p.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));
  p.on('console', (m) => { if (m.type() === 'error') errs.push('console ' + m.text().slice(0, 160)); });
  p.on('response', (r) => { const u = r.url(); if (u.includes('/api/v1/') && r.status() >= 400 && r.status() !== 401) apiBad.push(`${r.status()} ${u.replace(/^.*\/api\/v1/, '').slice(0, 80)}`); });
  if (login) { await frontDoor(p, APP, login); await p.waitForTimeout(2000); }
  for (const [id, label, url, fn] of cases) {
    if (ONLY && !ONLY.includes(id)) continue;
    errs.length = 0; apiBad.length = 0;
    const t0 = Date.now();
    let res = { label, ok: '됨', note: '' };
    try {
      if (url) { await p.goto('about:blank'); await p.goto(base + url, { waitUntil: 'domcontentloaded', timeout: 45000 }); await noLoader(p); await idle(p); }
      const r = fn ? await fn(p) : null;
      if (r) Object.assign(res, r);
      const txt = await p.evaluate(() => [...document.querySelectorAll('main, .k-main, body')].slice(0, 1).map((e) => e.innerText).join(' '));
      const m = txt.match(BAD_TEXT);
      if (m && res.ok === '됨') { res.ok = '이상함'; res.note = (res.note ? res.note + ' · ' : '') + `글 '${m[0]}'`; }
      if (/\/login\/|gov-home/.test(p.url()) && url && !/login|gov-home|main|api-guide|^\/$/.test(url)) { res.ok = '안 됨'; res.note += ' · 로그인으로 튕김'; }
    } catch (e) { res.ok = '안 됨'; res.note = (res.note ? res.note + ' · ' : '') + String(e).slice(0, 200); }
    res.ms = Date.now() - t0;
    if (errs.length) { res.pageErr = [...new Set(errs)]; if (res.ok === '됨') res.ok = '이상함'; }
    if (apiBad.length) { res.apiBad = [...new Set(apiBad)]; if (res.ok === '됨') res.ok = '이상함'; }
    await p.screenshot({ path: path.join(OUT, `${id}.png`) }).catch(() => {});
    res.shot = `shots/check/${id}.png`;
    R[id] = res; save();
    console.log(res.ok.padEnd(4), id, label, res.ms + 'ms', res.note || '', res.apiBad ? 'API ' + res.apiBad.join(' | ') : '', res.pageErr ? 'ERR ' + res.pageErr.join(' | ') : '');
  }
  await ctx.close();
}
const count = (p, sel) => p.locator(sel).count();
const need = async (p, sel, min, what) => { const n = await count(p, sel); return n >= min ? { note: `${what} ${n}` } : { ok: '안 됨', note: `${what} ${n}(최소 ${min})` }; };
const textHas = async (p, re) => re.test(await p.evaluate(() => document.body.innerText));
const waitSel = (p, sel, t = 20000) => p.waitForSelector(sel, { timeout: t }).then(() => true, () => false);

const PID = 'prj_3fdba452d5';
/* ── LX 직원 ── */
if (GROUPS.includes('staff')) await group('staff', APP, 'test@lx.or.kr', [
  ['s01', '대시보드 — 공지 · 메모 적기(Enter) · 고정 · 삭제', V + 'lx-console/', async (p) => {
    await waitSel(p, '.ld-ml-in');
    const n0 = await count(p, '.ld-ml li');
    const t = '재검수 시험 메모 ' + Date.now().toString().slice(-4);
    await p.locator('.ld-ml-in').fill(t); await p.locator('.ld-ml-in').press('Enter');
    const row = p.locator('.ld-ml li', { hasText: t });
    const added = await row.first().waitFor({ timeout: 15000 }).then(() => true, () => false);
    if (!added) return { ok: '안 됨', note: '메모가 목록에 안 보임' };
    await row.first().locator('button', { hasText: /^고정$/ }).click(); await p.waitForTimeout(1500);
    const pinned = await p.locator('.ld-ml li.is-pin', { hasText: t }).count();
    await p.locator('.ld-ml li', { hasText: t }).first().locator('button', { hasText: '삭제' }).click();
    await p.waitForFunction((x) => ![...document.querySelectorAll('.ld-ml li')].some((li) => li.innerText.includes(x)), t, { timeout: 15000 }).catch(() => {});
    const left = await p.locator('.ld-ml li', { hasText: t }).count();
    const ntc = await count(p, '.ld-ntc-b li, .ld-ntc-b a, .ld-ntc-b p');
    return left || !pinned ? { ok: '안 됨', note: `고정 ${pinned} · 삭제 뒤 남음 ${left}` } : { note: `공지 줄 ${ntc} · 메모 ${n0} → 적기 → 고정 → 삭제(정리됨)` }; }],
  ['s02', '대시보드 — 내 정보 창 · 용량(보내지 않음)', V + 'lx-console/', async (p) => {
    const b = p.locator('.ld-store, [class*=store]').first();
    const txt = (await b.innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 80);
    return txt ? { note: `용량 칸 '${txt}'` } : { ok: '안 됨', note: '용량 칸 없음' }; }],
  ['s03', '대시보드 — 단계 숫자 · 최근 프로젝트 카드 열기', V + 'lx-console/', async (p) => {
    const st = await count(p, 'a[href*="lx-project/?stage="], a[href*="stage="]');
    const card = p.locator('.ld-rgrid a, .ld-rgrid article').first();
    if (!(await card.count())) return { ok: '안 됨', note: '최근 프로젝트 카드 없음' };
    await card.click(); await p.waitForTimeout(2500);
    return /lx-project|lx-train|lx-release|lx-ingest|lx-map/.test(p.url()) ? { note: `단계 링크 ${st} · 카드 → ${new URL(p.url()).pathname}` } : { ok: '안 됨', note: '카드 눌러도 안 열림' }; }],
  ['s04', '프로젝트 목록 — 탭 다섯 · 찾기', V + 'lx-project/', async (p) => {
    const tabs = p.getByRole('tab'); const n = await tabs.count();
    const rows = [];
    for (let i = 0; i < n; i++) { await tabs.nth(i).click(); await p.waitForTimeout(700); rows.push(await count(p, 'main article, main table tbody tr')); }
    const q = p.locator('input[placeholder*="프로젝트 이름"]').first();
    if (await q.count()) { await q.fill('비닐'); await p.waitForTimeout(900); rows.push('찾기 비닐 ' + await count(p, 'main article')); await q.fill(''); }
    return n >= 5 ? { note: `탭 ${n} · 줄 ${rows.join('/')}` } : { ok: '안 됨', note: `탭 ${n}` }; }],
  ['s05', '새 프로젝트 한 창 — 공유 데이터에서 고르기 목록(만들지 않음)', V + 'lx-project/?new=1', async (p) => {
    if (!(await waitSel(p, '.lxp-new--one'))) return { ok: '안 됨', note: '창 없음' };
    const box = await p.locator('.lxp-new--one').boundingBox();
    const pick = p.locator('.lxp-new--one button', { hasText: '공유 데이터' }).first();
    let n = 0;
    let tot = '';
    if (await pick.count()) { await pick.click(); await p.waitForTimeout(2500); n = await p.locator('.lxp-new--one img').count(); tot = (await p.locator('.lxp-new--one').innerText()).match(/([\d,]+)장/)?.[1] || ''; }
    return n ? { note: `창 ${Math.round(box?.width || 0)}×${Math.round(box?.height || 0)} · 공유 데이터 ${tot}장 · 첫 쪽 그림 ${n}` } : { ok: '안 됨', note: '공유 데이터 목록이 비어 있음' }; }],
  ['s06', '데이터 올리기 — 지역 카드 · 지도', V + `lx-ingest/?project=${PID}&region=43745`, async (p) => need(p, 'canvas.maplibregl-canvas', 1, '지도')],
  ['s07', '학습데이터 구축 — 라벨 그림 · 더 보기', V + `lx-train/?project=${PID}&stage=label&flow=1`, async (p) => {
    await waitSel(p, '.tf-grid img, .tf-grid canvas, .tf-grid figure', 25000);
    const n0 = await count(p, '.tf-grid > *');
    const more = p.locator('button', { hasText: '더 보기' }).first();
    if (await more.count()) { await more.click(); await p.waitForTimeout(2500); }
    const n1 = await count(p, '.tf-grid > *');
    return n0 ? { note: `그림 ${n0} → 더 보기 ${n1}` } : { ok: '안 됨', note: '라벨 그림 없음' }; }],
  ['s08', '학습 — 흐름 판 · 정확도 그래프 · 학습 이력(시작 안 누름)', V + `lx-train/?project=${PID}&stage=train&flow=1&sample=smp_94f1ab120e&model=trained%2Fjob_01M3RG60R78XYV0STPWC9B69AB`, async (p) => {
    await waitSel(p, '.tb-hist', 25000);
    const hist = await count(p, '.tb-hist tr, .tb-hist li');
    const svg = await count(p, 'main svg, main canvas');
    return hist ? { note: `학습 이력 ${hist}줄 · 그래프 ${svg}` } : { ok: '안 됨', note: '학습 이력 없음' }; }],
  ['s09', '추론 — 모델 · 영상 고르기(시작 안 누름)', V + `lx-release/?project=${PID}&stage=infer`, async (p) => need(p, 'main select, main [role=radio], main input[type=radio], main button', 2, '고르는 칸')],
  ['s10', '결과 확인 — 지도에서 결과 켜기 · 범례', V + `lx-map/?job=job_01M4FJDMZZAFDWB4HJ00E6X7GJ&project=${PID}`, async (p) => need(p, '.lm-sw[aria-checked=true]', 1, '켜진 결과')],
  ['s11', '배포 신청 — 신청서 · 지난 판(보내지 않음)', V + `lx-release/?project=${PID}&stage=publish`, async (p) => need(p, '.rl-dl > div', 3, '신청서 줄')],
  ['s12', "분석하기 — 카드 · 찾기('원주')", V + 'lx-analyze/', async (p) => {
    await waitSel(p, '.la-ac');
    const n0 = await count(p, '.la-ac');
    const inp = p.locator('input[placeholder*="서비스 이름"]').first();
    await inp.fill('원주'); await p.waitForTimeout(1500);
    const hit = await p.locator('.la-ac h3').allInnerTexts();
    await inp.fill('');
    return hit.length ? { note: `카드 ${n0} · '원주' → ${hit.slice(0, 2).join(', ')}` } : { ok: '안 됨', note: `'원주' 찾기 0` }; }],
  ['s13', "분석하기 자세히 — '어디' 원주시 → 영상 · 조건(시작 안 누름)", V + 'lx-analyze/', async (p) => {
    await waitSel(p, '.la-ac');
    const more = p.locator('.la-ac a.k-sc-more').first(); await more.click();
    if (!(await waitSel(p, '.la-dt-body'))) return { ok: '안 됨', note: '자세히 안 열림' };
    const where = p.locator('.la-dt input[type=search], .la-dt input[placeholder*="지역"], .la-dt input[placeholder*="시군구"], .la-dt input').first();
    if (!(await where.count())) return { note: '자세히 열림 · 지역 칸 없음(이 카드)' };
    const t = Date.now();
    await where.fill('강원 원주'); await p.waitForTimeout(1200);
    const opt = p.locator('[role=option], .k-region li, .la-dt li', { hasText: '원주시' }).first();
    if (await opt.count()) await opt.click(); else await where.press('Enter');
    await p.waitForTimeout(500); await noLoader(p); await idle(p, 300);
    return { note: `원주시 고름 → 영상 · 조건 ${Date.now() - t}ms` }; }],
  ['s14', '지도 서비스 — 결과 층 · 바탕 · 결과 목록 · 내려받기 GeoJSON', V + 'lx-map/', async (p) => {
    await waitSel(p, '.lm-groups');
    const sw = await count(p, '.lm-sw');
    const li = p.locator('li:has(.lm-dlb)').first();
    if (!(await li.count())) return { note: `층 ${sw} · 내려받기 단추 없음` };
    await li.hover(); await p.waitForTimeout(300);
    await li.locator('.lm-dlb').click({ force: true }); await p.waitForTimeout(1500);
    const consent = p.locator('button', { hasText: /동의|확인/ }).first(); if (await consent.count() && await consent.isVisible().catch(() => false)) { await consent.click().catch(() => {}); await p.waitForTimeout(600); }
    const g = p.locator('button, a', { hasText: 'GeoJSON' }).first();
    if (!(await g.count())) return { ok: '이상함', note: `층 ${sw} · GeoJSON 단추 없음` };
    const [d] = await Promise.all([p.waitForEvent('download', { timeout: 30000 }), g.click()]);
    const f = path.join(os.tmpdir(), 'recheck14-' + d.suggestedFilename()); await d.saveAs(f);
    return { note: `층 ${sw} · ${d.suggestedFilename()} ${(fs.statSync(f).size / 1024).toFixed(1)}KB` }; }],
  ['s15', '요청함 — 숫자 · 탭', V + 'lx-inbox/', async (p) => {
    const tabs = p.getByRole('tab'); const n = await tabs.count();
    for (let i = 0; i < n; i++) { await tabs.nth(i).click(); await p.waitForTimeout(600); }
    return n >= 2 ? { note: `탭 ${n}` } : { ok: '안 됨', note: `탭 ${n}` }; }],
  ['s16', '지원 — 공지 · 자주 묻는 질문 · 문의', V + 'help-my/', async (p) => {
    const tabs = p.getByRole('tab'); const n = await tabs.count();
    for (let i = 0; i < n; i++) { await tabs.nth(i).click(); await p.waitForTimeout(500); }
    return n >= 2 ? { note: `탭 ${n}` } : { ok: '안 됨', note: `탭 ${n}` }; }],
  ['s17', '서비스 카드 — 목록', V + 'lx-cards/', async (p) => need(p, 'main article, main .k-sc, main a[href*="card"]', 1, '카드')],
]);

/* ── LX 관리자 ── (지난 점검표 a01–a19 그대로 + 공유 데이터 상세 판) */
const OI = V + 'ops-infra/', OC = V + 'ops-core/';
if (GROUPS.includes('admin')) await group('admin', APP, 'lxadmin@lx.or.kr', [
  ['a01', 'LX 관리자 대시보드', OC + '#/', async (p) => need(p, '.k-main .num, .k-main b.num, .k-main [class*=big]', 3, '숫자 칸')],
  ['a02', '요청 관리 — 분석 요청', OC + '#/approvals', async (p) => need(p, '.k-main tr, .k-main li, .k-main article', 2, '줄')],
  ['a03', '요청 관리 — 승인 요청', OC + '#/approvals/approve', async (p) => need(p, '.k-main tr, .k-main li, .k-main article', 1, '줄')],
  ['a04', '요청 관리 — API 키 신청', OC + '#/approvals/apikeys', async (p) => need(p, '.k-main tr, .k-main li, .k-main article, .k-main p', 1, '줄')],
  ['a05', '인프라 — 장비 표', OI + '#/infra', async (p) => {
    const t0 = Date.now(); await p.waitForFunction(() => document.querySelectorAll('.k-main table tbody tr').length > 0, null, { timeout: 20000 }).catch(() => {});
    const r = await need(p, '.k-main table tbody tr', 1, '표 행'); r.note += ` · 행 보임 ${Date.now() - t0}ms(화면 열린 뒤) · 최근 24시간 작업 ${await p.locator('#j24').innerText().catch(() => '?')}`; return r; }],
  ['a06', '기관 목록', OI + '#/tenants', async (p) => need(p, '.k-main tr, .k-main article, .k-main li', 2, '기관')],
  ['a07', '기관 한 곳(남원)', OI + '#/tenants/o/namwon', async (p) => need(p, '.tp-rec li, .tp-cells > *', 2, '칸 · 기록')],
  ['a08', '배포 — 배포 신청(신청서 열기)', OI + '#/deploys', async (p) => {
    const r = await need(p, '.rv-pane[data-tab=req] tr, .rv-pane[data-tab=req] article, .rv-pane[data-tab=req] li', 1, '신청');
    const b = p.locator('.rv-pane[data-tab=req] tbody tr, .rv-pane[data-tab=req] article').first();
    if (await b.count()) { await b.click().catch(() => {}); await p.waitForTimeout(1500); r.note += (await count(p, '.rv-detail, .k-drawer, [role=dialog]')) ? ' · 신청서 열림' : ' · 신청서 창 없음'; await p.keyboard.press('Escape'); }
    return r; }],
  ['a09', '배포 — 기관 공유', OI + '#/deploys/share', async (p) => need(p, '.rv-pane[data-tab=share] input[type=checkbox]', 1, '체크 칸')],
  ['a10', '배포 — 사용 현황', OI + '#/deploys/usage', async (p) => { await waitSel(p, '.rv-pane[data-tab=usage] tbody tr'); return need(p, '.rv-pane[data-tab=usage] tbody tr', 1, '표 행'); }],
  ['a11', '배포 — 분야', OI + '#/deploys/categories', async (p) => need(p, '.rv-pane[data-tab=cat] li, .rv-pane[data-tab=cat] tr', 2, '분야')],
  ['a12', '배포 — 개선 후보', OI + '#/deploys/improve', async (p) => { await waitSel(p, '.im-box tr, .im-box article', 15000); return need(p, '.im-box tbody tr, .im-box article', 1, '후보'); }],
  ['a13', '배포 — API', OI + '#/deploys/api', async (p) => ((await textHas(p, /켜진 키 \d+/)) && (await count(p, 'button:has-text("키 만들기")')) ? { note: '키 수 · 키 만들기 단추' } : { ok: '안 됨', note: 'API 칸 없음' })],
  ['a14', '배포 — XI 재학습', OI + '#/deploys/retrain', async (p) => need(p, '.rv-pane[data-tab=rt] tr, .rv-pane[data-tab=rt] article, .rv-pane[data-tab=rt] li, .rv-pane[data-tab=rt] section', 1, '칸')],
  ['a15', '배포 — 학습 서식', OI + '#/deploys/templates', async (p) => need(p, '.rv-pane[data-tab=tpl] tr, .rv-pane[data-tab=tpl] article, .rv-pane[data-tab=tpl] li, .rv-pane[data-tab=tpl] section', 1, '칸')],
  ['a16', '공유 데이터 — 영상', OI + '#/shared', async (p) => need(p, '.k-main tbody tr', 1, '영상')],
  ['a16b', '공유 데이터 — 영상 상세 판(10-14)', OI + '#/shared', async (p) => {
    await waitSel(p, '.sd-row'); const t = Date.now();
    await p.locator('.sd-row').first().click();
    const ok = await p.waitForFunction(() => { const d = document.querySelector('.sd-detail, .sd-dt, [class*=sd-det]'); return d && d.getClientRects().length && !/불러오는 중/.test(d.innerText); }, null, { timeout: 20000 }).then(() => true, () => false);
    const txt = await p.evaluate(() => (document.querySelector('.sd-detail, .sd-dt, [class*=sd-det]')?.innerText || '').replace(/\s+/g, ' ').slice(0, 90));
    return ok ? { note: `상세 ${Date.now() - t}ms · '${txt}'` } : { ok: '안 됨', note: '상세 판 안 열림' }; }],
  ['a17', '공유 데이터 — 학습 데이터', OI + '#/shared', async (p) => { await p.locator('.sd-tabs [data-tab=train]').click(); await noLoader(p); await idle(p); return need(p, '.k-main tbody tr, .k-main .sd-empty, .k-main p', 1, '줄'); }],
  ['a18', '공유 데이터 — 행정 자료 + 올리기 시험(올리고 삭제)', OI + '#/shared', async (p) => {
    await p.locator('.sd-tabs button:nth-child(3)').click(); await noLoader(p); await idle(p);
    // 지난 번에 남은 시험 자료부터 정리(상세 판 아래 '삭제' — 10-14 상세 판으로 옮김)
    const drop = async () => {
      const row = p.locator('.k-main tbody tr', { hasText: '재검수 시험 자료' }).first();
      await row.click(); await p.waitForTimeout(1500);
      const b = p.locator('.sd-det .sd-d-act button', { hasText: '삭제' }).first();
      const word = (await b.innerText()).trim();
      await b.click(); await p.waitForTimeout(500);
      await p.locator('.sd-form button', { hasText: /^삭제$/ }).first().click();
      await p.waitForTimeout(2500);
      return word;
    };
    let old = 0;
    while (await p.locator('.k-main tbody tr', { hasText: '재검수 시험 자료' }).count() && old < 3) { await drop(); old++; }
    const n0 = await count(p, '.k-main tbody tr');
    const f = path.join(os.tmpdir(), 'recheck-test.geojson');
    fs.writeFileSync(f, JSON.stringify({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { pnu: '5219025021100010000', name: '재검수 시험' }, geometry: { type: 'Polygon', coordinates: [[[127.5, 35.4], [127.501, 35.4], [127.501, 35.401], [127.5, 35.401], [127.5, 35.4]]] } }] }));
    await p.getByRole('button', { name: '행정 자료 올리기' }).click();
    await p.locator('[role=dialog] input[type=file], .sd-form input[type=file]').setInputFiles(f);
    await p.locator('.sd-form input[aria-label=이름]').fill('재검수 시험 자료');
    await p.locator('.sd-form button', { hasText: '올리기' }).click();
    await p.waitForFunction(() => [...document.querySelectorAll('.k-main tbody tr')].some((r) => r.innerText.includes('재검수 시험 자료')), null, { timeout: 30000 }).catch(() => {});
    if (!(await p.locator('.k-main tbody tr', { hasText: '재검수 시험 자료' }).count())) { const err = await p.locator('.sd-err').innerText().catch(() => ''); return { ok: '안 됨', note: `올리기 실패 ${err}` }; }
    await p.screenshot({ path: path.join(OUT, 'a18-uploaded.png') });
    const word = await drop();
    const left = await p.locator('.k-main tbody tr', { hasText: '재검수 시험 자료' }).count();
    return left ? { ok: '안 됨', note: '올림 · 삭제 안 됨' } : { note: `행 ${n0} · 올림 → 보임 → 상세 판 '${word}' → 확인 '삭제'(정리됨${old ? ` · 지난 시험 자료 ${old}건도 삭제` : ''})`, ...(word !== '삭제' ? { ok: '이상함' } : {}) }; }],
  ['a19', '계정', V + 'ops-accounts/', async (p) => { await p.getByRole('tab', { name: '계정', exact: true }).click(); await noLoader(p); await idle(p); return need(p, 'main tbody tr, main li, main article', 2, '계정'); }],
]);

/* ── 기관(남원) ── (지난 점검표 g01–g14 그대로) */
if (GROUPS.includes('gov')) await group('gov', GOV, 'lxadmin@lx.or.kr#namwon', [
  ['g01', '내 서비스', V + 'gov-select/?list=1', async (p) => need(p, '.k-main article, .k-main [class*=card]', 1, '서비스 카드')],
  ['g02', '서비스 대시보드', V + 'gov-select/?service=card-farm', async (p) => ((await textHas(p, /AI 분석 결과[\s\S]{0,40}[\d,]+\s*필지/)) ? { note: '큰 숫자(필지) 보임' } : { ok: '안 됨', note: '큰 숫자 없음' })],
  ['g03', '이력', V + 'gov-select/?service=card-farm&tab=history', async (p) => { const m = (await p.evaluate(() => document.body.innerText)).match(/전체\s*(\d+)/); return m && +m[1] > 0 ? { note: `이력 ${m[1]}건` } : { ok: '안 됨', note: '이력 없음' }; }],
  ['g04', '통계·보고서', V + 'gov-select/?service=card-farm&tab=stats', async (p) => need(p, '.k-main .num, .k-main svg, .k-main canvas', 1, '숫자 · 그림')],
  ['g05', '요청하기 — 분석 요청', V + 'gov-request/', async (p) => need(p, '.k-main form, .k-main select, .k-main input, .k-main button', 2, '입력 칸')],
  ['g06', '요청하기 — 촬영 요청', V + 'gov-request/?tab=shoot', async (p) => need(p, '.k-main select, .k-main input, .k-main button', 2, '입력 칸')],
  ['g07', '요청하기 — 보낸 요청', V + 'gov-request/?tab=sent', async (p) => need(p, '.k-main tr, .k-main li, .k-main article, .k-main p', 1, '줄')],
  ['g08', '보고서 + 한글 문서 받기', V + 'gov-report/?service=card-farm&tab=report', async (p) => {
    await p.waitForSelector('button:has-text("한글 문서 내려받기")', { timeout: 20000 });
    const t = Date.now();
    const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 60000 }), p.locator('button', { hasText: '한글 문서 내려받기' }).first().click()]);
    const f = path.join(os.tmpdir(), 'recheck-' + dl.suggestedFilename()); await dl.saveAs(f);
    const b = fs.readFileSync(f);
    return b[0] === 0x50 && b[1] === 0x4b && /\.hwpx$/.test(dl.suggestedFilename()) ? { note: `${dl.suggestedFilename()} ${Math.round(b.length / 1024)}KB · ${Date.now() - t}ms` } : { ok: '안 됨', note: `받은 파일 ${dl.suggestedFilename()} ${b.length}B` }; }],
  ['g09', '필지 목록', V + 'gov-report/?service=card-farm', async (p) => need(p, '.k-main tbody tr, .k-main li', 3, '필지')],
  ['g10', '행정정보와 비교', V + 'gov-fusion/?service=card-farm', async (p) => need(p, '.k-main tbody tr, .k-main li, .k-main .num', 2, '줄 · 숫자')],
  ['g11', '필지 카드', V + 'gov-fusion/?service=card-farm', async (p) => {
    await p.waitForTimeout(2500);
    const row = p.locator('.k-main table tbody tr').first();
    if (!(await row.count())) return { ok: '안 됨', note: '표 행 없음' };
    await row.click(); await p.waitForTimeout(2500);
    return (await count(p, '[role=dialog], .k-drawer, .t-drawer, [class*=parcel], [class*=pcard]')) ? { note: '행 누름 → 필지 카드 열림' } : { ok: '이상함', note: '행 눌러도 카드 안 보임' }; }],
  ['g12', '지도', V + 'xi-clean/?service=card-farm', async (p) => { await p.waitForTimeout(3000); return need(p, 'canvas.maplibregl-canvas', 1, '지도 캔버스'); }],
  ['g13', '기관 정보', V + 'gov-select/?view=org', async (p) => need(p, '.k-main section, .k-main dl, .k-main li', 1, '칸')],
  ['g14', '계정', V + 'gov-accounts/', async (p) => { await p.getByRole('tab', { name: '계정', exact: true }).click(); await noLoader(p); await idle(p); return need(p, 'main tbody tr, main li, main article', 1, '계정'); }],
]);

/* ── 기관(전남광주) ── 이름(원칙 268) · 서비스(해양쓰레기) · 지도 */
if (GROUPS.includes('gj')) await group('gj', GJ, 'lxadmin@lx.or.kr#gwangju-jeonnam', [
  ['j01', '내 서비스 · 이름 전남광주특별시', V + 'gov-select/?list=1', async (p) => { const r = await need(p, '.k-main article, .k-main [class*=card]', 1, '서비스 카드'); if (!(await textHas(p, /전남광주특별시/))) { r.ok = '안 됨'; r.note += ' · 기관 이름 없음'; } return r; }],
  ['j02', '서비스 대시보드(해양쓰레기)', V + 'gov-select/?service=card-marine', async (p) => need(p, '.k-main .num, .k-main svg, .k-main canvas, .k-main b', 1, '숫자 · 그림')],
  ['j03', '이력', V + 'gov-select/?service=card-marine&tab=history', async (p) => need(p, '.k-main tr, .k-main li, .k-main article, .k-main p', 1, '줄')],
  ['j04', '지도(XI맵)', V + 'xi-clean/?service=card-marine', async (p) => { await p.waitForTimeout(3000); return need(p, 'canvas.maplibregl-canvas', 1, '지도 캔버스'); }],
  ['j05', '기관 정보', V + 'gov-select/?view=org', async (p) => { const r = await need(p, '.k-main section, .k-main dl, .k-main li', 1, '칸'); if (!(await textHas(p, /전남광주특별시/))) { r.ok = '안 됨'; r.note += ' · 기관 이름 없음'; } return r; }],
  ['j06', '요청하기', V + 'gov-request/', async (p) => need(p, '.k-main form, .k-main select, .k-main input, .k-main button', 2, '입력 칸')],
]);
if (GROUPS.includes('main')) {
  await group('main', APP, null, [
    ['m01', '메인 — 장면 · 큰 숫자', V + 'main/', async (p) => {
      const n = await count(p, '.m-ch'); await p.mouse.wheel(0, 2400); await p.waitForTimeout(1800); await p.mouse.wheel(0, 2400); await p.waitForTimeout(1800);
      const big = await p.evaluate(() => document.querySelector('#ch1-big')?.innerText || '');
      return n >= 6 ? { note: `장면 ${n} · 큰 숫자 '${big.replace(/\s+/g, ' ').slice(0, 30)}'` } : { ok: '안 됨', note: `장면 ${n}` }; }],
    ['m02', '메인 — 문의 창(보내지 않음)', V + 'main/', async (p) => {
      await p.evaluate(() => document.querySelector('#fin')?.scrollIntoView()); await p.waitForTimeout(1500);
      await p.locator('[data-inquiry]').first().click({ force: true }); await p.waitForTimeout(1200);
      const n = await count(p, '[role=dialog] input, [role=dialog] textarea, dialog input, dialog textarea');
      return n ? { note: `문의 창 열림 · 입력 칸 ${n}` } : { ok: '안 됨', note: '문의 창 없음' }; }],
    ['m03', 'API 안내', V + 'api-guide/', async (p) => need(p, 'main h2, main h3, main section, main pre, main code', 2, '칸')],
    ['m04', '로그인', V + 'login/', async (p) => need(p, 'input[type=password]', 1, '비밀번호 칸')],
  ]);
  await group('main', GOV, null, [['m05', '기관 메인(남원)', '/', async (p) => need(p, '.gh-login input', 2, '로그인 칸')]]);
  await group('main', GJ, null, [['m06', '기관 메인(전남광주) · 이름', '/', async (p) => { const r = await need(p, '.gh-login input', 2, '로그인 칸'); if (!(await textHas(p, /전남광주/))) { r.ok = '안 됨'; r.note += ' · 이름 없음'; } return r; }]]);
}
save();
await browser.close();
