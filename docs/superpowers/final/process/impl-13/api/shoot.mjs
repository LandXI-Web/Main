/* impl-13 외부 연동 API 1차 — 바깥 주소 · 로그인 폼(kit/lint/forbidden.mjs frontDoor · 세션 주입 0)으로 실제 흐름 한 번 · PC 1440 캡처(원칙 162).
   흐름: LX 관리자 배포 → API → 남원시 · 경작·휴경 분석서비스 '키 만들기'(쓰는 시스템 '시험 연동(점검)') → 키 한 번 보기(그림에서는 키 값을 가림)
        → 그 키로 바깥 API 주소(api.land-xi.dev/v1) 호출 → 키 자세히(호출 기록) → 사용 현황 'API 호출' 열 → 남원시 기관 관리자 '받은 API 키'
        → LX 관리자가 폐기(사유 '시험 끝') → 같은 키 호출 거절 확인.
   키 값 · 비밀번호는 출력하지 않는다(메모리에만). 시험 키 표시(test)는 끝에 mark-test.py 가 단다.
   사용: node docs/superpowers/final/process/impl-13/api/shoot.mjs */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../../../..');
const { frontDoor } = await import(pathToFileURL(path.join(ROOT, 'landxi/v3/kit/lint/forbidden.mjs')).href);
const { chromium } = createRequire(path.join(ROOT, 'package.json'))('playwright');
const SHOTS = path.join(HERE, 'shots'); fs.mkdirSync(SHOTS, { recursive: true });
const LOG = path.join(SHOTS, 'log.json');
const log = {};
const browser = await chromium.launch();
const stamp = () => { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; };
async function shot(page, name, note) {
  await page.screenshot({ path: path.join(SHOTS, name) });
  log[name] = { at: stamp(), url: page.url().replace(/[?#].*$/, '') + (new URL(page.url()).hash || ''), note };
  fs.writeFileSync(LOG, JSON.stringify(log, null, 1));
  console.log(JSON.stringify({ shot: name, at: log[name].at }));
}
async function open(login, base, site) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(90000); page.setDefaultNavigationTimeout(120000);
  const errs = []; page.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));
  await frontDoor(page, base, login, site);
  await page.waitForTimeout(1500);
  return { ctx, page, errs };
}
const ADMIN = 'https://admin.land-xi.dev';
const API = 'https://api.land-xi.dev/v1';
const LABEL = '시험 연동(점검)';
const calls = [];
async function call(key, p) {
  const r = await fetch(API + p, { headers: key ? { authorization: 'Bearer ' + key } : {} });
  const buf = Buffer.from(await r.arrayBuffer());
  let n = null;
  try { const j = JSON.parse(buf.toString('utf8')); n = j.features ? j.features.length : j.items ? j.items.length : null; } catch { /* zip · xlsx */ }
  const out = { path: p.replace(/cursor=[^&]+/, 'cursor=…'), status: r.status, type: (r.headers.get('content-type') || '').split(';')[0], bytes: buf.length, n };
  calls.push(out); return out;
}

/* 1) LX 관리자 — 키 만들기 · 한 번 보기 */
const A = await open('lxadmin@lx.or.kr', ADMIN, 'admin');
const org = new URL(A.page.url()).origin;
await A.page.goto(org + '/landxi/v3/ops-infra/#/deploys/api', { waitUntil: 'domcontentloaded' });
await A.page.waitForSelector('.ak-tbl');
await A.page.waitForTimeout(1200);
const pair = A.page.locator('tr.ak-pair', { hasText: '남원' }).filter({ hasText: '경작' }).first();
await pair.locator('.ak-mk').click();
await A.page.waitForSelector('.k-drawer .ak-form');
await A.page.locator('.k-drawer .ak-form input[type=text]').fill(LABEL);
await A.page.waitForTimeout(500);
await shot(A.page, 'api-create-1440.png', "배포 → API → 남원시 · 경작·휴경 분석서비스 '키 만들기' 서랍(쓰는 시스템 · 끝나는 날 · 내줄 형식 · 한도)");
await A.page.locator('.k-drawer .ak-acts .t-btn').click();
await A.page.waitForSelector('.k-drawer .ak-val');
const KEY = await A.page.locator('.k-drawer .ak-val').textContent();
await A.page.evaluate(() => { const v = document.querySelector('.k-drawer .ak-val'); v.textContent = v.textContent.slice(0, 4) + '•'.repeat(36); });
await A.page.waitForTimeout(400);
await shot(A.page, 'api-key-once-1440.png', '키를 만든 직후 — 키 값은 지금 한 번만 보임(그림에서는 키 값을 가림) · 복사 · 쓰는 시스템 · 끝나는 날 · 형식 · 한도');
await A.page.locator('.k-drawer .ak-acts .t-btn').click();

