// 스파이크 캡처 러너 — window.__spike.seek(p) 로 진행도를 강제하고 프레임을 찍는다.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
const OUT = 'shots/spikes/three-globe';
fs.mkdirSync(OUT, { recursive: true });
const PORT = process.env.PORT || 4173;
const PS = (process.env.PS || '0,0.25,0.5,0.75,1,0.44,0.6,0.68,0.9').split(',').map(Number);

const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'] });
const p = await b.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
const errs = [];
p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text().slice(0, 200)); });
await p.goto(`http://localhost:${PORT}/landxi/proto/spikes/three-globe/`, { waitUntil: 'load' });
await p.waitForFunction('window.__spike && window.__spike.fps() > 0', null, { timeout: 60000 });
await p.waitForTimeout(4000);
console.log('structs', await p.evaluate('__spike.structs()'), 'detects', await p.evaluate('__spike.detects()'));

const fps = [];
for (const v of PS) {
  await p.evaluate((v) => window.__spike.seek(v), v);
  await p.waitForTimeout(2200);
  const f = await p.evaluate('__spike.fps()');
  const alt = await p.evaluate('document.getElementById("alt").textContent');
  fps.push([v, f, alt]);
  const name = 'p' + String(v).replace('.', '') .padEnd(3, '0');
  await p.screenshot({ path: `${OUT}/${name}.png` });
  console.log(name, 'fps', f, 'alt', alt);
}
fs.writeFileSync(`${OUT}/fps.json`, JSON.stringify(fps, null, 1));
if (errs.length) console.log('\n--- errors ---\n' + [...new Set(errs)].slice(0, 12).join('\n'));
else console.log('\nno console/page errors');
await b.close();
