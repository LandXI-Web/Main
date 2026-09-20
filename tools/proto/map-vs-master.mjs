// 지도 서비스(XI맵) · 통계 · 보고서 — 구현 화면(1440×900)과 원판 PNG 를 좌우로 붙인 비교 그림.
// usage: PORT=4203 node tools/proto/map-vs-master.mjs [상태이름앞글자]
//        (서버: PORT=4203 node tools/serve.mjs)
// 출력:  shots/proto/map-vs-master-<상태>.png  (왼쪽 = 구현, 오른쪽 = 원판) + shots/proto/map-<상태>.png
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const PORT = process.env.PORT || 4203;
const root = process.cwd();
const outDir = path.join(root, 'shots/proto'); fs.mkdirSync(outDir, { recursive: true });
const only = process.argv[2];
const FARM = 'namwon-farmland-2025', GREEN = 'namwon-greenhouse-2025';
const M = 'proto/ximap.html', S = 'proto/stats-standard.html', RL = 'proto/report-standard.html', RI = 'proto/report-standard-issue.html';

const STATES = [
  { name: 'base', master: 'B5-Map', url: `${M}?on=${FARM},${GREEN}` },
  { name: 'empty', master: 'B7-Map-Empty', url: M },
  { name: 'info', master: 'B5-Map-Info', url: `${M}?on=${GREEN}&left=off&fold=0`, act: async (p) => { await p.locator('#tbody tr[data-row]').nth(1).click(); await p.click('#mb-fold'); } },
  { name: 'table', master: 'B7-Map-Table', url: `${M}?on=${GREEN}&left=off&fold=0` },
  { name: 'region', master: 'B7-Map-Region', url: `${M}?on=${FARM}&left=off&tab=region&fold=0` },
  { name: 'layertab', master: 'B7-Map-LayerTab', url: `${M}?panel=layer&on=${FARM}` },
  { name: 'search', master: 'B7-Map-Search', url: `${M}?on=${FARM}&left=off&q=${encodeURIComponent('남원')}` },
  { name: 'search-empty', master: 'B7-Map-Search-Empty', url: `${M}?on=${FARM}&left=off&q=${encodeURIComponent('없는지명')}` },
  { name: 'basemap', master: 'B7-Map-Basemap', url: `${M}?on=${FARM},${GREEN}&base=base`, act: async (p) => { await p.click('.mw-tools [data-tool="basemap"]'); } },
  { name: 'measure', master: 'B7-Map-Measure', url: `${M}?on=${FARM}&left=off`, act: async (p) => {
    await p.click('.mw-tools [data-tool="measure"]'); await p.click('[data-msr="area"]');
    const b = await p.locator('#map-a').boundingBox();
    for (const [fx, fy] of [[0.46, 0.3], [0.58, 0.36], [0.55, 0.6]]) await p.mouse.click(b.x + b.width * fx, b.y + b.height * fy);
    await p.mouse.move(b.x + b.width * 0.44, b.y + b.height * 0.55);
  } },
  { name: 'draw', master: 'B7-Map-Draw', url: `${M}?on=${FARM}&left=off`, act: async (p) => {
    await p.click('.mw-tools [data-tool="draw"]'); await p.click('[data-msr="polygon"]');
    const b = await p.locator('#map-a').boundingBox();
    for (const [fx, fy] of [[0.4, 0.28], [0.56, 0.32], [0.53, 0.58]]) await p.mouse.click(b.x + b.width * fx, b.y + b.height * fy);
    await p.mouse.move(b.x + b.width * 0.38, b.y + b.height * 0.54);
  } },
  { name: 'aoi', master: 'B7-Map-AOI', url: `${M}?on=${FARM}&left=off`, act: async (p) => {
    await p.click('.mw-tools [data-tool="aoi"]');
    const b = await p.locator('#map-a').boundingBox();
    for (const [fx, fy] of [[0.36, 0.22], [0.62, 0.2], [0.64, 0.66], [0.34, 0.62]]) await p.mouse.click(b.x + b.width * fx, b.y + b.height * fy);
  } },
  { name: 'pledge', master: 'B7-Map-Pledge', url: `${M}?on=${FARM},${GREEN}`, act: async (p) => {
    await p.click('#export'); await p.fill('#pl-name', '금지면 비닐하우스 현황 점검'); await p.click('.modal-f .btn');
  } },
  { name: 'compare', master: 'B5-Map-Compare', url: `${M}?on=${FARM}&mode=overlay`, wait: 2600 },
  { name: 'parallel', master: 'B7-Map-Parallel', url: `${M}?on=${FARM}&mode=parallel`, wait: 2600 },
  { name: 'stats', master: 'B7-Stats-Opt1', url: `${S}?result=${FARM}&left=off` },
  { name: 'stats-class', master: 'B7-Stats-Class', url: `${S}?result=${FARM}&left=off`, act: async (p) => { await p.click('[data-tab="class"]'); } },
  { name: 'stats-empty', master: 'B7-Stats-Empty', url: `${S}?on=none` },
  { name: 'stats-find', master: 'B7-Stats-Find', url: `${S}?result=${FARM}&left=off`, act: async (p) => { await p.click('#st-more'); } },
  { name: 'report-issue', master: 'B7-Report-Issue', url: `${RI}?result=${FARM}&left=off` },
  { name: 'report-issue-error', master: 'B7-Report-Issue-Error', url: `${RI}?result=${FARM}&left=off`, act: async (p) => {
    await p.fill('#rp-title', ''); await p.uncheck('#rp-cls-all'); await p.check('#rp-emd-all'); await p.uncheck('#rp-emd-all'); await p.click('#rp-go');
  } },
  { name: 'report-list', master: 'B7-Report-List', url: `${RL}?result=${FARM}&left=off`, act: async (p) => { await p.locator('.rp').nth(1).hover(); } },
  { name: 'report-list-empty', master: 'B7-Report-List-Empty', url: `${RL}?result=${FARM}&left=off`, act: async (p) => {
    await p.fill('#rp-q input[name="q"]', '없는보고서'); await p.click('#rp-q button.btn-br');
  } },
  { name: 'report-pledge', master: 'B7-Report-Pledge', url: `${RL}?result=${FARM}&left=off`, act: async (p) => { await p.locator('.rp .dl').first().click(); } },
];

