// 재검수 — 기능마다 '됨 / 안 됨 / 이상함' + 증거(캡처) · 바깥 주소 로그인 폼(LX 관리자 · 남원 기관 각 한 번) · PC 1440
//   node check.mjs [admin,gov,main]  →  check.json · shots/check/*.png
//   누르지 않는 것: 개선 후보 '새 판 2' 승인 · 거절 · 문의 보내기 · 요청 보내기 · 기관 공유 체크. 공유 데이터 올리기는 시험 파일 하나를 올렸다가 바로 지운다.
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
const APP = 'https://app.land-xi.dev', GOV = 'https://namwon.land-xi.dev', V = '/landxi/v3/';
const GROUPS = (process.argv[2] || 'admin,gov,main').split(',');
const ONLY = process.argv[3] ? process.argv[3].split(',') : null;
const OUT = path.join(HERE, 'shots', 'check');
fs.mkdirSync(OUT, { recursive: true });
const RF = path.join(HERE, 'check.json');
const R = fs.existsSync(RF) ? JSON.parse(fs.readFileSync(RF, 'utf8')) : {};
const save = () => fs.writeFileSync(RF, JSON.stringify(R, null, 1));
const browser = await chromium.launch({ channel: 'chrome', headless: true });

const BAD_TEXT = /불러오지 못했습니다|못했습니다|오류가|문제가 생겼|서버 응답이 늦습니다|undefined|NaN|\[object Object\]/;
const idle = async (p, ms = 1200) => { await p.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {}); await p.waitForTimeout(ms); };
const noLoader = (p, t = 20000) => p.waitForFunction(() => { const l = document.querySelector('.k-ld'); return !(l && !l.hidden && l.getClientRects().length); }, null, { timeout: t }).catch(() => {});

async function group(name, base, login, cases) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const p = await ctx.newPage();
  const errs = [], apiBad = [];
  p.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));
  p.on('response', (r) => { const u = r.url(); if (u.includes('/api/v1/') && r.status() >= 400 && r.status() !== 401) apiBad.push(`${r.status()} ${u.replace(/^.*\/api\/v1/, '').slice(0, 80)}`); });
  if (login) { await frontDoor(p, APP, login); await p.waitForTimeout(2000); }
  for (const [id, label, url, fn] of cases) {
    if (ONLY && !ONLY.includes(id)) continue;
    errs.length = 0; apiBad.length = 0;
    const t0 = Date.now();
    let res = { label, ok: '됨', note: '' };
    try {
      if (url) { await p.goto(base + url, { waitUntil: 'domcontentloaded', timeout: 45000 }); await noLoader(p); await idle(p); }
      const r = fn ? await fn(p) : null;
      if (r) Object.assign(res, r);
      const txt = await p.evaluate(() => document.querySelector('main, .k-main, body')?.innerText || '');
      const m = txt.match(BAD_TEXT);
      if (m && res.ok === '됨') { res.ok = '이상함'; res.note = (res.note ? res.note + ' · ' : '') + `글 '${m[0]}'`; }
      if (/\/login\/|gov-home/.test(p.url()) && url && !/login|gov-home|main|api-guide|^\/$/.test(url)) { res.ok = '안 됨'; res.note += ' · 로그인으로 튕김'; }
    } catch (e) { res.ok = '안 됨'; res.note = String(e).slice(0, 200); }
    res.ms = Date.now() - t0;
    if (errs.length) { res.pageErr = [...errs]; if (res.ok === '됨') res.ok = '이상함'; }
    if (apiBad.length) { res.apiBad = [...new Set(apiBad)]; if (res.ok === '됨') res.ok = '이상함'; }
    await p.screenshot({ path: path.join(OUT, `${id}.png`) }).catch(() => {});
    res.shot = `shots/check/${id}.png`;
    R[id] = res; save();
    console.log(res.ok.padEnd(4), id, label, res.note || '', res.apiBad ? 'API ' + res.apiBad.join(' | ') : '', res.pageErr ? 'ERR ' + res.pageErr.join(' | ') : '');
  }
  await ctx.close();
}
const count = (p, sel) => p.locator(sel).count();
const need = async (p, sel, min, what) => { const n = await count(p, sel); return n >= min ? { note: `${what} ${n}` } : { ok: '안 됨', note: `${what} ${n}(최소 ${min})` }; };
const textHas = async (p, re) => re.test(await p.evaluate(() => document.body.innerText));

