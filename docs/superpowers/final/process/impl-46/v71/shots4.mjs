/* E4 화면 캡처 4종(목록 · 상세 · 실행 패널 · 결과) 1920×1080 — 바깥 주소 · 로그인 폼. 목록 · 상세 = lx.demo(0 상태) · 실행 패널 · 결과 = kec-land(안성 결과 보유) */
import { open, shot, text, APP } from './cap.mjs';
const CARDS = ['card-change', 'card-ijimok', 'card-occupy'];
const RES = { 'card-change': '?change=job_01M619SQY8M0FVV2M7AJZKW6PA', 'card-ijimok': '?change=job_01M619SR7NV5X0QTQKCAQZ2KT2',
  'card-occupy': '?change=job_01M619SR7NV5X0QTQKCAQZ2KT2&occupy=job_01M619SQY8M0FVV2M7AJZKW6PA' };
const out = {};
const only = process.argv[2] || 'all';
if (only === 'all' || only === 'a') {
  const { browser, page, errs } = await open();
  await page.goto(APP + '/landxi/v3/lx-analyze/?grp=' + encodeURIComponent('건축·변화'), { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(8000);
  out.list = await shot(page, 'platform/1-list.png');
  for (const c of CARDS) {
    await page.goto(APP + `/landxi/v3/lx-analyze/?card=${c}`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(8000);
    out[c] = await shot(page, `platform/2-detail-${c}.png`);
    out[c + '-t'] = (await text(page, 'main')).slice(0, 1200);
  }
  out.errsA = errs; await browser.close();
}
if (only === 'all' || only === 'b' || only === 'r') {
  const { browser, page, errs } = await open('kec-land@lx.or.kr', 'ROADLAND_PW');
  for (const c of (only === 'r' ? [] : CARDS)) {
    await page.goto(APP + `/landxi/v3/lx-analyze/?card=${c}#analyze`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(6000);
    await page.locator('input.rg-file-in').first().setInputFiles('E:/도로공사/deck_capability/input/안성_서울세종선_토지마스터48.gpkg').catch((e) => { out[c + '-up'] = String(e).slice(0, 120); });
    await page.waitForTimeout(9000);
    out[c + '-panel'] = await shot(page, `platform/3-panel-${c}.png`);
    out[c + '-pt'] = (await text(page, '#analyze')).slice(0, 700);
  }
  for (const c of CARDS) {
    await page.goto(APP + '/landxi/v3/lx-map/' + RES[c], { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(14000);
    out[c + '-res'] = await shot(page, `platform/4-result-${c}.png`);
    out[c + '-rt'] = (await text(page, 'main')).slice(0, 700);
  }
  out.errsB = errs; await browser.close();
}
console.log(JSON.stringify(out, null, 1));
