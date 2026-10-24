/* 10-24 받은 자산 · 관광지 안전관리 — 바깥 주소 · 로그인 폼(LX 직원)으로 지도 서비스(?job=)와 카드 화면을 찍는다.
   사람이 보이는 영상이라 지도는 줌 16 이하로만(한 칸 약 2m · 사람을 알아볼 수 없음) · 결과는 점 · 격자만.
   node docs/superpowers/final/process/impl-46/ingest-1024/map-capture.mjs --jobs <작업,작업> --card card-crowd  (비밀번호는 env LX_PW) */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const C = await import(pathToFileURL(path.resolve(HERE, '../../../../../../tools/check/common.mjs')).href);
const OUT = path.join(HERE, 'shots');
fs.mkdirSync(OUT, { recursive: true });
const jobs = C.arg('--jobs', '').split(',').filter(Boolean);
const cards = C.arg('--card', '').split(',').filter(Boolean);
const ZMAX = 16;
const browser = await C.launch();
const s = await C.login(browser, 'app');
const { page, home } = s;
const res = { at: new Date().toISOString(), base: home, maps: [], cards: [] };
try {
  for (const [i, job] of jobs.entries()) {
    const t0 = Date.now();
    await page.goto(home + `/landxi/v3/lx-map/?job=${job}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__lm && window.__lm.layers && window.__lm.layers().some((x) => x.on), null, { timeout: 90000 }).catch(() => {});
    const readyMs = Date.now() - t0;
    await page.waitForTimeout(2500);
    const li = page.locator('.lm-li', { has: page.locator('b') }).filter({ has: page.locator('xpath=..').locator('button.lm-sw[aria-checked="true"]') }).first();
    if (await li.count()) { await li.click().catch(() => {}); }
    await page.waitForTimeout(3500);
    const z = await page.evaluate((zmax) => { const m = window.__lm.map; if (m.getZoom() > zmax) m.jumpTo({ zoom: zmax }); return m.getZoom(); }, ZMAX);
    await page.waitForTimeout(3500);
    const info = await page.evaluate(() => ({ zoom: window.__lm.map.getZoom(), layers: window.__lm.layers(), loading: !!document.querySelector('[aria-busy="true"]') }));
    const shot = `map-${i + 1}.png`;
    await page.screenshot({ path: path.join(OUT, shot) });
    res.maps.push({ job, ready_ms: readyMs, zoom_before_cap: z, ...info, shot });
  }
  for (const cid of cards) {
    const t0 = Date.now();
    await page.goto(home + `/landxi/v3/lx-analyze/?card=${cid}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-ready="1"]', { timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(1200);
    const ms = Date.now() - t0;
    const info = await page.evaluate(() => {
      const txt = (el) => (el?.innerText || '').trim();
      return { title: txt(document.querySelector('.la-title')), chip: txt(document.querySelector('.la-tags .t-chip')), line: txt(document.querySelector('.la-line')),
        result: txt(document.querySelector('section[aria-label="결과 예시"]')),
        cond: [...document.querySelectorAll('section[aria-label="이 카드의 조건"] dl > div')].map((d) => [txt(d.querySelector('dt')), txt(d.querySelector('dd'))]),
        side: txt(document.querySelector('.la-side')).slice(0, 400) };
    });
    const shot = `card-${cid}.png`;
    await page.screenshot({ path: path.join(OUT, shot), fullPage: false });
    res.cards.push({ id: cid, ms, ...info, shot });
  }
} finally {
  fs.writeFileSync(path.join(HERE, 'map-capture.json'), JSON.stringify(res, null, 1));
  await browser.close();
}
console.log(JSON.stringify(res.maps.map((m) => ({ job: m.job, ms: m.ready_ms, zoom: m.zoom, on: (m.layers || []).filter((x) => x.on).length }))));
