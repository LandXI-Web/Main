// 502 흉내(브라우저 안에서만 · 운영 영향 0): 로그인 폼으로 들어간 뒤, 화면을 다시 열 때 /api/v1/me 와 화면 API 를 몇 초 동안 502 로 돌려준다.
// 확인: 로그인 화면으로 가지 않는다 · 가운데 '불러오는 중 · 서버 응답이 늦습니다 · 다시 시도'가 뜬다 · 서버가 돌아오면 화면이 열린다.
import path from 'node:path'; import fs from 'node:fs'; import { createRequire } from 'node:module'; import { pathToFileURL } from 'node:url';
const ROOT = 'E:/Land-XI 플랫폼/01. 디자인';
process.env.PLAYWRIGHT_BROWSERS_PATH = 'C:/Users/User/AppData/Local/ms-playwright';
if (!process.env.LX_PW) process.env.LX_PW = (fs.readFileSync(ROOT + '/server/.env', 'utf8').match(/^DEV_PASSWORD=(.*?)\s*$/m) || [])[1];
const { chromium } = createRequire(path.join(ROOT, 'package.json'))('playwright');
const { frontDoor } = await import(pathToFileURL(path.join(ROOT, 'landxi/v3/kit/lint/forbidden.mjs')).href);
const SHOTS = process.argv[2] || '.';
const CASES = [
  { who: 'LX 직원', base: 'https://app.land-xi.dev', login: 'test@lx.or.kr', page: '/landxi/v3/lx-console/', shot: 'staff' },
  { who: 'LX 관리자', base: 'https://admin.land-xi.dev', login: 'lxadmin@lx.or.kr', page: '/landxi/v3/ops-core/', shot: 'admin' },
  { who: '기관(남원)', base: 'https://namwon.land-xi.dev', login: 'lxadmin@lx.or.kr', tenant: 'namwon', page: '/landxi/v3/gov-select/?list=1', shot: 'gov' },
];
const browser = await chromium.launch();
const out = [];
for (const c of CASES) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage(); page.setDefaultTimeout(30000);
  const errs = []; page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 200)));
  page.on('console', (m) => { if (m.type() === 'error' && !/502|Failed to load resource/.test(m.text())) errs.push(m.text().slice(0, 200)); });
  await frontDoor(page, c.base, c.login, { password: process.env.LX_PW, tenant: c.tenant });
  let down = true, n502 = 0;
  await page.route('**/api/v1/**', (r) => { if (down && !/\/auth\/login/.test(r.request().url())) { n502++; return r.fulfill({ status: 502, contentType: 'application/json', body: '{"error":{"code":"gateway_down","message":"서버에 연결할 수 없습니다."}}' }); } return r.continue(); });
  await page.goto(c.base + c.page, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(7000);
  const during = await page.evaluate(() => { const ld = document.querySelector('.k-ld'); const sl = document.querySelector('.k-ld-slow'); return { path: location.pathname, loader: !!ld && !ld.hidden, slow: !!sl && !sl.hidden, slowText: sl && !sl.hidden ? sl.innerText.replace(/\s+/g, ' ').trim() : '', session: !!localStorage.getItem('lx_api_session') }; });
  await page.screenshot({ path: path.join(SHOTS, `${c.shot}-502-during.png`) });
  down = false;   // 서버가 돌아옴
  await page.waitForTimeout(9000);
  const after = await page.evaluate(() => ({ path: location.pathname, loader: !!document.querySelector('.k-ld:not([hidden])'), main: !!document.querySelector('main, .k-main') }));
  await page.screenshot({ path: path.join(SHOTS, `${c.shot}-502-after.png`) });
  out.push({ who: c.who, page: c.page, fake502: n502, during, after, errors: errs });
  await ctx.close();
}
await browser.close();
console.log(JSON.stringify(out, null, 1));