/* 2) 바깥 API 주소로 호출(키 값 출력 0) */
await call(null, '/me');
await call(KEY, '/me');
await call(KEY, '/timepoints');
const first = await call(KEY, '/results?limit=1000');
await call(KEY, '/summary');
await call(KEY, '/exports/shp');
await call(KEY, '/exports/parcels');
await call(KEY, '/exports/geojson');
const r404 = await fetch(API + '/results?edition=999', { headers: { authorization: 'Bearer ' + KEY } });
calls.push({ path: '/results?edition=999', status: r404.status });
const mix = await fetch('https://app.land-xi.dev/api/ext/v1/me', { headers: { authorization: 'Bearer ' + KEY } });
calls.push({ path: 'app.land-xi.dev/api/ext/v1/me', status: mix.status });
const mix2 = await fetch('https://app.land-xi.dev/api/v1/me', { headers: { authorization: 'Bearer ' + KEY } });
calls.push({ path: 'app.land-xi.dev/api/v1/me (키로 화면 API)', status: mix2.status });
console.log(JSON.stringify({ part: 'calls', calls }));

/* 3) 표 · 자세히(호출 기록) · 사용 현황 */
await A.page.goto(org + '/landxi/v3/ops-infra/#/deploys/api', { waitUntil: 'domcontentloaded' });
await A.page.reload({ waitUntil: 'domcontentloaded' });
await A.page.waitForSelector('.ak-row');
await A.page.waitForTimeout(1500);
await shot(A.page, 'api-tab-1440.png', '배포 → API 탭 — 기관 × 공유된 서비스마다 키(상태 · 끝나는 날 · 마지막 호출 · 이번 달 호출) · 키 만들기');
await A.page.locator('tr.ak-row', { hasText: LABEL }).first().click();
await A.page.waitForSelector('.k-drawer .ak-ctbl');
await A.page.waitForTimeout(1000);
await shot(A.page, 'api-key-detail-1440.png', '키 자세히 — 상태 · 키 끝 네 자리 · 끝나는 날 바꾸기 · 내줄 형식 · 한도 · 호출 · 멈춤 · 폐기 · 최근 호출 기록');
await A.page.keyboard.press('Escape');
await A.page.goto(org + '/landxi/v3/ops-infra/#/deploys/usage', { waitUntil: 'domcontentloaded' });
await A.page.reload({ waitUntil: 'domcontentloaded' });
await A.page.waitForSelector('.rv-tbl--usage');
await A.page.waitForTimeout(1500);
await shot(A.page, 'usage-api-col-1440.png', "배포 → 사용 현황 — 'API 호출' 열(이번 달 · 성공 · 시험 키 제외 · 켜진 키)");
const usageHead = await A.page.evaluate(() => [...document.querySelectorAll('.rv-tbl--usage th')].map((t) => t.textContent));

/* 4) 남원시 기관 관리자 — 받은 API 키(보기만) */
const G = await open('lxadmin@lx.or.kr#namwon', ADMIN, 'gov');
const gorg = new URL(G.page.url()).origin;
await G.page.goto(gorg + '/landxi/v3/gov-select/?view=org', { waitUntil: 'domcontentloaded' });
await G.page.waitForSelector('.gk');
await G.page.waitForTimeout(1200);
await G.page.locator('.gk').scrollIntoViewIfNeeded();
await G.page.waitForTimeout(600);
await shot(G.page, 'gov-keys-1440.png', "남원시 기관 관리자 → 기관 정보 → '받은 API 키'(보기만 · 키 값 없음 · 끝 네 자리)");
await G.page.setViewportSize({ width: 390, height: 844 });
await G.page.waitForTimeout(800);
await G.page.locator('.gk').scrollIntoViewIfNeeded();
await G.page.waitForTimeout(500);
await shot(G.page, 'gov-keys-390.png', '같은 칸 휴대폰 폭(390) — 줄바꿈 확인 · 표는 칸 안에서 옆으로 밀림');
const govText = await G.page.locator('.gk').innerText();
const keyLeak = govText.includes(KEY) || (await G.page.content()).includes(KEY);
await G.ctx.close();

/* 5) 폐기(사유 '시험 끝') → 같은 키 거절 */
await A.page.goto(org + '/landxi/v3/ops-infra/#/deploys/api', { waitUntil: 'domcontentloaded' });
await A.page.reload({ waitUntil: 'domcontentloaded' });
await A.page.waitForSelector('.ak-row');
await A.page.waitForTimeout(1000);
await A.page.locator('tr.ak-row', { hasText: LABEL }).first().click();
await A.page.waitForSelector('.k-drawer .ak-rv');
await A.page.locator('.k-drawer .ak-acts--row .t-input').fill('시험 끝');
await A.page.locator('.k-drawer .ak-rv').click();
await A.page.locator('.k-drawer .ak-rv').click();
await A.page.waitForFunction(() => /폐기/.test(document.querySelector('.k-drawer .ak-st')?.textContent || ''));
await A.page.waitForTimeout(800);
const after = await fetch(API + '/me', { headers: { authorization: 'Bearer ' + KEY } });
const afterJ = await after.json();
console.log(JSON.stringify({ part: 'end', first_page: { n: first.n, status: first.status }, usageHead, keyLeakOnGov: keyLeak, revokedCall: { status: after.status, code: afterJ.error?.code },
  adminErrs: A.errs, govErrs: G.errs }));
fs.writeFileSync(path.join(HERE, 'calls.json'), JSON.stringify({ at: stamp(), calls, revoked_call: { status: after.status, code: afterJ.error?.code }, usage_head: usageHead, key_on_gov_page: keyLeak }, null, 1));
await A.ctx.close();
await browser.close();
