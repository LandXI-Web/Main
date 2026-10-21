/* 남원 비닐하우스 1.0 되돌림 — 화면마다 같은 숫자인지 찍기(10-21 사용자 "되돌리자 그럼")
   node capture.mjs [tag]   → ./numbers-<tag>.json · ./shots/<tag>-*.png
   로그인은 frontDoor(로그인 폼)로만. 비밀번호는 frontDoor 가 server/.env 에서 읽는다(출력 안 함).
   API 응답 가운데 비닐하우스 · 남원 숫자가 든 것을 모아 둔다(화면 글과 함께). */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';

const ROOT = 'E:/Land-XI 플랫폼/01. 디자인';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const TAG = process.argv[2] || 'after';
const SH = path.join(HERE, 'shots'); fs.mkdirSync(SH, { recursive: true });
const HW = 'C:/Users/User/AppData/Local/ms-playwright';
if (fs.existsSync(path.join(HW, 'chromium-1234'))) process.env.PLAYWRIGHT_BROWSERS_PATH = HW;
const { chromium } = createRequire(path.join(ROOT, 'package.json'))('playwright');
const { frontDoor } = await import(pathToFileURL(path.join(ROOT, 'landxi/v3/kit/lint/forbidden.mjs')).href);

const APP = 'https://app.land-xi.dev', ORG = 'https://namwon.land-xi.dev';
const CARD = 'card-5e85a9';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = { at: new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }), tag: TAG, screens: [], chat: [] };
const save = () => fs.writeFileSync(path.join(HERE, `numbers-${TAG}.json`), JSON.stringify(OUT, null, 1));
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

async function ctxFor(base, login, tenant) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ko-KR' });
  const p = await ctx.newPage();
  const apis = [];
  p.on('response', async (r) => {
    const u = r.url();
    if (!/\/api\/v1\//.test(u) || !/json/.test(r.headers()['content-type'] || '')) return;
    try { const t = await r.text(); if (/비닐하우스|greenhouse/.test(t)) apis.push({ url: u.replace(/^https?:\/\/[^/]+/, '').slice(0, 200), body: t.slice(0, 200000) }); } catch { /* 닫힌 응답 */ }
  });
  await frontDoor(p, base, login, tenant ? { tenant } : undefined);
  return { ctx, p, apis };
}
const txt = (p) => p.evaluate(() => document.body.innerText.replace(/[ \t]+/g, ' '));
const near = (t) => [...new Set((t.match(/[^\n]{0,40}(비닐하우스)[^\n]{0,60}/g) || []))].slice(0, 40);
const nums = (s) => [...new Set((s.match(/비닐하우스[^0-9]{0,40}([0-9][0-9,]*)/g) || []))];

async function screen(S, name, url, wait = 9000) {
  const t0 = Date.now();
  S.apis.length = 0;
  await S.p.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await sleep(wait);
  const t = await txt(S.p);
  await S.p.screenshot({ path: path.join(SH, `${TAG}-${name}.png`) });
  // API 숫자: 응답 안에서 '비닐하우스' 근처의 n · value 숫자만 뽑아 둔다(전체 본문은 남기지 않음)
  const api = S.apis.map((a) => ({ url: a.url, hits: [...new Set((a.body.match(/"[^"]{0,30}비닐하우스[^"]{0,30}"[^{}]{0,160}/g) || []))].slice(0, 12) }));
  OUT.screens.push({ name, url: url.replace(/^https?:\/\/[^/]+/, ''), ms: Date.now() - t0, text: near(t), api });
  save();
}

async function ask(S, name, q) {
  const box = S.p.locator('.k-chat-root textarea, .k-chat-root input[type=text], textarea.xk-in, .xk-in textarea, textarea').first();
  await box.waitFor({ timeout: 20000 }).catch(() => {});
  await box.fill(q).catch(() => {});
  await box.press('Enter').catch(() => {});
  let ans = '';
  for (let i = 0; i < 60; i++) {
    await sleep(1000);
    ans = await S.p.evaluate(() => (document.querySelector('.xk-ans-t')?.textContent || '').replace(/\s+/g, ' ').trim());
    if (ans && !/불러오는 중|생각하는 중|찾는 중/.test(ans) && i > 4) break;
  }
  await sleep(1500);
  ans = await S.p.evaluate(() => (document.querySelector('.xk-ans-t')?.textContent || '').replace(/\s+/g, ' ').trim());
  await S.p.screenshot({ path: path.join(SH, `${TAG}-${name}.png`) });
  OUT.chat.push({ name, q, answer: ans.slice(0, 600) });
  save();
}

// 기관(남원) — 서비스 화면 · 보고서 · XI맵 · XI ChatGEO
{
  const S = await ctxFor(ORG, 'lxadmin@lx.or.kr', 'namwon');
  await screen(S, 'gov-select', `${ORG}/landxi/v3/gov-select/`);
  await screen(S, 'gov-space', `${ORG}/landxi/v3/gov-space/?card=${CARD}`, 12000);
  await screen(S, 'gov-report', `${ORG}/landxi/v3/gov-report/?service=${CARD}`, 12000);
  await screen(S, 'gov-ximap', `${ORG}/landxi/v3/xi-clean/`, 15000);
  await ask(S, 'gov-chat', '남원시 비닐하우스 몇 곳이야');
  await S.ctx.close();
}
// LX 직원 — 첫 화면(대시보드) · XI맵 통계 · XI ChatGEO
{
  const S = await ctxFor(APP, 'test@lx.or.kr');
  await screen(S, 'staff-home', `${APP}/landxi/v3/lx-console/`, 12000);
  await screen(S, 'staff-ximap', `${APP}/landxi/v3/xi-clean/?sgg=52190`, 15000);
  await ask(S, 'staff-chat', '남원시 비닐하우스 몇 곳이야');
  await S.ctx.close();
}
await browser.close();
save();
console.log(JSON.stringify({ screens: OUT.screens.map((s) => ({ n: s.name, ms: s.ms, text: s.text.slice(0, 8), api: s.api.map((a) => a.url + ' ' + a.hits.slice(0, 4).join(' | ')) })), chat: OUT.chat }, null, 1));
