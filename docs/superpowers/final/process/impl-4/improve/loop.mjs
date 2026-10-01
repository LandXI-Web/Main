/* 구현 4차 · 개선 고리 한 바퀴 — 실제 바깥 주소에서 그대로 돌린다(로그인 폼 · 세션 주입 없음 · 비밀번호는 server/.env 에서 읽고 출력하지 않는다).
   ① LX 직원(test@lx.or.kr) 첫 화면에서 XI ChatGEO 에 못 하는 요청 → 서버가 저절로 모음
   ② LX 관리자(lxadmin@lx.or.kr) 배포 → 개선 후보 — 그 줄이 보임 → 채택(확인 대기)
   ③ 만들어졌는지 직접 확인 — 같은 일을 지도가 있는 화면(XI맵)에서 물어 실제로 되는지 본다(되지 않으면 여기서 멈추고 보내지 않는다)
   ④ LX 관리자 '이제 됩니다 보내기'
   ⑤ LX 직원이 채팅창을 다시 열면 맨 위 한 줄 — PC(1440) · 휴대폰(390)
   사용: node docs/superpowers/final/process/impl-4/improve/loop.mjs [--q '…'] [--q2 '…']
   결과: img/loop-*.png · loop.json(각 단계의 답 · 줄 · 숫자 — 서버 값 그대로) */
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
const APP = 'https://app.land-xi.dev', ADMIN = 'https://admin.land-xi.dev';
const Q1 = arg('--q', '2024년과 2025년 영상을 나란히 비교해 줘');           // 첫 화면(지도 없음)에서 막히는 요청
const Q2 = arg('--q2', '2023년과 2025년 영상을 나란히 보여 줘');          // 같은 일을 XI맵(지도 있음)에서 — 되는지 확인(말을 조금 바꿔 '다시 물음'과 섞이지 않게)
const IMG = path.join(HERE, 'img'); fs.mkdirSync(IMG, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = { at: new Date().toISOString(), steps: [] };
const step = (o) => { log.steps.push(o); console.log(JSON.stringify(o)); };
const shot = async (p, name) => { await p.screenshot({ path: path.join(IMG, name + '.png') }); return name + '.png'; };

const browser = await chromium.launch({ channel: 'chromium' }).catch(() => chromium.launch());
const ctxS = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const ctxA = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const S = await ctxS.newPage(), A = await ctxA.newPage();
const errs = [];
for (const p of [S, A]) p.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));

async function ask(page, q) {
  await page.locator('.k-chat-fab').click();
  await page.waitForSelector('#k-chat:not([hidden])', { timeout: 10000 });
  await page.fill('.k-ck-i', q);
  await page.press('.k-ck-i', 'Enter');
  await page.waitForFunction(() => { const b = document.querySelector('#k-chat'); return b && b.dataset.state && b.dataset.state !== 'busy'; }, null, { timeout: 120000 });
  await sleep(4000);                                   // 지도 동작 끝 신호 · 아래 버튼까지
  return page.evaluate(() => {
    const b = document.querySelector('#k-chat');
    const last = [...b.querySelectorAll('.k-chat-msg.ai')].pop();
    return { state: b.dataset.state, run: b.dataset.run || null, answer: (last?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 300) };
  });
}
async function adminRow(gistPart) {
  return A.evaluate((g) => [...document.querySelectorAll('.im-t tbody tr')].map((tr) => ({ id: tr.dataset.id, state: tr.dataset.state, text: tr.innerText.replace(/\s+/g, ' ').trim() }))
    .find((r) => r.text.includes(g)) || null, gistPart);
}

