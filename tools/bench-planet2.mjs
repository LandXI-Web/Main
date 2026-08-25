import { chromium } from 'playwright';
const OUT = 'shots/bench/taste';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const browser = await chromium.launch({ headless: false, channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

// accept cookies once so the banner stops covering content
await page.goto('https://www.planet.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await sleep(3500);
for (const label of ['Accept All Cookies', 'Reject All']) {
  try { await page.getByRole('button', { name: label }).click({ timeout: 4000 }); console.log('cookie:', label); break; } catch {}
}
await sleep(2500);

const pages = [
  ['p2-home', 'https://www.planet.com/'],
  ['p2-gallery', 'https://www.planet.com/gallery/'],
  ['p2-monitoring', 'https://www.planet.com/products/monitoring/'],
  ['p2-superres', 'https://www.planet.com/products/superres/'],
  ['p2-insights', 'https://www.planet.com/products/planet-insights-platform/'],
  ['p2-tasking', 'https://www.planet.com/products/tasking/'],
];
for (const [name, url] of pages) {
  console.log('>>', url);
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(3500);
    await page.screenshot({ path: `${OUT}/${name}-hero.png` });
    for (let i = 1; i <= 6; i++) {
      await page.evaluate((k) => window.scrollTo({ top: window.innerHeight * k * 0.92, behavior: 'instant' }), i);
      await sleep(1600);
      await page.screenshot({ path: `${OUT}/${name}-s${i}.png` });
    }
    console.log('  ok');
  } catch (e) { console.log('  fail', e.message); }
}
await ctx.close(); await browser.close(); console.log('DONE');
