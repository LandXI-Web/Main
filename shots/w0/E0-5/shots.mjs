// E0-5 결과 촬영 — node shots/w0/E0-5/shots.mjs (서버 4173 이 떠 있어야 한다)
// 정지 1440×900 · 1280×720 + 내려받기 3곳(dl-01..03) + ?result= 도착 900ms 프레임 스트립(arrive-frame-00..)
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = path.dirname(fileURLToPath(import.meta.url));
const BASE = 'http://localhost:4173/landxi/proto/';
const FARM = 'namwon-farmland-2025';
const R = { downloads: [], ratio: {}, frames: [] };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ channel: 'chrome' });
async function page(vp) {
  const c = await browser.newContext({ viewport: vp, acceptDownloads: true });
  await c.addInitScript(() => { try { localStorage.setItem('lx_logged_in', '1'); localStorage.setItem('lx_role', 'staff'); localStorage.removeItem('lx_tenant_session'); } catch {} });
  return c.newPage();
}
const layersOn = (p) => p.waitForFunction((id) => window.__lxMap?.A?.getSource(id), FARM, { timeout: 30000 });
const ratio = (p) => p.evaluate(() => { const c = document.querySelector('#map-a canvas').getBoundingClientRect(), m = document.querySelector('#mw').getBoundingClientRect(); return Math.round((c.width * c.height) / (m.width * m.height) * 1000) / 10; });
const shot = (p, n) => p.screenshot({ path: path.join(OUT, n + '.png') });

for (const [w, h] of [[1440, 900], [1280, 720]]) {
  const p = await page({ width: w, height: h });
  // 01 결과 켜기 → 표 펼치기 → 행 클릭(M-01)
  await p.goto(BASE + 'ximap.html'); await p.waitForFunction(() => document.querySelector('#map-a')?.dataset.map === 'ready', null, { timeout: 30000 });
  await p.locator(`input[data-layer="${FARM}"]:not([data-sub])`).check(); await layersOn(p); await wait(1200);
  await p.locator('#mb-open').click(); await wait(900);
  await shot(p, `01-table-open-${w}`);
  await p.locator('#tbody tr[data-row]').first().click(); await wait(1600);
  R.ratio[`info-${w}`] = await ratio(p);
  await shot(p, `02-info-peek-${w}`);
  await p.locator('[data-peek="1"]').click(); await wait(1200);
  await shot(p, `03-info-next-row-${w}`);
  // 04 겹쳐보기 진입(M-05) · 05 변화 결과 보기 · 06 비교 도구(B 판 LX)
  await p.goto(BASE + `ximap.html?on=${FARM}&mode=overlay`); await p.waitForFunction(() => window.__lxMap?.B?.getStyle() != null, null, { timeout: 30000 }); await wait(2200);
  R.ratio[`overlay-${w}`] = await ratio(p);
  await shot(p, `04-overlay-${w}`);
  await p.locator('[data-cmp-open]').click(); await wait(900);
  R.ratio[`overlay-open-${w}`] = await ratio(p);
  await shot(p, `05-overlay-result-open-${w}`);
  await p.locator('#ov-b [data-tool="lx"]').click(); await p.locator('#ov-b [data-clx="emd"]').click(); await wait(900);
  await shot(p, `06-overlay-tool-lx-${w}`);
  // 07 레이어 탭 12줄(시연 · 지도 미연결)
  await p.goto(BASE + 'ximap.html?panel=layer'); await wait(1500);
  await shot(p, `07-layer-tab-${w}`);
  // 08 통계 기준(시연 disabled)
  await p.goto(BASE + `stats-standard.html?result=${FARM}&left=off`); await layersOn(p); await wait(1500);
  await p.locator('#st-run').click(); await wait(300);
  await shot(p, `08-stats-basis-${w}`);
  await p.context().close();
}

// 내려받기 3곳 — 서약서를 채우고 실제 download 이벤트를 받는다
{
  const p = await page({ width: 1440, height: 900 });
  const fill = async () => {
    const m = p.locator('.modal');
    await m.locator('#pl-ok').check(); await m.locator('#pl-name').fill('E0-5 촬영'); await m.locator('#pl-purpose').fill('내려받기 확인');
    const dl = p.waitForEvent('download'); await m.locator('.modal-f .btn').click();
    const d = await dl; const f = path.join(OUT, 'dl', d.suggestedFilename()); fs.mkdirSync(path.dirname(f), { recursive: true }); await d.saveAs(f);
    const buf = fs.readFileSync(f);
    R.downloads.push({ name: d.suggestedFilename(), bytes: buf.length, bom: buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF, head: buf.toString('utf8').replace(/^﻿/, '').split(/\r\n/)[0].slice(0, 160) });
    await wait(400);
  };
  await p.goto(BASE + `ximap.html?on=${FARM}&fold=0`); await layersOn(p); await wait(1200);
  await p.locator('#export').click(); await fill(); await shot(p, 'dl-01-export');
  await p.goto(BASE + `stats-standard.html?result=${FARM}&left=off`); await layersOn(p); await wait(1200);
  await p.locator('#st-dl').click(); await fill(); await shot(p, 'dl-02-stats-csv');
  await p.goto(BASE + `report-standard.html?result=${FARM}&left=off`); await layersOn(p); await wait(1200);
  await p.locator('.rp .dl').first().click(); await fill(); await shot(p, 'dl-03-report-csv');
  await p.context().close();
}

// ?result= 도착 — 개관(z8.6)에서 그 결과 범위로 900ms. 100ms 간격 프레임 10장.
{
  const p = await page({ width: 1440, height: 900 });
  await p.goto(BASE + `ximap.html?result=${FARM}`);
  await p.waitForFunction(() => document.querySelector('#map-a')?.dataset.map === 'ready', null, { timeout: 30000 });
  await p.waitForFunction(() => window.__lxMap?.A?.isMoving?.(), null, { timeout: 15000 }).catch(() => {});
  let prev = null;
  for (let i = 0; i < 10; i++) {
    const n = `arrive-frame-${String(i).padStart(2, '0')}`;
    const buf = await p.screenshot({ path: path.join(OUT, n + '.png') });
    R.frames.push({ n, zoom: await p.evaluate(() => window.__lxMap.A.getZoom().toFixed(2)), sameAsPrev: prev ? Buffer.compare(prev, buf) === 0 : null });
    prev = buf; await wait(100);
  }
  R.arriveUrl = p.url();
  await p.context().close();
}

fs.writeFileSync(path.join(OUT, 'shots.json'), JSON.stringify(R, null, 2));
console.log(JSON.stringify(R, null, 1));
await browser.close();
