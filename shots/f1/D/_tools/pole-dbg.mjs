// 극지 검은 캡 원인 — 층별 끄기 후 극점 화소색
import { chromium } from '@playwright/test';
const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await p.goto('http://localhost:4173/landxi/global/index.html?tenant=lx&locale=en');
await p.waitForFunction(() => document.documentElement.dataset.lx === 'ready', null, { timeout: 60000 });
await p.evaluate(() => window.__f1d.stage.map.jumpTo({ center: [88, 50], zoom: 2.4 }));
await p.waitForTimeout(3000);
const probe = async (tag) => { const pt = await p.evaluate(() => { const m = window.__f1d.stage.map; const a = m.project([88, 86]); const c = m.project([88, 88.5]); return [a, c]; });
  const buf = await p.screenshot(); const { PNG } = await import('pngjs').catch(() => ({})); console.log(tag, JSON.stringify(pt)); await p.screenshot({ path: `shots/f1/D/_tools/pole-${tag}.png`, clip: { x: pt[1].x - 200, y: Math.max(0, pt[1].y - 60), width: 400, height: 160 } }); };
await probe('all');
for (const id of ['gibs-a', 'gibs-bm', 'eox-s2cloudless-2025', 'lx-fill', 'world-line']) { await p.evaluate((id) => window.__f1d.stage.map.getLayer(id) && window.__f1d.stage.map.setLayoutProperty(id, 'visibility', 'none'), id); await p.waitForTimeout(800); await probe('no-' + id); }
console.log(await p.evaluate(() => window.__f1d.stage.map.getStyle().layers.map((l) => l.id + ':' + (l.layout?.visibility || 'v')).join(' ')));
await b.close();
