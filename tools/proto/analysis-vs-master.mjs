// 분석 서비스 — 구현 화면(1440×900)과 원판 PNG 를 좌우로 붙인 비교 그림을 만든다.
// usage: PORT=4201 node tools/proto/analysis-vs-master.mjs [상태접두어]   (서버: PORT=4201 node tools/serve.mjs)
// 출력: shots/proto/analysis-vs-master-<상태>.png  (왼쪽 = 구현, 오른쪽 = 원판) + analysis-<상태>.png
// 선례 tools/proto/support-vs-master.mjs 와 같은 방식.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const PORT = process.env.PORT || 4201;
const root = process.cwd();
const outDir = path.join(root, 'shots/proto'); fs.mkdirSync(outDir, { recursive: true });
const only = process.argv[2];
const P = 'proto/analysis-ai.html';
const ready = (p) => p.waitForFunction(() => document.documentElement.dataset.shell === 'ready');

const STATES = [
  { name: 'list', master: 'B7-Analysis-List', url: P + '?card=card-farm' },
  { name: 'list-ready', master: 'B7-Analysis-List', url: P + '?card=card-crowd' },
  { name: 'list-b5', master: 'B5-Analysis-List', url: P },
  { name: 'run-review', master: 'B5-Analysis-Run-Review', url: P + '?tab=run&card=card-farm',
    act: async (p) => { await p.locator('.thumb').nth(1).locator('input').check(); await p.locator('.thumb').nth(2).locator('input').check(); await p.waitForTimeout(1200); } },
  { name: 'run-progress', master: 'B5-Analysis-Run-Progress', url: P + '?tab=running&run=run-green-2604', wait: 1200 },
  { name: 'progress-overlay', master: 'B7-Analysis-Progress-Overlay', url: P + '?tab=run&card=card-farm',
    act: async (p) => { await p.locator('.thumb').nth(1).locator('input').check(); await p.waitForTimeout(700); await p.locator('#go-run').click(); await p.waitForTimeout(1500); } },
  { name: 'result', master: 'B5-Analysis-Result', url: P + '?tab=done&run=namwon-farmland-2025', wait: 4200 },
  { name: 'result-edit', master: 'B7-Analysis-Result-Edit', url: P + '?tab=done&run=namwon-farmland-2025',
    act: async (p) => { await p.waitForSelector('#pc-tbl tbody tr'); await p.locator('#ed-open').click(); await p.waitForSelector('#pc-tbl tbody tr'); await p.locator('#pc-tbl tbody tr').nth(2).click(); await p.locator('[data-tool="del"]').click(); await p.locator('#pc-tbl tbody tr').nth(1).click(); await p.waitForTimeout(2200); } },
  { name: 'share', master: 'B7-Analysis-Share', url: P + '?tab=done&run=namwon-farmland-2025',
    act: async (p) => { await p.waitForTimeout(3000); await p.locator('#dp-share').click(); await p.waitForTimeout(500); } },
  // 원판에 대응이 없는 새 사양(이식 마법사)은 진열대 원판과 나란히 둔다 — 같은 셸인지 보려는 것
  { name: 'transplant', master: 'B7-Analysis-List', url: P + '?card=card-road&pick=transplant', wait: 800 },
];

const b = await chromium.launch({ channel: 'chrome' });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
await ctx.addInitScript(() => localStorage.setItem('lx_logged_in', '1'));
for (const s of STATES) {
  if (only && !s.name.startsWith(only)) continue;
  const p = await ctx.newPage();
  await p.goto(`http://localhost:${PORT}/landxi/${s.url}`);
  await ready(p);
  await p.evaluate(() => document.fonts.ready);
  if (s.act) await s.act(p);
  await p.waitForTimeout(s.wait ?? 600);
  const mine = await p.screenshot({ type: 'png' });
  const master = fs.readFileSync(path.join(root, 'design-canvas/v2/renders', `${s.master}.png`));
  await p.setViewportSize({ width: 2896, height: 900 });
  await p.setContent(`<body style="margin:0;display:flex;gap:16px;background:#f0f"><img src="data:image/png;base64,${mine.toString('base64')}" width="1440" height="900"><img src="data:image/png;base64,${master.toString('base64')}" width="1440" height="900"></body>`);
  await p.waitForTimeout(150);
  const out = path.join(outDir, `analysis-vs-master-${s.name}.png`);
  await p.screenshot({ path: out });
  fs.writeFileSync(path.join(outDir, `analysis-${s.name}.png`), mine);
  console.log('saved', path.relative(root, out));
  await p.close();
}
await b.close();