const OI = V + 'ops-infra/', OC = V + 'ops-core/';
if (GROUPS.includes('admin')) await group('admin', APP, 'lxadmin@lx.or.kr', [
  ['a01', 'LX 관리자 대시보드', OC + '#/', async (p) => need(p, '.k-main .num, .k-main b.num, .k-main [class*=big]', 3, '숫자 칸')],
  ['a02', '요청 관리 — 분석 요청', OC + '#/approvals', async (p) => need(p, '.k-main tr, .k-main li, .k-main article', 2, '줄')],
  ['a03', '요청 관리 — 승인 요청', OC + '#/approvals/approve', async (p) => need(p, '.k-main tr, .k-main li, .k-main article', 1, '줄')],
  ['a04', '요청 관리 — API 키 신청', OC + '#/approvals/apikeys', async (p) => need(p, '.k-main tr, .k-main li, .k-main article, .k-main p', 1, '줄')],
  ['a05', '인프라 — 장비 표', OI + '#/infra', async (p) => {
    const t0 = Date.now(); await p.waitForFunction(() => document.querySelectorAll('[data-view=infra] table tbody tr, .k-main table tbody tr').length > 0, null, { timeout: 20000 }).catch(() => {});
    const r = await need(p, '.k-main table tbody tr', 1, '표 행'); r.note += ` · 행 보임 ${Date.now() - t0}ms(화면 열린 뒤) · 최근 24시간 작업 ${await p.locator('#j24').innerText().catch(() => '?')}`; return r; }],
  ['a06', '기관 목록', OI + '#/tenants', async (p) => need(p, '.k-main tr, .k-main article, .k-main li', 2, '기관')],
  ['a07', '기관 한 곳(남원)', OI + '#/tenants/o/namwon', async (p) => need(p, '.tp-rec li, .tp-cells > *', 2, '칸 · 기록')],
  ['a08', '배포 — 배포 신청', OI + '#/deploys', async (p) => {
    const r = await need(p, '.rv-pane[data-tab=req] tr, .rv-pane[data-tab=req] article, .rv-pane[data-tab=req] li', 1, '신청');
    const b = p.locator('.rv-pane[data-tab=req] tbody tr, .rv-pane[data-tab=req] article').first();
    if (await b.count()) { await b.click().catch(() => {}); await p.waitForTimeout(1500); r.note += (await count(p, '.k-drawer, [role=dialog], .t-drawer')) ? ' · 신청서 열림' : ' · 신청서 창 없음(줄 누름)'; await p.keyboard.press('Escape'); }
    return r; }],
  ['a09', '배포 — 기관 공유', OI + '#/deploys/share', async (p) => need(p, '.rv-pane[data-tab=share] input[type=checkbox]', 1, '체크 칸')],
  ['a10', '배포 — 사용 현황', OI + '#/deploys/usage', async (p) => need(p, '.rv-pane[data-tab=usage] tbody tr', 1, '표 행')],
  ['a11', '배포 — 분야', OI + '#/deploys/categories', async (p) => need(p, '.rv-pane[data-tab=cat] li, .rv-pane[data-tab=cat] tr', 2, '분야')],
  ['a12', '배포 — 개선 후보', OI + '#/deploys/improve', async (p) => {
    await p.waitForSelector('.im-box tr, .im-box article', { timeout: 15000 }).catch(() => {});
    const now = await p.locator('.im-box .im-st', { hasText: '지금 됩니다' }).count();
    const apply = await p.locator('.im-box [data-a=apply]').count();
    const rel = await p.locator('.im-rel:not([hidden])').count();
    const r = await need(p, '.im-box tbody tr, .im-box article', 1, '후보');
    r.note += ` · '지금 됩니다' ${now} · '이대로 반영' ${apply} · 새 판 줄 ${rel ? '있음(누르지 않음)' : '없음'}`;
    return r; }],
  ['a13', '배포 — API', OI + '#/deploys/api', async (p) => ((await textHas(p, /켜진 키 \d+/)) && (await count(p, 'button:has-text("키 만들기")')) ? { note: '키 수 · 키 만들기 단추 보임(켜진 키 0 = 빈 안내)' } : { ok: '안 됨', note: 'API 칸 없음' })],
  ['a14', '배포 — XI 재학습', OI + '#/deploys/retrain', async (p) => need(p, '.rv-pane[data-tab=rt] tr, .rv-pane[data-tab=rt] article, .rv-pane[data-tab=rt] li, .rv-pane[data-tab=rt] section', 1, '칸')],
  ['a15', '배포 — 학습 서식', OI + '#/deploys/templates', async (p) => need(p, '.rv-pane[data-tab=tpl] tr, .rv-pane[data-tab=tpl] article, .rv-pane[data-tab=tpl] li, .rv-pane[data-tab=tpl] section', 1, '칸')],
  ['a16', '공유 데이터 — 영상', OI + '#/shared', async (p) => need(p, '.k-main tbody tr', 1, '영상')],
  ['a17', '공유 데이터 — 학습 데이터', OI + '#/shared', async (p) => { await p.locator('.sd-tabs [data-tab=train]').click(); await noLoader(p); await idle(p); return need(p, '.k-main tbody tr, .k-main .sd-empty, .k-main p', 1, '줄'); }],
  ['a18', '공유 데이터 — 행정 자료 + 올리기 시험(올리고 지움)', OI + '#/shared', async (p) => {
    await p.locator('.sd-tabs button:nth-child(3)').click(); await noLoader(p); await idle(p);
    const n0 = await count(p, '.k-main tbody tr');
    const f = path.join(os.tmpdir(), 'recheck-test.geojson');
    fs.writeFileSync(f, JSON.stringify({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { pnu: '5219025021100010000', name: '재검수 시험' }, geometry: { type: 'Polygon', coordinates: [[[127.5, 35.4], [127.501, 35.4], [127.501, 35.401], [127.5, 35.401], [127.5, 35.4]]] } }] }));
    await p.getByRole('button', { name: '행정 자료 올리기' }).click();
    await p.locator('[role=dialog] input[type=file], .sd-form input[type=file]').setInputFiles(f);
    await p.locator('.sd-form input[aria-label=이름]').fill('재검수 시험 자료');
    await p.locator('.sd-form button', { hasText: '올리기' }).click();
    await p.waitForFunction(() => [...document.querySelectorAll('.k-main tbody tr')].some((r) => r.innerText.includes('재검수 시험 자료')), null, { timeout: 30000 }).catch(() => {});
    const row = p.locator('.k-main tbody tr', { hasText: '재검수 시험 자료' });
    const up = await row.count();
    if (!up) { const err = await p.locator('.sd-err').innerText().catch(() => ''); return { ok: '안 됨', note: `올리기 실패 ${err}` }; }
    await p.screenshot({ path: path.join(OUT, 'a18-uploaded.png') });
    await row.first().locator('button', { hasText: '지우기' }).click();
    await p.locator('.sd-form button', { hasText: '지우기' }).click();
    await p.waitForFunction(() => ![...document.querySelectorAll('.k-main tbody tr')].some((r) => r.innerText.includes('재검수 시험 자료')), null, { timeout: 20000 }).catch(() => {});
    const left = await p.locator('.k-main tbody tr', { hasText: '재검수 시험 자료' }).count();
    return left ? { ok: '안 됨', note: '올림 · 지우기 안 됨' } : { note: `행 ${n0} · 올림 → 보임 → 지움(정리됨)` }; }],
  ['a19', '계정', V + 'ops-accounts/', async (p) => { await p.getByRole('tab', { name: '계정', exact: true }).click(); await noLoader(p); await idle(p); return need(p, 'main tbody tr, main li, main article', 2, '계정'); }],
]);

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
    const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 60000 }), p.locator('button', { hasText: '한글 문서 내려받기' }).first().click()]);
    const f = path.join(os.tmpdir(), 'recheck-' + dl.suggestedFilename());
    await dl.saveAs(f);
    const b = fs.readFileSync(f);
    const zip = b[0] === 0x50 && b[1] === 0x4b;
    const s = b.toString('latin1');
    const forb = /무허가/.test(Buffer.from(s, 'latin1').toString('utf8'));
    return zip && /\.hwpx$/.test(dl.suggestedFilename()) ? { note: `${dl.suggestedFilename()} ${Math.round(b.length / 1024)}KB · zip 형식${forb ? ' · 압축 안 글 확인 필요' : ''}` } : { ok: '안 됨', note: `받은 파일 ${dl.suggestedFilename()} ${b.length}B` }; }],
  ['g09', '필지 목록', V + 'gov-report/?service=card-farm', async (p) => need(p, '.k-main tbody tr, .k-main li', 3, '필지')],
  ['g10', '행정정보와 비교', V + 'gov-fusion/?service=card-farm', async (p) => need(p, '.k-main tbody tr, .k-main li, .k-main .num', 2, '줄 · 숫자')],
  ['g11', '필지 카드', V + 'gov-fusion/?service=card-farm', async (p) => {
    await p.waitForTimeout(2500);
    const row = p.locator('.k-main table tbody tr').first();
    if (!(await row.count())) return { ok: '안 됨', note: '표 행 없음' };
    await row.click(); await p.waitForTimeout(2500);
    const card = await count(p, '[role=dialog], .k-drawer, .t-drawer, [class*=parcel], [class*=pcard]');
    return card ? { note: '행 누름 → 필지 카드 열림' } : { ok: '이상함', note: '행 눌러도 카드 안 보임' }; }],
  ['g12', '지도', V + 'xi-clean/?service=card-farm', async (p) => { await p.waitForTimeout(3000); return need(p, 'canvas.maplibregl-canvas, .maplibregl-canvas', 1, '지도 캔버스'); }],
  ['g13', '기관 정보', V + 'gov-select/?view=org', async (p) => need(p, '.k-main section, .k-main dl, .k-main li', 1, '칸')],
  ['g14', '계정', V + 'gov-accounts/', async (p) => { await p.getByRole('tab', { name: '계정', exact: true }).click(); await noLoader(p); await idle(p); return need(p, 'main tbody tr, main li, main article', 1, '계정'); }],
]);

