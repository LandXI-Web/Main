/* 남은 일 1 — LX 직원 대시보드 /projects?scope=mine 서버 시간. 로그인 폼으로 들어가 같은 세션으로 5번 잰다. 비밀번호 출력 없음. */
import fs from 'node:fs'; import path from 'node:path'; import { createRequire } from 'node:module'; import { pathToFileURL, fileURLToPath } from 'node:url';
const ROOT = 'E:/Land-XI 플랫폼/01. 디자인';
const HW = 'C:/Users/User/AppData/Local/ms-playwright'; if (fs.existsSync(HW)) process.env.PLAYWRIGHT_BROWSERS_PATH = HW;
const m = fs.readFileSync(path.join(ROOT, 'server/.env'), 'utf8').match(/^DEV_PASSWORD=(.*?)\s*$/m); const PW = process.env.DEV_PASSWORD || m[1];
const { chromium } = createRequire(path.join(ROOT, 'package.json'))('playwright');
const { frontDoor } = await import(pathToFileURL(path.join(ROOT, 'landxi/v3/kit/lint/forbidden.mjs')).href);
const APP = 'https://app.land-xi.dev';
const b = await chromium.launch({ channel: 'chrome', headless: true }).catch(() => chromium.launch());
const p = await (await b.newContext()).newPage();
await frontDoor(p, APP, 'test@lx.or.kr', { password: PW });
await p.waitForURL((u) => !/\/login\/?$/.test(u.pathname) && u.pathname !== '/', { timeout: 30000 }).catch(() => {});
const out = [];
for (const q of Array(12).fill('/api/v1/projects?scope=mine')) {
  const r = await p.evaluate(async (q) => { const t = performance.now(); const tk = JSON.parse(localStorage.getItem('lx_api_session')).token; const x = await fetch(q, { headers: { authorization: 'Bearer ' + tk } }); const j = await x.json().catch(() => ({})); return { s: x.status, ms: Math.round(performance.now() - t), n: (j.items || []).length }; }, q);
  out.push({ q: q.replace(/\?.*/, '') + ' ' + q.split('=')[1], ...r });
}
console.log(JSON.stringify(out)); fs.writeFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'api-' + (process.argv[2] || 'x') + '.json'), JSON.stringify(out, null, 1));
await b.close();
