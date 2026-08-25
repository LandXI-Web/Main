import { chromium } from '@playwright/test';
const PORT = process.env.PORT || 4181;
const b = await chromium.launch({ channel: 'chrome', args: ['--use-gl=angle','--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const errs = [];
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0,240)); });
p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message.slice(0,300)));
await p.goto(`http://localhost:${PORT}/landxi/proto/spikes/clouds/`, { waitUntil: 'domcontentloaded' });
try { await p.waitForSelector('body[data-ready="1"]', { timeout: 150000 }); console.log('ready'); }
catch { console.log('NOT READY note=', await p.textContent('#note')); }
console.log('film(0.0)', JSON.stringify(await p.evaluate(() => { window.__spike.film(0); return window.__spike.filmState(0); })));
console.log('film(0.66)', JSON.stringify(await p.evaluate(() => { window.__spike.film(0.66); return window.__spike.filmState(0.66); })));
console.log('film(1.0)', JSON.stringify(await p.evaluate(() => { window.__spike.film(1); return { ...window.__spike.filmState(1), z: window.__map ? 0 : 0 }; })));
console.log('errors:', [...new Set(errs)].slice(0,10).join(' | ') || '(none)');
await b.close();
