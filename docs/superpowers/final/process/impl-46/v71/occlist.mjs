/* 카드 ③ 그림용 — 안성 창 점유의심 목록(플랫폼 API 그대로 · kec-land 로그인 폼) → E:\도로공사\deck_part3b\cards\occupy_list.json */
import fs from 'node:fs';
import { open, APP } from './cap.mjs';
const { browser, page } = await open('kec-land@lx.or.kr', 'ROADLAND_PW');
await page.goto(APP + '/landxi/v3/lx-analyze/', { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(3000);
const t0 = Date.now();
const r = await page.evaluate(async () => { const m = await import('/landxi/shared/api-v1.js');
  return m.api('/change/runs/job_01M619SR7NV5X0QTQKCAQZ2KT2/occupy?chg=job_01M619SQY8M0FVV2M7AJZKW6PA&format=json'); });
const sec = (Date.now() - t0) / 1000;
fs.writeFileSync('E:/도로공사/deck_part3b/cards/occupy_list.json', JSON.stringify({ at: new Date().toISOString(), seconds: sec, ...r }, null, 1));
console.log(sec, Object.keys(r), (r.items || r.rows || []).length);
await browser.close();
