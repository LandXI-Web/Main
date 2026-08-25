// 스파이크 증거 샷: 남원 3D 스택(V-World 항공영상 + Terrarium 지형 + Overture 압출)
import { chromium } from 'playwright';
const URL = process.env.URL || 'http://127.0.0.1:4183/tools/data3d/preview.html';
const b = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
p.on('console', m => { if (m.type() === 'error') console.log('ERR', m.text().slice(0, 200)); });
p.on('pageerror', e => console.log('PAGEERR', String(e).slice(0, 200)));
await p.goto(URL, { waitUntil: 'load', timeout: 60000 });
await p.waitForFunction(() => window.__ready === true, null, { timeout: 60000 })
  .catch(() => console.log('WARN: __ready 타임아웃'));
await p.waitForTimeout(10000);
await p.screenshot({ path: 'shots/spikes/data3d/namwon-3d-stack.png' });
console.log('shot 1 ok');
await b.close();