const b = await chromium.launch({ channel: 'chrome' });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
await ctx.addInitScript(() => localStorage.setItem('lx_logged_in', '1'));
for (const s of STATES) {
  if (only && !s.name.startsWith(only)) continue;
  const p = await ctx.newPage();
  await p.goto(`http://localhost:${PORT}/landxi/${s.url}`);
  await p.waitForFunction(() => document.documentElement.dataset.shell === 'ready');
  await p.waitForFunction(() => document.querySelector('#map-a')?.dataset.map === 'ready', null, { timeout: 25000 }).catch(() => {});
  await p.waitForTimeout(s.wait || 2200);                      // 타일 · GeoJSON 이 그려질 때까지
  await p.evaluate(() => document.fonts.ready);
  if (s.act) await s.act(p);
  await p.waitForTimeout(900);
  const mine = await p.screenshot({ type: 'png' });
  const mp = path.join(root, 'design-canvas/v2/renders', `${s.master}.png`);
  const master = fs.existsSync(mp) ? fs.readFileSync(mp) : null;
  await p.setViewportSize({ width: 2896, height: 900 });
  await p.setContent(`<body style="margin:0;display:flex;gap:16px;background:#f0f"><img src="data:image/png;base64,${mine.toString('base64')}" width="1440" height="900">${master ? `<img src="data:image/png;base64,${master.toString('base64')}" width="1440" height="900">` : ''}</body>`);
  await p.waitForTimeout(150);
  const out = path.join(outDir, `map-vs-master-${s.name}.png`);
  await p.screenshot({ path: out });
  fs.writeFileSync(path.join(outDir, `map-${s.name}.png`), mine);
  console.log('saved', path.relative(root, out));
  await p.close();
}
await b.close();
