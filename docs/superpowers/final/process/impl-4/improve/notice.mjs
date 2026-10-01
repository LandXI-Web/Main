/* 구현 4차 · 개선 고리 — ⑤ 채팅창 맨 위 '이제 됩니다' 한 줄과 '해 보기'(loop.mjs 다음 단계만 다시 찍기).
   LX 직원(test@lx.or.kr)이 XI맵에서 XI ChatGEO 를 열면 맨 위 한 줄 → PC(1440) · 휴대폰(390) 캡처 → '해 보기'를 누르면 그 질문이 보내지고 답.
   로그인 = 로그인 폼(세션 주입 없음 · 비밀번호는 server/.env 에서 읽고 출력하지 않는다). 한 줄은 그려지는 순간 '본 것'이 된다(한 번만 보인다).
   사용: node docs/superpowers/final/process/impl-4/improve/notice.mjs [--at xi|console] */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../../../..');
const { frontDoor } = await import(pathToFileURL(path.join(ROOT, 'landxi/v3/kit/lint/forbidden.mjs')).href);
const HW = 'C:/Users/User/AppData/Local/ms-playwright';
if (fs.existsSync(path.join(HW, 'chromium-1234'))) process.env.PLAYWRIGHT_BROWSERS_PATH = HW;
const { chromium } = createRequire(path.join(ROOT, 'package.json'))('playwright');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const APP = 'https://app.land-xi.dev';
const AT = arg('--at', 'xi');
const IMG = path.join(HERE, 'img');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = (o) => console.log(JSON.stringify(o));

const browser = await chromium.launch({ channel: 'chromium' }).catch(() => chromium.launch());
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
p.setDefaultNavigationTimeout(150000);
p.setDefaultTimeout(120000);
const errs = [];
p.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
try {
  await frontDoor(p, APP, 'test@lx.or.kr');
  await p.goto(APP + (AT === 'xi' ? '/landxi/v3/xi-clean/?region=45190' : '/landxi/v3/lx-console/'), { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('.k-chat-fab', { timeout: 90000 }).catch(async () => { out({ debug: p.url() }); await p.screenshot({ path: path.join(IMG, '_debug-notice.png') }); });
  await sleep(4000);
  await p.locator('.k-chat-fab').click();
  await p.waitForSelector('.k-chat-note:not([hidden])', { timeout: 15000 }).catch(() => null);
  await sleep(800);
  const note = await p.evaluate(() => document.querySelector('.k-chat-note:not([hidden])')?.innerText.replace(/\s+/g, ' ').trim() || null);
  await p.screenshot({ path: path.join(IMG, 'loop-7-notice-1440.png') });
  out({ n: 7, note, shot: 'loop-7-notice-1440.png' });
  await p.setViewportSize({ width: 390, height: 844 });
  await sleep(1200);
  await p.screenshot({ path: path.join(IMG, 'loop-7-notice-390.png') });
  out({ n: 8, shot: 'loop-7-notice-390.png' });
  await p.setViewportSize({ width: 1440, height: 900 });
  await sleep(1200);
  if (note) {
    await p.locator('.k-chat-note-go').click();
    await p.waitForFunction(() => { const b = document.querySelector('#k-chat'); return b && b.dataset.state && b.dataset.state !== 'busy'; }, null, { timeout: 120000 }).catch(() => null);
    await sleep(4000);
    const ans = await p.evaluate(() => ([...document.querySelectorAll('#k-chat .k-chat-msg.ai')].pop()?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 300));
    await p.screenshot({ path: path.join(IMG, 'loop-8-tryit-1440.png') });
    out({ n: 9, act: '해 보기', answer: ans, shot: 'loop-8-tryit-1440.png' });
  }
} catch (e) {
  out({ error: String(e?.message || e) });
} finally {
  out({ errors: errs });
  await browser.close();
}
