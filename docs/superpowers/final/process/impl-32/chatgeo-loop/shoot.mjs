// impl-32 XI ChatGEO 개선 바퀴 1회차 — 바깥 주소 로그인 폼(세션 주입 0)으로 PC 1440 그림.
//   node shoot.mjs --app https://app.land-xi.dev --admin https://admin.land-xi.dev
// ① LX 관리자 → 배포 → 개선 후보: 맨 위 '새 판 n · 질문 n개 개선 · 승인 요청' 줄(누르지 않음 — 승인은 사용자 몫)
// ② LX 직원 XI맵 XI ChatGEO: 시험 질문 표시(sessionStorage lx.chat.test — 개선 후보에 쌓이지 않음 · 승인 전 판은 시험 질문에만 적용)로
//    새 판 질문 셋(결과 파일 내려받기 · Land-XI 소개 · '비닐하우스만 보기'). 비밀번호는 server/.env DEV_PASSWORD(출력 0).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = 'E:/Land-XI 플랫폼/01. 디자인';
const HW = 'C:/Users/User/AppData/Local/ms-playwright';
if (fs.existsSync(path.join(HW, 'chromium-1234'))) process.env.PLAYWRIGHT_BROWSERS_PATH = HW;
if (!process.env.DEV_PASSWORD) { const m = fs.readFileSync(path.join(ROOT, 'server/.env'), 'utf8').match(/^DEV_PASSWORD=(.*?)\s*$/m); if (m) process.env.DEV_PASSWORD = m[1]; }
process.env.LX_PW ||= process.env.DEV_PASSWORD;
const { chromium } = createRequire(path.join(ROOT, 'package.json'))('playwright');
const { frontDoor } = await import(pathToFileURL(path.join(ROOT, 'landxi/v3/kit/lint/forbidden.mjs')).href);

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const APP = arg('--app', 'https://app.land-xi.dev'), ADMIN = arg('--admin', 'https://admin.land-xi.dev');
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'shots');
fs.mkdirSync(OUT, { recursive: true });
const kst = () => new Date(Date.now() + 9 * 3600e3).toISOString().replace('Z', '+09:00');
const hm = () => kst().slice(11, 16).replace(':', '');
const run = { app: APP, admin: ADMIN, started: kst(), shots: {}, answers: {}, errors: [], local: [], bad: [] };
const save = () => fs.writeFileSync(path.join(OUT, 'run.json'), JSON.stringify(run, null, 2));
const shot = async (p, name) => { const f = `${name}-1440-${hm()}.png`; await p.screenshot({ path: path.join(OUT, f) }); run.shots[f] = kst(); console.log('shot', f); return f; };
const watch = (p) => {
  p.on('console', (m) => { if (m.type() === 'error') run.errors.push(m.text().slice(0, 300)); });
  p.on('pageerror', (e) => run.errors.push(String(e).slice(0, 300)));
  p.on('request', (r) => { if (/\/\/(127\.0\.0\.1|localhost|\[::1\])|:8700|:4173/.test(r.url())) run.local.push(r.url()); });
  p.on('response', (r) => { if (r.status() >= 400) run.bad.push(`${kst().slice(11, 19)} ${r.status()} ${r.url().replace(/[?#].*$/, '').slice(0, 160)}`); });
};

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  /* ① 관리자 — 개선 후보 맨 위 '새 판' 줄 */
  const a = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage(); watch(a);
  await frontDoor(a, ADMIN, 'lxadmin@lx.or.kr', 'admin');
  await a.waitForURL((u) => !/\/login\/?(\?|$)/.test(u.pathname), { timeout: 30000 });
  await a.goto(`${ADMIN}/landxi/v3/ops-infra/#/deploys/improve`, { waitUntil: 'domcontentloaded' });
  await a.waitForSelector('.im-rel:not([hidden])', { timeout: 40000 });
  await a.waitForSelector('.im-t, .im-box [data-kind]', { timeout: 40000 }).catch(() => {});
  await a.waitForTimeout(1200);
  run.answers.release_line = (await a.locator('.im-rel').innerText()).replace(/\s+/g, ' ');
  await shot(a, 'improve-release');
  await a.locator('.im-chip', { hasText: '채택' }).click();
  await a.waitForTimeout(600);
  await shot(a, 'improve-adopted');

  /* ② 직원 — XI맵 XI ChatGEO 시험 질문 셋 */
  const p = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage(); watch(p);
  await frontDoor(p, APP, 'test@lx.or.kr', 'app');
  await p.waitForURL((u) => !/\/login\/?(\?|$)/.test(u.pathname), { timeout: 30000 });
  await p.goto(APP + '/landxi/v3/xi-clean/', { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('.k-chat-root[data-dock] .k-ck-i', { timeout: 60000 });
  await p.evaluate(() => sessionStorage.setItem('lx.chat.test', '1'));
  await p.waitForTimeout(2500);
  const say = async (q, name) => {
    const inp = p.locator('.k-chat-root[data-dock] .k-ck-i');
    await inp.click(); await inp.fill('');
    await inp.pressSequentially(q, { delay: 30 });
    await inp.press('Enter');
    await p.waitForTimeout(800);
    await p.waitForFunction(() => document.querySelector('.k-chat')?.dataset.state && document.querySelector('.k-chat').dataset.state !== 'busy', null, { timeout: 90000 }).catch(() => {});
    await p.waitForTimeout(1500);
    run.answers[name] = { q, answer: await p.evaluate(() => [...document.querySelectorAll('.k-chat-msg.ai .k-chat-bub')].pop()?.innerText || ''),
      file: await p.locator('.k-ck-file').last().innerText().catch(() => null) };
    return shot(p, name);
  };
  await say('분석 결과를 GeoJSON 으로 내려받고 싶어', 'chat-result-files');
  await say('Land-XI 는 누가 만들었어?', 'chat-about');
  await say('비닐하우스만 보기', 'chat-only-greenhouse');
} catch (e) {
  run.errors.push('shoot: ' + String(e).slice(0, 300));
  console.error(e);
} finally {
  run.ended = kst();
  save();
  await browser.close();
}
