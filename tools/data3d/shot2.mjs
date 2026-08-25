// 근접 샷: 개별 주택 단위 압출 확인 (금지면 마을)
import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
await p.goto('http://127.0.0.1:4183/tools/data3d/preview.html', { waitUntil: 'load', timeout: 60000 });
await p.waitForFunction(() => window.__ready === true, null, { timeout: 60000 }).catch(() => {});
await p.evaluate(() => {
  const m = window.__m;
  if (m) m.jumpTo({ center: [127.3856, 35.4025], zoom: 17.4, pitch: 72, bearing: -34 });
});
await p.waitForTimeout(9000);
await p.screenshot({ path: 'shots/spikes/data3d/namwon-3d-village-closeup.png' });
console.log('shot 2 ok'); await b.close();