try {
  /* ① 막힌 요청 */
  await frontDoor(S, APP, 'test@lx.or.kr');
  await S.goto(APP + '/landxi/v3/lx-console/', { waitUntil: 'domcontentloaded' });
  await sleep(3000);
  const a1 = await ask(S, Q1);
  step({ n: 1, who: 'LX 직원', screen: '첫 화면(LX 직원 대시보드)', q: Q1, ...a1, shot: await shot(S, 'loop-1-blocked-1440') });
  await S.locator('.k-chat-x').click().catch(() => {});
  await sleep(4000);                                   // 서버 기록은 답을 보낸 뒤 따로 돈다

  /* ② 목록 → 채택 */
  await frontDoor(A, ADMIN, 'lxadmin@lx.or.kr');
  await A.goto(ADMIN + '/landxi/v3/ops-infra/#/deploys/improve', { waitUntil: 'domcontentloaded' });
  await A.waitForSelector('.im-t', { timeout: 40000 });
  await sleep(1500);
  const gist = arg('--gist', Q1.replace(/\s*해 줘$/, ''));
  let row = await adminRow(gist);
  if (row) await A.evaluate((id) => document.querySelector(`.im-t tr[data-id="${id}"]`)?.scrollIntoView({ block: 'center' }), row.id);
  await A.evaluate((id) => { const tr = document.querySelector(`.im-t tr[data-id="${id}"]`); if (tr) tr.style.background = 'var(--tint)'; }, row?.id || '');
  step({ n: 2, who: 'LX 관리자', screen: '배포 → 개선 후보', row, shot: await shot(A, 'loop-2-list-1440') });
  if (!row) throw new Error('목록에 그 줄이 없습니다');
  await A.locator(`.im-t tr[data-id="${row.id}"] button[data-a="adopt"]`).click();
  await sleep(1500);
  await A.locator('.im-chips[data-f="state"] .im-chip[data-v="adopted"]').click();
  await sleep(800);
  row = await adminRow(gist);
  step({ n: 3, who: 'LX 관리자', act: '채택', row, shot: await shot(A, 'loop-3-adopted-1440') });

  /* ③ 만들어졌는지 직접 확인 — XI맵(지도 있음)에서 같은 일 */
  await S.goto(APP + '/landxi/v3/xi-clean/?region=45190', { waitUntil: 'domcontentloaded' });
  await sleep(6000);
  const a2 = await ask(S, Q2);
  const works = a2.state === 'done' && new RegExp(arg('--ok', '나눠|나란히 놓|좌우')).test(a2.answer) && !/못했|못 했|없어|없는 기능/.test(a2.answer.split('.')[0]);
  step({ n: 4, who: 'LX 직원', screen: 'XI맵(남원시)', q: Q2, ...a2, works, shot: await shot(S, 'loop-4-works-1440') });
  if (!works) throw new Error('XI맵에서도 되지 않아 이제 됩니다를 보내지 않습니다');
  await S.locator('.k-chat-x').click().catch(() => {});

  /* ④ 이제 됩니다 보내기 */
  await A.locator(`.im-t tr[data-id="${row.id}"] button[data-a="notify"]`).click();
  await A.waitForSelector('.k-md .im-form', { timeout: 8000 });
  // 첫 화면에는 지도가 없으므로 '이제 됩니다'는 어디서 되는지까지 말한다(관리자가 고쳐 쓰는 칸 — 지어낸 말 0)
  const iga = (w) => { const c = w.slice(-1); return c >= '가' && c <= '힣' && (c.charCodeAt(0) - 0xac00) % 28 ? '이' : '가'; };
  await A.fill('.k-md .im-form .im-f:nth-of-type(1) input', `지난번에 물으신 '${gist}'${iga(gist)} 이제 XI맵에서 됩니다.`).catch(() => {});
  await A.fill('.k-md .im-form .im-f:nth-of-type(2) input', Q2).catch(() => {});
  await sleep(400);
  step({ n: 5, who: 'LX 관리자', act: '이제 됩니다 보내기 창', shot: await shot(A, 'loop-5-notify-1440') });
  await A.locator('.k-md .im-form button[type=submit]').click();
  await sleep(1500);
  await A.locator('.im-chips[data-f="state"] .im-chip[data-v="built"]').click();
  await sleep(800);
  step({ n: 6, who: 'LX 관리자', act: '보냄', row: await adminRow(gist), shot: await shot(A, 'loop-6-built-1440') });

  /* ⑤ 채팅창 맨 위 한 줄 */
  await S.goto(APP + '/landxi/v3/lx-console/', { waitUntil: 'domcontentloaded' });
  await S.evaluate(() => { try { for (const k of Object.keys(sessionStorage)) if (/chat|cmdk|ck/i.test(k)) sessionStorage.removeItem(k); } catch { /* */ } });
  await S.reload({ waitUntil: 'domcontentloaded' });
  await sleep(3000);
  await S.locator('.k-chat-fab').click();
  await S.waitForSelector('.k-chat-note:not([hidden])', { timeout: 15000 }).catch(() => null);
  await sleep(800);
  const note = await S.evaluate(() => document.querySelector('.k-chat-note:not([hidden])')?.innerText.replace(/\s+/g, ' ').trim() || null);
  step({ n: 7, who: 'LX 직원', screen: '첫 화면 · XI ChatGEO 를 다시 엶', note, shot: await shot(S, 'loop-7-notice-1440') });
  await S.setViewportSize({ width: 390, height: 844 });
  await sleep(1200);
  step({ n: 8, who: 'LX 직원', screen: '같은 창 · 휴대폰 폭', note, shot: await shot(S, 'loop-7-notice-390') });
} catch (e) {
  step({ error: String(e?.message || e) });
} finally {
  log.errors = errs;
  fs.writeFileSync(path.join(HERE, 'loop.json'), JSON.stringify(log, null, 1));
  await browser.close();
}
