/* ChatGEO run 기록 그대로 받기(GET /agent/runs/{id} · /events) + 산출 파일 내려받기 — kec-land 로그인 폼 */
import fs from 'node:fs';
import { open, APP } from './cap.mjs';
const [tag, ...ids] = process.argv.slice(2);
const OUT = 'E:/도로공사/deck_part3b/chatgeo/';
const { browser, page } = await open('kec-land@lx.or.kr', 'ROADLAND_PW');
await page.goto(APP + '/landxi/v3/lx-map/', { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(3000);
const res = {};
for (const id of ids) {
  res[id] = await page.evaluate(async (id) => { const m = await import('/landxi/shared/api-v1.js');
    const ev = await m.api(`/agent/runs/${id}/events`).catch((e) => ({ err: e.message })); const run = await m.api(`/agent/runs/${id}`).catch((e) => ({ err: e.message }));
    return { run, events: ev }; }, id);
}
fs.writeFileSync(`${OUT}_events_${tag}.json`, JSON.stringify(res, null, 1));
console.log(JSON.stringify(res).length);
await browser.close();
