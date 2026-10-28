/* 명세 §7 — 카드 3종 캡처(3840×2160): 목록 1 · 상세 3 · 실행 칸 3(구간 올린 상태) + 노출 고침 확인(지도 서비스 다시) */
import { open, shot, text, APP } from './cap.mjs';
const out = {};
{ // 새 직원 계정 — 지도 서비스(빈 화면) 다시 · 목록(건축·변화)
  const { browser, page, errs } = await open();
  await page.goto(APP + '/landxi/v3/lx-map/', { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(7000);
  out.mapsvc = await shot(page, 'V5-empty-mapsvc');
  await page.goto(APP + '/landxi/v3/lx-analyze/?grp=' + encodeURIComponent('건축·변화'), { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(7000);
  out.list = await shot(page, 'SPEC-cards-list'); out.listText = (await text(page, 'main')).slice(0, 900);
  for (const c of ['card-change', 'card-ijimok', 'card-occupy']) {
    await page.goto(APP + `/landxi/v3/lx-analyze/?card=${c}`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(7000);
    out[c] = await shot(page, `SPEC-${c}-detail`);
    out[c + '-text'] = (await text(page, 'main')).slice(0, 1500);
  }
  out.errs1 = errs; await browser.close();
}
{ // 실행 칸 — 구간을 올린 상태(기존 확인 계정 · 새 계정에는 아무것도 만들지 않음)
  const { browser, page, errs } = await open('kec-land@lx.or.kr', 'ROADLAND_PW');
  for (const c of ['card-change', 'card-ijimok', 'card-occupy']) {
    await page.goto(APP + `/landxi/v3/lx-analyze/?card=${c}#analyze`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(6000);
    await page.locator('input.rg-file-in').first().setInputFiles('E:/도로공사/deck_capability/input/안성_서울세종선_토지마스터48.gpkg').catch((e) => { out[c + '-up'] = String(e).slice(0, 120); });
    await page.waitForTimeout(9000);
    out[c + '-panel'] = await shot(page, `SPEC-${c}-panel`);
    out[c + '-ptext'] = (await text(page, '#analyze')).slice(0, 900);
  }
  out.errs2 = errs; await browser.close();
}
console.log(JSON.stringify(out, null, 1));
