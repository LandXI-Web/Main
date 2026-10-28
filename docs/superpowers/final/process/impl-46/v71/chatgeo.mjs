/* E5 XI ChatGEO 실제 기록 — kec-land(로그인 폼 · 바깥 주소) · 지도 서비스 화면에서 질문 3개를 차례로(같은 대화) · 차례마다 run 사건(tool.call · tool.result · done) 그대로 */
import fs from 'node:fs';
import { open, APP } from './cap.mjs';
const OUT = 'E:/도로공사/deck_part3b/chatgeo/';
fs.mkdirSync(OUT, { recursive: true });
const QS = ['서울세종선 안성 구간 2019 이후 변화와 지목 불일치를 정리해 보고서로 만들어줘',
  '이 구간에서 법면 · 잔여지 필지 중 대장과 다른 필지만 표로 뽑아줘',
  '전국 고속국도 이지목 상위 시군구 5곳과 점유의심 면적을 요약해줘'];
const { browser, page, errs } = await open('kec-land@lx.or.kr', 'ROADLAND_PW');
const runs = [];
page.on('response', async (r) => { try { if (r.request().method() === 'POST' && /\/agent\/runs$/.test(new URL(r.url()).pathname)) { const j = await r.json(); runs.push({ at: Date.now(), j }); } } catch {} });
await page.goto(APP + '/landxi/v3/lx-map/', { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(8000);
const turns = [];
for (let i = 0; i < QS.length; i++) {
  const ck = page.locator('.k-ck').first();
  if (!(await ck.isVisible().catch(() => false))) { await page.keyboard.press('Control+k'); await page.waitForTimeout(1200); }
  if (!(await ck.isVisible().catch(() => false))) { await page.locator('button', { hasText: 'XI ChatGEO' }).first().click().catch(() => {}); await page.waitForTimeout(1200); }
  const n0 = runs.length; const t0 = Date.now();
  await page.locator('.k-ck-i').first().fill(QS[i]);
  await page.locator('.k-ck-i').first().press('Enter');
  let state = '';
  for (let k = 0; k < 600; k++) {
    await page.waitForTimeout(1000);
    state = await ck.getAttribute('data-state').catch(() => '');
    if (runs.length > n0 && ['done', 'failed', 'rejected'].includes(state)) break;
  }
  const sec = (Date.now() - t0) / 1000;
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}turn${i + 1}.png` });
  const run = runs[n0]?.j?.run || runs[n0]?.j?.run_id || runs[n0]?.j?.id || null;
  const ev = run ? await page.evaluate(async (run) => { const m = await import('/landxi/shared/api-v1.js'); const a = await m.api(`/agent/runs/${encodeURIComponent(run)}/events`).catch((e) => ({ err: e.message })); const b = await m.api(`/agent/runs/${encodeURIComponent(run)}`).catch((e) => ({ err: e.message })); return { events: a, run: b }; }, run) : null;
  const shown = await page.evaluate(() => { const c = document.querySelector('.k-ck'); return { text: c?.innerText || '', html: (c?.querySelector('.k-ck-a')?.innerHTML || '').slice(0, 20000),
    links: [...(c?.querySelectorAll('a[href],button[data-report]') || [])].map((a) => ({ text: a.innerText, href: a.getAttribute('href') || a.dataset.report })) }; });
  turns.push({ n: i + 1, question: QS[i], state, wall_seconds: sec, post: runs[n0]?.j || null, shown, recorded: ev });
  fs.writeFileSync(OUT + '_raw_turns.json', JSON.stringify(turns, null, 1));
  console.log(i + 1, state, sec, run);
}
console.log('errs', errs);
await browser.close();
