import { chromium } from '@playwright/test';
const b = await chromium.launch({ channel: 'chrome', args: ['--use-gl=angle','--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
await p.goto('http://localhost:4181/landxi/proto/spikes/clouds/', { waitUntil: 'domcontentloaded' });
await p.waitForSelector('body[data-ready="1"]', { timeout: 180000 });
await p.evaluate(() => { window.__spike.setTech(2); window.__spike.clean(true); window.__spike.film(1); });
await p.waitForTimeout(4000);
await p.evaluate(() => window.__spike.film(1));
await p.waitForTimeout(500);
await p.screenshot({ path: 'shots/spikes/clouds/film/diag-both.png' });
await p.evaluate(() => { document.querySelector('#gl').style.display = 'none'; });
await p.waitForTimeout(300);
await p.screenshot({ path: 'shots/spikes/clouds/film/diag-mapOnly.png' });
console.log(await p.evaluate(() => {
  const m = window.__map;
  return JSON.stringify({ zoom: +m.getZoom().toFixed(2), center: m.getCenter().toArray().map(v=>+v.toFixed(3)),
    pitch: m.getPitch(), mapOpacity: document.querySelector('#map').style.opacity,
    layers: m.getStyle().layers.map(l => l.id + ':' + (m.getPaintProperty(l.id,'raster-opacity') ?? '-')) });
}));
await b.close();