if (GROUPS.includes('main')) {
  await group('main', APP, null, [
    ['m01', '메인 — 장면', V + 'main/', async (p) => {
      const n = await count(p, '.m-ch'); await p.mouse.wheel(0, 2400); await p.waitForTimeout(1800); await p.mouse.wheel(0, 2400); await p.waitForTimeout(1800);
      const big = await p.evaluate(() => document.querySelector('#ch1-big')?.innerText || '');
      return n >= 6 ? { note: `장면 ${n} · 큰 숫자 '${big.replace(/\s+/g, ' ').slice(0, 30)}'` } : { ok: '안 됨', note: `장면 ${n}` }; }],
    ['m02', '메인 — 문의 창(보내지 않음)', V + 'main/', async (p) => {
      await p.evaluate(() => document.querySelector('#fin')?.scrollIntoView());
      await p.waitForTimeout(1500);
      await p.locator('[data-inquiry]').first().click({ force: true });
      await p.waitForTimeout(1200);
      const n = await count(p, '[role=dialog] input, [role=dialog] textarea, dialog input, dialog textarea');
      return n ? { note: `문의 창 열림 · 입력 칸 ${n}` } : { ok: '안 됨', note: '문의 창 없음' }; }],
    ['m03', 'API 안내', V + 'api-guide/', async (p) => need(p, 'main h2, main h3, main section, main pre, main code', 2, '칸')],
    ['m04', '로그인', V + 'login/', async (p) => need(p, 'input[type=password]', 1, '비밀번호 칸')],
  ]);
  await group('main', GOV, null, [['m05', '기관 메인(남원)', '/', async (p) => need(p, '.gh-login input', 2, '로그인 칸')]]);
}
save();
await browser.close();
