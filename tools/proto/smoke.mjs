import { chromium } from '@playwright/test';
const PORT = process.env.PORT || 4173;
const b = await chromium.launch({ channel: 'chrome' });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errs = [];
p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
p.on('pageerror', (e) => errs.push('pageerror: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
try {
  await p.goto(`http://localhost:${PORT}/landxi/proto/dive.html`, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('body[data-ready="1"]', { timeout: 90000 });
  console.log('READY ok');
} catch (e) {
  console.log('BOOT FAIL', e.message);
}
await p.waitForTimeout(2500);
const info = await p.evaluate(() => ({
  dive: !!window.__dive,
  rows: window.__dive ? window.__dive.rows.length : -1,
  idx: document.querySelectorAll('#index li').length,
  clip: getComputedStyle(document.querySelector('#stage')).clipPath,
  err: window.__dive ? window.__dive.errors : null,
}));
console.log(JSON.stringify(info, null, 1));
console.log('--- errors ---\n' + errs.join('\n---\n'));
await b.close();
