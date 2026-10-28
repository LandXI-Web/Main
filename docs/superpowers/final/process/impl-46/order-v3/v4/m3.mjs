import { open, shot, text, APP } from './cap.mjs';
import fs from 'node:fs';
const { browser, page } = await open();
await page.goto(APP + '/landxi/v3/lx-analyze/?card=card-change#analyze', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(6000);
await page.locator('input.rg-file-in').setInputFiles('E:/도로공사/deck_capability/input/안성_서울세종선_토지마스터48.gpkg');
await page.waitForTimeout(8000);
const sels = page.locator('select[aria-label$="시점 영상 고르기"]');
await sels.nth(0).selectOption({ label: '2019년 항공영상 · 51cm' });
await sels.nth(1).selectOption({ label: '2025년 항공영상 · 25cm' });
await shot(page, 'M3-before');
const t0 = Date.now();
const apiSeen = [];
page.on('response', async (r) => { const u = r.url(); if (/\/change\/runs|\/jobs\//.test(u) && r.request().method() !== 'OPTIONS') { try { apiSeen.push([Math.round((Date.now() - t0) / 1000), r.request().method(), u.replace(/^.*\/api\/v1/, ''), r.status()]); } catch {} } });
await page.locator('.la-go').click();
await page.waitForURL(/lx-map/, { timeout: 60000 }).catch(() => {});
console.log('after-go url', page.url());
await page.waitForTimeout(4000);
await shot(page, 'M3-progress');
const tok = await page.evaluate(() => { try { return JSON.parse(localStorage.getItem('lx.session') || sessionStorage.getItem('lx.session') || '{}').token || ''; } catch { return ''; } });
console.log('token?', !!tok);
let st = '';
for (let i = 0; i < 100; i++) {
  await page.waitForTimeout(6000);
  const lines = (await text(page, 'body')).split(String.fromCharCode(10));
  const hit = lines.filter((l) => /분석 중|대기|완료|실패|지난 시간|취소/.test(l)).slice(0, 5).join(' / ');
  if (hit !== st) { console.log(Math.round((Date.now() - t0) / 1000) + 's', hit); st = hit; }
  if (/실패|취소/.test(hit) || (/완료/.test(hit) && !/분석 중/.test(hit))) break;
}
console.log('elapsed s', Math.round((Date.now() - t0) / 1000));
await shot(page, 'M3-done');
fs.writeFileSync('m3-api.json', JSON.stringify(apiSeen.slice(0, 60)));
console.log(await page.locator('main').innerText().then((s) => s.slice(0, 1500)));
await browser.close();
